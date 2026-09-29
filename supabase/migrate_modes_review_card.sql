-- challenge_log.mode 에 '카드로 채운 복습'을 더한다 (2026-09-23)
--
-- ⚠️ 이 파일은 제약을 지웠다 다시 만든다 — 몇 번을 실행해도 안전하다.
--    migrate_modes_card.sql(2026-08-25)의 목록을 그대로 물려받고 한 줄만 더했다.
--
-- ■ 왜
--   복습 화면에만 카드 모드가 없었다. 2026-09-23 실측 — 암송은 카드 59.6%,
--   도전은 77.5%인데 복습은 자판 99.9%다. 암송·도전에서 카드로 외우시던 분이
--   복습에 오면 갑자기 자판만 있는 화면을 만난다.
--   복습은 전체 반복의 0.6%(755회)뿐이고 대상 174명 중 122명(70.1%)이 한 번도 안 했다.
--
-- ■ 왜 'review-typing-card' 인가 ('review-card' 가 아니라)
--   순위·통계가 타이핑을 `mode like '%typing%'` 으로 센다. 이름에 typing 이 들어가야
--   지금까지의 숫자가 그대로 유지되면서 카드만 따로 가려낼 수 있다.
--   'review-card' 로 지으면 그 집계에서 **조용히 빠진다**(오류가 안 난다).
--
-- ■ ⚠️ 안 하면 어떻게 되나 — 도전 때와 다르다
--   도전 카드(typing-card)는 서버에 폴백이 있어 제약이 늦어도 기록이 살아남았다.
--   복습은 그 폴백이 `m === "typing-card"` 정확 일치라 **안 걸린다**(이번에 함께 넓힌다).
--   게다가 postChallenge 가 실패해도 바로 다음 줄 advanceReview 는 그대로 돌아
--   **기록은 안 남고 복습 일정만 다음 박스로 밀려난다.** 재시도 대기열도 없다.
--   → 그래서 이 SQL 이 **반드시 먼저**다.
--
-- 실행: Supabase Dashboard → SQL Editor. **개발(ktpwthwqzgcqcrmsafdo) 먼저, 그다음 운영.**

do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.challenge_log'::regclass and contype = 'c'
  loop
    execute 'alter table public.challenge_log drop constraint ' || quote_ident(c);
  end loop;
end $$;

alter table public.challenge_log add constraint challenge_log_mode_check
  check (mode in ('typing','voice','review-typing','review-voice',
                  'learn-typing','learn-voice',
                  'learn-typing-card',     -- 암송 화면을 카드로
                  'typing-card',           -- 말씀 도전을 카드로
                  'review-typing-card'));  -- 복습을 카드로 (2026-09-23)

-- 확인 — 목록에 review-typing-card 가 들어갔는지
select conname, pg_get_constraintdef(oid) as 제약
  from pg_constraint
 where conrelid = 'public.challenge_log'::regclass and contype = 'c';
