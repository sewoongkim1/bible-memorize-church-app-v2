---
name: sql-migrate
description: 성경암송 Supabase 에 SQL(마이그레이션·함수·크론)을 넣는다 — 개발(ktpwthwqzgcqcrmsafdo) 먼저 → 확인 → 운영(xnomlgydifiqiybervtf), 반복 실행 안전하게, 새 표면 RLS·revoke, 사용자 표면 member_merge, 코드와의 배포 순서까지. "SQL 돌려줘", "마이그레이션 넣어줘", "운영 DB 에 반영", "칸 추가", "함수 고쳐서 DB 에", "supabase/*.sql 적용" 같은 요청에 사용. 새 표를 처음 설계할 때는 new-table 도 함께.
---

# SQL 넣기 (sql-migrate)

> 운영 DB 의 마이그레이션은 **되돌릴 수 없다.** 성도님 기록 위에서 실패하면 손쓸 방법이 없다 — 개발에서 한 번 돌려 보는 값이 그 위험보다 훨씬 싸다(CLAUDE.md 「SQL 을 만들었을 때」).

## 0. SQL 은 파일로 — `supabase/<이름>.sql`
- SQL Editor 에 손으로 붙여 넣고 파일로 안 남기면 아무도 모른다 — 보안 점검 E 절도 **파일만** 읽는다(`docs/notes/security-check.md`).
- 파일 머리에 **무엇을 · 실행 순서(개발 → 운영) · 다시 돌려도 되나 · 되돌리는 법**을 적는다(`supabase/member_merge.sql`·`duty.sql` 머리가 본보기).

## ① 여러 번 돌려도 안전하게
- `create table if not exists` · `alter table … add column if not exists` · `create or replace function` · `create index if not exists`
- 정책·트리거는 `drop … if exists` 뒤 다시 만든다 · 씨앗 행은 `insert … on conflict do nothing`(또는 `do update`)
- 긴 DDL 이면 `begin; set local lock_timeout = '5s'; … commit;` — 앱 쓰기를 줄 세워 멈추지 않게(`member_merge.sql`).
- **왜:** 개발에서 한 번, 운영에서 한 번, 고쳐서 또 한 번 — 같은 파일이 여러 번 돈다. 「시드 SQL 만 다시 돌렸더니 켜져 있던 구절이 꺼졌다」(쉴만한 물가 · `docs/notes/psalm-still-waters.md`).

## ② 새 표·뷰·함수면 그 자리에서 닫는다
- 표: `alter table … enable row level security;` + `revoke all on … from public, anon, authenticated;` + `grant all … to service_role;` (시퀀스도 revoke)
- 뷰: `alter view … set (security_invoker = on);` + revoke — 뷰는 RLS 를 지나간다(2026-08-25 `v_ranking_all` 133행이 공개 키로 읽혔다).
- 함수: `security definer` 면 `set search_path = public` + `revoke all on function …(인자형) from public, anon, authenticated;`
- ⚠️ `TO authenticated` 로 열지 않는다 — 2026-09-28 부터 카카오 계정만 있으면 누구나 `authenticated` 다.
- 자세한 차례와 확인은 스킬 `new-table`.

## ③ 사용자에 딸린 표면 `supabase/member_merge.sql`
`user_id`(또는 users 를 가리키는 FK)가 있는 새 표면 그 파일의 ① 합치기 본체 옮기기 ② 두 허용 목록(FK·user_id) ③ `member_merge_counts` ④ 쓰기 연결 트리거 — **넷을 함께** 더하고 파일을 다시 돌린다.
**왜:** 빠뜨리면 그 기록이 있는 계정의 합치기가 `merge-unsupported-records` 로 **오류도 경보도 없이** 멈춘다(가리기·신고·아이폰 기기·정정 신청이 그랬다).
⚠️ 운영에 돌리기 전에 **origin/main 의 것과 같은지** 본다(`git diff origin/main -- supabase/member_merge.sql` 이 비어야) — 옛 사본은 교육·봉사 당번을 모른다.

## ④ 값 목록(CHECK)이면 세 곳
화면 상수(`app.js`) · 서버 허용 목록(`supabase/functions/api/index.ts`) · DB `CHECK` — 셋을 함께. 두 곳만 고치면 화면은 열리는데 저장이 HTTP 500 → 성도님께는 「연결이 고르지 않아」로 보인다(2026-09-10 `ministry_orders_position_chk` 「사모」).

