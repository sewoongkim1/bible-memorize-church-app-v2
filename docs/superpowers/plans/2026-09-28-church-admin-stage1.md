# 교회 어드민 1단계(뼈대·카카오 로그인·담당자 관리) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 새 저장소 `church-admin`(admin.onlybible.kr)에 카카오 로그인 → 승인 대기 → 역할별 메뉴가 도는 뼈대를 세우고, 총괄 관리자가 담당자를 승인·역할·정지하는 화면까지 운영에 올린다. 사역신청 메뉴는 2단계부터 옮긴다.

**Architecture:** 빌드 없는 브라우저 ES 모듈 화면 + Supabase Auth(카카오) + 새 Edge Function `church-admin`. 함수는 요청마다 `auth.getUser(토큰)`로 사람을 확인하고, `admin_members`/`admin_role_grants` 로 역할을 본 뒤 `authz.ts` 의 `ACTION_ROLES` 표로 액션을 허락한다. 권한 규칙(`authz.ts`)은 순수 함수라 Node 시험이 같은 파일을 읽는다.

**Tech Stack:** Vanilla JS(ES 모듈) · supabase-js 2.117.2(jsdelivr ESM) · Supabase Edge Function(Deno) · Postgres · Node 22 내장 시험(`node --test --experimental-strip-types`) · Python 3(preflight·stamp) · GitHub Pages(Actions)

**설계:** `docs/superpowers/specs/2026-09-28-church-admin-design.md`(이 저장소)

## Global Constraints

- 새 저장소: `sewoongkim1/church-admin`, 로컬 `C:\Projects\church-admin`. 공개 저장소 — **비밀 키·담당자 이름을 커밋하지 않는다.**
- 운영 Supabase `xnomlgydifiqiybervtf`, 개발 `ktpwthwqzgcqcrmsafdo`. **SQL·함수는 언제나 개발 먼저.**
- 운영은 주소가 정확히 `admin.onlybible.kr` 일 때만. 그 밖의 모든 주소는 개발 + 「개발 DB」 띠.
- supabase CLI 는 저장소 밖 작업 폴더로만 link 한다: 개발 `C:/Users/sewki/.church-admin/supa-dev`, 운영 `C:/Users/sewki/.church-admin/supa-prod`. **저장소 루트 link 금지.** 어느 쪽인지 `select count(*) from users` 로 확인(사백 넘으면 운영, 스물 남짓이면 개발).
- 개발 비밀 값은 `C:/Users/sewki/.church-admin/dev.env` 에만(저장소 밖): `DEV_URL`·`DEV_ANON`·`DEV_SERVICE_KEY`.
- 화면 표준(관리 화면 표준 v1): 주 동작 48px 남색 채움 · 보조 44px ghost(`#eef3fb`+`#a9c3e8`) · 위험 44px(`#fdeceb`+`#e7b3ad`) · 칩 36px · 작은 글씨 13px 이상, 회색은 `#6b778c` 까지 · 확인·알림은 공용 창만(브라우저 `confirm/alert/prompt` 금지).
- 서버 답은 셋으로 나눈다: `{ok:true,…}` / `{ok:false, confirm, message}` / `{ok:false, error, code?}`. 화면 `call()` 은 **던지지 않는다.**
- `admin_*` 표는 RLS 켜고 `anon`·`authenticated` 권한을 뺀다. 응답에 `auth_user_id` 를 싣지 않는다.
- 역할 목록의 원본은 `admin_roles` 표 하나. 코드·CHECK 에 역할 목록을 박지 않는다(액션→필요 역할 표 `ACTION_ROLES` 는 예외 — 그것이 권한 규칙 자체다).
- 답·문구·주석은 한글. 성도님께 보이는 문구는 「~해요」체.

---

## 파일 구조 (새 저장소 `C:\Projects\church-admin`)

| 파일 | 맡는 일 |
|---|---|
| `index.html` | 껍데기 한 장. `<!--IMPORTMAP-->` 표식(배포 때 stamp 가 채움) |
| `package.json` | `"type":"module"` 과 시험 명령만(꾸러미 없음) |
| `CLAUDE.md` | 이 저장소의 지도·함정 |
| `css/tokens.css` · `css/admin.css` | 색·크기 토큰 / 표준 v1 부품 |
| `js/core/config.js` | 주소 → 개발/운영 Supabase, 개발 띠 (고전 스크립트) |
| `js/core/auth.js` | supabase-js 클라이언트, 카카오 로그인·로그아웃, 돌아올 화면 기억 |
| `js/core/api.js` | `call(action, payload)` — 서버 호출, 권한 잃음 알림 |
| `js/core/router.js` | `#/메뉴/하위?조건` 해석 |
| `js/core/ui.js` | `esc`·`affiliation`·`kstTime`·`toast`·`dialog`·`busy`·`errorText` |
| `js/screens/gate.js` | 로그인·등록·대기·정지·오류 화면 |
| `js/menus/registry.js` | 메뉴 목록·`menusFor(roles)` |
| `js/menus/system/members.js` · `audit.js` | 담당자·역할 / 바꾼 기록 |
| `js/main.js` | 부팅·껍데기(머리줄·메뉴)·길 찾기 |
| `supabase/config.toml` | CLI 최소 설정 |
| `supabase/functions/church-admin/authz.ts` | 권한·신원 규칙(순수) |
| `supabase/functions/church-admin/index.ts` | 서버 함수 |
| `supabase/sql/001_admin_tables.sql` | 표 넷 + RLS + 역할 씨앗 |
| `supabase/sql/check-authenticated-exposure.sql` | 로그인 사용자가 읽는 표 점검 |
| `tests/authz.test.mjs` · `router.test.mjs` · `ui.test.mjs` · `registry.test.mjs` | 순수 함수 시험(preflight) |
| `tests/server.dev.test.mjs` | 개발 서버 권한 표 시험(손으로) |
| `tests/seed-dev.mjs` | 개발 DB 화면 확인용 대기 담당자 넣기/지우기 |
| `tools/preflight.py` · `tools/stamp.py` | 배포 전 점검 / 파일마다 캐시 해시 |
| `.github/workflows/deploy.yml` | preflight → stamp → Pages |

---

### Task 1: 카카오 로그인 사전 확인(개발 프로젝트) — **통과해야 다음으로 간다**

설계의 「먼저 확인할 위험」. 이메일 없이 카카오 로그인이 되는지, 별명이 `user_metadata` 의 어느 칸에 오는지 확인한다. 코드는 스크래치에만 둔다(커밋 없음). 카카오·Supabase 화면 설정은 **친구가 직접** 하고, 나는 단계를 안내하고 결과를 확인한다.

**Files:**
- Create(스크래치): `<scratchpad>/kakao-spike/index.html`

**Interfaces:**
- Produces: 「Task 1 결과」(이 문서 맨 끝에 적는다) — ① 로그인 성공 여부 ② 별명이 담긴 `user_metadata` 칸 이름 ③ 필요한 설정(이메일 동의·비즈앱 여부)

- [ ] **Step 1: 카카오 앱 만들기(친구)**

developers.kakao.com → 내 애플리케이션 → 애플리케이션 추가: 이름 「고척교회 관리」.
- 앱 설정 → 앱 키: **REST API 키** 를 적어 둔다.
- 제품 설정 → 카카오 로그인: **활성화 ON**, Redirect URI 에 `https://ktpwthwqzgcqcrmsafdo.supabase.co/auth/v1/callback` 추가.
- 카카오 로그인 → 보안: **Client Secret** 코드 생성, 활성화 상태 「사용함」.
- 카카오 로그인 → 동의항목: **닉네임(profile_nickname) 필수 동의**. 카카오계정(이메일) 줄이 「권한 없음」인지 「설정 가능」인지 적어 둔다.

- [ ] **Step 2: 개발 Supabase 설정(친구)**

대시보드(ktpwthwqzgcqcrmsafdo) → Authentication:
- Sign In / Providers → **Kakao**: Enable, Client ID = REST API 키, Client Secret = 위 코드. 「Allow users without an email」 같은 칸이 있으면 **ON**.
- Sign In / Providers → **Email**: 켜진 채로 둔다(Task 5 시험이 이메일 사용자를 만든다).
- URL Configuration: Site URL `http://localhost:8000`, Redirect URLs 에 `http://localhost:8000/**` 와 `https://sewoongkim1.github.io/church-admin/**` 추가.

- [ ] **Step 3: 시험 페이지 만들기**

`<scratchpad>/kakao-spike/index.html`:

```html
<!doctype html>
<meta charset="utf-8">
<title>카카오 로그인 시험(개발)</title>
<button id="go">카카오로 로그인</button> <button id="bye">로그아웃</button>
<pre id="box">확인 중…</pre>
<script type="module">
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm";
const sb = createClient("https://ktpwthwqzgcqcrmsafdo.supabase.co", "sb_publishable_eJKP6u95IU9_DBXTvnvYBA_-yGCf-0Y",
  { auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true } });
const box = document.getElementById("box");
document.getElementById("go").onclick = async () => {
  const { error } = await sb.auth.signInWithOAuth({ provider: "kakao", options: { redirectTo: location.origin + location.pathname } });
  if (error) box.textContent = "오류: " + error.message;
};
document.getElementById("bye").onclick = async () => { await sb.auth.signOut(); location.href = location.pathname; };
const q = new URLSearchParams(location.search);
const { data, error } = await sb.auth.getSession();
box.textContent =
  (q.get("error_description") ? "카카오/Supabase 오류: " + q.get("error_description") + "\n\n" : "") +
  (error ? "세션 오류: " + error.message : JSON.stringify(data.session?.user ?? "로그인 안 됨", null, 2));
</script>
```

- [ ] **Step 4: 로그인해 보기**

Run: `cd "<scratchpad>/kakao-spike" && python -m http.server 8000` (백그라운드)
친구가 PC 브라우저로 `http://localhost:8000/` → 「카카오로 로그인」 → 동의 → 돌아온다.
Expected: `box` 에 사용자 JSON. `user_metadata` 안에 별명이 든 칸(예: `nickname`·`name`·`full_name`)이 보인다.

- [ ] **Step 5: 갈림길 판단**

- **성공:** 「Task 1 결과」에 별명 칸 이름과 설정을 적고 Task 2 로.
- **`KOE205`(요청한 동의항목이 설정되지 않음) 또는 「email」 관련 오류:** Step 1 의 동의항목에서 카카오계정(이메일)을 **선택 동의**로 켤 수 있으면 켜고 Step 4 를 다시.
- **이메일 동의가 「권한 없음」(비즈앱 필요)이고 로그인이 막힘:** **멈추고 친구에게 묻는다** — ① 개인 개발자 비즈앱 전환 ② 다른 로그인 방식. 이 계획의 나머지는 로그인 방식과 무관하게 쓸 수 있지만, 이 답 없이 진행하지 않는다.

- [ ] **Step 6: 결과 적기(이 저장소)**

이 문서 맨 끝 「Task 1 결과」 절을 채우고 커밋한다.

```bash
git add docs/superpowers/plans/2026-09-28-church-admin-stage1.md
git commit -m "docs(교회어드민): 카카오 로그인 사전 확인 결과" -- docs/superpowers/plans/2026-09-28-church-admin-stage1.md
```

---

### Task 2: 새 저장소 뼈대 · 배포 전 점검 · 배포

빈 껍데기가 개발 DB 띠와 함께 뜨고, preflight 가 통과하며, 푸시하면 github.io 로 배포되는 데까지.

**Files:**
- Create: `C:\Projects\church-admin\` 아래 `index.html`, `package.json`, `CLAUDE.md`, `.gitignore`, `js/core/config.js`, `js/main.js`(임시), `css/tokens.css`, `css/admin.css`(Task 6 에서 채움 — 여기선 빈 파일), `supabase/config.toml`, `tools/stamp.py`, `tools/preflight.py`, `tests/smoke.test.mjs`, `.github/workflows/deploy.yml`

**Interfaces:**
- Produces: `window.SUPA = { URL, ANON, env: "prod"|"dev" }` (config.js, 모든 모듈이 읽는다) · `index.html` 의 `<div id="app">` · preflight 명령 `python tools/preflight.py`

- [ ] **Step 1: 저장소 만들기**

```bash
mkdir -p /c/Projects/church-admin && cd /c/Projects/church-admin && git init -b main
gh repo create sewoongkim1/church-admin --public --source . --description "고척교회 관리 웹 (admin.onlybible.kr)"
```

- [ ] **Step 2: `package.json` · `.gitignore`**

```json
{
  "name": "church-admin",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --experimental-strip-types --test tests/authz.test.mjs tests/router.test.mjs tests/ui.test.mjs tests/registry.test.mjs",
    "preflight": "python tools/preflight.py"
  }
}
```

`.gitignore`:
```
.env
*.env
supabase/.temp/
supabase/.branches/
node_modules/
```

- [ ] **Step 3: `js/core/config.js`**

```js
// Supabase 연결 설정 (공개돼도 되는 값 — publishable key 는 RLS·권한으로 막힌다)
//
// ⚠️ 운영과 개발은 사람이 고르지 않는다. 주소를 보고 저절로 갈린다.
//      admin.onlybible.kr  →  운영
//      그 밖의 모든 주소     →  개발 (localhost · github.io · 미리보기)
//    모르는 주소를 개발로 두는 까닭: 잘못 갈렸을 때 「빈 화면」은 보이지만 「남의 기록을 바꾼 것」은 안 보인다.
(function () {
  var PROD = { URL: "https://xnomlgydifiqiybervtf.supabase.co", ANON: "sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-" };
  var DEV = { URL: "https://ktpwthwqzgcqcrmsafdo.supabase.co", ANON: "sb_publishable_eJKP6u95IU9_DBXTvnvYBA_-yGCf-0Y" };
  var isProd = location.hostname === "admin.onlybible.kr";
  window.SUPA = { URL: isProd ? PROD.URL : DEV.URL, ANON: isProd ? PROD.ANON : DEV.ANON, env: isProd ? "prod" : "dev" };
  if (isProd) return;
  function mark() {
    if (document.getElementById("dev-env-mark")) return;
    var el = document.createElement("div");
    el.id = "dev-env-mark";
    el.textContent = "개발 DB";
    el.style.cssText = "position:fixed;top:0;right:0;z-index:2147483647;background:#b5891f;color:#fff;" +
      "font:700 11px/1 system-ui,sans-serif;padding:5px 9px;border-radius:0 0 0 8px;pointer-events:none;opacity:.9";
    document.body.appendChild(el);
  }
  if (document.body) mark(); else document.addEventListener("DOMContentLoaded", mark);
})();
```

- [ ] **Step 4: `index.html` · 임시 `js/main.js` · 빈 CSS**

`index.html`:
```html
<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>고척교회 관리</title>
<!--IMPORTMAP-->
<link rel="stylesheet" href="css/tokens.css">
<link rel="stylesheet" href="css/admin.css">
<script src="js/core/config.js"></script>
<script type="module" src="js/main.js"></script>
</head>
<body>
<div id="app"><p class="boot">불러오는 중…</p></div>
</body>
</html>
```

`js/main.js`(Task 6 에서 통째로 바뀐다):
```js
document.getElementById("app").innerHTML = `<p class="boot">뼈대 확인 — ${window.SUPA.env}</p>`;
```

`css/tokens.css`:
```css
:root{
  --navy:#1a3a6b; --navy-dark:#0d1b3e; --gold:#c8a84b;
  --cream:#fdf8f0; --gray:#6b778c; --border:#ddd6c8; --light:#f3f0ea;
  --green:#2c5f2d; --error:#c0392b;
  --ghost-bg:#eef3fb; --ghost-bd:#a9c3e8; --danger-bg:#fdeceb; --danger-bd:#e7b3ad;
  /* 관리 화면 표준 v1 (bible-memorize-church-app-v2 docs/notes/ministry-admin-ui.md) */
  --tap-lg:48px; --tap:44px; --chip:36px; --gap:10px; --gap-s:6px; --card-pad:18px;
  --head-h:56px; --nav-w:240px;
}
```

`css/admin.css`: 빈 파일로 만든다(`: > css/admin.css`).

- [ ] **Step 5: `tools/stamp.py`**

```python
# -*- coding: utf-8 -*-
"""배포 직전 index.html 에 파일마다 내용 해시(?v=)를 붙인다 — Actions 안에서만 고쳐 쓰고, 결과는 커밋하지 않는다.

왜: GitHub Pages 는 파일을 10분 캐시한다. 모듈 하나만 옛것이 남으면 새 main.js 가 옛 ui.js 를 불러
「없는 함수」로 화면이 통째로 멈춘다. 파일마다 내용 해시를 붙이면 바뀐 파일만 새로 받는다.
손으로 bump 하지 않으므로 두 사람이 고쳐도 index.html 이 충돌하지 않는다.

    python tools/stamp.py          # index.html 을 고쳐 쓴다(Actions 전용 — 로컬에서 돌렸으면 git checkout index.html)
    python tools/stamp.py --check  # 고쳐 쓰지 않고 표식·파일만 확인(preflight)
"""
import glob, hashlib, json, os, re, sys

