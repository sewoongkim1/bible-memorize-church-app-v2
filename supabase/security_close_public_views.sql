-- 익명 키로 새어 나가던 것을 막는다 (2026-08-25)
--
-- ■ 무엇이 열려 있었나 (공개 키 sb_publishable_... 로 실제 확인)
--     v_ranking_all    133행 — user_id · 이름 · 교구 · 목장 · 부서 · 학년   ← 심각
--     event_entries     47행 — user_id                                      ← 심각
--     v_verse_status    34행 — 구절별 인원 합계(개인정보는 없음)
--   나머지 테이블(users·progress·pilsa_orders·push_subscriptions…)은 RLS가 막고 있었다.
--
-- ■ 왜 심각한가
--   Edge Function `api`는 --no-verify-jwt 로 돌아가 클라이언트가 준 user_id를 그대로 믿는다.
--   그래서 남의 user_id 하나면 그 사람 행세가 된다 — 게시판 글쓰기, 진도 저장,
--   순위 응원, 필사 신청까지. 공개 키는 앱 코드 안에 있어 누구나 가진 것이나 같다.
--
-- ■ 왜 뷰가 뚫려 있었나
--   RLS는 '테이블'에 걸린다. 뷰는 만든 사람(postgres) 권한으로 실행되어 밑 테이블의
--   RLS를 지나간다. 그런데 anon·authenticated에게 SELECT 권한이 남아 있어
--   PostgREST가 그대로 내보냈다. Supabase 화면의 UNRESTRICTED 표시가 그 뜻이다.
--
-- ■ 고쳐도 앱은 멀쩡하다
--   클라이언트는 REST를 직접 부르지 않는다(전부 Edge Function 경유).
--   Edge Function은 SERVICE_ROLE_KEY라 RLS·권한을 지나간다.
--   두 뷰는 세 앱 어디에서도 쓰지 않는다(schema.sql의 '예시 뷰'가 남은 것).
--
-- Supabase → SQL Editor 에서 1 → 2 → 3 순서로 실행한다.


-- ════════════════════════════════════════════════════════════
-- 1) 진단 — 지금 무엇이 열려 있나
--    (아래 조치는 셋만 다룬다. 여기서 다른 것이 더 나오면 같은 방식으로 막을 것)
-- ════════════════════════════════════════════════════════════

-- 1-a. anon 또는 authenticated 가 읽을 수 있는 public 자원
select c.relname                                as 이름,
       case c.relkind when 'v' then '뷰'
                      when 'm' then '구체화뷰'
                      else '테이블' end          as 종류,
       string_agg(distinct g.grantee, ', ')     as 읽을_수_있는_역할
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join information_schema.role_table_grants g
       on g.table_schema = n.nspname and g.table_name = c.relname
 where n.nspname = 'public'
   and g.privilege_type = 'SELECT'
   and g.grantee in ('anon', 'authenticated')
 group by c.relname, c.relkind
 order by c.relkind desc, c.relname;

-- 1-b. RLS가 꺼진 테이블 (뷰는 RLS 대상이 아니라 여기 안 나온다)
select relname as 이름, relrowsecurity as rls_켜짐
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
 order by relname;


-- ════════════════════════════════════════════════════════════
-- 2) 조치
-- ════════════════════════════════════════════════════════════

-- 2-a. 이벤트 응모 — RLS를 켠다. 정책을 하나도 두지 않으므로 anon은 아무것도 못 읽는다.
--      서버는 service_role이라 RLS를 지나가므로 응모·조회 모두 그대로 된다.
alter table public.event_entries enable row level security;

-- 2-b. 통계용 뷰 둘 — 익명·로그인 역할에게서 권한을 거둔다.
--      Edge Function(service_role)은 영향을 받지 않는다.
revoke all on public.v_ranking_all  from anon, authenticated;
revoke all on public.v_verse_status from anon, authenticated;

-- 2-c. 한 겹 더 — 누군가 나중에 권한을 다시 주더라도 이번엔 RLS가 걸리도록,
--      뷰를 '부르는 사람 권한으로' 실행하게 바꾼다(PostgreSQL 15+).
--      2-b만으로도 지금은 막히지만, 실수 한 번으로 다시 뚫리지 않게 하는 잠금이다.
alter view public.v_ranking_all  set (security_invoker = on);
alter view public.v_verse_status set (security_invoker = on);

-- ※ 이 두 뷰는 세 앱 어디에서도 쓰지 않는다. 아예 지우고 싶으면 아래를 대신 실행해도 된다.
--   (정의는 supabase/schema.sql에 남아 있어 언제든 되살릴 수 있다)
-- drop view if exists public.v_ranking_all;
-- drop view if exists public.v_verse_status;


-- ════════════════════════════════════════════════════════════
-- 3) 재확인 — 1)을 다시 실행한다.
--    v_ranking_all · v_verse_status 가 1-a 목록에서 사라지고,
--    event_entries 가 1-b 목록에서 사라져야 한다.
-- ════════════════════════════════════════════════════════════
