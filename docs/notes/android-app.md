# 안드로이드 앱(TWA) · 위젯 · 플레이스토어

> 2026-10-12 CLAUDE.md 를 다시 줄이며 새로 만든 문서다. 앱 콘텐츠 답·함정 `docs/analysis/2026-09-30-play-production-rejected-org-account.md` 9-5 · `자료/store/README.md`.

## CLAUDE.md 에서 옮김 2026-10-12

> CLAUDE.md 에서 옮겨 온 원문이다(2026-10-12, 다시 두 겹으로 나눔 — 내용은 한 글자도 안 고쳤다). 들여쓰기·체크 상자·「~~취소선~~」도 그대로다. 지금 상태는 CLAUDE.md 「다음 작업」의 한 줄을 볼 것.

### 「다음 작업」

- [ ] 🤖 **안드로이드 위젯 — 2026-09-21 시험판 실기기 확인 끝(갤럭시 S23 울트라). 남은 것: 비행기 모드 · 다음 날 아침 확인, 그리고 계획 Task 8(서명·판 번호·업로드) — 2026-10-03 실기기 확인 끝 · **새 앱 `kr.onlybible.gocheok` 의 첫 판(2 · 1.1.0)으로 나간다**(아래 「플레이스토어 출시」).**
      설계 `docs/superpowers/specs/2026-09-21-android-widgets-design.md` — Bubblewrap 으로 TWA 를 소스째 만들어
      `android-app/` 에 두고 위젯 셋을 더한다(시험판 `…memorize.dev` 는 따로 깔려 테스터 시계를 안 건드린다).
      ⏰ **위젯 판이 플레이스토어에 나간 날 `app.js` 의 `WIDGET_GUIDE.android = true` → bump → 푸시**(설명서 위젯 안내).
      ⚠️ 저장소가 공개이고 사이트가 저장소 전체를 배포한다 — **서명 키·비밀번호를 절대 커밋하지 말 것.**
      ⚠️ Capacitor 로 바꾸지 말 것 — 업데이트 순간 로그인이 풀리고 웹 푸시가 멈춘다(설계 「왜 A 인가」).
      아래는 9/20 에 적은 배경이다. 지금 안드로이드 앱은
      PWABuilder 로 만든 TWA 껍데기라 **저장소에 안드로이드 소스 프로젝트가 아예 없다** — 위젯은
      네이티브 코드가 있어야 한다(안드로이드는 PWA 위젯을 지원하지 않는다).
      **유리한 점 셋:** ① 서버는 이미 끝났다(`getWeeklyVerse`·`getTodayMeditation`·`getTodayBlessing`
      을 그대로 쓴다) ② 맥이 필요 없다(이 PC 에서 Gradle 빌드) ③ TWA 는 도메인과 연결돼 있어
      위젯에 `gocheok.onlybible.kr/?v=38` 같은 주소만 넣으면 앱이 열린다(아이폰처럼 별도 스킴이 필요 없다).
      **할 일:** Bubblewrap 으로 프로젝트 생성 → 저장소에 넣기 → AppWidgetProvider + 갱신(WorkManager)
      → 서명 → Play 업로드. ⚠️ **미룬 이유:** 프로덕션 재신청이 9/27 이후이고 그때까지 비공개 테스트
      테스터 12명을 유지해야 해서, 새 버전을 올리면 그 시계를 건드릴 위험이 있다(아래 항목).
      아이폰 위젯 설계 `docs/superpowers/specs/2026-09-20-ios-widgets-design.md` 의 ①을 그대로 옮기면 된다.
