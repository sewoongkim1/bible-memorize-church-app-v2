-- 설교말씀 도우미 사용 로그 (누가 · 무엇을 조회 · 언제). 관리자만 조회.
-- ⚠️ 공유 DB — 신규 테이블만 추가(기존 테이블 불변).
create table if not exists sermon_chat_log (
  id uuid primary key default gen_random_uuid(),
  name text,          -- 이름
  gu text,            -- 교구
  mok text,           -- 목장
  question text not null,
  created_at timestamptz not null default now()
);

create index if not exists sermon_chat_log_created_idx on sermon_chat_log (created_at desc);

-- RLS deny-all: 정책 없이 활성화 → anon/authenticated 차단, service_role(api)만 접근.
alter table sermon_chat_log enable row level security;
