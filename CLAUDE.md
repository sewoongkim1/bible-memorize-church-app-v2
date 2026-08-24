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
- **집계표(`daily-activity.sql`, 2026-08-15):** `daily_activity(day,user_id,mode,cnt)` — `challenge_log`에 INSERT·DELETE 트리거로 동기화(앱이 아니라 DB가 지킨다). `ranking`·`guRanking`·`mydays`가 로그 대신 이 표를 읽는다(`v2_ranking`·`v2_gu_ranking`·`v2_mydays`, 실패 시 `*Slow`로 폴백). **전체 기간 2,903ms → 516ms.** 로그 11,052행 = 집계 579행이고, 로그는 총 횟수만큼 늘지만 집계표는 참여자×활동일수만큼만 는다. `monitor`가 `v2_activity_drift()`로 매일 로그 행수 vs 집계 합계를 대조해 어긋나면 경보 — 틀어지면 백필(3번 블록)을 다시 실행하면 된다. 구절별 통계(`verseStats`·`verseCounts`)는 verse_no가 필요해 로그에 남는다.

## 주요 기능
- **로그인(식별자 방식, 비번 없음):** 교구→교구·목장·이름 / 교회학교→부서·학년·이름. `users.identity_key`로 식별, 서버 기록 동기화
- **3단계 암송:** 보기 → 듣기(TTS) → 암송(1단계 25%·2단계 65%·3단계 전체 빈칸). 완료 시 이전/다시암송/다음
- **복습(간격반복):** 3단계 완료 구절을 주 단위로 다시 암송(reviews)
- **주간 구절:** verses의 date 기준 이번 주 구절 배지
- **랭킹:** 말씀 도전 순위(ranking), 내 순위 바
- **푸시 알림:** Web Push(VAPID), pg_cron daily-push(20~23 UTC=아침) 발송, admin에서 testPush/sendPush
- **주간 리포트 메일:** Resend로 **매주 금요일 오전 8시**(cron job 7), 전주 금~이번주 목 범위. 신규참여자·주간참여자·누적참여자·주간활동 KPI + 주차별 그래프
- **힌트 뒤 다시 암송(2026-08-19):** 도전 화면에서 `💡 힌트`나 `🧠 기억법`을 한 번이라도 열고 완료하면, 완료 화면 맨 위에 「📖 이 말씀 다시 암송하기」(남색)가 뜬다 → `startTest(verse)`로 그 구절 암송 화면. **자동 계속 도전이 켜져 있어도 이때는 그 구절 암송으로 간다**(자동은 이미 아는 구절을 빠르게 도는 장치인데, 막혔다면 멈출 때다). ⚠️ **그 암송을 마치면 도전으로 돌아온다**(`relearnBackToChallenge`, v3.196) — 돌아오는 길이 없으면 「반복해서 쓰기」가 켜진 분은 같은 구절에 갇히고, 꺼진 분도 이전/다시/다음에 멈춰 도전이 영영 이어지지 않는다. 복귀 검사는 **반복해서 쓰기보다 먼저** 한다. 타이핑·음성 두 완료 경로 모두에 있고, 홈·목록·도전으로 빠져나가면 깃발을 내린다. `💡 풀이`는 뜻을 이해하는 것이지 답을 얻는 게 아니라 도움으로 세지 않는다. 플래그는 `challengeUsedHelp`, `renderChallenge`에서 매번 초기화. 복습은 자체 완료 경로(`reviewNext`)라 영향 없다.
- **말씀 앨범 이어 듣기(2026-08-21):** 앨범의 완료 구절을 귀로 듣는다. **「▶️ 전부 듣기」는 화면에 보이는 순서 그대로**(섞기·미확인이 걸린 그 목록이 곧 재생 목록 — 따로 배울 규칙을 만들지 않는다). **「☑️ 고르기」**를 켜면 카드마다 `말씀`·`📻 3분요약`을 따로 담아 말씀만·요약만·둘 다 고를 수 있다. **「📄 요약 함께」**는 전부 듣기에 요약을 끼워 넣는다(이 토글만 저장). 요약은 TTS가 아니라 **아카이브의 3분요약 MP3**(`sermons[].audio`, Azure 뉴럴 음성 — 앱 26구절 전부 보유)라 목소리가 낫고 `<audio>`라 화면이 꺼져도 잘 안 끊긴다(TTS는 아이폰에서 바로 멈춘다 — 이 차이를 재생 바에 그대로 적었다). 설교 데이터는 1MB라 **「요약 함께」·「고르기」를 켤 때만** 받는다(말씀만 듣는 「전부 듣기」는 그 없이 바로 된다). 예상 시간을 버튼에 적는다 — 전부+요약이면 한 시간이 넘어 모르고 누르면 당황한다. 재생 중 카드는 **남색 고리 + 🔊**(마음에 둠이 이미 금색이라 금색으로 겹치면 구분이 안 된다). ⚠️ `speechSynthesis.cancel()`이 브라우저에 따라 읽던 발화의 `onend`를 불러 **멈춘 뒤에도 다음 조각이 이어져 읽히고 MP3와 겹친다** — `_ttsGen` 세대 번호로 철 지난 콜백을 버린다. **말씀 목록 화면에도 「▶️ 전체 듣기」**가 있다(v3.186) — 거기서는 3분요약을 넣지 않는다(말씀을 훑는 화면이라). 재생 바 안내는 목록에 요약이 섞였을 때만 「3분요약은 이어집니다」라고 쓴다. **듣는 동안 화면이 저절로 꺼지지 않게 잡는다**(Screen Wake Lock — 안드로이드 크롬 84+·iOS 16.4+. 화면이 꺼지면 TTS가 멈추기 때문. 반드시 사용자의 탭에서 요청해야 하고, 다른 앱에 화면을 내줬다 돌아오면 풀려 있어 `visibilitychange`에서 다시 건다. 전원 버튼을 직접 누르는 것까지는 못 막는다. 재생 바 안내가 실제 상태에 따라 바뀐다). **항목 사이는 2초 쉰다**(`ALBUM_GAP_MS` — 쉼 없이 이어 붙으면 어디서 한 구절이 끝났는지 귀로 가늠이 안 되고, 떠올려 볼 틈도 없다. 예상 시간 계산에도 이 쉼이 들어간다). **낭독은 「요절 → (쉼) → 말씀」 한 가지 순서**로 통일했다(`verseSpokenText`, v3.187 — 어느 구절인지 알고 들어야 자리를 잡는다) — 앨범·말씀 목록의 🔊와 전체 듣기가 모두 같게 읽는다. 사이 마침표는 `splitForSpeech`가 문장 끝에서 끊어 큐에 넣으라는 신호(그 자리에 쉼이 생긴다). 영어 모드인데 `refEn`이 없으면 요절을 붙이지 않는다. 설계: `docs/superpowers/specs/2026-08-21-album-continuous-play-design.md`
- **지금 함께 암송 중(2026-08-22):** 순위 줄에 **최근 10분 안에 기록이 있는 분**을 초록 점·연초록 줄로 표시하고, 목록 위에 「지금 N명이 함께 암송하고 있어요」를 띄운다. **조회 기간에 오늘이 들어 있을 때만** 나온다(지난주 순위를 보며 '지금'을 말하면 뜬금없다). 집계표(`daily_activity`)에는 시각이 없어 **이때만 `challenge_log`를 본다** — 다만 10분 창이라 몇 행뿐이고 전체를 훑지 않는다(`liveNowKeys`). 폴백 경로(`rankingSlow`)는 로그를 이미 들고 있어 추가 조회 없이 센다. 돌려줄 때도 `user_id`는 싣지 않고 **신원 네 조각으로 맞춘다**(이 API는 JWT가 없어 남의 user_id가 새면 그 사람 행세가 가능하다). 시간은 `LIVE_MINUTES` 한 줄.
- **순위 응원(2026-08-15):** 말씀 도전 순위 줄마다 `👏` 한 탭. **주는 쪽·받는 쪽 모두 오늘 도전 기록이 1건이라도 있어야** 한다(`hasTodayActivity` — 서버에서도 검사, 대칭). 받는 쪽 판정은 `ranking`이 이미 읽어 온 로그에서 뽑아 `activeToday`로 내려준다(추가 조회 없음) — 오늘 기록이 없는 줄은 칩이 흐려지고, 눌러도 이유를 알려 준다. **취소는 양쪽 다 검사하지 않는다**(이미 준 것을 무를 길이 막히면 안 된다). 하루 한 사람당 한 번, 다시 누르면 취소. **숫자는 조회 기간 기준·켬은 오늘 기준**(버튼이 하는 일이 「오늘 주기·취소」라 겉모습도 오늘을 따른다). **👏 칩 = 응원 주기·취소만.** 목록의 남의 줄에는 **숫자만** 보이고 누가 눌렀는지는 안 보인다 — 누가 누구를 응원했는지가 온 교회에 드러날 일은 아니다. **나를 응원한 사람 이름은 「내 순위」 바의 👏로만** 펼친다. 서버 `rankCheerers`는 대상을 아예 받지 않고 **부른 사람 본인 것만** 돌려주므로 남의 명단을 물어볼 길이 없다. 주기·취소 모두 묻지 않고 바로 반영한다(다시 누르면 되돌아간다). 열 정렬: 칩 `min-width:54px` · 횟수 `min-width:56px` 오른쪽 정렬 — 응원 수·횟수 자릿수가 달라도 열이 흔들리지 않게. 내 줄 칩은 받은 수만 보여주는 표식(자기 응원 불가). 대상은 화면에 보이는 네 조각으로 지목하고 서버가 `identity_key`로 되짚는다 — 이 API는 JWT가 없어 남의 `user_id`가 새면 그 사람 행세가 가능해지므로 절대 응답에 싣지 않는다. 순위 줄은 폰에서 한 줄을 지켜야 해서 소속을 `사랑-3`으로 줄여 쓴다(소속만 신축 칸, 모자라면 `…`).
- **게시판(응원·기도·공감):** ⚠️ `boardList`는 **응답에 `user_id`를 싣지 않는다**(2026-08-24 수정 — 그전엔 `select("*")` 결과를 `...row`로 통째로 펼쳐 모든 글·답글의 작성자 `user_id`가 새어 나갔다). 클라이언트가 필요한 건 「내 글인가」 하나뿐이라 **`isMine` 참/거짓만** 내려준다. 본인 글 판별은 `isMine` 또는 소속+이름 일치(옛 글). **새 액션을 만들 때도 같은 규칙** — 이 API는 JWT가 없어 남의 `user_id`가 새면 그 이름으로 글쓰기·진도 저장·순위 응원까지 가능해진다.
- **게시판(응원·기도·공감):** 2026-08-15 「질문 나눔」에서 이름을 바꿨다 — 질문은 AI 「내게 주시는 말씀」이 받고, 게시판은 성도 간 격려 전용으로 성격을 옮겼다. boardList/Post/Reply, 관리자 moderate · 공감 이모지 👍🙏❤️😊🎉(`board_reactions`, boardReact/boardReactors) — 여러 개 누를 수 있고 칩을 누르면 누른 사람 이름
- **딥링크:** `gocheok.onlybible.kr/?v=구절번호` → 로그인 없이 해당 구절 암송화면(startTest) 바로 진입 (말씀 아카이브 sermon.onlybible.kr에서 연동). `&lang=en`이면 영어(NIV) 모드로 진입
- **영어(NIV) 암송 모드** (2026-07-22 추가): `verses.text_en`/`ref_en`이 있는 구절만 암송화면 상단에 한/EN 토글 노출. 어드민(admin-stats.html)에서 "🤖 NIV 생성" 버튼으로 AI 초안 생성 후 반드시 실제 NIV 성경과 대조·검수하여 저장. **진행 단계는 언어별로 따로** 센다(2026-08-12) — 한글이 3단계여도 영어로 처음 하면 1단계부터. `progress` 테이블에 `lang` 컬럼(PK: user_id·verse_no·lang, 기존 행은 모두 ko), 로컬은 `memorize-progress` / `memorize-progress-en` 두 벌, login이 `progress`(ko)·`progressEn`을 함께 내려준다. 구절에 영어 본문이 없으면 늘 ko로 본다(`verseLang`). **복습·랭킹·마음에 둠은 언어 무관** — 구절 하나로 센다(어느 언어로 마쳤든 복습 예약은 한 번). 설정 화면에서 기본 언어 선택 가능, 목록 카드에 EN 배지 표시. TTS/STT는 en-US로 분기, 채점은 대소문자·문장부호 관용 비교. 영어 본문·빈칸·정답은 **Lora**(라틴 전용 서체)로 **한 단계 크게**(23px, 글씨크기 설정 시 27/31px) — 한글 서체의 영문 글자는 획이 가늘어 눈에 안 박힌다(`.test-screen.en`). 영어 모드 화면 하단에 NIV(Biblica) 저작권 표기 고정.

