# 교회 어드민 — 사역 이력(지난 해 사역 임명 · 교인ID) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 지난 해 사역 임명 명단(엑셀)을 교회 어드민 새 표 `ministry_history` 에 올리고, 줄마다 교인명부 교인ID 를 서버가 맞춰 붙이며(못 맞추면 비고에 사유), 「📜 사역 이력」 메뉴에서 고치고·더하고·빼게 한다.

**Architecture:** 맞춤 규칙은 순수 모듈 `history-match.ts`(서버·시험·이 PC 대조 도구·씨앗이 같은 파일), 표 읽기·쓰기는 `history-db.ts` 의 `makeHistory({db, audit})`(npm import 없음 — 교인명부 세션이 import 한다). `index.ts` 는 import 한 줄 · `historyApi` 한 줄 · `switch` 열 줄만 더한다. 화면은 `js/menus/ministry/history.js` + 순수 `history-logic.js`.

**Tech Stack:** Supabase(Postgres · PostgREST · Edge Function Deno) · 브라우저 ES 모듈(빌드 없음) · SheetJS(`js/core/xlsx.js loadXlsx`) · Node 22 `--experimental-strip-types` 시험 · Python 3(openpyxl — 이 PC 대조 도구만).

설계: `docs/superpowers/specs/2026-10-01-church-admin-ministry-history-design.md`(이 저장소). 코드는 **교회 어드민 저장소**(`c:\Projects\church-admin`)의 작업 가지 `ministry-history`(worktree `C:\Projects\church-admin\.worktrees\ministry-history`)에서.

## Global Constraints

- 진짜 명단·명부는 저장소에 절대 넣지 않는다. 대화·커밋·시험·기록에 이름·교인ID·전화를 적지 않는다(수와 줄 번호만). 시험 자료는 `ca-test-hi-…`, 씨앗은 `ca-demo-…`.
- 개발 DB(`ktpwthwqzgcqcrmsafdo`) 먼저, 운영(`xnomlgydifiqiybervtf`)은 **친구 허락을 받은 뒤**. CLI 는 저장소 밖 작업 폴더로만(`~/.church-admin/supa-dev`·`supa-prod`) · `-f` 는 절대 경로.
- 새 표는 그 자리에서 RLS 켜고 `anon`·`authenticated` 둘 다 revoke. 운영 적용 뒤 `check-authenticated-exposure.sql` 0행.
- 새 액션 = `authz.ts` ACTION_ROLES + `index.ts` switch case + `tests/server.dev.test.mjs` PROBE 셋 모두. 역할은 새로 만들지 않는다(`ministry`·`directory`·`super`).
- `person_id` 는 `directory`·`super` 응답에만. 사역신청 역할의 「이분」은 후보 차례 번호 + 지문 `fp`(화면 글자로 만든 FNV — 교인ID 로 만들지 않는다).
- `link_how` `manual`·`none` 줄은 자동 맞춤이 덮지 않는다. 다시 맞추기는 모든 해를 함께 계산한다.
- 화면: 팝업 금지(`dialog`·`toast`·`openForm`·`picker.js` 만 · `<select>`·`type=date` 금지) · 엑셀은 `loadXlsx` 한 곳 · 파일 고르기에는 끌어다 놓기·붙여넣기를 함께.
- 성경암송 앱 표(`ministry_orders`·`event_signups`)와 앱 코드는 손대지 않는다.
- 커밋은 이 과제의 경로만 `git add <경로>` 로(worktree 는 제 index 를 가진다) · `--no-verify` 금지 · 커밋 끝 줄 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- 교인명부 세션(bible-memorize-church-app-v2-99)과의 약속(설계 §7): 칸 이름 · `historyLinkPatch` · `historyUnlinkPatch` · `rematchHistoryRows(db, ids)` 를 이 계획 그대로 둔다.

## 파일 지도

| 파일 | 만듦/고침 | 맡는 일 |
|---|---|---|
| `supabase/sql/005_ministry_history.sql` | 만듦 | 표 둘 · 색인 · RLS · `ministry_history_apply` |
| `supabase/functions/church-admin/history-match.ts` | 만듦 | 맞춤 규칙(순수) · `srcKey` · `historyLinkPatch` · `toHPerson` · `candFp` · `WEAK_RE` |
| `supabase/functions/church-admin/history-db.ts` | 만듦 | 표 읽기·쓰기 · 응답 칸 지도 · `makeHistory` · `rematchHistoryRows` |
| `supabase/functions/church-admin/index.ts` | 고침 | import 한 줄 · `historyApi` · switch 열 줄 |
| `supabase/functions/church-admin/authz.ts` | 고침 | ACTION_ROLES 열 줄 |
| `js/menus/ministry/history-logic.js` · `history.js` | 만듦 | 화면(순수 · 그리기) |
| `js/menus/registry.js` · `js/core/ui.js` · `js/menus/system/audit.js` · `css/admin.css` · `privacy.html` · `.gitignore` | 고침 | 메뉴 한 줄 · 오류 문구 · 기록 이름 · 모양 · 안내 8절 · `Data/` |
| `tests/history-match.test.mjs` · `tests/history-db.test.mjs` · `tests/ministry-history-logic.test.mjs` | 만듦 | 순수 시험(preflight 가 저절로 돈다) |
| `tests/authz.test.mjs` · `tests/xlsx-loader.test.mjs` · `tests/audit.test.mjs` · `tests/server.dev.test.mjs` | 고침 | 목록 · 한 곳 · 기록 · PROBE·흐름 |
| `tests/seed-history-dev.mjs` · `tools/history/check_real.py` · `tools/history/check_real.mjs` | 만듦 | 개발 씨앗 · 이 PC 대조 |
| `CLAUDE.md`(교회 어드민) · v2 `docs/notes/ministry-history.md` · v2 `CLAUDE.md` 지도 | 고침/만듦 | 문서 |

---

### Task 1: 작업 가지 · SQL 005 · `Data/` 막기 · 개발 DB 적용

**Files:**
- Create: `supabase/sql/005_ministry_history.sql`
- Modify: `.gitignore` (끝에 두 줄)

**Interfaces:**
- Produces: 표 `ministry_history`(칸은 아래 SQL 그대로) · `ministry_history_imports` · 함수 `ministry_history_apply(p jsonb) → integer`(p = `[{id, expect, person_id, match_basis, match_reason}]` · auto·안 빠진·updated_at 같은 줄만 고친다 · updated_at 은 안 올린다).

- [ ] **Step 1: 작업 가지(worktree)를 만든다**

```bash
cd /c/Projects/church-admin && git fetch -q && git worktree add .worktrees/ministry-history -b ministry-history origin/main
cd .worktrees/ministry-history && git log --oneline -1
```
Expected: 새 가지 `ministry-history` 가 `origin/main` 꼭대기에서 시작.

- [ ] **Step 2: `.gitignore` 끝에 더한다**

```gitignore
# 사역 이력(2026-10-01) — 친구가 올리려고 받아 둔 사역 명단 엑셀 폴더. 진짜 이름이 든 파일이라 저장소 밖으로 옮기길 권한다(leak-scan 도 xlsx 를 잡는다)
Data/
```

- [ ] **Step 3: `supabase/sql/005_ministry_history.sql` 을 만든다**

```sql
-- 교회 어드민 — 사역 이력(지난 해 사역 임명 · 교인ID) (2026-10-01 · 설계 v2 docs/superpowers/specs/2026-10-01-church-admin-ministry-history-design.md)
-- ⚠️ 개발(ktpwthwqzgcqcrmsafdo) 먼저, 그다음 운영(xnomlgydifiqiybervtf).
-- ⚠️ 서버(church-admin 함수의 service role)만 읽고 쓴다. 공개 키·로그인 사용자(카카오 계정만 있으면 누구나) 모두 막는다.
--    RLS 를 켜고 정책을 두지 않으며 anon·authenticated 권한을 뺀다. 맞춤 결과를 한꺼번에 쓰는 함수도 service_role 만 부른다.
-- ⚠️ person_id 에 FK 를 걸지 않는다 — 12월 새 교인명부에서 빠진 분의 줄도 남아야 한다(명부에 없으면 화면이 「명부에 없음」).
-- ⚠️ 교인명부 세션(자세히 창)은 이 표를 person_id 로 **읽기만** 한다 — 칸 이름을 바꾸면 그쪽 설계(2026-10-01-person-history-tabs)도.
-- 여러 번 돌려도 안전하다(if not exists · create or replace).
-- 실행: supabase --workdir <작업 폴더> db query --linked -f C:/Projects/church-admin/supabase/sql/005_ministry_history.sql
begin;

create table if not exists ministry_history_imports (
  id              bigserial primary key,
  imported_at     timestamptz not null default now(),
  member_id       uuid references admin_members(id) on delete set null,
  file_name       text not null default '',
  years           int[] not null default '{}',
  total           int not null default 0,         -- 파일에서 읽은 줄
  added           int not null default 0,
  skipped_same    int not null default 0,         -- 이미 있는 같은 줄
  skipped_deleted int not null default 0,         -- 빼 둔 줄과 같음
  skipped_dup     int not null default 0          -- 파일 안 겹침
);

create table if not exists ministry_history (
  id           bigserial primary key,
  year         int  not null check (year between 1950 and 2100),
  committee    text not null default '',          -- 부서(위원회) — 엑셀 「부서」
  team         text not null default '',          -- 팀명
  role_title   text not null default '',          -- 직책(팀장·부팀장 …) — 엑셀에 없으면 빈칸
  name         text not null,                     -- 그때의 이름(원문 · NFC)
  position     text not null default '',          -- 그때의 직분(원문)
  mok          text not null default '',          -- 그때의 목장(원문 「기쁨-19」·「청년05또래」)
  renewal      text not null default '',          -- 신규 / 유지
  src_note     text not null default '',          -- 원본 메모(2022 H열 등)
  person_id    int,                               -- 교인ID(church_people.person_id) · null = 못 맞춤/이분 아님
  link_how     text not null default 'auto' check (link_how in ('auto', 'manual', 'none')),
  match_basis  text not null default '',          -- 맞춤 근거(person_id 가 있을 때)
  match_reason text not null default '',          -- 못 맞춘 사유 = 화면·내려받기의 「비고」
  linked_by    uuid references admin_members(id) on delete set null,
  linked_at    timestamptz,
  source       text not null default 'excel' check (source in ('excel', 'admin', 'app')),   -- admin = 화면에서 한 줄 더함
  source_file  text not null default '',
  import_id    bigint references ministry_history_imports(id) on delete set null,
  order_id     bigint,                            -- source='app' 일 때 원래 ministry_orders.id(넘기기 · 나중)
  src_key      text not null,                     -- 같은 줄 열쇠 — 올린 그대로, 고쳐도 안 바뀐다
  deleted_at   timestamptz,                       -- 빼 둔 때(지우지 않는다 — 다시 올려도 되살아나지 않게)
  deleted_by   uuid references admin_members(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint ministry_history_app_order_chk check ((source = 'app') = (order_id is not null))
);
create unique index if not exists ministry_history_src_key_uq on ministry_history (src_key);
create unique index if not exists ministry_history_order_uq   on ministry_history (order_id) where order_id is not null;
create index if not exists ministry_history_person_idx on ministry_history (person_id) where deleted_at is null;
create index if not exists ministry_history_year_idx   on ministry_history (year);

alter table ministry_history_imports enable row level security;
alter table ministry_history         enable row level security;
revoke all on ministry_history, ministry_history_imports from anon, authenticated;
revoke all on sequence ministry_history_id_seq, ministry_history_imports_id_seq from anon, authenticated;

-- 맞춤 결과 한꺼번에 쓰기(다시 맞추기) — 자동 줄만, 그사이 사람이 고친 줄(updated_at 이 다름)은 건너뛴다.
--   p = [{ "id": 1, "expect": "<updated_at 그대로>", "person_id": 123 | null, "match_basis": "…", "match_reason": "…" }, …]
--   updated_at 은 올리지 않는다(맞춤만 바뀌었다 — 열려 있는 고치기 창이 conflict 로 막히지 않게).
create or replace function public.ministry_history_apply(p jsonb)
returns integer language plpgsql set search_path = public as $$
declare n integer;
begin
  update ministry_history h
     set person_id    = nullif(x->>'person_id', '')::int,
         match_basis  = coalesce(x->>'match_basis', ''),
         match_reason = coalesce(x->>'match_reason', '')
    from jsonb_array_elements(p) x
   where h.id = (x->>'id')::bigint
     and h.link_how = 'auto'
     and h.deleted_at is null
     and h.updated_at = (x->>'expect')::timestamptz;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.ministry_history_apply(jsonb) from public, anon, authenticated;
grant execute on function public.ministry_history_apply(jsonb) to service_role;

commit;

select 'ministry_history' as t, count(*) from ministry_history
union all select 'imports', count(*) from ministry_history_imports
union all select 'anon·authenticated 표 권한(0이어야)', count(*) from information_schema.role_table_grants
  where table_name in ('ministry_history', 'ministry_history_imports') and grantee in ('anon', 'authenticated')
union all select 'apply 를 authenticated 가 부름(0이어야)', count(*) from information_schema.routine_privileges
  where routine_name = 'ministry_history_apply' and grantee in ('anon', 'authenticated', 'PUBLIC');
```

- [ ] **Step 4: 개발 DB 에 적용하고 노출 점검**

```bash
cat ~/.church-admin/supa-dev/supabase/.temp/project-ref; echo      # ktpwthwqzgcqcrmsafdo 여야 한다 — 다르면 멈춘다
supabase --workdir ~/.church-admin/supa-dev db query --linked "select count(*) from users"   # 스물 남짓 = 개발(사백이 넘으면 운영 — 멈춘다)
supabase --workdir ~/.church-admin/supa-dev db query --linked -f C:/Projects/church-admin/.worktrees/ministry-history/supabase/sql/005_ministry_history.sql
supabase --workdir ~/.church-admin/supa-dev db query --linked -f C:/Projects/church-admin/.worktrees/ministry-history/supabase/sql/check-authenticated-exposure.sql
```
Expected: 005 의 마지막 SELECT 가 `anon·authenticated 표 권한(0이어야) 0` · `apply 를 authenticated 가 부름(0이어야) 0` · 노출 점검 0행.

- [ ] **Step 5: 커밋**

```bash
git add .gitignore supabase/sql/005_ministry_history.sql
git commit -m "feat(사역이력): SQL 005 — ministry_history·imports 표 · RLS · ministry_history_apply(서버만) · Data/ 막기

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: 맞춤 규칙 순수 모듈 `history-match.ts`

**Files:**
- Create: `supabase/functions/church-admin/history-match.ts`
- Test: `tests/history-match.test.mjs`

**Interfaces:**
- Consumes: `people-match.ts` 의 `mokNumber`, `nameKey`.
- Produces:
  - `type HPerson = { person_id, name, gender, kind2, mok1, mok3, school_dept, position, position_detail, birth_year: number|null, birth_month: number|null, reg_year: number|null, household: string }`
  - `type HRow = { id, year, committee, team, name, position, mok, renewal, link_how: "auto"|"manual"|"none", person_id: number|null }`
  - `matchAll(rows: HRow[], people: HPerson[]): { id, person_id, match_basis, match_reason }[]` — auto 줄만 계산, manual·none 은 그대로.
  - `srcKey({year, committee, team, name, mok, position}): string` · `hKey(name)` · `teamKey(team)` · `parseRow(year, mok, position)` · `nfc(s)`
  - `historyLinkPatch(personId|null, memberId|null, nowIso)` · `historyUnlinkPatch(nowIso)` · `R_MANUAL_NONE`
  - `HISTORY_PEOPLE_COLS` · `toHPerson(churchPeopleRow): HPerson` · `candFp(lines: string[]): string`(16진 8자) · `WEAK_RE` · `nameKeyVariants(name): string[]`

- [ ] **Step 1: 시험을 쓴다 — `tests/history-match.test.mjs`**

```js
// 사역 이력 맞춤 규칙(history-match.ts) — 가짜 명부로 규칙마다(설계 §4)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  srcKey, parseRow, matchAll, teamKey, historyLinkPatch, historyUnlinkPatch, R_MANUAL_NONE,
} from "../supabase/functions/church-admin/history-match.ts";

let pid = 1000;
const person = (o) => ({
  person_id: ++pid, name: "가나다", gender: "여", kind2: "장년", mok1: "기쁨", mok3: "기쁨-19목장", school_dept: "",
  position: "집사", position_detail: "", birth_year: 1970, birth_month: 5, reg_year: 2000, household: "", ...o,
});
let rid = 0;
const row = (o) => ({
  id: ++rid, year: 2024, committee: "찬양부", team: "가브리엘찬양대", name: "가나다", position: "집사", mok: "기쁨-19",
  renewal: "신규", link_how: "auto", person_id: null, ...o,
});
const one = (rows, people, id) => matchAll(rows, people).find((r) => r.id === (id ?? rows[0].id));

test("srcKey — 칸마다 NFC·띄어쓰기 없음 · 끝 영문자 대문자", () => {
  const a = srcKey({ year: 2024, committee: "찬양 부", team: "가브리엘 찬양대", name: "가나다 a", mok: "기쁨 - 19", position: " 집사" });
  assert.equal(a, "2024|찬양부|가브리엘찬양대|가나다A|기쁨-19|집사");
  const nfd = "가나다".normalize("NFD");
  assert.equal(srcKey({ year: 2024, committee: "", team: "", name: nfd, mok: "", position: "" }), "2024|||가나다||");
});

test("parseRow — 목장 꼴", () => {
  assert.deepEqual([parseRow(2024, "기쁨-19", "집사").kind, parseRow(2024, "기쁨-19", "집사").mok], ["교구", 19]);
  assert.equal(parseRow(2025, "기쁨25", "집사").mok, 25);
  assert.equal(parseRow(2025, "소망남성", "집사").men, true);
  assert.equal(parseRow(2024, "믿음-남성", "집사").men, true);
  const t = parseRow(2026, "청년05또래", "청년");
  assert.deepEqual([t.kind, t.ttae], ["청년", 5]);
  assert.equal(parseRow(2024, "92또래", "").ttae, 92);
  assert.equal(parseRow(2022, "2교구 20목장", "집사").kind, "모름");
  assert.equal(parseRow(2022, "", "청년").kind, "청년");
  assert.equal(parseRow(2025, "", "고등부").kind, "학생");
  assert.equal(parseRow(2026, "새가족", "성도").kind, "새가족");
  const typo = parseRow(2023, "믿은-15", "권사");
  assert.deepEqual([typo.gu, typo.mok, typo.notes], ["믿음", 15, ["목장 오타 고쳐 읽음"]]);
});

test("parseRow — 2025년 이전 「기쁨-1」은 목장 모름, 2026 은 진짜 1목장", () => {
  assert.equal(parseRow(2024, "기쁨-1", "권사").kind, "모름");
  const now = parseRow(2026, "기쁨-1", "권사");
  assert.deepEqual([now.kind, now.gu, now.mok], ["교구", "기쁨", 1]);
});

test("teamKey — 앞말·빈칸·괄호 · 주일찬양(2부)=주일2부찬양", () => {
  assert.equal(teamKey("사역팀-사랑부"), "사랑부");
  assert.equal(teamKey("미취학-새싹부"), "새싹부");
  assert.equal(teamKey("주일찬양(2부)"), teamKey("주일2부찬양"));
});

test("차례 1 — 같은 소속 한 분", () => {
  const p = person({}), q = person({ mok3: "기쁨-3목장" });
  const r = one([row({})], [p, q]);
  assert.deepEqual([r.person_id, r.match_basis], [p.person_id, "같은 소속"]);
});

test("남성 목장 — 「소망-남성」은 남성1 분, 숫자 1목장 줄은 남성1 분과 안 맞는다", () => {
  const m = person({ gender: "남", mok1: "소망", mok3: "소망-남성1" });
  assert.equal(one([row({ mok: "소망-남성" })], [m]).match_basis, "같은 소속");
  const r = one([row({ mok: "소망-1" })], [m]);
  assert.notEqual(r.match_basis, "같은 소속");
});

test("빼기 — 권사 줄과 남자 분 · 그해보다 늦게 등록", () => {
  const man = person({ gender: "남" });
  const r = one([row({ position: "권사" })], [man]);
  assert.equal(r.person_id, null);
  assert.match(r.match_reason, /성별/);
  const late = person({ reg_year: 2025 });
  assert.equal(one([row({ year: 2024 })], [late]).person_id, null);
});

test("빼기 — 집사 줄과 아이 · 직분 없는 청년 · 직분 없는 40세 미만(권사 이상)", () => {
  const kid = person({ kind2: "교회학교", position: "", birth_year: 2012 });
  const r = one([row({})], [kid]);
  assert.equal(r.person_id, null);
  assert.match(r.match_reason, /교회학교 학생/);
  const youth = person({ kind2: "청년", position: "", birth_year: 2001, mok1: "섬김", mok3: "섬김-1목장" });
  assert.equal(one([row({})], [youth]).person_id, null);
  const young = person({ gender: "남", position: "", birth_year: 1986, mok3: "기쁨-28목장" });
  assert.equal(one([row({ year: 2022, position: "안수집사", mok: "기쁨-26" })], [young]).person_id, null);
});

test("직분이 빈 교구 줄 — 14세 이상 · 가족 목장이 같은 아이는 「학생으로 봄」", () => {
  const teen = person({ kind2: "교회학교", position: "", birth_year: 2009, school_dept: "고등부" });
  const r = one([row({ year: 2025, position: "" })], [teen]);
  assert.equal(r.person_id, teen.person_id);
  assert.match(r.match_basis, /학생으로 봄/);
});

test("또래 — 출생 연도 끝 두 자리(1~2월생은 다음 또래도)", () => {
  const a = person({ kind2: "청년", mok1: "청년부", mok3: "청년-5", position: "", birth_year: 2005 });
  const b = person({ kind2: "청년", mok1: "청년부", mok3: "청년-95", position: "", birth_year: 1995 });
  assert.equal(one([row({ year: 2026, mok: "청년05또래", position: "청년" })], [a, b]).person_id, a.person_id);
  const jan = person({ kind2: "청년", mok1: "청년부", position: "", birth_year: 2006, birth_month: 1 });
  assert.equal(one([row({ year: 2026, mok: "청년05또래", position: "청년" })], [jan]).person_id, jan.person_id);
});

test("차례 2 — 같은 교구 한 분 · 다른 교구에 같은 이름이 있으면 붙임말", () => {
  const g = person({ mok3: "기쁨-7목장" }), o = person({ mok1: "은혜", mok3: "은혜-3목장" });
  const r = one([row({})], [g, o]);
  assert.deepEqual([r.person_id, r.match_basis], [g.person_id, "같은 교구(목장 다름) · 다른 교구에 같은 이름"]);
});

test("차례 3 — 명부에 이름이 한 분", () => {
  const o = person({ mok1: "은혜", mok3: "은혜-3목장" });
  assert.equal(one([row({})], [o]).match_basis, "이름이 한 분뿐(소속 다름)");
});

