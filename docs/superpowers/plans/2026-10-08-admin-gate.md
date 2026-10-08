# 관리자 문에 「총괄 관리자 본인」 확인 (admin-gate) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. 체크박스로 추적.

**Goal:** 성경암송 `api` 의 관리자 액션을 **「관리자 암호 + 그 브라우저에 로그인된 사람이 교회 어드민의 총괄 관리자(super)」** 일 때만 통과하게 한다. 암호 하나로 열리던 것을 사람까지 본다(관리 기능을 교회 어드민으로 다 옮기기 전까지의 임시 자물쇠).

**Architecture:** `adminError` 는 동기 함수(80곳에서 호출)라 그대로 둔다. 요청 들머리(Deno.serve)에서 **한 번** 비동기로 「이 staff 가 활성 총괄인가」를 확인해 본문에 **Symbol 표**(`body[LIFE?]` 아님 — `SUPER_OK`)로 붙인다. adminError 는 그 표만 본다(JSON 은 Symbol 키를 못 만들어 위조 불가). 사람이 없는 기계 호출(크론·MCP·설교 파이프라인)은 **pw-only 예외 목록**으로 그대로 통과. `admin_members`·`admin_role_grants` 는 **같은 프로젝트** 표라 api 의 service_role 로 직접 읽는다(확인됨).

**Tech Stack:** 성경암송 `api`(index.ts) · 화면 5곳 · 교회 어드민 표 읽기(같은 DB).

## Global Constraints

- ⚠️ **ADMIN_SECRET 은 세 앱 공유 + 크론 + 모니터 + 브라우저 sessionStorage.** 예외 목록을 좁히되 **기계 경로(매일 알림 4회·주간 리포트·주일 말씀·모니터·MCP·설교)가 끊기면 조용히 사고**다 — 운영 배포 직후 **아침 알림 전에** 확인.
- 배포: **개발 먼저**(ktpwthwqzgcqcrmsafdo) → 운영(xnomlgydifiqiybervtf). 이 Plan 은 개발까지.
- 화면과 서버는 **같은 배포에**(서버만 바꾸면 관리자 화면이 로그인 반복으로 깨진다).
- 공용 파일(index.ts·화면들) 커밋은 내 헝크만 · `git status` 로 남의 것 확인.
- 배포 전 `python tools/preflight.py`(store-review.test.cjs 가 adminError·login·authCheck 시그니처를 글자로 본다 — 그 **시그니처 줄은 바꾸지 않는다**).

## pw-only 예외 목록 (조사 2026-10-08 확정)
기계: `sendPush` · `weeklyVersePush` · `weeklyReport` · `monitor` · `eveningPush` · `findMember` · `memberParticipation` · `sermonJobGet` · `sermonJobUpdate` · `embedSermons` · `importV1`.
(담당자 액션 ministry*·content*·sermon staff 는 **역할 암호 경로**(staffRoleError)라 이 가름을 안 지난다 — 예외에 안 넣어도 된다. internal* 은 x-internal-key 라 무관.)

## File Structure
- `supabase/functions/api/index.ts` — **Modify.** 들머리 super 확인+Symbol 스탬프 · adminError 한 줄 · 예외 Set · weeklyReport 내부 stats 호출 한 곳 스프레드 수정 · super 확인 함수.
- `admin-stats.html` · `admin.html` · `admin-event.html` · `js/admin-members.js` · `admin-sermon-chat.html` — **Modify.** pw 보낼 때 staff 자동 첨부(한 줄 + 신원 함수). (praise-api.js 는 이미 staff 보냄 — 안 고침.)
- `tests/admin-gate.test.cjs` — **Create.** 순수: 예외 판정·staff↔super 매칭 후보 키.

---

## Task 1: 서버 — super 확인 + 들머리 스탬프 + adminError

**Files:** Modify `supabase/functions/api/index.ts`

**Interfaces:**
- Produces: `adminError(b)` 가 pw 맞고 (예외 액션 이거나 body[SUPER_OK]===true) 일 때만 null. 들머리가 SUPER_OK 를 붙인다.

