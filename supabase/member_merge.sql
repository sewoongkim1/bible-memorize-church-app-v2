-- member_profile.sql 다음. 개발 검증 후 운영에 적용한다.
-- 실제 병합은 관리자 미리보기/동일인 확인을 거친 RPC 호출에서만 수행한다.
begin;
create table if not exists public.user_merges (
  source_user_id uuid primary key,
  target_user_id uuid not null references public.users(id),
  source_profile jsonb not null,
  target_profile jsonb not null,
  reason text not null,
  created_at timestamptz not null default now(),
  check (source_user_id <> target_user_id)
);
alter table public.user_merges enable row level security;
revoke all on public.user_merges from public, anon, authenticated;
grant all on public.user_merges to service_role;
create index if not exists user_merges_target on public.user_merges(target_user_id);

-- 예전 앱이 합치기 전 번호로 저장하더라도 대상 사용자에게 기록된다.
-- 합치기와 저장이 겹치면 트랜잭션 잠금을 기다린 뒤 최신 연결을 확인한다.
create or replace function public.redirect_merged_member_write()
returns trigger language plpgsql security invoker set search_path = public as $$
declare col text; original text; resolved uuid; row_data jsonb := to_jsonb(new); saved_stage integer;
begin
  perform pg_advisory_xact_lock(7240910, 1);
  foreach col in array tg_argv loop
    original := row_data->>col;
    if original ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select target_user_id into resolved from public.user_merges where source_user_id = original::uuid;
      if found then row_data := jsonb_set(row_data, array[col], to_jsonb(resolved::text)); end if;
    end if;
  end loop;
  if tg_table_name='progress' then
    select stage into saved_stage from public.progress where user_id=(row_data->>'user_id')::uuid
      and verse_no=(row_data->>'verse_no')::int and lang=row_data->>'lang';
    if found then row_data := jsonb_set(row_data, '{stage}', to_jsonb(greatest(saved_stage,(row_data->>'stage')::int))); end if;
  end if;
  new := jsonb_populate_record(new, row_data);
  return new;
