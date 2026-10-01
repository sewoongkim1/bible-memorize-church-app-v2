# 플레이스토어 등록 준비물

안드로이드용. 지금 웹앱을 얇은 껍데기(**TWA** — Trusted Web Activity)로 감싸 올린다.
**내용은 그대로 웹에서 오므로, 올린 뒤에도 지금처럼 고치면 앱에도 바로 반영된다.**
앱 껍데기를 다시 올리는 일은 아이콘·이름을 바꿀 때 정도다.

**아이폰(App Store) — 2026-09-14부터 진행 중.** "안 한다"던 예전 결정을 뒤집었다.
플레이스토어 반려로 생긴 2주를 아이폰 쪽에 썼다 — 가이드라인 4.2(웹앱을 그대로 담은 앱 거절)를
피하려고 진짜 네이티브 기능(위젯·푸시·로그인)을 더해 재도전 중. 설계는
`docs/superpowers/specs/2026-09-13-ios-app-design.md`, 진행은 `docs/superpowers/plans/`.
지금은 **개인 명의**로 진행 중이고, 교회 단체 명의로 옮기는 절차는 아래 "단체(교회 명의) 계정"
참고.

---

## 이 폴더에 있는 것

| 파일 | 쓰는 곳 |
|---|---|
| `icon-512-play.png` | 스토어 등록정보 → **앱 아이콘** (512×512, 불투명) |
| `feature-1024x500.png` | 스토어 등록정보 → **그래픽 이미지** |
| `screenshots/*.png` | 스토어 등록정보 → **휴대전화 스크린샷** (1052×1880, 10장 중 최대 8장) |
| `assetlinks.template.json` | 도메인 소유 증명 서식 — **아래 4단계에서 채운다** |

전부 `python tools/store-assets.py` 로 다시 만들 수 있다.
스크린샷은 `SHOT_OUT=... SHOT_SCALE=2 SHOT_NOCROP=1 python tools/capture-guide-shots.py`.

> ⚠️ **화면을 고쳤으면 스크린샷도 다시 뽑는다.** 2026-08-25에 설정 화면에서
> 단추 하나를 지웠는데 스토어 그림에는 그대로 남아 있었다 — 심사자가 보는 그림과
> 실제 앱이 다르면 그 자체가 문제다.
> ⚠️ **뽑은 뒤 헤더 로고가 깨지지 않았는지 눈으로 본다.** 로고는 외부 주소
> (summer.onlybible.kr)에서 오는데, 늦게 도착하면 깨진 그림으로 찍힌다.
> 한 번 더 뽑으면 대개 붙는다.

### 스크린샷 추천 순서 (8장)
플레이스토어는 앞의 2~3장만 목록에서 보인다. 그래서 **무엇을 하는 앱인지가
먼저** 오게 둔다.

1. `home.png` — 첫 화면 (무엇을 하는 앱인지)
2. `stage3.png` — 빈칸 채우며 암송 (핵심 기능)
3. `list.png` — 말씀 목록
4. `album.png` — 나의 말씀 앨범
5. `challenge.png` — 말씀 도전
6. `manual.png` — 사용 설명서 (어르신도 쓸 수 있다는 신호)
7. `settings.png` — 글씨 크기
8. `intro.png` — 환영 화면

---

## 등록 절차

### 1. 개발자 계정
https://play.google.com/console/signup · **$25 (평생 1회)**
신원·주소 확인을 먼저 통과해야 앱을 만들 수 있다.

> 확인 창은 **한 번에 끝까지** 해야 한다. 열었다 닫기·새로고침·여러 탭이
> 모두 '시도'로 세어져 「최대 시도 횟수 초과(24시간)」에 걸린다.
> 주민등록등본 PDF 한 장을 미리 받아 두고, 콘솔에 입력한 이름·주소와
> **글자까지 같은지** 대조한 뒤 열 것.

### 2. 앱 만들기
콘솔 → **앱 만들기**
- 앱 이름: `성경말씀 암송` (스토어에 보이는 이름)
- 기본 언어: 한국어
- 앱/게임: **앱** · 무료

### 3. 앱 패키지(AAB) 만들기
가장 쉬운 길은 **PWABuilder** (설치할 것 없음, 브라우저에서 끝난다).

1. https://www.pwabuilder.com 에서 `https://gocheok.onlybible.kr` 입력
2. **Package for stores → Android** 선택
3. 값 확인
   - Package ID: `kr.onlybible.gocheok.memorize` (한 번 정하면 못 바꾼다)
   - App name: `성경말씀 암송` / Short name: `성경암송`
   - Signing key: **New**(새로 만들기) 선택
4. 내려받은 zip 안의 **`.aab`** 를 콘솔에 올리고, **`signing.keystore`와
   비밀번호는 반드시 따로 안전하게 보관**한다 —
   이걸 잃으면 그 앱을 두 번 다시 업데이트할 수 없다.

명령줄이 편하면 Bubblewrap도 같은 일을 한다:
`npx @bubblewrap/cli init --manifest https://gocheok.onlybible.kr/manifest.json`

### 4. 도메인 소유 증명 (`assetlinks.json`) — **이 단계를 빼먹으면 앱에 주소창이 남는다**

TWA는 「이 앱이 정말 그 도메인의 것인지」를 확인한다. 통과하지 않으면
앱 안에 브라우저 주소창이 그대로 보인다(앱처럼 안 보인다).

1. 콘솔에서 **앱 서명** 페이지로 간다.
   2026-08-26 개편 이후 경로가 이렇게 바뀌었다(예전 「설정 → 앱 서명」이 사라졌다):
   > **Google Play로 보호됨** → **Play 스토어 보호** 섹션 펼치기
   > → **앱 서명키 보호** 항목 → **「Play 앱 서명 관리」** 단추 → 앱 서명 페이지
   
   그 페이지에 **디지털 애셋 링크 JSON**이 통째로 나와 있다 —
   지문을 따로 찾지 말고 그걸 복사하는 것이 빠르다.
2. **앱 서명 키 인증서**의 **SHA-256 인증서 지문**을 복사한다
   (`AA:BB:CC:...` 형식. 업로드 키가 아니라 **앱 서명 키** 쪽이다)
3. `assetlinks.template.json` 을 열어 `PLACEHOLDER_SHA256` 을 그 값으로 바꾼다
4. 그 파일을 저장소 루트의 **`.well-known/assetlinks.json`** 으로 옮기고 커밋·푸시
5. `https://gocheok.onlybible.kr/.well-known/assetlinks.json` 이 열리는지 확인

> 3단계 전에는 이 파일을 올리지 않는다. 지문이 틀린 파일을 올려 두면
> 검증이 조용히 실패하고, 크롬이 그 결과를 한동안 캐시한다.

**2026-08-26 완료.** `.well-known/assetlinks.json` 에 지문 두 개를 넣었다 —
구글의 **앱 서명 키**(폰에 깔리는 앱이 이 키로 서명된다. 이게 없으면 검증 실패)와
**업로드 키**(APK를 직접 설치해 시험할 때). PWABuilder zip 안의 assetlinks.json 은
**업로드 키 지문뿐이라 그것만으로는 안 된다.**
`.nojekyll` 도 함께 두었다 — 점으로 시작하는 폴더가 배포에서 걸러지면 통째로 404가 된다.

### 5. 스토어 등록정보
- 앱 아이콘 / 그래픽 이미지 / 스크린샷 — 이 폴더의 파일 그대로
- 간단한 설명 (80자)
  `말씀을 단계별 빈칸으로 외우고, 듣고, 함께 나눕니다. 고척교회 성경말씀 암송.`
- 자세한 설명 — `listing-ko.txt` 참고
- **개인정보처리방침 URL: `https://gocheok.onlybible.kr/privacy/`**
  로그인 없이 열리는 페이지다 — 심사자가 못 열면 그 자리에서 반려된다.
  앱 안 개인정보 화면의 「📄 전체 안내 보기」도 같은 곳을 가리킨다(둘이 어긋나지 않게).

### 6. 앱 콘텐츠 (심사에서 자주 막히는 곳)
> ⚠️ **2026-10-01 — 이 절의 데이터 보안 표 · 「확인 필요」 목록 · 「광고 없음」 · 심사자 안내는 낡았다.
> 콘솔에는 아래 「구글 출시 심사 전 결정(2026-10-01)」 절을 넣는다.** 표의 「사진」·「기기 ID」 두 칸이
> 사실과 다르고(둘 다 모은다) 여러 줄이 빠졌으며, 심사자 안내의 「1목장」은 앱이 거부한다. 지나온 기록으로만 남겨 둔다.

**데이터 보안 양식** — 실제로 모으는 것과 한 글자도 어긋나면 안 된다.
앱이 하는 일과 양식이 다르면 그게 반려 사유다.

| 양식 항목 | 답 | 근거 |
|---|---|---|
| 개인정보 → **이름** | 수집함 · 필수 · 앱 기능 | 로그인이 이름·소속뿐 |
| 개인정보 → **전화번호** | 수집함 · **선택** · 앱 기능 | 필사 노트를 신청한 분만 |
| 앱 활동 → **기타 사용자 생성 콘텐츠** | 수집함 · 선택 · 앱 기능 | 게시판 글, 「내게 주시는 말씀」 질문, 게시판 🚩 신고(까닭·덧붙인 말 — 2026-10-01) |
| 앱 활동 → **앱 내 검색어** 등 | 수집 안 함 | |
| 기기 ID | **수집 안 함** | 알림 등록 값은 광고 식별자가 아니다 |
| 위치·사진·연락처·결제 | 수집 안 함 | |
| 전송 중 암호화 | **예** | 전부 HTTPS |
| 데이터 삭제 요청 가능 | **예** | `/privacy/` 5항에 방법이 있다 |

