# 사역신청 시험 참여자 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 교회 어드민에서 고른 앱 계정(시험 참여자)은 사역신청 기간 밖에도 성경암송 첫 화면에 🤝 사역신청이 보이고 신청할 수 있다.

**Architecture:** 명단은 app_config `ministryTesters`(identity_key 배열). 교회 어드민(church-admin 함수)이 쓰고, 성경암송 `api` 가 읽는다.
앱은 로그인 뒤 `ministryTester` 로 「나는 시험 참여자인가」를 받아 계정별로 캐시하고, `ministryVisible()`·`minPrev()` 가 그 값을 본다.
서버의 신청·취소 기간 검사도 시험 참여자를 통과시킨다.

**Tech Stack:** Supabase Edge Functions(Deno) · 바닐라 JS(두 저장소 모두 빌드 없음) · node:test

설계: `docs/superpowers/specs/2026-09-30-ministry-testers-design.md`

## Global Constraints
- 응답에 `user_id`(·`auth_user_id`)를 싣지 않는다. 손잡이는 identity_key.
- `ministryTesters` 를 `PUBLIC_CONFIG_KEYS` 에 넣지 않는다.
- 키가 아니라 사람(user_id)으로 맞댄다 — church-admin `keysToUserIds` · api `ministryKeysToUsers`.
- church-admin 새 액션 = `authz.ts` ACTION_ROLES + `index.ts` switch + `tests/server.dev.test.mjs` PROBE (셋 다).
- 확인·알림은 `ui.js` `dialog`/`toast`, 저장 중 `busy()`. `<select>`·date 입력 금지.
- 성경암송: 공용 파일(`app.js`·`index.ts`)은 `git apply --cached` 로 내 헝크만 커밋 · bump 는 `python tools/bump.py` 한 번.
- 개발 먼저 배포(`ktpwthwqzgcqcrmsafdo`) → 운영(`xnomlgydifiqiybervtf`). `api` 는 얼림(EVT_MOVED)이 든 판에서만 배포.

---

### Task 1: church-admin 서버 — 시험 참여자 액션 셋

**Files:**
- Modify: `c:\Projects\church-admin\supabase\functions\church-admin\authz.ts` (ACTION_ROLES 끝)
- Modify: `c:\Projects\church-admin\supabase\functions\church-admin\index.ts` (ministryDelete 뒤 · switch)
- Modify: `c:\Projects\church-admin\js\menus\system\audit.js` (LABEL · detailText)
- Test: `c:\Projects\church-admin\tests\server.dev.test.mjs` (PROBE · 흐름 시험) · `tests/audit.test.mjs`

**Interfaces:**
- Produces:
  - `ministryTesters {}` → `{ ok, testers: [{ key, name, who, last_seen_at, moved, missing }] }`
  - `ministryTesterFind { name }` → `{ ok, users: [{ key, name, who, last_seen_at, tester }], more }` · 오류 `no-name`·`too-long`
  - `ministryTesterSave { op: "add"|"remove", key }` → `{ ok, testers, already? }` · 오류 `invalid`·`not-found`
  - 바꾼 기록 `ministry.tester` detail `{ op, name, who }`

- [ ] **Step 1: audit 시험을 먼저 쓴다** — `tests/audit.test.mjs` 끝에:

```js
test("ministry.tester — 더함/뺌 · 이름 · 소속", () => {
  assert.match(LABEL["ministry.tester"], /[가-힣]/);
  assert.equal(detailText(R("ministry.tester", { op: "add", name: "홍길동", who: "화평 20목장" })), "더함 · 홍길동 · 화평 20목장");
  assert.equal(detailText(R("ministry.tester", { op: "remove", name: "홍길동", who: "" })), "뺌 · 홍길동");
});
```

- [ ] **Step 2: 실패 확인** — `node --test tests/audit.test.mjs` → ministry.tester FAIL

- [ ] **Step 3: audit.js** — LABEL 에 `"ministry.tester": "사역 시험 참여자",`, detailText 의 ministry.paper 줄 뒤에:

```js
  if (r.action === "ministry.tester") return [d.op === "add" ? "더함" : "뺌", d.name, d.who].filter(Boolean).join(" · ");
```

- [ ] **Step 4: 통과 확인** — `node --test tests/audit.test.mjs` → PASS