- [ ] **Step 1: 예외 Set + Symbol + super 확인 함수 (adminError 위)**

```ts
const SUPER_OK = Symbol("superOk");   // 들머리가 붙인다 · JSON 으로 못 만든다 → 위조 불가
const ADMIN_PW_ONLY = new Set([        // 사람 없는 기계 호출(크론·MCP·설교) — 암호만으로 통과
  "sendPush", "weeklyVersePush", "weeklyReport", "monitor", "eveningPush",
  "findMember", "memberParticipation", "sermonJobGet", "sermonJobUpdate", "embedSermons", "importV1",
]);
// b.staff(그 브라우저에 로그인된 사람)가 교회 어드민의 **활성 총괄(super)** 과 같은 사람인가.
// admin_members 는 같은 프로젝트 표 — 자체 이름·소속 칸을 b.staff 와 맞댄다(성경암송 norm·양방향 목장).
// ⚠️ NFC 안 함(성경암송 가입이 NFC 를 안 한다) · 담당자 후보키(ministryStaffCandidates)와 같은 규칙.
async function staffIsSuper(b: any): Promise<boolean> {
  const st = b?.staff && typeof b.staff === "object" && !Array.isArray(b.staff) ? b.staff : null;
  if (!st || !norm(st.name)) return false;
  const cands = new Set(ministryStaffCandidates(st).concat([identityKey({
    type: st.type, gu: st.gu, mok: st.mok, bu: st.bu, grade: st.grade, name: st.name,
  })]));
  const { data, error } = await db.from("admin_members")
    .select("type,gu,mok,bu,grade,name,status,admin_role_grants!inner(role_id)")
    .eq("status", "active").eq("admin_role_grants.role_id", "super");
  if (error || !data) return false;
  for (const m of data as any[]) {
    for (const k of ministryStaffCandidates(m).concat([identityKey(m)])) {
      if (cands.has(k)) return true;
    }
  }
  return false;
}
```
⚠️ `ministryStaffCandidates` 는 `{type,mok,grade,...}` 를 받아 후보키 배열을 준다(index.ts 기존). `identityKey` 도 기존. 임베드 문법(`admin_role_grants!inner(role_id)`)이 이 PostgREST 에서 되는지 Step 4 에서 확인 — 안 되면 두 번 질의(활성 super member_id 목록 → admin_members).

- [ ] **Step 2: adminError 에 super 확인 (167-172 → 몸통만 더함 · 시그니처 줄 유지)**

```ts
function adminError(b: any): string | null {
  const secret = Deno.env.get("ADMIN_SECRET");
  if (!secret) return "no-password-set";
  if ((b.pw ?? "") !== secret) return "unauthorized";
  // 암호는 맞다. 기계 예외 액션이거나, 들머리가 확인한 총괄이면 통과. 아니면 사람 확인 실패.
  if (ADMIN_PW_ONLY.has(b.action)) return null;
  return (b as any)[SUPER_OK] === true ? null : "unauthorized";   // 틀린 암호와 **같은 답**(정보 안 흘림)
}
```
⚠️ 「unauthorized」로 같게 — 「not-super」로 다르게 주면 암호는 맞다는 것이 샌다.

- [ ] **Step 3: 들머리(Deno.serve 363-378 병합 리맵 옆)에서 pw 맞으면 super 스탬프**

병합 리맵 블록 **뒤**, `switch` **앞**에 더한다:
```ts
    // 관리자 암호가 맞고 예외 액션이 아니면, 이 staff 가 총괄인지 한 번 확인해 본문에 붙인다(adminError 가 본다).
    if ((body.pw ?? "") === (Deno.env.get("ADMIN_SECRET") ?? "") && body.pw && !ADMIN_PW_ONLY.has(body.action)) {
      try { (body as any)[SUPER_OK] = await staffIsSuper(body); } catch (_) { (body as any)[SUPER_OK] = false; }
    }
```
⚠️ `ADMIN_SECRET` 미설정이면 `body.pw` 가 "" 와 같아져 들어오지 않게 `&& body.pw` 를 둔다.

