# 교회 어드민 4·5단계(사역팀 정보 · 종이 명단 올리기) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 성경암송 관리 화면의 남은 사역신청 메뉴 둘 — 「🗂️ 사역팀 정보」(팀 설명·「② 언제」·담당·지금 섬기는 분 고치기, 위원회 안 차례)와 「📋 종이 명단 올리기」(붙여넣기·엑셀 → 살펴보기 → 넣기) — 을 교회 어드민으로 옮긴다. 3단계(신청 현황)와 **함께** 확인하고 함께 운영에 올린다.

**Architecture:**
- 순수 규칙은 모듈로(Node 시험): `supabase/functions/church-admin/catalog.ts`(꾸밈 HTML 거르개 `ministryHtml`·명단 한 줄·「② 언제」 칸), `supabase/functions/church-admin/paper.ts`(상태 별칭·날짜·계정 키·전화·직분·줄 겉모양 검사).
- 서버 액션(church-admin, 역할 `ministry`): `ministryCatalogAdmin`(읽기 — 옛 공개 액션 `ministryCatalog` 을 담당자용으로 게이트 걸어 옮김) · `ministryCatalogSave` · `ministryCatalogOrder` · `ministryPaperCheck` · `ministryPaperSave`. 바꾸는 셋은 바꾼 기록에 남긴다.
- 화면: `js/menus/ministry/catalog.js`, `js/menus/ministry/paper.js`(+ 필요하면 각각 `-ui.js`). 종이 명단 엑셀 양식 파일을 저장소 `files/` 에 두고 내려받게 한다.
- **옛 원문을 옮기는 일이다** — 기준: `c:\Projects\church-admin\docs\port\ministry-catalog-legacy.md`, `…\ministry-paper-legacy.md`(줄 번호 붙은 원문 + 체크리스트). 성경암송 쪽은 **손대지 않는다**(얼림).

**Tech Stack:** 1~3단계와 같음. 엑셀 읽기는 옛 화면처럼 SheetJS 를 **그때 CDN 에서** 불러온다(원문 2.4 의 주소 그대로).

## Global Constraints

- church-admin 은 **푸시 = 운영 화면 반영** — Task 1~6 은 **커밋만.** 푸시는 Task 8(3단계와 함께)에서 서버를 운영에 올린 **뒤**.
- 개발 `ktpwthwqzgcqcrmsafdo` 먼저. 운영 `xnomlgydifiqiybervtf` 는 Task 8 에서만. 성경암송 저장소는 이번 단계에서 **바꾸지 않는다.**
- 새 액션 = `authz.ts` `ACTION_ROLES` + `index.ts` `switch` case + `tests/server.dev.test.mjs` `PROBE` — 셋 다.
- 응답에 `user_id`·`auth_user_id` 를 싣지 않는다. 관리자가 넣는 꾸밈 HTML 은 **저장·조회 양쪽에서** `ministryHtml` 을 거친다(화면에서 `esc` 를 하지 않고 그대로 넣는 칸은 이 거르개를 거친 칸뿐).
- 사역팀 정보: **보내온 칸만 고친다** · **시각은 주일에만**(주일을 끄면 시각을 미리 비운다 · 요청에 day_sun 이 없으면 DB 값을 본다) · 팀 추가·삭제·이름 바꾸기는 **하지 않는다**(원본은 엑셀) · 차례는 **그 위원회 전체**가 와야 하고 **원래 sort_order 자리를 다시 나눠** 준다 · 잘린 칸은 `truncated` 로 알린다.
- 종이 명단: **살펴보기(check)는 아무것도 만들거나 바꾸지 않는다** · **넣기(save)는 처음부터 다시 살핀다** · 계정은 **`member_login` RPC**(로그인과 같은 길)로 찾거나 만든다 · 계정 키는 **성경암송 앱과 글자 그대로 같은 규칙**(완성형 NFC 로 바꾸지 **않는** 옛 `norm`) · 앱 신청과 겹치면 **새 줄을 만들지 않고 상태만** · 같은 상태면 **손대지 않는다**(두 번 올려도 안전) · 상태 비면 **임명확정** · 취소 줄은 **그 줄에 사유** · 지명 팀은 임명확정만 · 3개 상한은 **이번 뭉치 안까지 합산** · 결정 상태면 **번호를 지운다** · 겹친 줄은 **신청일을 안 고친다** · **알림은 절대 없다** · 한 번에 **300줄**까지 · 한 줄 실패가 나머지를 막지 않는다.
- 직분 허용 목록 `MIN_POSITIONS` 는 **이제 네 곳**(성경암송 app.js · api · DB CHECK · church-admin `paper.ts`) — 값을 더하려면 넷 다, CHECK 먼저(「허용 목록은 여러 곳」 사고).
- 화면 표준 v1 · 확인·알림은 `dialog`/`toast` · 사용자 글자는 `esc` · 커밋 끝에 `Co-Authored-By:`(실제 모델).

