# 봉사 당번 (2026-10-06 ~)

식당 설거지처럼 **「날짜 × 예배(조) × 일 × 정원」 자리에 성도님이 지원**하고 담당자가 관리하는 틀. 김장 같은 한 번짜리 모집도 같은 틀로 받는다.
설계 `docs/superpowers/specs/2026-10-06-duty-roster-design.md` · 계획 `docs/superpowers/plans/2026-10-06-duty-roster.md`.

> **지금 어디까지(2026-10-06):** **1단계 운영 반영** — 표·SQL 함수 · 교회 어드민 담당자 화면(🧰 당번 관리 · 📅 당번 명단).
> 성도님 앱 화면(2단계)·알림(3단계)·공개(4단계)는 아직이다. **성도님께는 아무것도 보이지 않는다**(앱에 화면이 없고 문 `dutyOpen` 도 없다).

## 어디에 무엇이 있나

| 무엇 | 어디 |
|---|---|
| 표 6 · SQL 함수 32(규칙 전부) | 이 저장소 `supabase/duty.sql` |
| 기록 합치기(`duty_signups`) | `supabase/member_merge.sql`(여덟 자리) — **`duty.sql` 뒤에 다시 돌린다** |
| 역할 둘(`duty`·`dutylead`) · `duty_board_staff` | 교회 어드민 `supabase/sql/015_duty_roles_staff.sql` |
| 담당자 서버 액션 20개 | 교회 어드민 `supabase/functions/church-admin/duty-db.ts` · `duty-rules.ts` |
| 담당자 화면 🧰 당번 관리 · 📅 당번 명단 | 교회 어드민 `js/menus/duty/` |
| 성도님 api·화면 | (2단계) 이 저장소 `supabase/functions/api/index.ts` · `js/duty.js` |

## 뼈대

**당번(`duty_boards`) → 자리 틀(`duty_lines`) → 날짜(`duty_days`) → 자리(`duty_slots`) → 지원(`duty_signups`)**

- **자리 틀** = 「매주 주일 · 2부 · 설거지 · 11:30~12:30 · 2명」. 요일이 있는 틀은 **자리가 저절로 생긴다**(`duty_ensure_slots` — 읽는 함수들이 먼저 부른다 · 오늘 ~ 오늘+보이는 기간 · 끝 날짜까지). 요일이 없는 틀은 「날짜 더하기」(`duty_date_add` · 자리에 `manual = true`)로만 — 한 번짜리 모집·특별 예배.
- **날짜 줄**은 쉼(`off`)과 확정(`confirmed_at`)을 **따로** 가진다(쉼을 풀어도 확정 여부는 그대로). 날짜 줄을 지우는 길은 없다 — 그래서 만드는 날짜는 모두 **오늘 + 400일 안**(날짜 더하기 · 쉬는 기간 · 메모).
- **지원 줄은 자리·사람에 한 줄**(다시 지원하면 그 줄을 되살린다). 계정 없는 분(담당자가 넣은 새가족·명부의 분)은 `ident_key` 로.
- 당번 상태: `draft` 준비(앱에 안 보임) · `open` 받는 중 · `closed` 지원 멈춤(앱에 명단은 보이고 새 지원만 막음 — **담당자가 넣는 당번**도 이 상태) · `archived` 보관(안 보임 · 쓰기 거절 · 지우는 길은 없다).

## 규칙 (전부 SQL 함수 — 코드에서 표에 직접 쓰지 않는다)

- **잠금은 표에 쓰는 값이 아니다.** `duty_locked` = 담당자가 확정했거나 지금이 그날 **전날 19:00(한국)**을 지났다. 크론이 잠그지 않는다. 「19시」는 `duty_cutoff` 한 곳.
  잠긴 날: 본인은 취소·변경 못 함 · 빈 자리 지원은 받되 `ack_locked` 를 보내야 들어간다(아니면 `locked-day` — 화면을 열어 둔 사이 잠긴 경우도 서버가 잡는다).
  확정은 **자리가 있는 날에만**(`no-slots`) · 풀 것·지울 메모가 없으면 날짜 줄을 만들지 않고 `already`.
- **쉬는 날은 스위치**다 — 지원 줄을 건드리지 않는다. 쉬는 동안 찬 수·겹침·전날 알림에서 빠지고, 다시 열면 그대로 살아난다.
- **끝 날짜(`until_date`)** 뒤의 자리는 앱에 안 보이고 지원도 안 받는다(`after-until`). 자리·줄은 지우지 않는다(늦추면 살아난다). 그 뒤에 선 분 수는 `duty_after_count`.
- **남은 자리**(`duty_leftover` — 뺀 틀의 자리 · 요일을 바꾼 틀의 옛 요일 자리)는 성도님 지원을 받지 않는다(`closed`). 담당자는 넣고 옮길 수 있다.
  요일을 바꾼 틀의 남은 자리는 「날짜 더하기」로 **다시 살린다**(`reopened` — `manual = true` 가 되어 그날만 받는다). `manual` 자리는 요일을 바꿔도 지우지 않는다.
