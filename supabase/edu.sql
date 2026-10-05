-- 교육신청 1단계 — 강좌·회차·신청 표와 정원·대기 규칙(2026-10-05 · 설계 docs/superpowers/specs/2026-10-05-education-courses-design.md §5·§6)
--   2단계(2026-10-05) — 출석부 표 edu_attendance · edu_attendance_set·edu_attendance_bulk · 회차 지우기 has-attendance
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키를 절대 넣지 마세요.
-- 적용: 개발(ktpwthwqzgcqcrmsafdo) 먼저 → supabase/tests/edu_*.dev.sql(출석은 edu_attendance.dev.sql) · tests/edu-concurrency.dev.sh 확인 → 운영.
-- 여러 번 돌려도 안전하다(if not exists · create or replace).
-- ⚠️ 정원·대기·대기 올림·취소 마감은 **이 파일의 함수 한 곳**에서만 정한다 — 성경암송 api(성도님)와
--    교회 어드민 함수(담당자)가 둘 다 이 함수를 부른다. 코드에서 상태를 직접 update 하지 말 것.
-- ⚠️ users 를 가리키는 표가 하나 늘었다 — supabase/member_merge.sql 이 edu_enrollments 를 안다(과제 2). 이 파일 뒤에 member_merge.sql 을 다시 돌린다.
begin;
-- 성도님이 쓰는 중에 표·함수 잠금을 오래 기다리지 않게(member_merge.sql 과 같다) — 5초 안에 못 잡으면 통째로 되돌리고 멈춘다.
set local lock_timeout = '5s';

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

-- 교육 기간(2026-10-05 추가) — 신청 기간(apply_from/to)과 별개로 강좌가 열리는 첫 날·마지막 날. 비어 있어도 된다(회차에서 읽는다).
--   취소 마감은 coalesce(첫 회차 날, starts_on) — 회차가 없어도 시작일이 있으면 그 전까지만 앱에서 취소된다.
alter table public.edu_courses add column if not exists starts_on date;
alter table public.edu_courses add column if not exists ends_on   date;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.edu_courses'::regclass and conname = 'edu_courses_period_check') then
    alter table public.edu_courses add constraint edu_courses_period_check check (starts_on is null or ends_on is null or starts_on <= ends_on);
  end if;
end $$;

create table if not exists public.edu_sessions (
  id         bigint generated always as identity primary key,
  course_id  uuid not null references public.edu_courses(id) on delete cascade,
  no         int  not null check (no between 1 and 200),
  on_date    date not null,
  start_time time,
  end_time   time,
  topic      text not null default '',
  place      text not null default '',
  unique (course_id, no) deferrable initially immediate
);
-- 회차 번호(no)는 **보여 주는 차례**일 뿐이다 — 회차의 정체는 id(출석이 가리킨다 · 2단계 검토 2026-10-05).
--   edu_sessions_replace 가 번호를 새로 매길 때 잠깐 겹치므로 unique(course_id,no) 를 미룰 수 있게(deferrable) 둔다.
--   (no + 10000 같은 두 단계 번호는 check(no between 1 and 200) 에 걸린다.) 이미 만든 DB 는 아래에서 바꾼다(다시 돌려도 안전).
--   ⚠️ deferrable 제약은 ON CONFLICT 의 기준이 될 수 없다 — (course_id, no) 로 on conflict 를 쓰지 말 것.
do $$ begin
  if exists (select 1 from pg_constraint where conrelid = 'public.edu_sessions'::regclass
               and conname = 'edu_sessions_course_id_no_key' and not condeferrable) then
    alter table public.edu_sessions drop constraint edu_sessions_course_id_no_key,
      add constraint edu_sessions_course_id_no_key unique (course_id, no) deferrable initially immediate;
  end if;
end $$;

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

