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

## 위 여백 `--app-safe-top` — 웹도 스스로 심는다(2026-10-14)

`style.css` 의 위 여백(`.page-header` · `body.no-page-header #app` · `scroll-margin-top` 몇 곳)은 `var(--app-safe-top, env(safe-area-inset-top))` 다.
앱 안에서는 웹뷰가 이미 상태바 밑에서 시작하므로(`contentInset: automatic`) 이 값을 **0** 으로 둬야 상태바 몫이 두 번 안 들어간다(커밋 e4fdc8e).
- `AppDelegate.configureNativeAppCss` 가 심지만 **앱을 켤 때 · 1초 · 3초 · 다시 열 때뿐**이다. 배포 직후 웹이 스스로 새로고침하면(app.js `APP_BUILD` 안전장치) 값이 사라져
  **맨 위 띠 위가 상태바 높이(~60pt)만큼 비었다**(2026-10-14 친구 실기기 「아이폰 윗부분이 빈공간이 많아요」 — 그날 배포가 스무 번 가까웠다).
- 그래서 `js/push.js` 가 앱 안이면(`isNativeApp()`) **문서마다** 같은 값을 심는다 — 껍데기 판과 상관없이 웹만으로 고쳐진다.
  ⚠️ 이 줄을 지우면 앱을 다시 열기 전까지 띠 위가 비는 일이 돌아온다.

## 암송 A 화면의 머리 줄 — 띠 바로 밑 46px(2026-10-14 · v3.654)

앱이 그리는 구절 띠(`installVerseRefOverlay`)는 안전 영역 맨 위에 붙고 높이가 약 42pt 다(글씨 17pt + 위아래 10 · 한 줄 · 글씨 크기 설정과 상관없음).
- 암송 A(`.test-screen[data-memo]` — 암송 · 도전 · 복습 · 주제별)의 「‹ 목록으로」 머리 줄은 앱에서 `top: 46px`, 카드 위 여백도 46 에서 잰다(`mmPlaceHead` — 앱이면 웹 띠 높이를 더하지 않는다).
  전에는 옛 암송 화면 값 90px 을 그대로 써서 띠 밑이 48pt 비었다(친구 실기기 「윗 공간이」).
- ⚠️ **앱은 화면보다 긴 페이지에만 상태바 몫(contentInset)을 준다**(`.ps-wrap` 주석 · 커밋 4851005). 짧은 구절이면 기준점이 상태바만큼 올라가 머리 줄이 띠 밑에 깔린다 —
  그래서 앱에서는 이 화면들을 `min-height: 100vh` 로 늘 한 화면보다 길게 둔다(기준점이 언제나 같다). 이 줄을 지우면 짧은 구절에서 「목록으로」가 띠에 가린다.
- 확인은 이 PC 에서 흉내로만(393 × 759 · `window.Capacitor` · 가짜 띠 41px — scratchpad `native_sweep.py` 꼴) — 짧은 구절 · 긴 구절 3단계 · 도전 · 아주 크게 모두 띠 41 · 머리 줄 46 · 단추 50. **실기기 확인은 친구.**
- ⚠️ **그래도 키보드가 뜨면 머리 줄이 스크롤을 따라 사라졌다**(친구 실기기 「안드로이드는 목록으로까지 고정인데 아이폰은 스크롤된다」) — 위 「iOS 2단계」 절의
  구절 띠와 **같은 WebKit 한계**다(웹 position:fixed 는 키보드 중 못 버틴다 · GPU 승격(translateZ)은 스크롤을 따라간다). 웹만으로는 못 고친다.
- → **앱 띠 왼쪽에 「‹ 목록으로」 네이티브 단추(2026-10-14 · 다음 App Store 빌드부터)** — `AppDelegate` `verseRefBack` · `setVerseRefBack` · `verseRefBackTapped`.
  폴링이 구절 글과 함께 웹 머리 줄 `.test-screen[data-memo] .mm-head .mm-back` 의 글(「목록으로」 · 도전 · 복습은 「첫 화면」)을 JSON 한 줄로 읽어 오고,
  누르면 그 웹 단추를 `click()` 한다(어디로 가는지는 웹이 정한다 · 숨은 단추도 click 은 된다). 띠는 이제 터치를 받는다(`isUserInteractionEnabled = true` — 띠가 숨으면 웹으로 간다).
- 이 판은 표식에 `features:['refBack']` 를 싣는다 → `js/push.js` 가 `body.native-ref-back` → `style.css` 가 웹의 같은 단추를 숨긴다
  (암송 · 주제별 머리 줄은 단추 하나뿐이라 줄째 · 도전 · 복습(`.mm-ch-head`)은 제목 · 남은 빈칸을 두고 단추만). **옛 판은 표식이 없어 웹 단추 그대로** — 판 번호로 가르지 않는다.