⚠️ **2026-09-23 오늘의 찬양이 앱 안 유튜브 재생(파사드 → youtube-nocookie.com 임베드)으로
바뀌었다 — 위 표는 이 변화 이전 기준이다. 콘솔에서 다시 확인해야 할 항목:**
- 위 표에 **제3자(구글/유튜브)로 데이터가 전달되는지** 행이 빠져 있다 — 추가 필요(확인 필요)
- 「▶ 찬양 듣기」를 누른 순간에만 구글로 전달되는 것(접속 IP·기기 정보·시청 기록)을
  데이터 보안 양식의 어느 범주(기기 또는 기타 ID / 앱 활동)로 신고할지 — 확인 필요
- 그 데이터가 **"제3자와 공유됨"**에 해당하는지, 목적을 "앱 기능"으로 표시할 수 있는지 — 확인 필요
- "광고 없음"이 여전히 맞는 문구인지 — 유튜브 자체 광고·추천 로직까지 우리가 "광고 없음"이라고
  말한 것으로 읽히지 않는지 — 확인 필요

- 광고 없음 · 인앱 결제 없음 · 콘텐츠 등급 설문(종교/전연령)
- **사용자 제작 콘텐츠(UGC)** — 게시판 글·답글·사진이 있다. 구글 정책은 **앱 안 신고 수단 + 운영**을 요구한다
  (아이폰은 「운영진이 직접 살핀다」는 설명으로 통과했지만 구글 문구는 앱 안 신고다).
  → 2026-10-01 「🚩 신고」를 넣었다: 남의 글·답글마다 신고 단추(까닭 넷 + 덧붙인 말) → 관리자
  「게시판 관리」 맨 위 「🚩 신고 N」에서 **숨기기 / 처리 완료**. 설문에서 신고 기능을 물으면 이것으로 답한다.
  자세한 것은 `docs/notes/board.md` 「신고」 절.
- 스토어 등록정보 → **연락처 정보**: `sewkim00@gmail.com`
  (스토어 페이지에 공개되는 주소다. 개인정보처리방침의 삭제 요청 주소와 같게 둔다)
- **로그인이 필요한 앱**이라 심사자용 안내를 적어 둔다:
  「비밀번호가 없습니다. 교구 → 아무 교구·목장 → 이름 아무 것이나 넣으면 들어갑니다.」
  이 한 줄을 빼먹으면 심사자가 첫 화면에서 막혀 반려된다.

### 7. 출시
개인 계정이면 정식 출시 전에 **테스터 12명 × 14일 비공개 테스트**가 필요하다.
교회에서는 신앙운동팀·목장 식구들께 부탁하면 되고, 어차피 실기기 점검이
필요하니 겸사겸사가 된다. 단체(교회 명의) 계정은 면제 — 대신 D-U-N-S 번호가 필요하다.

---

## 구글 출시 심사 전 결정(2026-10-01)

> **한 줄 결론.** ① 알림 등록 값은 **「기기 또는 기타 ID」로 신고**한다(위 「등록 절차 › 6」 표의 「수집 안 함」은 틀렸다).
> ② 오늘의 찬양(유튜브) 때문에 **「광고 포함: 예」**로 하고, 찬양을 재생할 때 구글로 가는 것은 **「공유」**로 신고한다.
> ③ 대상 연령은 **13–15 · 16–17 · 18세 이상**만 고른다(13세 미만은 고르지 않는다) — 대신 어린이 부서 로그인에
> **보호자 확인**을 단다. ④ 그대로 내면 막힐 자리: **게시판 이용 규칙·글쓴이 가리기**, **AI 답 신고**,
> **심사자 안내(「1목장」은 거부된다)**, **데이터 보안 표의 틀린 칸**, **방침에서 빠진 것**, **스토어 설명 한 줄**.
>
> **언제 쓰나:** 앱 이전(개인 → 교회 계정)이 끝난 뒤, **교회 계정** Play Console 「앱 콘텐츠」에서 7절 순서대로.
> **근거:** 구글·유튜브 도움말 원문(맨 끝 [출처] — 2026-10-01 에 읽음). 콘솔의 칸 이름은 바뀔 수 있다 — 다르면 **뜻이 같은 칸**을 고른다.
> ⚠️ 「구글 문서가 못 박은 것」과 「우리 판단」을 나눠 적었다. **(판단)** 이라고 쓴 곳은 구글 문서에 정답이 없는 자리다.

### 1. 알림 등록 값 → 기기 또는 기타 ID · 수집함 · 공유 안 함 · 선택

- **무엇을 저장하나:** `push_subscriptions` 의 `endpoint`·`p256dh`·`auth`(+ `user_id`·`hour`·`evening`) — `savePush`(index.ts) · `js/push.js`.
  스토어 앱(TWA)은 크롬이 알림을 받으므로 `endpoint` 는 크롬이 만든 웹 푸시 주소(`https://fcm.googleapis.com/fcm/send/…`)이고,
  끝부분이 **그 폰의 그 브라우저 하나를 가리키는 토큰**이다.
- **구글의 정의:** 기기 또는 기타 ID = "Identifiers that relate to an individual device, browser or app. For example, an IMEI number,
  MAC address, Widevine Device ID, **Firebase installation ID**, or advertising identifier." [1]
  → **광고 ID 만 뜻하는 칸이 아니다.** 「등록 절차 › 6」 표의 근거(「알림 등록 값은 광고 식별자가 아니다」)는 이 칸을 비울 이유가 못 된다.
- **우리 방침과도 맞춰야 한다:** `privacy/` 1항과 앱 안 화면이 이미 「알림 등록 정보(기기 식별용 임의 값)」·「기기 식별용 임의 ID」라고
  적어 두었다. 양식만 「수집 안 함」이면 **우리 방침과 양식이 서로 어긋난다.**
- **수집 — 예.** "Collection: Transmitting data from your app off a user's device." [1] (`savePush` 가 서버로 보낸다 · 일시 처리 아님)
- **공유 — 아니요.** 발송을 맡은 구글 FCM(아이폰은 애플 APNs)은 우리 대신 전달만 한다 = 서비스 제공업체 예외
  ("an entity that processes user data on behalf of the developer and based on the developer's instructions") [1].
- **선택**(알림을 켠 분만). **목적:** 앱 기능(매일 말씀 알림) + **개발자 커뮤니케이션** — 관리자 화면 「알림발송」(`sendPush`)은 아무 제목·내용이나
  보낼 수 있다("Used to send news or notifications about the app or the developer" [1]).
- **광고 ID 선언 → 「아니요」.** 스토어 앱 매니페스트의 권한은 `INTERNET`·`POST_NOTIFICATIONS` 뿐이고 `AD_ID` 가 없다(`android-app/`).

### 2. 오늘의 찬양(youtube-nocookie 임베드) → 「광고 포함: 예」 · 구글로 가는 것은 「공유」

**2-1. 광고 — 「예」 (판단).** 「유튜브를 퍼오면 반드시 예」라고 적은 구글 문서는 못 찾았다. 그래도 「예」로 하는 까닭:
- 플레이: "You must declare whether or not your app contains ads. This includes ads delivered through third-party ad SDKs (Software
  Development Kit), display ads, native ads, and/or banner ads." [2] — 우리가 심지 않았어도 **우리 화면 안에서 남의 코드가 내보내는 광고**다.
- 유튜브: "Embedded videos may show skippable or non-skippable in-stream ads." · "there's no way to directly turn off ads on embedded
  videos only. You may turn off embedding altogether." [13]
- 유튜브 약관 「수익 창출 권리」: "귀하는 서비스에 있는 귀하의 콘텐츠에서 수익을 창출할 권리를 YouTube에 부여합니다." [14]
  → **교회 채널이 수익 창출을 켜지 않았어도** 광고가 붙을 수 있다.
- `youtube-nocookie` 는 광고를 **없애지 않는다** — "If ads are served on a video shown in the Privacy Enhanced Mode of the embedded player,
  those ads will likewise be non-personalized" [12]. 맞춤이 아닐 뿐 나온다.
- 플레이 광고 정책도 "video content with integrated ads" 를 앱 안 수익화·광고의 한 예로 든다 [3].
→ 「아니요」는 **우리가 막을 수 없는 화면을 두고 「광고 없음」을 약속하는 것**이다(`docs/notes/today-song.md`: 「우리가 색을 줄 수 없는 화면이라 못 막는다」).
「예」의 값은 스토어의 「광고 포함」 표시 하나다. 스토어 설명·안내 어디에도 「광고 없음」이라고 쓰지 않는다(지금 `listing-ko.txt` 엔 없다 — 확인함).
- **「아니요」를 사실로 만드는 길은 하나** — 스토어 앱에서만 찬양을 앱 밖(유튜브 앱)으로 여는 것. 그러면 2-2 의 「공유」 줄도 사라진다.
  ⚠️ 그러나 2026-09-23 성도님 제보로 **되돌린 자리**다 — 고르기 전에 `today-song.md` 「개시한 날 하루에 두 번 뒤집혔다」를 다 읽을 것.
  **이 결정에서는 고르지 않는다.**

