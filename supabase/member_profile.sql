-- 관리자 이름·소속 변경. 개발 DB에서 먼저 실행하고 API, 프론트 순으로 배포한다.
-- users.id와 기록 FK는 바꾸지 않는다. 이전 식별자는 동일 사용자의 로그인 별칭으로 예약한다.
begin;

create table if not exists public.user_identity_aliases (
  identity_key text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.user_profile_changes (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  before_profile jsonb not null,
  after_profile jsonb not null,
  reason text not null,
  created_at timestamptz not null default now()
);
create index if not exists user_profile_changes_user on public.user_profile_changes(user_id, id desc);
alter table public.user_identity_aliases enable row level security;
alter table public.user_profile_changes enable row level security;
revoke all on public.user_identity_aliases, public.user_profile_changes from anon, authenticated;
grant all on public.user_identity_aliases, public.user_profile_changes to service_role;
grant usage, select on sequence public.user_profile_changes_id_seq to service_role;

-- 예전 API나 일괄 가져오기가 별칭을 새 사용자로 등록하는 것도 막는다.
create or replace function public.guard_user_identity_alias()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  perform pg_advisory_xact_lock(7240910, 1);
  if exists(select 1 from public.user_identity_aliases
    where identity_key = new.identity_key and user_id <> new.id) then
    raise exception 'identity-conflict' using errcode = '23505';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_user_identity_alias on public.users;
create trigger guard_user_identity_alias before insert or update of identity_key on public.users
for each row execute function public.guard_user_identity_alias();
revoke all on function public.guard_user_identity_alias() from public, anon, authenticated;
grant execute on function public.guard_user_identity_alias() to service_role;

-- 로그인과 변경은 같은 잠금을 사용한다. 옛 정보로 로그인하는 순간 변경되어도
-- 별도 사용자가 생기거나 변경한 프로필이 옛 값으로 덮어써지지 않는다.
create or replace function public.member_login(p_profile jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_user public.users;
  v_key text := p_profile->>'identity_key';
begin
  perform pg_advisory_xact_lock(7240910, 1);
  select u.* into v_user from public.users u where u.identity_key = v_key;
  if not found then
    select u.* into v_user from public.user_identity_aliases a
      join public.users u on u.id = a.user_id where a.identity_key = v_key;
  end if;
  if v_user.id is null then
    insert into public.users(type, gu, mok, bu, grade, name, identity_key, last_seen_at)
    values (p_profile->>'type', p_profile->>'gu', p_profile->>'mok',
      p_profile->>'bu', p_profile->>'grade', p_profile->>'name', v_key, now())
    returning * into v_user;
  else
    update public.users set last_seen_at = now() where id = v_user.id returning * into v_user;
  end if;
  return to_jsonb(v_user);
end;
$$;

create or replace function public.admin_update_member_profile(
  p_user_id uuid, p_expected_key text, p_profile jsonb, p_reason text
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_before public.users;
  v_after public.users;
  v_key text := p_profile->>'identity_key';
begin
  perform pg_advisory_xact_lock(7240910, 1);
  select * into v_before from public.users where id = p_user_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'member-not-found'); end if;
  if v_before.identity_key is distinct from p_expected_key then
    return jsonb_build_object('ok', false, 'error', 'member-changed');
  end if;
  if exists(select 1 from public.users where identity_key = v_key and id <> p_user_id)
    or exists(select 1 from public.user_identity_aliases where identity_key = v_key and user_id <> p_user_id) then
    return jsonb_build_object('ok', false, 'error', 'identity-conflict');
  end if;
  if v_before.identity_key = v_key then
    return jsonb_build_object('ok', true, 'changed', false, 'user', to_jsonb(v_before));
  end if;
  insert into public.user_identity_aliases(identity_key, user_id)
    values(v_before.identity_key, p_user_id) on conflict(identity_key) do nothing;
  update public.users set
    type = p_profile->>'type', gu = p_profile->>'gu', mok = p_profile->>'mok',
    bu = p_profile->>'bu', grade = p_profile->>'grade', name = p_profile->>'name', identity_key = v_key
    where id = p_user_id returning * into v_after;
  -- 필사 알림 담당자 설정도 같은 트랜잭션에서 옮긴다.
  update public.app_config c set value = (
    select jsonb_agg(case when k = v_before.identity_key then v_key else k end)
    from jsonb_array_elements_text(c.value) as keys(k)
  ), updated_at = now()
  where c.key = 'pilsaAdmins' and c.value ? v_before.identity_key;
  insert into public.user_profile_changes(user_id, before_profile, after_profile, reason)
  values(p_user_id,
    to_jsonb(v_before) - 'last_seen_at' - 'created_at',
    to_jsonb(v_after) - 'last_seen_at' - 'created_at', p_reason);
  return jsonb_build_object('ok', true, 'changed', true, 'user', to_jsonb(v_after));
end;
$$;

revoke all on function public.member_login(jsonb) from public, anon, authenticated;
revoke all on function public.admin_update_member_profile(uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.member_login(jsonb) to service_role;
grant execute on function public.admin_update_member_profile(uuid, text, jsonb, text) to service_role;
commit;
