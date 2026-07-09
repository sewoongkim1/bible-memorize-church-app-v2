-- 성경암송 v2 — 관리자 통계 성능 튜닝(집계를 DB로 내림)
-- 실행: Supabase Dashboard(xnomlgydifiqiybervtf) → SQL Editor 에 붙여넣고 RUN

-- 1) 인덱스 (없으면 생성)
create index if not exists challenge_log_created_idx on challenge_log(created_at);
create index if not exists challenge_log_mode_idx    on challenge_log(mode);
create index if not exists challenge_log_user_idx    on challenge_log(user_id);
create index if not exists challenge_log_verse_idx   on challenge_log(verse_no);
create index if not exists users_created_idx         on users(created_at);

-- 2) 구분·소속별 통계
create or replace function v2_stats(p_from text default '', p_to text default '')
returns table(gubun text, sosok text, new_count int, participants int, typing int, voice int, total int)
language sql stable security definer set search_path = public as $$
  with lg as (
    select c.user_id, c.mode, u.type as gubun,
           coalesce(nullif(u.gu,''), u.bu, '') as sosok
    from challenge_log c
    join users u on u.id = c.user_id
    where c.mode like 'learn-%'
      and (p_from = '' or c.created_at >= (p_from || 'T00:00:00+09:00')::timestamptz)
      and (p_to   = '' or c.created_at <= (p_to   || 'T23:59:59+09:00')::timestamptz)
  ),
  agg as (
    select gubun, sosok,
      count(*)::int as total,
      count(*) filter (where mode = 'learn-typing')::int as typing,
      count(*) filter (where mode = 'learn-voice')::int  as voice,
      count(distinct user_id)::int as participants
    from lg group by gubun, sosok
  ),
  newu as (   -- 신규 = 기간 내 '처음 암송'한 인원 (첫 learn 기록이 이 기간에 속하는 사용자)
    select u.type as gubun, coalesce(nullif(u.gu,''), u.bu, '') as sosok, count(*)::int as new_count
    from users u
    join (
      select user_id, min(created_at) as first_mem
      from challenge_log
      where mode like 'learn-%'
      group by user_id
    ) fm on fm.user_id = u.id
    where (p_from = '' or fm.first_mem >= (p_from || 'T00:00:00+09:00')::timestamptz)
      and (p_to   = '' or fm.first_mem <= (p_to   || 'T23:59:59+09:00')::timestamptz)
    group by u.type, coalesce(nullif(u.gu,''), u.bu, '')
  )
  select coalesce(a.gubun, n.gubun) as gubun,
         coalesce(a.sosok, n.sosok) as sosok,
         coalesce(n.new_count, 0)    as new_count,
         coalesce(a.participants, 0) as participants,
         coalesce(a.typing, 0)       as typing,
         coalesce(a.voice, 0)        as voice,
         coalesce(a.total, 0)        as total
  from agg a
  full outer join newu n on a.gubun = n.gubun and a.sosok = n.sosok;
$$;

-- 3) 참여자별 통계
create or replace function v2_participants(p_from text default '', p_to text default '', p_gubun text default '')
returns table(gubun text, sosok text, sebu text, name text, typing int, voice int, total int)
language sql stable security definer set search_path = public as $$
  select u.type as gubun,
         coalesce(nullif(u.gu,''), u.bu, '')       as sosok,
         coalesce(nullif(u.mok,''), u.grade, '')   as sebu,
         u.name,
         count(*) filter (where c.mode = 'learn-typing')::int as typing,
         count(*) filter (where c.mode = 'learn-voice')::int  as voice,
         count(*)::int as total
  from challenge_log c
  join users u on u.id = c.user_id
  where c.mode like 'learn-%'
    and (p_from = '' or c.created_at >= (p_from || 'T00:00:00+09:00')::timestamptz)
    and (p_to   = '' or c.created_at <= (p_to   || 'T23:59:59+09:00')::timestamptz)
    and (p_gubun = '' or p_gubun = '전체' or u.type = p_gubun)
  group by c.user_id, u.type, coalesce(nullif(u.gu,''), u.bu, ''),
           coalesce(nullif(u.mok,''), u.grade, ''), u.name
  order by total desc;
$$;

-- 4) 구절별 통계
create or replace function v2_verse_stats(p_from text default '', p_to text default '')
returns table(no int, participants int, cnt int)
language sql stable security definer set search_path = public as $$
  select (c.verse_no)::int as no,
         count(distinct c.user_id)::int as participants,
         count(*)::int as cnt
  from challenge_log c
  where c.mode like 'learn-%'
    and (p_from = '' or c.created_at >= (p_from || 'T00:00:00+09:00')::timestamptz)
    and (p_to   = '' or c.created_at <= (p_to   || 'T23:59:59+09:00')::timestamptz)
  group by c.verse_no
  order by (c.verse_no)::int;
$$;

-- 5) 보안: anon/공개 롤에서 실행 권한 회수 → Edge Function(service_role)만 호출 가능
--    (이 함수들은 참여자 실명 등 개인정보를 집계하므로 외부 직접 호출을 반드시 차단)
revoke all on function v2_stats(text, text)                 from public, anon, authenticated;
revoke all on function v2_participants(text, text, text)    from public, anon, authenticated;
revoke all on function v2_verse_stats(text, text)           from public, anon, authenticated;
grant execute on function v2_stats(text, text)              to service_role;
grant execute on function v2_participants(text, text, text) to service_role;
grant execute on function v2_verse_stats(text, text)        to service_role;
