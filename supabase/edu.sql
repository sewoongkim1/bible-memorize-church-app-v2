-- 교육신청 1단계 — 강좌·회차·신청 표와 정원·대기 규칙(2026-10-05 · 설계 docs/superpowers/specs/2026-10-05-education-courses-design.md §5·§6)
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키를 절대 넣지 마세요.
-- 적용: 개발(ktpwthwqzgcqcrmsafdo) 먼저 → supabase/tests/edu_apply.dev.sql · tests/edu-concurrency.dev.sh 확인 → 운영.
-- 여러 번 돌려도 안전하다(if not exists · create or replace).
-- ⚠️ 정원·대기·대기 올림·취소 마감은 **이 파일의 함수 한 곳**에서만 정한다 — 성경암송 api(성도님)와
--    교회 어드민 함수(담당자)가 둘 다 이 함수를 부른다. 코드에서 상태를 직접 update 하지 말 것.
-- ⚠️ users 를 가리키는 표가 하나 늘었다 — supabase/member_merge.sql 이 edu_enrollments 를 안다(과제 2). 이 파일 뒤에 member_merge.sql 을 다시 돌린다.
begin;

create table if not exists public.edu_courses (
  id            uuid primary key default gen_random_uuid(),
  track         text not null default '',                       -- 과정 키(선수 조건·이력 묶음 · 3단계부터 씀)
  title         text not null check (char_length(title) between 1 and 80),
  kind          text not null check (kind in ('regular','lecture','training')),
  term          text not null default '',                       -- 학기(예 「2027 상반기」)
  description   text not null default '',
  teacher_label text not null default '',
  place         text not null default '',
  fee_note      text not null default '',
  target        text not null default '',
  capacity      int  check (capacity is null or capacity between 1 and 2000),   -- null = 제한 없음
  mode          text not null default 'auto' check (mode in ('auto','approve')),
  waitlist      boolean not null default true,
  apply_from    date,
  apply_to      date,
  prereq_tracks text[] not null default '{}',                   -- 1단계는 안내만(검사는 3단계)
  attend_pct    int  not null default 80 check (attend_pct between 0 and 100),
  check_label   text,
  status        text not null default 'draft' check (status in ('draft','open','closed','running','done','archived')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (apply_from is null or apply_to is null or apply_from <= apply_to)
);

create table if not exists public.edu_sessions (
  id         bigint generated always as identity primary key,
  course_id  uuid not null references public.edu_courses(id) on delete cascade,
  no         int  not null check (no between 1 and 200),
  on_date    date not null,
  start_time time,
  end_time   time,
  topic      text not null default '',
  place      text not null default '',
  unique (course_id, no)
);

create table if not exists public.edu_enrollments (
  id           bigint generated always as identity primary key,
  course_id    uuid not null references public.edu_courses(id) on delete restrict,
  user_id      uuid references public.users(id) on delete cascade,   -- 대신 등록한 새가족은 null
  ident_key    text not null default '',
  who_type     text not null default '',
  group_name   text not null default '',
  sub_name     text not null default '',
  name         text not null check (char_length(name) between 1 and 40),
  status       text not null check (status in ('applied','confirmed','waitlisted','cancelled','declined')),
  source       text not null default 'app' check (source in ('app','staff')),
  waitlist_at  timestamptz,
  applied_at   timestamptz not null default now(),
  decided_at   timestamptz,
  cancelled_at timestamptz,
  fee_paid     boolean not null default false,
  staff_note   text not null default '' check (char_length(staff_note) <= 500),
  updated_at   timestamptz not null default now()
);
create unique index if not exists edu_enrollments_course_user on public.edu_enrollments(course_id, user_id) where user_id is not null;
create index if not exists edu_enrollments_course_status on public.edu_enrollments(course_id, status);
drop index if exists public.edu_sessions_course;   -- unique(course_id,no) 가 이미 같은 색인이다

alter table public.edu_courses     enable row level security;
alter table public.edu_sessions    enable row level security;
alter table public.edu_enrollments enable row level security;
revoke all on public.edu_courses, public.edu_sessions, public.edu_enrollments from public, anon, authenticated;
grant all on public.edu_courses, public.edu_sessions, public.edu_enrollments to service_role;
revoke all on sequence public.edu_sessions_id_seq, public.edu_enrollments_id_seq from public, anon, authenticated;

-- 오늘(한국)
create or replace function public.edu_today() returns date language sql stable as $$
  select (now() at time zone 'Asia/Seoul')::date
$$;

-- 신청 — 강좌 줄을 잠그고(for update) 확정 수를 세서 정한다. 동시 신청이 와도 정원을 넘지 않는다.
create or replace function public.edu_apply(p_course uuid, p_user uuid, p_ident jsonb, p_staff boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c public.edu_courses;
  e public.edu_enrollments;
  n int;
  st text;
  v_name text := btrim(coalesce(p_ident->>'name',''));
  v_key  text := coalesce(p_ident->>'ident_key','');
begin
  p_staff := coalesce(p_staff, false);          -- null 이 담당자 길로 새지 않게
  if v_name = '' or char_length(v_name) > 40 then return jsonb_build_object('ok',false,'error','bad-ident'); end if;
  -- 계정 없는 신청은 담당자 대신 등록만 · 신원 키 필수
  if p_user is null and (v_key = '' or not p_staff) then return jsonb_build_object('ok',false,'error','bad-ident'); end if;
  select * into c from public.edu_courses where id = p_course for update;
  if not found then return jsonb_build_object('ok',false,'error','not-found'); end if;
  -- 담당자도 끝난·보관된 강좌에는 못 넣는다(창·선수 조건만 건너뛴다)
  if p_staff and c.status in ('done','archived') then return jsonb_build_object('ok',false,'error','not-open'); end if;
  if not p_staff then
    if c.status <> 'open' then return jsonb_build_object('ok',false,'error','not-open'); end if;
    if c.apply_from is not null and edu_today() < c.apply_from then return jsonb_build_object('ok',false,'error','not-yet'); end if;
    if c.apply_to   is not null and edu_today() > c.apply_to   then return jsonb_build_object('ok',false,'error','closed-period'); end if;
  end if;

  -- 같은 분의 줄 — 앱 계정이면 계정으로, 대신 등록(계정 없음)이면 신원 키로
  if p_user is not null then
    select * into e from public.edu_enrollments where course_id = p_course and user_id = p_user for update;
  elsif v_key <> '' then
    select * into e from public.edu_enrollments where course_id = p_course and user_id is null and ident_key = v_key
      order by id desc limit 1 for update;
  end if;
  if e.id is not null and e.status in ('applied','confirmed','waitlisted') then
    return jsonb_build_object('ok',true,'id',e.id,'status',e.status,'already',true);
  end if;
  -- 반려 유지(친구 결정 2026-10-05) — 성도님이 다시 신청해도 되살리지 않는다. 담당자는 edu_staff_set 으로 「다시 받기」.
  if e.id is not null and e.status = 'declined' and not p_staff then
    return jsonb_build_object('ok',true,'id',e.id,'status','declined','already',true);
  end if;

  if c.mode = 'approve' and not p_staff then
    st := 'applied';
  else
    select count(*) into n from public.edu_enrollments where course_id = p_course and status = 'confirmed';
    if c.capacity is null or n < c.capacity then st := 'confirmed';
    elsif c.waitlist or p_staff then st := 'waitlisted';
    else return jsonb_build_object('ok',false,'error','full');
    end if;
  end if;

  if e.id is not null then   -- 취소·반려됐던 줄을 되살린다(같은 강좌 한 계정 한 줄)
    update public.edu_enrollments set
      status = st, source = case when p_staff then 'staff' else 'app' end,
      ident_key = v_key, who_type = coalesce(p_ident->>'who_type',''), group_name = coalesce(p_ident->>'group_name',''),
      sub_name = coalesce(p_ident->>'sub_name',''), name = v_name,
      applied_at = now(), waitlist_at = case when st = 'waitlisted' then now() end,
      decided_at = case when st = 'confirmed' then now() end, cancelled_at = null, updated_at = now()
    where id = e.id;
    return jsonb_build_object('ok',true,'id',e.id,'status',st);
  end if;

  insert into public.edu_enrollments(course_id, user_id, ident_key, who_type, group_name, sub_name, name,
                                     status, source, waitlist_at, decided_at)
  values (p_course, p_user, v_key, coalesce(p_ident->>'who_type',''), coalesce(p_ident->>'group_name',''),
          coalesce(p_ident->>'sub_name',''), v_name, st, case when p_staff then 'staff' else 'app' end,
          case when st = 'waitlisted' then now() end, case when st = 'confirmed' then now() end)
  returning * into e;
  return jsonb_build_object('ok',true,'id',e.id,'status',st);
end $$;

-- 대기 첫 분 올리기(선착순 강좌에서 확정 줄이 빠졌을 때) — 강좌 줄은 부른 쪽이 이미 잠갔다.
drop function if exists public.edu_promote(uuid);
create or replace function public.edu_promote(p_course uuid, p_skip bigint default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare c public.edu_courses; n int; w bigint;
begin
  select * into c from public.edu_courses where id = p_course;
  if c.mode <> 'auto' then return null; end if;
  select count(*) into n from public.edu_enrollments where course_id = p_course and status = 'confirmed';
  if c.capacity is not null and n >= c.capacity then return null; end if;
  select id into w from public.edu_enrollments where course_id = p_course and status = 'waitlisted'
    and id is distinct from p_skip                      -- 방금 내려간 분이 바로 되올라오지 않게
    order by waitlist_at nulls last, id limit 1 for update;
  if w is null then return null; end if;
  update public.edu_enrollments set status = 'confirmed', decided_at = now(), updated_at = now() where id = w;
  return w;
end $$;

-- 취소 — 성도님은 첫 회차 전날까지(회차가 없으면 언제든). 담당자는 언제든.
create or replace function public.edu_cancel(p_enrollment bigint, p_staff boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e public.edu_enrollments; cid uuid; first_day date; was_confirmed boolean; p bigint;
begin
  p_staff := coalesce(p_staff, false);
  select course_id into cid from public.edu_enrollments where id = p_enrollment;
  if cid is null then return jsonb_build_object('ok',false,'error','not-found'); end if;
  perform 1 from public.edu_courses where id = cid for update;            -- 차례: 강좌 → 신청 줄(교착 막기)
  select * into e from public.edu_enrollments where id = p_enrollment for update;
  if not found then return jsonb_build_object('ok',false,'error','not-found'); end if;
  if e.status not in ('applied','confirmed','waitlisted') then return jsonb_build_object('ok',false,'error','not-active'); end if;
  if not p_staff then
    select min(on_date) into first_day from public.edu_sessions where course_id = cid;
    if first_day is not null and edu_today() >= first_day then return jsonb_build_object('ok',false,'error','too-late'); end if;
  end if;
  was_confirmed := e.status = 'confirmed';
  update public.edu_enrollments set status = 'cancelled', cancelled_at = now(), updated_at = now() where id = e.id;
  if was_confirmed then p := edu_promote(cid); end if;
  return jsonb_build_object('ok',true,'promoted',p);
end $$;

-- 담당자 상태 바꾸기 — confirmed·waitlisted·declined·applied. 확정은 정원을 본다(p_force 면 넘긴다 — 「정원을 넘깁니다」 확인 뒤).
create or replace function public.edu_staff_set(p_enrollment bigint, p_status text, p_force boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e public.edu_enrollments; c public.edu_courses; n int; p bigint;
begin
  p_force := coalesce(p_force, false);
  if p_status is null or p_status not in ('confirmed','waitlisted','declined','applied') then return jsonb_build_object('ok',false,'error','bad-status'); end if;
  select * into e from public.edu_enrollments where id = p_enrollment;
  if e.id is null then return jsonb_build_object('ok',false,'error','not-found'); end if;
  select * into c from public.edu_courses where id = e.course_id for update;
  select * into e from public.edu_enrollments where id = p_enrollment for update;
  if not found then return jsonb_build_object('ok',false,'error','not-found'); end if;
  if e.status = p_status then return jsonb_build_object('ok',true,'promoted',null); end if;
  if p_status = 'confirmed' and not p_force and c.capacity is not null then
    select count(*) into n from public.edu_enrollments where course_id = c.id and status = 'confirmed';
    if n >= c.capacity then return jsonb_build_object('ok',false,'error','full'); end if;
  end if;
  update public.edu_enrollments set status = p_status, updated_at = now(),
    decided_at = case when p_status in ('confirmed','declined') then now() else decided_at end,
    waitlist_at = case when p_status = 'waitlisted'
                       then now()   -- 어떤 상태에서든 대기로 들어오는 분은 줄 맨 뒤(취소·반려에서 되돌려도 새치기 금지)
                       else waitlist_at end,
    cancelled_at = null
  where id = e.id;
  if e.status = 'confirmed' and p_status <> 'confirmed' then p := edu_promote(c.id, e.id); end if;
  return jsonb_build_object('ok',true,'promoted',p);
end $$;

revoke all on function public.edu_today() from public, anon, authenticated;
revoke all on function public.edu_apply(uuid, uuid, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.edu_promote(uuid, bigint) from public, anon, authenticated, service_role;   -- 안쪽에서만 부른다(강좌 줄 잠근 채) · service_role 도 안 준다
revoke all on function public.edu_cancel(bigint, boolean) from public, anon, authenticated;
revoke all on function public.edu_staff_set(bigint, text, boolean) from public, anon, authenticated;
grant execute on function public.edu_today() to service_role;
grant execute on function public.edu_apply(uuid, uuid, jsonb, boolean) to service_role;
grant execute on function public.edu_cancel(bigint, boolean) to service_role;
grant execute on function public.edu_staff_set(bigint, text, boolean) to service_role;

commit;

-- 확인 — 표 셋·함수 다섯이 있고, anon·authenticated 권한이 없는지
select 'tables' as t, count(*) from pg_tables where schemaname='public' and tablename in ('edu_courses','edu_sessions','edu_enrollments')
union all select 'functions', count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('edu_today','edu_apply','edu_promote','edu_cancel','edu_staff_set')
union all select 'anon/authenticated grants', count(*) from information_schema.role_table_grants
  where table_schema='public' and table_name like 'edu\_%' and grantee in ('anon','authenticated')
union all select 'routine grants', count(*) from information_schema.role_routine_grants
  where routine_schema='public' and routine_name like 'edu\_%' and grantee in ('anon','authenticated');