- [ ] **Step 4: 문법·개발 배포·임베드 확인**

Run: `python tools/preflight.py` → 통과(store-review 가 adminError 시그니처를 보는데 **시그니처 줄은 안 바꿨다**).
Run: `supabase functions deploy api --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo`
확인: 개발에서 `staffIsSuper` 임베드 질의가 되는지 — 아래 Step 5 스모크가 잡는다. 안 되면 두 질의로.

- [ ] **Step 5: 개발 스모크(틀린 staff → 막힘 · 총괄 → 통과 · 예외 → 통과)**

개발 ADMIN_SECRET 로:
- `{action:"stats", pw}` (staff 없음) → `unauthorized`(새 규칙 · 전에는 통과).
- `{action:"stats", pw, staff:{type:"교구",gu:"화평",mok:"20",name:"김세웅"}}` → 통과(개발 활성 super 가 화평-20 김세웅).
- `{action:"stats", pw, staff:{type:"교구",gu:"없음",mok:"0",name:"아무개"}}` → `unauthorized`.
- `{action:"sendPush", pw, latest:true, ...}` (예외) → staff 없이 통과(브로드캐스트 주의 — 개발만).
- `{action:"monitor", pw}` (예외) → staff 없이 통과.
⚠️ python(urllib)로 — curl 한글은 깨진다.

- [ ] **Step 6: 커밋**

```bash
git commit -m "feat(관리자 문): 관리자 암호 + 총괄 본인 확인 — 들머리 스탬프·예외 목록·adminError (개발)"
```

---

## Task 2: 내부 재호출 한 곳 수정 (weeklyReport→stats)

**Files:** Modify `supabase/functions/api/index.ts`

- [ ] **Step 1: 3588 의 새 객체를 스프레드로 (Symbol 유지)**

`weeklyReport` 안의 누적 통계 호출(약 3588):
```ts
// 전: const cum = await stats({ pw: b.pw, from: "", to: "" });
// 후: const cum = await stats({ ...b, from: "", to: "" });   // ...b 로 SUPER_OK 심볼 유지(새 객체면 소실)
```
⚠️ 실제 변수명·줄은 grep `stats({ pw: b.pw` 로 확인. (다른 재호출 1375·3556-3561·1448 은 이미 `{...b,...}` 또는 예외 액션이라 괜찮다 — eveningPush→sendPush 1448 은 sendPush 가 예외라 무관.)

- [ ] **Step 2: 배포·확인**

Run: 배포 뒤 개발에서 `{action:"weeklyReport", pw, staff:<총괄>}` → 응답에 누적 통계가 있나(unauthorized 아님). `python tools/preflight.py`.

- [ ] **Step 3: 커밋** `git commit -m "fix(관리자 문): weeklyReport 내부 stats 호출을 ...b 로(총괄 표 유지) (개발)"`

---

## Task 3: 화면 5곳 — pw 옆에 staff 자동

**Files:** Modify `admin-stats.html`·`admin.html`·`admin-event.html`·`js/admin-members.js`·`admin-sermon-chat.html`

각 화면의 **공용 호출 도우미**(callApi/call/verify)에, pw 를 실을 때 staff 가 비어 있으면 **앱 로그인 정보(localStorage `memorize-user`)**를 staff 로 채운다. admin-stats.html 은 이미 minAppUser·minStaffOf 가 있다(관리자 모드에서 getStaff()가 null 이라 staff 를 안 싣던 것).

- [ ] **Step 1: admin-stats.html callApi(972-981) 첫머리 한 줄**

```js
async function callApi(payload){
  if (payload && payload.pw && !payload.staff) { const u = minAppUser(); const s = u && minStaffOf(u); if (s) payload.staff = s; }
  ...
```

- [ ] **Step 2: 나머지 네 화면** — 각 호출 도우미에 같은 한 줄 + (admin.html·admin-event.html·js/admin-members.js·admin-sermon-chat.html 은 신원 함수가 없으니 admin-stats.html 1136-1144 의 작은 함수 한 벌을 그 파일에 옮겨 적는다: localStorage `memorize-user` → {type,gu,mok,bu,grade,name}). ⚠️ js/admin-members.js 는 `admin-members.html` 의 `?v=` 태그를 손으로 올린다(bump 가 안 올린다). ⚠️ admin.html·admin-event.html 은 bump 가 `?v=` 를 올린다.

