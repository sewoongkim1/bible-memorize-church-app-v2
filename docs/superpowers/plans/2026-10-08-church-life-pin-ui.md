# 교회 생활 확인 번호 — 앱 화면 (Plan 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plan 1(서버)이 만든 확인 번호를 **성도님 화면**에 붙인다 — 교회 생활 단추를 누르면 서버가 정하라/맞혀라/그냥/잠김을 알려 주고(lifeGate), 그에 맞는 창을 띄운다. 확인을 마친 폰은 토큰을 기억해 모든 교회 생활 요청에 함께 보낸다.

**Architecture:** 요청 들머리 한 곳(`supaCall`)이 localStorage 의 기기 토큰을 **모든 요청에 자동으로** 붙인다 → 교회 생활 17개 액션이 토큰을 들고 간다(서버 lifeError 가 본다). 교회 생활 단추 다섯은 `lifeEnter(next)` 로 감싼다 — lifeEnter 가 lifeGate 를 물어 창(정하기/맞히기/잠김)을 띄우고, 통과하면 원래 화면으로 간다. 창은 게시판 규칙 창(`openBoardRules`)과 같은 틀(`am-overlay`).

**Tech Stack:** Vanilla JS(`app.js`·`js/api.js`) · 기존 모달 틀(`am-*` 클래스, `appModal`) · 배포는 `python tools/bump.py` → push(GitHub Pages).

## Global Constraints

- Plan 1(서버)이 **개발에 배포돼 있어야** 한다(lifeGate·lifePinSet·lifePinCheck·lifeResetRequest · lifeError 17개). 개발 `LIFE_PIN_SECRET` 설정됨.
- 스위치는 **off 로 둔다** — 이 Plan 도 개발까지. 시험은 개발 `app_config.lifePin='on'`(또는 `test` + 시험 참여자)로 켜고 localhost 에서 본다. 끝나면 **개발 스위치 off 로 되돌린다**.
- ⚠️ 문구는 어느 경우에도 참인 말만. 어린 부서(`needsGuardian(user)`)는 「본인 또는 보호자 휴대폰 뒷자리」.
- ⚠️ 기기 토큰은 hex 64자. localStorage 키 `life-device`. try/catch 로 감싼다(사생활 보호 모드에서 throw).
- 프런트 고치면 **`python tools/bump.py`**(캐시태그·판) 한 번. 손으로 판 고치지 말 것.
- 배포 전 `python tools/preflight.py`.
- 공용 파일(app.js·js/api.js) — 커밋은 `git apply --cached` 로 내 헝크만, `git diff --cached` 로 남의 것 확인.

## File Structure

- `js/api.js` — **Modify.** `supaCall` 에 기기 토큰 자동 첨부(한 줄 자리) + life 네 래퍼.
- `app.js` — **Modify.** `lifeDevice()`/`saveLifeDevice()` 도우미 · `openLifePin(mode, user)` 창 · `lifeEnter(next)` · 교회 생활 단추 다섯 감싸기.
- `style.css` — **Modify.** 확인 번호 입력칸 작은 스타일(기존 `am-*` 재사용, 숫자칸만 추가).

이 Plan 밖(Plan 3): 교회 어드민 풀기 처리·교적 맞대기·사역신청 번호 빼기·연락처 창(life_contacts)·방침.

---

## Task 1: 기기 토큰 자동 첨부 + api 래퍼

**Files:**
- Modify: `js/api.js`(`supaCall` 5-19 · `api` 객체)

**Interfaces:**
- Produces: `supaCall` 이 모든 요청에 `device`(localStorage `life-device`)를 싣는다. `api.lifeGate(user_id)`·`api.lifePinSet(user_id, pin)`·`api.lifePinCheck(user_id, pin)`·`api.lifeResetRequest(user_id)`.

- [ ] **Step 1: supaCall 이 기기 토큰을 자동으로 싣게**

`js/api.js` 의 `body: JSON.stringify({ action, ...payload })` 를 바꾼다. 토큰이 payload 에 이미 있으면 그대로(안전).

```js
async function supaCall(action, payload = {}) {
  let device = "";
  try { device = localStorage.getItem("life-device") || ""; } catch (_) {}
  const res = await fetch(`${window.SUPA.URL}/functions/v1/api`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${window.SUPA.ANON}`,
      "apikey": window.SUPA.ANON,
    },
    body: JSON.stringify({ action, ...(device ? { device } : {}), ...payload }),
  });
