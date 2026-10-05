# 교육신청 1단계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 담당자가 교회 어드민에서 강좌를 열고, 성도님이 성경암송 앱에서 신청·취소하고 「내 강좌」에서 상태를 보며, 담당자가 신청 현황에서 확정·대기·반려·대신 등록·엑셀을 하는 데까지(설계 §11 1단계 · 2026년 12월 끝).

**Architecture:** 표 셋(`edu_courses`·`edu_sessions`·`edu_enrollments`)과 SQL 함수 셋(`edu_apply`·`edu_cancel`·`edu_staff_set`)을 성경암송 저장소 `supabase/edu.sql` 에 둔다(사용자 연관 표라 기록 합치기 검사가 읽는 곳). 정원·대기·대기 올림·취소 마감은 **SQL 함수 한 곳**에서만 정한다 — 성경암송 `api`(성도님 다섯 액션)와 교회 어드민 함수(담당자 열 액션)가 같은 함수를 부른다. 화면은 성경암송 `js/edu.js`(새 모듈) · 교회 어드민 `js/menus/education/`(새 묶음 「🎓 교육」).

**Tech Stack:** Supabase(Postgres · Edge Function 둘: v2 `api`, `church-admin`) · Vanilla JS(v2 PWA · 교회 어드민 ES 모듈) · Node 시험(`node --test` · 교회 어드민은 `--experimental-strip-types`)

**설계:** `docs/superpowers/specs/2026-10-05-education-courses-design.md` (§0 친구 결정 · §5 자료 · §6 규칙 · §7 화면 · §8 액션 · §9 게이트 · §11 1단계)

## Global Constraints

- 저장소 둘: 성경암송 `C:\Projects\v2-mh-merge`(가지 `mh-merge` · 올리기 `git push origin mh-merge:main`) · 교회 어드민 `C:\Projects\church-admin`(**새 가지 `education-stage1`** — main 은 푸시=운영).
- 개발 DB `ktpwthwqzgcqcrmsafdo` 먼저 → 운영 `xnomlgydifiqiybervtf`. SQL 은 스크래치 폴더를 link 하고 **절대경로** `-f`. 개발은 users 60 남짓, 운영은 420 넘음 — 확인하고 돌린다.
- 새 표는 그 자리에서 RLS 켜고 `anon`·`authenticated` revoke(카카오 로그인 뒤로 authenticated = 누구나). 함수는 `security definer` + `revoke all … from public, anon, authenticated` + `grant execute … to service_role`.
- **응답에 `user_id`·`ident_key`·`auth_user_id` 를 싣지 않는다**(두 함수 모두). 성경암송 api 는 `user_id` 를 믿는다(기존 방식).
- 성도님 문구에 「상」·「순위」·「1등」 금지. 해요체.
- 교회 어드민: 새 액션 = `authz.ts` `ACTION_ROLES` + `index.ts` case + `tests/server.dev.test.mjs` `PROBE` 셋 함께. 고르기·날짜·시각은 `js/core/picker.js` 만(`<select>`·`type="date"`·`type="time"` 금지). 확인은 `dialog`, 알림 `toast`, 저장 중 `busy()`. 엑셀은 `js/core/xlsx.js`.
- 성경암송: `git add -A`·`stash` 금지 · 경로를 못 박아 커밋 · 공용 파일(`app.js`·`style.css`·`index.ts`·`index.html`)은 내 헝크만. **bump 는 컨트롤러가 반영 때 한 번**(과제 안에서 bump 하지 않는다).
- **플레이 심사 중에는 개인정보 방침·공지를 바꾸지 않는다**(2026-10-03 친구) — 개인정보 안내 세 곳은 과제 11(공개 전)에서, 심사가 끝난 뒤.
- 노출 게이트: 앱 「🎓 교육」은 `app_config.eduOpen` 이 켜졌거나 🧪 시험 참여자(`app_config.ministryTesters` — 교회 어드민 ⚙️ 시스템 → 🧪)일 때만. 서버(`eduApply`)도 같은 문을 본다.
- 1단계에서 하지 않는 것: 출석·강사 역할(2단계) · 수료·수료증·교육 이력 탭·교인명부 잇기(`people_links` kind `edu`)·신청 현황의 교적 표시(맞음·확인 필요)·선수 과정 **검사**(3단계 — 1단계는 안내 글로만) · 알림(4단계).

---

## File Structure

| 저장소 | 파일 | 할 일 |
|---|---|---|
| v2 | Create `supabase/edu.sql` | 표 셋 · 색인 · RLS · 함수 셋(`edu_apply`·`edu_cancel`·`edu_staff_set`) |
| v2 | Create `supabase/tests/edu_apply.dev.sql` | 개발에서만 — 가짜 강좌·계정으로 규칙을 확인하고 ROLLBACK |
| v2 | Create `tests/edu-concurrency.dev.sh` | 개발에서만 — 동시 신청 20건이 정원 10을 안 넘는지 |
| v2 | Modify `supabase/member_merge.sql` | `edu_enrollments` 옮기기·충돌·허용 목록·기록 수·트리거 |
| v2 | Create `supabase/tests/member_merge_edu.dev.sql` | 개발에서만 — 합치기 확인(ROLLBACK) |
| v2 | Modify `supabase/functions/api/index.ts` | `eduList`·`eduCourse`·`eduApply`·`eduCancel`·`eduMine` · `PUBLIC_CONFIG_KEYS` 에 `eduOpen` |
| v2 | Create `tests/edu-smoke.sh` | 읽기·거절만 하는 스모크(`EVT_ENV=prod` 꼴) |
| v2 | Create `js/edu.js` · Modify `js/api.js`·`app.js`·`index.html`·`style.css` | 앱 화면 · 게이트 · 첫 화면 단추 |
| v2 | Create `tests/edu-front.test.cjs` · Modify `tools/preflight.py` | 화면 순수 함수 시험 |
| 교회 어드민 | Create `supabase/sql/010_education_role.sql` | 역할 `education` 한 줄 |
| 교회 어드민 | Create `supabase/functions/church-admin/edu-rules.ts` · `tests/edu-rules.test.mjs` | 순수 규칙(강좌 칸 검사 · 회차 만들기 · 응답 칸 지도 · 엑셀 줄) |
| 교회 어드민 | Create `supabase/functions/church-admin/edu-db.ts` | `makeEdu(db, audit)` — 액션 열 |
| 교회 어드민 | Modify `authz.ts`·`index.ts`·`tests/authz.test.mjs`·`tests/server.dev.test.mjs` | 액션 권한·연결·시험 |
| 교회 어드민 | Create `js/menus/education/courses.js`·`courses-logic.js`·`tests/edu-courses-logic.test.mjs` | 📚 강좌 관리 |
| 교회 어드민 | Create `js/menus/education/enrollments.js`·`enrollments-logic.js`·`tests/edu-enrollments-logic.test.mjs` | 📝 신청 현황 |
| 교회 어드민 | Modify `js/menus/registry.js` | 메뉴 두 줄 · 묶음 아이콘 「교육」 🎓 |

---

### Task 1: 표와 SQL 함수 (`supabase/edu.sql`) — 개발 반영

**Files:**
- Create: `supabase/edu.sql`
- Create: `supabase/tests/edu_apply.dev.sql`
- Create: `tests/edu-concurrency.dev.sh`

**Interfaces:**
- Produces: 표 `edu_courses`·`edu_sessions`·`edu_enrollments` · 함수
  - `edu_apply(p_course uuid, p_user uuid, p_ident jsonb, p_staff boolean default false) returns jsonb` — `{ok, id, status, already?}` | `{ok:false, error}` (`not-found`·`not-open`·`not-yet`·`closed-period`·`full`·`bad-ident`)
  - `edu_cancel(p_enrollment bigint, p_staff boolean default false) returns jsonb` — `{ok, promoted: bigint|null}` | `{ok:false, error}` (`not-found`·`not-active`·`too-late`)
  - `edu_staff_set(p_enrollment bigint, p_status text, p_force boolean default false) returns jsonb` — `{ok, promoted}` | `{ok:false, error}` (`not-found`·`bad-status`·`full`)
  - `p_ident` 모양: `{"ident_key":…, "who_type":…, "group_name":…, "sub_name":…, "name":…}`

- [ ] **Step 1: `supabase/edu.sql` 을 쓴다**

```sql
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
create index if not exists edu_sessions_course on public.edu_sessions(course_id, no);

alter table public.edu_courses     enable row level security;
alter table public.edu_sessions    enable row level security;
alter table public.edu_enrollments enable row level security;
revoke all on public.edu_courses, public.edu_sessions, public.edu_enrollments from public, anon, authenticated;
grant all on public.edu_courses, public.edu_sessions, public.edu_enrollments to service_role;

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
  if v_name = '' or char_length(v_name) > 40 then return jsonb_build_object('ok',false,'error','bad-ident'); end if;
  select * into c from public.edu_courses where id = p_course for update;
  if not found then return jsonb_build_object('ok',false,'error','not-found'); end if;
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
create or replace function public.edu_promote(p_course uuid) returns bigint
language plpgsql security definer set search_path = public as $$
declare c public.edu_courses; n int; w bigint;
begin
  select * into c from public.edu_courses where id = p_course;
  if c.mode <> 'auto' then return null; end if;
  select count(*) into n from public.edu_enrollments where course_id = p_course and status = 'confirmed';
  if c.capacity is not null and n >= c.capacity then return null; end if;
  select id into w from public.edu_enrollments where course_id = p_course and status = 'waitlisted'
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
  select course_id into cid from public.edu_enrollments where id = p_enrollment;
  if cid is null then return jsonb_build_object('ok',false,'error','not-found'); end if;
  perform 1 from public.edu_courses where id = cid for update;            -- 차례: 강좌 → 신청 줄(교착 막기)
  select * into e from public.edu_enrollments where id = p_enrollment for update;
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
  if p_status not in ('confirmed','waitlisted','declined','applied') then return jsonb_build_object('ok',false,'error','bad-status'); end if;
  select * into e from public.edu_enrollments where id = p_enrollment;
  if e.id is null then return jsonb_build_object('ok',false,'error','not-found'); end if;
  select * into c from public.edu_courses where id = e.course_id for update;
  select * into e from public.edu_enrollments where id = p_enrollment for update;
  if e.status = p_status then return jsonb_build_object('ok',true,'promoted',null); end if;
  if p_status = 'confirmed' and not p_force and c.capacity is not null then
    select count(*) into n from public.edu_enrollments where course_id = c.id and status = 'confirmed';
    if n >= c.capacity then return jsonb_build_object('ok',false,'error','full'); end if;
  end if;
  update public.edu_enrollments set status = p_status, updated_at = now(),
    decided_at = case when p_status in ('confirmed','declined') then now() else decided_at end,
    waitlist_at = case when p_status = 'waitlisted' then coalesce(waitlist_at, now()) else waitlist_at end,
    cancelled_at = null
  where id = e.id;
  if e.status = 'confirmed' and p_status <> 'confirmed' then p := edu_promote(c.id); end if;
  return jsonb_build_object('ok',true,'promoted',p);
end $$;

revoke all on function public.edu_today() from public, anon, authenticated;
revoke all on function public.edu_apply(uuid, uuid, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.edu_promote(uuid) from public, anon, authenticated;
revoke all on function public.edu_cancel(bigint, boolean) from public, anon, authenticated;
revoke all on function public.edu_staff_set(bigint, text, boolean) from public, anon, authenticated;
grant execute on function public.edu_today() to service_role;
grant execute on function public.edu_apply(uuid, uuid, jsonb, boolean) to service_role;
grant execute on function public.edu_promote(uuid) to service_role;
grant execute on function public.edu_cancel(bigint, boolean) to service_role;
grant execute on function public.edu_staff_set(bigint, text, boolean) to service_role;

commit;

-- 확인 — 표 셋·함수 다섯이 있고, anon·authenticated 권한이 없는지
select 'tables' as t, count(*) from pg_tables where schemaname='public' and tablename in ('edu_courses','edu_sessions','edu_enrollments')
union all select 'functions', count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('edu_today','edu_apply','edu_promote','edu_cancel','edu_staff_set')
union all select 'anon/authenticated grants', count(*) from information_schema.role_table_grants
  where table_schema='public' and table_name like 'edu\_%' and grantee in ('anon','authenticated');
```

- [ ] **Step 2: 개발 시험 SQL `supabase/tests/edu_apply.dev.sql` 을 쓴다**(가짜 강좌·계정을 만들어 확인하고 전부 되돌린다)

```sql
-- 교육신청 규칙 확인 — **개발에서만**(BEGIN … ROLLBACK). 운영에서 돌리지 않는다.
-- 「통과」가 나오면 끝. 하나라도 어긋나면 raise exception 으로 멈춘다(그때도 ROLLBACK 이라 남는 것 없음).
begin;
do $$
declare cid uuid; aid uuid; u uuid[] := array[]::uuid[]; r jsonb; i int; eid bigint; k text;
begin
  -- 시험 계정 다섯(교구|교육시험|1|||시험N)
  for i in 1..5 loop
    k := '교구|교육시험|1|||시험' || i;
    insert into public.users(identity_key, type, gu, mok, name) values (k, '교구', '교육시험', '1', '시험' || i)
      returning id into aid;
    u := u || aid;
  end loop;
  -- 선착순 정원 2 · 대기 켜짐 · 모집 중 · 회차는 내일부터
  insert into public.edu_courses(title, kind, capacity, mode, waitlist, status) values ('시험 강좌', 'regular', 2, 'auto', true, 'open')
    returning id into cid;
  insert into public.edu_sessions(course_id, no, on_date) values (cid, 1, edu_today() + 1);

  r := edu_apply(cid, u[1], '{"name":"시험1"}'); if r->>'status' <> 'confirmed' then raise exception '1: %', r; end if;
  r := edu_apply(cid, u[2], '{"name":"시험2"}'); if r->>'status' <> 'confirmed' then raise exception '2: %', r; end if;
  r := edu_apply(cid, u[3], '{"name":"시험3"}'); if r->>'status' <> 'waitlisted' then raise exception '3: %', r; end if;
  r := edu_apply(cid, u[4], '{"name":"시험4"}'); if r->>'status' <> 'waitlisted' then raise exception '4: %', r; end if;
  r := edu_apply(cid, u[1], '{"name":"시험1"}'); if (r->>'already')::boolean is not true then raise exception '중복: %', r; end if;

  -- 확정 한 분 취소 → 대기 첫 분(시험3) 확정
  select id into eid from public.edu_enrollments where course_id = cid and user_id = u[1];
  r := edu_cancel(eid, false);
  if (select status from public.edu_enrollments where course_id = cid and user_id = u[3]) <> 'confirmed' then raise exception '대기 올림: %', r; end if;
  if (select status from public.edu_enrollments where course_id = cid and user_id = u[4]) <> 'waitlisted' then raise exception '둘째 대기는 그대로'; end if;

  -- 취소했던 분이 다시 신청 → 정원 찼으니 대기(줄은 하나 · 되살림)
  r := edu_apply(cid, u[1], '{"name":"시험1"}'); if r->>'status' <> 'waitlisted' then raise exception '다시 신청: %', r; end if;
  if (select count(*) from public.edu_enrollments where course_id = cid and user_id = u[1]) <> 1 then raise exception '줄이 둘'; end if;

  -- 담당자 확정은 정원을 본다 · force 면 넘긴다
  select id into eid from public.edu_enrollments where course_id = cid and user_id = u[4];
  r := edu_staff_set(eid, 'confirmed', false); if r->>'error' <> 'full' then raise exception '정원: %', r; end if;
  r := edu_staff_set(eid, 'confirmed', true);  if (r->>'ok')::boolean is not true then raise exception 'force: %', r; end if;

  -- 첫 회차 당일에는 성도님 취소 불가 · 담당자는 됨
  update public.edu_sessions set on_date = edu_today() where course_id = cid;
  select id into eid from public.edu_enrollments where course_id = cid and user_id = u[2];
  r := edu_cancel(eid, false); if r->>'error' <> 'too-late' then raise exception '마감: %', r; end if;
  r := edu_cancel(eid, true);  if (r->>'ok')::boolean is not true then raise exception '담당자 취소: %', r; end if;

  -- 승인 강좌 — 신청은 applied · 대기 없는 선착순은 full
  update public.edu_courses set mode = 'approve' where id = cid;
  r := edu_apply(cid, u[5], '{"name":"시험5"}'); if r->>'status' <> 'applied' then raise exception '승인: %', r; end if;
  update public.edu_courses set mode = 'auto', waitlist = false, capacity = 1 where id = cid;
  delete from public.edu_enrollments where course_id = cid and user_id = u[5];
  r := edu_apply(cid, u[5], '{"name":"시험5"}'); if r->>'error' <> 'full' then raise exception '대기 없음: %', r; end if;

  -- 모집 전·후·준비 중
  update public.edu_courses set waitlist = true, capacity = null, status = 'draft' where id = cid;
  r := edu_apply(cid, u[5], '{"name":"시험5"}'); if r->>'error' <> 'not-open' then raise exception 'draft: %', r; end if;
  update public.edu_courses set status = 'open', apply_from = edu_today() + 1 where id = cid;
  r := edu_apply(cid, u[5], '{"name":"시험5"}'); if r->>'error' <> 'not-yet' then raise exception 'not-yet: %', r; end if;
  -- 담당자 대신 등록은 창을 건너뛴다 · 계정 없는 새가족은 신원 키로 한 줄
  r := edu_apply(cid, null, '{"name":"새가족","ident_key":"새가족|홍길동"}', true); if r->>'status' <> 'confirmed' then raise exception '대신: %', r; end if;
  r := edu_apply(cid, null, '{"name":"새가족","ident_key":"새가족|홍길동"}', true); if (r->>'already')::boolean is not true then raise exception '대신 중복: %', r; end if;

  raise notice '통과';
end $$;
rollback;
```

