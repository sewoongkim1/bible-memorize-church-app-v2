# 말씀 이벤트(가입 이벤트) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인한 성도가 이벤트 기간 중 12개 구절의 빈칸 1개씩을 맞혀 응모를 완료하고, 관리자가 회차 설정과 응모자 명단을 관리할 수 있게 한다.

**Architecture:** 이벤트 설정은 기존 `app_config`(key: `event`)에 JSON으로 저장해 관리자가 배포 없이 회차를 바꾼다. 응모 기록만 새 테이블 `event_entries`에 남기고(회차당 1인 1응모), 중간 진행 상태는 어디에도 저장하지 않는다(중도 이탈 시 처음부터). 앱 화면은 기존 도전 화면(`renderChallenge`)의 패턴을 따라 app.js에 추가한다.

**Tech Stack:** Vanilla JS(app.js 단일 파일), Supabase Edge Function `api`(Deno/TypeScript), Postgres, admin-stats.html(단일 파일 관리자 화면)

## Global Constraints

- 이벤트 설정 JSON 스키마(정확히 이 필드명): `{ "id": string, "name": string, "start": "YYYY-MM-DD", "end": "YYYY-MM-DD", "fromNo": number, "toNo": number }`
- 기간 판정은 **KST 기준, 종료일 당일 포함**(`end` 날짜 23:59까지 참여 가능)
- 빈칸 단어 선정: 공백 기준 토큰 중 **2글자 이상**만 후보. 2글자 이상 토큰이 하나도 없으면 **가장 긴 토큰** 사용
- 이벤트 참여는 `challenge_log`에 기록하지 **않는다** (기존 통계·랭킹 무영향)
- 응모는 회차당 1인 1회만 기록. 재도전해도 **최초 응모 시각 유지**
- 배포 시: `app.js`/`style.css` 수정 → index.html `?v=` 캐시태그 갱신 + `.splash-ver` +0.001(소수점 3자리)
- 백엔드 수정 시: `supabase functions deploy api --no-verify-jwt --project-ref xnomlgydifiqiybervtf`
- SQL 파일에 시크릿(비밀번호 등) 절대 넣지 않는다 — 이 저장소는 공개(public)

---

## File Structure

| 파일 | 역할 | 변경 |
|---|---|---|
| `supabase/event_entries.sql` | 응모 기록 테이블 DDL | 신규 |
| `supabase/functions/api/index.ts` | `eventEnter`/`eventStatus`/`eventEntrants` 액션 + `event` 공개키 | 수정 |
| `js/api.js` | 프런트 API 바인딩 3개 추가 | 수정 |
| `app.js` | 이벤트 상태 로드·첫화면 버튼·이벤트 화면·응모완료 화면 | 수정 |
| `style.css` | 이벤트 버튼/화면 스타일 | 수정 |
| `admin-stats.html` | 이벤트 관리 메뉴 카드 + 설정 편집 + 응모자 명단 | 수정 |
| `index.html` | 캐시태그·스플래시 버전 | 수정 |

---

### Task 1: 응모 기록 테이블 + 백엔드 액션

**Files:**
- Create: `supabase/event_entries.sql`
- Modify: `supabase/functions/api/index.ts` (PUBLIC_CONFIG_KEYS 1226행 부근, switch 문 140행 부근, 함수는 파일 끝 board 함수들 뒤에 추가)

**Interfaces:**
- Produces:
  - `eventEnter({event_id, user_id})` → `{ ok: true, entered_at: string }` — 이미 응모했으면 기존 시각 반환
  - `eventStatus({event_id, user_id})` → `{ ok: true, entered: boolean, entered_at: string|null }`
  - `eventEntrants({pw, event_id})` → `{ ok: true, list: [{gubun, sosok, sebu, name, entered_at}] }` — 응모순(오래된 순) 정렬
  - `getConfig({key:"event"})` → `{ ok: true, value: <이벤트 설정 JSON>|null }`

- [ ] **Step 1: 테이블 DDL 파일 작성**

Create `supabase/event_entries.sql`:

```sql
-- 말씀 이벤트 응모 기록 (회차당 1인 1응모)
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키를 절대 넣지 마세요.
--
-- 적용: Supabase 대시보드 → SQL Editor에 붙여넣고 실행

create table if not exists public.event_entries (
  event_id   text        not null,
  user_id    text        not null,
  entered_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

-- 관리자 명단 조회(회차별, 응모순)용
create index if not exists event_entries_event_idx
  on public.event_entries (event_id, entered_at);
```

- [ ] **Step 2: Supabase에 테이블 생성**

Supabase 대시보드 → SQL Editor → 위 SQL 붙여넣고 Run.
Expected: `Success. No rows returned`

확인:
```sql
select * from public.event_entries limit 1;
```
Expected: 빈 결과(에러 없음)

- [ ] **Step 3: `event`를 공개 설정 키에 추가**

`supabase/functions/api/index.ts` 1226행 부근을 찾는다:

```ts
const PUBLIC_CONFIG_KEYS = new Set(["heartMessages", "dailyMessage", "introSlides", "milestoneMessages", "passagesPublic"]);
```

다음으로 바꾼다:

```ts
const PUBLIC_CONFIG_KEYS = new Set(["heartMessages", "dailyMessage", "introSlides", "milestoneMessages", "passagesPublic", "event"]);
```

- [ ] **Step 4: 이벤트 액션 3개 구현**

`supabase/functions/api/index.ts` 파일에서 `// ---------- 질문·제안 게시판` 주석(또는 board 관련 함수들)을 찾아, **그 바로 앞에** 아래 블록을 추가한다:

```ts
// ---------- 말씀 이벤트: 응모 기록(회차당 1인 1응모) ----------
// 진행 중 상태는 저장하지 않는다 — 중도 이탈 시 처음부터 다시 하는 설계.
async function eventEnter(b: any) {
  const eventId = String(b.event_id || "");
  const userId = String(b.user_id || "");
  if (!eventId || !userId) return { ok: false, error: "event_id/user_id 필요" };

  // 이미 응모했으면 최초 시각을 그대로 돌려준다(재도전해도 기록은 하나).
  const { data: exist } = await db.from("event_entries")
    .select("entered_at").eq("event_id", eventId).eq("user_id", userId).maybeSingle();
  if (exist) return { ok: true, entered_at: exist.entered_at };

  const enteredAt = new Date().toISOString();
  const { error } = await db.from("event_entries")
    .insert({ event_id: eventId, user_id: userId, entered_at: enteredAt });
  // 동시 요청으로 PK 충돌(23505)이면 이미 응모된 것이므로 성공으로 본다.
  if (error && (error as any).code !== "23505") throw error;
  return { ok: true, entered_at: enteredAt };
}

async function eventStatus(b: any) {
  const eventId = String(b.event_id || "");
  const userId = String(b.user_id || "");
  if (!eventId || !userId) return { ok: true, entered: false, entered_at: null };
  const { data } = await db.from("event_entries")
    .select("entered_at").eq("event_id", eventId).eq("user_id", userId).maybeSingle();
  return { ok: true, entered: !!data, entered_at: data?.entered_at ?? null };
}

async function eventEntrants(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };
  const eventId = String(b.event_id || "");
  if (!eventId) return { ok: false, error: "event_id 필요" };
  const { data, error } = await db.from("event_entries")
    .select("entered_at, users(type,gu,mok,bu,grade,name)")
    .eq("event_id", eventId)
    .order("entered_at", { ascending: true });
  if (error) throw error;
  const list = ((data ?? []) as any[]).map((r) => {
    const u = r.users ?? {};
    return {
      gubun: u.type ?? "",
      sosok: u.gu || u.bu || "",
      sebu: u.mok || u.grade || "",
      name: u.name ?? "",
      entered_at: r.entered_at,
    };
  });
  return { ok: true, list };
}
```

- [ ] **Step 5: switch 문에 액션 3개 등록**

`supabase/functions/api/index.ts`에서 `case "boardList":`가 있는 줄을 찾아, **그 바로 앞에** 추가한다:

```ts
      // ---- 말씀 이벤트 ----
      case "eventEnter":    return json(await eventEnter(body));
      case "eventStatus":   return json(await eventStatus(body));
      case "eventEntrants": return json(await eventEntrants(body));
```

- [ ] **Step 6: Edge Function 배포**

Run:
```bash
cd "c:/Projects/bible-memorize-church-app-v2" && supabase functions deploy api --no-verify-jwt --project-ref xnomlgydifiqiybervtf
```
Expected: `Deployed Functions on project xnomlgydifiqiybervtf: api`

- [ ] **Step 7: 액션 동작 확인 (실제 호출)**

`eventStatus`는 공개 액션이므로 바로 확인할 수 있다.

Run:
```bash
curl -s -X POST "https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api" \
  -H "Content-Type: application/json" \
  -H "apikey: sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-" \
  -H "Authorization: Bearer sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-" \
  -d '{"action":"eventStatus","event_id":"test-0","user_id":"nobody"}'
```
Expected: `{"ok":true,"entered":false,"entered_at":null}`

`getConfig`에 `event` 키가 열렸는지도 확인:
```bash
curl -s -X POST "https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api" \
  -H "Content-Type: application/json" \
  -H "apikey: sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-" \
  -H "Authorization: Bearer sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-" \
  -d '{"action":"getConfig","key":"event"}'
```
Expected: `{"ok":true,"value":null}` (아직 설정 전이므로 null — `"허용되지 않은 키"` 에러가 나오면 Step 3이 배포 안 된 것)

- [ ] **Step 8: Commit**

```bash
cd "c:/Projects/bible-memorize-church-app-v2" && git add supabase/event_entries.sql supabase/functions/api/index.ts && git commit -m "feat(이벤트): 응모 기록 테이블 + eventEnter/eventStatus/eventEntrants 액션"
```

---

### Task 2: 프런트 API 바인딩

**Files:**
- Modify: `js/api.js` (api 객체 내부, `sermonSummary` 줄 다음)

**Interfaces:**
- Consumes: Task 1의 백엔드 액션 3개
- Produces:
  - `api.eventEnter(event_id, user_id)` → `Promise<{ok, entered_at}>`
  - `api.eventStatus(event_id, user_id)` → `Promise<{ok, entered, entered_at}>`
  - `api.eventEntrants(pw, event_id)` → `Promise<{ok, list}>`

- [ ] **Step 1: api 객체에 3줄 추가**

`js/api.js`에서 아래 줄을 찾는다:

```js
  sermonSummary: (sermonId, user_id) => supaCall("sermonSummary", { sermonId, user_id }),
};
```

다음으로 바꾼다:

```js
  sermonSummary: (sermonId, user_id) => supaCall("sermonSummary", { sermonId, user_id }),
  // 말씀 이벤트 — 응모 기록/조회(성도), 응모자 명단(관리자)
  eventEnter: (event_id, user_id) => supaCall("eventEnter", { event_id, user_id }),
  eventStatus: (event_id, user_id) => supaCall("eventStatus", { event_id, user_id }),
  eventEntrants: (pw, event_id) => supaCall("eventEntrants", { pw, event_id }),
};
```

- [ ] **Step 2: 문법 확인**

Run:
```bash
cd "c:/Projects/bible-memorize-church-app-v2" && node --check js/api.js && echo SYNTAX_OK
```
Expected: `SYNTAX_OK`

- [ ] **Step 3: Commit**

```bash
cd "c:/Projects/bible-memorize-church-app-v2" && git add js/api.js && git commit -m "feat(이벤트): 프런트 API 바인딩 추가"
```

---

