# 성도 묻기 — 직분 · 교구 고르기 칸 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 교회 어드민 「🤖 성도 묻기」에 직분(큰 묶음 + 세부 직분)·교구 여러 개 고르기 칸을 더한다 — 고른 것은 서버가 바로 거르는 조건이고, 질문 없이 고르기만 하면 AI 를 부르지 않는다.

**Architecture:** 서버 규약 파일 `ask-people.ts` 에 AI 밖의 잎 `pos_pick` 과 고르기 도우미(`askPicks`·`picksToLeaves`·`withPicks`·`askOptions`)를 더하고, `index.ts` 의 `askPeople` 이 `picks` 를 받아 AI 트리 앞에 붙이거나(질문 있음) AI 없이 센다(질문 없음). 새 액션 `askPeopleOptions` 가 고르기 목록(값 · 인원 수)을 준다. 화면 `ask.js` 는 공용 고르개 `pickMany`(새 「모두 고르기」 단추)로 고르고, 순수 도우미 `ask-logic.js` 가 「모두 = 조건 없음」을 처리한다.

**Tech Stack:** church-admin 저장소 — Vanilla JS(브라우저 ES 모듈) · Supabase Edge Function(Deno, TypeScript) · 시험 `node --experimental-strip-types --test` · 배포 가드 `tools/deploy-fn.py` · 화면은 main 푸시 → GitHub Pages.

**설계:** 성경암송 저장소 `docs/superpowers/specs/2026-10-19-ask-people-picks-design.md` · 함정 church-admin `docs/notes/ask.md`.

⚠️ **아래 모든 파일 경로는 church-admin 저장소(`C:\Projects\church-admin`) 기준이다.** (이 계획 문서만 성경암송 저장소에 있다.)

## Global Constraints

- **세부 직분은 AI 에 보내지 않는다** — `askSystemPrompt` · `askSchema` 가 만드는 글은 바뀌지 않아야 한다(`FIELDS` 에 새 칸을 넣지 않는다). 견주기(`tools/ask-eval`)는 돌리지 않는다.
- 고르기 칸은 서버가 바로 거르는 조건 · 질문 조건과 「그리고」 · **질문 없이 고르기만 하면 AI 를 부르지 않는다.**
- 같은 칸 안의 여러 값은 「또는」 · 직분 칸과 교구 칸끼리는 「그리고」.
- **모두 고름 = 조건 없음**(보낼 때 빈 배열).
- 고르기 목록 응답에 이름 · 교인ID 를 싣지 않는다(값과 인원 수만).
- 고르기 · 날짜는 `js/core/picker.js` 만(`<select>`·브라우저 confirm/alert 금지).
- 새 액션 = `authz.ts` `ACTION_ROLES` + `index.ts` `switch` case + `tests/server.dev.test.mjs` `PROBE` — 셋 다.
- 고른 잎의 `from_text` 는 「고른 직분」·「고른 교구」 — 서버 `PICK_FROM` 과 화면 `PICK_FROM` 이 글자까지 같다.
- 교구 차례는 `BE_GU`(믿음 · 소망 · 사랑 · 섬김 · 은혜 · 화평 · 기쁨 · 새가족) — 2026-10-19 친구 「ok」.
- 배포: **서버(함수) 먼저 → 화면 나중.** 함수는 `python tools/deploy-fn.py church-admin --dev|--prod` 로만(`supabase functions deploy` 직접 금지). 개발 먼저.
- 커밋은 **경로를 못 박아서**(`git add -- <파일>` · `git add -A` 금지) · 커밋 전 `python tools/preflight.py` 가 「모두 통과」.
- 새 SQL 없음 · 개인정보 방침 변화 없음.
- 주석 · 화면 글은 지금 파일과 같은 한국어 말투.

## 파일 지도

| 파일 | 할 일 |
|---|---|
| `supabase/functions/church-admin/ask-people.ts` | 수정 — 세부 직분 재료 · `pos_pick` 잎 · 고르기 도우미 · 고르기 목록(순수) |
| `tests/ask-picks.test.mjs` | 새로 — 서버 고르기 순수 함수 시험 |
| `supabase/functions/church-admin/index.ts` | 수정 — `askData` 가 `position_detail` 을 읽음 · `askPeople` 이 `picks` · 새 액션 `askPeopleOptions` · switch |
| `supabase/functions/church-admin/authz.ts` | 수정 — `askPeopleOptions: "directory"` |
| `tests/authz.test.mjs` | 수정 — 교인명부 액션 목록에 `askPeopleOptions` |
| `tests/server.dev.test.mjs` | 수정 — `PROBE` 한 줄 · 고르기 개발 시험 하나 |
| `js/core/picker.js` | 수정 — `pickMany` 에 `allBtn`(「모두 고르기」) |
| `js/menus/people/ask-logic.js` | 새로 — 화면 순수 도우미(`PICK_FROM` · `picksToSend` · `pickSummary`) |
| `tests/ask-picks-ui.test.mjs` | 새로 — 화면 순수 도우미 시험 · `PICK_FROM` 두 벌이 같은지 |
| `js/menus/people/ask.js` | 수정 — 고르기 단추 둘 · 목록 받기 · 보낼 때 `picks` · 칩 × 로 칸 비우기 |
| `css/admin.css` | 수정 — `.ak-picks` 한 줄 |
| `docs/notes/ask.md` | 수정 — 「고르기 칸」 절 |

---

### Task 1: 서버 규약 — 세부 직분 · `pos_pick` 잎 · 고르기 도우미 · 목록

**Files:**
- Modify: `supabase/functions/church-admin/ask-people.ts`
- Test: `tests/ask-picks.test.mjs`(새로)

**Interfaces:**
- Consumes: 이미 있는 `positionBucket`(`./ministry-stats.ts`) · `BE_GU`(`./events-rules.ts`) · `checkTree` · `runTree` · `describeLeaf` · `buildAskData` · `askSchema` · `askSystemPrompt` · `ASK_MAX_LEAVES`.
- Produces(Task 2·4 가 쓴다):
  - `posDetailOf(position: unknown, detail: unknown): string`
  - `PICK_GROUPS: string[]`(장로 · 안수집사 · 권사 · 집사) · `PICK_ALL = " 전체"` · `PICK_FROM = { pos: "고른 직분", gu: "고른 교구" }` · `PICK_MAX = 30`
  - `type Picks = { pos: string[]; gu: string[] }` · `askPicks(raw: any): Picks`
  - `picksToLeaves(p: Picks): any[]` · `withPicks(raw: any, leaves: any[]): any`
  - `askOptions(d: AskData): { people: number; positions: { value: string; label: string; count: number; kind: "group" | "detail" }[]; gu: { value: string; count: number }[] }`
  - `AskPerson.posDetail: string` · `AskVocab.posDetail: string[]`

- [ ] **Step 1: 실패하는 시험을 쓴다** — `tests/ask-picks.test.mjs`

