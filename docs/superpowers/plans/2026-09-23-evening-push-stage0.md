# 0판 — 알림 동의 문구 정정 + 저녁 on/off 토글 실행 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 저녁 알림이 나가기 **전에**, 성도님께 한 약속(「아침만 보냅니다」)을 사실로 만들고 저녁만 끌 수 있는 손잡이를 마련한다.

**Architecture:** 두 표(`push_subscriptions`·`ios_push_tokens`)에 `evening boolean not null default true` 칸 하나를 더하고, 사람 단위로 그것을 뒤집는 서버 액션 `updatePushEvening` 하나를 둔다. 프런트는 `setPushHour` 와 **똑같은 꼴**의 `getPushEvening`/`setPushEvening` 을 `js/push.js` 에 두고, 설정 화면에 토글 한 줄을 붙인다. 이 판에서는 **저녁 알림을 한 통도 보내지 않는다** — 칸과 문구만 준비한다.

**Tech Stack:** Vanilla JS PWA(`app.js`·`js/*.js`) · Supabase Edge Function(Deno/TypeScript, `supabase/functions/api/index.ts`) · Postgres · 시험은 `bash` 스모크 + Playwright(Python)

**설계 문서:** `docs/superpowers/specs/2026-09-23-evening-push-design.md` — 「0판」 절이 이 계획의 근거다.

---

## Global Constraints

- **저녁 기본값은 `true`(켜짐).** 기존 구독자 34분은 그대로 받으시되 끌 수 있게 한다. `default false` 로 쓰지 말 것.
- **저녁 시각은 20시**로 문구에 적는다. 「저녁 8시」로 쓴다(24시 표기 안 씀).
- **어떤 응답·로그·`diag` 에도 `user_id` 를 싣지 않는다.** 이 API 는 JWT 가 없다(`--no-verify-jwt`) — CLAUDE.md 보안 절.
- **개발(`ktpwthwqzgcqcrmsafdo`) 먼저, 운영(`xnomlgydifiqiybervtf`) 그다음.** SQL 도 Edge Function 도 예외 없다.
- **`git add -A` 금지.** 지금 이 저장소에서 **다른 세션이 동시에 일하고 있다**(2026-09-23 기준 13개 파일 수정 중, `style.css`·`tools/screen-sweep.py` 는 **이미 스테이징돼 있다**). 공용 파일(`app.js`·`index.ts`)은 `git apply --cached` 로 내 헝크만 담고 **경로 없이** 커밋하거나, 경로를 못 박아 커밋한다. 커밋 뒤 **반드시** `git show --stat` 으로 확인한다.
- **판 번호·캐시태그는 `python tools/bump.py` 한 번**으로만 올린다. 손으로 고치지 않는다. 그리고 **Task 6 에서 한 번만** 돌린다(Task 마다 돌리면 충돌한다).
- **`supabase functions deploy` 는 git 이 아니라 작업 트리를 올린다.** 배포 직전 `git diff HEAD -- supabase/functions/api/index.ts` 로 남의 커밋 안 된 헝크가 함께 나가는지 본다.
- **`localStorage` 키 이름은 `pushEvening`** (기존 `pushHour` 와 같은 꼴). `push-invite-asked` 는 4판 것이니 여기서 만들지 않는다.
- 새 표를 만들지 않는다 — 기존 표에 **칸만** 더한다. 그래도 `enable row level security` 는 이미 두 표 모두 켜져 있다(확인만 하고 건드리지 않는다).

---

## File Structure

| 파일 | 만드나/고치나 | 책임 |
|---|---|---|
| `supabase/push_evening.sql` | **만든다** | 두 표에 `evening` 칸 하나 |
| `supabase/functions/api/index.ts` | 고친다 | `updatePushEvening` 액션 + 라우터 한 줄 · `weeklyVerseKst` 머리 주석의 틀린 ⚠️ |
| `js/api.js` | 고친다 | `updatePushEvening` 래퍼 한 줄 |
| `js/push.js` | 고친다 | `getPushEvening`/`setPushEvening` · 성공 안내 문구 |
| `app.js` | 고친다 | 설정 토글 UI + 배선 · 「아침만」 문구 다섯 곳 |
| `privacy/index.html` | 고친다 | 「아침 말씀 알림」 → 「말씀 알림」 |
| `CLAUDE.md` | 고친다 | 틀린 UTC ⚠️ 한 줄 |
| `docs/analysis/2026-09-23-usage-analysis.md` · `.html` | 고친다 | 같은 틀린 ⚠️ |
| `tests/push-evening-smoke.sh` | **만든다** | 서버 액션 스모크(개발 DB) |
| `tests/push-evening-native.py` | **만든다** | ⚠️ 네이티브 분기 회귀 시험 |

> ⚠️ **`tests/push-evening-native.py` 가 있는 까닭** — 2026-09-16 에 `setPushHour` 에 네이티브 분기가
> 없어서 **아이폰 앱 쓰시는 분이 시간을 바꿔도 서버에 조용히 반영이 안 됐다.** 같은 모양의 함수를
> 새로 만드는 지금, 같은 사고를 막는 자리는 이 시험 하나다.

---

### Task 1: `evening` 칸 + 서버 액션 `updatePushEvening`

**Files:**
- Create: `supabase/push_evening.sql`
- Create: `tests/push-evening-smoke.sh`
- Modify: `supabase/functions/api/index.ts` — `updateIosPushHour` 함수 **바로 아래**에 새 함수, 라우터의 `case "updateIosPushHour":` **바로 아래**에 한 줄

**Interfaces:**
- Produces: 액션 `updatePushEvening` — 요청 `{ action:"updatePushEvening", user_id: string, on: boolean }`,
  응답 `{ ok: true, on: boolean, web: number, ios: number }` (`web`·`ios` 는 바뀐 **행 수**).
  ⚠️ 응답에 `user_id` 를 싣지 않는다.
- Produces: 두 표의 `evening` 칸(기본 `true`). Task 2 의 `setPushEvening` 이 이 액션을 부른다.

- [ ] **Step 1: 스모크 시험을 먼저 쓴다 (실패하는 시험)**

`tests/push-evening-smoke.sh` 를 새로 만든다. `tests/feature-log-smoke.sh` 와 같은 꼴이다 —
⚠️ **한글은 반드시 UTF-8 파일 body 로 보낸다**(Git Bash 에서 명령줄 리터럴 한글은 깨져서 도착한다.
이걸 모르면 서버가 멀쩡한 값을 거부하는 것처럼 보여 서버 버그로 오해하게 된다).