try: sys.stdout.reconfigure(encoding="utf-8")
except Exception: pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARK = "<!--IMPORTMAP-->"

def rel(p): return os.path.relpath(p, ROOT).replace("\\", "/")

def digest(p):
    with open(os.path.join(ROOT, p), "rb") as f:
        return hashlib.sha1(f.read()).hexdigest()[:10]

def build(html):
    if MARK not in html:
        raise SystemExit("index.html 에 %s 표식이 없다" % MARK)
    files = sorted(rel(p) for p in glob.glob(os.path.join(ROOT, "js", "**", "*.js"), recursive=True))
    # 모듈 안의 상대 import("../core/ui.js")도 같은 주소로 풀리므로 이 표에 걸린다
    imports = {"./" + f: "./%s?v=%s" % (f, digest(f)) for f in files}
    html = html.replace(MARK, '<script type="importmap">%s</script>' % json.dumps({"imports": imports}, ensure_ascii=False))
    def tag(m):
        path = m.group(2)
        if not os.path.exists(os.path.join(ROOT, path)):
            raise SystemExit("index.html 이 부르는 파일이 없다: " + path)
        return '%s="%s?v=%s"' % (m.group(1), path, digest(path))
    html = re.sub(r'(href|src)="((?:css|js)/[^"?#]+)"', tag, html)
    return html, files

if __name__ == "__main__":
    p = os.path.join(ROOT, "index.html")
    with open(p, encoding="utf-8") as f:
        out, files = build(f.read())
    if "--check" in sys.argv:
        print("stamp 확인 — 모듈 %d개" % len(files))
        sys.exit(0)
    with open(p, "w", encoding="utf-8", newline="\n") as f:
        f.write(out)
    print("stamp — 모듈 %d개에 해시를 붙였다" % len(files))
```

- [ ] **Step 6: `tools/preflight.py` · `tests/smoke.test.mjs`**

```python
# -*- coding: utf-8 -*-
"""배포 전 점검 — Actions 가 배포 전에 돌리고, 여기서 실패하면 배포가 안 된다. 손으로도: python tools/preflight.py

⚠️ 준비물(npm 꾸러미·비밀 키·네트워크)이 필요한 검사는 넣지 않는다.
   tests/*.dev.test.mjs(개발 서버에 대고 도는 시험)는 이름에 .dev. 가 있어 여기서 빠진다.
"""
import glob, os, subprocess, sys

try: sys.stdout.reconfigure(encoding="utf-8")
except Exception: pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
fail = []

