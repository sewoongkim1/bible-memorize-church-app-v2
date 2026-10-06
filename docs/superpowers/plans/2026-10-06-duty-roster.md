# 봉사 당번 — 만드는 계획 (2026-10-06)

> 설계 `docs/superpowers/specs/2026-10-06-duty-roster-design.md`(친구 결정 §0 · 검토 반영 §0-1). 틀은 교육신청(`docs/notes/education.md`)을 따른다.
> 한 사람이 차례로 만든다. 읽기만 하는 조사·검토는 여러 갈래로 돌리되 **파일을 고치는 것은 한 사람**이다. 과제가 끝날 때마다 아래 칸에 표시하고 커밋 번호를 적는다.

**목표:** 담당자가 자리 틀을 만들고, 성도님이 앱에서 지원하고, 담당자 확정(또는 전날 저녁 7시) 뒤로는 담당자만 고치는 봉사 당번.

**얼개:** 정원·겹침·잠금·쉼은 SQL 함수 한 곳(`supabase/duty.sql`) → 교회 어드민 함수(담당자)와 성경암송 `api`(성도님)가 같은 함수를 부른다 → 화면은 서버가 준 판정을 보여 주기만 한다.

## 작업 폴더

| 저장소 | 폴더 | 가지 | 올리는 명령 |
|---|---|---|---|
| 성경암송(코드·SQL) | `C:\Projects\v2-duty` | `duty-roster` | 운영 반영 때만 `git push origin duty-roster:main` |
| 성경암송(문서) | `C:\Projects\v2-mh-merge` | `mh-merge` | `git push origin mh-merge:main`(문서만) |
| 교회 어드민 | `C:\Projects\church-admin-duty` | `duty-roster` | 운영 반영 때만 `git push origin duty-roster:main`(= 화면 운영) |

## 지켜야 할 것(모든 과제에)

- 개발(`ktpwthwqzgcqcrmsafdo`) 먼저, 그다음 운영(`xnomlgydifiqiybervtf`). Supabase CLI 는 저장소 밖 스크래치 폴더 link 로만 · `-f` 는 절대 경로 · users 수로 어느 쪽인지 확인(개발 60 남짓 · 운영 400 넘음).
- 새 표·함수·시퀀스는 그 자리에서 RLS + `public`·`anon`·`authenticated` revoke. `TO authenticated` 금지. 파일 끝 확인 질의에 권한 0. 운영에 올린 뒤 `check-authenticated-exposure.sql` 0줄.
- 상태를 바꾸는 것은 SQL 함수만(`duty_signups` 에 직접 쓰지 않는다 — 메모도 `duty_note_set`). 잠금 차례: ⓪ 전역 advisory(7240910 — 지원 줄을 쓰는 함수 모두 · 맨 먼저) → ① 사람 advisory(7240911) → ② 날짜 줄 → ③ 자리 줄 → ④ 지원 줄. 날짜 줄·자리를 **만드는** 일은 당번 advisory(7240912)를 맨 먼저(검토 반영 — `docs/notes/duty-roster.md` 「함정」).
- 응답·기록에 `user_id`·`ident_key`·교인ID·`auth_user_id`·`confirmed_by` 를 싣지 않는다. 기록은 id·수만.
- 함수 배포 앞뒤로 내려받아 대조(개발도 운영도). `api` 는 origin/main 을 합친 트리에서만(얼림 `EVT_MOVED` 가 든 판).
- 당번 코드는 운영 SQL·api 가 올라간 뒤에만 main 에. 푸시 전에 `python tools/preflight.py`(두 저장소 모두).
- 공용 파일(`app.js`·`style.css`·`index.html`·`api/index.ts`·`member_merge.sql`·교회 어드민 `index.ts`·`authz.ts`·`registry.js`·`audit.js`·`server.dev.test.mjs`)은 다른 세션도 고친다 — 고치기 전에 fetch·rebase, 내 헝크만 담고 `git show --stat` 으로 확인. `git add -A`·stash 금지.
- 교회 어드민 화면: 고르기·날짜·시각은 `picker.js` 만 · 확인 `dialog` · 입력 창 `openForm` · 저장 중 `busy()` · 서버 글자는 `esc` · 이벤트는 이 화면의 `el` 에만 · PC 규칙은 `@media (min-width:1024px)` 안.
- 성도님 문구는 해요체 · 「removed」 같은 담당자 말을 쓰지 않는다 · 요일은 (일).
- 플레이 심사 중에는 개인정보 방침·공지에 손대지 않는다(4단계). 게이트 `dutyOpen` 을 켜지 않는다.
- 운영에서 `tests/*.dev.*`·PROBE 를 돌리지 않는다. 내가 띄운 서버·브라우저만 끈다(PID 로).

