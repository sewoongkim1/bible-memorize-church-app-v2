# 교회 어드민 「📮 정정 신청」 — 사역 이력 정정 신청 처리 메뉴 설계

- 날짜: 2026-10-01 · 저장소: 교회 어드민 `c:\Projects\church-admin`(가지 `history-check` 에 이어서) · 문서는 형제 저장소 관례대로 여기에
- 앞선 설계: `2026-10-01-ministry-history-check-design.md`(성도님 화면 · 신청 표) §7 「다음 조각」을 구체화한다
- 함께 보는 설계: b6 「📜 사역 이력」 `2026-10-01-church-admin-ministry-history-design.md` §5(줄 창 — 실제 고침은 거기서 한다)
- ⚠️ 이 문서에는 이름·교인ID 를 적지 않는다(공개 저장소). 보기 그림의 이름은 가짜다.

## 0. 친구 결정 (2026-10-01)

| 물음 | 친구 결정 |
|---|---|
| 메뉴 자리 | **따로 메뉴 「📮 정정 신청」**(🤝 사역신청 묶음) + 신청에서 **[그 줄 열기]** → 「📜 사역 이력」의 그 줄 창 |
| 「내 것이 아니에요」 반영 전 본인 확인 | **확인 칸을 꼭 체크** — 그 종류를 「반영」할 때만 「본인에게 확인했어요(전화·대면)」를 체크해야 단추가 눌린다. 기록에 남는다 |
| 처리 알림 | **알림 없음** — 성도님은 앱 「🗂️ 사역 이력 확인」을 다시 열어 현황을 본다 |
| 직분 | **직분은 정정하지 않는다 — 교적 기준.** 정정 종류에서 「직분이 틀려요」를 뺀다(앱 화면·서버·DB). 줄마다 보이는 **그해 명단의 직분은 그대로 둔다**(그해 기록이다) |

## 1. 범위

- **이번:**
  - ① **앞선 고침 — 「직분이 틀려요」 빼기**(이미 만든 사역 이력 확인 쪽): 앱 `MH_LINE_KINDS`·`MH_KIND_TEXT` · 교회 어드민 `history-check.ts` `REQ_LINE_KINDS`/`REQ_KINDS` · SQL 008 CHECK 두 곳(`kind`·`mhr_line_chk`) · 시험(`tests/history-check.test.mjs`·`history-check.dev.test.mjs`·v2 `ministry-history.test.cjs`·`ministry-history-found.dev.py`). SQL 008 은 운영에 아직 안 돌렸으니 파일을 고치고, 개발은 제약을 다시 만드는 SQL 한 번.
  - ② 메뉴 「📮 정정 신청」(목록 · 처리 창) · 서버 액션 둘 · 「바꾼 기록」 · 시험.
  - ③ b6 화면에 주소로 줄 열기(`?row=`)·이름 찾기(`?q=`) — **b6 세션 가지의 파일**이라 그 세션에 부탁한다(§5).
- **안 함:** 처리 알림 · 담당자에게 교인ID 보이기 · 신청 지우기(남겨 둔다 — 개인정보 안내 「처리가 끝난 뒤에도 보관」) · 앱 계정과 교인 잇기 표.

## 2. 목록 — `js/menus/ministry/requests.js`(+ 순수 `requests-logic.js`)