def run(title, cmd):
    r = subprocess.run(cmd, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if r.returncode == 0:
        print("  통과  " + title)
    else:
        fail.append(title)
        print("  실패  " + title + "\n" + r.stdout.decode("utf-8", "replace").rstrip())

print("\n[1] 자바스크립트 문법 (node --check)")
for f in sorted(glob.glob(os.path.join(ROOT, "js", "**", "*.js"), recursive=True)):
    run(os.path.relpath(f, ROOT).replace("\\", "/"), ["node", "--check", f])

print("\n[2] 순수 함수 시험 (node --test)")
tests = sorted(p for p in glob.glob(os.path.join(ROOT, "tests", "*.test.mjs")) if ".dev." not in os.path.basename(p))
run("시험 파일 %d개" % len(tests), ["node", "--experimental-strip-types", "--test", *tests])

print("\n[3] 캐시 표식 (stamp --check)")
run("stamp", [sys.executable, os.path.join("tools", "stamp.py"), "--check"])

print()
if fail:
    print("실패 %d건 — 배포하지 않는다" % len(fail))
    sys.exit(1)
print("모두 통과")
```

`tests/smoke.test.mjs`(Task 4 에서 진짜 시험이 생기면 지운다):
```js
import { test } from "node:test";
import assert from "node:assert/strict";
test("시험 실행기가 돈다", () => assert.equal(1 + 1, 2));
```

- [ ] **Step 7: preflight 돌려 보기**

Run: `cd /c/Projects/church-admin && python tools/preflight.py`
Expected: `[1]` 에 `js/core/config.js`·`js/main.js` 통과, `[2]` 통과, `[3]` 통과, 끝에 `모두 통과`.

- [ ] **Step 8: `supabase/config.toml`**

```toml
# supabase CLI 가 이 폴더를 프로젝트로 알아보게 하는 최소 설정. 배포 대상은 명령마다 --project-ref 로 준다.
project_id = "church-admin"

[functions.church-admin]
# 게이트웨이 검사는 끈다 — 토큰은 index.ts 가 요청마다 auth.getUser 로 검사한다.
verify_jwt = false
```

- [ ] **Step 9: `.github/workflows/deploy.yml`**

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch: {}

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: true

jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      # 여기서 실패하면 아래 배포 단계가 아예 안 돈다.
      - name: 배포 전 점검
        run: python3 tools/preflight.py
      - name: 파일마다 캐시 해시 붙이기(커밋하지 않음)
        run: python3 tools/stamp.py
      - uses: actions/configure-pages@v5
      # 화면 파일만 올린다 — supabase/·tests/·tools/·docs 는 사이트에 나가지 않는다.
      - name: 올릴 것만 모으기
        run: |
          mkdir _site
          cp -r index.html js css _site/
      - uses: actions/upload-pages-artifact@v3
        with:
          path: "_site"
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 10: `CLAUDE.md`**

```markdown
# 고척교회 관리 (church-admin · admin.onlybible.kr)

교회 담당자만 카카오 로그인으로 들어오는 관리 웹. 1차 메뉴는 사역신청(성경암송 앱의 관리 화면에서 옮겨 오는 중).
설계·계획: 형제 저장소 `bible-memorize-church-app-v2` 의
`docs/superpowers/specs/2026-09-28-church-admin-design.md` · `docs/superpowers/plans/2026-09-28-church-admin-stage1.md`

## 스택
- 빌드 없음 · 브라우저 ES 모듈. 메뉴 하나 = `js/menus/<묶음>/<메뉴>.js` 하나 + `js/menus/registry.js` 한 줄.
- 서버: `supabase/functions/church-admin`. 권한 규칙은 `authz.ts`(순수 함수 — Node 시험이 같은 파일을 읽는다).
- DB: Supabase 통합 프로젝트(운영 `xnomlgydifiqiybervtf` / 개발 `ktpwthwqzgcqcrmsafdo`) — 성경암송 앱과 **같은 DB**.

## 개발 / 운영
- `js/core/config.js` 가 주소를 보고 고른다 — `admin.onlybible.kr` 만 운영, 나머지는 개발 + 「개발 DB」 띠.
- 로컬: `python -m http.server 8000` → http://localhost:8000 (카카오가 돌아오는 주소가 이 포트로 등록돼 있다).

## 배포
- 화면: main 푸시 → Actions: preflight → stamp(파일마다 `?v=해시`, 커밋 안 함) → Pages. **bump 없음.**
- 서버: `supabase functions deploy church-admin --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo`(개발 먼저) → `xnomlgydifiqiybervtf`.
- SQL: `supabase/sql/` — 개발 먼저. CLI 는 저장소 밖 작업 폴더로만 link 한다(`~/.church-admin/supa-dev`·`supa-prod`). 저장소 루트 link 금지.
- 개발 서버 시험: `set -a; . ~/.church-admin/dev.env; set +a; node --experimental-strip-types --test tests/server.dev.test.mjs`

## ⚠️ 함정
- `--no-verify-jwt` 여도 토큰 검사는 `index.ts` 가 요청마다 한다. **새 액션 = `authz.ts` `ACTION_ROLES` 한 줄 + `tests/server.dev.test.mjs` `PROBE` 한 줄.** 표에 없으면 막힌다(열리는 쪽으로 틀리지 않게).
- `admin_*` 표는 서버만 읽는다. 새 표는 그 자리에서 RLS 켜고 `anon`·`authenticated` revoke.
- 역할 목록은 `admin_roles` 표 한 곳. CHECK·코드 목록에 박지 않는다.
- 확인·알림은 `ui.js` 의 `dialog`/`toast` 만(브라우저 confirm/alert 금지). 저장 중엔 `busy()` 로 단추를 잠근다.
- 메뉴 화면은 `route()` 가 새로 만든 `<section>` 에 그린다 — 공용 `#view` 에 이벤트를 달면 다음 메뉴로 새어 간다.
- 응답에 `auth_user_id` 를 싣지 않는다. 담당자 이름을 코드·SQL 파일에 적지 않는다(공개 저장소).
```

- [ ] **Step 11: 로컬 확인**

Run: `cd /c/Projects/church-admin && python -m http.server 8000` (백그라운드) → 브라우저 `http://localhost:8000`
Expected: 「뼈대 확인 — dev」 글자와 오른쪽 위 「개발 DB」 띠.

- [ ] **Step 12: 커밋 · 푸시 · Pages 켜기**

```bash
cd /c/Projects/church-admin
git add .
git commit -m "chore: 교회 어드민 뼈대 — 개발/운영 자동 선택 · preflight · 파일별 캐시 해시 · Pages 배포

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin main
# 첫 푸시의 실행은 Pages 가 아직 꺼져 있어 배포 단계에서 실패한다 — Pages 를 켜고 다시 돌린다
gh api -X POST repos/sewoongkim1/church-admin/pages -f build_type=workflow
gh workflow run deploy.yml
sleep 5
gh run watch --exit-status $(gh run list --workflow deploy.yml --limit 1 --json databaseId -q '.[0].databaseId')
```
Expected: 두 번째 실행 성공. `curl -s https://sewoongkim1.github.io/church-admin/ | grep -o 'importmap'` → `importmap` (stamp 가 돌았다는 표식).

---

### Task 3: DB 표 넷 · 공개 차단 · 로그인 사용자 노출 점검 SQL

**Files:**
- Create: `supabase/sql/001_admin_tables.sql`, `supabase/sql/check-authenticated-exposure.sql`

**Interfaces:**
- Produces: 표 `admin_roles(id,label,description)` · `admin_members(id,auth_user_id,type,gu,mok,bu,grade,name,kakao_nickname,status,approved_by,approved_at,last_login_at,created_at)` · `admin_role_grants(member_id,role_id,granted_by,granted_at)` · `admin_audit(id,at,member_id,action,target,detail)`. 역할 씨앗 `super`·`ministry`.

- [ ] **Step 1: `supabase/sql/001_admin_tables.sql`**

```sql
-- 교회 어드민 — 담당자 · 역할 · 바꾼 기록 (2026-09-28)
-- ⚠️ 개발(ktpwthwqzgcqcrmsafdo) 먼저, 그다음 운영(xnomlgydifiqiybervtf).
-- ⚠️ 이 표들은 서버(church-admin 함수의 service role)만 읽고 쓴다. 공개 키·로그인 사용자 모두 막는다.
--    RLS 를 켜고 정책을 두지 않으며, anon·authenticated 권한도 뺀다(뷰를 만들면 security_invoker = on).
-- 여러 번 돌려도 안전하다(if not exists · on conflict).
begin;

-- 역할 목록의 원본은 이 표 하나다. 역할을 늘리려면 행 하나만 넣는다(CHECK 나 코드에 박지 않는다).
create table if not exists admin_roles (
  id          text primary key,
  label       text not null,
  description text not null default ''
);

-- 들어올 수 있는 사람. 카카오 로그인(auth.users) 한 명 = 한 줄.
-- 신원 여섯 칸은 성경암송 앱 로그인(users.identity_key)과 같은 꼴 — 기존 사역 담당자와 맞대기 위해서다.
create table if not exists admin_members (
  id             uuid primary key default gen_random_uuid(),
  auth_user_id   uuid not null unique references auth.users(id) on delete cascade,
  type           text not null default '교구',
  gu             text not null default '',
  mok            text not null default '',
  bu             text not null default '',
  grade          text not null default '',
  name           text not null,
  kakao_nickname text not null default '',
  status         text not null default 'pending' check (status in ('pending', 'active', 'disabled')),
  approved_by    uuid references admin_members(id) on delete set null,
  approved_at    timestamptz,
  last_login_at  timestamptz,
  created_at     timestamptz not null default now()
);

create table if not exists admin_role_grants (
  member_id  uuid not null references admin_members(id) on delete cascade,
  role_id    text not null references admin_roles(id),
  granted_by uuid references admin_members(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (member_id, role_id)
);

-- 누가 언제 무엇을 바꿨나. 사람이 지워져도 기록은 남는다(member_id 만 비워진다).
create table if not exists admin_audit (
  id        bigserial primary key,
  at        timestamptz not null default now(),
  member_id uuid references admin_members(id) on delete set null,
  action    text not null,
  target    text not null default '',
  detail    jsonb not null default '{}'::jsonb
);
create index if not exists admin_audit_at_idx on admin_audit (at desc);

alter table admin_roles       enable row level security;
alter table admin_members     enable row level security;
alter table admin_role_grants enable row level security;
alter table admin_audit       enable row level security;

revoke all on admin_roles, admin_members, admin_role_grants, admin_audit from anon, authenticated;
revoke all on sequence admin_audit_id_seq from anon, authenticated;

insert into admin_roles (id, label, description) values
  ('super',    '총괄 관리자',   '모든 메뉴 + 담당자 승인·역할·정지'),
  ('ministry', '사역신청 담당', '사역신청 메뉴 전체')
on conflict (id) do nothing;

commit;

select id, label from admin_roles order by id;
```

- [ ] **Step 2: `supabase/sql/check-authenticated-exposure.sql`**

```sql
-- 로그인한 사용자(authenticated)가 읽을 수 있는 표·뷰 — 운영에서 카카오 로그인을 켜기 **전에** 본다.
--   supabase --workdir <작업 폴더> db query --linked -f supabase/sql/check-authenticated-exposure.sql
-- 읽는 법:
--   · anon_select = true 인 줄은 이미 공개 키로도 읽히는 것 — 새로 생기는 노출이 아니다(따로 판단).
--   · anon_select = false 인데 이 목록에 나온 줄이 **문제**다: 로그인만 하면(카카오든 이메일 가입이든) 누구나 읽는다.
--     → revoke select … from authenticated, 또는 정책을 고친 뒤에 로그인을 켠다.
--   · 뷰는 RLS 대상이 아니다(security_invoker = on 이 아니면 만든 사람 권한으로 돈다).
with rels as (
  select c.oid, n.nspname as schema, c.relname as name, c.relkind, c.relrowsecurity as rls,
         coalesce((select option_value from pg_options_to_table(c.reloptions) where option_name = 'security_invoker'), 'off') as invoker
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
), pol as (
  select schemaname, tablename, string_agg(policyname || '(' || array_to_string(roles, ',') || ')', ', ') as policies
  from pg_policies
  where cmd in ('SELECT', 'ALL') and ('authenticated' = any(roles) or 'public' = any(roles))
  group by 1, 2
)
select case r.relkind when 'v' then '뷰' when 'm' then '구체화 뷰' else '표' end as kind,
       r.name, r.rls, r.invoker,
       has_table_privilege('anon', r.oid, 'SELECT') as anon_select,
       p.policies
from rels r
left join pol p on p.schemaname = r.schema and p.tablename = r.name
where has_table_privilege('authenticated', r.oid, 'SELECT')
  and (r.relkind in ('v', 'm') or not r.rls or p.policies is not null)
order by anon_select, kind, r.name;
```

- [ ] **Step 3: 개발 작업 폴더 link**

```bash
mkdir -p /c/Users/sewki/.church-admin/supa-dev && cd /c/Users/sewki/.church-admin/supa-dev \
  && supabase init --force && supabase link --project-ref ktpwthwqzgcqcrmsafdo
supabase --workdir /c/Users/sewki/.church-admin/supa-dev db query --linked "select count(*) from users"
```
Expected: 스물 남짓(개발). 사백이 넘으면 **멈춘다** — 운영을 보고 있다.

- [ ] **Step 4: 개발에 표 만들기**

Run: `cd /c/Projects/church-admin && supabase --workdir /c/Users/sewki/.church-admin/supa-dev db query --linked -f supabase/sql/001_admin_tables.sql`
Expected: 마지막 SELECT 결과 `ministry | 사역신청 담당`, `super | 총괄 관리자`.

- [ ] **Step 5: 공개 키로 막혔는지 확인**

```bash
for t in admin_roles admin_members admin_role_grants admin_audit; do
  printf "%s " $t; curl -s -o /dev/null -w "%{http_code}\n" \
    "https://ktpwthwqzgcqcrmsafdo.supabase.co/rest/v1/$t?select=*&limit=1" \
    -H "apikey: sb_publishable_eJKP6u95IU9_DBXTvnvYBA_-yGCf-0Y"
done
```
Expected: 넷 모두 `401`(권한 없음). **`200` 이 하나라도 나오면 멈추고 Step 1 의 revoke 를 다시 본다** — `admin_roles` 는 행이 있어 200 이면 곧바로 새는 것이다.

- [ ] **Step 6: 개발에서 노출 점검 SQL 돌려 보기**

Run: `supabase --workdir /c/Users/sewki/.church-admin/supa-dev db query --linked -f supabase/sql/check-authenticated-exposure.sql`
Expected: 오류 없이 표가 나온다(개발 결과는 참고용 — 판단은 Task 8 에서 운영으로). `admin_` 으로 시작하는 줄은 **없어야 한다.**

- [ ] **Step 7: 커밋**

```bash
cd /c/Projects/church-admin
git add supabase/sql/001_admin_tables.sql supabase/sql/check-authenticated-exposure.sql
git commit -m "feat(db): 담당자·역할·바꾼 기록 표 — 서버만 읽는다(RLS·revoke) · 로그인 사용자 노출 점검 SQL

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 권한·신원 규칙 `authz.ts` (순수 함수 · TDD)

**Files:**
- Create: `supabase/functions/church-admin/authz.ts`, `tests/authz.test.mjs`
- Delete: `tests/smoke.test.mjs`

**Interfaces:**
- Produces (모두 `authz.ts` 에서 export):
  - `ACTION_ROLES: Record<string, string | null>` — `me`·`register` → `null`, `membersList`·`membersApprove`·`membersSetRoles`·`membersSetStatus`·`auditList` → `"super"`
  - `canCall(action: string, member: {status: "pending"|"active"|"disabled"; roles: string[]} | null): "ok"|"unknown-action"|"not-registered"|"pending"|"disabled"|"forbidden"`
  - `knownRoles(): string[]` — `"super"` + `ACTION_ROLES` 값들, 정렬
  - `norm(s: unknown): string` — NFC · 앞뒤 공백 제거 · 연속 공백 하나로
  - `type Identity = {type,gu,mok,bu,grade,name}` (모두 string)
  - `parseIdentity(x: unknown): {ok:true; identity: Identity} | {ok:false; error: "invalid"|"invalid-type"|"too-long"|"name-required"|"gu-mok-required"|"bu-grade-required"}`
  - `identityKey(u: Identity): string` — `"교구|화평|20|||김세웅"` 꼴(성경암송 앱 `users.identity_key` 와 같다)
  - `identityCandidates(u: Identity): string[]` — 목장 「20」/「20목장」 · 학년 「3」/「3학년」 표기 차이를 모두 담은 키들
  - `parseRoles(x: unknown, known: string[]): {ok:true; roles: string[]} | {ok:false; error: "invalid-roles"|"roles-required"|"unknown-role"}`
  - `kakaoNickname(meta: unknown): string` — 최대 40자

- [ ] **Step 1: 실패하는 시험 쓰기 — `tests/authz.test.mjs`**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACTION_ROLES, canCall, knownRoles, norm, parseIdentity, identityKey,
  identityCandidates, parseRoles, kakaoNickname,
} from "../supabase/functions/church-admin/authz.ts";

test("모르는 액션은 막는다 — 객체 기본 이름(toString·__proto__)도", () => {
  const sup = { status: "active", roles: ["super"] };
  assert.equal(canCall("nope", sup), "unknown-action");
  assert.equal(canCall("toString", sup), "unknown-action");
  assert.equal(canCall("__proto__", null), "unknown-action");
});

test("me·register 는 로그인만 되어 있으면(등록 전·대기·정지도)", () => {
  for (const a of ["me", "register"]) {
    assert.equal(canCall(a, null), "ok");
    assert.equal(canCall(a, { status: "pending", roles: [] }), "ok");
    assert.equal(canCall(a, { status: "disabled", roles: [] }), "ok");
  }
});

test("super 액션 × 사람 다섯 가지", () => {
  const cases = [
    [null, "not-registered"],
    [{ status: "pending", roles: ["super"] }, "pending"],
    [{ status: "disabled", roles: ["super"] }, "disabled"],
    [{ status: "active", roles: ["ministry"] }, "forbidden"],
    [{ status: "active", roles: ["super"] }, "ok"],
  ];
  const superActions = Object.keys(ACTION_ROLES).filter((k) => ACTION_ROLES[k] === "super");
  assert.deepEqual(superActions.sort(), ["auditList", "membersApprove", "membersList", "membersSetRoles", "membersSetStatus"]);
  for (const a of superActions) for (const [m, want] of cases) assert.equal(canCall(a, m), want, a);
});

test("knownRoles 는 super 를 늘 담는다", () => {
  assert.ok(knownRoles().includes("super"));
  assert.deepEqual(knownRoles(), [...knownRoles()].sort());
});

test("norm — 공백·자모분리(NFD)", () => {
  assert.equal(norm("  김   세웅 "), "김 세웅");
  assert.equal(norm("\u1100\u1175\u11B7"), "김");
  assert.equal(norm(null), "");
  assert.equal(norm(20), "20");
});

test("parseIdentity — 교구", () => {
  assert.deepEqual(parseIdentity({ type: "교구", gu: "화평", mok: " 20 ", name: "김  세웅", bu: "중등부" }),
    { ok: true, identity: { type: "교구", gu: "화평", mok: "20", bu: "", grade: "", name: "김 세웅" } });
});

test("parseIdentity — 교회학교는 교구·목장을 버린다", () => {
  assert.deepEqual(parseIdentity({ type: "교회학교", gu: "화평", mok: "3", bu: "중등부", grade: "3학년", name: "홍길동" }),
    { ok: true, identity: { type: "교회학교", gu: "", mok: "", bu: "중등부", grade: "3학년", name: "홍길동" } });
});

test("parseIdentity — 틀린 입력", () => {
  assert.deepEqual(parseIdentity(null), { ok: false, error: "invalid" });
  assert.deepEqual(parseIdentity([]), { ok: false, error: "invalid" });
  assert.deepEqual(parseIdentity({ type: "성가대", name: "a" }), { ok: false, error: "invalid-type" });
  assert.deepEqual(parseIdentity({ gu: "화평", mok: "20" }), { ok: false, error: "name-required" });
  assert.deepEqual(parseIdentity({ type: "교구", gu: "화평", name: "a" }), { ok: false, error: "gu-mok-required" });
  assert.deepEqual(parseIdentity({ type: "교회학교", bu: "중등부", name: "a" }), { ok: false, error: "bu-grade-required" });
  assert.deepEqual(parseIdentity({ gu: "화평", mok: "20", name: "가".repeat(41) }), { ok: false, error: "too-long" });
});

test("identityKey — 성경암송 앱 users.identity_key 와 같은 꼴", () => {
  assert.equal(identityKey({ type: "교구", gu: "화평", mok: "20", bu: "", grade: "", name: "김세웅" }), "교구|화평|20|||김세웅");
});

test("identityCandidates — 목장·학년 표기 차이", () => {
  const a = identityCandidates({ type: "교구", gu: "화평", mok: "20", bu: "", grade: "", name: "김세웅" });
  assert.deepEqual([...a].sort(), ["교구|화평|20목장|||김세웅", "교구|화평|20|||김세웅"].sort());
  const b = identityCandidates({ type: "교구", gu: "화평", mok: "20목장", bu: "", grade: "", name: "김세웅" });
  assert.ok(b.includes("교구|화평|20|||김세웅"));
  const c = identityCandidates({ type: "교회학교", gu: "", mok: "", bu: "중등부", grade: "3", name: "홍" });
  assert.deepEqual([...c].sort(), ["교회학교|||중등부|3학년|홍", "교회학교|||중등부|3|홍"].sort());
});

test("parseRoles", () => {
  const known = ["ministry", "super"];
  assert.deepEqual(parseRoles(["super", " ministry ", "super"], known), { ok: true, roles: ["ministry", "super"] });
  assert.deepEqual(parseRoles("super", known), { ok: false, error: "invalid-roles" });
  assert.deepEqual(parseRoles([], known), { ok: false, error: "roles-required" });
  assert.deepEqual(parseRoles(["", " "], known), { ok: false, error: "roles-required" });
  assert.deepEqual(parseRoles(["root"], known), { ok: false, error: "unknown-role" });
});

test("kakaoNickname — 여러 칸 중 있는 것", () => {
  assert.equal(kakaoNickname({ nickname: " 행복 " }), "행복");
  assert.equal(kakaoNickname({ nickname: "", name: "홍길동" }), "홍길동");
  assert.equal(kakaoNickname({ full_name: "가".repeat(50) }).length, 40);
  assert.equal(kakaoNickname(null), "");
});
```

`tests/smoke.test.mjs` 는 지운다: `git rm tests/smoke.test.mjs`

- [ ] **Step 2: 실패 확인**

Run: `cd /c/Projects/church-admin && node --experimental-strip-types --test tests/authz.test.mjs`
Expected: FAIL — `Cannot find module '…/authz.ts'`

- [ ] **Step 3: `supabase/functions/church-admin/authz.ts` 쓰기**

Task 1 결과에서 별명 칸이 `nickname`·`name`·`full_name`·`preferred_username`·`user_name` 밖이라면 `kakaoNickname` 의 칸 목록 **맨 앞에** 그 이름을 더하고 시험에도 한 줄 더한다.

```ts
// 교회 어드민 — 권한과 신원 규칙(순수 함수)
//   서버(Deno, index.ts)와 시험(Node, tests/authz.test.mjs)이 **같은 파일**을 읽는다.
//   ⚠️ Deno 전용 API·원격 import 를 쓰지 않는다 — node --experimental-strip-types 가 그대로 읽어야 한다.
//   ⚠️ enum·namespace 처럼 「타입만 지워서는 안 되는」 TS 문법도 쓰지 않는다.

// 액션마다 필요한 역할. null = 로그인만 되어 있으면(등록 전·대기·정지인 분도 자기 상태는 알아야 한다).
// ⚠️ 새 액션을 만들면 반드시 여기에 한 줄 — 없으면 unknown-action 으로 막힌다(열리는 쪽으로 틀리지 않게).
//    tests/server.dev.test.mjs 의 PROBE 에도 한 줄(시험이 빠진 액션을 잡는다).
export const ACTION_ROLES: Record<string, string | null> = {
  me: null,
  register: null,
  membersList: "super",
  membersApprove: "super",
  membersSetRoles: "super",
  membersSetStatus: "super",
  auditList: "super",
};

export type MemberStatus = "pending" | "active" | "disabled";
export type Gate = "ok" | "unknown-action" | "not-registered" | "pending" | "disabled" | "forbidden";

export function canCall(action: string, member: { status: MemberStatus; roles: string[] } | null): Gate {
  // hasOwnProperty — "toString" 같은 객체 기본 이름이 액션으로 통과하지 않게
  if (!Object.prototype.hasOwnProperty.call(ACTION_ROLES, action)) return "unknown-action";
  const need = ACTION_ROLES[action];
  if (need === null) return "ok";
  if (!member) return "not-registered";
  if (member.status === "pending") return "pending";
  if (member.status !== "active") return "disabled";
  if (member.roles.includes("super") || member.roles.includes(need)) return "ok";
  return "forbidden";
}

// 서버가 아는 역할 이름 — 메뉴 목록(js/menus/registry.js)이 이 밖의 역할을 쓰면 시험이 실패한다.
export function knownRoles(): string[] {
  const s = new Set<string>(["super"]);
  for (const v of Object.values(ACTION_ROLES)) if (v) s.add(v);
  return [...s].sort();
}

// 완성형(NFC)으로 — 맥에서 온 자모분리 이름이 딴 사람이 되지 않게(2026-09-20 찬양대 NFC/NFD 사고)
export const norm = (s: unknown): string =>
  (s ?? "").toString().normalize("NFC").trim().replace(/\s+/g, " ");

export type Identity = { type: string; gu: string; mok: string; bu: string; grade: string; name: string };
export type ParsedIdentity = { ok: true; identity: Identity } | { ok: false; error: string };

const MAX_LEN = 40;

// 등록 칸 확인 — 교구 목록은 서버가 거르지 않는다(교구가 늘 때 서버까지 고치지 않게). 화면이 목록으로 받는다.
export function parseIdentity(x: unknown): ParsedIdentity {
  if (!x || typeof x !== "object" || Array.isArray(x)) return { ok: false, error: "invalid" };
  const o = x as Record<string, unknown>;
  const type = norm(o.type) || "교구";
  if (type !== "교구" && type !== "교회학교") return { ok: false, error: "invalid-type" };
  const f = (k: string) => norm(o[k]);
  const identity: Identity = type === "교구"
    ? { type, gu: f("gu"), mok: f("mok"), bu: "", grade: "", name: f("name") }
    : { type, gu: "", mok: "", bu: f("bu"), grade: f("grade"), name: f("name") };
  if (Object.values(identity).some((v) => v.length > MAX_LEN)) return { ok: false, error: "too-long" };
  if (!identity.name) return { ok: false, error: "name-required" };
  if (type === "교구" && (!identity.gu || !identity.mok)) return { ok: false, error: "gu-mok-required" };
  if (type === "교회학교" && (!identity.bu || !identity.grade)) return { ok: false, error: "bu-grade-required" };
  return { ok: true, identity };
}

// 성경암송 앱 users.identity_key 와 같은 꼴(supabase/functions/api/index.ts 의 identityKey)
export const identityKey = (u: Identity): string =>
  [u.type, u.gu, u.mok, u.bu, u.grade, u.name].map(norm).join("|");

// 적은 표기가 사람마다 달라 여러 꼴로 맞춰 본다(api 의 ministryStaffCandidates 를 양방향으로 넓힘)
//  · 목장 「20」·「20목장」  · 학년 「3」·「3학년」
export function identityCandidates(u: Identity): string[] {
  const m0 = u.mok.replace(/목장$/, "");
  const moks = [u.mok, m0, /^\d+$/.test(m0) ? m0 + "목장" : m0];
  const g0 = u.grade.replace(/학년$/, "");
  const grades = [u.grade, g0, /^\d+$/.test(g0) ? g0 + "학년" : g0];
  const out = new Set<string>();
  for (const mok of moks) for (const grade of grades) out.add(identityKey({ ...u, mok, grade }));
  return [...out];
}

// 역할 고르기 확인 — known 은 admin_roles 표에서 읽은 id 들(역할 목록의 원본은 표 하나)
export function parseRoles(x: unknown, known: string[]):
  { ok: true; roles: string[] } | { ok: false; error: string } {
  if (!Array.isArray(x)) return { ok: false, error: "invalid-roles" };
  const roles = [...new Set(x.map((r) => norm(r)))].filter(Boolean).sort();
  if (!roles.length) return { ok: false, error: "roles-required" };
  if (roles.some((r) => !known.includes(r))) return { ok: false, error: "unknown-role" };
  return { ok: true, roles };
}

// 카카오 별명 — Supabase 가 user_metadata 의 어느 칸에 담는지는 판마다 달라 여럿을 본다(Task 1 에서 실제 칸 확인)
export function kakaoNickname(meta: unknown): string {
  const m = (meta && typeof meta === "object" ? meta : {}) as Record<string, unknown>;
  const v = m.nickname || m.name || m.full_name || m.preferred_username || m.user_name || "";
  return norm(v).slice(0, MAX_LEN);
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --experimental-strip-types --test tests/authz.test.mjs`
Expected: `# pass 12` · `# fail 0`

- [ ] **Step 5: preflight 확인 후 커밋**

Run: `python tools/preflight.py` → `모두 통과`

```bash
git add supabase/functions/church-admin/authz.ts tests/authz.test.mjs
git rm -q tests/smoke.test.mjs
git commit -m "feat(권한): 액션·역할 표와 신원 규칙(순수 함수) — 서버와 시험이 같은 파일을 읽는다

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 서버 함수 `church-admin` · 개발 배포 · 권한 표 시험

**Files:**
- Create: `supabase/functions/church-admin/index.ts`, `tests/server.dev.test.mjs`, `tests/seed-dev.mjs`
- Create(저장소 밖): `C:/Users/sewki/.church-admin/dev.env`

**Interfaces:**
- Consumes: Task 4 의 `authz.ts` 전부 · Task 3 의 표 넷
- Produces: `POST {SUPA.URL}/functions/v1/church-admin` 본문 `{action, …}`, 머리 `Authorization: Bearer <사용자 access_token>`.
  - 인증 실패 401 `{ok:false,error:"unauthenticated"}` · 권한 403 `{ok:false,error:<Gate>}` · 모르는 액션 400 · 서버 오류 500 `{ok:false,error:"server",code}`
  - `me` → `{ok:true, registered:boolean, status:null|"pending"|"active"|"disabled", member:null|Member, roles:string[], roles_info:{id,label}[], kakao_nickname:string}` (정지·대기면 `roles`·`roles_info` 는 빈 배열)
  - `register {identity}` → `me` 와 같은 답 또는 `{ok:false,error}`
  - `membersList` → `{ok:true, members: Member[] & {roles:string[], approved_by_name:string, known_ministry_staff:boolean}, roles:{id,label,description}[]}`
  - `membersApprove {member_id, roles}` · `membersSetRoles {member_id, roles}` · `membersSetStatus {member_id, status:"active"|"disabled"}` → `{ok:true}` 또는 `{ok:false,error}`
  - `auditList {limit?, before?}` → `{ok:true, rows:{id,at,who,action,target,detail}[]}`
  - `Member` = `{id,type,gu,mok,bu,grade,name,kakao_nickname,status,approved_by,approved_at,last_login_at,created_at}` (**`auth_user_id` 없음**)

- [ ] **Step 1: 개발 비밀 값 파일 만들기(저장소 밖)**

```bash
supabase projects api-keys --project-ref ktpwthwqzgcqcrmsafdo -o json
```
결과에서 `service_role` 값을 골라 `C:/Users/sewki/.church-admin/dev.env` 에 적는다(이 파일은 어디에도 커밋하지 않는다):
```
DEV_URL=https://ktpwthwqzgcqcrmsafdo.supabase.co
DEV_ANON=sb_publishable_eJKP6u95IU9_DBXTvnvYBA_-yGCf-0Y
DEV_SERVICE_KEY=<service_role 값>
```

- [ ] **Step 2: 실패하는 시험 쓰기 — `tests/server.dev.test.mjs`**

```js
// 개발 서버에 대고 도는 시험 — 네트워크와 개발 비밀 키가 필요해 preflight 에는 넣지 않는다(이름의 .dev.).
//   set -a; . ~/.church-admin/dev.env; set +a
//   node --experimental-strip-types --test tests/server.dev.test.mjs
// 시험용 사람은 이메일 로그인으로 만들고(ca-test-…@example.test) 끝나면 지운다.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { ACTION_ROLES, knownRoles } from "../supabase/functions/church-admin/authz.ts";

const URL_ = process.env.DEV_URL, ANON = process.env.DEV_ANON, SERVICE = process.env.DEV_SERVICE_KEY;
if (!URL_ || !URL_.includes("ktpwthwqzgcqcrmsafdo")) throw new Error("개발 프로젝트(ktpwthwqzgcqcrmsafdo)에만 돌린다 — dev.env 를 확인할 것");
if (!ANON || !SERVICE) throw new Error("DEV_ANON·DEV_SERVICE_KEY 가 없다");

const FN = URL_ + "/functions/v1/church-admin";
const svc = { apikey: SERVICE, "Content-Type": "application/json",
  ...(SERVICE.startsWith("sb_secret_") ? {} : { Authorization: "Bearer " + SERVICE }) };
const STAMP = Date.now();
const ZERO = "00000000-0000-0000-0000-000000000000";
const people = {};

async function body(res) { const t = await res.text(); try { return JSON.parse(t); } catch { return { raw: t }; } }

async function makeUser(label) {
  const email = `ca-test-${label}-${STAMP}@example.test`, password = "T" + STAMP + "!x";
  const u = await body(await fetch(URL_ + "/auth/v1/admin/users", { method: "POST", headers: svc,
    body: JSON.stringify({ email, password, email_confirm: true }) }));
  assert.ok(u.id, "사용자 만들기 실패: " + JSON.stringify(u));
  const s = await body(await fetch(URL_ + "/auth/v1/token?grant_type=password", { method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) }));
  assert.ok(s.access_token, "로그인 실패: " + JSON.stringify(s));
  return { uid: u.id, token: s.access_token };
}

