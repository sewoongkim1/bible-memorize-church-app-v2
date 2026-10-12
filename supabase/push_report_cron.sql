-- 아침 알림 넷 · 주일 말씀 · 주간 리포트 크론을 관리자 암호 없이(Vault 의 내부 키로) — pg_cron + pg_net (2026-10-12)
-- 작업 여섯의 **명령만** 바꾼다. 이름 · 일정 · 작업 번호(jobid) · 켜짐 · 지난 실행 기록 · 본문(pw 칸만 뺀 것)은 그대로다:
--   daily-push-5 · 6 · 7 · 8 — '0 20 · 21 · 22 · 23 * * *' UTC = 05 · 06 · 07 · 08시 KST(매일) → api sendPush {latest, title, url, hour}
--       그 시각을 고른 구독자에게만(오늘의 묵상 + 이번 주 말씀 · push_log mode 'daily')
--   weekly-verse-push   — '0 23 * * 6' UTC = 주일 08시 KST → api weeklyVersePush — 이번 주 말씀을 모두에게 한 번(말씀이 없으면 건너뜀 · push_log 'weekly-verse')
--   weekly-report-email — '0 23 * * 4' UTC = 금요일 08시 KST → api weeklyReport {send} — Resend 메일(집계는 전주 금~이번 주 목)
--     ⚠️ UTC 요일로 적는다 — '* * 5'(금 UTC)면 한국 토요일에 나간다(실제로 어긋난 적 있다).
--     리포트 시크릿(api 쪽 · supabase secrets): RESEND_API_KEY · REPORT_RECIPIENTS(받는 분 · 쉼표로 여럿) · REPORT_FROM(보내는 주소).
-- 무엇을 누구에게 보내는지는 api(supabase/functions/api/index.ts) 한 곳 — 여기는 부르기만 한다.
--   내부 키 길에서는 api 가 본문을 크론의 꼴로 다시 만든다(cronOnly): 제목 · 주소는 api 의 CRON_PUSH_TITLE · CRON_PUSH_URL, 아침 시각은 CRON_PUSH_HOURS(5 · 6 · 7 · 8).
--   ⚠️ 이 파일의 본문(제목 등)만 바꾸면 그대로 나가지 않는다 — api 를 함께 고친다. 아침 시각(작업)을 늘리면 CRON_PUSH_HOURS 도 — 아니면 그 작업은 조용히 bad-args 다.
--
-- 왜: 2026-07 부터 이 여섯의 명령(cron.job.command)에 관리자 암호(ADMIN_SECRET)가 평문으로 들어 있었다 — cron.job 을 읽는 누구나 보고,
--   돌 때마다 cron.job_run_details 와 백업(tools/backup-db.py 의 cron-jobs.json)에 그대로 남았다.
--   이제는 교육 · 당번 전날 알림 · 감시(edu_remind_cron.sql · duty_remind_cron.sql · monitor_watch_cron.sql)처럼 **돌 때마다** Vault 에서
--   이름(edu_remind_service_key)으로 키를 읽어 x-internal-key 머리에 싣는다. 명령에는 키도 암호도 없다.
--   api 는 그 머리가 자기 SUPABASE_SERVICE_ROLE_KEY 와 같고 액션이 INTERNAL_CRON_OK(sendPush · weeklyVersePush · weeklyReport)일 때만 암호 없이 연다.
--
-- ⚠️ 차례 — **api 가 먼저.** INTERNAL_CRON_OK · cronOnly 가 든 api 를 그 프로젝트에 올리고, 아래 ① 손 부름이 통과한 뒤에 이 파일을 돌린다.
--   거꾸로면 api 가 unauthorized 를 준다 — 그래도 크론 기록은 succeeded 다(net.http_post 는 요청을 넣기만 한다).
--   아침 알림은 07:12 monitor 가 잡지만(그때는 05 · 06 · 07시 몫을 이미 놓친 뒤) 주일 말씀 · 주간 리포트는 아무 경보 없이 멈춘다.
-- ⚠️ 단계로 옮긴다(v_only) — 처음엔 받는 분이 없는 daily-push-5 하나만 → 다음 날 05:00 실행을 확인한 뒤 나머지.
--   주일 말씀(weekly-verse-push)은 monitor 가 보지 않으므로 맨 나중에, 확인할 사람을 정해 두고 옮긴다.
-- ⚠️ 늘 두 번 돌린다 — v_apply 가 false(이 파일 그대로)면 모든 확인과 바꾸기까지 해 본 뒤 일부러 멈춰 통째로 무른다:
--   「점검만 — 대상 N 개(…) 모두 통과…」 오류가 나오면 통과다. 그다음 사본에서 v_apply 를 true 로 바꿔 한 번 더 돌린다(그때는 아무 글도 안 나오는 것이 성공).
-- ⚠️ 지우고 다시 걸지(unschedule → schedule) 않는다 — 작업 번호가 바뀌면 monitor 의 cron_last_run('weekly-report-email')이 지난 기록을 잃어
--   다음 금요일까지 날마다 「주간 리포트 메일 실행 기록을 찾을 수 없습니다」를 보내고, 아래 되돌리기 ㉡ 도 못 쓴다. cron.alter_job 으로 명령만 바꾼다.
-- ⚠️ 이 저장소는 공개(public)입니다 — 키 · 암호를 이 파일(이나 그 사본)에 적지 않는다.
-- 키 = Vault 의 edu_remind_service_key(= 그 프로젝트 api 가 보는 SUPABASE_SERVICE_ROLE_KEY · 넣는 법 · 바꾸는 법은 edu_remind_cron.sql 머리말).
--   ⚠️ 이 이름을 이제 **작업 아홉**이 읽는다(이 여섯 + edu-first-day-remind · duty-remind · monitor-watch). 지우거나 틀린 값으로 바꾸면
--      아침 알림까지 한꺼번에 조용히 멈춘다(크론은 succeeded · api 는 unauthorized). 서비스 키를 바꿀 때는 Vault 값을 같은 날 바꾸고
--      아래 ① 손 부름을 한 번 다시 돌린다(작업은 다시 걸 필요 없다 · docs/notes/security-check.md 「서비스 키를 바꿀 때」).
-- 주소(YOUR_API_URL)는 자리표다 — 돌릴 때 그 프로젝트의 api 주소로 바꾼 사본으로 돌린다(사본은 저장소 밖에 · 키가 아니라 비밀은 아니다).
--   운영 https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api — 꼴이 아니거나 지금 작업이 부르는 주소와 다르면 멈춘다.
-- 돌리는 곳: 저장소 밖 link 폴더(운영 ~/.gocheok-backup/supa-prod — supabase/.temp/project-ref 를 먼저 본다)에서
--   supabase db query --linked --file <사본>   ← 파일로 넘긴다(본문의 한글 제목이 명령줄에서 깨지지 않게). 접속 역할이 작업 주인(postgres)이어야 한다.
--   ⚠️ psql -f 로 돌리지 말 것(ON_ERROR_STOP 없이는 멈춘 뒤에도 다음 문장으로 간다) · 각 작업이 도는 시각의 앞뒤 5분은 피한다.
-- 한 덩어리(do 블록)라 하나라도 막히면 대상 모두 그대로다. 다시 돌려도 같은 결과다(이미 바뀐 명령을 같은 명령으로 다시 쓴다).
-- 걸기 전에 보는 것(하나라도 어긋나면 아무것도 바꾸지 않고 멈춘다 · 값은 어디에도 찍지 않는다):
--   이름마다 작업이 하나 · 일정이 아래 표와 같다 · 지금 명령의 주소가 이 사본의 주소와 같다 ·
--   지금 명령의 본문에서 pw 칸만 뺀 것이 아래 표의 본문과 같다 · 새 명령이 계획된다(explain — 보내지 않는다).
--   (2026-10-12 밤 운영 여섯 명령에 「본문 꺼내기 · pw 걷기 · 견주기」를 불리언으로만 미리 돌려 보았다 — 여섯 모두 맞았다.)
-- 작업이 없으면 멈춘다(누가 일부러 걷은 것을 되살리지 않는다). 새 프로젝트로 되살릴 때만 사본에서 v_create 를 true 로 — 없는 작업을 새로 건다.
-- pg_cron · pg_net 이 없는 DB(개발 ktpwthwqzgcqcrmsafdo)에서는 아무것도 하지 않고 알리기만 한다(Vault 도 보지 않는다) —
--   개발에서는 api 를 서비스 키로 손으로 부르면 같은 일을 한다(tests/push-report-cron.dev.sh).
-- 이 파일이 대신하는 옛 파일(다시 돌리지 말 것 — 실행 문장은 모두 주석이고 맨 앞에서 멈춘다): push_cron.sql · push_cron_hourly.sql · weekly_verse_push_cron.sql · weekly_report.sql
do $$
declare
  v_url    text    := 'YOUR_API_URL';
  v_apply  boolean := false;   -- false = 점검만(모든 확인과 바꾸기를 해 본 뒤 일부러 멈춰 무른다) · 사본에서 true 로 바꿔 다시 돌릴 때만 바뀐다
  v_only   text[]  := null;    -- null = 여섯 모두 · 단계로 옮길 때 사본에서 array['daily-push-5'] 처럼 좁힌다
  v_create boolean := false;   -- 새 프로젝트로 되살릴 때만 사본에서 true(없는 작업을 새로 건다)
  v_all    constant text[] := array['daily-push-5','daily-push-6','daily-push-7','daily-push-8','weekly-verse-push','weekly-report-email'];
  v_tpl    constant text := $cmd$select net.http_post(
    url := %L,
    headers := jsonb_build_object('Content-Type','application/json',
      'x-internal-key',(select decrypted_secret from vault.decrypted_secrets where name = 'edu_remind_service_key')),
    body := %s
  )$cmd$;
  v_want     text[];
  v_done     int := 0;
  r          record;
  v_n        int;
  v_id       bigint;
  v_sched    text;
  v_cur      text;
  v_old      text;
  v_old_body jsonb;
  v_new_body jsonb;
  v_cmd      text;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') or not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'pg_cron·pg_net 이 없어 아침 알림·주일 말씀·주간 리포트 작업을 바꾸지 않았습니다 — api 를 서비스 키로 부르면 같은 일을 합니다.';
    return;
  end if;
  if v_url !~ '^https://[a-z0-9]{20}\.supabase\.co/functions/v1/api$' then
    raise exception 'YOUR_API_URL 을 그 프로젝트의 api 주소로 바꾼 사본으로 돌리세요(아무것도 바꾸지 않았습니다)';
  end if;
  if v_only is not null and (cardinality(v_only) = 0 or not (v_only <@ v_all)) then
    raise exception 'v_only 에는 이 파일의 작업 이름만 적습니다(%) — 아무것도 바꾸지 않았습니다', array_to_string(v_all, ' · ');
  end if;
  v_want := array(select distinct x from unnest(coalesce(v_only, v_all)) as x);
  if not exists (select 1 from pg_extension where extname = 'supabase_vault') then
    raise exception 'Vault(supabase_vault)가 없어 키를 둘 곳이 없습니다(아무것도 바꾸지 않았습니다)';
  end if;
  -- 키가 Vault 에 그 이름으로 있는지 · 빈 값·자리표 그대로 넣은 것은 막는다(길이·빈칸만 본다 · 값은 어디에도 찍지 않는다)
  if not exists (select 1 from vault.decrypted_secrets where name = 'edu_remind_service_key'
                   and length(coalesce(decrypted_secret, '')) >= 30 and decrypted_secret !~ '\s') then
    raise exception 'Vault 에 edu_remind_service_key 가 없습니다(또는 비었습니다) — edu_remind_cron.sql 머리말대로 먼저 넣으세요(아무것도 바꾸지 않았습니다)';
  end if;
  for r in
    select * from (values
      ('daily-push-5',        '0 20 * * *', $b$jsonb_build_object('action','sendPush','latest',true,'title','오직 성경, 말씀이 답이다!','url','https://gocheok.onlybible.kr/','hour',5)$b$),
      ('daily-push-6',        '0 21 * * *', $b$jsonb_build_object('action','sendPush','latest',true,'title','오직 성경, 말씀이 답이다!','url','https://gocheok.onlybible.kr/','hour',6)$b$),
      ('daily-push-7',        '0 22 * * *', $b$jsonb_build_object('action','sendPush','latest',true,'title','오직 성경, 말씀이 답이다!','url','https://gocheok.onlybible.kr/','hour',7)$b$),
      ('daily-push-8',        '0 23 * * *', $b$jsonb_build_object('action','sendPush','latest',true,'title','오직 성경, 말씀이 답이다!','url','https://gocheok.onlybible.kr/','hour',8)$b$),
      ('weekly-verse-push',   '0 23 * * 6', $b$jsonb_build_object('action','weeklyVersePush')$b$),
      ('weekly-report-email', '0 23 * * 4', $b$jsonb_build_object('action','weeklyReport','send',true)$b$)
    ) as t(jobname, sched, body)
    where t.jobname = any(v_want)
  loop
    v_cmd := format(v_tpl, v_url, r.body);
    select count(*), min(jobid) into v_n, v_id from cron.job where jobname = r.jobname;
    if v_n > 1 then
      raise exception '작업 % 이 % 개입니다(하나여야) — 아무것도 바꾸지 않았습니다', r.jobname, v_n;
    end if;
    if v_n = 0 then
      if not v_create then
        raise exception '작업 % 이 없습니다 — 새 프로젝트로 되살리는 중이면 사본에서 v_create 를 true 로(아무것도 바꾸지 않았습니다)', r.jobname;
      end if;
      execute 'explain ' || v_cmd;   -- 계획만 세운다(보내지 않는다)
      perform cron.schedule(r.jobname, r.sched, v_cmd);
      v_done := v_done + 1;
      continue;
    end if;
    select schedule, command into v_sched, v_cur from cron.job where jobid = v_id;
    if v_sched is distinct from r.sched then
      raise exception '작업 % 의 일정(%)이 이 파일(%)과 다릅니다 — 누가 바꿨는지 먼저 보세요(아무것도 바꾸지 않았습니다)', r.jobname, v_sched, r.sched;
    end if;
    if position(quote_literal(v_url) in v_cur) = 0 then
      raise exception '작업 % 이 이 사본과 다른 주소를 부릅니다 — 다른 프로젝트의 사본인지 보세요(아무것도 바꾸지 않았습니다)', r.jobname;
    end if;
    -- 지금 본문에서 pw 칸을 글자로 먼저 걷고 계산해 이 파일의 본문과 견준다(암호는 계산에도 오류 글에도 실리지 않는다)
    v_old := (regexp_match(v_cur, 'body\s*:=\s*(jsonb_build_object\((?:[^()]|\([^()]*\))*\))'))[1];
    if v_old is null then
      raise exception '작업 % 의 지금 명령에서 본문을 찾지 못했습니다(아무것도 바꾸지 않았습니다)', r.jobname;
    end if;
    v_old := regexp_replace(v_old, '\s*,\s*''pw''\s*,\s*''[^'']*''', '', 'g');
    if v_old ~ '''pw''' then
      raise exception '작업 % 의 지금 본문에서 pw 칸을 걷지 못했습니다(아무것도 바꾸지 않았습니다)', r.jobname;
    end if;
    begin
      execute 'select ' || v_old into v_old_body;
    exception when others then
      raise exception '작업 % 의 지금 본문을 계산하지 못했습니다(아무것도 바꾸지 않았습니다)', r.jobname;
    end;
    execute 'select ' || r.body into v_new_body;
    if v_old_body is distinct from v_new_body then
      raise exception '작업 % 의 지금 본문(pw 뺀 것)이 이 파일의 본문과 다릅니다 — 누가 바꿨는지 먼저 보세요(아무것도 바꾸지 않았습니다)', r.jobname;
    end if;
    execute 'explain ' || v_cmd;   -- 계획만 세운다(보내지 않는다) — 글자 · 이름이 틀렸으면 여기서 멈춘다
    perform cron.alter_job(job_id := v_id, command := v_cmd);
    if (select command from cron.job where jobid = v_id) is distinct from v_cmd then
      raise exception '작업 % 의 명령이 바뀌지 않았습니다(아무것도 바꾸지 않았습니다)', r.jobname;
    end if;
    v_done := v_done + 1;
  end loop;
  if v_done <> cardinality(v_want) then
    raise exception '대상 % 개 가운데 % 개만 돌았습니다(아무것도 바꾸지 않았습니다)', cardinality(v_want), v_done;
  end if;
  -- 끝 확인 — 대상 모두 암호 · 키 모양 없이, 이 주소로, 돌 때 Vault 를 읽어 x-internal-key 에 싣는다(아니면 통째로 무른다)
  if (select count(*) from cron.job
       where jobname = any(v_want)
         and command !~ '''pw'''
         and command !~ 'sb_(publishable|secret)_|eyJ[A-Za-z0-9_-]{10,}\.'
         and position('vault.decrypted_secrets' in command) > 0
         and position('''x-internal-key''' in command) > 0
         and position(quote_literal(v_url) in command) > 0) <> cardinality(v_want) then
    raise exception '바꾼 뒤 확인이 맞지 않습니다(아무것도 바꾸지 않았습니다)';
  end if;
  if not v_apply then
    raise exception '점검만 — 대상 % 개(%) 모두 통과했습니다 · 아무것도 바꾸지 않았습니다(사본에서 v_apply 를 true 로 바꿔 다시 돌리면 바뀝니다)',
      cardinality(v_want), array_to_string(v_want, ' · ');
  end if;
  raise notice '대상 % 개의 명령을 Vault 내부 키로 바꿨습니다(이름 · 일정 · 번호 · 기록 그대로).', cardinality(v_want);