```
📮 정정 신청                       [끝나지 않은 것 ▾]   (끝나지 않은 것 / 끝난 것 / 전부)
┌─────────────────────────────────────────────────────────┐
│ 10/01  기쁨-12 홍길동   팀·부서가 틀려요                │
│        2025 찬양위원회 · 시온성가대                     │
│        「그해에는 호산나찬양대였어요」        ● 신청    │
├─────────────────────────────────────────────────────────┤
│ 09/30  믿음-99 김○○     내 기록 찾아 주세요    ● 확인 중 │
└─────────────────────────────────────────────────────────┘
```
- 줄: 신청일(KST) · 신청 때 소속·이름(사본 `who_*`) · 종류 · 대상(기록 줄의 연도·부서·팀 — 빼 둔 줄이면 「빼 둔 기록」 · 빠진 사역이면 「빠진 사역 2023 — 부서·팀 글」) · 설명 · 상태.
- 거르기: 기본 **끝나지 않은 것(신청·확인 중)**, 오래된 것부터. 끝난 것·전부는 최근 것부터. 고르개는 `picker.js` `pickOne`(시스템 `<select>` 금지).
- 위에 수: 「신청 N · 확인 중 N」.
- 교인ID 는 보이지 않는다(사역신청 담당자). 「교적 찾음 / 못 찾음」(`found` = `person_id` 있음)만.
- 메뉴 줄: `{ id: "mn-requests", group: "사역신청", icon: "📮", label: "정정 신청", desc: "앱에서 온 사역 이력 정정 신청 보기·처리", role: "ministry", load: () => import("./ministry/requests.js") }` — b6 의 `mn-history` 줄 바로 아래(합칠 때 `registry.js` 가 겹친다 — 둘 다 남긴다).
- CSS 는 `.hr-*`(b6 화면이 `.mh-*` 를 쓴다 — 겹치지 않게).

## 3. 처리 창(줄을 누르면 — `openForm`/`dialog`)

- 위: 신청 내용(종류·설명·빠진 사역 글·신청일·신청 때 소속·이름) · 대상 줄 요약 · **[그 줄 열기]**
  - 줄 정정 → `#/mn-history?row=<history_id>` · 빠진 사역·찾아 주세요 → `#/mn-history?q=<신청 때 이름>`(§5).
- 처리: 상태 단추 **[확인 중] · [반영] · [반영 안 함]** + 답 칸(300자).
  - 「반영 안 함」은 **답 필수.** 「반영」은 답 선택.
  - 답 칸 아래 안내 고정: 「답은 같은 이름·소속으로 앱에 들어오는 사람에게도 보여요 — 다른 분 이름·사적인 사정은 적지 마세요.」
  - **「내 것이 아니에요」(`not_mine`)를 「반영」할 때만** 칸 「본인에게 확인했어요(전화·대면)」 — 체크해야 [반영]이 눌린다(서버도 `verified:true` 를 요구).
  - 「내 기록 찾아 주세요」는 대개 답에 「앱 설정 → 로그인 정보변경에서 목장을 ○○로 바꿔 주세요」를 적고 「반영」(안내 줄로 보여 준다).
- 끝난 신청(반영·반영 안 함)도 **[확인 중]**을 눌러 다시 연다 — 같은 줄에 이미 열린 신청이 있으면 「이미 열린 신청이 있어요」.
- 저장 중엔 `busy()` 로 단추를 잠근다. 다른 담당자가 먼저 바꿨으면 「다른 분이 먼저 바꿨어요 — 다시 불러올게요」 후 목록을 다시 부른다.
- 창 위에 창을 띄우지 않는다(오류는 창 안 한 줄).

## 4. 서버 — 액션 둘(역할 `ministry` · `authz.ts` `ACTION_ROLES` + `index.ts` `switch` + `tests/server.dev.test.mjs` `PROBE` 세 곳)

- `historyRequestList { status: "open" | "done" | "all" }` → `{ ok, counts: { 신청, 확인 중 }, list: [{ id, kind, detail, year, team_text, status, answer, created_at, updated_at, handled_at, who: { type, group, sub, name }, found, row: { id, year, committee, team, role_title, position, deleted } | null }] }`
  - **싣지 않는 칸: `user_id`·`person_id`·`handled_by`**(시험이 키 집합 대조). `found` = `person_id is not null`.
  - `row` 는 `history_id` 의 `ministry_history` 줄(빼 둔 줄도 `deleted:true` 로).
  - 차례: open 은 `created_at` 오름차순, done·all 은 내림차순 · 최대 500.
