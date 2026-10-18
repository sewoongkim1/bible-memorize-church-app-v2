# 백엔드 — 액션 · 테이블 · 시크릿 목록

> CLAUDE.md 에서 옮겨 온 상세 기록이다(2026-09-12, 두 겹으로 나눔 — 내용은 한 글자도 안 고쳤다).
> **언제 읽나:** Edge Function `api` 에 액션을 더하거나, 어느 표에 무엇이 들어 있는지 짚어 볼 때
> ⚠️ **원본은 코드다** — `supabase/functions/api/index.ts` 의 `switch` 와 `supabase/schema.sql`.
> 아래 목록은 그것을 사람이 읽기 좋게 적어 둔 것이라 **금세 낡는다.** 다르면 코드가 맞다.

## 액션
authCheck · login · saveProgress · challenge · advanceReview · ranking(응원 수·내 오늘 여부 포함) · rankCheer/rankCheerers(순위 응원 👏) · mydays · stats · participants · verses/getVerses(`track:"psalm"` 쉴만한 물가 · `track:"navi"` 네비게이토 2026-10-13 · 없으면 주간) · saveVerse · seedVerses · generateNiv(영어 NIV 본문 AI 생성, DB 저장 없이 반환만) · passageHelp/passageHelpAll(내 안에 거하는 말씀 AI 도우미, 마디당 1회 생성 후 app_config 캐시) · getPassageProgress(마디 진행 기기간 동기화) · cleanupDummy · savePush · removePush · removeIosPush(아이폰 앱 「내 정보 지우기」 — 그 계정의 기기 토큰을 지운다 · 2026-10-07) · testPush · sendPush(hour/user_id로 대상 좁힘 가능 · 크론은 내부 키(**단계로 옮기는 중** — 차례는 `push_report_cron.sql` 머리 · CLAUDE.md 🔑 줄 · 본문은 `cronOnly` 가 크론의 꼴로 다시 만든다 · 아니면 `bad-args`) · 관리 화면 · monitor.yml 은 관리자 암호(`ADMIN_PW_ONLY`) · 알림 주소는 이 앱 안(`https://gocheok.onlybible.kr/…`)만 — 다른 곳이면 첫 화면 · 2026-10-12) · weeklyVersePush(매주 주일 08시 KST 전체 발송, 이번주 말씀 없으면 skip — cron: push_report_cron.sql(Vault 내부 키 · **2026-10-18 08:05 뒤** — 그 전까지는 옛 명령 = 관리자 암호)) · monitor · weeklyReport(크론은 내부 키(**단계로 옮기는 중** — 차례는 `push_report_cron.sql` 머리 · CLAUDE.md 🔑 줄 · 본문은 `cronOnly` 가 크론의 꼴로 다시 만든다 · 아니면 `bad-args` · 내부 키 길은 받는 곳 `extra` 를 버린다) · 관리 화면 · monitor.yml 은 관리자 암호(`ADMIN_PW_ONLY`)) · boardList(2026-10-01~ 보는 분의 가린 분 글·답글을 빼고 `rulesOk`·`blockedCount`·글마다 `blockable`(참/거짓) — user_id 는 여전히 안 싣는다)/boardCheck(2026-10-01~ `user_id` 를 주면 가린 분의 글·답글을 빼고 센다 — 응답은 `{ ok, recent }` 뿐)/boardPost·boardReply(2026-10-01~ 관리자가 아니면 user_id + 이용 규칙 동의가 있어야 — `no-user`·`rules-needed` · `boardWriteGate`)/boardDeleteMine/boardModerate · boardRulesAccept(게시판 이용 규칙 동의 → users.board_rules_at) · boardBlock/boardBlocks/boardUnblock(「🙈 가리기」 — 글 번호만 받아 글쓴 분은 서버가 찾는다 · 목록은 이름·줄 번호만 · `blocked_id` 는 어떤 응답에도 안 나간다) · sermonAnswerReport(「내게 주시는 말씀」 🚩 이 답 알리기 — 답은 캐시에서 먼저)/sermonAnswerReports·sermonAnswerReportResolve(관리자 — 질문별 묶음 · 처리 완료/답 지우기 · 알린 분은 안 싣는다) · login(2026-10-01~ `guardian_ok:true` 면 어린 부서(needsGuardian)의 users.guardian_ok_at 을 처음 한 번 — 체크가 없다고 막지 않는다) — 이 줄의 2026-10-01 것들은 `docs/notes/store-review.md` · boardReport(성도 🚩 신고 — 남의 글·답글만, 같은 글 두 번째는 `already`, 표가 없으면 `not-ready`)/boardReports·boardReportResolve(관리자 — 처리 전 신고를 글·답글별로 묶음 · 숨기기/처리 완료. ⚠️ 신고한 분은 **관리자 응답에도** 안 싣는다 · 2026-10-01 · docs/notes/board.md 「신고」) · pilsaMine/pilsaApply/pilsaCancel(성도) · pilsaList/pilsaSetStatus(관리자, 준비완료 전환 시 해당 성도에게 Web Push 1회) · ministryAuth(사역신청 담당자 화면 로그인 — 관리자 암호, 또는 사역 암호 + ministryAdmins 등록 담당자. ministryList·SetStatus·CatalogSave·CatalogOrder 도 같은 확인) · ministryAdmins/ministryAdminsSave(사역신청 담당자 명단 보기·한 분씩 추가/빼기 — 관리자 암호만) · ministryTester(이 계정이 사역신청 시험 참여자인가 — app_config `ministryTesters` · 명단은 교회 어드민이 고친다 · 2026-09-30) · ministryHistoryMine/ministryHistoryRequest(사역 이력 확인·정정 신청 — 2026-10-01. `users` 에서 소속·이름을 꺼내 교회 어드민 함수의 내부 갈래 `internalMyHistory`/`internalHistoryRequest` 를 서비스 키(`x-internal-key`)로 대신 부른다. 문은 사역신청과 같다(ministryCfg().isOpen · 관리자 비번 · ministryTester). 응답은 정해진 칸만 다시 골라 내보낸다) · featureLog(열람 기록 — 못 재던 기능들이 「몇 명에게 닿는지」를 남긴다. 허용 목록 `FEATURES` 를 통과한 값만 `v2_feature_log` 로 넘기고, **실패해도 늘 `ok:true`**(`skipped`) 로 답한다 — 기록 때문에 화면이 막히면 본말이 뒤집힌다. ⚠️ `FEATURES` 는 **클라이언트가 보낸 값을 거르는 관문**이지 표에 들어갈 수 있는 값의 전체 목록이 아니다 — 서버가 스스로 `db.rpc("v2_feature_log", …)` 를 부르는 값(예: 오늘의 찬양 `song`)은 여기를 안 지난다)

