-- 주간 구절에 「설교 구분」을 함께 저장 (2026-10-09 · 설교 올리기 흐름 — 토요일 ①에서 제목·예배일·구분·설교자를 구절과 함께 넣고,
--   일요일 ②(유튜브+자막)가 그 구분까지 불러오게 한다). 제목·예배일·설교자는 이미 verses(sermon_title·date·pastor)에 있다.
-- ⚠️ nullable 추가라 성도님 화면·getVerses·latestVerse 에 영향 없다(안 읽는 칸).
-- 개발 → 운영 순으로. 여러 번 돌려도 된다.
alter table public.verses add column if not exists mem_category text;