**2-2. 데이터 보안 — 「공유」로 신고한다 (판단, 보수 쪽).**
- 정의: 공유 = "Transferring user data collected from your app to a third party" · 서드파티 라이브러리·SDK 로 모인 것도 신고 대상 ·
  웹뷰도 "if your app is in control of the code/behavior delivered through that webview" [1]. 스토어 앱 화면은 통째로 우리 코드이고,
  찬양 플레이어는 우리가 붙인 구글 코드다(`enablejsapi=1` · 누른 뒤 `iframe_api`).
- **예외에 기대지 않는 이유:** ① 서비스 제공업체 — 아니다. 구글은 **자기 방침**으로 처리한다(우리 방침 2항도 「구글의 개인정보처리방침을 따릅니다」).
  ② 사용자 시작 행위("where the user reasonably expects the data to be shared, or based on a prominent in-app disclosure and consent" [1]) —
  「▶ 찬양 듣기」는 영상을 보겠다는 뜻이지 **기기 식별값이 광고 빈도 제한에 쓰이는 것**까지 예상한 것이라 보기 어렵고,
  재생 창의 안내 두 줄은 9/23 에 뺐다(다시 넣지 말 것 — today-song.md).
- **구글이 그 데이터로 하는 일**(구글 광고 전반의 비맞춤 광고 설명 — 유튜브 플레이어에 그대로 적용된다는 것은 추정):
  "targeted using contextual information, including coarse (such as city-level ...) geo-targeting based on current location" ·
  "they do still use cookies or mobile ad identifiers for frequency capping, aggregated ad reporting, and to combat fraud and abuse" [16]
- **IP:** "where developers use IP addresses as a means to determine location, then that data type should be declared" · 대략적 위치는
  "inferred, such as via IP address ... must be disclosed" [1]
- **그래서 칸**(5절 표에 합쳤다): **기기 또는 기타 ID · 앱 상호작용 · 대략적인 위치**를 「공유」로. 셋 다 찬양을 **재생한 분만**이다
  (파사드 — 누르지 않으면 구글로 아무 요청도 안 간다). 공유 목적 = 앱 기능 · 분석 · 광고 또는 마케팅 · 사기 방지·보안·규정 준수.
- ⚠️ 이렇게 내면 스토어 「데이터 보안」에 「위치」·「광고 또는 마케팅」이 보인다. 이걸 줄이는 **정직한** 길은 2-1 끝의 「앱 밖 재생」 하나뿐이다.
  **칸을 빼서 줄이지 않는다.**

**2-3. 유튜브 약관이 방침에 요구하는 문구 — 지금 없다.** (플레이 반려 사유는 아니지만 같은 회사 약관이다. IFrame API 를 쓰므로 우리는
「API Client」 — "a website or software application (including a mobile application) developed by you that accesses or uses the YouTube API Services" [15])
- III.A.1 — 유튜브 이용약관 링크(https://www.youtube.com/t/terms) + "by using those API Clients, users are agreeing to be bound by the YouTube Terms of Service" 라는 문장
- III.A.2 — 방침에 (b) YouTube API 서비스를 쓴다는 것 · (c) 구글 개인정보처리방침 링크 http://www.google.com/policies/privacy ·
  (f) 제3자가 광고 등 콘텐츠를 내보낼 수 있다는 것 · (g) 제3자가 기기에 정보를 저장·읽을 수 있다는 것 [15]
- 지금 `privacy/` 2항: 유튜브 행·설명은 있지만 **링크 둘 · 광고 문장 · 약관 동의 문장**이 없다 → 4절 ⑥.

### 3. 대상 연령 → 13–15 · 16–17 · 18세 이상 (13세 미만은 고르지 않는다)

**왜 13세 미만을 안 고르나**
- 구글: "You should only select age groups that include both adults and children, if you truly have designed your app for all ages" ·
  "...if you have designed your app for and ensured that your app is appropriate for users within each of the selected age group(s)." [4]
  이 앱은 **어르신을 중심으로** 만들었고(스토어 설명 「어르신을 생각했습니다」), **실명이 보이는 공개 게시판 · AI 질문 · 광고가 나올 수 있는 유튜브 ·
  이름이 걸린 순위**를 어린이에 맞게 다듬은 적이 없다. 「누구나 쓸 수 있다」와 「어린이용으로 만들었다」는 다르다.
- 13세 미만을 고르면 가족 정책(Families)이 통째로 걸린다:
  1. **광고** — "If your app displays ads to children or to users of unknown age, you must: Only use Google Play Families Self-Certified Ads SDKs" [5]
     → 유튜브 플레이어는 그 목록이 아니다. 2-1 의 「광고 포함: 예」와 **곧바로 부딪친다.**
  2. **API·SDK** — "Apps that target both children and older audiences must not implement APIs or SDKs that are not approved for use in
     child-directed services unless they are used behind a neutral age screen." [5][6]
  3. **유튜브 쪽** — "If your website or app is child directed, you must self-designate ... even if you embed YouTube videos with the
     Privacy Enhanced Mode player" [12] + 개발자 정책 III.J(맞춤 광고 금지 등) [15]
  4. **앱 기능** — "Your app must not merely provide a webview of a website ..." [5] → 우리는 웹을 감싼 TWA 라 **위젯이 있어도 지적받을 수 있는 자리**다.
  5. **법** — "compliant with ... (COPPA), ... (GDPR), and any other applicable laws or regulations" [5] ·
     "Any collection of personal and sensitive information from children, such as name or e-mail address, must be disclosed and should be
     collected with parental consent if required." [4] → 한국은 **만 14세 미만 법정대리인 동의**.
  6. **거짓 선택의 값** — "Misrepresentation of any information about your app in the Play Console, including in the Target Audience and
     Content section, may result in removal or suspension of your app." · "Google Play reserves the right to conduct its own review ...
     to determine whether the target audience that you disclose is accurate." [5]
  (참고: AAID·IMEI 같은 금지 식별자 [6] 는 우리가 안 보낸다 — 이건 문제가 아니다.)

**13+ 가 정직하려면 — 출시 전에 할 것**
- 로그인 「교회학교」에 **영아·유아·유치·유년·초등부**가 있다 = 어린이가 쓰는 것을 **알고 있다.** 그래서 「어린이용 앱」이 아니라
  **「보호자와 함께 쓰는 앱」**으로 정리한다 — 이 부서를 고르면 **「보호자가 함께 확인했어요」 단계(보호자 동의)**를 한 번 거친다.
- 이건 심사와 별개로 **이미 비어 있는 법의 자리**다 — 개인정보 보호법(제22조의2 · 만 14세 미만 아동)은 법정대리인 **동의를 받으라**고 하는데,
  방침 6항은 지금 「보호자의 동의를 받고 사용해 주세요」라는 **부탁**뿐이다. 중등부 1학년 일부도 만 14세 미만이다
  (구글도 13–15 를 "may be considered to include children in some locales" 라고 적었다 [4]). 확인 방법(문자·전화 등)은 시행령이 정해 두었으니
  **법 확인을 받고** 고른다.
- 먼저 숫자를 본다 — 어린이 부서로 들어온 분이 몇인지(운영 SQL Editor · 읽기만):
  ```sql
  select bu, count(*) as 사람 from public.users where type = '교회학교' group by bu order by 2 desc;
  ```
- 「어린이에게 매력적일 수 있나」류 질문엔 사실대로 답한다 — 스토어 그림·문구에 어린이 요소가 없다. 구글은 "youthful animation or young
  characters in the graphic assets" 가 있으면 반려할 수 있다고 적었다 [4] — 스토어 그림을 바꿀 때 이걸 지킨다.

**나중에 13세 미만을 고르기로 하면 — 바뀌어야 할 것(전부 갖춘 뒤에만 고른다)**
- (가) 어린이 부서로 들어온 분에겐 **찬양 플레이어를 숨긴다**(광고·SDK 규칙) — 또는 「앱 밖 재생」. 로그인의 「구분·부서」 고르기가 중립 연령 확인
  ("a mechanism to verify a user's age in a way that doesn't encourage them to falsify their age" [4])이 될 수 있다 — 「어른이면 더 열린다」로 읽히지 않게.
- (나) 유튜브에 **어린이 대상 자기 지정** + III.J [12][15]
- (다) **보호자 동의** — 위와 같고, 법이 정한 확인 방법으로
- (라) 게시판 — 어린이 실명·소속이 모두에게 보인다. 어린이 부서는 이름을 가리거나 글쓰기를 막는 것을 검토 + 신고·가리기(4절 ③)
- (마) 「내게 주시는 말씀」 — 어린이에게 맞는 답인지 검토 + 답 신고(4절 ④)
- (바) 방침 6항을 「어린이의 정보」 절로 키운다 — 무엇을 모으나 · 보호자 동의 방법 · 보호자 열람·삭제 · 유튜브(앱 안 화면 두 곳도 함께)
- (사) 앱 액세스 메모에 네이티브 기능(위젯)을 적어 「웹뷰뿐」 지적에 대비
- (아) 데이터 보안 양식에 가족 정책 준수를 약속하는 칸이 생긴다 — 위가 다 끝나야 「예」라고 쓸 수 있다

### 4. 지금 README 대로 내면 막힐 자리 — 출시 전에 고칠 것

**① 데이터 보안 표의 틀린 칸** — 「사진 수집 안 함」(2026-08-25 부터 게시판 사진을 받는다) · 「기기 ID 수집 안 함」(1절).
빠진 것: 사용자 ID · 앱 상호작용(진도 · **열람 기록 `feature_log`**) · 기타 작업(공감 · 응원 · 이벤트 신청 · 신고) · 종교(소속 · 직분) · 학년.
→ **5절 표로 바꾼다.** (구글: 앱 안 서드파티 코드도 개발자 책임이고, 신고 내용이 맞는지도 개발자 책임이다 [10])
- 종교 줄은 **(판단)** — 정의가 "Information about a user's political or religious beliefs." [1] 인데, **고척교회 교구·목장·부서·직분**은 그 자체로
  다니는 교회(종교)를 드러낸다. 빼면 사실보다 적게 신고하는 것이다. (한국 법으로도 사상·신념은 민감정보다 — 따로 동의가 필요한지 **법 확인 권장**, 심사와 별개)

**② 심사자 안내가 그대로면 첫 화면에서 막힌다** — 위 「등록 절차 › 6. 앱 콘텐츠」와 `listing-ko.txt` 의 「예) 교구 → 사랑 → 1목장 → 홍길동」:
**「1목장」은 거부된다**(목장 칸은 숫자 또는 「남성」만 — `MOK_RE`, 화면에 「목장은 숫자 또는 '남성'만 입력할 수 있어요」).
**「개인정보 수집·이용 안내에 동의」 체크칸**도 안 적었다(안 누르면 「동의해 주세요」에서 멈춘다). 심사자는 한국어를 못 읽을 수 있다 — **영어로.**
"If your entire app or parts of your app are restricted based on login credentials ... you must provide all required details to enable access to your app." [2]
→ 이 절 6의 글을 쓰고, `listing-ko.txt` 의 같은 칸도 그 글로 바꾼다.

