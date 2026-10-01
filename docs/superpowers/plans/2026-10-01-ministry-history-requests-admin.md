# 교회 어드민 「📮 정정 신청」 처리 메뉴 · 직분 정정 빼기 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 성경암송 앱에서 들어온 사역 이력 정정 신청을 교회 어드민 담당자가 「📮 정정 신청」 메뉴에서 보고 확인 중 → 반영 / 반영 안 함(사유)으로 처리하게 하고, 그 앞에 「직분이 틀려요」 종류를 앱·서버·DB 에서 뺀다(직분은 교적 기준).

**Architecture:** 처리 규칙과 응답 모양은 이미 있는 순수 모듈 `history-check.ts` 에 더한다(서버·Node 시험이 같은 파일). 서버 액션 둘(`historyRequestList`·`historyRequestSet` · 역할 `ministry`)은 `index.ts` 에, 화면은 순수 `requests-logic.js` + 손잡이 `requests.js`. 실제 기록 고침은 b6 「📜 사역 이력」 줄 창으로 넘기는 주소(`#/mn-history?row=` · `?q=`)만 만든다.

**Tech Stack:** 지금과 같음 — 교회 어드민: 빌드 없는 ES 모듈 화면 · Deno Edge Function(`npm:@supabase/supabase-js@2.117.2`) · `node --experimental-strip-types --test` · Postgres. 성경암송: `app.js` · `node --test`(.cjs).

**설계:** `docs/superpowers/specs/2026-10-01-ministry-history-requests-admin-design.md`(친구 승인 2026-10-01) — **요구의 원본.** 앞선 기능: `2026-10-01-ministry-history-check-design.md` · 계획 `docs/superpowers/plans/2026-10-01-ministry-history-check.md`(그 Task 9 가 운영 반영).

**코드 자리:** 교회 어드민 worktree `c:\Projects\church-admin\.worktrees\history-check`(가지 `history-check` — 앞선 기능이 이미 있다). 성경암송 파일은 `c:\Projects\bible-memorize-church-app-v2`(`main`).

## Global Constraints

- **직분은 정정하지 않는다 — 교적 기준(친구 결정).** 정정 종류는 줄 정정 `not_mine`·`wrong_team`·`other` + `missing`·`find_me` 다섯. `wrong_position` 은 앱 화면·교회 어드민 서버·SQL CHECK·시험 어디에도 남기지 않는다. 줄마다 보이는 **그해 명단의 직분은 그대로** 보여 준다.
- **처리 상태:** 담당자가 고르는 값은 `확인 중`·`반영`·`반영 안 함`(DB 값 그대로 — `신청`은 성도님이 낸 상태). 끝나지 않음 = `신청`·`확인 중`. 끝난 신청도 「다시 열기」 = `확인 중`.
- **규칙:** 답 300자 · `반영 안 함`은 답 필수(`need-answer`) · `not_mine` 을 `반영`할 때만 `verified===true` 필수(`need-verified`) · `expect`(마지막으로 본 `updated_at`)가 다르면 `conflict` · 다시 열기가 부분 unique 색인에 걸리면(23505) `already-open`.
- **응답에 싣지 않는 칸: `user_id`·`person_id`·`handled_by`.** 목록 줄 칸은 정확히 `answer,created_at,detail,found,handled_at,id,kind,row,status,team_text,updated_at,who,year`(`found` = `person_id` 있음 · `row` = `{id,year,committee,team,role_title,position,deleted}` 또는 null · `who` = `{type,group,sub,name}`).
- **기록:** 처리마다 「바꾼 기록」 `history.request { id, kind, from, to, verified }` — 이름·교인ID·답 글은 싣지 않는다.
- **알림 없음.** 신청 지우기 없음.
- **새 액션 = `authz.ts` `ACTION_ROLES` + `index.ts` `switch` case + `tests/server.dev.test.mjs` `PROBE` — 셋 다.** `tests/authz.test.mjs` 의 ministry 액션 목록(정확 대조)도 함께.
- **화면:** 시스템 창(`alert`·`confirm`·`<select>`) 금지 — `dialog`/`toast`/`openForm`/`picker.js` 만 · 창 위에 창을 띄우지 않는다(오류는 `openForm` 의 창 안 빨간 줄) · 모든 값 `esc` · CSS 는 `.hr-*`(b6 「📜 사역 이력」이 `.mh-*` 를 쓴다) · PC 1366×657 · 폰 390·320 가로 넘침 0.
- **개발 먼저.** 개발 `ktpwthwqzgcqcrmsafdo` · 운영 `xnomlgydifiqiybervtf` 는 이 계획에서 건드리지 않는다(운영은 앞선 계획 Task 9). SQL 은 `supabase --workdir ~/.church-admin/supa-dev db query --linked -f <절대 경로>` · 개발인지 먼저(`select count(*) from users` 가 수십이면 개발 · 사백이 넘으면 멈춤).
- **개발 church-admin 함수는 여러 가지가 번갈아 덮는다** — 개발 시험 직전에 `git merge main --no-edit`(충돌이면 멈춤) → `git status --short supabase/functions` 비어 있음 → `supabase functions deploy church-admin --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo`.
- `~/.church-admin/dev.env` 의 `DEV_SERVICE_KEY` 는 옛 형식이다 — REST·auth admin 에는 통하지만 **내부 갈래(`x-internal-key`)에는 안 통한다.** 이 계획의 개발 시험은 카카오 대신 이메일 로그인 담당자 토큰으로 부르므로 상관없다.
- **진짜 교인 이름·교인ID 금지** — 시험은 `ca-test-hr-<STAMP>-…`·`홍길동` 같은 지어낸 이름.
- `index.ts` 의 기존 import 줄은 고치지 않고 **새 줄로** 더한다(이미 들인 이름을 다시 적으면 두 번 선언 = 배포 실패).
- 성경암송 저장소는 여러 세션이 함께 쓴다 — 커밋에는 내 hunk 만(`git diff` 로 보고, 남의 것이 있으면 `git apply --cached`), 경로 없이 커밋한 뒤 `git show --stat HEAD`. 로컬 `main` 은 `origin` 과 갈라져 있다(알고 있음) — pull·push·rebase 하지 않는다.
- 커밋 메시지 끝 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`(명령은 `-m "<제목>" -m "Co-Authored-By: …"`). **푸시하지 않는다.**

## 파일 구조

| 파일 | 만듦/고침 | 맡는 것 |
|---|---|---|
| (교회 어드민) `supabase/sql/008_ministry_history_requests.sql` | 고침 | CHECK 두 곳에서 `wrong_position` 빼기 |
| (교회 어드민) `supabase/functions/church-admin/history-check.ts` | 고침 | `REQ_LINE_KINDS` 줄이기 · 처리 규칙·응답 모양(끝에 더함) |
| (교회 어드민) `supabase/functions/church-admin/index.ts` | 고침 | import 한 줄 · `hrRows`·`historyRequestList`·`historyRequestSet` · switch 두 줄 |
| (교회 어드민) `supabase/functions/church-admin/authz.ts` | 고침 | 액션 둘 |
| (교회 어드민) `js/menus/ministry/requests-logic.js` · `requests.js` | 만듦 | 화면 순수 · 손잡이 |
| (교회 어드민) `js/menus/registry.js` · `js/menus/system/audit.js` · `css/admin.css` · `privacy.html` | 고침 | 메뉴 줄 · 기록 이름 · `.hr-*` · 안내 한 줄 |
| (교회 어드민) `tests/history-check.test.mjs` · `tests/history-check.dev.test.mjs` · `tests/authz.test.mjs` · `tests/server.dev.test.mjs` | 고침 | 시험 |
| (교회 어드민) `tests/requests-logic.test.mjs` · `tests/history-requests.dev.test.mjs` | 만듦 | 시험 |
| `app.js` · `tests/ministry-history.test.cjs` · `tests/ministry-history-found.dev.py` · `tools/screen-sweep.py` | 고침 | 직분 정정 빼기 |
| `docs/superpowers/specs/2026-10-01-ministry-history-check-design.md` · `docs/notes/ministry-history-check.md` · `docs/superpowers/plans/2026-10-01-ministry-history-check.md` | 고침 | 문서 |

---

### Task 1: 「직분이 틀려요」 빼기 — 앱·서버·SQL·시험(두 저장소) · 개발 반영

**Files:**
- Modify(교회 어드민): `supabase/functions/church-admin/history-check.ts`(8줄 `REQ_LINE_KINDS`) · `supabase/sql/008_ministry_history_requests.sql`(16·30줄) · `tests/history-check.test.mjs` · `tests/history-check.dev.test.mjs`(109·127줄)
- Modify(성경암송): `app.js`(`MH_LINE_KINDS`·`MH_KIND_TEXT`) · `tests/ministry-history.test.cjs`(60·65줄 근처) · `tests/ministry-history-found.dev.py`(207·208·226줄 근처) · `tools/screen-sweep.py`(`40-ministry-history` 의 `kind:'wrong_position'`) · `docs/superpowers/specs/2026-10-01-ministry-history-check-design.md`(69·76·109줄 근처) · `docs/notes/ministry-history-check.md`
- Create(커밋 안 함): `C:\Projects\bible-memorize-church-app-v2\.superpowers\sdd\hr-008-dev-alter.sql`

**Interfaces:**
- Produces: `REQ_LINE_KINDS = ["not_mine", "wrong_team", "other"]` · `REQ_KINDS = [...REQ_LINE_KINDS, "missing", "find_me"]` · 앱 `MH_LINE_KINDS` 세 칸 · DB CHECK 다섯 값.

- [ ] **Step 1: 실패하는 시험을 더한다** — 교회 어드민 `tests/history-check.test.mjs` 의 history-check.ts import 줄(`HISTORY_OUT_KEYS, REQUEST_OUT_KEYS, REQ_OPEN_MAX, …` 로 시작하는 블록)에 `REQ_KINDS, REQ_LINE_KINDS,` 를 더하고, 파일 끝에:

```js
test("직분은 정정하지 않는다 — 「직분이 틀려요」(wrong_position)는 종류에 없다(교적 기준 · 2026-10-01)", () => {
  assert.deepEqual(REQ_LINE_KINDS, ["not_mine", "wrong_team", "other"]);
  assert.deepEqual(REQ_KINDS, ["not_mine", "wrong_team", "other", "missing", "find_me"]);
  assert.deepEqual(parseRequest({ kind: "wrong_position", history_id: 1 }), { ok: false, error: "bad-kind" });
});
```

성경암송 `tests/ministry-history.test.cjs` 끝에:

```js
test('직분은 정정하지 않는다 — 순수 묶음에 wrong_position·「직분이 틀려요」가 없다(교적 기준 · 2026-10-01)', () => {
  const block = source.slice(start, end);
  assert.ok(!block.includes('wrong_position'), 'wrong_position 이 남았다');
  assert.ok(!block.includes('직분이 틀려요'), '「직분이 틀려요」가 남았다');
});
```

- [ ] **Step 2: 떨어지는지 본다**

Run: `cd /c/Projects/church-admin/.worktrees/history-check && node --experimental-strip-types --test tests/history-check.test.mjs` → FAIL(REQ_LINE_KINDS 길이 넷)
Run: `cd /c/Projects/bible-memorize-church-app-v2 && node --test tests/ministry-history.test.cjs` → FAIL(wrong_position 이 남았다)

- [ ] **Step 3: 고친다**

교회 어드민 `history-check.ts` 8줄을:
```ts
// 「직분이 틀려요」(wrong_position)는 넣지 않는다 — 직분은 교적 기준(친구 결정 2026-10-01). 직분이 틀리면 교적에서 고친다.
export const REQ_LINE_KINDS = ["not_mine", "wrong_team", "other"];
```
`008_ministry_history_requests.sql` 16줄 `check (kind in ('not_mine', 'wrong_team', 'wrong_position', 'other', 'missing', 'find_me'))` → `check (kind in ('not_mine', 'wrong_team', 'other', 'missing', 'find_me'))` · 30줄 `(kind in ('not_mine', 'wrong_team', 'wrong_position', 'other'))` → `(kind in ('not_mine', 'wrong_team', 'other'))` · 머리 주석에 한 줄 `-- 2026-10-01 「직분이 틀려요」(wrong_position) 뺌 — 직분은 교적 기준(운영에 돌리기 전이라 파일을 고쳤다 · 개발은 제약을 다시 만들었다).`
`tests/history-check.dev.test.mjs` 109줄 `kind: "wrong_position", history_id: hist.a, detail: "그해에는 권사였어요"` → `kind: "wrong_team", history_id: hist.a, detail: "그해에는 호산나찬양대였어요"` · 127줄 기대 `["find_me", "missing", "wrong_position"]` → `["find_me", "missing", "wrong_team"]`.

성경암송 `app.js` — `MH_LINE_KINDS` 의 `{ k: "wrong_position", t: "직분이 틀려요" },` 줄을 지우고 배열 위 주석 끝에 `// ⚠️ 직분은 정정하지 않는다 — 교적 기준(2026-10-01 친구 결정). 줄의 그해 직분은 그대로 보여 준다.` 한 줄 · `MH_KIND_TEXT` 에서 `wrong_position: "직분이 틀려요", ` 를 지운다(나머지 그대로).
`tests/ministry-history.test.cjs` — `kind: 'wrong_position', history_id: 9, detail: '권사였어요'` → `kind: 'wrong_team', history_id: 9, detail: '호산나찬양대였어요'` · `'2025 시온성가대 — 직분이 틀려요'` → `'2025 시온성가대 — 팀·부서가 틀려요'`.
`tests/ministry-history-found.dev.py` — `kind="wrong_position"` → `kind="wrong_team"`(설명 「그해엔 호산나찬양대였어요」) · 표시 글 `wrong_position on a` → `wrong_team on a` · 기대 `["missing", "wrong_position"]` → `["missing", "wrong_team"]`.
`tools/screen-sweep.py` — `kind:'wrong_position',detail:'그해에는 권사였어요'` → `kind:'wrong_team',detail:'그해에는 호산나찬양대였어요'`.
설계 `2026-10-01-ministry-history-check-design.md` — 69줄 그림 `2025 시온성가대 — 직분이 틀려요` → `— 팀·부서가 틀려요` · 76줄 고르기 목록에서 `직분이 틀려요 / ` 빼기 · 109줄 `kind` 값 목록에서 `` `wrong_position` · `` 빼기 · §0 표 아래에 한 줄 `- 2026-10-01 추가 결정: **직분은 정정하지 않는다 — 교적 기준.** 「직분이 틀려요」를 뺐다(줄의 그해 직분은 그대로 보인다).`
`docs/notes/ministry-history-check.md` — 「kind·status 글자는 세 곳」 줄 뒤에 한 줄 `- **직분은 정정하지 않는다(교적 기준 · 2026-10-01 친구 결정).** 「직분이 틀려요」(wrong_position)를 세 곳 모두에서 뺐다 — 되살리지 말 것. 줄의 그해 직분 표시는 그대로.`