### Task 3: 이벤트 상태 관리 + 첫 화면 버튼

**Files:**
- Modify: `app.js` (헬퍼는 `renderSummary` 함수 정의 바로 앞에 추가, 버튼은 `renderSummary` 내부)
- Modify: `style.css` (`.summary-help.board-cta` 규칙 뒤에 추가)

**Interfaces:**
- Consumes: `api.getConfig("event")`, `api.eventStatus(event_id, user_id)` (Task 2)
- Produces:
  - `eventConfig` (모듈 전역, `{id,name,start,end,fromNo,toNo}|null`)
  - `eventActive()` → `boolean` — 오늘(KST)이 기간 내인지
  - `eventEntered()` → `boolean` — 현재 회차 응모 완료 여부(localStorage 캐시)
  - `loadEventState()` → `Promise<void>` — 설정+응모여부 로드 후 버튼 갱신
  - `startEvent()` — 이벤트 화면 진입(Task 4에서 구현, 여기서는 호출만)

- [ ] **Step 1: 이벤트 상태 헬퍼 추가**

`app.js`에서 `function renderSummary() {` 정의를 찾아, **그 바로 앞에** 아래 블록을 추가한다:

```js
// ------------------------------------------------------------
// 말씀 이벤트 — 관리자가 app_config(key:event)로 회차를 연다.
//   { id, name, start:"YYYY-MM-DD", end:"YYYY-MM-DD", fromNo, toNo }
//   진행 중 상태는 저장하지 않는다(중도 이탈 시 처음부터). 응모 여부만 서버 기록.
// ------------------------------------------------------------
let eventConfig = null;                       // 로드된 이벤트 설정(없으면 null)
const EVENT_ENTERED_KEY = "event-entered";    // { [eventId]: "2026-09-01T..." }

function eventEnteredMap() {
  try { return JSON.parse(localStorage.getItem(EVENT_ENTERED_KEY) || "{}") || {}; }
  catch (e) { return {}; }
}
function markEventEntered(eventId, at) {
  try {
    const m = eventEnteredMap();
    m[eventId] = at || new Date().toISOString();
    localStorage.setItem(EVENT_ENTERED_KEY, JSON.stringify(m));
  } catch (e) {}
}
function eventEntered() {
  return !!(eventConfig && eventEnteredMap()[eventConfig.id]);
}

// 오늘(KST)이 이벤트 기간 안인지 — 종료일 당일 포함.
function eventActive() {
  if (!eventConfig || !eventConfig.id) return false;
  const p = kstDateParts();
  if (!p) return false;
  const z = (n) => String(n).padStart(2, "0");
  const today = `${p.y}-${z(p.m)}-${z(p.d)}`;
  const start = String(eventConfig.start || "");
  const end = String(eventConfig.end || "");
  if (start && today < start) return false;
  if (end && today > end) return false;
  return true;
}

// 이벤트 대상 구절(fromNo~toNo). 설정이 이상하면 빈 배열.
function eventVerses() {
  if (!eventConfig) return [];
  const from = Number(eventConfig.fromNo), to = Number(eventConfig.toNo);
  if (!(from >= 1) || !(to >= from)) return [];
  return verses.filter((v) => Number(v.no) >= from && Number(v.no) <= to);
}

// 설정과 응모 여부를 불러온 뒤 첫 화면 버튼을 갱신한다(요약 화면이 떠 있을 때만).
async function loadEventState() {
  if (!window.api || !api.getConfig) return;
  try {
    const d = await api.getConfig("event");
    const v = d && d.value;
    eventConfig = v && v.id ? v : null;
  } catch (e) { eventConfig = null; }
  if (!eventActive()) { renderEventButton(); return; }

  const u = loadUser();
  if (u && u.user_id && api.eventStatus) {
    try {
      const s = await api.eventStatus(eventConfig.id, u.user_id);
      if (s && s.entered) markEventEntered(eventConfig.id, s.entered_at);
    } catch (e) {}
  }
  renderEventButton();
}

// 첫 화면의 이벤트 버튼 자리(#event-slot)를 채운다. 기간 밖이면 비워 둔다.
function renderEventButton() {
  const slot = document.getElementById("event-slot");
  if (!slot) return;
  if (!eventActive() || !eventVerses().length) { slot.innerHTML = ""; return; }
  const done = eventEntered();
  slot.innerHTML = `<button class="summary-help event-cta${done ? " done" : ""}" id="open-event">${
    done ? "✅ 이벤트 응모 완료" : "🎉 말씀 이벤트 참여하기"}</button>`;
  document.getElementById("open-event").addEventListener("click", startEvent);
}
```

- [ ] **Step 2: 첫 화면에 버튼 자리 추가**

`app.js` `renderSummary` 내부에서 아래 줄을 찾는다:

```js
    <button class="summary-help album-cta" id="open-album">📖 나의 말씀 앨범</button>
```

**그 바로 앞에** 슬롯을 넣어 다음처럼 만든다:

```js
    <div id="event-slot"></div>
    <button class="summary-help album-cta" id="open-album">📖 나의 말씀 앨범</button>
```

- [ ] **Step 3: renderSummary 끝에서 이벤트 상태 로드**

`app.js` `renderSummary` 내부의 아래 줄을 찾는다:

```js
  document.getElementById("go-list").addEventListener("click", renderVerseList);
  loadTodayCount(u); // 첫 화면 '오늘 N회' 띠 채우기
```

다음으로 바꾼다:

```js
  document.getElementById("go-list").addEventListener("click", renderVerseList);
  loadTodayCount(u); // 첫 화면 '오늘 N회' 띠 채우기
  renderEventButton();  // 이미 로드된 설정이 있으면 즉시 표시
  loadEventState();     // 서버에서 설정·응모여부 갱신 후 다시 표시
```

- [ ] **Step 4: 버튼 스타일 추가**