-- 출석부(2단계 · 2026-10-05 · 계획 docs/superpowers/plans/2026-10-05-education-stage2-attendance.md) — 확정된 신청 한 줄 × 회차 한 칸.
--   체크 안 한 칸은 줄이 없다(출석률 분모에 안 들어간다). 쓰는 것은 아래 edu_attendance_set·edu_attendance_bulk 만.
--   신청 줄이 지워지면 출석도 함께(cascade · 사용자 삭제) — 합치기는 취소 겹침 줄을 지우기 전에 그 출석을 남는 줄로 옮긴다(member_merge.sql ·
--   같은 회차 상태가 서로 다르면 merge-edu-attendance 로 멈춘다).
--   회차는 출석이 있으면 지울 수 없다(restrict · edu_sessions_replace 가 has-attendance 로 먼저 거절).
--   marked_by = 교회 어드민 담당자 admin_members.id(그 표는 교회 어드민 저장소 것이라 FK 를 두지 않는다) — 응답에 싣지 않는다.
--   user_id 칸이 없다 — 기록 합치기 대상이 아니다(신청 줄을 따라간다).
create table if not exists public.edu_attendance (
  enrollment_id bigint not null references public.edu_enrollments(id) on delete cascade,
  session_id    bigint not null references public.edu_sessions(id) on delete restrict,
  state         text   not null check (state in ('present','late','absent','excused')),
  marked_by     uuid,
  marked_at     timestamptz not null default now(),
  primary key (enrollment_id, session_id)
);
create index if not exists edu_attendance_session on public.edu_attendance(session_id);   -- 회차마다 세기·명단(기본 키는 신청 줄 쪽)

alter table public.edu_courses     enable row level security;
alter table public.edu_sessions    enable row level security;
alter table public.edu_enrollments enable row level security;
alter table public.edu_attendance  enable row level security;
revoke all on public.edu_courses, public.edu_sessions, public.edu_enrollments, public.edu_attendance from public, anon, authenticated;
grant all on public.edu_courses, public.edu_sessions, public.edu_enrollments, public.edu_attendance to service_role;
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

-- 취소 — 성도님은 첫 날 전날까지(첫 날 = 첫 회차 날, 회차가 없으면 교육 시작일, 둘 다 없으면 언제든). 담당자는 언제든.
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
    select coalesce(min(s.on_date), (select starts_on from public.edu_courses where id = cid)) into first_day
      from public.edu_sessions s where s.course_id = cid;   -- 집계라 회차가 없어도 한 줄이 나온다
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
  -- 끝난·보관된 강좌의 신청은 안 바꾼다(edu_apply 담당자 길·edu_sessions_replace 와 같다) — 취소(edu_cancel)는 그대로 된다
  if c.status in ('done','archived') then return jsonb_build_object('ok',false,'error','course-closed'); end if;
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

