# 교육신청 2단계 — 출석부 (2026-10-05)

> 설계 `docs/superpowers/specs/2026-10-05-education-courses-design.md` §4·§5(`edu_attendance`)·§11 2단계. 1단계는 운영 중(게이트 닫힘).
> 계기: 친구가 만든 실제 강좌 「구원론 3차」 첫 회차가 **10/25** — 1월 계획을 앞당긴다(친구 「2단계 진행」).

## 친구 결정 (2026-10-05)

| 무엇 | 정함 |
|---|---|
| 출석률 | **지각 = 출석 · 공결 = 전체 회차에서 뺀다.** 출석률 = (출석+지각) ÷ (체크한 회차 − 공결). 아직 체크 안 한 회차는 분모에 넣지 않는다(진행 중 강좌가 낮게 보이지 않게). |
| 성도님 앱 | **보여 준다** — 「내 강좌」·강좌 자세히에 「출석 5/7 · 86%」와 회차별 표시. |
| 누가 체크 | 새 역할 **「강사」(`teacher`)** — 강좌마다 지정(맡은 강좌만 · 서버가 막음). 교육 총괄·교육 담당(그 강좌)도 체크할 수 있다. |
| QR 자가 출석 | 하지 않는다(처음 결정 그대로). |

## 데이터

- **v2 `supabase/edu.sql`** — `edu_attendance(enrollment_id bigint → edu_enrollments on delete cascade, session_id bigint → edu_sessions on delete restrict, state text check in ('present','late','absent','excused'), marked_by uuid null(교회 어드민 담당자 id · 응답에 싣지 않음), marked_at timestamptz default now(), primary key(enrollment_id, session_id))` · RLS · anon/authenticated revoke · service_role 만 · 다시 돌려도 안전.
  - 같은 강좌의 회차·신청이어야 한다 — 쓰는 함수가 확인(아래).
  - ⚠️ `edu_sessions_replace` 가 **출석이 있는 회차를 지우려 하면 `has-attendance` 로 거절**한다(지금은 목록에 없는 회차를 지운다 — 출석이 함께 사라지면 안 된다). 회차 날짜·시각·주제 고치기는 그대로 된다(id 보존).
  - `edu_attendance_set(p_session bigint, p_enrollment bigint, p_state text, p_by uuid)` — 강좌 줄 잠금 → 회차와 신청이 같은 강좌인지 · 신청이 `confirmed` 인지(아니면 `not-confirmed`) · `p_state` null 이면 그 칸 지움 · 끝난·보관 강좌 `course-closed`.
  - `edu_attendance_bulk(p_session, p_state, p_by)` — 그 회차에서 **아직 체크 안 한** 확정자 모두를 `p_state` 로(「남은 분 모두 출석」).
  - 출석률 계산은 순수 함수 한 곳에 두고(두 앱이 같은 규칙) 시험으로 묶는다: `eduAttendRate({present, late, absent, excused})` → `{attended, denom, pct}`(denom 0 이면 pct null).
- **교회 어드민 SQL 012** — 역할 `teacher` 「강사」(「맡은 강좌의 출석부」) · `edu_course_staff.kind = 'teacher'` 를 쓴다(1단계에서 만든 표 그대로).
- 기록 합치기: `edu_attendance` 는 `user_id` 가 없다(신청 줄을 따라간다) → `member_merge.sql` 네 곳 대상 아님. 다만 합치기가 **취소 겹침 줄을 지울 때** 그 줄의 출석이 cascade 로 사라진다 — 취소 줄엔 출석이 없어야 정상이나, 있으면 합치기를 멈추게(`merge-edu-conflict`) 할지 확인할 것.

## 교회 어드민(서버)

- 액션(역할 `["education","educourse","teacher"]` · 강좌 확인: 총괄 전부 · 교육 담당 = manager 줄 · 강사 = teacher 줄):
  - `eduAttendCourses()` → 내가 체크할 수 있는 강좌(진행 중·모집 중 먼저)
  - `eduAttendSessions({course_id})` → 회차 + 회차마다 체크한 수/확정 수 · 「오늘·다음 회차」 표시용
  - `eduAttendSheet({course_id, session_id})` → 확정자 명단(이름·소속 · `user_id`·`ident_key` 없음) + 그 회차 상태
  - `eduAttendSet({session_id, enrollment_id, state|null})` · `eduAttendBulk({session_id, state})`
  - `eduAttendSummary({course_id})` → 사람마다 `{present, late, absent, excused, pct}` + 회차별 칸(쪽 넘기기 · 1,000줄 함정)
  - `eduAttendExport({course_id})` → 엑셀 줄(이름·소속·회차별 ○/지/결/공·출석률)
  - `eduStaffSet`·`eduStaffCandidates` 에 `kind`(`manager`|`teacher`) — 강사 후보 = `teacher` 역할(또는 총괄·교육 담당).
  - 강사는 신청 현황 액션(`eduEnrollList` 등)을 **못 부른다**(ACTION_ROLES 에 넣지 않는다).
- 세 곳 규칙: ACTION_ROLES · index.ts case · server.dev PROBE · audit.js 이름표(`edu.attend.set`·`edu.attend.bulk`·`edu.attend.export` — id·수만).

## 교회 어드민(화면)

- 새 메뉴 **「✅ 출석부」**(묶음 「교육」 · 역할 셋): 강좌 고르기 → 회차 고르기(오늘 회차가 있으면 그것, 없으면 다음 회차) → 명단 한 줄에 이름·소속 + **출석·지각·결석·공결** 네 단추(누르면 바로 저장 · 다시 누르면 지움) · 맨 위 「남은 N분 모두 출석」 · 위에 「체크 12/20」 · 폰 한 손으로(단추 높이 44 이상 · 줄 촘촘히).
- 탭 「출석 현황」: 사람마다 출석률(80% 미만은 표시) · 줄을 누르면 회차별 칸 · 「엑셀로 내려받기」.
- 📚 강좌 관리 고치기 창에 「강사(출석부)」 고르기(담당자 칸 아래 · `kind:'teacher'`) · 카드에 「강사 OOO」(계정 기준 · 화면용 `teacher_label` 글과 별개).

## 성도님 앱 (v2)

- `api` `eduMine`·`eduCourse` 의 내 신청에 `attend: {present, late, absent, excused, marked, pct}` · 자세히의 회차마다 `myState`(내 것만).
- 「내 강좌」 카드에 「출석 5/7 · 86%」 · 자세히 「🗓️ 일정」 카드의 회차 줄 오른쪽에 ✅출석·🕘지각·❌결석·🟦공결(체크 전은 빈칸).
- 출석률 규칙은 위 순수 함수와 같은 결과여야 한다(시험).

## 시험·반영

- 개발 SQL 시험(`edu_attendance.dev.sql`): 같은 강좌 검사 · 확정 아닌 분 거절 · 지우기 · 한꺼번에(체크한 분은 안 덮음) · 출석 있는 회차 지우기 거절 · 끝난 강좌 거절.
- 교회 어드민 개발 시나리오: 강사 T 를 강좌 A 에 지정 → T 는 A 출석부만 · B 는 `not-assigned` · 신청 현황은 `forbidden`.
- 화면 눈 확인(390·1920) · 운영: v2 SQL → 교회 어드민 SQL 012 → 교회 어드민 함수 → 화면 → v2 api → bump.