## 사용 설명서 (2026-08-21)
어르신도 혼자 보실 수 있게 **한 화면에 한 가지 · 큰 글씨 · 그림 · 큰 [다음] 단추**.
- **앱 안:** 첫 화면 **❓** → `renderManual`. 목차 13항목(설치 → 알림 → 로그인 → 암송 → 듣기 → 음성 → 앨범 → 순위 → 게시판 → 내게 주시는 말씀 → 매일 묵상 → 필사 신청 → 글씨 크기) → 누르면 그 항목만 한 화면에. 맨 아래 「자세한 안내」가 기존 `renderHelp`(긴 글·개인정보)로 들어간다 — **첫 화면 단추는 늘리지 않았다.** ①②에는 「📲 지금 만들기」·「🔔 지금 켜기」 실행 단추가 붙어 있다(읽고 딴 화면을 찾아가게 하지 않는다). 그림은 화면 사진이 아니라 단순한 그림 — 사진은 폰마다 다르고 화면이 바뀌면 곧 낡는다.
- **화면으로 따라 하기:** `guide/` (gocheok.onlybible.kr/guide/) — **들어가는 문 두 곳**: ❓ 사용 설명서 **목차 맨 위**, 그리고 **인트로 마지막 장**(처음 설치한 분이 자연스럽게 만나게. 슬라이드 내용은 관리자가 바꾸므로 단추는 슬라이드가 아니라 화면 쪽에 뒀다). 첫 화면 단추는 늘리지 않았다.
  `?s=4`로 특정 걸음을 바로 연다(로비에서 「④번 보세요」 하고 링크로 짚어 주기 좋다). — **실제 앱 화면**을 한 걸음씩 넘겨 보는 페이지. **로그인이 필요 없다**(설치 전에도, 로비에서 QR로도 열린다). 자막을 브라우저 TTS로 읽어 줘 녹음할 사람이 없어도 말로 설명된다(첫 진입은 꺼진 채 시작 — 조용한 자리에서 갑자기 말이 나오면 놀라신다). 화면 그림은 `guide/shots/*.png`이고 **캡처 스크립트로 다시 뽑는다**: index.html에 씨앗 스크립트를 끼운 임시 파일을 로컬 서버로 띄우고 `?go=<렌더함수>`로 원하는 화면을 부른다. ⚠️ 캡처할 때 **fetch를 가로채 전부 로컬 응답으로 답해야 한다** — 그냥 띄우면 login 액션이 운영 users 테이블에 가짜 사람을 만든다. 이름도 실제 성도가 아닌 '홍길동/사랑 1목장'을 쓴다(공개되는 화면이다). 자동 팝업(오늘의 묵상·홍보·공지)은 DOMContentLoaded에서 무력화한다.