```js
// 🤖 성도 묻기 — 직분 · 교구 고르기 칸(2026-10-19 · 설계 성경암송 docs/superpowers/specs/2026-10-19-ask-people-picks-design.md)
//   서버 규약(supabase/functions/church-admin/ask-people.ts)의 순수 함수. 이름은 모두 지어낸 것(시험-가 …). DB 없이 돈다.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  askOptions, askPicks, askSchema, askSystemPrompt, buildAskData, checkTree, describeLeaf, picksToLeaves, posDetailOf,
  runTree, statusOf, withPicks, ASK_MAX_LEAVES, PICK_FROM, PICK_MAX,
} from "../supabase/functions/church-admin/ask-people.ts";

const TODAY = "2026-10-19";
const Y = 2026;
// 교인 일곱 — 세부 직분이 고루 섞이게
const P = (id, name, position, position_detail, mok1) =>
  ({ person_id: id, name, position, position_detail, gender: "남", age: 50, mok1, mok3: `${mok1}-1목장`, kind2: "장년", registered_date: "2001-01-01" });
const PEOPLE = [
  P(1, "시험-가", "장로", "시무장로", "믿음"),
  P(2, "시험-나", "장로", "은퇴장로", "화평"),
  P(3, "시험-다", "안수집사", "시무안수집사", "기쁨"),
  P(4, "시험-라", "권사", "", "화평"),
  P(5, "시험-마", "", "", "임시교구"),
  P(6, "시험-바", "장로", "시무장로", "화평"),
  P(7, "시험-사", "-", "", "믿음"),
];
const D = buildAskData(PEOPLE, [], [], [], [], []);
const names = (raw) => runTree(checkTree(raw, D.vocab, Y).tree, D).map((p) => p.name).sort();
const pick = (list) => ({ field: "pos_pick", op: "in", list, from_text: PICK_FROM.pos });

test("세부 직분 — 직분상세 · 비면 직분 · 둘 다 비거나 「-」면 「직분 없음」 · 앞뒤 빈칸 다듬기", () => {
  assert.equal(posDetailOf("장로", "시무장로"), "시무장로");
  assert.equal(posDetailOf("권사", ""), "권사");
  assert.equal(posDetailOf("", ""), "직분 없음");
  assert.equal(posDetailOf("-", ""), "직분 없음");
  assert.equal(posDetailOf("집사", " 서리집사 "), "서리집사");
  assert.equal(D.people.find((p) => p.id === 4).posDetail, "권사");
  assert.equal(D.people.find((p) => p.id === 7).posDetail, "직분 없음");
  assert.ok(D.vocab.posDetail.includes("시무장로") && D.vocab.posDetail.includes("직분 없음"));
});

test("pos_pick — 「장로 전체」= 큰 묶음 · 세부 값 · 같은 칸은 「또는」 · 큰 묶음과 세부 섞기", () => {
  assert.deepEqual(names({ all: [pick(["장로 전체"])] }), ["시험-가", "시험-나", "시험-바"]);
  assert.deepEqual(names({ all: [pick(["시무장로", "시무안수집사"])] }), ["시험-가", "시험-다", "시험-바"]);
  assert.deepEqual(names({ all: [pick(["장로 전체", "권사"])] }), ["시험-가", "시험-나", "시험-라", "시험-바"]);
  assert.deepEqual(names({ all: [pick(["직분 없음"])] }), ["시험-마", "시험-사"]);
});

test("pos_pick — 목록 밖 값은 알리고 뺀다 · 모두 목록 밖이면 unsupported(no_data)", () => {
  const c = checkTree({ all: [pick(["시무장로", "없는직분"])] }, D.vocab, Y);
  assert.deepEqual(c.tree.all[0].list, ["시무장로"]);
  assert.ok(c.notices.some((x) => x.includes("없는직분")));
  const bad = checkTree({ all: [pick(["없는직분"])] }, D.vocab, Y);
  assert.equal(bad.tree.all.length, 0);
  assert.equal(bad.unsupported[0].kind, "no_data");
  assert.equal(statusOf(bad), "none");
});

test("고르기 → 잎 — 직분 · 교구 · 빈 칸은 잎 없음 · 직분 칸과 교구 칸은 「그리고」", () => {
  assert.deepEqual(picksToLeaves({ pos: [], gu: [] }), []);
  const leaves = picksToLeaves({ pos: ["시무장로"], gu: ["화평"] });
  assert.deepEqual(leaves.map((l) => [l.field, l.from_text]), [["pos_pick", PICK_FROM.pos], ["gu", PICK_FROM.gu]]);
  assert.deepEqual(names(withPicks({}, leaves)), ["시험-바"]);
});

test("AI 트리 + 고른 잎 — 고른 잎이 「그리고」 맨 앞 · 잎 상한에서 고른 잎이 남는다", () => {
  const ai = { all: Array.from({ length: ASK_MAX_LEAVES }, () => ({ field: "age", op: ">=", num: 1, from_text: "나이" })), any: [], none: [] };
  const c = checkTree(withPicks(ai, picksToLeaves({ pos: ["장로 전체"], gu: ["화평"] })), D.vocab, Y);
  assert.equal(c.tree.all.length, ASK_MAX_LEAVES);
  assert.deepEqual(c.tree.all.slice(0, 2).map((l) => l.field), ["pos_pick", "gu"]);
  assert.equal(c.unsupported.filter((u) => u.kind === "too_complex").length, 2);
});

test("askPicks — 문자열만 · 빈 것 빼고 · 겹친 것 하나로 · 칸마다 PICK_MAX 개까지", () => {
  assert.deepEqual(askPicks({ pos: ["시무장로", "시무장로", 3, "", null, "권사"], gu: "화평" }), { pos: ["시무장로", "권사"], gu: [] });
  assert.equal(askPicks({ pos: Array.from({ length: 40 }, (_, i) => `직분${i}`) }).pos.length, PICK_MAX);
  assert.deepEqual(askPicks(null), { pos: [], gu: [] });
});

test("칩 글 — 고른 직분", () => {
  const c = checkTree({ all: [pick(["장로 전체", "시무안수집사"])] }, D.vocab, Y);
  assert.equal(describeLeaf(c.tree.all[0]), "직분 장로 전체·시무안수집사");
});

test("고르기 목록 — 큰 묶음(사람 있는 것만) → 세부(큰 묶음 차례 · 많은 순 · 「직분 없음」 끝) · 교구는 BE_GU 차례 → 그 밖", () => {
  const o = askOptions(D);
  assert.equal(o.people, 7);
  assert.deepEqual(o.positions.map((x) => [x.value, x.count, x.kind]), [
    ["장로 전체", 3, "group"], ["안수집사 전체", 1, "group"], ["권사 전체", 1, "group"],
    ["시무장로", 2, "detail"], ["은퇴장로", 1, "detail"], ["시무안수집사", 1, "detail"], ["권사", 1, "detail"], ["직분 없음", 2, "detail"],
  ]);
  assert.deepEqual(o.gu, [{ value: "믿음", count: 2 }, { value: "화평", count: 3 }, { value: "기쁨", count: 1 }, { value: "임시교구", count: 1 }]);
  for (const x of o.positions) assert.deepEqual(Object.keys(x).sort(), ["count", "kind", "label", "value"]);
});

test("AI 에게 가는 것은 그대로 — 스키마 field 값에 pos_pick 없음 · 지시문에 pos_pick · 세부 직분 값 없음", () => {
  const fields = askSchema().properties.all.items.properties.field.enum;
  assert.ok(!fields.includes("pos_pick"));
  const sys = askSystemPrompt(D.vocab, TODAY);
  for (const w of ["pos_pick", "시무장로", "은퇴장로", "시무안수집사", PICK_FROM.pos, PICK_FROM.gu]) assert.ok(!sys.includes(w), w);
});
```

- [ ] **Step 2: 시험이 실패하는지 본다**

