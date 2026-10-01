# 성경암송 앱 「사역현황」 묶음 · 사역 이력 확인 · 정정 신청 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 성경암송 앱 첫 화면에 「사역현황」 묶음(🤝 사역신청 · 🗂️ 사역 이력 확인)을 두고, 성도님이 로그인 소속·이름으로 찾은 지난 사역 기록을 보고 줄마다 정정을 신청하고 처리 현황을 보게 한다.

**Architecture:** 교인 찾기 규칙(`people-match.ts`)과 정정 신청 표(`ministry_history_requests`)는 교회 어드민 한 곳에 둔다. 교회 어드민 함수에 서비스 키로만 열리는 내부 갈래(`internalMyHistory`·`internalHistoryRequest`)를 카카오 토큰 검사 **앞에** 둔다. 성경암송 `api` 는 문 검사(사역신청 기간·시험 참여자·관리자 비번)와 `users` 값 꺼내기만 하고 그 갈래를 대신 부른다. 화면은 `app.js` 의 순수 HTML 함수 묶음(vm 시험) + 손잡이 함수.

**Tech Stack:** 지금과 같음 — 성경암송: Vanilla JS(`app.js`·`style.css`)·Deno Edge Function `api`·`node --test`(.cjs, 꾸러미 없음). 교회 어드민: Deno Edge Function `church-admin`(`npm:@supabase/supabase-js@2.117.2`)·`node --experimental-strip-types --test`·Postgres.

**설계:** `docs/superpowers/specs/2026-10-01-ministry-history-check-design.md`(친구 승인 2026-10-01) — **요구의 원본.** 배경: `ministry/2026_사역이력_공유_A4.html` ⑤.

**코드 자리:** Task 1~4 는 교회 어드민 worktree `c:\Projects\church-admin\.worktrees\history-check`(가지 `history-check`) 기준 경로. Task 5~8 은 이 저장소(`c:\Projects\bible-memorize-church-app-v2`, `main`) 기준 경로.

## Global Constraints

- **열리는 문:** 첫 화면 「사역현황」 묶음(제목 + 두 단추)은 **`ministryVisible()` 한 조건**으로 감싼다. 서버 문 = `ministryCfg().isOpen` **또는** 관리자 비번(`adminError(b)` 가 null) **또는** `ministryIsTester(user_id)`. **`b.preview` 는 받지 않는다.**
- **본인 찾기:** 교구 = 교구 + 목장 + 이름, 교회학교 = 부서 + 이름 — `sameAffiliation` 그대로. 같은 소속 후보가 **딱 한 분**일 때만 그분. 화면에는 「찾지 못했어요」 한 가지로만 말한다(여럿인지 알리지 않는다).
- **화면이 보낸 이름·소속은 쓰지 않는다** — `api` 가 `user_id` 로 `users` 줄(`type,gu,mok,bu,grade,name`)을 꺼낸다.
- **응답에 싣지 않는 칸:** `user_id`·`person_id`·교인ID·`match_basis`·`match_reason`·`link_how`·`mok`(그때 목장)·`src_note`·`handled_by`. 기록 줄 칸은 정확히 `committee,id,position,role_title,team,year`, 신청 칸은 정확히 `answer,created_at,detail,history_id,id,kind,status,team_text,year`(시험이 키 집합을 대조).
- **신청 값(DB CHECK·교회 어드민·화면 세 곳 같은 글자):** `kind` = `not_mine`·`wrong_team`·`wrong_position`·`other`(줄 정정 — `history_id` 필수) · `missing`(연도 1950~2100 + 「부서·팀」 글 필수) · `find_me`(찾지 못했을 때만). `status` = `신청`·`확인 중`·`반영`·`반영 안 함`. 끝나지 않음 = `신청`·`확인 중`.
- **글자 수:** 설명 200 · 부서·팀 100 · 담당자 답 300. 끝나지 않은 신청 한 계정 **20건**까지. 같은 기록 줄에 끝나지 않은 신청 하나 · `find_me` 끝나지 않은 것 하나(부분 unique 색인으로도 막는다).
- **표:** `ministry_history_requests` — RLS 켜고 정책 없음 · `anon`·`authenticated` 둘 다 revoke(시퀀스도) · `TO authenticated` 로 열지 않는다(운영 카카오 로그인 켜짐). SQL 파일 번호 **008**(b6 가 005, 교인명부 세션이 006·007 을 잡아 두었다 — 만들 때 `ls supabase/sql` 과 다른 worktree 를 보고 겹치면 다음 빈 번호로).
- **새 색·새 단추 색 금지**(`docs/notes/home-screen.md` ⑤). 단추 아이콘은 **🗂️**(📜 는 「내 안에 거하는 말씀」). 브라우저 `alert`·`confirm`·`prompt` 금지 — 창은 사역신청의 `.min-d-*` 모양.
- **개발 먼저.** 개발 `ktpwthwqzgcqcrmsafdo` · 운영 `xnomlgydifiqiybervtf` 는 **Task 9 에서 친구 허락 뒤에만.** SQL 은 `supabase --workdir ~/.church-admin/supa-dev db query --linked -f <절대 경로>`(저장소 루트 link 금지). 개발인지 먼저: `select count(*) from users` 가 **수십**이면 개발(2026-10-01 38), **사백이 넘으면 운영 — 멈춘다.**
- **교회 어드민 함수는 한 벌이다** — 다른 가지(b6 `ministry-history`·교인명부 `person-history` 등)도 같은 개발 함수를 배포한다. 개발에 배포하기 전 `git merge main --no-edit`. 배포하면 아직 main 에 안 들어간 다른 가지의 개발 액션이 잠시 사라진다 — `git worktree list` 로 보고 친구에게 한 줄 알린다.
- **배포는 작업 트리를 올린다** — `api`·`church-admin` 배포 전 `git status --short supabase/functions` 가 내 것뿐인지 본다.
- **진짜 교인 이름·교인ID 금지** — 시험은 `홍길동`·`ca-test-hc-<STAMP>-가` 같은 지어낸 이름, 교인ID 990000081~84.
- **이 저장소의 공용 파일(`app.js`·`style.css`·`supabase/functions/api/index.ts`·`index.html`)은 여러 세션이 함께 고친다** — 커밋 전 `git diff <파일>` 에 남의 hunk 가 보이면 `git apply --cached` 로 내 hunk 만 담고 **경로 없이** 커밋한 뒤 `git show --stat HEAD` 로 확인(메모리 `stage-only-changed-files`). `bump.py` 는 Task 9 에서만.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`(다른 모델이 일하면 그 이름). 명령은 `-m "<제목>" -m "Co-Authored-By: …"` 꼴.
- **푸시 = 운영.** 교회 어드민·성경암송 모두 Task 1~8 은 **커밋만**, 푸시는 Task 9.

## 파일 구조

| 파일 | 만듦/고침 | 맡는 것 |
|---|---|---|
| (교회 어드민) `supabase/sql/008_ministry_history_requests.sql` | 만듦 | 정정 신청 표 · 색인 · 부분 unique · RLS·revoke |
| (교회 어드민) `supabase/functions/church-admin/people-match.ts` | 고침(끝에 더함) | `LoginWho`·`applicantFromLogin`·`loginNameKey`·`matchLoginPerson` |
| (교회 어드민) `supabase/functions/church-admin/history-check.ts` | 만듦 | 순수: 키 대조·`readLoginWho`·`hcUserId`·`parseRequest`·`requestBlock`·`requestInsert`·`historyRowOut`·`requestOut`·`sortHistory`·상수 |
| (교회 어드민) `supabase/functions/church-admin/index.ts` | 고침 | import 두 줄 · 내부 갈래 `internalRoute` · `hcFindPerson`·`internalMyHistory`·`internalHistoryRequest` · `Deno.serve` 맨 앞 한 줄 |
| (교회 어드민) `tests/history-check.test.mjs` | 만듦 | 순수 시험(찾기 규칙·신청 규칙·응답 모양·역할 표 밖) |
| (교회 어드민) `tests/history-check.dev.test.mjs` | 만듦 | 개발 서버 시험(내부 갈래) |
| (교회 어드민) `privacy.html` · `CLAUDE.md` | 고침 | 8번 절 · 한 줄 |
| `supabase/functions/api/index.ts` | 고침 | `ministryHistoryMine`·`ministryHistoryRequest` + 도우미 넷 · switch 두 줄 |
| `js/api.js` | 고침 | 두 줄 |
| `tests/ministry-history-smoke.sh` | 만듦 | 개발 `api` → 교회 어드민 끝까지 |
| `app.js` | 고침 | 첫 화면 묶음 · 순수 묶음(표식 사이) · 화면·창 |
| `tests/ministry-history.test.cjs` · `tools/preflight.py` | 만듦/고침 | 순수 묶음 시험 · 배포 앞 그물에 등록 |
| `style.css` | 고침 | `.mh-*` |
| `tools/screen-sweep.py` | 고침 | 화면 셋 |
| `privacy/index.html` · `app.js`(개인정보 화면 둘) | 고침 | 모으는 것·보관·누가 보나 |
| `docs/notes/ministry-history-check.md` · `CLAUDE.md` | 만듦/고침 | 함정 기록 · 지도 한 줄 |

---

### Task 1: 교회 어드민 작업 가지 · 정정 신청 표(SQL 008) — 개발에 반영

**Files:**
- Create: `supabase/sql/008_ministry_history_requests.sql`

**Interfaces:**
- Produces: 표 `ministry_history_requests`(칸은 아래 SQL 그대로) · 색인 `mhr_user_idx`·`mhr_status_idx` · 부분 unique `mhr_open_line_uq (user_id, history_id)`·`mhr_open_find_uq (user_id)`. 겹쳐 넣으면 오류 코드 `23505`.

- [ ] **Step 1: worktree 를 만든다**

```bash
cd /c/Projects/church-admin
git status --short            # 「?? Data/」 말고는 비어 있어야 한다(Data/ 는 b6 의 엑셀 — 건드리지 않는다)
git worktree add .worktrees/history-check -b history-check main
cd .worktrees/history-check && git log --oneline -1 && git config core.hooksPath
ls supabase/sql ../ministry-history/supabase/sql ../person-history/supabase/sql 2>/dev/null
```
Expected: 마지막 줄에 `.githooks`. `ls` 결과에 `008_` 이 없어야 한다 — 있으면 다음 빈 번호로 바꿔 아래 모든 자리(파일 이름·명령)를 고친다.

- [ ] **Step 2: SQL 을 쓴다** — `supabase/sql/008_ministry_history_requests.sql`

```sql
-- 성경암송 앱 「사역 이력 확인」 정정 신청 (2026-10-01 · 설계 v2 docs/superpowers/specs/2026-10-01-ministry-history-check-design.md §5.1)
-- ⚠️ 개발(ktpwthwqzgcqcrmsafdo) 먼저, 그다음 운영(xnomlgydifiqiybervtf).
-- ⚠️ 서버(church-admin 함수의 service role)만 읽고 쓴다 — 성경암송 api 는 church-admin 내부 갈래를 거쳐서만 닿는다.
--    RLS 를 켜고 정책을 두지 않으며 anon·authenticated 권한을 뺀다(운영 카카오 로그인 — authenticated = 카카오 계정만 있으면 누구나).
-- ⚠️ user_id·history_id·person_id 에 FK 를 걸지 않는다 — 계정이 합쳐지거나, 기록 줄을 빼 두거나, 새 명부에서 빠져도 신청은 남는다.
-- ⚠️ kind·status 글자는 교회 어드민 history-check.ts 와 성경암송 app.js MH_* 가 같은 글자를 쓴다(세 곳) — 하나만 고치면 저장이 막힌다.
-- 여러 번 돌려도 안전하다(if not exists).
-- 실행: supabase --workdir <작업 폴더> db query --linked -f C:/Projects/church-admin/.worktrees/history-check/supabase/sql/008_ministry_history_requests.sql
begin;

create table if not exists ministry_history_requests (
  id          bigserial primary key,
  user_id     uuid not null,                       -- 앱 계정(users.id) — 어떤 응답에도 싣지 않는다
  person_id   int,                                 -- 신청 때 찾은 교인ID(찾지 못했으면 null)
  history_id  bigint,                              -- 정정할 줄(ministry_history.id) — 줄 정정만
  kind        text not null check (kind in ('not_mine', 'wrong_team', 'wrong_position', 'other', 'missing', 'find_me')),
  detail      text not null default '' check (char_length(detail) <= 200),
  year        int check (year between 1950 and 2100),                  -- missing 의 연도
  team_text   text not null default '' check (char_length(team_text) <= 100),   -- missing 의 「부서·팀」 글
  who_type    text not null default '',            -- 신청 때 로그인 소속·이름 사본(담당자가 찾을 때)
  who_group   text not null default '',            -- 교구 또는 부서
  who_sub     text not null default '',            -- 목장 또는 학년
  who_name    text not null default '',
  status      text not null default '신청' check (status in ('신청', '확인 중', '반영', '반영 안 함')),
  answer      text not null default '' check (char_length(answer) <= 300),   -- 담당자가 적은 말(반영 안 함의 사유 등)
  handled_by  uuid references admin_members(id) on delete set null,
  handled_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint mhr_line_chk check ((kind in ('not_mine', 'wrong_team', 'wrong_position', 'other')) = (history_id is not null)),
  constraint mhr_missing_chk check ((kind = 'missing') = (year is not null))
);
create index if not exists mhr_user_idx   on ministry_history_requests (user_id);
create index if not exists mhr_status_idx on ministry_history_requests (status, created_at);
-- 같은 때 두 번 눌러도 하나만(서버가 먼저 세지만, 동시에 들어온 둘은 여기서 막힌다 → 23505 → already-open)
create unique index if not exists mhr_open_line_uq on ministry_history_requests (user_id, history_id)
  where history_id is not null and status in ('신청', '확인 중');
create unique index if not exists mhr_open_find_uq on ministry_history_requests (user_id)
  where kind = 'find_me' and status in ('신청', '확인 중');

alter table ministry_history_requests enable row level security;
revoke all on ministry_history_requests from anon, authenticated;
revoke all on sequence ministry_history_requests_id_seq from anon, authenticated;

commit;
```

- [ ] **Step 3: 개발인지 확인하고 개발에 반영한다**

```bash
supabase --workdir ~/.church-admin/supa-dev db query --linked "select count(*) as users from users"
```
Expected: `users` 가 수십(2026-10-01 38). **사백이 넘으면 멈춘다.**

```bash
supabase --workdir ~/.church-admin/supa-dev db query --linked -f C:/Projects/church-admin/.worktrees/history-check/supabase/sql/008_ministry_history_requests.sql
supabase --workdir ~/.church-admin/supa-dev db query --linked "select to_regclass('public.ministry_history_requests') as t, relrowsecurity as rls from pg_class where relname='ministry_history_requests'"
```
Expected: `t` = `ministry_history_requests`, `rls` = `true`.

- [ ] **Step 4: 공개 키로 막혔는지 본다**

```bash
set -a; . ~/.church-admin/dev.env; set +a
curl -s -o /dev/null -w "%{http_code}\n" "$DEV_URL/rest/v1/ministry_history_requests?select=*&limit=1" -H "apikey: $DEV_ANON" -H "Authorization: Bearer $DEV_ANON"
supabase --workdir ~/.church-admin/supa-dev db query --linked -f C:/Projects/church-admin/supabase/sql/check-authenticated-exposure.sql
```
Expected: 첫 줄 `401`(또는 `403` — 권한 없음. **`200` 이면 멈춘다**). 노출 점검은 0행.

- [ ] **Step 5: 커밋**

```bash
git add supabase/sql/008_ministry_history_requests.sql
git commit -m "feat(사역이력확인): SQL 008 — 정정 신청 표 ministry_history_requests · RLS · 부분 unique(열린 신청 하나)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 로그인으로 교인 찾기 — `matchLoginPerson`