- [ ] **Step 4: 시험이 붙는지 본다**

Run: `cd /c/Projects/church-admin/.worktrees/history-check && node --experimental-strip-types --test tests/history-check.test.mjs && python tools/preflight.py` → PASS · 실패 0
Run: `cd /c/Projects/bible-memorize-church-app-v2 && node --check app.js && node --test tests/ministry-history.test.cjs && python tools/preflight.py` → PASS([1]·[3] 통과 — [2] 캐시태그는 bump 전이라 실패해도 이 과제 몫 아님)

- [ ] **Step 5: 개발 DB 제약을 다시 만든다** — `C:\Projects\bible-memorize-church-app-v2\.superpowers\sdd\hr-008-dev-alter.sql`:

```sql
-- 개발 전용 · 커밋하지 않는다 — 008 을 이미 돌린 개발 표의 CHECK 를 고친 008 과 같게(운영은 고친 008 을 처음 돌린다)
begin;
delete from ministry_history_requests where kind = 'wrong_position';
alter table ministry_history_requests drop constraint if exists ministry_history_requests_kind_check;
alter table ministry_history_requests add constraint ministry_history_requests_kind_check
  check (kind in ('not_mine', 'wrong_team', 'other', 'missing', 'find_me'));
alter table ministry_history_requests drop constraint if exists mhr_line_chk;
alter table ministry_history_requests add constraint mhr_line_chk
  check ((kind in ('not_mine', 'wrong_team', 'other')) = (history_id is not null));
commit;
```

먼저 제약 이름을 확인한다(다르면 위 파일의 이름을 그것으로 고친다):
```bash
supabase --workdir ~/.church-admin/supa-dev db query --linked "select count(*) as users from users"
supabase --workdir ~/.church-admin/supa-dev db query --linked "select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.ministry_history_requests'::regclass and contype = 'c'"
supabase --workdir ~/.church-admin/supa-dev db query --linked -f C:/Projects/bible-memorize-church-app-v2/.superpowers/sdd/hr-008-dev-alter.sql
supabase --workdir ~/.church-admin/supa-dev db query --linked "select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.ministry_history_requests'::regclass and contype = 'c'"
```
Expected: users 수십 · 마지막 결과의 kind·mhr_line_chk 정의에 `wrong_position` 없음.

- [ ] **Step 6: 개발 church-admin 다시 배포 → 끝에서 끝까지**

```bash
cd /c/Projects/church-admin/.worktrees/history-check && git merge main --no-edit && git status --short supabase/functions
supabase functions deploy church-admin --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo
cd /c/Projects/bible-memorize-church-app-v2 && python tests/ministry-history-found.dev.py && bash tests/ministry-history-smoke.sh
```
(`git status` 는 Step 3 의 church-admin 파일이 아직 커밋 전이라 `M` 으로 보인다 — 그 셋(history-check.ts·008·두 시험)뿐이어야 한다. 커밋은 Step 7.)
Expected: found 시험 `실패 0` · 스모크 `실패 0`.

- [ ] **Step 7: 커밋(두 저장소 따로)**

```bash
cd /c/Projects/church-admin/.worktrees/history-check
git add supabase/functions/church-admin/history-check.ts supabase/sql/008_ministry_history_requests.sql tests/history-check.test.mjs tests/history-check.dev.test.mjs
git commit -m "fix(사역이력확인): 「직분이 틀려요」 빼기 — 직분은 교적 기준(종류·SQL 008 CHECK·시험)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
cd /c/Projects/bible-memorize-church-app-v2
git diff --stat app.js tests/ministry-history.test.cjs tests/ministry-history-found.dev.py tools/screen-sweep.py docs/superpowers/specs/2026-10-01-ministry-history-check-design.md docs/notes/ministry-history-check.md
git add app.js tests/ministry-history.test.cjs tests/ministry-history-found.dev.py tools/screen-sweep.py docs/superpowers/specs/2026-10-01-ministry-history-check-design.md docs/notes/ministry-history-check.md
git commit -m "fix(사역이력확인): 앱 정정 창에서 「직분이 틀려요」 빼기 — 직분은 교적 기준 · 시험·화면 점검·문서" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git show --stat HEAD
```
(`git diff` 에 남의 hunk 가 보이면 `git apply --cached` 로 내 것만 담고 경로 없이 커밋.)

---

### Task 2: 처리 규칙·응답 모양 — `history-check.ts` 에 더함(순수)

**Files:**
- Modify: `supabase/functions/church-admin/history-check.ts`(파일 **끝**에 더한다)
- Modify: `tests/history-check.test.mjs`(import 블록에 이름 더하기 · 끝에 시험)

