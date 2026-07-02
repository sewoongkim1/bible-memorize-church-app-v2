-- 기존 DB에 학습(단계 통과) 이벤트 모드 추가. SQL Editor에서 1회 실행.
alter table public.challenge_log drop constraint if exists challenge_log_mode_check;
alter table public.challenge_log add constraint challenge_log_mode_check
  check (mode in ('typing','voice','review-typing','review-voice','learn-typing','learn-voice'));
