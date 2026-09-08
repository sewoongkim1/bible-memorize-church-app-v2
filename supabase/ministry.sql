-- 사역신청 (2027) — 사역팀 목록 + 신청 접수
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키를 절대 넣지 마세요.
--
-- 적용: Supabase 대시보드 → SQL Editor에 붙여넣고 실행
-- ⚠️ **개발 DB(ktpwthwqzgcqcrmsafdo)에 먼저** 돌린 뒤 운영에 올린다.
--    운영 마이그레이션은 되돌릴 수 없고, 성도님 기록 위에서 실패하면 손쓸 방법이 없다.
--
-- 설계: docs/superpowers/specs/2026-09-06-ministry-application-design.md
-- 계획: docs/superpowers/plans/2026-09-08-ministry-application.md
--
-- 필사 노트 신청(pilsa_orders)과 같은 뼈대다 — 신청 한 건이 한 행, 상태가 단계로
-- 바뀌고, 상태가 바뀌는 자리에서 푸시가 한 번 나간다. 다른 점은 두 가지:
--   · 한 해에 한 사람 한 건만 받는다(필사는 여러 번 받는다)  → unique(year, user_id)
--   · 고른 사역이 최대 3개다                                 → choices jsonb + 길이 제약

-- ============================================================
-- 1) 사역팀 목록 — 성도가 고르는 대상
--    자료는 ministry/ministry_catalog_2027.json(부서 확인 확정본)에서 온다.
--    INSERT 문은 tools/ministry-seed-sql.py 가 만들어 준다(손으로 적지 않는다).
-- ============================================================
create table if not exists public.ministry_catalog (
  id            bigserial   primary key,
  year          int         not null,
  committee     text        not null,              -- 위원회/부서
  group_name    text        not null default '',   -- 중분류(없으면 빈 문자열)
  team          text        not null,              -- 사역팀명
  kind          text        not null default 'apply',  -- apply=신청 / appoint=임명직
  schedule_note text        not null default '',   -- 사역 시간·요일
  desc_note     text        not null default '',   -- 하는 일 한 줄
  capacity_note text        not null default '',   -- 필요 인원(참고용 — 신청을 막지 않는다)
  option_note   text        not null default '',   -- 하위 선택 안내(어와나 택1 등)
  sort_order    int         not null default 0,    -- 화면에 뿌리는 순서(JSON 순서 그대로)
  created_at    timestamptz not null default now(),
  unique (year, committee, group_name, team)
);

create index if not exists ministry_catalog_year_idx
  on public.ministry_catalog (year, sort_order);

alter table public.ministry_catalog drop constraint if exists ministry_catalog_kind_chk;
alter table public.ministry_catalog add constraint ministry_catalog_kind_chk
  check (kind in ('apply', 'appoint'));

-- ⚠️ 표를 만들면 그 자리에서 RLS를 켠다. event_entries 가 이걸 빠뜨려
--    user_id 47건이 공개 키로 읽혔다. 정책 없이 켜면 기본 차단이고,
--    Edge Function(service_role)만 읽고 쓴다.
alter table public.ministry_catalog enable row level security;

-- ============================================================
-- 2) 신청 — 한 해에 한 사람 한 건
--    상태 흐름: 신청완료 → 검토중 → 임명확정 / 미채택
--      · 신청완료에서만 성도가 고치거나 취소할 수 있다
--      · 임명확정으로 바뀔 때 앱 푸시를 한 번 보낸다(notified_at 으로 중복 방지)
--      · 푸시는 알림을 켠 분에게만 간다 — 못 받는 분을 위해 게시가 함께 간다
-- ============================================================
create table if not exists public.ministry_orders (
  id          bigserial   primary key,
  year        int         not null,
  user_id     text        not null,
  name        text,                                -- 신청 당시 이름(명단 조회용 스냅샷)
  who         text,                                -- 신청 당시 소속(교구·목장 / 부서·학년)
  choices     jsonb       not null default '[]'::jsonb,
  -- choices 는 [{id, committee, team, option}] 최대 3개.
  -- ⚠️ 순위가 없다(2026-09-08 결정). 배열 순서는 남지만 뜻을 부여하지 않는다 —
  --    나중에 순위가 필요해지면 이 순서를 화면에서 보여주기만 하면 된다.
  -- ⚠️ 팀 이름을 함께 박아 둔다(스냅샷). 목록이 바뀌어도 "그때 무엇을 냈는지"가 남는다.
  status      text        not null default '신청완료',
  note        text,                                -- 담당자 메모
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  decided_at  timestamptz,                         -- 임명확정/미채택으로 바꾼 시각
  notified_at timestamptz,                         -- 임명확정 푸시를 보낸 시각
  unique (year, user_id)
);

create index if not exists ministry_orders_year_idx
  on public.ministry_orders (year, created_at desc);

alter table public.ministry_orders drop constraint if exists ministry_orders_status_chk;
alter table public.ministry_orders add constraint ministry_orders_status_chk
  check (status in ('신청완료', '검토중', '임명확정', '미채택'));

-- ⚠️ 최대 3개는 화면·서버·DB 세 곳에서 지킨다. 화면은 편의고, 규칙은 여기서 끝난다.
alter table public.ministry_orders drop constraint if exists ministry_orders_max3_chk;
alter table public.ministry_orders add constraint ministry_orders_max3_chk
  check (jsonb_array_length(choices) between 1 and 3);

alter table public.ministry_orders enable row level security;

-- ============================================================
-- 3) 신청 기간 — 코드가 아니라 설정에 둔다
--    날짜를 코드에 박으면 바뀔 때마다 배포해야 한다.
--    기간 밖에는 첫 화면에 진입점이 뜨지 않고, 서버도 신청을 거절한다.
-- ============================================================
insert into public.app_config (key, value)
values ('ministry', '{"year":2027,"open":"2026-12-13","close":"2026-12-27"}'::jsonb)
on conflict (key) do update set value = excluded.value, updated_at = now();

-- 확인
--   select count(*) from ministry_catalog where year = 2027;
--   select key, value from app_config where key = 'ministry';