## ⑤ CLI 는 저장소 밖 link 폴더로
```bash
SP="<스크래치 폴더>"                         # 저장소 밖
mkdir -p "$SP/supa-dev"  && (cd "$SP/supa-dev"  && supabase init --force && supabase link --project-ref ktpwthwqzgcqcrmsafdo)
mkdir -p "$SP/supa-prod" && (cd "$SP/supa-prod" && supabase init --force && supabase link --project-ref xnomlgydifiqiybervtf)
supabase --workdir "$SP/supa-dev" db query --linked "select count(*) from users"   # 스물 남짓 = 개발 · 사백이 넘으면 운영
```
- ⚠️ `supabase/.temp` 를 복사해 쓰지 말 것 · 저장소 뿌리에서 `supabase link` 를 바꾸지 말 것.
  **왜:** 그 폴더가 어느 프로젝트를 가리키는지는 다른 세션이 바꾼다 — 2026-09-23 개발을 운영으로 믿고 빈 표를 「0명」이라 보고할 뻔했다. 저장소 뿌리 `.env` 도 CLI 를 죽인다(키 이름의 하이픈).
- `-f` 는 **절대 경로**로 · 결과는 마지막 SELECT 하나만 보인다(중간 것은 잘라서 따로).
- 운영 DB 읽기·쓰기가 권한 검사에 막히면 우회하지 말고 친구에게 알린다.

## ⑥ 개발에 넣고 확인
```bash
supabase --workdir "$SP/supa-dev" db query --linked -f "C:/…/worktree/supabase/<이름>.sql"
```
- 한 번 더 돌려 **두 번째도 오류 없이** 끝나는지(①).
- 기대값을 아는 행 하나로 되짚는다 — 「0건」은 「없다」가 아니라 「못 읽었다」일 수 있다.
- 사용자 표면 `supabase/tests/member_merge_*.dev.sql`(BEGIN … ROLLBACK · **개발에서만**).
- 기록: `python tools/sql-applied.py record supabase/<이름>.sql --dev` — SQL 적용 기록 도구(다른 작업이 만드는 중 · 아직 없으면 건너뛰고 보고에 「기록 못 함」).

## ⑦ 코드와의 차례를 정한다 — 기능마다 다르다
| 경우 | 먼저 | 왜 |
|---|---|---|
| 새 표·새 칸을 **새 코드가 읽는다**(새 액션 · 새 칸 select) | **SQL**(개발·운영 모두) → 그다음 코드 커밋 | 빈 표는 아무도 안 읽는다 · 내가 안 올려도 내 커밋은 남의 배포에 실려 나간다(2026-09-10 `getVerses` 장애) |
| 성도님이 **이미 쓰는 표에 행·값**을 더해 **옛 코드가 주워 간다** | **코드** → 그다음 SQL | 옛 코드가 새 행을 주워 화면 숫자가 **조용히** 틀어진다(CLAUDE.md 「여러 세션」) |
| 칸을 지우거나 이름을 바꾼다 | 그 칸을 안 읽는 코드를 먼저 운영에 → SQL | 옛 코드가 없는 칸을 읽으면 그 액션이 통째로 실패 |
「SQL 먼저」를 규칙으로 외우지 말 것 — 두 번째 경우에 오류가 아니라 숫자가 달라지는 식으로 틀어진다.

## ⑧ 운영에 넣는다
- 같은 파일을 `--workdir "$SP/supa-prod"` 로. 직전에 `select count(*) from users` 로 운영인지 한 번 더.
- 기록: `python tools/sql-applied.py record supabase/<이름>.sql --prod`(도구가 있을 때).
- 넣은 뒤 그 기능의 운영 스모크(`EVT_ENV=prod …` — 스킬 `fn-deploy` ⑤).
- 새 표·정책·함수를 열었으면 교회 어드민 `check-authenticated-exposure.sql` 이 운영에서 **0행**인지(스킬 `new-table`).

## ⑨ 커밋 · 보고
`git add -- supabase/<이름>.sql` (경로 명시 · `git add -A` 금지) → 커밋. 보고에는 개발·운영 각각 넣은 시각 · 확인한 수 · 차례(⑦ 어느 경우였나).