- [ ] **플레이스토어 출시 — ✅ 2026-10-09 새 앱 `kr.onlybible.gocheok` 출시됐다**(공개 스토어 주소 200 · 1.1.0 · 같은 날 `MINISTRY_HIDE_ON_PLAY = false`·`WIDGET_GUIDE.android = true`·교회 어드민 `PLAY_HIDDEN = false` 배포 — v2 `ae77b60` 판 `20261009g` · church-admin `e9e8ef1`). **남은 것: 테스터·성도님께 새 앱 안내 · 옛 앱 삭제 여부 · 해외 나라.** (아래는 지난 기록) 교회 계정에서 새로 만든 앱이라 「12명·14일」 없음(옛 `…memorize` 는 이전해 와도 요건이 따라왔다). 옛 앱은 **「출시 안됨」**(지우지 않음 · 테스터 25명 폰에만 남음 · 그 폰들에선 계속 돈다 — ⚠️ `assetlinks.json` 의 옛 패키지 줄과 `app.js` referrer 의 `memorize` 를 **지우지 말 것**: 지우면 옛 앱 위에 주소창이 뜬다). 서명 = 업로드 키 「- New」 `3A:17` · 구글 앱 서명 키 `5F:62`(둘 다 `assetlinks.json`). 내부 테스트로 실기기 확인 끝(주소창 없음 · 로그인 그대로 · 사역현황 숨김 · **알림이 새 앱 이름으로 옴** · **위젯 누르면 그 구절 · 주소창 없음**). ⏰ **통과해 나간 날:** `MINISTRY_HIDE_ON_PLAY = false` · `WIDGET_GUIDE.android = true` → bump → 푸시 · 테스터·성도님께 새 앱 안내(옛 앱 지우고 새로 받기 · 알림 한 번 다시 켜기) · 옛 앱 삭제 여부 · 해외 나라. 앱 콘텐츠 답·함정 `docs/analysis/2026-09-30-play-production-rejected-org-account.md` **9-5** · 데이터 보안 CSV `자료/store/data-safety-play-2026-10-03.csv`
- [x] ~~⏰ 플레이스토어 심사가 통과한 날 app.js `MINISTRY_HIDE_ON_PLAY = false` → bump → 푸시~~ **2026-10-09 끝**(교회 어드민 `PLAY_HIDDEN` 도)(+ 교회 어드민 `duty-logic.js` 의 `PLAY_HIDDEN = false` — 봉사 당번 담당자 화면의 「플레이스토어 앱에서는 안 보여요」 안내)(사역현황 묶음이 플레이스토어 앱에서 다시 보인다 · 2026-10-02 심사 동안 숨김 · 심사 제출 전에 내부 테스트 판에서 숨는지 확인 — `자료/store/README.md` 「단체 계정」 🔎 · 읽을 것 `docs/notes/ministry-history-check.md` 「플레이스토어 앱에서 숨김」)
- [ ] **업로드 키 재설정**(급하지 않다 — 옛 업로드 키가 공개됐지만 앱 서명 키는 구글이 갖고 있어 위조는 불가): `upload_certificate.pem` 은 만들어 두었다(`성경암송 - Google Play package - New` 폴더). 콘솔 → Play 스토어 보호 → 「Play 앱 서명 관리」에서 요청

## 위아래 띠(2026-10-13 · 친구 「화면 위아래 검은 띠를 투명하게 해서 앱이 쓸 수 있게」)

**실측**(친구 폰 갤럭시 S23 울트라 · 안드로이드 16 · One UI 8.5 · 크롬 154.0.8037.126 · 시스템 어두운 모드 켜짐 · 3단추 · 기본 브라우저 Chrome · `adb exec-out screencap` 픽셀):
- 위 띠 = **#1a3a6b**(페이지 theme-color — 크롬은 확인된 TWA 에서 위 띠를 페이지 theme-color 로 칠하고 아이콘 밝기도 그 색으로 고른다 · chromium 71357f78 · BaseSystemBarColorHelper). 처음 보내 주신 사진의 검정은 그때뿐이었다(원인 미상).
- 아래 띠 = **#131314** — 우리 `NAVIGATION_BAR_COLOR`(#1A3A6B)를 크롬이 무시한다. 크롬 153~155 회귀(abh #636 · Gerrit 8480715 「[CCT] Fix TWA nav bar color」 · 156 브랜치에는 막는 조건이 들어 있다 — 소스 비교일 뿐 실기기 확인 전).

