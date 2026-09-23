# 백엔드 — 액션 · 테이블 · 시크릿 목록

> CLAUDE.md 에서 옮겨 온 상세 기록이다(2026-09-12, 두 겹으로 나눔 — 내용은 한 글자도 안 고쳤다).
> **언제 읽나:** Edge Function `api` 에 액션을 더하거나, 어느 표에 무엇이 들어 있는지 짚어 볼 때
> ⚠️ **원본은 코드다** — `supabase/functions/api/index.ts` 의 `switch` 와 `supabase/schema.sql`.
> 아래 목록은 그것을 사람이 읽기 좋게 적어 둔 것이라 **금세 낡는다.** 다르면 코드가 맞다.

## 액션
authCheck · login · saveProgress · challenge · advanceReview · ranking(응원 수·내 오늘 여부 포함) · rankCheer/rankCheerers(순위 응원 👏) · mydays · stats · participants · verses/getVerses · saveVerse · seedVerses · generateNiv(영어 NIV 본문 AI 생성, DB 저장 없이 반환만) · passageHelp/passageHelpAll(내 안에 거하는 말씀 AI 도우미, 마디당 1회 생성 후 app_config 캐시) · getPassageProgress(마디 진행 기기간 동기화) · cleanupDummy · savePush · removePush · testPush · sendPush(hour/user_id로 대상 좁힘 가능) · weeklyVersePush(매주 주일 08시 KST 전체 발송, 이번주 말씀 없으면 skip — cron: weekly_verse_push_cron.sql) · monitor · weeklyReport · boardList/boardCheck/boardPost/boardReply/boardDeleteMine/boardModerate · pilsaMine/pilsaApply/pilsaCancel(성도) · pilsaList/pilsaSetStatus(관리자, 준비완료 전환 시 해당 성도에게 Web Push 1회) · ministryAuth(사역신청 담당자 화면 로그인 — 관리자 암호, 또는 사역 암호 + ministryAdmins 등록 담당자. ministryList·SetStatus·CatalogSave·CatalogOrder 도 같은 확인) · ministryAdmins/ministryAdminsSave(사역신청 담당자 명단 보기·한 분씩 추가/빼기 — 관리자 암호만) · featureLog(열람 기록 — 못 재던 기능들이 「몇 명에게 닿는지」를 남긴다. 허용 목록 `FEATURES` 를 통과한 값만 `v2_feature_log` 로 넘기고, **실패해도 늘 `ok:true`**(`skipped`) 로 답한다 — 기록 때문에 화면이 막히면 본말이 뒤집힌다. ⚠️ `FEATURES` 는 **클라이언트가 보낸 값을 거르는 관문**이지 표에 들어갈 수 있는 값의 전체 목록이 아니다 — 서버가 스스로 `db.rpc("v2_feature_log", …)` 를 부르는 값(예: 오늘의 찬양 `song`)은 여기를 안 지난다)

## 테이블
`users`(교구·목장·이름 등 identity_key), `verses`(주간 암송구절, url=설교영상, `text_en`/`ref_en`=영어 NIV 본문·출처), `progress`(구절별 단계), `challenge_log`(암송/도전 로그, mode=learn-*), `reviews`(간격반복 복습), `push_subscriptions`·`push_log`(Web Push), `board_posts`·`board_replies`(게시판), `rank_cheers`(순위 응원 — 대상·보낸이·날짜가 기본키라 하루 한 번, 기간 집계는 cheer_date로), `pilsa_orders`(필사 노트 신청 — 한 건이 한 행, 최근 1건만 화면에 노출, notified_at으로 준비완료 알림 중복 방지), `feature_log`(열람 기록 — 2026-09-23. 기본키 `(user_id, day, feature, item)` 라 **하루에 한 항목은 한 행이고 다시 봐도 `cnt` 만 오른다**(`blessing_log` 를 일반화한 모양). `day` 는 한국 시간 기준, `item` 은 기능마다 뜻이 다르다. ⚠️ **여러 세션·여러 기능이 함께 쓰는 공용 표**라 `feature` 값이 계속 는다 — 지금 값은 `select distinct feature from public.feature_log` 로 보고, 값을 늘렸으면 `supabase/feature_log.sql` 머리의 「item 의 뜻」 표도 그 자리에서 함께 고친다. ⚠️ `feature` 에 DB CHECK 를 **일부러 안 걸었다**(허용 목록이 세 곳이 되면 앱은 보내는데 저장만 조용히 막힌다). 보는 법은 `supabase/feature_log.sql`·`psalm_metrics.sql`, 설계는 `docs/superpowers/specs/2026-09-23-feature-log-design.md`)

⚠️ **`verses` 에는 `updated_at` 도 `url` 도 없다**(2026-09-11에 두 번 헛질의를 했다). 실제 칸은
`no, week, ref, text, sermon_title, sermon_url, is_active, created_at, date, ref_short, ref_full, hint, pastor, text_en, ref_en, track, day_no, frame_art`.

## 시크릿
ADMIN_SECRET(관리자 비번, 3앱 공통), MINISTRY_SECRET(사역신청 담당자 암호 — 사역 관리 액션 넷만 통과, docs/notes/ministry-2027.md), VAPID_*(Web Push), RESEND_API_KEY·REPORT_FROM·REPORT_RECIPIENTS(주간 리포트 메일), ANTHROPIC_API_KEY(NIV 생성 등 AI 공용), TELEGRAM_*(모니터 경보)

## 통계 RPC
`stats-rpc.sql`: v2_stats·v2_participants(security definer, PII 반환→service_role만 grant)

## 집계표 (`daily-activity.sql`, 2026-08-15)
`daily_activity(day,user_id,mode,cnt)` — `challenge_log`에 INSERT·DELETE 트리거로 동기화(앱이 아니라 DB가 지킨다). `ranking`·`guRanking`·`mydays`가 로그 대신 이 표를 읽는다(`v2_ranking`·`v2_gu_ranking`·`v2_mydays`, 실패 시 `*Slow`로 폴백). **전체 기간 2,903ms → 516ms.** 로그 11,052행 = 집계 579행이고, 로그는 총 횟수만큼 늘지만 집계표는 참여자×활동일수만큼만 는다. `monitor`가 `v2_activity_drift()`로 매일 로그 행수 vs 집계 합계를 대조해 어긋나면 경보 — 틀어지면 백필(3번 블록)을 다시 실행하면 된다. 구절별 통계(`verseStats`·`verseCounts`)는 verse_no가 필요해 로그에 남는다.