**Interfaces:**
- Consumes: 같은 파일의 `REQ_OPEN`·`tidy`.
- Produces(export): `REQ_FILTERS = ["open","done","all"]` · `REQ_SET_STATUS = ["확인 중","반영","반영 안 함"]` · `REQ_ANSWER_MAX = 300` · `REQ_LIST_MAX = 500` · `REQUEST_ADMIN_SELECT`(문자열) · `ROW_ADMIN_SELECT = "id,year,committee,team,role_title,position,deleted_at"` · `REQUEST_ADMIN_OUT_KEYS`(정렬된 13칸) · `type ReqSet = { id: number; status: string; answer: string; verified: boolean; expect: string }` · `parseRequestSet(b): {ok:true,set:ReqSet}|{ok:false,error}` · `requestSetBlock(set, cur:{kind,updated_at}): string|null` · `requestSetPatch(set, memberId: string|null, nowIso): {status,answer,handled_by,handled_at,updated_at}` · `requestAuditDetail(cur:{kind,status}, set): {id,kind,from,to,verified}` · `requestAdminOut(r, row|null)` · `filterRequests(rows, filter)` · `requestCounts(rows): {"신청":n,"확인 중":n}`.

- [ ] **Step 1: 실패하는 시험** — `tests/history-check.test.mjs` 의 history-check.ts import 블록에 `REQ_FILTERS, REQ_SET_STATUS, REQUEST_ADMIN_OUT_KEYS, filterRequests, parseRequestSet, requestAdminOut, requestAuditDetail, requestCounts, requestSetBlock, requestSetPatch,` 를 더하고, 끝에:

```js
test("parseRequestSet — id·상태·답 300자·expect", () => {
  assert.deepEqual(parseRequestSet({ id: "7", status: "반영", answer: " 고쳤어요 ", verified: true, expect: "2026-10-01T00:00:00+00:00" }),
    { ok: true, set: { id: 7, status: "반영", answer: "고쳤어요", verified: true, expect: "2026-10-01T00:00:00+00:00" } });
  assert.deepEqual(parseRequestSet({ id: 0, status: "반영", expect: "x" }), { ok: false, error: "bad-id" });
  assert.deepEqual(parseRequestSet({ id: 1, status: "신청", expect: "x" }), { ok: false, error: "bad-status" });
  assert.deepEqual(parseRequestSet({ id: 1, status: "반영", answer: "가".repeat(301), expect: "x" }), { ok: false, error: "answer-too-long" });
  assert.deepEqual(parseRequestSet({ id: 1, status: "반영", expect: "" }), { ok: false, error: "conflict" });
  assert.equal(parseRequestSet({ id: 1, status: "반영", verified: "true", expect: "x" }).set.verified, false);   // 참은 true 하나만
  assert.deepEqual(REQ_SET_STATUS, ["확인 중", "반영", "반영 안 함"]);
  assert.deepEqual(REQ_FILTERS, ["open", "done", "all"]);
});

test("requestSetBlock — 충돌 · 반영 안 함은 답 · 내 것이 아니에요 반영은 본인 확인", () => {
  const S = (o) => ({ id: 1, status: "반영", answer: "", verified: false, expect: "T1", ...o });
  assert.equal(requestSetBlock(S({}), { kind: "wrong_team", updated_at: "T1" }), null);
  assert.equal(requestSetBlock(S({ expect: "T0" }), { kind: "wrong_team", updated_at: "T1" }), "conflict");
  assert.equal(requestSetBlock(S({ status: "반영 안 함" }), { kind: "wrong_team", updated_at: "T1" }), "need-answer");
  assert.equal(requestSetBlock(S({ status: "반영 안 함", answer: "원본이 맞아요" }), { kind: "wrong_team", updated_at: "T1" }), null);
  assert.equal(requestSetBlock(S({}), { kind: "not_mine", updated_at: "T1" }), "need-verified");
  assert.equal(requestSetBlock(S({ verified: true }), { kind: "not_mine", updated_at: "T1" }), null);
  assert.equal(requestSetBlock(S({ status: "확인 중" }), { kind: "not_mine", updated_at: "T1" }), null);
  assert.equal(requestSetBlock(S({ status: "반영 안 함", answer: "본인이 아니래요" }), { kind: "not_mine", updated_at: "T1" }), null);
});

test("requestSetPatch — 끝난 상태만 handled_at · 확인 중은 null · updated_at 은 늘", () => {
  const set = { id: 1, status: "반영", answer: "고쳤어요", verified: false, expect: "T" };
  assert.deepEqual(requestSetPatch(set, "m1", "2026-10-01T01:00:00.000Z"),
    { status: "반영", answer: "고쳤어요", handled_by: "m1", handled_at: "2026-10-01T01:00:00.000Z", updated_at: "2026-10-01T01:00:00.000Z" });
  assert.equal(requestSetPatch({ ...set, status: "확인 중" }, "m1", "N").handled_at, null);
});

test("requestAuditDetail — 이름·답 없이 id·종류·전후·확인", () => {
  assert.deepEqual(requestAuditDetail({ kind: "not_mine", status: "신청" }, { id: 3, status: "반영", answer: "개인 사정", verified: true, expect: "T" }),
    { id: 3, kind: "not_mine", from: "신청", to: "반영", verified: true });
});

test("requestAdminOut — 정해진 칸만(user_id·person_id·handled_by 없음) · found · 빼 둔 줄", () => {
  const r = { id: "5", kind: "wrong_team", detail: "d", year: null, team_text: "", status: "신청", answer: "", created_at: "C", updated_at: "U",
    handled_at: null, who_type: "교구", who_group: "기쁨", who_sub: "12", who_name: "홍길동", person_id: 990000001, history_id: 9,
    user_id: "0f8fad5b-d9cb-469f-a165-70867728950e", handled_by: "m1" };
  const row = { id: 9, year: 2025, committee: "찬양위원회", team: "시온성가대", role_title: "", position: "집사", deleted_at: "2026-10-01", person_id: 1, mok: "기쁨-12" };
  const o = requestAdminOut(r, row);
  assert.deepEqual(Object.keys(o).sort(), REQUEST_ADMIN_OUT_KEYS);
  assert.deepEqual(o.who, { type: "교구", group: "기쁨", sub: "12", name: "홍길동" });
  assert.equal(o.found, true);
  assert.deepEqual(o.row, { id: 9, year: 2025, committee: "찬양위원회", team: "시온성가대", role_title: "", position: "집사", deleted: true });
  assert.ok(!JSON.stringify(o).includes("990000001") && !JSON.stringify(o).includes("0f8fad5b") && !JSON.stringify(o).includes("기쁨-12"));
  assert.equal(requestAdminOut({ ...r, person_id: null }, null).found, false);
  assert.equal(requestAdminOut(r, null).row, null);
});

test("filterRequests·requestCounts — 끝나지 않은 것은 오래된 것부터 · 끝난 것·전부는 최근 것부터", () => {
  const q = (id, status, created_at) => ({ id, status, created_at });
  const rows = [q(1, "반영", "2026-09-01"), q(2, "신청", "2026-09-03"), q(3, "확인 중", "2026-09-02"), q(4, "반영 안 함", "2026-09-04")];
  assert.deepEqual(filterRequests(rows, "open").map((x) => x.id), [3, 2]);
  assert.deepEqual(filterRequests(rows, "done").map((x) => x.id), [4, 1]);
  assert.deepEqual(filterRequests(rows, "all").map((x) => x.id), [4, 2, 3, 1]);
  assert.deepEqual(requestCounts(rows), { "신청": 1, "확인 중": 1 });
});
```

- [ ] **Step 2: 떨어지는지 본다**

Run: `node --experimental-strip-types --test tests/history-check.test.mjs` → FAIL(`does not provide an export named 'REQ_FILTERS'`)

- [ ] **Step 3: 구현** — `history-check.ts` 끝에:

```ts
// ── 담당자 처리 「📮 정정 신청」(2026-10-01) ──
//   설계: v2 docs/superpowers/specs/2026-10-01-ministry-history-requests-admin-design.md §3·§4
//   ⚠️ 응답에 user_id·person_id·handled_by 를 싣지 않는다(requestAdminOut 이 정한다 — 시험이 키 집합을 대조).
export const REQ_FILTERS = ["open", "done", "all"];
export const REQ_SET_STATUS = ["확인 중", "반영", "반영 안 함"];   // 「신청」은 성도님이 낸 상태 — 담당자가 고르지 않는다
export const REQ_ANSWER_MAX = 300;
export const REQ_LIST_MAX = 500;
export const REQUEST_ADMIN_SELECT =
  "id,kind,detail,year,team_text,status,answer,created_at,updated_at,handled_at,who_type,who_group,who_sub,who_name,person_id,history_id";
export const ROW_ADMIN_SELECT = "id,year,committee,team,role_title,position,deleted_at";
export const REQUEST_ADMIN_OUT_KEYS = ["answer", "created_at", "detail", "found", "handled_at", "id", "kind", "row", "status",
  "team_text", "updated_at", "who", "year"];

export type ReqSet = { id: number; status: string; answer: string; verified: boolean; expect: string };

export function parseRequestSet(b: any): { ok: true; set: ReqSet } | { ok: false; error: string } {
  const id = Number(b?.id);
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, error: "bad-id" };
  const status = tidy(b?.status);
  if (!REQ_SET_STATUS.includes(status)) return { ok: false, error: "bad-status" };
  const answer = tidy(b?.answer);
  if (answer.length > REQ_ANSWER_MAX) return { ok: false, error: "answer-too-long" };
  const expect = String(b?.expect ?? "").trim();
  if (!expect) return { ok: false, error: "conflict" };   // 무엇을 보고 바꾸는지 모르면 덮어쓰지 않는다
  return { ok: true, set: { id, status, answer, verified: b?.verified === true, expect } };
}

// 지금 줄(cur)에 비춰 막기 — null 이면 써도 된다
export function requestSetBlock(set: ReqSet, cur: { kind: string; updated_at: string }): string | null {
  if (String(cur.updated_at) !== set.expect) return "conflict";
  if (set.status === "반영 안 함" && !set.answer) return "need-answer";
  // 「내 것이 아니에요」는 남의 이름으로 들어와서도 낼 수 있다 — 반영(=그 줄을 그분에게서 떼기) 전에 본인 확인(친구 결정)
  if (set.status === "반영" && cur.kind === "not_mine" && !set.verified) return "need-verified";
  return null;
}

export function requestSetPatch(set: ReqSet, memberId: string | null, nowIso: string) {
  const done = set.status !== "확인 중";
  return { status: set.status, answer: set.answer, handled_by: memberId, handled_at: done ? nowIso : null, updated_at: nowIso };
}

export function requestAuditDetail(cur: { kind: string; status: string }, set: ReqSet) {
  return { id: set.id, kind: cur.kind, from: cur.status, to: set.status, verified: set.verified };
}

export function requestAdminOut(r: any, row: any | null) {
  return {
    id: Number(r.id), kind: String(r.kind ?? ""), detail: String(r.detail ?? ""), year: r.year == null ? null : Number(r.year),
    team_text: String(r.team_text ?? ""), status: String(r.status ?? ""), answer: String(r.answer ?? ""),
    created_at: String(r.created_at ?? ""), updated_at: String(r.updated_at ?? ""), handled_at: r.handled_at ? String(r.handled_at) : null,
    who: { type: String(r.who_type ?? ""), group: String(r.who_group ?? ""), sub: String(r.who_sub ?? ""), name: String(r.who_name ?? "") },
    found: r.person_id != null,
    row: row ? {
      id: Number(row.id), year: Number(row.year), committee: String(row.committee ?? ""), team: String(row.team ?? ""),
      role_title: String(row.role_title ?? ""), position: String(row.position ?? ""), deleted: !!row.deleted_at,
    } : null,
  };
}

// 끝나지 않은 것은 오래된 것부터(먼저 온 신청을 먼저) · 끝난 것·전부는 최근 것부터 · 최대 REQ_LIST_MAX
export function filterRequests<T extends { id: number; status: string; created_at: string }>(rows: T[], filter: string): T[] {
  const open = (r: T) => REQ_OPEN.includes(r.status);
  const pick = filter === "open" ? rows.filter(open) : filter === "done" ? rows.filter((r) => !open(r)) : [...rows];
  const dir = filter === "open" ? 1 : -1;
  return pick.sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id - b.id) * dir)
    .slice(0, REQ_LIST_MAX);
}

export function requestCounts(rows: { status: string }[]) {
  return { "신청": rows.filter((r) => r.status === "신청").length, "확인 중": rows.filter((r) => r.status === "확인 중").length };
}
```

- [ ] **Step 4: 시험·preflight**

Run: `node --experimental-strip-types --test tests/history-check.test.mjs && python tools/preflight.py` → PASS · 실패 0

- [ ] **Step 5: 커밋**

```bash
git add supabase/functions/church-admin/history-check.ts tests/history-check.test.mjs
git commit -m "feat(정정신청): 담당자 처리 규칙·응답 모양 — 반영 안 함은 답 · 내 것이 아니에요 반영은 본인 확인 · 충돌 · user_id·person_id 없음" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 서버 액션 둘 · 권한 표 · 기록 이름 · 개발 서버 시험

**Files:**
- Modify: `supabase/functions/church-admin/index.ts` · `supabase/functions/church-admin/authz.ts` · `tests/authz.test.mjs` · `tests/server.dev.test.mjs`(PROBE 두 줄만) · `js/menus/system/audit.js`
- Create: `tests/history-requests.dev.test.mjs`

**Interfaces:**
- Consumes: Task 2 의 이름 · index.ts 의 `db`·`json`·`allRows`·`audit`·`type Ctx`.
- Produces: 액션 `historyRequestList { status }` → `{ ok, counts, list }` · `historyRequestSet { id, status, answer, verified, expect }` → `{ ok, row }` | `{ ok:false, error }`(오류 글자는 Global Constraints). 기록 이름 `history.request` → 「사역 이력 정정 신청 처리」.

- [ ] **Step 1: 권한 시험을 먼저 고친다(떨어지게)** — `tests/authz.test.mjs` 의 ministry 액션 목록을:

```js
  assert.deepEqual(ministryActions.sort(), ["historyRequestList", "historyRequestSet", "ministryAppointed", "ministryCatalogAdmin", "ministryCatalogOrder",
    "ministryCatalogSave", "ministryDelete", "ministryList", "ministryPaperCheck", "ministryPaperSave",
    "ministryPerson", "ministrySetStatus", "ministryTesterFind", "ministryTesterSave", "ministryTesters"]);
```
(⚠️ 그 목록이 이미 다른 가지에서 늘었으면 — 이 worktree 에 있는 그대로에 두 이름만 더한다.)

`tests/history-check.test.mjs` 끝에(기록 이름 · `../js/menus/system/audit.js` 의 `LABEL`·`detailText` 를 import 블록에 더한다):

```js
test("기록 history.request — 한국말 이름 · 내용에 이름·답이 없다", () => {
  assert.match(LABEL["history.request"], /[가-힣]/);
  const t = detailText({ action: "history.request", target: "3", detail: { id: 3, kind: "not_mine", from: "신청", to: "반영", verified: true } });
  assert.equal(t, "#3 · 내 것이 아니에요 · 신청 → 반영 · 본인 확인");
  assert.equal(detailText({ action: "history.request", target: "4", detail: { id: 4, kind: "find_me", from: "확인 중", to: "반영 안 함", verified: false } }),
    "#4 · 내 기록 찾아 주세요 · 확인 중 → 반영 안 함");
});
```

Run: `node --experimental-strip-types --test tests/authz.test.mjs tests/history-check.test.mjs` → FAIL 둘

- [ ] **Step 2: 권한 표** — `authz.ts` 의 `ministryPerson: "ministry",` 줄 바로 아래:

```ts
  // 「📮 정정 신청」(2026-10-01) — 성경암송 앱 「사역 이력 확인」에서 온 정정 신청 목록·처리. 응답에 user_id·person_id 없음 · 처리는 바꾼 기록에.
  historyRequestList: "ministry",
  historyRequestSet: "ministry",
```

- [ ] **Step 3: 기록 이름** — `js/menus/system/audit.js` 의 `LABEL` 에 `"ministry.tester": "사역 시험 참여자",` 줄 바로 아래 `"history.request": "사역 이력 정정 신청 처리",` · `detailText` 의 `ministry.tester` 줄 바로 아래:

```js
  if (r.action === "history.request") {
    const K = { not_mine: "내 것이 아니에요", wrong_team: "팀·부서가 틀려요", other: "그 밖에", missing: "빠진 사역", find_me: "내 기록 찾아 주세요" };
    return [`#${d.id ?? r.target}`, K[d.kind] || d.kind || "", `${d.from || ""} → ${d.to || ""}`, d.verified ? "본인 확인" : ""].filter(Boolean).join(" · ");
  }
