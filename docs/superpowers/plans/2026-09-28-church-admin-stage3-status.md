# 교회 어드민 3단계(신청 현황 옮기기) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 성경암송 관리 화면의 「사역신청 현황」을 교회 어드민으로 옮긴다 — 건별·사람별·사역별 보기, 상태 거르기·신청일·찾기, 상태 바꾸기(접수·임명·취소)와 임명 알림, 삭제(두 번 확인), 같은 번호 중복 표시, PC 에서는 건별을 표로.

**Architecture:**
- 상태 규칙은 순수 모듈 `supabase/functions/church-admin/ministry.ts`(Node 시험). 서버 액션 셋(`ministryList`·`ministrySetStatus`·`ministryDelete`)을 church-admin 에 옮기고, **두 담당자가 동시에 바꾸면 `conflict`** 로 알린다(옛 서버는 나중 것이 덮었다).
- **임명 알림 코드는 한 벌** — 성경암송 `api` 에 내부 전용 액션 `internalMinistryNotify` 를 더하고(같은 프로젝트의 서비스 키를 머리로 받은 때만 열림), church-admin 이 임명확정 뒤 그것을 부른다. 「한 사람 한 해 한 번」 판단과 발송·`push_log` 는 `api` 에만 있다.
- 화면은 셋으로 나눈다: `status-logic.js`(순수 — 거르기·날짜·중복 번호·셈), `status-ui.js`(HTML·창), `status.js`(불러오기·이벤트·상태 바꾸기·삭제). PC(≥1024px) 건별은 표.
- 옛 화면·옛 액션은 얼린 채 그대로 둔다(갈아타기는 5단계 뒤).

**Tech Stack:** 1·2단계와 같음.

**기준 문서:** 옛 동작 원문 `c:\Projects\church-admin\docs\port\ministry-status-legacy.md`(줄 번호가 붙은 원문 + 체크리스트 42개) · 설계 `docs/superpowers/specs/2026-09-28-church-admin-design.md` 3·4절 · 2단계 계획.

## Global Constraints

- church-admin(`C:\Projects\church-admin`)은 **푸시 = 운영 화면 반영**이다 — Task 1~6 은 **커밋만, 푸시하지 않는다.** 푸시는 Task 7 에서 서버를 운영에 올린 **뒤**.
- 성경암송(`C:\Projects\bible-memorize-church-app-v2`)은 **`supabase/functions/api/index.ts` 에 내부 액션 하나만 더한다**(Task 2). 화면·다른 액션·SQL 은 건드리지 않는다. 그 저장소는 여러 세션이 함께 쓴다 — **`git apply --cached` 가 아니라도 되도록 그 파일만 경로로 커밋**하고, 커밋 전 `git diff --cached --stat` 로 남의 것이 없는지 본다. `api` 배포는 작업 트리를 올린다 — **배포 직전 `git status --short supabase/functions/` 가 비어 있어야** 한다.
- 개발 `ktpwthwqzgcqcrmsafdo` 먼저. 운영 `xnomlgydifiqiybervtf` 는 Task 7 에서만(친구 확인 뒤).
- 새 액션 = `authz.ts` `ACTION_ROLES` + `index.ts` `switch` case + `tests/server.dev.test.mjs` `PROBE` — 셋 다.
- 응답에 `user_id`·`auth_user_id` 를 싣지 않는다. `note`(담당자 메모·취소 사유)와 `phone` 은 **관리 화면 응답에만**(ministryList). 결정(임명확정·취소)이 나면 서버가 `phone` 을 지운다.
- 취소는 사유 없이 못 한다(화면·서버 둘 다). 삭제는 창을 **두 번** 띄운다. 확인·알림은 `ui.js` `dialog`/`toast`(브라우저 confirm/alert/prompt 금지). 실패는 toast 가 아니라 dialog.
- 임명 알림 결과는 넷을 가른다: **이미 보냄 / 보냄(N대) / 알림 안 켜심 / 발송 실패** — 「이미 보냄」과 「안 켜심」을 섞지 않는다.
- 화면 표준 v1: 주 동작 48 · 보조 44 · 칩 36 · 글씨 13 이상 · 겹침 메뉴의 조상에 `overflow` 금지(`.mn-grp[open]{overflow:hidden}` 다시 넣지 말 것) · 아래 여유 210px 미만이면 메뉴를 위로.
- 사용자 글자는 모두 `esc`. 커밋 메시지 끝에 `Co-Authored-By:`(실제로 쓴 모델).

---

### Task 1: 상태 규칙 순수 모듈 `ministry.ts` (TDD)

**Files:** Create `supabase/functions/church-admin/ministry.ts`, `tests/ministry.test.mjs`

**Interfaces — Produces:**
- `MINISTRY_STATUS: string[]` = `["신청완료","접수완료","임명확정","취소"]`
- `statusPatch(current: string, next: unknown, note: unknown, nowIso: string)` →
  `{ ok:true, patch: Record<string,unknown>, notify: boolean }` | `{ ok:false, error: "invalid-status"|"cancel-note-required"|"note-too-long" }`

- [ ] **Step 1: 실패하는 시험 — `tests/ministry.test.mjs`**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { MINISTRY_STATUS, statusPatch } from "../supabase/functions/church-admin/ministry.ts";

const NOW = "2026-09-28T01:00:00.000Z";

test("상태는 넷 — 미채택·모르는 값은 막는다", () => {
  assert.deepEqual(MINISTRY_STATUS, ["신청완료", "접수완료", "임명확정", "취소"]);
  assert.deepEqual(statusPatch("신청완료", "미채택", undefined, NOW), { ok: false, error: "invalid-status" });
  assert.deepEqual(statusPatch("신청완료", "", undefined, NOW), { ok: false, error: "invalid-status" });
  assert.deepEqual(statusPatch("신청완료", 3, undefined, NOW), { ok: false, error: "invalid-status" });
});

test("접수 — 결정이 아니라 번호·결정일을 건드리지 않는다", () => {
  const r = statusPatch("신청완료", "접수완료", undefined, NOW);
  assert.deepEqual(r, { ok: true, patch: { status: "접수완료", updated_at: NOW }, notify: false });
});

test("임명 — 결정일을 찍고 번호를 지우고 알림을 요청", () => {
  const r = statusPatch("접수완료", "임명확정", undefined, NOW);
  assert.deepEqual(r, { ok: true, patch: { status: "임명확정", updated_at: NOW, decided_at: NOW, phone: null }, notify: true });
});

test("이미 임명인데 다시 임명 — 알림 판단은 서버(api)가 한 사람 한 해 한 번으로 거른다", () => {
  assert.equal(statusPatch("임명확정", "임명확정", undefined, NOW).notify, true);
});

