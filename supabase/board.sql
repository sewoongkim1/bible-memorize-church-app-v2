-- 질문·제안 공개 게시판 (누구나 글/답글, 관리자 숨김·삭제)
-- Supabase SQL Editor에서 1회 실행.

create table if not exists public.board_posts (
  id          bigint generated always as identity primary key,
  name        text,
  content     text not null,
  hidden      boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists public.board_replies (
  id          bigint generated always as identity primary key,
  post_id     bigint not null references public.board_posts(id) on delete cascade,
  name        text,
  content     text not null,
  is_admin    boolean not null default false,
  hidden      boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists idx_board_replies_post on public.board_replies(post_id);

-- RLS 기본 차단(서비스롤=Edge Function만 접근). 모든 읽기/쓰기는 Edge를 통해서만.
alter table public.board_posts enable row level security;
alter table public.board_replies enable row level security;

-- 확인:  select count(*) from board_posts;
