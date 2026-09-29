-- 가을 말씀 동행 — 주차 집계 (구조. 회차를 넘어 산다)
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
-- ⚠️ mode 를 세지 않는다 — 「그날 행이 있는가」로만 본다.
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
create or replace function v2_event_weeks(
  p_start    date,
  p_weeks    int,
  p_per_week int,
  p_users    text[] default null
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
    -- 하루에 여러 번 해도 한 칸 — group by 가 그 일을 한다
    select da.user_id as uid, da.day, ((da.day - p_start) / 7) as wk
      from daily_activity da
     where da.day >= p_start
       and da.day <  p_start + (p_weeks * 7)
       and (p_users is null or da.user_id = any(p_users))
     group by da.user_id, da.day
  ),
  per_week as (
    select uid, wk, count(*)::int as days
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
revoke all    on function v2_event_weeks(date, int, int, text[]) from public, anon, authenticated;
grant  execute on function v2_event_weeks(date, int, int, text[]) to   service_role;

-- 4) 확인 ① — anon 에게 열려 있지 않은지. **0행이어야 한다.**
-- select proname, proacl from pg_proc
--  where proname = 'v2_event_weeks'
--    and (proacl::text like '%anon=%' or proacl::text like '%authenticated=%');

-- 5) 확인 ② — 배열 길이가 p_weeks 와 같은지, 0 이 제대로 들어가는지
-- select user_id, weeks_done, week_days, array_length(week_days,1) as len, all_weeks, first_day
--   from v2_event_weeks('2026-10-11', 6, 3) limit 5;