end;
$$;
revoke all on function public.redirect_merged_member_write() from public, anon, authenticated;
grant execute on function public.redirect_merged_member_write() to service_role;
do $$
declare t text;
begin
  foreach t in array array['progress','challenge_log','reviews','passage_progress','blessing_log',
    'board_posts','board_replies','board_reactions','event_entries','push_subscriptions',
    'pilsa_orders','ministry_orders','event_signups','daily_activity'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists redirect_merged_member_write on public.%I', t);
      execute format('create trigger redirect_merged_member_write before insert or update on public.%I for each row execute function public.redirect_merged_member_write(''user_id'')', t);
    end if;
  end loop;
  if to_regclass('public.rank_cheers') is not null then
    drop trigger if exists redirect_merged_member_write on public.rank_cheers;
    create trigger redirect_merged_member_write before insert or update on public.rank_cheers
      for each row execute function public.redirect_merged_member_write('from_user_id','target_user_id');
  end if;
end $$;

create or replace function public.member_merge_counts(p_id uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare t text; n bigint; result jsonb := '{}';
begin
  foreach t in array array['challenge_log','progress','reviews','passage_progress','board_posts',
    'board_replies','event_entries','pilsa_orders','ministry_orders','event_signups','push_subscriptions'] loop
    if to_regclass('public.' || t) is not null then
      execute format('select count(*) from public.%I where user_id::text=$1',t) into n using p_id::text;
      result := result || jsonb_build_object(t,n);
    end if;
  end loop;
  return result;
end;
$$;

create or replace function public.admin_preview_member_merge(p_source_id uuid, p_source_key text, p_target_key text)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare s public.users; t public.users;
begin
  select * into s from public.users where id=p_source_id;
  if not found or s.identity_key is distinct from p_source_key then
    return jsonb_build_object('ok',false,'error','member-changed');
  end if;
  select * into t from public.users where identity_key=p_target_key;
  if not found then
    select u.* into t from public.user_identity_aliases a join public.users u on u.id=a.user_id where a.identity_key=p_target_key;
  end if;
  if t.id is null or t.id=s.id then return jsonb_build_object('ok',false,'error','merge-target-missing'); end if;
  return jsonb_build_object('ok',true,'source',to_jsonb(s),'target',to_jsonb(t),
    'source_counts',public.member_merge_counts(s.id),'target_counts',public.member_merge_counts(t.id));
end;
$$;

create or replace function public.admin_merge_members(p_source_id uuid, p_target_id uuid,
  p_source_key text, p_target_key text, p_reason text)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare s public.users; t public.users; ref record; n bigint; before_counts jsonb;
begin
  if p_source_id = p_target_id or nullif(btrim(p_reason),'') is null or length(p_reason)>300 then
    return jsonb_build_object('ok',false,'error','invalid-merge');
  end if;
  perform pg_advisory_xact_lock(7240910, 1);
  select * into s from public.users where id=p_source_id for update;
  select * into t from public.users where id=p_target_id for update;
  -- 통신 오류 뒤 같은 요청을 다시 보내도 합치기는 한 번만 수행한다.
  if s.id is null and t.id is not null and exists(select 1 from public.user_merges
    where source_user_id=p_source_id and target_user_id=p_target_id) then
    return jsonb_build_object('ok',true,'merged',true,'already_merged',true,'user',to_jsonb(t));
  end if;
  if s.id is null or t.id is null or s.identity_key is distinct from p_source_key or t.identity_key is distinct from p_target_key then
    return jsonb_build_object('ok',false,'error','member-changed');
  end if;
  -- 사역/상세 이벤트 신청은 답변·연락처·관리 상태를 임의로 덮어쓸 수 없다.
  if to_regclass('public.ministry_orders') is not null then
    if exists(select 1 from public.ministry_orders a join public.ministry_orders b
      on a.year=b.year and a.team_id=b.team_id where a.user_id=s.id::text and b.user_id=t.id::text) then
      return jsonb_build_object('ok',false,'error','merge-ministry-conflict');
    end if;
  end if;
  if to_regclass('public.event_signups') is not null then
    if exists(select 1 from public.event_signups a join public.event_signups b on a.event_id=b.event_id
      where a.user_id=s.id and b.user_id=t.id) then
      return jsonb_build_object('ok',false,'error','merge-signup-conflict');
    end if;
  end if;
  -- 새 기능이 추가되어도 모르는 FK를 cascade 삭제하지 않는다. auth.users 참조는 제외.
  for ref in select c.conrelid::regclass as tbl, a.attname as col
    from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey)
    where c.contype='f' and c.confrelid='public.users'::regclass and c.conrelid not in
      ('public.user_merges'::regclass,'public.user_identity_aliases'::regclass,'public.user_profile_changes'::regclass)
  loop
    if ref.tbl::text not in ('progress','challenge_log','reviews','passage_progress','blessing_log',
      'push_subscriptions','board_posts','board_replies','event_signups') then
      execute format('select count(*) from %s where %I::text=$1',ref.tbl,ref.col) into n using s.id::text;
      if n>0 then return jsonb_build_object('ok',false,'error','merge-unsupported-records'); end if;
    end if;
  end loop;
  for ref in select c.table_name as tbl,c.column_name as col
    from information_schema.columns c join information_schema.tables b
      on b.table_schema=c.table_schema and b.table_name=c.table_name
    where c.table_schema='public' and b.table_type='BASE TABLE' and c.column_name='user_id'
      and c.table_name not in ('progress','challenge_log','reviews','passage_progress','blessing_log',
        'push_subscriptions','board_posts','board_replies','board_reactions','event_entries',
        'daily_activity','pilsa_orders','ministry_orders','event_signups','user_identity_aliases','user_profile_changes')
  loop
    execute format('select count(*) from public.%I where %I::text=$1',ref.tbl,ref.col) into n using s.id::text;
    if n>0 then return jsonb_build_object('ok',false,'error','merge-unsupported-records'); end if;
  end loop;
  before_counts := jsonb_build_object('source',public.member_merge_counts(s.id),'target',public.member_merge_counts(t.id));

  insert into public.progress(user_id,verse_no,lang,stage,updated_at,hearted,hearted_at)
    select t.id,verse_no,lang,stage,updated_at,hearted,hearted_at from public.progress where user_id=s.id
    on conflict(user_id,verse_no,lang) do update set
      stage=greatest(progress.stage,excluded.stage),updated_at=greatest(progress.updated_at,excluded.updated_at),
      hearted=coalesce(progress.hearted,false) or coalesce(excluded.hearted,false),
      hearted_at=least(progress.hearted_at,excluded.hearted_at);
  delete from public.progress where user_id=s.id;
  -- 마지막으로 복습한 쪽의 일정 한 벌을 유지한다(날짜와 상자를 섞지 않는다).
  insert into public.reviews(user_id,verse_no,box,due_at,last_at)
    select t.id,verse_no,box,due_at,last_at from public.reviews where user_id=s.id
    on conflict(user_id,verse_no) do update set box=excluded.box,due_at=excluded.due_at,last_at=excluded.last_at
    where coalesce(excluded.last_at,'-infinity'::date)>coalesce(reviews.last_at,'-infinity'::date);
  delete from public.reviews where user_id=s.id;
  if to_regclass('public.passage_progress') is not null then
    insert into public.passage_progress(user_id,passage_id,done_seq,completed_at,updated_at)
      select t.id,passage_id,done_seq,completed_at,updated_at from public.passage_progress where user_id=s.id
      on conflict(user_id,passage_id) do update set
        done_seq=array(select distinct x from unnest(passage_progress.done_seq || excluded.done_seq) as x order by x),
        completed_at=least(passage_progress.completed_at,excluded.completed_at),
        updated_at=now();
    delete from public.passage_progress where user_id=s.id;
  end if;
  if to_regclass('public.blessing_log') is not null then
    insert into public.blessing_log(user_id,day,no,cnt)
      select t.id,day,no,cnt from public.blessing_log where user_id=s.id
      on conflict(user_id,day,no) do update set cnt=blessing_log.cnt+excluded.cnt;
    delete from public.blessing_log where user_id=s.id;
  end if;
  if to_regclass('public.event_entries') is not null then
    insert into public.event_entries(event_id,user_id,entered_at)
      select event_id,t.id::text,entered_at from public.event_entries where user_id=s.id::text
      on conflict(event_id,user_id) do update set entered_at=least(event_entries.entered_at,excluded.entered_at);
    delete from public.event_entries where user_id=s.id::text;
  end if;
  if to_regclass('public.board_reactions') is not null then
    insert into public.board_reactions(target,target_id,user_id,emoji,who,created_at)
      select target,target_id,t.id::text,emoji,who,created_at from public.board_reactions where user_id=s.id::text
      on conflict(target,target_id,user_id,emoji) do nothing;
    delete from public.board_reactions where user_id=s.id::text;
  end if;
  if to_regclass('public.rank_cheers') is not null then
    insert into public.rank_cheers(target_user_id,from_user_id,cheer_date,from_name,created_at)
      select case when target_user_id=s.id::text then t.id::text else target_user_id end,
        case when from_user_id=s.id::text then t.id::text else from_user_id end,cheer_date,from_name,created_at
      from public.rank_cheers where target_user_id=s.id::text or from_user_id=s.id::text
      on conflict(target_user_id,from_user_id,cheer_date) do nothing;
    delete from public.rank_cheers where target_user_id=s.id::text or from_user_id=s.id::text;
    delete from public.rank_cheers where target_user_id=t.id::text and from_user_id=t.id::text;
  end if;
  -- 로그/게시물/신청/구독은 행을 삭제하거나 다시 생성하지 않고 소유자만 옮긴다.
  for ref in select table_name,data_type from information_schema.columns where table_schema='public'
    and column_name='user_id' and table_name in ('challenge_log','board_posts','board_replies',
      'push_subscriptions','pilsa_orders','ministry_orders','event_signups','user_profile_changes','user_identity_aliases')
  loop
    execute format('update public.%I set user_id=$1::%s where user_id=$2::%s',ref.table_name,ref.data_type,ref.data_type)
      using t.id::text,s.id::text;
  end loop;
  -- challenge_log의 기존 트리거는 UPDATE를 집계하지 않는다. 두 사람의 집계를 로그로 재생성.
  if to_regclass('public.daily_activity') is not null then
    delete from public.daily_activity where user_id in(s.id::text,t.id::text);
    insert into public.daily_activity(day,user_id,mode,cnt)
      select (created_at at time zone 'Asia/Seoul')::date,t.id::text,mode,count(*)::int
      from public.challenge_log where user_id=t.id group by 1,3;
  end if;
  update public.app_config c set value=(select jsonb_agg(distinct case when k=s.identity_key then t.identity_key else k end)
    from jsonb_array_elements_text(c.value) as keys(k)),updated_at=now()
    where c.key='pilsaAdmins' and c.value ? s.identity_key;
  insert into public.user_identity_aliases(identity_key,user_id) values(s.identity_key,t.id)
    on conflict(identity_key) do update set user_id=excluded.user_id;
  update public.user_merges set target_user_id=t.id where target_user_id=s.id;
  insert into public.user_merges(source_user_id,target_user_id,source_profile,target_profile,reason)
    values(s.id,t.id,to_jsonb(s),to_jsonb(t),p_reason);
  insert into public.user_profile_changes(user_id,before_profile,after_profile,reason)
    values(t.id,to_jsonb(s),to_jsonb(t),'기록 합치기: ' || p_reason);
  delete from public.users where id=s.id;
  return jsonb_build_object('ok',true,'merged',true,'user',to_jsonb(t),'before_counts',before_counts,
    'after_counts',public.member_merge_counts(t.id));
end;
$$;
revoke all on function public.member_merge_counts(uuid) from public,anon,authenticated;
revoke all on function public.admin_preview_member_merge(uuid,text,text) from public,anon,authenticated;
revoke all on function public.admin_merge_members(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.member_merge_counts(uuid) to service_role;
grant execute on function public.admin_preview_member_merge(uuid,text,text) to service_role;
grant execute on function public.admin_merge_members(uuid,uuid,text,text,text) to service_role;
commit;
