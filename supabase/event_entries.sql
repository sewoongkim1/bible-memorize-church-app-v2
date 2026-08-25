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

-- RLS를 켠다. 정책을 하나도 두지 않으므로 익명 키로는 아무것도 못 읽는다.
-- 서버(Edge Function)는 service_role이라 RLS를 지나가므로 응모·조회 모두 그대로 된다.
-- ⚠️ 이 줄이 없어 2026-08-25까지 이 표의 user_id 47건이 공개 키로 읽혔다.
--    이 API는 JWT가 없어 남의 user_id가 새면 그 사람 행세가 가능하다.
alter table public.event_entries enable row level security;