---

### Task 1: 사역팀 정보 순수 모듈 `catalog.ts` + 시험

**Files:** Create `supabase/functions/church-admin/catalog.ts`, `tests/catalog.test.mjs`

**Interfaces — Produces:** `ministryHtml(v: unknown, max: number): string` · `ministryWhoShort(who)` · `ministryEsc(s)` · `ministryMemberLine(r): string` · `MINISTRY_FREQ_KEYS` · `MINISTRY_FREQ_COLS: string` · `ministryFreqOf(r)` · `ministryTimeIn(v, label): { v: string|null, err?: string }`

- [ ] **Step 1:** `docs/port/ministry-catalog-legacy.md` 1.3·1.5·1.6 의 원문을 **글자 그대로** 옮긴다. 바꾸는 것은 셋뿐: ① `export` 를 붙인다 ② 원문이 쓰는 `norm` 은 이 파일 안에 **옛 규칙 그대로**(`(s ?? "").toString().trim().replace(/\s+/g, " ")`) 둔다(authz.ts 의 NFC `norm` 을 쓰지 않는다 — 옛 저장값과 한 글자라도 달라지면 안 된다) ③ Deno·Node 가 함께 읽도록 원격 import·enum 을 쓰지 않는다(`as const` 는 된다).
- [ ] **Step 2: 시험 — `tests/catalog.test.mjs`** — 원문의 규칙을 시험으로 적는다(최소 이것들):
  - `ministryHtml`: `<script>`·`on…=` 속성·`javascript:` 주소가 빠진다 / 원문이 허용하는 꾸밈 태그는 남는다(원문 1.5 의 허용 목록에서 둘을 골라 시험) / `max` 를 넘으면 잘린다 / `null`·`undefined` → `""`.
  - `ministryTimeIn`: `"9:05"` → `{v:"09:05"}` · `""` → `{v:null}` · `"25:00"` → 오류 · `"오전"` → 오류.
  - `ministryFreqOf`: 네 칸 불리언.
  - `ministryMemberLine`: 원문 1.3 의 꼴대로 한 줄(이름·직분·소속 — 원문 예시를 그대로 기대값으로).
  RED → 원문 옮기기 → GREEN · `python tools/preflight.py` 통과.
- [ ] **Step 3:** 커밋(푸시 안 함) — `feat(사역): 사역팀 정보 순수 모듈 — 꾸밈 HTML 거르개·언제 칸·명단 한 줄(성경암송에서 옮김)`

### Task 2: 사역팀 정보 서버 — `ministryCatalogAdmin` · `ministryCatalogSave` · `ministryCatalogOrder`

**Files:** Modify `supabase/functions/church-admin/authz.ts`, `index.ts`, `tests/authz.test.mjs`, `tests/server.dev.test.mjs`

**Interfaces — Produces:**
- `ministryCatalogAdmin` → 원문 1.4 `ministryCatalog` 의 답과 **같은 모양** `{ ok, year, period, list:[…] }`(게이트만 더함 · `year` 는 요청이 아니라 `ministryYear()`).
- `ministryCatalogSave { id, …칸 }` → 원문 1.7 과 같은 답.
- `ministryCatalogOrder { ids:number[] }` → `{ ok:true, n }` 또는 원문의 오류들.

