-- 2027 사역 목록 — 제자양육부 「단계별 제자양육」 팀 이름 넷을 바꾼다(친구 2026-11-22 「제자양육부 팀 수정」).
--   부르심반(1단계) → 1단계 · 동행반(2단계) → 2단계 · 사명반(3단계) → 학사관리 · 5060하프타임 → 전교인운동
-- 같은 줄(id)의 team 만 바꾼다 — 묶음 · 시간 · 하는 일 · 담당 · 차례 · 신청(team_id) 그대로(설명 글은 옛 팀 것 그대로 — 고칠 것은 따로).
-- 시드 원본(tools/ministry-sheet-sql.py RENAMES · SHEET_TEAM_OVERRIDE → supabase/ministry_catalog_2027_sheet.sql)에도 같은 변경을 넣었다 — 시드 전체를 다시 돌리지 말고 이 파일만.
-- 실행 순서: 개발(ktpwthwqzgcqcrmsafdo) → 운영(xnomlgydifiqiybervtf). 반복해 돌려도 안전하다(두 번째부터 바꿀 줄이 없다).
-- 되돌리는 법: 각 update 의 두 이름을 맞바꿔 돌린다.

begin;
set local lock_timeout = '5s';

update public.ministry_catalog set team = '1단계'
 where year = 2027 and committee = '제자양육부' and group_name = '단계별 제자양육' and team = '부르심반(1단계)';
update public.ministry_catalog set team = '2단계'
 where year = 2027 and committee = '제자양육부' and group_name = '단계별 제자양육' and team = '동행반(2단계)';
update public.ministry_catalog set team = '학사관리'
 where year = 2027 and committee = '제자양육부' and group_name = '단계별 제자양육' and team = '사명반(3단계)';
update public.ministry_catalog set team = '전교인운동'
 where year = 2027 and committee = '제자양육부' and group_name = '단계별 제자양육' and team = '5060하프타임';

commit;

-- 확인
--   select id, group_name, team, sort_order from public.ministry_catalog where year = 2027 and committee = '제자양육부' order by sort_order;