교육신청(성도님 · 2026-10-05~ · `docs/notes/education.md`) eduList(열린 강좌 목록 + `open`(문 — app_config `eduOpen` 이 true 이거나 🧪 시험 참여자) + 내 강좌) · eduCourse(강좌 자세히 + 회차의 내 출석 `myState` — 목록 밖 강좌는 그 강좌에 내 줄이 있을 때만) · eduApply(신청 — 문이 닫혔으면 `not-open` · 선착순이면 바로 확정/대기 · 확정 알림은 안 보낸다) · eduCancel(내 줄 취소 — 첫 날 전날까지 · 대기 첫 분이 오르면 그분께 확정 알림을 응답 뒤에) · eduMine(내 신청들 · 대기 번호·출석·수료번호) · eduCert(내 수료증 자료 — 내 줄·수료·취소 안 됨일 때만) · eduVerify(수료번호 진위 확인 — 로그인 없이 · 가린 이름만) — 정원·대기·취소 마감은 `supabase/edu.sql` 함수 한 곳 · 응답에 user_id·ident_key 없음
internalEduNotify(교회 어드민 전용 — 확정 알림 `{kind:"confirmed", enrollment_ids, promoted?}` → `{ok, sent, skipped}`) · internalEduRemind(pg_cron 전용 `edu_remind_cron.sql` — 매일 19:00 KST, 내일이 첫 날인 강좌의 확정자 → `{ok, day, courses, sent, skipped}`) — 둘 다 머리 `x-internal-key` 가 그 프로젝트 api 의 `SUPABASE_SERVICE_ROLE_KEY` 와 같을 때만(`sameSecret` · 아니면 `unauthorized`) · 보내는 길은 `eduNotifySend` 하나(같은 신청에 같은 알림 한 번 = SQL `edu_notify_claim` · 교육이 열리기 전에는 🧪 시험 참여자에게만 · `push_log` mode `edu-confirmed`·`edu-first-day`)
internalMinistryNotify(교회 어드민 전용 · 2026-09-28 — 사역신청을 「임명확정」으로 바꾼 뒤 `{id}` → 그분께 임명 알림 `{ok, pushed, pushError, already}` · 한 사람 한 해 한 번(`ministry_orders.notified_at`) · 같은 `x-internal-key` 문)
internalMonitorWatch(pg_cron `monitor-watch` 전용 · 2026-10-12 — 감시의 감시: `monitor` 가 GitHub 에서 `src:"gha"` 로 불릴 때 남긴 흔적 `app_config.monitorRun` 이 36시간을 넘었으면 Resend 메일 → `{ok, state: ok|stale|unknown, ageH, mailed, workflows}` · `dry:true` 면 메일 없이 · 스스로 흔적 `monitorWatchRun` 을 남기고 `monitor` 가 그것을 본다 · 같은 `x-internal-key` 문 · `docs/notes/monitor-guard.md`)
`INTERNAL_CRON_OK`(크론 셋 sendPush · weeklyVersePush · weeklyReport · 2026-10-12 · `supabase/push_report_cron.sql` — 머리 `x-internal-key` 가 그 프로젝트 api 의 `SUPABASE_SERVICE_ROLE_KEY` 와 같으면 들머리가 본문을 `cronOnly` 로 크론의 꼴로 다시 만들고 암호 없이 통과 · 꼴이 아니면 `bad-args`(암호가 있어도) · 규칙: sendPush 는 시각 5~8(`CRON_PUSH_HOURS`) · 표어 · 주소 서버 고정(`latest`) · weeklyVersePush 는 `{action, hour?, user_id?, diag?}` · weeklyReport 는 `{send?(true 만), from?, to?(YYYY-MM-DD)}` · diag 는 user_id(uuid)와 함께일 때만 · 글 · 주소 · only · userBodies · extra 는 받지 않는다 · 교회 어드민 프록시 `INTERNAL_ADMIN_OK` 와 따로 — 교회 어드민 case 목록 · `ACTION_ROLES` 에 없다 · 같은 액션의 암호 길 `ADMIN_PW_ONLY` 는 그대로(admin-stats 손 발송 · monitor.yml · 크론 되돌리기))
⚠️ 관리 함수 안에서 다른 관리 함수를 **새 객체로** 부르면 들머리가 붙인 표(`SUPER_OK`·`INTERNAL_OK`)가 끊긴다 — `{...b}` 로 펼치거나 표를 넘길 것. `weeklyReport` 의 안쪽 `stats` 두 곳은 2026-10-12 에 고쳤다(빠뜨리면 메일은 ok 인데 누적 참여자 · 주차별 신규가 0). `boardReportResolve` 의 안쪽 `boardModerate`(신고 「숨기기」 — 10/08 부터 늘 unauthorized 였다)와 `eveningPush` 의 안쪽 `sendPush`(sent 0 · total 0 으로 조용히 끝났다 · 아직 안 켬)는 2026-10-13 에 고쳤다(79657c5 · 바깥 adminError 를 통과한 뒤 `[SUPER_OK]: true` · `[INTERNAL_OK]` 를 넘긴다). 새로 짤 때 찾는 법: 관리자 문이 있는 함수를 `body`·`b` 가 아닌 인자로 부르는 자리를 모두 본다(2026-10-13 전수 — 그 둘뿐이었다).
⚠️ 옛 크론 SQL 넷(`push_cron.sql`·`push_cron_hourly.sql`·`weekly_verse_push_cron.sql`·`weekly_report.sql`)은 되살리지 말 것(관리자 암호가 크론 명령에 다시 들어간다 · 실행 문장은 주석이고 맨 앞에서 멈춘다) · 아침 시각(작업)을 늘리면 api 의 `CRON_PUSH_HOURS` 도 함께(아니면 그 작업이 조용히 `bad-args`).

