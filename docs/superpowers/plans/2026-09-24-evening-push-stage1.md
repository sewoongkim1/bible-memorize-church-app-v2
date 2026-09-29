# 1판 — APNs 되살리기 + `sendPush` 수술 실행 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 아이폰 13분이 못 받고 있는 알림을 되살리고, 저녁 알림이 쓸 `only`·`userBodies` 를 `sendPush` 에 **두 발송 루프 모두** 넣는다.

**Architecture:** 둘은 **같은 함수**(`sendPush`)와 **같은 줄 근처**(`sendApns`)를 건드리므로 한 판으로 묶는다. 원인이 아직 확정이 아니라, 고치는 동시에 **스스로 진단하게** 만든다 — 애플이 준 거절 이유를 `push_log.note` 에 남겨 다음 날 아침 크론이 답을 알려 주게 한다.

**Tech Stack:** Supabase Edge Function(Deno/TypeScript) · Postgres · 시험은 `node --test` + `node:vm` (꾸러미 없음)

**설계 문서:** `docs/superpowers/specs/2026-09-23-evening-push-design.md` 「1판」 절.
**0판:** 2026-09-24 배포됨(v3.487). `evening` 칸·`updatePushEvening`·설정 토글·`EVENING_LIVE` 게이트가 이미 있다.

---

## ⚠️ 먼저 — 무엇을 알고 있고 무엇을 모르는가

### 아는 것 (2026-09-24 실측)

`push_log` 를 8일치 보면 —

| 날짜 | total | sent | failed |
|---|---:|---:|---:|
| 09-17 | 37 | 37 | **0** |
| 09-19 | 43 | 36 | 7 |
| 09-21 | 44 | 36 | 8 |
| 09-24 | 49 | 36 | **13** |

- `sent` 가 **36~37 에 붙박이**다 → 웹 푸시는 멀쩡하다
- 늘어난 `total` 이 그대로 `failed` 가 된다
- 09-24 의 `failed` 13 = **`ios_push_tokens` 행 수 13** 과 정확히 같다
- 실패한 토큰이 **안 지워진다** → `"gone"` 이 아니라 `"error"` 다(`"gone"` 이면 표에서 삭제된다)

**→ 아이폰 알림이 100% 실패하고 있다.** 시크릿 셋(`APNS_KEY_ID`·`APNS_TEAM_ID`·`APNS_PRIVATE_KEY`)은
2026-09-15 부터 설정돼 있으므로 `APNS_READY` 는 참이다 — 설정 누락이 아니라 **애플이 거절**하는 것이다.

### 가장 유력한 원인 (⚠️ **확정 아님**)

`apnsJwt()` 가 **부를 때마다 새 JWT 를 만든다.** 개인키는 캐시하는데(`apnsKeyPromise`) 토큰은 안 한다.
그리고 `sendApns` 는 **기기마다** 그것을 부른다 — 13대면 몇 초 안에 새 토큰 13개다.

> 애플 규칙: provider token 을 **20분에 한 번보다 자주 갱신하면 안 된다.**
> 어기면 `403 TooManyProviderTokenUpdates`.

이 가설은 CLAUDE.md 의 수수께끼도 푼다 — 「서버는 `status:200/reason:null` 로 정상인데 기기엔 안 뜬다」는
**한 통짜리 시험 발송**(`testPush` → `sendApnsDiag`)이라 토큰을 하나만 만들어 통과한 것이다.
**묶음 발송만 막힌다.**

### ⚠️ 모르는 것 — 그래서 설계가 이렇다

애플이 **정확히** 무슨 이유로 거절하는지는 확인하지 못했다(`testPush(diag:true)` 가 관리자 암호를 요구한다).
다른 원인일 수도 있다 — `403 InvalidProviderToken`(키/팀 불일치) · `400 BadTopic` · 키 만료.

**그래서 이 판은 가설 하나에 걸지 않는다:**

1. JWT 캐시를 넣는다(가설이 맞으면 이것으로 고쳐진다)
2. **동시에** 애플이 준 이유를 `push_log.note` 에 남긴다
   → 가설이 틀렸으면 **내일 아침 크론이 진짜 이유를 적어 준다.** 또 추측하지 않아도 된다.

---

## Global Constraints

- **`sendPush` 는 아침 크론 넷·주일 발송·관리자 수동·`monitor` diag 가 전부 지나는 길목이다.**
  깨지면 **다음 날 새벽 5시에 전 구독자 대상으로** 드러난다. 기존 호출자가 새 인자를 하나도 안 넘겨도
  **지금과 한 글자도 다르지 않아야** 한다.
