-- 화면 오류 모으기 — client_errors (2026-10-12 · 문 닫힌 채)
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키·실명을 절대 넣지 마세요.
-- 자세한 것: docs/notes/client-errors.md (켜는 차례 · 방침에 넣을 문장 안)
--
-- ■ 왜: 테스터가 친구 한 명뿐이라 성도님 폰에서 나는 화면(JS) 오류를 아무도 모른다.
--   앱(app.js 「화면 오류 모으기」)이 window 의 error·unhandledrejection 을 받아 api 액션 clientError 로 보내고,
--   서버는 「같은 날 · 같은 오류」를 한 줄로 묶어 개수(cnt)만 올린다.
--
-- ■ 문(게이트) — app_config 의 errorLogOn 이 **true 하나**일 때만 연다. 없거나 false·"true"(글자)면 닫힘.
--   앱도 문이 열린 것을 확인한 뒤에만 보내고, 서버도 닫혔으면 받지 않는다(api clientError).
--   ⚠️ 문을 열기 전에 개인정보 안내 세 자리(privacy/ · 앱 안 renderPrivacyInfo · renderHelp)를 먼저 — docs/notes/client-errors.md
--
-- ■ 모으는 것 / 모으지 않는 것
--   모은다: 앱 판(build) · 껍데기(shell: web·play·ios·other) · 화면(screen: 오류가 난 render 함수 이름) ·
--           오류 첫 줄 200자(msg — 앱과 서버가 두 번 거른다: 번호·주소의 ? 뒤·전자우편·긴 숫자를 지운다) ·
--           파일:줄(src — 우리 파일만, 남의 주소는 other) · 브라우저 계열(browser: 「android-chrome」 꼴) · 날짜(KST)
--   모으지 않는다: user_id · 이름 · 소속 · 전체 스택 · 주소의 ? 뒤(딥링크에 개인 값이 섞인다) · UA 원문 · 기기 토큰 · IP
--   ⚠️ 그래서 이 표에는 users 를 가리키는 칸이 없다 — 기록 합치기(member_merge.sql)와 상관없다. 칸을 더할 때 이 원칙을 지킬 것.
--
-- ■ 크기 — 하루 500줄(서로 다른 오류)까지. 넘으면 새 줄은 버리고 이미 있는 줄의 개수만 올린다.
--   한 줄의 개수는 1,000,000 에서 멈춘다. 공개 키만 있으면 누구나 부를 수 있는 액션이라 둔 한도다.
--
-- ■ 보관 90일 — 매일 03:45 KST 에 지운다(④ cron). 새 줄을 넣을 때도 함수가 한 번 더 지운다(cron 없는 DB 에서도).
--   ⚠️ 90 을 바꾸면 docs/notes/client-errors.md 의 방침 문장 안도 함께.
--
-- ■ 실행 순서 — **개발 먼저**, 그리고 **api 배포보다 먼저**(새 표에 새 액션만 얹는 경우 — 빈 표는 아무도 안 읽는다).
--   1) 개발(ktpwthwqzgcqcrmsafdo)에 이 파일 → 맨 아래 「확인」
--   2) 개발에 api(python tools/deploy-fn.py api --dev …) → docs/notes/client-errors.md 「개발에서 확인」
--   3) 운영(xnomlgydifiqiybervtf)에 이 파일 → 4) 운영에 api → 5) 방침 세 자리 → 6) 친구가 정한 날 문 열기
--   api 가 표보다 먼저 나가도 500 은 안 난다 — 문이 닫혀 있으면 표를 보지도 않고, 열려 있어도 「no-table」로 조용히 넘긴다.
--   여러 번 돌려도 안전하다(if not exists · create or replace · cron 은 같은 이름이면 덮어쓴다).
--
-- ■ 되돌리기 — 문만 닫으면 된다(app_config errorLogOn 을 false 로 · 줄을 지워도 같다).
--   통째로 걷으려면: select cron.unschedule('client-errors-purge'); drop function public.v2_client_error(text,text,text,text,text,text); drop table public.client_errors;

-- ─────────────────────────────────────────────────────────────
-- 보는 법 (친구가 SQL Editor 에서 · 읽기 전용) — 관리 화면은 만들지 않는다(관리 기능은 교회 어드민으로 옮기는 중)
-- ─────────────────────────────────────────────────────────────
-- ⓐ 최근 7일 — 판 · 화면별 오류 수 (cnt = 그 오류가 난 횟수의 합 · 줄 = 서로 다른 오류 수)
--    ⚠️ cnt 는 「몇 분이」가 아니다 — 한 기기는 같은 오류를 하루 한 번만 보내니 「그날 그 오류를 겪은 기기 수」에 가깝지만,
--       앱 저장소를 못 쓰는 기기(사생활 보호 창 등)는 한 번 열 때마다 다시 보낸다.
--   select build as 판, shell as 껍데기, coalesce(nullif(screen, ''), '(모름)') as 화면,
--          count(*) as 서로_다른_오류, sum(cnt) as 횟수, max(last_at) as 마지막
--   from public.client_errors where day >= (now() at time zone 'Asia/Seoul')::date - 6
--   group by 1, 2, 3 order by 횟수 desc limit 50;
--
-- ⓑ 최근 7일 — 많이 난 오류 그대로
--   select day, build, shell, screen, src, browser, cnt, msg
--   from public.client_errors where day >= (now() at time zone 'Asia/Seoul')::date - 6
--   order by cnt desc, day desc limit 50;
--
-- ⓒ 새 판에서만 나는 오류(이번 판이 만든 것) — 판 이름을 바꿔 넣는다
--   select src, msg, sum(cnt) from public.client_errors c
--   where build = '20261012d'
--     and not exists (select 1 from public.client_errors o where o.build < c.build and o.msg = c.msg and o.src = c.src)
--   group by src, msg order by 3 desc;