test("취소는 사유가 있어야 — 공백만은 없는 것", () => {
  assert.deepEqual(statusPatch("신청완료", "취소", undefined, NOW), { ok: false, error: "cancel-note-required" });
  assert.deepEqual(statusPatch("신청완료", "취소", "   ", NOW), { ok: false, error: "cancel-note-required" });
  const r = statusPatch("신청완료", "취소", "  부서장 요청  ", NOW);
  assert.deepEqual(r, { ok: true, patch: { status: "취소", updated_at: NOW, decided_at: NOW, phone: null, note: "부서장 요청" }, notify: false });
});

test("임명에서 물러나면 알림 기록을 지운다(다시 임명하면 다시 보낼 수 있게)", () => {
  const r = statusPatch("임명확정", "접수완료", undefined, NOW);
  assert.deepEqual(r.patch, { status: "접수완료", updated_at: NOW, notified_at: null });
});

test("메모는 보내온 때만 고친다 · 500자까지", () => {
  assert.equal("note" in statusPatch("신청완료", "접수완료", undefined, NOW).patch, false);
  assert.equal(statusPatch("신청완료", "접수완료", "", NOW).patch.note, "");
  assert.deepEqual(statusPatch("신청완료", "취소", "가".repeat(501), NOW), { ok: false, error: "note-too-long" });
});
```

Run `cd /c/Projects/church-admin && node --experimental-strip-types --test tests/ministry.test.mjs` → FAIL(모듈 없음).

- [ ] **Step 2: `supabase/functions/church-admin/ministry.ts`**

```ts
// 사역신청 상태 규칙(순수 함수) — 성경암송 api 의 ministrySetStatus 규칙을 옮겨 왔다(2026-09-28 · 원문 docs/port/ministry-status-legacy.md 1.6).
// 서버(Deno, index.ts)와 시험(Node)이 함께 읽는다 — authz.ts 와 같은 제약(원격 import·enum 금지).

// 담당자가 새로 매길 수 있는 상태. 「미채택」은 2026-09-17 에 뺐다(DB CHECK 에는 옛 값이 남아 있다).
export const MINISTRY_STATUS = ["신청완료", "접수완료", "임명확정", "취소"];
// 결정 상태 — 이리로 바뀌면 결정일을 찍고 휴대폰 번호를 지운다(교적 대조가 끝난 자리.
// 사람이 기억해서 지우는 약속은 언젠가 안 지켜지니 상태를 바꾸는 그 자리에서 지운다).
const DECIDED = ["임명확정", "미채택", "취소"];
const NOTE_MAX = 500;

export type StatusPatchResult =
  | { ok: true; patch: Record<string, unknown>; notify: boolean }
  | { ok: false; error: string };

export function statusPatch(current: string, next: unknown, note: unknown, nowIso: string): StatusPatchResult {
  const status = typeof next === "string" ? next.trim() : "";
  if (!MINISTRY_STATUS.includes(status)) return { ok: false, error: "invalid-status" };
  const noteText = typeof note === "string" ? note.normalize("NFC").trim().replace(/\s+/g, " ") : null;
  // 취소는 사유 없이 못 한다 — 부서장 요청을 오프라인으로 받아 처리하는 일이라 적어 두지 않으면 「왜」를 아무도 모른다
  if (status === "취소" && !noteText) return { ok: false, error: "cancel-note-required" };
  if (noteText && noteText.length > NOTE_MAX) return { ok: false, error: "note-too-long" };
  const patch: Record<string, unknown> = { status, updated_at: nowIso };
  if (DECIDED.includes(status)) { patch.decided_at = nowIso; patch.phone = null; }
  // 임명에서 물러나면 그 행의 「알림 보냈음」도 지운다(이미 나간 알림을 무를 수는 없다)
  if (current === "임명확정" && status !== "임명확정") patch.notified_at = null;
  // 메모는 보내온 때만 고친다(안 보내면 그대로)
  if (noteText !== null) patch.note = noteText;
  // 임명이면 알림을 요청한다 — 「한 사람 한 해 한 번」은 api(internalMinistryNotify)가 거른다
  return { ok: true, patch, notify: status === "임명확정" };
}
```

Run → PASS. `python tools/preflight.py` → 모두 통과.

- [ ] **Step 3: 커밋(푸시 안 함)** — `git add supabase/functions/church-admin/ministry.ts tests/ministry.test.mjs` · `feat(사역): 상태 규칙 순수 모듈 — 결정 시 번호 지움 · 취소 사유 · 임명 알림 요청`

---

### Task 2: 성경암송 `api` 에 내부 전용 액션 `internalMinistryNotify` (개발 배포까지)

**Files:** Modify `C:\Projects\bible-memorize-church-app-v2\supabase\functions\api\index.ts` (한 파일만)

**Interfaces — Produces:** `POST {SUPABASE_URL}/functions/v1/api` 머리 `x-internal-key: <그 프로젝트의 SUPABASE_SERVICE_ROLE_KEY>`, 본문 `{ action:"internalMinistryNotify", id:number }` →
`{ ok:true, pushed:number, pushError:string|null, already:boolean }` | `{ ok:false, error:"unauthorized"|"not-found"|"not-appointed" }`

- [ ] **Step 1: 읽기** — 그 파일에서 요청 처리부(`switch` 가 있는 곳 — `req` 가 보이는 자리)와 `ministryNotify`(원문 1.7)·`ministrySetStatus` 의 「이미 알렸나」 부분(1.6)을 읽는다.

- [ ] **Step 2: 함수 더하기** — `ministryNotify` 바로 아래에:

```ts
// ---------- 교회 어드민이 부르는 내부 전용(2026-09-28) ----------
// church-admin 함수가 사역신청을 「임명확정」으로 바꾼 뒤 부른다. 알림 코드(한 사람 한 해 한 번 · 발송 · push_log)를
// 두 벌로 만들지 않으려고 여기 둔다 — ministrySetStatus 의 알림 부분과 같은 규칙.
// ⚠️ 성도·담당자 화면이 부르는 길이 아니다: 같은 프로젝트의 서비스 키를 머리(x-internal-key)로 받은 때만 연다.
function sameSecret(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function internalMinistryNotify(req: Request, b: any) {
  if (!sameSecret(req.headers.get("x-internal-key") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "")) {
    return { ok: false, error: "unauthorized" };
  }
  const id = Number(b.id) || 0;
  const { data: row, error } = await db.from("ministry_orders")
    .select("id,year,user_id,name,team,status,notified_at").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!row) return { ok: false, error: "not-found" };
  if (row.status !== "임명확정") return { ok: false, error: "not-appointed" };
  // ⚠️ 아직 살아 있는 확정만 센다(되돌린 확정의 흔적까지 세면 그 뒤 어떤 팀을 확정해도 영영 안 간다)
  const { data: sentRows, error: e2 } = await db.from("ministry_orders")
    .select("id").eq("year", row.year).eq("user_id", row.user_id)
    .eq("status", "임명확정").not("notified_at", "is", null).limit(1);
  if (e2) throw e2;
  if ((sentRows ?? []).length) return { ok: true, pushed: 0, pushError: null, already: true };
  const res = await ministryNotify(row);
  if (res.sent > 0) {
    const { error: e3 } = await db.from("ministry_orders").update({ notified_at: new Date().toISOString() }).eq("id", id);
    if (e3) throw e3;
  }
  return { ok: true, pushed: res.sent, pushError: res.error, already: false };
}
```

`switch` 에 한 줄(사역신청 case 들 곁에 — `req` 를 넘긴다):

```ts
      case "internalMinistryNotify": return json(await internalMinistryNotify(req, body));
