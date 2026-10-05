# 교육신청 3단계 — 수료 판정 · 수료증 · 진위 확인 (2026-10-05)

> 설계 `docs/superpowers/specs/2026-10-05-education-courses-design.md` §5(`completed`·`cert_no`·`edu_cert_seq`·`edu_issue_certs`)·§6 수료·§11 3단계. 1·2단계(신청·담당자·출석부)는 운영 중(게이트 닫힘).

## 친구 결정 (2026-10-05)

| 무엇 | 정함 |
|---|---|
| 수료번호 | **`고척-YYYY-NNNN`** — 수료한 해(KST) · 그 해 모든 강좌가 한 줄 차례 · 한 번 쓴 번호는 다시 쓰지 않는다(취소해도) |
| 발급 명의·직인 | 교회 어드민 **「수료증 설정」**(교육 총괄만)에서 발급 명의(예 「고척교회 담임목사 ○○○」)·문안을 적고 **직인·서명 이미지**를 올린다 — 없어도 인쇄된다 |
| 수료 확정 | **교육 총괄 + 그 강좌 교육 담당**(manager 줄) · 강사는 출석만 |
| 성도님 앱 | 「내 강좌」에 수료 표시 · **「수료증 보기」 → 그림으로 보고 저장·공유** · **진위 확인 페이지**(`gocheok.onlybible.kr/cert/?no=…`) |
| 수료 기준(1단계에서 정함) | 출석률 ≥ 강좌 `attend_pct` **그리고** `check_label` 이 있으면 담당자 확인 체크 · 화면이 후보를 고르고 **사람이 확정**(자동 없음) |

## 데이터 (v2 `supabase/edu.sql` — 다시 돌려도 안전)

- `edu_enrollments` 에 칸(없으면): `check_done bool default false` · `completed bool default false` · `completed_at timestamptz` · `cert_no text unique` · `cert_revoked bool default false`.
- `edu_cert_seq(year int pk, last int not null)` — 번호 차례(행 잠금으로 겹치지 않게).
- `edu_cert_settings(id int pk default 1 check (id=1), issuer text, body text, seal text(이미지 data URL · PNG/JPEG · 300KB 이하), updated_at)` — 한 줄. **스토리지를 쓰지 않는다**(공개 버킷 정책 사고를 피하려고 · 내 수료증 응답에만 실어 보낸다).
- 함수(모두 `security definer` · service_role 만 · 강좌 줄 먼저 잠금):
  - `edu_check_set(p_enrollment, p_done)` — 확인 항목 체크(확정자만 · 마친 강좌도 됨 — 수료 판정은 끝난 뒤에 하므로).
  - `edu_issue_certs(p_course, p_ids bigint[], p_by uuid)` — 확정자만 · 수료 처리 + 번호(이미 번호가 있으면 그대로 · 취소됐던 줄은 `cert_revoked=false` 로 되살리고 번호 그대로) · 번호는 `edu_cert_seq` 의 그 해 줄을 `for update` 해 차례로 · 고른 차례는 이름(가나다)순.
  - `edu_revoke_cert(p_enrollment, p_by)` — `completed=false`·`cert_revoked=true`(번호는 남김 · 진위 확인에 「취소됨」).
- ⚠️ **번호는 SQL 한 곳**에서만 만든다 · 동시 확정이 같은 번호를 받지 않는다(개발 시험).
- 기록 합치기: 새 칸은 `edu_enrollments` 줄에 붙어 있어 따라간다 — 합치기 겹침 규칙에 「수료(번호 있음)인 취소 줄」은 없다(수료는 확정자만) · `member-merge-coverage` 초록 유지.

## 교회 어드민