- 담당자가 **뺀** 줄은 본인이 스스로 되살리지 못한다(`removed-by-staff`) · 담당자가 **넣은** 줄은 본인이 스스로 빼지 못한다(`staff-row`) → 「못 가게 됐어요」(`duty_ask`)로 알린다.
  담당자가 잘못 뺀 줄은 `duty_restore` 로 **그 줄 그대로** 되살린다(정원·겹침은 넣기와 같은 규칙 · `p_force`).
- **같은 분**(`duty_same_person`) = 계정이 같다 · 또는 **명부 키(`person|교인ID`)가 같다** · 또는 둘 다 계정이 없고 키가 같다. 명부에서 넣은 줄과 그분의 앱 계정 줄이 따로 놀지 않게 —
  계정 없는 줄로 서 있는 분을 담당자가 계정까지 찾아 다시 넣으면 그 줄에 계정을 잇고 `linked` 로 알린다(「이미 서 계세요」지만 쓴 것이 있다 → 교회 어드민이 기록을 남긴다).
- 겹침 = 같은 분이 같은 날 **시각이 겹치는**(맞닿은 자리는 안 겹침) 다른 자리에 살아 있다. 당번이 달라도 본다. 담당자는 확인 뒤 `force`. 정원 거절(`full`)에도 겹친 자리(`with`)가 함께 온다.
- 정원·겹침·`max_ahead` 는 동시에 눌러도 넘지 않는다(잠금 차례 — 아래).
- 주별 명단(`duty_roster`)의 기간: 끝을 안 주면(담당자 화면) 앞날은 `오늘+보이는 기간` 과 **가장 먼 날짜 줄** 가운데 늦은 쪽(오늘+400일까지), 지난 날은 오늘−400일까지 — **따로 자른다**. 끝을 주면(엑셀) 기간 400일까지(넘으면 앞을 당긴다). 보이는 기간 밖의 날은 `notYet`.

## ⚠️ 함정

- **잠금 차례는 모든 함수가 같다**(교착 막기): ⓪ 전역 advisory `(7240910, 1)` — **지원 줄을 쓰는 함수 모두**(지원·취소·옮기기·되살리기·못 가요·표시 거두기·담당자 메모) → ① 사람 advisory `(7240911, …)`(계정 → 명부 키 차례 · `duty_person_lock`) → ② 날짜 줄 `for update` → ③ 자리 줄 → ④ 지원 줄.
  ⓪ 은 `member_merge.sql` 의 쓰기 연결 트리거가 지원 줄을 쓸 때 어차피 쥐는 잠금이다 — 맨 먼저 잡아 기록 합치기와 같은 차례로 선다.
  ⚠️ **`duty_signups` 에 직접 update 하지 말 것**(메모 한 칸도 `duty_note_set`) — 직접 쓰면 트리거가 「줄 → 전역」 차례로 잠가 위 차례와 뒤집힌다(두 번째 검토에서 잡았다).
- **날짜 줄·자리를 만드는 일은 당번 advisory `(7240912, 당번)` 을 맨 먼저** — `duty_ensure_slots`(만들 것이 있을 때만) · 틀 고치기·빼기 · 날짜 더하기 · 쉬는 기간 · 날짜 메모. 틀·날짜 줄의 `for update` 와 새 자리의 FK 검사가 서로를 기다리지 않게 당번마다 한 줄로 세운다. 여러 당번을 도는 읽기(`duty_list_view`·`duty_board_counts`)는 당번 id 차례로 돈다.
  `tests/duty-sql.test.cjs` 가 두 규칙을 글자로 본다(지원 줄을 쓰는 함수 = 전역 잠금 먼저 · 날짜 줄·자리를 만드는 함수 = 당번 잠금 먼저).
- **`duty.sql` 뒤에 `member_merge.sql` 을 다시 돌린다** — 표가 먼저 있어야 쓰기 연결 트리거가 `duty_signups` 에 붙는다(`member_merge_duty.dev.sql` ⓪ 이 본다). FK 가 `on delete cascade` 라 합치기가 이 표를 모르면 원본 계정을 지울 때 지원 줄이 **조용히** 함께 지워진다.
  ⚠️ `member_merge.sql` 은 **통째로 갈아 끼우는** 파일이다 — 옛 사본(교육·봉사 당번을 모르는 판)을 운영에 돌리면 그 기록이 있는 계정의 합치기가 `merge-unsupported-records` 로 멈춘다(오류·경보 없음). **운영에 돌리기 전에 origin/main 의 것과 같은지** 볼 것.