test("차례 4 — 같은 목장 둘 중 권사 갈래", () => {
  const k = person({ position: "권사" }), d = person({ position: "집사" });
  const r = one([row({ position: "은퇴권사" })], [k, d]);
  assert.deepEqual([r.person_id, r.match_basis], [k.person_id, "같은 소속 · 직분으로 가림"]);
});

test("차례 5 — 가족이 같은 해 같은 목장 글자로 명단에 있는 분", () => {
  const a = person({ household: "h1", mok3: "기쁨-14목장" }), b = person({ household: "h2", mok3: "기쁨-14목장" });
  const spouse = person({ name: "라마바", gender: "남", household: "h1", mok3: "기쁨-14목장" });
  const rows = [row({ mok: "기쁨-14" }), row({ name: "라마바", mok: "기쁨-14", team: "유아부" })];
  assert.equal(one(rows, [a, b, spouse], rows[0].id).person_id, a.person_id);
});

test("같은 소속 여럿 — 못 가리면 비우고 사유", () => {
  const a = person({}), b = person({});
  const r = one([row({})], [a, b]);
  assert.equal(r.person_id, null);
  assert.equal(r.match_reason, "같은 목장에 같은 이름 2명 — 누군지 못 가림");
});

test("다른 해 같은 팀 「유지」 — 약한 맞춤을 다른 분으로 바로잡는다", () => {
  const old = person({ mok3: "기쁨-2목장", position: "집사" });                  // 같은 교구에 남은 동명이인
  const moved = person({ mok1: "은혜", mok3: "은혜-7목장", position: "권사" });   // 은혜로 옮긴 분
  const rows = [
    row({ year: 2024, position: "집사", mok: "기쁨-9", team: "행복전도대-토" }),
    row({ year: 2025, position: "집사", mok: "은혜-7", team: "행복전도대-토", renewal: "유지" }),
  ];
  const res = matchAll(rows, [old, moved]);
  assert.equal(res[1].person_id, moved.person_id);
  assert.deepEqual([res[0].person_id, res[0].match_basis], [moved.person_id, "다른 해 같은 팀"]);
});

test("오타 — 같은 목장에 한 글자 다른 분이 다른 해 같은 팀에 있으면", () => {
  const p = person({ name: "가나라", mok1: "사랑", mok3: "사랑-15목장", position: "권사" });
  const rows = [
    row({ year: 2023, name: "가나다", position: "권사", mok: "사랑-15", team: "중보기도" }),
    row({ year: 2024, name: "가나라", position: "권사", mok: "사랑-15", team: "중보기도" }),
  ];
  const res = matchAll(rows, [p]);
  assert.deepEqual([res[0].person_id, res[0].match_basis], [p.person_id, "이름 한 글자 다름(오타로 봄)"]);
});

test("같은 해 겹침 — 다른 교구면 약한 쪽을 비우고, 같은 교구 목장 차이는 둘 다 둔다", () => {
  const p = person({});
  const diffGu = [row({ mok: "기쁨-19" }), row({ mok: "화평-3", team: "주차" })];
  const r1 = matchAll(diffGu, [p]);
  assert.equal(r1[0].person_id, p.person_id);
  assert.equal(r1[1].person_id, null);
  assert.match(r1[1].match_reason, /같은 해에 다른 교구/);
  const sameGu = [row({ mok: "기쁨-19" }), row({ mok: "기쁨-25", team: "주차" })];
  assert.ok(matchAll(sameGu, [p]).every((r) => r.person_id === p.person_id));
});

test("사람이 이은 줄(manual·none)은 그대로 · manual 은 다른 해 근거가 된다", () => {
  const a = person({ mok3: "기쁨-2목장" }), b = person({ mok1: "은혜", mok3: "은혜-7목장" });
  const rows = [
    row({ year: 2025, link_how: "manual", person_id: b.person_id, mok: "기쁨-9", renewal: "유지" }),
    row({ year: 2024, mok: "기쁨-9" }),
    row({ year: 2023, link_how: "none", mok: "기쁨-9" }),
  ];
  const res = matchAll(rows, [a, b]);
  assert.equal(res[0].person_id, b.person_id);
  assert.deepEqual([res[1].person_id, res[1].match_basis], [b.person_id, "다른 해 같은 팀"]);
  assert.deepEqual([res[2].person_id, res[2].match_reason], [null, R_MANUAL_NONE]);
});

test("이름 끝 영문자 — 명단 「가나다」는 명부 「가나다A」도 후보, 명단 「가나다B」가 없으면 떼고", () => {
  const a = person({ name: "가나다A" });
  assert.equal(one([row({})], [a]).person_id, a.person_id);
  const r = one([row({ name: "가나다 B" })], [person({ name: "가나다", mok3: "기쁨-19목장" })]);
  assert.match(r.match_basis, /이름 끝 영문자 떼고/);
});

test("historyLinkPatch / historyUnlinkPatch 모양(교인명부 세션과의 약속 §7)", () => {
  const now = "2026-10-01T00:00:00.000Z";
  assert.deepEqual(historyLinkPatch(7, "m1", now), {
    person_id: 7, link_how: "manual", linked_by: "m1", linked_at: now, match_basis: "사람이 이음", match_reason: "", updated_at: now,
  });
  assert.deepEqual(historyLinkPatch(null, "m1", now), {
    person_id: null, link_how: "none", linked_by: "m1", linked_at: now, match_basis: "", match_reason: R_MANUAL_NONE, updated_at: now,
  });
  assert.deepEqual(historyUnlinkPatch(now), { link_how: "auto", linked_by: null, linked_at: null, updated_at: now });
});
```

- [ ] **Step 2: 시험이 실패하는지 본다**

Run: `node --experimental-strip-types --test tests/history-match.test.mjs`
Expected: FAIL — `Cannot find module …/history-match.ts`

- [ ] **Step 3: `supabase/functions/church-admin/history-match.ts` 를 쓴다**

```ts
// 사역 이력(ministry_history) — 명단 줄을 교인명부(church_people)와 맞대는 규칙(순수 함수 · 2026-10-01)
//   설계: 성경암송 저장소 docs/superpowers/specs/2026-10-01-church-admin-ministry-history-design.md §4
//   서버(Deno, history-db.ts)와 시험(Node, tests/history-match.test.mjs · tools/history/check_real.mjs)이 **같은 파일**을 읽는다 —
//   authz.ts 와 같은 제약(원격 import·enum 금지, node --experimental-strip-types 가 그대로 읽는다).
// ⚠️ 2026-10-01 독립 검증 다섯 갈래에서 나온 규칙이다. 규칙을 바꾸면 대조 시험(check_real)의 기대값도 함께 본다.
// ⚠️ 이 모듈은 교인ID 를 돌려준다 — 부르는 쪽(history-db.ts)이 역할에 따라 응답에서 가린다(설계 §5).
import { mokNumber, nameKey as pmNameKey } from "./people-match.ts";

export const GU7 = ["믿음", "소망", "사랑", "섬김", "은혜", "화평", "기쁨"];
const TYPO: Record<string, string> = { "가쁨": "기쁨", "믿은": "믿음" };
const YOUTH_MOK1 = ["청년부", "청년공동체", "청년새가족"];
const YOUTH_KIND2 = ["청년", "청년군대/유학"];
const KID_KIND2 = ["교회학교", "학생"];
const KID_POS = ["학생", "어린이", "고등부", "중등부"];

// ── 사람(교인명부 한 분) — 부르는 쪽이 church_people 에서 이 모양으로 옮긴다(history-db.ts toHPerson)
export type HPerson = {
  person_id: number; name: string; gender: string; kind2: string; mok1: string; mok3: string; school_dept: string;
  position: string; position_detail: string;
  birth_year: number | null; birth_month: number | null; reg_year: number | null;
  household: string;            // 가족 열쇠(세대주 교인ID 글자) · 없으면 ""
};
// ── 명단 줄 — ministry_history 한 줄(필요한 칸만)
export type HRow = {
  id: number; year: number; committee: string; team: string; name: string; position: string; mok: string; renewal: string;
  link_how: "auto" | "manual" | "none"; person_id: number | null;
};
export type HResult = { id: number; person_id: number | null; match_basis: string; match_reason: string };

// ── 다듬기 ─────────────────────────────────────────────────────────
export const nfc = (s: unknown): string => String(s ?? "").normalize("NFC").trim();
const nospace = (s: unknown): string => nfc(s).replace(/\s+/g, "");
// 이름 열쇠 — people-match nameKey(NFC·띄어쓰기 없음) + 끝 영문자(동명이인 표시 「홍길동a」)는 대문자로
export function hKey(s: unknown): string {
  return pmNameKey(s).replace(/([가-힣])([a-z])$/, (_m, h, l) => h + l.toUpperCase());
}
const hasSuffix = (k: string): boolean => /[가-힣][A-Z]$/.test(k);
const stripSuffix = (k: string): string => k.replace(/([가-힣])[A-Z]$/, "$1");
const stripParen = (k: string): string => k.replace(/\(.*?\)/g, "");

// 같은 줄 열쇠(설계 §3.2) — 해|부서|팀|이름|목장|직분 · 칸마다 NFC·띄어쓰기 없음 · 이름은 hKey
export function srcKey(r: { year: number; committee: string; team: string; name: string; mok: string; position: string }): string {
  return [String(r.year), nospace(r.committee), nospace(r.team), hKey(r.name), nospace(r.mok), nospace(r.position)].join("|");
}

// ── 명단 줄 읽기(설계 §4.1) ──────────────────────────────────────────
export type Affil = {
  kind: "교구" | "새가족" | "청년" | "학생" | "모름";
  gu: string; mok: number | null; men: boolean; ttae: number | null;   // ttae = 「NN또래」의 NN
  raw: string;                                                          // 목장 글자(띄어쓰기 없음) — 「같은 목장 글자」 견주기
  notes: string[];
};
export function parseRow(year: number, mokText: unknown, position: unknown): Affil {
  let t = nospace(mokText);
  const notes: string[] = [];
  for (const [bad, good] of Object.entries(TYPO)) {
    if (t.startsWith(bad)) { t = good + t.slice(bad.length); notes.push("목장 오타 고쳐 읽음"); }
  }
  const a: Affil = { kind: "모름", gu: "", mok: null, men: false, ttae: null, raw: t, notes };
  const m = new RegExp("^(" + GU7.join("|") + ")-?(.*)$").exec(t);
  if (m) {
    a.kind = "교구"; a.gu = m[1];
    const rest = m[2];
    if (rest.includes("남성")) { a.men = true; a.mok = mokNumber(rest); }
    else if (/^\d+(목장)?$/.test(rest)) a.mok = Number(/^\d+/.exec(rest)![0]);
    // ⚠️ 2025년 이전 명단의 「기쁨-1」은 목장을 모를 때 쓰던 자리 표시로 본다(교구도 모름 · 2026-10-01 검증 — 친구 확인 대기)
    if (year <= 2025 && a.gu === "기쁨" && a.mok === 1 && !a.men) {
      a.kind = "모름"; a.gu = ""; a.mok = null; notes.push("옛 「기쁨-1」은 목장 모름");
    }
    return a;
  }
  if (t === "새가족") { a.kind = "새가족"; a.gu = "새가족"; return a; }
  const tt = /^(?:청년)?(\d{2})또래$/.exec(t);
  if (tt) { a.kind = "청년"; a.ttae = Number(tt[1]); return a; }
  if (t.startsWith("청년")) { a.kind = "청년"; return a; }
  if (t === "학생") { a.kind = "학생"; return a; }
  const p = nfc(position);
  if (p === "청년") a.kind = "청년";
  else if (KID_POS.includes(p)) a.kind = "학생";
  return a;   // 「2교구 20목장」·「6교구-7」 같은 숫자 교구 · 빈칸 · 「-」 → 모름
}

const cleanPos = (p: unknown): string => { const s = nfc(p); return s === "-" ? "" : s; };
// 직분 → 성별(권사=여 · 장로·안수집사=남 · 남성 목장=남)
export function rowSex(position: unknown, a: Affil): string {
  const p = cleanPos(position);
  if (p.includes("권사")) return "여";
  if (p.includes("장로") || p.includes("안수집사")) return "남";
  if (a.men) return "남";
  return "";
}
// 직분 계급 — 0 없음·성도·청년 / 1 집사·서리집사 / 2 권사·안수집사 / 3 장로 (은퇴·명예·협동·이명은 계급 유지)
export function rank(position: unknown): number {
  const p = cleanPos(position);
  if (p.includes("장로")) return 3;
  if (p.includes("권사") || p.includes("안수집사")) return 2;
  if (p.includes("집사")) return 1;
  return 0;
}
const isKidPos = (p: string): boolean => KID_POS.includes(p);
// 어른 줄 — 직분이 있고(학생·어린이 등 아님) 또는 청년·새가족 줄
const rowAdult = (pos: string, a: Affil): boolean => (pos !== "" && !isKidPos(pos)) || a.kind === "청년" || a.kind === "새가족";

// ── 사람 쪽 판정 ─────────────────────────────────────────────────────
type P = HPerson & { key: string; sex: string; men: boolean; youthKind: boolean };
const ageAt = (c: P, year: number): number | null => (c.birth_year ? year - c.birth_year : null);
const kidAt = (c: P, year: number): boolean => {
  const age = ageAt(c, year);
  return age !== null ? age < 19 : KID_KIND2.includes(c.kind2);
};
function prep(p: HPerson): P {
  const mok3 = nfc(p.mok3);
  return {
    ...p, name: nfc(p.name), kind2: nfc(p.kind2), mok1: nfc(p.mok1), mok3, school_dept: nfc(p.school_dept),
    position: nfc(p.position), position_detail: nfc(p.position_detail),
    key: hKey(p.name), sex: nfc(p.gender).replace(/[^남여]/g, ""), men: /남성/.test(mok3),
    youthKind: (YOUTH_KIND2.includes(nfc(p.kind2)) || YOUTH_MOK1.includes(nfc(p.mok1)) || nfc(p.school_dept) === "청년공동체"),
  };
}

// 같은 소속(설계 §4.3 차례 1) — people-match.ts sameAffiliation 의 교구 규칙(남성 목장 포함) + 새가족·청년·학생
function sameAffil(c: P, a: Affil, year: number): boolean {
  if (a.kind === "교구") {
    if (c.mok1 !== a.gu) return false;
    if (a.men) return !kidAt(c, year) && c.men && (a.mok === null || mokNumber(c.mok3) === a.mok);
    if (a.mok === null) return false;
    return !c.men && mokNumber(c.mok3) === a.mok;
  }
  if (a.kind === "새가족") return c.mok1 === "새가족";
  if (a.kind === "청년") return c.youthKind && !kidAt(c, year);
  if (a.kind === "학생") return true;   // 나이 띠(12~19세)는 빼기 단계에서 이미 걸렀다
  return false;
}

// ── 한 줄 맞추기(1차) ────────────────────────────────────────────────
type Pick = { pid: number | null; basis: string; reason: string; strength: number; notes: string[]; cands: P[] };
const S = { MANUAL: 9, SAME: 5, TIE: 4, CROSS: 4, GU: 2, ONLY: 1, NONE: 0 };

const R_NONE = "교인명부에 같은 이름이 없음";
const R_KID = "교인명부의 같은 이름은 교회학교 학생·직분 없는 청년뿐 — 다른 분으로 봄";
const R_MISFIT = "교인명부의 같은 이름은 직분과 성별(또는 등록일·나이)이 맞지 않음 — 다른 분으로 봄";
const R_CLASH = "같은 해에 다른 교구의 같은 이름 줄이 있고 명부엔 한 분 — 어느 줄인지 못 가림";
export const R_MANUAL_NONE = "이분 아님(담당자 확인)";

type Ctx = {
  byKey: Map<string, P[]>; bySuffixBase: Map<string, P[]>; byGu: Map<string, P[]>; byHousehold: Map<string, P[]>;
  // 같은 해·같은 이름 열쇠·같은 목장 글자 줄이 있는가(가족 근거) — `${year}|${key}|${raw}`
  rowSig: Set<string>;
};

function candidatesOf(k: string, ctx: Ctx, notes: string[]): P[] {
  let c = [...(ctx.byKey.get(k) ?? [])];
  if (!hasSuffix(k)) c.push(...(ctx.bySuffixBase.get(k) ?? []));
  if (!c.length && hasSuffix(k)) {
    const b = stripSuffix(k);
    c = [...(ctx.byKey.get(b) ?? []), ...(ctx.bySuffixBase.get(b) ?? [])];
    if (c.length) notes.push("이름 끝 영문자 떼고");
  }
  if (!c.length && k.includes("(")) {
    c = [...(ctx.byKey.get(stripParen(k)) ?? [])];
    if (c.length) notes.push("이름 괄호 떼고");
  }
  const seen = new Set<number>();
  return c.filter((p) => (seen.has(p.person_id) ? false : (seen.add(p.person_id), true)));
}

// 빼기(설계 §4.2) — 다른 분으로 본다. kid=아이·직분 없는 청년 때문에 빠졌는가
function excluded(c: P, r: HRow, a: Affil, pos: string, notes: string[]): "" | "kid" | "misfit" {
  const y = r.year;
  const sx = rowSex(pos, a);
  if (sx && c.sex && sx !== c.sex) return "misfit";
  if (c.reg_year && c.reg_year > y) return "misfit";
  const age = ageAt(c, y);
  if (a.kind === "학생") {
    if (age !== null && (age < 12 || age > 19)) return "misfit";
  } else if (kidAt(c, y)) {
    if (rowAdult(pos, a)) return "kid";
    // 직분이 빈 교구 줄 — 그해 14세 이상이고 가족 목장 글자가 같은 아이만(부모와 함께 섬기는 도우미)
    const famSame = a.kind === "교구" && c.mok1 === a.gu && !c.men && a.mok !== null && mokNumber(c.mok3) === a.mok;
    if (!(famSame && age !== null && age >= 14)) return "kid";
    notes.push("학생으로 봄");
  }
  // 집사 이상 줄 ↔ 직분 없는 청년·아이(kind2 교회학교·학생 포함 — 낡은 kind2 도) · 검증: 같은 소속 3,294줄 중 반례 0
  if (rank(pos) >= 1 && !c.position && (c.youthKind || KID_KIND2.includes(c.kind2) || kidAt(c, y))) return "kid";
  // 권사·안수집사·장로 줄 ↔ 명부 직분 없음 + 그해 40세 미만(임직은 거꾸로 가지 않고, 강한 맞춤의 권사는 48세·안수집사는 45세 아래가 없다)
  if (rank(pos) >= 2 && !c.position && age !== null && age < 40) return "misfit";
  if (a.kind === "청년" && age !== null && age >= 45) return "misfit";
  if (a.ttae !== null && c.birth_year) {
    const yy = c.birth_year % 100;
    const ok = yy === a.ttae || (yy === (a.ttae + 1) % 100 && (c.birth_month ?? 0) >= 1 && (c.birth_month ?? 0) <= 2);
    if (!ok) return "misfit";
  }
  return "";
}

// 여럿 남았을 때(설계 §4.3 차례 4·5) — 직분 갈래 → 가족이 같은 해 같은 목장 글자
function tieBreak(list: P[], r: HRow, a: Affil, pos: string, ctx: Ctx): { one: P | null; how: string } {
  let cur = list;
  let how = "";
  const fam = pos.includes("권사") ? "권사" : pos.includes("목사") ? "목사" : "";
  if (fam) {
    const f = cur.filter((c) => c.position.includes(fam));
    if (f.length === 1) return { one: f[0], how: "직분으로 가림" };
    if (f.length > 1) cur = f;
  }
  if (a.raw) {
    const h = cur.filter((c) => c.household && (ctx.byHousehold.get(c.household) ?? []).some((m) =>
      m.person_id !== c.person_id && ctx.rowSig.has(`${r.year}|${m.key}|${a.raw}`)));
    if (h.length === 1) return { one: h[0], how: "가족이 같은 해 같은 목장" };
  }
  return { one: null, how };
}

function matchOne(r: HRow, ctx: Ctx): Pick {
  const pos = cleanPos(r.position);
  const a = parseRow(r.year, r.mok, pos);
  const notes = [...a.notes];
  const k = hKey(r.name);
  const all = candidatesOf(k, ctx, notes);
  if (!all.length) return { pid: null, basis: "", reason: R_NONE, strength: S.NONE, notes, cands: [] };
  const why: string[] = [];
  const cands = all.filter((c) => { const e = excluded(c, r, a, pos, notes); if (e) why.push(e); return !e; });
  if (!cands.length) return { pid: null, basis: "", reason: why.includes("misfit") ? R_MISFIT : R_KID, strength: S.NONE, notes, cands };

  const label = a.kind === "청년" ? "같은 구분(청년)" : a.kind === "학생" ? "같은 구분(학생)" : "같은 소속";
  const same = cands.filter((c) => sameAffil(c, a, r.year));
  if (same.length === 1) return { pid: same[0].person_id, basis: label, reason: "", strength: S.SAME, notes, cands };
  if (same.length > 1) {
    const t = tieBreak(same, r, a, pos, ctx);
    if (t.one) return { pid: t.one.person_id, basis: `${label} · ${t.how}`, reason: "", strength: S.TIE, notes, cands };
    const where = a.kind === "교구" ? "같은 목장" : `같은 소속(${a.kind})`;
    return { pid: null, basis: "", reason: `${where}에 같은 이름 ${same.length}명 — 누군지 못 가림`, strength: S.NONE, notes, cands };
  }
  if (a.kind === "교구") {
    const gu = cands.filter((c) => c.mok1 === a.gu);
    const base = a.mok === null && !a.men ? "같은 교구(목장 모름)" : "같은 교구(목장 다름)";
    const elsewhere = all.some((c) => c.mok1 !== a.gu && !kidAt(c, r.year)) ? " · 다른 교구에 같은 이름" : "";
    if (gu.length === 1) return { pid: gu[0].person_id, basis: base + elsewhere, reason: "", strength: S.GU, notes, cands };
    if (gu.length > 1) {
      const t = tieBreak(gu, r, a, pos, ctx);
      if (t.one) return { pid: t.one.person_id, basis: `같은 교구 · ${t.how}`, reason: "", strength: S.GU, notes, cands };
      return { pid: null, basis: "", reason: `같은 교구에 같은 이름 ${gu.length}명(목장은 명부와 다름) — 누군지 못 가림`, strength: S.NONE, notes, cands };
    }
  }
  if (cands.length === 1) {
    return { pid: cands[0].person_id, basis: a.kind === "모름" ? "이름이 한 분뿐(소속 모름)" : "이름이 한 분뿐(소속 다름)",
      reason: "", strength: S.ONLY, notes, cands };
  }
  const t = tieBreak(cands, r, a, pos, ctx);
  if (t.one) return { pid: t.one.person_id, basis: `${t.how}(소속 다름)`, reason: "", strength: S.ONLY, notes, cands };
  return { pid: null, basis: "", reason: `교인명부에 같은 이름 ${cands.length}명, 적힌 소속과 같은 분이 없음 — 누군지 못 가림`,
    strength: S.NONE, notes, cands };
}

