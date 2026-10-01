# 교회 어드민 — 교인명부 「자세히」 창 사역·성경필사 탭 · 잇기 표 · 사역신청 번호 보관 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 교인명부 「자세히」 창의 오른쪽 칸에 탭 「교적 · 🤝 사역 N · ✍️ 성경필사 N」을 두어, 그분과 **교인ID 로 이어진** 사역신청(모든 해)·지난 해 사역 이력(b6 표)·성경필사 참여를 보이고, 이름이 같은데 아직 안 이어진 기록은 「이분 것」으로 사람이 잇게 한다. 사역신청 휴대폰 번호는 결정(임명·취소) 때 지우지 않고 「결정된 신청 번호 지우기」 단추와 결정 뒤 180일 자동 작업으로 지운다.

**Architecture:** 앱 표(`ministry_orders`·`event_signups`)는 손대지 않고, 교회 어드민 쪽 새 표 `people_links`(SQL 006 · `(kind,row_id)` → 교인ID)에 잇는다. 자동 잇기 규칙·탭 칸 지도는 순수 모듈 `people-links.ts`(서버·Node 시험이 같은 파일). 자동 쓰기는 SQL 함수 `people_links_auto()` 하나로만 해 `manual`·`none` 을 DB 가 막는다. 서버 액션 넷(`peopleHistory`·`peopleLink`·`peopleLinkSync`·`ministryPhoneClear`) + `peoplePerson` 응답에 `history`. 화면은 순수 `person-history.js`(HTML) + 손잡이 `person-tabs.js`(DOM) + `person-detail.js`·`search.js` 몇 줄. 번호 180일은 SQL 007(함수 + pg_cron).

**Tech Stack:** 지금과 같음 — 빌드 없는 ES 모듈 화면 · Deno Edge Function(`npm:@supabase/supabase-js@2.117.2`) · Node `node --experimental-strip-types --test` · Postgres(pg_cron — 운영에만 있다) · 화면 재기는 Python Playwright(이 PC 에 있다 · CI 에서는 안 돈다).

**설계:** `docs/superpowers/specs/2026-10-01-person-history-tabs-design.md`(v2 저장소 · 친구 승인) — **요구의 원본.** 함께: b6 「사역 이력」 설계 `docs/superpowers/specs/2026-10-01-church-admin-ministry-history-design.md` §2·§7·§8 · b6 계획 `docs/superpowers/plans/2026-10-01-church-admin-ministry-history.md`.
**코드는 `c:\Projects\church-admin` 의 worktree `.worktrees/person-history`(가지 `person-history`)** 에 쓴다 — 아래 경로는 모두 그 worktree 기준(Task 9·11 의 v2 파일만 v2 저장소 기준).

## Global Constraints

- **설계의 값 그대로:**
  - 번호 자동 지우기 **180일** · 함수 `ministry_phone_expire()`(security definer · 지운 수를 돌려줌) · 예약 `cron.schedule('ministry-phone-expire', '17 18 * * *', …)`(= 매일 03:17 KST · pg_cron 은 UTC).
  - 표 `people_links`: `kind`(`order`=ministry_orders · `signup`=event_signups) · `row_id` · `person_id`(null = 못 맞춤/이분 아님) · `link_how`(`auto`·`manual`·`none`) · `match_basis`(`맞음`·`번호`·`사람이 이음`) · `import_id` · `linked_by` · `linked_at` · `updated_at` · PK `(kind,row_id)` · FK 없음(앱 줄·명부가 지워져도 남는다).
  - 액션·역할: `peoplePerson`(넓힘 · directory) · `peopleHistory`(directory) · `peopleLink`(directory) · `peopleLinkSync`(super) · `ministryPhoneClear`(ministry).
  - 기록: `people.view` 는 지금처럼 한 줄(탭 때문에 늘리지 않는다) · `peopleHistory` 는 기록 없음 · `people.link {kind,row,how}` · `people.linksync`(수만) · `ministry.phoneclear {count}` · 사역 이력 잇기는 `history.link`(이름·교인ID 없이 · Task 10).
  - **응답에 싣지 않는 칸: `user_id`·`ident_key`·`memo`·`phone`·`answers`·`note`**(이력 응답 전부 · 시험이 키 집합을 대조).
  - 자동 잇기는 「맞음」(같은 소속 한 분) 또는 (사역만) 「번호가 맞는 분 한 분」뿐 — **「이름이 명부에 한 분뿐」만으로는 잇지 않는다.**
  - **`manual`·`none` 은 자동이 절대 덮지 않는다** — 자동 쓰기는 `people_links_auto()`(그 안의 `where link_how='auto'`)로만, 사람의 쓰기는 `peopleLink` 로만.
  - 탭 숫자 = 이분과 이어진 기록 수(`person_id` 가 이분이고 `link_how` auto·manual + 사역 이력 줄). 초안(draft) 회차는 넣지 않는다. 이력으로 넘긴 신청(`ministry_history.order_id`)은 신청 쪽으로 읽지 않는다.
- **화면:** PC 1366×657 무스크롤(창 높이는 왼쪽 단·교적 칸이 정하고 사역·성경필사 칸 안만 스크롤) · 폰 390·320 가로 넘침 0 · 시스템 창(`alert`·`confirm`·`<select>`) 금지 — `dialog`/`toast`/`picker.js` 만 · **창 위에 창을 띄우지 않는다**(「풀기」 확인은 그 줄 안에서) · 새 단추에 `data-v`·`data-fam`·`data-fam-all` 금지(`ui.js dialog` 가 `data-v` 를 닫기로, `search.js`·`person-popup.js` 가 `data-fam` 을 가족으로 읽는다) · 줄바꿈 글자를 html 에 넣지 않는다 · 모든 값 `esc`.
- **새 액션 = `authz.ts` `ACTION_ROLES` + `index.ts` `switch` case + `tests/server.dev.test.mjs` `PROBE` — 셋 다.** `tests/authz.test.mjs` 의 역할별 액션 목록(정확 대조)도 함께.
- **개발 먼저.** 개발 `ktpwthwqzgcqcrmsafdo` · 운영 `xnomlgydifiqiybervtf` 는 **Task 11 에서 친구 허락 뒤에만.** SQL 은 `supabase --workdir ~/.church-admin/supa-dev db query --linked -f <절대 경로>`(저장소 루트 link 금지 · 한글이 든 SQL 은 파일로만 — 명령줄 한글은 깨진다). 개발인지 먼저: `select count(*) from users` 가 **수십**이면 개발(2026-10-01 38), **사백이 넘으면 운영 — 멈춘다.**
- **푸시 = 운영 화면.** Task 1~10 은 **커밋만.** 푸시는 Task 11 에서 운영 서버·SQL 이 끝난 뒤.
- **개발 함수는 한 벌뿐이다** — b6(사역 이력)·e5(성경필사) 세션도 같은 개발 함수를 배포한다. 개발에 배포하기 전 `git merge main --no-edit`(다른 세션이 main 에 넣은 것을 빠뜨리지 않게 · 충돌이 나면 멈춘다). 시험이 남의 액션 PROBE 로 깨지면 그쪽 가지가 먼저 배포된 것이다 — 고치지 말고 알린다.
- 운영 함수 배포는 **작업 트리 전체**가 나간다 — 배포 전 `git status --short supabase/functions` 가 비어 있어야 한다.
- **진짜 교인 이름·번호 금지** — 시험·시드는 `홍길동`·`ca-test-…`·가짜 명부(`fake_people.py`)만. 번호는 글자로 적지 않고 만든다(명단 검사 `tools/leak-scan.mjs` 가 파일의 번호 수를 센다).
- **시험·시드가 넣는 신청 줄(`ministry_orders.user_id`)은 진짜 `users` 줄의 uuid 다** — 칸은 text 라 `ca-test-…` 같은 글자도 들어가지만, 신청 현황(`ministryList`)이 그 해 신청 줄 전부의 `user_id` 로 `push_subscriptions.in("user_id", …)`(uuid)를 묻고, 이름·소속이 빈 줄은 `users.in("id", …)`(uuid)를 물어 **22P02 → 500** 이 된다(개발 DB 는 한 벌 — 그 줄이 남아 있는 동안 **모든 세션의** 📋 신청 현황이 깨진다). 기존 신청 현황 시험(`minTestUserId`)처럼 `users` 한 줄을 만들어 그 id 를 쓰고, 지울 때는 신청 → users 차례. 007 시험 줄처럼 앱 계정이 필요 없으면 **그 해가 아닌 해(2000)** 에 이름·소속을 채워 넣는다.
- 옛 성경암송 관리 화면·`api` 담당자용 사역 액션은 얼림 — 손대지 않는다(그쪽은 결정 때 바로 지운다 · 더 엄격하니 둔다).
- `index.ts` 의 기존 import 줄은 고치지 않고 **새 줄로** 더한다(이미 들인 이름을 다시 적으면 두 번 선언 = 배포 실패). 줄 번호는 다른 세션 때문에 움직인다 — 아래 「바꾼다」는 **함수 이름과 원래 글자**로 찾는다.
- 커밋은 경로를 적어서(`git add <경로>`) · 커밋 끝에 `Co-Authored-By:` 한 줄 — 아래 커밋 명령은 모두 `-m "<제목>" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"` 꼴이다(다른 모델이 일하면 그 이름으로 바꾼다).
- **worktree 에는 `.superpowers/sdd/.gitignore` 가 따라오지 않는다** — 원본 체크아웃의 그 파일(`*`)은 추적되지 않는 파일이고 공용 `.git/info/exclude` 에는 `.worktrees/` 뿐이다. 그래서 Task 1 Step 1 이 worktree 안에 같은 파일을 만든다(그래야 `.superpowers/sdd/person-history/` 의 시험 SQL·하네스가 `git status` 에 `??` 로 뜨지 않는다).

## 파일 구조

| 파일 | 만듦/고침 | 맡는 것 |
|---|---|---|
| `supabase/sql/006_people_links.sql` | 만듦 | 잇기 표 · 색인 · RLS · 자동 쓰기 함수 `people_links_auto(jsonb)` |
| `supabase/sql/007_ministry_phone_expire.sql` | 만듦 | `ministry_phone_expire()` · pg_cron 예약(있을 때만) |
| `supabase/functions/church-admin/people-links.ts` | 만듦 | 순수: `autoLink`·잇기 판정(`needsAuto`·`phoneLinkKept`)·`orderAutoRecs`/`signupAutoRecs`·`syncCounts`·탭 칸 지도 `historyTabs`·`unlinkedRows`·`parseLink`·`linkPatch`·`unlinkRec`·`missingTable` |
| `supabase/functions/church-admin/ministry.ts` | 고침 | `statusPatch` 가 번호를 지우지 않는다 · `DECIDED` 내보냄 |
| `supabase/functions/church-admin/authz.ts` | 고침 | 액션 넷 |
| `supabase/functions/church-admin/index.ts` | 고침 | 그때그때 잇기 · `peoplePerson` history · 액션 넷 · 종이 명단 번호 |
| `js/menus/people/person-history.js` | 만듦 | 순수: 탭·줄·「아직 안 이어진 기록」 HTML |
| `js/menus/people/person-tabs.js` | 만듦 | DOM: 탭 바꾸기·불러오기·잇기/풀기/이분 아님 · `detailTab()` |
| `js/menus/people/person-detail.js` · `search.js` | 고침 | 오른쪽 칸에 탭(history 가 있을 때만) · 탭을 넘기는 길 |
| `js/menus/bibleevent/person-popup.js` | 고침 | 가족으로 넘어갈 때 탭 그대로 |
| `js/menus/ministry/status-logic.js` · `status.js` | 고침 | 「📵 결정된 신청 번호 지우기(N건)」 |
| `js/menus/people/stats-logic.js` · `stats.js` | 고침 | 「🔗 기록 잇기 맞추기」(총괄만) |
| `js/menus/system/audit.js` · `js/core/ui.js` | 고침 | 기록 이름 셋 · 오류 문구 넷 |
| `css/admin.css` | 고침 | `.dlg.pd` 탭·이력 줄 |
| `tests/people-links.test.mjs` · `tests/person-history.test.mjs` | 만듦 | 순수 시험 |
| `tests/ministry.test.mjs` · `authz.test.mjs` · `audit.test.mjs` · `ui.test.mjs` · `status-logic.test.mjs` · `people-stats.test.mjs` · `server.dev.test.mjs` | 고침 | 시험 |
| `tests/person-detail.test.mjs` | **그대로**(고치지 않음) | 기존 시험이 그대로 통과하는지만 본다(Task 6 Step 2·5) — `personDetailHtml` 의 탭 시험은 `tests/person-history.test.mjs` 에 |
| `tools/people/fake_people.py` · `tests/seed-person-history-dev.mjs` | 고침/만듦 | 가짜 명부 동명이인 · 화면 확인용 개발 시드 |
| `privacy.html` · `CLAUDE.md` | 고침 | 안내 6·7번 · 교인명부 절 |
| (v2) `privacy/index.html` · `app.js` · `CLAUDE.md` | 고침 | 번호 문구(Task 11 · 배포 날) · 지도 한 줄 |

---

### Task 1: 작업 가지 · 잇기 표(SQL 006) · 번호 180일(SQL 007) — 개발에 반영

**Files:**
- Create: `supabase/sql/006_people_links.sql`, `supabase/sql/007_ministry_phone_expire.sql`
- Create(커밋 안 함 · Step 1 이 만드는 `.superpowers/sdd/.gitignore`(`*`)가 막는다): `.superpowers/sdd/.gitignore`, `.superpowers/sdd/person-history/007-try.sql`

**Interfaces:**
- Produces: 표 `people_links`(칸은 Global Constraints 그대로) · 색인 `people_links_person_idx` · 함수 `people_links_auto(p_rows jsonb) returns int`(받는 줄 `[{kind,row_id,person_id,match_basis,import_id}]` · 고친/넣은 줄 수) · 함수 `ministry_phone_expire() returns int` · (운영만) cron job `ministry-phone-expire`.

- [ ] **Step 1: worktree 를 만든다**

```bash
cd /c/Projects/church-admin
git status --short            # 「?? Data/」(b6 의 엑셀 — 건드리지 않는다) 말고는 비어 있어야 한다
git worktree add .worktrees/person-history -b person-history main
cd .worktrees/person-history && git log --oneline -1 && git config core.hooksPath
# 진행 기록·시험 SQL·하네스 폴더를 git 이 안 보게 — 원본의 .superpowers/sdd/.gitignore 는 추적되지 않아 worktree 에 안 따라온다
mkdir -p .superpowers/sdd && printf '*\n' > .superpowers/sdd/.gitignore
git status --short
```
Expected: main 의 마지막 커밋 한 줄 · `.githooks` · 마지막 `git status --short` 는 **아무것도 없음**(`?? .superpowers/` 가 뜨면 `.gitignore` 가 안 만들어진 것 — 다시 만든다).

- [ ] **Step 2: `supabase/sql/006_people_links.sql` 을 쓴다**

```sql
-- 교회 어드민 — 기록과 교인을 잇는 표(잇기 표 · 2026-10-01)
--   설계: bible-memorize-church-app-v2 docs/superpowers/specs/2026-10-01-person-history-tabs-design.md §2.1 · §3
-- ⚠️ 개발(ktpwthwqzgcqcrmsafdo) 먼저, 그다음 운영(xnomlgydifiqiybervtf · 친구 허락 뒤 · 계획 Task 11).
-- ⚠️ 서버(church-admin 함수의 service role)만 읽고 쓴다 — RLS 켜고 정책 없음 · anon·authenticated 권한 뺌.
--    운영은 카카오 로그인이 켜져 있다(authenticated = 카카오 계정만 있으면 누구나) — TO authenticated 로 열지 않는다.
-- ⚠️ 앱 표(ministry_orders·event_signups)에 칸을 더하지 않는다 — 이 표가 그 줄 id 를 가리킨다(FK 없음: 앱 줄·명부가 지워져도 남는다).
-- link_how 는 b6 「사역 이력」(ministry_history)과 같은 말: auto(규칙이 정함 · 다시 맞추기가 바꾼다) · manual(사람이 「이분 것」) · none(사람이 「이분 아님」).
-- ⚠️ manual·none 은 자동이 절대 덮지 않는다 — 자동 쓰기는 아래 people_links_auto() 하나로만 한다(on conflict 의 where 가 막는다).
--    사람의 쓰기(peopleLink)는 서버가 이 표에 바로 upsert 한다.
-- 여러 번 돌려도 안전하다(if not exists · create or replace).
begin;

create table if not exists people_links (
  kind        text   not null check (kind in ('order','signup')),  -- order = ministry_orders · signup = event_signups
  row_id      bigint not null,                                     -- 그 표의 id(FK 없음)
  person_id   int,                                                 -- 교인ID · null = 못 맞춤/이분 아님 · FK 없음(명부가 바뀌어도 줄은 남는다)
  link_how    text   not null default 'auto' check (link_how in ('auto','manual','none')),
  match_basis text   not null default '',                          -- 「맞음」·「번호」·「사람이 이음」
  import_id   bigint,                                              -- auto 일 때 맞춘 명부(church_people_imports.id)
  linked_by   uuid references admin_members(id) on delete set null,
  linked_at   timestamptz,
  updated_at  timestamptz not null default now(),
  primary key (kind, row_id)
);
create index if not exists people_links_person_idx on people_links (person_id) where person_id is not null;
alter table people_links enable row level security;
revoke all on people_links from anon, authenticated;

-- 자동 잇기 쓰기 — [{kind,row_id,person_id,match_basis,import_id}, …] 를 넣거나 **auto 줄만** 고친다. 넣거나 고친 줄 수를 돌려준다.
-- ⚠️ 한 번에 같은 (kind,row_id) 가 두 번 오면 오류다(on conflict 가 한 줄을 두 번 못 고친다) — 부르는 쪽(people-links.ts)이 줄마다 하나로 만든다.
create or replace function people_links_auto(p_rows jsonb) returns int
language sql
set search_path = public
as $$
  with x as (
    select r->>'kind' as kind, (r->>'row_id')::bigint as row_id, (r->>'person_id')::int as person_id,
           coalesce(r->>'match_basis', '') as match_basis, (r->>'import_id')::bigint as import_id
    from jsonb_array_elements(p_rows) r
  ), up as (
    insert into people_links (kind, row_id, person_id, link_how, match_basis, import_id, updated_at)
    select kind, row_id, person_id, 'auto', match_basis, import_id, now() from x
    on conflict (kind, row_id) do update
      set person_id = excluded.person_id, match_basis = excluded.match_basis,
          import_id = excluded.import_id, updated_at = now()
      where people_links.link_how = 'auto'
    returning 1
  )
  select count(*)::int from up
$$;
revoke execute on function people_links_auto(jsonb) from public, anon, authenticated;
grant execute on function people_links_auto(jsonb) to service_role;

commit;

select 'people_links 줄' as t, count(*)::text as v from people_links
union all select 'RLS 켜짐(true)', relrowsecurity::text from pg_class where oid = 'public.people_links'::regclass
union all select 'anon 읽기(false)', has_table_privilege('anon', 'public.people_links', 'SELECT')::text
union all select 'authenticated 읽기(false)', has_table_privilege('authenticated', 'public.people_links', 'SELECT')::text
union all select 'anon 함수(false)', has_function_privilege('anon', 'public.people_links_auto(jsonb)', 'EXECUTE')::text
union all select 'authenticated 함수(false)', has_function_privilege('authenticated', 'public.people_links_auto(jsonb)', 'EXECUTE')::text;
```

- [ ] **Step 3: `supabase/sql/007_ministry_phone_expire.sql` 을 쓴다**

```sql
-- 교회 어드민 — 사역신청 휴대폰 번호 180일 자동 지우기(2026-10-01)
--   설계: bible-memorize-church-app-v2 docs/superpowers/specs/2026-10-01-person-history-tabs-design.md §6
-- 결정(임명확정·미채택·취소 — decided_at 이 찍힌 줄) 뒤 180일이 지나면 번호를 지운다.
-- 담당자가 신청 현황 「결정된 신청 번호 지우기」를 잊어도 개인정보 안내의 약속(늦어도 180일)이 지켜지게.
-- ⚠️ 개발 먼저. 개발엔 pg_cron 이 없다(2026-10-01 확인) — 그때는 함수만 만들고 예약은 건너뛴다(notice 한 줄). 운영엔 있다(daily-push).
-- ⚠️ 매일 18:17 UTC = 03:17 KST(pg_cron 은 UTC 로 돈다). 같은 이름으로 다시 부르면 예약을 고쳐 쓴다(pg_cron 1.4+).
-- ⚠️ security definer — 누가 부르든 표를 고친다. 그래서 public·anon·authenticated 실행 권한을 뺀다(서버·예약만).
-- ⚠️ 배포 다음 날 cron.job_run_details 로 실제로 돌았는지 본다(계획 Task 11).
begin;

create or replace function ministry_phone_expire() returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  update ministry_orders set phone = null, updated_at = now()
   where phone is not null and decided_at < now() - interval '180 days';
  get diagnostics n = row_count;
  return n;
end
$$;
revoke execute on function ministry_phone_expire() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('ministry-phone-expire', '17 18 * * *', 'select public.ministry_phone_expire()');
  else
    raise notice 'pg_cron 이 없다 — 함수만 만들고 예약은 건너뛴다(개발)';
  end if;
end
$$;

commit;

select 'anon 실행(false)' as t, has_function_privilege('anon', 'public.ministry_phone_expire()', 'EXECUTE')::text as v
union all select 'authenticated 실행(false)', has_function_privilege('authenticated', 'public.ministry_phone_expire()', 'EXECUTE')::text
union all select '함수 주인(postgres)', (select proowner::regrole::text from pg_proc where proname = 'ministry_phone_expire')
union all select 'pg_cron 있음(운영 1 · 개발 0)', (select count(*)::text from pg_extension where extname = 'pg_cron');
```

- [ ] **Step 4: 개발인지 확인한다**

Run: `supabase --workdir ~/.church-admin/supa-dev db query --linked "select count(*) as users from users"`
Expected: `users` 가 수십(2026-10-01 38). **사백이 넘으면 운영이다 — 멈춘다.**

- [ ] **Step 5: 개발에 006 을 돌린다**

Run: `supabase --workdir ~/.church-admin/supa-dev db query --linked -f C:/Projects/church-admin/.worktrees/person-history/supabase/sql/006_people_links.sql`
Expected: `people_links 줄 0` · `RLS 켜짐(true) true` · 나머지 넷 `false`.

- [ ] **Step 6: 개발에 007 을 돌린다**

Run: `supabase --workdir ~/.church-admin/supa-dev db query --linked -f C:/Projects/church-admin/.worktrees/person-history/supabase/sql/007_ministry_phone_expire.sql`
Expected: `anon 실행(false) false` · `authenticated 실행(false) false` · `함수 주인(postgres) postgres` · `pg_cron 있음(운영 1 · 개발 0) 0`.
(주인이 `postgres` 가 아니면 — CLI 로그인 역할이 주인이면 security definer 가 그 역할 권한으로 돈다 — 멈추고 `alter function ministry_phone_expire() owner to postgres` 를 친구와 본다.)

- [ ] **Step 7: 007 을 한 번 돌려 본다(설계 §9 — 180일 지난 가짜 줄)** — `.superpowers/sdd/person-history/007-try.sql`(Step 1 의 `.gitignore` 가 막는 폴더 · 커밋 안 함):

```sql
-- 007 시험(개발 전용) — 결정 뒤 200일 된 가짜 신청 한 줄. 돌린 뒤 지운다(Step 7 끝).
-- ⚠️ year 는 2000 — 그 해(app_config.ministry.year) 줄이면 신청 현황(ministryList)이 이 줄의 user_id(글자)로
--    push_subscriptions(user_id uuid)를 물어 22P02 → 개발의 📋 신청 현황이 **모든 세션에서** 500 이 된다(이 줄이 남아 있는 동안).
-- ⚠️ who 도 채운다 — 이름·소속이 빈 줄은 서버가 users(id uuid)에서 채우려 해 같은 오류가 난다
--    (모든 해를 읽는 「기록 잇기 맞추기」·peopleHistory 의 fillOrderNames).
insert into ministry_orders (year, user_id, team_id, committee, team, name, who, status, phone, source, decided_at)
select 2000, 'ca-test-expire', id, '시험부', '시험팀', 'ca-test-expire', '시험 0목장', '임명확정', '010-0000-0000', 'app', now() - interval '200 days'
from ministry_catalog order by id limit 1
returning id;
```

```bash
W=~/.church-admin/supa-dev
mkdir -p /c/Projects/church-admin/.worktrees/person-history/.superpowers/sdd/person-history
supabase --workdir $W db query --linked -f C:/Projects/church-admin/.worktrees/person-history/.superpowers/sdd/person-history/007-try.sql
supabase --workdir $W db query --linked "select public.ministry_phone_expire() as n"
supabase --workdir $W db query --linked "select (phone is null) as cleared from ministry_orders where user_id = 'ca-test-expire'"
supabase --workdir $W db query --linked "delete from ministry_orders where user_id = 'ca-test-expire' returning id"
```
Expected: id 한 줄 → `n` 이 1 이상 → `cleared true` → 지운 id 한 줄. (중간에 멈췄으면 마지막 `delete … where user_id = 'ca-test-expire'` 줄만이라도 돌려 둔다.)

- [ ] **Step 8: 노출 점검 — 개발 0행 · 공개 키로 표·함수가 안 열린다**

```bash
supabase --workdir ~/.church-admin/supa-dev db query --linked -f C:/Projects/church-admin/.worktrees/person-history/supabase/sql/check-authenticated-exposure.sql
set -a; . ~/.church-admin/dev.env; set +a
curl -s -o /dev/null -w "%{http_code}\n" "$DEV_URL/rest/v1/people_links?select=*&limit=1" -H "apikey: $DEV_ANON"
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$DEV_URL/rest/v1/rpc/ministry_phone_expire" -H "apikey: $DEV_ANON" -H "Content-Type: application/json" -d '{}'
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$DEV_URL/rest/v1/rpc/people_links_auto" -H "apikey: $DEV_ANON" -H "Content-Type: application/json" -d '{"p_rows":[]}'
```
Expected: 점검 **0행** · curl 셋 모두 `200`·`204` **가 아니다**(401·403·404).

- [ ] **Step 9: 커밋(푸시 안 함)**

```bash
git add supabase/sql/006_people_links.sql supabase/sql/007_ministry_phone_expire.sql
git commit -m "feat(교인명부): 잇기 표 people_links·자동 쓰기 함수(SQL 006) · 사역신청 번호 180일 자동 지우기(SQL 007) — 개발 적용" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git status --short            # 아무것도 없음(007-try.sql 은 .gitignore 가 막는다)
```

---

### Task 2: 잇기 규칙·탭 칸 지도 — 순수 모듈 `people-links.ts`

**Files:**
- Create: `supabase/functions/church-admin/people-links.ts`, `tests/people-links.test.mjs`

**Interfaces:**
- Consumes: `people-match.ts` `applicantFromSignup`·`applicantFromWho`·`mokToConfirm`·`nameKey`·`phoneDigits`·`sameAffiliation`·`toCand`·`Applicant`·`Cand` · `events-person.ts` `signupSame`·`SignupRow`.
- Produces(서버 Task 3~5·10 이 쓴다):
  - 상수 `LINK_KINDS = ["order","signup","history"]` · `LINK_HOWS = ["manual","none","auto"]` · `BASIS_SAME = "맞음"` · `BASIS_PHONE = "번호"` · `BASIS_MANUAL = "사람이 이음"`
  - 타입 `LinkKind = "order"|"signup"` · `LinkHow` · `LinkCand = Cand & {person_id:number}` · `LinkRow = {kind,row_id,person_id:number|null,link_how,match_basis,import_id:number|null}` · `AutoRec = {kind,row_id,person_id:number|null,match_basis,import_id:number}` · `LinkLook = {idx: Map<string,LinkCand[]>, asked: Set<string>, importId: number}` · `OrderIn = {id,name,who,phone?}` · `SignupIn = SignupRow & {id,name}`
  - `toLinkCand(r) → LinkCand` · `linkRowOf(r) → LinkRow` · `missingTable(err) → boolean`(42P01·PGRST205)
  - `autoLink(cands, a, {isSame?}) → {person_id:number|null, basis:string}`
  - `needsAuto(cur: LinkRow|undefined, importId, all=false) → boolean`(줄이 없거나 · auto 인데 **맞춘 명부가 지금 명부와 다르면** · all 이면 auto 전부)
  - `phoneLinkKept(cur: LinkRow|undefined, phone) → boolean` — 번호로 이은 auto 줄(`match_basis` 「번호」 · `person_id` 있음)인데 그 신청의 번호가 비었으면 true(**다시 맞추지 않는다** — 설계 §3.1-3 「번호로 이은 줄은 나중에 번호를 지워도 그대로 남는다」)
  - `orderAutoRecs(rows: OrderIn[], look, cur: Map<number,LinkRow>, all=false) → AutoRec[]`(`phoneLinkKept` 인 줄은 건너뛴다) · `signupAutoRecs(rows: SignupIn[], look, cur, all=false) → AutoRec[]`(물어본 이름만 · 줄마다 하나)
  - `syncCounts(cur, recs) → {added, changed, unmatched}`
  - `movedOrderIds(rows:{order_id}[]) → Set<number>`
  - `historyTabs({links, orders, signups, events, history, moved}) → {counts:{ministry,bible}, ministry: MinistryItem[], bible: BibleItem[]}`
    - `MinistryItem` 칸 = `kind,row,year,committee,team,option,role_title,status,how`(사역 이력 줄은 `status:"임명확정"`)
    - `BibleItem` 칸 = `kind,row,event_id,title,short_title,opens_on,who_type,group,sub,position,how`
  - `unlinkedRows({orders, signups, events, orderLinks, signupLinks, moved, history}) → 줄[]` — 신청 칸 `kind,row,year,committee,team,option,status,who,position,how` · 성경필사 칸 = BibleItem · 사역 이력 칸 `kind,row,year,committee,team,role_title,position,mok,how` · `how` 는 `auto`(아직 안 이어짐) 또는 `none`(이분 아님)
  - `parseLink(b) → {ok:true, kind, row, person, how} | {ok:false, error:"invalid"}`
  - `linkPatch(kind, row, how:"manual"|"none", personId, memberId, nowIso)` · `unlinkRec(kind, row, {person_id, basis}, importId, nowIso)` — 둘 다 `people_links` 한 줄 모양

- [ ] **Step 1: 실패하는 시험을 쓴다** — `tests/people-links.test.mjs`