Run: `node --experimental-strip-types --test tests/ask-picks.test.mjs`
Expected: FAIL — `askOptions` 등을 export 하지 않아 `SyntaxError: The requested module ... does not provide an export named 'askOptions'`.

- [ ] **Step 3: `ask-people.ts` — import · 상수 · 고르기 필드**

맨 위 import 줄 `import { positionBucket } from "./ministry-stats.ts";` 바로 아래에 더한다:

```ts
import { BE_GU } from "./events-rules.ts";   // 교회 정한 교구 차례(고르기 목록 · 2026-10-19)
```

`export const POSITIONS = [...]` 줄 바로 아래에 더한다:

```ts
// 화면 고르기 칸(2026-10-19 · 설계 성경암송 docs/superpowers/specs/2026-10-19-ask-people-picks-design.md) — **AI 에는 보내지 않는다.**
//   FIELDS 에 넣지 않는다(AI 스키마의 field 값 · 지시문의 필드 표가 FIELDS 에서 나온다). checkLeaf 만 PICK_FIELDS 를 함께 본다
//   (칩 × 길 askPeopleRun 의 트리에 이 잎이 있어도 같은 검사를 거쳐야 한다).
export const PICK_GROUPS = ["장로", "안수집사", "권사", "집사"];          // 「X 전체」로 고르는 큰 묶음
export const PICK_ALL = " 전체";
// 고른 잎의 from_text — ⚠️ 화면 js/menus/people/ask-logic.js 의 PICK_FROM 과 글자까지 같게(tests/ask-picks-ui.test.mjs 가 본다)
export const PICK_FROM = { pos: "고른 직분", gu: "고른 교구" };
export const PICK_MAX = 30;                                              // 칸마다 고른 값 상한
```

`const FIELD_BY_ID: Record<string, FieldDef> = ...` 줄을 아래 넷으로 바꾼다(`FIELD_BY_ID` 는 그대로 두고 검사용 표를 하나 더):

```ts
const FIELD_BY_ID: Record<string, FieldDef> = Object.fromEntries(FIELDS.map((f) => [f.id, f]));
export const PICK_FIELDS: FieldDef[] = [
  { id: "pos_pick", label: "직분", ops: ["in"], value: "list", service: false, desc: "화면 고르기 칸 — 「장로 전체」 꼴 큰 묶음 또는 세부 직분" },
];
const CHECK_BY_ID: Record<string, FieldDef> = { ...FIELD_BY_ID, ...Object.fromEntries(PICK_FIELDS.map((f) => [f.id, f])) };
```

- [ ] **Step 4: 세부 직분 재료**

`function posOf(p: unknown): string { ... }` 함수 바로 아래에 더한다:

```ts
// 세부 직분 — 직분상세 → 비었으면 직분 → 둘 다 비면(「-」도) 「직분 없음」. 모든 분이 한 값에 든다(고르기 목록 · pos_pick).
export function posDetailOf(position: unknown, detail: unknown): string {
  const t = (x: unknown) => { const s = clean(x); return s === "-" ? "" : s; };
  return t(detail) || t(position) || "직분 없음";
}
```

`AskPerson` 타입의 `id: number; name: string; position: string; pos: string;` 를 `id: number; name: string; position: string; pos: string; posDetail: string;` 로 바꾼다.

`AskVocab` 타입의 `gu: string[]; kind: string[];` 를 `gu: string[]; kind: string[]; posDetail: string[];` 로 바꾼다.

`buildAskData` 안에서
`const guN = new Map<string, number>(), kindN = new Map<string, number>(), moks = new Set<string>();` 를
`const guN = new Map<string, number>(), kindN = new Map<string, number>(), posDN = new Map<string, number>(), moks = new Set<string>();` 로 바꾸고,

```ts
    people.push({ id, name: clean(r?.name), position: clean(r?.position), pos: posOf(r?.position), gender: clean(r?.gender),
      age, gu, mok, mokKey: mokKey(mok), kind, regYear: yearOf(r?.registered_date) });
```
를
```ts
    const posDetail = posDetailOf(r?.position, r?.position_detail);
    people.push({ id, name: clean(r?.name), position: clean(r?.position), pos: posOf(r?.position), posDetail, gender: clean(r?.gender),
      age, gu, mok, mokKey: mokKey(mok), kind, regYear: yearOf(r?.registered_date) });
    posDN.set(posDetail, (posDN.get(posDetail) ?? 0) + 1);
```
로 바꾼다. 맨 끝 `return` 의 `vocab: { gu: byCount(guN), kind: byCount(kindN),` 를 `vocab: { gu: byCount(guN), kind: byCount(kindN), posDetail: byCount(posDN),` 로 바꾼다.

- [ ] **Step 5: 검사 · 셈 · 칩 글**

`function findName(...)` 함수 바로 아래에 더한다:

```ts
// 고르기 칸 직분 값 — 「장로 전체」 꼴(큰 묶음)이면 그 묶음 이름, 아니면 null
const pickGroup = (t: string): string | null => PICK_GROUPS.find((g) => t === g + PICK_ALL) ?? null;
// 고르기 칸 직분 값을 목록과 맞대 본다 — 큰 묶음 「X 전체」 또는 명부의 세부 직분. 목록 밖이면 null
//   (견주기 askEval 은 운영 값 목록 vocab 을 따로 넘기는데 거기엔 posDetail 이 없다 — 비어 있어도 죽지 않게 ?? [])
function pickToken(v: AskVocab, x: string): string | null {
  return pickGroup(x) ? x : findName(v.posDetail ?? [], x);
}
```

`checkLeaf` 첫 줄 `const f = FIELD_BY_ID[String(r?.field ?? "")];` 를 `const f = CHECK_BY_ID[String(r?.field ?? "")];` 로 바꾼다.

`checkLeaf` 의 `list` 갈래에서
```ts
        if (p) { if (!ok.includes(p)) ok.push(p); } else bad.push(x);
      }
```
(직분 `position` 갈래의 끝) 바로 뒤, `for` 를 닫는 `}` 앞에 더한다:
```ts
      else if (f.id === "pos_pick") {
        const tk = pickToken(v, x);
        if (tk) { if (!ok.includes(tk)) ok.push(tk); } else bad.push(x);
      }
```
⚠️ 앞 갈래가 `} else if (f.id === "position") { ... }` 로 끝나므로, 위 덩이는 그 `}` 바로 뒤에 `else if` 로 붙는다(전체가 `if (gu) {…} else if (position) {…} else if (pos_pick) {…}` 가 되게).

`leafTrue` 의 `case "position": return l.list.includes(p.pos);` 바로 아래에 더한다:
```ts
    case "pos_pick": return l.list.some((t) => { const g = pickGroup(t); return g ? p.pos === g : p.posDetail === t; });
```

`describeLeaf` 의 `case "position": s = \`직분 ${l.list.join("·")}\`; break;` 바로 아래에 더한다:
```ts
    case "pos_pick": s = `직분 ${l.list.join("·")}`; break;
```

- [ ] **Step 6: 고르기 도우미 · 목록**

파일 맨 끝(`askOut` 함수 뒤)에 더한다:

