-- push_log 에 실패 이유를 적을 칸 (2026-09-24, 1판)
--
-- ⚠️ 왜 필요한가 — 지금은 애플/웹푸시가 준 거절 이유를 sendPush 가 diag 모드에서만
--    돌려주고 그 밖에는 통째로 버린다. 그래서 아이폰 13분이 8일 동안 알림을 한 통도
--    못 받는 동안 아무도 이유를 몰랐다(failed 숫자만 늘었다).
--    이 칸이 있으면 **다음 날 아침 크론이 스스로 이유를 적는다.**
--
-- ⚠️ 기기 토큰과 user_id 는 절대 넣지 않는다 — 이유 문자열만 넣는다.

alter table public.push_log add column if not exists note text;

-- 확인:
--   select to_char(sent_at at time zone 'Asia/Seoul','MM-DD HH24:MI') kst,
--          mode, sent, failed, total, note
--   from public.push_log order by sent_at desc limit 8;
