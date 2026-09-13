# 고척교회 성경말씀 암송 앱 (v2 · gocheok.onlybible.kr)

고척교회 제자양육부 신앙운동팀의 **성경말씀 암송** 웹앱(로그인/회원용). v1(Google Apps Script+Sheets)을 계승해 백엔드를 **Supabase**로 전환한 2차 버전이며 **현재 운영 중**. v1 저장소(bible-memorize-church-app)는 이 앱으로 가는 **리다이렉트 껍데기**.

> ⚠️ **회원(로그인) 앱 수정은 이 v2 저장소만** 한다. (익명 앱은 요청 시에만)

## 어디에 무엇이 적혀 있나 (2026-09-12 — 두 겹으로 나눴다)

이 문서는 **지도**다. 매 세션이 통째로 읽으므로 짧게 둔다 — 기능별 상세 기록과 ⚠️ 함정은
`docs/notes/` 에 **한 글자도 안 버리고** 옮겼다(옮긴 커밋을 보면 원본이 그대로 있다).
⚠️ **그 자리를 손대기 전에 해당 문서를 먼저 읽는다.** 여기 한 줄 요약만 보고 고치면,
그 문서에 적힌 「한 번씩 사고를 낸 자리」를 그대로 다시 밟는다.

⚠️ **새로 적을 때도 두 겹으로.** 기능을 만들거나 함정을 발견하면 **자세한 것은 `docs/notes/` 에** 적고,
여기에는 **한 줄 + 「손대기 전에 읽을 것」 링크**만 더한다. 이 문서에 사연을 쌓으면 매 세션이 그만큼
더 읽게 되고, 정작 중요한 ⚠️ 가 묻힌다(2026-09-12에 5만 자까지 불어나 한 번 나눴다).

| 무엇을 손댈 때 | 읽을 것 |
|---|---|
| 암송·도전·복습 화면, 카드 입력, 단계 완료 창 | `docs/notes/memorize-flow.md` |
| 쉴만한 물가(시편·잠언·전도서 액자) | `docs/notes/psalm-still-waters.md` |
| 매일 묵상(무엇을 보여 줄지) | `docs/notes/meditation.md` |
| 가정 축복 기도문 | `docs/notes/prayer-book.md` |
| 첫 화면·묶음·색·아래 고정 단추 | `docs/notes/home-screen.md` |
| 게시판 글·답글·사진 | `docs/notes/board.md` |
| 앨범 이어 듣기·TTS | `docs/notes/album-audio.md` |
| 순위·응원·「지금 N명」 | `docs/notes/ranking-cheer.md` |
| 영어(NIV) 모드 | `docs/notes/english-niv.md` |
| 화면 캡처·안내 그림 만들기 | `docs/notes/capture-tools.md` |
| 사용 설명서·guide/·인쇄물 | `docs/notes/manual-guide.md` |
| 필사 노트 신청 | `docs/notes/pilsa-orders.md` |
| 사역신청(2027) | `docs/notes/ministry-2027.md` |
| 기독교 고전 소책자 | `docs/notes/classics-booklet.md` |
| 관리자 통계 '카드' 열 | `docs/notes/stats-admin.md` |
| 측정(카드 쓰임·전환율) | `docs/notes/metrics.md` |
| 액션·테이블·시크릿 목록 | `docs/notes/backend-api.md` |

