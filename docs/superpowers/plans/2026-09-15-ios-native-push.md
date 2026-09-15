# iOS 네이티브 푸시(APNs) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** iOS 앱이 기기 고유 푸시 토큰을 서버에 등록하고, 지금 웹푸시(VAPID)가 쓰는 것과 같은 매일 아침 발송(cron) · 관리자 테스트발송 경로에 APNs(Apple Push Notification service)로 함께 실려 나가게 한다. iOS 2단계(네이티브 기능 3종)의 두 번째 — 위젯(완료)에 이어 이것이 끝나면 네이티브 로그인 화면만 남는다.

**Architecture:** 서버(Edge Function)에 APNs HTTP/2 발송 함수를 새로 추가한다 — 외부 라이브러리 없이 Deno 내장 Web Crypto(ES256 JWT 서명)와 `fetch`만 쓴다(`web-push` 라이브러리를 쓰는 기존 VAPID 발송과 달리, APNs는 Deno 런타임에서 직접 구현이 더 검증하기 쉽다). 새 표 `ios_push_tokens`가 웹의 `push_subscriptions`와 같은 역할(사용자당 기기 토큰 + 알림 시간)을 한다. `sendPush`(cron이 매일 부르는 함수)를 고쳐 웹푸시 발송 뒤에 iOS 발송도 같이 돈다. 네이티브 쪽은 AppDelegate.swift에 등록 코드를 더하고, 얻은 토큰을 웹뷰의 로그인 정보(localStorage)와 함께 서버로 보낸다.

**Tech Stack:** Deno(Supabase Edge Function, 기존 `supabase/functions/api/index.ts`) + Web Crypto API(ES256), Swift/UIKit(`ios-app/ios/App/App/AppDelegate.swift`, 이미 저장소에 고정돼 있음 — Task 4의 Phase1 플랜이 예고한 대로 평범한 git 편집으로 다룬다)

## Global Constraints

- Apple Developer Team ID: **`L6K6F62858`**(Codemagic 빌드 로그에서 이미 확인됨)
- Bundle ID: `kr.onlybible.gocheok.memorize`(고정값)
- 이 파이프라인은 **App Store 배포 인증서로 서명**한다(`IOS_APP_STORE` 타입, `codemagic.yaml`의 기존 서명 단계) — TestFlight 빌드도 배포 서명이므로 **APNs 환경은 언제나 `production`**이다(`development`/sandbox 아님, 개발용 Xcode 직접 실행과 다름). `api.push.apple.com`(운영)만 쓰고 `api.sandbox.push.apple.com`은 쓰지 않는다.
- 서버 코드(`supabase/functions/api/index.ts`)는 **개발 프로젝트(`ktpwthwqzgcqcrmsafdo`) 먼저 배포·확인 → 운영(`xnomlgydifiqiybervtf`)** 순서
- SQL(새 표)은 **개발 DB에 먼저 실행 → 확인 → 운영 DB**
- 새 표는 만드는 자리에서 바로 `enable row level security`를 켠다(CLAUDE.md 보안 규칙 — 빠뜨리면 공개 anon key로 기기 토큰이 새 나간다)
- `ios_push_tokens`는 기존 `push_subscriptions`(웹푸시)와 같은 필드 이름 관례를 따른다: `user_id`, `hour`(알림 받을 시간, 5·6·7·8만 허용), `created_at`
- **Xcode·Codemagic이 필요한 단계는 이 Windows 머신에서 실행할 수 없다** — Codemagic 빌드 로그로만 검증한다. 위젯 때처럼 여러 차례 iteration이 정상이다.
- Node/TypeScript/curl로 검증 가능한 단계(Task 1-3)는 이 머신에서 직접 실행해 확인한다.

---

### Task 1: `ios_push_tokens` 표 + `saveIosPushToken` 액션

**Files:**
- Create: `supabase/ios_push_tokens.sql`
- Modify: `supabase/functions/api/index.ts` (새 함수 `saveIosPushToken` + switch case 1줄)

**Interfaces:**
- Produces: 표 `public.ios_push_tokens(id, user_id, device_token, hour, created_at)`, 액션 `saveIosPushToken` — Task 4(네이티브)가 기기 토큰을 얻으면 이 액션을 호출한다.

- [ ] **Step 1: `supabase/ios_push_tokens.sql` 작성**

