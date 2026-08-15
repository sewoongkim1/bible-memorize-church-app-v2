# 고척교회 성경말씀 암송 앱 (v2 · gocheok.onlybible.kr)

고척교회 제자양육부 신앙운동팀의 **성경말씀 암송** 웹앱(로그인/회원용). v1(Google Apps Script+Sheets)을 계승해 백엔드를 **Supabase**로 전환한 2차 버전이며 **현재 운영 중**. v1 저장소(bible-memorize-church-app)는 이 앱으로 가는 **리다이렉트 껍데기**.

> ⚠️ **회원(로그인) 앱 수정은 이 v2 저장소만** 한다. (익명 앱은 요청 시에만)

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
- **액션:** authCheck · login · saveProgress · challenge · advanceReview · ranking(응원 수·내 오늘 여부 포함) · rankCheer/rankCheerers(순위 응원 👏) · mydays · stats · participants · verses/getVerses · saveVerse · seedVerses · generateNiv(영어 NIV 본문 AI 생성, DB 저장 없이 반환만) · passageHelp/passageHelpAll(내 안에 거하는 말씀 AI 도우미, 마디당 1회 생성 후 app_config 캐시) · getPassageProgress(마디 진행 기기간 동기화) · cleanupDummy · savePush · removePush · testPush · sendPush(hour/user_id로 대상 좁힘 가능) · weeklyVersePush(매주 주일 08시 KST 전체 발송, 이번주 말씀 없으면 skip — cron: weekly_verse_push_cron.sql) · monitor · weeklyReport · boardList/boardCheck/boardPost/boardReply/boardDeleteMine/boardModerate · pilsaMine/pilsaApply/pilsaCancel(성도) · pilsaList/pilsaSetStatus(관리자, 준비완료 전환 시 해당 성도에게 Web Push 1회)
- **테이블:** `users`(교구·목장·이름 등 identity_key), `verses`(주간 암송구절, url=설교영상, `text_en`/`ref_en`=영어 NIV 본문·출처), `progress`(구절별 단계), `challenge_log`(암송/도전 로그, mode=learn-*), `reviews`(간격반복 복습), `push_subscriptions`·`push_log`(Web Push), `board_posts`·`board_replies`(게시판), `rank_cheers`(순위 응원 — 대상·보낸이·날짜가 기본키라 하루 한 번, 기간 집계는 cheer_date로), `pilsa_orders`(필사 노트 신청 — 한 건이 한 행, 최근 1건만 화면에 노출, notified_at으로 준비완료 알림 중복 방지)
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
- **순위 응원(2026-08-15):** 말씀 도전 순위 줄마다 `👏` 한 탭. **주는 쪽·받는 쪽 모두 오늘 도전 기록이 1건이라도 있어야** 한다(`hasTodayActivity` — 서버에서도 검사, 대칭). 받는 쪽 판정은 `ranking`이 이미 읽어 온 로그에서 뽑아 `activeToday`로 내려준다(추가 조회 없음) — 오늘 기록이 없는 줄은 칩이 흐려지고, 눌러도 이유를 알려 준다. **취소는 양쪽 다 검사하지 않는다**(이미 준 것을 무를 길이 막히면 안 된다). 하루 한 사람당 한 번, 다시 누르면 취소. **숫자는 조회 기간 기준·켬은 오늘 기준**(버튼이 하는 일이 「오늘 주기·취소」라 겉모습도 오늘을 따른다). **👏 칩 = 응원 주기·취소만.** 목록의 남의 줄에는 **숫자만** 보이고 누가 눌렀는지는 안 보인다 — 누가 누구를 응원했는지가 온 교회에 드러날 일은 아니다. **나를 응원한 사람 이름은 「내 순위」 바의 👏로만** 펼친다. 서버 `rankCheerers`는 대상을 아예 받지 않고 **부른 사람 본인 것만** 돌려주므로 남의 명단을 물어볼 길이 없다. 주기·취소 모두 묻지 않고 바로 반영한다(다시 누르면 되돌아간다). 열 정렬: 칩 `min-width:54px` · 횟수 `min-width:56px` 오른쪽 정렬 — 응원 수·횟수 자릿수가 달라도 열이 흔들리지 않게. 내 줄 칩은 받은 수만 보여주는 표식(자기 응원 불가). 대상은 화면에 보이는 네 조각으로 지목하고 서버가 `identity_key`로 되짚는다 — 이 API는 JWT가 없어 남의 `user_id`가 새면 그 사람 행세가 가능해지므로 절대 응답에 싣지 않는다. 순위 줄은 폰에서 한 줄을 지켜야 해서 소속을 `사랑-3`으로 줄여 쓴다(소속만 신축 칸, 모자라면 `…`).
- **게시판(응원·기도·공감):** 2026-08-15 「질문 나눔」에서 이름을 바꿨다 — 질문은 AI 「내게 주시는 말씀」이 받고, 게시판은 성도 간 격려 전용으로 성격을 옮겼다. boardList/Post/Reply, 관리자 moderate · 공감 이모지 👍🙏❤️😊🎉(`board_reactions`, boardReact/boardReactors) — 여러 개 누를 수 있고 칩을 누르면 누른 사람 이름
- **딥링크:** `gocheok.onlybible.kr/?v=구절번호` → 로그인 없이 해당 구절 암송화면(startTest) 바로 진입 (말씀 아카이브 sermon.onlybible.kr에서 연동). `&lang=en`이면 영어(NIV) 모드로 진입
- **영어(NIV) 암송 모드** (2026-07-22 추가): `verses.text_en`/`ref_en`이 있는 구절만 암송화면 상단에 한/EN 토글 노출. 어드민(admin-stats.html)에서 "🤖 NIV 생성" 버튼으로 AI 초안 생성 후 반드시 실제 NIV 성경과 대조·검수하여 저장. **진행 단계는 언어별로 따로** 센다(2026-08-12) — 한글이 3단계여도 영어로 처음 하면 1단계부터. `progress` 테이블에 `lang` 컬럼(PK: user_id·verse_no·lang, 기존 행은 모두 ko), 로컬은 `memorize-progress` / `memorize-progress-en` 두 벌, login이 `progress`(ko)·`progressEn`을 함께 내려준다. 구절에 영어 본문이 없으면 늘 ko로 본다(`verseLang`). **복습·랭킹·마음에 둠은 언어 무관** — 구절 하나로 센다(어느 언어로 마쳤든 복습 예약은 한 번). 설정 화면에서 기본 언어 선택 가능, 목록 카드에 EN 배지 표시. TTS/STT는 en-US로 분기, 채점은 대소문자·문장부호 관용 비교. 영어 본문·빈칸·정답은 **Lora**(라틴 전용 서체)로 **한 단계 크게**(23px, 글씨크기 설정 시 27/31px) — 한글 서체의 영문 글자는 획이 가늘어 눈에 안 박힌다(`.test-screen.en`). 영어 모드 화면 하단에 NIV(Biblica) 저작권 표기 고정.

