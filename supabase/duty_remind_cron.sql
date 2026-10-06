-- 봉사 당번 전날 알림(봉사 당번 3단계 · 2026-10-06 · 설계 docs/superpowers/specs/2026-10-06-duty-roster-design.md §10) — pg_cron + pg_net
-- 매일 10:00 UTC = 19:00 KST 에 성경암송 api 의 내부 액션 internalDutyRemind 를 부른다 → 내일(한국) 당번인 분(앱 계정)께 한 번.
--   19:00 은 그날이 저절로 잠기는 때(duty_cutoff — 전날 19:00)와 같다: 「내일 당번이에요」가 곧 「이제 앱에서는 취소할 수 없어요」와 같은 때에 간다.
-- 무엇을 고르고 무엇을 보내는지는 api(supabase/functions/api/index.ts internalDutyRemind · dutyNotifySend) 한 곳 — 여기는 부르기만 한다.
--   문(dutyOpen)이 열리기 전에는 api 가 🧪 시험 참여자에게만 보낸다 · 같은 줄에 두 번 가지 않는다(duty_notify_claim).
--
-- ⚠️ 이 저장소는 공개(public)입니다 — 키를 이 파일(이나 그 사본)에 적지 않는다.
-- 키는 Vault 에 둔다 — 교육 개강 전날 알림(edu_remind_cron.sql)과 **같은 비밀 이름**(edu_remind_service_key)을 읽는다:
--   둘 다 같은 api 의 같은 문(x-internal-key = 그 프로젝트 api 가 보는 SUPABASE_SERVICE_ROLE_KEY)을 지나므로 키가 하나면 된다(로테이션도 한 번).
--   · 그 이름이 Vault 에 없으면 이 파일은 아무것도 걸지 않고 멈춘다(raise exception · 다시 돌려도 안전) — 먼저 edu_remind_cron.sql 머리말대로 넣는다.
-- 주소(YOUR_API_URL)는 자리표다 — 돌릴 때 그 프로젝트의 api 주소로 바꾼 사본으로 돌린다(키가 아니라 비밀은 아니다 · 박아 두지 않는 것은
--   개발에 돌렸다가 운영 api 를 부르는 일이 없게). 운영 https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api — 꼴이 아니면 멈춘다.
-- 다시 돌려도 안전 — 같은 이름의 작업을 먼저 지우고(unschedule) 다시 건다(schedule).
-- pg_cron·pg_net 이 없는 DB(개발 ktpwthwqzgcqcrmsafdo)에서는 걸지 않고 알리기만 한다 — 그때는 api 의 internalDutyRemind 를 서비스 키로 손으로
--   부르면 같은 일을 한다(tests/duty-notify.dev.sh).
-- 작업 이름 duty-remind — 다른 작업(daily-push-5~8 · weekly-verse-push · weekly-report-email · board-reports-purge ·
--   sermon-answer-reports-purge · ministry-phone-expire · edu-first-day-remind …)과 겹치지 않는다.
do $$
declare
  v_url text := 'YOUR_API_URL';
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') or not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'pg_cron·pg_net 이 없어 전날 알림 작업(duty-remind)을 걸지 않았습니다 — api internalDutyRemind 를 서비스 키로 부르면 같은 일을 합니다.';
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
    raise exception 'Vault 에 edu_remind_service_key 가 없습니다(또는 비었습니다) — edu_remind_cron.sql 머리말대로 먼저 넣으세요(아무것도 걸지 않았습니다)';
  end if;
  perform cron.unschedule(jobid) from cron.job where jobname = 'duty-remind';
  perform cron.schedule('duty-remind', '0 10 * * *',   -- 10:00 UTC = 19:00 KST(매일)
    format($cmd$select net.http_post(
    url := %L,
    headers := jsonb_build_object('Content-Type','application/json',
      'x-internal-key',(select decrypted_secret from vault.decrypted_secrets where name = 'edu_remind_service_key')),
    body := jsonb_build_object('action','internalDutyRemind')
  )$cmd$, v_url));
end $$;

-- 확인(키는 찍지 않는다 — 명령에 키가 없어야 한다):
--   select jobname, schedule, active, position('vault.decrypted_secrets' in command) > 0 as reads_vault from cron.job where jobname = 'duty-remind';
-- 지난 실행:  select status, return_message, start_time from cron.job_run_details
--               where jobid = (select jobid from cron.job where jobname = 'duty-remind') order by start_time desc limit 5;
-- 보낸 기록:  select sent_at, mode, sent, failed, total, ok from push_log where mode = 'duty-remind' order by sent_at desc limit 10;
--            (내일 당번인 분이 없으면 push_log 줄도 없다 — api 응답 {ok, day, rows:0, sent:0})
-- 해제:      select cron.unschedule('duty-remind');
