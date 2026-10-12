-- SQL 적용 기록 — 「이 SQL 파일의 이 판을 이 DB 에 넣었나」(2026-10-12)
--
-- 왜: SQL 은 손으로 SQL Editor·`supabase db query` 에 붓는다. 여러 세션이 병렬로 일하면
--     「개발에는 넣었는데 운영에는 안 넣었다」·「옛 판을 넣었다」·「순서가 바뀌었다」가 조용히 생긴다.
--     그래서 넣은 뒤 파일 이름과 내용의 지문(sha256)을 여기 한 줄 남긴다 → `python tools/sql-applied.py status`.
--
-- 쓰는 법: docs/notes/sql-applied.md
--   python tools/sql-applied.py record supabase/<파일>.sql --dev|--prod [--note "…"]
--   python tools/sql-applied.py status --dev|--prod
--
-- sha256 은 줄 끝을 LF 로 맞춘 내용의 지문이다(윈도 체크아웃의 CRLF 때문에 「바뀜」이 되지 않게 — 도구가 셈한다).
-- 반복 실행 안전. 이 파일을 돌린 뒤 이것도 record 한다.
--
-- ⚠️ 사람 정보는 없지만 앱이 읽을 일도 없다 — RLS 를 켜고 정책 없이 둔다(anon·authenticated 둘 다 막음).
--    2026-09-28 부터 운영의 authenticated = 카카오 계정만 있으면 누구나다(CLAUDE.md 「보안」).

create table if not exists public.schema_applied (
  file        text        not null,                 -- 저장소 기준 경로(예: supabase/duty.sql)
  sha256      text        not null,                 -- 넣은 판의 지문(LF 로 맞춘 내용)
  applied_at  timestamptz not null default now(),   -- 마지막으로 넣은(기록한) 때
  applied_by  text,                                 -- 누가(git user.name)
  note        text,                                 -- 덧붙임(가지·까닭 등)
  primary key (file, sha256)
);

alter table public.schema_applied enable row level security;
revoke all on table public.schema_applied from anon, authenticated;

comment on table public.schema_applied is
  'SQL 적용 기록 — tools/sql-applied.py 가 쓰고 읽는다. 앱·공개 키로는 열리지 않는다(docs/notes/sql-applied.md).';
