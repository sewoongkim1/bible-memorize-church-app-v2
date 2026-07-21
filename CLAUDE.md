# 고척교회 성경말씀 암송 앱 (v2 · gocheok.onlybible.kr)

고척교회 제자양육부 신앙운동팀의 **성경말씀 암송** 웹앱(로그인/회원용). v1(Google Apps Script+Sheets)을 계승해 백엔드를 **Supabase**로 전환한 2차 버전이며 **현재 운영 중**. v1 저장소(bible-memorize-church-app)는 이 앱으로 가는 **리다이렉트 껍데기**.

> ⚠️ **회원(로그인) 앱 수정은 이 v2 저장소만** 한다. (익명 앱은 요청 시에만)

## 스택 · 도메인
- **Vanilla JS PWA**(프레임워크 없음) — `index.html` + `app.js`(대형 단일 파일) + `sw.js`
- **GitHub Pages** 배포: repo `sewoongkim1/bible-memorize-church-app-v2`, 도메인 **gocheok.onlybible.kr**(CNAME), push→Actions 배포
- 배포 규칙: `app.js`/`style.css` 바꾸면 **index.html의 `?v=` 캐시태그 갱신**, 스플래시 `.splash-ver`는 배포마다 **+0.001** (항상 **소수점 3자리** 유지: 예 `v3.000 → v3.001 → v3.002`, 절대 `v3.0`/`v3.01`로 줄이지 않음). 2026-07-21 `v3.02`에서 `v3.000`으로 리셋해 3자리 체계 시작.

## 백엔드 (Supabase 통합 프로젝트 `xnomlgydifiqiybervtf`)
성경암송·찬양·말씀 3앱이 공유하는 프로젝트. 이 앱은 Edge Function **`api`** 사용.
- 배포: `supabase functions deploy api --no-verify-jwt --project-ref xnomlgydifiqiybervtf`
- **액션:** authCheck · login · saveProgress · challenge · advanceReview · ranking · mydays · stats · participants · verses/getVerses · saveVerse · seedVerses · generateNiv(영어 NIV 본문 AI 생성, DB 저장 없이 반환만) · cleanupDummy · savePush · removePush · testPush · sendPush · monitor · weeklyReport · boardList/boardPost/boardReply/boardDeleteMine/boardModerate
- **테이블:** `users`(교구·목장·이름 등 identity_key), `verses`(주간 암송구절, url=설교영상, `text_en`/`ref_en`=영어 NIV 본문·출처), `progress`(구절별 단계), `challenge_log`(암송/도전 로그, mode=learn-*), `reviews`(간격반복 복습), `push_subscriptions`·`push_log`(Web Push), `board_posts`·`board_replies`(게시판)
- **시크릿:** ADMIN_SECRET(관리자 비번, 3앱 공통), VAPID_*(Web Push), RESEND_API_KEY·REPORT_FROM·REPORT_RECIPIENTS(주간 리포트 메일), ANTHROPIC_API_KEY(NIV 생성 등 AI 공용), TELEGRAM_*(모니터 경보)
- 통계 RPC(`stats-rpc.sql`): v2_stats·v2_participants(security definer, PII 반환→service_role만 grant)

## 주요 기능
- **로그인(식별자 방식, 비번 없음):** 교구→교구·목장·이름 / 교회학교→부서·학년·이름. `users.identity_key`로 식별, 서버 기록 동기화
- **3단계 암송:** 보기 → 듣기(TTS) → 암송(1단계 25%·2단계 65%·3단계 전체 빈칸). 완료 시 이전/다시암송/다음
- **복습(간격반복):** 3단계 완료 구절을 주 단위로 다시 암송(reviews)
- **주간 구절:** verses의 date 기준 이번 주 구절 배지
- **랭킹:** 말씀 도전 순위(ranking), 내 순위 바
- **푸시 알림:** Web Push(VAPID), pg_cron daily-push(20~23 UTC=아침) 발송, admin에서 testPush/sendPush
- **주간 리포트 메일:** Resend로 **매주 금요일 오전 8시**(cron job 7), 전주 금~이번주 목 범위. 신규참여자·주간참여자·누적참여자·주간활동 KPI + 주차별 그래프
- **게시판:** boardList/Post/Reply, 관리자 moderate
- **딥링크:** `gocheok.onlybible.kr/?v=구절번호` → 로그인 없이 해당 구절 암송화면(startTest) 바로 진입 (말씀 아카이브 sermon.onlybible.kr에서 연동). `&lang=en`이면 영어(NIV) 모드로 진입
- **영어(NIV) 암송 모드** (2026-07-22 추가): `verses.text_en`/`ref_en`이 있는 구절만 암송화면 상단에 한/EN 토글 노출. 어드민(admin-stats.html)에서 "🤖 NIV 생성" 버튼으로 AI 초안 생성 후 반드시 실제 NIV 성경과 대조·검수하여 저장. 진행 단계·복습·랭킹 기록은 언어 무관, 구절 번호(`verse.no`) 하나로 통합(표시 언어만 전환). 설정 화면에서 기본 언어 선택 가능, 목록 카드에 EN 배지 표시. TTS/STT는 en-US로 분기, 채점은 대소문자·문장부호 관용 비교. 영어 모드 화면 하단에 NIV(Biblica) 저작권 표기 고정.

## 관리자 (통합 허브)
`gocheok.onlybible.kr/admin.html` = 허브(비번1개→authCheck→도구 버튼, sessionStorage `admin-pw` 공유):
- `admin-stats.html` — 성경암송 통계·알림발송·주간리포트·게시판
- `admin-praise.html` — 찬양 아카이브 관리(praise-config.js/praise-api.js)
- `admin-sermon.html` — 말씀 아카이브 관리(sermon 함수)
- 확장: admin.html의 `TOOLS` 배열에 한 줄 추가

## 모니터링
`.github/workflows/monitor.yml` — 매일 07:12 KST monitor 액션 점검, 문제 시 텔레그램 경보. weekly_test/diag_send/force_alert 수동 실행 입력 있음. push_log 기록.

## 개발 · 배포 체크리스트
1. `app.js` 등 수정 → 2. index.html `?v=` 캐시태그 갱신 + 스플래시 `.splash-ver` +0.001(소수점 3자리) → 3. 커밋·푸시(Actions 자동 배포) → 4. 백엔드 바꿨으면 `supabase functions deploy api ...`

## 다음 작업 (이어서 할 것)
> 여기에 다음에 진행할 과제를 적어두면, 다음 세션에서 이 문서를 읽고 바로 이어감.
- [ ] 영어(NIV) 암송 모드: admin-stats.html에서 기존 구절 중 몇 개를 골라 "NIV 생성" 실행 → 실제 NIV 성경과 대조·검수 → 저장. 이후 앱에서 한/EN 토글·TTS(en-US)·STT·채점 실기기(iOS Safari·Android Chrome) 테스트.

## 참고
- 기능 명세: `보고서_기능_성경암송_v2.html`
- 형제 앱: 찬양 `c:\Projects\praise-songs`(worship.onlybible.kr), 말씀 `c:\Projects\gocheok-sermons`(sermon.onlybible.kr) — 각 CLAUDE.md 참고
