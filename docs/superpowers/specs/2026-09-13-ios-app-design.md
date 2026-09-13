# iOS 앱 (App Store) — 설계

**날짜**: 2026-09-13
**배경**: 안드로이드 플레이스토어 프로덕션 신청이 2026-09-13 반려되어(테스터 12명 유지 실패로 14일 재시작, 2026-09-27 이후 재신청 가능) 최소 2주는 안드로이드 쪽에서 추가로 할 일이 없다. 이 시간에 아이폰(App Store) 대응을 병행한다.

## 이전 결정과 왜 다시 꺼내는가

`store/README.md`에는 "아이폰(App Store)은 하지 않는다 — 연 $99이고, 애플은 웹앱을 그대로 담은 앱을 거절한다(가이드라인 4.2)"는 기존 결정이 있다. 이번 설계는 그 결정을 뒤집는 것이 아니라, **가이드라인 4.2를 통과할 수 있게 진짜 네이티브 기능을 더해서** 재도전하는 것이다. 비용($99/년)은 감수하기로 했다(성도님 확인).

## 제약 조건

- **일정**: 1개월 정도 여유(급하지 않지만 느긋하지도 않음)
- **빌드 환경**: Mac 없음 → 클라우드 빌드 서비스 필수
- **Apple Developer 계정**: 없음 → 개인 명의로 신규 등록(단체 등록은 D-U-N-S 심사로 1~2주 더 걸려 이번엔 보류)

## 핵심 아이디어

안드로이드 TWA와 같은 원리 — 네이티브 앱은 **`https://gocheok.onlybible.kr`를 그대로 불러오는 얇은 웹뷰 껍데기**로 만들어, 웹 쪽(app.js·style.css 등)을 고칠 때마다 앱을 다시 빌드·재심사할 필요가 없게 한다. 그 위에 **진짜 네이티브 기능 3가지**를 더해 "웹앱을 그대로 담은 앱"이 아니라는 근거를 만든다.

⚠️ 이 저장소의 기존 웹 배포(`index.html`·`app.js`·GitHub Pages, gocheok.onlybible.kr)는 **전혀 건드리지 않는다** — 완전히 별도 영역(새 폴더)에 iOS 프로젝트를 둔다.

## 저장소 구조

이 저장소 루트에 새 폴더 `ios-app/`을 만들어 Capacitor 프로젝트를 둔다:

```
ios-app/
  capacitor.config.json   # server.url = https://gocheok.onlybible.kr
  ios/                     # Xcode 프로젝트(Capacitor가 생성)
  ios/App/App/Widgets/     # WidgetKit 익스텐션(오늘의 구절)
  ios/App/App/Login/       # SwiftUI 네이티브 로그인 화면
  package.json             # Capacitor CLI 의존성만
  codemagic.yaml           # 클라우드 빌드 파이프라인 설정
```

## 네이티브 기능 3가지

### 1. 오늘의 구절 홈 화면 위젯 (WidgetKit)

- 로그인 없이 보이는 공개 정보(지금 웹의 "이번주 말씀"과 같은 것)
- 서버에 위젯 전용 액션 `getWeeklyVerse`를 새로 추가한다 — 지금 웹이 클라이언트(app.js)에서 날짜로 "이번주 말씀"을 골라내는 로직(`getWeeklyVerseInfo()`)을 서버에도 만들어, 이미 계산된 구절 하나만 내려준다. 로직을 두 곳(JS·Swift)에 따로 두지 않기 위함이다.
- 위젯은 하루 한 번(자정 즈음, WidgetKit의 `TimelineProvider`) 이 값을 받아 홈 화면에 캐시해 둔다.

### 2. 네이티브 푸시 (APNs)