```js
// 교인명부 — 기록과 교인 잇기 규칙(people-links.ts) 순수 시험(preflight 가 돈다 · 2026-10-01)
// 이름·교인ID 는 모두 지어낸 것(홍길동 · 11~). 번호는 글자로 적지 않고 만든다(명단 검사가 번호 수를 센다).
import { test } from "node:test";
import assert from "node:assert/strict";
import { autoLink, needsAuto, phoneLinkKept, orderAutoRecs, signupAutoRecs, syncCounts, toLinkCand, linkRowOf, movedOrderIds,
  historyTabs, unlinkedRows, parseLink, linkPatch, unlinkRec, missingTable, BASIS_SAME, BASIS_PHONE, BASIS_MANUAL }
  from "../supabase/functions/church-admin/people-links.ts";
import { applicantFromWho, applicantFromSignup } from "../supabase/functions/church-admin/people-match.ts";
import { signupSame } from "../supabase/functions/church-admin/events-person.ts";

// 교인명부 한 분 — 서버가 읽는 칸(person_id·name_key·mok1·mok3·school_dept·phone_digits·kind2)
const P = (person_id, o = {}) => toLinkCand({ person_id, name_key: "홍길동", kind2: "장년", mok1: "화평", mok3: "화평-20목장",
  school_dept: "", phone_digits: "", ...o });
const ph = (n) => "0100000" + String(n).padStart(4, "0");
const W = (who, phone = "") => applicantFromWho("홍길동", who, phone);
const NONE = { person_id: null, basis: "" };
const L = (o) => linkRowOf({ kind: "order", row_id: 1, person_id: null, link_how: "auto", match_basis: "", import_id: null, ...o });

test("autoLink — 같은 소속 한 분이면 그분(맞음) · 07·7목장도 같다", () => {
  const a = P(12), b = P(11, { mok1: "소망", mok3: "소망-3목장" });
  assert.deepEqual(autoLink([a, b], W("화평 20목장")), { person_id: 12, basis: BASIS_SAME });
  assert.deepEqual(autoLink([P(1, { mok3: "화평-7목장" }), b], W("화평 07목장")), { person_id: 1, basis: BASIS_SAME });
});

test("autoLink — 「이름이 명부에 한 분뿐」만으로는 잇지 않는다(친구 결정 2026-10-01)", () => {
  const b = P(11, { mok1: "소망", mok3: "소망-3목장" });
  assert.deepEqual(autoLink([b], W("화평 20목장")), NONE);
  assert.deepEqual(autoLink([b], W("기쁨 5목장")), NONE);
  assert.deepEqual(autoLink([], W("화평 20목장")), NONE);
  assert.deepEqual(autoLink(undefined, W("화평 20목장")), NONE);
});

test("autoLink — 번호(사역만): 같은 소속 안에서 먼저 · 없으면 같은 이름 전부 · 딱 한 분일 때만", () => {
  const c = P(13, { phone_digits: ph(13) }), d = P(14, { phone_digits: ph(14) });           // 둘 다 화평 20
  const e = P(15, { mok1: "소망", mok3: "소망-3목장", phone_digits: ph(15) });
  assert.deepEqual(autoLink([c, d], W("화평 20목장", ph(14))), { person_id: 14, basis: BASIS_PHONE });
  assert.deepEqual(autoLink([c, d, e], W("화평 20목장", ph(15))), NONE, "같은 소속이 있으면 번호도 그 안에서만");
  assert.deepEqual(autoLink([d, e], W("기쁨 5목장", ph(15))), { person_id: 15, basis: BASIS_PHONE });
  const f = P(16, { mok1: "은혜", mok3: "은혜-2목장", phone_digits: ph(15) });              // 같은 번호 가족
  assert.deepEqual(autoLink([e, f], W("기쁨 5목장", ph(15))), NONE, "번호가 둘과 맞으면 잇지 않는다");
  assert.deepEqual(autoLink([c, d], W("화평 20목장", ph(99))), NONE);
});

test("autoLink — 목장 모르는 줄(99)은 같은 교구가 있으면 번호도 그 안에서만(personPickFor 와 같은 차례)", () => {
  const g = P(21, { mok3: "화평-3목장", phone_digits: ph(21) }), h = P(22, { mok1: "소망", mok3: "소망-4목장", phone_digits: ph(22) });
  assert.deepEqual(autoLink([g, h], W("화평 99목장", ph(22))), NONE);
  assert.deepEqual(autoLink([g, h], W("화평 99목장", ph(21))), { person_id: 21, basis: BASIS_PHONE });
  assert.deepEqual(autoLink([h], W("기쁨 99목장", ph(22))), { person_id: 22, basis: BASIS_PHONE });
});

test("autoLink — 성경필사 줄(signupSame): 교구 줄은 명부의 아이를 빼고 · 옮겨 적은 줄은 맞음 · 명단 표시와 같은 결론", () => {
  const S = (who_type, group_name, sub_name) => ({ who_type, group_name, sub_name, name: "홍길동" });
  const sl = (cands, row) => autoLink(cands, applicantFromSignup(row), { isSame: signupSame(row, cands) });
  const adult = P(31), kid = P(32, { kind2: "교회학교", school_dept: "중등부" });   // 아이도 가족 목장(화평-20목장)을 가진다
  assert.deepEqual(sl([adult, kid], S("교구", "화평", "20")), { person_id: 31, basis: BASIS_SAME });
  assert.deepEqual(autoLink([adult, kid], W("화평 20목장")), NONE, "사역 줄은 숫자 목장에서 아이를 빼지 않는다(sameAffiliation 그대로)");
  assert.deepEqual(sl([adult, kid], S("교회학교", "중등부", "")), { person_id: 32, basis: BASIS_SAME });
  const y = P(33, { kind2: "청년", mok1: "청년공동체", mok3: "" });
  assert.deepEqual(sl([y, adult], S("교회학교", "청년부", "")), { person_id: 33, basis: BASIS_SAME }, "청년공동체 → 「청년부」로 옮겨 적은 줄");
});

test("needsAuto — 줄 없음·다른 명부로 맞춘 auto 만 다시 · 사람이 정한 줄은 all 이어도 안 건드린다", () => {
  assert.equal(needsAuto(undefined, 7), true);
  assert.equal(needsAuto(L({ person_id: 3, import_id: 7 }), 7), false);
  assert.equal(needsAuto(L({ person_id: 3, import_id: 6 }), 7), true, "옛 명부");
  assert.equal(needsAuto(L({ person_id: 3, import_id: 9 }), 7), true, "지워진 명부(개발 시험 기록 등) — 다르면 다시");
  assert.equal(needsAuto(L({ person_id: 3, link_how: "manual" }), 7), false);
  assert.equal(needsAuto(L({ link_how: "none" }), 7, true), false);
  assert.equal(needsAuto(L({ person_id: 3, import_id: 7 }), 7, true), true);
});

test("orderAutoRecs — 물어본 이름만 · 사람이 정한 줄 빼고 · 줄마다 하나 · 못 맞추면 null 로 적는다", () => {
  const look = { idx: new Map([["홍길동", [P(12), P(11, { mok1: "소망", mok3: "소망-3목장" })]]]), asked: new Set(["홍길동", "김철수"]), importId: 7 };
  const rows = [
    { id: 1, name: "홍길동", who: "화평 20목장", phone: "" },
    { id: 2, name: "홍 길동", who: "기쁨 5목장", phone: "" },
    { id: 3, name: "홍길동", who: "화평 20목장", phone: "" },
    { id: 4, name: "김철수", who: "화평 1목장", phone: "" },
    { id: 5, name: "이영희", who: "화평 1목장", phone: "" },
    { id: 1, name: "홍길동", who: "화평 20목장", phone: "" },
  ];
  const cur = new Map([[3, L({ row_id: 3, person_id: 11, link_how: "manual" })]]);
  assert.deepEqual(orderAutoRecs(rows, look, cur), [
    { kind: "order", row_id: 1, person_id: 12, match_basis: "맞음", import_id: 7 },
    { kind: "order", row_id: 2, person_id: null, match_basis: "", import_id: 7 },
    { kind: "order", row_id: 4, person_id: null, match_basis: "", import_id: 7 },
  ]);
  const cur2 = new Map([[1, L({ row_id: 1, person_id: 12, import_id: 7 })]]);
  assert.equal(orderAutoRecs([rows[0]], look, cur2).length, 0, "지금 명부로 맞춘 auto 줄은 다시 쓰지 않는다");
  assert.equal(orderAutoRecs([rows[0]], look, cur2, true).length, 1, "다시 맞추기(all)는 다시 쓴다");
});

test("phoneLinkKept — 번호로 이은 줄은 그 신청의 번호를 지운 뒤 다시 맞추지 않는다(새 명부·기록 잇기 맞추기여도 · 설계 §3.1-3)", () => {
  const c = P(13, { phone_digits: ph(13) }), d = P(14, { phone_digits: ph(14) });           // 둘 다 화평 20
  const look = { idx: new Map([["홍길동", [c, d]]]), asked: new Set(["홍길동"]), importId: 8 };
  const byPhone = L({ row_id: 1, person_id: 14, match_basis: BASIS_PHONE, import_id: 7 });
  const row = (phone) => [{ id: 1, name: "홍길동", who: "화평 20목장", phone }];
  assert.equal(phoneLinkKept(byPhone, ""), true);
  assert.equal(phoneLinkKept(byPhone, null), true);
  assert.equal(phoneLinkKept(byPhone, ph(14)), false, "번호가 남아 있으면 평소대로");
  assert.equal(phoneLinkKept(L({ person_id: 14, match_basis: BASIS_SAME }), ""), false, "「맞음」 줄은 아니다");
  assert.equal(phoneLinkKept(L({ person_id: 14, match_basis: BASIS_MANUAL, link_how: "manual" }), ""), false);
  assert.equal(phoneLinkKept(undefined, ""), false);
  assert.equal(orderAutoRecs(row(""), look, new Map([[1, byPhone]])).length, 0, "새 명부(7→8)여도 그대로");
  assert.equal(orderAutoRecs(row(null), look, new Map([[1, byPhone]]), true).length, 0, "기록 잇기 맞추기(all)여도 그대로");
  assert.deepEqual(orderAutoRecs(row(ph(14)), look, new Map([[1, byPhone]]), true),
    [{ kind: "order", row_id: 1, person_id: 14, match_basis: BASIS_PHONE, import_id: 8 }], "번호가 남아 있으면 다시 맞춘다");
  assert.deepEqual(orderAutoRecs(row(""), look, new Map()), [{ kind: "order", row_id: 1, person_id: null, match_basis: "", import_id: 8 }],
    "잇기 줄이 없으면(「풀기」는 cur 없이 부른다) 번호 없이 맞춘다");
});

test("signupAutoRecs — 성경필사 줄은 signupSame 으로 · 번호는 쓰지 않는다", () => {
  const look = { idx: new Map([["홍길동", [P(31), P(32, { kind2: "교회학교", school_dept: "중등부" })]]]), asked: new Set(["홍길동"]), importId: 7 };
  const rows = [
    { id: 10, who_type: "교구", group_name: "화평", sub_name: "20", name: "홍길동" },
    { id: 11, who_type: "교구", group_name: "기쁨", sub_name: "5", name: "홍길동" },
  ];
  assert.deepEqual(signupAutoRecs(rows, look, new Map()), [
    { kind: "signup", row_id: 10, person_id: 31, match_basis: "맞음", import_id: 7 },
    { kind: "signup", row_id: 11, person_id: null, match_basis: "", import_id: 7 },
  ]);
});

test("syncCounts — 새로 이음 · 바뀜 · 못 맞춤", () => {
  const cur = new Map([[1, L({ row_id: 1, person_id: 12, import_id: 6 })], [2, L({ row_id: 2, person_id: 11, import_id: 6 })]]);
  const R = (row_id, person_id) => ({ kind: "order", row_id, person_id, match_basis: person_id ? "맞음" : "", import_id: 7 });
  assert.deepEqual(syncCounts(cur, [R(1, 12), R(2, null), R(3, 13), R(4, null)]), { added: 1, changed: 1, unmatched: 2 });
});

const EVENTS = [
  { id: "lent-2026", title: "2026 사순절 마가복음 성경필사 완서자", short_title: "", opens_on: "2026-03-01", status: "closed", needs: {} },
  { id: "autumn-2026", title: "2026 가을 말씀 동행", short_title: "", opens_on: "2026-10-27", status: "draft" },
  { id: "summer-2025", title: "2025 썸머 써 바이블", short_title: "", opens_on: "2025-06-01", status: "archived" },
];
const SECRET = /"(user_id|ident_key|memo|phone|answers|note)"\s*:/;
const MIN_KEYS = ["committee", "how", "kind", "option", "role_title", "row", "status", "team", "year"];
const BIB_KEYS = ["event_id", "group", "how", "kind", "opens_on", "position", "row", "short_title", "sub", "title", "who_type"];

test("historyTabs — 이어진 줄만 · 이력으로 넘긴 신청·초안 회차·없어진 줄은 빼고 · 칸 지도 · 해 내림차순", () => {
  const links = [{ kind: "order", row_id: 1, link_how: "auto" }, { kind: "order", row_id: 2, link_how: "manual" },
    { kind: "order", row_id: 3, link_how: "auto" }, { kind: "signup", row_id: 7, link_how: "auto" },
    { kind: "signup", row_id: 8, link_how: "auto" }, { kind: "signup", row_id: 9, link_how: "auto" }, { kind: "signup", row_id: 10, link_how: "auto" }];
  const orders = [
    { id: 1, year: 2027, committee: "예배위원회", team: "안내팀", option: "", status: "임명확정", user_id: "u-1", phone: "x", note: "메모" },
    { id: 2, year: 2027, committee: "교육위원회", team: "어와나", option: "T&T", status: "접수완료" },
    { id: 3, year: 2027, committee: "전도부", team: "행복전도대", option: "", status: "신청완료" },
  ];
  const history = [
    { id: 40, year: 2025, committee: "교육위원회", team: "중등부", role_title: "교사", position: "집사", mok: "화평-20", source: "excel", link_how: "auto" },
    { id: 41, year: 2026, committee: "예배위원회", team: "안내팀", role_title: "팀장", link_how: "manual" },
  ];
  const signups = [
    { id: 7, event_id: "lent-2026", who_type: "교구", group_name: "화평", sub_name: "20", position: "집사", user_id: "u-1", memo: "m", ident_key: "k" },
    { id: 8, event_id: "autumn-2026", who_type: "교구", group_name: "화평", sub_name: "20", position: "집사" },
    { id: 9, event_id: "summer-2025", who_type: "교구", group_name: "화평", sub_name: "20", position: "집사" },
  ];
  const h = historyTabs({ links, orders, signups, events: EVENTS, history, moved: movedOrderIds([{ order_id: 3 }, { order_id: null }]) });
  assert.deepEqual(h.counts, { ministry: 4, bible: 2 });
  assert.deepEqual(h.ministry.map((r) => [r.kind, r.row]), [["order", 2], ["order", 1], ["history", 41], ["history", 40]]);
  assert.deepEqual(h.bible.map((r) => r.row), [7, 9]);
  for (const r of h.ministry) assert.deepEqual(Object.keys(r).sort(), MIN_KEYS);
  for (const r of h.bible) assert.deepEqual(Object.keys(r).sort(), BIB_KEYS);
  assert.deepEqual(h.ministry[0], { kind: "order", row: 2, year: 2027, committee: "교육위원회", team: "어와나", option: "T&T",
    role_title: "", status: "접수완료", how: "manual" });
  assert.deepEqual([h.ministry[2].status, h.ministry[2].how, h.ministry[2].role_title], ["임명확정", "manual", "팀장"]);
  assert.equal(h.bible[0].title, "2026 사순절 마가복음 성경필사 완서자");
  assert.ok(!SECRET.test(JSON.stringify(h)), "탭에 실으면 안 되는 칸");
  assert.deepEqual(historyTabs({}), { counts: { ministry: 0, bible: 0 }, ministry: [], bible: [] });
});

test("unlinkedRows — 아무에게도 안 이어진 줄(auto)과 「이분 아님」(none)만 · 다른 분께 이어진 줄·넘긴 신청·초안 회차는 빼고", () => {
  const o = (id) => ({ id, year: 2027, committee: "예배위원회", team: "안내팀", option: "", status: "신청완료", position: "집사",
    who: "기쁨 5목장", name: "홍길동", user_id: "u", phone: "x", note: "n" });
  const orderLinks = new Map([[2, L({ row_id: 2, import_id: 7 })], [3, L({ row_id: 3, person_id: 99 })], [4, L({ row_id: 4, link_how: "none" })]]);
  const signups = [{ id: 7, event_id: "lent-2026", who_type: "교구", group_name: "기쁨", sub_name: "5", position: "집사", name: "홍길동", memo: "m" },
    { id: 8, event_id: "autumn-2026", who_type: "교구", group_name: "기쁨", sub_name: "5", position: "", name: "홍길동" }];
  const history = [{ id: 40, year: 2024, committee: "교육위원회", team: "중등부", role_title: "", position: "집사", mok: "기쁨-5", link_how: "auto", name: "홍길동" }];
  const rows = unlinkedRows({ orders: [o(1), o(2), o(3), o(4), o(5)], signups, events: EVENTS, orderLinks, signupLinks: new Map(),
    moved: new Set([5]), history });
  assert.deepEqual(rows.map((r) => [r.kind, r.row, r.how]), [["order", 1, "auto"], ["order", 2, "auto"], ["order", 4, "none"],
    ["history", 40, "auto"], ["signup", 7, "auto"]]);
  assert.deepEqual(Object.keys(rows[0]).sort(), ["committee", "how", "kind", "option", "position", "row", "status", "team", "who", "year"]);
  assert.deepEqual(Object.keys(rows[3]).sort(), ["committee", "how", "kind", "mok", "position", "role_title", "row", "team", "year"]);
  assert.deepEqual(Object.keys(rows[4]).sort(), BIB_KEYS);
  assert.ok(!SECRET.test(JSON.stringify(rows)));
});

test("parseLink — kind 셋 · how 셋 · 줄·교인ID 는 양의 정수", () => {
  assert.deepEqual(parseLink({ kind: "order", row: "12", person: 900001, how: "manual" }), { ok: true, kind: "order", row: 12, person: 900001, how: "manual" });
  assert.equal(parseLink({ kind: "history", row: 1, person: 1, how: "none" }).ok, true);
  for (const bad of [null, [], { kind: "x", row: 1, person: 1, how: "manual" }, { kind: "order", row: 0, person: 1, how: "manual" },
    { kind: "order", row: 1, person: -1, how: "manual" }, { kind: "order", row: 1.5, person: 1, how: "auto" },
    { kind: "signup", row: 1, person: 1, how: "delete" }]) assert.deepEqual(parseLink(bad), { ok: false, error: "invalid" }, JSON.stringify(bad));
});

test("linkPatch · unlinkRec — 사람이 정한 줄 / 풀기(auto 로 되돌리고 그 줄만 다시 맞춘 값)", () => {
  const NOW = "2026-10-01T00:00:00.000Z", M = "11111111-1111-1111-1111-111111111111";
  assert.deepEqual(linkPatch("order", 5, "manual", 900001, M, NOW), { kind: "order", row_id: 5, person_id: 900001, link_how: "manual",
    match_basis: BASIS_MANUAL, import_id: null, linked_by: M, linked_at: NOW, updated_at: NOW });
  assert.deepEqual(linkPatch("signup", 6, "none", 900001, M, NOW), { kind: "signup", row_id: 6, person_id: null, link_how: "none",
    match_basis: "", import_id: null, linked_by: M, linked_at: NOW, updated_at: NOW });
  assert.deepEqual(unlinkRec("order", 5, { person_id: 12, basis: "맞음" }, 7, NOW), { kind: "order", row_id: 5, person_id: 12,
    link_how: "auto", match_basis: "맞음", import_id: 7, linked_by: null, linked_at: null, updated_at: NOW });
});

test("missingTable — 표가 없을 때(운영 SQL 005 전 사역 이력) 두 꼴", () => {
  assert.equal(missingTable({ code: "42P01" }), true);
  assert.equal(missingTable({ code: "PGRST205" }), true);
  assert.equal(missingTable({ code: "42501" }), false);
  assert.equal(missingTable(null), false);
});
```

- [ ] **Step 2: 돌려서 실패를 본다**

Run: `node --experimental-strip-types --test tests/people-links.test.mjs`
Expected: FAIL — `Cannot find module '…/people-links.ts'`

- [ ] **Step 3: `supabase/functions/church-admin/people-links.ts` 를 쓴다**

```ts
// 교인명부 — 사역신청·성경필사 기록을 교인과 잇는 규칙 · 「자세히」 창 탭의 칸 지도(순수 함수 · 2026-10-01)
//   설계: bible-memorize-church-app-v2 docs/superpowers/specs/2026-10-01-person-history-tabs-design.md §2·§3·§5
//   서버(Deno, index.ts)와 시험(Node, tests/people-links.test.mjs)이 **같은 파일**을 읽는다 — authz.ts 와 같은 제약
//   (원격 import·enum·namespace 금지 · node --experimental-strip-types 가 그대로 읽는다).
// ⚠️ 「같은 소속」을 새로 만들지 않는다 — 명단의 교적 표시와 같은 판정(사역 줄 sameAffiliation · 성경필사 줄 signupSame)이다.
//    그래서 이은 기록 = 명단의 「교적 ✓」(같은 소속 한 분)이고, 사역 줄만 번호가 딱 한 분과 맞을 때 더 잇는다.
// ⚠️ 「이름이 명부에 한 분뿐이면 그분」(events-person.ts personPickFor ②)은 **잇지 않는다**(2026-10-01 친구 결정) —
//    소속이 다르면 명부에 없는 다른 분일 수 있다. 그 줄은 「자세히」 창 「아직 안 이어진 기록」에서 사람이 「이분 것」으로 잇는다.
// ⚠️ manual·none(사람이 정한 줄)은 여기서 고르지 않는다(needsAuto) — DB 쪽에서도 people_links_auto() 의 where 가 한 번 더 막는다.
// ⚠️ 응답은 아래 …Item 칸 지도로만 — user_id·ident_key·memo·phone·answers·note 는 어느 모양에도 없다(스프레드 금지).
import { applicantFromSignup, applicantFromWho, mokToConfirm, nameKey, phoneDigits, sameAffiliation, toCand,
  type Applicant, type Cand } from "./people-match.ts";
import { signupSame, type SignupRow } from "./events-person.ts";

export const LINK_KINDS = ["order", "signup", "history"];   // peopleLink 이 받는 kind — history 는 b6 사역 이력 표(계획 Task 10)
export const LINK_HOWS = ["manual", "none", "auto"];
export const BASIS_SAME = "맞음";
export const BASIS_PHONE = "번호";
export const BASIS_MANUAL = "사람이 이음";

export type LinkKind = "order" | "signup";
export type LinkHow = "auto" | "manual" | "none";
export type LinkCand = Cand & { person_id: number };
export type LinkRow = { kind: string; row_id: number; person_id: number | null; link_how: LinkHow; match_basis: string; import_id: number | null };
export type AutoRec = { kind: LinkKind; row_id: number; person_id: number | null; match_basis: string; import_id: number };
// idx = 이름 키 → 명부 후보 · asked = 명부에 물어본 이름 키(없는 이름도) · importId = 지금 명부(church_people_imports 마지막 id)
export type LinkLook = { idx: Map<string, LinkCand[]>; asked: Set<string>; importId: number };
export type OrderIn = { id: number | string; name: string; who: string; phone?: string | null };
export type SignupIn = SignupRow & { id: number | string; name: string };
export type MinistryItem = { kind: "order" | "history"; row: number; year: number; committee: string; team: string; option: string;
  role_title: string; status: string; how: LinkHow };
export type BibleItem = { kind: "signup"; row: number; event_id: string; title: string; short_title: string; opens_on: string;
  who_type: string; group: string; sub: string; position: string; how: LinkHow };
export type PersonHistory = { counts: { ministry: number; bible: number }; ministry: MinistryItem[]; bible: BibleItem[] };

const s = (v: unknown): string => String(v ?? "").normalize("NFC").trim();
const howOf = (v: unknown): LinkHow => (v === "manual" || v === "none" ? v : "auto");
const intOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isSafeInteger(n) ? n : null;
};
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);   // 코드 포인트 차례(localeCompare 는 ICU 에 따라 다르다)

export function toLinkCand(r: any): LinkCand {
  return { ...toCand(r), person_id: Number(r?.person_id) };
}
export function linkRowOf(r: any): LinkRow {
  return { kind: s(r?.kind), row_id: Number(r?.row_id), person_id: intOrNull(r?.person_id), link_how: howOf(r?.link_how),
    match_basis: s(r?.match_basis), import_id: intOrNull(r?.import_id) };
}
// 표가 아직 없다 — Postgres 42P01 · PostgREST 12 의 PGRST205(「schema cache 에 없는 표」)
export const missingTable = (e: any): boolean => !!e && (e.code === "42P01" || e.code === "PGRST205");

// 한 줄을 명부 한 분에 잇는다 — ① 같은 소속 딱 한 분(맞음) ② (번호가 있으면) 같은 소속 안에서, 같은 소속이 없으면 같은 이름 전부에서
// (목장 모르는 줄은 같은 교구가 있으면 그 안에서 — personPickFor 와 같은 차례) 번호가 딱 한 분과 맞으면(번호) ③ 그 밖 null.
// isSame — 성경필사 줄은 signupSame(명단의 교적 표시와 같은 판정)을 넘긴다. 넘기지 않으면 sameAffiliation(사역 줄).
export function autoLink(cands: LinkCand[] | undefined, a: Applicant, opts: { isSame?: (c: Cand) => boolean } = {}):
  { person_id: number | null; basis: string } {
  const all = [...(cands ?? [])].sort((x, y) => x.person_id - y.person_id);
  const judge = opts.isSame ?? ((c: Cand) => sameAffiliation(c, a));
  const same = all.filter((c) => judge(c));
  if (same.length === 1) return { person_id: same[0].person_id, basis: BASIS_SAME };
  const ph = phoneDigits(a?.phone);
  if (ph) {
    const gu = !same.length && mokToConfirm(a) && a.gu ? all.filter((c) => c.mok1 === a.gu) : [];
    const pool = same.length ? same : gu.length ? gu : all;
    const hit = pool.filter((c) => c.phones.includes(ph));
    if (hit.length === 1) return { person_id: hit[0].person_id, basis: BASIS_PHONE };
  }
  return { person_id: null, basis: "" };
}

// 다시 맞출 줄인가 — 줄이 없거나(아직 맞춰 보지 않음) · auto 인데 맞춘 명부가 지금 명부와 다르면(새 명부 · 지워진 시험 명부) ·
// all(기록 잇기 맞추기)이면 auto 전부. manual·none 은 어떤 경우에도 아니다.
export function needsAuto(cur: LinkRow | undefined, importId: number, all = false): boolean {
  if (!cur) return true;
  if (cur.link_how !== "auto") return false;
  return all || cur.import_id !== importId;
}

// 번호로 이은 줄은 나중에 번호를 지워도 그대로 남는다(설계 §3.1-3) — 그 신청의 번호가 비었으면(📵 단추·결정 뒤 180일 작업이 지웠다)
// 다시 맞추지 않는다(새 명부가 와서 import_id 가 달라도 · 「기록 잇기 맞추기」(all)여도). 번호 없이 다시 맞추면 person_id 가 null 로 덮여 끊긴다
// (12월 새 명단에서 번호로 이은 줄이 모두 끊기는 길). 번호가 남아 있으면 평소처럼 다시 맞춘다.
// 사람이 「풀기」하면(peopleLink auto — cur 없이 부른다) 번호 없이 다시 맞춘다(사람이 고른 일).
// 그분이 새 명부에서 빠져도 이 줄은 남는다 — 설계 §11 「끊김」과 같다(창에는 그분이 없으니 보이지 않는다).
export function phoneLinkKept(cur: LinkRow | undefined, phone: unknown): boolean {
  return !!cur && cur.link_how === "auto" && cur.match_basis === BASIS_PHONE && cur.person_id !== null && !phoneDigits(phone);
}

function recsOf(kind: LinkKind, rows: any[], look: LinkLook, cur: Map<number, LinkRow>, all: boolean,
  pick: (r: any, cands: LinkCand[] | undefined) => { person_id: number | null; basis: string },
  keep?: (r: any, c: LinkRow | undefined) => boolean): AutoRec[] {
  const out = new Map<number, AutoRec>();
  for (const r of rows ?? []) {
    const id = Number(r?.id);
    if (!Number.isSafeInteger(id) || id <= 0 || out.has(id)) continue;
    const key = nameKey(r?.name);
    if (!key || !look.asked.has(key)) continue;     // 명부에 물어보지 않은 이름 — 「못 맞춤」으로 적지 않는다
    if (!needsAuto(cur.get(id), look.importId, all)) continue;
    if (keep && keep(r, cur.get(id))) continue;     // 그대로 둘 줄(사역 — phoneLinkKept)
    const l = pick(r, look.idx.get(key));
    out.set(id, { kind, row_id: id, person_id: l.person_id, match_basis: l.basis, import_id: look.importId });
  }
  return [...out.values()];
}
// 사역신청 줄 — 신청 현황의 교적 표시와 같은 맞대는 줄(applicantFromWho(이름, who, 번호) · 이름·소속이 빈 옛 줄은 부르는 쪽이 앱 계정으로 채운다)
// ⚠️ 번호로 이은 줄은 번호가 지워졌으면 건너뛴다(phoneLinkKept) — 이 인자를 빼면 「기록 잇기 맞추기」·새 명부에서 그 줄이 끊긴다.
export function orderAutoRecs(rows: OrderIn[], look: LinkLook, cur: Map<number, LinkRow>, all = false): AutoRec[] {
  return recsOf("order", rows, look, cur, all, (r, cands) => autoLink(cands, applicantFromWho(r.name, r.who, r.phone ?? "")),
    (r, c) => phoneLinkKept(c, r.phone));
}
// 성경필사 줄 — 명단의 교적 표시와 같은 signupSame(교구 줄 아이 빼기 · 옮겨 적은 줄 맞음) · 번호 없음
export function signupAutoRecs(rows: SignupIn[], look: LinkLook, cur: Map<number, LinkRow>, all = false): AutoRec[] {
  return recsOf("signup", rows, look, cur, all, (r, cands) => autoLink(cands, applicantFromSignup(r), { isSame: signupSame(r, cands) }));
}

// 「새로 이음 N · 바뀜 K · 못 맞춤 M」 — cur 는 쓰기 전 잇기 줄
export function syncCounts(cur: Map<number, LinkRow>, recs: AutoRec[]): { added: number; changed: number; unmatched: number } {
  let added = 0, changed = 0, unmatched = 0;
  for (const r of recs) {
    const before = cur.get(r.row_id)?.person_id ?? null;
    if (r.person_id === null) unmatched++;
    if (before === null && r.person_id !== null) added++;
    else if (before !== null && r.person_id !== before) changed++;
  }
  return { added, changed, unmatched };
}

// 사역 이력으로 넘긴 신청 — 그 신청은 사역 탭에서 신청 쪽으로 읽지 않는다(두 번 보이지 않게 · 줄 단위)
export function movedOrderIds(rows: { order_id?: unknown }[]): Set<number> {
  return new Set((rows ?? []).map((r) => intOrNull(r?.order_id)).filter((x): x is number => x !== null));
}

// ---------- 탭 칸 지도 ----------
export function orderItem(o: any, how: unknown): MinistryItem {
  return { kind: "order", row: Number(o?.id), year: Number(o?.year) || 0, committee: s(o?.committee), team: s(o?.team),
    option: s(o?.option), role_title: "", status: s(o?.status), how: howOf(how) };
}
// 사역 이력(b6 · 섬긴 사역 = 임명만) — 상태는 「임명확정」(신청 현황과 같은 칩 「임명」)
export function historyItem(h: any): MinistryItem {
  return { kind: "history", row: Number(h?.id), year: Number(h?.year) || 0, committee: s(h?.committee), team: s(h?.team),
    option: "", role_title: s(h?.role_title), status: "임명확정", how: howOf(h?.link_how) };
}
export function signupItem(r: any, ev: any, how: unknown): BibleItem {
  return { kind: "signup", row: Number(r?.id), event_id: s(r?.event_id), title: s(ev?.title), short_title: s(ev?.short_title),
    opens_on: s(ev?.opens_on), who_type: s(r?.who_type), group: s(r?.group_name), sub: s(r?.sub_name), position: s(r?.position),
    how: howOf(how) };
}
const byYear = (a: any, b: any) => (Number(b.year) || 0) - (Number(a.year) || 0) || cmp(a.committee, b.committee) ||
  cmp(a.team, b.team) || cmp(a.kind, b.kind) || a.row - b.row;
const byOpens = (a: any, b: any) => cmp(b.opens_on, a.opens_on) || cmp(a.event_id, b.event_id) || a.row - b.row;
const liveSignup = (evBy: Map<string, any>) => (r: any) => { const e = evBy.get(s(r?.event_id)); return !!e && e.status !== "draft"; };

// 「자세히」 창 탭 — links = 이분께 이어진 잇기 줄(auto·manual) · orders·signups = 그 줄의 원래 줄(없어진 줄은 저절로 빠진다) ·
// history = 사역 이력에서 이분께 이어진 줄 · moved = 이력으로 넘긴 신청 id
export function historyTabs(x: { links?: any[]; orders?: any[]; signups?: any[]; events?: any[]; history?: any[]; moved?: Set<number> }): PersonHistory {
  const how = new Map((x.links ?? []).map((l) => [`${s(l?.kind)}:${Number(l?.row_id)}`, l?.link_how]));
  const evBy = new Map((x.events ?? []).map((e) => [s(e?.id), e]));
  const moved = x.moved ?? new Set<number>();
  const ministry = [
    ...(x.orders ?? []).filter((o) => !moved.has(Number(o?.id))).map((o) => orderItem(o, how.get(`order:${Number(o?.id)}`))),
    ...(x.history ?? []).map(historyItem),
  ].sort(byYear);
  const bible = (x.signups ?? []).filter(liveSignup(evBy))
    .map((r) => signupItem(r, evBy.get(s(r?.event_id)), how.get(`signup:${Number(r?.id)}`))).sort(byOpens);
  return { counts: { ministry: ministry.length, bible: bible.length }, ministry, bible };
}

// 「이름이 같고 아직 안 이어진 기록」 — 아무에게도 안 이어진 줄(how auto)과 「이분 아님」으로 둔 줄(how none · 화면이 따로 묶는다).
// 다른 분께 이어진 줄(person_id 있음)은 빼고, 넘긴 신청·초안 회차도 뺀다. history = 사역 이력에서 person_id 가 빈 줄(Task 10).
export function unlinkedRows(x: { orders?: any[]; signups?: any[]; events?: any[]; orderLinks?: Map<number, LinkRow>;
  signupLinks?: Map<number, LinkRow>; moved?: Set<number>; history?: any[] }): Record<string, unknown>[] {
  const open = (l?: LinkRow): LinkHow | null => (!l ? "auto" : l.link_how === "none" ? "none" : l.person_id === null ? "auto" : null);
  const evBy = new Map((x.events ?? []).map((e) => [s(e?.id), e]));
  const moved = x.moved ?? new Set<number>();
  const orders = (x.orders ?? []).filter((o) => !moved.has(Number(o?.id))).flatMap((o) => {
    const h = open(x.orderLinks?.get(Number(o?.id)));
    return h ? [{ kind: "order", row: Number(o?.id), year: Number(o?.year) || 0, committee: s(o?.committee), team: s(o?.team),
      option: s(o?.option), status: s(o?.status), who: s(o?.who), position: s(o?.position), how: h }] : [];
  });
  const hist = (x.history ?? []).map((h) => ({ kind: "history", row: Number(h?.id), year: Number(h?.year) || 0,
    committee: s(h?.committee), team: s(h?.team), role_title: s(h?.role_title), position: s(h?.position), mok: s(h?.mok),
    how: h?.link_how === "none" ? "none" : "auto" }));
  const sig = (x.signups ?? []).filter(liveSignup(evBy)).flatMap((r) => {
    const h = open(x.signupLinks?.get(Number(r?.id)));
    return h ? [signupItem(r, evBy.get(s(r?.event_id)), h)] : [];
  });
  return [...[...orders, ...hist].sort(byYear), ...sig.sort(byOpens)];
}

// ---------- peopleLink(「이분 것」·「이분 아님」·「풀기」) ----------
export function parseLink(b: unknown): { ok: true; kind: string; row: number; person: number; how: LinkHow } | { ok: false; error: string } {
  const o = (b && typeof b === "object" && !Array.isArray(b) ? b : {}) as Record<string, unknown>;
  const kind = String(o.kind ?? ""), how = String(o.how ?? ""), row = Number(o.row), person = Number(o.person);
  if (!LINK_KINDS.includes(kind) || !LINK_HOWS.includes(how)) return { ok: false, error: "invalid" };
  if (!Number.isSafeInteger(row) || row <= 0 || !Number.isSafeInteger(person) || person <= 0) return { ok: false, error: "invalid" };
  return { ok: true, kind, row, person, how: how as LinkHow };
}
// 사람이 정한 줄 — manual(이분 것) · none(이분 아님). 자동이 다시 덮지 않는다(link_how).
export function linkPatch(kind: LinkKind, row: number, how: "manual" | "none", personId: number, memberId: string | null, nowIso: string) {
  return { kind, row_id: row, person_id: how === "manual" ? personId : null, link_how: how,
    match_basis: how === "manual" ? BASIS_MANUAL : "", import_id: null, linked_by: memberId, linked_at: nowIso, updated_at: nowIso };
}
// 풀기 — auto 로 되돌리고 지금 명부로 그 줄만 다시 맞춘 값(사람이 정한 흔적은 지운다)
export function unlinkRec(kind: LinkKind, row: number, l: { person_id: number | null; basis: string }, importId: number, nowIso: string) {
  return { kind, row_id: row, person_id: l.person_id, link_how: "auto", match_basis: l.basis, import_id: importId,
    linked_by: null, linked_at: null, updated_at: nowIso };
}
```

- [ ] **Step 4: 시험이 통과하는지 본다**

Run: `node --experimental-strip-types --test tests/people-links.test.mjs`
Expected: PASS 15/15

- [ ] **Step 5: 전체 점검**

Run: `python tools/preflight.py`
Expected: 마지막 줄 `모두 통과`

- [ ] **Step 6: 커밋(푸시 안 함)**

```bash
git add supabase/functions/church-admin/people-links.ts tests/people-links.test.mjs
git commit -m "feat(교인명부): 기록과 교인 잇기 규칙 people-links.ts(순수) — 맞음·번호만 · 이름 한 분뿐은 안 잇는다 · 번호로 이은 줄은 번호를 지워도 남김 · 탭 칸 지도" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 사역신청 번호 보관 — 결정 때 안 지움 · 「결정된 신청 번호 지우기」 `ministryPhoneClear`

**Files:**
- Modify: `supabase/functions/church-admin/ministry.ts`, `authz.ts`, `index.ts`(`ministryPaper` · 새 함수 · switch), `js/menus/system/audit.js`
- Test: `tests/ministry.test.mjs`, `tests/authz.test.mjs`, `tests/audit.test.mjs`, `tests/server.dev.test.mjs`

**Interfaces:**
- Produces: `ministry.ts` `export const DECIDED = ["임명확정","미채택","취소"]` · `statusPatch` 가 `phone` 을 patch 에 넣지 않는다(결정이면 `decided_at` 만) → `ministrySetStatus` 의 `phoneCleared` 는 늘 `false`(화면 `clearPhone` 길은 그대로 남되 돌지 않는다).
- Produces: 액션 `ministryPhoneClear {count}`(역할 ministry) → `{ok:true, year, count}` | `{ok:false, error:"conflict", count}`(보낸 수가 지금 수와 다르면 **쓰지 않는다**) · 기록 `ministry.phoneclear {count}`(target = 해).
- 「지금 수」 = 그 해(`app_config.ministry.year`) · 상태 `DECIDED` · `phone` 이 null 도 빈 글자도 아닌 줄.

- [ ] **Step 1: 실패하는 시험(순수)** — `tests/ministry.test.mjs` 의 두 시험을 바꾼다:
  - 「임명 — 결정일을 찍고 번호를 지우고 알림을 요청」 → 이름을 「임명 — 결정일을 찍고 알림을 요청 · 번호는 남긴다(2026-10-01 · 단추·180일로 지운다)」, 기대를
    `{ ok: true, patch: { status: "임명확정", updated_at: NOW, decided_at: NOW }, notify: true }` 로.
  - 「취소는 사유가 있어야」의 마지막 기대를
    `{ ok: true, patch: { status: "취소", updated_at: NOW, decided_at: NOW, note: "부서장 요청" }, notify: false }` 로.
  - 파일 끝에 더한다:

```js
test("DECIDED — 결정 상태 셋(번호 지우기 단추·180일 작업이 같은 목록을 쓴다)", async () => {
  const { DECIDED } = await import("../supabase/functions/church-admin/ministry.ts");
  assert.deepEqual(DECIDED, ["임명확정", "미채택", "취소"]);
  for (const st of ["임명확정", "취소"]) assert.equal("phone" in statusPatch("접수완료", st, "사유", NOW).patch, false, st);
});
```

- [ ] **Step 2: 돌려서 실패를 본다**

Run: `node --experimental-strip-types --test tests/ministry.test.mjs`
Expected: FAIL 3건(patch 에 `phone: null` 이 있다 · `DECIDED` 가 없다)

- [ ] **Step 3: `ministry.ts` 를 고친다**
  - `const DECIDED = ["임명확정", "미채택", "취소"];` 위 주석 두 줄을 아래로 바꾸고 `export` 를 붙인다:

```ts
// 결정 상태 — 이리로 바뀌면 결정일(decided_at)을 찍는다. 휴대폰 번호는 **지우지 않는다**(2026-10-01 친구 결정 —
// 결정 뒤에도 연락·교적 대조에 쓰고, 신청 현황 「결정된 신청 번호 지우기」 단추나 결정 뒤 180일 자동 작업(SQL 007)이 지운다).
// 번호 지우기 단추(index.ts ministryPhoneClear)도 이 목록을 쓴다.
export const DECIDED = ["임명확정", "미채택", "취소"];
```
  - `if (DECIDED.includes(status)) { patch.decided_at = nowIso; patch.phone = null; }` → `if (DECIDED.includes(status)) patch.decided_at = nowIso;`

- [ ] **Step 4: 순수 시험 통과**

Run: `node --experimental-strip-types --test tests/ministry.test.mjs`
Expected: PASS

- [ ] **Step 5: 권한 표 시험(실패)** — `tests/authz.test.mjs` 「ministry 액션 × 사람 여섯 가지」의 목록에 `"ministryPhoneClear"` 를 `"ministryPerson"` 뒤에 넣는다:

```js
  assert.deepEqual(ministryActions.sort(), ["ministryAppointed", "ministryCatalogAdmin", "ministryCatalogOrder",
    "ministryCatalogSave", "ministryDelete", "ministryList", "ministryPaperCheck", "ministryPaperSave",
    "ministryPerson", "ministryPhoneClear", "ministrySetStatus", "ministryTesterFind", "ministryTesterSave", "ministryTesters"]);