```
(`body` 는 그 switch 가 실제로 쓰는 요청 본문 변수 이름에 맞춘다 — 다른 case 가 `b`/`body` 무엇을 넘기는지 보고 같게.)

- [ ] **Step 3: 개발 배포 · 확인**

```bash
cd /c/Projects/bible-memorize-church-app-v2
git status --short supabase/functions/          # 이 파일(M) 하나만이어야 한다 — 다른 것이 있으면 멈추고 보고
supabase functions deploy api --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo
# 머리 없이 → unauthorized
curl -s -X POST https://ktpwthwqzgcqcrmsafdo.supabase.co/functions/v1/api -H "Content-Type: application/json" -d '{"action":"internalMinistryNotify","id":1}'
```
Expected: `{"ok":false,"error":"unauthorized"}`. (서비스 키로 부르는 시험은 Task 3 의 개발 시험이 church-admin 을 거쳐 한다.)

- [ ] **Step 4: 커밋(그 파일만, 푸시 안 함)**

```bash
git add supabase/functions/api/index.ts && git diff --cached --stat     # 이 파일 하나만
git commit -m "feat(사역신청): 교회 어드민이 부르는 내부 전용 알림 액션 — 알림 코드는 한 벌" -- supabase/functions/api/index.ts
git show --stat HEAD
```

---

### Task 3: church-admin 서버 — `ministryList` · `ministrySetStatus` · `ministryDelete` (개발 배포·시험까지)

**Files:** Modify `supabase/functions/church-admin/authz.ts`, `index.ts`, `tests/authz.test.mjs`, `tests/server.dev.test.mjs`

**Interfaces:**
- Consumes: Task 1 `statusPatch` · Task 2 `internalMinistryNotify` · 2단계의 `ministryYear()`·`kstDay()`(index.ts 에 있다)
- Produces:
  - `ministryList` → `{ ok:true, year, list: Row[] }`, `Row = { id, committee, team, option, position, status, at:"YYYY-MM-DD", decided_at, name, who, note, notified_at, canPush:boolean, phone, source:"app"|"paper" }` (**user_id 없음**)
  - `ministrySetStatus { id, status, expect?, note? }` → `{ ok:true, status, pushed, pushError, already, phoneCleared }` | `{ ok:false, error, status? }` — `error:"conflict"` 이면 `status` 에 지금 DB 상태
  - `ministryDelete { id }` → `{ ok:true, deleted:{ id, name, who, committee, team, status } }` | `{ ok:false, error:"not-found" }`

- [ ] **Step 1: 권한** — `authz.ts` `ACTION_ROLES` 의 `ministryAppointed` 줄 아래:

```ts
  // 사역신청(3단계) — 신청 현황. 목록은 번호·메모를 담는다(관리 화면 전용). 상태 바꾸기·삭제는 바꾼 기록에 남는다.
  ministryList: "ministry",
  ministrySetStatus: "ministry",
  ministryDelete: "ministry",
```
`tests/authz.test.mjs` 의 `assert.deepEqual(ministryActions, ["ministryAppointed"])` 를
`assert.deepEqual(ministryActions.sort(), ["ministryAppointed", "ministryDelete", "ministryList", "ministrySetStatus"])` 로.

- [ ] **Step 2: `index.ts` — import 와 액션** (`import` 줄에 `import { statusPatch } from "./ministry.ts";` 를 더하고, `ministryAppointed` 아래에):

```ts
// ---------- 사역신청 — 신청 현황 (3단계 · 2026-09-28) ----------
// 원문: docs/port/ministry-status-legacy.md 1.4~1.7. 옛 화면과 같은 규칙 + 동시 수정 대조(expect).
async function ministryList() {
  const year = await ministryYear();
  const { data, error } = await db.from("ministry_orders")
    .select("id,user_id,committee,team,option,position,status,created_at,decided_at,name,who,note,notified_at,phone,source")
    .eq("year", year).order("created_at", { ascending: false }).limit(5000);
  if (error) throw error;
  const rows = (data ?? []) as any[];
  const need = [...new Set(rows.filter((r) => !r.name || !r.who).map((r) => r.user_id).filter(Boolean))];
  const umap = new Map<string, any>();
  if (need.length) {
    const { data: us, error: e2 } = await db.from("users").select("id,type,gu,mok,bu,grade,name").in("id", need);
    if (e2) throw e2;
    for (const u of (us ?? []) as any[]) umap.set(u.id, u);
  }
  // 알림을 켜 두지 않은 분은 푸시가 안 간다 — 담당자가 게시·연락으로 메워야 하므로 화면이 알 수 있게 한다
  const hasPush = new Set<string>();
  const ids = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
  for (let i = 0; i < ids.length; i += 200) {   // .in() 주소 길이를 넘지 않게 나눠 묻는다
    const { data: subs, error: e3 } = await db.from("push_subscriptions").select("user_id").in("user_id", ids.slice(i, i + 200));
    if (e3) throw e3;
    for (const s of (subs ?? []) as any[]) hasPush.add(s.user_id);
  }
  return {
    ok: true,
    year,
    list: rows.map((r) => {
      const u = umap.get(r.user_id);
      const uWho = u ? (u.type === "교구" ? [u.gu, u.mok ? u.mok + "목장" : ""] : [u.bu, u.grade]).filter(Boolean).join(" ") : "";
      return {
        id: r.id, committee: r.committee ?? "", team: r.team ?? "", option: r.option ?? "", position: r.position ?? "",
        status: r.status, at: r.created_at ? kstDay(r.created_at) : "", decided_at: r.decided_at ?? null,
        name: r.name || u?.name || "", who: r.who || uWho,
        note: r.note ?? "", notified_at: r.notified_at ?? null, canPush: hasPush.has(r.user_id),
        phone: r.phone ?? "", source: r.source === "paper" ? "paper" : "app",
      };
    }),
  };
}