// ── 팀 이름 다듬기(다른 해 같은 팀) ─────────────────────────────────────
export function teamKey(t: unknown): string {
  let s = nospace(t).replace(/^(사역팀|미취학|아동|청소년)-/, "");
  s = s.replace(/^주일찬양\((\d)부\)$/, "주일$1부찬양");
  return s.replace(/[()]/g, "");
}

// ── 전체 맞추기 ─────────────────────────────────────────────────────
// rows: 맞출 줄과 근거가 될 줄 모두(뺀 줄 제외) · people: 그 이름들의 교인명부(가족 근거를 쓰려면 가족도)
// auto 줄만 결과를 바꾼다 — manual·none 줄은 그대로 돌려주고, manual 은 다른 해 근거로 쓴다.
export function matchAll(rows: HRow[], people: HPerson[]): HResult[] {
  const ps = people.map(prep);
  const ctx: Ctx = { byKey: new Map(), bySuffixBase: new Map(), byGu: new Map(), byHousehold: new Map(), rowSig: new Set() };
  const push = (m: Map<string, P[]>, k: string, p: P) => { const l = m.get(k); if (l) l.push(p); else m.set(k, [p]); };
  for (const p of ps) {
    push(ctx.byKey, p.key, p);
    if (hasSuffix(p.key)) push(ctx.bySuffixBase, stripSuffix(p.key), p);
    if (p.mok1) push(ctx.byGu, p.mok1, p);
    if (p.household) push(ctx.byHousehold, p.household, p);
  }
  const byId = new Map<number, P>(ps.map((p) => [p.person_id, p]));
  for (const r of rows) ctx.rowSig.add(`${r.year}|${hKey(r.name)}|${parseRow(r.year, r.mok, r.position).raw}`);

  // 1차
  const pick = new Map<number, Pick>();
  for (const r of rows) {
    if (r.link_how === "manual") pick.set(r.id, { pid: r.person_id, basis: "사람이 이음", reason: "", strength: S.MANUAL, notes: [], cands: [] });
    else if (r.link_how === "none") pick.set(r.id, { pid: null, basis: "", reason: R_MANUAL_NONE, strength: S.MANUAL, notes: [], cands: [] });
    else pick.set(r.id, matchOne(r, ctx));
  }
  const auto = rows.filter((r) => r.link_how === "auto");
  const isAnchor = (p: Pick): boolean => p.pid !== null && p.strength >= S.CROSS;

  // 다른 해로 잇기(설계 §4.4) — 사슬이라 바뀜이 없을 때까지(최대 4번)
  const group = (r: HRow): string => (parseRow(r.year, r.mok, r.position).kind === "청년" ? "청년" : "어른");
  const sameTeamYear = new Map<string, HRow[]>();
  for (const r of rows) {
    const k = `${r.year}|${teamKey(r.team)}|${stripSuffix(hKey(r.name))}`;
    const l = sameTeamYear.get(k); if (l) l.push(r); else sameTeamYear.set(k, [r]);
  }
  const byName = new Map<string, HRow[]>();
  for (const r of rows) {
    const k = stripSuffix(hKey(r.name));
    const l = byName.get(k); if (l) l.push(r); else byName.set(k, [r]);
  }
  for (let round = 0; round < 4; round++) {
    let changed = 0;
    for (const r of auto) {
      const cur = pick.get(r.id)!;
      if (cur.pid !== null && cur.strength > S.GU) continue;     // 강한 줄은 덮지 않는다(약한 줄·빈 줄만)
      if (!cur.cands.length) continue;                         // 같은 이름이 명부에 없거나 모두 빠졌다
      const allowed = new Set(cur.cands.map((c) => c.person_id));
      const nk = stripSuffix(hKey(r.name));
      const tk = teamKey(r.team);
      const g = group(r);
      const peers = (sameTeamYear.get(`${r.year}|${tk}|${nk}`) ?? []).filter((x) => group(x) === g);
      const found = new Set<number>();
      let how = "";
      if (peers.length === 1) {
        for (const s of byName.get(nk) ?? []) {
          if (Math.abs(s.year - r.year) !== 1 || teamKey(s.team) !== tk || group(s) !== g) continue;
          const later = s.year > r.year ? s : r;
          if (nfc(later.renewal) !== "유지") continue;
          const sp = pick.get(s.id)!;
          if (sp.pid !== null && (sp.strength >= S.SAME || sp.strength === S.MANUAL || sp.basis.startsWith("다른 해"))) found.add(sp.pid);
        }
        if (found.size) how = "다른 해 같은 팀";
      }
      if (!found.size) {
        const raw = parseRow(r.year, r.mok, r.position).raw;
        const pos = cleanPos(r.position);
        for (const s of byName.get(nk) ?? []) {
          if (Math.abs(s.year - r.year) !== 1 || !raw) continue;
          if (parseRow(s.year, s.mok, s.position).raw !== raw || cleanPos(s.position) !== pos) continue;
          const sp = pick.get(s.id)!;
          if (sp.pid !== null && isAnchor(sp)) found.add(sp.pid);
        }
        if (found.size) how = "다른 해 같은 목장";
      }
      if (found.size !== 1) continue;
      const pid = [...found][0];
      if (!allowed.has(pid)) continue;                          // 빼기를 통과한 분이어야 한다
      if (cur.pid === pid) continue;                             // 이미 그분 — 근거는 그대로
      pick.set(r.id, { pid, basis: how, reason: "", strength: S.CROSS, notes: cur.notes, cands: cur.cands });
      changed++;
    }
    if (!changed) break;
  }

  // 오타(설계 §4.5) — 「교인명부에 같은 이름이 없음」 교구 줄만
  const anchoredTeams = new Map<number, Set<string>>();       // 교인ID → 붙은 팀(해 포함)
  for (const r of rows) {
    const p = pick.get(r.id)!;
    if (p.pid === null || !isAnchor(p)) continue;
    const s = anchoredTeams.get(p.pid) ?? new Set<string>(); s.add(`${r.year}|${teamKey(r.team)}`); anchoredTeams.set(p.pid, s);
  }
  for (const r of auto) {
    const cur = pick.get(r.id)!;
    if (cur.pid !== null || cur.reason !== R_NONE) continue;
    const a = parseRow(r.year, r.mok, r.position);
    if (a.kind !== "교구" || (a.mok === null && !a.men)) continue;
    const k = hKey(r.name);
    const tk = teamKey(r.team);
    const near = (ctx.byGu.get(a.gu) ?? []).filter((c) => {
      if (c.key.length !== k.length || kidAt(c, r.year) || !sameAffil(c, a, r.year)) return false;
      let diff = 0;
      for (let i = 0; i < k.length; i++) if (c.key[i] !== k[i]) diff++;
      if (diff !== 1) return false;
      const teams = anchoredTeams.get(c.person_id);
      if (!teams) return false;
      const other = [...teams].some((t) => t.endsWith(`|${tk}`) && !t.startsWith(`${r.year}|`));
      return other && !teams.has(`${r.year}|${tk}`);
    });
    if (near.length === 1 && !excluded(near[0], r, a, cleanPos(r.position), [])) {
      pick.set(r.id, { pid: near[0].person_id, basis: "이름 한 글자 다름(오타로 봄)", reason: "", strength: S.ONLY, notes: cur.notes, cands: near });
    }
  }

  // 같은 해 같은 줄 사람 — 오타로 붙은 줄과 해·이름·목장 글자·직분이 같은데 같은 이름이 명부에 없던 줄(팀 이름이 바뀌어 오타 규칙이 못 본 줄)
  const sameRowPerson = (r: HRow): string => `${r.year}|${hKey(r.name)}|${parseRow(r.year, r.mok, r.position).raw}|${cleanPos(r.position)}`;
  const typoBy = new Map<string, Set<number>>();
  for (const r of auto) {
    const p = pick.get(r.id)!;
    if (p.pid !== null && p.basis === "이름 한 글자 다름(오타로 봄)") {
      const k = sameRowPerson(r); const s = typoBy.get(k) ?? new Set<number>(); s.add(p.pid); typoBy.set(k, s);
    }
  }
  for (const r of auto) {
    const p = pick.get(r.id)!;
    if (p.pid !== null || p.reason !== R_NONE) continue;
    const s = typoBy.get(sameRowPerson(r));
    if (s && s.size === 1) pick.set(r.id, { ...p, pid: [...s][0], basis: "이름 한 글자 다름(오타로 봄) · 같은 해 다른 팀 줄과 같은 분", reason: "", strength: S.ONLY });
  }

  // 같은 해 겹침(설계 §4.6) — 다른 교구(또는 어른/청년)인 줄이 한 분으로 모이면 약한 쪽을 비운다
  const sig = (r: HRow): string | null => {
    const a = parseRow(r.year, r.mok, r.position);
    if (a.kind === "교구") return a.gu;
    if (a.kind === "모름") return null;
    return a.kind;
  };
  const byYearPid = new Map<string, HRow[]>();
  for (const r of rows) {
    const p = pick.get(r.id)!;
    if (p.pid === null) continue;
    const k = `${r.year}|${p.pid}`;
    const l = byYearPid.get(k); if (l) l.push(r); else byYearPid.set(k, [r]);
  }
  for (const list of byYearPid.values()) {
    const sigs = new Set(list.map(sig).filter((s): s is string => s !== null));
    if (sigs.size <= 1) continue;
    const best = new Map<string, number>();
    for (const r of list) { const s = sig(r); if (s !== null) best.set(s, Math.max(best.get(s) ?? 0, pick.get(r.id)!.strength)); }
    const top = Math.max(...best.values());
    const winners = [...best.entries()].filter(([, v]) => v === top).map(([s]) => s);
    for (const r of list) {
      const s = sig(r);
      const p = pick.get(r.id)!;
      if (s === null || r.link_how !== "auto") continue;
      if (winners.length > 1 || s !== winners[0]) pick.set(r.id, { ...p, pid: null, basis: "", reason: R_CLASH, strength: S.NONE });
    }
  }

  // 결과 — 메모(목장 오타·영문자·괄호·기쁨-1·학생으로 봄)는 근거 뒤에 · 로, 사유 뒤에는 ( ) 로
  return rows.map((r) => {
    const p = pick.get(r.id)!;
    if (r.link_how !== "auto") return { id: r.id, person_id: r.person_id, match_basis: p.basis, match_reason: p.reason };
    const extra = [...new Set(p.notes)].join(" · ");
    return p.pid !== null
      ? { id: r.id, person_id: p.pid, match_basis: p.basis + (extra ? " · " + extra : ""), match_reason: "" }
      : { id: r.id, person_id: null, match_basis: "", match_reason: p.reason + (extra ? ` (${extra})` : "") };
  });
}

// ── 사람이 잇기·풀기(설계 §7 — 사역 이력 메뉴와 교인명부 자세히 창이 함께 쓴다) ───────────────────────
export function historyLinkPatch(personId: number | null, memberId: string | null, nowIso: string) {
  return {
    person_id: personId, link_how: personId ? "manual" : "none", linked_by: memberId, linked_at: nowIso,
    match_basis: personId ? "사람이 이음" : "", match_reason: personId ? "" : R_MANUAL_NONE, updated_at: nowIso,
  };
}
export function historyUnlinkPatch(nowIso: string) {
  return { link_how: "auto", linked_by: null, linked_at: null, updated_at: nowIso };
}

// ── 서버가 쓰는 도우미(history-db.ts) ───────────────────────────────────
// church_people 에서 읽는 칸 — 맞춤에 쓰는 것만(연락처·주소·사진은 읽지 않는다)
export const HISTORY_PEOPLE_COLS =
  "person_id,name,gender,kind2,mok1,mok3,school_dept,position,position_detail,birth,birth_date,registered,registered_date,household_id";
const yearOf = (s: unknown): number | null => {
  const m = /^(\d{4})/.exec(nfc(s));
  return m && m[1] !== "0000" ? Number(m[1]) : null;
};
const monthOf = (s: unknown): number | null => {
  const m = /^\d{4}-(\d{2})/.exec(nfc(s));
  return m ? Number(m[1]) : null;
};
// church_people 한 줄 → HPerson(생년·등록은 날짜 칸이 있으면 그것, 없으면 원본 글자의 앞 네 자리 · 「0000」은 모름)
export function toHPerson(r: any): HPerson {
  return {
    person_id: Number(r?.person_id), name: nfc(r?.name), gender: nfc(r?.gender), kind2: nfc(r?.kind2),
    mok1: nfc(r?.mok1), mok3: nfc(r?.mok3), school_dept: nfc(r?.school_dept),
    position: nfc(r?.position), position_detail: nfc(r?.position_detail),
    birth_year: yearOf(r?.birth_date) ?? yearOf(r?.birth), birth_month: monthOf(r?.birth_date) ?? monthOf(r?.birth),
    reg_year: yearOf(r?.registered_date) ?? yearOf(r?.registered),
    household: Number(r?.household_id) > 0 ? String(Number(r.household_id)) : "",
  };
}
// 후보 목록의 지문 — 화면에 보인 글자(이름·소속·직분·교적 목장)로만 만든다(교인ID 를 넣지 않는다 — 사역신청 역할에게 가는 값이라
//   교인ID 로 만들면 몇 안 되는 후보의 ID 를 거꾸로 찾아낼 수 있다). FNV-1a 32비트 · 16진 8자리.
export function candFp(lines: string[]): string {
  let h = 0x811c9dc5;
  const s = lines.join("\n");
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}
// 근거가 약한 맞춤 — 화면의 「△ 확인」·「근거 약한 줄만」(history-logic.js WEAK_RE 와 같은 글 · 시험이 맞댄다)
export const WEAK_RE = /^(같은 교구|이름이 한 분뿐|직분으로 가림\(소속 다름\)|가족이 같은 해 같은 목장\(소속 다름\)|다른 해|이름 한 글자 다름)/;
// 같은 이름의 명부 열쇠들 — church_people.name_key(NFC·띄어쓰기 없음 · 끝 영문자는 원본 그대로)로 물을 것
export function nameKeyVariants(name: unknown): string[] {
  const k = hKey(name);
  const base = stripSuffix(k);
  const out = new Set<string>([k, base, stripParen(k)]);
  for (const c of ["A", "B", "C", "D"]) { out.add(base + c); out.add(base + c.toLowerCase()); }
  if (hasSuffix(k)) out.add(base + k.slice(-1).toLowerCase());
  return [...out].filter(Boolean);
}
```

- [ ] **Step 4: 시험이 통과하는지 본다**

Run: `node --experimental-strip-types --test tests/history-match.test.mjs`
Expected: `# pass 21` · `# fail 0`

- [ ] **Step 5: 커밋**

```bash
git add supabase/functions/church-admin/history-match.ts tests/history-match.test.mjs
git commit -m "feat(사역이력): 맞춤 규칙 history-match.ts — 빼기 여섯·차례 다섯·다른 해 같은 팀·오타·같은 해 겹침 · 잇기 모양(교인명부 세션 약속)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: 이 PC 대조 도구 — 진짜 데이터로 규칙 확인(커밋은 스크립트만)

**Files:**
- Create: `tools/history/check_real.py` · `tools/history/check_real.mjs`

**Interfaces:**
- Consumes: Task 2 의 `matchAll`.
- 읽는 것(저장소 밖): `C:\Projects\church-admin\Data\2022-2026_사역임명_통합.xlsx` · `C:\Projects\교인목록_2026_09_29_정리.xlsx`. JSON 은 임시 폴더에 두고 지운다.

- [ ] **Step 1: `tools/history/check_real.py`**

```python
"""사역 이력 맞춤 규칙 대조 — 이 PC 에서만(진짜 명부·명단 · 2026-10-01).

  python tools/history/check_real.py [명단 엑셀] [교인명부 정리 엑셀]
    기본: C:/Projects/church-admin/Data/2022-2026_사역임명_통합.xlsx · C:/Projects/교인목록_2026_09_29_정리.xlsx

history-match.ts(서버와 같은 파일)를 진짜 데이터로 돌려 **수만** 찍고, 2026-10-01 독립 검증이 짚은 줄(엑셀 줄 번호)이
기대대로인지 본다. 이름·교인ID 는 찍지 않는다. 명부·명단을 옮긴 JSON 은 저장소 밖 임시 폴더에 두고 끝나면 지운다.
⚠️ 가족 근거는 이 도구만 「신앙세대주 이름 + 주소」로 묶는다(정리 엑셀에 세대주 교인ID 가 없다) — 서버는 household_id 다.
   그래서 운영 결과와 한두 줄 다를 수 있다. 기대값(4,042 / 51)은 2026-09-29 명부 기준이다.
"""
import json, os, re, shutil, subprocess, sys, tempfile, unicodedata
import openpyxl

ROSTER = sys.argv[1] if len(sys.argv) > 1 else r"C:\Projects\church-admin\Data\2022-2026_사역임명_통합.xlsx"
DIRECTORY = sys.argv[2] if len(sys.argv) > 2 else r"C:\Projects\교인목록_2026_09_29_정리.xlsx"
HERE = os.path.dirname(os.path.abspath(__file__))


def nfc(v):
    return unicodedata.normalize("NFC", "" if v is None else str(v)).strip()


def year_of(v):
    m = re.match(r"(\d{4})", nfc(v))
    return int(m.group(1)) if m and m.group(1) != "0000" else None


def month_of(v):
    m = re.match(r"\d{4}-(\d{2})", nfc(v))
    return int(m.group(1)) if m else None


def people():
    ws = openpyxl.load_workbook(DIRECTORY, read_only=True, data_only=True)["교인목록"]
    it = ws.iter_rows(values_only=True)
    ix = {h: i for i, h in enumerate(next(it))}
    out = []
    for r in it:
        if r[ix["교인ID"]] is None:
            continue
        head = nfc(r[ix["신앙세대주"]])
        out.append(dict(person_id=int(r[ix["교인ID"]]), name=nfc(r[ix["이름"]]), gender=nfc(r[ix["성별"]]), kind2=nfc(r[ix["교인구분2"]]),
                        mok1=nfc(r[ix["목장1"]]), mok3=nfc(r[ix["목장3"]]), school_dept=nfc(r[ix["교회학교부서"]]),
                        position=nfc(r[ix["직분"]]), position_detail=nfc(r[ix["직분상세"]]),
                        birth_year=year_of(r[ix["생년월일"]]), birth_month=month_of(r[ix["생년월일"]]), reg_year=year_of(r[ix["등록일"]]),
                        household=(head + "|" + nfc(r[ix["주소"]])) if head else ""))
    return out


def rows():
    ws = openpyxl.load_workbook(ROSTER, read_only=True, data_only=True).worksheets[0]
    it = ws.iter_rows(values_only=True)
    ix = {nfc(h): i for i, h in enumerate(next(it))}
    get = lambda r, k: nfc(r[ix[k]]) if k in ix and ix[k] < len(r) else ""
    out = []
    for n, r in enumerate(it, start=2):                     # 엑셀 줄 번호(머리 = 1)
        out.append(dict(id=n, year=int(get(r, "년도")), committee=get(r, "부서"), team=get(r, "팀명"), name=get(r, "이름"),
                        position=get(r, "직분"), mok=get(r, "목장"), renewal=get(r, "신규 / 유지"), link_how="auto", person_id=None))
    return out


def main():
    tmp = tempfile.mkdtemp(prefix="history-check-")       # 저장소 밖
    try:
        json.dump(people(), open(os.path.join(tmp, "people.json"), "w", encoding="utf-8"), ensure_ascii=False)
        json.dump(rows(), open(os.path.join(tmp, "rows.json"), "w", encoding="utf-8"), ensure_ascii=False)
        r = subprocess.run(["node", "--experimental-strip-types", "--no-warnings", os.path.join(HERE, "check_real.mjs"), tmp])
        sys.exit(r.returncode)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: `tools/history/check_real.mjs`**

```js
// 사역 이력 대조의 Node 쪽 — check_real.py 가 임시 폴더(people.json·rows.json)를 넘긴다. 수와 줄 번호만 찍는다.
import { readFileSync } from "node:fs";
import path from "node:path";
import { matchAll } from "../../supabase/functions/church-admin/history-match.ts";

const dir = process.argv[2];
const people = JSON.parse(readFileSync(path.join(dir, "people.json"), "utf8"));
const rows = JSON.parse(readFileSync(path.join(dir, "rows.json"), "utf8"));
const res = matchAll(rows, people);
const by = new Map(res.map((r) => [r.id, r]));
const pid = (n) => by.get(n)?.person_id ?? null;

const got = res.filter((r) => r.person_id !== null).length;
console.log(`줄 ${rows.length} · 교적 이어짐 ${got} · 못 맞춤 ${rows.length - got}   (2026-09-29 명부 기대값: 4,042 · 51)`);
const cnt = new Map();
for (const r of res) {
  const k = (r.person_id !== null ? "✓ " + r.match_basis : "— " + r.match_reason).replace(/\d+명/, "N명");
  cnt.set(k, (cnt.get(k) ?? 0) + 1);
}
for (const [k, v] of [...cnt.entries()].sort((a, b) => b[1] - a[1])) console.log(String(v).padStart(5), k);

// 2026-10-01 독립 검증이 짚은 줄(통합 엑셀 2022-2026_사역임명_통합.xlsx 의 줄 번호) — 통합 엑셀이 아니면 건너뛴다
if (rows.length === 4093) {
  const expect = [];
  const same = (l, a, b) => expect.push([l, pid(a) !== null && pid(a) === pid(b)]);
  const blank = (l, n) => expect.push([l, pid(n) === null]);
  const filled = (l, n) => expect.push([l, pid(n) !== null]);
  blank("2032 권사→남자 — 비움", 2032);
  for (const n of [3801, 3802, 3803]) expect.push([`${n} 약한 근거로만(사람 확인)`, pid(n) === null || /같은 교구|이름이 한 분/.test(by.get(n).match_basis)]);
  same("981 → 2807 의 분", 981, 2807); same("1755 → 2807 의 분", 1755, 2807);
  for (const n of [1181, 1182, 1183, 1815]) same(`${n} → 2881 의 분`, n, 2881);
  blank("490 안수집사→직분 없는 36세 — 비움", 490);
  same("2365 고등부 → 3324 의 분", 2365, 3324);
  for (const n of [1296, 1297, 1298, 1299, 1300, 1301, 2112, 567, 3385]) filled(`${n} 같은 해 목장 차이 — 되살림`, n);
  for (const n of [3219, 3252, 3325]) filled(`${n} 또래`, n);
  for (const n of [436, 1086, 1087, 1491, 2052, 2053, 2460]) same(`${n} → 3436 의 분`, n, 3436);
  for (const n of [298, 277, 282, 835, 1654, 3965, 3966]) filled(`${n} 다른 해 이음`, n);
  for (const n of [95, 216, 274, 389, 456, 458, 613, 876, 942, 943, 2092, 2159]) filled(`${n} 오타`, n);
  for (const n of [121, 1687, 1688, 2708, 204, 205, 587, 2782, 3832, 3833]) filled(`${n} 가족`, n);
  for (const n of [403, 259, 792, 2153]) blank(`${n} 비워 둠`, n);
  const bad = expect.filter(([, ok]) => !ok);
  console.log(`검증 지적 ${expect.length}줄 중 기대대로 ${expect.length - bad.length}`);
  for (const [l] of bad) console.log("  ✗", l);
  process.exitCode = bad.length ? 1 : 0;
}
```

