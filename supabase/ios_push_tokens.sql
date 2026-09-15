-- iOS 네이티브 푸시(APNs) 토큰 — 웹푸시의 push_subscriptions 와 같은 역할.
-- ⚠️ 새 표는 만드는 자리에서 바로 RLS를 켠다 — 공개 anon key로 기기 토큰이 새면 안 된다.
create table if not exists public.ios_push_tokens (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references public.users(id) on delete cascade,
  device_token  text not null unique,
  hour          smallint not null default 7,   -- 알림 받을 시간(5·6·7·8시) — push_subscriptions와 같은 관례
  created_at    timestamptz not null default now()
);

alter table public.ios_push_tokens enable row level security;

create index if not exists idx_ios_push_user on public.ios_push_tokens(user_id);
create index if not exists idx_ios_push_hour on public.ios_push_tokens(hour);