```
Run: `node --experimental-strip-types --test tests/authz.test.mjs` → Expected: FAIL(목록 다름)

- [ ] **Step 6: `authz.ts` — `ministryTesterSave: "ministry",` 다음 줄에**

```ts
  // 사역신청 번호 보관(2026-10-01 · 교인명부 세션 설계 §6) — 결정 때 번호를 지우지 않고, 신청 현황 「결정된 신청 번호 지우기(N건)」로.
  //   보낸 수(count)가 지금 수와 같을 때만 지운다(그사이 바뀌었으면 conflict · 시험 PROBE 도 이 길로 아무것도 안 바꾼다). 바꾼 기록 ministry.phoneclear.
  ministryPhoneClear: "ministry",
```
Run: `node --experimental-strip-types --test tests/authz.test.mjs` → Expected: PASS

- [ ] **Step 7: 기록 이름(실패 → 통과)** — `tests/audit.test.mjs` 끝에:

```js
test("ministry.phoneclear — 「사역 번호 지움」 · 지운 수", () => {
  assert.match(LABEL["ministry.phoneclear"], /[가-힣]/);
  assert.equal(detailText(R("ministry.phoneclear", { count: 12 }, "2027")), "결정된 신청 12건의 번호");
});
```
  Run → FAIL. 그다음 `js/menus/system/audit.js` 의 `LABEL` 에서 `"ministry.tester": "사역 시험 참여자",` 뒤에 `"ministry.phoneclear": "사역 번호 지움",` 을, `detailText` 의 `ministry.tester` 줄 뒤에:

```js
  if (r.action === "ministry.phoneclear") return `결정된 신청 ${d.count ?? 0}건의 번호`;
```
  Run: `node --experimental-strip-types --test tests/audit.test.mjs` → Expected: PASS

- [ ] **Step 8: 개발 서버 시험을 고치고 더한다(실패)** — `tests/server.dev.test.mjs`
  - `PROBE` 의 `ministryPerson: { name: "" },` 다음 줄에:

```js
  // 결정된 신청 번호 지우기(2026-10-01) — 보낸 수가 지금 수와 달라(-1) conflict · 아무것도 안 지운다
  ministryPhoneClear: { count: -1 },
```
  - 「신청 현황: 목록 모양 …」 시험에서 `assert.equal(ap.body.phoneCleared, true);` 와 그 아래 `church` 두 줄(주석 포함 세 줄)을 지우고:

```js
  assert.equal(ap.body.phoneCleared, false, "결정 때는 번호를 지우지 않는다(2026-10-01 · 단추·180일로)");
  assert.equal("church" in ap.body, false);
```
  - 같은 시험의 `assert.equal(after.find((x) => x.id === bRow.id).phone, "");` → `assert.equal(after.find((x) => x.id === bRow.id).phone, "010-0000-0000", "취소해도 번호는 남는다");`
  - 「종이 명단: …」 시험 이름의 「결정줄 번호 비움」→「결정줄 번호 남김」, `assert.equal(order1.phone, null, "결정 상태 줄은 번호를 지운다");` →
    `assert.equal(order1.phone, "010-1234-5678", "결정 상태 줄도 번호를 남긴다(2026-10-01)");`
  - 파일 **끝**에 더한다:

```js
// ---------- 사역신청 번호 보관 — 결정된 신청 번호 지우기(ministryPhoneClear · 2026-10-01) ----------
test("결정된 신청 번호 지우기: 수가 다르면 쓰지 않는다 · 결정된 줄만 · 결정 안 된 줄은 그대로 · 바꾼 기록", async () => {
  const m = people.ministry.token;
  const DEC = ["임명확정", "미채택", "취소"];
  const list = (await call(m, "ministryList")).body.list;
  const decided = list.filter((x) => DEC.includes(x.status) && x.phone);
  const open = list.filter((x) => !DEC.includes(x.status) && x.phone);
  assert.ok(decided.length >= 1, "앞 시험(신청 현황)의 임명 줄이 번호를 갖고 있어야 한다");
  const bad = await call(m, "ministryPhoneClear", { count: decided.length + 1 });
  assert.deepEqual([bad.body.ok, bad.body.error, bad.body.count], [false, "conflict", decided.length]);
  const still = (await call(m, "ministryList")).body.list;
  for (const x of decided) assert.equal(still.find((y) => y.id === x.id)?.phone, x.phone, "conflict 인데 지웠다 " + x.id);
  const ok = await call(m, "ministryPhoneClear", { count: decided.length });
  assert.equal(ok.body.ok, true, JSON.stringify(ok.body));
  assert.equal(ok.body.count, decided.length);
  const after = (await call(m, "ministryList")).body.list;
  for (const x of decided) assert.equal(after.find((y) => y.id === x.id)?.phone, "", "결정된 줄의 번호가 남았다 " + x.id);
  for (const x of open) assert.equal(after.find((y) => y.id === x.id)?.phone, x.phone, "결정 안 된 줄의 번호가 지워졌다 " + x.id);
  const log = (await call(people.super.token, "auditList", { limit: 30 })).body.rows.find((r) => r.action === "ministry.phoneclear");
  assert.equal(log?.detail?.count, decided.length, JSON.stringify(log));
  assert.equal((await call(people.directory.token, "ministryPhoneClear", { count: 0 })).status, 403);
});
```
  Run(아직 옛 함수): `set -a; . ~/.church-admin/dev.env; set +a; node --experimental-strip-types --test --test-name-pattern="PROBE|권한 표|신청 현황|종이 명단|결정된 신청 번호" tests/server.dev.test.mjs`
  Expected: FAIL(권한 표 — `unknown-action` 400 · 신청 현황 — phoneCleared true)

- [ ] **Step 9: `index.ts` 를 고친다**
  - import — 맨 위 import 묶음 끝(`import { churchForSignup } from "./events-person.ts";` 다음 줄)에:

```ts
// 사역신청 번호 보관(2026-10-01) — 결정 상태 목록(번호 지우기 단추가 같은 목록을 센다)
import { DECIDED } from "./ministry.ts";
```
  - `ministryPaper` 의 넣기 앞 주석 `// ⚠️ 결정이 난 상태(임명확정·취소)면 한 건씩 바꿀 때와 같이 휴대폰 번호를 지우고 decided_at 을 찍는다.` →
    `// ⚠️ 결정이 난 상태(임명확정·취소)면 decided_at 을 찍는다. 번호는 지우지 않는다(2026-10-01 친구 결정 — 「결정된 신청 번호 지우기」 단추·결정 뒤 180일 자동).`
  - 같은 함수 `if (decided) { patch.decided_at = r.decidedAt || now; patch.phone = null; }` → `if (decided) patch.decided_at = r.decidedAt || now;`
  - 같은 함수 `position: r.position, phone: decided ? null : r.phone,` → `position: r.position, phone: r.phone,`
  - `ministryDelete` 함수 **다음**에 새 함수:

```ts
// 결정된 신청 번호 지우기(2026-10-01 · 교인명부 세션 설계 §6) — 그 해(app_config) 결정(임명확정·미채택·취소)이고 번호가 남은 줄만.
//   count = 화면이 단추에 보인 수. 지금 수와 다르면(그사이 누가 임명·지우기를 했다) 쓰지 않고 conflict + 지금 수 —
//   담당자가 본 것보다 많이 지우지 않게(시험 PROBE 도 이 길로 아무것도 안 바꾼다).
//   지운 뒤 교적 표시는 화면이 목록을 다시 불러와(ministryList) 번호 없이 다시 센다. 번호로 이어 둔 교인 잇기(people_links)는 남는다
//   (지우는 것은 ministry_orders 의 번호뿐 · 그 뒤의 다시 맞추기는 people-links.ts phoneLinkKept 가 번호 줄을 건너뛴다).
async function ministryPhoneClear(ctx: Ctx, b: any) {
  const year = await ministryYear();
  const { count, error } = await db.from("ministry_orders").select("id", { count: "exact", head: true })
    .eq("year", year).in("status", DECIDED).not("phone", "is", null).neq("phone", "");
  if (error) throw error;
  const now = count ?? 0;
  const want = Number(b.count);
  if (!Number.isSafeInteger(want) || want !== now) return { ok: false, error: "conflict", count: now };
  if (!now) return { ok: true, year, count: 0 };
  const { data, error: e2 } = await db.from("ministry_orders").update({ phone: null, updated_at: new Date().toISOString() })
    .eq("year", year).in("status", DECIDED).not("phone", "is", null).neq("phone", "").select("id");
  if (e2) throw e2;
  const n = (data ?? []).length;
  await audit(ctx, "ministry.phoneclear", String(year), { count: n });
  return { ok: true, year, count: n };
}
```
  - `switch` 의 `case "ministryDelete": …` 다음 줄에: `      case "ministryPhoneClear": return json(await ministryPhoneClear(ctx, b));`

- [ ] **Step 10: 점검·개발 배포·개발 시험**

```bash
python tools/preflight.py                                   # 모두 통과
git merge main --no-edit                                    # 다른 세션이 main 에 넣은 것(없으면 Already up to date)
supabase functions deploy church-admin --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo
set -a; . ~/.church-admin/dev.env; set +a
node --experimental-strip-types --test --test-name-pattern="PROBE|권한 표|신청 현황|종이 명단|결정된 신청 번호|ministryPerson" tests/server.dev.test.mjs
```
Expected: preflight `모두 통과` · 개발 시험 `# fail 0`

- [ ] **Step 11: 커밋(푸시 안 함)**

```bash
git add supabase/functions/church-admin/ministry.ts supabase/functions/church-admin/authz.ts supabase/functions/church-admin/index.ts \
  js/menus/system/audit.js tests/ministry.test.mjs tests/authz.test.mjs tests/audit.test.mjs tests/server.dev.test.mjs
git commit -m "feat(사역신청): 결정 때 번호를 지우지 않는다 · 「결정된 신청 번호 지우기」 ministryPhoneClear(수가 맞을 때만)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 그때그때 잇기 · 「기록 잇기 맞추기」 `peopleLinkSync`

**Files:**
- Modify: `supabase/functions/church-admin/index.ts`, `authz.ts`, `js/menus/system/audit.js`, `js/core/ui.js`
- Test: `tests/authz.test.mjs`, `tests/audit.test.mjs`, `tests/ui.test.mjs`, `tests/server.dev.test.mjs`

**Interfaces:**
- Consumes: Task 2 `orderAutoRecs`·`signupAutoRecs`·`syncCounts`·`toLinkCand`·`linkRowOf`·`LinkLook`·`LinkRow`·`AutoRec`·`LinkKind` · Task 1 `people_links_auto(p_rows)`.
- Produces(index.ts 안):
  - `peopleImport() → {id, source_date, total} | null` · `peopleSource()` 는 그대로 `{source_date,total}|null`(응답 모양 안 바뀜)
  - `churchLookupLinked(names) → LinkLook | null`(churchLookup 과 같은 물음 + `person_id` 한 칸 · `churchLookup(names)` 은 이것의 `.idx`)
  - `linksOf(kind, ids) → Map<number, LinkRow>` · `writeAutoLinks(recs) → number`(rpc 500줄씩)
  - `fillOrderNames(rows)` — 이름·소속이 빈 옛 신청 줄을 앱 계정으로 채운다(ministryList 와 같은 규칙 · `appUserWho`)
  - `linkOrders(rows: OrderIn[], look, force=false)` · `linkSignups(rows, look, force=false)` · `linkSignupsByName(rows, force=false)` — **실패해도 던지지 않는다**(서버 로그만 · 화면은 그대로)
  - 액션 `peopleLinkSync {apply?: true}`(역할 super) → `{ok, dry, orders, signups, added, changed, unmatched}` + apply 면 `written` · `apply:true` 가 아니면 **쓰지도 기록하지도 않는다** · 명부가 없으면 `no-directory` · 기록 `people.linksync`(target = 명부 id · detail 수만 `{orders, signups, added, changed, unmatched, written}`)
- 그때그때 잇기 자리: `ministryList`(신청 줄 전부) · `ministryPaperSave`(넣거나 바꾼 줄) · `evRoster` · `evRowAdd` · `evRowSave`(force) · `evUploadSave`(넣은 줄) — 성경필사는 **초안 회차면 잇지 않는다**(기록 잇기 맞추기와 같게).

- [ ] **Step 1: 실패하는 시험(순수 셋)**
  - `tests/authz.test.mjs` 「super 액션 × 사람 다섯 가지」 목록 → `["auditList", "membersApprove", "membersList", "membersSetRoles", "membersSetStatus", "peopleLinkSync"]`
  - `tests/audit.test.mjs` 끝에:

```js
test("people.linksync — 「기록 잇기 맞추기」 · 수만", () => {
  assert.match(LABEL["people.linksync"], /[가-힣]/);
  assert.equal(detailText(R("people.linksync", { orders: 1200, signups: 2834, added: 3, changed: 1, unmatched: 12, written: 4034 }, "8")),
    "사역신청 1200줄 · 성경필사 2834줄 · 새로 이음 3 · 바뀜 1 · 못 맞춤 12");
});
```
  - `tests/ui.test.mjs` 끝에:

```js
test("교인명부 잇기 오류 코드 — 한국말(2026-10-01)", () => {
  for (const c of ["no-directory", "other-name", "not-linked", "bad-kind"]) assert.notEqual(errorText({ error: c }), "처리하지 못했어요", c);
});
```
  Run: `node --experimental-strip-types --test tests/authz.test.mjs tests/audit.test.mjs tests/ui.test.mjs` → Expected: FAIL 3건

- [ ] **Step 2: 순수 쪽을 채운다**
  - `authz.ts` `auditList: "super",` 다음 줄에:

```ts
  // 교인명부(2026-10-01) — 새 명부를 올린 뒤 사역신청·성경필사 기록을 교인과 다시 잇는다(auto 줄만 · 사람이 정한 줄은 그대로).
  //   apply:true 가 아니면 세기만 한다(시험 PROBE 가 아무것도 안 바꾸게). 기록 people.linksync(수만).
  peopleLinkSync: "super",
```
  - `audit.js` `LABEL` 의 `"people.import": "명부 올림",` 뒤에 `"people.linksync": "기록 잇기 맞추기",` · `detailText` 의 `people.import` 줄 뒤에:

```js
  if (r.action === "people.linksync") return joinDot(`사역신청 ${d.orders ?? 0}줄`, `성경필사 ${d.signups ?? 0}줄`,
    `새로 이음 ${d.added ?? 0}`, `바뀜 ${d.changed ?? 0}`, `못 맞춤 ${d.unmatched ?? 0}`);
```
  - `ui.js` `MESSAGES` 끝(`"too-many": …,` 다음)에:

```js
  // 교인명부 「자세히」 창 잇기(2026-10-01)
  "no-directory": "교인명부가 아직 없어요 — 명부를 먼저 올려 주세요",
  "other-name": "이 기록은 이분과 이름이 달라요 — 창을 닫고 다시 열어 주세요",
  "not-linked": "이미 풀렸거나 다른 분께 이어진 기록이에요 — 창을 닫고 다시 열어 주세요",
  "bad-kind": "이 기록은 아직 여기서 이을 수 없어요 — 🤝 사역 이력 메뉴에서 고쳐 주세요",
```
  Run: 위 세 시험 → Expected: PASS

- [ ] **Step 3: 개발 서버 시험(실패)** — `tests/server.dev.test.mjs`
  - 맨 위 상수 묶음(`let mpReady = null;` 다음)에:

```js
// 교인명부 잇기(2026-10-01 · people_links) — 교인명부 세 분(교인ID 990000061~3 고정 · 이름 ca-test-pl-<STAMP>-가 둘 · -나 하나) ·
//   신청 넷(user_id = 신청마다 만든 시험 users 「ca-test-pl-<STAMP>-o1…o4」의 uuid) · 성경필사 회차 하나(archived — 초안은 잇지 않는다)와 줄 셋.
//   ⚠️ 신청의 user_id 에 글자를 넣지 않는다 — 칸은 text 라 들어가지만 신청 현황(ministryList)이 그 해 신청 줄 전부의 user_id 로
//      push_subscriptions(user_id uuid)를 물어 22P02 → 500(개발 DB 한 벌 — 모든 세션의 신청 현황이 깨진다). 기존 minTestUserId 와 같은 꼴.
//   첫 시험이 한 번 만든다(plFixtures) · after() 가 지운다(신청 → users 차례). 번호는 만든다(plPhone).
const PL = { a: `ca-test-pl-${STAMP}-가`, b: `ca-test-pl-${STAMP}-나`, ids: [990000061, 990000062, 990000063],
  ev: "ca-test-pl-" + STAMP, orders: {}, signups: {} };
const plPhone = (n) => "010-0000-01" + n;
let plReady = null;
const RUN_START = new Date().toISOString();   // 이번 실행이 만든 잇기 줄 찌꺼기 쓸기(after)
```
  - `PROBE` 끝(`evPerson: { name: "" },` 다음)에:

```js
  // 교인명부 기록 잇기 맞추기(2026-10-01) — apply 없이 부르면 세기만 한다(쓰지도 기록하지도 않는다)
  peopleLinkSync: {},
```
  - `after()` 의 `if (errs.length) throw …` **바로 앞**에:

```js
  // 교인명부 잇기 시험 — 잇기 줄(FK 가 없어 저절로 안 지워진다) · 신청 · 교인명부. 회차는 「성경필사 시험 회차」 단계가 지운다(줄은 CASCADE).
  await step("잇기 시험", async () => {
    const oIds = Object.values(PL.orders), sIds = Object.values(PL.signups);
    if (oIds.length) await rest(`people_links?kind=eq.order&row_id=in.(${oIds.join(",")})`, "DELETE");
    if (sIds.length) await rest(`people_links?kind=eq.signup&row_id=in.(${sIds.join(",")})`, "DELETE");
    // 신청 먼저, 그다음 그 신청의 시험 users — plFixtures 가 도중에 멈췄어도(PL.orders 가 비어도) 이름으로 찾아 지운다
    const us = await rest(`users?select=id&name=like.ca-test-pl-${STAMP}-*`, "GET");
    if (us.length) await rest(`ministry_orders?user_id=in.(${us.map((u) => u.id).join(",")})`, "DELETE");
    await rest(`users?name=like.ca-test-pl-${STAMP}-*`, "DELETE");
    await rest(`church_people?person_id=in.(${PL.ids.join(",")})`, "DELETE");
  });
  await step("이번 실행이 만든 잇기 찌꺼기", () => sweepLinks(RUN_START));
```
  - 파일 끝에 도우미와 시험 둘:

```js
// ---------- 교인명부 — 기록과 교인 잇기(people_links · 2026-10-01) ----------
function plFixtures() {
  plReady ??= (async () => {
    await rest(`church_people?person_id=in.(${PL.ids.join(",")})`, "DELETE");
    const d = (person_id, name, mok1, mok3, n) => ({ person_id, name, name_key: name, kind2: "장년", mok1, mok3, position: "집사",
      phone1: plPhone(n), phone_digits: plPhone(n).replace(/\D/g, "") });
    await rest("church_people", "POST", [d(PL.ids[0], PL.a, "화평", "화평-20목장", 61), d(PL.ids[1], PL.a, "소망", "소망-3목장", 62),
      d(PL.ids[2], PL.b, "믿음", "믿음-1목장", 63)]);
    const cfg = await rest("app_config?select=value&key=eq.ministry", "GET");
    const year = Number(cfg[0]?.value?.year) || 2027;
    const [cat] = await rest("ministry_catalog?select=id&order=id&limit=1", "GET");
    // 신청마다 시험 users 한 줄(진짜 uuid — 위 PL 주석 ⚠️) · 기존 신청 현황 시험(minTestUserId)과 같은 꼴
    const us = await rest("users", "POST", ["o1", "o2", "o3", "o4"].map((k) => ({ type: "교구", gu: "시험", mok: "0",
      name: `ca-test-pl-${STAMP}-${k}`, identity_key: `교구|시험|0|||ca-test-pl-${STAMP}-${k}` })));
    const uid = Object.fromEntries(us.map((u) => [u.name.split("-").pop(), u.id]));    // "o1" → uuid
    const kOf = Object.fromEntries(us.map((u) => [u.id, u.name.split("-").pop()]));    // uuid → "o1"
    // ⚠️ 배치 insert 는 객체들의 칸이 모두 같아야 한다(PGRST102) — o() 한 모양
    const o = (k, name, who, phone) => ({ year, user_id: uid[k], team_id: cat.id, committee: "시험부", team: "시험팀",
      name, who, phone, status: "신청완료", source: "app" });
    const rows = await rest("ministry_orders", "POST", [o("o1", PL.a, "화평 20목장", null), o("o2", PL.a, "기쁨 5목장", plPhone(62)),
      o("o3", PL.a, "기쁨 5목장", null), o("o4", PL.b, "사랑 2목장", null)]);
    for (const r of rows) PL.orders[kOf[r.user_id]] = r.id;
    await rest("events", "POST", { id: PL.ev, title: "ca-test 잇기 회차 " + STAMP, short_title: "", subtitle: "", season: "",
      kind: "signup", status: "archived", opens_on: "2000-07-01", closes_on: "2000-07-31", list_until: null,
      needs: { position: true, phone: false, memo: false, extra: [] } });
    const s = (k, name, group, sub) => ({ event_id: PL.ev, user_id: null, source: "import", who_type: "교구", group_name: group,
      sub_name: sub, name, ident_key: `교구|${group}|${sub}|||${name}`, position: "집사", phone: "", memo: "", answers: {}, note: k });
    const sig = await rest("event_signups", "POST", [s("s1", PL.a, "화평", "20"), s("s2", PL.a, "기쁨", "5"), s("s3", PL.b, "사랑", "2")]);
    for (const r of sig) PL.signups[r.note] = r.id;
  })();
  return plReady;
}
const linkOf = async (kind, id) =>
  (await rest(`people_links?select=person_id,link_how,match_basis,import_id,linked_by&kind=eq.${kind}&row_id=eq.${id}`, "GET"))[0] ?? null;
// 이번 실행이 만든 잇기 줄 가운데 원래 줄이 지워진 것(시험 신청·명단 줄) — FK 가 없어 저절로 안 지워진다
async function sweepLinks(since) {
  const links = await rest(`people_links?select=kind,row_id&updated_at=gte.${encodeURIComponent(since)}&limit=5000`, "GET");
  for (const [kind, table] of [["order", "ministry_orders"], ["signup", "event_signups"]]) {
    const ids = links.filter((l) => l.kind === kind).map((l) => l.row_id);
    for (let i = 0; i < ids.length; i += 200) {
      const part = ids.slice(i, i + 200);
      const alive = new Set((await rest(`${table}?select=id&id=in.(${part.join(",")})`, "GET")).map((r) => r.id));
      const gone = part.filter((id) => !alive.has(id));
      if (gone.length) await rest(`people_links?kind=eq.${kind}&row_id=in.(${gone.join(",")})`, "DELETE");
    }
  }
}

test("그때그때 잇기: 신청 현황·성경필사 명단을 열면 이어진다 — 맞음·번호 · 이름 한 분뿐은 안 잇는다 · 사람이 정한 줄은 그대로 · 옛 명부 auto 는 다시", async () => {
  await plFixtures();
  const list = await call(people.ministry.token, "ministryList");
  assert.equal(list.body.ok, true, JSON.stringify(list.body));
  const o = PL.orders;
  const l1 = await linkOf("order", o.o1), l2 = await linkOf("order", o.o2), l3 = await linkOf("order", o.o3), l4 = await linkOf("order", o.o4);
  assert.deepEqual([l1?.person_id, l1?.link_how, l1?.match_basis, l1?.linked_by], [PL.ids[0], "auto", "맞음", null]);
  assert.deepEqual([l2?.person_id, l2?.match_basis], [PL.ids[1], "번호"]);
  assert.deepEqual([l3?.person_id, l3?.link_how], [null, "auto"], "같은 이름 둘 · 소속 다름 · 번호 없음 — 못 맞춤");
  assert.deepEqual([l4?.person_id, l4?.link_how], [null, "auto"], "이름이 명부에 한 분뿐이어도 소속이 다르면 잇지 않는다");
  assert.ok(Number(l1.import_id) > 0);
  const row1 = list.body.list.find((x) => x.id === o.o1);
  assert.deepEqual(row1.church, { state: "맞음", reason: "" });
  assert.equal("person_id" in row1, false, "잇기는 응답에 싣지 않는다");
  const ro = await call(people.bibleevent.token, "evRoster", { event_id: PL.ev });
  assert.equal(ro.body.ok, true, JSON.stringify(ro.body));
  const s1 = await linkOf("signup", PL.signups.s1);
  assert.deepEqual([s1?.person_id, s1?.match_basis], [PL.ids[0], "맞음"]);
  assert.deepEqual([(await linkOf("signup", PL.signups.s2))?.person_id, (await linkOf("signup", PL.signups.s3))?.person_id], [null, null]);
  // 사람이 정한 줄(서비스 키로 심는다)은 다시 열어도 그대로 · 옛 명부로 맞춘 auto 줄은 지금 명부로
  await rest(`people_links?kind=eq.order&row_id=eq.${o.o3}`, "PATCH", { person_id: PL.ids[1], link_how: "manual", match_basis: "사람이 이음" });
  await rest(`people_links?kind=eq.signup&row_id=eq.${PL.signups.s1}`, "PATCH", { person_id: null, link_how: "none", match_basis: "" });
  await rest(`people_links?kind=eq.order&row_id=eq.${o.o1}`, "PATCH", { import_id: 1 });
  await call(people.ministry.token, "ministryList");
  await call(people.bibleevent.token, "evRoster", { event_id: PL.ev });
  const m3 = await linkOf("order", o.o3), n1 = await linkOf("signup", PL.signups.s1);
  assert.deepEqual([m3?.person_id, m3?.link_how], [PL.ids[1], "manual"]);
  assert.deepEqual([n1?.person_id, n1?.link_how], [null, "none"]);
  assert.equal(Number((await linkOf("order", o.o1)).import_id), Number(l1.import_id), "옛 명부 auto 줄은 지금 명부로 다시");
  // 다음 시험을 위해 되돌린다(o3·s1 을 auto 로 — 다시 열면 규칙대로 맞춘다)
  await rest(`people_links?kind=eq.order&row_id=eq.${o.o3}`, "PATCH", { person_id: null, link_how: "auto", match_basis: "", import_id: 1 });
  await rest(`people_links?kind=eq.signup&row_id=eq.${PL.signups.s1}`, "PATCH", { person_id: null, link_how: "auto", match_basis: "", import_id: 1 });
});

test("기록 잇기 맞추기(peopleLinkSync): apply 없이는 쓰지 않는다 · apply 면 auto 줄만 다시 · 번호로 이은 줄은 번호를 지워도 그대로 · 수만 기록 · 총괄만", async () => {
  await plFixtures();
  await rest(`people_links?kind=eq.order&row_id=eq.${PL.orders.o2}`, "DELETE");     // 줄이 없으면 「새로 이음」
  const dry = await call(people.super.token, "peopleLinkSync", {});
  assert.equal(dry.body.ok, true, JSON.stringify(dry.body));
  assert.equal(dry.body.dry, true);
  for (const k of ["orders", "signups", "added", "changed", "unmatched"]) assert.equal(typeof dry.body[k], "number", k);
  assert.ok(dry.body.added >= 1, JSON.stringify(dry.body));
  assert.equal(await linkOf("order", PL.orders.o2), null, "apply 없이 썼다");
  const ap = await call(people.super.token, "peopleLinkSync", { apply: true });
  assert.equal(ap.body.ok, true, JSON.stringify(ap.body));
  assert.equal(ap.body.dry, false);
  assert.equal((await linkOf("order", PL.orders.o2))?.person_id, PL.ids[1]);
  assert.equal((await linkOf("signup", PL.signups.s1))?.person_id, PL.ids[0]);
  const log = (await call(people.super.token, "auditList", { limit: 20, kind: "people" })).body.rows.find((r) => r.action === "people.linksync");
  assert.ok(log, "people.linksync 기록");
  assert.deepEqual(Object.keys(log.detail).sort(), ["added", "changed", "orders", "signups", "unmatched", "written"]);
  // 번호로 이은 줄(o2 → 62 · 「번호」)은 그 신청의 번호를 지운 뒤에도 그대로(설계 §3.1-3) — 번호를 지우고(📵 단추·180일 작업 자리)
  //   새 명부로 바뀐 것처럼(import_id 1) 둔 뒤 「기록 잇기 맞추기」·신청 현황 열기를 해도 끊기지 않는다
  await rest(`ministry_orders?id=eq.${PL.orders.o2}`, "PATCH", { phone: null });
  await rest(`people_links?kind=eq.order&row_id=eq.${PL.orders.o2}`, "PATCH", { import_id: 1 });
  try {
    assert.equal((await call(people.super.token, "peopleLinkSync", { apply: true })).body.ok, true);
    await call(people.ministry.token, "ministryList");
    const k2 = await linkOf("order", PL.orders.o2);
    assert.deepEqual([k2?.person_id, k2?.link_how, k2?.match_basis], [PL.ids[1], "auto", "번호"], "번호를 지웠더니 잇기가 끊겼다");
  } finally {
    await rest(`ministry_orders?id=eq.${PL.orders.o2}`, "PATCH", { phone: plPhone(62) });   // 뒤 시험은 번호가 있는 o2 를 쓴다
  }
  assert.equal((await call(people.directory.token, "peopleLinkSync", { apply: true })).status, 403);
});
```
  Run(옛 함수): `node --experimental-strip-types --test --test-name-pattern="PROBE|권한 표|그때그때 잇기|기록 잇기 맞추기" tests/server.dev.test.mjs`
  Expected: FAIL(잇기 줄 없음 · unknown-action)

- [ ] **Step 4: `index.ts` — import 한 줄**(Task 3 의 `DECIDED` 줄 다음):

```ts
// 교인명부 — 기록과 교인 잇기(2026-10-01 · people_links) — 이 묶음의 이름은 people-links.ts 에서만 가져온다
import { orderAutoRecs, signupAutoRecs, syncCounts, toLinkCand, linkRowOf, type AutoRec, type LinkKind, type LinkLook, type LinkRow } from "./people-links.ts";
```

- [ ] **Step 5: `index.ts` — 명부 기준·교적 후보를 넓힌다.** `// 명부 기준일 — 마지막으로 올린 기록 …` 주석부터 `churchLookup` 함수 끝까지(사이의 `peopleSource` 함수·churchLookup 주석 넷째 줄까지 **한 덩어리**)를 아래로 바꾼다 — 옛 churchLookup 주석(kind2 ⚠️)은 새 덩어리 안에 그대로 옮겨 두었다:

```ts
// 명부 기준 — 마지막으로 올린 기록. 한 번도 안 올렸으면 null(화면은 「아직 명부가 없어요」)
// id 는 잇기(people_links.import_id — 「어느 명부로 맞췄나」)에만 쓴다 — 응답에는 peopleSource(기준일·인원)만 나간다.
async function peopleImport(): Promise<{ id: number; source_date: string; total: number } | null> {
  const { data, error } = await db.from("church_people_imports").select("id,source_date,total")
    .order("id", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data ? { id: Number(data.id), source_date: data.source_date, total: data.total } : null;
}
async function peopleSource(): Promise<{ source_date: string; total: number } | null> {
  const s = await peopleImport();
  return s ? { source_date: s.source_date, total: s.total } : null;
}

// 사역신청 줄을 교적과 맞댄다 — 명부가 한 번도 안 올라왔으면 null(화면이 표시를 아예 그리지 않는다).
// 신청자 이름으로만 묻는다(200개씩) — 8,672명 전체를 읽지 않게.
// kind2 — 판정에만 쓴다: 명부의 아이 가리기(people-match.ts candKid — 「남성」 갈래는 사역 줄도) · 성경필사 줄의 「옮겨 적은 줄」(churchForSignup).
//   ⚠️ 이 칸을 select 에서 빼면 아이를 못 가려 조용히 틀린다(오류가 아니다). 응답엔 { state, reason } 두 칸만 간다.
// 같은 물음에 교인ID 한 칸만 더 읽어 그때그때 잇기에도 쓴다(2026-10-01 · 묻기가 늘지 않는다 · person_id 는 잇기에만 — 응답에 싣지 않는다).
//   asked = 물어본 이름 키(명부에 없는 이름도) — 잇기는 물어본 이름의 줄만 맞춘다(안 물어본 이름을 「못 맞춤」으로 적지 않게).
async function churchLookupLinked(names: unknown[]): Promise<LinkLook | null> {
  const imp = await peopleImport();
  if (!imp) return null;
  const keys = lookupKeys(names);
  const idx = new Map<string, ReturnType<typeof toLinkCand>[]>();
  for (let i = 0; i < keys.length; i += 200) {
    const { data, error } = await db.from("church_people").select("person_id,name_key,mok1,mok3,school_dept,phone_digits,kind2")
      .in("name_key", keys.slice(i, i + 200));
    if (error) throw error;
    for (const r of (data ?? []) as any[]) {
      if (!idx.has(r.name_key)) idx.set(r.name_key, []);
      idx.get(r.name_key)!.push(toLinkCand(r));
    }
  }
  return { idx, asked: new Set(keys), importId: imp.id };
}
async function churchLookup(names: unknown[]): Promise<Map<string, Cand[]> | null> {
  const look = await churchLookupLinked(names);
  return look ? look.idx : null;
}
```

- [ ] **Step 6: `index.ts` — 잇기 도우미와 `peopleLinkSync`.** `peopleExport` 함수 **다음**에:

```ts
// ---------- 교인명부 — 기록과 교인 잇기(people_links · 2026-10-01) ----------
// 설계: v2 docs/superpowers/specs/2026-10-01-person-history-tabs-design.md §3 · 규칙은 people-links.ts(순수).
// ⚠️ 자동 쓰기는 people_links_auto()(SQL 006) 하나로만 — 그 안의 where 가 manual·none 을 덮지 않게 막는다.
// ⚠️ 그때그때 잇기는 덧붙는 일이다 — 실패해도 던지지 않는다(명단·넣기 결과는 그대로 · 서버 로그로만).
const LINK_COLS = "kind,row_id,person_id,link_how,match_basis,import_id";

async function linksOf(kind: LinkKind, ids: number[]): Promise<Map<number, LinkRow>> {
  const out = new Map<number, LinkRow>();
  const uniq = [...new Set(ids.filter((x) => Number.isSafeInteger(x) && x > 0))];
  for (let i = 0; i < uniq.length; i += 300) {
    const { data, error } = await db.from("people_links").select(LINK_COLS).eq("kind", kind).in("row_id", uniq.slice(i, i + 300));
    if (error) throw error;
    for (const r of (data ?? []) as any[]) out.set(Number(r.row_id), linkRowOf(r));
  }
  return out;
}
async function writeAutoLinks(recs: AutoRec[]): Promise<number> {
  let n = 0;
  for (let i = 0; i < recs.length; i += 500) {
    const { data, error } = await db.rpc("people_links_auto", { p_rows: recs.slice(i, i + 500) });
    if (error) throw error;
    n += Number(data) || 0;
  }
  return n;
}
// 이름·소속이 빈 옛 신청 줄은 앱 계정(users)에서 채운다 — ministryList 와 같은 규칙(appUserWho). user_id 는 메모리에만.
async function fillOrderNames(rows: any[]): Promise<any[]> {
  const need = [...new Set(rows.filter((r) => !r.name || !r.who).map((r) => r.user_id).filter(Boolean))];
  const umap = new Map<string, any>();
  for (let i = 0; i < need.length; i += 200) {
    const { data, error } = await db.from("users").select("id,type,gu,mok,bu,grade,name").in("id", need.slice(i, i + 200));
    if (error) throw error;
    for (const u of (data ?? []) as any[]) umap.set(u.id, u);
  }
  return rows.map((r) => {
    const u = umap.get(r.user_id);
    return { ...r, name: r.name || u?.name || "", who: r.who || (u ? appUserWho(u) : "") };
  });
}
async function linkOrders(rows: { id: number; name: string; who: string; phone?: string | null }[], look: LinkLook | null, force = false) {
  if (!look || !rows.length) return;
  try {
    const recs = orderAutoRecs(rows, look, await linksOf("order", rows.map((r) => Number(r.id))), force);
    if (recs.length) await writeAutoLinks(recs);
  } catch (e) { console.error("linkOrders", e); }
}
async function linkSignups(rows: any[], look: LinkLook | null, force = false) {
  if (!look || !rows.length) return;
  try {
    const recs = signupAutoRecs(rows, look, await linksOf("signup", rows.map((r) => Number(r.id))), force);
    if (recs.length) await writeAutoLinks(recs);
  } catch (e) { console.error("linkSignups", e); }
}
// 교적 후보를 아직 안 읽은 자리(명단 올리기 넣기) — 넣은 줄의 이름으로 한 번 묻고 잇는다
async function linkSignupsByName(rows: any[], force = false) {
  if (!rows.length) return;
  try { await linkSignups(rows, await churchLookupLinked(rows.map((r) => r.name)), force); }
  catch (e) { console.error("linkSignupsByName", e); }
}

// 기록 잇기 맞추기(총괄 · 설계 §3.1-1) — 새 명부를 올린 뒤 한 번. 사역신청 줄 전부(모든 해)와 성경필사 줄 전부(초안 회차 빼고)를
// 지금 명부로 다시 맞춘다(auto·줄 없음만 — manual·none 은 그대로). apply:true 가 아니면 세기만 한다(쓰지도 기록하지도 않는다).
async function peopleLinkSync(ctx: Ctx, b: any) {
  const apply = b.apply === true;
  if (!(await peopleImport())) return { ok: false, error: "no-directory" };
  const [orders, signups, evs, links] = await Promise.all([
    allRows(() => db.from("ministry_orders").select("id,user_id,name,who,phone").order("id", { ascending: true })),
    allRows(() => db.from("event_signups").select("id,event_id,who_type,group_name,sub_name,name").order("id", { ascending: true })),
    allRows(() => db.from("events").select("id,status").order("id", { ascending: true })),
    allRows(() => db.from("people_links").select(LINK_COLS).order("kind", { ascending: true }).order("row_id", { ascending: true })),
  ]);
  const ord = await fillOrderNames(orders);
  const draft = new Set(evs.filter((e) => e.status === "draft").map((e) => e.id));
  const sig = signups.filter((s) => !draft.has(s.event_id));
  const look = await churchLookupLinked([...ord.map((o) => o.name), ...sig.map((s) => s.name)]);
  if (!look) return { ok: false, error: "no-directory" };
  const cur = { order: new Map<number, LinkRow>(), signup: new Map<number, LinkRow>() };
  for (const l of links) { const r = linkRowOf(l); if (r.kind === "order" || r.kind === "signup") cur[r.kind].set(r.row_id, r); }
  const oRecs = orderAutoRecs(ord, look, cur.order, true), sRecs = signupAutoRecs(sig, look, cur.signup, true);
  const oc = syncCounts(cur.order, oRecs), sc = syncCounts(cur.signup, sRecs);
  const counts = { orders: ord.length, signups: sig.length, added: oc.added + sc.added, changed: oc.changed + sc.changed,
    unmatched: oc.unmatched + sc.unmatched };
  if (!apply) return { ok: true, dry: true, ...counts };
  const written = await writeAutoLinks([...oRecs, ...sRecs]);
  await audit(ctx, "people.linksync", String(look.importId), { ...counts, written });
  return { ok: true, dry: false, ...counts, written };
}
```

- [ ] **Step 7: `index.ts` — 그때그때 잇기를 여섯 자리에 붙인다**(원래 글자로 찾는다)
  - `ministryList`: `const churchIdx = await churchLookup(rows.map((r) => r.name || umap.get(r.user_id)?.name || ""));` 를 →

```ts
  //   같은 물음에 교인ID 를 함께 읽어 그때그때 잇기에도 쓴다(2026-10-01 · 묻기가 늘지 않는다 · 실패해도 목록은 그대로)
  const look = await churchLookupLinked(rows.map((r) => r.name || umap.get(r.user_id)?.name || ""));
  const churchIdx = look ? look.idx : null;
  await linkOrders(rows.map((r) => {
    const u = umap.get(r.user_id);
    return { id: r.id, name: r.name || u?.name || "", who: r.who || (u ? appUserWho(u) : ""), phone: r.phone ?? "" };
  }), look);
```
  - `ministryPaper`: ① `.select("id,user_id,name,phone,team_id,status").eq("year", year));` → `.select("id,user_id,name,who,phone,team_id,status").eq("year", year));`
    ② `const churchIdx = await churchLookup(rows.map((r: any) => r.name));` → 두 줄:

```ts
  const look = await churchLookupLinked(rows.map((r: any) => r.name));   // 넣은 뒤 그때그때 잇기에도 쓴다(2026-10-01)
  const churchIdx = look ? look.idx : null;
```
    ③ `let added = 0;` 다음 줄에 `  const newIds = new Map<number, number>();   // 새로 넣은 신청 id — 그때그때 잇기용(응답엔 싣지 않는다)`
    ④ `const { error: e4 } = await db.from("ministry_orders").insert(insert);` 과 `if (e4) throw e4;` 를 →

```ts
      const { data: ins, error: e4 } = await db.from("ministry_orders").insert(insert).select("id").single();
      if (e4) throw e4;
      newIds.set(r.i, Number(ins.id));
```
    ⑤ `await audit(ctx, "ministry.paper", …);` 문 **다음**(return 앞)에:

```ts
  // 그때그때 잇기(2026-10-01) — 넣거나 바꾼 신청을 교인과 잇는다(읽어 둔 look · 실패해도 넣기 결과는 그대로).
  //   앱 신청과 겹친 줄(dupId — 바꿨거나 그대로)은 그 신청에 남은 이름·소속·번호로(신청 현황의 교적 표시와 같은 줄).
  const byId = new Map(orders.map((o: any) => [Number(o.id), o]));
  await linkOrders(good.filter((r: any) => r.saved).map((r: any) => {
    if (r.dupId) {
      const o = byId.get(Number(r.dupId));
      return { id: Number(r.dupId), name: o?.name ?? "", who: o?.who ?? "", phone: o?.phone ?? "" };
    }
    return { id: newIds.get(r.i) ?? 0, name: r.name, who: r.gu + " " + r.mok.replace(/목장$/, "") + "목장", phone: r.phone };
  }).filter((x: any) => x.id > 0), look);
```
  - `evRoster`: `const idx = await churchLookup(rows.map((r) => r.name));` →

```ts
  const look = await churchLookupLinked(rows.map((r) => r.name));
  const idx = look ? look.idx : null;
  if (ev.status !== "draft") await linkSignups(rows, look);   // 그때그때 잇기(2026-10-01 · 초안 회차는 잇지 않는다)
```
  - `evRowAdd`: `const church = await evRowChurch(row);` →

```ts
  const look = await churchLookupLinked([row.name]);   // 교적 표시와 그때그때 잇기가 같은 후보(2026-10-01)
  const church = churchForSignup(look ? look.idx : null, row);
```
    그리고 `await audit(ctx, "event.add", …);` 문 다음(return 앞)에 `  if (ev.status !== "draft") await linkSignups([saved], look);`
  - `evRowSave`: `const church = await evRowChurch(next);` →

```ts
  const look = await churchLookupLinked([next.name]);
  const church = churchForSignup(look ? look.idx : null, next);
```
    그리고 `await audit(ctx, "event.edit", …);` 문 다음(return 앞)에
    `  if (ev.status !== "draft") await linkSignups([saved[0]], look, true);   // 소속·이름을 고쳤을 수 있다 — auto 줄은 다시 맞춘다`
  - `evUpload`: ① `let saved = 0;` 다음 줄에 `  const savedRows: any[] = [];   // 그때그때 잇기용 — 넣은 줄의 id·구분·소속·세부·이름`
    ② `const { error } = await db.from("event_signups").insert(chunk.map((x) => x.rec));` → `const { data: got, error } = await db.from("event_signups").insert(chunk.map((x) => x.rec)).select("id,who_type,group_name,sub_name,name");`
    ③ `if (!error) { saved += chunk.length; continue; }` → `if (!error) { saved += chunk.length; savedRows.push(...((got ?? []) as any[])); continue; }`
    ④ `const { error: e1 } = await db.from("event_signups").insert(x.rec);` → `const { data: one, error: e1 } = await db.from("event_signups").insert(x.rec).select("id,who_type,group_name,sub_name,name");`
    ⑤ `if (!e1) { saved++; continue; }` → `if (!e1) { saved++; savedRows.push(...((one ?? []) as any[])); continue; }`
    ⑥ `if (raws.length) {` (event.upload 기록) **앞**에 `  if (ev.status !== "draft") await linkSignupsByName(savedRows);`
  - `switch` 끝(`case "ministryPerson": …` 다음)에 `      case "peopleLinkSync": return json(await peopleLinkSync(ctx, b));`

- [ ] **Step 8: 점검·개발 배포·개발 시험**

```bash
python tools/preflight.py
git merge main --no-edit
supabase functions deploy church-admin --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo
set -a; . ~/.church-admin/dev.env; set +a
node --experimental-strip-types --test tests/server.dev.test.mjs
```
Expected: preflight `모두 통과` · 개발 시험 **전부** `# fail 0`(앞 Task 들과 기존 성경필사·사역 시험이 잇기 때문에 깨지지 않는지까지)

- [ ] **Step 9: 커밋(푸시 안 함)**

```bash
git add supabase/functions/church-admin/index.ts supabase/functions/church-admin/authz.ts js/menus/system/audit.js js/core/ui.js \
  tests/authz.test.mjs tests/audit.test.mjs tests/ui.test.mjs tests/server.dev.test.mjs
git commit -m "feat(교인명부): 그때그때 잇기(신청 현황·종이 명단·성경필사 명단·올리기·더하기·고치기) · 기록 잇기 맞추기 peopleLinkSync(총괄)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git rev-parse --short HEAD      # 다음 단계 알림에 적는다
```

- [ ] **Step 10: e5(성경필사) 세션에 알린다** — 설계 §8 은 e5 가 성경필사 서버에 「그때그때 잇기 한 줄(`linkSignups(rows, idx)`)」을 넣는다고 약속했는데, 이 Task 가 그 자리(evRoster·evUpload·evRowAdd·evRowSave)에 **이미 넣었고 모양도 다르다**(`linkSignups(rows, look: LinkLook|null, force)`). e5 가 설계대로 `idx`(Map)를 넘기면 `.asked` 가 없어 TypeError 가 나고, `linkSignups` 의 try/catch 가 삼켜 **아무 표시 없이** 잇기가 빠진다. 또 e5 가지(`autumn-excuse`)도 `evRowSave`(메모 지키기 `guardMemo`)를 고치고 있어 합칠 때 겹친다.
  `ListAgents` 로 e5 세션(성경필사 · 가지 `autumn-excuse`)을 찾아 `SendMessage`(위 해시를 `<해시>` 자리에):

  > 교인명부 세션입니다. 성경필사 명단(evRoster)·올리기(evUpload)·더하기(evRowAdd)·고치기(evRowSave)의 「그때그때 잇기」(people_links)는 교인명부 가지 `person-history` 커밋 <해시> 에 이미 넣었습니다 — 설계 §8 의 한 줄을 따로 넣지 마세요. 새 자리가 생기면 `await linkSignups(rows, await churchLookupLinked(rows.map((r) => r.name)))` 꼴입니다(`idx` Map 이 아니라 LinkLook — Map 을 넘기면 오류를 삼켜 조용히 안 잇습니다). evRowSave 는 그쪽(guardMemo)과 이쪽(교적 후보 `churchLookupLinked`·끝의 `linkSignups(…, true)`)이 같은 함수를 고쳐 합칠 때 겹칠 수 있습니다.

  SendMessage 가 없거나 e5 세션이 안 보이면 진행 기록(`.superpowers/sdd/progress.md`)에 「e5 알림 못 함」을 적고 Task 11 Step 9 에서 다시 보낸다.

---

### Task 5: 서버 이력 — `peoplePerson` history · `peopleHistory` · `peopleLink`

**Files:**
- Modify: `supabase/functions/church-admin/index.ts`, `authz.ts`, `js/menus/system/audit.js`
- Test: `tests/authz.test.mjs`, `tests/audit.test.mjs`, `tests/server.dev.test.mjs`

**Interfaces:**
- Consumes: Task 2 `historyTabs`·`unlinkedRows`·`movedOrderIds`·`parseLink`·`linkPatch`·`unlinkRec`·`missingTable`·`orderAutoRecs`·`signupAutoRecs` · Task 4 `linksOf`·`fillOrderNames`·`churchLookupLinked`.
- Produces:
  - `personHistory(personId) → PersonHistory` — `peoplePerson` 응답에 `history`(기록은 `people.view` 한 줄 그대로).
  - 액션 `peopleHistory {id}`(directory) → `{ok, rows}`(Task 2 `unlinkedRows` 칸) · 없는 교인 `not-found` · **기록 없음.**
  - 액션 `peopleLink {kind, row, person, how}`(directory) → `{ok:true, how, relinked, history}` · 오류 `invalid`·`not-found`(교인·줄)·`other-name`(줄 이름 ≠ 교인 이름 · `nameKey`)·`not-linked`(none·auto 인데 그 줄이 이분께 이어져 있지 않음)·`bad-kind`(history — Task 10 전)·`no-directory` · 기록 `people.link {kind,row,how}`(target = 줄 id).
  - 사역 이력(b6 `ministry_history`)은 읽기만 — 칸 `id,year,committee,team,role_title,position,mok,source,link_how` · `person_id = 이분 and deleted_at is null` · 표가 없으면(42P01·PGRST205) 빈 것.

- [ ] **Step 1: 실패하는 시험(순수 둘)**
  - `tests/authz.test.mjs` 「directory(교인명부) 액션」 목록 → `["peopleExport", "peopleHistory", "peopleLink", "peoplePerson", "peopleSearch", "peopleStats"]`
  - `tests/audit.test.mjs` 끝에:

```js
test("people.link — 「교적 잇기」 · 줄 종류 · 줄 번호 · 어떻게(이름·교인ID 없음)", () => {
  assert.match(LABEL["people.link"], /[가-힣]/);
  assert.equal(detailText(R("people.link", { kind: "order", row: 12, how: "manual" }, "12")), "사역신청 줄 12 · 이분 것");
  assert.equal(detailText(R("people.link", { kind: "signup", row: 7, how: "none" }, "7")), "성경필사 줄 7 · 이분 아님");
  assert.equal(detailText(R("people.link", { kind: "signup", row: 7, how: "auto" }, "7")), "성경필사 줄 7 · 잇기 풀기");
});
```
  Run: `node --experimental-strip-types --test tests/authz.test.mjs tests/audit.test.mjs` → Expected: FAIL 2건

- [ ] **Step 2: 순수 쪽을 채운다**
  - `authz.ts` `peopleExport: "directory",` 다음 줄에:

```ts
  // 교인명부 「자세히」 창 사역·성경필사 탭(2026-10-01) — 이름이 같고 아직 안 이어진 기록(읽기만 · 기록 없음 — 창을 연 people.view 가 있다) ·
  //   「이분 것」·「이분 아님」·「풀기」(줄 이름 = 교인 이름일 때만 · 바꾼 기록 people.link). 메모·사유·전화·앱 계정은 싣지 않는다.
  peopleHistory: "directory",
  peopleLink: "directory",
```
  - `audit.js` `LABEL` 의 `"people.linksync": …,` 뒤에 `"people.link": "교적 잇기",` · 파일의 `const SRC = …` 다음 줄에:

```js
const LINK_KIND = { order: "사역신청", signup: "성경필사", history: "사역 이력" };
const LINK_HOW = { manual: "이분 것", none: "이분 아님", auto: "잇기 풀기" };
```
    `detailText` 의 `people.linksync` 줄 뒤에:

```js
  if (r.action === "people.link") return joinDot(`${LINK_KIND[d.kind] || d.kind || ""} 줄 ${d.row ?? ""}`, LINK_HOW[d.how] || d.how || "");
```
  Run → Expected: PASS

- [ ] **Step 3: 개발 서버 시험(실패)** — `tests/server.dev.test.mjs`
  - `PROBE` 의 `peopleExport: …,` 다음 줄에:

```js
  // 「자세히」 창 탭(2026-10-01) — 없는 교인 → not-found · 줄 0 → invalid(둘 다 읽지도 쓰지도 기록하지도 않는다)
  peopleHistory: { id: 0 },
  peopleLink: { kind: "order", row: 0, person: 0, how: "manual" },
```
  - 파일 끝에 시험 셋:

```js
const TAB_SECRET = /"(user_id|ident_key|memo|phone|answers|note)"\s*:/;
const MIN_ITEM_KEYS = ["committee", "how", "kind", "option", "role_title", "row", "status", "team", "year"];
const BIB_ITEM_KEYS = ["event_id", "group", "how", "kind", "opens_on", "position", "row", "short_title", "sub", "title", "who_type"];
const plOpen = async () => {
  await plFixtures();
  await call(people.ministry.token, "ministryList");                          // 그때그때 잇기(앞 시험과 상관없이)
  await call(people.bibleevent.token, "evRoster", { event_id: PL.ev });
};

test("「자세히」 창 탭(peoplePerson history): 이어진 기록만 · 칸 지도 · 메모·전화·앱 계정 없음 · people.view 한 줄", async () => {
  await plOpen();
  const mark = await auditMark();
  const r = await call(people.directory.token, "peoplePerson", { id: PL.ids[0] });
  assert.equal(r.body.ok, true, JSON.stringify(r.body));
  const h = r.body.history;
  assert.deepEqual(Object.keys(h).sort(), ["bible", "counts", "ministry"]);
  assert.deepEqual(h.ministry.map((x) => [x.kind, x.row]), [["order", PL.orders.o1]]);
  assert.deepEqual(h.bible.map((x) => [x.kind, x.row]), [["signup", PL.signups.s1]]);
  assert.deepEqual(h.counts, { ministry: 1, bible: 1 });
  assert.deepEqual(Object.keys(h.ministry[0]).sort(), MIN_ITEM_KEYS);
  assert.deepEqual(Object.keys(h.bible[0]).sort(), BIB_ITEM_KEYS);
  assert.deepEqual([h.ministry[0].committee, h.ministry[0].team, h.ministry[0].status, h.ministry[0].how], ["시험부", "시험팀", "신청완료", "auto"]);
  assert.deepEqual([h.bible[0].event_id, h.bible[0].group, h.bible[0].sub, h.bible[0].opens_on], [PL.ev, "화평", "20", "2000-07-01"]);
  assert.ok(!TAB_SECRET.test(JSON.stringify(h)), "탭에 실으면 안 되는 칸");
  assert.ok(!UUID_RE.test(JSON.stringify(h)), "UUID 꼴 값");
  const views = (await call(people.super.token, "auditList", { limit: 50, kind: "people" })).body.rows
    .filter((x) => x.id > mark && x.target === String(PL.ids[0]));
  assert.deepEqual(views.map((x) => x.action), ["people.view"], "탭 때문에 기록이 늘었다");
});

test("아직 안 이어진 기록(peopleHistory): 같은 이름 · 아무에게도 안 이어진 줄 · 칸 지도 · 기록 없음", async () => {
  await plOpen();
  const mark = await auditMark();
  const pick = (rows) => rows.filter((x) => (x.kind === "order" && Object.values(PL.orders).includes(x.row)) ||
    (x.kind === "signup" && Object.values(PL.signups).includes(x.row)));
  const a = await call(people.directory.token, "peopleHistory", { id: PL.ids[0] });
  assert.equal(a.body.ok, true, JSON.stringify(a.body));
  assert.deepEqual(Object.keys(a.body).sort(), ["ok", "rows"]);
  assert.deepEqual(pick(a.body.rows).map((x) => [x.kind, x.row, x.how]), [["order", PL.orders.o3, "auto"], ["signup", PL.signups.s2, "auto"]]);
  const o3 = pick(a.body.rows)[0];
  assert.deepEqual(Object.keys(o3).sort(), ["committee", "how", "kind", "option", "position", "row", "status", "team", "who", "year"]);
  assert.equal(o3.who, "기쁨 5목장");
  assert.ok(!TAB_SECRET.test(JSON.stringify(a.body)));
  const b = await call(people.directory.token, "peopleHistory", { id: PL.ids[2] });
  assert.deepEqual(pick(b.body.rows).map((x) => [x.kind, x.row]), [["order", PL.orders.o4], ["signup", PL.signups.s3]]);
  assert.equal((await call(people.directory.token, "peopleHistory", { id: 1 })).body.error, "not-found");
  const logs = (await call(people.super.token, "auditList", { limit: 50, kind: "people" })).body.rows
    .filter((x) => x.id > mark && [String(PL.ids[0]), String(PL.ids[2])].includes(x.target));
  assert.equal(logs.length, 0, JSON.stringify(logs));
});

test("이분 것·이분 아님·풀기(peopleLink): 사람이 정한 줄 · 자동이 덮지 않음 · 이름이 다르면 막음 · 기록 people.link {kind,row,how}", async () => {
  await plOpen();
  const d = people.directory;
  const link = (kind, row, how, person = PL.ids[0]) => call(d.token, "peopleLink", { kind, row, person, how });
  // ① 이분 것 — 못 맞춘 o3 을 61 께
  const m = await link("order", PL.orders.o3, "manual");
  assert.equal(m.body.ok, true, JSON.stringify(m.body));
  assert.deepEqual(m.body.history.ministry.map((x) => x.row).sort((x, y) => x - y), [PL.orders.o1, PL.orders.o3].sort((x, y) => x - y));
  assert.equal(m.body.history.ministry.find((x) => x.row === PL.orders.o3).how, "manual");
  const lm = await linkOf("order", PL.orders.o3);
  assert.deepEqual([lm.person_id, lm.link_how, lm.match_basis, lm.linked_by, lm.import_id], [PL.ids[0], "manual", "사람이 이음", d.memberId, null]);
  await call(people.ministry.token, "ministryList");
  await call(people.super.token, "peopleLinkSync", { apply: true });
  assert.equal((await linkOf("order", PL.orders.o3)).link_how, "manual", "자동이 덮었다");
  // ② 이분 아님 — 이분께 이어진 줄만 · 그 뒤 「아직 안 이어진 기록」에 how none 으로
  const n = await link("order", PL.orders.o3, "none");
  assert.equal(n.body.ok, true, JSON.stringify(n.body));
  const ln = await linkOf("order", PL.orders.o3);
  assert.deepEqual([ln.person_id, ln.link_how, ln.match_basis], [null, "none", ""]);
  const un = await call(d.token, "peopleHistory", { id: PL.ids[0] });
  assert.equal(un.body.rows.find((x) => x.kind === "order" && x.row === PL.orders.o3)?.how, "none");
  // ③ 풀기 — 규칙이 다시 같은 분께 이으면 relinked(화면이 「이분 아님」을 권한다)
  const f = await link("signup", PL.signups.s1, "auto");
  assert.deepEqual([f.body.ok, f.body.relinked], [true, true], JSON.stringify(f.body));
  const lf = await linkOf("signup", PL.signups.s1);
  assert.deepEqual([lf.person_id, lf.link_how, lf.match_basis, lf.linked_by], [PL.ids[0], "auto", "맞음", null]);
  // ④ 막는 것
  assert.equal((await link("order", PL.orders.o4, "manual")).body.error, "other-name");
  assert.equal((await link("order", PL.orders.o2, "none")).body.error, "not-linked", "62 께 이어진 줄을 61 창에서 「이분 아님」");
  assert.equal((await link("order", PL.orders.o3, "manual", 999999999)).body.error, "not-found");
  assert.equal((await link("order", 0, "manual")).body.error, "invalid");
  assert.equal((await call(d.token, "peopleLink", { kind: "order", row: PL.orders.o3, person: PL.ids[0], how: "delete" })).body.error, "invalid");
  assert.equal((await link("history", 1, "manual")).body.error, "bad-kind", "사역 이력 잇기는 Task 10 에서");
  // ⑤ 기록 — people.link {kind,row,how}(이름·교인ID 없음 · 「교인명부 기록」)
  const logs = (await call(people.super.token, "auditList", { limit: 80, kind: "people" })).body.rows
    .filter((r) => r.action === "people.link" && ((r.detail?.kind === "order" && r.detail?.row === PL.orders.o3) ||
      (r.detail?.kind === "signup" && r.detail?.row === PL.signups.s1)));
  assert.deepEqual(logs.map((r) => r.detail).reverse(), [{ kind: "order", row: PL.orders.o3, how: "manual" },
    { kind: "order", row: PL.orders.o3, how: "none" }, { kind: "signup", row: PL.signups.s1, how: "auto" }]);
  // 되돌린다(o3 을 auto 로)
  await rest(`people_links?kind=eq.order&row_id=eq.${PL.orders.o3}`, "PATCH", { person_id: null, link_how: "auto", match_basis: "", import_id: 1 });
});
```
  Run(옛 함수): `node --experimental-strip-types --test --test-name-pattern="PROBE|권한 표|자세히」 창 탭|아직 안 이어진|이분 것" tests/server.dev.test.mjs`
  Expected: FAIL(`history` 없음 · unknown-action)

- [ ] **Step 4: `index.ts` — import 한 줄**(Task 4 의 people-links 줄 다음):

```ts
import { historyTabs, unlinkedRows, movedOrderIds, parseLink, linkPatch, unlinkRec, missingTable } from "./people-links.ts";
```

- [ ] **Step 5: `index.ts` — 탭 자료와 액션 둘.** Task 4 의 `peopleLinkSync` 함수 **다음**에:

```ts
// ---------- 교인명부 — 「자세히」 창의 사역·성경필사 탭(2026-10-01 · 설계 §4·§5) ----------
// ⚠️ 칸은 아래 목록으로만 읽는다 — 메모(note)·취소 사유·번호(phone)·앱 계정(user_id)·ident_key·memo·answers 는 읽지도 않는다.
//    응답은 people-links.ts 칸 지도(historyTabs·unlinkedRows) — 시험이 키 집합을 대조한다.
const ORDER_TAB_COLS = "id,year,committee,team,option,status";
const SIGNUP_TAB_COLS = "id,event_id,who_type,group_name,sub_name,position";
const EVENT_TAB_COLS = "id,title,short_title,opens_on,status";
// b6 「사역 이력」 표(설계 §2.2 · b6 설계 §7) — 읽기만. link_how 는 「사람이 이음」 표시에만.
const HISTORY_TAB_COLS = "id,year,committee,team,role_title,position,mok,source,link_how";

async function rowsByIds(table: string, cols: string, ids: (number | string)[]): Promise<any[]> {
  const uniq = [...new Set(ids)];
  const out: any[] = [];
  for (let i = 0; i < uniq.length; i += 300) {
    const { data, error } = await db.from(table).select(cols).in("id", uniq.slice(i, i + 300));
    if (error) throw error;
    out.push(...((data ?? []) as any[]));
  }
  return out;
}
// 사역 이력 표가 아직 없으면(운영 SQL 005 전) 빈 것 — 사역 탭은 신청만 보인다(설계 §2.2)
async function historyRowsOf(personId: number): Promise<any[]> {
  const { data, error } = await db.from("ministry_history").select(HISTORY_TAB_COLS)
    .eq("person_id", personId).is("deleted_at", null).order("year", { ascending: false }).limit(500);
  if (missingTable(error)) return [];
  if (error) throw error;
  return (data ?? []) as any[];
}
// 이력으로 넘긴 신청(b6 §8 · order_id) — 빼지 않은 이력 줄이 가리키는 신청은 신청 쪽으로 읽지 않는다(두 번 보이지 않게)
async function movedOrders(orderIds: number[]): Promise<Set<number>> {
  const out = new Set<number>();
  for (let i = 0; i < orderIds.length; i += 300) {
    const { data, error } = await db.from("ministry_history").select("order_id")
      .in("order_id", orderIds.slice(i, i + 300)).is("deleted_at", null);
    if (missingTable(error)) return out;
    if (error) throw error;
    for (const id of movedOrderIds((data ?? []) as any[])) out.add(id);
  }
  return out;
}
async function personHistory(personId: number) {
  const links = await allRows(() => db.from("people_links").select("kind,row_id,link_how")
    .eq("person_id", personId).in("link_how", ["auto", "manual"]).order("kind", { ascending: true }).order("row_id", { ascending: true }));
  const ids = (k: string) => links.filter((l) => l.kind === k).map((l) => Number(l.row_id));
  const [orders, signups, history, moved] = await Promise.all([
    rowsByIds("ministry_orders", ORDER_TAB_COLS, ids("order")),
    rowsByIds("event_signups", SIGNUP_TAB_COLS, ids("signup")),
    historyRowsOf(personId),
    movedOrders(ids("order")),
  ]);
  const events = await rowsByIds("events", EVENT_TAB_COLS, signups.map((s) => s.event_id));
  return historyTabs({ links, orders, signups, events, history, moved });
}

// 이름이 같고 아직 안 이어진 기록 — 이름으로 넓게 찾는다(신청·명단 전부를 읽어 메모리에서 nameKey 로 · evHistory 와 같은 방식 · 느리다).
// 창의 탭을 누를 때 한 번 부른다. 기록은 남기지 않는다(창을 연 people.view 가 이미 있다).
async function peopleHistory(b: any) {
  const id = Number(b.id) || 0;
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, error: "not-found" };
  const { data: p, error } = await db.from("church_people").select("person_id,name_key").eq("person_id", id).maybeSingle();
  if (error) throw error;
  if (!p) return { ok: false, error: "not-found" };
  const key = String(p.name_key ?? "");
  const [orders, signups, events] = await Promise.all([
    allRows(() => db.from("ministry_orders").select("id,user_id,year,committee,team,option,status,position,name,who").order("id", { ascending: true })),
    allRows(() => db.from("event_signups").select("id,event_id,who_type,group_name,sub_name,name,position").order("id", { ascending: true })),
    allRows(() => db.from("events").select(EVENT_TAB_COLS).order("id", { ascending: true })),
  ]);
  // 이름이 빈 옛 신청 줄만 앱 계정 이름을 묻는다(fillOrderNames) — 그다음 이 분 이름만 남긴다
  const mineO = (await fillOrderNames(orders.filter((o) => !o.name || nameKey(o.name) === key))).filter((o) => nameKey(o.name) === key);
  const mineS = signups.filter((s) => nameKey(s.name) === key);
  const [orderLinks, signupLinks, moved] = await Promise.all([
    linksOf("order", mineO.map((o) => Number(o.id))), linksOf("signup", mineS.map((s) => Number(s.id))),
    movedOrders(mineO.map((o) => Number(o.id))),
  ]);
  return { ok: true, rows: unlinkedRows({ orders: mineO, signups: mineS, events, orderLinks, signupLinks, moved, history: [] }) };
}

// 「이분 것」(manual) · 「이분 아님」(none) · 「풀기」(auto — auto 로 되돌리고 그 줄만 다시 맞춘다).
// ⚠️ 대상 줄의 이름이 이 교인 이름(nameKey)과 같아야 한다(다른 사람 줄을 잇지 못하게) · manual 은 그 교인이 지금 명부에 있어야 한다.
// ⚠️ none·auto 는 그 줄이 지금 이 분께 이어져 있을 때만(not-linked) — 화면은 이어진 줄에만 그 단추를 둔다.
// ⚠️ 사람의 쓰기는 이 표에 바로 upsert(사람이 정한 것이 자동을 이긴다) · 응답에 이 분의 탭 자료를 다시 실어 보낸다(people.view 를 늘리지 않게).
const ORDER_LINK_COLS = "id,user_id,name,who,phone";
const SIGNUP_LINK_COLS = "id,event_id,who_type,group_name,sub_name,name";
async function peopleLink(ctx: Ctx, b: any) {
  const p = parseLink(b);
  if (!p.ok) return { ok: false, error: p.error };
  if (p.kind === "history") return { ok: false, error: "bad-kind" };   // 사역 이력(b6) 표가 열리면 계획 Task 10 이 이 줄을 바꾼다
  const { data: person, error: e0 } = await db.from("church_people").select("person_id,name_key").eq("person_id", p.person).maybeSingle();
  if (e0) throw e0;
  if (!person) return { ok: false, error: "not-found" };
  const kind = p.kind as LinkKind;
  let row: any = null;
  if (kind === "order") {
    const { data, error } = await db.from("ministry_orders").select(ORDER_LINK_COLS).eq("id", p.row).maybeSingle();
    if (error) throw error;
    row = data ? (await fillOrderNames([data]))[0] : null;
  } else {
    const { data, error } = await db.from("event_signups").select(SIGNUP_LINK_COLS).eq("id", p.row).maybeSingle();
    if (error) throw error;
    row = data;
  }
  if (!row) return { ok: false, error: "not-found" };
  if (nameKey(row.name) !== person.name_key) return { ok: false, error: "other-name" };
  const cur = (await linksOf(kind, [p.row])).get(p.row);
  if (p.how !== "manual" && cur?.person_id !== p.person) return { ok: false, error: "not-linked" };
  const now = new Date().toISOString();
  let relinked = false;
  if (p.how === "auto") {
    const look = await churchLookupLinked([row.name]);
    if (!look) return { ok: false, error: "no-directory" };
    const rec = (kind === "order" ? orderAutoRecs([row], look, new Map(), true) : signupAutoRecs([row], look, new Map(), true))[0];
    const l = { person_id: rec?.person_id ?? null, basis: rec?.match_basis ?? "" };
    const { error } = await db.from("people_links").upsert(unlinkRec(kind, p.row, l, look.importId, now), { onConflict: "kind,row_id" });
    if (error) throw error;
    relinked = l.person_id === p.person;
  } else {
    const { error } = await db.from("people_links")
      .upsert(linkPatch(kind, p.row, p.how, p.person, ctx.member?.id ?? null, now), { onConflict: "kind,row_id" });
    if (error) throw error;
  }
  await audit(ctx, "people.link", String(p.row), { kind, row: p.row, how: p.how });
  return { ok: true, how: p.how, relinked, history: await personHistory(p.person) };
}
```

- [ ] **Step 6: `index.ts` — `peoplePerson` 에 탭 자료를 싣는다.** `await audit(ctx, "people.view", String(id), { name: data.name });` 와 그 다음 `return` 줄을 →

```ts
  const history = await personHistory(id);   // 사역·성경필사 탭(2026-10-01) — 칸 지도로만(people-links.ts historyTabs) · 기록은 people.view 한 줄 그대로
  await audit(ctx, "people.view", String(id), { name: data.name });
  return { ok: true, person: { ...data, photo: urls.get(id) ?? "" }, family, history };
```
  그리고 `switch` 의 `case "peopleExport": …` 다음 줄에:

```ts
      case "peopleHistory": return json(await peopleHistory(b));
      case "peopleLink":    return json(await peopleLink(ctx, b));
```

- [ ] **Step 7: 점검·개발 배포·개발 시험**

```bash
python tools/preflight.py
git merge main --no-edit
supabase functions deploy church-admin --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo
set -a; . ~/.church-admin/dev.env; set +a
node --experimental-strip-types --test tests/server.dev.test.mjs
```
Expected: `모두 통과` · `# fail 0`

- [ ] **Step 8: 커밋(푸시 안 함)**