- 지금 아이폰 사파리 웹푸시는 iOS 16.4+ 조건이 까다롭고 불안정하다 — 네이티브 APNs로 바꾸면 이 문제가 없어진다.
- Apple Developer에서 APNs 인증 키(Auth Key, .p8)를 발급한다.
- Supabase에 iOS 기기 토큰을 저장할 표(`ios_push_tokens` 같은 이름)를 새로 만든다.
- 기존 `daily-push`(pg_cron) 로직을 손봐서, 안드로이드/브라우저는 지금처럼 웹푸시(VAPID)로, iOS 기기는 APNs로 나눠 보낸다. 성도님껜 "그냥 알림이 온다"는 경험은 똑같다.
- `admin-stats.html`의 testPush/sendPush도 iOS 기기를 함께 다루도록 손본다.

### 3. 네이티브 로그인 화면 (SwiftUI) → 웹뷰 이어주기

- 앱을 처음 열면 SwiftUI 화면에서 구분(교구/교회학교)·소속(교구·목장 또는 부서·학년)·이름을 받는다 — 지금 웹 로그인 화면과 같은 항목.
- "확인"을 누르면 네이티브에서 **지금 웹이 쓰는 것과 같은 로그인 서버 액션**(`login`, Supabase Edge Function `api`)을 직접 호출해 사용자 정보(`user_id` 포함)를 받는다.
- 웹뷰를 띄우기 **직전에** `WKUserScript`로 `localStorage`에 `memorize-user` 키(app.js의 `saveUser()`가 쓰는 것과 같은 모양: `{name, cid, user_id, type, gu/mok 또는 bu/grade, ...}`)를 미리 심어 둔다.
- 그 다음 웹뷰가 `gocheok.onlybible.kr`을 열면, app.js의 `loadUser()`가 이미 있는 세션을 그대로 읽어 **로그인 화면을 다시 보여주지 않고 바로 첫 화면**으로 간다.
- 개인정보 동의(`privacy-consent`) 등 그 이후 화면은 그대로 웹뷰가 맡는다 — 네이티브 화면은 로그인 한 화면만 만든다(범위를 작게 유지).

## 빌드·배포 (Mac 없이)

- **Codemagic**을 쓴다 — Capacitor 앱에 특화돼 있고, App Store Connect API 키 하나로 인증서·프로비저닝을 자동 관리해 준다(무료 요금제로 시작, 필요하면 유료 전환).
- 흐름: `ios-app/` 폴더를 Codemagic에 연결 → 빌드 시 클라우드에서 `npm install` → `npx cap sync ios` → Xcode 빌드·서명 → **TestFlight**에 자동 업로드.
- **TestFlight 내부 테스트**(최대 100명, 애플 리뷰 없이 즉시 가능)로 실기기에서 위젯·푸시·로그인이 되는지 먼저 확인한 뒤에만 정식 심사에 낸다.
- 심사 제출 시 앱 설명·스크린샷에 위젯·푸시 같은 네이티브 기능을 분명히 드러내 "그냥 웹사이트"로 오해받지 않게 한다.

## 진행 단계 (3단계)

1. **골격**: Apple Developer 개인 등록 → Capacitor 프로젝트 생성(웹뷰가 실제 사이트를 불러오는 것까지만) → Codemagic 연결 → TestFlight에 첫 빌드 올리기(네이티브 기능 없이, 파이프라인이 도는지 확인)
2. **네이티브 기능 3종**: 위젯(+서버 `getWeeklyVerse` 액션) → 네이티브 푸시(+APNs 키·표·발송 로직) → 네이티브 로그인 화면(+웹뷰 세션 이어주기)
3. **제출**: TestFlight로 성도님이 직접 확인 → 앱스토어 설명·스크린샷 준비 → 심사 제출

## 비용

- Apple Developer Program: 연 $99 (승인)
- Codemagic: 무료 요금제로 시작, 부족하면 월 $28~

## 남는 위험

- 그래도 4.2로 거절될 수 있다 — 애플 심사는 사람이 보고 판단하므로 100% 보장은 없다. 거절되면 심사 피드백을 보고 네이티브 기능을 더 보강하는 것으로 대응한다.
- APNs 발송 로직을 새로 만드는 것은 백엔드(Edge Function) 작업이라, 웹 배포와 마찬가지로 **개발 프로젝트에서 먼저 시험한 뒤 운영에 반영**하는 이 저장소의 원칙을 그대로 따른다.
