-- 말씀/설교 CMS: verses 테이블에 표시용 컬럼 추가. SQL Editor에서 1회 실행.
alter table public.verses
  add column if not exists date       timestamptz,
  add column if not exists ref_short  text,
  add column if not exists ref_full   text,
  add column if not exists hint       text,
  add column if not exists pastor     text;

-- text/ref NOT NULL 제약 완화(관리자 입력 편의)
alter table public.verses alter column text drop not null;
alter table public.verses alter column ref  drop not null;