```ts
// ---------- 화면 고르기 칸(2026-10-19) ----------
export type Picks = { pos: string[]; gu: string[] };
// 화면이 보낸 picks 를 다듬는다 — 문자열만 · 빈 것 빼고 · 겹친 것 하나로 · 칸마다 PICK_MAX 개까지(넘친 것은 버린다).
//   「모두 고름」은 화면이 빈 배열로 보낸다(설계 §1-3) — 서버는 그 뜻을 따로 알 필요가 없다(모두 보내와도 같은 명단이다).
export function askPicks(raw: any): Picks {
  const one = (a: unknown): string[] =>
    [...new Set((Array.isArray(a) ? a : []).filter((x) => typeof x === "string").map((x) => str(x, 40)).filter(Boolean))].slice(0, PICK_MAX);
  return { pos: one(raw?.pos), gu: one(raw?.gu) };
}
// 고른 값 → 조건 잎(검사 전 꼴 — checkTree 가 AI 잎과 같은 검사를 한다). 빈 칸은 잎을 만들지 않는다. 교구는 이미 있는 gu 잎.
export function picksToLeaves(p: Picks): any[] {
  const out: any[] = [];
  if (p.pos.length) out.push({ field: "pos_pick", op: "in", list: p.pos, from_text: PICK_FROM.pos });
  if (p.gu.length) out.push({ field: "gu", op: "in", list: p.gu, from_text: PICK_FROM.gu });
  return out;
}
// AI 트리 앞에 고른 잎을 둔다(「그리고」 맨 앞 — 잎 상한 ASK_MAX_LEAVES 안에서 고른 잎이 먼저 자리를 차지한다)
export function withPicks(raw: any, leaves: any[]): any {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return { ...r, all: [...leaves, ...(Array.isArray(r.all) ? r.all : [])] };
}

// 고르기 목록(askPeopleOptions) — 값과 인원 수만(이름 · 교인ID 없음).
//   직분: 큰 묶음 넷(「X 전체」 · 사람이 있는 것만) → 세부(큰 묶음 차례 안에서 많은 순 · 「직분 없음」 맨 끝)
//   교구: 교회 정한 차례(BE_GU) 가운데 명부에 있는 것 → 그 밖(많은 순)
const POS_ORDER = [...PICK_GROUPS, "그 밖"];
const byName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
export function askOptions(d: AskData) {
  const groupN = new Map<string, number>(), detN = new Map<string, number>(), guN = new Map<string, number>();
  for (const p of d.people) {
    if (PICK_GROUPS.includes(p.pos)) groupN.set(p.pos, (groupN.get(p.pos) ?? 0) + 1);
    detN.set(p.posDetail, (detN.get(p.posDetail) ?? 0) + 1);
    if (p.gu) guN.set(p.gu, (guN.get(p.gu) ?? 0) + 1);
  }
  const rank = (t: string) => (t === "직분 없음" ? 99 : Math.max(0, POS_ORDER.indexOf(positionBucket(t))));
  const details = [...detN.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || b[1] - a[1] || byName(a[0], b[0]));
  const positions = [
    ...PICK_GROUPS.filter((g) => groupN.get(g)).map((g) => ({ value: g + PICK_ALL, label: g + PICK_ALL, count: groupN.get(g)!, kind: "group" as const })),
    ...details.map(([t, n]) => ({ value: t, label: t, count: n, kind: "detail" as const })),
  ];
  const known = BE_GU.filter((g) => guN.has(g));
  const rest = [...guN.entries()].filter(([g]) => !BE_GU.includes(g)).sort((a, b) => b[1] - a[1] || byName(a[0], b[0])).map(([g]) => g);
  return { people: d.people.length, positions, gu: [...known, ...rest].map((g) => ({ value: g, count: guN.get(g)! })) };
}
```

- [ ] **Step 7: 시험이 통과하는지 본다 · 옛 시험도 그대로인지**

Run: `node --experimental-strip-types --test tests/ask-picks.test.mjs tests/ask-people.test.mjs`
Expected: PASS — `# fail 0`(새 시험 9개 + 옛 시험 모두).

- [ ] **Step 8: preflight · 커밋**

```bash
cd /c/Projects/church-admin && python tools/preflight.py | tail -1
git add -- supabase/functions/church-admin/ask-people.ts tests/ask-picks.test.mjs
git commit -m "feat(성도 묻기): 직분 · 교구 고르기 칸 — 서버 규약(세부 직분 · AI 밖 pos_pick 잎 · 고르기 → 잎 · 목록)" -- supabase/functions/church-admin/ask-people.ts tests/ask-picks.test.mjs
git show --stat --oneline HEAD
```
Expected: preflight 「모두 통과」 · 커밋에 두 파일만.

---

### Task 2: 서버 함수 — `askPeople` 이 고르기를 받음 · 새 액션 `askPeopleOptions` · 개발 배포

**Files:**
- Modify: `supabase/functions/church-admin/index.ts`(약 84줄 import · 1613줄 `askData` · 1688줄 `askPeople` · 3185줄 switch)
- Modify: `supabase/functions/church-admin/authz.ts:37-38`
- Modify: `tests/authz.test.mjs:38` · `tests/authz.test.mjs:83`
- Modify: `tests/server.dev.test.mjs`(PROBE 220줄 근처 · 새 시험 하나)
- Modify: `docs/notes/ask.md`

**Interfaces:**
- Consumes(Task 1): `askPicks` · `picksToLeaves` · `withPicks` · `askOptions` · `askOut` · `askQuestion`.
- Produces(Task 4 화면이 부른다):
  - `askPeople { question?: string, picks?: { pos: string[], gu: string[] } }` → 지금 응답 그대로 + 질문이 없으면 `model: ""` · `raw: null` · `usage: null` · `question: ""`. 둘 다 비면 `{ ok: false, error: "no-question" }`.
  - `askPeopleOptions {}` → `{ ok: true, people, positions: [{value,label,count,kind}], gu: [{value,count}] }`.

- [ ] **Step 1: 실패하는 시험 — 권한 표**

`tests/authz.test.mjs` 38줄 `for (const a of ["askPeople", "askPeopleRun"]) {` 를 `for (const a of ["askPeople", "askPeopleOptions", "askPeopleRun"]) {` 로,
83줄 `assert.deepEqual(acts.sort(), ["askPeople", "askPeopleRun", "peopleExport", ...` 를
`assert.deepEqual(acts.sort(), ["askPeople", "askPeopleOptions", "askPeopleRun", "peopleExport", "peopleHistory", "peopleLink", "peoplePerson", "peopleSearch", "peopleStats"]);` 로 바꾼다.

Run: `node --experimental-strip-types --test tests/authz.test.mjs`
Expected: FAIL — `askPeopleOptions` 가 `ACTION_ROLES` 에 없다(`undefined !== 'directory'`).

- [ ] **Step 2: 권한 · PROBE**

`authz.ts` 의 `askPeopleRun: "directory",` 줄 바로 아래에 더한다:
```ts
  askPeopleOptions: "directory",   // 고르기 칸 목록(값 · 인원 수만 — 이름 없음 · 2026-10-19)
```

`tests/server.dev.test.mjs` PROBE 의 `askPeopleRun: { tree: null },` 줄 바로 아래에 더한다:
```js
  // 고르기 칸 목록(2026-10-19) — 읽기만(값 · 인원 수) · 기록 없음
  askPeopleOptions: {},
```

Run: `node --experimental-strip-types --test tests/authz.test.mjs`
Expected: PASS.

- [ ] **Step 3: `index.ts` — import · 재료 칸 · 액션**

84줄 import 를 바꾼다:
```ts
import { ASK_CONTRACT, askOptions, askOut, askPicks, askQuestion, askSchema, askSystemPrompt, buildAskData, picksToLeaves, withPicks,
  type AskData } from "./ask-people.ts";
```

