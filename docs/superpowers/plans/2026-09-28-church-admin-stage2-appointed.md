# 교회 어드민 2단계(임명현황 옮기기) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 성경암송 관리 화면의 「🎉 임명현황」(`admin-stats.html` `renderMinistryAppointed`)을 교회 어드민(admin.onlybible.kr)의 첫 사역신청 메뉴로 옮긴다 — 부서별·교구별·사람별 보기, 찾기, CSV 내려받기.

**Architecture:** 서버 함수 `church-admin` 에 읽기 전용 액션 `ministryAppointed`(역할 `ministry`)를 더한다 — 옛 `ministryList` 를 통째로 옮기지 않고 **임명확정만, 「누가 어디에」 칸만** 준다(번호·메모·user_id 없음). 화면은 `js/menus/ministry/appointed.js` 한 파일(순수 함수는 export 해 Node 로 시험). 옛 화면·옛 액션은 얼린 채 그대로 둔다.

**Tech Stack:** 1단계와 같음(빌드 없는 ES 모듈 · supabase-js 2.117.2 · Deno Edge Function · Node 22 내장 시험).

**설계:** `docs/superpowers/specs/2026-09-28-church-admin-design.md` 3절(차례 2) · 1단계 계획 `2026-09-28-church-admin-stage1.md` · 저장소 `c:\Projects\church-admin` 의 `CLAUDE.md`

## Global Constraints

- 저장소 `C:\Projects\church-admin`. **도메인 연결 뒤라 main 에 푸시하면 곧바로 운영 화면(admin.onlybible.kr)이 바뀐다** — Task 1·2 는 **커밋만 하고 푸시하지 않는다.** 푸시는 Task 3 에서 서버를 운영에 올린 **뒤**.
- 개발 Supabase `ktpwthwqzgcqcrmsafdo` 먼저. 운영 `xnomlgydifiqiybervtf` 는 Task 3 에서만.
- 성경암송 저장소(`bible-memorize-church-app-v2`)의 코드·화면·`api` 는 **손대지 않는다**(얼림).
- 새 액션 = `authz.ts` `ACTION_ROLES` + `index.ts` `switch` case + `tests/server.dev.test.mjs` `PROBE` — 셋 다.
- 응답에 `user_id`·`auth_user_id`·휴대폰 번호·담당자 메모(note)를 싣지 않는다.
- 사람은 「김세웅-화평20」 **한 가지 꼴**로만 적는다(소속의 빈칸을 없애고 「목장」을 뗀다). 직분·번호는 싣지 않는다.
- 낱말: `committee` 는 어디서나 **「부서」**, 소속 쪽은 **「교구」**.
- 내려받기는 **지금 화면에 보이는 것만**(찾기가 걸려 있으면 그것만) — 화면과 파일이 달라지면 안 된다. CSV 는 BOM 을 붙인다.
- 화면 표준 v1: 주 동작 48px · 보조 44px · 칩 36px · 글씨 13px 이상(회색은 `#6b778c` 까지). 사용자 글자는 모두 `esc`.
- 커밋 메시지 끝에 `Co-Authored-By:` 한 줄(실제로 쓴 모델 이름).

---

### Task 1: 서버 — `ministryAppointed` 액션 · 권한 · 시험 · 개발 배포

**Files:**
- Modify: `supabase/functions/church-admin/authz.ts`, `supabase/functions/church-admin/index.ts`, `tests/authz.test.mjs`, `tests/server.dev.test.mjs`

**Interfaces:**
- Produces: 액션 `ministryAppointed`(본문 `{action:"ministryAppointed"}`, 역할 `ministry` 또는 `super`) →
  `{ ok:true, year:number, rows: { name, who, committee, team, option, at:"YYYY-MM-DD", decided_at:string|null, source:"app"|"paper" }[] }`
  (임명확정만. `who` 는 「화평 20목장」·「중등부 3학년」 꼴. 이 여덟 칸 밖의 것은 없다.)
- `knownRoles()` 가 `["ministry","super"]` 가 된다(Task 2 의 메뉴 역할 시험이 이것을 쓴다).

- [ ] **Step 1: 실패하는 단위 시험** — `tests/authz.test.mjs` 끝에 더한다:

```js
test("ministry 액션 × 사람 여섯 가지 — 사역 담당·총괄은 통과, 역할 없는 분은 막힘", () => {
  const cases = [
    [null, "not-registered"],
    [{ status: "pending", roles: ["ministry"] }, "pending"],
    [{ status: "disabled", roles: ["ministry"] }, "disabled"],
    [{ status: "active", roles: [] }, "forbidden"],
    [{ status: "active", roles: ["ministry"] }, "ok"],
    [{ status: "active", roles: ["super"] }, "ok"],
  ];
  const ministryActions = Object.keys(ACTION_ROLES).filter((k) => ACTION_ROLES[k] === "ministry");
  assert.deepEqual(ministryActions, ["ministryAppointed"]);
  for (const a of ministryActions) for (const [m, want] of cases) assert.equal(canCall(a, m), want, a);
  assert.deepEqual(knownRoles(), ["ministry", "super"]);
});
```

Run: `cd /c/Projects/church-admin && node --experimental-strip-types --test tests/authz.test.mjs` → FAIL(`ministryActions` 가 `[]`).

- [ ] **Step 2: `authz.ts` — `ACTION_ROLES` 에 한 줄** (`auditList` 줄 다음):

```ts
  // 사역신청(2단계 · 2026-09-28) — 임명현황. 읽기만, 임명확정만, 번호·메모 없음.
  ministryAppointed: "ministry",
```

Run 같은 명령 → PASS(모두 통과).

- [ ] **Step 3: `index.ts` — 액션 본문** (`auditList` 함수 다음, `Deno.serve` 앞에):

```ts
// ---------- 사역신청 (2단계 · 2026-09-28) ----------
// 성경암송 api 의 ministryList 에서 임명현황에 필요한 칸만 옮겨 왔다 — 「누가 어디에」만.
// ⚠️ 번호(phone)·담당자 메모(note)·user_id 는 싣지 않는다. 현황(3단계)이 오면 ministryList 를 따로 옮긴다.
// 연도는 성경암송과 같은 app_config('ministry').year(없으면 2027).
const kstDay = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);

async function ministryYear(): Promise<number> {
  const { data, error } = await db.from("app_config").select("value").eq("key", "ministry").maybeSingle();
  if (error) throw error;
  return Number((data?.value as any)?.year) || 2027;
}

async function ministryAppointed() {
  const year = await ministryYear();
  const { data, error } = await db.from("ministry_orders")
    .select("user_id,name,who,committee,team,option,created_at,decided_at,source")
    .eq("year", year).eq("status", "임명확정")
    .order("created_at", { ascending: true }).limit(5000);
  if (error) throw error;
  const rows = (data ?? []) as any[];
  // 이름·소속이 비어 있는 옛 행은 users 에서 채운다(api ministryList 와 같은 규칙)
  const need = [...new Set(rows.filter((r) => !r.name || !r.who).map((r) => r.user_id).filter(Boolean))];
  const umap = new Map<string, any>();
  if (need.length) {
    const { data: us, error: e2 } = await db.from("users").select("id,type,gu,mok,bu,grade,name").in("id", need);
    if (e2) throw e2;
    for (const u of (us ?? []) as any[]) umap.set(u.id, u);
  }
  return {
    ok: true,
    year,
    rows: rows.map((r) => {
      const u = umap.get(r.user_id);
      const uWho = u ? (u.type === "교구" ? [u.gu, u.mok ? u.mok + "목장" : ""] : [u.bu, u.grade]).filter(Boolean).join(" ") : "";
      return {
        name: r.name || u?.name || "",
        who: r.who || uWho,
        committee: r.committee ?? "",
        team: r.team ?? "",
        option: r.option ?? "",
        at: r.created_at ? kstDay(r.created_at) : "",
        decided_at: r.decided_at ?? null,
        source: r.source === "paper" ? "paper" : "app",
      };
    }),
  };
}
```

`switch` 에 한 줄(`auditList` case 다음):

```ts
      case "ministryAppointed": return json(await ministryAppointed());
```

- [ ] **Step 4: 개발 서버 시험 고치기** — `tests/server.dev.test.mjs`:

(a) `PROBE` 에 한 줄: `ministryAppointed: {},`

