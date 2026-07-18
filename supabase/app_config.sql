-- ============================================================
-- 앱 설정 저장소(키-값). 관리자가 배포 없이 편집하는 값들을 담는다.
--   주요 키: heartMessages(마음에 둠), dailyMessage(오늘의 메시지),
--            introSlides(첫 방문 안내),
--            milestoneMessages(10·20·30회 등 일일 달성 응원 문구)
-- Supabase SQL Editor에서 1회 실행. value 는 jsonb.
-- ============================================================
create table if not exists public.app_config (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

-- RLS: 켜두고 정책 없음(기본 차단). 읽기/쓰기는 Edge Function(service_role)만.
alter table public.app_config enable row level security;

-- 확인: select key, jsonb_array_length(value) from app_config;
