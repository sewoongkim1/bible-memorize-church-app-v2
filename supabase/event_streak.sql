-- 가을 말씀암송 동행 — 주차 집계 (구조. 회차를 넘어 산다)
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키를 절대 넣지 마세요.
--
-- 적용: Supabase 대시보드 → SQL Editor, 또는 CLI 로:
--   supabase --workdir <스크래치> link --project-ref ktpwthwqzgcqcrmsafdo --yes
--   supabase --workdir <스크래치> db query --linked -f <이 파일의 절대경로>
--   ⚠️ -f 의 경로는 workdir 기준으로 풀리니 **절대경로**로 준다.
--   ⚠️ 저장소의 supabase/.temp 를 복사해 쓰지 말 것 — 그게 어디를 가리키는지는
--      세션마다 바뀐다. `select count(*) from users` 가 사백이 넘으면 운영이다.
--   ⚠️ **개발(ktpwthwqzgcqcrmsafdo) 먼저**, 확인한 뒤 운영(xnomlgydifiqiybervtf).
--   여러 번 돌려도 안전하다(create or replace · if not exists).
--
-- 설계: docs/superpowers/specs/2026-09-23-autumn-streak-event-design.md §6.3
--
-- ⚠️ mode 를 세지 않는다 — 「그날 하루 합(cnt 를 모드 구분 없이 더한 값)이 p_per_day 이상인가」로만 본다
--    (2026-10-03 부터 · p_per_day 기본 1 = 옛 「그날 행이 있는가」와 같은 뜻).
--    challenge_log.mode CHECK 는 여덟 가지이고 learn-typing-card·typing-card 가
--    전체 반복의 65.2% 다. mode 를 열거하면 카드로만 하시는 분은 매일 하셔도 도장이 안 찍힌다.
--    (v2_mydays 가 이미 mode 를 안 가리고 sum 한다 — 같은 잣대다.)
--
-- ⚠️ date_trunc('week') 를 쓰지 않는다 — 그건 **월요일** 시작이다.
--    이 앱의 한 주는 주일에 시작한다(구절이 토·금에 올라와 주일부터 쓰인다).
--    시작일 기준 floor((day - start)/7) 로만 가른다. 시작일이 주일이면 경계가 저절로 맞는다.

-- 1) 인덱스 — PK 는 (day,user_id,mode) 이고 별도 인덱스는 (day) 뿐이라
--    「이 사람의 기간 내 날들」이 느리다. v2_mydays 도 함께 빨라진다.
create index if not exists daily_activity_user_day_idx
  on public.daily_activity (user_id, day);

-- 2) 주차 집계
-- ⚠️ **활동이 하나도 없는 사람은 행이 아예 안 나온다**(0 으로 채운 행이 아니라 부재다).
--    p_users 로 명단을 넘겨도 마찬가지다 — 「그 명단 중 창 안에 활동이 있는 사람」만 돌아온다.
--    부르는 쪽이 **없으면 0 주로 친다**를 스스로 해야 한다. 안 그러면 기록이 없는 분이
--    명단에서 조용히 사라진다.
-- ⚠️ 하루 합(cnt, 모드 구분 없이) ≥ p_per_day 여야 그 날이 한 칸이다 · 2026-10-03.
--    p_per_day 를 안 주면 1 — 옛 「하루 한 번이라도」 와 같은 뜻이라 기존 호출이 그대로 산다.
begin;
-- ⚠️ 옛 4-인자 서명을 지운다 — 남겨 두면 기본값 때문에 PostgREST 가 두 오버로드 사이에서 못 골라
--    도장판·신청이 500 이 난다.
drop function if exists public.v2_event_weeks(date, int, int, text[]);
create or replace function public.v2_event_weeks(
  p_start    date,
  p_weeks    int,
  p_per_week int,
  p_users    text[] default null,
  p_per_day  int    default 1        -- 하루 합(cnt, 모드 구분 없이)이 이 수 이상이어야 한 칸 · 2026-10-03
)
returns table(
  user_id    text,
  weeks_done int,
  week_days  int[],
  all_weeks  boolean,
  first_day  date
)
language sql stable security definer set search_path = public as $$
  with win as (
    -- 하루 한 줄로 모으되 그날 합을 n 에 남긴다. ⚠️ HAVING 으로 거르지 않는다 —
    --    문턱 미달인 날만 있는 분도 행·first_day 가 살아야 「처음 오신 분 완화」가 맞다.
    select da.user_id as uid, da.day, ((da.day - p_start) / 7) as wk, sum(da.cnt)::int as n
      from daily_activity da
     where da.day >= p_start
       and da.day <  p_start + (p_weeks * 7)
       and (p_users is null or da.user_id = any(p_users))
     group by da.user_id, da.day
  ),
  per_week as (
    select uid, wk, (count(*) filter (where n >= greatest(coalesce(p_per_day, 1), 1)))::int as days
      from win group by uid, wk
  ),
  agg as (
    select uid,
           count(*) filter (where days >= p_per_week)::int as wd
      from per_week group by uid
  )
  select a.uid,
         a.wd,
         (select array_agg(coalesce(pw.days, 0) order by g.wk)
            from generate_series(0, p_weeks - 1) as g(wk)
            left join per_week pw on pw.uid = a.uid and pw.wk = g.wk),
         (a.wd >= p_weeks),
         (select min(d.day) from daily_activity d where d.user_id = a.uid)
    from agg a;
$$;

-- 3) 권한 — 정책이 아니라 실행 권한으로 막는다.
--    ⚠️ 2026-09-23 에 stats-rpc-card.sql 이 이 두 줄을 빠뜨려 성도님 실명·교구·목장이
--       공개 키로 나갔다(supabase/security_close_stats_rpc.sql). 같은 자리를 반복하지 않는다.
revoke all     on function public.v2_event_weeks(date, int, int, text[], int) from public, anon, authenticated;
grant  execute on function public.v2_event_weeks(date, int, int, text[], int) to   service_role;
commit;

-- 4) 확인 ① — 정확히 1행 · 인자 목록이 5-인자(p_per_day 포함) · anon/authenticated 에 안 열려 있는지.
--    ⚠️ proacl 이 null 이면 그것도 안 된다(= 권한 자체가 비어 다른 곳에서 새로 열렸다는 뜻일 수 있다).
-- select p.oid, pg_get_function_identity_arguments(p.oid) as args, p.proacl
--   from pg_proc p
--  where p.proname = 'v2_event_weeks';
-- -- 기대: 정확히 1행 ·
-- --   args  = 'p_start date, p_weeks integer, p_per_week integer, p_users text[], p_per_day integer'
-- --   proacl 에 anon=·authenticated=·=X 없음 · proacl 자체가 null 이 아님

-- 5) 확인 ② — 배열 길이가 p_weeks 와 같은지, 0 이 제대로 들어가는지(p_per_day 기본값 1 일 때)
-- select user_id, weeks_done, week_days, array_length(week_days,1) as len, all_weeks, first_day
--   from v2_event_weeks('2026-10-18', 6, 3) limit 5;
-- 확인 ③ — p_per_day 를 3 으로 올리면 문턱이 높아지는지(가을 회차 값)
-- select user_id, weeks_done, week_days, array_length(week_days,1) as len, all_weeks, first_day
--   from v2_event_weeks('2026-10-18', 6, 3, null, 3) limit 5;
