-- 이벤트 플랫폼 — 회차 정의 + 참가 기록
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키를 절대 넣지 마세요.
--
-- 적용: Supabase 대시보드 → SQL Editor에 붙여넣고 실행
-- ⚠️ **개발 DB(ktpwthwqzgcqcrmsafdo)에 먼저** 돌린 뒤 운영(xnomlgydifiqiybervtf).
-- ⚠️ 여러 번 돌려도 안전하다(if not exists · drop/add 쌍).
--
-- 설계: docs/superpowers/specs/2026-09-10-event-platform-design.html
-- 계획: docs/superpowers/plans/2026-09-10-event-platform.md
--
-- 왜 표 둘인가 — 지금 앱의 이벤트는 회차 설정을 app_config('event') 한 행에 담아
-- 다음 회차를 열면 지난 회차가 덮여 사라진다. 분기마다 도는 것이 전제라면
-- 3년에 회차가 열둘이고, 그 시점에는 이미 성도님 기록이 얹혀 있다.
--
-- ⚠️ 이 두 표는 옛 「말씀 이벤트」(퀴즈형)의 event_entries 와 무관하다.
--    그쪽은 app_config('event') + event_entries 로 따로 돌아간다.

-- ① 회차 정의 ------------------------------------------------------
create table if not exists public.events (
  id          text        primary key,          -- 'summer-2026' 사람이 읽는 슬러그
  title       text        not null,             -- '2026 썸머 써 바이블 완서자 등록'
  subtitle    text        not null default '',
  season      text        not null default '',  -- '2026-3Q' 목록 묶음 표기
  kind        text        not null default 'signup',
  opens_on    date        not null,
  closes_on   date        not null,
  status      text        not null default 'draft',
  needs       jsonb       not null default '{}'::jsonb,  -- 무엇을 받는가
  copy        jsonb       not null default '{}'::jsonb,  -- 화면 문구
  sort_order  int         not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- status 가 노출의 문지기다. 날짜와 따로 논다:
--   draft    성도님께 안 보인다(관리자 미리보기만)
--   open     날짜 안이면 등록 가능 · 밖이면 「마감했어요」. 조회는 언제나 된다
--   closed   등록 불가 · 조회는 된다   ← 옛 사이트가 마감 시 조회까지 죽던 자리
--   archived 목록에서 사라진다(관리자만)
alter table public.events drop constraint if exists events_status_chk;
alter table public.events add  constraint events_status_chk
  check (status in ('draft', 'open', 'closed', 'archived'));

alter table public.events drop constraint if exists events_kind_chk;
alter table public.events add  constraint events_kind_chk
  check (kind in ('signup', 'quiz'));

-- 마감일이 시작일보다 앞설 수 없다(화면·서버에도 있지만 마지막 방어선을 DB에 둔다)
alter table public.events drop constraint if exists events_period_chk;
alter table public.events add  constraint events_period_chk
  check (closes_on >= opens_on);

create index if not exists idx_events_status on public.events (status, closes_on);

-- ② 참가 기록 ------------------------------------------------------
create table if not exists public.event_signups (
  id          bigserial   primary key,
  event_id    text        not null references public.events (id) on delete cascade,

  -- 앱에서 낸 것은 반드시 채워진다. NULL 은 이관된 옛 기록뿐이다.
  user_id     uuid        references public.users (id) on delete cascade,

  -- users.identity_key 와 **같은 규칙**(여섯 조각). 쓰임은 둘뿐이다:
  --   ① 이관된 옛 기록(user_id 없음)을 사람에 붙이기
  --   ② 직분 기본값을 지난 기록에서 찾기
  -- 중복 판정은 이 칸이 하지 않는다 — user_id 가 한다.
  ident_key   text        not null,

  -- 신원 스냅샷 — 그때 무엇을 냈는지가 남는다(사역신청과 같은 이유).
  who_type    text        not null,              -- '교구' | '교회학교'
  group_name  text        not null,              -- 교구 | 부서
  sub_name    text        not null default '',   -- 목장 | 학년
  name        text        not null,

  position    text        not null default '',   -- needs.position 일 때만
  phone       text        not null default '',   -- needs.phone 일 때만
  memo        text        not null default '',   -- 성도가 남기는 한 줄
  answers     jsonb       not null default '{}'::jsonb,

  note        text        not null default '',   -- 담당자 메모 — 성도 응답에 절대 싣지 않는다
  source      text        not null default 'app',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- 「이벤트당 한 번」 — 이 한 줄이 중복 검사를 대신한다.
  -- ⚠️ 부분 인덱스(where user_id is not null)로 쓰면 안 된다 — PostgreSQL 은 부분
  --    인덱스를 ON CONFLICT 추론에 쓰지 못해 upsert(고치기)가 통째로 막힌다.
  --    일반 unique 로 두면 의도가 그대로 지켜진다: unique 제약은 NULL 을 서로 다른
  --    값으로 보므로(기본 NULLS DISTINCT) user_id 가 NULL 인 이관 행은 몇 개든
  --    들어가고, user_id 가 있는 앱 등록만 회차당 하나로 묶인다.
  constraint event_signups_uniq unique (event_id, user_id)
);

-- 참여는 앱을 통해서만 — user_id 없는 행은 「이관된 옛 기록」뿐이다.
alter table public.event_signups drop constraint if exists event_signups_app_only_chk;
alter table public.event_signups add  constraint event_signups_app_only_chk
  check (user_id is not null or source = 'import');

alter table public.event_signups drop constraint if exists event_signups_source_chk;
alter table public.event_signups add  constraint event_signups_source_chk
  check (source in ('app', 'import'));

create index if not exists idx_event_signups_at
  on public.event_signups (event_id, created_at desc);

-- 회차를 넘어 「이 사람의 기록」을 찾는다 — 직분 기본값 · 옛 기록 매칭
create index if not exists idx_event_signups_ident
  on public.event_signups (ident_key);

-- ③ RLS — 정책을 두지 않는다 = 기본 차단. Edge Function(service_role)만 통과.
-- ⚠️ event_entries 가 이 한 줄을 빠뜨려 user_id 47건이 공개 키로 읽힌 사고가 있었다.
alter table public.events        enable row level security;
alter table public.event_signups enable row level security;

-- 확인 ①: 표와 제약이 다 들어갔는지 (아래 10개가 나와야 한다)
--   events_kind_chk · events_period_chk · events_pkey · events_status_chk ·
--   event_signups_app_only_chk · event_signups_event_id_fkey · event_signups_pkey ·
--   event_signups_source_chk · event_signups_uniq · event_signups_user_id_fkey
--
-- select conname from pg_constraint
--  where conrelid in ('public.events'::regclass, 'public.event_signups'::regclass)
--  order by 1;

-- 확인 ②: RLS 가 켜졌는지 — 둘 다 t 여야 한다. f 면 여기서 멈출 것.
-- select relname, relrowsecurity from pg_class
--  where relname in ('events','event_signups');

-- 확인 ③: 공개 키로 새어 나가지 않는지 (행이 담긴 배열이 오면 열려 있는 것이다)
-- curl -s "https://<ref>.supabase.co/rest/v1/events?select=*&limit=1" -H "apikey: <anon>"