**Files:**
- Modify: `supabase/functions/church-admin/people-match.ts`(파일 **맨 끝**에 더한다 — `LOOKUP_BAD`·`sameAffiliation` 아래)
- Create: `tests/history-check.test.mjs`

**Interfaces:**
- Consumes: `applicantFromSignup`·`sameAffiliation`·`toCand`·`nameKey`·`LOOKUP_BAD`(같은 파일).
- Produces: `type LoginWho = { type: string; gu: string; mok: string; bu: string; grade: string; name: string }` · `applicantFromLogin(w: LoginWho): Applicant` · `loginNameKey(w: LoginWho): string | null` · `matchLoginPerson(rows: any[] | undefined, w: LoginWho): { personId: number | null; why: "" | "없음" | "여럿" }`(rows = 명부에서 같은 `name_key` 로 가져온 줄 `{person_id, kind2, mok1, mok3, school_dept}`).

- [ ] **Step 1: 실패하는 시험을 쓴다** — `tests/history-check.test.mjs`

```js
// 사역 이력 확인 · 정정 신청 — 순수 함수 시험(2026-10-01 · 설계 v2 docs/superpowers/specs/2026-10-01-ministry-history-check-design.md)
//   node --experimental-strip-types --test tests/history-check.test.mjs
// ⚠️ 이름은 지어낸 것만(홍길동). 공용 people-match.test.mjs 는 다른 세션이 고치는 중이라 이 파일에 둔다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { applicantFromLogin, loginNameKey, matchLoginPerson } from "../supabase/functions/church-admin/people-match.ts";

const P = (id, o) => ({ person_id: id, kind2: "장년", mok1: "", mok3: "", school_dept: "", phone_digits: "", ...o });
const W = (o) => ({ type: "교구", gu: "기쁨", mok: "12", bu: "", grade: "", name: "홍길동", ...o });

test("교구 — 같은 교구·같은 목장에 한 분이면 그분", () => {
  const rows = [P(1, { mok1: "기쁨", mok3: "기쁨-12목장" }), P(2, { mok1: "소망", mok3: "소망-12목장" })];
  assert.deepEqual(matchLoginPerson(rows, W()), { personId: 1, why: "" });
});

test("교구 — 같은 교구 다른 목장뿐이면 찾지 못함(목장까지 본다 · 친구 결정)", () => {
  assert.deepEqual(matchLoginPerson([P(1, { mok1: "기쁨", mok3: "기쁨-3목장" })], W()), { personId: null, why: "없음" });
});

test("교구 — 같은 목장에 같은 이름 둘이면 찾지 못함(여럿)", () => {
  const rows = [P(1, { mok1: "기쁨", mok3: "기쁨-12목장" }), P(2, { mok1: "기쁨", mok3: "기쁨-12목장" })];
  assert.deepEqual(matchLoginPerson(rows, W()), { personId: null, why: "여럿" });
});

test("교구 — 목장 99·빈칸은 찾지 못함(목장을 모르는 로그인)", () => {
  const rows = [P(1, { mok1: "기쁨", mok3: "기쁨-12목장" })];
  assert.equal(matchLoginPerson(rows, W({ mok: "99" })).personId, null);
  assert.equal(matchLoginPerson(rows, W({ mok: "" })).personId, null);
});

test("교구 — 「남성」은 교적 남성 목장 한 분(그 목장 칸의 아이는 빼고 센다)", () => {
  const rows = [P(1, { mok1: "소망", mok3: "소망-남성1" }), P(2, { kind2: "교회학교", mok1: "소망", mok3: "소망-남성1" })];
  assert.deepEqual(matchLoginPerson(rows, W({ gu: "소망", mok: "남성" })), { personId: 1, why: "" });
});

test("새가족 — 교구만 본다(명부 목장 칸이 연도·월이다)", () => {
  assert.equal(matchLoginPerson([P(1, { mok1: "새가족", mok3: "2026-09" })], W({ gu: "새가족", mok: "99" })).personId, 1);
});

test("교회학교 — 부서와 이름(학년은 보지 않는다)", () => {
  const w = W({ type: "교회학교", gu: "", mok: "", bu: "중등부", grade: "2학년" });
  assert.equal(matchLoginPerson([P(1, { kind2: "학생", school_dept: "중등부" })], w).personId, 1);
  assert.equal(matchLoginPerson([P(1, { kind2: "학생", school_dept: "고등부" })], w).personId, null);
});

test("청년부 — 명부의 목장 첫 칸(mok1)", () => {
  const w = W({ type: "교회학교", gu: "", mok: "", bu: "청년부" });
  assert.equal(matchLoginPerson([P(1, { mok1: "청년부", mok3: "청년-03" })], w).personId, 1);
});

test("후보가 없으면 없음 · undefined 도 견딘다", () => {
  assert.deepEqual(matchLoginPerson([], W()), { personId: null, why: "없음" });
  assert.deepEqual(matchLoginPerson(undefined, W()), { personId: null, why: "없음" });
});

test("applicantFromLogin — 교구는 교구·목장, 교회학교는 부서", () => {
  assert.deepEqual(applicantFromLogin(W()), { type: "교구", gu: "기쁨", mok: 12, men: false, bu: "", name: "홍길동", phone: "" });
  assert.deepEqual(applicantFromLogin(W({ type: "교회학교", bu: "중등부" })),
    { type: "교회학교", gu: "", mok: null, men: false, bu: "중등부", name: "홍길동", phone: "" });
});

test("loginNameKey — 띄어쓰기·자모분리(NFD)를 맞추고, 물을 수 없는 글자·빈 이름은 null", () => {
  assert.equal(loginNameKey(W({ name: " 홍 길동 " })), "홍길동");
  assert.equal(loginNameKey(W({ name: "홍길동".normalize("NFD") })), "홍길동");
  assert.equal(loginNameKey(W({ name: "홍(길동)" })), null);
  assert.equal(loginNameKey(W({ name: "" })), null);
});
```

- [ ] **Step 2: 시험이 떨어지는지 본다**

Run: `node --experimental-strip-types --test tests/history-check.test.mjs`
Expected: FAIL — `does not provide an export named 'applicantFromLogin'`

- [ ] **Step 3: 구현한다** — `people-match.ts` 맨 끝에 더한다

```ts
// ── 성경암송 앱 로그인으로 교인 한 분 찾기(사역 이력 확인 · 2026-10-01) ──
//   설계: v2 docs/superpowers/specs/2026-10-01-ministry-history-check-design.md §3
//   교구 = 교구 + 목장 + 이름, 교회학교 = 부서 + 이름 — sameAffiliation 그대로(교적 표시 「맞음」과 같은 기준 · 친구 결정).
//   같은 소속에 그 이름이 딱 한 분일 때만 그분. why 는 서버 안에서만 쓴다 — 화면엔 「찾지 못했어요」 하나(동명이인이 있다는 것을 알리지 않는다).
// ⚠️ 이 파일의 sameAffiliation·mokNumber 를 고치면 성경암송 앱의 「사역 이력 확인」도 함께 바뀐다(그래서 규칙을 여기 둔다).
export type LoginWho = { type: string; gu: string; mok: string; bu: string; grade: string; name: string };

// 앱 로그인(users 줄) → 신청자 모양. 성경필사 명단 줄과 같은 읽기(목장 「12」·「남성」·「99」).
export function applicantFromLogin(w: LoginWho): Applicant {
  const school = txt(w?.type) === "교회학교";
  return applicantFromSignup({
    who_type: school ? "교회학교" : "교구",
    group_name: school ? String(w?.bu ?? "") : String(w?.gu ?? ""),
    sub_name: school ? "" : String(w?.mok ?? ""),
    name: String(w?.name ?? ""),
  });
}

// 명부에 물을 이름 열쇠 — 비었거나 물을 수 없는 글자(LOOKUP_BAD)면 null(그 이름은 찾지 않는다)
export function loginNameKey(w: LoginWho): string | null {
  const k = nameKey(w?.name);
  return k && !LOOKUP_BAD.test(k) ? k : null;
}

// rows = 명부에서 같은 이름(name_key)으로 가져온 줄 { person_id, kind2, mok1, mok3, school_dept }
export function matchLoginPerson(rows: any[] | undefined, w: LoginWho): { personId: number | null; why: "" | "없음" | "여럿" } {
  const a = applicantFromLogin(w);
  const same = (rows ?? []).filter((r) => sameAffiliation(toCand(r), a));
  if (same.length === 1) return { personId: Number(same[0].person_id), why: "" };
  return { personId: null, why: same.length ? "여럿" : "없음" };
}
```

- [ ] **Step 4: 시험이 붙는지 본다**

Run: `node --experimental-strip-types --test tests/history-check.test.mjs tests/people-match.test.mjs`
Expected: PASS(둘 다 — 기존 people-match 시험이 그대로 통과해야 한다)

- [ ] **Step 5: 커밋**

```bash
git add supabase/functions/church-admin/people-match.ts tests/history-check.test.mjs
git commit -m "feat(사역이력확인): 앱 로그인으로 교인 한 분 찾기 matchLoginPerson — 교구+목장+이름 · 부서+이름(sameAffiliation 그대로)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 정정 신청 규칙 · 응답 모양 — `history-check.ts`

**Files:**
- Create: `supabase/functions/church-admin/history-check.ts`
- Modify: `tests/history-check.test.mjs`(아래 시험을 끝에 더한다 · 맨 위 import 줄 아래에 새 import 두 줄)

**Interfaces:**
- Consumes: `type LoginWho`(Task 2).
- Produces(모두 export): `REQ_LINE_KINDS: string[]` · `REQ_KINDS: string[]` · `REQ_STATUS: string[]` · `REQ_OPEN: string[]` · `REQ_DETAIL_MAX = 200` · `REQ_TEAM_MAX = 100` · `REQ_OPEN_MAX = 20` · `HISTORY_SELECT = "id,year,committee,team,role_title,position"` · `REQUEST_SELECT = "id,history_id,kind,detail,year,team_text,status,answer,created_at"` · `HISTORY_OUT_KEYS`·`REQUEST_OUT_KEYS`(정렬된 칸 이름) · `internalKeyOk(given: string | null, expected: string): boolean` · `hcUserId(x: unknown): string | null` · `readLoginWho(x: any): LoginWho | null` · `type ReqIn = { history_id: number | null; kind: string; detail: string; year: number | null; team_text: string }` · `parseRequest(b: any): { ok: true; req: ReqIn } | { ok: false; error: string }` · `requestBlock(req: ReqIn, found: boolean, mine: Set<number>, open: { history_id: number | null; kind: string }[]): string | null` · `requestInsert(req: ReqIn, userId: string, personId: number | null, w: LoginWho): Record<string, unknown>` · `historyRowOut(r: any)` · `requestOut(r: any)` · `sortHistory<T>(rows: T[]): T[]`.
- 오류 글자(화면 Task 6 `MH_ERR` 가 같은 글자를 쓴다): `bad-kind`·`too-long`·`no-row`·`need-detail`·`bad-year`·`need-team`·`not-found`·`already-found`·`already-open`·`not-yours`·`too-many`·`bad-who`.

- [ ] **Step 1: 실패하는 시험을 더한다** — `tests/history-check.test.mjs` 맨 위 import 들 아래에:

```js
import {
  HISTORY_OUT_KEYS, REQUEST_OUT_KEYS, REQ_OPEN_MAX, hcUserId, historyRowOut, internalKeyOk, parseRequest,
  readLoginWho, requestBlock, requestInsert, requestOut, sortHistory,
} from "../supabase/functions/church-admin/history-check.ts";
import { ACTION_ROLES, canCall } from "../supabase/functions/church-admin/authz.ts";
```

파일 끝에:

```js
test("internalKeyOk — 같은 값만 · 빈 값·길이 다름은 false", () => {
  assert.equal(internalKeyOk("abc123", "abc123"), true);
  assert.equal(internalKeyOk("abc124", "abc123"), false);
  assert.equal(internalKeyOk("abc12", "abc123"), false);
  assert.equal(internalKeyOk("", ""), false);
  assert.equal(internalKeyOk(null, "abc123"), false);
});

test("hcUserId — uuid 꼴만", () => {
  assert.equal(hcUserId("0f8fad5b-d9cb-469f-a165-70867728950e"), "0f8fad5b-d9cb-469f-a165-70867728950e");
  assert.equal(hcUserId(" 0f8fad5b-d9cb-469f-a165-70867728950e "), "0f8fad5b-d9cb-469f-a165-70867728950e");
  assert.equal(hcUserId("abc"), null);
  assert.equal(hcUserId(undefined), null);
});

test("readLoginWho — 구분은 교구·교회학교만 · 이름 필수 · NFC·빈칸 정리", () => {
  assert.deepEqual(readLoginWho({ type: "교구", gu: "기쁨", mok: "12", name: " 홍  길동 " }),
    { type: "교구", gu: "기쁨", mok: "12", bu: "", grade: "", name: "홍 길동" });
  assert.equal(readLoginWho({ type: "교역자", name: "홍길동" }), null);
  assert.equal(readLoginWho({ type: "교구", name: "" }), null);
  assert.equal(readLoginWho(null), null);
  assert.equal(readLoginWho("교구"), null);
});

test("parseRequest — 줄 정정은 history_id 필수 · 「그 밖에」는 설명 필수", () => {
  assert.deepEqual(parseRequest({ kind: "not_mine", history_id: "12" }),
    { ok: true, req: { history_id: 12, kind: "not_mine", detail: "", year: null, team_text: "" } });
  assert.deepEqual(parseRequest({ kind: "wrong_team" }), { ok: false, error: "no-row" });
  assert.deepEqual(parseRequest({ kind: "wrong_team", history_id: -1 }), { ok: false, error: "no-row" });
  assert.deepEqual(parseRequest({ kind: "other", history_id: 3, detail: "  " }), { ok: false, error: "need-detail" });
  assert.equal(parseRequest({ kind: "other", history_id: 3, detail: "그해엔\n알토" }).req.detail, "그해엔 알토");
});

test("parseRequest — 빠진 사역은 연도·부서팀 필수 · 찾아 주세요는 줄 없이", () => {
  assert.deepEqual(parseRequest({ kind: "missing", year: "2023", team_text: " 시온성가대 ", history_id: 9 }),
    { ok: true, req: { history_id: null, kind: "missing", detail: "", year: 2023, team_text: "시온성가대" } });
  assert.deepEqual(parseRequest({ kind: "missing", year: "", team_text: "시온성가대" }), { ok: false, error: "bad-year" });
  assert.deepEqual(parseRequest({ kind: "missing", year: 1900, team_text: "시온성가대" }), { ok: false, error: "bad-year" });
  assert.deepEqual(parseRequest({ kind: "missing", year: 2023, team_text: "" }), { ok: false, error: "need-team" });
  assert.deepEqual(parseRequest({ kind: "missing", year: 2023, team_text: "가".repeat(101) }), { ok: false, error: "too-long" });
  assert.deepEqual(parseRequest({ kind: "find_me", history_id: 5, detail: "목장이 바뀌었어요" }),
    { ok: true, req: { history_id: null, kind: "find_me", detail: "목장이 바뀌었어요", year: null, team_text: "" } });
});

test("parseRequest — 모르는 종류·긴 설명", () => {
  assert.deepEqual(parseRequest({ kind: "delete_all" }), { ok: false, error: "bad-kind" });
  assert.deepEqual(parseRequest({}), { ok: false, error: "bad-kind" });
  assert.deepEqual(parseRequest({ kind: "not_mine", history_id: 1, detail: "가".repeat(201) }), { ok: false, error: "too-long" });
  assert.equal(parseRequest({ kind: "not_mine", history_id: 1, detail: "가".repeat(200) }).ok, true);
});