```

- [ ] **Step 4: 서버** — `index.ts`: 사역 이력 확인 import 두 줄(`import { hcUserId, historyRowOut, …} from "./history-check.ts";`) **바로 아래**에 새 줄:

```ts
// 「📮 정정 신청」 담당자 처리(2026-10-01) — ⚠️ 위 import 에 이미 든 이름은 적지 않는다
import { filterRequests, parseRequestSet, REQ_FILTERS, REQUEST_ADMIN_SELECT, requestAdminOut, requestAuditDetail, requestCounts, requestSetBlock, requestSetPatch, ROW_ADMIN_SELECT } from "./history-check.ts";
```

`async function internalRoute(` 함수 **바로 위**에:

```ts
// ── 「📮 정정 신청」 — 사역 이력 정정 신청 처리(담당자 · 역할 ministry · 2026-10-01) ──
//   설계: v2 docs/superpowers/specs/2026-10-01-ministry-history-requests-admin-design.md §4
//   ⚠️ 응답에 user_id·person_id·handled_by 를 싣지 않는다(requestAdminOut).
//   ⚠️ 상태로 거를 때 .in() 을 쓰지 않는다 — 「확인 중」의 빈칸을 PostgREST 목록 글자로 넘기지 않으려고(hcRequests 와 같은 까닭). 받아서 거른다.
async function hrRows(ids: number[]): Promise<Map<number, any>> {
  const m = new Map<number, any>();
  const uniq = [...new Set(ids.filter((x) => Number.isSafeInteger(x) && x > 0))];
  for (let i = 0; i < uniq.length; i += 200) {
    const { data, error } = await db.from("ministry_history").select(ROW_ADMIN_SELECT).in("id", uniq.slice(i, i + 200));
    if (error) throw error;
    for (const r of data ?? []) m.set(Number(r.id), r);
  }
  return m;
}

async function historyRequestList(b: any) {
  const filter = String(b.status ?? "open");
  if (!REQ_FILTERS.includes(filter)) return { ok: false, error: "bad-status" };
  const all = (await allRows(() => db.from("ministry_history_requests").select(REQUEST_ADMIN_SELECT).order("id", { ascending: true })))
    .map((r: any) => ({ ...r, id: Number(r.id) }));
  const pick = filterRequests(all, filter);
  const rows = await hrRows(pick.map((r: any) => Number(r.history_id)));
  return {
    ok: true, counts: requestCounts(all),
    list: pick.map((r: any) => requestAdminOut(r, r.history_id == null ? null : rows.get(Number(r.history_id)) ?? null)),
  };
}

async function historyRequestSet(ctx: Ctx, b: any) {
  const p = parseRequestSet(b);
  if (!p.ok) return p;
  const { data: cur, error } = await db.from("ministry_history_requests").select("id,kind,status,updated_at")
    .eq("id", p.set.id).maybeSingle();
  if (error) throw error;
  if (!cur) return { ok: false, error: "not-found" };
  const block = requestSetBlock(p.set, cur);
  if (block) return { ok: false, error: block };
  // 본 뒤로 아무도 안 바꿨을 때만 쓴다(updated_at 조건) — 0행이면 그사이 누가 바꿨다
  const { data: upd, error: ue } = await db.from("ministry_history_requests")
    .update(requestSetPatch(p.set, ctx.member?.id ?? null, new Date().toISOString()))
    .eq("id", p.set.id).eq("updated_at", cur.updated_at).select(REQUEST_ADMIN_SELECT).maybeSingle();
  if (ue) {
    if ((ue as any).code === "23505") return { ok: false, error: "already-open" };   // 다시 열기 — 같은 줄에 열린 신청이 있다
    throw ue;
  }
  if (!upd) return { ok: false, error: "conflict" };
  await audit(ctx, "history.request", String(p.set.id), requestAuditDetail(cur, p.set));
  const rows = await hrRows(upd.history_id == null ? [] : [Number(upd.history_id)]);
  return { ok: true, row: requestAdminOut(upd, upd.history_id == null ? null : rows.get(Number(upd.history_id)) ?? null) };
}
```

`switch` 의 `case "ministryPerson": return json(await ministryPerson(ctx, b));` 줄 바로 아래:

```ts
      case "historyRequestList": return json(await historyRequestList(b));
      case "historyRequestSet":  return json(await historyRequestSet(ctx, b));
```

`tests/server.dev.test.mjs` 의 PROBE 에서 `ministryPerson: { name: "" },` 줄 바로 아래(이 파일은 그 두 줄만 고친다):

```js
  // 「📮 정정 신청」(2026-10-01) — 목록은 읽기만 · 처리는 id 0 → bad-id(쓰지도 기록하지도 않는다)
  historyRequestList: { status: "open" },
  historyRequestSet: { id: 0, status: "확인 중", expect: "x" },
```

- [ ] **Step 5: 순수 시험·preflight**

Run: `node --experimental-strip-types --test tests/authz.test.mjs tests/history-check.test.mjs tests/audit.test.mjs && python tools/preflight.py` → PASS · 실패 0

- [ ] **Step 6: 개발 서버 시험을 쓴다** — `tests/history-requests.dev.test.mjs`:

```js
// 「📮 정정 신청」 — 담당자 처리 액션을 개발 서버에 대고 본다(2026-10-01).
//   set -a; . ~/.church-admin/dev.env; set +a
//   node --experimental-strip-types --test tests/history-requests.dev.test.mjs
// ⚠️ 공용 server.dev.test.mjs 는 여러 세션이 고친다 — PROBE 두 줄만 거기 두고 나머지는 여기.
// 시험 자료: 담당자(이메일 로그인 ca-test-hr-…) · 기록 한 줄(src_key ca-test-hr-<STAMP>-a) · 신청 넷(지어낸 user_id) — 끝나면 모두 지운다.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { REQUEST_ADMIN_OUT_KEYS } from "../supabase/functions/church-admin/history-check.ts";

const URL_ = process.env.DEV_URL, ANON = process.env.DEV_ANON, SERVICE = process.env.DEV_SERVICE_KEY;
if (!URL_ || !URL_.includes("ktpwthwqzgcqcrmsafdo")) throw new Error("개발 프로젝트(ktpwthwqzgcqcrmsafdo)에만 돌린다 — dev.env 를 확인할 것");
if (!ANON || !SERVICE) throw new Error("DEV_ANON·DEV_SERVICE_KEY 가 없다");

const FN = URL_ + "/functions/v1/church-admin";
const svc = { apikey: SERVICE, "Content-Type": "application/json",
  ...(SERVICE.startsWith("sb_secret_") ? {} : { Authorization: "Bearer " + SERVICE }) };
const STAMP = Date.now();
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const U1 = crypto.randomUUID(), U2 = crypto.randomUUID();
const st = { staff: null, memberId: null, rowId: null, q: {} };

async function body(res) { const t = await res.text(); try { return JSON.parse(t); } catch { return { raw: t }; } }
async function rest(path, method, data) {
  const r = await fetch(URL_ + "/rest/v1/" + path, { method, headers: { ...svc, Prefer: "return=representation" },
    body: data ? JSON.stringify(data) : undefined });
  const x = await body(r);
  assert.ok(r.ok, path + " " + JSON.stringify(x));
  return x;
}
async function call(action, extra = {}) {
  const r = await fetch(FN, { method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON, Authorization: "Bearer " + st.staff.token },
    body: JSON.stringify({ ...extra, action }) });
  return { status: r.status, body: await body(r) };
}
const listOf = async (status) => (await call("historyRequestList", { status })).body;
const mine = (list) => (list || []).filter((x) => Object.values(st.q).includes(x.id));
const reqRow = async (id) => (await rest(`ministry_history_requests?select=updated_at,status&id=eq.${id}`, "GET"))[0];

before(async () => {
  const email = `ca-test-hr-${STAMP}@example.test`, password = "T" + STAMP + "!x";
  const u = await body(await fetch(URL_ + "/auth/v1/admin/users", { method: "POST", headers: svc,
    body: JSON.stringify({ email, password, email_confirm: true }) }));
  assert.ok(u.id, "사용자 만들기 실패: " + JSON.stringify(u));
  const s = await body(await fetch(URL_ + "/auth/v1/token?grant_type=password", { method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) }));
  assert.ok(s.access_token, "로그인 실패");
  st.staff = { uid: u.id, token: s.access_token };
  const [m] = await rest("admin_members", "POST", { auth_user_id: u.id, name: "시험-정정", gu: "사랑", mok: "1", status: "active" });
  st.memberId = m.id;
  await rest("admin_role_grants", "POST", { member_id: m.id, role_id: "ministry" });
  const [h] = await rest("ministry_history", "POST", { src_key: `ca-test-hr-${STAMP}-a`, name: `ca-test-hr-${STAMP}-가`, year: 2025,
    committee: "찬양위원회", team: "시온성가대", role_title: "", position: "집사", mok: "", person_id: null, deleted_at: null });
  st.rowId = h.id;
  const base = { who_type: "교구", who_group: "기쁨", who_sub: "12", who_name: `ca-test-hr-${STAMP}-가`, detail: "", year: null, team_text: "", person_id: null };
  const rows = await rest("ministry_history_requests", "POST", [
    { ...base, user_id: U1, kind: "not_mine", history_id: h.id, detail: "제 기록이 아니에요" },
    { ...base, user_id: U1, kind: "missing", history_id: null, year: 2023, team_text: "찬양위원회 호산나찬양대" },
    { ...base, user_id: U2, kind: "find_me", history_id: null, who_sub: "99" },
  ]);
  [st.q.notMine, st.q.missing, st.q.find] = rows.map((r) => r.id);
});

after(async () => {
  const ids = Object.values(st.q).filter(Boolean);
  const errs = [];
  const step = async (label, fn) => { try { await fn(); } catch (e) { errs.push(label + " — " + (e?.message ?? e)); } };
  if (ids.length) await step("기록", () => rest(`admin_audit?action=eq.history.request&target=in.(${ids.join(",")})`, "DELETE"));
  await step("신청", () => rest(`ministry_history_requests?user_id=in.(${U1},${U2})`, "DELETE"));
  await step("사역 이력 줄", () => rest(`ministry_history?src_key=like.ca-test-hr-${STAMP}-*`, "DELETE"));
  if (st.memberId) {
    await step("담당자 역할", () => rest(`admin_role_grants?member_id=eq.${st.memberId}`, "DELETE"));
    await step("담당자", () => rest(`admin_members?id=eq.${st.memberId}`, "DELETE"));
  }
  if (st.staff?.uid) await step("로그인 계정", async () => {
    const r = await fetch(URL_ + "/auth/v1/admin/users/" + st.staff.uid, { method: "DELETE", headers: svc });
    if (!r.ok) throw new Error(r.status + " " + await r.text());
  });
  if (errs.length) throw new Error("정리 실패 " + errs.length + "건: " + errs.join(" / "));
});

test("목록 — 끝나지 않은 것 · 정해진 칸만 · user_id·person_id·uuid 없음 · 기록 줄 요약", async () => {
  const j = await listOf("open");
  assert.equal(j.ok, true);
  const got = mine(j.list);
  assert.equal(got.length, 3);
  for (const x of got) assert.deepEqual(Object.keys(x).sort(), REQUEST_ADMIN_OUT_KEYS);
  const nm = got.find((x) => x.id === st.q.notMine);
  assert.deepEqual(nm.row, { id: st.rowId, year: 2025, committee: "찬양위원회", team: "시온성가대", role_title: "", position: "집사", deleted: false });
  assert.equal(nm.found, false);
  assert.equal(got.find((x) => x.id === st.q.find).row, null);
  assert.ok(!UUID_RE.test(JSON.stringify(got)), "uuid 가 샜다");
  assert.ok(typeof j.counts["신청"] === "number" && j.counts["신청"] >= 3);
  assert.equal((await listOf("nope")).error, "bad-status");
});

