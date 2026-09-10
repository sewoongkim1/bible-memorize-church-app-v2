-- 사역신청 — 직분 제약에 「사모」를 더한다 (2026-09-10)
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키를 절대 넣지 마세요.
-- ⚠️ **개발 DB(ktpwthwqzgcqcrmsafdo)에 먼저** 돌린 뒤 운영에 올린다.
--
-- 왜: 2026-09-10에 옛 썸머 명단의 「사모님」 때문에 직분 목록에 **사모**가 더해졌다
--     (app.js 의 MIN_POSITIONS, index.ts 의 서버 allowlist, js/events.js 의 폴백).
--     그런데 **DB 의 CHECK 제약은 그대로 8개**였다. 그래서 화면에는 사모가 뜨는데
--     신청을 누르면 DB 가 거부한다.
--
--     개발에서 실제로 재현했다:
--       집사 → {"ok":true}
--       사모 → HTTP 500  new row ... violates check constraint
--                        "ministry_orders_position_chk"
--
--     ⚠️ 더 나쁜 것은 **성도님께 보이는 말**이다. 500 은 minErr 가 통신 오류로 보아
--        「연결이 고르지 않아…」로 뜬다 — 사모님은 까닭도 모른 채 신청을 못 한다.
--
-- ⚠️⚠️ **이 목록은 세 곳에 있다.** 하나를 고치면 셋을 함께 고쳐야 한다:
--        ① app.js          MIN_POSITIONS
--        ② supabase/functions/api/index.ts   서버 allowlist(ministryPosition)
--        ③ 여기 CHECK 제약
--      셋 중 ①②만 고치면 화면은 열리는데 저장이 막힌다(이번에 그랬다).
--      ③만 고치면 값이 들어갈 수는 있으나 화면에 안 뜬다.
--      CLAUDE.md 가 적어 둔 challenge_log.mode 사고와 **같은 자리**다.

alter table public.ministry_orders drop constraint if exists ministry_orders_position_chk;
alter table public.ministry_orders add constraint ministry_orders_position_chk
  check (position is null or position in
    ('성도','집사','권사','안수집사','장로','전도사','목사','사모','학생'));

-- 확인
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'ministry_orders_position_chk';   -- 사모가 들어 있어야 한다