```bash
git add supabase/functions/church-admin/index.ts supabase/functions/church-admin/authz.ts js/menus/system/audit.js \
  tests/authz.test.mjs tests/audit.test.mjs tests/server.dev.test.mjs
git commit -m "feat(교인명부): 자세히 창 이력 — peoplePerson history · peopleHistory · peopleLink(이분 것·풀기·이분 아님)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 화면 — 「자세히」 창 오른쪽 칸 탭

**Files:**
- Create: `js/menus/people/person-history.js`, `js/menus/people/person-tabs.js`, `tests/person-history.test.mjs`
- Modify: `js/menus/people/person-detail.js`, `js/menus/people/search.js`, `js/menus/bibleevent/person-popup.js`, `css/admin.css`
- Test(고치지 않음 · 그대로 통과만 본다 — Step 2·5): `tests/person-detail.test.mjs`. `personDetailHtml` 의 탭 시험은 새 `tests/person-history.test.mjs` 에 넣는다.
- Create(커밋 안 함 · Task 1 Step 1 의 `.superpowers/sdd/.gitignore` 가 막는다): `.superpowers/sdd/person-history/harness/index.html`, `.superpowers/sdd/person-history/harness/check_tabs.py`

**Interfaces:**
- Consumes: 서버 `peoplePerson` 응답 `history`(Task 5 칸) · `peopleHistory {id} → {rows}` · `peopleLink {kind,row,person,how} → {how, relinked, history}` · `status-logic.js` `SHORT`·`CLS` · `history-logic.js` `statLabel` · `roster-logic.js` `whoText`.
- Produces:
  - `person-history.js`: `HIST_TABS` · `tabOf(v)` · `rowKey(kind,row)` · `histTotal(h)` · `tabsHtml(history, tab)` · `ministryText(r)` · `statusChip(status)` · `bibleText(r)` · `histPanelHtml(tab, history, ui)` · `unlinkedFor(tab, rows)` · `unlinkedHtml(tab, un)` — `ui = {confirm: {key, relinked}|null, unlinked: {state:"idle"|"loading"|"ready"|"error", open:{ministry,bible}, rows}}`
  - `person-tabs.js`: `bindPersonTabs({dlg, call, personId, history, tab})` · `detailTab()`(마지막 창이 보던 탭)
  - `personDetailHtml(p, family = [], history = null, tab = "church")` — history 가 있을 때만 탭(옛 서버면 예전 그대로)
  - `openPerson(call, id, onFamily, back, opts = {})` — `opts.tab` · `search.js` 가 `detailTab` 을 다시 내보낸다
  - 단추 속성: 탭 `data-pd-tab="church|ministry|bible"` · 동작 `data-pd-act="more|unlinked-retry|unlink|unlink-yes|unlink-no|notme|link"` + `data-kind` + `data-row` · 칸 `data-pd-panel` · 꺼진 칸 `data-off`

- [ ] **Step 1: 실패하는 시험** — `tests/person-history.test.mjs`

```js
// 교인명부 「자세히」 창 사역·성경필사 탭 — 순수 시험(preflight 가 돈다 · 2026-10-01). 이름은 지어낸 것.
import { test } from "node:test";
import assert from "node:assert/strict";
import { HIST_TABS, tabOf, tabsHtml, ministryText, statusChip, bibleText, histPanelHtml, unlinkedHtml, histTotal, rowKey }
  from "../js/menus/people/person-history.js";
import { personDetailHtml } from "../js/menus/people/person-detail.js";

const M = (o = {}) => ({ kind: "order", row: 1, year: 2027, committee: "예배위원회", team: "안내팀", option: "", role_title: "",
  status: "임명확정", how: "auto", ...o });
const B = (o = {}) => ({ kind: "signup", row: 7, event_id: "lent-2026", title: "2026 사순절 마가복음 성경필사 완서자", short_title: "",
  opens_on: "2026-03-01", who_type: "교구", group: "화평", sub: "20", position: "집사", how: "auto", ...o });
const H = (ministry = [M()], bible = [B()]) => ({ counts: { ministry: ministry.length, bible: bible.length }, ministry, bible });
const noNL = (s) => assert.equal(/[\r\n]/.test(s), false, "줄바꿈 글자");
const noBad = (s) => {
  assert.equal(/\sdata-v=/.test(s), false, "data-v — dialog 가 닫기로 받는다");
  assert.equal(/\sdata-fam(-all)?=/.test(s), false, "data-fam — 가족 단추로 읽힌다");
};

test("tabsHtml — 셋 · 고른 탭 · 수 · 줄바꿈·data-v·data-fam 없음", () => {
  assert.deepEqual(HIST_TABS.map(([k]) => k), ["church", "ministry", "bible"]);
  const html = tabsHtml(H([M(), M({ row: 2 })], [B()]), "ministry");
  noNL(html); noBad(html);
  assert.ok(html.includes('role="tablist"'));
  assert.equal((html.match(/role="tab"/g) || []).length, 3);
  assert.ok(html.includes('data-pd-tab="ministry" aria-selected="true"'));
  assert.ok(html.includes('data-pd-tab="church" aria-selected="false"'));
  assert.ok(html.includes("🤝 사역 <em>2</em>"));
  assert.ok(html.includes("✍️ 성경필사 <em>1</em>"));
  assert.ok(tabsHtml(H(), undefined).includes('data-pd-tab="church" aria-selected="true"'));
  assert.equal(tabOf("x"), "church");
  assert.equal(histTotal(H([M()], [])), 1);
  assert.equal(histTotal(null), 0);
});

test("ministryText · statusChip — 「위원회 · 팀 (선택) · 직책」 · 신청 현황과 같은 칩", () => {
  assert.equal(ministryText(M({ option: "T&T", role_title: "팀장" })), "예배위원회 · 안내팀 (T&T) · 팀장");
  assert.equal(ministryText(M()), "예배위원회 · 안내팀");
  assert.equal(ministryText(M({ committee: "" })), "안내팀");
  assert.equal(statusChip("신청완료"), '<span class="mn-rowi-st s1">신청</span>');
  assert.equal(statusChip("접수완료"), '<span class="mn-rowi-st s2">접수</span>');
  assert.equal(statusChip("임명확정"), '<span class="mn-rowi-st s3">임명</span>');
  assert.equal(statusChip("취소"), '<span class="mn-rowi-st s4">취소</span>');
  assert.ok(statusChip("<b>").includes("&lt;b&gt;"));
});

test("bibleText — 👤 통계와 같은 회차 이름(statLabel) · 그때 소속 · 직분", () => {
  assert.equal(bibleText(B()), "2026 사순절 마가복음 · 화평 20목장 · 집사");
  assert.equal(bibleText(B({ sub: "남성", position: "" })), "2026 사순절 마가복음 · 화평 남성");
  assert.equal(bibleText(B({ who_type: "교회학교", group: "중등부", sub: "" })), "2026 사순절 마가복음 · 중등부 · 집사");
});

test("histPanelHtml — 해는 처음 한 번 · 줄마다 「풀기」 · 사람이 이음 · 빈 칸 · esc", () => {
  const html = histPanelHtml("ministry", H([M({ row: 1 }), M({ row: 2, team: "찬양팀", how: "manual" }), M({ row: 3, year: 2026 })], []), null);
  noNL(html); noBad(html);
  assert.equal((html.match(/<span class="pd-hy">2027<\/span>/g) || []).length, 1);
  assert.equal((html.match(/<span class="pd-hy"><\/span>/g) || []).length, 1);
  assert.ok(html.includes('<span class="pd-hy">2026</span>'));
  assert.equal((html.match(/data-pd-act="unlink"/g) || []).length, 3);
  assert.equal((html.match(/사람이 이음/g) || []).length, 1);
  assert.ok(histPanelHtml("bible", H([], []), null).includes("이어진 성경필사 기록이 없어요"));
  assert.ok(histPanelHtml("ministry", H([], []), null).includes("이어진 사역 기록이 없어요"));
  const bad = histPanelHtml("ministry", H([M({ committee: '<b>"x' })], []), null);
  assert.ok(bad.includes("&lt;b&gt;&quot;x"));
  assert.equal(bad.includes('<b>"x'), false);
});

test("histPanelHtml — 「풀기」 확인은 그 줄 안에서(창 위에 창 없음) · 다시 붙었으면 「이분 아님」을 권한다", () => {
  const c = histPanelHtml("ministry", H([M({ row: 5 }), M({ row: 6 })], []), { confirm: { key: rowKey("order", 5), relinked: false } });
  noNL(c); noBad(c);
  assert.ok(c.includes("정말 풀까요?"));
  for (const a of ["unlink-yes", "unlink-no", "notme"]) assert.equal((c.match(new RegExp(`data-pd-act="${a}"`, "g")) || []).length, 1, a);
  assert.equal((c.match(/data-pd-act="unlink"/g) || []).length, 1, "다른 줄은 그대로 「풀기」");
  const r = histPanelHtml("ministry", H([M({ row: 5 })], []), { confirm: { key: rowKey("order", 5), relinked: true } });
  assert.ok(r.includes("규칙이 다시 이분께 이었어요"));
  assert.equal(r.includes('data-pd-act="unlink-yes"'), false);
  assert.ok(r.includes('data-pd-act="notme"'));
});

test("unlinkedHtml — 부르기 전 없음 · 찾는 중 · 다시 · 0건 · 접힘/펼침 · 「이분 아님」으로 둔 기록은 따로", () => {
  assert.equal(unlinkedHtml("ministry", { state: "idle" }), "");
  assert.ok(unlinkedHtml("ministry", { state: "loading" }).includes("찾는 중"));
  assert.ok(unlinkedHtml("ministry", { state: "error" }).includes('data-pd-act="unlinked-retry"'));
  const rows = [
    { kind: "order", row: 9, year: 2027, committee: "예배위원회", team: "찬양팀", option: "", status: "신청완료", who: "기쁨 5목장", position: "집사", how: "auto" },
    { kind: "order", row: 10, year: 2026, committee: "교육위원회", team: "유년부", option: "", status: "임명확정", who: "소망 3목장", position: "집사", how: "none" },
    { ...B({ row: 11, group: "기쁨", sub: "5" }) },
  ];
  assert.ok(unlinkedHtml("bible", { state: "ready", open: {}, rows: [] }).includes("아직 안 이어진 기록은 없어요"));
  const closed = unlinkedHtml("ministry", { state: "ready", open: { ministry: false }, rows });
  noNL(closed); noBad(closed);
  assert.ok(closed.includes("이름이 같고 아직 안 이어진 기록 1건"));
  assert.ok(closed.includes('aria-expanded="false"'));
  assert.equal(closed.includes('data-pd-act="link"'), false);
  const open = unlinkedHtml("ministry", { state: "ready", open: { ministry: true }, rows });
  assert.equal((open.match(/data-pd-act="link"/g) || []).length, 2);
  assert.ok(open.includes("「이분 아님」으로 둔 기록 1건"));
  assert.ok(open.includes("2027 · 예배위원회 · 찬양팀 · 기쁨 5목장 · 집사"));
  assert.equal((unlinkedHtml("bible", { state: "ready", open: { bible: true }, rows }).match(/data-pd-act="link"/g) || []).length, 1);
});

test("personDetailHtml — 탭 셋 · 고른 칸만 켜짐 · 이력이 있으면 좁히지 않는다 · history 가 없으면(옛 서버) 예전 그대로", () => {
  const P = { name: "홍길동", kind2: "장년", registered: "2026-08-02" };      // 칸 둘 → 이력이 없으면 좁은 창(pd-few)
  const withH = personDetailHtml(P, [], H(), "bible");
  noNL(withH); noBad(withH);
  assert.ok(withH.includes('class="pd-wrap pd-tabbed"'), "이력이 있으면 좁히지 않는다");
  assert.ok(withH.includes('data-pd-panel="church" tabindex="0" data-off'));
  assert.ok(withH.includes('data-pd-panel="ministry" tabindex="0" data-off'));
  assert.ok(withH.includes('data-pd-panel="bible" tabindex="0">'));
  assert.ok(personDetailHtml(P, [], H([], [])).includes('class="pd-wrap pd-few pd-tabbed"'), "이력 0 이면 예전처럼 좁힌다(탭은 그대로)");
  assert.equal(personDetailHtml(P, []).includes("pd-tabs"), false);
  assert.ok(personDetailHtml(P, []).includes('class="pd-wrap pd-few"'));
});
```

- [ ] **Step 2: 돌려서 실패를 본다**

Run: `node --experimental-strip-types --test tests/person-history.test.mjs tests/person-detail.test.mjs`
Expected: FAIL — `Cannot find module '…/person-history.js'`(person-detail 시험은 그대로 통과)

- [ ] **Step 3: `js/menus/people/person-history.js` 를 쓴다**

```js
// 교인명부 「자세히」 창의 🤝 사역 · ✍️ 성경필사 탭 — 순수 함수(2026-10-01 · DOM 을 쓰지 않는다 · tests/person-history.test.mjs 가 읽는다).
// 설계: v2 docs/superpowers/specs/2026-10-01-person-history-tabs-design.md §4 · 손잡이(DOM)는 person-tabs.js · 창은 search.js openPerson.
// ⚠️ 줄바꿈 글자를 넣지 않는다(person-detail.js 와 같은 규칙) · 사람·서버 글자는 모두 esc.
// ⚠️ 단추에 data-v · data-fam · data-fam-all 을 쓰지 않는다 — ui.js dialog 는 본문 안 button[data-v] 를 「닫기」로,
//    search.js·person-popup.js 는 data-fam 을 가족 단추로 읽는다. 탭은 data-pd-tab, 나머지는 data-pd-act(+ data-kind · data-row).
// ⚠️ 서버가 준 칸 지도(people-links.ts …Item)만 그린다 — 메모·사유·전화·앱 계정은 응답에 아예 없다.
import { esc } from "../../core/ui.js";
import { SHORT, CLS } from "../ministry/status-logic.js";
import { statLabel } from "../bibleevent/history-logic.js";
import { whoText } from "../bibleevent/roster-logic.js";

export const HIST_TABS = [["church", "교적"], ["ministry", "🤝 사역"], ["bible", "✍️ 성경필사"]];
const KEYS = HIST_TABS.map(([k]) => k);
export const tabOf = (v) => (KEYS.includes(v) ? v : "church");
export const rowKey = (kind, row) => `${kind}:${row}`;
export const histTotal = (h) => (Number(h?.counts?.ministry) || 0) + (Number(h?.counts?.bible) || 0);
const t = (v) => esc(String(v ?? "").replace(/[\r\n]+/g, " ").trim());
const join = (...xs) => xs.map((x) => String(x ?? "").trim()).filter(Boolean).join(" · ");

// 탭 줄 — 오른쪽 칸 맨 위. 숫자 = 이분과 이어진 기록 수(서버 counts).
export function tabsHtml(history, tab) {
  const on = tabOf(tab);
  const n = { ministry: Number(history?.counts?.ministry) || 0, bible: Number(history?.counts?.bible) || 0 };
  return `<div class="pd-tabs" role="tablist" aria-label="교적 · 사역 · 성경필사">` + HIST_TABS.map(([k, label]) => {
    const sel = k === on;
    return `<button type="button" class="pd-tab${sel ? " on" : ""}" role="tab" id="pd-tab-${k}" data-pd-tab="${k}" ` +
      `aria-selected="${sel}" aria-controls="pd-panel-${k}" tabindex="${sel ? 0 : -1}">${label}${k === "church" ? "" : ` <em>${n[k]}</em>`}</button>`;
  }).join("") + `</div>`;
}

// 「위원회 · 팀 (선택) · 직책」 — 하위 선택(option · 어와나 택1 등)은 팀 뒤 괄호(직책이 아니다 · b6 §8 과 같은 표기)
export function ministryText(r) {
  const opt = String(r?.option ?? "").trim();
  const team = [String(r?.team ?? "").trim(), opt ? `(${opt})` : ""].filter(Boolean).join(" ");
  return join(r?.committee, team, r?.role_title);
}
// 상태 칩 — 신청 현황과 같은 색·글자(status-logic.js CLS·SHORT). 사역 이력은 서버가 「임명확정」으로 준다.
export function statusChip(status) {
  const s = String(status ?? "");
  return `<span class="mn-rowi-st ${CLS[s] || "s1"}">${t(SHORT[s] || s)}</span>`;
}
// 성경필사 한 줄 — 회차 이름은 👤 통계와 같은 statLabel(「2026 사순절 마가복음」) · 그때 소속(whoText) · 직분
export function bibleText(r) {
  return join(statLabel({ id: r?.event_id, title: r?.title, short_title: r?.short_title, opens_on: r?.opens_on }),
    whoText({ who_type: r?.who_type, group: r?.group, sub: r?.sub }), r?.position);
}
const dataRow = (r) => `data-kind="${t(r?.kind)}" data-row="${t(r?.row)}"`;

// 이어진 줄 하나 — [해] · 글 · [칩] · 「풀기」(확인 중이면 그 자리에서 「정말 풀까요? 예 · 아니요 · 이분 아님」)
function linkedRow(tab, r, year, ui) {
  const text = tab === "ministry" ? ministryText(r) : bibleText(r);
  const chip = tab === "ministry" ? statusChip(r?.kind === "history" ? "임명확정" : r?.status) : "";
  const manual = r?.how === "manual" ? `<small class="pd-hm">사람이 이음</small>` : "";
  const c = ui && ui.confirm && ui.confirm.key === rowKey(r?.kind, r?.row) ? ui.confirm : null;
  const tail = !c
    ? `<button type="button" class="pd-hx" data-pd-act="unlink" ${dataRow(r)} aria-label="${t(text)} — 잇기 풀기">풀기</button>`
    : `<span class="pd-hc" role="group" aria-label="잇기 풀기 확인"><small>${c.relinked ? "규칙이 다시 이분께 이었어요" : "정말 풀까요?"}</small>` +
      (c.relinked ? "" : `<button type="button" class="pd-hb" data-pd-act="unlink-yes" ${dataRow(r)}>예</button>`) +
      `<button type="button" class="pd-hb" data-pd-act="unlink-no" ${dataRow(r)}>${c.relinked ? "그대로 두기" : "아니요"}</button>` +
      `<button type="button" class="pd-hb warn" data-pd-act="notme" ${dataRow(r)}>이분 아님</button></span>`;
  const y = tab === "ministry" ? `<span class="pd-hy">${t(year)}</span>` : "";
  return `<li class="pd-hr">${y}<span class="pd-ht">${t(text)}${manual}</span>${chip}${tail}</li>`;
}

const EMPTY = { ministry: "이어진 사역 기록이 없어요", bible: "이어진 성경필사 기록이 없어요" };
// 사역·성경필사 칸 하나 — 이어진 줄(사역은 해 내림차순 · 같은 해는 해 칸을 비운다) + 「아직 안 이어진 기록」
export function histPanelHtml(tab, history, ui) {
  const items = (tab === "ministry" ? history?.ministry : history?.bible) || [];
  let prev = null;
  const rows = items.map((r) => {
    const y = tab === "ministry" ? String(r?.year ?? "") : "";
    const show = y === prev ? "" : y;
    prev = y;
    return linkedRow(tab, r, show, ui);
  }).join("");
  const list = items.length ? `<ul class="pd-hl${tab === "bible" ? " pd-hl-b" : ""}">${rows}</ul>` : `<p class="pd-none">${EMPTY[tab] || ""}</p>`;
  return list + unlinkedHtml(tab, ui && ui.unlinked);
}

