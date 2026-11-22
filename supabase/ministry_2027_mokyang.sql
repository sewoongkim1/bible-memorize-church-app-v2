-- 2027 사역 목록 — 부서 「L-12부」 → 「목양지원」 · 「소그룹 리더교육」 지움(친구 2026-11-22).
-- 부서 이름은 그 부서 팀 넷(운영 · 목양지원(교구) · 정착관리 · 목장리더)의 committee 만 바꾼다 — id · 담당 한 줄 · 차례 · 신청(team_id)이 그대로 이어진다.
-- 「소그룹 리더교육」은 신청이 걸려 있지 않을 때만 지운다(2026-11-22 운영 · 개발 모두 0건).
-- 시드 원본(tools/ministry-sheet-sql.py 의 COMMITTEE_RENAMES · SHEET_SKIP → supabase/ministry_catalog_2027_sheet.sql)에도 같은 변경을 넣었다 —
--   ⚠️ 시드 전체를 다시 돌리지 말고 이 파일만 넣는다(시드를 다시 돌리면 어드민에서 고친 설명 · 시간이 시트 값으로 돌아간다).
-- 실행 순서: 개발(ktpwthwqzgcqcrmsafdo) → 운영(xnomlgydifiqiybervtf). 반복해 돌려도 안전하다.
-- 되돌리는 법: 부서는 아래 update 의 두 이름을 맞바꿔 돌린다 · 지운 팀은 ministry_catalog_2027_sheet.sql 의 옛 판(git 기록)에서 그 한 줄을 다시 넣는다.

begin;
set local lock_timeout = '5s';

update public.ministry_catalog
   set committee = '목양지원'
 where year = 2027 and committee = 'L-12부';

delete from public.ministry_catalog c
 where c.year = 2027 and c.committee in ('L-12부', '목양지원') and c.group_name = '' and c.team = '소그룹 리더교육'
   and not exists (select 1 from public.ministry_orders o where o.year = c.year and o.team_id = c.id);

commit;

-- 확인
--   select id, committee, team, sort_order from public.ministry_catalog where year = 2027 and committee in ('L-12부', '목양지원') order by sort_order;   -- 목양지원 넷
