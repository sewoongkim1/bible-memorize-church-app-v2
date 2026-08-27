-- 관리자 통계에 '카드' 열을 더하고, 카드가 타이핑에서 빠지던 것을 고친다 (2026-08-27)
--
-- ■ 무엇이 틀렸나
--   여기서만 타이핑을 `mode like '%typing'`(뒤 와일드카드 없음)로 세고 있었다.
--   카드로 푼 기록은 'typing-card' · 'learn-typing-card' 라 **card 로 끝난다** —
--   그래서 타이핑에도 음성에도 안 들어가 **타이핑 + 음성 ≠ 총횟수** 가 됐다.
--   (순위 v2_ranking 과 JS 폴백은 '%typing%' 이라 제대로 세고 있었다. 여기만 달랐다)
--
-- ■ 어떻게 고치나
--   ① '%typing%' 로 바꿔 카드도 타이핑에 넣는다 → 합이 맞는다
--   ② card 열을 더한다 — **카드는 타이핑의 부분집합**이다(화면에 「그중 카드」로 적는다)
--
-- ⚠️ 아래 정의는 stats-rpc.sql 의 원본을 그대로 읽어 두 곳만 고친 것이다.
--    손으로 다시 쓰면 is_new 판정 같은 미묘한 부분이 틀어진다.
--
-- Supabase → SQL Editor 에서 실행. 여러 번 실행해도 안전하다.

drop function if exists v2_stats(text, text);
create or replace function v2_stats(p_from text default '', p_to text default '')
returns table(gubun text, sosok text, new_count int, participants int, typing int, voice int, card int, total int)
language sql stable security definer set search_path = public as $$
  with lg as (
    select c.user_id, c.mode, u.type as gubun,
           coalesce(nullif(u.gu,''), u.bu, '') as sosok
    from challenge_log c
    join users u on u.id = c.user_id
    where (p_from = '' or c.created_at >= (p_from || 'T00:00:00+09:00')::timestamptz)
      and (p_to   = '' or c.created_at <= (p_to   || 'T23:59:59+09:00')::timestamptz)
  ),
  agg as (
    select gubun, sosok,
      count(*)::int as total,
      count(*) filter (where mode like '%typing%')::int as typing,
      count(*) filter (where mode like '%voice%')::int  as voice,
      count(*) filter (where mode like '%card')::int    as card,
      count(distinct user_id)::int as participants
    from lg group by gubun, sosok
  ),
  newu as (   -- 신규 = 기간 내 '처음 참여'한 인원 (첫 활동이 이 기간에 속하는 사용자)
    select u.type as gubun, coalesce(nullif(u.gu,''), u.bu, '') as sosok, count(*)::int as new_count
    from users u
    join (
      select user_id, min(created_at) as first_mem
      from challenge_log
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
         coalesce(a.card, 0)         as card,
         coalesce(a.total, 0)        as total
  from agg a
  full outer join newu n on a.gubun = n.gubun and a.sosok = n.sosok;
$$;

drop function if exists v2_participants(text, text, text);
create or replace function v2_participants(p_from text default '', p_to text default '', p_gubun text default '')
returns table(gubun text, sosok text, sebu text, name text, typing int, voice int, card int, total int, days int, is_new boolean)
language sql stable security definer set search_path = public as $$
  with fm as (   -- 사용자별 '첫 참여' 시각(전체 기록 기준)
    select user_id, min(created_at) as first_mem
    from challenge_log
    group by user_id
  )
  select u.type as gubun,
         coalesce(nullif(u.gu,''), u.bu, '')       as sosok,
         coalesce(nullif(u.mok,''), u.grade, '')   as sebu,
         u.name,
         count(*) filter (where c.mode like '%typing%')::int as typing,
         count(*) filter (where c.mode like '%voice%')::int  as voice,
         count(*) filter (where c.mode like '%card')::int    as card,
         count(*)::int as total,
         count(distinct (c.created_at at time zone 'Asia/Seoul')::date)::int as days,
         (p_from <> ''
           and fm.first_mem >= (p_from || 'T00:00:00+09:00')::timestamptz
           and (p_to = '' or fm.first_mem <= (p_to || 'T23:59:59+09:00')::timestamptz)) as is_new
  from challenge_log c
  join users u on u.id = c.user_id
  left join fm on fm.user_id = c.user_id
  where (p_from = '' or c.created_at >= (p_from || 'T00:00:00+09:00')::timestamptz)
    and (p_to   = '' or c.created_at <= (p_to   || 'T23:59:59+09:00')::timestamptz)
    and (p_gubun = '' or p_gubun = '전체' or u.type = p_gubun)
  group by c.user_id, u.type, coalesce(nullif(u.gu,''), u.bu, ''),
           coalesce(nullif(u.mok,''), u.grade, ''), u.name, fm.first_mem
  order by total desc;
$$;

-- 확인 — typing + voice = total 이어야 하고, card 는 typing 안에 든 수다
select gubun, sosok, typing, voice, card, total,
       (typing + voice = total) as 합이_맞나
  from v2_stats('', '') order by total desc limit 6;