- 액션(역할 `["education","educourse"]` · 교육 담당은 manager 줄 · 강사 아님):
  - `eduCertList({course_id})` → 확정자마다 `{id, name, who, attend{…, pct}, checkDone, candidate, completed, certNo, revoked}` + 강좌(`attendPct`·`checkLabel`) — 후보 = 출석률 기준 + 확인 체크
  - `eduCheckSet({enrollment_id, done})` · `eduCertIssue({course_id, enrollment_ids})` → `{ok, issued:[{id, certNo}]}` · `eduCertRevoke({enrollment_id})`
  - `eduCertPrint({course_id})` → 수료자 전원 인쇄 자료 + 설정(명의·문안·직인)
  - `eduCertSettings()` · `eduCertSettingsSave({issuer, body, seal|null})` — **총괄만** · 이미지 형식·크기 검사
  - 기록 `edu.cert.issue`(id·수) · `edu.cert.revoke` · `edu.cert.settings`(바뀐 칸 이름만) · 세 곳 규칙
- 화면 메뉴 **「🎓 수료」**(묶음 교육 · 역할 둘): 강좌 고르기 → 표(이름·출석률·확인 체크·후보 표시·수료 번호) → 「후보 N분 수료 확정」(확인 창) · 한 분씩 확정·취소 · 「수료증 인쇄」(A4 가로 · 한 장에 한 분 · 브라우저 인쇄) · 총괄에게만 「수료증 설정」(명의·문안·직인 올리기 · 미리보기).
- 수료증 템플릿 **한 곳**(교회 어드민 인쇄 · 앱 그림이 같은 칸·같은 문안): 교회 로고 · 「수 료 증」 · 이름 · 과정(제목)·학기 · 기간(교육 시작~종료 또는 회차) · 문안(기본: 「위 사람은 고척교회가 주관한 「{과정}」 과정을 성실히 마쳤기에 이 증서를 드립니다.」) · 수료번호 · 발급일 · 발급 명의 · 직인.

## 성도님 앱 (v2)

- `api`: `eduMine`·`eduCourse` 의 내 줄에 `completed`·`certNo`(취소 안 된 때만) · **`eduCert({enrollment_id, user_id})`** → 내 줄·수료·안 취소일 때만 수료증 자료(이름·과정·학기·기간·번호·발급일·명의·문안·직인) · **`eduVerify({no})`**(로그인 없이) → `{valid, revoked, title, term, completedOn, name: 가린 이름(김*웅)}` — 번호가 정확할 때만 · 목록·검색 없음 · `user_id`·소속 없음.
- 「내 강좌」 카드 「🎓 수료 · 고척-2026-0001」 · 자세히에 「수료증 보기」.
- 수료증 화면: **캔버스에 그려** 이미지로 보여 주고 「저장·공유」 — `navigator.share({files})` 되는 곳은 공유 시트, 아니면 내려받기, 그것도 안 되면 「그림을 길게 눌러 저장」 안내. ⚠️ 아이폰 앱(WKWebView)·플레이 앱(TWA)에서 되는지 실기기 확인은 친구 몫(목록에 적는다).
- 진위 확인 페이지 `cert/index.html`(로그인 없이 · 번호 칸 + 결과) — 응답의 가린 이름·과정·학기·수료일만.

## 밖에 두는 것(나중)

- 교인명부 「🎓 교육 이력」 탭 · 📊 교육 통계 · 알림(4단계).
- 개인정보 안내(수료번호·진위 확인 페이지 포함)는 과제 11(플레이 심사 뒤 · 공개 전).

## 시험·반영

- 개발 SQL 시험 `edu_certs.dev.sql`: 번호 꼴·차례·해 넘김 · 동시 확정에 겹침 없음 · 이미 번호 있으면 그대로 · 취소 뒤 되살리면 같은 번호 · 확정자 아닌 줄 거절 · 확인 체크.
- 교회 어드민 개발 시나리오: 강사는 수료 액션 `forbidden` · 다른 강좌 교육 담당은 `not-assigned` · 총괄만 설정.
- 화면 눈 확인(390·1920 · 인쇄 미리보기 A4 가로) · 앱 수료증 그림 · 진위 확인 페이지.
- 운영: v2 SQL → 교회 어드민 함수 → 화면 → v2 api → bump(+ `cert/` 새 폴더가 배포에 들어가는지 확인).
