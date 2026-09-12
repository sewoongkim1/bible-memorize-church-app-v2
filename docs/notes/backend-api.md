# 백엔드 — 액션 · 테이블 · 시크릿 목록

> CLAUDE.md 에서 옮겨 온 상세 기록이다(2026-09-12, 두 겹으로 나눔 — 내용은 한 글자도 안 고쳤다).
> **언제 읽나:** Edge Function `api` 에 액션을 더하거나, 어느 표에 무엇이 들어 있는지 짚어 볼 때
> ⚠️ **원본은 코드다** — `supabase/functions/api/index.ts` 의 `switch` 와 `supabase/schema.sql`.
> 아래 목록은 그것을 사람이 읽기 좋게 적어 둔 것이라 **금세 낡는다.** 다르면 코드가 맞다.

## 액션
authCheck · login · saveProgress · challenge · advanceReview · ranking(응원 수·내 오늘 여부 포함) · rankCheer/rankCheerers(순위 응원 👏) · mydays · stats · participants · verses/getVerses · saveVerse · seedVerses · generateNiv(영어 NIV 본문 AI 생성, DB 저장 없이 반환만) · passageHelp/passageHelpAll(내 안에 거하는 말씀 AI 도우미, 마디당 1회 생성 후 app_config 캐시) · getPassageProgress(마디 진행 기기간 동기화) · cleanupDummy · savePush · removePush · testPush · sendPush(hour/user_id로 대상 좁힘 가능) · weeklyVersePush(매주 주일 08시 KST 전체 발송, 이번주 말씀 없으면 skip — cron: weekly_verse_push_cron.sql) · monitor · weeklyReport · boardList/boardCheck/boardPost/boardReply/boardDeleteMine/boardModerate · pilsaMine/pilsaApply/pilsaCancel(성도) · pilsaList/pilsaSetStatus(관리자, 준비완료 전환 시 해당 성도에게 Web Push 1회)

## 테이블
`users`(교구·목장·이름 등 identity_key), `verses`(주간 암송구절, url=설교영상, `text_en`/`ref_en`=영어 NIV 본문·출처), `progress`(구절별 단계), `challenge_log`(암송/도전 로그, mode=learn-*), `reviews`(간격반복 복습), `push_subscriptions`·`push_log`(Web Push), `board_posts`·`board_replies`(게시판), `rank_cheers`(순위 응원 — 대상·보낸이·날짜가 기본키라 하루 한 번, 기간 집계는 cheer_date로), `pilsa_orders`(필사 노트 신청 — 한 건이 한 행, 최근 1건만 화면에 노출, notified_at으로 준비완료 알림 중복 방지)

⚠️ **`verses` 에는 `updated_at` 도 `url` 도 없다**(2026-09-11에 두 번 헛질의를 했다). 실제 칸은
`no, week, ref, text, sermon_title, sermon_url, is_active, created_at, date, ref_short, ref_full, hint, pastor, text_en, ref_en, track, day_no, frame_art`.

## 시크릿
ADMIN_SECRET(관리자 비번, 3앱 공통), VAPID_*(Web Push), RESEND_API_KEY·REPORT_FROM·REPORT_RECIPIENTS(주간 리포트 메일), ANTHROPIC_API_KEY(NIV 생성 등 AI 공용), TELEGRAM_*(모니터 경보)

## 통계 RPC
`stats-rpc.sql`: v2_stats·v2_participants(security definer, PII 반환→service_role만 grant)

## 집계표 (`daily-activity.sql`, 2026-08-15)
`daily_activity(day,user_id,mode,cnt)` — `challenge_log`에 INSERT·DELETE 트리거로 동기화(앱이 아니라 DB가 지킨다). `ranking`·`guRanking`·`mydays`가 로그 대신 이 표를 읽는다(`v2_ranking`·`v2_gu_ranking`·`v2_mydays`, 실패 시 `*Slow`로 폴백). **전체 기간 2,903ms → 516ms.** 로그 11,052행 = 집계 579행이고, 로그는 총 횟수만큼 늘지만 집계표는 참여자×활동일수만큼만 는다. `monitor`가 `v2_activity_drift()`로 매일 로그 행수 vs 집계 합계를 대조해 어긋나면 경보 — 틀어지면 백필(3번 블록)을 다시 실행하면 된다. 구절별 통계(`verseStats`·`verseCounts`)는 verse_no가 필요해 로그에 남는다.