## 관리자 (통합 허브)
`gocheok.onlybible.kr/admin.html` = 허브(비번1개→authCheck→도구 버튼, sessionStorage `admin-pw` 공유):
- `admin-stats.html` — 성경암송 통계·알림발송·주간리포트·게시판
- `admin-praise.html` — 찬양 아카이브 관리(praise-config.js/praise-api.js)
- `admin-sermon.html` — 말씀 아카이브 관리(sermon 함수)
- 확장: admin.html의 `TOOLS` 배열에 한 줄 추가

## 모니터링
`.github/workflows/monitor.yml` — 매일 07:12 KST monitor 액션 점검, 문제 시 텔레그램 경보. weekly_test/diag_send/force_alert 수동 실행 입력 있음. push_log 기록.

## 개발 · 배포 체크리스트
1. `app.js` 등 수정 → 2. **`python tools/bump.py`** (캐시태그·판 번호·APP_BUILD 일괄) → 3. 커밋·푸시(Actions 자동 배포) → 4. 백엔드 바꿨으면 `supabase functions deploy api ...`

## 성경필사 노트 신청 (2026-08-11)
A5/A4 · 아래쪽/오른쪽 필사형 · 번역본 5종 · 성경 31단위 부수(한 분 총 **5부**까지) · 휴대폰(필수) · 요청사항.
**A5**와 **한영·영한**은 한 부가 **2권**으로 나온다 — 상한은 고른 부수(5부) 기준이라 A5로도 5부(=10권) 신청할 수 있고, 권수·금액만 2배로 계산한다(`pilsaMult` / 서버 `pilsaMultOf`, 저장되는 `total`은 실제 권수).
상태 흐름 **신청완료 → 준비중 → 준비완료 → 배부완료** — 성도는 신청완료에서만 고치거나 취소할 수 있고, 배부완료면 새로 신청.
수령은 4층 새가족실 방문, 권당 3,000원(찾을 때 지불). **준비완료로 바꾸면 앱 알림을 켜 둔 분께 Web Push 1회**(notified_at), 켜지 않았으면 관리자 화면이 휴대폰 번호로 연락하라고 알려 준다.
- 첫화면(renderSummary)의 「✍️ 성경필사 노트 신청」 버튼으로 들어간다(응원·기도·공감 게시판과 찬양 아카이브 사이). `index.html?preview=pilsa`로도 같은 화면.
- 관리자: admin-stats.html → 신청자 카드 목록. 상태 체크박스(신청·준비·완료·배부, 기본 신청)로 추리고, 카드의 「✉️ 문자」가 담당자 폰의 문자 앱을 문구까지 채워 연다(문자 API 미연동).

## 다음 작업 (이어서 할 것)
> 여기에 다음에 진행할 과제를 적어두면, 다음 세션에서 이 문서를 읽고 바로 이어감.
- [ ] 필사 신청: 관리자 화면에서 상태 변경·준비완료 푸시 실동작 확인
- [ ] 영어(NIV) 암송 모드: admin-stats.html에서 기존 구절 중 몇 개를 골라 "NIV 생성" 실행 → 실제 NIV 성경과 대조·검수 → 저장. 이후 앱에서 한/EN 토글·TTS(en-US)·STT·채점 실기기(iOS Safari·Android Chrome) 테스트.

## 참고
- 기능 명세: `보고서_기능_성경암송_v2.html`
- 형제 앱: 찬양 `c:\Projects\praise-songs`(worship.onlybible.kr), 말씀 `c:\Projects\gocheok-sermons`(sermon.onlybible.kr) — 각 CLAUDE.md 참고
