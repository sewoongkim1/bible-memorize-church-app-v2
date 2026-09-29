# 교회 어드민 — 성경필사(암송) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 성경암송 앱의 이벤트 명단(`events`·`event_signups`, 12회차 2,834행)을 교회 어드민(admin.onlybible.kr)에서 새 역할 「성경필사(암송)」 담당자가 보고·고치고·올리고·통계 내게 한다.

**Architecture:** 교회 어드민 함수(`supabase/functions/church-admin`)가 성경암송의 두 표를 **표를 고치지 않고** 직접 읽고 쓴다. 규칙은 순수 모듈 셋(`events-rules.ts`·`events-people.ts`·`events-stats.ts`)에 두고 Node 시험이 같은 파일을 읽는다. 화면은 `js/menus/bibleevent/` 메뉴 셋과 직접 만든 창(`js/core/modal.js`)·고르개(`js/core/picker.js`)로, 브라우저·시스템 팝업을 띄우지 않는다. 운영을 여는 날 성경암송 쪽 이벤트 쓰기 액션 셋을 서버에서 막아 쓰는 곳을 하나로 만든다.

**Tech Stack:** Supabase Edge Function(Deno, TypeScript) · PostgREST(supabase-js) · 빌드 없는 브라우저 ES 모듈 · Node `node:test`(`--experimental-strip-types`) · 카카오 로그인 + `admin_roles` 역할.

**설계:** `docs/superpowers/specs/2026-09-29-church-admin-bible-events-design.md` (이 계획과 어긋나면 설계가 맞다)

**과제 차례:** `1 → 2 → … → 12 → 16 → 13 → 14 → 15` — Task 16(이름을 누르면 교적 창 · 친구 결정 2026-09-30)은 계획을 쓴 뒤에 더해져 번호만 16 이다. 문서에서도 Task 12 와 Task 13 사이에 있다(Task 13 의 개인정보 안내 글이 Task 16 이 6번에 넣은 한 줄을 먼저 찾는다).

## Global Constraints

- 코드 저장소 `C:\Projects\church-admin`, 작업 가지 `bible-events`(워크트리 `.worktrees/bible-events`). 성경암송 저장소는 Task 15 에서만 고친다.
- **푸시 = 운영 화면.** Task 15 전에는 어느 저장소도 푸시하지 않는다. 커밋은 과제마다 한 번 이상, 한국어 제목, 끝줄 `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- **`events`·`event_signups` 의 칸·제약·RLS 를 바꾸지 않는다.** 새 SQL 은 `admin_roles` 한 줄(`004_bibleevent_role.sql`)뿐, 개발 먼저.
- 역할 id `bibleevent`(라벨 「성경필사(암송)」). `pilsa` 는 쓰지 않는다(성경암송 필사 노트 신청이 쓰는 이름).
- 새 액션 = `authz.ts` `ACTION_ROLES` + `index.ts` switch case + `tests/server.dev.test.mjs` PROBE **세 곳**(하나라도 빠지면 400·시험 실패).
- 응답에 `user_id`·`auth_user_id`·`ident_key`·`answers`·`phone`·`memo`·`person_id` 를 싣지 않는다 — 예외 하나: `evPerson` 의 `full`(교인명부 역할·총괄에게만 교인ID · Task 16). 명시적 칸 지도로만 만든다. `note`(담당자 메모)와 `memo`(성도님 한 줄)는 다른 칸 — 이 기능은 `memo` 를 쓰지 않는다.
- `ident_key` 는 `paper.ts` 의 `appIdentityKey`(NFC 안 함)로. `authz.ts` 의 `identityKey`(NFC)를 쓰면 앱 계정과 영영 안 맞는다.
- 1,000행: 표를 읽을 때는 `allRows`(쪽 나누기 + `order(id)`), 개수는 `head:true`. 한글 키 `.in()` 은 100개씩 나눈다.
- 앱에서 낸 줄(`source='app'`)과 자격 회차(`needs.eligibility` 있음)의 줄은 **담당자 메모만** 고친다. 자격 회차에는 더하기·올리기·빼기를 막는다(`eligibility-event`).
- 담당자가 더한 줄: `source='import'`, `note` 앞에 `담당자가 더함`(올리기는 `명단 올리기`, 교인명부로 채운 줄은 `소속: 교인명부로 채움`, 겹치면 ` / `). 앱 계정은 **조회만** 해서 잇는다(만들지 않는다).
- 교인명부에서 담당자에게 주는 값은 **이름·구분·소속·세부·직분 다섯**뿐(예외: 교인명부 역할·총괄이 명단의 이름을 누르면 교인명부 「자세히」 창 — Task 16 `evPerson` `full`). 찾을 때마다 `people.lookup`(검색어), 살펴보기에서 채울 때마다 `people.fill`(채운 이름) 기록.
- 팝업: `alert`·`confirm`·`prompt`·`beforeunload` 금지 · `<select>`·`<input type=date|time>`·`datalist` 금지 → `ui.js` `dialog`/`toast`, `js/core/modal.js` `openForm`, `js/core/picker.js` `pickOne`/`pickMany`/`pickDate`. 유일한 예외는 엑셀 파일 고르기(붙여넣기·끌어다 놓기를 함께 둔다).
- UI 표준 v1: 주 단추 48px · 둘째 44px · 칩 36px · 글자 13px 이상 · 폰 카드 / PC(≥1024px) 표 · 메뉴마다 새 `<section>` · 저장 중 `busy()` · CSS 는 `be-` 접두 블록.
- 공개 저장소: 실명·전화·진짜 명단을 코드·시험·문서에 넣지 않는다(시험 이름은 `ca-test-…`, 예시는 「홍길동」). leak-scan·pre-commit 그대로.
- 순수 모듈 `.ts` 는 원격 import·enum·namespace 금지(Node 시험이 그대로 읽는다).
- **다른 세션이 main 을 계속 고친다**(이 계획은 church-admin main `a2dfd7c` 기준 — `js/core/picker.js` 합쳐진 뒤). 파일을 고칠 때는 줄 번호가 아니라 **앵커 글**로 찾고, 앵커가 한 번만 나오는지 `grep -c` 로 먼저 본다. 기존 import 줄은 다시 쓰지 않고 새 import 문을 더한다.
- `index.ts` 문법 검사는 **개발 함수 배포**가 한다(`node --check` 는 TS 오류를 못 잡는다). 개발 배포는 워크트리 루트에서.
- 성경암송 저장소의 커밋은 **Task 15(여는 날)에만** 한다 — 그 저장소 main 은 다른 세션이 자주 푸시해서 미리 커밋하면 먼저 나간다.

## 파일 지도

| 파일 | 맡는 일 | 과제 |
|---|---|---|
| `docs/port/event-roster-legacy.md` | 성경암송 이벤트 관리의 옛 동작 원문(옮기기 기준) | 1 |
| `supabase/functions/church-admin/events-rules.ts` | 회차 검사·공개 판정·줄 다듬기·판정표·신원 키 | 2 |
| `supabase/functions/church-admin/events-people.ts` | 교인명부 → 이벤트 줄 옮겨 적기·빈칸 채우기·찾기 다섯 칸 | 3 |
| `supabase/functions/church-admin/people-match.ts` | `applicantFromSignup` 더함(교적 표시) | 3 |
| `supabase/functions/church-admin/events-stats.ts` | 사람 묶음(합집합)·통계·빠른 고르기 | 4 |
| `supabase/functions/church-admin/events-rows.ts` | 한 분 더하기·고치기의 줄 규칙(붙임말·바뀐 칸·같은 분 키) | 7 |
| `supabase/functions/church-admin/events-upload.ts` | 올리기 판정·채우기·건수 | 8 |
| `supabase/functions/church-admin/events-person.ts` | 이름을 누르면 교적 창 — 고르는 규칙(교적 표시와 같은 `sameAffiliation`)·응답 모양 | 16 |
| `supabase/sql/004_bibleevent_role.sql` | 역할 한 줄 | 5 |
| `supabase/functions/church-admin/authz.ts` | 새 액션 13개의 역할 | 5–8, 16 |
| `supabase/functions/church-admin/index.ts` | 새 액션 13개·도움 함수 | 5–8, 16 |
| `tests/events-*.test.mjs`·`tests/people-match.test.mjs`·`tests/authz.test.mjs`·`tests/server.dev.test.mjs` | 시험 | 2–8, 16 |
| `js/core/modal.js` · `js/main.js` · `tests/modal.test.mjs` | 직접 만든 입력 창 · 메뉴 옮길 때 닫기 | 9 |
| `js/menus/bibleevent/roster*.js`·`event-form.js`·`row-form.js` | 📋 회차·명단 | 10 |
| `js/menus/bibleevent/upload*.js` | 📤 명단 올리기 | 11 |
| `js/menus/bibleevent/history*.js` | 👤 사람별 이력·통계 | 12 |
| `js/menus/bibleevent/person-*.js` · `tests/be-person-logic.test.mjs` · `js/menus/people/search.js`(`openPerson` 내보내기 한 단어) | 이름을 누르면 교적 창(화면 · 뒤로 가기 한 칸) · 📋·👤 이름 단추(`roster-ui.js`·`roster.js`·`history.js`) | 16 |
| `js/menus/registry.js` · `js/core/ui.js` · `css/admin.css` | 메뉴 줄 · 오류 문구 · `be-` 모양 | 9–12, 16 |
| `js/menus/system/audit.js` · `tests/audit.test.mjs` · `privacy.html` · `CLAUDE.md` | 기록 이름 · 개인정보 안내 · 문서 | 13(`privacy.html` 6번 「이름을 누르면」 한 줄은 16) |
| `tests/seed-bible-events-dev.mjs` | localhost 확인용 개발 DB 재료(가짜 명단) | 14 |
| (성경암송) `supabase/functions/api/index.ts` · `admin-event.html` · `supabase/event_stamp_2026.sql` · 가을 설계 문서 · `CLAUDE.md` | 얼리기 · 안내 띠 · 다시 돌리지 말 것 · 개시 절차 · 문서 | 15 |

---

### Task 1: 선행 확인 · 작업 가지 · 옛 동작 원문(`docs/port/event-roster-legacy.md`)

**Files:**
- Create: `C:\Projects\church-admin\.worktrees\bible-events\docs\port\event-roster-legacy.md` (채운 뒤 2,190줄 · 코드 블록 38개)
- Create(git): 가지 `bible-events` · 워크트리 `C:\Projects\church-admin\.worktrees\bible-events` (`.worktrees/` 는 `.git/info/exclude` 의 `.worktrees/` 줄이 이미 가린다 — Step 2 에서 `git check-ignore` 로 본다)
- Read only(고정 커밋 `4261deaae1e366cc7c795181f67bbdf52210c128`, 저장소 `C:\Projects\bible-memorize-church-app-v2`):
  - `supabase/functions/api/index.ts` — 152-157 · 166-172 · 453-466 · 4804-4811 · 5079-5139 · 5150-5165 · 5287-5349 · 5351-5436 · 5438-5460 · 5462-5589 · 5591-5608 · 5610-5633 · 5635-5701 · 5703-5788 · 5790-5932
  - `admin-event.html` — 1-18 · 19-119 · 120-131 · 132-175 · 177-201 · 203-231 · 233-303 · 305-335 · 337-400 · 402-434 · 436-468 · 470-494 · 496-546 · 548-597 (597줄 가운데 사이 빈 줄 10을 뺀 전부)
  - `supabase/events.sql` 1-129 · `supabase/events_display.sql` 1-37 · `supabase/event_stamp_2026.sql` 1-75 · `supabase/member_merge.sql` 18-41 · 43-59 · 125-130
  - `admin.html` 72-76 · `js/api.js` 114-125 · `tests/event-smoke.sh` 94-102
- Test: 없음(문서다) — 확인은 원문 `diff` 대조 두 번 + `node tools/leak-scan.mjs` + `python tools/preflight.py`

**Interfaces:** Consumes: main 의 `js/core/picker.js`(합치기 `35664e0` 「merge: 공용 고르개(native-pickers)」로 들어왔다 · 이 계획의 기준 main `a2dfd7c`) — `pickOne({anchor,title,options,value,mode})` · `pickMany({anchor,title,options,values,mode})` · `pickDate({anchor,title,value,min,max,mode})`(셋 다 Promise → 고른 값 · 닫기·Esc 는 `null` · `pickDate` 의 「지우기」는 `""` · 고르개는 Esc 를 capture 단계에서 받아 멈춘다 · `pickTime` 도 있으나 이 기능은 쓰지 않는다) / Produces: 가지 `bible-events`(Task 2~15 의 모든 명령은 `C:\Projects\church-admin\.worktrees\bible-events` 에서) · `docs/port/event-roster-legacy.md` 의 절 번호 — 0(대응표) · 1.0~1.14(서버) · 2.1~2.4(DB) · 3.0~3.14(화면) · 4(동작 1~59) · 4-1(얼리기) · 4-2(옮길 때 정한 것) · 5(크기) · 찾지 못한 것 1~8. 뒤 과제는 「원문 1.9」·「원문 동작 45」처럼 이 번호로 가리킨다.

> 이 과제는 **어느 저장소의 코드도 바꾸지 않는다.** 성경암송 저장소는 읽기만 한다(`git show` 로 고정 커밋을 읽으므로 그 작업 트리의 남의 변경과도 무관하다).
> 푸시하지 않는다. church-admin main 은 다른 세션이 계속 고친다 — 이 과제는 main 을 옮기지도(merge·pull) 고치지도 않는다(Step 1 의 판정 2 한 경우만 빼고).

- [ ] **Step 1: 선행 확인 — 고르개(`js/core/picker.js`)가 main 에 있으면 진행**

설계 3절 「팝업」: 날짜·고르기 칸은 `js/core/picker.js` 로 만든다. 설계를 쓸 때는 가지 `native-pickers` 에만 있었는데, 지금은 **main 에 합쳐져 있다**(합치기 `35664e0` · 그 뒤 main `a2dfd7c`). `native-pickers` 가지는 지워졌으므로 그 이름으로 확인하지 않는다 — 고르개를 고친 마지막 커밋 `542ecf2`(날짜 `min`/`max`)가 main 에 들어 있는지로 본다.

```bash
cd /c/Projects/church-admin
git fetch origin || echo "FETCH-FAILED (그대로 두고 아래 local 판정만 본다)"
echo "main:        $(git cat-file -e main:js/core/picker.js 2>/dev/null && echo HAS-PICKER || echo NO-PICKER)"
echo "origin/main: $(git cat-file -e origin/main:js/core/picker.js 2>/dev/null && echo HAS-PICKER || echo NO-PICKER)"
echo "exports: $(git show main:js/core/picker.js 2>/dev/null | grep -c -E '^export function (pickOne|pickMany|pickDate)\(')"
git merge-base --is-ancestor 542ecf2 main 2>/dev/null && echo PICKER-FIXES-IN-MAIN || echo PICKER-FIXES-MISSING
git log -1 --format='%h %s' main
```

진행해도 되는 모양(Expected):
```
main:        HAS-PICKER
origin/main: HAS-PICKER
exports: 3
PICKER-FIXES-IN-MAIN
a2dfd7c docs: 고르기·날짜·시각은 js/core/picker.js 만 — select·date·time 입력 금지(폰 시스템 창)   ← 또는 그 뒤의 main 커밋(다른 세션이 계속 고친다 — 해시는 보지 않는다)
```

판정 — 아래 셋 가운데 하나만 한다:
1. `main: HAS-PICKER` · `exports: 3` · `PICKER-FIXES-IN-MAIN` → **Step 2 로.** (2026-09-29 저녁, 이 계획을 고칠 때의 상태다.)
2. `main: NO-PICKER` 인데 `origin/main: HAS-PICKER` → 이 PC 의 main 이 뒤처진 것이다. `git status --short` 가 **아무것도 안 찍을 때만** `git merge --ff-only origin/main` 을 하고 Step 1 을 처음부터 다시 돈다. 무엇이 찍히거나(다른 세션이 main 작업 트리에서 일하는 중) ff 가 거절되면 3 으로.
3. 그 밖(`exports` 가 3 이 아님 · `PICKER-FIXES-MISSING` · 양쪽 다 `NO-PICKER` — 누가 되돌렸거나 이름을 바꿨다) → **여기서 멈춘다.**
   - 가지·워크트리를 만들지 않는다. Step 2~8 을 하지 않는다.
   - 다른 곳에서 `picker.js` 를 베껴 오거나 옛 커밋을 되살리지 **않는다** — 고르개는 다른 세션이 맡은 공용 파일이다.
   - 친구에게 이렇게 알리고 답을 기다린다:
     > 친구, 성경필사(암송) 작업을 시작하려는데 main 의 고르개(`js/core/picker.js`)가 계획을 쓸 때(main `a2dfd7c`)와 달라요 — `pickOne`·`pickMany`·`pickDate` 셋이 다 있지 않거나 날짜 `min`/`max` 고침(542ecf2)이 빠져 있어요. 회차 설정의 날짜·상태 칸을 시스템 창 없이 만들려면 이 셋이 있어야 해요(설계 3절 「팝업」). 고르개를 맡은 세션에서 어떻게 된 것인지 먼저 알려 주세요. 제가 고르개를 고치거나 가져오지는 않을게요.

- [ ] **Step 2: 작업 가지와 워크트리 만들기**

```bash
cd /c/Projects/church-admin
git branch --list bible-events
test -e .worktrees/bible-events && echo EXISTS || echo FREE
git check-ignore -v .worktrees/
```
Expected: 첫 줄은 아무것도 안 찍힘 · `FREE` · `.git/info/exclude:<줄 번호>:.worktrees/	.worktrees/`(2026-09-29 에는 9행 — 줄 번호는 보지 않는다).
`bible-events` 가지나 폴더가 이미 있으면 **지우지 말고 멈춰** 친구에게 묻는다(다른 세션이 쓰는 중일 수 있다).
`git check-ignore` 가 아무것도 안 찍으면(가림 줄이 사라졌다) 멈추고 친구에게 묻는다 — 워크트리 폴더가 main 의 `git status` 에 뜨게 된다.

```bash
git worktree add .worktrees/bible-events -b bible-events main
```
Expected: `Preparing worktree (new branch 'bible-events')` · `HEAD is now at <main 의 해시> …`

- [ ] **Step 3: 새 워크트리의 출발점 확인**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
git status --short --branch
test -f js/core/picker.js && echo HAS-PICKER || echo NO-PICKER
git config core.hooksPath
python tools/preflight.py | tail -1
echo "START=$(git rev-parse --short HEAD)"
```
Expected:
```
## bible-events
HAS-PICKER
.githooks
모두 통과
START=a2dfd7c   ← 또는 그 뒤의 main 해시
```
(`## bible-events` 아래에 다른 줄이 없어야 한다. preflight 의 시험 파일 수는 main 이 움직이면 달라져 보지 않는다 — 2026-09-29 저녁 main `a2dfd7c` 는 16개였다.)
`START` 해시를 적어 둔다 — Step 8 이 「이 가지에 커밋이 하나만 더해졌는가」를 이것으로 본다(그사이 다른 세션이 main 을 옮겨도 이 해시는 그대로다).

- [ ] **Step 4: 성경암송 쪽 고정 커밋 확인**

```bash
V2=/c/Projects/bible-memorize-church-app-v2
git -C $V2 cat-file -e 4261deaae1e366cc7c795181f67bbdf52210c128^{commit} && echo PINNED-OK
git -C $V2 log --format='%h %cs' 4261dea..HEAD -- supabase/functions/api/index.ts admin-event.html supabase/events.sql supabase/events_display.sql supabase/event_stamp_2026.sql supabase/member_merge.sql admin.html js/api.js tests/event-smoke.sh
```
Expected: `PINNED-OK` 한 줄, 둘째 명령은 아무것도 안 찍음.
둘째 명령이 커밋을 찍으면 하나씩 `git -C $V2 show --stat <해시>` 로 본다 — `event` 로 시작하는 함수·`evt` 헬퍼·`admin-event.html`·`events*.sql` 을 바꿨으면 **멈추고 친구에게 알린다**(원문 기준을 새 커밋으로 옮길지 정해야 한다). 그 밖의 곳만 바꿨으면 그대로 간다 — Step 6 스크립트가 그 커밋들을 문서 머리에 적는다.

- [ ] **Step 5: 원문 문서의 뼈대 쓰기**

Write 도구로 `C:\Projects\church-admin\.worktrees\bible-events\docs\port\event-roster-legacy.md` 를 **아래 내용 그대로** 만든다.
`@@v2 <경로> <시작>-<끝> | <첫 줄 글자>@@` 줄은 Step 6 스크립트가 성경암송 커밋 `4261dea` 의 그 줄들로 바꿀 자리다(첫 줄에 `|` 뒤 글자가 없으면 스크립트가 멈춘다 — 줄 번호가 어긋났다는 뜻). `@@AFTER@@`·`@@SIZE@@` 도 스크립트가 채운다. 한 글자도 바꾸지 말 것 — 표식 줄의 빈칸 하나가 틀려도 스크립트가 그 줄을 못 알아본다.

````markdown
# 「🎉 이벤트 관리」 — 레거시 추출 (읽기 전용 조사 · 성경필사(암송) 옮기기의 기준)

대상: 성경암송 v2 저장소(`C:\Projects\bible-memorize-church-app-v2`) **커밋 `4261dea`**(2026-09-29) —
`admin-event.html`(이벤트 관리 화면 전부) + `supabase/functions/api/index.ts`(관리자 이벤트 액션 다섯과 그 헬퍼,
판단 근거가 되는 성도님 액션 넷) + `supabase/events.sql`·`events_display.sql`·`event_stamp_2026.sql`(표·칸·가을 회차 행)
+ `supabase/member_merge.sql` 발췌 + `admin.html` 타일 한 줄 + `js/api.js` 래퍼 + `tests/event-smoke.sh` 발췌.
옮길 곳: 교회 어드민 메뉴 묶음 「성경필사(암송)」(역할 `bibleevent`) — 설계
`C:\Projects\bible-memorize-church-app-v2\docs\superpowers\specs\2026-09-29-church-admin-bible-events-design.md`.
범위 밖: 옛 「말씀 이벤트」(퀴즈형 — `eventEnter`·`eventStatus`·`eventBoard`·`eventEntrants`, 표 `event_entries`) ·
필사 노트 신청(`pilsa*`, 표 `pilsa_orders`) · 가을 도장판 계산(`eventStamps`·`evtStampsFor`·`evtPhase`·`evtNeedFor`·
`evtCanReach`·RPC `v2_event_weeks` — 이름만).

> 원문은 `git -C C:\Projects\bible-memorize-church-app-v2 show 4261dea:<경로>` 를 **스크립트로** 옮겼다(손으로 베끼지 않았다 —
> 블록마다 첫 줄을 대조해 줄 번호가 맞는지 확인했다). 줄 번호는 그 커밋의 것이다. 여러 세션이 함께 고치는 파일이라
> **함수 이름으로 다시 찾을 것** — 얼리기(Task 15)처럼 이 파일들을 고칠 때도 줄 번호가 아니라 글(앵커)로 찾는다.
> 원문 주석의 예시 이름 두 개(「이름-목장」 꼴)는 공개 저장소 규칙에 따라 「홍길동」·「홍길순」으로 바꿨다 —
> 그 밖은 한 글자도 바꾸지 않았다.

**이 스냅샷 뒤에 위 원본 파일을 바꾼 성경암송 커밋**(채울 때 `git log 4261dea..HEAD` 로 적었다 — 있으면 그 커밋을 먼저 읽을 것):

@@AFTER@@

---

## 0. 한눈에 — 옛 것과 새 것

| 옛 것(성경암송) | 새 것(교회 어드민) | 달라지는 것 |
|---|---|---|
| `adminError` — 관리자 비밀번호 하나(1.0) | 카카오 로그인 + 역할 `bibleevent`(`authz.ts` `ACTION_ROLES`) | 액션마다 역할 확인 · `admin_audit` 기록 |
| `eventRoster` — 회차 목록 + 줄 + 자격 계산(1.6) | `evEvents`(회차·인원·`listedNow`·`hasEligibility`) + `evRoster`(한 회차 줄 전부·교적 표시) | 1,000행은 `allRows` · 응답에 `phone`·`memo` 를 싣지 않음 · 자격 계산·미신청 목록은 옮기지 않음 |
| `eventSave` — upsert 하나로 만들기·고치기(1.8) | `evEventCreate`(insert 만 · draft 고정 · `needs` 기본값) + `evEventSave`(보낸 칸만 · `expect` · `needs-confirm`) | 목록 밖 status 는 `bad-status` · 공개 확인 · `before-eligibility` · `needs`·`copy`·`kind`·`sort_order` 를 받지 않음(보내면 조용히 무시 · 새 회차 `sort_order` 는 DB 기본값 0 — 4-2) |
| `eventSetNote` — 담당자 메모(1.7) | `evRowSave` 의 `note` | `expect` 확인 · 500자 넘으면 `note-too-long`(옛것은 말없이 자름) |
| `eventImport` — 그 회차 import 줄을 지우고 다시 넣기(1.9) | `evUploadCheck`/`evUploadSave`(더하기만 · 지우지 않음) · `evRowAdd`(한 분) | 상한 5,000→600 · 다듬기 규칙을 서버 순수 함수로 · 계정 잇기에 `user_identity_aliases` 포함 · `already` 판정 · 자격 회차는 `eligibility-event` · `note` 는 붙임말(`담당자가 더함`·`명단 올리기`)을 붙인 **뒤** 500자 넘으면 `note-too-long` |
| (없음) | `evRowSave`(줄 고치기) · `evRowDelete`(줄 빼기) · `evHistory` · `evStats` · `evPeopleLookup` | 새로 · app 줄과 자격 회차의 줄은 메모만 고치고 빼지 않는다(`app-row-note-only`·`app-row`·`eligibility-event`) |
| `evtListable`·`evtToday`·`EVT_ID_RE`·`EVT_STATUS`(1.4) | `events-rules.ts` `evtListable`·`kstToday`·`EVT_ID_RE`·`EVT_STATUS` | 글자 그대로 |
| `evtImportPosition`(1.9) | `events-rules.ts` `cleanPosition` | 원문 그대로 + 끝에 한 번 더 다듬기(4-2 · 「집사 님」→「집사」) |
| `norm`·`identityKey`(1.2) | `paper.ts` `legacyNorm`·`appIdentityKey`(이미 있음) | NFC 안 함 — 그대로 |
| `MIN_POSITIONS`(1.3) | `paper.ts` `MIN_POSITIONS`(이미 있음) | 막지 않고 경고만(설계 0절 「직분 검사」) |
| `EVT_GU_ORDER`·`evtSubRank`(1.10 공개 명단 차례) | `events-rules.ts` `BE_GU` · `roster-logic.js` `groupRows` | 관리 화면도 공개 명단 차례로(옛 관리 화면 3.9 는 가나다) |
| `evtRule`(1.5 자격 회차 판정) | `events-rules.ts` `isEligEvent`·`eligibilityStart` — `evEvents` 의 `hasEligibility` · `eligibility-event` · `before-eligibility` 가 모두 이 둘만 쓴다 | 4-2 정함 — `needs.eligibility` 가 객체면 모양이 틀려도 자격 회차(막는 쪽) · 시작일은 날짜 꼴일 때만 |
| `admin-event.html`(3절) | `js/menus/bibleevent/roster*.js`·`event-form.js`·`row-form.js` | `prompt`·`alert`·`<select>`·`type=date` 없이 직접 만든 창·고르개 |
| `eventRosterPublic`·`eventOpenList`·`eventSignup`·`eventDrop`·`eventStamps` | 옮기지 않는다 — 성도님 액션, 건드리지 않음 | — |
| `eventExcuse`·자격 회차 미신청 목록 | 옮기지 않는다 — 성경암송에 남김(설계 4-3·7절) | — |

---

## 1. 서버 액션 (`supabase/functions/api/index.ts`)

### 1.0 게이트 — `adminError`(관리자 비밀번호 하나 · 역할 없음)

@@v2 supabase/functions/api/index.ts 166-172 | // 관리자 비밀 확인@@

관리자 이벤트 액션 다섯(`eventRoster`·`eventSetNote`·`eventExcuse`·`eventSave`·`eventImport`)이 모두 첫 줄에서 이것만 부른다.
비밀번호 하나로 관리자 액션 50여 개가 함께 열린다(설계 0절 「방식」에서 B 를 버린 까닭). 새 쪽은 카카오 로그인 + 역할 `bibleevent`.

### 1.1 라우팅 — 이벤트 플랫폼 액션 열

@@v2 supabase/functions/api/index.ts 453-466 | // ---- 이벤트 플랫폼 (분기 회차 · 2026-09-10) ----@@

`eventOpenList`·`eventStamps`·`eventSignup`·`eventDrop`·`eventRosterPublic` 은 성도님 앱이 부르고,
`eventRoster`·`eventSetNote`·`eventExcuse`·`eventSave`·`eventImport` 는 관리자 비밀번호로 부른다.
얼리기(설계 4-3)는 이 가운데 `eventImport`·`eventSave`·`eventSetNote` 셋이다(막는 줄의 자리는 4-1).

### 1.2 공용 헬퍼 — `norm` / `identityKey` / `kstDay`

@@v2 supabase/functions/api/index.ts 152-157 | const norm = (s: unknown)@@

교회 어드민 `supabase/functions/church-admin/paper.ts` 의 `legacyNorm`·`appIdentityKey` 가 이 두 줄을 글자 그대로 옮긴 것이다
(완성형(NFC)으로 바꾸지 않는다). `event_signups.ident_key` 는 반드시 이것으로 만든다 — `authz.ts` 의 `identityKey`(NFC)로
만들면 앱 계정과 영영 안 맞는다.

### 1.3 직분 목록 — `MIN_POSITIONS`

@@v2 supabase/functions/api/index.ts 4804-4811 | // 직분 — 고른 것만 받는다.@@

앱에서 내는 `eventSignup` 은 이 목록으로 **막고**(1.12), 이관 `eventImport` 는 **막지 않고 알리기만** 한다(1.9 `oddPositions`).
교회 어드민 `paper.ts` 에 같은 목록이 있다(app.js · api · DB CHECK · paper.ts 네 곳).

### 1.4 이벤트 블록 머리 · 상수 · 날짜 · 공개 판정 · 성도 응답 한 줄

@@v2 supabase/functions/api/index.ts 5079-5139 | // 이벤트 플랫폼 (분기 회차) — 2026-09-10@@

- `EVT_ID_RE` — 회차 id. 주소(`?ev=`)에 그대로 쓰인다.
- `EVT_STATUS` — draft·open·closed·archived. DB CHECK(2.1)와 같다.
- `evtToday` — KST 오늘. `ymd(new Date())` 는 UTC 라 자정 무렵 하루가 어긋난다.
- `evtOpenNow`(등록을 받는가)와 `evtListable`(성도님께 보이는가)은 **다른 물음**이다. 마감(closed)도 보이고,
  `list_until` 이 있으면 그날까지만 보인다(비면 기한 없음).
- `evtShown` — 짧은 이름이 있으면 그것. 관리 화면 칩은 `title` 을 쓴다(3.6).
- `evtRow` — 성도님 응답 한 줄의 화이트리스트. `user_id`·`ident_key`·`note` 가 구조적으로 빠진다.

### 1.5 자격 회차 판정 — `evtRule`

@@v2 supabase/functions/api/index.ts 5150-5165 | // needs.eligibility 를 읽어 규칙으로.@@

⚠️ 성경암송 서버에서 「자격 회차인가」는 `needs.eligibility` 가 **있는가**가 아니라 **이 함수가 규칙을 돌려주는가**다 — 모양이 틀리면
(`start` 가 날짜 꼴이 아님 · 정수가 아님 · 범위 밖) null 이고, 그러면 `eventRoster`·`eventSignup`·`eventStamps` 가 그 회차를 보통 회차로 본다.
새 쪽은 이 차이를 알고 **일부러 다르게** 정했다 — `isEligEvent`(객체면 자격 회차)·`eligibilityStart`(날짜 꼴일 때만) · 4-2.

### 1.6 `eventRoster` — 관리자 명단(회차 목록 + 줄 + 자격 계산)

@@v2 supabase/functions/api/index.ts 5462-5589 | // ---------- eventRoster: 관리자 명단@@

- 회차 목록은 `closes_on` 내림차순, 회차마다 `head:true` 개수(1,000행 사고 뒤 커밋 `576acfc`).
- 줄은 `select("*")` + `.limit(2000)` — PostgREST 는 1,000행에서 **오류 없이** 자른다. `event_id` 를 주면 한 회차(지금 최대 515줄)라
  드러나지 않지만, 주지 않으면(화면 첫 진입) 전 회차 2,834행 가운데 1,000행만 온다. 새 쪽은 `allRows`.
- 줄 응답에 `user_id`·`ident_key`·`answers` 원본은 없고 `hasUser`·`excused`·`excuseReason` 파생값만 있다. **`phone`·`memo` 는 싣는다**
  (새 쪽 `RowOut` 은 둘 다 싣지 않는다).
- 자격 회차를 골랐을 때만 `v2_event_weeks` 한 번으로 줄마다 `weeksDone`·`perfect`·`eligible` 과 「아직 신청 안 하신 분」
  (300명에서 자르고 `missingTotal`)을 만든다 — **옮기지 않는다**(성경암송에 남김, 설계 4-3·7절).
- 회차 칸에 `needs`·`copy` 는 없다. `listedNow` 가 여기서 처음 나온다.

### 1.7 `eventSetNote` — 담당자 메모

@@v2 supabase/functions/api/index.ts 5591-5608 | // ---------- eventSetNote: 담당자 메모 ----------@@

- `norm` 이라 줄바꿈이 빈칸 하나로 접히고, 500자에서 **말없이 잘린다**(새 쪽은 `note-too-long` 으로 거절한다).
- app 줄·import 줄을 가리지 않는다. 동시 고침 검사(`expect`)가 없다 — 나중 저장이 이긴다.
- 0행 update 에 PostgREST 가 오류를 안 내므로 `.select("id").maybeSingle()` 로 `not-found` 를 가린다(새 쪽도 같은 까닭으로 `not-found`).

### 1.8 `eventSave` — 회차 만들기·고치기(upsert 하나)

@@v2 supabase/functions/api/index.ts 5635-5701 | // ---------- eventSave: 관리자 회차 만들기 / 고치기 ----------@@

- **보낸 칸만** 바꾼다(`has()` = hasOwnProperty). 만들기와 고치기가 upsert 하나라 **이미 있는 id 로 「만들기」를 하면 고치기가 된다**
  (새 쪽은 `evEventCreate` 가 insert 만 하고 `exists`).
- 검사 차례: `bad-event-id` → `no-title` → `bad-period` → `period-reversed` → (`status`·`kind` 는 목록 밖이면 **오류 없이 기존 값**,
  새 회차면 draft·signup) → `bad-list-until` → `list-until-before-close`.
- ⚠️ `list_until` 검사는 `list_until` 을 **보냈을 때만** 돈다 — `closes_on` 만 뒤로 미루면 `list_until < closes_on` 인 회차가 생길 수 있다
  (DB 에도 CHECK 가 없다). 화면(3.13)은 늘 `list_until` 을 함께 보내 이 길을 밟지 않았다.
- 공개 확인이 없다 — draft 를 open 으로 바꾸는 저장 한 번으로 곧바로 성도님 첫 화면에 뜬다.
- 자격 회차의 `opens_on` 이 `needs.eligibility.start` 보다 앞서도 막지 않는다(2.3 머리 경고뿐).
- `needs`·`copy`·`sort_order`·`kind` 도 받는다(화면은 `needs`·`copy` 를 일부러 안 보낸다 — 3.13). 응답은 upsert 한 행 전체(`needs`·`copy` 포함).

### 1.9 `eventImport` — 옛 명단 이관(그 회차 import 줄을 **지우고** 다시 넣는다)

@@v2 supabase/functions/api/index.ts 5790-5932 | // ---------- eventImport: 옛 명단 이관 (관리자) ----------@@

- ⚠️ ④ 에서 그 회차의 `source='import'` 줄을 **전부 지운 뒤** 넣는다 — 한 분만 보내면 나머지가 사라진다. 지운 뒤 넣기가 실패하면(→ 500)
  그 회차의 이관 줄이 **빈 채로 남는다**(한 트랜잭션이 아니다). 설계가 이 액션을 서버에서 얼리는 까닭.
- 상한 5,000줄(`too-many`). 이름이나 소속이 비면 버리고 `dropped` 로 센다.
- `type` 이 「교회학교」가 아니면 전부 교구. 소속·목장·이름은 `norm` 만 한다 — 「화평교구」·「20목장」·「07」·이름 끝 숫자 다듬기는
  **없다**(부르는 쪽이 다듬어 보냈다 — 「찾지 못한 것」 4).
- 같은 신원 키는 한 줄로 접고 `regDate` 가 가장 이른 줄을 남긴다.
- 직분은 `evtImportPosition`(괄호 속과 끝 「님」을 뗀다) — 목록 밖이어도 버리지 않고 `oddPositions` 로 알린다.
- 계정 잇기: `users` 를 **통째로** 읽어(`.limit(20000)` — 그래도 1,000행에서 잘린다 · 지금 421명) `identity_key` 가 글자 그대로 같으면 잇는다.
  `user_identity_aliases`(옛 키)는 **보지 않는다.** 그 회차에 앱으로 낸 줄의 계정은 잇지 않는다(`taken`).
- `regDate` 를 날짜로 못 읽으면 `created_at` 을 빼 DB 기본값(now())이 들어가게 한다. 500줄 묶음 insert.
- 응답은 건수만(`received`·`inserted`·`matched`·`dropped`·`noDate`·`oddPositions`) — 이름을 싣지 않는다.

### 1.10 `eventRosterPublic` — 성도님께 보이는 명단(옮기지 않는다 · 묶음 차례의 원본)

@@v2 supabase/functions/api/index.ts 5703-5788 | // ---------- eventRosterPublic: 성도님께 보이는 명단 ----------@@

- 로그인 없이 누구나 부른다. `evtListable` 이 아니면 `not-found`. 내보내는 칸은 **이름·구분·소속·세부·직분 다섯**뿐이다
  (담당자가 넣은 줄도 공개 기간 동안 여기 보인다 — 설계 0절 「개인정보 안내」).
- 묶음 차례: 교구(`EVT_GU_ORDER` 차례) → 교회학교(`EVT_BU_ORDER` 차례) → 목록 밖 이름은 그 묶음 뒤. 안에서는 목장 숫자 →
  숫자 아닌 것(「남성」) → 이름. 새 쪽 관리 화면(`roster-logic.js` `groupRows`)이 이 차례를 따른다(옛 관리 화면 3.9 는 가나다였다).
- `.limit(5000)` 이지만 PostgREST 상한 1,000 — 한 회차 최대 515줄이라 지금은 드러나지 않는다.

### 1.11 `eventOpenList` — 첫 화면 회차 목록(옮기지 않는다 · 공개 판정을 쓰는 곳)

@@v2 supabase/functions/api/index.ts 5287-5349 | // ---------- eventOpenList: 보여 줄 회차 + 내가 낸 것 + 직분 기본값 ----------@@

- 관리자 비밀번호가 맞으면 draft 까지, 아니면 open·closed 가운데 `evtListable` 인 회차만 — 이것이 「성도님 첫 화면에 보인다」의 정의다
  (새 쪽 `listedNow`·`needs-confirm` 이 같은 판정을 쓴다).
- 겹칠 때 차례: 등록할 수 있고 아직 안 낸 것 → 마감 가까운 순 → `sort_order` → id.

### 1.12 `eventSignup` / `eventDrop` — 성도님 액션(옮기지 않는다 · 「앱 줄은 메모만」의 근거)

@@v2 supabase/functions/api/index.ts 5351-5436 | // ---------- eventSignup: 등록 / 고치기(덮어쓰기) ----------@@

@@v2 supabase/functions/api/index.ts 5438-5460 | // ---------- eventDrop: 취소 = 행 삭제 ----------@@

- 이름·소속은 앱이 보낸 값이 아니라 `users` 에서 가져오고 `ident_key = identityKey(u)`, `sub_name = users.mok` **그대로**
  (「07」로 가입한 분은 07 — 설계 1절 「같은 분 판정」 1 의 까닭).
- `(event_id, user_id)` upsert 가 소속·직분·phone·memo·answers·`source='app'`·`updated_at` 을 **통째로 덮는다**.
  `note`·`created_at` 은 보내지 않으므로 남는다. ⚠️ 그래서 담당자가 계정에 이어 둔 import 줄에 그분이 앱에서 내면
  **그 줄이 app 줄이 된다**(같은 `(event_id, user_id)`) — 설계 1절 「같은 분 판정」 6 「이어진 줄의 부작용」.
- 자격 회차면 서버가 다시 센다(`not-eligible`) · 관리자 비밀번호면 통과.
- `eventDrop` 은 `id`+`user_id` 가 맞는 줄만, 등록 기간 안에서만(관리자 비밀번호면 기간 밖도) 지운다 — 이어 둔 import 줄도 그분이 지울 수 있다.

### 1.13 `eventExcuse` — 자격 인정(성경암송에 남긴다)

@@v2 supabase/functions/api/index.ts 5610-5633 | // ---------- eventExcuse: 사정이 있으셨던 분을 인정 ----------@@

`answers` 에 `excused`·`excuseReason` 을 합쳐 쓴다. 옮기지 않는다(설계 4-3 「남기는 것」·7절). 새 쪽은 `answers` 를 읽지도 쓰지도 않는다.

### 1.14 앱 쪽 API 래퍼 — `js/api.js`(관리자 넷은 부르는 곳이 없다)

@@v2 js/api.js 114-125 | // ---- 이벤트 플랫폼 (분기 회차) ----@@

`eventRoster`·`eventSetNote`·`eventExcuse`·`eventSave` 래퍼는 부르는 곳이 없다(`git grep` 0건 — 관리 화면은 자기 `callApi` 를 쓴다).
`eventImport` 래퍼는 아예 없다.

---

## 2. DB

### 2.1 `supabase/events.sql` 전문 — 두 표

@@v2 supabase/events.sql 1-129 | -- 이벤트 플랫폼 — 회차 정의 + 참가 기록@@

- `events.status` CHECK(draft·open·closed·archived) · `kind` CHECK(signup·quiz) · `closes_on >= opens_on` CHECK.
- `event_signups.event_id` 는 `on delete cascade`(회차를 지우면 줄도) · **`user_id` 도 `on delete cascade`** — 계정을 지우면 그 계정에
  이어진 줄(담당자가 넣고 이어 둔 import 줄 포함)이 함께 사라진다.
- `unique (event_id, user_id)` 는 NULLS DISTINCT — `user_id` 없는 줄의 중복은 DB 가 막지 않는다(설계 1절 「같은 분 판정」 3).
- `user_id` 가 없으면 `source='import'` 여야 한다(app_only CHECK) · `source` ∈ app·import.
- `who_type`·`group_name` 에는 CHECK 가 없다(서버가 막아야 한다). `updated_at` 을 채우는 트리거가 없다(코드가 넣는다).
- RLS 켜짐 · 정책 없음. `revoke ... from anon, authenticated` 줄은 없다(RLS 가 막는다).

### 2.2 `supabase/events_display.sql` 전문 — `short_title` · `list_until`

@@v2 supabase/events_display.sql 1-37 | -- 이벤트 플랫폼 — 화면용 짧은 이름 + 명단 공개 종료일@@

`events.sql` 에 없는 두 칸은 여기서 더했다. `short_title` 은 첫 화면 단추(한 줄 — 서버 상한은 없고 화면 `maxlength="20"` 뿐),
`list_until` 은 null 이면 기한 없음.

### 2.3 `supabase/event_stamp_2026.sql` 전문 — 가을 회차 한 건(다른 쓰는 길 ①)

@@v2 supabase/event_stamp_2026.sql 1-75 | -- 가을 말씀 동행 — **이 회차 한 건**의 행과 규칙 (자료)@@

- `on conflict (id) do update` 가 제목·짧은 이름·부제·묶음·기간·`list_until`·`sort_order`·`needs`·`copy` 를 **덮어쓴다**(`status` 만 안 덮는다).
  교회 어드민에서 회차 설정을 고친 뒤 이 파일을 다시 돌리면 고친 것이 사라진다 — 설계 4-3 ①.
- 머리 8-9행 「2026-10-11 아침에 담당자가 admin-event.html 에서 draft → open」 — 설계 4-3 ② 가 고칠 문구.
- 머리 14-17행 「opens_on 은 언제나 eligibility.start 보다 뒤」 — 새 쪽 `before-eligibility` 검사의 원문.

### 2.4 `supabase/member_merge.sql` 발췌 — 계정 합치기가 이벤트 줄을 건드리는 자리

@@v2 supabase/member_merge.sql 18-41 | -- 예전 앱이 합치기 전 번호로 저장하더라도@@

@@v2 supabase/member_merge.sql 43-59 | do $$@@

@@v2 supabase/member_merge.sql 125-130 |   if to_regclass('public.event_signups') is not null then@@

- `event_signups` 에는 **BEFORE INSERT OR UPDATE 트리거** `redirect_merged_member_write` 가 걸린다(이 파일이 DB 에 적용됐다면 —
  「찾지 못한 것」 7). 합쳐져 사라진 옛 계정 id 로 쓰면 새 계정 id 로 바꿔 넣고, 줄마다 전역 잠금 `pg_advisory_xact_lock(7240910, 1)`
  (`member_login` 과 같은 잠금)을 잡는다. 교회 어드민의 insert·update 도 이 트리거를 지난다.
- 두 계정이 같은 회차에 모두 줄이 있으면 합치기가 `merge-signup-conflict` 로 멈춘다 — 담당자가 이어 둔 줄이 합치기를 막을 수 있다.

---

## 3. 화면 (`admin-event.html`) — 🎉 이벤트 관리

### 3.0 머리 — 파일을 따로 둔 까닭

@@v2 admin-event.html 1-18 | <!DOCTYPE html>@@

### 3.1 CSS 전문

@@v2 admin-event.html 19-119 | <style>@@

### 3.2 뼈대 마크업

@@v2 admin-event.html 120-131 | </head>@@

### 3.3 상수 · 상태 · 호출 · 비밀번호 확인

@@v2 admin-event.html 132-175 | <script>@@

### 3.4 로그인 — `renderLogin`

@@v2 admin-event.html 177-201 | // ---------- 로그인 ----------@@

### 3.5 불러오기 — `load`

@@v2 admin-event.html 203-231 | // ---------- 불러오기 ----------@@

### 3.6 그리기 · 회차 칩 · 회차 폼 — `render` / `evChipsHtml` / `evFormHtml`

@@v2 admin-event.html 233-303 | // ---------- 그리기 ----------@@

### 3.7 한 회차로 좁히기 · 거르기 · 정렬 — `curRows` / `shown`

@@v2 admin-event.html 305-335 | // ⚠️ evRows 는 전 회차가 섞여 올 수 있다@@

### 3.8 명단 카드(요약 · 거르기 막대 · 표) — `evListHtml`

@@v2 admin-event.html 337-400 | function evListHtml(ev){@@

### 3.9 묶음 보기 — `evSubRank` / `evGroupedHtml`

@@v2 admin-event.html 402-434 | // 소속으로 묶고 한 줄에 여러 명@@

### 3.10 날짜 · CSV — `kstDate` / `downloadCsv`

@@v2 admin-event.html 436-468 | // 서버는 UTC 로 준다@@

### 3.11 오류 말 · 인정 · 메모 — `admErr` / `askExcuse` / `askNote`

@@v2 admin-event.html 470-494 | // 사정이 있으셨던 주를 인정@@

### 3.12 배선 — `wire`

@@v2 admin-event.html 496-546 | // ---------- 배선 ----------@@

### 3.13 회차 저장 · 시작 — `saveEvent`

@@v2 admin-event.html 548-597 | async function saveEvent(){@@

### 3.14 관리 허브 타일(갈아타기 때 주소를 바꿀 한 줄)

@@v2 admin.html 72-76 | // 관리 도구 목록@@

---

## 4. 동작 목록 (체크리스트)

꼬리표: **[옮김]** 새 쪽이 같게 한다 · **[바뀜]** 새 쪽이 일부러 다르게 한다(설계) · **[새로]** 옛 쪽에 없던 것 ·
**[안 옮김]** 성경암송에 남긴다 · **[다음 단계]** 이번이 아니라 자격 인정을 옮길 때 · **[근거]** 옮기지 않지만 새 쪽 규칙의 까닭 · **[발견]** 조사하다 찾은 것.

1. 관리자 이벤트 액션 다섯은 모두 관리자 비밀번호 하나(`adminError`)로만 막는다 — 역할·담당자 구분·기록이 없다 —
   index.ts:166-172, 5464-5465, 5594-5595, 5615-5616, 5637-5638, 5812-5813. **[바뀜]** 역할 `bibleevent` + `admin_audit`.
2. 회차 목록은 `closes_on` 내림차순이다 — index.ts:5470-5472.
3. 회차 칩 숫자는 회차마다 `head:true` 개수(추리기 전 전체 기준)다 — index.ts:5475-5486, admin-event.html:246. **[옮김]**
4. 명단 줄은 `.limit(2000)` 으로 받지만 PostgREST 가 1,000행에서 말없이 자른다 — `event_id` 없이 부르면(화면 첫 진입) 전 회차가 섞여
   1,000행만 온다 — index.ts:5488-5493, admin-event.html:204-229. **[발견]** 새 쪽은 `allRows`.
5. 화면은 전 회차가 섞여 와도 `curRows()` 로 고른 회차만 쓴다 — admin-event.html:144-146, 305-311.
6. 줄 응답에 `user_id`·`ident_key`·`answers` 원본이 없다 · `phone`·`memo`·`note` 는 있다 — index.ts:5499-5507. **[바뀜]** 새 `RowOut` 은 `phone`·`memo` 도 뺀다.
7. 자격 회차를 골랐을 때만 줄마다 채운 주·여섯 주·자격을 다시 세고 「아직 신청 안 하신 분」(300명에서 자름 · 총수 따로)을 준다 —
   index.ts:5509-5571. **[안 옮김]**
8. `listedNow` = 상태가 open·closed 이고 `list_until` 이 비었거나 KST 오늘 ≤ `list_until` — index.ts:5102-5104, 5115-5119, 5583. **[옮김]** 글자 그대로.
9. 화면은 `listedNow` 가 거짓이면 까닭(준비 중 / 보관 / 공개 종료일 지남)을 붉은 안내로 보인다 — admin-event.html:293-298. **[옮김]**
10. 메모(`eventSetNote`): id 가 양의 정수가 아니면 `bad-args` · `norm` 으로 줄바꿈을 접고 500자에서 말없이 자른다 · 없는 줄이면 `not-found` ·
    `updated_at` 을 새로 쓴다 — index.ts:5596-5607. **[바뀜]** 500자 넘으면 `note-too-long` · `expect` 확인.
11. 메모는 app 줄·import 줄을 가리지 않고 고친다 — index.ts:5602-5604. **[옮김]** 새 쪽도 app 줄·자격 회차 줄의 메모는 고칠 수 있다(그 줄은 메모만).
12. 메모는 브라우저 `prompt()` 로 받고(지금 메모를 채워 보임) 오류는 `alert()` — admin-event.html:487-494, 527-531. **[바뀜]** 직접 만든 창.
13. 표에는 담당자 메모가 보이지 않는다 — 「메모」 단추를 눌러야 `prompt` 안에 보인다 — admin-event.html:379-397. **[발견]**
14. 회차 저장(`eventSave`)은 **보낸 칸만** 바꾼다(`has()`) — index.ts:5644-5650. **[옮김]**
15. 만들기와 고치기가 `upsert(onConflict: "id")` 하나다 — 이미 있는 id 로 만들면 고치기가 된다 — index.ts:5697-5698. **[바뀜]** `evEventCreate` 는 insert 만(`exists`).
16. 검사 차례: `bad-event-id` → `no-title` → `bad-period` → `period-reversed` → `bad-list-until` → `list-until-before-close` —
    index.ts:5642, 5652-5659, 5669-5678. **[옮김]**
17. `status`·`kind` 가 목록 밖이면 오류 없이 기존 값(새 회차는 draft·signup)으로 둔다 — index.ts:5661-5666. **[바뀜]** `bad-status`.
18. `list_until` 을 보냈는데 비었으면 null(기한 없음) — index.ts:5673-5674. **[옮김]**
19. `list_until` 검사는 그 칸을 보냈을 때만 돈다 — `closes_on` 만 미루면 `list_until < closes_on` 이 될 수 있다 — index.ts:5671-5678. **[발견]**
20. 공개 확인이 없다 — draft → open 저장 한 번으로 곧장 성도님 첫 화면에 뜬다 — index.ts:5636-5701. **[바뀜]** `needs-confirm`(쓰기 전에).
21. 자격 회차의 `opens_on` 을 `eligibility.start` 앞으로 당겨도 막지 않는다 — index.ts:5655-5659, event_stamp_2026.sql:14-17. **[바뀜]** `before-eligibility`.
22. 동시 고침 검사가 없다 — 한 번 읽고(`cur`) upsert, 나중 저장이 이긴다 — index.ts:5649, 5697-5698. **[바뀜]** `expect` → `conflict`.
23. `needs`·`copy`·`sort_order`·`kind` 도 받는다 — index.ts:5664-5667, 5691-5693. 화면은 `needs`·`copy` 를 **일부러 안 보내고**(자격 규칙이
    조용히 지워지지 않게) `kind` 는 지금 값을 되돌려 보낸다 — admin-event.html:551-553, 562. **[바뀜]** 새 쪽은 넷 다 받지 않는다(만들 때 `needs` 기본값만 · 4-2).
24. 회차 폼: ID(만든 뒤 readonly) · 상태 `<select>` · 시작일·마감일·공개 종료일 `<input type=date>` · 이름 · 첫 화면 단추 이름(`maxlength="20"`) ·
    한 줄 설명 · 분기 표기 · 차례 `<input type=number>` — admin-event.html:266-288. **[바뀜]** `<select>`·`type=date` 없이 `pickOne`·`pickDate`.
25. 저장 전 화면 검사(ID 꼴 · 이름 · 기간 · 순서 · 공개 종료일 ≥ 마감) — 서버가 다시 검사한다 — admin-event.html:568-577.
26. 회차 저장 오류는 코드 그대로(「저장하지 못했습니다 — bad-period」) 보인다 — admin-event.html:584. **[바뀜]** `ui.js` `MESSAGES`.
27. 저장하면 그 회차를 다시 불러와 「저장했습니다」 — admin-event.html:585-587. 「+ 새 회차」는 폼을 비운다 — admin-event.html:507-508.
28. 첫 진입은 `event_id` 없이 한 번 부르고, 열린 회차(없으면 맨 앞)를 골라 한 번 더 부른다 — admin-event.html:204-231.
29. 회차 칩: 제목 · 전체 건수 · 상태 한국말(준비 중·열림·마감·보관) — admin-event.html:140-141, 240-252. 칩을 누르면 거르기를 비우고 다시 부른다 —
    admin-event.html:498-503.
30. 요약 줄: 전체 명수 · 앱 계정 연결 · 앱 등록 · 이관 건수(자격 회차면 채운 주 3주 이상 · 여섯 주 · 인정 · 아직 신청 안 하신 분) —
    admin-event.html:352-364. 자격 회차 안내 문구에 날짜가 박혀 있다(「2026-10-11 ~ 11-21」) — admin-event.html:349-351. **[발견]**
31. 거르기: 구분 `<select>` · 소속 `<select>`(가나다 · 건수) · 이름·소속·목장 부분 찾기(글자마다 다시 그리고 커서 자리를 되살림) · 초기화 —
    admin-event.html:313-323, 365-374, 510-520. **[바뀜]** 칩 · 찾기.
32. 표 머리를 누르면 그 칸으로 정렬(다시 누르면 반대) · 목장은 둘 다 숫자일 때만 숫자로 · 기본은 등록일 최근 먼저 —
    admin-event.html:150, 324-334, 539-545.
33. 표 칸: # · 구분 · 소속 · 목장·학년 · 직분 · 성명 · 주 · 등록일(KST) · 기록(앱/이관 · 계정 · 인정 · 메모 단추) — admin-event.html:379-397, 436-444.
34. 묶음 보기: 구분(교구 먼저) → 소속 **가나다**(교구 관례 차례가 아님) · 안에서 목장 숫자 → 숫자 아닌 것 → 이름 · 「이름-목장」 꼴 ·
    계정 있는 분은 굵게 — admin-event.html:402-434. **[바뀜]** 공개 명단(1.10)의 교구 차례.
35. 표/묶음 보기 고른 것을 `localStorage['ev-view']` 에 기억한다 — admin-event.html:152-154, 532-537.
36. 인쇄는 `window.print()` · 인쇄 CSS 가 막대·단추·칩을 숨긴다 — admin-event.html:104-118, 521-522. **[안 옮김]** 설계 7절(로비 인쇄용은 다음에).
37. CSV: 화면에서 추린 줄만 · BOM · 칸 12개(이름·구분·소속·목장학년·직분·주·여섯주·인정·인정 사유·등록일·성도 메모·담당자 메모) ·
    줄 끝 `\n` · 파일 이름 `<회차id>-명단.csv` — admin-event.html:446-468. **[바뀜]** `csvText`: 칸 일곱(이름·구분·소속·세부·직분·출처·교적) · `\r\n` · 메모 없음.
38. 자격 인정은 `prompt()` 로 사유를 받고 `alert()` — admin-event.html:479-486, 525-526. **[안 옮김]** 설계 7절.
39. 오류 코드를 한국말로 바꾸는 것은 셋뿐(`no-reason`·`not-found`·`bad-args`) — admin-event.html:471-477. `unauthorized` 면 저장한 비밀번호를
    지우고 로그인 화면으로 — admin-event.html:169-175.
40. 로그인은 `authCheck` 로 확인해 `sessionStorage['admin-pw']` 에 둔다(허브·통계 화면과 공유) — admin-event.html:136, 177-201. **[바뀜]** 카카오 로그인.
41. 줄 고치기(이름·소속·직분) · 줄 빼기 · 한 분 더하기 · 명단 올리기 단추가 **없다** — admin-event.html 전체.
    **[새로]** `evRowSave`·`evRowDelete`·`evRowAdd`·`evUploadCheck`/`evUploadSave`.
42. 이관(`eventImport`)은 그 회차 `source='import'` 줄을 전부 지우고 넣는다 · 지운 뒤 넣기가 실패하면 빈 채로 남는다 — index.ts:5905-5925.
    **[바뀜]** 새 쪽은 더하기만 한다(성경암송 쪽은 설계 4-3 으로 얼린다).
43. 이관 상한 5,000줄 · 이름·소속 빈 줄은 버린다 — index.ts:5797, 5822, 5834. **[바뀜]** 600줄(`too-many`) · 소속 빈 줄은 「빈칸」 판정.
44. 이관은 신원 키로 접고 가장 이른 `regDate` 를 남긴다 — index.ts:5824-5859. **[바뀜]** 올리기 안의 중복은 먼저 나온 줄이 남는다(설계 1절 「같은 분 판정」 4).
45. 이관 직분은 괄호 속·끝 「님」을 떼고(`evtImportPosition`), 목록 밖이어도 버리지 않는다 — index.ts:5799-5809, 5927-5929. **[옮김]** `cleanPosition`.
    ⚠️ **[발견]** 「님」을 뗀 뒤 다시 다듬지 않아 「집사 님」은 「집사 」(끝 빈칸)가 된다 — index.ts:5807. **[바뀜]** 새 쪽은 끝에 한 번 더 다듬는다(4-2).
46. 이관 계정 잇기는 `users` 통째 읽기(1,000행에서 잘림)로 글자 그대로 같은 `identity_key` 만 본다 — `user_identity_aliases` 는 안 본다 —
    index.ts:5861-5875. **[바뀜]** `usersByKeys`(users + aliases, 100개씩).
47. 그 회차에 앱으로 낸 계정은 이관 줄에 잇지 않는다 · 한 계정은 한 줄에만 잇는다 — index.ts:5877-5893.
48. 이관 `note` 는 `norm` 만(길이 상한 없음) · `phone`·`memo` 는 빈 값 — index.ts:5853-5855. **[바뀜]** 새 쪽 `note` 는 붙임말(`담당자가 더함`·`명단 올리기`·`소속: 교인명부로 채움`, ` / ` 로 이음)을 붙인 **뒤** 500자가 넘으면 `note-too-long`(창의 글자 수 상한은 480) · `phone`·`memo` 는 쓰지 않는다.
49. 공개 명단(`eventRosterPublic`)은 로그인 없이 다섯 칸만, `evtListable` 인 회차만 준다 — index.ts:5725-5742. **[안 옮김]** 그대로 둔다.
50. 첫 화면 목록(`eventOpenList`)은 관리자 비밀번호가 없으면 `evtListable` 인 회차만 준다 — index.ts:5291-5294, 5311-5314. **[안 옮김]** 그대로 둔다.
51. 성도님이 앱에서 내면 `(event_id, user_id)` upsert 가 소속·직분·phone·memo·answers 를 덮고 `source='app'` 으로 만든다 · `note` 는 남는다 ·
    이어 둔 import 줄도 app 줄이 된다 — index.ts:5413-5435. **[근거]** 앱 줄은 메모만 고친다.
52. 성도님 취소(`eventDrop`)는 등록 기간 안에서 자기 줄을 지운다 — index.ts:5438-5460. **[근거]** 새 쪽은 app 줄을 빼지 않는다(`app-row`) · 자격 회차의 줄도 빼지 않는다(`eligibility-event` — 서버가 막는다).
53. DB: `events` 의 status·kind·기간 CHECK — events.sql:40-51. `event_signups` 의 `unique (event_id, user_id)`(NULLS DISTINCT) · app_only · source
    CHECK — events.sql:85-101. **[옮김]** 표를 고치지 않는다.
54. DB: `event_signups.user_id` 는 `on delete cascade` — 계정을 지우면 이어 둔 줄도 사라진다 — events.sql:61. **[발견]**
55. DB: `short_title`·`list_until` 은 `events_display.sql` 이 더한 칸이다 — events_display.sql:16-31.
56. 가을 회차 SQL 을 다시 돌리면 회차 설정(제목·기간·공개 종료일·needs·copy)을 덮어쓴다(status 는 안 덮음) — event_stamp_2026.sql:54-67.
    **[바뀜]** 설계 4-3 ① 머리 경고.
57. 계정 합치기 트리거가 `event_signups` 쓰기마다 옛 계정 id 를 새 id 로 바꾸고 전역 잠금을 잡는다 · 같은 회차에 두 계정 줄이 있으면 합치기가 멈춘다 —
    member_merge.sql:18-41, 43-59, 125-130.
58. 관리 허브의 「🎉 이벤트 관리」 타일 한 줄로 들어온다 — admin.html:76. **[다음 단계]** 설계 4-4 갈아타기는 자격 인정(`eventExcuse`)이 옮겨진 뒤에 한다 — 이번에는 타일을 그대로 두고 Task 15 「남은 것」에 적는다.
59. 웹폰트를 부르지 않고 `?v=` 캐시 태그도 없다(고친 뒤 Ctrl+F5) — admin-event.html:13-17.

### 4-1. 얼리기(설계 4-3)에 걸리는 것 — 발견

@@v2 tests/event-smoke.sh 94-102 | echo "5) 관리자 액션은 비번 없이 열리지 않는다"@@

- 이 스모크는 비밀번호 없이 부른 `eventSave`·`eventSetNote` 가 `unauthorized`/`no-password-set` 이기를 기대한다. 설계 4-3 대로 액션 **맨 앞**에
  `moved-to-church-admin` 을 두면 이 두 검사가 실패한다. **정함(2026-09-29 대조 뒤)**: 얼리는 줄은 세 액션 모두 `adminError` 검사
  **바로 뒤**에 둔다 — 비밀번호 없는 요청은 지금처럼 `unauthorized`, 맞는 비밀번호로 부르면 `moved-to-church-admin`. 스모크 기대값은 그대로 둔다.
  `eventImport` 는 스모크에 없다.
- 얼린 뒤 `admin-event.html` 의 「메모」·「고치기」 단추는 `moved-to-church-admin` 을 받는다 — `admErr`(3.11)는 이 코드를 몰라 코드가 그대로 뜬다
  → 설계 4-3 의 페이지 안 띠를 같은 배포에 넣는다.
- 가을 개시 절차 문구가 있는 곳: `event_stamp_2026.sql:8-9` · 가을 설계(`docs/superpowers/specs/2026-09-23-autumn-streak-event-design.md`) §13 의 12 — 설계 4-3 ②.
- `js/api.js:122-125` 의 래퍼(1.14)는 부르는 곳이 없어 얼리기에 영향이 없다.

### 4-2. 옮길 때 정한 것 — 발견과 결정(2026-09-29 대조 뒤)

- **자격 회차 판정**: 설계는 「`needs.eligibility` 있음」이라 적었고 성경암송 서버는 `evtRule`(모양이 맞을 때만, 1.5)로 본다. 모양이 틀린
  `needs.eligibility` 가 있으면 둘이 갈린다 — 성경암송은 보통 회차로 다뤄 앱에서 자격 없이 등록되는데, 「있음」 기준이면 새 쪽은 더하기·올리기를 막는다.
  **정함**: 막는 쪽. `events-rules.ts` 에 한 함수씩만 둔다 — `isEligEvent(needs)` 는 `needs` 가 객체이고 `needs.eligibility` 가 null 아닌 객체면 true,
  `eligibilityStart(needs)` 는 `eligibility.start` 가 `YYYY-MM-DD` 꼴일 때만 그 날짜(아니면 null). `evEvents` 의 `hasEligibility`, 더하기·올리기·줄 빼기의
  `eligibility-event`, 회차 설정의 `before-eligibility` 가 모두 이 둘만 쓴다(화면과 서버가 같은 회차를 자격 회차로 본다).
- **자격 회차의 줄 빼기**: 설계 표는 `evRowDelete` 에 자격 회차를 적지 않았다. **정함**: 서버가 막는다(`eligibility-event`) — 그 회차 명단은
  「꾸준히 했다는 판정 결과」(가을 설계 §10)라 담당자가 줄을 뺄 까닭이 없고, 메모만 고친다.
- **`sort_order`(차례)**: 옛 폼에 있고 성도님 첫 화면에서 회차가 겹칠 때 차례를 정하는데(1.11 ③), 새 회차 설정 칸(설계 3절 · `EvEventOut`)에는
  없다. **정함**: 이번에는 고치지 않는다 — 새 회차는 DB 기본값 0 으로 들어가고, 고치려면 SQL 이다. 설정 화면에 없다는 것을 Task 15 「남은 것」에 적는다.
- **`cleanPosition`**: 옛 `evtImportPosition` 을 글자 그대로 옮기면 「집사 님」이 「집사 」가 된다(45). **정함**: 끝에 한 번 더 다듬는다
  (「집사 님」→「집사」 · Task 2 시험).
- **메모 길이**: 옛 `eventSetNote` 는 500자에서 말없이 잘랐다(1.7). **정함**: 서버는 붙임말(`담당자가 더함 / ` 등)을 붙인 **뒤** 500자가 넘으면
  `note-too-long` 으로 거절하고, 창의 글자 수 상한은 480 으로 둔다(붙임말 몫).
- **교인명부로 채우기(찾지 못한 것 4 의 손 작업 규칙을 보강)**: 줄에 적힌 소속(구분·교구/부서)이 교인명부 분의 소속과 다르면 **아무것도 채우지 않는다**
  (`different-affiliation`). 교구 칸이 비어 교인명부로 채우면 목장도 교인명부 값을 쓴다(적혀 있던 목장은 버리고 알림). 소속이 적혀 있고 직분만 빈 줄은
  교인명부에 동명이인이 있어도 `add`(직분은 빈 채로) — 「동명이인」 판정은 소속을 못 정한 줄에만 — Task 3·8.
- **얼리는 줄의 자리**: 4-1 — `adminError` 검사 바로 뒤.
- **CSV·인쇄**: 옛 CSV 의 메모 두 칸·인정·주·등록일과 인쇄는 옮기지 않는다(설계 3절·7절). 자격 회차의 인정·주가 필요하면 남겨 둔 옛 화면에서 내려받는다.
- **관리 허브 타일(3.14 · 동작 58)**: 이번에는 옛 주소 그대로 — 자격 인정이 교회 어드민으로 옮겨진 다음 단계에서 갈아탄다.

---

## 5. 크기

@@SIZE@@

위 숫자는 채우기 스크립트가 블록마다 센 원문 줄 수다(설명 글·표는 빼고). 새 쪽이 **옮기는** 서버 액션 넷만 세면
`eventRoster` 128 · `eventSetNote` 18 · `eventSave` 67 · `eventImport` 143 = **356줄**, 화면은 `admin-event.html` 597줄 가운데
사이 빈 줄 10을 뺀 587줄이다.

## 찾지 못한 것

1. **줄 하나를 고치는(이름·소속·직분) 액션·화면** — 없다. 지금까지 유일한 길은 `eventImport` 로 그 회차를 통째로 다시 넣는 것이었다.
2. **관리자가 줄 하나를 빼는 액션** — 없다(`eventDrop` 은 성도님 본인 `user_id` 가 있어야 한다).
3. **회차를 지우는 액션** — 없다(설계 7절도 만들지 않는다).
4. **`eventImport` 를 부르는 화면·도구** — 저장소 어디에도 없다(index.ts 밖 `git grep` 0건 · 관리 화면·`js/api.js` 에도 없음). 관리자 비밀번호로
   API 를 직접 불렀고(2026-09-10 · 09-29 Claude 손 작업), 그때 쓴 **다듬기 규칙**(「화평교구」→화평 · 「20목장」→20 · 「07」→7 · 「남성목장」→남성 ·
   「유년」→유년부 · 교구 칸 「청년」→교회학교 청년부 · 이름 끝 숫자 떼기 · 교인명부 옮겨 적기 다섯 규칙)은 **코드로 남아 있지 않다**
   (저장소 밖 임시 폴더에서 계산하고 지웠다). 설계 2절 「옮겨 적는 규칙」·3절 「명단 올리기」가 유일한 원문이다.
5. **`hasEligibility` 라는 값** — 옛 쪽에 없다. 서버는 `evtRule(ev)`(1.5)로, 화면은 `rows.some(r => r.weeksDone != null)`(admin-event.html:349, 357)로
   자격 회차를 알아챘다. 새 쪽은 서버가 `isEligEvent` 로 정해 내려 주고 화면은 그 값만 본다(4-2).
6. **동시 고침 검사(`expect`·`updated_at` 비교)** — 옛 이벤트 쪽에 한 군데도 없다. 새로 만든다.
7. **`redirect_merged_member_write` 트리거가 개발·운영 DB 의 `event_signups` 에 실제로 걸려 있는지** — SQL 파일만 봤다. Task 7(첫 쓰기 액션) 전에 개발에서
   `select tgname from pg_trigger where tgrelid = 'public.event_signups'::regclass and not tgisinternal;` 로 볼 것(읽기만 하는 질의).
8. **가을 설계 §12 의 「보정 창구」** — 그 이름의 화면·액션은 코드에 없다. 가장 가까운 것은 `eventExcuse`(1.13 자격 인정)다.
````

- [ ] **Step 6: 원문 채우기 — 스크립트로(손으로 베끼지 않는다)**

스크립트는 저장소에 두지 않는다(표준 입력으로 한 번 돌린다). 성경암송 **작업 트리가 아니라 고정 커밋**을 `git show` 로 읽으므로, 다른 세션이 그쪽 파일을 고치는 중이어도 결과가 같다.

```bash
cd /c/Projects/church-admin/.worktrees/bible-events && node --input-type=module - <<'EOF'
// 원문 채우기 — docs/port/event-roster-legacy.md 의 표식을 성경암송 고정 커밋의 글자 그대로로 바꾼다.
//   @@v2 <경로> <시작>-<끝> | <첫 줄에 들어 있어야 할 글자>@@  → 코드 블록
//   @@SIZE@@ → 원본별 줄 수 표 · @@AFTER@@ → 스냅샷 뒤에 원본을 바꾼 커밋
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const DOC = "docs/port/event-roster-legacy.md";
const V2 = "C:/Projects/bible-memorize-church-app-v2";
const SHA = "4261deaae1e366cc7c795181f67bbdf52210c128";
// 원문 주석의 예시 이름(「이름-목장」 꼴 — 「…-20 · …-3」)을 가린다(공개 저장소 규칙). 가릴 이름을 이 스크립트에 적지 않으려고
// 꼴로 찾는다: 한글 2~4자 바로 뒤에 「-숫자」. 처음 나온 차례대로 홍길동·홍길순 — 같은 이름은 같은 가명.
const NAME_MOK = /[가-힣]{2,4}(?=-\d)/g;
const FAKE = ["홍길동", "홍길순"];
const alias = new Map();
const LANG = { ts: "ts", html: "html", sql: "sql", js: "js", sh: "bash" };
const MARK = /^@@v2 (\S+) (\d+)-(\d+) \| (.+)@@$/;
const git = (...a) => execFileSync("git", ["-C", V2, ...a], { encoding: "utf8", maxBuffer: 64 << 20 });

const cache = new Map();
const src = (p) => {
  if (!cache.has(p)) cache.set(p, git("show", `${SHA}:${p}`).split(/\r?\n/));
  return cache.get(p);
};

const perFile = new Map();
let blocks = 0, masked = 0;
const out = [];
for (const line of readFileSync(DOC, "utf8").split(/\r?\n/)) {
  const m = MARK.exec(line);
  if (!m) { out.push(line); continue; }
  const [, p, a, b, anchor] = m;
  const s = Number(a), e = Number(b);
  const lines = src(p);
  if (!(s >= 1 && e >= s && e <= lines.length)) throw new Error(`${p}:${s}-${e} 가 파일(${lines.length}줄) 밖이다`);
  if (!lines[s - 1].includes(anchor)) throw new Error(`${p}:${s} 첫 줄에 「${anchor}」가 없다 — 실제: 「${lines[s - 1]}」`);
  const body = lines.slice(s - 1, e).join("\n").replace(NAME_MOK, (w) => {
    if (!alias.has(w)) {
      if (alias.size >= FAKE.length) throw new Error(`「이름-숫자」 꼴이 ${FAKE.length}개보다 많다(${p}:${s}-${e}) — 멈추고 그 줄을 본다`);
      alias.set(w, FAKE[alias.size]);
    }
    masked++;
    return alias.get(w);
  });
  const fence = body.includes("```") ? "````" : "```";
  out.push("`" + p + ":" + s + "-" + e + "`:", fence + (LANG[p.split(".").pop()] ?? ""), body, fence);
  perFile.set(p, (perFile.get(p) ?? 0) + (e - s + 1));
  blocks++;
}

const paths = [...perFile.keys()];
const total = [...perFile.values()].reduce((x, y) => x + y, 0);
const size = [
  "| 원본(성경암송 커밋 `4261dea`) | 옮긴 원문 줄 |",
  "|---|---:|",
  ...paths.map((p) => "| `" + p + "` | " + perFile.get(p) + " |"),
  "| **합계** (코드 블록 " + blocks + "개) | **" + total + "** |",
].join("\n");
// 커밋 제목은 싣지 않는다(이름이 들어 있을 수 있다) — 짧은 해시와 날짜만.
const after = git("log", "--format=%h %cs", `${SHA}..HEAD`, "--", ...paths).trim();
let text = out.join("\n")
  .replace("@@SIZE@@", size)
  .replace("@@AFTER@@", after ? after.split("\n").map((l) => "- `" + l + "`").join("\n") : "- 없음 — 스냅샷이 지금 원본과 같다");
if (/^@@v2 |@@SIZE@@|@@AFTER@@/m.test(text)) throw new Error("채우지 못한 표식이 남았다");
if (!text.endsWith("\n")) text += "\n";
writeFileSync(DOC, text);
console.log(`블록 ${blocks}개 · 원문 ${total}줄 · 예시 이름 가림 ${masked}곳(${alias.size}명)`);
for (const p of paths) console.log(`  ${p} ${perFile.get(p)}줄`);
console.log(after ? "⚠️ 스냅샷 뒤에 원본을 바꾼 커밋:\n" + after : "스냅샷 뒤에 원본을 바꾼 커밋 없음");
EOF
```

Expected(Step 4 둘째 명령이 아무것도 안 찍었을 때 — 한 글자까지 같다):
```
블록 38개 · 원문 1651줄 · 예시 이름 가림 3곳(2명)
  supabase/functions/api/index.ts 750줄
  js/api.js 12줄
  supabase/events.sql 129줄
  supabase/events_display.sql 37줄
  supabase/event_stamp_2026.sql 75줄
  supabase/member_merge.sql 47줄
  admin-event.html 587줄
  admin.html 5줄
  tests/event-smoke.sh 9줄
스냅샷 뒤에 원본을 바꾼 커밋 없음
```
`Error: … 첫 줄에 「…」가 없다` 로 멈추면 Step 5 의 그 표식 줄을 이 계획과 한 글자씩 대조해 고친다(커밋을 고정했으므로 원본 줄 번호는 움직이지 않는다 — 틀린 것은 옮겨 적은 표식이다). `Error: 「이름-숫자」 꼴이 … 많다` 로 멈추면 그 블록에 가릴 꼴이 더 있는 것이다 — 이름인지 보고 친구에게 묻는다(이름이면 `FAKE` 에 가명을 하나 더한다). 멈춘 경우 문서는 아직 안 바뀌었다(쓰기는 맨 끝에 한 번).
(이 기대값은 2026-09-29 저녁 이 계획을 고칠 때 저장소 밖 임시 폴더에서 Step 5 뼈대와 이 스크립트를 그대로 돌려 얻은 것이다.)

- [ ] **Step 7: 확인 — 표식이 다 채워졌고 원문이 글자 그대로인가**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
D=docs/port/event-roster-legacy.md
V2=/c/Projects/bible-memorize-church-app-v2
wc -l < $D
grep -c -E '^```' $D
grep -c -E '^@@' $D
grep -c -E '홍길동|홍길순' $D
grep -E '[가-힣]{2,4}-[0-9]' $D | grep -c -v '홍길'
H='`supabase/functions/api/index.ts:5790-5932`:'
diff <(awk -v h="$H" '$0==h{f=1;getline;next} f&&/^```$/{exit} f' $D) \
     <(git -C $V2 show 4261dea:supabase/functions/api/index.ts | tr -d '\r' | sed -n '5790,5932p') && echo SAME-eventImport
H='`supabase/events.sql:1-129`:'
diff <(awk -v h="$H" '$0==h{f=1;getline;next} f&&/^```$/{exit} f' $D) \
     <(git -C $V2 show 4261dea:supabase/events.sql | tr -d '\r' | sed -n '1,129p') && echo SAME-events.sql
```
Expected:
```
2190
76
0
3
0
SAME-eventImport
SAME-events.sql
```
(`2190` 은 Step 4 에서 커밋이 안 나왔을 때 — 커밋이 나왔으면 그 수만큼 는다. `76` = 코드 블록 38개 × 여닫는 줄 2. `3` = 머리 안내 한 줄 + 원문 주석 두 줄(1.10 의 `//        - 홍길동-20`, 3.9 의 `「화평 / 홍길동-20 · 홍길순-3 · …」`). 다섯째 `0` = 가리지 못한 「이름-숫자」 꼴이 없다.)

공개 저장소 검사와 배포 전 점검:
```bash
git add docs/port/event-roster-legacy.md
node tools/leak-scan.mjs
python tools/preflight.py | tail -1
git status --short
```
Expected: `명단 검사 통과 — 파일 N개`(N 은 출발점의 파일 수 + 1 — main `a2dfd7c` 에서 시작했으면 78) · `모두 통과` · `A  docs/port/event-roster-legacy.md` 한 줄뿐.
(이 PC 는 `core.autocrlf=true` 라 `git add` 가 `warning: in the working copy of 'docs/port/event-roster-legacy.md', LF will be replaced by CRLF …` 를 찍을 수 있다 — 저장소에는 LF 로 들어가니 그대로 둔다.)

- [ ] **Step 8: 커밋(푸시하지 않는다)**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
git diff --cached --stat
git commit -F - <<'EOF'
docs(옮김): 성경암송 이벤트 관리의 옛 동작 원문 — 성경필사(암송) 옮기기의 기준

admin-event.html 전부 · api 관리자 이벤트 액션 다섯(eventRoster·eventSetNote·eventExcuse·eventSave·eventImport)과 헬퍼 ·
판단 근거가 되는 성도님 액션 넷(eventOpenList·eventSignup·eventDrop·eventRosterPublic) · events.sql·events_display.sql·
event_stamp_2026.sql · member_merge.sql 발췌 · 동작 목록 59 · 얼리기에 걸리는 것 · 옮길 때 정한 것 · 찾지 못한 것.
원문은 성경암송 커밋 4261dea 에서 스크립트로 옮겼다(블록마다 첫 줄 대조 · 예시 이름 두 개만 가림).

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
git show --stat --format='%h %s' HEAD
echo "HEAD~1=$(git rev-parse --short HEAD~1)"
git branch --show-current
```
Expected: `git diff --cached --stat` 와 `git show --stat` 모두 `docs/port/event-roster-legacy.md | 2190 +` 한 파일(커밋할 때 pre-commit 훅이 `명단 검사 통과 — …` 를 찍는다). `HEAD~1=` 뒤 해시는 Step 3 에서 적어 둔 `START` 와 같다(이 가지에 커밋 하나만 더했다 — 그사이 다른 세션이 main 을 옮겼어도 상관없다). 마지막 줄은 `bible-events`(main 에 커밋하지 않았다). **푸시하지 않는다**(푸시 = 운영 화면 · 설계 5절 배포 순서 — Task 15 에서만).


## Task 2~4 공통 — 순수 모듈 셋

- 작업 폴더: `C:\Projects\church-admin\.worktrees\bible-events`(Task 1 이 만든 워크트리 · 가지 `bible-events` · 기준점 church-admin main `a2dfd7c`).
  아래 명령은 모두 `cd /c/Projects/church-admin/.worktrees/bible-events &&` 로 시작한다(Bash 는 부를 때마다 처음 폴더로 돌아간다).
- **줄 번호로 고치지 않는다**(다른 세션이 main 을 계속 고친다 · CONTRACT §5). 있는 파일(`people-match.ts`·`tests/people-match.test.mjs`)은
  **앵커 글**로 찾고, 앵커가 한 번만 나오는지 과제마다 Step 0 의 `grep -c` 로 먼저 본다. `1` 이 아니면 멈추고 그 자리를 글로 다시 찾는다.
- **있는 import 줄을 다시 쓰지 않는다.** 시험 파일에 이름이 더 필요하면 파일 끝에 붙이는 묶음의 **머리에 새 import 문**을 둔다 —
  ES 모듈의 import 는 파일 어디에 있어도 맨 먼저 읽힌다(끌어올려진다). 같은 모듈에서 두 번째 import 문도 된다(이름만 겹치지 않게 — 같은 이름을 두 번 들여오면 SyntaxError).
- 이 세 모듈은 **아직 `index.ts` 에 잇지 않는다.** 그래서 Task 2~4 에는 개발 함수 배포·서버 시험이 없다(배포는 Task 5 부터).
  시험은 preflight 가 배포 전에 돌리는 순수 시험(`tests/*.test.mjs`)뿐이다.
- 순수 모듈 제약: 원격 import·enum·namespace·parameter property 금지. 다른 순수 모듈은 확장자까지 적어 들여온다
  (`people-query.ts` 가 `import { MATCH_GU } from "./people-match.ts"` 하는 것과 같다).
- 시험 값은 가짜만(홍길동·김철수·도하늘·박하나·최바다·오한결·윤바다 …). 시험의 user_id 는 `user-a` 같은 글자로 둔다(UUID 꼴을 쓰지 않는다).
- 이 계획은 실제로 돌려 보았다(2026-09-29): main `a2dfd7c` 사본에 세 모듈 + `people-match.ts` 를 놓고 **아래 단계를 차례대로** 밟아
  단계마다 적힌 실패·통과가 그대로 나왔고(끝에 넷 합쳐 시험 70개 · 전체 순수 시험 201개 통과), `tsc --strict --noEmit` 오류 0.
  같은 날 대조 뒤 고친 옆 초안의 순수 부분 — Task 6 이 `events-rules.ts` 끝에 더하는 도움 함수 다섯과 그 시험, Task 7 `events-rows.ts`,
  Task 8 `events-upload.ts` 와 그 시험 — 을 이 모듈 위에 얹어도 모두 통과하고(시험 98개), Task 5·6·8 의 선행 확인 스크립트도 통과한다.

**이 과제들이 만드는 이름 — 계약 밖이거나 계약 §5 로 새로 정해진 것**(모두 시험이 직접 부른다):

| 모듈 | 이름 | 까닭 · 쓰는 곳 |
|---|---|---|
| `events-rules.ts` | `isEligEvent(needs)` · `eligibilityStart(needs)` | **CONTRACT §5 「자격 회차 판정은 한 함수」 — 이 과제(Task 2)가 만든다.** Task 5 `evOut.hasEligibility`·Task 6 `before-eligibility`·Task 7·8 `eligibility-event` 가 이 둘만 부른다(따로 만들지 않는다) |
| `events-rules.ts` | `isDay(s)`(꼴 + 달력에 있는 날) · `tidyRow(r)`(구분이 정해진 줄 다듬기) | `checkEvent`·`eligibilityStart`·`tidyRaw` 안 · Task 7 `events-rows.ts` 가 `tidyRow` 를 들여 쓴다 |
| `events-people.ts` | `FillReason` 에 `"different-affiliation"` | CONTRACT §5 「빈칸 채우기 보강」 |
| `events-stats.ts` | `personKey(r)`(다듬은 신원) · `affLabel(r)`(소속 한 줄) | `personGroups`·`statsOf` 안. `affLabel` 은 Task 5 `evWho` 와 **글자까지 같다**(시험이 `evWho` 사본과 맞대 본다) |

**다른 과제가 만드는 이름 — 여기서 만들지 않는다**(같은 이름을 두 번 export 하면 SyntaxError):
- `EV_EDIT_KEYS`·`EV_CREATE_KEYS`·`pickEventPatch`·`eventFields`·`eventDiff` 는 **Task 6** 이 `events-rules.ts` 끝에 더한다.
  `mergeEventPatch` 가 보는 칸 목록은 모듈 안 상수 `EVT_EDITABLE`(내보내지 않음)이고, Task 6 `EV_EDIT_KEYS` 와 **같은 여덟 칸**이어야 한다(Task 6 시험이 맞대 본다).
- 옛 초안의 `eligibilityStartOf`(Task 6)·`evElig`(Task 5)·`events-rows.ts isEligEvent(ev)`(Task 7)는 **없다** — 위 두 함수로 바뀌었다(CONTRACT §5).

**판정 약속**(뒤 과제가 이 모양에 기댄다):
- `tidyRaw` 는 네 칸이 다 비었을 때만 `row: null`(error `no-name`)이다. 그 밖에는 **틀린 줄도 다듬은 row 를 돌려준다**(화면이 무엇이 틀렸는지 보여 줄 수 있게).
- 소속이 빈 줄은 구분과 상관없이 **`no-group`** 이다. Task 8 은 `error === "no-group"` 을 「빈칸(blank)」, 다른 코드를 「모양 틀림(bad)」으로 센다.
  교구 칸이 빈 줄의 구분 「교구」는 기본값일 뿐이다(Task 8 이 빈칸 줄의 구분을 `""` 로 비워 `fillDecision` 에 넘긴다 — `fillDecision` 은 `""` 를 빈칸으로 본다).
- `checkRow` 의 교구 목장은 `""`·`"남성"`·앞자리 0 없는 1~3자리 숫자만 받는다(「07」·「20목장」은 `bad-sub` — 다듬은 **뒤의** 줄을 받는다).
- `checkNote` 는 **붙임말을 붙인 뒤의** 메모를 본다(서버가 `담당자가 더함 / …` 을 붙인 다음 부른다 · 500자). 창(Task 10)의 글자 수 상한은 480.
- `isEligEvent(needs)` 는 `needs.eligibility` 가 null 아닌 객체면 true — 모양은 따지지 않는다(막는 쪽으로). `eligibilityStart(needs)` 는 자격 회차이고
  `eligibility.start` 가 달력에 있는 `YYYY-MM-DD` 일 때만 그 날, 아니면 null(그러면 `checkEvent` 가 `before-eligibility` 를 건너뛴다).
- `candidateKeys` 는 한 자리 목장에 「0N」·「0N목장」을, 이름에 NFD 꼴을 더 만든다(계약의 세 꼴 × 두 꼴보다 넓다 — 까닭은 함수 주석).
  Task 7 `sameKeys` 는 이것과 같은 값을 돌려준다(Task 7 시험이 맞대 본다).
- 목장 숫자는 `Number()` 로 바꾸지 않고 앞의 0 만 뗀다(긴 숫자 반올림 방지 — Task 7 과 같은 규칙).
- 이름 끝 숫자는 **숫자 바로 앞이 한글일 때만** 뗀다. 서버 시험 이름은 `ca-test-업로드-1` 처럼 한글 뒤에 숫자를 바로 붙이지 않는다.
- `fillDecision` 은 계약 모양 그대로 `{ patch, reason }` 이다(CONTRACT §5 보강판):
  - 명부 전체에서 한 분일 때만 채운다. `same-name` 은 소속이 적힌 줄에도 나온다 — 그 줄을 `add` 로 넣을지는 Task 8 이 정한다(「same-name 은 소속을 못 정한 줄에만」).
  - 소속이 **빈** 줄: `patch` 에 `who_type`·`group_name`·`sub_name` 이 **한 벌로 늘** 들어 있다(`sub_name` 은 명부 목장 · 없으면 `""` · 적혀 있던 목장은 버린다).
    「적힌 목장 N 대신 교인명부 목장」 알림은 Task 8 이 `row.sub_name` 과 `patch.sub_name` 을 견주어 적는다.
  - 소속이 **적힌** 줄: 명부 소속(구분·교구/부서)과 같을 때만 빈 목장·빈 직분을 채운다. 다르면 `different-affiliation`, 명부가 소속을 못 정하면 `no-affiliation` — 둘 다 `patch: null`.
- `statsOf` 는 `people-query.ts` 의 `statsOf` 와 이름이 같다 — `import { statsOf as eventStatsOf } from "./events-stats.ts"` 로만 들여온다(CONTRACT §5).
- `repeaters` 한 줄 = `{ n, name, label, times, events }`. `label` 은 **소속만**(`affLabel` = Task 5 `evWho` 와 같은 글자 — 「화평 20목장」·「소망 남성」·「중등부」·「(소속 없음)」).
  화면은 「이름 · 소속」, CSV 는 「이름」「소속」 두 칸. `evHistory` 의 `groups[].label` 은 `` `${이름} · ${evWho(줄)}` `` 라 같은 분이면 같은 글자가 된다.
- `repeaters[].n` 은 **1부터**(personGroups 순번 + 1) — Task 5 `evHistory` 의 `groups[].n`(`g + 1`)과 같은 셈법. `repeaters[].events` 는 회차 **id** 들(기간 차례).
- `perEvent`·`byGroup` 은 **줄 수**(사람 수가 아니다). 사람 단위는 `repeaters` 뿐이다.

---

### Task 2: `events-rules.ts` — 회차 검사·공개 판정·자격 회차 판정·줄 다듬기·판정표·신원 키

**Files:**
- Create: `supabase/functions/church-admin/events-rules.ts`
- Test: `tests/events-rules.test.mjs` (새 파일)

**Interfaces:**
- Consumes: `paper.ts` `legacyNorm(s: unknown): string` · `appIdentityKey(u: any): string`(있는 것) · (시험만) `people-match.ts` `MATCH_GU`
- Produces (계약 §1 그대로): `EVT_ID_RE` · `EVT_STATUS` · `BE_GU` · `BE_MAX_UPLOAD` · `BE_NOTE_MAX` · `BE_FIELD_MAX` · `BE_NEEDS_DEFAULT` · `BE_BAD_CHARS` ·
  `type EvRow` · `type EvEvent` · `type RawCells` ·
  `kstToday(now?: Date): string` · `evtListable(ev, today): boolean` · `checkEvent(ev: EvEvent, eligibilityStart: string | null): string | null` ·
  `mergeEventPatch(cur: EvEvent, patch: Record<string, unknown>): EvEvent` · `cleanPosition(v: unknown): string` ·
  `tidyRaw(raw: RawCells): { row: EvRow | null; notes: string[]; error: string | null }` · `checkRow(row: EvRow): string | null` ·
  `checkNote(note): string | null` · `identKey(row: EvRow): string` · `candidateKeys(row: EvRow): string[]`
- Produces (계약 §5): `isEligEvent(needs: unknown): boolean` · `eligibilityStart(needs: unknown): string | null`
- Produces (더함): `isDay(s: unknown): boolean` · `tidyRow(r): EvRow`
- 뒤에 이 파일을 고치는 과제: Task 6 이 끝에 `EV_EDIT_KEYS`·`EV_CREATE_KEYS`·`pickEventPatch`·`eventFields`·`eventDiff` 를 더한다
  (그래서 이 과제는 그 이름을 쓰지 않는다).

세 번에 나눠 만든다 — ① 회차(상수·날짜·공개·자격 회차·검사·보낸 칸만 얹기) ② 줄(다듬기·판정표) ③ 신원 키. 매번 시험을 먼저 쓴다.

- [ ] **Step 0: 선행 확인 — 기준점 · 들여올 이름 · 아직 없는 파일**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
git merge-base --is-ancestor a2dfd7c HEAD && echo "기준점 a2dfd7c 이후"
grep -cE '^export const (legacyNorm|appIdentityKey) = ' supabase/functions/church-admin/paper.ts
grep -cE '^export const MATCH_GU = ' supabase/functions/church-admin/people-match.ts
ls supabase/functions/church-admin/events-rules.ts tests/events-rules.test.mjs 2>&1 | grep -c "No such file"
```

기대: `기준점 a2dfd7c 이후` · `2` · `1` · `2`(두 파일 모두 아직 없다). 하나라도 다르면 **멈춘다** — `paper.ts`·`people-match.ts` 의 이름이 바뀌었으면 그 이름을 글로 찾아 아래 import 를 맞추고,
파일이 이미 있으면 이 과제가 반쯤 들어간 것이다(`git log --oneline` 으로 어디까지 커밋됐는지 보고 이어서 한다).

- [ ] **Step 1: 시험 ① — 회차 쪽 시험 파일을 만든다**

`tests/events-rules.test.mjs` 를 새로 만든다:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EVT_ID_RE, EVT_STATUS, BE_GU, BE_MAX_UPLOAD, BE_NOTE_MAX, BE_FIELD_MAX, BE_NEEDS_DEFAULT, BE_BAD_CHARS,
  kstToday, evtListable, isDay, isEligEvent, eligibilityStart, checkEvent, mergeEventPatch,
} from "../supabase/functions/church-admin/events-rules.ts";
import { MATCH_GU } from "../supabase/functions/church-admin/people-match.ts";

// 시험용 회차 — 다 맞는 모양. 칸 하나씩 틀려 본다.
const EV = (o = {}) => ({
  id: "ca-test-ev", title: "2026 사순절 필사", short_title: "사순절", subtitle: "", season: "2026-1Q",
  opens_on: "2026-02-18", closes_on: "2026-04-04", status: "draft", list_until: null, ...o,
});

test("상수 — 성경암송 api 와 같은 값", () => {
  assert.deepEqual(EVT_STATUS, ["draft", "open", "closed", "archived"]);
  assert.deepEqual(BE_GU, MATCH_GU);                      // 교구 차례가 교적 맞대기와 같다
  assert.deepEqual(BE_GU, ["믿음", "소망", "사랑", "섬김", "은혜", "화평", "기쁨", "새가족"]);
  assert.equal(BE_MAX_UPLOAD, 600);
  assert.equal(BE_NOTE_MAX, 500);
  assert.equal(BE_FIELD_MAX, 40);
  assert.deepEqual(BE_NEEDS_DEFAULT, { position: true, phone: false, memo: false, extra: [] });
  for (const c of ['"', "\\", ",", "(", ")", "|"]) assert.ok(BE_BAD_CHARS.test("홍" + c), c);
  assert.ok(!BE_BAD_CHARS.test("홍길동-2"));
});

test("EVT_ID_RE — 소문자·숫자·- 만, 두 글자 이상, 첫 글자는 - 가 아님", () => {
  for (const ok of ["summer-2026", "lent-booklet-2025", "ca-test-1727590000000", "a1"]) assert.ok(EVT_ID_RE.test(ok), ok);
  for (const bad of ["Summer-2026", "-lent", "a", "가을-2026", "lent_2026", "lent 2026", "a".repeat(42), ""]) {
    assert.ok(!EVT_ID_RE.test(bad), bad);
  }
  assert.ok(EVT_ID_RE.test("a".repeat(41)));              // 첫 글자 + 40자까지
});

test("kstToday — 한국 자정에 날이 바뀐다", () => {
  assert.equal(kstToday(new Date("2026-09-29T14:59:59Z")), "2026-09-29");
  assert.equal(kstToday(new Date("2026-09-29T15:00:00Z")), "2026-09-30");
  assert.match(kstToday(), /^\d{4}-\d{2}-\d{2}$/);
});

test("evtListable — 성경암송 evtListable 그대로(draft·archived 안 보임 · list_until 까지)", () => {
  const T = "2026-09-29";
  assert.equal(evtListable({ status: "draft", list_until: null }, T), false);
  assert.equal(evtListable({ status: "archived", list_until: null }, T), false);
  assert.equal(evtListable({ status: "open", list_until: null }, T), true);
  assert.equal(evtListable({ status: "closed", list_until: null }, T), true);    // 마감해도 명단은 보인다
  assert.equal(evtListable({ status: "closed", list_until: "" }, T), true);      // 빈칸 = 기한 없음
  assert.equal(evtListable({ status: "closed", list_until: "2026-09-29" }, T), true);   // 그날까지는 보인다
  assert.equal(evtListable({ status: "closed", list_until: "2026-09-28" }, T), false);
  assert.equal(evtListable({ status: "open", list_until: "2026-12-31" }, T), true);
});

test("isDay — 꼴과 달력을 함께 본다", () => {
  assert.equal(isDay("2026-10-11"), true);
  assert.equal(isDay("2028-02-29"), true);                // 윤년
  assert.equal(isDay("2026-02-29"), false);
  assert.equal(isDay("2026-02-30"), false);
  assert.equal(isDay("2026-13-01"), false);
  assert.equal(isDay("2026-1-5"), false);
  assert.equal(isDay("2026/10/11"), false);
  assert.equal(isDay(""), false);
  assert.equal(isDay(null), false);
});

test("isEligEvent — needs.eligibility 가 null 아닌 객체면 자격 회차(모양이 틀려도 막는 쪽으로)", () => {
  assert.equal(isEligEvent({ position: true, eligibility: { start: "2026-10-11", weeks: 6, perWeek: 3, need: 3, minNeed: 2 } }), true);
  assert.equal(isEligEvent({ eligibility: {} }), true);          // 모양이 틀려도 자격 회차로 본다
  assert.equal(isEligEvent({ eligibility: [] }), true);
  assert.equal(isEligEvent({ eligibility: "2026-10-11" }), false);
  assert.equal(isEligEvent({ eligibility: true }), false);
  assert.equal(isEligEvent({ eligibility: null }), false);
  assert.equal(isEligEvent(BE_NEEDS_DEFAULT), false);            // 새 회차의 needs
  assert.equal(isEligEvent({}), false);
  assert.equal(isEligEvent(null), false);
  assert.equal(isEligEvent(undefined), false);
  assert.equal(isEligEvent("eligibility"), false);
});

test("eligibilityStart — 자격 회차이고 start 가 달력에 있는 YYYY-MM-DD 일 때만", () => {
  assert.equal(eligibilityStart({ eligibility: { start: "2026-10-11", weeks: 6, perWeek: 3, need: 3 } }), "2026-10-11");
  assert.equal(eligibilityStart({ position: true, eligibility: { start: " 2026-10-11 " } }), "2026-10-11");
  for (const s of ["2026-02-30", "10/11", "2026-1-5", "", null]) {
    assert.equal(eligibilityStart({ eligibility: { start: s } }), null, String(s));
  }
  assert.equal(eligibilityStart({ eligibility: { start: 20261011 } }), null);
  assert.equal(eligibilityStart({ eligibility: {} }), null);      // 자격 회차이지만 시작일을 모른다 → 검사하지 않는다
  assert.equal(eligibilityStart({ eligibility: "2026-10-11" }), null);
  assert.equal(eligibilityStart(BE_NEEDS_DEFAULT), null);
  assert.equal(eligibilityStart(null), null);
  // checkEvent 의 둘째 인자로 그대로 넘긴다
  const needs = { position: true, eligibility: { start: "2026-10-11" } };
  assert.equal(checkEvent(EV({ opens_on: "2026-10-10", closes_on: "2026-11-28" }), eligibilityStart(needs)), "before-eligibility");
  assert.equal(checkEvent(EV({ opens_on: "2026-10-10", closes_on: "2026-11-28" }), eligibilityStart(BE_NEEDS_DEFAULT)), null);
});

test("checkEvent — 다 맞으면 null", () => {
  assert.equal(checkEvent(EV(), null), null);
  assert.equal(checkEvent(EV({ opens_on: "2026-04-04" }), null), null);          // 하루짜리 회차
  assert.equal(checkEvent(EV({ list_until: "2026-04-04" }), null), null);        // 마감일과 같은 날까지 공개
  assert.equal(checkEvent(EV({ list_until: "" }), null), null);
  for (const s of ["draft", "open", "closed", "archived"]) assert.equal(checkEvent(EV({ status: s }), null), null);
});

test("checkEvent — 칸마다 코드", () => {
  assert.equal(checkEvent(EV({ title: "   " }), null), "no-title");
  assert.equal(checkEvent(EV({ opens_on: "2026-13-01" }), null), "bad-period");
  assert.equal(checkEvent(EV({ closes_on: "2026-02-30" }), null), "bad-period");
  assert.equal(checkEvent(EV({ opens_on: "20260218" }), null), "bad-period");
  assert.equal(checkEvent(EV({ opens_on: "2026-04-05" }), null), "period-reversed");
  assert.equal(checkEvent(EV({ status: "public" }), null), "bad-status");
  assert.equal(checkEvent(EV({ status: "" }), null), "bad-status");
  assert.equal(checkEvent(EV({ list_until: "2026/12/31" }), null), "bad-list-until");
  assert.equal(checkEvent(EV({ list_until: "2026-04-03" }), null), "list-until-before-close");
  assert.equal(checkEvent(EV({ opens_on: "2026-10-10", closes_on: "2026-11-28" }), "2026-10-11"), "before-eligibility");
  assert.equal(checkEvent(EV({ opens_on: "2026-10-27", closes_on: "2026-11-28" }), "2026-10-11"), null);
  assert.equal(checkEvent(EV({ opens_on: "2026-10-11", closes_on: "2026-11-28" }), "2026-10-11"), null);
});

test("checkEvent — 여러 칸이 틀리면 정해 둔 차례의 첫 코드", () => {
  const all = EV({ title: "", opens_on: "x", status: "x", list_until: "x" });
  assert.equal(checkEvent(all, "2099-01-01"), "no-title");
  assert.equal(checkEvent({ ...all, title: "t" }, "2099-01-01"), "bad-period");
  assert.equal(checkEvent(EV({ opens_on: "2026-05-01", status: "x" }), null), "period-reversed");
  assert.equal(checkEvent(EV({ status: "x", list_until: "x" }), null), "bad-status");
  assert.equal(checkEvent(EV({ list_until: "x" }), "2099-01-01"), "bad-list-until");
  assert.equal(checkEvent(EV({ list_until: "2026-01-01" }), "2099-01-01"), "list-until-before-close");
});

test("mergeEventPatch — 보낸 칸만 · 다듬기 · list_until 빈칸은 null · 원본은 그대로", () => {
  const cur = EV({ list_until: "2026-04-30", subtitle: "옛 부제" });
  const out = mergeEventPatch(cur, { title: "  2026  사순절 필사 ", list_until: "" });
  assert.equal(out.title, "2026 사순절 필사");
  assert.equal(out.list_until, null);
  assert.equal(out.subtitle, "옛 부제");                  // 안 보낸 칸은 그대로
  assert.equal(out.status, "draft");
  assert.equal(cur.list_until, "2026-04-30");             // 원본을 바꾸지 않는다
  assert.equal(cur.title, "2026 사순절 필사");
  assert.equal(mergeEventPatch(cur, { list_until: " 2026-05-01 " }).list_until, "2026-05-01");
  assert.equal(mergeEventPatch(cur, { list_until: null }).list_until, null);
  assert.equal(mergeEventPatch(cur, { subtitle: "" }).subtitle, "");          // 비우고 싶으면 빈 글자를 보낸다
  assert.equal(mergeEventPatch(cur, { status: "open" }).status, "open");
});

test("mergeEventPatch — needs·copy·kind·id·sort_order 는 받지 않는다", () => {
  const cur = EV();
  const out = mergeEventPatch(cur, { id: "other-id", needs: { eligibility: {} }, copy: { a: 1 }, kind: "quiz", sort_order: 9 });
  assert.deepEqual(out, cur);
  assert.deepEqual(mergeEventPatch(cur, null), cur);
  assert.deepEqual(mergeEventPatch(cur, ["title"]), cur);
});
```

- [ ] **Step 2: 돌려서 실패를 본다**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events && node --experimental-strip-types --test tests/events-rules.test.mjs
```

기대: FAIL — `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '…\supabase\functions\church-admin\events-rules.ts'`, 끝에 `# tests 1` · `# fail 1`.

- [ ] **Step 3: 모듈 ① — 회차 쪽을 만든다**

`supabase/functions/church-admin/events-rules.ts` 를 새로 만든다(`appIdentityKey` 는 ③에서 쓴다 — 지금 들여와 둔다):

```ts
// 성경필사(암송) — 회차 검사 · 공개 판정 · 자격 회차 판정 · 명단 줄 다듬기 · 줄 모양 판정표 · 신원 키(순수 함수 · 2026-09-29)
//   설계: 성경암송 저장소 docs/superpowers/specs/2026-09-29-church-admin-bible-events-design.md §1·§2·§3
//   옛 동작 원문: docs/port/event-roster-legacy.md — 성경암송 api/index.ts 의 EVT_ID_RE·EVT_STATUS·
//   evtListable·evtRule(첫 잣대)·evtImportPosition·identityKey·eventSave 검사를 옮겼다.
//   서버(Deno, index.ts)와 시험(Node, tests/events-rules.test.mjs)이 **같은 파일**을 읽는다 —
//   authz.ts 와 같은 제약(원격 import·enum·namespace·parameter property 금지).
//
// ⚠️ 신원 키(ident_key)는 paper.ts 의 appIdentityKey 로만 만든다 — **완성형(NFC)으로 바꾸지 않는다.**
//    authz.ts 의 identityKey(NFC)를 쓰면 맥에서 가입한 분(자모분리 이름)의 앱 계정과 영영 안 맞는다.
import { appIdentityKey, legacyNorm } from "./paper.ts";

// 회차 id — 성도님 앱 주소(?ev=)에 그대로 쓰인다. 성경암송 api EVT_ID_RE 와 글자 그대로 같다.
export const EVT_ID_RE = /^[a-z0-9][a-z0-9-]{1,40}$/;
export const EVT_STATUS = ["draft", "open", "closed", "archived"];
// 성경암송 앱 GU_LIST 와 같은 차례(people-match.ts MATCH_GU 와도 같다 — 시험이 둘을 맞대 본다)
export const BE_GU = ["믿음", "소망", "사랑", "섬김", "은혜", "화평", "기쁨", "새가족"];
export const BE_MAX_UPLOAD = 600;   // 올리기 한 번 상한(회차당 최대가 515줄)
export const BE_NOTE_MAX = 500;     // 담당자 메모(note) — 성경암송 eventSetNote 의 slice(500) 와 같은 길이
export const BE_FIELD_MAX = 40;     // 이름·소속·세부·직분 한 칸(authz.parseIdentity 의 40자와 같다)
// 새 회차의 needs — 앱 등록 폼에 직분 칸이 생기게. 서버는 이것을 **복사해서** 넣는다(설계 §2 evEventCreate).
export const BE_NEEDS_DEFAULT = { position: true, phone: false, memo: false, extra: [] as unknown[] };
// 이름·소속에 받지 않는 글자 — 「|」는 신원 키 구분자, 나머지는 postgrest .in() 이 이스케이프하지 않는다.
export const BE_BAD_CHARS = /["\\,()|]/;

export type EvRow = { who_type: "교구" | "교회학교"; group_name: string; sub_name: string; name: string; position: string };
export type EvEvent = { id: string; title: string; short_title: string; subtitle: string; season: string;
  opens_on: string; closes_on: string; status: string; list_until: string | null };
export type RawCells = { name: string; gu: string; mok: string; pos: string };

// 한국 날짜(YYYY-MM-DD). new Date().toISOString() 은 UTC 라 자정~오전 9시에 하루가 어긋난다.
export function kstToday(now?: Date): string {
  const t = (now ?? new Date()).getTime();
  return new Date(t + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

// 지금 성도님께 **보이는** 회차인가 — 성경암송 api evtListable 을 글자 그대로.
// ⚠️ 「등록을 받는가」와 다른 물음이다. 마감(closed)해도 명단은 보이고, list_until 이 있으면 그날까지만.
export function evtListable(ev: { status: string; list_until: string | null }, today: string): boolean {
  if (ev.status !== "open" && ev.status !== "closed") return false;
  const until = legacyNorm(ev.list_until);
  return !until || today <= until;
}

// 「2026-10-11」 꼴이면서 달력에 있는 날(2026-02-30 은 아니다). DB 의 date 칸이 500 을 내지 않게 여기서 거른다.
export function isDay(s: unknown): boolean {
  const t = String(s ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return false;
  const d = new Date(t + "T00:00:00Z");
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === t;
}

// ── 자격 회차(가을 말씀 동행처럼 needs.eligibility 가 있는 회차) — **이 두 함수만** 쓴다(CONTRACT §5) ──
// hasEligibility(evOut · Task 5) · before-eligibility(evEventSave · Task 6) · eligibility-event(Task 7·8)가
// 모두 이 둘을 부른다. 서버·화면이 「자격 회차인가」를 세 가지로 다르게 판정하던 것을 한 곳으로 모았다.
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

// needs 가 객체이고 needs.eligibility 가 null 아닌 객체면 자격 회차다.
// ⚠️ 모양(start·weeks·perWeek·need)은 따지지 않는다 — 성경암송 evtRule 은 모양이 틀리면 「자격 회차 아님」으로 보지만,
//    여기서는 **막는 쪽으로** 틀린다(더하기·올리기·빼기를 막고 메모만 고치게 둔다).
export function isEligEvent(needs: unknown): boolean {
  return isObj(needs) && isObj(needs.eligibility);
}

// 자격 회차의 측정 시작일 — needs.eligibility.start 가 달력에 있는 YYYY-MM-DD 일 때만, 아니면 null.
// checkEvent 의 둘째 인자로 그대로 넘긴다(before-eligibility).
export function eligibilityStart(needs: unknown): string | null {
  if (!isEligEvent(needs)) return null;
  const s = legacyNorm((needs as { eligibility: Record<string, unknown> }).eligibility.start);
  return isDay(s) ? s : null;
}

// 회차 설정 검사 — 만들기(evEventCreate)·저장(evEventSave)이 **같은 함수**를 쓴다(DB CHECK 에 걸려 500 이 나지 않게).
// eligibilityStart = 자격 회차의 측정 시작일(위 eligibilityStart(ev.needs)) · 자격 회차가 아니면 null.
// 오류 코드 차례: no-title · bad-period · period-reversed · bad-status · bad-list-until · list-until-before-close · before-eligibility
export function checkEvent(ev: EvEvent, eligibilityStart: string | null): string | null {
  if (!legacyNorm(ev.title)) return "no-title";
  const opens = legacyNorm(ev.opens_on), closes = legacyNorm(ev.closes_on);
  if (!isDay(opens) || !isDay(closes)) return "bad-period";
  if (closes < opens) return "period-reversed";
  if (!EVT_STATUS.includes(legacyNorm(ev.status))) return "bad-status";
  const until = legacyNorm(ev.list_until);
  if (until) {
    if (!isDay(until)) return "bad-list-until";
    if (until < closes) return "list-until-before-close";   // 마감 전에 명단이 사라지면 앞뒤가 안 맞는다
  }
  if (eligibilityStart && opens < eligibilityStart) return "before-eligibility";
  return null;
}

// 회차 설정에서 담당자가 바꿀 수 있는 칸 — needs·copy·kind·sort_order·id 는 **받지 않는다**
// (자격 규칙·문구가 조용히 지워지지 않게 · 성경암송 eventSave 가 겪은 「화면에 없는 칸이 기본값으로」 사고).
// ⚠️ Task 6 이 이 파일 끝에 더하는 EV_EDIT_KEYS 와 **같은 여덟 칸**이어야 한다(Task 6 시험이 맞대 본다).
const EVT_EDITABLE = ["title", "short_title", "subtitle", "season", "opens_on", "closes_on", "status", "list_until"];

// **보낸 칸만** 바꾼다(hasOwnProperty) · 글자는 앞뒤 빈칸을 떼고 가운데 빈칸을 하나로 · list_until 빈칸 = null(기한 없음).
export function mergeEventPatch(cur: EvEvent, patch: Record<string, unknown>): EvEvent {
  const out: EvEvent = { ...cur };
  const p = patch && typeof patch === "object" && !Array.isArray(patch) ? patch : {};
  for (const k of EVT_EDITABLE) {
    if (!Object.prototype.hasOwnProperty.call(p, k)) continue;
    const v = legacyNorm(p[k]);
    if (k === "list_until") out.list_until = v || null;
    else (out as Record<string, unknown>)[k] = v;
  }
  return out;
}
```

- [ ] **Step 4: 돌려서 통과를 본다**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events && node --experimental-strip-types --test tests/events-rules.test.mjs
```

기대: PASS — `# tests 12` · `# pass 12` · `# fail 0`.

- [ ] **Step 5: 시험 ② — 줄 다듬기·판정표 시험을 파일 끝에 붙인다**

맨 위 import 블록은 **고치지 않는다.** 아래 묶음을 `tests/events-rules.test.mjs` **끝에** 그대로 붙인다(앞에 빈 줄 하나) — 묶음 머리의 import 문이 새 이름 다섯을 들여온다:

```js
// ── 줄 다듬기 · 판정표 ──────────────────────────────────────────────
// import 는 모듈 맨 위로 끌어올려진다 — 맨 위 import 블록을 고치지 않고 이 묶음이 쓰는 이름만 새 문으로 들여온다.
import { cleanPosition, tidyRow, checkRow, checkNote, tidyRaw } from "../supabase/functions/church-admin/events-rules.ts";

const R = (o = {}) => ({ who_type: "교구", group_name: "화평", sub_name: "20", name: "홍길동", position: "집사", ...o });
const raw = (name, gu, mok, pos = "") => ({ name, gu, mok, pos });

test("cleanPosition — 괄호 속·끝 「님」을 떼고 다듬는다(목록 밖 직분은 그대로)", () => {
  assert.equal(cleanPosition("집사님"), "집사");
  assert.equal(cleanPosition("안수집사님 (시무/은퇴)"), "안수집사");
  assert.equal(cleanPosition("(은퇴)장로님"), "장로");
  assert.equal(cleanPosition("  권사  "), "권사");
  assert.equal(cleanPosition("집사 님"), "집사");               // 원문은 「집사 」가 됐다 — 끝 빈칸까지 뗀다
  assert.equal(cleanPosition("명예권사"), "명예권사");
  assert.equal(cleanPosition("청년"), "청년");                  // 직분 칸에는 「부」를 붙이지 않는다
  assert.equal(cleanPosition("님"), "");
  assert.equal(cleanPosition(null), "");
});

test("tidyRow — 교구: 「화평교구」·「20목장」·「07」·「남성목장」 / 교회학교: 부서 줄임말", () => {
  assert.deepEqual(tidyRow({ who_type: "교구", group_name: " 화평교구 ", sub_name: "20목장", name: " 홍  길동 ", position: "집사님" }),
    { who_type: "교구", group_name: "화평", sub_name: "20", name: "홍 길동", position: "집사" });
  assert.equal(tidyRow(R({ sub_name: "07" })).sub_name, "7");
  assert.equal(tidyRow(R({ sub_name: "007목장" })).sub_name, "7");
  assert.equal(tidyRow(R({ sub_name: "남성목장" })).sub_name, "남성");
  assert.equal(tidyRow(R({ sub_name: "남성 목장" })).sub_name, "남성");
  assert.equal(tidyRow(R({ sub_name: "0" })).sub_name, "0");
  assert.equal(tidyRow(R({ sub_name: "00" })).sub_name, "0");
  assert.equal(tidyRow(R({ sub_name: "0012345678901234567890" })).sub_name, "12345678901234567890");   // 반올림하지 않는다
  assert.equal(tidyRow(R({ sub_name: "20-1" })).sub_name, "20-1");          // 모르는 꼴은 그대로(checkRow 가 잡는다)
  assert.equal(tidyRow(R({ who_type: "교회학교", group_name: "유년", sub_name: "" })).group_name, "유년부");
  assert.equal(tidyRow(R({ who_type: "교회학교", group_name: "중등부", sub_name: "1학년" })).sub_name, "1학년");
  assert.equal(tidyRow(R({ group_name: "화평".normalize("NFD") })).group_name, "화평");   // 소속은 완성형으로
  const nfd = "홍길동".normalize("NFD");
  assert.equal(tidyRow(R({ name: nfd })).name, nfd);                      // 이름은 NFC 로 바꾸지 않는다
});

test("checkRow — 판정표(다 맞으면 null)", () => {
  assert.equal(checkRow(R()), null);
  for (const g of ["믿음", "소망", "사랑", "섬김", "은혜", "화평", "기쁨", "새가족"]) assert.equal(checkRow(R({ group_name: g })), null, g);
  for (const s of ["", "남성", "0", "7", "20", "99", "100"]) assert.equal(checkRow(R({ sub_name: s })), null, s);
  assert.equal(checkRow(R({ who_type: "교회학교", group_name: "중등부", sub_name: "" })), null);
  assert.equal(checkRow(R({ who_type: "교회학교", group_name: "청년부", sub_name: "1학년" })), null);
  assert.equal(checkRow(R({ position: "" })), null);
  assert.equal(checkRow(R({ position: "은퇴안수집사" })), null);        // 앱 목록 밖 직분도 통과(경고만)
  assert.equal(checkRow(R({ name: "가".repeat(40) })), null);
});

test("checkRow — 칸마다 코드", () => {
  assert.equal(checkRow(R({ name: "" })), "no-name");
  assert.equal(checkRow(R({ name: "   " })), "no-name");
  for (const c of ['"', "\\", ",", "(", ")", "|"]) assert.equal(checkRow(R({ name: "홍" + c + "길동" })), "bad-char", c);
  assert.equal(checkRow(R({ name: "가".repeat(41) })), "too-long");
  assert.equal(checkRow(R({ who_type: "교회" })), "bad-type");
  assert.equal(checkRow(R({ who_type: "" })), "bad-type");
  assert.equal(checkRow(R({ group_name: "" })), "no-group");
  assert.equal(checkRow(R({ group_name: "", sub_name: "" })), "no-group");
  assert.equal(checkRow(R({ group_name: "평화" })), "bad-group");
  assert.equal(checkRow(R({ group_name: "화평교구" })), "bad-group");   // 다듬기 전 값은 판정표가 받지 않는다
  for (const s of ["07", "20목장", "남성목장", "1000", "20-1", "청년", "|"]) assert.equal(checkRow(R({ sub_name: s })), "bad-sub", s);
  assert.equal(checkRow(R({ who_type: "교회학교", group_name: "", sub_name: "" })), "no-group");
  assert.equal(checkRow(R({ who_type: "교회학교", group_name: "중등(부)" })), "bad-char");
  assert.equal(checkRow(R({ who_type: "교회학교", group_name: "중등부", sub_name: "1|2" })), "bad-char");
  assert.equal(checkRow(R({ who_type: "교회학교", group_name: "가".repeat(41) })), "too-long");
  assert.equal(checkRow(R({ who_type: "교회학교", group_name: "중등부", sub_name: "가".repeat(41) })), "too-long");
  assert.equal(checkRow(R({ position: "가".repeat(41) })), "too-long");
});

test("checkRow — 여러 칸이 틀리면 이름 → 구분 → 소속 → 세부 → 직분 차례", () => {
  assert.equal(checkRow(R({ name: "", who_type: "x", group_name: "x" })), "no-name");
  assert.equal(checkRow(R({ who_type: "x", group_name: "" })), "bad-type");
  assert.equal(checkRow(R({ group_name: "", sub_name: "x" })), "no-group");
  assert.equal(checkRow(R({ group_name: "평화", sub_name: "x" })), "bad-group");
  assert.equal(checkRow(R({ sub_name: "x", position: "가".repeat(41) })), "bad-sub");
});

test("checkNote — 500자까지 · 붙임말을 붙인 뒤의 길이로 본다", () => {
  assert.equal(checkNote(""), null);
  assert.equal(checkNote(null), null);
  assert.equal(checkNote("가".repeat(500)), null);
  assert.equal(checkNote("가".repeat(501)), "note-too-long");
  // 창은 480자까지 받는다 — 「담당자가 더함 / 」(10자)을 붙여도 500 안이다
  assert.equal("담당자가 더함 / ".length, 10);
  assert.equal(checkNote("담당자가 더함 / " + "가".repeat(480)), null);
  assert.equal(checkNote("담당자가 더함 / " + "가".repeat(491)), "note-too-long");
});

test("tidyRaw — 교구 칸 「화평교구」·목장 「20목장」·「07」·「남성목장」·직분 「님」", () => {
  assert.deepEqual(tidyRaw(raw("홍길동", "화평교구", "20목장", "집사님")),
    { row: { who_type: "교구", group_name: "화평", sub_name: "20", name: "홍길동", position: "집사" }, notes: [], error: null });
  assert.equal(tidyRaw(raw("홍길동", "화평", "07", "")).row.sub_name, "7");
  assert.equal(tidyRaw(raw("홍길동", "소망", "남성목장", "")).row.sub_name, "남성");
  assert.equal(tidyRaw(raw("홍길동", "소망 교구", "남성", "")).row.group_name, "소망");
  assert.equal(tidyRaw(raw("홍길동", "사랑", "5", "")).row.group_name, "사랑");          // 교구 「사랑」은 사랑부가 아니다
  assert.equal(tidyRaw(raw("홍길동", "사랑", "5", "")).row.who_type, "교구");
  assert.deepEqual(tidyRaw(raw("홍길동", "새가족", "", "성도")).row,
    { who_type: "교구", group_name: "새가족", sub_name: "", name: "홍길동", position: "성도" });
});

test("tidyRaw — 부서 줄임말은 교구·목장 칸에만 「부」를 붙인다(직분 「청년」은 그대로)", () => {
  assert.deepEqual(tidyRaw(raw("홍길동", "유년", "", "")),
    { row: { who_type: "교회학교", group_name: "유년부", sub_name: "", name: "홍길동", position: "" },
      notes: ["「유년」 → 「유년부」로 읽었어요"], error: null });
  assert.deepEqual(tidyRaw(raw("홍길동", "교회학교", "유치", "")).row,
    { who_type: "교회학교", group_name: "유치부", sub_name: "", name: "홍길동", position: "" });
  assert.deepEqual(tidyRaw(raw("홍길동", "교회학교", "유치", "")).notes, ["「유치」 → 「유치부」로 읽었어요"]);
  assert.equal(tidyRaw(raw("홍길동", "교회학교", "사랑", "")).row.group_name, "사랑부");   // 목장 칸의 「사랑」은 부서
  assert.equal(tidyRaw(raw("홍길동", "소년2", "", "")).row.group_name, "소년2부");
  assert.equal(tidyRaw(raw("홍길동", "사랑부", "", "")).row.who_type, "교회학교");
  const pos = tidyRaw(raw("홍길동", "화평", "3", "청년"));
  assert.equal(pos.row.position, "청년");
  assert.equal(pos.row.who_type, "교구");
  assert.deepEqual(pos.notes, []);
});

test("tidyRaw — 교구 칸 「청년」·「청년부」 → 교회학교 청년부 · 목장 칸 「청년」은 버림", () => {
  assert.deepEqual(tidyRaw(raw("홍길동", "청년", "청년", "")),
    { row: { who_type: "교회학교", group_name: "청년부", sub_name: "", name: "홍길동", position: "" },
      notes: ["「청년」 → 「청년부」로 읽었어요", "목장 칸 「청년」 — 청년부에는 목장이 없어 뺐어요"], error: null });
  assert.deepEqual(tidyRaw(raw("홍길동", "청년부", "", "")),
    { row: { who_type: "교회학교", group_name: "청년부", sub_name: "", name: "홍길동", position: "" }, notes: [], error: null });
  assert.equal(tidyRaw(raw("홍길동", "청년부", "청년부", "")).row.sub_name, "");
});

test("tidyRaw — 교구 칸 「교회학교」 + 목장 칸 부서", () => {
  assert.deepEqual(tidyRaw(raw("홍길동", "교회학교", "중등부", "학생")),
    { row: { who_type: "교회학교", group_name: "중등부", sub_name: "", name: "홍길동", position: "학생" }, notes: [], error: null });
  const blank = tidyRaw(raw("홍길동", "교회학교", "", ""));
  assert.equal(blank.row.who_type, "교회학교");
  assert.equal(blank.error, "no-group");
});

test("tidyRaw — 이름 끝 숫자(동명이인 표시)는 떼고 알린다 · 숫자 앞이 한글일 때만", () => {
  const r = tidyRaw(raw("홍길동2", "화평", "20", ""));
  assert.equal(r.row.name, "홍길동");
  assert.deepEqual(r.notes, ["이름 끝 숫자를 뗐어요 (홍길동2 → 홍길동)"]);
  assert.equal(tidyRaw(raw("홍길동 12", "화평", "20", "")).row.name, "홍길동");
  assert.equal(tidyRaw(raw("ca-test-3", "화평", "20", "")).row.name, "ca-test-3");   // 시험 이름은 그대로
  assert.equal(tidyRaw(raw("2", "화평", "20", "")).row.name, "2");
  assert.deepEqual(tidyRaw(raw("홍길동", "화평", "20", "")).notes, []);
});

test("tidyRaw — 빈칸·틀린 줄은 row 를 돌려주고 error 에 코드", () => {
  assert.deepEqual(tidyRaw(raw("", "", "", "")), { row: null, notes: [], error: "no-name" });
  assert.deepEqual(tidyRaw(raw("  ", " ", "", "")), { row: null, notes: [], error: "no-name" });
  const noName = tidyRaw(raw("", "화평", "20", "집사"));
  assert.equal(noName.error, "no-name");
  assert.equal(noName.row.group_name, "화평");
  const blank = tidyRaw(raw("홍길동", "", "", "집사"));            // 소속 없음 = 「빈칸」
  assert.deepEqual(blank.row, { who_type: "교구", group_name: "", sub_name: "", name: "홍길동", position: "집사" });
  assert.equal(blank.error, "no-group");
  assert.equal(tidyRaw(raw("홍길동", "", "20", "")).error, "no-group");
  assert.equal(tidyRaw(raw("홍길동", "평화", "20", "")).error, "bad-group");
  assert.equal(tidyRaw(raw("홍길동", "화평", "20-1", "")).error, "bad-sub");
  assert.equal(tidyRaw(raw("홍,길동", "화평", "20", "")).error, "bad-char");
  assert.equal(tidyRaw(raw("홍길동", "화평".normalize("NFD"), "20", "")).error, null);   // 맥 엑셀의 자모분리 교구
});

test("tidyRaw — 제목 줄은 화면이 거른다: 여기로 오면 그냥 한 줄(소속 없음)로 판정", () => {
  const t = tidyRaw(raw("성명", "교구", "목장", "직분"));
  assert.equal(t.row.name, "성명");
  assert.equal(t.error, "no-group");
});
```

- [ ] **Step 6: 돌려서 실패를 본다**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events && node --experimental-strip-types --test tests/events-rules.test.mjs
```

기대: FAIL — `SyntaxError: The requested module '../supabase/functions/church-admin/events-rules.ts' does not provide an export named '…'`
(`cleanPosition`·`tidyRow`·`checkRow`·`checkNote`·`tidyRaw` 중 하나), `# tests 1` · `# fail 1`.

- [ ] **Step 7: 모듈 ② — 줄 다듬기·판정표를 파일 끝에 붙인다**

`supabase/functions/church-admin/events-rules.ts` **끝에** 그대로 붙인다:

```ts
// ============================================================================
// 명단 줄 다듬기 · 줄 모양 판정표(설계 §1 「줄 모양 검사」 · §3 「읽을 때 다듬는 것」)
// ============================================================================

// 소속 칸(교구·목장·부서) — 완성형(NFC)으로, 앞뒤 빈칸 없이, 가운데 빈칸은 하나로.
// ⚠️ 이름에는 쓰지 않는다 — 이름은 앱 로그인이 적은 글자 그대로 둬야 신원 키가 맞는다.
const aff = (s: unknown): string => legacyNorm(String(s ?? "").normalize("NFC"));

// 직분 다듬기 — 성경암송 api evtImportPosition: 괄호 속 떼기 · 끝 「님」 떼기.
// 원문은 「님」을 뗀 뒤 다시 다듬지 않아 「집사 님」이 「집사 」(끝 빈칸)가 됐다 — 여기서는 마지막에 한 번 더 다듬는다.
// ⚠️ 앱 직분 목록(MIN_POSITIONS · 9개)으로 **막지 않는다** — 명예권사·은퇴장로 같은 값이 수백 줄 있다(목록 밖은 경고만).
export function cleanPosition(v: unknown): string {
  return legacyNorm(legacyNorm(legacyNorm(v).replace(/\(.*?\)/g, "")).replace(/님$/, ""));
}

// 목장 칸 — 「20목장」→20 · 「07」→7(앞자리 0) · 「남성목장」→남성. 그 밖의 글자는 그대로 두어 checkRow 가 bad-sub 로 잡는다.
// ⚠️ Number() 로 바꾸지 않는다(긴 숫자가 반올림된다) — 앞의 0 만 뗀다.
function tidyMok(s: string): string {
  const t = s.replace(/\s+/g, "");
  if (/^남성(목장)?$/.test(t)) return "남성";
  const m = /^(\d+)(목장)?$/.exec(t);
  return m ? m[1].replace(/^0+(?=\d)/, "") : s;
}

// 부서 줄임말에 「부」 붙이기 — 「유년」→유년부 · 「소년2」→소년2부 · 「청년」→청년부.
// ⚠️ 교구·목장 칸에만 쓴다. 직분 칸의 「청년」을 「청년부」로 바꾸면 부서로 오인된다(2026-09-29 한 번 그럴 뻔했다).
const DEPT_SHORT = /^(사랑|영아|유아|유치|유년|초등|소년|중등|고등|청년)(\d*)$/;
const withBu = (s: string): string => (DEPT_SHORT.test(s) ? s + "부" : s);

// 구분이 정해진 줄 하나를 다듬는다 — 올리기(tidyRaw)가 쓴다. 필요하면 다른 과제도 쓸 수 있게 내보낸다
// (한 분 더하기·고치기 창의 다듬기는 Task 7 events-rows.ts 의 formRow/rowPatch 가 따로 한다).
// 이름 끝 숫자는 떼지 않는다(창에 적은 이름은 담당자가 정한 것이다 — 올리기만 뗀다).
export function tidyRow(r: { who_type?: unknown; group_name?: unknown; sub_name?: unknown; name?: unknown; position?: unknown }): EvRow {
  const who = legacyNorm(r?.who_type);
  let group = aff(r?.group_name), sub = aff(r?.sub_name);
  if (who === "교구") {
    group = group.replace(/\s*교구$/, "");      // 「화평교구」→화평
    sub = tidyMok(sub);
  } else if (who === "교회학교") {
    group = withBu(group);
  }
  return { who_type: who as EvRow["who_type"], group_name: group, sub_name: sub, name: legacyNorm(r?.name), position: cleanPosition(r?.position) };
}

// 줄 모양 판정표 — 첫 번째로 걸린 코드 하나. 다듬은 **뒤의** 줄을 받는다.
//   이름 1~40자 · 「" \ , ( ) |」 없음 → no-name · bad-char · too-long
//   구분 교구/교회학교 → bad-type
//   소속이 비었으면 → no-group (구분과 상관없이 · 올리기 화면은 이것을 「빈칸(소속 없음)」으로 센다)
//   교구 줄: 8교구 중 하나 → bad-group · 목장은 숫자(앞자리 0 없이)·「남성」·빈칸 → bad-sub
//   교회학교 줄: 부서·학년 40자 이하 · 금지 글자 없음 → too-long · bad-char
//   직분 40자 이하 → too-long (목록 밖이어도 통과 — 경고는 부르는 쪽이)
export function checkRow(row: EvRow): string | null {
  const name = String(row?.name ?? "");
  if (!name.trim()) return "no-name";
  if (BE_BAD_CHARS.test(name)) return "bad-char";
  if (name.length > BE_FIELD_MAX) return "too-long";
  const who = String(row?.who_type ?? "");
  if (who !== "교구" && who !== "교회학교") return "bad-type";
  const group = String(row?.group_name ?? ""), sub = String(row?.sub_name ?? "");
  if (!group.trim()) return "no-group";
  if (who === "교구") {
    if (!BE_GU.includes(group)) return "bad-group";
    if (sub !== "" && sub !== "남성" && !/^(0|[1-9]\d{0,2})$/.test(sub)) return "bad-sub";
  } else {
    if (BE_BAD_CHARS.test(group) || BE_BAD_CHARS.test(sub)) return "bad-char";
    if (group.length > BE_FIELD_MAX || sub.length > BE_FIELD_MAX) return "too-long";
  }
  if (String(row?.position ?? "").length > BE_FIELD_MAX) return "too-long";
  return null;
}

// 담당자 메모 길이 — ⚠️ 서버는 붙임말(「담당자가 더함 / 」·「명단 올리기」 등)을 **붙인 뒤의** 글을 넣기 직전에 이것으로 본다.
// 창(Task 10)의 글자 수 상한은 480 — 「담당자가 더함 / 」(10자)을 붙여도 500 을 넘지 않게(CONTRACT §5).
export function checkNote(note: unknown): string | null {
  return String(note ?? "").length > BE_NOTE_MAX ? "note-too-long" : null;
}

// 올리기 한 줄(이름·교구·목장·직분 네 칸)을 이벤트 줄로 — 2026-09-29 손 작업에서 나온 규칙(설계 §3).
//   · 교구 칸: 「화평교구」→화평 · 「청년/청년부」→교회학교 청년부(목장 칸 「청년」은 버림) ·
//     「교회학교」+목장 칸 부서→교회학교 그 부서 · 「유년」 같은 부서 줄임말→교회학교 유년부
//   · 목장 칸: 「20목장」→20 · 「07」→7 · 「남성목장」→남성
//   · 이름 끝 숫자(「홍길동2」 — 옛 시트의 동명이인 표시)는 떼고 알린다. 숫자 앞이 한글일 때만(「ca-test-3」은 그대로).
//   · 제목 줄(「성명」)은 화면(upload-logic.js parseSheet)이 거른다 — 여기 오면 그냥 한 줄로 판정한다.
// 돌려주는 것: row = 다듬은 줄(네 칸이 다 비었을 때만 null) · notes = 알릴 말 · error = checkRow(row)
// ⚠️ 교구 칸이 비면 구분은 「교구」로 두고 error 가 no-group 이다 — 「교구」는 기본값일 뿐이다(Task 8 이 빈칸 줄의 구분을 비워 채우기에 넘긴다).
export function tidyRaw(raw: RawCells): { row: EvRow | null; notes: string[]; error: string | null } {
  const notes: string[] = [];
  let name = legacyNorm(raw?.name);
  const gu = aff(raw?.gu), mok = aff(raw?.mok), pos = legacyNorm(raw?.pos);
  if (!name && !gu && !mok && !pos) return { row: null, notes, error: "no-name" };

  const tail = /^(.*[가-힣ᄀ-ᇿ])\s*\d+$/.exec(name);
  if (tail) {
    notes.push(`이름 끝 숫자를 뗐어요 (${name} → ${tail[1]})`);
    name = tail[1];
  }

  const bu = (s: string): string => {
    const b = withBu(s);
    if (b !== s) notes.push(`「${s}」 → 「${b}」로 읽었어요`);   // 조사(을/를)를 쓰지 않는다 — 받침에 따라 틀린다
    return b;
  };

  let who = "교구", group = "", sub = mok;
  const g = gu.replace(/\s*교구$/, "");
  if (!gu || BE_GU.includes(g)) {
    group = g;                                         // 교구 줄(교구 칸이 비면 소속 없음 → no-group)
  } else if (gu === "교회학교") {
    who = "교회학교"; group = bu(mok); sub = "";        // 목장 칸이 부서
  } else {
    const b = bu(gu);
    if (/부$/.test(b)) {
      who = "교회학교"; group = b;                       // 교구 칸에 부서(청년부·유년부…)
      if (b === "청년부" && (mok === "청년" || mok === "청년부")) {
        notes.push(`목장 칸 「${mok}」 — 청년부에는 목장이 없어 뺐어요`);
        sub = "";
      }
    } else {
      group = g;                                       // 모르는 교구 이름 → bad-group
    }
  }

  const row = tidyRow({ who_type: who, group_name: group, sub_name: sub, name, position: pos });
  return { row, notes, error: checkRow(row) };
}
```

- [ ] **Step 8: 돌려서 통과를 본다**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events && node --experimental-strip-types --test tests/events-rules.test.mjs
```

기대: PASS — `# tests 25` · `# pass 25` · `# fail 0`.

- [ ] **Step 9: 시험 ③ — 신원 키 시험을 파일 끝에 붙인다**

`tests/events-rules.test.mjs` **끝에** 그대로 붙인다(성경암송 `identityKey` 를 글자 그대로 옮긴 비교 함수가 들어 있다 — 바이트까지 같은지 본다 · `R` 은 ② 묶음의 것을 쓴다):

```js
// ── 신원 키 ────────────────────────────────────────────────────────
import { identKey, candidateKeys } from "../supabase/functions/church-admin/events-rules.ts";

// 성경암송 api/index.ts 의 norm·identityKey(파일 맨 앞 「const norm =」·「const identityKey =」 두 줄)를 **글자 그대로** 옮겨 둔다 —
// identKey 가 이것과 한 바이트라도 다르면 담당자가 넣은 줄이 앱 계정과 영영 안 이어진다. 원문이 바뀌면 이 두 줄도 함께 바꾼다.
const v2norm = (s) => (s ?? "").toString().trim().replace(/\s+/g, " ");
const v2identityKey = (u) => [u.type, u.gu, u.mok, u.bu, u.grade, u.name].map(v2norm).join("|");
// 성경암송 eventImport 가 줄을 키로 만드는 모양(교구: gu·mok / 교회학교: bu·grade)
const v2importKey = (r) => {
  const isGu = r.who_type === "교구";
  return v2identityKey({ type: r.who_type, gu: isGu ? r.group_name : "", mok: isGu ? r.sub_name : "",
    bu: isGu ? "" : r.group_name, grade: isGu ? "" : r.sub_name, name: r.name });
};

test("identKey — 성경암송 identityKey 와 바이트까지 같다", () => {
  const nfd = "홍길동".normalize("NFD");
  const samples = [
    [R(), "교구|화평|20|||홍길동"],
    [R({ group_name: "새가족", sub_name: "" }), "교구|새가족||||홍길동"],
    [R({ group_name: "소망", sub_name: "남성" }), "교구|소망|남성|||홍길동"],
    [R({ who_type: "교회학교", group_name: "중등부", sub_name: "" }), "교회학교|||중등부||홍길동"],
    [R({ who_type: "교회학교", group_name: "청년부", sub_name: "1" }), "교회학교|||청년부|1|홍길동"],
    [R({ name: " 홍  길동 " }), "교구|화평|20|||홍 길동"],
    [R({ name: nfd }), "교구|화평|20|||" + nfd],
  ];
  for (const [row, want] of samples) {
    const got = identKey(row);
    assert.equal(got, want);
    assert.equal(got, v2importKey(row));
    assert.ok(Buffer.from(got, "utf8").equals(Buffer.from(v2importKey(row), "utf8")));
  }
  assert.notEqual(identKey(R({ name: nfd })), identKey(R()));   // NFC 로 바꾸지 않는다
});

test("identKey — 앱에서 낸 줄(users 값으로 만든 키)과도 같다", () => {
  // eventSignup 은 identityKey(users 한 줄)을 넣는다 — 교구 계정의 bu·grade 는 null 일 수 있다
  const u = { type: "교구", gu: "화평", mok: "20", bu: null, grade: null, name: "홍길동" };
  assert.equal(identKey(R()), v2identityKey(u));
  const s = { type: "교회학교", gu: null, mok: null, bu: "중등부", grade: "2", name: "홍길동" };
  assert.equal(identKey(R({ who_type: "교회학교", group_name: "중등부", sub_name: "2" })), v2identityKey(s));
});

test("candidateKeys — 첫 값은 정본 · 목장 「7」↔「07」·「7목장」 · 이름 NFC↔NFD", () => {
  const nfd = "홍길동".normalize("NFD");
  const keys = candidateKeys(R({ sub_name: "7" }));
  assert.equal(keys[0], identKey(R({ sub_name: "7" })));
  for (const m of ["7", "7목장", "07", "07목장"]) {
    assert.ok(keys.includes(`교구|화평|${m}|||홍길동`), m);
    assert.ok(keys.includes(`교구|화평|${m}|||${nfd}`), m + " NFD");
  }
  assert.equal(keys.length, 8);
  assert.equal(new Set(keys).size, keys.length);                 // 겹침 없음
});

test("candidateKeys — 두 자리 목장은 「0N」을 만들지 않는다 · 앱 줄의 「07」도 「7」을 찾는다", () => {
  const k20 = candidateKeys(R({ sub_name: "20" }));
  assert.ok(k20.includes("교구|화평|20|||홍길동"));
  assert.ok(k20.includes("교구|화평|20목장|||홍길동"));
  assert.ok(!k20.some((k) => k.includes("|020")));
  const k07 = candidateKeys(R({ sub_name: "07" }));             // 앱에서 「07」로 가입한 분의 줄
  assert.ok(k07.includes("교구|화평|7|||홍길동"));
  assert.ok(k07.includes("교구|화평|07|||홍길동"));
});

test("candidateKeys — 「남성」·빈 목장·교회학교는 목장 변형이 없다", () => {
  assert.deepEqual(candidateKeys(R({ group_name: "소망", sub_name: "남성" })).filter((k) => !k.endsWith("홍길동".normalize("NFD"))),
    ["교구|소망|남성|||홍길동"]);
  assert.deepEqual(candidateKeys(R({ group_name: "새가족", sub_name: "" })).length, 2);   // 이름 두 꼴
  const kid = candidateKeys(R({ who_type: "교회학교", group_name: "중등부", sub_name: "1" }));
  assert.deepEqual(kid, ["교회학교|||중등부|1|홍길동", "교회학교|||중등부|1|" + "홍길동".normalize("NFD")]);
});

test("candidateKeys — 자모분리(NFD)로 적힌 이름은 완성형 키도 만든다", () => {
  const nfd = "홍길동".normalize("NFD");
  const keys = candidateKeys(R({ name: nfd }));
  assert.equal(keys[0], "교구|화평|20|||" + nfd);
  assert.ok(keys.includes("교구|화평|20|||홍길동"));
});
```

- [ ] **Step 10: 돌려서 실패를 본다**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events && node --experimental-strip-types --test tests/events-rules.test.mjs
```

기대: FAIL — `does not provide an export named 'candidateKeys'`(또는 `'identKey'`), `# tests 1` · `# fail 1`.

- [ ] **Step 11: 모듈 ③ — 신원 키를 파일 끝에 붙인다**

`supabase/functions/church-admin/events-rules.ts` **끝에** 그대로 붙인다:

```ts
// ============================================================================
// 신원 키 · 같은 분 판정의 후보 키(설계 §1 「같은 분 판정과 앱 계정 잇기」 1번)
// ============================================================================

// 정본 키 — 성경암송 eventImport 가 만드는 모양 그대로(교구: gu·mok / 교회학교: bu·grade).
// event_signups.ident_key 에 넣는 값이다. NFC 를 하지 않는다(맨 위 ⚠️).
export function identKey(row: EvRow): string {
  const isGu = row.who_type === "교구";
  return appIdentityKey({
    type: row.who_type,
    gu: isGu ? row.group_name : "", mok: isGu ? row.sub_name : "",
    bu: isGu ? "" : row.group_name, grade: isGu ? "" : row.sub_name,
    name: row.name,
  });
}

// 같은 분일 수 있는 키 모두 — (목장: 원문 · 앞자리 0 뗀 꼴 · 「N목장」 · 한 자리면 「0N」·「0N목장」) × (이름: 원문 · NFC · NFD).
//   앱 로그인은 「07」도 받고(app.js MOK_RE /^(\d+|남성)$/) 앱에서 낸 줄의 sub_name 은 users 값 그대로라,
//   담당자 줄을 「7」로 다듬으면 「07」 계정·줄과 어긋난다 — 그래서 한 자리 목장은 「0N」도 만든다(계약의 세 꼴보다 넓다).
//   이름은 맥에서 가입한 분(자모분리 NFD)과 윈도 엑셀(완성형 NFC)이 서로를 찾게 두 꼴을 다 만든다.
// 첫 값은 늘 identKey(row)(정본). 겹치는 키는 한 번만.
export function candidateKeys(row: EvRow): string[] {
  const s = legacyNorm(row.sub_name);
  const subs = [s];
  if (row.who_type === "교구") {
    const m = /^(\d+)(목장)?$/.exec(s.replace(/\s+/g, ""));
    if (m) {
      const n = m[1].replace(/^0+(?=\d)/, "");
      subs.push(n, n + "목장");
      if (n.length === 1) subs.push("0" + n, "0" + n + "목장");
    }
  }
  const nm = legacyNorm(row.name);
  const names = [nm, nm.normalize("NFC"), nm.normalize("NFD")];
  const out = new Set<string>([identKey(row)]);
  for (const sb of subs) for (const n of names) out.add(identKey({ ...row, sub_name: sb, name: n }));
  return [...out];
}
```

- [ ] **Step 12: 돌려서 통과를 본다**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events && node --experimental-strip-types --test tests/events-rules.test.mjs
```

기대: PASS — `# tests 31` · `# pass 31` · `# fail 0`.

- [ ] **Step 13: preflight 전체**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events && python tools/preflight.py
```

기대: `[2] 순수 함수 시험` 이 `통과  시험 파일 N개`(전보다 1개 많다), 마지막 줄 `모두 통과`.

- [ ] **Step 14: 커밋**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events && git add supabase/functions/church-admin/events-rules.ts tests/events-rules.test.mjs && git diff --cached --stat && git commit -F - <<'EOF'
feat(성경필사): events-rules — 회차 검사·공개 판정·자격 회차 판정·줄 다듬기·판정표·신원 키

- checkEvent: no-title → bad-period → period-reversed → bad-status → bad-list-until
  → list-until-before-close → before-eligibility (evEventCreate·evEventSave 가 같은 함수)
- isEligEvent(needs)·eligibilityStart(needs): 자격 회차 판정은 이 둘뿐(모양이 틀려도 막는 쪽으로)
- evtListable 은 성경암송 api 그대로 · mergeEventPatch 는 보낸 칸만(needs·copy·kind 안 받음)
- tidyRaw: 화평교구·20목장·07·남성목장·유년→유년부(교구·목장 칸만)·청년부·교회학교+부서·이름 끝 숫자
- checkRow 판정표 · 소속 빈 줄은 no-group(올리기의 「빈칸」) · checkNote 는 붙임말을 붙인 뒤 500자
- identKey 는 paper.ts appIdentityKey(NFC 안 함) — 성경암송 identityKey 와 바이트까지 같은지 시험
- candidateKeys: 7↔07·7목장 × 이름 원문·NFC·NFD

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
git show --stat HEAD
```

기대: `git diff --cached --stat` 에 두 파일만 · pre-commit 이 `명단 검사 통과 — 파일 N개` 를 찍고 · `git show --stat` 에 두 파일만 보인다.

---

### Task 3: `events-people.ts` + `applicantFromSignup` — 교인명부 옮겨 적기·빈칸 채우기·교적 표시

**Files:**
- Modify: `supabase/functions/church-admin/people-match.ts` — 앵커 `// 앱 로그인은 목장으로 숫자나 「남성」만 받고, 목장이 없으면 99 를 쓴다(성경암송 app.js MOK_RE).` **바로 위에** 함수 하나(`applicantFromPaper` 바로 아래 자리)
- Modify (Test): `tests/people-match.test.mjs` — 파일 **끝에** 새 import 문 하나 + 시험 둘(맨 위 import 블록은 고치지 않는다)
- Create: `supabase/functions/church-admin/events-people.ts`
- Test: `tests/events-people.test.mjs` (새 파일)

**Interfaces:**
- Consumes: Task 2 `BE_GU` · `paper.ts` `legacyNorm` · `people-match.ts` `mokNumber`·`txt`(모듈 안)·`type Applicant` · (시험만) `toCand`·`churchFor`·시험 도움 `C`
- Produces: `applicantFromSignup(r: { who_type: string; group_name: string; sub_name: string; name: string }): Applicant` ·
  `type ChurchPerson` · `type Affil` · `type FillReason`(계약의 일곱 + CONTRACT §5 `"different-affiliation"`) ·
  `mapChurchPerson(p: ChurchPerson): Affil | null` · `positionFromChurch(p: ChurchPerson): string` ·
  `lookupView(p: ChurchPerson, name: string): { name; who_type; group_name; sub_name; position }` ·
  `fillDecision(row, cands: ChurchPerson[]): { patch: Partial<Affil & { position: string }> | null; reason: FillReason }`

⚠️ `lookupView` 는 계약대로 `group_name`·`sub_name` 칸을 돌려준다. `evPeopleLookup` 응답(계약 §2)은 `group`·`sub` 이므로 **Task 8 이 칸 지도로 옮겨 적는다**(스프레드 금지).
⚠️ `fillDecision` 의 모양 약속(소속이 빈 줄은 `who_type`·`group_name`·`sub_name` 한 벌 · 다른 소속이면 `different-affiliation`)은 위 「판정 약속」 — Task 8 `applyFill` 이 여기에 기댄다.

- [ ] **Step 0: 선행 확인 — Task 2 · 앵커 · 아직 없는 이름**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
grep -cF '// 앱 로그인은 목장으로 숫자나 「남성」만 받고, 목장이 없으면 99 를 쓴다(성경암송 app.js MOK_RE).' supabase/functions/church-admin/people-match.ts
grep -cE '^export function applicantFromPaper\(r: any\): Applicant \{' supabase/functions/church-admin/people-match.ts
grep -cE '^(export function mokNumber\(|export type Applicant = |const txt = )' supabase/functions/church-admin/people-match.ts
grep -cE '^const C = \(o\) => toCand\(' tests/people-match.test.mjs
grep -cE '^  sameAffiliation, matchChurch, churchFor, lookupKeys,' tests/people-match.test.mjs
grep -c 'applicantFromSignup' supabase/functions/church-admin/people-match.ts tests/people-match.test.mjs
ls supabase/functions/church-admin/events-people.ts tests/events-people.test.mjs 2>&1 | grep -c "No such file"
node --experimental-strip-types --input-type=module -e "
const m = await import('./supabase/functions/church-admin/events-rules.ts');
if (!Array.isArray(m.BE_GU) || m.BE_GU.length !== 8) throw new Error('Task 2 의 BE_GU 가 없다');
console.log('Task 2 BE_GU 있음');
"
```

기대: `1` · `1` · `3` · `1` · `1`(맨 위 import 가 `churchFor` 를 이미 들여온다) · `…people-match.ts:0` 과 `…people-match.test.mjs:0` · `2` · `Task 2 BE_GU 있음`(경고 줄 `ExperimentalWarning` 은 괜찮다).
하나라도 다르면 **멈춘다** — 앵커가 `1` 이 아니면 main 이 그 주석을 바꾼 것이니 `applicantFromPaper` 함수의 닫는 `}` 바로 아래 자리를 글로 찾아 새 앵커를 정한다.

- [ ] **Step 1: 시험 — `applicantFromSignup` 을 people-match 시험 끝에 붙인다**

`tests/people-match.test.mjs` 맨 위 import 블록은 **고치지 않는다.** 아래 묶음을 파일 **끝에** 그대로 붙인다(앞에 빈 줄 하나 · `C`·`churchFor` 는 파일에 이미 있다):

```js
// ── 성경필사(암송) 명단 줄(2026-09-29) ─────────────────────────────
// 맨 위 import 블록은 그대로 두고 새 이름만 새 문으로 들여온다(import 는 모듈 맨 위로 끌어올려진다).
import { applicantFromSignup } from "../supabase/functions/church-admin/people-match.ts";

test("applicantFromSignup — 성경필사(암송) 명단 줄 → Applicant(전화 없음)", () => {
  assert.deepEqual(applicantFromSignup({ who_type: "교구", group_name: "화평", sub_name: "20", name: "홍길동" }),
    { type: "교구", gu: "화평", mok: 20, bu: "", name: "홍길동", phone: "" });
  assert.deepEqual(applicantFromSignup({ who_type: "교회학교", group_name: "청년부", sub_name: "", name: "홍길동" }),
    { type: "교회학교", gu: "", mok: null, bu: "청년부", name: "홍길동", phone: "" });
  assert.equal(applicantFromSignup({ who_type: "교구", group_name: "화평", sub_name: "07", name: "x" }).mok, 7);
  assert.equal(applicantFromSignup({ who_type: "교구", group_name: "소망", sub_name: "남성", name: "x" }).mok, null);
  assert.equal(applicantFromSignup({ who_type: "교구", group_name: "소망", sub_name: "", name: "x" }).mok, null);
  assert.equal(applicantFromSignup({ who_type: "교구", group_name: "화평".normalize("NFD"), sub_name: "20", name: "x" }).gu, "화평");
  assert.equal(applicantFromSignup({ who_type: "교회학교", group_name: " 중등부 ", sub_name: "1", name: "x" }).bu, "중등부");
  assert.deepEqual(Object.keys(applicantFromSignup({ who_type: "교구", group_name: "화평", sub_name: "20", name: "x" })).sort(),
    ["bu", "gu", "mok", "name", "phone", "type"]);
});

test("applicantFromSignup + churchFor — 명단 줄의 교적 표시", () => {
  const idx = new Map([
    ["홍길동", [C({ mok1: "화평", mok3: "화평-20목장" })]],
    ["김철수", [C({ mok1: "청년부", mok3: "청년-03" })]],
    ["도하늘", [C({ mok1: "소망", mok3: "소망-남성1" }), C({ mok1: "소망", mok3: "소망-3목장" })]],
  ]);
  const S = (o) => applicantFromSignup({ who_type: "교구", group_name: "화평", sub_name: "20", name: "홍길동", ...o });
  assert.deepEqual(churchFor(idx, S({})), { state: "맞음", reason: "" });
  assert.deepEqual(churchFor(idx, S({ sub_name: "21" })), { state: "확인 필요", reason: "같은 이름 1명" });  // 전화가 없어 「소속 다름」이 아니다
  assert.deepEqual(churchFor(idx, S({ who_type: "교회학교", group_name: "청년부", sub_name: "", name: "김철수" })),
    { state: "맞음", reason: "" });                                   // 청년부는 명부의 목장 첫 칸
  assert.deepEqual(churchFor(idx, S({ group_name: "소망", sub_name: "남성", name: "도하늘" })),
    { state: "확인 필요", reason: "목장 확인(같은 교구 2명)" });
  assert.deepEqual(churchFor(idx, S({ name: "박하나" })), { state: "없음", reason: "" });
  assert.equal(churchFor(null, S({})), null);
});
```

- [ ] **Step 2: 돌려서 실패를 본다**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events && node --experimental-strip-types --test tests/people-match.test.mjs
```

기대: FAIL — `does not provide an export named 'applicantFromSignup'`, `# tests 1` · `# fail 1`.

- [ ] **Step 3: `people-match.ts` 에 `applicantFromSignup` 을 더한다(앵커 바로 위)**

`supabase/functions/church-admin/people-match.ts` 에서 앵커 줄

```ts
// 앱 로그인은 목장으로 숫자나 「남성」만 받고, 목장이 없으면 99 를 쓴다(성경암송 app.js MOK_RE).
```

을 찾아(Step 0 에서 한 번뿐인 것을 봤다) 그 줄 **바로 위에** 아래를 넣는다(Edit 로 — `old_string` = 앵커 줄, `new_string` = 아래 여덟 줄 + 빈 줄 + 앵커 줄).
같은 파일의 `txt`·`mokNumber` 를 그대로 쓴다 — 새 규칙을 만들지 않는다:

```ts
// 성경필사(암송) 명단 줄(event_signups · 2026-09-29) — 교구는 group_name·sub_name(목장 숫자 글자 · 「남성」), 교회학교는 부서.
// 전화는 넣지 않는다(이 기능은 phone 칸을 쓰지 않는다) — 그래서 「소속 다름」 대신 「같은 이름 N명」으로 간다.
// 「남성」·빈 목장·99 는 mok 이 null·99 라 mokUnknown 이 「목장 확인」으로 돌린다(새 규칙을 만들지 않는다).
export function applicantFromSignup(r: { who_type: string; group_name: string; sub_name: string; name: string }): Applicant {
  const name = String(r?.name ?? "");
  if (txt(r?.who_type) === "교회학교") return { type: "교회학교", gu: "", mok: null, bu: txt(r?.group_name), name, phone: "" };
  return { type: "교구", gu: txt(r?.group_name), mok: mokNumber(r?.sub_name), bu: "", name, phone: "" };
}
```

```bash
cd /c/Projects/church-admin/.worktrees/bible-events && grep -cE '^export function applicantFromSignup\(' supabase/functions/church-admin/people-match.ts && git diff --stat supabase/functions/church-admin/people-match.ts
```

기대: `1` · `1 file changed, 9 insertions(+)` — `deletions(-)` 가 없어야 한다(있던 줄을 건드리지 않았다).

- [ ] **Step 4: 돌려서 통과를 본다**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events && node --experimental-strip-types --test tests/people-match.test.mjs
```

기대: PASS — `# tests 13` · `# pass 13` · `# fail 0`(있던 11 + 새 2).

- [ ] **Step 5: 시험 ① — 옮겨 적기 규칙 1~5 · 찾기 다섯 칸**

`tests/events-people.test.mjs` 를 새로 만든다:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mapChurchPerson, positionFromChurch, lookupView,
} from "../supabase/functions/church-admin/events-people.ts";

// 시험용 명부 한 분 — 가짜 값만(진짜 명단은 저장소에 넣지 않는다)
const P = (o = {}) => ({ name_key: "홍길동", kind2: "장년", mok1: "", mok3: "", school_dept: "", position: "", position_detail: "", ...o });

test("mapChurchPerson 규칙 1 — 아이는 kind2 를 먼저 본다(가족의 교구·목장이 있어도 부서로)", () => {
  assert.deepEqual(mapChurchPerson(P({ kind2: "교회학교", mok1: "화평", mok3: "화평-20목장", school_dept: "중등부" })),
    { who_type: "교회학교", group_name: "중등부", sub_name: "" });
  assert.deepEqual(mapChurchPerson(P({ kind2: "학생", mok1: "기쁨", mok3: "기쁨-03목장", school_dept: "고등부" })),
    { who_type: "교회학교", group_name: "고등부", sub_name: "" });
  // 부서가 없는 아이 — 부모 목장으로 보내지 않고 소속을 정하지 않는다
  assert.equal(mapChurchPerson(P({ kind2: "교회학교", mok1: "화평", mok3: "화평-20목장", school_dept: "" })), null);
});

test("mapChurchPerson 규칙 2 — 7교구 · 목장 = mok3 끝 숫자 · 「남성」 · 숫자 없으면 교구만", () => {
  assert.deepEqual(mapChurchPerson(P({ mok1: "기쁨", mok3: "기쁨-01목장" })), { who_type: "교구", group_name: "기쁨", sub_name: "1" });
  assert.deepEqual(mapChurchPerson(P({ mok1: "화평", mok3: "화평-20목장" })), { who_type: "교구", group_name: "화평", sub_name: "20" });
  assert.deepEqual(mapChurchPerson(P({ mok1: "소망", mok3: "소망-남성1" })), { who_type: "교구", group_name: "소망", sub_name: "남성" });
  assert.deepEqual(mapChurchPerson(P({ mok1: "화평", mok3: "화평-남성목장" })), { who_type: "교구", group_name: "화평", sub_name: "남성" });
  assert.deepEqual(mapChurchPerson(P({ mok1: "은혜", mok3: "은혜" })), { who_type: "교구", group_name: "은혜", sub_name: "" });
  assert.deepEqual(mapChurchPerson(P({ mok1: "은혜", mok3: "" })), { who_type: "교구", group_name: "은혜", sub_name: "" });
  for (const g of ["믿음", "소망", "사랑", "섬김", "은혜", "화평", "기쁨"]) {
    assert.equal(mapChurchPerson(P({ mok1: g, mok3: g + "-05목장" })).sub_name, "5", g);
  }
  // 청년이라도 명부 mok1 이 교구면 규칙 2 가 먼저다(설계 차례 그대로)
  assert.deepEqual(mapChurchPerson(P({ kind2: "청년", mok1: "화평", mok3: "화평-20목장" })),
    { who_type: "교구", group_name: "화평", sub_name: "20" });
  // 자모분리·빈칸이 섞여 와도 완성형으로 맞춘다
  assert.deepEqual(mapChurchPerson(P({ mok1: " " + "기쁨".normalize("NFD") + " ", mok3: "기쁨-12목장" })),
    { who_type: "교구", group_name: "기쁨", sub_name: "12" });
});

test("mapChurchPerson 규칙 3 — 청년부·청년공동체·청년새가족 → 교회학교 청년부", () => {
  for (const m of ["청년부", "청년공동체", "청년새가족"]) {
    assert.deepEqual(mapChurchPerson(P({ kind2: "청년", mok1: m, mok3: "청년-03" })),
      { who_type: "교회학교", group_name: "청년부", sub_name: "" }, m);
  }
});

test("mapChurchPerson 규칙 4 — 그 밖에는 부서가 있으면 부서 · 없으면 null(새가족·임시교구)", () => {
  assert.deepEqual(mapChurchPerson(P({ mok1: "", school_dept: "사랑부" })), { who_type: "교회학교", group_name: "사랑부", sub_name: "" });
  assert.equal(mapChurchPerson(P({ mok1: "새가족", mok3: "3월" })), null);
  assert.equal(mapChurchPerson(P({ mok1: "임시교구", mok3: "임시-1" })), null);
  assert.equal(mapChurchPerson(P({})), null);
});

test("positionFromChurch 규칙 5 — 대분류 + 명예·은퇴·원로 · 서리·시무·협동은 뗀다", () => {
  const cases = [
    ["권사", "은퇴협동권사", "은퇴권사"],
    ["집사", "서리집사은퇴", "은퇴집사"],
    ["장로", "원로장로", "원로장로"],
    ["권사", "명예권사", "명예권사"],
    ["안수집사", "은퇴안수집사", "은퇴안수집사"],
    ["집사", "서리집사", "집사"],
    ["권사", "시무권사", "권사"],
    ["장로", "시무장로", "장로"],
    ["권사", "협동권사", "권사"],
    ["성도", "", "성도"],
    [" 집사 ", "", "집사"],
    ["", "은퇴권사", ""],                 // 대분류가 비면 채우지 않는다
    ["", "", ""],
  ];
  for (const [position, position_detail, want] of cases) {
    assert.equal(positionFromChurch(P({ position, position_detail })), want, `${position}/${position_detail}`);
  }
});

test("lookupView — 다섯 칸만(이름·구분·소속·세부·직분)", () => {
  const p = P({ kind2: "장년", mok1: "화평", mok3: "화평-20목장", position: "권사", position_detail: "은퇴협동권사" });
  const v = lookupView(p, " 홍길동 ");
  assert.deepEqual(v, { name: "홍길동", who_type: "교구", group_name: "화평", sub_name: "20", position: "은퇴권사" });
  assert.deepEqual(Object.keys(v).sort(), ["group_name", "name", "position", "sub_name", "who_type"]);
  assert.deepEqual(lookupView(P({ mok1: "새가족", mok3: "3월", position: "성도" }), "홍길동"),
    { name: "홍길동", who_type: "", group_name: "", sub_name: "", position: "성도" });
  // 명부의 원래 칸(name_key·kind2·mok1·mok3·position_detail)은 따라 나가지 않는다
  const s = JSON.stringify(lookupView(P({ kind2: "교회학교", school_dept: "중등부", mok1: "화평", mok3: "화평-20목장" }), "홍길동"));
  for (const bad of ["name_key", "kind2", "mok1", "mok3", "position_detail", "school_dept", "화평-20목장"]) assert.ok(!s.includes(bad), bad);
});
```

- [ ] **Step 6: 돌려서 실패를 본다**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events && node --experimental-strip-types --test tests/events-people.test.mjs
```

기대: FAIL — `ERR_MODULE_NOT_FOUND` … `events-people.ts`, `# tests 1` · `# fail 1`.

- [ ] **Step 7: 모듈 ① — `events-people.ts` 를 만든다**

```ts
// 성경필사(암송) — 교인명부 한 분을 이벤트 줄 모양으로 옮겨 적기 · 빈칸 채우기 판정(순수 함수 · 2026-09-29)
//   설계: 성경암송 저장소 docs/superpowers/specs/2026-09-29-church-admin-bible-events-design.md §2
//   「교인명부 → 이벤트 줄로 옮겨 적는 규칙」 — 2026-09-29 일괄 맞추기에서 **한 번 틀리고 바로잡은 규칙** 그대로.
//   서버(Deno, index.ts)와 시험(Node, tests/events-people.test.mjs)이 **같은 파일**을 읽는다(authz.ts 와 같은 제약).
//
// ⚠️ people-match.ts 는 「교적 값은 모듈 밖으로 내보내지 않는다」가 원칙이다. 이 모듈은 친구 결정(설계 §0 「교인명부 쓰기」)으로
//    그 원칙을 **다섯 칸에 한해** 넓힌 자리다 — 이름·구분·소속·세부·직분. 연락처·주소·생년월일·사진·가족·교인ID 는
//    ChurchPerson 에 아예 없다(서버도 이 칸들만 select 한다).
import { BE_GU } from "./events-rules.ts";
import { legacyNorm } from "./paper.ts";
import { mokNumber } from "./people-match.ts";

export type ChurchPerson = { name_key: string; kind2: string; mok1: string; mok3: string;
  school_dept: string; position: string; position_detail: string };
export type Affil = { who_type: "교구" | "교회학교"; group_name: string; sub_name: string };

// 교적 칸 — 완성형으로, 앞뒤 빈칸 없이(명부 원본에 자모분리·빈칸이 섞여 온다 · people-match.ts 와 같은 까닭)
const txt = (s: unknown): string => legacyNorm(String(s ?? "").normalize("NFC"));

const GU7 = BE_GU.filter((g) => g !== "새가족");               // 명부의 새가족 목장 칸은 연도·월이다 — 소속을 정하지 않는다
const YOUTH_MOK1 = ["청년부", "청년공동체", "청년새가족"];
const KID_KIND2 = ["교회학교", "학생"];
const POS_PREFIX = ["명예", "은퇴", "원로"];

// 규칙 1~4 — 차례가 규칙이다.
//   1. kind2 교회학교·학생 → 교회학교 · school_dept(없으면 소속을 정하지 않는다)
//      ⚠️ 명부에는 **아이도 가족의 교구·목장(mok1·mok3)이 있다** — 이것을 먼저 보면 아이가 부모 목장으로 간다(2026-09-29 135줄).
//   2. mok1 이 7교구 → 교구 · 목장 = mok3 끝 숫자(「소망-남성1」처럼 「남성」이 들어 있으면 남성 · 둘 다 없으면 비움)
//   3. mok1 청년부·청년공동체·청년새가족 → 교회학교 청년부
//   4. 그 밖에 school_dept 가 있으면 → 교회학교 그 부서. 없으면 null(새가족·임시교구 등)
export function mapChurchPerson(p: ChurchPerson): Affil | null {
  const kind2 = txt(p?.kind2), mok1 = txt(p?.mok1), mok3 = txt(p?.mok3), dept = txt(p?.school_dept);
  if (KID_KIND2.includes(kind2)) return dept ? { who_type: "교회학교", group_name: dept, sub_name: "" } : null;
  if (GU7.includes(mok1)) {
    const n = mokNumber(mok3);
    const sub = /남성/.test(mok3) ? "남성" : n === null ? "" : String(n);
    return { who_type: "교구", group_name: mok1, sub_name: sub };
  }
  if (YOUTH_MOK1.includes(mok1)) return { who_type: "교회학교", group_name: "청년부", sub_name: "" };
  if (dept) return { who_type: "교회학교", group_name: dept, sub_name: "" };
  return null;
}

// 규칙 5 — 직분 = position(대분류) 앞에 position_detail 의 명예·은퇴·원로를 붙인다.
//   서리·시무·협동·이명은 뗀다: 은퇴협동권사 → 은퇴권사 · 서리집사은퇴 → 은퇴집사 · 시무장로 → 장로. position 이 비면 "".
export function positionFromChurch(p: ChurchPerson): string {
  const pos = txt(p?.position);
  if (!pos) return "";
  const detail = txt(p?.position_detail);
  const pre = POS_PREFIX.find((x) => detail.includes(x));
  return pre && !pos.startsWith(pre) ? pre + pos : pos;
}

// evPeopleLookup 한 줄 — **다섯 칸만**(이름·구분·소속·세부·직분). 소속을 못 정하면 세 칸이 빈 글자.
// ⚠️ 스프레드(...p)를 쓰지 않는다 — name_key·kind2·mok3·position_detail 같은 원래 칸이 따라 나가지 않게.
// ⚠️ 응답 칸 이름은 group·sub 다(CONTRACT §2) — Task 8 이 칸 지도로 옮겨 적는다(스프레드 금지).
export function lookupView(p: ChurchPerson, name: string):
  { name: string; who_type: string; group_name: string; sub_name: string; position: string } {
  const a = mapChurchPerson(p);
  return {
    name: legacyNorm(name),
    who_type: a ? a.who_type : "",
    group_name: a ? a.group_name : "",
    sub_name: a ? a.sub_name : "",
    position: positionFromChurch(p),
  };
}
```

- [ ] **Step 8: 돌려서 통과를 본다**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events && node --experimental-strip-types --test tests/events-people.test.mjs
```

기대: PASS — `# tests 6` · `# pass 6` · `# fail 0`.

- [ ] **Step 9: 시험 ② — 빈칸 채우기 판정을 파일 끝에 붙인다**

맨 위 import 블록은 **고치지 않는다.** 아래 묶음을 `tests/events-people.test.mjs` **끝에** 그대로 붙인다(앞에 빈 줄 하나 · `P` 는 ① 묶음의 것):

```js
// ── 빈칸 채우기 ────────────────────────────────────────────────────
// import 는 모듈 맨 위로 끌어올려진다 — 맨 위 import 블록을 고치지 않고 새 문으로 들여온다.
import { fillDecision } from "../supabase/functions/church-admin/events-people.ts";

const ADULT = P({ kind2: "장년", mok1: "화평", mok3: "화평-20목장", position: "권사", position_detail: "은퇴협동권사" });
const KID = P({ kind2: "교회학교", mok1: "화평", mok3: "화평-20목장", school_dept: "유년부" });
const YOUTH = P({ kind2: "청년", mok1: "청년부", mok3: "청년-03", position: "성도" });
const NEWBIE = P({ kind2: "장년", mok1: "새가족", mok3: "3월", position: "성도" });
const W = (o = {}) => ({ who_type: "교구", group_name: "", sub_name: "", name: "홍길동", position: "", ...o });
const NONE = (reason) => ({ patch: null, reason });

test("fillDecision — 명부에 없음 · 동명이인", () => {
  assert.deepEqual(fillDecision(W(), []), NONE("not-in-directory"));
  assert.deepEqual(fillDecision(W(), [ADULT, ADULT]), NONE("same-name"));
  // 소속이 적힌 줄도 same-name — 그 줄을 넣을지(add)는 부르는 쪽(Task 8)이 정한다
  assert.deepEqual(fillDecision(W({ group_name: "화평", sub_name: "20" }), [ADULT, ADULT]), NONE("same-name"));
});

test("fillDecision — 소속이 빈 줄은 구분·소속·세부 한 벌과 빈 직분을 명부대로", () => {
  assert.deepEqual(fillDecision(W(), [ADULT]),
    { patch: { who_type: "교구", group_name: "화평", sub_name: "20", position: "은퇴권사" }, reason: "filled" });
  assert.deepEqual(fillDecision(W(), [KID]),
    { patch: { who_type: "교회학교", group_name: "유년부", sub_name: "" }, reason: "filled" });   // 아이는 부모 목장이 아니라 부서로
  assert.deepEqual(fillDecision(W(), [YOUTH]),
    { patch: { who_type: "교회학교", group_name: "청년부", sub_name: "", position: "성도" }, reason: "filled" });
  assert.deepEqual(fillDecision({ name: "홍길동" }, [ADULT]),                          // 칸이 아예 없어도 빈칸으로 본다
    { patch: { who_type: "교구", group_name: "화평", sub_name: "20", position: "은퇴권사" }, reason: "filled" });
  assert.deepEqual(fillDecision(W({ who_type: "" }), [KID]),                           // 올리기에서 교구 칸이 비었던 줄(구분 "")
    { patch: { who_type: "교회학교", group_name: "유년부", sub_name: "" }, reason: "filled" });
  const r = fillDecision(W(), [ADULT]);
  assert.ok(!("name" in r.patch));
});

test("fillDecision — 소속을 명부로 채우면 적혀 있던 목장도 명부 값으로 바꾼다", () => {
  assert.deepEqual(fillDecision(W({ sub_name: "21" }), [ADULT]),
    { patch: { who_type: "교구", group_name: "화평", sub_name: "20", position: "은퇴권사" }, reason: "filled" });
  assert.equal(fillDecision(W({ sub_name: "20" }), [ADULT]).patch.sub_name, "20");    // 같아도 한 벌로 싣는다
  const noMok = P({ kind2: "장년", mok1: "은혜", mok3: "은혜", position: "집사" });   // 명부에 목장 숫자가 없는 분
  assert.deepEqual(fillDecision(W({ sub_name: "5" }), [noMok]),
    { patch: { who_type: "교구", group_name: "은혜", sub_name: "", position: "집사" }, reason: "filled" });
  assert.deepEqual(fillDecision(W({ sub_name: "3" }), [KID]),                          // 아이 — 적힌 목장을 부서 줄에 남기지 않는다
    { patch: { who_type: "교회학교", group_name: "유년부", sub_name: "" }, reason: "filled" });
});

test("fillDecision — 소속이 같으면 빈 칸만 채운다(적힌 칸은 덮지 않는다)", () => {
  assert.deepEqual(fillDecision(W({ group_name: "화평", sub_name: "20", position: "집사" }), [ADULT]), NONE("nothing-blank"));
  assert.deepEqual(fillDecision(W({ group_name: "화평", sub_name: "20" }), [ADULT]),
    { patch: { position: "은퇴권사" }, reason: "filled" });
  assert.deepEqual(fillDecision(W({ group_name: "화평", position: "집사" }), [ADULT]),   // 같은 교구면 빈 목장을
    { patch: { sub_name: "20" }, reason: "filled" });
  assert.deepEqual(fillDecision(W({ group_name: "화평", sub_name: "21" }), [ADULT]),     // 같은 교구 다른 목장 — 목장은 그대로 · 직분만
    { patch: { position: "은퇴권사" }, reason: "filled" });
  assert.deepEqual(fillDecision(W({ group_name: "새가족" }), [NEWBIE]),                  // 새가족끼리 — 직분만(목장 칸은 연도·월)
    { patch: { position: "성도" }, reason: "filled" });
  assert.deepEqual(fillDecision(W({ who_type: "교회학교", group_name: "청년부" }), [YOUTH]),
    { patch: { position: "성도" }, reason: "filled" });
  assert.deepEqual(fillDecision(W({ who_type: "교회학교", group_name: "청년부", position: "성도" }), [YOUTH]), NONE("nothing-blank"));
});

test("fillDecision — 적힌 소속이 명부와 다르면 아무것도 채우지 않는다(different-affiliation)", () => {
  assert.deepEqual(fillDecision(W({ group_name: "기쁨" }), [ADULT]), NONE("different-affiliation"));        // 직분도 채우지 않는다
  assert.deepEqual(fillDecision(W({ group_name: "기쁨", position: "집사" }), [ADULT]), NONE("different-affiliation"));
  assert.deepEqual(fillDecision(W({ group_name: "새가족" }), [ADULT]), NONE("different-affiliation"));
  assert.deepEqual(fillDecision(W({ group_name: "화평" }), [NEWBIE]), NONE("different-affiliation"));
  assert.deepEqual(fillDecision(W({ who_type: "교회학교", group_name: "청년부" }), [KID]), NONE("different-affiliation"));
  assert.deepEqual(fillDecision(W({ who_type: "교회학교", group_name: "중등부" }), [P({ kind2: "학생", school_dept: "고등부" })]),
    NONE("different-affiliation"));
  // 명부가 소속을 못 정하는 분(임시교구)이면 같은지 알 수 없다 → no-affiliation(역시 채우지 않는다)
  assert.deepEqual(fillDecision(W({ group_name: "화평" }), [P({ mok1: "임시교구", mok3: "임시-1", position: "성도" })]),
    NONE("no-affiliation"));
});

test("fillDecision — 아이↔어른은 다른 사람으로 본다(kid-adult)", () => {
  assert.deepEqual(fillDecision(W({ who_type: "교회학교", group_name: "중등부" }), [ADULT]), NONE("kid-adult"));
  assert.deepEqual(fillDecision(W({ position: "학생" }), [ADULT]), NONE("kid-adult"));
  assert.deepEqual(fillDecision(W({ position: "어린이" }), [ADULT]), NONE("kid-adult"));
  assert.deepEqual(fillDecision(W({ group_name: "화평", sub_name: "20" }), [KID]), NONE("kid-adult"));
  assert.deepEqual(fillDecision(W({ who_type: "교회학교", group_name: "" }), [ADULT]), NONE("kid-adult"));
  // 아이 줄 + 명부 아이 → 채운다
  assert.deepEqual(fillDecision(W({ who_type: "교회학교", group_name: "" }), [KID]),
    { patch: { who_type: "교회학교", group_name: "유년부", sub_name: "" }, reason: "filled" });
  assert.deepEqual(fillDecision(W({ position: "학생" }), [P({ kind2: "학생", school_dept: "고등부" })]),
    { patch: { who_type: "교회학교", group_name: "고등부", sub_name: "" }, reason: "filled" });
});

test("fillDecision — 명단은 청년부인데 명부는 교구면 청년부를 둔다(youth-parish)", () => {
  const parishYouth = P({ kind2: "청년", mok1: "화평", mok3: "화평-20목장", position: "성도" });
  assert.deepEqual(fillDecision(W({ who_type: "교회학교", group_name: "청년부" }), [parishYouth]), NONE("youth-parish"));
});

test("fillDecision — 소속이 빈 줄인데 명부도 소속을 못 정하면 no-affiliation", () => {
  assert.deepEqual(fillDecision(W(), [NEWBIE]), NONE("no-affiliation"));
  assert.deepEqual(fillDecision(W(), [P({ kind2: "교회학교", mok1: "화평", mok3: "화평-20목장" })]),
    NONE("no-affiliation"));            // 부서 없는 아이 — 부모 목장으로 채우지 않는다
  assert.deepEqual(fillDecision(W({ position: "집사" }), [P({ mok1: "임시교구", mok3: "임시-1", position: "집사" })]),
    NONE("no-affiliation"));
});
```

- [ ] **Step 10: 돌려서 실패를 본다**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events && node --experimental-strip-types --test tests/events-people.test.mjs
```

기대: FAIL — `does not provide an export named 'fillDecision'`, `# tests 1` · `# fail 1`.

- [ ] **Step 11: 모듈 ② — `fillDecision` 을 파일 끝에 붙인다**

`supabase/functions/church-admin/events-people.ts` **끝에** 그대로 붙인다:

```ts
// ============================================================================
// 빈칸 채우기(올리기의 「□ 빈칸은 교인명부로 채우기」 · 설계 §2 · CONTRACT §5 「빈칸 채우기 보강」)
// ============================================================================
export type FillReason = "filled" | "not-in-directory" | "same-name" | "no-affiliation" | "different-affiliation"
  | "kid-adult" | "youth-parish" | "nothing-blank";

const KID_POSITIONS = ["학생", "어린이"];

// 적힌 소속과 견줄 명부 소속 — mapChurchPerson 이 정한 것. 못 정했어도 명부 교구 칸이 「새가족」이면 교구 새가족으로 본다
// (새가족의 목장 칸은 연도·월이라 **채우지는** 않지만, 명단에 「새가족」이라 적힌 분과 같은 소속인지는 견줄 수 있다).
function dirAffil(c: ChurchPerson): { who_type: string; group_name: string } | null {
  const a = mapChurchPerson(c);
  if (a) return a;
  return txt(c?.mok1) === "새가족" ? { who_type: "교구", group_name: "새가족" } : null;
}

// cands = 교인명부에서 **이름(name_key)이 같은** 분 모두(서버가 찾아 넘긴다). row 는 다듬은 뒤의 줄
// (올리기에서 교구 칸이 비었던 줄은 who_type 이 "" 일 수 있다 — 빈칸으로 본다).
//   · 명부 전체에서 한 분일 때만 채운다(둘 이상 → same-name · 없으면 not-in-directory).
//     소속이 적힌 줄의 same-name 을 그대로 넣을지(add)는 부르는 쪽(Task 8)이 정한다 — 여기서는 「채우지 않는다」만.
//   · 다른 사람으로 보고 채우지 않는 것(kid-adult · youth-parish):
//     명단은 아이(교회학교 부서 · 직분 학생·어린이 · 교회학교인데 부서 빈칸)인데 명부는 어른 /
//     명단은 교구 줄인데 명부는 교회학교 아이 / 명단은 청년부인데 명부는 교구(가족 교구일 수 있다 — 청년부를 둔다).
//   · 소속이 **비었으면**: 구분·소속·세부(목장) **세 칸을 한 벌로** 명부 값으로 — 적혀 있던 목장은 버린다(다른 교구의 번호일 수 있다).
//     patch 에 who_type·group_name·sub_name 이 늘 함께 있다(sub_name 은 "" 일 수 있다 — 부르는 쪽은 그대로 얹고,
//     적힌 목장과 다르면 「적힌 목장 N 대신 교인명부 목장」을 알린다 · Task 8).
//     명부도 소속을 못 정하면(새가족·임시교구·부서 없는 아이) no-affiliation — 직분만 채우지 않는다(어차피 넣을 수 없는 줄).
//   · 소속이 **적혀 있으면**: 명부 소속(구분·교구/부서)과 같을 때만 빈 목장(교구 줄)·빈 직분을 채운다.
//     다르면 different-affiliation · 명부가 소속을 못 정하면 no-affiliation — 둘 다 **아무것도 채우지 않는다**
//     (같은 이름의 다른 분일 수 있다 — 직분 하나라도 남의 것을 얹지 않는다).
// patch 에 name 은 절대 담지 않는다.
export function fillDecision(
  row: { who_type?: string; group_name?: string; sub_name?: string; name: string; position?: string },
  cands: ChurchPerson[],
): { patch: Partial<Affil & { position: string }> | null; reason: FillReason } {
  if (!cands || cands.length === 0) return { patch: null, reason: "not-in-directory" };
  if (cands.length > 1) return { patch: null, reason: "same-name" };
  const c = cands[0];
  const a = mapChurchPerson(c);
  const pos = positionFromChurch(c);
  const who = legacyNorm(row.who_type), group = txt(row.group_name), sub = txt(row.sub_name), rpos = legacyNorm(row.position);

  const dirKid = KID_KIND2.includes(txt(c?.kind2));
  const rowKid = (who === "교회학교" && group !== "" && group !== "청년부") || KID_POSITIONS.includes(rpos);
  const rowSchoolBlank = who === "교회학교" && group === "";
  const rowParish = who === "교구" && group !== "";
  if ((rowKid && !dirKid) || (rowParish && dirKid) || (rowSchoolBlank && a !== null && a.who_type === "교구")) {
    return { patch: null, reason: "kid-adult" };
  }
  if (who === "교회학교" && group === "청년부" && a !== null && a.who_type === "교구") return { patch: null, reason: "youth-parish" };

  const patch: Partial<Affil & { position: string }> = {};
  if (!group) {
    if (!a) return { patch: null, reason: "no-affiliation" };
    patch.who_type = a.who_type;                       // 소속 한 벌 — 교구를 명부로 정했으면 목장도 명부 것
    patch.group_name = a.group_name;
    patch.sub_name = a.sub_name;
  } else {
    const d = dirAffil(c);
    if (!d) return { patch: null, reason: "no-affiliation" };
    if ((who && who !== d.who_type) || group !== d.group_name) return { patch: null, reason: "different-affiliation" };
    if (who === "교구" && !sub && a !== null && a.sub_name) patch.sub_name = a.sub_name;   // 같은 교구일 때만 빈 목장을
  }
  if (!rpos && pos) patch.position = pos;
  if (Object.keys(patch).length === 0) return { patch: null, reason: "nothing-blank" };
  return { patch, reason: "filled" };
}
```

- [ ] **Step 12: 돌려서 통과를 본다**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events && node --experimental-strip-types --test tests/events-people.test.mjs tests/people-match.test.mjs
```

기대: PASS — `# tests 27` · `# pass 27` · `# fail 0`(events-people 14 + people-match 13).

- [ ] **Step 13: preflight 전체**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events && python tools/preflight.py
```

기대: 마지막 줄 `모두 통과`.

- [ ] **Step 14: 커밋**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events && git add supabase/functions/church-admin/events-people.ts tests/events-people.test.mjs supabase/functions/church-admin/people-match.ts tests/people-match.test.mjs && git diff --cached --stat && git commit -F - <<'EOF'
feat(성경필사): events-people — 교인명부 옮겨 적기·빈칸 채우기 판정 · applicantFromSignup

- mapChurchPerson: 아이는 kind2 먼저(가족 교구·목장으로 보내지 않는다) → 7교구(목장 끝 숫자·남성·없으면 교구만)
  → 청년부·청년공동체·청년새가족 → 부서 · 새가족·임시교구는 null
- positionFromChurch: 대분류 + 명예·은퇴·원로(은퇴협동권사→은퇴권사 · 서리집사은퇴→은퇴집사)
- lookupView: 이름·구분·소속·세부·직분 다섯 칸만
- fillDecision: 명부에 한 분일 때만 · 빈 소속은 구분·소속·세부 한 벌(적힌 목장은 버림) ·
  적힌 소속이 명부와 다르면 아무것도(different-affiliation) · 아이↔어른(kid-adult)·청년부↔교구(youth-parish)
- people-match: applicantFromSignup(명단 줄 → Applicant · 전화 없음) — 교적 표시는 churchFor 그대로

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
git show --stat HEAD
```

기대: `git diff --cached --stat` 에 네 파일 · `명단 검사 통과` · `git show --stat` 에 네 파일(`people-match.ts` 는 더하기만).

---

### Task 4: `events-stats.ts` — 사람 묶음(합집합)·통계·빠른 고르기

**Files:**
- Create: `supabase/functions/church-admin/events-stats.ts`
- Test: `tests/events-stats.test.mjs` (새 파일)

**Interfaces:**
- Consumes: Task 2 `BE_GU` · `paper.ts` `legacyNorm` · `people-match.ts` `nameKey`
- Produces (계약 그대로): `type StatIn` · `personGroups(rows: StatIn[]): number[]` · `quickPick(eventId: string): "소책자" | "사순절" | "썸머" | null` ·
  `statsOf(rows: StatIn[], events: { id; title; closes_on }[], minRepeat?: number): { perEvent; byGroup; repeaters }`
- Produces (더함): `personKey(r): string` · `affLabel(r: { who_type; group_name; sub_name }): string`
- 모양 약속(CONTRACT §5): `repeaters` 한 줄 = `{ n, name, label, times, events }` · `label` = `affLabel(가장 최근 줄)` — **소속만**, Task 5 `evWho` 와 같은 글자
  (「화평 20목장」·「소망 남성」·「중등부」·「(소속 없음)」) · `n` = `personGroups` 순번 + 1(1부터 — Task 5 `evHistory` 의 `groups[].n` 과 같은 셈법) ·
  `events` = 회차 **id** 들(기간 차례 · 화면은 `perEvent` 의 title 로 바꿔 보인다) · `byGroup[].counts` 에는 고른 회차가 모두(0 포함) ·
  `perEvent`·`byGroup` 은 **줄 수**(사람 수가 아니다).
- index.ts 는 `import { statsOf as eventStatsOf } from "./events-stats.ts"` 로만 들여온다(people-query.ts 의 `statsOf` 와 이름이 같다 · Task 5).

- [ ] **Step 0: 선행 확인 — Task 2 · 들여올 이름 · 아직 없는 파일**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
grep -cE '^export const nameKey = ' supabase/functions/church-admin/people-match.ts
grep -cE '^export const legacyNorm = ' supabase/functions/church-admin/paper.ts
ls supabase/functions/church-admin/events-stats.ts tests/events-stats.test.mjs 2>&1 | grep -c "No such file"
node --experimental-strip-types --input-type=module -e "
const m = await import('./supabase/functions/church-admin/events-rules.ts');
if (!Array.isArray(m.BE_GU) || m.BE_GU.length !== 8) throw new Error('Task 2 의 BE_GU 가 없다');
console.log('Task 2 BE_GU 있음');
"
```

기대: `1` · `1` · `2` · `Task 2 BE_GU 있음`. 다르면 **멈춘다**.

- [ ] **Step 1: 시험 ① — 사람 묶음·소속 한 줄·빠른 고르기**

`tests/events-stats.test.mjs` 를 새로 만든다:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  personKey, affLabel, personGroups, quickPick,
} from "../supabase/functions/church-admin/events-stats.ts";
import { legacyNorm } from "../supabase/functions/church-admin/paper.ts";

// 시험 줄 — 가짜 이름만. user_id 는 꼴만 흉내 낸 글자(진짜 UUID 가 아니다).
const S = (event_id, user_id, who_type, group_name, sub_name, name) =>
  ({ event_id, user_id, who_type, group_name, sub_name, name, position: "" });
const NFD = "홍길동".normalize("NFD");

// Task 5 index.ts 의 evWho 를 **글자 그대로** 옮겨 둔다 — affLabel 이 이것과 다르면
// 이력(evHistory groups[].label)과 통계(repeaters[].label)의 소속 글자가 갈린다(CONTRACT §5). evWho 가 바뀌면 함께 바꾼다.
function evWho(r) {
  const g = legacyNorm(r.group_name), s = legacyNorm(r.sub_name);
  if (!g) return "(소속 없음)";
  if (legacyNorm(r.who_type) === "교구" && /^\d+$/.test(s)) return g + " " + s + "목장";
  return s ? g + " " + s : g;
}

test("personKey — 구분·소속·목장 숫자·이름(NFC·띄어쓰기 없음)", () => {
  assert.equal(personKey(S("e", null, "교구", " 화평 ", "07목장", "홍 길동")), "교구|화평|7|홍길동");
  assert.equal(personKey(S("e", null, "교구", "화평", "7", NFD)), "교구|화평|7|홍길동");
  assert.equal(personKey(S("e", null, "교구", "소망", "남성목장", "홍길동")), "교구|소망|남성|홍길동");
  assert.equal(personKey(S("e", null, "교구", "새가족", "", "홍길동")), "교구|새가족||홍길동");
  assert.equal(personKey(S("e", null, "교구", "시험", "0012345678901234567890", "홍길동")), "교구|시험|12345678901234567890|홍길동");
  assert.equal(personKey(S("e", null, "교회학교", "중등부", "1학년", "도하늘")), "교회학교|중등부||도하늘");   // 학년은 넣지 않는다
});

test("affLabel — 소속만 한 줄(evWho 규칙: 교구는 숫자 목장에만 「목장」)", () => {
  const cases = [
    [{ who_type: "교구", group_name: "화평", sub_name: "20" }, "화평 20목장"],
    [{ who_type: "교구", group_name: "소망", sub_name: "남성" }, "소망 남성"],
    [{ who_type: "교구", group_name: "새가족", sub_name: "" }, "새가족"],
    [{ who_type: "교회학교", group_name: "중등부", sub_name: "" }, "중등부"],
    [{ who_type: "교회학교", group_name: "청년부", sub_name: "1" }, "청년부 1"],          // 학년 칸에는 「목장」을 붙이지 않는다
    [{ who_type: "교회학교", group_name: "중등부", sub_name: "3학년" }, "중등부 3학년"],
    [{ who_type: "교구", group_name: " 화평 ", sub_name: " 7 " }, "화평 7목장"],
    [{ who_type: "교구", group_name: "", sub_name: "" }, "(소속 없음)"],
    [{ who_type: "교구", group_name: "", sub_name: "20" }, "(소속 없음)"],                 // 교구가 비면 목장만 보이지 않는다
  ];
  for (const [r, want] of cases) {
    assert.equal(affLabel(r), want, JSON.stringify(r));
    assert.equal(affLabel(r), evWho(r), "evWho 와 같아야 한다 " + JSON.stringify(r));
  }
  assert.ok(!affLabel({ who_type: "교구", group_name: "화평", sub_name: "20", name: "홍길동" }).includes("홍길동"));   // 이름은 넣지 않는다
});

test("personGroups — 다듬은 신원이 같으면 한 묶음(07/7·7목장·띄어쓰기·NFD) · user_id 가 같으면 한 묶음", () => {
  const rows = [
    S("lent-2023", null, "교구", "화평", "07", "홍길동"),
    S("lent-2024", null, "교구", "화평", "7", "홍 길동"),
    S("lent-2025", "user-a", "교구", "화평", "8", "홍길동"),     // 목장을 옮긴 해 — 신원이 달라 따로
    S("lent-2026", "user-a", "교구", "기쁨", "3", "홍길동"),     // 계정이 같아 바로 위와 한 묶음
    S("summer-2025", null, "교구", "화평", "7목장", NFD),
    S("lent-2025", null, "교구", "화평", "20", "김철수"),
  ];
  assert.deepEqual(personGroups(rows), [0, 0, 1, 1, 0, 2]);
});

test("personGroups — 합집합: 계정 없는 해와 계정 있는 해가 이어진다(이어짐이 넘어간다)", () => {
  const rows = [
    S("lent-2023", null, "교구", "화평", "7", "홍길동"),          // 계정 없음
    S("lent-2025", "user-b", "교구", "소망", "1", "홍길동"),      // 계정 있음 · 다른 소속
    S("lent-2026", "user-b", "교구", "화평", "7", "홍길동"),      // 계정 있음 · 첫 줄과 같은 신원 → 셋이 한 묶음
    S("lent-2026", null, "교구", "소망", "1", "도하늘"),
  ];
  assert.deepEqual(personGroups(rows), [0, 0, 0, 1]);
});

test("personGroups — 교회학교는 학년이 달라도 같은 부서·이름이면 한 묶음 · 부서가 다르면 따로", () => {
  const rows = [
    S("lent-2024", null, "교회학교", "중등부", "1", "도하늘"),
    S("lent-2025", null, "교회학교", "중등부", "", "도하늘"),
    S("lent-2026", null, "교회학교", "고등부", "", "도하늘"),
  ];
  assert.deepEqual(personGroups(rows), [0, 0, 1]);
});

test("personGroups — 순번은 처음 나온 차례 · 빈 목록", () => {
  const rows = [
    S("a-1", null, "교구", "화평", "1", "김철수"),
    S("a-1", null, "교구", "화평", "2", "도하늘"),
    S("a-2", null, "교구", "화평", "1", "김철수"),
    S("a-2", null, "교구", "소망", "남성", "홍길동"),
    S("a-3", null, "교구", "소망", "남성목장", "홍길동"),
  ];
  assert.deepEqual(personGroups(rows), [0, 1, 0, 2, 2]);
  assert.deepEqual(personGroups([]), []);
});

test("quickPick — id 앞글자로(소책자를 사순절보다 먼저)", () => {
  assert.equal(quickPick("lent-booklet-2024"), "소책자");
  assert.equal(quickPick("lent-booklet-2025"), "소책자");
  assert.equal(quickPick("lent-2022"), "사순절");
  assert.equal(quickPick("lent-2026"), "사순절");
  assert.equal(quickPick("summer-2024"), "썸머");
  assert.equal(quickPick("summer-2026"), "썸머");
  assert.equal(quickPick("autumn-2026"), null);
  assert.equal(quickPick("ca-test-1727590000000"), null);
  assert.equal(quickPick("lent"), null);
  assert.equal(quickPick(""), null);
});
```

- [ ] **Step 2: 돌려서 실패를 본다**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events && node --experimental-strip-types --test tests/events-stats.test.mjs
```

기대: FAIL — `ERR_MODULE_NOT_FOUND` … `events-stats.ts`, `# tests 1` · `# fail 1`.

- [ ] **Step 3: 모듈 ① — `events-stats.ts` 를 만든다**

```ts
// 성경필사(암송) — 사람 묶음(합집합) · 통계 · 빠른 고르기(순수 함수 · 2026-09-29)
//   설계: 성경암송 저장소 docs/superpowers/specs/2026-09-29-church-admin-bible-events-design.md §2
//   「사람 묶음(이력·통계) — 근삿값임을 화면에 적는다」 · 「통계의 빠른 고르기」.
//   서버(Deno, index.ts)와 시험(Node, tests/events-stats.test.mjs)이 **같은 파일**을 읽는다(authz.ts 와 같은 제약).
//
// ⚠️ 묶음 이름표는 **순번**만 쓴다. user_id 를 이름표·열쇠로 응답에 실으면 그것 하나로 그분 행세가 된다
//    (성경암송 api 는 JWT 없이 user_id 를 믿는다 — CLAUDE.md 「보안」).
// ⚠️ index.ts 는 이미 people-query.ts 의 statsOf(교인명부 현황)를 들여온다 — 이 파일의 statsOf 는
//    `import { statsOf as eventStatsOf } from "./events-stats.ts"` 로만 들여온다(CONTRACT §5).
import { BE_GU } from "./events-rules.ts";
import { legacyNorm } from "./paper.ts";
import { nameKey } from "./people-match.ts";

export type StatIn = { event_id: string; user_id: string | null; who_type: string; group_name: string; sub_name: string; name: string; position: string };

// 다듬은 신원 — 구분 · 소속(NFC·띄어쓰기 없음) · 목장 숫자(「07」·「7목장」→7 · 「남성」) · 이름(NFC·띄어쓰기 없음).
// 교회학교는 학년을 넣지 않는다 — 해마다 바뀌고 표기도 제각각이라(「1」·「1학년」·빈칸) 같은 아이가 해마다 갈라진다.
export function personKey(r: { who_type: string; group_name: string; sub_name: string; name: string }): string {
  const who = legacyNorm(r.who_type);
  let sub = "";
  if (who !== "교회학교") {
    const s = nameKey(r.sub_name);
    const m = /^(\d+)(목장)?$/.exec(s);
    sub = /남성/.test(s) ? "남성" : m ? m[1].replace(/^0+(?=\d)/, "") : s;
  }
  return [who, nameKey(r.group_name), sub, nameKey(r.name)].join("|");
}

// 소속 한 줄(**소속만** — 이름은 넣지 않는다) — 서버 evWho(Task 5 index.ts)와 글자까지 같은 규칙:
//   교구 줄은 목장이 숫자일 때만 「목장」 · 소속(교구·부서)이 비면 「(소속 없음)」.
//   「화평 20목장」 · 「소망 남성」 · 「새가족」 · 「중등부」 · 「중등부 3학년」 · 「(소속 없음)」
//   통계의 repeaters[].label 과 이력(evHistory)의 groups[].label(`${이름} · ${소속}`)이 같은 글자를 쓰게 — CONTRACT §5.
export function affLabel(r: { who_type: string; group_name: string; sub_name: string }): string {
  const g = legacyNorm(r.group_name), s = legacyNorm(r.sub_name);
  if (!g) return "(소속 없음)";
  if (legacyNorm(r.who_type) === "교구" && /^\d+$/.test(s)) return g + " " + s + "목장";
  return s ? g + " " + s : g;
}

// 줄마다 사람 묶음 순번(0부터, 처음 나온 차례). **user_id 가 같거나 다듬은 신원이 같으면** 한 묶음 —
// 합집합이라 「계정 없던 해(이관 줄) — 계정 있는 해(앱 줄)」가 한 사람으로 이어진다.
// 같은 분이 해마다 목장을 옮겼으면 둘로 셀 수 있다(근삿값 — 화면에 적는다).
export function personGroups(rows: StatIn[]): number[] {
  const parent = rows.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  };
  const join = (a: number, b: number): void => {
    const x = find(a), y = find(b);
    if (x !== y) parent[Math.max(x, y)] = Math.min(x, y);
  };
  const byUser = new Map<string, number>(), byKey = new Map<string, number>();
  rows.forEach((r, i) => {
    const u = r.user_id ? String(r.user_id) : "";
    if (u) {
      const j = byUser.get(u);
      if (j === undefined) byUser.set(u, i); else join(i, j);
    }
    const k = personKey(r);
    const j2 = byKey.get(k);
    if (j2 === undefined) byKey.set(k, i); else join(i, j2);
  });
  const label = new Map<number, number>();
  return rows.map((_, i) => {
    const root = find(i);
    if (!label.has(root)) label.set(root, label.size);
    return label.get(root) as number;
  });
}

// 통계의 빠른 고르기 — id 앞글자로. 셋에 안 드는 회차(가을 말씀 동행 등)는 개별로만 고른다.
// ⚠️ 「lent-booklet-」 을 「lent-」 보다 먼저 본다(소책자도 lent- 로 시작한다).
export function quickPick(eventId: string): "소책자" | "사순절" | "썸머" | null {
  const id = String(eventId ?? "");
  if (id.startsWith("lent-booklet-")) return "소책자";
  if (id.startsWith("lent-")) return "사순절";
  if (id.startsWith("summer-")) return "썸머";
  return null;
}
```

- [ ] **Step 4: 돌려서 통과를 본다**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events && node --experimental-strip-types --test tests/events-stats.test.mjs
```

기대: PASS — `# tests 7` · `# pass 7` · `# fail 0`.

- [ ] **Step 5: 시험 ② — 통계를 파일 끝에 붙인다**

맨 위 import 블록은 **고치지 않는다.** 아래 묶음을 `tests/events-stats.test.mjs` **끝에** 그대로 붙인다(앞에 빈 줄 하나 · `S` 는 ① 묶음의 것):

```js
// ── 통계 ───────────────────────────────────────────────────────────
import { statsOf } from "../supabase/functions/church-admin/events-stats.ts";

// 일부러 기간 차례가 아니게 준다 — statsOf 가 closes_on 으로 줄 세우는지 본다
const EVS = [
  { id: "lent-2026", title: "2026 사순절", closes_on: "2026-04-04" },
  { id: "lent-2025", title: "2025 사순절", closes_on: "2025-04-19" },
  { id: "summer-2025", title: "2025 썸머", closes_on: "2025-08-31" },
];
const ROWS = [
  S("lent-2025", null, "교구", "화평", "7", "홍길동"),
  S("summer-2025", "user-a", "교구", "화평", "7", "홍길동"),
  S("lent-2026", "user-a", "교구", "화평", "8", "홍길동"),     // 목장을 옮겼지만 계정으로 이어진다
  S("lent-2025", null, "교구", "기쁨", "3", "김철수"),
  S("lent-2026", null, "교구", "기쁨", "3", "김철수"),
  S("summer-2025", null, "교회학교", "중등부", "", "도하늘"),
  S("lent-2026", null, "교회학교", "청년부", "", "박하나"),
  S("lent-2026", null, "교구", "평화", "1", "최바다"),        // 모르는 교구 이름 → 뒤로
  S("lent-2024", null, "교구", "화평", "7", "홍길동"),        // 고르지 않은 회차 → 세지 않는다
  S("lent-2026", null, "교구", "", "", "오한결"),            // 소속 없음 → 뒤로
  S("summer-2025", null, "교구", "믿음", "2", "윤바다"),
];
const Z = (a, b, c) => ({ "lent-2025": a, "summer-2025": b, "lent-2026": c });

test("statsOf — 회차별 인원(기간 차례 · 고르지 않은 회차의 줄은 빼고)", () => {
  assert.deepEqual(statsOf(ROWS, EVS).perEvent, [
    { id: "lent-2025", title: "2025 사순절", count: 2 },
    { id: "summer-2025", title: "2025 썸머", count: 3 },
    { id: "lent-2026", title: "2026 사순절", count: 5 },
  ]);
});

test("statsOf — 교구(부서) × 회차: 교구 차례 → 부서 가나다 → 모르는 이름 · 모든 회차 칸(0 포함)", () => {
  assert.deepEqual(statsOf(ROWS, EVS).byGroup, [
    { who_type: "교구", group_name: "믿음", counts: Z(0, 1, 0), total: 1 },
    { who_type: "교구", group_name: "화평", counts: Z(1, 1, 1), total: 3 },
    { who_type: "교구", group_name: "기쁨", counts: Z(1, 0, 1), total: 2 },
    { who_type: "교회학교", group_name: "중등부", counts: Z(0, 1, 0), total: 1 },
    { who_type: "교회학교", group_name: "청년부", counts: Z(0, 0, 1), total: 1 },
    { who_type: "교구", group_name: "", counts: Z(0, 0, 1), total: 1 },
    { who_type: "교구", group_name: "평화", counts: Z(0, 0, 1), total: 1 },
  ]);
});

test("statsOf — 여러 번 참여한 분 { n, name, label, times, events }(기본 3회 이상 · 이름·소속은 가장 최근 회차 줄)", () => {
  assert.deepEqual(statsOf(ROWS, EVS).repeaters, [
    { n: 1, name: "홍길동", label: "화평 8목장", times: 3, events: ["lent-2025", "summer-2025", "lent-2026"] },
  ]);
  assert.deepEqual(statsOf(ROWS, EVS, 2).repeaters, [
    { n: 1, name: "홍길동", label: "화평 8목장", times: 3, events: ["lent-2025", "summer-2025", "lent-2026"] },
    { n: 2, name: "김철수", label: "기쁨 3목장", times: 2, events: ["lent-2025", "lent-2026"] },
  ]);
  // label 은 소속만 — 이름은 name 칸에만(화면은 「이름 · 소속」 · CSV 는 「이름」「소속」 두 칸)
  for (const r of statsOf(ROWS, EVS, 1).repeaters) assert.ok(!r.label.includes(r.name), r.label);
  // 기본값을 깨는 값은 3 으로
  assert.equal(statsOf(ROWS, EVS, 0).repeaters.length, 1);
  assert.equal(statsOf(ROWS, EVS, "x").repeaters.length, 1);
});

test("statsOf — 같은 회차에 두 줄이어도 한 번으로 · 같은 횟수는 이름 차례", () => {
  const rows = [
    S("lent-2025", null, "교구", "소망", "1", "도하늘"),
    S("lent-2025", null, "교구", "소망", "01", "도하늘"),       // 같은 회차 중복 줄
    S("lent-2026", null, "교구", "소망", "1", "도하늘"),
    S("lent-2025", null, "교구", "기쁨", "3", "김철수"),
    S("summer-2025", null, "교구", "기쁨", "3", "김철수"),
  ];
  const r = statsOf(rows, EVS, 2).repeaters;
  assert.deepEqual(r.map((x) => [x.name, x.times]), [["김철수", 2], ["도하늘", 2]]);
  assert.deepEqual(r[1].events, ["lent-2025", "lent-2026"]);
  assert.equal(r[1].label, "소망 1목장");
});

test("statsOf — user_id 를 내보내지 않는다 · 빈 입력", () => {
  const s = JSON.stringify(statsOf(ROWS, EVS, 1));
  assert.ok(!s.includes("user-a"));
  assert.ok(!s.includes("user_id"));
  assert.deepEqual(statsOf([], EVS), {
    perEvent: [
      { id: "lent-2025", title: "2025 사순절", count: 0 },
      { id: "summer-2025", title: "2025 썸머", count: 0 },
      { id: "lent-2026", title: "2026 사순절", count: 0 },
    ],
    byGroup: [],
    repeaters: [],
  });
  assert.deepEqual(statsOf(ROWS, []), { perEvent: [], byGroup: [], repeaters: [] });
});
```

- [ ] **Step 6: 돌려서 실패를 본다**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events && node --experimental-strip-types --test tests/events-stats.test.mjs
```

기대: FAIL — `does not provide an export named 'statsOf'`, `# tests 1` · `# fail 1`.

- [ ] **Step 7: 모듈 ② — `statsOf` 를 파일 끝에 붙인다**

`supabase/functions/church-admin/events-stats.ts` **끝에** 그대로 붙인다:

```ts
// 글자 차례(코드 포인트) — 한글 완성형은 이 차례가 곧 가나다 차례다. localeCompare 는 Deno·Node 의 ICU 에 따라 달라질 수 있어 쓰지 않는다.
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

// 고른 회차들의 통계 — 모두 **숫자와 이름·소속**만(user_id·ident_key 는 내보내지 않는다 · StatIn 의 user_id 는 묶기에만).
//   perEvent  : 회차별 인원(줄 수) — 기간 차례(closes_on 오름차순, 같으면 id)
//   byGroup   : 교구(부서) × 회차 — 교구는 BE_GU 차례 → 교회학교 부서(가나다) → 모르는 이름(가나다)
//               counts 에는 고른 회차가 **모두** 들어 있다(없으면 0)
//   repeaters : 여러 번 참여한 분 — 사람 묶음(personGroups)마다 **서로 다른 회차 수** ≥ minRepeat(기본 3), 많은 차례 → 이름 → 순번.
//               한 줄 = { n, name, label, times, events } — name·label 은 가장 최근 회차의 줄에서,
//               label 은 소속만(affLabel · 「화평 20목장」) · 화면은 「이름 · 소속」, CSV 는 「이름」「소속」 두 칸.
//               events 는 회차 id 들(기간 차례 — 화면이 perEvent 의 title 로 바꿔 보인다).
//               n = personGroups 순번 + 1(1부터 — evHistory 의 groups[].n 과 같은 셈법 · user_id 대신 쓰는 이름표).
// rows 중 events 에 없는 회차의 줄은 세지 않는다.
export function statsOf(rows: StatIn[], events: { id: string; title: string; closes_on: string }[], minRepeat?: number): {
  perEvent: { id: string; title: string; count: number }[];
  byGroup: { who_type: string; group_name: string; counts: Record<string, number>; total: number }[];
  repeaters: { n: number; name: string; label: string; times: number; events: string[] }[];
} {
  const min = Number.isInteger(minRepeat) && (minRepeat as number) >= 1 ? (minRepeat as number) : 3;
  const evs = [...events].sort((a, b) => cmp(String(a.closes_on), String(b.closes_on)) || cmp(a.id, b.id));
  const order = new Map<string, number>(evs.map((e, i) => [e.id, i]));
  const use = rows.filter((r) => order.has(r.event_id));

  const perEvent = evs.map((e) => ({ id: e.id, title: e.title, count: use.filter((r) => r.event_id === e.id).length }));

  const bag = new Map<string, { who_type: string; group_name: string; counts: Record<string, number>; total: number }>();
  for (const r of use) {
    const who = legacyNorm(r.who_type), g = legacyNorm(r.group_name);
    const k = who + "|" + g;
    let b = bag.get(k);
    if (!b) {
      b = { who_type: who, group_name: g, counts: Object.fromEntries(evs.map((e) => [e.id, 0])), total: 0 };
      bag.set(k, b);
    }
    b.counts[r.event_id] += 1;
    b.total += 1;
  }
  const rank = (b: { who_type: string; group_name: string }): number[] => {
    if (b.who_type === "교구" && BE_GU.includes(b.group_name)) return [0, BE_GU.indexOf(b.group_name)];
    if (b.who_type === "교회학교" && b.group_name) return [1, 0];
    return [2, 0];
  };
  const byGroup = [...bag.values()].sort((a, b) => {
    const ra = rank(a), rb = rank(b);
    return ra[0] - rb[0] || ra[1] - rb[1] || cmp(a.group_name, b.group_name) || cmp(a.who_type, b.who_type);
  });

  const grp = personGroups(use);
  const members = new Map<number, number[]>();
  grp.forEach((g, i) => {
    const list = members.get(g);
    if (list) list.push(i); else members.set(g, [i]);
  });
  const ord = (i: number): number => order.get(use[i].event_id) as number;
  const repeaters: { n: number; name: string; label: string; times: number; events: string[] }[] = [];
  for (const [n, idx] of members) {
    const ids = [...new Set(idx.map((i) => use[i].event_id))].sort((a, b) => (order.get(a) as number) - (order.get(b) as number));
    if (ids.length < min) continue;
    const latest = idx.reduce((best, i) => (ord(i) >= ord(best) ? i : best), idx[0]);
    repeaters.push({ n: n + 1, name: legacyNorm(use[latest].name), label: affLabel(use[latest]), times: ids.length, events: ids });
  }
  repeaters.sort((a, b) => b.times - a.times || cmp(a.name, b.name) || a.n - b.n);

  return { perEvent, byGroup, repeaters };
}
```

- [ ] **Step 8: 돌려서 통과를 본다**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events && node --experimental-strip-types --test tests/events-stats.test.mjs tests/events-rules.test.mjs tests/events-people.test.mjs tests/people-match.test.mjs
```

기대: PASS — `# tests 70` · `# pass 70` · `# fail 0`(stats 12 + rules 31 + people 14 + people-match 13).

- [ ] **Step 9: preflight 전체**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events && python tools/preflight.py
```

기대: 마지막 줄 `모두 통과`.

- [ ] **Step 10: 커밋**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events && git add supabase/functions/church-admin/events-stats.ts tests/events-stats.test.mjs && git diff --cached --stat && git commit -F - <<'EOF'
feat(성경필사): events-stats — 사람 묶음(합집합)·통계·빠른 고르기

- personGroups: user_id 가 같거나 다듬은 신원(구분·소속·목장 숫자·이름 NFC·띄어쓰기 없음)이 같으면 한 묶음
  (합집합 — 계정 없던 해와 있는 해가 이어진다) · 이름표는 순번만(user_id 를 싣지 않는다)
- statsOf: 회차별 인원(기간 차례) · 교구 차례 → 부서 가나다 → 모르는 이름 · 여러 번 참여(기본 3회)
  { n, name, label, times, events } — label 은 소속만(affLabel = evWho 와 같은 글자 · 「화평 20목장」)
- quickPick: lent-booklet- 소책자 · lent- 사순절 · summer- 썸머

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
git show --stat HEAD
```

기대: `git diff --cached --stat` 에 두 파일 · `명단 검사 통과` · `git show --stat` 에 두 파일.


### Task 5: 역할 SQL 004 · 읽기 액션 넷(evEvents·evRoster·evHistory·evStats) · 권한 · 개발 시험

이 과제가 끝나면 역할 `bibleevent` 담당자가 회차 목록·한 회차 명단(교적 표시 포함)·사람별 이력·통계를 **읽을** 수 있다(화면은 아직 없다 — Task 10·12).
쓰기 액션(Task 6~8)이 기대는 공용 도움 함수(`evOut`·`rowOut`·`evRead`·`evCountMap`·`evWho`·`EV_COLS`·`EV_ROW_COLS`)와 개발 시험의 시험 회차·사람·누출 시험 틀도 여기서 만든다.

모든 명령은 워크트리 `C:\Projects\church-admin\.worktrees\bible-events` 에서 한다(Git Bash 는 부를 때마다 처음 폴더로 돌아가니 블록마다 `cd /c/Projects/church-admin/.worktrees/bible-events` 로 시작한다).
기준점은 church-admin main `a2dfd7c`(`js/core/picker.js` 합쳐진 뒤)이다. **줄 번호로 찾지 않는다** — 고칠 자리는 모두 「앵커 글」로 찾고, 고치기 전에 그 앵커가 **한 번만** 나오는지 `grep -cF` 로 본다(1 이 아니면 멈추고 그 자리를 눈으로 확인한다 — 다른 세션이 main 을 계속 고친다).
기존 `import` 줄은 **다시 쓰지 않는다**. 이 과제의 이름은 **새 import 문 세 줄**로 더한다(기존 `people-query.ts` 줄의 `sortOrder`·`FILTER_KEYS` 등은 그대로 — 그 줄을 덮어쓰면 교인명부 찾기·내려받기가 500 이 된다).

**Files:**
- Create: `supabase/sql/004_bibleevent_role.sql`
- Modify: `supabase/functions/church-admin/authz.ts` — 앵커 `  peopleExport: "directory",` 바로 다음에 bibleevent 넷
- Modify: `supabase/functions/church-admin/index.ts` — 앵커 `from "./people-query.ts";` 줄 바로 다음에 새 import 셋 · 앵커 `Deno.serve(async (req) => {` 바로 앞에 새 절(도움 함수 + 읽기 액션 넷) · 앵커 `      case "peopleExport": return json(await peopleExport(ctx, b));` 바로 다음에 case 넷
- Test: `tests/authz.test.mjs` — ministry·directory 블록에 한 줄씩 · `knownRoles` 기대값 · 새 bibleevent 블록(앵커 `test("norm — 공백·자모분리(NFD)", () => {` 앞)
- Test: `tests/server.dev.test.mjs` — 상수 · PROBE · 전역 · before() 두 곳 · after() 한 단계 · 권한 표 · 파일 끝에 새 시험 여섯(앵커는 Step 7 표)

**Interfaces:**
- Consumes:
  - Task 2 `events-rules.ts`: `EVT_ID_RE` · `evtListable(ev, today)` · `kstToday(now?)` · `BE_BAD_CHARS` · `BE_FIELD_MAX` · **`isEligEvent(needs: unknown): boolean`**(CONTRACT 5절 — 자격 회차 판정은 이 함수 하나. `needs` 를 받는다, 회차 줄이 아니다)
  - Task 3 `people-match.ts`: `applicantFromSignup(r)` · 기존 `nameKey` · `type Church`(기존 `churchFor` 는 이미 index.ts 에 들어와 있다 — 다시 들이지 않는다)
  - Task 4 `events-stats.ts`: `personGroups(rows): number[]` · `statsOf(rows, events, minRepeat?)` · `type StatIn`. ⚠️ index.ts 에 이미 `people-query.ts` 의 `statsOf`(교인명부 현황)가 있어 **`statsOf as eventStatsOf`** 로만 들인다. `repeaters[]` 한 줄 = `{ n, name, label, times, events }` · `label` 은 **소속만**, 아래 `evWho` 와 같은 꼴(CONTRACT 5절 — Step 1 이 확인한다)
  - 기존 index.ts: `db` · `json` · `allRows(build)` · `kstDay(iso)` · `peopleSource()` · `churchLookup(names)` · `legacyNorm`(paper.ts 에서 이미 들어와 있다)
- Produces:
  - DB: `admin_roles` 한 줄 `('bibleevent', '성경필사(암송)', …)` (개발)
  - `authz.ts` `ACTION_ROLES`: `evEvents`·`evRoster`·`evHistory`·`evStats` → `"bibleevent"`
  - index.ts 새 import 셋(이 이름들은 **Task 6~8 이 다시 들이지 않는다** — 같은 이름을 두 번 들이면 개발 배포가 실패한다. Task 6~8 은 자기에게 새로운 이름만 **새 import 문**으로 이 세 줄 아래에 더한다):
    `applicantFromSignup, nameKey, type Church` (people-match.ts) · `BE_BAD_CHARS, BE_FIELD_MAX, EVT_ID_RE, evtListable, isEligEvent, kstToday` (events-rules.ts) · `personGroups, statsOf as eventStatsOf, type StatIn` (events-stats.ts)
  - index.ts 도움 함수(Task 6~8 이 그대로 쓴다):
    - `EV_COLS` = `"id,title,short_title,subtitle,season,kind,status,opens_on,closes_on,list_until,updated_at,needs"`
    - `EV_ROW_COLS` = `"id,event_id,user_id,who_type,group_name,sub_name,name,position,note,source,created_at,updated_at"` — **줄 칸 목록은 이것 하나**(Task 7·8 은 두 번째 목록을 만들지 않는다). 줄을 넣고 고친 뒤 `.select(EV_ROW_COLS)` 로 받아 `rowOut` 에 넘긴다
    - `evOut(ev, count: number): EvEventOut` = `{id,title,short_title,subtitle,season,kind,status,opens_on,closes_on,list_until,updated_at,count,listedNow,hasEligibility}` — `hasEligibility = isEligEvent(ev.needs)`
    - `rowOut(r, church: Church | null): RowOut` = `{id,who_type,group,sub,name,position,note,source,hasUser,at,updated_at,church}` — `at` 은 KST 「YYYY-MM-DD」, `updated_at` 은 DB 문자열 그대로(expect 로 되돌아온다)
    - `evRead(id: unknown): Promise<events 한 줄 | null>` — `EV_COLS`(**needs·updated_at 포함**) · 모양이 틀린 id 는 묻지 않고 `null`
    - `evCountMap(ids: string[]): Promise<Map<string, number>>` — head 개수(`(await evCountMap([id])).get(id) ?? 0`)
    - `evWho(r): string` — 「화평 20목장」·「소망 남성」·「청년부」·「중등부 3학년」 · 교구 줄의 **숫자 목장에만** 「목장」 · 소속이 비면 「(소속 없음)」
    - ⚠️ `evElig` 는 **없다**(대조 뒤 결정) — 자격 회차는 어디서나 `isEligEvent(ev.needs)`, 측정 시작일은 `eligibilityStart(ev.needs)`(Task 6 이 들인다)
  - 액션: `evEvents {}` → `{ok, today, events:[EvEventOut]}` · `evRoster {event_id}` → `{ok, event, source:{date,total}|null, rows:[RowOut]}`(없는·틀린 id 는 `not-found`) · `evHistory {name}` → `{ok, groups:[{n, label, rows:[{event_id,title,closes_on,who_type,group,sub,position,source,hasUser}]}]}` · `label` = `` `${이름} · ${evWho(가장 최근 줄)}` ``(오류 `no-name`·`bad-char`·`too-long`) · `evStats {event_ids}` → `{ok, ...statsOf 결과}`(빈 배열 = 전부 · 없는 id 는 조용히 빠짐 · 배열이 아니거나 모양이 틀리거나 100개 넘으면 `bad-event-id`)
  - `tests/server.dev.test.mjs`: 사람 `people.bibleevent` · `want()` 의 bibleevent 칸 · 상수 `EV_ID`·`EV_EL_ID`·`EV_NAME`·`EV_APP_NAME`·`EV_PHONE`·`EV_MEMO`·`EV_ANSWER`·`EV_OUT_KEYS`·`ROW_OUT_KEYS`·`HIST_ROW_KEYS` · 전역 `evTestUserId` · 도움 `dbCount(eventId)` · 시험 회차(아래 표)
  - 시험 회차 이름 규칙(Task 6~8 도 따른다): id 는 **`ca-test-` 로 시작하고 `STAMP` 를 담는다**. `after()` 가 `events?id=like.ca-test-*<STAMP>*` 로 이번 실행의 회차를 모두 지운다(줄은 CASCADE). `before()` 는 **한 시간 넘은** `ca-test-*` 회차만 지운다(다른 세션이 개발에서 같은 시험을 돌리는 중이어도 그 회차를 건드리지 않게).

시험 회차(before() 에서 만든다 — 둘 다 `draft` 라 성도님 화면에 안 보인다):

| 회차 | 줄 | 교적 표시 |
|---|---|---|
| `EV_ID` = `ca-test-<STAMP>` (2000-01-01~01-31) | ① 교구·시험·0·`ca-test-min`·집사·메모 「담당자가 더함」 | 맞음(명부 990000001 = 시험-0목장) |
| | ② 교구·시험·3·`DIR_NAME`·권사 | 확인 필요 「같은 이름 1명」(명부는 시험B) |
| | ③ 교구·시험·7·`EV_NAME` | 없음 |
| | ④ 교회학교·청년부·(빈칸)·`EV_NAME` | 없음 |
| | ⑤ **앱 줄** 교구·시험·0·`EV_APP_NAME` — `user_id`=시험 users · 전화 `EV_PHONE` · memo `EV_MEMO` · answers `{q:EV_ANSWER}` | 없음 |
| `EV_EL_ID` = `ca-test-el-<STAMP>` (2000-02-01~02-28 · `needs.eligibility` 있음) | ⑥ 교구·시험·7·`EV_NAME`·메모 「명단 올리기」(③과 같은 분) | — |

시험 안에서 잠깐 만드는 회차: `ca-test-rep-<STAMP>`(통계 시험 · 끝에 스스로 지운다) · `ca-test-big-<STAMP>`(1,000행 시험 · after() 가 지운다).

⚠️ Task 6~8 의 개발 시험은 이 과제의 시험들 **뒤에** 붙인다(node:test 는 파일 차례로 돈다). `EV_ID` 의 줄 수(5)·`EV_EL_ID` 의 줄 수(1)를 바꾸는 시험은 자기 회차(`ca-test-<무엇>-<STAMP>`)를 새로 만들어 쓴다.

- [ ] **Step 1: 선행 확인 — 기준점 · Task 2~4 의 이름과 모양**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
git merge-base --is-ancestor a2dfd7c HEAD && echo "기준점 a2dfd7c 이후"
node --experimental-strip-types --input-type=module <<'EOF'
const R = await import('./supabase/functions/church-admin/events-rules.ts');
const S = await import('./supabase/functions/church-admin/events-stats.ts');
const P = await import('./supabase/functions/church-admin/people-match.ts');
const need = [
  [R, 'events-rules.ts', ['EVT_ID_RE', 'evtListable', 'kstToday', 'BE_BAD_CHARS', 'BE_FIELD_MAX', 'isEligEvent']],
  [S, 'events-stats.ts', ['personGroups', 'statsOf']],
  [P, 'people-match.ts', ['applicantFromSignup', 'churchFor', 'nameKey']],
];
for (const [m, f, ks] of need) for (const k of ks) if (typeof m[k] === 'undefined') throw new Error(f + ' 에 ' + k + ' 가 없다');
// 자격 회차 판정은 needs 를 받는다(회차 줄이 아니다 — CONTRACT 5절)
if (R.isEligEvent({ eligibility: { start: '2000-02-01' } }) !== true || R.isEligEvent({ position: true }) !== false
  || R.isEligEvent(null) !== false) throw new Error('isEligEvent(needs) 모양이 CONTRACT 5절과 다르다');
// 여러 번 참여한 분 한 줄 = { n, name, label(소속만 · 숫자 목장에 「목장」), times, events } — CONTRACT 5절
const evs = ['t-a', 't-b', 't-c'].map((id, i) => ({ id, title: id, closes_on: '2000-0' + (i + 1) + '-01' }));
const rows = evs.map((e) => ({ event_id: e.id, user_id: null, who_type: '교구', group_name: '화평', sub_name: '20', name: '홍길동', position: '' }));
const rep = S.statsOf(rows, evs).repeaters;
if (rep.length !== 1 || rep[0].name !== '홍길동' || rep[0].label !== '화평 20목장' || rep[0].times !== 3)
  throw new Error('statsOf repeaters 가 CONTRACT 5절과 다르다: ' + JSON.stringify(rep));
const a = P.applicantFromSignup({ who_type: '교구', group_name: '화평', sub_name: '20', name: '홍길동' });
if (a.type !== '교구' || a.gu !== '화평' || a.mok !== 20 || a.phone !== '') throw new Error('applicantFromSignup: ' + JSON.stringify(a));
console.log('선행 이름·모양 모두 있음');
EOF
```
Expected: `기준점 a2dfd7c 이후` · `선행 이름·모양 모두 있음` (ExperimentalWarning 한 줄은 괜찮다). 하나라도 틀리면 **멈추고** 그 과제부터 끝낸다 — 없는 이름을 들여도 배포는 되고, 함수가 뜰 때 모든 요청이 500 이 된다. 이름표(`label`)가 「화평 20」이면 Task 4 가 대조 뒤 결정(5절)을 아직 안 따른 것이다.

- [ ] **Step 2: 역할 SQL — `supabase/sql/004_bibleevent_role.sql` 만들기**

```sql
-- 교회 어드민 — 성경필사(암송) 역할 (2026-09-29 · 설계 v2 docs/superpowers/specs/2026-09-29-church-admin-bible-events-design.md)
-- ⚠️ 개발(ktpwthwqzgcqcrmsafdo) 먼저, 그다음 운영(xnomlgydifiqiybervtf · 여는 날 Task 15).
-- ⚠️ 이 파일은 역할 한 줄뿐이다. 명단 표(events·event_signups)는 성경암송 앱의 것 — 칸·제약·RLS 를 바꾸지 않는다.
--    새 표·뷰·함수·정책이 없어 authenticated 노출도 늘지 않는다(운영에서는 그래도 check-authenticated-exposure.sql 0행 확인).
-- ⚠️ 역할 id 는 pilsa 가 아니다 — 성경암송 「필사 노트 신청」(pilsa_orders·pilsaApply)이 이미 쓰는 이름이다.
-- 여러 번 돌려도 안전하다(on conflict do nothing).
begin;

insert into admin_roles (id, label, description) values
  ('bibleevent', '성경필사(암송)', '성경필사·암송 이벤트 명단 보기 · 고치기 · 올리기 · 통계')
on conflict (id) do nothing;

commit;

select 'role bibleevent' as t, count(*) from admin_roles where id = 'bibleevent'
union all select 'label 성경필사(암송)', count(*) from admin_roles where id = 'bibleevent' and label = '성경필사(암송)';
```

- [ ] **Step 3: 개발 DB 에 돌리기(개발 먼저)**

```bash
cat ~/.church-admin/supa-dev/supabase/.temp/project-ref; echo      # ktpwthwqzgcqcrmsafdo 여야 한다 — 다르면 멈춘다
supabase --workdir ~/.church-admin/supa-dev db query --linked "select count(*) from users"   # 스물 남짓 = 개발(사백이 넘으면 운영 — 멈춘다)
supabase --workdir ~/.church-admin/supa-dev db query --linked -f C:/Projects/church-admin/.worktrees/bible-events/supabase/sql/004_bibleevent_role.sql
```
Expected: 마지막 표에 `role bibleevent | 1` · `label 성경필사(암송) | 1`. 한 번 더 돌려도 똑같이 1·1(겹쳐 들어가지 않는다).
⚠️ `-f` 는 **절대 경로**(작업 폴더 기준으로 풀린다). 운영(`supa-prod`)에는 이 과제에서 돌리지 않는다.

- [ ] **Step 4: 실패하는 권한 시험 — `tests/authz.test.mjs`(앵커 넷)**

먼저 앵커가 한 번씩만 있는지 본다:

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
T=tests/authz.test.mjs
for a in '    [{ status: "active", roles: [] }, "forbidden"],' \
         '  assert.deepEqual(knownRoles(), ["directory", "ministry", "super"]);' \
         '    [{ status: "disabled", roles: ["directory"] }, "disabled"],' \
         'test("norm — 공백·자모분리(NFD)", () => {'; do
  printf '%s  ← %s\n' "$(grep -cF -- "$a" $T)" "$a"; done
```
Expected: 네 줄 모두 `1  ← …`. (`[{ status: "active", roles: ["ministry"] }, "forbidden"],` 는 super·directory 블록에 두 번 나와 앵커로 쓰지 않는다.)

**4-1.** ministry 블록 — `    [{ status: "active", roles: [] }, "forbidden"],` **바로 다음 줄에**:

```js
    [{ status: "active", roles: ["bibleevent"] }, "forbidden"],
```

**4-2.** `  assert.deepEqual(knownRoles(), ["directory", "ministry", "super"]);` 줄을 **이것으로 바꾼다**:

```js
  assert.deepEqual(knownRoles(), ["bibleevent", "directory", "ministry", "super"]);
```

**4-3.** directory 블록 — `    [{ status: "disabled", roles: ["directory"] }, "disabled"],` **바로 다음 줄에**:

```js
    [{ status: "active", roles: ["bibleevent"] }, "forbidden"],
```

**4-4.** `test("norm — 공백·자모분리(NFD)", () => {` 줄 **바로 앞에** 새 시험 하나(뒤에 빈 줄 하나):

```js
test("bibleevent(성경필사(암송)) 액션 × 사람 — 이 역할·총괄만 통과, 사역·교인명부 담당은 막힘", () => {
  const cases = [
    [null, "not-registered"],
    [{ status: "pending", roles: ["bibleevent"] }, "pending"],
    [{ status: "disabled", roles: ["bibleevent"] }, "disabled"],
    [{ status: "active", roles: [] }, "forbidden"],
    [{ status: "active", roles: ["ministry"] }, "forbidden"],
    [{ status: "active", roles: ["directory"] }, "forbidden"],
    [{ status: "active", roles: ["bibleevent"] }, "ok"],
    [{ status: "active", roles: ["super"] }, "ok"],
  ];
  const acts = Object.keys(ACTION_ROLES).filter((k) => ACTION_ROLES[k] === "bibleevent");
  // ⚠️ Task 6~8 이 bibleevent 액션을 더할 때마다 이 목록에도 더한다 — 빠진 액션이 다른 역할로 새지 않게
  assert.deepEqual(acts.sort(), ["evEvents", "evHistory", "evRoster", "evStats"]);
  for (const a of acts) for (const [m, want] of cases) assert.equal(canCall(a, m), want, a);
});

```

Run: `node --experimental-strip-types --test tests/authz.test.mjs`
Expected: FAIL — `not ok 5 - ministry 액션 × 사람 여섯 가지 …`(knownRoles 에 bibleevent 없음) · `not ok 7 - bibleevent(성경필사(암송)) 액션 × 사람 …`(액션이 하나도 없음) · `# pass 15` · `# fail 2`

- [ ] **Step 5: `authz.ts` — 액션 넷의 역할**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
grep -cF '  peopleExport: "directory",' supabase/functions/church-admin/authz.ts     # 1
```

`supabase/functions/church-admin/authz.ts` 의 `  peopleExport: "directory",` **바로 다음 줄에**(`};` 앞):

```ts
  // 성경필사(암송)(2026-09-29) — 성경암송 앱의 이벤트 명단(events·event_signups). 여기는 읽기 넷
  // (회차 목록·명단·사람별 이력·통계). 줄은 이름·소속·직분·담당자 메모·교적 표시만 — user_id·신원 키·
  // 성도님 전화·메모·답은 싣지 않는다. 쓰기(회차 설정·줄 고치기·올리기)는 Task 6~8 이 이 아래에 더한다.
  evEvents: "bibleevent",
  evRoster: "bibleevent",
  evHistory: "bibleevent",
  evStats: "bibleevent",
```

Run: `node --experimental-strip-types --test tests/authz.test.mjs tests/registry.test.mjs`
Expected: PASS — `# fail 0` (authz 17개 모두 통과, registry 그대로 통과).

- [ ] **Step 6: 커밋(역할 SQL · 권한)**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
git add supabase/sql/004_bibleevent_role.sql supabase/functions/church-admin/authz.ts tests/authz.test.mjs
git commit -m "feat(성경필사): 역할 bibleevent(SQL 004 · 개발 적용) · 읽기 액션 넷의 권한" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git show --stat HEAD      # 세 파일만인지 본다
```

- [ ] **Step 7: 개발 시험 — `tests/server.dev.test.mjs` 고치기(여덟 곳)**

먼저 앵커가 한 번씩만 있는지 본다:

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
T=tests/server.dev.test.mjs
for a in 'const PHOTO_PATH = "church-people-photos/990000001.jpg";' \
         '  peopleExport: { q: "ca-test-probe-없음" },' \
         'let minTestUserId = null;' \
         '  for (const k of ["none", "pending", "disabled", "ministry", "directory", "super"]) people[k] = await makeUser(k);' \
         '  await makeMember(people.directory, "active", ["directory"]);' \
         '  assert.ok(up.ok, "시험 사진 올리기 실패: " + await up.text());' \
         '  for (const p of Object.values(people)) {' \
         '    directory: role === "directory" ? null : "forbidden",' \
         '    for (const who of ["none", "pending", "disabled", "ministry", "directory", "super"]) {'; do
  printf '%s  ← %s\n' "$(grep -cF -- "$a" $T)" "$a"; done
```
Expected: 아홉 줄 모두 `1  ← …`.

**7-1.** 상수 — `const PHOTO_PATH = "church-people-photos/990000001.jpg";` **바로 다음 줄에**:

```js
// 성경필사(암송)(2026-09-29) 시험 자료 — 초안(draft) 회차 둘(보통·자격) + 줄 여섯. draft 라 성도님 화면에는 안 보인다.
//   회차 id 는 모두 ca-test- 로 시작하고 STAMP 를 담는다(Task 6~8 도) — after() 가 이번 실행의 회차를 한꺼번에 지운다(줄은 CASCADE).
//   앱 줄 하나는 시험 users 에 잇는다(누출 시험용).
const EV_ID = "ca-test-" + STAMP;              // EVT_ID_RE(/^[a-z0-9][a-z0-9-]{1,40}$/)에 맞는다 — 21자
const EV_EL_ID = "ca-test-el-" + STAMP;        // 자격 회차(needs.eligibility 있음)
const EV_NAME = "ca-test-ev-" + STAMP;         // 명부에 없는 분 — 두 회차·두 소속에 나온다(사람 묶음 시험)
const EV_APP_NAME = "ca-test-evapp-" + STAMP;  // 앱에서 낸 줄의 분(user_id 있음)
// 앱 줄에만 있는 값 — 담당자 응답에 이 글자가 보이면 성도님 전화·메모·답(answers)이 샌 것이다
const EV_PHONE = "010-8" + String(STAMP).slice(-3) + "-" + String(STAMP).slice(-7, -3);
const EV_MEMO = "ca-test-memo-" + STAMP;
const EV_ANSWER = "ca-test-answer-" + STAMP;
// 화면이 기대하는 칸(CONTRACT 2절) — 하나라도 더해지거나 빠지면 시험이 잡는다
const EV_OUT_KEYS = ["id", "title", "short_title", "subtitle", "season", "kind", "status", "opens_on", "closes_on",
  "list_until", "updated_at", "count", "listedNow", "hasEligibility"].sort();
const ROW_OUT_KEYS = ["id", "who_type", "group", "sub", "name", "position", "note", "source", "hasUser", "at",
  "updated_at", "church"].sort();
const HIST_ROW_KEYS = ["event_id", "title", "closes_on", "who_type", "group", "sub", "position", "source", "hasUser"].sort();
```

**7-2.** PROBE — `  peopleExport: { q: "ca-test-probe-없음" },` **바로 다음 줄에**(`};` 앞):

```js
  // 성경필사(암송)(Task 5) — 읽기만. 없는 회차·없는 이름을 가리킨다
  evEvents: {},
  evRoster: { event_id: "ca-test-probe-none" },
  evHistory: { name: "ca-test-probe-없음" },
  evStats: { event_ids: ["ca-test-probe-none"] },
```

**7-3.** 전역 — `let minTestUserId = null;` **바로 다음 줄에**:

```js
let evTestUserId = null;               // 성경필사(암송) 앱 줄의 시험 users id — after() 에서 지운다
```

**7-4.** before() 머리 — `  for (const k of ["none", "pending", "disabled", "ministry", "directory", "super"]) people[k] = await makeUser(k);` 줄을 **이것으로 바꾼다**:

```js
  // 성경필사(암송) — 지난번이 도중에 멈춰 남긴 시험 회차(줄은 CASCADE)·앱 줄 시험 계정. **한 시간 넘은 것만** —
  //   다른 세션이 개발에서 같은 시험을 돌리는 중이면 그쪽 회차를 지우지 않게.
  const evStale = new Date(Date.now() - 3600 * 1000).toISOString();
  await rest(`events?id=like.ca-test-*&created_at=lt.${evStale}`, "DELETE");
  await rest(`users?name=like.ca-test-evapp-*&created_at=lt.${evStale}`, "DELETE");
  for (const k of ["none", "pending", "disabled", "ministry", "directory", "bibleevent", "super"]) people[k] = await makeUser(k);
```
그리고 `  await makeMember(people.directory, "active", ["directory"]);` **바로 다음 줄에**:

```js
  await makeMember(people.bibleevent, "active", ["bibleevent"]);
```
(⚠️ `admin_role_grants.role_id` 는 `admin_roles` 를 가리킨다 — Step 3 의 SQL 이 개발에 없으면 여기서 깨진다.)

**7-5.** before() 끝 — `  assert.ok(up.ok, "시험 사진 올리기 실패: " + await up.text());` **바로 다음에**(before() 의 `});` 앞):

```js

  // 성경필사(암송) — 시험 users 한 줄(앱 줄용) + draft 회차 둘 + 줄 여섯
  // ⚠️ PostgREST 배치 insert 는 객체들의 칸이 모두 같아야 한다(PGRST102) — sig() 가 늘 같은 칸을 채운다.
  const [eu] = await rest("users", "POST",
    { type: "교구", gu: "시험", mok: "0", name: EV_APP_NAME, identity_key: "교구|시험|0|||" + EV_APP_NAME });
  evTestUserId = eu.id;
  const evBase = { short_title: "", subtitle: "시험 회차", season: "", kind: "signup", status: "draft", list_until: null,
    needs: { position: true, phone: false, memo: false, extra: [] } };
  await rest("events", "POST", [
    { ...evBase, id: EV_ID, title: "ca-test 회차 " + STAMP, opens_on: "2000-01-01", closes_on: "2000-01-31" },
    { ...evBase, id: EV_EL_ID, title: "ca-test 자격 회차 " + STAMP, opens_on: "2000-02-01", closes_on: "2000-02-28",
      needs: { ...evBase.needs, eligibility: { start: "2000-02-01", weeks: 4, perWeek: 3, need: 3 } } },
  ]);
  const sig = (event_id, who_type, group_name, sub_name, name, extra = {}) => ({
    event_id, user_id: null, source: "import", who_type, group_name, sub_name, name,
    ident_key: who_type === "교구" ? `교구|${group_name}|${sub_name}|||${name}` : `교회학교|||${group_name}|${sub_name}|${name}`,
    position: "", phone: "", memo: "", answers: {}, note: "", ...extra,
  });
  await rest("event_signups", "POST", [
    sig(EV_ID, "교구", "시험", "0", "ca-test-min", { position: "집사", note: "담당자가 더함" }),   // 명부 990000001(시험-0목장) → 맞음
    sig(EV_ID, "교구", "시험", "3", DIR_NAME, { position: "권사" }),                            // 명부는 시험B → 확인 필요
    sig(EV_ID, "교구", "시험", "7", EV_NAME),                                                  // 명부에 없음
    sig(EV_ID, "교회학교", "청년부", "", EV_NAME),                                             // 같은 이름 · 다른 소속(다른 묶음)
    sig(EV_ID, "교구", "시험", "0", EV_APP_NAME,                                               // 앱에서 낸 줄
      { user_id: evTestUserId, source: "app", phone: EV_PHONE, memo: EV_MEMO, answers: { q: EV_ANSWER } }),
    sig(EV_EL_ID, "교구", "시험", "7", EV_NAME, { note: "명단 올리기" }),                     // 셋째 줄과 같은 분(한 묶음)
  ]);
```

**7-6.** after() — `  for (const p of Object.values(people)) {` 줄 **바로 앞에**:

```js
  // 성경필사(암송) — 이번 실행(STAMP)의 시험 회차 전부(Task 6~8 것 포함 · 줄은 CASCADE) · 앱 줄의 시험 users.
  //   회차를 먼저 — users 를 먼저 지우면 앱 줄이 CASCADE 로 먼저 사라져 「줄이 남았나」를 제대로 못 본다.
  await step("성경필사 시험 회차", async () => {
    await rest(`events?id=like.ca-test-*${STAMP}*`, "DELETE");
    const left = await rest(`event_signups?select=id&event_id=like.ca-test-*${STAMP}*`, "GET");
    assert.equal(left.length, 0, "시험 회차의 줄이 남았다(CASCADE)");
  });
  if (evTestUserId) await step("성경필사 시험 users", () => rest("users?id=eq." + evTestUserId, "DELETE"));
```

**7-7.** 권한 표 — 「권한 표: 사람 다섯 × 역할이 필요한 액션」 안.
`    directory: role === "directory" ? null : "forbidden",` **바로 다음 줄에**:

```js
    bibleevent: role === "bibleevent" ? null : "forbidden",
```
그리고 `    for (const who of ["none", "pending", "disabled", "ministry", "directory", "super"]) {` 줄을 **이것으로 바꾼다**:

```js
    for (const who of ["none", "pending", "disabled", "ministry", "directory", "bibleevent", "super"]) {
```

**7-8.** 파일 **맨 끝에** 새 시험 여섯(도움 함수 하나 포함):

```js

// ---------- 성경필사(암송) — 읽기 넷(Task 5) ----------
// 개수를 DB 에서 직접 센다(서비스 키 · 행은 한 줄만) — 서버의 head 개수와 맞댄다
async function dbCount(eventId) {
  const r = await fetch(`${URL_}/rest/v1/event_signups?select=id&limit=1&event_id=eq.${encodeURIComponent(eventId)}`,
    { headers: { ...svc, Prefer: "count=exact" } });
  assert.ok(r.ok, "개수 세기 실패 " + r.status);
  return Number((r.headers.get("content-range") || "").split("/")[1]);
}

test("성경필사(암송) 회차 목록: 역할 이름 · 칸 · 인원(head) · 성도님께 보임 · 자격 회차 · 최근 먼저", async () => {
  const be = people.bibleevent.token;
  const me = await call(be, "me");
  assert.deepEqual(me.body.roles, ["bibleevent"]);
  assert.equal(me.body.roles_info[0].label, "성경필사(암송)");

  const r = await call(be, "evEvents");
  assert.equal(r.body.ok, true, JSON.stringify(r.body));
  assert.match(r.body.today, /^\d{4}-\d{2}-\d{2}$/);
  for (const e of r.body.events) assert.deepEqual(Object.keys(e).sort(), EV_OUT_KEYS, e.id);
  const closes = r.body.events.map((e) => e.closes_on);
  assert.deepEqual(closes, [...closes].sort().reverse(), "마감일 늦은 회차가 먼저");
  const mine = r.body.events.find((e) => e.id === EV_ID);
  const el = r.body.events.find((e) => e.id === EV_EL_ID);
  assert.ok(mine && el, "시험 회차 둘이 목록에 있어야 한다");
  assert.equal(mine.count, 5);
  assert.equal(el.count, 1);
  assert.equal(mine.status, "draft");
  assert.equal(mine.listedNow, false, "draft 는 성도님께 안 보인다");
  assert.equal(mine.hasEligibility, false);
  assert.equal(el.hasEligibility, true, "needs.eligibility 가 객체면 자격 회차(isEligEvent)");
  assert.equal(mine.list_until, null);
  assert.equal(mine.kind, "signup");
  assert.equal(mine.title, "ca-test 회차 " + STAMP);
  assert.equal(typeof mine.updated_at, "string");
  assert.ok(mine.updated_at.length > 0);
  // 인원은 회차마다 DB 개수와 같다(행을 받아 세면 1,000에서 잘린다)
  for (const e of r.body.events) assert.equal(e.count, await dbCount(e.id), "인원이 DB 와 다르다: " + e.id);
});

test("성경필사(암송) 명단: 줄 칸 · 교적 표시 세 가지 · 앱 줄 표시 · id 차례 · 없는 회차", async () => {
  const be = people.bibleevent.token;
  const r = await call(be, "evRoster", { event_id: EV_ID });
  assert.equal(r.body.ok, true, JSON.stringify(r.body));
  assert.deepEqual(Object.keys(r.body).sort(), ["event", "ok", "rows", "source"]);
  assert.deepEqual(Object.keys(r.body.event).sort(), EV_OUT_KEYS);
  assert.equal(r.body.event.id, EV_ID);
  assert.equal(r.body.event.count, 5);
  assert.deepEqual(r.body.source, { date: PEOPLE_SOURCE_DATE, total: 3 });   // before() 가 올린 시험 명부 기록
  assert.equal(r.body.rows.length, 5);
  for (const x of r.body.rows) assert.deepEqual(Object.keys(x).sort(), ROW_OUT_KEYS);
  const ids = r.body.rows.map((x) => x.id);
  assert.deepEqual(ids, [...ids].sort((a, b) => a - b), "줄은 id 차례");
  const by = (name, type = "교구") => r.body.rows.find((x) => x.name === name && x.who_type === type);
  assert.deepEqual(by("ca-test-min").church, { state: "맞음", reason: "" });
  assert.deepEqual(by(DIR_NAME).church, { state: "확인 필요", reason: "같은 이름 1명" });
  assert.deepEqual(by(EV_NAME).church, { state: "없음", reason: "" });
  assert.deepEqual(by(EV_NAME, "교회학교").church, { state: "없음", reason: "" });
  const min = by("ca-test-min");
  assert.deepEqual([min.group, min.sub, min.position, min.note, min.source, min.hasUser],
    ["시험", "0", "집사", "담당자가 더함", "import", false]);
  assert.match(min.at, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(typeof min.updated_at, "string");
  const cy = by(EV_NAME, "교회학교");
  assert.deepEqual([cy.group, cy.sub], ["청년부", ""]);
  const app = by(EV_APP_NAME);
  assert.deepEqual([app.source, app.hasUser, app.note], ["app", true, ""]);

  const el = await call(be, "evRoster", { event_id: EV_EL_ID });
  assert.equal(el.body.event.hasEligibility, true);
  assert.deepEqual(el.body.rows.map((x) => [x.name, x.note]), [[EV_NAME, "명단 올리기"]]);

  for (const bad of [{ event_id: "ca-test-none-" + STAMP }, { event_id: "BAD ID" }, {}]) {
    assert.equal((await call(be, "evRoster", bad)).body.error, "not-found", JSON.stringify(bad));
  }
});

test("성경필사(암송) 사람별 이력: 같은 소속은 한 묶음 · 다른 소속은 따로 · 최근 먼저 · 띄어쓰기 달라도 찾음 · 틀린 이름", async () => {
  const be = people.bibleevent.token;
  const h = await call(be, "evHistory", { name: EV_NAME });
  assert.equal(h.body.ok, true, JSON.stringify(h.body));
  assert.equal(h.body.groups.length, 2, JSON.stringify(h.body.groups));
  const [g1, g2] = h.body.groups;
  for (const g of h.body.groups) {
    assert.deepEqual(Object.keys(g).sort(), ["label", "n", "rows"]);
    for (const x of g.rows) assert.deepEqual(Object.keys(x).sort(), HIST_ROW_KEYS);
  }
  assert.deepEqual([g1.n, g2.n], [1, 2]);
  assert.deepEqual(g1.rows.map((x) => x.event_id), [EV_EL_ID, EV_ID], "2월 마감 회차가 먼저 · 교구 두 줄은 한 묶음");
  assert.deepEqual(g2.rows.map((x) => [x.event_id, x.who_type, x.group, x.sub]), [[EV_ID, "교회학교", "청년부", ""]]);
  // 이름표 = 「이름 · 소속」(CONTRACT 5절 — 교구는 숫자 목장에만 「목장」)
  assert.equal(g1.label, EV_NAME + " · 시험 7목장");
  assert.equal(g2.label, EV_NAME + " · 청년부");
  assert.deepEqual([g1.rows[0].title, g1.rows[0].closes_on, g1.rows[0].source, g1.rows[0].hasUser],
    ["ca-test 자격 회차 " + STAMP, "2000-02-28", "import", false]);

  const a = await call(be, "evHistory", { name: EV_APP_NAME });
  assert.equal(a.body.groups.length, 1);
  assert.deepEqual([a.body.groups[0].rows[0].source, a.body.groups[0].rows[0].hasUser], ["app", true]);

  // 이름은 NFC·띄어쓰기 없음으로 맞댄다 — 가운데 빈칸·앞뒤 빈칸이 있어도 같은 분
  assert.equal((await call(be, "evHistory", { name: "  ca-test-ev- " + STAMP + " " })).body.groups.length, 2);

  assert.equal((await call(be, "evHistory", { name: "" })).body.error, "no-name");
  assert.equal((await call(be, "evHistory", {})).body.error, "no-name");
  assert.equal((await call(be, "evHistory", { name: 'ca"test' })).body.error, "bad-char");
  assert.equal((await call(be, "evHistory", { name: "가".repeat(41) })).body.error, "too-long");
  assert.deepEqual((await call(be, "evHistory", { name: "ca-test-없는분-" + STAMP })).body, { ok: true, groups: [] });
});

test("성경필사(암송) 통계: 회차별 인원 · 교구(부서)×회차 · 여러 번 참여(이름·소속 따로) · 빈 배열은 전부 · 틀린 회차 id", async () => {
  const be = people.bibleevent.token;
  const s = await call(be, "evStats", { event_ids: [EV_ID, EV_EL_ID] });
  assert.equal(s.body.ok, true, JSON.stringify(s.body));
  assert.deepEqual(Object.fromEntries(s.body.perEvent.map((x) => [x.id, x.count])), { [EV_ID]: 5, [EV_EL_ID]: 1 });
  const gu = s.body.byGroup.find((g) => g.who_type === "교구" && g.group_name === "시험");
  const cy = s.body.byGroup.find((g) => g.who_type === "교회학교" && g.group_name === "청년부");
  assert.ok(gu && cy, JSON.stringify(s.body.byGroup));
  assert.equal(gu.counts[EV_ID] ?? 0, 4);
  assert.equal(gu.counts[EV_EL_ID] ?? 0, 1);
  assert.equal(cy.counts[EV_ID] ?? 0, 1);
  assert.equal(cy.counts[EV_EL_ID] ?? 0, 0);
  for (const g of s.body.byGroup) for (const v of Object.values(g.counts)) assert.equal(typeof v, "number");
  assert.deepEqual(s.body.repeaters, [], "두 회차뿐이라 3회 이상인 분이 없다");

  // 셋째 회차를 잠깐 더해 같은 분(교구 시험 7)을 세 번으로 — 여러 번 참여 한 줄의 모양(CONTRACT 5절)
  const REP_ID = "ca-test-rep-" + STAMP;
  await rest("events", "POST", { id: REP_ID, title: "ca-test 셋째 회차 " + STAMP, short_title: "", subtitle: "", season: "",
    kind: "signup", status: "draft", list_until: null, opens_on: "2000-04-01", closes_on: "2000-04-30", needs: {} });
  try {
    await rest("event_signups", "POST", { event_id: REP_ID, user_id: null, source: "import", who_type: "교구",
      group_name: "시험", sub_name: "7", name: EV_NAME, ident_key: `교구|시험|7|||${EV_NAME}`, position: "", note: "" });
    const s3 = await call(be, "evStats", { event_ids: [EV_ID, EV_EL_ID, REP_ID] });
    assert.equal(s3.body.ok, true, JSON.stringify(s3.body));
    assert.equal(s3.body.repeaters.length, 1, JSON.stringify(s3.body.repeaters));
    const rep = s3.body.repeaters[0];
    assert.deepEqual(Object.keys(rep).sort(), ["events", "label", "n", "name", "times"]);
    assert.equal(rep.name, EV_NAME);
    assert.equal(rep.label, "시험 7목장", "이름표는 소속만(이름은 name 칸에)");
    assert.equal(rep.times, 3);
    assert.deepEqual([...rep.events].sort(), [EV_ID, EV_EL_ID, REP_ID].sort());
    assert.ok(Number.isInteger(rep.n) && rep.n >= 1);
    // 사람별 이력의 묶음 이름표와 같은 모양 — 두 화면이 같은 분을 같은 글자로 부른다
    const h = await call(be, "evHistory", { name: EV_NAME });
    assert.equal(h.body.groups[0].label, rep.name + " · " + rep.label);
  } finally {
    await rest(`events?id=eq.${REP_ID}`, "DELETE");   // 줄은 CASCADE — 뒤 시험(누출·Task 6~8)이 이 회차를 보지 않게
  }

  const all = await call(be, "evStats", { event_ids: [] });
  assert.equal(all.body.ok, true, JSON.stringify(all.body));
  assert.ok(all.body.perEvent.some((x) => x.id === EV_ID && x.count === 5), "빈 배열이면 모든 회차");
  assert.ok(all.body.perEvent.some((x) => x.id === EV_EL_ID), "빈 배열이면 모든 회차");

  const none = await call(be, "evStats", { event_ids: ["ca-test-none-" + STAMP] });
  assert.equal(none.body.ok, true, JSON.stringify(none.body));
  assert.deepEqual(none.body.perEvent, []);

  assert.equal((await call(be, "evStats", {})).body.error, "bad-event-id");
  assert.equal((await call(be, "evStats", { event_ids: "x" })).body.error, "bad-event-id");
  assert.equal((await call(be, "evStats", { event_ids: ["BAD ID"] })).body.error, "bad-event-id");
});

test("성경필사(암송) 1,000행 넘는 회차: 명단·인원·통계가 잘리지 않는다(쪽 나누기 · head 개수)", async () => {
  const be = people.bibleevent.token;
  const BIG_ID = "ca-test-big-" + STAMP, N = 1001;   // 지우기는 after() 가 한다(줄은 CASCADE)
  await rest("events", "POST", { id: BIG_ID, title: "ca-test 큰 회차 " + STAMP, short_title: "", subtitle: "", season: "",
    kind: "signup", status: "draft", list_until: null, opens_on: "2000-03-01", closes_on: "2000-03-31", needs: {} });
  await rest("event_signups", "POST", Array.from({ length: N }, (_, i) => ({
    event_id: BIG_ID, user_id: null, source: "import", who_type: "교구", group_name: "시험", sub_name: String(i % 50),
    name: "ca-test-big-" + i, ident_key: `교구|시험|${i % 50}|||ca-test-big-${i}`, position: "", note: "" })));
  const r = await call(be, "evRoster", { event_id: BIG_ID });
  assert.equal(r.body.ok, true, JSON.stringify(r.body).slice(0, 300));
  assert.equal(r.body.rows.length, N, "명단이 1,000에서 잘렸다");
  assert.equal(new Set(r.body.rows.map((x) => x.id)).size, N, "쪽을 넘기며 같은 줄이 두 번 들어왔다");
  assert.equal(r.body.event.count, N);
  assert.equal((await call(be, "evEvents")).body.events.find((e) => e.id === BIG_ID).count, N);
  const s = await call(be, "evStats", { event_ids: [BIG_ID] });
  assert.deepEqual(s.body.perEvent.map((x) => [x.id, x.count]), [[BIG_ID, N]]);
});

test("성경필사(암송) 누출: 응답 어디에도 UUID 꼴 값·user_id·신원 키·성도님 전화·메모·답·교적 값이 없다", async () => {
  const be = people.bibleevent.token;
  const UUID_ANY = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  const FORBIDDEN = ["user_id", "auth_user_id", "ident_key", "answers", "phone", "memo", "person_id"];
  // 응답 전체의 칸 이름(깊이 상관없이). counts 의 열쇠는 회차 id(값은 수)라 칸 이름으로 모으지 않는다.
  const keysOf = (v, out = []) => {
    if (Array.isArray(v)) { for (const x of v) keysOf(x, out); }
    else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) { out.push(k); if (k !== "counts") keysOf(x, out); }
    }
    return out;
  };
  // ① 앱 줄에만 있는 값 ② 시험 계정 id ③ 신원 키 꼴 ④ 명부에만 있는 값(목장 원문·주소·연락처2)
  const marks = [EV_PHONE, EV_PHONE.replace(/\D/g, ""), EV_MEMO, EV_ANSWER, evTestUserId, "교구|시험|",
    "시험-0목장", "시험B-1목장", "비밀주소", CHURCH_ONLY_PHONE, CHURCH_ONLY_PHONE.replace(/\D/g, "")];
  const resps = [
    ["evEvents", await call(be, "evEvents")],
    ["evRoster", await call(be, "evRoster", { event_id: EV_ID })],
    ["evRoster 자격", await call(be, "evRoster", { event_id: EV_EL_ID })],
    ["evHistory 앱 줄", await call(be, "evHistory", { name: EV_APP_NAME })],
    ["evHistory", await call(be, "evHistory", { name: EV_NAME })],
    ["evStats", await call(be, "evStats", { event_ids: [EV_ID, EV_EL_ID] })],
    ["evStats 전부", await call(be, "evStats", { event_ids: [] })],
  ];
  for (const [label, r] of resps) {
    assert.equal(r.body.ok, true, label + " " + JSON.stringify(r.body));
    const text = JSON.stringify(r.body);
    assert.ok(!UUID_ANY.test(text), label + " 응답에 UUID 꼴 값이 있다: " + (text.match(UUID_ANY) || [""])[0]);
    for (const mk of marks) assert.ok(!text.includes(mk), `${label} 응답에 감출 값이 실렸다(표지 ${marks.indexOf(mk) + 1}번)`);
    const bad = keysOf(r.body).filter((k) => FORBIDDEN.includes(k) || CHURCH_COLS.includes(k));
    assert.deepEqual(bad, [], label + " 응답에 감출 칸이 있다: " + bad.join(","));
  }
});
```

Run: `node --check tests/server.dev.test.mjs` → 아무 출력 없음(문법 통과 · 이 파일은 `.mjs` 라 `node --check` 가 잡는다).

- [ ] **Step 8: 개발 시험을 옛 함수에 대고 돌려 실패를 본다**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
set -a; . ~/.church-admin/dev.env; set +a
node --experimental-strip-types --test tests/server.dev.test.mjs
```
Expected: FAIL — `서버가 아는 역할이 admin_roles 표에 있다`·`역할이 필요한 액션마다 시험 입력(PROBE)이 있다` 는 **통과**(SQL·PROBE 는 이미 있다), `권한 표: 사람 다섯 × 역할이 필요한 액션` 은 `not ok`(개발 함수는 아직 옛 판이라 `evEvents` 가 `none` 에게도 400 `unknown-action`), 새 시험 `성경필사(암송) …` **여섯 모두** `not ok`(`evEvents`·`evRoster`… 가 400 `unknown-action`) — 합해서 `# fail 7`. 나머지(사역·교인명부 시험)는 통과하고, `after()` 의 정리도 통과해야 한다(「정리 실패」 줄이 없어야 한다 — 시험 회차가 남으면 안 된다).

- [ ] **Step 9: `index.ts` — 새 import 셋(기존 import 줄은 그대로)**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
F=supabase/functions/church-admin/index.ts
grep -cF 'from "./people-query.ts";' $F      # 1 — 이 줄 바로 다음에 넣는다(이 줄 자체는 고치지 않는다)
# 이 과제가 들이거나 만드는 이름이 아직 하나도 없어야 한다(있으면 두 번 선언 = 배포 실패 — 멈추고 어디서 왔는지 본다)
grep -cwE 'applicantFromSignup|nameKey|Church|isEligEvent|kstToday|evtListable|EVT_ID_RE|BE_BAD_CHARS|BE_FIELD_MAX|personGroups|eventStatsOf|StatIn|EV_COLS|EV_ROW_COLS|evOut|rowOut|evRead|evCountMap|evWho|evEvents|evRoster|evHistory|evStats' $F   # 0
```

`from "./people-query.ts";` 로 끝나는 import 줄 **바로 다음에** 세 줄(과 설명 두 줄)을 더한다:

```ts
// 성경필사(암송)(Task 5) — 기존 import 줄은 고치지 않고 새 줄로 더한다. Task 6~8 은 여기 든 이름을 다시 들이지 않는다(두 번 선언 = 배포 실패).
import { applicantFromSignup, nameKey, type Church } from "./people-match.ts";
import { BE_BAD_CHARS, BE_FIELD_MAX, EVT_ID_RE, evtListable, isEligEvent, kstToday } from "./events-rules.ts";
// ⚠️ people-query.ts 의 statsOf(교인명부 현황)와 이름이 같다 — 이벤트 통계는 eventStatsOf 로만 부른다
import { personGroups, statsOf as eventStatsOf, type StatIn } from "./events-stats.ts";
```

- [ ] **Step 10: `index.ts` — 공용 도움 함수(Task 6~8 도 쓴다)**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
grep -cF 'Deno.serve(async (req) => {' supabase/functions/church-admin/index.ts     # 1
```

`Deno.serve(async (req) => {` 줄 **바로 앞에**(지금은 `peopleExport` 함수가 끝난 뒤 빈 줄 다음이다):

```ts
// ---------- 성경필사(암송) — 이벤트 명단 (2026-09-29) ----------
// 설계: v2 docs/superpowers/specs/2026-09-29-church-admin-bible-events-design.md · 옛 동작 원문 docs/port/event-roster-legacy.md
// 표 events·event_signups 는 **성경암송 앱의 것**이다 — 칸·제약·RLS 를 바꾸지 않는다(여기서는 읽고 쓰기만).
// ⚠️ 응답은 아래 칸 지도(evOut·rowOut·evHistory 줄)로만 만든다. user_id 는 판정(hasUser·사람 묶음)에 쓰려고
//    읽기만 하고 내보내지 않는다 — 성경암송 api 는 user_id 하나로 그 사람 행세가 된다. 성도님 memo·answers·phone 은
//    이 절의 어느 칸 목록에도 없다(성도님 메모 memo 와 담당자 메모 note 는 다른 칸).
// ⚠️ 줄은 allRows 로 읽는다(1,000행에서 오류 없이 잘린다 — 2026-09-29 성경암송 576acfc), 인원은 head 개수.
// ⚠️ 자격 회차 판정은 events-rules.ts 의 isEligEvent(needs) 하나 — 여기서 따로 만들지 않는다(대조 뒤 결정).
const EV_COLS = "id,title,short_title,subtitle,season,kind,status,opens_on,closes_on,list_until,updated_at,needs";
// 줄 칸 목록은 이것 하나 — 명단(evRoster)·한 분 더하기·고치기(Task 7)·올리기(Task 8)가 모두 이것을 쓴다(두 벌 두지 않는다)
const EV_ROW_COLS = "id,event_id,user_id,who_type,group_name,sub_name,name,position,note,source,created_at,updated_at";

// 회차 한 줄 — 화면(📋 회차·명단)이 기대하는 칸 그대로. needs·copy·sort_order 는 싣지 않는다.
function evOut(ev: any, count: number) {
  return {
    id: ev.id, title: ev.title ?? "", short_title: ev.short_title ?? "", subtitle: ev.subtitle ?? "",
    season: ev.season ?? "", kind: ev.kind ?? "signup", status: ev.status,
    opens_on: ev.opens_on, closes_on: ev.closes_on, list_until: ev.list_until ?? null,
    updated_at: ev.updated_at ?? "",                         // 회차 설정 저장의 expect
    count,                                                   // head 개수(evCountMap)
    listedNow: evtListable(ev, kstToday()),                  // 지금 성도님께 보이는가(KST · 성경암송 evtListable 규칙)
    hasEligibility: isEligEvent(ev.needs),                   // 자격 회차(더하기·올리기를 막는 쪽 · Task 7·8 도 같은 함수)
  };
}

// 명단 한 줄 — 명시적 칸 지도. church 는 { state, reason } | null(교적 값은 싣지 않는다).
function rowOut(r: any, church: Church | null) {
  return {
    id: r.id, who_type: r.who_type ?? "", group: r.group_name ?? "", sub: r.sub_name ?? "",
    name: r.name ?? "", position: r.position ?? "", note: r.note ?? "",
    source: r.source === "app" ? "app" : "import",
    hasUser: !!r.user_id,                                    // 앱 계정과 이어졌는가(user_id 자체는 싣지 않는다)
    at: r.created_at ? kstDay(r.created_at) : "",            // 낸 날(KST 「YYYY-MM-DD」)
    updated_at: r.updated_at ?? "",                          // 줄 고치기·빼기의 expect(DB 문자열 그대로)
    church,
  };
}

// 회차 하나(EV_COLS — needs·updated_at 포함) · 모양이 틀린 id 는 묻지 않고 null
async function evRead(id: unknown): Promise<any | null> {
  const s = legacyNorm(id);
  if (!EVT_ID_RE.test(s)) return null;
  const { data, error } = await db.from("events").select(EV_COLS).eq("id", s).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

// 회차마다 인원 — 행을 받지 않고 head 개수만(행을 받아 세면 1,000에서 잘린다)
async function evCountMap(ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  await Promise.all([...new Set(ids)].map(async (id) => {
    const { count, error } = await db.from("event_signups").select("id", { count: "exact", head: true }).eq("event_id", id);
    if (error) throw error;
    out.set(id, count ?? 0);
  }));
  return out;
}

// 줄의 소속 한 줄 — 「화평 20목장」·「소망 남성」·「청년부」·「중등부 3학년」. 교구 줄의 **숫자 목장에만** 「목장」.
// ⚠️ 통계(events-stats.ts statsOf)의 repeaters[].label 과 같은 꼴이어야 한다(CONTRACT 5절 — 개발 시험이 맞대 본다).
function evWho(r: any): string {
  const g = legacyNorm(r.group_name), s = legacyNorm(r.sub_name);
  if (!g) return "(소속 없음)";
  if (legacyNorm(r.who_type) === "교구" && /^\d+$/.test(s)) return g + " " + s + "목장";
  return s ? g + " " + s : g;
}

```

- [ ] **Step 11: `index.ts` — 읽기 액션 넷**

다시 `Deno.serve(async (req) => {` 줄 **바로 앞에**(Step 10 에서 넣은 `evWho` 아래, 여전히 `Deno.serve` 앞):

```ts
// 📋 회차 목록 — 최근(마감일 늦은) 회차 먼저
async function evEvents() {
  const evs = await allRows(() => db.from("events").select(EV_COLS)
    .order("closes_on", { ascending: false }).order("id", { ascending: true }));
  const counts = await evCountMap(evs.map((e) => e.id));
  return { ok: true, today: kstToday(), events: evs.map((e) => evOut(e, counts.get(e.id) ?? 0)) };
}

// 📋 한 회차의 명단 전부 + 줄마다 교적 표시
async function evRoster(b: any) {
  const ev = await evRead(b.event_id);
  if (!ev) return { ok: false, error: "not-found" };
  const [counts, rows, src] = await Promise.all([
    evCountMap([ev.id]),
    allRows(() => db.from("event_signups").select(EV_ROW_COLS).eq("event_id", ev.id).order("id", { ascending: true })),
    peopleSource(),
  ]);
  // 교적 표시 — 명부가 한 번도 안 올라왔으면 null(화면이 표시를 그리지 않는다). 이름으로만 묻는다(200개씩).
  const idx = await churchLookup(rows.map((r) => r.name));
  return {
    ok: true,
    event: evOut(ev, counts.get(ev.id) ?? 0),
    source: src ? { date: src.source_date, total: src.total } : null,
    rows: rows.map((r) => rowOut(r, churchFor(idx, applicantFromSignup(r)))),
  };
}

// 👤 이름으로 모든 회차의 줄 — 사람 묶음(합집합)마다. 이름은 NFC·띄어쓰기 없음(nameKey)으로 맞댄다.
// ⚠️ DB 에 name=eq 로 묻지 않는다 — 맥에서 온 자모분리(NFD)·띄어쓰기가 다른 줄을 놓친다. 줄 전체를 쪽을
//    나눠 읽고(2026-09-29 기준 2,834행 = 세 쪽) 여기서 거른다. 교적 값이 아니라 기록은 남기지 않는다.
async function evHistory(b: any) {
  const raw = legacyNorm(b.name);
  if (!raw) return { ok: false, error: "no-name" };
  if (BE_BAD_CHARS.test(raw)) return { ok: false, error: "bad-char" };
  if (raw.length > BE_FIELD_MAX) return { ok: false, error: "too-long" };
  const key = nameKey(raw);
  const [evs, all] = await Promise.all([
    allRows(() => db.from("events").select("id,title,closes_on").order("id", { ascending: true })),
    allRows(() => db.from("event_signups").select("id,event_id,user_id,who_type,group_name,sub_name,name,position,source")
      .order("id", { ascending: true })),
  ]);
  const evBy = new Map(evs.map((e) => [e.id, e]));
  // 최근 회차 먼저 — 마감일 늦은 것 → 같은 마감일이면 회차 id 큰 것 → 같은 회차면 줄 id 큰 것.
  // ⚠️ 이 차례는 events-stats.ts statsOf 가 「가장 최근 줄」을 고르는 차례(마감일·회차 id 오름차순의 마지막, 같은 회차면 뒤 줄)와
  //    **같아야** 한다 — 그래야 이력 이름표와 통계 「여러 번 참여한 분」 이름표가 같은 글자가 된다. 묶음 순번도 이 차례로 매겨진다.
  const rows = all.filter((r) => nameKey(r.name) === key).sort((x, y) =>
    String(evBy.get(y.event_id)?.closes_on ?? "").localeCompare(String(evBy.get(x.event_id)?.closes_on ?? ""))
    || String(y.event_id).localeCompare(String(x.event_id)) || Number(y.id) - Number(x.id));
  const gi = personGroups(rows as StatIn[]);
  const groups: { n: number; label: string; rows: any[] }[] = [];
  rows.forEach((r, i) => {
    const g = gi[i];
    // 묶음 이름표 = 「이름 · 소속」(가장 최근 줄 · CONTRACT 5절 — 통계 repeaters 의 name·label 과 같은 글자).
    // 순번(n)은 user_id 대신 쓰는 이름표다 — user_id 로 이름표를 만들지 않는다.
    if (!groups[g]) groups[g] = { n: g + 1, label: `${legacyNorm(r.name)} · ${evWho(r)}`, rows: [] };
    const e = evBy.get(r.event_id);
    groups[g].rows.push({
      event_id: r.event_id, title: e?.title ?? "", closes_on: e?.closes_on ?? "",
      who_type: r.who_type ?? "", group: r.group_name ?? "", sub: r.sub_name ?? "",
      position: r.position ?? "", source: r.source === "app" ? "app" : "import", hasUser: !!r.user_id,
    });
  });
  return { ok: true, groups: groups.filter(Boolean) };
}

// 👤 통계 — 고른 회차(빈 배열 = 전부)로 회차별 인원 · 교구(부서)×회차 · 여러 번 참여한 분
async function evStats(b: any) {
  if (!Array.isArray(b.event_ids)) return { ok: false, error: "bad-event-id" };
  const ids = [...new Set(b.event_ids.map((x: unknown) => legacyNorm(x)))] as string[];
  if (ids.length > 100 || ids.some((id) => !EVT_ID_RE.test(id))) return { ok: false, error: "bad-event-id" };
  const evsAll = await allRows(() => db.from("events").select("id,title,closes_on")
    .order("closes_on", { ascending: false }).order("id", { ascending: true }));
  const evs = ids.length ? evsAll.filter((e) => ids.includes(e.id)) : evsAll;   // 없는 id 는 조용히 빠진다
  if (!evs.length) return { ok: true, ...eventStatsOf([], []) };
  const pick = evs.map((e) => e.id);
  // 고른 것이 있으면 .in() 으로 좁힌다(회차 id 는 EVT_ID_RE 로 좁힌 영문 슬러그 · 최대 100개라 주소가 깨지지 않는다).
  // 빈 배열(= 전부)이면 거르지 않고 다 읽는다 — 회차가 늘어도 주소가 길어지지 않게.
  const rows = await allRows(() => {
    let q = db.from("event_signups").select("id,event_id,user_id,who_type,group_name,sub_name,name,position");
    if (ids.length) q = q.in("event_id", pick);
    return q.order("id", { ascending: true });
  });
  return { ok: true, ...eventStatsOf(rows as StatIn[], evs) };
}

```

- [ ] **Step 12: `index.ts` — switch 의 case 넷**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
grep -cF '      case "peopleExport": return json(await peopleExport(ctx, b));' supabase/functions/church-admin/index.ts   # 1
```

`      case "peopleExport": return json(await peopleExport(ctx, b));` **바로 다음 줄에**:

```ts
      case "evEvents":  return json(await evEvents());
      case "evRoster":  return json(await evRoster(b));
      case "evHistory": return json(await evHistory(b));
      case "evStats":   return json(await evStats(b));
```

- [ ] **Step 13: 넣은 자리 확인 · preflight**

`node --check` 는 TS 문법 오류를 못 잡는다(대조 뒤 결정) — `index.ts` 의 문법은 Step 15 의 **개발 함수 배포**가, 없는 이름은 **개발 시험**이 잡는다. 여기서는 넣은 자리와 기존 줄이 그대로인지만 본다:

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
F=supabase/functions/church-admin/index.ts
grep -cF 'from "./people-match.ts";' $F     # 2 — 기존 줄 + 이 과제의 새 줄
grep -cF 'from "./events-rules.ts";' $F     # 1
grep -cF 'from "./events-stats.ts";' $F     # 1
grep -cF 'from "./people-query.ts";' $F     # 1
git diff HEAD -- $F | grep -c '^-import'    # 0 — 기존 import 줄을 지우거나 바꾸지 않았다
git diff HEAD -- $F | grep -c '^-[^-]'      # 0 — 이 과제는 더하기만 한다(지운 줄이 없다)
grep -cE '^(async )?function (evOut|rowOut|evRead|evCountMap|evWho|evEvents|evRoster|evHistory|evStats)\(' $F   # 9
grep -cE 'case "(evEvents|evRoster|evHistory|evStats)":' $F   # 4
grep -c 'evElig' $F                         # 0 — 자격 회차는 isEligEvent 하나
python tools/preflight.py
```
Expected: 주석대로의 숫자 · preflight 끝줄 `모두 통과`. (preflight 는 index.ts 를 읽지 않는다 — 모듈 이름·모양은 Step 1 이 봤다.)

- [ ] **Step 14: 커밋(읽기 액션 · 개발 시험)**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
git add supabase/functions/church-admin/index.ts tests/server.dev.test.mjs
git commit -m "feat(성경필사): 읽기 액션 넷(회차 목록·명단·사람별 이력·통계) · 공용 도움 함수 · 개발 시험(누출·1,000행)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git show --stat HEAD
git status --short        # 아무것도 없어야 한다 — 배포는 작업 트리를 통째로 올린다
```

- [ ] **Step 15: 개발 함수 배포(= 문법 검사) · 개발 시험**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events     # supabase/functions/church-admin 이 있는 워크트리 루트(작업 폴더 supa-dev 가 아니다 — 그곳엔 functions 가 없다)
git log --oneline HEAD..main | head -5                  # 비어 있어야 한다(아래 ⚠️)
supabase functions deploy church-admin --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo
set -a; . ~/.church-admin/dev.env; set +a
node --experimental-strip-types --test tests/server.dev.test.mjs
```
Expected: `git log` 줄 없음 · 배포 줄 `Deployed Functions on project ktpwthwqzgcqcrmsafdo: church-admin` · 시험 끝에 `# fail 0`(새 여섯 포함 모두 통과, `after()` 의 「정리 실패」 없음).
- 배포가 문법 오류로 실패하면(= `index.ts` 문법 검사) 고치고 **새 커밋**으로(앞 커밋을 고치지 않는다) → Step 13~15 다시.
- ⚠️ `git log HEAD..main` 에 줄이 나오면 main 이 앞서 있다 — 이대로 배포하면 그 커밋들의 서버 변경이 개발 함수에서 빠진다(다른 세션의 개발 시험이 깨진다). `git merge --no-edit main` 으로 따라잡고 Step 13 부터 다시(충돌이 나면 멈추고 친구에게). 거꾸로 다른 세션이 main 판을 개발에 배포하면 bibleevent 액션이 개발에서 사라진다 — 시험이 400 `unknown-action` 이면 먼저 다시 배포한다.
- ⚠️ 운영(`xnomlgydifiqiybervtf`)에는 배포하지 않는다 — 운영은 Task 15 에서만. 푸시하지 않는다.


### Task 6: 회차 만들기·설정 — `evEventCreate` · `evEventSave` (공개 확인은 쓰기 전에)

모든 명령은 워크트리에서(Git Bash: `cd /c/Projects/church-admin/.worktrees/bible-events`). 이 계획은 church-admin main `a2dfd7c` 에서 썼다 — **줄 번호로 찾지 않는다.** 고칠 자리는 모두 「앵커 글」로 찾고, 앵커가 한 번만 나오는지 `grep -cF` 로 먼저 본다(Step 0).

**Files:**
- Modify: `supabase/functions/church-admin/events-rules.ts` — 파일 **끝에** 회차 설정 도움 함수 다섯(`EV_EDIT_KEYS`·`EV_CREATE_KEYS`·`pickEventPatch`·`eventFields`·`eventDiff`). Task 2 가 만든 내보내기(`isEligEvent`·`eligibilityStart` 포함)는 건드리지 않는다.
- Test: `tests/events-rules.test.mjs` — 파일 **끝에** 새 import 문 하나 + 시험 다섯(Task 2 의 import 줄은 다시 쓰지 않는다)
- Modify: `supabase/functions/church-admin/authz.ts` — 앵커 `evStats: "bibleevent",`(Task 5) 다음 줄에 두 줄
- Test: `tests/authz.test.mjs` — 앵커 `["evEvents", "evHistory", "evRoster", "evStats"]`(Task 5 bibleevent 시험의 기대 목록) 한 곳
- Modify: `supabase/functions/church-admin/index.ts` — 앵커 `const cors = {` 위에 **새 import 문** 하나 · 앵커 `Deno.serve(async (req) => {` 바로 앞에 새 절 · 앵커 `case "evStats":` 줄 다음에 case 두 줄
- Test: `tests/server.dev.test.mjs` — 앵커 `evStats: { event_ids:`(Task 5 PROBE 줄) 다음에 PROBE 두 줄 · 파일 **끝에** 상수·도움 함수·시험 둘. `after()` 는 고치지 않는다(Task 5 의 정리 단계가 `events?id=like.ca-test-*` 를 모두 지운다 — 줄은 CASCADE)

**Interfaces:**
- Consumes:
  - Task 2 `events-rules.ts`: `EVT_ID_RE` · `BE_NEEDS_DEFAULT` · `type EvEvent` · `kstToday(now?)` · `evtListable(ev, today)` · `checkEvent(ev, eligibilityStart)`(오류 코드 차례 no-title · bad-period · period-reversed · bad-status · bad-list-until · list-until-before-close · before-eligibility) · `mergeEventPatch(cur, patch)`(보낸 칸만 · 여덟 칸만 · list_until `""`→`null` · 글자 다듬기) · **`eligibilityStart(needs): string | null`**(`needs.eligibility.start` 가 `YYYY-MM-DD` 일 때만) · `isEligEvent(needs): boolean`(Task 5 `evOut` 의 `hasEligibility` 가 쓴다 — 이 과제는 직접 부르지 않는다)
  - Task 5 `index.ts`: `evRead(id: unknown)` → `Promise<회차 한 줄(EV_COLS — needs·updated_at 포함) | null>`(모양이 틀린 id 는 묻지 않고 null) · `evOut(ev, count): EvEventOut`(`hasEligibility` = `isEligEvent(ev.needs)`) · `evCountMap(ids)` → `Promise<Map<string, number>>` · 기존 `db`·`json`·`audit(ctx, action, target, detail)`·`type Ctx` · Task 5 가 이미 들여온 `EVT_ID_RE`·`evtListable`·`kstToday`
  - Task 5 `authz.ts` bibleevent 블록 · `tests/authz.test.mjs` bibleevent 시험 · `tests/server.dev.test.mjs` 의 `people.bibleevent`·`want()` 의 bibleevent 줄·상수 `EV_OUT_KEYS`(정렬된 열네 칸)·`before()`/`after()` 의 `events?id=like.ca-test-*` 지우기
- Produces:
  - `evEventCreate` `{event:{id,title,short_title,subtitle,season,opens_on,closes_on,list_until}}` → `{ok:true, event:EvEventOut}` | `{ok:false, error:"bad-event-id"|"no-title"|"bad-period"|"period-reversed"|"bad-list-until"|"list-until-before-close"|"exists"}`. `status`·`kind`·`needs`·`copy`·`sort_order` 는 보내도 버린다(서버가 `draft`·`signup`·`BE_NEEDS_DEFAULT` 사본·DB 기본값 `{}`·`0` 으로 정한다).
  - `evEventSave` `{event_id, expect, patch:{title?,short_title?,subtitle?,season?,opens_on?,closes_on?,status?,list_until?}, confirmListed?}` → `{ok:true, event:EvEventOut, listedBefore:boolean, listedNow:boolean}` | `{ok:false, error:"not-found"|"conflict"|"needs-confirm"|<checkEvent 코드>}`. `needs-confirm` 이면 **아무것도 쓰지 않았다**(화면 Task 10 은 확인 창 뒤 `confirmListed:true` 로 다시 보낸다). 바뀐 칸이 없으면 쓰지 않고 `ok:true`(updated_at 그대로).
  - 기록(Task 13 `audit.js` 가 읽는다): `event.create` target=회차 id, detail `{title, before:{}, after:{title,short_title,subtitle,season,opens_on,closes_on,status,list_until}}` · `event.settings` target=회차 id, detail `{title, before:{바뀐 칸만}, after:{바뀐 칸만}}`.
  - `events-rules.ts` 새 내보내기: `EV_EDIT_KEYS: string[]` · `EV_CREATE_KEYS: string[]` · `pickEventPatch(src: unknown, keys: string[]): Record<string,string>` · `eventFields(r: Record<string,unknown>): EvEvent` · `eventDiff(before: EvEvent, after: EvEvent): {before:Record<string,string|null>; after:Record<string,string|null>}`
  - `index.ts`: 액션 함수 `evEventCreate(ctx, b)`·`evEventSave(ctx, b)` — **`evEventSave` 가 새 절의 마지막 함수**다(Task 7 이 그 뒤에 붙인다) · `authz.ts` 의 `evEventSave: "bibleevent",` 줄과 server.dev PROBE 의 `evEventSave: …` 줄·switch 의 `case "evEventSave":` 줄도 Task 7 의 앵커다.

정한 것(설계 §2 그대로 · CONTRACT 「5. 대조 뒤 결정」 반영):
- 만들기는 **insert 만**(있으면 `exists` — 옛 `eventSave` 의 upsert 처럼 덮지 않는다) · 새 회차는 **draft 고정** · `needs` 는 `BE_NEEDS_DEFAULT` 의 **사본**.
- 고치기는 **보낸 칸만**이고 `needs`·`copy`·`kind`·`sort_order`·`id` 는 받지 않는다(오류 없이 조용히 버린다 — 화면은 보내지 않는다). **`sort_order` 는 이번에 고치지 않는다** — 새 회차는 DB 기본값 0 이고 설정 화면에 없다(Task 15 「남은 것」에 적힌다).
- 검사는 합친 회차 전체를 `checkEvent` 로(만들기·고치기가 같은 함수). 제목·짧은 이름 길이 제한은 두지 않는다.
- **자격 회차 판정은 Task 2 의 두 함수뿐**: `before-eligibility` 의 기준일은 `eligibilityStart(cur.needs)`(날짜 꼴일 때만 — 모양이 틀린 자격 규칙이면 이 검사를 건너뛴다), 화면의 자격 회차 표시는 Task 5 `evOut` 의 `isEligEvent`. 이 과제는 따로 판정 함수를 만들지 않는다.
- **공개 확인은 검사를 통과한 뒤, 쓰기 전에**(검사 오류를 먼저 보여 줘야 확인을 누른 뒤 또 막히지 않는다). 「안 보이던 회차가 보이게 되는」 것은 상태를 open·closed 로 바꿀 때만이 아니라 **지난 공개 종료일을 비우거나 늦출 때**도다 — 둘 다 `evtListable` 전후 비교 하나로 잡는다.
- 쓰기는 `updated_at` 조건부 update(읽은 뒤 쓰기 전 사이에 누가 저장하면 0행 → `conflict`).

- [ ] **Step 0: 선행 확인 — Task 2·5 의 이름과 앵커가 있는가**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
node --experimental-strip-types --input-type=module -e "
const m = await import('./supabase/functions/church-admin/events-rules.ts');
const need = ['EVT_ID_RE', 'BE_NEEDS_DEFAULT', 'kstToday', 'evtListable', 'checkEvent', 'mergeEventPatch', 'isEligEvent', 'eligibilityStart'];
const miss = need.filter((k) => typeof m[k] === 'undefined');
if (miss.length) throw new Error('events-rules.ts 에 없다: ' + miss.join(', '));
const early = ['EV_EDIT_KEYS', 'EV_CREATE_KEYS', 'pickEventPatch', 'eventFields', 'eventDiff'].filter((k) => k in m);
if (early.length) throw new Error('벌써 있다(같은 이름을 두 번 export 하면 SyntaxError): ' + early.join(', '));
if (m.eligibilityStart({ eligibility: { start: '2026-10-11' } }) !== '2026-10-11') throw new Error('eligibilityStart 가 시작일을 못 꺼낸다');
if (m.eligibilityStart({ eligibility: { start: '10/11' } }) !== null) throw new Error('eligibilityStart 가 꼴이 틀린 날을 받는다');
if (m.isEligEvent({ eligibility: { start: '2026-10-11' } }) !== true || m.isEligEvent({ position: true }) !== false) throw new Error('isEligEvent 가 계약과 다르다');
console.log('Task 2 이름 모두 있음');
"
grep -cF 'evStats: "bibleevent",' supabase/functions/church-admin/authz.ts
grep -cF '["evEvents", "evHistory", "evRoster", "evStats"]' tests/authz.test.mjs
grep -cF 'const cors = {' supabase/functions/church-admin/index.ts
grep -cF 'Deno.serve(async (req) => {' supabase/functions/church-admin/index.ts
grep -cF 'case "evStats":' supabase/functions/church-admin/index.ts
grep -cE '^(async )?function (evOut|evRead|evCountMap|evStats)\(' supabase/functions/church-admin/index.ts
grep -cF 'evStats: { event_ids:' tests/server.dev.test.mjs
grep -cE '^const EV_OUT_KEYS = ' tests/server.dev.test.mjs
grep -cF 'bibleevent: role === "bibleevent"' tests/server.dev.test.mjs
grep -cF 'events?id=like.ca-test-*' tests/server.dev.test.mjs
# 이 과제가 아직 안 들어갔는가(정의·등록만 센다 — 주석 속 이름은 세지 않는다)
grep -cE '^async function evEvent(Create|Save)\(|case "evEvent(Create|Save)":' supabase/functions/church-admin/index.ts
grep -cE '^\s*evEvent(Create|Save): "bibleevent"' supabase/functions/church-admin/authz.ts
grep -cE '^\s*evEvent(Create|Save): \{|^const EVC_NEW' tests/server.dev.test.mjs
grep -cF 'EV_EDIT_KEYS, EV_CREATE_KEYS, pickEventPatch' tests/events-rules.test.mjs
```
Expected: `Task 2 이름 모두 있음`(경고 줄 — `ExperimentalWarning`·`Reparsing as ES module …` — 은 괜찮다) · 그다음 숫자가 차례로 `1` · `1` · `1` · `1` · `1` · `4` · `1` · `1` · `1` · `2`(before 와 after 두 곳) · 마지막 넷은 `0` · `0` · `0` · `0`.
하나라도 다르면 **멈춘다** — `1` 이 아니면 앵커가 없거나 둘 이상이라 아래 고치기가 엉뚱한 자리에 들어간다(앞 과제가 끝나지 않았거나 main 이 움직였다 — 그 자리를 글로 찾아 앵커를 다시 정한다). 마지막 넷에 `0` 이 아닌 것이 있으면 이 과제가 이미 반쯤 들어갔다는 뜻이다(`git log --oneline` 으로 어디까지 커밋됐는지 보고 이어서 한다).

- [ ] **Step 1: 순수 도움 함수의 실패하는 시험 쓰기** — `tests/events-rules.test.mjs`

파일 **끝에** 그대로 붙인다. Task 2 의 import 줄은 **다시 쓰지 않는다** — 새 import 문을 이 블록 머리에 둔다(ES 모듈의 import 는 끌어올려져 파일 어디에 있어도 맨 먼저 읽힌다). `mergeEventPatch` 는 Task 2 가 이미 들여왔으므로 **다른 이름(`mergeForKeyCheck`)으로** 한 번 더 들여온다 — 같은 이름을 두 번 들여오면 SyntaxError.

```js

// ---------- 회차 만들기·설정 도움 함수(Task 6) ----------
// import 는 끌어올려진다 — 파일 끝에 두어도 맨 위의 import 와 함께 먼저 읽힌다. Task 2 가 들여온 이름과 겹치지 않게.
import { EV_EDIT_KEYS, EV_CREATE_KEYS, pickEventPatch, eventFields, eventDiff, mergeEventPatch as mergeForKeyCheck }
  from "../supabase/functions/church-admin/events-rules.ts";

test("EV_EDIT_KEYS·EV_CREATE_KEYS — needs·copy·kind·id·sort_order 는 없다 · 만들기엔 status 도 없다", () => {
  assert.deepEqual(EV_EDIT_KEYS, ["title", "short_title", "subtitle", "season", "opens_on", "closes_on", "status", "list_until"]);
  for (const k of ["needs", "copy", "kind", "id", "sort_order", "updated_at"]) assert.ok(!EV_EDIT_KEYS.includes(k), k);
  assert.deepEqual(EV_CREATE_KEYS, ["title", "short_title", "subtitle", "season", "opens_on", "closes_on", "list_until"]);
});

test("EV_EDIT_KEYS 는 mergeEventPatch 가 받는 여덟 칸과 같다 — 어긋나면 고친 칸이 조용히 버려진다", () => {
  const cur = eventFields({ id: "x-1", title: "가", short_title: "나", subtitle: "다", season: "라",
    opens_on: "2026-10-01", closes_on: "2026-10-31", status: "draft", list_until: "2026-12-31" });
  const patch = { title: "t2", short_title: "s2", subtitle: "u2", season: "q2", opens_on: "2027-01-01",
    closes_on: "2027-01-31", status: "open", list_until: "2027-12-31" };
  assert.deepEqual(Object.keys(patch).sort(), [...EV_EDIT_KEYS].sort());
  const out = mergeForKeyCheck(cur, patch);
  for (const k of EV_EDIT_KEYS) assert.equal(out[k], patch[k], k);
  assert.equal(out.id, "x-1");
});

test("pickEventPatch — 고칠 수 있는 칸만 · 보낸 칸만 · 값은 글자로", () => {
  const p = pickEventPatch({ title: " 새 이름 ", needs: { eligibility: {} }, copy: { intro: "x" }, kind: "quiz",
    id: "other-id", sort_order: 3, list_until: null }, EV_EDIT_KEYS);
  assert.deepEqual(p, { title: " 새 이름 ", list_until: "" });            // 다듬기(trim)는 mergeEventPatch 가 한다
  assert.deepEqual(pickEventPatch({ status: "open", title: "가" }, EV_CREATE_KEYS), { title: "가" });
  assert.deepEqual(pickEventPatch({ title: 12, subtitle: true, season: { a: 1 }, opens_on: Number.NaN, closes_on: undefined }, EV_EDIT_KEYS),
    { title: "12", subtitle: "", season: "", opens_on: "", closes_on: "" });
  assert.deepEqual(pickEventPatch(null, EV_EDIT_KEYS), {});
  assert.deepEqual(pickEventPatch(["title"], EV_EDIT_KEYS), {});
  assert.deepEqual(pickEventPatch("title", EV_EDIT_KEYS), {});
  assert.deepEqual(pickEventPatch(Object.create({ title: "물려받은 칸" }), EV_EDIT_KEYS), {});   // hasOwnProperty
});

test("eventFields — 표의 한 줄 → 아홉 칸 · 나머지 칸은 버린다 · list_until 빈 것은 null", () => {
  assert.deepEqual(eventFields({ id: "lent-2026", title: "사순절", short_title: "", subtitle: null, season: "2026-1Q",
    opens_on: "2026-02-18", closes_on: "2026-04-04", status: "closed", list_until: null,
    needs: { position: true }, copy: {}, kind: "signup", sort_order: 0, updated_at: "2026-09-29T00:00:00+00:00" }),
    { id: "lent-2026", title: "사순절", short_title: "", subtitle: "", season: "2026-1Q",
      opens_on: "2026-02-18", closes_on: "2026-04-04", status: "closed", list_until: null });
  assert.deepEqual(eventFields({ list_until: "" }),
    { id: "", title: "", short_title: "", subtitle: "", season: "", opens_on: "", closes_on: "", status: "", list_until: null });
  assert.equal(eventFields({ list_until: "2026-12-31" }).list_until, "2026-12-31");
});

test("eventDiff — 바뀐 칸만 전·후 · 같으면 빈 것 · id 는 보지 않는다", () => {
  const a = eventFields({ id: "x-1", title: "가", opens_on: "2026-10-01", closes_on: "2026-10-31", status: "draft", list_until: null });
  assert.deepEqual(eventDiff(a, { ...a }), { before: {}, after: {} });
  assert.deepEqual(eventDiff(a, { ...a, status: "open", list_until: "2026-12-31" }),
    { before: { status: "draft", list_until: null }, after: { status: "open", list_until: "2026-12-31" } });
  assert.deepEqual(eventDiff({ ...a, list_until: "2026-12-31" }, a),
    { before: { list_until: "2026-12-31" }, after: { list_until: null } });
  assert.deepEqual(eventDiff(a, { ...a, id: "y-2" }), { before: {}, after: {} });
});
```

- [ ] **Step 2: 돌려서 실패하는지 본다**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
node --experimental-strip-types --test tests/events-rules.test.mjs
```
Expected: FAIL — `SyntaxError: The requested module '../supabase/functions/church-admin/events-rules.ts' does not provide an export named '…'`(이름 자리는 새 이름 다섯 가운데 하나 · 파일 전체가 한 건으로 실패 · `# fail 1`).

- [ ] **Step 3: `events-rules.ts` 끝에 구현**

파일 **끝에** 그대로 붙인다(자격 회차 판정·시작일 꺼내기는 Task 2 의 `isEligEvent`·`eligibilityStart` — 여기에 또 만들지 않는다):

```ts

// ---------- 회차 만들기·설정(Task 6) — 서버 evEventCreate·evEventSave 가 쓴다 ----------
// 담당자가 회차 설정에서 바꿀 수 있는 칸. needs·copy·kind·sort_order·id 는 **없다** —
// 가을 말씀 동행의 자격 규칙(needs.eligibility)·문구(copy)가 저장 한 번에 조용히 지워지지 않게(설계 §2).
// ⚠️ mergeEventPatch 안의 EVT_EDITABLE 과 **같은 여덟 칸**이어야 한다(시험이 맞대 본다).
export const EV_EDIT_KEYS = ["title", "short_title", "subtitle", "season", "opens_on", "closes_on", "status", "list_until"];
// 새 회차에 받는 칸 — status 도 없다(새 회차는 draft 로만 · 공개는 만든 뒤 설정에서 공개 확인을 거쳐).
export const EV_CREATE_KEYS = EV_EDIT_KEYS.filter((k) => k !== "status");

// 화면이 보낸 것에서 keys 에 든 칸만, **보낸 칸만**(hasOwnProperty — 물려받은 이름은 안 본다) 꺼낸다.
// 값은 글자로: 글자는 그대로(다듬기는 mergeEventPatch 가) · 유한한 숫자는 글자로 · 나머지(null·undefined·참거짓·객체)는 "".
// (mergeEventPatch 에 객체가 그대로 가면 「[object Object]」 라는 제목이 검사를 통과한다.)
export function pickEventPatch(src: unknown, keys: string[]): Record<string, string> {
  const o = src && typeof src === "object" && !Array.isArray(src) ? (src as Record<string, unknown>) : {};
  const out: Record<string, string> = {};
  for (const k of keys) {
    if (!Object.prototype.hasOwnProperty.call(o, k)) continue;
    const v = o[k];
    out[k] = typeof v === "string" ? v : typeof v === "number" && Number.isFinite(v) ? String(v) : "";
  }
  return out;
}

// events 표의 한 줄 → 규칙이 보는 아홉 칸(EvEvent). 날짜는 PostgREST 가 "YYYY-MM-DD" 글자로 준다.
// needs·copy·kind·sort_order·updated_at 같은 나머지 칸은 버린다.
export function eventFields(r: Record<string, unknown>): EvEvent {
  const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  const lu = r.list_until;
  return {
    id: s(r.id), title: s(r.title), short_title: s(r.short_title), subtitle: s(r.subtitle), season: s(r.season),
    opens_on: s(r.opens_on), closes_on: s(r.closes_on), status: s(r.status),
    list_until: lu === null || lu === undefined || lu === "" ? null : String(lu),
  };
}

// 바뀐 칸만 전·후로 — 서버가 update 할 칸이자 event.settings 기록의 detail. 같으면 둘 다 빈 것. id 는 보지 않는다.
export function eventDiff(before: EvEvent, after: EvEvent):
  { before: Record<string, string | null>; after: Record<string, string | null> } {
  const b: Record<string, string | null> = {};
  const a: Record<string, string | null> = {};
  const x = before as unknown as Record<string, string | null>;
  const y = after as unknown as Record<string, string | null>;
  for (const k of EV_EDIT_KEYS) {
    const p = x[k] ?? null, q = y[k] ?? null;
    if (p !== q) { b[k] = p; a[k] = q; }
  }
  return { before: b, after: a };
}
```

- [ ] **Step 4: 돌려서 통과하는지 본다**

```bash
node --experimental-strip-types --test tests/events-rules.test.mjs
```
Expected: PASS — `# fail 0`(Task 2 시험 + 새 시험 다섯).

- [ ] **Step 5: 커밋**

```bash
git add supabase/functions/church-admin/events-rules.ts tests/events-rules.test.mjs
git diff --cached --stat     # 이 두 파일만
git commit -m "feat(성경필사): 회차 설정 도움 함수 — 고칠 칸만 꺼내기·표 줄→아홉 칸·바뀐 칸 전후" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 6: 권한 시험의 기대 목록을 먼저 바꾼다(실패)** — `tests/authz.test.mjs`

앵커(Step 0 에서 `1` 을 본 것) — Task 5 bibleevent 시험 안의 기대 배열 **한 곳만** 바꾼다. 줄의 나머지(`assert.deepEqual(acts.sort(), …);`)는 그대로.

바꾸기 전:
```js
["evEvents", "evHistory", "evRoster", "evStats"]
```
바꾼 뒤:
```js
["evEventCreate", "evEventSave", "evEvents", "evHistory", "evRoster", "evStats"]
```
(JS 기본 정렬 = 위 차례.)

```bash
grep -cF '["evEventCreate", "evEventSave", "evEvents", "evHistory", "evRoster", "evStats"]' tests/authz.test.mjs   # 1
node --experimental-strip-types --test tests/authz.test.mjs
```
Expected: `1` · 그다음 FAIL — bibleevent 시험 한 건, `Expected values to be strictly deep-equal`(실제 넷 · 기대 여섯), `# fail 1`.

- [ ] **Step 7: `authz.ts` 에 두 줄** — 앵커 `  evStats: "bibleevent",` 줄 **바로 다음에**

```ts
  // 성경필사(암송) — 회차 만들기·설정(Task 6). 만들기는 draft 로만, 성도님께 보이게 되는 저장은
  // confirmListed 를 받아야 쓴다(needs-confirm). 둘 다 바꾼 기록(event.create·event.settings)에 남는다.
  evEventCreate: "bibleevent",
  evEventSave: "bibleevent",
```

```bash
grep -cF 'evEventSave: "bibleevent",' supabase/functions/church-admin/authz.ts   # 1
node --experimental-strip-types --test tests/authz.test.mjs tests/registry.test.mjs
```
Expected: `1` · PASS — `# fail 0`.

- [ ] **Step 8: 개발 서버 시험 — PROBE 두 줄** — `tests/server.dev.test.mjs`

`PROBE` 안, 앵커 `evStats: { event_ids:` 로 시작하는 줄(Task 5) **바로 다음에**:

```js
  // 성경필사(암송) — 회차 만들기·설정(Task 6). 만들기는 **틀린 id** 로 검사(bad-event-id)에서 떨어져 아무것도 만들지 않는다.
  evEventCreate: { event: { id: "Bad ID!" } },
  evEventSave: { event_id: "ca-test-probe-none", expect: "", patch: {} },   // 없는 회차 → not-found
```

(`after()` 는 고치지 않는다 — 아래 시험이 만드는 `ca-test-<STAMP>-new` 는 Task 5 의 `events?id=like.ca-test-*` 정리가 before()·after() 두 곳에서 지운다. Step 0 의 `2` 가 그것이다.)

- [ ] **Step 9: 개발 서버 시험 — 상수·도움 함수·시험 둘** — 파일 **끝에**(두 시험은 이 차례로 돈다 — 둘째가 첫째가 만든 회차를 쓴다)

회차 응답의 칸 목록은 Task 5 의 `EV_OUT_KEYS`(정렬된 열네 칸)를 그대로 쓴다 — 여기서 또 만들지 않는다.

```js

// ---------- 성경필사(암송) — 회차 만들기·설정(Task 6) ----------
// 시험 회차 — EVT_ID_RE 에 맞는 꼴. 지우기는 Task 5 의 before()·after() 가 events?id=like.ca-test-* 로 한다(줄은 CASCADE).
const EVC_NEW = `ca-test-${STAMP}-new`;
// 회차 응답에 새면 안 되는 것 — UUID 꼴 값(user_id 등)과 줄·설정 쪽 칸 이름
function evcNoLeak(body, label) {
  const text = JSON.stringify(body);
  assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(text), label + ": UUID 꼴 값이 실렸다");
  for (const k of ["user_id", "auth_user_id", "ident_key", "answers", "phone", "memo", "person_id", "needs", "copy", "sort_order"]) {
    assert.ok(!text.includes(`"${k}"`), label + ": " + k + " 칸이 실렸다");
  }
}

test("evEventCreate — 회차 만들기: 검사 코드마다 아무것도 안 만든다 · draft 고정 · needs 기본값 · kind signup · sort_order 0 · exists · 기록", async () => {
  const t = people.bibleevent.token;
  const base = { id: EVC_NEW, title: "ca-test 회차", short_title: "시험", subtitle: "", season: "2026-4Q",
    opens_on: "2026-10-20", closes_on: "2026-11-30", list_until: "" };
  const bad = [
    [{ ...base, id: "Bad ID!" }, "bad-event-id"],
    [{ ...base, id: "a" }, "bad-event-id"],                    // 두 글자 이상
    [{ ...base, id: undefined }, "bad-event-id"],              // id 없음(JSON 에서 빠진다)
    [{ ...base, id: 12345 }, "bad-event-id"],                  // 글자가 아닌 id
    [{ ...base, title: "   " }, "no-title"],
    [{ ...base, title: { a: 1 } }, "no-title"],                // 객체는 "" 로 — 「[object Object]」 제목이 생기지 않는다
    [{ ...base, opens_on: "2026/10/20" }, "bad-period"],
    [{ ...base, closes_on: "2026-10-01" }, "period-reversed"],
    [{ ...base, list_until: "언젠가" }, "bad-list-until"],
    [{ ...base, list_until: "2026-11-01" }, "list-until-before-close"],
  ];
  for (const [event, code] of bad) {
    const r = await call(t, "evEventCreate", { event });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body, { ok: false, error: code }, JSON.stringify(event));
  }
  assert.deepEqual(await rest(`events?select=id&id=eq.${EVC_NEW}`, "GET"), [], "검사에 걸린 만들기가 회차를 남겼다");
  assert.deepEqual(await rest(`events?select=id&id=eq.12345`, "GET"), [], "글자가 아닌 id 로 회차가 생겼다");

  // 만들기 — 상태·종류·needs·copy·sort_order 를 보내도 서버가 정한다(draft · signup · 직분만 받는 기본 needs · 빈 copy · 0)
  const c = await call(t, "evEventCreate", { event: { ...base, status: "open", kind: "quiz", sort_order: 7,
    needs: { eligibility: { start: "2026-01-01" } }, copy: { intro: "x" } } });
  assert.equal(c.body.ok, true, JSON.stringify(c.body));
  assert.deepEqual(Object.keys(c.body).sort(), ["event", "ok"]);
  assert.deepEqual(Object.keys(c.body.event).sort(), EV_OUT_KEYS);
  evcNoLeak(c.body, "evEventCreate");
  assert.equal(c.body.event.id, EVC_NEW);
  assert.equal(c.body.event.title, "ca-test 회차");
  assert.equal(c.body.event.status, "draft");
  assert.equal(c.body.event.kind, "signup");
  assert.equal(c.body.event.list_until, null);
  assert.equal(c.body.event.count, 0);
  assert.equal(c.body.event.listedNow, false);
  assert.equal(c.body.event.hasEligibility, false);
  const [row] = await rest(`events?select=status,kind,needs,copy,list_until,sort_order,updated_at&id=eq.${EVC_NEW}`, "GET");
  const { updated_at: dbUpdatedAt, ...stored } = row;
  assert.deepEqual(stored, { status: "draft", kind: "signup", needs: { position: true, phone: false, memo: false, extra: [] },
    copy: {}, list_until: null, sort_order: 0 });
  assert.equal(c.body.event.updated_at, dbUpdatedAt, "화면이 expect 로 쓸 updated_at 이 DB 와 같아야 한다");

  // 같은 id 다시 → exists · 덮어쓰지 않는다
  const again = await call(t, "evEventCreate", { event: { ...base, title: "덮어쓰기 시도" } });
  assert.deepEqual(again.body, { ok: false, error: "exists" });
  assert.equal((await rest(`events?select=title&id=eq.${EVC_NEW}`, "GET"))[0].title, "ca-test 회차");

  // 기록 — event.create 한 줄(바꾼 기록 기본 보기) · 검사에 걸린 것·exists 는 기록을 남기지 않는다
  const logs = (await call(people.super.token, "auditList", { limit: 50 })).body.rows
    .filter((r) => r.action === "event.create" && r.target === EVC_NEW);
  assert.equal(logs.length, 1, JSON.stringify(logs));
  assert.equal(logs[0].detail.title, "ca-test 회차");
  assert.deepEqual(logs[0].detail.before, {});
  assert.deepEqual(logs[0].detail.after, { title: "ca-test 회차", short_title: "시험", subtitle: "", season: "2026-4Q",
    opens_on: "2026-10-20", closes_on: "2026-11-30", status: "draft", list_until: null });
});

test("evEventSave — 회차 설정: 없는 회차 · expect(conflict) · 검사 코드 · 보낸 칸만 · 공개 확인은 쓰기 전에(needs-confirm 이면 그대로) · 지난 공개 종료일 · 자격 시작일 · 기록", async () => {
  const t = people.bibleevent.token;
  const COLS = "id,title,short_title,subtitle,season,kind,status,opens_on,closes_on,list_until,needs,copy,sort_order,updated_at";
  const read = async () => (await rest(`events?select=${COLS}&id=eq.${EVC_NEW}`, "GET"))[0];
  const save = (expect, patch, extra = {}) => call(t, "evEventSave", { event_id: EVC_NEW, expect, patch, ...extra });
  const settingsLogs = async () => (await call(people.super.token, "auditList", { limit: 200 })).body.rows
    .filter((r) => r.action === "event.settings" && r.target === EVC_NEW);
  const okShape = (r, label) => {
    assert.equal(r.body.ok, true, label + " " + JSON.stringify(r.body));
    assert.deepEqual(Object.keys(r.body).sort(), ["event", "listedBefore", "listedNow", "ok"], label);
    assert.deepEqual(Object.keys(r.body.event).sort(), EV_OUT_KEYS, label);
    evcNoLeak(r.body, label);
  };
  let cur = await read();
  assert.ok(cur, "앞 시험(evEventCreate)이 만든 회차가 있어야 한다");

  // 없는 회차 · 모양이 틀린 id · 빈 id → not-found(아무것도 안 만든다)
  for (const event_id of [`ca-test-${STAMP}-none`, "Bad ID!", ""]) {
    const r = await call(t, "evEventSave", { event_id, expect: cur.updated_at, patch: { title: "x" } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body, { ok: false, error: "not-found" }, event_id);
  }
  assert.deepEqual(await rest(`events?select=id&id=eq.ca-test-${STAMP}-none`, "GET"), []);

  // expect 가 없거나 다르면 conflict
  assert.deepEqual((await call(t, "evEventSave", { event_id: EVC_NEW, patch: { title: "x" } })).body, { ok: false, error: "conflict" });
  assert.deepEqual((await save("2000-01-01T00:00:00+00:00", { title: "x" })).body, { ok: false, error: "conflict" });
  assert.deepEqual(await read(), cur, "conflict 인데 줄이 바뀌었다");

  // 검사 코드 — 하나씩, 줄은 그대로
  const bad = [
    [{ title: "  " }, "no-title"],
    [{ opens_on: "2026/10/20" }, "bad-period"],
    [{ closes_on: "" }, "bad-period"],
    [{ closes_on: "2026-10-01" }, "period-reversed"],
    [{ status: "published" }, "bad-status"],
    [{ list_until: "언젠가" }, "bad-list-until"],
    [{ list_until: "2026-11-01" }, "list-until-before-close"],
    [{ closes_on: "2026-12-31", list_until: "2026-12-01" }, "list-until-before-close"],
  ];
  for (const [patch, code] of bad) {
    assert.deepEqual((await save(cur.updated_at, patch)).body, { ok: false, error: code }, JSON.stringify(patch));
  }
  assert.deepEqual(await read(), cur, "검사에 걸린 저장이 줄을 바꿨다");

  // 보낸 칸만 — needs·kind·copy·id·sort_order 는 보내도 버린다
  const s1 = await save(cur.updated_at, { subtitle: "  시험 부제  ", needs: {}, kind: "quiz", copy: { intro: "x" },
    id: `ca-test-${STAMP}-hijack`, sort_order: 99 });
  okShape(s1, "보낸 칸만");
  assert.equal(s1.body.listedBefore, false);
  assert.equal(s1.body.listedNow, false);
  assert.equal(s1.body.event.subtitle, "시험 부제");
  const r1 = await read();
  assert.equal(r1.subtitle, "시험 부제");
  assert.notEqual(r1.updated_at, cur.updated_at);
  assert.equal(s1.body.event.updated_at, r1.updated_at);
  assert.deepEqual({ ...r1, subtitle: cur.subtitle, updated_at: cur.updated_at }, cur, "부제·updated_at 밖의 칸이 바뀌었다");
  assert.deepEqual(await rest(`events?select=id&id=eq.ca-test-${STAMP}-hijack`, "GET"), [], "id 가 바뀌거나 새 회차가 생겼다");

  // 옛 expect 로 또 → conflict(그사이 누가 고친 것과 같다) · 줄은 그대로
  assert.deepEqual((await save(cur.updated_at, { title: "늦은 저장" })).body, { ok: false, error: "conflict" });
  assert.deepEqual(await read(), r1);
  cur = r1;

  // 바뀐 것이 없으면 쓰지 않는다(updated_at 그대로)
  const same = await save(cur.updated_at, { subtitle: "시험 부제" });
  okShape(same, "바뀐 것 없음");
  assert.equal(same.body.event.updated_at, cur.updated_at);
  assert.deepEqual(await read(), cur);

  // 공개 확인 — 안 보이던 회차가 보이게 되는 저장은 confirmListed:true 가 없으면 **아무것도 쓰지 않는다**
  const n0 = (await settingsLogs()).length;
  for (const extra of [{}, { confirmListed: "true" }, { confirmListed: 1 }, { confirmListed: false }]) {
    for (const status of ["open", "closed"]) {
      const r = await save(cur.updated_at, { status, title: "보이게 하며 고친 이름" }, extra);
      assert.deepEqual(r.body, { ok: false, error: "needs-confirm" }, status + " " + JSON.stringify(extra));
    }
  }
  assert.deepEqual(await read(), cur, "needs-confirm 인데 줄이 바뀌었다");
  assert.equal((await settingsLogs()).length, n0, "needs-confirm 인데 기록이 남았다");

  // 확인을 받으면 쓴다                                                                   (기록 1)
  const open = await save(cur.updated_at, { status: "open" }, { confirmListed: true });
  okShape(open, "공개");
  assert.equal(open.body.listedBefore, false);
  assert.equal(open.body.listedNow, true);
  assert.equal(open.body.event.status, "open");
  assert.equal(open.body.event.listedNow, true);
  cur = await read();
  // 이미 보이는 회차의 다른 칸은 확인 없이                                                 (기록 2)
  const ren = await save(cur.updated_at, { title: "ca-test 회차 고침" });
  okShape(ren, "보이는 회차 이름 고치기");
  assert.equal(ren.body.listedBefore, true);
  assert.equal(ren.body.listedNow, true);
  cur = await read();
  // 다시 draft — 안 보이게 하는 것은 확인 없이(개발 첫 화면에 오래 두지 않는다)               (기록 3)
  const hide = await save(cur.updated_at, { status: "draft" });
  okShape(hide, "다시 draft");
  assert.equal(hide.body.listedBefore, true);
  assert.equal(hide.body.listedNow, false);
  cur = await read();
  assert.equal(cur.status, "draft");

  // 공개 종료일 — 날짜로 넣었다가 비우면 null                                              (기록 4·5)
  const lu = await save(cur.updated_at, { list_until: "2026-12-31" });
  okShape(lu, "공개 종료일");
  assert.equal(lu.body.event.list_until, "2026-12-31");
  cur = await read();
  const lu2 = await save(cur.updated_at, { list_until: "" });
  okShape(lu2, "공개 종료일 비우기");
  assert.equal(lu2.body.event.list_until, null);
  cur = await read();
  assert.equal(cur.list_until, null);

  // 공개 종료일이 지나 안 보이던 회차 — 종료일을 비우거나 늦추면 다시 보이게 된다 → 역시 확인이 먼저
  // (서비스 키로 옛 회차 모양을 만든다 — 2000년 날짜라 오늘이 언제든 「지났다」)
  await rest(`events?id=eq.${EVC_NEW}`, "PATCH",
    { status: "closed", opens_on: "2000-01-01", closes_on: "2000-01-31", list_until: "2000-02-01" });
  cur = await read();
  for (const list_until of ["", "2099-12-31"]) {
    assert.deepEqual((await save(cur.updated_at, { list_until })).body, { ok: false, error: "needs-confirm" }, "list_until " + list_until);
  }
  assert.deepEqual(await read(), cur, "needs-confirm 인데 줄이 바뀌었다(공개 종료일)");
  // 지난 날짜끼리 바꾸는 것은 여전히 안 보이므로 확인 없이                                  (기록 6)
  const past = await save(cur.updated_at, { list_until: "2000-03-01" });
  okShape(past, "지난 공개 종료일");
  assert.deepEqual([past.body.listedBefore, past.body.listedNow], [false, false]);
  // 되돌린다(서비스 키 — 기록 없음)
  await rest(`events?id=eq.${EVC_NEW}`, "PATCH",
    { status: "draft", opens_on: "2026-10-20", closes_on: "2026-11-30", list_until: null });
  cur = await read();

  // 자격 회차 — opens_on 은 needs.eligibility.start 보다 앞설 수 없다 · 저장해도 needs 는 그대로   (기록 7)
  const needs = { position: true, phone: false, memo: false, extra: [],
    eligibility: { start: "2026-10-11", weeks: 6, perWeek: 3, need: 3, minNeed: 2 } };
  await rest(`events?id=eq.${EVC_NEW}`, "PATCH", { needs });   // 서비스 키로 — 이 메뉴는 needs 를 못 바꾼다
  cur = await read();
  assert.deepEqual((await save(cur.updated_at, { opens_on: "2026-10-01" })).body, { ok: false, error: "before-eligibility" });
  assert.deepEqual(await read(), cur);
  const el = await save(cur.updated_at, { opens_on: "2026-10-11" });          // 같은 날은 된다
  okShape(el, "자격 시작일과 같은 날");
  assert.equal(el.body.event.hasEligibility, true);
  assert.deepEqual((await read()).needs, needs, "저장 한 번에 자격 규칙이 바뀌었다");

  // 기록 — 바뀐 저장만, 바뀐 칸만 전·후로
  const logs = await settingsLogs();
  assert.equal(logs.length, n0 + 7, "공개·이름·draft·종료일 둘·지난 종료일·시작일 = 일곱 건");
  const opened = logs.find((r) => r.detail?.after?.status === "open");
  assert.ok(opened, "공개로 바꾼 기록이 없다");
  assert.deepEqual(opened.detail.before, { status: "draft" });
  assert.deepEqual(opened.detail.after, { status: "open" });
  assert.equal(opened.detail.title, "ca-test 회차");
  const sub = logs.find((r) => r.detail?.after?.subtitle === "시험 부제");
  assert.ok(sub, "부제 기록이 없다");
  assert.deepEqual(sub.detail.before, { subtitle: "" });
  assert.deepEqual(sub.detail.after, { subtitle: "시험 부제" });            // needs·kind·copy 는 기록에도 없다
});
```

```bash
node --check tests/server.dev.test.mjs && echo "server.dev 문법 통과"
```
Expected: `server.dev 문법 통과`(이 파일은 `.mjs` 라 `node --check` 가 문법을 제대로 본다).

- [ ] **Step 10: 배포 전에 돌려서 실패하는지 본다** (지금 개발 함수는 Task 5 판이라 두 액션을 모른다)

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
set -a; . ~/.church-admin/dev.env; set +a
node --experimental-strip-types --test --test-name-pattern="evEventCreate|evEventSave" tests/server.dev.test.mjs
```
Expected: FAIL — `evEventCreate — …` 는 첫 호출이 `400 unknown-action` 이라 `400 !== 200`, `evEventSave — …` 는 `앞 시험(evEventCreate)이 만든 회차가 있어야 한다`. `# fail 2`. (after() 의 정리 단계는 지울 것이 없어 통과 — 「정리 실패」 줄이 없어야 한다.)

- [ ] **Step 11: `index.ts` — 새 import 문**

기존 import 줄은 **다시 쓰지 않는다**(Task 5 의 `./events-rules.ts` 줄도 그대로). 먼저 지금 무엇을 들여왔는지 본다:

```bash
cat > /tmp/t6-imports.cjs <<'EOF'
// index.ts 가 ./events-rules.ts 에서 들여온 이름 — 같은 이름을 두 번 들여오면 배포가 SyntaxError 로 거절된다
const src = require("fs").readFileSync("supabase/functions/church-admin/index.ts", "utf8");
const got = [];
for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*"\.\/events-rules\.ts"/g))
  for (const part of m[1].split(",")) {
    const name = part.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop().trim();
    if (name) got.push(name);
  }
const T6 = ["BE_NEEDS_DEFAULT", "checkEvent", "eligibilityStart", "EV_CREATE_KEYS", "EV_EDIT_KEYS", "eventDiff",
  "eventFields", "mergeEventPatch", "pickEventPatch", "EvEvent"];
const FROM_T5 = ["EVT_ID_RE", "evtListable", "kstToday", "BE_BAD_CHARS", "BE_FIELD_MAX"];
const twice = [...new Set(got.filter((n, i) => got.indexOf(n) !== i))];
console.log("두 번 들여온 이름: " + (twice.join(", ") || "없음"));
console.log("Task 5 가 들여왔어야 하는데 없는 것: " + (FROM_T5.filter((n) => !got.includes(n)).join(", ") || "없음"));
console.log("Task 6 이름 중 이미 들여온 것: " + (T6.filter((n) => got.includes(n)).join(", ") || "없음"));
console.log("Task 6 이름 중 아직 안 들여온 것: " + (T6.filter((n) => !got.includes(n)).join(", ") || "없음"));
EOF
node /tmp/t6-imports.cjs
```
Expected:
```
두 번 들여온 이름: 없음
Task 5 가 들여왔어야 하는데 없는 것: 없음
Task 6 이름 중 이미 들여온 것: 없음
Task 6 이름 중 아직 안 들여온 것: BE_NEEDS_DEFAULT, checkEvent, eligibilityStart, EV_CREATE_KEYS, EV_EDIT_KEYS, eventDiff, eventFields, mergeEventPatch, pickEventPatch, EvEvent
```
셋째 줄에 이름이 나오면(Task 5 가 먼저 들여왔다) 아래 import 문에서 **그 이름만 뺀다**. 둘째 줄에 이름이 나오면 멈춘다(Task 5 가 덜 끝났다 — `evHistory`·`evRead` 가 ReferenceError 로 500 이 된다).

앵커 `const cors = {`(Step 0 에서 `1`) — 그 줄 **바로 위의 빈 줄 앞에** import 문 하나를 더한다. 바꾸기 전:

```ts

const cors = {
```
바꾼 뒤:

```ts
// 성경필사(암송) 회차 만들기·설정(Task 6)이 더 쓰는 이름 — ⚠️ 위의 import 에 이미 있는 이름(EVT_ID_RE·evtListable·kstToday 등)은 적지 않는다.
import { BE_NEEDS_DEFAULT, checkEvent, eligibilityStart, EV_CREATE_KEYS, EV_EDIT_KEYS, eventDiff, eventFields, mergeEventPatch, pickEventPatch, type EvEvent } from "./events-rules.ts";

const cors = {
```

```bash
node /tmp/t6-imports.cjs
grep -cF 'import { BE_NEEDS_DEFAULT, checkEvent, eligibilityStart,' supabase/functions/church-admin/index.ts
```
Expected: `두 번 들여온 이름: 없음` · `Task 5 가 들여왔어야 하는데 없는 것: 없음` · `Task 6 이름 중 아직 안 들여온 것: 없음` · 마지막 숫자 `1`.

- [ ] **Step 12: `index.ts` — 두 액션** — 앵커 `Deno.serve(async (req) => {`(Step 0 에서 `1`) **바로 앞에**(= Task 5 절의 마지막 함수 `evStats` 뒤) 아래 절과 빈 줄 하나를 넣는다

```ts
// ---------- 성경필사(암송) — 회차 만들기·설정 (Task 6) ----------
// 설계 §2 evEventCreate·evEventSave · 옛 동작: 성경암송 api eventSave(docs/port/event-roster-legacy.md).
//   옛것은 만들기·고치기를 upsert 하나로 했다 — 여기서는 둘로 나눈다(만들기는 insert 만 · 고치기는 있는 회차만).
// ⚠️ needs·copy·kind·sort_order 는 받지 않는다(EV_EDIT_KEYS 밖) — 가을 말씀 동행의 자격 규칙·문구가
//    저장 한 번에 지워지지 않게. 보내도 버린다. sort_order 는 새 회차도 DB 기본값 0(이번에 설정 화면에 없다).
// ⚠️ 공개 확인은 **쓰기 전에** — 지금 성도님께 안 보이는 회차가 이 저장으로 보이게 되면(evtListable 전후)
//    confirmListed:true 없이는 아무것도 쓰지 않고 needs-confirm. 화면이 확인 창을 띄운 뒤 다시 보낸다.
//    저장한 뒤에 물으면 확인을 누르기 전부터 명단(이름·소속·직분)이 로그인 없이 보인다.
//    상태를 open·closed 로 바꿀 때만이 아니라 지난 공개 종료일을 비우거나 늦출 때도 같다.
// ⚠️ 자격 회차의 기준일은 eligibilityStart(needs) 하나로만 꺼낸다(Task 2 · evOut 의 hasEligibility 는 isEligEvent).
async function evEventCreate(ctx: Ctx, b: any) {
  const src = b.event && typeof b.event === "object" && !Array.isArray(b.event) ? b.event : {};
  const id = typeof src.id === "string" ? src.id.trim() : "";
  if (!EVT_ID_RE.test(id)) return { ok: false, error: "bad-event-id" };   // 만든 뒤엔 못 바꾼다(주소 ?ev= 에 쓰인다)
  const blank: EvEvent = { id, title: "", short_title: "", subtitle: "", season: "",
    opens_on: "", closes_on: "", status: "draft", list_until: null };
  // 새 회차는 draft 로만 — status 는 EV_CREATE_KEYS 에 없어 보내도 버려진다. 공개는 만든 뒤 설정에서(공개 확인을 거쳐).
  const ev: EvEvent = { ...mergeEventPatch(blank, pickEventPatch(src, EV_CREATE_KEYS)), id, status: "draft" };
  const bad = checkEvent(ev, null);   // 같은 검사 함수 — DB CHECK(기간)에 걸려 500 이 나지 않게. 새 회차엔 자격 규칙이 없다.
  if (bad) return { ok: false, error: bad };
  const { error } = await db.from("events").insert({
    id, title: ev.title, short_title: ev.short_title, subtitle: ev.subtitle, season: ev.season,
    opens_on: ev.opens_on, closes_on: ev.closes_on, list_until: ev.list_until, status: "draft",
    kind: "signup", needs: structuredClone(BE_NEEDS_DEFAULT),   // 앱 등록 폼에 직분 칸이 생기게(설계 §2) — 사본을 넣는다
    // copy·sort_order·created_at·updated_at 은 DB 기본값({} · 0 · now())
  });
  if (error) {
    if ((error as any).code === "23505") return { ok: false, error: "exists" };   // 있는 회차는 덮지 않는다
    throw error;
  }
  const saved = await evRead(id);
  if (!saved) return { ok: false, error: "not-found" };
  const f = eventFields(saved);
  const after: Record<string, string | null> = {};
  for (const k of EV_EDIT_KEYS) after[k] = (f as unknown as Record<string, string | null>)[k];
  await audit(ctx, "event.create", id, { title: f.title, before: {}, after });
  return { ok: true, event: evOut(saved, 0) };
}

async function evEventSave(ctx: Ctx, b: any) {
  const cur = await evRead(b.event_id);   // 모양이 틀린 id·빈 id 는 묻지 않고 null(Task 5)
  if (!cur) return { ok: false, error: "not-found" };
  const id: string = cur.id;
  // 화면이 본 판과 지금 판이 다르면 — 그사이 누가 고쳤다(expect = 그 회차의 updated_at 글자 그대로)
  if (typeof b.expect !== "string" || b.expect !== cur.updated_at) return { ok: false, error: "conflict" };
  const before = eventFields(cur);
  const next: EvEvent = { ...mergeEventPatch(before, pickEventPatch(b.patch, EV_EDIT_KEYS)), id };
  // 합친 회차 전체를 검사한다 — 마감일만 늦춰 공개 종료일보다 뒤로 가는 것도 여기서 잡힌다
  const bad = checkEvent(next, eligibilityStart(cur.needs));
  if (bad) return { ok: false, error: bad };
  const today = kstToday();
  const listedBefore = evtListable(before, today);
  const listedNow = evtListable(next, today);
  if (!listedBefore && listedNow && b.confirmListed !== true) return { ok: false, error: "needs-confirm" };
  const diff = eventDiff(before, next);
  let saved = cur;
  if (Object.keys(diff.after).length) {
    // 조건부 update — 읽은 뒤 쓰기 전 사이에 다른 담당자가 저장했으면 0행 → conflict(남의 저장을 덮지 않는다)
    const { data: upd, error } = await db.from("events")
      .update({ ...diff.after, updated_at: new Date().toISOString() })
      .eq("id", id).eq("updated_at", cur.updated_at).select("id");
    if (error) throw error;
    if (!upd?.length) return { ok: false, error: "conflict" };
    saved = await evRead(id);
    if (!saved) return { ok: false, error: "not-found" };
    await audit(ctx, "event.settings", id, { title: saved.title, before: diff.before, after: diff.after });
  }
  const count = (await evCountMap([id])).get(id) ?? 0;
  return { ok: true, event: evOut(saved, count), listedBefore, listedNow };
}

```

```bash
grep -cE '^async function (evEventCreate|evEventSave)\(' supabase/functions/church-admin/index.ts   # 2
grep -cF 'Deno.serve(async (req) => {' supabase/functions/church-admin/index.ts                     # 1
```

- [ ] **Step 13: `index.ts` — switch 두 줄** — 앵커 `case "evStats":` 가 든 줄(Step 0 에서 `1`) **바로 다음에**

```ts
      case "evEventCreate": return json(await evEventCreate(ctx, b));
      case "evEventSave":   return json(await evEventSave(ctx, b));
```

```bash
grep -cE 'case "(evEventCreate|evEventSave)":' supabase/functions/church-admin/index.ts   # 2
```

- [ ] **Step 14: preflight · 커밋 · 개발 배포(문법 검사) · 개발 시험 전체**

`index.ts` 의 문법은 `node --check` 로 보지 않는다(TS 문법 오류를 못 잡는다) — **개발 함수 배포**가 검사한다. 배포가 실패하면 멈추고 고친다.

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
python tools/preflight.py
```
Expected: 끝줄 `모두 통과`(preflight 는 순수 시험 — events-rules·authz 포함 — 을 돌리고 index.ts 는 읽지 않는다).

```bash
git add supabase/functions/church-admin/authz.ts supabase/functions/church-admin/index.ts tests/authz.test.mjs tests/server.dev.test.mjs
git diff --cached --stat     # 이 네 파일만
git commit -m "feat(성경필사): 회차 만들기·설정 — 만들기는 draft 로만(있으면 exists) · 보낸 칸만(needs·copy·kind·sort_order 안 받음) · 공개 확인은 쓰기 전에(needs-confirm) · expect 로 동시 수정 막기 · 바꾼 기록" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git status --short           # 비어 있어야 한다 — 배포는 작업 트리를 올린다
supabase functions deploy church-admin --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo   # 워크트리 루트에서(supabase/functions·config.toml 이 있는 곳 — supa-dev 가 아니다)
```
Expected: `Deployed Functions on project ktpwthwqzgcqcrmsafdo: church-admin`. 배포가 문법 오류(예: 같은 이름을 두 번 들여옴)로 실패하면 고치고 **새 커밋** → 다시 배포.

```bash
set -a; . ~/.church-admin/dev.env; set +a
node --experimental-strip-types --test tests/server.dev.test.mjs
```
Expected: PASS — `# fail 0`. 새 시험 둘 + 「역할이 필요한 액션마다 시험 입력(PROBE)이 있다」 + 권한 표(bibleevent·super 는 `evEventCreate` PROBE 에서 `bad-event-id`, `evEventSave` PROBE 에서 `not-found` — 200 · 게이트 아님, 나머지 사람은 403) 모두 통과하고, Task 5 의 정리 단계 「성경필사 시험 회차」가 `ca-test-*` 회차를 모두 지워 「정리 실패」 줄이 없다. 실패하면 고치고 **새 커밋**으로(`--amend` 하지 않는다) → 다시 배포 → 다시 시험. ⚠️ 운영(`xnomlgydifiqiybervtf`)에는 배포하지 않는다 — 운영은 Task 15 에서만. 푸시하지 않는다.


### Task 7: 서버 — 한 분 더하기 · 줄 고치기 · 빼기 (`evRowAdd`·`evRowSave`·`evRowDelete` + `usersByKeys`·`sameInEvent`)

모든 명령은 워크트리 `C:\Projects\church-admin\.worktrees\bible-events` 에서(Git Bash: `cd /c/Projects/church-admin/.worktrees/bible-events`). 기준은 church-admin main `a2dfd7c` + Task 1~6.
**줄 번호를 쓰지 않는다** — 고칠 자리는 모두 앵커 글로 찾고, Step 1 에서 앵커마다 `grep -c` 가 `1` 인지 먼저 본다(실행하는 날 main·앞 과제가 줄을 밀었을 수 있다).

**Files:**
- Create: `supabase/functions/church-admin/events-rows.ts` — 폼 한 줄·「보낸 칸만」·「바뀐 칸만」·메모 머리·`.in()` 거르기(순수 함수 — 규칙 자체는 Task 2 의 `tidyRow`·`checkRow`·`candidateKeys` 를 부르기만 한다)
- Create: `tests/events-rows.test.mjs`
- Modify: `supabase/functions/church-admin/authz.ts` — 앵커 `evEventSave: "bibleevent",`(Task 6) 줄 바로 뒤에 세 줄
- Modify: `tests/authz.test.mjs` — Task 6 이 고친 bibleevent 블록의 기대 목록 한 줄(앵커로 찾아 바꾸기)
- Modify: `supabase/functions/church-admin/index.ts` — **새 import 문 둘**(기존 import 줄은 건드리지 않는다) · 앵커 `Deno.serve(async (req) => {` 줄 바로 **앞**에 새 절(도움 함수 넷 + 액션 셋) · 앵커 `case "evEventSave":`(Task 6) 줄 바로 뒤에 case 세 줄
- Modify: `tests/server.dev.test.mjs` — 앵커 `const PHOTO_PATH = …` 줄 뒤(상수) · `PROBE` 의 `  evEventSave: {`(Task 6) 줄 뒤 · `after()` 의 `if (errs.length) throw new Error("정리 실패 "` 줄 앞 · 파일 끝에 시험 넷

**Interfaces:**
- Consumes:
  - Task 2 `events-rules.ts`: `tidyRow(r: {who_type?, group_name?, sub_name?, name?, position?}): EvRow`(한 분 더하기·고치기·올리기가 함께 쓰는 다듬기) · `checkRow(row: EvRow): string | null` · `checkNote(note: unknown): string | null` · `identKey(row: EvRow): string` · `candidateKeys(row: EvRow): string[]`(「07」·「0N목장」·NFC/NFD 포함) · `isEligEvent(needs: unknown): boolean`(계약 §5 — 자격 회차 판정은 이 하나) · `type EvRow`
  - Task 3 `people-match.ts`: `applicantFromSignup(r)` · 기존 `churchFor`
  - Task 5 `index.ts`: `EV_ROW_COLS`(줄 칸 목록 — 이것 하나만 쓴다) · `evRead(id: unknown): Promise<events 한 줄(needs 포함) | null>`(모양이 틀린 id 는 묻지 않고 null) · `rowOut(r, church): RowOut` · 기존 `db`·`audit`·`churchLookup`·`json`·`type Ctx`
  - Task 5 `server.dev.test.mjs`: `people.bibleevent` · `want()` 의 bibleevent 칸 · `ROW_OUT_KEYS` · `after()` 의 「성경필사 시험 회차」 단계(`events?id=like.ca-test-*` 를 지운다 — 줄은 CASCADE)
  - `paper.ts`: `legacyNorm` · `MIN_POSITIONS`
- Produces:
  - `events-rows.ts`: `ADD_TAG = "담당자가 더함"` · `ROW_FIELDS` · `type RowField` · `formRow(x: unknown): EvRow` · `rowPatch(cur: EvRow, patch: unknown): { next: EvRow; changed: RowField[] }` · `touchesRow(patch: unknown): boolean` · `checkChanged(next: EvRow, changed: readonly string[]): string | null` · `sameKeys(row: EvRow): string[]`(= `candidateKeys` — Task 8 도 이 이름으로 부른다) · `askableKeys(keys: readonly unknown[]): string[]` · `tagNote(tag: string, note: unknown): string` · `oddPosition(position: string): boolean`
  - `index.ts`: `usersByKeys(keys: string[]): Promise<Map<string, string[]>>` · `sameInEvent(eventId: string, row: EvRow, excludeId?: number): Promise<"already" | null>` · `evRowRead(id: number)` · `evRowChurch(r)`
  - 액션(모두 `bibleevent`):
    - `evRowAdd {event_id, row:{who_type,group,sub,name,position,note}}` → `{ok, row:RowOut, linked:boolean, warnings:string[]}` — `warnings` 는 화면이 그대로 보일 한국어 문장
    - `evRowSave {id, expect, patch:{who_type?,group?,sub?,name?,position?,note?}}` → `{ok, row:RowOut}`
    - `evRowDelete {id, expect}` → `{ok, deleted:{id,name}}`
    - 오류: `not-found` · `conflict` · `already` · `eligibility-event`(자격 회차에 더하기·**빼기**) · `app-row-note-only` · `app-row` · 판정표 코드(`no-name`·`bad-char`·`too-long`·`bad-type`·`bad-group`·`no-group`·`bad-sub`·`note-too-long`)
  - 바꾼 기록(`admin_audit`) 모양 — Task 13 `audit.js` 가 이 모양을 읽는다:
    - `event.add` · target 줄 id · `{event_id, name, row:{who_type,group,sub,position}, linked:boolean}`
    - `event.edit` · target 줄 id · `{event_id, name, before:{바뀐 칸…}, after:{바뀐 칸…}}` (칸 이름은 화면 이름 `who_type`·`group`·`sub`·`name`·`position`, 메모가 바뀌면 `note` — 바뀐 칸만 담긴다)
    - `event.delete` · target 줄 id · `{event_id, name, row:{who_type,group,sub,position,note,source,hasUser}}`

> **왜 새 순수 모듈(`events-rows.ts`)인가** — 「폼 한 줄 다듬기」·「보낸 칸만 얹기」·「바뀐 칸만 검사」(설계 §1 끝)·「메모 머리 표기」·「`.in()` 에 못 넣는 키 거르기」를 Node 시험으로 붙잡으려면 index.ts 밖에 있어야 한다.
> 규칙은 **새로 만들지 않는다**: 다듬기는 Task 2 `tidyRow`(올리기 `tidyRaw` 가 부르는 것과 같은 함수), 판정은 `checkRow`, 같은 분 후보 키는 `candidateKeys`(Task 2 가 한 자리 목장의 「0N」까지 만든다 — 담당자 줄을 「7」로 다듬어도 앱에서 「07」로 낸 줄을 찾는다, 설계 §1-1), 자격 회차는 `isEligEvent`(계약 §5 — 화면의 `hasEligibility` 와 같은 함수). `sameKeys` 는 `candidateKeys` 를 그대로 부르는 이름이고, 둘이 같다는 것을 시험이 못 박는다.
> Task 2 파일(`events-rules.ts`)과 그 시험은 건드리지 않는다.

- [ ] **Step 1: 선행 확인 — 앞 과제의 이름·앵커가 있고, 이 과제의 이름은 아직 없는가**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
# ① 순수 모듈 이름(Task 2·3 · 계약 §5 의 isEligEvent 포함)
node --experimental-strip-types --input-type=module -e "
const need = {
  './supabase/functions/church-admin/events-rules.ts': ['tidyRow', 'checkRow', 'checkNote', 'identKey', 'candidateKeys', 'isEligEvent'],
  './supabase/functions/church-admin/people-match.ts': ['applicantFromSignup', 'churchFor'],
  './supabase/functions/church-admin/paper.ts': ['legacyNorm', 'MIN_POSITIONS'],
};
for (const [f, ks] of Object.entries(need)) { const m = await import(f); for (const k of ks) if (typeof m[k] === 'undefined') throw new Error(f + ' 에 ' + k + ' 가 없다'); }
console.log('import 이름 모두 있음');
"
# ② 앵커 — 각 줄 맨 앞 숫자가 1 이어야 한다
A=supabase/functions/church-admin; T=tests
c() { printf '%s  %s  <- %s\n' "$(grep -cF -- "$2" "$1")" "$2" "$1"; }
c $A/index.ts 'const EV_ROW_COLS = '
c $A/index.ts 'async function evRead('
c $A/index.ts 'function rowOut('
c $A/index.ts 'async function churchLookup('
c $A/index.ts 'Deno.serve(async (req) => {'
c $A/index.ts 'case "evEventSave":'
c $A/authz.ts 'evEventSave: "bibleevent",'
c $T/authz.test.mjs '"evEventCreate", "evEventSave", "evEvents", "evHistory", "evRoster", "evStats"]);'
c $T/server.dev.test.mjs 'const PHOTO_PATH = "church-people-photos/990000001.jpg";'
c $T/server.dev.test.mjs '  evEventSave: {'
c $T/server.dev.test.mjs 'if (errs.length) throw new Error("정리 실패 "'
c $T/server.dev.test.mjs 'const ROW_OUT_KEYS = '
c $T/server.dev.test.mjs 'bibleevent: role === "bibleevent"'
# ③ 이 과제의 이름 — 모두 0 이어야 한다(겹치면 Deno 가 뜨지 않는다)
grep -cE 'EV_ROW_EDIT_COLS|usersByKeys|sameInEvent|evRowRead|evRowChurch|evRowAdd|evRowSave|evRowDelete|events-rows\.ts' \
  $A/index.ts $A/authz.ts $T/authz.test.mjs $T/server.dev.test.mjs
grep -cE 'rxReady|rowFixtures|rxName' $T/server.dev.test.mjs
ls supabase/functions/church-admin/events-rows.ts tests/events-rows.test.mjs 2>&1 | grep -c "No such file"
```
Expected: `import 이름 모두 있음`(ExperimentalWarning 한 줄은 괜찮다) · ② 열세 줄 모두 맨 앞이 `1` · ③ 네 파일 모두 `…:0`, 그다음 `0`, 마지막 `2`(두 파일 다 아직 없다).
하나라도 어긋나면 **멈춘다** — `isEligEvent`·`tidyRow` 가 없으면 Task 2 가 계약 §5 를 아직 안 따른 것, 앵커가 0 이면 그 과제(5·6)가 덜 끝난 것, 2 이상이면 앵커를 더 길게 잡아 한 곳만 가리키게 한 뒤 진행한다.

- [ ] **Step 2: 실패하는 순수 시험 — `tests/events-rows.test.mjs` 를 새로 만든다**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ADD_TAG, ROW_FIELDS, formRow, rowPatch, touchesRow, checkChanged, sameKeys, askableKeys, tagNote, oddPosition,
} from "../supabase/functions/church-admin/events-rows.ts";
import { candidateKeys } from "../supabase/functions/church-admin/events-rules.ts";

const row = (o = {}) => ({ who_type: "교구", group_name: "화평", sub_name: "20", name: "홍길동", position: "집사", ...o });

test("formRow — 교구 칸 끝 「교구」·목장 「N목장」·앞자리 0·「남성목장」·직분 「님」·괄호를 다듬는다(tidyRow 와 같은 규칙)", () => {
  assert.deepEqual(formRow({ who_type: "교구", group: "화평교구", sub: "07", name: "  홍길동 ", position: "집사님", note: "무시" }),
    { who_type: "교구", group_name: "화평", sub_name: "7", name: "홍길동", position: "집사" });
  assert.equal(formRow({ who_type: "교구", group: "화평", sub: "20목장", name: "홍길동" }).sub_name, "20");
  assert.equal(formRow({ who_type: "교구", group: "화평", sub: " 20 목장 ", name: "홍길동" }).sub_name, "20");
  assert.equal(formRow({ who_type: "교구", group: "소망", sub: "남성목장", name: "홍길동" }).sub_name, "남성");
  assert.equal(formRow({ who_type: "교구", group: "화평", sub: "00", name: "홍길동" }).sub_name, "0");
  assert.equal(formRow({ who_type: "교구", group: "화평", sub: "", name: "홍길동" }).sub_name, "");
  // Number() 로 바꾸지 않는다 — 긴 숫자도 앞 0 만 뗀다
  assert.equal(formRow({ who_type: "교구", group: "화평", sub: "0012345678901234567890", name: "홍길동" }).sub_name,
    "12345678901234567890");
  assert.equal(formRow({ who_type: "교구", group: "화평", name: "홍길동", position: "은퇴권사(협동)" }).position, "은퇴권사");
  // 소속 칸은 완성형(NFC)으로 · 이름은 적은 그대로(앱 로그인 키와 맞게 — NFC 로 바꾸지 않는다)
  const nfd = "홍길동".normalize("NFD");
  const r = formRow({ who_type: "교구", group: "화평".normalize("NFD"), sub: "1", name: nfd });
  assert.equal(r.group_name, "화평");
  assert.equal(r.name, nfd);
});

test("formRow — 교회학교는 부서 줄임말에 「부」만 붙이고 학년은 그대로(학년 「03」을 목장처럼 다듬지 않는다)", () => {
  assert.deepEqual(formRow({ who_type: "교회학교", group: " 청년부 ", sub: "03", name: "홍길동", position: "" }),
    { who_type: "교회학교", group_name: "청년부", sub_name: "03", name: "홍길동", position: "" });
  assert.equal(formRow({ who_type: "교회학교", group: "유년", sub: "", name: "홍길동" }).group_name, "유년부");
});

test("formRow — 객체가 아니면 빈 줄(검사는 checkRow 가 한다)", () => {
  const empty = { who_type: "", group_name: "", sub_name: "", name: "", position: "" };
  assert.deepEqual(formRow(null), empty);
  assert.deepEqual(formRow([1, 2]), empty);
  assert.deepEqual(formRow("홍길동"), empty);
});

test("rowPatch — 보낸 칸만 다듬어 얹고, 실제로 바뀐 칸만 센다(안 보낸 옛 값은 그대로)", () => {
  assert.deepEqual([...ROW_FIELDS], ["who_type", "group_name", "sub_name", "name", "position"]);
  const cur = row({ group_name: "화평교구", sub_name: "30", name: "홍(길동)" });
  const a = rowPatch(cur, { position: "권사님" });
  assert.deepEqual(a.changed, ["position"]);
  assert.equal(a.next.position, "권사");
  assert.equal(a.next.group_name, "화평교구");   // 안 보낸 칸은 다듬지 않는다
  assert.equal(a.next.name, "홍(길동)");
  assert.deepEqual(rowPatch(cur, { sub: "030" }).changed, []);            // 다듬으면 같은 값
  assert.deepEqual(rowPatch(cur, { sub: "31목장" }).changed, ["sub_name"]);
  assert.deepEqual(rowPatch(cur, { note: "메모만" }).changed, []);         // 메모는 이 함수 밖
  assert.deepEqual(rowPatch(cur, null).changed, []);
  const b = rowPatch(row({ who_type: "교회학교", group_name: "청년부", sub_name: "" }), { who_type: "교구", group: "믿음교구", sub: "3" });
  assert.deepEqual(b.changed, ["who_type", "group_name", "sub_name"]);
  assert.deepEqual(b.next, { who_type: "교구", group_name: "믿음", sub_name: "3", name: "홍길동", position: "집사" });
});

test("touchesRow — 메모 밖 칸이 오기만 해도(값이 같아도) true", () => {
  assert.equal(touchesRow({ note: "x" }), false);
  assert.equal(touchesRow({}), false);
  assert.equal(touchesRow(null), false);
  for (const k of ["who_type", "group", "sub", "name", "position"]) assert.equal(touchesRow({ note: "x", [k]: "" }), true, k);
});

test("checkChanged — 바뀐 칸만 검사한다(옛 이름의 괄호·「화평교구」 때문에 막히지 않는다)", () => {
  const cur = row({ group_name: "화평교구", sub_name: "30", name: "홍(길동)" });
  const ok = rowPatch(cur, { position: "권사" });
  assert.equal(checkChanged(ok.next, ok.changed), null);
  const n = rowPatch(cur, { name: "홍,길동" });
  assert.equal(checkChanged(n.next, n.changed), "bad-char");
  const e = rowPatch(cur, { name: "" });
  assert.equal(checkChanged(e.next, e.changed), "no-name");
  const g = rowPatch(cur, { group: "없는" });
  assert.equal(checkChanged(g.next, g.changed), "bad-group");
  const s = rowPatch(cur, { sub: "셋" });
  assert.equal(checkChanged(s.next, s.changed), "bad-sub");
  const p = rowPatch(cur, { position: "가".repeat(41) });
  assert.equal(checkChanged(p.next, p.changed), "too-long");
  assert.equal(checkChanged(cur, []), null);   // 아무것도 안 바뀜 — 옛 값이 틀려도 통과
});

test("checkChanged — 구분이 바뀌면 교구·목장을 새 구분의 규칙으로 다시 본다", () => {
  const kid = row({ who_type: "교회학교", group_name: "청년부", sub_name: "" });
  const t1 = rowPatch(kid, { who_type: "교구" });
  assert.equal(checkChanged(t1.next, t1.changed), "bad-group");        // 「청년부」는 교구가 아니다
  const t2 = rowPatch(kid, { who_type: "교구", group: "믿음", sub: "3" });
  assert.equal(checkChanged(t2.next, t2.changed), null);
  const t3 = rowPatch(row(), { who_type: "성가대" });
  assert.equal(checkChanged(t3.next, t3.changed), "bad-type");
});

test("sameKeys — candidateKeys 와 같다(규칙 하나) · 한 자리 목장은 「0N」 꼴도(앱 로그인 「07」 · 설계 §1-1) · 두 자리·남성·교회학교는 안 붙인다", () => {
  const r7 = row({ group_name: "사랑", sub_name: "7" });
  assert.deepEqual(sameKeys(r7), candidateKeys(r7));
  const k = sameKeys(r7);
  for (const want of ["교구|사랑|7|||홍길동", "교구|사랑|7목장|||홍길동", "교구|사랑|07|||홍길동"]) assert.ok(k.includes(want), want);
  assert.equal(new Set(k).size, k.length, "중복 없음");
  assert.ok(!sameKeys(row({ sub_name: "12" })).some((x) => x.includes("|012|")));
  assert.ok(!sameKeys(row({ sub_name: "남성" })).some((x) => x.includes("|0남성|")));
  assert.ok(!sameKeys(row({ who_type: "교회학교", group_name: "청년부", sub_name: "1" })).some((x) => x.includes("|01|")));
  // 이름이 자모분리(NFD)여도 완성형 키가 「0N」 꼴에 함께 나온다
  assert.ok(sameKeys(row({ group_name: "사랑", sub_name: "7", name: "홍길동".normalize("NFD") })).includes("교구|사랑|07|||홍길동"));
});

test("askableKeys — .in() 이 깨지는 글자(\" \\ , ( ))가 든 키는 묻지 않는다 · 「|」는 둔다 · 겹침·빈 것 뺌", () => {
  assert.deepEqual(askableKeys([
    "교구|화평|1|||홍길동", "교구|화평|1|||홍길동", "", null,
    "교구|화평|1|||홍(길동)", '교구|화평|1|||홍"길동', "교구|화평|1|||홍,길동", "교구|화평|1|||홍\\길동",
    "교회학교|||청년부||홍길동",
  ]), ["교구|화평|1|||홍길동", "교회학교|||청년부||홍길동"]);
  assert.deepEqual(askableKeys([]), []);
});

test("tagNote — 머리 표기 · 「 / 」로 잇기 · 두 번 붙이지 않기 · 한 줄로", () => {
  assert.equal(ADD_TAG, "담당자가 더함");
  assert.equal(tagNote(ADD_TAG, ""), "담당자가 더함");
  assert.equal(tagNote(ADD_TAG, null), "담당자가 더함");
  assert.equal(tagNote(ADD_TAG, "  시험   메모 "), "담당자가 더함 / 시험 메모");
  assert.equal(tagNote(ADD_TAG, "시험\n메모"), "담당자가 더함 / 시험 메모");
  assert.equal(tagNote(ADD_TAG, "담당자가 더함"), "담당자가 더함");
  assert.equal(tagNote(ADD_TAG, "담당자가 더함 / 시험"), "담당자가 더함 / 시험");
  assert.equal(tagNote("명단 올리기", "소속: 교인명부로 채움"), "명단 올리기 / 소속: 교인명부로 채움");
  // 머리 표기 「담당자가 더함 / 」는 10자 — 서버는 붙인 **뒤** 500자로 센다(계약 §5 · 창의 상한은 480)
  assert.equal(tagNote(ADD_TAG, "가".repeat(490)).length, 500);
});

test("oddPosition — 앱 직분 목록(9개) 밖이면 true · 빈칸은 false", () => {
  assert.equal(oddPosition("집사"), false);
  assert.equal(oddPosition(""), false);
  assert.equal(oddPosition("명예권사"), true);
  assert.equal(oddPosition("은퇴장로"), true);
});
```

- [ ] **Step 3: 돌려서 실패를 본다**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
node --experimental-strip-types --test tests/events-rows.test.mjs
```
Expected: FAIL — `Cannot find module '…/supabase/functions/church-admin/events-rows.ts'` (`# fail 1`).

- [ ] **Step 4: `supabase/functions/church-admin/events-rows.ts` 를 만든다**

```ts
// 성경필사(암송) — 줄 한 분 더하기·고치기의 순수 규칙(2026-09-29 · 계획 Task 7)
//   서버(Deno, index.ts)와 시험(Node, tests/events-rows.test.mjs)이 **같은 파일**을 읽는다 —
//   authz.ts 와 같은 제약(원격 import·enum·namespace 금지, node --experimental-strip-types 가 그대로 읽는다).
//   설계: bible-memorize-church-app-v2 docs/superpowers/specs/2026-09-29-church-admin-bible-events-design.md §1·§2
// ⚠️ 규칙을 새로 만들지 않는다 — 다듬기는 events-rules.ts tidyRow(올리기 tidyRaw 가 부르는 것과 같은 함수),
//    판정표는 checkRow, 같은 분 후보 키는 candidateKeys(「07」·「N목장」·NFC/NFD 포함). 자격 회차 판정도
//    events-rules.ts isEligEvent 하나다(여기 두지 않는다 — 화면의 hasEligibility 와 서버의 막기가 어긋나지 않게).
//    여기는 그 규칙들을 「폼 한 줄」·「보낸 칸만」·「바뀐 칸만」·「메모 머리」에 맞게 부르는 자리다.
import { candidateKeys, checkRow, tidyRow, type EvRow } from "./events-rules.ts";
import { legacyNorm, MIN_POSITIONS } from "./paper.ts";

// 담당자가 한 분 더한 줄의 메모 머리 — 운영에 이미 쓰인 표기 그대로(설계 §1 「메모에 남기는 표기」)
export const ADD_TAG = "담당자가 더함";

// 줄의 다섯 칸(DB 이름) — 고치기가 「실제로 바뀐 칸」을 세는 차례
export const ROW_FIELDS = ["who_type", "group_name", "sub_name", "name", "position"] as const;
export type RowField = (typeof ROW_FIELDS)[number];
// 화면이 보내는 칸 이름(계약: group·sub) — 메모(note)는 따로 본다
const PATCH_KEYS = ["who_type", "group", "sub", "name", "position"];

const obj = (x: unknown): Record<string, unknown> =>
  (x && typeof x === "object" && !Array.isArray(x) ? x : {}) as Record<string, unknown>;
const has = (o: Record<string, unknown>, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

// 한 분 더하기 폼 → 줄. 다듬기만 하고 검사는 checkRow 가 한다.
export function formRow(x: unknown): EvRow {
  const o = obj(x);
  return tidyRow({ who_type: o.who_type, group_name: o.group, sub_name: o.sub, name: o.name, position: o.position });
}

// 고치기 — **보낸 칸만** 다듬어 얹는다. 안 보낸 칸은 DB 값 그대로(옛 값을 다시 다듬어 몰래 바꾸지 않게).
// 교구 칸·목장 칸은 (보냈든 안 보냈든) **바뀐 뒤의 구분**의 규칙으로 다듬는다.
export function rowPatch(cur: EvRow, patch: unknown): { next: EvRow; changed: RowField[] } {
  const p = obj(patch);
  const who = has(p, "who_type") ? legacyNorm(p.who_type) : cur.who_type;
  const t = tidyRow({ who_type: who, group_name: p.group, sub_name: p.sub, name: p.name, position: p.position });
  const next: EvRow = {
    who_type: who as EvRow["who_type"],
    group_name: has(p, "group") ? t.group_name : cur.group_name,
    sub_name: has(p, "sub") ? t.sub_name : cur.sub_name,
    name: has(p, "name") ? t.name : cur.name,
    position: has(p, "position") ? t.position : cur.position,
  };
  return { next, changed: ROW_FIELDS.filter((f) => next[f] !== cur[f]) };
}

// 앱에서 낸 줄·자격 회차의 줄은 메모만 — 메모 밖 칸이 **오기만 해도** 거절한다(설계 §2 evRowSave)
export function touchesRow(patch: unknown): boolean {
  const p = obj(patch);
  return PATCH_KEYS.some((k) => has(p, k));
}

// 바뀐 칸만 검사한다(설계 §1 끝) — 안 바뀐 칸은 checkRow 를 늘 통과하는 자리값으로 바꿔 넣고 checkRow 를 부른다.
// 구분(who_type)이 바뀌면 교구·목장도 새 구분의 규칙으로 다시 본다.
const SAFE_GROUP: Record<string, string> = { "교구": "믿음", "교회학교": "청년부" };
export function checkChanged(next: EvRow, changed: readonly string[]): string | null {
  const typeChanged = changed.includes("who_type");
  const who = typeChanged ? next.who_type : (next.who_type === "교회학교" ? "교회학교" : "교구");
  const probe: EvRow = {
    who_type: who as EvRow["who_type"],
    group_name: typeChanged || changed.includes("group_name") ? next.group_name : SAFE_GROUP[who],
    sub_name: typeChanged || changed.includes("sub_name") ? next.sub_name : "",
    name: changed.includes("name") ? next.name : "홍길동",
    position: changed.includes("position") ? next.position : "",
  };
  return checkRow(probe);
}

// 같은 분 후보 키 — events-rules.ts candidateKeys 그대로(한 자리 목장의 「0N」까지 거기서 만든다).
// 한 분 더하기·고치기(sameInEvent)·올리기(Task 8)가 이 이름 하나로 부른다 — 규칙이 두 벌이 되지 않게.
export function sameKeys(row: EvRow): string[] {
  return candidateKeys(row);
}

// supabase-js .in() 은 " \ 를 이스케이프하지 않고 , ( ) 는 감싸기만 한다 — 그런 키는 묻지 않는다
// (index.ts keysToUserIds·people-match LOOKUP_BAD 와 같은 거르기). 「|」는 신원 키의 구분자라 거르지 않는다.
// 새로 적는 칸은 checkRow 가 이미 막으니, 여기 걸리는 것은 「안 바꾼 옛 이름」(예: 「홍길동(구)」)뿐이다.
const IN_BAD = /["\\,()]/;
export function askableKeys(keys: readonly unknown[]): string[] {
  return [...new Set(keys.filter((k): k is string => typeof k === "string" && k !== "" && !IN_BAD.test(k)))];
}

// 메모 앞에 표기를 붙인다 — 겹치면 「 / 」로 잇고, 이미 붙어 있으면 다시 붙이지 않는다. 메모는 한 줄로(줄바꿈은 빈칸 하나).
export function tagNote(tag: string, note: unknown): string {
  const n = legacyNorm(note);
  if (!n) return tag;
  if (n === tag || n.startsWith(tag + " / ")) return n;
  return tag + " / " + n;
}

// 앱 직분 목록(9개) 밖이면 경고만 — 막지 않는다(설계 §0 「직분 검사」: 명예·은퇴 직분이 수백 줄)
export const oddPosition = (position: string): boolean => !!position && !MIN_POSITIONS.has(position);
```

- [ ] **Step 5: 다시 돌려서 통과를 본다**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
node --experimental-strip-types --test tests/events-rows.test.mjs
```
Expected: PASS — `# tests 11` · `# pass 11` · `# fail 0`.
(`formRow`·`checkChanged`·`sameKeys` 시험이 실패하면 Task 2 의 `tidyRow`/`checkRow`/`candidateKeys` 가 계약과 다른 것이다 — 여기를 맞추지 말고 Task 2 를 계약대로 고친다.)

- [ ] **Step 6: 커밋**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
python tools/preflight.py
git add supabase/functions/church-admin/events-rows.ts tests/events-rows.test.mjs
git commit -F - <<'EOF'
feat(성경필사): 줄 더하기·고치기 순수 규칙 — 폼 한 줄·보낸 칸만·바뀐 칸만 검사·메모 머리·.in() 거르기(events-rows.ts)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
git show --stat HEAD      # 두 파일만인지 본다
```
Expected: preflight 끝줄 `모두 통과` · 커밋 1개(두 파일).

- [ ] **Step 7: 실패하는 권한 시험 — `tests/authz.test.mjs`**

Task 6 이 고친 bibleevent 블록의 줄(Step 1 에서 1 인 것을 봤다)

```js
  assert.deepEqual(acts.sort(), ["evEventCreate", "evEventSave", "evEvents", "evHistory", "evRoster", "evStats"]);
```
을 아래로 바꾼다(JS 기본 정렬 차례 그대로):

```js
  assert.deepEqual(acts.sort(), ["evEventCreate", "evEventSave", "evEvents", "evHistory", "evRoster",
    "evRowAdd", "evRowDelete", "evRowSave", "evStats"]);
```

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
node --experimental-strip-types --test tests/authz.test.mjs
```
Expected: FAIL — bibleevent 블록 한 건, `Expected values to be strictly deep-equal`(`evRowAdd`·`evRowDelete`·`evRowSave` 가 없다) · `# fail 1`.

- [ ] **Step 8: `authz.ts` 의 `ACTION_ROLES` 에 세 줄**

앵커 `  evEventSave: "bibleevent",`(Task 6 · Step 1 에서 1) 줄 **바로 뒤에**:

```ts
  // 성경필사(암송) — 한 분 더하기·줄 고치기·빼기(계획 Task 7). 앱 계정은 조회만 해서 잇는다(만들지 않는다).
  // 앱에서 낸 줄·자격 회차의 줄은 메모만, 자격 회차에는 더하기·빼기 없음. 바꾼 기록 event.add / event.edit / event.delete.
  evRowAdd: "bibleevent",
  evRowSave: "bibleevent",
  evRowDelete: "bibleevent",
```

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
node --experimental-strip-types --test tests/authz.test.mjs tests/registry.test.mjs
```
Expected: PASS — `# fail 0`. (아직 커밋하지 않는다 — index.ts 의 case 와 함께 Step 15 에서. 이 셋만 들어간 채 배포되면 400 `unknown-action` 이 된다.)

- [ ] **Step 9: 실패하는 개발 서버 시험 — `tests/server.dev.test.mjs` 네 곳**

① 상수 — 앵커 `const PHOTO_PATH = "church-people-photos/990000001.jpg";` 줄 **바로 뒤에**:

```js
// 성경필사 줄 시험(계획 Task 7) — 시험 회차 둘(draft · 2000-04·05) + 앱 계정 여섯. 이름에 모두 STAMP.
//   회차는 Task 5 after() 의 「성경필사 시험 회차」 단계가 ca-test-* 로 지운다(줄은 CASCADE).
//   계정(이름이 ca-test-rx 로 시작)은 아래 after() 줄이 지운다 — 그 계정의 줄·별칭(user_identity_aliases)은 CASCADE.
const RX = { ev: "ca-test-row-" + STAMP, evEl: "ca-test-rowel-" + STAMP, users: [], rowIds: [] };
const rxName = (tag) => `ca-test-rx${tag}-${STAMP}`;
const RX_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const RX_SECRET = ["user_id", "auth_user_id", "ident_key", "answers", "phone", "memo", "person_id"];
let rxReady = null;
```

② `PROBE` — 앵커 `  evEventSave: {`(Task 6) 로 시작하는 줄 **바로 뒤에**(없는 회차·id 0 → `not-found`, 아무것도 안 바뀐다):

```js
  evRowAdd: { event_id: "ca-test-probe-none", row: {} },
  evRowSave: { id: 0, expect: "", patch: {} },
  evRowDelete: { id: 0, expect: "" },
```

③ `after()` — 앵커 `  if (errs.length) throw new Error("정리 실패 "` 줄 **바로 앞에**:

```js
  // 성경필사 줄 시험(Task 7) — 시험 계정. 그 계정의 줄·별칭은 CASCADE. 시험 회차는 Task 5 단계가 ca-test-* 로 지운다.
  for (const id of RX.users) await step("줄 시험 계정 " + id, () => rest(`users?id=eq.${id}`, "DELETE"));
  await step("줄 시험 계정 남음", async () => {
    const left = await rest(`users?select=id&name=like.ca-test-rx*-${STAMP}`, "GET");   // 이번 실행 것만(다른 세션 실행은 건드리지 않는다)
    assert.equal(left.length, 0, "줄 시험 계정이 남았다: " + left.length + "명");
  });
```

④ 파일 **끝에** 붙인다:

```js
// ---------- 성경필사(암송) — 한 분 더하기 · 줄 고치기 · 빼기 (계획 Task 7) ----------
// 시험 자료는 첫 시험이 한 번 만든다(뒤 시험은 같은 약속을 기다린다).
function rowFixtures() {
  rxReady ??= (async () => {
    // 지난번이 도중에 멈춰 남긴 시험 계정 — 그 계정의 줄·별칭은 CASCADE. **한 시간 넘은 것만**
    //   (다른 세션이 개발에서 같은 시험을 돌리는 중이면 그쪽 계정을 지우지 않게 — Task 5 before()·Task 8 과 같은 규칙).
    const rxStale = new Date(Date.now() - 3600 * 1000).toISOString();
    await rest(`users?name=like.ca-test-rx*&created_at=lt.${rxStale}`, "DELETE");
    const needs = { position: true, phone: false, memo: false, extra: [] };
    await rest("events", "POST", { id: RX.ev, title: "ca-test 줄 시험 " + STAMP, opens_on: "2000-04-01", closes_on: "2000-04-30",
      status: "draft", kind: "signup", needs });
    await rest("events", "POST", { id: RX.evEl, title: "ca-test 자격 줄 시험 " + STAMP, opens_on: "2000-05-01", closes_on: "2000-05-31",
      status: "draft", kind: "signup", needs: { ...needs, eligibility: { start: "2000-05-01", weeks: 4, perWeek: 3, need: 3 } } });
    const user = async (tag, gu, mok) => {
      const [u] = await rest("users", "POST",
        { type: "교구", gu, mok, name: rxName(tag), identity_key: `교구|${gu}|${mok}|||${rxName(tag)}` });
      RX.users.push(u.id);
      return u.id;
    };
    RX.u7 = await user("seven", "사랑", "07");      // 앱에서 목장 「07」로 로그인한 분
    RX.uLink = await user("link", "믿음", "3");     // 계정 하나 → 잇는다
    RX.uAlias = await user("alias", "소망", "5");   // 지금 소속 소망 5 · 옛 소속(별칭) 소망 4
    await rest("user_identity_aliases", "POST", { identity_key: `교구|소망|4|||${rxName("alias")}`, user_id: RX.uAlias });
    RX.uTwoA = await user("twoacc", "은혜", "2");   // 같은 분 계정이 둘(「2」·「2목장」) → 잇지 않는다
    RX.uTwoB = await user("twoacc", "은혜", "2목장");
    RX.uRace = await user("race", "기쁨", "9");     // 동시에 셋이 더하기
    const put = async (x) => (await rest("event_signups", "POST", x))[0];
    // 앱에서 낸 줄 — 목장 「07」 그대로(앱 로그인 값)
    RX.app = await put({ event_id: RX.ev, user_id: RX.u7, ident_key: `교구|사랑|07|||${rxName("seven")}`, who_type: "교구",
      group_name: "사랑", sub_name: "07", name: rxName("seven"), position: "집사", source: "app" });
    // 이관 줄 — 옛 값이 지금 규칙에 어긋난다(이름에 괄호 · 교구 칸 「화평교구」). 다른 칸만 고칠 때 막히면 안 된다.
    RX.old = await put({ event_id: RX.ev, ident_key: `교구|화평교구|1|||${rxName("old")}(구)`, who_type: "교구",
      group_name: "화평교구", sub_name: "1", name: rxName("old") + "(구)", position: "집사", note: "원래: 화평 30 · 집사", source: "import" });
    // 이관 줄 — 고치기 시험용
    RX.edit = await put({ event_id: RX.ev, ident_key: `교구|섬김|1|||${rxName("edit")}`, who_type: "교구",
      group_name: "섬김", sub_name: "1", name: rxName("edit"), position: "집사", note: "원래: 화평 30 · 집사", source: "import" });
    // 자격 회차의 이관 줄 — 메모만 고치고, 빼지 못한다
    RX.el = await put({ event_id: RX.evEl, ident_key: `교구|화평|1|||${rxName("elig")}`, who_type: "교구",
      group_name: "화평", sub_name: "1", name: rxName("elig"), source: "import" });
  })();
  return rxReady;
}

// 응답 어디에도 UUID 꼴 값(user_id)이 없고, 줄에 숨길 칸이 없다
function rxClean(r) {
  const s = JSON.stringify(r.body);
  assert.ok(!RX_UUID.test(s), "응답에 UUID 꼴 값: " + s);
  if (r.body.row) for (const k of RX_SECRET) assert.equal(k in r.body.row, false, "줄에 " + k);
}
const rxDb = async (id) => (await rest(
  `event_signups?select=id,user_id,ident_key,name,group_name,sub_name,position,note,source,updated_at&id=eq.${id}`, "GET"))[0];

test("성경필사 한 분 더하기: 넣음(import·메모 머리·다듬기) · 계정 잇기(별칭 포함) · 계정 둘 · 이미 있음(07/7·계정·키) · 자격 회차 · 메모 길이(머리 포함) · 모양 틀림 · 계정을 만들지 않음", async () => {
  await rowFixtures();
  const t = people.bibleevent.token;
  const add = (row, ev = RX.ev) => call(t, "evRowAdd", { event_id: ev, row: { who_type: "교구", position: "", note: "", ...row } });

  // 1) 앱 계정이 없는 분 — 넣음 · 잇지 않음 · 「화평교구」→화평 · 「07」→7 · 「집사님」→집사 · 메모 머리
  const a1 = await add({ group: "화평교구", sub: "07", name: rxName("new"), position: "집사님", note: "시험 메모" });
  assert.equal(a1.body.ok, true, JSON.stringify(a1.body));
  rxClean(a1);
  assert.deepEqual(Object.keys(a1.body.row).sort(), ROW_OUT_KEYS);
  assert.equal(a1.body.linked, false);
  assert.deepEqual(a1.body.warnings, []);
  const r1 = a1.body.row;
  assert.deepEqual([r1.who_type, r1.group, r1.sub, r1.name, r1.position, r1.source, r1.hasUser],
    ["교구", "화평", "7", rxName("new"), "집사", "import", false]);
  assert.equal(r1.note, "담당자가 더함 / 시험 메모");
  RX.rowIds.push(r1.id);
  RX.added = r1;
  const d1 = await rxDb(r1.id);
  assert.equal(d1.ident_key, `교구|화평|7|||${rxName("new")}`);
  assert.equal(d1.user_id, null);
  assert.equal(d1.source, "import");
  assert.equal((await rest(`users?select=id&name=eq.${rxName("new")}`, "GET")).length, 0, "계정을 만들면 안 된다");

  // 2) 같은 분을 다른 표기로 다시 — 「7목장」·「07」 둘 다 already
  assert.equal((await add({ group: "화평", sub: "7목장", name: rxName("new") })).body.error, "already");
  assert.equal((await add({ group: "화평", sub: "07", name: rxName("new") })).body.error, "already");

  // 3) 07/7 — 앱에서 목장 「07」로 낸 분을 담당자가 「7」로 더하면 already(설계 §1-1)
  assert.equal((await add({ group: "사랑", sub: "7", name: rxName("seven") })).body.error, "already");

  // 4) 앱 계정 하나 → 잇는다 · 목록 밖 직분은 경고만
  const a4 = await add({ group: "믿음", sub: "3", name: rxName("link"), position: "명예권사" });
  assert.equal(a4.body.ok, true, JSON.stringify(a4.body));
  rxClean(a4);
  assert.equal(a4.body.linked, true);
  assert.equal(a4.body.row.hasUser, true);
  assert.equal(a4.body.row.position, "명예권사");
  assert.equal(a4.body.warnings.length, 1, JSON.stringify(a4.body.warnings));
  assert.match(a4.body.warnings[0], /명예권사/);
  assert.equal((await rxDb(a4.body.row.id)).user_id, RX.uLink);
  RX.rowIds.push(a4.body.row.id);
  RX.linked = a4.body.row;
  assert.equal((await add({ group: "믿음", sub: "03", name: rxName("link") })).body.error, "already");

  // 5) 옛 소속(별칭 「소망 4」)으로 적어도 그 계정에 잇는다
  const a5 = await add({ group: "소망", sub: "4", name: rxName("alias") });
  assert.equal(a5.body.ok, true, JSON.stringify(a5.body));
  rxClean(a5);
  assert.equal(a5.body.linked, true);
  assert.equal((await rxDb(a5.body.row.id)).user_id, RX.uAlias);
  RX.rowIds.push(a5.body.row.id);
  RX.aliasRow = a5.body.row;
  // 지금 소속 「소망 5」로 적으면 키는 다르지만 그 계정이 이미 회차에 있다 → already
  assert.equal((await add({ group: "소망", sub: "5", name: rxName("alias") })).body.error, "already");

  // 6) 계정이 둘 → 잇지 않고 알린다
  const a6 = await add({ group: "은혜", sub: "2", name: rxName("twoacc") });
  assert.equal(a6.body.ok, true, JSON.stringify(a6.body));
  rxClean(a6);
  assert.equal(a6.body.linked, false);
  assert.equal(a6.body.row.hasUser, false);
  assert.ok(a6.body.warnings.some((w) => /계정이 2개/.test(w)), JSON.stringify(a6.body.warnings));
  RX.rowIds.push(a6.body.row.id);

  // 7) 자격 회차 → eligibility-event · 아무것도 안 들어간다
  assert.equal((await add({ group: "화평", sub: "1", name: rxName("elnew") }, RX.evEl)).body.error, "eligibility-event");
  assert.equal((await rest(`event_signups?select=id&event_id=eq.${RX.evEl}&name=eq.${rxName("elnew")}`, "GET")).length, 0);

  // 8) 메모 길이는 머리 표기를 붙인 **뒤**로 센다 — 「담당자가 더함 / 」(10자) + 490 = 500 은 넣고, 491 은 note-too-long
  const n1 = await add({ group: "화평", sub: "2", name: rxName("note"), note: "가".repeat(490) });
  assert.equal(n1.body.ok, true, JSON.stringify(n1.body).slice(0, 300));
  assert.equal(n1.body.row.note.length, 500);
  RX.rowIds.push(n1.body.row.id);

  // 9) 모양 틀림(설계 §1 판정표) · 없는 회차 — 아무것도 안 들어간다
  const bad = async (row, want) => assert.equal((await add(row)).body.error, want, JSON.stringify(row).slice(0, 200));
  await bad({ group: "화평", sub: "1", name: "" }, "no-name");
  await bad({ group: "화평", sub: "1", name: "홍,길동" }, "bad-char");
  await bad({ group: "화평", sub: "1", name: "가".repeat(41) }, "too-long");
  await bad({ who_type: "성가대", group: "화평", sub: "1", name: rxName("bad") }, "bad-type");
  await bad({ group: "없는교구", sub: "1", name: rxName("bad") }, "bad-group");
  await bad({ who_type: "교회학교", group: "", sub: "", name: rxName("bad") }, "no-group");
  await bad({ group: "화평", sub: "셋", name: rxName("bad") }, "bad-sub");
  await bad({ group: "화평", sub: "1", name: rxName("bad"), position: "가".repeat(41) }, "too-long");
  await bad({ group: "화평", sub: "1", name: rxName("bad"), note: "가".repeat(491) }, "note-too-long");
  for (const event_id of ["ca-test-none-" + STAMP, "BAD ID"]) {
    const none = await call(t, "evRowAdd", { event_id, row: { who_type: "교구", group: "화평", sub: "1", name: rxName("bad") } });
    assert.equal(none.body.error, "not-found", event_id);
  }
  assert.equal((await rest(`event_signups?select=id&name=eq.${rxName("bad")}`, "GET")).length, 0);
});

test("성경필사 한 분 더하기: 같은 분을 동시에 셋 — 하나만 들어가고 둘은 already(23505 → already · 500 없음)", async () => {
  await rowFixtures();
  const t = people.bibleevent.token;
  const rs = await Promise.all([1, 2, 3].map(() => call(t, "evRowAdd",
    { event_id: RX.ev, row: { who_type: "교구", group: "기쁨", sub: "9", name: rxName("race"), position: "", note: "" } })));
  const bodies = JSON.stringify(rs.map((r) => r.body));
  for (const r of rs) assert.notEqual(r.status, 500, bodies);
  assert.equal(rs.filter((r) => r.body.ok).length, 1, bodies);
  assert.equal(rs.filter((r) => r.body.error === "already").length, 2, bodies);
  const inDb = await rest(`event_signups?select=id,user_id&event_id=eq.${RX.ev}&name=eq.${rxName("race")}`, "GET");
  assert.equal(inDb.length, 1);
  assert.equal(inDb[0].user_id, RX.uRace);
  RX.rowIds.push(inDb[0].id);
});

test("성경필사 줄 고치기: 메모 · 동시 수정 · 바뀐 칸만 검사 · 신원 키 다시(계정 그대로) · 자기 줄 빼고 already · 앱 줄·자격 회차는 메모만", async () => {
  await rowFixtures();
  const t = people.bibleevent.token;
  const save = (row, patch, expect = row.updated_at) => call(t, "evRowSave", { id: row.id, expect, patch });

  // 1) 메모만 — 옛 표기 뒤에 더한 것 그대로
  const s1 = await save(RX.edit, { note: "원래: 화평 30 · 집사 / 확인함" });
  assert.equal(s1.body.ok, true, JSON.stringify(s1.body));
  assert.deepEqual(Object.keys(s1.body.row).sort(), ROW_OUT_KEYS);
  assert.equal(s1.body.row.note, "원래: 화평 30 · 집사 / 확인함");
  assert.notEqual(s1.body.row.updated_at, RX.edit.updated_at);
  // 2) 같은 expect 로 한 번 더 → conflict · 저장 안 됨
  assert.equal((await save(RX.edit, { note: "덮어쓰기" })).body.error, "conflict");
  assert.equal((await rxDb(RX.edit.id)).note, "원래: 화평 30 · 집사 / 확인함");
  RX.edit = s1.body.row;

  // 3) 바뀐 칸만 검사 — 옛 이름에 괄호·교구 칸 「화평교구」가 있어도 직분만 고치면 저장된다(옛 칸은 그대로)
  const s3 = await save(RX.old, { position: "권사님" });
  assert.equal(s3.body.ok, true, JSON.stringify(s3.body));
  assert.equal(s3.body.row.position, "권사");
  const d3 = await rxDb(RX.old.id);
  assert.equal(d3.name, rxName("old") + "(구)");
  assert.equal(d3.group_name, "화평교구");
  // …하지만 바꾼 칸이 틀리면 막는다
  assert.equal((await save(s3.body.row, { name: "홍,길동" })).body.error, "bad-char");
  assert.equal((await save(s3.body.row, { group: "없는" })).body.error, "bad-group");
  assert.equal((await save(s3.body.row, { note: "가".repeat(501) })).body.error, "note-too-long");

  // 4) 신원을 바꾸면 ident_key 를 다시 만들고, 이어진 계정(user_id)은 그대로
  const s4 = await save(RX.linked, { sub: "4" });
  assert.equal(s4.body.ok, true, JSON.stringify(s4.body));
  assert.equal(s4.body.row.sub, "4");
  assert.equal(s4.body.row.hasUser, true);
  const d4 = await rxDb(RX.linked.id);
  assert.equal(d4.ident_key, `교구|믿음|4|||${rxName("link")}`);
  assert.equal(d4.user_id, RX.uLink);

  // 5) 자기 줄은 빼고 본다 — 별칭으로 이은 줄(소망 4)을 지금 소속(소망 5)으로: 그 계정의 줄은 이 줄 자신뿐 → 저장
  const s5 = await save(RX.aliasRow, { sub: "5" });
  assert.equal(s5.body.ok, true, JSON.stringify(s5.body));
  assert.equal((await rxDb(RX.aliasRow.id)).user_id, RX.uAlias);

  // 6) 다른 줄과 겹치게 고치면 already · 그대로 남는다(07/7 포함)
  assert.equal((await save(RX.edit, { group: "화평", sub: "7", name: rxName("new") })).body.error, "already");
  assert.equal((await save(RX.edit, { group: "사랑", sub: "7", name: rxName("seven") })).body.error, "already");
  assert.equal((await rxDb(RX.edit.id)).name, rxName("edit"));

  // 7) 앱에서 낸 줄 — 메모 밖 칸이 오기만 해도 거절(값이 같아도) · 메모는 저장
  assert.equal((await save(RX.app, { name: rxName("seven") })).body.error, "app-row-note-only");
  assert.equal((await save(RX.app, { note: "x", position: "집사" })).body.error, "app-row-note-only");
  const s7 = await save(RX.app, { note: "앱 줄 메모" });
  assert.equal(s7.body.ok, true, JSON.stringify(s7.body));
  assert.equal(s7.body.row.note, "앱 줄 메모");
  assert.equal(s7.body.row.source, "app");
  RX.app = s7.body.row;

  // 8) 자격 회차의 줄(이관이어도) — 메모만
  assert.equal((await save(RX.el, { position: "권사" })).body.error, "app-row-note-only");
  const s8 = await save(RX.el, { note: "자격 줄 메모" });
  assert.equal(s8.body.ok, true, JSON.stringify(s8.body));
  RX.el = s8.body.row;

  // 9) 없는 줄 · 바뀐 것 없음(쓰지 않고 그대로 돌려준다)
  assert.equal((await call(t, "evRowSave", { id: 0, expect: "", patch: { note: "x" } })).body.error, "not-found");
  const same = await save(RX.el, { note: "자격 줄 메모" });
  assert.equal(same.body.ok, true, JSON.stringify(same.body));
  assert.equal(same.body.row.updated_at, RX.el.updated_at, "바뀐 것이 없으면 쓰지 않는다");

  for (const r of [s1, s3, s4, s5, s7, s8]) rxClean(r);
});

test("성경필사 줄 빼기: 앱 줄은 app-row · 자격 회차 줄은 eligibility-event · 동시 수정 · 뺀 뒤 not-found · 바꾼 기록 event.add/edit/delete(UUID 없음)", async () => {
  await rowFixtures();
  const t = people.bibleevent.token;
  const del = (row, expect = row.updated_at) => call(t, "evRowDelete", { id: row.id, expect });

  assert.equal((await del(RX.app)).body.error, "app-row");
  assert.equal((await del(RX.el)).body.error, "eligibility-event");      // 계약 §5 — 자격 회차의 줄 빼기도 서버가 막는다
  assert.equal((await rest(`event_signups?select=id&id=in.(${RX.app.id},${RX.el.id})`, "GET")).length, 2, "앱 줄·자격 줄은 남는다");
  assert.equal((await del(RX.added, "1999-01-01T00:00:00+00:00")).body.error, "conflict");
  const d = await del(RX.added);
  assert.equal(d.body.ok, true, JSON.stringify(d.body));
  assert.deepEqual(d.body.deleted, { id: RX.added.id, name: rxName("new") });
  rxClean(d);
  assert.equal((await rest(`event_signups?select=id&id=eq.${RX.added.id}`, "GET")).length, 0);
  assert.equal((await del(RX.added)).body.error, "not-found");
  assert.equal((await call(t, "evRowDelete", { id: 0, expect: "" })).body.error, "not-found");

  // 바꾼 기록 — Task 13 audit.js 가 읽는 모양
  const ours = new Set([...RX.rowIds, RX.edit.id, RX.old.id, RX.app.id, RX.el.id].map(String));
  const logs = (await call(people.super.token, "auditList", { limit: 200 })).body.rows
    .filter((r) => r.action.startsWith("event.") && ours.has(r.target));
  const acts = new Set(logs.map((r) => r.action));
  for (const a of ["event.add", "event.edit", "event.delete"]) assert.ok(acts.has(a), a + " " + JSON.stringify([...acts]));
  assert.ok(!RX_UUID.test(JSON.stringify(logs.map((r) => r.detail))), "기록에 UUID 꼴 값(user_id)이 실렸다");
  const addLog = logs.find((r) => r.action === "event.add" && r.target === String(RX.linked.id));
  assert.deepEqual(addLog.detail, { event_id: RX.ev, name: rxName("link"),
    row: { who_type: "교구", group: "믿음", sub: "3", position: "명예권사" }, linked: true });
  const editLog = logs.find((r) => r.action === "event.edit" && r.target === String(RX.linked.id));
  assert.deepEqual([editLog.detail.event_id, editLog.detail.name], [RX.ev, rxName("link")]);
  assert.deepEqual([editLog.detail.before, editLog.detail.after], [{ sub: "3" }, { sub: "4" }]);   // 바뀐 칸만
  const noteLog = logs.find((r) => r.action === "event.edit" && r.target === String(RX.edit.id));
  assert.deepEqual([noteLog.detail.before, noteLog.detail.after],
    [{ note: "원래: 화평 30 · 집사" }, { note: "원래: 화평 30 · 집사 / 확인함" }]);             // 메모는 note
  const delLog = logs.find((r) => r.action === "event.delete" && r.target === String(RX.added.id));
  assert.deepEqual(delLog.detail, { event_id: RX.ev, name: rxName("new"),
    row: { who_type: "교구", group: "화평", sub: "7", position: "집사", note: "담당자가 더함 / 시험 메모", source: "import", hasUser: false } });
});
```

문법만 먼저 본다(`.mjs` 라 `node --check` 가 잡는다):

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
node --check tests/server.dev.test.mjs && echo "server.dev 문법 통과"
```

- [ ] **Step 10: 돌려서 실패를 본다(개발에 배포된 함수는 아직 Task 6 판이다)**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
set -a; . ~/.church-admin/dev.env; set +a
node --experimental-strip-types --test tests/server.dev.test.mjs
```
Expected: FAIL — 「권한 표: 사람 다섯 × 역할이 필요한 액션」이 `evRowAdd` 에서 400 `unknown-action` 으로 `not ok`, 새 시험 넷(「성경필사 한 분 더하기: 넣음…」·「…동시에 셋…」·「성경필사 줄 고치기…」·「성경필사 줄 빼기…」)이 `unknown-action` 으로 `not ok` — 합해서 `# fail 5`. 「역할이 필요한 액션마다 시험 입력(PROBE)이 있다」는 **통과**(authz·PROBE 둘 다 이미 있다). `after()` 의 정리는 모두 돈다(「정리 실패」 줄이 없어야 한다 — 시험 회차·`ca-test-rx…` 계정이 남으면 안 된다).

- [ ] **Step 11: index.ts — 새 import 문(기존 import 줄은 건드리지 않는다)**

먼저 `./events-rules.ts` 에서 **이미 들여온 이름**을 본다(같은 이름을 두 번 들여오면 Deno 가 뜨지 않는다):

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
node -e '
const s=require("fs").readFileSync(process.argv[1],"utf8");
const got=[];for(const m of s.matchAll(/import\s*\{([^}]*)\}\s*from\s*"\.\/events-rules\.ts"/g))for(const p of m[1].split(","))if(p.trim())got.push(p.trim().replace(/^type\s+/,"").split(/\s+as\s+/).pop());
for(const n of ["checkNote","checkRow","identKey","isEligEvent","EvRow"])console.log(n.padEnd(12),got.includes(n)?"이미 있음":"없음");' supabase/functions/church-admin/index.ts
grep -cE 'applicantFromSignup.*"\./people-match\.ts"|"\./people-match\.ts".*applicantFromSignup' supabase/functions/church-admin/index.ts
```
Expected: `isEligEvent  이미 있음`(Task 5 가 `evOut` 의 `hasEligibility` 에 쓴다) · 나머지 넷(`checkNote`·`checkRow`·`identKey`·`EvRow`)은 `없음` · 마지막 grep `1`(Task 5 가 `applicantFromSignup` 을 이미 들여왔다).
다르면: `isEligEvent` 가 `없음` 이면 아래 첫 줄에 `isEligEvent` 를 더하고, 넷 중 `이미 있음` 인 이름은 아래 첫 줄에서 뺀다. 마지막 grep 이 `0` 이면 **멈춘다**(Task 5 가 덜 끝났다).

앵커 `import { parseSearch, searchDetail, sortOrder, statsOf, PAGE_SIZE, PHOTO_TTL, FILTER_KEYS, type Search } from "./people-query.ts";` 는 건드리지 않고, **맨 마지막 import 문 바로 뒤**(`const cors = {` 줄 앞)에 두 줄을 더한다:

```ts
// 성경필사(암송) — 한 분 더하기·줄 고치기·빼기(계획 Task 7)
import { checkNote, checkRow, identKey, type EvRow } from "./events-rules.ts";
import { ADD_TAG, askableKeys, checkChanged, formRow, oddPosition, rowPatch, sameKeys, tagNote, touchesRow } from "./events-rows.ts";
```

더한 뒤 import 이름이 겹치지 않는지 본다:

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
grep -cF 'const cors = {' supabase/functions/church-admin/index.ts        # 1
node -e '
const s=require("fs").readFileSync(process.argv[1],"utf8");
const names=[];for(const m of s.matchAll(/^import\s*\{([^}]*)\}\s*from/gm))for(const p of m[1].split(","))if(p.trim())names.push(p.trim().replace(/^type\s+/,"").split(/\s+as\s+/).pop());
const dup=[...new Set(names.filter((n,i)=>names.indexOf(n)!==i))];
console.log(dup.length?"겹친 이름: "+dup.join(", "):"import 이름 "+names.length+"개 — 겹침 없음");process.exit(dup.length?1:0);' supabase/functions/church-admin/index.ts
```
Expected: `1` · `import 이름 N개 — 겹침 없음`. (겹치면 새로 더한 줄에서 그 이름을 뺀다 — 기존 줄은 고치지 않는다.)

- [ ] **Step 12: index.ts — 도움 함수 넷(`usersByKeys`·`sameInEvent`·`evRowRead`·`evRowChurch`)**

앵커 `Deno.serve(async (req) => {`(Step 1 에서 1) 줄 **바로 앞에** 붙인다(Task 5·6 이 붙인 성경필사 절 뒤가 된다):

```ts
// ---------- 성경필사(암송) — 한 분 더하기 · 줄 고치기 · 빼기 (계획 Task 7) ----------
// 설계 §1 「같은 분 판정과 앱 계정 잇기」·§2 evRowAdd/evRowSave/evRowDelete.
// ⚠️ 앱 계정은 **조회만** 해서 잇는다 — member_login 을 부르지 않는다(주간 리포트 「신규 인원」이 부풀지 않게).
// ⚠️ user_id·ident_key 는 서버 안에서만 쓴다 — 응답은 rowOut(명시적 칸 지도) 하나로만 만든다.
// ⚠️ 줄 칸은 Task 5 의 EV_ROW_COLS 하나만 쓴다(같은 목록을 두 벌 두지 않는다).
// ⚠️ 자격 회차 판정은 events-rules.ts isEligEvent(needs) 하나 — 화면의 hasEligibility(evOut)와 같은 함수다.

// 신원 키 → 앱 계정 id 들. users.identity_key 와 user_identity_aliases(소속을 고친 분의 옛 키) 둘 다 본다.
// ⚠️ 한글 키는 주소가 길다 — 100개씩 나눠 묻는다(성경암송 eventImport 는 164개에서 GET 주소 한도를 넘어 조용히 0명이 됐다).
// ⚠️ 키를 다시 다듬지 않는다 — candidateKeys 가 appIdentityKey 로 만든 그대로 맞댄다(keysToUserIds 는 NFC 로 맞춰서 못 쓴다).
async function usersByKeys(keys: string[]): Promise<Map<string, string[]>> {
  const uniq = askableKeys(keys);
  const out = new Map<string, string[]>();
  const add = (k: string, id: string) => {
    const l = out.get(k) ?? [];
    if (!l.includes(id)) l.push(id);
    out.set(k, l);
  };
  for (let i = 0; i < uniq.length; i += 100) {
    const part = uniq.slice(i, i + 100);
    const { data: us, error: e1 } = await db.from("users").select("id,identity_key").in("identity_key", part);
    if (e1) throw e1;
    for (const u of (us ?? []) as any[]) add(u.identity_key, u.id);
    const { data: al, error: e2 } = await db.from("user_identity_aliases").select("identity_key,user_id").in("identity_key", part);
    if (e2) throw e2;
    for (const a of (al ?? []) as any[]) add(a.identity_key, a.user_id);
  }
  return out;
}

// 설계 §1 같은 분 판정 3 — 그 회차에 ① 신원 키가 후보에 드는 줄, 또는 ② 후보 키로 찾은 계정의 줄(앱에서 낸 줄 포함)이 있으면 already.
// user_id 가 없는 줄은 DB unique 가 막지 않으므로(NULLS DISTINCT) 이 판정이 유일한 막이다. excludeId = 고치는 줄 자신.
async function sameInEvent(eventId: string, row: EvRow, excludeId?: number): Promise<"already" | null> {
  const keys = askableKeys(sameKeys(row));
  for (let i = 0; i < keys.length; i += 100) {
    let q = db.from("event_signups").select("id").eq("event_id", eventId).in("ident_key", keys.slice(i, i + 100));
    if (excludeId) q = q.neq("id", excludeId);
    const { data, error } = await q.limit(1);
    if (error) throw error;
    if ((data ?? []).length) return "already";
  }
  const ids = [...new Set([...(await usersByKeys(keys)).values()].flat())];
  for (let i = 0; i < ids.length; i += 200) {
    let q = db.from("event_signups").select("id").eq("event_id", eventId).in("user_id", ids.slice(i, i + 200));
    if (excludeId) q = q.neq("id", excludeId);
    const { data, error } = await q.limit(1);
    if (error) throw error;
    if ((data ?? []).length) return "already";
  }
  return null;
}

async function evRowRead(id: number): Promise<any | null> {
  const { data, error } = await db.from("event_signups").select(EV_ROW_COLS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

// 한 줄의 교적 표시 — 이름 하나만 묻는다. 쓰기 **전에** 부른다(쓴 뒤에 실패해 500 이 되지 않게).
async function evRowChurch(r: { who_type: string; group_name: string; sub_name: string; name: string }) {
  return churchFor(await churchLookup([r.name]), applicantFromSignup(r));
}

```

- [ ] **Step 13: index.ts — `evRowAdd`**

다시 앵커 `Deno.serve(async (req) => {` 줄 **바로 앞에**(Step 12 의 `evRowChurch` 뒤가 된다):

```ts
// 한 분 더하기 — source='import' · 메모 앞에 「담당자가 더함」 · 계정은 **하나일 때만** 잇는다(둘 이상이면 알리기만).
// 자격 회차(가을 말씀 동행)는 막는다 — 가을 설계 §12 「대리 등록은 보정 창구로만」.
async function evRowAdd(ctx: Ctx, b: any) {
  const ev = await evRead(b.event_id);                 // 모양이 틀린 id 는 묻지 않고 null(Task 5)
  if (!ev) return { ok: false, error: "not-found" };
  if (isEligEvent(ev.needs)) return { ok: false, error: "eligibility-event" };
  const row = formRow(b.row);
  const bad = checkRow(row);
  if (bad) return { ok: false, error: bad };
  // 메모 길이는 머리 표기(「담당자가 더함 / 」)를 붙인 **뒤**로 센다(계약 §5 — 창의 글자 수 상한은 480)
  const note = tagNote(ADD_TAG, (b.row ?? {}).note);
  const nbad = checkNote(note);
  if (nbad) return { ok: false, error: nbad };
  if (await sameInEvent(ev.id, row)) return { ok: false, error: "already" };

  // sameInEvent 가 통과했으니 찾은 계정은 이 회차에 없다(그 사이 앱에서 냈으면 아래 23505 가 already 로 돌린다)
  const accounts = [...new Set([...(await usersByKeys(sameKeys(row))).values()].flat())];
  const userId = accounts.length === 1 ? accounts[0] : null;
  const warnings: string[] = [];
  if (accounts.length > 1) warnings.push(`같은 이름·소속의 앱 계정이 ${accounts.length}개라 잇지 않았어요`);
  if (oddPosition(row.position)) warnings.push(`직분 「${row.position}」 — 앱 직분 목록에 없어요(적은 그대로 넣었어요)`);
  const church = await evRowChurch(row);

  const { data: saved, error } = await db.from("event_signups").insert({
    event_id: ev.id, user_id: userId, ident_key: identKey(row),
    who_type: row.who_type, group_name: row.group_name, sub_name: row.sub_name, name: row.name, position: row.position,
    note, source: "import", updated_at: new Date().toISOString(),
  }).select(EV_ROW_COLS).single();
  if (error) {
    // (event_id, user_id) unique — 같은 계정을 동시에 둘이 넣었다. 500 이 아니라 「이미 있음」.
    if ((error as any).code === "23505") return { ok: false, error: "already" };
    throw error;
  }
  await audit(ctx, "event.add", String(saved.id), {
    event_id: ev.id, name: row.name,
    row: { who_type: row.who_type, group: row.group_name, sub: row.sub_name, position: row.position },
    linked: !!userId,
  });
  return { ok: true, row: rowOut(saved, church), linked: !!userId, warnings };
}

```

- [ ] **Step 14: index.ts — `evRowSave`·`evRowDelete` + switch 세 줄**

다시 앵커 `Deno.serve(async (req) => {` 줄 **바로 앞에**(`evRowAdd` 뒤가 된다):

```ts
// 기록(event.edit)의 칸 이름은 화면 이름(group·sub) — event.add/delete 의 row 와 같게(Task 13 audit.js 가 한 벌로 읽는다)
const EV_AUDIT_FIELD: Record<string, string> = { who_type: "who_type", group_name: "group", sub_name: "sub", name: "name", position: "position" };

// 줄 고치기 — **보낸 칸만**, 검사도 **바뀐 칸만**(옛 값 때문에 저장이 막히지 않게 · 설계 §1 끝).
// 신원 칸이 바뀌면 ident_key 를 다시 만들고 user_id 는 그대로(이어진 계정을 떼거나 바꾸지 않는다).
// 앱에서 낸 줄·자격 회차의 줄은 메모만 — 성도님이 앱에서 고치면 소속·직분이 통째로 덮인다(eventSignup upsert).
async function evRowSave(ctx: Ctx, b: any) {
  const id = Number(b.id) || 0;
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, error: "not-found" };
  const cur = await evRowRead(id);
  if (!cur) return { ok: false, error: "not-found" };
  if (String(b.expect ?? "") !== cur.updated_at) return { ok: false, error: "conflict" };
  const p = b.patch && typeof b.patch === "object" && !Array.isArray(b.patch) ? b.patch : {};
  const ev = await evRead(cur.event_id);
  if (!ev) return { ok: false, error: "not-found" };
  if ((cur.source !== "import" || isEligEvent(ev.needs)) && touchesRow(p)) return { ok: false, error: "app-row-note-only" };

  const { next, changed } = rowPatch(cur, p);
  const bad = checkChanged(next, changed);
  if (bad) return { ok: false, error: bad };
  const hasNote = Object.prototype.hasOwnProperty.call(p, "note");
  const note = hasNote ? legacyNorm(p.note) : (cur.note ?? "");     // 메모는 한 줄로(성경암송 eventSetNote 와 같다)
  const nbad = hasNote ? checkNote(note) : null;
  if (nbad) return { ok: false, error: nbad };
  const noteChanged = note !== (cur.note ?? "");
  if (!changed.length && !noteChanged) return { ok: true, row: rowOut(cur, await evRowChurch(cur)) };   // 쓰지 않는다

  const identity = changed.some((f) => f !== "position");
  if (identity && await sameInEvent(cur.event_id, next, id)) return { ok: false, error: "already" };
  const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const f of changed) upd[f] = next[f];
  if (identity) upd.ident_key = identKey(next);
  if (noteChanged) upd.note = note;
  const church = await evRowChurch(next);
  // 읽은 뒤 그사이 바뀌었으면 0행 — 지워졌으면 not-found, 고쳐졌으면 conflict
  const { data: saved, error } = await db.from("event_signups").update(upd)
    .eq("id", id).eq("updated_at", cur.updated_at).select(EV_ROW_COLS);
  if (error) throw error;
  if (!saved?.length) return { ok: false, error: (await evRowRead(id)) ? "conflict" : "not-found" };

  const before: Record<string, unknown> = {}, after: Record<string, unknown> = {};
  for (const f of changed) { before[EV_AUDIT_FIELD[f]] = cur[f]; after[EV_AUDIT_FIELD[f]] = next[f]; }
  if (noteChanged) { before.note = cur.note ?? ""; after.note = note; }
  await audit(ctx, "event.edit", String(id), { event_id: cur.event_id, name: next.name, before, after });
  return { ok: true, row: rowOut(saved[0], church) };
}

// 줄 빼기 — 담당자가 넣은(import) 줄만. 앱에서 낸 줄은 app-row(성도님이 앱에서 취소한다).
// 자격 회차의 줄은 eligibility-event(계약 §5) — 그 명단은 「꾸준히 했다는 판정 결과」다(가을 설계 §10). 화면도 빼기를 숨긴다.
async function evRowDelete(ctx: Ctx, b: any) {
  const id = Number(b.id) || 0;
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, error: "not-found" };
  const cur = await evRowRead(id);
  if (!cur) return { ok: false, error: "not-found" };
  if (String(b.expect ?? "") !== cur.updated_at) return { ok: false, error: "conflict" };
  if (cur.source !== "import") return { ok: false, error: "app-row" };
  const ev = await evRead(cur.event_id);
  if (!ev) return { ok: false, error: "not-found" };
  if (isEligEvent(ev.needs)) return { ok: false, error: "eligibility-event" };
  const { data: gone, error } = await db.from("event_signups").delete()
    .eq("id", id).eq("updated_at", cur.updated_at).select("id");
  if (error) throw error;
  if (!gone?.length) return { ok: false, error: (await evRowRead(id)) ? "conflict" : "not-found" };
  await audit(ctx, "event.delete", String(id), {
    event_id: cur.event_id, name: cur.name,
    row: { who_type: cur.who_type, group: cur.group_name, sub: cur.sub_name, position: cur.position,
      note: cur.note ?? "", source: cur.source, hasUser: !!cur.user_id },
  });
  return { ok: true, deleted: { id: cur.id, name: cur.name } };
}

```

`Deno.serve` 의 switch 에서 앵커 `case "evEventSave":`(Task 6 · Step 1 에서 1) 줄 **바로 뒤에**:

```ts
      case "evRowAdd":    return json(await evRowAdd(ctx, b));
      case "evRowSave":   return json(await evRowSave(ctx, b));
      case "evRowDelete": return json(await evRowDelete(ctx, b));
```

붙인 자리를 확인한다:

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
F=supabase/functions/church-admin/index.ts
for s in 'async function usersByKeys(' 'async function sameInEvent(' 'async function evRowRead(' 'async function evRowChurch(' \
  'async function evRowAdd(' 'async function evRowSave(' 'async function evRowDelete(' 'case "evRowAdd":' 'case "evRowSave":' 'case "evRowDelete":'; do
  printf '%s  %s\n' "$(grep -cF -- "$s" $F)" "$s"; done
grep -c 'EV_ROW_EDIT_COLS' $F
```
Expected: 열 줄 모두 맨 앞이 `1` · 마지막 `0`. (이 파일의 문법은 `node --check` 가 못 잡는다 — Step 15 의 **개발 함수 배포**가 문법 검사다. 정의되지 않은 이름은 배포도 못 잡고 개발 시험이 잡는다.)

- [ ] **Step 15: preflight · 커밋 · 개발 배포 · 개발 시험**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
python tools/preflight.py
git add supabase/functions/church-admin/authz.ts supabase/functions/church-admin/index.ts tests/authz.test.mjs tests/server.dev.test.mjs
git commit -F - <<'EOF'
feat(성경필사): 한 분 더하기·줄 고치기·빼기(evRowAdd·evRowSave·evRowDelete) — 같은 분 판정(07/7·별칭 계정)·계정은 조회만 잇기·앱 줄과 자격 회차는 메모만·자격 회차 빼기 막기·동시 수정 대조

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
git show --stat HEAD      # 네 파일만인지 본다
git status --short        # 아무것도 안 나와야 한다(배포는 작업 트리를 통째로 올린다)
# 워크트리 루트에서(supabase/functions/church-admin·supabase/config.toml 이 있는 곳 — 작업 폴더 supa-dev 가 아니다)
supabase functions deploy church-admin --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo
set -a; . ~/.church-admin/dev.env; set +a
node --experimental-strip-types --test tests/server.dev.test.mjs
```
Expected: preflight `모두 통과`(새 `events-rows.test.mjs` 포함) · 배포 `Deployed Functions on project ktpwthwqzgcqcrmsafdo: church-admin`(배포가 실패하면 index.ts 문법 오류다 — 겹친 import·괄호부터 본다) · 개발 시험 `# fail 0` — 새 시험 넷(「성경필사 한 분 더하기: 넣음…」·「…동시에 셋…」·「성경필사 줄 고치기…」·「성경필사 줄 빼기…」)과 「권한 표」·「PROBE」 모두 통과, `정리 실패` 없음.
실패하면 고치고 **새 커밋**으로(앞 커밋을 고치지 않는다) 다시 배포·시험한다. 「동시에 셋」 시험이 가끔 500 이면 23505 → `already` 줄이 빠진 것이다. ⚠️ 운영(`xnomlgydifiqiybervtf`)에는 배포하지 않는다 — 운영은 Task 15 에서만. 푸시하지 않는다.


### Task 8: 명단 올리기·교인명부 찾기 — `evUploadCheck` · `evUploadSave` · `evPeopleLookup` (판정 순수 모듈 `events-upload.ts`)

이 과제가 끝나면 `bibleevent` 담당자가 엑셀·붙여넣기 명단을 **살펴보고**(줄마다 넣음·이미 있음·빈칸·모양 틀림·교인명부로 채움·교인명부 동명이인) **넣을 수** 있고, 한 분 더하기 폼이 교인명부를 이름으로 찾아 **다섯 칸**(이름·구분·소속·세부·직분)을 받을 수 있다(화면은 Task 10·11).

모든 명령은 워크트리 `C:\Projects\church-admin\.worktrees\bible-events` 에서(Git Bash: `cd /c/Projects/church-admin/.worktrees/bible-events`). 기준점은 church-admin main `a2dfd7c` + Task 1~7 의 커밋. **줄 번호를 쓰지 않는다** — 고칠 자리는 모두 「앵커 글」로 찾고, Step 1 에서 앵커마다 `grep -c` 로 **한 번만** 나오는지 먼저 본다(다른 세션이 main 을 계속 고친다). 작업 트리 파일은 CRLF(`core.autocrlf=true`)라 grep 앵커 끝에 `$` 를 쓰지 않는다.

> **왜 새 순수 모듈(`events-upload.ts`)인가 · 왜 줄마다 `sameInEvent`·`usersByKeys` 를 부르지 않는가**
> - `sameInEvent`(Task 7)는 한 줄에 PostgREST 요청을 넷 안팎 보낸다 — 600줄이면 2천 번이 넘는다. 올리기는 **회차 명단을 한 번**(`allRows`) 읽고, 같은 규칙(설계 §1 같은 분 판정 1~4)을 순수 함수 `judgeUpload` 가 메모리에서 맞댄다.
> - 앱 계정도 **통째로 한 번** 읽는다(`evAccountIndex` — `users`·`user_identity_aliases` 를 `allRows`). 설계 §1-2 가 「`users` 는 쪽을 나눠 전부 읽는다(지금 421행)」로 정했다. 올리기의 후보 키는 수천 개라 `usersByKeys`(100개씩 `.in()`)로 물으면 요청이 수십 번이고, 한글 키 100개면 주소가 11KB 안팎이다 — 성경암송 `eventImport` 는 164개에서 주소 한도를 넘었다(api/index.ts `eventImport` ② 주석). `usersByKeys` 는 키가 스무 개 안쪽인 한 분 더하기·고치기(Task 7)에만 쓴다.
> - 후보 키는 한 분 더하기·고치기와 **같은 함수** — Task 7 `events-rows.ts` 의 `sameKeys`(「07」 꼴 포함)를 그대로 쓴다. 규칙이 두 벌이 되지 않게.
> - index.ts 는 이 과제의 이름을 **`./events-upload.ts` 한 곳에서만, 새 import 문 하나로** 가져온다(CONTRACT 5 「기존 import 줄을 다시 쓰지 않는다」). 찾기의 이름 다듬기(`lookupName`)·다섯 칸 만들기(`lookupOut`)·올리기 막기(`tooManyRows`·`uploadEventError`)도 이 모듈에 두어, Task 5~7 이 이미 가져왔을 `BE_BAD_CHARS`·`BE_FIELD_MAX`·`isEligEvent`·`nameKey`·`lookupView` 를 index.ts 에서 다시 가져올 일이 없다(같은 이름을 두 번 가져오면 함수가 뜨지 않는다).
> - 다듬기·채우기·판정·건수·넣을 줄·찾기 모양을 Node 시험으로 붙잡으려면 index.ts 밖에 있어야 한다. Task 2·3·7 의 파일과 시험은 건드리지 않는다.

**판정(mark) 뜻** — 화면(Task 11)과 기록(Task 13)이 이 뜻으로 읽는다:

| mark | 뜻 | 넣나 |
|---|---|---|
| `add` | 넣음 | ✅ |
| `fill` | 빈칸을 교인명부로 채워 넣음(메모 `명단 올리기 / 소속: 교인명부로 채움`) | ✅ |
| `same` | 이미 있음 — 이 회차에(신원 키 또는 이어질 계정의 줄) 또는 **이 파일 위쪽 줄**과 같은 분(먼저 나온 줄이 남는다) | — |
| `blank` | 소속이 비었다(판정표 `no-group` — 교구 칸이 비었거나, 「교회학교」인데 부서 칸이 비었다) — 채우기를 껐거나 채우지 못했다 | — |
| `same-name` | **소속을 못 정한 줄(빈칸)**인데 교인명부에 같은 이름이 둘 이상 | — |
| `bad` | 모양 틀림 — `error` 에 판정표 코드(`no-name`·`bad-char`·`too-long`·`bad-type`·`bad-group`·`bad-sub`) | — |

**빈칸 채우기(`fill`)** — 채울지·무엇을 채울지는 Task 3 `fillDecision` 이 정하고(CONTRACT 5 「빈칸 채우기 보강」), 이 과제는 그 결과를 줄에 얹고 알림을 적는다:
- 이름이 교인명부 전체에서 **한 분**일 때만 · **빈 칸만**(명단에 적힌 교구·목장·직분은 덮지 않는다).
- 줄에 소속이 적혀 있는데 교인명부 분의 소속(구분·교구/부서)과 다르면 **아무것도 채우지 않는다**(`different-affiliation` → 그 줄은 `add` 그대로 · 알림).
- **교구 칸이 빈 줄**을 교인명부로 채우면 **목장도 교인명부 값**을 쓴다 — 적혀 있던 목장은 버리고 notes 에 「적힌 목장 N 대신 교인명부 목장을 넣었어요」.
- 소속이 적혀 있고 직분만 비었는데 교인명부 동명이인이면 `add`(직분은 빈 채로) — `same-name` 은 소속을 못 정한 줄에만.

소속이 적힌 줄의 빈 목장·직분을 채우지 못한 경우(동명이인·명부에 없음·소속 다름)는 `add` 로 그대로 넣고 `notes` 에 까닭을 적는다. `notes` 는 화면이 그대로 보여 주는 한국어 한 줄들이다(「위 N번 줄과 같은 분이에요」의 N 은 `i+1`). **notes 에 교인명부의 원래 칸 값(「소망-12목장」 같은 mok3)을 싣지 않는다.**

**Files:**
- Create: `supabase/functions/church-admin/events-upload.ts` — 막기·다듬기·빈칸 채우기·같은 분 판정·건수·넣을 줄·찾기 모양(순수 함수 — 규칙은 Task 2·3·7 것을 부르기만 한다)
- Create: `tests/events-upload.test.mjs`
- Modify: `supabase/functions/church-admin/authz.ts` — 앵커 `evRowDelete: "bibleevent",`(Task 7) 줄 바로 뒤에 세 줄
- Modify: `tests/authz.test.mjs` — 앵커 `ACTION_ROLES[k] === "bibleevent"`(Task 5 의 bibleevent 블록) 아래 `assert.deepEqual(acts.sort(), [ … ]);` 문 하나
- Modify: `supabase/functions/church-admin/index.ts` — 앵커 `const cors = {` 바로 위에 새 import 문 하나 · 앵커 `Deno.serve(async (req) => {` 바로 위에 새 절 · 앵커 `case "evRowDelete":`(Task 7) 줄 바로 뒤에 case 세 줄
- Modify: `tests/server.dev.test.mjs` — 앵커 `let rxReady = null;`(Task 7) 뒤 상수 · 앵커 `  evRowDelete: { id: 0, expect: "" },`(Task 7 PROBE) 뒤 세 줄 · 앵커 `if (errs.length) throw new Error("정리 실패 "` 앞 정리(교인명부 시험 줄·시험 계정 — 회차는 Task 5 단계가 지운다) · 파일 끝에 시험 넷

**Interfaces:**
- Consumes:
  - Task 2 `events-rules.ts`: `BE_MAX_UPLOAD`(600) · `BE_FIELD_MAX`(40) · `BE_BAD_CHARS` · `tidyRaw(raw: RawCells): { row: EvRow | null; notes: string[]; error: string | null }`(네 칸이 다 빌 때만 `row` 가 null · 소속이 비면 `no-group`) · `checkRow(row: EvRow): string | null` · `identKey(row: EvRow): string` · **`isEligEvent(needs: unknown): boolean`**(CONTRACT 5 — 자격 회차 판정은 이것 하나) · `type EvRow` · `type RawCells`
  - Task 3 `events-people.ts`: `fillDecision(row, cands: ChurchPerson[]): { patch; reason: FillReason }` — CONTRACT 5 보강판(`"different-affiliation"` · 교구 칸이 빈 줄을 채우면 `patch` 에 `who_type`·`group_name`·`sub_name`(교인명부 값) 셋이 다 있다) · `lookupView(p, name): { name, who_type, group_name, sub_name, position }` · `type ChurchPerson`
  - Task 7 `events-rows.ts`: `sameKeys(row: EvRow): string[]` · `tagNote(tag, note): string` · `oddPosition(position): boolean`
  - `people-match.ts`: `nameKey` · `paper.ts`: `legacyNorm`
  - `index.ts`: Task 5 `evRead(id: unknown): Promise<events 한 줄(needs 포함) | null>`(모양이 틀린 id 는 묻지 않고 null) · main 의 `allRows` · `audit` · `peopleSource` · `db` · `json` · `type Ctx`. (Task 7 `usersByKeys` 는 **쓰지 않는다** — 위 「왜」)
  - Task 5 `server.dev.test.mjs`: `people.bibleevent` · `want()` 의 `bibleevent` 칸 · `EV_EL_ID`(자격 회차) · `dbCount(eventId)` · before() 가 올린 `church_people_imports`(기준일 `2000-01-01`) · `after()` 의 `step()`/`errs` 와 「성경필사 시험 회차」 단계(`events?id=like.ca-test-*<STAMP>*` 를 지운다 — 이 과제의 회차 `ca-test-up-<STAMP>` 도) · Task 7 의 `let rxReady = null;`·`evRowDelete` PROBE 줄(앵커)
- Produces:
  - `events-upload.ts`: `UPLOAD_TAG = "명단 올리기"` · `FILL_TAG = "소속: 교인명부로 채움"` · `LOOKUP_MAX = 20` · `type UploadMark` · `type UpRow` · `type UploadItem` · `type UploadCounts` · `type UploadOut` · `type JudgeIdx` · `tooManyRows(raws): boolean` · `uploadEventError(ev): "not-found" | "eligibility-event" | null` · `rawOf(x): RawCells` · `tidyUpload(raws: unknown[]): UploadItem[]` · `fillNames(items): string[]` · `applyFill(items, cands: Map<string, ChurchPerson[]> | null): UploadItem[]` · `uploadKeys(items): string[]` · `judgeUpload(items, idx: JudgeIdx): UploadItem[]` · `uploadCounts(items): UploadCounts` · `uploadOut(items): UploadOut[]` · `uploadRecords(items, eventId, now): { i; rec }[]` · `filledNames(items): string[]` · `lookupName(v): { name; key; error }` · `lookupOut(p): { name, who_type, group, sub, position }`
  - `index.ts`(이 과제 안에서만 쓰는 도움): `EV_FILL_COLS` · `EV_LOOKUP_COLS` · `evChurchCands(keys)` · `evAccountIndex()` · `evUpload(ctx, b, save)` · `evPeopleLookup(ctx, b)`
  - 액션(모두 `bibleevent` · CONTRACT 2 모양 그대로):
    - `evUploadCheck {event_id, rows: RawCells[], fill}` → `{ok, total, rows: UploadOut[], counts}` — `total` = **이 회차의 지금 줄 수**(화면은 `total + counts.add + counts.fill > 1000` 이면 경고)
    - `evUploadSave` 같은 것 → `{ok, counts, saved, failed: [{i, error: "already" | "server"}]}`
    - `evPeopleLookup {name}` → `{ok, source: {date, total} | null, people: [{name, who_type, group, sub, position}]}`
    - 오류: `too-many`(600줄 넘음 — 회차를 읽기 전) · `not-found`(없는·모양 틀린 회차) · `eligibility-event` · `no-name` · `bad-char` · `too-long`(찾기)
  - 기록(`admin_audit`) 모양 — CONTRACT 5 「기록 모양」 그대로, Task 13 `audit.js` 가 이 모양을 읽는다:
    - `event.upload` · target 회차 id · **납작하게** `{ rows, fillOn, add, same, blank, bad, fill, sameName, oddPosition, saved, failed }` — 넣기마다(보낸 줄이 있을 때), **숫자·참거짓만**(이름 없음). 채우기 여부 칸이 `fillOn` 인 것은 건수 `fill` 과 부딪히지 않게. `failed` 는 개수.
    - `people.lookup` · target `''` · `{ q, count }` — 찾을 때마다(명부가 한 번도 안 올라왔으면 묻지도 기록하지도 않는다)
    - `people.fill` · target 회차 id · `{ rows, names }` — 살펴보기(`evUploadCheck`)에서 채우기를 켜고 한 줄이라도 채웠을 때만(교적 값이 화면으로 나간 때)

- [ ] **Step 1: 선행 확인 — 앵커가 한 번씩 있는가 · Task 2·3·5·7 의 이름과 CONTRACT 5 규칙이 있는가 · 이 과제의 이름이 아직 없는가**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
A=supabase/functions/church-admin/authz.ts; I=supabase/functions/church-admin/index.ts
S=tests/server.dev.test.mjs; T=tests/authz.test.mjs
# ① 앵커 — 여덟 줄 모두 1
grep -c 'evRowDelete: "bibleevent",' $A
grep -c 'ACTION_ROLES\[k\] === "bibleevent"' $T
grep -c '^const cors = {' $I
grep -c '^Deno.serve(async (req) => {' $I
grep -c 'case "evRowDelete":' $I
grep -c '^let rxReady = null;' $S
grep -c '^  evRowDelete: { id: 0, expect: "" },' $S
grep -c 'if (errs.length) throw new Error("정리 실패 "' $S
# ② 쓰는 도움 함수(4) · 시험 도구(3)
grep -cE '^async function (evRead|allRows|audit|peopleSource)\(' $I
grep -cE '^async function dbCount\(|^const EV_EL_ID = |bibleevent: role === "bibleevent"' $S
# ③ 이 과제가 만들 이름 — 모두 0(파일마다 「:0」)
grep -cE '\b(events-upload|EV_FILL_COLS|EV_LOOKUP_COLS|evChurchCands|evAccountIndex|evUpload|evPeopleLookup|evUploadCheck|evUploadSave)\b' $I $A
grep -cE '\b(UP_DIR_IDS|UP_UUID|UP_OUT_KEYS|UP_ROW_KEYS|upName|upFixtures|upRows|upReady)\b' $S
ls supabase/functions/church-admin/events-upload.ts tests/events-upload.test.mjs 2>&1 | grep -c "No such file"
# ④ 가져올 이름 · CONTRACT 5 규칙 셋(fillDecision 보강 둘 · isEligEvent(needs))
node --experimental-strip-types --input-type=module -e "
const D = './supabase/functions/church-admin/';
const need = {
  'events-rules.ts': ['BE_MAX_UPLOAD', 'BE_FIELD_MAX', 'BE_BAD_CHARS', 'tidyRaw', 'checkRow', 'identKey', 'isEligEvent'],
  'events-people.ts': ['fillDecision', 'lookupView'],
  'events-rows.ts': ['sameKeys', 'tagNote', 'oddPosition'],
  'people-match.ts': ['nameKey'],
  'paper.ts': ['legacyNorm'],
};
const m = {};
for (const [f, ks] of Object.entries(need)) {
  m[f] = await import(D + f);
  for (const k of ks) if (typeof m[f][k] === 'undefined') throw new Error(f + ' 에 ' + k + ' 가 없다');
}
const { fillDecision } = m['events-people.ts'], { isEligEvent } = m['events-rules.ts'];
const P = { name_key: '가나', kind2: '장년', mok1: '소망', mok3: '소망-3목장', school_dept: '', position: '집사', position_detail: '' };
const d1 = fillDecision({ who_type: '교구', group_name: '화평', sub_name: '', name: '가나', position: '' }, [P]);
if (d1.reason !== 'different-affiliation' || d1.patch !== null) throw new Error('fillDecision: 소속이 다르면 different-affiliation — ' + JSON.stringify(d1));
const d2 = fillDecision({ who_type: '', group_name: '', sub_name: '21', name: '가나', position: '' }, [P]);
if (d2.reason !== 'filled' || !d2.patch || d2.patch.group_name !== '소망' || d2.patch.sub_name !== '3')
  throw new Error('fillDecision: 교구 칸을 채우면 목장도 교인명부 값 — ' + JSON.stringify(d2));
if (isEligEvent({ eligibility: { start: '2026-10-11' } }) !== true || isEligEvent({ position: true }) !== false || isEligEvent(null) !== false)
  throw new Error('isEligEvent(needs) 가 CONTRACT 5 와 다르다');
console.log('import 이름·규칙 모두 있음');
"
```
Expected: ① 여덟 줄 모두 `1` · ② `4` 그리고 `3` · ③ 두 줄 모두 `…:0`(파일마다) 그리고 `0`, 이어서 `2`(두 파일 모두 없다) · ④ `import 이름·규칙 모두 있음`(ExperimentalWarning 한 줄은 괜찮다).
하나라도 어긋나면 **멈춘다** — ①·② 가 0 이면 그 과제(Task 5·7)가 덜 끝났거나 main 이 앵커를 바꾼 것이니 그 자리를 열어 보고 앵커를 새로 정한 뒤 진행한다. ④ 가 실패하면 Task 2(`isEligEvent`)·Task 3(`fillDecision` 보강)을 CONTRACT 5 대로 먼저 고친다(여기서 맞추지 않는다).

- [ ] **Step 2: 실패하는 순수 시험 — `tests/events-upload.test.mjs` 를 새로 만든다**

```js
// 성경필사(암송) 명단 올리기 판정·교인명부 찾기 모양 — 순수 함수 시험(preflight 가 돈다 · 계획 Task 8)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  rawOf, tidyUpload, fillNames, applyFill, uploadKeys, judgeUpload,
  uploadCounts, uploadOut, uploadRecords, filledNames, tooManyRows, uploadEventError,
  lookupName, lookupOut, UPLOAD_TAG, FILL_TAG, LOOKUP_MAX,
} from "../supabase/functions/church-admin/events-upload.ts";
import { sameKeys } from "../supabase/functions/church-admin/events-rows.ts";

// 시험 이름은 모두 지어낸 글자다(진짜 명단은 저장소에 넣지 않는다)
const R = (name, gu = "", mok = "", pos = "") => ({ name, gu, mok, pos });
const P = (o) => ({ name_key: "", kind2: "장년", mok1: "", mok3: "", school_dept: "", position: "", position_detail: "", ...o });
const NO_IDX = { eventKeys: new Set(), eventUids: new Set(), users: new Map() };

test("tooManyRows · uploadEventError — 600줄까지 · 없는 회차 not-found · 자격 회차 eligibility-event", () => {
  assert.equal(tooManyRows(Array.from({ length: 600 }, () => ({}))), false);
  assert.equal(tooManyRows(Array.from({ length: 601 }, () => ({}))), true);
  assert.equal(uploadEventError(null), "not-found");
  assert.equal(uploadEventError({ id: "x", needs: { position: true, eligibility: { start: "2026-10-11", weeks: 6 } } }), "eligibility-event");
  assert.equal(uploadEventError({ id: "x", needs: { position: true } }), null);
  assert.equal(uploadEventError({ id: "x", needs: {} }), null);
});

test("rawOf — 칸 네 개만, 글자로(엑셀 숫자 칸도) · 객체가 아니면 빈칸", () => {
  assert.deepEqual(rawOf({ name: "홍길동", gu: "화평", mok: 7, pos: "집사", extra: "x" }), { name: "홍길동", gu: "화평", mok: "7", pos: "집사" });
  assert.deepEqual(rawOf(null), { name: "", gu: "", mok: "", pos: "" });
  assert.deepEqual(rawOf(["홍길동"]), { name: "", gu: "", mok: "", pos: "" });
  assert.equal(rawOf({ name: "가".repeat(500) }).name.length, 200);
});

test("tidyUpload — 다듬기 · 소속이 빈 줄(no-group)은 blank · 모양 틀림은 bad", () => {
  const it = tidyUpload([
    R("홍길동2", "화평교구", "07", "집사님"),   // 0 다듬어 넣음
    R("홍길동"),                                 // 1 소속 없음 — 교구 칸이 비어 구분도 모른다
    R("홍,길동", "화평", "1"),                   // 2 bad-char
    R("", "", "", ""),                           // 3 빈 줄 — no-name
    R("홍길동", "교회학교", "", ""),             // 4 부서 없음 — 빈칸(구분은 교회학교)
    null,                                        // 5 객체가 아님 — no-name
    R("홍길동", "없는교구", "1"),                // 6 bad-group
  ]);
  assert.deepEqual(it.map((x) => x.mark), ["add", "blank", "bad", "bad", "blank", "bad", "bad"]);
  assert.deepEqual(it[0].row, { who_type: "교구", group_name: "화평", sub_name: "7", name: "홍길동", position: "집사" });
  assert.ok(it[0].notes.length >= 1, "이름 끝 숫자를 뗐다는 알림");
  assert.equal(it[0].uid, null);
  assert.equal(it[0].filled, false);
  assert.deepEqual(it[1].row, { who_type: "", group_name: "", sub_name: "", name: "홍길동", position: "" });
  assert.equal(it[1].error, null);
  assert.ok(it[1].notes.some((n) => n.includes("비어 있어요")));
  assert.deepEqual(it[4].row, { who_type: "교회학교", group_name: "", sub_name: "", name: "홍길동", position: "" });
  assert.deepEqual([it[2].error, it[3].error, it[5].error, it[6].error], ["bad-char", "no-name", "no-name", "bad-group"]);
  assert.equal(it[3].row, null);
  assert.deepEqual(it.map((x) => x.i), [0, 1, 2, 3, 4, 5, 6]);
});

test("fillNames — 빈칸이 있는 줄의 이름만 묻는다(교회학교 학년 빈칸은 묻지 않는다)", () => {
  const it = tidyUpload([R("가 나"), R("다라", "화평", "", "집사"), R("카타", "화평", "3", "집사"), R("파하", "교회학교", "유년부", "학생"), R("x,y", "", "", "")]);
  assert.deepEqual(fillNames(it).sort(), ["가나", "다라"].sort());
});

test("applyFill — 한 분이면 빈칸만 · 소속이 다르면 아무것도 안 채운다 · 교구 칸을 채우면 목장도 명부 값 · 동명이인", () => {
  const it = tidyUpload([
    R("가나"),                    // 0 소속 없음 · 명부 한 분(소망 12 권사) → 채움
    R("다라", "화평", "", "집사"), // 1 목장만 빔 · 명부도 화평 → 목장만(직분 집사는 그대로)
    R("마바"),                    // 2 소속 없음 · 명부에 두 분 → 교인명부 동명이인
    R("사아"),                    // 3 소속 없음 · 명부에 없음 → 빈칸
    R("자차", "화평", "", ""),     // 4 명단은 화평 · 명부는 소망 → 아무것도 안 채움(넣음 그대로)
    R("마바", "믿음", "1", ""),    // 5 소속이 적혀 있고 직분만 빔 · 동명이인 → 넣음(직분은 빈 채로)
    R("아자", "", "21", ""),       // 6 교구 칸 빔 · 목장 21 → 명부(화평 20)로 교구를 채우면 목장도 20
  ]);
  const cands = new Map([
    ["가나", [P({ name_key: "가나", mok1: "소망", mok3: "소망-12목장", position: "권사" })]],
    ["다라", [P({ name_key: "다라", mok1: "화평", mok3: "화평-5목장", position: "권사" })]],
    ["마바", [P({ name_key: "마바", mok1: "믿음", mok3: "믿음-1목장" }), P({ name_key: "마바", mok1: "사랑", mok3: "사랑-2목장" })]],
    ["자차", [P({ name_key: "자차", mok1: "소망", mok3: "소망-3목장", position: "집사" })]],
    ["아자", [P({ name_key: "아자", mok1: "화평", mok3: "화평-20목장", position: "권사" })]],
  ]);
  applyFill(it, cands);
  assert.deepEqual(it.map((x) => x.mark), ["fill", "fill", "same-name", "blank", "add", "add", "fill"]);
  assert.equal(it[0].filled, true);
  assert.deepEqual(it[0].row, { who_type: "교구", group_name: "소망", sub_name: "12", name: "가나", position: "권사" });
  assert.deepEqual(it[1].row, { who_type: "교구", group_name: "화평", sub_name: "5", name: "다라", position: "집사" });
  assert.equal(it[2].filled, false);
  assert.ok(it[3].notes.some((n) => n.includes("교인명부에 없는")));
  // 명단은 화평, 명부는 소망 — 소망의 목장 번호(3)도 직분(집사)도 화평 줄에 들어가면 안 된다
  assert.deepEqual(it[4].row, { who_type: "교구", group_name: "화평", sub_name: "", name: "자차", position: "" });
  assert.equal(it[4].filled, false);
  assert.ok(it[4].notes.some((n) => n.includes("소속이 달라")));
  // 소속이 적힌 줄의 동명이인은 same-name 이 아니라 넣음 — 직분은 빈 채로
  assert.deepEqual(it[5].row, { who_type: "교구", group_name: "믿음", sub_name: "1", name: "마바", position: "" });
  assert.ok(it[5].notes.some((n) => n.includes("같은 이름이 여러 분")));
  // 교구 칸을 명부로 채웠다 — 적혀 있던 목장 21 은 버리고 명부 목장 20
  assert.deepEqual(it[6].row, { who_type: "교구", group_name: "화평", sub_name: "20", name: "아자", position: "권사" });
  assert.ok(it[6].notes.some((n) => n.includes("적힌 목장 21 대신 교인명부 목장")));
  assert.deepEqual(filledNames(it).sort(), ["가나", "다라", "아자"].sort());
  // 알림에 명부의 원래 칸 값이 새지 않는다
  const text = JSON.stringify(it);
  for (const k of ["소망-12목장", "소망-3목장", "화평-20목장", "화평-5목장"]) assert.ok(!text.includes(k), "새어 나감: " + k);
});

test("applyFill — 명부가 한 번도 안 올라왔으면(null) 채우지 않고 알린다", () => {
  const it = applyFill(tidyUpload([R("가나")]), null);
  assert.equal(it[0].mark, "blank");
  assert.ok(it[0].notes.some((n) => n.includes("교인명부가 아직")));
});

test("uploadKeys — 넣을 줄만 · 한 분 더하기와 같은 후보 키(sameKeys · 「07」 꼴 포함)", () => {
  const it = tidyUpload([R("홍길동", "화평", "7"), R("가나"), R("x,y", "화평", "1")]);
  const ks = uploadKeys(it);
  assert.deepEqual([...ks].sort(), [...sameKeys(it[0].row)].sort(), "blank·bad 줄의 키는 묻지 않는다");
  assert.ok(ks.includes("교구|화평|7|||홍길동"));
  assert.ok(ks.includes("교구|화평|07|||홍길동"), "앱 로그인이 받은 「07」 계정도 찾게");
});

test("judgeUpload — 이 회차에 이미(키·계정) · 파일 안 접기(먼저 나온 줄이 남는다) · 계정은 하나일 때만 잇는다", () => {
  const it = tidyUpload([
    R("홍길동", "화평", "07", "집사"),  // 0 넣음 — 「07」로 등록된 앱 계정 U1 과 잇는다
    R("홍길동2", "화평교구", "7목장"),  // 1 위 1번 줄과 같은 분
    R("나다", "소망", "3"),            // 2 이 회차에 계정 U2 의 줄(옛 소속으로 낸 앱 줄)이 있다
    R("라마", "사랑", "4"),            // 3 이 회차에 같은 신원 키 줄이 있다(계정 없는 이관 줄)
    R("바사", "믿음", "5", "명예권사"), // 4 넣음 — 계정이 둘이라 잇지 않는다 · 목록 밖 직분
  ]);
  judgeUpload(it, {
    eventKeys: new Set(["교구|사랑|4|||라마"]),
    eventUids: new Set(["U2"]),
    users: new Map([
      ["교구|화평|07|||홍길동", ["U1"]],
      ["교구|소망|3|||나다", ["U2"]],
      ["교구|믿음|5|||바사", ["U3", "U4"]],
    ]),
  });
  assert.deepEqual(it.map((x) => x.mark), ["add", "same", "same", "same", "add"]);
  assert.equal(it[0].uid, "U1");
  assert.ok(it[1].notes.some((n) => n.includes("위 1번 줄")));
  assert.ok(it[2].notes.some((n) => n.includes("이미 있어요")));
  assert.ok(it[3].notes.some((n) => n.includes("이미 있어요")));
  assert.equal(it[4].uid, null);
  assert.ok(it[4].notes.some((n) => n.includes("2개")));
  assert.ok(it[4].notes.some((n) => n.includes("명예권사")));
});

test("judgeUpload — 채운 줄(fill)도 이미 있으면 same · 계정 하나로 파일 안에서 겹치면 접는다", () => {
  const it = tidyUpload([R("가나"), R("아자", "기쁨", "1"), R("아자", "기쁨", "2")]);
  applyFill(it, new Map([["가나", [P({ name_key: "가나", mok1: "소망", mok3: "소망-12목장" })]]]));
  judgeUpload(it, {
    eventKeys: new Set(["교구|소망|12|||가나"]), eventUids: new Set(),
    users: new Map([["교구|기쁨|1|||아자", ["U9"]], ["교구|기쁨|2|||아자", ["U9"]]]),   // 소속을 고친 분(별칭) — 같은 계정
  });
  assert.deepEqual(it.map((x) => x.mark), ["same", "add", "same"]);
  assert.equal(it[0].filled, true, "채운 값은 화면에 나갔다 — people.fill 기록 대상");
  assert.ok(it[2].notes.some((n) => n.includes("위 2번 줄")));
});

test("uploadCounts · uploadOut(칸 지도) · uploadRecords(메모 표기·칸이 모두 같다)", () => {
  const it = tidyUpload([
    R("홍길동", "화평", "3", "명예권사"), // 0 add · 목록 밖 직분
    R("홍길동", "화평", "3"),             // 1 same(파일 안)
    R("가나"),                            // 2 fill
    R("카타"),                            // 3 blank(명부에 없음)
    R("x,y", "화평", "1"),                // 4 bad
  ]);
  applyFill(it, new Map([["가나", [P({ name_key: "가나", mok1: "소망", mok3: "소망-12목장", position: "권사" })]]]));
  judgeUpload(it, { ...NO_IDX, users: new Map([["교구|화평|3|||홍길동", ["U1"]]]) });
  assert.deepEqual(uploadCounts(it), { add: 1, same: 1, blank: 1, bad: 1, fill: 1, sameName: 0, oddPosition: 1 });

  const out = uploadOut(it);
  for (const o of out) assert.deepEqual(Object.keys(o).sort(), ["error", "i", "mark", "notes", "row"]);
  assert.deepEqual(out[0].row, { who_type: "교구", group: "화평", sub: "3", name: "홍길동", position: "명예권사" });
  assert.deepEqual(out[4].row, { who_type: "교구", group: "화평", sub: "1", name: "x,y", position: "" });   // 모양 틀린 줄도 다듬은 값을 보인다
  assert.equal(out[4].error, "bad-char");
  assert.ok(!JSON.stringify(out).includes("U1"), "계정 id 는 화면에 싣지 않는다");

  const recs = uploadRecords(it, "ev-1", "2026-09-29T00:00:00.000Z");
  assert.deepEqual(recs.map((x) => x.i), [0, 2]);
  assert.deepEqual(recs[0].rec, {
    event_id: "ev-1", user_id: "U1", ident_key: "교구|화평|3|||홍길동", who_type: "교구", group_name: "화평", sub_name: "3",
    name: "홍길동", position: "명예권사", note: UPLOAD_TAG, source: "import", updated_at: "2026-09-29T00:00:00.000Z",
  });
  assert.equal(UPLOAD_TAG, "명단 올리기");
  assert.equal(FILL_TAG, "소속: 교인명부로 채움");
  assert.equal(recs[1].rec.note, "명단 올리기 / 소속: 교인명부로 채움");
  assert.equal(recs[1].rec.user_id, null);
  assert.equal(new Set(recs.map((x) => Object.keys(x.rec).sort().join(","))).size, 1, "묶음 insert 는 칸이 같아야 한다(PGRST102)");
});

test("lookupName — 다듬기 · 이름 키(띄어쓰기 없음·완성형) · 판정표 코드(no-name·bad-char·too-long)", () => {
  assert.deepEqual(lookupName("  홍  길동 "), { name: "홍 길동", key: "홍길동", error: null });
  assert.equal(lookupName("홍길동".normalize("NFD")).key, "홍길동");
  assert.equal(lookupName("").error, "no-name");
  assert.equal(lookupName(null).error, "no-name");
  assert.equal(lookupName("홍,길동").error, "bad-char");
  assert.equal(lookupName("홍|길동").error, "bad-char");
  assert.equal(lookupName("홍,길동").key, "", "틀린 이름은 명부에 묻지 않는다");
  assert.equal(lookupName("가".repeat(41)).error, "too-long");
  assert.equal(lookupName("가".repeat(40)).error, null);
  assert.equal(LOOKUP_MAX, 20);
});

test("lookupOut — 교인명부 한 분 → 다섯 칸(이름·구분·소속·세부·직분)만 · 화면 이름 group·sub", () => {
  const o = lookupOut({ ...P({ name_key: "홍길동", mok1: "화평", mok3: "화평-20목장", position: "권사", position_detail: "은퇴협동권사" }), name: " 홍길동 " });
  assert.deepEqual(o, { name: "홍길동", who_type: "교구", group: "화평", sub: "20", position: "은퇴권사" });
  assert.deepEqual(Object.keys(o).sort(), ["group", "name", "position", "sub", "who_type"]);
  // 아이는 가족의 교구·목장이 아니라 부서로 — 가족 교구 값이 따라 나가지 않는다
  const kid = lookupOut({ ...P({ name_key: "홍길동", kind2: "교회학교", mok1: "화평", mok3: "화평-20목장", school_dept: "중등부" }), name: "홍길동" });
  assert.deepEqual(kid, { name: "홍길동", who_type: "교회학교", group: "중등부", sub: "", position: "" });
  assert.ok(!JSON.stringify(kid).includes("화평"));
});
```

- [ ] **Step 3: 돌려서 실패를 본다**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
node --experimental-strip-types --test tests/events-upload.test.mjs
```
Expected: FAIL — `Cannot find module '…/supabase/functions/church-admin/events-upload.ts'` (`# fail 1`).

- [ ] **Step 4: `supabase/functions/church-admin/events-upload.ts` 를 만든다**

```ts
// 성경필사(암송) — 명단 올리기 판정 · 교인명부 찾기 모양(순수 함수 · 2026-09-29 · 계획 Task 8)
//   설계: bible-memorize-church-app-v2 docs/superpowers/specs/2026-09-29-church-admin-bible-events-design.md
//         §1 「같은 분 판정」·「메모에 남기는 표기」 · §2 evUploadCheck/evUploadSave/evPeopleLookup · §3 「📤 명단 올리기」
//   서버(Deno, index.ts)와 시험(Node, tests/events-upload.test.mjs)이 **같은 파일**을 읽는다 —
//   authz.ts 와 같은 제약(원격 import·enum·namespace 금지, node --experimental-strip-types 가 그대로 읽는다).
//
//   흐름: tooManyRows → [서버: 회차] → uploadEventError → tidyUpload(다듬기·모양) → [서버: 교인명부 후보] → applyFill(빈칸 채우기)
//        → [서버: 이 회차 명단·앱 계정] → judgeUpload(이미 있음·파일 안 접기·계정 잇기)
//        → uploadCounts · uploadOut(화면) · uploadRecords(넣기) · filledNames(people.fill)
//   ⚠️ 살펴보기(evUploadCheck)와 넣기(evUploadSave)가 이 흐름을 **처음부터 똑같이** 돈다 — 화면이 보낸 판정을 믿지 않는다.
//   ⚠️ 같은 분 후보 키는 한 분 더하기·고치기와 **같은 함수**(events-rows.ts sameKeys — 「07」 꼴 포함)를 쓴다.
//   ⚠️ 계정은 찾기만 한다(만들지 않는다). uid 는 서버 안에서만 쓰고 uploadOut 에 싣지 않는다.
//   ⚠️ 「넣음」은 add·fill 둘뿐이다. same-name 은 소속을 못 정한 줄(빈칸)에만 붙는다 — 소속이 적힌 줄은 채우지 못해도 그대로 넣는다.
//   ⚠️ 채울지·무엇을 채울지는 fillDecision(Task 3 · CONTRACT 5 보강판) 하나가 정한다 — 여기서는 얹고 알리기만 한다.
//   ⚠️ index.ts 는 이 과제의 이름을 **이 모듈에서만** 가져온다(CONTRACT 5 — 다른 과제의 import 와 이름이 겹치지 않게).
//      그래서 찾기의 이름 다듬기(lookupName)·다섯 칸(lookupOut)·올리기 막기(tooManyRows·uploadEventError)도 여기 있다.
import { BE_BAD_CHARS, BE_FIELD_MAX, BE_MAX_UPLOAD, checkRow, identKey, isEligEvent, tidyRaw, type EvRow, type RawCells } from "./events-rules.ts";
import { fillDecision, lookupView, type ChurchPerson } from "./events-people.ts";
import { oddPosition, sameKeys, tagNote } from "./events-rows.ts";
import { legacyNorm } from "./paper.ts";
import { nameKey } from "./people-match.ts";

export type UploadMark = "add" | "same" | "blank" | "bad" | "fill" | "same-name";
// 판정 중인 줄 — 소속이 빈 줄은 who_type 이 "" 라 EvRow 보다 느슨하다
export type UpRow = { who_type: string; group_name: string; sub_name: string; name: string; position: string };
export type UploadItem = {
  i: number;              // 보낸 rows 의 차례(0부터) — 화면은 i+1 번 줄로 보인다
  mark: UploadMark;
  row: UpRow | null;
  error: string | null;   // 모양 틀림 코드(checkRow 의 코드)
  notes: string[];        // 한국어 한 줄들 — 화면이 그대로 보인다(교인명부의 원래 칸 값은 싣지 않는다)
  filled: boolean;        // 교인명부 값이 들어갔나(people.fill 기록 대상)
  uid: string | null;     // 이을 앱 계정 — 찾은 계정이 하나일 때만
};
export type UploadCounts = { add: number; same: number; blank: number; bad: number; fill: number; sameName: number; oddPosition: number };
export type UploadOut = {
  i: number; mark: UploadMark;
  row: { who_type: string; group: string; sub: string; name: string; position: string } | null;
  error: string | null; notes: string[];
};
export type JudgeIdx = { eventKeys: Set<string>; eventUids: Set<string>; users: Map<string, string[]> };

// 메모(note) 머리 표기 — 설계 §1 「메모에 남기는 표기」 그대로. 겹치면 tagNote 가 " / " 로 잇는다.
// 올리기의 메모는 이 표기뿐이라 500자(BE_NOTE_MAX)에 닿지 않는다.
export const UPLOAD_TAG = "명단 올리기";
export const FILL_TAG = "소속: 교인명부로 채움";
// 교인명부 찾기 상한(설계 §2 evPeopleLookup)
export const LOOKUP_MAX = 20;

const BLANK_NOTE = "소속(교구·부서)이 비어 있어요";
const NO_DIRECTORY_NOTE = "교인명부가 아직 올라오지 않아 빈칸을 채우지 못했어요";
const FILLED_NOTE = "빈칸을 교인명부로 채웠어요";
const BAD_FILL_NOTE = "교인명부 값이 명단 모양에 맞지 않아 채우지 않았어요";
const ALREADY_NOTE = "이 회차 명단에 이미 있어요";
const LINK_NOTE = "앱 계정과 이어요";
// fillDecision 의 까닭 → 화면 알림. nothing-blank(채울 것이 없다)는 알리지 않는다.
const FILL_NOTE: Record<string, string> = {
  "not-in-directory": "교인명부에 없는 이름이라 빈칸을 채우지 못했어요",
  "same-name": "교인명부에 같은 이름이 여러 분이라 빈칸을 채우지 않았어요",
  "no-affiliation": "교인명부에 소속이 적혀 있지 않아 채우지 못했어요",
  "kid-adult": "명단과 교인명부의 구분(아이·어른)이 달라 다른 분으로 보고 채우지 않았어요",
  "youth-parish": "명단은 청년부인데 교인명부는 교구라 채우지 않았어요(청년부를 둡니다)",
  "different-affiliation": "명단의 소속과 교인명부의 소속이 달라 다른 분일 수 있어 채우지 않았어요",
};

const live = (it: UploadItem): boolean => it.mark === "add" || it.mark === "fill";

// ⓪ 올리기 막기 — 줄 수는 회차를 읽기 **전에**(상한 600줄 · 회차당 최대가 515줄), 회차는 읽은 뒤에.
export const tooManyRows = (raws: unknown[]): boolean => raws.length > BE_MAX_UPLOAD;
// 없는(모양이 틀린) 회차 → not-found · 자격 회차 → eligibility-event(가을 설계 §12 「대리 등록은 보정 창구로만」).
// ⚠️ 자격 회차 판정은 events-rules.ts isEligEvent(needs) 하나(CONTRACT 5) — 여기서 따로 판정하지 않는다.
export function uploadEventError(ev: { needs?: unknown } | null): "not-found" | "eligibility-event" | null {
  if (!ev) return "not-found";
  return isEligEvent(ev.needs) ? "eligibility-event" : null;
}

// 화면이 보낸 한 줄 → 네 칸 글자. 엑셀 숫자 칸(목장 7)도 글자로. 터무니없이 긴 칸은 200자에서 자른다(판정은 40자에서 too-long).
const cell = (v: unknown): string => (typeof v === "string" || typeof v === "number" ? String(v) : "").slice(0, 200);
export function rawOf(x: unknown): RawCells {
  const o = (x && typeof x === "object" && !Array.isArray(x) ? x : {}) as Record<string, unknown>;
  return { name: cell(o.name), gu: cell(o.gu), mok: cell(o.mok), pos: cell(o.pos) };
}

// ① 다듬기·모양 — 줄마다 tidyRaw(설계 §3 다듬기 → §1 판정표).
//   판정표의 no-group(소속이 비었다)은 「모양 틀림」이 아니라 「빈칸(소속 없음)」이다 — 채우기를 켜면 applyFill 이 채워 본다.
//   교구 칸이 비었으면 구분도 모른다 — tidyRaw 가 둔 「교구」는 기본값일 뿐이라 비워 둔다
//   (그대로 두면 fillDecision 이 교회학교 소속을 교구 줄에 얹으려다 막힌다).
export function tidyUpload(raws: unknown[]): UploadItem[] {
  return raws.map((x, i): UploadItem => {
    const raw = rawOf(x);
    const base = { i, filled: false, uid: null };
    const t = tidyRaw(raw);
    if (t.error === "no-group" && t.row) {
      return { ...base, mark: "blank", error: null, notes: [...t.notes, BLANK_NOTE],
        row: { ...t.row, who_type: legacyNorm(raw.gu) ? t.row.who_type : "" } };
    }
    if (t.error || !t.row) {
      return { ...base, mark: "bad", row: t.row ? { ...t.row } : null, error: t.error ?? "no-name", notes: [...t.notes] };
    }
    return { ...base, mark: "add", row: { ...t.row }, error: null, notes: [...t.notes] };
  });
}

// 채울 빈칸이 있나 — 교회학교 줄의 학년은 원래 비어 있어 묻지 않는다(아이 교적을 쓸데없이 읽지 않게)
const needsFill = (r: UpRow): boolean =>
  !r.who_type || !r.group_name || !r.position || (r.who_type === "교구" && !r.sub_name);

// 명부에 물어볼 이름 키 — 빈칸이 있는 줄만(빈칸이 없는 줄의 교적은 읽지 않는다)
export function fillNames(items: UploadItem[]): string[] {
  const out = new Set<string>();
  for (const it of items) {
    if ((it.mark !== "add" && it.mark !== "blank") || !it.row || !needsFill(it.row)) continue;
    const k = nameKey(it.row.name);
    if (k) out.add(k);
  }
  return [...out];
}

const FILL_KEYS = ["who_type", "group_name", "sub_name", "position"] as const;
const own = (o: Record<string, unknown>, k: string): boolean =>
  Object.prototype.hasOwnProperty.call(o, k) && typeof o[k] === "string";

// ② 빈칸 채우기 — cands: name_key → 교인명부 후보. 명부가 한 번도 안 올라왔으면 null.
//   채울지·무엇을은 fillDecision(Task 3 · CONTRACT 5 보강판)이 정한다:
//     한 분일 때만 · 빈 칸만 · 아이↔어른 / 청년부↔교구 는 채우지 않음 · 소속이 적혀 있는데 명부와 다르면 아무것도(different-affiliation).
//   여기서 하는 일은 셋 — 결과를 줄에 얹기 · 교구 칸이 빈 줄이면 목장도 명부 값(적혀 있던 목장은 버리고 알림) · 알림 적기.
export function applyFill(items: UploadItem[], cands: Map<string, ChurchPerson[]> | null): UploadItem[] {
  for (const it of items) {
    if ((it.mark !== "add" && it.mark !== "blank") || !it.row || !needsFill(it.row)) continue;
    if (!cands) { it.notes.push(NO_DIRECTORY_NOTE); continue; }
    const row = it.row;
    const d = fillDecision(row, cands.get(nameKey(row.name)) ?? []);
    if (d.reason !== "filled" || !d.patch) {
      // 동명이인 — 소속을 못 정한 줄만 「교인명부 동명이인」. 소속이 적힌 줄은 add 그대로(빈 직분은 빈 채로 넣는다).
      if (it.mark === "blank" && d.reason === "same-name") it.mark = "same-name";
      if (FILL_NOTE[d.reason]) it.notes.push(FILL_NOTE[d.reason]);
      continue;
    }
    const p = d.patch as Record<string, unknown>;
    const next: UpRow = { ...row };
    const extra: string[] = [];
    if (!row.group_name && own(p, "group_name")) {
      // 소속을 교인명부로 정했다 — 구분·목장도 교인명부 값. 적혀 있던 목장은 다른 교구의 번호일 수 있어 버리고 알린다(CONTRACT 5).
      if (own(p, "who_type")) next.who_type = p.who_type as string;
      next.group_name = p.group_name as string;
      next.sub_name = own(p, "sub_name") ? (p.sub_name as string) : "";
      if (row.sub_name && row.sub_name !== next.sub_name) {
        extra.push(next.sub_name
          ? `적힌 목장 ${row.sub_name} 대신 교인명부 목장을 넣었어요`
          : `적힌 목장 ${row.sub_name} 대신 교인명부처럼 목장을 비웠어요`);
      }
    } else if (!row.sub_name && own(p, "sub_name")) {
      next.sub_name = p.sub_name as string;          // 같은 소속일 때만 온다(다르면 fillDecision 이 different-affiliation)
    }
    if (!row.position && own(p, "position")) next.position = p.position as string;
    // 이름은 무엇이 와도 바꾸지 않는다(patch 에 name 이 있어도 보지 않는다)
    if (FILL_KEYS.every((k) => next[k] === row[k])) continue;
    if (checkRow(next as EvRow)) { it.notes.push(BAD_FILL_NOTE); continue; }
    it.row = next;
    it.mark = "fill";
    it.filled = true;
    it.notes.push(FILLED_NOTE, ...extra);
  }
  return items;
}

// 넣을 줄(add·fill)의 후보 키 전부 — 한 분 더하기와 같은 sameKeys(「07」 꼴 포함). 넣을 줄이 없으면 계정을 읽지 않는다.
export function uploadKeys(items: UploadItem[]): string[] {
  const out = new Set<string>();
  for (const it of items) if (live(it)) for (const k of sameKeys(it.row as EvRow)) out.add(k);
  return [...out];
}

// ③ 같은 분 판정 2~4 — 이 회차에 이미(키·계정) · 이 파일 안(먼저 나온 줄이 남는다) · 계정은 하나일 때만 잇는다
//   idx.users 는 신원 키 → 계정 id 들(users.identity_key + user_identity_aliases). 후보 키로만 찾아본다.
export function judgeUpload(items: UploadItem[], idx: JudgeIdx): UploadItem[] {
  const seenKey = new Map<string, number>();
  const seenUid = new Map<string, number>();
  for (const it of items) {
    if (!live(it)) continue;
    const keys = sameKeys(it.row as EvRow);
    const uids = [...new Set(keys.flatMap((k) => idx.users.get(k) ?? []))];
    // 이 회차에 이미 — 신원 키가 후보에 들거나, 찾은 계정의 줄이 있으면(앱에서 낸 줄 포함).
    // ⚠️ user_id 가 없는 줄은 DB unique 가 막지 않는다(NULLS DISTINCT) — 이 판정이 유일한 막이다.
    if (keys.some((k) => idx.eventKeys.has(k)) || uids.some((u) => idx.eventUids.has(u))) {
      it.mark = "same";
      it.notes.push(ALREADY_NOTE);
      continue;
    }
    const hits = [...keys.map((k) => seenKey.get(k)), ...uids.map((u) => seenUid.get(u))]
      .filter((j): j is number => j !== undefined);
    if (hits.length) {
      it.mark = "same";
      it.notes.push(`위 ${Math.min(...hits) + 1}번 줄과 같은 분이에요`);
      continue;
    }
    for (const k of keys) seenKey.set(k, it.i);
    for (const u of uids) seenUid.set(u, it.i);
    if (uids.length === 1) { it.uid = uids[0]; it.notes.push(LINK_NOTE); }
    else if (uids.length > 1) it.notes.push(`같은 이름·소속의 앱 계정이 ${uids.length}개라 잇지 않아요`);
    const p = it.row!.position;
    if (oddPosition(p)) it.notes.push(`직분 「${p}」 — 앱 직분 목록에 없어요(적은 그대로 넣어요)`);
  }
  return items;
}

export function uploadCounts(items: UploadItem[]): UploadCounts {
  const c: UploadCounts = { add: 0, same: 0, blank: 0, bad: 0, fill: 0, sameName: 0, oddPosition: 0 };
  for (const it of items) {
    if (it.mark === "same-name") c.sameName++;
    else c[it.mark]++;
    if (live(it) && it.row && oddPosition(it.row.position)) c.oddPosition++;
  }
  return c;
}

// 화면에 주는 모양 — 칸 지도로만 만든다(uid·filled 는 싣지 않는다)
export function uploadOut(items: UploadItem[]): UploadOut[] {
  return items.map((it) => ({
    i: it.i,
    mark: it.mark,
    row: it.row
      ? { who_type: it.row.who_type, group: it.row.group_name, sub: it.row.sub_name, name: it.row.name, position: it.row.position }
      : null,
    error: it.error,
    notes: [...it.notes],
  }));
}

// 넣을 줄 — 모든 줄의 칸이 같다(PostgREST 묶음 insert 는 칸이 다르면 PGRST102). phone·memo·answers 는 넣지 않는다(기본값).
export function uploadRecords(items: UploadItem[], eventId: string, now: string): { i: number; rec: Record<string, unknown> }[] {
  return items.filter(live).map((it) => {
    const r = it.row as EvRow;
    return {
      i: it.i,
      rec: {
        event_id: eventId, user_id: it.uid, ident_key: identKey(r),
        who_type: r.who_type, group_name: r.group_name, sub_name: r.sub_name, name: r.name, position: r.position,
        note: it.mark === "fill" ? tagNote(UPLOAD_TAG, FILL_TAG) : UPLOAD_TAG,
        source: "import", updated_at: now,
      },
    };
  });
}

// people.fill 기록에 남길 이름 — 교인명부 값이 들어간 줄(이미 있음으로 끝난 줄도 채운 값은 화면에 나간다)
export const filledNames = (items: UploadItem[]): string[] =>
  items.filter((it) => it.filled && it.row).map((it) => it.row!.name);

// ④ 교인명부 찾기 — 이름 다듬기·판정표(no-name → bad-char → too-long, checkRow 와 같은 차례)·이름 키(완성형·띄어쓰기 없음).
//   틀린 이름이면 key 는 "" — 명부에 묻지 않는다.
export function lookupName(v: unknown): { name: string; key: string; error: string | null } {
  const name = legacyNorm(v);
  const error = !name ? "no-name" : BE_BAD_CHARS.test(name) ? "bad-char" : name.length > BE_FIELD_MAX ? "too-long" : null;
  return { name, key: error ? "" : nameKey(name), error };
}

// 명부 한 분 → 다섯 칸(이름·구분·소속·세부·직분). 화면 이름은 group·sub(CONTRACT 2).
// ⚠️ 스프레드(...p)를 쓰지 않는다 — name_key·kind2·mok1·mok3·position_detail 같은 원래 칸이 따라 나가지 않게.
export function lookupOut(p: ChurchPerson & { name?: unknown }): { name: string; who_type: string; group: string; sub: string; position: string } {
  const v = lookupView(p, legacyNorm(p.name));
  return { name: v.name, who_type: v.who_type, group: v.group_name, sub: v.sub_name, position: v.position };
}
```

- [ ] **Step 5: 다시 돌려서 통과를 본다**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
node --experimental-strip-types --test tests/events-upload.test.mjs
```
Expected: PASS — `# tests 12` · `# pass 12` · `# fail 0`.
`tidyUpload`·`applyFill`·`lookupOut` 시험이 실패하면 Task 2 `tidyRaw`/`checkRow` 나 Task 3 `fillDecision`/`lookupView` 가 설계(§1 판정표 · §2 옮겨 적기 규칙 · §3 다듬기)·CONTRACT 5 와 다른 것이다 — 여기 기대값을 맞추지 말고 그 과제를 고친다. 특히 `fillDecision` 은 ① 소속이 빈 줄의 `who_type: ""` 를 **빈칸**으로 보고 ② 소속이 적혀 있는데 명부와 다르면 `different-affiliation`(patch null) ③ 교구 칸이 빈 줄을 채울 때 `patch.sub_name` 에 **명부 목장**(적힌 목장이 있어도)을 담아야 한다.

- [ ] **Step 6: preflight · 커밋**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
python tools/preflight.py
git add supabase/functions/church-admin/events-upload.ts tests/events-upload.test.mjs
git commit -F - <<'EOF'
feat(성경필사): 명단 올리기 판정 순수 모듈 — 다듬기·빈칸 채우기(빈 칸만·소속 다르면 안 채움·교구를 채우면 목장도 명부 값)·이미 있음·파일 안 접기·계정은 하나일 때만 잇기·찾기 다섯 칸(events-upload.ts)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
git show --stat HEAD      # 두 파일만인지 본다
```
Expected: preflight 끝줄 `모두 통과`(`[2] 순수 함수 시험` 의 파일 수가 하나 늘었다) · 커밋 1개(두 파일).

- [ ] **Step 7: 실패하는 권한 시험 — `tests/authz.test.mjs`**

bibleevent 블록 — 앵커 `const acts = Object.keys(ACTION_ROLES).filter((k) => ACTION_ROLES[k] === "bibleevent");`(Step 1 에서 한 번만 나오는 것을 봤다) 아래에 있는 `assert.deepEqual(acts.sort(), [` 로 시작해 `]);` 로 끝나는 **문 하나**(Task 7 이 아홉 개·두 줄로 늘린 것 — 그 사이의 ⚠️ 주석 줄은 그대로 둔다)를 통째로 아래로 바꾼다:

```js
  assert.deepEqual(acts.sort(), ["evEventCreate", "evEventSave", "evEvents", "evHistory", "evPeopleLookup", "evRoster",
    "evRowAdd", "evRowDelete", "evRowSave", "evStats", "evUploadCheck", "evUploadSave"]);
```

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
grep -c '"evPeopleLookup", "evRoster",' tests/authz.test.mjs     # 1
grep -c '"evRowAdd", "evRowDelete", "evRowSave", "evStats"\]);' tests/authz.test.mjs   # 0 — Task 7 의 옛 끝줄이 남지 않았다
node --experimental-strip-types --test tests/authz.test.mjs
```
Expected: `1` · `0` · FAIL — bibleevent 블록에서 `Expected values to be strictly deep-equal`(`evPeopleLookup`·`evUploadCheck`·`evUploadSave` 가 없다) · `# fail 1`.

- [ ] **Step 8: `authz.ts` 의 `ACTION_ROLES` 에 세 줄**

앵커(한 번만 — Step 1 ①):

```ts
  evRowDelete: "bibleevent",
```
그 줄 **바로 뒤에**(닫는 `};` 앞):

```ts
  // 성경필사(암송) — 명단 올리기·교인명부 찾기(계획 Task 8). 살펴보기는 아무것도 안 바꾼다(채우기를 켜면 people.fill 기록),
  // 넣기는 「넣음」 줄만 더한다(앱 계정은 조회만). 찾기는 이름·구분·소속·세부·직분 다섯 칸만, 부를 때마다 people.lookup.
  evUploadCheck: "bibleevent",
  evUploadSave: "bibleevent",
  evPeopleLookup: "bibleevent",
```

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
grep -cE '^  (evUploadCheck|evUploadSave|evPeopleLookup): "bibleevent",' supabase/functions/church-admin/authz.ts   # 3
node --experimental-strip-types --test tests/authz.test.mjs tests/registry.test.mjs
```
Expected: `3` · PASS — `# fail 0`. (아직 커밋하지 않는다 — index.ts 의 case 와 함께 Step 15 에서. 이 셋만 들어간 채 배포되면 400 `unknown-action` 이 된다.)

- [ ] **Step 9: 실패하는 개발 서버 시험 — `tests/server.dev.test.mjs` 네 곳**

① 머리 상수 — 앵커 `let rxReady = null;`(Task 7 · 한 번만) 줄 **바로 뒤에**:

```js
// 성경필사 명단 올리기·교인명부 찾기 시험(계획 Task 8) — draft 회차 하나(2000-06) · 앱 계정 셋 · 그 회차의 앱 줄 하나 · 교인명부 25분.
//   회차는 Task 5 after() 의 「성경필사 시험 회차」 단계가 ca-test-*<STAMP>* 로 지운다(줄은 CASCADE). 계정·교인명부 줄은 아래 after() 줄이.
//   교인명부 시험 줄은 교인ID 990000011~ 고정(990000001~3 은 교인명부 시험 것). 이름은 모두 ca-test-up-<STAMP>-<한 글자> — 지어낸 글자다.
//   ⚠️ 이름 끝이 숫자면 올리기 다듬기가 떼어 버린다 — 시험 이름은 한글 한 글자로 끝낸다(upName).
const UP = { ev: "ca-test-up-" + STAMP, uid: {} };
const upName = (k) => `ca-test-up-${STAMP}-${k}`;
const UP_DIR_IDS = [990000011, 990000012, 990000013, 990000014, ...Array.from({ length: 21 }, (_, k) => 990000021 + k)];
const UP_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const UP_OUT_KEYS = ["error", "i", "mark", "notes", "row"];
const UP_ROW_KEYS = ["group", "name", "position", "sub", "who_type"];
let upReady = null;
```

② `PROBE` — 앵커 `  evRowDelete: { id: 0, expect: "" },`(Task 7 · 한 번만) 줄 **바로 뒤에**:

```js
  // 성경필사 명단 올리기·교인명부 찾기(Task 8) — 없는 회차 → not-found · 빈 이름 → no-name(둘 다 쓰지도 기록하지도 않는다)
  evUploadCheck: { event_id: "ca-test-probe-none", rows: [], fill: false },
  evUploadSave: { event_id: "ca-test-probe-none", rows: [], fill: false },
  evPeopleLookup: { name: "" },
```

③ `after()` — 앵커 `if (errs.length) throw new Error("정리 실패 "`(한 번만) 줄 **바로 앞에**(Task 5~7 의 정리 줄들 뒤):

```js
  // 성경필사 명단 올리기 시험(Task 8) — 교인명부 시험 줄 · 시험 계정 셋(올리기는 계정을 만들지 않는다).
  //   시험 회차는 Task 5 단계가 ca-test-*<STAMP>* 로 지운다(줄은 CASCADE).
  await step("올리기 시험 교인명부", () => rest(`church_people?person_id=in.(${UP_DIR_IDS.join(",")})`, "DELETE"));
  await step("올리기 시험 계정", async () => {
    await rest(`users?name=like.ca-test-up-${STAMP}-*`, "DELETE");
    assert.equal((await rest(`users?select=id&name=like.ca-test-up-${STAMP}-*`, "GET")).length, 0, "올리기 시험 계정이 남았다");
  });
```

④ 파일 **끝에** 붙인다(Task 7 의 시험들 뒤 — node:test 는 파일 차례로 돈다):

```js

// ---------- 성경필사(암송) — 명단 올리기 · 교인명부 찾기 (계획 Task 8) ----------
// 시험 자료는 첫 시험이 한 번 만든다(뒤 시험은 같은 약속을 기다린다).
function upFixtures() {
  upReady ??= (async () => {
    // 지난번이 도중에 멈춰 남긴 찌꺼기 — 고정 교인ID(PK 가 부딪혀 늘 지운다) · 시험 계정은 **한 시간 넘은 것만**
    //   (다른 세션이 개발에서 같은 시험을 돌리는 중이면 그쪽 계정을 지우지 않게 — Task 5 before() 와 같은 규칙).
    await rest(`church_people?person_id=in.(${UP_DIR_IDS.join(",")})`, "DELETE");
    const upStale = new Date(Date.now() - 3600 * 1000).toISOString();
    await rest(`users?name=like.ca-test-up-*&created_at=lt.${upStale}`, "DELETE");
    await rest("events", "POST", { id: UP.ev, title: "ca-test 명단 올리기 " + STAMP, opens_on: "2000-06-01", closes_on: "2000-06-30",
      status: "draft", kind: "signup", needs: { position: true, phone: false, memo: false, extra: [] } });
    // 앱 계정 셋 — 갑: 목장 「7」 · 을: 앱 로그인이 받은 「07」 그대로 · 병: 지금 소망 3(이 회차엔 옛 소속 소망 9 로 낸 앱 줄)
    for (const [k, gu, mok] of [["갑", "화평", "7"], ["을", "화평", "07"], ["병", "소망", "3"]]) {
      const [u] = await rest("users", "POST",
        { type: "교구", gu, mok, name: upName(k), identity_key: `교구|${gu}|${mok}|||${upName(k)}` });
      UP.uid[k] = u.id;
    }
    await rest("event_signups", "POST", { event_id: UP.ev, user_id: UP.uid["병"], ident_key: `교구|소망|9|||${upName("병")}`,
      who_type: "교구", group_name: "소망", sub_name: "9", name: upName("병"), position: "권사", source: "app" });
    // 교인명부 — 정(한 분 · 소망 12 권사) · 무(한 분 · 화평 5 권사) · 기(두 분 · 동명이인) · 다(21분 · 찾기 상한 20)
    // ⚠️ 배치 insert 는 객체들의 칸이 모두 같아야 한다(PGRST102) — dir() 한 모양으로만 만든다.
    const dir = (person_id, k, mok1, mok3, position) =>
      ({ person_id, name: upName(k), name_key: upName(k), kind2: "장년", mok1, mok3, position });
    await rest("church_people", "POST", [
      dir(990000011, "정", "소망", "소망-12목장", "권사"),
      dir(990000012, "무", "화평", "화평-5목장", "권사"),
      dir(990000013, "기", "믿음", "믿음-1목장", "집사"),
      dir(990000014, "기", "사랑", "사랑-2목장", "집사"),
      ...Array.from({ length: 21 }, (_, k) => dir(990000021 + k, "다", "은혜", "은혜-1목장", "")),
    ]);
  })();
  return upReady;
}

// 올릴 줄 열 — 차례가 곧 i(0부터)
const upRows = () => [
  { name: upName("갑") + "2", gu: "화평교구", mok: "07", pos: "집사님" }, // 0 넣음 — 끝 숫자·「교구」·07·「님」 다듬기, 계정 갑과 잇는다
  { name: upName("갑"), gu: "화평", mok: "7목장", pos: "집사" },          // 1 이미 — 파일 안(위 1번 줄)
  { name: upName("을"), gu: "화평", mok: "07", pos: "" },                 // 2 넣음 — 「07」 계정 을과 잇는다(명부엔 없어 직분은 빈칸)
  { name: upName("병"), gu: "소망", mok: "3", pos: "권사" },              // 3 이미 — 계정 병의 앱 줄(옛 소속 9 로 냈다)
  { name: upName("정"), gu: "", mok: "", pos: "" },                       // 4 채움 — 소망 12 권사
  { name: upName("무"), gu: "화평", mok: "", pos: "집사" },               // 5 채움 — 같은 교구라 목장 5 만, 직분 집사는 그대로
  { name: upName("기"), gu: "", mok: "", pos: "" },                       // 6 교인명부 동명이인(소속을 못 정했다)
  { name: upName("경"), gu: "", mok: "", pos: "" },                       // 7 빈칸 — 명부에 없음
  { name: 'ca-test-"x', gu: "화평", mok: "1", pos: "" },                  // 8 모양 틀림(bad-char)
  { name: upName("신"), gu: "화평", mok: "3", pos: "명예권사" },          // 9 넣음 — 목록 밖 직분(경고만)
];

test("성경필사 명단 올리기 살펴보기: 줄마다 판정 · 빈칸만 채운다 · 아무것도 안 넣는다 · 계정·교적 값이 새지 않는다 · people.fill", async () => {
  await upFixtures();
  const t = people.bibleevent.token;
  const chk = await call(t, "evUploadCheck", { event_id: UP.ev, rows: upRows(), fill: true });
  assert.equal(chk.body.ok, true, JSON.stringify(chk.body));
  assert.deepEqual(Object.keys(chk.body).sort(), ["counts", "ok", "rows", "total"]);
  assert.equal(chk.body.total, 1, "이 회차 지금 인원(앱 줄 하나)");
  assert.deepEqual(chk.body.rows.map((r) => r.i), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(chk.body.rows.map((r) => r.mark),
    ["add", "same", "add", "same", "fill", "fill", "same-name", "blank", "bad", "add"], JSON.stringify(chk.body.rows));
  assert.deepEqual(chk.body.counts, { add: 3, same: 2, blank: 1, bad: 1, fill: 2, sameName: 1, oddPosition: 1 });
  const at = (i) => chk.body.rows[i];
  assert.deepEqual(at(0).row, { who_type: "교구", group: "화평", sub: "7", name: upName("갑"), position: "집사" });
  assert.deepEqual(at(4).row, { who_type: "교구", group: "소망", sub: "12", name: upName("정"), position: "권사" });
  assert.deepEqual(at(5).row, { who_type: "교구", group: "화평", sub: "5", name: upName("무"), position: "집사" },
    "빈 칸(목장)만 채우고 적혀 있던 직분은 덮지 않는다");
  assert.equal(at(8).error, "bad-char");
  for (const r of chk.body.rows) {
    assert.deepEqual(Object.keys(r).sort(), UP_OUT_KEYS);
    if (r.row) assert.deepEqual(Object.keys(r.row).sort(), UP_ROW_KEYS);
  }
  const text = JSON.stringify(chk.body);
  assert.ok(!UP_UUID.test(text), "응답에 계정 id(UUID 꼴)가 실렸다");
  for (const k of ["user_id", "ident_key", "person_id", "소망-12목장", "화평-5목장"]) assert.ok(!text.includes(k), "새어 나감: " + k);
  // 살펴보기는 아무것도 넣지 않는다 — 앱 줄 하나 그대로
  assert.equal(await dbCount(UP.ev), 1);

  // 채우기를 끄면 — 소속이 빈 줄은 모두 빈칸, 목장만 빈 줄(5)은 그대로 넣음
  const off = await call(t, "evUploadCheck", { event_id: UP.ev, rows: upRows(), fill: false });
  assert.deepEqual(off.body.rows.map((r) => r.mark), ["add", "same", "add", "same", "blank", "add", "blank", "blank", "bad", "add"]);
  assert.equal(off.body.rows[5].row.sub, "");

  // people.fill — 채운 두 분의 이름이 「교인명부 기록」에 한 줄(채우기를 끈 살펴보기는 남기지 않는다)
  const fills = (await call(people.super.token, "auditList", { limit: 100, kind: "people" })).body.rows
    .filter((r) => r.action === "people.fill" && r.target === UP.ev);
  assert.equal(fills.length, 1, JSON.stringify(fills));
  assert.equal(fills[0].detail.rows, 2);
  assert.deepEqual([...fills[0].detail.names].sort(), [upName("무"), upName("정")].sort());
});

test("성경필사 명단 올리기 넣기: 넣을 줄만 · 계정은 찾기만 해서 잇는다 · 메모 표기 · 두 번째는 0건 · event.upload 는 건수만(납작하게)", async () => {
  await upFixtures();
  const t = people.bibleevent.token;
  const s1 = await call(t, "evUploadSave", { event_id: UP.ev, rows: upRows(), fill: true });
  assert.equal(s1.body.ok, true, JSON.stringify(s1.body));
  assert.deepEqual(Object.keys(s1.body).sort(), ["counts", "failed", "ok", "saved"]);
  assert.equal(s1.body.saved, 5, JSON.stringify(s1.body));
  assert.deepEqual(s1.body.failed, []);
  assert.ok(!UP_UUID.test(JSON.stringify(s1.body)));
  const got = await rest(`event_signups?select=name,user_id,ident_key,group_name,sub_name,position,note,source`
    + `&event_id=eq.${UP.ev}&source=eq.import&order=id`, "GET");
  const by = Object.fromEntries(got.map((r) => [r.name, r]));
  assert.deepEqual(Object.keys(by).sort(), [upName("갑"), upName("을"), upName("정"), upName("무"), upName("신")].sort());
  assert.equal(by[upName("갑")].user_id, UP.uid["갑"]);
  assert.equal(by[upName("갑")].ident_key, `교구|화평|7|||${upName("갑")}`);
  assert.equal(by[upName("갑")].note, "명단 올리기");
  assert.equal(by[upName("을")].user_id, UP.uid["을"], "앱 로그인이 받은 「07」 계정도 잇는다");
  assert.equal(by[upName("을")].sub_name, "7");
  assert.equal(by[upName("정")].user_id, null);
  assert.deepEqual([by[upName("정")].group_name, by[upName("정")].sub_name, by[upName("정")].position], ["소망", "12", "권사"]);
  assert.equal(by[upName("정")].note, "명단 올리기 / 소속: 교인명부로 채움");
  assert.deepEqual([by[upName("무")].sub_name, by[upName("무")].position], ["5", "집사"]);
  assert.equal(by[upName("신")].position, "명예권사");
  // 계정을 새로 만들지 않는다 · 앱 줄은 건드리지 않는다
  assert.equal((await rest(`users?select=id&name=like.ca-test-up-${STAMP}-*`, "GET")).length, 3);
  assert.deepEqual(await rest(`event_signups?select=sub_name,source,note&event_id=eq.${UP.ev}&source=eq.app`, "GET"),
    [{ sub_name: "9", source: "app", note: "" }]);

  // 같은 것을 다시 넣으면 모두 「이미 있음」 — 0건
  const s2 = await call(t, "evUploadSave", { event_id: UP.ev, rows: upRows(), fill: true });
  assert.equal(s2.body.ok, true, JSON.stringify(s2.body));
  assert.equal(s2.body.saved, 0, JSON.stringify(s2.body));
  assert.equal(s2.body.counts.add + s2.body.counts.fill, 0, JSON.stringify(s2.body.counts));
  assert.equal(s2.body.counts.same, 7, JSON.stringify(s2.body.counts));
  assert.equal(await dbCount(UP.ev), 6);

  // 기록 — event.upload 두 줄(건수만 · 납작하게 · 이름 없음 · 최근 먼저) · people.fill 은 넣기로 늘지 않는다
  const ups = (await call(people.super.token, "auditList", { limit: 100 })).body.rows
    .filter((r) => r.action === "event.upload" && r.target === UP.ev);
  assert.equal(ups.length, 2, JSON.stringify(ups));
  assert.deepEqual(ups.map((u) => u.detail.saved), [0, 5]);
  assert.deepEqual(ups[1].detail, { rows: 10, fillOn: true, add: 3, same: 2, blank: 1, bad: 1, fill: 2, sameName: 1,
    oddPosition: 1, saved: 5, failed: 0 });
  for (const u of ups) assert.ok(!JSON.stringify(u.detail).includes("ca-test-up-"), "event.upload 에 이름이 실렸다");
  const fills = (await call(people.super.token, "auditList", { limit: 100, kind: "people" })).body.rows
    .filter((r) => r.action === "people.fill" && r.target === UP.ev);
  assert.equal(fills.length, 1, "people.fill 은 살펴보기에서만 남는다");
});

test("성경필사 명단 올리기 막기: 자격 회차 eligibility-event · 600줄 넘음 too-many · 없는 회차 not-found — 아무것도 안 들어간다", async () => {
  await upFixtures();
  const t = people.bibleevent.token;
  const one = [{ name: upName("갑"), gu: "화평", mok: "7", pos: "" }];
  const many = Array.from({ length: 601 }, () => ({ name: "홍길동", gu: "화평", mok: "1", pos: "" }));
  const elBefore = await dbCount(EV_EL_ID);   // Task 5 의 자격 회차(needs.eligibility)
  const upBefore = await dbCount(UP.ev);
  for (const a of ["evUploadCheck", "evUploadSave"]) {
    assert.equal((await call(t, a, { event_id: EV_EL_ID, rows: one, fill: true })).body.error, "eligibility-event", a);
    assert.equal((await call(t, a, { event_id: UP.ev, rows: many, fill: false })).body.error, "too-many", a);
    assert.equal((await call(t, a, { event_id: "ca-test-none-" + STAMP, rows: one, fill: false })).body.error, "not-found", a);
    assert.equal((await call(t, a, { event_id: "BAD ID", rows: one, fill: false })).body.error, "not-found", a);
  }
  assert.equal(await dbCount(EV_EL_ID), elBefore, "자격 회차에 줄이 들어갔다");
  assert.equal(await dbCount(UP.ev), upBefore);
});

test("성경필사 교인명부 찾기: 이름이 정확히 같은 분만 · 20명까지 · 다섯 칸만 · 기준일 · people.lookup 에 검색어·결과 수", async () => {
  await upFixtures();
  const t = people.bibleevent.token;
  const one = await call(t, "evPeopleLookup", { name: upName("정") });
  assert.equal(one.body.ok, true, JSON.stringify(one.body));
  assert.deepEqual(Object.keys(one.body).sort(), ["ok", "people", "source"]);
  assert.equal(one.body.source.date, "2000-01-01");      // before() 가 올린 시험 명부 기록이 가장 최근이다
  assert.equal(typeof one.body.source.total, "number");
  assert.deepEqual(one.body.people, [{ name: upName("정"), who_type: "교구", group: "소망", sub: "12", position: "권사" }]);
  const two = await call(t, "evPeopleLookup", { name: upName("기") });
  assert.equal(two.body.people.length, 2);
  for (const p of [...one.body.people, ...two.body.people]) assert.deepEqual(Object.keys(p).sort(), UP_ROW_KEYS);
  // 띄어쓰기가 달라도 같은 이름(이름 키) · 21분이어도 20명까지
  assert.equal((await call(t, "evPeopleLookup", { name: " " + upName("다") + " " })).body.people.length, 20, "상한 20명");
  assert.deepEqual((await call(t, "evPeopleLookup", { name: "ca-test-up-" + STAMP })).body.people, [],
    "앞부분만 같은 이름은 찾지 않는다(정확히 같은 이름만)");
  const text = JSON.stringify([one.body, two.body]);
  for (const k of ["person_id", "name_key", "mok1", "mok3", "kind2", "소망-12목장"]) assert.ok(!text.includes(k), "새어 나감: " + k);
  assert.equal((await call(t, "evPeopleLookup", { name: "" })).body.error, "no-name");
  assert.equal((await call(t, "evPeopleLookup", { name: "홍,길동" })).body.error, "bad-char");
  assert.equal((await call(t, "evPeopleLookup", { name: "가".repeat(41) })).body.error, "too-long");

  const logs = (await call(people.super.token, "auditList", { limit: 100, kind: "people" })).body.rows
    .filter((r) => r.action === "people.lookup");
  const qs = logs.map((r) => r.detail.q);
  for (const k of ["정", "기", "다"]) assert.ok(qs.includes(upName(k)), "people.lookup 에 검색어가 없다: " + k);
  assert.equal(logs.find((r) => r.detail.q === upName("정")).detail.count, 1);
  assert.equal(logs.find((r) => r.detail.q === upName("다")).detail.count, 20);
  const changes = (await call(people.super.token, "auditList", { limit: 100 })).body.rows.map((r) => r.action);
  assert.ok(!changes.includes("people.lookup") && !changes.includes("people.fill"), "교인명부 열람이 「바꾼 기록」 기본 보기에 섞였다");
});
```

- [ ] **Step 10: 돌려서 실패를 본다(개발에 배포된 함수는 아직 Task 7 판이다)**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
node --check tests/server.dev.test.mjs && echo "문법 통과"
set -a; . ~/.church-admin/dev.env; set +a
node --experimental-strip-types --test tests/server.dev.test.mjs
```
Expected: `문법 통과`(`.mjs` 라 `node --check` 가 실제로 잡는다) 다음 FAIL — 「역할이 필요한 액션마다 시험 입력(PROBE)이 있다」는 **통과**, 「권한 표」 는 `not ok`(`none evUploadCheck` 가 400 `unknown-action`), 새 시험 넷(「성경필사 명단 올리기 살펴보기…」·「…넣기…」·「…막기…」·「성경필사 교인명부 찾기…」)이 `unknown-action` 으로 `not ok` — 합해서 `# fail 5`. 나머지(Task 5~7·사역·교인명부 시험)는 통과하고, `after()` 에 `정리 실패` 가 없어야 한다(첫 시험이 시험 자료를 만들었으니 이 과제의 정리 단계 둘과 Task 5 의 회차 정리가 실제로 돈다).

- [ ] **Step 11: index.ts — 새 import 문 하나**

기존 import 줄은 **하나도 고치지 않는다**(CONTRACT 5). 이 과제의 이름은 모두 `./events-upload.ts` 에서만 오고, 그 이름들이 index.ts 에 아직 없다는 것은 Step 1 ③ 에서 봤다.

앵커(한 번만 — Step 1 ①):

```ts
const cors = {
```
그 줄 **바로 위에**(import 문들이 끝난 자리) 아래 두 줄과 빈 줄 하나를 넣는다:

```ts
// 성경필사(암송) 명단 올리기·교인명부 찾기(Task 8) — 이 과제의 이름은 events-upload.ts 에서만 가져온다(CONTRACT 5)
import { applyFill, fillNames, filledNames, judgeUpload, lookupName, lookupOut, LOOKUP_MAX, tidyUpload, tooManyRows, uploadCounts, uploadEventError, uploadKeys, uploadOut, uploadRecords } from "./events-upload.ts";

```

- [ ] **Step 12: index.ts — 새 절(도움 함수 둘 · 액션 셋)**

앵커(한 번만 — Step 1 ①):

```ts
Deno.serve(async (req) => {
```
그 줄 **바로 위에**(Task 7 의 `evRowDelete` 함수 뒤가 된다 · 사이에 빈 줄 하나) 붙인다:

```ts
// ---------- 성경필사(암송) — 명단 올리기 · 교인명부 찾기 (Task 8 · 2026-09-29) ----------
// 설계 §1(같은 분 판정)·§2(evUploadCheck/Save·evPeopleLookup)·§3(명단 올리기). 판정은 events-upload.ts(순수 함수)에 있다.
// ⚠️ 살펴보기와 넣기가 판정을 **처음부터 다시** 돈다 — 화면이 보낸 살펴보기 결과를 믿지 않는다(그 사이 누가 더했을 수 있다).
// ⚠️ 자격 회차(needs.eligibility — isEligEvent 하나로 판정)에는 올리지 않는다 — 가을 설계 §12 「대리 등록은 보정 창구로만」.
// ⚠️ 앱 계정은 찾기만 한다(member_login 을 부르지 않는다). user_id·ident_key 는 응답에 싣지 않는다.
// ⚠️ 교인명부 값은 다섯 칸(이름·구분·소속·세부·직분)으로만 나간다 — 찾기는 people.lookup(검색어·결과 수),
//    살펴보기에서 채운 값을 돌려줄 때는 people.fill(채운 이름)로 남긴다. 둘 다 「교인명부 기록」 보기로 간다.
// ⚠️ 같은 분 판정을 줄마다 sameInEvent 로 부르지 않는다 — 600줄이면 요청이 2천 번을 넘는다.
//    회차 명단을 한 번(allRows), 앱 계정을 한 번(evAccountIndex) 읽고 judgeUpload 가 같은 규칙으로 맞댄다.
const EV_FILL_COLS = "name_key,kind2,mok1,mok3,school_dept,position,position_detail";   // ChurchPerson — 연락처·주소·생년월일은 읽지 않는다
const EV_LOOKUP_COLS = "name," + EV_FILL_COLS;

// 빈칸 채우기용 명부 후보 — 이름 키로만, 100개씩(한글 키 .in() 주소 길이). 한 묶음이 1,000행을 넘어도 잘리지 않게 allRows.
async function evChurchCands(keys: string[]): Promise<Map<string, any[]>> {
  const out = new Map<string, any[]>();
  for (let i = 0; i < keys.length; i += 100) {
    const part = keys.slice(i, i + 100);
    const rows = await allRows(() => db.from("church_people").select(EV_FILL_COLS)
      .in("name_key", part).order("person_id", { ascending: true }));
    for (const r of rows) {
      if (!out.has(r.name_key)) out.set(r.name_key, []);
      out.get(r.name_key)!.push(r);
    }
  }
  return out;
}

// 앱 계정 전부 — 신원 키 → 계정 id 들(users.identity_key + user_identity_aliases 의 옛 키).
// ⚠️ 설계 §1-2: users 는 쪽을 나눠 **전부** 읽는다(지금 421행). 올리기의 후보 키는 수천 개라 usersByKeys(100개씩 .in())로
//    물으면 요청이 수십 번이고 한글 키 100개 주소가 11KB 안팎이다 — 성경암송 eventImport 는 164개에서 주소 한도를 넘었다.
//    usersByKeys 는 키가 스무 개 안쪽인 한 분 더하기·고치기(Task 7)에만 쓴다.
// ⚠️ 키를 다시 다듬지 않는다(NFC 금지) — sameKeys 가 appIdentityKey 로 만든 그대로 맞댄다.
async function evAccountIndex(): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const add = (k: unknown, id: unknown) => {
    if (typeof k !== "string" || !k || typeof id !== "string" || !id) return;
    const l = out.get(k) ?? [];
    if (!l.includes(id)) l.push(id);
    out.set(k, l);
  };
  const us = await allRows(() => db.from("users").select("id,identity_key").order("id", { ascending: true }));
  for (const u of us) add(u.identity_key, u.id);
  const al = await allRows(() => db.from("user_identity_aliases").select("identity_key,user_id")
    .order("identity_key", { ascending: true }));
  for (const a of al) add(a.identity_key, a.user_id);
  return out;
}

async function evUpload(ctx: Ctx, b: any, save: boolean) {
  const raws: unknown[] = Array.isArray(b.rows) ? b.rows : [];
  if (tooManyRows(raws)) return { ok: false, error: "too-many" };   // 회차를 읽기 전에
  const ev = await evRead(b.event_id);                               // 모양이 틀린 id 는 묻지 않고 null
  const blocked = uploadEventError(ev);                              // not-found · eligibility-event
  if (blocked) return { ok: false, error: blocked };
  const eventId: string = ev.id;
  const fill = b.fill === true;

  // ① 다듬기·모양 ② (켰으면) 빈칸 채우기 — 빈칸이 있는 줄의 이름만 명부에 묻는다
  const items = tidyUpload(raws);
  if (fill) {
    const need = fillNames(items);
    if (need.length) applyFill(items, (await peopleSource()) ? await evChurchCands(need) : null);
  }
  // ③ 이 회차 명단(전부 · 1,000행 넘어도)과 앱 계정(통째로 한 번 — 넣을 줄이 있을 때만)에 맞댄다
  const signups = await allRows(() => db.from("event_signups").select("id,ident_key,user_id")
    .eq("event_id", eventId).order("id", { ascending: true }));
  judgeUpload(items, {
    eventKeys: new Set(signups.map((r) => r.ident_key)),
    eventUids: new Set(signups.map((r) => r.user_id).filter(Boolean)),
    users: uploadKeys(items).length ? await evAccountIndex() : new Map<string, string[]>(),
  });
  const counts = uploadCounts(items);

  if (!save) {
    // 채운 교적 값이 화면으로 나간다 — 넣기와 상관없이 남긴다(설계 §2 기록 표)
    const filled = filledNames(items);
    if (filled.length) await audit(ctx, "people.fill", eventId, { rows: filled.length, names: filled });
    return { ok: true, total: signups.length, rows: uploadOut(items), counts };
  }

  // ── 넣기 ── 500줄 묶음. 묶음이 실패하면 그 묶음만 한 줄씩 다시(한 줄 때문에 나머지가 막히지 않게).
  const recs = uploadRecords(items, eventId, new Date().toISOString());
  let saved = 0;
  const failed: { i: number; error: string }[] = [];
  for (let s = 0; s < recs.length; s += 500) {
    const chunk = recs.slice(s, s + 500);
    const { error } = await db.from("event_signups").insert(chunk.map((x) => x.rec));
    if (!error) { saved += chunk.length; continue; }
    console.error("evUploadSave chunk", error);
    for (const x of chunk) {
      const { error: e1 } = await db.from("event_signups").insert(x.rec);
      if (!e1) { saved++; continue; }
      // 23505 = 그 사이 같은 계정의 줄이 들어왔다(unique event_id+user_id) → 「이미 있음」. 그 밖은 서버 기록으로만.
      const dup = (e1 as any).code === "23505";
      if (!dup) console.error("evUploadSave row", x.i, e1);
      failed.push({ i: x.i, error: dup ? "already" : "server" });
    }
  }
  // 건수만, 납작하게(CONTRACT 5 「기록 모양」) — 이름을 싣지 않는다(설계 §2 기록 표). failed 는 개수.
  if (raws.length) {
    await audit(ctx, "event.upload", eventId, { rows: raws.length, fillOn: fill, ...counts, saved, failed: failed.length });
  }
  return { ok: true, counts, saved, failed };
}

// 교인명부에서 이름으로 찾기 — 이름 키가 **정확히 같은** 분만, 20명까지, 다섯 칸만.
// 화면은 「찾기」 단추·Enter 로만 부른다(글자마다 부르지 않는다). 부를 때마다 검색어·결과 수를 기록한다(people.search 와 같게).
async function evPeopleLookup(ctx: Ctx, b: any) {
  const q = lookupName(b.name);                          // no-name · bad-char · too-long
  if (q.error) return { ok: false, error: q.error };
  const src = await peopleSource();
  if (!src) return { ok: true, source: null, people: [] };   // 명부가 없으면 묻지 않는다(기록할 열람도 없다)
  const { data, error } = await db.from("church_people").select(EV_LOOKUP_COLS)
    .eq("name_key", q.key).order("person_id", { ascending: true }).limit(LOOKUP_MAX);
  if (error) throw error;
  const people = ((data ?? []) as any[]).map((p) => lookupOut(p));
  await audit(ctx, "people.lookup", "", { q: q.name, count: people.length });
  return { ok: true, source: { date: src.source_date, total: src.total }, people };
}

```

- [ ] **Step 13: index.ts — switch 세 줄**

앵커(한 번만 — Step 1 ①): `case "evRowDelete":` 로 시작하는 줄(Task 7). 그 줄 **바로 뒤에**:

```ts
      case "evUploadCheck":  return json(await evUpload(ctx, b, false));
      case "evUploadSave":   return json(await evUpload(ctx, b, true));
      case "evPeopleLookup": return json(await evPeopleLookup(ctx, b));
```

- [ ] **Step 14: 이름·자리 점검 · preflight**

`node --experimental-strip-types --check` 는 TS 문법 오류를 못 잡으므로 쓰지 않는다(CONTRACT 5) — index.ts 의 문법은 Step 15 의 **개발 함수 배포**가 검사한다. 여기서는 배포가 거절할 「같은 이름 두 번 가져오기」와 빠진 자리를 grep 으로 본다.

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
I=supabase/functions/church-admin/index.ts
grep -c 'from "./events-upload.ts"' $I                                   # 1
for n in applyFill fillNames filledNames judgeUpload lookupName lookupOut LOOKUP_MAX tidyUpload tooManyRows uploadCounts uploadEventError uploadKeys uploadOut uploadRecords; do
  printf '%s %s\n' "$n" "$(grep -cE "^import .*[{ ,]$n[ ,}]" $I)"
done                                                                      # 열네 줄 모두 1
grep -cE '^(async function (evChurchCands|evAccountIndex|evUpload|evPeopleLookup)\(|const (EV_FILL_COLS|EV_LOOKUP_COLS) = )' $I   # 6
grep -cE 'case "(evUploadCheck|evUploadSave|evPeopleLookup)":' $I       # 3
grep -c "usersByKeys(uploadKeys" $I                                       # 0 — 올리기는 evAccountIndex 로 읽는다
python tools/preflight.py
```
Expected: `1` · 열네 줄 모두 `이름 1`(2 이상이면 같은 이름을 두 번 가져온 것 — 배포가 거절하거나 함수가 뜨지 않는다) · `6` · `3` · `0` · preflight 끝줄 `모두 통과`.

- [ ] **Step 15: 개발 배포(문법 검사) · 개발 시험 · 커밋**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
git status --short        # 네 줄만 — M authz.ts · M index.ts · M tests/authz.test.mjs · M tests/server.dev.test.mjs
supabase functions deploy church-admin --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo
set -a; . ~/.church-admin/dev.env; set +a
node --experimental-strip-types --test tests/server.dev.test.mjs
```
Expected: `git status` 네 줄뿐(다른 것이 보이면 멈춘다 — 배포는 작업 트리를 통째로 올린다) · 배포 줄 `Deployed Functions on project ktpwthwqzgcqcrmsafdo: church-admin`(배포는 **워크트리 루트**에서 한다 — `~/.church-admin/supa-dev` 에는 functions 가 없다) · 개발 시험 끝에 `# fail 0` — 새 시험 넷(같은 것을 두 번 넣으면 둘째는 `saved: 0` · 채우기는 빈 칸만 · 찾기는 다섯 칸만 · `people.lookup {q,count}`/`people.fill {rows,names}`/`event.upload`(납작하게) 기록) · 「권한 표」 · 「PROBE」 모두 통과, `정리 실패` 없음.
배포가 문법 오류로 거절되거나, 배포는 됐는데 모든 요청이 500·503 이면(함수가 뜨지 못했다 — 겹친 이름 등) Step 14 부터 다시 본다. 아직 커밋 전이니 고쳐서 다시 배포·시험한다.

통과하면 커밋:

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
git add supabase/functions/church-admin/authz.ts supabase/functions/church-admin/index.ts tests/authz.test.mjs tests/server.dev.test.mjs
git commit -F - <<'EOF'
feat(성경필사): 명단 올리기·교인명부 찾기(evUploadCheck·evUploadSave·evPeopleLookup) — 판정은 처음부터 다시·앱 계정은 한 번에 읽기·500줄 묶음(실패 묶음은 한 줄씩)·자격 회차 막기·다섯 칸만·people.lookup/people.fill·event.upload(건수만)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
git show --stat HEAD      # 네 파일만인지 본다
git status --short        # 아무것도 안 나와야 한다
```
Expected: 커밋 1개(네 파일) · `git status` 빈칸. ⚠️ 운영(`xnomlgydifiqiybervtf`)에는 배포하지 않는다 — 운영은 Task 15 에서만. 푸시하지 않는다.


### Task 9: 직접 만든 입력 창 — `js/core/modal.js` · 메뉴를 옮기면 닫기 · `be-` 기본 모양

모든 명령은 워크트리에서(Git Bash: `cd /c/Projects/church-admin/.worktrees/bible-events`). 이 계획은 church-admin main `a2dfd7c` 에서 썼다 — **줄 번호로 찾지 않는다.** 고칠 자리는 모두 「앵커 글」로 찾고, 앵커가 한 번만 나오는지 `grep -cF` 로 먼저 본다(Step 1). 기존 import 줄은 다시 쓰지 않고 **새 import 문을 더한다.**

**Files:**
- Check(선행): `js/core/picker.js`·`css/admin.css` 의 `.pk-*` 블록 — main `a2dfd7c` 에 이미 있다(합치기 `35664e0` 「merge: 공용 고르개(native-pickers)」). 이 가지는 Task 1 이 그 main 에서 만들었으니 함께 들어 있다.
- Create: `js/core/modal.js`
- Test: `tests/modal.test.mjs` (새 파일 · 순수 부분만)
- Modify: `js/main.js` — 앵커 셋에 **줄을 더하기만** 한다: ① `import { shouldLeaveKakao, externalUrl, closeUrl } from "./core/inapp.js";` 다음에 새 import 문 ② `boot()` 안 `document.body.classList.remove("nav-open");` 다음에 한 줄 ③ `async function route() {` 다음에 두 줄
- Modify: `css/admin.css` — 파일 **끝에 이어 붙인다**(고르개 `.pk-*` 블록 뒤) 「be- ① 입력 창」 블록

**Interfaces:**
- Consumes: `js/core/ui.js` `errorText(r)`(MESSAGES) · `js/core/picker.js` 가 띄우는 `.pk-dim`(z-index 55 · 좁은 화면 ≤719px 은 `.pk-dim.sheet` · keydown 을 document 의 **capture** 단계에서 받아 Esc 면 `stopPropagation` · 스스로는 `hashchange` 로만 닫힌다) · `ui.js` `dialog` 가 띄우는 `.dlg-dim`(z-index 50 · Esc 는 거품 단계) · `ui.js` `toast` 의 `.adm-toast`(z-index 60 · 화면 아래)
- Produces (CONTRACT §3 그대로):
  - `openForm({ title, html, okLabel = "저장", cancelLabel = "닫기", danger = false, onOpen = (root) => {}, isDirty = (root) => false, onSubmit = async (root) => ({ ok: true }) }) → Promise<value | null>`
    - `root` = 창의 `<form class="be-box">` 요소(부르는 쪽이 `root.querySelector("[data-f=…]")` 로 읽는다). 저장 단추는 `.be-ok`, 닫기 단추는 `.be-cancel`.
    - `onSubmit` 의 답: `{ok:true, value}` → 닫고 `value`(없으면 `true`) · `{ok:false, message}` → 그 글을 `.be-err` 로 · `{ok:false, error, code?}` → `errorText` 로 `.be-err` · `{ok:false}` → 창 그대로, 줄 없음(두 단계 확인의 첫 단계).
    - 열 때 `history.pushState({beModal:1}, "")` 한 칸 — Promise 는 닫으며 그 칸을 `history.back()` 으로 **거둔 뒤에** 풀린다.
  - `closeAllForms()` — 열린 창을 모두 닫고(각 Promise 는 `null`) 주소(history)는 건드리지 않는다.
  - `submitOutcome(r) → {close:boolean, value, message:string}` (순수 · 시험) · `DIRTY_TEXT`
  - CSS: `.be-lock` `.be-modal` `.be-box` `.be-grip` `.be-title` `.be-body` `.be-bottom` `.be-err` `.be-ask` `.be-ask-t` `.be-foot` `.be-note` `.be-warn` `.be-hint` · `.adm-toast{pointer-events:none}`(모든 화면)

정한 것(설계 §3 「팝업」 그대로):
- 닫기 요청 넷 — 「닫기」·Esc·바깥(누를 때와 뗄 때 **둘 다** 바깥)·뒤로 가기. `isDirty` 면 창을 닫지 않고 **창 안에** `저장하지 않은 내용이 있어요 — 닫을까요?` [계속 쓰기][닫기]. 뗀 자리는 `elementFromPoint` 로 본다(손가락은 누른 요소가 `pointerup` 을 받아 target 으로는 모른다).
- 뒤로 가기: 열 때 `history.pushState` 한 칸, `popstate` = 닫기 요청. 우리가 닫을 때는 `history.back()` 으로 그 칸을 거두고 **거둔 뒤에** Promise 를 푼다 — 닫자마자 부른 쪽이 `go()` 로 주소를 바꾸면, 늦게 도는 back 이 방금 바꾼 주소를 되돌리기 때문이다(회차를 만든 뒤 `?ev=새회차` 로 가는 Task 10 이 정확히 그 자리다).
- 고르개는 keydown 을 capture 에서 받아 멈추고, 이 창은 **bubble** 에서 받는다 → 창 안에서 연 달력의 Esc 한 번에 두 창이 함께 닫히지 않는다. 고르개가 떠 있을 때 뒤로 가기는 고르개만 닫는다(같은 주소 칸이라 고르개가 듣는 `hashchange` 가 없다 — 창이 Esc 를 보내 닫고 제 칸을 다시 쌓는다). 확인 창이 떠 있으면 뒤로 가기는 먹지 않는다(답을 받아야 한다).
- z-index 40: 머리줄(30) 위, 확인 창(50)·고르개(55) 아래 — 창 안에서 연 고르개와 「공개 확인」 창이 그 위에 뜬다.
- `busy()` 는 `document.body` 에 붙은 이 창을 잠그지 않으므로 창이 제 단추를 스스로 잠근다(제출 중 `aria-busy` + 본문 누름 막기).
- **알림(toast)은 누름을 가로채지 않는다**(`.adm-toast{pointer-events:none}` — 모든 화면) · 입력 창이나 아래 판 고르개가 떠 있는 동안은 화면 **위**로 옮긴다. 폰에서 알림이 4초 동안 아래 판의 저장 단추·고르개 줄을 덮고 누름까지 가로챘다(2026-09-29 계획 대조 때 헤드리스 크롬 시험으로 찾음). 알림에는 누를 것이 없어 다른 메뉴에 둬도 된다.

- [ ] **Step 1: 선행 확인 — 고르개가 이 가지에 있고, 앵커가 한 번씩이고, 이 과제는 아직 안 들어갔나**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
test -f js/core/picker.js && echo HAS-PICKER || echo NO-PICKER
grep -cE '^export function (pickOne|pickMany|pickDate)\(' js/core/picker.js
grep -cE '^export function fmtDateLabel\(' js/core/picker.js
grep -cF 'document.addEventListener("keydown", onKey, true);' js/core/picker.js
grep -cF '.pk-dim{position:fixed;inset:0;z-index:55}' css/admin.css
grep -cF '.dlg-dim{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:50;' css/admin.css
grep -cF '.adm-toast{position:fixed;' css/admin.css
# 앵커 — 각 줄 맨 앞 숫자가 1 이어야 한다
c() { printf '%s  %s\n' "$(grep -cF -- "$2" "$1")" "$2"; }
c js/main.js 'import { shouldLeaveKakao, externalUrl, closeUrl } from "./core/inapp.js";'
c js/main.js 'document.body.classList.remove("nav-open");'
c js/main.js 'async function route() {'
# 이 과제가 아직 안 들어갔나 — 모두 0 · 「없음」
grep -c 'closeAllForms\|core/modal.js' js/main.js
grep -c '^\.be-' css/admin.css
test -e js/core/modal.js && echo "modal.js 있음" || echo "modal.js 없음"
```
Expected: `HAS-PICKER` · `3` · `1` · `1` · `1` · `1` · `1` · 앵커 세 줄 모두 맨 앞 `1` · `0` · `0` · `modal.js 없음`.
- `NO-PICKER` 거나 `3` 이 아니면 **멈춘다** — Task 1 Step 1 의 판정(main 에 고르개가 있으면 진행)을 다시 본다. 고르개를 다른 곳에서 베껴 오지 않는다(다른 세션이 맡은 공용 파일이다).
- 앵커가 `0` 이면 main 이 그 자리를 바꾼 것이다 — 같은 뜻의 글을 찾아 그 글로 앵커를 바꿔 잡고, `2` 이상이면 앵커를 더 길게 잡아 한 곳만 가리키게 한 뒤 진행한다.

- [ ] **Step 2: 순수 부분의 실패하는 시험 쓰기** — `tests/modal.test.mjs`(새 파일)

```js
// 직접 만든 입력 창(js/core/modal.js)의 순수 부분. 창을 여닫는 DOM 동작(뒤로 가기·Esc·바깥·창 안 확인)은
// 브라우저에서 본다(Task 9 Step 8 · Task 14 점검표).
import { test } from "node:test";
import assert from "node:assert/strict";
import { submitOutcome, DIRTY_TEXT, openForm, closeAllForms } from "../js/core/modal.js";

test("submitOutcome — ok 면 닫고 value 로 · value 가 없으면 true · null 은 null(바뀐 것 없음)", () => {
  assert.deepEqual(submitOutcome({ ok: true, value: { id: 7 } }), { close: true, value: { id: 7 }, message: "" });
  assert.deepEqual(submitOutcome({ ok: true }), { close: true, value: true, message: "" });
  assert.deepEqual(submitOutcome({ ok: true, value: null }), { close: true, value: null, message: "" });
});

test("submitOutcome — 실패는 창을 두고 빨간 줄: message 가 먼저, 없으면 오류 코드를 한국말로(번호는 괄호)", () => {
  assert.deepEqual(submitOutcome({ ok: false, message: "적으신 것을 적어 두세요" }),
    { close: false, value: null, message: "적으신 것을 적어 두세요" });
  assert.deepEqual(submitOutcome({ ok: false, error: "conflict", message: "직접 쓴 글" }),
    { close: false, value: null, message: "직접 쓴 글" });
  assert.equal(submitOutcome({ ok: false, error: "conflict" }).message, "다른 분이 먼저 바꿨어요 — 새로 불러올게요");
  assert.equal(submitOutcome({ ok: false, error: "server", code: "42P01" }).message, "서버에서 문제가 생겼어요 (42P01)");
  assert.equal(submitOutcome({ ok: false, error: "모르는-코드" }).message, "처리하지 못했어요");
});

test("submitOutcome — {ok:false} 만이거나 답이 없으면 창을 두고 줄도 없다(두 단계 확인의 첫 단계)", () => {
  assert.deepEqual(submitOutcome({ ok: false }), { close: false, value: null, message: "" });
  assert.deepEqual(submitOutcome(undefined), { close: false, value: null, message: "" });
  assert.deepEqual(submitOutcome(null), { close: false, value: null, message: "" });
});

test("DIRTY_TEXT — 설계 문구 그대로", () => {
  assert.equal(DIRTY_TEXT, "저장하지 않은 내용이 있어요 — 닫을까요?");
});

test("Node 에서 불러와도 document·history 를 만지지 않는다 · 열린 창이 없으면 closeAllForms 는 아무 일도 안 한다", () => {
  assert.equal(typeof openForm, "function");
  closeAllForms();
});
```

- [ ] **Step 3: 돌려서 실패하는지 본다**

```bash
node --experimental-strip-types --test tests/modal.test.mjs
```
Expected: FAIL — `Cannot find module '…/js/core/modal.js'`(`ERR_MODULE_NOT_FOUND`) · `# fail 1`.

- [ ] **Step 4: `js/core/modal.js` 구현**

```js
// 직접 만든 입력 창 — 브라우저·시스템 팝업(alert·confirm·prompt·beforeunload) 대신(2026-09-29 친구 결정).
//   폰(<1024px) = 화면 아래에서 올라오는 판 · PC = 가운데 창. 모양은 css/admin.css 의 「be- ① 입력 창」 블록.
//   openForm(...) → Promise: 저장하면 onSubmit 이 준 value(없으면 true) · 닫으면 null.
// 설계: v2 docs/superpowers/specs/2026-09-29-church-admin-bible-events-design.md §3 「팝업」.
//   ① 닫기 요청 = 「닫기」·Esc·바깥(누를 때와 뗄 때 **둘 다** 바깥)·뒤로 가기. 입력이 바뀌었으면(isDirty)
//      창을 닫지 않고 **창 안에** 「저장하지 않은 내용이 있어요 — 닫을까요?」 [계속 쓰기][닫기] 줄을 띄운다.
//   ② 저장 중에는 창의 단추를 스스로 잠근다 — ui.js busy() 는 document.body 에 붙은 이 창을 잠그지 않는다.
//   ③ onSubmit 이 {ok:false, error|message} 면 창 안 빨간 줄(.be-err) — 창은 그대로(친 글이 사라지지 않게).
//   ④ 열리면 첫 입력 칸에 초점, 닫히면 열 때 초점이 있던 곳(여는 단추)으로 돌려준다.
//   ⑤ 뒤로 가기: 열 때 history.pushState({beModal:1}) 로 한 칸 쌓고 popstate 를 「닫기 요청」으로 받는다. 우리가 닫을 때는
//      history.back() 으로 그 칸을 거두고, **거둔 뒤에** Promise 를 푼다 — 닫자마자 go() 로 주소를 바꾸면
//      늦게 도는 back 이 방금 바꾼 주소를 되돌려 버린다(새 회차를 만든 뒤 ?ev=새회차 로 가는 회차·명단이 그 자리다).
//   ⑥ 메뉴를 옮기면 main.js route() 가 closeAllForms() 로 모두 닫는다(주소는 건드리지 않는다 — 이미 바뀌었다).
// ⚠️ 고르개(picker.js)는 keydown 을 잡는 단계(capture)에서 받아 멈춘다. 이 창은 거품 단계에서 받으므로 창 안에서 연
//    고르개의 Esc 한 번에 두 창이 함께 닫히지 않는다. 고르개·확인 창(ui.js dialog)이 위에 떠 있으면 키와 뒤로 가기는 그쪽 몫이다.
// ⚠️ z-index 40 — 머리줄(30) 위, 확인 창(.dlg-dim 50)·고르개(.pk-dim 55) 아래. 창 안에서 연 고르개·확인 창이 위에 뜬다.
// ⚠️ 이 파일은 Node 시험(tests/modal.test.mjs)이 읽는다 — 맨 위에서 document·window·history 를 만지지 않는다.
import { errorText } from "./ui.js";

export const DIRTY_TEXT = "저장하지 않은 내용이 있어요 — 닫을까요?";

// onSubmit 의 답 → 창을 어떻게 할지(순수 · 시험).
//   {ok:true, value}        → 닫고 value 로(value 가 없으면 true — 「닫음(null)」과 가르려고)
//   {ok:false, message}     → 창을 두고 그 글을 빨간 줄로(부르는 쪽이 만든 한국말)
//   {ok:false, error, code} → 창을 두고 errorText(ui.js MESSAGES) 로
//   {ok:false} · 없음       → 창을 두고 줄 없이(두 단계 확인의 첫 단계 등)
export function submitOutcome(r) {
  if (r && r.ok) return { close: true, value: r.value === undefined ? true : r.value, message: "" };
  if (r && typeof r.message === "string" && r.message) return { close: false, value: null, message: r.message };
  if (r && r.error) return { close: false, value: null, message: errorText(r) };
  return { close: false, value: null, message: "" };
}

const stack = [];     // 열린 창 — 맨 뒤가 맨 위
const waiters = [];   // 우리가 부른 history.back() 이 끝나면 부를 것(차례대로)
let popBound = false;
let seq = 0;

const FOCUSABLE = 'button:not([disabled]),input:not([disabled]):not([type="hidden"]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
const FIRST_FIELD = '.be-body input:not([type="hidden"]):not([disabled]):not([readonly]),.be-body textarea:not([disabled]),.be-body .pk-field:not([disabled])';
const visible = (x) => x.offsetParent !== null;

function bindPop() {
  if (popBound) return;
  popBound = true;
  window.addEventListener("popstate", () => {
    const w = waiters.shift();
    if (w) { clearTimeout(w.t); w.fn(); return; }        // 우리가 거둔 칸 — 닫기 요청이 아니다
    const top = stack[stack.length - 1];
    if (!top) return;
    if (document.querySelector(".pk-dim")) {             // 고르개가 떠 있으면 그것만 닫는다 — 창의 칸은 다시 쌓는다
      top.repush();
      // 고르개는 hashchange 로만 스스로 닫힌다(같은 주소 칸이라 hashchange 가 없다) — Esc 를 보내 닫는다.
      // 고르개는 document 의 capture 단계에서 받아 멈추므로 이 창(거품 단계)까지 오지 않는다
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      return;
    }
    if (document.querySelector(".dlg-dim")) { top.repush(); return; }   // 확인 창은 답을 받아야 한다
    top.request(true);
  });
}

// history.back() 으로 쌓은 칸을 거두고, 거둔 뒤에 fn. popstate 가 안 오는 드문 경우에도 1초 뒤엔 부른다.
function backThen(fn) {
  const w = { fn, t: 0 };
  w.t = setTimeout(() => {
    const i = waiters.indexOf(w);
    if (i >= 0) { waiters.splice(i, 1); fn(); }
  }, 1000);
  waiters.push(w);
  history.back();
}

export function openForm({ title = "", html = "", okLabel = "저장", cancelLabel = "닫기", danger = false,
  onOpen = () => {}, isDirty = () => false, onSubmit = async () => ({ ok: true }) } = {}) {
  bindPop();
  return new Promise((resolve) => {
    const active = document.activeElement;
    const opener = active instanceof HTMLElement && active !== document.body ? active : null;
    const id = "be-f" + ++seq;
    const dim = document.createElement("div");
    dim.className = "be-modal";
    dim.innerHTML = `<form class="be-box" role="dialog" aria-modal="true" aria-labelledby="${id}" novalidate autocomplete="off">
      <div class="be-grip" aria-hidden="true"></div>
      <h3 class="be-title" id="${id}"></h3>
      <div class="be-body"></div>
      <div class="be-bottom">
        <p class="be-err" role="alert" hidden></p>
        <div class="be-ask" hidden><p class="be-ask-t"></p>
          <div class="be-foot"><button type="button" class="btn" data-be="stay">계속 쓰기</button>
            <button type="button" class="btn danger" data-be="leave">닫기</button></div></div>
        <div class="be-foot be-main"><button type="button" class="btn be-cancel" data-be="cancel"></button>
          <button type="submit" class="btn ${danger ? "danger" : "primary"} be-ok"></button></div>
      </div></form>`;
    const box = dim.querySelector(".be-box");
    box.querySelector(".be-title").textContent = title;
    box.querySelector(".be-ask-t").textContent = DIRTY_TEXT;
    box.querySelector(".be-cancel").textContent = cancelLabel;
    box.querySelector(".be-ok").textContent = okLabel;
    box.querySelector(".be-body").innerHTML = html;   // 부르는 쪽이 사람·서버 글자를 esc 로 감싼 HTML
    const err = box.querySelector(".be-err"), ask = box.querySelector(".be-ask"), main = box.querySelector(".be-main");

    let done = false, sending = false, asking = false;
    const push = () => { history.pushState({ beModal: 1 }, ""); };
    const dirty = () => { try { return !!isDirty(box); } catch (x) { console.error(x); return false; } };
    const focusFirst = () => {
      const f = [...box.querySelectorAll(FIRST_FIELD)].find(visible);
      (f || box.querySelector(danger ? ".be-cancel" : ".be-ok")).focus({ preventScroll: true });
    };
    const showAsk = () => {
      asking = true; ask.hidden = false; main.hidden = true;
      ask.querySelector('[data-be="stay"]').focus({ preventScroll: true });
    };
    const hideAsk = () => { asking = false; ask.hidden = true; main.hidden = false; focusFirst(); };

    // keepHistory — 뒤로 가기로 우리 칸이 이미 빠졌거나(popstate) 메뉴를 옮겨 닫는다(closeAllForms)
    const close = (value, keepHistory) => {
      if (done) return;
      done = true;
      document.removeEventListener("keydown", onKey);
      dim.remove();
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
      if (!stack.length) document.body.classList.remove("be-lock");
      const finish = () => {
        if (opener && opener.isConnected) opener.focus({ preventScroll: true });
        resolve(value);
      };
      if (keepHistory) finish(); else backThen(finish);
    };
    const request = (fromPop) => {
      if (done) return;
      if (sending || asking) { if (fromPop) push(); return; }
      if (!dirty()) return close(null, fromPop);
      if (fromPop) push();   // 묻는 동안 창과 칸을 맞춰 둔다 — 「닫기」를 고르면 그 칸을 다시 거둔다
      showAsk();
    };
    const entry = { request, repush: push, close };

    const onKey = (e) => {
      if (done || !e.isTrusted || stack[stack.length - 1] !== entry) return;
      if (document.querySelector(".pk-dim, .dlg-dim")) return;   // 위에 뜬 고르개·확인 창 몫
      if (e.key === "Escape") {
        if (e.isComposing) return;                               // 한글 조합 중 Esc 는 조합 취소
        e.preventDefault();
        if (asking) hideAsk(); else request(false);
        return;
      }
      if (e.key !== "Tab") return;
      // 초점이 창 밖(뒤 화면)으로 나가지 않게 — 끝에서 처음으로, 처음에서 끝으로
      const f = [...box.querySelectorAll(FOCUSABLE)].filter(visible);
      if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      else if (i < 0) { e.preventDefault(); f[0].focus(); }
    };

    // 뜬 뒤 300ms 동안은 창 안 누름을 받지 않는다 — 여는 단추를 두 번 톡톡 누르면 둘째 탭이 창에 떨어진다
    // (ui.js dialog · picker.js 와 같은 값)
    const openedAt = Date.now();
    dim.addEventListener("click", (e) => {
      if (Date.now() - openedAt <= 300) { e.stopPropagation(); e.preventDefault(); }
    }, true);
    // 바깥 — 누를 때와 뗄 때 **둘 다** 바깥이어야 닫기 요청(글을 끌어 고르다 밖에서 떼면 닫히던 사고 · 2026-09-17).
    // 뗀 자리는 elementFromPoint 로 본다 — 손가락(터치)은 누른 요소가 pointerup 을 받아(암묵 캡처) target 으로는 모른다.
    let downOut = false, upOut = false;
    dim.addEventListener("pointerdown", (e) => { downOut = e.target === dim; upOut = false; });
    dim.addEventListener("pointerup", (e) => { upOut = document.elementFromPoint(e.clientX, e.clientY) === dim; });
    dim.addEventListener("click", (e) => {
      const k = e.target instanceof Element ? e.target.closest("[data-be]")?.dataset.be : "";
      if (k === "cancel") return request(false);
      if (k === "stay") return hideAsk();
      if (k === "leave") return close(null, false);
      if (e.target === dim && downOut && upOut) request(false);
    });
    box.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (done || sending || asking) return;
      sending = true;
      err.hidden = true;
      box.setAttribute("aria-busy", "true");
      const locked = [...box.querySelectorAll("button:not([disabled])")];
      locked.forEach((b) => { b.disabled = true; });
      let r;
      try { r = await onSubmit(box); } catch (x) { console.error(x); r = { ok: false, error: "server" }; }
      sending = false;
      box.removeAttribute("aria-busy");
      if (done) return;   // 그사이 메뉴를 옮겨 닫혔다(closeAllForms)
      const o = submitOutcome(r);
      if (o.close) return close(o.value, false);
      locked.forEach((b) => { b.disabled = false; });
      err.textContent = o.message;
      err.hidden = !o.message;
    });

    stack.push(entry);
    document.body.appendChild(dim);
    document.body.classList.add("be-lock");
    document.addEventListener("keydown", onKey);
    push();
    try { onOpen(box); } catch (x) { console.error(x); }
    focusFirst();
  });
}

// 열린 창을 모두 닫는다(각 Promise 는 null) — main.js 가 메뉴를 옮길 때(route)·다시 부팅할 때(boot) 부른다.
// 주소(history)는 건드리지 않는다: 이미 새 메뉴로 바뀌었고, 여기서 back 을 부르면 방금 연 메뉴가 되돌아간다.
// 그래서 쌓아 둔 칸(창을 연 메뉴와 같은 주소)이 남는다 — 새 메뉴에서 뒤로 가기를 두 번 누르면 둘째 번은 같은 주소라
// 화면이 그대로다(헛 누름 한 번). 주소창을 직접 고칠 때만 생기는 일이라 둔다.
export function closeAllForms() {
  for (const e of [...stack].reverse()) e.close(null, true);
}
```

- [ ] **Step 5: 돌려서 통과하는지 본다**

```bash
node --experimental-strip-types --test tests/modal.test.mjs
node --check js/core/modal.js && echo "문법 통과"
```
Expected: PASS — `# pass 5` · `# fail 0` · `문법 통과`.

- [ ] **Step 6: `js/main.js` — 메뉴를 옮기면(그리고 다시 부팅하면) 창을 닫는다**

Edit 도구로 세 곳에 **줄을 더한다**(있던 줄은 한 글자도 안 바꾼다).

① 앵커 `import { shouldLeaveKakao, externalUrl, closeUrl } from "./core/inapp.js";` — 이 줄은 그대로 두고 **바로 다음 줄에** 새 import 문:

```js
import { closeAllForms } from "./core/modal.js";
```

② 앵커 `    document.body.classList.remove("nav-open");`(`boot()` 안, `me = null;` 바로 다음 줄) — 이 줄 **바로 다음에**:

```js
    closeAllForms();   // 로그인이 풀리거나 권한이 바뀌어 다시 부팅하면 떠 있던 입력 창(js/core/modal.js)도 닫는다
```

③ 앵커 `async function route() {` — 이 줄 **바로 다음에**(원래 다음 줄 `  if (!me) return;` 앞):

```js
  // 메뉴를 옮기면 떠 있던 입력 창(js/core/modal.js)을 닫는다 — 안 그러면 다음 메뉴 위에 창이 남는다(설계 §3)
  closeAllForms();
```

```bash
grep -c 'closeAllForms' js/main.js
grep -n -A2 'async function route() {' js/main.js
node --check js/main.js && echo "문법 통과"
```
Expected: `3`(import 하나 · 부르기 둘) · `route() {` 다음 줄이 주석, 그다음 `closeAllForms();`, 그다음이 원래의 `if (!me) return;` · `문법 통과`.

- [ ] **Step 7: `css/admin.css` 끝에 「be- ① 입력 창」 블록 이어 붙이기**

(작업 트리의 `css/admin.css` 는 CRLF 다 — 이어 붙인 줄이 LF 여도 커밋할 때 git 이 맞춘다. Task 11·12 도 같은 방식으로 이어 붙인다.)

```bash
echo >> css/admin.css
cat >> css/admin.css <<'EOF'
/* ── 성경필사(암송) be- ① 직접 만든 입력 창(js/core/modal.js · 2026-09-29) ─────────────────────────
   폰(<1024px) = 아래에서 올라오는 판 · PC = 가운데 창. z-index 40 = 머리줄(30) 위 · 확인 창(.dlg-dim 50)·
   고르개(.pk-dim 55) 아래 — 창 안에서 연 고르개·공개 확인 창이 그 위에 뜬다. 크기·색은 토큰만(뒤 막만 반투명).
   입력 칸은 공용 .field·.seg·.pk-field 를 그대로 쓴다. ⚠️ .dlg .body(pre-line)를 다시 쓰지 않는다 — 폼 줄바꿈이 깨진다. */
.be-lock{overflow:hidden}
.be-modal{position:fixed;inset:0;z-index:40;display:flex;align-items:flex-end;justify-content:center;background:rgba(13,27,62,.45)}
.be-box{display:flex;flex-direction:column;width:100%;max-width:560px;max-height:92vh;max-height:92dvh;background:var(--paper);color:var(--ink);
  border-radius:16px 16px 0 0;padding-bottom:env(safe-area-inset-bottom,0px);box-shadow:0 -6px 24px rgba(0,0,0,.18);animation:be-up .18s ease-out}
@keyframes be-up{from{transform:translateY(100%)}to{transform:none}}
@media (prefers-reduced-motion:reduce){.be-box{animation:none}}
.be-grip{flex:none;width:40px;height:5px;margin:8px auto 0;border-radius:999px;background:var(--border)}
.be-title{flex:none;padding:10px var(--card-pad) 6px;font-size:1.05rem;font-weight:800;color:var(--navy-dark)}
.be-body{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:4px var(--card-pad) 10px;font-size:15px}
.be-box[aria-busy="true"] .be-body{opacity:.6;pointer-events:none}
.be-bottom{flex:none;padding:10px var(--card-pad) 12px;border-top:1px solid var(--light)}
.be-foot{display:flex;gap:8px}
.be-foot .btn{flex:1 1 0;min-width:0}
.be-err{margin:0 0 10px;padding:8px 12px;border:1px solid var(--danger-bd);border-radius:10px;background:var(--danger-bg);
  color:var(--error);font-size:14px;font-weight:700;line-height:1.5}
.be-ask-t{margin:0 0 10px;font-size:15px;font-weight:800;color:var(--navy-dark)}
/* 칸 이름 옆 작은 안내 — <small> 의 기본 글씨(smaller)는 13px 아래로 내려간다 */
.be-body .field small{font-size:13px;font-weight:400;color:var(--gray)}
.be-body textarea{display:block;width:100%;min-height:88px;padding:10px 12px;border:1px solid var(--border);border-radius:10px;
  background:var(--paper);font:inherit;font-size:1rem;line-height:1.5;resize:vertical}
.be-note{margin:0 0 12px;padding:9px 12px;border-radius:10px;background:var(--ghost-bg);color:var(--navy);font-size:14px;line-height:1.55}
.be-warn{margin:0 0 12px;padding:9px 12px;border:1px solid var(--danger-bd);border-radius:10px;background:var(--danger-bg);
  color:var(--error);font-size:14px;line-height:1.55}
.be-hint{margin:-4px 0 12px;font-size:13px;color:var(--gray);line-height:1.55}
/* 알림(toast)은 누름을 가로채지 않게 · 입력 창이나 아래 판 고르개가 떠 있는 동안은 화면 위로 — 폰에서 알림이 4초 동안
   아래 판의 저장 단추·고르개 줄을 덮고 누름까지 가로챘다(2026-09-29 화면 시험). 누를 것이 없는 알림이라 모든 화면에 둔다. */
.adm-toast{pointer-events:none}
body.be-lock .adm-toast,body:has(.pk-dim.sheet) .adm-toast{bottom:auto;top:calc(12px + env(safe-area-inset-top,0px))}
@media (min-width:1024px){
  .be-modal{align-items:center;padding:24px}
  .be-box{max-width:520px;max-height:86vh;border-radius:16px;box-shadow:0 12px 40px rgba(13,27,62,.25);animation:none}
  .be-grip{display:none}
}
EOF
python -c "s=open('css/admin.css',encoding='utf-8').read(); print(s.count('{'), s.count('}'))"
grep -c '^\.be-modal{' css/admin.css
grep -c '^\.adm-toast{pointer-events:none}' css/admin.css
```
Expected: 두 숫자가 같다(여는·닫는 괄호) · `1` · `1`.

- [ ] **Step 8: 브라우저에서 창 동작을 직접 본다(메뉴 없이 · 5분)**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
python -m http.server 8000
```
http://localhost:8000 을 열고(로그인 화면이어도 된다) 개발자 도구 콘솔에 붙여 넣는다:

```js
const { openForm } = await import("/js/core/modal.js");
const { pickDate } = await import("/js/core/picker.js");
const { toast } = await import("/js/core/ui.js");
window.tryForm = () => openForm({
  title: "시험 창",
  html: '<label class="field"><span>이름</span><input data-f="x"></label>' +
    '<div class="field"><span>날짜</span><button type="button" class="pk-field" data-d><span class="pk-field-v">날짜 고르기</span></button></div>',
  onOpen: (root) => { root.querySelector("[data-d]").onclick = (e) => pickDate({ anchor: e.currentTarget, title: "날짜" }); },
  isDirty: (root) => !!root.querySelector('[data-f="x"]').value,
  onSubmit: async (root) => root.querySelector('[data-f="x"]').value === "틀림"
    ? { ok: false, error: "conflict" } : { ok: true, value: "저장됨" },
}).then((v) => console.log("결과:", v, "· history.state:", JSON.stringify(history.state)));
tryForm();
```

하나씩 보고, 매번 콘솔에서 `tryForm()` 으로 창을 다시 연다:
1. 폭 390px(개발자 도구 기기 모드) → 아래에서 올라오는 판 · 1280px → 가운데 창. 「이름」 칸에 초점이 있다. 콘솔 `history.state` → `{beModal: 1}`.
2. 빈 채로 Esc → 닫히고 `결과: null · history.state: null`.
3. 이름에 글을 쓰고 Esc / 바깥 누르기 / 브라우저 뒤로 가기 → **창 안에** 「저장하지 않은 내용이 있어요 — 닫을까요?」 · 「계속 쓰기」 → 글 그대로 · 다시 Esc → 「닫기」 → `결과: null · history.state: null`.
4. 글을 쓰고, 창 **안**에서 누른 채 바깥으로 끌어 떼기 → 닫기 요청이 없다.
5. 「날짜」 → 달력 → Esc 한 번 → **달력만** 닫히고 창은 남는다. 달력을 연 채 뒤로 가기 → 달력만 닫힌다(`history.state` 는 여전히 `{beModal: 1}`).
6. 이름 「틀림」 → 저장 → 빨간 줄 「다른 분이 먼저 바꿨어요 — 새로 불러올게요」, 창 그대로 · 단추가 다시 눌린다.
7. 이름 「홍길동」 → 저장 → `결과: 저장됨 · history.state: null`(열 때 쌓은 칸을 거두고 풀렸다).
8. 폭 390px 에서 창을 연 채 콘솔 `toast("알림 시험")` → 알림이 화면 **위**에 뜨고, 아래의 「저장」·「닫기」를 그대로 누를 수 있다.
9. 창을 연 채 주소창의 `#` 뒤를 `#/audit` 로 바꿔 Enter → 창이 닫힌다(`결과: null` · `route()` 가 `closeAllForms()` 를 부른다 — 로그인 전이어도 route 맨 앞이라 돈다).

`Ctrl+C` 로 서버를 끈다.

- [ ] **Step 9: 전체 점검 후 커밋**

```bash
python tools/preflight.py
```
Expected: `모두 통과`

```bash
git add js/core/modal.js tests/modal.test.mjs js/main.js css/admin.css
git status --short
git commit -m "feat(성경필사): 직접 만든 입력 창 js/core/modal.js — 뒤로 가기·Esc·바깥(누름·뗌)·창 안 「저장 안 한 내용」 확인 · 저장 중 스스로 잠금 · 메뉴 옮기면 닫기 · 알림이 아래 판 단추를 가리지 않게 · be- 기본 모양" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
Expected: `git status --short` 에 이 네 파일만 스테이징돼 있다. 푸시하지 않는다.

---

### Task 10: 📋 회차·명단 화면 — `roster`·`roster-ui`·`roster-logic`·`event-form`·`row-form`

모든 명령은 워크트리에서. main `a2dfd7c` 기준 — 고칠 자리는 앵커 글로 찾는다(Step 0).

**Files:**
- Create: `js/menus/bibleevent/roster-logic.js` (순수 · DOM·import 없음)
- Test: `tests/be-roster-logic.test.mjs` (새 파일)
- Modify: `js/core/ui.js` — `MESSAGES` 의 앵커 두 곳: `  "note-too-long": "사유는 500자까지 적을 수 있어요",` 한 줄을 바꾸고 · `  "last-super": "총괄 관리자가 한 분은 남아 있어야 해요",` **다음에** 새 코드 스무 개
- Test: `tests/ui.test.mjs` — 파일 끝에 시험 하나 이어 붙이기
- Create: `js/menus/bibleevent/roster-ui.js` · `js/menus/bibleevent/event-form.js` · `js/menus/bibleevent/row-form.js` · `js/menus/bibleevent/roster.js`
- Test: `tests/be-roster-ui.test.mjs` (새 파일 — HTML 조각 + 화면 모듈이 Node 에서 읽히는지)
- Modify: `js/menus/registry.js` — 앵커 `    role: "ministry", load: () => import("./ministry/appointed.js") },` **다음에** 두 줄(묶음 차례: 사역신청 → **성경필사(암송)** → 교인명부)
- Modify: `css/admin.css` — 파일 끝(Task 9 「be- ①」 블록 뒤)에 「be- ② 회차·명단」 블록 이어 붙이기

**Interfaces:**
- Consumes:
  - 서버(Task 5-8, CONTRACT §2 그대로): `evEvents {}` → `{ok, today, events:[EvEventOut]}` · `evRoster {event_id}` → `{ok, event:EvEventOut, source:{date,total}|null, rows:[RowOut]}`(없는·모양이 틀린 id 는 `not-found`) · `evEventCreate {event:{id,title,short_title,subtitle,season,opens_on,closes_on,list_until}}` → `{ok, event}` · `evEventSave {event_id, expect, patch, confirmListed?}` → `{ok, event, listedBefore, listedNow}` | `{ok:false, error:"needs-confirm"}`(아무것도 안 씀) · `evRowAdd {event_id, row:{who_type,group,sub,name,position,note}}` → `{ok, row, linked, warnings:string[]}`(warnings 는 한국말 문장) · `evRowSave {id, expect, patch}` → `{ok, row}` · `evRowDelete {id, expect}` → `{ok, deleted:{id,name}}`(자격 회차면 `eligibility-event` · 앱 줄이면 `app-row`) · `evPeopleLookup {name}` → `{ok, source, people:[{name,who_type,group,sub,position}]}`
    - `EvEventOut = {id,title,short_title,subtitle,season,kind,status,opens_on,closes_on,list_until,updated_at,count,listedNow,hasEligibility}`(`hasEligibility` = Task 2 `isEligEvent`) · `RowOut = {id,who_type,group,sub,name,position,note,source,hasUser,at,updated_at,church}`
    - **줄·회차 검사와 다듬기는 서버 한 곳**: `evRowAdd`·`evRowSave` 가 Task 2 `tidyRow`(「화평교구」→화평 · 「20목장」·「07」→20·7 · 「유년」→유년부 · 직분 「님」·괄호) 뒤 `checkRow`, `evEventCreate`·`evEventSave` 가 `checkEvent` — 화면은 적은 그대로 보내고 돌려받은 코드를 창 안 빨간 줄로 보인다. 메모는 서버가 한 줄로(`legacyNorm`) 저장하고, 한 분 더하기는 「담당자가 더함 / 」를 붙인 **뒤** 500자로 센다(계약 §5).
  - Task 2·6 `events-rules.ts`: `BE_GU`·`EVT_STATUS`·`BE_NOTE_MAX`·`EV_EDIT_KEYS`(시험이 화면 표와 같은지 본다)
  - Task 9 `openForm`(root = `<form class="be-box">`, `.be-ok`) · `picker.js` `pickOne`·`pickMany`·`pickDate`(`min`·`max`)·`fmtDateLabel` · `ui.js` `esc`·`toast`·`dialog`·`errorText` · `people/church-badge.js` `churchBadgeHtml`·`hasChurch`·`CHURCH_LEGEND`
  - Task 5 `authz.ts` 의 `bibleevent` 역할(registry 시험의 `knownRoles()`)
- Produces:
  - `roster-logic.js`(CONTRACT §3 다섯 + 도움): `groupRows(rows) → [{key,label,rows}]` · `filterRows(rows, f)` (`f = {groups:string[], positions:string[], church:"", source:"", q:""}`) · `dupFlags(rows) → Set<id>` · `csvText(rows) → string` · `SRC_LABEL` + `GU_ORDER`·`BU_ORDER`·`EV_STATUS`·`STATUS_KO`·`STATUS_HINT`·`CHURCH_STATES`·`EV_EDIT_KEYS`·`ROW_KEYS`·`NOTE_FORM_MAX`(480)·`norm(v)`·`tidyMok(v)`·`whoText(r)`·`subText(r)`·`groupKey(r)`·`blankFilter()`·`filterActive(f)`·`positionCounts(rows)`·`sortEvents(list)`·`eventPatch(before, v)`·`rowPatch(before, v, keys?)`
  - `roster-ui.js`: `TITLE`·`ELIG_LINE`·`UNTIL_WARN`·`CHURCH_LABEL`·`periodText`·`chipsHtml`·`headHtml`·`settingsHtml`·`sourceHtml`·`filtersHtml`·`sumHtml`·`cardHtml`·`tableHtml`·`listHtml`·`rowMenuOptions`
  - `event-form.js`: `openEventForm({ call, ev = null, onStale = null }) → Promise<EvEventOut | null>`
  - `row-form.js`: `openRowForm({ call, ev, row = null, onStale = null }) → Promise<RowOut | null>` · `openRowDelete({ call, row, onStale = null }) → Promise<{id,name} | null>`
  - `roster.js`: `render(el, { me, call, go, sub, query })` — 주소 `#/be-roster?ev=<id>`
  - `registry.js` 줄 `be-roster`(끝 줄 `    role: "bibleevent", load: () => import("./bibleevent/roster.js") },` — Task 11 의 앵커) · `ui.js` MESSAGES 새 코드 스무 개(Task 11·12 시험이 기댄다) · CSS `be-` ② 블록

정한 것:
- **명단 차례 = 성도님 앱 명단(`eventRosterPublic`)과 같게**(설계 §3): 교구(`믿음…새가족`) → 모르는 교구 → 교회학교(앱 `EVT_BU_ORDER`: 사랑부·영아부·유아부·유치부·유년부·초등부·중등부·고등부·청년부) → 모르는 부서(소년2부 등, 가나다) → 구분 없음. 안에서는 목장 숫자 → 숫자 아닌 것(빈칸·남성) → 이름.
- **검사는 서버 한 곳.** 화면에 판정표를 두 벌 두지 않는다 — 서버는 「화평교구」·「07」·「유년」을 다듬어 받는데, 화면이 따로 검사하면 받을 수 있는 줄을 화면이 막는 날이 온다(대조 때 실제로 셋이 어긋났다). 틀리면 서버 코드가 창 안 빨간 줄(ui.js MESSAGES)로 보이고 창은 그대로다.
- 고르기는 모두 고르개: 회차는 칩, 거르기(교구·부서·직분 = `pickMany`, 교적·출처 = `pickOne`), 줄 메뉴(고치기·빼기 = `pickOne` — 드롭다운을 직접 그리지 않아 PC 표를 `overflow-x` 로 감싸도 잘리지 않는다), 교구·상태(`pickOne`), 날짜(`pickDate` · 기간의 반대쪽 끝을 `min`·`max` 로). `<select>`·`<input type=date|time>`·`datalist` 없음.
- 쓰기는 모두 입력 창(Task 9) 안에서. 다른 분이 먼저 바꿨으면(`conflict`·`not-found`) **창을 닫지 않고** 창 안 빨간 줄로 알리고(친 글을 옮겨 적을 수 있게), 창이 닫히면 `onStale(code)` → 화면이 알림 창 뒤 새로 불러온다.
- 회차 공개: `needs-confirm` 이면(서버는 아무것도 안 썼다) `dialog` 「이 회차가 성도님 첫 화면에 나타납니다 — 명단(이름·소속·직분)이 로그인 없이 보여요」 [그만두기][보이게 하기] → 「보이게 하기」일 때만 `confirmListed:true` 로 다시.
- 자격 회차(`hasEligibility`): 「＋ 한 분 더하기」 단추가 없고, 줄은 모두 메모만(빼기 없음). 앱 줄(`source='app'`)도 메모만, 빼기 없음. 메모만 고치는 줄에는 **`note` 한 칸만** 보낸다(서버가 다른 칸이 오기만 해도 `app-row-note-only` 로 막는다).
- 메모 창의 글자 수 상한은 **480**(`NOTE_FORM_MAX` · 계약 §5) · 메모는 한 줄로 저장된다(창에 그렇게 적는다).
- 내려받기 = 화면에 보이는 줄 그대로(거르기·찾기·묶음 차례) · 칸 `이름,구분,소속,세부,직분,출처,교적` · 메모 없음 · `=`·`+`·`-`·`@` 로 시작하는 칸은 앞에 `'`(엑셀이 수식으로 읽지 않게).

- [ ] **Step 0: 선행 확인 — 앞 과제의 이름·앵커가 있고, 이 과제는 아직 안 들어갔나**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
node --experimental-strip-types --input-type=module -e "
const r = await import('./supabase/functions/church-admin/events-rules.ts');
const miss = ['BE_GU', 'EVT_STATUS', 'BE_NOTE_MAX', 'EV_EDIT_KEYS'].filter((k) => typeof r[k] === 'undefined');
if (miss.length) throw new Error('events-rules.ts 에 없다(Task 2·6): ' + miss.join(', '));
const a = await import('./supabase/functions/church-admin/authz.ts');
if (!a.knownRoles().includes('bibleevent')) throw new Error('authz.ts 에 bibleevent 역할이 없다(Task 5)');
const m = await import('./js/core/modal.js');
if (typeof m.openForm !== 'function' || typeof m.closeAllForms !== 'function') throw new Error('modal.js 가 없다(Task 9)');
console.log('앞 과제 이름 모두 있음');
"
c() { printf '%s  %s\n' "$(grep -cF -- "$2" "$1")" "$2"; }
c js/core/ui.js '  "note-too-long": "사유는 500자까지 적을 수 있어요",'
c js/core/ui.js '  "last-super": "총괄 관리자가 한 분은 남아 있어야 해요",'
c js/menus/registry.js '    role: "ministry", load: () => import("./ministry/appointed.js") },'
c css/admin.css '.be-modal{position:fixed;'
# 이 과제가 아직 안 들어갔나 — 0 · 0 · 「없음」
grep -cE '"?(already|app-row-note-only|eligibility-event|needs-confirm|bad-event-id)"?:' js/core/ui.js
grep -c 'be-roster' js/menus/registry.js
test -d js/menus/bibleevent && echo "bibleevent 폴더 있음" || echo "bibleevent 폴더 없음"
```
Expected: `앞 과제 이름 모두 있음`(ExperimentalWarning 한 줄은 괜찮다) · 앵커 네 줄 모두 맨 앞 `1` · `0` · `0` · `bibleevent 폴더 없음`.
하나라도 어긋나면 **멈춘다** — 이름이 없으면 그 과제(2·5·6·9)가 덜 끝난 것, 앵커가 0 이면 main 이 그 자리를 바꾼 것(같은 뜻의 글로 앵커를 다시 잡는다), 2 이상이면 앵커를 더 길게 잡는다.

- [ ] **Step 1: 순수 논리의 실패하는 시험 쓰기** — `tests/be-roster-logic.test.mjs`(새 파일)

```js
// 📋 회차·명단의 순수 함수(js/menus/bibleevent/roster-logic.js). HTML 조각은 tests/be-roster-ui.test.mjs,
// 창·화면(event-form.js·row-form.js·roster.js)은 브라우저에서 본다(Task 10 Step 16 · Task 14 점검표). 이름은 가짜(홍길동·성춘향 …)만.
import { test } from "node:test";
import assert from "node:assert/strict";
import { GU_ORDER, BU_ORDER, EV_STATUS, STATUS_KO, STATUS_HINT, SRC_LABEL, CHURCH_STATES, EV_EDIT_KEYS, ROW_KEYS, NOTE_FORM_MAX,
  norm, blankFilter, filterActive, groupKey, groupRows, filterRows, dupFlags, positionCounts, csvText, sortEvents,
  tidyMok, whoText, subText, eventPatch, rowPatch } from "../js/menus/bibleevent/roster-logic.js";
import { BE_GU, EVT_STATUS, EV_EDIT_KEYS as SERVER_EDIT_KEYS, BE_NOTE_MAX } from "../supabase/functions/church-admin/events-rules.ts";

const R = (o) => ({ id: 1, who_type: "교구", group: "화평", sub: "20", name: "홍길동", position: "", note: "", source: "import",
  hasUser: false, at: "2026-09-01", updated_at: "2026-09-01T00:00:00Z", church: null, ...o });

test("서버와 같은 표 — 교구 차례 · 상태 · 회차 설정 칸 · 메모 상한(브라우저는 .ts 를 못 읽어 한 벌 더 둔다)", () => {
  assert.deepEqual(GU_ORDER, BE_GU);
  assert.deepEqual(EV_STATUS, EVT_STATUS);
  assert.deepEqual(EV_EDIT_KEYS, SERVER_EDIT_KEYS);
  for (const s of EV_STATUS) { assert.ok(STATUS_KO[s], s); assert.ok(STATUS_HINT[s], s); }
  assert.deepEqual(BU_ORDER, ["사랑부", "영아부", "유아부", "유치부", "유년부", "초등부", "중등부", "고등부", "청년부"]);
  assert.deepEqual(SRC_LABEL, { app: "📱 앱", import: "📋 이관" });
  assert.deepEqual(CHURCH_STATES, ["맞음", "확인 필요", "없음"]);
  assert.deepEqual(ROW_KEYS, ["who_type", "group", "sub", "name", "position", "note"]);
  // 서버는 「담당자가 더함 / 」(10자)를 붙인 **뒤** 500자로 센다 — 창 상한 480 이면 붙여도 넘지 않는다(계약 §5)
  assert.equal(NOTE_FORM_MAX, 480);
  assert.ok(NOTE_FORM_MAX + "담당자가 더함 / ".length <= BE_NOTE_MAX);
});

test("norm — 서버 legacyNorm 과 같다(앞뒤 떼고 가운데 빈칸·줄바꿈은 하나로)", () => {
  assert.equal(norm("  홍  길동 "), "홍 길동");
  assert.equal(norm("전화로\n\n확인"), "전화로 확인");
  assert.equal(norm(null), "");
});

test("groupRows — 교구(앱 차례) → 모르는 교구 → 교회학교(앱 차례) → 모르는 부서 → 구분 없음 · 안에서는 목장 숫자 → 숫자 아닌 것 → 이름", () => {
  const rows = [
    R({ id: 1, group: "화평", sub: "20", name: "홍길동" }),
    R({ id: 2, group: "화평", sub: "3", name: "성춘향" }),
    R({ id: 3, group: "화평", sub: "남성", name: "이몽룡" }),
    R({ id: 4, group: "믿음", sub: "1", name: "홍길순" }),
    R({ id: 5, who_type: "교회학교", group: "청년부", sub: "", name: "방자" }),
    R({ id: 6, who_type: "교회학교", group: "중등부", sub: "", name: "향단" }),
    R({ id: 7, who_type: "교회학교", group: "소년2부", sub: "", name: "월매" }),
    R({ id: 8, group: "하늘", sub: "1", name: "변학도" }),
    R({ id: 9, group: "화평", sub: "10", name: "심청" }),
    R({ id: 10, group: "화평", sub: "", name: "흥부" }),
    R({ id: 11, group: "화평", sub: "10", name: "놀부" }),
    R({ id: 12, who_type: "", group: "", sub: "", name: "뺑덕" }),
  ];
  const g = groupRows(rows);
  assert.deepEqual(g.map((x) => x.key), ["교구|믿음", "교구|화평", "교구|하늘", "교회학교|중등부", "교회학교|청년부", "교회학교|소년2부", "|"]);
  assert.deepEqual(g.map((x) => x.label), ["믿음", "화평", "하늘", "중등부", "청년부", "소년2부", "소속 없음"]);
  assert.deepEqual(g[1].rows.map((r) => r.id), [2, 11, 9, 1, 10, 3]);   // 3 · 10(놀부·심청 가나다) · 20 · 빈칸 · 남성
  assert.equal(groupKey(rows[0]), "교구|화평");
  assert.deepEqual(rows.map((r) => r.id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);   // 받은 배열은 그대로
  assert.deepEqual(groupRows([]), []);
});

test("filterRows — 교구·부서 · 직분(빈 것 = 직분 없음) · 교적 · 출처 · 찾기(이름·소속·직분, NFC) · 비면 전체", () => {
  const rows = [
    R({ id: 1, name: "홍길동", position: "집사", source: "app", church: { state: "맞음", reason: "" } }),
    R({ id: 2, name: "성춘향", group: "믿음", sub: "3", position: "", church: { state: "없음", reason: "" } }),
    R({ id: 3, name: "방자", who_type: "교회학교", group: "청년부", sub: "", position: "청년", church: null }),
  ];
  const ids = (f) => filterRows(rows, { ...blankFilter(), ...f }).map((r) => r.id);
  assert.deepEqual(ids({}), [1, 2, 3]);
  assert.deepEqual(ids({ groups: ["교구|믿음", "교회학교|청년부"] }), [2, 3]);
  assert.deepEqual(ids({ positions: [""] }), [2]);
  assert.deepEqual(ids({ positions: ["집사", "청년"] }), [1, 3]);
  assert.deepEqual(ids({ church: "없음" }), [2]);
  assert.deepEqual(ids({ church: "맞음" }), [1]);
  assert.deepEqual(ids({ source: "app" }), [1]);
  assert.deepEqual(ids({ source: "import" }), [2, 3]);
  assert.deepEqual(ids({ q: "춘향" }), [2]);
  assert.deepEqual(ids({ q: "믿음 3목장" }), [2]);
  assert.deepEqual(ids({ q: " 청년 " }), [3]);
  assert.deepEqual(ids({ q: "홍길동".normalize("NFD") }), [1]);
  assert.deepEqual(ids({ groups: ["교구|화평"], source: "import" }), []);
  assert.equal(filterActive(blankFilter()), false);
  assert.equal(filterActive({ ...blankFilter(), q: "  " }), false);
  assert.equal(filterActive({ ...blankFilter(), church: "없음" }), true);
  assert.equal(filterActive({ ...blankFilter(), positions: [""] }), true);
  assert.notEqual(blankFilter().groups, blankFilter().groups);   // 부를 때마다 새 배열
});

test("dupFlags — 같은 이름·같은 소속만(07 = 7 = 7목장 · NFC · 띄어쓰기) · 명단 전체로 · 이름 없는 줄은 빼고", () => {
  const rows = [
    R({ id: 1, sub: "07" }), R({ id: 2, sub: "7목장" }), R({ id: 3, sub: "20" }),
    R({ id: 4, group: "믿음", sub: "1", name: "성춘향".normalize("NFD") }), R({ id: 5, group: "믿음", sub: "1", name: "성 춘향" }),
    R({ id: 6, who_type: "교회학교", group: "화평", sub: "07" }),
    R({ id: 7, name: "" }), R({ id: 8, name: "" }),
  ];
  assert.deepEqual([...dupFlags(rows)].sort((a, b) => a - b), [1, 2, 4, 5]);
  assert.equal(dupFlags([]).size, 0);
});

test("positionCounts — 많은 차례 · 같으면 가나다 · 빈 직분은 뒤 · 앞뒤 빈칸은 같은 직분", () => {
  const rows = [R({ position: "집사" }), R({ position: "권사" }), R({ position: "집사" }), R({ position: "" }),
    R({ position: " 권사 " }), R({ position: "성도" })];
  assert.deepEqual(positionCounts(rows), [["권사", 2], ["집사", 2], ["성도", 1], ["", 1]]);
});

test("csvText — BOM · \\r\\n · 일곱 칸 · 받은 차례 그대로 · 메모는 안 싣는다 · 수식으로 안 읽히게", () => {
  const csv = csvText([
    R({ id: 2, name: "홍길동", position: "집사", source: "app", church: { state: "맞음", reason: "" }, note: "원래: 화평 30 · 집사" }),
    R({ id: 1, name: '=HYPERLINK("x")', who_type: "교회학교", group: "청년부", sub: "", church: { state: "확인 필요", reason: "소속 다름" } }),
    R({ id: 3, name: "성춘향", church: null }),
  ]);
  assert.ok(csv.startsWith("﻿"));
  const lines = csv.slice(1).split("\r\n");
  assert.equal(lines.length, 4);
  assert.equal(lines[0], '"이름","구분","소속","세부","직분","출처","교적"');
  assert.equal(lines[1], '"홍길동","교구","화평","20","집사","앱","맞음"');
  assert.equal(lines[2], `"'=HYPERLINK(""x"")","교회학교","청년부","","","이관","확인 필요 · 소속 다름"`);
  assert.equal(lines[3], '"성춘향","교구","화평","20","","이관",""');
  assert.ok(!csv.includes("원래:"));
});

test("sortEvents — 시작일 최근 먼저 · 같으면 id 거꾸로 · 받은 배열은 그대로", () => {
  const evs = [{ id: "lent-2024", opens_on: "2024-02-14" }, { id: "summer-2026", opens_on: "2026-07-01" },
    { id: "lent-2026", opens_on: "2026-02-18" }, { id: "lent-booklet-2026", opens_on: "2026-02-18" }];
  assert.deepEqual(sortEvents(evs).map((e) => e.id), ["summer-2026", "lent-booklet-2026", "lent-2026", "lent-2024"]);
  assert.equal(evs[0].id, "lent-2024");
});

test("tidyMok — 서버 tidyRow 의 목장 규칙과 같은 보기(Task 2 시험) · whoText · subText", () => {
  assert.equal(tidyMok("07"), "7");
  assert.equal(tidyMok("007목장"), "7");
  assert.equal(tidyMok(" 20목장 "), "20");
  assert.equal(tidyMok("20 목장"), "20");
  assert.equal(tidyMok("남성목장"), "남성");
  assert.equal(tidyMok("남성 목장"), "남성");
  assert.equal(tidyMok("0"), "0");
  assert.equal(tidyMok("00"), "0");
  assert.equal(tidyMok("0012345678901234567890"), "12345678901234567890");   // 반올림하지 않는다
  assert.equal(tidyMok("20-1"), "20-1");      // 모르는 꼴은 그대로 — 서버가 bad-sub 로 막는다
  assert.equal(tidyMok("이십"), "이십");
  assert.equal(tidyMok(""), "");
  assert.equal(tidyMok(null), "");
  assert.equal(whoText(R({ sub: "20" })), "화평 20목장");
  assert.equal(whoText(R({ group: "소망", sub: "남성" })), "소망 남성");          // 서버 evWho·upload-logic whoText 와 같은 꼴
  assert.equal(whoText(R({ sub: "20목장" })), "화평 20목장");                    // 옛 모양 줄도 「목장목장」이 되지 않게
  assert.equal(whoText(R({ sub: "" })), "화평");
  assert.equal(whoText(R({ who_type: "교회학교", group: "청년부", sub: "" })), "청년부");
  assert.equal(whoText(R({ who_type: "교회학교", group: "중등부", sub: "3학년" })), "중등부 3학년");
  assert.equal(whoText(null), "");
  assert.equal(subText(R({ sub: "20" })), "20목장");
  assert.equal(subText(R({ group: "소망", sub: "남성" })), "남성");
  assert.equal(subText(R({ sub: "" })), "");
  assert.equal(subText(R({ who_type: "교회학교", group: "중등부", sub: "3학년" })), "3학년");
});

test("eventPatch — 바뀐 칸만 · 앞뒤·가운데 빈칸 무시 · list_until 비움(null)과 빈 글은 같다 · needs·id·kind 같은 칸은 버린다", () => {
  const ev = { id: "summer-2026", title: "썸머", short_title: "", subtitle: null, season: "2026-3Q", opens_on: "2026-07-01",
    closes_on: "2026-08-31", status: "closed", list_until: null, needs: { position: true }, updated_at: "x" };
  const v = { title: " 썸머 ", short_title: "", subtitle: "", season: "2026-3Q", opens_on: "2026-07-01",
    closes_on: "2026-08-31", status: "closed", list_until: "" };
  assert.deepEqual(eventPatch(ev, v), {});
  assert.deepEqual(eventPatch(ev, { ...v, status: "open", list_until: "2026-12-31" }), { status: "open", list_until: "2026-12-31" });
  assert.deepEqual(eventPatch({ ...ev, list_until: "2026-12-31" }, v), { list_until: "" });
  assert.deepEqual(eventPatch(ev, { ...v, needs: "x", id: "other", kind: "quiz" }), {});
  assert.deepEqual(eventPatch(ev, { title: "썸머  2026" }), { title: "썸머 2026" });   // 보낸 칸만 · 서버처럼 다듬어
});

test("rowPatch — 바뀐 칸만 · 목장은 바꾼 때만 다듬는다(07 을 그대로 두면 안 보낸다) · 겹빈칸은 같은 값 · keys 로 좁힌다", () => {
  const row = R({ id: 9, group: "화평", sub: "07", name: "홍길동", position: "집사", note: "원래: 화평 30 · 집사" });
  const same = { who_type: "교구", group: "화평", sub: "07", name: " 홍길동 ", position: "집사", note: "원래: 화평 30 · 집사" };
  assert.deepEqual(rowPatch(row, same), {});
  assert.deepEqual(rowPatch(row, { ...same, sub: "8목장" }), { sub: "8" });
  assert.deepEqual(rowPatch(row, { ...same, sub: "7" }), { sub: "7" });
  assert.deepEqual(rowPatch(R({ sub: "7" }), { sub: "7목장" }, ["sub"]), {});   // 다듬으면 옛 값과 같다
  assert.deepEqual(rowPatch(row, { ...same, who_type: "교회학교", group: "청년부", sub: "" }),
    { who_type: "교회학교", group: "청년부", sub: "" });
  assert.deepEqual(rowPatch(row, { ...same, note: "원래: 화평 30 · 집사 / 전화로 확인" }), { note: "원래: 화평 30 · 집사 / 전화로 확인" });
  assert.deepEqual(rowPatch(row, { ...same, name: "홍길순", note: "새 메모" }, ["note"]), { note: "새 메모" });
  assert.deepEqual(rowPatch(R({ note: null }), { note: "" }, ["note"]), {});
  assert.deepEqual(rowPatch(R({ note: "전화로  확인" }), { note: "전화로 확인" }, ["note"]), {});   // 서버도 한 줄로 저장한다
  assert.deepEqual(rowPatch(R({ name: "홍  길동" }), { name: "홍 길동" }, ["name"]), {});
});
```

- [ ] **Step 2: 돌려서 실패하는지 본다**

```bash
node --experimental-strip-types --test tests/be-roster-logic.test.mjs
```
Expected: FAIL — `Cannot find module '…/js/menus/bibleevent/roster-logic.js'`(`ERR_MODULE_NOT_FOUND`) · `# fail 1`.

- [ ] **Step 3: `js/menus/bibleevent/roster-logic.js` 구현**

```js
// 📋 회차·명단 — 화면 논리(순수 함수). tests/be-roster-logic.test.mjs 가 같은 파일을 읽는다(DOM·import 없음).
// 서버 규칙(supabase/functions/church-admin/events-rules.ts)과 겹치는 표는 시험이 서버 것과 같은지 본다 —
//   GU_ORDER = BE_GU · EV_STATUS = EVT_STATUS · EV_EDIT_KEYS = EV_EDIT_KEYS(Task 6). 브라우저는 .ts 를 못 읽어 한 벌 더 둔다.
// ⚠️ 줄·회차 **검사는 서버 한 곳**(events-rules.ts checkRow·checkEvent)이다. 화면은 판정표를 따로 두지 않고, 서버가
//    돌려준 코드를 입력 창 안 빨간 줄(ui.js MESSAGES)로 보인다 — 서버는 「화평교구」·「07」·「유년」을 다듬어 받는데,
//    화면에 판정표를 한 벌 더 두면 언젠가 화면이 서버보다 엄해져 받을 수 있는 줄을 막는다.

export const GU_ORDER = ["믿음", "소망", "사랑", "섬김", "은혜", "화평", "기쁨", "새가족"];
// 성경암송 앱의 명단 화면(api index.ts eventRosterPublic 의 EVT_BU_ORDER)과 같은 차례 — 목록에 없는 부서(소년2부 등)는 그 뒤에
export const BU_ORDER = ["사랑부", "영아부", "유아부", "유치부", "유년부", "초등부", "중등부", "고등부", "청년부"];
export const EV_STATUS = ["draft", "open", "closed", "archived"];
export const STATUS_KO = { draft: "준비 중", open: "열림", closed: "마감", archived: "보관" };
export const STATUS_HINT = {
  draft: "성도님께 안 보여요",
  open: "기간 안에서 등록을 받고 명단이 보여요",
  closed: "등록은 막고 명단은 보여요",
  archived: "성도님 목록에서 사라져요",
};
export const SRC_LABEL = { app: "📱 앱", import: "📋 이관" };
const SRC_TEXT = { app: "앱", import: "이관" };
export const CHURCH_STATES = ["맞음", "확인 필요", "없음"];
export const EV_EDIT_KEYS = ["title", "short_title", "subtitle", "season", "opens_on", "closes_on", "status", "list_until"];
export const ROW_KEYS = ["who_type", "group", "sub", "name", "position", "note"];
// 담당자 메모 창의 글자 수 상한 — 서버는 머리 표기(「담당자가 더함 / 」 10자)를 붙인 **뒤** 500자로 센다(계약 §5)
export const NOTE_FORM_MAX = 480;

const byKo = (a, b) => String(a).localeCompare(String(b), "ko");
const byCode = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
// 서버 legacyNorm 과 같다 — 앞뒤 빈칸 떼고 가운데 빈칸(줄바꿈 포함)은 하나로. 메모도 서버가 한 줄로 저장한다
export const norm = (v) => String(v ?? "").trim().replace(/\s+/g, " ");
const nfc = (v) => String(v ?? "").normalize("NFC");
const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);

// 목장 칸 다듬기 — 서버 events-rules.ts tidyRow 의 목장 규칙과 같다(Task 2 시험과 같은 보기):
// 「20목장」·「20 목장」→「20」 · 「07」→「7」 · 「00」→「0」 · 「남성목장」→「남성」. 그 밖의 꼴(「이십」)은 그대로 — 서버가 bad-sub 로 막는다.
// (Number() 로 바꾸지 않는다 — 긴 숫자도 앞 0 만 뗀다)
export function tidyMok(v) {
  const s = norm(nfc(v));
  const t = s.replace(/\s+/g, "");
  if (/^남성(목장)?$/.test(t)) return "남성";
  const m = /^(\d+)(목장)?$/.exec(t);
  return m ? m[1].replace(/^0+(?=\d)/, "") : s;
}

// 숫자 목장만 「목장」을 붙인다 — 서버 evWho(Task 5)·upload-logic.js whoText(Task 11)와 같은 꼴(세 메뉴가 같게 읽히게)
const mokWord = (s) => (/^\d+$/.test(s) ? s + "목장" : s);
// 「화평 20목장」·「소망 남성」·「청년부」·「중등부 3학년」
export function whoText(r) {
  const g = norm(r?.group), s = norm(r?.sub);
  if (r?.who_type === "교구") return [g, s ? mokWord(s) : ""].filter(Boolean).join(" ");
  return [g, s].filter(Boolean).join(" ");
}
// 묶음 안에서 — 묶음 이름(교구·부서)은 머리에 있으니 세부만: 「20목장」·「남성」·「3학년」·""
export function subText(r) {
  const s = norm(r?.sub);
  if (!s) return "";
  return r?.who_type === "교구" ? mokWord(s) : s;
}

export const groupKey = (r) => `${norm(r?.who_type)}|${norm(r?.group)}`;
function groupRank(type, group) {
  const list = type === "교구" ? GU_ORDER : type === "교회학교" ? BU_ORDER : [];
  const i = list.indexOf(group);
  return (type === "교구" ? 0 : type === "교회학교" ? 1000 : 2000) + (i < 0 ? 900 : i);
}
// 목장은 글자다 — 숫자는 숫자로, 숫자 아닌 것(빈칸·남성)은 뒤로(앱 evtSubRank 와 같게)
function subRank(v) {
  const s = norm(v);
  return /^\d+$/.test(s) ? [0, parseInt(s, 10), s] : [1, 0, s];
}
function rowOrder(a, b) {
  const [t1, n1, s1] = subRank(a.sub), [t2, n2, s2] = subRank(b.sub);
  return t1 - t2 || n1 - n2 || byCode(s1, s2) || byKo(a.name, b.name) || (Number(a.id) - Number(b.id) || 0);
}

// 명단을 교구·부서로 묶는다 — 성도님 앱 명단(eventRosterPublic)과 같은 차례:
// 교구(앱 차례) → 모르는 교구 → 교회학교(앱 차례) → 모르는 부서(가나다) → 구분 없음. 안에서는 목장 숫자 → 숫자 아닌 것 → 이름
export function groupRows(rows) {
  const bag = new Map();
  for (const r of rows || []) {
    const k = groupKey(r);
    if (!bag.has(k)) bag.set(k, { key: k, label: norm(r.group) || "소속 없음", rank: groupRank(norm(r.who_type), norm(r.group)), rows: [] });
    bag.get(k).rows.push(r);
  }
  return [...bag.values()]
    .sort((a, b) => a.rank - b.rank || byKo(a.label, b.label))
    .map((g) => ({ key: g.key, label: g.label, rows: [...g.rows].sort(rowOrder) }));
}

// 거르기 — groups(groupKey) · positions("" = 직분 없음) 는 비면 전체, church·source 는 "" 면 전체, q 는 이름·소속·직분
export const blankFilter = () => ({ groups: [], positions: [], church: "", source: "", q: "" });
export const filterActive = (f) => !!f && ((f.groups || []).length > 0 || (f.positions || []).length > 0
  || !!f.church || !!f.source || !!norm(f.q));
export function filterRows(rows, f) {
  const groups = new Set(f.groups || []);
  const pos = new Set((f.positions || []).map(norm));
  const q = nfc(norm(f.q));
  return (rows || []).filter((r) => {
    if (groups.size && !groups.has(groupKey(r))) return false;
    if (pos.size && !pos.has(norm(r.position))) return false;
    if (f.church && (!r.church || r.church.state !== f.church)) return false;
    if (f.source && r.source !== f.source) return false;
    if (q && !nfc([r.name, r.group, r.sub, whoText(r), r.position].join(" ")).includes(q)) return false;
    return true;
  });
}

// 「중복일 수 있음」 — 같은 이름·같은 소속 줄이 둘 이상(설계 §1 ⚠️ 동시에 두 분이 같은 분을 더한 경우).
// ⚠️ 명단 **전체**로 센다 — 거르기로 한쪽이 가려져도 표시는 남는다.
const nameKey = (v) => nfc(v).replace(/\s+/g, "");
export function dupFlags(rows) {
  const by = new Map();
  for (const r of rows || []) {
    const n = nameKey(r.name);
    if (!n) continue;
    const k = [norm(r.who_type), nfc(norm(r.group)), tidyMok(r.sub), n].join("|");
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(r.id);
  }
  const out = new Set();
  for (const ids of by.values()) if (ids.length > 1) ids.forEach((id) => out.add(id));
  return out;
}

// 직분 거르기 목록 — [직분, 수] 많은 차례, 같으면 가나다, 빈 직분(「직분 없음」)은 뒤
export function positionCounts(rows) {
  const m = new Map();
  for (const r of rows || []) { const p = norm(r.position); m.set(p, (m.get(p) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1] || (a[0] === "") - (b[0] === "") || byKo(a[0], b[0]));
}

// 내려받기 — 엑셀에서 바로 열리게(BOM · \r\n). **받은 차례 그대로**(화면에 보이는 차례를 부르는 쪽이 넘긴다). 메모는 싣지 않는다.
// = + - @ 로 시작하는 칸은 앞에 ' — 엑셀이 수식으로 읽지 않게.
const cell = (v) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
};
export function csvText(rows) {
  const head = ["이름", "구분", "소속", "세부", "직분", "출처", "교적"];
  const body = (rows || []).map((r) => [r.name, r.who_type, r.group, r.sub, r.position, SRC_TEXT[r.source] || r.source || "",
    r.church ? [r.church.state, r.church.reason].filter(Boolean).join(" · ") : ""]);
  return "﻿" + [head, ...body].map((row) => row.map(cell).join(",")).join("\r\n");
}

// 회차 칩 — 시작일 최근 먼저, 같으면 id 거꾸로
export function sortEvents(list) {
  return [...(list || [])].sort((a, b) => byCode(norm(b.opens_on), norm(a.opens_on)) || byCode(norm(b.id), norm(a.id)));
}

// 회차 설정 — 바뀐 칸만(서버 evEventSave 는 보낸 칸만 바꾼다). list_until 은 null 과 "" 가 같다(비움 — 서버가 null 로)
// needs·copy·kind·id 같은 칸은 EV_EDIT_KEYS 에 없어 보내지 않는다 — 자격 규칙·문구가 조용히 지워지지 않게.
export function eventPatch(before, v) {
  const out = {};
  for (const k of EV_EDIT_KEYS) {
    if (!own(v, k)) continue;
    const a = norm(before?.[k]), b = norm(v[k]);
    if (a !== b) out[k] = b;
  }
  return out;
}

// 줄 고치기 — 바뀐 칸만(서버는 앱 줄·자격 회차의 줄에 메모 밖 칸이 **오기만 해도** app-row-note-only 로 막는다).
// 서버와 같이 앞뒤·가운데 빈칸을 다듬어 견준다(옛 줄의 겹빈칸 때문에 안 바꾼 칸이 가지 않게).
// 교구 목장은 **바꾼 때만** 다듬어 보낸다(tidyMok) — 옛 「07」을 그대로 두면 안 보낸다. keys — 메모만 고치는 줄은 ["note"].
export function rowPatch(before, v, keys = ROW_KEYS) {
  const out = {};
  const type = norm(own(v, "who_type") ? v.who_type : before?.who_type);
  for (const k of keys) {
    if (!own(v, k)) continue;
    const a = norm(before?.[k]), b = norm(v[k]);
    if (a === b) continue;
    out[k] = k === "sub" && type === "교구" ? tidyMok(b) : b;
  }
  // 다듬은 뒤 옛 값과 같아지면(옛 「7」 → 새 「7목장」) 바뀐 것이 아니다
  if (own(out, "sub") && !own(out, "who_type") && out.sub === norm(before?.sub)) delete out.sub;
  return out;
}
```

- [ ] **Step 4: 돌려서 통과하는지 본다**

```bash
node --experimental-strip-types --test tests/be-roster-logic.test.mjs
```
Expected: PASS — `# pass 11` · `# fail 0`.

- [ ] **Step 5: 오류 문구의 실패하는 시험 더하기** — `tests/ui.test.mjs` 끝에 이어 붙인다

```bash
cat >> tests/ui.test.mjs <<'EOF'

test("성경필사(암송) 오류 코드 — 모두 한국말(「처리하지 못했어요」로 새지 않게 · 설계 §6)", () => {
  const codes = ["not-found", "conflict", "already", "app-row-note-only", "app-row", "eligibility-event", "needs-confirm",
    "exists", "bad-event-id", "no-title", "bad-period", "period-reversed", "bad-status", "bad-list-until",
    "list-until-before-close", "before-eligibility", "bad-char", "too-long", "bad-type", "no-name", "bad-group",
    "no-group", "bad-sub", "note-too-long", "too-many"];
  for (const c of codes) assert.notEqual(errorText({ error: c }), "처리하지 못했어요", c);
  // 사역 취소 사유와 이 메뉴의 담당자 메모가 같은 코드를 쓴다 — 한 문장이 둘 다에 맞게
  assert.equal(errorText({ error: "note-too-long" }), "메모·사유는 500자까지 적을 수 있어요");
  // 서버 checkRow 는 교구 줄에도 no-group 을 준다(소속이 비면) — 「부서」만 말하지 않는다
  assert.match(errorText({ error: "no-group" }), /교구/);
});
EOF
node --experimental-strip-types --test tests/ui.test.mjs
```
Expected: FAIL — `not ok 6 - 성경필사(암송) 오류 코드 …`(`already` 에서 `처리하지 못했어요`) · `# pass 5` · `# fail 1`(main `a2dfd7c` 의 ui 시험은 다섯 — main 이 움직였으면 앞 수는 달라도 되고, 실패가 이 시험 하나면 된다).

- [ ] **Step 6: `js/core/ui.js` MESSAGES 더하기** — Edit 도구로 두 곳

① 앵커 줄 `  "note-too-long": "사유는 500자까지 적을 수 있어요",` 를 이 한 줄로 바꾼다(사역 취소 사유와 담당자 메모가 같은 코드):

```js
  "note-too-long": "메모·사유는 500자까지 적을 수 있어요",
```

② 앵커 줄 `  "last-super": "총괄 관리자가 한 분은 남아 있어야 해요",` 를 아래로 바꾼다(그 줄은 그대로 두고 **바로 다음에** 주석 한 줄과 코드 스무 줄 — 그 뒤가 원래의 `};`):

```js
  "last-super": "총괄 관리자가 한 분은 남아 있어야 해요",
  // 성경필사(암송) — 2026-09-29 설계 §6 오류 코드(not-found·conflict·bad-char·too-long·note-too-long 은 위에 있다)
  already: "이 회차에 같은 분이 이미 있어요",
  "app-row-note-only": "앱에서 낸 신청(또는 자격 회차의 줄)은 메모만 고칠 수 있어요",
  "app-row": "앱에서 낸 신청은 뺄 수 없어요 — 성도님이 앱에서 취소해요",
  "eligibility-event": "자격 회차(가을 말씀 동행 같은)의 명단은 더하기·올리기·빼기를 하지 않아요 — 메모만 고칠 수 있어요",
  "needs-confirm": "성도님께 보이게 하려면 한 번 더 확인해 주세요",
  exists: "같은 회차 ID 가 이미 있어요 — 다른 ID 를 적어 주세요",
  "bad-event-id": "회차 ID 는 영문 소문자·숫자·붙임표(-)로, 소문자나 숫자로 시작해 2~41자예요 (예: summer-2027)",
  "no-title": "회차 이름을 적어 주세요",
  "bad-period": "기간(시작일·마감일)을 골라 주세요",
  "period-reversed": "마감일이 시작일보다 앞서요",
  "bad-status": "상태를 다시 골라 주세요",
  "bad-list-until": "명단 공개 종료일을 다시 골라 주세요",
  "list-until-before-close": "명단 공개 종료일이 등록 마감일보다 앞서요",
  "before-eligibility": "자격 회차는 자격 측정 시작일보다 먼저 열 수 없어요",
  "bad-type": "구분(교구·교회학교)을 골라 주세요",
  "no-name": "이름을 적어 주세요",
  "bad-group": "교구를 골라 주세요 (믿음·소망·사랑·섬김·은혜·화평·기쁨·새가족)",
  "no-group": "소속(교구 또는 부서)을 적어 주세요",
  "bad-sub": "목장은 숫자나 「남성」으로 적어 주세요 (모르면 비워 두기)",
  "too-many": "한 번에 600줄까지 올릴 수 있어요 — 나눠서 올려 주세요",
```

```bash
node --experimental-strip-types --test tests/ui.test.mjs tests/modal.test.mjs
node --check js/core/ui.js && echo "문법 통과"
grep -c '사유는 500자까지' js/core/ui.js
```
Expected: PASS — `# pass 11`(ui 6 + modal 5 · a2dfd7c 기준) · `# fail 0` · `문법 통과` · `1`(바뀐 문장 하나만 — 옛 문장이 남아 두 줄이 되지 않았다).

- [ ] **Step 7: 커밋 — 논리·문구**

```bash
git add js/menus/bibleevent/roster-logic.js tests/be-roster-logic.test.mjs js/core/ui.js tests/ui.test.mjs
git status --short
git commit -m "feat(성경필사): 회차·명단 순수 논리 — 앱 명단과 같은 묶음 차례 · 거르기 · 중복일 수 있음 · 보이는 줄 CSV · 바뀐 칸만 보내기(검사는 서버 한 곳) · 오류 문구 스무 개" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
Expected: `git status --short` 에 이 네 파일만 스테이징돼 있다.

- [ ] **Step 8: HTML 조각의 실패하는 시험 쓰기** — `tests/be-roster-ui.test.mjs`(새 파일)

```js
// 📋 회차·명단의 HTML 조각(js/menus/bibleevent/roster-ui.js) — 글자는 모두 esc 되는가 · 앱 줄·자격 회차의 줄 메뉴 ·
// 칩·요약 줄. 창을 여닫는 동작은 브라우저에서 본다(Task 10 Step 16). 이름은 가짜(홍길동 …)만.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chipsHtml, headHtml, settingsHtml, sourceHtml, filtersHtml, sumHtml, cardHtml, tableHtml, listHtml, rowMenuOptions,
  ELIG_LINE } from "../js/menus/bibleevent/roster-ui.js";
import { blankFilter } from "../js/menus/bibleevent/roster-logic.js";

const EV = { id: "ca-test-x", title: "시험 <회차>", short_title: "", subtitle: "", season: "", status: "draft", opens_on: "2026-10-01",
  closes_on: "2026-10-31", list_until: null, count: 1234, listedNow: false, hasEligibility: false, updated_at: "u" };
const ROW = { id: 7, who_type: "교구", group: "화평", sub: "20", name: "홍<길동>", position: "집사", note: "원래: <b>", source: "import",
  hasUser: false, at: "2026-10-01", updated_at: "u", church: { state: "확인 필요", reason: "소속 <다름>" } };

test("chipsHtml — 고른 칩 · 인원(천 단위) · 상태 · 👁 는 성도님께 보일 때만 · 끝에 「＋ 새 회차」 · 글자는 esc", () => {
  const h = chipsHtml([EV, { ...EV, id: "b", short_title: "짧은", listedNow: true, status: "open" }], "ca-test-x");
  assert.match(h, /data-ev="ca-test-x" aria-pressed="true"/);
  assert.match(h, /data-ev="b" aria-pressed="false"/);
  assert.ok(h.includes("시험 &lt;회차&gt;") && !h.includes("<회차>"));
  assert.ok(h.includes("<em>1,234</em>"));
  assert.equal((h.match(/👁/g) || []).length, 1);
  assert.ok(h.includes("짧은") && h.includes("준비 중") && h.includes("열림"));
  assert.ok(h.endsWith(`<button type="button" class="be-ev new" data-act="new">＋ 새 회차</button>`));
});

test("headHtml · settingsHtml — 공개 여부 · 자격 회차 표 · 공개 종료일이 비면 경고", () => {
  assert.ok(headHtml(EV).includes("성도님께 안 보임"));
  assert.ok(headHtml({ ...EV, listedNow: true }).includes("👁 성도님께 보임"));
  assert.ok(headHtml({ ...EV, hasEligibility: true }).includes("🔒 자격 회차"));
  const s = settingsHtml(EV, false);
  assert.ok(!s.includes(" open>"));
  assert.ok(s.includes("비움 — 기한 없이 보여요") && s.includes("be-warn"));
  assert.ok(s.includes("「준비 중」이라서예요"));
  assert.ok(!settingsHtml({ ...EV, list_until: "2026-12-31" }, true).includes("be-warn"));
  assert.ok(settingsHtml(EV, true).includes('<details class="be-set" open>'));
  assert.ok(ELIG_LINE.includes("자격 규칙은 여기서 바꾸지 않습니다 · 이 회차는 한 분 더하기·올리기를 하지 않습니다(가을 설계 §12)"));
});

test("sourceHtml · sumHtml · filtersHtml", () => {
  assert.ok(sourceHtml({ date: "2026-09-29", total: 8672 }).includes("8,672명"));
  assert.ok(sourceHtml(null).includes("교인명부가 아직 없어"));
  assert.equal(sumHtml(10, 10, 0, ""), "명단 <b>10</b>명");
  assert.equal(sumHtml(10, 3, 2, " <춘향> "), "명단 <b>10</b>명 · 보이는 줄 <b>3</b> · ⚠️ 중복일 수 있음 <b>2</b>줄 · ‘&lt;춘향&gt;’로 찾은 것");
  const labels = new Map([["교구|화평", "화평"], ["교구|믿음", "믿음"]]);
  const off = filtersHtml(blankFilter(), { labels, church: false });
  assert.ok(!off.includes('data-filter="church"') && !off.includes('data-act="clear"'));
  const on = filtersHtml({ ...blankFilter(), groups: ["교구|화평", "교구|믿음"], church: "없음" }, { labels, church: true });
  assert.ok(on.includes("<b>화평 외 1</b>") && on.includes("<b>교적 없음</b>") && on.includes('data-act="clear"'));
});

test("cardHtml · tableHtml · listHtml — 이름·메모·교적 까닭까지 esc · 메모는 있을 때만 · 중복 표시", () => {
  const c = cardHtml(ROW, true);
  assert.ok(c.includes("홍&lt;길동&gt;") && c.includes("원래: &lt;b&gt;") && c.includes("소속 &lt;다름&gt;"));
  assert.ok(!c.includes("<길동>") && !c.includes("<다름>"));
  assert.ok(c.includes("20목장") && c.includes("⚠️ 중복일 수 있음") && c.includes('class="be-row dup"'));
  assert.ok(!cardHtml({ ...ROW, note: "" }, false).includes("be-memo"));
  const g = [{ key: "교구|화평", label: "화평", rows: [ROW] }];
  const t = tableHtml(g, new Set([7]));
  assert.equal((t.match(/<th>/g) || []).length, 7);
  assert.ok(t.includes('<tr class="dup">') && t.includes('colspan="7"'));
  assert.ok(listHtml([], new Set(), false).includes("조건에 맞는 줄이 없어요"));
  assert.ok(listHtml(g, new Set(), true).includes("be-table"));
  assert.ok(listHtml(g, new Set(), false).includes("be-grp"));
});

test("rowMenuOptions — 앱 줄·자격 회차의 줄은 「메모 고치기」 하나(빼기 없음) · 이관 줄은 고치기·빼기", () => {
  assert.deepEqual(rowMenuOptions({ ...ROW, source: "app" }, EV).map((o) => o.value), ["edit"]);
  assert.deepEqual(rowMenuOptions(ROW, { ...EV, hasEligibility: true }).map((o) => o.value), ["edit"]);
  assert.deepEqual(rowMenuOptions(ROW, EV).map((o) => o.value), ["edit", "del"]);
});
```

```bash
node --experimental-strip-types --test tests/be-roster-ui.test.mjs
```
Expected: FAIL — `Cannot find module '…/js/menus/bibleevent/roster-ui.js'` · `# fail 1`.

- [ ] **Step 9: `js/menus/bibleevent/roster-ui.js` — HTML 조각**

```js
// 📋 회차·명단 — 화면 조각(HTML 만드는 함수 · Node 시험 tests/be-roster-ui.test.mjs). 논리는 roster-logic.js.
// ⚠️ 사람·서버 글자는 모두 esc — 이 파일이 만든 글이 그대로 innerHTML 로 들어간다.
// ⚠️ 줄 메뉴는 드롭다운을 직접 그리지 않고 picker.js pickOne 으로 연다(폰은 아래 판) — PC 표를 overflow-x 로 감싸도 잘리지 않는다.
import { esc } from "../../core/ui.js";
import { churchBadgeHtml } from "../people/church-badge.js";
import { STATUS_KO, SRC_LABEL, subText, filterActive } from "./roster-logic.js";

export const TITLE = `<h2 class="page-title">📋 회차·명단</h2>`;
// 설계 §3 문장 그대로(가운데) — Task 14 점검표가 이 글을 찾는다
export const ELIG_LINE = `<p class="be-note">🔒 자격 회차예요 — 자격 규칙은 여기서 바꾸지 않습니다 · 이 회차는 한 분 더하기·올리기를 하지 않습니다(가을 설계 §12) · 줄은 메모만 고쳐요</p>`;
export const UNTIL_WARN = "⚠️ 명단 공개 종료일을 비우면 명단이 기한 없이 보여요 — 개인정보 안내는 정해진 날까지만 보인다고 약속합니다";
const UNTIL_EMPTY = "⚠️ 명단 공개 종료일이 비어 있어 명단이 기한 없이 보여요 — 개인정보 안내는 정해진 날까지만 보인다고 약속합니다";
export const CHURCH_LABEL = { "맞음": "교적 ✓ 맞음", "확인 필요": "교적 확인 필요", "없음": "교적 없음" };

const num = (x) => Number(x || 0).toLocaleString("ko-KR");
const dot = (d) => String(d || "").replace(/-/g, ".");
export const periodText = (ev) => `${dot(ev.opens_on)} ~ ${dot(ev.closes_on)}`;
const stText = (s) => STATUS_KO[s] || s || "";

// 회차 칩 — 최근 먼저(부르는 쪽이 sortEvents) · 짧은 이름 · 인원 · 상태 · 성도님께 보임(👁) · 끝에 「＋ 새 회차」
export function chipsHtml(events, curId) {
  return events.map((e) => {
    const on = e.id === curId;
    return `<button type="button" class="be-ev${on ? " on" : ""}" data-ev="${esc(e.id)}" aria-pressed="${on}" title="${esc(e.title)}">` +
      (e.listedNow ? `<span aria-hidden="true">👁</span><span class="be-sr">성도님께 보임,</span>` : "") +
      `${esc(e.short_title || e.title)} <em>${num(e.count)}</em><span class="be-sr">명,</span><small>${esc(stText(e.status))}</small></button>`;
  }).join("") + `<button type="button" class="be-ev new" data-act="new">＋ 새 회차</button>`;
}

// 붙는 머리 — 「지금 무엇을 보고 있나」만
export function headHtml(ev) {
  return `<div class="be-head-t"><b>${esc(ev.title)}</b></div><div class="be-tags">` +
    `<span class="be-tag st-${esc(ev.status)}">${esc(stText(ev.status))}</span>` +
    `<span class="be-tag${ev.listedNow ? " seen" : ""}">${ev.listedNow ? "👁 성도님께 보임" : "성도님께 안 보임"}</span>` +
    `<span class="be-tag">📅 ${esc(periodText(ev))}</span>` +
    (ev.hasEligibility ? `<span class="be-tag">🔒 자격 회차</span>` : "") + `</div>`;
}

function listedLine(ev) {
  if (ev.listedNow) return `<p class="be-note">👁 지금 성도님께 보여요 — 명단(이름·소속·직분)이 로그인 없이 보입니다</p>`;
  const why = ev.status === "draft" ? "상태가 「준비 중」이라서예요 — 「열림」이나 「마감」으로 바꾸면 보여요"
    : ev.status === "archived" ? "상태가 「보관」이라서예요"
    : "명단 공개 종료일이 지나서예요 — 날짜를 미루면 다시 보여요";
  return `<p class="be-note">지금 성도님께 안 보여요 — ${why}</p>`;
}

// ⚙️ 회차 설정 — 접힌 칸. 지금 값을 보여 주고, 고치기는 창(event-form.js)으로
export function settingsHtml(ev, open) {
  const kv = [["회차 ID", ev.id], ["이름", ev.title], ["짧은 이름", ev.short_title || "비움 — 이름을 그대로 써요"],
    ["부제", ev.subtitle || "—"], ["묶음", ev.season || "—"], ["기간", periodText(ev)], ["상태", stText(ev.status)],
    ["명단 공개 종료일", ev.list_until ? dot(ev.list_until) : "비움 — 기한 없이 보여요"]];
  return `<details class="be-set"${open ? " open" : ""}><summary>⚙️ 회차 설정</summary><div class="be-set-b">` +
    `<dl class="be-kv">${kv.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` +
    listedLine(ev) + (ev.list_until ? "" : `<p class="be-warn">${esc(UNTIL_EMPTY)}</p>`) +
    `<button type="button" class="btn wide" data-act="set">✏️ 회차 설정 고치기</button></div></details>`;
}

export function sourceHtml(src) {
  return src ? `<p class="muted be-srcline">교적 표시는 교인명부 ${esc(src.date)} 기준(${num(src.total)}명)이에요</p>`
    : `<p class="muted be-srcline">교인명부가 아직 없어 교적 표시를 하지 않아요</p>`;
}

// 거르기 칩 — 누르면 고르개(교구·부서·직분 = 여러 개, 교적·출처 = 하나)
const sumOf = (vals, lab) => (!vals.length ? "전체" : lab(vals[0]) + (vals.length > 1 ? ` 외 ${vals.length - 1}` : ""));
const fchip = (k, name, val, on) => `<button type="button" class="be-fchip${on ? " on" : ""}" data-filter="${k}" aria-haspopup="dialog" aria-expanded="false">` +
  `${esc(name)} <b>${esc(val)}</b><span class="pk-field-x" aria-hidden="true"></span></button>`;
export function filtersHtml(f, { labels, church }) {
  return fchip("group", "교구·부서", sumOf(f.groups, (k) => labels.get(k) || k.split("|")[1] || "소속 없음"), f.groups.length > 0) +
    fchip("pos", "직분", sumOf(f.positions, (p) => p || "직분 없음"), f.positions.length > 0) +
    (church ? fchip("church", "교적", f.church ? CHURCH_LABEL[f.church] || f.church : "전체", !!f.church) : "") +
    fchip("src", "출처", f.source ? SRC_LABEL[f.source] || f.source : "전체", !!f.source) +
    (filterActive(f) ? `<button type="button" class="be-fchip clear" data-act="clear">✕ 거르기 풀기</button>` : "");
}

export function sumHtml(total, shown, dupN, q) {
  const s = String(q || "").trim();
  return `명단 <b>${num(total)}</b>명` + (shown !== total ? ` · 보이는 줄 <b>${num(shown)}</b>` : "") +
    (dupN ? ` · ⚠️ 중복일 수 있음 <b>${num(dupN)}</b>줄` : "") + (s ? ` · ‘${esc(s)}’로 찾은 것` : "");
}

const posHtml = (r) => (r.position ? `<em class="be-pos">${esc(r.position)}</em>` : "");
const srcHtml = (r) => `<em class="be-src${r.source === "app" ? " app" : ""}">${esc(SRC_LABEL[r.source] || r.source || "")}</em>`;
const userHtml = (r) => (r.hasUser ? `<em class="be-user" title="앱 계정과 이어진 줄">🔗 앱 계정</em>` : "");
const dupHtml = (on) => (on ? `<em class="be-dup" title="같은 이름·같은 소속 줄이 또 있어요">⚠️ 중복일 수 있음</em>` : "");
const moreHtml = (r) => `<button type="button" class="be-more" data-act="row" data-id="${esc(r.id)}" aria-label="${esc(r.name)}님 줄 — 고치기·빼기">⋯</button>`;

// 폰 — 줄 하나 = 카드 하나
export function cardHtml(r, dup) {
  const sub = subText(r);
  return `<div class="be-row${dup ? " dup" : ""}"><div class="be-row-h"><div class="be-row-nm">` +
    `<b>${esc(r.name)}</b>${posHtml(r)}${sub ? `<span class="be-row-sub">${esc(sub)}</span>` : ""}` +
    `<span class="be-badges">${srcHtml(r)}${userHtml(r)}${churchBadgeHtml(r.church)}${dupHtml(dup)}</span></div>${moreHtml(r)}</div>` +
    (r.note ? `<div class="be-memo">📝 ${esc(r.note)} <i>(담당자만 봄)</i></div>` : "") + `</div>`;
}

// PC(≥1024px) — 한 표, 묶음마다 머리 줄
export function tableHtml(groups, dups) {
  const head = `<tr><th>이름</th><th>소속</th><th>직분</th><th>출처</th><th>교적</th><th>담당자 메모</th><th><span class="be-sr">고치기·빼기</span></th></tr>`;
  const body = groups.map((g) => `<tbody><tr class="be-tgrp"><th colspan="7" scope="colgroup">${esc(g.label)} <em>${num(g.rows.length)}명</em></th></tr>` +
    g.rows.map((r) => `<tr${dups.has(r.id) ? ` class="dup"` : ""}><td><b>${esc(r.name)}</b> ${dupHtml(dups.has(r.id))}</td>` +
      `<td>${esc(subText(r))}</td><td>${esc(r.position || "")}</td><td>${srcHtml(r)} ${userHtml(r)}</td>` +
      `<td>${churchBadgeHtml(r.church)}</td><td class="be-tnote">${esc(r.note || "")}</td><td>${moreHtml(r)}</td></tr>`).join("") +
    `</tbody>`).join("");
  return `<div class="be-tbl-wrap"><table class="be-table"><thead>${head}</thead>${body}</table></div>`;
}

export function listHtml(groups, dups, wide) {
  if (!groups.length) return `<p class="empty">조건에 맞는 줄이 없어요</p>`;
  if (wide) return tableHtml(groups, dups);
  return groups.map((g) => `<section class="be-grp" aria-label="${esc(g.label)}"><h3 class="be-grp-h">${esc(g.label)} <em>${num(g.rows.length)}명</em></h3>` +
    g.rows.map((r) => cardHtml(r, dups.has(r.id))).join("") + `</section>`).join("");
}

// 줄 메뉴(pickOne) — 앱 줄·자격 회차의 줄은 메모만, 빼기 없음(설계 §0·§3 · 서버도 app-row-note-only·app-row·eligibility-event 로 막는다)
export function rowMenuOptions(r, ev) {
  if (r.source === "app") return [{ value: "edit", label: "📝 메모 고치기", hint: "성도님이 앱에서 낸 신청이라 메모만 고칠 수 있어요 · 빼기는 성도님이 앱에서 해요" }];
  if (ev.hasEligibility) return [{ value: "edit", label: "📝 메모 고치기", hint: "자격 회차의 줄이라 메모만 고칠 수 있어요" }];
  return [{ value: "edit", label: "✏️ 고치기", hint: "이름·소속·직분·메모" },
    { value: "del", label: "🗑 빼기", hint: "한 번 더 확인한 뒤 빠져요" }];
}
```

```bash
node --experimental-strip-types --test tests/be-roster-ui.test.mjs
node --check js/menus/bibleevent/roster-ui.js && echo "문법 통과"
```
Expected: PASS — `# pass 5` · `# fail 0` · `문법 통과`.

- [ ] **Step 10: `js/menus/bibleevent/event-form.js` — 새 회차 · 회차 설정 창**

```js
// 회차 만들기 · 회차 설정 고치기 — 직접 만든 창(js/core/modal.js openForm). 설계 §2 evEventCreate·evEventSave · §3 「회차 설정」.
// ⚠️ 새 회차는 「준비 중」(draft)으로만 만든다 — 상태 칸이 없다(서버도 draft 로 고정). 공개는 만든 뒤 설정에서.
// ⚠️ 고치기는 **바뀐 칸만** 보낸다(eventPatch). needs·copy·kind 는 보내지 않는다 — 자격 규칙·문구가 조용히 지워지지 않게.
// ⚠️ 검사는 서버가 한다(checkEvent — 공개 확인보다 먼저). 틀리면 창 안 빨간 줄로 보이고 창은 그대로다.
// ⚠️ 저장하면 성도님께 보이게 되는 경우 서버는 아무것도 쓰지 않고 needs-confirm 을 돌려준다 → 확인 창(ui.js dialog)에서
//    「보이게 하기」를 누를 때만 confirmListed:true 로 다시 보낸다.
// ⚠️ 날짜·상태는 시스템 칸(<input type=date>·<select>)이 아니라 picker.js 고르개(pickDate·pickOne)로.
// ⚠️ 다른 분이 먼저 바꿨으면(conflict·not-found) 창을 닫지 않고 창 안에 알린다(친 글을 옮겨 적을 수 있게) —
//    창이 닫히면 onStale(code) 로 부른 쪽이 새로 불러온다.
import { esc, dialog } from "../../core/ui.js";
import { openForm } from "../../core/modal.js";
import { pickDate, pickOne, fmtDateLabel } from "../../core/picker.js";
import { EV_STATUS, STATUS_KO, STATUS_HINT, norm, eventPatch } from "./roster-logic.js";
import { ELIG_LINE, UNTIL_WARN } from "./roster-ui.js";

const CONFIRM_TEXT = "이 회차가 성도님 첫 화면에 나타납니다 — 명단(이름·소속·직분)이 로그인 없이 보여요";
const STALE = {
  conflict: "다른 분이 먼저 이 회차를 바꿨어요 — 적으신 것을 적어 두고 「닫기」를 누르면 새로 불러올게요",
  "not-found": "이 회차를 찾지 못했어요 — 「닫기」를 누르면 새로 불러올게요",
};
const DATE_TITLE = { opens_on: "기간 — 시작일", closes_on: "기간 — 마감일", list_until: "명단 공개 종료일" };
const DATE_NONE = { opens_on: "시작일 고르기", closes_on: "마감일 고르기", list_until: "비움 — 기한 없음" };
const dateText = (k, v) => (v ? `${v.slice(0, 4)}년 ${fmtDateLabel(v)}` : DATE_NONE[k]);

const textField = (k, label, hint, v, attrs) => `<label class="field"><span>${esc(label)}${hint ? ` <small>(${esc(hint)})</small>` : ""}</span>` +
  `<input data-f="${k}" value="${esc(v)}" autocomplete="off" ${attrs}></label>`;
const dateField = (k, v) => `<div class="field"><span>${esc(DATE_TITLE[k])}</span><input type="hidden" data-f="${k}" value="${esc(v)}">` +
  `<button type="button" class="pk-field${v ? "" : " empty"}" data-date="${k}" aria-haspopup="dialog" aria-expanded="false" aria-label="${esc(DATE_TITLE[k])}, ${esc(dateText(k, v))}">` +
  `<span class="pk-field-v">${esc(dateText(k, v))}</span><span class="pk-field-x" aria-hidden="true"></span></button></div>`;
const statusField = (st) => `<div class="field"><span>상태</span><input type="hidden" data-f="status" value="${esc(st)}">` +
  `<button type="button" class="pk-field" data-pick="status" aria-haspopup="dialog" aria-expanded="false" aria-label="상태, ${esc(STATUS_KO[st] || st)}">` +
  `<span class="pk-field-v">${esc(STATUS_KO[st] || st)}</span><span class="pk-field-x" aria-hidden="true"></span></button></div>`;

function formHtml(v, ev) {
  return (!ev
      ? `<p class="be-note">새 회차는 「준비 중」으로 만들어져 성도님께 안 보여요 — 만든 뒤 ⚙️ 회차 설정에서 상태를 바꿔 주세요</p>` +
        textField("id", "회차 ID", "영문 소문자·숫자·붙임표 · 만든 뒤 못 바꿔요", v.id, `maxlength="41" autocapitalize="off" spellcheck="false" placeholder="예: summer-2027"`)
      : `<p class="be-hint">회차 ID <b>${esc(ev.id)}</b> — 만든 뒤에는 바꿀 수 없어요</p>` + (ev.hasEligibility ? ELIG_LINE : "")) +
    textField("title", "이름", "관리 목록·명단 제목", v.title, `maxlength="100" placeholder="예: 2027 썸머 써 바이블"`) +
    textField("short_title", "짧은 이름", "첫 화면 단추 — 20자 안쪽 권함 · 비우면 이름 그대로", v.short_title, `maxlength="40"`) +
    textField("subtitle", "부제", "안 써도 돼요", v.subtitle, `maxlength="100"`) +
    textField("season", "묶음", "분기 표기 · 예: 2027-3Q", v.season, `maxlength="20"`) +
    `<div class="be-2col">${dateField("opens_on", v.opens_on)}${dateField("closes_on", v.closes_on)}</div>` +
    (ev ? statusField(v.status) : "") +
    dateField("list_until", v.list_until) +
    `<p class="be-warn" data-warn="until"${v.list_until ? " hidden" : ""}>${esc(UNTIL_WARN)}</p>`;
}

const read = (root) => Object.fromEntries([...root.querySelectorAll("[data-f]")].map((i) => [i.dataset.f, norm(i.value)]));

function setDate(root, k, v) {
  root.querySelector(`[data-f="${k}"]`).value = v;
  const b = root.querySelector(`[data-date="${k}"]`);
  b.querySelector(".pk-field-v").textContent = dateText(k, v);
  b.setAttribute("aria-label", `${DATE_TITLE[k]}, ${dateText(k, v)}`);
  b.classList.toggle("empty", !v);
  if (k === "list_until") root.querySelector('[data-warn="until"]').hidden = !!v;
}
function setStatus(root, st) {
  root.querySelector('[data-f="status"]').value = st;
  const b = root.querySelector('[data-pick="status"]');
  b.querySelector(".pk-field-v").textContent = STATUS_KO[st] || st;
  b.setAttribute("aria-label", `상태, ${STATUS_KO[st] || st}`);
}

// → 만든/저장한 회차(EvEventOut) · 닫거나 바뀐 것이 없으면 null
export async function openEventForm({ call, ev = null, onStale = null } = {}) {
  const v = ev
    ? { title: ev.title || "", short_title: ev.short_title || "", subtitle: ev.subtitle || "", season: ev.season || "",
        opens_on: ev.opens_on || "", closes_on: ev.closes_on || "", status: ev.status || "draft", list_until: ev.list_until || "" }
    : { id: "", title: "", short_title: "", subtitle: "", season: "", opens_on: "", closes_on: "", list_until: "" };
  let first = "", staleCode = "";
  const out = await openForm({
    title: ev ? "⚙️ 회차 설정 고치기" : "＋ 새 회차 만들기",
    okLabel: ev ? "저장" : "만들기",
    html: formHtml(v, ev),
    onOpen: (root) => {
      root.addEventListener("click", async (e) => {
        const d = e.target.closest("[data-date]");
        if (d) {
          const k = d.dataset.date, cur = read(root);
          // 기간이라 반대쪽 끝을 넘지 못하게 — 시작일은 마감일까지, 마감일은 시작일부터, 공개 종료일은 마감일부터
          const got = await pickDate({ anchor: d, title: DATE_TITLE[k], value: cur[k],
            min: k === "closes_on" ? cur.opens_on : k === "list_until" ? cur.closes_on : "",
            max: k === "opens_on" ? cur.closes_on : "" });
          if (got !== null && d.isConnected) setDate(root, k, got);
          return;
        }
        const s = e.target.closest('[data-pick="status"]');
        if (s) {
          const got = await pickOne({ anchor: s, title: "상태", value: read(root).status,
            options: EV_STATUS.map((x) => ({ value: x, label: STATUS_KO[x], hint: STATUS_HINT[x] })) });
          if (got !== null && s.isConnected) setStatus(root, got);
        }
      });
      first = JSON.stringify(read(root));
    },
    isDirty: (root) => JSON.stringify(read(root)) !== first,
    onSubmit: async (root) => {
      const cur = read(root);
      if (!ev) {
        const r = await call("evEventCreate", { event: { id: cur.id, title: cur.title, short_title: cur.short_title,
          subtitle: cur.subtitle, season: cur.season, opens_on: cur.opens_on, closes_on: cur.closes_on, list_until: cur.list_until } });
        return r.ok ? { ok: true, value: r.event } : r;
      }
      const patch = eventPatch(ev, cur);
      if (!Object.keys(patch).length) return { ok: true, value: null };   // 바뀐 것이 없다 — 부르지 않는다
      const body = { event_id: ev.id, expect: ev.updated_at, patch };
      let r = await call("evEventSave", body);
      if (!r.ok && r.error === "needs-confirm") {
        // 서버는 아직 아무것도 쓰지 않았다 — 「보이게 하기」를 누를 때만 다시 보낸다
        const yes = await dialog({ title: "👁 성도님께 보이게 할까요?", text: CONFIRM_TEXT, ok: "보이게 하기", cancel: "그만두기" });
        if (!yes) return { ok: false, message: "저장하지 않았어요 — 아무것도 바뀌지 않았어요" };
        r = await call("evEventSave", { ...body, confirmListed: true });
      }
      if (!r.ok && STALE[r.error]) { staleCode = r.error; return { ok: false, message: STALE[r.error] }; }
      return r.ok ? { ok: true, value: r.event } : r;
    },
  });
  if (!out && staleCode && onStale) onStale(staleCode);
  return out || null;
}
```

```bash
node --check js/menus/bibleevent/event-form.js && echo "문법 통과"
```
Expected: `문법 통과`

- [ ] **Step 11: `js/menus/bibleevent/row-form.js` — 한 분 더하기 · 줄 고치기 · 줄 빼기 창**

```js
// 한 분 더하기 · 줄 고치기 · 줄 빼기 — 직접 만든 창(js/core/modal.js openForm).
// 설계 §1 「같은 분 판정」·「줄 모양 검사」 · §2 evRowAdd·evRowSave·evRowDelete·evPeopleLookup · §3 「＋ 한 분 더하기」.
// ⚠️ 줄 검사·다듬기(「화평교구」·「20목장」·「07」·「유년」·직분 「님」)는 서버가 한다(events-rules.ts tidyRow·checkRow) —
//    창은 적은 그대로 보내고, 틀리면 서버 코드를 창 안 빨간 줄로 보인다(판정표를 두 벌 두지 않는다).
// ⚠️ 교인명부 찾기는 「찾기」 단추·Enter 로만 부른다(글자마다 부르지 않는다) — 부를 때마다 서버가 people.lookup 기록(찾은 이름)을
//    남긴다. 돌아오는 것은 이름·구분·소속·세부·직분 다섯뿐이다.
// ⚠️ 앱에서 낸 줄(source='app')과 자격 회차의 줄은 **메모만** — 성도님이 앱에서 「고치기」를 누르면 소속·직분이 통째로 덮이고,
//    자격 회차 명단은 「꾸준히 했다는 판정 결과」다(가을 설계 §10·§12). 서버도 막는다(app-row-note-only) — 그래서 메모만 보낸다.
// ⚠️ 고치기 창은 지금 메모를 그대로 채운다 — 「원래: 화평 30 · 집사」 같은 옛 기록이 지워지지 않게.
// ⚠️ 메모 창의 글자 수 상한은 480(NOTE_FORM_MAX) — 서버는 「담당자가 더함 / 」를 붙인 **뒤** 500자로 센다. 메모는 한 줄로 저장된다.
// ⚠️ 다른 분이 먼저 바꿨으면(conflict·not-found) 창 안에 알리고, 창이 닫히면 onStale(code).
import { esc, toast, dialog, errorText } from "../../core/ui.js";
import { openForm } from "../../core/modal.js";
import { pickOne } from "../../core/picker.js";
import { GU_ORDER, ROW_KEYS, NOTE_FORM_MAX, norm, whoText, rowPatch } from "./roster-logic.js";

const STALE = {
  conflict: "다른 분이 먼저 이 줄을 바꿨어요 — 적으신 것을 적어 두고 「닫기」를 누르면 새로 불러올게요",
  "not-found": "이 줄(회차)을 찾지 못했어요 — 다른 분이 뺐을 수 있어요. 「닫기」를 누르면 새로 불러올게요",
};
// evRowAdd 의 warnings 는 서버(Task 7)가 만든 한국말 문장이다(「직분 「명예권사」 — 앱 직분 목록에 없어요…」·
// 「같은 이름·소속의 앱 계정이 2개라 잇지 않았어요」) — 그대로 보인다

const posHtml = (p) => (p ? `<em class="be-pos">${esc(p)}</em>` : "");
const roHtml = (r) => `<div class="be-ro"><b>${esc(r.name)}</b> <span>${esc(whoText(r))}</span>${posHtml(r.position)}</div>`;
const noteField = (note) => `<label class="field"><span>담당자 메모 <small>(성도님께는 안 보여요 · 한 줄로 저장돼요 · ${NOTE_FORM_MAX}자까지)</small></span>` +
  `<textarea data-f="note" maxlength="${NOTE_FORM_MAX}" rows="3">${esc(note)}</textarea></label>`;

// 이름·구분·소속·세부·직분·메모 — 교구 칸과 교회학교 칸을 따로 두고 구분 단추(.seg)로 하나만 보인다
function fullHtml(v, { adding, linked }) {
  const isGu = v.who_type !== "교회학교";
  return `<div class="field"><span>이름</span><div class="be-find">` +
      `<input data-f="name" value="${esc(v.name)}" maxlength="40" autocomplete="off" enterkeyhint="search" aria-label="이름">` +
      `<button type="button" class="btn" data-act="find">🔎 찾기</button></div></div>` +
    `<p class="be-hint">이름을 적고 「찾기」(또는 Enter)를 누르면 교인명부에서 소속·직분을 찾아 채워요 · 찾은 이름은 교인명부 열람 기록에 남아요</p>` +
    `<div class="be-cands" aria-live="polite" hidden></div>` +
    `<input type="hidden" data-f="who_type" value="${esc(v.who_type || "교구")}">` +
    `<div class="seg" role="group" aria-label="구분"><button type="button" data-t="교구" aria-pressed="false">교구</button>` +
      `<button type="button" data-t="교회학교" aria-pressed="false">교회학교</button></div>` +
    `<div data-for="교구"><div class="field"><span>교구</span><input type="hidden" data-f="gu" value="${esc(isGu ? v.group : "")}">` +
      `<button type="button" class="pk-field" data-pick="gu" aria-haspopup="dialog" aria-expanded="false"><span class="pk-field-v"></span>` +
      `<span class="pk-field-x" aria-hidden="true"></span></button></div>` +
      `<label class="field"><span>목장 <small>(숫자 또는 남성 · 모르면 비워 두기)</small></span>` +
      `<input data-f="mok" value="${esc(isGu ? v.sub : "")}" maxlength="40" autocomplete="off"></label></div>` +
    `<div data-for="교회학교"><label class="field"><span>부서 <small>(예: 청년부 · 중등부 · 소년2부)</small></span>` +
      `<input data-f="bu" value="${esc(isGu ? "" : v.group)}" maxlength="40" autocomplete="off"></label>` +
      `<label class="field"><span>학년·세부 <small>(모르면 비워 두기)</small></span>` +
      `<input data-f="grade" value="${esc(isGu ? "" : v.sub)}" maxlength="40" autocomplete="off"></label></div>` +
    `<label class="field"><span>직분 <small>(예: 집사 · 권사 · 성도)</small></span>` +
      `<input data-f="position" value="${esc(v.position)}" maxlength="40" autocomplete="off"></label>` +
    noteField(v.note) +
    (adding ? `<p class="be-hint">저장하면 메모 앞에 「담당자가 더함」이 붙어요 · 이름·소속이 같은 앱 계정이 있으면 이어요(새로 만들지 않아요) — ` +
      `이어지면 성도님 앱 「📋 이미 내신 것」에도 보여요</p>` : "") +
    (linked ? `<p class="be-warn" data-warn="linked" hidden>🔗 앱 계정과 이어진 줄이에요 — 이름·소속을 바꿔도 계정 연결은 그대로 남아요</p>` : "");
}

// 창의 칸 → 줄 모양(서버와 같이 빈칸을 다듬어). 메모만 고치는 창은 {note}
function readForm(root) {
  const g = (k) => norm(root.querySelector(`[data-f="${k}"]`)?.value);
  if (!root.querySelector('[data-f="who_type"]')) return { note: g("note") };
  const t = g("who_type");
  const isGu = t !== "교회학교";
  return { who_type: t, group: isGu ? g("gu") : g("bu"), sub: isGu ? g("mok") : g("grade"),
    name: g("name"), position: g("position"), note: g("note") };
}

function candsHtml(r, name) {
  if (!r.source) return `<p class="be-hint">교인명부가 아직 없어요 — 손으로 적어 주세요</p>`;
  const list = r.people || [];
  const head = `<p class="be-hint">교인명부 ${esc(r.source.date)} 기준 · ‘${esc(name)}’ ` +
    (list.length ? `${list.length}분 — 고르면 아래 칸이 채워져요(손으로 고칠 수 있어요)</p>` : `— 같은 이름이 없어요, 손으로 적어 주세요</p>`);
  return head + list.map((p, i) => `<button type="button" class="be-cand" data-cand="${i}"><b>${esc(p.name)}</b>` +
    `<span>${esc(p.who_type ? whoText(p) || p.who_type : "소속을 정할 수 없어요")}</span>${posHtml(p.position)}</button>`).join("");
}

// 교구/교회학교 전환 · 교구 고르기 · 교인명부 찾기 · 후보 고르기
function wireFull(root, { call, onChange }) {
  const $ = (s) => root.querySelector(s);
  const set = (k, v) => { const i = $(`[data-f="${k}"]`); if (i) i.value = v ?? ""; };
  const setType = (t) => {
    set("who_type", t);
    root.querySelectorAll(".seg [data-t]").forEach((b) => {
      const on = b.dataset.t === t;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", String(on));
    });
    root.querySelectorAll("[data-for]").forEach((d) => { d.hidden = d.dataset.for !== (t === "교회학교" ? "교회학교" : "교구"); });
    onChange();
  };
  const showGu = () => {
    const v = $('[data-f="gu"]').value, b = $('[data-pick="gu"]');
    b.querySelector(".pk-field-v").textContent = v || "교구 고르기";
    b.setAttribute("aria-label", `교구, ${v || "고르기"}`);
    b.classList.toggle("empty", !v);
  };
  const cands = $(".be-cands");
  let people = [], seqNo = 0;
  const find = async () => {
    const input = $('[data-f="name"]'), btn = $('[data-act="find"]');
    const name = norm(input.value);
    cands.hidden = false;
    if (!name) { cands.innerHTML = `<p class="be-hint">이름을 먼저 적어 주세요</p>`; input.focus(); return; }
    const my = ++seqNo;
    btn.disabled = true;
    cands.innerHTML = `<p class="be-hint">교인명부에서 찾는 중…</p>`;
    const r = await call("evPeopleLookup", { name });
    btn.disabled = false;
    if (my !== seqNo || !cands.isConnected) return;
    if (!r.ok) { cands.innerHTML = `<p class="be-warn">${esc(errorText(r))}</p>`; return; }
    people = r.people || [];
    cands.innerHTML = candsHtml(r, name);
  };
  const fill = (i) => {
    const p = people[i];
    if (!p) return;
    set("name", p.name);
    if (p.who_type === "교구" || p.who_type === "교회학교") {
      setType(p.who_type);
      if (p.who_type === "교구") { set("gu", p.group); set("mok", p.sub); showGu(); }
      else { set("bu", p.group); set("grade", p.sub); }
    }
    if (p.position) set("position", p.position);
    cands.innerHTML = `<p class="be-hint">✅ 교인명부 값으로 채웠어요 — 손으로 고칠 수 있어요</p>`;
    onChange();
  };
  root.addEventListener("click", async (e) => {
    const t = e.target.closest(".seg [data-t]");
    if (t) { setType(t.dataset.t); return; }
    const pk = e.target.closest('[data-pick="gu"]');
    if (pk) {
      const got = await pickOne({ anchor: pk, title: "교구 고르기", value: $('[data-f="gu"]').value,
        options: GU_ORDER.map((g) => ({ value: g, label: g })) });
      if (got !== null && pk.isConnected) { set("gu", got); showGu(); onChange(); }
      return;
    }
    if (e.target.closest('[data-act="find"]')) { find(); return; }
    const c = e.target.closest("[data-cand]");
    if (c) fill(Number(c.dataset.cand));
  });
  $('[data-f="name"]').addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.isComposing || e.keyCode === 229) return;
    e.preventDefault();   // 창의 「더하기·저장」이 아니라 찾기
    find();
  });
  root.addEventListener("input", onChange);
  setType($('[data-f="who_type"]').value);
  showGu();
}

// 계정이 이어진 줄의 이름·소속을 바꾸려 하면 경고 줄을 보인다(계정 연결은 서버가 그대로 둔다)
function syncLinked(root, row) {
  const w = root.querySelector('[data-warn="linked"]');
  if (!w) return;
  const p = rowPatch(row, readForm(root));
  w.hidden = !["who_type", "group", "sub", "name"].some((k) => k in p);
}

// → 더한/고친 줄(RowOut) · 닫거나 바뀐 것이 없으면 null
export async function openRowForm({ call, ev, row = null, onStale = null } = {}) {
  if (!row && ev.hasEligibility) { toast(errorText({ error: "eligibility-event" })); return null; }
  const noteOnly = !!row && (row.source === "app" || !!ev.hasEligibility);
  const why = row && row.source === "app"
    ? "📱 성도님이 앱에서 낸 신청이라 메모만 고칠 수 있어요 · 빼기는 성도님이 앱에서 해요"
    : "🔒 자격 회차의 줄이라 메모만 고칠 수 있어요";
  const init = row
    ? { who_type: row.who_type, group: row.group || "", sub: row.sub || "", name: row.name || "", position: row.position || "", note: row.note || "" }
    : { who_type: "교구", group: "", sub: "", name: "", position: "", note: "" };
  let first = "", staleCode = "", extra = null;
  const snap = (root) => JSON.stringify(readForm(root));
  const out = await openForm({
    title: !row ? "＋ 한 분 더하기" : noteOnly ? "📝 메모 고치기" : "✏️ 줄 고치기",
    okLabel: !row ? "더하기" : "저장",
    html: noteOnly ? roHtml(row) + `<p class="be-note">${esc(why)}</p>` + noteField(init.note)
      : fullHtml(init, { adding: !row, linked: !!(row && row.hasUser) }),
    onOpen: (root) => {
      if (!noteOnly) wireFull(root, { call, onChange: () => { if (row) syncLinked(root, row); } });
      first = snap(root);
    },
    isDirty: (root) => snap(root) !== first,
    onSubmit: async (root) => {
      const v = readForm(root);
      if (!row) {
        const r = await call("evRowAdd", { event_id: ev.id, row: v });
        if (!r.ok && r.error === "not-found") { staleCode = r.error; return { ok: false, message: STALE["not-found"] }; }
        if (!r.ok) return r;
        extra = { linked: !!r.linked, warnings: r.warnings || [] };
        return { ok: true, value: r.row };
      }
      const patch = rowPatch(row, v, noteOnly ? ["note"] : ROW_KEYS);
      if (!Object.keys(patch).length) return { ok: true, value: null };   // 바뀐 것이 없다 — 부르지 않는다
      const r = await call("evRowSave", { id: row.id, expect: row.updated_at, patch });
      if (!r.ok && STALE[r.error]) { staleCode = r.error; return { ok: false, message: STALE[r.error] }; }
      return r.ok ? { ok: true, value: r.row } : r;
    },
  });
  if (!out) { if (staleCode && onStale) onStale(staleCode); return null; }
  if (!row) {
    toast(`✅ ${out.name}님을 더했어요${extra && extra.linked ? " · 앱 계정과 이었어요" : ""}`);
    if (extra && extra.warnings.length) {
      await dialog({ title: "확인해 주세요", text: extra.warnings.map(String).join(" · "), ok: "알겠어요", cancel: null });
    }
  } else toast(`✏️ ${out.name}님 줄을 고쳤어요`);
  return out;
}

// 줄 빼기 — 한 창 안에서 두 단계(① 무엇을 빼는지 ② 「네, 뺍니다」). import 줄만 — 메뉴가 앱 줄·자격 회차의 줄엔 빼기를 주지 않고,
// 서버도 app-row·eligibility-event 로 막는다.
export async function openRowDelete({ call, row, onStale = null } = {}) {
  let step = 1, staleCode = "";
  const out = await openForm({
    title: "🗑 이 줄을 뺄까요?", okLabel: "빼기", cancelLabel: "그만두기", danger: true,
    html: roHtml(row) + `<p class="be-hint">잘못 들어온 줄을 명단에서 뺍니다 — 성도님 앱의 명단에서도 사라져요</p>` +
      `<p class="be-warn" data-step2 hidden>⚠️ 마지막 확인이에요 — 되돌릴 수 없어요. 「네, 뺍니다」를 누르면 빠져요</p>`,
    onSubmit: async (root) => {
      if (step === 1) {
        step = 2;
        root.querySelector("[data-step2]").hidden = false;
        root.querySelector(".be-ok").textContent = "네, 뺍니다";
        // 두 번 톡톡 눌러 두 단계가 한꺼번에 지나가지 않게 — 창이 onSubmit 동안 단추를 잠그므로 잠긴 채 잠깐 둔다
        await new Promise((res) => setTimeout(res, 600));
        return { ok: false };
      }
      const r = await call("evRowDelete", { id: row.id, expect: row.updated_at });
      if (!r.ok && STALE[r.error]) { staleCode = r.error; return { ok: false, message: STALE[r.error] }; }
      return r.ok ? { ok: true, value: r.deleted } : r;
    },
  });
  if (!out) { if (staleCode && onStale) onStale(staleCode); return null; }
  toast(`🗑 ${row.name}님 줄을 뺐어요`);
  return out;
}
```

```bash
node --check js/menus/bibleevent/row-form.js && echo "문법 통과"
```
Expected: `문법 통과`

- [ ] **Step 12: `js/menus/bibleevent/roster.js` — 메뉴 화면 · 화면 모듈이 Node 에서 읽히는지 시험 더하기**

```js
// 📋 회차·명단 — 성경필사(암송) 이벤트: 회차를 고르고 완서자 명단을 보고·고치고·더하고·빼고·내려받는다.
// 설계: v2 docs/superpowers/specs/2026-09-29-church-admin-bible-events-design.md §3 「📋 회차·명단」.
// 순수 논리 roster-logic.js · HTML 조각 roster-ui.js · 입력 창 event-form.js·row-form.js(모두 js/core/modal.js 위).
// ⚠️ 브라우저·시스템 창을 띄우지 않는다 — 고르기는 picker.js(pickOne·pickMany), 확인은 ui.js dialog, 입력은 openForm.
// ⚠️ 고른 회차는 주소 ?ev=<id> — 새로고침·뒤로 가기에도 같은 회차. (code·error·type 같은 이름은 로그인 값과 겹쳐 쓰지 않는다)
// ⚠️ 명단은 열 때마다 새로 받는다(여러 담당자가 서로 옛 화면을 보지 않게). 거르기만 같은 회차 안에서 남는다.
// ⚠️ 쓰기는 모두 입력 창 안에서 — 창이 스스로 단추를 잠근다(busy() 는 body 에 붙은 창을 잠그지 않는다).
// ⚠️ 내려받기는 **화면에 보이는 줄 그대로**(거르기·찾기·묶음 차례) — 메모는 싣지 않는다.
import { esc, toast, dialog, errorText } from "../../core/ui.js";
import { pickOne, pickMany } from "../../core/picker.js";
import { CHURCH_LEGEND, hasChurch } from "../people/church-badge.js";
import { CHURCH_STATES, SRC_LABEL, blankFilter, groupRows, filterRows, dupFlags, positionCounts, csvText, sortEvents }
  from "./roster-logic.js";
import { TITLE, ELIG_LINE, CHURCH_LABEL, chipsHtml, headHtml, settingsHtml, sourceHtml, filtersHtml, sumHtml, listHtml, rowMenuOptions }
  from "./roster-ui.js";
import { openEventForm } from "./event-form.js";
import { openRowForm, openRowDelete } from "./row-form.js";

let f = blankFilter();   // 거르기 — 같은 회차면 메뉴를 옮겨 다녀도 남는다
let fFor = "";           // f 가 어느 회차의 거르기인가
let setOpen = false;     // ⚙️ 회차 설정 — 처음엔 접어 둔다

const stamp = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, "");

function download(text, name) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const failHtml = (what, r) => TITLE + `<p class="empty">${esc(what)} — ${esc(errorText(r))}</p>`;

function renderEmpty(el, { call, go }) {
  el.innerHTML = TITLE + `<p class="empty">아직 만든 회차가 없어요</p>
    <div class="adm-acts"><button type="button" class="btn primary" data-act="new">＋ 새 회차</button></div>`;
  el.querySelector('[data-act="new"]').addEventListener("click", async () => {
    const made = await openEventForm({ call, ev: null });
    if (made && el.isConnected) go(`be-roster?ev=${encodeURIComponent(made.id)}`);
  });
}

export async function render(el, ctx) {
  const { call, go, query } = ctx;
  el.innerHTML = TITLE + `<p class="empty">불러오는 중…</p>`;
  const want = String((query && query.ev) || "");
  const [evs, asked] = await Promise.all([
    call("evEvents"),
    want ? call("evRoster", { event_id: want }) : Promise.resolve(null),
  ]);
  if (!el.isConnected) return;
  if (!evs.ok) { el.innerHTML = failHtml("회차를 불러오지 못했어요", evs); return; }
  const events = sortEvents(evs.events || []);
  if (!events.length) { renderEmpty(el, ctx); return; }
  let ros = null;
  if (asked && asked.ok) ros = asked;
  else if (asked && asked.error !== "not-found") { el.innerHTML = failHtml("명단을 불러오지 못했어요", asked); return; }
  else if (asked) toast("그 회차를 찾지 못해 가장 최근 회차를 보여 드려요");
  if (!ros) {
    ros = await call("evRoster", { event_id: events[0].id });
    if (!el.isConnected) return;
    if (!ros.ok) { el.innerHTML = failHtml("명단을 불러오지 못했어요", ros); return; }
  }
  const ev = ros.event;
  let rows = ros.rows || [];
  if (fFor !== ev.id) { f = blankFilter(); fFor = ev.id; }
  const chips = events.map((e) => (e.id === ev.id ? ev : e));   // 칩의 숫자·상태는 방금 받은 회차 것으로

  el.innerHTML = `${TITLE}
    <div class="be-evs" role="group" aria-label="회차 고르기"></div>
    <div class="card be-panel">
      <div class="be-head">${headHtml(ev)}</div>
      ${settingsHtml(ev, setOpen)}
      <div class="adm-acts">${ev.hasEligibility ? "" : `<button type="button" class="btn primary" data-act="add">＋ 한 분 더하기</button>`}
        <button type="button" class="btn" data-act="csv">⬇️ 내려받기</button></div>
      <div class="acts be-acts2"><button type="button" class="btn" data-act="reload">↻ 새로 불러오기</button></div>
      ${ev.hasEligibility ? ELIG_LINE : ""}
      ${sourceHtml(ros.source)}
      ${hasChurch(rows) ? CHURCH_LEGEND : ""}
      <div class="be-filters" role="group" aria-label="거르기"></div>
      <input type="search" class="search be-q" placeholder="🔍 이름 · 소속 · 직분" autocomplete="off" aria-label="명단에서 찾기">
      <p class="muted be-sum" aria-live="polite"></p>
      <div class="be-list"></div>
    </div>`;
  const q = el.querySelector(".be-q");
  q.value = f.q;
  const list = el.querySelector(".be-list");
  const mqWide = matchMedia("(min-width:1024px)");   // PC 는 표, 폰은 카드
  const find = (id) => rows.find((x) => String(x.id) === String(id));

  const draw = () => {
    ev.count = rows.length;
    el.querySelector(".be-evs").innerHTML = chipsHtml(chips, ev.id);
    const groups = groupRows(filterRows(rows, f));
    const dups = dupFlags(rows);   // ⚠️ 명단 **전체**로 — 거르기로 한쪽이 가려져도 표시는 남는다
    const labels = new Map(groupRows(rows).map((g) => [g.key, g.label]));
    el.querySelector(".be-filters").innerHTML = filtersHtml(f, { labels, church: hasChurch(rows) });
    el.querySelector(".be-sum").innerHTML = sumHtml(rows.length, groups.reduce((s, g) => s + g.rows.length, 0), dups.size, f.q);
    list.innerHTML = listHtml(groups, dups, mqWide.matches);
  };

  // 새로 불러오기는 새 <section> 에 — 같은 el 에 다시 그리면 click 처리가 겹쳐 쌓인다
  const reload = () => {
    if (!el.isConnected) return;
    const fresh = document.createElement("section");
    el.replaceWith(fresh);
    render(fresh, { ...ctx, query: { ...(query || {}), ev: ev.id } });
  };
  // 다른 담당자가 먼저 바꿨거나(conflict) 빼거나 회차가 없어졌다(not-found) — 알리고 새로 불러온다
  const stale = async (code) => {
    if (!el.isConnected) return;
    await dialog(code === "not-found"
      ? { title: "이미 없는 줄(회차)이에요", text: "다른 분이 먼저 빼거나 바꿨어요 — 새로 불러올게요", cancel: null }
      : { title: "다른 분이 먼저 바꿨어요", text: "새로 불러올게요", cancel: null });
    reload();
  };
  const refocus = (sel) => { const b = el.querySelector(sel); if (b) b.focus({ preventScroll: true }); };

  async function editEvent() {
    const saved = await openEventForm({ call, ev, onStale: stale });
    if (!saved || !el.isConnected) return;
    toast(!ev.listedNow && saved.listedNow ? "👁 이 회차가 이제 성도님께 보여요"
      : ev.listedNow && !saved.listedNow ? "이 회차는 이제 성도님께 안 보여요" : "회차 설정을 저장했어요");
    reload();
  }
  async function newEvent() {
    const made = await openEventForm({ call, ev: null });
    if (!made || !el.isConnected) return;
    toast(`「${made.title}」 회차를 만들었어요 — 「준비 중」이라 성도님께는 아직 안 보여요`);
    setOpen = true;
    go(`be-roster?ev=${encodeURIComponent(made.id)}`);   // 창이 뒤로 가기 칸을 거둔 **뒤**라 주소가 되돌아가지 않는다(modal.js ⑤)
  }
  async function addRow() {
    const r = await openRowForm({ call, ev, row: null, onStale: stale });
    if (!r || !el.isConnected) return;
    rows.push(r);
    draw();
  }
  async function rowMenu(b) {
    const r = find(b.dataset.id);
    if (!r) return;
    const pick = await pickOne({ anchor: b, title: `${r.name}님 줄`, options: rowMenuOptions(r, ev) });
    if (!pick || !el.isConnected) return;
    if (pick === "edit") {
      const u = await openRowForm({ call, ev, row: r, onStale: stale });
      if (!u || !el.isConnected) return;
      Object.assign(r, u);
      draw();
      refocus(`[data-act="row"][data-id="${CSS.escape(String(r.id))}"]`);
    } else if (pick === "del") {
      const d = await openRowDelete({ call, row: r, onStale: stale });
      if (!d || !el.isConnected) return;
      rows = rows.filter((x) => x !== r);
      draw();
      refocus(".be-q");
    }
  }
  function exportCsv() {
    const vis = groupRows(filterRows(rows, f)).flatMap((g) => g.rows);
    if (!vis.length) { toast("내려받을 줄이 없어요"); return; }
    download(csvText(vis), `${ev.id}_명단_${vis.length}명_${stamp()}.csv`);
    toast(`⬇️ 화면에 보이는 ${vis.length}줄을 내려받았어요 (메모는 빼고)`);
  }
  async function pickFilter(b) {
    const k = b.dataset.filter;
    if (k === "group") {
      const opts = groupRows(rows).map((g) => ({ value: g.key, label: g.label, hint: `${g.rows.length}명` }));
      const v = await pickMany({ anchor: b, title: "교구·부서로 거르기", options: opts, values: f.groups });
      if (v === null || !el.isConnected) return;
      f.groups = v.length === opts.length ? [] : v;   // 다 고르면 곧 전체
    } else if (k === "pos") {
      const opts = positionCounts(rows).map(([p, n]) => ({ value: p, label: p || "직분 없음", hint: `${n}명` }));
      const v = await pickMany({ anchor: b, title: "직분으로 거르기", options: opts, values: f.positions });
      if (v === null || !el.isConnected) return;
      f.positions = v.length === opts.length ? [] : v;
    } else if (k === "church") {
      const v = await pickOne({ anchor: b, title: "교적 표시로 거르기", value: f.church,
        options: [{ value: "", label: "전체" }, ...CHURCH_STATES.map((s) => ({ value: s, label: CHURCH_LABEL[s] }))] });
      if (v === null || !el.isConnected) return;
      f.church = v;
    } else if (k === "src") {
      const v = await pickOne({ anchor: b, title: "출처로 거르기", value: f.source, options: [{ value: "", label: "전체" },
        { value: "app", label: SRC_LABEL.app, hint: "성도님이 앱에서 낸 신청" },
        { value: "import", label: SRC_LABEL.import, hint: "옛 명단에서 옮겼거나 담당자가 더한 줄" }] });
      if (v === null || !el.isConnected) return;
      f.source = v;
    } else return;
    draw();
    refocus(`[data-filter="${k}"]`);
  }

  el.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-ev]");
    if (chip) {
      if (chip.dataset.ev !== ev.id) go(`be-roster?ev=${encodeURIComponent(chip.dataset.ev)}`);
      return;
    }
    const fb = e.target.closest("[data-filter]");
    if (fb) { pickFilter(fb); return; }
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "new") newEvent();
    else if (act === "set") editEvent();
    else if (act === "add") addRow();
    else if (act === "row") rowMenu(b);
    else if (act === "csv") exportCsv();
    else if (act === "reload") reload();
    else if (act === "clear") { f = blankFilter(); q.value = ""; draw(); }
  });
  q.addEventListener("input", () => { f.q = q.value; draw(); });
  // <details> 의 toggle 은 거품이 일지 않는다 — 잡는 단계(capture)에서 받는다
  el.addEventListener("toggle", (e) => {
    if (e.target instanceof Element && e.target.matches("details.be-set")) setOpen = e.target.open;
  }, true);
  // 창 폭이 1024px 을 넘나들면 표↔카드 — 이 화면이 사라지면 스스로 떨어진다
  const onMq = () => { if (!el.isConnected) { mqWide.removeEventListener("change", onMq); return; } draw(); };
  mqWide.addEventListener("change", onMq);
  draw();
}
```

`node --check` 는 import 한 이름이 없는 것(`SyntaxError: … does not provide an export named …`)을 못 본다 — 화면 모듈을 Node 에서 한 번 불러 보는 시험을 `tests/be-roster-ui.test.mjs` 끝에 이어 붙인다(모든 화면 파일이 맨 위에서 document·window 를 만지지 않으므로 Node 에서 읽힌다):

```bash
cat >> tests/be-roster-ui.test.mjs <<'EOF'

test("화면 모듈이 Node 에서 읽힌다 — 들여온 이름이 모두 있다(없으면 여기서 SyntaxError · node --check 는 이것을 못 본다)", async () => {
  const f = await import("../js/menus/bibleevent/event-form.js");
  const r = await import("../js/menus/bibleevent/row-form.js");
  const m = await import("../js/menus/bibleevent/roster.js");
  assert.equal(typeof f.openEventForm, "function");
  assert.equal(typeof r.openRowForm, "function");
  assert.equal(typeof r.openRowDelete, "function");
  assert.equal(typeof m.render, "function");
});
EOF
node --check js/menus/bibleevent/roster.js && echo "문법 통과"
node --experimental-strip-types --test tests/be-roster-ui.test.mjs
```
Expected: `문법 통과` · PASS — `# pass 6` · `# fail 0`.

- [ ] **Step 13: 메뉴 줄 — `js/menus/registry.js`**

Edit 도구로 앵커 줄 `    role: "ministry", load: () => import("./ministry/appointed.js") },`(임명현황 줄의 끝 줄)을 아래로 바꾼다 — 그 줄은 그대로 두고 **바로 다음에** 두 줄(그 뒤가 `people` 줄):

```js
    role: "ministry", load: () => import("./ministry/appointed.js") },
  { id: "be-roster", group: "성경필사(암송)", icon: "📋", label: "회차·명단", desc: "완서자 명단 보기 · 고치기 · 회차 설정",
    role: "bibleevent", load: () => import("./bibleevent/roster.js") },
```

```bash
node --experimental-strip-types --test tests/registry.test.mjs
grep -cF '    role: "bibleevent", load: () => import("./bibleevent/roster.js") },' js/menus/registry.js
```
Expected: PASS — `# pass 4` · `# fail 0`(역할 `bibleevent` 은 Task 5 의 `ACTION_ROLES` 로 `knownRoles()` 에 있고, `./bibleevent/roster.js` 파일이 있다) · `1`(Task 11 이 이 줄을 앵커로 쓴다).

- [ ] **Step 14: `css/admin.css` 끝에 「be- ② 회차·명단」 블록 이어 붙이기**

```bash
echo >> css/admin.css
cat >> css/admin.css <<'EOF'
/* ── 성경필사(암송) be- ② 📋 회차·명단(js/menus/bibleevent/roster*.js·event-form.js·row-form.js · 2026-09-29) ──
   표준 v1: 주 단추 48 · 둘째 44 · 칩 36 · 글씨 13 이상 · 폰 카드 / PC(≥1024px) 표. 크기·색은 토큰만.
   줄 메뉴는 고르개(pickOne)라 표를 overflow-x 로 감싸도 잘리지 않는다. */
.be-sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.be-evs{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px}
.be-ev{display:inline-flex;align-items:center;gap:6px;min-height:var(--chip);max-width:100%;padding:0 12px;border:1px solid var(--border);
  border-radius:999px;background:var(--paper);color:var(--navy-dark);font-size:13px;font-weight:700;cursor:pointer}
.be-ev em{font-style:normal;font-weight:800;color:var(--navy)}
.be-ev small{font-size:13px;font-weight:600;color:var(--gray)}
.be-ev.on{background:var(--navy);border-color:var(--navy);color:#fff}
.be-ev.on em,.be-ev.on small{color:#fff}
.be-ev.new{background:var(--ghost-bg);border:1px dashed var(--ghost-bd);color:var(--navy)}
/* 붙는 머리 — 우리 머리줄 아래, 카드 여백까지 덮게 음수 여백(.mn-head 와 같은 꼴) */
.be-head{position:sticky;top:var(--head-h);z-index:20;background:var(--paper);margin:calc(-1 * var(--card-pad)) calc(-1 * var(--card-pad)) var(--gap);
  padding:10px var(--card-pad) 8px;border-radius:14px 14px 0 0;border-bottom:1px solid var(--light)}
.be-head-t b{font-size:16px;font-weight:800;color:var(--navy)}
.be-tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}
.be-tag{display:inline-flex;align-items:center;min-height:24px;padding:0 9px;border-radius:999px;background:var(--light);
  color:var(--navy-dark);font-size:13px;font-weight:700}
.be-tag.seen{background:var(--ghost-bg);color:var(--navy)}
.be-tag.st-open{background:var(--ghost-bg);color:var(--green)}
/* ⚙️ 회차 설정 — 접힘 */
.be-set{margin:0 0 12px;border:1px solid var(--border);border-radius:10px;background:var(--cream)}
.be-set>summary{list-style:none;display:flex;align-items:center;min-height:var(--tap);padding:0 12px;cursor:pointer;
  font-size:14px;font-weight:800;color:var(--navy)}
.be-set>summary::-webkit-details-marker{display:none}
.be-set[open]>summary{border-bottom:1px solid var(--border)}
.be-set-b{padding:10px 12px 12px}
.be-kv{display:grid;grid-template-columns:max-content 1fr;gap:4px 12px;margin:0 0 10px;font-size:14px}
.be-kv dt{font-size:13px;color:var(--gray)}
.be-kv dd{overflow-wrap:anywhere}
.be-acts2{margin:-4px 0 12px}
.be-srcline{margin:0 0 8px}
/* 교적 표시(.cb · 사역 화면과 같은 부품)는 12px 로 그려진다 — 이 메뉴 안에서는 표준 v1 의 13px 로 */
.be-panel .cb,.be-panel .cb small{font-size:13px}
/* 거르기 칩 — 누르면 고르개 */
.be-filters{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 10px}
.be-fchip{display:inline-flex;align-items:center;gap:6px;min-height:var(--chip);max-width:100%;padding:0 12px;border:1px solid var(--border);
  border-radius:999px;background:var(--paper);color:var(--gray);font-size:13px;font-weight:700;cursor:pointer}
.be-fchip b{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--navy-dark)}
.be-fchip.on{border-color:var(--navy);background:var(--ghost-bg)}
.be-fchip.on b{color:var(--navy)}
.be-fchip .pk-field-x{width:12px;height:12px}
.be-fchip[aria-expanded="true"] .pk-field-x{transform:rotate(180deg)}
.be-fchip.clear{border-style:dashed;color:var(--navy)}
.be-sum{margin:0 0 10px}
.be-sum b{color:var(--navy)}
/* 명단 — 폰 카드 */
.be-grp{margin:0 0 14px}
.be-grp-h{display:flex;align-items:baseline;gap:8px;margin:0 0 8px;padding:4px 2px;border-bottom:2px solid var(--light);
  font-size:15px;font-weight:800;color:var(--navy)}
.be-grp-h em{margin-left:auto;font-style:normal;font-size:13px;font-weight:700;color:var(--gray)}
.be-row{margin-bottom:8px;padding:10px 12px;border:1px solid var(--border);border-radius:12px;background:var(--paper)}
.be-row.dup{border-color:var(--gold)}
.be-row-h{display:flex;align-items:flex-start;gap:8px}
.be-row-nm{flex:1;min-width:0}
.be-row-nm b{font-size:16px;font-weight:800;color:var(--navy)}
.be-row-sub{margin-left:6px;font-size:13px;color:var(--gray)}
.be-badges{display:flex;flex-wrap:wrap;align-items:center;gap:4px 6px;margin-top:4px}
.be-badges .cb{margin-left:0}
.be-pos{margin-left:6px;padding:1px 8px;border:1px solid var(--border);border-radius:999px;background:var(--cream);
  color:var(--navy-dark);font-size:13px;font-style:normal;font-weight:700}
.be-src,.be-user,.be-dup{display:inline-flex;align-items:center;min-height:22px;padding:0 8px;border-radius:999px;
  font-size:13px;font-style:normal;font-weight:700;white-space:nowrap}
.be-src{background:var(--light);color:var(--navy-dark)}
.be-src.app,.be-user{background:var(--ghost-bg);color:var(--navy)}
.be-dup{border:1px solid var(--gold);background:var(--cream);color:var(--navy-dark)}
.be-memo{margin-top:6px;padding:6px 9px;border-radius:8px;background:var(--cream);color:var(--navy-dark);font-size:13px;
  line-height:1.5;overflow-wrap:anywhere}
.be-memo i{font-style:normal;color:var(--gray)}
.be-more{flex:none;min-width:var(--tap);min-height:var(--tap);border:1px solid var(--ghost-bd);border-radius:10px;
  background:var(--ghost-bg);color:var(--navy);font-size:1.1rem;font-weight:800;cursor:pointer}
/* 명단 — PC 표(묶음마다 머리 줄) */
.be-tbl-wrap{overflow-x:auto}
.be-table{width:100%;border-collapse:collapse;background:var(--paper);font-size:14px}
.be-table th,.be-table td{padding:8px 10px;border-bottom:1px solid var(--light);text-align:left;vertical-align:middle;overflow-wrap:anywhere}
.be-table thead th{background:var(--light);color:var(--gray);font-size:13px}
.be-table .be-tgrp th{background:var(--ghost-bg);color:var(--navy);font-size:14px;font-weight:800}
.be-table .be-tgrp em{margin-left:6px;font-style:normal;font-size:13px;color:var(--gray)}
.be-table tr.dup td{background:var(--cream)}
.be-table td .cb{margin-left:0}
.be-tnote{max-width:280px;font-size:13px;color:var(--navy-dark)}
/* 창 안 — 한 분 더하기·줄 고치기·새 회차 */
.be-find{display:flex;gap:8px}
.be-find input{flex:1;min-width:0}
.be-find .btn{flex:none}
.be-cands{margin:0 0 12px}
.be-cand{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;width:100%;min-height:var(--tap);margin-top:6px;padding:8px 12px;
  border:1px solid var(--ghost-bd);border-radius:10px;background:var(--ghost-bg);color:var(--navy-dark);font-size:14px;text-align:left;cursor:pointer}
.be-cand b{color:var(--navy)}
.be-ro{margin:0 0 12px;padding:10px 12px;border-radius:10px;background:var(--light);font-size:15px}
.be-ro b{color:var(--navy)}
.be-2col{display:grid;gap:0 8px}
@media (min-width:560px){.be-2col{grid-template-columns:1fr 1fr}}
EOF
python -c "s=open('css/admin.css',encoding='utf-8').read(); print(s.count('{'), s.count('}'))"
grep -c '^\.be-panel \.cb' css/admin.css
```
Expected: 두 숫자가 같다 · `1`.

- [ ] **Step 15: 문법 · 금지 부품 · 전체 점검**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
for f in js/core/modal.js js/menus/bibleevent/*.js; do node --check "$f" || echo "문법 실패: $f"; done
# 금지 부품 — 설명 주석(// …)에 적힌 이름은 빼고 본다
grep -nE "\b(alert|confirm|prompt)\(|<select|type=\"?(date|time)\"?|datalist|beforeunload" js/core/modal.js js/menus/bibleevent/*.js \
  | grep -vE "^[^:]+:[0-9]+:\s*//" || echo "금지 부품 없음"
node --experimental-strip-types --test tests/be-roster-logic.test.mjs tests/be-roster-ui.test.mjs tests/ui.test.mjs tests/modal.test.mjs tests/registry.test.mjs
python tools/preflight.py
```
Expected: 문법 실패 줄 없음 · `금지 부품 없음` · `# pass 32`(11 + 6 + 6 + 5 + 4 · a2dfd7c 기준 — ui·registry 시험 수는 main 에 따라 달라질 수 있다) · `# fail 0` · `모두 통과`.

- [ ] **Step 16: localhost 에서 개발 DB 로 직접 본다(친구와 · 10분)**

선행: Task 5-8 의 액션이 **개발 함수**에 배포돼 있다. 화면이 「화면이 옛 판이에요 — 새로고침해 주세요」(`unknown-action`)를 보이면 개발 배포부터 — **워크트리 루트에서**(여기에 `supabase/functions/church-admin`·`supabase/config.toml` 이 있다 · 작업 폴더 `~/.church-admin/supa-dev` 에는 functions 가 없다):

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
git status --short          # 배포는 작업 트리를 올린다 — 커밋 안 된 남의 파일이 없는지 먼저 본다
supabase functions deploy church-admin --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo
```

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
python -m http.server 8000
```
http://localhost:8000 → 오른쪽 위 「개발 DB」 띠 확인 → 카카오 로그인(총괄 관리자) → 메뉴 「성경필사(암송) › 📋 회차·명단」. 창이 열릴 때마다 개발자 도구 콘솔에서 `document.querySelectorAll('select, input[type=date], input[type=time], datalist').length` → `0`.

1. 칩이 최근 회차 먼저 · 숫자·상태 · 보이는 회차에 👁. 칩을 누르면 주소가 `#/be-roster?ev=…` 로 바뀌고 새로고침해도 같은 회차.
2. 「＋ 새 회차」 → ID `ca-test-ui-0929`, 이름 「ca-test 화면 확인」, 기간은 달력(시스템 달력이 뜨지 않는다 · 시작일을 고르면 마감일 달력에서 그 앞 날이 흐리다) → 만들기 → 그 회차로 옮겨 가고(주소 `?ev=ca-test-ui-0929` 가 그대로 남는다) 「준비 중」·「성도님께 안 보임」. 같은 ID 로 한 번 더 → 창 안 「같은 회차 ID 가 이미 있어요 — 다른 ID 를 적어 주세요」.
3. ⚙️ 회차 설정 → ✏️ 고치기 → 상태 「열림」, 명단 공개 종료일 비운 채 → 창 안 빨간 경고 줄이 보인다 → 공개 종료일을 고르면 경고가 사라진다 → 이름을 비우고 저장 → 창 안 「회차 이름을 적어 주세요」(서버 검사 · 창 유지 · 달력은 기간을 거꾸로 고를 수 없게 막으므로 기간 검사는 서버 시험이 본다) → 이름을 되돌려 저장 → 「👁 성도님께 보이게 할까요?」 창 → 「그만두기」 → 창 안 「저장하지 않았어요 — 아무것도 바뀌지 않았어요」, 칩은 그대로 「준비 중」 → 다시 저장 → 「보이게 하기」 → 알림 「👁 이 회차가 이제 성도님께 보여요」, 칩에 👁.
4. 「＋ 한 분 더하기」 → 이름에 개발 가짜 명부의 이름 하나(🔎 교인 찾기에서 아무 이름이나) → Enter → 후보(이름·소속·직분) → 고르기 → 칸이 채워진다 → 더하기 → 카드가 제 교구·목장 자리에 생긴다. 같은 것을 한 번 더 → 창 안 빨간 줄 「이 회차에 같은 분이 이미 있어요」.
5. 목장에 `07` 을 적어 다른 이름으로 더하기 → 카드가 「7목장」(서버가 다듬었다). 교구 「화평」·목장 `20목장` → 「20목장」 카드. 이름에 `홍,길동` → 창 안 「이름·소속에는 " \ , ( ) | 를 쓸 수 없어요」. 목장 `스물` → 창 안 「목장은 숫자나 「남성」으로 …」.
6. 카드 ⋯ → 고치기 → 메모에 글 → 뒤로 가기 → 창 안 「저장하지 않은 내용이 있어요 — 닫을까요?」 → 계속 쓰기 → 저장 → 카드에 📝. 교구 칸 → 교구 고르개 → Esc 한 번 → **고르개만** 닫힌다.
7. 저장 알림이 떠 있는 **4초 안에** 다른 카드 ⋯ → 폰 폭(390px)의 아래 판에서 맨 아래 줄 「🗑 빼기」를 누를 수 있다(알림은 화면 위로 옮겨 가 있고 누름을 가로채지 않는다) → 「빼기」 → 「네, 뺍니다」(두 번 톡톡 눌러도 한 번에 지나가지 않는다) → 카드가 사라지고 칩 숫자가 준다.
8. 거르기 칩(교구·부서·직분·교적·출처) · 찾기 · 「✕ 거르기 풀기」 → 「보이는 줄」 숫자가 맞다. 내려받기 → 엑셀에서 한글이 안 깨지고, 보이는 줄만, 메모 칸 없음.
9. 폭 390px(카드 · 창은 아래 판) ↔ 1280px(표 · 창은 가운데). 창을 연 채 왼쪽 메뉴의 다른 메뉴를 누를 수 없고(막이 덮는다), 주소 `#` 를 `#/audit` 로 바꾸면 창이 닫힌다.
10. 앱에서 낸 줄(출처 📱 앱)이 있는 회차(개발 DB 에 있으면) → ⋯ 에 「📝 메모 고치기」 하나뿐 · 고치기 창은 메모 칸만 · Network 의 `evRowSave` 요청 `patch` 에 `note` 하나뿐. 자격 회차(있으면) → 「＋ 한 분 더하기」 단추 없음 · 🔒 한 줄 · 줄 메뉴도 메모만. (개발 DB 에 둘 다 없으면 Task 14 점검표로 넘긴다 — Task 14 가 시험 회차를 만든다.)

시험 회차를 지운다(줄은 CASCADE). 작업 폴더가 개발을 가리키는지 먼저 본다:

```bash
cat ~/.church-admin/supa-dev/supabase/.temp/project-ref; echo      # ktpwthwqzgcqcrmsafdo 여야 한다 — 다르면 멈춘다
supabase --workdir ~/.church-admin/supa-dev db query --linked "select count(*) from users"   # 스물 남짓 = 개발(사백이 넘으면 운영 — 멈춘다)
cat > "$HOME/.church-admin/be-ui-cleanup.sql" <<'SQL'
delete from events where id like 'ca-test-ui-%';
select count(*) as left_over from events where id like 'ca-test-ui-%';
SQL
supabase --workdir ~/.church-admin/supa-dev db query --linked -f "$(cygpath -m "$HOME/.church-admin/be-ui-cleanup.sql")"
```
Expected: `ktpwthwqzgcqcrmsafdo` · 수십 명대 · `left_over` 0. (Task 5 의 개발 시험 `after()` 도 `ca-test-*` 회차를 지운다 — 여기서 먼저 치운다.)

`Ctrl+C` 로 서버를 끈다. 어긋난 것은 고치고 Step 15 부터 다시.

- [ ] **Step 17: 커밋 — 화면**

```bash
git add js/menus/bibleevent/roster-ui.js js/menus/bibleevent/event-form.js js/menus/bibleevent/row-form.js js/menus/bibleevent/roster.js tests/be-roster-ui.test.mjs js/menus/registry.js css/admin.css
git status --short
git commit -m "feat(성경필사): 📋 회차·명단 — 회차 칩(인원·상태·👁) · 회차 설정(공개 확인은 창으로) · 앱 명단 차례로 묶은 명단(폰 카드·PC 표) · 거르기·찾기 · 한 분 더하기(교인명부 찾기) · 고치기·빼기(앱 줄·자격 회차는 메모만) · 보이는 줄 CSV" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
Expected: `git status --short` 에 이 일곱 파일만 스테이징돼 있다(다른 것은 없다). 푸시하지 않는다.


### Task 11: 📤 명단 올리기 화면(upload · upload-logic) · 메뉴 줄 · 시험

담당자가 엑셀·붙여넣기로 한 회차에 여러 분을 한꺼번에 더하는 화면이다(설계 3절 「📤 명단 올리기」). 틀은 사역신청 「종이 명단 올리기」(`js/menus/ministry/paper.js`)와 같다 — **회차 고르기 → 붙여넣기(또는 엑셀 파일·끌어다 놓기) → 「□ 빈칸은 교인명부로 채우기」 → 살펴보기(판정 표·건수) → 넣기(확인 창)**.

- 화면은 칸을 **나누기만** 한다(`parseSheet`). 다듬기(「화평교구」→화평 · 「20목장」→20 · 「07」→7 · 이름 끝 숫자 …)와 판정은 서버 `evUploadCheck`·`evUploadSave`(Task 8 · `events-rules.ts tidyRaw` · `events-upload.ts`)가 **처음부터 다시** 한다 — 규칙을 두 곳에 두지 않는다.
- 판정의 뜻은 Task 8 의 표 그대로다(CONTRACT 5절 반영): `add`·`fill` 만 넣는다 · `same-name`(👥 동명이인)은 **소속을 못 정한 줄에만** 온다 — 소속이 적혀 있고 직분만 빈 줄은 동명이인이어도 `add`(직분은 빈 채로, 까닭은 `notes`) · 적힌 소속이 교인명부와 다르면 채우지 않는다(`notes`) · 교구 칸이 비어 교인명부로 채운 줄은 목장도 교인명부 값(`notes` 에 「적힌 목장 N 대신 교인명부 목장」). 화면은 서버가 준 `notes` 를 그대로 보인다.
- 넣기 확인 창의 건수는 **넣는 순간 다시 읽은 글**로 센다: 글을 다시 `parseSheet` 하고, 살펴본 것과 회차·채우기·줄이 하나라도 다르면(`sigOf`) 넣지 않고 「살펴보기를 다시」라고 알린다. 같으면 그 글로 살펴본 판정 줄에서 `markCounts` 로 다시 센다(서버 `counts` 를 그대로 믿지 않는다). 확인 창이 떠 있는 사이에 바뀌었는지도 한 번 더 본다.
- 자격 회차(`hasEligibility`)는 고르개에 나오지 않는다(서버도 `eligibility-event`). 주소 `?ev=` 가 자격 회차면 고르지 않고 한 줄로 알린다.
- 1,000명이 넘게 되는 회차는 **경고만** 한다(막지 않는다 — CONTRACT 5절). CSV 가 UTF-8 로 안 읽히면 EUC-KR 로 다시 읽는다. 올리기 양식 파일은 두지 않는다(칸 차례 고르기와 보기 줄로 대신).
- 시스템 창을 띄우지 않는다: 확인·알림은 `ui.js dialog`, 회차·칸 차례 고르기는 `picker.js pickOne`, 채우기는 모양을 입힌 체크 칸(운영체제 창이 아니다). 엑셀 **파일 고르기**만 운영체제 창이라 붙여넣기 칸과 끌어다 놓기를 함께 둔다.
- 소속 한 줄(`whoText`)·상태 이름(`STATUS_KO`)은 **Task 10 `roster-logic.js` 의 것을 가져다 쓴다** — 여기 따로 두면 「받는 중」/「열림」처럼 메뉴마다 글자가 갈린다(Task 12 도 거기서 가져간다).
- 이 과제는 개인정보 안내를 고치지 않는다 — 교회 어드민 `privacy.html` 은 Task 13, **성경암송 `privacy/` 는 손대지 않는다**(설계 0절·8절 7 · 친구 결정: 어드민에서만 보는 일이고 앱이 새로 모으는 것이 없다).

기준: church-admin main `a2dfd7c`(`js/core/picker.js` 들어 있음) 위에 Task 1~10 이 커밋된 `bible-events` 가지. 다른 세션이 main 을 계속 고치므로 **줄 번호가 아니라 앵커 글**로 찾고, 앵커가 한 번만 나오는지 `grep -c` 로 먼저 본다.
모든 명령은 워크트리에서(Git Bash: `cd /c/Projects/church-admin/.worktrees/bible-events`). 서버는 이 과제에서 바꾸지 않는다(개발 배포 없음). 푸시하지 않는다.

**Files:**
- Create: `js/menus/bibleevent/upload-logic.js` (순수 함수 — Node 시험이 읽는다)
- Create: `js/menus/bibleevent/upload.js` (화면)
- Create: `tests/be-upload-logic.test.mjs`
- Modify: `js/menus/registry.js` — 앵커 `import("./bibleevent/roster.js") },`(Task 10 의 `be-roster` 줄 끝)가 든 줄 **바로 다음**에 두 줄
- Modify: `css/admin.css` — 파일 **끝**(Task 9·10 의 `be-` 블록 뒤에 이어 붙인다 — 설계의 「`be-` 접두 블록 하나」의 이어짐)

**Interfaces:**
- Consumes:
  - 서버(Task 5) `evEvents {}` → `{ok, today, events:[EvEventOut]}` — `EvEventOut = {id,title,short_title,subtitle,season,kind,status,opens_on,closes_on,list_until,updated_at,count,listedNow,hasEligibility}`(마감일 늦은 회차 먼저 · `hasEligibility = isEligEvent(needs)`)
  - 서버(Task 8) `evUploadCheck {event_id, rows:RawCells[], fill:boolean}` → `{ok, total, rows:[UploadOut], counts}` · `evUploadSave`(같은 것) → `{ok, counts, saved:number, failed:[{i, error:"already"|"server"}]}` — `RawCells = {name,gu,mok,pos}` · `UploadOut = {i, mark:"add"|"same"|"blank"|"bad"|"fill"|"same-name", row:{who_type,group,sub,name,position}|null, error:string|null, notes:string[]}`(`bad` 줄도 다듬은 `row` 가 올 수 있다 · `blank`/`same-name` 줄의 `who_type` 은 `""` 일 수 있다) · `counts = {add,same,blank,bad,fill,sameName,oddPosition}` · `total` = **이 회차의 지금 줄 수**(넣기 전) · 오류 `not-found`·`eligibility-event`·`too-many`
  - Task 2 `events-rules.ts` `BE_MAX_UPLOAD`(시험이 화면의 600 과 맞대 본다)
  - Task 10 `js/menus/bibleevent/roster-logic.js` `whoText(r)`(「화평 20목장」·「소망 남성」·「중등부 3학년」) · `STATUS_KO` · `registry.js` 의 `be-roster` 줄 · 📋 회차·명단이 `query.ev` 를 읽는다(`#/be-roster?ev=<id>` — 넣은 뒤 「회차·명단에서 보기」 고리)
  - `js/core/picker.js`(main `a2dfd7c`) `pickOne({anchor, title, options:[{value,label,hint?}], value}) → Promise<value|null>`
  - `js/core/ui.js` `esc` · `dialog({title,text|html,ok,cancel,danger}) → Promise<boolean>`(본문 `white-space:pre-line`) · `busy(root, fn)` · `errorText(r)` · Task 10 이 더한 `MESSAGES`(`eligibility-event`·`too-many`·`already`·`no-name`·`bad-type`·`bad-group`·`no-group`·`bad-sub` …) · 원래 있던 `not-found`·`bad-char`·`too-long`·`server`
- Produces:
  - `upload-logic.js`: `MAX_ROWS = 600` · `PUBLIC_MAX = 1000` · `COL_LABEL` · `ORDERS: {id,label,cols}[]`(`ngmp` 이름·교구·목장·직분 = 기본 · `npgm` 이름·직분·교구·목장 · `gmnp` 교구·목장·이름·직분 · `xngmp` 번호·이름·교구·목장·직분) · `orderOf(id)` · `sampleLine(order): string` · **`parseSheet(text, order): RawCells[]`** · `cellText(v)` · `sheetText(rows2d): string` · `decodeText(bytes): string` · `sigOf(eventId, rows, fill): string` · `MARKS` · `MARK_ORDER` · `WILL_ADD`(= add·fill) · `markCounts(out): {total,willAdd,add,fill,same,blank,sameName,bad}` · `countOf(c, mark)` · `displayRow(o, sent): {name,who,position}` · `evHint(e)` · `eventOptions(events)` · `pickFrom(events, id): {ev, blocked}` · `overLimit(total, willAdd)` · `confirmHtml(ev, lines, c)`
  - `upload.js`: `render(el, { call, query })`
  - `registry.js` 줄 `be-upload`(CONTRACT 그대로) · CSS `be-up-*`

- [ ] **Step 1: 선행 확인 — 앞 과제의 이름과 앵커가 있는가**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
node --experimental-strip-types --input-type=module -e "
const need = {
  './js/core/picker.js': ['pickOne'],
  './js/core/ui.js': ['esc', 'dialog', 'busy', 'errorText'],
  './js/menus/bibleevent/roster-logic.js': ['whoText', 'STATUS_KO', 'SRC_LABEL'],
  './supabase/functions/church-admin/events-rules.ts': ['BE_MAX_UPLOAD'],
};
for (const [f, ks] of Object.entries(need)) { const m = await import(f); for (const k of ks) if (typeof m[k] === 'undefined') throw new Error(f + ' 에 ' + k + ' 가 없다'); }
const { MENUS } = await import('./js/menus/registry.js');
if (!MENUS.some((m) => m.id === 'be-roster')) throw new Error('registry 에 be-roster 가 없다(Task 10)');
const { ACTION_ROLES } = await import('./supabase/functions/church-admin/authz.ts');
for (const a of ['evEvents', 'evUploadCheck', 'evUploadSave']) if (ACTION_ROLES[a] !== 'bibleevent') throw new Error('authz 에 ' + a + ' 가 없다(Task 5·8)');
console.log('앞 과제 이름 모두 있음');
"
grep -c 'import("./bibleevent/roster.js") },' js/menus/registry.js   # 1 — Step 5 의 앵커(Task 10 의 be-roster 줄 끝)
grep -c 'bibleevent/upload' js/menus/registry.js                     # 0 — 아직 없다
grep -c 'be-up-' css/admin.css                                        # 0 — Step 6 이 처음 붙인다
```
Expected: `앞 과제 이름 모두 있음`(ExperimentalWarning 한 줄은 괜찮다) · 세 수가 차례로 `1` · `0` · `0`. 하나라도 다르면 **멈추고** 그 과제부터 끝낸다(앵커가 `0` 이면 Task 10 Step 12, `2` 이상이면 누가 줄을 두 번 넣었는지 본다).

- [ ] **Step 2: 실패하는 시험 — `tests/be-upload-logic.test.mjs`**

```js
// 📤 명단 올리기(성경필사(암송)) — 순수 함수 시험. 다듬기·판정은 서버 몫이라 여기서는 「칸 나누기」와 「보여 주기」만 본다.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ORDERS, COL_LABEL, MAX_ROWS, PUBLIC_MAX, MARKS, MARK_ORDER, WILL_ADD, orderOf, parseSheet, sampleLine, cellText,
  sheetText, decodeText, sigOf, markCounts, countOf, displayRow, evHint, eventOptions, pickFrom, overLimit, confirmHtml,
} from "../js/menus/bibleevent/upload-logic.js";
import { whoText, STATUS_KO } from "../js/menus/bibleevent/roster-logic.js";
import { BE_MAX_UPLOAD } from "../supabase/functions/church-admin/events-rules.ts";
import { errorText } from "../js/core/ui.js";
import { MENUS } from "../js/menus/registry.js";

const R = (name, gu = "", mok = "", pos = "") => ({ name, gu, mok, pos });

test("칸 차례 — 기본은 이름·교구·목장·직분 · id 는 겹치지 않고 · 차례마다 이름·교구·목장·직분이 한 번씩", () => {
  assert.equal(ORDERS[0].id, "ngmp");
  assert.deepEqual(ORDERS[0].cols, ["name", "gu", "mok", "pos"]);
  assert.equal(new Set(ORDERS.map((o) => o.id)).size, ORDERS.length);
  for (const o of ORDERS) {
    for (const k of ["name", "gu", "mok", "pos"]) assert.equal(o.cols.filter((c) => c === k).length, 1, `${o.id}: ${k}`);
    for (const k of o.cols) assert.ok(COL_LABEL[k], `${o.id}: ${k} 의 이름`);
    assert.equal(o.label, o.cols.map((k) => COL_LABEL[k]).join(" · "), `${o.id}: 고르개 글자와 칸 차례가 같다`);
  }
  assert.equal(orderOf("npgm").id, "npgm");
  assert.equal(orderOf("없는 차례").id, "ngmp");
  assert.equal(orderOf(undefined).id, "ngmp");
});

test("parseSheet — 탭(엑셀) · 앞뒤 빈칸만 떼고 원문 그대로(다듬기는 서버 몫)", () => {
  const t = "홍길동\t화평교구\t20목장\t집사님\n  ca-test-이 \t 소망 \t 남성목장 \t 권사 \n";
  assert.deepEqual(parseSheet(t, "ngmp"), [R("홍길동", "화평교구", "20목장", "집사님"), R("ca-test-이", "소망", "남성목장", "권사")]);
});

test("parseSheet — 쉼표(CSV) · 겉 따옴표 · BOM · \\r\\n · 모자란 칸은 빈 글자 · 남는 칸은 버림", () => {
  const t = "\uFEFF\"홍길동\",화평,07,\"집사\"\r\nca-test-일,교회학교,유년\r\nca-test-삼,청년,,,메모칸,또\r\n";
  assert.deepEqual(parseSheet(t, "ngmp"), [R("홍길동", "화평", "07", "집사"), R("ca-test-일", "교회학교", "유년", ""), R("ca-test-삼", "청년", "", "")]);
  // 한 줄에 탭이 있으면 쉼표는 칸을 나누지 않는다
  assert.deepEqual(parseSheet("홍길동\t화평\t20\t집사,권사", "ngmp"), [R("홍길동", "화평", "20", "집사,권사")]);
});

test("parseSheet — 제목 줄(첫 칸이나 이름 칸이 「성명」·「이름」)은 어디에 있든 건너뜀", () => {
  assert.deepEqual(parseSheet("성명\t교구\t목장\t직분\n홍길동\t화평\t20\t집사\n성 명\t교구\t목장\t직분", "ngmp"),
    [R("홍길동", "화평", "20", "집사")]);
  assert.deepEqual(parseSheet("이름,교구,목장,직분\n홍길동,화평,20,집사", "ngmp"), [R("홍길동", "화평", "20", "집사")]);
  // 이름이 가운데 칸인 차례 — 이름 칸으로 알아본다
  assert.deepEqual(parseSheet("교구\t목장\t이름\t직분\n화평\t20\t홍길동\t집사", "gmnp"), [R("홍길동", "화평", "20", "집사")]);
  // 맨 앞 번호 칸은 버린다
  assert.deepEqual(parseSheet("번호\t성명\t교구\t목장\t직분\n1\t홍길동\t화평\t20\t집사\n2\tca-test-이\t교회학교\t중등부\t", "xngmp"),
    [R("홍길동", "화평", "20", "집사"), R("ca-test-이", "교회학교", "중등부", "")]);
});

test("parseSheet — 빈 줄·빈 칸만 있는 줄·양식 안내 줄(↑ ※)은 버림 · 칸 차례대로 읽음 · 모르는 차례는 기본", () => {
  const t = "\n\t\t\t\n , , \n↑ 위 칸에 적어 주세요\n※ 한 줄에 한 분\n홍길동\t집사\t화평\t20\n";
  assert.deepEqual(parseSheet(t, "npgm"), [R("홍길동", "화평", "20", "집사")]);
  assert.deepEqual(parseSheet("홍길동\t화평\t20\t집사", "없는 차례"), [R("홍길동", "화평", "20", "집사")]);
  assert.deepEqual(parseSheet("", "ngmp"), []);
  assert.deepEqual(parseSheet(null, "ngmp"), []);
});

test("sampleLine — 붙여넣기 칸 보기 줄이 고른 칸 차례를 따른다", () => {
  assert.equal(sampleLine("ngmp"), "홍길동\t화평\t20\t집사");
  assert.equal(sampleLine("npgm"), "홍길동\t집사\t화평\t20");
  assert.equal(sampleLine("xngmp"), "1\t홍길동\t화평\t20\t집사");
});

test("cellText · sheetText — 엑셀 칸을 글로(날짜·숫자·빈 칸·칸 안 탭), 빈 줄은 버리고 탭으로 잇는다", () => {
  assert.equal(cellText(new Date(2026, 8, 29)), "2026-09-29");
  assert.equal(cellText(20), "20");
  assert.equal(cellText(null), "");
  assert.equal(cellText(undefined), "");
  assert.equal(cellText(" 홍\t길동\n "), "홍 길동");
  const text = sheetText([["홍길동", "화평", 20, "집사"], [], [null, ""], ["ca-test-이", "소망", "남성", null]]);
  assert.equal(text, "홍길동\t화평\t20\t집사\nca-test-이\t소망\t남성\t");
  assert.deepEqual(parseSheet(text, "ngmp"), [R("홍길동", "화평", "20", "집사"), R("ca-test-이", "소망", "남성", "")]);
});

test("decodeText — UTF-8(BOM 떼기) · 못 읽으면 EUC-KR(한국어 엑셀 CSV)", () => {
  const utf8 = new Uint8Array([0xEF, 0xBB, 0xBF, ...new TextEncoder().encode("홍길동,화평")]);
  assert.equal(decodeText(utf8), "홍길동,화평");
  const euckr = new Uint8Array([0xC8, 0xAB, 0xB1, 0xE6, 0xB5, 0xBF, 0x2C, 0x32, 0x30]);   // 「홍길동,20」 EUC-KR
  assert.equal(decodeText(euckr), "홍길동,20");
});

test("한도 — 한 번에 600줄(서버 BE_MAX_UPLOAD 와 같다) · 성도님 명단 1,000명", () => {
  assert.equal(MAX_ROWS, BE_MAX_UPLOAD);
  assert.equal(PUBLIC_MAX, 1000);
  assert.equal(overLimit(990, 10), false);
  assert.equal(overLimit(990, 11), true);
  assert.equal(overLimit(undefined, 0), false);
});

test("sigOf — 회차·채우기·보낼 줄이 하나라도 다르면 달라진다", () => {
  const rows = [R("홍길동", "화평", "20", "집사")];
  const a = sigOf("lent-2026", rows, false);
  assert.equal(a, sigOf("lent-2026", [R("홍길동", "화평", "20", "집사")], false));
  assert.notEqual(a, sigOf("lent-2025", rows, false));
  assert.notEqual(a, sigOf("lent-2026", rows, true));
  assert.notEqual(a, sigOf("lent-2026", [R("홍길동", "화평", "21", "집사")], false));
  assert.notEqual(a, sigOf("lent-2026", [], false));
});

test("판정 — 글자·차례가 다 있고 · 넣는 것은 add·fill 둘뿐 · 판정 줄에서 다시 센다", () => {
  assert.deepEqual(MARK_ORDER.slice().sort(), Object.keys(MARKS).sort());
  assert.deepEqual([...WILL_ADD].sort(), ["add", "fill"]);
  const out = ["add", "add", "fill", "same", "blank", "same-name", "same-name", "bad", "이상한값"].map((mark, i) => ({ i, mark }));
  const c = markCounts(out);
  assert.deepEqual(c, { total: 9, willAdd: 3, add: 2, fill: 1, same: 1, blank: 1, sameName: 2, bad: 1 });
  assert.equal(countOf(c, "same-name"), 2);
  assert.equal(countOf(c, "add"), 2);
  assert.equal(countOf(c, "없는값"), 0);
  assert.deepEqual(markCounts([]), { total: 0, willAdd: 0, add: 0, fill: 0, same: 0, blank: 0, sameName: 0, bad: 0 });
});

test("displayRow — 서버가 다듬은 줄이 있으면 그것(소속 글은 📋 회차·명단 whoText 그대로), 없으면 보낸 원문", () => {
  const sent = [R("홍길동", "화평교구", "20목장", "집사님"), R('홍"길동', "화평", "20", "")];
  const row = { who_type: "교구", group: "화평", sub: "20", name: "홍길동", position: "집사" };
  assert.deepEqual(displayRow({ i: 0, mark: "add", row }, sent), { name: "홍길동", who: "화평 20목장", position: "집사" });
  assert.equal(displayRow({ i: 0, mark: "add", row }, sent).who, whoText(row));
  // 모양 틀림 줄도 다듬은 줄이 오면 그것을 보인다(Task 8) — 소속 글은 같은 whoText
  const kid = { who_type: "교회학교", group: "중등부", sub: "3학년", name: "ca-test-이", position: "" };
  assert.deepEqual(displayRow({ i: 1, mark: "bad", row: kid, error: "bad-sub" }, sent), { name: "ca-test-이", who: "중등부 3학년", position: "" });
  // 소속을 못 정한 줄(who_type "")
  assert.equal(displayRow({ i: 0, mark: "blank", row: { who_type: "", group: "", sub: "", name: "홍길동", position: "" } }, sent).who, "");
  assert.deepEqual(displayRow({ i: 1, mark: "bad", row: null, error: "bad-char" }, sent), { name: '홍"길동', who: "화평 20", position: "" });
  assert.deepEqual(displayRow({ i: 7, mark: "bad", row: null }, sent), { name: "", who: "", position: "" });
});

test("회차 고르개 — 자격 회차는 빼고 · 한 줄 설명(상태 글자는 📋 회차·명단과 같다) · 주소의 회차가 자격 회차면 고르지 않는다", () => {
  const evs = [
    { id: "autumn-2026", title: "가을 말씀 동행", opens_on: "2026-10-27", closes_on: "2026-11-28", status: "draft", count: 0, listedNow: false, hasEligibility: true },
    { id: "lent-2026", title: "2026 사순절", opens_on: "2026-03-01", closes_on: "2026-04-05", status: "closed", count: 1234, listedNow: true, hasEligibility: false },
    { id: "summer-2025", title: "", opens_on: "2025-07-01", closes_on: "2025-08-31", status: "archived", count: 0, listedNow: false, hasEligibility: false },
  ];
  assert.deepEqual(eventOptions(evs).map((o) => o.value), ["lent-2026", "summer-2025"]);
  assert.equal(eventOptions(evs)[1].label, "summer-2025");
  assert.equal(eventOptions(evs)[0].hint, evHint(evs[1]));
  assert.equal(evHint(evs[1]), `2026-03-01 ~ 2026-04-05 · 1,234명 · ${STATUS_KO.closed} · 성도님께 보임`);
  assert.equal(evHint(evs[2]), `2025-07-01 ~ 2025-08-31 · 0명 · ${STATUS_KO.archived}`);
  for (const s of ["draft", "open", "closed", "archived"]) assert.ok(evHint({ ...evs[2], status: s }).includes(STATUS_KO[s]), s);
  assert.deepEqual(pickFrom(evs, "lent-2026"), { ev: evs[1], blocked: false });
  assert.deepEqual(pickFrom(evs, "autumn-2026"), { ev: null, blocked: true });
  assert.deepEqual(pickFrom(evs, "없는-회차"), { ev: null, blocked: false });
  assert.deepEqual(pickFrom(evs, ""), { ev: null, blocked: false });
});

test("confirmHtml — 줄바꿈 문자 없음(dialog 는 pre-line) · 이름을 esc · 건수 · 성도님께 보이는 회차면 한 줄 더", () => {
  const c = markCounts([{ mark: "add" }, { mark: "fill" }, { mark: "same" }, { mark: "blank" }, { mark: "same-name" }, { mark: "bad" }]);
  const html = confirmHtml({ id: "lent-2026", title: "<사순절>", listedNow: true }, 6, c);
  assert.ok(!html.includes("\n"), "줄바꿈 문자가 있으면 창 안에서 줄이 벌어진다");
  assert.ok(html.includes("&lt;사순절&gt;"));
  assert.ok(html.includes("<b>2명</b>을 넣습니다"));
  assert.ok(html.includes("교인명부로 빈칸을 채운 1명 포함"));
  assert.ok(html.includes("지금 적힌 6줄"));
  assert.ok(html.includes("이미 있음 1 · 소속 빈칸 2 · 모양 틀림 1"));
  assert.ok(html.includes("지금 성도님께 보여요"));
  const quiet = confirmHtml({ id: "lent-2026", title: "사순절", listedNow: false }, 1, markCounts([{ mark: "add" }]));
  assert.ok(!quiet.includes("성도님께 보여요"));
  assert.ok(!quiet.includes("넣지 않는 줄"));
  assert.ok(!quiet.includes("채운"));
});

test("이 화면이 보일 오류 코드는 모두 한국말이 있다(ui.js MESSAGES · Task 10)", () => {
  for (const code of ["eligibility-event", "too-many", "not-found", "already", "server", "no-name", "bad-char", "too-long",
    "bad-type", "bad-group", "no-group", "bad-sub"]) {
    assert.notEqual(errorText({ error: code }), "처리하지 못했어요", code);
  }
});

test("메뉴 — 📤 명단 올리기가 📋 회차·명단 바로 다음 · CONTRACT 줄 그대로 · 역할 bibleevent", () => {
  const ids = MENUS.map((m) => m.id);
  assert.equal(ids[ids.indexOf("be-roster") + 1], "be-upload");
  const m = MENUS.find((x) => x.id === "be-upload");
  assert.deepEqual([m.group, m.icon, m.label, m.desc, m.role],
    ["성경필사(암송)", "📤", "명단 올리기", "엑셀·붙여넣기로 한꺼번에 더하기", "bibleevent"]);
});

test("화면 모듈이 Node 에서 읽힌다 — import 한 이름이 모두 있다(틀리면 여기서 SyntaxError)", async () => {
  const m = await import("../js/menus/bibleevent/upload.js");
  assert.equal(typeof m.render, "function");
});
```

Run: `node --experimental-strip-types --test tests/be-upload-logic.test.mjs`
Expected: FAIL — `ERR_MODULE_NOT_FOUND`(`js/menus/bibleevent/upload-logic.js` 가 아직 없다) · `# pass 0` · `# fail 1`

- [ ] **Step 3: 순수 함수 — `js/menus/bibleevent/upload-logic.js`**

```js
// 📤 명단 올리기 — 순수 함수(2026-09-29 · 성경필사(암송)). tests/be-upload-logic.test.mjs 가 같은 파일을 읽는다(DOM 을 쓰지 않는다).
// ⚠️ 여기서는 붙여넣은 글을 **칸으로 나누기만** 한다. 다듬기(「화평교구」→화평 · 「20목장」→20 · 「07」→7 · 이름 끝 숫자 …)와
//    판정(넣음·이미 있음·빈칸·틀림·교인명부로 채움·동명이인)은 서버 events-rules.ts tidyRaw·checkRow 와
//    events-upload.ts · index.ts evUploadCheck/Save(Task 8)가 **처음부터 다시** 한다 — 규칙을 두 곳에 두지 않는다.
//    이 파일의 표·건수는 서버가 준 판정을 보여 주는 데만 쓴다.
// ⚠️ 서버 파일(.ts)은 브라우저가 못 읽는다 — 같아야 하는 값(한 번에 600줄)은 시험이 서버 상수(BE_MAX_UPLOAD)와 맞대 본다.
// ⚠️ 소속 한 줄(whoText)·상태 이름(STATUS_KO)은 📋 회차·명단(roster-logic.js)의 것을 그대로 쓴다 — 여기 따로 두면
//    「받는 중」/「열림」처럼 메뉴마다 글자가 갈린다. 👤 사람별 이력·통계도 roster-logic.js 에서 가져간다.
import { esc } from "../../core/ui.js";
import { STATUS_KO, whoText } from "./roster-logic.js";

export const MAX_ROWS = 600;       // = events-rules.ts BE_MAX_UPLOAD (회차당 가장 많은 명단이 515줄)
// 성경암송 api eventRosterPublic 은 명단을 .limit(5000) 한 번으로 읽는다 — PostgREST 가 1,000행에서 **오류 없이** 자르므로
// 1,000명이 넘는 회차는 성도님 앱 명단이 잘려 보인다(담당자 화면은 쪽을 나눠 읽어 괜찮다). 넘기 전에 알린다(막지는 않는다).
export const PUBLIC_MAX = 1000;

// 칸 차례 — 자리(순서)로 읽는다. skip 은 버리는 칸(시트 맨 앞 번호).
export const COL_LABEL = { name: "이름", gu: "교구", mok: "목장", pos: "직분", skip: "번호" };
export const ORDERS = [
  { id: "ngmp", label: "이름 · 교구 · 목장 · 직분", cols: ["name", "gu", "mok", "pos"] },
  { id: "npgm", label: "이름 · 직분 · 교구 · 목장", cols: ["name", "pos", "gu", "mok"] },
  { id: "gmnp", label: "교구 · 목장 · 이름 · 직분", cols: ["gu", "mok", "name", "pos"] },
  { id: "xngmp", label: "번호 · 이름 · 교구 · 목장 · 직분", cols: ["skip", "name", "gu", "mok", "pos"] },
];
export const orderOf = (id) => ORDERS.find((o) => o.id === id) || ORDERS[0];

const SAMPLE = { name: "홍길동", gu: "화평", mok: "20", pos: "집사", skip: "1" };
// 붙여넣기 칸의 보기 줄 — 고른 칸 차례대로
export const sampleLine = (order) => orderOf(order).cols.map((k) => SAMPLE[k]).join("\t");

const TITLE_RE = /^(성명|이름)$/;
const bare = (s) => String(s || "").replace(/\s+/g, "");
// CSV 칸의 겉 따옴표를 벗긴다(「"홍길동"」 → 홍길동 · 안의 「""」 → 「"」)
const unquote = (c) => {
  const t = String(c ?? "").trim();
  return /^"[\s\S]*"$/.test(t) ? t.slice(1, -1).replace(/""/g, '"').trim() : t;
};

// 붙여넣은 글 → 줄마다 { name, gu, mok, pos } (서버 evUploadCheck 의 rows = RawCells[]).
// 탭(엑셀에서 복사)이 있는 줄은 탭으로, 없으면 쉼표(CSV)로 나눈다. 빈 줄·빈 칸만 있는 줄·양식 안내 줄(↑ ※)은 버린다.
// 제목 줄 — 첫 칸이나 이름 칸이 「성명」·「이름」(띄어 써도)인 줄은 어디에 있든 버린다(시트가 쪽마다 머리글을 되풀이한다).
export function parseSheet(text, order) {
  const cols = orderOf(order).cols;
  const at = cols.indexOf("name");
  const out = [];
  for (const line of String(text ?? "").replace(/^\uFEFF/, "").split(/\r\n|\r|\n/)) {
    if (!line.trim()) continue;
    const cells = (line.includes("\t") ? line.split("\t") : line.split(",")).map(unquote);
    if (!cells.some(Boolean)) continue;
    if (/^[↑※]/.test(cells[0])) continue;
    if (TITLE_RE.test(bare(cells[0])) || TITLE_RE.test(bare(cells[at]))) continue;
    const raw = { name: "", gu: "", mok: "", pos: "" };
    cols.forEach((k, i) => { if (k !== "skip") raw[k] = cells[i] || ""; });
    out.push(raw);
  }
  return out;
}

// 엑셀 칸 → 글자. 날짜는 2026-09-29 꼴, 칸 안의 탭·줄바꿈은 빈칸으로(탭으로 이은 글이 어긋나지 않게).
export function cellText(v) {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    const p = (n) => String(n).padStart(2, "0");
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  return String(v).replace(/[\t\r\n]+/g, " ").trim();
}

// 엑셀 시트(줄마다 칸 배열) → 붙여넣기 칸에 넣을 글(탭으로 잇는다). 빈 줄은 버린다.
export function sheetText(rows) {
  return (rows || []).map((r) => (r || []).map(cellText))
    .filter((r) => r.some(Boolean)).map((r) => r.join("\t")).join("\n");
}

// CSV·텍스트 파일 → 글. 한국어 엑셀이 저장한 CSV 는 흔히 EUC-KR(CP949)이다 — UTF-8 로 못 읽으면 EUC-KR 로.
// (UTF-8 앞의 BOM 은 TextDecoder 가 떼어 준다)
export function decodeText(bytes) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { return new TextDecoder("euc-kr").decode(bytes); }
}

// 살펴본 것과 넣을 것이 같은지 — 회차·채우기·보낼 줄이 하나라도 다르면 다른 값
export const sigOf = (eventId, rows, fill) => JSON.stringify([String(eventId || ""), !!fill, rows || []]);

// 서버 판정(UploadOut.mark) — 화면 글. 넣는 것은 add·fill 둘뿐이다(Task 8 표).
// same-name 은 소속을 못 정한 줄에만 온다 — 소속이 적힌 줄은 동명이인이어도 add(직분 빈 채로 · 까닭은 notes).
export const MARKS = {
  add: { icon: "➕", short: "넣을 것", text: "넣을 것" },
  fill: { icon: "🔎", short: "교인명부로 채움", text: "빈칸을 교인명부로 채워 넣을 것" },
  same: { icon: "＝", short: "이미 있음", text: "이 회차에 이미 있어요 — 넣지 않아요" },
  blank: { icon: "❔", short: "소속 빈칸", text: "소속(교구·부서)이 비어 넣지 않아요" },
  "same-name": { icon: "👥", short: "동명이인", text: "소속이 비었는데 교인명부에 같은 이름이 여러 분이라 채우지 못했어요 — 넣지 않아요" },
  bad: { icon: "⚠️", short: "모양 틀림", text: "모양이 틀려 넣지 않아요" },
};
export const MARK_ORDER = ["add", "fill", "same", "blank", "same-name", "bad"];
export const WILL_ADD = new Set(["add", "fill"]);

// 판정 줄에서 다시 센다(서버 counts 를 믿지 않고 — 넣기 확인 창은 지금 글로 살펴본 이 줄들로 센다)
export function markCounts(out) {
  const c = { total: 0, willAdd: 0, add: 0, fill: 0, same: 0, blank: 0, sameName: 0, bad: 0 };
  for (const o of out || []) {
    c.total++;
    const k = o.mark === "same-name" ? "sameName" : o.mark;
    if (["add", "fill", "same", "blank", "sameName", "bad"].includes(k)) c[k]++;
    if (WILL_ADD.has(o.mark)) c.willAdd++;
  }
  return c;
}
export const countOf = (c, mark) => (mark === "same-name" ? c.sameName : c[mark]) || 0;

// 판정 줄 하나를 보여 줄 값 — 서버가 다듬은 줄(row)이 있으면 그것(모양 틀림 줄도 다듬은 줄이 올 수 있다),
// 없으면(null — 네 칸이 다 빈 줄 등) 보낸 원문. 소속 글은 roster-logic.js whoText(세 메뉴가 같은 꼴).
export function displayRow(o, sent) {
  if (o && o.row) return { name: o.row.name || "", who: whoText(o.row), position: o.row.position || "" };
  const raw = (sent || [])[o?.i] || {};
  return { name: raw.name || "", who: [raw.gu, raw.mok].filter(Boolean).join(" "), position: raw.pos || "" };
}

// 회차 고르개·머리의 한 줄 — 「2026-03-01 ~ 2026-04-05 · 515명 · 마감 · 성도님께 보임」(상태 글자는 📋 회차·명단과 같다)
export function evHint(e) {
  return `${e.opens_on || ""} ~ ${e.closes_on || ""} · ${Number(e.count || 0).toLocaleString("ko-KR")}명 · ` +
    `${STATUS_KO[e.status] || e.status || ""}${e.listedNow ? " · 성도님께 보임" : ""}`;
}
// 고르개에 내놓는 회차 — 자격 회차(가을 말씀 동행처럼 needs.eligibility 가 있는 회차)는 뺀다(설계 0절 · 서버도 eligibility-event)
export const eventOptions = (events) => (events || []).filter((e) => !e.hasEligibility)
  .map((e) => ({ value: e.id, label: e.title || e.id, hint: evHint(e) }));
// 주소(?ev=)나 지난번에 고른 회차 — 없으면 null, 자격 회차면 고르지 않고 blocked
export function pickFrom(events, id) {
  const e = (events || []).find((x) => x.id === id);
  if (!e) return { ev: null, blocked: false };
  return e.hasEligibility ? { ev: null, blocked: true } : { ev: e, blocked: false };
}

export const overLimit = (total, willAdd) => Number(total || 0) + Number(willAdd || 0) > PUBLIC_MAX;

// 넣기 확인 창의 본문 — ⚠️ ui.js dialog 본문은 white-space:pre-line 이라 줄바꿈 문자를 넣지 않는다(한 줄로 잇는다)
export function confirmHtml(ev, lines, c) {
  const skip = [
    c.same && `이미 있음 ${c.same}`,
    (c.blank + c.sameName) && `소속 빈칸 ${c.blank + c.sameName}`,
    c.bad && `모양 틀림 ${c.bad}`,
  ].filter(Boolean);
  return [
    `<b>${esc(ev.title || ev.id)}</b>에 <b>${c.willAdd}명</b>을 넣습니다`,
    c.fill ? ` (교인명부로 빈칸을 채운 ${c.fill}명 포함)` : "",
    ` — 지금 적힌 ${lines}줄을 살펴본 판정으로 센 수예요.`,
    skip.length ? ` 넣지 않는 줄: ${skip.join(" · ")}.` : "",
    ev.listedNow ? `<p class="muted" style="margin-top:8px">⚠️ 이 회차는 지금 성도님께 보여요 — 넣은 분의 이름·소속·직분이 곧바로 앱 명단에 나와요.</p>` : "",
    `<p class="muted" style="margin-top:8px">넣는 순간 서버가 처음부터 다시 판정해요 — 그사이 다른 분이 더했으면 실제로 넣은 수가 조금 다를 수 있어요.</p>`,
  ].join("");
}
```

Run: `node --experimental-strip-types --test tests/be-upload-logic.test.mjs`
Expected: `# pass 15` · `# fail 2` — 남은 둘은 이 뒤 단계가 채운다:
`not ok 16 - 메뉴 — 📤 명단 올리기가 📋 회차·명단 바로 다음 …`(메뉴 줄 없음) · `not ok 17 - 화면 모듈이 Node 에서 읽힌다 …`(`upload.js` 없음).
⚠️ `not ok 15 - 이 화면이 보일 오류 코드는 모두 한국말이 있다` 가 나오면 Task 10 의 `ui.js MESSAGES` 에 빠진 코드가 있는 것이다(assert 글에 코드가 찍힌다) — 여기서 지어 넣지 말고 **멈춰** Task 10 을 마저 끝낸다(문구는 한 곳에서 정한다).
⚠️ `not ok 12 - displayRow …`·`not ok 13 - 회차 고르개 …` 가 나오면 Task 10 `roster-logic.js` 의 `whoText`·`STATUS_KO` 모양이 바뀐 것이다 — 여기서 따로 정의하지 말고 Task 10 과 맞춘다.

- [ ] **Step 4: 화면 — `js/menus/bibleevent/upload.js`**

```js
// 📤 명단 올리기 — 성경필사(암송) 회차에 엑셀·붙여넣기로 여러 분을 한꺼번에 더한다(2026-09-29).
// 설계: 성경암송 저장소 docs/superpowers/specs/2026-09-29-church-admin-bible-events-design.md 3절 「📤 명단 올리기」·1절 「같은 분 판정」.
// 틀은 사역신청 「종이 명단 올리기」(ministry/paper.js)와 같다 — 살펴보기 → 넣기. 순수 논리는 upload-logic.js.
// 서버 evUploadCheck(살펴보기)·evUploadSave(넣기)가 둘 다 **처음부터 다시** 다듬고 판정한다 — 이 화면은 칸을 나눠 보내고
// 받은 판정을 보여 줄 뿐이다. 넣은 줄은 source='import', 메모 「명단 올리기」(서버가 붙인다).
// ⚠️ 자격 회차(needs.eligibility 가 있는 회차 — 가을 말씀 동행)는 고르개에 나오지 않는다(서버도 eligibility-event 로 막는다).
// ⚠️ 「빈칸은 교인명부로 채우기」를 켜고 살펴보면 교인명부 값(소속·직분)이 화면에 나온다 — 서버가 people.fill 기록(채운 분 이름)을 남긴다.
// ⚠️ 시스템 창을 띄우지 않는다 — 확인·알림은 ui.js dialog, 고르기는 picker.js pickOne. 엑셀 **파일 고르기**만 운영체제 창이라
//    붙여넣기 칸과 끌어다 놓기를 함께 둔다.
// ⚠️ 회차를 고르면 주소를 #/be-upload?ev=<id> 로 바꾼다 — replaceState 라 hashchange 가 안 나고(route 가 다시 안 그린다),
//    붙여넣은 글이 그대로 남는다.
import { esc, dialog, busy, errorText } from "../../core/ui.js";
import { pickOne } from "../../core/picker.js";
import {
  ORDERS, COL_LABEL, MAX_ROWS, PUBLIC_MAX, MARKS, MARK_ORDER, orderOf, parseSheet, sampleLine, sheetText, decodeText,
  sigOf, markCounts, countOf, displayRow, eventOptions, pickFrom, evHint, overLimit, confirmHtml,
} from "./upload-logic.js";

const TITLE = `<h2 class="page-title">📤 명단 올리기</h2>`;
const XLSX_CDN = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";   // ministry/paper.js 와 같은 판
const evHref = (id) => "#/be-upload?ev=" + encodeURIComponent(id);

// 메뉴를 옮겨 다녀도 남는 것 — 고른 회차·칸 차례·채우기. 붙여넣은 글과 판정은 남기지 않는다(다시 살펴보게).
let lastEv = "";
let order = ORDERS[0].id;
let fill = false;

// 서버 error 는 코드(ui.js MESSAGES)거나 한국어 문장이다 — 코드 꼴이 아니면 그 문장 그대로(ministry/paper.js errMsg 와 같다)
const errMsg = (d) => (d?.error && !/^[a-z-]+$/.test(d.error) ? d.error : errorText(d));

// .xlsx 는 압축 파일이라 브라우저가 혼자 못 읽는다 — 고를 때만 CDN 에서 내려받는다(ministry/paper.js loadXlsx 를 베꼈다)
function loadXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = XLSX_CDN;
    s.onload = () => (window.XLSX ? res(window.XLSX) : rej(new Error("no-xlsx")));
    s.onerror = () => rej(new Error("no-cdn"));
    document.head.appendChild(s);
  });
}

const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes("Files");

export async function render(el, { call, query }) {
  el.innerHTML = TITLE + `<p class="empty">불러오는 중…</p>`;
  const r = await call("evEvents");
  if (!r.ok) { el.innerHTML = TITLE + `<p class="empty">회차를 불러오지 못했어요 — ${esc(errorText(r))}</p>`; return; }
  const all = r.events || [];
  const opts = eventOptions(all);
  if (!opts.length) {
    el.innerHTML = TITLE + `<p class="empty">명단을 올릴 수 있는 회차가 없어요 — <a href="#/be-roster">📋 회차·명단</a>에서 새 회차를 먼저 만들어 주세요</p>`;
    return;
  }
  // 주소(?ev=)의 회차 → 없으면 지난번에 고른 회차. 주소의 회차가 자격 회차면 고르지 않고 알린다(지난번 회차로 넘어가지 않는다).
  let first = pickFrom(all, query?.ev || "");
  if (!first.ev && !first.blocked) first = pickFrom(all, lastEv);
  let ev = first.ev;
  let blocked = first.blocked;   // 주소의 회차가 자격 회차였다 — 다른 회차를 고를 때까지 알린다
  if (ev) {
    lastEv = ev.id;
    // 지난번 회차로 열었으면 주소도 그 회차로 — 새로고침해도 같은 회차(기다리는 사이 다른 메뉴로 갔으면 건드리지 않는다)
    if (query?.ev !== ev.id && el.isConnected) history.replaceState(null, "", evHref(ev.id));
  }

  el.innerHTML = TITLE + `
    <button type="button" class="be-up-ev" data-act="ev"></button>
    <div class="be-up-note" id="be-up-evnote" hidden></div>
    <div class="adm-acts">
      <button type="button" class="btn" data-act="check">살펴보기</button>
      <button type="button" class="btn primary" data-act="save" hidden>명단 넣기</button>
    </div>
    <div class="card">
      <div class="be-up-how">
        <div class="be-up-row"><b>칸 차례</b><button type="button" class="be-up-pill" data-act="order"></button></div>
        <div class="be-up-cols" id="be-up-cols"></div>
        <div class="be-up-row">
          <button type="button" class="be-up-pill" data-act="pick">📂 엑셀 파일 고르기</button>
          <input type="file" id="be-up-file" accept=".xlsx,.xls,.csv,.tsv,.txt" hidden>
          <span class="be-up-fname" id="be-up-fname"></span>
        </div>
      </div>
      <details class="be-up-guide">
        <summary>📌 적는 법 · 주의할 것</summary>
        <ul class="be-up-ul">
          <li>한 줄에 한 분 — 칸은 위 <b>칸 차례</b>대로 적습니다(엑셀에서 복사하면 탭, CSV 는 쉼표). 맨 위 「성명」·「이름」 제목 줄은 건너뜁니다.</li>
          <li>교구 칸에 <b>「교회학교」</b>를 적으면 목장 칸에 부서(유년부·중등부…)를, <b>「청년부」</b>(또는 「청년」)를 적으면 교회학교 청년부로 넣습니다.</li>
          <li>「화평교구」→화평 · 「20목장」→20 · 「07」→7 · 「남성목장」→남성 · 「유년」→유년부 · 직분 「집사님」→집사처럼 <b>알아서 다듬고</b> 줄마다 알려 드려요.</li>
          <li>이름 끝 숫자(「홍길동2」 — 시트의 동명이인 표시)는 떼고 알려 드려요.</li>
          <li>이 회차에 <b>이미 있는 분</b>(앱에서 낸 신청 포함)은 넣지 않아요 — 같은 명단을 두 번 올려도 안전합니다.</li>
          <li>앱 계정이 있는 분은 <b>이어 드려요</b>(계정을 새로 만들지는 않아요). 이어진 분은 성도님 앱 「📋 이미 내신 것」에 보이고,
              등록 기간 중인 회차면 성도님이 앱에서 고치거나 취소할 수 있어요.</li>
          <li><b>빈칸은 교인명부로 채우기</b> — 교인명부에 그 이름이 한 분뿐일 때만, 비어 있는 칸만 채워요(적힌 교구·목장·직분은 덮지 않아요.
              교구 칸이 비어 교구를 채울 때만 목장도 교인명부 것으로 바꾸고 알려 드려요). 적힌 소속이 교인명부와 다르면 다른 분으로 보고 채우지 않아요.
              소속이 비었는데 같은 이름이 여러 분이면 <b>👥 동명이인</b>으로 넣지 않고, 소속이 적힌 줄은 직분만 빈 채로 넣어요.</li>
          <li>넣은 줄의 담당자 메모에 「명단 올리기」가 남아요. 한 번에 <b>${MAX_ROWS}줄</b>까지.</li>
        </ul>
      </details>
      <div class="be-up-drop">
        <textarea id="be-up-text" class="be-up-text" rows="8" spellcheck="false" aria-label="명단 붙여넣기"></textarea>
        <p class="be-up-droptip">엑셀에서 칸을 복사해 붙여넣거나, 엑셀·CSV 파일을 이 칸으로 끌어다 놓아도 돼요.</p>
      </div>
      <label class="be-up-fill"><input type="checkbox" id="be-up-fill">
        <span><b>빈칸은 교인명부로 채우기</b>
          <small>교인명부에 그 이름이 한 분뿐일 때만 비어 있는 교구·목장·직분을 채워요 — 적힌 칸은 덮지 않고, 적힌 소속이 교인명부와 다르면 채우지 않아요.
            살펴보기만 해도 채운 분 이름이 열람 기록에 남아요.</small></span></label>
      <div id="be-up-sum" class="be-up-sum"></div>
      <div id="be-up-marks" class="tabs be-up-marks" role="group" aria-label="판정으로 거르기" hidden></div>
      <div id="be-up-list"></div>
    </div>`;

  const $ = (s) => el.querySelector(s);
  const ta = $("#be-up-text"), fileInput = $("#be-up-file"), fname = $("#be-up-fname"), fillBox = $("#be-up-fill");
  const sumEl = $("#be-up-sum"), marksEl = $("#be-up-marks"), listEl = $("#be-up-list");
  const saveBtn = el.querySelector('[data-act="save"]'), drop = el.querySelector(".be-up-drop");
  const mqWide = matchMedia("(min-width:1024px)");
  let checked = null;    // 마지막 살펴보기 { evId, sig, sent, out, total, oddPosition } — sig 가 지금 글과 같을 때만 쓴다
  let savedRes = null;   // 넣은 뒤 서버 답 { saved, failed, counts }
  let mk = "all";        // 판정 거르기 칩
  fillBox.checked = fill;

  const drawEv = () => {
    $('[data-act="ev"]').innerHTML = `<span class="be-up-ev-t"><small>올릴 회차</small>` +
      (ev ? `<b>${esc(ev.title || ev.id)}</b><small>${esc(evHint(ev))}</small>` : `<b>회차를 골라 주세요</b>`) +
      `</span><span class="be-up-arrow" aria-hidden="true">▾</span>`;
    const note = $("#be-up-evnote");
    note.classList.toggle("info", !blocked);
    note.hidden = !blocked && !ev?.listedNow;
    note.textContent = blocked
      ? "주소의 회차는 자격 회차(가을 말씀 동행처럼 자격으로 정해지는 명단)라 여기서 올리지 않아요 — 다른 회차를 골라 주세요"
      : "이 회차는 지금 성도님께 보여요 — 넣은 분의 이름·소속·직분이 곧바로 앱 명단에 나와요";
  };

  const drawOrder = () => {
    const o = orderOf(order);
    $('[data-act="order"]').textContent = o.label + " ▾";
    $("#be-up-cols").innerHTML = o.cols.map((k) => `<span${k === "skip" ? ' class="dim"' : ""}>${esc(COL_LABEL[k])}${k === "skip" ? "(버림)" : ""}</span>`).join("");
    ta.placeholder = sampleLine(order);
  };

  // 글·회차·칸 차례·채우기가 바뀌면 앞서 살핀 결과는 버린다 — 옛 판정으로 넣는 일을 막는다
  const resetAfterEdit = () => {
    checked = null;
    savedRes = null;
    mk = "all";
    saveBtn.hidden = true;
    sumEl.innerHTML = "";
    marksEl.hidden = true;
    marksEl.innerHTML = "";
    listEl.innerHTML = "";
  };

  // 지금 글이 살펴본 것과 같은가 — 글·회차·칸 차례·채우기 중 하나라도 다르면 false(input 이벤트를 놓친 경우까지 막는다)
  const nowSig = () => sigOf(ev?.id, parseSheet(ta.value, order), fill);
  const staleNotice = async () => {
    resetAfterEdit();
    await dialog({ title: "📋 살펴본 뒤 바뀐 것이 있어요", text: "명단·회차·칸 차례·채우기 중 무엇이 바뀌었어요 — 「살펴보기」를 다시 눌러 주세요", cancel: null });
  };

  const cardHtml = (o) => {
    const m = MARKS[o.mark] || { icon: "•", text: o.mark };
    const d = displayRow(o, checked.sent);
    return `<div class="be-up-item m-${esc(o.mark)}">
      <div class="be-up-top"><span aria-hidden="true">${m.icon}</span><b>${esc(d.name || "(이름 없음)")}</b>
        <small>${esc(d.who)}</small>${d.position ? `<span class="be-up-pos">${esc(d.position)}</span>` : ""}
        <span class="be-up-no">${o.i + 1}번째</span></div>
      <div class="be-up-msg">${esc(m.text)}</div>
      ${o.error ? `<div class="be-up-msg bad">${esc(errMsg({ error: o.error }))}</div>` : ""}
      ${(o.notes || []).map((n) => `<div class="be-up-msg note">ℹ️ ${esc(n)}</div>`).join("")}
    </div>`;
  };
  const tableHtml = (rows) => `<div class="be-up-wrap"><table class="be-up-table"><thead><tr>` +
    `<th>순서</th><th>판정</th><th>이름</th><th>소속</th><th>직분</th><th>알림</th></tr></thead><tbody>` +
    rows.map((o) => {
      const m = MARKS[o.mark] || { icon: "•", short: o.mark };
      const d = displayRow(o, checked.sent);
      const msgs = [o.error ? `<div class="be-up-msg bad">${esc(errMsg({ error: o.error }))}</div>` : "",
        ...(o.notes || []).map((n) => `<div class="be-up-msg note">ℹ️ ${esc(n)}</div>`)].join("");
      return `<tr class="m-${esc(o.mark)}"><td>${o.i + 1}</td><td>${m.icon} ${esc(m.short)}</td>` +
        `<td><b>${esc(d.name || "(이름 없음)")}</b></td><td>${esc(d.who)}</td><td>${esc(d.position)}</td><td>${msgs}</td></tr>`;
    }).join("") + `</tbody></table></div>`;

  const drawResult = () => {
    if (!checked) return;
    const c = markCounts(checked.out);
    if (savedRes) {
      // 넣은 뒤 — 살펴본 목록은 이제 옛 판정이라 치우고, 넣은 수·못 넣은 줄·명단 보러 가기만 둔다
      const sc = savedRes.counts || {};
      sumEl.innerHTML = `📥 <b>${savedRes.saved}명</b>을 넣었어요` +
        (savedRes.failed.length ? ` · 넣지 못한 줄 <b>${savedRes.failed.length}</b>` : "") +
        ` · 넣을 때 다시 본 판정 — 이미 있음 ${sc.same || 0} · 소속 빈칸 ${(sc.blank || 0) + (sc.sameName || 0)} · 모양 틀림 ${sc.bad || 0}` +
        `<br><a href="#/be-roster?ev=${encodeURIComponent(checked.evId)}">📋 회차·명단에서 보기 →</a>`;
      saveBtn.hidden = true;
      marksEl.hidden = true;
      listEl.innerHTML = savedRes.failed.map((f) => {
        const d = displayRow(checked.out.find((o) => o.i === f.i) || { i: f.i, row: null }, checked.sent);
        return `<div class="be-up-item m-bad"><div class="be-up-top"><span aria-hidden="true">⚠️</span><b>${esc(d.name || "(이름 없음)")}</b>` +
          `<small>${esc(d.who)}</small><span class="be-up-no">${f.i + 1}번째</span></div>` +
          `<div class="be-up-msg bad">${esc(errMsg({ error: f.error }))}</div></div>`;
      }).join("");
      return;
    }
    const parts = [`살펴본 줄 <b>${c.total}</b> · 넣을 것 <b>${c.willAdd}</b>${c.fill ? ` (교인명부로 채운 ${c.fill} 포함)` : ""}`];
    if (c.same) parts.push(`이미 있음 <b>${c.same}</b>`);
    if (c.blank + c.sameName) parts.push(`소속 빈칸 <b>${c.blank + c.sameName}</b>`);
    if (c.bad) parts.push(`모양 틀림 <b>${c.bad}</b>`);
    let html = parts.join(" · ") + `<br>이 회차에 지금 <b>${Number(checked.total).toLocaleString("ko-KR")}명</b>`;
    if (checked.oddPosition) html += ` · 직분 확인 <b>${checked.oddPosition}</b>줄(앱 직분 목록 밖 — 막지는 않아요)`;
    if (overLimit(checked.total, c.willAdd)) {
      html += `<span class="warn">⚠️ 넣으면 이 회차가 ${PUBLIC_MAX.toLocaleString("ko-KR")}명을 넘어요 — 성도님 앱 명단은 ` +
        `${PUBLIC_MAX.toLocaleString("ko-KR")}명까지만 보여요. 넣기 전에 관리자에게 알려 주세요.</span>`;
    }
    sumEl.innerHTML = html;
    saveBtn.hidden = !c.willAdd;
    saveBtn.textContent = `${c.willAdd}명 넣기`;
    marksEl.hidden = false;
    marksEl.innerHTML = [["all", "모두", c.total], ...MARK_ORDER.map((k) => [k, MARKS[k].short, countOf(c, k)])]
      .filter(([k, , n]) => k === "all" || n)
      .map(([k, t, n]) => `<button type="button" data-mk="${k}" class="${mk === k ? "on" : ""}" aria-pressed="${mk === k}">${esc(t)} <em>${n}</em></button>`)
      .join("");
    const rows = mk === "all" ? checked.out : checked.out.filter((o) => o.mark === mk);
    listEl.innerHTML = !rows.length ? `<p class="empty">이 판정의 줄이 없어요</p>`
      : mqWide.matches ? tableHtml(rows) : rows.map(cardHtml).join("");
  };

  async function check() {
    if (!ev) { await dialog({ title: "📤 회차를 먼저 골라 주세요", text: "맨 위 「올릴 회차」를 눌러 골라 주세요", cancel: null }); return; }
    const rows = parseSheet(ta.value, order);
    if (!rows.length) { await dialog({ title: "📋 붙여넣은 것이 없어요", text: "엑셀에서 칸을 복사해 붙여넣거나 파일을 골라 주세요", cancel: null }); return; }
    if (rows.length > MAX_ROWS) {
      await dialog({ title: "📋 줄이 너무 많아요", text: `한 번에 ${MAX_ROWS}줄까지 올릴 수 있어요 — 지금 ${rows.length}줄이에요. 나눠서 올려 주세요.`, cancel: null });
      return;
    }
    // 보낸 값 그대로 기억한다 — 기다리는 사이 채우기 칸을 바꿔도 판정과 표식이 어긋나지 않게
    const evId = ev.id, fillNow = fill, sig = sigOf(evId, rows, fillNow);
    const d = await busy(el, () => call("evUploadCheck", { event_id: evId, rows, fill: fillNow }));
    if (!d.ok) { await dialog({ title: "⚠️ 살펴보지 못했어요", text: errMsg(d), cancel: null, danger: true }); return; }
    // 기다리는 사이 글·채우기가 바뀌었으면(input 이벤트가 이미 결과를 치웠다) 옛 판정을 그리지 않는다
    if (nowSig() !== sig) return;
    checked = { evId, sig, sent: rows, out: d.rows || [], total: Number(d.total) || 0, oddPosition: d.counts?.oddPosition || 0 };
    savedRes = null;
    mk = "all";
    drawResult();
    sumEl.scrollIntoView({ block: "center" });
  }

  async function save() {
    if (!ev || !checked) return;
    // ⚠️ 넣는 순간 **지금 글**을 다시 읽는다 — 살펴본 것과 하나라도 다르면(글·회차·칸 차례·채우기) 넣지 않는다.
    //    확인 창의 건수는 그 같은 글로 살펴본 판정 줄에서 다시 센다.
    const rows = parseSheet(ta.value, order);
    if (sigOf(ev.id, rows, fill) !== checked.sig) return staleNotice();
    const base = checked;
    const c = markCounts(base.out);
    if (!c.willAdd) return;
    const yes = await dialog({ title: "📥 명단을 넣습니다", ok: `${c.willAdd}명 넣기`, cancel: "그만두기", html: confirmHtml(ev, rows.length, c) });
    if (!yes) return;
    // 확인 창이 떠 있는 사이에 바뀌었을 수도 있다 — 한 번 더 본다
    if (checked !== base || nowSig() !== base.sig) return staleNotice();
    const evId = ev.id, fillNow = fill;
    const d = await busy(el, () => call("evUploadSave", { event_id: evId, rows, fill: fillNow }));
    if (!d.ok) { await dialog({ title: "⚠️ 넣지 못했어요", text: errMsg(d), cancel: null, danger: true }); return; }
    // 넣는 사이 글을 고쳐 결과가 치워졌어도 「몇 명을 넣었는지」는 꼭 보인다(살펴본 판정 base 로 그린다)
    checked = base;
    savedRes = { saved: Number(d.saved) || 0, failed: d.failed || [], counts: d.counts || {} };
    drawResult();
    sumEl.scrollIntoView({ block: "center" });
  }

  async function readFile(f) {
    fname.textContent = f.name + " 읽는 중…";
    try {
      let text;
      if (/\.(csv|tsv|txt)$/i.test(f.name)) {
        text = decodeText(new Uint8Array(await f.arrayBuffer()));
      } else if (/\.xlsx?$/i.test(f.name)) {
        // 시트가 여럿이면 「명단」 시트를 먼저 본다(안내 시트를 실수로 읽지 않게)
        const XLSX = await loadXlsx();
        const wb = XLSX.read(await f.arrayBuffer(), { type: "array", cellDates: true });
        const sheet = wb.SheetNames.indexOf("명단") >= 0 ? "명단" : wb.SheetNames[0];
        text = sheetText(XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, blankrows: false, raw: true }));
      } else {
        throw new Error("kind");
      }
      const n = parseSheet(text, order).length;
      if (!n) throw new Error("empty");
      ta.value = text;
      resetAfterEdit();   // 파일에서 채운 글도 「글이 바뀐 것」과 같다 — 살펴보기부터 다시
      fname.textContent = `${f.name} · ${n}줄 읽음`;
    } catch {
      fname.textContent = "";
      await dialog({ title: "📂 파일을 읽지 못했어요", text: "엑셀(.xlsx)·CSV 파일만 읽어요 — 안 되면 엑셀에서 칸을 복사해 붙여넣어 주세요", cancel: null, danger: true });
    }
  }

  el.addEventListener("click", async (e) => {
    const chip = e.target.closest("[data-mk]");
    if (chip) { mk = chip.dataset.mk; drawResult(); return; }
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "check") return check();
    if (act === "save") return save();
    if (act === "pick") return fileInput.click();
    if (act === "ev") {
      const v = await pickOne({ anchor: b, title: "어느 회차에 올릴까요?", options: opts, value: ev?.id || "" });
      if (v == null || v === ev?.id) return;
      const next = all.find((x) => x.id === v);
      if (!next || next.hasEligibility) return;
      ev = next;
      lastEv = ev.id;
      blocked = false;
      if (el.isConnected) history.replaceState(null, "", evHref(ev.id));
      resetAfterEdit();
      drawEv();
      return;
    }
    if (act === "order") {
      const v = await pickOne({ anchor: b, title: "칸 차례 — 엑셀 칸이 어떤 차례인가요?",
        options: ORDERS.map((o) => ({ value: o.id, label: o.label })), value: order });
      if (v == null || v === order) return;
      order = v;
      drawOrder();
      resetAfterEdit();
    }
  });
  el.addEventListener("input", (e) => { if (e.target === ta) resetAfterEdit(); });
  el.addEventListener("change", (e) => {
    if (e.target === fillBox) { fill = fillBox.checked; resetAfterEdit(); return; }
    if (e.target === fileInput) {
      const f = fileInput.files && fileInput.files[0];
      fileInput.value = "";   // 같은 파일을 다시 고를 수 있게
      if (f) readFile(f);
    }
  });

  // 끌어다 놓기 — 파일이면 읽고, 글이면 브라우저가 붙여넣는다(input 이벤트로 이어진다)
  drop.addEventListener("dragover", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    drop.classList.add("over");
  });
  drop.addEventListener("dragleave", (e) => { if (!drop.contains(e.relatedTarget)) drop.classList.remove("over"); });
  drop.addEventListener("drop", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    drop.classList.remove("over");
    const f = e.dataTransfer.files[0];
    if (f) readFile(f);
  });
  // 칸 밖에 떨어뜨려도 브라우저가 그 파일을 열어 화면을 떠나지 않게 — 이 화면이 떠 있는 동안만(사라지면 스스로 떨어진다)
  const detach = () => {
    window.removeEventListener("dragover", onWinDrag);
    window.removeEventListener("drop", onWinDrag);
    mqWide.removeEventListener("change", onMq);
  };
  const onWinDrag = (e) => {
    if (!el.isConnected) return detach();
    if (!hasFiles(e) || drop.contains(e.target)) return;
    e.preventDefault();
    if (e.type === "dragover") e.dataTransfer.dropEffect = "none";
  };
  const onMq = () => { if (!el.isConnected) return detach(); drawResult(); };
  window.addEventListener("dragover", onWinDrag);
  window.addEventListener("drop", onWinDrag);
  mqWide.addEventListener("change", onMq);

  drawEv();
  drawOrder();
}
```

Run: `node --check js/menus/bibleevent/upload.js && node --experimental-strip-types --test tests/be-upload-logic.test.mjs`
Expected: 문법 통과(아무것도 안 찍힘) · `# pass 16` · `# fail 1`(`not ok 16 - 메뉴 …` 만 남음). 17번(화면 모듈)이 통과한다 = `upload.js` 가 들여오는 이름(`pickOne`·`esc`·`dialog`·`busy`·`errorText`·`upload-logic.js` 의 스무 개)이 모두 있다.

- [ ] **Step 5: 메뉴 줄 — `js/menus/registry.js`(앵커 뒤에 두 줄)**

앵커는 Task 10 의 `be-roster` 줄 끝 `import("./bibleevent/roster.js") },` 다. 그 글이 든 줄 **바로 다음**에 CONTRACT 의 `be-upload` 줄을 두 줄로 넣는다(Task 10 이 한 줄로 썼어도 같다). 저장소 파일은 CRLF 라 그 줄바꿈을 그대로 따른다.

```bash
grep -c 'import("./bibleevent/roster.js") },' js/menus/registry.js   # 1 이어야 한다(아니면 멈춘다)
grep -c 'bibleevent/upload' js/menus/registry.js                     # 0 이어야 한다
node - <<'JS'
const fs = require("fs");
const p = "js/menus/registry.js";
const s = fs.readFileSync(p, "utf8");
const nl = s.includes("\r\n") ? "\r\n" : "\n";
const anchor = 'import("./bibleevent/roster.js") },';
const at = s.indexOf(anchor);
if (at < 0 || s.indexOf(anchor, at + 1) >= 0) throw new Error("앵커가 한 번이 아니다 — 멈춘다");
if (s.includes("bibleevent/upload")) throw new Error("be-upload 줄이 이미 있다 — 두 번 넣지 않는다");
const eol = s.indexOf(nl, at);
if (eol < 0) throw new Error("앵커 줄 끝을 못 찾았다");
const end = eol + nl.length;
const add = [
  '  { id: "be-upload", group: "성경필사(암송)", icon: "📤", label: "명단 올리기", desc: "엑셀·붙여넣기로 한꺼번에 더하기",',
  '    role: "bibleevent", load: () => import("./bibleevent/upload.js") },',
].join(nl) + nl;
fs.writeFileSync(p, s.slice(0, end) + add + s.slice(end));
console.log("be-upload 줄을 더했다");
JS
grep -c 'import("./bibleevent/upload.js") },' js/menus/registry.js   # 1
git diff --stat -- js/menus/registry.js                              # 1 file changed, 2 insertions(+)
```

Run: `node --experimental-strip-types --test tests/be-upload-logic.test.mjs tests/registry.test.mjs`
Expected: `# fail 0`(지금 main 기준 `# pass 21` = 17 + registry 4 — registry 시험의 「메뉴 모듈 파일이 있다」가 `./bibleevent/upload.js` 를 찾는다).

- [ ] **Step 6: 모양 — `css/admin.css` 끝에 `be-up-` 이어 붙이기**

```bash
grep -c 'be-up-' css/admin.css      # 0 이어야 한다(두 번 붙이지 않는다)
node - <<'JS'
const fs = require("fs");
const p = "css/admin.css";
const s = fs.readFileSync(p, "utf8");
if (s.includes(".be-up-")) throw new Error("be-up- 블록이 이미 있다 — 두 번 붙이지 않는다");
const nl = s.includes("\r\n") ? "\r\n" : "\n";
const block = String.raw`
/* ── 📤 명단 올리기(be-up-) — 성경필사(암송) be- 블록의 이어짐(Task 11 · 2026-09-29) ──────────────
   틀은 사역신청 종이 명단(.mp-*)과 같게, 이름만 be-up- 로 따로 둔다(한 메뉴의 모양이 다른 메뉴를 흔들지 않게).
   크기는 표준 v1 토큰으로 — 주 단추 48 · 둘째 44 · 칩 36 · 글씨 13 이상. */
.be-up-ev{display:flex;align-items:center;gap:8px;width:100%;min-height:var(--tap-lg);padding:8px 14px;margin:0 0 10px;
  border:1px solid var(--ghost-bd);border-radius:12px;background:#fff;text-align:left;cursor:pointer}
.be-up-ev-t{flex:1;min-width:0;display:flex;flex-direction:column}
.be-up-ev-t b{font-size:15px;color:var(--navy)}
.be-up-ev-t small{font-size:13px;color:var(--gray)}
.be-up-arrow{flex:none;color:var(--gray)}
.be-up-note{font-size:13px;line-height:1.6;border-radius:10px;padding:8px 12px;margin:0 0 12px;background:#fff8e6;color:#7a5f16}
.be-up-note.info{background:var(--ghost-bg);color:var(--navy)}
.be-up-how{display:flex;flex-direction:column;gap:8px;font-size:13px;line-height:1.7;color:#41506b;background:#f3f6fb;
  border-radius:12px;padding:11px 13px;margin-bottom:10px}
.be-up-row{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px}
.be-up-row>b{font-size:13px;font-weight:800;color:var(--navy)}
.be-up-pill{display:inline-flex;align-items:center;min-height:var(--tap);padding:0 14px;border:1px solid var(--ghost-bd);
  border-radius:999px;background:#fff;color:var(--navy);font-size:14px;font-weight:700;cursor:pointer}
.be-up-cols{display:flex;flex-wrap:wrap;gap:4px}
.be-up-cols span{font-size:13px;font-weight:800;color:#41506b;background:#fff;border-radius:7px;padding:2px 7px}
.be-up-cols span.dim{color:var(--gray);font-weight:700}
.be-up-fname{font-size:13px;color:#41506b}
.be-up-guide{margin:0 0 10px;border:1px solid #e3e8f1;border-radius:10px;background:#f8fafd}
.be-up-guide>summary{list-style:none;cursor:pointer;display:flex;align-items:center;min-height:var(--tap);padding:0 12px;
  font-size:14px;font-weight:800;color:var(--navy)}
.be-up-guide>summary::-webkit-details-marker{display:none}
.be-up-guide[open]>summary{border-bottom:1px solid #e3e8f1}
.be-up-ul{margin:10px 12px 8px;padding-left:18px;font-size:13px;line-height:1.7;color:#41506b}
.be-up-ul li{margin:2px 0}
.be-up-drop{border:2px dashed transparent;border-radius:12px;margin-bottom:10px}
.be-up-drop.over{border-color:var(--navy);background:var(--ghost-bg)}
.be-up-text{display:block;width:100%;font:inherit;font-size:1rem;line-height:1.6;padding:10px;border:1px solid var(--border);
  border-radius:10px;background:#fff;color:var(--navy);resize:vertical}
.be-up-droptip{font-size:13px;color:var(--gray);margin:4px 2px 0}
.be-up-fill{display:flex;align-items:flex-start;gap:10px;min-height:var(--tap);padding:10px 12px;margin-bottom:10px;
  border:1px solid var(--border);border-radius:12px;background:#fff;cursor:pointer}
.be-up-fill input{flex:none;width:22px;height:22px;margin-top:1px;accent-color:var(--navy)}
.be-up-fill b{display:block;font-size:14px;color:var(--navy)}
.be-up-fill small{display:block;font-size:13px;color:var(--gray);line-height:1.5}
.be-up-fill:has(input:checked){border-color:var(--navy);background:var(--ghost-bg)}
.be-up-sum{font-size:13px;line-height:1.7;color:#41506b;background:#eef1f8;border-radius:8px;padding:8px 12px;margin-bottom:10px}
.be-up-sum:empty{display:none}
.be-up-sum b{color:var(--navy)}
.be-up-sum a{display:inline-flex;align-items:center;min-height:var(--chip);font-weight:800}
.be-up-sum .warn{display:block;margin-top:4px;color:var(--error);font-weight:700}
.be-up-marks{margin-top:4px}
.be-up-item{border:1px solid #e3e8f1;border-left:4px solid var(--ghost-bd);border-radius:10px;padding:8px 10px;
  margin-top:var(--gap);background:#fff}
.be-up-item.m-fill{border-left-color:#7fc39b}
.be-up-item.m-same{border-left-color:#cdd8ea;background:#f7f9fc}
.be-up-item.m-blank,.be-up-item.m-same-name{border-left-color:#e2c27a;background:#fffaf0}
.be-up-item.m-bad{border-left-color:#e0a3a3;background:#fdf5f5}
.be-up-top{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 7px}
.be-up-top b{font-size:14px;font-weight:800;color:var(--navy)}
.be-up-top small{font-size:13px;color:#6b778c}
.be-up-pos{font-size:13px;font-weight:700;color:#41506b}
.be-up-no{margin-left:auto;font-size:13px;color:var(--gray)}
.be-up-msg{font-size:13px;line-height:1.6;margin-top:3px;color:#41506b}
.be-up-msg.bad{color:var(--error)}
.be-up-msg.note{color:#7a5f16}
.be-up-wrap{overflow-x:auto;margin-top:var(--gap)}
.be-up-table{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--border)}
.be-up-table th,.be-up-table td{padding:7px 10px;border-bottom:1px solid var(--light);text-align:left;font-size:14px;vertical-align:top}
.be-up-table thead th{background:var(--light);font-size:13px;color:var(--gray);white-space:nowrap}
.be-up-table tr.m-same td{color:#6b778c}
.be-up-table tr.m-bad td{background:#fdf5f5}
.be-up-table tr.m-blank td,.be-up-table tr.m-same-name td{background:#fffaf0}
.be-up-table td:nth-child(2){white-space:nowrap}
.be-up-table .be-up-msg{margin-top:0}
`;
fs.writeFileSync(p, s.replace(/\s+$/, "") + nl + block.replace(/\n/g, nl).replace(/\s+$/, "") + nl);
console.log("be-up- 블록을 붙였다");
JS
node -e "const s=require('fs').readFileSync('css/admin.css','utf8'); console.log('여는', (s.match(/[{]/g)||[]).length, '닫는', (s.match(/[}]/g)||[]).length)"
# 이 블록만 본다(파일의 다른 메뉴에는 원래 12px 가 있다) — 표지 글 「(be-up-)」 부터 끝까지
node -e "const s=require('fs').readFileSync('css/admin.css','utf8'); const b=s.slice(s.indexOf('(be-up-)')); const small=(b.match(/font-size:\d+px/g)||[]).filter((x)=>parseInt(x.slice(10),10)<13); console.log(small.length ? '작은 글씨: ' + small.join(' ') : 'be-up- 블록에 13px 미만 글씨 없음')"
git diff --stat -- css/admin.css
```
Expected: `be-up- 블록을 붙였다` · 두 수가 같다(괄호가 짝이 맞는다) · `be-up- 블록에 13px 미만 글씨 없음` · `git diff` 는 `css/admin.css` 한 파일, 늘어난 줄만(빈 줄 하나 + 블록). 누름 자리 높이는 토큰(`--tap-lg` 48 · `--tap` 44 · `--chip` 36)만 쓴다. 다시 돌리면 `be-up- 블록이 이미 있다` 로 멈춘다(두 번 붙지 않는다).

- [ ] **Step 7: 문법 · 금지 부품 · preflight**

```bash
for f in js/menus/bibleevent/upload-logic.js js/menus/bibleevent/upload.js; do node --check "$f" || echo "문법 실패: $f"; done
# 금지 부품 — 설명 주석(// …)에 적힌 이름은 빼고 본다. 파일 고르기(type="file")·체크 칸(type="checkbox")은 허용
grep -nE "\b(alert|confirm|prompt)\(|<select|type=\"?(date|time)\"?|datalist|beforeunload" js/menus/bibleevent/upload*.js \
  | grep -vE "^[^:]+:[0-9]+:\s*//" || echo "금지 부품 없음"
python tools/preflight.py
```
Expected: 문법 실패 줄 없음 · `금지 부품 없음` · preflight `[1]` 에 `js/menus/bibleevent/upload-logic.js`·`upload.js` 가 `통과` · `[2] 시험 파일 N개 통과` · 끝줄 `모두 통과`.

- [ ] **Step 8: 커밋**

```bash
git add js/menus/bibleevent/upload-logic.js js/menus/bibleevent/upload.js tests/be-upload-logic.test.mjs js/menus/registry.js css/admin.css
git diff --cached --stat   # 이 다섯 파일만
git commit -m "feat(성경필사): 📤 명단 올리기 — 칸 차례·붙여넣기·끌어다 놓기·엑셀 · 교인명부로 채우기 · 살펴보기 → 넣기" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git show --stat HEAD      # 다섯 파일만인지 본다
git status --short        # 아무것도 없어야 한다
```

> **Task 14(localhost 친구 확인) 점검표에 더할 것 — 📤 명단 올리기**
> ① 자격 회차는 **회차 고르개에 나오지 않는다**. 주소 `#/be-upload?ev=<자격 회차 id>` 로 들어오면 고르지 않고 노란 줄 「주소의 회차는 자격 회차(가을 말씀 동행처럼 자격으로 정해지는 명단)라 여기서 올리지 않아요 — 다른 회차를 골라 주세요」 한 줄 — 살펴보기까지 가지 않는다(서버의 `eligibility-event` 막음은 Task 8 개발 시험이 본다) ② 회차·칸 차례 고르기가 우리 고르개(폰 아래 판 · PC 작은 판)로 뜨고 시스템 고르개가 안 뜬다 ③ 엑셀(.xlsx)·CSV(UTF-8·한국어 엑셀이 저장한 EUC-KR) 파일을 고르기·끌어다 놓기 둘 다로 읽는다 · 칸 **밖**에 떨어뜨려도 화면을 떠나지 않는다 ④ 살펴본 뒤 글을 한 글자 고치면 「N명 넣기」 단추가 사라진다 ⑤ 「빈칸은 교인명부로 채우기」를 켜고 살펴보면 🔎 줄이 나오고 「바꾼 기록 → 교인명부 기록」에 `people.fill` 이 남는다 ⑥ 넣기 확인 창(제목 「📥 명단을 넣습니다」 · 단추 「N명 넣기」/「그만두기」)의 건수 = 판정 칩의 「넣을 것 + 교인명부로 채움」 · 같은 글을 다시 살펴보면 전부 「이미 있음」 ⑦ 넣은 뒤 「📋 회차·명단에서 보기 →」가 그 회차를 연다 ⑧ PC(≥1024px)는 표, 폰은 카드 ⑨ 다른 메뉴에 갔다 돌아오면 고른 회차·칸 차례·채우기가 남아 있고, 붙여넣은 글은 비어 있다.

---

### Task 12: 👤 사람별 이력·통계 화면(history · history-logic) · 메뉴 줄 · 시험

이름으로 한 분의 모든 회차 이력을 보고(설계 3절 「👤 사람별 이력·통계」), 고른 회차들의 통계 — **회차별 인원 막대 · 교구(부서)×회차 표 · 여러 번 참여한 분(3회 이상 기본)** — 를 보고 내려받는다.

- 사람 묶음은 서버(`evHistory`·`evStats` — Task 4 `personGroups`)가 만든다. **근삿값**이라(같은 이름·같은 소속 또는 같은 앱 계정) 화면과 내려받기에 늘 그렇게 적는다(`APPROX`). 묶음 이름표는 서버가 준 순번·이름·소속뿐(`user_id` 는 오지 않는다).
- **이름표 모양(CONTRACT 5절)**: 통계 `repeaters` 한 줄 = `{ n, name, label, times, events }` 이고 `label` 은 **소속만**(서버 `evWho` 규칙 — 교구는 숫자 목장에만 「목장」: 「화평 20목장」·「소망 남성」·「중등부」). 화면은 「이름 · 소속」으로 보이고 CSV 는 「이름」「소속」 두 칸. `evHistory` 의 `groups[].label` 은 서버가 이미 `` `${name} · ${소속}` `` 으로 준다 — 그대로 보인다.
- 빠른 고르기(「소책자」 `lent-booklet-` · 「사순절」 그 밖의 `lent-` · 「썸머」 `summer-`)는 서버 `events-stats.ts quickPick` 과 같은 규칙이다. 브라우저는 `.ts` 를 못 읽어 `history-logic.js quickKey` 에 한 번 더 적고, **시험이 두 함수를 같은 id 들로 맞대 본다**(한쪽만 고치면 시험이 실패한다). 셋에 안 드는 회차(가을 말씀 동행)는 「✔️ 직접 고르기」(`pickMany`)로만. 회차 고르개에는 보관 회차까지 모두 나온다(CONTRACT 5절).
- 서버 `evStats` 는 3회 이상만 보낸다(`statsOf` 의 `minRepeat` 기본값 — Task 5 는 이 값을 받지 않는다). 그래서 「N회 이상」 칩은 **3회부터** 가장 많은 횟수까지이고, 화면이 거른다. 없는 회차 id 는 서버가 조용히 뺀다(`perEvent` 에 안 나온다).
- 이름 찾기는 「찾기」 단추·Enter 로만 부른다(글자마다 부르지 않는다). 이력에서 회차 이름을 누르면 `#/be-roster?ev=<id>`, 여러 번 참여한 분을 누르면 그분 이력으로 간다.
- 내려받기는 지금 고른 회차·「N회 이상」 그대로 한 CSV(BOM · `\r\n`)에 세 표. 브라우저 창 없이 `a[download]`(교인명부 `people/search.js download` 와 같은 방식 — 크롬 「저장 위치 묻기」 창은 브라우저 설정이라 예외).
- 소속 한 줄은 Task 10 `roster-logic.js whoText`(Task 11 과 같은 곳)에서 가져온다.
- 이 과제도 개인정보 안내를 고치지 않는다(교회 어드민 `privacy.html` 은 Task 13 · 성경암송 `privacy/` 는 그대로 — 설계 8절 7).

기준: Task 11 까지 커밋된 `bible-events` 가지(main `a2dfd7c` 위). 앵커 글로 찾고 `grep -c` 로 먼저 본다.
모든 명령은 워크트리에서(`cd /c/Projects/church-admin/.worktrees/bible-events`). 서버는 바꾸지 않는다. 푸시하지 않는다.

**Files:**
- Create: `js/menus/bibleevent/history-logic.js` (순수 함수)
- Create: `js/menus/bibleevent/history.js` (화면)
- Create: `tests/be-history-logic.test.mjs`
- Modify: `js/menus/registry.js` — 앵커 `import("./bibleevent/upload.js") },`(Task 11 의 `be-upload` 줄 끝)가 든 줄 **바로 다음**에 두 줄
- Modify: `css/admin.css` — 파일 **끝**(Task 11 의 `be-up-` 뒤)

**Interfaces:**
- Consumes:
  - 서버(Task 5) `evEvents {}` → `{ok, today, events:[EvEventOut]}`(마감일 늦은 회차 먼저) · `evHistory {name}` → `{ok, groups:[{n, label, rows:[{event_id,title,closes_on,who_type,group,sub,position,source,hasUser}]}]}`(`label` = 「이름 · 소속」 · 오류 `no-name`·`bad-char`·`too-long`) · `evStats {event_ids:string[]}`(빈 배열 = 전부 · 100개 넘거나 모양이 틀리면 `bad-event-id`) → `{ok, perEvent:[{id,title,count}], byGroup:[{who_type,group_name,counts:Record<id,number>,total}], repeaters:[{n,name,label,times,events:string[]}]}` — `perEvent` 는 기간 차례(마감일 이른 것 먼저) · `perEvent`·`byGroup` 은 **줄 수** · `repeaters[].label` 은 **소속만** · `repeaters[].events` 는 회차 **id**(기간 차례)
  - Task 4 `events-stats.ts` `quickPick(eventId)`(시험만 — 규칙 맞대기)
  - Task 10 `roster-logic.js` `SRC_LABEL = {app:"📱 앱", import:"📋 이관"}` · `whoText(r)` · 📋 회차·명단의 `query.ev`
  - `js/core/picker.js` `pickMany({anchor, title, options:[{value,label,hint?}], values}) → Promise<values[]|null>` · `js/core/ui.js` `esc`·`toast`·`busy`·`errorText` · Task 10 `MESSAGES`(`no-name`·`bad-event-id` …)
- Produces:
  - `history-logic.js`: `APPROX` · `MIN_REPEAT = 3` · `QUICK: [key,label][]` · `quickKey(id): "소책자"|"사순절"|"썸머"|null` · `quickIds(events, key): string[]` · `quickChips(events): {key,label,n}[]` · `chipOn(events, sel): "all"|key|"custom"` · `labelMap(events): Map<id, 짧은 이름>` · `barRows(perEvent, labels): {id,label,count,pct}[]` · `crossTable(stats, labels): {cols, rows, foot}` · `repeatChoices(repeaters): {min,n}[]` · `repeatersAt(repeaters, min)` · `statsCsv(stats, labels, min): string` · `csvName(now?): string` · `histSummary(groups): {people,times}` · `histRowText(r): string`
  - `history.js`: `render(el, { call })`
  - `registry.js` 줄 `be-history`(CONTRACT 그대로) · CSS `be-hi-*`

- [ ] **Step 1: 선행 확인 — 앞 과제의 이름과 앵커가 있는가**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
node --experimental-strip-types --input-type=module -e "
const need = {
  './js/core/picker.js': ['pickMany'],
  './js/core/ui.js': ['esc', 'toast', 'busy', 'errorText'],
  './js/menus/bibleevent/roster-logic.js': ['SRC_LABEL', 'whoText'],
  './supabase/functions/church-admin/events-stats.ts': ['quickPick'],
};
for (const [f, ks] of Object.entries(need)) { const m = await import(f); for (const k of ks) if (typeof m[k] === 'undefined') throw new Error(f + ' 에 ' + k + ' 가 없다'); }
const { MENUS } = await import('./js/menus/registry.js');
if (!MENUS.some((m) => m.id === 'be-upload')) throw new Error('registry 에 be-upload 가 없다(Task 11)');
const { ACTION_ROLES } = await import('./supabase/functions/church-admin/authz.ts');
for (const a of ['evEvents', 'evHistory', 'evStats']) if (ACTION_ROLES[a] !== 'bibleevent') throw new Error('authz 에 ' + a + ' 가 없다(Task 5)');
console.log('앞 과제 이름 모두 있음');
"
grep -c 'import("./bibleevent/upload.js") },' js/menus/registry.js   # 1 — Step 5 의 앵커(Task 11 의 be-upload 줄 끝)
grep -c 'bibleevent/history' js/menus/registry.js                    # 0 — 아직 없다
grep -c 'be-hi-' css/admin.css                                        # 0 — Step 6 이 처음 붙인다
```
Expected: `앞 과제 이름 모두 있음` · 세 수가 차례로 `1` · `0` · `0`. 아니면 멈추고 그 과제부터.

- [ ] **Step 2: 실패하는 시험 — `tests/be-history-logic.test.mjs`**

```js
// 👤 사람별 이력·통계(성경필사(암송)) — 순수 함수 시험. 숫자는 서버(events-stats.ts)가 내고, 여기서는 고르기·표·내려받기 꼴을 본다.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  APPROX, MIN_REPEAT, QUICK, quickKey, quickIds, quickChips, chipOn, labelMap, barRows, crossTable, repeatChoices,
  repeatersAt, statsCsv, csvName, histSummary, histRowText,
} from "../js/menus/bibleevent/history-logic.js";
import { quickPick } from "../supabase/functions/church-admin/events-stats.ts";
import { errorText } from "../js/core/ui.js";
import { MENUS } from "../js/menus/registry.js";

// 회차 목록(evEvents 차례 — 마감일 늦은 것 먼저). id 는 운영 회차 모양 그대로(개인정보 아님).
const EVS = [
  { id: "autumn-2026", title: "가을 말씀 동행", short_title: "가을 동행", closes_on: "2026-11-28", count: 0 },
  { id: "summer-2026", title: "2026 썸머 써 바이블", short_title: "", closes_on: "2026-08-31", count: 199 },
  { id: "lent-booklet-2026", title: "2026 사순절 소책자", short_title: "소책자 26", closes_on: "2026-04-05", count: 80 },
  { id: "lent-2026", title: "2026 사순절 성경필사", short_title: "사순절 26", closes_on: "2026-04-05", count: 515 },
  { id: "lent-2025", title: "2025 사순절 성경필사", short_title: "사순절 25", closes_on: "2025-04-20", count: 400 },
];
// evStats 모양(CONTRACT 5절) — repeaters[].label 은 **소속만**(evWho 꼴), events 는 회차 id
const STATS = {
  perEvent: [{ id: "lent-2026", title: "2026 사순절 성경필사", count: 3 }, { id: "lent-2025", title: "2025 사순절 성경필사", count: 0 },
    { id: "summer-2026", title: "2026 썸머 써 바이블", count: 1 }],
  byGroup: [
    { who_type: "교구", group_name: "화평", counts: { "lent-2026": 2, "summer-2026": 1 }, total: 3 },
    { who_type: "교구", group_name: "기쁨", counts: { "lent-2026": 1 }, total: 1 },
    { who_type: "교회학교", group_name: "청년부", counts: {}, total: 0 },
  ],
  repeaters: [
    { n: 1, name: "홍길동", label: "화평 20목장", times: 5, events: ["lent-2026", "summer-2026", "없는-회차"] },
    { n: 2, name: "ca-test-이", label: "기쁨 3목장", times: 3, events: ["lent-2026"] },
  ],
};

test("빠른 고르기 — 서버 events-stats.ts quickPick 과 같은 id 에서 같은 답", () => {
  const ids = ["lent-booklet-2024", "lent-booklet-2025", "lent-booklet-2026", "lent-2022", "lent-2023", "lent-2024",
    "lent-2025", "lent-2026", "summer-2024", "summer-2025", "summer-2026", "autumn-2026", "lent", "lentx-2026",
    "summerx", "booklet-lent-2024", "ca-test-1", ""];
  for (const id of ids) assert.equal(quickKey(id), quickPick(id), id);
  assert.equal(quickKey("lent-booklet-2026"), "소책자");
  assert.equal(quickKey("lent-2026"), "사순절");
  assert.equal(quickKey("summer-2026"), "썸머");
  assert.equal(quickKey("autumn-2026"), null);
  assert.equal(quickKey(undefined), null);
  assert.deepEqual(QUICK.map(([k]) => k), ["소책자", "사순절", "썸머"]);
});

test("quickIds · quickChips — 묶음마다 회차(차례 그대로) · 회차 없는 묶음은 칩을 안 낸다", () => {
  assert.deepEqual(quickIds(EVS, "사순절"), ["lent-2026", "lent-2025"]);
  assert.deepEqual(quickIds(EVS, "소책자"), ["lent-booklet-2026"]);
  assert.deepEqual(quickChips(EVS).map((c) => [c.key, c.n]), [["소책자", 1], ["사순절", 2], ["썸머", 1]]);
  assert.deepEqual(quickChips(EVS.filter((e) => !e.id.startsWith("summer-"))).map((c) => c.key), ["소책자", "사순절"]);
  assert.deepEqual(quickChips([]), []);
});

test("chipOn — null·전부는 all · 빠른 고르기와 같으면 그 열쇠(차례 무관) · 그 밖은 custom", () => {
  assert.equal(chipOn(EVS, null), "all");
  assert.equal(chipOn(EVS, EVS.map((e) => e.id)), "all");
  assert.equal(chipOn(EVS, ["lent-2025", "lent-2026"]), "사순절");
  assert.equal(chipOn(EVS, ["summer-2026"]), "썸머");
  assert.equal(chipOn(EVS, ["lent-2026"]), "custom");
  assert.equal(chipOn(EVS, ["lent-2026", "summer-2026"]), "custom");
  assert.equal(chipOn(EVS, ["autumn-2026"]), "custom");
});

test("labelMap — 짧은 이름 → 제목 → id", () => {
  const m = labelMap(EVS);
  assert.equal(m.get("lent-2026"), "사순절 26");
  assert.equal(m.get("summer-2026"), "2026 썸머 써 바이블");
  assert.equal(labelMap([{ id: "x-1", title: "", short_title: "" }]).get("x-1"), "x-1");
});

test("barRows — 가장 많은 회차가 100% · 0명은 0% · 적어도 2% · 이름은 짧은 이름", () => {
  const b = barRows([{ id: "a", title: "A", count: 400 }, { id: "b", title: "B", count: 1 }, { id: "c", title: "C", count: 0 },
    { id: "d", title: "D", count: 100 }], new Map([["a", "에이"]]));
  assert.deepEqual(b.map((x) => [x.id, x.label, x.count, x.pct]), [["a", "에이", 400, 100], ["b", "B", 1, 2], ["c", "C", 0, 0], ["d", "D", 100, 25]]);
  assert.deepEqual(barRows([{ id: "z", title: "Z", count: 0 }]).map((x) => x.pct), [0]);
  assert.deepEqual(barRows([]), []);
});

test("crossTable — 열은 회차 차례 · 구분이 바뀌는 곳에 머리 줄 · 빈 칸은 0 · 맨 아래 합계", () => {
  const x = crossTable(STATS, labelMap(EVS));
  assert.deepEqual(x.cols, [{ id: "lent-2026", label: "사순절 26" }, { id: "lent-2025", label: "사순절 25" }, { id: "summer-2026", label: "2026 썸머 써 바이블" }]);
  assert.deepEqual(x.rows, [
    { head: true, label: "교구" },
    { head: false, label: "화평", cells: [2, 0, 1], total: 3 },
    { head: false, label: "기쁨", cells: [1, 0, 0], total: 1 },
    { head: true, label: "교회학교" },
    { head: false, label: "청년부", cells: [0, 0, 0], total: 0 },
  ]);
  assert.deepEqual(x.foot, { cells: [3, 0, 1], total: 4 });
  assert.deepEqual(crossTable({ perEvent: [], byGroup: [], repeaters: [] }, new Map()), { cols: [], rows: [], foot: { cells: [], total: 0 } });
});

test("여러 번 참여 — 「N회 이상」 칩은 3회부터 가장 많은 횟수까지 · 거르기", () => {
  assert.equal(MIN_REPEAT, 3);
  assert.deepEqual(repeatChoices(STATS.repeaters), [{ min: 3, n: 2 }, { min: 4, n: 1 }, { min: 5, n: 1 }]);
  assert.deepEqual(repeatChoices([]), []);
  assert.deepEqual(repeatersAt(STATS.repeaters, 4).map((p) => p.n), [1]);
  assert.deepEqual(repeatersAt(STATS.repeaters, 3).map((p) => p.n), [1, 2]);
  assert.deepEqual(repeatersAt(undefined, 3), []);
});

test("statsCsv — BOM · \\r\\n · 세 표 · 따옴표 · 회차 id 는 짧은 이름으로 · 여러 번 참여는 「이름」「소속」 두 칸 · 근삿값 안내", () => {
  const csv = statsCsv(STATS, labelMap(EVS), 4);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.deepEqual(csv.slice(1).split("\r\n"), [
    '"회차별 인원"',
    '"회차","인원"',
    '"2026 사순절 성경필사","3"',
    '"2025 사순절 성경필사","0"',
    '"2026 썸머 써 바이블","1"',
    "",
    '"교구(부서) × 회차 — 명단 줄 수"',
    '"구분","소속","사순절 26","사순절 25","2026 썸머 써 바이블","합계"',
    '"교구","화평","2","0","1","3"',
    '"교구","기쁨","1","0","0","1"',
    '"교회학교","청년부","0","0","0","0"',
    '"합계","","3","0","1","4"',
    "",
    `"여러 번 참여한 분 — 4회 이상 · ${APPROX}"`,
    '"이름","소속","횟수","참여 회차"',
    '"홍길동","화평 20목장","5","사순절 26 · 2026 썸머 써 바이블 · 없는-회차"',
  ]);
  assert.ok(statsCsv({ ...STATS, repeaters: [{ n: 1, name: '홍"길동', label: "x", times: 9, events: [] }] }, new Map(), 3)
    .includes('"홍""길동"'));
});

test("csvName — 한국 날짜(UTC 자정 넘은 저녁은 다음 날)", () => {
  assert.equal(csvName(new Date("2026-09-29T14:59:00Z")), "성경필사_통계_20260929.csv");
  assert.equal(csvName(new Date("2026-09-29T15:00:00Z")), "성경필사_통계_20260930.csv");
});

test("이력 — 몇 분·모두 몇 회 · 한 줄의 소속·직분(📋 회차·명단 whoText 꼴)", () => {
  const groups = [{ n: 1, label: "홍길동 · 화평 20목장", rows: [{}, {}, {}] }, { n: 2, label: "홍길동 · 청년부", rows: [{}] }];
  assert.deepEqual(histSummary(groups), { people: 2, times: 4 });
  assert.deepEqual(histSummary([]), { people: 0, times: 0 });
  assert.equal(histRowText({ who_type: "교구", group: "화평", sub: "20", position: "집사" }), "화평 20목장 · 집사");
  assert.equal(histRowText({ who_type: "교구", group: "소망", sub: "남성", position: "" }), "소망 남성");
  assert.equal(histRowText({ who_type: "교회학교", group: "청년부", sub: "", position: "" }), "청년부");
});

test("이 화면이 보일 오류 코드는 모두 한국말이 있다(ui.js MESSAGES · Task 10)", () => {
  for (const code of ["no-name", "bad-char", "too-long", "bad-event-id"]) {
    assert.notEqual(errorText({ error: code }), "처리하지 못했어요", code);
  }
});

test("메뉴 — 성경필사(암송) 세 메뉴가 사역신청 뒤·교인명부 앞에 차례대로 · CONTRACT 줄 그대로 · 역할 bibleevent", () => {
  const ids = MENUS.map((m) => m.id);
  const i = ids.indexOf("be-roster");
  assert.deepEqual(ids.slice(i, i + 3), ["be-roster", "be-upload", "be-history"]);
  assert.equal(MENUS.filter((m) => m.group === "성경필사(암송)").length, 3);
  // 다른 세션이 사역신청·교인명부에 메뉴를 더해도 깨지지 않게 — 옆 메뉴의 id 가 아니라 묶음으로 본다
  assert.equal(MENUS[i - 1].group, "사역신청");
  assert.equal(MENUS[i + 3].group, "교인명부");
  const m = MENUS.find((x) => x.id === "be-history");
  assert.deepEqual([m.group, m.icon, m.label, m.desc, m.role],
    ["성경필사(암송)", "👤", "사람별 이력·통계", "이름으로 찾기 · 회차별·교구별 · 여러 번 참여", "bibleevent"]);
  const groups = [...new Set(MENUS.map((x) => x.group))];
  assert.equal(groups.indexOf("성경필사(암송)"), groups.indexOf("사역신청") + 1);
  assert.equal(groups.indexOf("교인명부"), groups.indexOf("성경필사(암송)") + 1);
});

test("화면 모듈이 Node 에서 읽힌다 — import 한 이름이 모두 있다(틀리면 여기서 SyntaxError)", async () => {
  const m = await import("../js/menus/bibleevent/history.js");
  assert.equal(typeof m.render, "function");
});
```

Run: `node --experimental-strip-types --test tests/be-history-logic.test.mjs`
Expected: FAIL — `ERR_MODULE_NOT_FOUND`(`history-logic.js` 가 아직 없다) · `# pass 0` · `# fail 1`

- [ ] **Step 3: 순수 함수 — `js/menus/bibleevent/history-logic.js`**

```js
// 👤 사람별 이력·통계 — 순수 함수(2026-09-29 · 성경필사(암송)). tests/be-history-logic.test.mjs 가 같은 파일을 읽는다(DOM 을 쓰지 않는다).
// 숫자는 서버 evStats(events-stats.ts statsOf)가 낸다 — 여기서는 고르기·표·내려받기 꼴만 만든다.
// ⚠️ 빠른 고르기(소책자·사순절·썸머) 규칙은 서버 events-stats.ts quickPick 과 **같아야** 한다. 브라우저는 .ts 를 못 읽어
//    여기 한 번 더 적고, 시험이 두 함수를 같은 id 들로 맞대 본다(한쪽만 고치면 시험이 실패한다).
// ⚠️ 사람 묶음은 근삿값이다(같은 이름·같은 소속 또는 같은 앱 계정) — 화면과 내려받기에 늘 그렇게 적는다.
// ⚠️ 여러 번 참여한 분(repeaters)의 label 은 **소속만**이다(CONTRACT 5절) — 이름은 name 칸. 화면은 「이름 · 소속」, CSV 는 두 칸.
import { whoText } from "./roster-logic.js";

export const APPROX = "같은 이름·같은 소속(또는 같은 앱 계정)을 한 분으로 셌어요 — 근삿값이에요. 목장을 옮기신 해는 따로 나올 수 있어요.";
export const MIN_REPEAT = 3;   // 서버 statsOf 의 minRepeat 기본값 — 서버는 3회 이상만 보낸다

// 빠른 고르기 — [열쇠, 칩 글자]. 열쇠는 서버 quickPick 이 돌려주는 값 그대로.
export const QUICK = [["소책자", "📘 소책자"], ["사순절", "✝️ 사순절"], ["썸머", "☀️ 썸머"]];
export function quickKey(id) {
  const s = String(id ?? "");
  if (s.startsWith("lent-booklet-")) return "소책자";   // 소책자도 lent- 로 시작한다 — 먼저 본다
  if (s.startsWith("lent-")) return "사순절";
  if (s.startsWith("summer-")) return "썸머";
  return null;   // 가을 말씀 동행 등은 개별로만 고른다
}
export const quickIds = (events, key) => (events || []).filter((e) => quickKey(e.id) === key).map((e) => e.id);
// 칩 — 회차가 하나도 없는 묶음은 내놓지 않는다
export const quickChips = (events) => QUICK.map(([key, label]) => ({ key, label, n: quickIds(events, key).length }))
  .filter((c) => c.n > 0);
// 지금 고른 것(sel — null 이면 전부)이 어느 칩인가: "all" · 빠른 고르기 열쇠 · "custom"
export function chipOn(events, sel) {
  if (!sel) return "all";
  const s = new Set(sel);
  const same = (ids) => ids.length === s.size && ids.every((id) => s.has(id));
  if (same((events || []).map((e) => e.id))) return "all";
  for (const [key] of QUICK) {
    const ids = quickIds(events, key);
    if (ids.length && same(ids)) return key;
  }
  return "custom";
}

// 회차 id → 짧은 이름(없으면 제목, 그것도 없으면 id) — 표 머리·막대 이름
export const labelMap = (events) => new Map((events || []).map((e) => [e.id, e.short_title || e.title || e.id]));
const lb = (labels, id, fallback) => labels?.get(id) || fallback || id;

// 회차별 인원 막대 — 가장 많은 회차가 100%. 0명이 아니면 적어도 2%(보이게).
export function barRows(perEvent, labels) {
  const list = perEvent || [];
  const max = Math.max(0, ...list.map((e) => Number(e.count) || 0));
  return list.map((e) => {
    const count = Number(e.count) || 0;
    return { id: e.id, label: lb(labels, e.id, e.title), count, pct: max ? Math.max(count ? 2 : 0, Math.round((count / max) * 100)) : 0 };
  });
}

// 교구(부서) × 회차 표 — 열은 perEvent 차례, 줄은 서버 byGroup 차례(교구 먼저). 구분이 바뀌는 곳에 머리 줄.
export function crossTable(stats, labels) {
  const per = stats?.perEvent || [];
  const cols = per.map((e) => ({ id: e.id, label: lb(labels, e.id, e.title) }));
  const rows = [];
  let kind = null;
  for (const g of stats?.byGroup || []) {
    if (g.who_type !== kind) { kind = g.who_type; rows.push({ head: true, label: kind || "구분 없음" }); }
    rows.push({ head: false, label: g.group_name || "(소속 빈칸)", cells: cols.map((c) => Number(g.counts?.[c.id]) || 0), total: Number(g.total) || 0 });
  }
  const cells = per.map((e) => Number(e.count) || 0);
  return { cols, rows, foot: { cells, total: cells.reduce((s, n) => s + n, 0) } };
}

// 「N회 이상」 칩 — 3회부터 가장 많이 참여한 횟수까지, 칩마다 그 이상인 분 수
export function repeatChoices(repeaters) {
  const list = repeaters || [];
  const max = Math.max(0, ...list.map((x) => Number(x.times) || 0));
  const out = [];
  for (let m = MIN_REPEAT; m <= max; m++) out.push({ min: m, n: list.filter((x) => x.times >= m).length });
  return out;
}
export const repeatersAt = (repeaters, min) => (repeaters || []).filter((x) => x.times >= min);

// 통계 내려받기 — 엑셀에서 바로 열리게 CSV(BOM · \r\n). 세 표를 빈 줄로 나눠 한 파일에.
// 여러 번 참여한 분은 「이름」「소속」 두 칸(repeaters 의 name·label — label 은 소속만).
export function statsCsv(stats, labels, min) {
  const cell = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
  const x = crossTable(stats, labels);
  const lines = [["회차별 인원"], ["회차", "인원"]];
  for (const e of stats?.perEvent || []) lines.push([e.title || e.id, e.count]);
  lines.push([], ["교구(부서) × 회차 — 명단 줄 수"], ["구분", "소속", ...x.cols.map((c) => c.label), "합계"]);
  let kind = "";
  for (const r of x.rows) {
    if (r.head) { kind = r.label; continue; }
    lines.push([kind, r.label, ...r.cells, r.total]);
  }
  lines.push(["합계", "", ...x.foot.cells, x.foot.total]);
  lines.push([], [`여러 번 참여한 분 — ${min}회 이상 · ${APPROX}`], ["이름", "소속", "횟수", "참여 회차"]);
  for (const p of repeatersAt(stats?.repeaters, min)) {
    lines.push([p.name, p.label, p.times, (p.events || []).map((id) => lb(labels, id)).join(" · ")]);
  }
  return "\uFEFF" + lines.map((row) => row.map(cell).join(",")).join("\r\n");
}
// 파일 이름 — 한국 날짜
export function csvName(now = new Date()) {
  const d = new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, "");
  return `성경필사_통계_${d}.csv`;
}

// 이름 찾기 결과 — 몇 분(묶음)·모두 몇 회
export const histSummary = (groups) => ({
  people: (groups || []).length,
  times: (groups || []).reduce((s, g) => s + (g.rows || []).length, 0),
});
// 이력 한 줄의 소속·직분 — 「화평 20목장 · 집사」(소속 글은 📋 회차·명단 whoText)
export const histRowText = (r) => [whoText(r), r?.position].filter(Boolean).join(" · ");
```

Run: `node --experimental-strip-types --test tests/be-history-logic.test.mjs`
Expected: `# pass 11` · `# fail 2` — `not ok 12 - 메뉴 — 성경필사(암송) 세 메뉴가 …`(메뉴 줄 없음) · `not ok 13 - 화면 모듈이 Node 에서 읽힌다 …`(`history.js` 없음).
⚠️ `not ok 1 - 빠른 고르기 — 서버 events-stats.ts quickPick 과 …` 이 나오면 Task 4 의 `quickPick` 규칙이 설계(2절 끝 — `lent-booklet-` 소책자 · 그 밖의 `lent-` 사순절 · `summer-` 썸머)와 다른 것이다. 여기 `quickKey` 를 서버에 맞추지 말고 **멈춰** 어느 쪽이 설계와 다른지 본다.

- [ ] **Step 4: 화면 — `js/menus/bibleevent/history.js`**

```js
// 👤 사람별 이력·통계 — 성경필사(암송) 모든 회차를 사람 쪽에서 본다(2026-09-29).
// 설계: 성경암송 저장소 docs/superpowers/specs/2026-09-29-church-admin-bible-events-design.md 3절 「👤 사람별 이력·통계」·2절 「사람 묶음」.
// 서버 evHistory(이름 → 사람 묶음마다 회차 이력)·evStats(고른 회차의 회차별 인원·교구×회차·여러 번 참여한 분). 순수 논리는 history-logic.js.
// ⚠️ 사람 묶음은 근삿값이다 — 같은 이름·같은 소속(또는 같은 앱 계정)을 한 분으로 본다. 화면·내려받기에 늘 그렇게 적는다.
//    묶음 이름표는 서버가 준 순번·이름·소속뿐이다(user_id 는 오지 않는다). 여러 번 참여한 분은 name(이름) + label(소속만)을
//    「이름 · 소속」으로 잇는다(CONTRACT 5절).
// ⚠️ 이름 찾기는 「찾기」 단추·Enter 로만 부른다(글자마다 부르지 않는다). 교적 값이 아니라 열람 기록은 남지 않는다.
// ⚠️ 시스템 창을 띄우지 않는다 — 회차 여러 개 고르기는 picker.js pickMany, 알림은 ui.js toast. 내려받기는 a[download].
import { esc, toast, busy, errorText } from "../../core/ui.js";
import { pickMany } from "../../core/picker.js";
import { SRC_LABEL } from "./roster-logic.js";
import {
  APPROX, MIN_REPEAT, quickChips, quickIds, chipOn, labelMap, barRows, crossTable, repeatChoices, repeatersAt, statsCsv,
  csvName, histSummary, histRowText,
} from "./history-logic.js";

const TITLE = `<h2 class="page-title">👤 사람별 이력·통계</h2>`;
const TABS = [["person", "👤 사람별 이력"], ["stats", "📊 통계"]];
const n = (x) => Number(x || 0).toLocaleString("ko-KR");
const rosterHref = (id) => `#/be-roster?ev=${encodeURIComponent(id)}`;

// 메뉴를 옮겨 다녀도 남는 것 — 보던 쪽·찾던 이름·고른 회차·「N회 이상」. 결과는 열 때마다 새로 받는다.
let tab = "person";
let lastName = "";
let sel = null;          // 통계에 쓸 회차 id 들 — null 이면 전부(서버에 빈 배열)
let minRepeat = MIN_REPEAT;

// CSV 내려받기 — people/search.js download 와 같다(Blob + a[download] · 창을 띄우지 않는다)
function download(text, name) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function render(el, { call }) {
  el.innerHTML = TITLE + `<p class="empty">불러오는 중…</p>`;
  const r = await call("evEvents");
  if (!r.ok) { el.innerHTML = TITLE + `<p class="empty">회차를 불러오지 못했어요 — ${esc(errorText(r))}</p>`; return; }
  const events = r.events || [];                      // 마감일 늦은 회차 먼저(서버 차례) · 보관 회차까지 모두
  const labels = labelMap(events);
  const known = new Set(events.map((e) => e.id));
  if (sel) { sel = sel.filter((id) => known.has(id)); if (!sel.length) sel = null; }   // 그사이 없어진 회차는 뺀다
  let hist = null;    // 마지막 이름 찾기 { name, groups }
  let stats = null;   // 마지막 통계 { perEvent, byGroup, repeaters } — 지금 sel 로 받은 것

  el.innerHTML = TITLE + `
    <div class="tabs be-hi-tabs" role="tablist">${TABS.map(([v, t]) =>
      `<button type="button" role="tab" data-tab="${v}">${t}</button>`).join("")}</div>
    <div class="be-hi-person">
      <form class="be-hi-find" role="search">
        <input type="search" class="search" maxlength="40" placeholder="이름 (예: 홍길동)" autocomplete="off"
          enterkeyhint="search" aria-label="찾을 이름">
        <button type="submit" class="btn primary">찾기</button>
      </form>
      <p class="muted be-hi-note">${esc(APPROX)}</p>
      <div class="be-hi-res"></div>
    </div>
    <div class="be-hi-stats" hidden>
      <div class="tabs be-hi-quick" role="group" aria-label="통계에 넣을 회차"></div>
      <p class="muted be-hi-selsum"></p>
      <div class="acts be-hi-acts"><button type="button" class="btn" data-act="csv">⬇️ 통계 내려받기</button></div>
      <div class="be-hi-out"></div>
    </div>`;

  const $ = (s) => el.querySelector(s);
  const input = $(".be-hi-find input"), resEl = $(".be-hi-res"), quickEl = $(".be-hi-quick"), outEl = $(".be-hi-out");
  input.value = lastName;

  const drawTabs = () => {
    el.querySelectorAll("[data-tab]").forEach((b) => {
      const on = b.dataset.tab === tab;
      b.classList.toggle("on", on);
      b.setAttribute("aria-selected", String(on));
    });
    $(".be-hi-person").hidden = tab !== "person";
    $(".be-hi-stats").hidden = tab !== "stats";
  };

  // ── 사람별 이력 ──
  const groupHtml = (g) => `<div class="card be-hi-grp">
      <div class="be-hi-gh"><span class="be-hi-n">${esc(g.n)}</span><b>${esc(g.label)}</b><em>${g.rows.length}회</em>
        ${g.rows.some((x) => x.hasUser) ? `<span class="badge ok">🔗 앱 계정</span>` : ""}</div>
      <ol class="be-hi-rows">${g.rows.map((x) => `<li>
        <a href="${rosterHref(x.event_id)}"><b>${esc(x.title || x.event_id)}</b></a>
        <span class="muted">${esc(x.closes_on ? x.closes_on + " 마감" : "")}</span>
        <span class="be-hi-who">${esc(histRowText(x))}</span>
        <span class="be-hi-src">${esc(SRC_LABEL[x.source] || x.source || "")}${x.hasUser && x.source !== "app" ? " · 🔗 계정 이어짐" : ""}</span>
      </li>`).join("")}</ol></div>`;

  const drawHist = () => {
    if (!hist) { resEl.innerHTML = ""; return; }
    const { name, groups } = hist;
    if (!groups.length) {
      resEl.innerHTML = `<p class="empty">‘${esc(name)}’ 님의 참여 기록이 없어요 — 이름을 명단과 똑같이 적었는지 봐 주세요(띄어쓰기는 상관없어요)</p>`;
      return;
    }
    const s = histSummary(groups);
    resEl.innerHTML = `<p class="be-hi-sum">‘${esc(name)}’ — <b>${s.people}분</b>으로 보여요 · 모두 <b>${s.times}회</b></p>` +
      groups.map(groupHtml).join("");
  };

  async function search(name) {
    const q = String(name || "").trim();
    if (!q) { toast("이름을 적어 주세요"); input.focus(); return; }
    lastName = q;
    const d = await busy(el, () => call("evHistory", { name: q }));
    if (!d.ok) { hist = null; resEl.innerHTML = `<p class="empty">찾지 못했어요 — ${esc(errorText(d))}</p>`; return; }
    hist = { name: q, groups: d.groups || [] };
    drawHist();
  }

  // ── 통계 ──
  const drawQuick = () => {
    const on = chipOn(events, sel);
    const chips = [{ key: "all", label: "전부", n: events.length }, ...quickChips(events),
      { key: "custom", label: "✔️ 직접 고르기", n: on === "custom" ? sel.length : null }];
    quickEl.innerHTML = chips.map((c) => `<button type="button" data-q="${esc(c.key)}" class="${on === c.key ? "on" : ""}" ` +
      `aria-pressed="${on === c.key}">${esc(c.label)}${c.n == null ? "" : ` <em>${c.n}</em>`}</button>`).join("");
    const ids = sel || events.map((e) => e.id);
    $(".be-hi-selsum").textContent = sel
      ? `고른 회차 ${ids.length}개 — ${ids.map((id) => labels.get(id) || id).join(" · ")}`
      : `모든 회차 ${events.length}개`;
  };

  const drawStats = () => {
    if (!stats) return;
    if (!stats.perEvent.length) { outEl.innerHTML = `<p class="empty">고른 회차가 없어요 — 위에서 다시 골라 주세요</p>`; return; }
    const x = crossTable(stats, labels);
    const choices = repeatChoices(stats.repeaters);
    const reps = repeatersAt(stats.repeaters, minRepeat);
    outEl.innerHTML = `<h3 class="sec-title">회차별 인원</h3>
      <div class="be-hi-bars">${barRows(stats.perEvent, labels).map((b) => `<div class="be-hi-bar">
        <a class="be-hi-bl" href="${rosterHref(b.id)}">${esc(b.label)}</a>
        <span class="be-hi-bt" aria-hidden="true"><i style="width:${b.pct}%"></i></span><b>${n(b.count)}명</b></div>`).join("")}</div>
      <h3 class="sec-title">교구(부서) × 회차 <small class="muted">명단 줄 수</small></h3>
      <div class="be-hi-wrap"><table class="be-hi-x">
        <thead><tr><th>소속</th>${x.cols.map((c) => `<th>${esc(c.label)}</th>`).join("")}<th>합계</th></tr></thead>
        <tbody>${x.rows.map((row) => row.head
          ? `<tr class="be-hi-xh"><th colspan="${x.cols.length + 2}">${esc(row.label)}</th></tr>`
          : `<tr><th>${esc(row.label)}</th>${row.cells.map((v) => `<td>${v ? n(v) : "·"}</td>`).join("")}<td><b>${n(row.total)}</b></td></tr>`).join("")}</tbody>
        <tfoot><tr><th>합계</th>${x.foot.cells.map((v) => `<td>${n(v)}</td>`).join("")}<td><b>${n(x.foot.total)}</b></td></tr></tfoot>
      </table></div>
      <h3 class="sec-title">여러 번 참여한 분</h3>
      <p class="muted be-hi-note">${esc(APPROX)}</p>
      ${choices.length ? `<div class="tabs be-hi-min" role="group" aria-label="몇 번 이상">${choices.map((c) =>
        `<button type="button" data-min="${c.min}" class="${c.min === minRepeat ? "on" : ""}" aria-pressed="${c.min === minRepeat}">` +
        `${c.min}회 이상 <em>${c.n}</em></button>`).join("")}</div>` : ""}
      ${reps.length ? `<ol class="be-hi-reps">${reps.map((p) => `<li>
        <button type="button" class="be-hi-who-btn" data-name="${esc(p.name)}" title="이 분의 이력 보기"><b>${esc(p.name)}</b><span class="be-hi-aff"> · ${esc(p.label)}</span></button>
        <em>${p.times}회</em>
        <span class="be-hi-evs">${(p.events || []).map((id) => `<span>${esc(labels.get(id) || id)}</span>`).join("")}</span></li>`).join("")}</ol>`
        : `<p class="empty">고른 회차에서 ${minRepeat}회 이상 참여한 분이 없어요</p>`}`;
  };

  async function loadStats() {
    outEl.innerHTML = `<p class="empty">통계를 내는 중…</p>`;
    const d = await busy(el, () => call("evStats", { event_ids: sel || [] }));
    if (!d.ok) { stats = null; outEl.innerHTML = `<p class="empty">통계를 내지 못했어요 — ${esc(errorText(d))}</p>`; return; }
    stats = { perEvent: d.perEvent || [], byGroup: d.byGroup || [], repeaters: d.repeaters || [] };
    const choices = repeatChoices(stats.repeaters);
    if (choices.length && !choices.some((c) => c.min === minRepeat)) minRepeat = choices[0].min;
    drawStats();
  }

  const setSel = (next) => { sel = next; stats = null; drawQuick(); loadStats(); };

  el.addEventListener("submit", (e) => {
    if (!e.target.matches(".be-hi-find")) return;
    e.preventDefault();
    search(input.value);
  });
  el.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-tab]");
    if (t) {
      tab = t.dataset.tab;
      drawTabs();
      if (tab === "stats" && !stats) loadStats();
      if (tab === "person") input.focus();
      return;
    }
    const q = e.target.closest("[data-q]");
    if (q) {
      const key = q.dataset.q;
      if (key === "all") return setSel(null);
      if (key !== "custom") return setSel(quickIds(events, key));
      const v = await pickMany({ anchor: q, title: "통계에 넣을 회차",
        options: events.map((ev) => ({ value: ev.id, label: ev.title || ev.id, hint: `${ev.closes_on} 마감 · ${n(ev.count)}명` })),
        values: sel || events.map((ev) => ev.id) });
      if (v == null) return;                                        // 닫기 — 그대로
      if (!v.length) { toast("회차를 하나 이상 골라 주세요"); return; }
      return setSel(v.length === events.length ? null : v);
    }
    const m = e.target.closest("[data-min]");
    if (m) { minRepeat = Number(m.dataset.min); drawStats(); return; }
    const who = e.target.closest(".be-hi-who-btn");
    if (who) {   // 여러 번 참여한 분을 누르면 그분 이력으로
      tab = "person";
      input.value = who.dataset.name;
      drawTabs();
      search(who.dataset.name);
      return;
    }
    const b = e.target.closest("button[data-act]");
    if (b && b.dataset.act === "csv") {
      if (!stats || !stats.perEvent.length) { toast("내려받을 통계가 없어요"); return; }
      download(statsCsv(stats, labels, minRepeat), csvName());
    }
  });

  drawTabs();
  drawQuick();
  if (tab === "stats") loadStats();
  else if (lastName) search(lastName);
}
```

Run: `node --check js/menus/bibleevent/history.js && node --experimental-strip-types --test tests/be-history-logic.test.mjs`
Expected: 문법 통과 · `# pass 12` · `# fail 1`(`not ok 12 - 메뉴 …` 만 남음).

- [ ] **Step 5: 메뉴 줄 — `js/menus/registry.js`(앵커 뒤에 두 줄)**

앵커는 Task 11 의 `be-upload` 줄 끝 `import("./bibleevent/upload.js") },` 다. 그 글이 든 줄 **바로 다음**에 CONTRACT 의 `be-history` 줄을 두 줄로 넣는다(CRLF 그대로).

```bash
grep -c 'import("./bibleevent/upload.js") },' js/menus/registry.js   # 1 이어야 한다(아니면 멈춘다)
grep -c 'bibleevent/history' js/menus/registry.js                    # 0 이어야 한다
node - <<'JS'
const fs = require("fs");
const p = "js/menus/registry.js";
const s = fs.readFileSync(p, "utf8");
const nl = s.includes("\r\n") ? "\r\n" : "\n";
const anchor = 'import("./bibleevent/upload.js") },';
const at = s.indexOf(anchor);
if (at < 0 || s.indexOf(anchor, at + 1) >= 0) throw new Error("앵커가 한 번이 아니다 — 멈춘다");
if (s.includes("bibleevent/history")) throw new Error("be-history 줄이 이미 있다 — 두 번 넣지 않는다");
const eol = s.indexOf(nl, at);
if (eol < 0) throw new Error("앵커 줄 끝을 못 찾았다");
const end = eol + nl.length;
const add = [
  '  { id: "be-history", group: "성경필사(암송)", icon: "👤", label: "사람별 이력·통계", desc: "이름으로 찾기 · 회차별·교구별 · 여러 번 참여",',
  '    role: "bibleevent", load: () => import("./bibleevent/history.js") },',
].join(nl) + nl;
fs.writeFileSync(p, s.slice(0, end) + add + s.slice(end));
console.log("be-history 줄을 더했다");
JS
grep -c 'import("./bibleevent/history.js") },' js/menus/registry.js   # 1
git diff --stat -- js/menus/registry.js                               # 1 file changed, 2 insertions(+)
```

Run: `node --experimental-strip-types --test tests/be-history-logic.test.mjs tests/be-upload-logic.test.mjs tests/registry.test.mjs`
Expected: `# fail 0`(지금 main 기준 `# pass 34` = 13 + 17 + registry 4) — 성경필사(암송) 세 메뉴가 `be-roster → be-upload → be-history` 로 붙어 있고, 앞은 사역신청·뒤는 교인명부 묶음.

- [ ] **Step 6: 모양 — `css/admin.css` 끝에 `be-hi-` 이어 붙이기**

```bash
grep -c 'be-hi-' css/admin.css      # 0 이어야 한다(두 번 붙이지 않는다)
node - <<'JS'
const fs = require("fs");
const p = "css/admin.css";
const s = fs.readFileSync(p, "utf8");
if (s.includes(".be-hi-")) throw new Error("be-hi- 블록이 이미 있다 — 두 번 붙이지 않는다");
const nl = s.includes("\r\n") ? "\r\n" : "\n";
const block = String.raw`
/* ── 👤 사람별 이력·통계(be-hi-) — 성경필사(암송) be- 블록의 이어짐(Task 12 · 2026-09-29) ──────────── */
.be-hi-tabs{margin-bottom:12px}
.be-hi-find{display:flex;gap:8px;align-items:stretch;margin-bottom:6px}
.be-hi-find .search{flex:1;min-width:0;margin-bottom:0}
.be-hi-find .btn{flex:none;min-width:88px}
.be-hi-note{margin:0 0 10px}
.be-hi-sum{font-size:14px;margin:4px 0 10px}
.be-hi-sum b{color:var(--navy)}
.be-hi-gh{display:flex;align-items:center;flex-wrap:wrap;gap:6px 8px;margin-bottom:6px}
.be-hi-gh b{font-size:15px;color:var(--navy)}
.be-hi-gh em{font-style:normal;font-size:13px;font-weight:800;color:var(--gray)}
.be-hi-n{display:inline-flex;align-items:center;justify-content:center;min-width:26px;height:26px;padding:0 6px;border-radius:999px;
  background:var(--navy);color:#fff;font-size:13px;font-weight:800}
.be-hi-rows{list-style:none;display:flex;flex-direction:column}
.be-hi-rows li{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 10px;padding:8px 0;border-top:1px solid var(--light);font-size:14px}
.be-hi-rows li a{display:inline-flex;align-items:center;min-height:var(--chip);text-decoration:none}
.be-hi-who{color:#333}
.be-hi-src{font-size:13px;color:var(--gray)}
.be-hi-selsum{margin:0 0 10px;line-height:1.6}
.be-hi-acts{margin-bottom:6px}
.be-hi-bars{display:flex;flex-direction:column;gap:6px}
.be-hi-bar{display:grid;grid-template-columns:minmax(0,9em) 1fr auto;align-items:center;gap:8px;min-height:var(--chip);font-size:14px}
.be-hi-bl{display:inline-flex;align-items:center;min-height:var(--chip);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  text-decoration:none;font-weight:700}
.be-hi-bt{height:14px;border-radius:7px;background:var(--light);overflow:hidden}
.be-hi-bt i{display:block;height:100%;border-radius:7px;background:var(--navy)}
.be-hi-bar b{font-size:14px;color:var(--navy);white-space:nowrap}
.be-hi-wrap{overflow-x:auto;margin-bottom:8px;-webkit-overflow-scrolling:touch}
.be-hi-x{border-collapse:collapse;background:#fff;border:1px solid var(--border);min-width:100%}
.be-hi-x th,.be-hi-x td{padding:6px 10px;border-bottom:1px solid var(--light);font-size:14px;text-align:right;white-space:nowrap}
.be-hi-x th:first-child{position:sticky;left:0;z-index:1;background:#fff;text-align:left}
.be-hi-x thead th{background:var(--light);color:var(--gray);font-size:13px}
.be-hi-x thead th:first-child{background:var(--light)}
.be-hi-x tr.be-hi-xh th{background:var(--ghost-bg);color:var(--navy);font-size:13px;text-align:left}
.be-hi-x tfoot th,.be-hi-x tfoot td,.be-hi-x tfoot th:first-child{font-weight:800;background:#faf8f3}
.be-hi-min{margin-bottom:6px}
.be-hi-reps{list-style:none;display:flex;flex-direction:column}
.be-hi-reps li{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;padding:6px 0;border-top:1px solid var(--light)}
.be-hi-who-btn{min-height:var(--chip);padding:0 12px;border:1px solid var(--ghost-bd);border-radius:999px;background:var(--ghost-bg);
  color:var(--navy);font-size:14px;cursor:pointer;text-align:left}
.be-hi-aff{font-size:13px;font-weight:400;color:#41506b}
.be-hi-reps em{font-style:normal;font-size:13px;font-weight:800;color:var(--navy)}
.be-hi-evs{display:flex;flex-wrap:wrap;gap:4px;flex-basis:100%}
.be-hi-evs span{font-size:13px;color:#41506b;background:var(--light);border-radius:7px;padding:1px 7px}
`;
fs.writeFileSync(p, s.replace(/\s+$/, "") + nl + block.replace(/\n/g, nl).replace(/\s+$/, "") + nl);
console.log("be-hi- 블록을 붙였다");
JS
node -e "const s=require('fs').readFileSync('css/admin.css','utf8'); console.log('여는', (s.match(/[{]/g)||[]).length, '닫는', (s.match(/[}]/g)||[]).length)"
node -e "const s=require('fs').readFileSync('css/admin.css','utf8'); const b=s.slice(s.indexOf('(be-hi-)')); const small=(b.match(/font-size:\d+px/g)||[]).filter((x)=>parseInt(x.slice(10),10)<13); console.log(small.length ? '작은 글씨: ' + small.join(' ') : 'be-hi- 블록에 13px 미만 글씨 없음')"
git diff --stat -- css/admin.css
```
Expected: `be-hi- 블록을 붙였다` · 두 수가 같다 · `be-hi- 블록에 13px 미만 글씨 없음` · `css/admin.css` 한 파일, 늘어난 줄만. 교구×회차 표는 폰에서 가로로 넘치면 표 칸만 옆으로 밀린다(`.be-hi-wrap` — 첫 칸 「소속」은 붙어 있다). 화면 전체는 옆으로 밀리지 않는다.

- [ ] **Step 7: 문법 · 금지 부품 · preflight**

```bash
for f in js/menus/bibleevent/history-logic.js js/menus/bibleevent/history.js; do node --check "$f" || echo "문법 실패: $f"; done
grep -nE "\b(alert|confirm|prompt)\(|<select|type=\"?(date|time)\"?|datalist|beforeunload" js/menus/bibleevent/history*.js \
  | grep -vE "^[^:]+:[0-9]+:\s*//" || echo "금지 부품 없음"
python tools/preflight.py
```
Expected: 문법 실패 줄 없음 · `금지 부품 없음` · preflight `[1]` 에 `history-logic.js`·`history.js` 통과 · 끝줄 `모두 통과`.

- [ ] **Step 8: 커밋**

```bash
git add js/menus/bibleevent/history-logic.js js/menus/bibleevent/history.js tests/be-history-logic.test.mjs js/menus/registry.js css/admin.css
git diff --cached --stat   # 이 다섯 파일만
git commit -m "feat(성경필사): 👤 사람별 이력·통계 — 이름 찾기 · 빠른 고르기 · 회차별 막대 · 교구×회차 · 여러 번 참여(이름 · 소속) · 내려받기" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git show --stat HEAD      # 다섯 파일만인지 본다
git status --short        # 아무것도 없어야 한다
```

> **Task 14(localhost 친구 확인) 점검표에 더할 것 — 👤 사람별 이력·통계**
> ① 이름을 치는 동안에는 서버를 부르지 않고 「찾기」·Enter 때만 부른다(개발자 도구 네트워크 탭) ② 같은 이름이 두 소속이면 묶음 둘(① ②, 이름표 「이름 · 소속」), 계정 이어진 묶음에 「🔗 앱 계정」 ③ 회차 이름을 누르면 📋 회차·명단의 그 회차 ④ 「✔️ 직접 고르기」가 우리 고르개(시스템 창 아님)로 뜨고, 보관 회차까지 모두 나온다 · 모두 해제하고 확인하면 「회차를 하나 이상 골라 주세요」 ⑤ 「✝️ 사순절」 칩을 누르면 `lent-booklet-` 회차는 빠진다(그건 「📘 소책자」) ⑥ 「N회 이상」 칩을 바꾸면 목록·내려받기가 같이 바뀐다 · 여러 번 참여한 분은 「이름 · 소속」(예 「홍길동 · 화평 20목장」)으로 보인다 ⑦ 내려받은 CSV 를 엑셀로 열면 한글이 안 깨진다(BOM) · 여러 번 참여 표의 칸이 「이름」「소속」「횟수」「참여 회차」 ⑧ 여러 번 참여한 분을 누르면 👤 사람별 이력으로 넘어가 그 이름을 찾는다 ⑨ 메뉴를 옮겼다 돌아오면 보던 쪽·고른 회차·찾던 이름이 남아 있다.


### Task 16: 이름을 누르면 교적 창 — evPerson · 역할에 따라 「자세히」 창 또는 다섯 칸

> **차례 — Task 12 뒤, Task 13 앞에 돈다.** 실행 차례는 `5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 16 → 13 → 14 → 15` 다.
> 번호가 16 인 것은 친구 결정(2026-09-30 · 설계 §0 「이름을 누르면 교적 창」·§2 `evPerson`·§3·§8-8)이 계획을 쓴 뒤에 와서다.
> 이 과제는 Task 5·8(서버 도움 함수·`lookupName`·`EV_LOOKUP_COLS`·`upFixtures`)·Task 9(`modal.js` — 같은 뒤로 가기 규칙 · 두 파일이 popstate 를 함께 듣는다)와 Task 10·12(명단 카드·표·이력 화면)의 **끝난 코드**에 얹는다.
>
> **뒤 과제는 이 과제를 이미 담고 있다** — 이 과제를 계획에 넣을 때 뒤 과제의 글을 함께 고쳤다. 그래서 뒤 과제를 돌리는 분이 따로 챙길 것은 없다:
> Task 13 Step 1 은 기록 줄 **아홉**(`people.lookup` 이 `evPeopleLookup`·`evPerson` 두 곳)을 기대하고, Step 7 은 이 과제가 6번에 더한 한 줄이 있는지 먼저 본 뒤 7번·6번 보는 사람 글을 이 과제까지 담아 **처음부터** 쓰며, Step 8 의 `CLAUDE.md` 절에는 `evPerson` 줄과 모듈 여섯(`events-person.ts`)이 들어 있다 ·
> Task 14 Step 7·11·12 점검표에 이 과제의 줄이 있고 액션은 13개다 · Task 15 는 액션 13개 · 운영 함수에 `events-person.ts` 와 `case "evPerson"` 을 본다 ·
> 계획 머리의 Global Constraints(교인ID 예외 하나)·파일 지도와 설계 §2 `evPerson` 줄도 이 과제의 응답 모양으로 맞췄다.
> `audit.js`(Task 13 Step 4)에는 더할 것이 없다 — `evPerson` 은 새 기록 이름을 만들지 않고 `people.lookup`(`{q, count}`)을 그대로 쓴다.

**정한 것**(설계 §0·§2·§3 을 코드로 옮기며 정한 것 — 설계와 다르게 읽힐 수 있는 자리는 까닭을 함께 적는다):
- **고르는 규칙은 새로 만들지 않는다** — 명단의 교적 표시(`people-match.ts matchChurch`)가 쓰는 `sameAffiliation` 그대로: ① 소속까지 같은 분이 한 분 → 그분 ② 같은 소속이 없고 이름이 명부 전체에 한 분뿐 → 그분 ③ 그 밖 → 후보만. 그래서 교적 표시가 「맞음」인 줄은 **늘** 그 한 분이 열린다(순수 시험이 맞대 본다).
- **모양은 서버가 역할로 정한다**(`ctx.roles` — 화면이 보낸 것을 믿지 않는다): `directory` 또는 `super` → `full`(교인ID·이름·소속 한 줄·직분) · 그 밖 → `basic`(다섯 칸 + 교적 표시) · 명부가 한 번도 안 올라왔으면 `none`.
  ⚠️ Global Constraints 의 「응답에 `person_id` 를 싣지 않는다」의 **유일한 예외**가 `full` 이다(Global Constraints 에도 이 예외를 적었다) — 설계 §2 `evPerson` 줄(친구 결정 2026-09-30)이 정했고, 받는 분은 🔎 교인 찾기에서 교인ID 를 이미 보는 교인명부 역할·총괄뿐이다. 사진·연락처·주소·가족은 여기서 싣지 않고 `peoplePerson` 이 교인명부 역할을 **다시** 확인하고 준다.
- **고른 분이 있으면 그 한 분만** 싣는다(`full`·`basic` 둘 다) — 같은 이름의 다른 분 값은 고르지 못했을 때만 나간다(스무 분까지 · `evPeopleLookup` 과 같은 상한). 대신 **`total`**(명부에서 이 이름인 분 수 · 자르기 전)을 함께 준다 — 스무 분으로 잘렸을 때 화면이 「같은 이름이 21분 있어요(앞 20분만 보여요)」·고르개 제목 「(같은 이름 21분 중 앞 20분)」으로 사실대로 적게(옆 교적 표시 「같은 이름 21명」과 수가 어긋나지 않게).
- `basic` 의 교적 표시는 **줄 하나에 하나**(`church`)다 — 설계 표의 `people:[{…, church}]` 를 이렇게 읽었다(설계 §2 줄도 이 모양으로 고쳤다). 교적 표시는 「명단 줄 ↔ 교인명부」를 맞댄 결과라 사람마다 붙일 값이 아니고, 명단(`evRoster`)과 **같은 함수·같은 후보**로 만들어 창과 명단의 표시가 늘 같다(개발 시험이 맞대 본다).
- **기록 — 교인명부 값이 이 창에 나가면 남긴다**: `people.lookup {q, count}` — `evPeopleLookup` 과 같은 action·같은 모양(`count` = 보여 준 분 수 · 개인정보 안내가 약속한 「찾은 검색어」). `basic` 은 **늘**. `full` 은 **고르지 못했을 때(`pick: null` — 후보 스무 분까지·빈 후보)만** — 이때는 이름·소속·직분·교인ID 가 여러 분 나가는데 고르개를 닫으면 `people.view` 도 남지 않아, 여기서 안 남기면 기록이 아예 없다.
  `full` 에서 서버가 한 분을 골랐으면(`pick: 0`) **남기지 않는다** — 화면이 곧바로 「자세히」 창을 열고 `peoplePerson` 이 `people.view`(그분 이름·교인ID)를 남긴다. 여기서도 남기면 이름 한 번에 두 줄이다.
- **창**: `basic` = `ui.js dialog`(읽기만 하는 창 — 설계 §3 「확인·알림은 `dialog`/`toast` · 입력이 있는 창은 전용 창」이라 `openForm` 을 쓰지 않는다) · `full` 후보 고르기 = `picker.js pickOne`(고르기는 공용 고르개 — 한 번 누르면 곧 닫히고, 폰은 아래 판) · 「자세히」 = 교인명부 `openPerson`(내보내기만 더한다).
- **뒤로 가기는 창만 닫는다**(설계 §3 「팝업 — 뒤로 가기」 그대로 · 폰에서 창을 닫는 가장 흔한 손짓이라 명단 자리를 잃지 않게): 창(작은 창·고르개·「자세히」 창)을 열 때 `history.pushState({bePerson:1}, "")` 로 한 칸을 쌓고 `popstate` 를 「창 닫기」로 받는다. 「닫기」·Esc 로 닫으면 `history.back()` 으로 그 칸을 거두고 **그 popstate 가 온 뒤에** 끝낸다(`modal.js` 와 같은 차례 — 안 거두면 다음 뒤로 가기 한 번이 헛 누름). 주소가 같은 칸이라 `hashchange`·`route()` 는 돌지 않는다. `modal.js` 의 popstate 처리와는 서로 비켜 간다(그쪽은 열린 입력 창·제 칸이 없으면 아무것도 안 한다 — 2026-09-30 헤드리스 크롬 사본에서 이 창을 닫은 뒤 입력 창을 열고 뒤로 가기로 닫아 봤다).
- **이름 한 번 누름 = 한 묶음**: 작은 창 하나, 또는 [고르개 →] 「자세히」 창(가족 이름으로 넘어간 창까지)이 한 칸을 함께 쓴다. 묶음 동안 **메뉴를 옮기면**(`hashchange`) 떠 있는 우리 창을 닫고, 아직 묻는 중이면 답이 와도 띄우지 않는다(`evPerson` 답 뒤·고르개 뒤에 다시 보고, 「자세히」 창처럼 `openPerson` 이 답을 받은 **뒤에** 붙이는 창은 `MutationObserver` 로 붙는 즉시 닫는다). 뒤로 가기 뒤에 늦게 뜬 창도 같다. 교인 찾기(🔎)의 「자세히」 창은 묶음 밖이라 건드리지 않는다.
- 명부가 없을 때(`none`)는 「교인명부가 아직 올라오지 않아 찾을 수 없어요」, 찾은 분이 없을 때만 「교인명부에서 찾지 못했어요」 — 「아직 모른다」와 「없다」를 한 문장으로 뭉개지 않는다.
- 👤 통계의 「여러 번 참여한 분」은 응답(`repeaters`)에 소속 칸이 따로 없다(`label` 소속 한 줄뿐 · Task 4·5 모양을 바꾸지 않는다) — 화면이 `rowFromLabel` 로 되읽는다(서버 `affLabel` 과 맞대 보는 순수 시험). 이 줄의 이름은 교적 창이 되고, 예전의 「이름을 누르면 그분 이력으로」는 줄 끝 **「📜 이력」** 단추로 옮긴다.
- 「자세히」 창의 가족 단추(`person-detail.js` 의 `data-fam`·`data-fam-all`)는 `person-popup.js` 가 잡는 단계(capture)에서 먼저 받는다: 가족 이름 → 그 창을 닫고 **같은 칸에서** 그분 창을 연다(`openPerson` 이 스스로 넘기면 첫 창이 닫히는 순간 묶음이 끝난 줄 알아 칸·메뉴 옮기기 처리가 끊긴다) · 「👪 가족 모두 목록으로」 → 이 메뉴에는 가족 목록이 없어 알림 한 줄(「가족 목록은 🔎 교인 찾기에서 …」)만, **창은 그대로**. `search.js` 는 `export` 한 단어와 주석 한 줄만 고친다.

**Files:**
- Create: `supabase/functions/church-admin/events-person.ts` · `tests/events-person.test.mjs`
- Modify: `supabase/functions/church-admin/authz.ts` — 앵커 `  evPeopleLookup: "bibleevent",`(Task 8) 바로 뒤에 세 줄
- Modify: `tests/authz.test.mjs` — bibleevent 블록 목록의 조각 `"evPeopleLookup", "evRoster",`(Task 8) 한 곳
- Modify: `supabase/functions/church-admin/index.ts` — 앵커 `const cors = {` 바로 위에 새 import 문 · 앵커 `Deno.serve(async (req) => {` 바로 위에 새 절 · 앵커 `      case "evPeopleLookup": return json(await evPeopleLookup(ctx, b));`(Task 8) 바로 뒤에 case 한 줄
- Modify: `tests/server.dev.test.mjs` — 앵커 `  evPeopleLookup: { name: "" },`(Task 8 PROBE) 바로 뒤에 한 줄 · 파일 끝에 도움 함수 하나·시험 둘
- Modify: `js/menus/people/search.js` — 앵커 `async function openPerson(call, id, onFamily, back) {` 한 줄(`export` + 주석 한 줄)
- Create: `js/menus/bibleevent/person-logic.js`(순수) · `js/menus/bibleevent/person-popup.js`(창) · `tests/be-person-logic.test.mjs`
- Modify: `js/menus/bibleevent/roster-ui.js`(Task 10 · 앵커 셋) · `js/menus/bibleevent/roster.js`(Task 10 · 앵커 둘) · `js/menus/bibleevent/history.js`(Task 12 · 앵커 다섯)
- Modify: `css/admin.css` — 파일 끝에 「be-name · be-pp-」 블록
- Modify: `privacy.html` — 6번에 한 줄(앵커 `      보관: 새 명단이 나오면 통째로 갈아 끼우고, …` 앞). 7번·6번 「보는 사람」 글과 `CLAUDE.md` 의 `evPerson` 줄은 **Task 13 이 처음부터 이 과제를 담아** 쓴다(이 과제 뒤에 돈다).

**Interfaces:**
- Consumes:
  - Task 3 `events-people.ts`: `mapChurchPerson(p)` · `positionFromChurch(p)` · `type ChurchPerson` · Task 4 `events-stats.ts`: `affLabel({who_type, group_name, sub_name})` · Task 2 `events-rules.ts`: `BE_FIELD_MAX`
  - Task 8 `events-upload.ts`: `lookupOut(p) → {name, who_type, group, sub, position}` · `LOOKUP_MAX`(20) · `lookupName(v) → {name, key, error}`(index.ts 에는 Task 8 이 이미 들였다 — **다시 들이지 않는다**)
  - `people-match.ts`: `applicantFromSignup` · `matchChurch` · `sameAffiliation` · `toCand` · `type Church`
  - index.ts: Task 8 `EV_LOOKUP_COLS`(= `"name," + EV_FILL_COLS`) · main 의 `db`·`allRows`·`audit`·`peopleSource`·`type Ctx`(`ctx.roles`) · 교인명부 `peoplePerson`(바꾸지 않는다 — `people.view` 를 남긴다)
  - `server.dev.test.mjs`: Task 5 `people.bibleevent`·`people.directory`·`people.super` · `makeUser`·`makeMember` · `EV_ID` · `CHURCH_ONLY_PHONE` · before() 의 교인명부 세 분(990000001 `ca-test-min` 시험-0목장 집사 · 990000003 `DIR_NAME` 시험B) · Task 8 `upFixtures()`·`upName(k)`(정: 소망 12 권사 · 기: 믿음 1·사랑 2 집사 · 다: 은혜 1 스물한 분) · `UP_DIR_IDS` · `UP_UUID` · `UP_ROW_KEYS`
  - 화면: `people/search.js` `openPerson(call, id, onFamily, back)`(이 과제가 내보낸다 — `onFamily(세대주 교인ID, 세대주 이름)`는 「👪 가족 모두 목록으로」 · `back` 은 창이 닫히면 초점을 돌려줄 요소) · `ui.js` `esc`·`toast`·`dialog`·`errorText` · `picker.js` `pickOne` · `people/church-badge.js` `churchBadgeHtml` · Task 10 `roster-logic.js` `GU_ORDER`·`norm`·`whoText` · `roster-ui.js` `cardHtml`·`tableHtml` · Task 12 `history.js` 의 `groupHtml`·「여러 번 참여한 분」 줄·눌림 처리
- Produces:
  - `events-person.ts`: `type PersonCand` · `type PersonAsk` · `type PersonOut` · `personAsk(b, name): PersonAsk` · `personPick(cands, ask): {pick: 0 | null, list}` · `personLabel(p): string` · `personOut(cands, ask, full): PersonOut`
  - index.ts: `EV_PERSON_COLS` · `evPerson(ctx, b)`
  - 액션 `evPerson {name, who_type, group, sub}`(명단 줄 그대로) →
    `{ok, mode:"none"}` | `{ok, mode:"full", pick: 0|null, total, candidates:[{person_id, name, label, position}]}` | `{ok, mode:"basic", pick: 0|null, total, people:[{name, who_type, group, sub, position}], church:{state, reason}}` ·
    오류 `no-name`·`bad-char`·`too-long`(`evPeopleLookup` 과 같다 · 명부에 묻지 않는다) · `pick` 은 늘 `0` 또는 `null`(고르면 그 한 분만 싣는다) · `total` = 명부에서 이 이름인 분 수(스무 분으로 자르기 전)
  - 기록: `people.lookup` · target `""` · `{ q, count }`(`count` = 보여 준 분 수) — `basic` 이면 늘, `full` 이면 `pick: null` 일 때만(`pick: 0` 이면 「자세히」 창의 `people.view` 가 남는다)
  - `search.js`: `export async function openPerson`
  - `person-logic.js`: `NOT_FOUND` · `NO_DIRECTORY` · `CONTACT_NOTE` · `FAMILY_NOTE` · `personAttrs(p)` · `personPayload(dataset)` · `nameButtonHtml(p, text?)` · `rowFromLabel(label)` · `personDecision(r)` · `candOptions(cands)` · `chooseTitle(name, r)` · `basicHtml(r)`
  - `person-popup.js`: `openChurchPerson({ call, name, who_type, group, sub, anchor })` — 창을 여는 동안 뒤로 가기 한 칸(`history.state` `{bePerson: 1}`)
  - 이름 단추 `<button type="button" class="be-name" data-act="person" data-name data-who data-group data-sub>` — 📋 카드·표 · 👤 이력 묶음 머리 · 👤 여러 번 참여한 분 · CSS `.be-name` · `.be-pp-*`

모든 명령은 워크트리에서(`cd /c/Projects/church-admin/.worktrees/bible-events`). **줄 번호로 찾지 않는다** — 고칠 자리는 앵커 글로 찾고 Step 0 에서 한 번만 나오는지 본다. 기존 import 줄은 다시 쓰지 않고 **새 import 문**을 더한다. 작업 트리 파일은 CRLF(`core.autocrlf=true`) — 앵커는 모두 **한 줄 안의 글**이고, Edit 도구로 넣은 줄이 LF 여도 커밋할 때 git 이 맞춘다. 푸시하지 않는다.

- [ ] **Step 0: 선행 확인 — 앞 과제의 이름·앵커가 있고, 이 과제는 아직 안 들어갔나**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
A=supabase/functions/church-admin/authz.ts; I=supabase/functions/church-admin/index.ts
S=tests/server.dev.test.mjs; T=tests/authz.test.mjs; PS=js/menus/people/search.js
R=js/menus/bibleevent/roster-ui.js; RO=js/menus/bibleevent/roster.js; H=js/menus/bibleevent/history.js
c() { printf '%s  %s\n' "$(grep -cF -- "$2" "$1")" "$2"; }
# ① 앵커 — 모두 맨 앞 1
c $A '  evPeopleLookup: "bibleevent",'
c $T '"evPeopleLookup", "evRoster",'
c $I 'const cors = {'
c $I 'Deno.serve(async (req) => {'
c $I '      case "evPeopleLookup": return json(await evPeopleLookup(ctx, b));'
c $S '  evPeopleLookup: { name: "" },'
c $PS 'async function openPerson(call, id, onFamily, back) {'
c $R 'import { STATUS_KO, SRC_LABEL, subText, filterActive } from "./roster-logic.js";'
c $R '`<b>${esc(r.name)}</b>${posHtml(r)}${sub ?'
c $R '<td><b>${esc(r.name)}</b> ${dupHtml(dups.has(r.id))}</td>'
c $RO 'import { openRowForm, openRowDelete } from "./row-form.js";'
c $RO '    else if (act === "row") rowMenu(b);'
c $H '} from "./history-logic.js";'
c $H '<span class="be-hi-n">${esc(g.n)}</span><b>${esc(g.label)}</b><em>${g.rows.length}회</em>'
c $H '<button type="button" class="be-hi-who-btn" data-name="${esc(p.name)}" title="이 분의 이력 보기"><b>${esc(p.name)}</b><span class="be-hi-aff"> · ${esc(p.label)}</span></button>'
c $H '    if (who) {   // 여러 번 참여한 분을 누르면 그분 이력으로'
c $H '    const b = e.target.closest("button[data-act]");'
c privacy.html '      보관: 새 명단이 나오면 통째로 갈아 끼우고, 명단에서 빠진 분의 정보와 사진은 그때 지워요.'
# ② 쓰는 이름(Task 5·8) — 2 · 1 · 6
grep -cE '^const EV_LOOKUP_COLS = |^async function evPeopleLookup\(' $I
grep -cE '^import .*[{ ,]lookupName[ ,}]' $I
grep -cE '^function upFixtures\(|^const upName = |^const UP_DIR_IDS = |^const UP_UUID = |^const UP_ROW_KEYS = |^const CHURCH_ONLY_PHONE = ' $S
# ③ 이 과제가 아직 안 들어갔나 — 파일마다 :0 · 0 · 0 · 0 · 없음 다섯
grep -c 'evPerson' $A $I $T $S
grep -c 'export async function openPerson' $PS
grep -c 'be-name' $R $RO $H | grep -v ':0' ; echo "(위에 아무것도 없으면 0)"
grep -c '^\.be-name{' css/admin.css
for f in supabase/functions/church-admin/events-person.ts tests/events-person.test.mjs js/menus/bibleevent/person-logic.js \
  js/menus/bibleevent/person-popup.js tests/be-person-logic.test.mjs; do test -e "$f" && echo "있음: $f" || echo "없음"; done
# ④ Task 13 은 아직 안 돌았나 — 0 · 0(Task 13 은 이 과제 뒤 · 그 과제의 privacy 7번 글이 이 과제의 6번 한 줄을 먼저 찾는다)
grep -c '"people.lookup"' js/menus/system/audit.js
grep -c "7. 성경필사(암송) 명단" privacy.html
# ⑤ 들여올 이름 · lookupOut 이 다섯 칸인가
node --experimental-strip-types --input-type=module -e "
const need = {
  './supabase/functions/church-admin/events-upload.ts': ['lookupOut', 'LOOKUP_MAX', 'lookupName'],
  './supabase/functions/church-admin/events-people.ts': ['mapChurchPerson', 'positionFromChurch'],
  './supabase/functions/church-admin/events-stats.ts': ['affLabel'],
  './supabase/functions/church-admin/events-rules.ts': ['BE_FIELD_MAX'],
  './supabase/functions/church-admin/people-match.ts': ['applicantFromSignup', 'matchChurch', 'sameAffiliation', 'toCand'],
  './js/menus/bibleevent/roster-logic.js': ['GU_ORDER', 'norm', 'whoText'],
  './js/menus/bibleevent/roster-ui.js': ['cardHtml', 'tableHtml'],
  './js/menus/people/church-badge.js': ['churchBadgeHtml'],
  './js/core/picker.js': ['pickOne'],
  './js/core/ui.js': ['esc', 'toast', 'dialog', 'errorText'],
};
for (const [f, ks] of Object.entries(need)) { const m = await import(f); for (const k of ks) if (typeof m[k] === 'undefined') throw new Error(f + ' 에 ' + k + ' 가 없다'); }
const { lookupOut } = await import('./supabase/functions/church-admin/events-upload.ts');
const o = lookupOut({ name: '홍길동', name_key: '홍길동', kind2: '장년', mok1: '화평', mok3: '화평-20목장', school_dept: '', position: '집사', position_detail: '' });
if (JSON.stringify(Object.keys(o).sort()) !== JSON.stringify(['group', 'name', 'position', 'sub', 'who_type'])) throw new Error('lookupOut 이 다섯 칸이 아니다: ' + JSON.stringify(o));
console.log('앞 과제 이름 모두 있음');
"
```
Expected: ① 열여덟 줄 모두 맨 앞 `1` · ② `2` · `1` · `6` · ③ 네 파일 모두 `…:0` · `0` · `(위에 아무것도 없으면 0)` 한 줄뿐 · `0` · `없음` 다섯 · ④ `0` · `0` · ⑤ `앞 과제 이름 모두 있음`(ExperimentalWarning 한 줄은 괜찮다).
하나라도 어긋나면 **멈춘다** — ①·② 가 `0` 이면 그 과제(5·8·10·12)가 덜 끝났거나 main 이 그 자리를 바꾼 것이다(같은 뜻의 글로 앵커를 다시 잡는다). `2` 이상이면 앵커를 더 길게 잡는다. ③ 이 `0` 이 아니면 이 과제가 이미 (일부) 들어간 것이니 `git log --oneline -5` 로 보고 들어간 단계부터 잇는다. ④ 가 `1` 이면 과제 차례가 틀렸다(Task 13 이 먼저 돌았다) — 멈추고 친구에게 알린다.

- [ ] **Step 1: 실패하는 순수 시험 — `tests/events-person.test.mjs`(새 파일)**

```js
// 성경필사(암송) 이름을 누르면 교적 창(evPerson) — 순수 함수 시험(preflight 가 돈다 · 계획 Task 16)
// 이름·교인ID 는 모두 지어낸 것(홍길동 · 11~). 교인명부 칸 모양은 서버가 읽는 EV_PERSON_COLS 그대로.
import { test } from "node:test";
import assert from "node:assert/strict";
import { personAsk, personPick, personLabel, personOut } from "../supabase/functions/church-admin/events-person.ts";
import { matchChurch, toCand, applicantFromSignup } from "../supabase/functions/church-admin/people-match.ts";
import { LOOKUP_MAX } from "../supabase/functions/church-admin/events-upload.ts";

// 교인명부 한 분 — 서버가 읽는 칸(person_id·name + ChurchPerson 일곱)만
const P = (person_id, o = {}) => ({ person_id, name: "홍길동", name_key: "홍길동", kind2: "장년", mok1: "화평", mok3: "화평-20목장",
  school_dept: "", position: "집사", position_detail: "", ...o });
const ask = (who_type, group_name, sub_name, name = "홍길동") => ({ who_type, group_name, sub_name, name });

test("personAsk — 한 줄로 다듬고 40자로 자른다 · 구분은 교구·교회학교 밖이면 비운다 · 이름은 받은 그대로(검사는 lookupName)", () => {
  assert.deepEqual(personAsk({ who_type: " 교구 ", group: " 화평 ", sub: "20", name: "무시" }, "홍길동"),
    { who_type: "교구", group_name: "화평", sub_name: "20", name: "홍길동" });
  assert.deepEqual(personAsk({ who_type: "교회학교", group: "청년부", sub: "" }, "홍 길동"),
    { who_type: "교회학교", group_name: "청년부", sub_name: "", name: "홍 길동" });
  assert.equal(personAsk({ who_type: "아무개" }, "홍길동").who_type, "");
  assert.equal(personAsk({ group: "가".repeat(60) }, "홍길동").group_name.length, 40);
  assert.deepEqual(personAsk(null, "홍길동"), { who_type: "", group_name: "", sub_name: "", name: "홍길동" });
  assert.deepEqual(personAsk([1, 2], "홍길동"), { who_type: "", group_name: "", sub_name: "", name: "홍길동" });
});

test("personPick — ① 소속까지 같은 분 한 분이면 그분 ② 같은 소속이 없고 이름이 한 분뿐이면 그분 ③ 그 밖은 고르지 않는다", () => {
  const a = P(12, { mok3: "화평-20목장" }), b = P(11, { mok1: "소망", mok3: "소망-3목장" }), c = P(13, { mok3: "화평-20목장" });
  // ① 같은 소속 한 분 — 동명이인이 있어도 그분이 앞에 오고 고른다
  const one = personPick([a, b], ask("교구", "화평", "20"));
  assert.equal(one.pick, 0);
  assert.deepEqual(one.list.map((p) => p.person_id), [12, 11]);
  // 「07」·「7목장」처럼 적힌 목장도 같은 소속(sameAffiliation 이 mokNumber 로 본다)
  assert.equal(personPick([P(1, { mok3: "화평-7목장" }), b], ask("교구", "화평", "07")).pick, 0);
  // ② 같은 소속이 없어도 이름이 한 분뿐이면 그분
  assert.equal(personPick([b], ask("교구", "화평", "20")).pick, 0);
  // ③ 같은 소속 둘 · 소속 다른 동명이인 둘 · 명부에 없음 → 고르지 않는다
  const two = personPick([c, a, b], ask("교구", "화평", "20"));
  assert.equal(two.pick, null);
  assert.deepEqual(two.list.map((p) => p.person_id), [12, 13, 11], "같은 소속 먼저 · 안에서는 교인ID 차례");
  assert.equal(personPick([a, b], ask("교구", "화평", "5")).pick, null);
  assert.deepEqual(personPick([], ask("교구", "화평", "20")), { pick: null, list: [] });
  // 목장을 모르는 줄(「남성」·빈칸)은 같은 소속으로 보지 않는다 — 명부에 한 분뿐일 때만 그분
  assert.equal(personPick([a, b], ask("교구", "화평", "남성")).pick, null);
  assert.equal(personPick([a], ask("교구", "화평", "")).pick, 0);
  // 교회학교 — 부서가 같으면(청년부는 명부의 교구 칸에 있다)
  const y = P(21, { kind2: "청년", mok1: "청년부", mok3: "청년-3", position: "" });
  assert.equal(personPick([y, a], ask("교회학교", "청년부", "")).pick, 0);
  assert.equal(personPick([y, a], ask("교회학교", "청년부", "")).list[0].person_id, 21);
  // 받은 배열은 그대로
  const input = [c, a, b];
  personPick(input, ask("교구", "화평", "20"));
  assert.deepEqual(input.map((p) => p.person_id), [13, 12, 11]);
});

test("personPick — 명단의 교적 표시와 같은 규칙: 「맞음」이면 늘 고르고, 고른 분이 같은 소속의 그 한 분이다", () => {
  const dir = [P(12), P(11, { mok1: "소망", mok3: "소망-3목장" }), P(14, { mok1: "소망", mok3: "소망-3목장" }), P(15, { mok1: "믿음", mok3: "믿음-1목장" })];
  const asks = [ask("교구", "화평", "20"), ask("교구", "소망", "3"), ask("교구", "믿음", "1"), ask("교구", "기쁨", "2"),
    ask("교구", "화평", "남성"), ask("교회학교", "중등부", "")];
  for (const q of asks) {
    for (const cands of [dir, dir.slice(0, 1), dir.slice(1, 3), []]) {
      const st = matchChurch(cands.map(toCand), applicantFromSignup(q)).state;
      const { pick, list } = personPick(cands, q);
      if (st === "맞음") {
        assert.equal(pick, 0, JSON.stringify(q));
        assert.equal(matchChurch([toCand(list[0])], applicantFromSignup(q)).state, "맞음", "고른 분이 같은 소속의 그분");
      }
      if (st === "없음") assert.equal(pick, null);
      if (pick === 0 && st !== "맞음") assert.equal(cands.length, 1, "맞음이 아닌데 고르는 것은 명부에 한 분뿐일 때만");
    }
  }
});

test("personLabel — 명단과 같은 소속 한 줄 · 옮겨 적기가 소속을 못 정하면 명부 교구(부서) 칸 그대로", () => {
  assert.equal(personLabel(P(1)), "화평 20목장");
  assert.equal(personLabel(P(1, { mok1: "소망", mok3: "소망-남성1" })), "소망 남성");
  assert.equal(personLabel(P(1, { kind2: "교회학교", mok1: "화평", school_dept: "중등부" })), "중등부");
  assert.equal(personLabel(P(1, { mok1: "새가족", mok3: "2026-09" })), "새가족");
  assert.equal(personLabel(P(1, { mok1: "", mok3: "" })), "(소속 없음)");
});

test("personOut full — 교인ID·이름·소속 한 줄·직분 넷뿐 · 고르면 그 한 분만 · 못 고르면 스무 분까지 · total 은 자르기 전 수", () => {
  const a = P(12, { position: "권사", position_detail: "은퇴협동권사" }), b = P(11, { mok1: "소망", mok3: "소망-3목장" });
  const o = personOut([b, a], ask("교구", "화평", "20"), true);
  assert.deepEqual(o, { mode: "full", pick: 0, total: 2, candidates: [{ person_id: 12, name: "홍길동", label: "화평 20목장", position: "은퇴권사" }] });
  const many = Array.from({ length: 25 }, (_, i) => P(100 + i, { mok3: "화평-1목장" }));
  const m = personOut(many, ask("교구", "화평", "20"), true);
  assert.equal(m.pick, null);
  assert.equal(m.candidates.length, LOOKUP_MAX);
  assert.equal(m.total, 25, "자르기 전 수 — 화면이 「같은 이름 25분(앞 20분)」으로 적는다");
  assert.deepEqual(m.candidates.map((c) => c.person_id).slice(0, 3), [100, 101, 102]);
  assert.deepEqual(personOut([], ask("교구", "화평", "20"), true), { mode: "full", pick: null, total: 0, candidates: [] });
  assert.equal(typeof personOut([P("12")], ask("", "", ""), true).candidates[0].person_id, "number");
});

test("personOut basic — 다섯 칸(evPeopleLookup 과 같은 칸 지도)과 교적 표시 · 교인ID 없음 · 고르면 그 한 분만 · total", () => {
  const a = P(12), b = P(11, { mok1: "소망", mok3: "소망-3목장", position: "" });
  const o = personOut([b, a], ask("교구", "화평", "20"), false);
  assert.deepEqual(o, { mode: "basic", pick: 0, total: 2,
    people: [{ name: "홍길동", who_type: "교구", group: "화평", sub: "20", position: "집사" }],
    church: { state: "맞음", reason: "" } });
  const two = personOut([b, a], ask("교구", "화평", "5"), false);
  assert.deepEqual([two.pick, two.total], [null, 2]);
  assert.deepEqual(two.people.map((p) => p.group), ["소망", "화평"], "교인ID 차례(같은 소속이 없으니)");
  assert.deepEqual(two.church, { state: "확인 필요", reason: "같은 이름 2명" });
  assert.deepEqual(personOut([], ask("교구", "화평", "20"), false),
    { mode: "basic", pick: null, total: 0, people: [], church: { state: "없음", reason: "" } });
  const many = personOut(Array.from({ length: 21 }, (_, i) => P(100 + i, { mok3: "화평-1목장" })), ask("교구", "화평", "20"), false);
  assert.deepEqual([many.pick, many.people.length, many.total], [null, LOOKUP_MAX, 21]);
  assert.deepEqual(many.church, { state: "확인 필요", reason: "같은 이름 21명" }, "교적 표시의 수와 total 이 같다");
  for (const p of two.people) assert.deepEqual(Object.keys(p).sort(), ["group", "name", "position", "sub", "who_type"]);
});

test("personOut — 명부의 다른 칸(연락처·주소·생년월일·사진·교인ID·원래 칸)이 따라 나가지 않는다(스프레드 금지)", () => {
  const leaky = P(990001, { phone1: "010-0000-1111", address: "비밀주소", birth: "1950-01-01", photo: "x.jpg", has_photo: true,
    mok3: "화평-20목장", position_detail: "시무집사" });
  const q = ask("교구", "화평", "20");
  const basic = JSON.stringify(personOut([leaky], q, false));
  for (const k of ["990001", "person_id", "010-0000-1111", "비밀주소", "1950", "photo", "name_key", "mok1", "mok3", "kind2", "position_detail", "화평-20목장"]) {
    assert.ok(!basic.includes(k), "basic 에 새어 나감: " + k);
  }
  const full = JSON.stringify(personOut([leaky], q, true));
  for (const k of ["010-0000-1111", "비밀주소", "1950", "photo", "name_key", "mok3", "kind2", "position_detail", "화평-20목장"]) {
    assert.ok(!full.includes(k), "full 에 새어 나감: " + k);
  }
  assert.ok(full.includes('"person_id":990001'), "full 은 교인ID 를 싣는다(「자세히」 창을 열려고)");
});
```

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
node --experimental-strip-types --test tests/events-person.test.mjs
```
Expected: FAIL — `Cannot find module '…/supabase/functions/church-admin/events-person.ts'`(`ERR_MODULE_NOT_FOUND`) · `# fail 1`.

- [ ] **Step 2: `supabase/functions/church-admin/events-person.ts` 를 만든다**

```ts
// 성경필사(암송) — 이름을 누르면 교적 창(evPerson)의 순수 함수(2026-09-30 · 계획 Task 16)
//   설계: bible-memorize-church-app-v2 docs/superpowers/specs/2026-09-29-church-admin-bible-events-design.md
//         §0 「이름을 누르면 교적 창」 · §2 evPerson · §3 「이름을 누르면 교적 창」 · §8-8
//   서버(Deno, index.ts)와 시험(Node, tests/events-person.test.mjs)이 **같은 파일**을 읽는다 —
//   authz.ts 와 같은 제약(원격 import·enum·namespace 금지, node --experimental-strip-types 가 그대로 읽는다).
//
// ⚠️ 고르는 규칙을 새로 만들지 않는다 — 명단의 교적 표시(people-match.ts matchChurch)가 쓰는 **sameAffiliation 그대로**다.
//    ① 소속까지 같은 분이 한 분 → 그분(교적 표시 「맞음」인 줄은 늘 그 한 분이 열린다)
//    ② 소속이 같은 분이 없고 이름이 명부 전체에 한 분뿐 → 그분(교적 표시는 「확인 필요 · 같은 이름 1명」 — 창에도 그 표시가 보인다)
//    ③ 그 밖(같은 소속 둘 이상 · 소속 다른 동명이인) → 고르지 않는다(후보만 · 화면이 고르게 한다)
// ⚠️ 고른 분이 있으면 **그 한 분만** 싣는다 — 같은 이름의 다른 분 값은 필요할 때(고르지 못했을 때)만 나간다.
//    total 은 명부에서 이 이름인 분 수(스무 분으로 자르기 전) — 화면이 「같은 이름 21분(앞 20분)」처럼 사실대로 적게.
// ⚠️ 모양은 부른 사람의 역할로 갈린다(역할 확인은 index.ts — ctx.roles):
//    full(교인명부 역할·총괄) — 교인ID·이름·소속 한 줄·직분. 화면이 교인ID 로 교인명부 peoplePerson(「자세히」 창)을 연다.
//    basic(성경필사 역할만) — 다섯 칸(lookupOut — evPeopleLookup 과 같은 칸 지도)과 교적 표시. 교인ID 는 싣지 않는다.
//    연락처·주소·생년월일·사진은 어느 쪽에도 없다(서버도 그 칸을 읽지 않는다 · 스프레드 금지).
import { mapChurchPerson, positionFromChurch, type ChurchPerson } from "./events-people.ts";
import { affLabel } from "./events-stats.ts";
import { lookupOut, LOOKUP_MAX } from "./events-upload.ts";
import { legacyNorm } from "./paper.ts";
import { applicantFromSignup, matchChurch, sameAffiliation, toCand, type Church } from "./people-match.ts";
import { BE_FIELD_MAX } from "./events-rules.ts";

export type PersonCand = ChurchPerson & { person_id: number | string; name: string };
export type PersonAsk = { who_type: string; group_name: string; sub_name: string; name: string };
export type PersonFull = { person_id: number; name: string; label: string; position: string };
export type PersonBasic = { name: string; who_type: string; group: string; sub: string; position: string };
export type PersonOut =
  | { mode: "full"; pick: 0 | null; total: number; candidates: PersonFull[] }
  | { mode: "basic"; pick: 0 | null; total: number; people: PersonBasic[]; church: Church };

const cut = (v: unknown): string => legacyNorm(v).slice(0, BE_FIELD_MAX);
const txt = (v: unknown): string => legacyNorm(String(v ?? "").normalize("NFC"));

// 화면이 보낸 명단 줄(구분·소속·세부) + 다듬은 이름(부르는 쪽이 lookupName 으로 검사한 것) → 맞대 볼 줄.
// 소속 칸은 DB 에 묻지 않고 메모리에서 견주기만 한다 — 그래도 한 칸 40자로 자른다. 구분은 둘 밖이면 비운다.
export function personAsk(b: unknown, name: string): PersonAsk {
  const o = (b && typeof b === "object" && !Array.isArray(b) ? b : {}) as Record<string, unknown>;
  const who = legacyNorm(o.who_type);
  return {
    who_type: who === "교구" || who === "교회학교" ? who : "",
    group_name: cut(o.group), sub_name: cut(o.sub), name: legacyNorm(name),
  };
}

// 후보 차례와 고른 분 — 같은 소속 먼저(교인ID 차례), 그다음 나머지(교인ID 차례). pick 은 list 의 자리(늘 0 또는 null).
// 받은 배열은 바꾸지 않는다.
export function personPick(cands: PersonCand[], ask: PersonAsk): { pick: 0 | null; list: PersonCand[] } {
  const all = [...(cands ?? [])].sort((a, b) => Number(a.person_id) - Number(b.person_id));
  const a = applicantFromSignup(ask);
  const same = all.filter((c) => sameAffiliation(toCand(c), a));
  const list = [...same, ...all.filter((c) => !same.includes(c))];
  if (same.length === 1) return { pick: 0, list };
  if (same.length === 0 && all.length === 1) return { pick: 0, list };
  return { pick: null, list };
}

// 교인명부 역할에게 보이는 소속 한 줄 — 명단과 같은 꼴(affLabel · 「화평 20목장」·「소망 남성」·「중등부」).
// 옮겨 적는 규칙이 소속을 못 정한 분(새가족·임시교구 등)은 명부의 교구(또는 부서) 칸 그대로 — 교인명부 역할은 원래 보는 값이다.
export function personLabel(p: ChurchPerson): string {
  const a = mapChurchPerson(p);
  if (a) return affLabel(a);
  return txt(p?.mok1) || txt(p?.school_dept) || "(소속 없음)";
}

// 응답(ok 빼고) — 명시적 칸 지도로만. 고르지 못했으면 스무 분까지(evPeopleLookup 과 같은 상한) · total 은 자르기 전 수.
export function personOut(cands: PersonCand[], ask: PersonAsk, full: boolean): PersonOut {
  const { pick, list } = personPick(cands, ask);
  const shown = pick === null ? list.slice(0, LOOKUP_MAX) : [list[pick]];
  const total = list.length;
  if (full) {
    return {
      mode: "full", pick, total,
      candidates: shown.map((p) => ({
        person_id: Number(p.person_id), name: legacyNorm(p.name), label: personLabel(p), position: positionFromChurch(p),
      })),
    };
  }
  // 교적 표시 — 명단(evRoster)과 같은 함수·같은 후보(이 이름의 명부 전체)로. 그래서 창의 표시와 명단의 표시가 같다.
  return {
    mode: "basic", pick, total, people: shown.map((p) => lookupOut(p)),
    church: matchChurch((cands ?? []).map(toCand), applicantFromSignup(ask)),
  };
}
```

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
node --experimental-strip-types --test tests/events-person.test.mjs
```
Expected: PASS — `# tests 7` · `# pass 7` · `# fail 0`.
(이 모듈과 시험은 2026-09-29~30 에 워크트리 사본 + Task 6~8 초안 위에서 실제로 돌려 일곱 개 모두 통과했다 — `total` 을 더한 판도 2026-09-30 에 다시 돌렸다.)
`personPick — 명단의 교적 표시와 같은 규칙` 이 실패하면 `people-match.ts` 의 `sameAffiliation`·`matchChurch` 가 바뀐 것이다 — 여기 기대값을 맞추지 말고 **멈춰** 무엇이 바뀌었는지 본다(교적 표시와 창이 다른 분을 가리키게 된다).

- [ ] **Step 3: preflight · 커밋(순수 모듈)**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
python tools/preflight.py | tail -1
git add supabase/functions/church-admin/events-person.ts tests/events-person.test.mjs
git commit -F - <<'EOF'
feat(성경필사): 이름을 누르면 교적 창 — 고르는 규칙·응답 모양 순수 모듈(events-person.ts · 교적 표시와 같은 sameAffiliation · 고르면 한 분만 · 자르기 전 수 total · full 은 교인ID·basic 은 다섯 칸+교적 표시)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
git show --stat HEAD      # 두 파일만인지 본다
```
Expected: `모두 통과` · 커밋 1개(두 파일).

- [ ] **Step 4: 권한 — `tests/authz.test.mjs`(실패) → `authz.ts`(통과)**

4-1. `tests/authz.test.mjs` — Edit 도구로 bibleevent 블록 목록의 조각 **하나**를 바꾼다(Step 0 에서 한 번만 나오는 것을 봤다 · 한 줄 안이라 CRLF 와 상관없다).
old:
```js
"evPeopleLookup", "evRoster",
```
new:
```js
"evPeopleLookup", "evPerson", "evRoster",
```
(`sort()` 차례: `evPeopleLookup` < `evPerson` < `evRoster` — 넷째 글자 뒤 `o`(111) < `r`(114), `P`(80) < `R`(82).)

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
grep -c '"evPeopleLookup", "evPerson", "evRoster",' tests/authz.test.mjs     # 1
node --experimental-strip-types --test tests/authz.test.mjs
```
Expected: `1` · FAIL — bibleevent 블록에서 `Expected values to be strictly deep-equal`(`evPerson` 이 아직 없다) · `# fail 1`.

4-2. `supabase/functions/church-admin/authz.ts` — Edit 도구로 앵커 줄 `  evPeopleLookup: "bibleevent",` 을 아래로 바꾼다(그 줄은 그대로 두고 **바로 뒤에** 세 줄):
```ts
  evPeopleLookup: "bibleevent",
  // 성경필사(암송) — 이름을 누르면 교적 창(계획 Task 16 · 2026-09-30). 모양은 index.ts evPerson 이 부른 분의 역할로 정한다:
  // 교인명부 역할·총괄이면 교인ID(「자세히」 창은 peoplePerson 이 역할을 다시 본다), 아니면 다섯 칸 + 교적 표시(people.lookup).
  evPerson: "bibleevent",
```

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
grep -c '^  evPerson: "bibleevent",' supabase/functions/church-admin/authz.ts     # 1
node --experimental-strip-types --test tests/authz.test.mjs tests/registry.test.mjs
```
Expected: `1` · PASS — `# fail 0`. (아직 커밋하지 않는다 — index.ts 의 case 와 함께 Step 10 에서. 이 줄만 들어간 채 배포되면 400 `unknown-action` 이 된다.)

- [ ] **Step 5: 실패하는 개발 서버 시험 — `tests/server.dev.test.mjs` 두 곳**

5-1. PROBE — Edit 도구로 앵커 줄 `  evPeopleLookup: { name: "" },`(Task 8) 을 아래로 바꾼다(그 줄 그대로 + 바로 뒤에 두 줄):
```js
  evPeopleLookup: { name: "" },
  // 이름을 누르면 교적 창(Task 16) — 빈 이름 → no-name(명부에 묻지도 기록하지도 않는다)
  evPerson: { name: "" },
```

5-2. 파일 **끝에** 붙인다(Task 8 의 시험들 뒤 — node:test 는 파일 차례로 돈다 · `bedirPerson` 은 함수 선언이라 어디서든 먼저 읽힌다):
```bash
cd /c/Projects/church-admin/.worktrees/bible-events
cat >> tests/server.dev.test.mjs <<'EOF'

// ---------- 성경필사(암송) — 이름을 누르면 교적 창 evPerson (계획 Task 16) ----------
// 교인명부는 before() 의 세 분(990000001~3)과 Task 8 upFixtures 의 스물다섯 분(ca-test-up-<STAMP>-정·무·기·기·다×21)을 쓴다.
// 「성경필사 + 교인명부」 두 역할을 가진 분은 처음 부를 때 한 번 만든다 — people 에 먼저 넣어 두면 after() 가 지운다
// (권한 표는 사람 이름을 따로 적어 돌므로 이분은 거기 끼지 않는다). 함수 선언이라 파일 끝에 있어도 먼저 읽힌다.
async function bedirPerson() {
  if (!people.bedir) {
    people.bedir = await makeUser("bedir");
    await makeMember(people.bedir, "active", ["bibleevent", "directory"]);
  }
  return people.bedir;
}

test("성경필사 이름을 누르면(evPerson) — 성경필사 역할만: 다섯 칸 + 교적 표시 · 교인ID·연락처·주소 없음 · 고르는 규칙은 명단의 교적 표시와 같다 · people.lookup", async () => {
  await upFixtures();
  const t = people.bibleevent.token;
  const ask = (name, who_type, group, sub) => call(t, "evPerson", { name, who_type, group, sub });
  const none = "ca-test-pp-" + STAMP;   // 명부에 없는 이름 — 이 두 시험만 쓴다(기록 세기)

  // ① 소속까지 같은 분 한 분(명부 믿음 1) → 그분 한 분만(같은 이름의 사랑 2 분은 싣지 않는다)
  const one = await ask(upName("기"), "교구", "믿음", "1");
  assert.equal(one.body.ok, true, JSON.stringify(one.body));
  assert.deepEqual(Object.keys(one.body).sort(), ["church", "mode", "ok", "people", "pick", "total"]);
  assert.deepEqual([one.body.mode, one.body.pick, one.body.total], ["basic", 0, 2], "total 은 명부의 같은 이름 수(고른 한 분만 싣더라도)");
  assert.deepEqual(one.body.people, [{ name: upName("기"), who_type: "교구", group: "믿음", sub: "1", position: "집사" }]);
  assert.deepEqual(one.body.church, { state: "맞음", reason: "" });
  // ② 같은 소속이 없고 동명이인 둘 → 고르지 않고 둘 다(교인ID 차례)
  const two = await ask(upName("기"), "교구", "믿음", "3");
  assert.deepEqual([two.body.pick, two.body.total], [null, 2]);
  assert.deepEqual(two.body.people.map((p) => p.group), ["믿음", "사랑"]);
  assert.deepEqual(two.body.church, { state: "확인 필요", reason: "같은 이름 2명" });
  // ③ 이름이 명부에 한 분뿐 → 소속이 달라도 그분(교적 표시는 「확인 필요」 그대로 함께 간다)
  const lone = await ask(upName("정"), "교구", "화평", "5");
  assert.deepEqual([lone.body.pick, lone.body.total], [0, 1]);
  assert.deepEqual(lone.body.people.map((p) => [p.group, p.sub, p.position]), [["소망", "12", "권사"]]);
  assert.deepEqual(lone.body.church, { state: "확인 필요", reason: "같은 이름 1명" });
  // ④ 명단(evRoster)의 교적 표시와 같다 — 같은 줄로 물으면 같은 표시(같은 함수·같은 후보)
  const ros = await call(t, "evRoster", { event_id: EV_ID });
  for (const row of ros.body.rows) {
    const r = await ask(row.name, row.who_type, row.group, row.sub);
    assert.deepEqual(r.body.church, row.church, row.name);
  }
  // ⑤ 명부에 없는 이름 → 빈 목록 · 「없음」
  const miss = await ask(none, "교구", "시험", "7");
  assert.deepEqual([miss.body.mode, miss.body.pick, miss.body.total, miss.body.people, miss.body.church],
    ["basic", null, 0, [], { state: "없음", reason: "" }]);
  // ⑥ 못 고르면 스무 분까지(evPeopleLookup 과 같은 상한) — total 은 자르기 전 수(화면이 「21분(앞 20분만)」으로 적는다)
  const many = (await ask(upName("다"), "교구", "화평", "1")).body;
  assert.deepEqual([many.pick, many.people.length, many.total], [null, 20, 21]);
  // ⑦ 새어 나가지 않는다 — 교인ID(숫자)·UUID·명부에만 있는 전화·주소·원래 칸
  const min = await ask("ca-test-min", "교구", "시험", "0");
  assert.deepEqual(min.body.people, [{ name: "ca-test-min", who_type: "", group: "", sub: "", position: "집사" }],
    "명부 교구 칸이 일곱 교구 밖(시험)이면 소속 세 칸은 비운다(옮겨 적기 규칙)");
  const text = JSON.stringify([one.body, two.body, lone.body, min.body]);
  assert.ok(!UP_UUID.test(text), "UUID 꼴 값이 실렸다");
  for (const id of [990000001, 990000003, ...UP_DIR_IDS]) assert.ok(!text.includes(String(id)), "교인ID 가 실렸다: " + id);
  for (const k of ["person_id", CHURCH_ONLY_PHONE, "010-0000-0000", "비밀주소", "photo", "name_key", "mok1", "mok3", "kind2",
    "position_detail", "소망-12목장"]) assert.ok(!text.includes(k), "새어 나감: " + k);
  for (const b of [one.body, two.body, lone.body, min.body]) for (const p of b.people) assert.deepEqual(Object.keys(p).sort(), UP_ROW_KEYS);
  // ⑧ 틀린 이름은 명부에 묻지 않는다
  assert.equal((await ask("", "교구", "화평", "1")).body.error, "no-name");
  assert.equal((await ask("홍,길동", "교구", "화평", "1")).body.error, "bad-char");
  assert.equal((await ask("가".repeat(41), "교구", "화평", "1")).body.error, "too-long");
  // ⑨ 기록 — 부를 때마다 people.lookup {q, count}(「교인명부 기록」 · evPeopleLookup 과 같은 모양) · 명부에 없는 이름도
  const logs = (await call(people.super.token, "auditList", { limit: 100, kind: "people" })).body.rows
    .filter((r) => r.action === "people.lookup");
  const mine = logs.filter((r) => r.detail.q === none);
  assert.equal(mine.length, 1, JSON.stringify(mine));
  assert.deepEqual(mine[0].detail, { q: none, count: 0 });
  assert.ok(logs.some((r) => r.detail.q === upName("기") && r.detail.count === 1), "고른 한 분만 보여 준 것도 남는다(결과 수 1)");
});

test("성경필사 이름을 누르면(evPerson) — 교인명부 역할도 있으면·총괄: 교인ID 로 「자세히」 창 · 못 고르면 후보 · 한 분을 골랐으면 기록하지 않고 못 고르면 people.lookup", async () => {
  await upFixtures();
  const bedir = await bedirPerson();
  const q = { name: upName("기"), who_type: "교구", group: "믿음", sub: "1" };
  // 교인명부 기록 가운데 mark(기록 id) 뒤에 남은 people.lookup — 최근 것이 앞(auditList 는 id 내림차순)
  const lookupsAfter = async (mark) => (await call(people.super.token, "auditList", { limit: 100, kind: "people" })).body.rows
    .filter((r) => r.id > mark && r.action === "people.lookup").map((r) => r.detail);
  const mark = (await call(people.super.token, "auditList", { limit: 1, kind: "people" })).body.rows[0]?.id ?? 0;
  for (const who of ["bedir", "super"]) {
    const r = await call(people[who].token, "evPerson", q);
    assert.equal(r.body.ok, true, who + " " + JSON.stringify(r.body));
    assert.deepEqual(Object.keys(r.body).sort(), ["candidates", "mode", "ok", "pick", "total"], who);
    assert.deepEqual([r.body.mode, r.body.pick, r.body.total], ["full", 0, 2], who);
    assert.deepEqual(r.body.candidates, [{ person_id: 990000013, name: upName("기"), label: "믿음 1목장", position: "집사" }], who);
  }
  // 한 분을 골랐으면(pick 0) 여기서는 남기지 않는다 — 화면이 곧바로 「자세히」 창을 열고 peoplePerson 이 people.view 를 남긴다
  assert.deepEqual(await lookupsAfter(mark), [], "pick 0 인 full 이 people.lookup 을 남겼다(이름 한 번에 두 줄이 된다)");
  // 못 고르면 후보 — 교인ID 차례 · 이때는 이름·소속·직분·교인ID 가 여러 분 나가므로 people.lookup {q, count}
  const two = await call(bedir.token, "evPerson", { ...q, sub: "3" });
  assert.deepEqual([two.body.pick, two.body.total], [null, 2]);
  assert.deepEqual(two.body.candidates.map((c) => [c.person_id, c.label]), [[990000013, "믿음 1목장"], [990000014, "사랑 2목장"]]);
  assert.deepEqual(await lookupsAfter(mark), [{ q: upName("기"), count: 2 }]);
  // 연락처·주소·사진·원래 칸은 full 에도 없다 — 그것은 「자세히」 창(peoplePerson)이 교인명부 역할을 다시 확인하고 준다
  const min = await call(bedir.token, "evPerson", { name: "ca-test-min", who_type: "교구", group: "시험", sub: "0" });
  assert.deepEqual(min.body.candidates, [{ person_id: 990000001, name: "ca-test-min", label: "시험", position: "집사" }]);
  const text = JSON.stringify([min.body, two.body]);
  assert.ok(!UP_UUID.test(text), "UUID 꼴 값이 실렸다");
  for (const k of [CHURCH_ONLY_PHONE, "010-0000-0000", "비밀주소", "photo", "household", "name_key", "mok3", "kind2", "position_detail"]) {
    assert.ok(!text.includes(k), "새어 나감: " + k);
  }
  const pp = await call(bedir.token, "peoplePerson", { id: min.body.candidates[0].person_id });
  assert.equal(pp.body.ok, true, JSON.stringify(pp.body));
  assert.equal(pp.body.person.name, "ca-test-min");
  // 명부에 없는 이름 → 빈 후보(pick null) · 못 고른 것이니 people.lookup {q, count: 0} — 앞 시험의 basic 한 줄과 합해 두 줄
  //   (ca-test-min 은 명부에 한 분뿐이라 골랐다(pick 0) — 그 부름은 기록이 없고, 위 peoplePerson 이 people.view 를 남겼다)
  const none = "ca-test-pp-" + STAMP;
  const miss = await call(bedir.token, "evPerson", { name: none, who_type: "교구", group: "시험", sub: "7" });
  assert.deepEqual([miss.body.mode, miss.body.pick, miss.body.total, miss.body.candidates], ["full", null, 0, []]);
  assert.deepEqual(await lookupsAfter(mark), [{ q: none, count: 0 }, { q: upName("기"), count: 2 }]);
  const logs = (await call(people.super.token, "auditList", { limit: 100, kind: "people" })).body.rows;
  assert.equal(logs.filter((r) => r.action === "people.lookup" && r.detail.q === none).length, 2, "basic(앞 시험) 한 줄 + 못 고른 full 한 줄");
  // 교인명부 역할만 있는 분은 이 액션을 못 부른다(성경필사 메뉴의 액션 — 권한 표도 PROBE 로 본다)
  const dir = await call(people.directory.token, "evPerson", q);
  assert.deepEqual([dir.status, dir.body.error], [403, "forbidden"]);
});
EOF
node --check tests/server.dev.test.mjs && echo "문법 통과"
grep -c '^  evPerson: { name: "" },' tests/server.dev.test.mjs     # 1
set -a; . ~/.church-admin/dev.env; set +a
node --experimental-strip-types --test tests/server.dev.test.mjs
```
Expected: `문법 통과` · `1` · FAIL(개발에 배포된 함수는 아직 Task 8 판이다) — 「역할이 필요한 액션마다 시험 입력(PROBE)이 있다」는 **통과**, 「권한 표」는 `not ok`(`none evPerson` 이 400 `unknown-action`), 새 시험 둘(「성경필사 이름을 누르면(evPerson) — 성경필사 역할만 …」·「… 교인명부 역할도 있으면·총괄 …」)이 `unknown-action` 으로 `not ok` — 합해서 `# fail 3`. 나머지는 통과하고 `after()` 에 `정리 실패` 가 없다(둘째 시험이 만든 `bedir` 계정도 지워진다).

- [ ] **Step 6: index.ts — 새 import 문 하나**

기존 import 줄은 **하나도 고치지 않는다.** 이 과제의 이름(`personAsk`·`personOut`·`PersonCand`)은 index.ts 에 아직 없다(Step 0 ③). `lookupName` 은 Task 8 이 이미 들였으니 다시 들이지 않는다.
Edit 도구로 앵커 줄 `const cors = {` 를 아래로 바꾼다(그 줄 **바로 위에** 두 줄과 빈 줄 하나):
```ts
// 성경필사(암송) 이름을 누르면 교적 창(Task 16) — 이 과제의 이름은 events-person.ts 에서만 가져온다(CONTRACT 5)
import { personAsk, personOut, type PersonCand } from "./events-person.ts";

const cors = {
```

- [ ] **Step 7: index.ts — 새 절(`EV_PERSON_COLS` · `evPerson`)**

Edit 도구로 앵커 줄 `Deno.serve(async (req) => {` 를 아래로 바꾼다(그 줄 **바로 위에** — Task 8 의 `evPeopleLookup` 함수 뒤가 된다 · 사이에 빈 줄 하나):
```ts
// ---------- 성경필사(암송) — 이름을 누르면 교적 창 (Task 16 · 2026-09-30) ----------
// 설계 §0 「이름을 누르면 교적 창」·§2 evPerson·§3 · 친구 결정 §8-8. 고르는 규칙·응답 모양은 events-person.ts(순수 함수)에 있다.
// ⚠️ 모양은 **부른 분의 역할**로 여기서 정한다(ctx.roles — 화면이 보낸 것을 믿지 않는다):
//    「교인명부」(directory) 또는 총괄(super) → full: 교인ID·이름·소속 한 줄·직분. 화면은 그 교인ID 로 peoplePerson(「자세히」 창)을
//    부른다 — 사진·연락처·주소·가족은 **그 액션**이 directory 역할을 다시 확인하고 내준다(여기서는 싣지 않는다).
//    그 밖(성경필사 역할만) → basic: 이름·구분·소속·세부·직분 다섯 칸 + 교적 표시. 교인ID 는 싣지 않는다(설계 §0 「교인명부 쓰기」).
// ⚠️ 기록 — people.lookup {q, count}(evPeopleLookup 과 같은 action·같은 모양 → 「교인명부 기록」 · audit.js 가 그대로 읽는다 · count = 보여 준 분 수).
//    basic 은 늘 남긴다. full 은 **고르지 못했을 때(pick null — 후보 스무 분까지·빈 후보)만** 남긴다 — 이름·소속·직분·교인ID 가
//    여러 분 나가는데, 고르개를 닫으면 people.view 도 없어 여기서 안 남기면 기록이 아예 없다.
//    한 분을 골랐으면(pick 0) 남기지 않는다: 화면이 곧바로 「자세히」 창을 열고 peoplePerson 이 people.view(그분 이름·교인ID)를
//    남긴다. 여기서도 남기면 이름 한 번 누를 때마다 교인명부 기록이 두 줄씩 쌓여 누가 누구를 봤는지 읽기 어려워진다.
// ⚠️ 읽는 칸은 EV_PERSON_COLS 뿐 — Task 8 의 EV_LOOKUP_COLS(이름 + 옮겨 적기 재료 일곱)에 교인ID 하나. 연락처·주소·생년월일·사진은 읽지 않는다.
// ⚠️ 같은 이름을 **모두** 읽는다(allRows) — 같은 소속인 분이 교인ID 차례로 스무 번째 뒤에 있어도 고르는 규칙이 틀리지 않게(total 도 이 수).
const EV_PERSON_COLS = "person_id," + EV_LOOKUP_COLS;

async function evPerson(ctx: Ctx, b: any) {
  const q = lookupName(b.name);                                     // no-name · bad-char · too-long(evPeopleLookup 과 같은 규칙)
  if (q.error) return { ok: false, error: q.error };
  if (!(await peopleSource())) return { ok: true, mode: "none" };   // 명부가 한 번도 안 올라왔다 — 묻지도 기록하지도 않는다
  const cands = await allRows(() => db.from("church_people").select(EV_PERSON_COLS)
    .eq("name_key", q.key).order("person_id", { ascending: true }));
  const full = ctx.roles.includes("directory") || ctx.roles.includes("super");
  const out = personOut(cands as PersonCand[], personAsk(b, q.name), full);
  if (out.mode === "basic" || out.pick === null) {
    await audit(ctx, "people.lookup", "", { q: q.name, count: out.mode === "basic" ? out.people.length : out.candidates.length });
  }
  return { ok: true, ...out };
}

Deno.serve(async (req) => {
```
(이 절의 흐름은 워크트리 사본에서 `db`·`allRows`·`audit`·`peopleSource` 를 흉내 낸 채 돌려 보았다 — 성경필사 역할은 다섯 칸 + 기록 한 줄, 교인명부 역할은 교인ID · 한 분을 골랐으면 기록 없음 · 못 골랐으면(후보·빈 후보) 기록 한 줄, 빈 이름은 `no-name`, 명부 없음은 `{ok:true, mode:"none"}`, 읽는 칸은 `person_id,name,name_key,kind2,mok1,mok3,school_dept,position,position_detail`.)

- [ ] **Step 8: index.ts — switch 한 줄**

Edit 도구로 앵커 줄 `      case "evPeopleLookup": return json(await evPeopleLookup(ctx, b));`(Task 8) 을 아래로 바꾼다(그 줄 그대로 + 바로 뒤에 한 줄):
```ts
      case "evPeopleLookup": return json(await evPeopleLookup(ctx, b));
      case "evPerson":       return json(await evPerson(ctx, b));
```

- [ ] **Step 9: 이름·자리 점검 · preflight**

`node --check` 는 TS 오류를 못 잡는다(CONTRACT 5) — index.ts 의 문법은 Step 10 의 **개발 함수 배포**가 검사한다. 여기서는 배포가 거절할 「같은 이름 두 번 들이기」와 빠진 자리를 grep 으로 본다.
```bash
cd /c/Projects/church-admin/.worktrees/bible-events
I=supabase/functions/church-admin/index.ts
grep -c 'from "./events-person.ts"' $I                                              # 1
for n in personAsk personOut PersonCand lookupName; do
  printf '%s %s\n' "$n" "$(grep -cE "^import .*[{ ,](type )?$n[ ,}]" $I)"
done                                                                                 # 넷 모두 1
grep -cE '^const EV_PERSON_COLS = |^async function evPerson\(' $I                    # 2
grep -c 'case "evPerson":' $I                                                        # 1
grep -c 'audit(ctx, "people.lookup"' $I                                              # 2 — evPeopleLookup(Task 8) · evPerson(이 과제)
python tools/preflight.py | tail -1
```
Expected: `1` · `personAsk 1`·`personOut 1`·`PersonCand 1`·`lookupName 1`(2 이상이면 같은 이름을 두 번 들였다 — 배포가 거절하거나 함수가 뜨지 않는다) · `2` · `1` · `2` · `모두 통과`.

- [ ] **Step 10: 개발 배포(문법 검사) · 개발 시험 · 커밋**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
git status --short        # 네 줄만 — M authz.ts · M index.ts · M tests/authz.test.mjs · M tests/server.dev.test.mjs
supabase functions deploy church-admin --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo
set -a; . ~/.church-admin/dev.env; set +a
node --experimental-strip-types --test tests/server.dev.test.mjs
```
Expected: `git status` 네 줄뿐(다른 것이 보이면 멈춘다 — 배포는 작업 트리를 통째로 올린다) · `Deployed Functions on project ktpwthwqzgcqcrmsafdo: church-admin`(배포는 **워크트리 루트**에서) · 개발 시험 끝에 `# fail 0` — 새 시험 둘 · 「권한 표」(`directory` 는 `forbidden`, `bibleevent`·`super` 는 `no-name`) · 「PROBE」 모두 통과, `정리 실패` 없음.
배포가 문법 오류로 거절되거나, 배포는 됐는데 모든 요청이 500·503 이면(함수가 뜨지 못했다 — 겹친 이름 등) Step 9 부터 다시 본다. 아직 커밋 전이니 고쳐서 다시 배포·시험한다.
⚠️ 「④ 명단의 교적 표시와 같다」가 실패하면 창과 명단이 **다른 분**을 가리킨다는 뜻이다 — `evRoster` 의 `churchLookup` 과 `evPerson` 이 읽는 후보가 다른지(이름 키 · 1,000행) 본다. 기대값을 고쳐 넘기지 않는다.

통과하면 커밋:
```bash
cd /c/Projects/church-admin/.worktrees/bible-events
git add supabase/functions/church-admin/authz.ts supabase/functions/church-admin/index.ts tests/authz.test.mjs tests/server.dev.test.mjs
git commit -F - <<'EOF'
feat(성경필사): evPerson — 이름을 누르면 교적 창(교인명부 역할·총괄이면 교인ID로 「자세히」 창, 성경필사만이면 다섯 칸+교적 표시 · 고르면 한 분만 · basic 과 못 고른 full 은 people.lookup · 연락처·주소·사진은 읽지도 않는다)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
git show --stat HEAD      # 네 파일만인지 본다
git status --short        # 아무것도 안 나와야 한다
```
⚠️ 운영(`xnomlgydifiqiybervtf`)에는 배포하지 않는다 — 운영은 Task 15 에서만. 푸시하지 않는다.

- [ ] **Step 11: 화면 — 실패하는 순수 시험 `tests/be-person-logic.test.mjs`(새 파일)**

```js
// 이름을 누르면 교적 창(js/menus/bibleevent/person-logic.js) — 순수 함수 시험(계획 Task 16). 창을 여닫는 동작은
// 브라우저에서 본다(Task 16 Step 18 · Task 14 점검표). 이름은 가짜(홍길동 …)만.
import { test } from "node:test";
import assert from "node:assert/strict";
import { NOT_FOUND, NO_DIRECTORY, CONTACT_NOTE, FAMILY_NOTE, personAttrs, personPayload, nameButtonHtml, rowFromLabel,
  personDecision, candOptions, chooseTitle, basicHtml } from "../js/menus/bibleevent/person-logic.js";
import { whoText } from "../js/menus/bibleevent/roster-logic.js";
import { cardHtml, tableHtml } from "../js/menus/bibleevent/roster-ui.js";
import { affLabel } from "../supabase/functions/church-admin/events-stats.ts";

// 브라우저가 data-* 를 dataset 으로 풀어 주는 것과 같게(글자 참조를 푼다) — Node 에는 DOM 이 없다
const unesc = (s) => s.replace(/&(amp|lt|gt|quot|#39);/g, (_, k) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" }[k]));
const datasetOf = (html) => {
  const ds = {};
  for (const [, k, v] of html.matchAll(/data-([a-z]+)="([^"]*)"/g)) ds[k] = unesc(v);
  return ds;
};

test("personAttrs → dataset → personPayload — 이름·구분·소속·세부 넷이 그대로 돌아온다(esc 된 글자 포함)", () => {
  const rows = [
    { name: "홍길동", who_type: "교구", group: "화평", sub: "20" },
    { name: "  홍  길동 ", who_type: "교구", group: "소망", sub: "남성" },
    { name: "홍<길&동>'", who_type: "교회학교", group: "중등부", sub: "3학년" },
    { name: "홍길동".normalize("NFD"), who_type: "", group: "", sub: "" },
  ];
  for (const r of rows) {
    const ds = datasetOf(`<button ${personAttrs(r)}>`);
    assert.equal(ds.act, "person");
    assert.deepEqual(personPayload(ds), { name: r.name.trim().replace(/\s+/g, " "), who_type: r.who_type, group: r.group, sub: r.sub });
  }
  assert.ok(!personAttrs(rows[2]).includes("<길"), "속성 안의 글자는 esc");
  assert.deepEqual(personPayload(undefined), { name: "", who_type: "", group: "", sub: "" });
  // 교적 값·줄 id 같은 다른 칸은 싣지 않는다
  assert.deepEqual(Object.keys(datasetOf(personAttrs({ ...rows[0], id: 7, church: { state: "맞음" }, note: "메모" }))).sort(),
    ["act", "group", "name", "sub", "who"]);
});

test("nameButtonHtml — 단추(type=button · be-name) · 보이는 글자는 이름 또는 이름표 · aria-label · esc", () => {
  const h = nameButtonHtml({ name: "홍<길동>", who_type: "교구", group: "화평", sub: "20" });
  assert.match(h, /^<button type="button" class="be-name" data-act="person" /);
  assert.ok(h.includes("<b>홍&lt;길동&gt;</b>") && !h.includes("<길동>"));
  assert.ok(h.includes('aria-label="홍&lt;길동&gt; — 교적 보기"'));
  const g = nameButtonHtml({ name: "홍길동", who_type: "교구", group: "화평", sub: "20" }, "홍길동 · 화평 20목장");
  assert.ok(g.includes("<b>홍길동 · 화평 20목장</b>") && g.includes('data-name="홍길동"'));
  assert.ok(nameButtonHtml({ name: "" }).includes("<b>이름 없음</b>"));
  assert.ok(!h.includes("\n"));
});

test("rowFromLabel — 서버 affLabel(통계 repeaters 의 소속 한 줄)을 구분·소속·세부로 되읽는다 · 다시 쓰면 같은 글자", () => {
  const rows = [
    { who_type: "교구", group: "화평", sub: "20" }, { who_type: "교구", group: "소망", sub: "남성" },
    { who_type: "교구", group: "새가족", sub: "" }, { who_type: "교구", group: "화평", sub: "" },
    { who_type: "교회학교", group: "청년부", sub: "" }, { who_type: "교회학교", group: "중등부", sub: "3학년" },
    { who_type: "교구", group: "시험", sub: "0" },                 // 모르는 교구라도 숫자 목장이면 교구로
  ];
  for (const r of rows) {
    const label = affLabel({ who_type: r.who_type, group_name: r.group, sub_name: r.sub });
    assert.deepEqual(rowFromLabel(label), r, label);
    assert.equal(whoText(rowFromLabel(label)), whoText(r), label);
  }
  assert.deepEqual(rowFromLabel("(소속 없음)"), { who_type: "", group: "", sub: "" });
  assert.deepEqual(rowFromLabel(""), { who_type: "", group: "", sub: "" });
  assert.deepEqual(rowFromLabel(undefined), { who_type: "", group: "", sub: "" });
});

test("personDecision — 오류 · 명부 없음 · 찾은 분 없음 · 작은 창 · 곧바로 「자세히」 · 고르기", () => {
  assert.deepEqual(personDecision({ ok: false, error: "forbidden" }), { kind: "error" });
  assert.deepEqual(personDecision(null), { kind: "error" });
  assert.deepEqual(personDecision({ ok: true, mode: "none" }), { kind: "none" });
  assert.deepEqual(personDecision({ ok: true, mode: "full", pick: null, candidates: [] }), { kind: "empty" });
  assert.deepEqual(personDecision({ ok: true, mode: "basic", pick: null, people: [], church: { state: "없음", reason: "" } }), { kind: "empty" });
  assert.deepEqual(personDecision({ ok: true, mode: "basic", pick: 0, people: [{ name: "홍길동" }] }), { kind: "basic" });
  assert.deepEqual(personDecision({ ok: true, mode: "full", pick: 0, candidates: [{ person_id: 12 }] }), { kind: "open", id: "12" });
  assert.deepEqual(personDecision({ ok: true, mode: "full", pick: null, candidates: [{ person_id: 12 }, { person_id: 13 }] }), { kind: "choose" });
  assert.deepEqual(personDecision({ ok: true, mode: "full", pick: 5, candidates: [{ person_id: 12 }] }), { kind: "choose" });
  assert.deepEqual(personDecision({ ok: true, mode: "이상한" }), { kind: "error" });
});

test("candOptions · chooseTitle — 고르개 한 줄 = 이름 · 「소속 · 직분」 · 값은 교인ID 글자 · 스무 분을 넘으면 제목에 「앞 20분」", () => {
  assert.deepEqual(candOptions([{ person_id: 12, name: "홍길동", label: "화평 20목장", position: "집사" },
    { person_id: 13, name: "홍길동", label: "(소속 없음)", position: "" }]), [
    { value: "12", label: "홍길동", hint: "화평 20목장 · 집사" },
    { value: "13", label: "홍길동", hint: "(소속 없음)" }]);
  assert.deepEqual(candOptions(undefined), []);
  const c = (n) => Array.from({ length: n }, (_, i) => ({ person_id: 100 + i, name: "홍길동", label: "화평 1목장", position: "" }));
  assert.equal(chooseTitle("홍길동", { candidates: c(2), total: 2 }), "홍길동 — 어느 분인가요?");
  assert.equal(chooseTitle("홍길동", { candidates: c(20), total: 21 }), "홍길동 — 어느 분인가요? (같은 이름 21분 중 앞 20분)");
  assert.equal(chooseTitle("홍길동", { candidates: c(2) }), "홍길동 — 어느 분인가요?", "total 이 없으면 보여 주는 수로");
});

test("basicHtml — 고른 분 한 분 · 동명이인이면 모두와 안내 · 교적 표시 · 연락처 안내 · 줄바꿈 글자 없음 · esc", () => {
  const P = (o) => ({ name: "홍길동", who_type: "교구", group: "화평", sub: "20", position: "집사", ...o });
  const one = basicHtml({ ok: true, mode: "basic", pick: 0, people: [P()], church: { state: "맞음", reason: "" } });
  assert.equal((one.match(/<li /g) || []).length, 1);
  assert.ok(one.includes("화평 20목장") && one.includes("집사") && one.includes("교적 ✓"));
  assert.ok(one.includes(CONTACT_NOTE));
  assert.ok(!one.includes("같은 이름이"));
  const many = basicHtml({ ok: true, mode: "basic", pick: null, church: { state: "확인 필요", reason: "같은 이름 2명" },
    people: [P({ name: "홍<길동>" }), P({ who_type: "", group: "", sub: "", position: "" })] });
  assert.equal((many.match(/<li /g) || []).length, 2);
  assert.ok(many.includes("같은 이름이 <b>2분</b>") && many.includes("교적 확인") && many.includes("같은 이름 2명"));
  assert.ok(many.includes("홍&lt;길동&gt;") && !many.includes("<길동>"));
  assert.ok(many.includes("소속을 정하지 못했어요"));
  for (const h of [one, many]) assert.ok(!/[\r\n]/.test(h), "dialog 본문은 pre-line — 줄바꿈 글자를 넣지 않는다");
  assert.ok(!basicHtml({ pick: 0, people: [P()], church: null }).includes("맞대 보면"), "교적 표시가 없으면(null) 그 줄도 없다");
  // 스무 분으로 잘린 목록 — 수는 서버 total(자르기 전)로 적고 「앞 20분만」을 붙인다(옆 교적 표시 「같은 이름 21명」과 같게)
  const capped = basicHtml({ ok: true, mode: "basic", pick: null, total: 21, church: { state: "확인 필요", reason: "같은 이름 21명" },
    people: Array.from({ length: 20 }, () => P()) });
  assert.equal((capped.match(/<li /g) || []).length, 20);
  assert.ok(capped.includes("같은 이름이 <b>21분</b> 있어요(앞 20분만 보여요)") && capped.includes("같은 이름 21명"), capped.slice(0, 200));
  assert.ok(many.includes("같은 이름이 <b>2분</b> 있어요 — "), "total 이 없으면 받은 수 그대로 · 「앞 N분만」 없음");
});

test("문구 — 설계 §3 그대로 · 「명부 없음」과 「찾지 못함」을 가른다", () => {
  assert.equal(CONTACT_NOTE, "연락처·사진은 교인명부 담당자만 볼 수 있어요");
  assert.equal(NOT_FOUND, "교인명부에서 찾지 못했어요");
  assert.notEqual(NO_DIRECTORY, NOT_FOUND);
  assert.ok(FAMILY_NOTE.includes("교인 찾기"));
});

test("📋 회차·명단의 카드·표 — 이름이 교적 창 단추(명단 줄의 넷을 싣는다)", () => {
  const ROW = { id: 7, who_type: "교구", group: "화평", sub: "20", name: "홍<길동>", position: "집사", note: "", source: "import",
    hasUser: false, at: "2026-10-01", updated_at: "u", church: null };
  for (const h of [cardHtml(ROW, false), tableHtml([{ key: "교구|화평", label: "화평", rows: [ROW] }], new Set())]) {
    const btn = h.match(/<button type="button" class="be-name"[^>]*>/);
    assert.ok(btn, "이름 단추가 없다");
    assert.deepEqual(personPayload(datasetOf(btn[0])), { name: "홍<길동>", who_type: "교구", group: "화평", sub: "20" });
    assert.ok(h.includes("<b>홍&lt;길동&gt;</b>"));
  }
});

test("화면 모듈이 Node 에서 읽힌다 — 교인명부 openPerson 을 내보냈고, 두 화면이 새 이름을 들인다", async () => {
  const pop = await import("../js/menus/bibleevent/person-popup.js");
  const search = await import("../js/menus/people/search.js");
  assert.equal(typeof pop.openChurchPerson, "function");
  assert.equal(typeof search.openPerson, "function");
  assert.equal(typeof (await import("../js/menus/bibleevent/roster.js")).render, "function");
  assert.equal(typeof (await import("../js/menus/bibleevent/history.js")).render, "function");
});
```

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
node --experimental-strip-types --test tests/be-person-logic.test.mjs
```
Expected: FAIL — `Cannot find module '…/js/menus/bibleevent/person-logic.js'`(`ERR_MODULE_NOT_FOUND`) · `# fail 1`.

- [ ] **Step 12: `js/menus/bibleevent/person-logic.js`(순수 · 새 파일)**

```js
// 이름을 누르면 교적 창 — 화면 논리(순수 함수 · 2026-09-30 · 계획 Task 16). tests/be-person-logic.test.mjs 가 같은 파일을 읽는다(DOM 없음).
// 설계: v2 docs/superpowers/specs/2026-09-29-church-admin-bible-events-design.md §0 「이름을 누르면 교적 창」·§3 · 친구 결정 §8-8.
// ⚠️ 이름 단추에는 명단 줄의 이름·구분·소속·세부만 싣는다(서버 evPerson 이 받는 넷) — 교적 값은 서버 답으로만 창에 들어간다.
// ⚠️ 작은 창(ui.js dialog)의 본문은 white-space:pre-line 이다 — 여기서 만드는 HTML 에 줄바꿈 글자를 넣지 않는다(설계 §3 「팝업」).
// ⚠️ 사람·서버 글자는 모두 esc — 이 파일이 만든 글이 그대로 innerHTML 로 들어간다.
import { esc } from "../../core/ui.js";
import { churchBadgeHtml } from "../people/church-badge.js";
import { GU_ORDER, norm, whoText } from "./roster-logic.js";

export const NOT_FOUND = "교인명부에서 찾지 못했어요";
// 「아직 모른다」와 「없다」를 뭉개지 않는다 — 명부가 한 번도 안 올라왔으면 「찾지 못했어요」라 하지 않는다
export const NO_DIRECTORY = "교인명부가 아직 올라오지 않아 찾을 수 없어요";
export const CONTACT_NOTE = "연락처·사진은 교인명부 담당자만 볼 수 있어요";
// 「자세히」 창의 「👪 가족 모두 목록으로」 — 이 메뉴에는 가족 목록이 없다(🔎 교인 찾기에서 본다)
export const FAMILY_NOTE = "가족 목록은 🔎 교인 찾기에서 그분을 찾아 「가족 모두 목록으로」로 볼 수 있어요";

// 단추에 싣는 것(명단 줄 그대로) — data-act="person" 은 📋 회차·명단 · 👤 사람별 이력·통계의 눌림 처리가 읽는다
export function personAttrs(p) {
  return `data-act="person" data-name="${esc(norm(p?.name))}" data-who="${esc(norm(p?.who_type))}" ` +
    `data-group="${esc(norm(p?.group))}" data-sub="${esc(norm(p?.sub))}"`;
}

// 단추의 dataset(브라우저가 &lt; 같은 것을 풀어 준 글자) → evPerson 에 보낼 것
export const personPayload = (ds) => ({
  name: norm(ds?.name), who_type: norm(ds?.who), group: norm(ds?.group), sub: norm(ds?.sub),
});

// 이름 단추 — 보이는 글자는 이름(기본) 또는 「이름 · 소속」 이름표(👤 이력의 묶음 머리). 이름처럼 보이고 누르면 교적 창.
export function nameButtonHtml(p, text) {
  const t = norm(text ?? p?.name) || "이름 없음";
  return `<button type="button" class="be-name" ${personAttrs(p)} aria-label="${esc(t)} — 교적 보기"><b>${esc(t)}</b></button>`;
}

// 👤 통계 「여러 번 참여한 분」의 소속 한 줄(서버 affLabel — 「화평 20목장」·「소망 남성」·「중등부 3학년」·「(소속 없음)」)을
// 구분·소속·세부로 되읽는다. 통계 응답(repeaters)에는 소속 칸이 따로 없어서다(Task 4·5 의 응답 모양을 바꾸지 않는다).
// 교구 이름 여덟(GU_ORDER)이 아니면서 「N목장」도 아니면 교회학교로 본다 — 서버 affLabel 이 교구 줄의 숫자 목장에만 「목장」을 붙이므로
// 「시험 0목장」처럼 모르는 교구도 교구로 돌아온다. 틀리게 읽어도 교적 창의 「누구인지 고르기」만 달라진다(이름으로 찾는다).
export function rowFromLabel(label) {
  const s = norm(label);
  if (!s || s === "(소속 없음)") return { who_type: "", group: "", sub: "" };
  const m = /^(\S+) (\d+)목장$/.exec(s);
  if (m) return { who_type: "교구", group: m[1], sub: m[2] };
  const i = s.indexOf(" ");
  const head = i < 0 ? s : s.slice(0, i), rest = i < 0 ? "" : s.slice(i + 1);
  return { who_type: GU_ORDER.includes(head) ? "교구" : "교회학교", group: head, sub: rest };
}

// 서버 답 → 할 일. full 은 고른 분(pick)이 있으면 곧바로 「자세히」 창, 없으면 고르개.
export function personDecision(r) {
  if (!r || !r.ok) return { kind: "error" };
  if (r.mode === "none") return { kind: "none" };
  if (r.mode === "full") {
    const c = Array.isArray(r.candidates) ? r.candidates : [];
    if (!c.length) return { kind: "empty" };
    if (Number.isInteger(r.pick) && c[r.pick]) return { kind: "open", id: String(c[r.pick].person_id) };
    return { kind: "choose" };
  }
  if (r.mode === "basic") return Array.isArray(r.people) && r.people.length ? { kind: "basic" } : { kind: "empty" };
  return { kind: "error" };
}

// 고르개(pickOne)에 넣을 후보 — 이름 · 「소속 · 직분」
export const candOptions = (cands) => (cands || []).map((c) => ({
  value: String(c.person_id), label: norm(c.name) || "이름 없음",
  hint: [norm(c.label), norm(c.position)].filter(Boolean).join(" · "),
}));

// 서버가 준 수(total — 스무 분으로 자르기 전)와 보여 주는 수. total 이 없거나 이상하면 보여 주는 수로.
const shownTotal = (total, shown) => (Number.isInteger(total) && total >= shown ? total : shown);

// 고르개 제목 — 같은 이름이 스무 분을 넘으면 「앞 20분」임을 적는다(목록이 다인 줄 알고 찾는 분이 없다고 여기지 않게)
export function chooseTitle(name, r) {
  const n = Array.isArray(r?.candidates) ? r.candidates.length : 0;
  const total = shownTotal(r?.total, n);
  return `${norm(name) || "이름 없음"} — 어느 분인가요?` + (total > n ? ` (같은 이름 ${total}분 중 앞 ${n}분)` : "");
}

// 성경필사 역할만 — 작은 창 본문. 고른 분이 있으면 그 한 분, 못 골랐으면 같은 이름 모두(서버가 스무 분까지 준다).
const personLi = (p) => `<li class="be-pp-p"><b class="be-pp-nm">${esc(norm(p.name) || "이름 없음")}</b>` +
  (norm(p.position) ? `<em class="be-pos">${esc(norm(p.position))}</em>` : "") +
  `<span class="be-pp-aff">${esc(whoText(p) || "소속을 정하지 못했어요(새가족 등)")}</span></li>`;
export function basicHtml(r) {
  const people = Array.isArray(r?.people) ? r.people : [];
  const one = Number.isInteger(r?.pick) && people[r.pick] ? people[r.pick] : null;
  // 같은 이름의 수는 서버의 total(자르기 전) — 스무 분만 받았어도 「21분」이라 적고 「앞 20분만」을 붙인다(옆 교적 표시 「같은 이름 21명」과 같게)
  const total = shownTotal(r?.total, people.length);
  const more = total > people.length ? `(앞 ${people.length}분만 보여요)` : "";
  const head = one ? "" : `<p class="be-pp-many">교인명부에 같은 이름이 <b>${total}분</b> 있어요${more} — 소속으로 누구인지 확인해 주세요</p>`;
  const cb = churchBadgeHtml(r?.church);
  return `<div class="be-pp">${head}<ul class="be-pp-list">${(one ? [one] : people).map(personLi).join("")}</ul>` +
    (cb ? `<p class="be-pp-cb">명단의 소속과 맞대 보면 ${cb}</p>` : "") +
    `<p class="be-pp-note">🔒 ${esc(CONTACT_NOTE)}</p></div>`;
}
```

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
node --check js/menus/bibleevent/person-logic.js && echo "문법 통과"
node --experimental-strip-types --test tests/be-person-logic.test.mjs
```
Expected: `문법 통과` · `# pass 7` · `# fail 2` — `not ok 8 - 📋 회차·명단의 카드·표 …`(이름 단추가 아직 없다) · `not ok 9 - 화면 모듈이 Node 에서 읽힌다 …`(`person-popup.js` 가 아직 없다).

- [ ] **Step 13: 교인명부 `openPerson` 내보내기 · `js/menus/bibleevent/person-popup.js`(새 파일)**

13-1. `js/menus/people/search.js` — Edit 도구로 앵커 줄 `async function openPerson(call, id, onFamily, back) {` **한 줄**을 아래 두 줄로 바꾼다(함수 몸통은 한 글자도 안 바꾼다 — 교인명부는 다른 세션도 고치는 공용 파일이다):
```js
// 성경필사(암송) 「이름을 누르면 교적 창」(js/menus/bibleevent/person-popup.js)도 이것을 부른다 — 이름·인자·가족 단추(data-fam·data-fam-all)를 바꾸면 그쪽도.
export async function openPerson(call, id, onFamily, back) {
```

13-2. `js/menus/bibleevent/person-popup.js` 를 만든다:
```js
// 이름을 누르면 교적 창 — 📋 회차·명단 · 👤 사람별 이력·통계의 이름 단추가 부른다(2026-09-30 · 친구 결정 · 계획 Task 16).
// 설계: v2 docs/superpowers/specs/2026-09-29-church-admin-bible-events-design.md §0 「이름을 누르면 교적 창」·§2 evPerson·§3.
// ⚠️ 무엇을 보여 줄지는 **서버**(evPerson)가 부른 분의 역할로 정한다 — 화면은 받은 모양(mode)대로 그리기만 한다.
//    full(교인명부 역할·총괄) → 교인명부 「자세히」 창(people/search.js openPerson — 그쪽이 peoplePerson 을 불러 people.view 가 남는다).
//      고른 분이 없으면(동명이인) 먼저 고르개(pickOne)로 고른다.
//    basic(성경필사 역할만) → 작은 창(ui.js dialog)에 이름·소속·직분·교적 표시 + 「연락처·사진은 교인명부 담당자만 볼 수 있어요」.
//    none(교인명부가 아직 없음) · 찾은 분 없음 → 알림 한 줄(toast).
// ⚠️ 브라우저·시스템 창을 띄우지 않는다 — dialog·pickOne·toast 만. 읽기만 하는 창이라 입력 창(openForm)을 쓰지 않는다
//    (설계 §3 「확인·알림은 ui.js dialog/toast · 입력이 있는 창은 전용 창」).
// ⚠️ 이름 한 번 누름 = 한 묶음(session): 작은 창 하나, 또는 [고르개 →] 「자세히」 창(가족 이름으로 넘어간 창까지). 묶음 동안만 —
//    ① 뒤로 가기(설계 §3 「팝업」): 창을 열 때 history.pushState({bePerson:1}) 로 한 칸을 쌓고 popstate 를 「창 닫기」로 받는다
//       → 창만 닫히고 명단(회차·거르기·스크롤)은 그대로. 「닫기」·Esc 로 닫으면 history.back() 으로 그 칸을 거두고 **거둔 뒤에**
//       끝낸다(js/core/modal.js 와 같은 차례 — 안 거두면 다음 뒤로 가기 한 번이 헛 누름이 된다).
//    ② 메뉴 옮기기(hashchange — 주소창·메뉴 누르기): 떠 있는 우리 창을 닫고, 아직 묻는 중이면 답이 와도 창을 띄우지 않는다.
//       쌓은 칸은 거두지 않는다(이미 새 메뉴다 — modal.js closeAllForms 와 같은 까닭).
//    ③ 늦게 뜬 창: 「자세히」 창은 openPerson 이 peoplePerson 답을 받은 **뒤에** 붙는다 — ①·② 뒤에 붙으면 곧바로 닫는다(MutationObserver).
//    ④ 가족: 「자세히」 창의 가족 이름은 여기서 먼저 받아 그 창을 닫고 **같은 칸에서** 그분 창을 연다(openPerson 이 스스로 넘기면
//       첫 창이 닫히는 순간 묶음이 끝난 줄 알게 된다) · 「👪 가족 모두 목록으로」는 알림 한 줄(이 메뉴에는 가족 목록이 없다 — 창은 그대로).
//    교인 찾기(🔎)의 「자세히」 창은 묶음 밖이라 건드리지 않는다.
// ⚠️ 이 파일은 Node 시험(tests/be-person-logic.test.mjs)이 불러 본다 — 맨 위에서 document·window·history 를 만지지 않는다(bind 는 처음 누를 때).
import { toast, dialog, errorText } from "../../core/ui.js";
import { pickOne } from "../../core/picker.js";
import { openPerson } from "../people/search.js";
import { NOT_FOUND, NO_DIRECTORY, FAMILY_NOTE, personDecision, candOptions, chooseTitle, basicHtml } from "./person-logic.js";

// 우리 창 — 작은 창(be-pp-dlg) · 「자세히」 창(pd — 교인명부 openPerson 이 dialog 에 주는 cls). 고르개(.pk-dim)는 한 번에 하나뿐이다.
const OUR_DLG = ".dlg-dim > .dlg.be-pp-dlg, .dlg-dim > .dlg.pd";

let session = null;     // 지금 묶음 { pushed, popped, cancelled, next } — 묻는 중이거나 창이 떠 있는 동안(두 번 눌러도 창·기록은 하나)
let backWaiter = null;  // 우리가 부른 history.back() 이 돌아오면 부를 것
let bound = false;
let watcher = null;

// 떠 있는 우리 창을 닫는다 — 고르개는 Esc 로(picker.js 는 keydown 을 잡는 단계에서 받는다 · 뜬 뒤 300ms 누름 막기에 안 걸린다),
// 작은 창·「자세히」 창은 「닫기」 단추로(modal.js 가 고르개를 닫는 방법과 같다)
function closeOurs() {
  if (document.querySelector(".pk-dim")) document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  for (const d of document.querySelectorAll(OUR_DLG)) d.querySelector('[data-v="1"]')?.click();
}

function bind() {
  if (bound) return;
  bound = true;
  window.addEventListener("popstate", () => {
    if (backWaiter) { const w = backWaiter; backWaiter = null; w(); return; }   // 우리가 거둔 칸 — 닫기 요청이 아니다
    const s = session;
    if (!s || !s.pushed || s.popped) return;
    s.popped = true;              // ① 뒤로 가기 — 우리 칸이 빠졌다(주소·메뉴·명단은 그대로)
    closeOurs();
  });
  window.addEventListener("hashchange", () => {
    const s = session;
    if (!s) return;
    s.cancelled = true;           // ② 메뉴를 옮겼다 — 떠 있는 창을 닫고, 묻는 중이면 답이 와도 띄우지 않는다
    closeOurs();
  });
  // ④ 「자세히」 창의 가족 단추(person-detail.js 의 data-fam · data-fam-all) — 잡는 단계(capture)에서 먼저 받는다
  //    (openPerson 은 창의 click 거품에서 받는다 · 여기서 멈추면 그쪽 가족 처리는 돌지 않는다)
  document.addEventListener("click", (e) => {
    const s = session;
    const t = s && e.target instanceof Element ? e.target : null;
    const fam = t?.closest(".dlg.pd [data-fam]"), all = t?.closest(".dlg.pd [data-fam-all]");
    if (!fam && !all) return;
    e.stopPropagation();
    if (all) { toast(FAMILY_NOTE); return; }          // 이 메뉴에는 가족 목록이 없다 — 창은 그대로
    s.next = fam.dataset.fam;                         // 이 창을 닫고 같은 칸에서 그분 창을 연다(openChurchPerson 의 되풀이)
    fam.closest(".dlg-dim")?.querySelector('[data-v="1"]')?.click();
  }, true);
}

// ③ 묶음 동안 몸(body)에 창이 붙으면 — 이미 뒤로 갔거나 메뉴를 옮겼으면 곧바로 닫는다
function watch(on) {
  if (!on) { watcher?.disconnect(); return; }
  watcher = watcher || new MutationObserver(() => {
    const s = session;
    if (s && (s.cancelled || s.popped)) closeOurs();
  });
  watcher.observe(document.body, { childList: true });
}

function push(s) {
  history.pushState({ bePerson: 1 }, "");
  s.pushed = true;
}

// 쌓은 칸을 거두고, 거둔 뒤에 끝낸다. popstate 가 안 오는 드문 경우에도 1초 뒤엔 끝낸다(modal.js backThen 과 같다).
function back() {
  return new Promise((resolve) => {
    let t = 0;
    const done = () => { clearTimeout(t); if (backWaiter === done) backWaiter = null; resolve(); };
    t = setTimeout(done, 1000);
    backWaiter = done;
    history.back();
  });
}

// name·who_type·group·sub = 명단 줄 그대로(person-logic.js personPayload) · anchor = 누른 단추(창이 닫히면 초점을 돌려준다)
export async function openChurchPerson({ call, name = "", who_type = "", group = "", sub = "", anchor = null } = {}) {
  if (session) return;                                  // 묻는 중이거나 창이 떠 있다 — 두 번 눌러도 하나만
  bind();
  const s = session = { pushed: false, popped: false, cancelled: false, next: null };
  // 그사이 뒤로 갔거나(①) 메뉴를 옮겼거나(②) 명단을 다시 그려 누른 단추가 없어졌다 — 창을 띄우지 않는다
  const gone = () => s.cancelled || s.popped || (anchor != null && !anchor.isConnected);
  watch(true);
  try {
    const r = await call("evPerson", { name, who_type, group, sub });
    if (gone()) return;
    const d = personDecision(r);
    if (d.kind === "error") { toast(errorText(r)); return; }
    if (d.kind === "none") { toast(NO_DIRECTORY); return; }
    if (d.kind === "empty") { toast(NOT_FOUND); return; }
    push(s);                                            // 창 한 칸 — 뒤로 가기는 이 칸을 빼며 창만 닫는다
    if (d.kind === "basic") {
      const closed = dialog({ title: `🪪 ${name}님 교적`, html: basicHtml(r), ok: "닫기", cancel: null, cls: "be-pp-dlg" });
      // dialog 는 창을 곧바로(동기로) 붙인다 — 초점을 「닫기」로(단추에 남으면 Enter 한 번에 같은 창이 또 뜬다 · search.js 와 같다)
      [...document.querySelectorAll(".dlg-dim")].pop()?.querySelector('[data-v="1"]')?.focus();
      await closed;
      if (anchor && anchor.isConnected) anchor.focus({ preventScroll: true });
      return;
    }
    // full — 고른 분이 있으면 곧바로, 없으면 고르개(닫으면 null — 아무것도 열지 않는다 · 초점은 고르개가 단추로 돌려준다)
    let id = d.kind === "open" ? d.id : await pickOne({ anchor, title: chooseTitle(name, r), options: candOptions(r.candidates) });
    // 「자세히」 창 — 사진·연락처·주소·가족은 peoplePerson 이 교인명부 역할을 다시 확인하고 준다(people.view 기록 · 초점은 그쪽이 돌려준다).
    // 가족 이름을 누르면(④) 그 창이 닫히고 s.next 에 그분 교인ID 가 남는다 — 같은 칸에서 이어 연다.
    while (id != null && !gone()) {
      s.next = null;
      await openPerson(call, id, () => toast(FAMILY_NOTE), anchor);
      id = s.next;
    }
  } finally {
    watch(false);
    // 「닫기」·Esc 로 끝났으면 쌓은 칸을 거둔다(거둔 뒤에 끝낸다). 뒤로 가기(①)·메뉴 옮기기(②)로 끝났으면 거두지 않는다.
    if (s.pushed && !s.popped && !s.cancelled) await back();
    session = null;
  }
}
```

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
grep -c '^export async function openPerson(call, id, onFamily, back) {' js/menus/people/search.js     # 1
grep -c 'async function openPerson(' js/menus/people/search.js                                        # 1 — 두 벌이 되지 않았다
node --check js/menus/people/search.js && node --check js/menus/bibleevent/person-popup.js && echo "문법 통과"
node --experimental-strip-types --test tests/be-person-logic.test.mjs tests/people-logic.test.mjs tests/person-detail.test.mjs
```
Expected: `1` · `1` · `문법 통과` · be-person-logic 은 `not ok 8 - 📋 회차·명단의 카드·표 …` 하나만 남는다(교인명부 시험 둘은 그대로 통과) · `# fail 1`.
(창을 여닫는 동작은 Node 시험이 못 본다 — 2026-09-30 에 이 파일을 헤드리스 크롬 사본에서 가짜 `call` 로 돌려 보았다: 작은 창 「닫기」 뒤 `history.state` 가 비고 뒤로 가기 한 번에 앞 주소로 · 창을 연 채 뒤로 가기 → 창만 닫히고 주소 그대로 · 가족 이름 → 같은 칸에서 그분 창 · 「가족 모두 목록으로」 → 알림, 창 그대로 · 고르개를 연 채 뒤로 가기 → 아무것도 안 열림 · 묻는 중·「자세히」 답을 기다리는 중에 뒤로 가기·메뉴 옮기기 → 창이 남지 않음 · 두 번 눌러도 `evPerson` 한 번 · 이 창 뒤에 연 입력 창(`modal.js`)의 뒤로 가기도 그대로. 화면에서는 Step 18 과 Task 14 가 본다.)

- [ ] **Step 14: 이름을 단추로 — `roster-ui.js`·`roster.js`(Task 10) · `history.js`(Task 12)**

모두 Edit 도구로, 앵커는 Step 0 에서 한 번씩만 나오는 것을 봤다. 있던 import 줄은 그대로 두고 **새 import 문**을 그 아래에 더한다.

14-1. `js/menus/bibleevent/roster-ui.js`
① 앵커 줄 `import { STATUS_KO, SRC_LABEL, subText, filterActive } from "./roster-logic.js";` 을 아래로(그 줄 그대로 + 두 줄):
```js
import { STATUS_KO, SRC_LABEL, subText, filterActive } from "./roster-logic.js";
// 이름을 누르면 교적 창(Task 16) — 이름 단추 모양
import { nameButtonHtml } from "./person-logic.js";
```
② 카드(`cardHtml`) — 조각 `` `<b>${esc(r.name)}</b>${posHtml(r)}${sub ? `` 을 아래 조각으로(그 줄의 나머지는 그대로):
```js
`${nameButtonHtml(r)}${posHtml(r)}${sub ?
```
③ 표(`tableHtml`) — 조각 `<td><b>${esc(r.name)}</b> ${dupHtml(dups.has(r.id))}</td>` 를 아래 조각으로:
```js
<td>${nameButtonHtml(r)} ${dupHtml(dups.has(r.id))}</td>
```

14-2. `js/menus/bibleevent/roster.js`
① 앵커 줄 `import { openRowForm, openRowDelete } from "./row-form.js";` 을 아래로(그 줄 그대로 + 세 줄):
```js
import { openRowForm, openRowDelete } from "./row-form.js";
// 이름을 누르면 교적 창(Task 16)
import { openChurchPerson } from "./person-popup.js";
import { personPayload } from "./person-logic.js";
```
② 눌림 처리 — 앵커 줄 `    else if (act === "row") rowMenu(b);` 을 아래로(그 줄 그대로 + 한 줄). 이름 단추는 `button[data-act]` 라 이미 있는 위임 처리(`el.addEventListener("click", …)`)에 한 갈래만 더한다:
```js
    else if (act === "row") rowMenu(b);
    else if (act === "person") openChurchPerson({ call, ...personPayload(b.dataset), anchor: b });   // 이름 → 교적 창(Task 16)
```

14-3. `js/menus/bibleevent/history.js`
① 앵커 줄 `} from "./history-logic.js";`(여러 줄 import 의 끝줄) 을 아래로(그 줄 그대로 + 세 줄):
```js
} from "./history-logic.js";
// 이름을 누르면 교적 창(Task 16)
import { openChurchPerson } from "./person-popup.js";
import { nameButtonHtml, personPayload, rowFromLabel } from "./person-logic.js";
```
② 이력 묶음 머리(`groupHtml`) — 조각 `<span class="be-hi-n">${esc(g.n)}</span><b>${esc(g.label)}</b><em>${g.rows.length}회</em>` 를 아래 조각으로.
묶음 이름표(「이름 · 소속」)는 서버가 **가장 최근 줄**로 만든다 — 그 줄이 `g.rows[0]` 이다(Task 5 `evHistory`). 이름은 찾은 이름(`hist.name`) — 이력 줄에는 이름 칸이 없고, 서버는 이름 키(완성형·띄어쓰기 없음)로 찾으니 같은 분이 나온다:
```js
<span class="be-hi-n">${esc(g.n)}</span>${nameButtonHtml({ ...(g.rows[0] || {}), name: hist.name }, g.label)}<em>${g.rows.length}회</em>
```
③ 여러 번 참여한 분 — 조각 `<button type="button" class="be-hi-who-btn" data-name="${esc(p.name)}" title="이 분의 이력 보기"><b>${esc(p.name)}</b><span class="be-hi-aff"> · ${esc(p.label)}</span></button>` 을 아래 조각으로(한 줄 · 이름은 교적 창, 예전의 「이력으로」는 「📜 이력」 단추 — 줄 끝 자리는 CSS `order` 가 잡는다):
```js
${nameButtonHtml({ name: p.name, ...rowFromLabel(p.label) })}<span class="be-hi-aff">${esc(p.label)}</span><button type="button" class="be-hi-who-btn" data-name="${esc(p.name)}" aria-label="${esc(p.name)} · ${esc(p.label)} — 이력 보기">📜 이력</button>
```
④ 앵커 줄 `    if (who) {   // 여러 번 참여한 분을 누르면 그분 이력으로` 을 아래 한 줄로(주석만 — 동작은 그대로 `.be-hi-who-btn`):
```js
    if (who) {   // 여러 번 참여한 분의 「📜 이력」 → 그분 이력으로(이름을 누르면 교적 창 — 아래 data-act="person")
```
⑤ 앵커 줄 `    const b = e.target.closest("button[data-act]");` 을 아래로(그 줄 그대로 + 한 줄 · 내려받기 갈래보다 앞):
```js
    const b = e.target.closest("button[data-act]");
    if (b && b.dataset.act === "person") { openChurchPerson({ call, ...personPayload(b.dataset), anchor: b }); return; }   // Task 16
```

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
grep -c 'nameButtonHtml(' js/menus/bibleevent/roster-ui.js      # 2 — 카드·표
grep -c '<b>${esc(r.name)}</b>' js/menus/bibleevent/roster-ui.js # 0 — 옛 이름 글자가 남지 않았다
grep -c 'act === "person"' js/menus/bibleevent/roster.js js/menus/bibleevent/history.js   # 파일마다 1
grep -c 'nameButtonHtml(' js/menus/bibleevent/history.js         # 2 — 묶음 머리·여러 번 참여
grep -c '>📜 이력</button>' js/menus/bibleevent/history.js       # 1
for f in js/menus/bibleevent/roster-ui.js js/menus/bibleevent/roster.js js/menus/bibleevent/history.js; do node --check "$f" || echo "문법 실패: $f"; done
node --experimental-strip-types --test tests/be-person-logic.test.mjs tests/be-roster-ui.test.mjs tests/be-roster-logic.test.mjs tests/be-history-logic.test.mjs
```
Expected: `2` · `0` · `…roster.js:1`·`…history.js:1` · `2` · `1` · 문법 실패 줄 없음 · `# fail 0` — be-person-logic 9 · be-roster-ui 6 · be-roster-logic 11 · be-history-logic 13(Task 10·12 의 시험이 그대로 통과한다 — 카드·표의 `홍&lt;길동&gt;` 은 단추 안 `<b>` 에 그대로 있다).
(이 네 파일의 시험은 2026-09-30 에 Task 10·12 초안 코드에 위 고치기를 얹은 사본에서 모두 통과했다.)

- [ ] **Step 15: `css/admin.css` 끝에 「be-name · be-pp-」 블록**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
grep -c '^\.be-name{' css/admin.css      # 0 이어야 한다(두 번 붙이지 않는다)
echo >> css/admin.css
cat >> css/admin.css <<'EOF'
/* ── 성경필사(암송) 이름을 누르면 교적 창(be-name · be-pp- · Task 16 · 2026-09-30) ─────────────────────
   이름은 이름처럼 보이는 단추 — 마우스를 올리거나 키보드 초점이면 밑줄. 폰에서 누르는 자리는 44px(--tap):
   위아래 여백을 늘리고 같은 만큼 음수 margin 으로 되돌려 줄 높이는 그대로 둔다.
   작은 창(ui.js dialog · cls "be-pp-dlg")은 읽기만 — 본문은 person-logic.js basicHtml(줄바꿈 글자 없음). */
.be-name{display:inline-block;min-height:var(--tap);margin:-10px -4px;padding:10px 4px;border:0;border-radius:8px;background:none;
  color:inherit;font:inherit;line-height:inherit;text-align:left;cursor:pointer;-webkit-tap-highlight-color:transparent}
.be-name:hover b,.be-name:focus-visible b{text-decoration:underline;text-underline-offset:3px;text-decoration-thickness:2px}
.be-name:focus-visible{outline:2px solid var(--navy);outline-offset:-2px}
.be-name:disabled{cursor:default}
/* PC 표 — 좁은 칸에서 이름이 한 글자씩 꺾이지 않게 */
.be-table .be-name{white-space:nowrap}
/* 👤 여러 번 참여한 분 — 이름(교적 창) · 소속 · 횟수 · 「📜 이력」(줄 오른쪽 끝) · 참여 회차(다음 줄) */
.be-hi-reps .be-hi-who-btn{order:1;margin-left:auto}
.be-hi-reps .be-hi-evs{order:2}
/* 작은 창 본문 */
.be-pp-many{margin-bottom:10px;font-size:14px;line-height:1.6;color:var(--navy-dark)}
.be-pp-many b{color:var(--navy)}
.be-pp-list{list-style:none;display:flex;flex-direction:column;gap:8px;margin-bottom:12px}
.be-pp-p{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 0;padding:10px 12px;border:1px solid var(--border);border-radius:10px;
  background:var(--cream)}
.be-pp-nm{font-size:16px;font-weight:800;color:var(--navy)}
.be-pp-aff{flex-basis:100%;font-size:14px;color:var(--navy-dark)}
.be-pp-cb{margin-bottom:12px;font-size:13px;color:var(--gray)}
.be-pp .cb,.be-pp .cb small{font-size:13px}
.be-pp-note{padding:8px 10px;border-radius:8px;background:var(--ghost-bg);color:var(--navy);font-size:13px;line-height:1.5}
EOF
python -c "s=open('css/admin.css',encoding='utf-8').read(); print(s.count('{'), s.count('}'))"
grep -c '^\.be-name{' css/admin.css
node -e "const s=require('fs').readFileSync('css/admin.css','utf8'); const b=s.slice(s.indexOf('(be-name · be-pp-')); const small=(b.match(/font-size:\d+px/g)||[]).filter((x)=>parseInt(x.slice(10),10)<13); console.log(small.length ? '작은 글씨: ' + small.join(' ') : '이 블록에 13px 미만 글씨 없음')"
```
Expected: `0`(붙이기 전) · 두 숫자가 같다 · `1` · `이 블록에 13px 미만 글씨 없음`.
(모양은 2026-09-30 에 헤드리스 크롬으로 카드·표·이력 머리·여러 번 참여·작은 창 둘을 그려 보았다 — 누르는 자리 44px 가 이름 위아래로 넓어지고 카드·표의 줄 높이는 그대로였다.)

- [ ] **Step 16: 문법 · 금지 부품 · preflight · 커밋(화면)**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
for f in js/menus/people/search.js js/menus/bibleevent/*.js; do node --check "$f" || echo "문법 실패: $f"; done
# 금지 부품 — 설명 주석(// …)에 적힌 이름은 빼고 본다
grep -nE "\b(alert|confirm|prompt)\(|<select|type=\"?(date|time)\"?|datalist|beforeunload" js/menus/bibleevent/person-*.js js/menus/people/search.js \
  | grep -vE "^[^:]+:[0-9]+:\s*//" || echo "금지 부품 없음"
python tools/preflight.py
git status --short
```
Expected: 문법 실패 줄 없음 · `금지 부품 없음` · preflight `[1]` 에 `person-logic.js`·`person-popup.js` 통과 · `[2]` 시험 파일 수가 Step 3 보다 하나 늘었다(`be-person-logic.test.mjs`) · 끝줄 `모두 통과` · `git status` 여덟 줄 — `M css/admin.css` · `M js/menus/bibleevent/history.js` · `M js/menus/bibleevent/roster-ui.js` · `M js/menus/bibleevent/roster.js` · `M js/menus/people/search.js` · `?? js/menus/bibleevent/person-logic.js` · `?? js/menus/bibleevent/person-popup.js` · `?? tests/be-person-logic.test.mjs`(다른 것이 보이면 멈춘다).

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
git add css/admin.css js/menus/bibleevent/history.js js/menus/bibleevent/roster-ui.js js/menus/bibleevent/roster.js js/menus/people/search.js \
  js/menus/bibleevent/person-logic.js js/menus/bibleevent/person-popup.js tests/be-person-logic.test.mjs
git commit -F - <<'EOF'
feat(성경필사): 📋·👤 이름을 누르면 교적 창 — 명단 카드·표·이력 묶음·여러 번 참여한 분의 이름을 단추로 · 교인명부 역할이면 「자세히」 창(openPerson 내보냄 · 동명이인은 고르개), 성경필사만이면 작은 창(이름·소속·직분·교적 표시·연락처 안내) · 뒤로 가기는 창만 닫는다(한 칸) · 여러 번 참여한 분의 이력은 「📜 이력」으로

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
git show --stat HEAD      # 여덟 파일만인지 본다
```

- [ ] **Step 17: 개인정보 안내 6번 — 이 기능 한 줄(여러 번 돌려도 같다)**

이 과제는 Task 13 **앞**에 돈다 — 그래서 `privacy.html` 6번에 **이 기능 한 줄만** 더한다(「보관:」 줄 앞). 이 줄은 Task 13 의 앵커 넷(6번 「쓰는 곳」·「보는 사람」·「기록」 줄 · `</main>`)과 선행 검사(`7. 성경필사(암송) 명단` 0 · `「성경필사(암송)」 역할` 0 · 카드 6)를 건드리지 않는 글이다.
7번 「성경필사(암송) 명단」·6번 「보는 사람」 글과 교회 어드민 `CLAUDE.md` 의 `evPerson` 줄은 **Task 13 이 이 과제까지 담아 처음부터** 쓴다(Task 13 Step 7 은 이 줄이 있는지 먼저 본다) — 여기서는 쓰지 않는다.
`audit.js` 도 고치지 않는다 — `evPerson` 은 `people.lookup` 을 그대로 쓰고, Task 13 의 이름표·설명 줄이 그 모양(`{q, count}`)을 읽는다.
⚠️ 「보는 사람」은 **총괄 관리자와** 「교인명부」 역할도 있는 담당자다(서버가 `super` 에게도 `full` 을 준다 — 총괄을 「그 밖의 담당자」에 넣으면 사실이 아닌 안내가 된다).

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
node - <<'JS'
// 이름을 누르면 교적 창(Task 16) — 개인정보 안내 6번에 한 줄. 여러 번 돌려도 같다(이미 있으면 건너뛴다). 줄 끝(CRLF)은 파일 것을 따른다.
const fs = require("fs");
const p = "privacy.html";
let s = fs.readFileSync(p, "utf8");
const nl = s.includes("\r\n") ? "\r\n" : "\n";
const LINE = "      이름을 누르면(성경필사(암송) 명단): 명단의 이름을 누르면 교인명부에서 그분을 찾아 보여 드려요." +
  " 총괄 관리자와 「교인명부」 역할도 있는 담당자에게는 교인 찾기와 같은 자세히 보기(사진·연락처·주소·가족)가 열리고" +
  "(자세히 보기를 열면 본 교인의 이름과 교인ID 가, 한 분으로 정하지 못해 고르는 창이 뜨거나 찾지 못하면 찾은 이름과 결과 수가 기록에 남아요)," +
  " 그 밖의 담당자에게는 이름·구분·소속·세부·직분 다섯 가지와 「교적과 맞는지」 표시만 보여요(찾은 이름과 결과 수가 기록에 남아요).<br>";
const ANCHOR = "      보관: 새 명단이 나오면 통째로 갈아 끼우고, 명단에서 빠진 분의 정보와 사진은 그때 지워요.";
if (s.includes("이름을 누르면(성경필사(암송) 명단):")) console.log("privacy 6번 줄 — 이미 있음");
else {
  const n = s.split(ANCHOR).length - 1;
  if (n !== 1) throw new Error(`앵커가 ${n}번 — 멈춘다(아무것도 쓰지 않았다): ${ANCHOR.slice(0, 30)}`);
  fs.writeFileSync(p, s.replace(ANCHOR, LINE + nl + ANCHOR));
  console.log("privacy 6번 줄 — 더함");
}
JS
grep -c "이름을 누르면(성경필사(암송) 명단):" privacy.html
grep -c "총괄 관리자와 「교인명부」 역할도 있는 담당자에게는" privacy.html
grep -c "7. 성경필사(암송) 명단" privacy.html; grep -c "「성경필사(암송)」 역할" privacy.html; grep -c '<div class="card">' privacy.html
grep -cF '보는 사람: 총괄 관리자와, 총괄 관리자가 「교인명부」 역할을 드린 담당자가 봐요.' privacy.html
grep -cF '기록: 누가 언제 누구를 찾아보고 내려받았는지 남겨요' privacy.html
python tools/preflight.py | tail -1
git status --short
```
Expected: `privacy 6번 줄 — 더함` · `1` · `1` · `0` · `0` · `6`(Task 13 의 선행 검사 `0 · 0 · 6` 이 그대로다) · `1` · `1`(Task 13 의 6번 앵커가 여전히 한 번씩) · `모두 통과` · `git status` 에 ` M privacy.html` 한 줄.
(2026-09-30 에 워크트리의 `privacy.html` 사본(CRLF)으로 두 번 돌려 보았다 — 두 번째는 `이미 있음` · 줄 끝은 파일 것 그대로 · Task 13 Step 7 의 네 Edit 앵커와 선행 검사가 모두 그대로 맞았다.)
`앵커가 N번 — 멈춘다` 로 끝나면 「보관:」 줄의 글이 바뀐 것이다(파일은 쓰지 않았다) — 그 자리를 눈으로 보고 앵커를 새로 잡은 뒤 다시 돌린다.

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
git add privacy.html
git commit -m "docs(성경필사): 개인정보 안내 6번 — 명단의 이름을 누르면(총괄·교인명부 역할이면 자세히 보기 · 그 밖은 다섯 가지와 교적 표시 · 기록)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git show --stat HEAD      # privacy.html 하나
```

- [ ] **Step 18: localhost 에서 잠깐 본다**

개발 함수는 Step 10 에서 이 판으로 올라가 있다. 워크트리에서 `python -m http.server 8000` → http://localhost:8000 (오른쪽 위 「개발 DB」 띠) → 총괄 관리자로 로그인 →
📋 회차·명단에서 이름 하나를 눌러 「자세히」 창(또는 고르개)이 뜨는지 · 창을 연 채 뒤로 가기(Alt+←) **한 번에 창만** 닫히고 명단(회차·거르기·스크롤)이 그대로인지 · 다시 열어 「닫기」로 닫은 뒤 뒤로 가기 한 번이면 앞 화면으로 가는지(헛 누름 없음) ·
👤 사람별 이력·통계에서 묶음 머리 하나를 눌러 창이 뜨는지만 본다. 창을 연 채 콘솔 `document.querySelectorAll('select, input[type=date], input[type=time], datalist').length` → `0`. `Ctrl+C` 로 끈다.
나머지(두 번째 계정의 작은 창 · 기록 · 늦게 뜬 창 · 메뉴 옮기기 · 가족)는 **Task 14 점검표에 이미 들어 있다**(Step 7 「📋 이름을 누르면 교적 창」 · Step 11 👤 이력·통계와 바꾼 기록 · Step 12 개인정보 안내) — 친구와 함께 거기서 본다.


### Task 13: 바꾼 기록 이름 · 개인정보 안내 7번 · 교회 어드민 CLAUDE.md (교회 어드민 파일만)

이 과제가 끝나면 총괄 관리자의 「📜 바꾼 기록」·「교인명부 기록」에 성경필사(암송) 기록 여덟 가지가 한국말 이름과 한 줄 설명으로 보인다. 교회 어드민 `privacy.html` 에는 이 기능이 보는 것·가져오는 것·남기는 기록이 사실대로 적히고, 교회 어드민 `CLAUDE.md` 에는 「명단을 고치는 곳은 여기 한 곳」이 적힌다.

> ⚠️ **이 과제는 교회 어드민 파일만 고친다**(CONTRACT 5 「대조 뒤 결정」). 성경암송 쪽 문서(`docs/notes/bible-events-admin.md` 새로 · `CLAUDE.md` 표 한 줄)는 **Task 15 Step 11(여는 날)** 에 쓴다. 성경암송 main 은 다른 세션이 자주 푸시해서 미리 커밋하면 여는 날보다 먼저 나간다.
> ⚠️ **성경암송 `privacy/` 는 손대지 않는다**(친구 결정 2026-09-29 · 설계 §0 「개인정보 안내」·§8-7). 담당자가 어드민에서 보고 고치는 일이고, 성경암송 앱이 성도님께 새로 받는 것은 없다.
> 명령은 모두 워크트리에서 한다(Git Bash: 블록마다 `cd /c/Projects/church-admin/.worktrees/bible-events`). 기준점은 church-admin main `a2dfd7c` 이다. **줄 번호로 찾지 않는다.** 고칠 자리는 모두 앵커 글로 찾고, 고치기 전에 `grep -c` 로 앵커가 한 번만 나오는지 본다(1 이 아니면 멈추고 눈으로 본다).
> 이 PC 는 `core.autocrlf=true` 라서 작업 트리 파일의 줄 끝이 CRLF 다. 그래서 `grep` 앵커 끝에 `$` 를 붙이지 않는다(`\r` 때문에 안 맞는다).
> **푸시하지 않는다.**

**Files:**
- Test(Create): `tests/audit.test.mjs`
- Modify: `js/menus/system/audit.js` — 앵커 다섯: 머리 주석 `// 「교인명부 기록」(people.*)은 따로 본다` · `const LABEL = {` · `"people.search": "명부 찾기", "people.view": "교인 보기"` 줄 · `function detailText(r) {` · `if (r.action === "people.import") return` 줄
- Modify: `privacy.html` — 앵커 넷: 6번 「쓰는 곳」 줄(`교회 교적 프로그램에 등록된 교인 정보를, 담당자가 교인을 찾아 연락하고`) · 6번 「보는 사람」 줄 · 6번 「기록」 줄 · `</main>`
- Modify: `CLAUDE.md`(교회 어드민) — 앵커 `## 비상 절차`

**Interfaces:**
- Consumes: 서버가 `admin_audit` 에 남기는 `detail` 의 모양. Task 6·7·8 초안이 쓰는 그대로이고, CONTRACT 5 「기록 모양」을 따른다.
  - `event.create` target=회차 id · `{title, before:{}, after:{title,short_title,subtitle,season,opens_on,closes_on,status,list_until}}`(Task 6 `EV_EDIT_KEYS`)
  - `event.settings` target=회차 id · `{title, before:{바뀐 칸}, after:{바뀐 칸}}`(Task 6 `eventDiff`)
  - `event.add` target=줄 id · `{event_id, name, row:{who_type,group,sub,position}, linked:boolean}`(Task 7)
  - `event.edit` target=줄 id · `{event_id, name, before:{…}, after:{…}}` — 바뀐 칸만 들어가고, 칸 이름은 `who_type`·`group`·`sub`·`name`·`position`·`note` 다(Task 7 `EV_AUDIT_FIELD`)
  - `event.delete` target=줄 id · `{event_id, name, row:{who_type,group,sub,position,note,source,hasUser}}`(Task 7)
  - `event.upload` target=회차 id · **납작한 모양** `{rows, fillOn, add, same, blank, bad, fill, sameName, oddPosition, saved, failed}` — `failed` 는 개수이고 이름은 싣지 않는다(Task 8)
  - `people.lookup` target=`""` · `{q, count}`(Task 8 `evPeopleLookup` · Task 16 `evPerson` 도 같은 모양 — 남기는 곳 두 곳)
  - `people.fill` target=회차 id · `{rows, names:string[]}`(Task 8)
- Produces:
  - `js/menus/system/audit.js`: `export const LABEL` · `export function detailText(r) → string`(원래 내보내지 않던 것이다. 시험하려고 내보낼 뿐 화면 동작은 그대로다)
  - `privacy.html` 7번 「성경필사(암송) 명단」 · 6번 세 줄
  - 교회 어드민 `CLAUDE.md` 의 절 제목 `## 성경필사(암송) (개발 중 — 운영 여는 날 이 줄에 날짜를 적는다)` — **Task 15 Step 1 이 이 제목 글을 그대로 찾아 날짜로 바꾼다** · 절의 마지막 줄 `- 개인정보 안내는 \`privacy.html\` 7번` — Task 14 Step 2 가 이 줄 다음에 한 줄을 더한다

- [ ] **Step 1: 선행 확인 — 기준점 · 서버가 남기는 기록 여덟 가지와 그 칸 이름**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
git merge-base --is-ancestor a2dfd7c HEAD && echo "기준점 a2dfd7c 이후"
grep -cE 'audit\(ctx, "(event\.(create|settings|add|edit|delete|upload)|people\.(lookup|fill))"' supabase/functions/church-admin/index.ts
grep -n 'audit(ctx, "event.upload"' supabase/functions/church-admin/index.ts
grep -n 'audit(ctx, "people.lookup"' supabase/functions/church-admin/index.ts
grep -n 'audit(ctx, "people.fill"' supabase/functions/church-admin/index.ts
grep -nA3 'audit(ctx, "event.\(add\|delete\)"' supabase/functions/church-admin/index.ts
```
Expected:
- `기준점 a2dfd7c 이후`.
- `9`(기록마다 한 줄 · `people.lookup` 만 두 줄 — `evPeopleLookup`(Task 8)·`evPerson`(Task 16)). 아홉이 아니면 **멈춘다.** 여덟 이하면 Task 6~8·16 가운데 끝나지 않은 과제가 있고, 열 이상이면 같은 기록을 남기는 곳이 더 생긴 것이다(그 줄을 눈으로 본다).
- `event.upload` 줄에 `rows:`·`fillOn:`·`...counts`·`saved`·`failed: failed.length` 가 있다. `counts` 를 펼쳐 넣어야 하고 `counts:` 로 싸면 안 된다.
- `people.lookup` 은 **두 줄**(`evPeopleLookup`·`evPerson`)이고 두 줄 모두 `q:`·`count:` 가 있다(한 줄이면 Task 16 이 덜 끝났다 — 멈춘다). `people.fill` 줄에 `rows:`·`names:` 가 있다.
- `event.add`·`event.delete` 의 `row:` 에 `group:`·`sub:` 가 있다(`group_name` 이 아니다).

모양이 위 **Interfaces · Consumes** 와 다르면 **서버는 고치지 않는다.** 서버의 개발 시험이 이미 그 모양을 믿고 있다. 대신 아래 Step 2 의 기대값과 Step 4 의 코드를 서버 칸 이름에 맞추고, 이 계획의 Interfaces 줄도 고쳐 둔다.

- [ ] **Step 2: 실패하는 시험 — `tests/audit.test.mjs`**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { LABEL, detailText } from "../js/menus/system/audit.js";

// 기록 한 줄 — 서버 auditList 가 주는 모양({action, target, detail})
const R = (action, detail, target = "") => ({ action, target, detail });
const NEW = ["event.create", "event.settings", "event.add", "event.edit", "event.delete", "event.upload", "people.lookup", "people.fill"];

test("성경필사(암송) 기록 여덟 가지 — 모두 한국말 이름이 있다(없으면 화면에 영문 코드가 뜬다)", () => {
  for (const a of NEW) {
    assert.equal(typeof LABEL[a], "string", a);
    assert.match(LABEL[a], /[가-힣]/, a);
  }
});

test("event.create — 이름 · 기간 · 상태 · 명단 공개 종료", () => {
  const after = { title: "2026 가을 말씀 동행", short_title: "가을 말씀 동행", subtitle: "", season: "2026-4Q",
    opens_on: "2026-10-27", closes_on: "2026-11-28", status: "draft", list_until: "2026-12-13" };
  assert.equal(detailText(R("event.create", { title: after.title, before: {}, after }, "autumn-2026")),
    "‘2026 가을 말씀 동행’ · 2026-10-27 ~ 2026-11-28 · 준비 중 · 명단 공개 종료 2026-12-13");
  assert.equal(detailText(R("event.create", { title: after.title, before: {}, after: { ...after, list_until: null } })),
    "‘2026 가을 말씀 동행’ · 2026-10-27 ~ 2026-11-28 · 준비 중 · 명단 공개 종료 기한 없음");
});

test("event.settings — 바꾼 칸만 「전 → 후」 · 상태는 한국말 · 빈 공개 종료일은 「기한 없음」", () => {
  assert.equal(detailText(R("event.settings", { title: "2026 사순절 필사",
    before: { status: "draft", list_until: null }, after: { status: "open", list_until: "2026-12-13" } }, "lent-2026")),
    "‘2026 사순절 필사’ · 상태 준비 중 → 열림 · 공개 종료일 기한 없음 → 2026-12-13");
  assert.equal(detailText(R("event.settings", { title: "2026 사순절 필사",
    before: { opens_on: "2026-02-18", subtitle: "" }, after: { opens_on: "2026-02-19", subtitle: "한 줄" } })),
    "‘2026 사순절 필사’ · 시작일 2026-02-18 → 2026-02-19 · 부제 (없음) → 한 줄");
});

test("event.add — 이름 · 소속(교구 줄의 숫자 목장에만 「목장」) · 직분 · 회차 · 앱 계정 이음", () => {
  assert.equal(detailText(R("event.add", { event_id: "lent-2026", name: "홍길동",
    row: { who_type: "교구", group: "화평", sub: "20", position: "집사" }, linked: true }, "101")),
    "홍길동 · 화평 20목장 · 집사 · 회차 lent-2026 · 앱 계정 이음");
  assert.equal(detailText(R("event.add", { event_id: "lent-2026", name: "홍길동",
    row: { who_type: "교구", group: "소망", sub: "남성", position: "" }, linked: false })),
    "홍길동 · 소망 남성 · 회차 lent-2026");
  assert.equal(detailText(R("event.add", { event_id: "lent-2026", name: "홍길동",
    row: { who_type: "교회학교", group: "청년부", sub: "", position: "청년" }, linked: false })),
    "홍길동 · 청년부 · 청년 · 회차 lent-2026");
  assert.equal(detailText(R("event.add", { event_id: "lent-2026", name: "홍길동",
    row: { who_type: "교회학교", group: "중등부", sub: "2", position: "학생" }, linked: false })),
    "홍길동 · 중등부 2 · 학생 · 회차 lent-2026");
});

test("event.edit — 바꾼 칸만 · 메모는 글 없이 「메모 고침」", () => {
  const t = detailText(R("event.edit", { event_id: "lent-2026", name: "홍길동",
    before: { sub: "20", position: "집사", note: "원래: 화평 30 · 집사" },
    after: { sub: "21", position: "안수집사", note: "원래: 화평 30 · 집사 / 담당자가 더함" } }, "101"));
  assert.equal(t, "홍길동 · 회차 lent-2026 · 세부 20 → 21 · 직분 집사 → 안수집사 · 메모 고침");
  assert.ok(!t.includes("원래"), "메모 글은 기록 줄에 싣지 않는다");
  assert.equal(detailText(R("event.edit", { event_id: "lent-2026", name: "홍길동",
    before: { position: "" }, after: { position: "권사" } })), "홍길동 · 회차 lent-2026 · 직분 (없음) → 권사");
  assert.equal(detailText(R("event.edit", { event_id: "lent-2026", name: "홍길동",
    before: { note: "" }, after: { note: "담당자가 더함" } })), "홍길동 · 회차 lent-2026 · 메모 고침");
});

test("event.delete — 뺀 줄의 모양 · 출처 · 계정", () => {
  const row = { who_type: "교구", group: "믿음", sub: "3", position: "성도", note: "담당자가 더함", source: "import", hasUser: false };
  assert.equal(detailText(R("event.delete", { event_id: "summer-2026", name: "홍길동", row }, "102")),
    "홍길동 · 믿음 3목장 · 성도 · 회차 summer-2026 · 📋 이관");
  assert.equal(detailText(R("event.delete", { event_id: "summer-2026", name: "홍길동", row: { ...row, hasUser: true } })),
    "홍길동 · 믿음 3목장 · 성도 · 회차 summer-2026 · 📋 이관 · 계정 이어짐");
});

test("event.upload — 건수만(이름 없음) · 서버가 남긴 납작한 칸 · 0 인 동명이인·목록 밖 직분·실패는 뺀다 · 채우기를 껐으면 「교인명부로 채움」도 뺀다", () => {
  assert.equal(detailText(R("event.upload", { rows: 20, fillOn: true, add: 8, same: 3, blank: 1, bad: 2, fill: 4,
    sameName: 0, oddPosition: 0, saved: 12, failed: 0 }, "lent-2026")),
    "올린 줄 20 · 넣음 12 · 이미 있음 3 · 빈칸 1 · 틀림 2 · 교인명부로 채움 4");
  assert.equal(detailText(R("event.upload", { rows: 13, fillOn: true, add: 12, same: 0, blank: 0, bad: 0, fill: 0,
    sameName: 1, oddPosition: 5, saved: 10, failed: 2 }, "lent-2026")),
    "올린 줄 13 · 넣음 10 · 이미 있음 0 · 빈칸 0 · 틀림 0 · 교인명부로 채움 0 · 동명이인 1 · 목록 밖 직분 5 · 실패 2");
  assert.equal(detailText(R("event.upload", { rows: 5, fillOn: false, add: 5, same: 0, blank: 0, bad: 0, fill: 0,
    sameName: 0, oddPosition: 0, saved: 5, failed: 0 }, "lent-2026")),
    "올린 줄 5 · 넣음 5 · 이미 있음 0 · 빈칸 0 · 틀림 0");
  // counts 로 싼 모양은 읽지 않는다 — 서버(Task 8)는 납작하게 남긴다(CONTRACT 5 「기록 모양」)
  assert.equal(detailText(R("event.upload", { saved: 1, failed: 0, counts: { same: 9 } })),
    "올린 줄 0 · 넣음 1 · 이미 있음 0 · 빈칸 0 · 틀림 0");
});

test("people.lookup · people.fill — 찾은 이름 · 결과 수 · 채운 분 이름(스무 분까지 적고 나머지는 수로)", () => {
  assert.equal(detailText(R("people.lookup", { q: "홍길동", count: 2 })), "‘홍길동’ · 2명");
  assert.equal(detailText(R("people.lookup", { q: "홍길동", count: 0 })), "‘홍길동’ · 0명");
  assert.equal(detailText(R("people.fill", { rows: 3, names: ["홍길동", "홍길순", "홍길남"] }, "lent-2026")),
    "채운 줄 3 · 홍길동, 홍길순, 홍길남");
  const many = Array.from({ length: 25 }, (_, i) => "홍길동" + i);
  const t = detailText(R("people.fill", { rows: 25, names: many }, "lent-2026"));
  assert.ok(t.endsWith("홍길동19 외 5명"), t);
  assert.ok(!t.includes("홍길동20"), t);
});

test("옛 기록은 그대로 — people.search · 모르는 기록은 빈 줄", () => {
  assert.equal(detailText(R("people.search", { q: "홍", filters: {}, total: 3 })), "‘홍’ · 3명");
  assert.equal(detailText(R("something.else", { a: 1 })), "");
});
```

- [ ] **Step 3: 돌려서 실패를 본다**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
node --experimental-strip-types --test tests/audit.test.mjs
```
Expected: FAIL — `SyntaxError: The requested module '../js/menus/system/audit.js' does not provide an export named 'LABEL'` · 끝에 `# fail 1`.

- [ ] **Step 4: `js/menus/system/audit.js` — 다섯 군데(앵커 · Edit 도구로)**

먼저 앵커가 한 번씩만 있는지 본다.
```bash
cd /c/Projects/church-admin/.worktrees/bible-events
F=js/menus/system/audit.js
grep -cF '// 「교인명부 기록」(people.*)은 따로 본다' $F
grep -c '^const LABEL = {' $F
grep -cF '"people.search": "명부 찾기", "people.view": "교인 보기"' $F
grep -c '^function detailText(r) {' $F
grep -cF 'if (r.action === "people.import") return `기준일' $F
grep -c 'export const LABEL\|export function detailText\|"event\.' $F
```
Expected: `1` · `1` · `1` · `1` · `1` · `0`.

① 머리 주석 — old(한 줄):
```js
// 「교인명부 기록」(people.*)은 따로 본다 — 찾기·보기가 많아 바꾼 일을 덮지 않게(서버 auditList 의 kind · 2026-09-29).
```
new:
```js
// 「교인명부 기록」(people.*)은 따로 본다 — 찾기·보기가 많아 바꾼 일을 덮지 않게(서버 auditList 의 kind · 2026-09-29).
// 성경필사(암송): event.* 는 「바꾼 기록」, people.lookup·people.fill 은 people.* 라 「교인명부 기록」으로 간다.
```

② old:
```js
const LABEL = {
```
new:
```js
// 시험(tests/audit.test.mjs)이 읽으려고 내보낸다 — 화면 동작은 그대로
export const LABEL = {
```

③ old(한 줄):
```js
  "people.search": "명부 찾기", "people.view": "교인 보기", "people.export": "명부 내려받기", "people.import": "명부 올림",
```
new:
```js
  "people.search": "명부 찾기", "people.view": "교인 보기", "people.export": "명부 내려받기", "people.import": "명부 올림",
  // 성경필사(암송) — detail 모양은 서버 index.ts 의 audit() 호출과 한 벌(tests/audit.test.mjs 가 못 박는다)
  "event.create": "성경필사 회차 만듦", "event.settings": "성경필사 회차 설정 바꿈",
  "event.add": "성경필사 명단 더함", "event.edit": "성경필사 명단 고침", "event.delete": "성경필사 명단 뺌",
  "event.upload": "성경필사 명단 올림",
  "people.lookup": "명부 찾기(성경필사)", "people.fill": "명부로 빈칸 채움(성경필사)",
```

④ old:
```js
function detailText(r) {
```
new:
```js
// ---- 성경필사(암송) 기록 줄 ----
// 칸 이름은 서버 index.ts 의 audit() 호출 그대로다 — event.create·settings(Task 6) · event.add·edit·delete(Task 7) ·
// event.upload·people.lookup·people.fill(Task 8 · CONTRACT 5 「기록 모양」: upload 는 납작하게, lookup 은 {q, count}).
// ⚠️ 칸 이름을 바꾸면 여기와 tests/audit.test.mjs 를 함께 — 안 고치면 기록 줄이 오류 없이 0·빈칸으로 보인다.
const EV_STATUS = { draft: "준비 중", open: "열림", closed: "마감", archived: "보관" };   // 📋 회차·명단의 상태 이름과 같다
const EV_FIELD = { title: "이름", short_title: "짧은 이름", subtitle: "부제", season: "묶음",
  opens_on: "시작일", closes_on: "마감일", status: "상태", list_until: "공개 종료일" };
const ROW_FIELD = { who_type: "구분", group: "소속", sub: "세부", name: "이름", position: "직분" };
const SRC = { app: "📱 앱", import: "📋 이관" };                                           // 📋 회차·명단의 출처 표시와 같다
const joinDot = (...parts) => parts.filter(Boolean).join(" · ");
const evVal = (k, v) => (v == null || v === "") ? (k === "list_until" ? "기한 없음" : "(없음)")
  : k === "status" ? (EV_STATUS[v] || String(v)) : String(v);
const rowVal = (v) => (v == null || v === "") ? "(없음)" : String(v);
// 「화평 20목장」·「소망 남성」·「청년부」·「중등부 2」 — 서버 evWho 와 같은 꼴(교구 줄의 숫자 목장에만 「목장」)
function rowWho(w) {
  const g = String((w && w.group) || ""), s = String((w && w.sub) || "");
  const sub = w && w.who_type === "교구" && /^\d+$/.test(s) ? s + "목장" : s;
  return [g, sub].filter(Boolean).join(" ");
}
const evChanges = (b, a) => Object.keys(a || {})
  .map((k) => `${EV_FIELD[k] || k} ${evVal(k, (b || {})[k])} → ${evVal(k, a[k])}`);
// 채운 분 이름 — 스무 분까지 적고 나머지는 수로(한 번에 600줄까지 올릴 수 있다)
const someNames = (names, max = 20) => {
  const n = Array.isArray(names) ? names : [];
  return n.slice(0, max).join(", ") + (n.length > max ? ` 외 ${n.length - max}명` : "");
};

export function detailText(r) {
```

⑤ old(한 줄):
```js
  if (r.action === "people.import") return `기준일 ${d.source_date} · 전체 ${d.total} · 새로 ${d.added} · 바뀜 ${d.changed} · 빠짐 ${d.removed} · 사진 ${d.photos}`;
```
new:
```js
  if (r.action === "people.import") return `기준일 ${d.source_date} · 전체 ${d.total} · 새로 ${d.added} · 바뀜 ${d.changed} · 빠짐 ${d.removed} · 사진 ${d.photos}`;
  if (r.action === "event.create") {
    const a = d.after || {};
    return joinDot(`‘${d.title || a.title || ""}’`, `${a.opens_on || ""} ~ ${a.closes_on || ""}`,
      evVal("status", a.status), `명단 공개 종료 ${evVal("list_until", a.list_until)}`);
  }
  if (r.action === "event.settings") return joinDot(`‘${d.title || ""}’`, ...evChanges(d.before, d.after));
  if (r.action === "event.add") {
    const w = d.row || {};
    return joinDot(d.name, rowWho(w), w.position, `회차 ${d.event_id || ""}`, d.linked ? "앱 계정 이음" : "");
  }
  if (r.action === "event.edit") {
    const b = d.before || {}, a = d.after || {};
    const parts = Object.keys(a).filter((k) => k !== "note")
      .map((k) => `${ROW_FIELD[k] || k} ${rowVal(b[k])} → ${rowVal(a[k])}`);
    return joinDot(d.name, `회차 ${d.event_id || ""}`, ...parts, "note" in a ? "메모 고침" : "");
  }
  if (r.action === "event.delete") {
    const w = d.row || {};
    return joinDot(d.name, rowWho(w), w.position, `회차 ${d.event_id || ""}`, SRC[w.source] || w.source,
      w.hasUser ? "계정 이어짐" : "");
  }
  // 올리기는 건수만 — 이름을 싣지 않는다(설계 §2 기록 표). 서버는 납작하게 남긴다(counts 로 싸지 않는다 · failed 는 개수).
  if (r.action === "event.upload") {
    return joinDot(`올린 줄 ${d.rows ?? 0}`, `넣음 ${d.saved ?? 0}`, `이미 있음 ${d.same ?? 0}`, `빈칸 ${d.blank ?? 0}`,
      `틀림 ${d.bad ?? 0}`, d.fillOn ? `교인명부로 채움 ${d.fill ?? 0}` : "", d.sameName ? `동명이인 ${d.sameName}` : "",
      d.oddPosition ? `목록 밖 직분 ${d.oddPosition}` : "", d.failed ? `실패 ${d.failed}` : "");
  }
  if (r.action === "people.lookup") return `‘${d.q || ""}’ · ${d.count ?? 0}명`;
  if (r.action === "people.fill") return joinDot(`채운 줄 ${d.rows ?? 0}`, someNames(d.names));
```

고친 뒤:
```bash
cd /c/Projects/church-admin/.worktrees/bible-events
grep -c '^export const LABEL = {\|^export function detailText(r) {' js/menus/system/audit.js
grep -c '"event\.\(create\|settings\|add\|edit\|delete\|upload\)":' js/menus/system/audit.js
```
Expected: `2` · `3`(LABEL 세 줄에 여섯 이름이 나뉘어 있다 — 두 개·세 개·한 개).

- [ ] **Step 5: 돌려서 통과를 본다 · preflight**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
node --experimental-strip-types --test tests/audit.test.mjs
python tools/preflight.py | tail -1
```
Expected: `# pass 9` · `# fail 0` · preflight 끝줄 `모두 통과`(새 시험 파일도 preflight 가 함께 돈다).

- [ ] **Step 6: 커밋**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
git add js/menus/system/audit.js tests/audit.test.mjs
git commit -m "feat(성경필사): 바꾼 기록에 성경필사 기록 여덟 가지 — 이름·한 줄 설명 · 시험" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git show --stat HEAD
```
Expected: 파일 두 개(`js/menus/system/audit.js` · `tests/audit.test.mjs`)만.

- [ ] **Step 7: 교회 어드민 `privacy.html` — 6번 세 줄 · 7번 새로**

고치기 전:
```bash
cd /c/Projects/church-admin/.worktrees/bible-events
grep -cF '교회 교적 프로그램에 등록된 교인 정보를, 담당자가 교인을 찾아 연락하고' privacy.html
grep -cF '보는 사람: 총괄 관리자와, 총괄 관리자가 「교인명부」 역할을 드린 담당자가 봐요.' privacy.html
grep -cF '기록: 누가 언제 누구를 찾아보고 내려받았는지 남겨요' privacy.html
grep -c '</main>' privacy.html
grep -c "7. 성경필사(암송) 명단" privacy.html; grep -c "「성경필사(암송)」 역할" privacy.html; grep -c '<div class="card">' privacy.html
grep -c "이름을 누르면(성경필사(암송) 명단):" privacy.html     # Task 16 Step 17 이 먼저 넣은 6번 한 줄
```
Expected: `1` · `1` · `1` · `1` · `0` · `0` · `6` · `1`. 마지막이 `0` 이면 Task 16 이 아직 안 돌았다 — 이 과제는 Task 16 **뒤**다(아래 7번 글이 그 기능을 적는다). 멈춘다.

Edit 네 번(모두 한 줄 앵커):

① 6번 「쓰는 곳」 — old(한 줄):
```html
    <p>교회 교적 프로그램에 등록된 교인 정보를, 담당자가 교인을 찾아 연락하고 · 사역신청이 교적과 맞는지 확인하고 · 인원 현황을 보는 데 써요.<br>
```
new:
```html
    <p>교회 교적 프로그램에 등록된 교인 정보를, 담당자가 교인을 찾아 연락하고 · 사역신청이 교적과 맞는지 확인하고 · 인원 현황을 보고 ·
      성경필사(암송) 명단에 한 분을 더하거나 빈 소속·직분을 채우는 데 써요(채운 값은 성경암송 앱의 이벤트 명단에 적혀, 그 명단이 공개된 동안 성도님께 보여요 — 7번).<br>
```

② 6번 「보는 사람」 — old(한 줄):
```html
      보는 사람: 총괄 관리자와, 총괄 관리자가 「교인명부」 역할을 드린 담당자가 봐요. 사역신청 담당자에게는 「교적과 맞는지」 표시만 보여요.<br>
```
new:
```html
      보는 사람: 총괄 관리자와, 총괄 관리자가 「교인명부」 역할을 드린 담당자가 봐요. 사역신청 담당자에게는 「교적과 맞는지」 표시만 보여요.
      「성경필사(암송)」 역할만 드린 담당자에게는 「교적과 맞는지」 표시와, 이름으로 찾거나 · 명단의 이름을 누르거나 · 빈칸을 채울 때 이름·구분·소속·세부·직분 다섯 가지만 보여요(7번 · 이름을 누를 때는 아래 「이름을 누르면」).<br>
```

③ 6번 「기록」 — old(한 줄):
```html
      기록: 누가 언제 누구를 찾아보고 내려받았는지 남겨요(찾은 검색어와 거르기 조건 · 본 교인의 이름과 교인ID · 내려받은 명수).<br>
```
new:
```html
      기록: 누가 언제 누구를 찾아보고 내려받았는지 남겨요(찾은 검색어와 거르기 조건 · 본 교인의 이름과 교인ID · 내려받은 명수 ·
      성경필사(암송) 담당자가 찾거나 명단에서 누른 이름과 결과 수 · 빈칸을 채운 분의 이름).<br>
```

④ 7번 — old(한 줄):
```html
</main>
```
new:
```html
  <div class="card">
    <h3>7. 성경필사(암송) 명단</h3>
    <p>성경암송 앱의 이벤트 명단(사순절·썸머 써 바이블·필사 소책자·가을 말씀 동행처럼 회차마다 이름을 올리신 분들의 명단)을,
      담당자가 보고 · 고치고 · 종이·엑셀 명단을 올리고 · 회차별 인원과 여러 번 참여하신 분을 세는 데 써요.
      명단은 성경암송 앱의 것이고, 이 화면은 무엇을 새로 모으지 않고 그 명단을 그대로 읽고 고쳐요.<br>
      보는 것: 이름, 구분(교구·교회학교), 소속(교구·부서), 세부(목장·학년), 직분, 등록일, 들어온 길(앱에서 신청 · 담당자가 넣음),
      앱 계정과 이어졌는지(예·아니오만), 「교적과 맞는지」 표시, 담당자 메모(담당자만 보고, 성도님 화면에는 나가지 않아요).<br>
      보지 않는 것: 앱 계정 번호, 성도님이 앱에 적으신 한 줄 메모와 전화번호, 가을 말씀 동행의 자격 판정 기록.<br>
      교인명부에서 가져오는 것: 이름으로 찾을 때 · 명단의 이름을 누를 때 · 빈칸을 채울 때, 이름·구분·소속·세부·직분 다섯 가지만 보여 드려요.
      연락처·주소·생년월일·사진·가족·교인ID 는 보여 드리지 않아요 — 다만 총괄 관리자와 「교인명부」 역할도 있는 담당자가 명단의 이름을 누르면 교인 찾기와 같은 자세히 보기가 열려요(6번 · 본 교인의 이름과 교인ID 가 기록에 남아요).<br>
      내려받기: 화면에 보이는 명단과 통계를 엑셀(CSV)로 내려받을 수 있어요. 담당자 메모는 싣지 않아요.
      여러 번 참여하신 분은 같은 이름·같은 소속(또는 같은 앱 계정)을 한 분으로 센 근삿값이에요.<br>
      성도님께 보이는 것: 담당자가 넣거나 고친 이름·소속·직분은 그 회차 명단이 공개된 동안 성경암송 앱의 명단 화면에 보여요(로그인 없이 보이는 명단이에요).
      회차를 새로 공개할 때는 담당자가 이 점을 한 번 더 확인하고 공개해요.<br>
      앱 계정: 담당자가 더한 분과 이름·소속이 같은 앱 계정이 이미 있으면 이어 드려요. 앱 계정을 새로 만들지는 않아요.
      이어진 분은 앱의 「이미 내신 것」에서 보시고, 등록 기간 중인 회차면 앱에서 고치거나 취소하실 수 있어요.<br>
      보는 사람: 총괄 관리자와, 총괄 관리자가 「성경필사(암송)」 역할을 드린 담당자가 봐요.<br>
      기록: 누가 언제 회차를 만들고 설정을 바꾸고, 명단에 더하고 · 고치고 · 뺐는지(그분의 이름과 바꾼 값), 명단을 올렸는지(건수만),
      교인명부에서 찾거나 명단에서 누른 이름과 결과 수, 빈칸을 채운 분의 이름, 명단의 이름을 눌러 자세히 보기로 본 교인의 이름과 교인ID 를 남겨요.<br>
      보관과 삭제: 명단의 보관과 공개 기간은 성경암송 앱의 안내(<a href="https://gocheok.onlybible.kr/privacy/">gocheok.onlybible.kr/privacy/</a>)를 따라요.
      명단에서 빼 달라고 하시려면 4번의 요청처(총괄 관리자 · 이메일 · 교회 사무실)로 말씀해 주세요.</p>
  </div>
</main>
```

고친 뒤:
```bash
cd /c/Projects/church-admin/.worktrees/bible-events
grep -c "7. 성경필사(암송) 명단" privacy.html; grep -c "「성경필사(암송)」 역할" privacy.html; grep -c '<div class="card">' privacy.html; grep -c '</div>' privacy.html
python tools/preflight.py | tail -1
```
Expected: `1` · `2` · `7` · `7` · `모두 통과`. leak-scan 도 `privacy.html` 을 읽는데, 휴대폰 번호가 없어서 통과한다.

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
git add privacy.html
git commit -m "docs(성경필사): 개인정보 안내 7번 「성경필사(암송) 명단」 · 6번 쓰는 곳·보는 사람·기록" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git show --stat HEAD
```
Expected: `privacy.html` 하나.

- [ ] **Step 8: 교회 어드민 `CLAUDE.md` — 새 절 「성경필사(암송)」**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
grep -c "^## 비상 절차" CLAUDE.md; grep -c "^## 성경필사(암송)" CLAUDE.md
```
Expected: `1` · `0`.

Edit — old(한 줄):
```markdown
## 비상 절차
```
new:
```markdown
## 성경필사(암송) (개발 중 — 운영 여는 날 이 줄에 날짜를 적는다)
성경암송 앱의 이벤트 명단(`events`·`event_signups` — 사순절·썸머 써 바이블·소책자·가을 말씀 동행)을 역할 `bibleevent`(「성경필사(암송)」) 담당자가
보고·고치고·올리고·통계 낸다. 메뉴 셋 `js/menus/bibleevent/`: 📋 회차·명단(`be-roster`) · 📤 명단 올리기(`be-upload`) · 👤 사람별 이력·통계(`be-history`).
규칙은 순수 모듈 여섯 — `events-rules.ts`(회차·줄 검사 · 신원 키 · 자격 회차 `isEligEvent`/`eligibilityStart`) · `events-people.ts`(교인명부 → 줄) ·
`events-stats.ts`(사람 묶음·통계) · `events-rows.ts`(한 분 더하기·고치기 · 같은 분 후보 키 `sameKeys`) · `events-upload.ts`(올리기 판정) · `events-person.ts`(이름을 누르면 교적 창). Node 시험이 같은 파일을 읽는다.
설계 v2 `docs/superpowers/specs/2026-09-29-church-admin-bible-events-design.md` · 옛 동작 원문 `docs/port/event-roster-legacy.md`.
- ⚠️ **명단을 고치는 곳은 여기 한 곳이다.** 운영을 여는 날부터 성경암송 `api` 의 `eventImport`·`eventSave`·`eventSetNote` 는 비밀번호 확인 **바로 뒤**에서
  `moved-to-church-admin` 을 돌려준다(`EVT_MOVED` · 비밀번호 없는 호출은 예전처럼 `unauthorized`). **되살리지 말 것** — `eventImport` 는 그 회차의 `source='import'` 줄을
  **전부 지우고** 다시 넣어, 여기서 고친 것·더한 분·줄 id·이어 둔 계정이 한 번에 사라진다. 직접 SQL 로 줄을 넣지 않는다 · 성경암송 `supabase/event_stamp_2026.sql` 을 다시 돌리지 않는다(가을 회차 설정을 덮는다).
- 성경암송 쪽에 **남긴 것**: `eventRoster`(읽기)·`eventExcuse`(자격 인정)·자격 회차 미신청 목록 — 가을 말씀 동행용, 다음 단계에서 옮긴다(그때 성경암송 `admin.html` 이벤트 타일도 이리로).
  성도님 앱 액션(`eventOpenList`·`eventSignup`·`eventDrop`·`eventRosterPublic`·`eventStamps`)은 건드리지 않는다.
- 표는 성경암송 것 — **칸·제약·RLS 를 바꾸지 않는다**(새 SQL 은 역할 한 줄 `004_bibleevent_role.sql` 뿐).
  담당자가 더한 줄은 `source='import'` + `note` 앞에 `담당자가 더함`·`명단 올리기`·`소속: 교인명부로 채움`(겹치면 ` / `). 서버는 붙임말을 붙인 **뒤** 500자를 넘으면 `note-too-long` — 창의 글자 수 상한은 480.
- `note`(담당자 메모)와 `memo`(성도님 한 줄)는 다른 칸이다. `memo`·`phone`·`answers` 는 쓰지 않고, `user_id`·`ident_key` 와 함께 응답에 싣지 않는다(명시적 칸 지도 · 줄 칸 목록은 `EV_ROW_COLS` 하나 · 계정은 `hasUser` 로만).
- `ident_key` 는 `paper.ts` `appIdentityKey`(NFC 안 함) — `authz.ts` `identityKey`(NFC)를 쓰면 앱 계정과 영영 안 맞는다. 같은 분 판정은 `sameKeys`(07/7·N목장·NFC) 한 규칙 — 한 분 더하기·고치기·올리기가 함께 쓴다.
- 앱 계정은 **조회만** 해서 잇는다(만들지 않는다 · `member_login` 금지). 한글 키 `.in()` 은 100개씩.
- 자격 회차 판정은 `isEligEvent(needs)` 하나(화면의 `hasEligibility` 도 이것). 앱에서 낸 줄(`source='app'`)과 자격 회차의 줄은 **메모만** 고친다(`app-row-note-only`).
  자격 회차엔 더하기·올리기·빼기가 막힌다(`eligibility-event` · 가을 설계 §12). 회차 설정의 시작일은 `eligibilityStart(needs)` 보다 앞설 수 없다(`before-eligibility`).
- 빈칸 채우기(`fillDecision`)는 교인명부 전체에서 이름이 한 분일 때만, 빈 칸만 채운다. 줄에 적힌 소속이 명부 소속과 다르면 아무것도 채우지 않는다(`different-affiliation`).
- 회차를 성도님께 보이게 하는 저장은 `needs-confirm`(아무것도 안 쓴 상태) → 화면 확인 창 → `confirmListed:true`. 공개 확인은 쓰기 **전**이다.
  회차 차례(`sort_order`)는 설정에 없다 — 새 회차는 0(바꾸려면 개발 먼저 SQL).
- 교인명부에서 주는 값은 **이름·구분·소속·세부·직분 다섯**뿐(예외 하나 — 아래 `evPerson` 의 `full`). 기록: `event.*` 는 「바꾼 기록」 · `people.lookup`(`{q, count}` · `evPeopleLookup`·`evPerson` 두 곳)·`people.fill`(`{rows, names}`)은 「교인명부 기록」 ·
  `event.upload` 는 건수만 **납작하게**. 칸 이름을 바꾸면 `js/menus/system/audit.js`·`tests/audit.test.mjs` 도 함께(안 고치면 기록 줄이 0·빈칸으로 보인다).
- 이름을 누르면 교적 창(`evPerson` · `events-person.ts` · 화면 `person-popup.js`): **부른 분의 역할로 서버가 모양을 정한다**(`ctx.roles` — 화면이 보낸 것을 믿지 않는다) — `directory`·`super` 면 `full`(교인ID·이름·소속·직분 → 화면이 교인명부 `openPerson` → `peoplePerson` 「자세히」 창 · 기록은 그쪽 `people.view`, 한 분으로 못 골라 후보를 줄 때만 여기서 `people.lookup`), 성경필사만이면 `basic`(다섯 칸 + 교적 표시 · 늘 `people.lookup`). **교인ID 를 `basic` 에 싣지 말 것** — 위 「다섯뿐」의 유일한 예외가 `full` 이다.
  고르는 규칙은 교적 표시와 같은 `sameAffiliation`(같은 소속 한 분 → 이름이 한 분뿐 → 못 고르면 후보 스무 분 · `total` 은 자르기 전 수). 창은 뒤로 가기 한 칸(`history.state` `{bePerson:1}`)을 쌓아 뒤로 가기가 창만 닫는다 — `modal.js` 와 같은 차례(「닫기」로 닫으면 그 칸을 거둔 뒤에 끝낸다).
- 1,000행: 명단·이력·통계·계정 읽기는 `allRows`(`order(id)`), 인원은 `head:true`. 올리기 상한 600줄(회차 최대가 515줄).
- 개발 서버 시험의 회차는 `ca-test-`(시험이 만들고 지운다).
- 팝업 없음(친구 결정 2026-09-29): `alert`·`confirm`·`prompt`·`beforeunload`·`<select>`·`<input type=date|time>`·`datalist` 금지 →
  `ui.js` `dialog`/`toast` · 입력 창 `js/core/modal.js` `openForm` · 고르기·날짜 `js/core/picker.js` `pickOne`/`pickMany`/`pickDate`. 예외는 엑셀 **파일 고르기** 하나(붙여넣기·끌어다 놓기를 함께 둔다).
- 개인정보 안내는 `privacy.html` 7번(+6번 쓰는 곳·보는 사람·기록). 성경암송 `privacy/` 는 손대지 않았다(친구 결정 — 앱이 새로 모으는 것이 없다).

## 비상 절차
```

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
grep -c "^## 성경필사(암송) (개발 중 — 운영 여는 날 이 줄에 날짜를 적는다)" CLAUDE.md
grep -c "^- 개인정보 안내는 \`privacy.html\` 7번" CLAUDE.md
grep -c "^- 이름을 누르면 교적 창(\`evPerson\`" CLAUDE.md
python tools/preflight.py | tail -1
git add CLAUDE.md
git commit -m "docs(성경필사): CLAUDE.md 성경필사(암송) 절 — 역할·메뉴·쓰는 곳 하나·얼리는 액션·팝업 없음" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git show --stat HEAD
```
Expected: `1` · `1` · `1` · `모두 통과` · 커밋에 `CLAUDE.md` 하나. **푸시하지 않는다.**

---

### Task 14: localhost 에서 친구와 확인 — 화면 전부 · 시스템 창이 한 번도 안 뜨는지

이 과제는 **코드를 새로 짜는 과제가 아니다.** 개발 DB 와 localhost:8000 에서 친구와 함께 모든 화면과 상태를 눌러 보고, 설계 §5 「화면 확인」과 §3 「팝업」 약속이 지켜지는지 본다. 걸린 것은 그 자리에서 고치고(시험 먼저) 다시 본다. **친구가 「됐다」고 할 때까지 Task 15 로 가지 않는다.**

> 푸시하지 않는다(푸시하면 운영 화면이 바뀐다). 개발 DB 에는 가짜 이름만 넣는다. 아래 시드는 회차 명단의 이름을 음절 표로 지어낸다. 찾기·채우기에 쓸 이름은 개발의 **가짜** 교인명부에서 그때그때 고르고, 파일에는 적지 않는다.
> 화면 확인에 쓰는 회차 id 는 `ca-demo-` 로 시작한다. 개발 서버 시험의 `before()`·`after()` 는 `ca-test-` 만 지우므로 서로 건드리지 않는다.
> 점검표에 옮겨 적은 화면 문구는 Task 10·11·12·16 초안에서 가져왔다. 글자가 조금 다르면 **그 과제 파일의 글자가 맞다.** 뜻이 다를 때만 걸린 것으로 적는다.

**Files:**
- Create: `tests/seed-bible-events-dev.mjs`(개발 전용 · preflight 는 `*.test.mjs` 만 돌리므로 이 파일은 돌지 않는다)
- Modify: `CLAUDE.md`(교회 어드민) — 앵커 `- 개인정보 안내는 \`privacy.html\` 7번` 줄(Task 13) 다음에 한 줄
- 걸린 것을 고칠 때만: 그 화면·서버 파일과 그 시험(Task 5~12 의 파일)

**Interfaces:**
- Consumes: Task 5~8·16 의 서버 액션 13개(개발 배포본) · 메뉴 `be-roster`·`be-upload`·`be-history` · `js/core/modal.js` `openForm`/`closeAllForms` · `js/core/picker.js` `pickOne`/`pickMany`/`pickDate` · Task 13 `audit.js` · Task 16 이름을 누르면 교적 창(`evPerson` · `person-popup.js`) · `paper.ts` `appIdentityKey` · 개발 가짜 교인명부(`church_people` — `tools/people/fake_people.py`)
- Produces: 개발 DB 의 가짜 회차 셋 — `ca-demo-big`(1,100줄 · 마감 · 안 보임) · `ca-demo-small`(준비 중 · 앱 줄 둘 · 중복 둘 · 교적 맞음/확인 필요 한 줄씩) · `ca-demo-el`(자격 회차). 앱 사용자 셋(이름 `데모앱성도가`·`데모앱성도나`·`데모앱성도다`). 친구의 확인(Task 15 의 선행 조건)

- [ ] **Step 1: 출발점 — 가지 끝이 개발에 올라가 있고 시험이 모두 통과하는가**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
git status --short                         # 아무것도 없어야 한다 — 배포는 작업 트리를 올린다
python tools/preflight.py | tail -1        # 모두 통과
supabase functions deploy church-admin --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo   # 워크트리 루트에서(여기에 supabase/functions·config.toml 이 있다)
set -a; . ~/.church-admin/dev.env; set +a
node --experimental-strip-types --test tests/server.dev.test.mjs 2>&1 | tail -4
```
Expected: 빈 status · `모두 통과` · `Deployed Functions on project ktpwthwqzgcqcrmsafdo: church-admin` · `# fail 0`.
개발 배포가 실패하면 `index.ts` 문법이나 이름이 틀린 것이다. 멈추고 그 과제로 돌아간다(`node --check` 는 TS 오류를 못 잡는다 — 개발 배포가 검사다).

- [ ] **Step 2: 화면 확인용 가짜 회차 — `tests/seed-bible-events-dev.mjs`**

```js
// 개발 DB 에 성경필사(암송) 화면 확인용 회차 셋과 앱 사용자 셋을 넣는다/지운다. 개발 전용(계획 Task 14).
//   set -a; . ~/.church-admin/dev.env; set +a
//   node --experimental-strip-types tests/seed-bible-events-dev.mjs          # 넣기(ca-demo- 가 있으면 지우고 다시)
//   node --experimental-strip-types tests/seed-bible-events-dev.mjs --clean  # 지우기만
// ⚠️ 진짜 이름을 넣지 않는다(공개 저장소) — 회차 명단의 이름은 아래 음절 표로 지어내고, 찾기·채우기에 쓸 이름은
//    개발 DB 의 **가짜** 교인명부(tools/people/fake_people.py)에서 그때그때 고른다(파일에 적지 않는다).
// ⚠️ 회차 id 는 ca-demo- — 개발 서버 시험(server.dev)의 before()·after() 는 ca-test- 만 지우므로 서로 안 건드린다.
// ⚠️ 표(events·event_signups·users)는 성경암송 앱의 것이다 — 칸을 바꾸지 않고 줄만 넣고 뺀다.
// ⚠️ 이름에 .test. 가 없어 preflight(배포 전 점검)는 이 파일을 돌리지 않는다 — 개발 DB 가 있어야 돈다.
import { appIdentityKey } from "../supabase/functions/church-admin/paper.ts";

const URL_ = process.env.DEV_URL, SERVICE = process.env.DEV_SERVICE_KEY;
if (!URL_ || !URL_.includes("ktpwthwqzgcqcrmsafdo")) throw new Error("개발 프로젝트에만 돌린다");
const svc = { apikey: SERVICE, "Content-Type": "application/json",
  ...(SERVICE.startsWith("sb_secret_") ? {} : { Authorization: "Bearer " + SERVICE }) };

async function rest(path, method = "GET", data) {
  const r = await fetch(URL_ + "/rest/v1/" + path, { method,
    headers: { ...svc, Prefer: "return=representation" }, body: data ? JSON.stringify(data) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : [];
}

const GU = ["믿음", "소망", "사랑", "섬김", "은혜", "화평", "기쁨", "새가족"];
const GU7 = GU.slice(0, 7);       // 교인명부 → 줄 옮겨 적기 규칙 2 의 일곱 교구(새가족은 교구로 옮기지 않는다)
const FAMILY = ["가", "나", "다", "라", "마", "바", "사", "아", "자", "차"];   // 가짜 명부의 성씨와 겹치지 않는 글자
const GIVEN = ["하늘", "바다", "들꽃", "새벽", "나무", "구름", "햇살", "별빛", "시내", "언덕", "노을"];
const NAMES = FAMILY.flatMap((f) => GIVEN.map((g) => f + g));   // 110 가지 — 지어낸 이름
const POS = ["성도", "집사", "권사", "안수집사", "장로", "명예권사", ""];
const DEMO_USER = "데모앱성도";
const NEEDS = { position: true, phone: false, memo: false, extra: [] };
const BIG = "ca-demo-big", SMALL = "ca-demo-small", EL = "ca-demo-el";
const now = () => new Date().toISOString();

// 줄 하나 — ident_key 는 앱 로그인과 같은 식(appIdentityKey · NFC 안 함 · events-rules.ts identKey 와 같은 칸 배치)
function row(eventId, who, group, sub, name, position, extra = {}) {
  const isGu = who === "교구";
  const key = appIdentityKey({ type: who, gu: isGu ? group : "", mok: isGu ? sub : "",
    bu: isGu ? "" : group, grade: isGu ? "" : sub, name });
  return { event_id: eventId, user_id: null, ident_key: key, who_type: who, group_name: group, sub_name: sub,
    name, position, phone: "", memo: "", answers: {}, note: "", source: "import", updated_at: now(), ...extra };
}
// 앱에서 낸 줄 — 앱은 users 값을 그대로 적는다(목장 「07」도 그대로)
const app = (eventId, u, position, extra = {}) =>
  ({ ...row(eventId, "교구", u.gu, u.mok, u.name, position), user_id: u.id, ident_key: u.identity_key, source: "app", ...extra });
// 가짜 명부 목장(「화평-03목장」) → 줄의 목장 숫자(「3」) — 옮겨 적기 규칙 2
function mokNum(mok3) {
  const s = String(mok3 || "");
  if (s.includes("남성")) return "남성";
  const m = /(\d+)(?:목장)?$/.exec(s);
  return m ? String(Number(m[1])) : "";
}

async function clean() {
  const ev = await rest("events?select=id&id=like.ca-demo-*");
  if (ev.length) await rest("events?id=like.ca-demo-*", "DELETE");            // 줄은 CASCADE
  const us = await rest(`users?select=id&name=like.${encodeURIComponent(DEMO_USER + "*")}`);
  if (us.length) await rest(`users?name=like.${encodeURIComponent(DEMO_USER + "*")}`, "DELETE");
  console.log(`지웠다: 회차 ${ev.length} · 앱 사용자 ${us.length}`);
}

async function insertRows(rows) {
  for (let i = 0; i < rows.length; i += 500) await rest("event_signups", "POST", rows.slice(i, i + 500));
}

async function allPeople() {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const page = await rest(`church_people?select=name,name_key,kind2,mok1,mok3,school_dept,position&order=person_id&offset=${from}&limit=1000`);
    out.push(...page);
    if (page.length < 1000) break;
  }
  return out;
}

if (process.argv.includes("--clean")) { await clean(); process.exit(0); }

// ① 찾기·채우기에 쓸 이름을 가짜 명부에서 **먼저** 고른다 — 모자라면 아무것도 넣지 않고 멈춘다
const by = new Map();
for (const p of await allPeople()) by.set(p.name_key, [...(by.get(p.name_key) || []), p]);
const lists = [...by.values()];
const isKid = (p) => ["교회학교", "학생"].includes(p.kind2);
const adults = lists.filter((l) => l.length === 1 && !isKid(l[0]) && GU7.includes(l[0].mok1) && /\d/.test(l[0].mok3) && l[0].position)
  .map((l) => l[0]);
const [pA, pB, pC, pD] = adults;   // A·B: 올리기 빈칸 채우기 · C: 교적 「맞음」 줄 · D: 「＋ 한 분 더하기」 찾기
const two = lists.find((l) => l.length >= 2);                                        // 동명이인
const kid = (lists.find((l) => l.length === 1 && isKid(l[0]) && l[0].school_dept) || [])[0];
if (!pD || !two || !kid) {
  throw new Error("개발 가짜 명부에서 이름을 다 고르지 못했다 — 교회 어드민 CLAUDE.md 「교인명부」 절대로 가짜 명부(tools/people/fake_people.py)를 다시 넣을 것");
}
const otherGu = GU7.find((g) => g !== pA.mok1);

await clean();

// ② 앱 사용자 셋 — 가: 앱 줄 · 나: 한 분 더하기로 「잇기」 · 다: 목장 「07」(「7」로 더하면 이미 있음)
const users = [];
for (const [gu, mok, suffix] of [["화평", "20", "가"], ["화평", "21", "나"], ["소망", "07", "다"]]) {
  const name = DEMO_USER + suffix;
  const [u] = await rest("users", "POST", { type: "교구", gu, mok, name,
    identity_key: appIdentityKey({ type: "교구", gu, mok, bu: "", grade: "", name }) });
  users.push(u);
}
const [U1, , U3] = users;

// ③ 회차 셋 — 모두 성도님께 안 보이는 상태로 시작(준비 중이거나 공개 종료일이 지남)
await rest("events", "POST", [
  { id: BIG, title: "화면 확인 — 큰 회차(1,100줄)", short_title: "큰 회차", subtitle: "", season: "2025-3Q",
    kind: "signup", status: "closed", opens_on: "2025-06-01", closes_on: "2025-08-31", list_until: "2025-08-31",
    needs: NEEDS, updated_at: now() },
  { id: SMALL, title: "화면 확인 — 작은 회차(준비 중)", short_title: "작은 회차", subtitle: "고치기·빼기·공개 확인",
    season: "2026-1Q", kind: "signup", status: "draft", opens_on: "2026-01-01", closes_on: "2026-01-31", list_until: null,
    needs: NEEDS, updated_at: now() },
  { id: EL, title: "화면 확인 — 자격 회차", short_title: "자격 회차", subtitle: "더하기·올리기가 막혀야 한다",
    season: "2026-4Q", kind: "signup", status: "draft", opens_on: "2026-10-27", closes_on: "2026-11-28", list_until: "2026-12-13",
    needs: { ...NEEDS, eligibility: { start: "2026-10-11", weeks: 6, perWeek: 3, need: 3, minNeed: 2 } }, updated_at: now() },
]);

// ④ 큰 회차 1,100줄 — 이름 110 × 소속 10(교구 여덟 + 청년부 + 중등부 2) · 이름·소속이 겹치는 줄 없음
const big = Array.from({ length: 1100 }, (_, i) => {
  const name = NAMES[i % 110], k = Math.floor(i / 110);
  if (k < 8) return row(BIG, "교구", GU[k], String((i % 30) + 1), name, POS[i % POS.length]);
  return k === 8 ? row(BIG, "교회학교", "청년부", "", name, "청년")
                 : row(BIG, "교회학교", "중등부", "2", name, "학생");
});
await insertRows(big);
const rep = big.find((r) => r.name === "사햇살" && r.group_name === "사랑");   // 세 회차에 모두 넣을 분(「여러 번 참여」)

// ⑤ 작은 회차 — 고치기·빼기·중복 표시·목록 밖 직분·교적 표시·앱 줄(메모·전화가 화면에 나오면 안 된다)
const small = [
  row(SMALL, "교구", "화평", "20", "가하늘", "집사", { note: "담당자가 더함" }),
  row(SMALL, "교구", "화평", "7", "나바다", "권사", { note: "원래: 화평 30 · 집사" }),
  row(SMALL, "교구", "화평", "7", "나바다", "권사"),                              // 「중복일 수 있음」
  row(SMALL, "교구", "소망", "남성", "다들꽃", "안수집사"),
  row(SMALL, "교회학교", "청년부", "", "라새벽", "청년"),
  row(SMALL, "교회학교", "중등부", "2", "마나무", "학생"),
  row(SMALL, "교구", "믿음", "3", "바구름", "은퇴안수집사"),                      // 목록 밖 직분(경고만)
  row(SMALL, "교구", "사랑", rep.sub_name, "사햇살", "집사"),                     // 세 회차에 모두 — 「여러 번 참여」
  row(SMALL, "교구", pC.mok1, mokNum(pC.mok3), pC.name, pC.position),             // 교적 「맞음」
  row(SMALL, "교구", "기쁨", "1", two[0].name, ""),                               // 교적 「확인 필요」(같은 이름 여럿)
  app(SMALL, U1, "권사", { phone: "010-0000-0000", memo: "성도 한 줄 — 담당자 화면에 나오면 안 됨" }),
  app(SMALL, U3, "성도"),                                                         // 목장 「07」
];
await insertRows(small);

// ⑥ 자격 회차 — 앱 줄 하나(answers 는 화면에 나오면 안 된다) · 이관 줄 하나(사햇살 — 세 번째 회차)
await insertRows([
  app(EL, U1, "권사", { answers: { weeks: [3, 3, 3, 0, 0, 0] } }),
  row(EL, "교구", "사랑", rep.sub_name, "사햇살", "집사", { note: "명단 올리기" }),
]);
console.log(`넣었다: 회차 3 · 줄 ${big.length} + ${small.length} + 2 · 앱 사용자 ${users.length}`);
console.log(`여러 번 참여 확인용: 사햇살 · 사랑 ${rep.sub_name}목장 — 세 회차에 모두`);
console.log(`가짜 명부에서 고른 이름 — A: ${pA.name} · B: ${pB.name} · C(교적 맞음 줄): ${pC.name} · D(한 분 더하기): ${pD.name}` +
  ` · 동명이인(${two.length}분): ${two[0].name} · 아이: ${kid.name}`);

// ⑦ 📤 명단 올리기에 붙여 넣을 글(칸: 이름·교구·목장·직분 · 탭) — 다듬기·판정 규칙을 한 번씩 다 밟는다
const paste = [
  ["성명", "교구", "목장", "직분"],              // 제목 줄 — 건너뛴다
  ["홍길동", "화평교구", "20목장", "집사님"],     // 화평 20 · 집사
  ["홍길순", "소망", "07", "권사"],               // 소망 7(앞 0 뗌)
  ["홍길남", "사랑", "남성목장", "안수집사"],     // 사랑 남성
  ["홍길서", "교회학교", "유년", ""],             // 교회학교 유년부
  ["홍길북", "청년", "청년", "청년"],             // 교회학교 청년부 · 직분 「청년」 그대로(「청년부」가 되면 틀림)
  ["홍길동2", "믿음", "3", "성도"],               // 이름 끝 숫자를 떼고 알림 → 홍길동 믿음 3
  ["홍길중", "화평", "5", "권사님"],              // 권사
  ["홍길(동", "화평", "3", ""],                   // 모양 틀림(bad-char)
  ["홍길돌", "평화", "3", ""],                    // 모양 틀림(bad-group)
  [pA.name, "", "", ""],                          // 빈칸 → 채우기 켜면 교인명부로 채움(교구·목장·직분)
  [pB.name, "", "99", ""],                        // 빈칸 → 채우기 켜면 교인명부 교구·목장(적힌 99 는 버린다는 알림)
  [pA.name, otherGu, "3", ""],                    // 소속이 명부와 달라 채우지 않음 → 넣음(직분 빈칸)
  [two[0].name, "", "", ""],                      // 빈칸 → 채우기 켜면 동명이인(넣지 않음)
  [two[0].name, "화평", "3", ""],                 // 소속이 적혀 있어 동명이인이어도 넣음(직분 빈칸)
  [kid.name, "화평", "3", ""],                    // 교구 줄인데 명부는 아이 → 채우지 않음 → 넣음(직분 빈칸)
  ["가하늘", "화평", "20", "집사"],               // ca-demo-small 에 이미 있음
  ["나바다", "화평", "7", "권사"],                // 이미 있음
].map((c) => c.join("\t")).join("\n");
console.log("----- 📤 붙여 넣을 글(아래 줄부터 끝까지) -----\n" + paste);
```

돌린다:
```bash
cd /c/Projects/church-admin/.worktrees/bible-events
set -a; . ~/.church-admin/dev.env; set +a
node --experimental-strip-types tests/seed-bible-events-dev.mjs
```
Expected(가짜 명부의 이름은 그때그때 다르다):
```
지웠다: 회차 0 · 앱 사용자 0
넣었다: 회차 3 · 줄 1100 + 12 + 2 · 앱 사용자 3
여러 번 참여 확인용: 사햇살 · 사랑 <N>목장 — 세 회차에 모두
가짜 명부에서 고른 이름 — A: <가짜 이름> · B: <가짜 이름> · C(교적 맞음 줄): <가짜 이름> · D(한 분 더하기): <가짜 이름> · 동명이인(2분): <가짜 이름> · 아이: <가짜 이름>
----- 📤 붙여 넣을 글(아래 줄부터 끝까지) -----
성명	교구	목장	직분
…(열일곱 줄 더)
```
`개발 가짜 명부에서 이름을 다 고르지 못했다` 로 멈추면 개발 명부가 비었거나 옛것이다. 교회 어드민 CLAUDE.md 「교인명부」 절대로 가짜 명부를 다시 넣고 다시 돌린다. 이때는 아무것도 넣지 않은 채 멈춘다.
붙여 넣을 글은 **이 터미널 출력에서 그대로** 복사한다(파일로 남기지 않는다).

교회 어드민 `CLAUDE.md` 「성경필사(암송)」 절 끝에 한 줄을 더한다. 먼저 앵커를 본다:
```bash
cd /c/Projects/church-admin/.worktrees/bible-events
grep -c "^- 개인정보 안내는 \`privacy.html\` 7번" CLAUDE.md
```
Expected: `1`. Edit — 그 줄(`- 개인정보 안내는 \`privacy.html\` 7번(+6번 쓰는 곳·보는 사람·기록). 성경암송 \`privacy/\` 는 손대지 않았다(친구 결정 — 앱이 새로 모으는 것이 없다).`) 바로 다음 줄에:
```markdown
- 개발 화면 확인용 가짜 회차: `node --experimental-strip-types tests/seed-bible-events-dev.mjs`(`--clean` 으로 지움 · 회차 id `ca-demo-` · 명단 이름은 음절 표로 지어내고 찾기 이름은 개발 가짜 명부에서 고른다).
```

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
python tools/preflight.py | tail -1
git add tests/seed-bible-events-dev.mjs CLAUDE.md
git commit -m "test(성경필사): 개발 화면 확인용 가짜 회차 셋(tests/seed-bible-events-dev.mjs · ca-demo-)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git show --stat HEAD
```
Expected: `모두 통과`(leak-scan 은 휴대폰 꼴 번호가 스무 개일 때 걸린다 — 이 파일에는 하나뿐이다) · 파일 둘.

- [ ] **Step 3: 코드에 시스템 창이 없는지 먼저 기계로 본다**

```bash
cd /c/Projects/church-admin/.worktrees/bible-events
grep -rnE '\b(alert|confirm|prompt)\(|beforeunload|<select|<datalist|type=.?(date|time|datetime-local|month|week)\b' \
  js/menus/bibleevent js/core/modal.js js/core/picker.js | grep -vE ':[0-9]+:\s*//' || echo "시스템 창 코드 없음"
grep -rn 'type="file"\|type=file' js/menus/bibleevent || true
```
Expected: `시스템 창 코드 없음` · 둘째 명령은 `upload.js` 의 파일 고르기 한 곳만 찍는다(설계의 유일한 예외).
다른 것이 찍히면 그 줄부터 고친다(아래 Step 13 순서).

- [ ] **Step 4: 로컬 서버 — 8000 에 무엇이 떠 있는지 먼저 본다**

다른 세션이 localhost:8000 에 옛 main 을 띄워 두는 일이 잦다(교인명부 개시 날에는 셋이 떠 있었다).
```bash
curl -s -o /dev/null -w "첫 화면 %{http_code}\n" http://localhost:8000/ || true
curl -s -o /dev/null -w "성경필사 화면 %{http_code}\n" http://localhost:8000/js/menus/bibleevent/roster.js || true
```
- `첫 화면 000` → 비어 있다. 아래처럼 띄운다.
- `첫 화면 200` 인데 `성경필사 화면 404` → **다른 폴더가 떠 있다.** 친구에게 「8000 에 다른 세션의 화면이 떠 있어요 — 꺼도 될까요?」라고 묻는다. 허락을 받은 뒤에 PowerShell 로 그 과정을 끈다:
  `Get-NetTCPConnection -LocalPort 8000 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Confirm:$false }`
- 둘 다 200 → 이 가지가 이미 떠 있을 수 있다. 그대로 쓰되 Step 5 의 「캐시 끄기」를 꼭 한다.

띄우기(Bash 도구 `run_in_background: true`):
```bash
python -m http.server 8000 --directory "C:/Projects/church-admin/.worktrees/bible-events"
```
확인:
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/js/menus/bibleevent/roster.js
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/js/core/modal.js
```
Expected: `200` · `200`.

- [ ] **Step 5: 브라우저 준비(친구 PC 의 크롬)**

1. http://localhost:8000 → 오른쪽 위에 「개발 DB」 띠가 보이는지 본다(안 보이면 운영이다 — 멈춘다) → 카카오 로그인(개발). 친구의 개발 계정은 총괄 관리자다.
2. F12 → Network 탭에서 「Disable cache」를 켠다(로컬에는 `?v=` 해시가 없어 옛 모듈이 남는다).
3. Console 에 **한 번** 붙여 넣는다(새로고침하면 다시 붙인다):
```js
(() => { for (const k of ["alert", "confirm", "prompt"]) window[k] = (...a) => { console.error("⚠️ 시스템 창 호출:", k, a); document.title = "⚠️ " + k; return k === "confirm" ? false : null; };
  const add = window.addEventListener; window.addEventListener = function (t, ...r) { if (t === "beforeunload") console.error("⚠️ beforeunload 등록"); return add.call(this, t, ...r); };
  console.log("시스템 창 감시 켬"); })();
```
4. 화면마다 Console 에서 아래 둘을 돌린다(점검표에 「🔎 DOM」 표시가 있는 곳):
```js
document.querySelectorAll('select, input[type=date], input[type=time], input[type=datetime-local], input[type=month], input[type=week], datalist').length
```
Expected: `0`.
```js
[[...document.querySelectorAll('#view button, #view .chip, #view a.btn, .be-modal button')].filter((b) => b.offsetParent && b.getBoundingClientRect().height < 36).map((b) => b.textContent.trim().slice(0, 20)),
 [...document.querySelectorAll('#view *, .be-modal *')].filter((e) => e.offsetParent && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 13).map((e) => e.tagName + ": " + e.textContent.trim().slice(0, 20)),
 document.documentElement.scrollWidth <= window.innerWidth]
```
Expected: `[[], [], true]` — 36px 보다 작은 단추·칩이 없고, 13px 보다 작은 글자가 없고, 옆으로 밀리지 않는다.
5. 폭은 DevTools 기기 모드로 세 가지를 오간다: **360×740 · 390×844(폰)** 과 **1280×800(PC)**.

점검표는 하나씩 ☐ 를 채운다. 「기대」와 다르면 그 자리에 적어 두고 Step 13 으로 간다.

- [ ] **Step 6: A. 들어가기 · 권한 · 주소**

- ☐ 홈 카드에 📋 회차·명단 · 📤 명단 올리기 · 👤 사람별 이력·통계 셋이 **사역신청 묶음 뒤, 교인명부 묶음 앞**에 있다. 왼쪽(PC)·위(폰) 메뉴 묶음 이름은 「성경필사(암송)」.
- ☐ 주소창에 `http://localhost:8000/#/be-roster?ev=ca-demo-small` 을 넣고 Enter → 작은 회차가 골라진 채로 열린다. 칩을 바꾸면 주소의 `?ev=` 도 바뀌고, 새로고침해도 같은 회차다.
- ☐ (친구에게 두 번째 카카오 계정이 있을 때만) 그 계정에 🔑 담당자·역할에서 「성경필사(암송)」만 주고 승인 → 그 계정의 홈에 세 메뉴만 있고 사역신청·교인명부 메뉴는 없다. 주소창에 `#/people` → 홈으로 돌아간다(메뉴 없음). 확인한 뒤 그 계정의 역할을 원래대로 돌린다.

- [ ] **Step 7: B. 📋 회차·명단 — 읽기 · 🔎 DOM**

- ☐ 회차 칩: 최근 회차가 먼저 · 칩마다 인원과 상태 · ca-demo 셋 모두 「성도님께 보임」(👁) 표시가 **없다**.
- ☐ **1,000행**: `ca-demo-big` 칩 인원이 **1,100** · 명단 합계 1,100 · 교구 묶음 차례는 믿음→소망→사랑→섬김→은혜→화평→기쁨→새가족 → 그다음 교회학교(청년부·중등부) · 목장은 숫자 차례(1, 2, … 10 — 1, 10, 2 가 아니다) · 교구마다 110.
- ☐ 거르기: 교구 칩 「화평」 → 110 · 출처 「📋 이관」 → 1,100 · 직분 고르개는 시스템 목록이 아니라 우리 고르개 · 이름 찾기 「가하늘」 → 10줄. 거르기를 풀면 1,100 으로 돌아온다.
- ☐ `ca-demo-small`: 「나바다」 두 줄에 「⚠️ 중복일 수 있음」 · 앱 줄 둘에 📱 앱과 계정 표시 · 「바구름」의 직분 「은퇴안수집사」가 그대로 보인다(막히지 않음).
- ☐ **교적 표시**: Step 2 가 알려 준 C 이름 줄은 「맞음」 · 동명이인 이름 줄(기쁨 1)은 「확인 필요」(같은 이름 여럿) · 지어낸 이름 줄은 「없음」 · 범례가 보인다.
  (C 줄이 「확인 필요」로 나오면 교적 표시 규칙(설계 §2 · 사역신청과 같은 모양)과 견줘 어느 쪽이 맞는지부터 본다.)
- ☐ **새는 것 없음**: 작은 회차를 연 채 Ctrl+F 로 「성도 한 줄」·「010-0000」을 찾으면 **0건**이다. 자격 회차에서 「weeks」 → 0건. Network 탭에서 `evRoster` 응답을 열어 `user_id`·`ident_key`·`memo`·`phone`·`answers` 가 **없는지** 본다.
- ☐ 폰(360·390)은 카드, PC(1280)는 표로 보인다. 폭을 바꾸면 새로고침 없이 바뀐다.
- ☐ **📋 이름을 누르면 교적 창(Task 16)** — 이름 단추: 폰(390) 카드와 PC(1280) 표에서 이름에 마우스를 올리면 밑줄 · Tab 으로 오면 초점 테두리 · Enter·Space 로도 열린다. 폰에서 이름을 눌러도 옆 ⋯(줄 메뉴)가 눌리지 않고, 줄 높이·카드 모양은 전과 같다(누르는 자리만 44px).
- ☐ 총괄(교인명부 역할)로: 교적 「맞음」 줄(Step 2 의 **C**)의 이름 → 곧바로 교인명부 「자세히」 창(사진·연락처·가족). 동명이인 줄(기쁨 1 · 「확인 필요」)의 이름 → 먼저 우리 고르개(제목 「<이름> — 어느 분인가요?」 · 줄마다 이름과 「소속 · 직분」) → 고르면 「자세히」 · 고르개 Esc → 아무것도 안 열린다. 「자세히」 창의 가족 이름 → 그분 창 · 「👪 가족 모두 목록으로」 → 알림 「가족 목록은 🔎 교인 찾기에서 …」 한 줄, **창과 메뉴는 그대로**.
- ☐ (친구에게 두 번째 카카오 계정이 있을 때만 — Step 6 과 함께) 「성경필사(암송)」만 준 계정: 이름 → 작은 창(🪪 ○○님 교적) — 이름·직분·소속·「명단의 소속과 맞대 보면 교적 ✓」·「🔒 연락처·사진은 교인명부 담당자만 볼 수 있어요」 · 교적 표시가 명단 카드의 표시와 같다 · Network 의 `evPerson` 응답에 `person_id`·전화·주소가 없다 · 「닫기」·Esc 로 닫히고 초점이 그 이름으로 돌아온다. 동명이인 줄 → 「교인명부에 같은 이름이 N분 있어요 — 소속으로 누구인지 확인해 주세요」와 N분의 이름·소속·직분. (두 번째 계정이 없으면 이 모양은 Task 16 의 개발 서버 시험이 본다.)
- ☐ 지어낸 이름 줄(교적 「없음」)의 이름 → 알림 「교인명부에서 찾지 못했어요」 한 줄(창이 뜨지 않는다). 이름을 빠르게 두 번 눌러도 창이 하나만 뜬다(Network 에 `evPerson` 한 번).
- ☐ **뒤로 가기는 창만 닫는다**: 작은 창·고르개·「자세히」 창(가족 이름으로 넘어간 창도)을 연 채 뒤로 가기(Alt+← · 마우스 뒤로 단추 · 폰은 뒤로 몸짓) → **창만 닫히고 명단은 그대로**(같은 회차·같은 거르기·같은 스크롤). 창을 연 채 콘솔 `history.state` → `{bePerson: 1}`. 「닫기」로 닫은 뒤 뒤로 가기 **한 번** → 앞 화면으로 간다(헛 누름이 없다).
- ☐ 창을 연 채 주소창을 `#/be-history` 로 바꾸고 Enter → 창이 사라지고 이력 화면이 나온다. DevTools Network 를 「Slow 3G」로 두고 이름을 누른 뒤 창이 뜨기 전에 왼쪽 메뉴 👤 를 누르면 → 이력 화면 위에 창이 **뜨지 않는다**(교적 「맞음」 줄로 한 번 더 — 「자세히」 창이 늦게 뜨는 자리). 끝나면 「No throttling」으로 되돌린다.
- ☐ 🔎 DOM 두 줄 모두 기대대로다(이름 단추·교적 창이 열린 채로도).

- [ ] **Step 8: C. 입력 창 · 고르개 · 뒤로 가기 · 공개 확인(`needs-confirm`)**

`ca-demo-small` 에서:
- ☐ 「회차 설정」 → 폰은 아래에서 올라오는 판, PC 는 가운데 창 · 첫 칸에 초점 · 창 모양이 확인 창(`dialog`)과 같은 배경·모서리·단추 크기다.
- ☐ 🔎 DOM: 창이 열린 채로 `select`·`date` 칸이 0.
- ☐ 날짜 칸을 누르면 **우리 고르개**가 뜬다(시스템 달력이 아니다). 상태 칸도 **우리 고르개**다(시스템 목록이 아니다).
- ☐ **고르개 안에서 Esc 한 번** → 고르개만 닫히고 창은 남는다(입력값 그대로). **Esc 한 번 더** → 바꾼 것이 없으면 창이 닫힌다.
- ☐ 날짜를 하나 바꾼 뒤 Esc → 창 안에 「저장하지 않은 내용이 있어요 — 닫을까요?」 [계속 쓰기][닫기] → 「계속 쓰기」 → 창과 값이 그대로 → 다시 Esc → 「닫기」 → 닫힌다.
- ☐ 고르개를 연 채 **창 안 다른 곳**을 누르면 고르개만 닫힌다. 창 **바깥**을 누르면 닫기 요청이 된다(바꿨으면 창 안에서 확인). 창 안에서 글자를 끌어 고르다가 바깥에서 떼면 **닫히지 않는다**.
- ☐ **뒤로 가기**(Alt+← 또는 마우스 뒤로 단추 · 폰은 뒤로 몸짓): 창이 열린 채면 창 닫기 요청(바꿨으면 창 안 확인)이 되고 메뉴는 그대로다. 「계속 쓰기」 뒤 다시 뒤로 가기 → 또 창 안 확인이 뜬다(메뉴를 떠나지 않는다). 창을 「닫기」 단추로 닫은 뒤 뒤로 가기 **한 번** → 앞 메뉴로 간다(헛 누름이 없다).
- ☐ 창을 연 채 주소창을 `#/be-history` 로 바꾸고 Enter → 창이 사라지고 이력 화면이 나온다(창이 남지 않는다).
- ☐ 창을 연 채 F5 → 브라우저의 「사이트에서 나가시겠습니까?」 창이 **뜨지 않는다**.
- ☐ 날짜를 거꾸로 못 고른다: 마감일 달력에서 **시작일 앞 날이 흐리고** 눌리지 않는다 · 시작일 달력에서 **마감일 뒤 날이 흐리다** · 공개 종료일 달력에서 마감일 앞 날이 흐리다(`pickDate` 의 min/max — 거꾸로 된 기간은 화면에서 만들 수 없다).
- ☐ 틀린 값(화면에서 만들 수 있는 것): 공개 종료일을 둔 채 **마감일을 그 뒤로 미루고** 저장 → **창 안 빨간 줄** 「명단 공개 종료일이 등록 마감일보다 앞서요」(창 유지 — 마감일 달력에는 max 가 없어서 된다). 이름을 비우고 저장 → 「회차 이름을 적어 주세요」.
- ☐ 상태를 「열림」·「마감」으로 고르고 공개 종료일이 빈 채면, 「개인정보 안내가 정해진 날까지만 보인다고 약속한다」는 뜻의 경고 줄이 창 안에 보인다. 날짜를 고르면 사라진다.
- ☐ **공개 확인**: 상태 「준비 중 → 마감」 → 저장 → 확인 창 「👁 성도님께 보이게 할까요?」 · 「이 회차가 성도님 첫 화면에 나타납니다 — 명단(이름·소속·직분)이 로그인 없이 보여요」 → **「그만두기」** → 창 안에 「저장하지 않았어요 — 아무것도 바뀌지 않았어요」 · 칩은 「준비 중」 그대로이고 👁 가 없다 · 📜 바꾼 기록에 이 회차의 `event.settings` 줄이 **없다**(아무것도 안 썼다).
- ☐ 다시 「마감」 저장 → 「보이게 하기」 → toast 「👁 이 회차가 이제 성도님께 보여요」 · 칩에 👁 · 📜 바꾼 기록에 「성경필사 회차 설정 바꿈 · ca-demo-small」과 「‘화면 확인 — 작은 회차(준비 중)’ · 상태 준비 중 → 마감」.
- ☐ 되돌리기: 상태 「준비 중」 저장 → **확인 창 없이** 저장된다(안 보이게 하는 쪽은 묻지 않는다) · 👁 가 사라진다. (개발 앱 첫 화면에 잠깐 보였던 것을 여기서 거둔다.)
- ☐ 저장 중 단추 잠김: 「저장」을 빠르게 두 번 누르면 Network 에 `evEventSave` 가 **한 번**만 간다.
- ☐ 인터넷 끊기(DevTools Network → Offline) → 저장 → 창 안 빨간 줄 「인터넷 연결을 확인해 주세요」 · 창 유지 → Online 으로 되돌리고 저장 → 된다.
- ☐ **두 탭 충돌**: 같은 주소를 탭 둘에 열고 둘 다 「회차 설정」 → A 에서 부제를 바꿔 저장 → B 에서 다른 칸을 저장 → B 의 창 안에 「다른 분이 먼저 이 회차를 바꿨어요 — 적으신 것을 적어 두고 「닫기」를 누르면 새로 불러올게요」 → 「닫기」 → B 가 새로 불러와 A 의 값을 보여 준다.
- ☐ 「＋ 새 회차」: id `ca-demo-new` · 이름 · 기간 → 만들기 → 칩에 「준비 중」으로 생긴다(상태를 고르는 칸이 없다). 같은 id 로 또 → 「같은 회차 ID 가 이미 있어요 — 다른 ID 를 적어 주세요」. id `Bad Id` → 회차 ID 모양 문구(`bad-event-id`).
- ☐ 창이 닫히면 초점이 여는 단추로 돌아온다(Tab 을 한 번 눌러 보면 다음 단추로 간다).

- [ ] **Step 9: D. 줄 — 한 분 더하기 · 고치기 · 빼기**

`ca-demo-small` 에서:
- ☐ 「＋ 한 분 더하기」 → 이름에 Step 2 가 알려 준 **D 이름**을 치고 **Enter** → Network 에 `evPeopleLookup` 이 **Enter 때 한 번** 간다(글자마다가 아니다) → 후보 줄에 **이름·구분·소속·세부·직분 다섯만** 있다(연락처·주소·생일·사진·교인ID 없음 · 응답 JSON 에도 그 다섯 칸만) → 고르면 폼이 채워진다 → 직분을 손으로 고칠 수 있다 → 저장 → 명단에 생기고 메모는 「담당자가 더함」.
- ☐ 📜 「교인명부 기록」 탭에 「명부 찾기(성경필사)」 · 「‘<D 이름>’ · 1명」. 「바꾼 기록」 탭에는 「성경필사 명단 더함」.
- ☐ **동명이인** 이름으로 찾기 → 후보가 둘 이상 나란히 보인다 · 하나를 고르면 그분 값으로 채워진다 → 저장하지 않고 「닫기」.
- ☐ 메모 칸은 480자에서 더 쳐지지 않는다(서버는 붙임말 「담당자가 더함 / 」까지 붙여 500자 안이다). 480자 메모로 더해도 저장된다.
- ☐ 「데모앱성도나」 · 화평 · 21 을 손으로 적어 저장 → 그 줄에 계정 이어짐 표시 · 바꾼 기록 끝에 「앱 계정 이음」.
- ☐ **07/7**: 「데모앱성도다」 · 소망 · **7** → 창 안 「이 회차에 같은 분이 이미 있어요」(앱 줄은 「07」이다).
- ☐ 「가하늘」 · 화평 · 20 → 「이 회차에 같은 분이 이미 있어요」.
- ☐ 이름에 `(` → 「이름·소속에는 " \ , ( ) | 를 쓸 수 없어요」 · 41자 이름 → 「한 칸에 40자까지 적을 수 있어요」 · 목장 「스물」 → 「목장은 숫자나 「남성」으로 적어 주세요 (모르면 비워 두기)」.
- ☐ 「나바다」(메모 「원래: 화평 30 · 집사」) 「고치기」 → 창에 **지금 메모가 채워져 있다** → 직분만 「집사」로 → 저장 → 메모 그대로 · 바꾼 기록 「나바다 · 회차 ca-demo-small · 직분 권사 → 집사」.
- ☐ 앱 줄(데모앱성도가) ⋯ → 「📝 메모 고치기」 하나뿐(「빼기」 없음) → 창에 「📱 성도님이 앱에서 낸 신청이라 메모만 고칠 수 있어요 · 빼기는 성도님이 앱에서 해요」 · 다른 칸 잠김 · 메모만 저장된다.
- ☐ 이관 줄 「빼기」 → 창 안 두 단계 확인(「빼기」 → 「네, 뺍니다」 — 두 번 톡톡 눌러도 한 번에 지나가지 않는다) → 빠짐 · 칩 숫자가 준다 · 바꾼 기록 「성경필사 명단 뺌 · … · 📋 이관」.
- ☐ 두 탭 충돌(같은 줄 고치기) → 「다른 분이 먼저 이 줄을 바꿨어요 — 적으신 것을 적어 두고 「닫기」를 누르면 새로 불러올게요」. 한 탭에서 뺀 줄을 다른 탭에서 고치기 → 「이 줄(회차)을 찾지 못했어요 — 다른 분이 뺐을 수 있어요. 「닫기」를 누르면 새로 불러올게요」.
- ☐ 🔎 DOM 두 줄 모두 기대대로다(창이 열린 채로도).

- [ ] **Step 10: E. 자격 회차 `ca-demo-el`**

- ☐ 📋 에서 이 회차를 고르면 「＋ 한 분 더하기」 단추가 **없다** · 「🔒 자격 회차예요 — 자격 규칙은 여기서 바꾸지 않습니다 · 이 회차는 한 분 더하기·올리기를 하지 않습니다(가을 설계 §12)」 한 줄이 보인다.
- ☐ 이관 줄(사햇살) ⋯ → 「📝 메모 고치기」 하나뿐 · 창에 「🔒 자격 회차의 줄이라 메모만 고칠 수 있어요」 · 「빼기」 없음.
- ☐ 회차 설정에서 시작일을 2026-10-01 로 → 저장 → 창 안 빨간 줄 「자격 회차는 자격 측정 시작일보다 먼저 열 수 없어요」(자격 시작일 2026-10-11 보다 앞 — `before-eligibility`).
- ☐ 📤 명단 올리기: 회차 고르개에 `ca-demo-el`(「화면 확인 — 자격 회차」)이 **나오지 않는다**. 주소 `#/be-upload?ev=ca-demo-el` 로 들어오면 회차를 고르지 않고 「주소의 회차는 자격 회차(가을 말씀 동행처럼 자격으로 정해지는 명단)라 여기서 올리지 않아요 — 다른 회차를 골라 주세요」 한 줄만 보인다. **살펴보기까지 가지 않는다**(CONTRACT 5 — 서버의 `eligibility-event` 는 Task 8 개발 시험이 본다).

- [ ] **Step 11: F. 📤 명단 올리기 · G. 👤 이력·통계 · H. 내려받기 = 화면 · I. 바꾼 기록**

📤 (회차 `ca-demo-small` · Step 2 의 「붙여 넣을 글」 · 칸 차례는 기본인 이름·교구·목장·직분):
- ☐ 칸 차례 고르기가 **우리 고르개**다(시스템 목록이 아니다).
- ☐ 「빈칸은 교인명부로 채우기」 **끄고** 살펴보기, 다음으로 **켜고** 살펴보기 — 판정이 아래 표와 같다(A·B·동명이인·아이는 Step 2 가 알려 준 가짜 이름).
  제목 줄(「성명」)은 판정 표에 없다. 건수: 끄면 **넣음 10 · 이미 있음 2 · 빈칸 3 · 틀림 2**, 켜면 **넣음 10 · 교인명부로 채움 2 · 동명이인 1 · 이미 있음 2 · 틀림 2 · 빈칸 0**.

| 붙인 줄 | 채우기 끔 | 채우기 켬 |
|---|---|---|
| 홍길동 · 화평교구 · 20목장 · 집사님 | 넣음 — 화평 20목장 · 집사 | 같음 |
| 홍길순 · 소망 · 07 · 권사 | 넣음 — 소망 **7**목장 | 같음 |
| 홍길남 · 사랑 · 남성목장 · 안수집사 | 넣음 — 사랑 남성 | 같음 |
| 홍길서 · 교회학교 · 유년 | 넣음 — 교회학교 **유년부** | 같음 |
| 홍길북 · 청년 · 청년 · 청년 | 넣음 — 교회학교 청년부 · 직분 **청년** | 같음 |
| 홍길동2 · 믿음 · 3 · 성도 | 넣음 — 홍길동 · 믿음 3목장 · 「이름 끝 숫자를 뗐어요」 | 같음 |
| 홍길중 · 화평 · 5 · 권사님 | 넣음 — 직분 권사 | 같음 |
| 홍길(동 · 화평 · 3 | 모양 틀림(`bad-char`) | 같음 |
| 홍길돌 · 평화 · 3 | 모양 틀림(`bad-group`) | 같음 |
| A · (빈칸) | 빈칸 | **교인명부로 채움** — 교구·목장·직분이 보인다 |
| B · (빈칸) · 99 | 빈칸 | **교인명부로 채움** — 교인명부 교구·목장 · 「적힌 목장 99 대신 교인명부 목장」 알림 |
| A · (A 와 다른 교구) · 3 | 넣음(직분 빈칸) | 넣음(직분 빈칸) — 소속이 명부와 달라 채우지 않음 |
| 동명이인 · (빈칸) | 빈칸 | **동명이인** — 넣지 않음 |
| 동명이인 · 화평 · 3 | 넣음(직분 빈칸) | 넣음(직분 빈칸) — 소속이 적혀 있으면 동명이인이어도 넣는다 |
| 아이 · 화평 · 3 | 넣음(직분 빈칸) | 넣음(직분 빈칸) — 명부는 아이라 채우지 않음 |
| 가하늘 · 화평 · 20 · 집사 | 이미 있음 | 같음 |
| 나바다 · 화평 · 7 · 권사 | 이미 있음 | 같음 |

  (판정이 다르면 설계 §3 「읽을 때 다듬는 것」·§2 「빈칸 채우기」와 CONTRACT 5 「빈칸 채우기 보강」·「올리기 판정」과 견줘 누가 맞는지부터 본다.)
- ☐ 채우기를 켜고 살펴본 뒤 📜 「교인명부 기록」에 「명부로 빈칸 채움(성경필사) · ca-demo-small」과 「채운 줄 2 · <A>, <B>」가 있다(넣기 전인데도 남는다).
- ☐ 붙여넣기 칸의 글을 한 글자 고치면 앞 살펴보기가 지워진다(넣기 단추가 숨는다).
- ☐ 「넣기」 → 확인 창의 건수(「… 12명을 넣습니다 (교인명부로 빈칸을 채운 2명 포함) …」)가 **지금 글로 다시 센** 건수와 같다 → 넣는다 → 📜 바꾼 기록에 「성경필사 명단 올림 · ca-demo-small」과 「올린 줄 17 · 넣음 12 · 이미 있음 2 · 빈칸 0 · 틀림 2 · 교인명부로 채움 2 · 동명이인 1 · 목록 밖 직분 1」(제목 줄은 `parseSheet` 가 빼서 17줄 · 직분 「청년」은 앱 직분 목록 밖이라 1 — 올리기 요약에도 「직분 확인 1줄」) — **이름이 한 글자도 없다**.
- ☐ 같은 글을 **한 번 더** 살펴보기·넣기 → 넣을 줄이 전부 「이미 있음」 · 넣음 0(동명이인 1 · 틀림 2 는 그대로).
- ☐ 엑셀 파일: 붙여 넣을 글을 엑셀에 붙여 `.xlsx` 로 저장 → **끌어다 놓기**로 올린다(파일 창 없이). 「파일 고르기」 단추만 운영체제 창이 뜬다(유일한 예외 — 확인만 하고 닫는다). 저장한 파일은 확인 뒤 지운다(저장소 폴더에 두지 않는다).
- ☐ 601줄: 아무 줄이나 601번 붙여 살펴보기 → 「한 번에 600줄까지 올릴 수 있어요 — 나눠서 올려 주세요」(`too-many`).
- ☐ 🔎 DOM 두 줄 모두 기대대로다.

👤:
- ☐ 이름 「사햇살」 → 묶음 가운데 「사햇살 · 사랑 <N>목장」(Step 2 출력의 N) 하나에 회차 셋(큰 회차·작은 회차·자격 회차)이 최근 먼저 보인다. 나머지 아홉 묶음은 큰 회차의 다른 소속이다. 근삿값 안내(「같은 이름·같은 소속(또는 같은 앱 계정)을 한 분으로 셌어요 — 근삿값이에요 …」)가 보인다.
- ☐ 이름 「데모앱성도가」 → 한 묶음 · 회차 둘(작은·자격) · 계정 이어진 줄 표시.
- ☐ **이름을 누르면 교적 창(Task 16)**: 👤 묶음 머리 「이름 · 소속」을 누르면 교적 창(총괄이면 「자세히」 창 또는 고르개) · 회차 이름 링크는 그대로 📋 그 회차로 간다 · 뒤로 가기는 창만 닫는다(이력 화면 그대로).
- ☐ 통계: 기본은 전부 · 빠른 고르기 「사순절」「썸머」「소책자」(개발에 그 id 가 없으면 0 또는 비활성) · ca-demo 셋만 고르기 → 회차별 인원이 칩 숫자와 같다 · 교구(부서)×회차 표의 합이 인원 합과 같다 · 「여러 번 참여한 분」(3회 이상)에 사햇살 줄이 **이름(교적 창 단추) · 사랑 <N>목장 · 3회 · 줄 끝 「📜 이력」** 꼴로 보인다 — 이름 → 교적 창 · 「📜 이력」 → 👤 사람별 이력으로 넘어가 그 이름을 찾는다(Task 12 점검 ⑧ 은 이제 이 단추다 · Task 16).
- ☐ 통계 내려받기 → 「여러 번 참여한 분」 표의 머리 칸이 「이름」·「소속」·「횟수」·「참여 회차」이고, 「소속」 칸에 이름이 겹쳐 들어가지 않는다.

내려받기 = 화면(📋 `ca-demo-big`):
- ☐ 교구 칩 「화평」 + 출처 「📋 이관」 → 화면 110명 → CSV 내려받기 → PowerShell:
  `(Get-Content "$HOME\Downloads\<받은 파일>.csv" -Encoding UTF8 | Measure-Object -Line).Lines` → **111**(머리 1 + 110).
- ☐ 머리 줄이 `이름,구분,소속,세부,직분,출처,교적` · **메모 칸 없음** · 엑셀로 열어도 한글이 안 깨진다(BOM).
- ☐ 거르기를 모두 풀고 다시 → **1,101** 줄.
- ☐ (크롬 설정 「다운로드 전에 저장 위치 확인」이 켜져 있으면 저장 창이 뜨는데, 이것은 브라우저 설정이다. 친구에게 그렇다고 말하고 예외로 적는다 — CONTRACT 5.)
- ☐ 받은 CSV 는 확인 뒤 지운다.

바꾼 기록(📜 — 총괄 관리자):
- ☐ 「바꾼 기록」 탭에 `event.create`·`event.settings`·`event.add`·`event.edit`·`event.delete`·`event.upload` 가 **한국말 이름**(성경필사 …)과 한 줄 설명으로 보인다 · 영문 코드가 보이지 않는다.
- ☐ `people.lookup`·`people.fill` 은 「교인명부 기록」 탭에만 있고 「바꾼 기록」 탭에는 없다.
- ☐ **교적 창 기록(Task 16)** 「교인명부 기록」: 총괄로 이름을 눌러 곧바로 「자세히」가 열린 것은 「교인 보기」 한 줄뿐 · 고르개가 뜬 것(동명이인)은 「명부 찾기(성경필사) · ‘이름’ · N명」 한 줄 + 고른 뒤 「교인 보기」 한 줄(고르개를 닫았으면 「명부 찾기」 한 줄만) · 지어낸 이름은 「‘이름’ · 0명」 · (두 번째 계정이 있으면) 성경필사 역할로 누른 것은 늘 「명부 찾기(성경필사) · ‘이름’ · N명」 한 줄.

- [ ] **Step 12: J. 개인정보 안내 · 모양**

- ☐ http://localhost:8000/privacy.html → 6번에 성경필사(암송) 네 곳(쓰는 곳·보는 사람·기록·「이름을 누르면」 한 줄 — 총괄 관리자와 「교인명부」 역할도 있는 담당자에게는 자세히 보기) · 7번 「성경필사(암송) 명단」(「교인명부에서 가져오는 것」에 명단의 이름을 누를 때와 자세히 보기 예외 · 「기록」에 자세히 보기로 본 교인) · 폰 폭에서 옆으로 밀리지 않는다.
- ☐ 세 메뉴 모두 360px 에서 `scrollWidth <= innerWidth` · 주 단추 48px · 둘째 44px · 칩 36px(Step 5 의 둘째 줄).

- [ ] **Step 13: 걸린 것 고치기(있을 때만) — 한 건씩**

걸린 것마다:
1. 무엇이 · 어디서 · 기대와 어떻게 다른지 한 줄로 적는다(친구에게도 보여 준다).
2. **시험 먼저** — 순수 논리면 그 `*-logic.js`/`events-*.ts` 시험에, 서버면 `tests/server.dev.test.mjs` 에 실패하는 시험을 더한다 → 돌려서 FAIL 을 본다.
3. 고친다 → 시험 PASS → `python tools/preflight.py | tail -1` → `모두 통과`.
4. 서버를 고쳤으면: 커밋한 뒤 `git status --short` 가 비었는지 보고, **워크트리 루트에서** `supabase functions deploy church-admin --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo` → `node --experimental-strip-types --test tests/server.dev.test.mjs` → `# fail 0`. 배포가 실패하면(문법·이름) 그것부터 고친다.
5. 커밋 — `git add <고친 파일들>` · `git commit -m "fix(성경필사): <무엇을> — <왜>" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"` · `git show --stat HEAD`.
6. 그 점검 줄을 **처음부터 다시** 한다(새로고침 · Console 감시 다시 붙이기).

- [ ] **Step 14: 친구의 확인 · 정리**

- 친구에게 점검표 결과(☐ 가 모두 채워졌는지 · 예외로 적은 것)를 보여 드리고 **「이대로 운영을 열어도 된다」**는 말을 받는다. 받기 전에는 Task 15 로 가지 않는다.
- 친구가 확인한 뒤에 개발 가짜 회차를 지운다:
```bash
cd /c/Projects/church-admin/.worktrees/bible-events
set -a; . ~/.church-admin/dev.env; set +a
node --experimental-strip-types tests/seed-bible-events-dev.mjs --clean
```
Expected: `지웠다: 회차 3 · 앱 사용자 3`(「＋ 새 회차」로 만든 `ca-demo-new` 가 남아 있으면 회차 4).
- 로컬 서버를 끈다(백그라운드 작업 멈추기). 진행 기록부 `C:\Projects\church-admin\.superpowers\sdd\progress.md`(저장소에 안 들어간다) 끝에 한 줄을 적는다: `Task 14 (날짜): localhost 확인 끝 — 친구 OK · 고친 것 <커밋 해시들 또는 없음> · 예외 <있으면>`.
- **푸시하지 않는다.**

---

### Task 15: 운영 여는 날 — 차례대로 한 번에

설계 §5 「배포 순서」를 따른다. 표는 고치지 않고 새 역할·새 액션만 얹으므로 **역할 SQL 이 먼저**다. 그리고 **같은 날 차례로** 성경암송 얼리기 → 교회 어드민 운영 함수 → 푸시 → 표식 확인. 얼리기를 뒤로 미루면 그 사이 두 곳이 함께 쓴다.
CONTRACT 5 「Task 15 순서」에 따라 **운영에 쓰지 않는 준비를 모두 먼저 끝낸다.** 교회 어드민 main 따라잡기·개발 다시 시험(Step 1), 성경암송 얼림 코드와 개발 배포·시험(Step 2~4), 문서 앵커 확인(Step 5)이 그것이다. 운영 얼리기(Step 8)는 교회 어드민 운영 함수 배포(Step 9) **바로 앞**에 둔다. Step 8 부터 Step 9 까지는 명단을 고칠 곳이 없는 시간이다. 쉬지 않고 이어 간다.

> ⚠️ 이 과제의 모든 운영 쓰기(SQL 한 줄 · 함수 둘 · 푸시 둘)는 **친구가 옆에 있고 허락한 뒤**에 한다. auto mode 가 운영 쓰기를 막으면 우회하지 않고 친구에게 묻는다.
> ⚠️ **성경암송 얼림 자리 — 비밀번호 확인 바로 뒤**(CONTRACT 5). 설계 §4-3 은 「맨 앞」이라 적었지만, 비밀번호 없는 호출은 지금처럼 `unauthorized` 여야 한다(`tests/event-smoke.sh` 5) 의 기대값 유지). 그래서 얼림을 보는 시험(5-1)은 **관리자 비밀번호가 있어야** 돈다. 비밀번호는 **친구가 자기 Git Bash 창에서 직접 친다.** Claude 는 비밀번호를 묻지 않고, 대화·파일·명령에 적지 않는다.
> ⚠️ **설계 §4-4 의 성경암송 `admin.html` 이벤트 타일 갈아타기는 이번에 하지 않는다**(CONTRACT 5). 자격 인정(`eventExcuse`)이 아직 `admin-event.html` 에 남기 때문이다. 자격 인정이 옮겨진 다음 단계에서 한다(Step 14 「남은 것」).
> 셸 상태는 명령마다 사라진다. 그래서 단계마다 변수를 다시 적는다. 작업 파일은 저장소 밖 `~/.church-admin/launch-bible-events/`(`C:\Users\sewki\.church-admin\launch-bible-events\`)에 둔다.
> 성경암송 저장소는 여러 세션이 한 체크아웃을 함께 쓴다. `git add -A`·`git commit -a`·넓은 `restore/reset/stash` 는 쓰지 않는다. 커밋 뒤에는 `git show --stat` 을 눈으로 본다. `supabase functions deploy` 는 작업 트리를 올린다. 그래서 성경암송 `api` 는 **내 커밋을 `git archive` 로 푼 폴더**에서만 올린다.
> 두 저장소 모두 **줄 번호로 찾지 않는다.** 고칠 자리는 앵커 글로 찾고, 먼저 `grep -c` 로 한 번만 나오는지 본다.

**Files:**
- 교회 어드민(워크트리 → main): `CLAUDE.md`(「성경필사(암송)」 제목 줄에 날짜) · main 따라잡기 합치기(필요할 때만) · main 합치기 커밋
- 성경암송 `C:\Projects\bible-memorize-church-app-v2`:
  - Modify: `tests/event-smoke.sh` — 앵커 `chk "eventExcuse 거부"` 줄 뒤에 5-1 절
  - Modify: `supabase/functions/api/index.ts` — 앵커 `// ---------- eventSetNote: 담당자 메모 ----------` 앞에 `EVT_MOVED` · 세 함수(`async function eventSetNote(b: any) {`·`async function eventSave(b: any) {`·`async function eventImport(b: any) {`)의 비밀번호 확인 두 줄 바로 뒤에 한 줄씩
  - Modify(스크립트): `admin-event.html`(머리 주석 · CSS · `MOVED_HTML` · 회차 칩 빈 안내 · `evFormHtml` · 줄 「메모」 단추 · `askNote`·`saveEvent` 걷기 · `wire()` 두 곳) · `supabase/event_stamp_2026.sql`(머리) · `docs/superpowers/specs/2026-09-23-autumn-streak-event-design.md`(§13-12)
  - Create(스크립트): `docs/notes/bible-events-admin.md` · Modify(스크립트): `CLAUDE.md`(표의 「교회 어드민」 줄 다음에 한 줄) — Task 13 에서 옮겨 온 것(CONTRACT 5)
- Claude 메모리(저장소 밖 · `C:\Users\sewki\.claude\projects\c--Projects-bible-memorize-church-app-v2\memory\`): `summer-write-bible-add-member.md` · `event-rosters-align-to-directory.md` · `MEMORY.md` · Create `bible-events-admin-live.md`

**Interfaces:**
- Consumes: 가지 `bible-events` 끝(Task 1~14·16 · Task 14 친구 OK) · `supabase/sql/004_bibleevent_role.sql` · `supabase/sql/check-authenticated-exposure.sql` · Task 13 의 제목 글 `## 성경필사(암송) (개발 중 — 운영 여는 날 이 줄에 날짜를 적는다)`
- Produces: 운영 `admin_roles` 에 `bibleevent` · 운영 성경암송 `api` 에서 `eventImport`·`eventSave`·`eventSetNote` 가 비밀번호가 맞으면 `{ok:false, error:"moved-to-church-admin"}`(비밀번호가 없거나 틀리면 예전처럼 `unauthorized`) · 운영 교회 어드민 함수(새 액션 13개) · admin.onlybible.kr 화면(세 메뉴) · 성경암송 `admin-event.html` 안내 띠 · 성경암송 `docs/notes/bible-events-admin.md` · 성경암송 CLAUDE.md 표 한 줄 · 담당자 역할 · 고친 Claude 메모리

- [ ] **Step 0: 여는 날 확인 — 일곱 가지가 모두 「예」일 때만**

```bash
TZ=Asia/Seoul date "+%F %H:%M"
cd /c/Projects/church-admin/.worktrees/bible-events
git status --short; git log --oneline -1
python tools/preflight.py | tail -1
git -C /c/Projects/church-admin cat-file -e main:js/core/picker.js && echo MAIN-HAS-PICKER
mkdir -p ~/.church-admin/launch-bible-events
```
1. Task 14 에서 친구가 「열어도 된다」고 했다.
2. 워크트리 status 가 비었다 · preflight `모두 통과` · `MAIN-HAS-PICKER`.
3. 오늘 날짜가 **2026-10-11 전**이다. 10/11 이후면 가을 말씀 동행은 이미 옛 화면(`admin-event.html`)으로 열렸을 것이다. 그래도 진행하되, Step 5 스크립트에서 가을 설계 §13-12 한 쌍(③)을 빼고 「이미 지난 일」로 적는다.
4. 지금 성경암송 담당자가 명단을 고치는 중이 아니다(친구에게 묻는다). 얼린 뒤에는 옛 화면의 저장이 되지 않는다.
5. 다른 세션: `ListAgents` 로 본다. 성경암송이나 교회 어드민을 고치는 세션이 있으면 `SendMessage` 로 묻고 답을 받는다: 「오늘 성경암송 api 를 개발·운영에 배포합니다(eventImport·eventSave·eventSetNote 얼림). 교회 어드민 함수도 운영에 배포하고 main 을 푸시합니다. api 에 커밋 안 한 것·배포 안 한 커밋이 있나요? 제가 끝났다고 할 때까지 두 저장소의 함수 배포와 main 푸시를 미뤄 주실 수 있나요?」
6. 친구가 옆에 있고, 운영 쓰기(SQL 한 줄 · 함수 둘 · 푸시 둘)를 하겠다고 허락했다.
7. 친구가 **개발과 운영의 성경암송 관리자 비밀번호**를 알고, 자기 Git Bash 창에서 스모크를 돌릴 수 있다(Step 2·4·8).

- [ ] **Step 1: 교회 어드민 — main 따라잡기 · 개발 다시 시험 · 문서 날짜(운영 쓰기 없음)**

```bash
cd /c/Projects/church-admin
git fetch origin
git status -sb | head -1
git log --oneline origin/main..main
```
Expected: 첫 줄이 `## main...origin/main` 이다(뒤에 `[behind N]` 가 붙어도 된다). 마지막 명령은 **아무것도 안 찍는다.**
마지막 명령이 커밋을 찍으면 로컬 main 에 남의 안 나간 커밋이 있는 것이다. 이대로 푸시하면 그것까지 운영에 나간다. **멈추고** 친구와 그 세션에 묻는다.
`behind` 면 `git merge --ff-only origin/main` 을 한다(`Aborting` 이 나오면 다른 세션의 수정과 겹친 것이다 — 멈추고 친구에게).

```bash
cd /c/Projects/church-admin
git log --oneline bible-events..main
```
아무것도 안 찍으면 따라잡을 것이 없다 — 아래 합치기는 건너뛴다.
커밋을 찍으면 가지를 낸 뒤 main 이 앞서 간 것이다. **가지에 먼저 합쳐 시험한다**:
```bash
cd /c/Projects/church-admin/.worktrees/bible-events
git merge main -m "merge: main 을 bible-events 로(운영 여는 날 합치기 전)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
충돌이 나면 **양쪽을 다 살린다**(`registry.js`·`ui.js` MESSAGES·`admin.css`·`authz.ts`·`index.ts`·`server.dev.test.mjs`·`authz.test.mjs`·`CLAUDE.md`·`audit.js` — 목록·표·import 문은 두 쪽 줄을 모두 둔다). 그다음:
```bash
cd /c/Projects/church-admin/.worktrees/bible-events
git status --short
python tools/preflight.py | tail -1
supabase functions deploy church-admin --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo   # 워크트리 루트 — 문법 검사도 이것이 한다
set -a; . ~/.church-admin/dev.env; set +a
node --experimental-strip-types --test tests/server.dev.test.mjs 2>&1 | tail -4
```
Expected: 빈 status · `모두 통과` · `Deployed Functions on project ktpwthwqzgcqcrmsafdo: church-admin` · `# fail 0`. 실패하면 고쳐 새 커밋을 만들고 다시 한다. 합친 뒤 화면이 크게 바뀌었으면 Task 14 의 해당 줄을 다시 본다.

문서 날짜(교회 어드민 CLAUDE.md — 작업 트리가 CRLF 라 앵커 끝에 `$` 를 쓰지 않는다):
```bash
cd /c/Projects/church-admin/.worktrees/bible-events
TZ=Asia/Seoul date +%F
grep -c "^## 성경필사(암송) (개발 중 — 운영 여는 날 이 줄에 날짜를 적는다)" CLAUDE.md
```
Expected: 오늘 날짜 · `1`.
**Edit 도구로** 그 한 줄을 바꾼다. `sed -i` 는 쓰지 않는다 — Git Bash 의 `sed -i` 는 CRLF 파일을 통째로 LF 로 바꿔 쓴다(2026-09-29 사본에서 210줄이 바뀌었다). old:
```markdown
## 성경필사(암송) (개발 중 — 운영 여는 날 이 줄에 날짜를 적는다)
```
new(날짜는 위에서 찍은 오늘):
```markdown
## 성경필사(암송) (YYYY-MM-DD 운영 개시)
```
```bash
cd /c/Projects/church-admin/.worktrees/bible-events
grep -n "^## 성경필사(암송)" CLAUDE.md
git diff --stat
git add CLAUDE.md
git commit -m "docs(성경필사): 운영 개시 날짜" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git status --short
```
Expected: `NN:## 성경필사(암송) (<오늘> 운영 개시)` · `CLAUDE.md | 2 +-` · 커밋 뒤 빈 status.

- [ ] **Step 2: 성경암송 — 출발점 · 스모크 시험 5-1(실패 먼저)**

```bash
V2=/c/Projects/bible-memorize-church-app-v2
git -C $V2 fetch origin
git -C $V2 status -sb | head -1
git -C $V2 status --short -- supabase/functions/api/index.ts tests/event-smoke.sh admin-event.html supabase/event_stamp_2026.sql docs/superpowers/specs/2026-09-23-autumn-streak-event-design.md CLAUDE.md docs/notes/bible-events-admin.md
```
Expected: 첫 줄이 `## main...origin/main` 이다(`[ahead N]` 이 붙어도 된다 — 설계 문서 커밋처럼 아직 안 나간 문서 커밋이다). 둘째 명령은 **아무것도 안 찍는다.**
`behind` 가 있으면 `git -C $V2 merge --ff-only origin/main` 을 한다(거절되면 `git -C $V2 merge origin/main` · 로컬 수정 때문에 `Aborting` 이 나오면 **멈추고** 친구에게).
둘째 명령이 무엇을 찍으면 다른 세션이 그 파일을 고치는 중이다. 멈추고 그 세션과 순서를 맞춘다. 아래 커밋은 경로 커밋이라 남의 헝크가 딸려 간다. 특히 `api/index.ts` 는 파일 통째로 배포된다.

`tests/event-smoke.sh` — 앵커를 확인하고 Edit 한 번:
```bash
cd /c/Projects/bible-memorize-church-app-v2
grep -cF 'chk "eventExcuse 거부" "$(jqn '"'"'d.get("error") in ("unauthorized","no-password-set")'"'"' "$N2")" "True"' tests/event-smoke.sh
grep -c '5-1)' tests/event-smoke.sh
```
Expected: `1` · `0`.

old(한 줄):
```bash
chk "eventExcuse 거부" "$(jqn 'd.get("error") in ("unauthorized","no-password-set")' "$N2")" "True"
```
new:
```bash
chk "eventExcuse 거부" "$(jqn 'd.get("error") in ("unauthorized","no-password-set")' "$N2")" "True"

echo "5-1) 교회 어드민으로 옮긴 쓰기 셋은 비밀번호가 맞아도 막힌다(eventRoster·eventExcuse 는 남긴다)"
# ⚠️ eventSave·eventSetNote·eventImport 는 교회 어드민(admin.onlybible.kr 「성경필사(암송)」)으로 옮겨 얼렸다.
#    비밀번호 확인 **바로 뒤**에서 moved-to-church-admin 을 돌려준다 — 비밀번호 없는 호출은 위 5) 처럼 그대로 unauthorized.
#    설계 docs/superpowers/specs/2026-09-29-church-admin-bible-events-design.md §4 · docs/notes/bible-events-admin.md
# 얼리기 전에 돌려도 아무것도 쓰지 않는 입력만 던진다 — eventSave 는 모양이 틀린 id(bad-event-id) ·
#   eventSetNote 는 id 0(bad-args) · eventImport 는 없는 회차(not-found — 줄을 지우기 전에 멈춘다).
if [ -z "${ADMIN_PW:-}" ]; then
  sk "eventSave·eventSetNote·eventImport 얼림" "ADMIN_PW 환경변수가 없습니다"
else
  F1=$(call "{\"action\":\"eventSave\",\"pw\":\"$ADMIN_PW\",\"event\":{\"id\":\"x\",\"title\":\"x\",\"opens_on\":\"2026-01-01\",\"closes_on\":\"2026-01-02\"}}")
  chk "eventSave 얼림" "$(jqn 'd.get("error")' "$F1")" "moved-to-church-admin"
  F2=$(call "{\"action\":\"eventSetNote\",\"pw\":\"$ADMIN_PW\",\"id\":0,\"note\":\"x\"}")
  chk "eventSetNote 얼림" "$(jqn 'd.get("error")' "$F2")" "moved-to-church-admin"
  F3=$(call "{\"action\":\"eventImport\",\"pw\":\"$ADMIN_PW\",\"event_id\":\"definitely-not-a-real-event\",\"rows\":[]}")
  chk "eventImport 얼림" "$(jqn 'd.get("error")' "$F3")" "moved-to-church-admin"
fi
```

Claude 가 비밀번호 없이 돌린다(개발 `api` 는 아직 옛 판이다):
```bash
cd /c/Projects/bible-memorize-church-app-v2 && bash tests/event-smoke.sh 2>&1 | grep -E "얼림|거부|^통과"
```
Expected: 5) 의 거부 넷은 `o` · `- eventSave·eventSetNote·eventImport 얼림 ... 건너뜀 (ADMIN_PW 환경변수가 없습니다)` · 끝줄 `통과 … · 건너뜀 … · 실패 0`.

**친구가 자기 Git Bash 창에서** 개발 관리자 비밀번호로 돌린다(비밀번호가 대화 기록에 남지 않게 — 결과 줄만 Claude 에게 붙여 준다):
```bash
cd /c/Projects/bible-memorize-church-app-v2
read -rs ADMIN_PW && export ADMIN_PW        # 개발 관리자 비밀번호를 친다(화면에 안 보인다)
bash tests/event-smoke.sh 2>&1 | grep -E "얼림|^통과"
unset ADMIN_PW
```
Expected(실패 먼저):
```
  X eventSave 얼림 = bad-event-id  (기대 moved-to-church-admin)
  X eventSetNote 얼림 = bad-args  (기대 moved-to-church-admin)
  X eventImport 얼림 = not-found  (기대 moved-to-church-admin)
통과 … · 건너뜀 0 · 실패 3
```
`unauthorized` 가 나오면 비밀번호가 틀린 것이다. `no-password-set` 이 나오면 개발에 `ADMIN_SECRET` 이 없는 것이다. 그때는 개발 5-1 을 건너뛰고 Step 8 운영에서 본다(친구와 정한다).

- [ ] **Step 3: 성경암송 `api` — 비밀번호 확인 바로 뒤에서 돌려보낸다 · 커밋 ①**

앵커 확인:
```bash
cd /c/Projects/bible-memorize-church-app-v2
F=supabase/functions/api/index.ts
grep -cF '// ---------- eventSetNote: 담당자 메모 ----------' $F
grep -cF 'async function eventSetNote(b: any) {' $F
grep -cF 'async function eventSave(b: any) {' $F
grep -cF 'async function eventImport(b: any) {' $F
grep -c 'EVT_MOVED' $F
grep -A2 -F 'async function eventSetNote(b: any) {' $F; grep -A2 -F 'async function eventSave(b: any) {' $F; grep -A2 -F 'async function eventImport(b: any) {' $F
```
Expected: `1` · `1` · `1` · `1` · `0` · 세 함수 모두 첫 두 줄이 `  const err = adminError(b);` · `  if (err) return { ok: false, error: err };` 이다.

Edit 네 번:

① old(한 줄):
```ts
// ---------- eventSetNote: 담당자 메모 ----------
```
new:
```ts
// ---------- 교회 어드민으로 옮긴 쓰기 액션 (얼림) ----------
// ⚠️ 이벤트 명단을 고치는 곳은 교회 어드민(admin.onlybible.kr · 「성경필사(암송)」) **한 곳**이다.
//    eventImport 는 돌 때마다 그 회차의 source='import' 줄을 **전부 지우고** 다시 넣는다 —
//    살아 있으면 어드민에서 고친 것·더한 분·줄 id·이어 둔 계정이 한 번에 사라진다.
//    화면 단추만 닫으면 관리자 비밀번호로 API 를 직접 부르는 길이 남아 **서버에서** 막는다. **되살리지 말 것.**
//    자리: 비밀번호 확인 **바로 뒤** — 무엇도 읽거나 쓰기 전에. 비밀번호 없는 호출은 예전처럼 unauthorized 다
//    (tests/event-smoke.sh 5) 기대값 그대로 · 얼림은 5-1 이 비밀번호로 본다).
//    남긴 것: eventRoster(읽기) · eventExcuse(자격 인정 — 가을 말씀 동행용, 다음 단계에서 옮긴다) · 성도님 앱 액션 전부.
//    설계 docs/superpowers/specs/2026-09-29-church-admin-bible-events-design.md §4 · docs/notes/bible-events-admin.md
//    (함수 몸통은 옛 동작 기록으로 남겨 둔다 — 원문은 church-admin docs/port/event-roster-legacy.md)
const EVT_MOVED = new Set(["eventImport", "eventSave", "eventSetNote"]);

// ---------- eventSetNote: 담당자 메모 ----------
```
② old(세 줄):
```ts
async function eventSetNote(b: any) {
  const err = adminError(b);
  if (err) return { ok: false, error: err };
```
new:
```ts
async function eventSetNote(b: any) {
  const err = adminError(b);
  if (err) return { ok: false, error: err };
  if (EVT_MOVED.has("eventSetNote")) return { ok: false, error: "moved-to-church-admin" };
```
③ old(세 줄):
```ts
async function eventSave(b: any) {
  const err = adminError(b);
  if (err) return { ok: false, error: err };
```
new:
```ts
async function eventSave(b: any) {
  const err = adminError(b);
  if (err) return { ok: false, error: err };
  if (EVT_MOVED.has("eventSave")) return { ok: false, error: "moved-to-church-admin" };
```
④ old(세 줄):
```ts
async function eventImport(b: any) {
  const err = adminError(b);
  if (err) return { ok: false, error: err };
```
new:
```ts
async function eventImport(b: any) {
  const err = adminError(b);
  if (err) return { ok: false, error: err };
  if (EVT_MOVED.has("eventImport")) return { ok: false, error: "moved-to-church-admin" };
```
(맨 `return` 한 줄만 두면 그 아래가 「닿지 않는 코드」가 된다. 그래서 `Set` 을 한 번 거친다. 몸통은 그대로 두고, 얼린 목록은 한 곳에서 본다.)

```bash
cd /c/Projects/bible-memorize-church-app-v2
grep -c 'EVT_MOVED.has(' supabase/functions/api/index.ts
git diff --stat -- supabase/functions/api/index.ts tests/event-smoke.sh
git status --short -- supabase/functions/api/index.ts tests/event-smoke.sh
```
Expected: `3` · `index.ts | 15 +` · `event-smoke.sh | 17 +` · 두 파일 ` M`(2026-09-29 사본에 대어 잰 수). 다른 헝크가 섞였으면 멈춘다.
(`node --check` 로 `index.ts` 를 검사하지 않는다. TS 문법 오류를 못 잡는다. 문법 검사는 Step 4 의 **개발 배포**가 하고, 배포가 실패하면 멈춘다.)

커밋 ① — 경로를 못 박는다(푸시하지 않는다):
```bash
V2=/c/Projects/bible-memorize-church-app-v2
git -C $V2 commit -m "feat(이벤트): 명단 쓰기 셋을 교회 어드민으로 — eventImport·eventSave·eventSetNote 는 moved-to-church-admin(얼림)" -m "비밀번호 확인 바로 뒤에서 돌려보낸다(비밀번호 없는 호출은 예전처럼 unauthorized) · 남긴 것 eventRoster·eventExcuse · 설계 docs/superpowers/specs/2026-09-29-church-admin-bible-events-design.md §4 · tests/event-smoke.sh 5-1" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- supabase/functions/api/index.ts tests/event-smoke.sh
git -C $V2 show --stat HEAD
git -C $V2 rev-parse HEAD > ~/.church-admin/launch-bible-events/v2-freeze-sha.txt; cat ~/.church-admin/launch-bible-events/v2-freeze-sha.txt
```
Expected: 파일 둘(`supabase/functions/api/index.ts` · `tests/event-smoke.sh`)만. 다른 파일이 보이면 **되돌리지 말고** 그 파일의 세션에 알리고 친구와 정한다.
⚠️ 이 순간부터 공용 체크아웃의 `api/index.ts` 에 얼림이 들어 있다. 다른 세션이 거기서 운영 `api` 를 배포하면 얼림이 먼저 나간다. Step 0-5 에서 받은 약속(배포 미루기)을 믿고, 아래를 쉬지 않고 이어 간다.

- [ ] **Step 4: 성경암송 개발 `api` 배포 — 커밋한 그대로 · 스모크 통과**

`supabase functions deploy` 는 어디서 돌리든 **그 폴더의 작업 트리**를 올린다. 그래서 남의 커밋 안 된 코드가 함께 나갈 수 있다(2026-09-23 실제로 당했다). 그러니 내 커밋을 깨끗한 폴더에 풀고 `--workdir` 로 올린다.
```bash
L=~/.church-admin/launch-bible-events; V2=/c/Projects/bible-memorize-church-app-v2; MINE=$(cat $L/v2-freeze-sha.txt)
rm -rf "$L/v2-api" "$L/pre-dev"; mkdir -p "$L/v2-api" "$L/pre-dev/supabase"
git -C $V2 archive $MINE supabase/functions/api | tar -x -C "$L/v2-api"
ls "$L/v2-api/supabase/functions/api"
# 올리기 전: 지금 개발에 떠 있는 것이 내 커밋 바로 앞과 같은가(다르면 다른 세션이 개발에 시험 중인 코드다)
supabase functions download api --project-ref ktpwthwqzgcqcrmsafdo --use-api --workdir "$(cygpath -w "$L/pre-dev")"
F=$(find "$L/pre-dev" -name index.ts | head -1); echo "$F"
diff <(tr -d '\r' < "$F") <(git -C $V2 show $MINE^:supabase/functions/api/index.ts | tr -d '\r') > "$L/pre-dev.diff"; wc -l < "$L/pre-dev.diff"
```
Expected: `index.ts` · 내려받은 경로 한 줄 · `0`(차이 없음).
0 이 아니면 `$L/pre-dev.diff` 를 친구에게 보여 준다. 올리면 다른 세션이 개발에 올려 둔 시험 코드를 덮게 된다. Step 0-5 의 그 세션에 알리고, 괜찮다는 답을 받은 뒤에 올린다.

```bash
L=~/.church-admin/launch-bible-events
supabase functions deploy api --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo --workdir "$(cygpath -w "$L/v2-api")"
rm -rf "$L/dl-dev"; mkdir -p "$L/dl-dev/supabase"
supabase functions download api --project-ref ktpwthwqzgcqcrmsafdo --use-api --workdir "$(cygpath -w "$L/dl-dev")"
grep -c 'EVT_MOVED.has(' "$(find "$L/dl-dev" -name index.ts | head -1)"
cd /c/Projects/bible-memorize-church-app-v2 && bash tests/event-smoke.sh 2>&1 | tail -12
```
Expected: `Deployed Functions on project ktpwthwqzgcqcrmsafdo: api` · `3` · 스모크(비밀번호 없이) 5) 거부 넷 `o` · 5-1 건너뜀 · 7) 남의 경로 `getVerses`·`ranking`·`boardList` = True · 끝줄 `통과 … · 건너뜀 … · 실패 0`.
배포 성공 문구는 **무엇이** 올라갔는지 말해 주지 않는다. 내려받아 본 `3` 이 증거다. 배포가 실패하면(문법) 고쳐 새 커밋을 만들고(`v2-freeze-sha.txt` 를 새 해시로) 이 단계를 다시 한다.

**친구가 자기 Git Bash 창에서** 다시(개발 비밀번호):
```bash
cd /c/Projects/bible-memorize-church-app-v2
read -rs ADMIN_PW && export ADMIN_PW
bash tests/event-smoke.sh 2>&1 | grep -E "얼림|^통과"
unset ADMIN_PW
```
Expected: `o eventSave 얼림 = moved-to-church-admin` · `o eventSetNote 얼림 = …` · `o eventImport 얼림 = …` · `통과 … · 건너뜀 0 · 실패 0`.

- [ ] **Step 5: 성경암송 글 다섯 곳 — 스크립트 준비 · 앵커 확인(`--check` · 아무것도 쓰지 않는다)**

이 단계는 파일을 **쓰지 않는다.** 쓰기는 Step 11(교회 어드민 푸시 뒤)에서 한다. 여기서는 모든 앵커가 한 번씩 맞는지만 얼리기 **전에** 확인한다.

① 새 노트의 원고를 저장소 밖에 둔다 — Write 로 `C:\Users\sewki\.church-admin\launch-bible-events\bible-events-admin.md`(`{TODAY}` 는 스크립트가 오늘 날짜로 바꾼다):
```markdown
# 성경필사(암송) 이벤트 명단 — 교회 어드민으로 옮김

> **언제 읽나:** `events`·`event_signups`(사순절·썸머 써 바이블·소책자·가을 말씀 동행 명단)를 고치거나,
> `admin-event.html`·`api` 의 `event*` 관리 액션·`supabase/event_stamp_2026.sql` 을 손댈 때.
> 상태: **운영 — {TODAY} 개시** · 성경암송 쪽 쓰기 셋 얼림(`EVT_MOVED`)
> 설계 `docs/superpowers/specs/2026-09-29-church-admin-bible-events-design.md` ·
> 코드 `c:\Projects\church-admin`(`js/menus/bibleevent/` · `supabase/functions/church-admin/events-*.ts`) ·
> 옛 동작 원문 그 저장소 `docs/port/event-roster-legacy.md` · 그 저장소 `CLAUDE.md` 「성경필사(암송)」 절

## 무엇이 어디로

| 일 | 이제(교회 어드민 「성경필사(암송)」 · 역할 `bibleevent`) | 전(성경암송) |
|---|---|---|
| 회차 만들기·설정(이름·기간·상태·공개 종료일) | 📋 회차·명단 → 회차 설정 | `admin-event.html` · `eventSave` |
| 담당자 메모 | 📋 줄 「고치기」 | `admin-event.html` 「메모」 · `eventSetNote` |
| 한 분 더하기 | 📋 「＋ 한 분 더하기」(교인명부로 찾아 채움) | 관리자 API `eventImport` 손 작업 · 직접 SQL |
| 명단 여러 줄 넣기 | 📤 명단 올리기(더하기만 — 통째 바꾸기 없음) | `eventImport`(그 회차 import 줄을 지우고 다시) |
| 사람별 이력·통계 | 👤 사람별 이력·통계 | 없음 |
| 자격 인정·미신청 목록(가을 말씀 동행) | — | **그대로** `admin-event.html` · `eventExcuse`·`eventRoster`(다음 단계에서 옮긴다) |
| 성도님 앱(신청·취소·명단·도장판) | — | **그대로** `eventOpenList`·`eventSignup`·`eventDrop`·`eventRosterPublic`·`eventStamps` |

## ⚠️ 함정

- **쓰는 곳은 하나.** `eventImport` 는 돌 때마다 그 회차의 `source='import'` 줄을 **전부 지우고** 다시 넣는다(2026-09-29 에 2,834행 중 2,833행이 import 였다).
  살아 있으면 어드민에서 고친 것·더한 분·줄 id·이어 둔 계정이 한 번에 사라진다. 그래서 {TODAY} 에
  `eventImport`·`eventSave`·`eventSetNote` 를 얼렸다(`api` `EVT_MOVED`). 비밀번호 확인 **바로 뒤**에서 `moved-to-church-admin` 을 돌려준다.
  비밀번호 없는 호출은 예전처럼 `unauthorized` 다(`tests/event-smoke.sh` 5) · 얼림은 5-1 이 `ADMIN_PW` 로 본다).
  화면 단추만 닫으면 관리자 비밀번호로 API 를 직접 부르는 길이 남는다. 그래서 **서버에서** 막았다. **되살리지 말 것.**
- ⚠️ **`api` 를 배포하는 세션은 얼림이 든 판에서 배포할 것.** 옛 작업 트리(얼림 커밋 전)에서 `supabase functions deploy api` 를 하면 얼림이 조용히 풀린다.
  배포 뒤에는 내려받아 `EVT_MOVED.has(` 가 셋인지 본다.
- **다른 쓰는 길도 닫았다:** `supabase/event_stamp_2026.sql` 은 `on conflict do update` 로 가을 회차의 제목·기간·공개 종료일·needs·copy 를 덮는다.
  그래서 어드민 개시 뒤에는 다시 돌리지 않는다(파일 머리에 적었다). 직접 SQL 로 `event_signups` 에 줄을 넣지 않는다.
  Claude 메모리의 「몇 분 더하기(eventRoster 백업 → eventImport)」 절차도 「교회 어드민 ＋ 한 분 더하기」로 고쳤다.
- **가을 말씀 동행 10/11 개시**(draft → open)도 교회 어드민 회차 설정에서 한다(가을 설계 §13-12). 저장하면 「이 회차가 성도님 첫 화면에 나타납니다」 확인 창이 뜬다.
- **표는 그대로다** — 칸·제약·RLS 를 바꾸지 않는다. 담당자가 넣은 줄은 `source='import'` + `note` 앞 `담당자가 더함`/`명단 올리기`/`소속: 교인명부로 채움`.
  `note`(담당자 메모)는 성도님 응답에 절대 싣지 않는다. `memo`(성도님 한 줄)와 다른 칸이다.
- **앱 계정은 만들지 않는다** — 이름·소속이 같은 계정이 이미 있으면 잇기만 한다(주간 리포트 「신규 인원」이 부풀지 않게).
  이어진 줄은 성도님 앱 「📋 이미 내신 것」에 보이고, 등록 기간 중인 회차면 성도님이 앱에서 고치거나 취소할 수 있다.
- `admin-event.html` 에 남은 것: 명단 보기·인쇄·CSV·자격 인정(`eventExcuse` — 아직 `prompt()`/`alert()`). 얼리는 쪽이라 손대지 않았다. 옮길 때 직접 만든 창으로 바꾼다.
- **개인정보 안내:** 성경암송 `privacy/` 는 고치지 않았다(친구 결정 2026-09-29 — 담당자가 어드민에서 보는 일이고 앱이 새로 모으는 것이 없다).
  담당자 쪽 안내는 교회 어드민 `privacy.html` 7번이다. (참고: `privacy/` 는 이벤트 명단에 「이름과 소속」이 보인다고 적지만 실제로는 직분도 보인다. 전부터 있던 차이다.)
- **되돌리기:** 어드민에서 한 줄이라도 더하거나 고친 뒤에는 얼림을 풀지 않는다. `eventImport` 한 번에 그 줄들이 지워진다.

## 남은 것(다음 단계)

- 가을 말씀 동행의 자격 인정(`eventExcuse`)·미신청 목록을 교회 어드민으로 옮긴다. 그다음 `admin.html` 「🎉 이벤트 관리」 타일을 새 주소로 바꾼다(설계 §4-4). 지금 타일 설명(「회차 만들기 · …」)은 얼린 뒤와 맞지 않는다.
- 회차 차례(`sort_order`)는 어드민 회차 설정에 없다. 새 회차는 0 이고, 바꾸려면 개발 먼저 SQL 로 한다.
```

② 스크립트 — Write 로 `C:\Users\sewki\.church-admin\launch-bible-events\freeze_v2_docs.py`:
```python
# -*- coding: utf-8 -*-
# 성경필사(암송) 운영 개시 — 성경암송 쪽 글 다섯 곳을 한 번에 고친다.
#   python freeze_v2_docs.py --check   앵커만 본다(아무 파일도 안 쓴다) — 얼리기 전에(계획 Task 15 Step 5)
#   python freeze_v2_docs.py           쓴다 — 교회 어드민 푸시 뒤에(Step 11)
# 앵커가 **정확히 한 번** 맞을 때만 쓰고, 하나라도 어긋나면 아무 파일도 안 쓰고 멈춘다.
import datetime, os, sys

V2 = r"C:\Projects\bible-memorize-church-app-v2"
SRC_NOTE = os.path.expanduser(r"~\.church-admin\launch-bible-events\bible-events-admin.md")
CHECK = "--check" in sys.argv
TODAY = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).strftime("%Y-%m-%d")   # 한국 날짜
out = {}

def load(rel):
    raw = open(os.path.join(V2, rel), "rb").read().decode("utf-8")
    return raw, ("\r\n" if "\r\n" in raw else "\n"), raw.replace("\r\n", "\n")

def patch(rel, pairs, cuts=()):
    raw, nl, s = load(rel)
    for start, end, repl in cuts:                       # start 부터 end 앞까지 걷어 낸다
        if s.count(start) != 1 or s.count(end) != 1: sys.exit(f"{rel}: 걷어 낼 자리가 한 번이 아니다 — 멈춘다: {start[:40]!r}")
        a, b = s.index(start), s.index(end)
        if a > b: sys.exit(f"{rel}: 걷어 낼 자리 차례가 틀렸다 — 멈춘다")
        s = s[:a] + repl + s[b:]
    for old, new in pairs:
        n = s.count(old)
        if n != 1: sys.exit(f"{rel}: 한 번이어야 하는데 {n}번 — 멈춘다: {old[:60]!r}")
        s = s.replace(old, new.replace("{TODAY}", TODAY))
    out[rel] = s.replace("\n", nl).encode("utf-8")

def insert_after_prefix(rel, prefix, line, must_absent):
    raw, nl, s = load(rel)
    if must_absent in s: sys.exit(f"{rel}: 이미 들어 있다 — 멈춘다: {must_absent[:40]!r}")
    lines = s.split("\n")
    hits = [i for i, l in enumerate(lines) if l.startswith(prefix)]
    if len(hits) != 1: sys.exit(f"{rel}: {prefix[:30]!r} 로 시작하는 줄이 {len(hits)}개 — 멈춘다")
    lines.insert(hits[0] + 1, line.replace("{TODAY}", TODAY))
    out[rel] = "\n".join(lines).replace("\n", nl).encode("utf-8")

def new_file(rel, src):
    if os.path.exists(os.path.join(V2, rel)): sys.exit(f"{rel}: 이미 있다 — 멈춘다")
    if not os.path.exists(src): sys.exit(f"원고가 없다 — 멈춘다: {src}")
    out[rel] = open(src, encoding="utf-8").read().replace("{TODAY}", TODAY).encode("utf-8")

# ① admin-event.html — 저장·메모 단추 자리에 페이지 안 띠(팝업 아님) · 회차 설정은 보기만
patch("admin-event.html", [
  ("    계획: docs/superpowers/plans/2026-09-10-event-platform.md (4단계)\n",
   "    계획: docs/superpowers/plans/2026-09-10-event-platform.md (4단계)\n"
   "    ⚠️ 교회 어드민으로 옮김({TODAY}): 회차 만들기·설정·담당자 메모·명단 고치기는 admin.onlybible.kr 「성경필사(암송)」.\n"
   "       서버 eventSave·eventSetNote·eventImport 는 moved-to-church-admin(얼림). 이 화면에 남은 것은\n"
   "       명단 보기·인쇄·CSV·자격 인정(eventExcuse)뿐 — 설계 docs/superpowers/specs/2026-09-29-church-admin-bible-events-design.md §4\n"),
  (".ok:empty,.note:empty{display:none}\n",
   ".ok:empty,.note:empty{display:none}\n"
   "/* 교회 어드민으로 옮긴 자리 — 저장·메모 단추 대신 페이지 안 띠(팝업 아님) */\n"
   ".moved{background:#eef1f8;border:1.5px solid #1a3a6b;border-radius:10px;padding:11px 13px;\n"
   "  font-size:14px;color:#1a3a6b;line-height:1.7;margin:12px 0}\n"
   ".moved a{color:#1a3a6b;font-weight:800}\n"
   "fieldset.ro{border:0;padding:0;margin:0;min-width:0}\n"
   "fieldset.ro input,fieldset.ro select{background:#f7f8fb;color:#232730;opacity:1}\n"),
  ('const EV_STATUS_KO = { draft:"준비 중", open:"열림", closed:"마감", archived:"보관" };\n',
   'const EV_STATUS_KO = { draft:"준비 중", open:"열림", closed:"마감", archived:"보관" };\n'
   "// ⚠️ 회차 만들기·설정·담당자 메모·명단 고치기는 교회 어드민 한 곳에서 한다({TODAY} 부터).\n"
   "//    서버 eventSave·eventSetNote·eventImport 는 moved-to-church-admin 을 돌려준다(얼림) — 여기에 저장 단추를\n"
   "//    되살려도 저장되지 않는다. 남은 쓰기는 자격 인정(eventExcuse)뿐(가을 말씀 동행 · 다음 단계에서 옮긴다).\n"
   "//    docs/notes/bible-events-admin.md\n"
   "const MOVED_HTML = `<div class=\"moved no-print\">회차 만들기·설정과 담당자 메모는 <b>교회 어드민 → 성경필사(암송)</b>에서 합니다 —\n"
   "  <a href=\"https://admin.onlybible.kr/#/be-roster\" target=\"_blank\" rel=\"noopener\">admin.onlybible.kr</a>\n"
   "  (카카오 로그인 · 「성경필사(암송)」 역할)</div>`;\n"),
  ('      <p class="sub">아직 만든 회차가 없습니다. 아래에서 새 회차를 만드세요.</p></div>`;\n',
   '      <p class="sub">아직 만든 회차가 없습니다. 회차는 교회 어드민에서 만듭니다.</p></div>`;\n'),
  ('  return `<div class="card no-print">\n    <h2>${ev ? "회차 고치기" : "새 회차 만들기"}</h2>\n',
   "  // ⚠️ 회차 만들기·설정은 교회 어드민으로 옮겼다 — 여기서는 보기만 한다(서버 eventSave 는 얼렸다).\n"
   '  if(!ev) return `<div class="card no-print"><h2>회차</h2>${MOVED_HTML}</div>`;\n'
   '  return `<div class="card no-print">\n'
   '    <h2>회차 설정 <span style="font-weight:400;color:#8a93a3;font-size:13px">(보기만)</span></h2>\n'),
  ('    <div class="ok" id="f-ok"></div><div class="err" id="f-err"></div>\n    <div class="form">\n',
   '    <fieldset class="ro" disabled><div class="form">\n'),
  ('    </div>\n    <div class="bar">\n      <button class="btn p" id="f-save">${ev ? "고치기" : "만들기"}</button>\n'
   '      ${ev ? `<button class="btn" id="f-new">+ 새 회차</button>` : ""}\n    </div>\n',
   '    </div></fieldset>\n    ${MOVED_HTML}\n'),
  ('          <button class="btn no-print" data-note="${r.id}">메모</button>\n', ""),
  ('  const save = document.getElementById("f-save");\n  if(save) save.addEventListener("click", saveEvent);\n'
   '  const nw = document.getElementById("f-new");\n'
   '  if(nw) nw.addEventListener("click", () => { evPick = ""; evRows = []; render(); });\n\n', ""),
  ('  app.querySelectorAll("[data-note]").forEach(b => b.addEventListener("click", () => {\n'
   '    const id = Number(b.getAttribute("data-note"));\n    const row = evRows.find(r => r.id === id);\n'
   '    askNote(id, row ? row.note : "");\n  }));\n', ""),
], cuts=[
  ("async function askNote(id, cur){", "// ---------- 배선 ----------",
   "// 담당자 메모(askNote · eventSetNote)는 교회 어드민 줄 「고치기」로 옮겼다.\n\n"),
  ("async function saveEvent(){", 'logoutBtn.addEventListener("click"',
   "// 회차 저장(saveEvent · eventSave)은 교회 어드민 회차 설정으로 옮겼다 — 되살려도 서버가 moved-to-church-admin 을 돌려준다.\n\n"),
])

# ② event_stamp_2026.sql — 다시 돌리지 말 것 · 개시 절차
patch("supabase/event_stamp_2026.sql", [
  ("-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키를 절대 넣지 마세요.\n",
   "-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키를 절대 넣지 마세요.\n"
   "--\n"
   "-- ⚠️⚠️ 교회 어드민 개시({TODAY}) 뒤에는 **이 파일을 다시 돌리지 말 것.**\n"
   "--    회차 설정(제목·기간·공개 종료일)의 원본은 이제 교회 어드민(admin.onlybible.kr → 성경필사(암송) → 📋 회차 설정)이다.\n"
   "--    아래 on conflict do update 가 어드민에서 고친 제목·기간·공개 종료일·needs·copy 를 **조용히 덮는다.**\n"
   "--    자격 규칙(needs)·문구(copy)를 꼭 고쳐야 하면 개발에서 먼저 — 그때도 어드민에서 고친 칸을 이 파일에 먼저 옮겨 적는다.\n"
   "--    (docs/notes/bible-events-admin.md)\n"),
  ("-- ⚠️ status 는 **draft** 로 넣는다. 개시는 2026-10-11 아침에 담당자가\n"
   "--    admin-event.html 에서 draft → open 으로 한 번 바꾸는 것이다(사람이 손으로 한다).\n",
   "-- ⚠️ status 는 **draft** 로 넣는다. 개시는 2026-10-11 아침에 담당자가\n"
   "--    교회 어드민 → 성경필사(암송) → 📋 회차 설정에서 「준비 중 → 열림」으로 한 번 바꾸는 것이다(사람이 손으로 한다).\n"
   "--    admin-event.html 의 회차 저장은 {TODAY} 에 얼렸다(eventSave → moved-to-church-admin).\n"),
])

# ③ 가을 설계 §13-12 — 개시 행위의 자리 (Step 0-3: 10/11 이 지났으면 이 한 쌍을 주석으로 막고 돌린다)
patch("docs/superpowers/specs/2026-09-23-autumn-streak-event-design.md", [
  ("12. **2026-10-11 아침 — `admin-event.html` 에서 draft → open 한 번.**\n",
   "12. **2026-10-11 아침 — 교회 어드민(admin.onlybible.kr) → 성경필사(암송) → 📋 회차·명단 → 「가을 말씀 동행」 회차 설정에서 「준비 중 → 열림」 한 번.**\n"
   "    ({TODAY} 교회 어드민 개시로 `admin-event.html` 의 회차 저장(`eventSave`)은 얼렸다. 저장하면 「이 회차가 성도님 첫 화면에 나타납니다」\n"
   "    확인 창이 뜬다 — 「보이게 하기」를 누른다. 「성경필사(암송)」 역할이나 총괄 관리자만 할 수 있다.)\n"),
])

# ④ 성경암송 CLAUDE.md 표 — 「교회 어드민」 줄 다음에 한 줄(두 겹 규칙: 한 줄 + 읽을 것)
insert_after_prefix("CLAUDE.md", "| 교회 어드민(admin.onlybible.kr",
  "| 이벤트 명단(사순절·썸머·소책자·가을 말씀 동행 — `events`·`event_signups`) — **{TODAY} 교회 어드민 「성경필사(암송)」으로 옮겼다** · "
  "`eventImport`·`eventSave`·`eventSetNote` 는 얼렸다(되살리지 말 것 · `api` 는 얼림이 든 판에서만 배포) | "
  "`docs/notes/bible-events-admin.md` · 설계 `docs/superpowers/specs/2026-09-29-church-admin-bible-events-design.md` |",
  "| 이벤트 명단(사순절·썸머·소책자·가을 말씀 동행")

# ⑤ 성경암송 docs/notes — 새 노트(원고는 저장소 밖에 둔 것)
new_file("docs/notes/bible-events-admin.md", SRC_NOTE)

if CHECK:
    print("앵커 모두 한 번씩 맞음 — 아무 파일도 쓰지 않았다:", ", ".join(out))
    sys.exit(0)
for rel, data in out.items():                     # 모든 앵커가 맞은 뒤에만 쓴다
    os.makedirs(os.path.dirname(os.path.join(V2, rel)) or V2, exist_ok=True)
    open(os.path.join(V2, rel), "wb").write(data)
    print("고침", rel)
print("날짜", TODAY)
```

③ 앵커만 본다:
```bash
PYTHONIOENCODING=utf-8 python ~/.church-admin/launch-bible-events/freeze_v2_docs.py --check
git -C /c/Projects/bible-memorize-church-app-v2 status --short -- admin-event.html supabase/event_stamp_2026.sql docs/superpowers/specs/2026-09-23-autumn-streak-event-design.md CLAUDE.md docs/notes/bible-events-admin.md
```
Expected: `앵커 모두 한 번씩 맞음 — 아무 파일도 쓰지 않았다: admin-event.html, supabase/event_stamp_2026.sql, docs/superpowers/specs/2026-09-23-autumn-streak-event-design.md, CLAUDE.md, docs/notes/bible-events-admin.md` · 둘째 명령은 아무것도 안 찍는다.
(`PYTHONIOENCODING` 이 없으면 Git Bash 창에 한글이 깨져 찍힌다. 그래도 파일 내용은 UTF-8 이다.)
「멈춘다」가 나오면 그 앵커를 `grep -n` 으로 찾아 글자가 어떻게 달라졌는지 본다. 그리고 스크립트의 그 old 만 고쳐 다시 `--check` 한다. Step 0-3 에서 10/11 이 지났으면 ③ `patch(...)` 한 덩이를 주석으로 막는다.
2026-09-29 에 ①~③ 의 앵커가 모두 한 번씩 있는 것을 확인했다. ①을 파일 사본에 돌리면 고친 `admin-event.html` 의 인라인 스크립트가 `node --check` 를 통과했다(초안 확인).

- [ ] **Step 6: 운영 SQL — 역할 한 줄(004) · 노출 점검 0행**

```bash
cat ~/.church-admin/supa-prod/supabase/.temp/project-ref; echo          # xnomlgydifiqiybervtf 여야 한다 — 다르면 멈춘다
supabase --workdir ~/.church-admin/supa-prod db query --linked "select count(*) from users"   # 사백이 넘으면 운영(스물 남짓이면 개발 — 멈춘다)
supabase --workdir ~/.church-admin/supa-prod db query --linked -f C:/Projects/church-admin/.worktrees/bible-events/supabase/sql/004_bibleevent_role.sql
```
Expected: 마지막 표 `role bibleevent | 1` · `label 성경필사(암송) | 1`.
⚠️ `-f` 는 **절대 경로**로 준다. 이 파일은 `admin_roles` 한 줄뿐이다. `events`·`event_signups` 는 건드리지 않는다. 담당자가 아직 아무도 이 역할을 갖지 않으니, 이것만으로는 아무것도 열리지 않는다.

```bash
supabase --workdir ~/.church-admin/supa-prod db query --linked -f C:/Projects/church-admin/.worktrees/bible-events/supabase/sql/check-authenticated-exposure.sql
```
Expected: 결과 행이 **하나도 없다**(머리줄만 있거나 빈 결과). 한 줄이라도 나오면 **여기서 멈춘다.** 그 자리를 개발 → 운영으로 막은 뒤 다시 시작한다(교회 어드민 CLAUDE.md 「같은 프로젝트의 다른 앱」).

- [ ] **Step 7: 얼리기 직전 확인 — 교회 어드민 main 이 움직이지 않았나 · 운영 `api` 가 내 커밋 바로 앞과 같은가**

```bash
cd /c/Projects/church-admin
git fetch origin
git log --oneline main..origin/main
git log --oneline origin/main..main
git log --oneline bible-events..main
git -C .worktrees/bible-events status --short
```
Expected: 넷 모두 **아무것도 안 찍는다.** 하나라도 찍으면 Step 1 로 돌아간다(따라잡기 → 개발 다시 시험). 운영에는 아직 아무것도 얼리지 않았다.

```bash
L=~/.church-admin/launch-bible-events; V2=/c/Projects/bible-memorize-church-app-v2; MINE=$(cat $L/v2-freeze-sha.txt)
rm -rf "$L/pre-prod"; mkdir -p "$L/pre-prod/supabase"
supabase functions download api --project-ref xnomlgydifiqiybervtf --use-api --workdir "$(cygpath -w "$L/pre-prod")"
F=$(find "$L/pre-prod" -name index.ts | head -1); echo "$F"
diff <(tr -d '\r' < "$F") <(git -C $V2 show $MINE^:supabase/functions/api/index.ts | tr -d '\r') > "$L/pre-prod.diff"; wc -l < "$L/pre-prod.diff"
```
Expected: `0` — 지금 운영에 떠 있는 것이 내 커밋 바로 앞과 같다. **0 이 아니면 운영에 올리지 않는다.**
차이는 둘 중 하나다. ① 커밋은 됐는데 운영에는 아직 안 나간 남의 코드다(내 배포가 그것까지 내보낸다). ② 운영에만 있고 커밋이 없는 코드다(내 배포가 그것을 지운다). `$L/pre-prod.diff` 를 친구에게 보여 드리고, 그 코드의 주인과 정한 뒤에만 간다.

친구에게 알린다: 「지금부터 성경암송 명단 쓰기를 얼리고, 곧바로 교회 어드민을 엽니다. 그 사이 몇 분은 명단을 고칠 곳이 없어요.」

- [ ] **Step 8: 운영 얼리기 — 성경암송 운영 `api` 배포(같은 폴더를 그대로)**

```bash
L=~/.church-admin/launch-bible-events
supabase functions deploy api --no-verify-jwt --project-ref xnomlgydifiqiybervtf --workdir "$(cygpath -w "$L/v2-api")"
rm -rf "$L/dl-prod"; mkdir -p "$L/dl-prod/supabase"
supabase functions download api --project-ref xnomlgydifiqiybervtf --use-api --workdir "$(cygpath -w "$L/dl-prod")"
grep -c 'EVT_MOVED.has(' "$(find "$L/dl-prod" -name index.ts | head -1)"
cd /c/Projects/bible-memorize-church-app-v2 && EVT_ENV=prod bash tests/event-smoke.sh 2>&1 | tail -12
```
Expected: `Deployed Functions on project xnomlgydifiqiybervtf: api` · `3` · 스모크(운영 · 비밀번호 없이) 5) 거부 넷 `o` · 5-1 건너뜀 · 남의 경로 셋 True · `실패 0`.
**이 순간부터 옛 화면(`admin-event.html`)의 회차 저장·메모와 관리자 API `eventImport` 가 막혔다.** 교회 어드민 쓰기가 열릴 때까지(Step 9) 명단을 고칠 곳이 없다. 기다리지 말고 곧바로 Step 9 로 간다.
그동안 **친구가 자기 Git Bash 창에서** 운영 비밀번호로 확인한다(결과는 Step 10 전에 본다):
```bash
cd /c/Projects/bible-memorize-church-app-v2
read -rs ADMIN_PW && export ADMIN_PW        # 운영 관리자 비밀번호
EVT_ENV=prod bash tests/event-smoke.sh 2>&1 | grep -E "얼림|^통과"
unset ADMIN_PW
```
Expected: 얼림 셋 `o … = moved-to-church-admin` · `실패 0`.

- [ ] **Step 9: 교회 어드민 운영 함수 — 워크트리를 그대로**

Step 7 에서 워크트리가 깨끗하고 main 의 모든 것을 담고 있음을 봤다. 개발에서 시험한 바로 그 판을 올린다.
```bash
cd /c/Projects/church-admin/.worktrees/bible-events
git status --short                     # 비어야 한다 — 배포는 작업 트리를 올린다
git rev-parse HEAD > ~/.church-admin/launch-bible-events/ca-deployed-sha.txt
supabase functions deploy church-admin --no-verify-jwt --project-ref xnomlgydifiqiybervtf
L=~/.church-admin/launch-bible-events; rm -rf "$L/dl-ca-prod"; mkdir -p "$L/dl-ca-prod/supabase"
supabase functions download church-admin --project-ref xnomlgydifiqiybervtf --use-api --workdir "$(cygpath -w "$L/dl-ca-prod")"
D=$(dirname "$(find "$L/dl-ca-prod" -name index.ts | head -1)"); echo "$D"; ls "$D"
for f in $(git ls-files supabase/functions/church-admin | sed 's#supabase/functions/church-admin/##'); do
  if diff -q <(tr -d '\r' < "$D/$f" 2>/dev/null) <(git show HEAD:supabase/functions/church-admin/$f | tr -d '\r') >/dev/null; then echo "같음 $f"; else echo "다름 $f"; fi
done
grep -c 'case "evUploadSave"' "$D/index.ts"
grep -c 'case "evPerson"' "$D/index.ts"
curl -s -w "  HTTP %{http_code}\n" -X POST https://xnomlgydifiqiybervtf.supabase.co/functions/v1/church-admin -H "Content-Type: application/json" -d '{"action":"evEvents"}'
```
Expected: 빈 status · `Deployed Functions on project xnomlgydifiqiybervtf: church-admin` · 내려받은 폴더에 `index.ts`·`authz.ts`·`catalog.ts`·`ministry.ts`·`paper.ts`·`people-match.ts`·`people-query.ts`·`events-rules.ts`·`events-people.ts`·`events-stats.ts`·`events-rows.ts`·`events-upload.ts`·`events-person.ts` · 모든 줄 `같음` · `1` · `1` · `{"error":"unauthenticated"}  HTTP 401`(함수가 살아 있고 토큰 없는 요청을 막는다).
`다름` 이나 빠진 파일이 있으면 **푸시하지 않고** 다시 배포한다. 모듈 하나가 빠지면 함수가 뜰 때 모든 요청이 500 이 된다.

- [ ] **Step 10: 교회 어드민 — main 합치기 · 푸시(= 운영 화면) · 이번 판에만 있는 표식**

먼저 Step 8 의 친구 확인(운영 얼림 셋 `o`)을 본다. 아니면 멈추고 친구와 정한다(되돌리기 절 참고).
```bash
cd /c/Projects/church-admin
git fetch origin
git log --oneline main..origin/main; git log --oneline origin/main..main; git log --oneline bible-events..main
```
Expected: 셋 모두 아무것도 안 찍는다(Step 7 과 같다).
Step 7 뒤 몇 분 사이에 main 이 움직였으면(드물다), 아래 합치기 전에 먼저 한다. `main..origin/main` 이면 `git merge --ff-only origin/main`. 워크트리에서 `git merge main` → `python tools/preflight.py | tail -1` → `git diff --stat $(cat ~/.church-admin/launch-bible-events/ca-deployed-sha.txt) bible-events -- supabase/functions/church-admin` 를 본다.
그 diff 가 비어 있으면(남의 커밋이 함수를 안 건드렸으면) 계속한다. 비어 있지 않으면 **멈추고** 친구와 정한다(개발 배포·시험 뒤 운영 함수를 다시 올려야 한다). `origin/main..main` 에 남의 커밋이 있으면 멈춘다.

```bash
cd /c/Projects/church-admin
git merge --no-ff bible-events -m "merge: 성경필사(암송)(bible-events) — 회차·명단 · 명단 올리기 · 사람별 이력·통계 · 역할 bibleevent" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
test "$(git rev-parse 'main^{tree}')" = "$(git rev-parse 'bible-events^{tree}')" && echo "합친 판 = 시험한 판"
git log --oneline origin/main..main | head -40
git push origin main
sleep 5; RUN=$(gh run list -R sewoongkim1/church-admin --branch main --limit 1 --json databaseId -q '.[0].databaseId'); gh run watch -R sewoongkim1/church-admin "$RUN" --exit-status
```
Expected: 충돌 없이 합쳐짐 · `합친 판 = 시험한 판` · 나갈 목록은 **이 가지의 커밋과 합치기 커밋뿐** · Actions `배포 전 점검` → `파일마다 캐시 해시 붙이기` → Pages 모두 ✓.
(`합친 판 = 시험한 판` 이 안 찍히면 위 「main 이 움직였으면」으로 워크트리에 main 을 합친 경우다. 그 경우도 preflight 가 통과했을 때만 이어 간다.)

표식은 이전 판에 **없던 파일**(`js/menus/bibleevent/roster.js`)의 해시가 라이브와 같은지로 본다. ⚠️ 이 PC 는 `core.autocrlf=true` 라서 작업 트리 파일이 CRLF 다. 해시는 **저장소 원본**(`git show`)으로 잰다(Actions 는 LF 로 받는다):
```bash
cd /c/Projects/church-admin
for f in js/menus/bibleevent/roster.js js/menus/registry.js js/menus/system/audit.js; do
  LOCAL=$(git show HEAD:$f | python -c "import sys,hashlib;print(hashlib.sha1(sys.stdin.buffer.read()).hexdigest()[:10])")
  LIVE=$(curl -s "https://admin.onlybible.kr/?t=$(date +%s)" | grep -o "$f?v=[0-9a-f]*" | head -1 | cut -d= -f2)
  echo "$f local $LOCAL · live $LIVE $([ "$LOCAL" = "$LIVE" ] && echo 같음 || echo 다름)"
done
curl -s "https://admin.onlybible.kr/privacy.html?t=$(date +%s)" | grep -c "7. 성경필사(암송) 명단"
```
Expected: 세 줄 모두 `같음` · `1`. `live` 가 비어 있거나 `다름` 이면 CDN 이 옛 판을 주는 중이다. 1~2분 뒤 다시 본다(10분이 넘도록 다르면 Actions 로그를 본다).

친구(총괄 관리자)가 admin.onlybible.kr 에서 확인한다 — **읽기만** 한다:
- ☐ 홈에 「성경필사(암송)」 세 메뉴.
- ☐ 📋 회차 칩의 회차별 인원이 성경암송 `admin-event.html` 칩의 숫자와 **같다**(12회차 · 합계 2,834 안팎 — 그사이 앱 신청이 있었으면 그만큼 다르다).
- ☐ 가을 말씀 동행(`autumn-2026`) 칩: 「＋ 한 분 더하기」 단추가 없고 🔒 자격 회차 한 줄이 보인다.
- ☐ 한 회차를 열어 줄 하나 「고치기」 → **저장하지 않고** 「닫기」(운영 명단을 시험 삼아 바꾸지 않는다).
- ☐ 👤 통계 → 회차별 인원이 칩 숫자와 같다.

- [ ] **Step 11: 성경암송 글 다섯 곳 쓰기 · 커밋 ② · 푸시(= `admin-event.html` 안내 띠)**

```bash
V2=/c/Projects/bible-memorize-church-app-v2
git -C $V2 status --short -- admin-event.html supabase/event_stamp_2026.sql docs/superpowers/specs/2026-09-23-autumn-streak-event-design.md CLAUDE.md docs/notes/bible-events-admin.md
PYTHONIOENCODING=utf-8 python ~/.church-admin/launch-bible-events/freeze_v2_docs.py
```
Expected: 첫 명령은 아무것도 안 찍는다(` M CLAUDE.md` 가 찍히면 다른 세션이 CLAUDE.md 를 고치는 중이다 — 스크립트는 돌려도 되지만 커밋은 맨 아래 「남도 CLAUDE.md 를 고치는 중이면」 순서로 한다) · `고침 admin-event.html` · `고침 supabase/event_stamp_2026.sql` · `고침 docs/superpowers/specs/2026-09-23-autumn-streak-event-design.md` · `고침 CLAUDE.md` · `고침 docs/notes/bible-events-admin.md` · `날짜 <오늘>`.
「멈춘다」가 나오면 **아무 파일도 안 바뀐 상태**다(Step 5 뒤에 누가 그 자리를 고쳤다). 그 앵커만 고쳐 다시 돌린다.

확인:
```bash
cd /c/Projects/bible-memorize-church-app-v2
PYTHONIOENCODING=utf-8 python - <<'PY'
import re, subprocess, tempfile, os
s = open(r"C:\Projects\bible-memorize-church-app-v2\admin-event.html", encoding="utf-8").read()
blocks = re.findall(r"<script>(.*?)</script>", s, re.S)
assert len(blocks) == 1, len(blocks)
p = os.path.join(tempfile.gettempdir(), "admin-event-inline.js")
open(p, "w", encoding="utf-8").write(blocks[0])
r = subprocess.run(["node", "--check", p])
print("인라인 스크립트 문법", "통과" if r.returncode == 0 else "실패")
PY
grep -nE 'action:"eventSave"|action:"eventSetNote"|data-note=|id="f-save"|id="f-new"|askNote\(|function saveEvent|, saveEvent\)' admin-event.html || echo "옛 저장·메모 자리 없음"
grep -c 'MOVED_HTML' admin-event.html
grep -c 'data-excuse' admin-event.html
grep -c '^| 이벤트 명단(사순절·썸머·소책자·가을 말씀 동행' CLAUDE.md
git status --short -- admin-event.html supabase/event_stamp_2026.sql docs/superpowers/specs/2026-09-23-autumn-streak-event-design.md CLAUDE.md docs/notes/bible-events-admin.md
git diff --stat -- admin-event.html supabase/event_stamp_2026.sql docs/superpowers/specs/2026-09-23-autumn-streak-event-design.md CLAUDE.md
```
Expected: `인라인 스크립트 문법 통과` · `옛 저장·메모 자리 없음` · `3`(선언 하나 + 쓰는 곳 둘) · `2` 이상(자격 인정 단추·배선은 그대로) · `1` · 네 파일 ` M` 과 새 파일 `?? docs/notes/bible-events-admin.md`.
diff 통계에 줄바꿈만 바뀐 파일이 없어야 한다. 2026-09-29 사본에 돌려 잰 수는 `admin-event.html` 약 95줄(걷어 낸 `askNote`·`saveEvent` 가 대부분) · `event_stamp_2026.sql` 9줄 · 가을 설계 4줄 · `CLAUDE.md | 1 +` 다. 수백·수천 줄이면 줄 끝(CRLF)이 바뀐 것이니 멈춘다.

커밋 ② — 경로를 못 박는다. 새 파일은 경로 커밋 전에 한 번 `add` 해야 경로가 잡힌다:
```bash
V2=/c/Projects/bible-memorize-church-app-v2
git -C $V2 add -- docs/notes/bible-events-admin.md
git -C $V2 commit -m "feat(이벤트): admin-event.html 저장·메모 자리에 교회 어드민 안내 띠 · event_stamp_2026.sql 다시 돌리지 말 것 · 가을 개시는 어드민 회차 설정에서 · 문서(docs/notes/bible-events-admin.md · CLAUDE.md 표 한 줄)" -m "옛 화면은 명단 보기·인쇄·CSV·자격 인정만 남는다(팝업 아님 · 페이지 안 띠) · 설계 §4-3" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- admin-event.html supabase/event_stamp_2026.sql docs/superpowers/specs/2026-09-23-autumn-streak-event-design.md CLAUDE.md docs/notes/bible-events-admin.md
git -C $V2 show --stat HEAD
```
Expected: 다섯 파일만(`CLAUDE.md | 1 +` · `docs/notes/bible-events-admin.md | 47 +` 안팎).

남도 CLAUDE.md 를 고치는 중이면(첫 status 가 ` M CLAUDE.md` 를 찍었거나 `CLAUDE.md` diff 가 한 줄보다 많을 때) — 내 헝크만 담고 **경로 없이** 커밋한다:
```bash
V2=/c/Projects/bible-memorize-church-app-v2; L=~/.church-admin/launch-bible-events
git -C $V2 diff -U0 -- CLAUDE.md > $L/claude-all.patch
# claude-all.patch 에서 「| 이벤트 명단(사순절·썸머」 줄을 더하는 @@ 헝크 하나만 남겨 $L/claude-mine.patch 로 저장한다(편집기로) — 남의 헝크는 지운다
git -C $V2 apply --cached --unidiff-zero $L/claude-mine.patch
git -C $V2 add -- admin-event.html supabase/event_stamp_2026.sql docs/superpowers/specs/2026-09-23-autumn-streak-event-design.md docs/notes/bible-events-admin.md
git -C $V2 diff --cached --stat
```
Expected: `CLAUDE.md | 1 +` 과 내 네 파일뿐이다(다른 세션이 staged 해 둔 것이 보이면 멈추고 그 세션에 먼저 알린다). 눈으로 본 **뒤에**, 따로:
```bash
git -C /c/Projects/bible-memorize-church-app-v2 commit -m "feat(이벤트): admin-event.html 저장·메모 자리에 교회 어드민 안내 띠 · event_stamp_2026.sql 다시 돌리지 말 것 · 가을 개시는 어드민 회차 설정에서 · 문서(docs/notes/bible-events-admin.md · CLAUDE.md 표 한 줄)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git -C /c/Projects/bible-memorize-church-app-v2 show --stat HEAD
```

푸시:
```bash
V2=/c/Projects/bible-memorize-church-app-v2
git -C $V2 fetch origin
git -C $V2 status -sb | head -1
git -C $V2 log --oneline origin/main..main
```
Expected: 나갈 커밋은 **이 일의 것과 문서 커밋뿐**이다. 설계 문서 커밋(`e6b7f0d`·`4261dea` 등 `docs(교회어드민)`) · 커밋 ①(얼림) · 커밋 ②(띠·문서). 다른 세션의 기능 커밋이 섞여 있으면 **멈추고 친구에게** 묻는다. 푸시가 그것까지 성도님 화면에 내보낸다.
원격이 앞서 갔으면(`behind`) 먼저 `git -C $V2 merge --ff-only origin/main` 을 한다(안 되면 `git -C $V2 merge origin/main`).
```bash
cd /c/Projects/bible-memorize-church-app-v2
python tools/preflight.py
git push origin main
sleep 5; RUN=$(gh run list -R sewoongkim1/bible-memorize-church-app-v2 --branch main --limit 1 --json databaseId -q '.[0].databaseId'); gh run watch -R sewoongkim1/bible-memorize-church-app-v2 "$RUN" --exit-status
curl -s "https://gocheok.onlybible.kr/admin-event.html?t=$(date +%s)" | grep -c 'class="moved'
curl -s "https://gocheok.onlybible.kr/admin-event.html?t=$(date +%s)" | grep -c 'action:"eventSave"'
git rev-parse HEAD; git log --format=%H -1 --grep='moved-to-church-admin(얼림)' > ~/.church-admin/launch-bible-events/v2-freeze-sha.txt; cat ~/.church-admin/launch-bible-events/v2-freeze-sha.txt
```
Expected: preflight 모두 통과 · Actions ✓ · `1` 이상 · `0` · 얼림 커밋 해시(되돌리기에 쓴다 — 합치기로 해시가 바뀌지 않았으면 Step 3 의 것과 같다).
이번에는 `app.js`·`style.css` 를 고치지 않았다. 그래서 `bump.py` 는 돌리지 않는다. `admin-event.html` 은 `?v=` 태그를 쓰지 않는다. preflight 가 우리 파일이 아닌 곳에서 실패하면 그 내용을 친구에게 보여 준다(다른 세션의 작업 트리일 수 있다 — Actions 는 푸시된 판으로 다시 본다).
친구가 `admin-event.html` 을 Ctrl+F5 로 열어 본다: ☐ 회차 설정 칸이 회색(보기만) · 저장 단추 자리에 파란 띠 · 명단 「메모」 단추 없음 · 목록·인쇄·CSV 그대로 · 가을 회차의 「인정」 단추 그대로.

- [ ] **Step 12: 담당자에게 역할 주기(친구가 화면에서 · 이름은 어디에도 적지 않는다)**

1. 담당자께 admin.onlybible.kr 주소를 드리고 카카오로 로그인하시게 한다. 이름·소속을 적어 「승인 요청」까지 하시면 된다(이미 다른 역할로 쓰시는 분이면 이 단계는 없다).
2. 친구(총괄 관리자) → 🔑 **담당자·역할** →
   - 승인 대기 카드: 카카오 별명·사진으로 본인인지 확인 → 「성경필사(암송)」에 체크 → **승인**.
   - 이미 쓰시는 분: 그분 카드의 역할 체크에 「성경필사(암송)」을 더하고 저장.
3. ☐ 담당자 화면(담당자의 폰에서): 홈에 성경필사(암송) 세 메뉴 · 📋 회차 칩이 뜬다.
4. ☐ 📜 바꾼 기록에 「승인」 또는 「역할 바꿈」 한 줄(… → 성경필사(암송) 포함).
5. 담당자께 말로 안내한다: 「＋ 한 분 더하기」는 이름을 치고 「찾기」 · 여러 분은 📤 명단 올리기 · 회차를 성도님께 보이게 할 때 확인 창이 한 번 뜬다 · 가을 말씀 동행은 10/11 아침 회차 설정에서 「열림」으로 바꾼다.

- [ ] **Step 13: Claude 메모리 고치기 — 옛 「몇 분 더하기(eventImport)」 절차를 「교회 어드민」으로**

메모리 폴더: `C:\Users\sewki\.claude\projects\c--Projects-bible-memorize-church-app-v2\memory\`. 이 파일들은 저장소 밖이다(커밋 없음). 날짜 자리는 `@@TODAY@@` 로 쓰고 끝에 한 번에 바꾼다.
⚠️ 그 파일들에는 성도님 실명이 있다. 이 계획에는 실명이 든 줄을 옮기지 않는다. 앞머리만 맞춰 바꾼다.

먼저 앵커를 본다:
```bash
M=/c/Users/sewki/.claude/projects/c--Projects-bible-memorize-church-app-v2/memory
grep -c '^description: "OOO 썸머써바이블 이벤트에 추가해줘" 요청 처리법' $M/summer-write-bible-add-member.md
grep -c '^## 정답 절차' $M/summer-write-bible-add-member.md
grep -c '^\*\*How to apply:\*\* 다음에 같은 요청이 오면 이 파일을 먼저 읽고' $M/summer-write-bible-add-member.md
grep -c '^\*\*이미 이관된 회차에 몇 분 더하기(' $M/summer-write-bible-add-member.md
grep -c '^- 되돌릴 땐 note 의 「원래: …」를 읽어 다시 넣으면 된다' $M/event-rosters-align-to-directory.md
grep -c '^- \[썸머써바이블 명단 수동 추가\](summer-write-bible-add-member.md)' $M/MEMORY.md
test -e $M/bible-events-admin-live.md && echo EXISTS || echo FREE
```
Expected: `1` 여섯 번 · `FREE`. 다르면 그 파일을 열어 보고 앵커를 맞춘다(다른 세션이 메모리를 고쳤을 수 있다).

① `summer-write-bible-add-member.md` — Edit 셋과 sed 하나:

(가) 머리 description 한 줄 — old:
```
description: "OOO 썸머써바이블 이벤트에 추가해줘" 요청 처리법 — event_entries가 아니라 event_signups에 넣어야 화면에 보인다
```
new:
```
description: "「OOO 이벤트(썸머·사순절·소책자) 명단에 추가해줘」 요청 — @@TODAY@@ 부터 교회 어드민 성경필사(암송)에서(＋ 한 분 더하기·명단 올리기) · Claude 는 SQL·eventImport 로 넣지 않는다(얼림) · 아래는 옛 기록"
```

(나) 새 절을 맨 앞 절차 위에 — old:
```
## 정답 절차
```
new:
```
## ⚠️ @@TODAY@@ 부터 — 교회 어드민에서 한다 (이 절이 아래 모든 절차보다 앞선다)
이벤트 명단(`events`·`event_signups` — 사순절·썸머 써 바이블·소책자·가을 말씀 동행)을 고치는 곳은 이제
**교회 어드민 admin.onlybible.kr → 성경필사(암송)** 한 곳이다(역할 `bibleevent`). 성경암송 `api` 의
`eventImport`·`eventSave`·`eventSetNote` 는 비밀번호가 맞아도 `moved-to-church-admin` 만 돌려준다(얼림 · `EVT_MOVED` · 비밀번호 확인 바로 뒤).
- 「OOO 추가해줘」가 오면: **Claude 가 넣지 않는다.** 친구(또는 「성경필사(암송)」 담당자)께
  **📋 회차·명단 → 회차 고르기 → ＋ 한 분 더하기**(이름 치고 「찾기」 → 교인명부 후보를 고르면 소속·직분이 채워진다)를 안내한다.
  여러 분이면 **📤 명단 올리기**(붙여넣기 — 칸: 이름·교구·목장·직분). Claude 는 붙여 넣을 표만 만들어 드린다.
- 앱 계정은 **이미 있으면 이어 주고, 새로 만들지 않는다** — 아래 옛 절차의 `member_login` 으로 계정 만들기는 하지 않는다.
- **직접 SQL 로 `event_signups` 에 넣지 않는다**, `eventImport` 를 되살리거나 우회하지 않는다 — 그 회차 import 줄을 통째로 지워 어드민에서 고친 것·더한 분이 사라진다.
- 자격 회차(가을 말씀 동행)는 더하기·올리기가 막혀 있다(설계상) — 사정 인정은 성경암송 `admin-event.html` 「인정」(`eventExcuse`)이 아직 맡는다.
- 설계 v2 `docs/superpowers/specs/2026-09-29-church-admin-bible-events-design.md` · 메모 `docs/notes/bible-events-admin.md` · [[bible-events-admin-live]]

아래 「정답 절차」·「이미 이관된 회차에 몇 분 더하기」는 **그날 전의 기록**이다 — 표가 어떻게 생겼는지 알 때만 참고하고, 그대로 하지 말 것.

## (옛) 정답 절차 — 2026-09-19 · 이제 쓰지 않는다
```

(다) 끝의 How to apply 한 줄 — old:
```
**How to apply:** 다음에 같은 요청이 오면 이 파일을 먼저 읽고, `event_entries` 근처는 얼씬도 하지 말고 곧장 `event_signups`에 넣을 것. 회원가입(`member_login`)과 이벤트 참여(`event_signups`)는 **별개의 두 단계**임을 잊지 말 것.
```
new:
```
**How to apply:** 다음에 같은 요청이 오면 이 파일의 **맨 앞 절(교회 어드민)** 을 따른다 — 친구께 어드민의 ＋ 한 분 더하기·명단 올리기를 안내하고, Claude 는 SQL·관리자 API 로 넣지 않는다. `event_entries`(옛 퀴즈형)는 여전히 무관하다.
```

(라) 옛 「몇 분 더하기」 굵은 제목 앞에 표시(그 줄에는 사람 이름이 있어 앞머리만 맞춰 바꾼다):
```bash
M=/c/Users/sewki/.claude/projects/c--Projects-bible-memorize-church-app-v2/memory
sed -i 's/^\*\*이미 이관된 회차에 몇 분 더하기(/**(옛 방법 · 이제 못 쓴다 — eventImport 얼림) 이미 이관된 회차에 몇 분 더하기(/' $M/summer-write-bible-add-member.md
grep -c '^\*\*(옛 방법 · 이제 못 쓴다' $M/summer-write-bible-add-member.md
```
Expected: `1`.

② `event-rosters-align-to-directory.md` — Edit, old:
```
- 되돌릴 땐 note 의 「원래: …」를 읽어 다시 넣으면 된다(행 단위 고치기 액션이 없어 회차 전체 재이관).
```
new:
```
- 되돌릴 땐 note 의 「원래: …」를 읽어 교회 어드민 📋 회차·명단의 줄 「고치기」로 한 줄씩(@@TODAY@@ 부터 — `eventImport` 재이관은 얼렸다). 고치기 창은 지금 메모를 채워 보여 줘 「원래: …」가 지워지지 않는다.
```

③ 새 파일 `bible-events-admin-live.md`(Write):
```
---
name: bible-events-admin-live
description: "교회 어드민 성경필사(암송) — @@TODAY@@ 운영 개시 · 역할 bibleevent · 이벤트 명단을 고치는 곳은 어드민 한 곳(성경암송 eventImport·eventSave·eventSetNote 얼림 — api 는 얼림이 든 판에서만 배포) · 남은 것: 자격 인정·미신청 목록 옮기기 → admin.html 이벤트 타일 · sort_order 설정 없음"
metadata:
  type: project
---

@@TODAY@@ 교회 어드민(admin.onlybible.kr)에 **성경필사(암송)** 세 메뉴(📋 회차·명단 · 📤 명단 올리기 · 👤 사람별 이력·통계)를 열었다.
성경암송 앱의 `events`·`event_signups` 를 표를 고치지 않고 직접 읽고 쓴다. 역할 `bibleevent`(`pilsa` 아님 — 필사 노트 신청이 쓰는 이름).
설계 v2 `docs/superpowers/specs/2026-09-29-church-admin-bible-events-design.md` · 메모 `docs/notes/bible-events-admin.md` · church-admin `CLAUDE.md` 「성경필사(암송)」 절.

**Why:** 성경암송 `eventImport` 는 돌 때마다 그 회차의 import 줄을 통째로 지우고 다시 넣는다 — 두 곳이 함께 쓰면 어드민에서 고친 것이 사라진다. 그래서 여는 날 성경암송 쪽 쓰기 셋을 서버에서 얼렸다(비밀번호 확인 바로 뒤 · 비밀번호 없는 호출은 예전처럼 unauthorized).
**How to apply:**
- 명단에 사람을 더하거나 고치는 요청은 어드민으로 안내한다(Claude 가 SQL·관리자 API 로 넣지 않는다) — [[summer-write-bible-add-member]].
- 성경암송 `api` 를 배포할 때는 얼림이 든 판인지 본다(내려받아 `EVT_MOVED.has(` 셋) — 옛 작업 트리에서 올리면 얼림이 조용히 풀린다. [[edge-function-shared-deploy]]
- `supabase/event_stamp_2026.sql` 을 다시 돌리지 않는다(가을 회차 설정을 덮는다). 가을 말씀 동행 10/11 개시는 어드민 회차 설정에서.
- 남은 것: 가을 말씀 동행의 자격 인정(`eventExcuse`)·미신청 목록을 어드민으로 옮기기(그때 `admin-event.html` 의 prompt/alert 도 직접 만든 창으로) → 그다음 성경암송 `admin.html` 이벤트 타일을 새 주소로 · 회차 차례(`sort_order`)는 어드민 설정에 없다(새 회차 0).
[[church-admin-stage1]] [[church-people-directory]] [[event-rosters-align-to-directory]]
```

④ `MEMORY.md` — Edit, old(한 줄):
```
- [썸머써바이블 명단 수동 추가](summer-write-bible-add-member.md) — "OOO 썸머써바이블에 추가해줘" 오면 event_entries 아니라 event_signups에 넣을 것(events.id='summer-2026'), member_login 먼저 · 명단째는 eventSave→eventImport(2022~2026 사순절·썸머·소책자 여덟 회차 넣음, 숨김 · 재실행하면 통째로 갈린다 → 몇 분 더할 땐 백업·전체 재이관·대조 · PostgREST 1,000행 한도 주의)
```
new:
```
- [이벤트 명단 한 분 더하기](summer-write-bible-add-member.md) — @@TODAY@@ 부터 교회 어드민 「성경필사(암송)」에서(＋ 한 분 더하기·명단 올리기) · 성경암송 eventImport·eventSave·eventSetNote 는 얼림(moved-to-church-admin) · Claude 는 SQL·관리자 API 로 넣지 않는다 · 파일 아래는 옛 기록(event_signups 표 모양·1,000행 한도)
- [성경필사(암송) 운영 개시](bible-events-admin-live.md) — @@TODAY@@ admin.onlybible.kr 세 메뉴 · 역할 bibleevent · 쓰는 곳 하나 · api 는 얼림이 든 판에서만 배포 · event_stamp_2026.sql 다시 돌리지 말 것 · 남은 것: 자격 인정 옮기기·admin.html 타일
```
(그 줄이 이미 바뀌어 있으면 `(summer-write-bible-add-member.md)` 가 든 줄을 찾아 통째로 바꾼다.)

날짜를 한 번에 채운다:
```bash
M=/c/Users/sewki/.claude/projects/c--Projects-bible-memorize-church-app-v2/memory; D=$(TZ=Asia/Seoul date +%F)
sed -i "s/@@TODAY@@/$D/g" $M/summer-write-bible-add-member.md $M/event-rosters-align-to-directory.md $M/bible-events-admin-live.md $M/MEMORY.md
grep -c '@@TODAY@@' $M/summer-write-bible-add-member.md $M/event-rosters-align-to-directory.md $M/bible-events-admin-live.md $M/MEMORY.md
grep -n "bible-events-admin-live\|이벤트 명단 한 분 더하기" $M/MEMORY.md
```
Expected: 네 파일 모두 `:0` · MEMORY.md 에 새 두 줄.

- [ ] **Step 14: 정리 · 기록 · 남은 것**

```bash
cd /c/Projects/church-admin
git worktree remove .worktrees/bible-events
git branch -d bible-events
git worktree list
```
Expected: `bible-events` 가 목록에서 사라진다(`-d` 는 합쳐진 가지만 지운다 — 거절되면 합치기가 안 된 것이니 멈춘다).
진행 기록부 `C:\Projects\church-admin\.superpowers\sdd\progress.md`(저장소에 안 들어간다) 끝에 한 줄을 적는다:
`LIVE (<오늘>): 성경필사(암송) — 운영 SQL 004 · 노출 0행 · 성경암송 api 얼림(eventImport·eventSave·eventSetNote → moved-to-church-admin · 비밀번호 확인 바로 뒤 · 개발·운영 스모크 0 실패) · 교회 어드민 운영 함수 · main 합침·푸시 · 라이브 roster.js 해시 같음 · privacy 7번 · admin-event.html 띠 · 성경암송 docs/notes·CLAUDE.md · 역할 준 담당자 N명(이름 안 적음) · 메모리 고침.`
그리고 「남은 것」 두 줄을 적는다:
- 설계 §4-4 성경암송 `admin.html` 이벤트 타일 갈아타기 — 자격 인정(`eventExcuse`)·미신청 목록을 교회 어드민으로 옮긴 **다음** 단계에서(CONTRACT 5). 지금 타일 설명 「회차 만들기 · 신청 명단 · 인쇄」는 얼린 뒤와 맞지 않는다.
- 회차 차례(`sort_order`)는 어드민 회차 설정에 없다 — 새 회차는 0(CONTRACT 5). 두 회차가 겹쳐 성도님 첫 화면 차례를 바꿔야 하면 개발 먼저 SQL 로 한다.
`~/.church-admin/launch-bible-events/` 는 지운다(내려받은 함수 사본이 들어 있다): `rm -rf ~/.church-admin/launch-bible-events`.

**문제가 생기면(되돌리기):**
- 교회 어드민 운영이 그날 안에 서지 못했고 **어드민에서 아직 아무것도 안 썼다면**, 성경암송 얼림을 푼다. `git -C /c/Projects/bible-memorize-church-app-v2 revert --no-edit $(cat ~/.church-admin/launch-bible-events/v2-freeze-sha.txt)` 를 한 뒤, Step 4·8 과 같은 방법(그 되돌림 커밋을 `git archive` 로 풀어 `--workdir`)으로 개발 → 운영 배포한다. 내려받아 `EVT_MOVED.has(` 가 `0` 인지 본다. 스모크는 같은 커밋에서 5-1 이 함께 빠지므로 옛 기대로 돌아간다. (Step 14 에서 `launch-bible-events` 를 이미 지웠으면 얼림 해시는 `git log --format=%H -1 --grep='moved-to-church-admin(얼림)'` 로 다시 찾는다.)
- ⚠️ **어드민에서 한 줄이라도 더하거나 고친 뒤에는 얼림을 풀지 않는다.** `eventImport` 한 번에 그 줄들이 지워진다. 그때는 어드민 쪽을 고쳐 앞으로 간다.
- 화면만 되돌릴 때: `git -C /c/Projects/church-admin revert -m 1 --no-edit <합치기 커밋>` → 푸시한다. 서버 액션은 남아 있어도 메뉴가 없으면 부르지 않는다.