```bash
#!/usr/bin/env bash
# 저녁 알림 on/off (updatePushEvening) 스모크. 기본은 개발 DB.
#   DEV_ANON=... bash tests/push-evening-smoke.sh
#   PE_ENV=prod PROD_ANON=... bash tests/push-evening-smoke.sh
#
# ⚠️ 표에 실제로 무엇이 들었는지는 여기서 못 본다(RLS 로 공개 키가 못 읽는다 — 그게 맞다).
#    여기서 보는 것은 **액션이 무엇을 돌려주는가** 다. 행 확인은 SQL Editor 에서 한다.
set -u
if [ "${PE_ENV:-dev}" = "prod" ]; then
  BASE="https://xnomlgydifiqiybervtf.supabase.co/functions/v1/api"
  KEY="${PROD_ANON:?PROD_ANON 환경변수가 필요합니다}"
else
  BASE="https://ktpwthwqzgcqcrmsafdo.supabase.co/functions/v1/api"
  KEY="${DEV_ANON:?DEV_ANON 환경변수가 필요합니다}"
fi

CALL_TMP=$(mktemp)
trap 'rm -f "$CALL_TMP"' EXIT

# ⚠️ 명령줄 리터럴 한글은 Git Bash/Windows 에서 깨져 도착한다 — body 는 UTF-8 파일로 보낸다.
call() {
  printf '%s' "$1" > "$CALL_TMP"
  curl -s -X POST "$BASE" -H "Content-Type: application/json" \
    -H "apikey: $KEY" -H "Authorization: Bearer $KEY" --data-binary @"$CALL_TMP"
}

pass=0; fail=0
chk() { # 이름, 실제, 기대
  if [ "$2" = "$3" ]; then echo "  ✓ $1 = $2"; pass=$((pass+1));
  else echo "  ✗ $1 = $2  (기대 $3)"; fail=$((fail+1)); fi
}

echo "■ 시험용 계정 (login 은 모르는 이름이면 계정을 만들어 준다)"
UID_JSON=$(call '{"action":"login","type":"교구","gu":"저녁","mok":"저녁","name":"저녁시험"}')
TEST_UID=$(echo "$UID_JSON" | grep -o '"user_id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -z "$TEST_UID" ]; then
  TEST_UID=$(echo "$UID_JSON" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
fi
if [ -z "$TEST_UID" ]; then echo "  ✗ 계정을 못 만들었다: $UID_JSON"; exit 1; fi
echo "  user_id=${TEST_UID:0:8}…"

echo "■ 끄기"
R=$(call "{\"action\":\"updatePushEvening\",\"user_id\":\"$TEST_UID\",\"on\":false}")
chk "ok"  "$(echo "$R" | grep -o '"ok":[a-z]*'  | cut -d: -f2)" "true"
chk "on"  "$(echo "$R" | grep -o '"on":[a-z]*'  | cut -d: -f2)" "false"

echo "■ 켜기"
R=$(call "{\"action\":\"updatePushEvening\",\"user_id\":\"$TEST_UID\",\"on\":true}")
chk "ok"  "$(echo "$R" | grep -o '"ok":[a-z]*'  | cut -d: -f2)" "true"
chk "on"  "$(echo "$R" | grep -o '"on":[a-z]*'  | cut -d: -f2)" "true"

echo "■ user_id 가 없으면 거절한다"
R=$(call '{"action":"updatePushEvening","on":true}')
chk "error" "$(echo "$R" | grep -o '"error":"[^"]*"' | cut -d'"' -f4)" "no-user"

echo "■ ⚠️ 응답에 user_id 가 새지 않는다"
R=$(call "{\"action\":\"updatePushEvening\",\"user_id\":\"$TEST_UID\",\"on\":true}")
if echo "$R" | grep -q "$TEST_UID"; then
  echo "  ✗ 응답에 user_id 가 들어 있다: $R"; fail=$((fail+1))
else
  echo "  ✓ 응답에 user_id 없음"; pass=$((pass+1))
fi

echo
echo "통과 $pass · 실패 $fail"
[ "$fail" -eq 0 ]
```

- [ ] **Step 2: 돌려서 실패를 본다**

Run: `DEV_ANON=<개발 anon 키> bash tests/push-evening-smoke.sh`
Expected: **FAIL** — `ok`·`on` 자리가 비고, `error` 가 `unknown action` 으로 나온다.
(개발 anon 키는 `js/config.js` 의 개발 분기에 있다.)

- [ ] **Step 3: SQL 파일을 만든다**

`supabase/push_evening.sql`:

```sql
-- 저녁 알림 on/off — 「저녁만 끄는 길」을 만든다 (2026-09-23, 0판)
--
-- ⚠️ 기본값은 true(켜짐)다. 지금 구독자는 34명뿐이라, 기본을 false 로 두면
--    저녁 알림이 사실상 아무에게도 안 간다. 대신 문구를 함께 고쳐(0판)
--    「아침·저녁 두 번」을 동의 시점에 알려 드린다.
--
-- ⚠️ 저녁 on/off 는 **사람 단위**다(시각 hour 는 기기 단위인 것과 다르다).
--    한 분이 웹과 아이폰을 함께 쓰시면 저녁은 둘 다 같이 꺼지는 것이 자연스럽다.
--
-- 개발 먼저, 운영 그다음.

alter table public.push_subscriptions
  add column if not exists evening boolean not null default true;

alter table public.ios_push_tokens
  add column if not exists evening boolean not null default true;

-- 저녁 발송이 이 칸으로 거르므로 인덱스를 함께 둔다(구독이 늘어나도 싸게 거른다).
create index if not exists idx_push_sub_evening on public.push_subscriptions(evening);
create index if not exists idx_ios_push_evening on public.ios_push_tokens(evening);

-- 확인:
--   select evening, count(*) from public.push_subscriptions group by evening;
--   select evening, count(*) from public.ios_push_tokens   group by evening;
```

- [ ] **Step 4: 개발 DB 에 돌린다**

Supabase 대시보드 → **개발 프로젝트 `ktpwthwqzgcqcrmsafdo`** → SQL Editor 에 위 파일을 붙여 실행.

⚠️ `supabase db query --linked` 를 쓰지 말 것 — **그것은 운영을 가리킨다**(`docs/notes/psalm-still-waters.md` 에
적힌 함정). 대시보드에서 **프로젝트 이름을 눈으로 확인하고** 실행한다.

확인: 같은 SQL Editor 에서
`select evening, count(*) from public.push_subscriptions group by evening;`
Expected: 행이 돌아온다(개발은 비어 있어 0행이어도 정상 — **오류만 안 나면 통과**).