// 임명 알림은 성경암송 api 의 내부 액션이 보낸다(한 벌) — 실패해도 상태 바꾸기는 이미 끝났으니 결과만 알린다
async function notifyAppointed(id: number) {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  try {
    const res = await fetch(Deno.env.get("SUPABASE_URL") + "/functions/v1/api", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-key": key },
      body: JSON.stringify({ action: "internalMinistryNotify", id }),
    });
    const j = await res.json().catch(() => null);
    if (!j || j.ok !== true) return { pushed: 0, pushError: "notify-failed", already: false };
    return { pushed: Number(j.pushed) || 0, pushError: j.pushError ?? null, already: !!j.already };
  } catch (e) {
    console.error("notifyAppointed", e);
    return { pushed: 0, pushError: "notify-failed", already: false };
  }
}

async function ministrySetStatus(ctx: Ctx, b: any) {
  const id = Number(b.id) || 0;
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, error: "not-found" };
  const { data: row, error } = await db.from("ministry_orders")
    .select("id,status,name,who,committee,team").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!row) return { ok: false, error: "not-found" };
  // 화면이 본 상태와 지금 상태가 다르면 — 다른 담당자가 먼저 바꿨다
  if (typeof b.expect === "string" && b.expect !== row.status) return { ok: false, error: "conflict", status: row.status };
  const p = statusPatch(row.status, b.status, b.note, new Date().toISOString());
  if (!p.ok) return { ok: false, error: p.error };
  const { data: upd, error: e2 } = await db.from("ministry_orders").update(p.patch)
    .eq("id", id).eq("status", row.status).select("id");
  if (e2) throw e2;
  if (!upd?.length) {
    const { data: now } = await db.from("ministry_orders").select("status").eq("id", id).maybeSingle();
    return { ok: false, error: "conflict", status: now?.status ?? null };
  }
  await audit(ctx, "ministry.status", String(id), {
    name: row.name ?? "", who: row.who ?? "", team: row.team ?? "", before: row.status, after: p.patch.status,
    ...(typeof p.patch.note === "string" ? { note: p.patch.note } : {}),
  });
  const n = p.notify ? await notifyAppointed(id) : { pushed: 0, pushError: null, already: false };
  return { ok: true, status: p.patch.status, pushed: n.pushed, pushError: n.pushError, already: n.already,
    phoneCleared: p.patch.phone === null };
}

// 신청 한 건을 아주 지운다(되돌릴 수 없다 — 화면이 두 번 묻는다). 3개 상한의 자리도 도로 빈다.
async function ministryDelete(ctx: Ctx, b: any) {
  const id = Number(b.id) || 0;
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, error: "not-found" };
  const { data: row, error } = await db.from("ministry_orders")
    .select("id,name,who,committee,team,status").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!row) return { ok: false, error: "not-found" };
  const { error: e2 } = await db.from("ministry_orders").delete().eq("id", id);
  if (e2) throw e2;
  const deleted = { id: row.id, name: row.name ?? "", who: row.who ?? "", committee: row.committee ?? "",
    team: row.team ?? "", status: row.status };
  await audit(ctx, "ministry.delete", String(id), deleted);
  return { ok: true, deleted };
}
```

`switch` 에 세 줄:

```ts
      case "ministryList":      return json(await ministryList());
      case "ministrySetStatus": return json(await ministrySetStatus(ctx, b));
      case "ministryDelete":    return json(await ministryDelete(ctx, b));