- [ ] **Step 1:** `ACTION_ROLES` 에 세 줄(`"ministry"`), `authz.test.mjs` 의 사역 액션 목록 기대값에 셋 더하기.
- [ ] **Step 2:** `index.ts` 에 원문 1.4·1.7·1.8 을 옮긴다. 바꾸는 것: `ministryAdminError` 줄 삭제(게이트는 canCall) · `ministryCfg` 대신 `ministryYear()`(period 는 `app_config('ministry')` 의 open/close 로 원문 `ministryCfg` 계산을 그대로 — 필요한 만큼만 옮긴다) · 오류 문구는 원문 그대로 두되 `error` 코드로 줄 수 있는 것은 코드로(`"not-found"` 등) · 조회는 2단계의 `allRows()` 로(1000줄 넘어도) · 저장·차례 뒤 `audit(ctx, "ministry.catalog", String(id), { team, fields: 보낸 칸 이름들 })` / `audit(ctx, "ministry.order", committee, { ids })`.
- [ ] **Step 3: 개발 시험** — `PROBE` 에 셋(`ministryCatalogAdmin:{}`, `ministryCatalogSave:{id:0}`, `ministryCatalogOrder:{ids:[]}`). 새 시험 하나: 목록 모양(user_id 없음) · 개발 `ministry_catalog` 의 한 줄을 골라 `desc_note` 를 고쳤다가 **원래 값으로 되돌린다** · 주일을 끈 채 시각을 보내면 시각이 비어 돌아온다(끝나면 원래 값으로) · `<script>` 가 저장되지 않는다 · 차례: 한 위원회의 id 전부를 **같은 차례로** 보내면 `ok`(자리 값이 바뀌지 않는다), 일부만 보내면 오류 · 바꾼 기록에 `ministry.catalog`. **시험이 끝나면 개발 DB 가 시험 전과 같아야 한다**(고친 칸은 `before` 에서 읽어 둔 값으로 되돌린다).
- [ ] **Step 4:** preflight · 커밋 · `git status` 깨끗 → 개발 배포 · 개발 시험 모두 통과.

### Task 3: 사역팀 정보 화면 — `js/menus/ministry/catalog.js`

**Files:** Create `js/menus/ministry/catalog.js`(+ 400줄을 넘으면 `catalog-ui.js`); Modify `js/menus/registry.js`, `css/admin.css`, `js/menus/system/audit.js`

- [ ] **Step 1:** 원문 2절(2.0~2.14)과 3절 체크리스트를 읽고 옮긴다. 대응표는 3단계 Task 5 와 같다(`plEsc→esc`, `mnDialog→dialog`, `mnNote→toast`, `callApi→call`, 인증·← 메뉴·scrollTo 없앰, 제목은 `page-title`, 새로 불러오기는 새 `<section>`). 읽기 액션은 `ministryCatalogAdmin`. 폼에서 저장하면 **서버가 돌려준 값**으로 카드를 다시 그린다(`truncated` 가 있으면 dialog 로 「잘린 칸: …」). 좁은 폰 규칙은 원문 2.14 처럼 **옛 `.mc-in label` 규칙보다 뒤에** 둔다. 찾기는 **위원회를 넘어 전체에서**(체크리스트). 부서 고르기는 접기/펼치기(가로 스크롤 금지).
- [ ] **Step 2:** 메뉴 한 줄 — `registry.js` 에서 `status` 줄 **다음**에:
  `{ id: "catalog", group: "사역신청", icon: "🗂️", label: "사역팀 정보", desc: "팀 설명 · 언제 · 담당 · 지금 섬기는 분 · 차례", role: "ministry", load: () => import("./ministry/catalog.js") },`
- [ ] **Step 3:** 바꾼 기록 이름표 — `audit.js` `LABEL` 에 `"ministry.catalog": "사역팀 정보 고침"`, `"ministry.order": "사역팀 차례 바꿈"`, `detailText` 에 `ministry.catalog` → `${d.team} · ${(d.fields||[]).join(", ")}`, `ministry.order` → `${(d.ids||[]).length}팀`.
- [ ] **Step 4:** preflight · 스모크(`/js/menus/ministry/catalog.js` 200) · 커밋.

### Task 4: 종이 명단 순수 모듈 `paper.ts` + 시험

**Files:** Create `supabase/functions/church-admin/paper.ts`, `tests/paper.test.mjs`

**Interfaces — Produces:** `PAPER_MAX_ROWS` · `PAPER_ALIAS` · `paperName(st)` · `paperDay(v)` · `legacyNorm(s)` · `appIdentityKey(u)` · `ministryPaperKeys(gu, mok, name)` · `PILSA_PHONE_RE` · `pilsaPhone(v)` · `MIN_POSITIONS` · `ministryPaperOne(row, …)`(원문 1.11 의 인자 그대로)