- **인쇄물:** `marketing/manual/manual-gen.py` → `사용설명서_A4.pdf`(앞뒤 2쪽). 앞면=「성경말씀 암송 어플 설치방법」(QR·설치·로그인·알림), 뒷면=「성경말씀 암송 어플 설명서」(쓰는 법·부가 기능·필사 신청). 로비 봉사자가 나눠 드린다. 본문 12.5pt·QR 25mm. **판이 넘치는지는 반드시 측정으로 확인**한다 — `1mm = 96/25.4 = 3.7795px` **고정**이지 창 너비에 맞춰 늘어나지 않는다(이걸 헷갈리면 멀쩡한 판을 넘쳤다고 오인한다).
- **홈 화면에 앱 만들기:** 안드로이드는 `beforeinstallprompt`를 잡아 두어 **📲 한 번이면 크롬이 설치창을 띄운다**. 아이폰 사파리에는 그 API가 없어 공유 시트를 거쳐야 하므로 `renderInstallGuide()`가 **어느 단추인지 그림으로 짚어** 준다(자기 폰 쪽이 펼쳐져 뜬다). **카카오톡 내부 브라우저에서는 어느 폰이든 설치가 안 된다** — 두 안내 모두에 적어 두었다.

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
수령은 4층 새가족실 방문, 권당 3,000원(찾을 때 지불). **배부완료로 바꾸면 서버가 휴대폰 번호를 비운다**(`pilsaSetStatus`, 2026-08-24 — 개인정보 안내가 약속한 것을 사람 기억에 맡기지 않는다). 되돌릴 수 없어 관리자 화면이 한 번 묻고, 지운 뒤 카드에서 번호가 바로 사라진다. 「번호 없음」은 처음부터 없는 것과 구분해 **「번호 없음 · 배부 후 삭제」**로 쓴다. **준비완료로 바꾸면 앱 알림을 켜 둔 분께 Web Push 1회**(notified_at), 켜지 않았으면 관리자 화면이 휴대폰 번호로 연락하라고 알려 준다. 관리자 화면은 **보냄 / 안 켜심 / ⚠️ 발송 실패** 셋을 구분해 보여 준다 — 실패를 '안 켜심'으로 뭉뚱그리면 푸시가 고장 나도 아무도 모른다(`pushError`). **반대로 성도가 신청·수정하면 담당자에게 Web Push**가 간다(`pilsaNotifyAdmins`). 받는 사람은 `app_config.pilsaAdmins`(identity_key 배열)에 두고 `supabase/pilsa_admin_notify.sql`로 등록한다 — 저장소가 공개라 이름·user_id를 코드에 박지 않고, 담당자가 바뀌어도 배포가 필요 없다. **등록하지 않으면 아무에게도 가지 않는다.**
- 첫화면(renderSummary)의 「✍️ 성경필사 노트 신청」 버튼으로 들어간다(응원·기도·공감 게시판과 찬양 아카이브 사이). `index.html?preview=pilsa`로도 같은 화면.
- 관리자: admin-stats.html → 신청자 카드 목록. 상태 체크박스(신청·준비·완료·배부, 기본 신청)로 추리고, 카드의 「✉️ 문자」가 담당자 폰의 문자 앱을 문구까지 채워 연다(문자 API 미연동).