```

- [ ] **Step 3: 개발 서버 시험** — `tests/server.dev.test.mjs`:
  (a) `PROBE` 에 세 줄: `ministryList: {}`, `ministrySetStatus: { id: 0, status: "접수완료" }`, `ministryDelete: { id: 0 }`.
  (b) 시험용 신청을 만들고 끝나면 지운다. `before` 에서 서비스 키로 `users` 한 줄과 `ministry_orders` 두 줄을 넣는다 —
      **칸 이름·필수 칸은 `docs/port/ministry-status-legacy.md` 1.9(표 정의)와 성경암송 `supabase/schema.sql` 의 `users` 정의를 읽고 맞춘다**
      (users: `identity_key = "교구|시험|0|||ca-test-min-" + STAMP`, type 교구, gu 시험, mok 0, name `ca-test-min`; ministry_orders: year = `ministryList` 가 돌려준 year, 상태 신청완료, phone `010-0000-0000`, committee `시험부`, team `시험팀A`/`시험팀B`, source app — 그 밖의 not null 칸은 표 정의대로).
      ⚠️ `team_id` 가 not null(사역팀 목록 `ministry_catalog` 를 가리킴)이거나 (연도·사람·팀) 유일 제약이 있으면, 개발 `ministry_catalog` 에서 **서로 다른 두 줄**의 id 를 서비스 키로 읽어 쓴다(가짜 팀 id 를 만들지 않는다).
      `after` 에서 그 두 줄과 users 줄을 지운다(ministry_orders 먼저).
  (c) 새 시험(파일 끝):

```js
test("신청 현황: 목록 모양 · 동시 수정 · 취소 사유 · 임명 알림(개발 api 내부 액션) · 삭제 · 바꾼 기록", async () => {
  const m = people.ministry.token;
  const list = await call(m, "ministryList");
  assert.equal(list.body.ok, true);
  const mine = list.body.list.filter((x) => x.name === "ca-test-min");
  assert.equal(mine.length, 2);
  for (const x of mine) {
    assert.equal("user_id" in x, false);
    assert.equal(x.phone, "010-0000-0000");
    assert.equal(x.canPush, false);
  }
  const [a, bRow] = mine.sort((x, y) => x.team.localeCompare(y.team));
  // 접수 → 같은 expect 로 한 번 더 → conflict
  assert.equal((await call(m, "ministrySetStatus", { id: a.id, status: "접수완료", expect: "신청완료" })).body.ok, true);
  const c = await call(m, "ministrySetStatus", { id: a.id, status: "임명확정", expect: "신청완료" });
  assert.equal(c.body.error, "conflict");
  assert.equal(c.body.status, "접수완료");
  // 임명 → 알림 안 켜심(시험 사용자는 구독이 없다) · 번호 지움
  const ap = await call(m, "ministrySetStatus", { id: a.id, status: "임명확정", expect: "접수완료" });
  assert.equal(ap.body.ok, true, JSON.stringify(ap.body));
  assert.equal(ap.body.pushed, 0);
  assert.equal(ap.body.pushError, "not-subscribed");
  assert.equal(ap.body.phoneCleared, true);
  // 취소 — 사유 없이는 안 됨
  assert.equal((await call(m, "ministrySetStatus", { id: bRow.id, status: "취소", expect: "신청완료" })).body.error, "cancel-note-required");
  assert.equal((await call(m, "ministrySetStatus", { id: bRow.id, status: "취소", expect: "신청완료", note: "시험 취소" })).body.ok, true);
  const after = (await call(m, "ministryList")).body.list.filter((x) => x.name === "ca-test-min");
  assert.equal(after.find((x) => x.id === bRow.id).note, "시험 취소");
  assert.equal(after.find((x) => x.id === bRow.id).phone, "");
  // 삭제
  const del = await call(m, "ministryDelete", { id: bRow.id });
  assert.equal(del.body.ok, true);
  assert.equal(del.body.deleted.name, "ca-test-min");
  assert.equal((await call(m, "ministryDelete", { id: bRow.id })).body.error, "not-found");
  const acts = (await call(people.super.token, "auditList", { limit: 20 })).body.rows.map((r) => r.action);
  assert.ok(acts.includes("ministry.status") && acts.includes("ministry.delete"), JSON.stringify(acts));
});
```
  (`after` 정리는 이미 지워진 줄이 있어도 괜찮게 — 없는 id 를 지워도 오류로 보지 않는다.)

- [ ] **Step 4: preflight · 커밋(푸시 안 함) · 개발 배포 · 개발 시험** — Task 2 가 개발에 올라가 있어야 알림 시험이 통과한다.

```bash
cd /c/Projects/church-admin && python tools/preflight.py
git add supabase/functions/church-admin/authz.ts supabase/functions/church-admin/index.ts tests/authz.test.mjs tests/server.dev.test.mjs
git commit -m "feat(사역): 신청 현황 서버 — 목록·상태 바꾸기(동시 수정 대조·알림은 api 내부 액션)·삭제·바꾼 기록"
git status --short && supabase functions deploy church-admin --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo
set -a && . /c/Users/sewki/.church-admin/dev.env && set +a && node --experimental-strip-types --test tests/server.dev.test.mjs
```
Expected: 개발 시험 **11개 모두 통과**.

---

### Task 4: 화면 논리(순수) — `js/menus/ministry/status-logic.js` (TDD)

**Files:** Create `js/menus/ministry/status-logic.js`, `tests/status-logic.test.mjs`

**Interfaces — Produces:**
- `STATES` = `["신청완료","접수완료","임명확정","취소"]` · `SHORT` = `{신청완료:"신청",접수완료:"접수",임명확정:"임명",미채택:"미채택",취소:"취소"}` · `CLS` = `{신청완료:"s1",접수완료:"s2",임명확정:"s3",미채택:"s4",취소:"s4"}`
- `kstToday(now: Date): string` · `rangeDates(range: "all"|"today"|"7d"|"custom", from: string, to: string, now: Date): [string,string]`
- `filterRows(rows, { stOn: string[], range, from, to, q }, now: Date)` — 상태(비면 전체) · 신청일 · 찾기(이름·소속·직분·팀·부서 부분일치)
- `personKey(r)` = `name + "/" + who` · `teamKey(r)` = `committee + " · " + team`
- `dupMap(allRows)` → `Map<숫자만 번호, Map<personKey, {name, who}>>` · `dupOthers(map, rowOrRows)` → `{kind:"소속"|"사람", label, name, who}[]`
- `teamCounts(rows)` → `[teamKey, count][]` (많은 순, 같으면 가나다)
- `statusCounts(rows)` → `{ 신청완료:n, 접수완료:n, 임명확정:n, 취소:n }`

- [ ] **Step 1: 실패하는 시험 — `tests/status-logic.test.mjs`**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { STATES, SHORT, kstToday, rangeDates, filterRows, personKey, teamKey, dupMap, dupOthers, teamCounts, statusCounts }
  from "../js/menus/ministry/status-logic.js";

const R = (o) => ({ id: 1, name: "", who: "", position: "", committee: "", team: "", option: "", status: "신청완료", at: "2026-09-20", phone: "", ...o });
const NOW = new Date("2026-09-28T03:00:00Z");   // 한국 12시

test("상태·짧은 이름", () => {
  assert.deepEqual(STATES, ["신청완료", "접수완료", "임명확정", "취소"]);
  assert.equal(SHORT["임명확정"], "임명");
});

test("신청일 범위 — 한국 날짜", () => {
  assert.equal(kstToday(new Date("2026-09-27T16:00:00Z")), "2026-09-28");
  assert.deepEqual(rangeDates("all", "", "", NOW), ["", ""]);
  assert.deepEqual(rangeDates("today", "", "", NOW), ["2026-09-28", "2026-09-28"]);
  assert.deepEqual(rangeDates("7d", "", "", NOW), ["2026-09-22", "2026-09-28"]);
  assert.deepEqual(rangeDates("custom", "2026-09-01", "2026-09-10", NOW), ["2026-09-01", "2026-09-10"]);
});

test("거르기 — 상태(비면 전체) · 신청일 · 찾기 다섯 칸", () => {
  const rows = [R({ id: 1, name: "김철수", who: "화평 20목장", position: "집사", committee: "찬양부", team: "할렐루야", status: "신청완료", at: "2026-09-27" }),
                R({ id: 2, name: "이영희", who: "믿음 3목장", committee: "전도부", team: "행복전도대", status: "임명확정", at: "2026-09-10" })];
  const f = (o) => filterRows(rows, { stOn: [], range: "all", from: "", to: "", q: "", ...o }, NOW).map((r) => r.id);
  assert.deepEqual(f({}), [1, 2]);
  assert.deepEqual(f({ stOn: ["신청완료"] }), [1]);
  assert.deepEqual(f({ range: "7d" }), [1]);
  assert.deepEqual(f({ q: "집사" }), [1]);
  assert.deepEqual(f({ q: "전도" }), [2]);
  assert.deepEqual(f({ q: "믿음" }), [2]);
});

test("열쇠", () => {
  assert.equal(personKey(R({ name: "김철수", who: "화평 20목장" })), "김철수/화평 20목장");
  assert.equal(teamKey(R({ committee: "찬양부", team: "할렐루야" })), "찬양부 · 할렐루야");
});

test("같은 번호 — 명단 전체로 · 같은 이름이면 「소속」, 다르면 「사람」 · 숫자만 비교", () => {
  const all = [R({ id: 1, name: "김철수", who: "화평 20목장", phone: "010-1111-2222" }),
               R({ id: 2, name: "김철수", who: "사랑 1목장", phone: "01011112222" }),
               R({ id: 3, name: "김영희", who: "화평 20목장", phone: "010 1111 2222" }),
               R({ id: 4, name: "박민수", who: "믿음 3목장", phone: "" })];
  const m = dupMap(all);
  assert.equal(m.size, 1);
  const o = dupOthers(m, all[0]);
  assert.deepEqual(o.map((x) => x.kind).sort(), ["사람", "소속"]);
  assert.equal(o.find((x) => x.kind === "소속").label, "사랑 1목장");
  assert.equal(o.find((x) => x.kind === "사람").label, "김영희 · 화평 20목장");
  assert.deepEqual(dupOthers(m, all[3]), []);
  assert.deepEqual(dupOthers(m, [all[0], all[1]]).map((x) => x.kind), ["사람"]);   // 묶음(사람별)은 자기 둘을 빼고
});

test("팀별 수(많은 순) · 상태별 수", () => {
  const rows = [R({ committee: "찬양부", team: "A" }), R({ committee: "찬양부", team: "A" }), R({ committee: "전도부", team: "B", status: "취소" })];
  assert.deepEqual(teamCounts(rows), [["찬양부 · A", 2], ["전도부 · B", 1]]);
  assert.deepEqual(statusCounts(rows), { 신청완료: 2, 접수완료: 0, 임명확정: 0, 취소: 1 });
});
```