-- 빈자리 채우기 — 담당자가 정원을 늘렸을 때(교회 어드민 eduCourseSave). 선착순 강좌만, 대기 첫 분부터 정원이 찰 때까지 올린다.
--   이게 없으면 정원을 늘려도 대기하신 분은 그대로이고, 다음에 앱으로 신청한 분이 먼저 확정된다(새치기).
--   ⚠️ edu_apply 가 「대기자가 있으면 확정 안 함」으로 바꾸지 않는다 — 담당자가 일부러 빈자리 옆에 대기로 내린 분이 있을 수 있다.
--   승인 강좌·끝난·보관된 강좌는 아무것도 안 하고 promoted 0. 차례: 강좌 줄 for update → 신청 줄(edu_promote 안 · 다른 함수와 같다).
create or replace function public.edu_course_refill(p_course uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.edu_courses; w bigint; n int := 0;
begin
  select * into c from public.edu_courses where id = p_course for update;
  if not found then return jsonb_build_object('ok',false,'error','not-found'); end if;
  if c.mode <> 'auto' or c.status in ('done','archived') then return jsonb_build_object('ok',true,'promoted',0); end if;
  loop
    w := edu_promote(p_course);          -- 정원이 찼거나(capacity null 이면 안 참) 대기자가 없으면 null
    exit when w is null;
    n := n + 1;
  end loop;
  return jsonb_build_object('ok',true,'promoted',n);
end $$;

revoke all on function public.edu_today() from public, anon, authenticated;
revoke all on function public.edu_apply(uuid, uuid, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.edu_promote(uuid, bigint) from public, anon, authenticated, service_role;   -- 안쪽에서만 부른다(강좌 줄 잠근 채) · service_role 도 안 준다
revoke all on function public.edu_cancel(bigint, boolean) from public, anon, authenticated;
revoke all on function public.edu_staff_set(bigint, text, boolean) from public, anon, authenticated;
revoke all on function public.edu_course_refill(uuid) from public, anon, authenticated;
grant execute on function public.edu_today() to service_role;
grant execute on function public.edu_apply(uuid, uuid, jsonb, boolean) to service_role;
grant execute on function public.edu_cancel(bigint, boolean) to service_role;
grant execute on function public.edu_staff_set(bigint, text, boolean) to service_role;
grant execute on function public.edu_course_refill(uuid) to service_role;

-- 강좌별 신청 수 — 쪽 넘기기 없이 한 번에(PostgREST 1,000줄 한도에 안 걸리게 · 교회 어드민이 rpc 로 부른다).
--   p_ids 에 든 강좌는 신청이 없어도 0 줄로 돌려준다.
create or replace function public.edu_course_counts(p_ids uuid[])
returns table(course_id uuid, applied int, confirmed int, waitlisted int)
language sql stable security definer set search_path = public as $$
  select i.id,
         (count(e.id) filter (where e.status = 'applied'))::int,
         (count(e.id) filter (where e.status = 'confirmed'))::int,
         (count(e.id) filter (where e.status = 'waitlisted'))::int
  from unnest(coalesce(p_ids, array[]::uuid[])) as i(id)
  left join public.edu_enrollments e on e.course_id = i.id and e.status in ('applied','confirmed','waitlisted')
  group by i.id
$$;

-- 회차 통째로 바꾸기 — 한 트랜잭션 · **id 로 맞춘다**(2단계 검토 2026-10-05: 번호로 맞추면 가운데 회차를 지우고 번호를 당길 때
--   출석이 다른 날짜로 밀리고 has-attendance 도 비켜 갔다).
--   p_rows = [{id?, no, on_date, start_time, end_time, topic, place}…]
--     · id 가 있는 줄(이 강좌의 회차) → 그 줄을 고친다(날짜·시각·주제·장소·번호) · 이 강좌 것이 아니거나 없는 id 면 bad-rows
--     · 목록에 없는 기존 회차 → 지운다. 그 가운데 출석이 있는 회차가 있으면 아무것도 안 바꾸고 has-attendance(nos = 그 회차의 **지금** 번호)
--     · id 가 없는 줄 → 새 회차
--     · no 는 보여 주는 차례만 — 마음대로 다시 매겨도 된다(unique 를 이 함수 안에서 미뤘다가 끝에 본다)
--   그 밖 거절: not-found · course-closed(끝·보관) · bad-rows(배열 아님 · 번호·날짜 없음 · 번호 1~200 밖 · 같은 번호·같은 id 둘)
create or replace function public.edu_sessions_replace(p_course uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.edu_courses; n int; held jsonb;
begin
  select * into c from public.edu_courses where id = p_course for update;
  if not found then return jsonb_build_object('ok',false,'error','not-found'); end if;
  if c.status in ('done','archived') then return jsonb_build_object('ok',false,'error','course-closed'); end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then return jsonb_build_object('ok',false,'error','bad-rows'); end if;
  if exists (select 1 from jsonb_array_elements(p_rows) as e(v) where jsonb_typeof(e.v) <> 'object') then
    return jsonb_build_object('ok',false,'error','bad-rows');
  end if;
  -- 줄 확인(검사가 모두 끝난 뒤에만 쓴다)
  if exists (select 1 from jsonb_to_recordset(p_rows) as r(id bigint, no int, on_date date)
             where r.no is null or r.on_date is null or r.no not between 1 and 200) then
    return jsonb_build_object('ok',false,'error','bad-rows');
  end if;
  if (select count(r.no) - count(distinct r.no) from jsonb_to_recordset(p_rows) as r(no int)) > 0
     or (select count(r.id) - count(distinct r.id) from jsonb_to_recordset(p_rows) as r(id bigint)) > 0 then
    return jsonb_build_object('ok',false,'error','bad-rows');
  end if;
  if exists (select 1 from jsonb_to_recordset(p_rows) as r(id bigint)
             where r.id is not null and not exists (select 1 from public.edu_sessions s where s.id = r.id and s.course_id = p_course)) then
    return jsonb_build_object('ok',false,'error','bad-rows');      -- 다른 강좌의 회차 id · 없는 id
  end if;
  -- 지울 회차(목록에 id 가 없는 기존 회차) 가운데 출석이 있는 것 — 있으면 멈춘다
  select jsonb_agg(s.no order by s.no) into held
    from public.edu_sessions s
    where s.course_id = p_course
      and not exists (select 1 from jsonb_to_recordset(p_rows) as r(id bigint) where r.id = s.id)
      and exists (select 1 from public.edu_attendance a where a.session_id = s.id);
  if held is not null then return jsonb_build_object('ok',false,'error','has-attendance','nos',held); end if;

  set constraints public.edu_sessions_course_id_no_key deferred;   -- 번호를 바꾸는 동안 잠깐 겹쳐도 된다(이 트랜잭션 안에서만)
  delete from public.edu_sessions s where s.course_id = p_course
    and not exists (select 1 from jsonb_to_recordset(p_rows) as r(id bigint) where r.id = s.id);
  update public.edu_sessions s set no = r.no, on_date = r.on_date, start_time = r.start_time, end_time = r.end_time,
      topic = coalesce(r.topic,''), place = coalesce(r.place,'')
    from jsonb_to_recordset(p_rows) as r(id bigint, no int, on_date date, start_time time, end_time time, topic text, place text)
    where r.id is not null and s.id = r.id and s.course_id = p_course;
  insert into public.edu_sessions(course_id, no, on_date, start_time, end_time, topic, place)
    select p_course, r.no, r.on_date, r.start_time, r.end_time, coalesce(r.topic,''), coalesce(r.place,'')
    from jsonb_to_recordset(p_rows) as r(id bigint, no int, on_date date, start_time time, end_time time, topic text, place text)
    where r.id is null;
  set constraints public.edu_sessions_course_id_no_key immediate;  -- 여기서 번호 겹침을 본다(위에서 같은 번호를 막았으니 걸리지 않는다)
  n := jsonb_array_length(p_rows);
  return jsonb_build_object('ok',true,'count',n);
end $$;

-- 출석 한 칸 쓰기·지우기(2단계) — 교회 어드민 eduAttendSet 이 부른다(강사·교육 담당·총괄 · 맡은 강좌 확인은 그쪽 서버).
--   p_state: present·late·absent·excused · null 이면 그 칸을 지운다(「다시 누르면 지움」). p_by = 체크한 담당자 admin_members.id.
--   지우기(null)는 확정이 아닌 줄(취소·대기 등 · 같은 강좌)에도 된다 — 확정 뒤 출석하다 취소한 분의 칸을 담당자가 정리할 수 있게
--   (기록 합치기의 merge-edu-attendance 를 푸는 길). 쓰기는 확정만.
--   차례: 회차의 강좌 줄 for update → 신청 줄 for update(다른 함수와 같다 · 교착 막기). 강좌를 잠근 뒤 회차를 다시 본다
--   (edu_sessions_replace 도 강좌 줄을 잠그므로, 잠근 뒤에 회차가 있으면 이 트랜잭션 끝까지 지워지지 않는다).
--   거절: bad-state · not-found(회차·신청) · course-closed(끝·보관) · wrong-course(회차와 신청의 강좌가 다름) · not-confirmed(확정 아님 · 쓰기만).
create or replace function public.edu_attendance_set(p_session bigint, p_enrollment bigint, p_state text, p_by uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cid uuid; c public.edu_courses; e public.edu_enrollments; prev text;
begin
  if p_state is not null and p_state not in ('present','late','absent','excused') then return jsonb_build_object('ok',false,'error','bad-state'); end if;
  select course_id into cid from public.edu_sessions where id = p_session;
  if cid is null then return jsonb_build_object('ok',false,'error','not-found'); end if;
  select * into c from public.edu_courses where id = cid for update;
  if not found then return jsonb_build_object('ok',false,'error','not-found'); end if;
  perform 1 from public.edu_sessions where id = p_session and course_id = cid;      -- 잠그기 전에 지워졌으면
  if not found then return jsonb_build_object('ok',false,'error','not-found'); end if;
  if c.status in ('done','archived') then return jsonb_build_object('ok',false,'error','course-closed'); end if;
  select * into e from public.edu_enrollments where id = p_enrollment for update;
  if not found then return jsonb_build_object('ok',false,'error','not-found'); end if;
  if e.course_id <> cid then return jsonb_build_object('ok',false,'error','wrong-course'); end if;
  if p_state is null then
    delete from public.edu_attendance where enrollment_id = e.id and session_id = p_session returning state into prev;
    return jsonb_build_object('ok',true,'state',null,'cleared',prev is not null);
  end if;
  if e.status <> 'confirmed' then return jsonb_build_object('ok',false,'error','not-confirmed'); end if;
  insert into public.edu_attendance(enrollment_id, session_id, state, marked_by, marked_at)
    values (e.id, p_session, p_state, p_by, now())
  on conflict (enrollment_id, session_id) do update set state = excluded.state, marked_by = excluded.marked_by, marked_at = excluded.marked_at;
  return jsonb_build_object('ok',true,'state',p_state);
end $$;

-- 「남은 분 모두 ○」(2단계) — 그 회차에서 **아직 체크 안 한** 확정자만 p_state 로. 이미 체크한 칸(지각·공결 등)은 덮지 않는다.
--   차례: 강좌 줄 for update(상태를 바꾸는 함수는 모두 강좌 줄을 먼저 잠그므로 그동안 확정 명단이 바뀌지 않는다).
--   돌려주는 count = 이번에 새로 체크한 수. 거절: bad-state(null 도) · not-found · course-closed.
create or replace function public.edu_attendance_bulk(p_session bigint, p_state text, p_by uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cid uuid; c public.edu_courses; n int;
begin
  if p_state is null or p_state not in ('present','late','absent','excused') then return jsonb_build_object('ok',false,'error','bad-state'); end if;
  select course_id into cid from public.edu_sessions where id = p_session;
  if cid is null then return jsonb_build_object('ok',false,'error','not-found'); end if;
  select * into c from public.edu_courses where id = cid for update;
  if not found then return jsonb_build_object('ok',false,'error','not-found'); end if;
  perform 1 from public.edu_sessions where id = p_session and course_id = cid;
  if not found then return jsonb_build_object('ok',false,'error','not-found'); end if;
  if c.status in ('done','archived') then return jsonb_build_object('ok',false,'error','course-closed'); end if;
  insert into public.edu_attendance(enrollment_id, session_id, state, marked_by, marked_at)
    select e.id, p_session, p_state, p_by, now() from public.edu_enrollments e
    where e.course_id = cid and e.status = 'confirmed'
      and not exists (select 1 from public.edu_attendance a where a.enrollment_id = e.id and a.session_id = p_session)
  on conflict (enrollment_id, session_id) do nothing;
  get diagnostics n = row_count;
  return jsonb_build_object('ok',true,'count',n);
end $$;

revoke all on function public.edu_course_counts(uuid[]) from public, anon, authenticated;
revoke all on function public.edu_sessions_replace(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.edu_attendance_set(bigint, bigint, text, uuid) from public, anon, authenticated;
revoke all on function public.edu_attendance_bulk(bigint, text, uuid) from public, anon, authenticated;
grant execute on function public.edu_course_counts(uuid[]) to service_role;
grant execute on function public.edu_sessions_replace(uuid, jsonb) to service_role;
grant execute on function public.edu_attendance_set(bigint, bigint, text, uuid) to service_role;
grant execute on function public.edu_attendance_bulk(bigint, text, uuid) to service_role;

commit;

-- 확인 — 표 넷·함수 열이 있고, anon·authenticated 권한이 없는지
select 'tables' as t, count(*) from pg_tables where schemaname='public' and tablename in ('edu_courses','edu_sessions','edu_enrollments','edu_attendance')
union all select 'functions', count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('edu_today','edu_apply','edu_promote','edu_cancel','edu_staff_set','edu_course_counts','edu_sessions_replace','edu_course_refill',
    'edu_attendance_set','edu_attendance_bulk')
union all select 'anon/authenticated grants', count(*) from information_schema.role_table_grants
  where table_schema='public' and table_name like 'edu\_%' and grantee in ('anon','authenticated')
union all select 'routine grants', count(*) from information_schema.role_routine_grants
  where routine_schema='public' and routine_name like 'edu\_%' and grantee in ('anon','authenticated');