test("requestBlock — 찾았나 · 이분 줄인가 · 이미 열린 신청 · 20건", () => {
  const line = { history_id: 7, kind: "not_mine", detail: "", year: null, team_text: "" };
  const find = { history_id: null, kind: "find_me", detail: "", year: null, team_text: "" };
  const miss = { history_id: null, kind: "missing", detail: "", year: 2023, team_text: "팀" };
  const mine = new Set([7]);
  assert.equal(requestBlock(line, true, mine, []), null);
  assert.equal(requestBlock(line, false, mine, []), "not-found");
  assert.equal(requestBlock(miss, false, mine, []), "not-found");
  assert.equal(requestBlock(line, true, new Set([8]), []), "not-yours");
  assert.equal(requestBlock(line, true, mine, [{ history_id: 7, kind: "wrong_team" }]), "already-open");
  assert.equal(requestBlock(find, true, mine, []), "already-found");
  assert.equal(requestBlock(find, false, mine, []), null);
  assert.equal(requestBlock(find, false, mine, [{ history_id: null, kind: "find_me" }]), "already-open");
  const many = Array.from({ length: REQ_OPEN_MAX }, (_, i) => ({ history_id: 100 + i, kind: "not_mine" }));
  assert.equal(requestBlock(line, true, mine, many), "too-many");
  assert.equal(requestBlock(miss, true, mine, many.slice(1)), null);
});

test("requestInsert — 신청 때 소속·이름 사본(교구는 교구·목장, 교회학교는 부서·학년)", () => {
  const req = { history_id: 7, kind: "not_mine", detail: "", year: null, team_text: "" };
  const uid = "0f8fad5b-d9cb-469f-a165-70867728950e";
  assert.deepEqual(requestInsert(req, uid, 5, { type: "교구", gu: "기쁨", mok: "12", bu: "", grade: "", name: "홍길동" }), {
    user_id: uid, person_id: 5, history_id: 7, kind: "not_mine", detail: "", year: null, team_text: "",
    who_type: "교구", who_group: "기쁨", who_sub: "12", who_name: "홍길동",
  });
  const s = requestInsert(req, uid, null, { type: "교회학교", gu: "", mok: "", bu: "중등부", grade: "2학년", name: "홍길동" });
  assert.equal(s.who_group, "중등부"); assert.equal(s.who_sub, "2학년"); assert.equal(s.person_id, null);
});

test("historyRowOut·requestOut — 정해진 칸만(교인ID·user_id·그때 목장·맞춤 근거가 새지 않는다)", () => {
  const h = historyRowOut({ id: "3", year: 2025, committee: "찬양위원회", team: "시온성가대", role_title: "", position: "집사",
    person_id: 990000001, mok: "기쁨-12", match_basis: "맞음", link_how: "auto", src_note: "x", name: "홍길동" });
  assert.deepEqual(Object.keys(h).sort(), HISTORY_OUT_KEYS);
  assert.equal(h.id, 3);
  const q = requestOut({ id: 1, history_id: null, kind: "find_me", detail: "", year: null, team_text: "", status: "신청",
    answer: "", created_at: "2026-10-01T00:00:00Z", user_id: "u", person_id: 5, handled_by: "m", who_name: "홍길동" });
  assert.deepEqual(Object.keys(q).sort(), REQUEST_OUT_KEYS);
  assert.equal(q.history_id, null);
});

test("sortHistory — 연도 내림차순 · 같은 해는 부서·팀·id 차례", () => {
  const r = (id, year, committee, team) => ({ id, year, committee, team });
  const out = sortHistory([r(1, 2025, "나", "가"), r(2, 2026, "나", "나"), r(3, 2026, "가", "다"), r(4, 2026, "나", "나")]);
  assert.deepEqual(out.map((x) => x.id), [3, 2, 4, 1]);
});

test("내부 액션 둘은 역할 표에 없다 — 카카오 토큰으로 부르면 unknown-action", () => {
  for (const a of ["internalMyHistory", "internalHistoryRequest"]) {
    assert.ok(!(a in ACTION_ROLES), a);
    assert.equal(canCall(a, { status: "active", roles: ["super"] }), "unknown-action");
  }
});
```

- [ ] **Step 2: 시험이 떨어지는지 본다**

Run: `node --experimental-strip-types --test tests/history-check.test.mjs`
Expected: FAIL — `Cannot find module '…/history-check.ts'`

- [ ] **Step 3: 구현한다** — `supabase/functions/church-admin/history-check.ts`

```ts
// 사역 이력 확인 · 정정 신청 — 순수 함수(2026-10-01)
//   설계: v2 docs/superpowers/specs/2026-10-01-ministry-history-check-design.md §4·§5
//   서버(Deno, index.ts)와 시험(Node, tests/history-check.test.mjs)이 같은 파일을 읽는다 — 원격 import·enum 금지.
// ⚠️ 성경암송 앱(성도님)께 나가는 응답의 모양을 여기서 정한다 — 교인ID·user_id·맞춤 근거·그때 목장은 싣지 않는다.
// ⚠️ kind·status 글자는 SQL 008 CHECK·성경암송 app.js MH_* 와 같다(세 곳).
import type { LoginWho } from "./people-match.ts";

export const REQ_LINE_KINDS = ["not_mine", "wrong_team", "wrong_position", "other"];
export const REQ_KINDS = [...REQ_LINE_KINDS, "missing", "find_me"];
export const REQ_STATUS = ["신청", "확인 중", "반영", "반영 안 함"];
export const REQ_OPEN = ["신청", "확인 중"];
export const REQ_DETAIL_MAX = 200;
export const REQ_TEAM_MAX = 100;
export const REQ_OPEN_MAX = 20;
export const HISTORY_SELECT = "id,year,committee,team,role_title,position";
export const REQUEST_SELECT = "id,history_id,kind,detail,year,team_text,status,answer,created_at";
export const HISTORY_OUT_KEYS = ["committee", "id", "position", "role_title", "team", "year"];
export const REQUEST_OUT_KEYS = ["answer", "created_at", "detail", "history_id", "id", "kind", "status", "team_text", "year"];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const tidy = (s: unknown): string => String(s ?? "").normalize("NFC").replace(/\s+/g, " ").trim();

// 서비스 키 대조 — 길이가 같으면 글자마다 끝까지 본다(성경암송 api sameSecret 과 같은 식)
export function internalKeyOk(given: string | null, expected: string): boolean {
  const a = String(given ?? ""), b = String(expected ?? "");
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export function hcUserId(x: unknown): string | null {
  const s = String(x ?? "").trim();
  return UUID_RE.test(s) ? s : null;
}

// 성경암송 api 가 users 줄에서 꺼내 넘긴 로그인 소속·이름 — 모양이 틀리면 null
export function readLoginWho(x: any): LoginWho | null {
  if (!x || typeof x !== "object") return null;
  const type = tidy(x.type);
  if (type !== "교구" && type !== "교회학교") return null;
  const name = tidy(x.name);
  if (!name) return null;
  return { type, gu: tidy(x.gu), mok: tidy(x.mok), bu: tidy(x.bu), grade: tidy(x.grade), name };
}

export type ReqIn = { history_id: number | null; kind: string; detail: string; year: number | null; team_text: string };

export function parseRequest(b: any): { ok: true; req: ReqIn } | { ok: false; error: string } {
  const kind = tidy(b?.kind);
  if (!REQ_KINDS.includes(kind)) return { ok: false, error: "bad-kind" };
  const detail = tidy(b?.detail);
  if (detail.length > REQ_DETAIL_MAX) return { ok: false, error: "too-long" };
  if (REQ_LINE_KINDS.includes(kind)) {
    const id = Number(b?.history_id);
    if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, error: "no-row" };
    if (kind === "other" && !detail) return { ok: false, error: "need-detail" };
    return { ok: true, req: { history_id: id, kind, detail, year: null, team_text: "" } };
  }
  if (kind === "missing") {
    const year = Number(tidy(b?.year));
    if (!Number.isInteger(year) || year < 1950 || year > 2100) return { ok: false, error: "bad-year" };
    const team = tidy(b?.team_text);
    if (!team) return { ok: false, error: "need-team" };
    if (team.length > REQ_TEAM_MAX) return { ok: false, error: "too-long" };
    return { ok: true, req: { history_id: null, kind, detail, year, team_text: team } };
  }
  return { ok: true, req: { history_id: null, kind, detail, year: null, team_text: "" } };   // find_me
}

// 넣기 전 막기 — 화면이 미리 알리지만 정하는 것은 여기다. null = 넣어도 된다.
//   found: 로그인으로 교인을 찾았나 · mine: 이분 것인 기록 줄 id(빼 둔 줄 제외) · open: 이 계정의 끝나지 않은 신청
export function requestBlock(req: ReqIn, found: boolean, mine: Set<number>,
  open: { history_id: number | null; kind: string }[]): string | null {
  if (req.kind === "find_me") {
    if (found) return "already-found";
    if (open.some((o) => o.kind === "find_me")) return "already-open";
  } else {
    if (!found) return "not-found";
    if (req.history_id !== null) {
      if (!mine.has(req.history_id)) return "not-yours";
      if (open.some((o) => o.history_id === req.history_id)) return "already-open";
    }
  }
  if (open.length >= REQ_OPEN_MAX) return "too-many";
  return null;
}

export function requestInsert(req: ReqIn, userId: string, personId: number | null, w: LoginWho): Record<string, unknown> {
  const school = w.type === "교회학교";
  return {
    user_id: userId, person_id: personId, history_id: req.history_id, kind: req.kind, detail: req.detail,
    year: req.year, team_text: req.team_text,
    who_type: w.type, who_group: school ? w.bu : w.gu, who_sub: school ? w.grade : w.mok, who_name: w.name,
  };
}

export function historyRowOut(r: any) {
  return {
    id: Number(r.id), year: Number(r.year), committee: String(r.committee ?? ""), team: String(r.team ?? ""),
    role_title: String(r.role_title ?? ""), position: String(r.position ?? ""),
  };
}

export function requestOut(r: any) {
  return {
    id: Number(r.id), history_id: r.history_id == null ? null : Number(r.history_id), kind: String(r.kind ?? ""),
    detail: String(r.detail ?? ""), year: r.year == null ? null : Number(r.year), team_text: String(r.team_text ?? ""),
    status: String(r.status ?? ""), answer: String(r.answer ?? ""), created_at: String(r.created_at ?? ""),
  };
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);   // 코드 포인트 차례(localeCompare 는 ICU 에 따라 달라진다)
export function sortHistory<T extends { year: number; committee: string; team: string; id: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.year - a.year || cmp(a.committee, b.committee) || cmp(a.team, b.team) || a.id - b.id);
}
```

- [ ] **Step 4: 시험이 붙는지 본다 · 전체 순수 시험도**

Run: `node --experimental-strip-types --test tests/history-check.test.mjs && python tools/preflight.py`
Expected: PASS · preflight 끝에 실패 0

- [ ] **Step 5: 커밋**

```bash
git add supabase/functions/church-admin/history-check.ts tests/history-check.test.mjs
git commit -m "feat(사역이력확인): 정정 신청 규칙·응답 모양 history-check.ts — 종류·글자 수·열린 신청 하나·20건 · 정해진 칸만" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 교회 어드민 내부 갈래 — 서비스 키로만 · 개발 배포 · 개발 서버 시험

**Files:**
- Modify: `supabase/functions/church-admin/index.ts`
- Create: `tests/history-check.dev.test.mjs`

**Interfaces:**
- Consumes: Task 2·3 의 이름 전부. 기존 `db`·`json`·`allRows`(index.ts 안).
- Produces(성경암송 `api` 가 부른다 · 머리 `x-internal-key: <SUPABASE_SERVICE_ROLE_KEY>`):
  - `{ action:"internalMyHistory", who:{type,gu,mok,bu,grade,name}, user_id }` → `{ ok:true, found:boolean, rows:[{id,year,committee,team,role_title,position}], requests:[{id,history_id,kind,detail,year,team_text,status,answer,created_at}] }` 또는 `{ ok:false, error:"bad-who" }`
  - `{ action:"internalHistoryRequest", who, user_id, history_id?, kind, detail?, year?, team_text? }` → `{ ok:true }` 또는 `{ ok:false, error:<Task 3 오류 글자> }`
  - 키가 틀리면 401 `unauthorized` · 모르는 액션 400 `unknown-action` · 서버 오류 500 `server`.

- [ ] **Step 1: import 두 줄을 더한다** — `index.ts` 의 `import { churchForSignup } from "./events-person.ts";` 줄 **바로 아래**(기존 import 줄은 고치지 않는다 — 이미 들인 이름을 다시 적으면 두 번 선언 = 배포 실패):

```ts
// 사역 이력 확인 · 정정 신청(성경암송 앱 · 2026-10-01) — ⚠️ 위 import 에 이미 든 이름은 적지 않는다
import { loginNameKey, matchLoginPerson, type LoginWho } from "./people-match.ts";
import { hcUserId, historyRowOut, HISTORY_SELECT, internalKeyOk, parseRequest, readLoginWho, REQ_OPEN, requestBlock, requestInsert, requestOut, REQUEST_SELECT, sortHistory } from "./history-check.ts";
```

- [ ] **Step 2: 처리 함수를 더한다** — `Deno.serve(async (req) => {` 줄 **바로 위**에:

```ts
// ── 사역 이력 확인 · 정정 신청(성경암송 앱 · 2026-10-01) ─────────────────
//   성경암송 api 가 서비스 키(x-internal-key)로만 부른다 — 카카오 토큰 길이 아니다(Deno.serve 맨 앞 갈래).
//   설계: v2 docs/superpowers/specs/2026-10-01-ministry-history-check-design.md §5
//   ⚠️ 응답 모양은 history-check.ts(historyRowOut·requestOut)가 정한다 — 교인ID·user_id·맞춤 근거·그때 목장을 싣지 않는다.
//   ⚠️ 이 두 액션은 authz.ts ACTION_ROLES 에 넣지 않는다 — 토큰으로 부르면 canCall 이 unknown-action 으로 막는다(시험이 본다).
async function hcFindPerson(w: LoginWho): Promise<number | null> {
  const k = loginNameKey(w);
  if (!k) return null;
  const { data, error } = await db.from("church_people").select("person_id,kind2,mok1,mok3,school_dept")
    .eq("name_key", k).order("person_id", { ascending: true });
  if (error) throw error;
  return matchLoginPerson(data ?? [], w).personId;
}

// 이 계정의 신청 — .in("status", …) 대신 받아서 거른다(「확인 중」의 빈칸을 PostgREST 목록 글자로 넘기지 않으려고)
async function hcRequests(uid: string): Promise<any[]> {
  const { data, error } = await db.from("ministry_history_requests").select(REQUEST_SELECT)
    .eq("user_id", uid).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(500);
  if (error) throw error;
  return data ?? [];
}

async function internalMyHistory(b: any) {
  const w = readLoginWho(b.who), uid = hcUserId(b.user_id);
  if (!w || !uid) return { ok: false, error: "bad-who" };
  const pid = await hcFindPerson(w);
  const rows = pid === null ? [] : await allRows(() => db.from("ministry_history").select(HISTORY_SELECT)
    .eq("person_id", pid).is("deleted_at", null).order("id", { ascending: true }));
  const reqs = await hcRequests(uid);
  return { ok: true, found: pid !== null, rows: sortHistory(rows.map(historyRowOut)), requests: reqs.slice(0, 100).map(requestOut) };
}

async function internalHistoryRequest(b: any) {
  const w = readLoginWho(b.who), uid = hcUserId(b.user_id);
  if (!w || !uid) return { ok: false, error: "bad-who" };
  const p = parseRequest(b);
  if (!p.ok) return p;
  const pid = await hcFindPerson(w);
  const mine = new Set<number>();
  if (pid !== null && p.req.history_id !== null) {
    const { data, error } = await db.from("ministry_history").select("id")
      .eq("id", p.req.history_id).eq("person_id", pid).is("deleted_at", null).maybeSingle();
    if (error) throw error;
    if (data) mine.add(Number(data.id));
  }
  const open = (await hcRequests(uid)).filter((r: any) => REQ_OPEN.includes(r.status))
    .map((r: any) => ({ history_id: r.history_id == null ? null : Number(r.history_id), kind: String(r.kind) }));
  const block = requestBlock(p.req, pid !== null, mine, open);
  if (block) return { ok: false, error: block };
  const { error: ie } = await db.from("ministry_history_requests").insert(requestInsert(p.req, uid, pid, w));
  if (ie) {
    if ((ie as any).code === "23505") return { ok: false, error: "already-open" };   // 같은 때 두 번 — 부분 unique 색인이 막았다
    throw ie;
  }
  return { ok: true };
}

async function internalRoute(req: Request): Promise<Response> {
  if (!internalKeyOk(req.headers.get("x-internal-key"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "")) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }
  let b: any;
  try { b = await req.json(); } catch { return json({ ok: false, error: "bad-json" }, 400); }
  if (!b || typeof b !== "object" || Array.isArray(b)) return json({ ok: false, error: "bad-json" }, 400);
  const action = String(b.action ?? "");
  try {
    switch (action) {
      case "internalMyHistory":      return json(await internalMyHistory(b));
      case "internalHistoryRequest": return json(await internalHistoryRequest(b));
    }
    return json({ ok: false, error: "unknown-action" }, 400);
  } catch (e) {
    console.error(action, e);
    return json({ ok: false, error: "server" }, 500);   // e.message 를 싣지 않는다(아래 토큰 갈래와 같은 까닭)
  }
}
```

