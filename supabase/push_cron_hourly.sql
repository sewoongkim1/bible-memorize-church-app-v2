-- ⚠️⚠️ 옛 방식(2026-10-12 까지) — 운영 · 개발 어디에서도 다시 돌리지 말 것. 기록으로만 남긴다.
--   이 작업들은 이제 supabase/push_report_cron.sql 이 Vault 의 내부 키로 건다(명령에 관리자 암호가 없다 · 작업 번호 · 기록 그대로).
--   아래 옛 내용을 되살려 돌리면 같은 이름의 작업 명령이 덮인다 — 진짜 암호를 넣었으면 평문 암호가 cron.job · 실행 기록 · 백업에 되살아나고,
--   자리표 그대로면 api 가 unauthorized 를 준다(크론 기록은 그래도 succeeded).
--   그래서 아래 실행 문장은 모두 주석으로 바꿨고, 맨 앞 한 줄이 일부러 멈춘다(어느 실행기로 돌려도 아무것도 걸리지 않는다).
--   ⚠️ 아래 unschedule('daily-memorize-push') 줄은 그 작업이 이제 없어 오류가 난다 — 그 줄만 지우고 나머지를 되살려 돌리면
--      daily-push-5~8(작업 8~11)의 Vault 명령이 관리자 암호 명령으로 덮인다(아침 알림은 07:12 monitor 가 잡지만 05 · 06 · 07시 몫은 놓친 뒤다).
do $$ begin raise exception '옛 방식 — supabase/push_report_cron.sql 을 쓰세요(아무것도 바꾸지 않았습니다)'; end $$;
--
-- ↓ 옛 내용(기록 — 실행 문장은 「-- 」 를 붙여 막았다)
-- 시간대별 아침 알림 발송 (구독자가 고른 5·6·7·8시에만)
-- push_hour.sql(구독에 hour 컬럼)을 먼저 실행한 뒤 이 파일을 실행하세요.
-- KST = UTC+9 → 5시=20:00, 6시=21:00, 7시=22:00, 8시=23:00 (UTC)
-- ⚠️ 이 저장소는 공개(public)입니다 — 'pw' 값을 실제 ADMIN_SECRET으로 바꿔서 실행하고,
--    바꾼 값을 절대 커밋하지 마세요(이 파일은 예시 그대로 유지).

-- 기존 단일 7시 발송 잡 해제(있으면)
-- select cron.unschedule('daily-memorize-push');

-- 공통 발송(action=sendPush, latest=true, 각 시간 hour 필터)
-- select cron.schedule('daily-push-5', '0 20 * * *', $$
--   select net.http_post(
--     url := 'https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api',
--     headers := jsonb_build_object('Content-Type','application/json',
--       'apikey','sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-',
--       'Authorization','Bearer sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-'),
--     body := jsonb_build_object('action','sendPush','pw','YOUR_ADMIN_SECRET',
--       'latest', true, 'title','오직 성경, 말씀이 답이다!',
--       'url','https://gocheok.onlybible.kr/', 'hour', 5)
--   ); $$);

-- select cron.schedule('daily-push-6', '0 21 * * *', $$
--   select net.http_post(
--     url := 'https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api',
--     headers := jsonb_build_object('Content-Type','application/json',
--       'apikey','sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-',
--       'Authorization','Bearer sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-'),
--     body := jsonb_build_object('action','sendPush','pw','YOUR_ADMIN_SECRET',
--       'latest', true, 'title','오직 성경, 말씀이 답이다!',
--       'url','https://gocheok.onlybible.kr/', 'hour', 6)
--   ); $$);

-- select cron.schedule('daily-push-7', '0 22 * * *', $$
--   select net.http_post(
--     url := 'https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api',
--     headers := jsonb_build_object('Content-Type','application/json',
--       'apikey','sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-',
--       'Authorization','Bearer sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-'),
--     body := jsonb_build_object('action','sendPush','pw','YOUR_ADMIN_SECRET',
--       'latest', true, 'title','오직 성경, 말씀이 답이다!',
--       'url','https://gocheok.onlybible.kr/', 'hour', 7)
--   ); $$);

-- select cron.schedule('daily-push-8', '0 23 * * *', $$
--   select net.http_post(
--     url := 'https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api',
--     headers := jsonb_build_object('Content-Type','application/json',
--       'apikey','sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-',
--       'Authorization','Bearer sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-'),
--     body := jsonb_build_object('action','sendPush','pw','YOUR_ADMIN_SECRET',
--       'latest', true, 'title','오직 성경, 말씀이 답이다!',
--       'url','https://gocheok.onlybible.kr/', 'hour', 8)
--   ); $$);

-- 확인:  select jobname, schedule, active from cron.job order by jobname;