- [ ] **Step 5: authz.ts** — ACTION_ROLES 끝(evPerson 뒤)에:

```ts
  // 사역신청 시험 참여자(2026-09-30) — 기간 밖에도 성경암송 첫 화면에 🤝 사역신청이 보이는 앱 계정. 명단은 app_config.ministryTesters
  // (성경암송 api 가 읽는다). 찾기는 앱 계정(users)을 이름으로 — user_id 는 싣지 않는다. 더하기·빼기는 바꾼 기록 ministry.tester.
  ministryTesters: "ministry",
  ministryTesterFind: "ministry",
  ministryTesterSave: "ministry",
```

- [ ] **Step 6: index.ts 함수** — ministryDelete 바로 뒤에:

```ts
// ---------- 사역신청 — 시험 참여자(2026-09-30) ----------
// 명단에 오른 앱 계정은 기간 밖에도 성경암송 첫 화면에 🤝 사역신청이 보이고 신청·취소가 된다(그쪽 api ministryTester·ministryApply).
// 명단은 app_config.ministryTesters = identity_key 배열(ministryAdmins 와 같은 모양). ⚠️ 성경암송 PUBLIC_CONFIG_KEYS 에 넣지 않는다(이름이 든다).
// ⚠️ 키가 아니라 사람으로 맞댄다 — 등록 뒤 소속이 바뀐 분의 옛 키는 user_identity_aliases 로 간다(keysToUserIds).
// ⚠️ 응답에 user_id 를 싣지 않는다. 손잡이는 identity_key(이름·소속으로 만든 값이라 비밀이 아니다).
// ⚠️ 읽고-고쳐-쓰기다. 화면이 저장 중 단추를 잠그고, 저장 뒤 **다시 읽은** 명단을 돌려준다.
const TESTERS_KEY = "ministryTesters";
const appUserWho = (u: any) =>
  (u.type === "교구" ? [u.gu, u.mok ? u.mok + "목장" : ""] : [u.bu, u.grade]).filter(Boolean).join(" ");

async function testerKeys(): Promise<string[]> {
  const { data, error } = await db.from("app_config").select("value").eq("key", TESTERS_KEY).maybeSingle();
  if (error) throw error;
  return Array.isArray(data?.value) ? (data!.value as unknown[]).map((x) => norm(x)).filter(Boolean) : [];
}

async function testersView(keys: string[]) {
  const who = await keysToUserIds(keys);
  const ids = [...new Set(who.values())];
  const byId = new Map<string, any>();
  if (ids.length) {
    const { data, error } = await db.from("users")
      .select("id,identity_key,type,gu,mok,bu,grade,name,last_seen_at").in("id", ids);
    if (error) throw error;
    for (const u of (data ?? []) as any[]) byId.set(u.id, u);
  }
  return keys.map((k) => {
    const u = byId.get(who.get(k) ?? "");
    // 계정이 지워졌거나 키에 쓸 수 없는 글자가 섞였다 — 들어올 수 없으니 화면이 「빼 주세요」로 알린다
    if (!u) return { key: k, name: "", who: "", last_seen_at: null, moved: false, missing: true };
    return { key: k, name: u.name ?? "", who: appUserWho(u), last_seen_at: u.last_seen_at ?? null,
      moved: u.identity_key !== k, missing: false };
  });
}

async function ministryTesters() {
  return { ok: true, testers: await testersView(await testerKeys()) };
}

// 이름으로 앱 계정 찾기 — 앱에 한 번이라도 로그인한 분만 있다. 동명이인은 소속·마지막 접속으로 가른다.
async function ministryTesterFind(b: any) {
  const q = norm(b.name);
  if (!q) return { ok: false, error: "no-name" };
  if (q.length > 40) return { ok: false, error: "too-long" };
  const pattern = q.replace(/[\\%_]/g, "\\$&");
  const { data, error } = await db.from("users")
    .select("id,identity_key,type,gu,mok,bu,grade,name,last_seen_at")
    .ilike("name", `%${pattern}%`).order("name").order("id").limit(31);
  if (error) throw error;
  const rows = (data ?? []) as any[];
  const mine = new Set((await keysToUserIds(await testerKeys())).values());
  return { ok: true, more: rows.length > 30, users: rows.slice(0, 30).map((u) => ({
    key: u.identity_key, name: u.name ?? "", who: appUserWho(u), last_seen_at: u.last_seen_at ?? null, tester: mine.has(u.id) })) };
}

// 한 분씩 더하기·빼기 — 목록을 통째로 받지 않는다(옛 화면·동시 편집이 다른 분을 조용히 지운다)
async function ministryTesterSave(ctx: Ctx, b: any) {
  const op = String(b.op ?? "");
  const key = norm(b.key);
  if ((op !== "add" && op !== "remove") || !key || key.length > 200) return { ok: false, error: "invalid" };
  const keys = await testerKeys();
  let name = "", who = "";
  if (op === "add") {
    // 더할 때는 users 에 있는 키만 — 화면은 찾기 결과에서 고른다
    const { data: u, error } = await db.from("users").select("id,type,gu,mok,bu,grade,name").eq("identity_key", key).maybeSingle();
    if (error) throw error;
    if (!u) return { ok: false, error: "not-found" };
    // 같은 분이 옛 키로 이미 있으면 더하지 않는다(사람으로 맞댄다)
    const have = new Set((await keysToUserIds(keys)).values());
    if (have.has(u.id)) return { ok: true, already: true, testers: await testersView(keys) };
    keys.push(key);
    name = u.name ?? ""; who = appUserWho(u);
  } else {
    const i = keys.indexOf(key);
    if (i < 0) return { ok: true, already: true, testers: await testersView(keys) };   // 이미 빠졌다 — 쓰지도 기록하지도 않는다
    const [v] = await testersView([key]);
    name = v.name; who = v.who;
    keys.splice(i, 1);
  }
  const { error } = await db.from("app_config").upsert(
    { key: TESTERS_KEY, value: keys, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw error;
  await audit(ctx, "ministry.tester", "", { op, name, who });
  return { ok: true, testers: await testersView(await testerKeys()) };
}
```

