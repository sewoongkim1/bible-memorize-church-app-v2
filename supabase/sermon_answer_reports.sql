-- 「내게 주시는 말씀」 AI 답 알리기(🚩) — sermon_answer_reports (2026-10-01)
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키·실명을 절대 넣지 마세요.
--
-- ■ 왜: 구글 플레이 「AI 생성 콘텐츠」 정책 — "Apps that generate content using AI must contain in-app user reporting
--   or flagging features that allow users to report or flag offensive content to developers without needing to exit the app."
--   답 아래 「🚩 이 답 알리기」 → 까닭 셋 + 덧붙인 말 → 운영진이 관리자 「게시판 관리」의 「🚩 AI 답 알림」에서 본다.
--   board_reports 를 다시 쓰지 않은 까닭: 그 표는 post_id 가 필수(게시판 글을 가리킨다)라 AI 답이 들어갈 자리가 없다.
--
-- ■ 실행 순서 ⚠️ — **개발 먼저**, 그리고 **함수(api) 배포보다 먼저**(새 표에 새 액션만 얹는 경우)
--   1) 개발(ktpwthwqzgcqcrmsafdo) SQL Editor 에 이 파일 전체 → 맨 아래 「확인」
--   2) 개발에 api 배포 → 스모크
--   3) 운영(xnomlgydifiqiybervtf) SQL Editor 에 이 파일 전체 → 「확인」
--   4) 운영에 api 배포
--   함수가 먼저 나가도 500 은 안 난다 — 표가 없으면 sermonAnswerReport 가 `not-ready` 로 답하고 앱은
--   「지금은 알림을 받을 수 없어요」라고 말한다. 여러 번 실행해도 안전하다(if not exists · cron 은 같은 이름이면 덮어쓴다).
--
-- ■ 규칙 (어기면 사고)
--   · RLS 를 이 자리에서 켜고 anon·authenticated **둘 다** revoke(표·시퀀스).
--   · reporter_id(알린 분)는 **어떤 응답에도 싣지 않는다 — 관리자 목록에도**(board_reports 와 같은 규칙).
--   · 까닭(reason) 허용 목록은 **세 곳**이다 — 여기 CHECK · index.ts SERMON_REPORT_REASONS · app.js SERMON_REPORT_REASONS.
--     tests/store-review.test.cjs 가 셋이 같은지 배포 앞(tools/preflight.py)에서 맞대 본다.
--   · 답(answer)은 **서버가 캐시(sermon_ai_cache)에서 찾은 것**을 먼저 쓴다(from_cache = true). 캐시에 없을 때만
--     앱이 보낸 글을 1,200자까지 받는다 — 관리자는 from_cache 로 「서버가 실제로 준 답인지」를 가린다.
--   · 한 분이 같은 질문을 한 번만 — unique (reporter_id, md5(question)). 두 번째는 서버가 「이미」로 받는다(같은 인사).
--
-- ■ 얼마나 보관하나 — 개인정보 안내(privacy/ 1·3·4·5항 · 앱 안 두 곳)와 **같은 말**이어야 한다
--   · 처리 전: 운영진이 처리할 때까지
--   · 처리 뒤(처리 완료 · 답 지우기): **90일이 지나면 저절로 지운다** — 아래 ④ cron + 관리자가 목록을 열 때 서버가 한 번 더
--   · 알린 분의 기록 삭제 요청으로 users 행을 지우면 함께 지워진다(on delete cascade)
--   ⚠️ 90 을 바꾸면 index.ts SERMON_REPORT_KEEP_DAYS · privacy/index.html · app.js 개인정보 두 곳도 함께.
--
-- ■ 알고 있는 빈틈 — 기록 합치기(member_merge.sql): users 를 가리키는 FK 가 하나 더 생겨, 알림을 보낸 적 있는 계정을
--   「옮겨 가는 쪽」으로 합치려 하면 멈춘다(board_reports 와 같다 · 기록은 안 잃는다). 처리된 알림을 지우고 다시 한다.

-- ① 표
create table if not exists public.sermon_answer_reports (
  id           bigserial   primary key,
  reporter_id  uuid        not null references public.users(id) on delete cascade,   -- ⚠️ 응답에 싣지 않는다
  question     text        not null check (char_length(question) between 1 and 500),
  answer       text        not null check (char_length(answer) between 1 and 1200),
  from_cache   boolean     not null default false,          -- 서버 캐시에서 찾은 답인가(아니면 앱이 보낸 글)
  reason       text        not null check (reason in ('wrong', 'offensive', 'other')),
  note         text        check (note is null or char_length(note) <= 200),
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,                                  -- 처리한 때(null = 아직)
  resolution   text        check (resolution is null or resolution in ('kept', 'uncached'))  -- 그대로 둠 · 답 지움
);

-- ② 한 분이 같은 질문을 한 번만 · 관리자 목록(처리 전 것만)
create unique index if not exists sermon_answer_reports_once
  on public.sermon_answer_reports (reporter_id, md5(question));
create index if not exists sermon_answer_reports_open
  on public.sermon_answer_reports (created_at desc) where resolved_at is null;

-- ③ 잠금 — 그 자리에서 켠다
alter table public.sermon_answer_reports enable row level security;
revoke all on public.sermon_answer_reports from public, anon, authenticated;
revoke all on sequence public.sermon_answer_reports_id_seq from public, anon, authenticated;
grant all on public.sermon_answer_reports to service_role;
grant usage, select on sequence public.sermon_answer_reports_id_seq to service_role;

-- ④ 처리 뒤 90일이 지난 알림을 매일 지운다 — 03:45 KST(= 18:45 UTC)
do $do$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'sermon-answer-reports-purge',
      '45 18 * * *',
      $job$delete from public.sermon_answer_reports where resolved_at < now() - interval '90 days'$job$
    );
    raise notice '정리 작업 sermon-answer-reports-purge 를 걸었습니다(매일 03:45 KST).';
  else
    raise notice 'pg_cron 이 없어 정리 작업을 걸지 않았습니다 — 관리자 목록을 열 때 서버가 지웁니다.';
  end if;
end
$do$;

-- ── 확인 ─────────────────────────────────────────────────────
-- 표와 RLS:          select relname, relrowsecurity from pg_class where relname = 'sermon_answer_reports';   -- t
-- 공개 키로 안 열림:  select grantee, privilege_type from information_schema.role_table_grants
--                     where table_name = 'sermon_answer_reports' and grantee in ('anon', 'authenticated');     -- 0행
-- 정리 작업:          select jobname, schedule, active from cron.job where jobname = 'sermon-answer-reports-purge';
-- 운영이면 끝으로 c:\Projects\church-admin\supabase\sql\check-authenticated-exposure.sql 을 돌려 0행인지 본다.
-- 열린 알림(이름 없이): select id, reason, left(question, 40), created_at from sermon_answer_reports
--                       where resolved_at is null order by created_at desc;
