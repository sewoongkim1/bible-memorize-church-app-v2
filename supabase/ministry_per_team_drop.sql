-- 사역신청 — 다 쓴 choices 칸 치우기 (2026-09-09)
-- ⚠️ ministry_per_team.sql 을 돌리고 **새 함수를 올린 뒤에** 실행한다.
--    옛 함수는 이 칸을 읽으므로, 먼저 지우면 그 사이에 신청 화면이 깨진다.
alter table public.ministry_orders drop column if exists choices;