- [ ] **Step 3: `Deno.serve` 맨 앞에 갈래 한 줄** — 아래 두 줄 사이에 넣는다:

```ts
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);
  // 성경암송 api 가 서비스 키로 부르는 길(사역 이력 확인 · 2026-10-01) — 머리가 있으면 이 갈래로만 간다(토큰 검사로 넘어가지 않는다)
  if (req.headers.has("x-internal-key")) return internalRoute(req);
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
```
(가운데 두 줄이 새로 넣는 것이다.)

- [ ] **Step 4: 개발 서버 시험을 쓴다** — `tests/history-check.dev.test.mjs`

```js
// 사역 이력 확인 · 정정 신청 — 교회 어드민 내부 갈래(성경암송 api 가 서비스 키로 부른다)를 개발 서버에 대고 본다.
//   set -a; . ~/.church-admin/dev.env; set +a
//   node --experimental-strip-types --test tests/history-check.dev.test.mjs
// ⚠️ 공용 server.dev.test.mjs 는 여러 세션이 고치는 중이라 따로 둔다(이름의 .dev. — preflight 에서 빠진다).
// 시험 자료: 교인ID 990000081~84 · 기록 src_key ca-test-hc-<STAMP>-… · 신청은 지어낸 user_id 하나 — 끝나면 모두 지운다.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { HISTORY_OUT_KEYS, REQUEST_OUT_KEYS } from "../supabase/functions/church-admin/history-check.ts";

const URL_ = process.env.DEV_URL, ANON = process.env.DEV_ANON, SERVICE = process.env.DEV_SERVICE_KEY;
if (!URL_ || !URL_.includes("ktpwthwqzgcqcrmsafdo")) throw new Error("개발 프로젝트(ktpwthwqzgcqcrmsafdo)에만 돌린다 — dev.env 를 확인할 것");
if (!ANON || !SERVICE) throw new Error("DEV_ANON·DEV_SERVICE_KEY 가 없다");

const FN = URL_ + "/functions/v1/church-admin";
const REST = URL_ + "/rest/v1/";
const svc = { apikey: SERVICE, "Content-Type": "application/json",
  ...(SERVICE.startsWith("sb_secret_") ? {} : { Authorization: "Bearer " + SERVICE }) };
const STAMP = Date.now();
const NAME = `ca-test-hc-${STAMP}-가`;   // 같은 소속(기쁨-12)에 한 분 + 다른 교구에 한 분
const TWIN = `ca-test-hc-${STAMP}-나`;   // 같은 목장에 같은 이름 둘
const IDS = [990000081, 990000082, 990000083, 990000084];
const UID = crypto.randomUUID();         // 앱 계정 자리 — 이 표는 users 를 잇지 않는다(FK 없음)
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const WHO = { type: "교구", gu: "기쁨", mok: "12", bu: "", grade: "", name: NAME };
const hist = {};   // src_key 끝 글자 → 기록 줄 id

async function body(res) { const t = await res.text(); try { return JSON.parse(t); } catch { return { raw: t }; } }
async function rest(method, path, data) {
  const res = await fetch(REST + path, { method, headers: { ...svc, Prefer: "return=representation" },
    body: data ? JSON.stringify(data) : undefined });
  const j = await body(res);
  if (!res.ok) throw new Error(method + " " + path + " " + res.status + " " + JSON.stringify(j));
  return j;
}
const internal = (payload, key = SERVICE) => fetch(FN, { method: "POST",
  headers: { "Content-Type": "application/json", "x-internal-key": key }, body: JSON.stringify(payload) });
const call = async (payload) => body(await internal(payload));

before(async () => {
  const person = (id, name, mok1, mok3) => ({ person_id: id, name, name_key: name, mok1, mok3, kind2: "장년" });
  await rest("POST", "church_people", [
    person(IDS[0], NAME, "기쁨", "기쁨-12목장"), person(IDS[1], NAME, "소망", "소망-3목장"),
    person(IDS[2], TWIN, "기쁨", "기쁨-12목장"), person(IDS[3], TWIN, "기쁨", "기쁨-12목장"),
  ]);
  // ⚠️ 한꺼번에 넣는 줄은 칸이 모두 같아야 한다(PostgREST 는 첫 줄의 칸으로 넣는다 — 빠진 칸이 null 이 되어 NOT NULL 에 걸린다)
  const h = (k, o) => ({ src_key: `ca-test-hc-${STAMP}-${k}`, name: NAME, year: 0, committee: "", team: "", role_title: "",
    position: "", mok: "", person_id: null, deleted_at: null, ...o });
  const rows = await rest("POST", "ministry_history", [
    h("a", { year: 2025, committee: "찬양위원회", team: "시온성가대", position: "집사", person_id: IDS[0], mok: "기쁨-12" }),
    h("b", { year: 2026, committee: "교육위원회", team: "유년부", role_title: "교사", position: "집사", person_id: IDS[0] }),
    h("c", { year: 2024, committee: "봉사위원회", team: "주차팀", position: "집사", person_id: IDS[0], deleted_at: new Date().toISOString() }),
    h("d", { year: 2026, committee: "찬양위원회", team: "호산나찬양대", position: "권사", person_id: IDS[1] }),
  ]);
  for (const r of rows) hist[r.src_key.split("-").pop()] = r.id;
});

after(async () => {
  await rest("DELETE", `ministry_history_requests?user_id=eq.${UID}`);
  await rest("DELETE", `ministry_history?src_key=like.ca-test-hc-${STAMP}-*`);
  await rest("DELETE", `church_people?person_id=in.(${IDS.join(",")})`);
});

test("서비스 키 머리가 없으면 지금처럼 토큰 검사로 간다(401 unauthenticated)", async () => {
  const res = await fetch(FN, { method: "POST", headers: { "Content-Type": "application/json", apikey: ANON },
    body: JSON.stringify({ action: "internalMyHistory", who: WHO, user_id: UID }) });
  assert.equal(res.status, 401);
  assert.equal((await body(res)).error, "unauthenticated");
});

test("틀린 키는 막는다(401 unauthorized) · 토큰 갈래의 액션은 내부 갈래로 못 부른다", async () => {
  const bad = await internal({ action: "internalMyHistory", who: WHO, user_id: UID }, SERVICE + "x");
  assert.equal(bad.status, 401);
  assert.equal((await body(bad)).error, "unauthorized");
  const me = await internal({ action: "membersList" });
  assert.equal(me.status, 400);
  assert.equal((await body(me)).error, "unknown-action");
});

test("내 기록 — 같은 교구·목장·이름 한 분의 줄만(빼 둔 줄·다른 분 줄 없이 · 연도 내림차순 · 정해진 칸)", async () => {
  const j = await call({ action: "internalMyHistory", who: WHO, user_id: UID });
  assert.equal(j.ok, true);
  assert.equal(j.found, true);
  assert.deepEqual(j.rows.map((r) => r.id), [hist.b, hist.a]);
  for (const r of j.rows) assert.deepEqual(Object.keys(r).sort(), HISTORY_OUT_KEYS);
  assert.deepEqual(j.requests, []);
  const text = JSON.stringify(j);
  assert.ok(!IDS.some((id) => text.includes(String(id))), "교인ID 가 샜다");
  assert.ok(!UUID_RE.test(text), "uuid 가 샜다");
  assert.ok(!text.includes("기쁨-12"), "그때 목장이 샜다");
});

test("목장 99 · 같은 목장 동명이인 둘 · 다른 교구면 찾지 못함", async () => {
  for (const who of [{ ...WHO, mok: "99" }, { ...WHO, name: TWIN }, { ...WHO, gu: "사랑" }]) {
    const j = await call({ action: "internalMyHistory", who, user_id: UID });
    assert.equal(j.ok, true);
    assert.equal(j.found, false, JSON.stringify(who));
    assert.deepEqual(j.rows, []);
  }
});

test("모양이 틀린 who·user_id 는 bad-who", async () => {
  assert.equal((await call({ action: "internalMyHistory", who: { type: "x", name: NAME }, user_id: UID })).error, "bad-who");
  assert.equal((await call({ action: "internalMyHistory", who: WHO, user_id: "abc" })).error, "bad-who");
  assert.equal((await call({ action: "internalHistoryRequest", who: WHO, user_id: "abc", kind: "find_me" })).error, "bad-who");
});

test("정정 신청 — 이분 줄에 넣고, 같은 줄 두 번 · 남의 줄 · 빼 둔 줄 · 찾았는데 찾아 주세요는 막는다", async () => {
  const send = (o) => call({ action: "internalHistoryRequest", who: WHO, user_id: UID, ...o });
  assert.deepEqual(await send({ kind: "wrong_position", history_id: hist.a, detail: "그해에는 권사였어요" }), { ok: true });
  assert.equal((await send({ kind: "not_mine", history_id: hist.a })).error, "already-open");
  assert.equal((await send({ kind: "not_mine", history_id: hist.d })).error, "not-yours");
  assert.equal((await send({ kind: "not_mine", history_id: hist.c })).error, "not-yours");
  assert.equal((await send({ kind: "find_me" })).error, "already-found");
  assert.equal((await send({ kind: "missing", year: "", team_text: "주차팀" })).error, "bad-year");
  assert.deepEqual(await send({ kind: "missing", year: 2023, team_text: "찬양위원회 시온성가대" }), { ok: true });
});

test("찾지 못한 분은 「찾아 주세요」 하나만", async () => {
  const send = (o) => call({ action: "internalHistoryRequest", who: { ...WHO, mok: "99" }, user_id: UID, ...o });
  assert.equal((await send({ kind: "not_mine", history_id: hist.a })).error, "not-found");
  assert.deepEqual(await send({ kind: "find_me", detail: "목장이 바뀌었어요" }), { ok: true });
  assert.equal((await send({ kind: "find_me" })).error, "already-open");
});

test("내 신청 현황 — 최근 것이 위 · 정해진 칸만 · uuid 없음", async () => {
  const j = await call({ action: "internalMyHistory", who: WHO, user_id: UID });
  assert.deepEqual(j.requests.map((r) => r.kind), ["find_me", "missing", "wrong_position"]);
  for (const r of j.requests) assert.deepEqual(Object.keys(r).sort(), REQUEST_OUT_KEYS);
  assert.ok(j.requests.every((r) => r.status === "신청"));
  assert.ok(!UUID_RE.test(JSON.stringify(j)), "uuid 가 샜다");
});
```

- [ ] **Step 5: 순수 시험·preflight**

Run: `node --experimental-strip-types --test tests/history-check.test.mjs && python tools/preflight.py`
Expected: PASS · 실패 0(`.dev.` 시험은 preflight 에서 빠진다)

- [ ] **Step 6: main 을 합치고 개발에 배포한다**

```bash
git merge main --no-edit
git worktree list          # main 에 안 들어간 다른 가지가 있으면 「개발 함수에서 그 가지 액션이 잠시 사라진다」고 친구에게 한 줄 알린다
git status --short supabase/functions    # 비어 있어야 한다(커밋 안 한 것이 함께 나간다)
supabase functions deploy church-admin --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo
```
Expected: `Deployed Functions on project ktpwthwqzgcqcrmsafdo: church-admin`. (Step 7 이 실패해 고치려면 Step 8 커밋 전에 고쳐 다시 배포한다.)

- [ ] **Step 7: 개발 서버 시험**

```bash
set -a; . ~/.church-admin/dev.env; set +a
node --experimental-strip-types --test tests/history-check.dev.test.mjs
```
Expected: 8개 모두 PASS. 끝난 뒤 남은 자료가 없는지:
```bash
supabase --workdir ~/.church-admin/supa-dev db query --linked "select (select count(*) from church_people where person_id between 990000081 and 990000084) as p, (select count(*) from ministry_history where src_key like 'ca-test-hc-%') as h"
```
Expected: `p` 0, `h` 0.

- [ ] **Step 8: 커밋**