(b) 「권한 표」 시험을 액션의 역할에 따라 기대값이 갈리게 바꾼다(지금은 ministry 사람을 모든 액션에서 `forbidden` 으로 본다):

```js
test("권한 표: 사람 다섯 × 역할이 필요한 액션", async () => {
  const want = (who, role) => ({
    none: "not-registered", pending: "pending", disabled: "disabled",
    ministry: role === "ministry" ? null : "forbidden", super: null,
  })[who];
  for (const [a, payload] of Object.entries(PROBE)) {
    const role = ACTION_ROLES[a];
    for (const who of ["none", "pending", "disabled", "ministry", "super"]) {
      const gate = want(who, role);
      const r = await call(people[who].token, a, payload);
      if (gate) {
        assert.equal(r.status, 403, `${who} ${a} ${JSON.stringify(r.body)}`);
        assert.equal(r.body.error, gate, `${who} ${a}`);
      } else {
        assert.notEqual(r.status, 500, `${who} ${a} ${JSON.stringify(r.body)}`);
        assert.ok(!GATES.includes(r.body.error), `${who} ${a} ${JSON.stringify(r.body)}`);
      }
    }
  }
});
```

(c) 새 시험(파일 끝):

```js
test("임명현황: 임명확정만 · 여덟 칸만 · 개수가 DB 와 같다", async () => {
  const r = await call(people.ministry.token, "ministryAppointed");
  assert.equal(r.body.ok, true, JSON.stringify(r.body));
  assert.ok(Number.isInteger(r.body.year));
  const allowed = ["name", "who", "committee", "team", "option", "at", "decided_at", "source"];
  for (const row of r.body.rows) {
    assert.deepEqual(Object.keys(row).sort(), [...allowed].sort());
    assert.match(row.at, /^(\d{4}-\d{2}-\d{2})?$/);
    assert.ok(row.source === "app" || row.source === "paper");
  }
  // 옛 화면과 같은 명단인지 — 서비스 키로 DB 를 직접 세어 맞댄다
  const res = await fetch(`${URL_}/rest/v1/ministry_orders?select=id&year=eq.${r.body.year}&status=eq.${encodeURIComponent("임명확정")}`,
    { headers: { ...svc, Prefer: "count=exact", Range: "0-0" } });
  const total = Number((res.headers.get("content-range") || "").split("/")[1]);
  assert.equal(r.body.rows.length, total, "DB 의 임명확정 수와 다르다");
});
```

- [ ] **Step 5: preflight · 커밋(푸시 안 함) · 개발 배포 · 개발 시험**

```bash
cd /c/Projects/church-admin && python tools/preflight.py      # 모두 통과
git add supabase/functions/church-admin/authz.ts supabase/functions/church-admin/index.ts tests/authz.test.mjs tests/server.dev.test.mjs
git commit -m "feat(사역): 임명현황 액션 ministryAppointed — 임명확정만, 누가 어디에만(번호·메모 없음)"   # + Co-Authored-By 줄
git status --short     # 깨끗해야 한다(배포는 작업 트리를 올린다)
supabase functions deploy church-admin --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo
set -a && . /c/Users/sewki/.church-admin/dev.env && set +a && node --experimental-strip-types --test tests/server.dev.test.mjs
```
Expected: 개발 시험 **10개 모두 통과**(개발 DB 에는 임명확정 4건 — 앱 1 · 종이 3).

---

### Task 2: 화면 — `js/menus/ministry/appointed.js` · 메뉴 한 줄 · CSS · 시험

**Files:**
- Create: `js/menus/ministry/appointed.js`, `tests/appointed.test.mjs`
- Modify: `js/menus/registry.js`, `css/admin.css`

**Interfaces:**
- Consumes: Task 1 의 `ministryAppointed` 응답 · `ui.js` 의 `esc`·`toast`·`errorText` · 메뉴 약속 `render(el, { call })`
- Produces(시험용 export): `whoShort(who)` · `label(r)` · `guOf(r)` · `mokOf(r)` · `filterRows(rows, q)` · `csvText(rows)`

- [ ] **Step 1: 실패하는 시험 — `tests/appointed.test.mjs`**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { whoShort, label, guOf, mokOf, filterRows, csvText } from "../js/menus/ministry/appointed.js";