- **어떤 응답·로그에도 `user_id` 를 싣지 않는다.** 이 API 는 JWT 가 없다(`--no-verify-jwt`).
  `push_log.note` 에도 **기기 토큰·`user_id` 를 넣지 않는다** — 이유 문자열만.
- **`only` 가 빈 배열이면 「아무에게도」**다. `b.only && b.only.length` 로 쓰면 모두가 참여한 날
  전 구독자에게 저녁 알림이 나간다.
- **함수 스코프 `title`/`body` 를 루프 안에서 덮지 않는다** — 덮으면 루프 뒤의 iOS 발송과
  `push_log` 가 마지막 구독자의 개인 문구로 오염된다.
- **개발 먼저, 운영 그다음.** SQL 도 Edge Function 도.
- **`git add -A` 금지** · ⚠️ **`<( )` 프로세스 치환 금지**(윈도우 Git Bash 에서 안 열린다) —
  `git diff -- <파일> > /tmp/f.patch && git apply --cached /tmp/f.patch && rm /tmp/f.patch`.
  커밋 뒤 **반드시** `git show --stat`.
- **`tools/bump.py` 를 돌리지 않는다** — 이 판은 프런트를 한 글자도 안 고친다.
- **`EVENING_LIVE` 를 건드리지 않는다** — 3판 것이다. 이 판이 끝나도 저녁 알림은 안 나간다.

## 누가 무엇을 하는가

| | 누가 |
|---|---|
| 코드·시험 쓰기, 커밋 | **서브에이전트** |
| SQL 실행 · Edge Function 배포 · `push_log` 확인 · 다음 날 아침 판정 | **메인 세션(컨트롤러)** |

⚠️ 서브에이전트는 `supabase` 명령을 부르지 않는다.

---

## File Structure

| 파일 | 만드나/고치나 | 책임 |
|---|---|---|
| `supabase/push_log_note.sql` | **만든다** | `push_log` 에 `note text` 한 칸 |
| `supabase/functions/api/index.ts` | 고친다 | JWT 캐시 · `sendApns` 이유 수집 · `sendPush` 수술 · 순수 함수 구간 |
| `tests/send-push-opts.test.cjs` | **만든다** | `only`·`userBodies` 순수 함수 검사(꾸러미 없음) |
| `tools/preflight.py` | 고친다 | 위 검사를 배포 앞 그물에 건다(`PURE_TESTS` 한 줄) |

---

### Task 1: APNs 되살리기 — JWT 캐시 + 거절 이유 남기기

**Files:**
- Create: `supabase/push_log_note.sql`
- Modify: `supabase/functions/api/index.ts` — `apnsJwt` · `sendApns` · `sendPush` 의 iOS 루프와 로그 기록

**Interfaces:**
- Produces: `sendApns(deviceToken, title, body, out?)` — `out` 을 주면 `out.reason` 에 거절 이유가 담긴다.
  **기존 호출자 셋 중 둘(`testPush` 안의 두 곳)은 `out` 을 안 넘기므로 한 글자도 안 고친다.**
- Produces: `push_log.note` — 실패 이유 요약(예: `ios 13건: 403 TooManyProviderTokenUpdates`).

- [ ] **Step 1: SQL 파일을 만든다**

`supabase/push_log_note.sql`:

```sql
-- push_log 에 실패 이유를 적을 칸 (2026-09-24, 1판)
--
-- ⚠️ 왜 필요한가 — 지금은 애플/웹푸시가 준 거절 이유를 sendPush 가 diag 모드에서만
--    돌려주고 그 밖에는 통째로 버린다. 그래서 아이폰 13분이 8일 동안 알림을 한 통도
--    못 받는 동안 아무도 이유를 몰랐다(failed 숫자만 늘었다).
--    이 칸이 있으면 **다음 날 아침 크론이 스스로 이유를 적는다.**
--
-- ⚠️ 기기 토큰과 user_id 는 절대 넣지 않는다 — 이유 문자열만 넣는다.

alter table public.push_log add column if not exists note text;

-- 확인:
--   select to_char(sent_at at time zone 'Asia/Seoul','MM-DD HH24:MI') kst,
--          mode, sent, failed, total, note
--   from public.push_log order by sent_at desc limit 8;
```

- [ ] **Step 2: JWT 를 캐시한다**

`supabase/functions/api/index.ts` 에서 아래를 찾는다:

```ts
async function apnsJwt(): Promise<string> {
  const header = base64url(new TextEncoder().encode(JSON.stringify({ alg: "ES256", kid: APNS_KEY_ID })));
```

그 함수 **전체**를 아래로 바꾼다:

```ts
// APNs provider token — ⚠️ **기기마다 새로 만들면 안 된다.**
//   애플은 이 토큰을 20분에 한 번보다 자주 갱신하면 거절한다(403 TooManyProviderTokenUpdates).
//   예전에는 sendApns 가 기기마다 이 함수를 불러, 13대에 연달아 보내면 몇 초 안에 토큰
//   13개를 만들었다 — 그래서 아이폰 알림이 통째로 막혔다.
//   (2026-09-24 발견: 8일간 sent 가 36에 붙박이인데 failed 가 iOS 토큰 수와 정확히 같았다.
//    한 통짜리 시험 발송은 토큰을 하나만 만들어 통과했기 때문에 오래 안 보였다.)
//   토큰 유효기간은 최대 1시간이므로 45분만 쓴다.
//   ⚠️ Edge Function 은 요청마다 새 아이소레이트일 수 있다 — 그래도 **한 번의 발송 안에서**
//      13대가 같은 토큰을 쓰는 것이 핵심이고, 그 자리가 바로 막히던 곳이다.
let apnsJwtCache: { token: string; at: number } | null = null;
const APNS_JWT_TTL_MS = 45 * 60 * 1000;

async function apnsJwt(): Promise<string> {
  const now = Date.now();
  if (apnsJwtCache && now - apnsJwtCache.at < APNS_JWT_TTL_MS) return apnsJwtCache.token;
  const header = base64url(new TextEncoder().encode(JSON.stringify({ alg: "ES256", kid: APNS_KEY_ID })));
  const payload = base64url(new TextEncoder().encode(JSON.stringify({ iss: APNS_TEAM_ID, iat: Math.floor(now / 1000) })));
  const key = await getApnsKey();
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${header}.${payload}`),
  );
  const token = `${header}.${payload}.${base64url(new Uint8Array(sig))}`;
  apnsJwtCache = { token, at: now };
  return token;
}
```

- [ ] **Step 3: `sendApns` 가 거절 이유를 알려 주게 한다**

아래를 찾는다:

```ts
async function sendApns(deviceToken: string, title: string, body: string): Promise<"ok" | "gone" | "error"> {
  if (!APNS_READY) return "error";
```

시그니처와 본문을 아래로 바꾼다(⚠️ **`out` 은 선택 인자다** — 안 넘기는 기존 호출자 둘은 그대로 돈다):

```ts
// 반환: "ok"(발송 성공) | "gone"(토큰이 더 이상 유효하지 않음 — 표에서 지워야 함) | "error"(그 외)
//   out 을 주면 out.reason 에 **왜 실패했는지**를 담아 준다(예: "403 TooManyProviderTokenUpdates").
//   ⚠️ 기기 토큰이나 user_id 는 담지 않는다 — 이유 문자열만.
async function sendApns(
  deviceToken: string, title: string, body: string, out?: { reason?: string },
): Promise<"ok" | "gone" | "error"> {
  if (!APNS_READY) { if (out) out.reason = "apns-not-configured"; return "error"; }
  try {
    const jwt = await apnsJwt();
    const res = await fetch(`https://api.push.apple.com/3/device/${deviceToken}`, {
      method: "POST",
      headers: {
        "authorization": `bearer ${jwt}`,
        "apns-topic": APNS_BUNDLE_ID,
        "apns-push-type": "alert",
        "apns-priority": "10",
      },
      body: JSON.stringify({ aps: { alert: { title, body }, sound: "default" } }),
    });
    if (res.ok) return "ok";
    const j = await res.json().catch(() => ({} as any));
    if (out) out.reason = `${res.status} ${j.reason ?? "?"}`;
    // ⚠️ 토큰이 죽었다는 신호일 때만 "gone" 이다. 그 밖(403·400 등)은 표를 건드리지 않는다 —
    //    2026-09-24 에 13개가 전부 "error" 라 안 지워진 것이 원인을 좁히는 단서였다.
    if (res.status === 410 || j.reason === "BadDeviceToken" || j.reason === "Unregistered") return "gone";
    return "error";
  } catch (e: any) {
    if (out) out.reason = `throw ${(e && e.message ? e.message : String(e)).slice(0, 60)}`;
    return "error";
  }
}
```

- [ ] **Step 4: `sendPush` 의 iOS 루프가 이유를 모으게 한다**

아래를 찾는다:

```ts
    const r = await sendApns(t.device_token, title || "성경말씀 암송", body || "오늘의 말씀을 암송해요! 🙌");
    if (r === "ok") sent++;
    else {
      failed++;
      if (r === "gone") await db.from("ios_push_tokens").delete().eq("id", t.id);
      if (errs.length < 3) errs.push(`[ios:${r}] ${t.device_token.slice(0, 8)}…`);
    }
```

아래로 바꾼다:

```ts
    const o: { reason?: string } = {};
    const r = await sendApns(t.device_token, title || "성경말씀 암송", body || "오늘의 말씀을 암송해요! 🙌", o);
    if (r === "ok") sent++;
    else {
      failed++;
      if (r === "gone") await db.from("ios_push_tokens").delete().eq("id", t.id);
      // ⚠️ 이유를 세어 둔다(토큰은 담지 않는다). 아래 push_log.note 로 나간다 —
      //    이것이 없어서 아이폰 13분이 8일 동안 못 받는 걸 아무도 몰랐다.
      const why = o.reason || r;
      iosWhy[why] = (iosWhy[why] || 0) + 1;
      if (errs.length < 3) errs.push(`[ios:${r}] ${o.reason || ""}`.trim());
    }
```

그리고 **iOS 루프 바로 위**에 `iosWhy` 를 선언한다. 아래를 찾아서:

```ts
  // ---- iOS 네이티브 푸시(APNs) — 같은 hour/user_id 필터로 함께 보낸다 ----
```

그 줄 **바로 아래**에 넣는다:

```ts
  const iosWhy: Record<string, number> = {};   // 거절 이유별 건수 — push_log.note 로 나간다
```

- [ ] **Step 5: `push_log` 에 이유를 적는다**

아래를 찾는다:

```ts
    const logBase: Record<string, unknown> = {
      mode: b.mode || (b.latest ? "daily" : "manual"),
      title: title || "성경말씀 암송",
      sent, failed, total, ok: sent > 0,
    };
    // body 컬럼이 있으면 본문까지 기록(이력 관리용). 없으면(구 스키마) 본문 없이 재시도.
    const { error } = await db.from("push_log").insert({ ...logBase, body: body || null });
    if (error) await db.from("push_log").insert(logBase);
```

아래로 바꾼다:

```ts
    const logBase: Record<string, unknown> = {
      mode: b.mode || (b.latest ? "daily" : "manual"),
      title: title || "성경말씀 암송",
      sent, failed, total, ok: sent > 0,
    };
    // 왜 실패했는지 — 이유별 건수를 한 줄로. ⚠️ 기기 토큰·user_id 는 안 넣는다.
    const whyList = Object.keys(iosWhy).map((k) => `ios ${iosWhy[k]}건: ${k}`);
    const note = whyList.length ? whyList.join(" · ").slice(0, 300) : null;
    // body·note 컬럼이 있으면 함께 기록. 없으면(구 스키마) 빼고 재시도 — 로그 때문에
    // 발송이 실패하면 본말이 뒤집힌다.
    let { error } = await db.from("push_log").insert({ ...logBase, body: body || null, note });
    if (error) ({ error } = await db.from("push_log").insert({ ...logBase, body: body || null }));
    if (error) await db.from("push_log").insert(logBase);
```

- [ ] **Step 6: 문법을 본다**

Run: `node --check app.js`
Expected: 아무것도 안 나온다.
⚠️ `index.ts` 는 `node --check` 로 못 본다(TypeScript). 문법 오류는 컨트롤러의 **개발 배포**가 잡는다.

- [ ] **Step 7: 커밋**

```bash
git add supabase/push_log_note.sql
git diff -- supabase/functions/api/index.ts > /tmp/f.patch && git apply --cached /tmp/f.patch && rm /tmp/f.patch
git commit -m "fix(알림): 아이폰 알림을 되살린다 — APNs JWT 를 캐시하고 거절 이유를 남긴다

아이폰 13분이 8일째 아침 알림을 한 통도 못 받고 있었다. push_log 를 보면
sent 가 36에 붙박이인데 failed 가 iOS 토큰 수와 정확히 같고, 실패한 토큰이
지워지지도 않았다(gone 이 아니라 error).

apnsJwt() 가 부를 때마다 새 토큰을 만들고 sendApns 가 기기마다 그것을 불렀다.
애플은 provider token 을 20분에 한 번보다 자주 갱신하면 거절한다
(403 TooManyProviderTokenUpdates). 13대면 몇 초 안에 13개다. 한 통짜리 시험
발송은 토큰을 하나만 만들어 통과했기 때문에 오래 안 보였다.

⚠️ 원인이 아직 확정은 아니다(진단에 관리자 암호가 필요하다). 그래서 가설 하나에
걸지 않고, 고치는 동시에 애플이 준 이유를 push_log.note 에 남기게 했다 —
가설이 틀렸으면 다음 날 아침 크론이 진짜 이유를 적어 준다.

sendApns 의 out 인자는 선택이라 기존 호출자 둘(testPush)은 안 고쳤다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git show --stat
```

Expected: **두 파일만** — `supabase/push_log_note.sql` · `supabase/functions/api/index.ts`.
⚠️ 다른 파일이 보이면 `git reset --soft HEAD~1` 후 **BLOCKED** 로 보고.

---

### Task 2: `sendPush` 수술 — `only` · `userBodies` (두 루프 모두)

**Files:**
- Modify: `supabase/functions/api/index.ts` — 순수 함수 구간 추가 + `sendPush` 본문
- Create: `tests/send-push-opts.test.cjs`
- Modify: `tools/preflight.py` — `PURE_TESTS` 한 줄

**Interfaces:**
- Consumes: Task 1 의 `sendApns(…, out)` · `iosWhy`
- Produces: `sendPush` 가 `b.only`(user_id 배열)와 `b.userBodies`(`{[user_id]: {title, body}}`)를 받는다.
  **둘 다 없으면 지금과 똑같이 돈다.** 2판의 `eveningPush` 가 이것을 쓴다.
- Produces: 순수 함수 `buildOnlySet` · `keepUser` · `pickMessage`.

- [ ] **Step 1: 시험을 먼저 쓴다 (실패하는 시험)**

`tests/send-push-opts.test.cjs`:

```js
// 저녁 알림 옵션(only·userBodies) 순수 함수 검사 — index.ts 에서 구간만 떼어 낸다.
//
//   node --test tests/send-push-opts.test.cjs
//
// ⚠️ **꾸러미를 하나도 쓰지 않는다**(node:test·node:assert·node:fs·node:path·node:vm 뿐).
//    그래야 tools/preflight.py 가 이 검사를 배포 앞 그물에 걸 수 있다.
//    여기에 require('jsdom') 같은 줄을 더하는 순간 배포가 통째로 멈춘다.
//
// ⚠️ index.ts 는 TypeScript 지만 **떼어 내는 구간만은 타입 표기 없이** 쓰기로 약속돼 있다.
//    잘라낸 글에 `: any` 가 보이면 그 약속이 깨진 것이고, 이 검사가 먼저 알려 준다.
//    본보기: tests/ranking-scope.test.cjs 가 app.js 의 narrowRanking 을 같은 방식으로 떼어 낸다.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'supabase/functions/api/index.ts'), 'utf8');
const START = '// ── 저녁 알림 옵션 — 순수 함수 (여기부터) ──';
const END = '// ── 저녁 알림 옵션 — 순수 함수 (여기까지) ──';
const s = source.indexOf(START);
const e = source.indexOf(END);
assert.ok(s >= 0, 'index.ts 에서 순수 함수 시작 표식을 못 찾았다 — 이 검사가 낡았다');
assert.ok(e > s, 'index.ts 에서 순수 함수 끝 표식이 시작보다 뒤에 없다 — 이 검사가 낡았다');
const slice = source.slice(s, e);
assert.ok(!/:\s*(any|string|number|boolean|Record|Set)\b/.test(slice),
  '순수 함수 구간에 타입 표기가 들어왔다 — node:vm 이 못 돌린다. 표기를 빼거나 구간을 옮겨라');
const ctx = vm.createContext({});
vm.runInContext(slice, ctx);
const { buildOnlySet, keepUser, pickMessage } = ctx;
assert.equal(typeof buildOnlySet, 'function', 'buildOnlySet 을 못 떼어 냈다');
assert.equal(typeof keepUser, 'function', 'keepUser 를 못 떼어 냈다');
assert.equal(typeof pickMessage, 'function', 'pickMessage 를 못 떼어 냈다');

test('only 를 안 넘기면 아무도 안 거른다', () => {
  assert.equal(buildOnlySet(undefined), null);
  assert.equal(buildOnlySet(null), null);
  assert.equal(keepUser(null, 'u1'), true);
});

test('⚠️ only 가 빈 배열이면 아무에게도 안 보낸다', () => {
  const set = buildOnlySet([]);
  assert.notEqual(set, null, '빈 배열을 null 로 만들면 전 구독자에게 나간다');
  assert.equal(keepUser(set, 'u1'), false);
});

test('only 목록 안에 있는 사람만 남는다', () => {
  const set = buildOnlySet(['u1', 'u2']);
  assert.equal(keepUser(set, 'u1'), true);
  assert.equal(keepUser(set, 'u3'), false);
});

test('user_id 를 문자열로 통일해 견준다', () => {
  assert.equal(keepUser(buildOnlySet([7]), '7'), true);
  assert.equal(keepUser(buildOnlySet(['7']), 7), true);
});

test('배열이 아닌 only 는 안 넘긴 것으로 본다', () => {
  assert.equal(buildOnlySet('u1'), null);
  assert.equal(buildOnlySet({ u1: true }), null);
});

test('userBodies 가 없으면 기본 문구', () => {
  assert.deepEqual(pickMessage(null, 'u1', '아침', '말씀'), { title: '아침', body: '말씀' });
});

test('userBodies 에 있으면 그 사람 문구', () => {
  const b = { u1: { title: '복습', body: '3구절' } };
  assert.deepEqual(pickMessage(b, 'u1', '아침', '말씀'), { title: '복습', body: '3구절' });
});

test('userBodies 에 없는 사람은 기본 문구 (TypeError 나면 안 된다)', () => {
  const b = { u1: { title: '복습', body: '3구절' } };
  assert.deepEqual(pickMessage(b, 'u2', '아침', '말씀'), { title: '아침', body: '말씀' });
});

test('한쪽만 준 경우 나머지는 기본', () => {
  const b = { u1: { title: '복습' } };
  assert.deepEqual(pickMessage(b, 'u1', '아침', '말씀'), { title: '복습', body: '말씀' });
});

test('title·body 가 아예 없으면 앱 기본 문구', () => {
  assert.deepEqual(pickMessage(null, 'u1', undefined, undefined),
    { title: '성경말씀 암송', body: '오늘의 말씀을 암송해요! 🙌' });
});
```

- [ ] **Step 2: 돌려서 실패를 본다**

Run: `node --test tests/send-push-opts.test.cjs`
Expected: **FAIL** — `index.ts 에서 순수 함수 시작 표식을 못 찾았다` (아직 안 넣었으므로).

- [ ] **Step 3: 순수 함수 구간을 넣는다**

`index.ts` 에서 `async function sendPush(b: any) {` 를 찾아, 그 **바로 위**에 넣는다:

```ts
// ── 저녁 알림 옵션 — 순수 함수 (여기부터) ──
// ⚠️ 이 구간은 **타입 표기 없이** 쓴다. tests/send-push-opts.test.cjs 가 두 표식 사이만 잘라
//    node:vm 으로 돌린다(꾸러미 없이 — tools/preflight.py 가 배포 앞 그물에 건다).
//    타입 표기를 하나라도 더하면 그 검사가 깨지고, 검사가 먼저 알려 준다.
//    (그래서 이 주석에도 표기를 예로 적지 않는다 — 가드 정규식이 주석까지 본다.)
function buildOnlySet(only) {
  // ⚠️ **빈 배열은 「아무에게도」다.** `only && only.length` 로 쓰면 모두가 오늘 참여한 날
  //    전 구독자에게 저녁 알림이 나간다. 안 넘겼을 때(null)와 반드시 갈라야 한다.
  if (!Array.isArray(only)) return null;
  return new Set(only.map(function (u) { return String(u); }));
}
function keepUser(onlySet, uid) {
  return !onlySet || onlySet.has(String(uid));
}
function pickMessage(userBodies, uid, title, body) {
  // ⚠️ userBodies 에 없는 사람이 대부분이다 — 옵셔널로 읽어 TypeError 를 막는다.
  //    여기서 터지면 sendPush 가 통째로 빠져나가 아침 알림이 일부만 나가고 로그도 안 남는다.
  var m = (userBodies && typeof userBodies === "object") ? userBodies[String(uid)] : null;
  return {
    title: (m && m.title) || title || "성경말씀 암송",
    body: (m && m.body) || body || "오늘의 말씀을 암송해요! 🙌",
  };
}
// ── 저녁 알림 옵션 — 순수 함수 (여기까지) ──
```

- [ ] **Step 4: `sendPush` 가 그것을 쓰게 한다 — 웹 루프**

아래를 찾는다:

```ts
  let subQ = db.from("push_subscriptions").select("id,endpoint,p256dh,auth");
  if (b.hour) subQ = subQ.eq("hour", Number(b.hour));
  if (b.user_id) subQ = subQ.eq("user_id", b.user_id);
  const { data: subs } = await subQ;
  const payload = JSON.stringify({
    title: title || "성경말씀 암송",
    body: body || "오늘의 말씀을 암송해요! 🙌",
    url: b.url || "https://gocheok.onlybible.kr/",
  });
```

아래로 바꾼다:

```ts
  // 저녁 알림용 — only(이 사람들에게만) · userBodies(사람마다 다른 문구).
  // ⚠️ 기존 호출자(아침 크론 넷·주일 발송·관리자 수동·monitor diag)는 둘 다 안 넘긴다.
  //    그때는 onlySet 이 null 이라 아무도 안 걸러지고, 문구도 지금과 똑같다.
  const onlySet = buildOnlySet(b.only);
  const pushUrl = b.url || "https://gocheok.onlybible.kr/";

  let subQ = db.from("push_subscriptions").select("id,endpoint,p256dh,auth,user_id");
  if (b.hour) subQ = subQ.eq("hour", Number(b.hour));
  if (b.user_id) subQ = subQ.eq("user_id", b.user_id);
  const { data: subsRaw } = await subQ;
  // ⚠️ 거르기는 JS 로 한다 — .in() 에 uuid 수백 개를 실으면 쿼리스트링 길이에 걸린다.
  //    구독자는 34명뿐이라 전부 읽어도 싸다.
  const subs = ((subsRaw ?? []) as any[]).filter((s) => keepUser(onlySet, s.user_id));
```

그리고 웹 발송 루프 안에서 payload 를 **사람마다** 만든다. 아래를 찾아서:

```ts
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        );
```

아래로 바꾼다:

```ts
      try {
        // ⚠️ 함수 스코프 title/body 를 **덮지 않는다** — 덮으면 루프 뒤의 iOS 발송과
        //    push_log 가 마지막 구독자의 개인 문구로 오염된다.
        const m = pickMessage(b.userBodies, s.user_id, title, body);
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: m.title, body: m.body, url: pushUrl }),
        );
