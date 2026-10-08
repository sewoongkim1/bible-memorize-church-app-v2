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
- **판(MARKETING_VERSION)** 은 `ios-app/ios/App/App.xcodeproj/project.pbxproj` 에 **네 곳**(앱·위젯 × Debug·Release) — 손으로 올린다.
  위젯의 Info.plist 가 `$(MARKETING_VERSION)` 을 읽으므로(커밋 7335ac8) **네 곳을 모두 같은 값으로** 둔다 —
  앱과 위젯 판이 어긋나면 빌드 경고(「must match that of its containing parent app」)가 난다.
  `sed 's/MARKETING_VERSION = 1.1.0;/…1.1.1;/g'` 처럼 한 번에 바꾸고 4를 센다.
  ⚠️ App Store 에 **승인된 판과 같은 번호로는 TestFlight 업로드부터 거부된다**(오류 90062/90186 — Codemagic Publishing
  단계 실패로 보인다, 커밋 5da610b). 심사 중·반려된 판이면 같은 번호에 빌드만 갈아 끼울 수 있다.
- 판 이력: 1.0.1(2026-09-19 출시) · 1.1.0 위젯(2026-09-22 출시) · **1.1.1 = 다음 빌드**(판 표식 · 2026-09-22 에 번호만 올려 둠 · **2026-10-07 「돌려 보기」 위젯 더함** — 네 장이 30분마다 저절로 · 오른쪽 위 날짜·시각 · 설계 `docs/superpowers/specs/2026-09-20-ios-widgets-design.md` ⑦ · ⚠️ 맥 컴파일 미확인).


## iOS 2단계 상세 — 위젯·네이티브 로그인·요절 배너 오버레이·실기기 버그 다섯 (2026-09-16~18 · CLAUDE.md 에서 옮김 2026-10-08)