```sql
-- iOS 네이티브 푸시(APNs) 토큰 — 웹푸시의 push_subscriptions 와 같은 역할.
-- ⚠️ 새 표는 만드는 자리에서 바로 RLS를 켠다 — 공개 anon key로 기기 토큰이 새면 안 된다.
create table if not exists public.ios_push_tokens (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references public.users(id) on delete cascade,
  device_token  text not null unique,
  hour          smallint not null default 7,   -- 알림 받을 시간(5·6·7·8시) — push_subscriptions와 같은 관례
  created_at    timestamptz not null default now()
);

alter table public.ios_push_tokens enable row level security;

create index if not exists idx_ios_push_user on public.ios_push_tokens(user_id);
create index if not exists idx_ios_push_hour on public.ios_push_tokens(hour);
```

- [ ] **Step 2: 개발 DB에 실행**

Supabase 대시보드(개발 프로젝트 `ktpwthwqzgcqcrmsafdo`) → SQL Editor에서 Step 1의 SQL을 그대로 실행.

Run 확인: `select table_name from information_schema.tables where table_name = 'ios_push_tokens';`
Expected: 한 행(`ios_push_tokens`) 반환.

- [ ] **Step 3: `saveIosPushToken` 함수 작성**

`supabase/functions/api/index.ts`의 `savePush` 함수(약 330번째 줄) 바로 다음에 추가:

```typescript
// ---------- saveIosPushToken: iOS 네이티브 푸시 토큰 저장 ----------
async function saveIosPushToken(b: any) {
  const token = String(b.deviceToken || "").trim();
  if (!token) return { ok: false, error: "no-token" };
  if (!b.user_id) return { ok: false, error: "no-user" };
  const hour = [5, 6, 7, 8].includes(Number(b.hour)) ? Number(b.hour) : 7;
  const { error } = await db.from("ios_push_tokens")
    .upsert({ user_id: b.user_id, device_token: token, hour }, { onConflict: "device_token" });
  if (error) throw error;
  return { ok: true, hour };
}
```

- [ ] **Step 4: switch 문에 case 추가**

기존 `case "savePush":` 줄 바로 다음에 추가:

```typescript
      case "savePush":      return json(await savePush(body));
      case "saveIosPushToken": return json(await saveIosPushToken(body));
```

- [ ] **Step 5: TypeScript 문법 확인**

Run: `cd C:/Projects/bible-memorize-church-app-v2 && npx tsc --noEmit --target es2022 --module esnext --moduleResolution bundler supabase/functions/api/index.ts 2>&1 | head -30`
Expected: 이번에 추가한 줄 근처에서 새 오류 없음(기존 Deno 전역 관련 오류는 무관).

⚠️ 이 명령이 저장소 루트에 `package.json`/`package-lock.json`을 남길 수 있다(npx가 typescript를 임시 설치하며 생기는 부산물) — 확인 후 **반드시 지운다**: `rm -f package.json package-lock.json`(저장소에 커밋하지 않는다, 이 프로젝트는 루트에 npm 패키지가 없다).

- [ ] **Step 6: 개발 프로젝트에 배포 + curl 확인**

```bash
supabase functions deploy api --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo
```

가짜 user_id로 확인(진짜 회원 데이터를 건드리지 않기 위해 무작위 UUID 사용 — user_id 외래키 제약 때문에 실패가 예상되고, 그게 정상이다):
```bash
curl -s -X POST "https://ktpwthwqzgcqcrmsafdo.supabase.co/functions/v1/api" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sb_publishable_eJKP6u95IU9_DBXTvnvYBA_-yGCf-0Y" \
  -H "apikey: sb_publishable_eJKP6u95IU9_DBXTvnvYBA_-yGCf-0Y" \
  -d '{"action":"saveIosPushToken","user_id":"00000000-0000-0000-0000-000000000000","deviceToken":"testtoken123","hour":7}'
```
Expected: 외래키 위반 에러(`{"error":"..."}`, users 표에 없는 user_id라서) — **에러가 나는 것 자체가 액션이 정상 작동 중이라는 신호**다(SQL까지 도달했다는 뜻). `unknown action`이 아니어야 한다.

진짜 user_id로 확인하려면, 개발 DB의 실제 사용자 하나를 조회해서 그 id로 다시 시도:
```bash
# (Supabase 대시보드 SQL Editor에서) select id from public.users limit 1;
# 그 id로 위 curl의 user_id를 바꿔 재실행 → {"ok":true,"hour":7} 기대
```

