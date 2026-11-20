-- 💬 「내게 주시는 말씀」 에이전트(2026-11-20) — 구절 임베딩 · 돌림 기록 · 뜻으로 구절 찾기
--   설계 docs/superpowers/specs/2026-11-20-sermon-agent-design.md §2-6
--
--   무엇
--     · 표 verse_embed       — 앱 암송 구절의 임베딩(Voyage voyage-3-large · 1024). api 가 찾기 **직전에** 없거나 본문이 바뀐 구절만 채운다
--                              (text_hash = sha256("voyage-3-large\n" + 장절 + " " + 본문)). 구절 본문은 verses 가 원본이다.
--     · 표 sermon_agent_run  — 한 질문에 도구 · AI 몇 번 · 토큰 · 시간 · 끝(outcome). **이름 · user_id 없음** · 90일 넘은 줄은 api 가 기록할 때 지운다.
--     · RPC match_verse_embed — 코사인 유사도로 구절 찾기(match_sermon_chunks 와 같은 꼴) · verses 와 잇고 is_active 만 · 묶음(tracks)으로 거른다.
--
--   차례: 개발(ktpwthwqzgcqcrmsafdo) → 확인 → 운영(xnomlgydifiqiybervtf).
--         새 표에 새 액션(sermonAgent)만 얹는 일이라 **SQL 이 먼저**다(빈 표는 아무도 안 읽는다 — 스킬 sql-migrate ⑦ 첫째 경우).
--         넣은 뒤: python tools/sql-applied.py record supabase/sermon_agent.sql --dev  (운영은 --prod)
--   다시 돌려도 된다: if not exists · create or replace · revoke/grant 는 몇 번이든 같다.
--   되돌리기(문 scAgent 를 먼저 비운 뒤 — 닫혀 있으면 이 표를 아무도 안 읽는다):
--     drop function if exists public.match_verse_embed(extensions.vector, text[], int);
--     drop table if exists public.sermon_agent_run;
--     drop table if exists public.verse_embed;
--   ⚠️ 공유 DB(성경암송 · 찬양 · 말씀) — 새 표 · 새 함수만 더한다. verses 는 읽기만.
--   ⚠️ user_id 칸이 없다 → supabase/member_merge.sql 에 더할 것이 없다.
--   ⚠️ 정책을 만들지 않는다(특히 TO authenticated 금지 — 카카오 계정만 있으면 누구나 authenticated 다).

create extension if not exists vector with schema extensions;

begin;
set local lock_timeout = '5s';

-- ---------- 1. 구절 임베딩 ----------
create table if not exists public.verse_embed (
  track      text not null,                       -- 'weekly' | 'psalm' | 'navi' (verses.track 과 같은 값)
  no         int  not null,                       -- verses.no
  text_hash  text not null,                       -- 본문이 바뀌면 달라진다 → api 가 그 줄만 다시 채운다
  embedding  extensions.vector(1024) not null,
  updated_at timestamptz not null default now(),
  primary key (track, no)
);
-- 몇백 줄이라 HNSW 색인은 두지 않는다(순차 훑기가 더 빠르다). 천 줄을 넘기면 sermon_chunks 꼴로 더한다.
alter table public.verse_embed enable row level security;
revoke all on public.verse_embed from public, anon, authenticated;
grant all on public.verse_embed to service_role;

-- ---------- 2. 돌림 기록(비용 보기) ----------
create table if not exists public.sermon_agent_run (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  turn        int,                                -- 0 = 첫 질문 · 1·2 = 되묻기
  tool_calls  int,
  ai_calls    int,
  in_tokens   int,
  out_tokens  int,
  ms          int,
  outcome     text                                -- answer · cache · limited · ai-error · refusal · max-tokens · no-answer · empty-answer
);
create index if not exists sermon_agent_run_created_idx on public.sermon_agent_run (created_at);
alter table public.sermon_agent_run enable row level security;
revoke all on public.sermon_agent_run from public, anon, authenticated;
grant all on public.sermon_agent_run to service_role;
revoke all on sequence public.sermon_agent_run_id_seq from public, anon, authenticated;
grant usage, select on sequence public.sermon_agent_run_id_seq to service_role;

-- ---------- 3. 뜻으로 구절 찾기 ----------
-- search_path 를 함수에 박아 <=> 가 늘 풀리게 한다. SECURITY DEFINER 는 쓰지 않는다(service_role 전용 — match_sermon_chunks 와 같다).
create or replace function public.match_verse_embed(
  query_embedding extensions.vector(1024),
  tracks text[],
  match_count int default 6
)
returns table (no int, track text, ref text, text text, similarity float)
language sql
stable
set search_path = public, extensions
as $$
  select e.no, e.track, v.ref, v.text,
         1 - (e.embedding <=> query_embedding) as similarity
  from public.verse_embed e
  join public.verses v on v.no = e.no and v.track = e.track
  where v.is_active and e.track = any(tracks)
  order by e.embedding <=> query_embedding
  limit least(greatest(coalesce(match_count, 6), 1), 50);
$$;
revoke all on function public.match_verse_embed(extensions.vector, text[], int) from public, anon, authenticated;
grant execute on function public.match_verse_embed(extensions.vector, text[], int) to service_role;

commit;