- [ ] **Step 3: 로그인 안내** — 앱에 로그인 안 한 브라우저에는 각 화면 로그인에 「이 기기에서 앱에 먼저 로그인해 주세요」(admin-stats.html 담당자 안내 1088-1098 과 같은 갈래)와 실패 문구 「암호가 맞지 않거나 지금 로그인된 분이 총괄 관리자가 아닙니다」.

- [ ] **Step 4: bump·preflight·배포·눈 확인**

Run: `python tools/bump.py` · `python tools/preflight.py` · 커밋·push.
눈: localhost 에서 admin.html 열어 총괄로 로그인된 상태 → 도구 열림 · 로그인 안 한 브라우저 → 막힘·안내.

- [ ] **Step 5: 커밋** `git commit -m "feat(관리자 문): 관리자 화면 5곳이 pw 와 함께 로그인된 사람(staff)을 보낸다 + bump (개발)"`

---

## Task 4: 개발 종합 스모크 + 운영 반영 판단

- [ ] **Step 1: 개발 스모크(python)** — Task 1 Step 5 + 담당자 경로(ministryList 에 MINISTRY_SECRET + 등록 담당자 → 통과, super 아님)·authCheck(총괄 staff → ok, staff 없음 → 403).
- [ ] **Step 2: 시험(cjs)** — `tests/admin-gate.test.cjs`: ADMIN_PW_ONLY 에 11개 있나 · staffIsSuper 후보키가 양방향 목장(20↔20목장)을 만드나(순수 부분만). preflight 통과.
- [ ] **Step 3: 친구 — 운영 반영 순서(⚠️ 아침 알림 전에)**
  1. 운영에 **먼저 개발에서 하루 돌려** 크론·모니터가 안 끊기는지(예외 목록) 확인.
  2. 운영 배포는 **화면+서버 같은 때**. 배포 직후: ① admin.html 총괄 로그인 열리나 ② `monitor`·`weeklyReport`(diag)·`sendPush`(diag) 수동 호출이 pw 만으로 되나 ③ 다음 **아침 알림(20~23 UTC)**·**주일 말씀**·**금요 리포트**가 나갔나(push_log·메일).
  3. MCP·설교 파이프라인 첫 실전 한 번.
⚠️ 되돌리기: api 만 옛 판 재배포하면 즉시 원복(화면은 staff 를 더 보낼 뿐 옛 서버도 무시).

## Self-Review
**1. 설계 커버:** adminError 에 총괄 확인(Task1) · 예외 목록(Task1) · 내부 재호출 Symbol 유지(Task2) · 화면 5곳(Task3) · 크론 확인(Task4). 교회 어드민 쪽은 안 고침(읽기만). praise-api.js 안 고침(이미 staff).
**2. Placeholder:** 서버 코드 완전. 화면은 「도우미에 한 줄 + 신원 함수」 — 각 파일의 도우미 줄 번호 명시, admin-stats.html 1136-1144 를 본보기로. weeklyReport 내부 호출은 grep 으로 줄 확정(실 변수명).
**3. Type 일관:** `SUPER_OK` 심볼·`ADMIN_PW_ONLY` set·`staffIsSuper(b)` 이름 일관. adminError 시그니처(167) 안 바꿈(store-review 시험). staff 모양 {type,gu,mok,bu,grade,name} 일관(minStaffOf·staffIsSuper).
**4. ⚠️ 위험:** sendPush 예외라 pw 유출 시 브로드캐스트 — 이 Plan 은 예외 **목록**까지(크론 꼴로 더 좁히기는 후속). weeklyReport·findMember 응답 유출도 예외라 pw 로 열림 — 후속으로 응답 좁히기(설계 §6). 지금은 「총괄 확인」을 넣는 것이 먼저.
