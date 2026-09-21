-- 설교 올리기 작업 기록 — 설교·찬양 담당자(2026-09-21)
-- 설계: docs/superpowers/specs/2026-09-21-sermon-staff-upload-design.md 6장
-- ⚠️ 개발(ktpwthwqzgcqcrmsafdo) 먼저. 운영(xnomlgydifiqiybervtf)은 2026-09-27 안드로이드 심사가 끝난 뒤.
-- 새 표에 새 액션만 얹는다 — 표가 먼저, 함수가 나중(빈 표는 아무도 안 읽는다).
create table if not exists public.sermon_jobs (
  id          bigint generated always as identity primary key,
  video_id    text not null check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  title       text not null,
  svc_date    date not null,
  category    text not null,             -- ⚠️ CHECK 없음 — 목록은 화면·서버 두 곳(SERMON_CATS)
  preacher    text not null,
  transcript  text not null,             -- 공개 영상의 자막 — 개인정보 아님
  status      text not null default 'queued' check (status in ('queued','running','done','failed')),
  step        text,                      -- 지금(또는 멈춘) 단계
  error       text,                      -- 실패 까닭 한 줄(담당자 화면에 그대로 보인다)
  run_url     text,                      -- GitHub 실행 주소
  created_by  text,                      -- 올린 분 「소속 이름」 — 보이기용, user_id 아님
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- 한 번에 하나만 — 두 사람이 같은 순간 눌러도 진행 중인 작업은 하나다(AI 비용이 쌓이지 않게)
create unique index if not exists sermon_jobs_one_active
  on public.sermon_jobs ((true)) where status in ('queued','running');
create index if not exists sermon_jobs_updated_idx on public.sermon_jobs (updated_at desc);
alter table public.sermon_jobs enable row level security;   -- ⚠️ 그 자리에서 켠다
revoke all on public.sermon_jobs from anon, authenticated;