`askData()` 안의 교인명부 읽기
`allRows(() => db.from("church_people").select("person_id,name,position,gender,age,mok1,mok3,kind2,registered_date").order(...))`
의 select 글을 `"person_id,name,position,position_detail,gender,age,mok1,mok3,kind2,registered_date"` 로 바꾼다(고르기 칸의 세부 직분 · 2026-10-19 — 연락처 · 주소 · 생년월일은 여전히 읽지 않는다).

`async function askPeople(ctx: Ctx, b: any) { ... }` 함수 전체를 아래로 바꾼다:
```ts
// 질문(있으면 AI) + 고르기 칸(있으면 서버가 바로 거르는 잎 · 2026-10-19). 질문 없이 고르기만 하면 AI 를 부르지 않는다.
//   둘 다 비면 no-question — 재료도 안 읽고 AI 도 안 부른다(PROBE).
async function askPeople(ctx: Ctx, b: any) {
  const picks = askPicks(b.picks);
  const picked = picks.pos.length + picks.gu.length > 0;
  const q = askQuestion(b.question);
  if (!q.ok && (q.error !== "no-question" || !picked)) return q;
  const question = q.ok ? q.q : "";
  const data = await askData();
  const today = kstToday();
  const leaves = picksToLeaves(picks);
  const pk = picked ? { picks } : {};   // 기록 — 직분 · 교구 이름(사람 자료 아님)
  if (!question) {
    const out = askOut({ all: leaves, any: [], none: [] }, data, today, false);
    await audit(ctx, "people.ask", "", { q: "", ...pk, ai: false, status: out.status, total: out.total, contract: ASK_CONTRACT });
    return { ok: true, contract: ASK_CONTRACT, question: "", model: "", usage: null, raw: null, ...out };
  }
  const ai = await askClaude(question, data.vocab, today);
  if (!ai.ok) {
    await audit(ctx, "people.ask", "", { q: question.slice(0, 120), ...pk, error: ai.error });
    return ai;
  }
  const out = askOut(withPicks(ai.raw, leaves), data, today, true);
  await audit(ctx, "people.ask", "", { q: question.slice(0, 120), ...pk, status: out.status, total: out.total, contract: ASK_CONTRACT });
  return { ok: true, contract: ASK_CONTRACT, question, model: ai.model, usage: ai.usage, raw: ai.raw, ...out };
}

// 고르기 칸 목록 — 값과 인원 수만(이름 · 교인ID 없음 · 기록 없음). 재료는 askData 10분 담아 둔 것(먼저 부르면 묻기도 빨라진다).
async function askPeopleOptions(_ctx: Ctx, _b: any) {
  return { ok: true, ...askOptions(await askData()) };
}
```

switch 의 `case "askPeopleRun":   return json(await askPeopleRun(ctx, b));` 줄 바로 아래에 더한다:
```ts
      case "askPeopleOptions": return json(await askPeopleOptions(ctx, b));
```

- [ ] **Step 4: 개발 서버 시험을 더한다** — `tests/server.dev.test.mjs`, 「교인명부: 찾기…」 시험(875줄 근처) 바로 앞에

```js
test("성도 묻기 고르기 칸(2026-10-19): 목록은 값 · 인원만 · 고르기만 하면 AI 없이 센다 · 목록 밖 값 · 둘 다 비면 no-question", async () => {
  const d = people.directory.token;
  const o = await call(d, "askPeopleOptions");
  assert.equal(o.status, 200);
  assert.equal(o.body.ok, true);
  assert.ok(o.body.positions.length > 0 && o.body.gu.length > 0);
  for (const x of o.body.positions) assert.deepEqual(Object.keys(x).sort(), ["count", "kind", "label", "value"]);
  for (const x of o.body.gu) assert.deepEqual(Object.keys(x).sort(), ["count", "value"]);
  const det = o.body.positions.find((x) => x.kind === "detail");
  const gu = o.body.gu[0];
  const r = await call(d, "askPeople", { question: "", picks: { pos: [det.value], gu: [gu.value] } });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.model, "");
  assert.equal(r.body.raw, null);
  assert.deepEqual(r.body.tree.all.map((l) => l.field), ["pos_pick", "gu"]);
  assert.ok(r.body.total <= det.count);
  assert.ok(r.body.rows.every((x) => x.gu === gu.value));
  const bad = await call(d, "askPeople", { question: "", picks: { pos: ["ca-test-없는직분"] } });
  assert.equal(bad.body.status, "none");
  const empty = await call(d, "askPeople", { question: "", picks: { pos: [], gu: [] } });
  assert.equal(empty.body.error, "no-question");
  assert.equal((await call(people.ministry.token, "askPeopleOptions")).status, 403);
});
```

- [ ] **Step 5: 순수 시험 · preflight**

Run: `node --experimental-strip-types --test tests/authz.test.mjs tests/ask-picks.test.mjs tests/ask-people.test.mjs && python tools/preflight.py | tail -1`
Expected: `# fail 0` · 「모두 통과」.

- [ ] **Step 6: 커밋 → 개발 배포 → 개발 서버 시험**

```bash
cd /c/Projects/church-admin
git add -- supabase/functions/church-admin/index.ts supabase/functions/church-admin/authz.ts tests/authz.test.mjs tests/server.dev.test.mjs
git commit -m "feat(성도 묻기): askPeople 이 고르기 칸(picks)을 받는다 · 질문 없이 고르기만 하면 AI 없이 · 새 액션 askPeopleOptions" -- supabase/functions/church-admin/index.ts supabase/functions/church-admin/authz.ts tests/authz.test.mjs tests/server.dev.test.mjs
python tools/deploy-fn.py church-admin --dev --allow-ahead
set -a; . ~/.church-admin/dev.env; set +a; node --experimental-strip-types --test tests/server.dev.test.mjs
```
Expected: 배포 가드가 올라갈 액션 목록에 `askPeopleOptions` 를 찍고 배포 · 개발 서버 시험 `# fail 0`(새 시험 포함 · PROBE 「역할이 필요한 액션마다 시험 입력이 있다」 통과).
⚠️ 다른 세션이 개발 함수를 제 판으로 덮을 수 있다(메모리 ministry-testers-live) — 새 시험만 `unknown-action` 으로 깨지면 그것부터 의심하고, 다시 배포해 본다.

- [ ] **Step 7: 문서 — `docs/notes/ask.md` 「## ⚠️ 함정」 절 바로 앞에 절 하나**

```md
## 🎚️ 직분 · 교구 고르기 칸(2026-10-19 · 설계 성경암송 docs/superpowers/specs/2026-10-19-ask-people-picks-design.md)
- 화면 질문 칸 위 「직분 ▾」「교구 ▾」(공용 `pickMany` · `allBtn` 「모두 고르기」). 고른 것은 **서버가 바로 거르는 조건** — 질문 조건과 「그리고」 · 같은 칸 안은 「또는」.
- **질문 없이 고르기만 하면 AI 를 부르지 않는다**(`askPeople` 이 `askOut(…, fromAi=false)` · 응답 `model ""` · `raw null` · 기록 `ai:false`).
- 직분은 큰 묶음 「장로 전체 · 안수집사 전체 · 권사 전체 · 집사 전체」 + 세부 직분(`posDetailOf` — 직분상세 → 직분 → 「직분 없음」). 목록은 `askPeopleOptions`(값 · 인원 수만).
- ⚠️ **세부 직분 잎 `pos_pick` 은 `FIELDS` 밖(`PICK_FIELDS`)** — AI 스키마 · 지시문에 안 간다(시험 `tests/ask-picks.test.mjs` 가 지킨다). `checkLeaf` 만 `CHECK_BY_ID` 로 함께 본다.
- 고른 잎의 `from_text` 「고른 직분」·「고른 교구」(`PICK_FROM`)는 서버 · 화면(`js/menus/people/ask-logic.js`) 두 벌 — 글자까지 같게(`tests/ask-picks-ui.test.mjs`). 칩 × 로 빼면 화면이 이 글로 알아보고 그 칸을 비운다.
- 모두 고름 = 조건 없음 — 화면 `picksToSend` 가 빈 배열로 보낸다.
```