**③ 게시판 — 사용자 제작 콘텐츠(UGC) 정책** [7]
- 원문: "must implement robust, effective, and ongoing UGC moderation that: **Requires users accept the app's terms of use and/or user policy
  before users can create or upload UGC** · **Defines objectionable content and behaviors** ... and prohibits them in the app's terms of use or
  user policies · Conducts UGC moderation ..."
- 하위 규칙 둘: "Apps featuring UGC that identify a specified set of users through means such as user verification or offline registration
  (for example, apps exclusively used within a specific school or company, etc.) must provide in-app functionality to **report content and users**." ·
  "Apps that provide access to publicly accessible UGC ... must implement in-app functionality to **report users and content, and to block users**."
- 지금: **신고** — 2026-10-01 이 가지(`board-report`)에서 넣었다(위 「등록 절차 › 6. 앱 콘텐츠」의 UGC 줄 · `docs/notes/board.md` 「신고」 · 운영 배포 전이면 배포부터) ·
  **이용 규칙 동의** — 없다(게시판 위 안내 글만 있다. 로그인 때의 체크는 **개인정보** 동의다) · **글쓴이 가리기(차단)** — 없다.
- **(판단)** board.md 「신고」 절은 「차단은 정책 문구가 아니다」로 정했는데, 위 하위 규칙에는 차단이 있다. 우리 앱은 한 교회만 쓰지만
  **아무 이름으로나 들어올 수 있어**(로그인은 통제가 아니다) 「공개 UGC」 쪽으로 읽힐 수 있다 — 둘 중 어느 갈래로 보든 막히지 않으려면
  **「이 분 글 안 보기」(내 기기에서만 가리기)**를 더하는 것이 가장 싸다. 「사용자 신고」는 신고 창이 그 글의 **글쓴이**도 함께 알린다는 것을 문구로 보이면 된다.
- 출시 전: 신고 배포 + **처음 글 쓸 때 이용 규칙(하지 말 것 목록) 동의 한 번** + **글쓴이 가리기**.

**④ 「내게 주시는 말씀」(AI 답) — AI 생성 콘텐츠 정책** [8]: "Apps that generate content using AI must contain in-app user reporting or
flagging features that allow users to report or flag offensive content to developers without needing to exit the app."
정책 예시는 "chatbot is a central feature of the app" 인 앱이라 우리가 꼭 대상인지는 갈린다(판단) — **답 아래 「🚩 이 답 알리기」 하나**면 끝나는 일이라 넣는다.

**⑤ 계정 삭제 — 거의 됐다.** 웹 주소 `https://gocheok.onlybible.kr/privacy/#delete`(앱 이름·만든 곳·단계·지워지는 것·남는 기간이 있다).
앱 안 길도 있다(⚙️ 설정 → 「🔐 개인정보 안내 보기」 → 「📄 전체 안내 보기」) — 구글이 허용한 방식이다
("you can choose to provide a link within your app that takes users to your app account deletion web resource" · 방법으로 "a customer service email or a form" [9]).
고칠 것 둘: (가) 앱 안 링크를 `privacy/#delete` 로 바로 걸고 이름을 「계정·기록 삭제 요청」으로(권장) · (나) 방침 5항 「지워지는 것」에
**사역 신청 · 이벤트 신청 · 열람 기록 · 공감 · AI 질문**이 빠져 있다 — 더한다. (「잠시 정지·비활성」은 삭제로 안 쳐 준다 [10] — 우리는 지운다.)

**⑥ 방침에서 빠진 것** — 구글: 방침은 "comprehensively disclose how your app accesses, collects, uses, and shares user data" [10].
⚠️ `privacy/` 와 **앱 안 화면 두 곳**(`renderPrivacyInfo` · 로그인 화면 안내)을 **함께** 고친다(CLAUDE.md 「개인정보」).
- **열람 기록**(`feature_log` · 2026-09-23~ — 사람별로 어떤 기능을 언제 열었는지) — 1항 표에 없다
- **공감 · 순위 응원 · 이벤트 신청** — 1항 표에 없다(이벤트는 4항에만)
- **음성 암송** — 소리는 브라우저·기기의 음성 인식이 처리하고(구글·애플 서버로 갈 수 있다) 우리 서버엔 「음성으로 했다」만 온다.
  양식에는 넣지 않는다(판단 — 우리 코드가 소리를 보내지 않는다). 방침엔 한 줄.
- **유튜브 약관 문구**(2-3) — 링크 둘 · 「제3자가 광고를 내보낼 수 있다」 · 약관 동의 문장
- (선택) **글꼴** — 앱을 열 때마다 구글 글꼴 서버로 접속 IP 가 간다. 위치 추정·광고에 안 쓰는 글꼴 전달이라 양식엔 안 넣는다(IP 는 쓰임대로 신고 [1]). 2항 표에 한 줄이면 더 정직하다.
- ⚠️ 이 가지에서 신고 작업이 `privacy/index.html` 을 함께 고치고 있다(2026-10-01) — 그 커밋 뒤에, 겹치지 않게.
- **순서:** 방침을 먼저 고쳐 배포 → 그다음 데이터 보안 양식 제출. 양식과 방침이 어긋난 채로 심사받지 않는다.

**⑦ 스토어 설명 한 줄이 사실과 다르다** — `listing-ko.txt` 「기록은 이름과 소속으로만 관리되며, 본인 진도와 도전 순위에만 쓰입니다.」
실제로는 게시판 · 이벤트 명단 · 사역 신청 · 교구별 합계 보고 · 열람 기록에도 쓴다. 메타데이터 정책: "misleading ... metadata, including but
not limited to the app's description" [11]. → 바꿀 문장: 「무엇을 모으고 어디에 쓰는지는 개인정보 안내(gocheok.onlybible.kr/privacy/)에 모두 적어 두었습니다.」

**⑧ 콘텐츠 등급(IARC)** — 위 「종교/전연령」은 설문에 없는 칸이다. **사용자끼리 글·사진을 주고받나 → 예**(게시판) · 위치 공유 · 디지털 구매 ·
제한 없는 인터넷 → 아니요 · 폭력·성·약물·도박 → 없음. 질문 문구는 콘솔에서 확인. (전체이용가에 「사용자 상호작용」 표시가 붙을 것으로 본다 — 예상)

**⑨ 이미 맞는 것(손대지 않는다):** `targetSdkVersion 36` · 광고 ID 「아니요」 · 전송 중 암호화 「예」(전부 HTTPS) · 방침 공개 URL(로그인 없이 열림) ·
앱 판 `versionCode 2`(위젯 판 1.1.0).

### 5. 데이터 보안 — 콘솔에 넣을 답 (위 「등록 절차 › 6. 앱 콘텐츠」의 표를 대신한다)

머리 질문: 데이터 수집·공유 → **예** · 전송 중 암호화 → **예** · 삭제 요청 방법 → **예** ·
계정 → 앱 안에서 만든다(비밀번호 없이 이름·소속 — 선택지 중 뜻이 가장 가까운 것, 대개 「기타」. 콘솔에서 확인) ·
계정 삭제 URL → `https://gocheok.onlybible.kr/privacy/#delete` · 일시 처리 → 전부 아니요(저장한다).

