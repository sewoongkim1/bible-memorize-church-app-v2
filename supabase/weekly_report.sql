-- 주간 리포트 이메일 자동 발송 (pg_cron + pg_net)
-- 준비: Database > Extensions 에서 pg_cron, pg_net 활성화.
-- 시크릿(대시보드 > Edge Functions > Secrets, 또는 supabase secrets set):
--   RESEND_API_KEY   : Resend API 키 (re_ 로 시작)
--   REPORT_RECIPIENTS: 받는사람 이메일(쉼표로 여러 명)  예) a@x.com, b@y.com
--   REPORT_FROM      : 보내는 주소  예) 성경암송 리포트 <report@onlybible.kr>
--                      (도메인 인증 전에는 onboarding@resend.dev 사용 — 본인에게만 발송 가능)
--
-- 발송 시각: 매주 금요일 08:00 KST = 목요일 23:00 UTC → '0 23 * * 4'
--   ⚠️ UTC 요일로 적어야 한다. '* * 5'(금 UTC)로 두면 한국시간 토요일에 나간다(실제로 그렇게 어긋난 적 있음).
--   집계 범위가 '전주 금~이번주 목'이므로 금요일 발송이 맞다.
-- ⚠️ 이 저장소는 공개(public)입니다 — 'pw' 값을 실제 ADMIN_SECRET으로 바꿔서 실행하고,
--    바꾼 값을 절대 커밋하지 마세요(이 파일은 예시 그대로 유지).

select cron.schedule(
  'weekly-report-email',
  '0 23 * * 4',   -- 목 23:00 UTC = 금 08:00 KST
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
      'pw','YOUR_ADMIN_SECRET',
      'send', true            -- 실제 이메일 발송
    )
  );
  $$
);

-- 확인:  select jobname, schedule, active from cron.job;
-- 해제:  select cron.unschedule('weekly-report-email');