const R = (o) => ({ name: "", who: "", committee: "", team: "", option: "", at: "", decided_at: null, source: "app", ...o });

test("사람은 「김세웅-화평20」 한 가지 꼴", () => {
  assert.equal(whoShort("화평 20목장"), "화평20");
  assert.equal(whoShort("유년부 3학년"), "유년부3학년");
  assert.equal(label(R({ name: "김세웅", who: "화평 20목장" })), "김세웅-화평20");
  assert.equal(label(R({ who: "화평 20목장" })), "이름 없음-화평20");
});

test("교구·목장 뽑기", () => {
  assert.equal(guOf(R({ who: "화평 20목장" })), "화평");
  assert.equal(guOf(R({ who: "" })), "그 밖");
  assert.equal(mokOf(R({ who: "화평 20목장" })), 20);
  assert.equal(mokOf(R({ who: "화평 남성목장" })), 9999);
});

test("찾기는 이름·소속·사역팀·부서·표시 어디에 걸려도", () => {
  const rows = [R({ name: "김세웅", who: "화평 20목장", committee: "찬양부", team: "할렐루야찬양대" }),
                R({ name: "이영희", who: "믿음 3목장", committee: "전도부", team: "행복전도대" })];
  assert.equal(filterRows(rows, "").length, 2);
  assert.equal(filterRows(rows, "할렐").length, 1);
  assert.equal(filterRows(rows, "믿음").length, 1);
  assert.equal(filterRows(rows, "김세웅-화평20").length, 1);
  assert.equal(filterRows(rows, "전도").length, 1);
});

test("CSV — BOM · 머리글 · 따옴표 이스케이프 · 부서→사역팀→이름 차례 · 종이/앱", () => {
  const csv = csvText([
    R({ name: "이영희", who: "믿음 3목장", committee: "전도부", team: "행복전도대", at: "2026-09-17", decided_at: "2026-09-18T01:00:00Z", source: "paper" }),
    R({ name: '김"세웅', who: "화평 20목장", committee: "찬양부", team: "할렐루야찬양대", option: "1부", at: "2026-09-16" }),
  ]);
  assert.ok(csv.startsWith("\uFEFF"));
  const lines = csv.slice(1).split("\r\n");
  assert.equal(lines[0], '"표시","이름","소속","교구","부서","사역팀","하위 선택","신청일","임명일","들어온 길"');
  assert.ok(lines[1].startsWith('"이영희-믿음3","이영희"'));          // 가나다: 전도부(ㅈ)가 찬양부(ㅊ)보다 먼저
  assert.ok(lines[1].endsWith('"2026-09-17","2026-09-18","종이"'));   // 임명일은 한국 날짜
  assert.ok(lines[2].startsWith('"김""세웅-화평20","김""세웅"'));     // 따옴표는 두 번
  assert.ok(lines[2].endsWith('"2026-09-16","","앱"'));
});
```

Run: `node --experimental-strip-types --test tests/appointed.test.mjs` → FAIL(모듈 없음).

- [ ] **Step 2: `js/menus/ministry/appointed.js`**

```js
// 🎉 임명현황 — 임명이 끝난 명단을 부서별·교구별·사람별로 본다.
// 성경암송 admin-stats.html 의 renderMinistryAppointed 를 옮겨 왔다(2026-09-28 · 옛 화면은 얼린 채 둔다).
// ⚠️ 사람은 「김세웅-화평20」 한 가지 꼴로만 — 직분·번호는 싣지 않는다(서버도 주지 않는다).
// ⚠️ 상태는 임명확정만 — 서버(ministryAppointed)가 그것만 준다. 신청·접수는 현황 화면(3단계)이 맡는다.
// ⚠️ 내려받기는 지금 화면에 보이는 것만(찾기가 걸려 있으면 그것만) — 화면과 파일이 달라지면 안 된다.
import { esc, toast, errorText } from "../../core/ui.js";

// 성경암송 앱(app.js GU_LIST)과 같게 — 교구 차례
const GU_LIST = ["믿음", "소망", "사랑", "섬김", "은혜", "화평", "기쁨", "새가족"];
const TITLE = `<h2 class="page-title">🎉 임명현황</h2>`;
const VIEWS = [["dept", "부서별"], ["gu", "교구별"], ["person", "사람별"]];