test("처리 — 확인 중 · 반영 안 함은 답 · 충돌", async () => {
  let cur = await reqRow(st.q.missing);
  const a = await call("historyRequestSet", { id: st.q.missing, status: "확인 중", expect: cur.updated_at });
  assert.equal(a.body.ok, true, JSON.stringify(a.body));
  assert.equal(a.body.row.status, "확인 중");
  assert.equal(a.body.row.handled_at, null);
  cur = await reqRow(st.q.missing);
  assert.equal((await call("historyRequestSet", { id: st.q.missing, status: "반영 안 함", answer: "", expect: cur.updated_at })).body.error, "need-answer");
  assert.equal((await call("historyRequestSet", { id: st.q.missing, status: "반영", expect: "2000-01-01T00:00:00+00:00" })).body.error, "conflict");
  const b = await call("historyRequestSet", { id: st.q.missing, status: "반영 안 함", answer: "2023 명단 원본에 없어 부서에 여쭤보고 있어요", expect: cur.updated_at });
  assert.equal(b.body.ok, true);
  assert.ok(b.body.row.handled_at);
});

test("「내 것이 아니에요」 반영은 본인 확인 · 기록에 남는다(이름·답 없이)", async () => {
  const cur = await reqRow(st.q.notMine);
  assert.equal((await call("historyRequestSet", { id: st.q.notMine, status: "반영", expect: cur.updated_at })).body.error, "need-verified");
  const r = await call("historyRequestSet", { id: st.q.notMine, status: "반영", answer: "확인 뒤 뺐어요", verified: true, expect: cur.updated_at });
  assert.equal(r.body.ok, true, JSON.stringify(r.body));
  const [log] = await rest(`admin_audit?select=member_id,detail&action=eq.history.request&target=eq.${st.q.notMine}&order=id.desc&limit=1`, "GET");
  assert.equal(log.member_id, st.memberId);
  assert.deepEqual(log.detail, { id: st.q.notMine, kind: "not_mine", from: "신청", to: "반영", verified: true });
});

test("다시 열기 — 같은 줄에 열린 신청이 있으면 already-open", async () => {
  await rest("ministry_history_requests", "POST", { user_id: U1, kind: "wrong_team", history_id: st.rowId, who_type: "교구",
    who_group: "기쁨", who_sub: "12", who_name: `ca-test-hr-${STAMP}-가`, detail: "", year: null, team_text: "", person_id: null });
  const cur = await reqRow(st.q.notMine);
  assert.equal((await call("historyRequestSet", { id: st.q.notMine, status: "확인 중", expect: cur.updated_at })).body.error, "already-open");
  const done = mine((await listOf("done")).list).map((x) => x.id);
  assert.ok(done.includes(st.q.notMine) && done.includes(st.q.missing));
});
```

- [ ] **Step 7: 개발 배포 → 시험**

```bash
git merge main --no-edit && git status --short supabase/functions
supabase functions deploy church-admin --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo
set -a; . ~/.church-admin/dev.env; set +a
node --experimental-strip-types --test tests/history-requests.dev.test.mjs
```
(`git status` 에는 이 과제의 index.ts·authz.ts 가 커밋 전이라 `M` — 그 둘뿐이어야 한다.)
Expected: 4개 PASS · 정리 실패 없음. (공용 `server.dev.test.mjs` 는 다른 세션 자료가 많아 이 과제에서 통째로 돌리지 않는다 — PROBE 두 줄은 다음에 그 시험을 도는 세션이 함께 본다. 돌릴 수 있으면 돌리고 결과를 적는다.)

- [ ] **Step 8: 커밋**

```bash
git add supabase/functions/church-admin/index.ts supabase/functions/church-admin/authz.ts tests/authz.test.mjs tests/server.dev.test.mjs tests/history-check.test.mjs js/menus/system/audit.js tests/history-requests.dev.test.mjs
git commit -m "feat(정정신청): 서버 액션 historyRequestList·historyRequestSet(ministry) · 권한 표·PROBE · 기록 이름 · 개발 서버 시험" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 화면 — 「📮 정정 신청」 메뉴(목록·처리 창) · CSS · 안내 한 줄

**Files:**
- Create: `js/menus/ministry/requests-logic.js` · `js/menus/ministry/requests.js` · `tests/requests-logic.test.mjs`
- Modify: `js/menus/registry.js` · `css/admin.css`(파일 끝) · `privacy.html`(9번 카드)

**Interfaces:**
- Consumes: Task 3 액션 · `ui.js` `esc`·`toast`·`busy`·`errorText` · `modal.js` `openForm({title, html, okLabel, onOpen(box), isDirty(box), onSubmit(box)})`(onSubmit 이 `{ok:false, message}` 면 창 안 빨간 줄) · `picker.js` `pickOne({anchor, title, options:[{value,label}], value})` → 고른 값 또는 null.
- Produces: 메뉴 `mn-requests` · `render(el, { call })`.

- [ ] **Step 1: 실패하는 시험** — `tests/requests-logic.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { KIND_TEXT, FILTERS, SET_STATUS, whoText, targetText, dayText, rowHtml, formHtml, formCheck, linkOf, countsText, msgOf }
  from "../js/menus/ministry/requests-logic.js";

const Q = (o) => ({ id: 5, kind: "wrong_team", detail: "", year: null, team_text: "", status: "신청", answer: "", created_at: "2026-09-30T16:30:00Z",
  updated_at: "U", handled_at: null, who: { type: "교구", group: "기쁨", sub: "12", name: "홍길동" }, found: true,
  row: { id: 9, year: 2025, committee: "찬양위원회", team: "시온성가대", role_title: "", position: "집사", deleted: false }, ...o });

test("종류 — 직분 정정은 없다(교적 기준) · 거르기 셋 · 고를 상태 셋", () => {
  assert.deepEqual(Object.keys(KIND_TEXT).sort(), ["find_me", "missing", "not_mine", "other", "wrong_team"]);
  assert.deepEqual(FILTERS.map((f) => f.value), ["open", "done", "all"]);
  assert.deepEqual(SET_STATUS, ["확인 중", "반영", "반영 안 함"]);
});

test("whoText·dayText — 목장 99 는 교구만 · 교회학교 부서·학년 · 한국 날짜", () => {
  assert.equal(whoText(Q({}).who), "기쁨-12 홍길동");
  assert.equal(whoText({ type: "교구", group: "기쁨", sub: "99", name: "홍길동" }), "기쁨 홍길동");
  assert.equal(whoText({ type: "교회학교", group: "중등부", sub: "2학년", name: "홍길동" }), "중등부 2학년 홍길동");
  assert.equal(dayText("2026-09-30T16:30:00Z"), "10/01");
});

test("targetText — 줄 · 빼 둔 줄 · 빠진 사역 · 찾아 주세요 · 지워진 줄", () => {
  assert.equal(targetText(Q({})), "2025 찬양위원회 · 시온성가대");
  assert.equal(targetText(Q({ row: { ...Q({}).row, role_title: "팀장", deleted: true } })), "2025 찬양위원회 · 시온성가대 팀장 (빼 둔 기록)");
  assert.equal(targetText(Q({ kind: "missing", row: null, year: 2023, team_text: "호산나찬양대" })), "빠진 사역 2023 — 호산나찬양대");
  assert.equal(targetText(Q({ kind: "find_me", row: null })), "기록을 찾지 못한 분");
  assert.equal(targetText(Q({ row: null })), "(지워진 기록)");
});

test("rowHtml — 값은 escape · 줄 열쇠는 id 숫자", () => {
  const h = rowHtml(Q({ detail: "<b>x</b>", who: { type: "교구", group: "기쁨", sub: "12", name: "<i>" } }));
  assert.ok(h.includes('data-id="5"'));
  assert.ok(h.includes("&lt;b&gt;x&lt;/b&gt;") && h.includes("&lt;i&gt;") && !h.includes("<b>x"));
  assert.ok(h.includes("팀·부서가 틀려요") && h.includes("신청"));
});

test("formHtml — 그 줄 열기 주소 · 본인 확인 칸은 내 것이 아니에요만 · 찾아 주세요 안내 · 답 안내", () => {
  assert.ok(formHtml(Q({})).includes('href="#/mn-history?row=9"'));
  assert.ok(!formHtml(Q({})).includes('id="hr-ver"'));
  assert.ok(formHtml(Q({ kind: "not_mine" })).includes('id="hr-ver"'));
  assert.ok(formHtml(Q({ kind: "find_me", row: null })).includes("로그인 정보변경"));
  assert.ok(formHtml(Q({})).includes("같은 이름·소속으로 앱에 들어오는 사람에게도 보여요"));
  assert.equal(linkOf(Q({ kind: "missing", row: null, who: { name: "홍 길동" } })), "#/mn-history?q=" + encodeURIComponent("홍 길동"));
});

test("formCheck — 서버와 같은 규칙", () => {
  assert.equal(formCheck(Q({}), { status: "", answer: "" }), "bad-status");
  assert.equal(formCheck(Q({}), { status: "반영 안 함", answer: " " }), "need-answer");
  assert.equal(formCheck(Q({}), { status: "반영", answer: "가".repeat(301) }), "answer-too-long");
  assert.equal(formCheck(Q({ kind: "not_mine" }), { status: "반영", answer: "", verified: false }), "need-verified");
  assert.equal(formCheck(Q({ kind: "not_mine" }), { status: "반영", answer: "", verified: true }), null);
  assert.equal(formCheck(Q({}), { status: "확인 중", answer: "" }), null);
});

test("countsText·msgOf", () => {
  assert.equal(countsText({ "신청": 3, "확인 중": 1 }), "신청 3 · 확인 중 1");
  assert.match(msgOf({ error: "need-verified" }), /본인/);
  assert.equal(msgOf({ error: "network" }), null);
});
```

Run: `node --experimental-strip-types --test tests/requests-logic.test.mjs` → FAIL(모듈 없음)

- [ ] **Step 2: 순수 모듈** — `js/menus/ministry/requests-logic.js`:

