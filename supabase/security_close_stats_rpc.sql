-- ============================================================
-- 통계 RPC 두 개가 공개 키(anon)에 열려 있던 것을 닫는다  (2026-09-23)
--   실행: Supabase SQL Editor 에 통째로 붙여넣고 RUN
--   ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키를 절대 넣지 마세요.
--
-- ■ 무슨 일이 있었나
--   `stats-rpc.sql`(105-112줄)은 v2_stats · v2_participants · v2_verse_stats 를
--   일부러 회수해 두었다. 주석까지 달려 있다 —
--     「이 함수들은 참여자 실명 등 개인정보를 집계하므로 외부 직접 호출을 반드시 차단」
--
--   그런데 2026-08-27 에 관리자 통계에 '카드' 열을 붙인 `stats-rpc-card.sql` 이
--   v2_stats(18줄)와 v2_participants(63줄)를 **`drop function` 한 뒤 다시 만들면서**
--   revoke·grant 를 **한 줄도 안 넣었다**(그 파일에 revoke/grant 0건).
--
--   ⚠️ **Postgres 는 `drop function` 하면 ACL 이 함께 사라지고, 새로 만들면
--      PUBLIC 에 EXECUTE 가 기본으로 붙는다.** 그래서 그날 이후 두 함수가 열렸다.
--      (`create or replace` 였다면 ACL 이 남아 안 열렸다 — 그래서 아무도 못 알아챘다.)
--
-- ■ 얼마나 나쁜가
--   v2_participants 는 `returns table(gubun, sosok, sebu, **name**, typing, voice,
--   card, total, days, is_new)` — **성도님 실명 · 교구 · 목장/부서**가 그대로 나온다.
--   게다가 `security definer` 라 밑 표의 RLS 도 지나간다.
--   공개 anon 키는 앱 JS 안에 있으니 누구나 가진 것이나 같다 →
--   `POST {URL}/rest/v1/rpc/v2_participants` 한 번이면 명단 전체가 나갔다.
--
--   2026-09-23 운영 실측(pg_proc.proacl):
--     v2_participants  =X/postgres | postgres=X | anon=X | authenticated=X | service_role=X   ← 열림
--     v2_stats         =X/postgres | postgres=X | anon=X | authenticated=X | service_role=X   ← 열림
--     v2_verse_stats · v2_ranking · v2_gu_ranking · v2_mydays · v2_blessing_log
--     · v2_activity_drift                                                                     ← 막혀 있었음
--   즉 `stats-rpc-card.sql` 이 drop 한 **딱 그 두 개만** 열려 있었다. 원인이 분명하다.
--
-- ■ 이 파일이 하는 일
--   권한만 회수한다. **함수 본문도 데이터도 건드리지 않는다.** 여러 번 돌려도 안전하다.
--   관리자 통계 화면은 Edge Function 이 service_role 로 부르므로 영향이 없다.
--
-- ■ 재발 방지 — 이 파일만으로는 부족하다
--   `stats-rpc-card.sql` 끝에도 같은 네 줄을 넣어 두었다. 안 그러면 그 파일을
--   **다시 돌리는 순간 구멍이 다시 열린다**(새 개발 DB 를 세울 때가 바로 그 순간이다).
--
-- ⚠️ **앞으로의 규칙: 함수를 `drop` 했으면 revoke·grant 를 같은 파일에서 되살린다.**
--    뷰에 대해서는 CLAUDE.md 「보안 · 새어 나가는 길」이 이미 경고하고 있었는데,
--    함수에도 똑같이 해당한다는 것이 이번에 드러났다.
-- ============================================================

-- 1) 회수 — public/anon/authenticated 에서 실행 권한을 뺀다
revoke all on function v2_stats(text, text)                 from public, anon, authenticated;
revoke all on function v2_participants(text, text, text)    from public, anon, authenticated;
revoke all on function v2_verse_stats(text, text)           from public, anon, authenticated;  -- 이미 막혀 있지만 방어적으로

-- 2) 부여 — Edge Function(service_role)만 부를 수 있게
grant execute on function v2_stats(text, text)              to service_role;
grant execute on function v2_participants(text, text, text) to service_role;
grant execute on function v2_verse_stats(text, text)        to service_role;

-- 3) 확인 — 「열려 있음(anon)」이 하나도 없어야 한다
--    (public 에 남은 기본 권한도 함께 본다 — proacl 이 null 이면 그것도 PUBLIC 실행 가능이다)
select p.proname,
       pg_get_function_identity_arguments(p.oid) as args,
       case
         when p.proacl is null                                 then '⚠ PUBLIC 기본(=누구나 실행)'
         when array_to_string(p.proacl, ' ') like '%anon=%'     then '⚠ 열려 있음(anon)'
         when array_to_string(p.proacl, ' ') like '=X/%'        then '⚠ PUBLIC 에 EXECUTE 남음'
         else '✅ 막힘'
       end as 상태,
       array_to_string(p.proacl, ' | ') as acl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f' and p.proname like 'v2\_%'
order by 3 desc, 1;
