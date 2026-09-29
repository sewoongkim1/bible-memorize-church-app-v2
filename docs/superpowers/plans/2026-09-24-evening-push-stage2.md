# 2판 — `eveningPush` 액션 실행 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 저녁 알림을 **실제로 만들어 보내는 액션**을 둔다. 크론은 3판이므로 **이 판에서도 저절로는 한 통도 안 나간다.**

**Architecture:** `eveningPush` 가 ① 저녁을 켠 구독자를 사람 단위로 모으고 ② 오늘 활동한 사람을 빼고 ③ 밀린 복습 수로 사람마다 문구를 지어 ④ 1판이 만든 `sendPush({only, userBodies})` 에 넘긴다. 발송 자체는 한 줄도 새로 안 짠다.

**Tech Stack:** Supabase Edge Function(Deno/TypeScript) · Postgres · 시험은 `node --test` + `node:vm`(꾸러미 없음)

**설계 문서:** `docs/superpowers/specs/2026-09-23-evening-push-design.md` 「2판」 절.

---

## 앞선 판이 만들어 둔 것 (이미 운영에 있다)

| 판 | 무엇 |
|---|---|
| 0판 | `evening` 칸(기본 true) · `updatePushEvening` · 설정 토글 · `EVENING_LIVE` 게이트(지금 **false**) |
| 1판 | APNs JWT 45분 캐시 · `sendApns(…, out?)` · `push_log.note` · **`sendPush({only, userBodies})`** |

**이 판은 `sendPush` 를 한 글자도 안 고친다.** 부르기만 한다.

---

## ⚠️ 실측 (2026-09-24 오후 · 운영)

| | |
|---|---:|
| 저녁 구독자(`evening=true`, 사람) | **35** |
| 오늘 활동한 사람 | 25 |
| **저녁 대상** | **28** |
| ├ 밀린 복습 있음 → 복습 문구 | 17 |
| └ 없음 → 말씀 문구 | 11 |
| 대상들의 밀린 복습 행 | 232 |

> 저녁 20시엔 활동자가 더 늘어 대상은 이보다 **줄어든다.**

### ✅ 설계가 「가장 큰 함정」이라 한 것은 이미 해결됐다

설계는 **시편이 서버 `reviews` 에 계속 쌓여** 복습이 안 밀린 분께도 「🔁 복습이 기다려요」가 간다고
경고했다. 그런데 커밋 **`b769a09`**(2026-09-23)가 `login`·`saveProgress` 두 자리를 막고 운영의 41행을
지웠다. 운영 실측 — `reviews` 2,810행 **전부** `track='weekly'`, **비(非)주간 0행**.

→ 그래도 **`track='weekly'` 거르기는 그대로 넣는다.** 지금 맞다는 것과 앞으로도 맞다는 것은 다르고,
  `is_active` 가 꺼진 구절은 여전히 섞일 수 있다.

### ⚠️ 1000행 벽은 실재한다

PostgREST 는 한 번에 **1000행**까지만 준다. 지금 대상들의 밀린 복습은 232행이라 멀지만,
**주간 구절 35개 × 구독자 35명 = 최대 1,225행**이라 이론상 넘는다. 넘으면 **뒤쪽 성도님이
조용히 「복습 0」 갈래로 떨어져** 잘못된 문구를 받는다.
→ 저장소에 이미 있는 **`fetchAllRows(build)`**(`index.ts:2376`)를 쓴다.

---

## Global Constraints

- ⚠️ **`latest` 를 절대 안 넘긴다.** `sendPush` 의 `if (b.latest)` 가 `dailyPushContent()` 로 제목·본문을
  **덮어쓴다**(`🌿 오늘의 묵상 …`). 넘기는 순간 저녁에 **아침과 똑같은 알림**이 한 번 더 나가고
  `push_log` 에서 아침 행과 구분이 안 된다. 말씀 한 줄이 필요하면 `latestVerse()` 를 **직접** 부른다.
- ⚠️ **`adminError(b)` 필수.** 크론용 공개 키가 `push_cron_hourly.sql` 에 그대로 적혀 있고 함수는
  `--no-verify-jwt` 다. 막지 않으면 **누구나 전 구독자에게 무제한으로 알림을 쏠 수 있다.**
- ⚠️ **대상·문구는 사람 단위로 먼저 정한다.** 구독 행(47) ≠ 사람(35) — 웹과 아이폰을 둘 다 켜신 분은
  기기 단위로 정하면 **개인화된 저녁 문구를 두 번** 받는다.