- [ ] **Step 3: 동시 신청 시험 `tests/edu-concurrency.dev.sh` 을 쓴다**(따로 연결 20개가 같은 강좌에 신청 — 정원 10을 안 넘어야)

```bash
#!/usr/bin/env bash
# 교육신청 동시 신청 — **개발에서만**. 정원 10 강좌에 서로 다른 시험 계정 20개가 동시에 edu_apply → 확정 10 · 대기 10.
#   쓰는 법: WORK=<개발을 link 한 스크래치 폴더> bash tests/edu-concurrency.dev.sh
#   ⚠️ 시험 강좌·계정을 만들고 끝에 지운다(교구 「교육시험」 · 강좌 제목 「동시 신청 시험」).
set -euo pipefail
: "${WORK:?WORK=<개발 link 폴더>}"
q() { supabase --workdir "$WORK" db query --linked "$1" 2>&1; }
USERS=$(q "select count(*) as n from users" | grep -o '"n": [0-9]*' | grep -o '[0-9]*$')
[ "$USERS" -lt 200 ] || { echo "users=$USERS — 운영 같다. 멈춘다"; exit 1; }
CID=$(q "insert into edu_courses(title,kind,capacity,mode,waitlist,status) values('동시 신청 시험','lecture',10,'auto',true,'open') returning id" | grep -o '"id": "[^"]*"' | cut -d'"' -f4)
for i in $(seq 1 20); do
  q "insert into users(identity_key,type,gu,mok,name) values('교구|교육시험|9|||동시$i','교구','교육시험','9','동시$i') on conflict do nothing" >/dev/null
done
for i in $(seq 1 20); do
  q "select edu_apply('$CID', (select id from users where identity_key='교구|교육시험|9|||동시$i'), '{\"name\":\"동시$i\"}'::jsonb)" >/dev/null &
done
wait
OUT=$(q "select status, count(*) as n from edu_enrollments where course_id='$CID' group by status order by status")
echo "$OUT" | grep -E '"status"|"n"'
CONF=$(echo "$OUT" | tr -d '\n ' | grep -o '"n":[0-9]*,"status":"confirmed"' | grep -o '[0-9]*' | head -1 || true)
q "delete from edu_enrollments where course_id='$CID'; delete from edu_courses where id='$CID'; delete from users where identity_key like '교구|교육시험|9|||동시%'" >/dev/null
[ "${CONF:-0}" = "10" ] && echo "통과 — 확정 10" || { echo "실패 — 확정 ${CONF:-?}"; exit 1; }
```

- [ ] **Step 4: 개발에 돌린다**

```bash
W=<스크래치>/edu-dev; mkdir -p "$W" && supabase --workdir "$W" link --project-ref ktpwthwqzgcqcrmsafdo --yes
supabase --workdir "$W" db query --linked "select count(*) as users from users"        # 60 남짓이어야(400 넘으면 멈춘다)
supabase --workdir "$W" db query --linked -f "C:/Projects/v2-mh-merge/supabase/edu.sql"
supabase --workdir "$W" db query --linked -f "C:/Projects/v2-mh-merge/supabase/tests/edu_apply.dev.sql"
WORK="$W" bash tests/edu-concurrency.dev.sh
```
Expected: 확인 select 가 `tables 3 · functions 5 · anon/authenticated grants 0` · 시험 SQL 이 오류 없이 끝남(NOTICE 「통과」) · 동시 신청 「통과 — 확정 10」.
⚠️ `users` 의 칸 이름이 위 insert 와 다르면(예: `type`·`gu`·`mok` 외 필수 칸) `supabase/schema.sql` 의 `users` 정의를 보고 시험 insert 를 맞춘다 — 본 파일(`edu.sql`)은 users 칸을 쓰지 않는다.

- [ ] **Step 5: 커밋**

```bash
git add supabase/edu.sql supabase/tests/edu_apply.dev.sql tests/edu-concurrency.dev.sh
git commit -m "feat(교육신청): 표 셋·정원/대기/취소 마감 SQL 함수(edu_apply·edu_cancel·edu_staff_set) · 개발 시험 둘 · 개발 반영"
```

---

### Task 2: 기록 합치기가 `edu_enrollments` 를 안다

**Files:**
- Modify: `supabase/member_merge.sql` (다섯 자리 — 아래)
- Create: `supabase/tests/member_merge_edu.dev.sql`
- Test: `tests/member-merge-coverage.test.cjs`(고치지 않는다 — 통과해야 한다)

**Interfaces:**
- Consumes: Task 1 의 `edu_enrollments(course_id, user_id, status …)`
- Produces: 합치기 오류 `merge-edu-conflict`(두 계정이 같은 강좌에 **살아 있는** 신청 — applied·confirmed·waitlisted — 이 함께 있을 때)

⚠️ 다른 세션(e5 — 가지 `autumn-auto-sql`)이 이 파일을 고치고 있을 수 있다. 시작 전에 `git fetch && git rebase origin/main` · 끝나면 바로 커밋.

- [ ] **Step 1: 고치기 전 검사가 걸리는지 본다**

Run: `node --test tests/member-merge-coverage.test.cjs`
Expected: FAIL — `edu_enrollments` 가 합치기 본체·FK 허용 목록·user_id 허용 목록에 없다는 메시지(과제 1 의 `edu.sql` 을 읽는다).

- [ ] **Step 2: `supabase/member_merge.sql` 다섯 자리**

(1) 쓰기 연결 트리거 목록(78~81줄 근처 `foreach t in array array['progress', … 'ios_push_tokens','ministry_history_requests']`)에 `'edu_enrollments'` 를 더한다:
```sql
    'pilsa_orders','ministry_orders','event_signups','daily_activity',
    'ios_push_tokens','ministry_history_requests','edu_enrollments'] loop
```
(2) `member_merge_counts` 목록(115~118줄 근처)의 배열 끝에 `'edu_enrollments'`:
```sql
    'blessing_log','daily_activity','feature_log','ios_push_tokens','ministry_history_requests','edu_enrollments'] loop
```
(3) 충돌 검사 — `merge-signup-conflict` 블록(185~190줄 근처) 바로 뒤에:
```sql
  if to_regclass('public.edu_enrollments') is not null then
    -- 두 계정이 같은 강좌에 **살아 있는** 신청(신청·확정·대기 · 그리고 반려 — 2026-10-05 친구 「반려 유지」: 반려는 담당자가 정한 기록이라
    --   합치면서 지우거나 덮지 않는다)을 함께 가지면 멈춘다 — 담당자가 한쪽을 정리한 뒤 합친다.
    if exists(select 1 from public.edu_enrollments a join public.edu_enrollments b on a.course_id=b.course_id
      where a.user_id=s.id and b.user_id=t.id
        and a.status in ('applied','confirmed','waitlisted','declined') and b.status in ('applied','confirmed','waitlisted','declined')) then
      return jsonb_build_object('ok',false,'error','merge-edu-conflict');
    end if;
    -- 같은 강좌에 두 줄이 남지 않게(unique(course_id,user_id)) — 한쪽이 **취소** 줄이면 취소 줄을 지운다(반려는 위에서 멈췄다).
    --   원본이 취소면 원본 줄을, 남는 쪽이 취소면 남는 쪽 줄을. 둘 다 취소면 원본 줄만(남는 쪽 기록을 남긴다).
    delete from public.edu_enrollments a using public.edu_enrollments b
      where a.course_id=b.course_id and a.user_id=s.id and b.user_id=t.id
        and a.status = 'cancelled';
    delete from public.edu_enrollments b using public.edu_enrollments a
      where a.course_id=b.course_id and a.user_id=s.id and b.user_id=t.id
        and b.status = 'cancelled';
  end if;
```
(4) FK 허용 목록(198~200줄 근처 `if ref.tbl::text not in (…)`)과 user_id 허용 목록(209~213줄 근처 `and c.table_name not in (…)`) 끝에 각각 `'edu_enrollments'`.
(5) 소유자 옮기기(343~347줄 근처 `table_name in ('challenge_log', … 'user_identity_aliases')`) 목록에 `'edu_enrollments'`.
그리고 머리 「실행 순서」 2) 줄에 `edu.sql (2026-10-05 · 교육신청)` 을 더한다.

- [ ] **Step 3: 검사 통과 확인**

Run: `node --test tests/member-merge-coverage.test.cjs`
Expected: PASS

- [ ] **Step 4: 개발 합치기 시험 `supabase/tests/member_merge_edu.dev.sql`**

```sql
-- 교육신청 × 기록 합치기 — **개발에서만**(BEGIN … ROLLBACK). 「통과」가 나오면 끝.
begin;
do $$
declare s uuid; t uuid; c1 uuid; c2 uuid; r jsonb;
begin
  insert into public.users(identity_key,type,gu,mok,name) values ('교구|교육시험|7|||합치기원본','교구','교육시험','7','합치기원본') returning id into s;
  insert into public.users(identity_key,type,gu,mok,name) values ('교구|교육시험|7|||합치기대상','교구','교육시험','7','합치기대상') returning id into t;
  insert into public.edu_courses(title,kind,status) values ('합치기 강좌1','lecture','open') returning id into c1;
  insert into public.edu_courses(title,kind,status) values ('합치기 강좌2','lecture','open') returning id into c2;
  -- 서로 다른 강좌 — 옮겨진다
  perform edu_apply(c1, s, '{"name":"합치기원본"}');
  perform edu_apply(c2, t, '{"name":"합치기대상"}');
  r := public.admin_merge_members(s, t, '교구|교육시험|7|||합치기원본', '교구|교육시험|7|||합치기대상', '시험');
  if (r->>'ok')::boolean is not true then raise exception '합치기: %', r; end if;
  if (select count(*) from public.edu_enrollments where user_id = t) <> 2 then raise exception '옮기기'; end if;
  raise notice '통과';
end $$;
rollback;
```
⚠️ `admin_merge_members` 의 실제 인자 꼴은 `member_merge.sql` 의 함수 머리를 보고 맞춘다(위는 「원본·대상·원본 키·대상 키·까닭」 꼴로 적었다 — 다르면 맞춘다). 충돌 경우(두 계정 같은 강좌 confirmed → `merge-edu-conflict`)도 같은 파일에 한 덩어리 더한다.

- [ ] **Step 5: 개발 반영과 확인**

```bash
supabase --workdir "$W" db query --linked -f "C:/Projects/v2-mh-merge/supabase/member_merge.sql"
supabase --workdir "$W" db query --linked -f "C:/Projects/v2-mh-merge/supabase/tests/member_merge_edu.dev.sql"
supabase --workdir "$W" db query --linked -f "C:/Projects/v2-mh-merge/supabase/tests/member_merge_consents.dev.sql"
supabase --workdir "$W" db query --linked -f "C:/Projects/v2-mh-merge/supabase/tests/member_merge_requests_devices.dev.sql"
```
Expected: 넷 다 오류 없이 끝(기존 두 시험도 그대로 통과).

- [ ] **Step 6: 커밋**

```bash
git add supabase/member_merge.sql supabase/tests/member_merge_edu.dev.sql
git commit -m "feat(교육신청): 기록 합치기가 edu_enrollments 를 안다 — 옮기기·같은 강좌 살아 있는 신청 충돌(merge-edu-conflict)·허용 목록·기록 수·트리거 · 개발 반영"
```

---

### Task 3: 교회 어드민 — 역할과 순수 규칙 (`edu-rules.ts`)

**Files (church-admin · 가지 `education-stage1`):**
- Create: `supabase/sql/010_education_role.sql`
- Create: `supabase/functions/church-admin/edu-rules.ts`
- Create: `tests/edu-rules.test.mjs`

**Interfaces:**
- Produces (`edu-rules.ts`):
  - `EDU_KINDS = ["regular","lecture","training"]` · `EDU_KIND_LABEL = {regular:"정규 과정", lecture:"특강·세미나", training:"교사·사역자 교육"}`
  - `EDU_STATUS = ["draft","open","closed","running","done","archived"]` · `EDU_STATUS_LABEL`
  - `ENROLL_STATUS_LABEL = {applied:"신청", confirmed:"확정", waitlisted:"대기", cancelled:"취소", declined:"반려"}`
  - `checkCourse(input) → {ok:true, row} | {ok:false, error}` — DB 줄 꼴로 다듬기(오류: `no-title`·`bad-kind`·`bad-capacity`·`bad-mode`·`bad-date`·`bad-range`·`bad-pct`·`too-long`·`bad-status`)
  - `makeSessions(start "YYYY-MM-DD", count, everyDays=7, {start_time,end_time}) → [{no,on_date,start_time,end_time}]`
  - `checkSessions(list) → {ok, rows} | {ok:false, error}`(`bad-no`·`bad-date`·`dup-no`·`too-many`)
  - `courseOut(row, counts)` · `enrollOut(row, waitNo)` — 응답 칸 지도(`user_id`·`ident_key` 없음)
  - `exportRows(course, enrollments) → string[][]`(엑셀 줄 · 머리 포함)

- [ ] **Step 1: 역할 SQL `supabase/sql/010_education_role.sql`**

```sql
-- 교회 어드민 — 교육 담당 역할(2026-10-05 · 설계 v2 docs/superpowers/specs/2026-10-05-education-courses-design.md §4)
-- ⚠️ 개발(ktpwthwqzgcqcrmsafdo) 먼저, 그다음 운영(xnomlgydifiqiybervtf).
-- ⚠️ 역할 한 줄뿐 — 강좌·신청 표는 성경암송 저장소 supabase/edu.sql 의 것(칸·제약·RLS 를 여기서 바꾸지 않는다).
-- 강사(teacher)는 2단계에서 더한다. 여러 번 돌려도 안전하다.
begin;
insert into admin_roles (id, label, description) values
  ('education', '교육', '교육 강좌 만들기 · 신청 현황 · 대신 등록 · 엑셀')
on conflict (id) do nothing;
commit;
select 'role education' as t, count(*) from admin_roles where id = 'education';
```

- [ ] **Step 2: 실패하는 시험 `tests/edu-rules.test.mjs`**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkCourse, makeSessions, checkSessions, courseOut, enrollOut, exportRows, ENROLL_STATUS_LABEL }
  from "../supabase/functions/church-admin/edu-rules.ts";