- [ ] **Step 7: switch** — `case "ministryPaperSave"` 줄 뒤에:

```ts
      case "ministryTesters":    return json(await ministryTesters());
      case "ministryTesterFind": return json(await ministryTesterFind(b));
      case "ministryTesterSave": return json(await ministryTesterSave(ctx, b));
```

- [ ] **Step 8: PROBE + 흐름 시험** — PROBE 의 `ministryPaperSave` 줄 뒤에:

```js
  // 시험 참여자(2026-09-30) — 없는 이름 찾기 · 없는 키 빼기(명단에 없으면 쓰지도 기록하지도 않는다)
  ministryTesters: {},
  ministryTesterFind: { name: "ca-test-probe-없음" },
  ministryTesterSave: { op: "remove", key: "ca-test-probe-없음" },
```

파일 끝에 흐름 시험(개발 app_config 원래 값을 되돌린다):

```js
// ---------- 사역신청 시험 참여자(2026-09-30) ----------
test("시험 참여자: 찾기 → 더하기 → 명단 → 다시 더하기(already) → 빼기 · user_id 안 실음", async () => {
  const [row] = await rest("app_config?select=value&key=eq.ministryTesters", "GET");
  const orig = row ? row.value : null;
  const tok = people.ministry.token;
  const key = "교구|시험|0|||ca-test-min-" + STAMP;
  try {
    const f = await call(tok, "ministryTesterFind", { name: "ca-test-min" });
    assert.equal(f.body.ok, true, JSON.stringify(f.body));
    const me = f.body.users.find((u) => u.key === key);
    assert.ok(me, "찾기에 시험 계정이 없다");
    assert.equal(me.tester, false);
    assert.ok(!UUID_RE.test(JSON.stringify(f.body)), "찾기 응답에 UUID");

    const a = await call(tok, "ministryTesterSave", { op: "add", key });
    assert.equal(a.body.ok, true, JSON.stringify(a.body));
    const t = a.body.testers.find((x) => x.key === key);
    assert.ok(t && t.name === "ca-test-min" && t.missing === false, JSON.stringify(a.body.testers));
    assert.ok(!UUID_RE.test(JSON.stringify(a.body)), "명단 응답에 UUID");

    const again = await call(tok, "ministryTesterSave", { op: "add", key });
    assert.equal(again.body.already, true);
    assert.equal(again.body.testers.filter((x) => x.key === key).length, 1);

    const f2 = await call(tok, "ministryTesterFind", { name: "ca-test-min" });
    assert.equal(f2.body.users.find((u) => u.key === key).tester, true);

    const nf = await call(tok, "ministryTesterSave", { op: "add", key: key + "-없음" });
    assert.equal(nf.body.error, "not-found");
    assert.equal((await call(tok, "ministryTesterFind", { name: "" })).body.error, "no-name");
    assert.equal((await call(tok, "ministryTesterSave", { op: "x", key })).body.error, "invalid");

    const r = await call(tok, "ministryTesterSave", { op: "remove", key });
    assert.equal(r.body.ok, true);
    assert.equal(r.body.testers.some((x) => x.key === key), false);

    const log = await rest(`admin_audit?select=action,detail&action=eq.ministry.tester&member_id=eq.${people.ministry.memberId}&order=id.desc&limit=2`, "GET");
    assert.deepEqual(log.map((x) => x.detail.op), ["remove", "add"]);
  } finally {
    await rest("app_config?key=eq.ministryTesters", "DELETE");
    if (orig !== null) await rest("app_config", "POST", { key: "ministryTesters", value: orig });
  }
});
```

