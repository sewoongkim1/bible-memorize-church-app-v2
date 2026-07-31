-- monitor 액션이 pg_cron 실행 기록을 조회할 수 있게 해주는 RPC.
-- supabase-js(PostgREST)는 기본적으로 cron 스키마에 접근 못 하므로, security definer 함수로
-- public 스키마에 얇은 조회창을 하나 낸다. service_role만 실행 가능(다른 역할은 차단).
--
-- 사용 예: select * from public.cron_last_run('weekly-report-email');

create or replace function public.cron_last_run(p_jobname text)
returns table (status text, start_time timestamptz)
language sql
security definer
set search_path = public, cron
as $$
  select jr.status, jr.start_time
  from cron.job_run_details jr
  join cron.job j on j.jobid = jr.jobid
  where j.jobname = p_jobname
  order by jr.start_time desc
  limit 1;
$$;

revoke execute on function public.cron_last_run(text) from public;
grant execute on function public.cron_last_run(text) to service_role;
