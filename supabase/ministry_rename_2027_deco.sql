-- 2027 사역 목록 — 교회봉사부 「카페운영」 → 「데코팀」 이름만 바꾼다(친구 2026-11-22).
-- 같은 줄(id)을 이름만 바꾸므로 담당 한 줄 · 필요 인원 · 섬기는 분 · 차례 · 신청(team_id)이 그대로 이어진다.
-- 시드 원본(tools/ministry-sheet-sql.py 의 RENAMES · SHEET_TEAM_OVERRIDE → supabase/ministry_catalog_2027_sheet.sql)에도 같은 이름 바꾸기를 넣었다 —
--   ⚠️ 시드 전체를 다시 돌리지 말고 이 파일만 넣는다(시드를 다시 돌리면 어드민에서 고친 설명 · 시간이 시트 값으로 돌아간다).
-- 실행 순서: 개발(ktpwthwqzgcqcrmsafdo) → 운영(xnomlgydifiqiybervtf). 반복해 돌려도 안전하다(두 번째부터는 바꿀 줄이 없다).
-- 되돌리는 법: 아래 update 의 두 이름을 맞바꿔 돌린다.

begin;
set local lock_timeout = '5s';

update public.ministry_catalog
   set team = '데코팀'
 where year = 2027 and committee = '교회봉사부' and group_name = '' and team = '카페운영'
   and not exists (select 1 from public.ministry_catalog x
                    where x.year = 2027 and x.committee = '교회봉사부' and x.group_name = '' and x.team = '데코팀');

commit;

-- 확인
--   select id, team, schedule_note, desc_note from public.ministry_catalog where year = 2027 and committee = '교회봉사부' order by sort_order;