## 스택 · 도메인
- **Vanilla JS PWA**(프레임워크 없음) — `index.html` + `app.js`(대형 단일 파일) + `sw.js`
- **GitHub Pages** 배포: repo `sewoongkim1/bible-memorize-church-app-v2`, 도메인 **gocheok.onlybible.kr**(CNAME), push→Actions 배포
- 배포 규칙: **`python tools/bump.py` 한 번**이면 `?v=` 캐시태그(app.js·style.css·js/*.js) · 스플래시 `.splash-ver` +0.001 · app.js의 `APP_BUILD`가 함께 올라간다. 손으로 고치지 말 것 — 태그 하나를 빠뜨리면 옛 파일이 브라우저에 남는다.
  - 판 번호는 항상 **소수점 3자리** (예 `v3.000 → v3.001`, 절대 `v3.0`/`v3.01`로 줄이지 않음). 2026-07-21 `v3.02`에서 `v3.000`으로 리셋해 3자리 체계 시작.
  - `?v=`는 브라우저 캐시만 무력화할 뿐, **파일 내용을 고르지 않는다**. 배포 직후 CDN이 옛 app.js를 내보내면 브라우저가 그 옛 내용을 새 주소 아래 캐시해 최대 10분간 옛 화면이 남는다. 그래서 app.js는 자신의 `APP_BUILD`와 index.html이 부른 `?v=`를 비교해, 다르면 `cache:"reload"`로 다시 받아 한 번만 새로고침한다(마지막 안전장치).
  - 서비스워커는 화면(HTML) 요청을 `no-store`로 넘긴다 — 옛 index.html이 남으면 그 안의 태그도 옛것이라 통째로 옛 화면이 되기 때문.

## 백엔드 (Supabase 통합 프로젝트 `xnomlgydifiqiybervtf`)
성경암송·찬양·말씀 3앱이 공유하는 프로젝트. 이 앱은 Edge Function **`api`** 사용.
- 배포: `supabase functions deploy api --no-verify-jwt --project-ref xnomlgydifiqiybervtf`
- **액션·테이블·시크릿 목록은 `docs/notes/backend-api.md`** — 원본은 `supabase/functions/api/index.ts` 의 `switch` 와 `supabase/schema.sql` 이다. 적어 둔 목록은 금세 낡으니 **다르면 코드가 맞다.**
- ⚠️ **순위·`mydays` 는 `challenge_log` 가 아니라 집계표 `daily_activity` 를 읽는다**(`daily-activity.sql` · 2,903ms → 516ms). 로그에 넣고 지우는 것은 트리거가 맞춰 주지만, **집계를 안 거치는 질의를 새로 짜면 숫자가 조용히 갈린다.** `monitor` 가 매일 `v2_activity_drift()` 로 대조한다.

## 주요 기능
- **로그인(식별자 방식, 비번 없음):** 교구→교구·목장·이름 / 교회학교→부서·학년·이름. `users.identity_key`로 식별, 서버 기록 동기화
- **3단계 암송:** 보기 → 듣기(TTS) → 암송(1단계 25%·2단계 65%·3단계 전체 빈칸). 완료 시 이전/다시암송/다음
- **복습(간격반복):** 3단계 완료 구절을 주 단위로 다시 암송(reviews)
- **주간 구절:** verses의 date 기준 이번 주 구절 배지
- **랭킹:** 말씀 도전 순위(ranking), 내 순위 바
- **푸시 알림:** Web Push(VAPID), pg_cron daily-push(20~23 UTC=아침) 발송, admin에서 testPush/sendPush
- **주간 리포트 메일:** Resend로 **매주 금요일 오전 8시**(cron job 7), 전주 금~이번주 목 범위. 신규참여자·주간참여자·누적참여자·주간활동 KPI + 주차별 그래프
- **암송·도전 화면(2026-08~09)** — 힌트 뒤 다시 암송 · 도전에도 카드 · 카드 모드 유지 · 단계 완료 창 · 첫 구절 이정표 · 어려운 도전 · 복습을 `review-` 로. ⚠️ **이 화면들을 손대기 전에 `docs/notes/memorize-flow.md`** — `challenge_log.mode` CHECK 제약, 공용 `setupChallengeTyping`(4곳), `norm` 이 전역이 아닌 것 등 한 번씩 사고를 낸 자리가 모여 있다.

- **말씀 앨범 이어 듣기(2026-08-21)** — 완료 구절을 귀로 듣는다(보이는 순서 = 재생 목록, 3분요약 MP3, 화면 깨우기). ⚠️ 손대기 전에 `docs/notes/album-audio.md` — `speechSynthesis.cancel()` 이 옛 콜백을 부르는 문제(`_ttsGen`)와 낭독 순서 규칙이 있다.

- **순위 응원 · 지금 함께 암송 중(2026-08-15·22)** — 👏 하루 한 번, 최근 10분 활동 표시. ⚠️ 손대기 전에 `docs/notes/ranking-cheer.md` — **응답에 `user_id` 를 실으면 안 되는 이유**와 대칭 검사 규칙이 있다.

- **안내 그림 · 화면 캡처 도구(2026-08-25·28)** — `tools/demo-anim.py`(움직이는 그림) · `img/verse/*.webp`(말씀 연상 그림). ⚠️ **화면을 찍거나 재기 전에 `docs/notes/capture-tools.md`** — `?go=` 에 `+ < # % 백틱`을 쓰면 조용히 깨지고, 가상 시간은 CSS 트랜지션을 안 돌리며, 스크롤한 뒤엔 `position:fixed` 가 안 찍힌다.

- **게시판(응원·기도·공감) · 사진(2026-08-15~25)** — 글 하나에 사진 4장까지, 공감 이모지. ⚠️ 손대기 전에 `docs/notes/board.md` — 사진은 **크기부터** 볼 것(1MB 넘으면 폰에서 업로드가 끊긴다)·EXIF GPS·`user_id` 미노출·목록은 사진을 `photos`(주소)로 내보낸다.

- **딥링크:** `gocheok.onlybible.kr/?v=구절번호` → 로그인 없이 해당 구절 암송화면(startTest) 바로 진입 (말씀 아카이브 sermon.onlybible.kr에서 연동). `&lang=en`이면 영어(NIV) 모드로 진입
- **영어(NIV) 암송 모드(2026-07-22)** — `text_en` 이 있는 구절만 한/EN 토글. ⚠️ 손대기 전에 `docs/notes/english-niv.md` — 진도는 **언어별로 따로** 세고(복습·순위는 언어 무관), 영문은 Lora 로 한 단계 크게 쓴다.

- **쉴만한 물가(2026-09-12 개시)** — 시편·잠언·전도서 180편을 하루 한 편씩 액자로(`js/psalm.js`). 이름은 시편 23편 2절에서. ⚠️ 손대기 전에 `docs/notes/psalm-still-waters.md` — 번호(`no`) 재배정 금지·잠금은 「안 열린 것을 안 내려보내는 것」·게이트·시드 순서·「외운다」를 쓰지 않는 문구 규칙이 있다.

- **가정 축복 기도문(2026-09-03)** — 104편을 「오늘 한 편 + 주제로 찾기」 한 화면에. 로그인 이름이 그대로 들어간다. ⚠️ 손대기 전에 `docs/notes/prayer-book.md` — 조사 **ㄹ 받침** 함정, 액자 잎가지 폭(`--lw`)·금색 글씨 대비, 어두운 모드 수채화 처리.

- **첫 화면 · 아래 고정 단추(2026-09-02·04)** — 누를 것 24개를 「오늘 할 일 하나 + 묶음」으로 줄였다(1750px → 1180px). ⚠️ 손대기 전에 `docs/notes/home-screen.md` — **색은 네 단계뿐**(새 단추에 제 색을 주지 말 것), NEW 배지는 `FEAT_SINCE` 날짜로, 고정 단추 여백은 단추 높이를 따라간다.

## 관리자 (통합 허브)
`gocheok.onlybible.kr/admin.html` = 허브(비번1개→authCheck→도구 버튼, sessionStorage `admin-pw` 공유):
- `admin-stats.html` — 성경암송 통계·알림발송·주간리포트·게시판
- `admin-praise.html` — 찬양 아카이브 관리(praise-config.js/praise-api.js)
- `admin-sermon.html` — 말씀 아카이브 관리(sermon 함수)
- 확장: admin.html의 `TOOLS` 배열에 한 줄 추가

## 모니터링
`.github/workflows/monitor.yml` — 매일 07:12 KST monitor 액션 점검, 문제 시 텔레그램 경보. weekly_test/diag_send/force_alert 수동 실행 입력 있음. push_log 기록.

## 첫 실행 속도 (2026-08-27)
⚠️ **글꼴 CSS는 절대 `rel="stylesheet"`로 두지 말 것.** 한글 웹폰트 넷을 부르면 구글이 돌려주는 CSS 하나가 **765KB**다(app.js 523KB + style.css 273KB보다 크다 — 한글은 조각이 597개, `@font-face`가 1,107개라 그렇다). 그걸 그대로 두면 **다 받을 때까지 스플래시조차 안 뜬다** — 처음 설치한 분이 느린 통신에서 흰 화면만 본다(테스터 제보로 발견).
→ `media="print" onload="this.media='all'"` 로 받아 두었다가 나중에 적용한다. `display=swap`이라 그전까지는 기기 기본 글꼴로 보이고 준비되면 바뀐다. `<noscript>` 폴백을 함께 둔다. `fonts.gstatic.com` **preconnect**도 필요하다(폰트 파일은 거기서 온다).
→ 쓰지 않는 굵기는 뺀다(`font-weight:300`은 한 곳도 안 써서 뺐다 · 765→672KB).
→ **서버는 범인이 아니었다** — `getVerses`는 0.22~0.36초이고 인트로 슬라이드와 병렬로 돈다. 느리다는 제보가 오면 **글꼴부터** 볼 것.

## 개발 · 배포 체크리스트

### 어디를 보고 있나 (2026-08-27 분리)
`js/config.js`가 **주소를 보고 저절로 고른다.** 사람이 손으로 바꾸지 않는다.

| 주소 | Supabase | |
|---|---|---|
| `gocheok.onlybible.kr` | `xnomlgydifiqiybervtf` | 운영 — 성도님 기록 |
| **그 밖의 모든 주소** | `ktpwthwqzgcqcrmsafdo` | 개발 — 비어 있음 |

localhost·미리보기·브랜치·github.io는 전부 개발이다. 개발일 때는 화면 오른쪽 위에 **「개발 DB」 띠**가 뜬다 — 그게 안 보이면 운영을 보고 있는 것이다. 관리자 화면(`admin.html`·`admin-stats.html`)도 같은 규칙을 따른다. 자세한 것은 `supabase/dev-setup.md`.

### 프론트를 고쳤을 때
1. 고친다 → `python -m http.server`로 **localhost에서 확인**(자동으로 개발 DB를 본다)
2. **`python tools/bump.py`** — 캐시태그·판 번호·APP_BUILD 일괄. 손으로 고치지 말 것
3. 커밋·푸시 → Actions가 자동 배포
4. **「이번 판에만 있는 표식」으로 배포를 확인한다**(아래)

⚠️ **깨진 판은 배포되지 않는다(2026-09-12).** Actions 가 `python tools/preflight.py` 를 먼저 돌려
**문법(`node --check`)과 캐시태그(`?v=` 끼리 · `APP_BUILD` 와)**를 보고, 하나라도 걸리면 **배포 단계가 아예 안 돈다**(0.35초).
푸시 전에 손으로도 돌릴 수 있다. 검사를 더 세우려면 그 파일에 더한다 — **준비물이 필요한 검사는 넣지 말 것**
(`tests/*.cjs` 는 npm 꾸러미가 있어야 해서 못 넣었다).

### 백엔드(Edge Function)를 고쳤을 때 — **개발 먼저**
```bash
supabase functions deploy api --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo   # 1) 개발
# localhost에서 확인한 뒤
supabase functions deploy api --no-verify-jwt --project-ref xnomlgydifiqiybervtf   # 2) 운영
```

### SQL(마이그레이션)을 만들었을 때 — **개발 먼저** ⚠️
지금까지는 운영 SQL Editor에 바로 붙여 넣었다. **이제 개발에서 먼저 돌린다.**
운영 DB의 마이그레이션은 되돌릴 수 없고, 성도님 기록 위에서 실패하면 손쓸 방법이 없다.
개발에서 한 번 돌려 보는 데 드는 시간이 그 위험보다 훨씬 싸다.

### 협업(2026-08-27~)
`main`은 PR로만 들어간다(관리자는 예외 — 친구는 그대로 푸시하면 되고 `Bypassed rule violations` 줄이 함께 뜬다).
협업자는 **브랜치 → 로컬에서 개발 DB로 확인 → PR**. 친구가 보고 머지한다.

⚠️ **`bump.py`는 PR에 넣지 않는다.** 두 사람이 각자 bump하면 `index.html`·`app.js`가 매번 충돌한다.
**머지한 뒤 친구가 한 번** 돌려 푸시한다. 머지 푸시만으로는 캐시태그가 안 올라 브라우저에 옛 파일이 남는다.

### 배포 확인
**「이번 판에만 있는 표식」으로** 한다. 새로 넣은 문구·상수처럼 **이전 판에는 없던 것**을 찾거나, 지운 문구가 **사라졌는지**를 본다. 이전 판에도 있던 이름(함수명·클래스명)으로 검사하면 CDN이 옛 파일을 내보내도 그대로 통과해 「배포 완료」로 오인한다(2026-08-25에 두 번 그랬다). 가장 확실한 것은 라이브 `app.js`의 `APP_BUILD`가 `index.html`의 `?v=`와 같은지 보는 것이다.
```bash
V=$(grep -o 'app.js?v=[0-9a-z]*' index.html | head -1 | cut -d= -f2)
curl -s "https://gocheok.onlybible.kr/app.js?v=$V" | grep -o 'APP_BUILD = "[0-9a-z]*"'
```

## 다음 작업 (이어서 할 것)
> 여기에 다음에 진행할 과제를 적어두면, 다음 세션에서 이 문서를 읽고 바로 이어감.
- [ ] ⏰ **쉴만한 물가 — 2026-09-12(토) 개시했다.** 프런트·운영 DB·공개 게이트까지 끝.
      **남은 것:** ① 실기기 확인(카드·어두운 모드·「아주 큼」 글씨) ② 2주 뒤 전환율(`supabase/psalm_metrics.sql`)
      ③ 본문이 다 들어온 뒤 다시 볼 것 셋(짧은 구절의 빈 자리·큰 글씨 넘침·단추 크기)
      ⚠️ **이미 된 것과 함정**(`supabase db query --linked` 는 운영이다 · 시드 SQL 만 돌리면 켜져 있던 구절이
      꺼진다 · 게시판 목록은 사진을 `photos` 로 준다)은 `docs/notes/psalm-still-waters.md` 에 있다.

- [ ] **기독교 고전 소책자 — 인쇄 전 남은 것**(본편은 완성·커밋, PDF 도 2026-09-11에 다시 뽑았다):
      ① 찬송 열(원본이 비어 목차에서 뺐다) ② `_중철A4.pdf` 한 부 뽑아 **접어서 쪽 순서 확인**
      ③ 담당자에게 물을 표기 두 곳. 자세한 것은 `docs/notes/classics-booklet.md` 끝.
- [ ] **사역신청(2027) — 담당자 데이터 확정 대기(개발 착수 전).** 앱이 열리기 전까지는 올해도 종이로 받는다.
      기획 `docs/superpowers/specs/2026-09-06-ministry-application-design.md` · 확인 양식 `tools/ministry-form-gen.py`
      · 종이 신청서 `tools/ministry-apply-form-gen.py`
      ⚠️ 「② 언제」 칸 규칙(금요일은 평일이 아니다 · 시각은 주일만 · 주기는 한 사람이 서는 주기)과
      **직분 목록이 세 곳**이라는 것, 사슬 일곱은 `docs/notes/ministry-2027.md`.

- [ ] **축복 기도문 — 주제 그룹 검토 뒤 성도님께 열기**: ① `marketing/가정축복기도문_수정.xlsx` D열 「그룹」을 담당자가 손보면 ② `supabase/blessings.sql`·`blessings.json`을 다시 만들어 개발→운영 순으로 반영하고 ③ `renderSummary`의 「함께」 묶음에 `🙏 가정 축복 기도문` 한 줄을 더한다
- [ ] **플레이스토어 출시 — 2026-09-13 프로덕션 신청 반려됐다.** 우려했던 대로("테스터가 12명 아래로 떨어지면 시계가 다시 시작된다") 실제로 그렇게 됐다 — 구글이 "검토일(오늘 오전 4:41)부터 12명 이상 테스터로 14일 더 비공개 테스트"를 요구한다. **2026-09-27 이후**에나 다시 신청할 수 있다. ⚠️ **이번엔 14일 내내 테스터 12명 아래로 떨어지지 않게 지켜볼 것** — 한 번 더 떨어지면 또 반려되고 시계가 또 리셋된다. 신청서에 쓸 「어떻게 테스트했고 어떤 의견을 받았는지」는 `store/closed-test.md` 의 질문으로 모은다
- [ ] **업로드 키 재설정**(급하지 않다 — 옛 업로드 키가 공개됐지만 앱 서명 키는 구글이 갖고 있어 위조는 불가): `upload_certificate.pem` 은 만들어 두었다(`성경암송 - Google Play package - New` 폴더). 콘솔 → Play 스토어 보호 → 「Play 앱 서명 관리」에서 요청
- [ ] **영어(NIV) 본문 두 곳 손보기** — 34개 전부 들어갔고 검수도 마쳤는데, `no=31`(마태 10:31)이 마침표 뒤 `you`(→ `You`), `no=30`이 `2JN 1:12`(→ 다른 구절과 같은 `2 John 1:12` 꼴). 어드민에서 그 둘만
- [ ] 필사 신청 알림이 **조용히 실패해도 아무도 모른다**(낮은 우선순위): `pilsaApply`가 `pilsaNotifyAdmins`를 `try/catch`로 감싸 결과를 버리고, 담당자가 없으면(`no-admin`) `push_log`에도 안 남는다 — 이 자리를 `push_log`에 남기게 고칠 것(단, `monitor`가 실패 행을 어떻게 보는지 먼저 확인해 헛경보를 만들지 말 것)
- [x] ~~카드 모드 쓰임 · 도전 전환율~~ **2026-09-02 둘 다 쟀다** — 숫자와 ⚠️ 비교할 때의 함정은
      `docs/notes/metrics.md`. (카드가 암송의 28.5%·도전의 39.9%, 참여자 32%가 쓴다 / 전환율 누적 31.3%)

- [ ] **2026-09-09 이후** `challenge_funnel.sql` ④(새로 오신 분 코호트)를 볼 것 — 개편 뒤 이레가 지나야 뜻이 생긴다. 그때가 개편 효과를 가장 깨끗하게 보는 자리다

## 보안 · 새어 나가는 길 (2026-08-25)
이 API는 **JWT가 없다**(`--no-verify-jwt`). 클라이언트가 준 `user_id`를 그대로 믿으므로 **남의 `user_id` 하나면 그 사람 행세가 된다**(게시판 글쓰기·진도 저장·순위 응원·필사 신청). 공개 키는 앱 코드 안에 있어 누구나 가진 것이나 같다. 그래서 `user_id`는 **어떤 응답에도, 어떤 표·뷰에도** 노출되면 안 된다.
- ⚠️ **뷰(view)는 RLS 대상이 아니다.** 만든 사람(postgres) 권한으로 실행되어 밑 테이블의 RLS를 지나간다 — `anon`·`authenticated`에게 SELECT 권한이 남아 있으면 PostgREST가 그대로 내보낸다. Supabase 표 목록의 **UNRESTRICTED 표시**가 그 뜻이다. 뷰를 만들면 **반드시** `revoke all ... from anon, authenticated` + `security_invoker = on`.
- ⚠️ **표를 새로 만들면 `enable row level security`를 그 자리에서 켠다.** `event_entries`가 그걸 빠뜨려 `user_id` 47건이 공개 키로 읽혔다.
- 2026-08-25에 막은 것: `v_ranking_all`(133행 · user_id·이름·교구·목장) · `event_entries`(47행 · user_id) · `v_verse_status`(34행 · 개인정보 없음). → `supabase/security_close_public_views.sql`
- **점검하는 법:** 공개 키로 `GET {URL}/rest/v1/{이름}?select=*&limit=1`. 행이 오면 열려 있는 것이다. 나머지 표는 모두 RLS로 막혀 있었다.

## 여러 세션이 같은 저장소에서 동시에 일한다 (2026-09-10)
세 세션(시편 액자·사역신청/관리자·이벤트 플랫폼)이 **같은 체크아웃**에서 동시에 일하다 사고가 났다.

⚠️ **`git add <파일>` 도 안전하지 않다.** 남이 그 파일을 통째로 스테이징하면 내 미완성 작업이 함께 나간다. 실제로 시편 액자가 사역신청 커밋에 딸려 나가 **푸시=배포**로 성도님 첫 화면에 떴고, 운영 서버는 옛 판이라 「 에 시작해요」(날짜가 빈 채)로 보였다.
→ **공용 파일(`app.js`·`style.css`·`index.ts`·`index.html`)은 `git apply --cached` 로 내 헝크만 담는다.** 커밋 직전 `git diff --cached` 로 남의 것이 없는지 본다.
→ **미완성 기능은 처음부터 노출 게이트를 달고 시작한다**(`psalmVisible()`·`passagesVisible()`). 이 저장소는 push 가 곧 배포라 「아직 안 끝났으니 괜찮다」가 성립하지 않는다.
→ **배포는 git 이 아니라 작업 트리를 올린다.** `supabase functions deploy` 를 하면 **남의 커밋 안 된 코드도 함께 나간다.** 배포 전에 `git status` 를 본다.
→ **배포 순서는 기능마다 다르다.** 새 표에 새 액션만 얹으면 **표가 먼저**(빈 표는 아무도 안 읽는다). 이미 성도님이 쓰는 표에 칸이나 행을 더하면 **코드가 먼저**(옛 코드가 그 행을 주워 간다). 「SQL 먼저」를 규칙으로 외우면 두 번째 경우에 화면이 **오류가 아니라 숫자가 달라지는 식으로 조용히** 틀어진다.

## 저장소 협업 (2026-08-27)
`uichan8`(김의찬)을 **쓰기 협업자**로 초대했다. 함께 main은 **PR로만** 고치도록 보호를 걸었다 — 직접 푸시하면 gocheok.onlybible.kr에 곳바로 배포되는 저장소라 눈을 한 번은 거쳐야 한다. **관리자(sewoongkim1)는 그대로 푸시한다**(`enforce_admins: false`) — `python tools/bump.py` → 푸시 → 배포 흐름은 달라지지 않는다. main 강제 푸시·삭제는 둘 다 막았다.
⚠️ **main 보호는 시크릿을 지키지 못한다.** 저장소 시크릿(`ADMIN_SECRET`·`TELEGRAM_*`)은 **어느 가지의 워크플로에서든** 읽힌다 — 협업자가 새 가지에 워크플로 하나를 올리면 그만이다. 그리고 `ADMIN_SECRET`은 세 앱이 함께 쓰는 관리자 비번이다. 막으려면 시크릿을 **Environment로 옮기고 배포 브랜치를 main으로 제한**해야 한다(승인 절차 없이도 다른 가지에서는 안 읽힌다).

## 개인정보 (2026-08-24)
공개 방침은 **`privacy/`**(gocheok.onlybible.kr/privacy/) 한 곳이다 — 로그인 없이 열려야 플레이스토어 심사에 낼 수 있다. 앱 안 개인정보 화면의 「📄 전체 안내 보기」가 같은 곳을 가리키니 **문구를 고칠 때 두 곳을 함께** 본다. 삭제 요청은 이메일(sewkim00@gmail.com)·게시판·교회 사무실(02-2686-5871~3)·로비 넷. **담당자 휴대폰 번호는 싣지 않는다**(수집 로봇이 HTML 주석까지 읽는다). ⚠️ **모으는 것을 하나라도 빠뜨리면 그게 심사 반려 사유이고, 성도님께 사실이 아닌 말을 한 것이 된다** — 2026-08-24에 도움말이 「연락처는 받지 않습니다」(필사에서 받는다)·「교회 내부 시트에 저장」(v1 이야기)·「다른 시스템과 연동하지 않아요」(질문 글이 AI로 간다) 셋을 틀리게 적고 있었다.

## 참고
- 기능 명세: `보고서_기능_성경암송_v2.html`
- 형제 앱: 찬양 `c:\Projects\praise-songs`(worship.onlybible.kr), 말씀 `c:\Projects\gocheok-sermons`(sermon.onlybible.kr) — 각 CLAUDE.md 참고
- **설교 URL을 받아 반영하는 절차**: `c:\Projects\gocheok-sermons\docs\설교-url-반영-절차.md`(스킬 `reflect-sermon`도 있음) — 이 저장소 세션에서는 그쪽 CLAUDE.md가 자동으로 안 읽히므로 여기 적어 둔다