`style.css`에서 아래 두 줄을 찾는다:

```css
.dark .summary-help.board-cta { background: #1c3328; color: #7fc7a0; border-color: #2f6b4f; }
.dark .summary-help.board-cta:hover { background: #2f6b4f; color: #fff; }
```

**그 뒤에** 추가한다:

```css
/* 말씀 이벤트 버튼 — 미응모(금색 강조) / 응모완료(차분한 초록) */
.summary-help.event-cta { background: #fdf3d8; color: #8a6a1e; border-color: #c8a84b; }
.summary-help.event-cta:hover { background: #c8a84b; color: #fff; }
.summary-help.event-cta.done { background: #eaf6ee; color: #1f7a4d; border-color: #1f7a4d; }
.summary-help.event-cta.done:hover { background: #1f7a4d; color: #fff; }
.dark .summary-help.event-cta { background: #2a2417; color: #dcb669; border-color: #5a4e2a; }
.dark .summary-help.event-cta:hover { background: #5a4e2a; color: #fff; }
.dark .summary-help.event-cta.done { background: #17311f; color: #8fd6ab; border-color: #2f5a42; }
.dark .summary-help.event-cta.done:hover { background: #2f5a42; color: #fff; }
```

- [ ] **Step 5: 임시 스텁으로 문법 확인**

Task 4에서 `startEvent`를 구현하기 전까지 참조 오류가 나지 않도록, `app.js`의 `loadEventState` 함수 정의 **바로 앞에** 임시 스텁을 넣는다:

```js
// (Task 4에서 실제 구현으로 대체됨)
function startEvent() { appAlert("이벤트 화면 준비 중입니다."); }
```

Run:
```bash
cd "c:/Projects/bible-memorize-church-app-v2" && node --check app.js && echo SYNTAX_OK
```
Expected: `SYNTAX_OK`

- [ ] **Step 6: Commit**

```bash
cd "c:/Projects/bible-memorize-church-app-v2" && git add app.js style.css && git commit -m "feat(이벤트): 이벤트 상태 로드 + 첫 화면 참여 버튼"
```

---

### Task 4: 이벤트 진행 화면 + 응모 완료 화면

**Files:**
- Modify: `app.js` (Task 3에서 넣은 `startEvent` 스텁을 실제 구현으로 대체)
- Modify: `style.css` (Task 3에서 추가한 `.event-cta` 규칙들 뒤)

**Interfaces:**
- Consumes: `eventConfig`, `eventActive()`, `eventVerses()`, `markEventEntered()` (Task 3), `api.eventEnter()` (Task 2), 기존 `verseRefFull`, `loadSermons`, `initStickyRef`, `scrollPastBtnRow`, `renderSummary`, `startChallenge`, `appAlert`
- Produces: `startEvent()` — 이벤트 화면 진입점(첫 화면 버튼이 호출)

- [ ] **Step 1: 스텁을 실제 구현으로 대체**

`app.js`에서 Task 3 Step 5에 넣은 스텁을 찾는다:

```js
// (Task 4에서 실제 구현으로 대체됨)
function startEvent() { appAlert("이벤트 화면 준비 중입니다."); }
```

아래 전체 블록으로 **교체**한다:

```js
// ------------------------------------------------------------
// 말씀 이벤트 진행 화면 — 대상 구절을 매번 무작위 순서로, 구절당 빈칸 1개.
//   진행 상태는 저장하지 않는다(나가면 처음부터, 문제도 새로 뽑힘).
// ------------------------------------------------------------

// 공백 기준 토큰 중 2글자 이상인 것 하나를 무작위로 고른다.
// 2글자 이상이 하나도 없으면 가장 긴 토큰(조사 한 글자만 남는 어색함 방지).
function pickEventBlankIndex(tokens) {
  const candidates = [];
  tokens.forEach((t, i) => { if (Array.from(t).length >= 2) candidates.push(i); });
  if (candidates.length) return candidates[Math.floor(Math.random() * candidates.length)];
  let best = 0;
  tokens.forEach((t, i) => { if (Array.from(t).length > Array.from(tokens[best]).length) best = i; });
  return best;
}

function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function startEvent() {
  if (!eventActive()) { appAlert("지금은 진행 중인 이벤트가 없어요."); return renderSummary(); }
  const queue = shuffled(eventVerses());
  if (!queue.length) { appAlert("이벤트 대상 구절이 아직 준비되지 않았어요."); return renderSummary(); }
  renderEventStep(queue, 0);
}

function renderEventStep(queue, idx) {
  stopSpeaking();
  const verse = queue[idx];
  const appEl = document.getElementById("app");
  const tokens = String(verse.text || "").trim().split(/\s+/);
  const blankAt = pickEventBlankIndex(tokens);
  const answer = tokens[blankAt];

  const sentenceHtml = tokens.map((word, i) => {
    if (i !== blankAt) return `<span class="word-fixed">${word}</span>`;
    const w = Array.from(word).length + 1;
    return `<input class="word-input" id="ev-input" data-answer="${word}" autocomplete="off"
      autocapitalize="off" autocorrect="off" spellcheck="false" style="width:${w}em" />`;
  }).join(" ");

  appEl.innerHTML = `
    <div class="test-screen">
      <div class="test-card with-ref-banner">
        <div class="test-ref-sticky">${verseRefFull(verse)}</div>
        <div class="test-top">
          <div class="test-head">
            <div class="test-stage event-badge">🎉 이벤트</div>
            <div class="ev-progress">${idx + 1} / ${queue.length}</div>
          </div>
          <button class="back-btn" id="ev-exit">← 나가기</button>
        </div>
        <div class="test-sentence">${sentenceHtml}</div>
        <div class="ev-hint" id="ev-hint"></div>
        <div class="ev-explain" id="ev-explain"></div>
      </div>
    </div>`;

  document.getElementById("ev-exit").addEventListener("click", () => { stopSpeaking(); renderSummary(); });
  fillEventExplain(verse);
  setupEventInput(queue, idx, answer);
  initStickyRef();
  scrollPastBtnRow();
}

// 구절 아래 AI 풀이(설교 아카이브 easyExplain)를 펼친 채로 보여준다. 없으면 표시 안 함.
function fillEventExplain(verse) {
  loadSermons().then((sermons) => {
    const s = (sermons || []).find((x) => x.memVerseNo === verse.no && x.easyExplain);
    const el = document.getElementById("ev-explain");
    if (!el || !s) return;
    el.innerHTML = `<div class="ev-explain-label">💡 풀이</div><div class="ev-explain-body"></div>`;
    el.querySelector(".ev-explain-body").textContent = s.easyExplain;
  }).catch(() => {});
}

// 빈칸 채점 — 맞히면 다음 구절로, 마지막이면 응모 처리.
function setupEventInput(queue, idx, answer) {
  const input = document.getElementById("ev-input");
  const hint = document.getElementById("ev-hint");
  if (!input) return;
  let done = false;

  const evaluate = (isComposing) => {
    if (done || input.disabled) return;
    const val = input.value.trim();
    if (val === answer) {
      done = true;
      input.value = answer;
      input.classList.add("correct");
      input.classList.remove("wrong");
      input.disabled = true;
      if (hint) hint.textContent = "";
      setTimeout(() => {
        if (idx + 1 < queue.length) renderEventStep(queue, idx + 1);
        else finishEvent();
      }, 400);
    } else if (!isComposing && Array.from(val).length >= Array.from(answer).length) {
      input.classList.add("wrong");
      if (hint) hint.textContent = "다시 한 번 입력해 보세요";
      setTimeout(() => {
        if (done) return;
        input.value = "";
        input.classList.remove("wrong");
        input.focus();
      }, 400);
    }
  };

  let composing = false;
  input.addEventListener("compositionstart", () => { composing = true; });
  input.addEventListener("compositionend", () => { composing = false; evaluate(false); });
  input.addEventListener("input", (e) => evaluate(composing || e.isComposing));
  input.focus();
}

// 12개를 모두 맞힘 → 응모 기록(최초 1회) 후 완료 화면.
function finishEvent() {
  const u = loadUser();
  const eventId = eventConfig ? eventConfig.id : "";
  if (u && u.user_id && eventId && window.api && api.eventEnter) {
    api.eventEnter(eventId, u.user_id)
      .then((d) => { markEventEntered(eventId, d && d.entered_at); })
      .catch(() => { markEventEntered(eventId, null); });
  } else {
    markEventEntered(eventId, null);
  }
  renderEventDone();
}

function renderEventDone() {
  const u = loadUser() || {};
  const name = u.name || "";
  const eventName = (eventConfig && eventConfig.name) || "말씀 이벤트";
  const appEl = document.getElementById("app");
  appEl.innerHTML = `
    <div class="summary-screen">
      <div class="summary-card cd-card">
        <div class="cd-emoji">🎉</div>
        <div class="cd-title">이벤트 응모가<br>완료되었습니다</div>
        <div class="cd-sub">${eventName}${name ? ` · ${name} 성도님` : ""}</div>
        <div class="ev-done-msg">말씀을 마음에 새기신 것을 축하드립니다.<br>당첨자 발표는 교회 안내를 확인해 주세요.</div>
        <button class="summary-go challenge-cta" id="ev-go-challenge">🔥 말씀 도전으로 이어가기</button>
        <button class="summary-change" id="ev-go-home">기록 화면으로</button>
      </div>
    </div>`;
  document.getElementById("ev-go-challenge").addEventListener("click", startChallenge);
  document.getElementById("ev-go-home").addEventListener("click", renderSummary);
}
```

- [ ] **Step 2: 이벤트 화면 스타일 추가**

`style.css`에서 Task 3 Step 4에 추가한 마지막 줄을 찾는다:

```css
.dark .summary-help.event-cta.done:hover { background: #2f5a42; color: #fff; }
```

**그 뒤에** 추가한다:

```css
/* 이벤트 진행 화면 */
.test-stage.event-badge { background: var(--gold); color: var(--navy-dark); }
.ev-progress { font-weight: 800; color: var(--navy); font-size: .95rem; padding-left: 10px; }
.ev-hint { min-height: 20px; text-align: center; color: var(--error); font-size: .88rem; margin-top: 6px; }
.ev-explain { margin-top: 14px; }
.ev-explain-label { font-weight: 800; color: #8a6d1f; font-size: .9rem; margin-bottom: 6px; }
.ev-explain-body {
  background: #fdf8f0; border: 1px solid #ead9b0; border-radius: 10px;
  padding: 12px 14px; font-size: .92rem; line-height: 1.7; color: #4a4436; white-space: pre-wrap;
}
.ev-done-msg { color: var(--gray); font-size: .92rem; line-height: 1.7; margin: 14px 0 20px; }
.dark .ev-progress { color: #cdd9f2; }
.dark .ev-explain-label { color: #dcb669; }
.dark .ev-explain-body { background: #232a3a; border-color: #3a4a68; color: #dbe2ee; }
```

- [ ] **Step 3: 문법 확인**

Run:
```bash
cd "c:/Projects/bible-memorize-church-app-v2" && node --check app.js && echo SYNTAX_OK
```
Expected: `SYNTAX_OK`

- [ ] **Step 4: 빈칸 선정 로직 단위 확인**

`pickEventBlankIndex`가 2글자 이상만 고르는지, 예외 상황에서 가장 긴 토큰을 고르는지 확인한다.

