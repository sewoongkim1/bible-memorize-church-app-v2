-- 말씀 이벤트 응모 기록 (회차당 1인 1응모)
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키를 절대 넣지 마세요.
--
-- 적용: Supabase 대시보드 → SQL Editor에 붙여넣고 실행

create table if not exists public.event_entries (
  event_id   text        not null,
  user_id    text        not null,
  entered_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

-- 관리자 명단 조회(회차별, 응모순)용
create index if not exists event_entries_event_idx
  on public.event_entries (event_id, entered_at);