```bash
git add -- docs/notes/ask.md && git commit -m "docs(성도 묻기): 직분 · 교구 고르기 칸 절" -- docs/notes/ask.md
```

---

### Task 3: 운영 서버 배포(화면보다 먼저)

**Files:** 없음(배포만)

**Interfaces:**
- Consumes: Task 1·2 커밋(화면 파일은 아직 안 바뀌었다 — 이 푸시로 Pages 가 다시 나가도 화면은 그대로다).
- Produces: 운영 함수에 `askPeopleOptions` · `picks`.

- [ ] **Step 1: 푸시 — 지금 main 에 화면 변경이 없는지 먼저 본다**

```bash
cd /c/Projects/church-admin && git fetch -q origin && git log --oneline origin/main..HEAD && git diff --stat origin/main..HEAD -- js css index.html
```
Expected: 커밋 셋(Task 1 · 2 · 문서) · 두 번째 명령은 아무것도 찍지 않는다(화면 파일 변화 없음). 찍히면 멈추고 까닭을 본다.

```bash
python tools/preflight.py | tail -1 && git push origin main
```
Expected: 「모두 통과」 · 푸시 성공(Actions 의 Pages 배포는 화면이 그대로라 영향 없음).

- [ ] **Step 2: 운영 함수 배포**

Run: `python tools/deploy-fn.py church-admin --prod`
Expected: 가드가 origin/main 과 같음을 확인하고 배포 · 올라갈 액션에 `askPeopleOptions`.

- [ ] **Step 3: 옛 화면이 그대로 도는지**

운영 교회 어드민(admin.onlybible.kr) → 🤖 성도 묻기에서 예시 질문 하나(「50대 남자 집사님 중 한 번도 사역하지 않으신 분」)를 눌러 지금처럼 명단이 나오는지 본다(친구 크롬 · 또는 Claude in Chrome 으로 친구 로그인 창).
Expected: 지금과 같은 결과(옛 화면은 `picks` 를 안 보내니 바뀐 것이 없어야 한다).

---

### Task 4: 화면 — 고르기 단추 둘 · 「모두 고르기」 · 순수 도우미

**Files:**
- Create: `js/menus/people/ask-logic.js`
- Test: `tests/ask-picks-ui.test.mjs`(새로)
- Modify: `js/core/picker.js:267-292`(`pickMany`)
- Modify: `js/menus/people/ask.js`
- Modify: `css/admin.css:2191`(`.ak-form` 줄 아래)
- Modify: `docs/notes/ask.md`

**Interfaces:**
- Consumes: Task 2 의 `askPeopleOptions` · `askPeople {question, picks}` · Task 1 의 `PICK_FROM`(서버 · 시험에서만 대조).
- Produces: `PICK_FROM` · `picksToSend(values: string[], optionValues: string[]): string[]` · `pickSummary(values: string[], optionValues: string[]): string` · `pickMany({ …, allBtn?: boolean })`.

- [ ] **Step 1: 실패하는 시험** — `tests/ask-picks-ui.test.mjs`

```js
// 🤖 성도 묻기 — 고르기 칸 화면 순수 도우미(js/menus/people/ask-logic.js · 2026-10-19). DOM 없이 돈다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PICK_FROM, picksToSend, pickSummary } from "../js/menus/people/ask-logic.js";
import { PICK_FROM as SERVER_PICK_FROM } from "../supabase/functions/church-admin/ask-people.ts";

const OPTS = ["장로 전체", "시무장로", "은퇴장로", "직분 없음"];

test("PICK_FROM — 화면과 서버가 글자까지 같다", () => {
  assert.deepEqual(PICK_FROM, SERVER_PICK_FROM);
});

test("picksToSend — 안 고름 · 일부 · 모두(= 조건 없음) · 목록 밖 값 · 겹친 값", () => {
  assert.deepEqual(picksToSend([], OPTS), []);
  assert.deepEqual(picksToSend(["시무장로", "장로 전체"], OPTS), ["시무장로", "장로 전체"]);
  assert.deepEqual(picksToSend([...OPTS], OPTS), []);
  assert.deepEqual(picksToSend(["없는 값", "시무장로"], OPTS), ["시무장로"]);
  assert.deepEqual(picksToSend(["시무장로", "시무장로"], OPTS), ["시무장로"]);
  assert.deepEqual(picksToSend(["시무장로"], []), []);   // 목록을 아직 못 받았으면 보내지 않는다
});

test("pickSummary — 전체 · 하나 · 여럿 · 모두", () => {
  assert.equal(pickSummary([], OPTS), "전체");
  assert.equal(pickSummary(["시무장로"], OPTS), "시무장로");
  assert.equal(pickSummary(["시무장로", "은퇴장로", "직분 없음"], OPTS), "시무장로 외 2");
  assert.equal(pickSummary([...OPTS], OPTS), "모두");
});
```

Run: `node --experimental-strip-types --test tests/ask-picks-ui.test.mjs`
Expected: FAIL — `Cannot find module '…/js/menus/people/ask-logic.js'`.

- [ ] **Step 2: 순수 도우미** — `js/menus/people/ask-logic.js`

```js
// 🤖 성도 묻기 — 직분 · 교구 고르기 칸의 순수 도우미(2026-10-19 · 설계 성경암송 docs/superpowers/specs/2026-10-19-ask-people-picks-design.md)
//   시험 tests/ask-picks-ui.test.mjs. DOM 을 쓰지 않는다.

// 고른 잎의 from_text — ⚠️ 서버 supabase/functions/church-admin/ask-people.ts 의 PICK_FROM 과 글자까지 같게(시험이 본다).
//   칩 × 로 고른 조건을 빼면 화면이 이 글로 알아보고 그 고르기 칸을 비운다(보이는 것 = 걸린 것).
export const PICK_FROM = { pos: "고른 직분", gu: "고른 교구" };

// 고른 값 가운데 목록에 있는 것만 — 겹친 것 하나로 · 고른 차례 그대로
function pickedIn(values, optionValues) {
  const ok = new Set((optionValues || []).map(String));
  return [...new Set((values || []).map(String))].filter((v) => ok.has(v));
}
// 서버로 보낼 값 — 모두 고르면 「아무것도 안 고름」과 같은 뜻이라 빈 배열(설계 §1-3)
export function picksToSend(values, optionValues) {
  const v = pickedIn(values, optionValues);
  return v.length && v.length === (optionValues || []).length ? [] : v;
}
// 단추 글 — 안 고름 「전체」 · 하나 「시무장로」 · 여럿 「시무장로 외 2」 · 모두 「모두」
export function pickSummary(values, optionValues) {
  const v = pickedIn(values, optionValues);
  if (!v.length) return "전체";
  if (v.length === (optionValues || []).length) return "모두";
  return v.length === 1 ? v[0] : `${v[0]} 외 ${v.length - 1}`;
}
```

