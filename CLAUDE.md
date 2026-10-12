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
| 지나온 길 전체 · 남은 일 · 앞으로 계획(2026-09-24 정리) | `docs/backlog.md` |
| 암송·도전·복습 화면, 카드 입력, 단계 완료 창 | `docs/notes/memorize-flow.md` |
| 쉴만한 물가(시편·잠언·전도서 액자) | `docs/notes/psalm-still-waters.md` |
| 📚 네비게이토 성경암송(2026-10-13 · 문 닫힘 — 🧪·`?navi=1` · 카드 73장 2001~ · `js/navi.js` 지연) · ⚠️ 구절 번호 판정 둘(`isPsalmNo` 1001~1999 = 물가 화면 / `isNonWeeklyNo` 1000 초과 = 복습에서 뺌) · 카드 줄은 켠 채라 문은 `naviVisible` 하나 | `docs/notes/navigators.md` |
| 매일 묵상(무엇을 보여 줄지) | `docs/notes/meditation.md` |
| 가정 축복 기도문 | `docs/notes/prayer-book.md` |
| 첫 화면·묶음·색·아래 고정 단추 | `docs/notes/home-screen.md` |
| 게시판 글·답글·사진 | `docs/notes/board.md` |
| 구글 출시 심사 전 고친 것(2026-10-01) — 어린 부서 **보호자 확인** · 게시판 **이용 규칙**·**🙈 가리기** · AI **답 알리기** · 방침의 유튜브 문구 | `docs/notes/store-review.md` · 결정 근거 `자료/store/README.md` 「구글 출시 심사 전 결정」 |
| 앨범 이어 듣기·TTS | `docs/notes/album-audio.md` |
| 오늘의 찬양(하루 한 곡·앱 안 유튜브 재생) | `docs/notes/today-song.md` |
| 순위·응원·「지금 N명」 | `docs/notes/ranking-cheer.md` |
| 영어(NIV) 모드 | `docs/notes/english-niv.md` |
| 화면 캡처·안내 그림 만들기 | `docs/notes/capture-tools.md` |
| 사용 설명서·guide/·인쇄물 | `docs/notes/manual-guide.md` |
| 필사 노트 신청 | `docs/notes/pilsa-orders.md` |
| 사역신청(2027) · 시험 참여자(기간 전 첫 화면 🤝 — 교회 어드민 「🧪 시험 참여자」) | `docs/notes/ministry-2027.md` |
| 사역신청 **관리 화면**(단추·여백·구조 표준) | `docs/notes/ministry-admin-ui.md` |
| 첫 화면 「사역현황」 · 사역 이력 확인 · 정정 신청(2026-10-01 · 문은 사역신청과 하나) | `docs/notes/ministry-history-check.md` |
| 기독교 고전 소책자(2026-09-14 완료 · 다시 뽑을 때만) | `docs/notes/classics-booklet.md` |
| 성경 필사노트 가로형(`bible-note/` · 만든 HTML·원문은 커밋 금지) | `docs/notes/bible-note.md` |
| 관리자 통계 '카드' 열 | `docs/notes/stats-admin.md` |
| 설교·찬양 관리(담당자 — 설교 올리기 · 찬양 · 2026-09-30 운영) | `docs/notes/sermon-staff-upload.md` |
| 연상 그림(담당자 ③ · Gemini · DB 그림이 옛 파일보다 앞섬) | `docs/notes/verse-image-staff.md` |
| 측정(카드 쓰임·전환율·열람 기록) | `docs/notes/metrics.md` |
| 액션·테이블·시크릿 목록 | `docs/notes/backend-api.md` |
| 보안 점검(매주 자동 · 매달 손으로 — `tools/security-check.py` · 결과는 **저장소 밖** `C:\Projects\보안점검`) | `docs/notes/security-check.md` |
| 백업(`tools/backup-db.py --prod` · 운영 DB + Storage 유일본 → 7-Zip AES-256 · **저장소 밖** `C:\Projects\백업` · 자동 백업은 7일·통째 복원·Storage 없음 · **매주 금 12:00 작업 스케줄러 `gocheok-weekly-backup`**) | `docs/notes/backup.md` |
| **반영 현황 한 장**(`python tools/status.py [--dev]` — 운영 화면 판·api 파일·문(스위치)·Actions 를 origin/main 과 견준다 · 「다름」이면 종료코드 1) | `tools/status.py` 머리 |
| **SQL 적용 기록**(SQL 을 넣은 뒤 `python tools/sql-applied.py record <파일> --dev\|--prod` · `status` — 운영 표 `schema_applied`) | `docs/notes/sql-applied.md` |
| **감시의 감시**(2026-10-12 운영 — GitHub 60일 멈춤 대비: Supabase 크론 `monitor-watch` 12:00 KST → 멈추면 메일 · 흔적 `app_config` `monitorRun`/`monitorWatchRun` 이 서로를 본다) · 매일 점검에 교회 어드민 화면·함수 | `docs/notes/monitor-guard.md` |
| **화면 오류 모으기**(2026-10-12 운영 · **문 `errorLogOn` 닫힘** — 켜기 전에 개인정보 방침 세 자리를 먼저 · 표 `client_errors` 90일) | `docs/notes/client-errors.md` |
| 아이폰 앱(Swift)·「앱이면 …」 웹 코드·껍데기 판 표식 | `docs/notes/ios-app.md` |
| 교회 어드민(admin.onlybible.kr · 별도 저장소 `c:\Projects\church-admin`) — 카카오 로그인·담당자 승인, 사역신청 관리를 옮겨 가는 중 | 설계 `docs/superpowers/specs/2026-09-28-church-admin-design.md` · 그 저장소 `CLAUDE.md` |
| 이벤트 명단(사순절·썸머·소책자·가을 동행) — 교회 어드민 「성경필사(암송)」으로 옮겼다 · `eventImport`·`eventSave`·`eventSetNote` 는 얼림 | `docs/notes/bible-events-admin.md` |
| 교인명부(어드민 · 2026-09-29 운영) · 「자세히」 창 사역·성경필사 탭 · 잇기 표 | `docs/notes/people-directory.md` · church-admin `CLAUDE.md` 「교인명부」 절 |
| 사역 이력(교회 어드민 「📜 사역 이력」) — 성경암송 `ministry_orders` 에 지난 해를 넣지 말 것 | `docs/notes/ministry-history.md` |
| 사역 통계(교회 어드민 「📊 사역 통계」 · 2026-10-06) | `docs/notes/ministry-stats.md` |
| 교육신청(2026-10-05 운영 · 문 닫힘 — 🧪만) | `docs/notes/education.md` |
| 봉사 당번(2026-10-06 운영 · 문 닫힘 — 🧪만) — `duty_signups` 에 직접 쓰지 말 것 | `docs/notes/duty-roster.md` |
| 관리 기능을 교회 어드민으로 옮기기(2026-10-08 결정) | `docs/notes/admin-migration.md` · `docs/backlog.md` 4-5 |
| 안드로이드 앱(TWA)·위젯·플레이스토어(새 앱 `kr.onlybible.gocheok`) | `docs/notes/android-app.md` |
| 디자인 개편(2026-10-12 시작 · 시안 A·B·C 의견 수렴 중 — 고르기 전엔 입히지 말 것) · 「전」 사진 `자료/design/` · **먼저 넣은 것**(10-12 운영): 첫 화면 남은 수·전체 수·% 빼기 · 말씀 목록 시안 B 구조(본문 두 줄 · 거르기 칸 「진행·마침·마음에 둠·안 함」 · 힌트는 마음에 둔 구절에만) · 상태 이름 「아직 안 함 · 1단계 마침 · 다 마침」 · **첫 화면 A안 운영(2026-10-13 · 이번 주 말씀 아래 줄 목록) — 롤백 `app.js` `HOME_LAYOUT = "old"` 한 줄 + bump(깃 태그 `home-before-a-2026-10-13`)** · 한 기기만 `?home=old` · B안 미리보기 `?home=b` · `?home=off` | `docs/notes/design-refresh.md` |

