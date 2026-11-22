-- 2027 사역 목록 — 「주차안내」를 M-12부에서 새 부서 「차량부」로 옮긴다(친구 2026-11-22 「M-12 에 있는 주차안내를 차량부로 빼주세요」).
-- 같은 줄(id)의 committee 만 바꾼다 — 담당 한 줄 · 시간 · 차례 · 신청(team_id) 그대로. 차량부는 이 팀 하나로 새로 생긴다(차례는 맨 끝 — M-12부 다음).
-- 시드 원본(tools/ministry-sheet-sql.py TEAM_MOVES → supabase/ministry_catalog_2027_sheet.sql)에도 같은 변경을 넣었다 — 시드 전체를 다시 돌리지 말고 이 파일만.
-- 실행 순서: 개발(ktpwthwqzgcqcrmsafdo) → 운영(xnomlgydifiqiybervtf). 반복해 돌려도 안전하다.
-- 되돌리는 법: 아래 update 의 두 부서 이름을 맞바꿔 돌린다.

begin;
set local lock_timeout = '5s';

update public.ministry_catalog
   set committee = '차량부'
 where year = 2027 and committee = 'M-12부' and group_name = '' and team = '주차안내';

commit;

-- 확인
--   select id, committee, team, sort_order from public.ministry_catalog where year = 2027 and committee in ('M-12부', '차량부') order by sort_order;   -- M-12부 다섯 · 차량부 하나
