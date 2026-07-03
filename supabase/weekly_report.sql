-- 주간 리포트 이메일 자동 발송 (pg_cron + pg_net)
-- 준비: Database > Extensions 에서 pg_cron, pg_net 활성화.
-- 시크릿(대시보드 > Edge Functions > Secrets, 또는 supabase secrets set):
--   RESEND_API_KEY   : Resend API 키 (re_ 로 시작)
--   REPORT_RECIPIENTS: 받는사람 이메일(쉼표로 여러 명)  예) a@x.com, b@y.com
--   REPORT_FROM      : 보내는 주소  예) 성경암송 리포트 <report@onlybible.kr>
--                      (도메인 인증 전에는 onboarding@resend.dev 사용 — 본인에게만 발송 가능)
--
-- 발송 시각: 매주 토요일 08:00 KST = 금요일 23:00 UTC → '0 23 * * 5'

select cron.schedule(
  'weekly-report-email',
  '0 23 * * 5',   -- 금 23:00 UTC = 토 08:00 KST
  $$
  select net.http_post(
    url := 'https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'apikey','sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-',
      'Authorization','Bearer sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-'
    ),
    body := jsonb_build_object(
      'action','weeklyReport',
      'pw','Godislove',
      'send', true            -- 실제 이메일 발송
    )
  );
  $$
);

-- 확인:  select jobname, schedule, active from cron.job;
-- 해제:  select cron.unschedule('weekly-report-email');
