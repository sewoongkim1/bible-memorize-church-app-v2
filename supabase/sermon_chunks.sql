-- 설교 아카이브 챗봇 (관리자 베타) — RAG 벡터 스토어
--
-- ⚠️ 이 DB는 3개 앱(성경암송/찬양/말씀 + myfavorite)이 공유한다. 이 파일은
-- 신규 테이블 sermon_chunks와 RPC match_sermon_chunks만 추가하며, 기존
-- 테이블(sermons 등)은 건드리지 않는다.
--
-- 임베딩은 myfavorite content_chunks와 동일하게 Voyage voyage-3-large(1024차원).
-- vector 확장은 프로젝트 규약상 extensions 스키마에 이미 설치돼 있다.

create table if not exists sermon_chunks (
  id uuid primary key default gen_random_uuid(),
  sermon_id text not null,
  chunk_index integer not null default 0,
  content text not null,
  embedding extensions.vector(1024) not null,
  -- 검색 결과에서 조인 없이 바로 인용/링크에 쓰도록 메타를 비정규화해 둔다.
  title text not null,
  svc_date date,
  scripture text,
  youtube_id text not null,
  created_at timestamptz not null default now()
);

-- 재색인(embedSermons)이 sermon_id 단위로 기존 청크를 지우고 다시 넣으므로 인덱스.
create index if not exists sermon_chunks_sermon_idx on sermon_chunks (sermon_id);

-- HNSW 코사인 인덱스 (myfavorite content_chunks 패턴).
create index if not exists sermon_chunks_embedding_idx
  on sermon_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

-- RLS deny-all: 정책을 두지 않아 anon/authenticated 접근을 전면 차단하고,
-- 서비스 롤(api Edge Function)만 RLS를 우회한다. (myfavorite cron_run_log 패턴)
alter table sermon_chunks enable row level security;

-- 코사인 유사도 검색 RPC. search_path를 함수에 고정해 <=> 연산자가 항상
-- resolve되게 하고, SECURITY DEFINER는 쓰지 않는다(service_role 전용).
create or replace function match_sermon_chunks(
  query_embedding extensions.vector(1024),
  match_count int default 5
)
returns table (
  id uuid,
  sermon_id text,
  content text,
  title text,
  svc_date date,
  scripture text,
  youtube_id text,
  similarity float
)
language sql
stable
set search_path = public, extensions
as $$
  select
    id,
    sermon_id,
    content,
    title,
    svc_date,
    scripture,
    youtube_id,
    1 - (embedding <=> query_embedding) as similarity
  from sermon_chunks
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- anon 키로 PostgREST rpc() 직접 호출을 막고 service_role만 실행 가능하게.
revoke execute on function match_sermon_chunks(extensions.vector(1024), int) from public;
grant execute on function match_sermon_chunks(extensions.vector(1024), int) to service_role;
