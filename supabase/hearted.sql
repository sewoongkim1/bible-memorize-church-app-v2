-- ============================================================
-- "이 말씀을 내 마음에 두었나이다" 체크(금배지) — progress에 컬럼 추가.
-- Supabase SQL Editor에서 실행. 기존 행은 hearted=false로 시작(데이터 손실 없음).
-- ============================================================
alter table public.progress add column if not exists hearted    boolean not null default false;
alter table public.progress add column if not exists hearted_at timestamptz;

-- 목록/동기화에서 "체크한 구절만" 빠르게 뽑기 위한 부분 인덱스
create index if not exists idx_progress_hearted
  on public.progress(user_id) where hearted;

-- 확인: select verse_no, stage, hearted, hearted_at from progress where hearted limit 5;