test("checkCourse — 기본값과 다듬기", () => {
  const r = checkCourse({ title: "  제자훈련  1단계 ", kind: "regular", capacity: "20", mode: "auto",
    apply_from: "2027-01-03", apply_to: "2027-01-24", attend_pct: 80 });
  assert.equal(r.ok, true);
  assert.equal(r.row.title, "제자훈련 1단계");
  assert.equal(r.row.capacity, 20);
  assert.equal(r.row.waitlist, true);
  assert.equal(r.row.status, "draft");
  assert.deepEqual(r.row.prereq_tracks, []);
});

test("checkCourse — 틀린 값", () => {
  assert.equal(checkCourse({ title: "", kind: "regular" }).error, "no-title");
  assert.equal(checkCourse({ title: "a", kind: "x" }).error, "bad-kind");
  assert.equal(checkCourse({ title: "a", kind: "lecture", capacity: 0 }).error, "bad-capacity");
  assert.equal(checkCourse({ title: "a", kind: "lecture", mode: "x" }).error, "bad-mode");
  assert.equal(checkCourse({ title: "a", kind: "lecture", apply_from: "2027-13-01" }).error, "bad-date");
  assert.equal(checkCourse({ title: "a", kind: "lecture", apply_from: "2027-02-01", apply_to: "2027-01-01" }).error, "bad-range");
  assert.equal(checkCourse({ title: "a", kind: "lecture", attend_pct: 101 }).error, "bad-pct");
  assert.equal(checkCourse({ title: "가".repeat(81), kind: "lecture" }).error, "too-long");
  assert.equal(checkCourse({ title: "a", kind: "lecture", status: "x" }).error, "bad-status");
});

test("checkCourse — 정원 빈칸은 제한 없음(null)", () => {
  assert.equal(checkCourse({ title: "a", kind: "lecture", capacity: "" }).row.capacity, null);
});

test("makeSessions — 매주 수요일 8회", () => {
  const s = makeSessions("2027-03-03", 8, 7, { start_time: "19:30", end_time: "21:00" });
  assert.equal(s.length, 8);
  assert.deepEqual(s[0], { no: 1, on_date: "2027-03-03", start_time: "19:30", end_time: "21:00", topic: "", place: "" });
  assert.equal(s[7].on_date, "2027-04-21");
});

test("checkSessions — 번호·날짜·중복", () => {
  assert.equal(checkSessions([{ no: 1, on_date: "2027-03-03" }, { no: 1, on_date: "2027-03-10" }]).error, "dup-no");
  assert.equal(checkSessions([{ no: 0, on_date: "2027-03-03" }]).error, "bad-no");
  assert.equal(checkSessions([{ no: 1, on_date: "x" }]).error, "bad-date");
  assert.equal(checkSessions(Array.from({ length: 201 }, (_, i) => ({ no: i + 1, on_date: "2027-03-03" }))).error, "too-many");
  assert.equal(checkSessions([{ no: 1, on_date: "2027-03-03", start_time: "19:30" }]).ok, true);
});

test("courseOut·enrollOut — user_id·ident_key 를 싣지 않는다", () => {
  const c = courseOut({ id: "c1", title: "t", kind: "lecture", status: "open", capacity: 10, created_at: "x" }, { confirmed: 3, waitlisted: 1, applied: 0 });
  assert.equal(c.counts.confirmed, 3);
  const e = enrollOut({ id: 7, user_id: "u", ident_key: "k", name: "홍길동", who_type: "교구", group_name: "믿음", sub_name: "3",
    status: "waitlisted", source: "app", applied_at: "t", fee_paid: false, staff_note: "" }, 2);
  assert.equal(e.waitNo, 2);
  assert.equal(e.who, "믿음 3목장");
  assert.equal("user_id" in e, false);
  assert.equal("ident_key" in e, false);
  assert.equal(e.hasApp, true);
});

test("exportRows — 머리와 줄", () => {
  const rows = exportRows({ title: "제자훈련", term: "2027 상반기" },
    [{ name: "홍길동", who: "믿음 3목장", status: "confirmed", fee_paid: true, applied_at: "2027-01-05T01:00:00Z", source: "app", staff_note: "" }]);
  assert.deepEqual(rows[0], ["강좌", "학기", "이름", "소속", "상태", "교재비", "신청한 곳", "신청 시각(한국)", "메모"]);
  assert.deepEqual(rows[1].slice(0, 7), ["제자훈련", "2027 상반기", "홍길동", "믿음 3목장", ENROLL_STATUS_LABEL.confirmed, "냄", "앱"]);
});
```

- [ ] **Step 3: 시험이 실패하는지 본다**

Run: `node --experimental-strip-types --test tests/edu-rules.test.mjs`
Expected: FAIL — `Cannot find module …/edu-rules.ts`

- [ ] **Step 4: `supabase/functions/church-admin/edu-rules.ts`**

```ts
// 교육신청 — 순수 규칙(2026-10-05 · 설계 v2 docs/superpowers/specs/2026-10-05-education-courses-design.md §5·§6)
//   서버(edu-db.ts)와 시험(tests/edu-rules.test.mjs)이 같은 파일을 읽는다 — Deno 전용 API·원격 import 금지 · enum 금지.
//   ⚠️ 정원·대기·취소 마감은 여기 없다 — 성경암송 supabase/edu.sql 의 SQL 함수 한 곳(edu_apply·edu_cancel·edu_staff_set).
import { norm } from "./authz.ts";

export const EDU_KINDS = ["regular", "lecture", "training"] as const;
export const EDU_KIND_LABEL: Record<string, string> = { regular: "정규 과정", lecture: "특강·세미나", training: "교사·사역자 교육" };
export const EDU_STATUS = ["draft", "open", "closed", "running", "done", "archived"] as const;
export const EDU_STATUS_LABEL: Record<string, string> = {
  draft: "준비 중", open: "모집 중", closed: "모집 끝", running: "진행 중", done: "끝", archived: "보관",
};
export const ENROLL_STATUS_LABEL: Record<string, string> = {
  applied: "신청", confirmed: "확정", waitlisted: "대기", cancelled: "취소", declined: "반려",
};
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const LIMITS: Record<string, number> = { title: 80, term: 30, description: 2000, teacher_label: 60, place: 80, fee_note: 120, target: 120, track: 40, check_label: 40 };

function isDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function checkCourse(x: any): { ok: true; row: Record<string, unknown> } | { ok: false; error: string } {
  const o = x && typeof x === "object" ? x : {};
  const txt = (k: string) => norm(o[k]);
  const desc = (o.description ?? "").toString().normalize("NFC").trim();   // 설명은 줄바꿈을 살린다
  const title = txt("title");
  if (!title) return { ok: false, error: "no-title" };
  for (const k of Object.keys(LIMITS)) {
    const v = k === "description" ? desc : txt(k);
    if (v.length > LIMITS[k]) return { ok: false, error: "too-long" };
  }
  const kind = txt("kind");
  if (!(EDU_KINDS as readonly string[]).includes(kind)) return { ok: false, error: "bad-kind" };
  const capRaw = o.capacity;
  let capacity: number | null = null;
  if (capRaw !== null && capRaw !== undefined && capRaw !== "") {
    capacity = Number(capRaw);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 2000) return { ok: false, error: "bad-capacity" };
  }
  const mode = txt("mode") || "auto";
  if (mode !== "auto" && mode !== "approve") return { ok: false, error: "bad-mode" };
  const from = txt("apply_from"), to = txt("apply_to");
  if ((from && !isDate(from)) || (to && !isDate(to))) return { ok: false, error: "bad-date" };
  if (from && to && from > to) return { ok: false, error: "bad-range" };
  const pct = o.attend_pct === undefined || o.attend_pct === "" ? 80 : Number(o.attend_pct);
  if (!Number.isInteger(pct) || pct < 0 || pct > 100) return { ok: false, error: "bad-pct" };
  const status = txt("status") || "draft";
  if (!(EDU_STATUS as readonly string[]).includes(status)) return { ok: false, error: "bad-status" };
  const prereq = Array.isArray(o.prereq_tracks) ? o.prereq_tracks.map((s: unknown) => norm(s)).filter(Boolean).slice(0, 10) : [];
  return {
    ok: true,
    row: {
      title, kind, term: txt("term"), description: desc, teacher_label: txt("teacher_label"), place: txt("place"),
      fee_note: txt("fee_note"), target: txt("target"), track: txt("track"), capacity, mode,
      waitlist: o.waitlist === undefined ? true : o.waitlist === true,
      apply_from: from || null, apply_to: to || null, prereq_tracks: prereq, attend_pct: pct,
      check_label: txt("check_label") || null, status,
    },
  };
}

export function makeSessions(start: string, count: number, everyDays = 7, t: { start_time?: string; end_time?: string } = {}) {
  const out = [];
  const base = Date.parse(start + "T00:00:00Z");
  for (let i = 0; i < count; i++) {
    out.push({ no: i + 1, on_date: new Date(base + i * everyDays * 86400000).toISOString().slice(0, 10),
      start_time: t.start_time || null, end_time: t.end_time || null, topic: "", place: "" });
  }
  return out;
}

export function checkSessions(list: any[]): { ok: true; rows: any[] } | { ok: false; error: string } {
  if (!Array.isArray(list)) return { ok: false, error: "bad-no" };
  if (list.length > 200) return { ok: false, error: "too-many" };
  const seen = new Set<number>();
  const rows = [];
  for (const s of list) {
    const no = Number(s?.no);
    if (!Number.isInteger(no) || no < 1 || no > 200) return { ok: false, error: "bad-no" };
    if (seen.has(no)) return { ok: false, error: "dup-no" };
    seen.add(no);
    const d = norm(s?.on_date);
    if (!isDate(d)) return { ok: false, error: "bad-date" };
    const st = norm(s?.start_time), et = norm(s?.end_time);
    if ((st && !TIME_RE.test(st)) || (et && !TIME_RE.test(et))) return { ok: false, error: "bad-date" };
    rows.push({ no, on_date: d, start_time: st || null, end_time: et || null,
      topic: norm(s?.topic).slice(0, 80), place: norm(s?.place).slice(0, 80) });
  }
  rows.sort((a, b) => a.no - b.no);
  return { ok: true, rows };
}

export function whoOf(r: { who_type?: string; group_name?: string; sub_name?: string }): string {
  const g = norm(r.group_name), s = norm(r.sub_name);
  if (r.who_type === "교회학교") return [g, s].filter(Boolean).join(" ");
  if (!g && !s) return "";
  return g + (s ? " " + (/^\d+$/.test(s) ? s + "목장" : s) : "");
}

export function courseOut(r: any, counts: { confirmed: number; waitlisted: number; applied: number }) {
  return {
    id: r.id, title: r.title, kind: r.kind, kindLabel: EDU_KIND_LABEL[r.kind] || r.kind, term: r.term || "",
    description: r.description || "", teacher: r.teacher_label || "", place: r.place || "", fee: r.fee_note || "",
    target: r.target || "", track: r.track || "", capacity: r.capacity ?? null, mode: r.mode, waitlist: !!r.waitlist,
    applyFrom: r.apply_from || null, applyTo: r.apply_to || null, prereq: r.prereq_tracks || [],
    attendPct: r.attend_pct, checkLabel: r.check_label || null, status: r.status,
    statusLabel: EDU_STATUS_LABEL[r.status] || r.status, updatedAt: r.updated_at || null,
    counts: { confirmed: counts.confirmed || 0, waitlisted: counts.waitlisted || 0, applied: counts.applied || 0 },
  };
}

export function enrollOut(r: any, waitNo: number | null) {
  return {
    id: r.id, name: r.name, who: whoOf(r), status: r.status, statusLabel: ENROLL_STATUS_LABEL[r.status] || r.status,
    source: r.source, hasApp: !!r.user_id, appliedAt: r.applied_at, decidedAt: r.decided_at || null,
    feePaid: !!r.fee_paid, note: r.staff_note || "", waitNo,
  };
}

const kstStamp = (iso: string) => {
  const t = Date.parse(iso);
  if (isNaN(t)) return "";
  return new Date(t + 9 * 3600000).toISOString().slice(0, 16).replace("T", " ");
};

export function exportRows(course: { title: string; term?: string }, list: any[]): string[][] {
  const head = ["강좌", "학기", "이름", "소속", "상태", "교재비", "신청한 곳", "신청 시각(한국)", "메모"];
  return [head, ...list.map((e) => [course.title, course.term || "", e.name, e.who, ENROLL_STATUS_LABEL[e.status] || e.status,
    e.fee_paid || e.feePaid ? "냄" : "", e.source === "staff" ? "담당자" : "앱", kstStamp(e.applied_at || e.appliedAt || ""),
    e.staff_note || e.note || ""])];
}
```

- [ ] **Step 5: 시험 통과**

Run: `node --experimental-strip-types --test tests/edu-rules.test.mjs`
Expected: PASS (7 tests)

- [ ] **Step 6: 개발 역할 넣기**

```bash
supabase --workdir ~/.church-admin/supa-dev db query --linked -f "C:/Projects/church-admin/supabase/sql/010_education_role.sql"
```
Expected: `role education 1`

- [ ] **Step 7: 커밋**

```bash
git add supabase/sql/010_education_role.sql supabase/functions/church-admin/edu-rules.ts tests/edu-rules.test.mjs
git commit -m "feat(교육): 역할 education · 순수 규칙(강좌 칸 검사·회차 만들기·응답 칸 지도·엑셀 줄)"
```

---

### Task 4: 교회 어드민 — 서버 액션 (`edu-db.ts`) · 권한 · 개발 배포

**Files (church-admin):**
- Create: `supabase/functions/church-admin/edu-db.ts`
- Modify: `supabase/functions/church-admin/authz.ts`(ACTION_ROLES 열 줄) · `supabase/functions/church-admin/index.ts`(import + case 열 줄) · `tests/authz.test.mjs`(knownRoles 기대값) · `tests/server.dev.test.mjs`(PROBE 열 줄 + 동작 시험)

**Interfaces:**
- Consumes: Task 1 SQL 함수 · Task 3 `checkCourse`·`checkSessions`·`courseOut`·`enrollOut`·`exportRows`·`whoOf`
- Produces (액션 · 역할 `education`):
  - `eduCourses({term?}) → {ok, terms: string[], courses: CourseOut[]}`
  - `eduCourseSave({course:{id?, …}}) → {ok, id}` (기록 `edu.course.save`)
  - `eduCourseCopy({id, term}) → {ok, id}` (상태 draft · 신청 없이 · 회차 날짜는 그대로 복사 — 화면이 고친다)
  - `eduSessionsSave({course_id, sessions:[…]}) → {ok, count}` (그 강좌 회차를 통째로 바꿈 · 기록 `edu.sessions`)
  - `eduSessions({course_id}) → {ok, sessions}`
  - `eduEnrollList({course_id}) → {ok, course, enrollments: EnrollOut[]}`
  - `eduEnrollSet({id, op:"confirm"|"waitlist"|"decline"|"cancel"|"reopen", force?}) → {ok, promoted}` (`edu_staff_set`·`edu_cancel(p_staff)` · 기록 `edu.enroll.set`)
  - `eduEnrollAdd({course_id, person_id?, ident?}) → {ok, id, status, already?}` — person_id 면 교인명부 줄 → 소속·이름 → 같은 신원의 앱 계정이 있으면 그 계정(조회만) · ident 면 직접 입력(새가족) · `edu_apply(…, p_staff=true)` · 기록 `edu.enroll.add`
  - `eduFeeSet({id, paid, note?}) → {ok}` (기록 `edu.enroll.fee`)
  - `eduExport({course_id}) → {ok, rows: string[][]}` (기록 `edu.export` {count})
  - `eduPeopleLookup({name}) → evPeopleLookup 과 같은 모양`(교인명부에서 찾기 — `people.lookup` 기록)

- [ ] **Step 1: `authz.ts` 에 열한 줄**(ACTION_ROLES 끝, `historyExport` 다음)

```ts
  // 교육신청 1단계(2026-10-05 · 설계 v2 docs/superpowers/specs/2026-10-05-education-courses-design.md) — 역할 education.
  //   강좌 만들기·회차·신청 현황·대신 등록·엑셀. 정원·대기 규칙은 성경암송 supabase/edu.sql 의 SQL 함수가 정한다(여기서 상태를 직접 쓰지 않는다).
  //   응답에 user_id·ident_key 없음(edu-rules.ts 칸 지도) · 쓰기는 바꾼 기록 edu.*(이름 없이 id·수만).
  eduCourses: "education",
  eduCourseSave: "education",
  eduCourseCopy: "education",
  eduSessions: "education",
  eduSessionsSave: "education",
  eduEnrollList: "education",
  eduEnrollSet: "education",
  eduEnrollAdd: "education",
  eduFeeSet: "education",
  eduExport: "education",
  eduPeopleLookup: "education",