```

- [ ] **Step 5: iOS 루프에도 같게**

아래를 찾는다:

```ts
  let iosQ = db.from("ios_push_tokens").select("id,device_token");
  if (b.hour) iosQ = iosQ.eq("hour", Number(b.hour));
  if (b.user_id) iosQ = iosQ.eq("user_id", b.user_id);
  const { data: iosTokens } = await iosQ;
```

아래로 바꾼다:

```ts
  // ⚠️ **발송 루프는 둘이다.** 웹만 고치면 아이폰 쓰시는 분은 오늘 다 하셨어도 저녁 알림을
  //    받고, 그것도 남의 복습 개수로 받는다. 2026-09-23 리뷰가 잡은 자리다.
  let iosQ = db.from("ios_push_tokens").select("id,device_token,user_id");
  if (b.hour) iosQ = iosQ.eq("hour", Number(b.hour));
  if (b.user_id) iosQ = iosQ.eq("user_id", b.user_id);
  const { data: iosRaw } = await iosQ;
  const iosTokens = ((iosRaw ?? []) as any[]).filter((t) => keepUser(onlySet, t.user_id));
```

그리고 Task 1 에서 고친 `sendApns` 호출 줄을 아래로 바꾼다:

```ts
    const m = pickMessage(b.userBodies, t.user_id, title, body);
    const o: { reason?: string } = {};
    const r = await sendApns(t.device_token, m.title, m.body, o);
