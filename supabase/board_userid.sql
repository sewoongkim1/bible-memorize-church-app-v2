-- 본인 글 삭제 기능: 작성자 식별용 user_id 컬럼 추가
-- Supabase SQL Editor에서 1회 실행.

alter table public.board_posts   add column if not exists user_id uuid;
alter table public.board_replies add column if not exists user_id uuid;

-- 확인:  select id, name, user_id from board_posts order by id desc limit 5;
