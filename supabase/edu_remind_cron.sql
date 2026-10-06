-- 교육 개강 전날 알림(교육신청 4단계 · 2026-10-05 · 계획 docs/superpowers/plans/2026-10-05-education-stage4.md A) — pg_cron + pg_net
-- 매일 10:00 UTC = 19:00 KST 에 성경암송 api 의 내부 액션 internalEduRemind 를 부른다 → 내일(한국)이 첫 날인 강좌의 확정자(앱 계정)에게 한 번.
-- 무엇을 고르고 무엇을 보내는지는 api(supabase/functions/api/index.ts internalEduRemind) 한 곳 — 여기는 부르기만 한다.
--
-- ⚠️ 이 저장소는 공개(public)입니다 — 키를 이 파일(이나 그 사본)에 적지 않는다.
-- 키는 Vault 에 둔다(검토 반영 2026-10-06): 작업 명령(cron.job.command)에 키를 박지 않고, **돌 때마다** vault.decrypted_secrets 에서
--   이름(edu_remind_service_key)으로 읽어 x-internal-key 머리에 싣는다. 그래서 cron.job 을 읽어도 키가 보이지 않는다.
--   키 = 그 프로젝트 **api 함수가 보는** SUPABASE_SERVICE_ROLE_KEY 와 같은 값(api 가 x-internal-key 를 그것과 견준다 — internalMinistryNotify 와
--   같은 문). 맞는지는 `supabase secrets list --project-ref <ref>` 의 SUPABASE_SERVICE_ROLE_KEY 값(sha256)과 그 키의 sha256 을 견주어 본다
--   (키를 화면에 찍지 않는다 · 개발에서는 옛 service_role JWT 가 아니라 새 방식 secret 키였다).
--   · 처음 한 번 — 그 프로젝트의 SQL Editor 에서(이 파일 밖 · 키는 붙여 넣기만 하고 어디에도 저장하지 않는다):
--       select vault.create_secret('<그 프로젝트 api 의 SUPABASE_SERVICE_ROLE_KEY>', 'edu_remind_service_key', '교육 개강 전날 알림 크론 → api x-internal-key');
--   · 키를 바꾸면(로테이션) — Vault 의 값만 바꾼다(작업은 다시 걸 필요 없다 · 다음 실행부터 새 키를 읽는다):
--       select vault.update_secret((select id from vault.secrets where name = 'edu_remind_service_key'), '<새 키>');
--   · 이름이 Vault 에 없으면 이 파일은 아무것도 걸지 않고 멈춘다(raise exception · 다시 돌려도 안전).
-- 주소(YOUR_API_URL)는 자리표다 — 돌릴 때 그 프로젝트의 api 주소로 바꾼 사본으로 돌린다(키가 아니라 비밀은 아니다 · 박아 두지 않는 것은
--   개발에 돌렸다가 운영 api 를 부르는 일이 없게). 운영 https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api — 꼴이 아니면 멈춘다.
-- 다시 돌려도 안전 — 같은 이름의 작업을 먼저 지우고(unschedule) 다시 건다(schedule).
-- pg_cron·pg_net 이 없는 DB(개발 ktpwthwqzgcqcrmsafdo)에서는 걸지 않고 알리기만 한다(board_reports.sql 과 같다 · Vault 도 보지 않는다) —
--    그때는 api 의 internalEduRemind 를 서비스 키로 손으로 부르면 같은 일을 한다(tests/edu-notify.dev.sh).
-- 작업 이름 edu-first-day-remind — 다른 작업(daily-push-5~8 · weekly-verse-push · weekly-report-email · board-reports-purge ·
--    sermon-answer-reports-purge · ministry-phone-expire …)과 겹치지 않는다. 저녁 알림(push_evening.sql · EVENING_LIVE)과는 무관하다.
do $$
declare
  v_url text := 'YOUR_API_URL';
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') or not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'pg_cron·pg_net 이 없어 개강 전날 알림 작업(edu-first-day-remind)을 걸지 않았습니다 — api internalEduRemind 를 서비스 키로 부르면 같은 일을 합니다.';
    return;
  end if;
  if v_url !~ '^https://[a-z0-9]{20}\.supabase\.co/functions/v1/api$' then
    raise exception 'YOUR_API_URL 을 그 프로젝트의 api 주소로 바꾼 사본으로 돌리세요(아무것도 걸지 않았습니다)';
  end if;
  if not exists (select 1 from pg_extension where extname = 'supabase_vault') then
    raise exception 'Vault(supabase_vault)가 없어 키를 둘 곳이 없습니다(아무것도 걸지 않았습니다)';
  end if;
  -- 키가 Vault 에 그 이름으로 있는지 · 빈 값·자리표 그대로 넣은 것은 막는다(길이·빈칸만 본다 · 값은 어디에도 찍지 않는다)
  if not exists (select 1 from vault.decrypted_secrets where name = 'edu_remind_service_key'
                   and length(coalesce(decrypted_secret, '')) >= 30 and decrypted_secret !~ '\s') then
    raise exception 'Vault 에 edu_remind_service_key 가 없습니다(또는 비었습니다) — 먼저 select vault.create_secret(''<api 의 SUPABASE_SERVICE_ROLE_KEY>'', ''edu_remind_service_key''); 를 돌리세요(아무것도 걸지 않았습니다)';
  end if;
  perform cron.unschedule(jobid) from cron.job where jobname = 'edu-first-day-remind';
  perform cron.schedule('edu-first-day-remind', '0 10 * * *',   -- 10:00 UTC = 19:00 KST(매일)
    format($cmd$select net.http_post(
    url := %L,
    headers := jsonb_build_object('Content-Type','application/json',
      'x-internal-key',(select decrypted_secret from vault.decrypted_secrets where name = 'edu_remind_service_key')),
    body := jsonb_build_object('action','internalEduRemind')
  )$cmd$, v_url));
end $$;

-- 확인(키는 찍지 않는다 — 명령에 키가 없어야 한다):
--   select jobname, schedule, active, position('vault.decrypted_secrets' in command) > 0 as reads_vault from cron.job where jobname = 'edu-first-day-remind';
--   select name, created_at, updated_at from vault.secrets where name = 'edu_remind_service_key';
-- 지난 실행:  select status, return_message, start_time from cron.job_run_details
--               where jobid = (select jobid from cron.job where jobname = 'edu-first-day-remind') order by start_time desc limit 5;
-- 보낸 기록:  select sent_at, mode, sent, failed, total, ok from push_log where mode = 'edu-first-day' order by sent_at desc limit 10;
--            (내일 첫 날인 강좌가 없으면 push_log 줄도 없다 — api 응답 {ok, day, courses:0, sent:0})
-- 해제:      select cron.unschedule('edu-first-day-remind');
--            ⚠️ 키(edu_remind_service_key)는 **봉사 당번 전날 알림(duty-remind · duty_remind_cron.sql)도 읽는다** — 두 작업을 모두 걷을 때만 지운다
--               (delete from vault.secrets where name = 'edu_remind_service_key';). 하나만 걷고 지우면 남은 작업이 조용히 unauthorized 가 된다.
