-- 성경필사 노트 신청
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키를 절대 넣지 마세요.
--
-- 적용: Supabase 대시보드 → SQL Editor에 붙여넣고 실행
--
-- 한 성도가 여러 번 신청할 수 있다(받아 간 뒤 또 신청). 그래서 신청 한 건이
-- 한 행이고, 화면에는 늘 가장 최근 한 건만 보여 준다.
-- 상태 흐름: 신청완료 → 준비중 → 준비완료 → 배부완료
--   · 신청완료에서만 성도가 고치거나 취소할 수 있다
--   · 준비완료로 바뀔 때 앱 푸시를 한 번 보낸다(notified_at으로 중복 방지)

create table if not exists public.pilsa_orders (
  id          bigserial   primary key,
  user_id     text        not null,
  name        text,                     -- 신청 당시 이름(명단 조회용 스냅샷)
  who         text,                     -- 신청 당시 소속(교구·목장 / 부서·학년)
  phone       text        not null,
  size        text        not null,     -- A4 / A5
  type1       text        not null,     -- 아래쪽 필사형 / 오른쪽 필사형
  type2       text        not null,     -- 개역개정 / 쉬운성경 / NIV / 한영 / 영한
  qtys        jsonb       not null default '{}'::jsonb,   -- { ot16: 1, nt01: 2 }
  total       int         not null default 0,
  memo        text,
  status      text        not null default '신청완료',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  notified_at timestamptz                                  -- 준비완료 푸시를 보낸 시각
);

-- 내 신청 조회(가장 최근 한 건)
create index if not exists pilsa_orders_user_idx
  on public.pilsa_orders (user_id, created_at desc);

-- 관리자 명단(신청일순)
create index if not exists pilsa_orders_at_idx
  on public.pilsa_orders (created_at desc);

-- 상태값 오타 방지
alter table public.pilsa_orders drop constraint if exists pilsa_orders_status_chk;
alter table public.pilsa_orders add constraint pilsa_orders_status_chk
  check (status in ('신청완료', '준비중', '준비완료', '배부완료'));

-- RLS 기본 차단 — Edge Function(service_role)만 읽고 쓴다
alter table public.pilsa_orders enable row level security;