| 범주 → 유형 | 수집 | 공유 | 필수/선택 | 목적 | 무엇 |
|---|---|---|---|---|---|
| 개인 정보 → 이름 | 예 | 아니요 | 필수 | 앱 기능 · 계정 관리 | 로그인 이름 |
| 개인 정보 → 사용자 ID | 예 | 아니요 | 필수 | 앱 기능 · 계정 관리 | 서버가 매기는 계정 번호(요청마다 실린다) |
| 개인 정보 → 전화번호 | 예 | 아니요 | 선택 | 앱 기능 | 필사 노트 · 사역 신청한 분만 |
| 개인 정보 → 정치적 또는 종교적 신념 | 예 | 아니요 | 필수 | 앱 기능 · 계정 관리 | 교구·목장/부서(다니는 교회) · 직분(사역 신청) — (판단) 4절 ① |
| 개인 정보 → 기타 정보 | 예 | 아니요 | 선택 | 앱 기능 | 학년(교회학교) |
| 사진 및 동영상 → 사진 | 예 | 아니요 | 선택 | 앱 기능 | 게시판 사진(찍은 장소 정보는 지워서 받는다) |
| 앱 활동 → 앱 상호작용 | 예 | **예** — 구글(찬양 재생 때) | 필수 | 수집: 앱 기능 · 분석 / 공유: 앱 기능 · 분석 · 광고 또는 마케팅 · 사기 방지·보안·규정 준수 | 암송·도전·복습 기록 · 열람 기록 / 재생한 찬양 영상 |
| 앱 활동 → 기타 사용자 생성 콘텐츠 | 예 | 아니요 | 선택 | 앱 기능 | 게시판 글·답글 · AI 질문(Anthropic 은 서비스 제공업체) · 신고에 덧붙인 말 |
| 앱 활동 → 기타 작업 | 예 | 아니요 | 선택 | 앱 기능 | 공감 · 순위 응원 · 이벤트 신청 · 게시판 신고 |
| 위치 → 대략적인 위치 | 예 | **예** — 구글(찬양 재생 때) | 선택 | 광고 또는 마케팅 · 사기 방지·보안·규정 준수 | 구글이 IP 로 도시 단위 위치를 추정(2-2). 우리는 위치를 쓰지 않는다 |
| 기기 또는 기타 ID | 예 | **예** — 구글(찬양 재생 때) | 선택 | 수집: 앱 기능 · 개발자 커뮤니케이션 / 공유: 분석 · 광고 또는 마케팅 · 사기 방지·보안·규정 준수 | 알림 등록 값(1절) / 유튜브 플레이어의 쿠키·식별값 |
| 그 밖 — 이메일 · 주소 · 연락처 · 정확한 위치 · 금융 · 건강 · 메시지 · 음성 · 파일 · 캘린더 · 웹 기록 · 설치된 앱 · 비정상 종료 기록 · 진단 | 아니요 | 아니요 | | | |

⚠️ 공유 줄 셋(구글)은 **2-1 끝의 「앱 밖 재생」을 고르면 지운다** — 그때 「광고 포함」도 「아니요」로 함께 바꾼다.
⚠️ 앱이 새로 무엇을 모으기 시작하면(새 표·새 칸) **이 표와 `privacy/` 를 같은 날** 고친다 — 이번처럼 사진·열람 기록이 표 밖에서 쌓인다.

### 6. 앱 액세스(심사자 안내) — 그대로 붙여 넣을 글

Play Console → 앱 콘텐츠 → **앱 액세스** → 「일부 또는 모든 기능이 제한됨」 → 안내 추가. 사용자 이름·비밀번호 칸이 있으면 「No password」.

```
This app has no password. Anyone can sign in with a church group and a name.
1. On first launch, tap "건너뛰기" (Skip) on the intro slides.
2. 구분 (Type): tap "교구".
3. 교구 (Parish): tap any one, e.g. "새가족".
4. 목장 (Group): type the number 99 (numbers only).
5. 성명 (Name): type any name, e.g. Reviewer.
6. Tick the box "위 개인정보 수집·이용 안내를 확인하고 동의합니다." (privacy consent).
7. Tap "시작하기" (Start). On the welcome screen, tap "아멘, 시작하기".
Account and data deletion: ⚙️ Settings → "🔐 개인정보 안내 보기" → "📄 전체 안내 보기",
or https://gocheok.onlybible.kr/privacy/#delete
Board posts can be reported with "🚩 신고" next to each post.
```

- ⚠️ 심사자가 만든 계정은 **운영 DB 의 진짜 계정**이다(순위·「지금 N명」에 보일 수 있다). 결과가 나오면 방침 5항과 같은 방법으로 지운다.
- ⚠️ 마지막 줄(신고)은 신고가 **운영에 배포된 뒤에만** 넣는다. 위 4절 ③ 의 가리기·이용 규칙을 더하면 한 줄씩 늘린다.

### 7. 체크리스트 — 이 순서대로

**출시 전, 앱·방침 쪽(배포가 필요하다 — 메인 세션이 개발 DB → 운영 순으로):**
- [ ] 게시판 신고 운영 배포(이 가지 · `supabase/board_reports.sql` 머리의 순서)
- [ ] 게시판 이용 규칙 — 처음 글 쓸 때 한 번 동의(하지 말 것 목록) · 글쓴이 가리기(내 기기에서만) — 4절 ③
- [ ] 「내게 주시는 말씀」 답 아래 「🚩 이 답 알리기」 — 4절 ④
- [ ] 방침 `privacy/` + 앱 안 두 곳: 열람 기록 · 공감·응원·이벤트 · 음성 · 유튜브 약관 문구 · 5항 「지워지는 것」 — 4절 ⑤⑥
- [ ] 어린이 부서 로그인의 보호자 확인 단계 — **법 확인 먼저** · 숫자부터(3절 SQL) — 3절
- [ ] (권장) 앱 안 「계정·기록 삭제 요청」 바로가기(`privacy/#delete`) — 4절 ⑤
- [ ] `listing-ko.txt` — 설명 한 줄(4절 ⑦) · 심사자 안내 칸(이 절 6의 글)

**앱 이전이 끝난 뒤, 교회 계정 Play Console 「앱 콘텐츠」:**
- [ ] 0. 이전 뒤에도 각 선언이 남아 있는지 먼저 본다(남아 있으면 아래대로 고친다)
- [ ] 1. 개인정보처리방침 → `https://gocheok.onlybible.kr/privacy/`(방침 고친 판이 배포된 뒤)
- [ ] 2. 앱 액세스 → 「일부 또는 모든 기능이 제한됨」 + 이 절 6의 글
- [ ] 3. 광고 → **「예, 광고 포함」**(2-1)
- [ ] 4. 콘텐츠 등급 → 설문 다시(4절 ⑧ — 사용자 상호작용 「예」)
- [ ] 5. 타겟층 및 콘텐츠 → **13–15 · 16–17 · 18세 이상**만 · 어린이 매력 질문은 사실대로(3절)
- [ ] 6. 데이터 보안 → 이 절 5의 표 그대로 · 삭제 URL `…/privacy/#delete`
- [ ] 7. 광고 ID → 「아니요」(1절)
- [ ] 8. 정부 앱 · 금융 기능 · 건강 · 뉴스 → 해당 없음
- [ ] 9. 스토어 등록정보 → 고친 설명(4절 ⑦) · 스토어 그림은 지금 것(어린이 요소 없음)
- [ ] 10. 제출 뒤 반려 메일이 오면 **사유 문장을 그대로** 이 절 아래에 붙여 둔다(closed-test.md 처럼)

> 아이폰(App Store Connect)의 같은 ⚠️ 목록(아래 「4. App Privacy」 — 기기 ID · 유튜브 · 추적)도 **같은 근거**로 풀린다.
> 다음 아이폰 판을 제출할 때 맞춘다(이 절은 구글만 정했다).

**[출처]** (2026-10-01 읽음)
1. 데이터 보안 섹션 정의 — https://support.google.com/googleplay/android-developer/answer/10787469
2. 앱 심사 준비(광고 · 앱 액세스 · 타겟층) — https://support.google.com/googleplay/android-developer/answer/9859455
3. 광고 정책 — https://support.google.com/googleplay/android-developer/answer/9857753
4. 타겟층 및 콘텐츠 관리 — https://support.google.com/googleplay/android-developer/answer/9867159
5. 가족 정책 — https://support.google.com/googleplay/android-developer/answer/9893335
6. 가족 앱의 데이터 관행 — https://support.google.com/googleplay/android-developer/answer/11043825
7. 사용자 제작 콘텐츠 — https://support.google.com/googleplay/android-developer/answer/9876937
8. AI 생성 콘텐츠 — https://support.google.com/googleplay/android-developer/answer/13985936
9. 계정 삭제 요건 — https://support.google.com/googleplay/android-developer/answer/13327111
10. 사용자 데이터 정책 — https://support.google.com/googleplay/android-developer/answer/10144311
11. 메타데이터 정책 — https://support.google.com/googleplay/android-developer/answer/9898842
12. 유튜브 퍼가기 · 개인정보 보호 강화 모드 — https://support.google.com/youtube/answer/171780
13. 퍼간 영상의 광고 — https://support.google.com/youtube/answer/132596
14. 유튜브 서비스 약관(수익 창출 권리) — https://www.youtube.com/t/terms
15. YouTube API 서비스 개발자 정책(III.A · III.J) — https://developers.google.com/youtube/terms/developer-policies
16. 맞춤·비맞춤 광고(구글 애드 매니저) — https://support.google.com/admanager/answer/9005435

---

# App Store(iOS) 등록 준비물