## 1단계 — 표·SQL 함수 · 담당자 화면

- [x] **1-1. `supabase/duty.sql`**(성경암송) — 표 여섯 · 함수(설계 §4) · 파일 끝 확인 질의
  - `supabase/tests/duty_rules.dev.sql`(지원 검사 차례 · 되살림 · 잠금 · 쉼 · 틀 고치기 · 옮기기 · 응답에 `user_id` 낱말 없음)
  - `tests/duty-concurrency.dev.sh`(정원 20건 → 2 · 같은 분 겹치는 두 자리 → 1 · 확정 ↔ 취소)
  - `tests/duty-sql.test.cjs`(함수마다 revoke · `to authenticated` 없음 · 시퀀스 revoke) + `tools/preflight.py` `PURE_TESTS`
  - 끝: 개발 확인 질의 수가 맞고 시험 「통과」
- [x] **1-2. 기록 합치기** — `supabase/member_merge.sql` 여덟 자리 · `supabase/tests/member_merge_duty.dev.sql` · `js/admin-members.js` 오류 말(`merge-duty-conflict`)
  - 끝: `node --test tests/member-merge-coverage.test.cjs` 통과 · 개발에 `member_merge.sql` 다시 + 합치기 시험 넷 통과 · preflight 통과
- [x] **1-3. 교회 어드민 SQL 015** — 역할 `duty`·`dutylead` + `duty_board_staff`
  - 끝: 개발 확인 질의(라벨 둘 · RLS · 권한 false)
- [x] **1-4. 교회 어드민 서버** — `duty-rules.ts`(검사·칸 지도·엑셀 줄 · 순수) · `duty-db.ts`(`makeDuty(db, audit, deps)` — `mayTouch`·줄에서 당번 읽기) · `index.ts` case·deps · `authz.ts`
  - 시험: `tests/duty-rules.test.mjs` · `tests/duty-db.test.mjs`(가짜 db — 맡은 당번 · 줄 번호 IDOR · `chief-only` · 응답 칸) · `tests/authz.test.mjs`(역할 목록 · 배열 거르기 좁히기 · 당번 블록) · `tests/server.dev.test.mjs` PROBE · `tests/duty.dev.test.mjs`
  - `js/menus/system/audit.js` 이름표(`duty.*` · `people.lookup` from `duty`) + `tests/audit.test.mjs`
  - 끝: Node 시험 통과 · 개발 배포(내려받아 대조) · 개발 시험 통과
- [x] **1-5. 화면 🧰 당번 관리** — `js/menus/duty/boards.js` + `boards-logic.js` + 시험 · `registry.js`(묶음 「봉사 당번」 · `GROUP_ICON`) · `tests/registry.test.mjs`·`home-view.test.mjs`·`be-history-logic.test.mjs`(묶음 차례) · `css/admin.css`(`.dty-*`)
- [x] **1-6. 화면 📅 당번 명단** — `js/menus/duty/roster.js` + `roster-logic.js` + 시험 — 날짜 칩 · 그날 판 · 넣기(명부·직접)·빼기·옮기기·메모 · 확정·풀기 · 쉬는 날·기간 · 자리 틀 창 · 날짜 더하기 · 당번 설정 · 엑셀
  - 끝(1-5·1-6): logic 시험 통과 · 가짜 call 하네스로 390px·1100px 눈 확인 · `<select>`·`type=date|time` grep 0 · preflight 통과
- [x] **1-7. 검토** — 여러 관점 읽기 전용 검토 → 고침
- [x] **1-8. 운영 반영** — 성경암송 `duty.sql` → `member_merge.sql` 다시 → 노출 점검 0줄 · 공개 키로 `rpc/duty_apply`·`duty_signups` 가 안 열림 → 교회 어드민 015 → 교회 어드민 함수(내려받아 대조) → 교회 어드민 푸시 → 화면 파일 200 · 성경암송 SQL 커밋 푸시
- [x] **1-9. 문서** — 교회 어드민 `CLAUDE.md` 「봉사 당번」 절 · 성경암송 `docs/notes/duty-roster.md`(새) · `CLAUDE.md` 지도 한 줄·다음 작업 · `docs/notes/backend-api.md`

## 2단계 — 성도님 앱

