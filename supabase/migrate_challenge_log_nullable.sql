-- 핵심 암송(긴 본문) 활동을 통계(challenge_log)에 '암송(학습)'으로 합산하기 위한 마이그레이션.
-- 핵심 암송 마디는 실제 구절(verses)이 아니므로 verse_no를 null로 기록한다.
-- verse_no를 nullable로 바꾸되 외래키는 유지 — null은 FK 검사 대상이 아니라 실제 구절 무결성은 그대로.
alter table public.challenge_log alter column verse_no drop not null;

-- 구절별 통계(빠른 RPC)는 실제 구절만 집계 — verse_no가 null인 핵심 암송 로그는 제외.
create or replace function v2_verse_stats(p_from text default '', p_to text default '')
returns table(no int, participants int, cnt int)
language sql stable security definer set search_path = public as $$
  select (c.verse_no)::int as no,
         count(distinct c.user_id)::int as participants,
         count(*)::int as cnt
  from challenge_log c
  where c.verse_no is not null
    and (p_from = '' or c.created_at >= (p_from || 'T00:00:00+09:00')::timestamptz)
    and (p_to   = '' or c.created_at <= (p_to   || 'T23:59:59+09:00')::timestamptz)
  group by c.verse_no
  order by (c.verse_no)::int;
$$;

-- create or replace는 기존 권한을 유지하지만, 방어적으로 공개 롤 실행권한을 다시 회수한다.
revoke all on function v2_verse_stats(text, text) from public, anon, authenticated;