- 흉내 확인(가짜 표식 + 가짜 띠에 같은 폴링 JS): 암송 1 · 3단계 — 띠 바로 밑에 단계 칸(카드 위 여백 54) · 도전 — 띠에 「‹ 첫 화면」 · 머리 줄은 제목 · 남은 빈칸만 · 띠 단추 JS → 목록으로 감.
  ⚠️ **맥 컴파일 · 실기기 미확인** — Codemagic `ios-testflight` 로그를 끝까지 본다.

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
- **1.1.3 (2026-10-14 · 번호만 올림)** — 1.1.2(위젯 머리말 「🐑 N일째」)가 이미 승인돼 같은 번호 업로드가 거부됐다(Codemagic Publishing 90186 · 90062). **그 빌드에서 Xcode 컴파일은 통과했다** — 위젯 머리말 · 구절 띠 「‹ 목록으로」(`verseRefBack`) 코드가 맥에서 처음 컴파일된 것. 1.1.3 = 1.1.2 + 「‹ 목록으로」 띠 단추.
- 판 이력: 1.0.1(2026-09-19 출시) · 1.1.0 위젯(2026-09-22 출시) · **1.1.1 출시(2026-10-13 친구 「iOS 앱 버전 1.1.1 배포되었습니다」)** — 설명서 위젯 장이 1.1.1 폰에만 넷째 위젯 「말씀 · 묵상 · 기도 돌려 보기」를 말한다(`app.js` `iosAppAtLeast` · 판 표식을 읽는다 · 1.1.0 이하는 표식이 없어 셋만). **실기기 확인 끝(2026-10-13 친구 「확인했음」 — 설정 맨 아래 판 줄 · 돌려 보기 위젯).** (지난 줄) **1.1.1 = 다음 빌드**(판 표식 · 2026-09-22 에 번호만 올려 둠 · **2026-10-07 「돌려 보기」 위젯 더함** — 네 장이 30분마다 저절로 · 오른쪽 위 날짜·시각 · 설계 `docs/superpowers/specs/2026-09-20-ios-widgets-design.md` ⑦ · ⚠️ 맥 컴파일 미확인).


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
      ✅ **2026-10-09 친구가 실기기에서 네이티브 푸시(APNs)가 뜨는 것을 확인했다** — 아래 줄은 그 전 기록(9/24 토큰 과다 갱신 고침이 맞았던 것으로 본다).
      ⚠️ **네이티브 푸시(APNs)는 아직 실기기에서 안 뜬다** — 서버(애플 API)는 `status:200/reason:null`로
      완전 정상 수신을 확인했는데, 기기 화면(배너·잠금화면·알림센터 전부)엔 아무것도 안 뜸.
      포그라운드 표시 델리게이트를 추가했는데도 그대로라 앱 코드만으로는 더 못 짚었다 —
      **Mac+Xcode로 실기기 콘솔 로그를 직접 봐야 원인이 잡힐 것 같다**(이전 세션에서 한 번
      확인됐던 기능인데 이번 재확인에서 막힘 — 이전 "완료" 기록을 신뢰하지 말 것).

---

## CLAUDE.md 에서 옮김 2026-10-12

> CLAUDE.md 에서 옮겨 온 원문이다(2026-10-12, 다시 두 겹으로 나눔 — 내용은 한 글자도 안 고쳤다). 들여쓰기·체크 상자·「~~취소선~~」도 그대로다. 지금 상태는 CLAUDE.md 「다음 작업」의 한 줄을 볼 것.

### 「다음 작업」