- [ ] **Step 9: 개발 배포·시험**

```bash
cd /c/Projects/church-admin
node --test tests/*.test.mjs          # 순수 시험(preflight 와 같은 것)
supabase functions deploy church-admin --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo
set -a; . ~/.church-admin/dev.env; set +a; node --experimental-strip-types --test tests/server.dev.test.mjs
```
Expected: 모두 PASS(권한 표 시험이 새 액션 셋을 사람 일곱 × 역할로 본다).

- [ ] **Step 10: 커밋** — `git add` 로 위 다섯 파일만 · `feat(사역신청): 시험 참여자 — 찾기·더하기·빼기 액션(서버)`

---

### Task 2: church-admin 메뉴 「🧪 시험 참여자」

**Files:**
- Create: `c:\Projects\church-admin\js\menus\ministry\testers.js`
- Modify: `c:\Projects\church-admin\js\menus\registry.js` (appointed 줄 뒤)
- Modify: `c:\Projects\church-admin\css\admin.css` (끝)
- Test: `tests/registry.test.mjs`(이미 있는 시험이 파일·역할을 본다)

**Interfaces:**
- Consumes: Task 1 의 세 액션.

- [ ] **Step 1: registry 한 줄** — appointed 줄 뒤:

```js
  { id: "testers", group: "사역신청", icon: "🧪", label: "시험 참여자", desc: "신청 기간 전에 첫 화면 사역신청을 열어 줄 분 · 더하기·빼기",
    role: "ministry", load: () => import("./ministry/testers.js") },
```

- [ ] **Step 2: 실패 확인** — `node --test tests/registry.test.mjs` → 「메뉴 모듈 파일이 있다」 FAIL

- [ ] **Step 3: testers.js**