Run:
```bash
cd "c:/Projects/bible-memorize-church-app-v2" && node -e "
const src = require('fs').readFileSync('app.js','utf8');
const fn = src.match(/function pickEventBlankIndex[\s\S]*?\n}/)[0];
eval(fn);
// 1) 2글자 이상만 후보로 뽑히는지 — 100번 돌려 한 글자 토큰이 절대 안 나오는지
const t1 = '주의 말씀은 내 발에 등이요 내 길에 빛이니이다'.split(/\s+/);
const picked = new Set();
for (let i=0;i<200;i++) picked.add(pickEventBlankIndex(t1));
const bad = [...picked].filter(i => Array.from(t1[i]).length < 2);
console.log('한글자 토큰 선택 횟수(0이어야 함):', bad.length);
console.log('후보 다양성(2 이상이어야 랜덤):', picked.size);
// 2) 전부 한 글자면 가장 긴 토큰
const t2 = ['가','나','다'];
console.log('전부 한글자일 때 index:', pickEventBlankIndex(t2));
"
```
Expected: 대략 아래처럼 출력(정확한 다양성 숫자는 무작위라 달라질 수 있음)
```
한글자 토큰 선택 횟수(0이어야 함): 0
후보 다양성(2 이상이어야 랜덤): 6
전부 한글자일 때 index: 0
```

- [ ] **Step 5: 캐시태그·스플래시 버전 갱신**

현재 값 확인:
```bash
cd "c:/Projects/bible-memorize-church-app-v2" && grep -n 'style.css?v=\|app.js?v=\|splash-ver' index.html
```

`index.html`에서 아래 세 곳을 각각 올린다(현재 값은 이전 배포 시점에 따라 다르니, **끝 문자를 하나 다음 것으로** 올린다):

- `<link rel="stylesheet" href="style.css?v=…" />` → 날짜/문자 갱신 (예: `20260804a` → `20260807a`)
- `<script src="app.js?v=…"></script>` → 날짜/문자 갱신 (예: `20260804a` → `20260807a`)
- `<div class="splash-ver">v3.086</div>` → `<div class="splash-ver">v3.087</div>` (반드시 소수점 3자리 유지)

- [ ] **Step 6: Commit + 배포**

```bash
cd "c:/Projects/bible-memorize-church-app-v2" && git add app.js style.css index.html && git commit -m "feat(이벤트): 이벤트 진행 화면 + 응모 완료 화면" && git push
```

---

### Task 5: 관리자 — 이벤트 설정 편집 + 응모자 명단

**Files:**
- Modify: `admin-stats.html` (메뉴 카드 추가 + 클릭 배선 + 렌더 함수 추가)

**Interfaces:**
- Consumes: `callApi({action:"getConfig",key:"event"})`, `callApi({action:"saveConfig",pw,key:"event",value})`, `callApi({action:"eventEntrants",pw,event_id})` (Task 1)
- Produces: `renderEventAdmin()` — 관리자 이벤트 관리 화면

- [ ] **Step 1: 메뉴 카드 추가**

`admin-stats.html`에서 메뉴 카드 목록의 마지막 카드(환영 인트로)를 찾는다:

```html
      <div class="rep-card" id="rep-intro">
        <div class="ic">🎬</div>
        <div class="rep-text">
          <div class="ti">환영 인트로</div>
          <div class="de">첫 방문 슬라이드 — 순서·아이콘·문구 편집</div>
        </div>
        <div class="rep-arrow">›</div>
      </div>
    </div>`;
```

다음으로 바꾼다(이벤트 카드를 인트로 카드 뒤에 추가):

```html
      <div class="rep-card" id="rep-intro">
        <div class="ic">🎬</div>
        <div class="rep-text">
          <div class="ti">환영 인트로</div>
          <div class="de">첫 방문 슬라이드 — 순서·아이콘·문구 편집</div>
        </div>
        <div class="rep-arrow">›</div>
      </div>
      <div class="rep-card" id="rep-event">
        <div class="ic">🎉</div>
        <div class="rep-text">
          <div class="ti">말씀 이벤트</div>
          <div class="de">회차 설정(기간·구절 범위) · 응모자 명단</div>
        </div>
        <div class="rep-arrow">›</div>
      </div>
    </div>`;
```

- [ ] **Step 2: 메뉴 클릭 배선 추가**

`admin-stats.html`에서 아래 두 줄을 찾는다:

```js
  document.getElementById("rep-intro").addEventListener("click", renderIntroSlides);
  loadDashboard();
```

다음으로 바꾼다:

```js
  document.getElementById("rep-intro").addEventListener("click", renderIntroSlides);
  document.getElementById("rep-event").addEventListener("click", renderEventAdmin);
  loadDashboard();
```

- [ ] **Step 3: 이벤트 관리 화면 구현**

`admin-stats.html`에서 `// ---------- 환영 인트로 슬라이드(목록·순서) ----------` 주석을 찾아, **그 바로 앞에** 아래 블록을 추가한다:

```js
// ---------- 말씀 이벤트(회차 설정 · 응모자 명단) ----------
let evCfg = null;   // { id, name, start, end, fromNo, toNo }
function evEsc(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function evFmt(iso){
  if(!iso) return "";
  const d=new Date(iso); if(isNaN(d)) return "";
  const z=n=>String(n).padStart(2,"0");
  return d.getFullYear()+"-"+z(d.getMonth()+1)+"-"+z(d.getDate())+" "+z(d.getHours())+":"+z(d.getMinutes());
}
function renderEventAdmin(){
  app.innerHTML=`
    <div class="rep-head">
      <button class="back-btn" id="back">← 메뉴</button>
      <h2>🎉 말씀 이벤트</h2>
    </div>
    <div class="push-card" id="ev-root"><p class="msg">불러오는 중...</p></div>`;
  document.getElementById("back").addEventListener("click", renderMenu);
  evLoad();
}
async function evLoad(){
  const d=await callApi({action:"getConfig",key:"event"}).catch(()=>({ok:false,error:"network"}));
  const root=document.getElementById("ev-root"); if(!root) return;
  if(!d.ok){ root.innerHTML=`<p class="msg err">불러오기 실패: ${evEsc(d.error||"오류")}</p>`; return; }
  const v=d.value;
  evCfg = (v && v.id) ? v : { id:"", name:"", start:"", end:"", fromNo:1, toNo:12 };
  evRender();
}
function evRender(){
  const root=document.getElementById("ev-root"); if(!root) return;
  const c=evCfg||{};
  root.innerHTML=`
    <p class="push-hint">이벤트 기간 중에만 성도 첫 화면에 참여 버튼이 보입니다.
      <b>다음 회차</b>는 회차 ID를 새로 바꾸고 기간·구절 범위만 수정하면 됩니다(응모 기록은 회차별로 따로 쌓입니다).</p>
    <label class="push-lb">회차 ID (영문·숫자, 예: 2026-1)</label>
    <input id="ev-id" class="push-in" value="${evEsc(c.id).replace(/"/g,'&quot;')}" placeholder="2026-1" autocomplete="off" />
    <label class="push-lb">이벤트 이름</label>
    <input id="ev-name" class="push-in" value="${evEsc(c.name).replace(/"/g,'&quot;')}" placeholder="성경암송 가입 이벤트" autocomplete="off" />
    <label class="push-lb">기간 (종료일 당일까지 참여 가능)</label>
    <div class="dm-dates">
      <input type="date" id="ev-start" class="push-in" value="${evEsc(c.start)}" />
      <span class="dm-sep">~</span>
      <input type="date" id="ev-end" class="push-in" value="${evEsc(c.end)}" />
    </div>
    <label class="push-lb">대상 구절 번호 범위</label>
    <div class="dm-dates">
      <input type="number" id="ev-from" class="push-in" value="${Number(c.fromNo)||1}" min="1" />
      <span class="dm-sep">~</span>
      <input type="number" id="ev-to" class="push-in" value="${Number(c.toNo)||12}" min="1" />
    </div>
    <button class="push-send" id="ev-save">💾 이벤트 설정 저장</button>
    <div id="ev-result" class="msg"></div>
    <hr style="margin:22px 0;border:none;border-top:1px solid #e5e5e5" />
    <h3 style="margin:0 0 8px;font-size:1rem">📋 응모자 명단</h3>
    <button class="push-fill" id="ev-load-list">현재 회차 응모자 불러오기</button>
    <div id="ev-list"></div>`;
  document.getElementById("ev-save").addEventListener("click", evSave);
  document.getElementById("ev-load-list").addEventListener("click", evLoadEntrants);
}
function evFormRead(){
  return {
    id: document.getElementById("ev-id").value.trim(),
    name: document.getElementById("ev-name").value.trim(),
    start: document.getElementById("ev-start").value||"",
    end: document.getElementById("ev-end").value||"",
    fromNo: Number(document.getElementById("ev-from").value)||0,
    toNo: Number(document.getElementById("ev-to").value)||0,
  };
}
async function evSave(){
  const r=document.getElementById("ev-result");
  const c=evFormRead();
  if(!c.id){ r.className="msg err"; r.textContent="회차 ID를 입력하세요."; return; }
  if(!c.name){ r.className="msg err"; r.textContent="이벤트 이름을 입력하세요."; return; }
  if(!c.start||!c.end){ r.className="msg err"; r.textContent="시작일과 종료일을 모두 입력하세요."; return; }
  if(c.start>c.end){ r.className="msg err"; r.textContent="종료일이 시작일보다 빠릅니다."; return; }
  if(!(c.fromNo>=1)||!(c.toNo>=c.fromNo)){ r.className="msg err"; r.textContent="구절 범위를 확인하세요(시작 ≤ 끝)."; return; }
  const btn=document.getElementById("ev-save"); btn.disabled=true; r.className="msg"; r.textContent="저장 중...";
  const d=await callApi({action:"saveConfig",pw:getPw(),key:"event",value:c}).catch(()=>({ok:false,error:"network"}));
  btn.disabled=false;
  if(d.error==="unauthorized"){ sessionStorage.removeItem(PW_KEY); renderLogin(); return; }
  if(!d.ok){ r.className="msg err"; r.textContent="저장 실패: "+evEsc(d.error||"오류"); return; }
  evCfg=c; r.className="msg ok"; r.textContent="저장했습니다.";
}
async function evLoadEntrants(){
  const wrap=document.getElementById("ev-list");
  const id=document.getElementById("ev-id").value.trim();
  if(!id){ wrap.innerHTML=`<p class="msg err">회차 ID를 먼저 입력·저장하세요.</p>`; return; }
  wrap.innerHTML=`<p class="msg">불러오는 중...</p>`;
  const d=await callApi({action:"eventEntrants",pw:getPw(),event_id:id}).catch(()=>({ok:false,error:"network"}));
  if(d.error==="unauthorized"){ sessionStorage.removeItem(PW_KEY); renderLogin(); return; }
  if(!d.ok){ wrap.innerHTML=`<p class="msg err">불러오기 실패: ${evEsc(d.error||"오류")}</p>`; return; }
  const list=d.list||[];
  if(!list.length){ wrap.innerHTML=`<p class="push-hint" style="text-align:center;padding:14px 0">아직 응모자가 없습니다.</p>`; return; }
  wrap.innerHTML=`
    <p class="push-hint" style="margin-top:10px">총 <b>${list.length}명</b> 응모 (응모순)</p>
    <div class="table-wrap"><table>
      <thead><tr><th>#</th><th>구분</th><th>소속</th><th>세부</th><th>이름</th><th>응모일시</th></tr></thead>
      <tbody>${list.map((x,i)=>`<tr>
        <td>${i+1}</td><td>${evEsc(x.gubun)}</td><td>${evEsc(x.sosok)}</td>
        <td>${evEsc(x.sebu)}</td><td>${evEsc(x.name)}</td><td>${evFmt(x.entered_at)}</td>
      </tr>`).join("")}</tbody>
    </table></div>`;
}
```