- ⚠️ **문구에 「만」과 부정 전제를 쓰지 않는다.** 첫 화면은 일부러 「오늘/만」을 피했다(3구절은 상한이
  아니라 묶음이다). 그리고 20시엔 「오늘 아직 못 하셨죠」가 **22시에 늘 하시는 분께 사실이 아니다.**
- **어떤 응답·로그에도 `user_id` 를 싣지 않는다.** `push_log.note` 에도 넣지 않는다.
- **대상이 0명이어도 `push_log` 에 한 줄 남긴다** — 「조용히 안 나간 것」과 「모두가 참여한 좋은 날」을
  나중에 가를 수 있어야 한다. `monitor` 가 그 행 존재로 판정한다(3판).
- **`sendPush` 를 고치지 않는다.** 이 판은 부르는 쪽만 만든다.
- **`EVENING_LIVE`·크론을 건드리지 않는다** — 3판 것이다.
- **`git add -A` 금지** · ⚠️ **`<( )` 프로세스 치환 금지**(윈도우 Git Bash) ·
  커밋 뒤 **반드시** `git show --stat` · **`tools/bump.py` 금지**(프런트를 안 고친다).

## 누가 무엇을 하는가

| | 누가 |
|---|---|
| 코드·시험 쓰기, 커밋 | **서브에이전트** |
| SQL·배포·운영 리허설 발송·`push_log` 확인 | **메인 세션(컨트롤러)** |

---

## File Structure

| 파일 | 만드나/고치나 | 책임 |
|---|---|---|
| `supabase/functions/api/index.ts` | 고친다 | `eveningPush` 액션 + 라우터 한 줄 + 순수 함수(문구 짓기) |
| `tests/evening-push.test.cjs` | **만든다** | 문구 짓기 순수 함수 검사(꾸러미 없음) |
| `tools/preflight.py` | 고친다 | `PURE_TESTS` 한 줄 |

---

### Task 1: 문구 짓는 순수 함수 + 시험

**Files:**
- Modify: `supabase/functions/api/index.ts` — 1판이 만든 순수 함수 구간 **바로 아래**에 새 구간
- Create: `tests/evening-push.test.cjs`
- Modify: `tools/preflight.py`

**Interfaces:**
- Produces: `eveningMessage(dueCount, verseLine)` → `{ title, body }`
  Task 2 의 `eveningPush` 가 사람마다 이것을 부른다.

- [ ] **Step 1: 시험을 먼저 쓴다 (실패하는 시험)**

`tests/evening-push.test.cjs`:

```js
// 저녁 알림 문구 짓기 — index.ts 에서 구간만 떼어 낸다.
//
//   node --test tests/evening-push.test.cjs
//
// ⚠️ **꾸러미를 하나도 쓰지 않는다**(node:test·node:assert·node:fs·node:path·node:vm 뿐).
//    그래야 tools/preflight.py 가 배포 앞 그물에 걸 수 있다.
//
// ⚠️ 떼어 내는 구간에는 **타입 표기를 쓰지 않기로** 약속돼 있다(주석에도 예를 적지 않는다 —
//    가드 정규식이 주석까지 본다).
//
// ⚠️ vm 크로스 realm — vm 안에서 만든 객체는 프로토타입이 달라 deepStrictEqual 이 실패한다.
//    runInThisContext 로 **같은 realm** 에서 돌려 그 함정을 피한다
//    (tests/send-push-opts.test.cjs 는 스프레드로 우회했는데, 이쪽이 더 낫다).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'supabase/functions/api/index.ts'), 'utf8');
const START = '// ── 저녁 알림 문구 — 순수 함수 (여기부터) ──';
const END = '// ── 저녁 알림 문구 — 순수 함수 (여기까지) ──';
const s = source.indexOf(START);
const e = source.indexOf(END, s + START.length);
assert.ok(s >= 0, 'index.ts 에서 문구 순수 함수 시작 표식을 못 찾았다 — 이 검사가 낡았다');
assert.ok(e > s, 'index.ts 에서 끝 표식이 시작보다 뒤에 없다 — 이 검사가 낡았다');
const slice = source.slice(s, e);
assert.ok(!/:\s*(any|string|number|boolean|Record|Set)\b/.test(slice),
  '문구 구간에 타입 표기가 들어왔다 — node:vm 이 못 돌린다');
// 같은 realm 에서 돌린다 — 돌려받은 객체를 그대로 비교할 수 있다.
new vm.Script(slice + '\n;globalThis.__eveningMessage = eveningMessage;').runInThisContext();
const eveningMessage = globalThis.__eveningMessage;
assert.equal(typeof eveningMessage, 'function', 'eveningMessage 를 못 떼어 냈다');

test('밀린 복습이 있으면 복습 문구', () => {
  const m = eveningMessage(5, '말씀 한 줄 (롬 14:8)');
  assert.match(m.title, /복습/);
  assert.match(m.body, /3구절/);       // 5개 밀려도 한 번에 하는 3구절로 말한다
});

test('밀린 것이 3보다 적으면 그 수로 말한다', () => {
  assert.match(eveningMessage(2, 'x').body, /2구절/);
  assert.match(eveningMessage(1, 'x').body, /1구절/);
});

test('⚠️ 「만」을 쓰지 않는다 (첫 화면이 일부러 피한 표현이다)', () => {
  for (const n of [1, 2, 3, 10]) {
    const m = eveningMessage(n, 'x');
    assert.ok(!/구절만/.test(m.body), `${n}일 때 「구절만」이 들어갔다: ${m.body}`);
  }
});

test('밀린 것이 없으면 말씀 문구 — 본문이 그대로 들어간다', () => {
  const m = eveningMessage(0, '우리가 살아도 주를 위하여 (롬 14:8)');
  assert.ok(!/복습/.test(m.title), '복습이 없는데 복습이라 말하면 안 된다');
  assert.match(m.body, /롬 14:8/);
});

test('⚠️ 부정 전제를 쓰지 않는다 — 22시에 늘 하시는 분께 사실이 아니다', () => {
  for (const [n, v] of [[0, 'x'], [3, 'x']]) {
    const m = eveningMessage(n, v);
    const all = m.title + ' ' + m.body;
    assert.ok(!/아직|못 하|안 하|놓치/.test(all), `부정 전제가 들어갔다: ${all}`);
  }
});

test('말씀 한 줄이 비어도 터지지 않는다', () => {
  const m = eveningMessage(0, '');
  assert.equal(typeof m.title, 'string');
  assert.ok(m.body.length > 0, '본문이 비면 안 된다');
});

test('음수·이상한 값도 말씀 갈래로 떨어진다', () => {
  assert.ok(!/복습/.test(eveningMessage(-1, 'x').title));
  assert.ok(!/복습/.test(eveningMessage(undefined, 'x').title));
});
```

- [ ] **Step 2: 돌려서 실패를 본다**

Run: `node --test tests/evening-push.test.cjs`
Expected: **FAIL** — `문구 순수 함수 시작 표식을 못 찾았다`

- [ ] **Step 3: 순수 함수를 넣는다**

`index.ts` 에서 `// ── 저녁 알림 옵션 — 순수 함수 (여기까지) ──` 를 찾아, 그 **바로 아래**에 넣는다:

```ts

// ── 저녁 알림 문구 — 순수 함수 (여기부터) ──
// ⚠️ 이 구간도 **타입 표기 없이** 쓴다. tests/evening-push.test.cjs 가 두 표식 사이만 잘라
//    돌린다(꾸러미 없이 — tools/preflight.py 가 배포 앞 그물에 건다).
//    주석에도 표기를 예로 적지 않는다 — 가드 정규식이 주석까지 본다.
//
// ⚠️ 문구 규칙 둘. 둘 다 이유가 있다.
//   ① **「만」을 쓰지 않는다.** 첫 화면이 일부러 피한 표현이다 — 3구절은 상한이 아니라 묶음이고,
//      다 하면 앱이 곧장 「3구절 더 하기」를 내민다. 「3구절만」은 그 결정을 되돌린다.
//   ② **부정 전제를 쓰지 않는다**(「오늘 아직 못 하셨죠」 따위). 저녁 8시에 보내는데
//      22시에 늘 하시는 분이 적지 않다 — 그분들께는 사실이 아닌 말이 된다.
function eveningMessage(dueCount, verseLine) {
  var n = Number(dueCount);
  if (!(n >= 1)) {
    // 밀린 복습이 없는 분 — 이번 주 말씀을 한 줄 드린다.
    return {
      title: "📖 오늘의 말씀",
      body: verseLine || "오늘도 말씀 한 구절 마음에 새겨 보세요 🙌",
    };
  }
  // 한 번에 하는 묶음이 3구절이라, 그보다 많이 밀렸어도 3으로 말한다 —
  // 적체 숫자(평균 13.7)를 보이면 벽처럼 느껴진다.
  var k = n < 3 ? n : 3;
  return {
    title: "🔁 복습이 기다려요",
    body: "외운 말씀 " + k + "구절 다시 만나 보실래요?",
  };
}
// ── 저녁 알림 문구 — 순수 함수 (여기까지) ──
```