```js
// 🧪 시험 참여자 — 신청 기간 밖에도 성경암송 앱 첫 화면에 「🤝 사역신청」이 보이는 분들(2026-09-30).
//   명단은 app_config.ministryTesters(성경암송 api 가 읽는다). 앱에 한 번이라도 로그인한 분만 찾을 수 있다.
//   ⚠️ 시험으로 낸 신청도 진짜 「신청 현황」에 들어간다 — 신청 기간(12/13) 전에 지운다.
//   막는 것은 서버다(역할 ministry · 한 분씩 · users 에 있는 키만).
import { esc, kstTime, toast, dialog, busy, errorText } from "../../core/ui.js";

const TITLE = `<h2 class="page-title">🧪 시험 참여자</h2>`;
const lastSeen = (x) => (x.last_seen_at ? "마지막 접속 " + kstTime(x.last_seen_at) : "접속 기록 없음");

function testerCard(t) {
  const head = t.missing
    ? `<b>계정을 찾을 수 없어요</b>`
    : `<b>${esc(t.name)}</b> <span class="muted">${esc(t.who)}</span>`;
  const sub = t.missing
    ? "앱 계정이 지워졌거나 합쳐졌어요 — 빼 주세요"
    : lastSeen(t) + (t.moved ? " · 등록한 뒤 이름·소속이 바뀐 분" : "");
  return `<div class="card" data-key="${esc(t.key)}">
    <div>${head}</div><div class="muted">${esc(sub)}</div>
    <div class="acts"><button type="button" class="btn danger" data-act="remove">빼기</button></div>
  </div>`;
}

function userCard(u) {
  return `<div class="card" data-key="${esc(u.key)}">
    <div><b>${esc(u.name)}</b> <span class="muted">${esc(u.who)}</span></div>
    <div class="muted">${esc(lastSeen(u))}</div>
    <div class="acts">${u.tester ? `<span class="badge ok">명단에 있음</span>`
      : `<button type="button" class="btn primary" data-act="add">더하기</button>`}</div>
  </div>`;
}

export async function render(el, { call }) {
  el.innerHTML = TITLE + `<p class="empty">불러오는 중…</p>`;
  const r = await call("ministryTesters");
  if (!r.ok) { el.innerHTML = TITLE + `<p class="empty">${esc(errorText(r))}</p>`; return; }
  let testers = r.testers || [];
  let found = null;   // 마지막 찾기 { name, users, more }

  el.innerHTML = TITLE + `
    <p class="muted mt-note">이 명단에 오른 분은 신청 기간이 아니어도 성경암송 앱 첫 화면에 「🤝 사역신청」이 보이고 신청·고치기·취소를 할 수 있어요.
      성도님 앱에는 다음에 앱을 열 때 반영돼요.</p>
    <h3 class="sec-title">명단 <span class="mt-n"></span></h3>
    <div class="mt-list"></div>
    <h3 class="sec-title">더하기</h3>
    <form class="mt-find" role="search">
      <input type="search" class="search" maxlength="40" placeholder="이름 (예: 홍길동)" autocomplete="off"
        enterkeyhint="search" aria-label="찾을 이름">
      <button type="submit" class="btn primary">찾기</button>
    </form>
    <p class="muted">앱에 한 번이라도 로그인한 분만 찾을 수 있어요.</p>
    <div class="mt-res"></div>
    <p class="muted mt-warn">⚠️ 시험으로 낸 신청도 「신청 현황」에 함께 보여요 — 신청 기간 전에 지워 주세요.</p>`;

  const $ = (s) => el.querySelector(s);
  const drawList = () => {
    $(".mt-n").textContent = testers.length + "명";
    $(".mt-list").innerHTML = testers.length ? testers.map(testerCard).join("")
      : `<p class="empty">아직 아무도 없어요 — 아래에서 이름으로 찾아 더해 주세요</p>`;
  };
  const drawFound = () => {
    const box = $(".mt-res");
    if (!found) { box.innerHTML = ""; return; }
    if (!found.users.length) { box.innerHTML = `<p class="empty">‘${esc(found.name)}’ 이름의 앱 계정이 없어요</p>`; return; }
    box.innerHTML = found.users.map(userCard).join("") +
      (found.more ? `<p class="muted">30명까지만 보여요 — 이름을 더 적어 주세요</p>` : "");
  };
  const find = async (name) => {
    const res = await busy(el, () => call("ministryTesterFind", { name }));
    if (!res.ok) { toast(errorText(res)); return; }
    found = { name, users: res.users || [], more: !!res.more };
    drawFound();
  };
  drawList();

  $(".mt-find").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $(".mt-find input").value.trim();
    if (!name) return toast("이름을 적어 주세요");
    find(name);
  });

  el.addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    const key = b.closest(".card")?.dataset.key;
    if (!key) return;
    const act = b.dataset.act;
    if (act === "remove") {
      const t = testers.find((x) => x.key === key);
      const nm = t && !t.missing ? `${t.name}(${t.who})` : "이 계정";
      const ok = await dialog({ title: "명단에서 뺄까요?", danger: true, ok: "빼기",
        text: `${nm} 님은 다음에 앱을 열 때부터 신청 기간 전에는 「🤝 사역신청」이 안 보여요.\n이미 낸 신청은 그대로 남아요.` });
      if (!ok) return;
    } else if (act !== "add") return;
    const res = await busy(el, () => call("ministryTesterSave", { op: act, key }));
    if (!res.ok) { await dialog({ title: "처리하지 못했어요", text: errorText(res), cancel: null }); return; }
    testers = res.testers || [];
    drawList();
    toast(res.already ? (act === "add" ? "이미 명단에 있어요" : "이미 빠져 있어요") : (act === "add" ? "더했어요" : "뺐어요"));
    if (found) await find(found.name);   // 「명단에 있음」 표시를 새로 맞춘다
  });
}
```

