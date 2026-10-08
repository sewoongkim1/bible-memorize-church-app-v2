-- 게시판 사진 올린 기록 (2026-10-08 · 보안 점검)
--
-- ■ 왜
--   boardUpload 는 아무 확인 없이 사진을 받았다 — 공개 키만 있으면 누구나 공개 칸(board)에 끝없이
--   올릴 수 있었고, 글에 안 붙인 사진도 주소로 열렸다. 이제 로그인한 분만 · 하루 20장까지 받고,
--   하루가 지나도 글에 안 붙은 사진은 서버가 치운다. 그 둘을 세고 가리는 데 이 표를 쓴다.
--
-- ■ 무엇을 담나
--   path     올린 파일 이름(UUID.확장자) — board_posts.images 에 들어가는 그 이름
--   uploader 올린 분의 users.id(관리자 글이면 null).
--            ⚠️ 칸 이름을 user_id 로 짓지 않고 FK 도 걸지 않는다 — 기록 합치기(member_merge.sql)는 모르는 표에
--            user_id 칸이나 users FK 가 있고 그분 줄이 있으면 멈춘다(merge-unsupported-records).
--            이 표는 성도님 기록이 아니라 「오늘 몇 장」을 세는 하루짜리 장부라 합칠 때 옮길 것이 없다.
--   kept     어느 글에 붙어 있는 것을 확인했다 → 다시 살피지 않는다
--
-- ■ 순서 — **표가 먼저**(빈 표는 아무도 안 읽는다). 표가 없어도 api 는 장수를 세지 않고 그대로 받는다.
-- ⚠️ 어떤 응답에도 이 표의 uploader 를 싣지 않는다(그 값이 곧 user_id 다).
-- 개발 → 운영 순으로 SQL Editor(또는 supabase db query)에서 실행. 여러 번 돌려도 된다.

create table if not exists public.board_uploads (
  path        text primary key,
  uploader    uuid,
  created_at  timestamptz not null default now(),
  kept        boolean not null default false
);
-- 2026-10-08 첫 판은 칸 이름이 user_id 였다(운영·개발에 빈 표로 잠깐 있었다) — 있으면 바꾼다
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='board_uploads' and column_name='user_id') then
    alter table public.board_uploads rename column user_id to uploader;
  end if;
end $$;
drop index if exists public.board_uploads_user_day;
create index if not exists board_uploads_uploader_day on public.board_uploads (uploader, created_at);
create index if not exists board_uploads_sweep on public.board_uploads (created_at) where not kept;

alter table public.board_uploads enable row level security;
revoke all on public.board_uploads from public, anon, authenticated;
grant select, insert, update, delete on public.board_uploads to service_role;