- [ ] **Step 4: 시험이 통과하는지 본다**

Run: `node --test tests/evening-push.test.cjs`
Expected: **`# pass 7` · `# fail 0`**

- [ ] **Step 5: 문법**

Run: `npx --yes esbuild@0.24.0 supabase/functions/api/index.ts --outfile=/dev/null --log-level=warning`
Expected: 종료코드 0, 아무 출력 없음. ⚠️ `| head` 로 파이프하지 마라(`$?` 가 head 것이 된다).

- [ ] **Step 6: 배포 앞 그물에 건다**

`tools/preflight.py` 에서 찾는다:

```python
PURE_TESTS = ["tests/ranking-scope.test.cjs", "tests/send-push-opts.test.cjs"]
```

바꾼다:

```python
PURE_TESTS = ["tests/ranking-scope.test.cjs", "tests/send-push-opts.test.cjs",
              "tests/evening-push.test.cjs"]
```

Run: `python tools/preflight.py`
Expected: `[3] 순수 함수 검사` 에 **세 줄**이 통과로, 끝이 `모두 통과 — 배포해도 된다.`

- [ ] **Step 7: 커밋**

```bash
git add tests/evening-push.test.cjs && \
git diff -- supabase/functions/api/index.ts tools/preflight.py > /tmp/f.patch && \
git apply --cached /tmp/f.patch && rm /tmp/f.patch && \
git commit -m "feat(알림): 저녁 문구 짓는 순수 함수 — 2판

밀린 복습이 있으면 복습으로, 없으면 이번주 말씀으로.

⚠️ 문구 규칙 둘을 시험으로 못 박았다.
① 「만」을 쓰지 않는다 — 첫 화면이 일부러 피한 표현이다. 3구절은 상한이 아니라
   묶음이고, 다 하면 앱이 곧장 「3구절 더 하기」를 내민다.
② 부정 전제를 쓰지 않는다 — 저녁 8시에 보내는데 22시에 늘 하시는 분이 적지 않다.
   「오늘 아직 못 하셨죠」는 그분들께 사실이 아니다.

밀린 것이 많아도 3으로 말한다 — 적체 숫자(평균 13.7)는 벽처럼 느껴진다.

vm 크로스 realm 함정은 runInThisContext 로 피했다(send-push-opts 는 스프레드로
우회했는데 이쪽이 낫다는 리뷰 지적을 반영).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" && \
git show --stat
```

Expected: **세 파일만** — `tests/evening-push.test.cjs` · `supabase/functions/api/index.ts` · `tools/preflight.py`

---

### Task 2: `eveningPush` 액션

**Files:**
- Modify: `supabase/functions/api/index.ts` — `weeklyVersePush` 함수 **바로 아래**에 새 함수,
  라우터의 `case "weeklyVersePush":` **바로 아래**에 한 줄

**Interfaces:**
- Consumes: Task 1 의 `eveningMessage` · 1판의 `sendPush({only, userBodies})` · `fetchAllRows` · `kstDay`
- Produces: 액션 `eveningPush` — 요청 `{action:"eveningPush", pw}` (+ 시험용 `dryRun:true`),
  응답 `{ok:true, targets, review, verse, sent, failed, total}`.
  ⚠️ 응답에 `user_id` 를 싣지 않는다.

- [ ] **Step 1: 함수를 쓴다**

`weeklyVersePush` 함수가 끝나는 곳(`return await sendPush({ ...b, title, body, mode: "weekly-verse", url: ... });` 와 닫는 `}`) **바로 아래**에 붙인다:

```ts
// ---------- eveningPush: 저녁 20시 — 오늘 아직 안 하신 분께만 (2026-09-24, 2판) ----------
// 근거 — 구독자는 활동일 2.1배·최근 활동률 1.6배인데 활동자의 12%만 구독했고,
//        알림은 아침 한 번뿐인데 반복 정점은 저녁이다(docs/analysis/2026-09-23-usage-analysis.md).
//
// ⚠️ **latest 를 절대 안 넘긴다.** sendPush 의 if (b.latest) 가 dailyPushContent() 로 제목·본문을
//    덮어써, 저녁에 아침과 똑같은 묵상 알림이 한 번 더 나간다. 말씀 한 줄은 여기서 직접 만든다.
// ⚠️ **사람 단위로 먼저 정한다.** 구독 행(47) ≠ 사람(35) — 웹과 아이폰을 둘 다 켜신 분이
//    기기 단위로는 개인 문구를 두 번 받는다.
// ⚠️ **대상이 0명이어도 push_log 에 한 줄 남긴다**(sendPush 가 남긴다) — 「조용히 안 나간 것」과
//    「모두가 참여한 좋은 날」을 나중에 가를 수 있어야 한다.
async function eveningPush(b: any) {
  const err = adminError(b); if (err) return { ok: false, error: err };
  const today = kstDay(new Date().toISOString());   // ⚠️ ymd() 는 UTC 다. 반드시 kstDay.

  // 1) 저녁을 켠 구독자를 **사람 단위**로 모은다
  const [webRes, iosRes] = await Promise.all([
    db.from("push_subscriptions").select("user_id").eq("evening", true),
    db.from("ios_push_tokens").select("user_id").eq("evening", true),
  ]);
  const people = new Set<string>();
  for (const r of ((webRes.data ?? []) as any[])) if (r.user_id) people.add(String(r.user_id));
  for (const r of ((iosRes.data ?? []) as any[])) if (r.user_id) people.add(String(r.user_id));

  // 2) 오늘(KST) 활동한 사람을 뺀다 — 집계표 daily_activity 를 읽는다(순위·mydays 와 같은 원천).
  const { data: acted } = await db.from("daily_activity").select("user_id").eq("day", today);
  for (const r of ((acted ?? []) as any[])) people.delete(String(r.user_id));
  const only = Array.from(people);

  // 3) 밀린 복습 — **대상만**, **주간 구절만**.
  //    ⚠️ verses 조인을 PostgREST 로 못 하므로, 살아 있는 주간 구절 번호를 먼저 읽어 JS 로 거른다.
  //    ⚠️ 1000행 벽 — 주간 35구절 × 구독자 35명 = 최대 1,225행이라 이론상 넘는다.
  //       넘으면 뒤쪽 성도님이 조용히 「복습 0」 갈래로 떨어져 틀린 문구를 받는다. fetchAllRows 를 쓴다.
  const dueBy: Record<string, number> = {};
  if (only.length) {
    const { data: vs } = await db.from("verses").select("no")
      .eq("is_active", true).eq("track", "weekly");
    const weekly = new Set(((vs ?? []) as any[]).map((v) => Number(v.no)));
    const rows = await fetchAllRows(() => db.from("reviews")
      .select("user_id,verse_no").in("user_id", only).lte("due_at", today));
    for (const r of rows) {
      if (!weekly.has(Number(r.verse_no))) continue;
      const u = String(r.user_id);
      dueBy[u] = (dueBy[u] || 0) + 1;
    }
  }

  // 4) 사람마다 문구
  const v = await latestVerse();
  const verseLine = v ? (v.ref ? `${v.text} (${v.ref})` : v.text) : "";
  const userBodies: Record<string, { title: string; body: string }> = {};
  let review = 0, verse = 0;
  for (const u of only) {
    const n = dueBy[u] || 0;
    userBodies[u] = eveningMessage(n, verseLine);
    if (n >= 1) review++; else verse++;
  }

  // 5) 보낸다 — 발송은 sendPush 가 한다(웹푸시·APNs 두 루프).
  //    ⚠️ latest 를 안 넘긴다. mode 로 push_log 에서 아침 행과 갈라진다.
  //    url 의 pe=1 은 저녁 클릭을 아침과 가르는 표식이다(app.js readPushMark).
  const r = await sendPush({
    pw: b.pw, only, userBodies,
    title: "📖 오늘의 말씀", body: verseLine || "오늘도 말씀 한 구절 마음에 새겨 보세요 🙌",
    mode: "evening", url: "https://gocheok.onlybible.kr/?from=push&pe=1",
  });

  // ⚠️ 응답에 user_id 를 싣지 않는다 — 수를 센 것만.
  return { ok: true, targets: only.length, review, verse,
           sent: (r as any).sent ?? 0, failed: (r as any).failed ?? 0, total: (r as any).total ?? 0 };
}
```