```

(나머지 supaCall 본문은 그대로.)

- [ ] **Step 2: life 네 래퍼 추가 (`api` 객체 끝 근처, boardRulesAccept 줄 옆)**

```js
  lifeGate: (user_id) => supaCall("lifeGate", { user_id }),
  lifePinSet: (user_id, pin) => supaCall("lifePinSet", { user_id, pin }),
  lifePinCheck: (user_id, pin) => supaCall("lifePinCheck", { user_id, pin }),
  lifeResetRequest: (user_id) => supaCall("lifeResetRequest", { user_id }),
```

- [ ] **Step 3: 문법 확인**

Run: `node --check js/api.js`
Expected: 오류 없음.

- [ ] **Step 4: 커밋**

```bash
git add js/api.js
git commit -m "feat(확인 번호 UI): supaCall 이 기기 토큰 자동 첨부 + life 네 래퍼 (개발)"
```

---

## Task 2: 확인 번호 창 + lifeEnter

**Files:**
- Modify: `app.js`(모달 도우미 근처 — `openBoardRules`(4757) 아래) · `style.css`

**Interfaces:**
- Consumes: `myUserId()`·`loadUser()`·`needsGuardian(user)`·`api.lifeGate/lifePinSet/lifePinCheck/lifeResetRequest`·`appAlert`.
- Produces: `lifeDevice()`·`saveLifeDevice(token)`·`openLifePin(mode, user)`(mode `"set"|"check"` · Promise<boolean>)·`lifeEnter(next)`(Promise<void> · 통과하면 next() 호출).

- [ ] **Step 1: 기기 토큰 도우미 + lifeEnter + 창 (app.js · openBoardRules 아래)**

```js
// ── 교회 생활 확인 번호 (2026-10-08 · 설계 docs/superpowers/specs/2026-10-08-church-life-pin-design.md) ──
function lifeDevice() { try { return localStorage.getItem("life-device") || ""; } catch (_) { return ""; } }
function saveLifeDevice(token) { try { if (token) localStorage.setItem("life-device", token); } catch (_) {} }

// 교회 생활 단추를 감싼다 — 서버에 물어 정하기/맞히기/잠김 창을 띄우고, 통과하면 next() 로 간다.
async function lifeEnter(next) {
  const uid = myUserId();
  if (!uid) { next(); return; }                 // 로그인 전이면(실제론 첫 화면이 이미 로그인됨) 그냥
  let g;
  try { g = await api.lifeGate(uid); } catch (_) { next(); return; }  // 못 물으면 막지 않는다(서버 lifeError 가 최후 방어)
  const state = g && g.state;
  if (state === "off" || state === "ok") { next(); return; }
  if (state === "locked") { await openLifeLocked(uid); return; }      // 오늘 잠김 — 풀기 요청만
  const user = (typeof loadUser === "function") ? loadUser() : null;
  const okNow = await openLifePin(state === "new" ? "set" : "check", user);
  if (okNow) next();
}

// 잠김 창 — 오늘은 더 못 한다 · 담당자에게 풀어 달라고
function openLifeLocked(uid) {
  return new Promise((resolve) => {
    const old = document.getElementById("lp-modal"); if (old) old.remove();
    const wrap = document.createElement("div"); wrap.id = "lp-modal"; wrap.className = "am-overlay";
    wrap.innerHTML = `
      <div class="am-card" role="dialog" aria-modal="true" aria-labelledby="lp-title">
        <div class="am-ico" aria-hidden="true">🔒</div>
        <div class="am-title" id="lp-title">오늘은 여기까지예요</div>
        <div class="am-msg">확인 번호를 여러 번 잘못 넣으셨어요. 내일 다시 하시거나, 담당자에게 풀어 달라고 해 주세요.</div>
        <div class="lp-err" role="alert" hidden></div>
        <div class="am-btns">
          <button type="button" class="am-btn am-cancel">닫기</button>
          <button type="button" class="am-btn am-ok" id="lp-reset">담당자에게 풀어 달라고 하기</button>
        </div>
      </div>`;
    const close = () => { wrap.classList.remove("show"); setTimeout(() => wrap.remove(), 160); resolve(); };
    wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });
    wrap.querySelector(".am-cancel").addEventListener("click", close);
    wrap.querySelector("#lp-reset").addEventListener("click", async () => {
      const errEl = wrap.querySelector(".lp-err");
      try { await api.lifeResetRequest(uid); errEl.textContent = "담당자에게 알렸어요. 처리되면 다시 정하실 수 있어요."; errEl.hidden = false; }
      catch (_) { errEl.textContent = "지금은 알리지 못했어요. 잠시 뒤 다시 눌러 주세요."; errEl.hidden = false; }
    });
    document.body.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add("show"));
  });
}

