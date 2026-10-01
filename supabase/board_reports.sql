-- 게시판 신고(🚩) — board_reports (2026-10-01)
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키·실명을 절대 넣지 마세요.
--
-- ■ 왜: 구글 플레이 「사용자 제작 콘텐츠(UGC)」 정책 — 앱 안에서 불쾌한 글을 신고하는 길과
--   그것을 처리하는 운영(숨기기)이 있어야 한다. 아이폰은 「운영진이 직접 살핀다」는 설명으로
--   심사를 통과했지만, 구글은 문구가 「앱 안 신고」를 요구한다. 자세한 것은 docs/notes/board.md 「신고」 절.
--
-- ■ 실행 순서 ⚠️ — **개발 먼저**, 그리고 **함수(api) 배포보다 먼저**:
--   1) 개발(ktpwthwqzgcqcrmsafdo) SQL Editor 에 이 파일 전체를 붙여 실행 → 맨 아래 「확인」 질의
--   2) 개발에 api 배포 → bash tests/board-report-smoke.sh
--   3) 운영(xnomlgydifiqiybervtf) SQL Editor 에 이 파일 전체를 붙여 실행 → 「확인」 질의
--   4) 운영에 api 배포 → BR_ENV=prod bash tests/board-report-smoke.sh
--   새 표에 새 액션만 얹는 경우라 **표가 먼저**다(빈 표는 아무도 안 읽는다). 함수가 먼저 나가도
--   500 은 안 난다 — 표가 없으면 boardReport 가 `not-ready` 로 답하고 앱은 「지금은 신고를 받을 수
--   없어요」라고 말한다. 그래도 그 사이에 누른 신고는 남지 않으니 표를 먼저 만든다.
--   여러 번 실행해도 안전하다(if not exists · cron 은 같은 이름이면 덮어쓴다).
--
-- ■ 규칙 (어기면 사고)
--   · RLS 를 이 자리에서 켜고 anon·authenticated **둘 다** revoke 한다 — 2026-09-28 부터 운영에
--     카카오 로그인이 켜져 authenticated = 카카오 계정만 있으면 누구나다(CLAUDE.md 「보안」).
--     읽고 쓰는 것은 Edge Function(service_role) 하나뿐이다.
--   · reporter_id(신고한 분)는 **어떤 응답에도 싣지 않는다 — 관리자 목록에도.** 운영진에게 필요한 것은
--     「어느 글이 · 몇 분에게 · 무슨 까닭으로」이고, 누가 신고했는지가 새면 보복이 생긴다.
--     꼭 봐야 하면(같은 분이 글마다 신고를 쏟는 등) 운영진이 SQL Editor 에서 본다.
--   · 까닭(reason) 허용 목록은 **세 곳**이다 — 여기 CHECK · index.ts BOARD_REPORT_REASONS ·
--     app.js BOARD_REPORT_REASONS. 한 곳만 고치면 화면은 열리는데 저장이 막힌다(500).
--     tests/board-report.test.cjs 가 셋이 같은지 배포 앞(tools/preflight.py)에서 맞대 본다.
--   · 한 분이 한 글(답글)을 한 번만 — 아래 unique 인덱스. 두 번째는 서버가 「이미 신고함」으로 받아
--     같은 인사(「신고했어요」)를 돌려준다. 오류로 보이면 어르신은 고장인 줄 아신다.
--   · 답글 신고도 post_id 를 채운다(그 답글이 달린 글) — 관리자 화면이 글 단위로 볼 수 있게.
--
-- ■ 얼마나 보관하나 — 개인정보 안내(privacy/ 1·3·4·5항 · 앱 안 두 곳)와 **같은 말**이어야 한다
--   · 처리 전: 운영진이 처리할 때까지
--   · 처리 뒤(숨기기 · 처리 완료): **90일이 지나면 저절로 지운다** — 아래 ④ cron, 그리고 관리자가
--     신고 목록을 열 때 서버가 한 번 더 지운다(cron 이 없는 DB 에서도 약속이 지켜지게)
--   · 신고된 글이 지워지면(관리자 완전삭제) 그 글의 신고도 함께 지워진다(on delete cascade)
--   · 신고한 분의 기록 삭제 요청으로 users 행을 지우면 그분의 신고도 함께 지워진다(on delete cascade)
--   ⚠️ 90 을 바꾸면 index.ts BOARD_REPORT_KEEP_DAYS · privacy/index.html · app.js 개인정보 두 곳도 함께.
--      tests/board-report.test.cjs 가 「90일」 이 그 자리들에 다 있는지 본다.
--
-- ■ 기록 합치기(member_merge.sql) — 2026-10-01 같은 날 옮기기를 더했다(처음엔 신고한 계정에서 합치기가 멈췄다).
--   줄 번호·처리 상태를 지킨 채 reporter_id 만 남는 번호로. 같은 글(답글)을 둘 다 신고했으면 한 줄(unique) —
--   처리 전 줄이 옮겨 가는 쪽에만 있으면 그 줄, 아니면 남는 쪽 줄.
--   ⚠️ 이 표를 다시 만들거나 칸을 바꾸면 member_merge.sql 을 **이 파일 뒤에** 다시 돌린다(쓰기 연결 트리거가 이 표에 붙는다).