// 보기·찾기는 메뉴를 옮겨 다녀도 남는다(옛 화면과 같게)
let view = "dept";
let q = "";

export const whoShort = (w) => String(w || "").replace(/\s+/g, "").replace(/목장$/, "");
export const label = (r) => (r.name || "이름 없음") + "-" + whoShort(r.who);
export const guOf = (r) => String(r.who || "").trim().split(/\s+/)[0] || "그 밖";
export const mokOf = (r) => { const m = /(\d+)/.exec(String(r.who || "")); return m ? Number(m[1]) : 9999; };

export function filterRows(rows, query) {
  const s = String(query || "").trim().toLowerCase();
  if (!s) return rows;
  return rows.filter((r) => [r.name, r.who, r.team, r.committee, label(r)]
    .some((v) => String(v || "").toLowerCase().includes(s)));
}

const byKo = (a, b) => String(a).localeCompare(String(b), "ko");
const kstDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
};

// 엑셀에서 바로 열리게 CSV(BOM). 부서 → 사역팀 → 이름 차례.
export function csvText(rows) {
  const cell = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
  const head = ["표시", "이름", "소속", "교구", "부서", "사역팀", "하위 선택", "신청일", "임명일", "들어온 길"];
  const body = [...rows]
    .sort((a, b) => byKo(a.committee, b.committee) || byKo(a.team, b.team) || byKo(a.name, b.name))
    .map((r) => [label(r), r.name, r.who, guOf(r), r.committee, r.team, r.option, r.at, kstDate(r.decided_at),
      r.source === "paper" ? "종이" : "앱"]);
  return "\uFEFF" + [head, ...body].map((row) => row.map(cell).join(",")).join("\r\n");
}

function download(text, year) {
  const t = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, "");
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${year}_임명현황_${t}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const chip = (r) => `<span class="ap-p">${esc(label(r))}</span>`;

function listHtml(rows) {
  if (view === "dept") {   // 부서 → 사역팀(하위 선택) → 사람
    const byCom = new Map();
    for (const r of rows) {
      if (!byCom.has(r.committee)) byCom.set(r.committee, new Map());
      const teams = byCom.get(r.committee);
      const k = r.team + (r.option ? " (" + r.option + ")" : "");
      if (!teams.has(k)) teams.set(k, []);
      teams.get(k).push(r);
    }
    return [...byCom.entries()].sort((a, b) => byKo(a[0], b[0])).map(([com, teams]) => {
      const n = [...teams.values()].reduce((s, l) => s + l.length, 0);
      return `<div class="ap-g"><div class="ap-h"><b>${esc(com || "부서 없음")}</b><em>${n}명</em></div>` +
        [...teams.entries()].sort((a, b) => byKo(a[0], b[0])).map(([team, list]) =>
          `<div class="ap-t"><div class="ap-tn">${esc(team)} <i>${list.length}</i></div>` +
          `<div class="ap-ps">${list.sort((a, b) => byKo(a.name, b.name)).map(chip).join("")}</div></div>`).join("") +
        `</div>`;
    }).join("");
  }
  if (view === "gu") {     // 교구(차례) → 사람(목장 차례) · 한 사람은 한 번
    const byGu = new Map();
    for (const r of rows) { const g = guOf(r); if (!byGu.has(g)) byGu.set(g, []); byGu.get(g).push(r); }
    const rank = (g) => { const i = GU_LIST.indexOf(g); return i < 0 ? 99 : i; };
    return [...byGu.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || byKo(a[0], b[0])).map(([gu, list]) => {
      const seen = new Map();
      for (const r of list) if (!seen.has(label(r))) seen.set(label(r), r);
      const ones = [...seen.values()].sort((a, b) => mokOf(a) - mokOf(b) || byKo(a.name, b.name));
      return `<div class="ap-g"><div class="ap-h"><b>${esc(gu)}</b><em>${ones.length}명</em></div>` +
        `<div class="ap-ps">${ones.map(chip).join("")}</div></div>`;
    }).join("");
  }
  const byP = new Map();   // 사람 → 그분이 임명된 사역들
  for (const r of rows) { const k = label(r); if (!byP.has(k)) byP.set(k, []); byP.get(k).push(r); }
  return `<div class="ap-g">` + [...byP.entries()].sort((a, b) => byKo(a[0], b[0])).map(([lb, list]) =>
    `<div class="ap-one"><span class="ap-p">${esc(lb)}</span>` +
    `<span class="ap-tm">${list.map((r) => esc(r.team)).join(" · ")}</span></div>`).join("") + `</div>`;
}