**투명(띠 밑까지 그리기)은 지금 크롬 TWA 에 없다** — `BaseCustomTabRootUiCoordinator.supportsEdgeToEdge`: 「Currently edge to edge only supports CCT media viewer」 · 색의 투명도는 버린다(`getOpaqueColor` — #00000000 은 검정이 된다) · androidx.browser 1.10 · androidbrowserhelper 2.7.3 · Bubblewrap · 웹 매니페스트 어디에도 그런 값이 없다 · 몰입(immersive)은 투명이 아니라 **숨김**(시간·3단추가 사라진다 — 어르신께 권하지 않음).
크롬이 TWA 용을 검토 중이다(Gerrit 8455211 「support short-edges cutout mode for Trusted Web Activities」 · `enable_twa` 기본 꺼짐 · 빨라야 M158). 들어오면 껍데기를 안 고쳐도 웹(`viewport-fit=cover` · `env(safe-area-inset-*)`)이 그대로 쓴다 — 그때 걸릴 웹 자리(새 버전 띠·토스트·재생 중 여백·`scrollPastBtnRow` 등)는 이날 조사 기록에 있다.

**한 것 — 위 띠 색 맞추기**(웹만 · 플레이 업데이트 없음): `app.js` `statusBarFollowOn` · `syncStatusBar` — 화면 맨 위 왼쪽 끝(x 2 · y 1)에 쌓인 바탕색(로고 띠 남색 · 바탕 크림 · 앱 어두운 모드 바탕 · 창의 어둠막 섞임)을 재서 theme-color 로 넣는다. 스크롤·화면 바뀜·창·어두운 모드 토글 때 다시 잰다. **플레이 앱 실행(`openedByPlayApp`)에서만**(크롬 탭에서는 주소창 색이라 안 한다 · 아이폰과 무관).
- 문: `STATUSBAR_FOLLOW_OPEN = false` 면 🧪 시험 참여자만 · true 면 플레이 앱 모두. 시험 `tests/statusbar-follow.test.cjs`(preflight).
- ⚠️ theme-color 를 바꾸는 곳은 `syncStatusBar` 한 곳뿐이다(시험이 센다) — 다른 곳에서 바꾸면 위 띠가 서로 다툰다.

**남은 것:** 친구 실기기 확인 끝(2026-10-13 — v3.604 · 첫 화면 맨 위 남색 · 내리면 크림 · 암송 화면 크림 · adb 화면 찍기) → `STATUSBAR_FOLLOW_OPEN = true`(검토 뒤) · **B 아래 띠 크림 — 1.1.1(versionCode 4 · minSdk 24) 빌드 끝**(⚠️ 처음 만든 versionCode 3 · minSdk 23 판은 Play Console 이 「Play 자동 보호를 사용하려면 최소 SDK 버전이 24 이상」으로 막았다 — 2026-10-13 · 3 은 쓴 번호일 수 있어 4 로 건너뛰었다 · 24 = 안드로이드 7.0)(커밋 「안드로이드 1.1.1」 · `twaManifest.navigationColor(Dark)`·`navigationDividerColor(Dark)` = #FDF8F0 · `bundleProdRelease` · 업로드 키 3A:17 서명 · 위젯 단위 시험 통과 · 위젯 코드는 1.1.0 그대로). 올릴 파일은 저장소 밖 `C:\Projects\성경암송-1.1.1-아래띠크림\성경암송-1.1.1-versionCode4.aab` — **Play Console 업로드는 친구**(내부 테스트 → 프로덕션 · 스킬 store-release). 크롬 153~155 는 이 색을 무시하므로 156 이상에서만 보인다. 앱 어두운 모드(설정에서 켠 분)는 크림 띠 위로 어두운 화면이 된다(껍데기 색은 휴대폰 어두운 모드만 안다) · 크롬 TWA edge-to-edge 가 오면 다시 보기.
⚠️ 시험판(`.dev`)은 assetlinks 에 없어 「탭 모드」(주소창)로 열려 theme-color·몰입이 안 먹는다 — 띠 시험에는 adb 크롬 명령줄 우회(`--disable-digital-asset-link-verification-for-url`)나 내부 테스트 트랙을 쓴다.

## 돌려 보기 위젯(2026-10-13 · versionCode 5 · 친구 「스크롤하는 위젯이 안보여요」 — 아이폰 1.1.1 에만 있었다)

**무엇:** 「말씀 · 묵상 · 기도 돌려 보기」 — 이번주 말씀 → 오늘의 묵상 → 축복 기도문 → 쉴만한 물가가 **30분마다 저절로** 바뀐다 · 오른쪽 위 날짜·시각(「10.13(화) 17:08」) · 장마다 색 세로줄(파랑·초록·주황·청록) · 바닥 출처와 몇째 장인지 점 · 누르면 보이던 장의 화면(`/?v=번호` · `/?w=meditation` · `/?w=prayer` · `/?w=psalm`). 아이폰 `TodayVerseWidgetBundle.swift` 의 RotateWidget 과 **같은 규칙**이다(장 고르기 · 빠지는 장 · 30분 · 받는 때).
- 코드: `widget/RotateWidget.java`(받기·그리기·알람 — 다른 셋의 `BaseWidgetProvider` 와 따로: 넷을 함께 받고, 받는 때와 장이 바뀌는 때가 다르다) · 순수 규칙은 `WidgetLogic`(`rotateIndex`·`nextRotateAt`·`rotateAlarmAt`·`rotateShouldFetch`·`rotateValid`·`rotateSlides`·`rotateTint` — `WidgetLogicTest` 가 굳힌다) · 모양 `res/layout/widget_rotate.xml` · `res/xml/widget_rotate_info.xml`(4×2 · 늘리면 글씨가 커진다) · 매니페스트 receiver.
- 몇째 장 = 시각 ÷ 30분의 몫 % 장 수 — 다시 받아도 같은 시각에는 같은 장. 받는 때 = 다음 한국 자정과 6시간 뒤 중 이른 때(하나라도 못 받으면 30분 뒤) · 받은 것은 종류마다 `rotate-verse`… 로 따로 적어 둔다(다른 위젯 셋의 것과 따로).
- 쉴만한 물가는 서버가 `ready:false`(게이트 꺼짐·시작 전)면 그 장만 빠지고 셋으로 돈다. 시각 글자는 런처가 스스로 넘긴다(`TextClock`).
- ⚠️ **장이 바뀌는 때는 몇 분 늦을 수 있다** — 정확한 알람은 권한(`SCHEDULE_EXACT_ALARM`)이 들어 안 쓴다. `setWindow`(안드로이드 12 부터 폭이 10분보다 좁아지지 않는다 — 그냥 `set` 은 30분 알람을 20분 넘게 미룰 수 있다). 폰이 잠들어 있으면 깰 때 그린다.
- ⚠️ RemoteViews 는 맨 `View` 를 못 그린다 — 세로줄·점은 `ImageView` + `setColorFilter`. 런처는 같은 모양이면 옛 화면에 덧칠하므로(reapply) 색·보임은 **장마다 늘 다시** 정한다.
- ⚠️ 클래스 이름 `RotateWidget` 을 바꾸지 말 것 — 놓아 둔 위젯이 그 이름으로 이어진다.
- 설명서(웹): 안드로이드 위젯 장은 `ANDROID_ROTATE_GUIDE`(app.js)가 true 일 때만 돌려 보기를 말한다 — **versionCode 5 가 프로덕션에 나간 날 켠다**(웹은 안드로이드 앱 판을 모른다 · 아이폰은 판 표식 `iosAppAtLeast`). 시험 `tests/widget-rotate.test.cjs`(preflight — 두 폰 이름·설명·머리글·30분이 같은가 · 스위치 밖에서 말하지 않는가).
- 판: **versionCode 4(아래 띠 크림)는 프로덕션에 올리지 않는다** — 내부 테스트에 둔 채 5(아래 띠 크림 + 돌려 보기)로 대신한다(2026-10-13 친구 「만들어서 이번 판에 함께」).
- **실기기 확인(2026-10-13 · 친구 갤럭시 S23 울트라 · 플레이 내부 테스트 판 5):** 07:35 「오늘의 묵상 · 화요일」(둘째 점) · 누르면 앱이 열리며 그날 묵상 창 · 09:20 「이번주 말씀」(첫째 — 한 바퀴 돎) · **09:31 「오늘의 묵상」으로 바뀜**(09:30 알람 · 폭 10분 안) · 어두운 모드 글씨·색 정상 · 오류 기록 없음. 축복 기도문·쉴만한 물가 장은 화면으로는 못 봤다(그 칸에 USB 가 빠져 있었다 — 알람은 08:00·08:30 에 돌았다).