```bash
git add supabase/functions/church-admin/index.ts tests/history-check.dev.test.mjs
git commit -m "feat(사역이력확인): 교회 어드민 내부 갈래 — 서비스 키로만 internalMyHistory·internalHistoryRequest(토큰 검사 앞) · 개발 서버 시험" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 성경암송 `api` — 문 검사 · `users` 값 · 교회 어드민 대신 부르기

**Files:**
- Modify: `supabase/functions/api/index.ts`(함수 묶음은 `async function ministryTester(b: any) {` 함수 **바로 아래**, switch 두 줄은 `case "ministryTester":` 줄 **바로 아래**)
- Modify: `js/api.js`(`ministryTester:` 줄 바로 아래)
- Create: `tests/ministry-history-smoke.sh`

**Interfaces:**
- Consumes: Task 4 의 내부 갈래 · 기존 `db`·`ministryCfg()`·`adminError(b)`·`ministryIsTester(userId)`.
- Produces: 액션 `ministryHistoryMine { user_id, pw? }` → `{ ok:true, who:{type,gu,mok,bu,grade,name}, found, rows, requests }` · `ministryHistoryRequest { user_id, pw?, history_id?, kind, detail?, year?, team_text? }` → `{ ok:true }`. 실패는 `{ ok:false, error }` — `no-user`·`closed`·`upstream` + Task 3 오류 글자 그대로. `js/api.js`: `api.ministryHistoryMine(user_id, pw)` · `api.ministryHistoryRequest(user_id, req, pw)`. ⚠️ `supaCall` 은 `error` 가 있으면 **throw** 한다 — 화면은 `e.message` 로 오류 글자를 받는다.

- [ ] **Step 1: `api` 에 함수 묶음을 더한다**

```ts
// ---------- 사역 이력 확인 · 정정 신청(2026-10-01) ----------
// 설계: docs/superpowers/specs/2026-10-01-ministry-history-check-design.md §5.3
// 교인 찾기·표는 교회 어드민 한 곳(church-admin 내부 갈래 internalMyHistory·internalHistoryRequest) — 여기는 문 검사와 users 값만 맡는다.
// ⚠️ 화면이 보낸 이름·소속은 쓰지 않는다 — user_id 로 users 줄을 꺼낸다.
// ⚠️ b.preview 는 받지 않는다 — 서버가 확인할 수 없는 값이다(ministryApply 의 ⚠️⚠️). 미리보기 화면은 관리자 비번(pw)으로 통과한다.
// ⚠️ 새 담당자용 사역 액션이 아니다(얼림 대상 아님) — 성도님 화면용 둘이다.
const MH_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// 교회 어드민이 막은 까닭 — 그대로 화면에 넘긴다(그 밖의 실패는 upstream 으로 묶는다)
const MH_PASS_ERRORS = ["bad-kind", "too-long", "no-row", "need-detail", "bad-year", "need-team",
  "not-found", "already-found", "already-open", "not-yours", "too-many"];

async function ministryHistoryOpen(b: any, userId: string): Promise<boolean> {
  if ((await ministryCfg()).isOpen) return true;
  if (!adminError(b)) return true;
  return await ministryIsTester(userId);
}

async function ministryHistoryUser(b: any): Promise<{ userId: string; who: Record<string, string> } | { error: string }> {
  const userId = String(b.user_id || "").trim();
  if (!MH_UUID.test(userId)) return { error: "no-user" };
  if (!(await ministryHistoryOpen(b, userId))) return { error: "closed" };
  const { data, error } = await db.from("users").select("type,gu,mok,bu,grade,name").eq("id", userId).maybeSingle();
  if (error) throw error;
  if (!data) return { error: "no-user" };
  return { userId, who: { type: data.type, gu: data.gu ?? "", mok: data.mok ?? "", bu: data.bu ?? "", grade: data.grade ?? "", name: data.name } };
}

// 교회 어드민 함수의 내부 갈래 — 8초에서 끊는다(교회 어드민이 멈춰도 성도님 화면이 오래 돌지 않게)
async function churchAdminInternal(payload: Record<string, unknown>): Promise<any | null> {
  try {
    const res = await fetch(Deno.env.get("SUPABASE_URL") + "/functions/v1/church-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-key": Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    return await res.json().catch(() => null);
  } catch (e) {
    console.error("churchAdminInternal", e);
    return null;
  }
}

async function ministryHistoryMine(b: any) {
  const u = await ministryHistoryUser(b);
  if ("error" in u) return { ok: false, error: u.error };
  const j = await churchAdminInternal({ action: "internalMyHistory", who: u.who, user_id: u.userId });
  if (!j || j.ok !== true) {
    console.error("ministryHistoryMine", j);
    return { ok: false, error: "upstream" };
  }
  return { ok: true, who: u.who, found: !!j.found,
    rows: Array.isArray(j.rows) ? j.rows : [], requests: Array.isArray(j.requests) ? j.requests : [] };
}

async function ministryHistoryRequest(b: any) {
  const u = await ministryHistoryUser(b);
  if ("error" in u) return { ok: false, error: u.error };
  const j = await churchAdminInternal({
    action: "internalHistoryRequest", who: u.who, user_id: u.userId,
    history_id: b.history_id ?? null, kind: b.kind, detail: b.detail, year: b.year, team_text: b.team_text,
  });
  if (j && j.ok === true) return { ok: true };
  if (j && MH_PASS_ERRORS.includes(j.error)) return { ok: false, error: j.error };
  console.error("ministryHistoryRequest", j);
  return { ok: false, error: "upstream" };
}
```

- [ ] **Step 2: switch 두 줄** — `case "ministryTester":` 줄 바로 아래:

```ts
      case "ministryHistoryMine":    return json(await ministryHistoryMine(body));      // 사역 이력 확인(2026-10-01)
      case "ministryHistoryRequest": return json(await ministryHistoryRequest(body));   // 사역 이력 정정 신청(2026-10-01)
```

- [ ] **Step 3: `js/api.js` 두 줄** — `ministryTester:` 줄 바로 아래:

```js
  // 사역 이력 확인 · 정정 신청(2026-10-01) — pw 는 관리자 미리보기만(minPw). req = { kind, history_id, detail, year, team_text }
  ministryHistoryMine: (user_id, pw) => supaCall("ministryHistoryMine", { user_id, pw }),
  ministryHistoryRequest: (user_id, req, pw) => supaCall("ministryHistoryRequest", { ...req, user_id, pw }),
```

- [ ] **Step 4: 스모크를 쓴다** — `tests/ministry-history-smoke.sh`

```bash
#!/usr/bin/env bash
# 사역 이력 확인 · 정정 신청 — 개발 api → 교회 어드민 내부 갈래까지 끝에서 끝으로(2026-10-01).
#   bash tests/ministry-history-smoke.sh
# ⚠️ 개발만. 키·비번은 파일에서 읽어 이 스크립트 안에서만 쓴다(찍지 않는다):
#    ~/.church-admin/dev.env(DEV_URL·DEV_ANON·DEV_SERVICE_KEY) · .env.dev(ADMIN_SECRET — 개발 관리자 비번)
# 시험 계정은 screen-sweep 과 같은 「화면점검」(교구 믿음-99 — 목장 모름이라 늘 「찾지 못함」)이다. 넣은 신청은 끝에 지운다.
set -u
cd "$(dirname "$0")/.."
export PYTHONIOENCODING=utf-8 PYTHONUTF8=1   # 윈도우 파이썬의 표준 입출력이 cp949 라 한글 JSON 이 깨진다
set -a; . ~/.church-admin/dev.env; set +a
ADMIN_PW=$(grep -E '^ADMIN_SECRET=' .env.dev | head -1 | cut -d= -f2-)
[[ "$DEV_URL" == *ktpwthwqzgcqcrmsafdo* ]] || { echo "개발 주소가 아니다 — 멈춤"; exit 1; }
BASE="$DEV_URL/functions/v1/api"
call() { curl -s -X POST "$BASE" -H "Content-Type: application/json" -H "apikey: $DEV_ANON" -H "Authorization: Bearer $DEV_ANON" --data-binary @-; }
jqn() { python -c 'import json,sys; d=json.load(sys.stdin); print(eval(sys.argv[1]))' "$1"; }
pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then echo "  ✓ $1 = $2"; pass=$((pass+1)); else echo "  ✗ $1 = $2  (기대 $3)"; fail=$((fail+1)); fi; }

# 한글은 명령줄 리터럴이 아니라 UTF-8 파일 본문으로 보낸다(curl 한글 인코딩 함정)
UID_=$(printf '%s' '{"action":"login","type":"교구","gu":"믿음","mok":"99","name":"화면점검"}' | call | jqn 'd["user_id"]')
[ -n "$UID_" ] || { echo "로그인 실패"; exit 1; }
OPEN=$(printf '%s' '{"action":"ministryCatalog"}' | call | jqn 'bool((d.get("period") or {}).get("isOpen"))')

echo "[문 검사]"
chk "user_id 없음" "$(printf '%s' '{"action":"ministryHistoryMine"}' | call | jqn 'd.get("error")')" "no-user"
if [ "$OPEN" = "False" ]; then
  chk "기간 밖·비번 없음" "$(printf '{"action":"ministryHistoryMine","user_id":"%s"}' "$UID_" | call | jqn 'd.get("error")')" "closed"
  chk "preview 깃발은 안 통한다" "$(printf '{"action":"ministryHistoryMine","user_id":"%s","preview":true}' "$UID_" | call | jqn 'd.get("error")')" "closed"
else
  echo "  − 개발 사역신청 기간이 열려 있어 「closed」 두 줄은 건너뜀"
fi

echo "[관리자 비번으로 — 교회 어드민까지]"
M=$(printf '{"action":"ministryHistoryMine","user_id":"%s","pw":"%s"}' "$UID_" "$ADMIN_PW" | call)
chk "ok" "$(jqn 'd.get("ok")' <<< "$M")" "True"
chk "found(믿음-99 는 목장 모름)" "$(jqn 'd.get("found")' <<< "$M")" "False"
chk "who.name" "$(jqn 'd["who"]["name"]' <<< "$M")" "화면점검"
chk "user_id 칸 없음" "$(jqn '"user_id" in json.dumps(d)' <<< "$M")" "False"
R=$(printf '{"action":"ministryHistoryRequest","user_id":"%s","pw":"%s","kind":"find_me","detail":"smoke"}' "$UID_" "$ADMIN_PW" | call)
chk "찾아 주세요" "$(jqn 'd.get("ok")' <<< "$R")" "True"
R2=$(printf '{"action":"ministryHistoryRequest","user_id":"%s","pw":"%s","kind":"find_me"}' "$UID_" "$ADMIN_PW" | call)
chk "두 번째 찾아 주세요" "$(jqn 'd.get("error")' <<< "$R2")" "already-open"
R3=$(printf '{"action":"ministryHistoryRequest","user_id":"%s","pw":"%s","kind":"not_mine","history_id":1}' "$UID_" "$ADMIN_PW" | call)
chk "찾지 못했는데 줄 정정" "$(jqn 'd.get("error")' <<< "$R3")" "not-found"
M2=$(printf '{"action":"ministryHistoryMine","user_id":"%s","pw":"%s"}' "$UID_" "$ADMIN_PW" | call)
chk "현황 첫 줄" "$(jqn 'd["requests"][0]["kind"] + "/" + d["requests"][0]["status"]' <<< "$M2")" "find_me/신청"

# 정리 — 이 계정의 신청을 지운다(service key)
SVC_AUTH=(); [[ "$DEV_SERVICE_KEY" == sb_secret_* ]] || SVC_AUTH=(-H "Authorization: Bearer $DEV_SERVICE_KEY")
curl -s -o /dev/null -w "  정리 %{http_code}\n" -X DELETE "$DEV_URL/rest/v1/ministry_history_requests?user_id=eq.$UID_" \
  -H "apikey: $DEV_SERVICE_KEY" "${SVC_AUTH[@]}"

echo "통과 $pass · 실패 $fail"
[ "$fail" = 0 ]
```

- [ ] **Step 5: 개발에 배포하고 스모크를 돌린다**

```bash
git status --short supabase/functions    # 내 api/index.ts 말고 남의 것이 있으면 멈춘다(작업 트리가 통째로 나간다)
supabase functions deploy api --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo
bash tests/ministry-history-smoke.sh
```
Expected: 끝 줄 `통과 N · 실패 0`, 정리 `204`(또는 `200`).

- [ ] **Step 6: 커밋**(공용 파일 — 남의 hunk 가 없는지 먼저)

```bash
git diff --stat supabase/functions/api/index.ts js/api.js
git add tests/ministry-history-smoke.sh
git diff supabase/functions/api/index.ts js/api.js   # 내 hunk 만이면 아래 그대로, 남의 것이 있으면 git apply --cached 로 내 것만
git add supabase/functions/api/index.ts js/api.js
git commit -m "feat(사역이력확인): api ministryHistoryMine·ministryHistoryRequest — 사역신청과 같은 문(preview 제외) · users 값으로 교회 어드민 내부 갈래" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git show --stat HEAD
```

---

### Task 6: 화면 순수 묶음 — HTML 짓기 · 입력 검사 (vm 시험)

**Files:**
- Modify: `app.js` — `// 칩 한 줄. ⚠️ 새 색을 만들지 않는다 — 켜진 칩만 남색, 꺼진 칩은 흰 바탕.` 줄 **바로 위**에 순수 묶음을 넣는다(`minTitleHtml` 함수 다음 자리)
- Create: `tests/ministry-history.test.cjs`
- Modify: `tools/preflight.py`(`PURE_TESTS` 에 한 줄)

**Interfaces:**
- Consumes: 기존 `minEsc(t)`(app.js). 서버 응답 모양(Task 5).
- Produces(전역 함수 · Task 7 이 부른다): `MH_LINE_KINDS: {k,t}[]` · `MH_KIND_TEXT` · `MH_OPEN` · `MH_DETAIL_MAX` · `MH_TEAM_MAX` · `MH_OPEN_MAX` · `mhErrText(code): string` · `mhWhoText(w): string` · `mhSubHtml(w): string` · `mhStepsHtml(status): string` · `mhOpenIds(requests): {[id]:true}` · `mhOpenCount(requests): number` · `mhHasOpenFind(requests): boolean` · `mhHistoryHtml(rows, requests): string`(줄마다 `<button class="mh-fix" data-fix="<id>">`) · `mhRequestsHtml(requests, rows): string` · `mhBodyHtml(d): string`(단추 id `mh-find`·`mh-missing`·`mh-exit`) · `mhCheck(f): string | null`.

- [ ] **Step 1: 실패하는 시험을 쓴다** — `tests/ministry-history.test.cjs`

```js
// 사역 이력 확인 — 화면 순수 묶음 검사(2026-10-01 · 설계 docs/superpowers/specs/2026-10-01-ministry-history-check-design.md §4).
//
//   node --test tests/ministry-history.test.cjs
//
// ⚠️ **꾸러미를 하나도 쓰지 않는다**(node:test·node:assert·node:fs·node:path·node:vm 뿐) — tools/preflight.py 가 배포 앞에 돌린다.
// app.js 는 브라우저용 전역 스크립트라 require() 할 수 없다. 두 표식 사이(순수 묶음)와 minEsc 를 잘라 vm 에서 돌린다.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(path.resolve(__dirname, '..'), 'app.js'), 'utf8');
const START = '// ── 사역 이력 확인 · 순수 ──', END = '// ── 사역 이력 확인 · 순수 끝 ──';
const start = source.indexOf(START), end = source.indexOf(END);
assert.ok(start >= 0 && end > start, 'app.js 에서 사역 이력 확인 순수 묶음 표식을 못 찾았다 — 이 검사가 낡았다');
const esc = /function minEsc\(t\) \{[\s\S]*?\n\}/.exec(source);
assert.ok(esc, 'app.js 에서 minEsc 를 못 찾았다 — 이 검사가 낡았다');
const ctx = vm.createContext({});
vm.runInContext(esc[0] + '\n' + source.slice(start, end), ctx);
const fn = (n) => { assert.equal(typeof ctx[n], 'function', n + ' 을 못 떼어 냈다'); return ctx[n]; };

const row = (id, year, committee, team, o = {}) => ({ id, year, committee, team, role_title: '', position: '집사', ...o });
const req = (o) => ({ id: 1, history_id: null, kind: 'find_me', detail: '', year: null, team_text: '', status: '신청', answer: '', created_at: '', ...o });

test('mhWhoText — 교구-목장 · 목장 99 는 교구만 · 교회학교는 부서·학년', () => {
  const w = fn('mhWhoText');
  assert.equal(w({ type: '교구', gu: '기쁨', mok: '12', name: '홍길동' }), '기쁨-12 홍길동');
  assert.equal(w({ type: '교구', gu: '기쁨', mok: '99', name: '홍길동' }), '기쁨 홍길동');
  assert.equal(w({ type: '교회학교', bu: '중등부', grade: '2학년', name: '홍길동' }), '중등부 2학년 홍길동');
  assert.equal(w(null), '');
});

test('mhStepsHtml — 지금 단계에 now · 「반영 안 함」은 끝 칸만 바뀐다', () => {
  const s = fn('mhStepsHtml');
  const mid = s('확인 중');
  assert.match(mid, /pl-step done"><i><\/i><span>신청/);
  assert.match(mid, /pl-step now"><i><\/i><span>확인 중/);
  assert.match(mid, /<span>반영<\/span>/);
  assert.match(s('반영 안 함'), /pl-step now"><i><\/i><span>반영 안 함/);
});

test('mhHistoryHtml — 해마다 묶고, 열린 신청이 있는 줄은 「신청함」 · 값은 escape', () => {
  const h = fn('mhHistoryHtml');
  const rows = [row(7, 2026, '교육위원회', '유년부', { role_title: '교사' }), row(8, 2026, '<b>', '팀'), row(3, 2025, '찬양위원회', '시온성가대')];
  const out = h(rows, [req({ history_id: 7, kind: 'not_mine', status: '확인 중' }), req({ history_id: 3, kind: 'not_mine', status: '반영' })]);
  assert.equal((out.match(/class="mh-year"/g) || []).length, 2);
  assert.ok(!out.includes('data-fix="7"'), '열린 신청 줄에 정정 단추가 있다');
  assert.ok(out.includes('신청함'));
  assert.ok(out.includes('data-fix="3"'), '끝난 신청 줄은 다시 정정할 수 있어야 한다');
  assert.ok(out.includes('유년부 교사'));
  assert.ok(out.includes('&lt;b&gt;') && !out.includes('<b>'));
  assert.match(h([], []), /아직 올라온 사역 기록이 없어요/);
});

test('mhRequestsHtml — 빠진 사역 · 찾아 주세요 · 줄 정정(빼 둔 줄은 「지난 기록」) · 담당자 말', () => {
  const r = fn('mhRequestsHtml');
  const out = r([
    req({ id: 3, kind: 'missing', year: 2023, team_text: '시온성가대', status: '반영', answer: '2023 시온성가대를 더했어요' }),
    req({ id: 2, kind: 'wrong_position', history_id: 9, detail: '권사였어요', status: '반영 안 함', answer: '명단 원본이 집사예요' }),
    req({ id: 1, kind: 'not_mine', history_id: 99 }),
  ], [row(9, 2025, '찬양위원회', '시온성가대')]);
  assert.match(out, /내 정정 신청 <b>3<\/b>건/);
  assert.ok(out.includes('빠진 사역(2023) — 시온성가대'));
  assert.ok(out.includes('2025 시온성가대 — 직분이 틀려요'));
  assert.ok(out.includes('지난 기록 — 내 것이 아니에요'));
  assert.ok(out.includes('명단 원본이 집사예요'));
  assert.equal(r([], []), '');
});

test('mhBodyHtml — 찾지 못하면 「찾아 주세요」(열린 것이 있으면 단추 없이) · 찾으면 빠진 사역 단추', () => {
  const b = fn('mhBodyHtml');
  const nf = b({ found: false, rows: [], requests: [] });
  assert.ok(nf.includes('id="mh-find"') && !nf.includes('id="mh-missing"') && nf.includes('id="mh-exit"'));
  assert.match(nf, /찾지 못했어요/);
  assert.ok(!b({ found: false, rows: [], requests: [req({})] }).includes('id="mh-find"'));
  const f = b({ found: true, rows: [row(1, 2025, '가', '나')], requests: [] });
  assert.ok(f.includes('id="mh-missing"') && !f.includes('id="mh-find"') && f.includes('data-fix="1"'));
});

test('mhCheck — 서버와 같은 규칙(그 밖에 설명 · 연도 · 부서팀 · 글자 수)', () => {
  const c = fn('mhCheck');
  assert.equal(c({ kind: 'not_mine', detail: '' }), null);
  assert.equal(c({ kind: 'other', detail: ' ' }), 'need-detail');
  assert.equal(c({ kind: 'other', detail: '가'.repeat(201) }), 'too-long');
  assert.equal(c({ kind: 'missing', year: '20', team_text: '팀' }), 'bad-year');
  assert.equal(c({ kind: 'missing', year: '2023', team_text: ' ' }), 'need-team');
  assert.equal(c({ kind: 'missing', year: '2023', team_text: '가'.repeat(101) }), 'too-long');
  assert.equal(c({ kind: 'missing', year: '2023', team_text: '시온성가대' }), null);
  assert.equal(c({ kind: 'find_me', detail: '' }), null);
});

test('mhOpenCount·mhErrText — 끝나지 않은 것만 센다 · 모르는 오류는 「잠시 뒤」', () => {
  assert.equal(fn('mhOpenCount')([req({ status: '신청' }), req({ status: '확인 중' }), req({ status: '반영' })]), 2);
  assert.match(fn('mhErrText')('already-open'), /이미 정정 신청/);
  assert.equal(fn('mhErrText')('???'), '잠시 뒤 다시 해 주세요.');
});
```

- [ ] **Step 2: 시험이 떨어지는지 본다**

Run: `node --test tests/ministry-history.test.cjs`
Expected: FAIL — `app.js 에서 사역 이력 확인 순수 묶음 표식을 못 찾았다`

- [ ] **Step 3: 순수 묶음을 넣는다** — `app.js`, `// 칩 한 줄. ⚠️ 새 색을 만들지 않는다` 줄 바로 위:

```js
// ── 사역 이력 확인 · 순수 ── (tests/ministry-history.test.cjs 가 이 표식부터 「순수 끝」 표식까지 떼어 vm 에서 돌린다)
// 설계: docs/superpowers/specs/2026-10-01-ministry-history-check-design.md §4 · 2026-10-01
// ⚠️ 여기서는 DOM·전역 상태를 건드리지 않는다(minEsc 만 빌려 쓴다 — 시험이 그 함수도 함께 떼어 온다).
// ⚠️ kind·status 글자는 교회 어드민 history-check.ts·SQL 008 CHECK 와 같다(세 곳) — 보이는 말을 바꾸려면 MH_KIND_TEXT 만.
const MH_LINE_KINDS = [
  { k: "not_mine", t: "내 것이 아니에요" },
  { k: "wrong_team", t: "팀·부서가 틀려요" },
  { k: "wrong_position", t: "직분이 틀려요" },
  { k: "other", t: "그 밖에" },
];
const MH_KIND_TEXT = {
  not_mine: "내 것이 아니에요", wrong_team: "팀·부서가 틀려요", wrong_position: "직분이 틀려요",
  other: "그 밖에", missing: "빠진 사역", find_me: "내 기록 찾아 주세요",
};
const MH_OPEN = ["신청", "확인 중"];
const MH_DETAIL_MAX = 200, MH_TEAM_MAX = 100, MH_OPEN_MAX = 20;
const MH_ERR = {
  closed: "아직 열리지 않았어요.",
  "no-user": "로그인 정보를 찾지 못했어요. 첫 화면에서 다시 로그인해 주세요.",
  "already-open": "이미 정정 신청을 내셨어요. 담당자가 확인하고 있어요.",
  "too-many": "확인을 기다리는 신청이 20건이에요. 담당자가 확인한 뒤 다시 내 주세요.",
  "need-detail": "어떤 점이 틀렸는지 한 줄로 적어 주세요.",
  "need-team": "부서나 팀 이름을 적어 주세요.",
  "bad-year": "연도를 숫자 네 자리로 적어 주세요(예: 2024).",
  "too-long": "글이 너무 길어요. 조금 줄여 주세요.",
  "not-yours": "이 기록은 지금 고칠 수 없어요. 화면을 다시 열어 주세요.",
  "not-found": "기록을 찾지 못해 이 신청은 낼 수 없어요.",
  "already-found": "기록을 이미 찾았어요. 줄마다 「정정」을 눌러 주세요.",
};
function mhErrText(code) { return MH_ERR[code] || "잠시 뒤 다시 해 주세요."; }

// 머리줄 「기쁨-12 홍길동」 — 목장 99(모름)는 교구만, 교회학교는 부서·학년
function mhWhoText(w) {
  if (!w) return "";
  const aff = w.type === "교회학교"
    ? [w.bu, w.grade].filter(Boolean).join(" ")
    : (w.mok && w.mok !== "99" ? w.gu + "-" + w.mok : (w.gu || ""));
  return (aff ? aff + " " : "") + (w.name || "");
}
function mhSubHtml(w) { return '<p class="min-sub">' + minEsc(mhWhoText(w)) + ' 성도님의 사역 기록</p>'; }

// 단계 줄 — 사역신청 minStepsHtml 과 같은 모양(.pl-steps). 「반영 안 함」은 반영과 나란한 끝이다(끝 칸만 바뀐다).
function mhStepsHtml(st) {
  const steps = st === "반영 안 함" ? ["신청", "확인 중", "반영 안 함"] : ["신청", "확인 중", "반영"];
  const i = steps.indexOf(st);
  return '<div class="pl-steps mh-steps">' + steps.map(function (t, k) {
    return '<div class="pl-step ' + (k < i ? "done" : k === i ? "now" : "") + '"><i></i><span>' + minEsc(t) + '</span></div>';
  }).join("") + '</div>';
}

function mhOpenIds(requests) {
  const s = {};
  (requests || []).forEach(function (r) { if (r.history_id != null && MH_OPEN.indexOf(r.status) >= 0) s[r.history_id] = true; });
  return s;
}
function mhOpenCount(requests) {
  return (requests || []).filter(function (r) { return MH_OPEN.indexOf(r.status) >= 0; }).length;
}
function mhHasOpenFind(requests) {
  return (requests || []).some(function (r) { return r.kind === "find_me" && MH_OPEN.indexOf(r.status) >= 0; });
}

// 기록 줄 — 해마다 묶는다(서버가 연도 내림차순으로 준다). 줄 하나 = 부서 · 팀 직책 · 직분 + [정정]
// ⚠️ 줄 열쇠는 기록 id 숫자뿐이다(교인ID·이름을 data-* 에 싣지 않는다).
function mhHistoryHtml(rows, requests) {
  if (!rows || !rows.length) return '<p class="mh-empty">아직 올라온 사역 기록이 없어요.</p>';
  const open = mhOpenIds(requests);
  let out = "", year = null;
  rows.forEach(function (r) {
    if (r.year !== year) {
      if (year !== null) out += '</div>';
      year = r.year;
      out += '<div class="mh-year"><div class="mh-year-t">' + minEsc(r.year) + '</div>';
    }
    const what = [r.committee, [r.team, r.role_title].filter(Boolean).join(" "), r.position]
      .filter(function (x) { return x && String(x).trim(); }).map(minEsc).join(' <span class="mh-dot">·</span> ');
    out += '<div class="mh-row"><span class="mh-what">' + what + '</span>' +
      (open[r.id]
        ? '<span class="min-st s-wait mh-tag">신청함</span>'
        : '<button class="mh-fix" data-fix="' + Number(r.id) + '">정정</button>') + '</div>';
  });
  return out + '</div>';
}

// 기록 줄 이름 「2025 시온성가대」 — 빼 둔 줄이라 목록에 없으면 「지난 기록」
function mhRowLabel(row) {
  return row ? row.year + " " + ([row.team, row.committee].filter(Boolean)[0] || "") : "지난 기록";
}

// 내 정정 신청 — 최근 것이 위(서버 차례 그대로). 담당자가 적은 말이 있으면 아래 한 줄(반영 안 함의 사유 등)
function mhRequestsHtml(requests, rows) {
  if (!requests || !requests.length) return "";
  const byId = {};
  (rows || []).forEach(function (r) { byId[r.id] = r; });
  return '<div class="min-sent mh-reqs"><div class="min-sent-t">📋 내 정정 신청 <b>' + requests.length + '</b>건</div>' +
    requests.map(function (q) {
      const head = q.kind === "missing" ? "빠진 사역(" + q.year + ") — " + q.team_text
        : q.kind === "find_me" ? MH_KIND_TEXT.find_me
        : mhRowLabel(q.history_id != null ? byId[q.history_id] : null) + " — " + (MH_KIND_TEXT[q.kind] || "");
      return '<div class="mh-req"><div class="mh-req-h">' + minEsc(head) + '</div>' +
        (q.detail ? '<div class="mh-req-d">' + minEsc(q.detail) + '</div>' : "") +
        mhStepsHtml(q.status) +
        (q.answer ? '<div class="mh-ans">💬 ' + minEsc(q.answer) + '</div>' : "") + '</div>';
    }).join("") + '</div>';
}

// 제목 아래 본문 전부 — d = ministryHistoryMine 응답 { found, rows, requests }
function mhBodyHtml(d) {
  const exit = '<button class="min-ghost" id="mh-exit">나가기</button>';
  if (!d.found) {
    return '<div class="min-note mh-none">교적의 교구·목장·이름과 맞는 기록을 찾지 못했어요.<br>' +
      '그사이 목장이 바뀌셨거나 같은 이름이 계시면 그럴 수 있어요. 아래를 누르시면 담당자가 찾아 드려요.</div>' +
      (mhHasOpenFind(d.requests) ? "" : '<button class="min-cta" id="mh-find">내 기록 찾아 주세요</button>') +
      mhRequestsHtml(d.requests, []) + exit;
  }
  return mhHistoryHtml(d.rows, d.requests) +
    '<button class="min-ghost mh-add" id="mh-missing">＋ 빠진 사역 알리기</button>' +
    mhRequestsHtml(d.requests, d.rows) + exit;
}

// 보내기 전 검사 — 교회 어드민 parseRequest 와 같은 규칙(정하는 것은 서버다 · 여기는 미리 알릴 뿐)
function mhCheck(f) {
  const detail = String(f.detail || "").trim();
  if (detail.length > MH_DETAIL_MAX) return "too-long";
  if (f.kind === "other" && !detail) return "need-detail";
  if (f.kind === "missing") {
    const y = Number(String(f.year || "").trim());
    if (!Number.isInteger(y) || y < 1950 || y > 2100) return "bad-year";
    const t = String(f.team_text || "").trim();
    if (!t) return "need-team";
    if (t.length > MH_TEAM_MAX) return "too-long";
  }
  return null;
}
// ── 사역 이력 확인 · 순수 끝 ──
```

- [ ] **Step 4: 시험이 붙는지 본다**

Run: `node --test tests/ministry-history.test.cjs`
Expected: PASS(7개)

- [ ] **Step 5: preflight 에 건다** — `tools/preflight.py` 의 `PURE_TESTS` 를:

```python
PURE_TESTS = ["tests/ranking-scope.test.cjs", "tests/send-push-opts.test.cjs",
              "tests/evening-push.test.cjs", "tests/ministry-history.test.cjs"]
```

Run: `python tools/preflight.py`
Expected: `[3]` 에 `tests/ministry-history.test.cjs — 7가지 통과`. (`[2]` 캐시태그 실패는 bump 전이라 지금은 무시 — Task 9 에서 맞춘다. **`[1]` 문법은 통과해야 한다.**)

- [ ] **Step 6: 커밋**

```bash
git add tests/ministry-history.test.cjs tools/preflight.py
git diff app.js        # 내 hunk(순수 묶음)만인지 — 남의 것이 있으면 git apply --cached
git add app.js
git commit -m "feat(사역이력확인): 화면 순수 묶음 — 해마다 묶은 기록·신청 현황·단계 줄·입력 검사 · vm 시험을 preflight 에" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git show --stat HEAD
```

---

### Task 7: 첫 화면 「사역현황」 묶음 · 사역 이력 확인 화면 · 정정 창 · CSS

**Files:**
- Modify: `app.js`(첫 화면 `renderSummary` 두 자리 · 첫 화면 단추 잇기 · 화면 함수 묶음 — Task 6 묶음의 「순수 끝」 표식 **바로 아래**)
- Modify: `style.css`(`.dark .min-sent-n { color: #e8ecf5; }` 줄 바로 아래)
- Modify: `tools/screen-sweep.py`(`("39-song", …)` 항목 바로 아래)

**Interfaces:**
- Consumes: Task 6 의 순수 함수 전부 · Task 5 `api.ministryHistoryMine`·`api.ministryHistoryRequest` · 기존 `ministryVisible()`·`minPw()`·`minTitleHtml()`·`minEsc()`·`minAlert()`·`loadUser()`·`renderSummary()`·`renderEntryScreen()`.
- Produces: 전역 `mhLoaded`·`mhData`·`mhErrCode` · `renderMinistryHistory(keepScroll)` · `mhLoad(u)` · `wireMinistryHistory(u)` · `mhAsk(u, row, mode)`(mode = `"line"`·`"missing"`·`"find_me"`) · 첫 화면 단추 `#open-ministry-history`.

- [ ] **Step 1: 첫 화면 — 「함께」의 🤝 줄을 뺀다.** 아래 한 줄을 지운다:

```js
    ${ministryVisible() ? `<button class="summary-help" id="open-ministry">🤝 사역신청${newBadge("ministry")}</button>` : ""}
```

- [ ] **Step 2: 첫 화면 — 「내 기록」 묶음 다음에 「사역현황」.** `<button class="summary-help" id="open-ranking">🏆 도전 순위 보기</button>` 줄 **바로 아래**에:

```js
    ${/* 사역현황(2026-10-01 친구 요청) — 사역신청과 사역 이력 확인을 한 묶음으로.
          둘 다 사역신청과 같은 문(ministryVisible — 미리보기·시험 참여자·신청 기간)이라 묶음 제목까지
          한 조건으로 감싼다(둘 다 숨는 날 제목만 남지 않게). 🗂️ — 📜 는 「내 안에 거하는 말씀」이 쓴다.
          설계 docs/superpowers/specs/2026-10-01-ministry-history-check-design.md §2 */""}
    ${ministryVisible() ? `<div class="grp-title">사역현황</div>
    <button class="summary-help" id="open-ministry">🤝 사역신청${newBadge("ministry")}</button>
    <button class="summary-help" id="open-ministry-history">🗂️ 사역 이력 확인</button>` : ""}
```

- [ ] **Step 3: 첫 화면 단추 잇기** — `if (minBtn) minBtn.addEventListener("click", () => { … });` 블록(세 줄) **바로 아래**:

```js
  const mhBtn = document.getElementById("open-ministry-history");   // 사역신청과 같은 문 — 기간 밖에는 없다
  if (mhBtn) mhBtn.addEventListener("click", () => {
    mhLoaded = false;             // 들어올 때마다 서버에서 지금 상태를 받는다
    renderMinistryHistory();
  });
```

- [ ] **Step 4: 화면 함수 묶음** — `// ── 사역 이력 확인 · 순수 끝 ──` 줄 **바로 아래**:

```js
// ── 사역 이력 확인 · 화면 (2026-10-01) ──
// ⚠️ 첫 화면 「사역현황」에서만 들어온다. 문은 서버가 다시 본다(closed → 「아직 열리지 않았어요」).
// ⚠️ api.* 는 error 가 있으면 throw 한다 — 오류 글자는 e.message 다.
let mhLoaded = false, mhData = null, mhErrCode = "";

async function mhLoad(u) {
  mhData = null; mhErrCode = "";
  if (!window.api || !api.ministryHistoryMine) { mhErrCode = "old"; mhLoaded = true; return; }   // 옛 js/api.js
  try {
    mhData = await api.ministryHistoryMine(u.user_id, minPw());
  } catch (e) {
    mhErrCode = (e && e.message) || "net";
  }
  mhLoaded = true;
}

function renderMinistryHistory(keepScroll) {
  const u = loadUser();
  if (!u) { renderEntryScreen(); return; }
  const appEl = document.getElementById("app");
  const wireExit = function () { const b = document.getElementById("mh-exit"); if (b) b.onclick = renderSummary; };
  if (!mhLoaded) {
    // ⚠️ 여기에도 나가기를 둔다 — 통신이 멎으면 빠져나갈 길이 없어진다
    appEl.innerHTML = '<div class="min-screen">' + minTitleHtml("사역 이력 확인") +
      '<p class="msg" id="mh-loading">기록을 불러오는 중…</p><button class="min-ghost" id="mh-exit">나가기</button></div>';
    window.scrollTo(0, 0);
    wireExit();
    // 그사이 나가셨으면 다시 그리지 않는다(첫 화면을 덮지 않게)
    mhLoad(u).then(function () { if (document.getElementById("mh-loading")) renderMinistryHistory(); });
    return;
  }
  if (!mhData) {
    const msg = mhErrCode === "closed" ? mhErrText("closed")
      : mhErrCode === "no-user" ? mhErrText("no-user")
      : "기록을 불러오지 못했어요.<br>잠시 뒤 다시 열어 주세요.";
    appEl.innerHTML = '<div class="min-screen">' + minTitleHtml("사역 이력 확인") +
      '<p class="msg">' + msg + '</p><button class="min-ghost" id="mh-exit">나가기</button></div>';
    window.scrollTo(0, 0);
    wireExit();
    return;
  }
  appEl.innerHTML = '<div class="min-screen mh-screen">' + minTitleHtml("사역 이력 확인", mhSubHtml(mhData.who)) +
    mhBodyHtml(mhData) + '</div>';
  window.scrollTo(0, keepScroll == null ? 0 : keepScroll);
  wireExit();
  wireMinistryHistory(u);
}

function wireMinistryHistory(u) {
  const byId = {};
  (mhData.rows || []).forEach(function (r) { byId[r.id] = r; });
  document.querySelectorAll("#app [data-fix]").forEach(function (b) {
    b.addEventListener("click", function () {
      const row = byId[Number(b.dataset.fix)];
      if (row) mhAsk(u, row, "line");
    });
  });
  const add = document.getElementById("mh-missing");
  if (add) add.addEventListener("click", function () { mhAsk(u, null, "missing"); });
  const find = document.getElementById("mh-find");
  if (find) find.addEventListener("click", function () { mhAsk(u, null, "find_me"); });
}

// 정정 창 — 고르기(줄 정정) + 한 줄 설명(+ 빠진 사역은 연도·부서·팀). 사역신청 창(.min-d-*)과 같은 모양.
// ⚠️ 브라우저 alert·prompt 를 쓰지 않는다. 오류는 창 안 한 줄(.mh-err)로 — 창 위에 창을 띄우지 않는다.
function mhAsk(u, row, mode) {
  if (mode !== "find_me" && mhOpenCount(mhData.requests) >= MH_OPEN_MAX) { minAlert(mhErrText("too-many")); return; }
  const head = mode === "missing" ? "빠진 사역 알리기"
    : mode === "find_me" ? "내 기록 찾아 주세요"
    : minEsc(row.year + " · " + [row.committee, [row.team, row.role_title].filter(Boolean).join(" ")].filter(Boolean).join(" · "));
  let kind = mode === "line" ? "" : mode;
  const box = document.createElement("div");
  box.className = "min-d-wrap";
  box.innerHTML = '<div class="min-d-box" role="dialog" aria-modal="true">' +
    '<div class="min-d-head"><div><div class="min-d-nm">' + head + '</div>' +
      '<div class="min-d-com">' + (mode === "line" ? "무엇이 틀렸나요?" : "담당자가 확인한 뒤 바로잡아 드려요") + '</div></div></div>' +
    '<div class="min-d-body">' +
      (mode === "line" ? '<div class="mh-kinds">' + MH_LINE_KINDS.map(function (x) {
        return '<button type="button" class="mh-kind" aria-pressed="false" data-kind="' + x.k + '">' + minEsc(x.t) + '</button>';
      }).join("") + '</div>' : "") +
      (mode === "missing"
        ? '<label class="mh-l" for="mh-year">연도</label>' +
          '<input class="min-alert-input mh-in" id="mh-year" inputmode="numeric" maxlength="4" placeholder="2024" autocomplete="off">' +
          '<label class="mh-l" for="mh-team">부서 · 팀</label>' +
          '<input class="min-alert-input mh-in" id="mh-team" maxlength="' + MH_TEAM_MAX + '" placeholder="찬양위원회 시온성가대" autocomplete="off">'
        : "") +
      '<label class="mh-l" for="mh-detail">한 줄 설명 <span class="mh-opt">' +
        (mode === "line" ? "(「그 밖에」는 꼭 적어 주세요)" : "(적지 않으셔도 돼요)") + '</span></label>' +
      '<textarea class="mh-ta" id="mh-detail" rows="3" maxlength="' + MH_DETAIL_MAX + '" placeholder="예: 그해에는 알토로 섬겼어요"></textarea>' +
      '<p class="mh-err" id="mh-err" hidden></p>' +
    '</div>' +
    '<div class="min-d-foot min-d-foot-row"><button class="min-ghost" data-cancel>그만두기</button>' +
      '<button class="min-cta" data-ok' + (mode === "line" ? " disabled" : "") + '>신청</button></div></div>';
  document.body.appendChild(box);
  const ok = box.querySelector("[data-ok]");
  const errEl = box.querySelector("#mh-err");
  const showErr = function (code) { errEl.textContent = mhErrText(code); errEl.hidden = false; };
  function close() {
    document.removeEventListener("keydown", esc);
    if (box.parentNode) box.parentNode.removeChild(box);
  }
  const esc = function (e) { if (e.key === "Escape") { e.preventDefault(); close(); } };
  document.addEventListener("keydown", esc);
  box.addEventListener("click", function (e) { if (e.target === box) close(); });
  box.querySelector("[data-cancel]").addEventListener("click", close);
  box.querySelectorAll(".mh-kind").forEach(function (b) {
    b.addEventListener("click", function () {
      kind = b.dataset.kind;
      box.querySelectorAll(".mh-kind").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      ok.disabled = false;
    });
  });
  ok.addEventListener("click", async function () {
    const f = {
      kind: kind, history_id: row ? row.id : null,
      detail: box.querySelector("#mh-detail").value,
      year: mode === "missing" ? box.querySelector("#mh-year").value : null,
      team_text: mode === "missing" ? box.querySelector("#mh-team").value : "",
    };
    const bad = mhCheck(f);
    if (bad) { showErr(bad); return; }
    ok.disabled = true;
    try {
      await api.ministryHistoryRequest(u.user_id, f, minPw());
    } catch (e) {
      ok.disabled = false;
      showErr(e && e.message);
      return;
    }
    close();
    const y = window.scrollY;
    await mhLoad(u);
    renderMinistryHistory(y);
    minAlert("정정 신청을 냈어요.\n담당자가 확인한 뒤 바로잡아 드려요.");
  });
}
```

- [ ] **Step 5: CSS** — `style.css` 의 `.dark .min-sent-n { color: #e8ecf5; }` 줄 바로 아래:

```css
/* 사역 이력 확인(2026-10-01) — 해마다 묶은 기록 줄 + [정정]. 새 색을 만들지 않는다(연한 바탕·남색 선만).
   ⚠️ 기록 줄은 「읽는 줄」이라 줄 전체를 단추로 만들지 않는다 — 누르는 것은 오른쪽 [정정] 하나. */
.mh-year { background: var(--light); border-radius: 12px; padding: 10px 12px; margin-bottom: 10px; }
.mh-year-t { font-size: .82rem; font-weight: 800; color: var(--navy); margin-bottom: 2px; }
.mh-row { display: flex; align-items: center; gap: 10px; margin-top: 6px; padding: 9px 12px;
  background: var(--white); border: 1.5px solid var(--border); border-radius: 10px; }
.mh-what { flex: 1; min-width: 0; font-size: .92rem; font-weight: 700; color: #222; word-break: keep-all; }
.mh-dot { color: var(--gray); font-weight: 500; }
.mh-fix { flex: none; font: inherit; font-size: .82rem; font-weight: 700; padding: 6px 12px; cursor: pointer;
  color: var(--navy); background: var(--white); border: 1.5px solid var(--navy); border-radius: 999px; }
.mh-tag { flex: none; margin-top: 0; }
.mh-empty { text-align: center; color: var(--gray); margin: 18px 0; }
.mh-add { margin: 4px 0 14px; }
.mh-none { margin-bottom: 12px; line-height: 1.65; }
.mh-req { margin-top: 8px; padding: 10px 12px; background: var(--white);
  border: 1.5px solid var(--border); border-radius: 10px; }
.mh-req-h { font-size: .9rem; font-weight: 700; color: #222; margin-bottom: 4px; word-break: keep-all; }
.mh-req-d { font-size: .84rem; color: var(--gray); margin-bottom: 8px; word-break: keep-all; }
.mh-steps { margin: 6px 2px 2px; }
.mh-ans { font-size: .84rem; color: #333; margin-top: 8px; word-break: keep-all; }
.mh-kinds { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 4px; }
.mh-kind { font: inherit; font-size: .9rem; font-weight: 700; padding: 11px 8px; border-radius: 10px; cursor: pointer;
  color: var(--navy); background: var(--white); border: 1.5px solid var(--border); word-break: keep-all; }
.mh-kind[aria-pressed="true"] { color: #fff; background: var(--navy); border-color: var(--navy); }
.mh-l { display: block; font-size: .8rem; font-weight: 800; color: var(--gray); margin: 12px 0 4px; }
.mh-opt { font-weight: 500; }
.mh-in { margin-top: 0; text-align: left; }
.mh-ta { display: block; width: 100%; font: inherit; font-size: .95rem; padding: 10px; resize: vertical;
  border: 1.5px solid var(--border); border-radius: 10px; background: var(--cream); color: #222; }
.mh-err { color: #c0392b; font-size: .84rem; margin: 8px 0 0; }
.dark .mh-year { background: #1e2637; }
.dark .mh-year-t { color: #cfe0ff; }
.dark .mh-row, .dark .mh-req { background: #232c3f; border-color: #3a4a68; }
.dark .mh-what, .dark .mh-req-h { color: #e8ecf5; }
.dark .mh-ans { color: #d8dee8; }
.dark .mh-fix, .dark .mh-kind { background: #1b2233; color: #cfe0ff; border-color: #3a4a68; }
.dark .mh-kind[aria-pressed="true"] { background: var(--navy); color: #fff; border-color: var(--navy); }
.dark .mh-ta { background: #1b2233; border-color: #3a4a68; color: #e8ecf5; }
.dark .mh-err { color: #ff8a7a; }
```

- [ ] **Step 6: screen-sweep 에 화면 셋** — `tools/screen-sweep.py` 의 `("39-song", …),` 항목 바로 아래(같은 들여쓰기):

```python
    # 사역 이력 확인(2026-10-01) — 문(시험 참여자·기간)이 닫힌 개발 계정이라 단추 대신 화면을 직접 그린다.
    #   기록 있음 · 찾지 못함 · 정정 창. 자료는 지어낸 것(서버를 부르지 않는다 — mhLoaded=true 로 막는다).
    ("40-ministry-history", ["mhLoaded=true; mhData={ok:true,who:{type:'교구',gu:'믿음',mok:'99',name:'화면점검'},found:true,"
                             "rows:[{id:1,year:2026,committee:'교육위원회',team:'유년부',role_title:'교사',position:'집사'},"
                             "{id:2,year:2026,committee:'찬양위원회',team:'시온성가대',role_title:'',position:'집사'},"
                             "{id:3,year:2025,committee:'봉사위원회',team:'주차팀',role_title:'',position:'집사'}],"
                             "requests:[{id:9,history_id:2,kind:'wrong_position',detail:'그해에는 권사였어요',year:null,team_text:'',status:'확인 중',answer:'',created_at:''},"
                             "{id:8,history_id:null,kind:'missing',detail:'',year:2023,team_text:'찬양위원회 호산나찬양대',status:'반영 안 함',answer:'2023 명단 원본에 없어 부서에 여쭤보고 있어요',created_at:''}]}; "
                             "renderMinistryHistory();"]),
    ("41-ministry-history-none", ["mhLoaded=true; mhData={ok:true,who:{type:'교구',gu:'믿음',mok:'99',name:'화면점검'},found:false,rows:[],requests:[]}; "
                                  "renderMinistryHistory();"]),
    ("42-ministry-history-ask", ["mhLoaded=true; mhData={ok:true,who:{type:'교구',gu:'믿음',mok:'99',name:'화면점검'},found:true,"
                                 "rows:[{id:1,year:2026,committee:'교육위원회',team:'유년부',role_title:'교사',position:'집사'}],requests:[]}; "
                                 "renderMinistryHistory(); mhAsk(loadUser(), mhData.rows[0], 'line');"]),
```

- [ ] **Step 7: 문법·순수 시험**

Run: `node --check app.js && node --test tests/ministry-history.test.cjs`
Expected: 오류 없음 · PASS

- [ ] **Step 8: localhost 에서 개발 DB 로 본다** — 내가 띄운 서버만 끈다(메모리 `stop-only-own-processes`)

```bash
python -m http.server 8000 &   # PID 를 적어 둔다
```
1. `http://localhost:8000/?preview=ministry` 로 열고 로그인(교구 믿음-99 화면점검). 오른쪽 위 「개발 DB」 띠 확인.
2. 첫 화면: 「내 기록」 다음에 **「사역현황」 제목 + 🤝 사역신청 + 🗂️ 사역 이력 확인**, 「함께」에는 🤝 가 없다.
3. 개발자 도구 콘솔에서 `sessionStorage.setItem("admin-pw", "<.env.dev 의 ADMIN_SECRET>")` 를 넣고(값을 어디에도 붙여 두지 않는다) 🗂️ 를 누른다 → 「찾지 못했어요」 + [내 기록 찾아 주세요] → 눌러서 신청 → 현황에 「내 기록 찾아 주세요 · 신청」 → 다시 누를 단추가 사라진다.
4. `?preview=ministry` 없이 열면 「사역현황」 묶음이 없다(시험 참여자·기간 밖).
5. 끝나면 이 계정의 시험 신청을 지운다(Task 5 스모크 끝의 DELETE 줄과 같은 명령) · 서버는 적어 둔 PID 로 끈다.

```bash
python tools/screen-sweep.py --steps 40-ministry-history,41-ministry-history-none,42-ministry-history-ask,01-summary
```
Expected: 세 화면 모두 JS 오류 0 · 가로 넘침 0(320·390) · 어두운 모드 사진에서 글이 읽힌다. `01-summary` 는 시험 계정이 시험 참여자가 아니라 「사역현황」이 **안 보이는 것**이 맞다.

- [ ] **Step 9: 커밋**

```bash
git diff --stat app.js style.css tools/screen-sweep.py
git diff app.js style.css      # 내 hunk 만인지 — 남의 것이 있으면 git apply --cached
git add app.js style.css tools/screen-sweep.py
git commit -m "feat(사역이력확인): 첫 화면 「사역현황」 묶음(🤝 사역신청 · 🗂️ 사역 이력 확인) · 기록·정정 창·현황 화면 · screen-sweep 셋" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git show --stat HEAD
```

---

### Task 8: 개인정보 안내 · 문서

**Files:**
- Modify: `privacy/index.html`(1항 표 · 3항 · 4항) · `app.js`(앱 안 개인정보 화면 목록 · 도움말 「수집 항목」)
- Modify(교회 어드민 worktree): `privacy.html`(7번 카드 다음에 8번) · `CLAUDE.md`
- Create: `docs/notes/ministry-history-check.md`
- Modify: `CLAUDE.md`(이 저장소 — 지도 표 한 줄)

**Interfaces:** 없음(문구).

- [ ] **Step 1: `privacy/index.html` 1항 표** — 「직분」 줄(`<td><b>직분</b><br>(성도·집사…`)의 `</tr>` 바로 아래에:

```html
  <tr>
    <td><b>사역 이력 정정 신청</b><br>(고르신 것 · 설명 글)</td>
    <td><b>「사역 이력 확인」에서 정정을 신청할 때만</b></td>
    <td>담당자가 사역 기록을 확인해 바로잡기 위해<br>
      「사역 이력 확인」은 로그인하신 <b>교구·목장(교회학교는 부서)·이름</b>으로 교인명부에서 같은 분을 찾아,
      해마다 교회 홈페이지에 올리던 사역 임명 기록(연도·부서·팀·직분)을 보여 드립니다.
      <b>신청만으로 기록이 바뀌지 않고</b> 담당자가 확인한 뒤 바로잡습니다.</td>
  </tr>
```

- [ ] **Step 2: `privacy/index.html` 3항** — 「…사람이 따로 지우지 않아도 사라집니다).」 다음 줄(`</p>` 앞)에:

```html
  사역 이력 정정 신청은 처리가 끝난 뒤에도 무엇을 고쳤는지 확인할 수 있게 보관하며, 지워 달라고 하시면 지웁니다.
```

- [ ] **Step 3: `privacy/index.html` 4항** — `<li><b>휴대폰 번호</b>는 필사 노트를 준비하는 담당자만 봅니다.</li>` 바로 아래에:

```html
  <li><b>사역 이력 정정 신청</b>은 신청하신 분과 사역신청 담당자만 봅니다.
      ⚠️ 이 앱은 비밀번호가 없어, 다른 분의 이름·소속으로 들어오면 그분의 사역 기록(연도·부서·팀·직분)이 보입니다 —
      해마다 교회 홈페이지에 올리던 내용만 보여 드리는 까닭입니다.</li>
```

- [ ] **Step 4: 앱 안 개인정보 화면** — `app.js` 의 `<li>사역 신청 시 <b>휴대폰 번호</b> (임명이 정해지면 삭제)<b>와 직분</b><br>` 로 시작하는 `<li>…</li>`(두 줄) 바로 아래에:

```html
            <li>「사역 이력 확인」에서 정정을 신청하실 때 <b>고르신 것과 설명 글</b><br>
              <small>로그인 교구·목장(교회학교는 부서)·이름으로 교인명부에서 찾은 사역 기록을 보여 드려요</small></li>
```

