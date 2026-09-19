# 아이폰 위젯 보강 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 「이번주 말씀」 위젯을 잠금 화면까지 넓히고 누르면 그 구절 암송 화면으로 바로 가게 하며, 「오늘의 묵상」·「오늘의 축복 기도문」 위젯을 새로 만든다.

**Architecture:** 서버(`api` 함수)가 앱과 같은 규칙으로 오늘 보일 것을 계산해 공개 액션으로 내려주고(`getWeeklyVerse` 기준 교정 · `getTodayMeditation` · `getTodayBlessing` 신설), 위젯은 받아서 그리기만 한다. 위젯을 누르면 `gocheokmemorize://…` 스킴으로 앱이 열리고 AppDelegate 가 웹 주소(`/?v=` · `/?w=`)로 바꿔 웹뷰에 연다.

**Tech Stack:** Deno(Supabase Edge Function) · Vanilla JS(app.js) · WidgetKit+SwiftUI(iOS 16+) · Playwright(Python, 대조 시험)

설계: `docs/superpowers/specs/2026-09-20-ios-widgets-design.md`

## Global Constraints

- 위젯은 **공개 정보만** — `user_id`·개인정보를 주고받지 않는다.
- 기존 위젯 `kind` 는 **`"TodayVerseWidget"` 그대로** — 바꾸면 성도님이 이미 놓은 위젯이 사라진다.
- 새 위젯은 **같은 익스텐션**(`kr.onlybible.gocheok.memorize.todayverse`) 안에 — 새 번들 ID·서명 없음.
- URL 스킴: **`gocheokmemorize`** (위젯 `WidgetShared.swift` 와 앱 `Info.plist`·`AppDelegate` 가 같아야 한다).
- 기도문 이름: **「우리 가족」**. 조사 규칙은 app.js `prayJong`·`prayFill` 과 같다.
- 서버 배포는 **개발(`ktpwthwqzgcqcrmsafdo`) → 운영(`xnomlgydifiqiybervtf`)**, 배포 전 `git status`, 배포 뒤 `getVerses`·`ranking` 도 찔러 본다.
- 공용 파일(`app.js`·`index.ts`·`index.html`)은 **내 경로만** 커밋(`git commit -- <경로>`).
- Xcode 가 필요한 단계는 이 PC 에서 못 돌린다 — Codemagic 빌드로만 검증한다.
- 앱 버전 1.0.1 → **1.1.0**.

---

### Task 1: 서버 — 이번 주 구절 기준 교정 + 오늘의 묵상 · 오늘의 축복 기도문

**Files:**
- Modify: `supabase/functions/api/index.ts` (switch 에 case 두 줄 추가·한 줄 교체 · `latestVerse()` 바로 뒤에 위젯 블록 추가)
- Create: `tests/widget-parity.py`

**Interfaces:**
- Produces(액션, 모두 `{action, date?: "YYYY-MM-DD"}` 를 받는다):
  - `getWeeklyVerse` → `{ no, ref, text, prev: {no,ref,text}|null }` (구절이 없으면 `{}`)
  - `getTodayMeditation` → `{ ok, ready, date, dayLabel, heading, message, question, sermonTitle, usingPrev }`
  - `getTodayBlessing` → `{ ok, date, no, title, ref, prayer }`

- [ ] **Step 1: 대조 시험 작성** — `tests/widget-parity.py`

운영 사이트를 로그인 없이 열고(읽기만), 한국 시간대·고정 시계로 14일을 옮기며 웹 함수 결과와 서버 `date=` 결과를 대조한다.
(코드는 저장소의 `tests/widget-parity.py` — 이 계획과 함께 커밋된다. 핵심:
`page.clock.set_fixed_time(<그날 12:00 KST>)` → `page.goto(운영)` → 웹 함수로
`getWeeklyVerseInfo()` · `findSermonForVerse` · `sermonCycleStarted` · `sermonHasMeditationContent` ·
`buildWeeklyMeditations` · `prayToday` · `prayFill(…, "우리 가족")` 결과를 만들고, 서버 세 액션과 한 글자까지 견준다.)