// 정하기/맞히기 창 — openBoardRules 와 같은 틀. 성공하면 기기 토큰을 저장하고 true.
function openLifePin(mode, user) {
  const guardian = typeof needsGuardian === "function" && user && needsGuardian(user);
  const lead = guardian ? "본인 또는 보호자 휴대폰 번호 뒷자리 4자리를 넣어 주세요." : "휴대폰 번호 뒷자리 4자리를 넣어 주세요.";
  const title = mode === "set" ? "확인 번호를 정해 주세요" : "확인 번호를 넣어 주세요";
  return new Promise((resolve) => {
    const old = document.getElementById("lp-modal"); if (old) old.remove();
    const wrap = document.createElement("div"); wrap.id = "lp-modal"; wrap.className = "am-overlay";
    wrap.innerHTML = `
      <div class="am-card" role="dialog" aria-modal="true" aria-labelledby="lp-title">
        <div class="am-ico" aria-hidden="true">🔑</div>
        <div class="am-title" id="lp-title">${title}</div>
        <div class="am-msg">${lead}<br><span class="lp-sub">교회 생활 메뉴에 들어갈 때 본인 확인에 써요. 다른 폰에서 처음 들어올 때 한 번 물어요.</span></div>
        <input class="lp-pin" id="lp-pin1" inputmode="numeric" maxlength="4" autocomplete="off" aria-label="확인 번호 4자리" />
        ${mode === "set" ? `<input class="lp-pin" id="lp-pin2" inputmode="numeric" maxlength="4" autocomplete="off" aria-label="확인 번호 다시" placeholder="한 번 더" />` : ""}
        <div class="lp-err" role="alert" hidden></div>
        <div class="am-btns">
          <button type="button" class="am-btn am-cancel">취소</button>
          <button type="button" class="am-btn am-ok lp-ok" disabled>${mode === "set" ? "정하기" : "확인"}</button>
        </div>
        ${mode === "check" ? `<button type="button" class="lp-forgot" id="lp-forgot">번호를 잊으셨나요?</button>` : ""}
      </div>`;
    const uid = myUserId();
    const p1 = wrap.querySelector("#lp-pin1"), p2 = wrap.querySelector("#lp-pin2");
    const ok = wrap.querySelector(".lp-ok"), errEl = wrap.querySelector(".lp-err");
    let busy = false;
    const onlyNum = (el) => { el.value = (el.value || "").replace(/[^0-9]/g, "").slice(0, 4); };
    const refresh = () => { ok.disabled = !(p1.value.length === 4 && (mode !== "set" || p2.value.length === 4)); };
    p1.addEventListener("input", () => { onlyNum(p1); refresh(); });
    if (p2) p2.addEventListener("input", () => { onlyNum(p2); refresh(); });
    const close = (v) => { document.removeEventListener("keydown", onKey, true); wrap.classList.remove("show"); setTimeout(() => wrap.remove(), 160); resolve(v); };
    const onKey = (e) => { if (e.key === "Escape" && !busy) { e.preventDefault(); close(false); } };
    wrap.addEventListener("click", (e) => { if (e.target === wrap && !busy) close(false); });
    wrap.querySelector(".am-cancel").addEventListener("click", () => { if (!busy) close(false); });
    const forgot = wrap.querySelector("#lp-forgot");
    if (forgot) forgot.addEventListener("click", async () => {
      try { await api.lifeResetRequest(uid); errEl.textContent = "담당자에게 알렸어요. 처리되면 다시 정하실 수 있어요."; errEl.hidden = false; }
      catch (_) { errEl.textContent = "지금은 알리지 못했어요. 잠시 뒤 다시 눌러 주세요."; errEl.hidden = false; }
    });
    ok.addEventListener("click", async () => {
      if (busy || ok.disabled) return;
      errEl.hidden = true;
      if (mode === "set" && p1.value !== p2.value) { errEl.textContent = "두 번 넣은 번호가 달라요. 다시 넣어 주세요."; errEl.hidden = false; return; }
      busy = true; ok.disabled = true; const label = ok.textContent; ok.textContent = "확인 중…";
      try {
        const r = mode === "set" ? await api.lifePinSet(uid, p1.value) : await api.lifePinCheck(uid, p1.value);
        saveLifeDevice(r.device);
        busy = false; close(true);
      } catch (e) {
        busy = false; ok.disabled = false; ok.textContent = label;
        const code = String((e && e.message) || "");
        if (code === "already-set") { // 정하기인데 이미 있음 → 맞히기로 바꿔 다시
          close(false); const again = await openLifePin("check", user); resolve(again); return;
        }
        if (code === "no-pin") { close(false); const again = await openLifePin("set", user); resolve(again); return; }
        errEl.textContent =
          code === "wrong" ? `번호가 맞지 않아요. ${(e.data && e.data.left) || 0}번 더 넣을 수 있어요.` :
          code === "locked" ? "오늘은 여러 번 틀려 잠겼어요. 내일 다시 하시거나 담당자에게 풀어 달라고 해 주세요." :
          /^[0-9]/.test(p1.value) ? "숫자 4자리를 넣어 주세요." : (code || "다시 해 주세요.");
        errEl.hidden = false;
        if (code === "locked") { ok.disabled = true; }
      }
    });
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(wrap);
    requestAnimationFrame(() => { wrap.classList.add("show"); try { p1.focus({ preventScroll: true }); } catch (_) {} });
  });
}
```

- [ ] **Step 2: style.css 에 숫자칸 스타일 (기존 am-* 옆)**

```css
/* 교회 생활 확인 번호 입력 (2026-10-08) */
.lp-pin { display:block; width:8ch; margin:10px auto 0; padding:12px 10px; font-size:1.9rem; letter-spacing:.5em;
  text-align:center; border:2px solid var(--line,#cfd6e2); border-radius:12px; background:var(--card,#fff); color:inherit; }
.lp-pin:focus { outline:none; border-color:var(--navy,#1f3a6e); }
.lp-sub { display:block; margin-top:6px; font-size:.82rem; color:var(--gray,#6b7483); line-height:1.5; }
.lp-err { margin:10px 4px 0; color:#c0392b; font-size:.9rem; }
.lp-forgot { display:block; margin:12px auto 0; background:none; border:none; color:var(--navy,#1f3a6e);
  font-size:.9rem; text-decoration:underline; cursor:pointer; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .lp-pin { border-color:#3a4356; } }
```

- [ ] **Step 3: 문법 확인**

Run: `node --check app.js`
Expected: 오류 없음.

- [ ] **Step 4: 커밋**

```bash
git add app.js style.css
git commit -m "feat(확인 번호 UI): 확인 번호 창(정하기·맞히기·잠김)·lifeEnter·기기 토큰 저장 (개발)"
```

---

## Task 3: 교회 생활 단추 다섯을 lifeEnter 로 감싸기

**Files:**
- Modify: `app.js`(첫 화면 단추 핸들러 3066-3111 부근)

**Interfaces:**
- Consumes: `lifeEnter`(Task 2).

- [ ] **Step 1: 다섯 핸들러를 감싼다**

각 단추의 click 안쪽을 `lifeEnter(() => { …원래 내용… })` 로 감싼다. ⚠️ `markFeatSeen(...)` 같은 「본 표시」는 lifeEnter **밖**에 둔다(단추를 누른 것은 사실이니). 예:

```js
  // 사역 신청
  if (minBtn) minBtn.addEventListener("click", () => {
    lifeEnter(() => { minLoaded = false; renderMinistry(); });
  });
  // 사역 이력 확인
  if (mhBtn) mhBtn.addEventListener("click", () => {
    lifeEnter(() => { mhLoaded = false; renderMinistryHistory(); });
  });
  // 성경필사 노트 신청
  document.getElementById("open-pilsa").addEventListener("click", () => {
    lifeEnter(() => { pilsaLoaded = false; renderPilsaApply(); });
  });
  // 교육 신청
  { const b = document.getElementById("open-edu"); if (b) b.addEventListener("click", () => {
      markFeatSeen("edu");
      lifeEnter(() => {
        if (typeof renderEduList === "function") renderEduList();
        else appAlert("교육 화면을 아직 못 불러왔어요. 잠시 뒤 다시 눌러 주세요.");
      });
    }); }
  // 봉사 당번 신청
  { const b = document.getElementById("open-duty"); if (b) b.addEventListener("click", () => {
      markFeatSeen("duty");
      lifeEnter(() => {
        if (typeof renderDutyList === "function") renderDutyList();
        else appAlert("봉사 당번 화면을 아직 못 불러왔어요. 잠시 뒤 다시 눌러 주세요.");
      });
    }); }
```

- [ ] **Step 2: 딥링크·`?go=` 로 교회 생활에 바로 들어오는 길이 있나 확인**

Run: `grep -n '"go")\|go === "ministry"\|go === "edu"\|go === "duty"\|go === "pilsa"\|preview=ministry' app.js`
그런 길이 있으면 그 자리도 `lifeEnter` 로 감싼다(없으면 이 Step 은 「없음 확인」으로 끝). ⚠️ 관리자 미리보기(`?preview=ministry`)는 감싸지 않는다(관리자용).

- [ ] **Step 3: 문법·판 올리기**

Run: `node --check app.js` → OK
Run: `python tools/bump.py` → APP_BUILD 올라감
Run: `python tools/preflight.py` → 모두 통과

- [ ] **Step 4: 커밋·배포**

```bash
git add app.js index.html admin.html style.css js/api.js
git commit -m "feat(확인 번호 UI): 교회 생활 단추 다섯을 lifeEnter 로 감싸기 + bump (개발)"
git push origin main
```
(GitHub Pages 가 자동 배포 — 개발은 localhost 로 보므로 배포 확인은 생략 가능.)

---

## Task 4: localhost 에서 눈으로 확인

**Files:** (없음 — 확인만)

- [ ] **Step 1: 개발 스위치 켜기**

```bash
set -a; . ./.env.dev; set +a
curl -s "https://ktpwthwqzgcqcrmsafdo.supabase.co/functions/v1/api" -H "apikey: sb_publishable_eJKP6u95IU9_DBXTvnvYBA_-yGCf-0Y" -H "Content-Type: application/json" -d "{\"action\":\"saveConfig\",\"pw\":\"$ADMIN_SECRET\",\"key\":\"lifePin\",\"value\":\"on\"}"
```

- [ ] **Step 2: localhost 띄우고 확인**

Run: `python -m http.server`(별도 터미널 · 자동으로 개발 DB) → `http://localhost:8000` 열어 로그인(아무 이름 — 개발).
눈으로:
1. 교구 교구·목장·이름으로 로그인 → 첫 화면.
2. 🤝 사역 신청(또는 🎓 교육 · 🙋 봉사 · ✍️ 필사) 누름 → **「확인 번호를 정해 주세요」** 창 · 숫자 4자리 두 칸.
3. 두 칸을 다르게 넣음 → 「두 번 넣은 번호가 달라요」.
4. 같게 넣고 정하기 → 창 닫히고 해당 화면 열림.
5. 다시 그 단추 → 창 **안 뜸**(이 기기 확인됨).
6. (다른 기기 흉내) 개발자도구 콘솔 `localStorage.removeItem('life-device')` → 단추 → **「확인 번호를 넣어 주세요」**(맞히기) · 틀리면 「n번 더」 · 맞으면 열림.
7. 어린 부서(예 유치부)로 로그인해 보면 문구가 「본인 또는 보호자 …」.
8. 어두운 모드·「아주 큼」 글씨에서 창이 깨지지 않나.

- [ ] **Step 3: 개발 스위치 끄기(되돌림)**

```bash
curl -s "https://ktpwthwqzgcqcrmsafdo.supabase.co/functions/v1/api" -H "apikey: sb_publishable_eJKP6u95IU9_DBXTvnvYBA_-yGCf-0Y" -H "Content-Type: application/json" -d "{\"action\":\"saveConfig\",\"pw\":\"$ADMIN_SECRET\",\"key\":\"lifePin\",\"value\":\"off\"}"
```

- [ ] **Step 4: 친구에게 보여 주고 다음(Plan 3) 판단**

운영 반영은 Plan 3(교회 어드민 풀기·교적 맞대기·사역신청 번호 빼기)까지 끝난 뒤 — 그때 스위치를 `test` 부터.

## Self-Review

**1. Spec 커버(설계 §3·6):** 입구 창(정하기/맞히기 · Task 2)·확인된 폰은 안 물음(기기 토큰 · Task 1·2)·잠김+풀기 요청(Task 2)·어린 부서 문구(Task 2)·다섯 단추(Task 3)·딥링크 확인(Task 3). 연락처 창(life_contacts)·설정의 번호 바꾸기는 **없음**(친구 결정 10 — 스스로 바꾸기 없음) · 연락처는 Plan 3.
**2. Placeholder:** 모달·lifeEnter·supaCall·CSS 완전한 코드. Task 3 딥링크는 grep 으로 확인 후 「있으면 감싸고 없으면 확인」 — 실제 코드는 grep 결과에 달렸다(없을 가능성이 높다 · 교회 생활은 첫 화면 단추로만 들어간다).
**3. Type 일관:** `lifeDevice`·`saveLifeDevice`·`openLifePin(mode,user)`·`openLifeLocked(uid)`·`lifeEnter(next)` 이름 일관 · 기기 토큰 키 `life-device` 일관(supaCall·saveLifeDevice·확인 Step) · api 래퍼 이름이 Plan 1 서버 액션과 일치(lifeGate·lifePinSet·lifePinCheck·lifeResetRequest).