end $$;

-- ① 걸기 전 — 운영 api 가 새 길(내부 키 · 크론의 꼴)을 여는지 크론과 같은 길(net.http_post + Vault 의 키)로 본다. 아무에게도 가지 않는 본문만 쓴다.
--   <운영 api 주소> 를 바꾼 사본 파일을 --file 로 돌리고, 돌려받은 번호 다섯을 아래 읽기에 넣는다:
--   select
--     net.http_post(url := '<운영 api 주소>', timeout_milliseconds := 30000,
--       headers := jsonb_build_object('Content-Type','application/json',
--         'x-internal-key',(select decrypted_secret from vault.decrypted_secrets where name = 'edu_remind_service_key')),
--       body := jsonb_build_object('action','sendPush','hour',99,'user_id','00000000-0000-0000-0000-000000000000','diag',true)) as p_send,
--     net.http_post(url := '<운영 api 주소>', timeout_milliseconds := 30000,
--       headers := jsonb_build_object('Content-Type','application/json',
--         'x-internal-key',(select decrypted_secret from vault.decrypted_secrets where name = 'edu_remind_service_key')),
--       body := jsonb_build_object('action','weeklyVersePush','hour',99,'user_id','00000000-0000-0000-0000-000000000000','diag',true)) as p_verse,
--     net.http_post(url := '<운영 api 주소>', timeout_milliseconds := 120000,
--       headers := jsonb_build_object('Content-Type','application/json',
--         'x-internal-key',(select decrypted_secret from vault.decrypted_secrets where name = 'edu_remind_service_key')),
--       body := jsonb_build_object('action','weeklyReport',
--                                  'from', to_char((now() at time zone 'Asia/Seoul')::date + 7,  'YYYY-MM-DD'),
--                                  'to',   to_char((now() at time zone 'Asia/Seoul')::date + 13, 'YYYY-MM-DD'))) as p_report,
--     net.http_post(url := '<운영 api 주소>', timeout_milliseconds := 30000,
--       headers := jsonb_build_object('Content-Type','application/json',
--         'x-internal-key',(select decrypted_secret from vault.decrypted_secrets where name = 'edu_remind_service_key')),
--       body := jsonb_build_object('action','sendPush','hour',99)) as n_send,          -- 크론의 꼴이 아니다(시각) → bad-args
--     net.http_post(url := '<운영 api 주소>', timeout_milliseconds := 30000,
--       headers := jsonb_build_object('Content-Type','application/json',
--         'x-internal-key',(select decrypted_secret from vault.decrypted_secrets where name = 'edu_remind_service_key')),
--       body := jsonb_build_object('action','weeklyReport','from','x')) as n_report;  -- 크론의 꼴이 아니다(날짜) → bad-args
--   ⚠️ diag 는 보내기를 막지 않는다(다 보낸 뒤 push_log 만 건너뛴다) — p_send · p_verse 의 hour 99 와 없는 user_id 를 **둘 다** 빼지 말 것.
--   ⚠️ weeklyReport 에는 send 를 넣지 않는다(미리보기). 앞으로 올 한 주를 주면 참여자 명단이 비어 응답에 이름이 없다.
--   읽기(응답은 6시간 남는다 · 리포트는 1~2분 걸릴 수 있다 — 아직 비었으면 조금 뒤 다시):
--   select id, status_code, timed_out,
--          case when content ~ '^\s*\{' then content::jsonb->>'ok' end as ok,
--          case when content ~ '^\s*\{' then content::jsonb->>'error' end as err,
--          case when content ~ '^\s*\{' then content::jsonb->>'total' end as total,
--          case when content ~ '^\s*\{' then content::jsonb->>'skipped' end as skipped,
--          case when content ~ '^\s*\{' then content::jsonb->'report'->'summary'->>'cumParticipants' end as cum,
--          case when content ~ '^\s*\{' then (select string_agg(m[1], ' | ')
--               from regexp_matches(content::jsonb->>'html', '<span style="color:#b5891f">([0-9,]+)</span>', 'g') as m) end as week_new
--     from net._http_response where id in (<번호 다섯>) order by id;
--   → p_send ok=true · total=0 / p_verse ok=true · total=0(또는 skipped=true) / p_report ok=true · cum>0 · week_new 가 모두 0 은 아님 /
--     n_send · n_report err=bad-args(크론의 꼴로 좁히는 것이 올라가 있다).
--     unauthorized 면 api 가 아직 옛 판이다 — 이 파일을 돌리지 말 것. cum=0 이고 week_new 가 모두 0 이면 weeklyReport 안쪽 stats 가 표를 못 받은 것.
--   같은 앞 주를 암호 길로도(저장소 밖에서 curl · 암호는 .env 의 PROD_ADMIN_SECRET 을 그 명령 안에서만 읽는다) 불러 견준다:
--     cum 은 「Vault 값 ≤ 암호 값 ≤ Vault 값 + 3」(그사이 첫 활동이 생길 수 있다) · week_new 는 마지막 칸(이번 주)만 빼고 같아야.
--     어긋나면 두 길을 곧바로 잇달아 한 번 더 부른다 — 그래도 다르면 크론을 바꾸지 않는다.
-- ② 바꾼 뒤 — 명령에 암호 · 키가 없고 Vault 를 읽는가 · 번호 · 일정 그대로인가(명령 원문은 고르지 않는다):
--   select jobid, jobname, schedule, active, username,
--          command ~ '''pw'''                                               as has_pw,        -- 옮긴 작업은 false
--          position('vault.decrypted_secrets' in command) > 0               as reads_vault,   -- 옮긴 작업은 true
--          command ~ 'sb_(publishable|secret)_|eyJ[A-Za-z0-9_-]{10,}\.'     as has_key_shape, -- 옮긴 작업은 false
--          position('''x-internal-key''' in command) > 0                    as internal_hdr   -- 옮긴 작업은 true
--     from cron.job
--    where jobname in ('daily-push-5','daily-push-6','daily-push-7','daily-push-8','weekly-verse-push','weekly-report-email')
--    order by jobid;        -- 운영(2026-10-12): 7 weekly-report-email · 8~11 daily-push-5~8 · 13 weekly-verse-push · 모두 active · postgres
--   select * from public.cron_last_run('weekly-report-email');   -- 바꾸기 전과 같은 줄(지난 금요일 실행)이 그대로 나와야(번호가 그대로라는 뜻)
-- ③ 옮긴 작업이 처음 돈 뒤 — 판단은 push_log 와 그 실행의 명령 모양으로 한다(크론의 succeeded 는 「요청을 넣었다」일 뿐):
--   그 실행이 새 명령이었나(명령 원문은 고르지 않는다 · 작업 이름을 바꿔 쓴다):
--   select d.status, to_char(d.start_time at time zone 'Asia/Seoul', 'MM-DD HH24:MI:SS') as kst,
--          d.command !~ '''pw''' as new_cmd, position('vault.decrypted_secrets' in d.command) > 0 as reads_vault
--     from cron.job_run_details d
--    where d.jobid = (select jobid from cron.job where jobname = 'daily-push-5') and d.start_time > now() - interval '1 day'
--    order by d.start_time desc limit 3;
--   api 가 받아 줬나(push_log 에는 시각 칸이 없어 보낸 때로 가른다):
--   select to_char(sent_at at time zone 'Asia/Seoul', 'MM-DD HH24:MI:SS') as kst, mode, sent, failed, total, ok
--     from push_log where sent_at >= (date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul') order by sent_at;
--   → 그 시각의 daily 줄이 있어야 한다. 받는 분이 없는 시각은 total 0 · ok false 가 정상이다(줄이 있다 = api 가 받아 줬다).
--   api 가 무엇이라 답했나(6시간 안에만 · 5초에 끊겨 07시 · 리포트는 timed_out 이 정상 — 옛 명령과 같다):
--   select id, to_char(created at time zone 'Asia/Seoul', 'MM-DD HH24:MI:SS') as kst, status_code, timed_out,
--          case when content ~ '^\s*\{' then content::jsonb->>'ok' end as ok,
--          case when content ~ '^\s*\{' then content::jsonb->>'error' end as err,
--          case when content ~ '^\s*\{' then content::jsonb->>'total' end as total
--     from net._http_response where created > now() - interval '6 hours' order by created;
--   다시 보내는 것(실제 발송)은 그 실행의 응답이 unauthorized · bad-args 일 때뿐이다. timed_out · 500 · 응답 없음이면 1~2분 뒤 push_log 를 다시 보고,
--     그래도 줄이 없으면 Edge Function 로그에서 그 시각 부름이 어떻게 끝났는지 본 뒤에만 보낸다(보내다 끊겼으면 이미 받은 분이 있다).
--   금요일은 받은 메일(누적 참여자 · 주차별 신규가 0 이 아닌가)과 cron_last_run, 주일은 push_log 'weekly-verse' 한 줄 — monitor 는 이 둘의 속을 보지 않는다.
-- 되돌리기(암호를 손으로 다시 넣지 않는 길부터):
--   ㉠ api 가 거절한다(① 이 unauthorized · bad-args · push_log 줄이 없다) → 크론은 그대로 두고 api 를 고쳐 다시 올린다(다음 실행부터 산다).
--      ⚠️ api 를 INTERNAL_CRON_OK 가 없는 옛 판으로 되돌릴 때는 **먼저** ㉡ 로 크론을 옛 명령으로 돌린다 — 아니면 옮긴 작업이 모두 조용히 막힌다.
--   ㉡ 크론을 바꾸기 전 명령으로 — 지난 실행 기록에 남은 각 작업의 마지막 옛 명령을 서버 안에서 그대로 옮긴다(아무것도 찍지 않는다).
--      쓸 수 있는 동안만: 작업 번호가 그대로(alter_job 으로 바꿨으니) · 지난 기록을 아직 가리지 않았다 · **ADMIN_SECRET 을 아직 바꾸지 않았다**
--      (옛 명령에는 그때의 암호가 들어 있다 — 바꾼 뒤에 되살리면 조용히 unauthorized · 크론은 succeeded) · api 의 암호 길(ADMIN_PW_ONLY)이 남아 있다.
--      v_names 로 좁히고, v_go 가 false 면 연습(옮겨 본 뒤 일부러 멈춰 무른다 — 「연습 — N 개」가 대상 수와 같아야):
--   do $$
--   declare v_names text[] := array['daily-push-5']; v_go boolean := false; r record; n int := 0;
--   begin
--     for r in select j.jobid, h.command from cron.job j
--                join lateral (select d.command from cron.job_run_details d
--                               where d.jobid = j.jobid and d.command ~ '''pw''' and d.command !~ 'REDACTED'
--                               order by d.start_time desc limit 1) h on true
--               where j.jobname = any(v_names) loop
--       perform cron.alter_job(job_id := r.jobid, command := r.command);
--       n := n + 1;
--     end loop;
--     if n <> cardinality(v_names) then raise exception '옛 명령을 찾은 작업 % 개 / 대상 % 개 — 아무것도 바꾸지 않았습니다', n, cardinality(v_names); end if;
--     if not v_go then raise exception '연습 — % 개 되돌릴 수 있습니다(아무것도 바꾸지 않았습니다)', n; end if;
--   end $$;
--      다시 새 길로 갈 때는 이 파일을 다시 돌린다(옛 명령의 본문을 다시 견준 뒤 바꾼다).
--   ㉢ 한 작업만 이상하다 → 그 작업만 멈춘다: select cron.alter_job(job_id := <번호>, active := false);   (다시 켜기: active := true)
--      그날 몫은 갈래마다: 아침 한 시각 = 그 hour 로 진짜 본문 한 번(① 의 꼴에서 diag · user_id 를 빼고 hour 만 — 실제 발송) ·
--      주일 말씀 = weeklyVersePush 한 번(같은 길) · 리포트 = admin-stats 「보내기」 또는 monitor.yml 수동 실행 weekly_test(암호 길 — 폰에서도 된다).
--      ⚠️ admin-stats 의 「알림 보내기」는 시각 · 묵상 없이 모두에게 간다 — 놓친 아침 알림을 채우는 데 쓰지 않는다.
--   ㉣ 기록을 가린 뒤 · 암호를 바꾼 뒤에는 옛 명령으로 되돌리지 않는다 — ㉠(api 를 고친다)과 ㉢ 의 손 발송으로만 푼다.
--      암호를 명령 · 파일에 다시 적지 않는다(손 발송의 암호 길도 .env 에서 그 명령 안에서만 읽는다).
-- 나중(옮긴 여섯이 새 길로 한 번씩 돈 것을 본 뒤 — 아침 넷 · 금요일 리포트 · 주일 말씀): 지난 실행 기록의 평문 암호를 가리고, 이어서 암호를 바꾼다.
--   이 파일은 cron.job 의 명령만 바꾼다. 2026-07 부터의 cron.job_run_details(2026-10-12 에 427줄) · Postgres 로그(cron.log_statement on) ·
--   그날까지의 백업(cron-jobs.json)에는 옛 암호가 남는다 — 모든 사본을 무르게 하는 것은 ADMIN_SECRET 을 바꾸는 것뿐이다(친구가 정한다 · 차례: 가리기 → 바꾸기).
--   기록은 지우지 말고 제자리에서 가린다(지우면 monitor 의 cron_last_run 이 비어 헛경보가 난다 · 가린 뒤에는 ㉡ 를 못 쓴다):
--   update cron.job_run_details set command = regexp_replace(command, '(''pw''\s*,\s*'')[^'']*('')', '\1REDACTED\2', 'g')
--    where command ~ '''pw''';
--   select count(*) filter (where command ~ '''pw''')                               as with_pw,
--          count(*) filter (where command ~ '''pw''\s*,\s*''REDACTED''\s*[,)]')     as masked
--     from cron.job_run_details;   -- 두 수가 같아야 한다(다르면 값에 따옴표가 있던 줄 — 그 줄을 따로 본다 · 명령은 찍지 말 것)
-- 해제(여섯을 모두 걷을 때만): 여섯 이름마다 select cron.unschedule('<이름>'); — monitor 의 두 판정(아침 알림 · 주간 리포트 — index.ts monitor)도 함께 걷는다.
--   ⚠️ 키(edu_remind_service_key)는 지우지 않는다 — 교육 · 당번 · 감시 작업도 읽는다.
