-- 2027 사역 목록 — 부서 이름 바로잡기: 「목양지원」 → 「목양부」(친구 2026-11-22 · 「L-12부 → 목양지원」 다음에 「목양지원 → 목양부 입니다」).
-- ministry_2027_mokyang.sql 다음에 돌린다(그 파일이 L-12부 를 목양지원 으로 옮기고 소그룹 리더교육 을 지웠다). 아직 L-12부 인 DB 도 함께 옮긴다.
-- 부서 팀 넷의 committee 만 바꾼다 — id · 담당 한 줄 · 차례 · 신청(team_id) 그대로.
-- 시드 원본(tools/ministry-sheet-sql.py COMMITTEE_RENAMES)도 L-12부 → 목양부 로 고쳤다.
-- 실행 순서: 개발(ktpwthwqzgcqcrmsafdo) → 운영(xnomlgydifiqiybervtf). 반복해 돌려도 안전하다.
-- 되돌리는 법: 아래 update 의 이름을 맞바꿔 돌린다.

begin;
set local lock_timeout = '5s';

update public.ministry_catalog
   set committee = '목양부'
 where year = 2027 and committee in ('목양지원', 'L-12부');

commit;

-- 확인
--   select id, committee, team, sort_order from public.ministry_catalog where year = 2027 and committee in ('L-12부', '목양지원', '목양부') order by sort_order;   -- 목양부 넷
