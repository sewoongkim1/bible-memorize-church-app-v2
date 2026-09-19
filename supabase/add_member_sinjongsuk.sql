-- 신종숙(화평-37) 회원 등록 + 「썸머 써 바이블」 이벤트 참여 명단에 수동 추가
-- 2026-09-19 — 앱을 직접 쓰지 않은 분을 관리자가 대신 등록해 드리는 자리라 SQL로 처리한다.
--
-- ⚠️ 이 저장소엔 이벤트가 두 벌 있다:
--    ① 새 `events` 테이블(events.sql) — id는 'summer-2026' 같은 슬러그.
--    ② 옛 「퀴즈형」 이벤트 — app_config 테이블의 key='event' 행의 value.id를 실제로 쓴다.
--    화면(renderEventBoard)은 ②의 event_id로 event_entries를 조회한다 — ①의 id로
--    넣으면 화면엔 하나도 안 보인다(실제로 이걸로 한 번 헛발질했다). 아래 0번으로
--    둘이 같은 문자열인지 반드시 먼저 확인할 것.
--
-- ⚠️ 개발 DB(ktpwthwqzgcqcrmsafdo)에서 먼저 실행해 확인한 뒤, 운영(xnomlgydifiqiybervtf)에 반영할 것.
-- ⚠️ users.id는 uuid, event_entries.user_id는 text라서 비교·조인 때는 반드시 u.id::text로 형변환할 것.
-- 적용: Supabase 대시보드 → SQL Editor에 붙여넣고 실행

-- 0) 화면이 실제로 쓰는 event_id를 확인한다 — 이 값을 아래 1)에 그대로 쓴다.
select value ->> 'id' as live_event_id, value ->> 'title' as live_title
  from public.app_config where key = 'event';

-- (참고용) 새 events 테이블 쪽 후보도 같이 보여준다 — 위 0번과 같은 id인지 대조할 것.
select id, title, status from public.events
  where title like '%썸머%' or id like '%summer%';

begin;

-- 1) 회원 등록 — 로그인 때와 똑같은 member_login()을 그대로 써서, 이미 있으면 새로 만들지 않고
--    identity_key(교구|화평|37|||신종숙)로 찾아 그대로 쓴다(중복 계정 방지).
-- ⚠️ member_login()은 identity_key를 자기가 계산하지 않는다 — 원래 호출하는 서버 코드
--    (index.ts의 identityKey())가 미리 만들어 넘긴다. 여기서도 똑같이 넣어야 한다.
select public.member_login(jsonb_build_object(
  'type', '교구', 'gu', '화평', 'mok', '37', 'bu', '', 'grade', '', 'name', '신종숙',
  'identity_key', '교구|화평|37|||신종숙'
));

-- 2) 화면이 실제로 쓰는 event_id(위 0번 결과)로 참여 기록을 추가한다.
--    ⚠️ 0번 결과가 'summer-2026'과 다르면, 아래 subquery를 0번이 보여준 값으로 바꿔서 실행할 것.
insert into public.event_entries (event_id, user_id, entered_at)
select (select value ->> 'id' from public.app_config where key = 'event'),
       u.id::text, now()
from public.users u
where u.identity_key = '교구|화평|37|||신종숙'
on conflict (event_id, user_id) do nothing;

commit;

-- 확인용 — 위 커밋 뒤에 따로 실행해 결과를 본다.
select u.id, u.name, u.gu, u.mok, u.identity_key from public.users u
  where u.identity_key = '교구|화평|37|||신종숙';
select ee.event_id, ee.entered_at from public.event_entries ee
  join public.users u on u.id::text = ee.user_id
  where u.identity_key = '교구|화평|37|||신종숙';