- [x] **iOS 2단계(위젯·네이티브 로그인·요절 배너 네이티브 오버레이) — 실기기 확인·심사 통과·배포 준비 끝(2026-09-16~18).** 상세(실기기 버그 다섯·오버레이·스크롤 보정)는 `docs/notes/ios-app.md`. ✅ **네이티브 푸시(APNs)는 2026-10-09 친구가 실기기에서 뜨는 것을 확인했다**(그 전에는 서버 200·기기 무표시였다 — `docs/notes/ios-app.md`).
- [ ] 📱 **아이폰 위젯 1.1.0 — 2026-09-22 출시됐다**(App Store 조회로 확인 · 02:33 KST). 잠금 화면 이번주 말씀(누르면
      그 구절 암송) · 오늘의 묵상 · 오늘의 축복 기도문 + 홈 「크게」·교회 마크. 서버 액션 셋은 **운영 배포까지 끝**났고
      `tests/widget-parity.py` 가 앱 화면과 140/140 일치를 확인했다.
      ✅ 같은 날 설명서 위젯 안내를 켰다(`WIDGET_GUIDE.ios = true` — 아이폰 앱에서만 보인다). 읽을 것 `docs/notes/manual-guide.md` 「위젯 안내」
      🏷️ **남은 것: 다음 빌드(1.1.1)에 껍데기 판 표식이 들어간다**(`installAppInfoMarker` · ⚠️ Mac 컴파일 미확인).
      `MARKETING_VERSION` 은 이미 1.1.1 로 올려 두었다(앱·위젯 × Debug·Release **네 곳**). TestFlight 로 받아
      **설정 맨 아래 「📱 아이폰 앱 1.1.1 (빌드 N)」** 이 뜨는지 볼 것. 1.0.1·1.1.0 은 표식이 없어 둘 다 `version:""` 로 보인다.
      읽을 것 `docs/notes/ios-app.md`
      ⚠️ 실기기를 보고 9/21에 바꾼 넷(작게 뺌 · 크게 더함 · 교회 마크 · 묵상 질문 뺌)과 그 이유는
      설계 `docs/superpowers/specs/2026-09-20-ios-widgets-design.md` ① 끝 절 — **작게를 다시 넣지 말 것.**
      ⚠️ 묵상·기도문 고르는 규칙은 **app.js 와 서버 두 곳**이다(`docs/notes/meditation.md`·`prayer-book.md`).
      ⚠️ **「아침 알림이 UTC 자정 기준」은 틀린 말이었다(2026-09-23 정정).** `verses.date` 가 항상
      KST 자정 순간으로 저장돼(관리자 폼이 `+09:00` 을 붙인다) `latestVerse()` 도 KST 자정에 넘어간다 —
      2,232시간을 매시 대조해 불일치 0건. ⚠️ **`weeklyVerseKst` 로 갈아끼우지 말 것** — 그쪽은 날짜
      없는 구절을 「오늘 것」으로 보아, 주일 아침 전체 발송이 아직 시작 안 한 구절을 뿌린다.
      읽을 것 `docs/superpowers/specs/2026-09-23-evening-push-design.md` 맨 앞 절.

## CLAUDE.md 에서 옮김 2026-10-13 — 아이폰 1.1.1 줄(끝남)
- [x] 📱 **아이폰 1.1.1 — 2026-10-13 출시(친구).** 남은 것: 실기기에서 설정 맨 아래 「📱 아이폰 앱 1.1.1 (빌드 N)」 · 「말씀 · 묵상 · 기도 돌려 보기」 위젯 확인(설명서 위젯 장은 1.1.1 폰에만 넷째 위젯을 말한다 — `iosAppAtLeast`). 위젯 함정(작게 다시 넣지 말 것 · `weeklyVerseKst` 금지)은 `docs/notes/ios-app.md` 끝 → **실기기 확인 끝(2026-10-13 친구)**

## 이번주 말씀 머리말 「🐑 3일째」(2026-10-13 · 1.1.2 · 안드로이드 versionCode 6 과 함께)
설계 `docs/superpowers/specs/2026-10-13-verse-widget-badge-design.md` · 계획 `docs/superpowers/plans/2026-10-13-verse-widget-badge.md`
- 이번주 말씀 위젯 홈 **중간·크게** 머리줄 오른쪽에 서버 `badge` 를 그대로(`WidgetHeader(trailing:)` — 기본 nil 이라 묵상·기도문·돌려 보기는 그대로). 잠금 화면에는 넣지 않는다.
- **`badgeDate == kstYmd(entry.date)` 일 때만** 보인다. 타임라인에 **다음 한국 자정의 같은 내용 장**을 하나 더 깔아, 시스템이 새로 받기를 미뤄도 어제의 「3일째」가 남지 않는다.
- ⚠️ 위젯 코드 두 벌(`ios-app/native/TodayVerseWidget/` · `ios-app/ios/App/TodayVerseWidget/`)은 같아야 한다 — `tests/verse-badge.test.cjs` ⑤ 가 다섯 파일을 견준다(preflight).
- ⚠️ **맥 컴파일 미확인** — Codemagic `ios-testflight` 첫 빌드 로그를 끝까지 본다. `MARKETING_VERSION = 1.1.2` 네 곳.
- 문구·모양·끄기는 api 만(`supabase/functions/api/verse-emoji.ts`) — 스토어 판이 필요 없다.