- [ ] **Step 5: 서버 액션을 쓴다**

`supabase/functions/api/index.ts` 에서 `updateIosPushHour` 함수가 끝나는 곳(`return { ok: true, hour, updated: ... };` 와 닫는 `}`) **바로 아래**에 붙인다:

```ts
// ---------- updatePushEvening: 저녁 알림만 켜고 끄기 (2026-09-23, 0판) ----------
// ⚠️ 저녁 on/off 는 **사람 단위**다 — 시각(hour)이 기기 단위인 것과 다르다.
//    한 분이 웹과 아이폰을 함께 쓰시면 저녁은 둘 다 같이 꺼지는 것이 자연스럽다.
// ⚠️ 응답에 user_id 를 싣지 않는다(이 API 는 JWT 가 없다).
// ⚠️ evening 칸이 아직 없는 DB(함수가 먼저 올라간 순간)에서도 죽지 않아야 한다 —
//    savePush 의 hour 폴백과 같은 까닭이다. 그때는 ok:true, migrated:false 로 돌려준다.
async function updatePushEvening(b: any) {
  if (!b.user_id) return { ok: false, error: "no-user" };
  const on = b.on !== false;   // 기본은 켜짐 — 빠뜨린 호출이 사람을 조용히 끄면 안 된다
  let web = 0, ios = 0, migrated = true;
  const hit = async (table: string) => {
    const { data, error } = await db.from(table)
      .update({ evening: on }).eq("user_id", b.user_id).select("id");
    if (error) {
      if (/evening/i.test(String(error.message || ""))) { migrated = false; return 0; }
      throw error;
    }
    return (data ?? []).length;
  };
  web = await hit("push_subscriptions");
  ios = await hit("ios_push_tokens");
  return { ok: true, on, web, ios, migrated };
}
```

- [ ] **Step 6: 라우터에 한 줄 더한다**

같은 파일의 `case "updateIosPushHour": return json(await updateIosPushHour(body));` **바로 아래**:

```ts
      case "updatePushEvening": return json(await updatePushEvening(body));
```

- [ ] **Step 7: 개발에 배포한다**

⚠️ **배포 전에** 남의 커밋 안 된 헝크가 함께 나가는지 본다:

Run: `git diff HEAD -- supabase/functions/api/index.ts`
비어 있지 않으면(내 변경 말고 다른 것이 보이면) **멈추고 친구에게 알린다** — 그 헝크가 함께 배포된다.

Run: `supabase functions deploy api --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo`
Expected: `Deployed Functions on project ktpwthwqzgcqcrmsafdo`

- [ ] **Step 8: 스모크를 다시 돌려 통과를 본다**

Run: `DEV_ANON=<개발 anon 키> bash tests/push-evening-smoke.sh`
Expected: **통과 6 · 실패 0**

- [ ] **Step 9: 커밋**

```bash
git add supabase/push_evening.sql tests/push-evening-smoke.sh
git apply --cached <(git diff -- supabase/functions/api/index.ts)
git commit -m "feat(알림): 저녁 on/off 칸과 updatePushEvening 액션 — 0판

저녁 알림을 보내기 전에 「저녁만 끄는 길」부터 만든다. disablePush 는 구독
자체를 지우므로, 저녁이 성가신 분의 유일한 선택지가 아침까지 잃는 전체
해제였다(구독자 34명 — 한 분이 3%다).

evening 은 사람 단위다(시각 hour 는 기기 단위). 기본 true — 지금 켜 두신
분들이 그대로 받으시되 끌 수 있게.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git show --stat
```

Expected: `git show --stat` 에 **세 파일만** 보인다 — `supabase/push_evening.sql` ·
`tests/push-evening-smoke.sh` · `supabase/functions/api/index.ts`.
⚠️ 다른 파일이 보이면 **되돌린다**(`git reset --soft HEAD~1`) — 남의 작업이 딸려 온 것이다.

---

### Task 2: 프런트 저장소 계층 — `getPushEvening` / `setPushEvening`

**Files:**
- Modify: `js/api.js` — `updateIosPushHour` 줄 **바로 아래**
- Modify: `js/push.js` — `setPushHour` 함수와 `window.setPushHour = setPushHour;` **바로 아래**
- Create: `tests/push-evening-native.py`

**Interfaces:**
- Consumes: Task 1 의 액션 `updatePushEvening`
- Produces:
  - `window.getPushEvening(): boolean` — `localStorage["pushEvening"]` 이 `"0"` 이면 `false`, 그 밖엔 **`true`**
  - `window.setPushEvening(on: boolean): Promise<{updated: boolean, on: boolean}>`
  - `api.updatePushEvening(user_id: string, on: boolean): Promise<{ok, on, web, ios, migrated}>`
  - Task 3 의 `setupPushEvening()` 이 이 둘을 쓴다.

- [ ] **Step 1: ⚠️ 네이티브 분기 회귀 시험을 먼저 쓴다 (실패하는 시험)**

`tests/push-evening-native.py`:

```python
# -*- coding: utf-8 -*-
"""
저녁 알림 토글 — 네이티브(iOS) 분기 회귀 시험 (2026-09-23, 0판).

⚠️ 이 시험이 있는 까닭 — 2026-09-16 에 setPushHour 에 네이티브 분기가 없어서
   아이폰 앱 쓰시는 분이 알림 시간을 바꿔도 서버에 **조용히 반영이 안 됐다**.
   실기기를 보기 전까지 아무도 몰랐다. setPushEvening 은 같은 모양의 함수라
   같은 사고가 그대로 재현될 수 있다. 그 자리를 지키는 것이 이 파일이다.

⚠️ isNativeApp() 은 window.Capacitor 를 **부를 때마다** 읽으므로 스텁이 먹는다.
⚠️ api 는 js/api.js 의 `const api = {...}` + `window.api = api` 라 같은 객체다 —
   window.api.updatePushEvening 을 덮으면 push.js 안의 api 도 함께 덮인다.

사용법:  python tests/push-evening-native.py
"""
import subprocess, sys, time
from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = r"C:\Projects\bible-memorize-church-app-v2"
PORT = 8807
passed, failed = 0, 0


def chk(name, got, want):
    global passed, failed
    if got == want:
        print("  OK  %s = %r" % (name, got)); passed += 1
    else:
        print("  NG  %s = %r  (기대 %r)" % (name, got, want)); failed += 1


srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT)],
                       cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
try:
    with sync_playwright() as p:
        br = p.chromium.launch()
        pg = br.new_page()
        pg.goto("http://localhost:%d/index.html" % PORT)
        pg.wait_for_function("typeof window.setPushEvening === 'function'", timeout=15000)

        print("■ 기본값은 켜짐이다")
        chk("getPushEvening()", pg.evaluate("getPushEvening()"), True)

        print("■ 끄면 localStorage 에 남고 다시 읽힌다")
        pg.evaluate("localStorage.setItem('pushEvening','0')")
        chk("getPushEvening()", pg.evaluate("getPushEvening()"), False)
        pg.evaluate("localStorage.removeItem('pushEvening')")
        chk("지운 뒤 기본값", pg.evaluate("getPushEvening()"), True)

        print("■ ⚠️ 네이티브 앱이면 updatePushEvening 을 부른다 (2026-09-16 사고 재발 방지)")
        got = pg.evaluate("""async () => {
          window.Capacitor = { isNativePlatform: () => true };
          window.loadUser = () => ({ user_id: 'u-test' });
          let called = null;
          window.api.updatePushEvening = (uid, on) => { called = [uid, on]; return { ok: true, on }; };
          const r = await setPushEvening(false);
          return { called, updated: r.updated, on: r.on,
                   stored: localStorage.getItem('pushEvening') };
        }""")
        chk("액션을 불렀나", got["called"], ["u-test", False])
        chk("updated", got["updated"], True)
        chk("on", got["on"], False)
        chk("localStorage", got["stored"], "0")

        print("■ 로그인 전이면 서버를 안 부르고 로컬만 남긴다")
        got = pg.evaluate("""async () => {
          window.Capacitor = { isNativePlatform: () => true };
          window.loadUser = () => null;
          let called = false;
          window.api.updatePushEvening = () => { called = true; return { ok: true }; };
          const r = await setPushEvening(true);
          return { called, updated: r.updated, stored: localStorage.getItem('pushEvening') };
        }""")
        chk("서버를 안 불렀나", got["called"], False)
        chk("updated", got["updated"], False)
        chk("localStorage", got["stored"], "1")

        br.close()
finally:
    srv.terminate()

print("\n통과 %d · 실패 %d" % (passed, failed))
sys.exit(0 if failed == 0 else 1)
```

- [ ] **Step 2: 돌려서 실패를 본다**

Run: `python tests/push-evening-native.py`
Expected: **FAIL** — `wait_for_function` 이 15초 뒤 `TimeoutError` 로 죽는다
(`window.setPushEvening` 이 아직 없다).

- [ ] **Step 3: `js/api.js` 에 래퍼 한 줄**

`updateIosPushHour` 줄 **바로 아래**에:

```js
  updatePushEvening: (user_id, on) => supaCall("updatePushEvening", { user_id, on }),  // 저녁 알림만 켜고 끄기(사람 단위)
```

- [ ] **Step 4: `js/push.js` 에 두 함수**

`window.setPushHour = setPushHour;` **바로 아래**에 붙인다:

```js
// 저녁 알림(20시)을 받을지 — 기본 켜짐. localStorage 에 보관.
// ⚠️ 기본이 「켜짐」이다. 값이 없거나 못 읽으면 true 로 본다 — 읽기 실패가
//    성도님을 조용히 끄면 안 된다(사파리 프라이빗 모드 등).
function getPushEvening() {
  try { return localStorage.getItem("pushEvening") !== "0"; }
  catch (e) { return true; }
}
window.getPushEvening = getPushEvening;

// 저녁 알림 켜고 끄기 — 로컬 저장 + (로그인돼 있으면) 서버 반영.
// ⚠️ 네이티브 앱도 웹도 **같은 액션**을 쓴다. 서버가 두 표를 함께 고치기 때문이다.
//    setPushHour 는 웹푸시 구독(endpoint)이 있어야 해서 분기가 필요했지만,
//    저녁은 사람 단위라 user_id 하나면 된다 — 그래서 여기엔 분기가 없다.
//    (2026-09-16 에 setPushHour 의 네이티브 분기가 없어 조용히 무시된 사고가 있었다.
//     이 함수가 그 함정을 피하는 방식이 「분기를 두는 것」이 아니라 「분기가 필요 없게 만든 것」이다.
//     회귀 시험: tests/push-evening-native.py)
async function setPushEvening(on) {
  on = on !== false;
  try { localStorage.setItem("pushEvening", on ? "1" : "0"); } catch (e) {}
  const u = (typeof loadUser === "function") ? loadUser() : null;
  if (u && u.user_id) {
    try {
      const r = await api.updatePushEvening(u.user_id, on);
      if (r && r.ok) return { updated: true, on };
    } catch (e) {}
  }
  return { updated: false, on };
}
window.setPushEvening = setPushEvening;
```

- [ ] **Step 5: 문법을 본다**

Run: `node --check js/push.js && node --check js/api.js`
Expected: 아무것도 안 나온다(성공).

- [ ] **Step 6: 시험을 다시 돌려 통과를 본다**

Run: `python tests/push-evening-native.py`
Expected: **통과 10 · 실패 0**

- [ ] **Step 7: 커밋**

```bash
git add tests/push-evening-native.py
git apply --cached <(git diff -- js/push.js js/api.js)
git commit -m "feat(알림): 저녁 토글의 프런트 저장소 계층 — 0판

setPushEvening 은 사람 단위(user_id)라 네이티브 분기가 아예 필요 없다.
2026-09-16 에 setPushHour 가 분기를 빠뜨려 아이폰에서 조용히 무시된 사고가
있었고, 같은 모양의 함수를 새로 만드는 자리라 회귀 시험을 함께 둔다.

기본은 켜짐이고, localStorage 를 못 읽어도 켜짐으로 본다 — 읽기 실패가
성도님을 조용히 끄면 안 된다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git show --stat
```

Expected: **세 파일만** — `tests/push-evening-native.py` · `js/push.js` · `js/api.js`.

---

### Task 3: 설정 화면 토글

**Files:**
- Modify: `app.js` — 설정 화면의 `pushhour-row` 블록 **바로 아래**에 새 `setting-block`,
  그리고 `setupPushHour();` 줄 **바로 아래**에 `setupPushEvening();`,
  그리고 `function setupPushHour() {…}` 가 끝난 **바로 아래**에 새 함수

**Interfaces:**
- Consumes: Task 2 의 `window.getPushEvening()` · `window.setPushEvening(on)`
- Produces: DOM id `pushevening-row`(버튼 둘) · `pushevening-msg` · 함수 `setupPushEvening()`

- [ ] **Step 1: 설정 화면에 블록을 더한다**

`app.js` 에서 아래 블록을 찾는다(문자열로 찾을 것 — ⚠️ **줄 번호는 다른 세션이 고치는 중이라 밀린다**):