async function rest(path, method, data) {
  const r = await fetch(URL_ + "/rest/v1/" + path, { method, headers: { ...svc, Prefer: "return=representation" },
    body: data ? JSON.stringify(data) : undefined });
  const x = await body(r);
  assert.ok(r.ok, path + " " + JSON.stringify(x));
  return x;
}

async function makeMember(p, status, roles) {
  const [m] = await rest("admin_members", "POST", { auth_user_id: p.uid, name: "시험-" + status, gu: "사랑", mok: "1", status });
  for (const role_id of roles) await rest("admin_role_grants", "POST", { member_id: m.id, role_id });
  p.memberId = m.id;
}

async function call(token, action, extra = {}) {
  const r = await fetch(FN, { method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON, ...(token ? { Authorization: "Bearer " + token } : {}) },
    body: JSON.stringify({ ...extra, action }) });
  return { status: r.status, body: await body(r) };
}

// super 액션마다 「통과하면 아무것도 안 바뀌는」 입력 — 없는 사람(ZERO)을 가리킨다
const PROBE = {
  membersList: {},
  membersApprove: { member_id: ZERO, roles: ["ministry"] },
  membersSetRoles: { member_id: ZERO, roles: ["ministry"] },
  membersSetStatus: { member_id: ZERO, status: "disabled" },
  auditList: { limit: 1 },
};
const GATES = ["unknown-action", "not-registered", "pending", "disabled", "forbidden"];

before(async () => {
  for (const k of ["none", "pending", "disabled", "ministry", "super"]) people[k] = await makeUser(k);
  await makeMember(people.pending, "pending", []);
  await makeMember(people.disabled, "disabled", ["super"]);
  await makeMember(people.ministry, "active", ["ministry"]);
  await makeMember(people.super, "active", ["super"]);
});

after(async () => {
  for (const p of Object.values(people)) {
    if (p.uid) await fetch(URL_ + "/auth/v1/admin/users/" + p.uid, { method: "DELETE", headers: svc });
  }
});

test("역할이 필요한 액션마다 시험 입력(PROBE)이 있다", () => {
  for (const [a, role] of Object.entries(ACTION_ROLES)) if (role) assert.ok(a in PROBE, "PROBE 에 없음: " + a);
});

test("서버가 아는 역할이 admin_roles 표에 있다", async () => {
  const rows = await rest("admin_roles?select=id", "GET");
  const ids = rows.map((r) => r.id);
  for (const r of knownRoles()) assert.ok(ids.includes(r), "admin_roles 에 없음: " + r);
});

test("토큰 없음·공개 키를 토큰처럼 → 401", async () => {
  assert.equal((await call(null, "me")).status, 401);
  assert.equal((await call(ANON, "me")).status, 401);
});

test("모르는 액션 → 400", async () => {
  const r = await call(people.super.token, "nope");
  assert.equal(r.status, 400);
  assert.equal(r.body.error, "unknown-action");
});