-- ① 표
create table if not exists public.client_errors (
  day      date        not null default ((now() at time zone 'Asia/Seoul')::date),   -- 한국 날짜
  sig      text        not null,                                                       -- 아래 여섯 칸의 md5 — 같은 날 같은 오류 = 한 줄
  build    text        not null default '' check (char_length(build)   <= 16),
  shell    text        not null default '' check (char_length(shell)   <= 8),
  screen   text        not null default '' check (char_length(screen)  <= 40),
  msg      text        not null default '' check (char_length(msg)     <= 200),
  src      text        not null default '' check (char_length(src)     <= 80),
  browser  text        not null default '' check (char_length(browser) <= 24),
  cnt      int         not null default 1,
  first_at timestamptz not null default now(),
  last_at  timestamptz not null default now(),
  primary key (day, sig)
);
-- 값 목록(shell·browser)은 CHECK 로 묶지 않는다 — 목록이 세 곳이 되면 새 값에서 저장만 조용히 막힌다.
--   거르는 곳은 api(client-errors.ts 의 cerrClean) 한 곳이다. 길이만 여기서 한 번 더 막는다.

-- ② 잠금 — 그 자리에서 켠다(event_entries 가 이걸 빠뜨려 user_id 47건이 공개 키로 읽혔다)
alter table public.client_errors enable row level security;
revoke all on public.client_errors from public, anon, authenticated;
grant all on public.client_errors to service_role;

create index if not exists client_errors_day_idx on public.client_errors (day);

-- ③ 한 건 받기 — 'more'(있던 줄 개수만) · 'new'(새 줄) · 'cap'(오늘 500줄이 차서 버림)
create or replace function public.v2_client_error(
  p_build text, p_shell text, p_screen text, p_msg text, p_src text, p_browser text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  d date := (now() at time zone 'Asia/Seoul')::date;
  b text := left(coalesce(p_build, ''), 16);
  sh text := left(coalesce(p_shell, ''), 8);
  sc text := left(coalesce(p_screen, ''), 40);
  m text := left(coalesce(p_msg, ''), 200);
  s text := left(coalesce(p_src, ''), 80);
  br text := left(coalesce(p_browser, ''), 24);
  k text;
begin
  k := md5(concat_ws(chr(31), b, sh, sc, m, s, br));
  update public.client_errors set cnt = least(cnt + 1, 1000000), last_at = now()
   where day = d and sig = k;
  if found then return 'more'; end if;
  if (select count(*) from public.client_errors where day = d) >= 500 then return 'cap'; end if;
  delete from public.client_errors where day < d - 90;   -- 보관 90일 — cron 이 없는 DB 에서도
  insert into public.client_errors (day, sig, build, shell, screen, msg, src, browser)
  values (d, k, b, sh, sc, m, s, br)
  on conflict (day, sig) do update set cnt = least(public.client_errors.cnt + 1, 1000000), last_at = now();
  return 'new';
end
$$;
revoke all on function public.v2_client_error(text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.v2_client_error(text, text, text, text, text, text) to service_role;

-- ④ 90일이 지난 줄을 매일 지운다 — 03:45 KST(= 18:45 UTC · 게시판 신고 정리 18:40 과 겹치지 않게)
do $do$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'client-errors-purge',
      '45 18 * * *',
      $job$delete from public.client_errors where day < (now() at time zone 'Asia/Seoul')::date - 90$job$
    );
    raise notice '정리 작업 client-errors-purge 를 걸었습니다(매일 03:45 KST).';
  else
    raise notice 'pg_cron 이 없어 정리 작업을 걸지 않았습니다 — 새 줄을 넣을 때 함수가 지웁니다.';
  end if;
end
$do$;

-- ── 확인 ─────────────────────────────────────────────────────
-- 표와 RLS:          select relname, relrowsecurity from pg_class where relname = 'client_errors';   -- t
-- 공개 키로 안 열림:  select grantee, privilege_type from information_schema.role_table_grants
--                     where table_name = 'client_errors' and grantee in ('anon', 'authenticated');     -- 0행
-- 정리 작업:          select jobname, schedule, active from cron.job where jobname = 'client-errors-purge';
-- 문:                select value from app_config where key = 'errorLogOn';   -- 없거나 false = 닫힘
-- 운영이면 끝으로 c:\Projects\church-admin\supabase\sql\check-authenticated-exposure.sql 을 돌려 0행인지 본다.