iOS 2단계(위젯·네이티브 로그인 화면·네이티브 푸시)를 실기기로 확인한 뒤(2026-09-16),
3단계(정식 심사 제출) 준비물이다. 배경·설계는 이 파일 맨 위 "아이폰(App Store)" 문단과
`docs/superpowers/specs/2026-09-13-ios-app-design.md` 참고.

## 이 단계에서 만든 것

| 파일 | 쓰는 곳 |
|---|---|
| `listing-ios-ko.txt` | App Store Connect의 각 입력칸에 그대로 붙여넣는다(칸 이름이 각 항목 제목) |
| `screenshots-ios/real-*.png` | **App Store Connect → 미디어 관리** (1242×2688, 9장 — 실기기/시뮬레이터로 직접 찍은 진짜 화면) |

⚠️ **크기는 1242×2688(또는 1284×2778)이 정답이다 — 1290×2796·1320×2868 아님.**
처음엔 웹 화면을 흉내 낸 6.7인치(1290×2796) 스크린샷을 `tools/capture-ios-shots.py`로
만들었는데, **실제로 App Store Connect에 업로드해 보니 거부됐다**(2026-09-16, 사용자
확인). 업로드 창이 직접 알려준 허용 크기는 `1242×2688, 2688×1242, 1284×2778, 2778×1284`
뿐이다. 지금 쓰는 `real-*.png`는 실기기(또는 시뮬레이터)로 직접 찍은 1242×2688 원본이라
이 조건을 그대로 만족한다 — **리사이즈하지 않는다.**

`real-*.png`는 실제 로그인된 성도님 계정(이름·소속·암송 기록)으로 찍혀서, 이름·숫자가
나오는 자리를 흐림 처리(Gaussian blur)해 뒀다(2026-09-16). 다시 찍을 일이 있으면
① 실기기/시뮬레이터로 화면을 찍고 ② 이름·진도 숫자가 보이는 자리를 반드시 가린 뒤 커밋한다
— **가리지 않은 원본을 저장소에 올리지 않는다.**

⚠️ **화면 구성을 다시 볼 것(아직 안 고침, 사용자 판단 필요):**
- `real-02-memorize-input.png` — 키보드가 화면 절반을 덮고 있어 스토어용으로는 별로다
- `real-07-prayer-book.png` / `real-08-prayer-topics.png` — 둘 다 "가정 축복 기도문" 화면이라 겹친다. 하나만 골라도 된다
- 필요하면 순서 조정·일부 제외 후 업로드(9장 다 쓸 필요는 없다, 최대 10장까지 가능)

`tools/capture-ios-shots.py`(웹 화면을 흉내 내 찍는 스크립트)는 그대로 남겨 뒀다 —
실기기가 없을 때 급하게 화면 구성만 확인하는 용도로는 여전히 쓸 수 있지만, **실제
업로드용으로는 이제 `real-*.png`(실기기 캡처)를 쓴다.**

## 기기 지원 범위 — 아이폰 전용 (2026-09-16 결정)

아이패드는 실기기로 한 번도 확인 못 해봐서 지원 범위에서 뺐다
(`ios-app/ios/App.xcodeproj/project.pbxproj`의 App 타겟 `TARGETED_DEVICE_FAMILY`를
`"1,2"` → `1`로). 아이패드 스크린샷을 준비할 필요가 없어졌다. 나중에 아이패드로
실기기 확인을 마치면 다시 `"1,2"`로 켜고 아이패드용 스크린샷(13인치, 2064×2752)을 더하면 된다.

## App Store Connect 등록 절차

### 1. 앱 정보
App Store Connect → 앱(이미 만들어져 있다, Bundle ID `kr.onlybible.gocheok.memorize`, App ID `6811724527`)
- **이름**: 성경말씀 암송 (고척교회) — 이미 등록됨
- **카테고리·부제·저작권** — `listing-ios-ko.txt`의 [카테고리]/[저작권] 참고

### 2. 버전 정보 (준비 중인 버전)
`listing-ios-ko.txt`의 각 대괄호 항목을 App Store Connect의 같은 이름 칸에 붙여넣는다:
프로모션 텍스트 · 설명 · 키워드 · 지원 URL · 마케팅 URL · 이번 버전의 새로운 기능.

### 3. 스크린샷 업로드
**미디어 관리**에 `screenshots-ios/real-*.png`를 순서대로 올린다(파일명 앞의 01~09가
권장 순서 — 처음 2~3장만 목록에서 먼저 보인다). 위 "화면 구성을 다시 볼 것" 항목 참고해
겹치거나 안 예쁜 화면은 빼고 올려도 된다.

### 4. App Privacy(개인정보 취급방침 — "프라이버시 취급 세부정보")
안드로이드의 "데이터 보안 양식"과 같은 성격이지만 애플은 자체 분류 체계(수집 항목 →
그 항목이 "사용자 추적에 쓰이는지" → "사용자 본인과 연결되는지")를 따로 묻는다.
**실제로 모으는 것과 한 글자도 어긋나면 안 된다** — 안드로이드 표(위 "6. 앱 콘텐츠")와
같은 근거로 채운다:

| 애플 분류 | 답 | 근거 |
|---|---|---|
| **연락처 정보 → 이름** | 수집함 · 본인과 연결됨 · 앱 기능 목적 | 로그인이 이름·소속뿐 |
| **연락처 정보 → 전화번호** | 수집함 · 본인과 연결됨 · 앱 기능 목적 | 필사 노트 신청자만(선택) |
| **사용자 콘텐츠 → 기타 사용자 콘텐츠** | 수집함 · 본인과 연결됨 · 앱 기능 목적 | 게시판 글, 「내게 주시는 말씀」 질문, 게시판 🚩 신고(2026-10-01) |
| **사용 데이터 → 제품 상호작용** | 수집함 · 본인과 연결됨 · 앱 기능 목적 | 암송 진도·도전 기록 |
| **식별자 → 기기 ID** | **수집 안 함으로 표시** | 푸시 기기 토큰은 광고 추적용이 아니라 "사용자 추적(Tracking)"에 해당 안 함 — App Tracking Transparency 대상 아님 |
| 위치·사진·건강·금융·검색 기록 | 전부 수집 안 함 | |
| **추적에 사용** | **아니오**(전부) | 광고·타사 데이터 브로커에 안 넘긴다 |

⚠️ **2026-09-23 오늘의 찬양이 앱 안 유튜브 재생(파사드 → youtube-nocookie.com 임베드)으로
바뀌었다 — 위 표는 이 변화 이전 기준이다. App Store Connect에서 다시 확인해야 할 항목:**
- 위 표에 **제3자(구글/유튜브) 서비스가 수집하는 데이터** 행이 빠져 있다 — 추가 필요(확인 필요)
- 「▶ 찬양 듣기」를 누른 순간에만 구글로 전달되는 것(접속 IP·기기 정보·시청 기록)을
  애플 분류 중 어디(사용 데이터/식별자)로 넣을지 — 확인 필요
- **본인과 연결됨(Linked to You)** 여부 — 우리는 이름·소속·진도를 구글에 보내지 않지만,
  구글이 자체적으로 IP 등으로 사용자를 식별할 가능성을 애플 기준에서 어떻게 표시해야 하는지 — 확인 필요
- **추적에 사용(Used for Tracking)** 여부 — youtube-nocookie 도메인은 광고 쿠키를 줄일 뿐 완전히
  없앤다는 보장은 아니므로 "아니오"가 여전히 맞는지 재검토 — 확인 필요
- App Review 메모에 "오늘의 찬양이 앱 안에서 유튜브 영상을 재생한다"는 사실을 새로 적을지 — 확인 필요

- **개인정보처리방침 URL**: `https://gocheok.onlybible.kr/privacy/` (안드로이드와 동일)

### 5. 연령 등급
2026년 개편된 애플 설문(폭력·공포·도박 등 항목별 빈도 선택) 기준:
- **종교/영성 콘텐츠**: 있음 (성경 말씀·기도문)
- **사용자 생성 콘텐츠**: 있음 (게시판) → "신고·차단 기능이 있는지" 물으면, 관리자가
  게시판 글을 직접 관리하는 구조임을 설명(1.0.1·1.1.0 심사 때는 신고 버튼이 없었다 —
  2026-10-01 부터 웹 쪽에 「🚩 신고」가 들어가 앱에도 그대로 보인다. 다음 심사부터는 「글마다 신고 단추 →
  운영진이 숨기기」로 답한다)
- 나머지(폭력·공포·선정성·도박·술/담배 등): 전부 없음
- 예상 등급: **4+** 또는 무관(종교 콘텐츠만으로는 등급이 안 올라간다)

### 6. App Review 정보 (가장 중요 — 반려 여부가 갈리는 자리)
`listing-ios-ko.txt`의 [App Review 정보 — 로그인 안내] 그대로 붙여넣는다. 핵심은 두 가지:
1. **로그인 방법**(비밀번호 없음, 교구→아무 항목→이름 순서) — 이걸 안 적으면 심사자가
   첫 화면에서 막혀 반려된다(안드로이드 때와 같은 함정).
2. **네이티브 기능을 명시적으로 설명** — 가이드라인 4.2(웹앱을 그대로 담은 앱 거절)가
   이번 전체 작업의 이유이므로, 위젯·네이티브 로그인 화면을 심사자가 스스로 알아채길
   기대하지 않고 메모에 직접 적어 둔다.