## 테이블
`users`(교구·목장·이름 등 identity_key), `verses`(주간 암송구절, url=설교영상, `text_en`/`ref_en`=영어 NIV 본문·출처), `progress`(구절별 단계), `challenge_log`(암송/도전 로그, mode=learn-*), `reviews`(간격반복 복습), `push_subscriptions`·`push_log`(Web Push), `board_posts`·`board_replies`(게시판), `board_blocks`(🙈 가리기 — 2026-10-01. `(blocker_id, blocked_id)` 한 줄 · 둘 다 users FK cascade · `blocked_id` 는 응답에 안 나간다 · `supabase/board_blocks.sql`), `sermon_answer_reports`(AI 답 알림 — 2026-10-01. 까닭 CHECK 는 app.js·index.ts 와 세 곳 · 한 분 한 질문 한 번 · 처리 뒤 90일 cron · `reporter_id` 는 관리자 응답에도 안 나간다 · `supabase/sermon_answer_reports.sql`), users 의 `guardian_ok_at`·`board_rules_at`(2026-10-01 · 보호자 확인·이용 규칙 동의 날짜 · `supabase/users_consents.sql`), `board_reports`(게시판 🚩 신고 — 2026-10-01. `reporter_id` 는 어떤 응답에도 안 나간다 · 까닭 CHECK 는 app.js·index.ts 와 세 곳 · 처리 뒤 90일이면 cron 이 지운다 · 알림 받을 분은 app_config `boardAdmins` · `supabase/board_reports.sql`), `rank_cheers`(순위 응원 — 대상·보낸이·날짜가 기본키라 하루 한 번, 기간 집계는 cheer_date로), `pilsa_orders`(필사 노트 신청 — 한 건이 한 행, 최근 1건만 화면에 노출, notified_at으로 준비완료 알림 중복 방지), `feature_log`(열람 기록 — 2026-09-23. 기본키 `(user_id, day, feature, item)` 라 **하루에 한 항목은 한 행이고 다시 봐도 `cnt` 만 오른다**(`blessing_log` 를 일반화한 모양). `day` 는 한국 시간 기준, `item` 은 기능마다 뜻이 다르다. ⚠️ **여러 세션·여러 기능이 함께 쓰는 공용 표**라 `feature` 값이 계속 는다 — 지금 값은 `select distinct feature from public.feature_log` 로 보고, 값을 늘렸으면 `supabase/feature_log.sql` 머리의 「item 의 뜻」 표도 그 자리에서 함께 고친다. ⚠️ `feature` 에 DB CHECK 를 **일부러 안 걸었다**(허용 목록이 세 곳이 되면 앱은 보내는데 저장만 조용히 막힌다). 보는 법은 `supabase/feature_log.sql`·`psalm_metrics.sql`, 설계는 `docs/superpowers/specs/2026-09-23-feature-log-design.md`)

