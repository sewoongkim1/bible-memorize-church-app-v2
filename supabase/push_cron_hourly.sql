-- 시간대별 아침 알림 발송 (구독자가 고른 5·6·7·8시에만)
-- push_hour.sql(구독에 hour 컬럼)을 먼저 실행한 뒤 이 파일을 실행하세요.
-- KST = UTC+9 → 5시=20:00, 6시=21:00, 7시=22:00, 8시=23:00 (UTC)

-- 기존 단일 7시 발송 잡 해제(있으면)
select cron.unschedule('daily-memorize-push');

-- 공통 발송(action=sendPush, latest=true, 각 시간 hour 필터)
select cron.schedule('daily-push-5', '0 20 * * *', $$
  select net.http_post(
    url := 'https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api',
    headers := jsonb_build_object('Content-Type','application/json',
      'apikey','sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-',
      'Authorization','Bearer sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-'),
    body := jsonb_build_object('action','sendPush','pw','Godislove',
      'latest', true, 'title','오직 성경, 말씀이 답이다!',
      'url','https://gocheok.onlybible.kr/', 'hour', 5)
  ); $$);

select cron.schedule('daily-push-6', '0 21 * * *', $$
  select net.http_post(
    url := 'https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api',
    headers := jsonb_build_object('Content-Type','application/json',
      'apikey','sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-',
      'Authorization','Bearer sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-'),
    body := jsonb_build_object('action','sendPush','pw','Godislove',
      'latest', true, 'title','오직 성경, 말씀이 답이다!',
      'url','https://gocheok.onlybible.kr/', 'hour', 6)
  ); $$);

select cron.schedule('daily-push-7', '0 22 * * *', $$
  select net.http_post(
    url := 'https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api',
    headers := jsonb_build_object('Content-Type','application/json',
      'apikey','sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-',
      'Authorization','Bearer sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-'),
    body := jsonb_build_object('action','sendPush','pw','Godislove',
      'latest', true, 'title','오직 성경, 말씀이 답이다!',
      'url','https://gocheok.onlybible.kr/', 'hour', 7)
  ); $$);

select cron.schedule('daily-push-8', '0 23 * * *', $$
  select net.http_post(
    url := 'https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api',
    headers := jsonb_build_object('Content-Type','application/json',
      'apikey','sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-',
      'Authorization','Bearer sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-'),
    body := jsonb_build_object('action','sendPush','pw','Godislove',
      'latest', true, 'title','오직 성경, 말씀이 답이다!',
      'url','https://gocheok.onlybible.kr/', 'hour', 8)
  ); $$);

-- 확인:  select jobname, schedule, active from cron.job order by jobname;
