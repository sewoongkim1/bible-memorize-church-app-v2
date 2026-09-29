# 플레이스토어 프로덕션 2차 반려 — 개인 계정 3차 대신 교회(단체) 계정으로 간다

> **한 줄 결론.** 반려 메일이 든 사유는 둘이다 — **① 테스터가 앱에 참여하지 않았다 ② 앱 업데이트로 의견을 받아 고치는 권장사항을 안 따랐다.**
> ②는 **테스트 14일 동안 앱 판이 한 번도 안 바뀐 것**(`versionCode 1` 그대로)이다. 우리 앱은 웹을 감싼 껍데기(TWA)라 고친 것이 전부 웹으로 나가서
> 구글 눈에는 「업데이트 없음」이다 — 3차를 해도 같은 자리에서 또 걸릴 수 있다.
> 마침 **D-U-N-S 번호가 나왔으므로(2026-09-30) 교회 명의 단체 계정을 만들고 앱을 그리로 옮긴다.** 12명·14일 요건은 개인 계정에만 있다.
> 작성 2026-09-30 · 대상 저장소: bible-memorize-church-app-v2(`store/`)

## 1. 배경 — 왜 이걸 봤나

친구의 말: 「안드로이드 심사통과하지 못했습니다.」(Play Console 통계 화면 캡처와 함께) 이어서
「DUNS 신청이 완료되었으니 이걸로 신청을 할까요?」

지금까지의 흐름:

```
08-26  비공개 테스트 트랙 게시 (앱 판 versionCode 1)
08-27  테스터 12명 → 14일 시계 시작
09-11  1차 프로덕션 신청
09-13  ❌ 1차 반려 — 테스터가 12명 아래로 떨어져 시계 리셋
09-13~27  2차 비공개 테스트 (20명 이상으로 늘림)
09-27  2차 신청 (신청서 여섯 칸 작성)
09-30  ❌ 2차 반려 (친구가 알림)
09-30  ✅ D-U-N-S 번호 발급 (D&B 메일)
```

2차 반려 메일(Google Play Console팀, 원문 그대로):

> **Google Play 프로덕션에 액세스하려면 추가 테스트 필요**
> 신청을 검토한 결과, 프로덕션에 액세스하려면 앱에 추가 테스트가 필요한 것으로 확인되었습니다.
> 프로덕션 액세스 권한이 부여되지 않는 이유는 다음과 같습니다.
> - 비공개 테스트 중에 테스터가 앱에 참여하지 않았습니다.
> - 앱 업데이트를 통해 사용자 의견을 수집하고 조치를 취하는 등의 테스트 권장사항을 따르지 않았습니다.
>
> 다시 신청하기 전에 실제 테스터를 대상으로 14일간 비공개 테스트를 진행하여 앱을 테스트하세요.

## 2. 전제와 범위

- **본 것:** 2차 반려 메일(위) · 친구가 보낸 Play Console 통계(설치한 사용자 수, 9/2~9/23) · `store/closed-test.md` · `store/README.md` 단체 계정 절 ·
  `android-app/` 의 판 번호 · 구글 공식 도움말 넷(아래 출처) · 반려 사례를 모은 글 셋.
- **안 본 것:** Play Console 안의 테스터 참여 지표(하루 몇 명이 스토어 앱을 열었나). 그래서 **「왜 참여가 없다고 봤나」(3-3)는 여전히 추정**이다.
- **환경:** 구글 개인 개발자 계정(2023-11-13 이후 가입 → 12명·14일 요건 대상). 앱 패키지 `kr.onlybible.gocheok.memorize`.

## 3. 분석

### 3-1. 인원 문제는 이번엔 아니다

통계 그래프(설치한 사용자 수, 일별): 9/11 까지 10~14명 → **9/12 에 22명으로 뛰고 9/13~9/23 내내 21~27명**.
요건 12명의 두 배 가까이를 유지했다. 1차 반려(인원 이탈)와는 다른 이유로 떨어진 것이다.

⚠ 그래프의 「설치한 사용자」와 요건의 「참여를 선택한 테스터」는 다른 값이다(`store/closed-test.md` 에 적혀 있다). 다만 설치 21명이면 옵트인이 12명 아래일 가능성은 낮다.

### 3-2. 사유 ② — 앱 판이 한 번도 안 바뀌었다 (반려 메일로 확인)

```
android-app/app/build.gradle:88   versionCode 1
android-app/twa-manifest.json:24  "appVersionCode": 1
```

8/26 에 올린 판이 지금까지 **유일한 판**이다. 게다가 위젯 작업 때 「9/27 승인 전에는 Play Console 에 아무것도 올리지 않는다(시계를 건드리지 않으려고)」로 **일부러 업데이트를 막았다**.

구글 공식 도움말은 이렇게 권한다:

> "Continue running closed tests while resolving user-reported issues and bugs. **Updating your app in closed testing** before releasing to production helps minimize low ratings and negative reviews."

