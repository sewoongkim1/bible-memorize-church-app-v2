-- 매주 주일 오전 8시, 전체 구독자에게 '이번주 암송 말씀' 안내 발송 (pg_cron + pg_net)
-- 개인이 고른 알림 시간(daily-push-5~8)과는 별개로, 주일 아침에만 모두에게 1회 보낸다.
-- 이번주 말씀이 아직 등록 전이면(암송말씀은 보통 토요일 오후 등록) 자동으로 skip.
-- 준비: Database > Extensions 에서 pg_cron, pg_net 활성화(이미 돼 있으면 생략).
--
-- 발송 시각: 매주 주일 08:00 KST = 토요일 23:00 UTC → '0 23 * * 6'

select cron.schedule(
  'weekly-verse-push',
  '0 23 * * 6',   -- 토 23:00 UTC = 주일 08:00 KST
  $$
  select net.http_post(
    url := 'https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'apikey','sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-',
      'Authorization','Bearer sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-'
    ),
    body := jsonb_build_object(
      'action','weeklyVersePush',
      'pw','Godislove'
    )
  );
  $$
);

-- 확인:  select jobname, schedule, active from cron.job where jobname='weekly-verse-push';
-- 해제:  select cron.unschedule('weekly-verse-push');
