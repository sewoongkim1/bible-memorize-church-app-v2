-- ============================================================
-- 성경말씀 암송 앱 v2 — Supabase(PostgreSQL) 스키마
-- 작성 2026-07-02 · 고척교회 제자양육부 신앙운동팀
--
-- [접근 모델]
--   클라이언트(PWA)는 DB에 직접 접근하지 않는다.
--   Edge Function(미들웨어)이 service_role 키로 읽고 쓴다.
--   따라서 모든 테이블에 RLS를 켜되 정책을 두지 않아 "기본 차단"으로 둔다.
--   (service_role 은 RLS를 우회하므로 미들웨어만 데이터에 접근 가능)
--   → 향후 정식 로그인(auth.uid) 도입 시, 본인 행만 허용하는 정책을 추가.
-- ============================================================

-- ---------- 1. 사용자(성도) ----------
create table if not exists public.users (
  id            uuid primary key default gen_random_uuid(),
  type          text not null check (type in ('교구','교회학교')),
  gu            text,            -- 교구명 (교구)
  mok           text,            -- 목장 (교구)
  bu            text,            -- 부서 (교회학교)
  grade         text,            -- 학년 (교회학교)
  name          text not null,
  identity_key  text not null unique,  -- 동일인 식별용 정규화 키 (예: 교구|화평|20|김세웅)
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz
);

-- ---------- 2. 말씀/설교 (주차별 콘텐츠) ----------
create table if not exists public.verses (
  no            integer primary key,     -- 구절 번호(기존 verses.json의 no 계승)
  week          integer,                 -- 주차
  ref           text not null,           -- 출처 (예: 딤전 1:11)
  text          text not null,           -- 말씀 본문
  sermon_title  text,
  sermon_url    text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

-- ---------- 3. 개인 진도 (구절별 단계) ----------
create table if not exists public.progress (
  user_id     uuid not null references public.users(id) on delete cascade,
  verse_no    integer not null references public.verses(no) on delete cascade,
  stage       smallint not null default 0 check (stage between 0 and 3),
  updated_at  timestamptz not null default now(),
  primary key (user_id, verse_no)
);

-- ---------- 4. 도전/암송 기록 (순위·통계 원천) ----------
create table if not exists public.challenge_log (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.users(id) on delete cascade,
  verse_no    integer not null references public.verses(no) on delete cascade,
  mode        text not null check (mode in ('typing','voice','review-typing','review-voice')),
  score       smallint,                 -- 음성 채점 점수 등(선택)
  created_at  timestamptz not null default now()
);

-- ---------- 5. 복습(간격 반복) 일정 ----------
create table if not exists public.reviews (
  user_id     uuid not null references public.users(id) on delete cascade,
  verse_no    integer not null references public.verses(no) on delete cascade,
  box         smallint not null default 1,   -- Leitner 상자(1..5)
  due_at      date not null,                 -- 다음 복습 예정일
  last_at     date,                          -- 마지막 복습일
  primary key (user_id, verse_no)
);

-- ---------- 6. 푸시 구독 (v2 알림) ----------
create table if not exists public.push_subscriptions (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.users(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text,
  auth        text,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- 인덱스 (조회 성능)
-- ============================================================
create index if not exists idx_progress_user        on public.progress(user_id);
create index if not exists idx_challenge_created     on public.challenge_log(created_at);
create index if not exists idx_challenge_user        on public.challenge_log(user_id);
create index if not exists idx_challenge_verse       on public.challenge_log(verse_no);
create index if not exists idx_reviews_due           on public.reviews(user_id, due_at);
create index if not exists idx_users_identity        on public.users(identity_key);

-- ============================================================
-- RLS: 모든 테이블 활성화(정책 없음 = 기본 차단)
--   → anon/authenticated 는 직접 접근 불가.
--   → Edge Function 의 service_role 키만 접근(미들웨어 경유).
-- ============================================================
alter table public.users              enable row level security;
alter table public.verses             enable row level security;
alter table public.progress           enable row level security;
alter table public.challenge_log      enable row level security;
alter table public.reviews            enable row level security;
alter table public.push_subscriptions enable row level security;

-- (선택) 말씀 목록은 공개 읽기를 허용하고 싶다면 아래 주석 해제:
-- create policy "verses are public readable" on public.verses
--   for select using (is_active = true);

-- ============================================================
-- 관리자 통계용 예시 뷰 (Edge Function에서 service_role로 조회)
-- ============================================================

-- 구절별 현황: 단계별 인원 수
create or replace view public.v_verse_status as
select
  v.no, v.ref,
  count(*) filter (where p.stage = 1) as stage1,
  count(*) filter (where p.stage = 2) as stage2,
  count(*) filter (where p.stage = 3) as done
from public.verses v
left join public.progress p on p.verse_no = v.no
group by v.no, v.ref
order by v.no;

-- 도전 순위(전체 누적): 기간 필터는 Edge Function에서 created_at 조건으로 처리
create or replace view public.v_ranking_all as
select
  u.id as user_id, u.name, u.type, u.gu, u.mok, u.bu, u.grade,
  count(*)                                            as total,
  count(*) filter (where c.mode like '%typing%')      as typing,
  count(*) filter (where c.mode like '%voice%')        as voice
from public.challenge_log c
join public.users u on u.id = c.user_id
group by u.id, u.name, u.type, u.gu, u.mok, u.bu, u.grade
order by total desc;