```js
// 「📮 정정 신청」 — 화면 논리(순수 함수 · tests/requests-logic.test.mjs).
//   설계: v2 docs/superpowers/specs/2026-10-01-ministry-history-requests-admin-design.md §2·§3
//   ⚠️ 직분은 정정하지 않는다(교적 기준) — 종류에 wrong_position 이 없다. kind·status 글자는 서버 history-check.ts·SQL 008 과 같다.
import { esc } from "../../core/ui.js";

export const KIND_TEXT = { not_mine: "내 것이 아니에요", wrong_team: "팀·부서가 틀려요", other: "그 밖에", missing: "빠진 사역", find_me: "내 기록 찾아 주세요" };
export const FILTERS = [{ value: "open", label: "끝나지 않은 것" }, { value: "done", label: "끝난 것" }, { value: "all", label: "전부" }];
export const SET_STATUS = ["확인 중", "반영", "반영 안 함"];
export const ANSWER_MAX = 300;
const STATE_CLS = { "신청": "s1", "확인 중": "s2", "반영": "s3", "반영 안 함": "s4" };
const MSG = {
  "bad-status": "처리 상태를 골라 주세요",
  "answer-too-long": "답은 300자까지 적을 수 있어요",
  "need-answer": "「반영 안 함」은 사유(답)를 꼭 적어 주세요",
  "need-verified": "「내 것이 아니에요」는 본인에게 확인한 뒤 칸을 체크해 주세요",
  conflict: "다른 분이 먼저 바꿨어요 — 새로 불러올게요",
  "already-open": "같은 기록 줄에 이미 열린 신청이 있어요 — 그 신청을 먼저 처리해 주세요",
  "not-found": "그 신청을 찾지 못했어요 — 새로 불러와 주세요",
};
// 이 메뉴의 오류 글 — 없으면 null(부르는 쪽이 ui.js errorText 로)
export const msgOf = (r) => MSG[r?.error] || null;

// 「기쁨-12 홍길동」 · 목장 99·빈칸은 교구만 · 교회학교 「중등부 2학년 홍길동」
export function whoText(w) {
  if (!w) return "";
  const aff = w.type === "교회학교" ? [w.group, w.sub].filter(Boolean).join(" ")
    : (w.sub && w.sub !== "99" ? `${w.group}-${w.sub}` : (w.group || ""));
  return [aff, w.name].filter(Boolean).join(" ");
}

// 한국 날짜 「10/01」
export function dayText(iso) {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
  return isNaN(d) ? "" : String(d.getUTCMonth() + 1).padStart(2, "0") + "/" + String(d.getUTCDate()).padStart(2, "0");
}

export function targetText(q) {
  if (q.kind === "missing") return `빠진 사역 ${q.year ?? ""} — ${q.team_text || ""}`;
  if (q.kind === "find_me") return "기록을 찾지 못한 분";
  if (!q.row) return "(지워진 기록)";
  const what = [q.row.committee, [q.row.team, q.row.role_title].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
  const t = [q.row.year, what].filter(Boolean).join(" ");
  return q.row.deleted ? t + " (빼 둔 기록)" : t;
}

export const countsText = (c) => `신청 ${c?.["신청"] ?? 0} · 확인 중 ${c?.["확인 중"] ?? 0}`;

// [그 줄 열기] — b6 「📜 사역 이력」이 ?row·?q 를 받는다(설계 §5 · 아직 안 받으면 그 메뉴 첫 화면이 열린다)
export function linkOf(q) {
  if (q.row && q.row.id) return `#/mn-history?row=${Number(q.row.id)}`;
  return `#/mn-history?q=${encodeURIComponent(q.who?.name || "")}`;
}

export function rowHtml(q) {
  return `<button type="button" class="card hr-row" data-id="${Number(q.id)}">
    <span class="hr-top"><span class="muted">${esc(dayText(q.created_at))}</span> <b>${esc(whoText(q.who))}</b>
      <span class="hr-kind">${esc(KIND_TEXT[q.kind] || q.kind)}</span>
      <span class="badge hr-st ${STATE_CLS[q.status] || ""}">${esc(q.status)}</span></span>
    <span class="hr-target">${esc(targetText(q))}</span>
    ${q.detail ? `<span class="hr-detail">「${esc(q.detail)}」</span>` : ""}
  </button>`;
}

export function formHtml(q) {
  const sts = SET_STATUS.map((s) =>
    `<button type="button" class="btn hr-st-btn" data-st="${esc(s)}" aria-pressed="${q.status === s}">${esc(s)}</button>`).join("");
  return `<div class="hr-info">
      <p><b>${esc(KIND_TEXT[q.kind] || q.kind)}</b> <span class="muted">· ${esc(dayText(q.created_at))} 신청 · 지금 ${esc(q.status)}</span></p>
      <p>${esc(whoText(q.who))} <span class="muted">· 교적 ${q.found ? "찾음" : "못 찾음"}</span></p>
      <p>${esc(targetText(q))}</p>
      ${q.detail ? `<p class="hr-detail">「${esc(q.detail)}」</p>` : ""}
      <a class="btn" href="${esc(linkOf(q))}">📜 그 줄 열기</a>
      ${q.kind === "find_me" ? `<p class="muted">대개 앱 로그인 목장이 교적과 달라서예요 — 답에 「앱 설정 → 로그인 정보변경에서 목장을 ○○로 바꿔 주세요」를 적고 「반영」해 주세요.</p>` : ""}
    </div>
    <div class="hr-sts" role="group" aria-label="처리 상태">${sts}</div>
    <label class="hr-l" for="hr-ans">답 <span class="muted">(「반영 안 함」은 꼭 · ${ANSWER_MAX}자까지)</span></label>
    <textarea id="hr-ans" class="hr-ans" rows="3" maxlength="${ANSWER_MAX}">${esc(q.answer)}</textarea>
    <p class="muted">답은 같은 이름·소속으로 앱에 들어오는 사람에게도 보여요 — 다른 분 이름·사적인 사정은 적지 마세요.</p>
    ${q.kind === "not_mine" ? `<label class="hr-verify"><input type="checkbox" id="hr-ver"> 본인에게 확인했어요(전화·대면) — 「반영」할 때 꼭</label>` : ""}`;
}

// 저장 전 검사 — 서버 history-check.ts requestSetBlock·parseRequestSet 과 같은 규칙(정하는 것은 서버)
export function formCheck(q, f) {
  if (!SET_STATUS.includes(f.status)) return "bad-status";
  const a = String(f.answer || "").trim();
  if (a.length > ANSWER_MAX) return "answer-too-long";
  if (f.status === "반영 안 함" && !a) return "need-answer";
  if (f.status === "반영" && q.kind === "not_mine" && !f.verified) return "need-verified";
  return null;
}
```

- [ ] **Step 3: 손잡이** — `js/menus/ministry/requests.js`:

```js
// 📮 정정 신청 — 성경암송 앱 「🗂️ 사역 이력 확인」에서 온 정정 신청 보기·처리(2026-10-01).
//   설계: v2 docs/superpowers/specs/2026-10-01-ministry-history-requests-admin-design.md
//   실제 기록 고침은 「📜 사역 이력」의 줄 창에서 한다([그 줄 열기]). 여기는 상태·답만.
//   막는 것은 서버다(역할 ministry · 반영 안 함 답 · 내 것이 아니에요 본인 확인 · 충돌).
import { esc, toast, busy, errorText } from "../../core/ui.js";
import { openForm } from "../../core/modal.js";
import { pickOne } from "../../core/picker.js";
import { FILTERS, countsText, rowHtml, formHtml, formCheck, msgOf } from "./requests-logic.js";

const TITLE = `<h2 class="page-title">📮 정정 신청</h2>`;