-- ① 표
create table if not exists public.board_reports (
  id           bigserial   primary key,
  post_id      bigint      not null references public.board_posts(id) on delete cascade,
  reply_id     bigint      references public.board_replies(id) on delete cascade,   -- 답글 신고일 때만
  reporter_id  uuid        not null references public.users(id) on delete cascade,  -- ⚠️ 응답에 싣지 않는다
  reason       text        not null check (reason in ('inappropriate', 'spam', 'privacy', 'other')),
  note         text        check (note is null or char_length(note) <= 200),       -- 덧붙인 말(선택)
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,                                                         -- 처리한 때(null = 아직)
  resolved_by  text,                                                                -- 처리한 쪽(지금은 'admin' 하나)
  resolution   text        check (resolution is null or resolution in ('hidden', 'kept'))  -- 숨김 · 그대로 둠
);

-- ② 한 분이 한 글(답글)을 한 번만. reply_id 가 null 이면 null 끼리 서로 달라 unique 가 안 걸리므로
--    0 으로 바꿔 묶는다(PG15 의 nulls not distinct 를 안 쓴다 — DB 판에 기대지 않으려고).
create unique index if not exists board_reports_once
  on public.board_reports (reporter_id, post_id, coalesce(reply_id, 0));
-- 관리자 목록(처리 전 것만)과 대상별 처리
create index if not exists board_reports_open
  on public.board_reports (created_at desc) where resolved_at is null;
create index if not exists board_reports_target
  on public.board_reports (post_id, reply_id);

-- ③ 잠금 — 그 자리에서 켠다(event_entries 가 이걸 빠뜨려 user_id 47건이 공개 키로 읽혔다)
alter table public.board_reports enable row level security;
revoke all on public.board_reports from public, anon, authenticated;
revoke all on sequence public.board_reports_id_seq from public, anon, authenticated;
grant all on public.board_reports to service_role;
grant usage, select on sequence public.board_reports_id_seq to service_role;

-- ④ 처리 뒤 90일이 지난 신고를 매일 지운다 — 03:40 KST(= 18:40 UTC)
--    pg_cron 이 없는 DB(개발 등)에서는 걸지 않고 알리기만 한다. 그때도 관리자가 신고 목록을 열면
--    서버(boardReports)가 같은 조건으로 지운다.
do $do$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'board-reports-purge',
      '40 18 * * *',
      $job$delete from public.board_reports where resolved_at < now() - interval '90 days'$job$
    );
    raise notice '정리 작업 board-reports-purge 를 걸었습니다(매일 03:40 KST).';
  else
    raise notice 'pg_cron 이 없어 정리 작업을 걸지 않았습니다 — 관리자 신고 목록을 열 때 서버가 지웁니다.';
  end if;
end
$do$;

-- ── 확인 ─────────────────────────────────────────────────────
-- 표와 RLS:          select relname, relrowsecurity from pg_class where relname = 'board_reports';   -- t
-- 공개 키로 안 열림:  select grantee, privilege_type from information_schema.role_table_grants
--                     where table_name = 'board_reports' and grantee in ('anon', 'authenticated');     -- 0행
-- 정리 작업:          select jobname, schedule, active from cron.job where jobname = 'board-reports-purge';
-- 운영이면 끝으로 c:\Projects\church-admin\supabase\sql\check-authenticated-exposure.sql 을 돌려 0행인지 본다.
-- 열린 신고(이름 없이): select id, post_id, reply_id, reason, note, created_at from board_reports
--                       where resolved_at is null order by created_at desc;

-- ── (선택) 신고 알림 받을 분 — 운영에서만, 사람 등록이다 ────────────
-- 신고가 들어오면 app_config `boardAdmins`(identity_key 배열)에 적힌 분의 폰으로 Web Push 가 간다
-- (그 글의 첫 신고일 때만 · 10분에 한 번까지 · 알림을 켜 둔 분에게만). 비어 있으면 알림 없이 관리자 화면에만 쌓인다.
-- pilsa_admin_notify.sql 과 같은 방식이다. 아래 주석을 풀고 이름·교구·목장을 고쳐 **운영에서만** 실행한다.
-- do $do$
-- declare keys text[];
-- begin
--   select array_agg(u.identity_key) into keys from users u
--    where (u.name, u.gu, u.mok) in ( ('담당자이름', '교구이름', '목장번호') );   -- 예: ('홍길동', '화평', '20')
--   if keys is null then raise exception '담당자를 찾지 못했습니다 — 이름·교구·목장이 users 와 글자까지 같아야 합니다.'; end if;
--   insert into app_config (key, value, updated_at) values ('boardAdmins', to_jsonb(keys), now())
--   on conflict (key) do update set value = excluded.value, updated_at = now();
--   raise notice '신고 알림 담당자 %명을 등록했습니다.', array_length(keys, 1);
-- end
-- $do$;
-- 끄려면: delete from app_config where key = 'boardAdmins';