test("권한 표: 사람 다섯 × 역할이 필요한 액션", async () => {
  const want = { none: "not-registered", pending: "pending", disabled: "disabled", ministry: "forbidden", super: null };
  for (const [a, payload] of Object.entries(PROBE)) {
    for (const [who, gate] of Object.entries(want)) {
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

test("me: 다섯 사람 모두 자기 상태를 안다 · 정지된 분에게는 역할을 알려 주지 않는다", async () => {
  const want = { none: [false, null], pending: [true, "pending"], disabled: [true, "disabled"], ministry: [true, "active"], super: [true, "active"] };
  for (const [who, [reg, st]] of Object.entries(want)) {
    const r = await call(people[who].token, "me");
    assert.equal(r.body.ok, true, who);
    assert.equal(r.body.registered, reg, who);
    assert.equal(r.body.status, st, who);
  }
  assert.deepEqual((await call(people.disabled.token, "me")).body.roles, []);
  const m = await call(people.ministry.token, "me");
  assert.deepEqual(m.body.roles, ["ministry"]);
  assert.equal(m.body.roles_info[0].label, "사역신청 담당");
  assert.equal("auth_user_id" in m.body.member, false);
});

test("공개 키·로그인 사용자 모두 admin_* 표를 직접 못 읽는다", async () => {
  for (const t of ["admin_members", "admin_roles", "admin_role_grants", "admin_audit"]) {
    const a = await fetch(`${URL_}/rest/v1/${t}?select=*&limit=1`, { headers: { apikey: ANON } });
    assert.notEqual(a.status, 200, "공개 키로 열림: " + t);
    const b = await fetch(`${URL_}/rest/v1/${t}?select=*&limit=1`,
      { headers: { apikey: ANON, Authorization: "Bearer " + people.super.token } });
    assert.notEqual(b.status, 200, "로그인 사용자로 열림: " + t);
  }
});

test("register: 틀린 칸 → 등록 → 대기 중엔 고치기 → 승인된 분은 못 바꿈", async () => {
  const bad = await call(people.none.token, "register", { identity: { type: "교구", gu: "사랑", name: "" } });
  assert.equal(bad.body.error, "name-required");
  const r1 = await call(people.none.token, "register", { identity: { type: "교구", gu: "사랑", mok: "1", name: "시험등록" } });
  assert.equal(r1.body.status, "pending");
  const r2 = await call(people.none.token, "register", { identity: { type: "교구", gu: "사랑", mok: "2", name: "시험등록" } });
  assert.equal(r2.body.member.mok, "2");
  const r3 = await call(people.ministry.token, "register", { identity: { type: "교구", gu: "사랑", mok: "1", name: "바꿔치기" } });
  assert.equal(r3.body.error, "already-registered");
});

test("승인 · 역할 · 정지 한 바퀴 + 스스로 잠그지 않기 + 기록", async () => {
  const s = people.super.token;
  const list = await call(s, "membersList");
  assert.equal(list.body.ok, true);
  const target = list.body.members.find((m) => m.name === "시험등록");
  assert.ok(target, "대기 목록에 시험등록이 있어야 한다");
  assert.equal("auth_user_id" in target, false);
  assert.equal((await call(s, "membersApprove", { member_id: target.id, roles: ["root"] })).body.error, "unknown-role");
  assert.equal((await call(s, "membersApprove", { member_id: target.id, roles: ["ministry"] })).body.ok, true);
  assert.equal((await call(s, "membersApprove", { member_id: target.id, roles: ["ministry"] })).body.error, "not-pending");
  assert.deepEqual((await call(people.none.token, "me")).body.roles, ["ministry"]);
  assert.equal((await call(s, "membersSetRoles", { member_id: target.id, roles: ["ministry", "super"] })).body.ok, true);
  assert.equal((await call(s, "membersSetRoles", { member_id: target.id, roles: ["ministry"] })).body.ok, true);
  assert.equal((await call(s, "membersSetStatus", { member_id: target.id, status: "disabled" })).body.ok, true);
  assert.equal((await call(people.none.token, "membersList")).body.error, "disabled");
  assert.equal((await call(s, "membersSetStatus", { member_id: people.super.memberId, status: "disabled" })).body.error, "self");
  assert.equal((await call(s, "membersSetRoles", { member_id: people.super.memberId, roles: ["ministry"] })).body.error, "self-super");
  assert.equal((await call(s, "membersSetStatus", { member_id: people.pending.memberId, status: "active" })).body.error, "use-approve");
  const acts = (await call(s, "auditList", { limit: 20 })).body.rows.map((r) => r.action);
  for (const a of ["register", "register.update", "members.approve", "members.roles", "members.status"]) {
    assert.ok(acts.includes(a), "기록에 없음: " + a + " — " + JSON.stringify(acts));
  }
});
```

- [ ] **Step 3: 실패 확인**

Run: `cd /c/Projects/church-admin && set -a && . /c/Users/sewki/.church-admin/dev.env && set +a && node --experimental-strip-types --test tests/server.dev.test.mjs`
Expected: FAIL — 함수가 아직 없어 `404`(「토큰 없음 → 401」 등이 실패).

- [ ] **Step 4: `supabase/functions/church-admin/index.ts` 쓰기**

```ts
// ============================================================
// 교회 어드민 — 서버 함수 church-admin (2026-09-28)
//   설계: bible-memorize-church-app-v2 docs/superpowers/specs/2026-09-28-church-admin-design.md
//   배포: supabase functions deploy church-admin --no-verify-jwt --project-ref <개발 먼저>
//   ⚠️ --no-verify-jwt 는 「검사를 안 한다」가 아니다 — 게이트웨이 대신 **여기서** 요청마다
//      auth.getUser(토큰)로 사람을 확인한다. 토큰이 없거나 틀리면 401.
//   ⚠️ 막는 것은 이 파일이다. 화면에서 메뉴를 숨기는 것은 편의일 뿐.
//   ⚠️ 응답에 auth_user_id 를 싣지 않는다(MEMBER_COLS 에 없다).
// ============================================================
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { canCall, identityCandidates, kakaoNickname, norm, parseIdentity, parseRoles } from "./authz.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } });

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

const MEMBER_COLS = "id,type,gu,mok,bu,grade,name,kakao_nickname,status,approved_by,approved_at,last_login_at,created_at";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Member = {
  id: string; type: string; gu: string; mok: string; bu: string; grade: string; name: string;
  kakao_nickname: string; status: "pending" | "active" | "disabled";
  approved_by: string | null; approved_at: string | null; last_login_at: string | null; created_at: string;
};
type Ctx = { uid: string; meta: unknown; member: Member | null; roles: string[] };

async function loadCtx(uid: string, meta: unknown): Promise<Ctx> {
  const { data: m, error } = await db.from("admin_members").select(MEMBER_COLS).eq("auth_user_id", uid).maybeSingle();
  if (error) throw error;
  let roles: string[] = [];
  if (m) {
    const { data: g, error: e2 } = await db.from("admin_role_grants").select("role_id").eq("member_id", m.id);
    if (e2) throw e2;
    roles = (g ?? []).map((r: any) => r.role_id).sort();
  }
  return { uid, meta, member: (m as Member) ?? null, roles };
}

// 바꾸는 요청은 모두 한 줄씩 남긴다. 기록이 실패하면 숨기지 않고 오류로 올린다.
async function audit(ctx: Ctx, action: string, target: string, detail: Record<string, unknown> = {}) {
  const { error } = await db.from("admin_audit").insert({ member_id: ctx.member?.id ?? null, action, target, detail });
  if (error) throw error;
}

async function knownRoleIds(): Promise<string[]> {
  const { data, error } = await db.from("admin_roles").select("id");
  if (error) throw error;
  return (data ?? []).map((r: any) => r.id);
}

async function getMember(id: unknown): Promise<Member | null> {
  const s = norm(id);
  if (!UUID.test(s)) return null;
  const { data, error } = await db.from("admin_members").select(MEMBER_COLS).eq("id", s).maybeSingle();
  if (error) throw error;
  return (data as Member) ?? null;
}

// 지금 사용 중인 총괄 관리자들 — 마지막 한 분을 빼거나 정지하지 못하게
async function activeSuperIds(): Promise<string[]> {
  const { data: g, error } = await db.from("admin_role_grants").select("member_id").eq("role_id", "super");
  if (error) throw error;
  const ids = (g ?? []).map((x: any) => x.member_id);
  if (!ids.length) return [];
  const { data: ms, error: e2 } = await db.from("admin_members").select("id").in("id", ids).eq("status", "active");
  if (e2) throw e2;
  return (ms ?? []).map((x: any) => x.id);
}

// ---------- 기존 사역 담당자와 같은 분인지 (갈아타기 동안 승인을 돕는 표시일 뿐 — 권한을 주지 않는다) ----------
// ⚠️ 키가 아니라 사람(user_id)으로 맞댄다 — 소속을 고친 분의 옛 키는 user_identity_aliases 로 간다(2026-09-17 리뷰).
async function keysToUserIds(list: string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(list.map((k) => norm(k)).filter(Boolean))];
  const out = new Map<string, string>();
  if (!uniq.length) return out;
  const { data: us, error: e1 } = await db.from("users").select("id,identity_key").in("identity_key", uniq);
  if (e1) throw e1;
  for (const u of (us ?? []) as any[]) out.set(u.identity_key, u.id);
  const rest = uniq.filter((k) => !out.has(k));
  if (rest.length) {
    const { data: al, error: e2 } = await db.from("user_identity_aliases").select("identity_key,user_id").in("identity_key", rest);
    if (e2) throw e2;
    for (const a of (al ?? []) as any[]) out.set(a.identity_key, a.user_id);
  }
  return out;
}

async function ministryStaffUserIds(): Promise<Set<string>> {
  const { data, error } = await db.from("app_config").select("value").eq("key", "ministryAdmins").maybeSingle();
  if (error) throw error;
  const keys = Array.isArray(data?.value) ? (data!.value as unknown[]).map((x) => norm(x)).filter(Boolean) : [];
  return new Set((await keysToUserIds(keys)).values());
}

// ---------- 액션 ----------
async function me(ctx: Ctx) {
  const m = ctx.member;
  if (m) {
    const { error } = await db.from("admin_members").update({ last_login_at: new Date().toISOString() }).eq("id", m.id);
    if (error) throw error;
  }
  const roles = m?.status === "active" ? ctx.roles : [];   // 정지·대기인 분에게는 역할을 알려 주지 않는다
  let roles_info: { id: string; label: string }[] = [];
  if (roles.length) {
    const { data, error } = await db.from("admin_roles").select("id,label").in("id", roles).order("id");
    if (error) throw error;
    roles_info = (data ?? []) as any;
  }
  return { ok: true, registered: !!m, status: m?.status ?? null, member: m, roles, roles_info,
    kakao_nickname: kakaoNickname(ctx.meta) };
}

// 처음 로그인한 분의 승인 요청. 대기 중에는 적은 것을 고칠 수 있고, 승인·정지된 뒤에는 못 바꾼다.
async function register(ctx: Ctx, b: any) {
  if (ctx.member && ctx.member.status !== "pending") return { ok: false, error: "already-registered" };
  const p = parseIdentity(b.identity);
  if (!p.ok) return { ok: false, error: p.error };
  const row = { ...p.identity, kakao_nickname: kakaoNickname(ctx.meta) };
  if (ctx.member) {
    const { error } = await db.from("admin_members").update(row).eq("id", ctx.member.id).eq("status", "pending");
    if (error) throw error;
  } else {
    const { error } = await db.from("admin_members").insert({ ...row, auth_user_id: ctx.uid, status: "pending" });
    if (error) {
      if ((error as any).code === "23505") return { ok: false, error: "already-registered" };  // 두 번 눌러 동시에 들어온 것
      throw error;
    }
  }
  const next = await loadCtx(ctx.uid, ctx.meta);
  await audit(next, ctx.member ? "register.update" : "register", next.member!.id, row);
  return await me(next);
}

async function membersList() {
  const [ms, gs, rs] = await Promise.all([
    db.from("admin_members").select(MEMBER_COLS).order("created_at", { ascending: true }),
    db.from("admin_role_grants").select("member_id,role_id"),
    db.from("admin_roles").select("id,label,description").order("id"),
  ]);
  if (ms.error) throw ms.error;
  if (gs.error) throw gs.error;
  if (rs.error) throw rs.error;
  const members = (ms.data ?? []) as Member[];
  const rolesBy = new Map<string, string[]>();
  for (const g of (gs.data ?? []) as any[]) rolesBy.set(g.member_id, [...(rolesBy.get(g.member_id) ?? []), g.role_id].sort());
  const nameBy = new Map(members.map((m) => [m.id, m.name]));
  const known = new Set<string>();
  const pending = members.filter((m) => m.status === "pending");
  if (pending.length) {
    const staff = await ministryStaffUserIds();
    if (staff.size) {
      const cands = new Map(pending.map((m) => [m.id, identityCandidates(m)]));
      const who = await keysToUserIds([...cands.values()].flat());
      for (const [id, ks] of cands) if (ks.some((k) => staff.has(who.get(k) ?? ""))) known.add(id);
    }
  }
  return {
    ok: true,
    roles: rs.data ?? [],
    members: members.map((m) => ({
      ...m,
      roles: rolesBy.get(m.id) ?? [],
      approved_by_name: m.approved_by ? nameBy.get(m.approved_by) ?? "" : "",
      known_ministry_staff: known.has(m.id),
    })),
  };
}

async function membersApprove(ctx: Ctx, b: any) {
  const m = await getMember(b.member_id);
  if (!m) return { ok: false, error: "not-found" };
  if (m.status !== "pending") return { ok: false, error: "not-pending" };
  const r = parseRoles(b.roles, await knownRoleIds());
  if (!r.ok) return { ok: false, error: r.error };
  const { data: upd, error } = await db.from("admin_members")
    .update({ status: "active", approved_by: ctx.member!.id, approved_at: new Date().toISOString() })
    .eq("id", m.id).eq("status", "pending").select("id");
  if (error) throw error;
  if (!upd?.length) return { ok: false, error: "conflict" };   // 다른 관리자가 먼저 처리했다
  const { error: e2 } = await db.from("admin_role_grants")
    .insert(r.roles.map((role_id) => ({ member_id: m.id, role_id, granted_by: ctx.member!.id })));
  if (e2) throw e2;
  await audit(ctx, "members.approve", m.id, { name: m.name, roles: r.roles });
  return { ok: true };
}

async function membersSetRoles(ctx: Ctx, b: any) {
  const m = await getMember(b.member_id);
  if (!m) return { ok: false, error: "not-found" };
  if (m.status === "pending") return { ok: false, error: "use-approve" };
  const r = parseRoles(b.roles, await knownRoleIds());
  if (!r.ok) return { ok: false, error: r.error };
  const { data: cur, error } = await db.from("admin_role_grants").select("role_id").eq("member_id", m.id);
  if (error) throw error;
  const before = (cur ?? []).map((x: any) => x.role_id).sort();
  if (before.includes("super") && !r.roles.includes("super")) {
    if (m.id === ctx.member!.id) return { ok: false, error: "self-super" };   // 스스로 문을 잠그지 않게
    const supers = await activeSuperIds();
    if (supers.includes(m.id) && supers.length <= 1) return { ok: false, error: "last-super" };
  }
  const add = r.roles.filter((x) => !before.includes(x));
  const del = before.filter((x: string) => !r.roles.includes(x));
  if (del.length) {
    const { error: e } = await db.from("admin_role_grants").delete().eq("member_id", m.id).in("role_id", del);
    if (e) throw e;
  }
  if (add.length) {
    const { error: e } = await db.from("admin_role_grants")
      .insert(add.map((role_id) => ({ member_id: m.id, role_id, granted_by: ctx.member!.id })));
    if (e) throw e;
  }
  await audit(ctx, "members.roles", m.id, { name: m.name, before, after: r.roles });
  return { ok: true };
}

// 정지 · 다시 사용 · 대기 중인 분 거절(대기 → 정지). 대기 → 사용은 「승인」으로만.
async function membersSetStatus(ctx: Ctx, b: any) {
  const status = norm(b.status);
  if (status !== "active" && status !== "disabled") return { ok: false, error: "invalid-status" };
  const m = await getMember(b.member_id);
  if (!m) return { ok: false, error: "not-found" };
  if (m.status === "pending" && status === "active") return { ok: false, error: "use-approve" };
  if (m.id === ctx.member!.id) return { ok: false, error: "self" };
  if (m.status === status) return { ok: true, already: true };
  if (status === "disabled") {
    const supers = await activeSuperIds();
    if (supers.includes(m.id) && supers.length <= 1) return { ok: false, error: "last-super" };
  }
  const { error } = await db.from("admin_members").update({ status }).eq("id", m.id);
  if (error) throw error;
  await audit(ctx, "members.status", m.id, { name: m.name, before: m.status, after: status });
  return { ok: true };
}

async function auditList(b: any) {
  const limit = Math.min(Math.max(Number(b.limit) || 100, 1), 200);
  let q = db.from("admin_audit").select("id,at,member_id,action,target,detail").order("id", { ascending: false }).limit(limit);
  const beforeId = Number(b.before);
  if (Number.isFinite(beforeId) && beforeId > 0) q = q.lt("id", beforeId);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as any[];
  const ids = [...new Set(rows.flatMap((r) => [r.member_id, UUID.test(r.target) ? r.target : null]).filter(Boolean))];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: ms, error: e2 } = await db.from("admin_members").select("id,name").in("id", ids);
    if (e2) throw e2;
    for (const m of (ms ?? []) as any[]) names.set(m.id, m.name);
  }
  return {
    ok: true,
    rows: rows.map((r) => ({ id: r.id, at: r.at, who: names.get(r.member_id) ?? "", action: r.action,
      target: names.get(r.target) ?? r.target, detail: r.detail })),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ ok: false, error: "unauthenticated" }, 401);
  const { data: ud, error: ue } = await db.auth.getUser(token);
  if (ue || !ud?.user) return json({ ok: false, error: "unauthenticated" }, 401);
  let b: any;
  try { b = await req.json(); } catch { return json({ ok: false, error: "bad-json" }, 400); }
  if (!b || typeof b !== "object" || Array.isArray(b)) return json({ ok: false, error: "bad-json" }, 400);
  const action = String(b.action ?? "");
  try {
    const ctx = await loadCtx(ud.user.id, ud.user.user_metadata);
    const gate = canCall(action, ctx.member ? { status: ctx.member.status, roles: ctx.roles } : null);
    if (gate !== "ok") return json({ ok: false, error: gate }, gate === "unknown-action" ? 400 : 403);
    switch (action) {
      case "me":               return json(await me(ctx));
      case "register":         return json(await register(ctx, b));
      case "membersList":      return json(await membersList());
      case "membersApprove":   return json(await membersApprove(ctx, b));
      case "membersSetRoles":  return json(await membersSetRoles(ctx, b));
      case "membersSetStatus": return json(await membersSetStatus(ctx, b));
      case "auditList":        return json(await auditList(b));
    }
    // ACTION_ROLES 에는 있는데 여기 없는 것 — 시험(PROBE)이 500/400 으로 잡는다
    return json({ ok: false, error: "unknown-action" }, 400);
  } catch (e) {
    console.error(action, e);
    const code = String((e as any)?.code ?? (e as any)?.message ?? e).slice(0, 80);
    return json({ ok: false, error: "server", code }, 500);
  }
});
```

- [ ] **Step 5: 개발에 배포**

Run: `cd /c/Projects/church-admin && git status --short && supabase functions deploy church-admin --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo`
Expected: `Deployed Functions on project ktpwthwqzgcqcrmsafdo: church-admin`. (배포는 작업 트리를 올린다 — `git status` 에 뜻하지 않은 변경이 없는지 먼저 본다.)
`config.toml` 을 CLI 가 받아들이지 않으면: `supabase init --force` 로 다시 만든 뒤 `[functions.church-admin] verify_jwt = false` 두 줄을 더하고 다시 배포.

- [ ] **Step 6: 시험 통과 확인**

Run: `set -a && . /c/Users/sewki/.church-admin/dev.env && set +a && node --experimental-strip-types --test tests/server.dev.test.mjs`
Expected: `# pass 9` · `# fail 0`. 실패하면 `supabase functions logs church-admin --project-ref ktpwthwqzgcqcrmsafdo` 로 서버 오류를 본다.

- [ ] **Step 7: 화면 확인용 씨앗 스크립트 — `tests/seed-dev.mjs`**

```js
// 개발 DB 에 화면 확인용 「승인 대기」 담당자 셋을 넣는다/지운다. 개발 전용.
//   set -a; . ~/.church-admin/dev.env; set +a
//   node tests/seed-dev.mjs          # 넣기(셋 중 하나는 개발의 기존 사역 담당자 「사랑 1목장 사역담당시험」과 같은 분)
//   node tests/seed-dev.mjs --clean  # ca-seed-·ca-test- 로 시작하는 시험 사용자를 모두 지운다
const URL_ = process.env.DEV_URL, SERVICE = process.env.DEV_SERVICE_KEY;
if (!URL_ || !URL_.includes("ktpwthwqzgcqcrmsafdo")) throw new Error("개발 프로젝트에만 돌린다");
const svc = { apikey: SERVICE, "Content-Type": "application/json",
  ...(SERVICE.startsWith("sb_secret_") ? {} : { Authorization: "Bearer " + SERVICE }) };

async function listTestUsers() {
  const r = await (await fetch(URL_ + "/auth/v1/admin/users?per_page=1000", { headers: svc })).json();
  return (r.users ?? []).filter((u) => /^ca-(seed|test)-/.test(u.email ?? ""));
}

if (process.argv.includes("--clean")) {
  const us = await listTestUsers();
  for (const u of us) await fetch(URL_ + "/auth/v1/admin/users/" + u.id, { method: "DELETE", headers: svc });
  console.log(`지웠다: ${us.length}명`);
} else {
  const seeds = [
    { name: "사역담당시험", gu: "사랑", mok: "1목장", kakao_nickname: "기존담당" },
    { name: "새담당시험", gu: "화평", mok: "20", kakao_nickname: "행복한하루" },
    { type: "교회학교", name: "교사시험", bu: "중등부", grade: "3학년", kakao_nickname: "" },
  ];
  for (const [i, s] of seeds.entries()) {
    const email = `ca-seed-${i}-${Date.now()}@example.test`;
    const u = await (await fetch(URL_ + "/auth/v1/admin/users", { method: "POST", headers: svc,
      body: JSON.stringify({ email, password: "S" + Date.now() + "!x", email_confirm: true }) })).json();
    const r = await fetch(URL_ + "/rest/v1/admin_members", { method: "POST", headers: svc,
      body: JSON.stringify({ type: "교구", ...s, auth_user_id: u.id, status: "pending" }) });
    console.log(s.name, r.status);
  }
}
```

Run: `node tests/seed-dev.mjs` → 셋 모두 `201`. 그다음 `node tests/seed-dev.mjs --clean` → `지웠다: 3명`. (Task 7 에서 다시 넣는다.)

- [ ] **Step 8: preflight · 커밋**

Run: `python tools/preflight.py` → `모두 통과`(`.dev.` 시험은 빠진다)

```bash
git add supabase/functions/church-admin/index.ts tests/server.dev.test.mjs tests/seed-dev.mjs
git commit -m "feat(서버): church-admin 함수 — 요청마다 토큰 검사 · 역할 확인 · 승인/역할/정지 · 바꾼 기록

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 화면 핵심 · 들어오는 화면(로그인·등록·대기·정지)

**Files:**
- Create: `js/core/auth.js`, `js/core/api.js`, `js/core/router.js`, `js/core/ui.js`, `js/screens/gate.js`, `js/menus/registry.js`, `js/menus/system/members.js`(임시 — Task 7 에서 채움), `js/menus/system/audit.js`(임시), `tests/router.test.mjs`, `tests/ui.test.mjs`, `tests/registry.test.mjs`
- Modify: `js/main.js`(통째로), `css/admin.css`(통째로)

**Interfaces:**
- Consumes: `window.SUPA`(Task 2) · 서버 액션 `me`·`register`(Task 5) · `knownRoles()`(Task 4, 시험에서만)
- Produces:
  - `auth.js`: `sb`(supabase 클라이언트) · `currentSession(): Promise<Session|null>` · `signInWithKakao(): Promise<void>` · `signOut(): Promise<void>` · `takeReturnHash(): string`
  - `api.js`: `call(action: string, payload?: object): Promise<{ok:boolean, …}>`(던지지 않음) · `setAuthLostHandler(fn: (code: string) => void)`
  - `router.js`: `parseHash(hash: string): {menu: string, sub: string, query: Record<string,string>}` · `go(path: string)`
  - `ui.js`: `esc(s)` · `affiliation(m)` · `kstTime(iso)` · `toast(msg)` · `dialog({title, text?, html?, ok?, cancel?, danger?}): Promise<boolean>` · `busy(root, fn)` · `errorText(r)`
  - `registry.js`: `MENUS: {id, group, icon, label, desc, role, load}[]` · `menusFor(roles: string[])`
  - 메뉴 모듈 약속: `export async function render(el: HTMLElement, ctx: {me, call, go, sub, query})` — `el` 은 route() 가 새로 만든 `<section>`

- [ ] **Step 1: 실패하는 시험 셋 쓰기**

`tests/router.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHash } from "../js/core/router.js";

test("parseHash", () => {
  assert.deepEqual(parseHash(""), { menu: "", sub: "", query: {} });
  assert.deepEqual(parseHash("#/"), { menu: "", sub: "", query: {} });
  assert.deepEqual(parseHash("#/members"), { menu: "members", sub: "", query: {} });
  assert.deepEqual(parseHash("#/ministry/list?view=people&q=%EA%B9%80"),
    { menu: "ministry", sub: "list", query: { view: "people", q: "김" } });
});
```

`tests/ui.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { esc, affiliation, kstTime, errorText } from "../js/core/ui.js";

