-- 교육 개강 전날 알림(교육신청 4단계 · 2026-10-05 · 계획 docs/superpowers/plans/2026-10-05-education-stage4.md A) — pg_cron + pg_net
-- 매일 10:00 UTC = 19:00 KST 에 성경암송 api 의 내부 액션 internalEduRemind 를 부른다 → 내일(한국)이 첫 날인 강좌의 확정자(앱 계정)에게 한 번.
-- 무엇을 고르고 무엇을 보내는지는 api(supabase/functions/api/index.ts internalEduRemind) 한 곳 — 여기는 부르기만 한다.
--
-- ⚠️ 이 저장소는 공개(public)입니다 — 아래 두 자리(YOUR_API_URL · YOUR_SERVICE_ROLE_KEY)는 **실행할 때만** 바꾼 사본(저장소 밖)으로 돌리고,
--    바꾼 값을 절대 커밋하지 마세요(이 파일은 예시 그대로 유지 — push_cron*.sql·weekly_verse_push_cron.sql 의 'pw' 와 같은 방식).
--    · YOUR_API_URL          = 그 프로젝트의 api 주소 — 운영 https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api
--      (주소를 박아 두지 않는다 — 개발에 돌렸다가 운영 api 를 부르는 일이 없게)
--    · YOUR_SERVICE_ROLE_KEY = 그 프로젝트 **api 함수가 보는** SUPABASE_SERVICE_ROLE_KEY 와 같은 값(api 가 x-internal-key 를 그것과 견준다 —
--      internalMinistryNotify 와 같은 문). 맞는지는 `supabase secrets list --project-ref <ref>` 의 SUPABASE_SERVICE_ROLE_KEY 값(sha256)과
--      그 키의 sha256 을 견주어 본다(키를 화면에 찍지 않는다). 키를 바꾸면(로테이션) 이 파일을 새 키로 다시 돌린다.
--    ⚠️ 두 자리를 안 바꾸고 돌리면 아무것도 걸지 않고 멈춘다(raise exception · 다시 돌려도 안전).
-- 다시 돌려도 안전 — 같은 이름의 작업을 먼저 지우고(unschedule) 다시 건다(schedule).
-- pg_cron·pg_net 이 없는 DB(개발 ktpwthwqzgcqcrmsafdo)에서는 걸지 않고 알리기만 한다(board_reports.sql 과 같다) —
--    그때는 api 의 internalEduRemind 를 서비스 키로 손으로 부르면 같은 일을 한다(tests/edu-notify.dev.sh).
-- 작업 이름 edu-first-day-remind — 다른 작업(daily-push-5~8 · weekly-verse-push · weekly-report-email · board-reports-purge ·
--    sermon-answer-reports-purge · ministry-phone-expire …)과 겹치지 않는다. 저녁 알림(push_evening.sql · EVENING_LIVE)과는 무관하다.
do $$
declare
  v_url text := 'YOUR_API_URL';
  v_key text := 'YOUR_SERVICE_ROLE_KEY';
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') or not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'pg_cron·pg_net 이 없어 개강 전날 알림 작업(edu-first-day-remind)을 걸지 않았습니다 — api internalEduRemind 를 서비스 키로 부르면 같은 일을 합니다.';
    return;
  end if;
  if v_url !~ '^https://[a-z0-9]{20}\.supabase\.co/functions/v1/api$' then
    raise exception 'YOUR_API_URL 을 그 프로젝트의 api 주소로 바꾼 사본으로 돌리세요(아무것도 걸지 않았습니다)';
  end if;
  if v_key = 'YOUR_SERVICE_ROLE_KEY' or length(v_key) < 30 or v_key ~ '\s' then
    raise exception 'YOUR_SERVICE_ROLE_KEY 를 그 프로젝트 api 의 서비스 키로 바꾼 사본으로 돌리세요(아무것도 걸지 않았습니다)';
  end if;
  perform cron.unschedule(jobid) from cron.job where jobname = 'edu-first-day-remind';
  perform cron.schedule('edu-first-day-remind', '0 10 * * *',   -- 10:00 UTC = 19:00 KST(매일)
    format($cmd$select net.http_post(
    url := %L,
    headers := jsonb_build_object('Content-Type','application/json','x-internal-key',%L),
    body := jsonb_build_object('action','internalEduRemind')
  )$cmd$, v_url, v_key));
end $$;

-- 확인(키는 찍지 않는다):  select jobname, schedule, active from cron.job where jobname = 'edu-first-day-remind';
-- 지난 실행:  select status, return_message, start_time from cron.job_run_details
--               where jobid = (select jobid from cron.job where jobname = 'edu-first-day-remind') order by start_time desc limit 5;
-- 보낸 기록:  select sent_at, mode, sent, failed, total, ok from push_log where mode = 'edu-first-day' order by sent_at desc limit 10;
--            (내일 첫 날인 강좌가 없으면 push_log 줄도 없다 — api 응답 {ok, day, courses:0, sent:0})
-- 해제:      select cron.unschedule('edu-first-day-remind');