도움말 「수집 항목」 — `app.js` 의 `<b>사역 신청을 할 때는 휴대폰 번호와 직분</b>을 받습니다(본인 확인·교적 대조·임명 뒤 연락 — 번호는 임명이 정해지면 지웁니다).` 문장 바로 뒤에(같은 줄, 앞에 빈칸 하나):

```html
 <b>「사역 이력 확인」</b>은 로그인하신 교구·목장(교회학교는 부서)·이름으로 교인명부에서 같은 분을 찾아 지난 사역 임명 기록(연도·부서·팀·직분)을 보여 드리고, <b>정정을 신청하실 때만</b> 고르신 것과 설명 글을 받습니다(담당자가 확인한 뒤 바로잡습니다).
```

- [ ] **Step 5: 교회 어드민 `privacy.html`** — 「7. 성경필사(암송) 명단」 카드의 닫는 `</div>` 바로 아래(`</main>` 앞)에:

```html
  <div class="card">
    <h3>8. 사역 이력 정정 신청(성경암송 앱)</h3>
    <p>성경암송 앱의 「사역 이력 확인」에서 성도님이 지난 사역 기록의 정정을 신청하시면, 그 내용을 사역신청 담당자가 보고 처리해요.<br>
      앱에서 보여 드리는 것: 앱에 로그인하신 교구·목장(교회학교는 부서)·이름으로 교인명부에서 같은 소속에 그 이름이 한 분일 때만 그분을 찾아,
      사역 이력의 연도·부서·팀·직책·직분을 보여 드려요. 교인ID·연락처·생년월일·맞춤 근거는 앱으로 나가지 않아요.<br>
      받는 것: 고르신 정정 종류, 설명 글, (빠진 사역이면) 연도와 부서·팀 글, 신청 때의 로그인 소속·이름, 앱 계정 번호(담당자 화면에는 보이지 않아요).<br>
      보는 사람: 총괄 관리자와 「사역신청」 역할 담당자.<br>
      보관과 삭제: 처리가 끝난 뒤에도 무엇을 고쳤는지 확인할 수 있게 보관해요. 지워 달라고 하시려면 4번의 요청처로 말씀해 주세요.</p>
  </div>
```

