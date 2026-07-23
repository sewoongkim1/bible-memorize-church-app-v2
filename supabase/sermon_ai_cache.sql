-- 설교말씀 도우미 AI 결과 캐시(비용·속도 절감).
--   kind='summary' → cache_key=sermon_id, answer=요약
--   kind='chat'    → cache_key=정규화된 질문, answer=답변, sources=출처
-- 재색인(embedSermons) 시 전체 비워 최신 내용과 어긋나지 않게 한다.
-- ⚠️ 공유 DB — 신규 테이블만 추가(기존 테이블 불변).
create table if not exists sermon_ai_cache (
  kind text not null,
  cache_key text not null,
  answer text not null,
  sources jsonb,
  created_at timestamptz not null default now(),
  primary key (kind, cache_key)
);

-- RLS deny-all: 정책 없이 활성화 → service_role(api)만 접근.
alter table sermon_ai_cache enable row level security;