- [ ] **Step 2: `js/menus/ministry/status-logic.js`** — 원문 2.0·2.5·2.7·2.13 을 순수 함수로(`document` 를 쓰지 않는다):

```js
// 신청 현황 — 화면 논리(순수 함수). 원문: docs/port/ministry-status-legacy.md 2.0·2.5·2.7·2.13.
// ⚠️ 「미채택」은 뺐다(2026-09-17) — 서버 MINISTRY_STATUS 와 같게. SHORT·CLS 에는 옛 행 표시용으로 남긴다.
export const STATES = ["신청완료", "접수완료", "임명확정", "취소"];
export const SHORT = { "신청완료": "신청", "접수완료": "접수", "임명확정": "임명", "미채택": "미채택", "취소": "취소" };
export const CLS = { "신청완료": "s1", "접수완료": "s2", "임명확정": "s3", "미채택": "s4", "취소": "s4" };

export const kstToday = (now) => new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);

export function rangeDates(range, from, to, now) {
  if (range === "today") { const t = kstToday(now); return [t, t]; }
  if (range === "7d") return [kstToday(new Date(now.getTime() - 6 * 86400 * 1000)), kstToday(now)];
  if (range === "custom") return [from || "", to || ""];
  return ["", ""];
}

// 상태(하나도 안 고르면 전체) · 신청일(YYYY-MM-DD 문자열 비교 — r.at 도 같은 꼴) · 찾기(단순 부분일치)
export function filterRows(rows, { stOn, range, from, to, q }, now) {
  const on = stOn || [];
  const [f, t] = rangeDates(range, from, to, now);
  const s = String(q || "").trim();
  return rows.filter((r) => {
    if (on.length && !on.includes(r.status)) return false;
    if (f && r.at < f) return false;
    if (t && r.at > t) return false;
    if (s && ![r.name, r.who, r.position, r.team, r.committee].join(" ").includes(s)) return false;
    return true;
  });
}

export const personKey = (r) => (r.name || "") + "/" + (r.who || "");
export const teamKey = (r) => (r.committee || "") + " · " + (r.team || "");
const digits = (p) => String(p || "").replace(/[^0-9]/g, "");

// 같은 휴대폰 번호 → 그 번호로 신청한 사람들. ⚠️ 명단 **전체**로 센다(거르기로 한쪽이 가려져도 표시는 남는다).
// 번호는 결정이 나면 서버가 지우므로 남은 것끼리만 본다.
export function dupMap(allRows) {
  const m = new Map();
  for (const r of allRows) {
    const d = digits(r.phone);
    if (!d) continue;
    if (!m.has(d)) m.set(d, new Map());
    m.get(d).set(personKey(r), { name: r.name || "", who: r.who || "" });
  }
  // 한 사람만 쓰는 번호는 중복이 아니다
  for (const [d, people] of m) if (people.size < 2) m.delete(d);
  return m;
}

// 이 신청(들)과 같은 번호를 쓰는 **다른 사람**들 — 이름이 같으면 「다른 소속」, 다르면 「다른 신청자」(가족 등)
export function dupOthers(m, rows) {
  const list = Array.isArray(rows) ? rows : [rows];
  const me = new Set(list.map(personKey));
  const seen = new Map();
  for (const r of list) {
    const people = m.get(digits(r.phone));
    if (!people) continue;
    people.forEach((p, k) => { if (!me.has(k)) seen.set(k, p); });
  }
  const name = (list[0] || {}).name || "";
  return [...seen.values()].map((p) => p.name === name
    ? { kind: "소속", label: p.who || "소속 없음", name: p.name, who: p.who }
    : { kind: "사람", label: (p.name || "이름 없음") + (p.who ? " · " + p.who : ""), name: p.name, who: p.who });
}

// 팀별 신청 수 — **지금 걸러진 목록**으로 센다(서버 합계는 취소까지 넣어 화면과 어긋났다)
export function teamCounts(rows) {
  const c = new Map();
  for (const r of rows) c.set(teamKey(r), (c.get(teamKey(r)) || 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"));
}

export function statusCounts(rows) {
  const o = Object.fromEntries(STATES.map((s) => [s, 0]));
  for (const r of rows) if (r.status in o) o[r.status]++;
  return o;
}
```

Run → PASS · preflight 통과 · 커밋(푸시 안 함): `feat(사역): 신청 현황 화면 논리 — 거르기·신청일·같은 번호·팀별 수(순수 함수)`

---

### Task 5: 화면 — `status-ui.js` · `status.js` · 메뉴 한 줄 · CSS · 바꾼 기록 이름표

**Files:** Create `js/menus/ministry/status-ui.js`, `js/menus/ministry/status.js`; Modify `js/menus/registry.js`, `css/admin.css`, `js/menus/system/audit.js`

