-- 신종숙(화평-37) 회원 등록 + 진행 중인 「썸머 써 바이블」 이벤트 참여 명단에 수동 추가
-- 2026-09-19 — 앱을 직접 쓰지 않은 분을 관리자가 대신 등록해 드리는 자리라 SQL로 처리한다.
-- ⚠️ 개발 DB(ktpwthwqzgcqcrmsafdo)에서 먼저 실행해 확인한 뒤, 운영(xnomlgydifiqiybervtf)에 반영할 것.
-- 적용: Supabase 대시보드 → SQL Editor에 붙여넣고 실행

begin;

-- 1) 회원 등록 — 로그인 때와 똑같은 member_login()을 그대로 써서, 이미 있으면 새로 만들지 않고
--    identity_key(교구|화평|37|||신종숙)로 찾아 그대로 쓴다(중복 계정 방지).
-- ⚠️ member_login()은 identity_key를 자기가 계산하지 않는다 — 원래 호출하는 서버 코드
--    (index.ts의 identityKey())가 미리 만들어 넘긴다. 여기서도 똑같이 넣어야 한다
--    (안 넣으면 identity_key가 NULL이 되어 not-null 제약 위반으로 실패함 — 실제로 겪음).
select public.member_login(jsonb_build_object(
  'type', '교구', 'gu', '화평', 'mok', '37', 'bu', '', 'grade', '', 'name', '신종숙',
  'identity_key', '교구|화평|37|||신종숙'
));

-- 2) 현재 진행 중(open)인 회차에 참여 기록 추가. 이미 응모돼 있으면 건너뛴다(회차당 1인 1응모).
insert into public.event_entries (event_id, user_id, entered_at)
select e.id, u.id, now()
from public.events e
join public.users u on u.identity_key = '교구|화평|37|||신종숙'
where e.status = 'open'
on conflict (event_id, user_id) do nothing;

commit;

-- 확인용 — 아래를 따로 실행해 결과를 본다.
-- select u.id, u.name, u.gu, u.mok, u.identity_key from public.users u
--   where u.identity_key = '교구|화평|37|||신종숙';
-- select ee.event_id, ee.entered_at, e.title from public.event_entries ee
--   join public.events e on e.id = ee.event_id
--   join public.users u on u.id = ee.user_id
--   where u.identity_key = '교구|화평|37|||신종숙';
