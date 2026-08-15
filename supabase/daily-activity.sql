-- 성경암송 v2 — 일자·사용자·mode 단위 집계표 (순위 계열이 로그를 안 읽게 한다)
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키를 절대 넣지 마세요.
--
-- 실행: Supabase Dashboard(xnomlgydifiqiybervtf) → SQL Editor 에 통째로 붙여넣고 RUN
--       (여러 번 실행해도 안전하다. 4)의 백필은 다시 돌리면 어긋난 값을 바로잡는다.)
--
-- 왜:
--   ranking/guRanking/mydays는 challenge_log 전체를 Edge Function으로 끌어와 JS에서 셌다.
--   2026-08-15 실측 — 로그 11,047행인데 (사용자,일자) 쌍은 449행. 25배 차이다.
--   더 중요한 건 늘어나는 방식이다. 로그는 '총 반복 횟수'만큼 늘지만 집계표는
--   '참여자 x 활동일수'만큼만 는다. 성도들이 하루에 더 많이 암송할수록 격차가 벌어진다
--   (배순길 성도 3,420회 → 집계표에서는 40행 남짓).
--
-- mode까지 기본키에 넣는 이유:
--   앱 순위는 암송(learn-*)을 포함해 세고, 관리자 도전현황은 뺀다. 타이핑/음성도 나눠야
--   한다. mode를 남겨 두면 그 모든 조합을 합계만으로 뽑아낼 수 있다.
--   mode: typing/voice(도전) · review-typing/voice(복습) · learn-typing/voice(암송)

-- 1) 집계표
create table if not exists public.daily_activity (
  day     date not null,          -- KST 기준 날짜
  user_id text not null,          -- users.id (uuid든 text든 담기도록 text)
  mode    text not null,
  cnt     int  not null default 0,
  primary key (day, user_id, mode)
);
create index if not exists daily_activity_day_idx on public.daily_activity (day);

-- RLS 기본 차단 — Edge Function(service_role)만 읽고 쓴다
alter table public.daily_activity enable row level security;

-- 2) 동기화 트리거 — 앱 코드가 아니라 DB가 지킨다.
--    어떤 경로로 로그가 들어오든(앱·관리자·수동 INSERT) 집계표가 함께 움직인다.
create or replace function daily_activity_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT') then
    insert into daily_activity (day, user_id, mode, cnt)
    values ((new.created_at at time zone 'Asia/Seoul')::date, new.user_id::text, new.mode, 1)
    on conflict (day, user_id, mode) do update set cnt = daily_activity.cnt + 1;
    return new;
  elsif (tg_op = 'DELETE') then
    -- cleanupDummy 등이 로그를 지울 때 집계표도 따라 줄어든다
    update daily_activity set cnt = cnt - 1
     where day = (old.created_at at time zone 'Asia/Seoul')::date
       and user_id = old.user_id::text and mode = old.mode;
    delete from daily_activity
     where cnt <= 0
       and day = (old.created_at at time zone 'Asia/Seoul')::date
       and user_id = old.user_id::text and mode = old.mode;
    return old;
  end if;
  return null;
end; $$;

drop trigger if exists trg_daily_activity on public.challenge_log;
create trigger trg_daily_activity
after insert or delete on public.challenge_log
for each row execute function daily_activity_sync();

-- 3) 기존 로그 백필 (여러 번 실행해도 안전 — 어긋난 값을 덮어써 바로잡는다)
insert into daily_activity (day, user_id, mode, cnt)
select (created_at at time zone 'Asia/Seoul')::date, user_id::text, mode, count(*)::int
from challenge_log
group by 1, 2, 3
on conflict (day, user_id, mode) do update set cnt = excluded.cnt;