봉사 당번(2026-10-06 · `supabase/duty.sql` · `docs/notes/duty-roster.md`) — `duty_boards`(당번) · `duty_lines`(자리 틀) · `duty_days`(날짜 — 쉼·확정·메모) · `duty_slots`(자리) · `duty_signups`(지원 — 자리·사람에 한 줄) · `duty_notify_log`(알림 한 번만). 모두 RLS + 공개 역할 권한 0 · 상태는 SQL 함수(35개 — 하나는 당번을 숨긴 때 `hidden_at`·보관한 때 `archived_at` 을 적는 트리거 · 담당자의 사람별 이력 `duty_people` 은 교회 어드민만 부른다)로만 바꾼다 · `duty_signups` 에 직접 update 하지 말 것(메모도 `duty_note_set`). 성도님 액션 일곱(`dutyList`·`dutyBoard`·`dutyMine`·`dutyPast`(지난 봉사 — 날짜가 지난 내 줄 · SQL `duty_past` · 2026-10-07 · 줄마다 그 당번의 문의 `contact` · `dutyBoard` 도 두 수 `past` 를 함께 준다) 읽기 · `dutyApply`·`dutyCancel`·`dutyAsk` 쓰기 — 2단계 · 2026-10-06 운영): 문 `dutyGate`(users 에 실제로 있는 계정 + `dutyOpen` true 또는 시험 참여자)가 **읽기도 막는다** — 닫혔으면 읽기 `{ok:true, open:false}` · 쓰기 `not-open`. 읽기 응답의 `me.why`(guardian·bad-name·'') = 부른 계정이 앱에서 지원하지 못하는 까닭. 공개 설정 키 `dutyOpen`(`PUBLIC_CONFIG_KEYS`) · 열람 기록 `duty`(`FEATURES`). 알림(3단계 · 2026-10-07): 보내는 길은 `dutyNotifySend` 한 곳 · 내부 액션 `internalDutyNotify`(교회 어드민 전용 `{kind, signup_ids}` → `{ok, sent, missed[, off]}` — sent 는 실제로 나간 분 · missed 는 가지 않은 분)·`internalDutyRemind`(pg_cron `duty-remind` 전용 → `{ok, day, rows, sent, missed}` · 한국 19시 전에는 `too-early`) · `app_config` 의 서버 전용 키 둘 — `dutyNotifyOff`(true 면 당번 알림을 모두 끈다) · `dutyRemindRun`(전날 알림이 돈 흔적 — `monitor` 가 본다) — 둘 다 서비스 키(`x-internal-key`) · `push_log.mode` 는 `duty-<종류>`. 담당자 쪽은 교회 어드민 함수(`duty-db.ts`). 알림 고침 검토 반영(2026-10-07): `internalDutyNotify` 응답 `{ok, sent, missed[, off, held]}`(`sent` 는 받는 분마다 — 자기 기기 가운데 하나라도 받아들여진 분 · `held` = 꺼 둔 동안 보냈을 분 수) · `duty_notify_claim(kind, ids, p_date)`(전날 알림은 날짜도 잡는다) · 흔적 `dutyRemindRun` 은 `{at, day, rows, sent, missed, runs[, off, held]}`(같은 날의 부름을 더한다) · `dutyNotifyOff` 가 켜진 채면 `monitor` 가 아침마다 말한다.

⚠️ **`verses` 에는 `updated_at` 도 `url` 도 없다**(2026-09-11에 두 번 헛질의를 했다). 실제 칸은
`no, week, ref, text, sermon_title, sermon_url, is_active, created_at, date, ref_short, ref_full, hint, pastor, text_en, ref_en, track, day_no, frame_art`.