- [x] **iOS 2단계(네이티브 기능 3종) — 위젯·네이티브 로그인 화면 실기기 확인 완료(2026-09-16).**
      설계 `docs/superpowers/specs/2026-09-13-ios-app-design.md`(총괄)·
      `2026-09-16-ios-native-login-design.md`(로그인)·계획 `docs/superpowers/plans/2026-09-16-ios-native-login.md`.
      네이티브 로그인은 서버를 직접 안 부르고 localStorage만 심어 웹의 기존 `syncProgress()`가
      이어받는 방식 — 실기기에서 신규/기존 계정 매칭·진도 복원까지 확인됨.
      부수적으로 발견해 고친 것(전부 커밋됨): 정보변경 화면 스크롤 위치 안 지워지던 버그
      (`window.scrollTo(0,0)` 누락) · Capacitor 기본 샘플 아이콘 → 교회 로고 교체 · 알림 권한
      요청이 로그인 전에 뜨던 순서 문제 · `bounces=false`의 부작용으로 가로 스크롤이 안
      돌아오던 문제(KVO로 원천 차단).
      **3단계(App Store 정식 심사 제출) — 2026-09-16 실제로 제출 완료.** 준비물:
      `자료/store/listing-ios-ko.txt`(설명·키워드·App Review 로그인 안내, 네이티브 기능 명시) ·
      `자료/store/screenshots-ios/real-*.png`(실기기/시뮬레이터로 직접 찍은 진짜 화면 10장,
      1242×2688 — 처음엔 웹을 흉내 낸 1290×2796으로 만들었다가 업로드가 거부돼 정정함.
      이름·진도 숫자가 찍힌 자리는 흐림 처리함) · `자료/store/README.md`의 "App Store(iOS) 등록
      준비물" 절(App Privacy 세부정보 매핑·연령 등급·수출 규정 전부 포함, 실제 제출 문답까지 반영).
      아이패드는 실기기 미확인이라 지원 범위에서 뺐다(`TARGETED_DEVICE_FAMILY`를 아이폰 전용 1로) —
      이 설정이 반영된 새 빌드로 제출했다. 푸시는 마케팅 문구·심사 메모에서 일부러 안
      내세웠다(위젯·로그인만으로 4.2 대응 근거 충분).
      App Privacy 설문에서 주의할 점: 데이터 수집 여부는 반드시 "예"(이름·소속·진도를
      모으므로) — 처음에 "아니요"가 기본 선택돼 있어 그대로 두면 실제와 다른 신고가 된다.
      게시판 글·사진 같은 사용자 콘텐츠도 "목록엔 user_id를 안 보여준다"는 것과
      "서버 DB에서 계정과 안 연결돼 있다"는 건 다른 이야기 — 실제로는 연결돼 저장되므로
      "신원에 연결됨 = 예"가 맞다(글쓴이 본인 수정·삭제, 관리자 확인 때문).
      **심사 통과·배포 준비됨(2026-09-18 확인).**
      **승인 후 새로 발견한 버그(2026-09-18) — 요절 고정 배너가 키보드 중 사라짐:**
      암송/빈칸 화면 상단 `.test-ref-sticky`(`position:fixed`)가 iOS 키보드가 뜬 채로는
      WKWebView가 다시 그리기를 못해(실기기 영상으로 확인) 스크롤 중에만 잠깐 보였다 사라짐.
      CSS만으로 네 번 시도(숨기기→반려 · visualViewport 보정→위치 어긋남 · 조건부 계산은
      과거에 이미 실패했던 방식임을 뒤늦게 발견해 되돌림 · GPU 레이어 승격→고정 대신
      스크롤을 따라감) 모두 실패해, **AppDelegate.swift에 네이티브(UIKit) 오버레이를
      새로 추가**(`installVerseRefOverlay`·`startVerseRefPolling`·`pollVerseRef`, 커밋
      `37d849d`) — window 위에 진짜 네이티브 뷰를 얹어 0.4초마다 웹의 `.test-ref-sticky`
      textContent를 읽어와 그대로 보여준다. 웹 쪽 배너는 네이티브 앱에서
      `body.native-app-hide-ref`로 visibility만 숨김(텍스트는 계속 읽혀야 해서 display:none은
      안 씀). **실기기로 확인·완결(2026-09-18 같은 날 저녁)** — 배너 자체는 잘 떴고,
      이어진 실기기 테스트로 다섯 가지를 더 발견해 전부 고쳤다:
      ① **사파리 한글 조합 오판정** — `setupChallengeTyping`(도전 등 공용)이 `isComposing`
      이벤트에만 의존해 조합 타이밍이 틀어지면 오답 판정이 잘못됐다(`setupAutoCheck`처럼
      `isComposingJamo`로 값 자체를 보게 고치고, 즉시검사·300ms·1200ms 세 겹 안전망을 둠 —
      자음/모음만 남으면 영영 "조합 중"으로 오판되던 것(안드로이드 제보)도 이걸로 해결).
      ② **다음 빈칸 포커스 시 화면이 크게 튐** — 원인은 iOS WebKit(사파리·아이폰 크롬 전부
      같은 엔진)의 자동 포커스 스크롤. `focus({preventScroll:true})`로 원천 차단.
      ③ **단계 완료 뒤 자판 자동 안 뜸** — `showStageDoneModal`의 `go()`와 `checkAllComplete`의
      반복해서 쓰기 경로가 화면 전환을 `setTimeout`으로 미뤄 사용자 탭과 끊어졌다. 지연을 없앰.
      ④ **네이티브 배너 폭·가림** — 처음엔 글자 길이만큼 좁게 떠서 `leading/trailing`을
      등호 제약으로 바꿔 넓혔다. 그 뒤 긴 구절 첫 줄이 배너에 가리는 문제는 padding을
      아무리 올려도(50→115px) 안 고쳐졌는데, **원인은 padding이 아니라 스크롤 보정을 꺼둔
      것**이었다(②를 고치며 "출렁거림" 오해로 `scrollIntoCenter`를 꺼둔 채였다) — 다시 켜고
      `.word-input`에 `scroll-margin-top`(네이티브 전용)을 더해 해결.
      ⑤ **WKWebView 리소스 캐시** — 앱은 완전종료 후 재실행해도 옛 CSS·JS를 계속 썼다
      (사파리는 정상 반영됨). `didFinishLaunchingWithOptions`에서 매번
      `WKWebsiteDataStore.default().removeData(diskCache+memoryCache)`로 비운다
      (localStorage·쿠키는 안 건드려 로그인 상태는 유지). ⚠️ **"고쳤는데 화면이 똑같다"는
      제보가 오면 캐시부터 의심하지 말고 스크롤 보정이 꺼져 있는지부터 볼 것** — 이번엔
      padding 세 번·새 빌드 두 번을 헛되이 썼다.
      ⚠️ **네이티브 푸시(APNs)는 아직 실기기에서 안 뜬다** — 서버(애플 API)는 `status:200/reason:null`로
      완전 정상 수신을 확인했는데, 기기 화면(배너·잠금화면·알림센터 전부)엔 아무것도 안 뜸.
      포그라운드 표시 델리게이트를 추가했는데도 그대로라 앱 코드만으로는 더 못 짚었다 —
      **Mac+Xcode로 실기기 콘솔 로그를 직접 봐야 원인이 잡힐 것 같다**(이전 세션에서 한 번
      확인됐던 기능인데 이번 재확인에서 막힘 — 이전 "완료" 기록을 신뢰하지 말 것).
