# 네이티브 로그인 화면 (SwiftUI) — 설계

**날짜**: 2026-09-16
**배경**: `docs/superpowers/specs/2026-09-13-ios-app-design.md`에서 정한 아이폰 앱의 네이티브 기능 3가지(위젯·네이티브 푸시·네이티브 로그인 화면) 중 마지막이다. 위젯(`2026-09-14-ios-widget-today-verse`)과 네이티브 푸시(`2026-09-15-ios-native-push`)는 이미 배포·실기기 확인까지 마쳤다.

## 원안과 다른 점

원래 설계(2026-09-13 문서)는 "네이티브가 서버 `login` 액션을 직접 호출"이었다. 이번에 `app.js`를 조사한 결과, 앱을 켤 때마다(`routeAfterLoad → enterAfterLogin → syncProgress`, `app.js:538`) **이미 서버 `login` 액션을 스스로 호출**해 `user_id`·진도·복습을 받아오고 있음을 확인했다. 그러므로 네이티브는 **로컬(localStorage)에 로그인 정보만 심어 두면** 웹 쪽이 알아서 서버 등록·진도 병합을 완료한다. Swift에 서버 응답 구조(진도·복습·계정 병합 등)를 다시 구현할 필요가 없어져, 두 곳에 같은 로직을 두는 위험과 유지보수 부담이 크게 줄어든다.

## 전체 흐름

1. 앱을 처음 실행 — `UserDefaults`의 `hasLoggedInBefore` 플래그가 없으면 웹뷰 대신 SwiftUI 로그인 화면을 먼저 보여준다.
2. 이미 로그인한 적이 있으면(플래그 있음) 지금처럼 곧바로 웹뷰가 뜬다 — 기존 동작 그대로, 회귀 없음.
3. 로그인 화면에서 "확인"을 누르면:
   - 입력값을 검증한다(아래 "화면 구성").
   - `memorize-user` + `privacy-consent` 값을 담은 JSON을, 웹뷰가 실제로 뜨기 **전에** `WKUserScript`(`injectionTime: .atDocumentStart`)로 localStorage에 심는다.
   - `UserDefaults`에 `hasLoggedInBefore = true`를 저장한다.
   - 웹뷰를 `https://gocheok.onlybible.kr/?firstLogin=1`로 로드한다(아래 "첫 가입자 환영 카드" 참고).
4. `app.js`는 로그인 정보가 이미 있는 것으로 보고(`loadUser()`가 truthy) 진입 화면을 건너뛰고 곧바로 요약 화면으로 간다. 서버 등록·진도 병합은 `app.js`의 기존 `syncProgress()`가 그대로 처리한다 — 네이티브가 손댈 것이 없다.

## 화면 구성 (웹 로그인 폼과 1:1 대응)

- **구분**: 교구 / 교회학교 (라디오)
- **교구 분기**: 교구 8개 칩(믿음·소망·사랑·섬김·은혜·화평·기쁨·새가족 — `app.js`의 `GU_LIST`와 동일) + 목장(정규식 `^(\d+|남성)$`으로 검사 — `app.js`의 `MOK_RE`와 동일)
- **교회학교 분기**: 부서 9개 칩(사랑부·영아부·유아부·유치부·유년부·초등부·중등부·고등부·청년부 — `app.js`의 `BU_LIST`와 동일) + 학년(텍스트)
- **성명**
- **개인정보 수집·이용 안내 문구 + 동의 체크박스(필수)** — `index.html`의 `.privacy-box` 문구를 그대로 복사한다(다시 쓰지 않는다 — 문구가 두 곳에서 달라지는 것 자체가 심사 반려·성도님께 부정확한 안내를 하는 위험이라 CLAUDE.md에도 한 번 사고 난 자리로 적혀 있다). "자세히 보기"는 `https://gocheok.onlybible.kr/privacy/`를 사파리(SFSafariViewController)로 열어 본문 중복을 피한다.

