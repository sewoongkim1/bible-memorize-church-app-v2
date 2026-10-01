-- 보호자 확인 · 게시판 이용 규칙 동의 — users 에 날짜 칸 둘 (2026-10-01)
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키·실명을 절대 넣지 마세요.
--
-- ■ 왜
--   ① 보호자 확인(guardian_ok_at) — 구글 플레이 대상 연령을 「13세 이상」으로 고르고(13세 미만은 고르지 않는다),
--     어린이는 **보호자와 함께** 쓰는 앱으로 정리했다. 한국 개인정보 보호법(만 14세 미만 → 법정대리인 동의)도
--     같은 자리다. 어린 부서(영아·유아·유치·유년·초등·사랑부, 중등부 1·2학년)로 들어오시는 분은
--     「보호자(부모님)가 함께 확인했어요」를 한 번 체크하고, **그 날짜를 서버에 남긴다.**
--     어느 부서가 대상인지는 app.js·index.ts 의 needsGuardian() 이 정한다(두 곳 — tests/store-review.test.cjs 가 맞대 본다).
--     ⚠️ 법이 정한 「확인 방법」으로 충분한지는 **교회 담당자 확인 필요** — 이 칸은 「체크했다」는 기록일 뿐이다.
--   ② 게시판 이용 규칙(board_rules_at) — 구글 「사용자 제작 콘텐츠」 정책이 「글을 쓰기 전에 이용 규칙에 동의」를
--     요구한다. 처음 글·답글을 쓸 때 한 번 동의하면 그 날짜를 남기고, 서버(boardPost·boardReply)가
--     동의 없는 글을 받지 않는다(관리자 글은 예외). 규칙이 바뀌면 index.ts BOARD_RULES_SINCE 를 올려 다시 묻는다.
--
-- ■ 왜 새 표가 아니라 users 의 칸인가 — 가장 작고 안전하다
--   · 계정마다 날짜 하나뿐이다. 새 표를 만들면 users 를 가리키는 FK 가 하나 더 생겨
--     기록 합치기(member_merge.sql)가 「모르는 FK」로 멈춘다(board_reports 가 그 빈틈을 안고 있다).
--   · 계정을 지우면(삭제 요청) 함께 사라진다 — 따로 지울 것이 없다.
--   · users 는 이미 RLS 가 켜져 있다(schema.sql 96행) — 칸을 더해도 정책·권한은 그대로다(아래 「확인」으로 본다).
--   · 기록 합치기는 「남는 쪽」 행을 그대로 두므로, 옮겨 가는 쪽만 체크했던 분은 다음에 한 번 더 물어본다(잃는 것 없음).
--
-- ■ 실행 순서 ⚠️ — **개발 먼저**, 그리고 **함수(api) 배포보다 먼저**
--   1) 개발(ktpwthwqzgcqcrmsafdo) SQL Editor 에 이 파일 전체 → 맨 아래 「확인」
--   2) 개발에 api 배포 → 스모크
--   3) 운영(xnomlgydifiqiybervtf) SQL Editor 에 이 파일 전체 → 「확인」
--   4) 운영에 api 배포
--   함수가 먼저 나가도 깨지지는 않는다 — 칸이 없으면 login 은 기록만 건너뛰고(42703 을 삼킨다),
--   게시판은 규칙 확인을 「아직 준비 안 됨 = 통과」로 본다. 그래도 그 사이의 동의는 남지 않으니 칸을 먼저 만든다.
--   여러 번 실행해도 안전하다(if not exists).
--
-- ■ 응답에 실리는가
--   member_login 이 to_jsonb(users) 를 돌려주므로 **본인의 login 응답**에만 두 날짜가 실린다(본인 행이다).
--   남의 행을 내보내는 액션(순위·게시판·명단)은 정해진 칸만 고르므로 안 실린다.

alter table public.users add column if not exists guardian_ok_at timestamptz;   -- 보호자 확인 체크한 때(처음 한 번)
alter table public.users add column if not exists board_rules_at timestamptz;   -- 게시판 이용 규칙에 동의한 때(마지막)

comment on column public.users.guardian_ok_at is
  '어린 부서 로그인 때 「보호자(부모님)가 함께 확인했어요」를 체크한 때(처음 한 번). 법정 확인 방법 충족 여부는 교회 담당자 확인 필요.';
comment on column public.users.board_rules_at is
  '게시판 이용 규칙에 동의한 때. index.ts BOARD_RULES_SINCE 보다 이르면 다시 묻는다.';

-- ⚠️ users 의 권한(grant·revoke·정책)은 **여기서 건드리지 않는다** — 같은 프로젝트를 교회 어드민(카카오 로그인)도
--    쓰고 있어, 공용 표의 권한을 이 파일이 바꾸면 그쪽이 조용히 깨질 수 있다. 칸만 더한다. 아래 「확인」으로 보기만 한다.

-- ── 확인 ─────────────────────────────────────────────────────
-- 칸:            select column_name, data_type from information_schema.columns
--                where table_schema = 'public' and table_name = 'users'
--                  and column_name in ('guardian_ok_at', 'board_rules_at');                      -- 2행
-- 공개 키로 안 열림: select grantee, privilege_type from information_schema.role_table_grants
--                where table_name = 'users' and grantee in ('anon', 'authenticated');             -- 0행
-- 운영이면 끝으로 c:\Projects\church-admin\supabase\sql\check-authenticated-exposure.sql 을 돌려 0행인지 본다.
-- 어린 부서 숫자(이름 없이):
--   select bu, count(*) as 사람, count(guardian_ok_at) as 보호자확인
--     from public.users where type = '교회학교' group by bu order by 2 desc;
-- 게시판 규칙 동의(이름 없이): select count(*) filter (where board_rules_at is not null) from public.users;