- [ ] **Step 4: css** — `css/admin.css` 끝에:

```css
/* 🧪 시험 참여자(2026-09-30) — 찾기 줄은 성경필사 이력(.be-hi-find)과 같은 꼴 */
.mt-find{display:flex;gap:8px;align-items:stretch;margin-bottom:6px}
.mt-find .search{flex:1;min-width:0;margin-bottom:0}
.mt-find .btn{flex:none;min-width:88px}
.mt-warn{margin-top:14px}
```

- [ ] **Step 5: 통과 확인** — `node --test tests/*.test.mjs` → PASS · `grep -rn '<select\|type="date"\|type="time"' js/menus/ministry/testers.js` → 없음

- [ ] **Step 6: localhost 확인** — `python -m http.server 8000` → http://localhost:8000 (개발 DB · 카카오 로그인) → 🧪 시험 참여자: 찾기·더하기·빼기, 360px 폭.

- [ ] **Step 7: 커밋** — `feat(사역신청): 🧪 시험 참여자 메뉴`

---

### Task 3: 성경암송 api — `ministryTester` · 기간 검사

**Files:**
- Modify: `C:\Projects\bible-memorize-church-app-v2\supabase\functions\api\index.ts` (switch · ministryCfg 뒤 · ministryApply · ministryCancel)
- Modify: `C:\Projects\bible-memorize-church-app-v2\js\api.js`

**Interfaces:**
- Produces: `api.ministryTester(user_id)` → `{ ok:true, tester:boolean }` · 서버 `ministryIsTester(userId): Promise<boolean>`

- [ ] **Step 1: 서버 함수** — `ministryCfg()` 뒤에:

```ts
// 사역신청 시험 참여자(2026-09-30) — 교회 어드민 「🧪 시험 참여자」가 고치는 app_config `ministryTesters`(identity_key 배열)에
// 오른 계정은 기간 밖에도 첫 화면에 🤝 사역신청이 보이고 신청·취소가 된다.
// ⚠️ 키가 아니라 사람으로 맞댄다(소속이 바뀐 분 — 담당자 확인과 같은 규칙).
// ⚠️ PUBLIC_CONFIG_KEYS 에 넣지 않는다 — 이름이 든 명단이다. 앱에는 「이 계정인가」 하나만 답한다.
async function ministryIsTester(userId: string): Promise<boolean> {
  if (!userId) return false;
  const { data, error } = await db.from("app_config").select("value").eq("key", "ministryTesters").maybeSingle();
  if (error) throw error;
  const keys = Array.isArray(data?.value) ? (data!.value as any[]).map((x) => norm(String(x))).filter(Boolean) : [];
  if (!keys.length) return false;
  for (const id of (await ministryKeysToUsers(keys)).values()) if (id === userId) return true;
  return false;
}
async function ministryTester(b: any) {
  return { ok: true, tester: await ministryIsTester(String(b.user_id || "")) };
}
```

- [ ] **Step 2: switch** — `case "ministryMine"` 줄 뒤에 `case "ministryTester":   return json(await ministryTester(body));`

- [ ] **Step 3: 기간 검사** — ministryApply·ministryCancel 의 조건 끝에 `&& !(await ministryIsTester(userId))` 를 더한다(앞 조건이 모두 참일 때만 묻는다):

```ts
  if (!cfg.isOpen && !b.preview && adminError(b) && !(await ministryIsTester(userId))) {
```
주석: 「⇒ 12-13 전에 || b.preview 를 걷어도 시험 참여자는 그대로 통과한다.」

- [ ] **Step 4: js/api.js** — ministryMine 줄 뒤에 `ministryTester: (user_id) => supaCall("ministryTester", { user_id }),`

- [ ] **Step 5: 개발 배포·확인**

```bash
cd /c/Projects/bible-memorize-church-app-v2 && git status --short supabase/   # 남의 미커밋 코드가 없는지
supabase functions deploy api --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo
```
개발 app_config `ministryTesters` 에 개발 계정 키 하나를 넣고(service 키 REST) `ministryTester` 가 true/false 를 바르게 답하는지, 기간 밖 `ministryApply`(preview 없이)가 시험 참여자만 통과하는지 본다. 끝나면 되돌린다.