**Interfaces:**
- Consumes: Task 3 의 세 액션 · Task 4 의 `status-logic.js` · `ui.js` 의 `esc`·`toast`·`dialog`·`busy`·`errorText`·`kstTime` · 메뉴 약속 `render(el, { call })`
- Produces: `status-ui.js` — `cardHtml(r, inView, dupHtml)` · `rowsHtml(list, mainOf, subOf, extraOf)` · `phoneHtml(phone, small)` · `dupBadgeHtml(dup)` · `groupsHtml(rows, view, openSet, dupM)` · `askCancelReason(r): Promise<string|null>` · `confirmAppoint(r): Promise<boolean>` · `confirmDelete(r): Promise<boolean>`; `status.js` — `render(el, { call })`

이 Task 는 **원문을 옮기는 일**이다. `docs/port/ministry-status-legacy.md` **2절 전체(2.0~2.16)를 읽고**, 아래 대응표대로 바꿔 옮긴다. 원문의 동작은 **3절 체크리스트 4~31·34·36·37번을 모두** 지켜야 한다(1~3·38~42 는 옛 인증·죽은 코드·발견 사항이라 옮기지 않는다 — 단 40·41 은 아래 「달라지는 것」으로 고친다).

**대응표(옛 → 새)**

| 옛 | 새 |
|---|---|
| `plEsc(x)` | `esc(x)` (`ui.js`) |
| `mnDialog({icon,title,html,note,ok,cancel,danger})` | `dialog({ title: icon + " " + title, html, ok, cancel, danger })` — `note` 는 html 끝에 `<p class="muted">…</p>` 로. html 안의 사용자 글자는 `esc` |
| `mnNote(msg)` | `toast(msg)` |
| `callApi({ action, pw:getPw(), staff:getStaff(), ... })` | `call(action, { ... })` — 암호·담당자 칸은 없앤다 |
| `minAuthLost(d)` · `getPw` · `getStaff` · `logoutBtn` · `renderMenu`/「← 메뉴」 | 없앤다(권한 잃음은 `call()` 이 알아서 로그인 화면으로) |
| `.rep-head.mn-top` 제목 줄 | `<h2 class="page-title">📋 신청 현황 <span class="muted">{year}년</span></h2>` |
| `.adm-acts` 의 새로 불러오기 | `.acts` 줄의 `↻ 새로 불러오기` 단추(새 `<section>` 으로 바꿔 다시 그린다 — 2단계 임명현황과 같은 꼴) |
| `window.scrollTo(0,0)` | 뺀다(route 가 한다) |
| 전역 `mnRows`·`mnView`·`mnStOn`·`mnRange`·`mnCondOpen`·`mnOpen` | `status.js` 모듈 변수(보기·거르기는 메뉴를 옮겨 다녀도 남는다). `mnLoaded` 캐시는 **없앤다** — 메뉴를 열 때마다 새로 불러온다 |
| `mnRangeDates`·`mnFiltered`·`mnPersonKey`·`mnTeamKey`·`mnDupMap`·`mnDupOthers` | `status-logic.js` 의 `rangeDates`·`filterRows`·`personKey`·`teamKey`·`dupMap`·`dupOthers` |
| `mnCard`(mnRender 안 클로저) | `status-ui.js` `cardHtml(r, inView, dupHtml)` |
| `mnGroupsHtml`·`mnRowsHtml`·`mnPhoneHtml`·`mnDupBadge` | `status-ui.js` 의 같은 일을 하는 함수 |
| `mnAskCancelReason` | `status-ui.js` `askCancelReason(r)` — 자체 창(원문 마크업·프리셋 넷·자동 초점 없음·사유 비면 「취소하기」 잠김·바깥은 눌렀다 뗄 때 모두 바깥이어야 닫힘) |
| 임명 확인 창(원문 2.10 의 🔔/🔕 두 문구) | `confirmAppoint(r)` — `r.canPush` 로 문구를 가른다. **`r.notified_at` 이 있으면 창을 띄우지 않고 true**(원문 그대로) |
| 삭제 두 창(원문 2.9) | `confirmDelete(r)` — 첫 창 「무엇을 지우는지」(이름·소속·사역·지금 상태), 둘째 창 「정말 지울까요 — 되돌릴 수 없어요」(danger) |
| `.mn-*`·`.pl-*` CSS(원문 2.15·2.16) | `css/admin.css` 끝에 옮긴다. 값은 `tokens.css` 변수로(`--tap-lg`·`--tap`·`--chip`·`--gap`…). 11~12px 글씨는 13px 로. **붙는 머리 `.mn-head` 의 `top` 은 `var(--head-h)`**(우리 머리줄 아래). `[hidden]{display:none!important}` 는 이미 전역에 있다 |

**달라지는 것(옛 화면보다 나아지는 것 — 이것만 새로 짠다)**
1. **동시 수정 대조:** 상태를 바꿀 때 `expect: r.status`(화면이 본 상태)를 보낸다. 답이 `conflict` 면 낙관적으로 바꿔 둔 것을 되돌리고 `dialog({ title:"다른 분이 먼저 바꿨어요", text: "지금 상태: " + SHORT[d.status] + " — 새로 불러올게요", cancel:null })` 뒤 다시 불러온다.
2. **메뉴를 열 때마다 새로 불러온다**(옛 `mnLoaded` 캐시 — 체크리스트 40 — 를 없앰).
3. **임명 알림 결과 넷:** `already` → 「이미 알림이 나간 분이에요」 · `pushed>0` → 「🔔 알림을 보냈어요(N대)」 · `pushError==="not-subscribed"` → 「🔕 알림을 안 켜신 분이에요 — 게시·연락으로 알려 주세요」 · 그 밖의 `pushError` → **dialog** 「알림이 가지 않았어요 — 게시·연락으로 알려 주세요」(+오류 글).
4. 결과가 `phoneCleared` 면 그 행의 `phone` 을 비운다(카드에서 번호가 바로 사라진다 — 원문 그대로).

- [ ] **Step 1: `status-ui.js` · `status.js` 쓰기**(위 대응표·체크리스트대로). 이벤트는 **`<section>` 하나에 click 하나**로 모은다(`data-act`·`data-id`). 상태 메뉴(`.pl-menu`)는 한 번에 하나만 열리고 바깥 누르면 닫힌다(원문 `plCloseMenus`).
- [ ] **Step 2: 메뉴 한 줄 — `js/menus/registry.js`** — `appointed` 줄 **위**에:

```js
  { id: "status", group: "사역신청", icon: "📋", label: "신청 현황", desc: "접수·임명·취소 · 같은 번호 확인 · 삭제",
    role: "ministry", load: () => import("./ministry/status.js") },
```

- [ ] **Step 3: 바꾼 기록 이름표 — `js/menus/system/audit.js`** — `LABEL` 에 `"ministry.status": "사역 상태 바꿈"`, `"ministry.delete": "사역 신청 삭제"`, `detailText` 에:

