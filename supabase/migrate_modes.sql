-- challenge_log.mode CHECK 제약을 학습(learn-*) 모드까지 확장. SQL Editor에서 실행.
-- 기존 CHECK 제약의 이름이 무엇이든 모두 제거 후 재생성(견고).
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.challenge_log'::regclass and contype = 'c'
  loop
    execute 'alter table public.challenge_log drop constraint ' || quote_ident(c);
  end loop;
end $$;

alter table public.challenge_log add constraint challenge_log_mode_check
  check (mode in ('typing','voice','review-typing','review-voice','learn-typing','learn-voice'));