```

- [ ] **Step 6: `total` 을 거른 뒤 수로**

아래를 찾는다:

```ts
  const total = (subs ?? []).length + (iosTokens ?? []).length;
```

아래로 바꾼다:

```ts
  // ⚠️ 거른 **뒤** 수다 — 안 그러면 「보내지도 않은 사람」이 total 에 들어가
  //    monitor 의 `total>0 && sent===0` 판정이 어긋난다.
  const total = subs.length + iosTokens.length;
```

- [ ] **Step 7: 시험을 다시 돌려 통과를 본다**

Run: `node --test tests/send-push-opts.test.cjs`
Expected: **10개 모두 통과** (`# pass 10` · `# fail 0`)

- [ ] **Step 8: 배포 앞 그물에 건다**

`tools/preflight.py` 에서 아래를 찾는다:

```python
PURE_TESTS = ["tests/ranking-scope.test.cjs"]
```

아래로 바꾼다:

```python
PURE_TESTS = ["tests/ranking-scope.test.cjs", "tests/send-push-opts.test.cjs"]
```

- [ ] **Step 9: preflight 가 통과하는지 본다**

Run: `python tools/preflight.py`
Expected: `[3] 순수 함수 검사` 에 **두 줄**이 통과로 나오고, 맨 끝이 `모두 통과 — 배포해도 된다.`

