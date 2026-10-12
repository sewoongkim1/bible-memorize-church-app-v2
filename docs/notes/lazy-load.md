# 필요할 때 받는 화면 코드(지연 로딩 · 2026-10-12)

> **언제 읽나:** `index.html` 의 `<script>` 를 더하거나 빼거나, `js/edu.js`·`js/duty.js`·`js/prayer.js`·`js/pilsa.js`·`js/ministry.js` 의 전역을 `app.js` 에서 새로 부를 때, 새 기능 모듈을 지연으로 둘 때, `app.js` 에서 화면을 더 떼어 낼 때

**한 것:** 🎓 교육(`js/edu.js` · 48KB)·🙋 봉사 당번(`js/duty.js` · 92KB)은 문이 닫혀 🧪 시험 참여자만 쓴다 — `index.html` 에서 뺐고 `app.js` 의 `loadLazyJs(name)` 가 필요할 때 받는다.
첫 화면에서 요청 둘 · 140KB(gzip 44KB)를 안 받는다(`app.js` 는 +5KB · gzip +1.5KB).
**app.js 나누기 1단계(2026-10-12 · 가지 `perf/app-split-1`):** 🙏 가정 축복 기도문 **화면**(`js/prayer.js` · 35KB)·✍️ 성경필사 노트 신청(`js/pilsa.js` · 31KB)을 `app.js` 에서 떼어 냈다 — `app.js` 768KB → 706KB(gzip 237KB → 218KB · LF 기준). 함수 이름은 그대로이고 들어오는 길만 `openPrayerBook(idx)`·`openPilsaApply()`(`app.js` · `withLazyJs` + 받기 실패 알림)로 모았다.
기도문은 첫 화면 단추가 모두에게 보여 **미리 받지 않고 누를 때** 받는다(미리 받으면 바이트가 안 준다) · 위젯 `?w=prayer` 는 `lazyJsForUrl` 이 말씀과 함께 받는다 · 필사는 확인 번호 문을 묻는 동안 받는다.
`app.js` 에 남긴 것(옮기면 안 된다 — 시험이 본다): `loadPrayers`·`prayToday`·`prayFill`(`tests/widget-parity.py` 가 운영 사이트에서 부른다) · 묵상 창 「🙏 기도」(`fetchTodayBlessing`·`openBlessingModal`·`prayFillHtml`) · `PRAY_ORN`(`js/psalm.js`) · `logFeature` · `pilsaPhoneFmt`·`pilsaPhoneOk`(사역신청·`js/events.js`).
**2단계(2026-10-12 · 가지 `perf/app-split-2`):** 🤝 사역신청·🗂️ 사역 이력 확인(`js/ministry.js` · 86KB · 두 화면이 한 파일)을 떼어 냈다 — `app.js` 706KB → 621KB(gzip 218KB → 193KB · LF 기준 · `js/ministry.js` 는 87KB · gzip 27KB). 들어오는 길은 `openMinistry()`·`openMinistryHistory()`(첫 화면 단추 둘뿐 · 알림·`?go=` 진입은 없다 · `?preview=ministry` 는 문만 연다) — 확인 번호 문을 묻는 동안 받고, 신청 기간엔 모두에게 보이니 **미리 받지 않는다**. `app.js` 에 남긴 것: 문 `ministryVisible`·`ministryYear`·기간·시험 참여자 캐시(첫 화면 · `tests/ministry-history.test.cjs` 의 문 시험) · **`MIN_POSITIONS`**(`js/events.js` 가 처음부터 `typeof` 로 빌려 쓴다 — 옮기면 제 사본으로 조용히 갈라진다) · `pilsaPhoneFmt`·`pilsaPhoneOk`. `tests/ministry-history.test.cjs` 는 순수 묶음·`minEsc`·`mhAsk` 를 `js/ministry.js` 에서, 문·`clearPersonalData` 는 `app.js` 에서 자른다. `tools/screen-sweep.py` 의 30·40~43 은 먼저 `loadLazyJs('ministry')`(`_MIN_LOAD`).
`js/psalm.js`·`js/events.js` 는 **그대로 처음부터** 받는다 — 첫 화면·진도 저장(`isPsalmNo`)·🏅 알약(`evtLoad`·`getEvtDeepLink`)이 동기로 부른다.

