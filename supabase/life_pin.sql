-- 교회 생활 확인 번호 (2026-10-08 · 보안 점검 · 설계 docs/superpowers/specs/2026-10-08-church-life-pin-design.md)
--
-- ■ 왜: JWT 없는 API라 순위·게시판이 이름·소속을 보여 주어 로그인 명단이 된다. 「내 이름으로 하는 일」에
--    들어갈 때 휴대폰 뒷자리 4자리를 묻는다. 번호 자체는 두지 않고 서버 비밀값(LIFE_PIN_SECRET)을 섞은 해시만 둔다.
-- ■ 순서: 표가 먼저(빈 표는 아무도 안 읽는다). 표가 없어도 api 는 막지 않는다(lifeError 가 조용히 통과).
-- ⚠️ 어떤 응답에도 pin_hash·token_hash·user_id 를 싣지 않는다.
-- ⚠️ 새 user_id 표 셋은 기록 합치기(member_merge.sql)가 함께 안다 — 기기는 지우고, 번호는 남는 쪽이 이기고, 요청은 옮긴다.
-- 개발 → 운영 순으로 실행. 여러 번 돌려도 된다.

create table if not exists public.life_pins (
  user_id   uuid primary key,
  pin_hash  text not null,
  set_at    timestamptz not null default now(),
  fails     int not null default 0,
  fail_day  date
);

create table if not exists public.life_devices (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  token_hash  text not null,
  created_at  timestamptz not null default now(),
  seen_at     timestamptz not null default now()
);
create index if not exists life_devices_user on public.life_devices (user_id);
create unique index if not exists life_devices_token on public.life_devices (token_hash);

create table if not exists public.life_reset_requests (
  id          bigserial primary key,
  user_id     uuid not null,
  status      text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  created_at  timestamptz not null default now(),
  handled_at  timestamptz,
  handled_by  text
);
create index if not exists life_reset_open on public.life_reset_requests (status) where status = 'open';
create index if not exists life_reset_user on public.life_reset_requests (user_id);

alter table public.life_pins           enable row level security;
alter table public.life_devices        enable row level security;
alter table public.life_reset_requests enable row level security;
revoke all on public.life_pins, public.life_devices, public.life_reset_requests from public, anon, authenticated;
revoke all on sequence public.life_reset_requests_id_seq from public, anon, authenticated;
grant select, insert, update, delete on public.life_pins, public.life_devices, public.life_reset_requests to service_role;
grant usage on sequence public.life_reset_requests_id_seq to service_role;
