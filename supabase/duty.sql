-- 봉사 당번 — 당번·자리 틀·날짜·자리·지원 표와 정원·겹침·잠금·쉼 규칙(2026-10-06 · 설계 docs/superpowers/specs/2026-10-06-duty-roster-design.md §4·§5)
--   식당 설거지처럼 「날짜 × 예배(조) × 일 × 정원」 자리에 성도님이 지원한다. 김장 같은 한 번짜리 모집도 같은 틀(요일 없는 자리 틀 + 날짜 더하기).
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키를 절대 넣지 마세요.
-- 적용: 개발(ktpwthwqzgcqcrmsafdo) 먼저 → supabase/tests/duty_rules.dev.sql · tests/duty-concurrency.dev.sh 확인 → 운영.
--       이 파일 뒤에 supabase/member_merge.sql 을 다시 돌린다(표가 먼저 있어야 쓰기 연결 트리거가 duty_signups 에 붙는다).
--       교회 어드민 저장소 supabase/sql/015_duty_roles_staff.sql(역할 둘 · 담당 표)은 이 파일 **뒤**에(그 표가 duty_boards 를 가리킨다).
-- 여러 번 돌려도 안전하다(if not exists · create or replace).
-- ⚠️ 상태(지원 줄 · 쉼 · 확정 · 정원)는 **이 파일의 함수 한 곳**에서만 바꾼다 — 성경암송 api(성도님)와 교회 어드민 함수(담당자)가
--    둘 다 이 함수를 부른다. 코드에서 직접 update 하지 말 것(담당자 메모 staff_note 한 칸만 예외).
-- ⚠️ 잠금 차례는 모든 함수가 같다(교착 막기):
--      ① 사람 advisory 잠금 (7240911, hashtext(사람)) — 같은 분의 지원·옮기기를 한 줄로 세운다(겹치는 두 자리에 동시에 · 미리 잡는 수를 동시에 넘기기)
--      ② 날짜 줄 duty_days … for update (두 날짜면 날짜 차례 · 자리 틀을 고칠 때는 당번 줄 → 앞날 날짜 줄들)
--      ③ 자리 줄 duty_slots … for update (둘이면 id 차례)
--      ④ 지원 줄 duty_signups … for update
--    지원 줄을 **쓰기 시작한 뒤에는 새 잠금을 잡지 않는다** — member_merge.sql 의 쓰기 연결 트리거가 줄을 쓸 때 전역 잠금 (7240910, 1) 을 쥔다.
-- ⚠️ 「확정됨(잠김)」은 표에 쓰는 값이 아니라 그때그때 셈한다(duty_locked): 담당자가 확정했거나 지금이 그날 **전날 19:00(한국)**을 지났다.
--    19시라는 숫자는 duty_cutoff 한 곳에만 둔다(크론·api·화면에 따로 적지 않는다 — 화면은 서버가 준 lockAt 을 보여 준다).
-- ⚠️ 화면이 읽는 것은 jsonb 하나를 돌려주는 함수(duty_list_view · duty_board_view · duty_mine · duty_roster)다 — user_id·ident_key 를
--    싣지 않는다(시험이 낱말로 본다). 알림용 duty_notify_rows·duty_remind_rows 만 받는 분(uid)을 싣는다 — api 안에서만 쓰고 응답에 싣지 말 것.
begin;
-- 성도님이 쓰는 중에 표·함수 잠금을 오래 기다리지 않게(edu.sql · member_merge.sql 과 같다) — 5초 안에 못 잡으면 통째로 되돌리고 멈춘다.
set local lock_timeout = '5s';

-- ---------- 표 ----------
-- 당번 — status: draft 준비(앱에 안 보임 · 담당자 일은 됨) · open 받는 중 · closed 지원 멈춤(앱에 명단·내 당번은 보임 · 새 지원만 막음 —
--   담당자가 넣는 당번도 이 상태) · archived 보관(안 보임 · 쓰기 거절 — 지우는 길은 없다 · 시험 당번은 보관으로).
--   open_days = 오늘부터 며칠 앞 자리까지 앱에 보이나(그만큼 자리가 저절로 만들어진다 — duty_ensure_slots) · until_date = 이 날 뒤로는 만들지 않는다(null = 계속)
--   max_ahead = 한 분이 이 당번에 미리 잡아 둘 수 있는 앞날 자리 수(null = 제한 없음) · contact_note = 문의처 한 줄(교육 강좌 「문의」와 같은 규칙 — 알려도 되는 번호만)
create table if not exists public.duty_boards (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(title) between 1 and 40),
  description  text not null default '' check (char_length(description) <= 1000),
  place        text not null default '' check (char_length(place) <= 40),
  contact_note text not null default '' check (char_length(contact_note) <= 60),
  open_days    int  not null default 56 check (open_days between 7 and 370),
  until_date   date,
  max_ahead    int  check (max_ahead is null or max_ahead between 1 and 200),
  status       text not null default 'draft' check (status in ('draft','open','closed','archived')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- 자리 틀 — 「주일 · 2부 · 설거지 · 11:30~12:30 · 2명」. 자리(duty_slots)는 이 줄을 가리키고 이름·시각을 여기서 읽는다(고치면 그 틀의 모든 자리에 보인다).
--   weekday: 0=주일 … 6=토(extract(dow) 와 같다 · isodow 아님) · null = 날짜를 골라 넣는 줄(한 번짜리 모집 · 특별 예배)
--   시각은 둘 다 꼭(겹침 검사의 재료) · start < end — 자정을 넘는 자리는 23:59 에서 끊어 적는다.
--   뺀 틀은 active = false 로 남긴다(지난 자리가 가리킨다) — 살아 있는 줄끼리만 이름이 겹치지 않는다.
create table if not exists public.duty_lines (
  id         bigint generated always as identity primary key,
  board_id   uuid not null references public.duty_boards(id) on delete restrict,
  sort       int  not null default 0 check (sort between -999 and 999),
  service    text not null check (service = btrim(normalize(service, NFC)) and char_length(service) between 1 and 12),
  task       text not null default '' check (task = btrim(normalize(task, NFC)) and char_length(task) <= 20),
  start_time time not null,
  end_time   time not null,
  capacity   int  not null check (capacity between 1 and 200),
  weekday    int  check (weekday is null or weekday between 0 and 6),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_time < end_time)
);
create unique index if not exists duty_lines_live_name on public.duty_lines(board_id, service, task) where active;

-- 날짜 하나의 상태 — 쉼(off)과 확정(confirmed_at)은 **서로 독립인 두 사실**이다(쉼을 풀어도 확정 여부는 그대로).
--   자리가 있는 날짜에는 늘 이 줄이 있다(자리가 FK 로 가리킨다 — 잠글 부모가 늘 있다). 자리가 없는 날짜도 미리 쉬는 날로 둘 수 있다.
--   note = 성도님께도 보이는 한 줄(「여름 휴가」) · confirmed_by = 확정한 담당자 admin_members.id(그 표는 교회 어드민 것이라 FK 없음 · 응답에 싣지 않는다)
create table if not exists public.duty_days (
  board_id     uuid not null references public.duty_boards(id) on delete restrict,
  on_date      date not null,
  off          boolean not null default false,
  note         text not null default '' check (char_length(note) <= 60),
  confirmed_at timestamptz,
  confirmed_by uuid,
  updated_at   timestamptz not null default now(),
  primary key (board_id, on_date)
);

-- 자리 — (자리 틀 × 날짜) 하나. 정원만 자리마다 따로 둔다(이 날만 3명) · off = 이 자리만 쉼.
create table if not exists public.duty_slots (
  id         bigint generated always as identity primary key,
  board_id   uuid not null,
  on_date    date not null,
  line_id    bigint not null references public.duty_lines(id) on delete restrict,
  capacity   int  not null check (capacity between 1 and 200),
  off        boolean not null default false,
  created_at timestamptz not null default now(),
  unique (line_id, on_date),
  foreign key (board_id, on_date) references public.duty_days(board_id, on_date) on delete restrict
);
create index if not exists duty_slots_board_date on public.duty_slots(board_id, on_date);

-- 지원 한 줄 — **자리·사람에 한 줄**(다시 지원하면 그 줄을 되살린다 — 줄이 끝없이 늘지 않는다).
--   user_id = 앱 계정(대신 넣은 분은 null 가능 — 그때는 ident_key 필수: 명부에서 고른 분 person|<교인ID> · 직접 입력 staff|…)
--   who_type·group_name·sub_name·name = 지원 당시 신원 사진(서버가 users 줄에서 읽는다 — 화면이 보낸 값을 쓰지 않는다)
--   status: active · cancelled(본인 취소) · removed(담당자가 뺌 · 기록 합치기로 정리) · end_reason: self · staff · merge
--     담당자가 뺀 줄(staff)은 본인이 그 자리에 스스로 다시 지원하지 못한다(duty_apply removed-by-staff) — 담당자는 다시 넣을 수 있다.
--   ask_at·ask_why = 잠긴 뒤 「못 가게 됐어요」(cant) · 「잘못 눌렀어요」(mistake) · 「제가 한 게 아니에요」(notme) — 줄은 그대로, 빼는 것은 담당자
--   staff_note = 담당자만 보는 메모(앱 응답·엑셀에 싣지 않는다)
--   moved_at·moved_from = 담당자가 옮긴 때와 옮기기 전 자리({date, service, task, start}) — 내 당번에 「담당자가 2부 → 1부로 바꿨어요」로 그날까지 보인다
--   source = 'staff'(담당자가 넣은 줄)는 본인이 앱에서 스스로 빼지 못한다(duty_cancel staff-row) — 담당자가 정한 것은 담당자가 바꾼다. 「못 가게 됐어요」로 알린다.
create table if not exists public.duty_signups (
  id         bigint generated always as identity primary key,
  slot_id    bigint not null references public.duty_slots(id) on delete restrict,
  user_id    uuid references public.users(id) on delete cascade,
  ident_key  text not null default '',
  who_type   text not null default '',
  group_name text not null default '',
  sub_name   text not null default '',
  name       text not null check (char_length(name) between 1 and 40),
  status     text not null check (status in ('active','cancelled','removed')),
  end_reason text check (end_reason is null or end_reason in ('self','staff','merge')),
  source     text not null default 'app' check (source in ('app','staff')),
  staff_note text not null default '' check (char_length(staff_note) <= 500),
  ask_at     timestamptz,
  ask_why    text check (ask_why is null or ask_why in ('cant','mistake','notme')),
  applied_at timestamptz not null default now(),
  ended_at   timestamptz,
  moved_at   timestamptz,
  moved_from jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (user_id is not null or ident_key <> ''),
  check ((status = 'active') = (end_reason is null))
);
alter table public.duty_signups add column if not exists moved_at   timestamptz;
alter table public.duty_signups add column if not exists moved_from jsonb;
create unique index if not exists duty_signups_slot_user on public.duty_signups(slot_id, user_id) where user_id is not null;
create unique index if not exists duty_signups_slot_key  on public.duty_signups(slot_id, ident_key) where user_id is null;
create index if not exists duty_signups_user_live   on public.duty_signups(user_id) where status = 'active';
create index if not exists duty_signups_slot_status on public.duty_signups(slot_id, status);