⚠️ 교구 8개·부서 9개 목록과 목장 정규식은 Swift에 **정적으로 하드코딩**한다. 자주 안 바뀌는 고정 선택지이므로 서버 액션을 새로 만드는 것보다 낫다고 판단했다(위젯의 "이번주 말씀"과 달리 이건 매일 바뀌는 로직이 아니라 몇 달에 한 번 바뀔까 말까 한 선택지 나열이라, 두 곳에 있어도 위험이 낮다). 코드에 "`app.js`의 `GU_LIST`/`BU_LIST`/`MOK_RE`와 함께 고칠 것" 주석을 남긴다.

## 첫 가입자 환영 카드 연동

네이티브로 처음 가입한 분도 웹의 "축복 인사"(민수기 6:24-26 카드, `renderBlessing`)를 보게 하려면 `enterAfterLogin`이 `fresh:true`로 불려야 한다. 지금은 앱을 켤 때마다 도는 기본 경로(`routeAfterLoad`, `app.js:160` 부근)가 항상 `fresh` 없이 부르므로, 아주 작은 분기를 하나 추가한다:

```js
// routeAfterLoad() 안, 기본 진입 분기
const firstLogin = new URLSearchParams(location.search).get("firstLogin") === "1";
if (loadUser()) enterAfterLogin({ fresh: firstLogin }); else renderEntryScreen();
```

네이티브가 처음 로그인 완료 후 웹뷰를 `?firstLogin=1`로 열면 이 한 번만 환영 카드가 뜨고, 그다음부터는(플래그가 서 있어 로그인 화면 자체를 다시 안 보여주므로) 평소처럼 조용히 넘어간다.

## 네이티브 구현 지점

- `Main.storyboard`의 초기 화면을 SwiftUI 로그인 화면(`UIHostingController`)으로 바꾸거나, `AppDelegate.didFinishLaunchingWithOptions`의 아주 앞부분(누구도 아직 `window.rootViewController`의 `.view`를 읽지 않은 시점 — 현재 코드는 `installStatusBarBackground()`가 그 첫 접근이다)에서 플래그를 보고 분기한다. 플래그가 있으면(로그인 이력 있음) 지금과 완전히 같은 동작이라 회귀가 없다.
- 로그인 완료 시 Capacitor의 `CAPBridgeViewController`를 서브클래스해 `webView(with:configuration:)`를 오버라이드하고, 그 안에서 `WKUserScript(source: ..., injectionTime: .atDocumentStart)`를 `configuration.userContentController`에 추가한 뒤 `window.rootViewController`를 이 브리지 VC로 교체한다.
- ⚠️ 정확한 오버라이드 시그니처·타이밍은 이 프로젝트에 로컬 Xcode가 없어(클라우드 빌드만 가능) 문서·기억에 의존해 1차 구현한다. 위젯·푸시 때처럼 **Codemagic 실빌드에서 1~2차례 오류를 보고 고치는 과정**을 예상한다.

## 범위 밖

- **정보 변경(프로필 수정)**은 계속 웹이 담당한다 — 네이티브는 최초 로그인 화면 하나만 만든다.
- **로그아웃 후 재로그인**: 이 앱엔 로그아웃 기능이 없다(`clearUser()`가 정의는 돼 있으나 호출하는 곳이 없다 — 확인함). 따라서 네이티브가 로그아웃 이후 상태를 신경 쓸 필요가 없다.

## 확인 순서

1. Codemagic 빌드 성공(오버라이드 시그니처가 안 맞으면 이 단계에서 반복 수정)
2. TestFlight 앱을 완전히 삭제하고 재설치(깨끗한 최초 상태) → 네이티브 로그인 화면이 뜨는지, 제출 후 웹 요약 화면으로 바로 넘어가는지, 축복 인사 카드가 뜨는지 확인
3. 앱을 껐다 다시 켜서 로그인 화면이 다시 안 뜨는지(플래그 확인)
4. 관리자 통계(`admin-stats.html`)에서 신규 가입자가 정상적으로 잡히는지 확인(서버 `login` RPC가 정상적으로 새 사용자를 만들었다는 뜻)
