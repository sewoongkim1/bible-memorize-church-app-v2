-- 신종숙(화평-37) 회원 등록 + 「썸머 써 바이블」(events.id='summer-2026') 참여 명단에 수동 추가
-- 2026-09-19 — 앱을 직접 쓰지 않은 분을 관리자가 대신 등록해 드리는 자리라 SQL로 처리한다.
--
-- ⚠️ 이 저장소엔 "참여 기록" 표가 세 벌이나 있어 두 번 헛짚었다 — 이번엔 화면 렌더링 코드
--    (js/events.js의 evtLoadRoster → api.eventRosterPublic)까지 직접 따라가 확인했다:
--    ① event_entries — 옛 「퀴즈형」 이벤트(app_config 키='event') 전용. 무관.
--    ② events 테이블 자체 — 회차 정의(제목·기간·status)만 있고 참여자는 안 담는다.
--    ③ event_signups — 진짜 참여자가 담기는 표(직분·전화·메모까지). eventSignup()·
--       eventRosterPublic() 둘 다 이 표를 쓴다 — **여기에 넣어야 화면에 보인다.**
--    이전 시도로 event_entries에 잘못 넣은 두 행(event_id='summer-2026'·'2026-1')은
--    맨 아래 0-1)에서 지운다 — 아무 화면도 안 읽는 죽은 데이터라 남겨 둘 이유가 없다.
--
-- ⚠️ 개발 DB(ktpwthwqzgcqcrmsafdo)에서 먼저 실행해 확인한 뒤, 운영(xnomlgydifiqiybervtf)에 반영할 것.
-- 적용: Supabase 대시보드 → SQL Editor에 붙여넣고 실행

-- 0-1) 이전 두 번의 잘못된 시도로 event_entries에 남은 행 정리(있으면 지우고, 없으면 조용히 넘어감).
delete from public.event_entries ee
  using public.users u
  where u.id::text = ee.user_id
    and u.identity_key = '교구|화평|37|||신종숙'
    and ee.event_id in ('summer-2026', '2026-1');

begin;

-- 1) 회원 등록 — 이미 만들어져 있으면(직전 시도로 이미 생성됨) 그대로 찾아 쓴다.
select public.member_login(jsonb_build_object(
  'type', '교구', 'gu', '화평', 'mok', '37', 'bu', '', 'grade', '', 'name', '신종숙',
  'identity_key', '교구|화평|37|||신종숙'
));

-- 2) 진짜 참여자 표 event_signups에 추가 — eventSignup()이 만드는 행과 같은 모양으로.
--    직분(집사)은 성도님이 알려주신 값 — MIN_POSITIONS 목록에 있는 허용된 값이다.
insert into public.event_signups
  (event_id, user_id, ident_key, who_type, group_name, sub_name, name, position, source)
select 'summer-2026', u.id, '교구|화평|37|||신종숙', '교구', '화평', '37', '신종숙', '집사', 'app'
from public.users u
where u.identity_key = '교구|화평|37|||신종숙'
on conflict (event_id, user_id) do update set position = excluded.position;

commit;

-- 확인용 — 위 커밋 뒤에 따로 실행해 결과를 본다.
select event_id, name, group_name, sub_name, created_at from public.event_signups
  where ident_key = '교구|화평|37|||신종숙';