- [ ] **Step 7: 운영 프로젝트에 배포**

```bash
supabase functions deploy api --no-verify-jwt --project-ref xnomlgydifiqiybervtf
```

(운영 DB에는 테스트 저장을 하지 않는다 — 실제 기기 토큰은 Task 5에서 실기기로만 들어온다.)

- [ ] **Step 8: 커밋**

```bash
git add supabase/ios_push_tokens.sql supabase/functions/api/index.ts
git commit -m "feat(ios-push): ios_push_tokens 표 + saveIosPushToken 액션

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 2: APNs 발송 함수 (JWT 서명 + 단건 발송) + testPush 확장

**Files:**
- Modify: `supabase/functions/api/index.ts`

**Interfaces:**
- Consumes: 시크릿 `APNS_KEY_ID`·`APNS_TEAM_ID`·`APNS_PRIVATE_KEY`(Task 2 Step 1에서 사람이 직접 발급)
- Produces: `async function sendApns(deviceToken: string, title: string, body: string): Promise<"ok" | "gone" | "error">` — Task 3(대량 발송)이 이 함수를 그대로 쓴다.

- [ ] **Step 1 (사람이 직접): APNs 인증 키 발급**

1. developer.apple.com → Certificates, Identifiers & Profiles → **Keys** → "+"
2. 이름은 아무거나(예: `gocheok-memorize-apns`), **Apple Push Notifications service (APNs)** 체크
3. Continue → Register → **`.p8` 파일을 한 번만 다운로드할 수 있으니 안전한 곳에 저장**(저장소에는 절대 커밋 안 함)
4. **Key ID**(10자리 영숫자)를 적어 둔다

- [ ] **Step 2 (사람이 직접): 개발 프로젝트에 시크릿 등록**

```bash
supabase secrets set APNS_KEY_ID="<Step 1의 Key ID>" --project-ref ktpwthwqzgcqcrmsafdo
supabase secrets set APNS_TEAM_ID="L6K6F62858" --project-ref ktpwthwqzgcqcrmsafdo
```

`.p8` 파일 내용 전체(헤더·푸터 포함)를 시크릿으로 등록 — 파일에서 직접 읽어 등록(터미널에 원문을 붙여넣지 않기 위함):
```bash
supabase secrets set --env-file <(echo "APNS_PRIVATE_KEY=$(cat /path/to/AuthKey_XXXXXXXXXX.p8)") --project-ref ktpwthwqzgcqcrmsafdo
```
(Windows에서 `<(...)` 가 안 되면: `.p8` 파일 내용을 복사해 `supabase secrets set APNS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----...-----END PRIVATE KEY-----"` 형태로 직접 실행 — 줄바꿈은 그대로 붙여넣어도 된다.)

- [ ] **Step 3: APNs 발송 함수 작성**

`supabase/functions/api/index.ts`의 VAPID 설정 블록(파일 위쪽, `if (VAPID_PUBLIC && VAPID_PRIVATE) {...}` 다음) 바로 뒤에 추가:

```typescript
// ---------- APNs (iOS 네이티브 푸시) ----------
// 외부 라이브러리 없이 Deno 내장 Web Crypto(ES256)로 JWT를 직접 서명한다.
// ⚠️ 이 앱은 App Store 배포 서명만 쓴다(TestFlight 포함) — sandbox가 아니라
//    항상 production APNs 엔드포인트를 쓴다.
const APNS_KEY_ID = Deno.env.get("APNS_KEY_ID");
const APNS_TEAM_ID = Deno.env.get("APNS_TEAM_ID");
const APNS_PRIVATE_KEY = Deno.env.get("APNS_PRIVATE_KEY"); // .p8 파일 전체 내용(PEM)
const APNS_BUNDLE_ID = "kr.onlybible.gocheok.memorize";
const APNS_READY = !!(APNS_KEY_ID && APNS_TEAM_ID && APNS_PRIVATE_KEY);

function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

let apnsKeyPromise: Promise<CryptoKey> | null = null;
function getApnsKey(): Promise<CryptoKey> {
  if (!apnsKeyPromise) {
    const pem = (APNS_PRIVATE_KEY || "")
      .replace(/-----BEGIN PRIVATE KEY-----/, "")
      .replace(/-----END PRIVATE KEY-----/, "")
      .replace(/\s+/g, "");
    const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
    apnsKeyPromise = crypto.subtle.importKey(
      "pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"],
    );
  }
  return apnsKeyPromise;
}

async function apnsJwt(): Promise<string> {
  const header = base64url(new TextEncoder().encode(JSON.stringify({ alg: "ES256", kid: APNS_KEY_ID })));
  const payload = base64url(new TextEncoder().encode(JSON.stringify({ iss: APNS_TEAM_ID, iat: Math.floor(Date.now() / 1000) })));
  const key = await getApnsKey();
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${header}.${payload}`),
  );
  return `${header}.${payload}.${base64url(new Uint8Array(sig))}`;
}