## 시크릿
ADMIN_SECRET(관리자 비번, 3앱 공통 — 기계 호출자는 2026-10-13 에 뗐다 · 아래 「기계 호출자」), MONITOR_KEY(매일 점검 전용 키 · 2026-10-13), SERMON_JOB_KEY(설교 작업 전용 키 · 2026-10-13), ~~MINISTRY_SECRET~~(사역신청 담당자 암호 — **2026-10-13 운영·개발에서 지웠다** · 교회 어드민으로 갈아탐 · 담당자용 사역 액션은 moved-to-church-admin · docs/notes/ministry-2027.md 끝), VAPID_*(Web Push), RESEND_API_KEY·REPORT_FROM·REPORT_RECIPIENTS(주간 리포트 메일), ANTHROPIC_API_KEY(NIV 생성 등 AI 공용), TELEGRAM_*(모니터 경보)

## 통계 RPC
`stats-rpc.sql`: v2_stats·v2_participants(security definer, PII 반환→service_role만 grant)

## 집계표 (`daily-activity.sql`, 2026-08-15)
`daily_activity(day,user_id,mode,cnt)` — `challenge_log`에 INSERT·DELETE 트리거로 동기화(앱이 아니라 DB가 지킨다). `ranking`·`guRanking`·`mydays`가 로그 대신 이 표를 읽는다(`v2_ranking`·`v2_gu_ranking`·`v2_mydays`, 실패 시 `*Slow`로 폴백). **전체 기간 2,903ms → 516ms.** 로그 11,052행 = 집계 579행이고, 로그는 총 횟수만큼 늘지만 집계표는 참여자×활동일수만큼만 는다. `monitor`가 `v2_activity_drift()`로 매일 로그 행수 vs 집계 합계를 대조해 어긋나면 경보 — 틀어지면 백필(3번 블록)을 다시 실행하면 된다. 구절별 통계(`verseStats`·`verseCounts`)는 verse_no가 필요해 로그에 남는다.

## 기계 호출자(2026-10-13 — 관리자 암호에서 뗌)
10/25 관리자 암호 교체 전에 사람이 아닌 부름이 `ADMIN_SECRET` 에 매달리지 않게 했다. 키가 새도 **그 목록만** 열린다.

| 부르는 곳 | 머리 | 열리는 액션 | 키가 있는 곳 |
|---|---|---|---|
| 크론 여섯(pg_cron) | `x-internal-key`(Vault `edu_remind_service_key` = 서비스 키) | sendPush · weeklyVersePush · weeklyReport(`cronOnly` 꼴) | DB Vault — 단계로 옮기는 중(`supabase/push_report_cron.sql`) |
| `mcp` 함수(같은 프로젝트) | `x-internal-key`(함수에 저절로 있는 `SUPABASE_SERVICE_ROLE_KEY`) | findMember · memberParticipation(`INTERNAL_FN_OK`) | Supabase 밖으로 안 나간다 |
| 교회 어드민 함수 | `x-internal-key` | `INTERNAL_ADMIN_OK` 46개(역할은 교회 어드민 `canCall`) | 〃 |
| `.github/workflows/monitor.yml` | `x-machine-key` = `MONITOR_KEY` | monitor · weeklyReport(`cronOnly` 꼴 — 받는 곳 없음) | Supabase 시크릿(운영·개발) · GitHub v2 `production` 환경 · 로컬 `.env` `PROD_MONITOR_KEY` / `.env.dev` `MONITOR_KEY` |
| gocheok-sermons `sermon-job.yml`(설교 파이프라인) | `x-machine-key` = `SERMON_JOB_KEY` | sermonJobGet · sermonJobUpdate | Supabase 시크릿(운영·개발) · GitHub gocheok-sermons `SERMON_JOB_KEY`·`DEV_SERMON_JOB_KEY` · 로컬 `.env` `PROD_SERMON_JOB_KEY` / `.env.dev` `SERMON_JOB_KEY` |

- 전용 키는 **서비스 키(DB 전체)를 GitHub 에 두지 않으려고** 따로 만들었다. 표는 api `MACHINE_KEYS` 한 곳 — 액션을 더하려면 거기에 한 줄(크론 꼴이 필요한 액션이면 `cronOnly` 로 좁힌다).
- 머리(`x-machine-key`)가 있는데 맞지 않거나 목록 밖이면 **암호 길로 새지 않고** `unauthorized`(403).
- 키를 바꿀 때: 새 값을 Supabase 시크릿(운영·개발) · GitHub 시크릿 · 로컬 `.env` 세 곳에 함께(값은 찍지 않는다 — 2026-10-13 은 파이썬 한 번으로 넣었다).
- 「발송 진단(diag_send)」 수동 버튼은 이때 뺐다 — 사람을 안 고르면 모든 구독자에게 실제로 보내는 버튼이었다.