- **읽는 함수는 jsonb 하나를 돌려준다**(표로 돌려주면 PostgREST 가 1,000줄에서 자른다). `user_id`·`ident_key`·`confirmed_by` 를 싣지 않는다 — `duty_notify_rows`·`duty_remind_rows` 만 받는 분(`uid`)을 싣고, 그것은 api 안에서만 쓴다.
- `pk`(주별 명단의 「같은 분 표식」)는 부를 때마다 바뀌는 소금을 섞은 해시다 — 저장하거나 응답에 그대로 싣지 말 것(교회 어드민이 `maybeDup` 으로 바꾼 뒤 버린다).
- 함수를 더하면 **권한 두 줄**(revoke public·anon·authenticated · grant service_role)과 파일 끝 확인 질의의 기대 수(지금 32)를 함께 — `tests/duty-sql.test.cjs` 가 글자로 본다. **인자 목록을 바꾸면 옛 꼴을 `drop function` 으로 지울 것**(안 지우면 옛 꼴이 권한째 남는다).
- 이름이 **앱을 쓰는 누구에게나** 보인다(친구 결정 「로그인한 분께 보인다」 — 이 앱의 로그인은 본인 확인이 아니다). 그래서 응답에는 이름 글자만(소속·시각 없음 · `duty_name_out` 이 제어·방향 바꿈 글자를 뺀다) · 방침 글은 공개(4단계) 전에.
- 「임명된 분만 지원하는 당번」은 만들지 않았다 — 그런 당번은 `closed`(지원 멈춤)로 두고 담당자가 넣는다(친구께 여쭌 채 진행 · 설계 §0-1 ①).
- `supabase/functions/api/index.ts` 의 성도님 액션(`dutyList`·`dutyBoard`·`dutyApply`·`dutyCancel`·`dutyMine`·`dutyAsk`)은 **2단계**다 — 1단계에서는 `api` 를 배포하지 않았다.

## 시험

| 무엇 | 어떻게 |
|---|---|
| 규칙(개발 DB · BEGIN…ROLLBACK) | `supabase db query --linked -f supabase/tests/duty_rules.dev.sql` → 「통과 — duty_rules」 |
| 동시성(개발 DB · 20명이 2자리 · 겹치는 두 자리 · 확정↔취소) | `WORK=<개발 link 폴더> bash tests/duty-concurrency.dev.sh` |
| 기록 합치기 | `supabase/tests/member_merge_duty.dev.sql` |
| 글자 검사(preflight) | `tests/duty-sql.test.cjs` |
| 담당자 서버(개발 서버 · 16가지) | 교회 어드민 `tests/duty.dev.test.mjs` |

## 운영 반영 차례 (1단계에서 밟은 길 — 다음에 SQL 을 고칠 때도 같다)

단계마다 **같은 link 로** 확인 질의를 돌려 운영임(users 400 넘음)과 들어간 것(표·함수·역할 수 · 합치기가 당번을 아는가 · 쓰기 연결 트리거)을 본다 — 확인 없이 다음으로 가지 않는다.

1. 이 저장소 `supabase/duty.sql`(끝의 확인 질의: tables 6 · functions 32 · 공개 권한 0) → 2. `supabase/member_merge.sql` 다시(운영 정의가 origin/main 판과 같은지 먼저) → **이 저장소 main 푸시**(당번을 아는 `member_merge.sql` 이 일찍 main 에 서게)
→ 3. 교회 어드민 SQL 015 → 4. 노출 점검: 공개 키·로그인 토큰으로 `duty_signups`·`duty_board_staff`·`rpc/duty_apply`(인자 이름을 맞춰)가 **401/403**(404 는 「없다」일 수 있어 통과가 아니다) · 교회 어드민 `check-authenticated-exposure.sql` 0줄
→ 5. 교회 어드민 함수: 빈 폴더에 내려받아 대조(차이가 내 것뿐인지) → `--workdir <그 가지 폴더>` 로 배포 → **다시 내려받아 내 나무와 차이 0**
→ 6. 교회 어드민 main 푸시(화면) — 그 앞에 rebase 가 있었으면 5 를 다시.

**되돌리기**(반영의 거꾸로): 화면 `git revert` 푸시 → 함수는 5 에서 내려받아 둔 옛 판으로 다시 배포 → 015(담당 줄·역할 줄 — 역할을 받은 분이 있으면 그 줄 먼저) → `member_merge.sql` 은 origin/main 옛 판을 다시 → `duty.sql` 은 표를 지워야 하는데 **담당자가 명단을 넣은 뒤에는 지우지 않는다**(앞으로 고치는 것만). 운영 확인은 읽기로만 — 시험 당번을 만들면 보관 상태로 남는다(지우는 길이 없다).