⚠️ **네이티브 푸시는 아직 실기기에서 확인이 안 됐다**(CLAUDE.md "다음 작업" 참고 — 서버는
정상인데 기기에 안 뜸, Mac+Xcode 콘솔 로그 필요). 그래서 App Review 메모·마케팅 문구에서
푸시는 굳이 내세우지 않았다 — 심사자가 직접 눌러보고 안 되는 걸 발견하면 그게 오히려
반려 사유가 될 수 있다. 위젯·네이티브 로그인 두 가지만으로도 4.2 대응 근거는 충분하다.
**푸시가 실기기에서 확인되면** `listing-ios-ko.txt`의 새로운 기능·App Review 메모에
한 줄 추가해도 된다.

### 7. 수출 규정 준수(암호화)
`ITSAppUsesNonExemptEncryption = NO`가 이미 `Info.plist`에 들어가 있어(2026-09-15) 이
질문에 자동으로 답해진다 — 매번 묻지 않는다.

### 8. 제출
위 1~7이 다 끝나면 **"심사를 위해 제출"**. 심사는 보통 1~3일. 반려되면 사유를 보내주시면
바로 대응하겠다(위젯·푸시 때처럼 반복 대응이 정상일 수 있다).

---

## 단체(교회 명의) 계정 — 언제·어떻게 (2026-09-15)

플레이스토어의 "테스터 12명×14일" 반복 반려(2026-09-13)를 계기로 검토를 시작했다.
애플·구글 **둘 다** 단체 계정엔 **D-U-N-S 번호**(던앤브래드스트리트 발급, 사업자·단체 고유
9자리)가 필요하다 — 없으면 무료로 새로 신청. **추천 경로는
`developer.apple.com/enroll/duns-lookup`**(교회 Apple ID로 로그인 → 조회/신청, 보통
5영업일+애플 반영 2영업일, 무료) — 한 번 받으면 구글 쪽에도 그대로 재사용한다.
한국 대행사(나이스디앤비 `global.nicednb.com`)로 직접 신청하면 수수료가 붙고 최대 30일
걸려 비추천.

| | 애플(Organization) | 구글(조직) |
|---|---|---|
| 등록 | `developer.apple.com/enroll` → Organization | Play Console → 새 개발자 계정 → 조직 |
| 필요 정보 | D-U-N-S + 교회 명칭·주소(자동 대조) | D-U-N-S + 교회 명칭·주소(동일 대조) |
| 등록 권한 확인 | **애플이 전화로 직접 확인**(대표 권한자 필요) | 서류 검증 위주 |
| 비용 | 연 $99 | $25(1회) |
| 소요 | 1~2주(개인보다 오래) | 수일 |

교회에 요청할 것(정식 명칭·주소·대표전화·고유번호증 사본·기존 D-U-N-S 보유 여부·등록 권한자
협조·등록비 승인·**영문(로마자) 명칭 확정 + 고유번호증 영문 번역본**)과 담당자에게 보낼 안내문은
`church-org-registration.pdf`(원본 `church-org-registration.html`)로 만들어 뒀다 — 다시 설명할
필요 없이 그대로 보내면 된다.
⚠️ 영문 번역본은 공증까지는 필요 없다 — D-U-N-S 국제 기록이 영문 명칭 기준이라 등록 시 정식
영문 표기를 정해야 하고, 자동 대조 실패 시 애플·구글 심사팀에 낼 서류로 준비해 두는 것이다.

⚠️ 단체 등록은 **스토어 계정 전환일 뿐**, 지금 개인 명의로 진행 중인 iOS 작업(위젯·TestFlight)과는
무관하게 계속 진행한다. 단체 등록이 끝나면 스토어 계정만 옮기면 되고 앱을 다시 만들 필요는 없다.

### 구글 쪽 결정 — 계정 유형 전환이 아니라 별도 계정 + 앱 이전

구글은 두 경로가 있다: ① 지금 쓰는 개인 계정을 그 자리에서 단체로 전환(앱 이동 없음, 조직
웹사이트 인증만) ② 완전히 새 단체 계정을 만들어 앱을 이전(Transfer). **②로 하기로 결정** —
①은 결국 "진짜 개인 계정"이라는 뿌리가 남는다(성도님 판단, 2026-09-15). ② 이전 절차:
양쪽 계정(보내는 개인 · 받는 단체)의 "등록 거래 ID"가 필요(가입 이메일에서 "developer
registration fee"로 검색) → 정책 위반 점검 → Play Console에서 이전 요청(패키지명
`kr.onlybible.gocheok.memorize`) → 구글이 2영업일 내 처리. ⚠️ 정식 출시가 꼭 필요한 조건인지는
구글 문서에 없다(애플은 "최소 1회 출시" 조건이 명확) — 이전 요청 화면에서 직접 확인할 것.

### 진행 상황

- [x] **교회 전용 Gmail 생성**(2026-09-15): `church.gocheok@gmail.com` — 애플·구글 양쪽에
      이메일은 같게, 로그인 계정은 각각 따로 쓴다. 다음: 이 메일로 ① Apple ID 새로 가입 →
      D-U-N-S 조회/신청 ② 이 메일로 Play Console 단체 계정 만들기(이전 받는 쪽)
      ⚠️ 복구 전화번호는 우선 개인 번호로 등록했다 — 나중에 교회 사무실 번호 등 계속 유지되는
      번호로 바꿔둘 것. 비밀번호·복구정보는 신앙운동팀 여러 명이 아는 곳에 기록해 둘 것.
- [x] **D-U-N-S 신청 접수**(2026-09-15 02:45 UTC): Case Number 10973922 / Tracking ID
      10914163. 제출된 교회명이 **로마자 음역**("DAEHANYESUGYO JANGNOHOE GOCHEOK GYOHOE").
      **결정(2026-09-15): 지금 이 케이스는 그대로 두고 D-U-N-S 번호를 먼저 받은 뒤,
      배정 후에 D&B 자체 정보수정 도구(`iupdate.dnb.com`/`duns-update.dnb.com`)에서
      영문 번역명으로 고친다** — 번호 자체는 이름을 바꿔도 유지되므로 이 경로가 더 안전
      (진행 중인 케이스를 건드려 지연될 위험 없음).
      **영문 번역명 확정(2026-09-15): "Gocheok Presbyterian Church"** — D-U-N-S 번호
      나오면 이 이름으로 정정한다.