- [ ] **Step 6: 커밋** — `git apply --cached` 로 내 헝크만 · `feat(사역신청): 시험 참여자 — api ministryTester · 기간 검사 통과`

---

### Task 4: 성경암송 첫 화면

**Files:**
- Modify: `C:\Projects\bible-memorize-church-app-v2\app.js` (refreshMinistryPeriod 뒤 · ministryVisible · minPrev · enterAfterLogin)

- [ ] **Step 1: 캐시·새로 받기** — `refreshMinistryPeriod()` 뒤에:

```js
// 시험 참여자(2026-09-30) — 교회 어드민 「🧪 시험 참여자」 명단에 오른 계정은 기간 밖에도 첫 화면에 🤝 사역신청이 보인다.
//   계정마다 따로 담는다(한 기기에서 여러 분이 로그인한다). ⚠️ 모르면 숨긴다 — 캐시가 없으면 안 보인다.
const MIN_TESTER_KEY = "ministry-tester::";
function ministryTesterCached() {
  const u = loadUser();
  if (!u || !u.user_id) return false;
  try { return localStorage.getItem(MIN_TESTER_KEY + u.user_id) === "1"; } catch (e) { return false; }
}
function refreshMinistryTester() {
  const u = loadUser();
  if (!u || !u.user_id || !window.api || !api.ministryTester) return;
  const before = ministryTesterCached();
  api.ministryTester(u.user_id).then((d) => {
    if (!d || d.ok !== true) return;
    const now = !!d.tester;
    try { localStorage.setItem(MIN_TESTER_KEY + u.user_id, now ? "1" : "0"); } catch (e) {}
    // ⚠️ 값이 바뀌면 그 자리에서 다시 그린다(refreshEventOpen 과 같은 까닭) — 명단에 든 날 앱을 두 번 켜야 보이면 안 된다
    if (before !== now && document.querySelector(".todo-go")) renderSummary();
  }).catch(() => {});
}
```

- [ ] **Step 2: 게이트 둘**

```js
function ministryVisible() {
  if (location.search.indexOf("preview=ministry") >= 0) return true;   // 관리자 미리보기
  if (ministryTesterCached()) return true;                              // 시험 참여자(교회 어드민 명단 · 2026-09-30)
  ...
}
function minPrev() {
  return location.search.indexOf("preview=ministry") >= 0 || ministryTesterCached();
}
```
(minPrev 위 주석의 「들어오는 길은 이 주소 하나뿐이다」를 「이 주소와 시험 참여자 명단」으로 고친다.)

- [ ] **Step 3: enterAfterLogin** — `renderSummary(); // 로컬 진행 기록으로 곧바로 표시` 뒤에 `refreshMinistryTester(); // 사역신청 시험 참여자(명단에 들면 첫 화면에 🤝)`

- [ ] **Step 4: 확인** — `python tools/preflight.py` PASS · localhost(개발 DB): 명단에 넣은 계정 → 첫 화면에 🤝 사역신청 → 신청서 「신청하기」 단추 있음 → 신청 저장 · 명단에서 빼고 새로고침 → 단추 없음 · 다른 계정은 처음부터 없음.

- [ ] **Step 5: 커밋** — `git apply --cached` · `feat(사역신청): 시험 참여자는 기간 밖에도 첫 화면에 🤝 사역신청`

---

### Task 5: 문서 · 운영 배포

- [ ] `docs/notes/ministry-2027.md` 끝에 「시험 참여자(2026-09-30)」 절 · CLAUDE.md 지도 표 사역신청 줄에 한 마디 · `docs/notes/backend-api.md` 에 `ministryTester`.
- [ ] 운영: `supabase functions deploy api ... xnomlgydifiqiybervtf` → `python tools/bump.py` → 커밋·푸시 → 「이번 판에만 있는 표식」(`ministryTester` 가 라이브 app.js·js/api.js 에 있는지 · APP_BUILD) 확인.
- [ ] church-admin: `supabase functions deploy church-admin ... xnomlgydifiqiybervtf` → 푸시(Actions preflight → Pages) → admin.onlybible.kr 에 메뉴가 뜨는지.
- [ ] 운영 app_config 에 `ministryTesters` 가 아직 없음을 확인(처음 더할 때 생긴다) · 공개 키로 `getConfig ministryTesters` 가 막히는지.
