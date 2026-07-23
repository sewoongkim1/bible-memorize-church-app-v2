-- 긴 본문 암송("핵심 암송"): 본문(passages) + 완료 기록(passage_progress). SQL Editor/CLI에서 1회 실행.
create table if not exists public.passages (
  id          serial primary key,
  title       text not null,
  ref         text,
  category    text,
  lines       jsonb not null default '[]'::jsonb,   -- 절 배열: ["...", "..."]
  sort_order  int   not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.passage_progress (
  user_id      uuid not null references public.users(id) on delete cascade,
  passage_id   int  not null references public.passages(id) on delete cascade,
  done_seq     int[] not null default '{}',          -- 완료한 절 인덱스(0-based)
  completed_at timestamptz,                            -- 전체 이어서 통과 시각
  updated_at   timestamptz not null default now(),
  primary key (user_id, passage_id)
);

-- 기본 차단(RLS): service_role(Edge Function)만 접근. 다른 테이블과 동일 모델.
alter table public.passages enable row level security;
alter table public.passage_progress enable row level security;