test("esc", () => assert.equal(esc(`<a href="x">'&`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;"));

test("affiliation — 「화평 20목장」·「중등부 3학년」", () => {
  assert.equal(affiliation({ type: "교구", gu: "화평", mok: "20" }), "화평 20목장");
  assert.equal(affiliation({ type: "교구", gu: "화평", mok: "20목장" }), "화평 20목장");
  assert.equal(affiliation({ type: "교회학교", bu: "중등부", grade: "3학년" }), "중등부 3학년");
  assert.equal(affiliation(null), "");
});

test("kstTime — 한국 시각", () => {
  assert.equal(kstTime("2026-09-28T05:05:00Z"), "2026.09.28 14:05");
  assert.equal(kstTime(""), "");
  assert.equal(kstTime("nope"), "");
});

test("errorText — 코드는 괄호로 덧붙인다", () => {
  assert.equal(errorText({ error: "forbidden" }), "이 메뉴를 쓸 권한이 없어요");
  assert.equal(errorText({ error: "server", code: "42P01" }), "서버에서 문제가 생겼어요 (42P01)");
  assert.equal(errorText({ error: "???" }), "처리하지 못했어요");
});
```

`tests/registry.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { MENUS, menusFor } from "../js/menus/registry.js";
import { knownRoles } from "../supabase/functions/church-admin/authz.ts";

test("메뉴 역할은 서버가 아는 역할", () => {
  for (const m of MENUS) assert.ok(knownRoles().includes(m.role), `${m.id}: ${m.role}`);
});

test("메뉴 id 는 겹치지 않고 주소에 쓸 수 있다", () => {
  const ids = MENUS.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[a-z][a-z0-9-]*$/);
});

test("메뉴 모듈 파일이 있다", () => {
  for (const m of MENUS) {
    const p = String(m.load).match(/import\(["'](.+?)["']\)/)[1];
    assert.ok(existsSync(new URL(p, new URL("../js/menus/", import.meta.url))), `${m.id}: ${p}`);
  }
});

test("menusFor — super 는 전부, 역할 없으면 없음", () => {
  assert.equal(menusFor([]).length, 0);
  assert.equal(menusFor(undefined).length, 0);
  assert.equal(menusFor(["super"]).length, MENUS.length);
  assert.equal(menusFor(["ministry"]).length, MENUS.filter((m) => m.role === "ministry").length);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --experimental-strip-types --test tests/router.test.mjs tests/ui.test.mjs tests/registry.test.mjs`
Expected: FAIL — 모듈을 찾을 수 없음.

- [ ] **Step 3: `js/core/router.js`**

```js
// 주소의 # 뒤를 메뉴로 읽는다: #/메뉴/하위?조건
export function parseHash(hash) {
  const h = String(hash || "").replace(/^#\/?/, "");
  const [path, q = ""] = h.split("?");
  const parts = path.split("/").filter(Boolean);
  return { menu: parts[0] || "", sub: parts[1] || "", query: Object.fromEntries(new URLSearchParams(q)) };
}

export function go(path) {
  location.hash = "#/" + String(path || "").replace(/^[#/]+/, "");
}
```

- [ ] **Step 4: `js/core/ui.js`**

```js
// 공용 화면 부품 — 관리 화면 표준 v1. 확인·알림은 브라우저 confirm/alert 대신 이것만 쓴다.
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// 「화평 20목장」·「중등부 3학년」
export function affiliation(m) {
  if (!m) return "";
  if (m.type === "교회학교") return [m.bu, m.grade].filter(Boolean).join(" ");
  const mok = String(m.mok || "").replace(/목장$/, "");
  return [m.gu, mok ? mok + "목장" : ""].filter(Boolean).join(" ");
}

// 한국 시각 「2026.09.28 14:05」
export function kstTime(iso) {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
  if (isNaN(d)) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}.${p(d.getUTCMonth() + 1)}.${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

let toastTimer = 0;
// 결과 안내는 한 자리·한 꼴(화면 아래, 4초). 놓치면 안 되는 것은 toast 가 아니라 dialog.
export function toast(msg) {
  let el = document.querySelector(".adm-toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "adm-toast";
    el.setAttribute("role", "status");
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 4000);
}

// 확인 창 → Promise<boolean>. cancel:null 이면 알림 창(단추 하나).
// text 는 글자로 들어간다. html 을 쓰면 부르는 쪽이 이름·오류 글을 esc 로 감싼다.
export function dialog({ title = "", text = "", html = "", ok = "확인", cancel = "취소", danger = false } = {}) {
  return new Promise((resolve) => {
    const dim = document.createElement("div");
    dim.className = "dlg-dim";
    dim.innerHTML = `<div class="dlg" role="dialog" aria-modal="true"><h3></h3><div class="body"></div>
      <div class="acts">${cancel ? `<button type="button" class="btn" data-v="0"></button>` : ""}
      <button type="button" class="btn ${danger ? "danger" : "primary"}" data-v="1"></button></div></div>`;
    dim.querySelector("h3").textContent = title;
    const body = dim.querySelector(".body");
    if (html) body.innerHTML = html; else body.textContent = text;
    dim.querySelector('[data-v="1"]').textContent = ok;
    if (cancel) dim.querySelector('[data-v="0"]').textContent = cancel;
    const onKey = (e) => { if (e.key === "Escape") done(false); };
    const done = (v) => { dim.remove(); document.removeEventListener("keydown", onKey); resolve(v); };
    // 바깥을 **눌렀다 뗄 때 모두** 바깥이어야 닫는다(글을 끌어 고르다 밖에서 떼면 닫히던 사고 — 2026-09-17)
    let downOut = false;
    dim.addEventListener("pointerdown", (e) => { downOut = e.target === dim; });
    dim.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-v]");
      if (b) return done(b.dataset.v === "1");
      if (e.target === dim && downOut && cancel) done(false);
    });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(dim);
  });
}

// 저장 중에는 그 화면의 단추를 모두 잠근다 — 두 번 눌러 같은 요청이 두 번 가지 않게
export async function busy(root, fn) {
  const btns = [...root.querySelectorAll("button:not([disabled])")];
  btns.forEach((b) => (b.disabled = true));
  try { return await fn(); } finally { btns.forEach((b) => (b.disabled = false)); }
}

const MESSAGES = {
  network: "인터넷 연결을 확인해 주세요",
  server: "서버에서 문제가 생겼어요",
  unauthenticated: "로그인이 풀렸어요 — 다시 로그인해 주세요",
  "not-registered": "아직 등록되지 않았어요",
  pending: "승인을 기다리고 있어요",
  disabled: "사용이 멈춘 계정이에요",
  forbidden: "이 메뉴를 쓸 권한이 없어요",
  "unknown-action": "화면이 옛 판이에요 — 새로고침해 주세요",
  "bad-json": "잘못된 요청이에요",
  invalid: "잘못된 요청이에요",
  "name-required": "이름을 적어 주세요",
  "gu-mok-required": "교구와 목장을 적어 주세요",
  "bu-grade-required": "부서와 학년을 적어 주세요",
  "too-long": "한 칸에 40자까지 적을 수 있어요",
  "invalid-type": "교구·교회학교 중에서 골라 주세요",
  "already-registered": "이미 등록되어 있어요",
  "not-found": "그분을 찾지 못했어요 — 새로 불러와 주세요",
  "not-pending": "이미 처리된 분이에요 — 새로 불러와 주세요",
  conflict: "다른 분이 먼저 바꿨어요 — 새로 불러올게요",
  "invalid-roles": "역할을 다시 골라 주세요",
  "roles-required": "역할을 하나 이상 골라 주세요",
  "unknown-role": "없는 역할이에요",
  "use-approve": "승인 대기 중인 분은 「승인」으로 처리해 주세요",
  "invalid-status": "잘못된 요청이에요",
  self: "자기 자신은 정지할 수 없어요",
  "self-super": "자기 자신의 총괄 관리자 역할은 뺄 수 없어요",
  "last-super": "총괄 관리자가 한 분은 남아 있어야 해요",
};

// 서버 답 → 한 문장(+ 오류 번호)
export function errorText(r) {
  const base = MESSAGES[r?.error] || "처리하지 못했어요";
  return r?.code ? `${base} (${r.code})` : base;
}
```

- [ ] **Step 5: `js/menus/registry.js` 와 임시 메뉴 모듈 둘**

`js/menus/registry.js`:
```js
// 메뉴 목록 — 메뉴 하나 = 한 줄. role 은 서버 authz.ts 가 아는 역할이어야 한다(tests/registry.test.mjs).
// ⚠️ 여기서 숨기는 것은 편의일 뿐, 막는 것은 서버다.
export const MENUS = [
  { id: "members", group: "시스템", icon: "🔑", label: "담당자·역할", desc: "승인 대기 · 역할 주기 · 정지",
    role: "super", load: () => import("./system/members.js") },
  { id: "audit", group: "시스템", icon: "📜", label: "바꾼 기록", desc: "누가 언제 무엇을 바꿨나",
    role: "super", load: () => import("./system/audit.js") },
];

export function menusFor(roles) {
  const r = new Set(roles || []);
  return MENUS.filter((m) => r.has("super") || r.has(m.role));
}
```

`js/menus/system/members.js`(Task 7 에서 통째로 바뀐다):
```js
export async function render(el) { el.innerHTML = `<h2 class="page-title">🔑 담당자·역할</h2><p class="empty">준비 중</p>`; }
```

`js/menus/system/audit.js`(Task 7 에서 통째로 바뀐다):
```js
export async function render(el) { el.innerHTML = `<h2 class="page-title">📜 바꾼 기록</h2><p class="empty">준비 중</p>`; }
```

- [ ] **Step 6: 시험 통과 확인**

Run: `node --experimental-strip-types --test tests/router.test.mjs tests/ui.test.mjs tests/registry.test.mjs`
Expected: `# fail 0`

- [ ] **Step 7: `js/core/auth.js` · `js/core/api.js`**

`js/core/auth.js`:
```js
// 카카오 로그인(Supabase Auth). 세션은 이 브라우저에 남아 매번 카카오를 거치지 않는다.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm";

export const sb = createClient(window.SUPA.URL, window.SUPA.ANON, {
  auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true,
    storageKey: "church-admin-auth" },
});

export async function currentSession() {
  const { data } = await sb.auth.getSession();
  return data?.session ?? null;
}

// 카카오를 거치면 # 뒤가 사라진다 — 보던 화면을 적어 두었다가 돌아와서 연다
export async function signInWithKakao() {
  try { sessionStorage.setItem("ca-return", location.hash || ""); } catch { /* 사생활 보호 모드 */ }
  const { error } = await sb.auth.signInWithOAuth({
    provider: "kakao",
    options: { redirectTo: location.origin + location.pathname },
  });
  if (error) throw error;
}

export function takeReturnHash() {
  try {
    const h = sessionStorage.getItem("ca-return") || "";
    sessionStorage.removeItem("ca-return");
    return h;
  } catch { return ""; }
}

export async function signOut() {
  await sb.auth.signOut();
}
```

`js/core/api.js`:
```js
import { sb } from "./auth.js";

// 권한을 잃었을 때(로그인 풀림·정지·역할 회수) 부를 것 — main.js 가 정한다
let onLost = () => {};
export function setAuthLostHandler(fn) { onLost = fn; }
const LOST = new Set(["unauthenticated", "not-registered", "pending", "disabled", "forbidden"]);

// 서버 호출. **던지지 않는다** — 늘 { ok, … } 를 돌려준다.
//   { ok:true, … } 성공 · { ok:false, confirm, message } 되물을 것 · { ok:false, error, code? } 실패
export async function call(action, payload = {}) {
  const { data } = await sb.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) { onLost("unauthenticated"); return { ok: false, error: "unauthenticated" }; }
  let res;
  try {
    res = await fetch(window.SUPA.URL + "/functions/v1/church-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: window.SUPA.ANON, Authorization: "Bearer " + token },
      body: JSON.stringify({ ...payload, action }),
    });
  } catch { return { ok: false, error: "network" }; }
  const body = await res.json().catch(() => null);
  if (!body || typeof body !== "object") return { ok: false, error: "server", code: "HTTP " + res.status };
  if (body.ok === false && LOST.has(body.error) && action !== "me") onLost(body.error);
  return body;
}
```

- [ ] **Step 8: `js/screens/gate.js`**

```js
// 들어오는 화면들 — 로그인 · 처음 등록 · 승인 대기 · 정지 · 오류
import { esc, errorText, busy, affiliation } from "../core/ui.js";

// 성경암송 앱(app.js GU_LIST·BU_LIST)과 같게 — 교구·부서가 늘면 두 곳을 함께 고친다(서버는 목록을 거르지 않는다)
const GU_LIST = ["믿음", "소망", "사랑", "섬김", "은혜", "화평", "기쁨", "새가족"];
const BU_LIST = ["사랑부", "영아부", "유아부", "유치부", "유년부", "초등부", "중등부", "고등부", "청년부"];

export function renderLogin(el, { onKakao }) {
  el.innerHTML = `<div class="gate"><div class="card">
    <h2>고척교회 관리</h2>
    <p>교회 담당자만 들어올 수 있어요.<br>카카오로 로그인한 뒤 승인을 받으면 메뉴가 열려요.</p>
    <button type="button" class="kakao">카카오로 시작하기</button>
  </div></div>`;
  el.querySelector(".kakao").onclick = onKakao;
}

export function renderRegister(el, { nickname = "", member = null, onSubmit, onSignOut }) {
  const v = member || { type: "교구", gu: "", mok: "", bu: "", grade: "", name: "" };
  el.innerHTML = `<div class="gate"><div class="card">
    <h2>${member ? "적은 것 고치기" : "처음 오셨어요"}</h2>
    <p>${nickname ? `카카오 「${esc(nickname)}」로 로그인했어요.<br>` : ""}성경암송 앱에 로그인할 때와 같이 적어 주세요.</p>
    <form novalidate>
      <div class="seg" role="group" aria-label="소속 종류">
        <button type="button" data-t="교구">교구</button><button type="button" data-t="교회학교">교회학교</button>
      </div>
      <div data-for="교구">
        <label class="field"><span>교구</span><select name="gu"><option value="">고르기</option>${GU_LIST.map((g) => `<option>${g}</option>`).join("")}</select></label>
        <label class="field"><span>목장</span><input name="mok" inputmode="numeric" placeholder="예: 20" autocomplete="off"></label>
      </div>
      <div data-for="교회학교">
        <label class="field"><span>부서</span><select name="bu"><option value="">고르기</option>${BU_LIST.map((b) => `<option>${b}</option>`).join("")}</select></label>
        <label class="field"><span>학년</span><input name="grade" placeholder="예: 3학년" autocomplete="off"></label>
      </div>
      <label class="field"><span>이름</span><input name="name" autocomplete="name"></label>
      <p class="err" aria-live="polite"></p>
      <button type="submit" class="btn primary wide">승인 요청하기</button>
    </form>
    <div class="stack" style="margin-top:12px"><button type="button" class="btn wide out">다른 카카오 계정으로</button></div>
  </div></div>`;
  const f = el.querySelector("form");
  let type = v.type === "교회학교" ? "교회학교" : "교구";
  const setType = (t) => {
    type = t;
    el.querySelectorAll(".seg button").forEach((b) => b.classList.toggle("on", b.dataset.t === t));
    el.querySelectorAll("[data-for]").forEach((d) => (d.hidden = d.dataset.for !== t));
  };
  el.querySelectorAll(".seg button").forEach((b) => (b.onclick = () => setType(b.dataset.t)));
  for (const k of ["gu", "mok", "bu", "grade", "name"]) f.elements[k].value = v[k] || "";
  setType(type);
  el.querySelector(".out").onclick = onSignOut;
  f.onsubmit = (e) => {
    e.preventDefault();
    const identity = { type, name: f.elements.name.value };
    if (type === "교구") Object.assign(identity, { gu: f.elements.gu.value, mok: f.elements.mok.value });
    else Object.assign(identity, { bu: f.elements.bu.value, grade: f.elements.grade.value });
    busy(el, async () => {
      const r = await onSubmit(identity);
      if (r && !r.ok) el.querySelector(".err").textContent = errorText(r);
    });
  };
}

export function renderPending(el, { member, onRefresh, onEdit, onSignOut }) {
  el.innerHTML = `<div class="gate"><div class="card">
    <h2>승인을 기다리고 있어요</h2>
    <p><b>${esc(affiliation(member))} ${esc(member.name)}</b> 님으로 요청했어요.<br>총괄 관리자에게 「승인 요청했어요」라고 알려 주세요.</p>
    <div class="stack">
      <button type="button" class="btn primary wide r">승인됐는지 다시 보기</button>
      <button type="button" class="btn wide e">적은 것 고치기</button>
      <button type="button" class="btn wide o">로그아웃</button>
    </div></div></div>`;
  el.querySelector(".r").onclick = onRefresh;
  el.querySelector(".e").onclick = onEdit;
  el.querySelector(".o").onclick = onSignOut;
}

export function renderDisabled(el, { onSignOut }) {
  el.innerHTML = `<div class="gate"><div class="card">
    <h2>사용이 멈춘 계정이에요</h2>
    <p>다시 쓰셔야 하면 총괄 관리자에게 알려 주세요.</p>
    <div class="stack"><button type="button" class="btn wide o">로그아웃</button></div>
  </div></div>`;
  el.querySelector(".o").onclick = onSignOut;
}

export function renderError(el, { message, onRetry }) {
  el.innerHTML = `<div class="gate"><div class="card">
    <h2>열지 못했어요</h2><p>${esc(message)}</p>
    <div class="stack"><button type="button" class="btn primary wide r">다시 시도</button></div>
  </div></div>`;
  el.querySelector(".r").onclick = onRetry;
}
```

- [ ] **Step 9: `js/main.js`(통째로)**

```js
// 부팅 · 껍데기(머리줄·메뉴) · 길 찾기
import { currentSession, signInWithKakao, signOut, takeReturnHash } from "./core/auth.js";
import { call, setAuthLostHandler } from "./core/api.js";
import { parseHash, go } from "./core/router.js";
import { menusFor } from "./menus/registry.js";
import { esc, toast, errorText, affiliation } from "./core/ui.js";
import { renderLogin, renderRegister, renderPending, renderDisabled, renderError } from "./screens/gate.js";

const app = document.getElementById("app");
let me = null;
let booting = false;

const onKakao = () => signInWithKakao().catch((e) => toast("카카오 로그인을 열지 못했어요 — " + (e?.message || e)));
const onSignOut = async () => { await signOut(); history.replaceState(null, "", location.pathname); boot(); };
async function register(identity) {
  const r = await call("register", { identity });
  if (r.ok) await boot();
  return r;
}

async function boot() {
  if (booting) return;
  booting = true;
  try {
    me = null;
    document.body.classList.remove("nav-open");
    const session = await currentSession();
    if (!session) return renderLogin(app, { onKakao });
    const r = await call("me");
    if (!r.ok) return renderError(app, { message: errorText(r), onRetry: boot });
    if (!r.registered) return renderRegister(app, { nickname: r.kakao_nickname, onSubmit: register, onSignOut });
    if (r.status === "pending") {
      return renderPending(app, { member: r.member, onRefresh: boot, onSignOut,
        onEdit: () => renderRegister(app, { nickname: r.kakao_nickname, member: r.member, onSubmit: register, onSignOut }) });
    }
    if (r.status !== "active") return renderDisabled(app, { onSignOut });
    me = r;
    const back = takeReturnHash();
    if (back && back !== location.hash) history.replaceState(null, "", location.pathname + back);
    renderShell();
    await route();
  } finally {
    booting = false;
  }
}

function renderShell() {
  const menus = menusFor(me.roles);
  const groups = [...new Set(menus.map((m) => m.group))];
  app.innerHTML = `
    <header class="top">
      <button type="button" class="icon-btn menu" aria-label="메뉴 열기">☰</button>
      <h1>고척교회 관리</h1>
      <span class="who">${esc(me.member.name)}</span>
      <button type="button" class="out">로그아웃</button>
    </header>
    <nav class="nav" aria-label="메뉴">
      <a href="#/" data-id="">🏠 처음</a>
      ${groups.map((g) => `<h3>${esc(g)}</h3>` + menus.filter((m) => m.group === g)
        .map((m) => `<a href="#/${m.id}" data-id="${m.id}">${m.icon} ${esc(m.label)}</a>`).join("")).join("")}
    </nav>
    <div class="nav-dim" hidden></div>
    <main class="view" id="view"></main>`;
  const dim = app.querySelector(".nav-dim");
  const setNav = (open) => { document.body.classList.toggle("nav-open", open); dim.hidden = !open; };
  app.querySelector(".menu").onclick = () => setNav(!document.body.classList.contains("nav-open"));
  dim.onclick = () => setNav(false);
  app.querySelector(".nav").addEventListener("click", (e) => { if (e.target.closest("a")) setNav(false); });
  app.querySelector(".out").onclick = onSignOut;
}

async function route() {
  if (!me) return;
  const view = document.getElementById("view");
  if (!view) return;
  const { menu, sub, query } = parseHash(location.hash);
  const menus = menusFor(me.roles);
  app.querySelectorAll(".nav a").forEach((a) => a.classList.toggle("on", a.dataset.id === menu));
  window.scrollTo(0, 0);
  // 메뉴마다 새 <section> — 앞 메뉴가 달아 둔 이벤트가 다음 메뉴로 새지 않게
  const host = document.createElement("section");
  view.replaceChildren(host);
  const m = menus.find((x) => x.id === menu);
  if (!m) return renderHome(host, menus);
  host.innerHTML = `<p class="empty">불러오는 중…</p>`;
  try {
    const mod = await m.load();
    await mod.render(host, { me, call, go, sub, query });
  } catch (e) {
    console.error(e);
    host.innerHTML = `<p class="empty">화면을 열지 못했어요 — 새로고침해 주세요</p>`;
  }
}

function renderHome(host, menus) {
  host.innerHTML = `<h2 class="page-title">${esc(me.member.name)} 님, 평안하세요</h2>
    <p class="muted" style="margin-bottom:12px">${esc(affiliation(me.member))} · ${esc(me.roles_info.map((r) => r.label).join(" · ") || "역할 없음")}</p>
    ${menus.length
      ? menus.map((m) => `<a class="card home-card" href="#/${m.id}">${m.icon} <b>${esc(m.label)}</b><br><span class="muted">${esc(m.desc)}</span></a>`).join("")
      : `<p class="empty">아직 쓸 수 있는 메뉴가 없어요 — 총괄 관리자에게 역할을 받아 주세요</p>`}`;
}

let lostAt = 0;
setAuthLostHandler((code) => {
  if (Date.now() - lostAt < 3000) return;   // 한 화면에서 여러 요청이 한꺼번에 막혀도 한 번만
  lostAt = Date.now();
  toast(code === "unauthenticated" ? "로그인이 풀렸어요" : "권한이 바뀌었어요 — 다시 확인할게요");
  boot();
});
window.addEventListener("hashchange", () => { route(); });
boot();
```

- [ ] **Step 10: `css/admin.css`(통째로)**

```css
/* 관리 화면 표준 v1 부품 — 값은 css/tokens.css 에서만 */
*{box-sizing:border-box;margin:0;padding:0}
[hidden]{display:none!important}   /* display:flex 가 hidden 을 이기던 사고(2026-09-17) */
html{-webkit-text-size-adjust:100%}
body{font-family:"Noto Sans KR",system-ui,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;
  background:var(--cream);color:#222;font-size:15px;line-height:1.5;min-height:100vh}
button,input,select{font:inherit;color:inherit}
a{color:var(--navy)}
.boot{padding:40vh 20px 0;text-align:center;color:var(--gray)}

/* 머리줄 — 늘 위에 붙는다 */
.top{position:sticky;top:0;z-index:30;height:var(--head-h);display:flex;align-items:center;gap:var(--gap);
  padding:0 12px;background:linear-gradient(135deg,var(--navy-dark),var(--navy));color:#fff}
.top h1{font-size:1.05rem;font-weight:800;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.top .icon-btn{width:var(--tap);height:var(--tap);border:0;border-radius:10px;background:rgba(255,255,255,.12);color:#fff;font-size:1.2rem;cursor:pointer}
.top .who{font-size:13px;opacity:.9;white-space:nowrap;max-width:30vw;overflow:hidden;text-overflow:ellipsis}
.top .out{height:var(--chip);padding:0 12px;border-radius:999px;border:1px solid rgba(255,255,255,.35);
  background:rgba(255,255,255,.12);color:#fff;font-size:13px;cursor:pointer;white-space:nowrap}

/* 메뉴 — 폰: 왼쪽에서 나오는 서랍 / PC: 늘 보이는 옆 메뉴 */
.nav{position:fixed;top:var(--head-h);left:0;bottom:0;width:min(var(--nav-w),84vw);background:#fff;
  border-right:1px solid var(--border);overflow-y:auto;z-index:25;transform:translateX(-100%);transition:transform .2s;padding:8px 0 24px}
body.nav-open .nav{transform:none}
.nav-dim{position:fixed;top:var(--head-h);left:0;right:0;bottom:0;background:rgba(0,0,0,.3);z-index:24}
.nav h3{font-size:13px;color:var(--gray);padding:14px 16px 6px;font-weight:700}
.nav a{display:flex;align-items:center;gap:8px;min-height:var(--tap);padding:0 16px;color:#222;text-decoration:none;font-size:15px}
.nav a.on{background:var(--ghost-bg);color:var(--navy);font-weight:700;border-left:4px solid var(--navy);padding-left:12px}
.view{max-width:900px;margin:0 auto;padding:16px 16px 96px}
@media (min-width:1024px){
  .top .icon-btn.menu{display:none}
  .nav{transform:none;transition:none}
  .nav-dim{display:none!important}
  .view{margin-left:var(--nav-w);max-width:none;padding:24px 32px 96px}
}

/* 단추 — 주 동작 48 · 보조 44 · 위험 44 */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:var(--tap);padding:0 16px;
  border-radius:10px;border:1px solid var(--ghost-bd);background:var(--ghost-bg);color:var(--navy);
  font-size:.95rem;font-weight:600;cursor:pointer;text-decoration:none}
.btn.primary{min-height:var(--tap-lg);font-size:1rem;background:var(--navy);border-color:var(--navy);color:#fff}
.btn.danger{background:var(--danger-bg);border-color:var(--danger-bd);color:var(--error)}
.btn:disabled{opacity:.45;cursor:default}
.btn.wide{width:100%}
.acts{display:flex;gap:8px;flex-wrap:wrap}
.acts .btn{flex:1 1 0;min-width:0}
.stack{display:flex;flex-direction:column;gap:8px}
summary.btn{list-style:none}
summary.btn::-webkit-details-marker{display:none}

/* 카드·글 */
.page-title{font-size:1.15rem;font-weight:800;color:var(--navy);margin:4px 0 12px}
.sec-title{font-size:15px;font-weight:800;color:var(--navy-dark);margin:20px 0 8px}
.card{background:#fff;border:1px solid var(--border);border-radius:14px;padding:var(--card-pad);margin-bottom:var(--gap)}
a.card{display:block;color:inherit;text-decoration:none}
.muted{color:var(--gray);font-size:13px}
.badge{display:inline-flex;align-items:center;min-height:24px;padding:0 8px;border-radius:999px;font-size:13px;background:var(--light);color:#333}
.badge.ok{background:#e6f2e6;color:var(--green)}
.empty{padding:28px 0;text-align:center;color:var(--gray);font-size:14px}

/* 입력 */
.field{display:block;margin-bottom:12px}
.field > span{display:block;font-size:13px;color:var(--gray);margin-bottom:4px}
.field input,.field select{width:100%;min-height:var(--tap);padding:0 12px;border:1px solid var(--border);border-radius:10px;background:#fff;font-size:1rem}
.seg{display:flex;gap:8px;margin-bottom:12px}
.seg button{flex:1;min-height:var(--chip);border-radius:999px;border:1px solid var(--border);background:#fff;font-size:13px;cursor:pointer}
.seg button.on{background:var(--navy);border-color:var(--navy);color:#fff;font-weight:700}
.checks{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}
.checks label{display:inline-flex;align-items:center;gap:6px;min-height:var(--chip);padding:0 12px;border:1px solid var(--border);
  border-radius:999px;background:#fff;font-size:13px;cursor:pointer}
.checks input{width:18px;height:18px}

/* 들어오는 화면 */
.gate{max-width:380px;margin:10vh auto 0;padding:0 16px}
.gate .card{padding:28px 22px;text-align:center}
.gate h2{font-size:1.25rem;color:var(--navy);margin-bottom:8px}
.gate p{color:var(--gray);font-size:14px;margin-bottom:18px}
.gate form{text-align:left}
.kakao{width:100%;min-height:var(--tap-lg);border:0;border-radius:10px;background:#FEE500;color:#191600;font-size:1rem;font-weight:700;cursor:pointer}
.err{color:var(--error);font-size:14px;margin:6px 0 10px;min-height:1.2em}

/* 토스트·확인 창 */
.adm-toast{position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);
  max-width:min(92vw,480px);background:#222;color:#fff;padding:12px 16px;border-radius:12px;font-size:14px;z-index:60;
  box-shadow:0 6px 20px rgba(0,0,0,.2)}
.dlg-dim{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:50;display:flex;align-items:center;justify-content:center;padding:16px}
.dlg{background:#fff;border-radius:16px;max-width:420px;width:100%;max-height:85vh;overflow-y:auto;padding:22px 20px}
.dlg h3{font-size:1.05rem;color:var(--navy-dark);margin-bottom:8px}
.dlg .body{font-size:14px;color:#333;margin-bottom:16px;white-space:pre-line}
```

- [ ] **Step 11: preflight**

Run: `python tools/preflight.py`
Expected: `js/core/*.js`·`js/screens/gate.js`·`js/menus/**`·`js/main.js` 문법 통과, 시험 파일 4개 통과, `모두 통과`.

- [ ] **Step 12: 개발 DB 로 들어와 보기(친구와 함께)**

Run: `python -m http.server 8000`(저장소 루트, 백그라운드) → PC 브라우저 `http://localhost:8000`
확인할 것:
1. 「카카오로 시작하기」 → 카카오 → 돌아오면 「처음 오셨어요」, 카카오 별명이 보인다.
2. 이름 비우고 요청 → 「이름을 적어 주세요」. 다 적고 요청 → 「승인을 기다리고 있어요」.
3. 「적은 것 고치기」 → 적었던 값이 채워져 있다 → 고쳐서 요청 → 대기 화면에 고친 소속.
4. 친구를 첫 super 로 올린다(개발). 먼저 id 를 본다:
   `supabase --workdir /c/Users/sewki/.church-admin/supa-dev db query --linked "select id, name, gu, mok, kakao_nickname from admin_members where status='pending' order by created_at desc limit 5"`
   친구 줄의 id 로(이름은 파일에 적지 않는다):
   `supabase --workdir /c/Users/sewki/.church-admin/supa-dev db query --linked "with m as (update admin_members set status='active', approved_at=now() where id='<그 id>' and status='pending' returning id) insert into admin_role_grants (member_id, role_id) select id, 'super' from m returning member_id"`
5. 「승인됐는지 다시 보기」 → 머리줄·메뉴(시스템: 담당자·역할, 바꾼 기록)·처음 화면 「역할: 총괄 관리자」.
6. 폭 360px(개발자 도구 기기 모드): ☰ 로 서랍이 열리고 메뉴를 누르면 닫힌다. 1280px: 왼쪽 메뉴가 늘 보인다.
7. `#/members` 에서 새로고침 → 로그인 유지, 같은 화면. 로그아웃 → 로그인 화면.

- [ ] **Step 13: 커밋 · 푸시**

```bash
git add js css tests/router.test.mjs tests/ui.test.mjs tests/registry.test.mjs
git commit -m "feat(화면): 카카오 로그인 · 등록 · 승인 대기 · 껍데기(폰 서랍/PC 옆 메뉴) · 메뉴 목록

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```
Expected: Actions 성공. `https://sewoongkim1.github.io/church-admin/` 도 개발 DB 로 뜬다(카카오 돌아오는 주소가 Task 1 에서 등록돼 있다).

---

### Task 7: 담당자·역할 화면 · 바꾼 기록 화면

**Files:**
- Modify: `js/menus/system/members.js`(통째로), `js/menus/system/audit.js`(통째로)

**Interfaces:**
- Consumes: `membersList`·`membersApprove`·`membersSetRoles`·`membersSetStatus`·`auditList`(Task 5) · `ui.js` 전부(Task 6) · 메뉴 모듈 약속 `render(el, {me, call})`

- [ ] **Step 1: `js/menus/system/members.js`**

```js
// 담당자·역할 — 총괄 관리자(super)만.
//   승인 대기 → 승인(역할 고르기) / 거절 · 사용 중 → 역할 바꾸기 / 정지 · 정지됨 → 다시 사용
// 막는 것은 서버다(스스로 정지·스스로 super 빼기·마지막 super 는 서버가 거절한다). 화면은 그 단추를 미리 감출 뿐.
import { esc, affiliation, kstTime, toast, dialog, busy, errorText } from "../../core/ui.js";

const TITLE = `<h2 class="page-title">🔑 담당자·역할</h2>`;

export async function render(el, { me, call }) {
  el.innerHTML = TITLE + `<p class="empty">불러오는 중…</p>`;
  const r = await call("membersList");
  if (!r.ok) { el.innerHTML = TITLE + `<p class="empty">${esc(errorText(r))}</p>`; return; }
  draw(el, r, me, call);
}

const labelsOf = (roles, ids) => roles.filter((ro) => ids.includes(ro.id)).map((ro) => ro.label).join(" · ");
const picked = (card) => [...card.querySelectorAll(".checks input:checked")].map((i) => i.value);
const who = (m) => `<b>${esc(m.name)}</b> <span class="muted">${esc(affiliation(m))}</span>`;

function roleChecks(roles, checked, disabledIds = []) {
  return `<div class="checks">${roles.map((ro) => `<label title="${esc(ro.description)}">
    <input type="checkbox" value="${esc(ro.id)}" ${checked.includes(ro.id) ? "checked" : ""} ${disabledIds.includes(ro.id) ? "disabled" : ""}>
    ${esc(ro.label)}</label>`).join("")}</div>`;
}

function pendingCard(m, roles) {
  return `<div class="card" data-id="${esc(m.id)}">
    <div>${who(m)}</div>
    <div class="muted">카카오 「${esc(m.kakao_nickname || "별명 없음")}」 · 요청 ${esc(kstTime(m.created_at))}</div>
    ${m.known_ministry_staff ? `<p style="margin-top:6px"><span class="badge ok">✅ 기존 사역 담당자와 같은 분</span></p>` : ""}
    ${roleChecks(roles, m.known_ministry_staff ? ["ministry"] : [])}
    <div class="acts">
      <button type="button" class="btn danger" data-act="reject">거절</button>
      <button type="button" class="btn primary" data-act="approve">승인</button>
    </div>
  </div>`;
}

function activeCard(m, roles, meId) {
  const self = m.id === meId;
  const chips = roles.filter((ro) => m.roles.includes(ro.id)).map((ro) => `<span class="badge">${esc(ro.label)}</span>`).join(" ");
  return `<div class="card" data-id="${esc(m.id)}">
    <div>${who(m)} ${self ? `<span class="badge ok">나</span>` : ""}</div>
    <div style="margin:6px 0">${chips || `<span class="muted">역할 없음 — 메뉴가 보이지 않아요</span>`}</div>
    <div class="muted">마지막 접속 ${esc(kstTime(m.last_login_at) || "없음")}${m.approved_by_name ? ` · ${esc(m.approved_by_name)} 님이 승인` : ""}</div>
    <details style="margin-top:10px"><summary class="btn">역할 바꾸기</summary>
      ${roleChecks(roles, m.roles, self ? ["super"] : [])}
      <div class="acts"><button type="button" class="btn primary" data-act="roles">역할 저장</button></div>
    </details>
    ${self ? "" : `<div class="acts" style="margin-top:8px"><button type="button" class="btn danger" data-act="disable">정지</button></div>`}
  </div>`;
}

function disabledCard(m) {
  return `<div class="card" data-id="${esc(m.id)}">
    <div>${who(m)}</div>
    <div class="muted">카카오 「${esc(m.kakao_nickname || "별명 없음")}」${m.roles.length ? "" : " · 승인된 적 없음"}</div>
    <div class="acts" style="margin-top:8px"><button type="button" class="btn" data-act="enable">다시 사용</button></div>
  </div>`;
}

function draw(el, r, me, call) {
  const by = (s) => r.members.filter((m) => m.status === s);
  const pending = by("pending"), active = by("active"), disabled = by("disabled");
  el.innerHTML = TITLE + `
    <div class="acts" style="margin-bottom:4px"><button type="button" class="btn" data-act="reload">↻ 새로 불러오기</button></div>
    <h3 class="sec-title">승인 대기 ${pending.length}명</h3>
    ${pending.length ? pending.map((m) => pendingCard(m, r.roles)).join("") : `<p class="empty">기다리는 분이 없어요</p>`}
    <h3 class="sec-title">사용 중 ${active.length}명</h3>
    ${active.map((m) => activeCard(m, r.roles, me.member.id)).join("")}
    ${disabled.length ? `<h3 class="sec-title">정지됨 ${disabled.length}명</h3>${disabled.map(disabledCard).join("")}` : ""}`;

  const reload = () => render(el, { me, call });
  el.onclick = async (e) => {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "reload") return reload();
    const card = b.closest(".card");
    const m = r.members.find((x) => x.id === card?.dataset.id);
    if (!m) return;
    const name = `${m.name}(${affiliation(m)})`;
    let res;
    if (act === "approve") {
      const roles = picked(card);
      if (!roles.length) return toast("역할을 하나 이상 골라 주세요");
      if (!(await dialog({ title: "승인할까요?", text: `${name} 님을 승인하고\n「${labelsOf(r.roles, roles)}」 역할을 드려요.`, ok: "승인" }))) return;
      res = await busy(el, () => call("membersApprove", { member_id: m.id, roles }));
    } else if (act === "reject") {
      if (!(await dialog({ title: "거절할까요?", text: `${name} 님의 요청을 거절해요.\n「정지됨」으로 옮겨지고 들어올 수 없어요.`, ok: "거절", danger: true }))) return;
      res = await busy(el, () => call("membersSetStatus", { member_id: m.id, status: "disabled" }));
    } else if (act === "roles") {
      const roles = picked(card);
      if (!roles.length) return toast("역할을 하나 이상 골라 주세요 — 못 들어오게 하려면 「정지」를 눌러 주세요");
      res = await busy(el, () => call("membersSetRoles", { member_id: m.id, roles }));
    } else if (act === "disable") {
      if (!(await dialog({ title: "정지할까요?", text: `${name} 님은 다음 요청부터 바로 아무 메뉴도 쓸 수 없어요.`, ok: "정지", danger: true }))) return;
      res = await busy(el, () => call("membersSetStatus", { member_id: m.id, status: "disabled" }));
    } else if (act === "enable") {
      res = await busy(el, () => call("membersSetStatus", { member_id: m.id, status: "active" }));
    } else {
      return;
    }
    if (!res.ok) {
      await dialog({ title: "처리하지 못했어요", text: errorText(res), cancel: null });
      return reload();
    }
    toast("저장했어요");
    reload();
  };
}
```

- [ ] **Step 2: `js/menus/system/audit.js`**

```js
// 바꾼 기록 — 총괄 관리자(super)만. 최근 100건.
import { esc, kstTime, errorText } from "../../core/ui.js";

const TITLE = `<h2 class="page-title">📜 바꾼 기록</h2>`;
const LABEL = {
  register: "승인 요청", "register.update": "요청 고침",
  "members.approve": "승인", "members.roles": "역할 바꿈", "members.status": "상태 바꿈",
};
const STATUS = { pending: "대기", active: "사용", disabled: "정지" };

function detailText(r) {
  const d = r.detail || {};
  if (r.action === "members.approve") return "역할: " + (d.roles || []).join(", ");
  if (r.action === "members.roles") return (d.before || []).join(", ") + " → " + (d.after || []).join(", ");
  if (r.action === "members.status") return (STATUS[d.before] || d.before || "") + " → " + (STATUS[d.after] || d.after || "");
  if (r.action.startsWith("register")) return [d.gu, d.mok, d.bu, d.grade].filter(Boolean).join(" ");
  return "";
}

export async function render(el, { call }) {
  el.innerHTML = TITLE + `<p class="empty">불러오는 중…</p>`;
  const r = await call("auditList", { limit: 100 });
  if (!r.ok) { el.innerHTML = TITLE + `<p class="empty">${esc(errorText(r))}</p>`; return; }
  el.innerHTML = TITLE + `<p class="muted" style="margin-bottom:10px">최근 ${r.rows.length}건</p>` +
    (r.rows.length ? r.rows.map((x) => `<div class="card">
      <div><b>${esc(LABEL[x.action] || x.action)}</b> · ${esc(x.target)}</div>
      <div class="muted">${esc(kstTime(x.at))} · ${esc(x.who || "(지워진 분)")}</div>
      ${detailText(x) ? `<div style="margin-top:4px;font-size:14px">${esc(detailText(x))}</div>` : ""}
    </div>`).join("") : `<p class="empty">아직 기록이 없어요</p>`);
}
```

- [ ] **Step 3: preflight**

Run: `python tools/preflight.py` → `모두 통과`

- [ ] **Step 4: 화면 확인(개발 DB)**

Run: `set -a && . /c/Users/sewki/.church-admin/dev.env && set +a && node tests/seed-dev.mjs` → 셋 `201`
`http://localhost:8000/#/members`(친구 super 계정)에서 확인:
1. 승인 대기 3명. 「사역담당시험(사랑 1목장)」에만 「✅ 기존 사역 담당자와 같은 분」이 붙고 「사역신청 담당」이 미리 체크돼 있다. (개발 `app_config.ministryAdmins` 에 그분이 없어 표시가 안 나오면: `select value from app_config where key='ministryAdmins'` 로 등록 키를 보고 씨앗의 목장·이름을 그 키에 맞춘다.)
2. 역할 없이 「승인」 → 토스트 「역할을 하나 이상 골라 주세요」. 체크하고 승인 → 확인 창 → 「사용 중」으로 옮겨진다.
3. 「교사시험」 거절 → 「정지됨」에 「승인된 적 없음」. 「다시 사용」 → 사용 중, 「역할 없음 — 메뉴가 보이지 않아요」.
4. 내 카드: 「나」 표시 · 정지 단추 없음 · 역할 바꾸기에서 총괄 관리자 체크가 잠겨 있다.
5. 확인 창 바깥을 눌렀다 떼면 닫히고, 창 안에서 끌어 바깥에서 떼면 안 닫힌다. Esc 로 닫힌다.
6. 저장하는 동안 단추가 흐려진다(두 번 눌러지지 않는다).
7. `#/audit`: 승인·거절·다시 사용이 시각·누가와 함께 보인다.
8. 360px·1280px 두 폭에서 카드·단추가 화면 밖으로 나가지 않는다.
끝나면 `node tests/seed-dev.mjs --clean`.

- [ ] **Step 5: 커밋 · 푸시**

```bash
git add js/menus/system/members.js js/menus/system/audit.js
git commit -m "feat(담당자): 승인 대기·승인·거절·역할 바꾸기·정지·다시 사용 · 바꾼 기록 화면

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 8: 운영 올리기 — admin.onlybible.kr

⚠️ 운영 DB·운영 Auth 설정을 건드린다. **단계마다 친구에게 확인받고** 진행한다. Step 1 의 점검에서 문제가 나오면 **거기서 멈춘다.**

**Files:**
- Modify(이 저장소 `bible-memorize-church-app-v2`): `CLAUDE.md`(표 한 줄 + 다음 작업 한 줄)

**Interfaces:**
- Consumes: Task 3 SQL 두 개 · Task 5 함수 · Task 7 까지의 화면

- [ ] **Step 1: 운영 작업 폴더 link · 운영 노출 점검(읽기만)**

```bash
mkdir -p /c/Users/sewki/.church-admin/supa-prod && cd /c/Users/sewki/.church-admin/supa-prod \
  && supabase init --force && supabase link --project-ref xnomlgydifiqiybervtf
P=/c/Users/sewki/.church-admin/supa-prod
supabase --workdir $P db query --linked "select count(*) from users"
supabase --workdir $P db query --linked "select coalesce(raw_app_meta_data->>'provider','?') as provider, count(*) from auth.users group by 1"
cd /c/Projects/church-admin && supabase --workdir $P db query --linked -f supabase/sql/check-authenticated-exposure.sql
```
Expected: 첫 줄 사백 이상(운영이 맞다). 둘째 줄로 운영 Auth 를 쓰는 곳이 있는지 본다. 셋째 결과에서 **`anon_select = false` 인 줄이 없어야 한다.** 있으면 친구에게 보여 주고, 그 표를 쓰는 앱(찬양·말씀 포함)을 확인해 `revoke select on <표> from authenticated;` 를 개발 → 운영 순으로 적용한 뒤 다시 돌린다.

- [ ] **Step 2: 운영 이메일 가입 정리(친구 판단)**

Step 1 둘째 결과에 `email` 사용자가 없고 쓰는 앱이 없으면: 운영 대시보드 → Authentication → Sign In / Providers → Email → **끈다**(카카오만 남긴다). 쓰는 곳이 있으면 그대로 두고 그 사실을 `CLAUDE.md` 한 줄에 적는다.

- [ ] **Step 3: 운영 카카오 설정(친구)**

- 카카오 개발자 → 「고척교회 관리」 → 카카오 로그인 → Redirect URI 에 `https://xnomlgydifiqiybervtf.supabase.co/auth/v1/callback` 추가.
- 운영 Supabase → Authentication → Providers → Kakao: 개발과 같은 키로 켠다(Task 1 결과의 설정 그대로).
- URL Configuration → Redirect URLs 에 `https://admin.onlybible.kr/**` **추가만** 한다. **Site URL 은 건드리지 않는다**(다른 앱이 쓰고 있을 수 있다).

- [ ] **Step 4: 운영 표 만들기 · 함수 배포**

```bash
cd /c/Projects/church-admin
supabase --workdir /c/Users/sewki/.church-admin/supa-prod db query --linked -f supabase/sql/001_admin_tables.sql
git status --short
supabase functions deploy church-admin --no-verify-jwt --project-ref xnomlgydifiqiybervtf
for t in admin_roles admin_members admin_role_grants admin_audit; do
  printf "%s " $t; curl -s -o /dev/null -w "%{http_code}\n" \
    "https://xnomlgydifiqiybervtf.supabase.co/rest/v1/$t?select=*&limit=1" -H "apikey: sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-"
done
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://xnomlgydifiqiybervtf.supabase.co/functions/v1/church-admin -d '{"action":"me"}'
```
Expected: SQL 마지막에 역할 둘 · `git status` 깨끗 · 배포 성공 · 표 넷 모두 `401` · 함수 `401`(토큰 없음).

- [ ] **Step 5: 도메인 연결**

- 친구: onlybible.kr DNS 관리 화면에서 `admin` CNAME → `sewoongkim1.github.io` 추가.
- 전파 확인 후:
```bash
nslookup admin.onlybible.kr
gh api -X PUT repos/sewoongkim1/church-admin/pages -f cname=admin.onlybible.kr
gh api repos/sewoongkim1/church-admin/pages -q '.https_certificate.state'   # approved 가 될 때까지 몇 분
gh api -X PUT repos/sewoongkim1/church-admin/pages -F https_enforced=true
curl -s https://admin.onlybible.kr/ | grep -o 'importmap'
```
Expected: 마지막 줄 `importmap`. 브라우저로 열면 「개발 DB」 띠가 **없다**(운영).

- [ ] **Step 6: 첫 총괄 관리자(운영)**

친구가 PC 로 `https://admin.onlybible.kr` → 카카오 → 등록 → 대기. 그다음:
```bash
P=/c/Users/sewki/.church-admin/supa-prod
supabase --workdir $P db query --linked "select id, name, gu, mok, kakao_nickname, created_at from admin_members where status='pending' order by created_at desc limit 5"
```
친구 줄의 id 를 친구와 함께 확인한 뒤(이름은 어떤 파일에도 적지 않는다):
```bash
supabase --workdir $P db query --linked "with m as (update admin_members set status='active', approved_at=now() where id='<그 id>' and status='pending' returning id) insert into admin_role_grants (member_id, role_id) select id, 'super' from m returning member_id"
```
친구가 「승인됐는지 다시 보기」 → 메뉴가 보인다. 「바꾼 기록」에 `승인 요청` 한 줄.

- [ ] **Step 7: 폰 확인(친구)**

- 아이폰 사파리·갤럭시 크롬으로 `https://admin.onlybible.kr` → 카카오(카카오톡 앱으로 넘어갔다 돌아오는지) → 메뉴. 앱을 껐다 켜도 로그인 유지.
- 360px 폭에서 ☰ 서랍·담당자 화면 단추 크기.
- ⚠️ 성경암송 앱 안(아이폰 WKWebView·안드로이드 TWA)에서 여는 것은 **2단계 갈아타기 때** 확인한다(지금은 앱에 입구가 없다).

- [ ] **Step 8: 성경암송 저장소에 지도 한 줄(이 저장소)**

`c:\Projects\bible-memorize-church-app-v2\CLAUDE.md` 의 「어디에 무엇이 적혀 있나」 표 끝에 한 줄:
```
| 교회 어드민(admin.onlybible.kr · 별도 저장소 `church-admin`) — 사역신청 관리를 옮겨 가는 중 | `docs/superpowers/specs/2026-09-28-church-admin-design.md` |
```
「다음 작업」 맨 위에:
```
- [ ] 🏛️ **교회 어드민 — 1단계(뼈대·카카오 로그인·담당자 관리) 운영 개시(YYYY-MM-DD — 이 줄을 넣는 날의 날짜를 적는다).** 다음은 2단계 임명현황 옮기기.
      ⚠️ 옮기는 동안 `admin-stats.html` 의 사역 화면·`api` 의 담당자용 사역 액션 7개는 **얼린다**(기능 추가 금지).
      계획 `docs/superpowers/plans/2026-09-28-church-admin-stage1.md` · 설계 위 표의 문서.
```
```bash
cd /c/Projects/bible-memorize-church-app-v2
git add CLAUDE.md
git commit -m "docs: 교회 어드민 1단계 운영 개시 — 지도 한 줄 · 사역 화면 얼림

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- CLAUDE.md
git show --stat HEAD
```
Expected: `git show --stat` 에 `CLAUDE.md` 한 파일만.

---

## Task 1 결과

(Task 1 Step 6 에서 채운다: 로그인 성공 여부 · 별명 칸 이름 · 카카오 동의항목/비즈앱 설정 · 운영에 똑같이 할 설정)
