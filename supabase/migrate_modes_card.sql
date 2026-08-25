-- challenge_log.mode 에 '카드로 채운 암송'을 더한다 (2026-08-25)
--
-- ■ 왜
--   타자가 어려운 분을 위한 👆 카드 모드가 이미 있는데, 카드로 맞혀도
--   'learn-typing'으로 저장돼 왔다. 그래서 **얼마나 쓰이는지 알 길이 없었다.**
--   음성이 0.1%(17,397회 중 3회)인 것은 알았는데, 그 대안인 카드는 측정 자체가
--   안 됐다. 어르신들이 실제로 어떻게 하고 계신지를 다음부터는 숫자로 본다.
--
-- ■ 왜 'learn-typing-card' 인가 (그냥 'card'가 아니라)
--   순위·통계가 타이핑을 `mode like '%typing%'`으로 세고 있다
--   (daily-activity.sql · rankingSlow). 이름에 typing이 들어가야 **지금까지의
--   숫자가 그대로 유지**되면서 카드만 따로 가려낼 수 있다.
--
-- ■ 안 하면 어떻게 되나
--   서버는 이 값을 넣어 보고 **실패하면 조용히 'learn-typing'으로 되돌린다**.
--   그래서 이 SQL을 늦게 실행해도 기록이 막히지는 않는다 — 다만 그때까지는
--   카드가 여전히 구분되지 않는다.
--   (예전에 'learn-typing-stage3'를 제약에 넣지 않고 보냈다가 기록이 전부
--    막힌 적이 있어, 이번엔 폴백을 먼저 넣어 두었다)
--
-- Supabase → SQL Editor 에서 실행.

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
                  'learn-typing','learn-voice','learn-typing-card'));

-- 확인 — 제약에 learn-typing-card 가 들어갔는지
select conname, pg_get_constraintdef(oid) as 제약
  from pg_constraint
 where conrelid = 'public.challenge_log'::regclass and contype = 'c';

-- 나중에 얼마나 쓰이는지 보는 질의 (지금은 0건이 정상)
-- select mode, count(*) from challenge_log group by mode order by count(*) desc;
