# 사역현황 · 사역 이력 확인 · 정정 신청 (2026-10-01)

> **언제 읽나:** 첫 화면 「사역현황」 묶음 · `renderMinistryHistory` · `api` `ministryHistory*` · 교회 어드민 `internalMyHistory`·`internalHistoryRequest`·`ministry_history_requests` 를 손볼 때
> 설계 `docs/superpowers/specs/2026-10-01-ministry-history-check-design.md` · 계획 `docs/superpowers/plans/2026-10-01-ministry-history-check.md`

- **문은 사역신청과 하나다(`ministryVisible()` · 서버는 기간·시험 참여자·관리자 비번).** 기간(12/13~12/27)이 끝나면 「사역 이력 확인」도 숨는다 — 친구 결정 「같이 오픈」. 늘 열고 싶어지면 게이트를 그때 나눈다.
- ⚠️ **`b.preview` 는 받지 않는다** — 서버가 확인할 수 없다. 미리보기 화면은 관리자 비번(`minPw()`)으로만 통과한다.
- **본인 찾기 규칙은 교회 어드민 `people-match.ts` `matchLoginPerson` 한 곳**(교구 = 교구+목장+이름, 교회학교 = 부서+이름 · `sameAffiliation` 그대로). ⚠️ 그 파일의 `sameAffiliation`·`mokNumber` 를 고치면 앱 화면도 바뀐다. 앱 쪽에 규칙을 복사하지 말 것.
- ⚠️ **로그인은 본인 확인이 아니다** — 다른 분 이름·소속으로 들어오면 그분 기록이 보인다(친구 확인). 그래서 보이는 칸을 홈페이지 명단에 오르던 칸(연도·부서·팀·직책·직분)으로만 좁혔고 **신청만으로 기록이 바뀌지 않는다.** 칸을 늘리려면 이 전제부터 다시 볼 것.
- **교회 어드민 함수의 새 입구:** `x-internal-key` 머리가 있으면 토큰 검사 **앞에서** 내부 갈래로만 간다. 내부 액션은 `ACTION_ROLES` 에 없다(토큰으로 부르면 unknown-action — 시험이 본다).
- **kind·status 글자는 세 곳**(SQL 008 CHECK · `history-check.ts` · `app.js` `MH_*`). 보이는 말만 바꾸려면 `MH_KIND_TEXT`.
- **직분은 정정하지 않는다(교적 기준 · 2026-10-01 친구 결정).** 「직분이 틀려요」(wrong_position)를 세 곳 모두에서 뺐다 — 되살리지 말 것. 줄의 그해 직분 표시는 그대로.
- **응답 칸은 `historyRowOut`·`requestOut` 이 정한다** — 교인ID·`user_id`·맞춤 근거·그때 목장을 싣지 않는다(`tests/history-check.dev.test.mjs` 가 키 집합과 숫자·uuid 누출을 본다).
- 앱 계정이 합쳐지면(`member-merge`) 옛 계정의 정정 신청은 새 계정 화면에 안 보인다(표가 `user_id` 로 묶는다 — 합치기 코드는 이 표를 모른다). 생기면 담당자가 처리하면 된다.
- **담당자 처리 메뉴 「📮 정정 신청」 — 2026-10-01 개발 끝(가지 history-check) · 운영은 앞선 계획 Task 9 와 함께.** ⚠️ **12/13 신청 기간 전에 운영에 있어야 한다** — 기간이 열리면 성도님 모두에게 단추가 보인다.

## 받아들인 위험(2026-10-01 친구 확인)

- 「찾음/못 찾음」 자체가 「이 목장에 이 이름이 명부에 한 분 있다」를 알려 준다(기록 0줄이어도) — 문이 열린 동안(시험 참여자 · 12/13~12/27)만.
- 남의 이름으로 들어와 그분 줄마다 「내 것이 아니에요」를 걸 수 있다(진짜 본인은 「신청함」에 막힌다) · 계정을 마음대로 만들어 「찾아 주세요」를 많이 넣을 수 있다 → §7 담당자 메뉴가 처리 전 본인 확인을 거친다.
- 정정 신청 글·담당자 답은 같은 이름·소속으로 들어오는 사람에게 보인다(안내·창 문구로 알림).
- **MH_LIVE 스위치** — 운영 서버(교회 어드민 내부 갈래·정정 신청 표)가 올라가기 전까지 운영 주소에서는 첫 화면 「사역현황」 묶음을 숨긴다(🤝 는 「함께」 원래 자리로). 개발·localhost(`window.SUPA.env === "dev"`)에서는 늘 켜진다. 계획 Task 9(운영 반영)에서 `const MH_LIVE = true;` 로 바꾼다.
- 과제 9 합칠 때 autumn-excuse 가지와 `Deno.serve(` 앞·import 덩어리에서 충돌 — 풀 때 `x-internal-key` 갈래가 토큰 검사보다 **앞에** 남아야 한다.
- 운영에서 문을 열기 전에 b6 의 맞춤(person_id 잇기)이 끝나 있어야 한다 — 안 그러면 「기록 0줄」이 보여 「빠진 사역」 신청이 쏟아진다.