export async function render(el, { call }) {
  el.innerHTML = TITLE + `<p class="empty">불러오는 중…</p>`;
  const r = await call("ministryAppointed");
  if (!r.ok) { el.innerHTML = TITLE + `<p class="empty">${esc(errorText(r))}</p>`; return; }
  const all = r.rows;
  el.innerHTML = `<h2 class="page-title">🎉 임명현황 <span class="muted">${esc(r.year)}년</span></h2>
    <div class="acts" style="margin-bottom:10px">
      <button type="button" class="btn" data-act="csv">⬇️ 내려받기</button>
      <button type="button" class="btn" data-act="reload">↻ 새로 불러오기</button>
    </div>
    <input type="search" class="search" placeholder="🔍 이름 · 소속 · 사역팀 · 부서" autocomplete="off" aria-label="찾기">
    <div class="tabs" role="tablist">${VIEWS.map(([v, t]) =>
      `<button type="button" role="tab" data-v="${v}">${t} <em data-vn="${v}">0</em></button>`).join("")}</div>
    <p class="muted ap-sum"></p>
    <div class="ap-list"></div>`;
  const input = el.querySelector(".search");
  input.value = q;

  const draw = () => {
    const rows = filterRows(all, q);
    const people = new Set(rows.map(label));
    const vn = { dept: new Set(rows.map((x) => x.committee)).size, gu: new Set(rows.map(guOf)).size, person: people.size };
    el.querySelectorAll("[data-vn]").forEach((e) => { e.textContent = vn[e.dataset.vn]; });
    el.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.v === view));
    el.querySelector(".ap-sum").innerHTML = `임명 <b>${rows.length}건</b> · <b>${people.size}명</b>` +
      (q ? ` <i>(‘${esc(q)}’로 찾은 것 · 전체 ${all.length}건)</i>` : "");
    el.querySelector(".ap-list").innerHTML = rows.length ? listHtml(rows)
      : `<p class="empty">${q ? `‘${esc(q)}’에 맞는 임명이 없어요` : "임명된 신청이 아직 없어요"}</p>`;
  };

  input.addEventListener("input", () => { q = input.value.trim(); draw(); });
  el.addEventListener("click", (e) => {
    const tab = e.target.closest(".tabs button");
    if (tab) { view = tab.dataset.v; draw(); return; }
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    // 새로 불러오기는 새 <section> 에 — 같은 el 에 다시 그리면 이 click 처리가 겹쳐 쌓인다
    if (b.dataset.act === "reload") { const fresh = document.createElement("section"); el.replaceWith(fresh); render(fresh, { call }); return; }
    if (b.dataset.act === "csv") {
      const rows = filterRows(all, q);
      if (!rows.length) { toast("내려받을 임명이 없어요"); return; }
      download(csvText(rows), r.year);
    }
  });
  draw();
}
```

Run: `node --experimental-strip-types --test tests/appointed.test.mjs` → PASS.

- [ ] **Step 3: 메뉴 한 줄 — `js/menus/registry.js`** (`MENUS` 배열 **맨 앞**에 — 사역신청 묶음이 시스템보다 위에 보인다):

```js
  { id: "appointed", group: "사역신청", icon: "🎉", label: "임명현황", desc: "임명된 분을 부서·교구·사람별로 · 내려받기",
    role: "ministry", load: () => import("./ministry/appointed.js") },