**아직 관리자 암호를 쓰는 곳(10/25 교체 날 볼 것):** 사람이 여는 관리자 화면(`admin-stats` 등 — 새 암호로 들어오면 된다) ·
설교 아카이브 함수 `sermon` 의 관리 액션(손으로 돌리는 `add-local` → `5-migrate` 의 `importSermons` · `6-embed` 의 `embedSermons` — 로컬 `.env` 의 `SERMON_ADMIN` 을 새 암호로) ·
gocheok-sermons `add-sermon.yml`(옛 길 · GitHub `SERMON_ADMIN`/`DEV_SERMON_ADMIN` — 옛 길을 치우거나 새 암호로) · 주일 말씀 크론(10/18 Vault 로 옮기기 전까지) ·
⚠️ **gocheok-sermons `sermon-job.yml`(관리자 화면 설교 올리기)의 저장·챗봇 단계도 아직 `SERMON_ADMIN`/`DEV_SERMON_ADMIN`** — 10/13 에 작업 키로 바꾸며 이 둘까지 걷었다가
2026-10-18 첫 실행(lV6AhR2irZM)이 저장을 조용히 건너뛰고 챗봇에서 멈춰 되살렸다(51e03f2). 작업 상태만 `SERMON_JOB_KEY` 다. 교체 날 이 두 시크릿도 새 암호로 —
또는 그 전에 `importSermons`(sermon 함수)·`embedSermons`(api)를 작업 키로 열고 그 줄을 걷는다.
찬양 함수는 2026-10-13 에 암호 길을 닫았다(내부 키 + 「암호 + 총괄」만 · praise-songs 6ff4948).

## 배포 가드(2026-10-12)
Edge Function(`api`·`mcp`)은 **`tools/deploy-fn.py` 로만** 올린다. 판단 함수 시험은 `python tests/deploy-fn-guard.py`.
```bash
python tools/deploy-fn.py api --dev                  # 1) 개발 — main 과 같은 판
python tools/deploy-fn.py api --dev --allow-ahead    #    개발 — main 에 아직 없는 내 가지를 시험할 때
python tools/deploy-fn.py api --prod                 # 2) localhost 확인 뒤 운영 — origin/main 과 같아야만
python tools/deploy-fn.py api --prod --dry-run       #    검사만, 배포 명령은 찍기만
```
`git fetch origin` 뒤 올라갈 경로(`supabase/functions/<이름>/` + 그 함수가 상대 import 로 끌어오는 `_shared` 류)를 보고, 하나라도 걸리면 **배포하지 않고 종료코드 1**:
- **커밋 안 된 변경·추적 안 된 파일** — 개발·운영 모두 막는다(내 것이면 가지에 커밋한 뒤 다시).
- **origin/main 보다 뒤처짐**(main 이 그 경로에 넣은 커밋이 HEAD 에 없다) — 개발에서도, `--allow-ahead` 로도 못 푼다. `git merge origin/main` 으로 푼다.
- **origin/main 과 내용이 다름**(앞섬) — 운영은 막음 · 개발은 `--allow-ahead` 를 줄 때만 경고로 지나간다.
- (`api`) **`case "…"` 액션 집합**을 origin/main 과 견줘 빠지는 것·더해지는 것의 이름을 찍는다. 빠지는 것이 있으면 막는다(개발 + `--allow-ahead` + 뒤처지지 않음일 때만 「일부러 지운 것인지」 경고).
- 통과하면 `supabase functions deploy <이름> --no-verify-jwt --project-ref <ref>` 를 저장소 뿌리에서 부른다. 운영은 직전에 ref 와 「운영」을 크게 찍는다(입력 확인은 없다 — `--prod` 플래그가 곧 확인이다). 끝에 배포 뒤 확인(스모크 셋 — 운영은 `EVT_ENV=prod` · 이벤트는 `EXPECT_PER_DAY=3`)을 찍는다.

**왜:** `supabase functions deploy` 는 git 이 아니라 **작업 트리의 파일을 통째로** 올린다. 여러 세션이 같은 체크아웃에서 일하므로 (1) 남의 커밋 안 된 코드가 내 배포에 실려 나가고 (2) 낡은 체크아웃에서 배포하면 남이 main 에 넣은 액션(봉사 당번·교육 등)이 운영에서 **오류 없이 사라진다** — 가을 이벤트 `perDay` 가 조용히 1 로 돌아간 일도 그것이었다.

⚠️ **우회하지 말 것.** 걸렸다고 `supabase functions deploy` 를 손으로 치면 위 사고를 그대로 밟는다 — 걸린 까닭(커밋·`git merge origin/main`·PR 머지)을 고치고 다시 돌린다. 급히 되돌릴 때도 되돌리는 커밋을 main 에 넣은 뒤 이것으로 올린다.