## 담당자 처리 메뉴 「📮 정정 신청」(2026-10-01)

설계 `docs/superpowers/specs/2026-10-01-ministry-history-requests-admin-design.md` · 계획 `docs/superpowers/plans/2026-10-01-ministry-history-requests-admin.md`(교회 어드민 worktree `history-check`).

- **액션 둘**(역할 `ministry`): `historyRequestList`·`historyRequestSet`. 카카오 토큰으로 담당자가 부른다 — 성경암송 쪽 `api` 는 관여하지 않는다.
- **「반영 안 함」은 답(사유)을 꼭 적어야 저장된다**(`need-answer`). 그래서 사유 없이 「반영 안 함」으로 끝나는 신청은 없다.
- **「내 것이 아니에요」(`not_mine`)를 「반영」으로 처리할 때만 본인 확인 체크(`verified===true`)가 필수다**(`need-verified`) — 확인 없이 남의 줄을 빼면 안 된다.
- **2026-10-01 친구 결정 — 이미 `반영`인 줄의 답만 고칠 때는 본인 확인을 다시 묻지 않는다**(`need-verified` 는 `not_mine` 을 `반영`으로 **처음** 바꿀 때만 · `requestSetBlock` 이 `cur.status` 를 본다).
- **상태·답이 지금 줄과 같으면 쓰지도 「바꾼 기록」에 남기지도 않는다**(`requestSetNoop` → `{ ok:true, same:true }` · 화면도 보내기 전에 먼저 본다).
- **알림은 없다.** 처리해도 성도님께 푸시·메일이 가지 않는다 — 신청자는 정정 신청 화면에서 상태를 다시 봐야 안다.
- **[그 줄 열기]는 새 탭으로 연다**(`target="_blank"`) — 같은 탭으로 가면 처리 창이 닫혀 적던 답이 사라진다. b6(사역 이력) 세션의 `?row`·`?q` 를 기다린다 — 아직 안 받으면 「📜 사역 이력」 첫 화면만 열린다(b6 에 부탁해 2026-10-01 ministry-history 가지 78b8760 에 들어감).
- **직분은 정정하지 않는다** — 「직분이 틀려요」(`wrong_position`)는 앱 화면·교회 어드민 서버·SQL CHECK·시험 어디에도 없다(교적 기준 · 친구 결정). 줄마다 보이는 그해 명단의 직분은 그대로 보여 준다.

## 플레이스토어 앱에서 숨김(2026-10-02)

- **무엇:** 플레이스토어 앱(TWA) 창에서는 첫 화면 「사역현황」 묶음을 통째로 숨긴다 — 묶음 제목 · 🤝 사역신청 · 🗂️ 사역 이력 확인(`MH_LIVE` 가 꺼졌을 때 「함께」에 서는 🤝 도). 시험 참여자도 숨는다. NEW 배지(`newestNewFeat`)는 문(`ministryVisible()`)이 닫혀 있으면 `ministry` 를 세지 않는다 — 안 보이는 단추가 하나뿐인 NEW 를 가져가지 않게(플레이스토어 숨김뿐 아니라 **기간 밖**에도 — 그전에는 기간 밖에 숨은 🤝 가 NEW 를 가져갈 수 있었다).
- **왜:** 친구 요청 — 안드로이드 심사가 통과할 때까지. 숨는 곳은 **플레이스토어 앱뿐**이다(웹·아이폰 앱은 그대로) · 묶음 **통째로**(친구 결정).
- **어떻게 가리나:** `app.js` `ministryHiddenOnPlay()` = `MINISTRY_HIDE_ON_PLAY && (openedByPlayApp() || (isPlayStoreApp() && !isBrowserTab()))` 를 문(`ministryVisible()`)이 관리자 미리보기 줄 **바로 다음**에 본다(`?preview=ministry` 는 앱에서도 열린다). 두 화면은 첫 화면 단추로만 들어가므로 문 한 곳이면 된다 — `tests/ministry-history.test.cjs` 가 사역 단추 셋이 모두 `ministryVisible() && …` 안에 있는지 본다.
  - 표식 둘 다 TWA 가 열 때 주는 referrer `android-app://kr.onlybible.gocheok.memorize…` 를 보고 **같은 줄에서** 적는다(시험판 `….dev` 도 걸린다):
    - **이번 실행 표식** `openedByPlayApp()` — sessionStorage `play-app-session`. 이 창(탭)이 닫히면 사라지고, 보통 크롬 탭은 이 referrer 를 받지 않아 생기지 않는다. 「🚪 내 정보 지우기」(`clearPersonalData` 의 `sessionStorage.clear()`) 뒤에도 이것만은 다시 남긴다 — 안 그러면 앱에서 지운 뒤 다음 분이 들어온 첫 화면에 샌다.
    - **기기 표식** `isPlayStoreApp()` — localStorage `play-store-app`. 「이 폰에서 앱을 연 적이 있다」일 뿐이다(아래 ⚠️).