- [ ] **Step 1:** `docs/port/ministry-paper-legacy.md` 1.2(norm·identityKey)·1.6·1.7·1.8·1.9·1.10·1.11 원문을 글자 그대로 옮긴다. `norm` → 이름 `legacyNorm`, `identityKey` → `appIdentityKey`(**완성형으로 바꾸지 않는다** — 성경암송 로그인과 계정 키가 같아야 `member_login` 이 같은 분을 찾는다). 죽은 상수 `PAPER_STATUS` 는 **옮기지 않는다**(원문 체크리스트 30). `MIN_POSITIONS` 머리에 「네 곳」 주석.
- [ ] **Step 2: 시험** — `paperDay`(`2026-12-15`·`2026.12.15`·`2026. 12. 15.` → 한국 자정의 ISO, 틀린 꼴 → 오류, 빈 칸 → null) · `PAPER_ALIAS`(임명·확정·취소·신청·접수) · `ministryPaperKeys("화평","20목장","김세웅")` 가 `"교구|화평|20|||김세웅"` 과 `"교구|화평|20목장|||김세웅"` 둘 · `appIdentityKey` 가 성경암송 규칙과 같다(`"교구|화평|20|||김세웅"`) · `pilsaPhone("01012345678")` → `"010-1234-5678"`, 틀린 번호 → 원문대로 · `MIN_POSITIONS` 9개(사모 포함) · `ministryPaperOne` 의 원문 검사들(이름 없음·교구 없음·직분 밖·번호 틀림 등) 각각 하나.
- [ ] **Step 3:** preflight · 커밋 — `feat(사역): 종이 명단 순수 모듈 — 상태 별칭·날짜·계정 키(로그인과 같은 규칙)·전화·직분`

### Task 5: 종이 명단 서버 — `ministryPaperCheck` · `ministryPaperSave`

**Files:** Modify `authz.ts`, `index.ts`, `tests/authz.test.mjs`, `tests/server.dev.test.mjs`

**Interfaces — Produces:** 원문 1.12 `ministryPaper(b, save)` 의 답과 같은 모양(줄마다 판정·오류·「그대로」·저장됨, 합계).

- [ ] **Step 1:** `ACTION_ROLES` 에 둘(`"ministry"`), authz 시험 기대값에 둘.
- [ ] **Step 2:** 원문 1.12 를 `index.ts` 로 옮긴다. 바꾸는 것: 게이트 줄 삭제 · 헬퍼는 `paper.ts` 에서 import · `ministryKeysToUsers` 는 원문 1.3 을 **`paperKeysToUsers` 로 index.ts 에 옮겨** 쓴다(stage 1 의 `keysToUserIds` 는 NFC 로 바꾸므로 쓰지 않는다) · 팀 목록 읽기는 `ministry_catalog` 를 직접(`allRows`) · `member_login` 호출은 원문 그대로(서비스 키라 된다) · 저장이 끝나면 **한 번** `audit(ctx, "ministry.paper", String(year), { saved, created, same, errors, byStatus })`(이름·번호를 싣지 않는다).
- [ ] **Step 3: 개발 시험** — `PROBE` 에 둘(`{ rows: [] }`). 새 시험 하나(개발 전용 이름 `ca-test-paper-<STAMP>`, 교구 `시험`, 목장 `0`):
  살펴보기 → 계정이 **생기지 않았다**(users 에 그 이름 없음) · 넣기 → 저장됨·계정 생김 · **같은 명단 다시 넣기 → 모두 「그대로」** · 취소 줄에 사유 없음 → 그 줄만 오류 · 없는 팀 이름 → 그 줄만 오류 · 한 사람 4줄 → 넷째 줄이 상한 오류 · 결정 상태 줄의 번호가 비어 있다 · 바꾼 기록 `ministry.paper` 한 줄.
  `after` 에서 그 이름의 `ministry_orders` 와 `users`(그리고 있으면 `user_identity_aliases`)를 지운다 — **그 시험 이름만**.
- [ ] **Step 4:** preflight · 커밋 · 개발 배포 · 개발 시험 모두 통과.

### Task 6: 종이 명단 화면 — `js/menus/ministry/paper.js` · 양식 파일

