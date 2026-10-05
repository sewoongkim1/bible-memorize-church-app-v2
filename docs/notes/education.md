# 교육신청 (2026-10-05 · 1단계 운영 · 게이트 닫힘)

> **언제 읽나:** 앱 🎓 교육(`js/edu.js` · `eduVisible()`) · `api` `eduList`·`eduCourse`·`eduApply`·`eduCancel`·`eduMine` · `supabase/edu.sql` · 교회 어드민 📚 강좌 관리·📝 신청 현황(`edu-db.ts`·`edu-rules.ts`·`js/menus/education/`)을 손볼 때
> 설계 `docs/superpowers/specs/2026-10-05-education-courses-design.md` · 계획 `docs/superpowers/plans/2026-10-05-education-stage1.md`(과제 10 운영 순서 · 과제 11 공개 전)

**지금 상태(2026-10-05):** 1단계(강좌·신청·대기·취소·대신 등록·엑셀) 운영 반영 · `eduOpen` 없음 → 🧪 시험 참여자만 웹·아이폰에서 🎓 · 플레이 앱은 숨김. 출석(2단계)·수료증(3단계)·알림(4단계)은 아직.

- **정원·대기·취소 마감 규칙은 SQL 한 곳(`supabase/edu.sql`).** `edu_apply`·`edu_cancel`·`edu_staff_set`·`edu_course_refill` 만 상태를 바꾼다 — 두 앱의 서버·화면에서 `status` 를 직접 쓰지 말 것. 모두 **강좌 줄을 먼저 잠그고**(for update) 그다음 신청 줄 — 새 함수도 이 순서를 지킬 것.
- **「반려 유지」(친구 결정):** 반려된 분이 앱에서 다시 눌러도 반려 그대로(`{status:'declined', already:true}` → 「이 강좌는 담당자에게 말씀해 주세요」). 되살리는 것은 담당자만 — 신청 현황 「다시 받기」, 또는 대신 등록에서 `was-declined` → 확인 → `force`.
- **정원을 늘리면 `edu_course_refill`** — 선착순 강좌에서 자리가 생기는 저장(정원 늘림·제한 없앰·승인→선착순)일 때만 대기자를 차례로 올린다. 제목만 고치는 저장에는 안 부른다(담당자가 일부러 대기에 둔 분을 올리지 않으려고). 그 호출이 실패하면 다시 저장해도 안 올라간다 — 신청 현황에서 손으로 확정.
- **교육 기간 `starts_on`·`ends_on`(2026-10-05 · 신청 기간 `apply_from/to` 와 별개 · 비어도 됨).** 목록·상세 날짜(`firstDate`/`lastDate`)는 기간을 먼저, 없으면 회차에서. ⚠️ **취소 마감의 첫 날 = `coalesce(첫 회차 날, starts_on)`** — SQL `edu_cancel` 과 api `eduMineOut`(`cancelUntil`/`canCancel`) 두 곳이 같아야 한다. 시험 `supabase/tests/edu_period.dev.sql`.
- **수는 `edu_course_counts(uuid[])` RPC 로만** — 신청 줄을 받아 세지 말 것(PostgREST 가 1,000줄에서 조용히 자른다). 명단·엑셀은 `allRows`/`fetchAllRows` 쪽 넘기기.
- **응답에 `user_id`·`ident_key`·교인ID 를 싣지 않는다.** 대신 등록(명부)은 화면이 `{name, pick, check:{who_type, group, sub, church_mok, position}}` 를 보내고 서버가 **같은 찾기를 다시 돌려** 맞춘다(틀리면 `changed`). 명부 줄의 신원 키는 `person|<교인ID>`(서버 안에서만).
- **같은 분 두 자리(알려진 구멍 · 공개 전에 막을 것):** 대신 등록한 줄(`user_id` 없음)과 그분이 나중에 앱으로 낸 줄이 따로 정원을 차지하고 반려도 비켜 간다 · 앱 「내 강좌」에 대신 등록 줄이 안 보인다. 1단계는 신청 현황에 **「같은 분일 수 있어요」** 표시만(살아 있는 줄 가운데 이름이 같고 앱/담당자가 섞인 묶음) → 담당자가 한 줄 취소. 근본(앱 계정과 잇기)은 계획 과제 11 Step 2-1.
- **게이트:** 서버 `eduGateOpen` = `app_config.eduOpen === true` 또는 🧪 `ministryTesters`. 앱 `eduVisible()` = `ministryHiddenOnPlay()` 면 false → `eduOpenCached()`(같은 `=== true`) 또는 시험 참여자. ⚠️ **`MINISTRY_HIDE_ON_PLAY` 를 false 로 돌리는 날 플레이 앱 시험 참여자에게도 🎓 가 열린다** — 그 전에 교육 개인정보 문구(과제 11).
- ⚠️ **`eduOpen` 을 켜기 전에(과제 11):** 개인정보 안내 세 곳(`privacy/`·앱 안 두 화면 — 같은 커밋) + 교회 어드민 `privacy.html`(교육 역할이 명부를 이름으로 찾는 것도) · `FEAT_SINCE.edu` · 같은 분 잇기. 플레이 심사 중에는 방침에 손대지 않는다.
- **기록 합치기:** `edu_enrollments` 는 `member_merge.sql` 네 곳(옮기기·허용 목록·기록 수·트리거)에 들어 있다. 같은 강좌에 양쪽이 살아 있거나 반려면 `merge-edu-conflict` 로 멈추고, 취소 줄만 지운다(납부·메모는 남는 줄로 옮김 · 500자). edu 표를 다시 만들면 `member_merge.sql` 을 다시 돌린다.
- ⚠️ **`tools/bump.py` 의 `TAGGED` 에 `js/edu.js`** — 빠지면 판을 올릴 때 태그가 엇갈려 preflight 가 막고 **모든 세션의 배포가 멈춘다.** preflight `[2-1]` 이 index.html 과 맞대 본다.
- **지우는 길은 없다** — `edu_enrollments.course_id` 가 `on delete restrict`. 시험 강좌는 `archived` 로. 개발에서 지울 땐 신청 → 회차 → 강좌 순.
- **열람 기록** `feature_log` 값 `edu`(서버 `FEATURES` 에 있다).

## 시험

- 개발 SQL: `supabase/tests/edu_apply.dev.sql` · `edu_counts_sessions.dev.sql` · `member_merge_edu.dev.sql` · 정원 늘리기 시험(모두 `users > 200` 이면 멈춤 · ROLLBACK).
- 개발 끝까지: `tests/edu-e2e.dev.sh`(eduOpen 을 잠깐 켜고 trap 으로 되돌림 · 강좌를 만들고 지운다) · 스모크 `tests/edu-smoke.sh`(`EVT_ENV=prod` 는 읽기·거절만).
- 앱 순수 함수 `tests/edu-front.test.cjs`(preflight 가 돌린다) · 교회 어드민 `tests/edu-*.test.mjs`(그쪽 preflight).
- 두 앱 통시험(담당자 계정을 개발에 만들어 church-admin 액션까지)은 2026-10-05 한 번(22/0) — 스크립트는 커밋 안 함.