-- 앱 알림 기록 — **같은 지원에 같은 알림은 한 번**(교육 edu_notify_log 와 같은 꼴). kind: confirmed(담당자가 날짜를 확정) · remind(전날 저녁).
--   쓰는 것은 duty_notify_claim 하나 — 보내기 **전에** 줄을 잡고 잡힌 지원에만 보낸다. 지원 줄을 따라간다(cascade).
--   담당자가 넣음·옮김·뺌 · 쉬는 날 · 잠긴 날 지원 알림은 한 번의 저장에 한 번만 부탁하므로 여기에 적지 않는다.
--   옮기기(duty_move)는 그 줄의 remind 기록을 지운다 — 전날 알림이 새 자리로 다시 가게.
create table if not exists public.duty_notify_log (
  signup_id bigint not null references public.duty_signups(id) on delete cascade,
  kind      text   not null check (kind in ('confirmed','remind')),
  sent_at   timestamptz not null default now(),
  primary key (signup_id, kind)
);

alter table public.duty_boards     enable row level security;
alter table public.duty_lines      enable row level security;
alter table public.duty_days       enable row level security;
alter table public.duty_slots      enable row level security;
alter table public.duty_signups    enable row level security;
alter table public.duty_notify_log enable row level security;
revoke all on public.duty_boards, public.duty_lines, public.duty_days, public.duty_slots, public.duty_signups, public.duty_notify_log from public, anon, authenticated;
grant all on public.duty_boards, public.duty_lines, public.duty_days, public.duty_slots, public.duty_signups, public.duty_notify_log to service_role;
revoke all on sequence public.duty_lines_id_seq, public.duty_slots_id_seq, public.duty_signups_id_seq from public, anon, authenticated;

-- ---------- 작은 도우미 ----------
-- 오늘(한국)
create or replace function public.duty_today() returns date language sql stable set search_path = public as $$
  select (now() at time zone 'Asia/Seoul')::date
$$;

-- 그날이 저절로 잠기는 때 = **전날 19:00(한국)**. 이 숫자는 여기 한 곳.
create or replace function public.duty_cutoff(p_date date) returns timestamptz language sql stable set search_path = public as $$
  select ((p_date - 1) + time '19:00') at time zone 'Asia/Seoul'
$$;

-- 잠긴 날인가 — 담당자가 확정했거나, 지금이 그날의 마감을 지났다.
create or replace function public.duty_locked(p_confirmed timestamptz, p_date date) returns boolean language sql stable set search_path = public as $$
  select p_confirmed is not null or now() >= public.duty_cutoff(p_date)
$$;

-- 당번표에 싣는 이름 — 완성형(NFC) · 제어·방향 바꿈 글자 빼기 · 20자(로그인 때 적은 글이라 그대로 믿지 않는다).
create or replace function public.duty_name_out(p text) returns text language sql immutable set search_path = public as $$
  select left(btrim(regexp_replace(normalize(coalesce(p, ''), NFC), '[[:cntrl:]​-‏‪-‮⁦-⁩]', '', 'g')), 20)
$$;

-- 같은 분인가(겹침·이미 내 줄 찾기에 쓴다) — 앱 계정이면 계정으로, 계정 없는 줄이면 신원 키로.
create or replace function public.duty_same_person(e public.duty_signups, p_user uuid, p_key text) returns boolean
language sql immutable set search_path = public as $$
  select case when p_user is not null then e.user_id = p_user else e.user_id is null and e.ident_key = p_key end
$$;

-- ---------- 자리 만들기(저절로) ----------
-- 요일이 있는 살아 있는 틀 × [오늘, min(오늘 + 보이는 기간, 끝 날짜)] 에 **없는 자리만** 만든다(날짜 줄도). 이미 있는 자리(정원을 고친 자리·쉬는 자리·
--   지원이 달린 자리)는 건드리지 않는다. 읽는 함수들이 먼저 부르고, 틀을 고친 뒤에도 부른다 — 「자리 만들기」를 잊어 당번표가 비는 일이 없다.
--   보관한 당번은 만들지 않는다. 돌려주는 값 = 이번에 만든 자리 수. 동시에 두 번 불러도 on conflict do nothing 이라 한 벌만 생긴다.
create or replace function public.duty_ensure_slots(p_board uuid) returns int
language plpgsql security definer set search_path = public as $$
declare b public.duty_boards; d0 date := duty_today(); d1 date; n int := 0;
begin
  select * into b from public.duty_boards where id = p_board;
  if not found or b.status = 'archived' then return 0; end if;
  d1 := d0 + b.open_days;
  if b.until_date is not null and b.until_date < d1 then d1 := b.until_date; end if;
  if d1 < d0 then return 0; end if;
  insert into public.duty_days(board_id, on_date)
    select distinct p_board, d0 + g.i
    from public.duty_lines l
    join generate_series(0, d1 - d0) as g(i) on extract(dow from (d0 + g.i))::int = l.weekday
    where l.board_id = p_board and l.active and l.weekday is not null
      and not exists (select 1 from public.duty_slots s where s.line_id = l.id and s.on_date = d0 + g.i)
  on conflict (board_id, on_date) do nothing;
  insert into public.duty_slots(board_id, on_date, line_id, capacity)
    select p_board, d0 + g.i, l.id, l.capacity
    from public.duty_lines l
    join generate_series(0, d1 - d0) as g(i) on extract(dow from (d0 + g.i))::int = l.weekday
    where l.board_id = p_board and l.active and l.weekday is not null
      and not exists (select 1 from public.duty_slots s where s.line_id = l.id and s.on_date = d0 + g.i)
  on conflict (line_id, on_date) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------- 자리 틀 ----------