**받는 때(셋):**
1. 첫 화면에 🎓/🙋 단추가 보이면 한가할 때 미리(`lazyJsSoon` — `requestIdleCallback`) → 누를 때 기다림이 없다.
2. 단추를 누르면(`loadLazyJs` 를 먼저 걸고 확인 번호 문 `lifeEnter` 를 묻는 동안 함께 받는다 → `withLazyJs` — 이미 실려 있으면 그 자리에서 부른다).
3. 알림 주소로 들어오면 — 처음 실행(`?edu=`·`?duty=1`)은 `app.js` 가 읽히는 순간 받기 시작하고(`_lazyDeepP`) `loadVerses` 가 `routeAfterLoad` **앞에서** 기다린다(말씀 받기와 함께라 보통 더 안 기다린다 · 10초 넘으면 안 기다린다). 이미 열린 창(서비스워커 `from-push`)은 받은 뒤 `fromPushOpen`.

**⚠️ 지연으로 둘 모듈에서 지킬 것**
- **첫 화면이 동기로 부르는 것은 그 파일에 두지 않는다.** 문 판단(`eduVisible`·`dutyVisible`·캐시 키)은 `app.js` 에 있다 — 그래서 지연이 된다. 딥링크 읽기(`eduTakeDeepLink`·`dutyTakeDeepLink`)는 모듈에 있지만 위 3번으로 먼저 받는다.
- **`app.js` 에서 부르는 자리는 모두 `typeof X === "function"` 로 지킨다**(받기 실패 · 아직 안 받음). `tests/lazy-load.test.cjs` 가 `app.js` 가 부르는 두 파일의 전역을 목록으로 묶어 두었다 — 새로 부르면 걸린다. 첫 화면에서 부르는 것이면 지연을 풀거나 그 작은 판단을 `app.js` 로 옮길 것.
- **판 태그를 새로 만들지 않는다.** 주소의 `?v=` 는 `index.html` 이 `app.js` 를 부른 값(없으면 `APP_BUILD`) — `bump.py` 가 모든 태그를 같은 값으로 올리므로 따로 올릴 것이 없다. 그래서 `tools/bump.py` `TAGGED` 에서 두 파일을 뺐다(preflight [2-1] 이 `index.html` 과 맞대 본다 — 다시 `index.html` 에 넣으면 `TAGGED` 에도).
- **모듈의 맨 위 코드는 받는 순간 돈다**(예: `duty.js` 끝의 `visibilitychange` 듣기). 처음부터 있어야 하는 듣기는 `app.js` 에.
- **이름이 `app.js` 의 `let`/`const` 와 같으면 받는 순간 SyntaxError** — 전에는 앞에 실려 `app.js` 쪽이 덮었다. 지금은 겹치는 이름이 없다(2026-10-12 확인).
- 사이트 목록: 파일은 `js/` 에 있어 `tools/site.py` 로 나간다. preflight [4] 는 코드가 조립하는 주소를 못 보니, **`js/` 밖에 두지 말 것.**
- 서비스워커(`sw.js`)는 화면 밖 요청을 네트워크로 그대로 넘겨(캐시 목록 없음) 충돌이 없다. 아이폰 앱·플레이 앱도 같은 웹이라 같은 길이다.
- `tools/screen-sweep.py` 의 당번 단계(44~50)는 화면을 직접 그리므로 먼저 `loadLazyJs('duty')` 를 기다린다(`_DUTY_CLEAR`). 화면을 직접 그리는 시험 도구를 새로 짜면 같은 줄을.
- **화면을 떼어 낼 때(1단계에서 한 차례):** ① 그 구간의 맨 위 이름마다 밖(app.js 나머지·처음부터 실리는 js·`tests/`·`tools/`)에서 부르는 곳을 센다 — 밖에서 부르는 것은 남기거나 `open…` 하나로 모은다 ② 그 구간이 쓰는 밖의 전역은 받은 뒤에 있으니 괜찮다(app.js 가 먼저 다 돈다) ③ 맨 위 줄 가운데 선언이 아닌 것(듣기 걸기 등)이 없는지 ④ 시험 도구가 그 이름을 직접 부르는지(`screen-sweep.py` 의 `prayFullClose`·`prayRot` 는 try 안이라 괜찮다) ⑤ `tests/lazy-load.test.cjs` 의 `MODS` 에 한 줄 · 「이름 겹침」 시험의 파일 목록에 한 줄.
- **확인한 것(2단계):** `screen-sweep.py --seed --compare` 로 옛 판(origin/main)과 8조건 × 13화면(첫 화면·더 보기·게시판·기도문·필사·묵상·이벤트·🤝·🗂️ 넷·당번) 대조 · 헤드리스로 🧪 시험 참여자 흉내(`ministry-tester::<id>`)를 세워 진짜 단추 🤝·🗂️ 를 눌러 옛 판과 같은 화면 · 첫 화면에서는 `js/ministry.js` 를 안 받고 누를 때 한 번.
- **확인한 것(1단계):** `python tools/screen-sweep.py --seed` 로 옛 판(origin/main)과 새 판을 3조건 × 10화면(첫 화면·더 보기·기도문 넷·필사·묵상·앨범·설명서) 대조 — 배치 지문이 바뀐 화면 0 · 오류 0 · 첫 화면 글 같음. 단추·묵상 창 「축복 기도문」·`?w=prayer`·`?preview=prayer`·`?preview=pilsa` 로 열리는 것도 헤드리스로 봤다.
- **실기기 확인 끝(2026-10-12 · 친구 · 🧪 시험 참여자 폰):** 🎓 교육·🙋 봉사 당번 단추와 그 알림 누르기(앱 꺼짐·켜짐) · 🙏 기도문 첫 화면 단추·**위젯 누르기**·묵상 창 「축복 기도문」 · ✍️ 필사 신청 · 🤝 사역신청·🗂️ 사역 이력 확인 — 모두 전처럼 열렸다.

