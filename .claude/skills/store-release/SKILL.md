---
name: store-release
description: 성경암송 네이티브 앱 껍데기를 스토어에 낸다 — 아이폰(ios-app/ · MARKETING_VERSION 앱·위젯 × Debug·Release 네 곳 · Codemagic → TestFlight → 심사 · 껍데기 판 표식 확인)과 안드로이드(android-app/ TWA · versionCode · bundleProdRelease · 서명 키 커밋 금지 · assetlinks 옛 줄 유지) · 나간 날 켤 스위치. "아이폰 새 빌드", "TestFlight 올려", "앱스토어 제출", "플레이스토어 업데이트", "안드로이드 새 판", "위젯 판 출시", "versionCode 올려" 같은 요청에 사용. 웹 화면만 고친 것은 스토어가 필요 없다 — release.
---

# 스토어 출시 (store-release)

> 두 앱 모두 **gocheok.onlybible.kr 을 불러오는 껍데기**다. 웹(app.js·style.css·index.html·js/*.js)은 푸시 = 배포로 앱 안에도 다음에 열 때 닿는다 — **스토어가 필요 없다**.
> 스토어는 껍데기(Swift·위젯·아이콘·권한·TWA 설정)를 고쳤을 때만. 성도님 폰에는 자동 업데이트로 하루~며칠 걸려 닿고, **성도님마다 판이 다르다** — 새 네이티브 기능을 부르는 웹 코드는 「있으면 쓰고 없으면 조용히 넘어가게」(`docs/notes/ios-app.md`).

## 아이폰 (`ios-app/` · `docs/notes/ios-app.md`)

### ① 판 번호 — 네 곳을 같은 값으로
```bash
F=ios-app/ios/App/App.xcodeproj/project.pbxproj
grep "MARKETING_VERSION = " "$F" | sort | uniq -c          # 지금 값 — 네 줄이 같아야 한다
sed -i 's/MARKETING_VERSION = 1.1.1;/MARKETING_VERSION = 1.1.2;/g' "$F"
grep -c "MARKETING_VERSION = 1.1.2;" "$F"                    # 4
```
- 앱·위젯 × Debug·Release 네 곳. 위젯 Info.plist 가 `$(MARKETING_VERSION)` 을 읽으므로 어긋나면 빌드 경고(「must match that of its containing parent app」).
- ⚠️ App Store 에 **승인된 판과 같은 번호로는 TestFlight 업로드부터 거부된다**(오류 90062/90186 — Codemagic Publishing 실패로 보인다 · 커밋 5da610b). 심사 중·반려된 판이면 같은 번호에 빌드만 갈아 끼운다. 먼저 지금 승인된 판을 확인한다.
- **빌드 번호는 손대지 않는다** — Codemagic 이 TestFlight 최신 + 1 로 올린다(`codemagic.yaml` 「빌드 번호 자동 증가」).

### ② 컴파일은 Codemagic 이 한다
- 이 PC 에는 맥이 없다 — Swift 컴파일 오류는 Codemagic 빌드에서 처음 드러난다. 「Mac 컴파일 미확인」인 코드(2026-10-12 현재 1.1.1 의 판 표식·「돌려 보기」 위젯)는 첫 빌드 로그를 끝까지 본다.
- 껍데기 변경을 경로 명시로 커밋·푸시(`ios-app/` 는 사이트로 안 나간다 — `python tools/bump.py` 불필요) → Codemagic 콘솔에서 워크플로 `ios-testflight` 를 시작한다(`codemagic.yaml` 에 자동 시작(triggering)이 없다).
- 번들 `kr.onlybible.gocheok.memorize` · 위젯 `…memorize.todayverse` · 앱 ID `6811724527`.

### ③ TestFlight 로 받아 확인
- 설정 맨 아래 **「📱 아이폰 앱 1.1.x (빌드 N)」** — 이 줄이 뜨면 껍데기 판 표식(`AppDelegate.installAppInfoMarker()` → `window.GOCHEOK_APP`)이 들어간 것이다. 표식 없는 옛 판(1.1.0 이하)은 줄이 안 보인다.
- 고친 네이티브 기능(위젯·알림·로그인)을 실기기에서 한 번씩. 위젯은 **작게를 다시 넣지 말 것**(설계 `docs/superpowers/specs/2026-09-20-ios-widgets-design.md` ① 끝 절).

### ④ 심사 · 출시
- 제출 문구·심사 메모는 `자료/store/listing-ios-ko.txt` · App Privacy 는 `자료/store/README.md` — 모으는 것이 바뀌었으면 스킬 `copy-truth` ②.
- 승인 뒤 **「출시」를 손으로** 누르는 설정이면 친구가 누른다(1.1.0 이 그랬다).

## 안드로이드 (`android-app/` TWA · `docs/notes/android-app.md` · 계획 `docs/superpowers/plans/2026-09-21-android-widgets.md` Task 8)

### ① 도구와 판 번호
```bash
export JAVA_HOME="/c/Users/sewki/.android-tools/jdk-17"
export ANDROID_HOME="/c/Users/sewki/.android-tools/sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
```
`android-app/app/build.gradle` 의 `versionCode` 를 **하나** 올리고 `versionName` 을 맞춘다(2026-10-12 현재 `2` · `"1.1.0"`).
패키지 `kr.onlybible.gocheok`(교회 계정 새 앱) · 시험판 `.dev` 접미사(따로 깔려 정식 앱을 안 건드린다).
⚠️ `bubblewrap update`·`android-app/tools/generate.cjs` 를 다시 돌리지 않는다 — 고친 파일(위젯·applicationId/namespace 분리)을 덮어쓴다.

### ② 시험판 → 정식판
```bash
cd android-app
./gradlew --no-daemon testDevDebugUnitTest assembleDevDebug     # 시험판 — adb install -r app/build/outputs/apk/dev/debug/app-dev-debug.apk
./gradlew --no-daemon bundleProdRelease                         # 정식판(.aab) — 서명은 keystore.properties
```
- 서명 속성 `android-app/keystore.properties` 는 **이 PC 에만** 있다. 없으면 계획 Task 8 Step 2 로 만들고(값을 화면에 찍지 않고) `git check-ignore -q android-app/keystore.properties && echo OK` 가 OK 인지 본다.
- ⚠️ **서명 키(`*.keystore`·`*.jks`)·비밀번호·`signing-key-info.txt`·`keystore.properties` 는 절대 커밋하지 않는다.** 저장소는 공개다. 커밋 전 `git status -s android-app` 에 그런 파일이 없는지.
- 업로드 키 = 「- New」 `3A:17…` · 구글 앱 서명 키 `5F:62…`.

### ③ 업로드 · 심사
- Play Console 업로드는 친구가 한다 — 내부 테스트로 실기기 확인(주소창 없음 · 로그인 그대로 · 알림이 새 앱 이름으로 · 위젯 누르면 그 구절) → 프로덕션.
- 앱 콘텐츠 답·함정 `docs/analysis/2026-09-30-play-production-rejected-org-account.md` 9-5 · 데이터 보안 `자료/store/data-safety-play-2026-10-03.csv`.

### ④ `.well-known/assetlinks.json`
- ⚠️ **옛 패키지 `kr.onlybible.gocheok.memorize` 줄을 지우지 않는다** — 테스터 25명 폰에 옛 앱이 남아 있고, 지우면 그 앱 위에 주소창이 뜬다. `app.js` referrer 의 `memorize` 도 그대로.
- 서명 키가 바뀌면 지문을 **더한다**(지우지 않는다). 이 파일은 웹이라 푸시 = 배포다.

## 나간 날 — 켤 스위치
심사 동안 숨기거나 기다리던 것은 **상수 하나**로 묶여 있다. 스토어 공개 주소가 열리는 것을 확인한 뒤:
- `app.js` `WIDGET_GUIDE.ios`/`.android` — 설명서 위젯 안내(위젯 판이 나간 날 · 둘 다 2026-10-09 까지 true)
- `app.js` `ANDROID_ROTATE_GUIDE` — 설명서 안드로이드 위젯 장이 넷째 「말씀 · 묵상 · 기도 돌려 보기」를 말한다(**versionCode 5 프로덕션이 나간 날** · 내부 테스트만으로는 켜지 않는다). 아이폰은 판 표식(`iosAppAtLeast("1.1.1")`)이라 스위치가 없다.
- `app.js` `MINISTRY_HIDE_ON_PLAY` · 교회 어드민 `PLAY_HIDDEN`(`js/menus/duty/duty-logic.js`) — 플레이 앱에서만 숨기던 것(2026-10-09 false)
- 새로 숨긴 것이 있으면 같은 꼴로 상수를 두고 이 목록에 더한다 — 스킬 `gated-feature`
→ 값 바꿈 → `python tools/bump.py` → 스킬 `release`. 교회 어드민은 그 저장소에서 따로.
그리고 성도님·테스터 안내(새 앱 받기 · 알림 한 번 다시 켜기)는 친구가 정한다 — 문구는 스킬 `copy-truth`.

## 하지 않는 것
- 승인된 판 번호 재사용 · 네 곳 중 일부만 올리기 · 서명 파일 커밋 · assetlinks 옛 줄 정리 · Capacitor 로 안드로이드 바꾸기(업데이트 순간 로그인이 풀리고 웹 푸시가 멈춘다).