- [ ] **Step 10: 커밋**

```bash
git add tests/send-push-opts.test.cjs
git diff -- supabase/functions/api/index.ts tools/preflight.py > /tmp/f.patch && git apply --cached /tmp/f.patch && rm /tmp/f.patch
git commit -m "feat(알림): sendPush 에 only·userBodies — 두 발송 루프 모두

2판의 eveningPush 가 쓸 손잡이다. 이 판에서는 아무도 안 쓴다 — 기존 호출자
(아침 크론 넷·주일 발송·관리자 수동·monitor diag)가 둘 다 안 넘기므로
지금과 똑같이 돈다.

⚠️ 발송 루프가 둘이다(웹푸시·APNs). 웹만 고치면 아이폰 쓰시는 분은 오늘 다
하셨어도 저녁 알림을 받고, 그것도 남의 복습 개수로 받는다.

⚠️ only 가 빈 배열이면 「아무에게도」다. \`only && only.length\` 로 쓰면
모두가 오늘 참여한 날 전 구독자에게 나간다. 순수 함수로 떼어 내 검사한다.

⚠️ 함수 스코프 title/body 를 루프 안에서 덮지 않는다 — 덮으면 루프 뒤의
iOS 발송과 push_log 가 마지막 구독자의 개인 문구로 오염된다.

index.ts 는 지금껏 자동 검사가 하나도 없었다. 순수 함수 구간을 표식으로 떼어
node:vm 으로 돌리고(꾸러미 없음) preflight 그물에 걸었다 — ranking-scope 와
같은 방식이다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git show --stat
```

