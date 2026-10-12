# 네비게이토 성경암송 — 구현 계획 (2026-10-13)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 첫 화면 「암송 과정」 → 📚 네비게이토 성경암송(묶음 7 · 카드 73장)을 주간 암송과 같은 3단계로 외우고, 기록은 주간과 같은 길(progress·challenge_log)로 남긴다 — 문이 닫힌 채(🧪 시험 참여자·`?navi=1`만) 운영에 낸다.

**Architecture:** 쉴만한 물가와 같은 길 — 같은 `verses` 표에 `track='navi'` · 번호 2001~2112 · 칸 `chapter`·`topic`. 서버는 `getVerses(track:"navi")` 갈래 하나(`supabase/functions/api/navi.ts`). 화면은 필요할 때 받는 `js/navi.js`(주간 화면 함수는 쓰지 않고 공용 부품만 빌린다). 문은 `app_config.naviPublic` + 🧪 시험 참여자 + `?navi=1`.

**Tech Stack:** Vanilla JS PWA(app.js · js/*.js) · Supabase Edge Function(Deno · `api`) · Postgres(`verses`) · node:test 순수 시험(꾸러미 없음) · Python 도구(openpyxl).

설계: `docs/superpowers/specs/2026-10-13-navigators-design.md`(승인 2026-10-13). 친구 지시 「묻지 말고 진행」(2026-10-13) — 성도님께 여는 것(`naviPublic=true`)만 친구가 정한다.

## Global Constraints

- 번호대: 1~999 주간 · 1001~1999 쉴만한 물가 · 2001~ 네비게이토(확신 2001~ · 지침 2011~ · A 2021~ · B 2041~ · C 2061~ · D 2081~ · E 2101~). 한 번 넣은 번호는 바꾸지도 지우지도 않는다(cascade로 기록이 지워진다) — 내릴 때는 `is_active=false`.
- 본문은 엑셀 I열(대한성서공회 개역개정 4판 원문) 그대로 — AI 가 쓰거나 고치지 않는다. 도구는 공백만 다듬는다.
- 「물가 화면으로 보냄」(`isPsalmNo` = 1001~1999)과 「복습에서 뺌」(`isNonWeeklyNo` = 1000 초과)은 다른 판정이다 — 앱·서버 같은 이름·같은 값.
- 주간 화면(`startTest`·`renderTestScreen`·`showStageDoneModal`·`renderCompleteNav`)을 네비게이토에 쓰지 않는다 — 전역 `verses`(주간)에 묶여 있다.
- 전역 `verses` 에 네비게이토를 넣지 않는다(첫 화면 수 · 다음 말씀 · 도전 풀 · 복습 대기열이 바뀐다).
- 새 `challenge_log.mode` 를 만들지 않는다 — `saveProgress(no, stage, "typing"|"card")`.
- 화면 문구: 묶음 목록·구절 목록에 **전체 수를 쓰지 않는다**(마친 수만) · 「앨범에 담겼어요」·「복습이 예약됐어요」를 쓰지 않는다(네비게이토는 둘 다 아니다).
- 세 값: 받음(구절 있음) · 없음(서버는 알지만 0구절 — 「준비 중」) · 모름(통신·옛 서버·칸 없음 — 「지금 불러올 수 없어요」).
- 공유 체크아웃 — `git add -- <내 파일>` 만 · 커밋 전 `git diff --cached --stat` · 푸시 전 `python tools/preflight.py`.
- 배포 차례: api(개발 → 운영) → 앱(bump) → SQL(개발 → 운영 + `sql-applied.py record`). 문은 닫힌 채.

## 설계에서 바꾼 것(이 계획에서 정함)

1. **73줄을 `is_active=true` 로 넣는다**(설계 §3 「꺼진 채」 대신). 설계 §6-4 「🧪 시험 참여자 실기기 확인」이 §6-5 「줄 켜기」보다 앞이라, 꺼진 줄로는 시험 참여자도 볼 수 없다. 안전한 까닭: 주간을 읽는 곳(`getVerses` 기본 · `latestVerse` · `weeklyVerseKst` · monitor · `verseNextNo`)이 모두 `track='weekly'` 로 거르고, 옛 앱은 `track` 을 안 보내 주간만 받는다. 문은 앱의 `naviVisible()` 하나다 — 구절은 공개된 성경 본문이라 서버가 막을 것이 없다(이름·개인정보 없음).
   시드 SQL 은 `on conflict` 에서 **`is_active` 를 덮지 않는다** — 다시 돌려도 내려 둔 카드가 되살아나지 않는다(쉴만한 물가 시드의 「다시 돌리면 다 꺼진다」 함정을 반대로 막는다).
2. **0단계(읽기 화면)를 두지 않는다** — 주간 암송처럼 카드를 누르면 곧바로 이어 할 단계(마음에 둠이면 3단계). 화면의 「보기」·「🔊 듣기」가 보기·듣기다.
3. 서버의 `isPsalmNo` 는 지운다 — 서버에서 쓰던 두 자리가 모두 「복습에서 뺌」이라 `isNonWeeklyNo` 로 바꾼다(물가 화면으로 보내는 판정은 앱에만 있다).
4. 카드 번호(엑셀 F열 「A-1」)는 DB 에 담지 않는다 — 번호 매기는 법을 카드 실물과 대조하지 못했다(설계 §8). 목록의 작은 번호는 묶음 안 차례(1, 2, …)다.

## 파일

| 파일 | 할 일 |
|---|---|
| `js/psalm.js` | 번호대 — `NAVI_NO_BASE` · `isPsalmNo` 1001~1999 · `isNonWeeklyNo` (순수 표식 안) |
| `app.js` | 복습 두 자리 `isNonWeeklyNo` · 문(`naviVisible` 등) · `LAZY_JS.navi` + `openNavi` · 첫 화면 「암송 과정」 · A안 `HA_GROUPS`·`HA_ROW_ICON`·`HA_ICON.book` · NEW 줄 |
| `js/navi.js`(새) | 묶음 목록 · 구절 목록 · 3단계 · 완료 창 · 완료 줄 (순수 구간 표식) |
| `style.css` | `.nv-*` (묶음 줄 · 주제 제목 · 묶음 꼬리표) + 어두운 모드 짝 |
| `supabase/functions/api/navi.ts`(새) | `getNaviVerses` (순수 `naviVerseOf`) |
| `supabase/functions/api/index.ts` | `getVerses` navi 갈래 · `isNonWeeklyNo` · `PUBLIC_CONFIG_KEYS` 에 `naviPublic` |
| `supabase/functions/api/psalm.ts` | 머리 주석(번호 판정 이름) |
| `tools/navi-fit.py`(새) | 엑셀 → 검사 → `supabase/navi_verses.sql` |
| `supabase/navi_verses.sql`(새 · 도구가 만든다) | 칸 둘 + 73줄 |
| `supabase/psalm_metrics.sql` | `verse_no > 1000` → `between 1001 and 1999` |
| `tests/navi.test.cjs`(새) | 번호대 · navi.ts 순수 · navi.js 순수 · 시드 SQL 꼴 |
| `tests/lazy-load.test.cjs` | `navi` 를 목록·MODS·ALLOWED·이름 겹침에 |
| `tools/preflight.py` | `PURE_TESTS += ["tests/navi.test.cjs"]` |
| `tests/navi-smoke.sh`(새) | 개발·운영 읽기 스모크(주간에 안 섞임 · navi 73) |
| `tools/screen-sweep.py` | 리셋에 `_naviPreview=true` · 단계 51~54 |
| 문서 | `docs/notes/navigators.md`(새) · `CLAUDE.md` 표 한 줄 · `docs/notes/backend-api.md` · `docs/notes/lazy-load.md` · `docs/notes/psalm-still-waters.md` · 설계 문서 「바꾼 것」 |

---

### Task 1: 번호대 — 물가 판정과 복습 판정 가르기

**Files:** Modify `js/psalm.js:10,27` · `app.js:2265,2281` · `supabase/functions/api/index.ts:139-147,2763,2874` · `supabase/functions/api/psalm.ts:6` · `supabase/psalm_metrics.sql:16,43` · Create `tests/navi.test.cjs`(①)

**Interfaces:** Produces (js/psalm.js · 처음부터 실림) `NAVI_NO_BASE = 2000` · `isPsalmNo(no)` → 1001~1999 · `isNonWeeklyNo(no)` → 1000 초과. 서버(index.ts) `isNonWeeklyNo(no)` 같은 값.

- [ ] js/psalm.js 에 순수 표식(`// ── 구절 번호대 — 순수 (여기부터) ──` … `(여기까지) ──`)으로 세 이름을 감싼다.
- [ ] 시험 ① — 표식 사이를 vm 에서 돌려 `isPsalmNo(1001)=true · (1999)=true · (2001)=false · (999)=false` · `isNonWeeklyNo(999)=false · (1001)=true · (2112)=true` · app.js 의 `ensureReviewScheduled`·`dueReviewNos` 가 `isNonWeeklyNo` 를 쓰고 `isPsalmNo` 는 `renderReview`·앨범 `goTest` 둘에만 남는다 · index.ts 에 `isPsalmNo` 가 없고 `isNonWeeklyNo` 가 두 자리.
- [ ] `node --test tests/navi.test.cjs` 실패 확인 → 고친 뒤 통과.

### Task 2: 서버 — `getVerses(track:"navi")` · `naviPublic`

**Files:** Create `supabase/functions/api/navi.ts` · Modify `index.ts`(import · `getVerses` · `PUBLIC_CONFIG_KEYS`) · `tests/navi.test.cjs`(②)

**Interfaces:** Produces 응답 `{ ok: true, navi: true, verses: [{ no, chapter, topic, refShort, refFull, text }] }` (번호순 · `is_active=true AND track='navi'`) · 칸이 없거나 읽기 오류면 `{ ok: false, error: "navi-unavailable" }`(앱은 「모름」). `navi: true` 표식이 없는 답(옛 서버는 주간 구절을 준다)은 앱이 「모름」으로 본다.

- [ ] navi.ts — 순수 `naviVerseOf(row)`(표식 안 · 타입 표기 없음) + `export async function getNaviVerses()`.
- [ ] index.ts — `import { getNaviVerses } from "./navi.ts";` · `getVerses` 둘째 줄 `if (b && b.track === "navi") return await getNaviVerses();` · `PUBLIC_CONFIG_KEYS` 한 줄 Set 에 `"naviPublic"`.
- [ ] 시험 ② — `naviVerseOf` 꼴 · index.ts 갈래 줄 · 허용 키(한 줄 Set) · `api-split.test.cjs` 가 새 파일을 저절로 본다.

### Task 3: 시드 도구 — `tools/navi-fit.py` → `supabase/navi_verses.sql`

**Files:** Create `tools/navi-fit.py` · `supabase/navi_verses.sql`(도구 산출) · Modify `tests/navi.test.cjs`(③)

**Interfaces:** `python tools/navi-fit.py [--xlsx …] [--sql] [--force]` — 시트 「구절 입력」 2~74행(A 순번 · B 번호 · C 묶음 코드 · E 주제 · G 장절(짧게) · H 장절(풀어) · I 본문 · M 메모 「빼기」).

- [ ] 검사(막음): 빈 본문 · 번호가 묶음 번호대 밖 · 번호 겹침 · 같은 장절 글자 겹침 · 묶음 코드 모름 · 빈 주제 · 본문에 숫자·괄호·영문 · 이미 만든 SQL 과 견준 번호 재배정(`--force` 없으면 멈춤). 경고: 공백 다듬기 · 「빼기」 줄은 `is_active=false`.
- [ ] SQL: `begin; set local lock_timeout='5s';` ① `alter table … add column if not exists chapter text, topic text` ② 73줄 insert(`track='navi'` · `week null` · `is_active true`) `on conflict (no) do update set track, chapter, topic, ref, ref_short, ref_full, text`(**is_active 는 안 덮는다**) ③ 확인 select · `commit;`.
- [ ] 시험 ③ — SQL 주석을 떼고: 73줄 · 번호 2001~2112 · 모두 `'navi'` · `on conflict` 갈래에 `is_active` 없음 · `delete` 없음.

### Task 4: 개발 DB · 개발 api

- [ ] `supabase --workdir ~/.gocheok-backup/supa-dev db query --linked "select count(*) from users"` → 스물 남짓(개발).
- [ ] 개발에 SQL 두 번(두 번째도 오류 없이) → `python tools/sql-applied.py record supabase/navi_verses.sql --dev`.
- [ ] 서버 커밋 → `python tools/deploy-fn.py api --dev --allow-ahead`.
- [ ] `bash tests/navi-smoke.sh`(개발): 주간 최대 no < 1000 · navi 73 · 번호 2001~2112 · chapter 7종 · `getConfig naviPublic` 이 「허용되지 않은 키」가 아님.

### Task 5: 앱 — 문 · 첫 화면 자리 · 지연 등록

**Files:** Modify `app.js`(문 묶음 · routeAfterLoad · newestNewFeat · 템플릿 · 클릭 · LAZY_JS · openNavi · HA_*) · `tests/lazy-load.test.cjs`

**Interfaces:** Produces `naviVisible()` · `openNavi()` · `LAZY_JS.navi = { src: "js/navi.js", fn: "renderNaviHome" }`. Consumes `renderNaviHome()`(Task 6).

- [ ] 문: `_naviPreview`·`getNaviPreview()`(`?navi=1` 그 칸만 지운다) · `NAVI_PUB_KEY="navi-public"` · `naviOpenCached()` · `refreshNaviOpen()`(`d.value === true`) · `naviVisible() = _naviPreview || naviOpenCached() || ministryTesterCached()` — `psalmVisible` 다음 자리(duty 시험이 자르는 구간 밖).
- [ ] 템플릿: feat-actions 다음 `naviVisible()` 이면 `<div class="grp-title">암송 과정</div>` + `<button class="summary-help" id="open-navi">📚 네비게이토 성경암송${newBadge("navi")}</button>` · 클릭 `markFeatSeen("navi"); openNavi();` · 미리 받지 않는다.
- [ ] A안: `HA_GROUPS` 「말씀 묵상」 다음 `{ title: "암송 과정", ids: ["open-navi"] }` · `HA_ROW_ICON["open-navi"]="book"` · `HA_ICON.book`.
- [ ] `newestNewFeat` 에 `if (k === "navi" && !naviVisible()) return;`(k 먼저 — ministry-history 시험의 featCtx).
- [ ] lazy-load 시험: 목록에 `navi` · `MODS.navi` · `ALLOWED.renderNaviHome` · 이름 겹침 파일 목록에 `js/navi.js`.

### Task 6: 화면 — `js/navi.js`

**Interfaces (navi.js 맨 위 이름 — app.js·처음부터 실리는 js 와 겹치지 않게 `nv`/`NV_` 머리):**
- 순수(표식 안): `NV_CHAPTERS` · `nvChapterTitle(code)` · `nvReadAnswer(d)` → `{state:"ok"|"empty"|"unknown", verses}` · `nvByChapter(list, code)` · `nvTopicGroups(list)` → `[{topic, verses}]` · `nvDoneCount(list, passedOf)` · `nvPrevOf(list, no)` · `nvNextAfter(list, no, passedOf)` → `{verse, kind:"next"|"left"}|null`
- 화면: `renderNaviHome()`(LAZY fn) · `renderNaviChapter(code)` · `nvStart(verse)` · `renderNaviTest(verse, stage)` · `nvStageDone(verse, stage, cardUsed)` · `nvStageModal(verse, stage, wasFirst)` · `nvCompleteNav(verse)`
- 빌려 쓰는 app.js 전역: `api.getVerses` · `getPassedStage` · `isHearted` · `loadHearted` · `STATUS_LABEL` · `vlAutoHint` · `speakText` · `stopSpeaking` · `verseSpokenText` · `verseTtsLang` · `albumPlayStart`·`albumPlayStop`·`verseItemsFor`·`albumDurText` · `pickBlankIndices` · `setupAutoCheck` · `setCardMode`·`isCardMode`·`isCardStart` · `isRepeatPractice`·`setRepeatPractice` · `heartCheckHtml`·`setupHeartCheck` · `setupAnswerToggle` · `initStickyRef` · `scrollPastBtnRow` · `STEP_CHEER` · `stepDots` · `isFirstJourney` · `saveProgress` · `renderSummary` · `homeFabLabel` · `loadUser` · `logFeature` · `todayYmd` · `GO_CHEV` · `psalmEsc`(js/psalm.js).

- [ ] 시험 ④ — 순수 구간: 묶음 7 · `nvTopicGroups`(A 는 6칸 × 2 · 확신은 5칸 × 1) · `nvReadAnswer`(옛 서버 답 = unknown · `navi:true` 0구절 = empty) · `nvNextAfter`(다음 · 끝에서 안 마친 앞 구절 · 다 마치면 null) · 문구에 「앨범」·「복습」·「전체」 수 없음.
- [ ] 화면을 짠다 → localhost(개발 DB · 「개발 DB」 띠)에서 `?navi=1` 로 묶음 → 구절 → 1·2·3단계(쓰기·카드) → 완료 창 「다음」(묶음 안) → 「← 목록」 · 마음에 둠 · 반복해서 쓰기 · 이 묶음 듣기.
- [ ] 첫 화면 수(「N구절 마쳤어요」)·이번 주 말씀·도전 풀이 그대로인지 · 개발 `reviews` 에 2001~ 이 안 생기는지.

### Task 7: 화면 점검

- [ ] `tools/screen-sweep.py` 리셋에 `_naviPreview=true` · 단계 `51-navi-home`(단추) · `52-navi-chapter`(`renderNaviChapter('A')`) · `53-navi-stage1` · `54-navi-stage3`(지연 파일을 먼저 받는다).
- [ ] `python tools/screen-sweep.py --port 8766 --runs app-390,pwa-390 --steps 01-summary,51-navi-home,52-navi-chapter,53-navi-stage1,54-navi-stage3` + 폭 320 · 글씨 아주 크게 · 어두운 모드.

### Task 8: 내보내기

- [ ] 서버 커밋 푸시 → `python tools/deploy-fn.py api --prod --dry-run` → `--prod` → 운영 스모크(`NAVI_ENV=prod`) — 줄이 아직 없으면 navi 0·주간 그대로.
- [ ] 앱 커밋 → `python tools/bump.py` → `python tools/preflight.py` → 푸시 → Actions → 라이브 `APP_BUILD` · 새 표식(`js/navi.js` 200 · `openNavi` 가 라이브 app.js 에).
- [ ] 운영 SQL(`~/.gocheok-backup/supa-prod` — users 사백 넘음 확인) → `python tools/sql-applied.py record supabase/navi_verses.sql --prod --note "네비게이토 73장(켠 채 · 문은 naviPublic)"` · `psalm_metrics.sql` 은 읽기 전용(넣지 않는다).
- [ ] 운영 스모크 다시 — navi 73 · 주간 최대 no < 1000.

### Task 9: 문서 · 기억

- [ ] `docs/notes/navigators.md` — 무엇 · 문(여는 날 할 일: `naviPublic` · `FEAT_SINCE.navi` · 설명서 한 장 · 열람 기록 `FEATURES` 에 `navi` · 네비게이토 이름 허락) · ⚠️ 번호·시드·세 값 · 시험.
- [ ] `CLAUDE.md` 표 한 줄 + 다음 작업 한 줄 · `backend-api.md`(getVerses 갈래 · naviPublic) · `lazy-load.md`(navi) · `psalm-still-waters.md`(isPsalmNo 범위) · 설계 문서 「바꾼 것」.
- [ ] 기억 `navigators-2026-10` + MEMORY.md 한 줄.