- [ ] **2-1. `api` 성도님 액션** — `dutyGate` · `dutyList`·`dutyBoard`·`dutyApply`·`dutyCancel`·`dutyMine`·`dutyAsk` · `PUBLIC_CONFIG_KEYS`(`dutyOpen`) · `FEATURES`(`duty`) + `feature_log.sql` 머리 표 · `js/api.js`
  - `tests/duty-smoke.sh`(읽기·거절만 · 문 셋 · 응답에 `user_id` 없음) · `tests/duty-e2e.dev.sh`
- [ ] **2-2. 앱 화면** — `js/duty.js`(순수 구간 + 화면) · `index.html` script · `tools/bump.py` `TAGGED` · `tests/duty-front.test.cjs` + `PURE_TESTS` · `app.js`(게이트 · 첫 화면 「교회」 묶음 단추 · 제목 조건 · NEW 건너뛰기 · 로그아웃 때 지울 것) · `style.css`(`.duty-*` + 어두운 모드)
  - 끝: 순수 시험·preflight 통과 · 로컬에서 시험 참여자 계정으로 끝까지 · 비참여자는 단추 없음 · 390·360·어두운 모드
- [ ] **2-3. 담당자 화면 보탬** — 「못 온다고 알림」 표시(1단계 명단이 이미 읽는다 — 눈 확인)
- [ ] **2-4. 검토 → 고침**
- [ ] **2-5. 운영 반영** — (SQL 바뀐 것) → `api`(내려받아 대조) → 스모크(내 것 + 이벤트·교육 경로) → bump → preflight → 푸시 → 라이브 `APP_BUILD`·새 표식 확인
- [ ] **2-6. 문서**

## 3단계 — 알림

- [ ] **3-1.** `api` `dutyNotifySend`(문 · 한 번만 · 기기 · `push_log`) · 글 순수 함수 + 시험 · `internalDutyNotify`·`internalDutyRemind` · 잠긴 날 앱 지원 알림
- [ ] **3-2.** 교회 어드민 `withNotify`(확정 · 넣음·옮김·뺌 · 쉬는 날) — 저장·기록 뒤 · 실패해도 저장은 성공
- [ ] **3-3.** 앱 딥링크 `/?duty=1`(교육 줄 뒤에) · 열린 창 메시지
- [ ] **3-4.** `supabase/duty_remind_cron.sql`(전날 19:00 · Vault · 주소 자리표) · `tests/duty-notify.dev.sh`
- [ ] **3-5.** 검토 → 운영(SQL → `api` → 교회 어드민 → bump → 크론) → 다음 날 `cron.job_run_details`·`push_log` 확인 → 문서

## 4단계 — 공개 (플레이 심사 뒤 · 친구 확인)

- [ ] 방침: 성경암송 세 곳(같은 커밋 · `PRIVACY_ITEMS`) + 교회 어드민 `privacy.html` · 보관 기간 결정
- [ ] `FEAT_SINCE.duty` · `dutyOpen` 켜기 · 시험 당번 보관 · 진짜 당번 열기

## 진행 기록

| 과제 | 상태 | 커밋 |
|---|---|---|
| 설계 · 계획 | 끝 | 이 저장소 문서 |
| 1-1 · 1-2 표·SQL 함수 · 기록 합치기 | 끝(2026-10-06 · 개발·운영) | 성경암송 2d5e5a2 … 42ce157 |
| 1-3 · 1-4 교회 어드민 역할·담당 표 · 서버 | 끝 | 교회 어드민 9615d41 … 2ab7e5d |
| 1-5 · 1-6 화면 🧰 당번 관리 · 📅 당번 명단 | 끝 | 교회 어드민 ee12d96 … 2ab7e5d |
| 1-7 검토 | 두 번(아홉 갈래 → 고침 → 수정분만 일곱 갈래 → 고침) — 코드에 치명적·높음 없음 · 운영 절차 지적 넷(「무엇이 올라갔나」를 증명하는 확인)은 반영 차례에 넣었다 | 성경암송 1f0dc54 · 42ce157 / 교회 어드민 755fef8 · 2ab7e5d |
| 1-8 운영 반영 | 끝(2026-10-06) — 차례·확인·되돌리기는 `docs/notes/duty-roster.md` 끝 절 | — |
| 1-9 문서 | 끝 | 이 커밋 · 교회 어드민 `CLAUDE.md` 「봉사 당번」 절 |
| 2단계 | 초안(api 성도님 액션 — 작업 트리 · 화면·시험은 세션 스크래치) | — |