Expected: **세 파일만** — `tests/send-push-opts.test.cjs` · `supabase/functions/api/index.ts` · `tools/preflight.py`.

---

### Task 3: 배포와 **다음 날 아침 판정** (컨트롤러)

**Files:** 없음(배포·확인만)

> ⚠️ 이 Task 는 컨트롤러가 한다. 서브에이전트에게 주지 않는다.

- [ ] **Step 1: 개발에 SQL·함수**

개발(`ktpwthwqzgcqcrmsafdo`)에 `supabase/push_log_note.sql` → 함수 배포.
확인: 공개 액션 하나(`getWeeklyVerse`)가 도는지 — 함수가 통째로 깨졌으면 여기서 걸린다.

- [ ] **Step 2: 운영에 SQL**

⚠️ 프로젝트 이름을 **눈으로 확인**하고(`users` 가 418쯤이면 운영) `push_log_note.sql` 실행.
확인: `select column_name from information_schema.columns where table_name='push_log' and column_name='note';` → 한 줄.

- [ ] **Step 3: ⚠️ 배포 전에 작업 트리를 본다**

Run: `git diff HEAD -- supabase/functions/api/index.ts`
비어 있지 않으면 **멈춘다** — `deploy` 는 git 이 아니라 작업 트리를 올린다.