- [ ] **Step 4: 관리자 화면 동작 확인**

브라우저에서 `gocheok.onlybible.kr/admin.html` → 관리자 비번 입력 → 📊 성경암송 통계 → 메뉴에서 **🎉 말씀 이벤트** 카드 클릭.

확인 항목:
1. 설정 폼이 뜨고 기본값(구절 범위 1 ~ 12)이 채워져 있다
2. 회차 ID `2026-1`, 이름 `성경암송 가입 이벤트`, 기간 `2026-08-11 ~ 2026-09-30`, 범위 `1 ~ 12` 입력 후 **저장** → "저장했습니다." 표시
3. **현재 회차 응모자 불러오기** 클릭 → "아직 응모자가 없습니다." 표시(에러가 아니면 정상)
4. 페이지 새로고침 후 다시 들어가면 저장한 값이 그대로 보인다

- [ ] **Step 5: Commit + 배포**

```bash
cd "c:/Projects/bible-memorize-church-app-v2" && git add admin-stats.html && git commit -m "feat(이벤트): 관리자 회차 설정 + 응모자 명단 화면" && git push
```

---

### Task 6: 전체 흐름 실기기 검증

**Files:** (코드 변경 없음 — 검증 전용. 문제 발견 시 해당 Task 파일로 돌아가 수정)

**Interfaces:**
- Consumes: Task 1~5의 전체 기능

- [ ] **Step 1: 이벤트 기간 중 첫 화면 확인**

실기기(휴대폰)에서 `gocheok.onlybible.kr` 접속 → 로그인.

확인: 첫 화면 "나의 말씀 앨범" 버튼 **위에** `🎉 말씀 이벤트 참여하기` 버튼(금색)이 보인다.

- [ ] **Step 2: 이벤트 진행 확인**

버튼을 눌러 이벤트 화면 진입 후 확인:
1. 상단에 요절 전체(예: `시편 119편 105절`)가 고정 표시된다
2. `🎉 이벤트` 배지와 `1 / 12` 진행 표시가 보인다
3. 구절에 빈칸이 **정확히 1개**이고, 빈칸 단어가 **2글자 이상**이다
4. 구절 아래에 `💡 풀이`가 펼쳐진 채로 보인다(해당 구절에 풀이가 있는 경우)
5. 정답을 입력하면 자동으로 다음 구절(`2 / 12`)로 넘어간다
6. 오답을 입력하면 "다시 한 번 입력해 보세요"가 뜨고 입력칸이 비워진다

- [ ] **Step 3: 중도 이탈 시 처음부터인지 확인**

3~4번째 구절에서 `← 나가기` → 첫 화면 → 다시 `🎉 말씀 이벤트 참여하기`.

확인: `1 / 12`부터 시작하고, 구절 **순서가 이전과 다르며**, 같은 구절이 나와도 **빈칸 위치가 다를 수 있다**.

- [ ] **Step 4: 응모 완료 확인**

12개를 끝까지 완료.

확인:
1. `🎉 이벤트 응모가 완료되었습니다` 화면이 뜨고 이벤트 이름·이름이 표시된다
2. `🔥 말씀 도전으로 이어가기` 누르면 말씀 도전 화면으로 간다
3. 첫 화면으로 돌아오면 버튼이 `✅ 이벤트 응모 완료`(초록)로 바뀌어 있다

- [ ] **Step 5: 응모자 명단 확인**

관리자 화면 → 🎉 말씀 이벤트 → **현재 회차 응모자 불러오기**.

확인: 방금 완료한 사람이 구분·소속·세부·이름·응모일시와 함께 1행으로 나온다.

- [ ] **Step 6: 재도전 시 중복 기록 없는지 확인**

앱에서 `✅ 이벤트 응모 완료` 버튼을 다시 눌러 12개를 한 번 더 완료한 뒤, 관리자 명단을 다시 불러온다.

확인: 명단이 여전히 **1행**이고, 응모일시가 **최초 완료 시각 그대로**다.

- [ ] **Step 7: 기존 통계에 영향 없는지 확인**

관리자 → 👥 참여자 현황(또는 🔥 도전 현황)에서 오늘 기록 확인.

확인: 이벤트로 맞힌 12개가 암송·도전 횟수에 **더해지지 않았다**(이벤트 참여 전후 숫자가 같다).

- [ ] **Step 8: 기간 밖에서 버튼이 숨는지 확인**

관리자 화면에서 이벤트 종료일을 **어제 날짜**로 바꿔 저장 → 앱 새로고침.

확인: 첫 화면에 이벤트 버튼이 **보이지 않는다**.

확인 후 종료일을 원래대로(`2026-09-30`) 되돌려 저장한다.

- [ ] **Step 9: CLAUDE.md에 기능 반영**

`CLAUDE.md`의 "주요 기능" 섹션에 아래 줄을 추가한다:

```markdown
- **말씀 이벤트**: 관리자가 회차(기간·구절 범위)를 `app_config.event`에 설정하면 기간 중 첫 화면에 참여 버튼 노출. 대상 구절을 무작위 순서로 구절당 빈칸 1개씩 맞히면 응모 완료(`event_entries`, 회차당 1인 1응모). 진행 상태는 저장하지 않아 중도 이탈 시 처음부터. 기존 통계·랭킹에는 미반영. 관리자 화면에서 회차 설정·응모자 명단 조회.
```

"**액션:**" 목록에도 추가한다: `eventEnter · eventStatus · eventEntrants(응모자 명단, 관리자)`

Commit:
```bash
cd "c:/Projects/bible-memorize-church-app-v2" && git add CLAUDE.md && git commit -m "docs(이벤트): 말씀 이벤트 기능 반영" && git push
```