-- 틀 하나 넣기·고치기 — **id 로 맞춘다**(id 가 있으면 그 줄을 고친다 · 없으면 새 줄).
--   p_line = {id?, service, task, start, end, capacity, weekday(0~6 | null), sort}
--   차례: 당번 줄 for update → 앞날 날짜 줄들 for update(지원과 한 줄로 선다) → 쓰기.
--   요일을 바꾸면 옛 요일에 맞춰 생긴 앞날 자리 가운데 **지원 줄이 하나도 없는**(취소·뺀 줄 포함) 자리만 지운다 — 남긴 수를 kept 로 돌려준다.
--   정원을 바꾸며 p_apply_future 면 옛 정원 그대로인 앞날 자리만 새 정원으로(찬 수 아래로는 안 내린다) — 바꾼 수 updated.
--   이름·시각은 자리가 틀에서 읽으므로 고치면 그 틀의 모든 자리에 곧바로 보인다.
--   거절: not-found(당번·틀) · archived · bad-line(글자·시각·정원·요일) · dup-line(살아 있는 같은 이름)
create or replace function public.duty_line_save(p_board uuid, p_line jsonb, p_apply_future boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  b public.duty_boards; cur public.duty_lines; d0 date := duty_today();
  v_id bigint; v_service text; v_task text; v_start time; v_end time; v_cap int; v_wd int; v_sort int;
  kept int := 0; updated int := 0; made int := 0;
begin
  p_apply_future := coalesce(p_apply_future, false);
  if p_line is null or jsonb_typeof(p_line) <> 'object' then return jsonb_build_object('ok',false,'error','bad-line'); end if;
  begin
    v_id      := nullif(p_line->>'id', '')::bigint;
    v_service := btrim(normalize(coalesce(p_line->>'service', ''), NFC));
    v_task    := btrim(normalize(coalesce(p_line->>'task', ''), NFC));
    v_start   := (p_line->>'start')::time;
    v_end     := (p_line->>'end')::time;
    v_cap     := (p_line->>'capacity')::int;
    v_wd      := nullif(p_line->>'weekday', '')::int;
    v_sort    := coalesce(nullif(p_line->>'sort', '')::int, 0);
  exception when others then
    return jsonb_build_object('ok',false,'error','bad-line');
  end;
  if char_length(v_service) not between 1 and 12 or char_length(v_task) > 20 or v_start is null or v_end is null or not (v_start < v_end)
     or v_cap is null or v_cap not between 1 and 200 or (v_wd is not null and v_wd not between 0 and 6) or v_sort not between -999 and 999 then
    return jsonb_build_object('ok',false,'error','bad-line');
  end if;
  select * into b from public.duty_boards where id = p_board for update;
  if not found then return jsonb_build_object('ok',false,'error','not-found'); end if;
  if b.status = 'archived' then return jsonb_build_object('ok',false,'error','archived'); end if;
  perform 1 from public.duty_days where board_id = p_board and on_date >= d0 order by on_date for update;
  if exists (select 1 from public.duty_lines x where x.board_id = p_board and x.active and x.service = v_service and x.task = v_task
               and x.id is distinct from v_id) then
    return jsonb_build_object('ok',false,'error','dup-line');
  end if;
  if v_id is null then
    insert into public.duty_lines(board_id, sort, service, task, start_time, end_time, capacity, weekday)
      values (p_board, v_sort, v_service, v_task, v_start, v_end, v_cap, v_wd) returning id into v_id;
  else
    select * into cur from public.duty_lines where id = v_id and board_id = p_board for update;
    if not found or not cur.active then return jsonb_build_object('ok',false,'error','not-found'); end if;
    if cur.weekday is not null and cur.weekday is distinct from v_wd then
      -- 옛 요일에 맞춰 저절로 생긴 앞날 자리만(날짜를 골라 더한 자리는 둔다) — 지원 줄이 하나도 없는 것은 지우고, 있는 것은 남긴 수로 알린다
      delete from public.duty_slots s where s.line_id = v_id and s.on_date >= d0 and extract(dow from s.on_date)::int = cur.weekday
        and not exists (select 1 from public.duty_signups e where e.slot_id = s.id);
      select count(*) into kept from public.duty_slots s where s.line_id = v_id and s.on_date >= d0 and extract(dow from s.on_date)::int = cur.weekday;
    end if;
    update public.duty_lines set sort = v_sort, service = v_service, task = v_task, start_time = v_start, end_time = v_end,
        capacity = v_cap, weekday = v_wd, updated_at = now() where id = v_id;
    if p_apply_future and cur.capacity <> v_cap then
      update public.duty_slots s set capacity = greatest(v_cap, (select count(*)::int from public.duty_signups e where e.slot_id = s.id and e.status = 'active'), 1)
        where s.line_id = v_id and s.on_date >= d0 and s.capacity = cur.capacity;
      get diagnostics updated = row_count;
    end if;
  end if;
  made := duty_ensure_slots(p_board);
  return jsonb_build_object('ok',true,'id',v_id,'kept',kept,'updated',updated,'made',made);
end $$;

-- 틀 빼기 — 자리가 하나도 없는 틀은 지운다(deleted:true). 자리가 있으면 active = false 로 남기고(지난 자리가 가리킨다)
--   앞날 자리 가운데 지원 줄이 하나도 없는 것만 지운다 — 남긴 앞날 자리 수 kept(그 자리들은 명단에 그대로 보인다 · 담당자가 옮기거나 쉬게 한다).
create or replace function public.duty_line_remove(p_line bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cur public.duty_lines; b public.duty_boards; d0 date := duty_today(); kept int := 0;
begin
  select * into cur from public.duty_lines where id = p_line;
  if not found then return jsonb_build_object('ok',false,'error','not-found'); end if;
  select * into b from public.duty_boards where id = cur.board_id for update;
  if b.status = 'archived' then return jsonb_build_object('ok',false,'error','archived'); end if;
  perform 1 from public.duty_days where board_id = cur.board_id and on_date >= d0 order by on_date for update;
  select * into cur from public.duty_lines where id = p_line for update;
  if not found or not cur.active then return jsonb_build_object('ok',false,'error','not-found'); end if;
  delete from public.duty_slots s where s.line_id = p_line and s.on_date >= d0
    and not exists (select 1 from public.duty_signups e where e.slot_id = s.id);
  if not exists (select 1 from public.duty_slots s where s.line_id = p_line) then
    delete from public.duty_lines where id = p_line;
    return jsonb_build_object('ok',true,'deleted',true,'kept',0);
  end if;
  update public.duty_lines set active = false, updated_at = now() where id = p_line;
  select count(*) into kept from public.duty_slots s where s.line_id = p_line and s.on_date >= d0;
  return jsonb_build_object('ok',true,'deleted',false,'kept',kept);
end $$;

-- 날짜 더하기 — 그 날짜에 고른 틀의 자리를 만든다(요일과 무관 — 성탄절 · 특별 예배 · 한 번짜리 모집). 이미 있는 자리는 그대로(existed).
--   날짜는 오늘 − 31일 ~ 오늘 + 400일. 거절: not-found · archived · bad-date · bad-lines(이 당번의 살아 있는 틀이 아님 · 빈 목록)
create or replace function public.duty_date_add(p_board uuid, p_date date, p_line_ids bigint[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare b public.duty_boards; d0 date := duty_today(); ids bigint[]; made int := 0;
begin
  select * into b from public.duty_boards where id = p_board;
  if not found then return jsonb_build_object('ok',false,'error','not-found'); end if;
  if b.status = 'archived' then return jsonb_build_object('ok',false,'error','archived'); end if;
  if p_date is null or p_date < d0 - 31 or p_date > d0 + 400 then return jsonb_build_object('ok',false,'error','bad-date'); end if;
  select array_agg(distinct x) into ids from unnest(coalesce(p_line_ids, array[]::bigint[])) as x where x is not null;
  if ids is null or cardinality(ids) > 50
     or (select count(*) from public.duty_lines l where l.id = any(ids) and l.board_id = p_board and l.active) <> cardinality(ids) then
    return jsonb_build_object('ok',false,'error','bad-lines');
  end if;
  insert into public.duty_days(board_id, on_date) values (p_board, p_date) on conflict (board_id, on_date) do nothing;
  perform 1 from public.duty_days where board_id = p_board and on_date = p_date for update;
  insert into public.duty_slots(board_id, on_date, line_id, capacity)
    select p_board, p_date, l.id, l.capacity from public.duty_lines l where l.id = any(ids)
  on conflict (line_id, on_date) do nothing;
  get diagnostics made = row_count;
  return jsonb_build_object('ok',true,'made',made,'existed',cardinality(ids) - made);
end $$;

-- ---------- 쉬는 날 · 확정 ----------
-- 하루 또는 기간을 쉬는 날로 / 다시 열기 — **지원 줄은 건드리지 않는다**(쉬는 동안 찬 수·겹침·전날 알림에서 빠지고, 다시 열면 그대로 살아난다).
--   p_expect = 화면이 확인 창에 보여 준 「상태가 바뀌는 날의 살아 있는 지원 수」. null 이면 **세기만** 한다({ok, dry:true, active, days} · 아무것도 안 씀).
--   숫자를 주면 지금 수와 같을 때만 쓴다(그 사이 지원이 들어왔으면 {ok:false, error:'changed', active}).
--   기간은 오늘 이후 · 92일까지. 쉬는 날로 바꿀 때는 그 기간에서 **자리가 있거나 요일이 맞아 자리가 생길 날짜**의 날짜 줄을 미리 만든다
--   (보이는 기간 밖이라 자리가 아직 없는 여름 휴가도 미리 쉬는 날로 둘 수 있다).
--   p_note 를 주면 그 날짜들의 한 줄 메모도 바꾼다(null 이면 그대로 · 다시 열 때 '' 를 주면 지운다).
--   돌려주는 것 {ok, days: 바뀐 날짜 수, active, ids: [알릴 지원 번호 — 앱 계정이 있는 살아 있는 줄]}.
create or replace function public.duty_days_off(p_board uuid, p_from date, p_to date, p_off boolean, p_note text default null, p_expect int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b public.duty_boards; d0 date := duty_today(); n int; changed int; ids jsonb;
begin
  if p_off is null or p_from is null or p_to is null or p_to < p_from or p_from < d0 or p_to - p_from > 92 then
    return jsonb_build_object('ok',false,'error','bad-range');
  end if;
  if p_note is not null and char_length(p_note) > 60 then return jsonb_build_object('ok',false,'error','too-long'); end if;
  select * into b from public.duty_boards where id = p_board;
  if not found then return jsonb_build_object('ok',false,'error','not-found'); end if;
  if b.status = 'archived' then return jsonb_build_object('ok',false,'error','archived'); end if;
  if p_off and p_expect is not null then
    -- 자리가 있거나 요일이 맞아 자리가 생길 날짜만(그 밖의 날짜는 쉬게 할 것이 없다)
    insert into public.duty_days(board_id, on_date)
      select p_board, p_from + g.i from generate_series(0, p_to - p_from) as g(i)
      where exists (select 1 from public.duty_slots s where s.board_id = p_board and s.on_date = p_from + g.i)
         or exists (select 1 from public.duty_lines l where l.board_id = p_board and l.active
                      and l.weekday = extract(dow from (p_from + g.i))::int)
    on conflict (board_id, on_date) do nothing;
  end if;
  perform 1 from public.duty_days where board_id = p_board and on_date between p_from and p_to order by on_date for update;
  select count(*)::int,
         coalesce(jsonb_agg(e.id order by e.id) filter (where e.user_id is not null), '[]'::jsonb)
    into n, ids
    from public.duty_signups e
    join public.duty_slots s on s.id = e.slot_id
    join public.duty_days d on d.board_id = s.board_id and d.on_date = s.on_date
    where s.board_id = p_board and s.on_date between p_from and p_to and e.status = 'active'
      and not s.off and d.off is distinct from p_off;
  if p_expect is null then
    select count(*)::int into changed from generate_series(0, p_to - p_from) as g(i)
      left join public.duty_days d on d.board_id = p_board and d.on_date = p_from + g.i
      where coalesce(d.off, false) is distinct from p_off
        and (exists (select 1 from public.duty_slots s where s.board_id = p_board and s.on_date = p_from + g.i)
             or exists (select 1 from public.duty_lines l where l.board_id = p_board and l.active
                          and l.weekday = extract(dow from (p_from + g.i))::int)
             or (not p_off and d.on_date is not null));
    return jsonb_build_object('ok',true,'dry',true,'active',n,'days',changed);
  end if;
  if p_expect <> n then return jsonb_build_object('ok',false,'error','changed','active',n); end if;
  update public.duty_days set off = p_off, updated_at = now()
    where board_id = p_board and on_date between p_from and p_to and off is distinct from p_off;
  get diagnostics changed = row_count;
  if p_note is not null then
    update public.duty_days set note = p_note, updated_at = now()
      where board_id = p_board and on_date between p_from and p_to and off = p_off and note is distinct from p_note;
  end if;
  return jsonb_build_object('ok',true,'days',changed,'active',n,'ids',ids);
end $$;

-- 날짜 확정 · 확정 풀기 · 한 줄 메모.
--   confirm   — 오늘 이후만(past). 이미 잠긴 날(확정했거나 전날 저녁이 지남)이면 {ok, already:true}(아무것도 안 바꿈 — 알림을 부탁하지 않게).
--               성공 {ok, ids: [알릴 지원 번호 — 그날 살아 있고 앱 계정이 있고 쉬는 자리가 아닌 줄], active: 그날 살아 있는 줄 수}. 쉬는 날은 ids 가 빈다.
--   unconfirm — 확정한 날만 · **전날 저녁(마감)이 지나면 too-late**(풀어도 다시 잠긴 날이다 — 담당자가 직접 빼기·옮기기). 확정이 아니면 {ok, already:true}.
--   note      — 한 줄 메모(60자 · '' 로 지움)
--   거절: not-found · archived · bad-op · past · too-late · too-long
create or replace function public.duty_day_set(p_board uuid, p_date date, p_op text, p_by uuid default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b public.duty_boards; d public.duty_days; n int; ids jsonb;
begin
  if p_op is null or p_op not in ('confirm','unconfirm','note') or p_date is null then return jsonb_build_object('ok',false,'error','bad-op'); end if;
  select * into b from public.duty_boards where id = p_board;
  if not found then return jsonb_build_object('ok',false,'error','not-found'); end if;
  if b.status = 'archived' then return jsonb_build_object('ok',false,'error','archived'); end if;
  if p_op = 'note' and char_length(coalesce(p_note, '')) > 60 then return jsonb_build_object('ok',false,'error','too-long'); end if;
  if p_op = 'confirm' and p_date < duty_today() then return jsonb_build_object('ok',false,'error','past'); end if;
  insert into public.duty_days(board_id, on_date) values (p_board, p_date) on conflict (board_id, on_date) do nothing;
  select * into d from public.duty_days where board_id = p_board and on_date = p_date for update;
  if p_op = 'note' then
    update public.duty_days set note = coalesce(p_note, ''), updated_at = now() where board_id = p_board and on_date = p_date;
    return jsonb_build_object('ok',true);
  end if;
  if p_op = 'unconfirm' then
    if d.confirmed_at is null then return jsonb_build_object('ok',true,'already',true); end if;
    if now() >= duty_cutoff(p_date) then return jsonb_build_object('ok',false,'error','too-late'); end if;
    update public.duty_days set confirmed_at = null, confirmed_by = null, updated_at = now() where board_id = p_board and on_date = p_date;
    return jsonb_build_object('ok',true);
  end if;
  if duty_locked(d.confirmed_at, p_date) then return jsonb_build_object('ok',true,'already',true); end if;
  update public.duty_days set confirmed_at = now(), confirmed_by = p_by, updated_at = now() where board_id = p_board and on_date = p_date;
  select count(*)::int,
         coalesce(jsonb_agg(e.id order by e.id) filter (where e.user_id is not null and not s.off and not d.off), '[]'::jsonb)
    into n, ids
    from public.duty_signups e join public.duty_slots s on s.id = e.slot_id
    where s.board_id = p_board and s.on_date = p_date and e.status = 'active';
  return jsonb_build_object('ok',true,'ids',ids,'active',n);
end $$;

-- 자리 하나 고치기 — 정원 · 이 자리만 쉼. 바꿀 칸만 준다(null = 그대로).
--   정원: 줄이는 저장에만 찬 수를 본다(찬 수보다 작게는 below-count · active) — 담당자가 정원을 넘겨 넣어 둔 자리도 다른 칸은 고칠 수 있다.
--   쉼: 켤 때 그 자리에 살아 있는 지원이 있으면 p_expect 가 그 수와 같아야 쓴다(아니면 changed · active). 지원 줄은 건드리지 않는다.
--   성공 {ok, capacity, off, active, ids: [쉼이 바뀌어 알릴 지원 번호]}. 거절: not-found · archived · bad-capacity · below-count · changed
create or replace function public.duty_slot_set(p_slot bigint, p_capacity int default null, p_off boolean default null, p_expect int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.duty_slots; b public.duty_boards; n int; ids jsonb := '[]'::jsonb;
begin
  select * into s from public.duty_slots where id = p_slot;
  if not found then return jsonb_build_object('ok',false,'error','not-found'); end if;
  select * into b from public.duty_boards where id = s.board_id;
  if b.status = 'archived' then return jsonb_build_object('ok',false,'error','archived'); end if;
  if p_capacity is not null and p_capacity not between 1 and 200 then return jsonb_build_object('ok',false,'error','bad-capacity'); end if;
  perform 1 from public.duty_days where board_id = s.board_id and on_date = s.on_date for update;
  select * into s from public.duty_slots where id = p_slot for update;
  if not found then return jsonb_build_object('ok',false,'error','not-found'); end if;
  select count(*)::int into n from public.duty_signups e where e.slot_id = p_slot and e.status = 'active';
  if p_capacity is not null and p_capacity < s.capacity and p_capacity < n then
    return jsonb_build_object('ok',false,'error','below-count','active',n);
  end if;
  if p_off is not null and p_off is distinct from s.off then
    if p_off and n > 0 and p_expect is distinct from n then return jsonb_build_object('ok',false,'error','changed','active',n); end if;
    select coalesce(jsonb_agg(e.id order by e.id), '[]'::jsonb) into ids from public.duty_signups e
      where e.slot_id = p_slot and e.status = 'active' and e.user_id is not null
        and not exists (select 1 from public.duty_days d where d.board_id = s.board_id and d.on_date = s.on_date and d.off);
  end if;
  update public.duty_slots set capacity = coalesce(p_capacity, capacity), off = coalesce(p_off, off) where id = p_slot returning * into s;
  return jsonb_build_object('ok',true,'capacity',s.capacity,'off',s.off,'active',n,'ids',ids);
end $$;

-- 자리 지우기 — 잘못 더한 날짜의 자리. 지원 줄이 하나도 없어야 하고(has-signups), 그 틀의 요일과 맞는 앞날 자리는 지우지 않는다(use-off —
--   지워도 duty_ensure_slots 가 다시 만든다 · 쉼을 쓴다).
create or replace function public.duty_slot_delete(p_slot bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.duty_slots; l public.duty_lines; b public.duty_boards;
begin
  select * into s from public.duty_slots where id = p_slot;
  if not found then return jsonb_build_object('ok',false,'error','not-found'); end if;
  select * into b from public.duty_boards where id = s.board_id;
  if b.status = 'archived' then return jsonb_build_object('ok',false,'error','archived'); end if;
  perform 1 from public.duty_days where board_id = s.board_id and on_date = s.on_date for update;
  select * into s from public.duty_slots where id = p_slot for update;
  if not found then return jsonb_build_object('ok',false,'error','not-found'); end if;
  if exists (select 1 from public.duty_signups e where e.slot_id = p_slot) then return jsonb_build_object('ok',false,'error','has-signups'); end if;
  select * into l from public.duty_lines where id = s.line_id;
  if l.active and l.weekday is not null and l.weekday = extract(dow from s.on_date)::int and s.on_date >= duty_today()
     and (b.until_date is null or s.on_date <= b.until_date) then
    return jsonb_build_object('ok',false,'error','use-off');
  end if;
  delete from public.duty_slots where id = p_slot;
  return jsonb_build_object('ok',true);
end $$;

-- ---------- 지원 · 취소 · 옮기기 ----------
-- 지원 — 성도님(p_staff = false)과 담당자의 넣기(p_staff = true)가 같은 함수를 쓴다.
--   p_ident = {name, who_type, group_name, sub_name, ident_key} — 성도님 길은 api 가 users 줄에서 만든다(화면 값을 쓰지 않는다).
--   p_force      — 담당자만: 정원·겹침을 알려 준 뒤 확인 한 번으로 넘긴다.
--   p_ack_locked — 성도님만: 잠긴 날에는 「취소할 수 없어요」를 알고 누른 것일 때만 넣는다(아니면 아무것도 안 쓰고 locked-day —
--                  화면을 열어 둔 사이 잠긴 경우도 서버가 잡는다).
--   검사 차례(모두 끝난 뒤에만 쓴다): 신원 → 당번 상태 → 쉼 → (본인) 지난 날·이미 시작·보이는 기간 밖 → 이미 내 줄(already) ·
--     (본인) 담당자가 뺀 줄 → (본인) 잠긴 날 확인 → 정원 → 겹침 → (본인) 미리 잡아 둔 수.
--   성공 {ok, id, locked}(locked = 이 줄이 이미 잠긴 날에 들어갔다 — 본인은 못 지운다) · 이미 있으면 {ok, id, already:true, locked}.
--   거절: bad-ident · not-found · archived · closed · off · past · started · not-yet · removed-by-staff · locked-day ·
--         full{active, capacity} · overlap{with:{board, service, task, start, same_board, draft}} · too-many{max}
--   ⚠️ overlap 의 with 는 그대로 화면에 싣지 말 것 — 담당자 길은 same_board 일 때만(맡지 않은 당번의 자리 이름을 싣지 않는다),
--      본인 길은 draft(준비 중 당번)가 아닐 때만 이름을 싣는다. 가르는 것은 부르는 쪽(교회 어드민 duty-db.ts · 성경암송 api).
create or replace function public.duty_apply(p_slot bigint, p_user uuid, p_ident jsonb,
  p_staff boolean default false, p_force boolean default false, p_ack_locked boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s public.duty_slots; l public.duty_lines; b public.duty_boards; d public.duty_days; e public.duty_signups;
  v_name text := btrim(coalesce(p_ident->>'name', ''));
  v_key  text := coalesce(p_ident->>'ident_key', '');
  v_today date := duty_today();
  v_locked boolean; n int; v_other jsonb;
begin
  p_staff := coalesce(p_staff, false);          -- null 이 담당자 길로 새지 않게
  p_force := coalesce(p_force, false) and p_staff;
  p_ack_locked := coalesce(p_ack_locked, false);
  if v_name = '' or char_length(v_name) > 40 then return jsonb_build_object('ok',false,'error','bad-ident'); end if;
  -- 계정 없는 줄은 담당자 길만 · 신원 키 필수
  if p_user is null and (v_key = '' or not p_staff) then return jsonb_build_object('ok',false,'error','bad-ident'); end if;
  select * into s from public.duty_slots where id = p_slot;           -- 잠그지 않고 읽어 날짜를 안다
  if not found then return jsonb_build_object('ok',false,'error','not-found'); end if;
  perform pg_advisory_xact_lock(7240911, hashtext(coalesce(p_user::text, 'k:' || v_key)));                              -- ① 사람
  select * into d from public.duty_days where board_id = s.board_id and on_date = s.on_date for update;               -- ② 날짜 줄
  select * into s from public.duty_slots where id = p_slot for update;                                                -- ③ 자리 줄(다시 읽는다)
  if not found then return jsonb_build_object('ok',false,'error','not-found'); end if;
  select * into l from public.duty_lines where id = s.line_id;
  select * into b from public.duty_boards where id = s.board_id;
  if b.status = 'archived' then return jsonb_build_object('ok',false,'error','archived'); end if;
  if not p_staff then
    if b.status = 'draft' then return jsonb_build_object('ok',false,'error','not-found'); end if;      -- 준비 중인 당번은 없는 것과 같다
    if b.status <> 'open' then return jsonb_build_object('ok',false,'error','closed'); end if;
  end if;
  if d.off or s.off then return jsonb_build_object('ok',false,'error','off'); end if;
  if not p_staff then
    if s.on_date < v_today then return jsonb_build_object('ok',false,'error','past'); end if;
    if s.on_date = v_today and (now() at time zone 'Asia/Seoul')::time >= l.start_time then return jsonb_build_object('ok',false,'error','started'); end if;
    if s.on_date > v_today + b.open_days then return jsonb_build_object('ok',false,'error','not-yet'); end if;
  end if;
  v_locked := duty_locked(d.confirmed_at, s.on_date);
  -- 이미 이 자리에 같은 분의 줄 — 앱 계정이면 계정으로, 계정 없는 줄이면 신원 키로                                     ④ 지원 줄
  if p_user is not null then
    select * into e from public.duty_signups where slot_id = p_slot and user_id = p_user for update;
  else
    select * into e from public.duty_signups where slot_id = p_slot and user_id is null and ident_key = v_key for update;
  end if;
  if e.id is not null and e.status = 'active' then
    return jsonb_build_object('ok',true,'id',e.id,'already',true,'locked',v_locked);
  end if;
  -- 담당자가 뺀 줄은 본인이 스스로 되살리지 못한다(확정 뒤 빈 자리는 지원 즉시 잠기므로 — 안 그러면 빼도 한 번 눌러 되돌아온다)
  if e.id is not null and not p_staff and e.end_reason = 'staff' then return jsonb_build_object('ok',false,'error','removed-by-staff'); end if;
  if v_locked and not p_staff and not p_ack_locked then return jsonb_build_object('ok',false,'error','locked-day'); end if;
  select count(*)::int into n from public.duty_signups x where x.slot_id = p_slot and x.status = 'active';
  if n >= s.capacity and not p_force then return jsonb_build_object('ok',false,'error','full','active',n,'capacity',s.capacity); end if;
  -- 겹침 — 같은 분이 같은 날 시각이 겹치는(시작 포함·끝 제외 — 맞닿은 자리는 안 겹친다) 다른 자리에 살아 있다. 쉬는 자리·쉬는 날·보관 당번은 뺀다.
  select jsonb_build_object('board', b2.title, 'service', l2.service, 'task', l2.task, 'start', to_char(l2.start_time, 'HH24:MI'),
                            'same_board', s2.board_id = s.board_id, 'draft', b2.status = 'draft')
    into v_other
    from public.duty_signups x
    join public.duty_slots s2 on s2.id = x.slot_id
    join public.duty_lines l2 on l2.id = s2.line_id
    join public.duty_days  d2 on d2.board_id = s2.board_id and d2.on_date = s2.on_date
    join public.duty_boards b2 on b2.id = s2.board_id
    where x.status = 'active' and x.slot_id <> p_slot and s2.on_date = s.on_date
      and duty_same_person(x, p_user, v_key)
      and not s2.off and not d2.off and b2.status <> 'archived'
      and l2.start_time < l.end_time and l.start_time < l2.end_time
    order by l2.start_time, s2.id limit 1;
  if v_other is not null and not p_force then return jsonb_build_object('ok',false,'error','overlap','with',v_other); end if;
  if not p_staff and b.max_ahead is not null then
    select count(*)::int into n from public.duty_signups x join public.duty_slots s2 on s2.id = x.slot_id
      where x.status = 'active' and x.user_id = p_user and s2.board_id = s.board_id and s2.on_date >= v_today;
    if n >= b.max_ahead then return jsonb_build_object('ok',false,'error','too-many','max',b.max_ahead); end if;
  end if;
  if e.id is not null then        -- 끝났던 줄을 되살린다(자리·사람에 한 줄) — 예전 알림 기록은 지운다(다시 확정되면 다시 알린다)
    delete from public.duty_notify_log where signup_id = e.id;
    update public.duty_signups set
      status = 'active', end_reason = null, ended_at = null, ask_at = null, ask_why = null, moved_at = null, moved_from = null,
      source = case when p_staff then 'staff' else 'app' end,
      ident_key = v_key, who_type = coalesce(p_ident->>'who_type', ''), group_name = coalesce(p_ident->>'group_name', ''),
      sub_name = coalesce(p_ident->>'sub_name', ''), name = v_name, applied_at = now(), updated_at = now()
    where id = e.id;
    return jsonb_build_object('ok',true,'id',e.id,'locked',v_locked,'revived',true);
  end if;
  insert into public.duty_signups(slot_id, user_id, ident_key, who_type, group_name, sub_name, name, status, source)
  values (p_slot, p_user, v_key, coalesce(p_ident->>'who_type', ''), coalesce(p_ident->>'group_name', ''),
          coalesce(p_ident->>'sub_name', ''), v_name, 'active', case when p_staff then 'staff' else 'app' end)
  returning * into e;
  return jsonb_build_object('ok',true,'id',e.id,'locked',v_locked);
end $$;

-- 취소(본인) · 빼기(담당자).
--   본인(p_staff = false): **내 줄인지 함수 안에서 본다**(p_user 와 줄의 user_id — 아니면 없는 줄과 같다) · 지난 날 past · 잠긴 날 locked ·
--     담당자가 넣은 줄 staff-row(담당자가 넣는 당번에서 짜 둔 표가 조용히 비지 않게 — 「못 가게 됐어요」로 알린다).
--   담당자: 언제든(지난 날짜도 — 당일 안 온 분을 다음 날 바로잡는다) → removed(end_reason staff).
--   성공 {ok, date, locked, hadUser}(교회 어드민이 알림을 부탁할지 정하는 재료). 거절: not-found · not-active · changed · past · locked · staff-row · archived
create or replace function public.duty_cancel(p_signup bigint, p_user uuid default null, p_staff boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e public.duty_signups; s public.duty_slots; d public.duty_days; b public.duty_boards; v_locked boolean;
begin
  p_staff := coalesce(p_staff, false);
  select * into e from public.duty_signups where id = p_signup;         -- 잠그지 않고 읽어 자리·날짜를 안다
  if not found then return jsonb_build_object('ok',false,'error','not-found'); end if;
  if not p_staff and (p_user is null or e.user_id is distinct from p_user) then return jsonb_build_object('ok',false,'error','not-found'); end if;
  select * into s from public.duty_slots where id = e.slot_id;
  select * into d from public.duty_days where board_id = s.board_id and on_date = s.on_date for update;    -- ② 날짜 줄
  select * into e from public.duty_signups where id = p_signup for update;                                   -- ④ 지원 줄
  if not found then return jsonb_build_object('ok',false,'error','not-found'); end if;
  if e.slot_id <> s.id then return jsonb_build_object('ok',false,'error','changed'); end if;                -- 그 사이 담당자가 옮겼다
  if e.status <> 'active' then return jsonb_build_object('ok',false,'error','not-active'); end if;
  v_locked := duty_locked(d.confirmed_at, s.on_date);
  if not p_staff then
    if s.on_date < duty_today() then return jsonb_build_object('ok',false,'error','past'); end if;
    if v_locked then return jsonb_build_object('ok',false,'error','locked'); end if;
    if e.source = 'staff' then return jsonb_build_object('ok',false,'error','staff-row'); end if;   -- 담당자가 넣은 줄 — 「못 가게 됐어요」로 알린다
  else
    select * into b from public.duty_boards where id = s.board_id;
    if b.status = 'archived' then return jsonb_build_object('ok',false,'error','archived'); end if;
  end if;
  update public.duty_signups set
    status = case when p_staff then 'removed' else 'cancelled' end,
    end_reason = case when p_staff then 'staff' else 'self' end,
    ended_at = now(), ask_at = null, ask_why = null, updated_at = now()
  where id = e.id;
  return jsonb_build_object('ok',true,'date',s.on_date,'locked',v_locked,'hadUser',e.user_id is not null);
end $$;

-- 옮기기(담당자) — **같은 줄의 자리만 바꾼다**(빼고 넣기가 아니다 — 줄 번호·넣은 곳·알림 기록이 이어진다). 같은 당번 안에서만(wrong-board).
--   차례: 사람 잠금 → 두 날짜 줄(날짜 차례) → 두 자리 줄(id 차례) → 지원 줄. 검사를 모두 끝낸 뒤에만 쓴다.
--   옮길 자리에 그분의 끝난 줄이 있으면 그 줄을 지우고 옮긴다(자리·사람에 한 줄). 살아 있는 줄이 있으면 already-there.
--   정원·겹침은 p_force 로 넘긴다. 옮기면 「못 가게 됐어요」 표시와 전날 알림 기록을 지운다(새 자리로 다시 알린다).
--   성공 {ok, from:{date, service, task, start}, to:{…}, hadUser, locked: 옮겨 간 날이 잠겼나}.
--   거절: not-found · wrong-board · changed · archived · off · already-there · full{active, capacity} · overlap{with}
create or replace function public.duty_move(p_signup bigint, p_to_slot bigint, p_force boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  e public.duty_signups; x public.duty_signups; s1 public.duty_slots; s2 public.duty_slots;
  l1 public.duty_lines; l2 public.duty_lines; d2 public.duty_days; b public.duty_boards;
  n int; v_other jsonb;
begin
  p_force := coalesce(p_force, false);
  select * into e from public.duty_signups where id = p_signup;
  if not found then return jsonb_build_object('ok',false,'error','not-found'); end if;
  select * into s1 from public.duty_slots where id = e.slot_id;
  select * into s2 from public.duty_slots where id = p_to_slot;
  if not found then return jsonb_build_object('ok',false,'error','not-found'); end if;
  if s2.board_id <> s1.board_id then return jsonb_build_object('ok',false,'error','wrong-board'); end if;
  if s2.id = s1.id then return jsonb_build_object('ok',true,'already',true); end if;
  perform pg_advisory_xact_lock(7240911, hashtext(coalesce(e.user_id::text, 'k:' || e.ident_key)));              -- ① 사람
  perform 1 from public.duty_days where board_id = s1.board_id and on_date in (s1.on_date, s2.on_date) order by on_date for update;   -- ②
  perform 1 from public.duty_slots where id in (s1.id, s2.id) order by id for update;                                -- ③
  select * into e from public.duty_signups where id = p_signup for update;                                           -- ④
  if not found or e.status <> 'active' or e.slot_id <> s1.id then return jsonb_build_object('ok',false,'error','changed'); end if;
  select * into b from public.duty_boards where id = s1.board_id;
  if b.status = 'archived' then return jsonb_build_object('ok',false,'error','archived'); end if;
  select * into s2 from public.duty_slots where id = p_to_slot;
  select * into d2 from public.duty_days where board_id = s2.board_id and on_date = s2.on_date;
  if s2.off or d2.off then return jsonb_build_object('ok',false,'error','off'); end if;
  select * into l1 from public.duty_lines where id = s1.line_id;
  select * into l2 from public.duty_lines where id = s2.line_id;
  if e.user_id is not null then
    select * into x from public.duty_signups where slot_id = p_to_slot and user_id = e.user_id for update;
  else
    select * into x from public.duty_signups where slot_id = p_to_slot and user_id is null and ident_key = e.ident_key for update;
  end if;
  if x.id is not null and x.status = 'active' then return jsonb_build_object('ok',false,'error','already-there'); end if;
  select count(*)::int into n from public.duty_signups y where y.slot_id = p_to_slot and y.status = 'active';
  if n >= s2.capacity and not p_force then return jsonb_build_object('ok',false,'error','full','active',n,'capacity',s2.capacity); end if;
  select jsonb_build_object('board', b3.title, 'service', l3.service, 'task', l3.task, 'start', to_char(l3.start_time, 'HH24:MI'),
                            'same_board', s3.board_id = s2.board_id, 'draft', b3.status = 'draft')
    into v_other
    from public.duty_signups y
    join public.duty_slots s3 on s3.id = y.slot_id
    join public.duty_lines l3 on l3.id = s3.line_id
    join public.duty_days  d3 on d3.board_id = s3.board_id and d3.on_date = s3.on_date
    join public.duty_boards b3 on b3.id = s3.board_id
    where y.status = 'active' and y.id <> e.id and y.slot_id <> p_to_slot and s3.on_date = s2.on_date
      and duty_same_person(y, e.user_id, e.ident_key)
      and not s3.off and not d3.off and b3.status <> 'archived'
      and l3.start_time < l2.end_time and l2.start_time < l3.end_time
    order by l3.start_time, s3.id limit 1;
  if v_other is not null and not p_force then return jsonb_build_object('ok',false,'error','overlap','with',v_other); end if;
  if x.id is not null then delete from public.duty_signups where id = x.id; end if;      -- 옮길 자리에 있던 그분의 끝난 줄
  delete from public.duty_notify_log where signup_id = e.id and kind = 'remind';
  update public.duty_signups set slot_id = p_to_slot, ask_at = null, ask_why = null, moved_at = now(),
      moved_from = jsonb_build_object('date', s1.on_date, 'service', l1.service, 'task', l1.task, 'start', to_char(l1.start_time, 'HH24:MI')),
      updated_at = now() where id = e.id;
  return jsonb_build_object('ok',true,
    'from', jsonb_build_object('date', s1.on_date, 'service', l1.service, 'task', l1.task, 'start', to_char(l1.start_time, 'HH24:MI')),
    'to',   jsonb_build_object('date', s2.on_date, 'service', l2.service, 'task', l2.task, 'start', to_char(l2.start_time, 'HH24:MI')),
    'hadUser', e.user_id is not null, 'locked', duty_locked(d2.confirmed_at, s2.on_date));
end $$;

-- 「못 가게 됐어요」 — 잠긴 내 줄에 표시하거나(p_why: cant·mistake·notme) 거둔다(p_why null). 줄은 그대로다(빼는 것은 담당자).
--   잠기지 않은 날의 내가 지원한 줄이면 not-locked(그냥 취소하면 된다) — 담당자가 넣은 줄은 잠기기 전에도 받는다(본인이 못 빼므로).
--   거절: not-found(남의 줄 포함) · not-active · bad-why · past · not-locked
create or replace function public.duty_ask(p_signup bigint, p_user uuid, p_why text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e public.duty_signups; s public.duty_slots; d public.duty_days;
begin
  if p_why is not null and p_why not in ('cant','mistake','notme') then return jsonb_build_object('ok',false,'error','bad-why'); end if;
  select * into e from public.duty_signups where id = p_signup;
  if not found or p_user is null or e.user_id is distinct from p_user then return jsonb_build_object('ok',false,'error','not-found'); end if;
  select * into s from public.duty_slots where id = e.slot_id;
  select * into d from public.duty_days where board_id = s.board_id and on_date = s.on_date for update;
  select * into e from public.duty_signups where id = p_signup for update;
  if not found or e.status <> 'active' then return jsonb_build_object('ok',false,'error','not-active'); end if;
  if e.slot_id <> s.id then return jsonb_build_object('ok',false,'error','changed'); end if;
  if p_why is null then
    update public.duty_signups set ask_at = null, ask_why = null, updated_at = now() where id = e.id;
    return jsonb_build_object('ok',true,'asked',false);
  end if;
  if s.on_date < duty_today() then return jsonb_build_object('ok',false,'error','past'); end if;
  if not duty_locked(d.confirmed_at, s.on_date) and e.source <> 'staff' then return jsonb_build_object('ok',false,'error','not-locked'); end if;
  update public.duty_signups set ask_at = now(), ask_why = p_why, updated_at = now() where id = e.id;
  return jsonb_build_object('ok',true,'asked',true);
end $$;

-- ---------- 읽기(jsonb 하나 · user_id·ident_key 를 싣지 않는다) ----------
-- 성도님: 당번 하나의 날짜별 자리 — 오늘 ~ 오늘 + 보이는 기간, 자리가 있는 날만. 받는 중·지원 멈춤 당번만(그 밖은 not-found).
--   날짜마다 {date, off, note, locked, lockAt(아직 안 잠긴 날의 잠기는 때)} · 자리마다 {id, service, task, start, end, capacity, off, n,
--   names: [이름 글자(가나다) — duty_name_out], mine: {id, status, byStaff, asked, why} | null, why: 지원 못 하는 까닭 | ''}.
--   why: mine(내가 서 있음) · removed(담당자가 뺌) · closed(지원 멈춤) · off · started(오늘인데 시작 시각이 지남) · full · ''(지원할 수 있다)
--   ⚠️ 문(dutyOpen·시험 참여자)과 「users 에 있는 계정인가」는 api 가 먼저 본다 — 이 함수는 p_user 를 내 줄 찾기에만 쓴다.
create or replace function public.duty_board_view(p_board uuid, p_user uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b public.duty_boards; d0 date := duty_today(); v_now time := (now() at time zone 'Asia/Seoul')::time; v_days jsonb;
begin
  select * into b from public.duty_boards where id = p_board;
  if not found or b.status not in ('open','closed') then return jsonb_build_object('ok',false,'error','not-found'); end if;
  perform duty_ensure_slots(p_board);
  select coalesce(jsonb_agg(q.day order by q.on_date), '[]'::jsonb) into v_days from (
    select d.on_date, jsonb_build_object(
      'date', d.on_date, 'off', d.off, 'note', d.note,
      'locked', duty_locked(d.confirmed_at, d.on_date),
      'lockAt', case when not duty_locked(d.confirmed_at, d.on_date) then duty_cutoff(d.on_date) end,
      'slots', (
        select coalesce(jsonb_agg(jsonb_build_object(
            'id', s.id, 'service', l.service, 'task', l.task,
            'start', to_char(l.start_time, 'HH24:MI'), 'end', to_char(l.end_time, 'HH24:MI'),
            'capacity', s.capacity, 'off', s.off, 'n', c.n, 'names', c.names, 'mine', m.mine,
            'why', case when m.mine is not null and m.mine->>'status' = 'active' then 'mine'
                        when m.mine is not null then 'removed'
                        when b.status <> 'open' then 'closed'
                        when d.off or s.off then 'off'
                        when d.on_date = d0 and v_now >= l.start_time then 'started'
                        when c.n >= s.capacity then 'full'
                        else '' end
          ) order by l.start_time, l.sort, l.id), '[]'::jsonb)
        from public.duty_slots s
        join public.duty_lines l on l.id = s.line_id
        cross join lateral (
          select count(*)::int as n,
                 coalesce(jsonb_agg(duty_name_out(e.name) order by duty_name_out(e.name), e.id), '[]'::jsonb) as names
          from public.duty_signups e where e.slot_id = s.id and e.status = 'active') c
        left join lateral (
          select jsonb_build_object('id', e.id, 'status', e.status, 'byStaff', coalesce(e.end_reason = 'staff', false),
                                    'staffAdded', e.source = 'staff', 'asked', e.ask_at is not null, 'why', e.ask_why) as mine
          from public.duty_signups e
          where p_user is not null and e.slot_id = s.id and e.user_id = p_user
            and (e.status = 'active' or e.end_reason = 'staff')) m on true
        where s.board_id = d.board_id and s.on_date = d.on_date)
    ) as day
    from public.duty_days d
    where d.board_id = p_board and d.on_date between d0 and d0 + b.open_days
      and exists (select 1 from public.duty_slots s where s.board_id = d.board_id and s.on_date = d.on_date)
  ) q;
  return jsonb_build_object('ok', true, 'today', d0,
    'board', jsonb_build_object('id', b.id, 'title', b.title, 'description', b.description, 'place', b.place,
                                'contact', b.contact_note, 'status', b.status, 'maxAhead', b.max_ahead),
    'days', v_days);
end $$;

-- 성도님: 내 당번 — 오늘 이후(오늘 것은 그날 끝까지) · 받는 중·지원 멈춤 당번 · 살아 있는 줄 + 담당자가 뺀 줄(그날이 지날 때까지 「담당자가 빼 드렸어요」).
--   줄마다 {id, boardId, board, place, contact, date, service, task, start, end, status, byStaff(담당자가 뺌), staffAdded(담당자가 넣음), off, note,
--          locked, lockAt, asked, why, movedFrom(담당자가 옮기기 전 자리), canCancel, canAsk}
--   보이는 기간(open_days)과 무관하게 오늘 이후 내 줄을 모두 준다.
create or replace function public.duty_mine(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', e.id, 'boardId', b.id, 'board', b.title, 'place', b.place, 'contact', b.contact_note,
      'date', s.on_date, 'service', l.service, 'task', l.task,
      'start', to_char(l.start_time, 'HH24:MI'), 'end', to_char(l.end_time, 'HH24:MI'),
      'status', e.status, 'byStaff', coalesce(e.end_reason = 'staff', false), 'staffAdded', e.source = 'staff',
      'off', (d.off or s.off), 'note', d.note,
      'locked', duty_locked(d.confirmed_at, s.on_date),
      'lockAt', case when not duty_locked(d.confirmed_at, s.on_date) then duty_cutoff(s.on_date) end,
      'asked', e.ask_at is not null, 'why', e.ask_why, 'movedFrom', e.moved_from,
      'canCancel', e.status = 'active' and e.source <> 'staff' and not duty_locked(d.confirmed_at, s.on_date),
      'canAsk', e.status = 'active' and (e.source = 'staff' or duty_locked(d.confirmed_at, s.on_date))
    ) order by s.on_date, l.start_time, e.id), '[]'::jsonb)
  from public.duty_signups e
  join public.duty_slots s on s.id = e.slot_id
  join public.duty_lines l on l.id = s.line_id
  join public.duty_days  d on d.board_id = s.board_id and d.on_date = s.on_date
  join public.duty_boards b on b.id = s.board_id
  where p_user is not null and e.user_id = p_user and s.on_date >= duty_today()
    and b.status in ('open','closed')
    and (e.status = 'active' or (e.status = 'removed' and e.end_reason = 'staff'))
$$;

-- 성도님: 당번 목록 + 내 당번. 당번마다 {id, title, place, status, need: [{date, need}] — 사람이 더 필요한 가까운 날 셋(받는 중 당번만)}.
create or replace function public.duty_list_view(p_user uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; d0 date := duty_today(); v_now time := (now() at time zone 'Asia/Seoul')::time; v jsonb;
begin
  for r in select id from public.duty_boards where status in ('open','closed') loop
    perform duty_ensure_slots(r.id);
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'title', b.title, 'place', b.place, 'status', b.status,
           'need', coalesce(q.need, '[]'::jsonb)) order by b.created_at, b.id), '[]'::jsonb)
    into v
    from public.duty_boards b
    left join lateral (
      select jsonb_agg(jsonb_build_object('date', t.on_date, 'need', t.need) order by t.on_date) as need from (
        select s.on_date,
               sum(greatest(s.capacity - (select count(*) from public.duty_signups e where e.slot_id = s.id and e.status = 'active'), 0))::int as need
        from public.duty_slots s
        join public.duty_days  d on d.board_id = s.board_id and d.on_date = s.on_date
        join public.duty_lines l on l.id = s.line_id
        where b.status = 'open' and s.board_id = b.id and s.on_date between d0 and d0 + b.open_days
          and not s.off and not d.off and not (s.on_date = d0 and v_now >= l.start_time)
        group by s.on_date
        having sum(greatest(s.capacity - (select count(*) from public.duty_signups e where e.slot_id = s.id and e.status = 'active'), 0)) > 0
        order by s.on_date limit 3) t
    ) q on true
    where b.status in ('open','closed');
  return jsonb_build_object('ok', true, 'today', d0, 'boards', v, 'mine', duty_mine(p_user));
end $$;

-- 담당자: 주별 명단 — 당번 설정 · 자리 틀 · 날짜마다 자리와 선 분(이름·소속·넣은 곳·앱 계정 유무·메모·「못 가게 됐어요」)·빠진 분.
--   p_from·p_to 기본 = 오늘 ~ 오늘 + 보이는 기간(400일까지). 날짜는 자리가 있거나 쉼·메모·확정이 적힌 날만.
--   날짜마다 {date, off, note, confirmed(담당자 확정), locked, cutoff, past, need(빈 자리 수 — 쉬는 자리 빼고), asks(「못 가게 됐어요」 수)}.
--   ⚠️ 응답에 user_id·ident_key·confirmed_by 를 싣지 않는다 — 앱 계정은 hasApp, 알림 받을 기기는 hasPush(웹 푸시·아이폰 줄이 있나 — 불리언)로만.
--      아이폰은 「기기는 있으나 폰 설정에서 꺼 둔 것」을 가릴 수 없다.
--      pk = 같은 분의 줄을 묶는 표식(부를 때마다 바뀌는 소금을 섞은 해시 — 계정·교인ID 를 되짚을 수 없다 · 이 응답 안에서만 뜻이 있다).
--        화면이 「이름은 같은데 pk 가 다른 줄」에 「같은 분일 수 있어요」를 단다(앱 줄과 담당자 줄 · 옛 계정과 새 계정).
create or replace function public.duty_roster(p_board uuid, p_from date default null, p_to date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b public.duty_boards; d0 date := duty_today(); f date; t date; v_lines jsonb; v_days jsonb; v_salt text := gen_random_uuid()::text;
begin
  select * into b from public.duty_boards where id = p_board;
  if not found then return jsonb_build_object('ok',false,'error','not-found'); end if;
  perform duty_ensure_slots(p_board);
  f := coalesce(p_from, d0);
  t := coalesce(p_to, d0 + b.open_days);
  if t < f or t - f > 400 then return jsonb_build_object('ok',false,'error','bad-range'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'sort', l.sort, 'service', l.service, 'task', l.task,
           'start', to_char(l.start_time, 'HH24:MI'), 'end', to_char(l.end_time, 'HH24:MI'),
           'capacity', l.capacity, 'weekday', l.weekday, 'active', l.active)
           order by l.active desc, l.start_time, l.sort, l.id), '[]'::jsonb)
    into v_lines
    from public.duty_lines l
    where l.board_id = p_board
      and (l.active or exists (select 1 from public.duty_slots s where s.line_id = l.id and s.on_date between f and t));
  select coalesce(jsonb_agg(q.day order by q.on_date), '[]'::jsonb) into v_days from (
    select d.on_date, jsonb_build_object(
      'date', d.on_date, 'off', d.off, 'note', d.note,
      'confirmed', d.confirmed_at is not null,
      'locked', duty_locked(d.confirmed_at, d.on_date),
      'cutoff', duty_cutoff(d.on_date),
      'past', d.on_date < d0,
      'need', (select coalesce(sum(greatest(s.capacity - (select count(*) from public.duty_signups e where e.slot_id = s.id and e.status = 'active'), 0)), 0)::int
                 from public.duty_slots s where s.board_id = d.board_id and s.on_date = d.on_date and not s.off),
      'asks', (select count(*)::int from public.duty_signups e join public.duty_slots s on s.id = e.slot_id
                 where s.board_id = d.board_id and s.on_date = d.on_date and e.status = 'active' and e.ask_at is not null),
      'slots', (
        select coalesce(jsonb_agg(jsonb_build_object(
            'id', s.id, 'lineId', l.id, 'service', l.service, 'task', l.task,
            'start', to_char(l.start_time, 'HH24:MI'), 'end', to_char(l.end_time, 'HH24:MI'),
            'capacity', s.capacity, 'off', s.off,
            'signups', (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', e.id, 'name', e.name, 'whoType', e.who_type, 'group', e.group_name, 'sub', e.sub_name,
                  'pk', left(md5(coalesce(e.user_id::text, 'k:' || e.ident_key) || v_salt), 10),
                  'source', e.source, 'hasApp', e.user_id is not null,
                  'hasPush', e.user_id is not null and (exists (select 1 from public.push_subscriptions p where p.user_id = e.user_id)
                                                        or exists (select 1 from public.ios_push_tokens t2 where t2.user_id = e.user_id)),
                  'note', e.staff_note, 'moved', e.moved_at is not null,
                  'asked', e.ask_at is not null, 'why', e.ask_why, 'appliedAt', e.applied_at,
                  'afterLock', e.applied_at >= least(coalesce(d.confirmed_at, 'infinity'::timestamptz), duty_cutoff(d.on_date))
                ) order by e.name, e.id), '[]'::jsonb)
              from public.duty_signups e where e.slot_id = s.id and e.status = 'active'),
            'ended', (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', e.id, 'name', e.name, 'whoType', e.who_type, 'group', e.group_name, 'sub', e.sub_name,
                  'source', e.source, 'hasApp', e.user_id is not null, 'status', e.status, 'reason', e.end_reason, 'endedAt', e.ended_at
                ) order by e.ended_at desc nulls last, e.id), '[]'::jsonb)
              from public.duty_signups e where e.slot_id = s.id and e.status <> 'active')
          ) order by l.start_time, l.sort, l.id), '[]'::jsonb)
        from public.duty_slots s join public.duty_lines l on l.id = s.line_id
        where s.board_id = d.board_id and s.on_date = d.on_date)
    ) as day
    from public.duty_days d
    where d.board_id = p_board and d.on_date between f and t
      and (d.off or d.note <> '' or d.confirmed_at is not null
           or exists (select 1 from public.duty_slots s where s.board_id = d.board_id and s.on_date = d.on_date))
  ) q;
  return jsonb_build_object('ok', true, 'today', d0, 'from', f, 'to', t,
    'board', jsonb_build_object('id', b.id, 'title', b.title, 'description', b.description, 'place', b.place, 'contact', b.contact_note,
                                'openDays', b.open_days, 'untilDate', b.until_date, 'maxAhead', b.max_ahead, 'status', b.status),
    'lines', v_lines, 'days', v_days);
end $$;

-- 담당자: 당번마다 요약 수 — 살아 있는 틀 수 · 앞날 자리 수 · 앞날 빈 자리 수 · 「못 가게 됐어요」 수 · 앞날 살아 있는 지원 수(당번 관리·명단의 당번 고르기 ·
--   준비·보관으로 돌릴 때 「앞날에 N분이 서 있어요」 확인).
--   p_ids 에 든 당번은 자리가 없어도 0 줄로 돌려준다(jsonb 하나 — 줄 한도에 안 걸린다).
create or replace function public.duty_board_counts(p_ids uuid[])
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(i.id::text, jsonb_build_object(
      'lines', (select count(*)::int from public.duty_lines l where l.board_id = i.id and l.active),
      'slots', (select count(*)::int from public.duty_slots s where s.board_id = i.id and s.on_date >= duty_today()),
      'need',  (select coalesce(sum(greatest(s.capacity - (select count(*) from public.duty_signups e where e.slot_id = s.id and e.status = 'active'), 0)), 0)::int
                  from public.duty_slots s join public.duty_days d on d.board_id = s.board_id and d.on_date = s.on_date
                  where s.board_id = i.id and s.on_date >= duty_today() and not s.off and not d.off),
      'asks',  (select count(*)::int from public.duty_signups e join public.duty_slots s on s.id = e.slot_id
                  where s.board_id = i.id and s.on_date >= duty_today() and e.status = 'active' and e.ask_at is not null),
      'active', (select count(*)::int from public.duty_signups e join public.duty_slots s on s.id = e.slot_id
                  where s.board_id = i.id and s.on_date >= duty_today() and e.status = 'active')
    )), '{}'::jsonb)
  from unnest(coalesce(p_ids, array[]::uuid[])) as i(id)
$$;

-- ---------- 앱 알림(성경암송 api 만 부른다) ----------
-- 알림 줄 잡기 — p_ids 가운데 **지금 살아 있고 앱 계정이 있고 쉬는 날·쉬는 자리가 아닌** 지원만, 그 kind 의 줄이 아직 없으면 넣고 넣은 번호를 돌려준다.
--   한 문장이라 동시에 두 번 불러도 한 번만 잡힌다 — api 는 **잡힌 번호에만** 보낸다(보내기 전에 잡는다).
--   ⚠️ 돌려주는 것은 bigint[] 하나다(표로 돌려주면 PostgREST 가 1,000줄에서 자른다 — 교육 edu_notify_claim 과 같다).
create or replace function public.duty_notify_claim(p_kind text, p_ids bigint[])
returns bigint[] language sql security definer set search_path = public as $$
  with ins as (
    insert into public.duty_notify_log as g (signup_id, kind)
    select e.id, p_kind
      from public.duty_signups e
      join public.duty_slots s on s.id = e.slot_id
      join public.duty_days  d on d.board_id = s.board_id and d.on_date = s.on_date
     where e.id = any(coalesce(p_ids, array[]::bigint[])) and e.status = 'active' and e.user_id is not null
       and not s.off and not d.off
    on conflict (signup_id, kind) do nothing
    returning g.signup_id
  )
  select coalesce(array_agg(ins.signup_id order by ins.signup_id), '{}'::bigint[]) from ins
$$;

-- 알림 글의 재료 — 지원 번호들의 {id, uid(받는 분 · api 안에서만 쓴다), status, reason, boardId, board, place, date, service, task, start, end,
--   off, locked}. 앱 계정이 있는 줄만(끝난 줄도 준다 — 「빼 드렸어요」 알림). 준비·보관 당번의 줄은 주지 않는다(알림 없음).
create or replace function public.duty_notify_rows(p_ids bigint[])
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', e.id, 'uid', e.user_id, 'status', e.status, 'reason', e.end_reason,
      'boardId', b.id, 'board', b.title, 'place', b.place, 'date', s.on_date,
      'service', l.service, 'task', l.task, 'start', to_char(l.start_time, 'HH24:MI'), 'end', to_char(l.end_time, 'HH24:MI'),
      'off', (d.off or s.off), 'locked', duty_locked(d.confirmed_at, s.on_date)
    ) order by e.user_id, s.on_date, l.start_time, e.id), '[]'::jsonb)
  from public.duty_signups e
  join public.duty_slots s on s.id = e.slot_id
  join public.duty_lines l on l.id = s.line_id
  join public.duty_days  d on d.board_id = s.board_id and d.on_date = s.on_date
  join public.duty_boards b on b.id = s.board_id
  where e.id = any(coalesce(p_ids, array[]::bigint[])) and e.user_id is not null and b.status in ('open','closed')