반려 사례를 모은 글들은 공통으로 「14일 동안 판 번호가 그대로면 형식만 채운 테스트로 본다」고 적는다(출처 5~7 · 공식 문서는 아니다).

★ **우리 앱에서 이 문제가 구조적인 이유:** 스토어 앱은 웹앱을 감싼 얇은 껍데기(TWA)다. 테스트 기간에 실제로 고친 것 —
웹폰트 CSS 765KB 로 첫 실행이 느리던 것, 안드로이드 한글 조합 오판정 — 은 **모두 웹으로 나갔다.**
신청서 ④칸(「테스트로 고친 것」)에 이 셋을 적었지만, 구글이 볼 수 있는 앱 묶음(.aab)에는 **아무 변화도 없다.** 적은 말과 보이는 증거가 어긋난다.

### 3-3. 사유 ① — 「테스터가 앱에 참여하지 않았다」 (반려 메일로 확인 · 까닭은 추정)

공식 도움말도 반려 사유로 「12명 미만」과 함께 **「테스트 기간의 참여 부족(insufficient tester engagement)」**을 든다.
설치는 21~27명이었는데도 이 사유가 붙었다 — 구글은 「깔았나」가 아니라 **「스토어 앱으로 썼나」**를 본다.

추정되는 우리 쪽 사정: 테스터 대부분이 이미 **웹(홈 화면 추가)으로 쓰시던 성도님**이다. 스토어 앱을 깔고도 늘 누르던 홈 화면 아이콘을
계속 누르시면 기록은 서버에 똑같이 쌓이지만 **구글이 재는 「스토어 앱 사용」에는 안 잡힌다.** ⚠ 확인 안 된 추정이다(5절).

### 3-4. 선택지 비교

| | A. 개인 계정으로 3차 비공개 테스트 | B. 교회 단체 계정 만들고 앱 옮기기 |
|---|---|---|
| 요건 | 12명·14일 **+ 판 업데이트 여러 번 + 참여 증거** | **없음** — 요건 문서 제목부터 「새 **개인** 개발자 계정」용이다 |
| 걸리는 시간 | 최소 14일 + 심사 약 7일 = 3주 이상 | 단체 인증 며칠 + 앱 이전 2영업일 + 출시 심사 |
| 비용 | 없음 | 등록비 $25(1회) |
| 또 반려될 위험 | 있다 — 원인(3-2)이 TWA 구조라 그대로 남는다 | 낮다 — 대신 D&B 이름·주소를 결제 프로필과 **글자 하나까지** 맞춰야 한다 |
| 이미 정한 방향 | — | **2026-09-15 에 「새 단체 계정 + 앱 이전」으로 결정해 둠**(`store/README.md` 「구글 쪽 결정」) |

## 4. 결론

**B 로 간다 — D-U-N-S 로 교회 단체 계정을 만들고 앱을 옮긴다.** 순서:

```
① Play Console 단체 계정 만들기  (church.gocheok@gmail.com 로 로그인)
   · 계정 유형: 조직(Organization) · 등록비 $25
   · D-U-N-S: 690031840
   · 결제 프로필은 「조직」 유형으로 새로 — 이름·주소를 D&B 와 똑같이
       법적 이름  DAEHANYESUGYO JANGNOHOE GOCHEOK GYOHOE
       주소       79 Jungang-ro, Guro-gu, Seoul 08228, Republic of Korea
   · 스토어에 보이는 「개발자 이름」은 법적 이름과 달라도 된다 → 「고척교회」 등 한글로
   · 전화·이메일은 일회용 번호로 인증 — 계정이 살아 있는 동안 계속 받을 수 있어야 한다
② 구글의 단체 인증 기다리기 (며칠)
③ 옛 개인 계정에서 앱 이전 요청
   · 받는 쪽(단체 계정)의 「등록 거래 ID」가 필요 — church.gocheok@gmail.com 메일함에서
     "developer registration fee" 로 검색
   · 구글이 2영업일 안에 처리
④ 이전 끝나면 단체 계정에서 프로덕션 출시
   · 첫 출시에 위젯 판(versionCode 2)을 함께 낼지는 그때 정한다(android 위젯 계획 Task 8)
```

**그 사이에 하지 말 것:** 비공개 테스트와 테스터 명단을 **없애지 않는다.** 단체 경로가 막히면 A 로 돌아갈 발판이다(돈도 안 든다).
테스트 그룹은 어차피 이전되지 않는다(공식 도움말).

## 5. ⚠ 불확실한 것 / 확인 필요

