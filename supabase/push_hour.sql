-- 알림 시간 선택 기능: 구독마다 받을 시간(hour) 저장 (5·6·7·8시)
-- Supabase SQL Editor에서 1회 실행.

alter table public.push_subscriptions
  add column if not exists hour smallint not null default 7;

create index if not exists idx_push_sub_hour on public.push_subscriptions(hour);

-- 기존 구독자는 기본 7시로 유지됩니다.
-- 확인:  select hour, count(*) from push_subscriptions group by hour order by hour;