```js
  if (r.action === "ministry.status") return `${d.name || ""} · ${d.team || ""} · ${d.before || ""} → ${d.after || ""}${d.note ? " · 사유: " + d.note : ""}`;
  if (r.action === "ministry.delete") return `${d.name || ""} · ${d.who || ""} · ${d.committee || ""} ${d.team || ""} (${d.status || ""})`;
```
(`target` 은 신청 번호라 이름으로 안 바뀐다 — 그대로 둔다.)

- [ ] **Step 4: 확인** — `python tools/preflight.py`(문법·시험·stamp) → 모두 통과. `python -m http.server 8000` 을 뒤에서 띄워 `/`·`/js/menus/ministry/status.js`·`/js/menus/ministry/status-ui.js` 가 200 인지 curl 로 보고 끈다(눈으로 보는 확인은 Task 7 에서 친구와).
- [ ] **Step 5: 커밋(푸시 안 함)** — `feat(사역): 신청 현황 화면 — 건별·사람별·사역별 · 상태 바꾸기·임명 알림·삭제 · 같은 번호(성경암송 관리 화면에서 옮김)`

---

### Task 6: PC 에서 건별을 표로 (≥1024px)

**Files:** Modify `js/menus/ministry/status-ui.js`, `js/menus/ministry/status.js`, `css/admin.css`

- [ ] **Step 1:** `status-ui.js` 에 `tableHtml(rows, dupM)` — 한 행 = 한 건. 칸: **이름(직분) · 소속 · 부서 › 사역팀(하위) · 신청일 · 전화(+같은 번호 표시) · 상태**. 상태 칸에는 카드와 **같은 상태 메뉴 마크업**(`.pl-drop` … `data-id`)을 넣어 같은 click 처리로 바꾸고 지운다. 행 제목에 🔔(알림 켬)/🔕 작은 표시, `source==="paper"` 면 「📋 종이」.
- [ ] **Step 2:** `status.js` — 보기가 건별이고 `matchMedia("(min-width:1024px)").matches` 면 카드 대신 표. `matchMedia` 의 change 에 다시 그린다(창 크기를 바꿔도 맞게). 사람별·사역별은 그대로 묶음.
- [ ] **Step 3:** CSS — `.mn-table`(가로 넘치면 `.mn-table-wrap{overflow-x:auto}` — ⚠️ 이 감싸개 **안**의 상태 메뉴가 잘리지 않게 메뉴는 `position:fixed` 로 열거나, 감싸개에 overflow 를 두지 말고 표를 `table-layout:fixed` + 줄바꿈으로 맞춘다 — 둘 중 **후자**로 한다), 머리행 붙음(`position:sticky; top: calc(var(--head-h) + 붙는 머리 높이)` 대신 **붙이지 않는다** — 붙는 머리 `.mn-head` 와 겹친다).
- [ ] **Step 4:** preflight · 커밋(푸시 안 함) — `feat(사역): PC 에서 신청 현황 건별을 표로`

---

### Task 7: 확인 · 운영 올리기 (컨트롤러가 친구와 함께)

- [ ] **Step 1: localhost 확인(개발 DB)** — church-admin 루트에서 `python -m http.server 8000` → 친구가 `http://localhost:8000` → 📋 신청 현황:
  처음엔 「신청」만 켜진 채 · 상태 막대(누르면 그것만, 더 누르면 더함, 다 고르면 전체) · 보기 셋과 숫자 · 신청일(전체/오늘/7일/직접) · 찾기 · 팀별 신청 수 ·
  카드에서 **접수 → 임명**(확인 창 🔔/🔕 문구) · **취소**(사유 창, 비면 잠김) · **삭제**(창 두 번) · 사람별·사역별 묶음 펼침/상태 바꾸기(메뉴가 잘리지 않는지) ·
  같은 번호 표시 · 전화 누르기 · 360px · 1280px(표) · 📜 바꾼 기록에 「사역 상태 바꿈」「사역 신청 삭제」.
  개발 DB 의 신청은 시험용이라 바꿔도 된다.
- [ ] **Step 2: 동시 수정 확인** — 두 창(일반 창 + 시크릿 창에 같은 계정)으로 같은 건을 연 뒤 한쪽에서 접수, 다른 쪽에서 임명 → 「다른 분이 먼저 바꿨어요」.
- [ ] **Step 3: 숫자 대조(운영, 읽기만)** — `select status, count(*) from ministry_orders where year=<연도> group by 1` 과, 운영에 올린 뒤 새 화면 상태 막대 숫자가 같아야 한다.
- [ ] **Step 4: 운영 — `api` 먼저** — 성경암송: `git status --short supabase/functions/` 비었는지 · `supabase functions list --project-ref xnomlgydifiqiybervtf` 로 api 의 마지막 배포 시각을 보고, **그 뒤에 `supabase/functions/api/index.ts` 를 고친 남의 커밋이 없는지** `git log --since=<그 시각> -- supabase/functions/api/index.ts` 로 확인(있으면 멈추고 친구에게) → `supabase functions deploy api --no-verify-jwt --project-ref xnomlgydifiqiybervtf` → 머리 없이 `internalMinistryNotify` 부르면 `unauthorized`.
- [ ] **Step 5: 운영 — church-admin 함수** — `git status --short` 깨끗 → `supabase functions deploy church-admin --no-verify-jwt --project-ref xnomlgydifiqiybervtf`.
- [ ] **Step 6: 화면 푸시** — church-admin `git push`(Task 1~6 커밋) · 성경암송은 Task 2 커밋을 푸시(그 저장소는 푸시=화면 배포지만 바뀐 것은 서버 파일뿐이라 화면은 그대로다 — `git log origin/main..HEAD` 로 **내 커밋만** 있는지 먼저 본다) → 라이브 importmap 에 `js/menus/ministry/status.js?v=` 가 있는지.
- [ ] **Step 7: 친구가 admin.onlybible.kr 에서** — 상태 막대 숫자가 Step 3 과 같은지. **운영에서는 실제 성도님 신청이다 — 확인은 보기만** 하고, 상태 바꾸기는 친구가 실제 일로 할 때 한다.
- [ ] **Step 8: 기록** — church-admin `progress.md` · 성경암송 CLAUDE.md 「다음 작업」의 교회 어드민 줄(3단계 끝 · 다음 4단계 사역팀 정보) · 성경암송 `docs/notes/ministry-2027.md` 끝에 한 줄(「2026-09-28: 교회 어드민에 신청 현황이 생겼다 — 옛 화면·옛 액션은 얼림. 임명 알림은 api `internalMinistryNotify` 한 곳」). 경로 커밋.