```

- [ ] **Step 4: CSS — `css/admin.css` 끝에**

```css
/* 찾기 칸 · 보기 칩(표준 v1: 한 줄 입력 44 · 칩 36 · 글씨 13 이상) */
.search{width:100%;min-height:var(--tap);padding:0 12px;border:1px solid var(--border);border-radius:10px;background:#fff;font-size:1rem;margin-bottom:10px}
.tabs{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px}
.tabs button{min-height:var(--chip);padding:0 14px;border-radius:999px;border:1px solid var(--border);background:#fff;font-size:13px;cursor:pointer}
.tabs button.on{background:var(--navy);border-color:var(--navy);color:#fff;font-weight:700}
.tabs em{font-style:normal;font-weight:800;margin-left:2px}
.ap-sum{margin:4px 0 10px}
.ap-sum i{font-style:normal}

/* 임명현황 묶음(성경암송 .mapl-* 를 옮김 · 작은 글씨는 13px 로 올림) */
.ap-g{border:1px solid var(--border);border-radius:12px;background:#fff;padding:10px 12px;margin-bottom:var(--gap)}
.ap-h{display:flex;align-items:baseline;gap:8px;border-bottom:1px solid var(--light);padding-bottom:7px;margin-bottom:8px}
.ap-h b{font-size:15px;font-weight:800;color:var(--navy)}
.ap-h em{font-style:normal;font-size:13px;font-weight:800;color:#41506b;margin-left:auto}
.ap-t{margin:0 0 9px}
.ap-tn{font-size:13px;font-weight:800;color:#41506b;margin-bottom:4px}
.ap-tn i{font-style:normal;font-size:13px;font-weight:700;color:var(--gray);margin-left:3px}
.ap-ps{display:flex;flex-wrap:wrap;gap:5px}
.ap-p{display:inline-block;font-size:13px;font-weight:700;color:#41506b;background:#f3f6fb;border-radius:8px;padding:4px 8px}
.ap-one{display:flex;align-items:baseline;gap:8px;padding:6px 0;border-top:1px solid var(--light)}
.ap-one:first-child{border-top:none}
.ap-tm{font-size:13px;color:#41506b;min-width:0}
@media (min-width:1024px){
  .ap-list{columns:2;column-gap:var(--gap)}
  .ap-g{break-inside:avoid}
}
```

- [ ] **Step 5: preflight · 커밋(푸시 안 함)**

```bash
cd /c/Projects/church-admin && python tools/preflight.py   # 모두 통과(시험 파일 5개)
git add js/menus/ministry/appointed.js js/menus/registry.js css/admin.css tests/appointed.test.mjs
git commit -m "feat(사역): 임명현황 화면 — 부서별·교구별·사람별 · 찾기 · 내려받기(성경암송 관리 화면에서 옮김)"   # + Co-Authored-By 줄
```
**푸시하지 않는다.**

---

### Task 3: 확인 · 운영 올리기 (컨트롤러가 친구와 함께)

- [ ] **Step 1: localhost 확인(개발 DB)** — `python -m http.server 8000`(church-admin 루트, 백그라운드) → 친구가 `http://localhost:8000` 에서:
  「개발 DB」 띠 · 메뉴에 「사역신청 › 🎉 임명현황」 · 부서별/교구별/사람별 숫자와 묶음 · 찾기(「할렐」 등) · 내려받기 CSV 가 엑셀에서 한글 안 깨지고 열리는지 · 360px·1280px(PC 두 단).
  사역 담당 역할만 가진 분에게도 보이는지는 개발 담당자·역할 화면에서 시험 계정에 「사역신청 담당」만 주고 본다(총괄은 모든 메뉴가 보인다).
- [ ] **Step 2: 옛 화면과 숫자 대조(운영, 읽기만)** — `select count(*) from ministry_orders where year=<연도> and status='임명확정'` 과 새 화면의 「임명 N건」이 같아야 한다.
- [ ] **Step 3: 서버를 운영에 먼저** — `git status --short` 깨끗 → `supabase functions deploy church-admin --no-verify-jwt --project-ref xnomlgydifiqiybervtf` → 토큰 없이 부르면 401.
- [ ] **Step 4: 화면 푸시** — `git push` → Actions 성공 → 라이브 `index.html` 의 importmap 에 `js/menus/ministry/appointed.js?v=` 가 있는지(이번 판 표식).
- [ ] **Step 5: 친구가 admin.onlybible.kr 에서 확인** — 운영 임명현황 숫자가 Step 2 와 같은지.
- [ ] **Step 6: 기록** — church-admin `.superpowers/sdd/progress.md` 한 줄 · 성경암송 CLAUDE.md 「다음 작업」의 교회 어드민 줄을 「2단계 끝 · 다음 3단계 신청 현황」으로(그 한 줄만, 경로 커밋).