```
          <div id="pushhour-msg" class="btn-sub" style="text-align:center;color:#2f6b4f;min-height:16px"></div>
        </div>
```

그 `</div>` **바로 아래**에 붙인다:

```html
        <div class="setting-block">
          <div class="setting-label">🌙 저녁 알림</div>
          <div class="tts-rate-row" id="pushevening-row">
            <button data-evening="1">저녁 8시에도 받기</button>
            <button data-evening="0">아침에만 받기</button>
          </div>
          <div id="pushevening-msg" class="btn-sub" style="text-align:center;color:#2f6b4f;min-height:16px"></div>
        </div>
```

> ⚠️ `tts-rate-row` 클래스를 그대로 쓴다 — 이 저장소에서 「한 줄에 놓인 고르기 단추」의 공통 꼴이다
> (`pushhour-row`·`fontsize-row` 도 같다). 새 클래스를 만들면 어두운 모드·「아주 큼」 글씨에서
> 혼자 어긋난다.

- [ ] **Step 2: 배선 한 줄**

`app.js` 에서 `  setupPushHour();` 를 찾아 **바로 아래**에:

```js
  setupPushEvening();
```

- [ ] **Step 3: 배선 함수를 쓴다**

`function setupPushHour() { … }` 가 끝나는 `}` **바로 아래**에 붙인다:

```js
// 저녁 알림(20시) 켜고 끄기 — 고르면 즉시 서버 반영(로그인돼 있을 때).
// ⚠️ setupPushHour 와 같은 꼴을 지킨다(sync → 저장 중 → 결과 문구).
function setupPushEvening() {
  const row = document.getElementById("pushevening-row");
  if (!row) return;
  const msg = document.getElementById("pushevening-msg");
  const btns = Array.from(row.querySelectorAll("button"));
  const cur = (typeof getPushEvening === "function") ? getPushEvening() : true;
  const sync = (on) => btns.forEach((b) => b.classList.toggle("on", (b.dataset.evening === "1") === on));
  sync(cur);
  btns.forEach((b) => {
    b.addEventListener("click", async () => {
      const on = b.dataset.evening === "1";
      sync(on);
      if (msg) msg.textContent = "저장 중...";
      let r = { updated: false, on };
      if (typeof setPushEvening === "function") r = await setPushEvening(on);
      if (msg) msg.textContent = r.updated
        ? (on ? "✅ 저녁 8시에도 보내 드릴게요." : "✅ 아침에만 보내 드릴게요.")
        : (on ? "저녁 8시에도 받도록 해 두었어요. 아래 '알림 받기'를 켜면 적용돼요."
              : "아침에만 받도록 해 두었어요. 아래 '알림 받기'를 켜면 적용돼요.");
    });
  });
}
```

- [ ] **Step 4: 문법을 본다**

Run: `node --check app.js`
Expected: 아무것도 안 나온다.

- [ ] **Step 5: 눈으로 본다**

Run: `python -m http.server 8808`
브라우저에서 `http://localhost:8808/index.html` → 로그인 → **⚙️ 설정** → 아래로 내린다.

확인할 것 넷:
1. 「🌙 저녁 알림」 블록이 「🕖 알림 시간」 **바로 아래**에 있다
2. 처음 들어가면 **「저녁 8시에도 받기」가 켜진 모양**(`.on`)이다
3. 「아침에만 받기」를 누르면 문구가 바뀌고, **새로고침해도 그대로**다
4. 화면 오른쪽 위에 **「개발 DB」 띠**가 보인다 — 안 보이면 운영을 보고 있는 것이니 **멈춘다**

- [ ] **Step 6: 커밋**

```bash
git apply --cached <(git diff -- app.js)
git commit -m "feat(알림): 설정에 저녁 알림 토글 — 0판

저녁만 끄는 길을 성도님 손에 드린다. 지금은 disablePush 가 구독 자체를
지워서, 저녁이 싫은 분이 아침까지 잃는 것 말고는 방법이 없었다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git show --stat
```

Expected: **`app.js` 하나만.** ⚠️ 다른 파일이 보이면 되돌린다 — 남의 작업이 딸려 온 것이다.

---

### Task 4: 「아침만」이라 약속한 일곱 곳을 고친다

**Files:**
- Modify: `js/push.js` — `enablePush` 의 성공 안내
- Modify: `app.js` — 네 곳(알림 권유 카드 · 설정 라벨 · `enable-push` 부제 · 사용 설명서 두 줄)
- Modify: `privacy/index.html` — 표의 이용 목적 칸

**Interfaces:**
- Consumes: Task 2 의 `getPushEvening()`(성공 안내가 저녁 여부를 읽는다)
- Produces: 없음(문구만)

> ⚠️ **왜 이 Task 가 0판에 있나** — 저녁 알림이 한 통이라도 나가면 이 일곱 문구가 **거짓**이 된다.
> 그중 `privacy/index.html` 은 **로그인 없이 열리는 공개 방침**이고 플레이스토어 심사에 낸 문서다.
> CLAUDE.md 가 「모으는 것을 하나라도 빠뜨리면 그게 심사 반려 사유이고, 성도님께 사실이 아닌 말을
> 한 것이 된다」고 적어 둔 그 자리를, 이번엔 **보내는 것** 쪽에서 밟는 셈이 된다.

- [ ] **Step 1: `js/push.js` 성공 안내**

찾는다:

```js
    appAlert("🔔 알림이 설정되었습니다!\n매일 오전 " + hour + "시에 오늘의 묵상을 보내드려요.\n방금 오늘의 묵상을 이 기기로 보냈어요 — 잠시 후 확인해보세요.");
```

바꾼다:

```js
    const eveOn = (typeof getPushEvening === "function") ? getPushEvening() : true;
    appAlert("🔔 알림이 설정되었습니다!\n매일 오전 " + hour + "시"
      + (eveOn ? "와 저녁 8시" : "") + "에 말씀을 보내드려요."
      + (eveOn ? "\n(저녁은 ⚙️ 설정에서 끄실 수 있어요)" : "")
      + "\n방금 오늘의 묵상을 이 기기로 보냈어요 — 잠시 후 확인해보세요.");
```

- [ ] **Step 2: `app.js` — 알림 권유 카드**

찾는다: `<div class="pn-title">🔔 매일 아침, 오늘의 묵상을 받아보세요</div>`
바꾼다: `<div class="pn-title">🔔 아침·저녁, 오늘의 묵상을 받아보세요</div>`