```

- [ ] **Step 2: `tests/authz.test.mjs` 의 knownRoles 기대값**(59줄 근처) — `"education"` 을 더한다:

```js
  assert.deepEqual(knownRoles(), ["bibleevent", "directory", "education", "ministry", "super"]);
```
그리고 파일 끝에 시험 하나:
```js
test("education 액션 × 사람 — 교육 역할·총괄만 통과", () => {
  const cases = [
    [null, "not-registered"],
    [{ status: "pending", roles: ["education"] }, "pending"],
    [{ status: "active", roles: ["ministry"] }, "forbidden"],
    [{ status: "active", roles: ["education"] }, "ok"],
    [{ status: "active", roles: ["super"] }, "ok"],
  ];
  const acts = Object.keys(ACTION_ROLES).filter((k) => ACTION_ROLES[k] === "education");
  assert.deepEqual(acts.sort(), ["eduCourseCopy", "eduCourseSave", "eduCourses", "eduEnrollAdd", "eduEnrollList", "eduEnrollSet",
    "eduExport", "eduFeeSet", "eduPeopleLookup", "eduSessions", "eduSessionsSave"]);
  for (const a of acts) for (const [m, want] of cases) assert.equal(canCall(a, m), want, a);
});
```
Run: `node --experimental-strip-types --test tests/authz.test.mjs` → PASS(ministry 시험의 knownRoles 줄도 같은 값으로 고쳐야 통과 — 59줄).

- [ ] **Step 3: `supabase/functions/church-admin/edu-db.ts`**

```ts
// 교육신청 — 표를 읽고 쓰는 쪽(서버 · 2026-10-05 · 설계 v2 docs/superpowers/specs/2026-10-05-education-courses-design.md §8)
//   규칙·칸 지도는 edu-rules.ts(순수), 정원·대기·취소는 SQL 함수(성경암송 supabase/edu.sql). index.ts 의 switch 가 makeEdu(...) 의 함수를 부른다.
// ⚠️ npm import 를 두지 않는다 — db(supabase 클라이언트)를 받아 쓴다(Node 시험이 이 파일을 import 할 수 있게).
// ⚠️ 응답에 user_id·ident_key 를 싣지 않는다(courseOut·enrollOut). 기록(audit) detail 에 이름을 싣지 않는다(id·수만).
import { checkCourse, checkSessions, courseOut, enrollOut, exportRows, whoOf } from "./edu-rules.ts";
import { norm } from "./authz.ts";

type Db = any;
type Audit = (ctx: any, action: string, target: string, detail?: Record<string, unknown>) => Promise<void>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COURSE_COLS = "id,track,title,kind,term,description,teacher_label,place,fee_note,target,capacity,mode,waitlist,apply_from,apply_to,prereq_tracks,attend_pct,check_label,status,created_at,updated_at";
const ENROLL_COLS = "id,course_id,user_id,name,who_type,group_name,sub_name,status,source,waitlist_at,applied_at,decided_at,cancelled_at,fee_paid,staff_note";