- [ ] **Step 3: 돌린다**

Run: `PYTHONIOENCODING=utf-8 python tools/history/check_real.py`
Expected: 첫 줄 `줄 4093 · 교적 이어짐 4042 · 못 맞춤 51` · 끝 줄 `검증 지적 64줄 중 기대대로 64` · 종료 코드 0. (수와 사유 문구만 찍힌다 — 이름·교인ID 가 보이면 멈추고 고친다.)

- [ ] **Step 4: 커밋(스크립트만 — 데이터 파일 없음)**

```bash
git status --short          # Data/ 가 안 보여야 한다(.gitignore)
git add tools/history/check_real.py tools/history/check_real.mjs
git commit -m "feat(사역이력): 이 PC 대조 도구 — 진짜 명부·통합 엑셀로 맞춤 수와 검증 지적 64줄(수만 · 임시 폴더는 지운다)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: 표 쪽 `history-db.ts` · 권한 · `index.ts` 연결

**Files:**
- Create: `supabase/functions/church-admin/history-db.ts`
- Test: `tests/history-db.test.mjs`
- Modify: `supabase/functions/church-admin/authz.ts`(ACTION_ROLES 끝) · `tests/authz.test.mjs`(ministry 목록) · `supabase/functions/church-admin/index.ts`(세 곳)

**Interfaces:**
- Consumes: Task 2 의 모든 내보내기 · `events-person.ts` `personLabel` · `events-people.ts` `positionFromChurch`·`churchMok`.
- Produces:
  - `makeHistory({db, audit})` → `{ list, upload(ctx,b,save), rowAdd, rowSave, rowDelete, candidates, link, rematch, exportRows }` — 각 `(ctx: {member:{id}|null, roles:string[]}, b) → Promise<object>`
  - `rematchHistoryRows(db, ids: number[] | null) → {changed, linked, total, noDirectory?}` (교인명부 세션이 import)
  - `tidyHistoryRow(x) → {row, error}` · `rowOut(r, full)` · `HISTORY_MAX_UPLOAD = 3000` · `HISTORY_FIELD_MAX = 100` · `HISTORY_EDIT_KEYS`
  - 오류 코드: `bad-year` · `no-name` · `history-too-long` · `note-too-long` · `history-too-many` · `history-exists` · `not-found` · `conflict` · `invalid` · `candidates-changed` · `needs-confirm` · `no-directory`
  - 기록: `history.upload`(target 올린 기록 id · detail `{years, rows, total, add, same, deleted, dup, bad, saved, failed, linked, unlinked, changed}`) · `history.add`·`history.delete`(`{year}`) · `history.edit`(`{year, fields}`) · `history.link`(`{op, year, by:"ministry"}`) · `history.rematch`(`{changed, linked, total}`) · `history.export`(`{count, years}`) · `people.lookup`(`{q, count, from:"history"}`)

- [ ] **Step 1: 시험 `tests/history-db.test.mjs`**

```js
// 사역 이력 — 표 쪽(history-db.ts)의 순수한 부분: 줄 다듬기·검사 · 응답 칸 지도(교인ID 가리기) · 쓰지 않고 끝나는 입력
import { test } from "node:test";
import assert from "node:assert/strict";
import { tidyHistoryRow, rowOut, makeHistory, HISTORY_FIELD_MAX } from "../supabase/functions/church-admin/history-db.ts";

test("tidyHistoryRow — 해·이름 검사 · 칸 다듬기(NFC·빈칸 접기)", () => {
  assert.equal(tidyHistoryRow({ year: 1900, name: "가" }).error, "bad-year");
  assert.equal(tidyHistoryRow({ year: "2024", name: "  " }).error, "no-name");
  const t = tidyHistoryRow({ year: "2024", name: "가나다".normalize("NFD"), team: "  가브리엘   찬양대 ", mok: "기쁨-19" });
  assert.equal(t.error, "");
  assert.deepEqual([t.row.year, t.row.name, t.row.team, t.row.mok, t.row.position], [2024, "가나다", "가브리엘 찬양대", "기쁨-19", ""]);
  assert.equal(tidyHistoryRow({ year: 2024, name: "가", team: "x".repeat(HISTORY_FIELD_MAX + 1) }).error, "history-too-long");
  assert.equal(tidyHistoryRow({ year: 2024, name: "가", src_note: "x".repeat(501) }).error, "note-too-long");
});

test("rowOut — 사역신청 역할에게는 교인ID 가 없다 · 교인명부·총괄에게만", () => {
  const r = { id: 3, year: 2024, committee: "찬양부", team: "가", role_title: "", name: "가나다", position: "집사", mok: "기쁨-19",
    renewal: "유지", src_note: "", person_id: 12345, link_how: "auto", match_basis: "같은 교구(목장 다름)", match_reason: "",
    source: "excel", updated_at: "t" };
  const basic = rowOut(r, false), full = rowOut(r, true);
  assert.equal("person_id" in basic, false);
  assert.equal(JSON.stringify(basic).includes("12345"), false);
  assert.equal(full.person_id, 12345);
  assert.deepEqual([basic.linked, basic.weak], [true, true]);
});

test("쓰지 않고 끝나는 입력 — 빈 올리기 · 확인 없는 다시 맞추기 · 없는 줄", async () => {
  const touched = [];
  const db = { from: (t) => { touched.push(t); throw new Error("표를 건드리면 안 된다: " + t); }, rpc: () => { throw new Error("rpc"); } };
  const audits = [];
  const H = makeHistory({ db, audit: async (...a) => audits.push(a) });
  const ctx = { member: { id: "m" }, roles: ["ministry"] };
  assert.equal((await H.upload(ctx, { rows: [] }, true)).saved, 0);
  assert.equal((await H.upload(ctx, { rows: [] }, false)).ok, true);
  assert.equal((await H.rematch(ctx, {})).error, "needs-confirm");
  assert.equal((await H.rowSave(ctx, { id: 0 })).error, "not-found");
  assert.equal((await H.rowDelete(ctx, { id: 0 })).error, "not-found");
  assert.equal((await H.rowAdd(ctx, { row: {} })).error, "bad-year");
  assert.equal((await H.upload(ctx, { rows: new Array(3001).fill({}) }, false)).error, "history-too-many");
  assert.deepEqual([touched, audits], [[], []]);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --experimental-strip-types --test tests/history-db.test.mjs`
Expected: FAIL — `Cannot find module …/history-db.ts`

- [ ] **Step 3: `supabase/functions/church-admin/history-db.ts`**

```ts
// 사역 이력 — 표를 읽고 쓰는 쪽(서버 · 2026-10-01 · 설계 v2 docs/superpowers/specs/2026-10-01-church-admin-ministry-history-design.md §3·§5·§6·§7)
//   규칙은 history-match.ts(순수), 여기는 표 읽기·쓰기·응답 모양. index.ts 의 switch 가 makeHistory(...) 의 함수를 부른다.
// ⚠️ npm import 를 두지 않는다 — db(supabase 클라이언트)를 받아 쓴다(Node 시험·교인명부 세션이 이 파일을 import 한다).
// ⚠️ 응답은 칸 지도(rowOut·candOut)로만. person_id 는 full(교인명부·총괄 역할)일 때만 싣는다 — 사역신청 역할에게는 없다.
// ⚠️ 기록(audit) detail 에 이름·교인ID 를 싣지 않는다(줄 id·해·수만). people.lookup 만 이름(q)을 싣는다(교인명부 기록 · 다른 화면과 같다).
// 교인명부 세션(자세히 창 「이분 것」)이 쓰는 것: rematchHistoryRows(db, ids) · history-match.ts 의 historyLinkPatch·historyUnlinkPatch.
import { matchAll, srcKey, hKey, teamKey, historyLinkPatch, historyUnlinkPatch, toHPerson, candFp, nameKeyVariants,
  HISTORY_PEOPLE_COLS, WEAK_RE, nfc } from "./history-match.ts";
import type { HRow, HPerson } from "./history-match.ts";
import { personLabel } from "./events-person.ts";
import { positionFromChurch, churchMok } from "./events-people.ts";

export const HISTORY_MAX_UPLOAD = 3000;      // 한 번에 받는 줄(화면은 해마다 나눠 보낸다 · 통합 파일 4,093줄)
export const HISTORY_FIELD_MAX = 100;        // 부서·팀·이름·직분·목장·직책·신규/유지 칸
export const HISTORY_NOTE_MAX = 500;         // 원본 메모
export const HISTORY_LIST_PAGE = 100;
const PAGE = 1000;
const ROW_COLS = "id,year,committee,team,role_title,name,position,mok,renewal,src_note,person_id,link_how,match_basis,match_reason,source,source_file,linked_at,updated_at";
const MATCH_COLS = "id,year,committee,team,name,position,mok,renewal,link_how,person_id,match_basis,match_reason,updated_at";
const TEXT_KEYS = ["committee", "team", "role_title", "name", "position", "mok", "renewal"] as const;
export const HISTORY_EDIT_KEYS = ["year", ...TEXT_KEYS, "src_note"] as const;

type Db = any;
export type HCtx = { member: { id: string } | null; roles: string[] };
type Audit = (ctx: any, action: string, target: string, detail?: Record<string, unknown>) => Promise<void>;

async function all(build: () => any): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0, guard = 0; guard < 200; guard++) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw error;
    const got = (data ?? []) as any[];
    if (!got.length) return out;
    out.push(...got);
    from += got.length;
  }
  throw new Error("too-many-pages");
}

const isFull = (ctx: HCtx): boolean => ctx.roles.includes("directory") || ctx.roles.includes("super");
const cut = (s: unknown, n: number): string => nfc(s).replace(/\s+/g, " ").slice(0, n);

// 줄 하나 다듬기·검사(올리기·한 줄 더하기·고치기가 함께 쓴다) — 오류는 코드 하나
export function tidyHistoryRow(x: any): { row: Record<string, any> | null; error: string } {
  const year = Number(x?.year);
  if (!Number.isInteger(year) || year < 1950 || year > 2100) return { row: null, error: "bad-year" };
  const row: Record<string, any> = { year };
  for (const k of TEXT_KEYS) row[k] = cut(x?.[k], HISTORY_FIELD_MAX + 1);
  row.src_note = cut(x?.src_note, HISTORY_NOTE_MAX + 1);
  if (!row.name) return { row: null, error: "no-name" };
  if (TEXT_KEYS.some((k) => row[k].length > HISTORY_FIELD_MAX)) return { row: null, error: "history-too-long" };
  if (row.src_note.length > HISTORY_NOTE_MAX) return { row: null, error: "note-too-long" };
  return { row, error: "" };
}

export function rowOut(r: any, full: boolean) {
  const o: Record<string, unknown> = {
    id: Number(r.id), year: r.year, committee: r.committee, team: r.team, role_title: r.role_title, name: r.name,
    position: r.position, mok: r.mok, renewal: r.renewal, src_note: r.src_note,
    linked: r.person_id !== null && r.person_id !== undefined, link_how: r.link_how,
    match_basis: r.match_basis, match_reason: r.match_reason, weak: !!r.match_basis && WEAK_RE.test(r.match_basis),
    source: r.source, updated_at: r.updated_at,
  };
  if (full) o.person_id = r.person_id ?? null;
  return o;
}

async function hasDirectory(db: Db): Promise<boolean> {
  const { count, error } = await db.from("church_people").select("person_id", { count: "exact", head: true });
  if (error) throw error;
  return (count ?? 0) > 0;
}
async function loadPeople(db: Db): Promise<HPerson[]> {
  const rows = await all(() => db.from("church_people").select(HISTORY_PEOPLE_COLS).order("person_id", { ascending: true }));
  return rows.map(toHPerson);
}
async function loadHistory(db: Db): Promise<any[]> {
  return all(() => db.from("ministry_history").select(MATCH_COLS).is("deleted_at", null).order("id", { ascending: true }));
}
const asHRow = (r: any): HRow => ({
  id: Number(r.id), year: r.year, committee: r.committee, team: r.team, name: r.name, position: r.position, mok: r.mok,
  renewal: r.renewal, link_how: r.link_how, person_id: r.person_id ?? null,
});

// 다시 맞추기 — ids 가 null 이면 auto 줄 전부, 아니면 그 줄들만 고친다(계산은 늘 모든 해를 함께 — 다른 해 줄이 근거다 · 설계 §3.3)
//   명부가 비었으면(올린 적 없음) 아무것도 고치지 않는다 — 맞춘 것을 모두 지우지 않게.
export async function rematchHistoryRows(db: Db, ids: number[] | null): Promise<{ changed: number; linked: number; total: number; noDirectory?: boolean }> {
  if (!(await hasDirectory(db))) return { changed: 0, linked: 0, total: 0, noDirectory: true };
  const [rows, people] = await Promise.all([loadHistory(db), loadPeople(db)]);
  const res = matchAll(rows.map(asHRow), people);
  const want = ids ? new Set(ids.map(Number)) : null;
  const byId = new Map(rows.map((r) => [Number(r.id), r]));
  const patches: any[] = [];
  for (const x of res) {
    const r = byId.get(x.id)!;
    if (r.link_how !== "auto" || (want && !want.has(x.id))) continue;
    if ((r.person_id ?? null) === x.person_id && r.match_basis === x.match_basis && r.match_reason === x.match_reason) continue;
    patches.push({ id: x.id, expect: r.updated_at, person_id: x.person_id, match_basis: x.match_basis, match_reason: x.match_reason });
  }
  let changed = 0;
  for (let i = 0; i < patches.length; i += 500) {
    const { data, error } = await db.rpc("ministry_history_apply", { p: patches.slice(i, i + 500) });
    if (error) throw error;
    changed += Number(data) || 0;
  }
  const linked = res.filter((x) => x.person_id !== null).length;
  return { changed, linked, total: res.length };
}

