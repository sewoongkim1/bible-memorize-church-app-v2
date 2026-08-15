-- 말씀 도전 순위 — 서로 응원하기(👏)
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키를 절대 넣지 마세요.
--
-- 적용: Supabase 대시보드 → SQL Editor에 붙여넣고 실행
--
-- 한 사람이 같은 사람에게 하루 한 번만 응원할 수 있다 → 기본키에 cheer_date까지 넣는다.
-- (다시 누르면 그 행만 지운다. 다음 날이면 다시 누를 수 있다.)
-- 기간 집계는 created_at이 아니라 cheer_date로 거른다 — 순위 조회의 from~to(KST 날짜)와
-- 단위가 같아 시간대 환산 없이 정확하다.

create table if not exists public.rank_cheers (
  target_user_id text        not null,   -- 응원을 받은 성도(users.id)
  from_user_id   text        not null,   -- 응원을 보낸 성도(users.id)
  cheer_date     date        not null,   -- KST 기준 날짜
  from_name      text,                   -- 보낸 당시 소속·이름(명단 표시용 스냅샷)
  created_at     timestamptz not null default now(),
  primary key (target_user_id, from_user_id, cheer_date)
);

-- 순위표를 그릴 때 기간으로 한 번에 긁어오기 위한 인덱스
create index if not exists idx_rank_cheers_date
  on public.rank_cheers (cheer_date);

-- RLS 기본 차단 — Edge Function(service_role)만 읽고 쓴다
alter table public.rank_cheers enable row level security;

-- 확인: select cheer_date, count(*) from rank_cheers group by cheer_date order by 1 desc;
