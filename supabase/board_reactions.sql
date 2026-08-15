-- 응원·기도·공감 게시판 — 공감 이모지
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키를 절대 넣지 마세요.
--
-- 적용: Supabase 대시보드 → SQL Editor에 붙여넣고 실행
--
-- 기존 글·답글(board_posts / board_replies)은 건드리지 않는다. 옆에 표 하나만 더한다.
-- 한 사람이 이모지를 여러 개 누를 수 있어, 기본키에 emoji까지 넣는다
-- (사람+이모지 조합 하나 = 한 행. 다시 누르면 그 행만 지운다).

create table if not exists public.board_reactions (
  target      text        not null check (target in ('post', 'reply')),
  target_id   bigint      not null,
  user_id     text        not null,
  emoji       text        not null,
  who         text,                       -- 누른 당시 소속·이름(목록 표시용 스냅샷)
  created_at  timestamptz not null default now(),
  primary key (target, target_id, user_id, emoji)
);

-- 글 목록을 그릴 때 대상별로 한 번에 긁어오기 위한 인덱스
create index if not exists idx_board_reactions_target
  on public.board_reactions (target, target_id);

-- RLS 기본 차단 — Edge Function(service_role)만 읽고 쓴다
alter table public.board_reactions enable row level security;

-- 확인: select emoji, count(*) from board_reactions group by emoji;
