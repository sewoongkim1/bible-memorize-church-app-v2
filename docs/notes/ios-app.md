# 아이폰 앱 — 껍데기와 웹

> **언제 읽나:** `ios-app/` 의 Swift 를 고칠 때, 또는 웹(app.js)에서 「아이폰 앱이면 …」 을 새로 짤 때

## 무엇이 어디서 오나

아이폰 앱은 **gocheok.onlybible.kr 을 불러오는 껍데기**다(`ios-app/capacitor.config.json` 의 `server.url`).

| 고친 곳 | 성도님께 닿는 길 |
|---|---|
| `app.js` · `style.css` · `index.html` · `js/*.js` (웹) | 푸시 = 배포. 앱 안에서도 다음에 열 때 새 화면 — **App Store 업데이트 필요 없음** |
| `ios-app/` 의 Swift · Info.plist · 아이콘 · 위젯 (네이티브) | Codemagic 빌드 → TestFlight → 심사 → App Store. 성도님 폰에는 **자동 업데이트로 하루~며칠** 걸려 닿는다 |

⚠️ **웹은 늘 최신인데 껍데기는 성도님마다 판이 다르다.** 새 네이티브 기능을 부르는 웹 코드는
「있으면 쓰고 없으면 조용히 넘어가게」 짠다 — 옛 껍데기에는 그 기능이 없다.

## 껍데기 판 표식 (1.1.0 다음 판부터 · 2026-09-22)

애플은 앱 안에서 「새 판이 나왔어요」 를 알려 주지 않는다(자동 업데이트를 끈 분은 App Store 목록에만 뜬다).
그래서 웹이 껍데기 판을 알 수 있게 표식을 심는다.

- **심는 쪽:** `AppDelegate.installAppInfoMarker()` — `window.GOCHEOK_APP = {platform:'ios', version, build}`.
  값은 Info.plist(`MARKETING_VERSION` · Codemagic 이 올린 빌드 번호)에서 읽으니 **손으로 맞출 곳이 없다.**
  `WKUserScript`(문서 시작 때 · 이후 모든 문서) + 지금 문서에 `evaluateJavaScript` 한 번(첫 문서가 스크립트를 놓쳤을 때).
  늦게 심기면 `gocheok-app` 이벤트가 난다.
- **받는 쪽:** `js/push.js` 의 `nativeAppInfo()` — 앱이 아니면 `null`, 앱인데 표식이 없으면 `version:""`
  (= **1.1.0 이하**, 표식이 들어가기 전 판). 숫자와 점만 남긴다.
- **확인하는 곳:** 설정 맨 아래 「📱 아이폰 앱 1.1.1 (빌드 N)」 — 새 빌드를 TestFlight 로 받아 이 줄이 뜨면 표식이 들어간 것이다.
  표식이 없는 옛 판·웹 브라우저에서는 줄 자체가 안 보인다.

## 아직 안 만든 것 — 옛 판에 업데이트 안내

표식이 깔린 뒤, 필요해지면 **웹만 고쳐서** 붙일 수 있다(App Store 를 다시 거칠 필요 없음).
`nativeAppInfo().version` 이 최소 판보다 낮거나 `""` 이면 app.js 의 「🔄 새 버전이 나왔어요」 배너(`showUpdateBanner`)와
같은 모양으로 안내하고, 단추는 `https://apps.apple.com/app/id6811724527`(App Store 앱 ID — `codemagic.yaml` 의 `APP_ID`).
최소 판을 관리자 설정으로 두려면 `app_config` 키 하나가 새로 필요하다 — ⚠️ 허용 목록이 화면·서버·DB 세 곳인지 먼저 볼 것.

## 판 번호 올리기

- **빌드 번호**는 Codemagic 이 TestFlight 최신 + 1 로 저절로 올린다(`codemagic.yaml` 「빌드 번호 자동 증가」).
- **판(MARKETING_VERSION)** 은 `ios-app/ios/App/App.xcodeproj/project.pbxproj` 에 두 곳(Debug·Release) — 손으로 올린다.
  App Store 에 **승인된 판과 같은 번호로는 새로 낼 수 없다**(심사 중·반려된 판이면 같은 번호에 빌드만 갈아 끼울 수 있다).
  위젯 판은 앱 본체를 따라간다(커밋 7335ac8).