## 다음 후보(밖의 전역에 덜 기대는 차례 · 2026-10-12 셈 · 옛 1번 사역신청은 2단계에서 뗐다)
| 차례 | 화면 | 크기 | 밖에서 부르는 것 | 걸리는 것 |
|---|---|---|---|---|
| 1 | 💬 내게 주시는 말씀(`renderSermonChat` 구간) | 약 16KB | `renderSermonChat`·`scAsk` · `scEmphasis` 는 밖 다섯 곳이 쓴다 → `app.js` 에 남길 것 | 쓰는 밖의 전역 6 · AI 답 알리기 순수 구간(시험)이 그 안에 있다 |
| 2 | 📖 말씀 앨범(`albumHideRef` ~ `renderRanking` 앞) | 약 29KB | `renderAlbum` · 재생기(`albumPlayStart`·`albumPlayStop`·`verseItemsFor`·`albumDurText`)와 `keepScreenAwake` 는 구절 목록·기도문 크게 보기도 쓴다 → 재생기는 남기고 화면만 | 쓰는 밖의 전역 27(TTS `_ttsGen` 은 `app.js` 그대로 · `docs/notes/album-audio.md`) |
| 3 | 📘 사용 설명서(`MANUAL`·`renderManual`·`renderHelp`) | 약 40KB | `renderManual`(설정·`?preview=widget`) | `tests/board-report.test.cjs`·`event-auto.test.cjs` 가 `function renderPrivacyInfo(` ~ `function renderHelp(` 를 `app.js` 에서 자른다 · 플레이 표식 함수(`isPlayStoreApp` 등)가 바로 옆 — 그것들은 남긴다 |
