-- 매일 정해진 시각에 전체 구독자에게 암송 알림 발송 (pg_cron + pg_net)
-- 준비: 대시보드 > Database > Extensions 에서 pg_cron, pg_net 활성화 후 실행.
-- 시각: 아래는 매일 07:00 KST(=22:00 UTC). 다른 시각은 cron 식(UTC 기준)만 바꾸세요.
-- ⚠️ 이 저장소는 공개(public)입니다 — 'pw' 값을 실제 ADMIN_SECRET으로 바꿔서 실행하고,
--    바꾼 값을 절대 커밋하지 마세요(이 파일은 예시 그대로 유지).

select cron.schedule(
  'daily-memorize-push',
  '0 22 * * *',   -- UTC 22:00 = KST 07:00
  $$
  select net.http_post(
    url := 'https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'apikey','sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-',
      'Authorization','Bearer sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-'
    ),
    body := jsonb_build_object(
      'action','sendPush',
      'pw','YOUR_ADMIN_SECRET',
      'latest', true,                          -- 본문 = 이번 주 최신 말씀(자동)
      'title','오직 성경, 말씀이 답이다!',       -- 제목 고정
      'url','https://gocheok.onlybible.kr/'
    )
  );
  $$
);

-- 확인:  select * from cron.job;
-- 해제:  select cron.unschedule('daily-memorize-push');