## 다음 작업 (이어서 할 것)
> 여기에 다음에 진행할 과제를 적어두면, 다음 세션에서 이 문서를 읽고 바로 이어감.
- [ ] 필사 신청 알림: `supabase/pilsa_admin_notify.sql`로 담당자를 등록해야 켜진다(등록 전엔 아무에게도 안 감). 등록 후 본인 신청으로 실동작 확인
- [ ] 영어(NIV) 암송 모드: admin-stats.html에서 기존 구절 중 몇 개를 골라 "NIV 생성" 실행 → 실제 NIV 성경과 대조·검수 → 저장. 이후 앱에서 한/EN 토글·TTS(en-US)·STT·채점 실기기(iOS Safari·Android Chrome) 테스트.
- [ ] 이어 듣기(v3.183~186) 실기기 확인: 말씀 목록·앨범 두 화면 · ⏭⏮가 한 칸씩만 움직이는지 · 「요약 함께」에서 낭독과 MP3가 겹치지 않는지(`_ttsGen` 가드) · 고르기 칩을 눌러도 화면이 위로 튀지 않는지 · 듣는 동안 화면이 저절로 꺼지지 않는지(Wake Lock)

## 개인정보 (2026-08-24)
공개 방침은 **`privacy/`**(gocheok.onlybible.kr/privacy/) 한 곳이다 — 로그인 없이 열려야 플레이스토어 심사에 낼 수 있다. 앱 안 개인정보 화면의 「📄 전체 안내 보기」가 같은 곳을 가리키니 **문구를 고칠 때 두 곳을 함께** 본다. 삭제 요청은 이메일(sewkim00@gmail.com)·게시판·교회 사무실(02-2686-5871~3)·로비 넷. **담당자 휴대폰 번호는 싣지 않는다**(수집 로봇이 HTML 주석까지 읽는다). ⚠️ **모으는 것을 하나라도 빠뜨리면 그게 심사 반려 사유이고, 성도님께 사실이 아닌 말을 한 것이 된다** — 2026-08-24에 도움말이 「연락처는 받지 않습니다」(필사에서 받는다)·「교회 내부 시트에 저장」(v1 이야기)·「다른 시스템과 연동하지 않아요」(질문 글이 AI로 간다) 셋을 틀리게 적고 있었다.

## 참고
- 기능 명세: `보고서_기능_성경암송_v2.html`
- 형제 앱: 찬양 `c:\Projects\praise-songs`(worship.onlybible.kr), 말씀 `c:\Projects\gocheok-sermons`(sermon.onlybible.kr) — 각 CLAUDE.md 참고