export async function render(el, { call }) {
  let filter = "open", list = [], counts = {};
  el.innerHTML = TITLE + `
    <p class="muted">성경암송 앱 「🗂️ 사역 이력 확인」에서 성도님이 낸 정정 신청이에요. 기록은 [그 줄 열기]로 「📜 사역 이력」에서 고치고, 여기서는 상태와 답을 정해요. 성도님은 앱을 다시 열면 현황을 봐요(알림은 가지 않아요).</p>
    <div class="hr-bar"><button type="button" class="btn hr-filter"></button><span class="muted hr-n"></span></div>
    <div class="hr-list"><p class="empty">불러오는 중…</p></div>`;
  const $ = (s) => el.querySelector(s);

  const draw = () => {
    $(".hr-filter").textContent = FILTERS.find((x) => x.value === filter).label + " ▾";
    $(".hr-n").textContent = countsText(counts);
    $(".hr-list").innerHTML = list.length ? list.map(rowHtml).join("")
      : `<p class="empty">${filter === "open" ? "처리할 신청이 없어요" : "신청이 없어요"}</p>`;
  };
  const load = async () => {
    const r = await busy(el, () => call("historyRequestList", { status: filter }));
    if (!r.ok) { $(".hr-list").innerHTML = `<p class="empty">${esc(errorText(r))}</p>`; return; }
    list = r.list || [];
    counts = r.counts || {};
    draw();
  };

  $(".hr-filter").addEventListener("click", async (e) => {
    const v = await pickOne({ anchor: e.currentTarget, title: "보기", options: FILTERS, value: filter });
    if (v == null || v === filter) return;
    filter = v;
    await load();
  });

  $(".hr-list").addEventListener("click", (e) => {
    const b = e.target.closest(".hr-row");
    if (!b) return;
    const q = list.find((x) => x.id === Number(b.dataset.id));
    if (q) openRequest(q);
  });

  async function openRequest(q) {
    const start = q.status === "신청" ? "" : q.status;   // 「신청」 상태에서는 아무것도 눌려 있지 않다 — 담당자가 고른다
    let picked = start;
    const res = await openForm({
      title: "정정 신청 처리", html: formHtml(q), okLabel: "저장",
      onOpen: (box) => {
        box.querySelector(".hr-sts").addEventListener("click", (e) => {
          const s = e.target.closest("[data-st]");
          if (!s) return;
          picked = s.dataset.st;
          box.querySelectorAll("[data-st]").forEach((x) => x.setAttribute("aria-pressed", String(x === s)));
        });
      },
      isDirty: (box) => picked !== start || box.querySelector("#hr-ans").value !== q.answer || !!box.querySelector("#hr-ver")?.checked,
      onSubmit: async (box) => {
        const f = { status: picked, answer: box.querySelector("#hr-ans").value, verified: !!box.querySelector("#hr-ver")?.checked };
        const bad = formCheck(q, f);
        if (bad) return { ok: false, message: msgOf({ error: bad }) };
        const r = await call("historyRequestSet", { id: q.id, ...f, expect: q.updated_at });
        if (r.ok) return { ok: true, value: "saved" };
        if (r.error === "conflict") return { ok: true, value: "conflict" };   // 창을 닫고 새로 불러온다
        return msgOf(r) ? { ok: false, message: msgOf(r) } : r;
      },
    });
    if (res == null) return;
    toast(res === "conflict" ? msgOf({ error: "conflict" }) : "저장했어요");
    await load();
  }

  await load();
}
```

- [ ] **Step 4: 메뉴 줄 · CSS · 안내**

`js/menus/registry.js` — `{ id: "testers", …` 두 줄(시험 참여자) **바로 위**에(b6 의 `mn-history` 줄이 이 가지에는 없다 — 합칠 때 둘 다 남긴다):
```js
  { id: "mn-requests", group: "사역신청", icon: "📮", label: "정정 신청", desc: "앱에서 온 사역 이력 정정 신청 보기·처리",
    role: "ministry", load: () => import("./ministry/requests.js") },
```
`css/admin.css` 끝에:
```css
/* 📮 정정 신청(2026-10-01) — b6 「📜 사역 이력」이 .mh-* 를 쓴다 · 겹치지 않게 .hr-* · 상태 색은 신청 현황(.mn-stbar)과 같은 값 */
.hr-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:8px 0 12px}
.hr-row{display:block;width:100%;text-align:left;font:inherit;color:inherit;cursor:pointer}
.hr-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.hr-kind{font-weight:700;color:var(--navy)}
.hr-st{margin-left:auto}
.hr-st.s1{background:#eef3fb;color:#1a3a6b}
.hr-st.s2{background:#fdf6e3;color:#7a5f16}
.hr-st.s3{background:#eaf6ee;color:#1f5c3a}
.hr-st.s4{background:#f4f6fa;color:#5a6273}
.hr-target{display:block;margin-top:6px;font-weight:600;word-break:keep-all}
.hr-detail{display:block;margin-top:4px;color:var(--gray);word-break:keep-all}
.hr-info p{margin:0 0 6px;word-break:keep-all}
.hr-sts{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0 10px}
.hr-st-btn[aria-pressed="true"]{background:var(--navy);border-color:var(--navy);color:#fff}
.hr-l{display:block;font-weight:700;margin:6px 0 4px}
.hr-ans{width:100%;box-sizing:border-box;font:inherit;padding:10px;border:1px solid var(--border);border-radius:10px;resize:vertical}
.hr-verify{display:flex;gap:8px;align-items:center;margin-top:10px;font-weight:700}
```
`privacy.html` 9번 카드의 「보관과 삭제:」 문장 **바로 앞**에 `담당자가 처리하면 상태·답·처리한 담당자·때가 남고, 「내 것이 아니에요」는 본인 확인을 했다는 표시가 바꾼 기록에 남아요.<br>` 를 넣는다(앞 문장과 `<br>` 로 줄이 나뉘게).

- [ ] **Step 5: 시험·preflight·`<select>` 검사**

```bash
node --experimental-strip-types --test tests/requests-logic.test.mjs tests/registry.test.mjs && python tools/preflight.py
grep -rn '<select\|type="date"\|type="time"' js/menus/ministry/requests*.js || echo "없음"
```
Expected: PASS · 실패 0 · `없음`.

- [ ] **Step 6: 화면 확인(헤드리스 · 개발)** — 화면은 카카오 로그인이 필요해 손으로 못 연다. 세션 scratchpad(저장소 밖)에 일회용 Playwright 스크립트로:
  - `python -m http.server 8782`(이 worktree 에서 · 띄운 PID 로만 끈다), 크롬 `channel="chrome"` 헤드리스.
  - 로그인 대신 `js/menus/ministry/requests.js` 를 빈 페이지에서 직접 import 해 `render(el, { call })` 를 가짜 `call`(Task 3 시험의 모양 그대로 신청 넷 — 줄 정정·빼 둔 줄·빠진 사역·찾아 주세요)로 부른다. 페이지는 `css/tokens.css`·`css/admin.css` 를 링크한다.
  - 폭 1366×657 · 390 · 320 에서 `document.documentElement.scrollWidth <= innerWidth` · 콘솔 오류 0 · 줄을 눌러 처리 창이 뜨는지 · 「반영 안 함」+빈 답으로 저장하면 창 안 빨간 줄(창이 닫히지 않음) · 「내 것이 아니에요」 줄에서만 확인 칸이 보이는지. 사진을 찍어 Read 로 본다.
  - 결과를 보고서에 적는다. 스크립트는 커밋하지 않는다.

- [ ] **Step 7: 커밋**

```bash
git add js/menus/ministry/requests-logic.js js/menus/ministry/requests.js tests/requests-logic.test.mjs js/menus/registry.js css/admin.css privacy.html
git commit -m "feat(정정신청): 「📮 정정 신청」 메뉴 — 목록(거르기·수)·처리 창(상태·답·본인 확인·그 줄 열기) · .hr-* · 개인정보 한 줄" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: b6 에 부탁 · 문서 · 운영 계획 잇기

**Files:**
- Modify(성경암송): `docs/notes/ministry-history-check.md` · `docs/superpowers/plans/2026-10-01-ministry-history-check.md`(Task 9) · `CLAUDE.md`(「다음 작업」의 사역현황 줄)
- Modify(교회 어드민 worktree): `CLAUDE.md`(⚠️ 함정 절에 한 줄)

**Interfaces:** 없음(문서·부탁).

- [ ] **Step 1: b6 세션에 부탁을 보낸다** — `ListAgents` 로 b6(사역 이력 · worktree `ministry-history`) 세션 이름을 찾아 `SendMessage`:
  「[사역 이력 확인 세션 부탁] 교회 어드민 「📮 정정 신청」 메뉴가 신청마다 [그 줄 열기]로 `#/mn-history?row=<ministry_history.id>`(줄 정정)·`#/mn-history?q=<이름>`(빠진 사역·찾아 주세요) 주소를 엽니다. `history.js` `render(el, { call, query })` 에서 `query.row` 가 있으면 목록을 부른 뒤 그 줄 창(openRow)을 — 걸러진 목록에 없으면 그 한 줄을 불러 — 열고, `query.q` 가 있으면 이름 찾기 칸을 채워 걸러 주실 수 있을까요? 우리 쪽은 주소만 만들고, 아직 안 받으면 「📜 사역 이력」 첫 화면이 열릴 뿐입니다. 설계 v2 `docs/superpowers/specs/2026-10-01-ministry-history-requests-admin-design.md` §5.」
  세션을 못 찾으면 보내지 않고 보고서에 「친구가 b6 에 전해 줄 것」으로 적는다.
- [ ] **Step 2: 문서**
  - `docs/notes/ministry-history-check.md` 끝에 절 「담당자 처리 메뉴 「📮 정정 신청」(2026-10-01)」: 설계·계획 경로 · 액션 둘(역할 ministry) · 「반영 안 함」 답 필수 · 「내 것이 아니에요」 반영은 본인 확인 체크 · 알림 없음 · [그 줄 열기]는 b6 의 `?row`·`?q` 를 기다린다 · 직분은 정정하지 않는다.
  - 앞선 계획 `2026-10-01-ministry-history-check.md` Task 9 Step 3 첫 줄 앞에 한 줄: 「⚠️ 이 가지에는 「📮 정정 신청」 메뉴(계획 `2026-10-01-ministry-history-requests-admin.md`)도 함께 들어 있다 — 함께 나간다. 합칠 때 b6 가지와 `registry.js`(메뉴 줄)·`index.ts`(import·switch)·`authz.ts` 가 겹친다 — 둘 다 남긴다.」
  - 성경암송 `CLAUDE.md` 「다음 작업」의 🗂️ 줄에서 「③ 다음 조각: 교회 어드민 담당자 처리 메뉴(12/13 전)」를 「③ 담당자 처리 메뉴 「📮 정정 신청」 개발 끝(가지 `history-check`) — b6 에 `?row`·`?q` 부탁」으로 바꾼다.
  - 교회 어드민 `CLAUDE.md` 「## ⚠️ 함정」 끝에 한 줄: 「- **「📮 정정 신청」**(`historyRequestList`·`historyRequestSet`): 응답에 `user_id`·`person_id`·`handled_by` 를 싣지 않는다(`requestAdminOut`) · 「반영 안 함」 답 필수 · `not_mine` 반영은 `verified` · 상태로 거를 때 `.in()` 금지(「확인 중」 빈칸). 설계 v2 `docs/superpowers/specs/2026-10-01-ministry-history-requests-admin-design.md`.」
- [ ] **Step 3: 커밋 — 두 저장소 따로**

```bash
cd /c/Projects/bible-memorize-church-app-v2
git diff --stat docs/notes/ministry-history-check.md docs/superpowers/plans/2026-10-01-ministry-history-check.md CLAUDE.md
git add docs/notes/ministry-history-check.md docs/superpowers/plans/2026-10-01-ministry-history-check.md CLAUDE.md
git commit -m "docs(정정신청): 함정 기록 · 운영 계획(Task 9)에 처리 메뉴 함께 · 다음 작업 줄" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git show --stat HEAD
cd /c/Projects/church-admin/.worktrees/history-check
git add CLAUDE.md
git commit -m "docs(정정신청): 함정에 「📮 정정 신청」 한 줄" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