- [x] **교회 Gmail 사용정지(2026-09-17) → 복구(2026-09-22)** — `church.gocheok@gmail.com` 다시 쓴다.
      ⚠️ 다만 애플 단체 **등록** 단계는 **단체 도메인 이메일**을 요구한다("Your work email address
      needs to associated with your organization's domain name") — 그때 `@gocheok.or.kr` 주소가
      필요할 수 있다.
- [ ] ❌ **D-U-N-S 신청 반려(2026-09-21 06:50 UTC)** — Case 10973922 종결. Resolution: "D-U-N-S Number
      could not be created" / Sub-Resolution: "Required documents not provided" / 코멘트: 회사 실재를
      확인하지 못했으니 **국세청(홈택스)이 3개월 이내에 발급한 영문 사업자등록증명**을 첨부해 다시
      신청하라(Request Key 는 공개 저장소라 적지 않는다 — 결과 메일에 있다).
      → 교회 고유번호로 홈택스 **사업자등록증명 → 발급유형 「영문증명」**을 뽑는다(영문 상호·대표자·
      주소를 입력하는 칸이 있다 — 상호는 확정한 "Gocheok Presbyterian Church"). 교회 사무실에서
      기부금영수증을 홈택스로 내고 있다면 단체 인증서가 이미 있다. 없으면 구로세무서 민원실.
      → **다시 신청할 땐 처음부터 영문 이름으로** — 케이스가 닫혔으니 "번호 받은 뒤 이름 정정"(위 B안)은
      더 이상 필요 없다. 증명서의 영문 상호·주소와 **글자 하나까지 같게** 넣는다.
      → ⚠️ **애플 조회 도구(`duns-lookup`)에는 파일 첨부 칸이 없다(2026-09-22 확인).** 서류는 D&B 의
      애플 전용 문의 양식 `support.dnb.com/?CUST=APPLEDEV` 「Submit Case」로 보낸다 — 법적 서류를
      **두 개 이상** 올리게 돼 있다(영문 사업자등록증명 + 국문 고유번호증 사본). 설명란에 옛
      Case·Tracking 번호와 반려 사유를 적는다. 개인 신분증·통장 사본은 넣지 않는다.
      양식 첫 화면 「User Group」은 **Developer Program**(Apple Business Manager 는 기기 관리용).
      → 발급받은 **영문 사업자등록증명의 상호가 로마자 음역**("DAEHANYESUGYO JANGNOHOE GOCHEOK
      GYOHOE")이라(2026-09-22) 신청서도 그 이름 그대로 넣는다. ⚠️ 애플은 단체 이름을 **App Store
      판매자 이름**으로 보여 준다 — 그 이름이 싫으면 제출 **전에** 영문 상호를 고친 증명서를 다시
      뽑는 게 가장 싸다. 증명서 자체에 「영문 임의기재사항[상호, 성명(대표자), 업태, 종목, 상세주소]은
      실체적 권리관계를 증명하는 효력이 없습니다」라고 찍혀 있다 = **영문 상호는 발급받는 사람이 적는 칸**이다.
      → 가진 증명서: 구로세무서 **2026-09-15 발급**(3개월 기준이면 12월 중순까지 쓸 수 있다) · 영문 주소
      `79 Jungang-ro, Guro-gu, Seoul, Republic of Korea` · 개업일 1954-10-28. ⚠️ 대표자 생년월일이 찍혀
      있으니 **이 저장소에 파일로 넣지 말 것**(공개 저장소).
- [ ] ⏳ **D-U-N-S 재신청 접수(2026-09-22)** — D&B 애플 전용 양식(`support.dnb.com/?CUST=APPLEDEV`)
      → 「I need to lookup my DUNS」 → 검색 결과(송파구 "MS Gocheok" 주식회사 둘 — **우리 아님**)를 고르지 않고
      「click here to submit a request to create a new D-U-N-S」 → **Case #34865071**.
      넣은 값: 법적 이름 = 증명서 로마자 음역 · 사업자번호 113-82-04045 · Legal Structure `Non-profit Organization`
      · 대표 Donghyuk Cha(Pastor) · 개업일 10/28/1954 · 우편번호 08228(확인함) · 첨부 = 영문·국문 사업자등록증명.
      D&B 안내: **7~14영업일** → 10/1(목)~10/12(월)쯤(추석 연휴로 늦어질 수 있다). 답은 `church.gocheok@gmail.com`
      으로 온다. 진행 상황은 같은 사이트 **「Case Status Report」** 탭. D&B 가 교회 사무실(02-2686-5871)로
      확인 전화를 걸 수 있다. 번호가 나오면 → 애플 반영 2영업일 → 애플 조회 도구로 확인 → 단체 등록.
      ⚠️ 서류 요청 메일이 따로 왔었는지 확인할 것 — 연락처가 정지된 Gmail 이었다면 요청을 못 받아
      "서류 미제출"로 닫혔을 수 있다. 재신청 연락처는 매일 보는 주소로.
- [x] ✅ **D-U-N-S 발급(2026-09-30)** — **690031840** · 법적 이름 **`DAEHANYESUGYO JANGNOHOE GOCHEOK GYOHOE`**
      (D&B 메일: 애플 등록엔 번호와 이름을 **적힌 그대로** 넣을 것 · 애플 쪽은 24~48시간 뒤부터 쓸 수 있다).
      같은 날 플레이 프로덕션 2차 반려 → **구글 단체 계정부터 만든다.**
- [x] ✅ **구글 단체 계정 생성(2026-09-30)** — 소유자 `church.gocheok@gmail.com` · 조직(비영리단체) · 개발자 이름 **「고척교회」**(처음엔
      「Kim Se Woong」으로 만들어져 바꿨다) · 조직 전화 교회 사무실 · 앱 카테고리 「해당 사항 없음」.
      결제 프로필의 조직 이름은 한글 「대한예수교장로회고척교회」로 들어갔다(D&B 메일의 법적 이름은 로마자) — 불일치 경고가 오면
      결제 프로필 이름을 로마자로 고친다(구글 안내서: 고칠 기간 28일).
      **조직 웹사이트는 `https://gocheok.onlybible.kr/`**(교회 홈페이지 `www.gocheok.or.kr` 는 서치 콘솔 등록을 남에게 부탁해야 해서 바꿨다).
      서치 콘솔(URL 접두어 · 같은 교회 계정) 확인 파일 = 저장소 맨 위 **`google034a4f85121d737a.html` — 지우지 말 것**(지우면 확인이 풀린다).
      ✅ 같은 날 서치 콘솔 확인(HTML 파일) → Play Console 조직 웹사이트 인증 통과. 남은 것: 전화 인증 · (요청이 오면) 조직 서류
      ⚠️ **공개 「개발자 전화번호」는 지금 휴대폰이다** — 첫 인증은 휴대폰 문자로 하고, **앱 이전을 요청하기 전에** 교회 사무실
      번호(02-2686-5871)로 바꿔 다시 인증한다(번호를 바꾸면 매번 다시 인증 · 음성 전화로 6자리 — 누르는 순간 걸려 온다).
      앱이 이 계정으로 오면 개발자 프로필(전화 포함)이 스토어에 보인다. 휴대폰 번호는 이 저장소에 적지 않는다.
      ⚠️ **교회 대표번호(5871)는 내선 ARS 로 넘어간다**(친구 확인 2026-09-30) — 구글 자동 음성은 버튼을 못 누르니 인증번호가
      ARS 안내에 묻힐 수 있다. **사람이 바로 받는 직통 번호**(5872·5873 이나 부서 직통)가 있는지 사무실에 먼저 묻는다.(영문 사업자등록증명 9/15 발급분 — 상호가 D-U-N-S 이름과 같다)
      · 대표자 신분증 → 구글 승인(며칠) → 전화 인증(문자 또는 음성 전화).
- [x] ✅ **조직·신원 서류 인증 통과(2026-09-30)** — 구글 메일이 「한글 문서로 확인한다」고 해 **한글 서류**를 올렸고 같은 날 완료
      (영문 사업자등록증명은 필요 없었다 — D&B 쪽에서만 쓰였다).
- [ ] **구글 단체 계정 → 앱 이전** — 신청은 **보내는 쪽(개인 계정)** 이 `play.google.com/console/developers/app-transfer` 에서 한다.
      ⚠️ **등록 거래 ID 가 두 계정 모두 필요하다**(개인 계정 것 + 교회 계정 것) — 각 계정으로 `payments.google.com` → 활동 →
      개발자 등록비 $25 거래 → 맨 아래 거래 ID. 앞머리(`0.G.` 나 `token`·`Registration` 앞의 숫자)는 지우고 넣는다.
      받는 쪽(교회 계정)이 검토·수락 → 구글 2영업일. 테스트 그룹(명단)은 안 옮겨진다 · 보고서는 미리 내려받아 둔다.
      **2026-09-30 이전 신청 제출**(받는 쪽 교회 계정 · 비즈니스 관계 「해당 사항 없음」 — 사람과 단체는 다른 주인이다).
      같은 날 구글 지원팀 접수 메일(케이스 **5-5735000041464**, 개인 계정 메일함): 사용자·통계·리뷰·평점은 함께 옮겨지고,
      결제·주문 기록은 옛 계정에 남는다(무료 앱이라 해당 없음). **취소할 때만 답장** — 아니면 **2영업일 뒤 처리**, 앞당길 수 없다.
      ✅ **교회 계정에서 수락 완료(2026-09-30 12:32 KST)** — 이제 구글 처리만 남았다. 끝나면 교회 계정 메일로 「사용할 수 있게 됨」 알림이 온다.
      **위젯 판 aab(1.1.0 · versionCode 2)는 뽑아 두었다** — 저장소 밖 `C:\Projects\성경암송-위젯판-1.1.0\` 에 업로드 키별 두 개
      (`…-08D5.aab` 옛 키 · `…-3A17.aab` 「New」 키). 콘솔 「앱 무결성 → 앱 서명 → 업로드 키 인증서」 SHA-256 앞머리와 같은 쪽을 올린다.
      ⚠️ 콘솔 값이 `08:D5` 면 8/26 공개 저장소에 노출된 키다 — 이전이 끝난 뒤 교회 계정에서 「업로드 키 재설정」을
      `New/upload_certificate.pem` 으로 요청해 이후는 `3A:17` 로 올린다.
      (아래 줄은 9/30 처음 적은 것) `church.gocheok@gmail.com` · 조직 · $25 · D-U-N-S 위 번호.
      ⚠️ 결제 프로필은 「조직」으로 새로 만들고 이름·주소를 D&B 와 **글자 하나까지** 같게
      (`DAEHANYESUGYO JANGNOHOE GOCHEOK GYOHOE` · `79 Jungang-ro, Guro-gu, Seoul 08228, Republic of Korea`).
      스토어에 보이는 「개발자 이름」은 달라도 된다(한글 「고척교회」 등).
      인증 → 개인 계정에서 이전 요청(받는 쪽 등록 거래 ID) → 2영업일 → 프로덕션 출시.
      이전 뒤 확인 둘: 대시보드에 「프로덕션 액세스 신청」 단계가 **없는지** · 「앱 무결성」 SHA-256 이
      `.well-known/assetlinks.json` 첫 줄과 같은지. 순서와 불확실한 것은
      `docs/analysis/2026-09-30-play-production-rejected-org-account.md`.

---

## 이미 손봐 둔 것 (2026-08-24)

TWA·스토어가 요구하는 조건에 맞춰 웹앱 쪽을 먼저 고쳤다.

- `manifest.json` 아이콘이 192·512 **둘 다 `favicon.png`(실제 495×495)** 를
  가리키고 있었다 → 실제 크기 파일로 바로잡고, **maskable** 두 벌을 더했다.
  안드로이드는 아이콘에 마스크(원형 등)를 씌우는데, 마크가 캔버스 끝까지 차 있어
  그냥 두면 십자 팔 끝이 잘렸다. 마크를 62%로 줄여 안전영역에 넣었다.
- `apple-touch-icon` 이 **투명 배경**이었다 → iOS는 투명한 곳을 검정으로 채워
  아이폰 홈 아이콘이 검은 바탕으로 나왔다. 불투명 `apple-touch-icon.png`로 교체.
- `id`·`scope` 추가. scope가 없으면 앱이 다룰 범위가 추정에 맡겨진다.
- `screenshots` 추가 — 안드로이드 설치 창이 이걸 미리보기로 보여 준다.
