-- 본인 글 삭제(소프트 삭제) 기능:
--   user_id = 작성자 식별(본인 확인용)
--   deleted = 본인 삭제 태그(물리삭제 아님 → 관리자가 확인·복구 가능)
-- Supabase SQL Editor에서 1회 실행. (여러 번 실행해도 안전)

alter table public.board_posts   add column if not exists user_id uuid;
alter table public.board_posts   add column if not exists deleted boolean not null default false;
alter table public.board_replies add column if not exists user_id uuid;
alter table public.board_replies add column if not exists deleted boolean not null default false;

-- 확인:  select id, name, user_id, deleted, hidden from board_posts order by id desc limit 5;
