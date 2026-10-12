-- 감시의 감시 — GitHub 60일 멈춤 대비(2026-10-12 · docs/notes/monitor-guard.md) — pg_cron + pg_net
-- GitHub 은 공개 저장소에 60일 동안 커밋이 없으면 예약 워크플로(monitor.yml·security-check.yml)를 저절로 끈다 — 경보를 보내는 쪽이 꺼지므로
--   텔레그램이 **소리 없이** 멈춘다. 그래서 GitHub 과 상관없는 Supabase 크론이 매일 03:00 UTC = 12:00 KST 에 api 의 내부 액션 internalMonitorWatch 를 부른다:
--   monitor 가 GitHub 에서 불릴 때(src "gha") 남긴 흔적 app_config monitorRun 이 36시간을 넘었으면 Resend 메일(REPORT_RECIPIENTS — 주간 리포트와 같은 분)로 알린다.
--   (monitor 는 07:12 KST 에 돈다 — 낮 12시면 평소 5시간 전 흔적이고, 하루를 통째로 거르면 이틀째 낮에 알린다. GitHub 이 한 번 빼먹는 것으로는 울리지 않는다.)
--   거꾸로 monitor 는 이 크론이 남기는 흔적 monitorWatchRun 이 36시간을 넘으면 텔레그램으로 알린다 — 둘이 서로를 본다.
-- 무엇을 보고 무엇을 보내는지는 api(supabase/functions/api/index.ts 「감시의 감시」) 한 곳 — 여기는 부르기만 한다.
--
-- ⚠️ 이 저장소는 공개(public)입니다 — 키를 이 파일(이나 그 사본)에 적지 않는다.
-- 키는 Vault 에 둔다 — 교육·당번 전날 알림(edu_remind_cron.sql · duty_remind_cron.sql)과 **같은 비밀 이름**(edu_remind_service_key):
--   셋 다 같은 api 의 같은 문(x-internal-key = 그 프로젝트 api 가 보는 SUPABASE_SERVICE_ROLE_KEY)을 지나므로 키가 하나면 된다(로테이션도 한 번).
--   그 이름이 Vault 에 없으면 이 파일은 아무것도 걸지 않고 멈춘다(raise exception · 다시 돌려도 안전).
-- 주소(YOUR_API_URL)는 자리표다 — 돌릴 때 그 프로젝트의 api 주소로 바꾼 사본으로 돌린다(키가 아니라 비밀은 아니다 · 박아 두지 않는 것은
--   개발에 돌렸다가 운영 api 를 부르는 일이 없게). 운영 https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api — 꼴이 아니면 멈춘다.
-- 다시 돌려도 안전 — 같은 이름의 작업을 먼저 지우고(unschedule) 다시 건다(schedule).
-- pg_cron·pg_net 이 없는 DB(개발 ktpwthwqzgcqcrmsafdo)에서는 걸지 않고 알리기만 한다 — 그때는 api 의 internalMonitorWatch 를 서비스 키로 손으로
--   부르면 같은 일을 한다(tests/monitor-watch.dev.sh — dry 로 메일 없이).
-- ⚠️ 차례(운영): api 를 먼저 올리고 → GitHub 의 monitor 가 src "gha" 로 한 번 돈 뒤(흔적 monitorRun 이 생긴 뒤) → 이 파일.
--   거꾸로 걸어도 헛경보는 없다(흔적이 없으면 「모른다」 — 알리지 않는다). 다만 그동안은 지키는 것이 없다.
-- 작업 이름 monitor-watch — 다른 작업(daily-push-5~8 · weekly-verse-push · weekly-report-email · duty-remind · edu-first-day-remind …)과 겹치지 않는다.
do $$
declare
  v_url text := 'YOUR_API_URL';
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') or not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'pg_cron·pg_net 이 없어 감시 작업(monitor-watch)을 걸지 않았습니다 — api internalMonitorWatch 를 서비스 키로 부르면 같은 일을 합니다.';
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
  perform cron.unschedule(jobid) from cron.job where jobname = 'monitor-watch';
  perform cron.schedule('monitor-watch', '0 3 * * *',   -- 03:00 UTC = 12:00 KST(매일)
    format($cmd$select net.http_post(
    url := %L,
    headers := jsonb_build_object('Content-Type','application/json',
      'x-internal-key',(select decrypted_secret from vault.decrypted_secrets where name = 'edu_remind_service_key')),
    body := jsonb_build_object('action','internalMonitorWatch')
  )$cmd$, v_url));
end $$;

-- 확인(키는 찍지 않는다 — 명령에 키가 없어야 한다):
--   select jobname, schedule, active, position('vault.decrypted_secrets' in command) > 0 as reads_vault from cron.job where jobname = 'monitor-watch';
-- 건 날 한 번 손으로(같은 길 — 크론은 net.http_post 를 넣기만 하면 succeeded 라, 주소·액션 이름·키가 틀린 것은 응답을 봐야 안다):
--   select net.http_post(url := '<운영 api 주소>',
--     headers := jsonb_build_object('Content-Type','application/json',
--       'x-internal-key',(select decrypted_secret from vault.decrypted_secrets where name = 'edu_remind_service_key')),
--     body := jsonb_build_object('action','internalMonitorWatch','dry',true));          -- 돌려받은 번호를 아래에
--   select status_code, content from net._http_response where id = <번호>;            -- {"ok":true,"state":"ok",...} 이어야(unauthorized 면 키)
-- 돌았나:    select value from app_config where key in ('monitorRun','monitorWatchRun');   -- {at, state[, ageH, mailed]}
-- 해제:      select cron.unschedule('monitor-watch');   delete from app_config where key = 'monitorWatchRun';   -- 흔적도 지운다(안 지우면 monitor 가 「돌지 않았다」고 알린다)