export function makeEdu(db: Db, audit: Audit, deps: { peopleLookup: (ctx: any, b: any) => Promise<any>; personIdent: (personId: number) => Promise<any | null> }) {
  async function countsOf(ids: string[]) {
    const out: Record<string, { confirmed: number; waitlisted: number; applied: number }> = {};
    for (const id of ids) out[id] = { confirmed: 0, waitlisted: 0, applied: 0 };
    if (!ids.length) return out;
    const { data, error } = await db.from("edu_enrollments").select("course_id,status").in("course_id", ids)
      .in("status", ["confirmed", "waitlisted", "applied"]);
    if (error) throw error;
    for (const r of data ?? []) (out[r.course_id] as any)[r.status]++;
    return out;
  }

  async function eduCourses(b: any) {
    const { data, error } = await db.from("edu_courses").select(COURSE_COLS).order("created_at", { ascending: false }).limit(500);
    if (error) throw error;
    const rows = (data ?? []) as any[];
    const terms = [...new Set(rows.map((r) => r.term).filter(Boolean))];
    const want = norm(b?.term);
    const list = want ? rows.filter((r) => r.term === want) : rows;
    const counts = await countsOf(list.map((r) => r.id));
    return { ok: true, terms, courses: list.map((r) => courseOut(r, counts[r.id])) };
  }

  async function eduCourseSave(ctx: any, b: any) {
    const c = checkCourse(b?.course);
    if (!c.ok) return c;
    const id = norm(b?.course?.id);
    if (id) {
      if (!UUID.test(id)) return { ok: false, error: "bad-id" };
      const { data, error } = await db.from("edu_courses").update({ ...c.row, updated_at: new Date().toISOString() })
        .eq("id", id).select("id").maybeSingle();
      if (error) throw error;
      if (!data) return { ok: false, error: "not-found" };
      await audit(ctx, "edu.course.save", id, { status: c.row.status });
      return { ok: true, id };
    }
    const { data, error } = await db.from("edu_courses").insert(c.row).select("id").single();
    if (error) throw error;
    await audit(ctx, "edu.course.save", data.id, { status: c.row.status, created: true });
    return { ok: true, id: data.id };
  }

  async function eduCourseCopy(ctx: any, b: any) {
    const id = norm(b?.id);
    if (!UUID.test(id)) return { ok: false, error: "bad-id" };
    const { data: src, error } = await db.from("edu_courses").select(COURSE_COLS).eq("id", id).maybeSingle();
    if (error) throw error;
    if (!src) return { ok: false, error: "not-found" };
    const { id: _i, created_at: _c, updated_at: _u, ...rest } = src;
    const row = { ...rest, term: norm(b?.term) || src.term, status: "draft", apply_from: null, apply_to: null };
    const { data: made, error: e2 } = await db.from("edu_courses").insert(row).select("id").single();
    if (e2) throw e2;
    const { data: ss, error: e3 } = await db.from("edu_sessions").select("no,on_date,start_time,end_time,topic,place").eq("course_id", id);
    if (e3) throw e3;
    if ((ss ?? []).length) {
      const { error: e4 } = await db.from("edu_sessions").insert((ss as any[]).map((s) => ({ ...s, course_id: made.id })));
      if (e4) throw e4;
    }
    await audit(ctx, "edu.course.copy", made.id, { from: id });
    return { ok: true, id: made.id };
  }

  async function eduSessions(b: any) {
    const id = norm(b?.course_id);
    if (!UUID.test(id)) return { ok: false, error: "bad-id" };
    const { data, error } = await db.from("edu_sessions").select("no,on_date,start_time,end_time,topic,place").eq("course_id", id).order("no");
    if (error) throw error;
    return { ok: true, sessions: (data ?? []).map((s: any) => ({ ...s, start_time: s.start_time?.slice(0, 5) ?? null, end_time: s.end_time?.slice(0, 5) ?? null })) };
  }

  async function eduSessionsSave(ctx: any, b: any) {
    const id = norm(b?.course_id);
    if (!UUID.test(id)) return { ok: false, error: "bad-id" };
    const s = checkSessions(b?.sessions);
    if (!s.ok) return s;
    const { error: e1 } = await db.from("edu_sessions").delete().eq("course_id", id);
    if (e1) throw e1;
    if (s.rows.length) {
      const { error: e2 } = await db.from("edu_sessions").insert(s.rows.map((r) => ({ ...r, course_id: id })));
      if (e2) throw e2;
    }
    await audit(ctx, "edu.sessions", id, { count: s.rows.length });
    return { ok: true, count: s.rows.length };
  }

  async function eduEnrollList(b: any) {
    const id = norm(b?.course_id);
    if (!UUID.test(id)) return { ok: false, error: "bad-id" };
    const { data: c, error } = await db.from("edu_courses").select(COURSE_COLS).eq("id", id).maybeSingle();
    if (error) throw error;
    if (!c) return { ok: false, error: "not-found" };
    const { data, error: e2 } = await db.from("edu_enrollments").select(ENROLL_COLS).eq("course_id", id).order("applied_at");
    if (e2) throw e2;
    const rows = (data ?? []) as any[];
    const waiting = rows.filter((r) => r.status === "waitlisted")
      .sort((a, z) => (a.waitlist_at || "").localeCompare(z.waitlist_at || "") || a.id - z.id).map((r) => r.id);
    const counts = await countsOf([id]);
    return { ok: true, course: courseOut(c, counts[id]),
      enrollments: rows.map((r) => enrollOut(r, r.status === "waitlisted" ? waiting.indexOf(r.id) + 1 : null)) };
  }

  async function eduEnrollSet(ctx: any, b: any) {
    const id = Number(b?.id);
    if (!Number.isInteger(id) || id < 1) return { ok: false, error: "bad-id" };
    const op = norm(b?.op);
    const map: Record<string, string> = { confirm: "confirmed", waitlist: "waitlisted", decline: "declined", reopen: "applied" };
    if (op !== "cancel" && !map[op]) return { ok: false, error: "bad-op" };
    const { data: r, error } = op === "cancel"
      ? await db.rpc("edu_cancel", { p_enrollment: id, p_staff: true })
      : await db.rpc("edu_staff_set", { p_enrollment: id, p_status: map[op], p_force: b?.force === true });
    if (error) throw error;
    if (r.ok) await audit(ctx, "edu.enroll.set", String(id), { op, force: b?.force === true, promoted: r.promoted ?? null });
    return r;
  }

  async function eduEnrollAdd(ctx: any, b: any) {
    const course = norm(b?.course_id);
    if (!UUID.test(course)) return { ok: false, error: "bad-id" };
    let ident: any, user: string | null = null;
    if (b?.person_id !== undefined && b?.person_id !== null) {
      const p = await deps.personIdent(Number(b.person_id));     // {type,gu,mok,bu,grade,name, appUserId|null}
      if (!p) return { ok: false, error: "not-found" };
      ident = p.ident; user = p.appUserId;
    } else {
      const o = b?.ident || {};
      const name = norm(o.name);
      if (!name || name.length > 40 || /["\\,()|]/.test(name)) return { ok: false, error: "bad-ident" };
      const group = norm(o.group_name), sub = norm(o.sub_name);
      ident = { name, who_type: norm(o.who_type) || "새가족", group_name: group, sub_name: sub,
        ident_key: ["staff", norm(o.who_type) || "새가족", group, sub, name].join("|") };
    }
    const { data, error } = await db.rpc("edu_apply", { p_course: course, p_user: user, p_ident: ident, p_staff: true });
    if (error) throw error;
    if (data?.ok) await audit(ctx, "edu.enroll.add", String(data.id), { course, app: !!user, status: data.status, already: !!data.already });
    return data;
  }

  async function eduFeeSet(ctx: any, b: any) {
    const id = Number(b?.id);
    if (!Number.isInteger(id) || id < 1) return { ok: false, error: "bad-id" };
    const patch: any = { fee_paid: b?.paid === true, updated_at: new Date().toISOString() };
    if (typeof b?.note === "string") {
      const note = b.note.normalize("NFC").trim();
      if (note.length > 500) return { ok: false, error: "too-long" };
      patch.staff_note = note;
    }
    const { data, error } = await db.from("edu_enrollments").update(patch).eq("id", id).select("id").maybeSingle();
    if (error) throw error;
    if (!data) return { ok: false, error: "not-found" };
    await audit(ctx, "edu.enroll.fee", String(id), { paid: patch.fee_paid, note: "staff_note" in patch });
    return { ok: true };
  }

  async function eduExport(ctx: any, b: any) {
    const r = await eduEnrollList(b);
    if (!r.ok) return r;
    await audit(ctx, "edu.export", String(b.course_id), { count: r.enrollments.length });
    return { ok: true, rows: exportRows(r.course, r.enrollments) };
  }

  return { eduCourses, eduCourseSave, eduCourseCopy, eduSessions, eduSessionsSave, eduEnrollList, eduEnrollSet,
    eduEnrollAdd, eduFeeSet, eduExport, eduPeopleLookup: deps.peopleLookup, _whoOf: whoOf };
}
```

- [ ] **Step 4: `index.ts` 에 잇기**

맨 위 import 줄들 끝에:
```ts
import { makeEdu } from "./edu-db.ts";
```
`audit` 함수 정의(114줄 근처) 아래, `evPeopleLookup` 정의 **뒤**(2015줄 근처)에:
```ts
// ---------- 교육신청(2026-10-05) — 교인명부에서 찾기는 성경필사와 같은 함수 · 교인 → 소속·이름 · 같은 신원의 앱 계정(조회만) ----------
async function eduPersonIdent(personId: number) {
  if (!Number.isInteger(personId) || personId < 1) return null;
  const { data, error } = await db.from("church_people").select("person_id," + EV_LOOKUP_COLS).eq("person_id", personId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const c = lookupCandOut(data as any);          // 이름·구분·소속·세부(성경필사 찾기와 같은 옮겨 적기)
  const id = c.kind === "교회학교"
    ? { type: "교회학교", gu: "", mok: "", bu: c.group, grade: c.sub, name: c.name }
    : { type: "교구", gu: c.group, mok: c.sub, bu: "", grade: "", name: c.name };
  const keys = identityCandidates(id as any);
  const { data: us, error: e2 } = await db.from("users").select("id").in("identity_key", keys).limit(2);
  if (e2) throw e2;
  const appUserId = (us ?? []).length === 1 ? us![0].id : null;     // 하나뿐일 때만 잇는다(둘이면 담당자가 앱 신청으로)
  return { ident: { name: id.name, who_type: id.type, group_name: id.type === "교구" ? id.gu : id.bu,
    sub_name: id.type === "교구" ? id.mok : id.grade, ident_key: keys[0] }, appUserId };
}
const edu = makeEdu(db, audit, { peopleLookup: evPeopleLookup, personIdent: eduPersonIdent });
```
⚠️ `lookupCandOut` 이 돌려주는 칸 이름(`kind`·`group`·`sub`·`name`)은 `events-upload.ts` 에서 확인하고 맞춘다 — 다르면 위 세 줄을 그 이름으로 고친다.
switch(2438줄 근처 성경필사 case 들 뒤)에:
```ts
      case "eduCourses":      return json(await edu.eduCourses(b));
      case "eduCourseSave":   return json(await edu.eduCourseSave(ctx, b));
      case "eduCourseCopy":   return json(await edu.eduCourseCopy(ctx, b));
      case "eduSessions":     return json(await edu.eduSessions(b));
      case "eduSessionsSave": return json(await edu.eduSessionsSave(ctx, b));
      case "eduEnrollList":   return json(await edu.eduEnrollList(b));
      case "eduEnrollSet":    return json(await edu.eduEnrollSet(ctx, b));
      case "eduEnrollAdd":    return json(await edu.eduEnrollAdd(ctx, b));
      case "eduFeeSet":       return json(await edu.eduFeeSet(ctx, b));
      case "eduExport":       return json(await edu.eduExport(ctx, b));
      case "eduPeopleLookup": return json(await edu.eduPeopleLookup(ctx, b));
```

- [ ] **Step 5: `tests/server.dev.test.mjs` PROBE 열한 줄**(PROBE 객체 끝)

```js
  eduCourses: {},
  eduCourseSave: { course: { title: "", kind: "lecture" } },      // no-title — 아무것도 안 만든다
  eduCourseCopy: { id: ZERO },
  eduSessions: { course_id: ZERO },
  eduSessionsSave: { course_id: ZERO, sessions: [{ no: 0, on_date: "x" }] },   // bad-no — 아무것도 안 바꾼다
  eduEnrollList: { course_id: ZERO },
  eduEnrollSet: { id: 0, op: "confirm" },
  eduEnrollAdd: { course_id: ZERO, ident: { name: "" } },
  eduFeeSet: { id: 0, paid: true },
  eduExport: { course_id: ZERO },
  eduPeopleLookup: { name: "" },
```
(`ZERO` 는 그 파일 위에 이미 있는 영 uuid 상수다.)

- [ ] **Step 6: 개발 배포와 시험**

```bash
node --experimental-strip-types --test tests/authz.test.mjs tests/edu-rules.test.mjs
supabase functions deploy church-admin --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo
set -a; . ~/.church-admin/dev.env; set +a; node --experimental-strip-types --test tests/server.dev.test.mjs
```
Expected: 앞 둘 PASS · 서버 시험이 새 PROBE 열한 줄을 포함해 통과(역할 없는 계정은 forbidden).
⚠️ dev.env 의 서비스 키가 옛것이면(교회 어드민 CLAUDE.md 「사역 이력」 메모) 내부 갈래 시험만 건너뛴다 — 이 과제 시험과는 상관없다.

- [ ] **Step 7: 커밋**

```bash
git add supabase/functions/church-admin/edu-db.ts supabase/functions/church-admin/authz.ts supabase/functions/church-admin/index.ts tests/authz.test.mjs tests/server.dev.test.mjs
git commit -m "feat(교육): 서버 액션 열하나(강좌·회차·복사·신청 현황·상태·대신 등록·교재비·엑셀·교인명부 찾기) · 역할 education · 개발 배포"
```

---

### Task 5: 교회 어드민 — 📚 강좌 관리 화면

**Files (church-admin):**
- Create: `js/menus/education/courses-logic.js` · `js/menus/education/courses.js` · `tests/edu-courses-logic.test.mjs`
- Modify: `js/menus/registry.js`

**Interfaces:**
- Consumes: Task 4 액션 `eduCourses`·`eduCourseSave`·`eduCourseCopy`·`eduSessions`·`eduSessionsSave`
- Produces (`courses-logic.js`): `formToCourse(values) → object` · `courseToForm(courseOut) → values` · `sessionsSummary(sessions) → string`(예 「3/3(수)부터 매주 8회」) · `KIND_OPTIONS`·`MODE_OPTIONS`·`STATUS_OPTIONS`(`{value,label}[]`)

- [ ] **Step 1: 실패하는 시험 `tests/edu-courses-logic.test.mjs`**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { formToCourse, courseToForm, sessionsSummary, KIND_OPTIONS } from "../js/menus/education/courses-logic.js";

test("formToCourse — 빈 정원은 null · 숫자는 숫자", () => {
  assert.equal(formToCourse({ title: "a", kind: "lecture", capacity: "" }).capacity, null);
  assert.equal(formToCourse({ title: "a", kind: "lecture", capacity: "12" }).capacity, 12);
  assert.equal(formToCourse({ title: "a", kind: "lecture", waitlist: "off" }).waitlist, false);
});

test("courseToForm ↔ formToCourse 되돌림", () => {
  const c = { id: "x", title: "제자훈련", kind: "regular", term: "2027 상반기", capacity: 20, mode: "approve", waitlist: true,
    applyFrom: "2027-01-03", applyTo: "2027-01-24", attendPct: 80, checkLabel: "과제", status: "open", description: "설명",
    teacher: "○○○ 목사", place: "3층", fee: "교재비 1만 원", target: "새가족반 수료", track: "discipleship-1", prereq: [] };
  const back = formToCourse(courseToForm(c));
  assert.equal(back.mode, "approve");
  assert.equal(back.apply_to, "2027-01-24");
  assert.equal(back.check_label, "과제");
});

test("sessionsSummary", () => {
  assert.equal(sessionsSummary([]), "회차 없음");
  assert.equal(sessionsSummary([{ no: 1, on_date: "2027-03-03" }]), "3/3(수) 1회");
  assert.equal(sessionsSummary([1, 2, 3].map((n, i) => ({ no: n, on_date: ["2027-03-03", "2027-03-10", "2027-03-17"][i] }))), "3/3(수) ~ 3/17(수) · 3회");
});

test("KIND_OPTIONS — 세 종류", () => {
  assert.deepEqual(KIND_OPTIONS.map((o) => o.value), ["regular", "lecture", "training"]);
});
```
Run: `node --test tests/edu-courses-logic.test.mjs` → FAIL(모듈 없음)

- [ ] **Step 2: `js/menus/education/courses-logic.js`**

```js
// 📚 강좌 관리 — 순수 함수(시험이 읽는다 · DOM 없음)
export const KIND_OPTIONS = [
  { value: "regular", label: "정규 과정" }, { value: "lecture", label: "특강·세미나" }, { value: "training", label: "교사·사역자 교육" },
];
export const MODE_OPTIONS = [{ value: "auto", label: "선착순 바로 확정" }, { value: "approve", label: "담당자 승인" }];
export const STATUS_OPTIONS = [
  { value: "draft", label: "준비 중" }, { value: "open", label: "모집 중" }, { value: "closed", label: "모집 끝" },
  { value: "running", label: "진행 중" }, { value: "done", label: "끝" }, { value: "archived", label: "보관" },
];
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const md = (d) => { const t = new Date(d + "T00:00:00Z"); return `${t.getUTCMonth() + 1}/${t.getUTCDate()}(${WD[t.getUTCDay()]})`; };

export function formToCourse(v) {
  const cap = String(v.capacity ?? "").trim();
  return {
    id: v.id || undefined, title: v.title || "", kind: v.kind || "", term: v.term || "", description: v.description || "",
    teacher_label: v.teacher || "", place: v.place || "", fee_note: v.fee || "", target: v.target || "", track: v.track || "",
    capacity: cap === "" ? null : Number(cap), mode: v.mode || "auto", waitlist: v.waitlist !== "off",
    apply_from: v.applyFrom || "", apply_to: v.applyTo || "", attend_pct: v.attendPct === "" || v.attendPct == null ? 80 : Number(v.attendPct),
    check_label: v.checkLabel || "", status: v.status || "draft", prereq_tracks: v.prereq || [],
  };
}

export function courseToForm(c) {
  return { id: c.id, title: c.title, kind: c.kind, term: c.term, description: c.description, teacher: c.teacher, place: c.place,
    fee: c.fee, target: c.target, track: c.track, capacity: c.capacity == null ? "" : String(c.capacity), mode: c.mode,
    waitlist: c.waitlist ? "on" : "off", applyFrom: c.applyFrom || "", applyTo: c.applyTo || "", attendPct: c.attendPct ?? 80,
    checkLabel: c.checkLabel || "", status: c.status, prereq: c.prereq || [] };
}

export function sessionsSummary(list) {
  if (!list || !list.length) return "회차 없음";
  const s = [...list].sort((a, b) => a.no - b.no);
  if (s.length === 1) return `${md(s[0].on_date)} 1회`;
  return `${md(s[0].on_date)} ~ ${md(s[s.length - 1].on_date)} · ${s.length}회`;
}
```
Run: `node --test tests/edu-courses-logic.test.mjs` → PASS

- [ ] **Step 3: `js/menus/education/courses.js`** — 화면. **`js/menus/ministry/testers.js` 의 꼴**(`export async function render(el, { call })` · `esc`·`toast`·`dialog`·`busy`·`errorText` from `../../core/ui.js`)을 따른다. 고르기는 `pickOne`, 날짜는 `pickDate`, 시각은 `pickTime`(`../../core/picker.js` — 그 파일의 내보낸 이름·인자를 열어 확인하고 쓴다).

화면 구성(이 순서 · 이 글자):
1. 제목 `<h2 class="page-title">📚 강좌 관리</h2>` · 학기 고르기 단추(「전체」 + `terms`) · 「＋ 새 강좌」 단추
2. 강좌 카드 목록 — 카드 한 장: 제목 · `kindLabel` · `term` · `statusLabel` 딱지 · `sessionsSummary` · 「정원 {capacity 또는 '제한 없음'} · 확정 {counts.confirmed} · 대기 {counts.waitlisted} · 승인 기다림 {counts.applied}」 · 단추 「고치기」·「회차」·「복사」
3. 「고치기」/「＋ 새 강좌」 → 창(dialog) 하나의 폼: 제목 · 종류(pickOne KIND_OPTIONS) · 학기 · 강사 · 장소 · 대상 · 교재비 안내 · 정원(빈칸 = 제한 없음) · 확정 방식(pickOne MODE_OPTIONS) · 대기 받기(켜기/끄기) · 신청 시작일·마감일(pickDate) · 수료 기준 출석률(기본 80) · 담당자 확인 항목(예 「과제」 · 빈칸이면 출석률만) · 설명(여러 줄) · 상태(pickOne STATUS_OPTIONS) → 「저장」은 `busy()` 로 잠그고 `eduCourseSave({course: formToCourse(values)})` → 오류는 `errorText` 로 그 자리에, 성공은 `toast("저장했어요")` 후 목록 다시
   - 상태를 「모집 중」으로 바꿀 때만 확인 창: 「저장하면 성경암송 앱(🎓 교육이 보이는 분)에 이 강좌가 바로 보여요.」
4. 「회차」 → 창: 지금 회차 표(번호·날짜(pickDate)·시작(pickTime)·끝·주제) · 줄 더하기/빼기 · 「한 번에 만들기」(첫 날 pickDate · 몇 회 · 간격 「매주」=7 · 시작·끝 시각) → 표를 채움(`makeSessions` 와 같은 규칙을 화면에서 — 서버 저장은 `eduSessionsSave`) · 「저장」
5. 「복사」 → 학기를 묻는 창(글자 칸 · 기본값 지금 학기) → `eduCourseCopy({id, term})` → 「복사했어요 — 준비 중으로 만들었어요. 신청 기간과 회차 날짜를 고쳐 주세요」

- [ ] **Step 4: 메뉴 등록 `js/menus/registry.js`**

`MENUS` 배열의 성경필사 묶음 줄들 **뒤**, 시스템 묶음 **앞**에:
```js
  { id: "edu-courses", group: "교육", icon: "📚", label: "강좌 관리", desc: "강좌 만들기 · 회차 · 지난 학기 복사 · 모집 열기",
    role: "education", load: () => import("./education/courses.js") },
```
`GROUP_ICON` 에 `"교육": "🎓"` 을 더한다.
Run: `node --experimental-strip-types --test tests/registry.test.mjs tests/edu-courses-logic.test.mjs` → PASS(역할 `education` 을 서버가 안다).

- [ ] **Step 5: 로컬 확인(개발 DB)** — `python -m http.server 8000`(띄운 PID 만 끈다) → http://localhost:8000 → 총괄 계정 또는 교육 역할을 준 개발 계정으로: 새 강좌 만들기 → 회차 「한 번에 만들기」 8회 → 저장 → 카드에 「3/3(수) ~ 4/21(수) · 8회」 → 복사 → 준비 중 카드가 하나 더. 폰 폭(390px)에서도 창이 넘치지 않는지 본다. `grep -rn '<select\|type="date"\|type="time"' js/menus/education/` 가 비어야 한다.

- [ ] **Step 6: 커밋**

```bash
git add js/menus/education/courses.js js/menus/education/courses-logic.js tests/edu-courses-logic.test.mjs js/menus/registry.js
git commit -m "feat(교육): 📚 강좌 관리 — 만들기·고치기·회차(한 번에 만들기)·지난 학기 복사 · 메뉴 묶음 「교육」"
```

---

### Task 6: 교회 어드민 — 📝 신청 현황 화면

**Files (church-admin):**
- Create: `js/menus/education/enrollments-logic.js` · `js/menus/education/enrollments.js` · `tests/edu-enrollments-logic.test.mjs`
- Modify: `js/menus/registry.js`

**Interfaces:**
- Consumes: `eduCourses`·`eduEnrollList`·`eduEnrollSet`·`eduEnrollAdd`·`eduFeeSet`·`eduExport`·`eduPeopleLookup`
- Produces (`enrollments-logic.js`): `groupByStatus(list) → {confirmed:[], waitlisted:[], applied:[], cancelled:[], declined:[]}`(대기는 waitNo 차례) · `actionsFor(e, course) → [{op,label,danger?}]` · `capacityLine(course) → string` · `errorWord(code) → string`

- [ ] **Step 1: 실패하는 시험 `tests/edu-enrollments-logic.test.mjs`**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { groupByStatus, actionsFor, capacityLine, errorWord } from "../js/menus/education/enrollments-logic.js";

const course = { capacity: 2, mode: "auto", counts: { confirmed: 2, waitlisted: 1, applied: 0 } };

test("groupByStatus — 대기는 순서대로", () => {
  const g = groupByStatus([{ id: 1, status: "waitlisted", waitNo: 2 }, { id: 2, status: "waitlisted", waitNo: 1 }, { id: 3, status: "confirmed" }]);
  assert.deepEqual(g.waitlisted.map((e) => e.id), [2, 1]);
  assert.equal(g.confirmed.length, 1);
});

test("actionsFor — 상태마다 단추", () => {
  assert.deepEqual(actionsFor({ status: "applied" }, course).map((a) => a.op), ["confirm", "waitlist", "decline"]);
  assert.deepEqual(actionsFor({ status: "waitlisted" }, course).map((a) => a.op), ["confirm", "cancel"]);
  assert.deepEqual(actionsFor({ status: "confirmed" }, course).map((a) => a.op), ["cancel"]);
  assert.deepEqual(actionsFor({ status: "cancelled" }, course).map((a) => a.op), ["reopen"]);
  assert.deepEqual(actionsFor({ status: "declined" }, course).map((a) => a.op), ["reopen"]);
});

test("capacityLine", () => {
  assert.equal(capacityLine(course), "정원 2 · 확정 2 · 대기 1");
  assert.equal(capacityLine({ capacity: null, counts: { confirmed: 5, waitlisted: 0, applied: 3 } }), "정원 제한 없음 · 확정 5 · 승인 기다림 3");
});

test("errorWord", () => {
  assert.equal(errorWord("full"), "정원이 찼어요");
  assert.equal(errorWord("too-late"), "이미 시작한 강좌예요");
  assert.equal(errorWord("x"), "저장하지 못했어요 (x)");
});
```
Run: `node --test tests/edu-enrollments-logic.test.mjs` → FAIL

- [ ] **Step 2: `js/menus/education/enrollments-logic.js`**

```js
// 📝 신청 현황 — 순수 함수(시험이 읽는다)
export function groupByStatus(list) {
  const g = { confirmed: [], waitlisted: [], applied: [], cancelled: [], declined: [] };
  for (const e of list || []) (g[e.status] || (g[e.status] = [])).push(e);
  g.waitlisted.sort((a, b) => (a.waitNo || 0) - (b.waitNo || 0));
  return g;
}

export function actionsFor(e) {
  switch (e.status) {
    case "applied": return [{ op: "confirm", label: "확정" }, { op: "waitlist", label: "대기로" }, { op: "decline", label: "반려", danger: true }];
    case "waitlisted": return [{ op: "confirm", label: "확정" }, { op: "cancel", label: "취소", danger: true }];
    case "confirmed": return [{ op: "cancel", label: "취소", danger: true }];
    default: return [{ op: "reopen", label: "다시 받기" }];
  }
}

export function capacityLine(c) {
  const cap = c.capacity == null ? "정원 제한 없음" : `정원 ${c.capacity}`;
  const parts = [cap, `확정 ${c.counts.confirmed}`];
  if (c.counts.waitlisted) parts.push(`대기 ${c.counts.waitlisted}`);
  if (c.counts.applied) parts.push(`승인 기다림 ${c.counts.applied}`);
  return parts.join(" · ");
}

const WORDS = { full: "정원이 찼어요", "too-late": "이미 시작한 강좌예요", "not-active": "이미 처리된 신청이에요",
  "not-found": "찾을 수 없어요", "bad-ident": "이름을 확인해 주세요", "not-open": "모집 중이 아니에요" };
export function errorWord(code) { return WORDS[code] || `저장하지 못했어요 (${code})`; }
```
Run: `node --test tests/edu-enrollments-logic.test.mjs` → PASS

- [ ] **Step 3: `js/menus/education/enrollments.js`** — `courses.js` 와 같은 꼴.
1. 제목 `📝 신청 현황` · 강좌 고르기(pickOne — `eduCourses` 목록 · 「제목 · 학기 · 상태」) · 고른 강좌의 `capacityLine` · 「엑셀로 내려받기」(`eduExport` → `js/core/xlsx.js` 로 파일 · 파일 이름 `교육신청_{제목}_{오늘}.xlsx`) · 「＋ 대신 등록」
2. 묶음 차례: 승인 기다림(applied) → 확정 → 대기(「대기 N번」) → 취소·반려(접어 둠)
3. 줄: 이름 · 소속 · 「앱」/「담당자」 · 신청 시각 · 교재비 체크 칸(누르면 `eduFeeSet` · 바로 저장) · 메모(누르면 글 창 · `eduFeeSet({id, paid, note})`) · `actionsFor` 단추
   - 「확정」이 `full` 로 오면 확인 창: 「정원(N명)이 찼어요. 그래도 확정할까요?」 → 「넘겨서 확정」이면 `eduEnrollSet({id, op:"confirm", force:true})`
   - 「취소」·「반려」는 확인 창 한 번(「○○○ 님의 신청을 취소할까요? 선착순 강좌면 대기 첫 분이 확정돼요.」)
   - 결과의 `promoted` 가 있으면 toast 「대기 첫 분이 확정됐어요」
4. 「＋ 대신 등록」 창 — 탭 둘: 「교인명부에서 찾기」(이름 → `eduPeopleLookup` → 후보 카드 → 「등록」 → `eduEnrollAdd({course_id, person_id})`) · 「직접 입력(새가족 등)」(이름 · 구분 글(기본 「새가족」) · 소속 글 · 세부 글 → `eduEnrollAdd({course_id, ident})`). 결과가 `already` 면 「이미 명단에 있어요」.
   - 교인명부가 아직 없으면(`source:null`) 「교인명부가 없어 직접 입력으로 넣어 주세요」.

- [ ] **Step 4: 메뉴 등록** — 강좌 관리 줄 바로 뒤:
```js
  { id: "edu-enroll", group: "교육", icon: "📝", label: "신청 현황", desc: "확정·대기·반려 · 대신 등록 · 교재비 · 엑셀",
    role: "education", load: () => import("./education/enrollments.js") },
```
Run: `node --experimental-strip-types --test tests/registry.test.mjs tests/edu-enrollments-logic.test.mjs` → PASS

- [ ] **Step 5: 로컬 확인(개발 DB)** — 과제 5 의 강좌를 「모집 중」·정원 2·선착순으로 → 대신 등록 셋(교인명부 둘 · 직접 하나) → 확정 2 · 대기 1 → 확정 한 분 취소 → 대기 분이 확정되고 toast → 엑셀 내려받기 → 파일에 머리 아홉 칸. 폰 폭 390px.

- [ ] **Step 6: 커밋**

```bash
git add js/menus/education/enrollments.js js/menus/education/enrollments-logic.js tests/edu-enrollments-logic.test.mjs js/menus/registry.js
git commit -m "feat(교육): 📝 신청 현황 — 승인·대기·반려·취소(대기 올림)·정원 넘겨 확정·대신 등록(교인명부·직접)·교재비·메모·엑셀"
```

---

### Task 7: 성경암송 api — 성도님 다섯 액션 · 게이트 · 스모크

**Files (v2):**
- Modify: `supabase/functions/api/index.ts`
- Create: `tests/edu-smoke.sh`

**Interfaces:**
- Consumes: Task 1 SQL 함수 · `ministryIsTester(user_id)`(이미 있음) · `identityKey(u)`(이미 있음)
- Produces (액션 · 응답에 `user_id`·`ident_key` 없음):
  - `eduList({user_id?}) → {ok, open: boolean, courses: AppCourse[], mine: AppMine[]}` — 목록은 `status in ('open','closed','running')` 만(`draft`·`done`·`archived` 빼고) · 강좌마다 `{id,title,kind,kindLabel,term,teacher,place,fee,target,capacity,mode,waitlist,applyFrom,applyTo,status,sessionsCount,firstDate,lastDate,confirmed,waitlisted,phase}` (`phase`: `upcoming`(신청 전)·`open`·`closed`(신청 끝)·`running`)
  - `eduCourse({id, user_id?}) → {ok, course: AppCourse + {description, sessions:[{no,date,start,end,topic,place}], prereq, attendPct, checkLabel}, mine: AppMine|null}`
  - `eduApply({id, user_id}) → {ok, status, waitNo?, already?} | {ok:false, error}` — 문(`eduOpen` 또는 시험 참여자)이 닫혔으면 `not-open` · **반려된 분이 다시 누르면 `{ok:true, status:'declined', already:true}`**(SQL 이 줄을 그대로 둔다 — 친구 2026-10-05 「반려 유지」)
  - `eduCancel({enrollment_id, user_id}) → {ok, promoted?:boolean} | {ok:false, error}` — 내 줄일 때만
  - `eduMine({user_id}) → {ok, mine: AppMine[]}` — `AppMine = {id, courseId, title, term, status, statusLabel, waitNo, cancelUntil, nextSession}`

- [ ] **Step 1: `PUBLIC_CONFIG_KEYS` 에 `"eduOpen"`**(2430줄 근처):
```ts
const PUBLIC_CONFIG_KEYS = new Set(["heartMessages", "dailyMessage", "introSlides", "milestoneMessages", "passagesPublic", "psalmPublic", "songPublic", "event", "ministry", "eduOpen"]);
```

- [ ] **Step 2: 액션 구현** — 사역신청 블록(`ministryHistoryRequest` 정의 뒤)에 아래를 더한다:

```ts
// ---------- 교육신청(2026-10-05 · 설계 docs/superpowers/specs/2026-10-05-education-courses-design.md §8) ----------
// ⚠️ 정원·대기·취소 마감은 SQL 함수(supabase/edu.sql) 한 곳 — 여기서 상태를 직접 쓰지 않는다.
// ⚠️ 응답에 user_id·ident_key 를 싣지 않는다. 문(eduOpen 또는 시험 참여자)은 신청에서만 막는다 — 목록·자세히는 열린 강좌라 누구에게 보여도 된다.
const EDU_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EDU_LIST_STATUS = ["open", "closed", "running"];
const EDU_KIND_LABEL: Record<string, string> = { regular: "정규 과정", lecture: "특강·세미나", training: "교사·사역자 교육" };
const EDU_ENROLL_LABEL: Record<string, string> = { applied: "신청", confirmed: "확정", waitlisted: "대기", cancelled: "취소", declined: "반려" };
const eduKst = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);

async function eduGateOpen(userId: string): Promise<boolean> {
  const { data } = await db.from("app_config").select("value").eq("key", "eduOpen").maybeSingle();
  if (data?.value === true) return true;
  try { return userId ? await ministryIsTester(userId) : false; } catch (_) { return false; }   // 실패하면 닫힘
}

function eduPhase(c: any, today: string): string {
  if (c.status === "running") return "running";
  if (c.status === "closed") return "closed";
  if (c.apply_from && today < c.apply_from) return "upcoming";
  if (c.apply_to && today > c.apply_to) return "closed";
  return "open";
}

async function eduSessionsOf(ids: string[]) {
  const by: Record<string, any[]> = {};
  if (!ids.length) return by;
  const { data, error } = await db.from("edu_sessions").select("course_id,no,on_date,start_time,end_time,topic,place").in("course_id", ids).order("no");
  if (error) throw error;
  for (const s of data ?? []) (by[(s as any).course_id] ||= []).push(s);
  return by;
}

async function eduCountsOf(ids: string[]) {
  const by: Record<string, { confirmed: number; waitlisted: number }> = {};
  for (const id of ids) by[id] = { confirmed: 0, waitlisted: 0 };
  if (!ids.length) return by;
  const { data, error } = await db.from("edu_enrollments").select("course_id,status").in("course_id", ids).in("status", ["confirmed", "waitlisted"]);
  if (error) throw error;
  for (const r of data ?? []) (by[(r as any).course_id] as any)[(r as any).status]++;
  return by;
}

function eduCourseOut(c: any, ss: any[], cnt: { confirmed: number; waitlisted: number }, today: string) {
  return {
    id: c.id, title: c.title, kind: c.kind, kindLabel: EDU_KIND_LABEL[c.kind] || c.kind, term: c.term || "",
    teacher: c.teacher_label || "", place: c.place || "", fee: c.fee_note || "", target: c.target || "",
    capacity: c.capacity ?? null, mode: c.mode, waitlist: !!c.waitlist, applyFrom: c.apply_from, applyTo: c.apply_to,
    status: c.status, phase: eduPhase(c, today), sessionsCount: ss.length,
    firstDate: ss[0]?.on_date ?? null, lastDate: ss[ss.length - 1]?.on_date ?? null,
    confirmed: cnt.confirmed, waitlisted: cnt.waitlisted,
  };
}

async function eduMineRows(userId: string) {
  if (!userId) return [];
  const { data, error } = await db.from("edu_enrollments").select("id,course_id,status,waitlist_at").eq("user_id", userId)
    .in("status", ["applied", "confirmed", "waitlisted", "declined"]).order("applied_at", { ascending: false }).limit(100);
  if (error) throw error;
  return (data ?? []) as any[];
}

async function eduWaitNo(courseId: string, waitAt: string | null, id: number): Promise<number> {
  if (!waitAt) return 1;   // 대기 줄은 SQL 이 늘 waitlist_at 을 채운다 — 없으면 맨 앞으로 본다(.or() 가 null 에서 깨지지 않게)
  const { count, error } = await db.from("edu_enrollments").select("id", { count: "exact", head: true })
    .eq("course_id", courseId).eq("status", "waitlisted").or(`waitlist_at.lt.${waitAt},and(waitlist_at.eq.${waitAt},id.lt.${id})`);
  if (error) throw error;
  return (count ?? 0) + 1;
}

async function eduMineOut(rows: any[], today: string) {
  const ids = [...new Set(rows.map((r) => r.course_id))];
  if (!ids.length) return [];
  const { data: cs, error } = await db.from("edu_courses").select("id,title,term").in("id", ids);
  if (error) throw error;
  const cmap = new Map((cs ?? []).map((c: any) => [c.id, c]));
  const sess = await eduSessionsOf(ids);
  const out = [];
  for (const r of rows) {
    const c: any = cmap.get(r.course_id);
    if (!c) continue;
    const ss = sess[r.course_id] || [];
    const first = ss[0]?.on_date ?? null;
    const next = ss.find((s: any) => s.on_date >= today) || null;
    out.push({ id: r.id, courseId: r.course_id, title: c.title, term: c.term || "", status: r.status,
      statusLabel: EDU_ENROLL_LABEL[r.status] || r.status,
      waitNo: r.status === "waitlisted" ? await eduWaitNo(r.course_id, r.waitlist_at, r.id) : null,
      cancelUntil: first ? new Date(Date.parse(first + "T00:00:00Z") - 86400000).toISOString().slice(0, 10) : null,
      nextSession: next ? { no: next.no, date: next.on_date, start: next.start_time?.slice(0, 5) ?? null } : null });
  }
  return out;
}

async function eduList(b: any) {
  const userId = String(b.user_id ?? "").trim();
  const today = eduKst();
  const { data, error } = await db.from("edu_courses")
    .select("id,title,kind,term,teacher_label,place,fee_note,target,capacity,mode,waitlist,apply_from,apply_to,status")
    .in("status", EDU_LIST_STATUS).order("apply_from", { ascending: true, nullsFirst: false }).limit(200);
  if (error) throw error;
  const rows = (data ?? []) as any[];
  const ids = rows.map((r) => r.id);
  const [sess, cnt] = await Promise.all([eduSessionsOf(ids), eduCountsOf(ids)]);
  const mine = await eduMineOut(await eduMineRows(userId), today);
  return { ok: true, open: await eduGateOpen(userId), courses: rows.map((c) => eduCourseOut(c, sess[c.id] || [], cnt[c.id], today)), mine };
}

async function eduCourse(b: any) {
  const id = String(b.id ?? "").trim();
  if (!EDU_UUID.test(id)) return { ok: false, error: "bad-args" };
  const userId = String(b.user_id ?? "").trim();
  const today = eduKst();
  const { data: c, error } = await db.from("edu_courses").select("*").eq("id", id).in("status", EDU_LIST_STATUS).maybeSingle();
  if (error) throw error;
  if (!c) return { ok: false, error: "not-found" };
  const [sess, cnt] = await Promise.all([eduSessionsOf([id]), eduCountsOf([id])]);
  const ss = sess[id] || [];
  const mineRows = (await eduMineRows(userId)).filter((r) => r.course_id === id);
  const mine = (await eduMineOut(mineRows, today))[0] || null;
  return { ok: true, course: { ...eduCourseOut(c, ss, cnt[id], today), description: c.description || "", prereq: c.prereq_tracks || [],
    attendPct: c.attend_pct, checkLabel: c.check_label || null,
    sessions: ss.map((s: any) => ({ no: s.no, date: s.on_date, start: s.start_time?.slice(0, 5) ?? null, end: s.end_time?.slice(0, 5) ?? null, topic: s.topic || "", place: s.place || "" })) },
    mine };
}

async function eduApply(b: any) {
  const userId = String(b.user_id ?? "").trim();
  const id = String(b.id ?? "").trim();
  if (!userId) return { ok: false, error: "no-user" };
  if (!EDU_UUID.test(id)) return { ok: false, error: "bad-args" };
  if (!(await eduGateOpen(userId))) return { ok: false, error: "not-open" };
  const { data: u, error } = await db.from("users").select("type,gu,mok,bu,grade,name").eq("id", userId).maybeSingle();
  if (error) throw error;
  if (!u) return { ok: false, error: "no-user" };
  const isGu = u.type === "교구";
  const ident = { name: norm(u.name), who_type: u.type, group_name: isGu ? norm(u.gu) : norm(u.bu), sub_name: isGu ? norm(u.mok) : norm(u.grade), ident_key: identityKey(u) };
  const { data: r, error: e2 } = await db.rpc("edu_apply", { p_course: id, p_user: userId, p_ident: ident, p_staff: false });
  if (e2) throw e2;
  if (!r?.ok) return r;
  let waitNo: number | null = null;
  if (r.status === "waitlisted") {
    const { data: w } = await db.from("edu_enrollments").select("waitlist_at").eq("id", r.id).maybeSingle();
    waitNo = await eduWaitNo(id, w?.waitlist_at ?? null, r.id);
  }
  return { ok: true, status: r.status, waitNo, already: !!r.already };
}

async function eduCancel(b: any) {
  const userId = String(b.user_id ?? "").trim();
  const eid = Number(b.enrollment_id);
  if (!userId || !Number.isInteger(eid) || eid < 1) return { ok: false, error: "bad-args" };
  const { data: row, error } = await db.from("edu_enrollments").select("id").eq("id", eid).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!row) return { ok: false, error: "not-found" };              // 남의 줄은 없는 줄과 같다
  const { data: r, error: e2 } = await db.rpc("edu_cancel", { p_enrollment: eid, p_staff: false });
  if (e2) throw e2;
  return r?.ok ? { ok: true, promoted: r.promoted != null } : r;
}

async function eduMine(b: any) {
  const userId = String(b.user_id ?? "").trim();
  if (!userId) return { ok: false, error: "no-user" };
  return { ok: true, mine: await eduMineOut(await eduMineRows(userId), eduKst()) };
}
```
switch 의 사역신청 case 들 뒤에:
```ts
      // ---- 교육신청(2026-10-05) ----
      case "eduList":   return json(await eduList(body));
      case "eduCourse": return json(await eduCourse(body));
      case "eduApply":  return json(await eduApply(body));
      case "eduCancel": return json(await eduCancel(body));
      case "eduMine":   return json(await eduMine(body));
```

- [ ] **Step 3: 스모크 `tests/edu-smoke.sh`**(읽기·거절만 · `tests/event-smoke.sh` 와 같은 `call`·`chk`·`jqn`·`sk` 도우미를 그 파일에서 옮겨 쓴다 · 본문에 한글 금지)

```bash
#!/usr/bin/env bash
# 교육신청 — 읽기 전용 스모크. 기본은 개발 DB.
#   bash tests/edu-smoke.sh            개발
#   EVT_ENV=prod bash tests/edu-smoke.sh   운영
# ⚠️ 쓰기(신청·취소)는 하지 않는다 — 거절되어야 하는 요청과 읽기만.
set -u
# ↓ tests/event-smoke.sh 의 BASE·KEY·call·chk·jqn·sk 정의(1~60줄 근처)를 그대로 옮긴다
NONUSER="00000000-0000-0000-0000-000000000000"
echo "1) eduList - 열린다 · user_id 를 싣지 않는다"
L=$(call '{"action":"eduList"}')
chk "ok" "$(jqn 'd.get("ok")' "$L")" "True"
chk "no user_id" "$(jqn '"user_id" not in json.dumps(d) and "ident_key" not in json.dumps(d)' "$L")" "True"
chk "no draft" "$(jqn 'all(c["status"] in ("open","closed","running") for c in d.get("courses",[]))' "$L")" "True"
echo "2) eduApply - 신원·인자"
chk "no-user" "$(jqn 'd.get("error")' "$(call '{"action":"eduApply","id":"x"}')")" "no-user"
chk "bad-args" "$(jqn 'd.get("error")' "$(call "{\"action\":\"eduApply\",\"user_id\":\"$NONUSER\",\"id\":\"x\"}")")" "bad-args"
echo "3) eduCourse - 없는 강좌"
chk "not-found" "$(jqn 'd.get("error")' "$(call "{\"action\":\"eduCourse\",\"id\":\"$NONUSER\"}")")" "not-found"
echo "4) eduCancel - 남의 줄은 없는 줄"
chk "not-found" "$(jqn 'd.get("error")' "$(call "{\"action\":\"eduCancel\",\"user_id\":\"$NONUSER\",\"enrollment_id\":1}")")" "not-found"
echo "5) eduMine - 신원 없으면 거절"
chk "no-user" "$(jqn 'd.get("error")' "$(call '{"action":"eduMine"}')")" "no-user"
```

- [ ] **Step 4: 개발 배포와 확인**

```bash
git status --short   # index.ts 에 남의 미커밋이 없는지
supabase functions deploy api --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo
bash tests/edu-smoke.sh
bash tests/event-smoke.sh   # 남의 경로가 멀쩡한가(그 파일 7절)
```
Expected: edu 스모크 실패 0 · event 스모크 실패 0.

- [ ] **Step 5: 커밋**(index.ts 는 내 헝크만)

```bash
git add tests/edu-smoke.sh
git add -p supabase/functions/api/index.ts   # 교육신청 헝크만 고른다(남의 변경이 섞였으면 git apply --cached)
git commit -m "feat(교육신청 api): 성도님 다섯 액션(eduList·eduCourse·eduApply·eduCancel·eduMine) · 문 eduOpen+시험 참여자 · user_id 안 실음 · 스모크 · 개발 배포"
```

---

### Task 8: 성경암송 앱 — 🎓 교육 화면과 첫 화면 단추

**Files (v2):**
- Create: `js/edu.js` · `tests/edu-front.test.cjs`
- Modify: `js/api.js`(다섯 줄) · `app.js`(게이트·단추·연결) · `index.html`(script 한 줄) · `style.css`(작은 블록) · `tools/preflight.py`(PURE_TESTS 한 줄)

**Interfaces:**
- Consumes: Task 7 액션
- Produces: 전역 `renderEduList()` · `renderEduCourse(id)` · `renderEduMine()` · `eduVisible()` · 순수 `eduPhaseLabel(c)`·`eduStatusLine(m)`·`eduApplyMessage(r)`·`eduErrText(code)`(표식 `// ── 교육 순수 함수 (여기부터) ──` ~ `(여기까지)` 사이 · 시험이 떼어 간다)

- [ ] **Step 1: 실패하는 시험 `tests/edu-front.test.cjs`**

```js
// 교육신청 화면 순수 함수 — js/edu.js 의 표식 사이를 떼어 node:vm 에서 돌린다(꾸러미 없음 · preflight 가 건다)
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'edu.js'), 'utf8');
const a = src.indexOf('// ── 교육 순수 함수 (여기부터) ──'), b = src.indexOf('// ── 교육 순수 함수 (여기까지) ──');
assert.ok(a >= 0 && b > a, '표식을 못 찾았다');
const ctx = {}; vm.createContext(ctx); vm.runInContext(src.slice(a, b), ctx);

test('eduPhaseLabel', () => {
  assert.equal(ctx.eduPhaseLabel({ phase: 'upcoming', applyFrom: '2027-01-03' }), '1월 3일부터 신청');
  assert.equal(ctx.eduPhaseLabel({ phase: 'open', capacity: 20, confirmed: 14, waitlisted: 0, mode: 'auto' }), '모집 중 · 14/20');
  assert.equal(ctx.eduPhaseLabel({ phase: 'open', capacity: 20, confirmed: 20, waitlisted: 3, mode: 'auto', waitlist: true }), '모집 중 · 정원 참 · 대기 3');
  assert.equal(ctx.eduPhaseLabel({ phase: 'closed' }), '모집 끝');
  assert.equal(ctx.eduPhaseLabel({ phase: 'running' }), '진행 중');
});

test('eduApplyMessage — 결과마다 한 줄', () => {
  assert.equal(ctx.eduApplyMessage({ ok: true, status: 'confirmed' }), '확정됐어요');
  assert.equal(ctx.eduApplyMessage({ ok: true, status: 'waitlisted', waitNo: 2 }), '대기 2번이에요 — 자리가 나면 확정돼요');
  assert.equal(ctx.eduApplyMessage({ ok: true, status: 'applied' }), '신청했어요 — 담당자가 확정하면 「내 강좌」에 보여요');
  assert.equal(ctx.eduApplyMessage({ ok: true, status: 'confirmed', already: true }), '이미 신청하셨어요');
  assert.equal(ctx.eduApplyMessage({ ok: true, status: 'declined', already: true }), '이 강좌는 담당자에게 말씀해 주세요');
});

test('eduStatusLine', () => {
  assert.equal(ctx.eduStatusLine({ status: 'waitlisted', statusLabel: '대기', waitNo: 1 }), '대기 1번');
  assert.equal(ctx.eduStatusLine({ status: 'confirmed', statusLabel: '확정' }), '확정');
});

test('eduErrText', () => {
  assert.equal(ctx.eduErrText('full'), '정원이 찼어요.');
  assert.equal(ctx.eduErrText('too-late'), '시작한 뒤에는 앱에서 취소할 수 없어요. 담당자에게 말씀해 주세요.');
  assert.equal(ctx.eduErrText('not-open'), '아직 신청을 받지 않아요.');
  assert.equal(ctx.eduErrText('x'), '잠시 뒤 다시 해 주세요.');
});
```
Run: `node --test tests/edu-front.test.cjs` → FAIL(파일 없음)

- [ ] **Step 2: `js/edu.js`**

```js
// 🎓 교육 — 강좌 목록·자세히·신청·내 강좌(2026-10-05 · 설계 docs/superpowers/specs/2026-10-05-education-courses-design.md §7)
//   ⚠️ 정원·대기·취소 마감은 서버(SQL 함수)가 정한다 — 화면은 받은 값을 보여 주기만 한다(다시 계산하지 않는다).
//   ⚠️ 문(eduVisible — app.js)은 첫 화면 단추를 숨기는 것뿐, 막는 것은 서버(eduApply 의 not-open)다.

// ── 교육 순수 함수 (여기부터) ──
function eduMd(d) { const t = new Date(d + 'T00:00:00Z'); return (t.getUTCMonth() + 1) + '월 ' + t.getUTCDate() + '일'; }
function eduPhaseLabel(c) {
  if (c.phase === 'upcoming') return c.applyFrom ? eduMd(c.applyFrom) + '부터 신청' : '곧 신청을 받아요';
  if (c.phase === 'closed') return '모집 끝';
  if (c.phase === 'running') return '진행 중';
  if (c.capacity == null) return '모집 중';
  if (c.confirmed >= c.capacity) return c.waitlist ? '모집 중 · 정원 참 · 대기 ' + (c.waitlisted || 0) : '정원 참';
  return '모집 중 · ' + c.confirmed + '/' + c.capacity;
}
function eduApplyMessage(r) {
  if (r.status === 'declined') return '이 강좌는 담당자에게 말씀해 주세요';   // 반려 유지(친구 2026-10-05) — 다시 눌러도 반려 그대로
  if (r.already) return '이미 신청하셨어요';
  if (r.status === 'confirmed') return '확정됐어요';
  if (r.status === 'waitlisted') return '대기 ' + (r.waitNo || 1) + '번이에요 — 자리가 나면 확정돼요';
  return '신청했어요 — 담당자가 확정하면 「내 강좌」에 보여요';
}
function eduStatusLine(m) { return m.status === 'waitlisted' ? '대기 ' + (m.waitNo || 1) + '번' : m.statusLabel; }
function eduErrText(code) {
  var W = { 'full': '정원이 찼어요.', 'too-late': '시작한 뒤에는 앱에서 취소할 수 없어요. 담당자에게 말씀해 주세요.',
    'not-open': '아직 신청을 받지 않아요.', 'not-yet': '아직 신청 기간이 아니에요.', 'closed-period': '신청 기간이 지났어요.',
    'not-found': '강좌를 찾을 수 없어요.', 'no-user': '로그인한 뒤에 신청할 수 있어요.' };
  return W[code] || '잠시 뒤 다시 해 주세요.';
}
// ── 교육 순수 함수 (여기까지) ──

var eduState = { list: null, mine: [] };

function eduEsc(s) { return (typeof boardEsc === 'function') ? boardEsc(String(s == null ? '' : s)) : String(s == null ? '' : s); }

function renderEduList(tab) {
  var u = loadUser();
  if (!u) { renderEntryScreen(); return; }
  if (typeof logFeature === 'function') logFeature('edu', 0);
  var el = document.getElementById('app');
  el.innerHTML = '<div class="edu-wrap"><div class="ev-loading">불러오는 중…</div></div>' +
    '<button class="home-fab" id="edu-home" aria-label="첫 화면으로">' + homeFabLabel(u, true) + '</button>';
  window.scrollTo(0, 0);
  document.getElementById('edu-home').addEventListener('click', function () { renderSummary(); });
  api.eduList(u.user_id || '').then(function (r) {
    eduState.list = r.courses || []; eduState.mine = r.mine || [];
    eduDrawList(tab || (eduState.mine.length ? 'mine' : 'open'));
  }).catch(function () {
    var w = document.querySelector('.edu-wrap');
    if (w) w.innerHTML = '<p class="edu-empty">지금 불러올 수 없어요. 잠시 뒤 다시 열어 주세요.</p>';
  });
}

function eduDrawList(tab) {
  var w = document.querySelector('.edu-wrap'); if (!w) return;
  var open = eduState.list.filter(function (c) { return c.phase === 'open'; });
  var soon = eduState.list.filter(function (c) { return c.phase === 'upcoming'; });
  var tabs = [['open', '모집 중'], ['soon', '곧 열려요'], ['mine', '내 강좌']];
  var head = '<h2 class="edu-title">🎓 교육</h2><div class="edu-tabs">' + tabs.map(function (t) {
    return '<button class="edu-tab' + (t[0] === tab ? ' on' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>';
  var body;
  if (tab === 'mine') {
    body = eduState.mine.length ? eduState.mine.map(function (m) {
      return '<div class="edu-card" data-course="' + eduEsc(m.courseId) + '"><span class="edu-k">' + eduEsc(eduStatusLine(m)) + '</span>' +
        '<b>' + eduEsc(m.title) + '</b><span>' + eduEsc(m.term) + '</span>' +
        (m.nextSession ? '<span>다음 시간 · ' + eduEsc(eduMd(m.nextSession.date)) + (m.nextSession.start ? ' ' + eduEsc(m.nextSession.start) : '') + '</span>' : '') +
        '</div>'; }).join('') : '<p class="edu-empty">아직 신청한 강좌가 없어요.</p>';
  } else {
    var list = tab === 'soon' ? soon : open;
    body = list.length ? list.map(function (c) {
      return '<div class="edu-card" data-course="' + eduEsc(c.id) + '"><span class="edu-k">' + eduEsc(c.kindLabel) + '</span>' +
        '<b>' + eduEsc(c.title) + (c.term ? ' <small>(' + eduEsc(c.term) + ')</small>' : '') + '</b>' +
        (c.firstDate ? '<span>' + eduEsc(eduMd(c.firstDate)) + (c.lastDate && c.lastDate !== c.firstDate ? ' ~ ' + eduEsc(eduMd(c.lastDate)) : '') + ' · ' + c.sessionsCount + '회</span>' : '') +
        '<span>' + eduEsc(eduPhaseLabel(c)) + (c.mode === 'approve' ? ' · 담당자 확정' : '') + '</span></div>'; }).join('')
      : '<p class="edu-empty">' + (tab === 'soon' ? '곧 열릴 강좌가 없어요.' : '지금 모집 중인 강좌가 없어요.') + '</p>';
  }
  w.innerHTML = head + '<div class="edu-list">' + body + '</div>';
  w.querySelectorAll('.edu-tab').forEach(function (b) { b.addEventListener('click', function () { eduDrawList(b.dataset.tab); }); });
  w.querySelectorAll('.edu-card').forEach(function (c) { c.addEventListener('click', function () { renderEduCourse(c.dataset.course); }); });
}

function renderEduCourse(id) {
  var u = loadUser(); if (!u) { renderEntryScreen(); return; }
  var el = document.getElementById('app');
  el.innerHTML = '<div class="edu-wrap"><div class="ev-loading">불러오는 중…</div></div>' +
    '<button class="home-fab" id="edu-home" aria-label="첫 화면으로">' + homeFabLabel(u, true) + '</button>';
  window.scrollTo(0, 0);
  document.getElementById('edu-home').addEventListener('click', function () { renderSummary(); });
  api.eduCourse(id, u.user_id || '').then(function (r) {
    var w = document.querySelector('.edu-wrap'); if (!w) return;
    if (!r || !r.ok) { w.innerHTML = '<p class="edu-empty">' + eduEsc(eduErrText(r && r.error)) + '</p>'; return; }
    var c = r.course, m = r.mine;
    var sess = (c.sessions || []).map(function (s) {
      return '<li>' + s.no + ' · ' + eduEsc(eduMd(s.date)) + (s.start ? ' ' + eduEsc(s.start) : '') + (s.topic ? ' — ' + eduEsc(s.topic) : '') + '</li>'; }).join('');
    var info = [c.teacher && '강사 · ' + c.teacher, c.place && '장소 · ' + c.place, c.target && '대상 · ' + c.target, c.fee && '교재비 · ' + c.fee,
      c.prereq && c.prereq.length && '먼저 들으실 과정 · ' + c.prereq.join(', ')].filter(Boolean)
      .map(function (t) { return '<span>' + eduEsc(t) + '</span>'; }).join('');
    var rule = '출석 ' + c.attendPct + '% 이상' + (c.checkLabel ? ' + ' + c.checkLabel + ' 확인' : '');
    var act;
    if (m && ['applied', 'confirmed', 'waitlisted'].indexOf(m.status) >= 0) {
      act = '<div class="edu-mine"><b>' + eduEsc(eduStatusLine(m)) + '</b>' +
        (m.cancelUntil ? '<span>' + eduEsc(eduMd(m.cancelUntil)) + '까지 앱에서 취소할 수 있어요</span>' : '') +
        '<button class="edu-btn ghost" id="edu-cancel">신청 취소</button></div>';
    } else if (c.phase === 'open') {
      act = '<button class="edu-btn" id="edu-apply">신청하기</button>';
    } else {
      act = '<p class="edu-empty">' + eduEsc(eduPhaseLabel(c)) + '</p>';
    }
    w.innerHTML = '<button class="edu-back" id="edu-back">← 교육</button><h2 class="edu-title">' + eduEsc(c.title) + '</h2>' +
      '<div class="edu-sub">' + eduEsc(c.kindLabel) + (c.term ? ' · ' + eduEsc(c.term) : '') + ' · ' + eduEsc(eduPhaseLabel(c)) + '</div>' +
      (c.description ? '<p class="edu-desc">' + eduEsc(c.description) + '</p>' : '') +
      (info ? '<div class="edu-info">' + info + '</div>' : '') +
      (sess ? '<h3 class="edu-h">일정 ' + c.sessions.length + '회</h3><ul class="edu-sess">' + sess + '</ul>' : '') +
      '<h3 class="edu-h">수료 기준</h3><p class="edu-desc">' + eduEsc(rule) + '</p>' + act + '<p class="edu-msg" id="edu-msg" role="status"></p>';
    document.getElementById('edu-back').addEventListener('click', function () { renderEduList(); });
    // ⚠️ api(supaCall)는 응답에 error 가 있으면 throw 한다 — 오류 말은 .catch 의 err.message(서버 오류 코드)로 고른다.
    var say = function (t) { var x = document.getElementById('edu-msg'); if (x) x.textContent = t; };
    var ap = document.getElementById('edu-apply');
    if (ap) ap.addEventListener('click', function () {
      ap.disabled = true;
      api.eduApply(id, u.user_id || '').then(function (x) {
        appAlert(eduApplyMessage(x)); renderEduCourse(id);
      }).catch(function (err) { say(eduErrText(err && err.message)); ap.disabled = false; });
    });
    var cn = document.getElementById('edu-cancel');
    if (cn) cn.addEventListener('click', function () {
      // appConfirm(msg, opts) 두 인자 · Promise<boolean>(js/events.js 937줄과 같은 꼴)
      appConfirm('신청을 취소할까요?', { okText: '신청 취소', cancelText: '돌아가기', danger: true }).then(function (yes) {
        if (!yes) return;
        return api.eduCancel(m.id, u.user_id || '').then(function () {
          appAlert('취소했어요.'); renderEduCourse(id);
        }).catch(function (err) { say(eduErrText(err && err.message)); });
      });
    });
  }).catch(function () {
    var w = document.querySelector('.edu-wrap'); if (w) w.innerHTML = '<p class="edu-empty">' + eduErrText('') + '</p>';
  });
}
```
`appAlert(msg)`·`appConfirm(msg, opts) → Promise<boolean>`(app.js 2252~2253)·`homeFabLabel(u, true)`(app.js 1233)·`boardEsc`·`logFeature` 는 app.js 전역이다(`js/events.js` 가 같은 것을 쓴다).
`logFeature('edu', 0)` 이 서버 `FEATURES`(index.ts 1689줄 `const FEATURES = new Set([…])`)에 없으면 조용히 버려진다 — 그 Set 에 `"edu"` 를 더하고 `supabase/feature_log.sql` 머리 표에도 한 줄(feature-log 메모 「값 늘리면 SQL 머리 표도」).

- [ ] **Step 3: `js/api.js`** — `eventSignup` 근처에:
```js
  eduList: (user_id) => supaCall("eduList", { user_id }),
  eduCourse: (id, user_id) => supaCall("eduCourse", { id, user_id }),
  eduApply: (id, user_id) => supaCall("eduApply", { id, user_id }),
  eduCancel: (enrollment_id, user_id) => supaCall("eduCancel", { enrollment_id, user_id }),
  eduMine: (user_id) => supaCall("eduMine", { user_id }),
```
(`supaCall` 은 응답에 `error` 가 있으면 `new Error(code)` 로 throw 한다 — 화면은 `.catch(err => eduErrText(err.message))` 로 받는다.)

- [ ] **Step 4: `app.js` — 게이트와 첫 화면 단추**

`psalmVisible` 정의 근처(347줄)에:
```js
// 🎓 교육(2026-10-05) — app_config('eduOpen') 이 켜졌거나 🧪 시험 참여자일 때만 첫 화면 단추. 막는 것은 서버(eduApply not-open).
const EDU_PUB_KEY = "edu-open";
function eduOpenCached() { try { return localStorage.getItem(EDU_PUB_KEY) === "1"; } catch (e) { return false; } }
function refreshEduOpen() {
  if (!window.api || !api.getConfig) return;
  api.getConfig("eduOpen").then((d) => { try { localStorage.setItem(EDU_PUB_KEY, d && d.value ? "1" : "0"); } catch (e) {} }).catch(() => {});
}
function eduVisible() { return eduOpenCached() || ministryTesterCached(); }
```
`refreshPsalmPublic()` 를 부르는 자리(부팅)에서 `refreshEduOpen()` 도 부른다. 첫 화면 「함께」 묶음, `open-event-list` 단추 바로 뒤에:
```js
    ${eduVisible() ? `<button class="summary-help" id="open-edu">🎓 교육 신청</button>` : ""}
```
단추 연결(다른 `open-*` 를 다는 자리 — 2969줄 근처 `minBtn` 처럼):
```js
  const eduBtn = document.getElementById("open-edu");
  if (eduBtn) eduBtn.addEventListener("click", () => renderEduList());
```
⚠️ 「색은 네 단계뿐」(docs/notes/home-screen.md) — 새 단추에 제 색을 주지 않는다(`summary-help` 기본).

- [ ] **Step 5: `index.html`** — `js/events.js` script 줄 바로 뒤에:
```html
  <script src="js/edu.js?v=20261004a"></script>
```
(`?v=` 값은 지금 다른 줄과 같게 — bump 는 컨트롤러가 반영 때 한다. preflight 가 태그가 다르면 막는다.)

- [ ] **Step 6: `style.css`** — 파일 끝에(새 색 없이 기존 토큰):
```css
/* 🎓 교육(2026-10-05) — 이벤트 화면(.ev-*)과 같은 결 */
.edu-wrap { padding: 16px 16px 96px; }
.edu-title { font-size: 1.25rem; margin: 4px 0 10px; }
.edu-tabs { display: flex; gap: 6px; margin-bottom: 12px; flex-wrap: wrap; }
.edu-tab { border: 1px solid var(--line, #d6deec); background: transparent; border-radius: 999px; padding: 6px 12px; font-size: .9rem; }
.edu-tab.on { background: var(--navy, #1a3a6b); color: #fff; border-color: transparent; }
.edu-card { display: flex; flex-direction: column; gap: 2px; border: 1px solid var(--line, #e6e1d4); border-radius: 12px; padding: 12px; margin-bottom: 10px; background: var(--card, #fff); cursor: pointer; }
.edu-card b { font-size: 1rem; } .edu-card span { font-size: .88rem; opacity: .8; }
.edu-k { align-self: flex-start; font-size: .75rem !important; opacity: 1 !important; padding: 1px 8px; border-radius: 999px; background: var(--soft, #eef2f9); }
.edu-empty { opacity: .75; padding: 12px 0; }
.edu-sub { opacity: .8; margin-bottom: 10px; }
.edu-desc { white-space: pre-line; line-height: 1.6; }
.edu-info { display: flex; flex-direction: column; gap: 2px; margin: 10px 0; font-size: .92rem; }
.edu-h { font-size: 1rem; margin: 14px 0 4px; }
.edu-sess { padding-left: 18px; line-height: 1.7; font-size: .92rem; }
.edu-btn { display: block; width: 100%; margin-top: 16px; padding: 12px; border-radius: 12px; border: 0; background: var(--navy, #1a3a6b); color: #fff; font-weight: 700; font-size: 1rem; }
.edu-btn.ghost { background: transparent; color: var(--navy, #1a3a6b); border: 1px solid currentColor; }
.edu-mine { margin-top: 16px; padding: 12px; border-radius: 12px; background: var(--soft, #eef2f9); display: flex; flex-direction: column; gap: 4px; }
.edu-back { border: 0; background: transparent; padding: 4px 0; margin-bottom: 6px; font-size: .95rem; }
.edu-msg { min-height: 1.2em; margin-top: 8px; }
```
⚠️ 변수 이름(`--navy`·`--line`·`--card`·`--soft`)은 style.css 에 실제로 있는 토큰으로 바꾼다(어두운 모드가 따라오게 — 없으면 이벤트 화면 `.ev-*` 가 쓰는 토큰을 쓴다).

- [ ] **Step 7: preflight 에 시험 한 줄** — `tools/preflight.py` 의 마지막 `PURE_TESTS +=` 블록 뒤에(다른 줄을 고치지 않고 따로):
```python
# 교육신청(2026-10-05) — 화면 순수 함수(상태 줄·신청 결과 말·오류 말)
PURE_TESTS += ["tests/edu-front.test.cjs"]
```

- [ ] **Step 8: 시험과 로컬 확인**

```bash
node --test tests/edu-front.test.cjs
python tools/preflight.py
python -m http.server 8790 --bind 127.0.0.1   # 띄운 PID 만 끈다
```
개발 시험 계정(시험 참여자 · 시드 방법 `.superpowers/sdd/task-11b-report.md`)으로 http://127.0.0.1:8790 → 첫 화면 「🎓 교육 신청」 → 과제 5·6 에서 만든 「모집 중」 강좌 → 신청 → 「확정됐어요」 → 「내 강좌」 탭 → 취소 → 정원 찬 강좌는 「대기 N번」. 비테스터 계정은 단추가 없다. 390px·360px·어두운 모드 한 장씩.
Expected: 시험 PASS · preflight 「모두 통과」.

- [ ] **Step 9: 커밋**(공용 파일은 내 헝크만)

```bash
git add js/edu.js tests/edu-front.test.cjs
git add -p app.js js/api.js index.html style.css tools/preflight.py supabase/functions/api/index.ts supabase/feature_log.sql
git commit -m "feat(교육신청): 앱 🎓 교육 — 목록(모집 중·곧 열려요·내 강좌)·자세히·신청·취소 · 첫 화면 단추(eduOpen 또는 시험 참여자) · 순수 함수 시험"
```

---

### Task 9: 2027 상반기 강좌로 끝까지 — 개발 통시험

**Files:** 없음(확인만) · 결과는 `.superpowers/sdd/edu-stage1-e2e.md`(커밋 안 함)

- [ ] **Step 1:** 교회 어드민(개발 · localhost:8000)에서 강좌 셋을 만든다 — 「제자훈련 1단계」(정규 · 선착순 · 정원 3 · 대기 켬 · 회차 8 · 모집 중), 「교회학교 교사대학」(교사·사역자 · 승인 · 정원 없음 · 회차 6 · 모집 중), 「성경 읽기 세미나」(특강 · 신청 시작 내일 · 회차 1).
- [ ] **Step 2:** 성경암송 앱(개발 · 시험 참여자 계정 넷 — 시드)으로 「제자훈련」에 넷이 신청 → 확정 3 · 대기 1번. 「교사대학」 신청 → 「신청했어요 — 담당자가 확정하면…」. 「세미나」는 「곧 열려요」 탭에 「내일 날짜부터 신청」.
- [ ] **Step 3:** 교회 어드민 신청 현황 — 「교사대학」 확정 → 앱 「내 강좌」에 확정. 「제자훈련」 확정 한 분 취소 → 대기 분이 확정(앱 「내 강좌」에서 확인). 대신 등록 — 직접 입력 「새가족 홍길동」 → 정원 찼으니 대기. 엑셀 내려받기.
- [ ] **Step 4:** 앱에서 첫 회차를 오늘로 바꾼 강좌(교회 어드민 회차 고치기)의 신청 취소 → 「시작한 뒤에는 앱에서 취소할 수 없어요…」.
- [ ] **Step 5:** 응답 훑기 — 브라우저 네트워크에서 `eduList`·`eduCourse`·`eduMine`·`eduEnrollList` 응답에 `user_id`·`ident_key` 가 없는지.
- [ ] **Step 6:** 결과·스크린샷 경로를 `.superpowers/sdd/edu-stage1-e2e.md` 에 적는다.

---

### Task 10: 운영 반영 (컨트롤러 · 게이트는 닫힌 채)

순서가 중요하다 — **표·함수가 먼저**(빈 표는 아무도 안 읽는다), 그다음 서버 둘, 그다음 화면. 게이트(`eduOpen`)는 닫힌 채라 🧪 시험 참여자만 본다.

- [ ] **Step 1:** 운영 `supabase/edu.sql`(절대경로 · users 400 넘음 확인) → 확인 select(`tables 3 · functions 5 · grants 0`) → 운영 `supabase/member_merge.sql` 다시(표가 생긴 뒤라 트리거가 붙는다) → 운영 `check-authenticated-exposure.sql`(교회 어드민 저장소) 0행.
- [ ] **Step 2:** 교회 어드민 운영 `010_education_role.sql` → 가지 `education-stage1` 을 main 에 합치고 운영 함수 배포(⚠️ 「운영 함수 올리기 전 download 대조」 — 남의 배포 판과 맞는지) → `server.dev` 와 같은 PROBE 를 운영에서는 돌리지 않는다 · 화면 푸시(Actions).
- [ ] **Step 3:** 성경암송 운영 `api` — `git fetch && git rebase origin/main` · 운영 판 download 대조 → 배포 → `EVT_ENV=prod bash tests/edu-smoke.sh` · `EVT_ENV=prod EXPECT_PER_DAY=3 EXPECT_AUTO=1 bash tests/event-smoke.sh`(남의 경로).
- [ ] **Step 4:** 성경암송 프런트 — `python tools/bump.py` → preflight → push → `APP_BUILD` 확인.
- [ ] **Step 5:** 친구: 교회 어드민에서 교육 담당자에게 역할 「교육」 주기(⚙️ 시스템 → 🔑 담당자·역할) · 🧪 시험 참여자로 폰 확인.
- [ ] **Step 6:** 문서 — CLAUDE.md 지도 표에 「교육신청 → docs/notes/education.md」 한 줄 · `docs/notes/education.md`(함정: SQL 함수 한 곳 · 합치기 · 게이트 · 1단계에서 안 하는 것) · 교회 어드민 CLAUDE.md 「교육」 절 · 메모.

---

### Task 11: 공개 전 — 개인정보 안내 세 곳 (⏸ 플레이 심사가 끝난 뒤)

- [ ] **Step 1:** 성경암송 `privacy/index.html`(모으는 것 표에 「교육 신청 — 강좌·신청 시각·상태 · 담당자가 적은 교재비 납부·메모」 · 누가 보나 4항에 「교육 담당자(교회 어드민)」 · 얼마나 두나) · 앱 `renderPrivacyInfo`·`renderHelp` 🔒 — **같은 커밋** · 「마지막 수정」 날짜. `tests/store-review.test.cjs` 의 「개인정보 세 곳」 검사가 통과해야 한다.
- [ ] **Step 2:** 교회 어드민 `privacy.html` 에 교육 역할이 보는 것 한 줄(같은 날).
- [ ] **Step 3:** 친구가 2027 상반기 모집을 여는 날 `app_config.eduOpen = true`(운영 · 교회 어드민 또는 SQL 한 줄 — 친구 확인 뒤) → 모든 성도님 첫 화면에 「🎓 교육 신청」.
```