export const unlinkedFor = (tab, rows) => (rows || []).filter((r) => (r?.kind === "signup" ? "bible" : "ministry") === tab);
function unlinkedText(r) {
  if (r?.kind === "signup") return bibleText(r);
  return join(r?.year, ministryText(r), r?.kind === "history" ? r?.mok : r?.who, r?.position);
}
function unlinkedRow(r) {
  const text = unlinkedText(r);
  const chip = r?.kind === "signup" ? "" : statusChip(r?.kind === "history" ? "임명확정" : r?.status);
  return `<li class="pd-hr pd-ur"><span class="pd-ht">${t(text)}</span>${chip}` +
    `<button type="button" class="pd-hb" data-pd-act="link" ${dataRow(r)} aria-label="${t(text)} — 이분 것">이분 것</button></li>`;
}
// 「이름이 같고 아직 안 이어진 기록 N건 ▸」 — 탭을 처음 열 때 서버(peopleHistory)에서 받는다. 「이분 아님」으로 둔 줄은 따로 묶는다
// (누가 「이분 아님」이라 했는지 표가 모른다 — 다른 동명이인 창에서 잇게 남겨 둔다 · 계획 판단).
export function unlinkedHtml(tab, un) {
  if (!un || !un.state || un.state === "idle") return "";
  if (un.state === "loading") return `<p class="pd-un muted" role="status">같은 이름의 다른 기록을 찾는 중…</p>`;
  if (un.state === "error") {
    return `<p class="pd-un">같은 이름의 기록을 불러오지 못했어요 <button type="button" class="pd-hb" data-pd-act="unlinked-retry">다시</button></p>`;
  }
  const all = unlinkedFor(tab, un.rows);
  if (!all.length) return `<p class="pd-un muted">이름이 같고 아직 안 이어진 기록은 없어요</p>`;
  const open = all.filter((r) => r?.how !== "none"), rej = all.filter((r) => r?.how === "none");
  const isOpen = !!(un.open && un.open[tab]);
  const label = open.length ? `이름이 같고 아직 안 이어진 기록 ${open.length}건` : `「이분 아님」으로 둔 같은 이름 기록 ${rej.length}건`;
  const body = !isOpen ? "" :
    (open.length ? `<ul class="pd-hl pd-ul">${open.map(unlinkedRow).join("")}</ul>` : "") +
    (open.length && rej.length ? `<p class="pd-un-sub">「이분 아님」으로 둔 기록 ${rej.length}건</p>` : "") +
    (rej.length ? `<ul class="pd-hl pd-ul">${rej.map(unlinkedRow).join("")}</ul>` : "");
  return `<div class="pd-un"><button type="button" class="pd-un-b" data-pd-act="more" aria-expanded="${isOpen}">${t(label)} ` +
    `<span aria-hidden="true">${isOpen ? "▾" : "▸"}</span></button>${body}</div>`;
}
```

- [ ] **Step 4: `js/menus/people/person-detail.js` 를 고친다**
  - import 줄 `import { affText, initialOf, detailSections } from "./people-logic.js";` 다음에:

```js
// 사역·성경필사 탭(2026-10-01) — 서버가 history 를 줄 때만(옛 서버면 예전 창 그대로)
import { tabsHtml, histPanelHtml, histTotal, tabOf } from "./person-history.js";
```
  - `export function personDetailHtml(p, family = []) {` → `export function personDetailHtml(p, family = [], history = null, tab = "church") {`
  - `const shape = !secs.length ? " pd-empty" : !famBody && nFields <= FEW_FIELDS ? " pd-few" : "";` →

```js
  const hist = history && typeof history === "object" ? history : null;
  // 이력이 있으면 좁히지 않는다(좁은 한 단 창에 이력이 길게 늘어지지 않게 · 설계 §4 ⚠️) — 이력 0 이면 예전 규칙 그대로
  const shape = hist && histTotal(hist) > 0 ? "" : !secs.length ? " pd-empty" : !famBody && nFields <= FEW_FIELDS ? " pd-few" : "";
```
  - 마지막 `return` 의 첫 줄 `` return `<div class="pd-wrap${shape}"><div class="pd-side">${photo}<div class="pd-id">` + `` →
    `` return `<div class="pd-wrap${shape}${hist ? " pd-tabbed" : ""}"><div class="pd-side">${photo}<div class="pd-id">` + ``
  - 마지막 줄 `` `<div class="pd-main">${secHtml || `<p class="pd-none">더 적힌 내용이 없어요</p>`}</div></div>`; `` →
    `` `<div class="pd-main">${mainHtml(secHtml, hist, tabOf(tab))}</div></div>`; ``
  - 파일의 `personDetailHtml` 함수 **위**에 도우미:

```js
// 오른쪽 칸 — history 가 없으면 예전 그대로(교적 묶음), 있으면 탭 + 칸 셋(교적 · 사역 · 성경필사). 꺼진 칸은 data-off
// (CSS 가 숨긴다 — PC 의 교적 칸은 자리를 지켜 탭을 바꿔도 창 높이가 그대로다 · css/admin.css 「자세히」 창의 탭).
function mainHtml(secHtml, hist, on) {
  const church = secHtml || `<p class="pd-none">더 적힌 내용이 없어요</p>`;
  if (!hist) return church;
  const panel = (k, inner) => `<div class="pd-panel" role="tabpanel" id="pd-panel-${k}" aria-labelledby="pd-tab-${k}" ` +
    `data-pd-panel="${k}" tabindex="0"${k === on ? "" : " data-off"}>${inner}</div>`;
  return tabsHtml(hist, on) + `<div class="pd-panels">${panel("church", church)}` +
    `${panel("ministry", histPanelHtml("ministry", hist, null))}${panel("bible", histPanelHtml("bible", hist, null))}</div>`;
}
```

- [ ] **Step 5: 순수 시험이 통과하는지 본다**

Run: `node --experimental-strip-types --test tests/person-history.test.mjs tests/person-detail.test.mjs`
Expected: PASS(새 시험 7 · 기존 person-detail 시험 전부)

- [ ] **Step 6: `js/menus/people/person-tabs.js` 를 쓴다**

```js
// 교인명부 「자세히」 창의 탭 손잡이(DOM · 2026-10-01) — 그리는 글은 person-history.js(순수), 창은 search.js openPerson.
// 설계: v2 docs/superpowers/specs/2026-10-01-person-history-tabs-design.md §4
// ⚠️ 창 위에 창을 띄우지 않는다 — 「풀기」 확인은 그 줄 안에서(「정말 풀까요? 예 · 아니요 · 이분 아님」). 알림은 toast 만.
// ⚠️ 「아직 안 이어진 기록」은 사역·성경필사 탭을 처음 열 때 한 번 부른다(peopleHistory — 이름으로 넓게 찾아 느리다 · 기록 없음).
//    잇기·풀기 뒤에는 서버가 돌려준 history 로 다시 그리고, 불러 둔 목록은 다시 부른다(그 줄이 옮겨 갔다).
// ⚠️ 창이 닫힌 뒤 답이 오면 그리지 않는다(dlg.isConnected).
// ⚠️ 이 파일은 Node 시험이 (person-popup.js → search.js 를 거쳐) 불러 본다 — 맨 위에서 document·window 를 만지지 않는다.
import { toast, busy, errorText } from "../../core/ui.js";
import { HIST_TABS, tabOf, tabsHtml, histPanelHtml, rowKey } from "./person-history.js";

let lastTab = "church";
// 마지막 「자세히」 창이 보던 탭 — 가족으로 넘어갈 때 그대로 연다(search.js 가 다시 내보내고 person-popup.js 가 쓴다).
// 가족 칩은 교적 칸 안에 있어 지금은 늘 「교적」이 넘어간다 — 칩이 다른 칸에도 생기면 그대로 산다.
export const detailTab = () => lastTab;

const DONE = { manual: "이분 기록으로 이었어요", none: "이분 기록이 아니라고 적었어요", auto: "잇기를 풀었어요" };

export function bindPersonTabs({ dlg, call, personId, history, tab }) {
  const main = dlg && dlg.querySelector(".pd-main");
  if (!main || !history || !main.querySelector(".pd-tabs")) return;
  const s = { tab: tabOf(tab), history, confirm: null, unlinked: { state: "idle", open: { ministry: false, bible: false }, rows: [] } };
  lastTab = s.tab;
  const ui = () => ({ confirm: s.confirm, unlinked: s.unlinked });

  function draw(focusSel) {
    main.querySelector(".pd-tabs").outerHTML = tabsHtml(s.history, s.tab);
    for (const [k] of HIST_TABS) {
      const p = main.querySelector(`[data-pd-panel="${k}"]`);
      if (!p) continue;
      if (k !== "church") p.innerHTML = histPanelHtml(k, s.history, ui());
      if (k === s.tab) p.removeAttribute("data-off"); else p.setAttribute("data-off", "");
    }
    if (focusSel) main.querySelector(focusSel)?.focus({ preventScroll: true });
  }
  async function loadUnlinked(force = false) {
    if (!force && s.unlinked.state !== "idle" && s.unlinked.state !== "error") return;
    s.unlinked = { ...s.unlinked, state: "loading" };
    draw();
    const r = await call("peopleHistory", { id: personId });
    if (!dlg.isConnected) return;
    s.unlinked = r && r.ok ? { ...s.unlinked, state: "ready", rows: Array.isArray(r.rows) ? r.rows : [] } : { ...s.unlinked, state: "error" };
    draw();
  }
  function show(k, focus) {
    s.tab = tabOf(k);
    lastTab = s.tab;
    s.confirm = null;
    draw(focus ? `[data-pd-tab="${s.tab}"]` : null);
    if (s.tab !== "church") loadUnlinked();
  }
  async function link(kind, row, how) {
    const r = await busy(main, () => call("peopleLink", { kind, row: Number(row), person: personId, how }));
    if (!dlg.isConnected) return;
    if (!r || !r.ok) { toast(errorText(r)); return; }
    if (r.history) s.history = r.history;
    const again = how === "auto" && r.relinked;
    s.confirm = again ? { key: rowKey(kind, row), relinked: true } : null;
    toast(again ? "규칙이 다시 이분께 이었어요 — 이분 기록이 아니면 「이분 아님」을 눌러 주세요" : DONE[how]);
    if (s.unlinked.state === "ready" || s.unlinked.state === "error") await loadUnlinked(true);
    else draw();
    main.querySelector(again ? `[data-pd-panel="${s.tab}"] .pd-hc button` : `[data-pd-tab="${s.tab}"]`)?.focus({ preventScroll: true });
  }

  main.addEventListener("click", (e) => {
    const el = e.target instanceof Element ? e.target : null;
    const tb = el?.closest("[data-pd-tab]");
    if (tb && main.contains(tb)) { if (!tb.disabled) show(tb.dataset.pdTab, false); return; }
    const b = el?.closest("button[data-pd-act]");
    if (!b || !main.contains(b) || b.disabled) return;
    const act = b.dataset.pdAct, kind = b.dataset.kind || "", row = b.dataset.row || "";
    if (act === "more") { s.unlinked.open[s.tab] = !s.unlinked.open[s.tab]; draw(`[data-pd-panel="${s.tab}"] .pd-un-b`); return; }
    if (act === "unlinked-retry") { loadUnlinked(true); return; }
    if (act === "unlink") { s.confirm = { key: rowKey(kind, row), relinked: false }; draw(`[data-pd-panel="${s.tab}"] .pd-hc button`); return; }
    if (act === "unlink-no") { s.confirm = null; draw(`[data-pd-tab="${s.tab}"]`); return; }
    if (act === "unlink-yes") { link(kind, row, "auto"); return; }
    if (act === "notme") { link(kind, row, "none"); return; }
    if (act === "link") link(kind, row, "manual");
  });
  // 탭 줄 — ←·→·Home·End 로 옮기며 연다(WAI-ARIA 탭 · 자동 활성)
  main.addEventListener("keydown", (e) => {
    const tb = e.target instanceof Element ? e.target.closest("[data-pd-tab]") : null;
    if (!tb) return;
    const keys = HIST_TABS.map(([k]) => k), i = keys.indexOf(tb.dataset.pdTab);
    const j = e.key === "ArrowRight" ? (i + 1) % keys.length : e.key === "ArrowLeft" ? (i + keys.length - 1) % keys.length
      : e.key === "Home" ? 0 : e.key === "End" ? keys.length - 1 : -1;
    if (j < 0) return;
    e.preventDefault();
    show(keys[j], true);
  });
  if (s.tab !== "church") loadUnlinked();
}
```

- [ ] **Step 7: `search.js` · `person-popup.js` 를 고친다**
  - `search.js` import 묶음 끝(`import { pickMany } from "../../core/picker.js";` 다음)에:

```js
// 「자세히」 창의 사역·성경필사 탭(2026-10-01) — 손잡이는 person-tabs.js · 마지막 창이 보던 탭(detailTab)은 person-popup.js 도 쓴다
import { bindPersonTabs, detailTab } from "./person-tabs.js";
export { detailTab } from "./person-tabs.js";
```
  - `export async function openPerson(call, id, onFamily, back) {` → `export async function openPerson(call, id, onFamily, back, opts = {}) {`(함수 위 주석 끝에 `// opts.tab — 처음 열 탭(가족으로 넘어갈 때 보던 탭 · 없으면 교적).` 한 줄)
  - `const closed = dialog({ title: "", html: personDetailHtml(p, fam), ok: "닫기", cancel: null, cls: "pd" });` →
    `const closed = dialog({ title: "", html: personDetailHtml(p, fam, r.history || null, opts.tab), ok: "닫기", cancel: null, cls: "pd" });`
  - `dlg.querySelector(".dlg").setAttribute("aria-label", …);` 줄 다음에:
    `    if (r.history) bindPersonTabs({ dlg, call, personId: Number(p.person_id), history: r.history, tab: opts.tab });`
  - `if (f) openPerson(call, f.dataset.fam, onFamily, back);` → `if (f) openPerson(call, f.dataset.fam, onFamily, back, { tab: detailTab() });`
  - `person-popup.js`: `import { openPerson } from "../people/search.js";` → `import { openPerson, detailTab } from "../people/search.js";`
    `while (id != null && !gone()) {` **앞** 줄에 `    let tab;   // 가족으로 넘어가면 보던 탭 그대로(2026-10-01 · 처음은 교적)`
    `try { await openPerson(call, id, () => toast(FAMILY_NOTE), back); }` → `try { await openPerson(call, id, () => toast(FAMILY_NOTE), back, { tab }); }`
    `id = s.next;` **앞** 줄에 `      tab = detailTab();`

- [ ] **Step 8: CSS** — `css/admin.css` 의 `/* 공용 고르개(js/core/picker.js · 2026-09-29)` 주석 **바로 앞**에:

```css
/* 「자세히」 창의 탭(2026-10-01) — 교적 · 🤝 사역 N · ✍️ 성경필사 N. 본문 js/menus/people/person-history.js · 손잡이 person-tabs.js
   ⚠️ PC(창 안쪽 720px 이상)는 창 높이를 왼쪽 단(사진)과 교적 칸이 정한다 — 사역·성경필사 칸은 contain:size 로 높이에 끼지 않고
      그 높이 안에서만 스크롤한다(1366×657 무스크롤 · 설계 §4). 교적 칸은 꺼져도 자리를 지켜(visibility) 탭을 바꿔도 창 높이가 그대로다.
   ⚠️ 폰(좁은 창)은 고른 칸만 보이고 창 전체가 세로로 스크롤한다.
   ⚠️ 탭 줄 높이(약 46px)만큼 사진을 줄여 교적 칸이 꽉 찬 분도 1366×657 에서 넘치지 않게 한다(아래 .pd-tabbed .pd-photo — 재고 정한 값) */
.dlg.pd .pd-tabbed .pd-main{gap:0}
.dlg.pd .pd-tabs{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px}
.dlg.pd .pd-tab{display:inline-flex;align-items:center;gap:4px;min-height:var(--chip);padding:0 14px;border-radius:999px;
  border:1px solid var(--border);background:var(--paper);color:var(--ink);font-size:14px;font-weight:700;cursor:pointer}
.dlg.pd .pd-tab em{font-style:normal;font-weight:800;color:var(--navy)}
.dlg.pd .pd-tab.on{background:var(--navy);border-color:var(--navy);color:#fff}
.dlg.pd .pd-tab.on em{color:#fff}
.dlg.pd .pd-panel{display:flex;flex-direction:column;gap:20px;min-width:0}
.dlg.pd .pd-panel[data-off]{display:none}
.dlg.pd .pd-panel>.pd-none{text-align:center}
.dlg.pd .pd-hl{list-style:none;margin:0;padding:0}
.dlg.pd .pd-hr{display:grid;grid-template-columns:3.2em minmax(0,1fr) auto auto;align-items:baseline;gap:4px 8px;
  padding:8px 0;border-top:1px solid var(--light)}
.dlg.pd .pd-hr:first-child{border-top:0}
.dlg.pd .pd-hl-b .pd-hr{grid-template-columns:minmax(0,1fr) auto}
.dlg.pd .pd-ur{grid-template-columns:minmax(0,1fr) auto auto}
.dlg.pd .pd-hy{font-size:14px;font-weight:800;color:var(--navy);font-variant-numeric:tabular-nums}
.dlg.pd .pd-ht{font-size:15px;line-height:1.4;color:var(--ink);word-break:keep-all;overflow-wrap:anywhere}
.dlg.pd .pd-hm{margin-left:6px;font-size:13px;color:var(--ink-2)}
.dlg.pd .pd-hx,.dlg.pd .pd-hb{min-height:var(--chip);padding:0 12px;border-radius:999px;border:1px solid var(--ghost-bd);
  background:var(--paper);color:var(--navy);font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap}
.dlg.pd .pd-hb.warn{color:var(--error);border-color:currentColor}
.dlg.pd .pd-hc{grid-column:1/-1;display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:6px}
.dlg.pd .pd-hc small{margin-right:auto;font-size:13px;color:var(--ink-2)}
.dlg.pd .pd-un{margin-top:4px;padding-top:10px;border-top:1px dashed var(--border);font-size:14px;color:var(--ink-2)}
.dlg.pd .pd-un-b{display:inline-flex;align-items:center;gap:6px;min-height:var(--tap);padding:0;border:0;background:transparent;
  color:var(--navy);font-size:14px;font-weight:700;cursor:pointer}
.dlg.pd .pd-un-sub{margin:10px 0 0;font-size:13px;color:var(--ink-2)}
@container (min-width:720px){
  .dlg.pd .pd-tabbed{align-items:stretch}
  .dlg.pd .pd-tabbed .pd-main{min-height:0}
  .dlg.pd .pd-tabbed .pd-photo{height:clamp(170px,100cqh - 466px,260px)}
  .dlg.pd .pd-panels{flex:1 1 auto;min-height:0;display:grid}
  .dlg.pd .pd-panels>.pd-panel{grid-area:1/1;min-height:0;gap:0}
  .dlg.pd .pd-panel[data-pd-panel="church"][data-off]{display:flex;visibility:hidden}
  .dlg.pd .pd-panel[data-pd-panel="ministry"],.dlg.pd .pd-panel[data-pd-panel="bible"]{display:block;contain:size;
    overflow-y:auto;overscroll-behavior:contain}
  .dlg.pd .pd-panel[data-pd-panel="ministry"][data-off],.dlg.pd .pd-panel[data-pd-panel="bible"][data-off]{display:none}
}
```

- [ ] **Step 9: 헤드리스로 잰다(가짜 데이터 · 커밋 안 함)** — 하네스 `.superpowers/sdd/person-history/harness/index.html`:

```html
<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>자세히 창 탭 시험</title>
<link rel="stylesheet" href="/css/tokens.css"><link rel="stylesheet" href="/css/admin.css">
</head><body>
<main id="view"><section><button type="button" id="back">뒤 단추</button></section></main>
<script type="module">
// 가짜 call — 서버 없이 openPerson 을 그대로 띄운다. 이름·번호·주소는 모두 지어낸 것.
import { openPerson } from "/js/menus/people/search.js";
const FULL = { person_id: 11, name: "홍길동", position: "안수집사", position_detail: "시무안수집사", gender: "남", age: 52,
  birth: "1974-03-15", lunar: "양", kind1: "교인", kind2: "장년", kind3: "출석교인", registered: "2010-05-02", reg_type: "세례",
  guide: "이바다", phone1: "010-0000-0011", phone2: "02-0000-0011", email: "hong@example.test",
  address: "시험시 시험구 시험로 11 시험아파트 101동 1001호", address_jibun: "시험시 시험동 11-1",
  mok1: "화평", mok3: "화평-20목장", mok_leader: "박가람", mission: "남선교회",
  school_path: "교육위원회 > 중등부 > 2학년 > 1반", teacher: "최나래", youth_path: "",
  spouse: "이슬", spouse_position: "권사", household_head: "홍길동", household_rel: "본인", household_id: 11, photo: "" };
const FAM = [{ person_id: 12, name: "이슬", household_rel: "처", gender: "여", age: 50, position: "권사" },
  { person_id: 13, name: "홍다온", household_rel: "아들1", gender: "남", age: 15, position: "" }];
const N = Number(new URLSearchParams(location.search).get("n") || 8);
const COM = ["예배위원회", "교육위원회", "전도부", "선교위원회"], TEAM = ["안내팀", "중등부", "행복전도대 토요일", "해외선교팀"];
const ST = ["임명확정", "접수완료", "임명확정", "신청완료", "취소"];
const ministry = Array.from({ length: N }, (_, i) => ({ kind: i % 3 === 2 ? "history" : "order", row: 100 + i, year: 2027 - Math.floor(i / 2),
  committee: COM[i % 4], team: TEAM[i % 4], option: i === 1 ? "T&T" : "", role_title: i % 3 === 2 ? "팀장" : "",
  status: i % 3 === 2 ? "임명확정" : ST[i % 5], how: i === 0 ? "manual" : "auto" }));
const bible = Array.from({ length: Math.max(1, Math.floor(N * 0.75)) }, (_, i) => ({ kind: "signup", row: 500 + i, event_id: `lent-${2026 - i}`,
  title: `${2026 - i} 사순절 마가복음 성경필사 완서자`, short_title: "", opens_on: `${2026 - i}-03-01`, who_type: "교구", group: "화평",
  sub: "20", position: "안수집사", how: "auto" }));
const history = { counts: { ministry: ministry.length, bible: bible.length }, ministry, bible };
const unlinked = [
  { kind: "order", row: 900, year: 2027, committee: "예배위원회", team: "찬양팀", option: "", status: "신청완료", who: "기쁨 5목장", position: "집사", how: "auto" },
  { kind: "signup", row: 901, event_id: "summer-2025", title: "2025 썸머 써 바이블", short_title: "", opens_on: "2025-06-01",
    who_type: "교구", group: "기쁨", sub: "5", position: "집사", how: "auto" },
  { kind: "order", row: 902, year: 2026, committee: "교육위원회", team: "유년부", option: "", status: "임명확정", who: "소망 3목장", position: "집사", how: "none" }];
window.calls = [];
async function call(action, body) {
  window.calls.push({ action, body });
  await new Promise((r) => setTimeout(r, 50));
  if (action === "peoplePerson") {
    const id = Number(body.id);
    if (id === 11) return { ok: true, person: FULL, family: FAM, history };
    const f = FAM.find((x) => x.person_id === id) || FAM[0];
    return { ok: true, person: { ...f, household_id: 11, household_head: "홍길동" },
      family: [{ person_id: 11, name: "홍길동", household_rel: "본인" }],
      history: { counts: { ministry: 1, bible: 0 }, ministry: [ministry[0]], bible: [] } };
  }
  if (action === "peopleHistory") return { ok: true, rows: unlinked };
  if (action === "peopleLink") return { ok: true, how: body.how, relinked: body.how === "auto" && body.row === 101, history };
  return { ok: false, error: "unknown-action" };
}
window.openFake = (id = 11, tab) => openPerson(call, id, () => {}, document.getElementById("back"), tab ? { tab } : {});
</script></body></html>
```
  재는 것 `.superpowers/sdd/person-history/harness/check_tabs.py`:

```python
# -*- coding: utf-8 -*-
"""자세히 창 탭 — 헤드리스로 재기(계획 Task 6 Step 9). 먼저 worktree 뿌리에서: python -m http.server 8765 --bind 127.0.0.1"""
import os, sys
from playwright.sync_api import sync_playwright
sys.stdout.reconfigure(encoding="utf-8")
BASE = "http://127.0.0.1:8765/.superpowers/sdd/person-history/harness/index.html"
OUT = os.path.dirname(os.path.abspath(__file__))
fails = []
def ok(label, cond):
    print(("OK   " if cond else "FAIL ") + label)
    if not cond: fails.append(label)

# ⚠️ openFake 는 창이 닫힐 때 끝나는 약속을 돌려준다 — evaluate 가 기다리지 않게 늘 「() => { openFake(…); }」로 부른다
MEASURE = """() => { const d = document.querySelector('.dlg.pd');
  const p = d.querySelector('.pd-panel:not([data-off])');
  return { dlgScroll: d.scrollHeight - d.clientHeight, dlgW: d.scrollWidth - d.clientWidth,
           pageW: document.documentElement.scrollWidth - innerWidth, dims: document.querySelectorAll('.dlg-dim').length,
           panelScroll: p ? p.scrollHeight - p.clientHeight : 0, h: Math.round(d.getBoundingClientRect().height) }; }"""

with sync_playwright() as pw:
    b = pw.chromium.launch()
    for n in (8, 25):                                     # PC 1366×657 — 세 탭 모두 창 무스크롤 · 탭을 바꿔도 창 높이 그대로
        pg = b.new_page(viewport={"width": 1366, "height": 657})
        pg.goto(f"{BASE}?n={n}")
        pg.evaluate("() => { openFake(11); }")
        pg.wait_for_selector(".dlg.pd .pd-tabs")
        hs = []
        for tab in ("church", "ministry", "bible"):
            pg.click(f'[data-pd-tab="{tab}"]')
            pg.wait_for_timeout(200)
            m = pg.evaluate(MEASURE)
            hs.append(m["h"])
            ok(f"PC n={n} {tab}: 창 무스크롤 ({m['dlgScroll']})", m["dlgScroll"] <= 1)
            ok(f"PC n={n} {tab}: 창 하나 ({m['dims']})", m["dims"] == 1)
            if n == 25 and tab == "ministry": ok(f"PC n=25 사역: 탭 안만 스크롤 ({m['panelScroll']})", m["panelScroll"] > 0)
            pg.screenshot(path=os.path.join(OUT, f"pc-n{n}-{tab}.png"))
        ok(f"PC n={n}: 탭을 바꿔도 창 높이 그대로 {hs}", max(hs) - min(hs) <= 1)
        pg.close()
    for w, h in ((390, 760), (320, 640)):                 # 폰 — 가로 넘침 0 · 탭으로 열면 「아직 안 이어진 기록」을 부른다
        pg = b.new_page(viewport={"width": w, "height": h})
        pg.goto(f"{BASE}?n=8")
        pg.evaluate("() => { openFake(11, 'ministry'); }")
        pg.wait_for_selector('[data-pd-panel="ministry"]:not([data-off]) .pd-hr')
        pg.wait_for_selector(".pd-un-b")
        pg.click(".pd-un-b")
        pg.wait_for_selector('.pd-ul [data-pd-act="link"]')
        m = pg.evaluate(MEASURE)
        ok(f"폰 {w}: 가로 넘침 없음 (창 {m['dlgW']} · 쪽 {m['pageW']})", m["dlgW"] <= 0 and m["pageW"] <= 0)
        pg.screenshot(path=os.path.join(OUT, f"phone{w}-ministry.png"), full_page=True)
        pg.close()
    pg = b.new_page(viewport={"width": 1366, "height": 657})   # 동작
    pg.goto(f"{BASE}?n=8")
    pg.evaluate("() => { openFake(11); }")
    pg.wait_for_selector(".dlg.pd .pd-tabs")
    ok("탭·잇기 단추에 data-v 없음", pg.evaluate("document.querySelectorAll('.pd-main [data-v]').length") == 0)
    pg.click('[data-pd-tab="ministry"]')
    pg.wait_for_selector(".pd-un-b")
    ok("탭을 누르면 peopleHistory 한 번", pg.evaluate("calls.filter(c => c.action === 'peopleHistory').length") == 1)
    pg.click('[data-pd-tab="bible"]')
    ok("다른 탭을 눌러도 다시 부르지 않는다", pg.evaluate("calls.filter(c => c.action === 'peopleHistory').length") == 1)
    pg.click('[data-pd-tab="ministry"]')
    pg.click('[data-pd-panel="ministry"] [data-pd-act="unlink"]')
    ok("풀기 → 그 자리 확인 · 창 하나", pg.evaluate("document.querySelectorAll('.dlg-dim').length") == 1 and pg.locator(".pd-hc").count() == 1)
    pg.click('.pd-hc [data-pd-act="unlink-yes"]')
    pg.wait_for_timeout(300)
    ok("풀기 → peopleLink how auto", pg.evaluate("calls.some(c => c.action === 'peopleLink' && c.body.how === 'auto' && c.body.person === 11)"))
    ok("ArrowRight 로 다음 탭", (pg.focus('[data-pd-tab="ministry"]') or pg.keyboard.press("ArrowRight") or True)
       and pg.evaluate("document.querySelector('[data-pd-tab=\"bible\"]').getAttribute('aria-selected')") == "true")
    pg.click('[data-pd-tab="church"]')
    pg.click('[data-fam="12"]')                             # 가족 칩은 교적 칸 안 — 넘어가면 교적
    pg.wait_for_function("calls.filter(c => c.action === 'peoplePerson').length === 2 && document.querySelector('.dlg.pd .pd-tabs')")
    ok("가족으로 넘어가면 그 탭(교적)으로", pg.evaluate("document.querySelector('[data-pd-tab=\"church\"]').getAttribute('aria-selected')") == "true")
    pg.click('.dlg.pd [data-v="1"]')
    pg.evaluate("() => { openFake(12, 'ministry'); }")       # 탭을 넘기는 길(opts.tab) 그대로
    pg.wait_for_selector('.dlg.pd [data-pd-tab="ministry"][aria-selected="true"]')
    ok("opts.tab 으로 연 탭", True)
    b.close()
print("모두 통과" if not fails else f"실패 {len(fails)}건")
sys.exit(1 if fails else 0)
```

  Run(백그라운드로 서버 하나 · 끝나면 **그 PID 만** 끈다):
  ```bash
  cd /c/Projects/church-admin/.worktrees/person-history && python -m http.server 8765 --bind 127.0.0.1   # run_in_background
  python .superpowers/sdd/person-history/harness/check_tabs.py
  ```
  Expected: 끝줄 `모두 통과`. 스크린숏(`pc-n8-*.png`·`phone390-ministry.png`·`phone320-ministry.png`)을 눈으로 본다 — 탭이 창 위쪽 한 줄 · 칩 색이 신청 현황과 같음 · 「풀기」 확인이 줄 안.
  ⚠️ 「PC 창 무스크롤」이 실패하면 **먼저 `.pd-tabbed .pd-photo` 의 466 을 키운다**(탭 줄 높이만큼 사진을 더 줄인다) — 라벨 위·값 아래로 되돌리지 않는다(admin.css 930169a 경고).

- [ ] **Step 10: 전체 점검**

Run: `python tools/preflight.py`
Expected: `모두 통과`(node --check 에 새 js 둘 · 시험 전부)

- [ ] **Step 11: 커밋(푸시 안 함 · 하네스는 Task 1 Step 1 의 `.superpowers/sdd/.gitignore` 가 막아 안 들어간다)**

```bash
git add js/menus/people/person-history.js js/menus/people/person-tabs.js js/menus/people/person-detail.js js/menus/people/search.js \
  js/menus/bibleevent/person-popup.js css/admin.css tests/person-history.test.mjs
git commit -m "feat(교인명부): 자세히 창 오른쪽 칸 탭 「교적 · 🤝 사역 · ✍️ 성경필사」 — PC 무스크롤 · 아직 안 이어진 기록 · 풀기 확인은 그 자리" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git status --short            # 아무것도 없음(tests/person-detail.test.mjs 는 고치지 않았다 · 하네스는 무시된다)
```

---

### Task 7: 화면 단추 — 「📵 결정된 신청 번호 지우기(N건)」 · 「🔗 기록 잇기 맞추기」(총괄)

**Files:**
- Modify: `js/menus/ministry/status-logic.js`, `js/menus/ministry/status.js`, `js/menus/people/stats-logic.js`, `js/menus/people/stats.js`
- Test: `tests/status-logic.test.mjs`, `tests/people-stats.test.mjs`

**Interfaces:**
- Consumes: `ministryPhoneClear {count} → {ok, count} | {error:"conflict", count}` · `peopleLinkSync {apply:true} → {orders, signups, added, changed, unmatched, written}` · render 의 `me.roles`(main.js 가 넘긴다).
- Produces: `status-logic.js` `PHONE_DECIDED`·`phoneClearCount(rows)`(서버와 같은 셈 — 결정 상태 · 번호가 빈 글자가 아님) · `stats-logic.js` `linkSyncText(r)`.

- [ ] **Step 1: 실패하는 시험**
  - `tests/status-logic.test.mjs` 의 import 에 `phoneClearCount` 를 더하고 끝에:

```js
test("phoneClearCount — 결정된(임명·미채택·취소) 신청 가운데 번호가 남은 것(서버 ministryPhoneClear 와 같은 셈)", () => {
  const rows = [{ status: "임명확정", phone: "010-0000-0001" }, { status: "취소", phone: "" }, { status: "접수완료", phone: "010-0000-0002" },
    { status: "미채택", phone: "x" }, { status: "취소", phone: "010-0000-0003" }, { status: "신청완료", phone: "" }];
  assert.equal(phoneClearCount(rows), 3);
  assert.equal(phoneClearCount([]), 0);
  assert.equal(phoneClearCount(null), 0);
});
```
  - `tests/people-stats.test.mjs` 의 stats-logic import 에 `linkSyncText` 를 더하고 끝에:

```js
test("linkSyncText — 「기록 잇기 맞추기」 결과 한 줄(천 단위 쉼표)", () => {
  assert.equal(linkSyncText({ added: 3, changed: 1, unmatched: 12, orders: 1200, signups: 2834 }),
    "새로 이음 3 · 바뀜 1 · 못 맞춤 12 (사역신청 1,200줄 · 성경필사 2,834줄)");
  assert.equal(linkSyncText({}), "새로 이음 0 · 바뀜 0 · 못 맞춤 0 (사역신청 0줄 · 성경필사 0줄)");
});
```
  Run: `node --experimental-strip-types --test tests/status-logic.test.mjs tests/people-stats.test.mjs` → Expected: FAIL 2건

- [ ] **Step 2: 순수 함수**
  - `status-logic.js` 의 `dupMap` 위 주석 `// 번호는 결정이 나면 서버가 지우므로 남은 것끼리만 본다.` →
    `// 번호가 남은 것끼리만 본다(2026-10-01 부터 결정된 신청도 번호를 갖고 있다 — 「결정된 신청 번호 지우기」·결정 뒤 180일에 지워진다).`
    파일 끝에:

```js
// 「📵 결정된 신청 번호 지우기(N건)」의 N — 서버 ministryPhoneClear 가 같은 셈으로 대조한다(다르면 conflict).
//   결정 상태(임명확정·미채택·취소 — 서버 ministry.ts DECIDED)이고 번호가 빈 글자가 아닌 신청.
export const PHONE_DECIDED = ["임명확정", "미채택", "취소"];
export const phoneClearCount = (rows) =>
  (rows || []).filter((r) => PHONE_DECIDED.includes(r && r.status) && String((r && r.phone) || "") !== "").length;
```
  - `stats-logic.js` 끝에:

```js
// 「🔗 기록 잇기 맞추기」(총괄 · peopleLinkSync) 결과 한 줄
export function linkSyncText(r) {
  const n = (x) => Number(x || 0).toLocaleString("ko-KR");
  return `새로 이음 ${n(r?.added)} · 바뀜 ${n(r?.changed)} · 못 맞춤 ${n(r?.unmatched)} (사역신청 ${n(r?.orders)}줄 · 성경필사 ${n(r?.signups)}줄)`;
}
```
  Run → Expected: PASS

- [ ] **Step 3: `status.js` — 단추**
  - import `import { STATES, SHORT, CLS, rangeDates, filterRows, personKey, teamKey, dupMap, dupOthers, teamCounts, statusCounts, clearPhone }` 에 `, phoneClearCount` 를 더한다.
  - `<div class="acts mn-acts"><button type="button" class="btn" data-act="reload">↻ 새로 불러오기</button></div>` →

```js
    <div class="acts mn-acts"><button type="button" class="btn" data-act="reload">↻ 새로 불러오기</button>
      <button type="button" class="btn" data-act="phoneclear" hidden></button></div>
```
  - `draw` 함수 첫 줄(`const now = new Date();`) 다음에:

```js
    // 📵 결정된 신청 번호 지우기(2026-10-01) — 결정됐고 번호가 남은 신청이 있을 때만 · 수는 전체 기준(거르기와 상관없이)
    const nClear = phoneClearCount(rows), pcb = el.querySelector('[data-act="phoneclear"]');
    pcb.hidden = !nClear;
    pcb.textContent = `📵 결정된 신청 번호 지우기(${nClear}건)`;
```
  - `async function remove(id) {` **앞**에:

```js
  // 결정된(임명·취소) 신청의 휴대폰 번호를 그 해 것 모두 지운다(2026-10-01 · 결정 뒤에도 180일이 지나면 저절로 지워진다).
  // 보낸 수가 서버의 지금 수와 다르면 지우지 않고 알린 뒤 새로 불러온다(그사이 다른 담당자가 바꿨다). 지운 뒤에도 새로 불러와
  // 교적 표시를 번호 없이 다시 센다(번호로 이어 둔 교인 잇기는 남는다).
  async function clearPhones() {
    const n = phoneClearCount(rows);
    if (!n) return;
    const yes = await dialog({ title: "📵 결정된 신청 번호 지우기", danger: true, ok: `${n}건 지우기`, cancel: "그만두기",
      html: `<b>${esc(res.year)}년</b> 신청 가운데 임명·취소가 정해진 <b>${n}건</b>의 휴대폰 번호를 지웁니다.<br>` +
        `교적 표시는 번호 없이 다시 셉니다. 되돌릴 수 없어요.<br>` +
        `<small class="muted">지우지 않아도 결정 뒤 180일이 지나면 저절로 지워져요.</small>` });
    if (!yes || !el.isConnected) return;
    const d = await busy(el, () => call("ministryPhoneClear", { count: n }));
    if (!d.ok) {
      if (d.error === "conflict") {
        await dialog({ title: "그사이 바뀌었어요", text: `지금 지울 번호는 ${d.count ?? 0}건이에요 — 새로 불러올게요`, cancel: null });
        return reload();
      }
      dialog({ title: "⚠️ 번호를 지우지 못했어요", text: errorText(d), cancel: null });
      return;
    }
    toast(`📵 번호 ${d.count}건을 지웠어요`);
    reload();
  }
```
  - 클릭 처리의 `if (act === "reload") return reload();` 다음 줄에 `    if (act === "phoneclear") return clearPhones();`
  - `setStatus` 안 `// 결정이 나면 서버가 번호를 지운다 — …` 주석을
    `// 옛 서버(결정 때 번호를 지우던 판 · 2026-10-01 전)의 답이면 카드 번호를 지우고 교적 표시를 서버가 다시 센 값으로(clearPhone) — 지금 서버는 phoneCleared 가 늘 false`
    로 바꾼다(코드는 그대로).

- [ ] **Step 4: `stats.js` — 카드(총괄만)**
  - import `import { guTable, positionTable, ageTable, pickOptions, statsChoices, guCardRows } from "./stats-logic.js";` 에 `, linkSyncText` 를, `import { esc, errorText } from "../../core/ui.js";` 를 `import { esc, errorText, dialog, toast, busy } from "../../core/ui.js";` 로.
  - `export async function render(el, { call }) {` → `export async function render(el, { call, me }) {`
  - `${secHtml("age", !!F)}\`;` → ``${secHtml("age", !!F)}${(me?.roles || []).includes("super") ? LINKSYNC_HTML : ""}`;``
  - 파일의 `const secHtml = …` 정의 다음에:

```js
// 🔗 기록 잇기 맞추기(총괄만 · 2026-10-01) — 새 교인명부를 올린 뒤 한 번. 서버가 다시 맞추고 수만 돌려준다(people.linksync 기록).
const LINKSYNC_HTML = `<div class="card pp-linksync"><h3 class="sec-title">🔗 기록 잇기 맞추기</h3>` +
  `<p class="muted">새 교인명부를 올린 뒤 한 번 눌러 주세요 — 사역신청·성경필사 기록을 교인과 다시 잇습니다. ` +
  `담당자가 「이분 것」·「이분 아님」으로 정한 것은 그대로 둡니다.</p>` +
  `<div class="acts"><button type="button" class="btn" data-act="linksync">🔗 기록 잇기 맞추기</button></div></div>`;
```
  - 클릭 처리 `el.addEventListener("click", (e) => { … openPick(b); });` 안 맨 끝(닫는 `});` 앞)에:

```js
    const ls = e.target.closest('button[data-act="linksync"]');
    if (ls && el.contains(ls)) linkSync();
```
  - 그 `el.addEventListener("click", …)` **앞**에:

```js
  async function linkSync() {
    const yes = await dialog({ title: "🔗 기록 잇기 맞추기", ok: "맞추기", cancel: "그만두기",
      html: "사역신청(모든 해)·성경필사(초안 회차 빼고) 기록을 지금 교인명부로 다시 잇습니다.<br>몇십 초 걸릴 수 있어요. 사람이 정한 잇기는 그대로예요." });
    if (!yes || !el.isConnected) return;
    const r = await busy(el, () => call("peopleLinkSync", { apply: true }));
    if (!r.ok) { dialog({ title: "⚠️ 맞추지 못했어요", text: errorText(r), cancel: null }); return; }
    toast("🔗 기록 잇기를 맞췄어요");
    dialog({ title: "🔗 기록 잇기 맞추기 — 끝", text: linkSyncText(r), cancel: null });
  }
```

- [ ] **Step 5: 점검**

Run: `python tools/preflight.py` → Expected: `모두 통과` · `grep -rn '<select\|type="date"\|type="time"' js/` → 새로 생긴 줄 없음

- [ ] **Step 6: 커밋(푸시 안 함)**

```bash
git add js/menus/ministry/status-logic.js js/menus/ministry/status.js js/menus/people/stats-logic.js js/menus/people/stats.js \
  tests/status-logic.test.mjs tests/people-stats.test.mjs
git commit -m "feat(사역신청·교인명부): 신청 현황 「결정된 신청 번호 지우기(N건)」 · 교인 현황 「기록 잇기 맞추기」(총괄)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: 가짜 명부 동명이인 · 화면 확인용 개발 시드 · 개발 한 바퀴

**Files:**
- Modify: `tools/people/fake_people.py`
- Create: `tests/seed-person-history-dev.mjs`

**Interfaces:**
- Produces: 가짜 명부에 동명이인 셋(김하늘 5·12 · 이바다 23·47 · 최온유 31·64 — 교구가 서로 다르다) · `node --experimental-strip-types tests/seed-person-history-dev.mjs [--clean]` — 신청(신청마다 가짜 앱 계정 `users.name` `ca-demo-hist-N` 한 줄 · `user_id` 는 그 uuid)·회차 `ca-demo-hist1`(closed)·`ca-demo-hist2`(archived)·(표가 있으면) 사역 이력(`src_key` `ca-demo-hist|…`).

- [ ] **Step 1: `fake_people.py` 에 동명이인을 더한다** — `def name_of(i):` 위에:

```python
# 같은 이름 — 소속이 다른 동명이인(교적 표시 「확인 필요」 · 「자세히」 창 잇기 · 2026-10-01 에 둘 더함).
# 교구·목장은 person() 이 가족 머리(head)로 정한다 — 23·47·31·64 는 서로 다른 교구다.
SAME_NAME = {5: "김하늘", 12: "김하늘", 23: "이바다", 47: "이바다", 31: "최온유", 64: "최온유"}
```
  그리고 함수 몸의 `if i in (5, 12):` 와 `return "김하늘"          # 5·12 는 같은 이름(확인 필요 시험)` 두 줄을 →

```python
    if i in SAME_NAME:
        return SAME_NAME[i]
```

- [ ] **Step 2: 개발 명부를 다시 넣는다**

```bash
supabase --workdir ~/.church-admin/supa-dev db query --linked "select count(*) as n from church_people"   # 99 면 2판 · 100 이면 1판
python tools/people/fake_people.py --variant 2      # 위가 100 이면 --variant 1
python tools/people/load_people.py --work "C:/Projects/교인명부_작업/fake" --target dev
```
Expected(살펴보기): `새로 0 · 바뀜 6 · 빠짐 0` 안팎(이름 넷 + 세대주 이름이 바뀐 가족 둘). **빠짐이 0 이 아니면 멈춘다.** 맞으면:
`python tools/people/load_people.py --work "C:/Projects/교인명부_작업/fake" --target dev --apply`

- [ ] **Step 3: `tests/seed-person-history-dev.mjs` 를 쓴다**

```js
// 개발 DB 에 「자세히」 창 사역·성경필사 탭 확인용 가짜 기록을 넣는다/지운다(2026-10-01 · 계획 Task 8). 개발 전용.
//   set -a; . ~/.church-admin/dev.env; set +a
//   node --experimental-strip-types tests/seed-person-history-dev.mjs          # 넣기(있으면 지우고 다시)
//   node --experimental-strip-types tests/seed-person-history-dev.mjs --clean  # 지우기만
// ⚠️ 진짜 이름을 넣지 않는다 — 이름은 개발 DB 의 **가짜** 교인명부(tools/people/fake_people.py)에서 장년 동명이인을 그때그때 고른다.
// ⚠️ 신청 줄의 user_id 는 신청마다 만든 가짜 앱 계정(users · 이름 「ca-demo-hist-N」)의 uuid — 글자를 넣으면 안 된다:
//    칸은 text 라 들어가지만 신청 현황(ministryList)이 그 해 신청 줄 전부의 user_id 로 push_subscriptions(user_id uuid)를 물어
//    22P02 → 개발의 📋 신청 현황이 **모든 세션에서** 500 이 된다. 지울 때는 잇기 줄 → 신청 → users 차례.
// ⚠️ 회차는 ca-demo-hist1(closed)·hist2(archived) — 초안이면 탭에 안 나온다. seed-bible-events-dev 의 --clean(ca-demo-*)이
//    이 회차도 지운다(괜찮다 — 다시 넣으면 된다 · 그쪽은 users 를 「데모앱성도」 이름으로만 지워 이 계정은 안 건드린다).
// ⚠️ 잇기 줄은 넣지 않는다 — 신청 현황·회차 명단을 열거나 총괄 「기록 잇기 맞추기」를 누르면 서버가 잇는다(그것을 보려는 시드다).
// ⚠️ 이름에 .test. 가 없어 preflight 는 이 파일을 돌리지 않는다.
const URL_ = process.env.DEV_URL, SERVICE = process.env.DEV_SERVICE_KEY;
if (!URL_ || !URL_.includes("ktpwthwqzgcqcrmsafdo")) throw new Error("개발 프로젝트에만 돌린다");
const svc = { apikey: SERVICE, "Content-Type": "application/json",
  ...(SERVICE.startsWith("sb_secret_") ? {} : { Authorization: "Bearer " + SERVICE }) };
async function rest(path, method = "GET", data) {
  const r = await fetch(URL_ + "/rest/v1/" + path, { method,
    headers: { ...svc, Prefer: "return=representation" }, body: data ? JSON.stringify(data) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : [];
}
const UID = "ca-demo-hist-", EVS = ["ca-demo-hist1", "ca-demo-hist2"];
const GU7 = ["믿음", "소망", "사랑", "섬김", "은혜", "화평", "기쁨"];
const mokNum = (mok3) => (/(\d+)(?:목장)?$/.exec(String(mok3 || ""))?.[1] ?? "").replace(/^0+(?=\d)/, "");
const hasTable = async (t) => { try { await rest(`${t}?select=id&limit=1`); return true; } catch (e) { if (/PGRST205|42P01/.test(e.message)) return false; throw e; } };

async function clean() {
  const us = await rest(`users?select=id&name=like.${UID}*`);
  const os = us.length ? await rest(`ministry_orders?select=id&user_id=in.(${us.map((u) => u.id).join(",")})`) : [];
  const ss = await rest(`event_signups?select=id&event_id=in.(${EVS.join(",")})`);
  if (os.length) await rest(`people_links?kind=eq.order&row_id=in.(${os.map((r) => r.id).join(",")})`, "DELETE");
  if (ss.length) await rest(`people_links?kind=eq.signup&row_id=in.(${ss.map((r) => r.id).join(",")})`, "DELETE");
  if (os.length) await rest(`ministry_orders?id=in.(${os.map((r) => r.id).join(",")})`, "DELETE");
  if (us.length) await rest(`users?name=like.${UID}*`, "DELETE");                             // 신청 다음에 계정
  await rest(`events?id=in.(${EVS.join(",")})`, "DELETE");                                    // 줄은 CASCADE
  let mh = 0;
  if (await hasTable("ministry_history")) {
    mh = (await rest("ministry_history?select=id&src_key=like.ca-demo-hist*")).length;
    if (mh) await rest("ministry_history?src_key=like.ca-demo-hist*", "DELETE");
  }
  console.log(`지웠다: 신청 ${os.length} · 앱 계정 ${us.length} · 명단 ${ss.length} · 사역 이력 ${mh}`);
}

if (process.argv.includes("--clean")) { await clean(); process.exit(0); }
await clean();

const people = await rest("church_people?select=person_id,name,name_key,kind2,mok1,mok3,phone1&order=person_id&limit=1000");
const by = new Map();
for (const p of people) {
  if (p.kind2 !== "장년" || !GU7.includes(p.mok1) || !mokNum(p.mok3)) continue;
  if (!by.has(p.name_key)) by.set(p.name_key, []);
  by.get(p.name_key).push(p);
}
const pairs = [...by.values()].filter((l) => l.length >= 2 && l[0].mok1 !== l[1].mok1).slice(0, 3);
if (pairs.length < 2) throw new Error("가짜 명부에 교구가 다른 장년 동명이인이 둘 이상 있어야 한다 — fake_people.py(동명이인)를 개발에 넣었는지 볼 것");
const cfg = await rest("app_config?select=value&key=eq.ministry");
const year = Number(cfg[0]?.value?.year) || 2027;
const cat = await rest(`ministry_catalog?select=id,committee,team&year=eq.${year}&order=id&limit=6`);
const specs = [], signups = [], hist = [];
// ⚠️ 배치 insert 는 객체들의 칸이 모두 같아야 한다(PGRST102) — o()·s() 한 모양
const o = (y, p, gu, mok, phone, status, t) => ({ year: y, team_id: t.id, committee: t.committee, team: t.team,
  option: "", name: p.name, who: `${gu} ${mok}목장`, phone, status, source: "app", position: "집사",
  decided_at: status === "임명확정" ? `${y - 1}-12-27T00:00:00Z` : null });
const s = (ev, p, gu, mok) => ({ event_id: ev, user_id: null, source: "import", who_type: "교구", group_name: gu, sub_name: mok, name: p.name,
  ident_key: `교구|${gu}|${mok}|||${p.name}`, position: "집사", phone: "", memo: "", answers: {}, note: "명단 올리기" });
for (const [a, b] of pairs) {
  const other = GU7.find((g) => g !== a.mok1 && g !== b.mok1);
  specs.push(o(year, a, a.mok1, mokNum(a.mok3), null, "접수완료", cat[0]),            // 맞음 → a
    o(year - 1, a, a.mok1, mokNum(a.mok3), null, "임명확정", cat[1]),                 // 맞음 → a(지난 해)
    o(year - 2, b, b.mok1, mokNum(b.mok3), null, "임명확정", cat[2]),                 // 맞음 → b
    o(year, a, other, "9", a.phone1 || null, "신청완료", cat[3]),                      // 소속 다름 · 번호 → a(번호)
    o(year - 1, a, other, "8", null, "임명확정", cat[4]));                             // 못 맞춤 → 「아직 안 이어진 기록」
  signups.push(s(EVS[0], a, a.mok1, mokNum(a.mok3)), s(EVS[1], a, other, "8"));      // 맞음 → a · 못 맞춤
  hist.push({ year: 2024, committee: "교육위원회", team: "중등부", role_title: "교사", name: a.name, position: "집사",
    mok: `${a.mok1}-${mokNum(a.mok3)}`, person_id: a.person_id, link_how: "auto", match_basis: "같은 소속", source: "excel",
    src_key: `ca-demo-hist|${a.person_id}|2024` },
    { year: 2025, committee: "예배위원회", team: "안내팀", role_title: "", name: b.name, position: "집사",
    mok: `${other}-7`, person_id: null, link_how: "auto", match_basis: "", source: "excel",
    src_key: `ca-demo-hist|${b.person_id}|2025` });
}
// 신청마다 가짜 앱 계정 한 줄 — user_id 는 그 uuid(위 ⚠️ · 글자를 넣으면 신청 현황이 500)
const us = await rest("users", "POST", specs.map((_, i) => ({ type: "교구", gu: "시험", mok: "0", name: UID + (i + 1),
  identity_key: `교구|시험|0|||${UID}${i + 1}` })));
const uidOf = new Map(us.map((u) => [u.name, u.id]));
const orders = specs.map((x, i) => ({ ...x, user_id: uidOf.get(UID + (i + 1)) }));
await rest("ministry_orders", "POST", orders);
const ev = { short_title: "", subtitle: "화면 확인용", season: "", kind: "signup", list_until: null,
  needs: { position: true, phone: false, memo: false, extra: [] } };
await rest("events", "POST", [
  { ...ev, id: EVS[0], title: "2026 사순절 마가복음 성경필사 완서자", status: "closed", opens_on: "2026-03-01", closes_on: "2026-04-04" },
  { ...ev, id: EVS[1], title: "2025 썸머 써 바이블", status: "archived", opens_on: "2025-06-01", closes_on: "2025-08-31" },
]);
await rest("event_signups", "POST", signups);
const mh = await hasTable("ministry_history");
if (mh) await rest("ministry_history", "POST", hist);
console.log(`넣었다: 동명이인 ${pairs.length}쌍(${pairs.map((l) => l[0].name).join(", ")}) · 신청 ${orders.length}(앱 계정 ${us.length}) · 명단 ${signups.length}` +
  ` · 사역 이력 ${mh ? hist.length : "표 없음(b6 전)"} — 신청 현황·회차 명단을 열거나 총괄 「기록 잇기 맞추기」를 누르면 이어진다`);
```

- [ ] **Step 4: 시드를 돌리고 개발 시험 전부·점검**

```bash
set -a; . ~/.church-admin/dev.env; set +a
node --experimental-strip-types tests/seed-person-history-dev.mjs
node --experimental-strip-types --test tests/server.dev.test.mjs
python tools/preflight.py
```
Expected: `넣었다: 동명이인 3쌍(…) · 신청 15(앱 계정 15) · 명단 6 · 사역 이력 …` · 개발 시험 `# fail 0`(「신청 현황」 시험이 시드의 그 해 신청 6줄과 함께 돈다 — 500 이면 시드가 글자 user_id 를 넣은 것) · `모두 통과`

- [ ] **Step 5: localhost 한 바퀴(친구와 · 개발 DB · 카카오 로그인)** — `python -m http.server 8000`(이 worktree 뿌리) → http://localhost:8000 · 「개발 DB」 띠 확인.
  - 총괄로: 📊 교인 현황 맨 아래 「🔗 기록 잇기 맞추기」 → 결과 창의 수 · 📜 바꾼 기록 → 「교인명부 기록」에 「기록 잇기 맞추기」 한 줄.
  - 🔎 교인 찾기 → 동명이인(시드가 찍은 이름) → 자세히: 탭 「🤝 사역 N · ✍️ 성경필사 N」 · 2027/2026 줄 · 「이름이 같고 아직 안 이어진 기록 N건 ▸」 → 「이분 것」 → 숫자가 는다 · 「풀기」 → 「정말 풀까요?」 → 예 → 다시 붙으면 「이분 아님」 권함.
  - PC(1366×768 노트북)에서 세 탭 모두 창 스크롤 없음 · 폰에서 가로 넘침 없음 · 같은 창을 📋 신청 현황·성경필사 📋 명단의 이름 누르기로도 연다(세 입구).
  - 📋 신청 현황 「📵 결정된 신청 번호 지우기(N건)」 → 확인 창 → 지움 → 목록이 새로 불러와짐.
  - 사역신청 역할만인 분으로: 「자세히」 창이 아니라 작은 창(예전 그대로) · 「기록 잇기 맞추기」 단추 없음.
  - **설계와 다르게 정한 셋을 친구께 화면으로 보이고 확인받는다**(설계는 친구 승인을 받은 문서다 — 다르게 간 곳은 따로 허락을 받는다 · 아래 「계획에서 판단한 곳」):
    - [ ] **판단 3** — 「이분 아님」으로 둔 기록이 「아직 안 이어진 기록」 아래 「「이분 아님」으로 둔 기록 N건」으로 **같은 이름의 모든 창에 — 「이분 아님」을 누른 그분 창에도** 따로 보인다. 설계 §4 는 「`link_how='none'` 줄은 여기 나오지 않는다」로 승인됐다. 까닭: 잇기 표가 누구를 「이분 아님」으로 했는지 모른다(`person_id` null) — 빼면 다른 동명이인 창에서도 그 기록을 이을 길이 없다(사역 이력 줄만 b6 메뉴에서 고칠 수 있다). 시드의 동명이인 창에서 한 줄을 「이분 아님」으로 두고 두 창을 함께 보여 드린다.
    - [ ] **판단 2** — 자동 줄은 「맞춘 명부가 지금 명부와 **다르면**」 다시 맞춘다(설계 「옛것이면」보다 넓다 — 개발 시험이 지운 명부로 맞춘 줄도 다시).
    - [ ] **판단 7** — 자세히 창에서 사역 이력 줄을 이을 때 남는 기록 `history.link` 의 내용이 `{op, year, by:"directory"}`(설계 §5 는 `{id, by}`) — b6 의 바꾼 기록 화면이 `op`·`year` 로 읽어서. 이름·교인ID 는 없다(설계와 같음).
    친구가 **판단 3 을 반대하면**(설계대로 빼기) — 아래 넷을 고치고, 점검·개발 배포·개발 시험(`python tools/preflight.py` → `git merge main --no-edit` → `supabase functions deploy church-admin --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo` → `set -a; . ~/.church-admin/dev.env; set +a; node --experimental-strip-types --test tests/server.dev.test.mjs` → `모두 통과`·`# fail 0`) 뒤 새 커밋 하나
    (`git add supabase/functions/church-admin/people-links.ts tests/people-links.test.mjs tests/server.dev.test.mjs js/menus/people/person-history.js && git commit -m "fix(교인명부): 「이분 아님」 기록은 아직 안 이어진 기록에서 뺀다(설계 §4 · 친구 확인)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"`):
    ① `supabase/functions/church-admin/people-links.ts` `unlinkedRows` 의
       `const open = (l?: LinkRow): LinkHow | null => (!l ? "auto" : l.link_how === "none" ? "none" : l.person_id === null ? "auto" : null);` →
       `const open = (l?: LinkRow): LinkHow | null => (!l ? "auto" : l.link_how === "none" ? null : l.person_id === null ? "auto" : null);`
       그리고 `const hist = (x.history ?? []).map((h) => ({` → `const hist = (x.history ?? []).filter((h) => h?.link_how !== "none").map((h) => ({`
       (그 위 주석 「「이분 아님」으로 둔 줄(how none · 화면이 따로 묶는다)」 → 「「이분 아님」으로 둔 줄은 빼고(설계 §4 · 친구 확인)」)
    ② `tests/people-links.test.mjs` 「unlinkedRows」 시험 — 기대 목록에서 `["order", 4, "none"],` 을 지우고, 그 아래 `Object.keys(rows[3])` → `Object.keys(rows[2])` · `Object.keys(rows[4])` → `Object.keys(rows[3])`, 시험 이름 「…줄(auto)과 「이분 아님」(none)만 …」 → 「…줄(auto)만 · 「이분 아님」(none)도 빼고 …」
    ③ `tests/server.dev.test.mjs` 「이분 것·이분 아님·풀기」 시험의 `assert.equal(un.body.rows.find((x) => x.kind === "order" && x.row === PL.orders.o3)?.how, "none");` →
       `assert.equal(un.body.rows.some((x) => x.kind === "order" && x.row === PL.orders.o3), false, "「이분 아님」 줄은 나오지 않는다(설계 §4)");`
    ④ `js/menus/people/person-history.js` 는 그대로 둔다(how none 줄이 안 오면 「「이분 아님」으로 둔 기록」 묶음이 저절로 안 그려진다) — 그 위 주석 「「이분 아님」으로 둔 줄은 따로 묶는다(…계획 판단)」 끝에 「· 서버가 지금은 보내지 않는다(친구 확인 2026-10-…)」를 더한다.
    판단 2·7 을 반대하면 멈추고 친구와 다시 정한다(7 은 b6 기록 화면과 맞물려 b6 세션과 함께 정한다).
  고칠 것이 나오면 고치고 **새 커밋** · 개발 함수 다시 배포 · 개발 시험 다시.

- [ ] **Step 6: 커밋(푸시 안 함)**

```bash
git add tools/people/fake_people.py tests/seed-person-history-dev.mjs
git commit -m "chore(교인명부): 가짜 명부 동명이인 셋 · 자세히 창 탭 확인용 개발 시드" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: 문서 — 교회 어드민 개인정보 안내 · CLAUDE.md · v2 지도

**Files:**
- Modify: `privacy.html`, `CLAUDE.md`(church-admin) · v2 `CLAUDE.md`
- (v2 `privacy/index.html`·`app.js` 번호 문구는 **Task 11 배포 날** — 지금 고치면 v2 의 다른 세션 푸시에 실려 먼저 나간다)

- [ ] **Step 1: `privacy.html` 6번** — 「보는 사람」 문단의 첫 문장 `보는 사람: 총괄 관리자와, 총괄 관리자가 「교인명부」 역할을 드린 담당자가 봐요.` 뒤에 이어 붙인다:

```html
 「교인명부」 역할을 드린 담당자는 자세히 보기의 탭에서 그분과 이어진 사역신청(성경암송 앱으로 낸 신청과 담당자가 넣은 종이 명단 — 해·위원회·팀·상태)·지난 해 사역 임명(해·위원회·팀·직책)·성경필사(암송) 참여(회차·그때 소속·직분)를 보고, 이름이 같은데 아직 아무 교인과도 이어지지 않은 기록(다른 분 것일 수 있어요)과 「이분 아님」으로 둔 기록도 해·위원회·팀·직책·상태·그때 소속·직분까지 봐요(그분 것이면 「이분 것」으로 잇기 위해서예요). 메모·취소 사유·전화번호·앱 계정은 어느 쪽에도 보이지 않아요.
```
  ⚠️ 이 문장은 **실제 화면보다 좁게 쓰면 안 된다**(사실과 다른 안내 — 성경암송 `CLAUDE.md` 「개인정보」). 화면이 보이는 것: 이어진 줄(`historyTabs` 칸) + 「아직 안 이어진 기록」(`unlinkedRows` 칸 — 다른 분 것일 수 있는 같은 이름 줄 · 「이분 아님」 줄 · 사역 이력은 목장까지) · 신청 탭엔 종이 명단 줄(`source` paper)도 있다. Task 8 Step 5 에서 판단 3 을 빼기로 했으면 「과 「이분 아님」으로 둔 기록도」를 지운다.
  설계 §7 의 문구(「그분의 사역(올해 신청·지난 해 임명)과 성경필사 참여」)는 이보다 좁다 — Task 11 Step 1 에서 친구께 이 문장과 함께 보인다.
  「기록:」 문단 끝 `…채우지 못했어도 물어본 이름은 남아요).<br>` 의 `<br>` **앞**에 이어 붙인다:

```html
 · 기록과 교인을 잇는 일 — 사역신청·성경필사 기록마다 이어진 교인ID 와, 사람이 잇거나 「이분 아님」으로 정했으면 누가 · 언제 정했는지가 남아요(이은 기록 자체는 「교인명부 기록」에 줄 번호와 어떻게 이었는지만)
```
  「이름을 누르면…」 문단 **다음 줄**에 새 문단:

```html
      기록과 교인 잇기: 사역신청과 성경필사(암송) 기록은 이름과 소속이 교인명부의 한 분과 맞으면(사역신청은 신청서 번호가 한 분과만 맞아도) 그 교인ID 와 이어 둬요. 이름이 같은 분이 여럿이거나 소속이 다르면 저절로 잇지 않고, 담당자가 자세히 보기에서 「이분 것」으로 잇거나 「이분 아님」으로 남겨요. 새 명단이 나오면 총괄 관리자가 다시 맞춰요(사람이 정한 것은 그대로).<br>
      사역신청서의 휴대폰 번호: 교적 대조와 임명 뒤 연락에 써요. 임명·취소가 정해진 뒤 담당자가 신청 현황에서 지우고, 늦어도 결정 뒤 180일이 지나면 저절로 지워져요(번호로 이어 둔 교인ID 는 남아요).<br>
```
- [ ] **Step 2: `privacy.html` 7번** — `보는 사람: 총괄 관리자와, 총괄 관리자가 「성경필사(암송)」 역할을 드린 담당자가 봐요.<br>` →

```html
      보는 사람: 총괄 관리자와, 총괄 관리자가 「성경필사(암송)」 역할을 드린 담당자가 봐요. 「교인명부」 역할을 드린 담당자는 교인 자세히 보기에서 그분과 이어진 참여, 그리고 이름이 같고 아직 안 이어진 참여(다른 분 것일 수 있어요 · 「이분 아님」으로 둔 것 포함)를 회차·그때 소속·직분만 봐요(6번).<br>
```
  (Task 8 Step 5 에서 판단 3 을 빼기로 했으면 「 · 「이분 아님」으로 둔 것 포함」을 지운다.)
- [ ] **Step 3: church-admin `CLAUDE.md` 「교인명부」 절**
  - 「**새 명단이 오면**」 줄의 끝 `… 수가 이치에 맞으면 \`--apply\`.` 뒤에 ` → 넣은 뒤 **총괄이 📊 교인 현황 맨 아래 「🔗 기록 잇기 맞추기」를 한 번**(사역신청·성경필사 기록을 새 명부로 다시 잇는다 — 사람이 정한 것은 그대로).`
  - 절 끝(「다음 명단(12월 무렵) 전에 할 다듬기 …」 줄 **앞**)에:

```markdown
- 「자세히」 창의 🤝 사역 · ✍️ 성경필사 탭(2026-10-01 · 설계 v2 `docs/superpowers/specs/2026-10-01-person-history-tabs-design.md` · 계획 `docs/superpowers/plans/2026-10-01-person-history-tabs.md`):
  기록과 교인을 잇는 표 `people_links`(SQL 006 · `(kind,row_id)` — `order`=ministry_orders · `signup`=event_signups · FK 없음 · 앱 표엔 칸을 안 더한다). 규칙·칸 지도는 `people-links.ts`(순수).
  ⚠️ **`manual`·`none` 은 자동이 절대 덮지 않는다** — 자동 쓰기는 SQL 함수 `people_links_auto` 하나로만(그 안의 where), 사람의 쓰기는 `peopleLink` 하나. 표에 직접 upsert 로 auto 를 쓰지 말 것.
  ⚠️ 「이름이 명부에 한 분뿐」은 **자동으로 잇지 않는다**(`autoLink` — 이름 누르기의 `personPickFor` ②와 다르다 · 친구 결정). 그때그때 잇기는 신청 현황·종이 명단 넣기·성경필사 명단·올리기·더하기·고치기(실패해도 화면은 그대로 · 서버 로그) — 초안 회차는 잇지 않는다.
  ⚠️ **번호로 이은 줄(`match_basis` 「번호」)은 그 신청의 번호가 지워진 뒤 다시 맞추지 않는다**(`phoneLinkKept` — 설계 §3.1-3 · 개인정보 안내 6번 「번호로 이어 둔 교인ID 는 남아요」). 이 조건을 빼면 번호가 지워진 뒤의 새 명단·「기록 잇기 맞추기」에서 번호로 이은 줄이 모두 null 로 끊긴다.
  ⚠️ 탭 응답은 칸 지도로만 — `user_id`·`ident_key`·`memo`·`phone`·`answers`·`note` 금지(시험이 키 집합 대조). 탭·잇기 단추에 `data-v`·`data-fam` 금지(dialog 가 닫기로, 가족 단추로 읽는다). 「풀기」 확인은 줄 안(창 위에 창 없음).
  ⚠️ PC 무스크롤은 CSS(`.pd-tabbed` · 사역·성경필사 칸 `contain:size`)가 지킨다 — 칸·탭을 더하면 1366×657 을 다시 잴 것(계획 Task 6 Step 9 하네스).
  사역 이력(b6 `ministry_history`)은 읽기만(`person_id` · `deleted_at is null`) · 표가 없으면 42P01·PGRST205 를 빈 것으로 · 넘긴 신청(`order_id`)은 신청 쪽으로 안 읽는다.
- 사역신청 휴대폰 번호(2026-10-01 친구 결정) — **결정(임명·취소) 때 지우지 않는다.** 신청 현황 「📵 결정된 신청 번호 지우기(N건)」(`ministryPhoneClear` — 보낸 수가 맞을 때만 · 기록 `ministry.phoneclear`) + 결정 뒤 **180일 자동**(SQL 007 `ministry_phone_expire()` · pg_cron `ministry-phone-expire` 매일 03:17 KST).
  ⚠️ 약속이 문서(개인정보 안내 6번 · 성경암송 `privacy/`)와 코드 두 곳이다 — 예약이 실제로 도는지 `cron.job_run_details` 로 본다. 옛 성경암송 관리 화면(얼림)은 결정 때 바로 지운다(더 엄격하니 둔다).
```
- [ ] **Step 4: v2 `CLAUDE.md` 지도 표** — 「교인명부(어드민 · dimode 교인목록·사진 …)」 줄 **다음**에 한 줄:

```markdown
| 교인명부 「자세히」 창 사역·성경필사 탭 · 잇기 표(`people_links`) · 사역신청 번호 180일(2026-10-01) | 설계 `docs/superpowers/specs/2026-10-01-person-history-tabs-design.md` · 계획 `docs/superpowers/plans/2026-10-01-person-history-tabs.md` · church-admin `CLAUDE.md` 「교인명부」 절 |
```
- [ ] **Step 5: 커밋(푸시 안 함)**
  church-admin(worktree):

```bash
git add privacy.html CLAUDE.md
git commit -m "docs(교인명부): 개인정보 안내 6·7번(자세히 창 사역·성경필사 · 기록 잇기 · 사역신청 번호 180일) · CLAUDE.md 교인명부 절" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

  v2(여러 세션이 함께 쓴다 — `CLAUDE.md` 에 남의 고침이 섞여 있을 수 있다):

```bash
cd /c/Projects/bible-memorize-church-app-v2
S=$(mktemp -d)                                   # 내 헝크만 담을 패치 자리
git diff --cached --stat                          # 먼저 비어 있는지 — 남이 담아 둔 것이 있으면 멈추고 그 세션에 묻는다
git diff CLAUDE.md > "$S/mine.patch"
git diff --stat CLAUDE.md                         # 「1 file changed, 1 insertion(+)」 이면 내 한 줄뿐 — 아래 둘째 줄은 건너뛴다
# 그보다 많으면 "$S/mine.patch" 를 열어 지도 표 한 줄(교인명부 「자세히」 창 …)의 헝크만 남기고 나머지 헝크를 지운다
git apply --cached "$S/mine.patch"
git diff --cached --stat                          # CLAUDE.md 1 insertion 만
git commit -m "docs: 지도 — 교인명부 자세히 창 탭·잇기 표·번호 180일" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git show --stat HEAD                              # CLAUDE.md 한 줄만
```
  (경로 없이 커밋한다 — 경로 커밋은 작업 트리를 다시 담아 남의 헝크가 딸려 간다. v2 는 커밋만 — 푸시는 다른 세션이 해도 이 줄은 해가 없다.)

---

### Task 10: b6 사역 이력 잇기(조건부 — b6 의 SQL 005·`history-match.ts`·`history-db.ts` 가 main 에 들어온 뒤에만)

**Files:**
- Modify: `supabase/functions/church-admin/index.ts`, `tests/server.dev.test.mjs`, (b6 가 안 했으면) `js/menus/system/audit.js`

**Interfaces:**
- Consumes(b6 계획 그대로): `history-match.ts` `historyLinkPatch(personId|null, memberId|null, nowIso)` · `historyUnlinkPatch(nowIso)` · `history-db.ts` `rematchHistoryRows(db, ids: number[]|null) → {changed, linked, total, noDirectory?}` · 표 `ministry_history`(칸 `id,year,committee,team,role_title,name,position,mok,person_id,link_how,deleted_at,…`).
- Produces: `peopleLink` kind `history` — 이름 확인(`nameKey(name)` = 교인 `name_key`) · none·auto 는 지금 이 분께 이어진 줄만 · manual/none → `historyLinkPatch` · auto → `historyUnlinkPatch(now)` 뒤 `rematchHistoryRows(db,[id])` · 기록 `history.link`(target 줄 id · detail `{op, year, by:"directory"}` — op 는 b6 말 `pick`·`none`·`auto` · 이름·교인ID 없음) · `peopleHistory` 가 `person_id` 가 빈 사역 이력 줄도 돌려준다.

- [ ] **Step 1: 들어왔는지 확인한다 — 아니면 Step 2~5 를 건너뛰고 「나중 길」(Step 6~10)로 남긴다**

  건너뛸 때: 진행 기록(`.superpowers/sdd/progress.md`)에 「Task 10 — b6 대기 · 나중 길 Step 6~10 남음」을 적고 Task 11 로 간다. 그동안 운영에서 자세히 창의 사역 탭은 사역신청 줄(모든 해)과 — 사역 이력 표가 열렸으면 — 그분께 이어진 이력 줄을 보이지만, 이력 줄의 「풀기」·「이분 아님」은 `bad-kind`(「🤝 사역 이력 메뉴에서 고쳐 주세요」)로 막히고 「아직 안 이어진 기록」에 이력 줄은 나오지 않는다. **설계 §8(b6 약속)·§10-5 는 나중 길이 끝나야 덮인다** — Task 11 Step 9 가 v2 `CLAUDE.md` 「다음 작업」에 남긴다.
  ⚠️ b6 파일은 **origin/main** 에 있어야 「들어왔다」 — 공유 체크아웃의 로컬 main 에만 있으면(b6 가 합쳐 놓고 아직 안 냄) 이 가지에 실려 Task 11 이 b6 의 미발행 코드를 운영에 싣는다(Task 11 Step 3 의 검사가 거기서 멈춘다). 그때도 건너뛴다.

```bash
cd /c/Projects/church-admin/.worktrees/person-history
git fetch origin
git ls-tree --name-only origin/main supabase/functions/church-admin/ | grep -E "history-(match|db)\.ts"   # 둘 다 나와야 한다(안 나오면 건너뛴다)
git merge main --no-edit
git ls-files supabase/functions/church-admin/history-match.ts supabase/functions/church-admin/history-db.ts
grep -n "export function historyLinkPatch\|export function historyUnlinkPatch" supabase/functions/church-admin/history-match.ts
grep -n "export async function rematchHistoryRows" supabase/functions/church-admin/history-db.ts
supabase --workdir ~/.church-admin/supa-dev db query --linked "select to_regclass('public.ministry_history') as t, (select count(*) from ministry_history) as n"
```
Expected: origin/main 에 파일 둘 · 파일 둘 · 함수 셋의 줄 · `t` 가 `ministry_history`(null 이면 멈춘다).

- [ ] **Step 2: 개발 서버 시험(실패)** — Task 5 시험의 `assert.equal((await link("history", 1, "manual")).body.error, "bad-kind", …);` 줄을 지우고, 파일 끝에:

```js
// ---------- 사역 이력(b6) 잇기 — peopleLink kind history(2026-10-01 · 계획 Task 10) ----------
test("사역 이력 잇기: 탭에 붙는다 · 넘긴 신청은 빠진다 · 이분 것·이분 아님·풀기 · 기록 history.link {op,year,by}", async () => {
  await plOpen();
  const d = people.directory;
  const h = (o) => ({ year: 2024, committee: "시험부", team: "시험팀", role_title: "", name: PL.a, position: "집사", mok: "화평-20",
    person_id: null, link_how: "auto", match_basis: "", source: "excel", order_id: null, src_key: `ca-test-pl-${STAMP}|${o.k}`, ...o.v });
  const rows = await rest("ministry_history", "POST", [
    h({ k: "h1", v: { person_id: PL.ids[0], match_basis: "같은 소속" } }),            // 이어진 줄 → 탭에
    h({ k: "h2", v: { year: 2025, mok: "기쁨-5" } }),                                 // 못 맞춘 줄 → 아직 안 이어진 기록
    h({ k: "h3", v: { year: 2027, source: "app", order_id: PL.orders.o1, person_id: PL.ids[0], src_key: `app|${PL.orders.o1}` } }),   // 넘긴 신청
  ]);
  const [h1, h2, h3] = rows.map((r) => r.id);
  try {
    const p = (await call(d.token, "peoplePerson", { id: PL.ids[0] })).body.history;
    assert.deepEqual(p.ministry.map((x) => [x.kind, x.row]).filter(([k]) => k === "history").map(([, r]) => r).sort((x, y) => x - y), [h1, h3].sort((x, y) => x - y));
    assert.equal(p.ministry.some((x) => x.kind === "order" && x.row === PL.orders.o1), false, "넘긴 신청이 신청 쪽에도 보인다");
    assert.equal(p.ministry.find((x) => x.row === h1).status, "임명확정");
    const un = (await call(d.token, "peopleHistory", { id: PL.ids[0] })).body.rows;
    const u2 = un.find((x) => x.kind === "history" && x.row === h2);
    assert.deepEqual(Object.keys(u2).sort(), ["committee", "how", "kind", "mok", "position", "role_title", "row", "team", "year"]);
    const link = (row, how, person = PL.ids[0]) => call(d.token, "peopleLink", { kind: "history", row, person, how });
    const m = await link(h2, "manual");
    assert.equal(m.body.ok, true, JSON.stringify(m.body));
    let r2 = (await rest(`ministry_history?select=person_id,link_how,match_basis&id=eq.${h2}`, "GET"))[0];
    assert.deepEqual([r2.person_id, r2.link_how, r2.match_basis], [PL.ids[0], "manual", "사람이 이음"]);
    assert.equal((await link(h2, "none")).body.ok, true);
    r2 = (await rest(`ministry_history?select=person_id,link_how&id=eq.${h2}`, "GET"))[0];
    assert.deepEqual([r2.person_id, r2.link_how], [null, "none"]);
    const f = await link(h1, "auto");
    assert.equal(f.body.ok, true, JSON.stringify(f.body));
    assert.equal(typeof f.body.relinked, "boolean");
    assert.equal((await link(h2, "auto")).body.error, "not-linked");
    assert.equal((await link(h1, "manual", PL.ids[2])).body.error, "other-name");
    const logs = (await call(people.super.token, "auditList", { limit: 50 })).body.rows
      .filter((r) => r.action === "history.link" && r.target === String(h2));
    assert.deepEqual(logs.map((r) => r.detail).reverse(), [{ op: "pick", year: 2025, by: "directory" }, { op: "none", year: 2025, by: "directory" }]);
  } finally {
    await rest(`ministry_history?id=in.(${[h1, h2, h3].join(",")})`, "DELETE");
  }
});
```
  Run(옛 함수): `node --experimental-strip-types --test --test-name-pattern="사역 이력 잇기" tests/server.dev.test.mjs` → Expected: FAIL(`bad-kind`)

- [ ] **Step 3: `index.ts`**
  - import 한 줄(people-links 줄들 다음):

```ts
// b6 「사역 이력」 표 잇기(2026-10-01 · b6 설계 §7 약속) — 잇는 모양·다시 맞추기는 b6 모듈 그대로
import { historyLinkPatch, historyUnlinkPatch } from "./history-match.ts";
import { rematchHistoryRows } from "./history-db.ts";
```
  - `peopleLink` 의 `if (p.kind === "history") return { ok: false, error: "bad-kind" };   // …` 줄을 지우고, `if (!person) return { ok: false, error: "not-found" };` **다음** 줄에:

```ts
  if (p.kind === "history") return await historyLinkFor(ctx, p, person);
```
  - `peopleLink` 함수 **다음**에:

```ts
// 사역 이력 줄 하나를 이 분께(설계 §5 · b6 §7) — 이름 확인·이어진 줄만 풀기는 신청·명단과 같다. 쓰는 모양은 b6 의 historyLinkPatch·historyUnlinkPatch,
// 풀기 뒤 그 줄 다시 맞추기는 b6 의 rematchHistoryRows. 기록 history.link 는 b6 사역 이력 메뉴와 같은 모양({op, year, by}) — 이름·교인ID 없음.
async function historyLinkFor(ctx: Ctx, p: { row: number; person: number; how: string }, person: { person_id: number; name_key: string }) {
  const { data: h, error } = await db.from("ministry_history").select("id,year,name,person_id,link_how,deleted_at").eq("id", p.row).maybeSingle();
  if (missingTable(error)) return { ok: false, error: "bad-kind" };
  if (error) throw error;
  if (!h || h.deleted_at) return { ok: false, error: "not-found" };
  if (nameKey(h.name) !== person.name_key) return { ok: false, error: "other-name" };
  if (p.how !== "manual" && Number(h.person_id) !== p.person) return { ok: false, error: "not-linked" };
  const now = new Date().toISOString();
  let relinked = false;
  if (p.how === "auto") {
    const { error: e1 } = await db.from("ministry_history").update(historyUnlinkPatch(now)).eq("id", p.row).is("deleted_at", null);
    if (e1) throw e1;
    await rematchHistoryRows(db, [p.row]);
    const { data: after, error: e2 } = await db.from("ministry_history").select("person_id").eq("id", p.row).maybeSingle();
    if (e2) throw e2;
    relinked = Number(after?.person_id) === p.person;
  } else {
    const patch = historyLinkPatch(p.how === "manual" ? p.person : null, ctx.member?.id ?? null, now);
    const { error: e1 } = await db.from("ministry_history").update(patch).eq("id", p.row).is("deleted_at", null);
    if (e1) throw e1;
  }
  await audit(ctx, "history.link", String(p.row), { op: p.how === "manual" ? "pick" : p.how, year: h.year, by: "directory" });
  return { ok: true, how: p.how, relinked, history: await personHistory(p.person) };
}
```
  - `peopleHistory` 의 `return { ok: true, rows: unlinkedRows({ … history: [] }) };` 를 →

```ts
  // 사역 이력(b6)에서 아무에게도 안 이어진 줄(person_id null — auto 못 맞춤·none) · 표가 없으면 빈 것
  let hist: any[] = [];
  try {
    hist = (await allRows(() => db.from("ministry_history").select("id,year,committee,team,role_title,position,mok,name,link_how")
      .is("deleted_at", null).is("person_id", null).order("id", { ascending: true }))).filter((h) => nameKey(h.name) === key);
  } catch (e) { if (!missingTable(e)) throw e; }
  return { ok: true, rows: unlinkedRows({ orders: mineO, signups: mineS, events, orderLinks, signupLinks, moved, history: hist }) };
```
  - `audit.js` 에 `history.link` 이름·detail 이 **없으면**(b6 가 넣었으면 그대로): `LABEL` 에 `"history.link": "사역 이력 교적 잇기",` · `detailText` 에
    `if (r.action === "history.link") return joinDot(\`${d.year ?? ""}년\`, { pick: "이분으로 이음", none: "이분 아님", auto: "자동으로 되돌림" }[d.op] || d.op, d.by === "directory" ? "교적 창에서" : "");`

- [ ] **Step 4: 점검·개발 배포·개발 시험**

```bash
python tools/preflight.py
supabase functions deploy church-admin --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo
set -a; . ~/.church-admin/dev.env; set +a
node --experimental-strip-types --test tests/server.dev.test.mjs
node --experimental-strip-types tests/seed-person-history-dev.mjs          # 이제 사역 이력도 넣는다
```
Expected: `모두 통과` · `# fail 0` · 시드 끝줄에 `사역 이력 6`. localhost 에서 동명이인 창의 사역 탭에 2024 「교육위원회 · 중등부 · 교사 · 임명」이 붙는지 본다(설계 §10-5).

- [ ] **Step 5: 커밋(푸시 안 함)**

```bash
git add supabase/functions/church-admin/index.ts tests/server.dev.test.mjs js/menus/system/audit.js
git commit -m "feat(교인명부): 사역 이력(b6) 잇기 — peopleLink kind history · 아직 안 이어진 사역 이력" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
  Step 1 에서 b6 가 이미 들어와 있었으면 여기서 끝 — 운영은 Task 11 이 함께 내고, §10-5 확인은 Task 11 Step 10.

**나중 길 — Step 1 에서 건너뛰었을 때만.** Task 11 이 끝난 뒤, b6 가 SQL 005·`history-match.ts`·`history-db.ts` 를 **main(origin) 에 내고 운영 SQL 005 를 돌렸다**(「표가 열렸다」 알림)는 것을 확인한 다음에 한다.

- [ ] **Step 6: 새 가지·worktree**(Task 11 이 `person-history` worktree 를 지웠다)

```bash
cd /c/Projects/church-admin
git status --short                                      # 「?? Data/」(b6) 말고 비어 있어야 한다
git fetch origin
git log --oneline origin/main..main                     # 비어 있어야 한다 — 남이 로컬 main 에만 합쳐 둔 커밋을 가지에 싣지 않게(있으면 멈추고 그 세션에 묻는다)
git pull --ff-only
git worktree add .worktrees/person-history-b6 -b person-history-b6 main
cd .worktrees/person-history-b6
mkdir -p .superpowers/sdd && printf '*\n' > .superpowers/sdd/.gitignore
git status --short                                      # 아무것도 없음
```

- [ ] **Step 7: 이 worktree 에서 Step 1~5 를 차례로 한다** — Step 1 의 첫 줄 `cd /c/Projects/church-admin/.worktrees/person-history` 만 `cd /c/Projects/church-admin/.worktrees/person-history-b6` 으로. Step 1 의 확인이 모두 맞아야(origin/main 에 b6 파일 둘 · 함수 셋 · 개발 표) Step 2 로 간다(`git merge main` 은 이미 최신이라 `Already up to date`). Step 2 가 지우는 `bad-kind` 줄(Task 5 시험)은 Task 11 로 main 에 들어가 있다. Step 4 의 개발 시험·시드까지 `# fail 0` · `사역 이력 6`.

- [ ] **Step 8: 친구 허락 → 운영 함수 → 푸시**

```bash
cd /c/Projects/church-admin
git status --short                                      # 「?? Data/」 말고 비어 있어야 한다
git fetch origin
git log --oneline origin/main..main                     # 비어 있어야 한다(위 Step 6 과 같은 까닭)
git pull --ff-only
git merge --no-ff person-history-b6                     # 충돌이 나면 멈추고 친구와 본다
git log --oneline --no-merges origin/main..HEAD         # Step 7 의 커밋(「사역 이력(b6) 잇기 …」 + 고친 새 커밋)만 — 다른 제목이 보이면 멈춘다
python tools/preflight.py                               # 모두 통과
git status --short supabase/functions                   # 비어 있어야 한다(작업 트리 전체가 배포된다)
supabase functions deploy church-admin --no-verify-jwt --project-ref xnomlgydifiqiybervtf
git push
```
  배포 전에 친구께 「자세히 창에서 사역 이력 줄을 잇고 풀 수 있게 운영 함수를 내도 될까요」를 묻고 허락을 받는다. 합친 main 으로 개발 함수도 다시: `supabase functions deploy church-admin --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo` → `set -a; . ~/.church-admin/dev.env; set +a; node --experimental-strip-types --test tests/server.dev.test.mjs` → `# fail 0`.

- [ ] **Step 9: 운영에서 확인(설계 §10-5 · 친구와)** — admin.onlybible.kr(총괄 또는 교인명부 역할) → 🔎 교인 찾기 → b6 가 올린 지난 해 명단에 있는 분 한 분 → 자세히 → 🤝 사역 탭에 지난 해 줄(「임명」 칩 · 「위원회 · 팀 · 직책」)이 붙고 탭 숫자가 그만큼 늘었는지. 그 줄 「풀기」 → 「정말 풀까요?」 → 예 → 「규칙이 다시 이분께 이었어요」가 뜨면 「그대로 두기」(줄은 auto 그대로 · 탭 숫자 그대로). 📜 바꾼 기록에 `history.link` 한 줄(Step 3 의 이름이면 「사역 이력 교적 잇기 · …년 · 자동으로 되돌림 · 교적 창에서」 — b6 가 이름·글을 먼저 정했으면 그쪽 글). (「다시 이었어요」가 아니라 줄이 빠지면 — 규칙이 다른 분께 이었거나 못 맞춤 — 친구와 그 줄을 「이분 것」으로 다시 이을지 정한다.)

- [ ] **Step 10: 정리** — `git worktree remove .worktrees/person-history-b6` · 원본 체크아웃의 `.superpowers/sdd/progress.md` 에 「Task 10 나중 길 끝 — 운영 함수 · §10-5 확인」 · v2 `CLAUDE.md` 「다음 작업」에서 Task 11 Step 9 가 남긴 「👥 **교인명부 자세히 창 — 사역 이력(b6) 잇기 남음.**」 줄을 지운다(v2 는 여러 세션이 함께 쓴다 — 내 헝크만):

```bash
cd /c/Projects/bible-memorize-church-app-v2
S=$(mktemp -d)
git diff --cached --stat                          # 먼저 비어 있는지
git diff CLAUDE.md > "$S/mine.patch"
git diff --stat CLAUDE.md                         # 「1 deletion(-)」 이면 내 한 줄뿐 — 그보다 많으면 패치에서 그 줄의 헝크만 남긴다
git apply --cached "$S/mine.patch"
git diff --cached --stat                          # CLAUDE.md 1 deletion 만
git commit -m "docs: 다음 작업 — 교인명부 사역 이력(b6) 잇기 끝" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git show --stat HEAD
```

---

### Task 11: 내기 — 친구 허락 → 운영 SQL → 운영 함수 → 화면 푸시 → 같은 날 성경암송 안내 (**친구와 함께**)

**Files:**
- Modify: v2 `privacy/index.html`, v2 `app.js`(+ `python tools/bump.py` 가 고치는 것) · (Task 10 을 건너뛰었으면) v2 `CLAUDE.md` 「다음 작업」 · church-admin `.superpowers/sdd/progress.md`(원본 체크아웃 — 그 폴더의 `.gitignore` 가 막는 진행 기록)

- [ ] **Step 1: 친구 허락** — Task 8 Step 5 확인(판단 2·3·7 포함)이 끝났는지 · 운영에 SQL 006·007 을 넣고 함수·화면을 내도 되는지 묻는다. ⚠️ 운영 함수가 나가는 순간 **결정 때 번호를 안 지운다** — 그 전에 007 예약이 있어야 하고, 성경암송 `privacy/` 문구는 **같은 날** 바꾼다(Step 7).
  - [ ] **개인정보 안내 문구를 친구께 보인다** — 교회 어드민 `privacy.html` 6·7번(Task 9 Step 1·2)은 설계 §7 보다 **넓다**: 이어진 기록뿐 아니라 「이름이 같고 아직 안 이어진 기록(다른 분 것일 수 있다)·「이분 아님」으로 둔 기록」도 해·위원회·팀·직책·상태·그때 소속·직분까지 보인다고 적었다(화면이 실제로 그렇다 — 좁게 적으면 사실이 아닌 안내). 설계 §7 의 「그분의 사역(올해 신청·지난 해 임명)과 성경필사 참여」와 나란히 보여 드리고 이 문구로 내도 되는지 확인받는다.
  - (묻지 않는다 — **친구 결정 2026-10-02 ②**) 성경암송 `privacy/`·`app.js` 에 「교회 관리 화면에서 교적과 이어 교인명부 담당자도 본다」 줄은 **넣지 않는다.** Step 7 은 번호 문구만 고친다.
  - (묻지 않는다 — **친구 결정 2026-10-02 ③ · 예전 뜻**) 성경암송 앱의 번호 확인(`kept`)과 같은 이름·같은 번호 묻기(`dup-phone`)는 **결정 안 된 줄만 본다.** 할 일은 Step 7 「번호 확인」(v2 `api` 개발→운영 배포). 까닭(2026-10-02 가지 마지막 검토 지적 3 — 이 계획이 처음 빠뜨린 자리): v2 `supabase/functions/api/index.ts` 의 `ministryApply`(「휴대폰 번호가 처음 신청하실 때와 다릅니다」)·`ministryCancel`(「휴대폰 번호가 맞지 않습니다」)은 그 해 그 계정의 신청 **전부**(`mine`)에서 번호 하나를 골라(`kept`) 새로 넣은 번호와 맞댄다. 주석은 「결정이 난 건은 4자리를 지워 두므로 남아 있는 것만 본다」인데, **Step 4 의 운영 함수부터 교회 어드민은 결정(임명·취소) 때 번호를 지우지 않는다**(종이 명단의 결정된 줄도). 그대로 두면 결정된 줄의 번호도 최대 180일 이 확인에 들어가, 예컨대 종이 명단으로 임명확정된 분의 신청서에 가족 번호가 적혀 있으면 그분이 앱에서 다른 팀을 신청하거나 취소하며 자기 번호를 넣을 때 막힌다(전에는 결정 때 번호가 지워져 통과하던 길). `dup-phone` 도 결정된 다른 계정의 줄에 걸린다.
- [ ] **Step 2: 운영 SQL**

```bash
P=~/.church-admin/supa-prod
supabase --workdir $P db query --linked "select count(*) as users from users"        # 사백이 넘어야 운영이다
supabase --workdir $P db query --linked -f C:/Projects/church-admin/.worktrees/person-history/supabase/sql/006_people_links.sql
supabase --workdir $P db query --linked -f C:/Projects/church-admin/.worktrees/person-history/supabase/sql/007_ministry_phone_expire.sql
supabase --workdir $P db query --linked "select jobname, schedule, command from cron.job where jobname = 'ministry-phone-expire'"
supabase --workdir $P db query --linked -f C:/Projects/church-admin/.worktrees/person-history/supabase/sql/check-authenticated-exposure.sql
```
Expected: users 사백 넘음 · 006 `RLS true`·나머지 `false` · 007 `false`·`false`·`postgres`·`pg_cron 있음 1` · cron 한 줄 `17 18 * * *` · `select public.ministry_phone_expire()` · 노출 점검 **0행**.
(007 의 `cron.schedule` 이 CLI 역할 권한으로 막히면(`permission denied for schema cron`) **007 파일 전체**를 친구가 Supabase 대시보드 SQL Editor 에 붙여 넣어 다시 돌린다 — 성경암송 daily-push 예약도 그렇게 만들었다. ⚠️ **그 한 줄만 돌리지 말 것** — 007 은 `begin … commit` 한 덩어리라 `do` 블록의 `cron.schedule` 이 실패하면 **함수 `ministry_phone_expire()` 도 함께 되돌려져 없다.** 한 줄만 돌리면 없는 함수를 부르는 예약이 생겨 매일 실패한다(Step 8 이 다음 날에야 잡는다). 다시 돌린 뒤 위 `cron.job` 확인과 `select proname from pg_proc where proname = 'ministry_phone_expire'`(한 줄)를 함께 본다.)
공개 키 확인: `set -a; . ~/.church-admin/prod.env; set +a` 로는 공개 키가 없으니 — 운영 공개 키(앱 `js/config.js` 의 운영 anon)로 Task 1 Step 8 의 curl 셋을 운영 주소에 → 셋 다 `200`·`204` 가 아니다.
- [ ] **Step 3: main 에 합치기** — 원본 체크아웃에서:

```bash
cd /c/Projects/church-admin
git status --short                      # 「?? Data/」(b6) 말고 비어 있어야 한다
git fetch origin
git log --oneline origin/main..main     # ⚠️ 비어 있어야 한다 — 다른 세션(b6·e5)이 로컬 main 에 합쳐 놓고 아직 안 내보낸 커밋이 있으면
                                        #    아래 운영 함수(Step 4)·푸시(Step 5)가 그것까지 운영에 싣는다(예: 운영 SQL 005 전의 b6 사역 이력 메뉴).
                                        #    보이면 멈추고 친구·그 세션에 확인한다
git pull --ff-only                      # 다른 세션이 main 을 올렸을 수 있다
git merge --no-ff person-history        # 충돌이 나면 멈추고 친구와 본다 — 겹치기 쉬운 자리: authz.test.mjs 의 역할별 목록·index.ts import 묶음(b6) ·
                                        #   index.ts evRowSave(e5 가지 autumn-excuse 의 메모 지키기 guardMemo 와 이 가지의 교적 후보·끝의 linkSignups) · switch 끝 case 줄
git log --oneline --no-merges origin/main..HEAD
                                        # ⚠️ 이 가지의 커밋만 보여야 한다 — Task 1~10 의 커밋(이 계획 커밋 명령의 제목들 + 단계에서 고친 새 커밋).
                                        #    다른 제목이 보이면(가지에 `git merge main` 으로 들어온 남의 미발행 커밋) 멈추고 친구·그 세션에 확인한다
python tools/preflight.py               # 모두 통과
git status --short supabase/functions   # 비어 있어야 한다(작업 트리 전체가 배포된다)
```
- [ ] **Step 4: 운영 함수** — `supabase functions deploy church-admin --no-verify-jwt --project-ref xnomlgydifiqiybervtf`
  - 개발 시험을 한 번 더(합친 main 으로 개발 함수도 다시 · `node --experimental-strip-types --test tests/server.dev.test.mjs` → `# fail 0`).
- [ ] **Step 5: 화면 푸시** — `git push`(main). Actions 가 끝나면 **이번 판에만 있는 글자**로:
  `curl -s "https://admin.onlybible.kr/js/menus/people/person-tabs.js?nocache=$(date +%s)" | grep -c bindPersonTabs` → 1 이상
  `curl -s "https://admin.onlybible.kr/privacy.html?nocache=$(date +%s)" | grep -c "180일"` → 1 이상
- [ ] **Step 6: 운영에서 「기록 잇기 맞추기」** — 친구(총괄)가 admin.onlybible.kr → 📊 교인 현황 → 「🔗 기록 잇기 맞추기」 → 결과 「새로 이음 N · 바뀜 K · 못 맞춤 M (사역신청 …줄 · 성경필사 …줄)」를 친구께 그대로 보고. 친구 폰으로 교인 한 분 자세히 → 탭 숫자 · 사역신청 역할만인 분은 예전 작은 창 그대로인지.
- [ ] **Step 7: 같은 날 — 성경암송 번호 문구 + bump·푸시**(v2 · 여러 세션이 함께 쓴다)
  - `privacy/index.html`:
    - 1항 표: `<b>임명이 정해지면 바로 지웁니다</b></td>` → `<b>임명·취소가 정해진 뒤 담당자가 지울 수 있고, 늦어도 180일이 지나면 저절로 지웁니다</b></td>`(단추는 담당자가 고를 일이라 「지우며」가 아니다 — 교회 어드민 `privacy.html` 6번과 같은 뜻)
    - 3항(얼마나 보관하나) — 지금(2026-10-02) 3항 문단은 `성경필사 노트 신청의 휴대폰 번호는 …` → `(담당자가 「배부완료」로 표시하는 그 순간, 사람이 따로 지우지 않아도 사라집니다).` → `사역 이력 정정 신청은 처리가 끝난 뒤에도 … 지웁니다.` → `</p>` 차례다.
      새 줄은 **「배부완료」 줄 바로 다음, 「사역 이력 정정 신청은 …」 줄 앞**에 넣는다(번호 이야기끼리 붙여 둔다 · `</p>` 바로 앞이 아니다):
      `  사역 신청의 휴대폰 번호는 임명·취소가 정해진 뒤 담당자가 지울 수 있고, 그러지 않았어도 <b>늦어도 결정 뒤 180일</b>이 지나면 저절로 지워집니다.`
      (그사이 3항에 줄이 더 들어왔으면 같은 원칙 — 「배부완료」 줄 바로 다음. 넣은 뒤 `sed -n '/<h2>3\./,/<\/p>/p' privacy/index.html` 로 차례를 눈으로 본다.)
    - 4항(누가 볼 수 있나) — 이번 배포로 **더 틀리게 되는 줄**(사역 신청 번호는 사역 담당자·총괄 관리자가 보고, 결정 뒤 최대 180일까지 남는다):
      `<li><b>휴대폰 번호</b>는 필사 노트를 준비하는 담당자만 봅니다.</li>` →
      `<li><b>휴대폰 번호</b>는 필사 노트를 준비하는 담당자와 사역 신청을 맡은 담당자·총괄 관리자만 봅니다(사역 신청 번호는 임명·취소가 정해진 뒤 지울 수 있고, 늦어도 180일이 지나면 저절로 지웁니다).</li>`
      (총괄 관리자 — 교회 어드민 `ministryList` 는 역할 `ministry` 와 `super` 가 부른다. 바로 아래 정정 신청 줄의 「사역신청 담당자·총괄 관리자」와 같은 표기.)
    - 「교인명부 담당자도 교적과 이어 본다」 줄은 **넣지 않는다**(친구 결정 2026-10-02 ② — `privacy/`·`app.js` 어느 쪽에도).
    - `마지막 수정: 2026년 10월 1일`(지금 값 — 그사이 바뀌었으면 그 값) → 오늘 날짜(`date +"%Y년 %-m월 %-d일"`).
  - `app.js` 세 곳(개인정보 화면 · 도움말 · 사역 신청서 안내 — 성경암송 `CLAUDE.md` 「개인정보」: 두 곳을 함께):
    `(임명이 정해지면 삭제)` → `(임명·취소 뒤 지울 수 있음 · 늦어도 180일)`
    `번호는 임명이 정해지면 지웁니다` → `번호는 임명·취소가 정해진 뒤 담당자가 지울 수 있고, 늦어도 180일이 지나면 저절로 지웁니다`
    `'번호는 임명이 정해지면 <b>바로 지웁니다</b>.</div>' +` → `'번호는 임명·취소가 정해진 뒤 지울 수 있고, <b>늦어도 180일</b>이 지나면 저절로 지웁니다.</div>' +`
    확인: `grep -rn "임명이 정해지면" app.js privacy/index.html` → 아무것도 없음 · `grep -c "필사 노트를 준비하는 담당자만 봅니다" privacy/index.html` → 0.
  - bump·커밋·푸시 — 내 것만 담는다(경로 없이 커밋 · 여러 세션이 함께 쓰는 저장소):

```bash
cd /c/Projects/bible-memorize-church-app-v2
python tools/bump.py
git status --short
git diff --cached --stat                          # 먼저 비어 있는지 — 남이 담아 둔 것이 있으면 멈추고 그 세션에 묻는다
S=$(mktemp -d)                                   # 내 헝크만 담을 패치 자리
git diff privacy/index.html app.js index.html admin.html > "$S/mine.patch"
# "$S/mine.patch" 를 열어 남의 헝크(이번 문구·bump 가 아닌 것)가 있으면 그 헝크를 지운다 — bump 는 index.html(?v= 태그·스플래시 판 번호)·app.js(APP_BUILD)·admin.html(admin-stats 태그)
git apply --cached "$S/mine.patch"
git diff --cached --stat                          # privacy/index.html · app.js · index.html · admin.html 만
git commit -m "fix(개인정보): 사역 신청 번호 — 임명·취소 뒤 담당자가 지울 수 있고 늦어도 180일 · 누가 보나 고침(교회 어드민 2026-10-01)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git show --stat HEAD
git push
```
  (`bump.py` 가 고친 파일이 위 넷 밖에도 보이면(`git status --short`) 그 파일도 `git diff` 목록에 더한다.)
  - 배포 확인(v2 `CLAUDE.md` 「배포 확인」): 라이브 `app.js` 의 `APP_BUILD` 가 `index.html` 의 `?v=` 와 같은지 + `curl -s "https://gocheok.onlybible.kr/privacy/?nocache=$(date +%s)" | grep -c "늦어도 180일"` → 1 이상.
  - **번호 확인(`kept`)·`dup-phone` — 결정 안 된 줄만 본다**(친구 결정 2026-10-02 ③ · 예전 뜻 · v2 `supabase/functions/api/index.ts` · 위 bump 커밋과 **따로** 커밋 · 내 헝크만):
    - `const isLocked = (st: string) => MINISTRY_LOCKED.indexOf(st) >= 0;` 다음 줄에
      `const MINISTRY_DECIDED = ["임명확정", "미채택", "취소"];   // 결정 — 번호 확인(kept)·같은 이름·번호 묻기(dup-phone)는 이 줄들을 보지 않는다(교회 어드민은 결정 뒤에도 번호를 남긴다 · 2026-10)`
    - `ministryApply` 의 `const kept = mine.map((r) => norm(r.phone)).filter(Boolean)[0];` →
      `const kept = mine.filter((r) => MINISTRY_DECIDED.indexOf(r.status) < 0).map((r) => norm(r.phone)).filter(Boolean)[0];`
      바로 위 주석 `//    결정이 난 건은 4자리를 지워 두므로(아래 setStatus) 남아 있는 것만 본다.` →
      `//    결정(임명확정·미채택·취소)이 난 건은 보지 않는다 — 옛 관리 화면은 결정 때 번호를 지우고, 교회 어드민(2026-10~)은 남겼다가`
      `//    담당자 단추·결정 뒤 180일 작업이 지운다. 결정된 줄의 번호(종이 명단의 가족 번호 등)로 막지 않게.`
    - `ministryCancel` 의 `const kept = mine.map((r) => norm(r.phone)).filter(Boolean)[0];` 도 같은 꼴로(두 곳 다 `status` 를 이미 읽는다 — `ministryApply` 는 `.select("id,team_id,status,phone")`, `ministryCancel` 은 `.select("id,status,phone,team,team_id")`).
    - `dup-phone` 질의(`.select("id").eq("year", cfg.year).eq("phone", phone).eq("name", name).neq("user_id", userId).limit(1)`)의 `.limit(1)` 앞에
      `.not("status", "in", '("임명확정","미채택","취소")')` 를 더한다(예전처럼 결정된 줄은 번호가 비어 있던 것과 같은 결과 · 위 주석 묶음 끝에 「결정된 줄은 보지 않는다(MINISTRY_DECIDED · 2026-10)」 한 줄).
    - 배포 — **개발 먼저**, 그다음 운영. ⚠️ `index.ts` 는 파일 통째로 나간다 — 배포 전 `git status --short supabase/functions` 가 비어 있는지(남의 안 커밋한 코드가 실려 나간다) · `git log origin/main..HEAD -- supabase/functions/api` 에 남의 미발행 커밋이 없는지:
      `supabase functions deploy api --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo` → 개발에서 신청·취소 한 번(결정된 줄에 다른 번호를 둔 계정으로도 한 번 — 막히지 않아야) → `supabase functions deploy api --no-verify-jwt --project-ref xnomlgydifiqiybervtf`.
      **Step 4(교회 어드민 운영 함수)보다 먼저 해도 된다** — 그 전엔 결정된 줄의 번호가 이미 비어 있어 바뀌는 것이 없다. 늦으면 Step 4 ~ 이 배포 사이에 결정된 줄이 막는다.
    - 같은 커밋에 v2 `docs/notes/ministry-2027.md` 의 `결정 상태로 넣으면 한 건씩 바꿀 때와 같이 **번호를 지우고** \`decided_at\` 을 찍는다.` →
      `결정 상태로 넣으면 \`decided_at\` 을 찍는다(번호는 교회 어드민(2026-10~)이 남겼다가 담당자 단추·결정 뒤 180일 작업이 지운다 · 성도 앱의 번호 확인은 결정된 줄을 보지 않는다).` (옛 화면 이야기라 그 줄만 사실대로.)
    - 커밋: `git diff --cached --stat` 이 먼저 비어 있는지 → `git diff supabase/functions/api/index.ts docs/notes/ministry-2027.md > "$S/kept.patch"` → 남의 헝크를 지우고 `git apply --cached` → `git commit -m "fix(사역신청): 번호 확인·같은 번호 묻기 — 결정된 신청은 보지 않는다(교회 어드민이 결정 뒤에도 번호를 남김)" -m "Co-Authored-By: …"` · `git show --stat HEAD`.
- [ ] **Step 8: 다음 날 — 예약이 돌았는지**

```bash
supabase --workdir ~/.church-admin/supa-prod db query --linked "select status, return_message, start_time from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'ministry-phone-expire') order by start_time desc limit 3"
```
Expected: `succeeded` 한 줄 이상(03:17 KST 무렵). 안 돌았으면 친구께 알리고 cron 을 다시 본다(설계 §11).
- [ ] **Step 9: 정리·기록** — 합친 뒤 `git worktree remove .worktrees/person-history`(진행 기록은 원본 체크아웃의 `.superpowers/sdd/progress.md` 에 옮겨 붙인다: 운영에 올린 것 · 「기록 잇기 맞추기」 수 · cron 확인 · Task 10 을 했는지/건너뛰었는지). b6 세션에 「잇기 표가 운영에 열렸다 — 이력으로 넘기기(b6 §8)는 `people_links` kind `order` 를 읽으면 된다」 알림(SendMessage 가 있으면). Task 4 Step 10 의 e5 알림을 못 보냈으면 여기서 보낸다.
  - **Task 10 을 건너뛰었으면** — 남은 일을 두 곳에 남긴다(worktree 를 지우면 이 계획을 다시 열 사람만 안다):
    - `.superpowers/sdd/progress.md` 에 「Task 10 나중 길(Step 6~10) 남음 — b6 가 SQL 005·history-match.ts·history-db.ts 를 origin/main 에 내고 운영 SQL 005 를 돌린 뒤 · 그동안 사역 이력 줄 잇기는 bad-kind」.
    - v2 `CLAUDE.md` 「다음 작업」 맨 위 교인명부 줄(「👥 **교인명부 — 2026-09-29 운영 개시**」로 시작하는 항목) 다음에 한 줄:

```markdown
- [ ] 👥 **교인명부 자세히 창 — 사역 이력(b6) 잇기 남음.** b6 가 SQL 005·`history-match.ts`·`history-db.ts` 를 main·운영에 낸(「표가 열렸다」) 뒤 계획 `docs/superpowers/plans/2026-10-01-person-history-tabs.md` Task 10 「나중 길」 Step 6~10(새 가지 → 개발 시험 → 친구 허락 → 운영 함수·푸시 → 운영에서 지난 해 줄·「풀기」 확인). 그동안 자세히 창의 사역 이력 줄 「이분 것」·「풀기」는 「🤝 사역 이력 메뉴에서 고쳐 주세요」로 막힌다.
```

```bash
cd /c/Projects/bible-memorize-church-app-v2
S=$(mktemp -d)                                   # 내 헝크만 담을 패치 자리
git diff --cached --stat                          # 먼저 비어 있는지 — 남이 담아 둔 것이 있으면 멈추고 그 세션에 묻는다
git diff CLAUDE.md > "$S/mine.patch"
git diff --stat CLAUDE.md                         # 「1 insertion(+)」 이면 내 한 줄뿐
# 그보다 많으면 "$S/mine.patch" 를 열어 위 한 줄의 헝크만 남기고 나머지 헝크를 지운다
git apply --cached "$S/mine.patch"
git diff --cached --stat                          # CLAUDE.md 1 insertion 만
git commit -m "docs: 다음 작업 — 교인명부 사역 이력(b6) 잇기 남음" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git show --stat HEAD                              # CLAUDE.md 한 줄만 · 푸시는 다음 v2 푸시에 실려도 된다(문서뿐)
```

- [ ] **Step 10: 사역 탭에 지난 해가 붙는지(설계 §10-5) — Task 10 을 했을 때만**(건너뛰었으면 Task 10 Step 9 가 한다). b6 「표가 열렸다」(운영 SQL 005 + b6 가 지난 해 명단을 올림)가 이미 왔으면 Step 6 과 같은 날, 아니면 그 알림을 받은 날 친구와: admin.onlybible.kr → 🔎 교인 찾기 → b6 가 올린 지난 해 명단에 있는 분 한 분 → 자세히 → 🤝 사역 탭에 지난 해 줄(「임명」 칩 · 「위원회 · 팀 · 직책」)이 붙고 탭 숫자가 그만큼 늘었는지 · 그 줄 「풀기」 → 「정말 풀까요?」 → 예 → 「규칙이 다시 이분께 이었어요」가 뜨면 「그대로 두기」(줄은 auto 그대로) · 📜 바꾼 기록에 `history.link` 한 줄. 결과를 진행 기록에 적는다.

---

## 자체 점검

**설계 → 과제**

| 설계 절 | 과제 |
|---|---|
| §0 결정표(교인ID로 잇기·null · 잇기 표 · b6 표 읽기 · 번호 단추+180일 · directory 가 둘 다 · 오른쪽 칸 탭 · 「이분 것」 · 맞음/번호만) | T1·T2·T3·T5·T6·T7 |
| §2.1 SQL 006(칸·PK·색인·RLS·revoke · 노출 0행) | T1(개발) · T11 Step 2(운영) |
| §2.2 사역 이력 읽기(칸 · 정렬 · order_id 빼기 · 42P01) | T2(`historyTabs`·`movedOrderIds`·`missingTable`) · T5(`historyRowsOf`·`movedOrders`) · T10 |
| §3 자동 잇기(사역 줄·성경필사 줄 · 「한 분뿐」 안 잇기 · `autoLink` 하나) | T2 |
| §3.1-1 「기록 잇기 맞추기」(총괄 · 수 · `people.linksync` · CLAUDE.md 순서) | T4 · T7 · T9 |
| §3.1-2 그때그때 잇기(여섯 자리 · 사람이 정한 줄 읽기만 · 옛 명부 auto) | T4 |
| §3.1-3 번호로 이은 줄은 번호를 지워도 남음 | T2(`phoneLinkKept` — 번호가 지워진 「번호」 줄은 새 명부·「기록 잇기 맞추기」에도 다시 맞추지 않는다 · 순수 시험) · T4 Step 3(개발 시험 — o2 번호를 지운 뒤 apply·신청 현황 열기에도 62 그대로) · T3(지우기는 ministry_orders 만) · T9 안내·CLAUDE.md ⚠️ |
| §4 탭(자리·숫자·처음 교적·PC 무스크롤·폰 · 사역 줄·칩·(선택) · 성경필사 statLabel·초안 빼기 · 아직 안 이어진 기록 · 풀기 인라인·이분 아님 · 가족 넘어가도 탭 · data-v/data-fam 금지 · pd-few/pd-empty) | T6(+ T2 칸 지도) |
| §5 액션 넷 + peoplePerson(역할 · 기록 · 이름 확인 · manual 은 명부에 있는 분 · 응답 키) | T3·T4·T5·T10 |
| §6 번호 보관(statusPatch·ministryPaper · phoneCleared false · 단추 · 007) | T1·T3·T7 |
| §7 개인정보 안내 두 곳(같은 날) | T9(교회 어드민 — 화면이 실제로 보이는 만큼 · 설계 §7 보다 넓어 T11 Step 1 에서 친구 확인) · T11 Step 7(성경암송 — 1항 표·3항 보관·4항 누가 보나) |
| §8 b6·e5 약속 | T10(b6 · b6 가 아직이면 T10 나중 길 Step 6~10 — 새 가지·친구 허락·운영 함수·푸시·운영 확인 · T11 Step 9 가 v2 「다음 작업」에 남긴다) · T4(e5 자리 — `linkSignups`) · T4 Step 10(e5 알림 — 이미 넣었으니 따로 넣지 말 것) · T11 Step 9(b6 알림) |
| §9 시험(순수·개발 서버·SQL 007·화면) | T2·T3·T4·T5·T6(하네스)·T1 Step 7·T8 |
| §10 여는 순서 | T1(worktree)·T11 · §10-5(지난 해가 붙는지)는 T11 Step 10 · (건너뛰었으면) T10 Step 9 |
| §11 함정(cron 확인 · FK 없음 · cascade · 세 입구) | T11 Step 8 · T2(없어진 줄 건너뜀) · T8 Step 5(세 입구) |

**자리표시 검색:** 이 문서에 「TBD」·「TODO」·「나중에 채움」·「Task N 과 같이」 없음. 날짜 한 곳(T11 Step 7 `마지막 수정`)은 배포하는 날의 날짜를 `date` 로 넣는 지시다. 패치 자리는 `S=$(mktemp -d)` · 커밋 꼬리말은 모든 커밋 명령에 `-m "Co-Authored-By: …"` 로 적었다. T10 Step 7 은 같은 Task 의 Step 1~5(코드는 거기 그대로)를 다른 worktree 에서 다시 하라는 차례 지시다. T4 Step 10 의 `<해시>` 는 바로 위 `git rev-parse --short HEAD` 출력을 넣는 자리다.

**시험 자료 점검:** 시험·시드가 넣는 신청 줄의 `user_id` 는 모두 진짜 `users` 줄의 uuid(T4 `plFixtures` · T8 시드) · 007 시험 줄은 그 해가 아닌 2000년에 이름·소속을 채워(T1 Step 7) — 신청 현황의 `push_subscriptions`·`users`(uuid) 물음이 22P02 로 500 이 되지 않는다.

**이름 일관성:** `people_links`·`people_links_auto`·`ministry_phone_expire`·`ministry-phone-expire` · `autoLink`·`needsAuto`·`phoneLinkKept`·`orderAutoRecs`·`signupAutoRecs`·`syncCounts`·`historyTabs`·`unlinkedRows`·`parseLink`·`linkPatch`·`unlinkRec`·`missingTable`·`movedOrderIds` · `peopleImport`·`churchLookupLinked`·`linksOf`·`writeAutoLinks`·`fillOrderNames`·`linkOrders`·`linkSignups`·`linkSignupsByName`·`personHistory`·`historyRowsOf`·`movedOrders`·`rowsByIds`·`historyLinkFor` · 액션 `peopleHistory`·`peopleLink`·`peopleLinkSync`·`ministryPhoneClear` · 화면 `tabsHtml`·`histPanelHtml`·`unlinkedHtml`·`bindPersonTabs`·`detailTab`·`phoneClearCount`·`linkSyncText` — 정의한 과제와 쓰는 과제의 이름·인자가 같다.

## 계획에서 판단한 곳(설계와 다르거나 설계가 말하지 않은 것)

1. **SQL 006 에 자동 쓰기 함수 `people_links_auto(jsonb)` 를 더했다** — 「manual·none 은 자동이 절대 덮지 않는다」를 읽고-쓰기 사이 경합에서도 지키려고(on conflict 의 `where link_how='auto'`). 표 칸은 설계 그대로.
2. **다시 맞추는 조건은 「명부가 다르면」(`import_id !== 지금`)** — 설계의 「옛것이면」보다 넓다. 개발 시험이 지우는 시험 명부(id 가 더 큼)로 맞춘 줄이 영영 안 다시 맞춰지는 일을 막는다.
3. **「이분 아님」(none) 줄을 「아직 안 이어진 기록」 아래 따로 묶어 보인다** — 설계는 「여기 나오지 않는다(다른 분 창에서는 이을 수 있다)」인데, 표가 「누가 이분 아님이라 했는지」를 모르니(person_id null) 다른 동명이인 창에서 이을 길이 그것뿐이다. 칸은 늘리지 않았다. 그래서 「이분 아님」을 누른 **그분 창에도** 그 묶음이 보인다 — 승인된 설계와 다르므로 **T8 Step 5 에서 친구께 보이고 확인받는다**(반대하면 그 단계의 ①~④ 로 뺀다 · 개인정보 안내 6·7번의 「「이분 아님」으로 둔 기록」도 함께 지운다).
4. **`peopleLinkSync` 는 `apply:true` 일 때만 쓴다 · `ministryPhoneClear` 는 화면이 본 수(`count`)가 맞을 때만 지운다** — 시험 PROBE 가 「통과하면 아무것도 안 바뀌는 입력」이어야 해서(개발 DB 공용), 그리고 담당자가 본 것보다 많이 지우지 않게.
5. **`peopleLink` 는 그 분의 탭 자료(`history`)를 다시 돌려준다**(+ `relinked`) — 창을 다시 열면 `people.view` 가 한 줄 더 생겨서. none·auto 는 그 줄이 지금 이분께 이어져 있을 때만(`not-linked`).
6. **표 없음은 42P01 과 PGRST205 둘 다** — 지금 PostgREST 는 없는 표에 PGRST205 를 준다.
7. **사역 이력 `history.link` 기록은 b6 메뉴와 같은 `{op, year, by:"directory"}`**(설계는 `{id, by}`) — b6 의 기록 화면(`HIST_OP`)이 op·year 로 읽어서. 이름·교인ID 는 없다. b6 의 `historyUnlinkPatch` 는 `nowIso` 를 받는다(b6 계획대로). 판단 2 와 함께 **T8 Step 5 에서 친구 확인.**
8. **가족으로 넘어갈 때의 탭은 지금은 늘 「교적」이다** — 가족 칩이 교적 칸 안에 있어서. 탭을 넘기는 길(`opts.tab`·`detailTab`)은 설계대로 두었다.
9. 성경필사 **초안 회차는 그때그때 잇기도 하지 않는다**(기록 잇기 맞추기와 같게) · `evRowSave` 는 소속을 고쳤을 수 있어 auto 줄을 다시 맞춘다 · 명단 올리기 넣기는 교적 후보를 따로 한 번 묻는다(그 자리엔 교적 표시 계산이 없다).
10. 이력으로 넘긴 신청을 빼는 것은 **빼지 않은 이력 줄**이 가리킬 때만(빼면 그 신청이 원래 상태로 다시 보인다 — 두 번 보이지 않는다는 목적엔 맞다).
11. PC 무스크롤을 지키려고 탭이 있는 창은 **사진 높이 상한 식을 `100cqh - 466px`** 로(탭 줄 높이만큼) — 하네스로 재어 넘치면 이 값부터 조정.
12. 성경암송 `privacy/`·`app.js` 문구는 **Task 11(배포 날)** 에 고친다 — v2 는 다른 세션의 푸시가 곧 배포라, 먼저 커밋하면 약속이 코드보다 앞서 나간다. 같은 커밋에서 4항 「휴대폰 번호는 필사 노트 담당자만 봅니다」(원래부터 틀렸고 이번 배포로 더 틀려진다)와 3항 보관 기간도 고친다 · 「교인명부 담당자도 교적과 이어 본다」 한 줄은 **넣지 않는다**(친구 결정 2026-10-02 ②).
13. **번호로 이은 줄은 그 신청의 번호가 지워진 뒤 다시 맞추지 않는다**(`phoneLinkKept`) — 설계 §3.1-3 을 지키려고. 다시 맞추면 번호 없이 판정해 null 로 덮인다(새 명부가 오면 그때그때 잇기가, 총괄이 누르면 「기록 잇기 맞추기」가). 번호가 남아 있으면 평소처럼 다시 맞추고, 사람이 「풀기」하면 번호 없이 다시 맞춘다. 그분이 새 명부에서 빠져도 줄은 남는다(§11 「끊김」과 같다).
14. **교회 어드민 개인정보 안내 6·7번은 설계 §7 보다 넓게 적었다** — 화면이 이어진 기록 말고도 「이름이 같고 아직 안 이어진 기록(다른 분 것일 수 있다)」·「이분 아님」 기록·종이 명단 줄을 해·위원회·팀·직책·상태·그때 소속·직분까지 보여서(좁게 적으면 사실이 아닌 안내). T11 Step 1 에서 친구 확인.
15. **(2026-10-02 가지 마지막 검토) `peopleLink` 의 이름 확인은 「이분 것」(manual)만** — 설계 §5 끝 「대상 줄의 이름이 이 교인 이름(`nameKey`)과 같은지 서버가 다시 본다」보다 좁다. 「이분 아님」·「풀기」는 「지금 이 분께 이어진 줄인가」(`not-linked`)가 이미 주인 확인이라 이름을 보지 않는다 — 이름까지 걸면 b6 규칙이 정확한 이름이 아닌 줄(동명이인 끝 영문자 「홍길동」→「홍길동A」 · 괄호 · 「이름 한 글자 다름(오타로 봄)」)을 이었을 때, 또 신청·명단이 새 명부에서 그분 이름 열쇠가 바뀌었을 때 창의 「풀기」가 늘 막혔다. 사역 이력의 「이분 것」과 「아직 안 이어진 기록」 거르기는 b6 후보 창과 같은 열쇠(`nameKeyVariants` — 끝 영문자·괄호)로 본다(`people-links.ts` `linkNameOk`·`historyNameMatches`). 신청·명단은 그대로 `nameKey`.
16. **(2026-10-02 가지 마지막 검토) 성경암송 앱 번호 확인(`kept`)** — 이 계획이 처음 빠뜨린 자리. 교회 어드민이 결정 때 번호를 안 지우면서 성도 앱의 「처음 넣은 번호와 같아야」 확인이 결정된 줄까지 본다. **친구 결정 2026-10-02 ③ — (1) 예전 뜻**: `kept` 와 같은 이름·같은 번호 묻기(`dup-phone`) 모두 결정 안 된 줄만 본다. T11 Step 7 「번호 확인」에서 한다(v2 `api` 개발→운영 · Step 4 보다 먼저 해도 된다).
17. **(2026-10-02 가지 마지막 검토 작은 지적) 180일 자동 지우기(SQL 007)도 상태를 본다** — `status in ('임명확정','미채택','취소') and decided_at < now() - 180일`. 결정에서 접수·신청으로 되돌려도 `decided_at` 은 남아(`statusPatch` 가 지우지 않는다) 다시 심사 중인 신청의 번호가 첫 결정 180일 뒤에 지워지던 길을 막는다. 단추(`ministryPhoneClear` · `DECIDED`)와 같은 셈 · `tests/ministry.test.mjs` 가 SQL 을 읽어 `DECIDED` 와 맞댄다 · 개발 DB 에 다시 돌렸다(함수만 — 개발엔 pg_cron 이 없다). 운영은 T11 Step 2 가 worktree 의 007 을 그대로 돌린다.
18. **(같은 때) 탭 자료 읽기가 실패해도 「자세히」 창·잇기 쓰기는 그대로** — `personHistory` 를 `personHistorySafe`(`people-links.ts` `historyOrNull`)로 감싸 실패면 `history` 칸째 뺀다(`withHistory`). 창은 예전 모양(탭 없이 · 설계 「옛 서버면 예전 창 그대로」와 같은 길), 잇기는 성공 알림에 「창을 닫고 다시 열면 바뀐 기록이 보여요」(`person-history.js` `linkDoneText`). 예: 함수가 SQL 006 보다 먼저 나가 `people_links` 가 없을 때(PGRST205).
