-- 📚 주제별 성경암송 — 💡 쉬운 풀이 · 🧠 기억법 칸 둘(2026-10-16 친구 「그림은 빼고 나머지 진행」 · 「모두 반영」)
--   주간 말씀의 풀이 · 기억법은 말씀 아카이브 sermons(설교 등록 때 만든다)에서 읽는다 — 주제별 73구절은 설교에 매이지 않아 verses 에 둔다.
--   그래서 이 두 칸은 track = 'navi' 줄에만 쓴다(주간 · 물가는 null). 영어(NIV)는 주간과 같은 칸(text_en · ref_en)을 쓴다.
--
-- 차례(스킬 sql-migrate ⑦ — 새 칸을 새 코드가 읽는다 → SQL 먼저):
--   ① 이 파일(칸 둘) — 개발(ktpwthwqzgcqcrmsafdo) 먼저 → 운영(xnomlgydifiqiybervtf) · python tools/sql-applied.py record supabase/navi_help.sql --dev|--prod
--   ② 값 넣기 — 자료/navi/navi_help_data.sql(make-help-drafts.py --sql 이 만든다 · NIV 본문이 들어 있어 .gitignore — 이 PC 에만 있다)
--   ③ 그다음 api(navi.ts 가 두 칸 + text_en · ref_en 을 읽는다) → 앱(js/navi.js)
--   ⚠️ ③을 먼저 올리면 칸이 없는 DB 에서 getVerses navi 가 ok:false → 앱은 「지금 불러올 수 없어요」(모름)가 된다.
-- 여러 번 돌려도 안전하다(add column if not exists). 새 칸은 verses 의 RLS · 권한을 그대로 따른다(새 표 · 뷰 · 함수 없음).
-- 되돌리기: alter table public.verses drop column if exists help_easy, drop column if exists help_tip;
--   (⚠️ 그 전에 두 칸을 읽지 않는 api 를 먼저 운영에 — 옛 칸을 select 하면 navi 갈래가 통째로 실패한다)

begin;
set local lock_timeout = '5s';

alter table public.verses
  add column if not exists help_easy text,   -- 💡 쉬운 풀이(주제별만 · 주간은 sermons.easyExplain)
  add column if not exists help_tip  text;   -- 🧠 기억법(주제별만 · 주간은 sermons.memoryTip)

commit;

select column_name, data_type from information_schema.columns
 where table_schema = 'public' and table_name = 'verses' and column_name in ('help_easy', 'help_tip', 'text_en', 'ref_en')
 order by column_name;