바로 아래 줄도 함께 — 찾는다:
`<div class="pn-sub">하루 한 구절 · 짧은 묵상으로 하루를 시작해요</div>`
바꾼다:
`<div class="pn-sub">하루 한 구절 · 아침에 한 번, 저녁 8시에 한 번</div>`

- [ ] **Step 3: `app.js` — 설정 라벨**

찾는다: `<div class="setting-label">🕖 알림 시간 (아침)</div>`
바꾼다: `<div class="setting-label">🕖 아침 알림 시간</div>`

- [ ] **Step 4: `app.js` — `enable-push` 단추 부제**

찾는다:
```html
<button class="summary-install" id="enable-push">🔔 매일 암송 알림 받기<br><span class="btn-sub">( 매일 아침 · 위에서 시간 선택 )</span></button>
```
바꾼다:
```html
<button class="summary-install" id="enable-push">🔔 매일 암송 알림 받기<br><span class="btn-sub">( 아침 · 저녁 두 번 · 위에서 아침 시간 선택 )</span></button>
```

- [ ] **Step 5: `app.js` — 사용 설명서 두 줄**

⚠️ **손대기 전에 `docs/notes/manual-guide.md` 를 읽는다** — 설명서는 인쇄물(`guide/`)과 짝이라
문구를 바꾸면 그쪽도 볼 것이 있는지 그 문서가 말해 준다.

찾는다: `lead: "아침에 오늘의 말씀을 알려 드려요.",`
바꾼다: `lead: "아침과 저녁에 오늘의 말씀을 알려 드려요.",`

찾는다: `"알림 받을 시간(<b>아침 5~8시</b>)은 <b>⚙️ 설정</b>에서 고를 수 있어요.",`
바꾼다: `"아침 시간(<b>5~8시</b>)과 <b>저녁 알림 끄기</b>는 <b>⚙️ 설정</b>에서 고를 수 있어요.",`

- [ ] **Step 6: `privacy/index.html`**

찾는다: `    <td>아침 말씀 알림을 그 기기로 보내기 위해</td>`
바꾼다: `    <td>말씀 알림(아침·저녁)을 그 기기로 보내기 위해</td>`

⚠️ CLAUDE.md 개인정보 절대로 **앱 안 개인정보 화면과 두 곳을 함께** 본다.
앱 안 화면은 「**알림을 켜실 때만** 그 기기로 알림을 보내기 위한 등록 정보」라고만 적어
시각을 말하지 않는다 — **고칠 것이 없다.** 확인만 하고 지나간다:

Run: `grep -n "알림을 켜실 때만" app.js`
Expected: 한 줄이 나오고, 그 줄에 「아침」이 **없다**.

- [ ] **Step 7: 남은 「아침만」 약속이 없는지 훑는다**

Run: `grep -n "아침" app.js js/push.js privacy/index.html`
Expected: 남는 것은 **아침 시각을 말하는 자리뿐**이어야 한다 —
「🕖 아침 알림 시간」 · 「아침 · 저녁 두 번 · 위에서 아침 시간 선택」 · 「아침과 저녁에 …」 ·
「아침 시간(5~8시)과 …」 · 「아침·저녁, 오늘의 묵상을 …」 · 「아침에 한 번, 저녁 8시에 한 번」.
⚠️ **「아침만」·「매일 아침」처럼 저녁을 배제하는 표현이 하나라도 남으면 이 Task 는 안 끝난 것이다.**
(구절 입력 시각을 말하는 주석 `// 실측: … 일요일 아침 한 번` 과 시편 액자의 `tip: "짧아서 아침에 한 번
읽기 좋습니다."` 는 알림과 무관하니 **그대로 둔다.**)

- [ ] **Step 8: 문법을 본다**

Run: `node --check app.js && node --check js/push.js`
Expected: 아무것도 안 나온다.

- [ ] **Step 9: 커밋**

```bash
git apply --cached <(git diff -- app.js js/push.js privacy/index.html)
git commit -m "fix(알림): 「아침만」이라 약속한 일곱 곳을 아침·저녁으로

저녁 알림이 한 통이라도 나가면 이 문구들이 거짓이 된다. 그중
privacy/index.html 은 로그인 없이 열리는 공개 방침이고 플레이스토어 심사에
낸 문서다 — 보내는 것 쪽에서 「사실이 아닌 말」을 하게 되는 자리였다.

성공 안내는 getPushEvening() 을 읽어, 저녁을 끄신 분께는 저녁 이야기를
하지 않는다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git show --stat
```

Expected: **세 파일만** — `app.js` · `js/push.js` · `privacy/index.html`.

---

### Task 5: 틀린 UTC ⚠️ 를 정정한다

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/analysis/2026-09-23-usage-analysis.md`
- Modify: `docs/analysis/2026-09-23-usage-analysis.html`
- Modify: `supabase/functions/api/index.ts` — `weeklyVerseKst` 머리 주석

**Interfaces:** 없음(문서만)

> ⚠️ **왜 고쳐야 하나** — CLAUDE.md 는 **매 세션 통째로 읽힌다.** 지금 거기 적힌
> 「아침 알림(`latestVerse()`)은 아직 UTC 자정 기준」은 **틀렸다.** 그대로 두면 다음 세션이
> 「고치러」 가고, `latestVerse` 를 `weeklyVerseKst` 로 갈아끼워 **날짜 없는 구절을 주일 아침
> 전체 발송에 실어 보내는** 되돌릴 수 없는 사고를 만든다. 근거는 설계 문서 맨 앞 절이다.

- [ ] **Step 1: `CLAUDE.md`**

찾는다:
```
      ⚠️ **아침 알림(`latestVerse()`)은 아직 UTC 자정 기준**이라 구절이 바뀌는 날 0~9시에는 지난 구절을 쓴다 —
      위젯 쪽만 한국 날짜로 고쳤다(`weeklyVerseKst`). 알림도 고칠지는 정하지 않았다.
```
바꾼다:
```
      ⚠️ **「아침 알림이 UTC 자정 기준」은 틀린 말이었다(2026-09-23 정정).** `verses.date` 가 항상
      KST 자정 순간으로 저장돼(관리자 폼이 `+09:00` 을 붙인다) `latestVerse()` 도 KST 자정에 넘어간다 —
      2,232시간을 매시 대조해 불일치 0건. ⚠️ **`weeklyVerseKst` 로 갈아끼우지 말 것** — 그쪽은 날짜
      없는 구절을 「오늘 것」으로 보아, 주일 아침 전체 발송이 아직 시작 안 한 구절을 뿌린다.
      읽을 것 `docs/superpowers/specs/2026-09-23-evening-push-design.md` 맨 앞 절.