| 항목 | 왜 불확실한가 | 확인 방법 |
|---|---|---|
| 옮긴 앱이 12명·14일 요건에서 풀리는가 | 공식 도움말 어디에도 「이전한 앱」 이야기가 없다. 요건이 개인 계정 대상이라는 것만 확실 | 이전 뒤 단체 계정 대시보드에 「프로덕션 액세스 신청」 단계가 없는지 본다 |
| 앱 서명 키가 함께 오는가 | 도움말은 「패키지 이름과 그에 딸린 키」가 옮겨진다고만 적는다 | 이전 뒤 콘솔 「앱 무결성」의 SHA-256 이 `.well-known/assetlinks.json` 첫 줄(`BE:91:31:…`)과 같은지 본다. 다르면 앱이 열릴 때 주소창이 뜬다 |
| 비공개 테스트 트랙에 올린 판(versionCode 1)이 따라오는가 | 도움말은 「테스트 그룹」이 안 옮겨진다고만 적는다 | 이전 뒤 「출시 → 앱 번들 탐색기」 |
| 조직 웹사이트를 검증하라고 하는가 | 필요 정보에 웹사이트가 있으나 검증 방법은 안 적혀 있다 | 가입 화면에서 확인. 교회 공식 사이트를 넣는 것이 자연스럽다 |
| 교회 사무실 유선 번호로 인증이 되는가 | 일회용 번호가 문자로만 오면 유선은 못 받는다 | 가입 화면에서 확인. 안 되면 여러 명이 아는 휴대폰으로 |
| 「참여 부족」 추정(3-3) | 스토어 앱으로 연 횟수를 우리 쪽에서 셀 수 없다(`PLAY_APP_KEY` 는 기기 안에만 적힌다 · `app.js:7788`) | Play Console 통계에서 「활성 사용자」를 설치 수와 나란히 본다 |

## 6. 용어

| 용어 | 뜻 |
|---|---|
| 프로덕션 액세스 | 구글 플레이에서 누구나 받을 수 있게 정식 출시할 권한. 2023-11-13 이후 가입한 **개인** 계정은 비공개 테스트(12명·14일)를 거쳐 신청해야 받는다 |
| TWA | Trusted Web Activity. 웹앱을 크롬으로 띄우는 얇은 안드로이드 껍데기. 화면·기능은 전부 웹(`gocheok.onlybible.kr`)에서 온다 |
| versionCode | 안드로이드 앱 판 번호(정수). 구글이 「업데이트했다」고 보는 기준 |
| D-U-N-S | 던앤브래드스트리트(D&B)가 단체에 주는 9자리 번호. 구글·애플이 단체 계정을 만들 때 단체가 실재하는지 확인하는 데 쓴다 |
| 결제 프로필 | 구글 결제 계정. 단체 계정은 여기에 적힌 단체 이름·주소를 D-U-N-S 기록과 대조한다 |
| 등록 거래 ID | 개발자 등록비($25)를 낸 거래 번호. 앱을 옮길 때 받는 쪽 계정을 가리키는 데 쓴다 |
| assetlinks.json | 「이 앱은 이 도메인의 주인이 만든 것」이라는 증명 파일. 앱 서명 키 지문이 들어 있고, 안 맞으면 TWA 가 주소창을 띄운다 |

## 7. 출처

1. 구글, *App testing requirements for new personal developer accounts* — https://support.google.com/googleplay/android-developer/answer/14151465 (「12명 미만 또는 참여 부족」 · 「closed testing 에서 업데이트」 권고)
2. 구글, *Required information to create a Play Console developer account* — https://support.google.com/googleplay/android-developer/answer/13628312 (단체 계정 필요 정보 · 결제 프로필 이름·주소가 D-U-N-S 와 일치해야 함 · 개발자 이름은 달라도 됨)
3. 구글, *Transfer apps to a different developer account* — https://support.google.com/googleplay/android-developer/answer/6230247 (받는 쪽 등록 거래 ID · 2영업일 · 테스트 그룹은 안 옮겨짐)
4. 구글, *Choose a developer account type* — https://support.google.com/googleplay/android-developer/answer/13634885 (단체는 D-U-N-S 필수 · 계정 유형 전환 절차는 이 문서에 없음)
5. DEV Community, *Google Play Production Access Rejected: Why & Fixes* — https://dev.to/vmzavas/google-play-production-access-rejected-why-fixes-3l5h (비공식)
6. Testers Community, *More Testing Required to Access Google Play Production* — https://www.testerscommunity.com/blog/google-play-production-access-rejected (비공식)
7. Testers Community, *Google Play Developer Account: Cost, Types, and Setup* — https://www.testerscommunity.com/blog/google-play-developer-account-guide (단체 계정은 12명·14일 면제 · 비공식)
8. Google Play Console팀 반려 메일(2026-09-30) — 사유 둘(1절에 원문)
9. D&B 발급 메일(2026-09-30) — D-U-N-S 690031840 · 법적 이름 DAEHANYESUGYO JANGNOHOE GOCHEOK GYOHOE
10. 저장소: `store/closed-test.md`(1·2차 경과) · `store/README.md` 「단체(교회 명의) 계정」 절 · `android-app/app/build.gradle:88` · `.well-known/assetlinks.json`

## 갱신 이력

- 2026-09-30 처음 씀(반려 메일 없이 추정으로)
- 2026-09-30 반려 메일 원문을 받아 사유 둘을 확인 — 추정했던 두 원인(판 업데이트 없음 · 참여 부족)이 그대로 맞았다. 결론은 그대로다
