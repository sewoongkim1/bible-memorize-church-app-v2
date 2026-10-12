# 필요할 때 받는 화면 코드(지연 로딩 · 2026-10-12)

> **언제 읽나:** `index.html` 의 `<script>` 를 더하거나 빼거나, `js/edu.js`·`js/duty.js` 의 전역을 `app.js` 에서 새로 부를 때, 새 기능 모듈을 지연으로 둘 때

**한 것:** 🎓 교육(`js/edu.js` · 48KB)·🙋 봉사 당번(`js/duty.js` · 92KB)은 문이 닫혀 🧪 시험 참여자만 쓴다 — `index.html` 에서 뺐고 `app.js` 의 `loadLazyJs(name)` 가 필요할 때 받는다.
첫 화면에서 요청 둘 · 140KB(gzip 44KB)를 안 받는다(`app.js` 는 +5KB · gzip +1.5KB).
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
