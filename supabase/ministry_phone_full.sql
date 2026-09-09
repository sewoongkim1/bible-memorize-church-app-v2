-- 사역신청 — 뒷 4자리 대신 휴대폰 번호 전체 (2026-09-09)
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키를 절대 넣지 마세요.
-- ⚠️ **개발 DB(ktpwthwqzgcqcrmsafdo)에 먼저** 돌린 뒤 운영에 올린다.
--
-- 왜 바꾸나(성도님 결정 2026-09-09): 뒷 4자리는 교적 대조에는 모자라고, 임명이
-- 정해진 뒤 담당자가 연락할 길도 없었다. 필사 노트 신청과 같은 방식으로 맞춘다.
-- ⚠️ 더 많이 받는 만큼 약속도 같아야 한다 — **결정이 나면 서버가 번호를 지운다**
--    (ministrySetStatus). 개인정보 안내 /privacy/ 에도 함께 적었다.
-- ⚠️ 옛 뒷 4자리는 번호로 되살릴 수 없다. 그대로 버리고 새로 받는다
--    (신청 기간 2026-12-13 시작 전이라 운영에는 시험 행뿐이다).

alter table public.ministry_orders
  add column if not exists phone text;

alter table public.ministry_orders drop constraint if exists ministry_orders_phone4_chk;
alter table public.ministry_orders drop column if exists phone4;

-- 확인
--   select name, phone, status from ministry_orders where year = 2027;