**Files:** Create `js/menus/ministry/paper.js`, `files/사역명단_올리기_양식.xlsx`(성경암송 `files/2027_사역명단_올리기_양식.xlsx` 를 복사); Modify `registry.js`, `css/admin.css`, `audit.js`, `.github/workflows/deploy.yml`(cp 목록에 `files`)

- [ ] **Step 1:** 원문 2절·3절을 읽고 옮긴다(대응표는 Task 3 과 같다). 붙여넣기는 **자리(순서)** 로 읽고 첫 줄이 머리글이면 버린다 · 엑셀은 SheetJS 를 그때 불러오고 막히면 「복사해 붙여넣어 주세요」 · 「명단」 시트 먼저 · 파일은 칸을 **채우기만** · 「명단 넣기」 단추는 살펴본 뒤 넣을 것이 있을 때만, 글을 고치면 다시 숨김 · 넣기 전 확인 창에 **상태별 건수** · **넣기는 지금 칸의 글을 다시 읽어 보낸다**(원문 체크리스트 31 의 어긋남을 없애려고 — 확인 창의 숫자도 그 글로 다시 센 것) · 결과 기호 넷(＝ ✅ ◻️ ⚠️) · 양식 내려받기는 `files/사역명단_올리기_양식.xlsx` 링크.
- [ ] **Step 2:** 메뉴 한 줄 — `catalog` 줄 **다음**에: `{ id: "paper", group: "사역신청", icon: "📋", label: "종이 명단 올리기", desc: "엑셀·붙여넣기로 한꺼번에 · 알림은 가지 않아요", role: "ministry", load: () => import("./ministry/paper.js") },`
- [ ] **Step 3:** `audit.js` — `"ministry.paper": "종이 명단 넣음"`, detail → `저장 ${d.saved} · 새 계정 ${d.created} · 그대로 ${d.same} · 오류 ${d.errors}`.
- [ ] **Step 4:** `deploy.yml` 의 cp 줄에 `files` 를 더한다. preflight · 스모크(`/js/menus/ministry/paper.js`·`/files/사역명단_올리기_양식.xlsx` 200) · 커밋.

### Task 7: 4·5단계 전체 검토 + 고치기

- [ ] 3단계처럼 전체 검토(개발 시험·preflight 결과, 원문 체크리스트 대조, 보안: 거르개를 거치지 않은 HTML 이 없는지, 종이 명단의 계정 생성이 check 에서 일어나지 않는지, 시험 뒷정리). 나온 것을 한 번에 고친다.

### Task 8: 3·4·5단계 함께 확인 · 운영 올리기 (컨트롤러가 친구와 함께)

- [ ] **Step 1: localhost(개발 DB)** — 3단계 Task 7 Step 1·2 의 목록 + 🗂️ 사역팀 정보(찾기·부서 접기·카드 펼치기·고치기·저장·잘린 칸 안내·▲▼ 차례·주일 끄면 시각 비움) + 📋 종이 명단(양식 내려받기·엑셀 올리기·붙여넣기·살펴보기·넣기·같은 명단 다시 넣기 → 모두 그대로 · 신청 현황에 「📋 종이」로 보임).
- [ ] **Step 2: 숫자 대조(운영, 읽기만)** — 상태별 건수(신청 현황), 사역팀 수(사역팀 정보).
- [ ] **Step 3: 운영 순서** — ① 성경암송 `api`(3단계 Task 2 의 내부 알림 액션 — 3단계 계획 Task 7 Step 4 의 확인을 그대로) ② church-admin 함수 ③ church-admin 푸시 ④ 성경암송 Task 2 커밋 푸시(내 커밋만인지 먼저) → 라이브 importmap 에 `status.js`·`catalog.js`·`paper.js`.
- [ ] **Step 4: 친구가 admin.onlybible.kr 에서 보기만 확인**(운영은 실제 성도님 자료).
- [ ] **Step 5: 기록** — church-admin `progress.md` · 성경암송 CLAUDE.md 「다음 작업」 줄(사역 메뉴 다섯 모두 옮김 · 다음은 **갈아타기**: 담당자 초대 → 앱 입구 단추 → 옛 화면·옛 액션·사역 암호 걷기) · 성경암송 `docs/notes/ministry-2027.md` 끝 한 줄 · 직분 목록 「네 곳」을 성경암송 CLAUDE.md 의 해당 ⚠️ 에도.