## 파일 나누기(2026-10-12 · 1·2단계)
`supabase/functions/api/index.ts` 한 파일(9,183줄 · `switch` 171갈래)을 영역별 파일로 나누기 시작했다. 본보기는 교회 어드민 `church-admin/supabase/functions/church-admin/`(`index.ts` + `*-db.ts`·`*-rules.ts`).

**원칙**
- **동작은 한 치도 안 바꾼다** — 옮기는 커밋에는 옮기는 것만. 고칠 것이 보이면 다른 커밋으로.
- **`case` 는 `index.ts` 의 `switch` 에 그대로 둔다.** 영역 파일은 처리 함수만 `export` 하고 `index.ts` 가 들여온다. `tools/deploy-fn.py` 가 `index.ts` 의 `case "…"` 를 세어 origin/main 과 견주기 때문이다(나눈 뒤에도 171 이어야 한다).
- **공용은 `supabase/functions/api/_shared.ts` 한 곳.** 영역 파일이 `index.ts` 의 도우미가 필요하면 그 도우미를 `_shared.ts` 로 **옮기고** `index.ts` 도 거기서 들여온다 — 두 파일에 같은 것을 두지 않는다 · 영역 파일이 `index.ts` 를 들여오지 않는다(들머리와 고리가 생긴다). 지금 든 것: `db`(서비스 키 클라이언트) · `kstDay` · 관리자 문 `adminError`(+ 들머리가 붙이는 표 `SUPER_OK`·`INTERNAL_OK` · `ADMIN_PW_ONLY` — 붙이는 자리·`INTERNAL_ADMIN_OK`·`INTERNAL_CRON_OK`·`cronOnly`·`staffIsSuper` 는 `index.ts`) · 위젯 날짜 `WIDGET_YMD_RE`·`widgetYmd`·`ymdDayNumber` · `fetchAllRows`. ⚠️ `ADMIN_PW_ONLY`(암호만으로 통과하는 기계 호출)에 액션을 더할 때는 **`_shared.ts`** 를 고친다.
- **순수 규칙은 표식 사이에 타입 표기 없이** 두고 `tests/` 가 그 구간만 잘라 `node:vm` 에서 돌린다(기존 `board-report`·`store-review` 방식 — 꾸러미·deno 없이 preflight 에서 돈다).
- `tests/api-split.test.cjs`(preflight [3]) 가 본다 — `index.ts` 가 들여오는 이름이 그 파일에 `export` 돼 있나 · 들여온 이름을 다시 선언하지 않나 · `_shared.ts` 의 것을 따로 두지 않나 · 떼어 낸 영역의 순수 규칙. ⚠️ 이 PC 에 `deno` 가 없어 `deno check` 를 못 돌린다 — 이름 하나가 어긋나면 배포는 되고 **첫 요청에서** 함수가 통째로 죽는다. 그래서 이 시험이 있다.
- 배포 가드는 따로 손댈 것이 없다 — 올라갈 경로가 함수 폴더 통째이고, 상대 import 도 센다. 개발에서 `python tools/deploy-fn.py api --dev --allow-ahead` 로 올린 뒤 옮긴 영역의 스모크를 그 자리에서 돌린다.
- ⚠️ **`index.ts` 를 글자로 읽는 시험이 많다**(2026-10-12 셈 — `board-report`·`store-review`·`event-auto`·`event-perday`·`evening-push`·`send-push-opts`·`duty-front`·`duty-send`·`edu-front`·`member-merge`·`member-profile` — `index.ts` 에서 표식·함수 이름으로 잘라 낸다 · `grep -l "functions/api/index.ts\|'api', 'index.ts'" tests/*` 로 다시 셀 것). 그 영역을 옮길 때는 **시험이 읽는 파일 경로도 함께** 바꾼다 — 안 바꾸면 「표식을 못 찾았다」로 preflight 가 배포를 막는다.