// 같은 이름의 명부 후보(창 · 고르기) — person_id 차례. 화면 글자(이름·소속·직분·교적 목장)로 지문을 만든다.
async function candidatesFor(db: Db, row: any) {
  // postgrest .in() 은 " \ , ( ) 를 이스케이프하지 않는다 — 그런 열쇠는 묻지 않는다(괄호 든 이름은 괄호 뗀 열쇠로 묻는다)
  const keys = nameKeyVariants(row.name).filter((k) => !/["\\,()]/.test(k));
  if (!keys.length) return { list: [], fp: candFp([]) };
  const people = await all(() => db.from("church_people").select(HISTORY_PEOPLE_COLS + ",name_key")
    .in("name_key", keys).order("person_id", { ascending: true }));
  const tk = teamKey(row.team);
  const ids = people.map((p) => Number(p.person_id));
  const served = new Map<number, number>();
  if (ids.length) {
    const hist = await all(() => db.from("ministry_history").select("id,year,team,person_id")
      .in("person_id", ids).is("deleted_at", null).order("id", { ascending: true }));
    for (const h of hist) if (h.year !== row.year && teamKey(h.team) === tk) served.set(h.person_id, (served.get(h.person_id) ?? 0) + 1);
  }
  const list = people.map((p) => ({
    person_id: Number(p.person_id), name: nfc(p.name), label: personLabel(p), position: positionFromChurch(p),
    church_mok: churchMok(p), served: served.get(Number(p.person_id)) ?? 0,
  }));
  const fp = candFp(list.map((c) => [c.name, c.label, c.position, c.church_mok].join("|")));
  return { list, fp };
}
const candOut = (c: any, full: boolean, current: number | null) => {
  const o: Record<string, unknown> = { name: c.name, label: c.label, position: c.position, church_mok: c.church_mok,
    served: c.served, current: current !== null && c.person_id === current };
  if (full) o.person_id = c.person_id;
  return o;
};

async function readRow(db: Db, id: number) {
  const { data, error } = await db.from("ministry_history").select(ROW_COLS + ",deleted_at").eq("id", id).maybeSingle();
  if (error) throw error;
  return data && !data.deleted_at ? data : null;
}
const outOrNull = (r: any, full: boolean) => (r ? rowOut(r, full) : null);
const idOf = (v: unknown): number => { const n = Number(v) || 0; return Number.isSafeInteger(n) && n > 0 ? n : 0; };

// 올리기 판정(살펴보기·넣기 공용) — 새 줄 · 이미 있음 · 빼 둔 줄과 같음 · 파일 안 겹침 · 틀림
async function judgeUpload(db: Db, raws: unknown[]) {
  const items = raws.map((x, i) => {
    const t = tidyHistoryRow(x);
    return { i, row: t.row, error: t.error, key: t.row ? srcKey(t.row as any) : "", mark: t.row ? "add" : "bad" };
  });
  const years = [...new Set(items.filter((x) => x.row).map((x) => x.row!.year))];
  const existing = new Map<string, boolean>();          // src_key → 빼 둔 줄인가
  if (years.length) {
    const rows = await all(() => db.from("ministry_history").select("id,src_key,deleted_at").in("year", years).order("id", { ascending: true }));
    for (const r of rows) existing.set(r.src_key, !!r.deleted_at);
  }
  const seen = new Set<string>();
  for (const x of items) {
    if (!x.row) continue;
    if (existing.has(x.key)) x.mark = existing.get(x.key) ? "deleted" : "same";
    else if (seen.has(x.key)) x.mark = "dup";
    seen.add(x.key);
  }
  const counts = { total: items.length, add: 0, same: 0, deleted: 0, dup: 0, bad: 0 };
  for (const x of items) (counts as any)[x.mark]++;
  return { items, years, counts };
}
const reasonKey = (s: string): string => s.replace(/\d+명/, "N명").replace(/ \(.*\)$/, "");

export function makeHistory({ db, audit }: { db: Db; audit: Audit }) {
  async function list(ctx: HCtx, b: any) {
    const full = isFull(ctx);
    const rows = await all(() => db.from("ministry_history").select(ROW_COLS).is("deleted_at", null).order("id", { ascending: true }));
    const yearsAll = new Map<number, { year: number; total: number; linked: number; none: number; weak: number }>();
    for (const r of rows) {
      const y = yearsAll.get(r.year) ?? { year: r.year, total: 0, linked: 0, none: 0, weak: 0 };
      y.total++;
      if (r.person_id !== null) { y.linked++; if (r.match_basis && WEAK_RE.test(r.match_basis)) y.weak++; } else y.none++;
      yearsAll.set(r.year, y);
    }
    const years = Array.isArray(b.years) ? b.years.map(Number).filter(Number.isInteger) : [];
    const q = cut(b.q, 40).replace(/\s+/g, "");
    const only = b.only === "none" || b.only === "weak" ? b.only : "";
    let hit = rows.filter((r) => !years.length || years.includes(r.year));
    if (only === "none") hit = hit.filter((r) => r.person_id === null);
    if (only === "weak") hit = hit.filter((r) => r.person_id !== null && r.match_basis && WEAK_RE.test(r.match_basis));
    if (q) hit = hit.filter((r) => hKey(r.name).includes(hKey(q)) || nfc(r.team).replace(/\s+/g, "").includes(q) ||
      nfc(r.committee).replace(/\s+/g, "").includes(q));
    hit.sort((a, b2) => b2.year - a.year || String(a.committee).localeCompare(b2.committee, "ko") ||
      String(a.team).localeCompare(b2.team, "ko") || String(a.name).localeCompare(b2.name, "ko") || a.id - b2.id);
    const page = Math.max(0, Math.floor(Number(b.page) || 0));
    const shown = hit.slice(page * HISTORY_LIST_PAGE, (page + 1) * HISTORY_LIST_PAGE);
    return { ok: true, full, rows: shown.map((r) => rowOut(r, full)), total: hit.length, page, pageSize: HISTORY_LIST_PAGE,
      years: [...yearsAll.values()].sort((a, b2) => b2.year - a.year) };
  }

  async function upload(ctx: HCtx, b: any, save: boolean) {
    const raws: unknown[] = Array.isArray(b.rows) ? b.rows : [];
    if (raws.length > HISTORY_MAX_UPLOAD) return { ok: false, error: "history-too-many" };
    if (!raws.length) return { ok: true, counts: { total: 0, add: 0, same: 0, deleted: 0, dup: 0, bad: 0 }, bad: [], saved: 0, failed: 0 };
    const fileName = cut(b.file_name, 200);
    const j = await judgeUpload(db, raws);
    const bad = j.items.filter((x) => x.mark === "bad").slice(0, 50).map((x) => ({ i: x.i, error: x.error }));
    const adds = j.items.filter((x) => x.mark === "add");
    if (!save) {
      // 미리보기 — 새 줄을 지금 표와 함께 맞춰 본다(쓰지 않는다)
      let preview = { linked: 0, unlinked: 0, reasons: [] as [string, number][] };
      if (adds.length && (await hasDirectory(db))) {
        const [rows, people] = await Promise.all([loadHistory(db), loadPeople(db)]);
        const temp: HRow[] = adds.map((x, n) => ({ id: -(n + 1), ...(x.row as any), link_how: "auto", person_id: null }));
        const res = matchAll([...rows.map(asHRow), ...temp], people).filter((r) => r.id < 0);
        const rc = new Map<string, number>();
        for (const r of res) if (r.person_id === null) rc.set(reasonKey(r.match_reason), (rc.get(reasonKey(r.match_reason)) ?? 0) + 1);
        preview = { linked: res.filter((r) => r.person_id !== null).length, unlinked: res.filter((r) => r.person_id === null).length,
          reasons: [...rc.entries()].sort((a, c) => c[1] - a[1]) };
      }
      return { ok: true, counts: j.counts, bad, preview };
    }
    if (!adds.length) return { ok: true, counts: j.counts, bad, saved: 0, failed: 0 };
    const { data: imp, error: e1 } = await db.from("ministry_history_imports").insert({
      member_id: ctx.member?.id ?? null, file_name: fileName, years: j.years, total: j.counts.total, added: 0,
      skipped_same: j.counts.same, skipped_deleted: j.counts.deleted, skipped_dup: j.counts.dup,
    }).select("id").single();
    if (e1) throw e1;
    const recs = adds.map((x) => ({ ...(x.row as any), src_key: x.key, source: "excel", source_file: fileName, import_id: imp.id, link_how: "auto" }));
    let saved = 0, failed = 0;
    for (let i = 0; i < recs.length; i += 500) {
      const part = recs.slice(i, i + 500);
      const { error } = await db.from("ministry_history").insert(part);
      if (!error) { saved += part.length; continue; }
      for (const one of part) {                          // 한 묶음이 막히면 한 줄씩 — 그사이 같은 줄이 들어왔으면(23505) 건너뜀
        const { error: e2 } = await db.from("ministry_history").insert(one);
        if (!e2) saved++; else if ((e2 as any).code === "23505") j.counts.same++; else { failed++; console.error("history insert", e2); }
      }
    }
    const { error: e3 } = await db.from("ministry_history_imports").update({ added: saved }).eq("id", imp.id);
    if (e3) throw e3;
    const m = await rematchHistoryRows(db, null);
    const { count: linked, error: e4 } = await db.from("ministry_history").select("id", { count: "exact", head: true })
      .eq("import_id", imp.id).not("person_id", "is", null);
    if (e4) throw e4;
    await audit(ctx, "history.upload", String(imp.id), { years: j.years, rows: raws.length, ...j.counts, saved, failed,
      linked: linked ?? 0, unlinked: saved - (linked ?? 0), changed: m.changed });
    return { ok: true, counts: j.counts, bad, saved, failed, linked: linked ?? 0, unlinked: saved - (linked ?? 0) };
  }

  async function rowAdd(ctx: HCtx, b: any) {
    const t = tidyHistoryRow(b.row);
    if (!t.row) return { ok: false, error: t.error };
    const key = srcKey(t.row as any);
    const { data, error } = await db.from("ministry_history").insert({ ...t.row, src_key: key, source: "admin",
      source_file: "(화면에서 더함)", link_how: "auto" }).select("id").single();
    if (error) {
      if ((error as any).code === "23505") return { ok: false, error: "history-exists" };
      throw error;
    }
    await rematchHistoryRows(db, [data.id]);
    await audit(ctx, "history.add", String(data.id), { year: t.row.year });
    return { ok: true, row: outOrNull(await readRow(db, data.id), isFull(ctx)) };
  }

  async function rowSave(ctx: HCtx, b: any) {
    const id = idOf(b.id);
    if (!id) return { ok: false, error: "not-found" };
    const cur = await readRow(db, id);
    if (!cur) return { ok: false, error: "not-found" };
    if (String(b.expect ?? "") !== cur.updated_at) return { ok: false, error: "conflict" };
    const merged: any = { ...cur };
    const patch = b.patch && typeof b.patch === "object" ? b.patch : {};
    for (const k of HISTORY_EDIT_KEYS) if (k in patch) merged[k] = patch[k];
    const t = tidyHistoryRow(merged);
    if (!t.row) return { ok: false, error: t.error };
    const upd: Record<string, unknown> = {};
    for (const k of HISTORY_EDIT_KEYS) if (t.row[k] !== cur[k]) upd[k] = t.row[k];
    if (!Object.keys(upd).length) return { ok: true, row: rowOut(cur, isFull(ctx)) };
    upd.updated_at = new Date().toISOString();
    const { data, error } = await db.from("ministry_history").update(upd).eq("id", id).eq("updated_at", cur.updated_at).select("id");
    if (error) throw error;
    if (!(data ?? []).length) return { ok: false, error: (await readRow(db, id)) ? "conflict" : "not-found" };
    const rematch = ["year", "name", "position", "mok", "team"].some((k) => k in upd);
    if (rematch && cur.link_how === "auto") await rematchHistoryRows(db, [id]);
    await audit(ctx, "history.edit", String(id), { year: t.row.year, fields: Object.keys(upd).filter((k) => k !== "updated_at") });
    return { ok: true, row: outOrNull(await readRow(db, id), isFull(ctx)) };
  }

  async function rowDelete(ctx: HCtx, b: any) {
    const id = idOf(b.id);
    if (!id) return { ok: false, error: "not-found" };
    const cur = await readRow(db, id);
    if (!cur) return { ok: false, error: "not-found" };
    if (String(b.expect ?? "") !== cur.updated_at) return { ok: false, error: "conflict" };
    const now = new Date().toISOString();
    const { data, error } = await db.from("ministry_history").update({ deleted_at: now, deleted_by: ctx.member?.id ?? null, updated_at: now })
      .eq("id", id).eq("updated_at", cur.updated_at).select("id");
    if (error) throw error;
    if (!(data ?? []).length) return { ok: false, error: (await readRow(db, id)) ? "conflict" : "not-found" };
    await audit(ctx, "history.delete", String(id), { year: cur.year });
    return { ok: true };
  }

  async function candidates(ctx: HCtx, b: any) {
    const id = idOf(b.id);
    const row = id ? await readRow(db, id) : null;
    if (!row) return { ok: false, error: "not-found" };
    const full = isFull(ctx);
    const { list, fp } = await candidatesFor(db, row);
    await audit(ctx, "people.lookup", "", { q: row.name, count: list.length, from: "history" });
    return { ok: true, full, fp, row: rowOut(row, full), candidates: list.map((c) => candOut(c, full, row.person_id ?? null)) };
  }

  async function link(ctx: HCtx, b: any) {
    const id = idOf(b.id);
    const row = id ? await readRow(db, id) : null;
    if (!row) return { ok: false, error: "not-found" };
    const now = new Date().toISOString();
    const op = b.op === "pick" || b.op === "none" || b.op === "auto" ? b.op : "";
    if (!op) return { ok: false, error: "invalid" };
    let patch: Record<string, unknown>;
    if (op === "pick") {
      const { list, fp } = await candidatesFor(db, row);
      const n = Number(b.pick);
      if (String(b.fp ?? "") !== fp || !Number.isInteger(n) || n < 0 || n >= list.length) return { ok: false, error: "candidates-changed" };
      patch = historyLinkPatch(list[n].person_id, ctx.member?.id ?? null, now);
    } else if (op === "none") patch = historyLinkPatch(null, ctx.member?.id ?? null, now);
    else patch = historyUnlinkPatch(now);
    const { error } = await db.from("ministry_history").update(patch).eq("id", id).is("deleted_at", null);
    if (error) throw error;
    if (op === "auto") await rematchHistoryRows(db, [id]);
    await audit(ctx, "history.link", String(id), { op, year: row.year, by: "ministry" });
    return { ok: true, row: outOrNull(await readRow(db, id), isFull(ctx)) };
  }

  async function rematch(ctx: HCtx, b: any) {
    if (b.confirm !== true) return { ok: false, error: "needs-confirm" };
    const m = await rematchHistoryRows(db, null);
    if (m.noDirectory) return { ok: false, error: "no-directory" };
    await audit(ctx, "history.rematch", "", { changed: m.changed, linked: m.linked, total: m.total });
    return { ok: true, ...m };
  }

  async function exportRows(ctx: HCtx, b: any) {
    const full = isFull(ctx);
    const years = Array.isArray(b.years) ? b.years.map(Number).filter(Number.isInteger) : [];
    let rows = await all(() => db.from("ministry_history").select(ROW_COLS).is("deleted_at", null).order("id", { ascending: true }));
    if (years.length) rows = rows.filter((r) => years.includes(r.year));
    if (!rows.length) return { ok: true, full, rows: [] };
    rows.sort((a, c) => a.year - c.year || a.id - c.id);
    await audit(ctx, "history.export", "", { count: rows.length, years });
    return { ok: true, full, rows: rows.map((r) => ({ ...rowOut(r, full), source_file: r.source_file })) };
  }

  return { list, upload, rowAdd, rowSave, rowDelete, candidates, link, rematch, exportRows };
}
```

- [ ] **Step 4: `authz.ts` — ACTION_ROLES 끝 `ministryTesterSave: "ministry",` 줄 바로 아래(`};` 앞)에 더한다**

```ts
  // 사역 이력(2026-10-01) — 지난 해 사역 임명 명단(엑셀)과 교인ID 잇기(표 ministry_history · history-db.ts). 응답의 person_id 는
  // 교인명부·총괄 역할일 때만(서버가 ctx.roles 로). 후보 보기는 「교인명부 기록」 people.lookup(from:"history") · 쓰기는 「바꾼 기록」 history.*.
  historyList: "ministry",
  historyUploadCheck: "ministry",
  historyUploadSave: "ministry",
  historyRowAdd: "ministry",
  historyRowSave: "ministry",
  historyRowDelete: "ministry",
  historyCandidates: "ministry",
  historyLink: "ministry",
  historyRematch: "ministry",
  historyExport: "ministry",
```

- [ ] **Step 5: `tests/authz.test.mjs` — ministry 액션 목록의 첫 줄을 바꾼다**

찾기:
```js
  assert.deepEqual(ministryActions.sort(), ["ministryAppointed", "ministryCatalogAdmin", "ministryCatalogOrder",
```
바꾸기:
```js
  assert.deepEqual(ministryActions.sort(), ["historyCandidates", "historyExport", "historyLink", "historyList", "historyRematch",
    "historyRowAdd", "historyRowDelete", "historyRowSave", "historyUploadCheck", "historyUploadSave",
    "ministryAppointed", "ministryCatalogAdmin", "ministryCatalogOrder",
```

- [ ] **Step 6: `index.ts` 세 곳**

(1) `import { churchForSignup } from "./events-person.ts";` 줄 바로 아래:
```ts
// 사역 이력(2026-10-01 · 설계 v2 docs/superpowers/specs/2026-10-01-church-admin-ministry-history-design.md) — 표 읽기·쓰기는 history-db.ts 한 곳
import { makeHistory } from "./history-db.ts";
```
(2) `async function audit(…) { … }` 함수 바로 아래(빈 줄 하나 띄우고):
```ts
// 사역 이력 액션 열(history-db.ts makeHistory) — db·audit 를 넘겨 만든다(이름은 historyApi — 「history」는 브라우저 전역과 헷갈린다)
const historyApi = makeHistory({ db, audit });
```
(3) switch 의 `case "ministryPerson": return json(await ministryPerson(ctx, b));` 줄 바로 아래:
```ts
      case "historyList":        return json(await historyApi.list(ctx, b));
      case "historyUploadCheck": return json(await historyApi.upload(ctx, b, false));
      case "historyUploadSave":  return json(await historyApi.upload(ctx, b, true));
      case "historyRowAdd":      return json(await historyApi.rowAdd(ctx, b));
      case "historyRowSave":     return json(await historyApi.rowSave(ctx, b));
      case "historyRowDelete":   return json(await historyApi.rowDelete(ctx, b));
      case "historyCandidates":  return json(await historyApi.candidates(ctx, b));
      case "historyLink":        return json(await historyApi.link(ctx, b));
      case "historyRematch":     return json(await historyApi.rematch(ctx, b));
      case "historyExport":      return json(await historyApi.exportRows(ctx, b));
```

- [ ] **Step 7: 시험 셋이 통과하는지**

Run: `node --experimental-strip-types --test tests/history-db.test.mjs tests/history-match.test.mjs tests/authz.test.mjs tests/be-roster-logic.test.mjs`
Expected: 모두 pass(`be-roster-logic` 은 index.ts 를 읽는 문서 시험 — import 를 더해도 통과해야 한다).

- [ ] **Step 8: 커밋**

```bash
git add supabase/functions/church-admin/history-db.ts tests/history-db.test.mjs supabase/functions/church-admin/authz.ts tests/authz.test.mjs supabase/functions/church-admin/index.ts
git commit -m "feat(사역이력): history-db.ts — 목록·올리기(살펴보기·넣기)·한 줄·후보(지문)·잇기·다시 맞추기·내려받기 · 교인ID 는 교인명부·총괄에게만 · 액션 열 개

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: 화면 순수 함수 `history-logic.js`

**Files:**
- Create: `js/menus/ministry/history-logic.js`
- Test: `tests/ministry-history-logic.test.mjs`

**Interfaces:**
- Consumes: `../bibleevent/upload-logic.js` `cellText` · (시험) 서버 `WEAK_RE`·`HISTORY_MAX_UPLOAD`·`HISTORY_EDIT_KEYS`.
- Produces: `MAX_SEND` · `WEAK_RE` · `findHeader(aoa)` · `yearFromName(name)` · `parseHistorySheet(aoa, fileName) → {error, rows, needYear, fileYear}` · `textToAoa(text)` · `sendParts(rows) → [{year, rows}]` · `yearOptions()` · `linkState(r)` · `STATE_TEXT` · `STATE_CLASS` · `whyText(r)` · `mergeChecks(checks)` · `EXPORT_HEAD` · `exportAoa(rows, full)` · `exportName(years)` · `EDIT_KEYS` · `editPatch(before, after)`

- [ ] **Step 1: 시험 `tests/ministry-history-logic.test.mjs`**

```js
// 📜 사역 이력 화면의 순수 함수(history-logic.js) — 엑셀 머리 찾기 · 해 정하기 · 나눠 보내기 · 표시 · 내려받기 모양
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findHeader, parseHistorySheet, yearFromName, sendParts, textToAoa, linkState, mergeChecks, exportAoa, exportName,
  editPatch, WEAK_RE, MAX_SEND, EXPORT_HEAD, EDIT_KEYS,
} from "../js/menus/ministry/history-logic.js";
import { WEAK_RE as SERVER_WEAK_RE } from "../supabase/functions/church-admin/history-match.ts";
import { HISTORY_MAX_UPLOAD, HISTORY_EDIT_KEYS } from "../supabase/functions/church-admin/history-db.ts";

// 원본 해마다 파일의 꼴 — 1행 제목 · 2행 빈 줄 · 3행 머리(A열은 빈칸) · H열 메모는 머리 없음
const raw2022 = [
  ["", "2022년 사역임명"], [],
  ["   ", "부서", "팀명", "이름", "직분", "목장", "신규 / 유지"],
  ["", "찬양부", "가브리엘찬양대", "가나다", "집사", "기쁨-19", "신규", "검색결과 없음"],
  ["", "찬양부", "가브리엘찬양대", "라마바", "권사", "화평-3", "유지"],
  ["", "", "", "", "", "", ""],
];

test("findHeader — 「이름」과 「팀명」이 함께 든 첫 줄 · 머리 없는 칸은 원본 메모로", () => {
  const h = findHeader(raw2022);
  assert.equal(h.index, 2);
  assert.deepEqual([h.cols.committee, h.cols.team, h.cols.name, h.cols.position, h.cols.mok, h.cols.renewal], [1, 2, 3, 4, 5, 6]);
  assert.ok(h.blankCols.includes(7));
  assert.equal(findHeader([["가", "나"], ["다"]]), null);
});

test("parseHistorySheet — 해는 파일 이름에서 · 빈 줄 버림 · 메모 모음", () => {
  const p = parseHistorySheet(raw2022, "2022년 사역신청 명단_3차(사역순).xlsx");
  assert.equal(p.error, "");
  assert.equal(p.rows.length, 2);
  assert.deepEqual([p.rows[0].year, p.rows[0].name, p.rows[0].mok, p.rows[0].src_note], [2022, "가나다", "기쁨-19", "검색결과 없음"]);
  assert.equal(p.needYear, false);
  assert.equal(parseHistorySheet(raw2022, "명단.xlsx").needYear, true);
});

test("parseHistorySheet — 통합 파일(「년도」 칸) · 내려받은 파일의 「비고」는 원본 메모가 아니다", () => {
  const merged = [["년도", "부서", "팀명", "이름", "직분", "목장", "신규 / 유지", "비고"], [2024, "찬양부", "가", "가나다", "집사", "기쁨-1", "유지", "메모"]];
  const m = parseHistorySheet(merged, "통합.xlsx").rows[0];
  assert.deepEqual([m.year, m.src_note], [2024, "메모"]);
  const exported = [EXPORT_HEAD, [2024, "찬양부", "가", "가나다", "", "교인명부에 같은 이름이 없음", "집사", "기쁨-1", "유지", "", "", "", ""]];
  const r = parseHistorySheet(exported, "사역이력_2024.xlsx").rows[0];
  assert.deepEqual([r.name, r.src_note], ["가나다", ""]);
});

test("yearFromName · textToAoa", () => {
  assert.equal(yearFromName("2024년+사역신청+명단+6차.xlsx"), 2024);
  assert.equal(yearFromName("사역명단.xlsx"), null);
  assert.deepEqual(textToAoa("이름\t팀명\r\n가\t나"), [["이름", "팀명"], ["가", "나"]]);
});

test("sendParts — 해마다 · 3,000줄씩(서버 상한과 같다)", () => {
  assert.equal(MAX_SEND, HISTORY_MAX_UPLOAD);
  const rows = [...Array(3001)].map(() => ({ year: 2024 })).concat([{ year: 2022 }]);
  assert.deepEqual(sendParts(rows).map((p) => [p.year, p.rows.length]), [[2022, 1], [2024, 3000], [2024, 1]]);
});

test("WEAK_RE·고치기 칸 — 화면과 서버가 같은 글", () => {
  assert.equal(WEAK_RE.source, SERVER_WEAK_RE.source);
  assert.deepEqual([...EDIT_KEYS], [...HISTORY_EDIT_KEYS]);
});

test("linkState · mergeChecks · editPatch", () => {
  assert.equal(linkState({ linked: false }), "none");
  assert.equal(linkState({ linked: true, weak: true, link_how: "auto" }), "weak");
  assert.equal(linkState({ linked: true, weak: true, link_how: "manual" }), "ok");
  const m = mergeChecks([
    { d: { counts: { total: 3, add: 2, same: 1, deleted: 0, dup: 0, bad: 0 }, preview: { linked: 1, unlinked: 1, reasons: [["가", 1]] } } },
    { d: { counts: { total: 1, add: 1, same: 0, deleted: 0, dup: 0, bad: 0 }, preview: { linked: 0, unlinked: 1, reasons: [["가", 1]] } } },
  ]);
  assert.deepEqual([m.total, m.add, m.linked, m.unlinked, m.reasons], [4, 3, 1, 2, [["가", 2]]]);
  assert.deepEqual(editPatch({ year: 2024, name: "가", mok: "기쁨-1" }, { year: "2024", name: " 가 ", mok: "기쁨-11" }), { mok: "기쁨-11" });
});

test("exportAoa — 교적ID 는 full 일 때만 · 비고는 못 맞춘 줄만 · 맞춤 근거는 맞춘 줄만", () => {
  const r = { year: 2024, committee: "찬양부", team: "가", name: "가나다", person_id: 7, linked: true, match_basis: "같은 소속",
    match_reason: "", position: "집사", mok: "기쁨-19", renewal: "유지", role_title: "", src_note: "", source_file: "a.xlsx" };
  const u = { ...r, person_id: undefined, linked: false, match_basis: "", match_reason: "교인명부에 같은 이름이 없음" };
  const full = exportAoa([r, u], true), basic = exportAoa([r], false);
  assert.deepEqual(full[0], EXPORT_HEAD);
  assert.deepEqual([full[1][4], full[1][5], full[1][12]], [7, "", "같은 소속"]);
  assert.deepEqual([full[2][4], full[2][5], full[2][12]], ["", "교인명부에 같은 이름이 없음", ""]);
  assert.equal(basic[1][4], "");
  assert.match(exportName([2024, 2022], new Date("2026-10-01T00:00:00Z")), /^사역이력_2022-2024_20261001\.xlsx$/);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --experimental-strip-types --test tests/ministry-history-logic.test.mjs`
Expected: FAIL — `Cannot find module …/history-logic.js`

- [ ] **Step 3: `js/menus/ministry/history-logic.js`**

```js
// 📜 사역 이력 — 화면의 순수 함수(엑셀 머리 찾기 · 해 정하기 · 줄 모으기 · 표시 · 내려받기 모양)
//   설계 v2 docs/superpowers/specs/2026-10-01-church-admin-ministry-history-design.md §3.1·§5
// ⚠️ Node 시험(tests/ministry-history-logic.test.mjs)이 읽는다 — 맨 위에서 document·window 를 만지지 않는다.
import { cellText } from "../bibleevent/upload-logic.js";

export const MAX_SEND = 3000;     // 서버 historyUpload 한 번의 상한(HISTORY_MAX_UPLOAD)과 같다
// 근거가 약한 맞춤 — 서버 history-match.ts WEAK_RE 와 같은 글(시험이 맞댄다)
export const WEAK_RE = /^(같은 교구|이름이 한 분뿐|직분으로 가림\(소속 다름\)|가족이 같은 해 같은 목장\(소속 다름\)|다른 해|이름 한 글자 다름)/;

// 칸 이름(띄어쓰기 없앤 꼴) → 줄의 칸. 「비고」는 내려받은 파일(교적ID·맞춤 근거 칸이 있는 파일)이 아니면 원본 메모로 읽는다.
const HEAD = {
  year: ["년도", "연도", "해"], committee: ["부서", "위원회"], team: ["팀명", "팀", "사역팀"], name: ["이름", "성명"],
  position: ["직분"], mok: ["목장"], renewal: ["신규/유지", "신규유지"], role_title: ["직책"], src_note: ["원본메모", "메모"],
};
const hnorm = (s) => cellText(s).normalize("NFC").replace(/\s+/g, "");

// 표 머리 — 앞 열다섯 줄 안에서 「이름」과 「팀명(팀)」이 함께 든 첫 줄. 머리가 빈 칸에 값이 있으면 원본 메모로 모은다
//   (2022 원본의 H열 메모는 머리가 없다).
export function findHeader(aoa) {
  for (let i = 0; i < Math.min((aoa || []).length, 15); i++) {
    const cells = (aoa[i] || []).map(hnorm);
    const at = (names) => cells.findIndex((c) => names.includes(c));
    if (at(HEAD.name) < 0 || at(HEAD.team) < 0) continue;
    const cols = {};
    for (const [k, names] of Object.entries(HEAD)) { const j = at(names); if (j >= 0) cols[k] = j; }
    const exported = cells.includes("교적ID") || cells.includes("맞춤근거");
    if (cols.src_note === undefined && !exported) { const j = at(["비고"]); if (j >= 0) cols.src_note = j; }
    const known = new Set(Object.values(cols));
    const width = Math.max(...(aoa.slice(i + 1).map((r) => (r || []).length)), cells.length);
    const blankCols = [];
    for (let j = 0; j < width; j++) if (!known.has(j) && !(cells[j] || "")) blankCols.push(j);
    return { index: i, cols, blankCols };
  }
  return null;
}

export const yearFromName = (name) => { const m = /(19[5-9]\d|20\d{2})/.exec(String(name || "")); return m ? Number(m[1]) : null; };

// 표 → 줄들. 해는 「년도」 칸 → 파일 이름의 네 자리 → 없으면 needYear(화면이 고르게 한다)
export function parseHistorySheet(aoa, fileName) {
  const h = findHeader(aoa);
  if (!h) return { error: "no-header", rows: [], needYear: false, fileYear: null };
  const fileYear = yearFromName(fileName);
  const rows = [];
  for (const raw of aoa.slice(h.index + 1)) {
    const cells = (raw || []).map(cellText);
    const get = (k) => (h.cols[k] === undefined ? "" : cells[h.cols[k]] || "");
    const row = {
      committee: get("committee"), team: get("team"), name: get("name"), position: get("position"), mok: get("mok"),
      renewal: get("renewal"), role_title: get("role_title"),
      src_note: [get("src_note"), ...h.blankCols.map((j) => cells[j] || "")].filter(Boolean).join(" · "),
    };
    if (![row.committee, row.team, row.name, row.position, row.mok].some(Boolean)) continue;
    const y = h.cols.year === undefined ? NaN : Number(String(get("year")).replace(/\D/g, ""));
    row.year = Number.isInteger(y) && y >= 1950 && y <= 2100 ? y : fileYear;
    rows.push(row);
  }
  return { error: "", rows, needYear: rows.some((r) => !r.year), fileYear };
}

// 붙여넣기(엑셀에서 복사한 칸 — 탭으로 갈린 글) → 표
export const textToAoa = (text) => String(text || "").replace(/\r/g, "").split("\n").map((l) => l.split("\t"));

// 해마다 · 3,000줄씩 — [{ year, rows }]
export function sendParts(rows, max = MAX_SEND) {
  const by = new Map();
  for (const r of rows) { const l = by.get(r.year); if (l) l.push(r); else by.set(r.year, [r]); }
  const out = [];
  for (const year of [...by.keys()].sort((a, b) => a - b)) {
    const list = by.get(year);
    for (let i = 0; i < list.length; i += max) out.push({ year, rows: list.slice(i, i + max) });
  }
  return out;
}

// 해 고르기 — 올해부터 1990까지
export function yearOptions(now = new Date()) {
  const out = [];
  for (let y = now.getFullYear(); y >= 1990; y--) out.push({ value: String(y), label: `${y}년` });
  return out;
}

// 줄의 교적 상태 — ok(이어짐) · weak(근거 약함) · none(못 맞춤)
export const linkState = (r) => (!r.linked ? "none" : r.link_how === "manual" ? "ok" : r.weak ? "weak" : "ok");
export const STATE_TEXT = { ok: "✓ 이어짐", weak: "△ 확인", none: "— 못 맞춤" };
export const STATE_CLASS = { ok: "cb-ok", weak: "cb-check", none: "cb-none" };
export const whyText = (r) => (r.linked ? r.match_basis : r.match_reason) || "";

// 살펴보기 결과 합치기 — 해마다 받은 counts·preview 를 하나로
export function mergeChecks(checks) {
  const t = { total: 0, add: 0, same: 0, deleted: 0, dup: 0, bad: 0, linked: 0, unlinked: 0 };
  const reasons = new Map();
  for (const c of checks) {
    for (const k of ["total", "add", "same", "deleted", "dup", "bad"]) t[k] += c.d.counts?.[k] || 0;
    t.linked += c.d.preview?.linked || 0; t.unlinked += c.d.preview?.unlinked || 0;
    for (const [w, n] of c.d.preview?.reasons || []) reasons.set(w, (reasons.get(w) || 0) + n);
  }
  return { ...t, reasons: [...reasons.entries()].sort((a, b) => b[1] - a[1]) };
}

// 내려받기 — 2026-10-01 엑셀과 같은 칸 차례(교적ID 는 교인명부·총괄일 때만 채운다)
export const EXPORT_HEAD = ["년도", "부서", "팀명", "이름", "교적ID", "비고", "직분", "목장", "신규 / 유지", "직책", "원본 메모", "원본 파일", "맞춤 근거"];
export function exportAoa(rows, full) {
  return [EXPORT_HEAD, ...rows.map((r) => [r.year, r.committee, r.team, r.name, full && r.person_id != null ? r.person_id : "",
    r.linked ? "" : r.match_reason, r.position, r.mok, r.renewal, r.role_title, r.src_note, r.source_file || "", r.linked ? r.match_basis : ""])];
}
export function exportName(years, now = new Date()) {
  const d = new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, "");
  return `사역이력_${years && years.length ? [...years].sort().join("-") : "모든해"}_${d}.xlsx`;
}

// 고치기 창 칸 — 서버 HISTORY_EDIT_KEYS 와 같은 칸
export const EDIT_KEYS = ["year", "committee", "team", "role_title", "name", "position", "mok", "renewal", "src_note"];
export function editPatch(before, after) {
  const p = {};
  for (const k of EDIT_KEYS) {
    const a = k === "year" ? Number(after[k]) : String(after[k] ?? "").trim();
    const b = k === "year" ? Number(before[k]) : String(before[k] ?? "");
    if (a !== b) p[k] = a;
  }
  return p;
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --experimental-strip-types --test tests/ministry-history-logic.test.mjs`
Expected: pass 8 · fail 0

- [ ] **Step 5: 커밋**

```bash
git add js/menus/ministry/history-logic.js tests/ministry-history-logic.test.mjs
git commit -m "feat(사역이력): 화면 순수 함수 — 엑셀 머리 찾기(원본 해마다·통합·내려받은 파일)·해 정하기·해마다 3,000줄씩·내려받기 모양

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: 「📜 사역 이력」 메뉴 · 모양 · 메뉴 등록 · 오류 문구 · 기록 이름

**Files:**
- Create: `js/menus/ministry/history.js`
- Modify: `js/menus/registry.js` · `js/core/ui.js`(MESSAGES 끝) · `js/menus/system/audit.js`(세 곳) · `css/admin.css`(끝) · `tests/xlsx-loader.test.mjs` · `tests/audit.test.mjs`(끝) · `tests/ministry-history-logic.test.mjs`(끝)

**Interfaces:**
- Consumes: Task 4 액션 열 개(응답 모양은 Task 4 `history-db.ts`) · Task 5 함수들 · `openPerson(call, id, onFamily, back)`(people/search.js · full 일 때만 부른다 — 사역신청 역할이 부르면 forbidden 으로 앱이 다시 시작된다).

- [ ] **Step 1: 시험을 더한다 — `tests/ministry-history-logic.test.mjs` 끝에**

```js
test("화면 모듈 — render 를 내보낸다(문법·import 경로)", async () => {
  globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const m = await import("../js/menus/ministry/history.js");
  assert.equal(typeof m.render, "function");
});
```

그리고 `tests/audit.test.mjs` 끝에:
```js
// ── 사역 이력(2026-10-01) — 기록 일곱 가지 · people.lookup(from:"history") ──
import { LOOKUP_HISTORY } from "../js/menus/system/audit.js";
test("사역 이력 기록 일곱 가지 — 한국말 이름 · detail 줄(이름·교인ID 없이 해·수만)", () => {
  for (const a of ["history.upload", "history.add", "history.edit", "history.delete", "history.link", "history.rematch", "history.export"]) {
    assert.match(LABEL[a], /[가-힣]/, a);
  }
  assert.equal(detailText(R("history.upload", { years: [2022, 2023], rows: 1269, saved: 1269, same: 0, linked: 1240, unlinked: 29 })),
    "2022·2023년 · 올린 줄 1269 · 넣음 1269 · 이미 있음 0 · 교적 이어짐 1240 · 못 맞춤 29");
  assert.equal(detailText(R("history.edit", { year: 2024, fields: ["name", "mok"] })), "2024년 · 이름·목장");
  assert.equal(detailText(R("history.link", { op: "none", year: 2024, by: "directory" })), "2024년 · 이분 아님 · 교적 창에서");
  assert.equal(detailText(R("history.rematch", { changed: 3, linked: 4042, total: 4093 })), "바뀐 줄 3 · 교적 이어짐 4042/4093");
  assert.equal(detailText(R("history.export", { count: 10, years: [] })), "10줄 · 모든 해");
  assert.equal(labelOf(R("people.lookup", { q: "가", count: 2, from: "history" })), LOOKUP_HISTORY);
});
```

그리고 `tests/xlsx-loader.test.mjs` 의 목록 줄을 바꾼다:
찾기 `  for (const rel of ["js/menus/bibleevent/upload.js", "js/menus/ministry/paper.js"]) {` →
바꾸기 `  for (const rel of ["js/menus/bibleevent/upload.js", "js/menus/ministry/paper.js", "js/menus/ministry/history.js"]) {`

- [ ] **Step 2: 실패 확인**

Run: `node --experimental-strip-types --test tests/ministry-history-logic.test.mjs tests/audit.test.mjs tests/xlsx-loader.test.mjs`
Expected: FAIL — history.js 가 없다 · `LOOKUP_HISTORY` 가 없다 · LABEL 에 history.* 가 없다

- [ ] **Step 3: `js/menus/ministry/history.js`**

```js
// 📜 사역 이력 — 지난 해 사역 임명 명단(엑셀)을 올리고, 교인명부의 교인ID 와 잇는다(2026-10-01).
//   설계 v2 docs/superpowers/specs/2026-10-01-church-admin-ministry-history-design.md §3·§5
//   막는 것은 서버다(역할 ministry · 교인ID 는 교인명부·총괄에게만 실린다 · 후보 고르기는 차례 번호 + 목록 지문 fp).
//   엑셀 읽기는 core/xlsx.js loadXlsx 한 곳 · 파일 고르기 + 끌어다 놓기 + 붙여넣기(CLAUDE.md 팝업 규칙의 유일한 예외 몫).
import { esc, toast, dialog, busy, errorText } from "../../core/ui.js";
import { pickOne } from "../../core/picker.js";
import { openForm } from "../../core/modal.js";
import { loadXlsx } from "../../core/xlsx.js";
import { fileErrorText } from "../bibleevent/upload-logic.js";
import { openPerson } from "../people/search.js";
import { parseHistorySheet, findHeader, textToAoa, sendParts, yearOptions, linkState, STATE_TEXT, STATE_CLASS, whyText,
  mergeChecks, exportAoa, exportName, EDIT_KEYS, editPatch } from "./history-logic.js";

const TITLE = `<h2 class="page-title">📜 사역 이력</h2>`;
const mqWide = matchMedia("(min-width:1024px)");   // PC 는 표, 폰은 카드
let unbindMq = null, unbindPaste = null;
const f = { years: [], only: "", q: "", page: 0 };  // 메뉴를 옮겨도 남는 거르기
const FAMILY_NOTE = "가족은 교인명부 「🔎 교인 찾기」에서 볼 수 있어요";
const num = (n) => Number(n || 0).toLocaleString("ko-KR");
const STALE = { conflict: "다른 분이 먼저 바꿨어요 — 창을 닫고 다시 열어 주세요", "not-found": "이미 빠진 줄이에요 — 목록을 새로 불러올게요" };
const FIELD = { year: "해", committee: "부서", team: "팀명", role_title: "직책", name: "이름", position: "직분", mok: "목장",
  renewal: "신규/유지", src_note: "원본 메모" };

const badge = (r) => { const s = linkState(r); return `<em class="cb ${STATE_CLASS[s]}">${STATE_TEXT[s]}</em>`; };
const sub = (r) => [`${r.year}년`, r.committee, r.team, r.mok].filter(Boolean).join(" · ");

function cardHtml(r) {
  const why = whyText(r);
  return `<div class="be-row"><div class="be-row-h"><div class="be-row-nm"><b>${esc(r.name)}</b>` +
    `${r.position ? ` <span class="be-pos">${esc(r.position)}</span>` : ""}<span class="be-row-sub">${esc(sub(r))}</span>` +
    `<span class="be-badges">${badge(r)}</span></div>` +
    `<button type="button" class="be-more" data-act="row" data-id="${r.id}" aria-label="${esc(r.name)} 줄 열기">⋯</button></div>` +
    (why ? `<div class="mh-why">${esc(why)}</div>` : "") + `</div>`;
}
function tableHtml(rows) {
  const head = `<tr><th>해</th><th>부서</th><th>팀</th><th>이름</th><th>직분</th><th>목장</th><th>교적</th><th><span class="be-sr">열기</span></th></tr>`;
  const body = rows.map((r) => `<tr><td>${r.year}</td><td>${esc(r.committee)}</td><td>${esc(r.team)}</td><td><b>${esc(r.name)}</b></td>` +
    `<td>${esc(r.position)}</td><td>${esc(r.mok)}</td><td>${badge(r)}<div class="mh-why">${esc(whyText(r))}</div></td>` +
    `<td><button type="button" class="be-more" data-act="row" data-id="${r.id}" aria-label="${esc(r.name)} 줄 열기">⋯</button></td></tr>`).join("");
  return `<div class="be-tbl-wrap"><table class="be-table mh-table"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}

function checkHtml(name, checks) {
  const t = mergeChecks(checks);
  const years = checks.map((c) => `<li>${c.year}년 — 새 줄 <b>${num(c.d.counts.add)}</b> · 이미 있음 ${num(c.d.counts.same)}` +
    (c.d.counts.deleted ? ` · 빼 둔 줄과 같음 ${num(c.d.counts.deleted)}` : "") + (c.d.counts.dup ? ` · 파일 안 겹침 ${num(c.d.counts.dup)}` : "") +
    (c.d.counts.bad ? ` · <span class="mh-bad">틀린 줄 ${num(c.d.counts.bad)}</span>` : "") + `</li>`).join("");
  const reasons = t.reasons.slice(0, 6).map(([w, n]) => `<li>${esc(w)} — ${num(n)}줄</li>`).join("");
  return `<p class="mh-file">${esc(name)}</p><ul class="mh-ul">${years}</ul>` +
    (t.add ? `<p class="mh-pre">새 줄을 미리 맞춰 보면 교적이 붙는 줄 <b>${num(t.linked)}</b> · 못 맞추는 줄 <b>${num(t.unlinked)}</b></p>` : "") +
    (reasons ? `<ul class="mh-ul mh-reasons">${reasons}</ul>` : "") +
    (t.bad ? `<p class="be-warn">틀린 줄(해·이름 없음 · 칸이 너무 김)은 넣지 않아요.</p>` : "");
}

function fieldsHtml(v) {
  const inp = (k, extra = "") => `<label class="field"><span>${FIELD[k]}</span><input data-f="${k}" value="${esc(v[k] ?? "")}" ${extra} autocomplete="off"></label>`;
  return `<div class="be-2col">${inp("year", `inputmode="numeric" maxlength="4"`)}${inp("name", `maxlength="100"`)}</div>` +
    `<div class="be-2col">${inp("committee", `maxlength="100"`)}${inp("team", `maxlength="100"`)}</div>` +
    `<div class="be-2col">${inp("position", `maxlength="100"`)}${inp("mok", `maxlength="100" placeholder="예: 기쁨-19 · 소망-남성 · 청년05또래"`)}</div>` +
    `<div class="be-2col">${inp("role_title", `maxlength="100" placeholder="팀장·부팀장 (없으면 비움)"`)}${inp("renewal", `maxlength="100" placeholder="신규 · 유지"`)}</div>` +
    `<label class="field"><span>${FIELD.src_note}</span><textarea data-f="src_note" maxlength="500" rows="2">${esc(v.src_note ?? "")}</textarea></label>`;
}
const readFields = (root) => Object.fromEntries(EDIT_KEYS.map((k) => [k, root.querySelector(`[data-f="${k}"]`)?.value ?? ""]));

function candHtml(d) {
  const list = d.candidates || [];
  const items = list.map((c, i) => `<button type="button" class="be-cand${c.current ? " on" : ""}" data-cand="${i}" aria-pressed="${c.current}">` +
    `<b>${esc(c.name)}</b> ${esc(c.label)}${c.position ? ` · ${esc(c.position)}` : ""}` +
    (c.church_mok ? `<span class="be-cand-mok">교적: ${esc(c.church_mok)}</span>` : "") +
    (c.served ? `<span class="mh-served">다른 해에 이 팀 ${c.served}번</span>` : "") +
    (d.full ? `<span class="mh-pid">교인ID ${c.person_id}</span>` : "") + `</button>` +
    (d.full ? `<button type="button" class="btn mh-detail" data-detail="${i}">🔎 자세히</button>` : "")).join("");
  return `<h4 class="mh-h">교인명부의 같은 이름 ${list.length}명 <small>— 이분이면 눌러 고른 뒤 「저장」</small></h4>` +
    `<div class="be-cands mh-cands">${items || `<p class="muted">같은 이름이 교인명부에 없어요</p>`}` +
    `<button type="button" class="be-cand${d.row.link_how === "none" ? " on" : ""}" data-cand="none" aria-pressed="${d.row.link_how === "none"}">이분 아님 <small>(교인명부에 없는 분 · 비워 둠)</small></button>` +
    (d.row.link_how !== "auto" ? `<button type="button" class="be-cand" data-cand="auto" aria-pressed="false">자동 맞춤으로 되돌리기</button>` : "") + `</div>`;
}

export async function render(el, { call }) {
  el.innerHTML = TITLE + `<p class="empty">불러오는 중…</p>`;
  let last = null;          // 마지막 historyList 답
  let rows = [];

  const shell = () => {
    el.innerHTML = TITLE + `
      <div class="adm-acts"><button type="button" class="btn primary" data-act="pick">📤 엑셀 올리기</button>
        <button type="button" class="btn" data-act="add">＋ 한 줄 더하기</button></div>
      <input type="file" accept=".xlsx,.xls" multiple hidden data-file>
      <p class="muted mh-how">사역 임명 명단 엑셀(「부서·팀명·이름·직분·목장·신규 / 유지」 칸)을 고르거나 이 화면에 끌어다 놓으세요.
        엑셀에서 표를 복사해 이 화면에서 붙여넣어도 돼요. 이미 있는 줄은 건너뛰고 새 줄만 더해요.</p>
      <div class="acts mh-acts2"><button type="button" class="btn" data-act="rematch">🔄 다시 맞추기</button>
        <button type="button" class="btn" data-act="export">⬇ 내려받기</button></div>
      <div class="tabs mh-years" role="group" aria-label="해로 거르기"></div>
      <div class="tabs mh-only" role="group" aria-label="교적으로 거르기">
        <button type="button" data-only="" aria-pressed="false">전체</button>
        <button type="button" data-only="none" aria-pressed="false">못 맞춘 줄만</button>
        <button type="button" data-only="weak" aria-pressed="false">근거 약한 줄만</button></div>
      <input type="search" class="search" maxlength="40" placeholder="이름·팀·부서로 찾기" aria-label="이름·팀·부서로 찾기" value="${esc(f.q)}">
      <p class="mh-sum muted"></p>
      <div class="mh-list"></div>
      <div class="pp-pager mh-pager"></div>`;
  };

  const drawFilters = () => {
    const ys = (last && last.years) || [];
    el.querySelector(".mh-years").innerHTML = `<button type="button" data-year="" aria-pressed="${!f.years.length}" class="${f.years.length ? "" : "on"}">모든 해</button>` +
      ys.map((y) => { const on = f.years.includes(y.year);
        return `<button type="button" data-year="${y.year}" aria-pressed="${on}" class="${on ? "on" : ""}">${y.year}<em>${num(y.total)}</em></button>`; }).join("");
    for (const b of el.querySelectorAll(".mh-only button")) {
      const on = b.dataset.only === f.only;
      b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on));
    }
    const pick = ys.filter((y) => !f.years.length || f.years.includes(y.year));
    const s = pick.reduce((a, y) => ({ total: a.total + y.total, linked: a.linked + y.linked, none: a.none + y.none, weak: a.weak + y.weak }),
      { total: 0, linked: 0, none: 0, weak: 0 });
    el.querySelector(".mh-sum").textContent = ys.length
      ? `${num(s.total)}줄 · 교적 이어짐 ${num(s.linked)} (그중 근거 약함 ${num(s.weak)}) · 못 맞춤 ${num(s.none)}` : "";
  };
  const draw = () => {
    if (!el.isConnected) return;
    drawFilters();
    const list = el.querySelector(".mh-list");
    if (!last || !last.years.length) {
      list.innerHTML = `<p class="empty">아직 올린 명단이 없어요 — 「📤 엑셀 올리기」로 시작해 주세요</p>`;
    } else if (!rows.length) list.innerHTML = `<p class="empty">조건에 맞는 줄이 없어요</p>`;
    else list.innerHTML = mqWide.matches ? tableHtml(rows) : rows.map(cardHtml).join("");
    const pg = el.querySelector(".mh-pager");
    if (last && last.total > last.pageSize) {
      const from = last.page * last.pageSize + 1, to = Math.min(last.total, (last.page + 1) * last.pageSize);
      pg.innerHTML = `<button type="button" class="btn" data-act="prev"${last.page ? "" : " disabled"}>← 앞</button>` +
        `<span class="muted">${num(from)}–${num(to)} / ${num(last.total)}</span>` +
        `<button type="button" class="btn" data-act="next"${to < last.total ? "" : " disabled"}>다음 →</button>`;
    } else pg.innerHTML = "";
  };
  const load = async () => {
    const r = await busy(el, () => call("historyList", f));
    if (!el.isConnected) return;
    if (!r.ok) { el.querySelector(".mh-list").innerHTML = `<p class="empty">${esc(errorText(r))}</p>`; return; }
    last = r; rows = r.rows || [];
    draw();
  };

  // ── 올리기 ────────────────────────────────────────────────────────
  async function uploadAoa(aoa, name) {
    const p = parseHistorySheet(aoa, name);
    if (p.error) {
      await dialog({ title: "📂 표 머리를 찾지 못했어요", danger: true, cancel: null,
        text: `${name}\n「이름」과 「팀명」 칸 이름이 함께 적힌 줄이 앞쪽 열다섯 줄 안에 있어야 해요.` });
      return;
    }
    if (!p.rows.length) { await dialog({ title: "📂 넣을 줄이 없어요", text: name, cancel: null }); return; }
    let list = p.rows;
    if (p.needYear) {
      const y = await pickOne({ title: `몇 년도 명단인가요? — ${name}`, options: yearOptions() });
      if (!y || !el.isConnected) return;
      list = list.map((r) => (r.year ? r : { ...r, year: Number(y) }));
    }
    const checks = [];
    for (const part of sendParts(list)) {
      const d = await busy(el, () => call("historyUploadCheck", { rows: part.rows, file_name: name }));
      if (!el.isConnected) return;
      if (!d.ok) { await dialog({ title: "⚠️ 살펴보지 못했어요", text: errorText(d), cancel: null }); return; }
      checks.push({ ...part, d });
    }
    const t = mergeChecks(checks);
    if (!t.add) { await dialog({ title: "새로 넣을 줄이 없어요", html: checkHtml(name, checks), cancel: null }); return; }
    const yes = await dialog({ title: "📥 사역 이력을 넣습니다", html: checkHtml(name, checks), ok: `${num(t.add)}줄 넣기`, cancel: "그만두기" });
    if (!yes || !el.isConnected) return;
    let saved = 0, linked = 0, unlinked = 0, failed = 0;
    for (const c of checks) {
      if (!c.d.counts.add) continue;
      const d = await busy(el, () => call("historyUploadSave", { rows: c.rows, file_name: name }));
      if (!d.ok) {
        await dialog({ title: "⚠️ 넣는 중에 멈췄어요", cancel: null,
          text: `${c.year}년에서 멈췄어요 — ${errorText(d)}\n앞의 해는 들어갔을 수 있어요. 같은 파일을 다시 올리면 들어간 줄은 건너뛰어요.` });
        break;
      }
      saved += d.saved || 0; linked += d.linked || 0; unlinked += d.unlinked || 0; failed += d.failed || 0;
    }
    toast(`${num(saved)}줄 넣었어요 · 교적 이어짐 ${num(linked)} · 못 맞춤 ${num(unlinked)}${failed ? ` · 실패 ${num(failed)}` : ""}`);
    f.page = 0;
    if (el.isConnected) await load();
  }
  async function readFile(file) {
    try {
      if (!/\.xlsx?$/i.test(file.name)) throw new Error("kind");
      const XLSX = await loadXlsx();
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      // 머리(이름·팀명)가 있는 첫 시트 — 원본 해마다 파일은 Sheet1 에 명단, Sheet2·3 은 비어 있다
      let aoa = null;
      for (const s of wb.SheetNames) {
        const a = XLSX.utils.sheet_to_json(wb.Sheets[s], { header: 1, blankrows: false, raw: true });
        if (findHeader(a)) { aoa = a; break; }
      }
      if (!aoa) throw new Error("empty");
      await uploadAoa(aoa, file.name);
    } catch (e) {
      await dialog({ title: "📂 파일을 읽지 못했어요", text: `${file.name}\n${fileErrorText(e && e.message)}`, cancel: null, danger: true });
    }
  }
  async function readFiles(files) { for (const file of files) { if (!el.isConnected) return; await readFile(file); } }

  // ── 줄 창 ──────────────────────────────────────────────────────────
  async function openRow(r) {
    const d = await busy(el, () => call("historyCandidates", { id: r.id }));
    if (!el.isConnected) return;
    if (!d.ok) { if (STALE[d.error]) { toast(STALE[d.error]); await load(); } else toast(errorText(d)); return; }
    let choice = null, del = false, first = "", staleCode = "";
    const row = d.row;
    const out = await openForm({
      title: `${row.name} · ${row.year}년 ${row.team}`, okLabel: "저장",
      html: `<p class="be-ro">${badge(row)} <span>${esc(whyText(row))}</span></p>` + candHtml(d) +
        `<details class="be-set mh-edit"><summary>✏️ 칸 고치기 (이름·목장 오타 등)</summary><div class="be-set-b">${fieldsHtml(row)}</div></details>` +
        `<div class="mh-delbox"><button type="button" class="btn danger" data-act="del">이 줄 빼기</button>` +
        `<p class="be-warn" data-step2 hidden>「저장」을 누르면 이 줄을 뺍니다. 빼 둔 줄은 같은 파일을 다시 올려도 되살아나지 않아요.</p></div>`,
      onOpen: (root) => {
        first = JSON.stringify(readFields(root));
        root.addEventListener("click", (e) => {
          const c = e.target.closest("[data-cand]");
          if (c) {
            const v = c.dataset.cand;
            choice = v === "none" ? { op: "none" } : v === "auto" ? { op: "auto" } : { op: "pick", pick: Number(v) };
            for (const b of root.querySelectorAll("[data-cand]")) { const on = b === c; b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); }
            return;
          }
          const det = e.target.closest("[data-detail]");
          if (det) { const p = d.candidates[Number(det.dataset.detail)]; if (p && p.person_id) openPerson(call, p.person_id, () => toast(FAMILY_NOTE), det); return; }
          if (e.target.closest('[data-act="del"]')) {
            del = true;
            root.querySelector("[data-step2]").hidden = false;
            const ok = root.querySelector(".be-ok"); ok.textContent = "네, 뺍니다"; ok.classList.remove("primary"); ok.classList.add("danger");
          }
        });
      },
      isDirty: (root) => del || choice !== null || JSON.stringify(readFields(root)) !== first,
      onSubmit: async (root) => {
        if (del) {
          const x = await call("historyRowDelete", { id: row.id, expect: row.updated_at });
          if (!x.ok && STALE[x.error]) { staleCode = x.error; return { ok: false, message: STALE[x.error] }; }
          return x.ok ? { ok: true, value: { deleted: true } } : x;
        }
        let cur = row;
        const patch = editPatch(row, readFields(root));
        if (Object.keys(patch).length) {
          const x = await call("historyRowSave", { id: row.id, expect: row.updated_at, patch });
          if (!x.ok && STALE[x.error]) { staleCode = x.error; return { ok: false, message: STALE[x.error] }; }
          if (!x.ok) return x;
          cur = x.row || cur;
        }
        if (choice) {
          const x = await call("historyLink", { id: row.id, op: choice.op, pick: choice.pick, fp: d.fp });
          if (!x.ok) return x;
          cur = x.row || cur;
        }
        return { ok: true, value: cur };
      },
    });
    if (!out) { if (staleCode) await load(); return; }
    if (out === true) return;
    if (out.deleted) { toast("뺐어요"); await load(); return; }
    const i = rows.findIndex((x) => x.id === r.id);
    if (i >= 0) rows[i] = out;
    await load();    // 요약 수·근거 약함이 바뀌었을 수 있다
  }

  async function openAdd() {
    let first = "";
    const out = await openForm({
      title: "＋ 한 줄 더하기", okLabel: "더하기",
      html: `<p class="muted">엑셀에 빠진 분을 한 줄씩 더해요. 더하면 교인명부와 바로 맞춰 봐요.</p>` +
        fieldsHtml({ year: f.years.length === 1 ? f.years[0] : "" }),
      onOpen: (root) => { first = JSON.stringify(readFields(root)); },
      isDirty: (root) => JSON.stringify(readFields(root)) !== first,
      onSubmit: async (root) => {
        const v = readFields(root);
        const x = await call("historyRowAdd", { row: { ...v, year: Number(v.year) } });
        return x.ok ? { ok: true, value: x.row } : x;
      },
    });
    if (out && out !== true) { toast(out.linked ? "더했어요 · 교적 이어짐" : "더했어요 · 교적은 못 맞췄어요"); await load(); }
  }

  async function rematch() {
    const yes = await dialog({ title: "🔄 다시 맞출까요?", ok: "다시 맞추기",
      text: "자동으로 맞춘 줄을 지금 교인명부로 모두 다시 맞춰요.\n사람이 「이분」·「이분 아님」으로 고른 줄은 그대로 둬요.\n12월에 새 교인명부가 올라온 뒤에 눌러 주세요." });
    if (!yes) return;
    const r = await busy(el, () => call("historyRematch", { confirm: true }));
    if (!r.ok) { toast(errorText(r)); return; }
    toast(`바뀐 줄 ${num(r.changed)} · 교적 이어짐 ${num(r.linked)} / ${num(r.total)}`);
    await load();
  }

  async function exportXlsx() {
    const r = await busy(el, () => call("historyExport", { years: f.years }));
    if (!r.ok) { toast(errorText(r)); return; }
    if (!r.rows.length) { toast("내려받을 줄이 없어요"); return; }
    try {
      const XLSX = await loadXlsx();
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(exportAoa(r.rows, r.full)), "사역 이력");
      XLSX.writeFile(wb, exportName(f.years));
    } catch (e) { toast(fileErrorText(e && e.message)); }
  }

  // ── 그리기 · 사건 ──────────────────────────────────────────────────
  shell();
  await load();
  if (!el.isConnected) return;
  const fileInput = el.querySelector("[data-file]");
  fileInput.addEventListener("change", async (e) => { const files = [...e.target.files]; e.target.value = ""; await readFiles(files); });

  let qTimer = 0;
  el.querySelector(".search").addEventListener("input", (e) => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => { f.q = e.target.value.trim(); f.page = 0; load(); }, 300);
  });

  el.addEventListener("click", async (e) => {
    const yb = e.target.closest("[data-year]");
    if (yb) {
      const y = Number(yb.dataset.year);
      f.years = !yb.dataset.year ? [] : f.years.includes(y) ? f.years.filter((x) => x !== y) : [...f.years, y];
      f.page = 0; await load(); return;
    }
    const ob = e.target.closest("[data-only]");
    if (ob) { f.only = ob.dataset.only; f.page = 0; await load(); return; }
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "pick") fileInput.click();
    else if (act === "add") await openAdd();
    else if (act === "rematch") await rematch();
    else if (act === "export") await exportXlsx();
    else if (act === "prev" || act === "next") { f.page = Math.max(0, f.page + (act === "next" ? 1 : -1)); await load(); }
    else if (act === "row") { const r = rows.find((x) => x.id === Number(b.dataset.id)); if (r) await openRow(r); }
  });

  // 끌어다 놓기
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
  el.addEventListener("dragover", (e) => { if (hasFiles(e)) { e.preventDefault(); el.classList.add("mh-drop"); } });
  el.addEventListener("dragleave", () => el.classList.remove("mh-drop"));
  el.addEventListener("drop", async (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault(); el.classList.remove("mh-drop");
    await readFiles([...e.dataTransfer.files]);
  });

  // 붙여넣기 — 입력 칸·창 안이 아닐 때만(엑셀에서 복사한 표 · 탭으로 갈린 글)
  const onPaste = async (e) => {
    if (!el.isConnected) { unbindPaste?.(); return; }
    if (e.target.closest && e.target.closest("input,textarea,.be-modal,.dlg-dim")) return;
    const text = e.clipboardData?.getData("text") || "";
    const aoa = textToAoa(text);
    if (!findHeader(aoa)) return;
    e.preventDefault();
    await uploadAoa(aoa, "(붙여넣기)");
  };
  unbindPaste?.();
  unbindPaste = () => { document.removeEventListener("paste", onPaste); unbindPaste = null; };
  document.addEventListener("paste", onPaste);

  const unbind = () => { mqWide.removeEventListener("change", onMq); if (unbindMq === unbind) unbindMq = null; };
  const onMq = () => { if (!el.isConnected) { unbind(); return; } draw(); };
  unbindMq?.(); unbindMq = unbind; mqWide.addEventListener("change", onMq);
}
```

- [ ] **Step 4: `js/menus/registry.js` — 「시험 참여자」(testers) 줄 바로 아래(사역신청 묶음 안 · be-roster 앞)**

```js
  { id: "mn-history", group: "사역신청", icon: "📜", label: "사역 이력", desc: "지난 해 사역 임명 명단 올리기 · 교적 잇기 · 못 맞춘 줄 고치기",
    role: "ministry", load: () => import("./ministry/history.js") },
```

- [ ] **Step 5: `js/core/ui.js` — MESSAGES 의 `"too-many": …,` 줄 바로 아래(`};` 앞)**

```js
  // 사역 이력(2026-10-01 · 서버 history-db.ts)
  "history-too-many": "한 번에 3,000줄까지 올릴 수 있어요 — 해마다 나눠 올려 주세요",
  "history-too-long": "한 칸에 100자까지 적을 수 있어요",
  "history-exists": "같은 해·부서·팀·이름·목장·직분의 줄이 이미 있어요",
  "bad-year": "해(년도)를 1950~2100 사이 네 자리로 적어 주세요",
  "candidates-changed": "그사이 교인명부가 바뀌었어요 — 창을 닫고 다시 열어 주세요",
  "no-directory": "교인명부가 아직 올라오지 않아 맞출 수 없어요",
```

- [ ] **Step 6: `js/menus/system/audit.js` 세 곳**

(1) LABEL 의 `"people.lookup": …, "people.fill": …,` 줄 바로 아래(`};` 앞):
```js
  // 사역 이력(2026-10-01) — detail 모양은 서버 history-db.ts 의 audit() 호출과 한 벌(tests/audit.test.mjs 가 못 박는다)
  "history.upload": "사역 이력 올림", "history.add": "사역 이력 줄 더함", "history.edit": "사역 이력 줄 고침",
  "history.delete": "사역 이력 줄 뺌", "history.link": "사역 이력 교적 잇기", "history.rematch": "사역 이력 다시 맞춤",
  "history.export": "사역 이력 내려받음",
```
(2) `export const LOOKUP_MINISTRY = …;` 아래에 `export const LOOKUP_HISTORY = "명부 찾기(사역 이력)";` 를 더하고, `labelOf` 의 ministry 줄 아래에:
```js
  if (a === "people.lookup" && r.detail && r.detail.from === "history") return LOOKUP_HISTORY;
```
(3) `const joinDot = …;` 줄 바로 아래:
```js
const HIST_FIELD = { year: "해", committee: "부서", team: "팀명", role_title: "직책", name: "이름", position: "직분", mok: "목장",
  renewal: "신규/유지", src_note: "원본 메모" };
const HIST_OP = { pick: "이분으로 이음", none: "이분 아님", auto: "자동으로 되돌림" };
const evVal = (k, v) => (v == null || v === "") ? (k === "list_until" ? "기한 없음" : "(없음)")
  : k === "status" ? (EV_STATUS[v] || String(v)) : String(v);
const rowVal = (v) => (v == null || v === "") ? "(없음)" : String(v);
```
그리고 `detailText` 의 `// 사역신청·담당자 화면이 명부 번호로 한 분을 가렸으면 byPhone` 줄 바로 위:
```js
  // 사역 이력(2026-10-01) — 이름·교인ID 는 싣지 않는다(줄 id 는 target · 해·수만)
  if (r.action === "history.upload") {
    return joinDot(`${(d.years || []).join("·")}년`, `올린 줄 ${d.rows ?? 0}`, `넣음 ${d.saved ?? 0}`, `이미 있음 ${d.same ?? 0}`,
      d.deleted ? `빼 둔 줄과 같음 ${d.deleted}` : "", d.dup ? `파일 안 겹침 ${d.dup}` : "", d.bad ? `틀림 ${d.bad}` : "",
      `교적 이어짐 ${d.linked ?? 0}`, `못 맞춤 ${d.unlinked ?? 0}`, d.failed ? `실패 ${d.failed}` : "");
  }
  if (r.action === "history.add" || r.action === "history.delete") return `${d.year ?? ""}년`;
  if (r.action === "history.edit") return joinDot(`${d.year ?? ""}년`, (d.fields || []).map((k) => HIST_FIELD[k] || k).join("·"));
  if (r.action === "history.link") return joinDot(`${d.year ?? ""}년`, HIST_OP[d.op] || d.op, d.by === "directory" ? "교적 창에서" : "");
  if (r.action === "history.rematch") return joinDot(`바뀐 줄 ${d.changed ?? 0}`, `교적 이어짐 ${d.linked ?? 0}/${d.total ?? 0}`);
  if (r.action === "history.export") return joinDot(`${d.count ?? 0}줄`, (d.years || []).length ? `${d.years.join("·")}년` : "모든 해");
```

- [ ] **Step 7: `css/admin.css` 끝에**

```css
/* 📜 사역 이력(2026-10-01) — 다른 메뉴 모양을 흔들지 않게 mh- 로 */
.mh-how{margin:-4px 0 10px;line-height:1.6}
.mh-acts2{margin-bottom:12px}
.mh-years,.mh-only{margin-bottom:8px}
.mh-sum{margin:2px 0 10px}
.mh-why{margin-top:3px;font-size:12px;line-height:1.5;color:var(--gray)}
.mh-table td{vertical-align:top}
.mh-file{font-weight:800;color:var(--navy);margin-bottom:6px;word-break:break-all}
.mh-ul{margin:0 0 8px;padding-left:18px;font-size:14px;line-height:1.7}
.mh-reasons{font-size:13px;color:#41506b}
.mh-pre{margin:6px 0;font-size:14px}
.mh-bad{color:var(--error);font-weight:700}
.mh-h{margin:12px 0 6px;font-size:14px;color:var(--navy)}
.mh-h small{font-weight:400;color:var(--gray)}
.mh-cands .be-cand.on{border-color:var(--navy);background:#eef2fb;box-shadow:inset 0 0 0 1px var(--navy)}
.mh-served{display:block;font-size:12px;color:#2f7a4f;font-weight:700}
.mh-pid{display:block;font-size:12px;color:var(--gray)}
.mh-detail{min-height:36px;font-size:13px;margin:-2px 0 6px}
.mh-edit{margin-top:12px}
.mh-delbox{margin-top:14px}
.mh-delbox [data-step2]{margin-top:8px}
section.mh-drop{outline:3px dashed var(--navy);outline-offset:4px;border-radius:12px}
```

- [ ] **Step 8: 시험 · 배포 전 검사**

Run: `node --experimental-strip-types --test tests/ministry-history-logic.test.mjs tests/audit.test.mjs tests/xlsx-loader.test.mjs tests/registry.test.mjs tests/ui.test.mjs && python tools/preflight.py`
Expected: 모두 pass · preflight 네 단계 통과(문법 · 순수 시험 전부 · stamp · leak-scan).

- [ ] **Step 9: 커밋**

```bash
git add js/menus/ministry/history.js js/menus/registry.js js/core/ui.js js/menus/system/audit.js css/admin.css tests/xlsx-loader.test.mjs tests/audit.test.mjs tests/ministry-history-logic.test.mjs
git commit -m "feat(사역이력): 「📜 사역 이력」 메뉴 — 엑셀 올리기(끌어다 놓기·붙여넣기)·해/못 맞춤/근거 약함 거르기·줄 창(이분·이분 아님·되돌리기·고치기·빼기)·다시 맞추기·내려받기

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: 개발 서버 — 함수 올리기 · PROBE · 흐름 시험 · 씨앗 · 교인명부 세션에 알리기

**Files:**
- Modify: `tests/server.dev.test.mjs`(PROBE 끝 · 파일 끝)
- Create: `tests/seed-history-dev.mjs`

- [ ] **Step 1: PROBE 객체 끝(`evPerson: { name: "" },` 줄 바로 아래)에 더한다**

```js
  // 사역 이력(2026-10-01) — 읽기 · 빈 올리기 · 없는 줄(0) · 확인 없는 다시 맞추기 · 없는 해 내려받기 — 아무것도 쓰지도 기록하지도 않는다
  historyList: {},
  historyUploadCheck: { rows: [] },
  historyUploadSave: { rows: [] },
  historyRowAdd: { row: {} },
  historyRowSave: { id: 0, expect: "", patch: {} },
  historyRowDelete: { id: 0, expect: "" },
  historyCandidates: { id: 0 },
  historyLink: { id: 0, op: "none" },
  historyRematch: {},
  historyExport: { years: [1951] },
```

- [ ] **Step 2: 파일 끝에 흐름 시험을 더한다**

```js
// ── 사역 이력(2026-10-01) — 표 둘이 안 열린다 · 올리기→맞춤→가리기→잇기→다시 맞추기→빼기→다시 올리기 ──
// 고정 교인ID 990000061~63(다른 시험과 겹치지 않는 번위) · 이름은 ca-test-hi-<STAMP><한글 한 글자> · 해는 2001(씨앗·다른 시험과 안 겹침)
const HI = { ids: [990000061, 990000062, 990000063], name: `ca-test-hi-${STAMP}가`, solo: `ca-test-hi-${STAMP}나`, none: `ca-test-hi-${STAMP}없`, year: 2001 };
const hiRows = (year) => [
  { year, committee: "찬양부", team: "ca-test 찬양대", name: HI.name, position: "집사", mok: "기쁨-19", renewal: "유지" },
  { year, committee: "찬양부", team: "ca-test 찬양대", name: HI.name, position: "집사", mok: "기쁨-19", renewal: "유지" },   // 파일 안 겹침
  { year, committee: "전도부", team: "ca-test 전도대", name: HI.solo, position: "안수집사", mok: "소망-2", renewal: "신규" },
  { year, committee: "전도부", team: "ca-test 전도대", name: HI.none, position: "집사", mok: "사랑-3", renewal: "신규" },
  { year: 1900, name: "ca-test-hi-틀림" },                                                                             // 틀림(bad-year)
];
async function hiClean() {
  await rest("ministry_history?name=like.ca-test-hi-*", "DELETE");
  await rest("ministry_history_imports?file_name=eq.ca-test-hi.xlsx", "DELETE");
  await rest(`church_people?person_id=in.(${HI.ids.join(",")})`, "DELETE");
}
async function hiFixtures() {
  await hiClean();                                         // 지난번 찌꺼기(고정 ID · 이름 앞말이 이 시험 것뿐이다)
  // ⚠️ 배치 insert 는 객체들의 칸이 모두 같아야 한다(PGRST102) — d() 한 모양으로만
  const d = (person_id, name, gender, mok1, mok3, position) => ({ person_id, name, name_key: name, gender, kind2: "장년", mok1, mok3, position });
  await rest("church_people", "POST", [
    d(HI.ids[0], HI.name, "여", "기쁨", "기쁨-19목장", "집사"),
    d(HI.ids[1], HI.name, "여", "은혜", "은혜-03목장", "권사"),
    d(HI.ids[2], HI.solo, "남", "화평", "화평-05목장", "안수집사"),
  ]);
}
const hiDb = (q) => rest(`ministry_history?select=id,name,person_id,link_how,match_basis,match_reason,updated_at&${q}&order=id`, "GET");

test("사역 이력 — 표 둘(ministry_history·ministry_history_imports)은 공개 키·로그인 사용자로 안 열린다", async () => {
  for (const t of ["ministry_history", "ministry_history_imports"]) {
    const a = await fetch(`${URL_}/rest/v1/${t}?select=*&limit=1`, { headers: { apikey: ANON } });
    assert.notEqual(a.status, 200, "공개 키로 열림: " + t);
    const b = await fetch(`${URL_}/rest/v1/${t}?select=*&limit=1`, { headers: { apikey: ANON, Authorization: "Bearer " + people.super.token } });
    assert.notEqual(b.status, 200, "로그인 사용자로 열림: " + t);
  }
  const r = await fetch(`${URL_}/rest/v1/rpc/ministry_history_apply`, { method: "POST",
    headers: { apikey: ANON, Authorization: "Bearer " + people.super.token, "Content-Type": "application/json" }, body: JSON.stringify({ p: [] }) });
  assert.notEqual(r.status, 200, "로그인 사용자가 ministry_history_apply 를 부름");
});

test("사역 이력 — 올리기(살펴보기·넣기) · 맞춤 · 교인ID 가리기 · 잇기(지문) · 다시 맞추기 · 되돌리기 · 빼기 · 다시 올리기", async () => {
  await hiFixtures();
  const m = people.ministry.token;
  const md = (await mindirPerson()).token;
  const year = HI.year;
  try {
    const chk = (await call(m, "historyUploadCheck", { rows: hiRows(year), file_name: "ca-test-hi.xlsx" })).body;
    assert.equal(chk.ok, true, JSON.stringify(chk));
    assert.deepEqual([chk.counts.add, chk.counts.dup, chk.counts.bad], [3, 1, 1]);
    assert.deepEqual([chk.preview.linked, chk.preview.unlinked], [2, 1]);
    assert.equal((await hiDb(`year=eq.${year}&name=like.ca-test-hi-*`)).length, 0, "살펴보기가 썼다");

    const sv = (await call(m, "historyUploadSave", { rows: hiRows(year), file_name: "ca-test-hi.xlsx" })).body;
    assert.deepEqual([sv.ok, sv.saved, sv.linked, sv.unlinked], [true, 3, 2, 1], JSON.stringify(sv));
    const rows = await hiDb(`year=eq.${year}&name=like.ca-test-hi-*`);
    const by = Object.fromEntries(rows.map((r) => [r.name, r]));
    assert.deepEqual([by[HI.name].person_id, by[HI.name].match_basis], [HI.ids[0], "같은 소속"]);
    assert.equal(by[HI.solo].person_id, HI.ids[2]);
    assert.deepEqual([by[HI.none].person_id, by[HI.none].match_reason], [null, "교인명부에 같은 이름이 없음"]);

    // 목록 — 사역신청 역할에게는 교인ID 칸 자체가 없다 · 교인명부도 있는 분에게는 있다
    const lm = (await call(m, "historyList", { years: [year], q: "ca-test-hi-" })).body;
    assert.equal(lm.total, 3);
    assert.ok(lm.rows.every((r) => !("person_id" in r)), "사역신청 역할에게 person_id 가 실렸다");
    for (const id of HI.ids) assert.ok(!JSON.stringify(lm).includes(String(id)), "교인ID 가 실렸다: " + id);
    const ld = (await call(md, "historyList", { years: [year], q: "ca-test-hi-" })).body;
    assert.ok(ld.rows.some((r) => r.person_id === HI.ids[0]));

    // 후보 — 같은 이름 두 분 · 사역신청 역할에게 교인ID 없음 · 지문 · people.lookup(from:"history")
    const id0 = by[HI.name].id;
    const cm = (await call(m, "historyCandidates", { id: id0 })).body;
    assert.equal(cm.candidates.length, 2);
    for (const id of HI.ids) assert.ok(!JSON.stringify(cm).includes(String(id)), "후보에 교인ID: " + id);
    assert.match(cm.fp, /^[0-9a-f]{8}$/);
    const cd = (await call(md, "historyCandidates", { id: id0 })).body;
    assert.deepEqual(cd.candidates.map((c) => c.person_id), [HI.ids[0], HI.ids[1]]);
    assert.equal(cd.fp, cm.fp, "지문은 역할과 상관없이 같다(화면 글자로만 만든다)");

    // 잇기 — 지문이 틀리면 막힘 · 맞으면 두 번째 분(권사)으로 · manual
    assert.equal((await call(m, "historyLink", { id: id0, op: "pick", pick: 1, fp: "00000000" })).body.error, "candidates-changed");
    assert.equal((await call(m, "historyLink", { id: id0, op: "pick", pick: 1, fp: cm.fp })).body.ok, true);
    // 다시 맞추기 — 확인 없으면 안 돈다 · 돌아도 사람이 이은 줄은 그대로
    assert.equal((await call(m, "historyRematch", {})).body.error, "needs-confirm");
    assert.equal((await call(m, "historyRematch", { confirm: true })).body.ok, true);
    const after = (await hiDb(`id=eq.${id0}`))[0];
    assert.deepEqual([after.person_id, after.link_how, after.match_basis], [HI.ids[1], "manual", "사람이 이음"]);
    // 자동으로 되돌리기 → 다시 같은 소속 분
    assert.equal((await call(m, "historyLink", { id: id0, op: "auto" })).body.ok, true);
    const back = (await hiDb(`id=eq.${id0}`))[0];
    assert.deepEqual([back.person_id, back.link_how], [HI.ids[0], "auto"]);

    // 빼기 → 다시 올리면 「빼 둔 줄과 같음」 · 나머지는 「이미 있음」 · 아무것도 더하지 않는다
    const nr = by[HI.none];
    assert.equal((await call(m, "historyRowDelete", { id: nr.id, expect: nr.updated_at })).body.ok, true);
    const again = (await call(m, "historyUploadSave", { rows: hiRows(year), file_name: "ca-test-hi.xlsx" })).body;
    assert.deepEqual([again.saved, again.counts.same, again.counts.deleted, again.counts.bad], [0, 3, 1, 1]);

    // 기록 — history.upload 에 이름이 없다
    const logs = await rest(`admin_audit?select=action,detail&action=eq.history.upload&member_id=eq.${people.ministry.memberId}&order=id.desc&limit=2`, "GET");
    assert.ok(logs.length >= 1);
    assert.ok(!JSON.stringify(logs).includes("ca-test-hi-"), "기록에 이름이 실렸다");
  } finally {
    await hiClean();
  }
});
```

- [ ] **Step 3: 개발 함수에 올린다(작업 가지에서)**

```bash
cd C:/Projects/church-admin/.worktrees/ministry-history
git status --short     # 이 과제 파일만 있어야 한다(배포는 작업 트리를 올린다)
supabase functions deploy church-admin --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo
```
Expected: `Deployed Functions on project ktpwthwqzgcqcrmsafdo: church-admin`

- [ ] **Step 4: 개발 서버 시험**

Run: `set -a; . ~/.church-admin/dev.env; set +a; node --experimental-strip-types --test tests/server.dev.test.mjs`
Expected: 모두 pass — 특히 「역할이 필요한 액션마다 시험 입력(PROBE)이 있다」 · 권한 표 · 「사역 이력 — 표 둘 …」 · 「사역 이력 — 올리기 …」.

- [ ] **Step 5: 개발 씨앗 `tests/seed-history-dev.mjs`**

```js
// 개발 DB 에 가짜 사역 이력 씨앗 — 교인명부 세션(자세히 창 사역 탭)과 화면 확인용(2026-10-01).
//   set -a; . ~/.church-admin/dev.env; set +a; node --experimental-strip-types tests/seed-history-dev.mjs [--clean]
// ⚠️ 개발 프로젝트에만 돈다. 이름은 개발 church_people(가짜 명부)에서 그때 읽는다 — 이 파일에 이름을 적지 않는다.
// ⚠️ source_file = 'ca-demo-seed' 줄만 만들고 지운다(server.dev 시험은 ca-test- 만 지운다 — 서로 안 건드린다).
// 2024~2026 세 해 · 앞 40분 · 일부는 목장을 바꾸고(같은 교구 다름) · 명부에 없는 이름 셋 · 맞춤은 history-match.ts 로 계산해 apply 로 쓴다.
import { matchAll, srcKey, toHPerson, HISTORY_PEOPLE_COLS } from "../supabase/functions/church-admin/history-match.ts";

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
async function all(path) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const page = await rest(`${path}&offset=${from}&limit=1000`);
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

await rest("ministry_history?source_file=eq.ca-demo-seed", "DELETE");
if (process.argv.includes("--clean")) { console.log("지움"); process.exit(0); }

const dir = await all(`church_people?select=${HISTORY_PEOPLE_COLS}&order=person_id`);
const adults = dir.filter((p) => p.mok1 && /-\d+목장$/.test(p.mok3)).slice(0, 40);
if (!adults.length) throw new Error("개발 church_people 에 교구 분이 없다 — tools/people/fake_people.py 로 가짜 명부부터");
const TEAMS = [["찬양부", "ca-demo 찬양대"], ["전도부", "ca-demo 전도대"], ["교육위원회", "ca-demo 유년부"]];
const recs = [];
for (const [yi, year] of [2024, 2025, 2026].entries()) {
  adults.forEach((p, i) => {
    if ((i + yi) % 3 === 0) return;                                   // 해마다 조금씩 다른 분
    const n = Number(/-(\d+)목장$/.exec(p.mok3)[1]);
    const mok = i % 7 === 0 && year < 2026 ? `${p.mok1}-${n + 10}` : `${p.mok1}-${n}`;   // 옛 해엔 목장이 달랐던 분
    const [committee, team] = TEAMS[i % TEAMS.length];
    recs.push({ year, committee, team, name: p.name, position: p.position || "집사", mok, renewal: yi ? "유지" : "신규" });
  });
  for (const k of ["가", "나", "다"]) recs.push({ year, committee: "찬양부", team: "ca-demo 찬양대", name: `ca-demo-없는분${k}`, position: "집사", mok: "기쁨-1", renewal: "신규" });
}
const rows = recs.map((r) => ({ ...r, role_title: "", src_note: "", src_key: srcKey(r), source: "excel", source_file: "ca-demo-seed", link_how: "auto" }));
const ins = [];
for (let i = 0; i < rows.length; i += 500) ins.push(...(await rest("ministry_history", "POST", rows.slice(i, i + 500))));
const res = matchAll(ins.map((r) => ({ ...r, id: Number(r.id) })), dir.map(toHPerson));
const byId = new Map(ins.map((r) => [Number(r.id), r]));
const p = res.map((x) => ({ id: x.id, expect: byId.get(x.id).updated_at, person_id: x.person_id, match_basis: x.match_basis, match_reason: x.match_reason }));
const n = await rest("rpc/ministry_history_apply", "POST", { p });
console.log(`씨앗 ${ins.length}줄 · 교적 이어짐 ${res.filter((x) => x.person_id !== null).length} · 맞춤 쓴 줄 ${n}`);
```

Run: `set -a; . ~/.church-admin/dev.env; set +a; node --experimental-strip-types tests/seed-history-dev.mjs`
Expected: `씨앗 N줄 · 교적 이어짐 M · 맞춤 쓴 줄 N`(N 은 백 남짓 · M ≤ N).

- [ ] **Step 6: 커밋**

```bash
git add tests/server.dev.test.mjs tests/seed-history-dev.mjs
git commit -m "test(사역이력): 개발 서버 — PROBE 열 개 · 표 안 열림 · 올리기→맞춤→가리기→잇기(지문)→다시 맞추기→되돌리기→빼기→다시 올리기 · 개발 씨앗

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: 교인명부 세션에 「개발 표가 열렸다」 알린다**

SendMessage to `bible-memorize-church-app-v2-99`: 개발 DB 에 SQL 005 와 씨앗(source_file `ca-demo-seed` · 2024~2026)이 들어갔다 · 가지 `ministry-history` 의 `history-db.ts`(`rematchHistoryRows`)·`history-match.ts`(`historyLinkPatch`·`historyUnlinkPatch`) 를 쓰면 된다 · 운영은 친구 허락 뒤.

### Task 8: 안내 8절 · 문서

**Files:**
- Modify: `privacy.html`(7절 카드 뒤 · `</main>` 앞) · `CLAUDE.md`(교회 어드민 · `## 비상 절차` 앞) — 진행 기록부 `.superpowers/sdd/progress.md` 는 git 이 무시하는 파일이라 커밋하지 않는다(진행 관리자가 적는다)
- Create(v2 저장소): `docs/notes/ministry-history.md` · Modify(v2): `CLAUDE.md` 지도 표 한 줄

- [ ] **Step 1: `privacy.html` — 7절 카드(`</div>`) 뒤, `</main>` 앞**

```html
  <div class="card">
    <h3>8. 사역 이력(지난 해 사역 임명)</h3>
    <p>교회가 해마다 만든 사역 임명 명단(엑셀)을 옮겨 적어, 어느 해에 어느 부서·팀에서 섬기셨는지를 남겨요. 2027년부터는 앱으로 받은 사역신청 중 임명된 것도 이리로 옮겨요.<br>
      담는 것: 해, 부서(위원회), 팀, 직책(있으면), 그때 명단에 적힌 이름·직분·목장, 신규/유지, 원본 명단의 메모,
      그리고 교인명부의 교인ID(이름·소속으로 맞춰 본 것 · 맞는 분을 못 찾으면 비워 두고 그 까닭을 적어요).<br>
      잇는 법: 이름이 같고 소속·직분·나이·성별·등록일·다른 해의 같은 팀이 맞는 분을 서버가 골라요. 담당자가 「이분」·「이분 아님」으로 고칠 수 있고, 사람이 고친 것은 다시 맞춰도 바뀌지 않아요.<br>
      보는 사람: 총괄 관리자와 「사역신청」 역할을 드린 담당자가 명단을 보고 고쳐요. 이분들께는 교인ID 가 보이지 않아요(이어졌는지만 보여요).
      총괄 관리자와 「교인명부」 역할도 있는 담당자에게는 교인ID 와 자세히 보기가 함께 보이고, 교인명부의 자세히 보기에서 그분의 사역 이력을 봐요(6번).<br>
      기록: 누가 언제 명단을 올리고(건수만) · 줄을 더하고 · 고치고 · 빼고 · 교적을 잇고 · 다시 맞추고 · 내려받았는지 남겨요(해와 줄 번호만 — 이름과 교인ID 는 남기지 않아요).
      교적을 잇느라 교인명부에서 같은 이름을 찾아본 것은 찾은 이름과 결과 수로 남아요.<br>
      보관과 삭제: 명단에서 뺀 줄은 지우지 않고 「뺐다」는 표시만 남겨요(같은 명단을 다시 올려도 되살아나지 않게). 빼 달라고 하시려면 4번의 요청처로 말씀해 주세요.</p>
  </div>
```
⚠️ `tests/be-roster-ui.test.mjs` 가 `"<h3>8. "` 로 8절을 찾고, 「찾기 후보에는 교적의 목장 칸도 그대로 보여」 문구가 정확히 두 번이어야 한다 — 8절에 그 문구를 쓰지 않는다.

- [ ] **Step 2: 교회 어드민 `CLAUDE.md` — `## 비상 절차` 바로 위**

```markdown
## 사역 이력 (2026-10-01)
지난 해 사역 임명 명단(엑셀 · 2022~2026, 더 오래된 해도)을 올려 교인명부의 교인ID 와 잇는다. 메뉴 「📜 사역 이력」(`js/menus/ministry/history.js` · 역할 `ministry`).
설계 v2 `docs/superpowers/specs/2026-10-01-church-admin-ministry-history-design.md` · 계획 v2 `docs/superpowers/plans/2026-10-01-church-admin-ministry-history.md`.
- 표 `ministry_history`·`ministry_history_imports`·함수 `ministry_history_apply`(SQL 005) — 서버만. 맞춤 규칙은 `history-match.ts`(순수), 표 쪽은 `history-db.ts`(`makeHistory` · npm import 없음 — 교인명부 세션이 import 한다).
- ⚠️ **교인명부 세션(자세히 창 사역 탭)이 이 표를 person_id 로 읽고 「이분 것」으로 고친다** — 칸 이름·`historyLinkPatch`·`historyUnlinkPatch`·`rematchHistoryRows(db, ids)` 를 바꾸면 그쪽도(설계 §7).
- ⚠️ `person_id` 는 `directory`·`super` 응답에만(`rowOut(r, full)`). 사역신청 역할의 「이분」은 후보 차례 번호 + 지문 `fp`(화면 글자로 만든 FNV — 교인ID 로 만들지 않는다).
- ⚠️ `link_how` `manual`·`none` 은 자동 맞춤이 덮지 않는다. 다시 맞추기는 **모든 해를 함께** 계산한다(다른 해 같은 팀 「유지」가 근거라 해 하나만 돌리면 결과가 달라진다).
- 같은 줄 열쇠 `src_key`(해|부서|팀|이름|목장|직분)는 올린 그대로 — 고쳐도 안 바뀐다. 빼기는 `deleted_at` 표시만(다시 올려도 안 되살아난다).
- 2025년 이전 명단의 「기쁨-1」은 목장 모름으로 읽는다(검증 추정 · 친구 확인 대기) — 바뀌면 `parseRow` 한 줄과 시험만.
- 규칙을 바꾸면 이 PC 에서 `python tools/history/check_real.py` — 진짜 명부·통합 엑셀로 수와 검증 지적 64줄을 맞대 본다(2026-09-29 명부 기준 4,042 · 51 · 수만 찍는다).
- 개발 DB 씨앗: `node --experimental-strip-types tests/seed-history-dev.mjs [--clean]`(source_file `ca-demo-seed`).
- 나중: 「이력으로 넘기기」(2027 임명확정 → 이 표 · `order_id` · 교인ID 는 교인명부 세션의 `people_links` 에서) — 설계 §8.
```

- [ ] **Step 2b: (진행 관리자 몫 · 구현자는 건너뛴다) 본 체크아웃 `C:\Projects\church-admin\.superpowers\sdd\progress.md` 끝에 — git 이 무시하는 파일이라 커밋하지 않는다**

```text
=== 사역 이력(2026-10-01) — worktree ministry-history ===
# 설계: v2 docs/superpowers/specs/2026-10-01-church-admin-ministry-history-design.md · 계획: v2 docs/superpowers/plans/2026-10-01-church-admin-ministry-history.md
Task N: complete (commits <첫>..<끝>, review approved; dev 시험 통과; NOT pushed)   ← 과제를 마칠 때마다 한 줄
```

- [ ] **Step 3: v2 `docs/notes/ministry-history.md`(새 파일)**

```markdown
# 사역 이력(지난 해 사역 임명 · 교인ID) — 교회 어드민

> 2026-10-01 만듦. 코드는 교회 어드민 저장소(`c:\Projects\church-admin`)에 있다. 이 문서는 성경암송 쪽에서 볼 지도다.
> 설계 `docs/superpowers/specs/2026-10-01-church-admin-ministry-history-design.md` · 계획 `docs/superpowers/plans/2026-10-01-church-admin-ministry-history.md`

## 무엇
- 교회가 해마다 만든 사역 임명 명단(엑셀 「부서·팀명·이름·직분·목장·신규 / 유지」)을 교회 어드민 「📜 사역 이력」에 올린다.
- 줄마다 교인명부의 교인ID 를 서버가 맞춰 붙이고, 못 맞추면 비고에 까닭을 적는다. 사역신청 담당자가 「이분」·「이분 아님」으로 고친다.
- 교인명부 「자세히」 창(교인명부 세션)이 교인ID 로 이 표를 읽어 사역 탭에 보인다.
- 2027년부터는 앱 사역신청의 임명확정 줄을 임명이 끝난 뒤 「이력으로 넘기기」로 이 표에 옮긴다(아직 안 만들었다 · 설계 §8).

## 지금 상태(2026-10-01)
- 2022~2026 통합 4,093줄(해마다 같은 줄 하나만 · 2023 은 한 파일만) — 2026-09-29 명부 기준 4,042줄 이어짐 · 51줄 못 맞춤(로컬 대조).
- ⚠️ 진짜 엑셀은 `church-admin/Data/`(저장소 밖으로 옮기길 권함 · `.gitignore` 에 넣었다).

## ⚠️ 함정
- **성경암송 사역신청 표(`ministry_orders`)에 지난 해를 넣지 않는다** — 앱 계정(user_id)·그해 팀 목록(team_id)이 반드시 있어야 하고, 앱의 직분 기본값이 해를 가리지 않고 「가장 최근 줄」을 읽는다(친구 결정 2026-10-01 · 새 표).
- 맞춤 규칙은 `history-match.ts` 한 곳(서버·시험·대조 도구·씨앗이 같은 파일). 2026-10-01 독립 검증 다섯 갈래에서 틀린 맞춤 약 12줄(권사→남자, 집사→직분 없는 청년, 은혜로 옮긴 권사를 기쁨의 젊은 집사로)이 나와 빼기 규칙을 세웠다 — 규칙을 느슨하게 되돌리지 말 것.
- 같은 해 같은 교구에서 목장만 다른 두 줄은 **둘 다 그분**으로 둔다(해 중간 이동·오타 — 비우면 10줄을 잃었다).
```

- [ ] **Step 4: v2 `CLAUDE.md` 지도 표 — 「교인명부(어드민 …)」 줄 바로 아래에 한 줄**

```markdown
| 사역 이력(교회 어드민 「📜 사역 이력」 · 지난 해 사역 임명 엑셀 → 교인ID · `ministry_history` · 2026-10-01) — 성경암송 `ministry_orders` 에 지난 해를 넣지 말 것 | `docs/notes/ministry-history.md` · 설계 `docs/superpowers/specs/2026-10-01-church-admin-ministry-history-design.md` |
```

- [ ] **Step 5: 시험 · 커밋(두 저장소 따로)**

Run(교회 어드민): `node --experimental-strip-types --test tests/be-roster-ui.test.mjs tests/be-roster-logic.test.mjs && python tools/preflight.py`
Expected: pass

```bash
git add privacy.html CLAUDE.md
git commit -m "docs(사역이력): 개인정보 안내 8절 · CLAUDE.md 절 · 진행 기록

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
cd /c/Projects/bible-memorize-church-app-v2
git add docs/notes/ministry-history.md && git diff --cached --stat     # 남의 것이 없는지
git commit -m "docs(사역이력): docs/notes/ministry-history.md · CLAUDE.md 지도 한 줄

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- docs/notes/ministry-history.md CLAUDE.md
```
⚠️ v2 `CLAUDE.md` 는 다른 세션도 고친다 — 이 한 줄만 담기(`git diff -- CLAUDE.md` 로 남의 헝크가 있으면 `git apply --cached` 로 내 헝크만).

### Task 9: localhost 화면 확인(개발 DB · 폰·PC)

- [ ] **Step 1:** 작업 가지에서 `python -m http.server 8000`(다른 세션이 8000 을 쓰고 있으면 무엇이 떠 있는지 먼저 본다 · 끌 때는 내가 띄운 PID 만) → `http://localhost:8000/#/mn-history`(「개발 DB」 띠 확인).
- [ ] **Step 2:** 사역신청 역할 계정으로 — 씨앗 목록 · 해 거르기 · 「못 맞춘 줄만」·「근거 약한 줄만」 · 찾기 · 쪽 넘기기 · 줄 창(후보 · 「이분」→저장 → ✓ 이어짐 · 「이분 아님」 · 「자동 맞춤으로 되돌리기」 · 칸 고치기 · 빼기 두 단계) · ＋ 한 줄 더하기 · 🔄 다시 맞추기 · ⬇ 내려받기(xlsx 열어 교적ID 칸이 비었는지).
- [ ] **Step 3:** 교인명부+사역신청 계정으로 — 후보에 교인ID · 🔎 자세히 창이 열린다 · 내려받기에 교적ID 가 찬다.
- [ ] **Step 4:** 가짜 엑셀(씨앗 이름 몇 줄 · 원본 꼴: 1행 제목 · 3행 머리)을 만들어 올리기 — 끌어다 놓기 · 붙여넣기 · 같은 파일 두 번(두 번째는 「이미 있음」).
- [ ] **Step 5:** 헤드리스로 폰(400px)·PC(1280px) 두 폭을 찍어 넘침·겹침이 없는지 본다(헤드리스 크롬은 창 폭 526px 고정 — 잘린 그림을 배치 오류로 오인하지 말 것).

### Task 10: 운영 개시(친구 허락 뒤) · 첫 적재 · 알림

- [ ] **Step 1: 친구에게 허락을 받는다** — 운영 SQL 005 · 운영 함수 배포 · main 머지·푸시(화면 배포). AskUserQuestion 으로, 돌릴 명령을 보여 주고.
- [ ] **Step 2: 운영 SQL · 노출 점검**

```bash
cat ~/.church-admin/supa-prod/supabase/.temp/project-ref; echo     # xnomlgydifiqiybervtf
supabase --workdir ~/.church-admin/supa-prod db query --linked -f C:/Projects/church-admin/.worktrees/ministry-history/supabase/sql/005_ministry_history.sql
supabase --workdir ~/.church-admin/supa-prod db query --linked -f C:/Projects/church-admin/.worktrees/ministry-history/supabase/sql/check-authenticated-exposure.sql
```
Expected: 0 · 0 · 노출 점검 0행.
- [ ] **Step 3: 운영 함수 → main 머지·푸시**

```bash
supabase functions deploy church-admin --no-verify-jwt --project-ref xnomlgydifiqiybervtf
cd /c/Projects/church-admin && git checkout main && git pull --ff-only && git merge --no-ff ministry-history -m "merge: 사역 이력(2026-10-01)" && git push
```
⚠️ 함수가 먼저다(화면이 먼저 나가면 「화면이 옛 판이에요」가 아니라 unknown-action 으로 메뉴가 빈다).
- [ ] **Step 4: 첫 적재는 친구가 운영 화면에서** — `Data/2022-2026_사역임명_통합.xlsx` 하나(또는 해마다 파일 · 2023 은 한 파일만이어도 두 번째는 「이미 있음」).
  확인: 총괄로 「📜 사역 이력」 요약이 `4,093줄 · 교적 이어짐 ≈4,042 · 못 맞춤 ≈51`(가족 열쇠 차이로 한두 줄 다를 수 있다).
- [ ] **Step 5:** 교인명부 세션(99)에 「운영 표 열림」 알림 · 친구에게 `Data/` 를 저장소 밖으로 옮기길 권하기 · 「기쁨-1」의 뜻 확인 부탁.

