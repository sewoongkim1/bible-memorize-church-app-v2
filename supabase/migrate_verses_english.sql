-- 영어(NIV) 암송 모드: verses 테이블에 영어 컬럼 추가. SQL Editor에서 1회 실행.
-- text_en IS NOT NULL 이면 "영어 암송 지원 구절"로 취급(별도 플래그 없음).
alter table public.verses
  add column if not exists text_en text,   -- NIV 본문 (AI 생성 후 어드민 검수)
  add column if not exists ref_en  text;   -- 영어 장절 표기 (예: John 3:16)