- [ ] **Step 6: 함정 기록** — `docs/notes/ministry-history-check.md`

```markdown
# 사역현황 · 사역 이력 확인 · 정정 신청 (2026-10-01)

> **언제 읽나:** 첫 화면 「사역현황」 묶음 · `renderMinistryHistory` · `api` `ministryHistory*` · 교회 어드민 `internalMyHistory`·`internalHistoryRequest`·`ministry_history_requests` 를 손볼 때
> 설계 `docs/superpowers/specs/2026-10-01-ministry-history-check-design.md` · 계획 `docs/superpowers/plans/2026-10-01-ministry-history-check.md`

- **문은 사역신청과 하나다(`ministryVisible()` · 서버는 기간·시험 참여자·관리자 비번).** 기간(12/13~12/27)이 끝나면 「사역 이력 확인」도 숨는다 — 친구 결정 「같이 오픈」. 늘 열고 싶어지면 게이트를 그때 나눈다.
- ⚠️ **`b.preview` 는 받지 않는다** — 서버가 확인할 수 없다. 미리보기 화면은 관리자 비번(`minPw()`)으로만 통과한다.
- **본인 찾기 규칙은 교회 어드민 `people-match.ts` `matchLoginPerson` 한 곳**(교구 = 교구+목장+이름, 교회학교 = 부서+이름 · `sameAffiliation` 그대로). ⚠️ 그 파일의 `sameAffiliation`·`mokNumber` 를 고치면 앱 화면도 바뀐다. 앱 쪽에 규칙을 복사하지 말 것.
- ⚠️ **로그인은 본인 확인이 아니다** — 다른 분 이름·소속으로 들어오면 그분 기록이 보인다(친구 확인). 그래서 보이는 칸을 홈페이지 명단에 오르던 칸(연도·부서·팀·직책·직분)으로만 좁혔고 **신청만으로 기록이 바뀌지 않는다.** 칸을 늘리려면 이 전제부터 다시 볼 것.
- **교회 어드민 함수의 새 입구:** `x-internal-key` 머리가 있으면 토큰 검사 **앞에서** 내부 갈래로만 간다. 내부 액션은 `ACTION_ROLES` 에 없다(토큰으로 부르면 unknown-action — 시험이 본다).
- **kind·status 글자는 세 곳**(SQL 008 CHECK · `history-check.ts` · `app.js` `MH_*`). 보이는 말만 바꾸려면 `MH_KIND_TEXT`.
- **응답 칸은 `historyRowOut`·`requestOut` 이 정한다** — 교인ID·`user_id`·맞춤 근거·그때 목장을 싣지 않는다(`tests/history-check.dev.test.mjs` 가 키 집합과 숫자·uuid 누출을 본다).
- 앱 계정이 합쳐지면(`member-merge`) 옛 계정의 정정 신청은 새 계정 화면에 안 보인다(표가 `user_id` 로 묶는다 — 합치기 코드는 이 표를 모른다). 생기면 담당자가 처리하면 된다.
- **남은 것 — 담당자 처리 메뉴(교회 어드민 · 설계 §7).** ⚠️ **12/13 신청 기간 전에 있어야 한다** — 기간이 열리면 성도님 모두에게 단추가 보인다.
```

- [ ] **Step 7: 지도 한 줄** — 이 저장소 `CLAUDE.md` 의 표에서 `| 사역신청 **관리 화면**(단추·여백·구조 표준) | \`docs/notes/ministry-admin-ui.md\` |` 줄 바로 아래에:

```markdown
| 첫 화면 「사역현황」 · 사역 이력 확인 · 정정 신청(2026-10-01 · 문은 사역신청과 하나) | `docs/notes/ministry-history-check.md` |
```

교회 어드민 `CLAUDE.md` 의 `## ⚠️ 함정` 절 맨 끝에:

```markdown
- **`x-internal-key` 머리가 있는 요청은 토큰 검사 앞에서 내부 갈래(`internalRoute`)로만 간다**(성경암송 「사역 이력 확인」 · 2026-10-01). 내부 액션은 `ACTION_ROLES` 에 넣지 않는다 — 토큰으로 부르면 unknown-action. 설계 v2 `docs/superpowers/specs/2026-10-01-ministry-history-check-design.md`.
```

- [ ] **Step 8: 커밋 — 두 저장소 따로**

```bash
cd /c/Projects/bible-memorize-church-app-v2
git add privacy/index.html docs/notes/ministry-history-check.md CLAUDE.md
git diff app.js        # 개인정보 두 줄만인지 — 남의 것이 있으면 git apply --cached
git add app.js
git commit -m "docs(사역이력확인): 개인정보 안내(1·3·4항 · 앱 안 두 곳) · 함정 기록 · 지도 한 줄" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git show --stat HEAD

cd /c/Projects/church-admin/.worktrees/history-check
git add privacy.html CLAUDE.md
git commit -m "docs(사역이력확인): 개인정보 안내 8번 · 함정에 내부 갈래 한 줄" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 운영 반영(친구 허락 뒤 · b6 의 `ministry_history` 가 운영에 있은 뒤)

**Files:** 없음(배포·합치기)

**Interfaces:** 없음.

- [ ] **Step 1: 앞 조건을 본다** — 하나라도 아니면 멈추고 친구에게 알린다.

```bash
supabase --workdir ~/.church-admin/supa-prod db query --linked "select (select count(*) from users) as users, to_regclass('public.ministry_history') as mh, to_regclass('public.ministry_history_requests') as mhr"
```
Expected: `users` 사백 넘음(운영 맞음) · `mh` = `ministry_history`(b6 운영 반영 끝) · `mhr` = null(아직). **`mh` 가 null 이면 멈춘다.** 친구에게 「운영 SQL 008 · 교회 어드민 함수 · api · 화면 순서로 올려도 될까요」를 묻고 허락을 받는다.

- [ ] **Step 2: 운영 SQL 008 → 노출 점검**

```bash
supabase --workdir ~/.church-admin/supa-prod db query --linked -f C:/Projects/church-admin/.worktrees/history-check/supabase/sql/008_ministry_history_requests.sql
supabase --workdir ~/.church-admin/supa-prod db query --linked -f C:/Projects/church-admin/supabase/sql/check-authenticated-exposure.sql
```
Expected: 노출 점검 0행.

- [ ] **Step 3: 교회 어드민 — main 에 합치고 운영 함수 배포 → 푸시**

```bash
cd /c/Projects/church-admin/.worktrees/history-check && git merge main --no-edit && python tools/preflight.py
cd /c/Projects/church-admin && git status --short && git merge history-check --no-edit
git status --short supabase/functions        # 비어 있어야 한다
supabase functions deploy church-admin --no-verify-jwt --project-ref xnomlgydifiqiybervtf
git push origin main
```
Expected: preflight 실패 0 · 배포 성공 · Actions 성공.

- [ ] **Step 4: 성경암송 `api` 운영 배포**

```bash
cd /c/Projects/bible-memorize-church-app-v2
git status --short supabase/functions        # 남의 커밋 안 한 것이 없어야 한다
supabase functions deploy api --no-verify-jwt --project-ref xnomlgydifiqiybervtf
```
운영 확인(읽기만 — 신청은 넣지 않는다): 운영 공개 키로 `{"action":"ministryHistoryMine","user_id":"00000000-0000-4000-8000-000000000000"}` → 기간 밖이면 `closed`(기간 중이면 `no-user`). `unknown action` 이 나오면 배포가 안 된 것이다.

- [ ] **Step 5: 화면 — bump → preflight → 푸시 → 이번 판 표식 확인**

```bash
python tools/bump.py && python tools/preflight.py
git diff --stat            # bump 가 바꾼 파일(index.html·app.js 등)만인지 — 남의 hunk 가 섞였으면 git apply --cached 로 bump 줄만
git add index.html app.js
git commit -m "chore: bump — 사역현황 묶음 · 사역 이력 확인" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
V=$(grep -o 'app.js?v=[0-9a-z]*' index.html | head -1 | cut -d= -f2)
curl -s "https://gocheok.onlybible.kr/app.js?v=$V" | grep -o 'APP_BUILD = "[0-9a-z]*"'
curl -s "https://gocheok.onlybible.kr/app.js?v=$V" | grep -c "open-ministry-history"
```
Expected: `APP_BUILD` 가 `$V` 와 같다 · 둘째 숫자 1 이상(이번 판에만 있는 표식).

- [ ] **Step 6: 시험 참여자 실기기 확인을 친구에게 부탁한다** — 「🧪 시험 참여자 계정으로 첫 화면 「사역현황」 → 🗂️ 사역 이력 확인 → 기록이 맞는지 · 정정 한 번」. 들어온 시험 신청은 담당자 처리 메뉴(다음 조각)가 생길 때까지 운영 표에 남는다.

- [ ] **Step 7: 기록** — 메모리에 「사역 이력 확인 운영 반영」 한 장(무엇이 운영에 있나 · 다음 조각 = 담당자 처리 메뉴, 12/13 전) · 이 저장소 `CLAUDE.md` 「다음 작업」에 한 줄. worktree 는 친구 확인 뒤 `git worktree remove .worktrees/history-check`.