- ⚠️ **기기 표식은 크롬 탭에서는 안 본다(`isBrowserTab()` = `matchMedia('(display-mode: browser)')`).** TWA 는 크롬과 저장소를 같이 써서, 앱이 깔린 폰은 보통 크롬 탭에서도 표식이 보이고 **앱을 지워도 남는다** — 표식만 보면 그 폰의 웹에서도 숨어 「웹은 그대로」와 어긋난다. `matchMedia` 가 없거나 던지면 「탭이 아니다」로 본다(숨기는 쪽 — 심사에는 그쪽이 안전하다).
- ⚠️ **맞춤 탭 대비가 이번 실행 표식이다.** TWA 가 사이트 확인(`assetlinks.json`)에 실패하면 맞춤 탭으로 열린다(`android-app/twa-manifest.json` `fallbackType: "customtabs"`) — 그때는 창 모양이 `browser` 라 기기 표식 + 창 모양으로는 못 잡는다. 이번 실행 표식은 창 모양과 상관없이 숨긴다.
- ⚠️ **실기기 미확인(2026-10-02)** — 아래 가정 셋은 코드·문서로만 세웠다. 프로덕션 심사 제출 **전에** 아래 「심사 전 확인」을 한다.
  1. TWA 창은 `display-mode: standalone` 으로 잡힌다(`twa-manifest.json` `display: "standalone"`).
  2. TWA 는 첫 화면을 열 때 `document.referrer` 를 `android-app://kr.onlybible.gocheok.memorize` 로 준다.
  3. 맞춤 탭으로 떨어졌을 때도 같은 referrer 를 준다(못 주면 맞춤 탭에서는 기기 표식도 이번 실행 표식도 안 생겨 **묶음이 보인다**).
  - 남는 틈: 앱이 깔린 폰에서 홈 화면에 따로 올린 웹앱(standalone)도 숨는다 · referrer 없이 새로 열린 앱 창(이번 실행 표식 없음)은 기기 표식 + standalone 으로만 잡힌다.
- 🔎 **심사 전 확인(내부 테스트 판 · 실기기):** ① 플레이스토어 앱 첫 화면에 「사역현황」 묶음(🤝·🗂️)이 **없다** ② 같은 폰의 **보통 크롬 탭**에서 🧪 시험 참여자로 들어가면 **있다**. 다르면 PC 크롬 `chrome://inspect` 로 앱 창을 붙잡아 콘솔에서 `localStorage['play-store-app']` · `sessionStorage['play-app-session']` · `document.referrer` · `matchMedia('(display-mode: browser)').matches` 를 본다(앱 창이면 `sessionStorage` 쪽이 `"1"` 이거나, `localStorage` 쪽이 `"1"` 이고 `matchMedia(…browser)` 가 `false` 여야 숨는다). 같은 단계가 `store/README.md` 「단체 계정」 진행 상황에 있다.
- ⏰ **되돌리기:** 플레이스토어 심사가 통과한 날 `app.js` `const MINISTRY_HIDE_ON_PLAY = false;` → `python tools/bump.py` → 푸시. 검사는 스위치의 지금 값을 박지 않아 그대로 통과한다. 같은 알림이 `CLAUDE.md` 「플레이스토어 출시」 바로 아래 ⏰ 줄 · `store/README.md` 「단체 계정」 진행 상황에 있다.
- **일부러 그대로 둔 것:** 설정 「🔒 관리 페이지 → 🤝 사역관리 페이지」(`MANAGE_LINKS` — 담당자 입구이고 페이지가 스스로 암호를 받는다) · 앱 안 개인정보 안내의 사역 신청·「사역 이력 확인」 문구(모으는 것을 적은 글이라 숨기는 동안에도 사실이다).
