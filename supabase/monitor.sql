-- 장애 모니터링용 발송 로그 테이블
-- Supabase 대시보드 > SQL Editor 에서 1회 실행.

create table if not exists push_log (
  id        bigserial primary key,
  sent_at   timestamptz not null default now(),
  mode      text,          -- 'daily'(정기) | 'manual'(수동) | 'test'
  title     text,
  sent      int  default 0,
  failed    int  default 0,
  total     int  default 0,
  ok        boolean default false
);

-- 오늘(KST) 정기 발송 조회 최적화
create index if not exists idx_push_log_sent_at on push_log (sent_at desc);

-- RLS: 기본 차단(서비스롤=Edge Function만 접근). 정책 미추가 = 외부 접근 불가.
alter table push_log enable row level security;

-- 확인:  select * from push_log order by sent_at desc limit 10;