-- 4) 개인 도전 순위 (+ 기간 내 받은 응원 수, 내가 오늘 눌렀는지, 오늘 활동 여부)
--    mode 매칭은 JS 폴백과 똑같이 '포함(%typing%)'으로 둔다 — 두 경로의 숫자가 갈리면 안 된다.
create or replace function v2_ranking(
  p_from text default '', p_to text default '',
  p_include_learn boolean default true, p_me text default ''
)
returns table(
  rank int, name text, gubun text, sosok text, sebu text,
  cnt int, typing int, voice int, active_today boolean,
  cheers int, i_cheered boolean
)
language sql stable security definer set search_path = public as $$
  with lg as (
    select d.user_id, d.mode, d.day, d.cnt,
           u.name, u.type as gubun,
           coalesce(nullif(u.gu,''), u.bu, '')     as sosok,
           coalesce(nullif(u.mok,''), u.grade, '') as sebu
    from daily_activity d
    join users u on u.id::text = d.user_id
    where (p_from = '' or d.day >= p_from::date)
      and (p_to   = '' or d.day <= p_to::date)
      and (p_include_learn or d.mode not like 'learn-%')
  ),
  agg as (
    select user_id,
      max(name) as name, max(gubun) as gubun, max(sosok) as sosok, max(sebu) as sebu,
      sum(cnt)::int as cnt,
      coalesce(sum(cnt) filter (where mode like '%typing%'), 0)::int as typing,
      coalesce(sum(cnt) filter (where mode like '%voice%'),  0)::int as voice,
      bool_or(day = (now() at time zone 'Asia/Seoul')::date) as active_today
    from lg group by user_id
  ),
  ch as (   -- 기간 내 받은 응원 수
    select target_user_id, count(*)::int as n
    from rank_cheers
    where (p_from = '' or cheer_date >= p_from::date)
      and (p_to   = '' or cheer_date <= p_to::date)
    group by target_user_id
  ),
  mine as (  -- 내가 '오늘' 누른 것 (켬 표시는 언제나 오늘 기준)
    select target_user_id from rank_cheers
    where p_me <> '' and from_user_id = p_me
      and cheer_date = (now() at time zone 'Asia/Seoul')::date
  )
  select (row_number() over (order by a.cnt desc, a.name))::int,
         a.name, a.gubun, a.sosok, a.sebu,
         a.cnt, a.typing, a.voice, a.active_today,
         coalesce(ch.n, 0), (m.target_user_id is not null)
  from agg a
  left join ch    on ch.target_user_id = a.user_id
  left join mine m on m.target_user_id = a.user_id
  order by a.cnt desc, a.name;
$$;

-- 5) 교구별 순위 (교구 소속만, 교회학교 제외)
create or replace function v2_gu_ranking(p_from text default '', p_to text default '')
returns table(rank int, gu text, cnt int, people int, avg numeric)
language sql stable security definer set search_path = public as $$
  with lg as (
    select d.user_id, d.cnt, u.gu
    from daily_activity d
    join users u on u.id::text = d.user_id
    where u.type = '교구' and coalesce(u.gu, '') <> ''
      and (p_from = '' or d.day >= p_from::date)
      and (p_to   = '' or d.day <= p_to::date)
  ),
  agg as (
    select gu, sum(cnt)::int as cnt, count(distinct user_id)::int as people
    from lg group by gu
  )
  select (row_number() over (order by cnt desc, gu))::int,
         gu, cnt, people, round(cnt::numeric / people, 1)
  from agg
  order by cnt desc, gu;
$$;

-- 6) 본인 일자별 참여 횟수
create or replace function v2_mydays(p_user text, p_from text default '', p_to text default '')
returns table(day date, cnt int)
language sql stable security definer set search_path = public as $$
  select day, sum(cnt)::int
  from daily_activity
  where user_id = p_user
    and (p_from = '' or day >= p_from::date)
    and (p_to   = '' or day <= p_to::date)
  group by day
  order by day;
$$;

-- 7) 어긋남 대조 — 집계표를 두는 대가다. monitor가 매일 아침 이걸 보고,
--    로그 행 수와 집계 합계가 다르면 텔레그램으로 알린다.
--    조용히 틀린 숫자를 보여주는 것이 제일 나쁘다.
create or replace function v2_activity_drift()
returns table(log_rows bigint, agg_rows bigint, agg_sum bigint)
language sql stable security definer set search_path = public as $$
  select (select count(*) from challenge_log),
         (select count(*) from daily_activity),
         (select coalesce(sum(cnt), 0) from daily_activity);
$$;

-- 8) 보안: anon/공개 롤에서 실행 권한 회수 → Edge Function(service_role)만 호출 가능
revoke all on function v2_ranking(text, text, boolean, text) from public, anon, authenticated;
revoke all on function v2_gu_ranking(text, text)             from public, anon, authenticated;
revoke all on function v2_mydays(text, text, text)           from public, anon, authenticated;
revoke all on function v2_activity_drift()                   from public, anon, authenticated;
grant execute on function v2_ranking(text, text, boolean, text) to service_role;
grant execute on function v2_gu_ranking(text, text)             to service_role;
grant execute on function v2_mydays(text, text, text)           to service_role;
grant execute on function v2_activity_drift()                   to service_role;

-- 확인:
--   select * from v2_activity_drift();          -- log_rows 와 agg_sum 이 같아야 한다
--   select * from v2_ranking('', '', true, '') limit 5;
--   select * from v2_gu_ranking('', '');
