-- 매일 정해진 시각에 전체 구독자에게 암송 알림 발송 (pg_cron + pg_net)
-- 준비: 대시보드 > Database > Extensions 에서 pg_cron, pg_net 활성화 후 실행.
-- 시각: 아래는 매일 07:00 KST(=22:00 UTC). 다른 시각은 cron 식(UTC 기준)만 바꾸세요.

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
      'pw','Godislove',
      'latest', true,                          -- 본문 = 이번 주 최신 말씀(자동)
      'title','오직 성경, 말씀이 답이다!',       -- 제목 고정
      'url','https://gocheok.onlybible.kr/'
    )
  );
  $$
);

-- 확인:  select * from cron.job;
-- 해제:  select cron.unschedule('daily-memorize-push');