Run: `node --experimental-strip-types --test tests/ask-picks-ui.test.mjs`
Expected: PASS.

- [ ] **Step 3: 공용 고르개 — 「모두 고르기」(`allBtn` · 기본 꺼짐)**

`js/core/picker.js` 의 `pickMany` 머리 주석과 함수 전체를 아래로 바꾼다(다른 화면은 `allBtn` 을 안 주므로 그대로다):

```js
// 여러 개 고르기 — 체크박스 · 「모두 해제」 · 「확인」 → 고른 values 배열. hint 는 항목 오른쪽의 작은 글자(인원 수 등).
// 고를 것이 없으면 「고를 것이 없어요」. 「모두 해제」는 켠 것이 하나도 없으면 잠긴다.
// allBtn(기본 꺼짐 · 2026-10-19 성도 묻기) — 「모두 고르기」를 더한다(다 켜져 있으면 잠긴다).
export function pickMany({ anchor, title, options = [], values = [], mode, allBtn = false } = {}) {
  const has = new Set((values || []).map(String));
  return openShell({ anchor, title, mode, cls: "pk-many", onBuild: ({ body, foot, close }) => {
    body.innerHTML = options.length ? `<div class="pk-list">${options.map((o, i) =>
      `<label class="pk-chk"><input type="checkbox" data-i="${i}"${has.has(String(o.value)) ? " checked" : ""}>` +
      `<span class="pk-opt-t">${esc(o.label ?? o.value)}</span>${o.hint ? `<small class="pk-hint">${esc(o.hint)}</small>` : ""}</label>`).join("")}</div>`
      : `<p class="pk-none">고를 것이 없어요</p>`;
    foot.hidden = false;
    foot.innerHTML = `<button type="button" class="btn" data-k="clear">모두 해제</button>` +
      (allBtn && options.length ? `<button type="button" class="btn" data-k="all">모두 고르기</button>` : "") +
      `<button type="button" class="btn primary" data-k="ok">확인</button>`;
    const boxes = () => [...body.querySelectorAll("input[type=checkbox]")];
    const clear = foot.querySelector('[data-k="clear"]');
    const all = foot.querySelector('[data-k="all"]');
    const sync = () => {
      clear.disabled = !boxes().some((c) => c.checked);
      if (all) all.disabled = boxes().every((c) => c.checked);
    };
    sync();
    body.addEventListener("change", sync);
    foot.addEventListener("click", (e) => {
      const k = e.target.closest("button[data-k]")?.dataset.k;
      if (k === "clear") { boxes().forEach((c) => { c.checked = false; }); sync(); body.querySelector("input")?.focus({ preventScroll: true }); }
      if (k === "all") { boxes().forEach((c) => { c.checked = true; }); sync(); foot.querySelector('[data-k="ok"]')?.focus({ preventScroll: true }); }
      if (k === "ok") close(boxes().filter((c) => c.checked).map((c) => options[Number(c.dataset.i)].value));
    });
    return body.querySelector("input") || foot.querySelector('[data-k="ok"]');
  } });
}
```

Run: `node --check js/core/picker.js && node --experimental-strip-types --test tests/picker.test.mjs`
Expected: 문법 통과 · `# fail 0`(순수 도우미 시험은 그대로).

- [ ] **Step 4: 화면 `ask.js` — import · 오류 글 · 폼**

맨 위 import 들 끝(`import { aTitle, lineSvg } from "../../core/icons.js";` 아래)에 더한다:
```js
// 🎚️ 직분 · 교구 고르기 칸(2026-10-19) — 공용 고르개(「모두 고르기」 allBtn) · 순수 도우미(시험 tests/ask-picks-ui.test.mjs)
import { pickMany } from "../../core/picker.js";
import { PICK_FROM, picksToSend, pickSummary } from "./ask-logic.js";
```

`ERR` 의 `"no-question": "질문을 적어 주세요",` 를 `"no-question": "질문을 적거나 직분·교구를 골라 주세요",` 로 바꾼다.

`FORM` 의
```js
  <label class="sec-title" for="ak-q" style="margin-top:0">무엇이 궁금하세요?</label>
  <textarea id="ak-q" maxlength="300" placeholder="예: 10년 동안 사역하신 분들 중에 올해는 안 하고 계신 분"></textarea>
```
를 아래로 바꾼다(단추 모양은 교인 찾기 거르기 `.pp-pick-b` 와 같다 · 목록을 받기 전엔 잠가 둔다):
```js
  <label class="sec-title" for="ak-q" style="margin-top:0">무엇이 궁금하세요?</label>
  <div class="ak-picks">${["pos", "gu"].map((k) => `<button type="button" class="pp-pick-b" data-pick="${k}" aria-haspopup="dialog" ` +
    `aria-expanded="false" disabled><span class="pp-pick-l">${PICK_LABEL[k]}</span><span class="pp-pick-v">전체</span>` +
    `<span class="pk-field-x" aria-hidden="true"></span></button>`).join("")}</div>
  <textarea id="ak-q" maxlength="300" placeholder="예: 10년 동안 사역하신 분들 중에 올해는 안 하고 계신 분 (직분·교구만 골라도 찾아요)"></textarea>
```
그리고 `const FORM = ...` 줄 **바로 앞에** 더한다:
```js
const PICK_LABEL = { pos: "직분", gu: "교구" };
```

`resultHtml` 의 `<p class="ak-qecho">물으신 것: 「${esc(st.question)}」</p>` 를
`<p class="ak-qecho">${st.question ? `물으신 것: 「${esc(st.question)}」` : "고르신 조건으로 찾았어요"}</p>` 로 바꾼다.

- [ ] **Step 5: 화면 `ask.js` — 목록 받기 · 고르기 · 보낼 때 · 칩 ×**

`render` 안의 `let st = null; ...` 줄 바로 아래에 더한다:
```js
  // 🎚️ 고르기 칸 — 목록은 서버(askPeopleOptions · 값과 인원 수만)에서 한 번. 받기 전 · 못 받으면 단추를 잠가 둔다(질문은 그대로 된다).
  //   고른 값은 이 화면 안에서만(질문 칸과 같다).
  let opts = null;                      // { pos: [{value, label, hint}], gu: [...] }
  const picks = { pos: [], gu: [] };
  const pickBtn = (k) => el.querySelector(`.ak-picks [data-pick="${k}"]`);
  const optValues = (k) => (opts ? opts[k].map((o) => o.value) : []);
  function syncPick(k) {
    const b = pickBtn(k), s = pickSummary(picks[k], optValues(k));
    b.classList.toggle("on", s !== "전체" && s !== "모두");
    b.querySelector(".pp-pick-v").textContent = s;
    b.setAttribute("aria-label", `${PICK_LABEL[k]}, ${s} — 여러 개 고르기`);
  }
  (async () => {
    let r;
    try { r = await call("askPeopleOptions", {}); } catch (_) { return; }
    if (!el.isConnected || !r || !r.ok) return;
    const hint = (c) => `${n(c)}명`;
    opts = { pos: r.positions.map((o) => ({ value: o.value, label: o.label, hint: hint(o.count) })),
      gu: r.gu.map((o) => ({ value: o.value, label: o.value, hint: hint(o.count) })) };
    for (const k of ["pos", "gu"]) { pickBtn(k).disabled = false; syncPick(k); }
  })();
  async function openPick(b) {
    const k = b.dataset.pick;
    if (!opts) return;
    const got = await pickMany({ anchor: b, title: `${PICK_LABEL[k]} — 여러 개 고르기`, options: opts[k], values: picks[k], allBtn: true });
    if (got === null || !el.isConnected) return;
    picks[k] = [...got];
    syncPick(k);
    if (b.isConnected) b.focus({ preventScroll: true });
  }
```

