-- 게시판 사진 첨부 (2026-08-25)
--
-- 글 하나에 사진 최대 4장. 답글에는 넣지 않는다(화면이 복잡해진다).
--
-- ■ 어떻게 올라가나
--   브라우저 → Edge Function(api) → Storage.  브라우저가 Storage로 직접 올리지 않는다.
--   이 API는 JWT가 없어서, 공개 키로 Storage에 바로 쓸 수 있게 두면 아무나 아무거나
--   올릴 수 있다. 지킬 문은 하나로 유지한다 — 글쓰기가 이미 지나는 그 문이다.
--
-- ■ 사진은 브라우저에서 미리 줄여 보낸다
--   ① 폰 사진은 3~8MB라 그대로는 함수가 못 받고 데이터 요금도 나간다 (→ 200~400KB)
--   ② 더 중요한 이유: **EXIF에 찍은 장소의 GPS가 들어 있다.** 그대로 올리면 집에서
--      찍은 사진에 집 주소가 붙어 공개 게시판에 올라간다. 캔버스로 다시 그리면 사라진다.
--
-- ■ 통은 공개(public)다
--   글이 공개 게시판이라 사진도 함께 보여야 한다. 대신 파일 이름을 임의의 UUID로 지어
--   주소를 짐작할 수 없게 한다. 그래도 **주소를 아는 사람은 볼 수 있다**는 점은
--   개인정보 안내에 그대로 적는다.
--
-- Supabase → SQL Editor 에서 실행.


-- 1) 글에 사진 목록을 담을 칸 (["board/xxxx.jpg", ...])
alter table public.board_posts
  add column if not exists images jsonb not null default '[]'::jsonb;

-- 2) 사진 통 만들기 — 읽기는 공개, 쓰기는 서버(service_role)만
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('board', 'board', true, 2097152,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
   set public = true,
       file_size_limit = 2097152,                       -- 2MB (줄여 보내므로 넉넉하다)
       allowed_mime_types = array['image/jpeg','image/png','image/webp'];

-- 3) 쓰기 권한을 익명에게 주지 않는다.
--    storage.objects 는 RLS로 움직인다 — 정책을 만들지 않으면 anon은 쓰지 못하고,
--    service_role(Edge Function)은 RLS를 지나가므로 그대로 올린다.
--    (혹시 예전에 만들어 둔 정책이 있다면 지운다)
drop policy if exists "board images anon insert" on storage.objects;
drop policy if exists "board images anon update" on storage.objects;
drop policy if exists "board images anon delete" on storage.objects;

-- 4) 확인
select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'board';
select column_name, data_type from information_schema.columns
 where table_schema = 'public' and table_name = 'board_posts' and column_name = 'images';
-- anon이 쓸 수 있는 정책이 남아 있지 않은지
select policyname, cmd, roles from pg_policies
 where schemaname = 'storage' and tablename = 'objects';