## 폴더 — 참고·산출물은 `자료/` (2026-10-08)
화면이 안 쓰는 참고·산출물은 모두 `자료/` 아래다 — `marketing`·`ministry`·`store`·`psalm`·`migrate`·`booklet`(GitHub) + `education`·`newfamily`·`AppForm`·`Picture`·`당회보고`(로컬). **`자료/` 는 사이트로 안 나간다.**
- ⚠️ **화면이 부르는 파일을 `자료/` 에 두지 말 것** — localhost 에서는 열리고 운영에서만 404 가 난다. 화면용은 `img/`(그림 · `img/screenshots/` 는 manifest)·`files/`(내려받는 파일)에.
- ⚠️ 새 참고 폴더를 루트에 만들지 말고 `자료/` 아래에. 개인정보가 든 것은 `.gitignore` 에 **`자료/…` 경로로** 막는다(사이트에서 빠져도 GitHub 저장소는 공개다).
- `자료/booklet/`(소책자 생성기 · 2026-10-08 옮김)은 **코드·설정만** 올린다 — PDF·그림·만든 HTML 은 이 PC 에만 있다. 읽을 것 `docs/notes/classics-booklet.md` 끝.
- ⚠️ **사이트에는 화면이 쓰는 파일만 나간다(2026-10-08 · 808개 → 190개).** 목록은 `tools/site.py` 한 곳 — 루트의 화면 파일(html·js·css·json·그림·ics) + `js`·`img`·`music`·`files`·`guide`·`privacy`·`quiz`·`cert`·`.well-known`. `CLAUDE.md`·`docs/`·`supabase/`·`tools/`·`tests/`·`자료/booklet/`·`bible-note/`·`android-app/`·`ios-app/` 는 주소로 안 열린다(GitHub 저장소는 여전히 공개). **새 화면 폴더를 만들면 `SITE_DIRS` 에 더할 것** — `preflight` [4] 가 src·href 는 잡지만 코드가 조립하는 주소는 못 본다. `python tools/site.py` 로 무엇이 나가는지 세어 볼 수 있다.