`async function ask() { ... }` 의 앞부분
```js
    const question = qEl.value.trim();
    if (!question) { out.innerHTML = `<p class="ak-err">${esc(ERR["no-question"])}</p>`; qEl.focus(); return; }
    out.innerHTML = `<p class="ak-wait">조건을 만드는 중이에요… AI 가 질문을 읽고 있어요(10초 안팎).</p>`;
    const r = await busy(el, () => call("askPeople", { question }));
```
를 아래로 바꾼다:
```js
    const question = qEl.value.trim();
    const send = { pos: picksToSend(picks.pos, optValues("pos")), gu: picksToSend(picks.gu, optValues("gu")) };
    if (!question && !send.pos.length && !send.gu.length) { out.innerHTML = `<p class="ak-err">${esc(ERR["no-question"])}</p>`; qEl.focus(); return; }
    out.innerHTML = question ? `<p class="ak-wait">조건을 만드는 중이에요… AI 가 질문을 읽고 있어요(10초 안팎).</p>`
      : `<p class="ak-wait">고르신 조건으로 찾는 중이에요…</p>`;
    const r = await busy(el, () => call("askPeople", { question, picks: send }));
```

click 처리기의 `if (ex && el.contains(ex)) { ... return; }` 줄 바로 아래(`if (!st) return;` 앞)에 더한다:
```js
    const pb = e.target.closest(".ak-picks button[data-pick]");
    if (pb && el.contains(pb)) { openPick(pb); return; }
```

칩 × 처리의 `if (!left) { toast("남은 조건이 없어요 — 질문을 고쳐 주세요"); return; }` 줄 바로 아래(`rerun(...)` 앞)에 더한다:
```js
      // 고른 조건을 빼면 그 고르기 칸도 비운다 — 보이는 것 = 걸린 것
      if (leaf.from_text === PICK_FROM.pos) { picks.pos = []; syncPick("pos"); }
      if (leaf.from_text === PICK_FROM.gu) { picks.gu = []; syncPick("gu"); }
```

- [ ] **Step 6: CSS** — `css/admin.css` 의 `.ak-form{display:flex;flex-direction:column;gap:8px}` 줄 바로 아래에

```css
/* 성도 묻기 — 직분 · 교구 고르기 칸(2026-10-19) · 단추 모양은 교인 찾기 거르기(.pp-pick-b)와 같다 · 폰도 두 칸 한 줄 */
.ak-picks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
```

- [ ] **Step 7: 시험 · preflight**

Run: `node --check js/menus/people/ask.js && node --check js/menus/people/ask-logic.js && python tools/preflight.py | tail -1`
Expected: 문법 통과 · 「모두 통과」.

- [ ] **Step 8: localhost(개발 DB)에서 본다**

```bash
cd /c/Projects/church-admin && python -m http.server 8000
```
http://localhost:8000 (「개발 DB」 띠 · 개발 계정 카카오 로그인 — 친구 크롬 또는 Claude in Chrome 으로 친구가 로그인한 창) → 🤖 성도 묻기. 볼 것:
1. 단추 둘 「직분 · 전체」「교구 · 전체」가 잠김 → 몇 초 뒤 풀림.
2. 직분 → 목록 맨 위 「장로 전체 · …」, 아래 세부 · 오른쪽 인원 수 · 바닥 「모두 해제 · 모두 고르기 · 확인」 셋이 한 줄(폭 390 폰에서도).
3. 세부 하나 + 교구 하나 → 질문 비우고 「묻기」 → 「고르신 조건으로 찾는 중이에요…」 → 명단 · 칩 「직분 …」「교구 …」 · 「AI 가 돌려준 조건 보기」 없음.
4. 칩 × 로 「교구」를 빼면 교구 단추가 「전체」로 돌아가고 다시 센 명단.
5. 「모두 고르기」 → 확인 → 단추 「모두」(on 아님) · 질문 없이 묻기 → 「질문을 적거나 직분·교구를 골라 주세요」.
6. 질문 + 고르기 → AI 기다림 글 · 칩 맨 앞에 고른 조건.
끝나면 내가 띄운 서버만 끈다(PID 로).

- [ ] **Step 9: 문서 · 커밋**

`docs/notes/ask.md` 의 「## 🎚️ 직분 · 교구 고르기 칸」 절 끝에 한 줄을 더한다:
```md
- 화면(2026-10-19): `js/menus/people/ask.js`(단추 둘 · 목록은 `askPeopleOptions` 한 번 · 받기 전엔 잠금) · 순수 `js/menus/people/ask-logic.js` · 공용 고르개 `pickMany({ allBtn: true })` · CSS `.ak-picks`. 단추 글: 안 고름 「전체」 · 모두 「모두」(둘 다 조건 없음 · on 아님).
```

```bash
git add -- js/menus/people/ask-logic.js tests/ask-picks-ui.test.mjs js/core/picker.js js/menus/people/ask.js css/admin.css docs/notes/ask.md
git commit -m "feat(성도 묻기): 직분 · 교구 고르기 단추 — 큰 묶음 + 세부 · 모두 고르기 · 고르기만 하면 AI 없이 · 칩 × 로 칸 비우기" -- js/menus/people/ask-logic.js tests/ask-picks-ui.test.mjs js/core/picker.js js/menus/people/ask.js css/admin.css docs/notes/ask.md
git show --stat --oneline HEAD
```
Expected: 여섯 파일만.

---

### Task 5: 운영 화면 배포 · 확인

**Files:** 없음(배포 · 확인)

**Interfaces:**
- Consumes: Task 3(운영 함수에 `askPeopleOptions`) · Task 4 커밋.

- [ ] **Step 1: 푸시**

```bash
cd /c/Projects/church-admin && git fetch -q origin && python tools/preflight.py | tail -1 && git push origin main
gh run list -R sewoongkim1/church-admin -L 1
```
Expected: 「모두 통과」 · 푸시 · Actions(preflight → stamp → Pages) 성공.

- [ ] **Step 2: 「이번 판에만 있는 표식」**

Run: `curl -s "https://admin.onlybible.kr/js/menus/people/ask-logic.js?t=$(date +%s)" | grep -c "고른 직분"`
Expected: `1` 이상(이전 판에는 없던 파일).

- [ ] **Step 3: 운영 화면 확인(친구)**

운영 교회 어드민 → 🤖 성도 묻기 → 직분 「시무장로」만 고르고 질문 없이 「묻기」 → 2026-10-18 운영에서 센 시무장로 19분이 나오는지 · 교구 「화평」을 더하면 2분인지.
Expected: 19명 → 2명. (⚠️ 이 문서는 공개 저장소다 — 확인한 분들의 이름을 여기에 적지 않는다.)

- [ ] **Step 4: 메모리(성경암송 세션)** — `ai-people-ask-sample.md` 에 한 줄: 「2026-10-19 직분 · 교구 고르기 칸 운영(설계 · 계획 성경암송 2026-10-19-ask-people-picks*) · 고르기만 하면 AI 없음 · 세부 직분은 AI 밖」.