- `historyRequestSet { id, status, answer, verified, expect }` → `{ ok, row }` 또는 `{ ok:false, error }`
  - `status` ∈ `확인 중`·`반영`·`반영 안 함` · `expect` = 마지막으로 본 `updated_at`(다르면 `conflict`).
  - 규칙(순수 함수 `requestSetCheck` — `history-check.ts`): 답 300자 · `반영 안 함`은 답 필수(`need-answer`) · `not_mine`+`반영`은 `verified===true`(`need-verified`) · 같은 상태로 바꾸기는 답만 바뀌어도 허용.
  - 2026-10-01 친구 결정 두 가지: **이미 `반영`인 줄의 답만 고칠 때는 본인 확인을 다시 묻지 않는다**(`need-verified` 는 `not_mine` 을 `반영`으로 **처음** 바꿀 때만) · **상태·답이 지금 줄과 같으면 쓰지도 「바꾼 기록」에 남기지도 않는다**(`requestSetNoop` → `{ ok:true, same:true }`).
  - 쓰기: `status`·`answer`·`handled_by`(담당자)·`handled_at`(끝난 상태일 때 지금, `확인 중`이면 null)·`updated_at` 을 `expect` 조건부 update — 0행이면 `conflict`. 23505(다시 열기 · 같은 줄 열린 신청) → `already-open`.
  - 「바꾼 기록」 `history.request { id, kind, from, to, verified }` — 이름·교인ID·답 글은 싣지 않는다.
- 오류 글자: `bad-id`·`bad-status`·`answer-too-long`·`need-answer`·`need-verified`·`conflict`·`already-open`·`not-found`.

## 5. b6 「📜 사역 이력」에 부탁할 것(그 세션 가지 `ministry-history` · `js/menus/ministry/history.js`)

- 주소 `#/mn-history?row=<id>` 로 들어오면 목록을 불러온 뒤 그 줄 창(`openRow`)을 연다. 그 줄이 지금 걸러진 목록에 없으면 한 줄로 불러와 연다(빼 둔 줄이면 그대로 알린다).
- `#/mn-history?q=<이름>` 이면 이름 찾기 칸을 채워 거른다(찾기 칸이 없으면 이 부분은 그 세션이 정한다).
- 우리 쪽은 주소만 만든다 — b6 쪽이 아직 안 받으면 그냥 「📜 사역 이력」 첫 화면이 열린다(고장 아님). 그래서 두 가지가 따로 들어가도 된다.

## 6. 시험

- 순수(`tests/history-check.test.mjs` 에 더함 · 새 `tests/requests-logic.test.mjs`): `requestSetCheck` 모든 갈래 · 목록 응답 칸 대조(`user_id`·`person_id`·`handled_by` 없음) · 목록 줄 HTML(escape · 빼 둔 줄 · 빠진 사역 · 찾아 주세요) · 거르기 차례 · 「직분이 틀려요」가 종류에 없다.
- 개발 서버: `PROBE` 두 줄(공용 `server.dev.test.mjs` — 세 곳 규칙) + 따로 `tests/history-requests.dev.test.mjs`(시험 담당자 · 시드 신청 → 목록 → 확인 중 → 반영 안 함 답 없음 거절 → not_mine 반영 확인 없이 거절 → 충돌 → 다시 열기 23505 → 기록 남음 · 정리).
- 화면: 헤드리스로 PC 1366×657 · 폰 390·320 가로 넘침 0 · 시스템 창 0.

## 7. 개인정보

- 교회 어드민 `privacy.html` 9번에 한 줄: 「담당자가 처리하면 상태·답·처리한 담당자·때가 남고, 「내 것이 아니에요」는 본인 확인을 했다는 표시가 바꾼 기록에 남아요.」
- 성경암송 `privacy/` 는 바뀌지 않는다(「직분이 틀려요」를 빼도 「고르신 것」 표현 그대로 맞다).

## 8. 내보내기

- 이 가지(`history-check`)는 「사역 이력 확인」과 함께 운영에 나간다 — 그쪽 계획 Task 9 순서(SQL 008 → church-admin → api → 화면 · 친구 허락) 안에서 메뉴도 함께 나간다. 메뉴는 표가 운영에 있기 전에는 열어도 빈 목록·오류 한 줄이다.
- ⚠️ 12/13 신청 기간 전에 운영에 있어야 한다.