## 스택 · 도메인
- **Vanilla JS PWA**(프레임워크 없음) — `index.html` + `app.js`(대형 단일 파일) + `sw.js`
- **GitHub Pages** 배포: repo `sewoongkim1/bible-memorize-church-app-v2`, 도메인 **gocheok.onlybible.kr**(CNAME), push→Actions 배포
- 배포 규칙: **`python tools/bump.py` 한 번**이면 `?v=` 캐시태그(app.js·style.css·js/*.js) · 스플래시 `.splash-ver` +0.001 · app.js의 `APP_BUILD`가 함께 올라간다. 손으로 고치지 말 것 — 태그 하나를 빠뜨리면 옛 파일이 브라우저에 남는다.
  - 태그는 **하나만** 셈한다(2026-10-06) — 가지를 합치다 `index.html` 이 부딪혀 한 줄만 옛 태그로 남아도 `bump.py` 를 한 번 돌리면 모두 같은 새 태그로 모인다(전에는 줄마다 따로 셈해, 같은 날에는 다시 돌려도 계속 갈려 preflight 가 배포를 막았다).
  - 판 번호는 항상 **소수점 3자리** (예 `v3.000 → v3.001`, 절대 `v3.0`/`v3.01`로 줄이지 않음). 2026-07-21 `v3.02`에서 `v3.000`으로 리셋해 3자리 체계 시작.
  - `?v=`는 브라우저 캐시만 무력화할 뿐, **파일 내용을 고르지 않는다**. 배포 직후 CDN이 옛 app.js를 내보내면 브라우저가 그 옛 내용을 새 주소 아래 캐시해 최대 10분간 옛 화면이 남는다. 그래서 app.js는 자신의 `APP_BUILD`와 index.html이 부른 `?v=`를 비교해, 다르면 `cache:"reload"`로 다시 받아 한 번만 새로고침한다(마지막 안전장치).
  - 서비스워커는 화면(HTML) 요청을 `no-store`로 넘긴다 — 옛 index.html이 남으면 그 안의 태그도 옛것이라 통째로 옛 화면이 되기 때문.

## 백엔드 (Supabase 통합 프로젝트 `xnomlgydifiqiybervtf`)
성경암송·찬양·말씀 3앱이 공유하는 프로젝트. 이 앱은 Edge Function **`api`** 사용.
- 배포: `python tools/deploy-fn.py api --prod`(속은 `supabase functions deploy api --no-verify-jwt --project-ref xnomlgydifiqiybervtf` — 직접 부르지 말 것 · 아래 「백엔드를 고쳤을 때」)
- **액션·테이블·시크릿 목록은 `docs/notes/backend-api.md`** — 원본은 `supabase/functions/api/index.ts` 의 `switch` 와 `supabase/schema.sql` 이다. 적어 둔 목록은 금세 낡으니 **다르면 코드가 맞다.**
- ⚠️ **순위·`mydays` 는 `challenge_log` 가 아니라 집계표 `daily_activity` 를 읽는다**(`daily-activity.sql` · 2,903ms → 516ms). 로그에 넣고 지우는 것은 트리거가 맞춰 주지만, **집계를 안 거치는 질의를 새로 짜면 숫자가 조용히 갈린다.** `monitor` 가 매일 `v2_activity_drift()` 로 대조한다.
- ⚠️ **크론 여섯(아침 알림 넷 · 주일 말씀 · 주간 리포트)은 2026-10-12 부터 단계로 Vault 내부 키로 옮긴다**(`supabase/push_report_cron.sql` · api `INTERNAL_CRON_OK` · `cronOnly` — 내부 키 길은 본문을 크론의 꼴로 다시 만든다). **옛 크론 SQL 넷은 되살리지 말 것**(관리자 암호가 크론 명령에 다시 들어간다). 읽을 것 `docs/notes/backend-api.md`

## 주요 기능
- **로그인(식별자 방식, 비번 없음):** 교구→교구·목장·이름 / 교회학교→부서·학년·이름. `users.identity_key`로 식별, 서버 기록 동기화
- **3단계 암송:** 보기 → 듣기(TTS) → 암송(1단계 25%·2단계 65%·3단계 전체 빈칸). 완료 시 이전/다시암송/다음
- **복습(간격반복):** 3단계 완료 구절을 주 단위로 다시 암송(reviews) — 2026-10-11 첫 화면 단추는 뺐다(코드는 남김). 읽을 것 `docs/notes/home-screen.md` 끝
- **주간 구절:** verses의 date 기준 이번 주 구절 배지
- **랭킹:** 말씀 도전 순위(ranking), 내 순위 바
- **푸시 알림:** Web Push(VAPID), pg_cron daily-push(20~23 UTC=아침) 발송, admin에서 testPush/sendPush
- **주간 리포트 메일:** Resend로 **매주 금요일 오전 8시**(cron job 7), 전주 금~이번주 목 범위. 신규참여자·주간참여자·누적참여자·주간활동 KPI + 주차별 그래프
- **딥링크:** `gocheok.onlybible.kr/?v=구절번호` → 로그인 없이 해당 구절 암송화면(startTest) 바로 진입 (말씀 아카이브 sermon.onlybible.kr에서 연동). `&lang=en`이면 영어(NIV) 모드로 진입
- **그 밖의 기능**(암송·도전 화면 · 앨범 이어 듣기 · 순위·응원 · 캡처 도구 · 게시판·🚩 신고 · 영어(NIV) · 오늘의 찬양 · 쉴만한 물가 · 축복 기도문 · 첫 화면)은 맨 위 표에서 문서를 찾아 **손대기 전에 읽는다.** 이 절에 있던 사연·⚠️ 는 2026-10-12 에 각 문서 끝 「CLAUDE.md 에서 옮김」 절로 옮겼다.

## 관리자 (통합 허브)
`gocheok.onlybible.kr/admin.html` = 허브(비번1개→authCheck→도구 버튼, sessionStorage `admin-pw` 공유):
⚠️ **관리 기능은 모두 교회 어드민(admin.onlybible.kr)으로 옮기고, 앱(이 저장소)에서는 관리 기능을 모두 뺀다(2026-10-08 친구 결정 · 추후 작업).** 그래서 **이 관리자 화면들에 새 기능을 더하지 말 것** — 새 관리 기능은 교회 어드민에 만든다. 옮길 목록·차례는 `docs/backlog.md` 4-5.
- `admin-stats.html` — 성경암송 통계·알림발송·주간리포트·게시판
- `admin-praise.html` — 찬양 아카이브 관리(praise-config.js/praise-api.js)
  ⚠ 한글 이름은 **완성형(NFC)으로 통일**한다 — 맥에서 온 자모분리(NFD)가 섞여 찬양대가 콤보에 두 번 뜨고 48곡이 성도님 앱 필터·검색에서 빠졌다(`docs/analysis/2026-09-20-praise-choir-nfc-nfd-duplicate.md`)
- `admin-sermon.html` → **설교·찬양 관리**(`admin-stats.html?only=sermon`) — 담당자 전용 암호 + 역할 `content`. ⚠️ 담당자 암호를 관리자 암호와 같게 넣으면 담당자가 관리자가 된다. 읽을 것 `docs/notes/sermon-staff-upload.md`
- `admin-ministry.html` — **사역신청 담당자** 전용(사역 암호 + 등록 담당자). 읽을 것 `docs/notes/ministry-2027.md` 끝 절
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
   · 여러 화면에 걸친 CSS·레이아웃이면 **`python tools/screen-sweep.py`**(화면 39개 × 8조건, 개발 DB) — ⚠️ 읽을 것 `docs/notes/capture-tools.md`
   · ⚠️ **새 글자색을 `--navy`·`--gold`·`--green`·`--error` 나 `var(--white)` 로 쓰면 `.dark` 짝을 같이 둔다** — 이 토큰들은 어두운 모드에서 안 바뀌어 글씨가 바탕에 묻힌다(2026-10-12 전수 조사에서 410곳 · `docs/notes/design-refresh.md`)
3. 커밋·푸시 → Actions가 자동 배포
4. **「이번 판에만 있는 표식」으로 배포를 확인한다**(아래)

⚠️ **깨진 판은 배포되지 않는다(2026-09-12).** Actions 가 `python tools/preflight.py` 를 먼저 돌려
**문법(`node --check`)과 캐시태그(`?v=` 끼리 · `APP_BUILD` 와)**를 보고, 하나라도 걸리면 **배포 단계가 아예 안 돈다**(1.8초 — 순수 함수 검사가 붙어 늘었다).
푸시 전에 손으로도 돌릴 수 있다. 검사를 더 세우려면 그 파일에 더한다 — **준비물이 필요한 검사는 넣지 말 것**
(`tests/*.cjs` 는 npm 꾸러미가 있어야 해서 못 넣었다).
**푸시 전에도 저절로 돈다(2026-10-12)** — `.githooks/pre-push` 가 main 으로 가는 푸시마다 preflight 를 돌려, 걸리면 푸시를 멈춘다(깨진 판이 main 에 올라 **모든 세션의 배포가 막히는 것**을 그 앞에서 막는다). 체크아웃마다 한 번 `git config core.hooksPath .githooks` (이 PC 의 공유 체크아웃은 켜 둠).
**위 1~4 차례는 스킬 `release` 로** — bump → preflight → 경로 지정 커밋 → 푸시 → Actions 대기 → 이번 판 표식 확인(`.claude/skills/release/SKILL.md`).

### 백엔드(Edge Function)를 고쳤을 때 — **개발 먼저**
```bash
python tools/deploy-fn.py api --dev [--allow-ahead]   # 1) 개발
# localhost에서 확인한 뒤
python tools/deploy-fn.py api --prod                  # 2) 운영 — origin/main 과 같은 판만 올라간다
```
⚠️ **`supabase functions deploy` 를 직접 부르지 말고 배포 가드로(2026-10-12).** 작업 트리를 통째로 올리므로 남의 커밋 안 된 코드가 실려 나가거나, 낡은 체크아웃이면 남의 액션이 조용히 빠진다 — 가드가 둘 다 막고 빠지는 액션 이름을 찍는다. 읽을 것 `docs/notes/backend-api.md` 「배포 가드」

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
> 항목마다 한두 줄만 둔다 — 상세·⚠️ 함정·지난 기록은 링크한 문서 끝 「CLAUDE.md 에서 옮김」 절에 있다(2026-10-12). 끝난 항목은 그 문서로 옮기고 여기서 뺀다.
> ⚠️ **`api`·`supabase/member_merge.sql` 을 운영에 낼 때는 origin/main 을 합친 트리에서만.** 낡은 체크아웃이면 봉사 당번·교육·가을 동행 액션이 조용히 빠진다(확인 스모크는 각 문서에).

- [ ] 📚 **네비게이토 성경암송 — 2026-10-13 운영(문 닫힘 · 🧪 시험 참여자 · `?navi=1` 만).** 다음: 시험 참여자 실기기 확인(아이폰 앱 묶음 목록 위쪽 · 안드로이드 · 큰 글씨 · 어두운 모드) → 네비게이토 이름 허락(02-336-3387)·카드 실물 대조 → 여는 날 차례(`FEATURES` · `FEAT_SINCE` · 설명서 · `naviPublic`). 읽을 것 `docs/notes/navigators.md` 「여는 날」
- [ ] 🎨 **디자인 개편 — 시안 A·B·C 의견 수렴 중(친구 · 2026-10-12).** 첫 화면·말씀 목록·암송·도전·앨범 다섯 줄. 고르면 4단계(부품 표) → 5단계(색 이름 붙이기 · 겉모습 그대로). 시안과 별개로 고칠 것 둘(목록 긴 구절 🔊 밀림 · 어두운 모드 첫 화면 이름 안 보임)은 친구 결정 대기. 읽을 것 `docs/notes/design-refresh.md`
- [ ] 🏛️ **관리 기능을 모두 교회 어드민으로 · 앱에서는 관리 기능을 뺀다**(2026-10-08 친구 결정 · 추후). 옮긴 것: 이벤트 명단 · 사역신청 다섯 메뉴(갈아타기만 남음) · 성도 계정. ⚠️ 그때까지 관리자 화면에 새 기능 금지. 읽을 것 `docs/notes/admin-migration.md` · `docs/backlog.md` 4-5
- [ ] 🔑 **크론 여섯 관리자 암호 걷기** — ✅ api 운영 반영 · 관문 통과(10/13 00:3x — 내부 키 길 리포트 누적 255 = 암호 길 · 머리 없음/틀린 키 unauthorized) · ✅ **1단계 daily-push-5 적용(10/13 00:4x · jobid 8 · 나머지 다섯은 옛 명령)** → ⏰ **10/13 05:01 뒤 ③ 확인**(그 실행이 new_cmd · push_log daily 한 줄 total 0) → 6 · 7 · 8 · 리포트(10/13 낮 · 정각 앞뒤 5분 피함) → 주일 말씀(10/18 08:05 뒤) → 10/25 확인 → 실행 기록 가리기 → `ADMIN_SECRET` 교체(친구). 사본은 이름 박은 바꾸기로(v_url · v_only · v_apply 세 줄만 — diff 로 확인). 차례 · 확인 질의는 `supabase/push_report_cron.sql` 머리. ✅ 신고 숨기기 · 저녁 알림의 안쪽 부름은 10/13 고쳤다(`docs/notes/backend-api.md` 머리)
- [ ] 🔐 **보안 점검 뒤 남은 것(2026-10-08)** — 로그인 횟수 제한 켜기(⏸ 플레이 심사·방침 뒤) · 교회 생활 확인 번호(스위치 off · 켜기 전에 church-admin Plan 4 운영 반영) · `user_id` 액션 51개 · 검토 113건. 읽을 것 `docs/notes/security-check.md` 끝
- [ ] 🙋 **봉사 당번 — 1·2·3단계 운영(2026-10-07) · 문 닫힘(🧪만).** 다음: 역할 주기·시험 한 바퀴 → 4단계 공개(플레이 심사 뒤 · 그 앞에 시험 당번 줄을 「빼기」). ⏰ 공휴일 표는 2028-12 까지 — 2027-06 말 대조 · 2029년 줄은 2027년 안에(표는 두 저장소에 같은 것). 읽을 것 `docs/notes/duty-roster.md` 끝
- [ ] 🎓 **교육신청 — 1·2·3단계 운영(2026-10-05) · 문 닫힘(🧪만).** 다음: 역할 「교육」 주기 · 공개(과제 11 · 플레이 심사 뒤) · 2단계 출석부(2027-01). 읽을 것 `docs/notes/education.md` 끝
- [ ] 🍂 **가을 말씀암송 동행 — 2026-10-10 열림**(`open` · 측정 10/11~12/5 **8주 중 5주** · 하루 3번 · 신청 없는 「자동 대상」 · 시험 회차·기준선·방침은 10/10 에 끝 — 운영 확인 2026-10-12). 남은 것: 10/18 주보(문구 `자료/marketing/autumn-2026/문구.md` §0) · 전체 알림은 나중 · ⏰ 12/5 뒤 명단 공개(방식 미정)·`index.html` OG 셋 되돌리기. ⚠️ 3↔5 는 열린 뒤라 바꾸지 않는다(가드). 읽을 것 `docs/notes/bible-events-admin.md` 끝 · 메모리 autumn-event-2026
- [ ] 🗂️ **사역현황 · 사역 이력 확인 · 정정 신청 — 2026-10-01 운영**(문은 사역신청과 하나 — 지금 🧪만 · 12/13~12/27 모두). 다음: 시험 참여자 실기기 확인. 읽을 것 `docs/notes/ministry-history-check.md` 끝
- [ ] 👥 **교인명부 — 2026-09-29 운영.** 다음: 역할 주기 · dimode 사진 주소 알리기 · `prod.env` 정리 결정 · 12월 명단 전 「나중」 목록. ⚠️ 진짜 명단은 저장소 밖에만. 읽을 것 `docs/notes/people-directory.md`
- [ ] 🏛️ **교회 어드민 사역신청 — 다섯 메뉴 운영(2026-09-29) · 다음은 갈아타기.** ⚠️ 옮기는 동안 옛 사역 화면·`api` 담당자용 사역 액션 7개는 얼린다. 읽을 것 `docs/notes/ministry-2027.md` 끝
- [ ] **사역신청(2027) — 담당자 데이터 확정 대기(개발 착수 전).** 읽을 것 `docs/notes/ministry-2027.md` 끝
- [ ] 📱 **아이폰 1.1.1 — 껍데기 판 표식(Mac 컴파일 미확인).** TestFlight 로 받아 설정 맨 아래 「📱 아이폰 앱 1.1.1 (빌드 N)」 확인. 위젯 함정(작게 다시 넣지 말 것 · `weeklyVerseKst` 금지)은 `docs/notes/ios-app.md` 끝
- [ ] 🤖 **안드로이드 · 플레이스토어 — 새 앱 `kr.onlybible.gocheok` 2026-10-09 출시.** 남은 것: 새 앱 안내 · 옛 앱 삭제 여부 · 해외 나라 · 위젯 비행기 모드 · 업로드 키 재설정(급하지 않음). ⚠️ `assetlinks.json` 의 옛 패키지 줄을 지우지 말 것 · 서명 키 커밋 금지. 읽을 것 `docs/notes/android-app.md`
- [ ] ⏰ **쉴만한 물가 — 2026-09-12 개시.** 남은 것: 실기기 확인 · 전환율(기준일 2026-10-07) · 본문이 다 들어온 뒤 셋. 읽을 것 `docs/notes/psalm-still-waters.md` 끝
- [ ] **축복 기도문 — 주제 그룹 본문 갈아 끼우기만 남음**(성도님께는 이미 열림). 읽을 것 `docs/notes/prayer-book.md` 끝
- [ ] 🎙️ **설교·찬양 담당자 — 2026-09-30 운영.** 다음: 담당자 등록 → 친구가 한 편 끝까지 → 첫 실전 → 옛 길 치우기. 읽을 것 `docs/notes/sermon-staff-upload.md` 끝
- [ ] **영어(NIV) 본문 두 곳 손보기**(`no=31`·`no=30`). 읽을 것 `docs/notes/english-niv.md` 끝
- [ ] 필사 신청 알림이 조용히 실패해도 모른다(낮은 우선순위). 읽을 것 `docs/notes/pilsa-orders.md` 끝
- [ ] ⚠️ **가입은 되는데 첫 활동이 없다** — 잴 것은 「가입 후 무활동」이 어디서 멈추는가. `challenge_funnel.sql` ④ 는 닫았다(다시 재지 말 것). 읽을 것 `docs/notes/metrics.md` 끝

## 보안 · 새어 나가는 길 (2026-08-25)
이 API는 **JWT가 없다**(`--no-verify-jwt`). 클라이언트가 준 `user_id`를 그대로 믿으므로 **남의 `user_id` 하나면 그 사람 행세가 된다**(게시판 글쓰기·진도 저장·순위 응원·필사 신청). 공개 키는 앱 코드 안에 있어 누구나 가진 것이나 같다. 그래서 `user_id`는 **어떤 응답에도, 어떤 표·뷰에도** 노출되면 안 된다.
- ⚠️ **뷰(view)는 RLS 대상이 아니다.** 만든 사람(postgres) 권한으로 실행되어 밑 테이블의 RLS를 지나간다 — `anon`·`authenticated`에게 SELECT 권한이 남아 있으면 PostgREST가 그대로 내보낸다. Supabase 표 목록의 **UNRESTRICTED 표시**가 그 뜻이다. 뷰를 만들면 **반드시** `revoke all ... from anon, authenticated` + `security_invoker = on`.
- ⚠️ **표를 새로 만들면 `enable row level security`를 그 자리에서 켠다.** `event_entries`가 그걸 빠뜨려 `user_id` 47건이 공개 키로 읽혔다.
- 2026-08-25에 막은 것: `v_ranking_all`(133행 · user_id·이름·교구·목장) · `event_entries`(47행 · user_id) · `v_verse_status`(34행 · 개인정보 없음). → `supabase/security_close_public_views.sql`
- **점검하는 법:** 공개 키로 `GET {URL}/rest/v1/{이름}?select=*&limit=1`. 행이 오면 열려 있는 것이다. 나머지 표는 모두 RLS로 막혀 있었다.
- ⚠️ **2026-09-28 부터 운영에 카카오 로그인이 켜졌다(교회 어드민).** 이제 `authenticated` = **카카오 계정만 있으면 누구나**다.
  새 표·뷰·함수·storage 정책을 **`TO authenticated` 로 열지 말 것**, revoke 는 `anon`·`authenticated` **둘 다**.
  같은 프로젝트의 다른 앱(digest.onlybible.kr · `memos` 등 다섯 표)은 그 앱 허가 명단 `legacy_app_users` 로 묶어 두었다.
  바꾼 뒤엔 `c:\Projects\church-admin\supabase\sql\check-authenticated-exposure.sql` 을 운영에서 돌려 **0행**인지 본다.

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
