-- 💬 「내게 주시는 말씀」 에이전트(2026-11-20) — 돌림 기록에 프롬프트 캐시 토큰 두 칸
--   무엇: sermon_agent_run 에 cache_read_tokens(캐시에서 읽은 입력 토큰) · cache_write_tokens(캐시에 쓴 입력 토큰) — 둘 다 null 허용.
--         이름 · user_id 는 여전히 없다. RLS · 권한은 그대로(표 단위 grant 가 새 칸도 덮는다).
--   차례: 개발(ktpwthwqzgcqcrmsafdo) → 확인 → 운영(xnomlgydifiqiybervtf). 이미 쓰는 표에 칸을 더하고 **새 코드가 그 칸에 쓴다**
--         → SQL 이 먼저(칸이 없으면 기록 insert 가 실패하나, api 의 try/catch 가 삼켜 답은 간다).
--         넣은 뒤: python tools/sql-applied.py record supabase/sermon_agent_cache_cols.sql --dev  (운영은 --prod)
--   다시 돌려도 된다: add column if not exists.
--   되돌리기: alter table public.sermon_agent_run drop column if exists cache_read_tokens, drop column if exists cache_write_tokens;
alter table public.sermon_agent_run add column if not exists cache_read_tokens int;
alter table public.sermon_agent_run add column if not exists cache_write_tokens int;