**옮긴 영역**
| 차례 | 영역 | 파일 | 옮긴 것 | 날짜 |
|---|---|---|---|---|
| 1 | 쉴만한 물가(시편 액자) | `psalm.ts` | `getPsalmVerses`(getVerses `track:"psalm"`) · `getTodayPsalm`(위젯) · `psalmConfig`·`psalmOpenCount` · 순수 `PSALM_DEFAULT`·`psalmCfgOf`·`psalmOpenOn` | 2026-10-12 |
| 2 | 가정 축복 기도문 | `blessing.ts` | `getBlessings` · `blessingLog` · `getTodayBlessing`(위젯) · `blessingUsage`(관리자) · 순수 `BLESS_WIDGET_NAME`·`blessJong`·`blessFill` | 2026-10-12 |
| — | 🐑 이번주 말씀 위젯 머리말(새로 · 옮긴 것 아님) | `verse-emoji.ts` | `getWeeklyVerse` 응답에 `badge`(「🐑 3일째」)·`badgeDate`(셈한 한국 날짜 — 위젯이 오늘인지 견준다 · 옛 위젯은 무시) · 이모지는 `verses.emoji`(`supabase/verse_emoji.sql`) · 빈 이번 구절은 응답 뒤 AI 채움(`queueVerseEmojiFill` · date 입력 없을 때만 · isolate 안 10분에 한 번) · 순수 `VERSE_EMOJIS`(40)·`verseEmojiOf`·`verseBadge` · 시험 `tests/verse-badge.test.cjs` · 스모크 `tests/verse-badge-smoke.py [--prod]` · 끄려면 badge 를 안 보내면 된다 · `docs/superpowers/specs/2026-10-13-verse-widget-badge-design.md` | 2026-10-13 |
| — | 📚 네비게이토 성경암송(새로 · 옮긴 것 아님) | `navi.ts` | `getNaviVerses`(getVerses `track:"navi"` — 응답에 `navi:true` 표식 · 읽기 오류는 `ok:false`) · 순수 `naviVerseOf` · 시험 `tests/navi.test.cjs` ② · `docs/notes/navigators.md` | 2026-10-13 |

`PSALM_NO_BASE`·`isPsalmNo`(복습에서 시편 빼기)는 로그인·진도 저장이 써서 `index.ts` 에 남겼다 — 2026-10-13 에 `isNonWeeklyNo`(1000 초과 · 물가·네비게이토를 복습에서 뺀다)로 이름을 바꿨다(서버의 두 자리가 모두 「복습에서 뺌」이라 · 「물가 화면으로 보냄」 `isPsalmNo` 는 이제 앱에만 · `docs/notes/navigators.md`). `index.ts` 9,183줄 → 9,105줄.
2단계는 공용 도우미(`adminError` 묶음·위젯 날짜·`fetchAllRows`)를 먼저 `_shared.ts` 로 옮기고 축복 기도문 네 액션을 떼었다 — `index.ts` 9,077줄 → 8,920줄 · `case` 171 그대로. 개발에 올린 직후 축복 기도문 액션(날짜 여럿·빈 user_id·관리자 문 셋)과 옮긴 도우미를 쓰는 남의 액션(`getWeeklyVerse`·`getTodayMeditation`·`authCheck`·`ranking`·`stats`) 24가지 응답을 배포 전에 받아 둔 것과 **바이트까지** 견주었다(22가지 같음 · `blessingUsage` 둘은 그 사이 개발 DB 에 기록이 8번 더 쌓여 수만 달랐다 — 다시 받은 두 번이 서로 같았다). 시험 `tests/api-split.test.cjs` 에 ⑤(남의 export 를 쓰면 들여왔나 — 옮기다 `WIDGET_YMD_RE` import 를 빠뜨릴 뻔했다) · ⑥(받침·조사 채우기)을 더했다.
⚠️ **`tools/security-check.py` 의 액션 분류(B)는 api 폴더의 `.ts` 를 모두 읽어야 한다** — `index.ts` 만 읽으면 영역 파일로 옮긴 처리 함수의 관리자 문(`blessingUsage` 의 `adminError`)을 못 보고 「공개」로 센다(2026-10-12 고침).

**다음 후보 차례**(얽힘이 적은 차례 — 2026-10-12 셈. 밖에서 쓰는 것 / 밖이 쓰는 것)
1. **연상 그림**(`verseImg*`·`vimg*` · 348줄) — `contentError`·`staffLabel`·`json`·`norm` 을 `_shared.ts` 로 · `getVerses` 가 `vimgPublicMap` 을 부른다. 다음으로 **설교 담당자**(`sermonJob*`·`staffVerseSave` 등 · 337줄)와 함께 옮기면 `staffLabel` 이 한 파일 안에 든다.
2. **말씀 이벤트**(`evt*`·`event*` · 979줄) — 밖에서 아무도 안 부르지만 `ministryIsTester`·`pilsaPhone`·`PILSA_PHONE_RE`·`MIN_POSITIONS` 를 쓰고 `tests/event-auto.test.cjs` 가 `index.ts` 를 글자로 읽는다. ⚠️ 얼린 액션(`eventImport`·`eventSave`·`eventSetNote`)이 든 판 그대로.
- 뒤로 미룬 것: **게시판**(신고·가리기·스토어 심사 구간과 얽힘 — `storeUid` 를 로그인 확인 번호 일곱 곳이, `needsGuardian` 을 로그인·봉사 당번이 쓴다 · 시험 둘이 `index.ts` 를 잘게 자른다) · **순위·응원**(`rangeFilter` 를 통계·교육 등 열 곳이 쓴다 — 먼저 `_shared.ts` 로 · `fetchAllRows` 는 2단계에서 옮겼다) · **알림·저녁 알림**(push·evening·APNs — 저녁 문구 작업이 끝난 뒤).