- [ ] **Step 2: 시험이 실패하는지 확인**

Run: `python tests/widget-parity.py`
Expected: `getTodayMeditation`·`getTodayBlessing` 이 `unknown action` 으로 전부 FAIL

- [ ] **Step 3: 서버 구현** — `latestVerse()` 끝(`}` 다음)에 위젯 블록을 넣고 switch 를 고친다

```ts
      case "getWeeklyVerse":     return json(await getWeeklyVerseForWidget(body));
      case "getTodayMeditation": return json(await getTodayMeditation(body));
      case "getTodayBlessing":   return json(await getTodayBlessing(body));
```

위젯 블록(요지 — 전체는 커밋된 `index.ts` 의 「위젯(아이폰)」 절):
- `widgetYmd(b)` : `b.date` 가 `YYYY-MM-DD` 면 그것, 아니면 `kstDay(now)`.
- `ymdDayNumber(ymd)` : `Math.floor(Date.UTC(y,m-1,d)/86400000)`.
- `weeklyVerseKst(ymd)` : `verses`(`is_active`, `track=weekly`, **`order("no")`** — `getVerses` 와 같은 순서, track 칸 없으면 폴백)
  를 `kstDay(date)` 의 날수로 정렬, 오늘 이하 마지막 = cur, 그 앞 = prev, 없으면 첫 것(prev 없음).
- `getTodayMeditation` : 위 규칙(설계 ②) — `sermons` 에서 `hidden=false`·`mem_verse_no in (cur,prev)`·`svc_date` 내림차순,
  `summary` 있는 첫 것. `**굵게**` 벗김. 표가 없거나 오류면 설교 없음으로(=「준비하고 있어요」, `ready:false`).
- `getTodayBlessing` : `getBlessings()` 목록, `i = ((ymdDayNumber(ymd) − 1) % n + n) % n`, `{이름}`→「우리 가족」.

- [ ] **Step 4: 개발에 배포하고 형식 확인**

```bash
git status --short supabase/functions/api/index.ts   # 내 변경만인지
supabase functions deploy api --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo
```
curl 로 세 액션 + `getVerses`·`ranking` 이 `ok` 인지. 개발 DB 에는 `sermons` 가 없으므로 묵상은 `ready:false` 가 정상.

- [ ] **Step 5: 운영에 배포하고 대조 시험 통과 확인**

```bash
supabase functions deploy api --no-verify-jwt --project-ref xnomlgydifiqiybervtf
python tests/widget-parity.py
```
Expected: 14일 × (이번주 말씀 · 묵상 · 기도문) 전부 PASS. `getVerses`·`ranking` 도 `ok`.

- [ ] **Step 6: 커밋** — `git commit -- supabase/functions/api/index.ts tests/widget-parity.py`

---

### Task 2: 웹 — 위젯이 여는 `?w=meditation` · `?w=prayer`

**Files:**
- Modify: `app.js` — `getPreviewKind()` 옆에 `getWidgetTarget()`, `routeAfterLoad()` 의 `?v=` 블록 바로 뒤에 분기

**Interfaces:**
- Consumes: 기존 `renderPrayerBook()`, `enterAfterLogin()`, `_skipAutoDaily`, `maybeShowWeeklyMeditation(force, withTabs)`
- Produces: `/?w=meditation` · `/?w=prayer` (Task 3 의 AppDelegate 가 연다)

- [ ] **Step 1: 코드**

```js
// URL의 ?w=<어디>를 1회 읽어 반환 — 아이폰 위젯을 누르면 AppDelegate 가 이 주소로 연다.
function getWidgetTarget() {
  try {
    const w = new URLSearchParams(location.search).get("w");
    if (w === "meditation" || w === "prayer") {
      history.replaceState(null, "", location.pathname);
      return w;
    }
  } catch (e) {}
  return null;
}
```
`routeAfterLoad()` — `?v=` 블록 다음:
```js
  const widgetTo = getWidgetTarget();
  if (widgetTo && loadUser()) {
    if (widgetTo === "prayer") { renderPrayerBook(); return; }
    if (widgetTo === "meditation") {
      _skipAutoDaily = true; enterAfterLogin(); _skipAutoDaily = false;
      maybeShowWeeklyMeditation(true, true);
      return;
    }
  }
```