```

- [ ] **Step 2: `docs/analysis/2026-09-23-usage-analysis.md`**

찾는다:
```
⚠ **알림을 늘리기 전에 먼저 고칠 것** — `latestVerse()`가 아직 **UTC 자정 기준**이라
구절이 바뀌는 날 0~9시에는 **지난 구절**을 보낸다(위젯 쪽만 `weeklyVerseKst`로 고쳤다).
저녁 알림은 이 버그 구간에 안 걸리지만, 아침 알림을 손댈 때 함께 고치는 것이 맞다.
```
바꾼다:
```
⚠ **정정(2026-09-23)** — 위에 적었던 「`latestVerse()`가 UTC 자정 기준이라 0~9시에 지난 구절을
보낸다」는 **틀린 말이었다.** `verses.date` 는 항상 KST 자정 순간으로 저장되므로(관리자 폼이
`+09:00` 을 붙인다 · 운영 38건 전부 `T15:00:00+00:00`) `Date.parse` 비교가 KST 자정에 정확히
넘어간다. 2,232시간을 매시 대조해 **불일치 0건**. 어긋나는 것은 SQL Editor 에서 날짜만 손으로
넣은 행뿐이다. ⚠️ `weeklyVerseKst` 로 갈아끼우면 **오히려** 날짜 없는 구절을 주일 아침 전체
발송에 실어 보낸다. 근거와 진짜 방어책은
`docs/superpowers/specs/2026-09-23-evening-push-design.md` 맨 앞 절.
```

- [ ] **Step 3: `docs/analysis/2026-09-23-usage-analysis.html` — 두 자리**

이 파일은 `.md` 의 HTML 판이다. 두 곳을 찾아 같은 뜻으로 고친다.

Run: `grep -n "UTC 자정" docs/analysis/2026-09-23-usage-analysis.html`
Expected: 두 줄이 나온다(3순위 절 안의 ⚠ 하나, 맨 뒤 「알게 된 것」 목록 하나).

첫째 — `<b>UTC 자정 기준</b>이라 구절이 바뀌는 날 0~9시에는 <b>지난 구절</b>을 보낸다`
가 들어 있는 문단 전체를 아래로 바꾼다:
```html
    <b>정정(2026-09-23)</b> — 위에 적었던 「latestVerse()가 UTC 자정 기준」은 <b>틀린 말이었다</b>.
    verses.date 가 항상 KST 자정 순간으로 저장되어(관리자 폼이 +09:00 을 붙인다) KST 자정에 정확히
    넘어간다 — 2,232시간 매시 대조 <b>불일치 0건</b>.
    <code>weeklyVerseKst</code> 로 갈아끼우면 오히려 날짜 없는 구절이 주일 아침 전체 발송에 실린다.
```

둘째 — `<li><b>아침 알림이 UTC 자정 기준이라는 것</b> · 위젯만 <code>weeklyVerseKst</code>로 고침` 로
시작하는 `<li>` 를 아래로 바꾼다:
```html
  <li><b>「아침 알림이 UTC 자정 기준」은 틀린 말이었다</b>(2026-09-23 정정 · 불일치 0건)
```

- [ ] **Step 4: `supabase/functions/api/index.ts` — `weeklyVerseKst` 머리 주석**

찾는다:
```ts
//   ⚠️ latestVerse() 는 시각(UTC 자정)으로 골라 구절이 바뀌는 날 0~9시에 앱과 달랐다.
//      아침 알림 등 latestVerse() 를 쓰는 기존 경로는 그대로 둔다(범위 밖).
```
바꾼다:
```ts
//   ⚠️ 2026-09-23 정정 — 「latestVerse() 는 UTC 자정으로 골라 앱과 달랐다」는 **틀린 말이었다**.
//      verses.date 가 항상 KST 자정 순간이라 Date.parse 비교도 KST 자정에 넘어간다(2,232시간 대조·불일치 0건).
//      ⚠️ 그래도 latestVerse() 를 이 함수로 갈아끼우지 말 것 — 이 함수는 날짜 없는 구절을 「오늘 것」으로
//      보므로(아래 dayOf), 주일 아침 weeklyVersePush 가 아직 시작 안 한 구절을 전체 구독자에게 뿌린다.
//      읽을 것: docs/superpowers/specs/2026-09-23-evening-push-design.md 맨 앞 절.
```

- [ ] **Step 5: 남은 틀린 말이 없는지 훑는다**

Run: `grep -rn "UTC 자정 기준" CLAUDE.md docs/ supabase/functions/api/index.ts`
Expected: 남는 줄은 **전부 「틀린 말이었다」는 정정 문맥 안**이어야 한다.

- [ ] **Step 6: 문법을 본다**

Run: `node --check app.js`
Expected: 아무것도 안 나온다(이 Task 는 `app.js` 를 안 고치지만, 다른 세션이 같은 파일을
고치는 중이라 커밋 직전에 한 번 확인한다).

- [ ] **Step 7: 커밋**

```bash
git apply --cached <(git diff -- CLAUDE.md docs/analysis/2026-09-23-usage-analysis.md docs/analysis/2026-09-23-usage-analysis.html supabase/functions/api/index.ts)
git commit -m "docs: latestVerse UTC 자정 버그는 없었다 — 네 곳 정정

CLAUDE.md 는 매 세션 통째로 읽힌다. 거기 적힌 「아침 알림은 아직 UTC 자정
기준」을 그대로 두면 다음 세션이 고치러 가고, latestVerse 를 weeklyVerseKst
로 갈아끼워 날짜 없는 구절이 주일 아침 전체 발송에 실리는 되돌릴 수 없는
사고를 만든다.