// 반환: "ok"(발송 성공) | "gone"(토큰이 더 이상 유효하지 않음 — 표에서 지워야 함) | "error"(그 외)
async function sendApns(deviceToken: string, title: string, body: string): Promise<"ok" | "gone" | "error"> {
  if (!APNS_READY) return "error";
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
    if (res.status === 410 || j.reason === "BadDeviceToken" || j.reason === "Unregistered") return "gone";
    return "error";
  } catch (_) { return "error"; }
}

// 진단용 — testPush(diag:true)가 원인을 그대로 보게 해 준다(JWT/인증 문제인지, 그냥 가짜
// 토큰이라 거절됐는지 구분할 수 있어야 한다).
async function sendApnsDiag(deviceToken: string, title: string, body: string):
  Promise<{ status: number; reason: string | null }> {
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
  const j = await res.json().catch(() => ({} as any));
  return { status: res.status, reason: j.reason ?? null };
}
```

⚠️ `sendApnsDiag`가 `apnsJwt()`에서 던지는 예외(예: `APNS_PRIVATE_KEY` 형식이 잘못됨)를 그대로 위로 던지게 둔다 — 진단이 목적이라 감추면 안 된다.

- [ ] **Step 4: `testPush`에 iOS 분기 추가**

`testPush` 함수(약 438번째 줄) 맨 앞에 추가:

```typescript
async function testPush(b: any) {
  // iOS 네이티브 푸시 진단 경로 — 기기 토�리이 있으면 여기로
  if (b.iosDeviceToken) {
    if (!APNS_READY) return { ok: false, error: "apns-not-configured" };
    if (b.diag) {
      const d = await sendApnsDiag(b.iosDeviceToken, "성경암송 — 알림 테스트", "이 메시지가 보이면 APNs 연결 성공입니다 🙌");
      return { ok: d.status === 200, status: d.status, reason: d.reason };
    }
    const r = await sendApns(b.iosDeviceToken, "성경암송 — 알림 설정 완료 ✅", "알림이 정상 작동해요! 🙌");
    return { ok: r === "ok", result: r };
  }
  if (!b.endpoint) return { ok: false, error: "no-endpoint" };
  // (이하 기존 웹푸시 코드는 그대로)
```

(기존 `if (!b.endpoint) return { ok: false, error: "no-endpoint" };` 이후 코드는 손대지 않는다 — 위 블록만 함수 맨 앞에 끼워 넣는다.)

- [ ] **Step 5: TypeScript 문법 확인**

Run: `npx tsc --noEmit --target es2022 --module esnext --moduleResolution bundler supabase/functions/api/index.ts 2>&1 | head -30`
Expected: 새 오류 없음. 끝나면 `rm -f package.json package-lock.json`(Task 1 Step 5와 같은 이유).

- [ ] **Step 6: 개발 배포 + 가짜 토큰으로 진단 확인**

```bash
supabase functions deploy api --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo
curl -s -X POST "https://ktpwthwqzgcqcrmsafdo.supabase.co/functions/v1/api" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sb_publishable_eJKP6u95IU9_DBXTvnvYBA_-yGCf-0Y" \
  -H "apikey: sb_publishable_eJKP6u95IU9_DBXTvnvYBA_-yGCf-0Y" \
  -d '{"action":"testPush","iosDeviceToken":"0000000000000000000000000000000000000000000000000000000000000000","diag":true}'
```
Expected: `{"ok":false,"status":400,"reason":"BadDeviceToken"}`.
**이게 나오면 JWT 서명·인증이 정상이라는 뜻이다** — 가짜 토큰이라 거절된 것뿐. 만약 `reason`이 `InvalidProviderToken`이나 `ExpiredProviderToken`이면 시크릿(Key ID·Team ID·.p8 내용) 중 하나가 잘못된 것이니 Step 1-2를 다시 확인한다.

- [ ] **Step 7: 운영 배포**

```bash
supabase secrets set APNS_KEY_ID="<Step 1의 Key ID>" --project-ref xnomlgydifiqiybervtf
supabase secrets set APNS_TEAM_ID="L6K6F62858" --project-ref xnomlgydifiqiybervtf
supabase secrets set APNS_PRIVATE_KEY="<.p8 내용>" --project-ref xnomlgydifiqiybervtf
supabase functions deploy api --no-verify-jwt --project-ref xnomlgydifiqiybervtf
```
같은 가짜 토큰 curl(운영 anon key로)을 돌려 `BadDeviceToken`을 다시 확인한다.

- [ ] **Step 8: 커밋**

```bash
git add supabase/functions/api/index.ts
git commit -m "feat(ios-push): APNs JWT 서명·발송 함수 + testPush iOS 진단 경로

Deno 내장 Web Crypto(ES256)로 직접 서명 — 외부 라이브러리 없음. 가짜
토큰으로 BadDeviceToken 응답까지 확인해 JWT/인증 정상 동작 검증함.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 3: 매일 발송(cron)에 iOS 합치기

**Files:**
- Modify: `supabase/functions/api/index.ts` (`sendPush` 함수만)

**Interfaces:**
- Consumes: Task 2의 `sendApns(deviceToken, title, body)`

- [ ] **Step 1: `sendPush` 함수에 iOS 발송 추가**

`sendPush` 함수(약 519번째 줄) 안에서, 기존 웹푸시 `for (const s of (subs ?? []) as any[]) {...}` 루프가 끝난 직후, `const total = (subs ?? []).length;` 줄 **앞**에 추가:

```typescript
  // ---- iOS 네이티브 푸시(APNs) — 같은 hour/user_id 필터로 함께 보낸다 ----
  let iosQ = db.from("ios_push_tokens").select("id,device_token");
  if (b.hour) iosQ = iosQ.eq("hour", Number(b.hour));
  if (b.user_id) iosQ = iosQ.eq("user_id", b.user_id);
  const { data: iosTokens } = await iosQ;
  for (const t of (iosTokens ?? []) as any[]) {
    const r = await sendApns(t.device_token, title || "성경말씀 암송", body || "오늘의 말씀을 암송해요! 🙌");
    if (r === "ok") sent++;
    else {
      failed++;
      if (r === "gone") await db.from("ios_push_tokens").delete().eq("id", t.id);
      if (errs.length < 3) errs.push(`[ios:${r}] ${t.device_token.slice(0, 8)}…`);
    }
  }
```

⚠️ 이 블록은 기존 `let sent = 0, failed = 0;` 선언 **뒤**, `const total = ...` 줄 **앞**에 들어가야 한다 — `sent`/`failed`/`errs`는 기존 변수를 그대로 이어 쓴다(새로 선언하지 않는다).

- [ ] **Step 2: `total` 계산에 iOS 토큰 수 포함**

바로 다음 줄을 찾아서:
```typescript
  const total = (subs ?? []).length;
```
다음으로 교체:
```typescript
  const total = (subs ?? []).length + (iosTokens ?? []).length;
```

- [ ] **Step 3: TypeScript 문법 확인**

Run: `npx tsc --noEmit --target es2022 --module esnext --moduleResolution bundler supabase/functions/api/index.ts 2>&1 | head -30`
Expected: 새 오류 없음. 끝나면 `rm -f package.json package-lock.json`.

- [ ] **Step 4: 개발 배포 + diag 확인**

```bash
supabase functions deploy api --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo
curl -s -X POST "https://ktpwthwqzgcqcrmsafdo.supabase.co/functions/v1/api" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sb_publishable_eJKP6u95IU9_DBXTvnvYBA_-yGCf-0Y" \
  -H "apikey: sb_publishable_eJKP6u95IU9_DBXTvnvYBA_-yGCf-0Y" \
  -d '{"action":"sendPush","pw":"<개발 ADMIN_SECRET>","diag":true,"hour":7}'
```
Expected: `{"ok":true,"sent":0,"failed":0,"total":0,...}` (개발 DB엔 iOS 토큰이 아직 없으므로 0이 정상 — 오류 없이 돌아가는지가 핵심이다).

- [ ] **Step 5: 운영 배포**

```bash
supabase functions deploy api --no-verify-jwt --project-ref xnomlgydifiqiybervtf
```

- [ ] **Step 6: 커밋**

```bash
git add supabase/functions/api/index.ts
git commit -m "feat(ios-push): 매일 발송(sendPush)에 iOS 네이티브 푸시 합치기

기존 hour/user_id 필터를 그대로 iOS 토큰 조회에도 쓴다. 만료 토큰(gone)은
자동 정리.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 4: 네이티브 등록 코드 (Push 권한 요청 + 토큰 저장)

**Files:**
- Create: `ios-app/ios/App/App/App.entitlements`
- Modify: `ios-app/ios/App/App/AppDelegate.swift`
- Modify: `ios-app/ios/App/App.xcodeproj/project.pbxproj` (App 타겟에 CODE_SIGN_ENTITLEMENTS 추가)

**Interfaces:**
- Consumes: Task 1의 액션 `saveIosPushToken`(`{action, user_id, deviceToken, hour}`)
- Consumes: app.js의 `saveUser()`가 localStorage에 쓰는 키 `memorize-user`(JSON, `{name, cid, user_id, type, ...}` 모양 — 이미 앱이 쓰고 있는 것, 새로 만들지 않는다)

⚠️ **이 파일들은 Swift/Xcode 코드라 이 Windows 머신에서 컴파일 확인이 불가능하다** — Task 4는 Codemagic 빌드 로그로만 검증한다(위젯 때처럼 반복 시도가 정상일 수 있다).

- [ ] **Step 1: `App.entitlements` 작성**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>aps-environment</key>
    <string>production</string>
</dict>
</plist>
```

- [ ] **Step 2: pbxproj에 CODE_SIGN_ENTITLEMENTS 추가**

`ios-app/ios/App/App.xcodeproj/project.pbxproj`에서 App 타겟의 두 XCBuildConfiguration(`PRODUCT_BUNDLE_IDENTIFIER = kr.onlybible.gocheok.memorize;`가 있는 Debug·Release 블록 — `INFOPLIST_FILE = App/Info.plist;` 줄이 같은 블록에 있다) 각각에 한 줄씩 추가:

```
CODE_SIGN_ENTITLEMENTS = App/App.entitlements;
```

(`INFOPLIST_FILE = App/Info.plist;` 바로 다음 줄에 넣으면 된다. 이 값은 파일 경로 문자열일 뿐이라, Xcode 네비게이터에 보이게 하는 PBXFileReference 등록 없이도 빌드는 된다 — 지금은 그것까지는 안 한다.)

- [ ] **Step 3: pbxproj 중괄호 균형 확인**

Run: `python -c "s=open('ios-app/ios/App/App.xcodeproj/project.pbxproj',encoding='utf-8').read(); print('open:',s.count('{'),'close:',s.count('}'))"`
Expected: 두 숫자가 같음.

- [ ] **Step 4: `AppDelegate.swift` 수정**

전체 파일을 다음으로 교체(기존 생명주기 메서드는 그대로 두고, import·클래스 프로퍼티·`didFinishLaunching`·새 메서드 셋만 더한다):

```swift
import UIKit
import Capacitor
import UserNotifications

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            guard granted else { return }
            DispatchQueue.main.async {
                UIApplication.shared.registerForRemoteNotifications()
            }
        }
        return true
    }

    // 기기 토큰을 받으면, 웹뷰의 로그인 정보(localStorage의 memorize-user)를 읽어
    // user_id 와 함께 서버에 저장한다. 로그인 전이면(아직 memorize-user 없음) 조용히 건너뛴다
    // — 다음에 웹뷰가 다시 뜰 때(앱 재실행 등) 로그인 후 자연스럽게 재시도된다.
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let tokenHex = deviceToken.map { String(format: "%02x", $0) }.joined()
        guard let bridgeVC = window?.rootViewController as? CAPBridgeViewController,
              let webView = bridgeVC.webView else { return }
        webView.evaluateJavaScript("localStorage.getItem('memorize-user')") { result, _ in
            guard let json = result as? String, !json.isEmpty,
                  let data = json.data(using: .utf8),
                  let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let userId = obj["user_id"] as? String else { return }
            self.saveTokenToServer(userId: userId, deviceToken: tokenHex)
        }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        // 조용히 무시 — 시뮬레이터·권한 거부 등에서 정상적으로 발생할 수 있다.
    }

    private func saveTokenToServer(userId: String, deviceToken: String) {
        let url = URL(string: "https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let anonKey = "sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-"
        request.setValue("Bearer \(anonKey)", forHTTPHeaderField: "Authorization")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "action": "saveIosPushToken",
            "user_id": userId,
            "deviceToken": deviceToken,
        ])
        URLSession.shared.dataTask(with: request).resume()
    }

    func applicationWillResignActive(_ application: UIApplication) {
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
    }

    func applicationWillTerminate(_ application: UIApplication) {
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
```

⚠️ 원래 파일에 있던 생명주기 메서드 안쪽 설명 주석들(`// Sent when...` 등)은 지웠다 — 기능은 같다(빈 메서드). 실수로 다른 내용을 지우지 않았는지, 교체 전 메서드 이름 6개(`applicationWillResignActive` 등)가 교체 후에도 모두 있는지 확인한다.

- [ ] **Step 5: 커밋**

```bash
git add ios-app/ios/App/App/App.entitlements ios-app/ios/App/App/AppDelegate.swift ios-app/ios/App/App.xcodeproj/project.pbxproj
git commit -m "feat(ios-push): 푸시 권한 요청 + 기기 토큰 등록 (AppDelegate)

Push Notifications entitlement(production) 추가. 기기 토큰을 받으면
웹뷰 localStorage의 memorize-user 에서 user_id 를 읽어 saveIosPushToken
액션으로 서버에 저장한다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git push origin main
```

- [ ] **Step 6 (사람이 직접): `ios-testflight` 빌드 재실행**

Codemagic → `ios-testflight` 워크플로 실행. 이번엔 서명 단계에서 Push Notifications capability 관련 새 오류가 날 수 있다(entitlement를 처음 쓰는 것이라 프로파일이 이 capability를 포함하는지 Codemagic 자동 서명이 다시 판단해야 함) — 로그를 알려주시면 이어서 고치겠습니다.

---

### Task 5 (사람이 직접): 실기기 확인

- [ ] **Step 1**: 아이폰 TestFlight 앱에서 최신 빌드 설치
- [ ] **Step 2**: 앱 실행 → 로그인 → 알림 권한 요청 팝업에서 **허용**
- [ ] **Step 3 (컨트롤러가 함께 확인)**: 개발자 도구 없이 확인하는 법 — Supabase 대시보드(운영 프로젝트) → Table Editor → `ios_push_tokens` → 방금 로그인한 회원의 행이 생겼는지 확인
- [ ] **Step 4**: 관리자 화면(`admin-stats.html`)의 테스트발송 기능으로, 또는 컨트롤러가 `testPush`(`iosDeviceToken` 대신 실제로는 `sendPush`에 `user_id` 지정)로 실제 알림이 아이폰에 뜨는지 확인
- [ ] **Step 5**: `CLAUDE.md`에 진행 기록

```
- [ ] **iOS 2단계 — 위젯·푸시 완료, 네이티브 로그인 남음.** 실기기에서 푸시 알림 수신 확인됨.
      설계는 `docs/superpowers/specs/2026-09-13-ios-app-design.md`.
```

```bash
git add CLAUDE.md
git commit -m "docs: iOS 네이티브 푸시 완료 기록

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git push origin main
```

---

## 이 계획이 끝나면

로그인한 회원이 아이폰 알림을 허용하면, 매일 아침 발송·관리자 테스트발송이 안드로이드/브라우저(VAPID)와 아이폰(APNs) 양쪽에 동시에 나간다. 다음은 2단계의 마지막(네이티브 로그인 화면) — 이번 계획처럼 별도 계획으로 다룬다.

**의도적으로 미룬 것**: 설계 문서는 `admin-stats.html`의 testPush/sendPush **화면(UI)**도 iOS 기기를 다루도록 손보라고 했다. 이 계획은 **액션 자체**(서버 로직)까지만 다룬다 — `admin-stats.html` 화면에 iOS 기기용 입력칸·상태 표시를 추가하는 건 별도 작업으로 남긴다(지금은 curl이나 DB 조회로 확인 가능해 핵심 기능을 막지 않는다).