- [ ] **Step 2: 라우터에 한 줄**

`case "weeklyVersePush":` 로 시작하는 줄을 찾아 그 **바로 아래**에:

```ts
      case "eveningPush":   return json(await eveningPush(body));
```

- [ ] **Step 3: 문법**

Run: `npx --yes esbuild@0.24.0 supabase/functions/api/index.ts --outfile=/dev/null --log-level=warning`
Expected: 종료코드 0

- [ ] **Step 4: preflight**

Run: `python tools/preflight.py`
Expected: 전부 통과

- [ ] **Step 5: 커밋**

```bash
git diff -- supabase/functions/api/index.ts > /tmp/f.patch && \
git apply --cached /tmp/f.patch && rm /tmp/f.patch && \
git commit -m "feat(알림): eveningPush 액션 — 오늘 안 하신 분께만, 사람마다 다른 문구

크론은 3판이므로 이 판에서도 저절로는 한 통도 안 나간다.

저녁을 켠 구독자를 사람 단위로 모아 오늘(KST) daily_activity 에 행이 있는
분을 빼고, 밀린 복습 수로 문구를 지어 sendPush({only, userBodies}) 에 넘긴다.
발송은 1판이 만든 두 루프(웹푸시·APNs)가 그대로 한다.

⚠️ latest 를 안 넘긴다 — 넘기면 dailyPushContent 가 제목·본문을 덮어써
저녁에 아침과 똑같은 묵상 알림이 한 번 더 나간다.
⚠️ adminError 필수 — 크론용 공개 키가 SQL 파일에 적혀 있고 함수는
--no-verify-jwt 라, 안 막으면 누구나 전 구독자에게 알림을 쏠 수 있다.
⚠️ 사람 단위 — 구독 행(47) ≠ 사람(35). 기기 단위로 정하면 웹·아이폰을 둘 다
켜신 분이 개인 문구를 두 번 받는다.
⚠️ 1000행 벽 — 주간 35구절 × 35명 = 최대 1,225행이라 fetchAllRows 를 쓴다.
넘치면 뒤쪽 성도님이 조용히 「복습 0」 갈래로 떨어져 틀린 문구를 받는다.

시편 오염은 b769a09 가 이미 막았다(운영 reviews 2,810행 전부 weekly).
그래도 track='weekly' 거르기는 둔다 — 지금 맞다는 것과 앞으로도 맞다는 것은 다르다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" && \
git show --stat
```

Expected: **`supabase/functions/api/index.ts` 하나만**

---

### Task 3: 배포와 **리허설** (컨트롤러)

> ⚠️ 컨트롤러가 한다. 서브에이전트에게 주지 않는다.

- [ ] **Step 1: 개발 배포 · 공개 경로 확인**
- [ ] **Step 2: ⚠️ `git diff HEAD -- supabase/functions/api/index.ts` 가 비었는지 보고 운영 배포**
- [ ] **Step 3: 운영에서 기존 경로 확인** — `getWeeklyVerse` · `pushPreview` · `sendPush` 보호
- [ ] **Step 4: ⚠️ 리허설은 친구가 한다**

  `eveningPush` 는 `adminError` 로 막혀 있어 **컨트롤러가 부를 수 없다**(관리자 암호가 없다).
  친구가 `admin.html` → 성경암송 관리에서 부르시거나, 3판의 크론이 첫 발송을 한다.

  ⚠️ **첫 발송 전에 반드시 정할 것** — 지금 그대로 부르면 **28분께 실제 알림이 나간다.**
  한 사람(친구 자신)에게만 먼저 보내 보려면 `only` 를 직접 주는 길이 필요한데,
  지금 `eveningPush` 는 대상을 스스로 정한다. **3판에서 크론을 걸기 전에 리허설 방법을 정한다.**

- [ ] **Step 5: `push_log` 확인** — `mode='evening'` 행이 남았는지, `note` 가 무엇을 적었는지

---

## 이 판에서 **하지 않는 것**

| 무엇 | 어느 판 |
|---|---|
| 크론 등록 · `EVENING_LIVE = true` | 3판 |
| 완료 창 알림 초대 | 4판 |
| 복습 딥링크(`?go=review`) | 별도 과제 — 지금은 홈으로 보낸다(첫 화면 맨 위가 복습 단추) |
| 프런트 한 글자 | — (`bump.py` 를 안 돌린다) |
