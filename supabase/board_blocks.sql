-- 게시판 「이분 글 가리기」 — board_blocks (2026-10-01)
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키·실명을 절대 넣지 마세요.
--
-- ■ 왜: 구글 플레이 「사용자 제작 콘텐츠(UGC)」 정책 — 공개 게시판이 있는 앱은 앱 안에서
--   「콘텐츠·사용자 신고」와 함께 **「사용자 차단」**을 요구한다(자료/store/README.md 「구글 출시 심사 전 결정」 4절 ③).
--   우리 앱은 한 교회만 쓰지만 아무 이름으로나 들어올 수 있어(로그인은 통제가 아니다) 「공개 UGC」로 읽힐 수 있다.
--   그래서 가장 싼 길 — **내 화면에서만** 그분의 글·답글을 안 보이게 한다. 상대는 모른다. 자세한 것은 docs/notes/board.md 「가리기」 절.
--
-- ■ 실행 순서 ⚠️ — **개발 먼저**, 그리고 **함수(api) 배포보다 먼저**(새 표에 새 액션만 얹는 경우)
--   1) 개발(ktpwthwqzgcqcrmsafdo) SQL Editor 에 이 파일 전체 → 맨 아래 「확인」
--   2) 개발에 api 배포 → 스모크
--   3) 운영(xnomlgydifiqiybervtf) SQL Editor 에 이 파일 전체 → 「확인」
--   4) 운영에 api 배포
--   함수가 먼저 나가도 500 은 안 난다 — 표가 없으면 boardBlock·boardBlocks·boardUnblock 이 `not-ready` 로 답하고,
--   boardList 는 가리기 없이 그대로 보여 준다. 여러 번 실행해도 안전하다(if not exists).
--
-- ■ 규칙 (어기면 사고)
--   · RLS 를 이 자리에서 켜고 anon·authenticated **둘 다** revoke(표·시퀀스) — 2026-09-28 부터 운영에 카카오 로그인이 켜져
--     authenticated = 카카오 계정만 있으면 누구나다. 읽고 쓰는 것은 Edge Function(service_role) 하나뿐이다.
--   · blocked_id(가린 분)는 **어떤 응답에도 싣지 않는다.** 화면은 「어느 글을 쓴 분을 가린다」고 글·답글 번호만 보내고,
--     서버가 그 글에서 글쓴 분을 찾는다. 「내가 가린 분」 목록은 **이름(가릴 때의 표시 이름)과 이 표의 줄 번호**만 내보낸다.
--     이 API 는 JWT 가 없어 user_id 가 새면 그 사람 행세가 된다(CLAUDE.md 「보안」).
--   · 한 분이 같은 분을 두 번 가려도 한 줄 — unique. 두 번째는 서버가 「이미」로 받는다(같은 인사).
--   · 관리자 답글·관리자 공지는 가릴 수 없다(서버가 `admin` 으로 막는다) — 안내를 못 보게 되면 안 된다.
--   · 옛 글(user_id 가 없는 2026-08 이전 글)은 글쓴 분을 알 수 없어 가릴 수 없다(`no-author` → 앱이 「🚩 신고」를 권한다).
--
-- ■ 얼마나 보관하나 — 개인정보 안내(privacy/ · 앱 안 두 곳)와 같은 말
--   · 「다시 보기」를 누르면 그 줄을 바로 지운다.
--   · 가린 분이나 가려진 분의 기록 삭제 요청으로 users 행을 지우면 함께 지워진다(on delete cascade).
--
-- ■ 기록 합치기(member_merge.sql) — 2026-10-01 같은 날 옮기기를 더했다(처음엔 이 표가 있는 계정에서 합치기가 멈췄다).
--   가린 쪽·가려진 쪽 칸을 모두 남는 번호로 · 두 계정 사이 줄은 버림(자기 자신을 가리게 된다) · 겹치면 남는 쪽 줄 하나.
--   ⚠️ 이 표를 다시 만들거나 칸을 바꾸면 member_merge.sql 을 **이 파일 뒤에** 다시 돌린다(쓰기 연결 트리거가 이 표에 붙는다).

-- ① 표
create table if not exists public.board_blocks (
  id            bigserial   primary key,
  blocker_id    uuid        not null references public.users(id) on delete cascade,   -- 가린 분(나)
  blocked_id    uuid        not null references public.users(id) on delete cascade,   -- ⚠️ 응답에 싣지 않는다
  blocked_name  text        check (blocked_name is null or char_length(blocked_name) <= 60), -- 가릴 때의 표시 이름(「사랑-3 홍길동」)
  created_at    timestamptz not null default now(),
  constraint board_blocks_not_self check (blocker_id <> blocked_id)
);

-- ② 한 분이 같은 분을 한 번만
create unique index if not exists board_blocks_once on public.board_blocks (blocker_id, blocked_id);

-- ③ 잠금 — 그 자리에서 켠다(event_entries 가 이걸 빠뜨려 user_id 47건이 공개 키로 읽혔다)
alter table public.board_blocks enable row level security;
revoke all on public.board_blocks from public, anon, authenticated;
revoke all on sequence public.board_blocks_id_seq from public, anon, authenticated;
grant all on public.board_blocks to service_role;
grant usage, select on sequence public.board_blocks_id_seq to service_role;

-- ── 확인 ─────────────────────────────────────────────────────
-- 표와 RLS:          select relname, relrowsecurity from pg_class where relname = 'board_blocks';   -- t
-- 공개 키로 안 열림:  select grantee, privilege_type from information_schema.role_table_grants
--                     where table_name = 'board_blocks' and grantee in ('anon', 'authenticated');     -- 0행
-- 운영이면 끝으로 c:\Projects\church-admin\supabase\sql\check-authenticated-exposure.sql 을 돌려 0행인지 본다.
-- 공개 키로 직접(행이 오면 열린 것): GET {URL}/rest/v1/board_blocks?select=*&limit=1
-- 몇 줄인가(이름 없이): select count(*), count(distinct blocker_id) from public.board_blocks;