$$;

-- 전날 알림의 대상 — p_date(한국 날짜)에 살아 있는 지원 번호들(앱 계정 있음 · 쉬는 날·자리 아님 · 받는 중·지원 멈춤 당번).
create or replace function public.duty_remind_ids(p_date date)
returns bigint[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(e.id order by e.id), '{}'::bigint[])
  from public.duty_signups e
  join public.duty_slots s on s.id = e.slot_id
  join public.duty_days  d on d.board_id = s.board_id and d.on_date = s.on_date
  join public.duty_boards b on b.id = s.board_id
  where s.on_date = p_date and e.status = 'active' and e.user_id is not null
    and not s.off and not d.off and b.status in ('open','closed')
$$;

-- ---------- 권한 — 모든 함수: 공개 역할에서 빼고 service_role 만(파일 끝 확인 질의가 0 을 본다) ----------
revoke all on function public.duty_today() from public, anon, authenticated;
revoke all on function public.duty_cutoff(date) from public, anon, authenticated;
revoke all on function public.duty_locked(timestamptz, date) from public, anon, authenticated;
revoke all on function public.duty_name_out(text) from public, anon, authenticated;
revoke all on function public.duty_same_person(public.duty_signups, uuid, text) from public, anon, authenticated;
revoke all on function public.duty_ensure_slots(uuid) from public, anon, authenticated;
revoke all on function public.duty_line_save(uuid, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.duty_line_remove(bigint) from public, anon, authenticated;
revoke all on function public.duty_date_add(uuid, date, bigint[]) from public, anon, authenticated;
revoke all on function public.duty_days_off(uuid, date, date, boolean, text, int) from public, anon, authenticated;
revoke all on function public.duty_day_set(uuid, date, text, uuid, text) from public, anon, authenticated;
revoke all on function public.duty_slot_set(bigint, int, boolean, int) from public, anon, authenticated;
revoke all on function public.duty_slot_delete(bigint) from public, anon, authenticated;
revoke all on function public.duty_apply(bigint, uuid, jsonb, boolean, boolean, boolean) from public, anon, authenticated;
revoke all on function public.duty_cancel(bigint, uuid, boolean) from public, anon, authenticated;
revoke all on function public.duty_move(bigint, bigint, boolean) from public, anon, authenticated;
revoke all on function public.duty_ask(bigint, uuid, text) from public, anon, authenticated;
revoke all on function public.duty_board_view(uuid, uuid) from public, anon, authenticated;
revoke all on function public.duty_mine(uuid) from public, anon, authenticated;
revoke all on function public.duty_list_view(uuid) from public, anon, authenticated;
revoke all on function public.duty_roster(uuid, date, date) from public, anon, authenticated;
revoke all on function public.duty_board_counts(uuid[]) from public, anon, authenticated;
revoke all on function public.duty_notify_claim(text, bigint[]) from public, anon, authenticated;
revoke all on function public.duty_notify_rows(bigint[]) from public, anon, authenticated;
revoke all on function public.duty_remind_ids(date) from public, anon, authenticated;
grant execute on function public.duty_today() to service_role;
grant execute on function public.duty_cutoff(date) to service_role;
grant execute on function public.duty_locked(timestamptz, date) to service_role;
grant execute on function public.duty_name_out(text) to service_role;
grant execute on function public.duty_same_person(public.duty_signups, uuid, text) to service_role;
grant execute on function public.duty_ensure_slots(uuid) to service_role;
grant execute on function public.duty_line_save(uuid, jsonb, boolean) to service_role;
grant execute on function public.duty_line_remove(bigint) to service_role;
grant execute on function public.duty_date_add(uuid, date, bigint[]) to service_role;
grant execute on function public.duty_days_off(uuid, date, date, boolean, text, int) to service_role;
grant execute on function public.duty_day_set(uuid, date, text, uuid, text) to service_role;
grant execute on function public.duty_slot_set(bigint, int, boolean, int) to service_role;
grant execute on function public.duty_slot_delete(bigint) to service_role;
grant execute on function public.duty_apply(bigint, uuid, jsonb, boolean, boolean, boolean) to service_role;
grant execute on function public.duty_cancel(bigint, uuid, boolean) to service_role;
grant execute on function public.duty_move(bigint, bigint, boolean) to service_role;
grant execute on function public.duty_ask(bigint, uuid, text) to service_role;
grant execute on function public.duty_board_view(uuid, uuid) to service_role;
grant execute on function public.duty_mine(uuid) to service_role;
grant execute on function public.duty_list_view(uuid) to service_role;
grant execute on function public.duty_roster(uuid, date, date) to service_role;
grant execute on function public.duty_board_counts(uuid[]) to service_role;
grant execute on function public.duty_notify_claim(text, bigint[]) to service_role;
grant execute on function public.duty_notify_rows(bigint[]) to service_role;
grant execute on function public.duty_remind_ids(date) to service_role;

commit;

-- 확인(CLI 는 마지막 SELECT 하나만 보여 준다 — 한 문장으로 묶었다)
--   기대: tables 6 · functions 25 · rls on 6 · table grants 0 · routine grants 0 · anon can execute 0 · service_role can execute 25 · sequence grants 0
select 'tables' as t, count(*) from pg_tables where schemaname = 'public'
    and tablename in ('duty_boards','duty_lines','duty_days','duty_slots','duty_signups','duty_notify_log')
union all select 'functions', count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'duty\_%'
union all select 'rls on', count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname like 'duty\_%' and c.relkind = 'r' and c.relrowsecurity
union all select 'table grants (anon·authenticated·PUBLIC)', count(*) from information_schema.role_table_grants
  where table_schema = 'public' and table_name like 'duty\_%' and grantee in ('anon','authenticated','PUBLIC')
union all select 'routine grants (anon·authenticated·PUBLIC)', count(*) from information_schema.role_routine_grants
  where routine_schema = 'public' and routine_name like 'duty\_%' and grantee in ('anon','authenticated','PUBLIC')
union all select 'anon·authenticated can execute', count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'duty\_%'
    and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))
union all select 'service_role can execute', count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'duty\_%' and has_function_privilege('service_role', p.oid, 'execute')
union all select 'sequence grants (anon·authenticated)', count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'S' and c.relname like 'duty\_%'
    and (has_sequence_privilege('anon', c.oid, 'usage') or has_sequence_privilege('authenticated', c.oid, 'usage'));
