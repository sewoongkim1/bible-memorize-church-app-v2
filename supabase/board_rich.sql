-- 관리자 공지를 HTML로 그린다 (2026-09-01)
--
-- ■ 왜 표시가 필요한가
--   이 게시판은 성도 누구나 글을 쓸 수 있고, `api` 함수는 --no-verify-jwt 로 돈다.
--   글을 그대로 HTML로 그리면 저장형 XSS가 된다 — 누군가 <script> 한 줄을 적어 두면
--   그 글을 연 모든 분의 브라우저에서 코드가 돌고, 저장된 user_id를 빼내 그 사람
--   행세를 할 수 있다(supabase/security_close_public_views.sql 의 경고와 같은 길이다).
--
--   그래서 '관리자 비번으로 올린 글'에만 rich 표시를 붙이고, 앱은 그 글만 HTML로 그린다.
--   성도 글은 지금까지대로 글자로만 그린다.
--
-- ■ 서버·앱은 이 컬럼이 없어도 도는 폴백을 갖고 있다.
--   실행 전에는 공지도 그냥 글자로 보일 뿐, 글이 안 올라가지는 않는다.
--
-- ■ 개발 프로젝트에 먼저 돌린 뒤 운영에 돌린다(supabase/dev-setup.md).

alter table public.board_posts
  add column if not exists rich boolean not null default false;

-- 확인
--   select id, name, rich, left(content, 30) from board_posts order by id desc limit 5;
