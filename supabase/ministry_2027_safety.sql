-- 2027 사역 목록 — 시설부 「안전관리」를 지운다(친구 2026-11-22 「시설부 안전관리 삭제」).
-- 신청이 걸려 있지 않을 때만 지운다(2026-11-22 운영 0건). 같은 부서의 다른 팀(시설관리 · 자재관리 · 가든팀)은 그대로.
-- 시드 원본(tools/ministry-sheet-sql.py SHEET_SKIP → supabase/ministry_catalog_2027_sheet.sql)에도 같은 변경을 넣었다 — 시드 전체를 다시 돌리지 말고 이 파일만.
-- 실행 순서: 개발(ktpwthwqzgcqcrmsafdo) → 운영(xnomlgydifiqiybervtf). 반복해 돌려도 안전하다.
-- 되돌리는 법: ministry_catalog_2027_sheet.sql 의 옛 판(git 기록)에서 그 한 줄을 다시 넣는다.

begin;
set local lock_timeout = '5s';

delete from public.ministry_catalog c
 where c.year = 2027 and c.committee = '시설부' and c.group_name = '' and c.team = '안전관리'
   and not exists (select 1 from public.ministry_orders o where o.year = c.year and o.team_id = c.id);

commit;

-- 확인
--   select id, team, sort_order from public.ministry_catalog where year = 2027 and committee = '시설부' order by sort_order;   -- 셋
