-- iOS 네이티브 푸시(APNs) 토큰 — 웹푸시의 push_subscriptions 와 같은 역할.
-- ⚠️ 새 표는 만드는 자리에서 바로 RLS를 켠다 — 공개 anon key로 기기 토큰이 새면 안 된다.
-- ■ 기록 합치기(member_merge.sql) — 2026-10-02 둘째 판부터 옮긴다(그전엔 이 줄이 있는 계정에서 합치기가 멈췄다):
--   기기 줄·시각·저녁 칸 그대로 user_id 만 남는 번호로. ⚠️ 이 표를 다시 만들거나 칸을 바꾸면 member_merge.sql 을
--   **이 파일 뒤에** 다시 돌린다(쓰기 연결 트리거가 이 표에 붙는다). 옮기지 않으면 users 삭제의 cascade 가 조용히 지운다.
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