- [ ] **Step 4: 운영에 함수 배포**

Run: `supabase functions deploy api --no-verify-jwt --project-ref xnomlgydifiqiybervtf`

- [ ] **Step 5: 바로 확인 — 기존 경로가 살아 있나**

```
getWeeklyVerse           → 이번 주 구절이 온다
pushPreview              → 아침 묵상 제목·본문이 만들어진다
updatePushEvening(빈)    → {"ok":false,"error":"no-user"}
sendPush(pw 틀리게)      → adminError 문구 (라우팅과 보호가 산다)
```

- [ ] **Step 6: 푸시**

⚠️ 프런트를 안 고쳤으므로 **`bump.py` 를 돌리지 않는다.** 커밋만 푸시한다.

- [ ] **Step 7: ⚠️ 다음 날 아침 판정 — 이 판의 진짜 시험이다**

다음 날 08:10 KST 이후 `push_log` 를 본다:

```sql
select to_char(sent_at at time zone 'Asia/Seoul','MM-DD HH24:MI') kst,
       mode, sent, failed, total, note
from public.push_log where mode='daily'
order by sent_at desc limit 8;
```

| 보이는 것 | 뜻 |
|---|---|
| **네 줄이 있고 `failed` 가 0 에 가깝다** | ✅ 가설이 맞았다. 아이폰 13분이 알림을 받기 시작했다 |
| 네 줄이 있는데 `failed` 가 그대로 13 | ❌ 가설이 틀렸다 — **`note` 가 진짜 이유를 적어 준다.** 그걸 보고 다시 고친다 |
| **네 줄이 없다** | 🚨 **아침 알림이 멈췄다.** 즉시 이전 판 재배포. `monitor` 도 07:12 에 텔레그램으로 알린다 |

⚠️ `sent` 가 36~37 에서 안 움직이고 `failed` 만 13 이던 것이 8일간의 기준선이다.
**웹 36 + 아이폰 13 = 49 가 전부 `sent` 로 가면 완전히 고쳐진 것이다.**

---

## 이 판에서 **하지 않는 것**

| 무엇 | 어느 판 |
|---|---|
| `eveningPush` 액션 | 2판 |
| 크론 · `EVENING_LIVE = true` | 3판 |
| 완료 창 알림 초대 | 4판 |
| 프런트 한 글자 | — (이 판은 서버뿐이라 `bump.py` 를 안 돌린다) |

## 되돌리기

| 쉬운 것 | 어려운 것 |
|---|---|
| Edge Function — 이전 판 재배포 (⚠️ 통째 배포라 남의 커밋도 함께 되돌아간다) | **이미 나간 알림** |
| `push_log.note` — 그냥 두면 된다(아무도 안 읽어도 해롭지 않다) | — |
| `only`·`userBodies` — 아무도 안 넘기므로 끄고 말고 할 것이 없다 | — |