verses.date 는 항상 KST 자정 순간이다(관리자 폼이 +09:00 을 붙인다 · 운영
38건 전부 T15:00:00+00:00). 2,232시간을 매시 대조해 불일치 0건.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git show --stat
```

Expected: **네 파일만.**

---

### Task 6: 운영 배포

**Files:** 없음(배포와 확인만). 단 `python tools/bump.py` 가 `index.html`·`app.js`·`admin.html` 을 고친다.

**Interfaces:** Consumes: Task 1~5 전부

> ⚠️ **이 Task 를 시작하기 전에 친구에게 확인을 받는다.** 여기서부터 운영이다.

- [ ] **Step 1: ⚠️ 작업 트리를 먼저 본다 — 남의 것이 함께 나가는지**

Run: `git status --short`

두 가지를 본다:
1. `git diff HEAD -- supabase/functions/api/index.ts` 가 **비어 있어야** 한다.
   비어 있지 않으면 **멈춘다** — `supabase functions deploy` 는 git 이 아니라 **작업 트리**를 올리므로
   남의 커밋 안 된 코드가 운영에 함께 나간다.
2. `git diff HEAD -- admin.html` 이 **비어 있어야** 한다.
   비어 있지 않으면 **멈춘다** — `tools/bump.py` 가 `admin.html` 의 `admin-stats.html?v=` 를 고치는데,
   같은 줄에 남의 변경이 있으면 `git apply --cached` 로도 못 가른다.
   → 친구에게 그 헝크를 먼저 커밋해 달라고 한다.

- [ ] **Step 2: 운영 DB 에 SQL 을 돌린다**

Supabase 대시보드 → **운영 프로젝트 `xnomlgydifiqiybervtf`** → SQL Editor →
`supabase/push_evening.sql` 을 붙여 실행.

⚠️ 프로젝트 이름을 **눈으로 확인**하고 실행한다. `supabase db query --linked` 를 쓰지 않는다.

확인: `select evening, count(*) from public.push_subscriptions group by evening;`
Expected: `true` 한 줄에 **33 근처**(웹 구독 수). `false` 행은 없어야 한다.

확인: `select evening, count(*) from public.ios_push_tokens group by evening;`
Expected: `true` 한 줄에 **14 근처**.

⚠️ `false` 가 하나라도 있으면 **멈춘다** — `default true` 가 안 먹은 것이다.

- [ ] **Step 3: Edge Function 을 운영에 배포한다**

Run: `supabase functions deploy api --no-verify-jwt --project-ref xnomlgydifiqiybervtf`
Expected: `Deployed Functions on project xnomlgydifiqiybervtf`

- [ ] **Step 4: 운영에서 스모크를 돌린다**

Run: `PE_ENV=prod PROD_ANON=sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl- bash tests/push-evening-smoke.sh`
Expected: **통과 6 · 실패 0**

⚠️ 이 시험은 운영 DB 에 「저녁/저녁/저녁시험」이라는 **시험용 계정을 하나 만든다.**
끝나면 SQL Editor 에서 지운다:
```sql
delete from public.users where name = '저녁시험' and gu = '저녁';
```
확인: `select count(*) from public.users where name = '저녁시험';` → `0`

- [ ] **Step 5: 판 번호를 올린다**

Run: `python tools/bump.py`
Expected: `APP_BUILD <새 태그>` 가 찍히고, `index.html`·`app.js`·`admin.html` 이 바뀐다.

⚠️ **손으로 고치지 않는다.** 그리고 이 판에서 **한 번만** 돌린다.

- [ ] **Step 6: preflight 로 막힌 데가 없는지 본다**

Run: `python tools/preflight.py`
Expected: 전부 ✓ (문법 · 캐시태그 · `APP_BUILD` 일치).
⚠️ 하나라도 걸리면 Actions 가 **배포 단계를 아예 안 돌린다** — 여기서 고친다.

- [ ] **Step 7: 커밋하고 푸시한다**

```bash
git apply --cached <(git diff -- index.html app.js admin.html)
git commit -m "chore(판): 저녁 알림 토글 · 아침·저녁 문구 — 0판

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git show --stat
git push
```

Expected: `git show --stat` 에 **세 파일만** — `index.html` · `app.js` · `admin.html`.

- [ ] **Step 8: ⚠️ 「이번 판에만 있는 표식」으로 배포를 확인한다**

이전 판에도 있던 이름(함수명·클래스명)으로 검사하면 CDN 이 옛 파일을 내보내도 통과해
「배포 완료」로 오인한다(2026-08-25 에 두 번 그랬다).

```bash
V=$(grep -o 'app.js?v=[0-9a-z]*' index.html | head -1 | cut -d= -f2)
curl -s "https://gocheok.onlybible.kr/app.js?v=$V" | grep -o 'APP_BUILD = "[0-9a-z]*"'
```
Expected: `index.html` 의 `?v=` 와 **같은 값**.

그리고 이번 판에만 있는 문구로 한 번 더:
```bash
curl -s "https://gocheok.onlybible.kr/app.js?v=$V" | grep -c "pushevening-row"
curl -s "https://gocheok.onlybible.kr/privacy/" | grep -c "말씀 알림(아침·저녁)"
```
Expected: 둘 다 **1 이상**.

- [ ] **Step 9: 폰으로 한 번 본다**

`gocheok.onlybible.kr` → 로그인 → ⚙️ 설정 → 「🌙 저녁 알림」이 보이고 「저녁 8시에도 받기」가 켜져 있다.
「아침에만 받기」를 눌렀다가 다시 「저녁 8시에도 받기」로 돌려 둔다(기본이 켜짐이어야 한다).

⚠️ **아직 저녁 알림은 한 통도 안 나간다** — 크론은 3판에서 건다.
성도님께는 설정 항목 하나와 문구만 바뀐 것으로 보인다.

- [ ] **Step 10: 다음 판으로 넘길 것을 적는다**

`CLAUDE.md` 의 「다음 작업」에 한 줄 더한다:

```
- [ ] 🌙 **저녁 알림 — 0판(문구·토글) 배포됨(2026-09-23).** 남은 것 1판(sendPush 수술)·2판(eveningPush)·
      3판(크론)·4판(완료 창 초대). ⚠️ 4판은 `b3598f5`(완료 창의 「다음」 수리)가 먼저 나간 뒤에.
      읽을 것 `docs/superpowers/specs/2026-09-23-evening-push-design.md`
```

```bash
git apply --cached <(git diff -- CLAUDE.md)
git commit -m "docs: 다음 작업에 저녁 알림 남은 판 적기

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git show --stat
git push
```

---

## 이 판에서 **하지 않는 것**

| 무엇 | 어느 판 |
|---|---|
| `sendPush` 에 `only`·`userBodies`·`user_id` 더하기 | 1판 |
| `eveningPush` 액션 | 2판 |
| `evening` 칸을 **실제로 읽는** 발송 코드 | 2판 (0판은 칸만 만든다) |
| 크론 등록 | 3판 |
| 완료 창의 알림 초대 · `push-invite` 계측 | 4판 |
| `reviews` 시편 오염 멈추기 | 별도 과제 |
| `weeklyVersePush` skip 을 `!v || !v.date` 로 | 별도 과제 |

⚠️ **0판이 끝나도 저녁 알림은 한 통도 안 나간다.** 그것이 이 판의 뜻이다 —
사람에게 닿는 것을 뒤로 미루고, 되돌릴 수 있는 것을 먼저 놓는다.