- [ ] **Step 2: localhost 확인**(개발 DB) — Playwright 로 `/?w=prayer` → `.pr-wrap`, `/?w=meditation` → `#daily-message.med` 하나만(겹침 없음), 주소에서 `?w=` 가 지워짐, 로그인 없으면 로그인 화면.
- [ ] **Step 3: `python tools/bump.py` → `python tools/preflight.py` → 커밋(내 경로만) → 푸시 → 라이브에 `getWidgetTarget` 이 있는지 확인**

---

### Task 3: 앱 — 위젯 셋 + 누르면 화면 연결 + 1.1.0

**Files:**
- Create: `ios-app/ios/App/TodayVerseWidget/WidgetShared.swift` · `MeditationWidget.swift` · `BlessingWidget.swift`
- Modify: `ios-app/ios/App/TodayVerseWidget/TodayVerseWidget.swift` · `TodayVerseWidgetBundle.swift`
- Modify: `ios-app/ios/App/App/AppDelegate.swift` (`application(_:open:options:)` + `openFromWidget`)
- Modify: `ios-app/ios/App/App/Info.plist` (`CFBundleURLTypes`)
- Modify: `ios-app/ios/App/App.xcodeproj/project.pbxproj` (새 파일 셋을 위젯 타깃 Sources 에 · `MARKETING_VERSION` 1.1.0 ×4)
- Mirror: `ios-app/native/TodayVerseWidget/*.swift` (부트스트랩 워크플로가 복사하는 원본 — 같은 내용)

**Interfaces:**
- Consumes: Task 1 액션 셋, Task 2 주소 `/?w=…`, 기존 `/?v=번호`
- Produces: 위젯 `widgetURL` — `gocheokmemorize://verse?no=N` · `://meditation` · `://prayer` · `://home`

- [ ] **Step 1: Swift 코드**(전체는 커밋된 파일 — 요지)
  - `WidgetShared.swift`: `callWidgetApi(action)` · `nextKSTMidnight()` · `saveLastGood/loadLastGood`(익스텐션 `UserDefaults`) ·
    `fetchWithFallback(kind:action:isValid:)` · `refreshDate(fresh:next:)`(실패면 30분) · `widgetBackground(clear:)`(iOS 17 `containerBackground`).
  - `TodayVerseWidget.swift`: `VerseEntry` 에 `no` · 가족 `.accessoryRectangular`(구절 이름 + 본문 2줄)·`.accessoryInline`(「이름 · 본문」) 추가 · `widgetURL`.
  - `MeditationWidget.swift`: 중간·크게, 다음 자정과 6시간 뒤 중 이른 때 새로 고침.
  - `BlessingWidget.swift`: 중간·크게, 다음 자정.
  - `TodayVerseWidgetBundle.swift`: 셋을 묶는다.
- [ ] **Step 2: AppDelegate · Info.plist · pbxproj** — 첫 로그인 전이면 무시, 새 문서를 연 뒤 1초·3초에 `configureNativeAppCss()`.
- [ ] **Step 3: 검사할 수 있는 것만 여기서** — pbxproj 의 새 ID 가 겹치지 않는지, 네 곳 `MARKETING_VERSION = 1.1.0`, plist 문법(`python -c "import plistlib"`).
- [ ] **Step 4: 커밋·푸시** → 친구가 Codemagic `ios-testflight` 실행 → 오류 로그가 오면 고친다 → TestFlight 실기기 확인표(설계 ④).

---

### Task 4: 기록

- `docs/notes/meditation.md` · `docs/notes/prayer-book.md` : 「규칙이 app.js 와 서버 두 곳 — 함께 고칠 것 · `tests/widget-parity.py` 로 대조」
- `CLAUDE.md` 「다음 작업」: 위젯 1.1.0 빌드·실기기 확인 대기 한 줄 + 아침 알림 `latestVerse()` 기준 어긋남(범위 밖) 한 줄
- 메모리: iOS 버전 상태 갱신
