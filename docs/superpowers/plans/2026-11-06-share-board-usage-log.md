# 보내기 · 게시판 이용 기록(누가) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 카카오 등 보내기와 게시판 열기를 「누가 · 어느 날 · 몇 번」 남기고, 교회 어드민 📊 성경암송 통계 새 탭에서 이름 · 소속별로 본다.

**Architecture:** 이미 운영 중인 열람 기록 표 `feature_log`(사람 × 한국 날짜 × 값 × 항목 → cnt)에 값 다섯(`board` · `share-open` · `share-kakao` · `share-sheet` · `share-save`)을 더한다 — 새 표 · SQL 없음. 화면은 정해 둔 자리에서 `logFeature` 를 부르고(어린 부서는 화면 · 서버 · 읽기 세 겹으로 뺀다), 성경암송 api 의 새 관리자 읽기 액션 `featureUsage` 를 교회 어드민이 내부 키로 중계해 다섯째 탭에 그린다. 개인정보 안내 세 자리는 기록을 켜는 앱 판과 같은 판에 고친다.

**Tech Stack:** Vanilla JS PWA(app.js · js/*.js) · Supabase Edge Function(Deno · TypeScript — supabase/functions/api) · 교회 어드민(Vanilla JS ES 모듈 · Edge Function church-admin) · 시험은 꾸러미 없는 node(node:test · node:assert · node:vm) · bash 스모크.

**설계서:** `docs/superpowers/specs/2026-11-06-share-board-usage-log-design.md` — 이름 표(2절)가 이 계획의 약속이다.

## Global Constraints

- 값 이름은 소문자와 하이픈만: `board` · `share-open` · `share-kakao` · `share-sheet` · `share-save`(`tests/navi.test.cjs` ⑤ 의 `[a-z-]+`).
- 종류 코드(item): 1 가정 축복 기도문 · 2 오늘의 묵상 · 3 이번 주 말씀 · 4 가을 말씀암송 동행 안내 · 5 앱 소개 · 6 외운 말씀 · 7 교육 수료증 · 8 앱 설치 주소 · 9 이번 주 말씀 주소 · `board` 는 0.
- 「보냈다」라고 쓰지 않는다 — 「카카오톡을 열었다 · 공유 창으로 넘겼다 · 내려받았다/복사했다」 까지만(기록 이름 · 화면 글 · 방침 모두).
- 어린 부서(`needsGuardian` — app.js · index.ts 같은 규칙)는 다섯 값을 남기지 않는다: 화면 `logFeature` · 서버 `featureLog` · 읽기 `featureUsage` 세 겹.
- `user_id` 는 어떤 응답 · 화면 · 뷰에도 싣지 않는다 · 새 뷰 · 정책을 만들지 않는다 · `TO authenticated` 금지.
- 기도문 판 이름 칸(`pshState.name`) · 받는 분 · 고른 앱 · 글 내용 · 파일 이름 · 읽은 글 번호는 남기지 않는다.
- `js/*.js` 안에서 `logFeature` 는 늘 `typeof logFeature === "function"` 가드(시험 vm 에는 없다).
- 관리자 묵상 미리보기에서 연 판은 아무것도 남기지 않는다(`pshState.noLog`).
- 배포 차례: ① api(개발 → 스모크 → main → 운영 → 운영 스모크) ② 앱 + 개인정보 세 자리 한 판(bump) ③ 교회 어드민(함수 → 화면). 앱이 api 보다 먼저 나가면 새 값이 `skipped` 로 조용히 버려진다.
- 공용 체크아웃 — 구현은 손으로 만든 worktree(성경암송 `C:\Projects\wt-usage` 가지 `usage-log` · 교회 어드민 `C:\Projects\wt-usage-ca` 가지 `usage-log-ca`) · 커밋은 경로를 못 박는다(`git add -- <파일들>` · `git add -A` 금지) · 메시지 끝 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- 고치는 자리를 글자로 잡고 있는 시험은 같은 Task 에서 고친다 · 푸시 전 `python tools/preflight.py`(종료 코드 0) — 깨진 채 오르면 모든 세션의 배포가 막힌다.
- 화면 글은 한글 · 쓰지 않는 낱말(이벤트): 「선물 대상」·「당첨」·「1등」·「자격」.
- 구역끼리 맞춘 이름(2026-11-06 합치기): 교회 어드민 탭 id `featureUsage`(`"usage"` 는 ① 기간별 사용현황이 이미 쓴다) · `TABS[4] = ["featureUsage", "📤 보내기 · 💬 게시판"]` · 그리기 함수 `featureUsageHtml(d, from, to)`(`usageHtml` 는 이미 있다) · 순수 함수 `usageView(d)` ·
  묵상 단추는 `const opts = { preview: !!(extra && extra.preview) };` 뒤 `openMedShare(m, opts)`(그 줄에 객체 글자를 바로 쓰면 시험 cut 이 받이를 끊는다) · `featureUsage` 의 빈 날짜(`""`)는 「제한 없음」(교회 어드민 「전체기간」).
- ⚠️ **하위 에이전트는 공용 자원을 쓰지 않는다** — `git push` · `python tools/deploy-fn.py`(개발 · 운영 모두) · `bash tests/*-smoke.sh`(개발 · 운영 DB) · `python tools/sql-applied.py` · `gh` · 교회 어드민 localhost 확인은 **Task 14 에서 본 세션이 한 번씩** 한다. 구역 안의 그런 Step 은 「Task 14 로 넘김」으로 보고하고 건너뛴다(로컬 `node --test` · `python tools/preflight.py` · `node --check` 는 한다).
- 운영 스모크는 다섯 값을 어느 계정으로도 쓰지 않는다 — 0 uuid 로 보내 `skipped: "guardian-check"`(새 관문)만 본다(교회 어드민 탭에 시험 계정이 뜨지 않게) · 어린이 시험 계정은 개발에서만 만든다.
- 구현 차례: 성경암송 worktree 안에서 **구역 1 → 2 → 3 → 4 → Task 13** 차례로(같은 시험 파일 `tests/pray-share.test.cjs` 를 구역 2 · 3 · 4 가 차례로 고친다 — 구역 2 가 322 · 388, 구역 3 이 325 · 326 · 357 · 366 · 221 · 228 · 232, 구역 4 가 857) · 구역 5(교회 어드민)는 그 저장소 worktree 에서 따로(동시에 해도 된다) · Task 14 는 본 세션.

## 시작 — worktree 두 개(한 번만)

```bash
cd /c/Projects/bible-memorize-church-app-v2 && git fetch -q origin && git worktree add /c/Projects/wt-usage -b usage-log origin/main
cd /c/Projects/church-admin && git fetch -q origin && git worktree add /c/Projects/wt-usage-ca -b usage-log-ca origin/main
git -C /c/Projects/wt-usage config core.hooksPath .githooks
```
(⚠️ isolation 옵션을 쓰지 않는다 — 작업 폴더가 바뀌면 엉뚱한 저장소에서 일한다 · 메모리 agent-worktree-manual.)

---

## 구역 1 — 서버 api — 값 다섯 · 어린 부서 거르기 · featureUsage (Task 1~2)

| 파일 | 맡은 일 |
|---|---|
| `supabase/functions/api/index.ts` | `FEATURES` 에 다섯 값을 더하고 `USAGE_FEATURES` 를 둔다. `featureLog` 는 rpc 앞에서 어린 부서를 거른다. vm 시험 구간 표식을 두고 `SHARE_KINDS` · `featureUsage` 를 넣는다. `INTERNAL_ADMIN_OK` 와 `switch` 에도 더한다 |
| `supabase/feature_log.sql` | 머리 「item 의 뜻」 표에 다섯 값과 종류 코드를 적는다. 낡은 「index.ts 861행」을 `logSongClick` 이름으로 바꾼다. 보는 법 ⑨(누가 · 다섯 값만)를 더한다 |
| `tests/feature-log-smoke.sh` | 값 목록에 다섯 값을 더한다(FEATURES 와 같게). 어른은 걸리지 않고 어린이(개발)는 `skipped guardian` 인지 본다. `featureUsage` 가 닫혀 있는지는 늘 보고, 꼴은 개발에서 내부 키 길로 본다 |
| `tests/navi.test.cjs` | ⑤-2 를 더한다. 다섯 값이 네 곳(FEATURES · USAGE_FEATURES · 스모크 목록 · SQL 머리 표)에 다 있는지, ⑨ 가 있는지, 낡은 줄 번호가 없는지 본다 |
| `tests/feature-usage.test.cjs`(새로) | ① featureLog 거르기(vm) · ② 문(INTERNAL_ADMIN_OK · ADMIN_PW_ONLY · switch) · ③ featureUsage(vm — 꼴 · user_id 없음 · 어린 부서 뺌 · 차례 · 빈 결과) |
| `tools/preflight.py` | `PURE_TESTS` 에 `tests/feature-usage.test.cjs` 를 더한다 |

작업 위치는 `C:\Projects\wt-usage`(가지 `usage-log`)다. 아래 명령은 모두 그 뿌리에서 친다. node 가 v22(22.14)라 `node --test` 끝에 TAP 셈(`# pass N` · `# fail N`)이 찍힌다.
이 PC 는 `core.autocrlf=true`(`C:/Users/sewki/.gitconfig`)라 worktree 의 파일이 CRLF 로 풀린다. 그래도 문제는 없다. 시험은 모두 `\r\n` 을 걷고 읽고, Git Bash 5.2 는 CRLF 스크립트도 그대로 돌린다(`bash -n` 과 실행 모두 확인했다).

지금 글자를 잡고 있는 시험은 미리 봤다.
- `tests/navi.test.cjs` ⑤(236줄)는 `const FEATURES = new Set([` 부터 첫 `]);` 까지에서 `"[a-z-]+"` 를 읽어, 스모크의 첫 `for F in … ; do` 줄과 맞대 본다. 두 곳에 같은 다섯 값을 더하므로 그대로 통과한다. `navi = 0 고정` 줄도 건드리지 않는다.
- `tests/push-report-cron.test.cjs` ③ 은 `INTERNAL_ADMIN_OK` 에 크론 셋이 **없는지만** 본다. 그대로 통과한다.
- `tests/store-review.test.cjs` 가 자르는 「스토어 심사 — 순수 함수」 구간(index.ts 4933~5042)은 손대지 않는다.
- `tests/api-split.test.cjs` ①②⑤: 새 이름(`USAGE_FEATURES` · `SHARE_KINDS` · `featureUsage`)은 다른 파일과 겹치지 않는다. 쓰는 도우미(`adminError` · `fetchAllRows` · `WIDGET_YMD_RE` · `db`)는 `index.ts:8` 이 이미 들여온다.
- `async function featureLog(b: any)` 글자를 잡고 있는 시험은 없다. tests/ 를 grep 하면 `const FEATURES` 를 잡는 navi 236줄 하나만 나온다.
- 이 계획은 main(0c62e88) 사본에 그대로 얹어 돌려 봤다. old 글자는 모두 한 번씩 맞는다. Task 2 의 ③④·스모크 ⑦ old 는 Task 1 이 만든 글자라 Task 1 뒤에 한 번 맞는다. 아래 Step 2 · 4 의 기대 출력은 그 실행 결과다.

---

### Task 1: 다섯 값 · featureLog 의 어린 부서 거르기 · 네 곳 맞추기

**Files:**
- Create: `tests/feature-usage.test.cjs`
- Modify: `supabase/functions/api/index.ts:1914 근처`(`const FEATURES` · 1930 `async function featureLog` · 1948 `// ---- 가정 축복 기도문 목록(getBlessings)` 줄)
- Modify: `supabase/feature_log.sql:29` · `:47`(`ranking-scope` 줄 앞) · `:51` · 끝(⑧ 뒤 · 216~217)
- Modify: `tests/feature-log-smoke.sh:29`(`pass=0`) · `:53`(`for F in`) · `:75~77`(끝 셈)
- Modify: `tests/navi.test.cjs:244~245`(⑤ 끝 뒤)
- Modify: `tools/preflight.py:167`(`pray-share` 줄 뒤)
- Test: `tests/feature-usage.test.cjs` · `tests/navi.test.cjs`

**Interfaces:**
- Consumes:
  - `needsGuardian(p)` — `index.ts:4950`, 「// ── 스토어 심사 — 순수 함수 (여기부터) ──」 구간
  - `db`(`_shared.ts`) · `FEATURES` · `v2_feature_log`(rpc `uid · f · n`)
- Produces:
  - `const USAGE_FEATURES = new Set(["board", "share-open", "share-kakao", "share-sheet", "share-save"])` — FEATURES 바로 아래에 한 줄 Set 으로
  - 표식 `// ── 열람 기록 — vm 시험 구간 (여기부터) ──` / `// ── 열람 기록 — vm 시험 구간 (여기까지) ──`
  - `featureLog(b)` 의 새 답 `{ ok: true, skipped: "guardian" }` · `{ ok: true, skipped: "guardian-check" }`
  - 시험 파일의 이름 `read` · `J` · `cut` · `INDEX` · `FIVE` · `UID` · `G` · `SEC` · `CTX` · `S` — Task 2 가 이어 쓴다
  - 스모크의 `skip` · `sk()` — Task 2 가 쓴다

- [ ] **Step 1: 실패하는 시험 쓰기**

`tests/feature-usage.test.cjs` 를 새로 만든다(전부).

```js
// 보내기 · 게시판 이용 기록(누가 · 2026-11-06) — api 쪽 약속(꾸러미 없음 · tools/preflight.py 가 건다)
//
//   node --test tests/feature-usage.test.cjs
//
// 설계: docs/superpowers/specs/2026-11-06-share-board-usage-log-design.md(2-1 값 다섯 · 2-4 어린 부서 · 2-5 featureUsage)
// index.ts 는 require() 할 수 없어 「열람 기록 — vm 시험 구간」 표식 사이만 잘라 node:vm 에서 가짜 db 로 돌린다
//   (본보기 tests/api-split.test.cjs ⑥ · tests/store-review.test.cjs). needsGuardian 은 가짜가 아니라 같은 파일
//   「스토어 심사 — 순수 함수」 구간의 진짜 것을 넣는다 — 가짜를 두면 서버 규칙과 갈려도 이 시험이 모른다.
//
// 무엇을 지키나
//   ① featureLog — 다섯 값은 rpc 보다 먼저 users(type,bu,grade)를 서버 행으로 읽어 어린 부서면 skipped "guardian" ·
//      행 없음 · 읽기 오류 · 예외면 skipped "guardian-check"(모르면 안 남긴다) · 늘 ok:true · 다른 값은 users 를 안 읽고 그대로.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (...f) => fs.readFileSync(path.join(root, ...f), 'utf8').replace(/\r\n/g, '\n');
const J = (x) => JSON.parse(JSON.stringify(x));   // vm 안에서 만든 값은 realm 이 달라 deepEqual 이 떨어진다
// 끝 표식은 시작 표식 **뒤에서** 찾는다
function cut(src, start, end, where) {
  const s = src.indexOf(start);
  const e = s >= 0 ? src.indexOf(end, s + start.length) : -1;
  assert.ok(s >= 0, where + ' 에서 시작 표식을 못 찾았다 — 이 검사가 낡았다: ' + start);
  assert.ok(e > s, where + ' 에서 끝 표식이 시작보다 뒤에 없다 — 이 검사가 낡았다: ' + end);
  return src.slice(s, e);
}

const INDEX = read('supabase', 'functions', 'api', 'index.ts');
const FIVE = ['board', 'share-open', 'share-kakao', 'share-sheet', 'share-save'];
const UID = '0d4f2c1a-5b6e-4c7d-8e9f-0a1b2c3d4e5f';

// 진짜 needsGuardian(스토어 심사 순수 구간 — tests/store-review.test.cjs 가 앱과 글자까지 맞대 본다)
const G = vm.runInContext(
  cut(INDEX, '// ── 스토어 심사 — 순수 함수 (여기부터) ──', '// ── 스토어 심사 — 순수 함수 (여기까지) ──', 'index.ts') +
  '\n;({ needsGuardian })', vm.createContext({}));

// 열람 기록 구간 — 구간 밖의 이름은 CTX 로 넣는다(index.ts 구간 머리 주석의 목록과 같게)
const SEC = cut(INDEX, '// ── 열람 기록 — vm 시험 구간 (여기부터) ──', '// ── 열람 기록 — vm 시험 구간 (여기까지) ──', 'index.ts');
assert.ok(!/:\s*(?:any|string|number|boolean|unknown|void)\b|:\s*(?:Promise|Record|Set|Map|Array)\s*</.test(SEC),
  'index.ts 열람 기록 구간에 타입 표기가 들어왔다 — node:vm 이 못 돌린다. 표기를 빼거나 구간 밖으로 옮겨라');
const CTX = vm.createContext({ needsGuardian: G.needsGuardian, db: null });
const S = vm.runInContext(SEC + '\n;({ FEATURES, USAGE_FEATURES, featureLog })', CTX);

// 가짜 db — 부른 것을 적어 두고 정해 둔 답을 돌려준다(users 한 줄 읽기 · rpc)
function logDb({ user = null, userError = null, userThrows = false } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      const q = { table, ops: [] };
      calls.push(q);
      const b = {
        select(c) { q.ops.push(['select', c]); return b; },
        eq(k, v) { q.ops.push(['eq', k, v]); return b; },
        maybeSingle() {
          q.ops.push(['maybeSingle']);
          return userThrows ? Promise.reject(new Error('network down')) : Promise.resolve({ data: user, error: userError });
        },
      };
      return b;
    },
    rpc(name, args) { calls.push({ rpc: name, args }); return Promise.resolve({ error: null }); },
  };
}
async function runLog(body, opts) {
  const d = logDb(opts);
  CTX.db = d;
  const r = J(await S.featureLog(body));
  return { r, calls: J(d.calls) };
}

test('① featureLog — 다섯 값 · 어른이면 users 를 서버 행으로 먼저 읽고 rpc 로 남긴다', async () => {
  assert.deepEqual([...S.USAGE_FEATURES].sort(), FIVE.slice().sort(), 'USAGE_FEATURES 는 정확히 다섯');
  for (const f of FIVE) {
    assert.ok(S.FEATURES.has(f), 'FEATURES 에 ' + f + ' 가 없다');
    const { r, calls } = await runLog({ user_id: UID, feature: f, item: 3 }, { user: { type: '교구', bu: null, grade: null } });
    assert.deepEqual(r, { ok: true }, f);
    assert.deepEqual(calls, [
      { table: 'users', ops: [['select', 'type,bu,grade'], ['eq', 'id', UID], ['maybeSingle']] },
      { rpc: 'v2_feature_log', args: { uid: UID, f, n: 3 } },
    ], f + ' — users 를 읽은 다음에 rpc');
  }
});

test('① featureLog — 다섯 값 · 만 14세 미만 어린 부서면 rpc 를 부르지 않는다(skipped "guardian") · 같은 부서 어른은 남는다', async () => {
  const kids = [{ type: '교회학교', bu: '초등부', grade: '5학년' }, { type: '교회학교', bu: '유치부', grade: '' },
    { type: '교회학교', bu: '중등부', grade: '2학년' }, { type: '교회학교', bu: '사랑부', grade: null }];
  for (const user of kids) {
    for (const f of FIVE) {
      const { r, calls } = await runLog({ user_id: UID, feature: f, item: 1 }, { user });
      assert.deepEqual(r, { ok: true, skipped: 'guardian' }, f + ' / ' + user.bu);
      assert.ok(!calls.some((c) => c.rpc), f + ' / ' + user.bu + ' — rpc 를 불렀다(어린이 기록이 남는다)');
    }
  }
  const adults = [{ type: '교회학교', bu: '초등부', grade: '교사' }, { type: '교회학교', bu: '중등부', grade: '3학년' },
    { type: '교회학교', bu: '고등부', grade: '1학년' }];
  for (const user of adults) {
    const { r, calls } = await runLog({ user_id: UID, feature: 'board', item: 0 }, { user });
    assert.deepEqual(r, { ok: true }, user.bu + ' ' + user.grade);
    assert.ok(calls.some((c) => c.rpc === 'v2_feature_log'), user.bu + ' ' + user.grade + ' — 어른인데 안 남았다');
  }
});

test('① featureLog — 다섯 값 · 부서를 모르면 남기지 않는다(행 없음 · 읽기 오류 · 예외 → skipped "guardian-check")', async () => {
  for (const [why, opts] of [['행 없음', { user: null }],
    ['읽기 오류', { userError: { message: 'invalid input syntax for type uuid' } }], ['예외', { userThrows: true }]]) {
    const { r, calls } = await runLog({ user_id: UID, feature: 'share-sheet', item: 1 }, opts);
    assert.deepEqual(r, { ok: true, skipped: 'guardian-check' }, why);
    assert.ok(!calls.some((c) => c.rpc), why + ' — rpc 를 불렀다');
  }
});

test('① featureLog — 다른 값은 users 를 읽지 않고 지금 그대로 · 모르는 값 · user_id 없음은 아무것도 부르지 않는다', async () => {
  const kid = { type: '교회학교', bu: '초등부', grade: '3학년' };
  const { r, calls } = await runLog({ user_id: UID, feature: 'psalm', item: 1042 }, { user: kid });
  assert.deepEqual(r, { ok: true });
  assert.deepEqual(calls, [{ rpc: 'v2_feature_log', args: { uid: UID, f: 'psalm', n: 1042 } }], '다섯 값만 거른다 — psalm 은 users 를 안 읽는다');
  for (const body of [{ user_id: UID, feature: '몰라', item: 0 }, { feature: 'board', item: 0 }, { user_id: '', feature: 'share-open', item: 1 }]) {
    const out = await runLog(body, { user: { type: '교구' } });
    assert.deepEqual(out.r, { ok: true, skipped: true }, JSON.stringify(body));
    assert.deepEqual(out.calls, [], JSON.stringify(body) + ' — 아무것도 부르지 않는다');
  }
});

test('① featureLog 글자 — 다섯 값 거르기가 rpc 보다 앞 · 부서는 서버 행으로(앱이 보낸 본문 b 로 판단하지 않는다)', () => {
  const fn = cut(SEC, 'async function featureLog(b) {', '\n}\n', 'featureLog');
  const g = fn.indexOf('USAGE_FEATURES.has('), r = fn.indexOf('db.rpc("v2_feature_log"');
  assert.ok(g > 0 && r > g, '다섯 값 거르기가 rpc 뒤에 있다(또는 없다)');
  assert.ok(fn.includes('db.from("users").select("type,bu,grade")'), 'users(type,bu,grade) 를 읽지 않는다');
  assert.ok(fn.includes('needsGuardian(') && !/needsGuardian\(\s*b\s*[),.]/.test(fn), '앱이 보낸 본문(b)으로 부서를 판단한다 — users 행으로');
});
```

`tests/navi.test.cjs` — ⑤ 끝 바로 뒤에 ⑤-2 를 더한다. 이 파일의 도우미 `slice` · `read` · `INDEX`(17 · 15 · 25줄)를 그대로 쓴다.

old:
```js
  assert.ok(/logFeature\("navi", 0\)/.test(APP), '앱은 단추 누름에서 navi 를 남긴다');
});
```
new:
```js
  assert.ok(/logFeature\("navi", 0\)/.test(APP), '앱은 단추 누름에서 navi 를 남긴다');
});

// ── ⑤-2 보내기 · 게시판 다섯 값(2026-11-06 · docs/superpowers/specs/2026-11-06-share-board-usage-log-design.md 2-1) ──
test('⑤-2 열람 기록 — 보내기 · 게시판 다섯 값이 네 곳(FEATURES · USAGE_FEATURES · 스모크 목록 · feature_log.sql 머리 표)에 다 있다', () => {
  const FIVE = ['board', 'share-open', 'share-kakao', 'share-sheet', 'share-save'];
  const blk = slice(INDEX, 'const FEATURES = new Set([', ']);', 'index.ts FEATURES');
  const feats = [...blk.matchAll(/^\s*"([a-z-]+)"/gm)].map((m) => m[1]);
  const usage = /^const USAGE_FEATURES = new Set\(\[([^\]]*)\]\);$/m.exec(INDEX);
  assert.ok(usage, 'index.ts 에 USAGE_FEATURES 한 줄(Set)이 없다 — FEATURES 바로 아래');
  assert.deepEqual([...usage[1].matchAll(/"([a-z-]+)"/g)].map((m) => m[1]).sort(), FIVE.slice().sort(), 'USAGE_FEATURES 는 정확히 다섯');
  const smoke = /^for F in ([^;]+); do/m.exec(read('tests', 'feature-log-smoke.sh'));
  assert.ok(smoke, 'feature-log-smoke.sh 의 for 줄을 못 찾았다 — 이 검사가 낡았다');
  const sql = read('supabase', 'feature_log.sql');
  for (const f of FIVE) {
    assert.ok(feats.includes(f), 'FEATURES 에 ' + f + ' 가 없다 — 앱이 보내는 logFeature("' + f + '") 가 조용히 버려진다');
    assert.ok(smoke[1].trim().split(/\s+/).includes(f), 'feature-log-smoke.sh 목록에 ' + f + ' 가 없다');
    assert.ok(new RegExp('^--\\s+' + f + '\\s+=', 'm').test(sql), 'feature_log.sql 머리 표에 ' + f + ' 줄이 없다');
  }
  assert.ok(!sql.includes('index.ts 861행'), 'feature_log.sql 머리에 낡은 줄 번호(index.ts 861행)가 남았다 — logSongClick 은 이름으로 가리킨다');
  assert.ok(/^-- ⑨ /m.test(sql) && sql.includes("where f.feature in ('board', 'share-open', 'share-kakao', 'share-sheet', 'share-save')"),
    'feature_log.sql 보는 법 ⑨(누가 · 다섯 값만)가 없다');
});
```

- [ ] **Step 2: 돌려서 실패 확인**

```bash
node --test tests/feature-usage.test.cjs 2>&1 | grep -E "^# (pass|fail)|시작 표식"
node --test tests/navi.test.cjs 2>&1 | grep -E "^# (pass|fail)|USAGE_FEATURES 한 줄"
```
기대:
- feature-usage: `# AssertionError [ERR_ASSERTION]: index.ts 에서 시작 표식을 못 찾았다 — 이 검사가 낡았다: // ── 열람 기록 — vm 시험 구간 (여기부터) ──` · `# pass 0` · `# fail 1`. 표식이 아직 없어서 파일 머리의 `cut` 에서 떨어진다.
- navi: `error: 'index.ts 에 USAGE_FEATURES 한 줄(Set)이 없다 — FEATURES 바로 아래'` · `# pass 13` · `# fail 1`. ⑤-2 는 USAGE_FEATURES 줄을 다섯 값보다 먼저 보므로, 이 글로 떨어진다. 옛 ⑤ 를 비롯한 13가지는 그대로 통과한다.

- [ ] **Step 3: 구현**

**① `supabase/functions/api/index.ts:1914` — 구간 시작 표식**

old:
```ts
const FEATURES = new Set([
  "psalm",
```
new:
```ts
// ── 열람 기록 — vm 시험 구간 (여기부터) ──
//   tests/feature-usage.test.cjs 가 여기부터 「여기까지」를 잘라 node:vm 에서 가짜 db 로 돌린다 — 타입 표기 · import 를 넣지 말 것.
//   구간 밖에서 가져다 쓰는 이름: db · needsGuardian(스토어 심사 순수 구간) — 시험이 같은 이름으로 넣어 준다.
const FEATURES = new Set([
  "psalm",
```

**② 같은 파일 `:1928~1932` — 다섯 값 · USAGE_FEATURES · featureLog 거르기**

`(b: any)` 의 타입 표기는 뺀다. vm 구간이라서다. 배포는 타입 검사를 하지 않는다. 같은 파일의 `function needsGuardian(p)` 도 표기 없이 운영 중이다.

old:
```ts
]);

async function featureLog(b: any) {
  if (!b.user_id || !FEATURES.has(String(b.feature))) return { ok: true, skipped: true };
  try {
```
new:
```ts
  "board",            // 💬 게시판 화면을 엶(app.js renderBoard 첫 줄) — item = 0 고정 (2026-11-06 · 아래 USAGE_FEATURES)
  "share-open",       // 📤 보내기 판(js/pray-share.js pshOpen)을 새로 엶 — item = 종류 코드 1·2·3 (2026-11-06)
  "share-kakao",      // 📤 카카오톡을 엶(pshKakaoGo — sendDefault 가 예외 없이 끝남) — item = 3 (2026-11-06)
  "share-sheet",      // 📤 공유 창으로 넘김(navigator.share 가 resolve) — item = 종류 코드 (2026-11-06)
  "share-save",       // 📤 그림 내려받기 시작 · 글 · 주소 복사 끝 — item = 종류 코드 (2026-11-06)
]);
// 「누가」를 보는 다섯 값(2026-11-06 · 설계 docs/superpowers/specs/2026-11-06-share-board-usage-log-design.md) —
//   만 14세 미만 어린 부서(needsGuardian)는 남기지 않는다: 앱 logFeature · 아래 featureLog · 읽기 featureUsage 세 겹.
//   ⚠️ app.js 의 같은 이름 목록(logFeature 바로 위)과 같아야 한다 — 다르면 앱과 서버의 거르기가 갈린다.
//   ⚠️ 한 줄 Set 으로 둔다 — tests/navi.test.cjs ⑤-2 가 정규식으로 읽는다.
const USAGE_FEATURES = new Set(["board", "share-open", "share-kakao", "share-sheet", "share-save"]);

async function featureLog(b) {
  if (!b.user_id || !FEATURES.has(String(b.feature))) return { ok: true, skipped: true };
  // 다섯 값 — 부서를 서버 행(users)으로 보고 어린 부서면 남기지 않는다(앱이 보낸 칸은 믿지 않는다 · login 의 보호자 확인과 같다).
  //   ⚠️ 행 없음 · 읽기 오류 · 예외도 남기지 않는다(모르면 안 남긴다) · 그래도 늘 ok(기록 때문에 화면이 막히면 안 된다).
  if (USAGE_FEATURES.has(String(b.feature))) {
    try {
      const { data: who, error: we } = await db.from("users").select("type,bu,grade").eq("id", b.user_id).maybeSingle();
      if (we || !who) return { ok: true, skipped: "guardian-check" };
      if (needsGuardian(who)) return { ok: true, skipped: "guardian" };
    } catch (_e) {
      return { ok: true, skipped: "guardian-check" };
    }
  }
  try {
```

**③ 같은 파일 `:1945~1948` — 구간 끝 표식(featureLog 바로 뒤)**

old:
```ts
  return { ok: true };
}

// ---- 가정 축복 기도문 목록(getBlessings) → blessing.ts (2026-10-12 파일 나누기 2단계) ----
```
new:
```ts
  return { ok: true };
}
// ── 열람 기록 — vm 시험 구간 (여기까지) ──

// ---- 가정 축복 기도문 목록(getBlessings) → blessing.ts (2026-10-12 파일 나누기 2단계) ----
```

**④ `supabase/feature_log.sql:29` — 머리 셈**

old:
```sql
--   (2026-09-23 저녁 기준 열한 값. 앞 열은 FEATURES(index.ts)가 거르는 값, song 만 서버 안쪽 호출)
```
new:
```sql
--   (2026-11-06 기준 — FEATURES(index.ts)가 거르는 열여덟 값 + 서버 안쪽 호출 song 하나. 앞 열이 값 이름이다)
```

**⑤ 같은 파일 `:47` — 「item 의 뜻」 표에 다섯 값(`ranking-scope` 줄 앞)**

old:
```sql
--     ranking-scope               = 숫자가 아니라 **깃발**이다 — 1=우리 교구 · 0=전체
```
new:
```sql
--     board                       = 0 고정 — 💬 게시판 화면을 연 것(app.js 의 renderBoard 첫 줄 · 2026-11-06).
--                                    글쓰기 · 공감 · 가리기 뒤에 다시 부르는 loadBoard · 서버 boardList 에는 안 넣는다(교회 어드민도 부른다).
--     share-open                  = 종류 코드 1·2·3 — 📤 보내기 판(js/pray-share.js 의 pshOpen)을 **새로** 연 것(2026-11-06).
--                                    다시 쓰는 판(pshReuse) · 관리자 묵상 미리보기에서 연 판은 안 남는다.
--     share-kakao                 = 3 — 카카오톡을 연 것(pshKakaoGo 에서 Kakao.Share.sendDefault 가 예외 없이 끝난 다음 줄).
--     share-sheet                 = 종류 코드 — 공유 창으로 넘긴 것(navigator.share 가 resolve · 닫음(AbortError)은 안 센다).
--     share-save                  = 종류 코드 — 그림 내려받기를 시작했거나 글 · 주소 복사가 끝난 것.
--                                    종류 코드: 1 가정 축복 기도문(그림) · 2 오늘의 묵상(그림) · 3 이번 주 말씀(그림 · 카카오 카드) ·
--                                    4 가을 말씀암송 동행 안내(글) · 5 앱 소개(글) · 6 외운 말씀(글) · 7 교육 수료증(그림) ·
--                                    8 앱 설치 주소(글) · 9 이번 주 말씀 주소(글 · 지금 숨김). 이름은 index.ts 의 SHARE_KINDS 한 곳.
--                                    ⚠️ 다섯 값 모두 「보냈다」가 아니다 — 받는 분 · 고른 앱 · 실제로 보냈는지는 앱이 알 수 없다.
--                                    ⚠️ 만 14세 미만 어린 부서(needsGuardian)는 앱 · 서버(featureLog) 둘 다 남기지 않는다.
--                                    「누가」는 교회 어드민 📊 성경암송 통계 「📤 보내기 · 💬 게시판」 탭(api featureUsage) · 아래 ⑨.
--                                    설계 docs/superpowers/specs/2026-11-06-share-board-usage-log-design.md
--     ranking-scope               = 숫자가 아니라 **깃발**이다 — 1=우리 교구 · 0=전체
```

**⑥ 같은 파일 `:51` — 낡은 줄 번호(줄 끝의 이 글자만 바꾼다)**

old:
```sql
허용 목록 밖이다. index.ts 861행 근처)
```
new:
```sql
허용 목록 밖이다. index.ts 의 async function logSongClick — 줄 번호는 낡으니 이름으로 찾는다)
```

**⑦ 같은 파일 끝 `:216~217` — 보는 법 ⑨(⑥ 꼴 · 다섯 값만 · 관리자만)**

old:
```sql
group by d.day, w.no, w.ref_full, w.ref
order by d.day desc;
```
new:
```sql
group by d.day, w.no, w.ref_full, w.ref
order by d.day desc;

-- ⑨ 보내기 · 게시판 — 누가 얼마나 (2026-11-06 · ⚠️ 관리자만 · 이름이 나오므로 밖으로 내보내지 말 것)
--    ⑥ 과 같은 꼴을 다섯 값만으로 — 교회 어드민 📊 성경암송 통계 「📤 보내기 · 💬 게시판」 탭(api featureUsage)이 같은 줄을 읽는다.
--    item 은 종류 코드(위 머리 표 · board 는 0). ⚠️ 「보냈다」가 아니다 — share-kakao 는 카카오톡을 연 것 · share-sheet 는
--    공유 창으로 넘긴 것 · share-save 는 내려받기 · 복사다. ⚠️ 만 14세 미만 어린 부서는 앱 · 서버가 남기지 않는다 —
--    여기 그런 줄이 보이면 거르기가 샌 것이다(featureUsage 는 읽을 때 한 번 더 뺀다 · 이 질의는 빼지 않고 그대로 보인다).
--    ⚠️ 이 파일을 통째로 돌리면 마지막 결과인 이 표(이름)가 화면에 남는다 — 표를 다시 만들 때는 위 만들기 부분만 돌린다.
select u.type as 구분,
       coalesce(nullif(u.gu, ''), u.bu)     as 소속,
       coalesce(nullif(u.mok, ''), u.grade) as 세부,
       u.name, f.feature, f.item,
       count(distinct f.day) as 날수, sum(f.cnt) as 횟수, max(f.day) as 마지막
from public.feature_log f join public.users u on u.id = f.user_id
where f.feature in ('board', 'share-open', 'share-kakao', 'share-sheet', 'share-save')
group by u.type, coalesce(nullif(u.gu, ''), u.bu), coalesce(nullif(u.mok, ''), u.grade), u.name, f.feature, f.item
order by 횟수 desc limit 100;
```

**⑧ `tests/feature-log-smoke.sh:29` — 건너뜀 셈**

old:
```bash
pass=0; fail=0
chk() { # 이름, 실제, 기대
```
new:
```bash
pass=0; fail=0; skip=0
sk() { echo "  - $1 ... 건너뜀 ($2)"; skip=$((skip+1)); }
chk() { # 이름, 실제, 기대
```

**⑨ 같은 파일 `:53~56` — 값 목록(FEATURES 와 같게)과 「어른은 걸리지 않음」**

navi ⑤ 는 첫 `for F in … ; do` 줄만 읽으므로 그 줄에 더한다.

old:
```bash
for F in psalm meditation meditation-widget meditation-auto album album-play guide push ranking-scope event edu duty navi; do
  R=$(call "{\"action\":\"featureLog\",\"user_id\":\"$TEST_UID\",\"feature\":\"$F\",\"item\":0}")
  chk "$F" "$(echo "$R" | grep -o '"ok":true')" '"ok":true'
done
```
new:
```bash
#    2026-11-06 — 보내기 · 게시판 다섯 값(board · share-*)을 더했다. 보내기 값의 item 은 종류 코드(1~9)라 3(이번 주 말씀)으로 보낸다 —
#    0 으로 보내면 교회 어드민 탭에 「종류 0」으로 뜬다. 다섯 값은 어른 계정이면 어린 부서 거르기(skipped guardian…)에 안 걸려야 한다.
for F in psalm meditation meditation-widget meditation-auto album album-play guide push ranking-scope event edu duty navi board share-open share-kakao share-sheet share-save; do
  I=0; case "$F" in share-*) I=3 ;; esac
  U="$TEST_UID"
  #    운영에서는 다섯 값을 시험 계정 이름으로 남기지 않는다(교회 어드민 「📤 보내기 · 💬 게시판」 탭에 「계측시험」이 뜨지 않게 · 2026-11-06) —
  #    없는 계정(0 uuid)으로 보내 새 관문이 받는지만 본다: 다섯 값이 FEATURES 에 있으면 users 를 못 찾아 skipped "guardian-check" · 옛 판이면 skipped true.
  if [ "${FL_ENV:-dev}" = "prod" ]; then case "$F" in board|share-*) U="00000000-0000-0000-0000-000000000000" ;; esac; fi
  R=$(call "{\"action\":\"featureLog\",\"user_id\":\"$U\",\"feature\":\"$F\",\"item\":$I}")
  chk "$F" "$(echo "$R" | grep -o '"ok":true')" '"ok":true'
  case "$F" in board|share-*)
    if [ "$U" = "$TEST_UID" ]; then chk "$F 어른은 거르지 않음" "$(echo "$R" | grep -c '"skipped":"guardian')" "0"
    else chk "$F 새 관문(운영 · 쓰지 않음)" "$(echo "$R" | grep -o '"skipped":"guardian-check"')" '"skipped":"guardian-check"'; fi ;;
  esac
done
```

**⑩ 같은 파일 끝 `:75~77` — 어린 부서 계정(개발만)과 끝 셈**

old:
```bash
echo ""
echo "통과 $pass · 실패 $fail"
[ "$fail" -eq 0 ]
```
new:
```bash
echo "■ 다섯 값 — 만 14세 미만 어린 부서 계정은 남기지 않는다(앱도 안 보내지만 서버가 한 번 더 막는다)"
if [ "${FL_ENV:-dev}" = "prod" ]; then
  sk "어린 부서 거르기" "운영에는 어린이 시험 계정을 만들지 않는다 — 개발에서 본다"
else
  KID_JSON=$(call '{"action":"login","type":"교회학교","bu":"초등부","grade":"3학년","name":"계측어린이"}')
  KID_UID=$(echo "$KID_JSON" | grep -o '"user_id":"[^"]*"' | head -1 | cut -d'"' -f4)
  [ -z "$KID_UID" ] && KID_UID=$(echo "$KID_JSON" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  if [ -z "$KID_UID" ]; then
    echo "  ✗ 어린이 시험 계정을 못 만들었다: $KID_JSON"; fail=$((fail+1))
  else
    for G in board share-open share-kakao share-sheet share-save; do
      R=$(call "{\"action\":\"featureLog\",\"user_id\":\"$KID_UID\",\"feature\":\"$G\",\"item\":1}")
      chk "어린이 $G" "$(echo "$R" | grep -o '"skipped":"guardian"')" '"skipped":"guardian"'
    done
    R=$(call "{\"action\":\"featureLog\",\"user_id\":\"$KID_UID\",\"feature\":\"psalm\",\"item\":1001}")
    chk "어린이 psalm 은 지금 그대로(다섯 값만 거른다)" "$(echo "$R" | grep -c '"skipped":"guardian')" "0"
  fi
fi

echo ""
echo "통과 $pass · 실패 $fail · 건너뜀 $skip"
[ "$fail" -eq 0 ]
```
(운영 스모크는 다섯 값을 아무 계정으로도 쓰지 않는다 — 0 uuid 로 새 관문만 본다(오케스트레이터 2026-11-06).)
(어린 부서 계정은 `login` 이 그대로 만들어 준다. 보호자 확인(`guardian_ok`)은 적어 두기만 하고 로그인을 막지 않는다 — `index.ts:2839`.)

**⑪ `tools/preflight.py:167` — 새 시험 걸기**

`PURE_TESTS` 는 98~167줄이고, 끝에 한 줄씩 `+=` 로 더해 가는 꼴이다. 다른 세션과 부딪히지 않도록 위 줄들은 그대로 두고 따로 더한다.

old:
```python
PURE_TESTS += ["tests/pray-share.test.cjs"]
```
new:
```python
PURE_TESTS += ["tests/pray-share.test.cjs"]
# 📤💬 보내기 · 게시판 이용 기록(누가 · 2026-11-06) — api featureLog 어린 부서 거르기(rpc 앞 · 모르면 안 남김) · featureUsage(관리자 문 · 다섯 값만 · user_id 없음 · 어린 부서 뺌 · 차례 · 빈 결과)
PURE_TESTS += ["tests/feature-usage.test.cjs"]
```

- [ ] **Step 4: 돌려서 통과 확인**

```bash
node --test tests/feature-usage.test.cjs tests/navi.test.cjs 2>&1 | grep -E "^# (pass|fail)"
node --test tests/api-split.test.cjs tests/store-review.test.cjs tests/push-report-cron.test.cjs 2>&1 | grep -E "^# (pass|fail)"
bash -n tests/feature-log-smoke.sh && echo "스모크 문법 통과"
python tools/preflight.py 2>&1 | grep -E "feature-usage|navi\.test|실패|배포"
```
기대:
- 첫 명령: `# pass 19` · `# fail 0`(feature-usage 5 + navi 14)
- 둘째 명령: `# pass 55` · `# fail 0`(회귀 없음. store-review 는 `자료/store/listing-ko.txt` 도 읽는다 — worktree 에는 추적 파일이라 있다)
- 셋째 명령: `스모크 문법 통과`
- preflight: 「tests/navi.test.cjs — 14가지 통과」 · 「tests/feature-usage.test.cjs — 5가지 통과」 · 「모두 통과 — 배포해도 된다.」(「실패」 줄 없음)

- [ ] **Step 5: 커밋**

```bash
git add -- supabase/functions/api/index.ts supabase/feature_log.sql tests/feature-log-smoke.sh tests/navi.test.cjs tests/feature-usage.test.cjs tools/preflight.py
git diff --cached --stat
git commit -m "feat(api · 열람 기록): 보내기 · 게시판 다섯 값(board · share-*) · 만 14세 미만은 featureLog 가 rpc 앞에서 거른다 · feature_log.sql 머리 표 · ⑨" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git show --stat HEAD | tail -8
```
`git diff --cached --stat` 와 `git show --stat` 에는 위 여섯 파일만 보여야 한다.

- [ ] **Step 6: SQL 지문 확인(읽기만 · DB 에 쓰지 않는다)**

```bash
python tools/sql-applied.py status --dev --all  2>&1 | grep -E "feature_log\.sql"
python tools/sql-applied.py status --prod --all 2>&1 | grep -E "feature_log\.sql"
```
- `--all` 을 붙여야 「기록 없음」 줄도 찍힌다(`tools/sql-applied.py:205` · `:221`). 「기록 없음」이면 할 일이 없다. 이 파일은 2026-09-23 에 넣었고 기록 도구는 2026-10-12 에 생겨서, 기록이 없을 공산이 크다.
- 「바뀜」이면, 바뀐 것은 머리 주석과 맨 끝의 읽기 select(⑨)뿐이다. 운영에 다시 넣지 말고 친구에게 그대로 알린다. `sql-applied.py record` 는 운영 표 `schema_applied` 에 쓰는 일이라 친구 허락 없이는 하지 않는다.

---

### Task 2: featureUsage(관리자 읽기) · INTERNAL_ADMIN_OK · switch · 스모크 · 배포

**Files:**
- Modify: `supabase/functions/api/index.ts`
  - `:173` — `const INTERNAL_ADMIN_OK` 첫 줄
  - `:602` — `case "featureLog":`(Task 1 뒤에도 그대로 602 근처)
  - Task 1 에서 만든 구간 머리 주석과 구간 끝(featureLog 아래)
- Modify: `tests/feature-usage.test.cjs`(머리 주석 · `const S =` 줄 · 끝에 ②③)
- Modify: `tests/feature-log-smoke.sh`(머리 주석 · `call()` 아래 · 끝 셈 앞)
- Test: `tests/feature-usage.test.cjs`

**Interfaces:**
- Consumes:
  - Task 1 의 `USAGE_FEATURES` · 구간 표식 · `featureLog`
  - Task 1 시험 파일의 `read` · `J` · `cut` · `INDEX` · `FIVE` · `SEC` · `CTX` · `S`
  - 스모크의 `sk` · `skip`
  - `adminError(b)` · `fetchAllRows(build)` · `WIDGET_YMD_RE` — `_shared.ts` 에 있고 `index.ts:8` 이 이미 들여온다
  - `needsGuardian`
- Produces:
  - 액션 `featureUsage` — 받는 것 `{ from?, to? }`(한국 날짜 `YYYY-MM-DD` · 비면 기간 제한 없음)
  - 응답: `{ ok: true, summary: { board: { people, count }, share: { people, count } }, byKind: [{ item, label, open, kakao, sheet, save, people }], byUser: [{ gubun, sosok, sebu, name, boardDays, boardCount, open, kakao, sheet, save, last }] }`
  - 실패: `{ ok: false, error: "unauthorized" | "no-password-set" | "bad-args" }`
  - `const SHARE_KINDS`(1~9 이름)
  - `INTERNAL_ADMIN_OK` 의 `"featureUsage"` — 교회 어드민 구역이 `call("featureUsage", { from, to })` 로 부른다

- [ ] **Step 1: 실패하는 시험 쓰기**

`tests/feature-usage.test.cjs` 머리 주석에 ②③ 를 더한다.

old:
```js
//      행 없음 · 읽기 오류 · 예외면 skipped "guardian-check"(모르면 안 남긴다) · 늘 ok:true · 다른 값은 users 를 안 읽고 그대로.
```
new:
```js
//      행 없음 · 읽기 오류 · 예외면 skipped "guardian-check"(모르면 안 남긴다) · 늘 ok:true · 다른 값은 users 를 안 읽고 그대로.
//   ② featureUsage 문 — 교회 어드민 내부 키 묶음(INTERNAL_ADMIN_OK)에 있고 암호 길(ADMIN_PW_ONLY)에는 없다 · switch 한 줄.
//   ③ featureUsage — 관리자 문이 먼저 · 다섯 값만 · 기간 · 기본 키 차례 · 틀린 날짜는 bad-args · 표가 없으면 빈 결과 ·
//      합계 · 종류별 · 사람별 차례 · 어린 부서 · 사람 모름 줄은 뺀다 · 응답에 user_id 가 없다 · 종류 이름(SHARE_KINDS).
```

같은 파일 — 구간에서 꺼내는 이름을 늘린다. 아직 없는 이름은 `undefined` 로 둔다. 그래야 떨어질 때 시험마다 따로 떨어진다.

old:
```js
const S = vm.runInContext(SEC + '\n;({ FEATURES, USAGE_FEATURES, featureLog })', CTX);
```
new:
```js
const S = vm.runInContext(SEC + '\n;({ FEATURES, USAGE_FEATURES, featureLog,' +
  ' SHARE_KINDS: typeof SHARE_KINDS === "undefined" ? undefined : SHARE_KINDS,' +
  ' featureUsage: typeof featureUsage === "function" ? featureUsage : undefined })', CTX);
```

같은 파일 **끝에 더한다**(전부).

```js

// ── ② · ③ featureUsage(2026-11-06 · 설계 2-5) ──
const SHARED = read('supabase', 'functions', 'api', '_shared.ts');
CTX.WIDGET_YMD_RE = vm.runInContext(/^export const WIDGET_YMD_RE = (.+);$/m.exec(SHARED)[1], vm.createContext({}));   // 진짜 날짜 꼴
const code = (t) => t.split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '')).join('\n');   // 줄 주석을 걷는다

test('② featureUsage 문 — 교회 어드민 내부 키 묶음에 있고 · 암호 길에는 없다 · switch 한 줄 · featureLog 아래', () => {
  const adm = code(cut(INDEX, 'const INTERNAL_ADMIN_OK = new Set([', ']);', 'index.ts INTERNAL_ADMIN_OK'));
  assert.ok(/"featureUsage"/.test(adm), 'INTERNAL_ADMIN_OK 에 featureUsage 가 없다 — 교회 어드민 탭이 unauthorized 를 받는다');
  const pw = code(cut(SHARED, 'export const ADMIN_PW_ONLY = new Set([', ']);', '_shared.ts ADMIN_PW_ONLY'));
  assert.ok(!/"featureUsage"/.test(pw), 'featureUsage 가 암호 길(ADMIN_PW_ONLY)에 들었다 — 암호 하나로 이름 목록이 열린다');
  assert.equal((INDEX.match(/^\s*case "featureUsage":\s*return json\(await featureUsage\(body\)\);/gm) || []).length, 1, 'switch 에 case "featureUsage" 한 줄');
  const L = SEC.indexOf('async function featureLog(b) {'), U = SEC.indexOf('async function featureUsage(b) {');
  assert.ok(L >= 0 && U > L, 'featureUsage 는 열람 기록 구간 안 featureLog 아래에');
});

// 가짜 질의 — fetchAllRows 가 build() 로 만든 것을 적어 둔다
function usageDb() {
  const q = { table: null, ops: [] };
  const b = {
    select(c) { q.ops.push(['select', c]); return b; },
    in(k, v) { q.ops.push(['in', k, Array.from(v)]); return b; },
    gte(k, v) { q.ops.push(['gte', k, v]); return b; },
    lte(k, v) { q.ops.push(['lte', k, v]); return b; },
    order(k) { q.ops.push(['order', k]); return b; },
  };
  return { q, db: { from(t) { q.table = t; return b; } } };
}
async function runUsage(body, { rows = [], fail = null, admin = null } = {}) {
  const { q, db } = usageDb();
  let built = 0;
  CTX.db = db;
  CTX.adminError = () => admin;
  CTX.fetchAllRows = async (build) => { built++; build(); if (fail) throw fail; return rows; };
  const r = J(await S.featureUsage(body));
  return { r, q: J(q), built };
}

const ID = { a: '11111111-1111-4111-8111-111111111111', b: '22222222-2222-4222-8222-222222222222', c: '33333333-3333-4333-8333-333333333333',
  d: '44444444-4444-4444-8444-444444444444', e: '55555555-5555-4555-8555-555555555555', f: '66666666-6666-4666-8666-666666666666' };
const PEOPLE = {
  a: { type: '교구', gu: '1교구', mok: '3목장', bu: null, grade: null, name: '가나다' },
  b: { type: '교회학교', gu: null, mok: null, bu: '고등부', grade: '2학년', name: '라마바' },
  c: { type: '교회학교', gu: null, mok: null, bu: '초등부', grade: '5학년', name: '어린이' },   // 만 14세 미만 — 빠져야 한다
  d: { type: '교회학교', gu: null, mok: null, bu: '중등부', grade: '교사', name: '선생님' },   // 중등부 선생님 — 어른
  e: { type: '교구', gu: '2교구', mok: '1목장', bu: null, grade: null, name: '사아자' },
  f: null,                                                                                   // 사람을 알 수 없는 줄 — 빠져야 한다
};
const row = (k, day, feature, item, cnt) => ({ user_id: ID[k], day, feature, item, cnt, users: PEOPLE[k] });
const ROWS = [
  row('a', '2026-11-01', 'board', 0, 3),
  row('a', '2026-11-02', 'board', 0, 1),
  row('a', '2026-11-02', 'share-open', 1, 2),
  row('a', '2026-11-02', 'share-sheet', 1, 1),
  row('a', '2026-11-03', 'share-kakao', 3, 1),
  row('a', '2026-11-09', 'psalm', 1042, 5),       // 다섯 값이 아니다 — 질의가 걸러도 한 번 더 버린다(마지막 날에도 안 든다)
  row('b', '2026-11-04', 'share-open', 2, 1),
  row('b', '2026-11-04', 'share-save', 2, 1),
  row('b', '2026-11-05', 'share-sheet', 6, 2),
  row('c', '2026-11-05', 'board', 0, 9),
  row('c', '2026-11-05', 'share-kakao', 3, 4),
  row('e', '2026-11-01', 'board', 0, 1),          // d 와 합이 같다 — 마지막 날이 늦은 d 가 앞
  row('d', '2026-11-06', 'board', 0, 1),
  row('f', '2026-11-06', 'board', 0, 7),
];
const EMPTY = { ok: true, summary: { board: { people: 0, count: 0 }, share: { people: 0, count: 0 } }, byKind: [], byUser: [] };

test('③ featureUsage — 관리자 문이 먼저(닫히면 아무것도 안 읽는다)', async () => {
  assert.equal(typeof S.featureUsage, 'function', 'featureUsage 가 없다');
  for (const e of ['unauthorized', 'no-password-set']) {
    const { r, q, built } = await runUsage({}, { admin: e, rows: ROWS });
    assert.deepEqual(r, { ok: false, error: e });
    assert.equal(built, 0, '문이 닫혔는데 표를 읽었다');
    assert.equal(q.table, null);
  }
});

test('③ featureUsage 질의 — 다섯 값만 · 기간은 한국 날짜 day · 기본 키 차례 · 기간 없으면 제한 없음 · 틀린 날짜는 bad-args', async () => {
  const { r, q } = await runUsage({ from: '2026-11-01', to: '2026-11-06' }, { rows: [] });
  assert.equal(r.ok, true);
  assert.equal(q.table, 'feature_log');
  const op = (n) => q.ops.filter((o) => o[0] === n);
  const sel = op('select')[0][1].replace(/\s+/g, '');
  assert.ok(sel.includes('users(type,gu,mok,bu,grade,name)'), 'users 잇기 — ' + sel);
  for (const col of ['user_id', 'day', 'feature', 'item', 'cnt']) assert.ok(sel.split(',').includes(col), 'select 에 ' + col);
  assert.deepEqual(op('in').map((o) => [o[1], o[2].slice().sort()]), [['feature', FIVE.slice().sort()]], '다섯 값만 읽는다(다른 열람 기록을 이름째 열지 않는다)');
  assert.deepEqual(op('gte'), [['gte', 'day', '2026-11-01']]);
  assert.deepEqual(op('lte'), [['lte', 'day', '2026-11-06']]);
  assert.deepEqual(op('order').map((o) => o[1]), ['user_id', 'day', 'feature', 'item'], '쪽 넘기기는 기본 키 차례로');
  const all = await runUsage({ from: '', to: '' }, { rows: [] });
  assert.deepEqual(all.q.ops.filter((o) => o[0] === 'gte' || o[0] === 'lte'), [], '기간이 비면 제한 없음(blessingUsage 와 같다)');
  for (const body of [{ from: '2026/11/01' }, { to: '2026-11-06 or 1=1' }, { from: 20261101 }]) {
    const bad = await runUsage(body, { rows: ROWS });
    assert.deepEqual(bad.r, { ok: false, error: 'bad-args' }, JSON.stringify(body));
    assert.equal(bad.built, 0, JSON.stringify(body) + ' — 틀린 날짜를 DB 에 보냈다');
  }
});

test('③ featureUsage — 기록이 없거나 표가 없는 DB 는 빈 결과 · 다른 오류는 그대로 던진다 · 어린 부서 · 사람 모름 줄뿐이면 빈 결과', async () => {
  assert.deepEqual((await runUsage({}, { rows: [] })).r, EMPTY, '기록 없음');
  for (const fail of [new Error('relation "public.feature_log" does not exist'),
    { message: "Could not find the table 'public.feature_log' in the schema cache", code: 'PGRST205' }]) {
    assert.deepEqual((await runUsage({}, { fail })).r, EMPTY, fail.message);
  }
  await assert.rejects(runUsage({}, { fail: new Error('canceling statement due to statement timeout') }), /statement timeout/);
  assert.deepEqual((await runUsage({}, { rows: ROWS.filter((x) => x.user_id === ID.c || x.user_id === ID.f) })).r, EMPTY, '어린 부서 · 사람 모름뿐');
});

test('③ featureUsage 집계 — 합계 · 종류별(item 차례) · 사람별(합 큰 순 · 같으면 마지막 날 늦은 순) · 어린 부서 · 다섯 값 밖 · 사람 모름은 뺀다', async () => {
  const { r } = await runUsage({ from: '2026-11-01', to: '2026-11-30' }, { rows: ROWS });
  assert.equal(r.ok, true);
  assert.deepEqual(r.summary, { board: { people: 3, count: 6 }, share: { people: 2, count: 5 } },
    '게시판 = a·d·e(어린이 c · 모름 f 빠짐) · 보내기 = 카톡·공유 창·저장만(판 열기는 안 셈)');
  assert.deepEqual(r.byKind, [
    { item: 1, label: '가정 축복 기도문', open: 2, kakao: 0, sheet: 1, save: 0, people: 1 },
    { item: 2, label: '오늘의 묵상', open: 1, kakao: 0, sheet: 0, save: 1, people: 1 },
    { item: 3, label: '이번 주 말씀', open: 0, kakao: 1, sheet: 0, save: 0, people: 1 },
    { item: 6, label: '외운 말씀', open: 0, kakao: 0, sheet: 2, save: 0, people: 1 },
  ]);
  assert.deepEqual(r.byUser, [
    { gubun: '교구', sosok: '1교구', sebu: '3목장', name: '가나다', boardDays: 2, boardCount: 4, open: 2, kakao: 1, sheet: 1, save: 0, last: '2026-11-03' },
    { gubun: '교회학교', sosok: '고등부', sebu: '2학년', name: '라마바', boardDays: 0, boardCount: 0, open: 1, kakao: 0, sheet: 2, save: 1, last: '2026-11-05' },
    { gubun: '교회학교', sosok: '중등부', sebu: '교사', name: '선생님', boardDays: 1, boardCount: 1, open: 0, kakao: 0, sheet: 0, save: 0, last: '2026-11-06' },
    { gubun: '교구', sosok: '2교구', sebu: '1목장', name: '사아자', boardDays: 1, boardCount: 1, open: 0, kakao: 0, sheet: 0, save: 0, last: '2026-11-01' },
  ]);
});

test('③ featureUsage — 응답에 user_id 가 없다(JWT 없음) · 어린 부서 이름 · 부서가 없다 · 칸은 정해진 것만', async () => {
  const { r } = await runUsage({}, { rows: ROWS });
  const s = JSON.stringify(r);
  assert.ok(!/user_?id/i.test(s), '응답에 user_id 칸');
  for (const id of Object.values(ID)) assert.ok(!s.includes(id), '응답에 계정 번호 ' + id.slice(0, 8));
  assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(s), '응답에 uuid 꼴 글자');
  assert.ok(!s.includes('어린이') && !s.includes('초등부'), '어린 부서 줄이 응답에 남았다');
  assert.deepEqual(Object.keys(r).sort(), ['byKind', 'byUser', 'ok', 'summary']);
  for (const k of r.byKind) assert.deepEqual(Object.keys(k).sort(), ['item', 'kakao', 'label', 'open', 'people', 'save', 'sheet']);
  for (const u of r.byUser) assert.deepEqual(Object.keys(u).sort(),
    ['boardCount', 'boardDays', 'gubun', 'kakao', 'last', 'name', 'open', 'save', 'sebu', 'sheet', 'sosok']);
});

test('③ SHARE_KINDS — 종류 코드 1~9 이름(설계 2-2 · 이름은 서버 한 곳) · 모르는 코드는 「종류 N」으로 드러난다', async () => {
  assert.deepEqual(J(S.SHARE_KINDS), { 1: '가정 축복 기도문', 2: '오늘의 묵상', 3: '이번 주 말씀', 4: '가을 말씀암송 동행 안내',
    5: '앱 소개', 6: '외운 말씀', 7: '교육 수료증', 8: '앱 설치 주소', 9: '이번 주 말씀 주소' });
  const { r } = await runUsage({}, { rows: [row('a', '2026-11-02', 'share-sheet', 12, 1)] });
  assert.deepEqual(r.byKind.map((k) => [k.item, k.label]), [[12, '종류 12']]);
});
```

- [ ] **Step 2: 돌려서 실패 확인**

```bash
node --test tests/feature-usage.test.cjs 2>&1 | grep -E "^# (pass|fail)|^not ok|^  error:"
```
기대: `# pass 5` · `# fail 7`.
- ① 다섯(1~5)은 통과한다.
- 6 ② 는 `'INTERNAL_ADMIN_OK 에 featureUsage 가 없다 — 교회 어드민 탭이 unauthorized 를 받는다'` 로 떨어진다.
- ③ 여섯도 모두 떨어진다.
  - 7 「관리자 문」은 「featureUsage 가 없다」.
  - 가운데 넷(8 질의 · 9 빈 결과 · 10 집계 · 11 user_id 없음)은 `'S.featureUsage is not a function'`.
  - 12 SHARE_KINDS 는 `J(undefined)` 의 SyntaxError, 곧 `'"undefined" is not valid JSON'`.

- [ ] **Step 3: 구현**

**① `supabase/functions/api/index.ts:173` — 교회 어드민 내부 키 묶음**

old:
```ts
  "stats", "participants", "verses", "blessingUsage", "ranking",
```
new:
```ts
  "stats", "participants", "verses", "blessingUsage", "ranking",
  "featureUsage",   // 📤 보내기 · 💬 게시판 이용(누가 · 2026-11-06) — 읽기만 · 교회 어드민 📊 성경암송 통계 다섯째 탭(역할 memorizeadmin)
```

**② 같은 파일 `:602` — switch**

old:
```ts
      case "featureLog":          return json(await featureLog(body));
```
new:
```ts
      case "featureLog":          return json(await featureLog(body));
      case "featureUsage":        return json(await featureUsage(body));   // 관리자 — 보내기 · 게시판 이용(누가 · 2026-11-06 · 교회 어드민 📊 통계 탭)
```

**③ 같은 파일 — 구간 머리 주석(밖에서 쓰는 이름이 늘었다)**

old:
```ts
//   구간 밖에서 가져다 쓰는 이름: db · needsGuardian(스토어 심사 순수 구간) — 시험이 같은 이름으로 넣어 준다.
```
new:
```ts
//   구간 밖에서 가져다 쓰는 이름: db · needsGuardian(스토어 심사 순수 구간) · adminError · fetchAllRows · WIDGET_YMD_RE(_shared.ts) — 시험이 같은 이름으로 넣어 준다.
```

**④ 같은 파일 — featureLog 바로 아래(구간 끝 표식 앞)에 SHARE_KINDS · featureUsage**

vm 구간이므로 타입 표기는 쓰지 않는다. `catch` 안에서도 `(e as any)` 대신 `(e && e.message)` 로 쓴다.

old:
```ts
  return { ok: true };
}
// ── 열람 기록 — vm 시험 구간 (여기까지) ──
```
new:
```ts
  return { ok: true };
}

// 보내기 종류 코드(item) → 이름(2026-11-06 · 설계 2-2). ⚠️ 이름은 이 한 곳 — 교회 어드민 화면은 응답의 label 을 그대로 쓴다.
//   코드를 보내는 곳: js/pray-share.js pshKind()(1·2·3) · pshSendLink · pshCopyLink(8) · app.js shareLink 셋째 인자(4·5·6·9) · js/edu.js(7).
const SHARE_KINDS = { 1: "가정 축복 기도문", 2: "오늘의 묵상", 3: "이번 주 말씀", 4: "가을 말씀암송 동행 안내", 5: "앱 소개", 6: "외운 말씀", 7: "교육 수료증", 8: "앱 설치 주소", 9: "이번 주 말씀 주소" };

// ---------- featureUsage: 보내기 · 게시판 이용(누가) — 관리자 전용(2026-11-06) ----------
//   교회 어드민 📊 성경암송 통계 「📤 보내기 · 💬 게시판」 탭이 내부 키로 부른다(INTERNAL_ADMIN_OK · 역할 memorizeadmin).
//   본보기 blessingUsage(blessing.ts) — adminError 먼저 · fetchAllRows(1,000줄 쪽 넘기기) · users 잇기 · 기간 from/to(한국 날짜 · day) ·
//   표가 없는 DB 에서도 빈 결과(관리자가 「기록 없음」으로 보게 — 오류로 보지 않게).
//   ⚠️ 읽는 값은 USAGE_FEATURES 다섯뿐 — 시편 · 묵상 같은 다른 열람 기록을 이름째 열지 않는다.
//   ⚠️ 응답에 user_id 를 싣지 않는다(JWT 없음 — 남의 user_id 하나면 그 사람 행세가 된다) · 사람은 안에서만 user_id 로 묶는다.
//   ⚠️ 만 14세 미만(needsGuardian) 줄과 사람을 알 수 없는 줄(users 가 비어 옴)은 뺀다 — 앱 · featureLog 에 이어 세 겹째.
//   ⚠️ 쪽 넘기기는 기본 키 차례로 — 차례 없이 range 로 나눠 받으면 쪽 사이에서 줄이 빠지거나 겹칠 수 있다.
//   ⚠️ 「보냈다」가 아니다 — kakao = 카카오톡을 열었다 · sheet = 공유 창으로 넘겼다 · save = 내려받았다/복사했다.
async function featureUsage(b) {
  const err = adminError(b); if (err) return { ok: false, error: err };
  const ymdOk = (v) => !v || WIDGET_YMD_RE.test(String(v));
  if (!ymdOk(b.from) || !ymdOk(b.to)) return { ok: false, error: "bad-args" };
  const EMPTY = { ok: true, summary: { board: { people: 0, count: 0 }, share: { people: 0, count: 0 } }, byKind: [], byUser: [] };
  let rows;
  try {
    rows = await fetchAllRows(() => {
      let q = db.from("feature_log")
        .select("user_id, day, feature, item, cnt, users(type,gu,mok,bu,grade,name)")
        .in("feature", [...USAGE_FEATURES]);
      if (b.from) q = q.gte("day", String(b.from));
      if (b.to)   q = q.lte("day", String(b.to));
      return q.order("user_id").order("day").order("feature").order("item");
    });
  } catch (e) {
    if (/does not exist|schema cache/i.test(String((e && e.message) || ""))) return EMPTY;
    throw e;
  }

  const boardPeople = new Set(), sharePeople = new Set();
  let boardCount = 0, shareCount = 0;
  const kinds = new Map(), people = new Map();
  for (const row of rows) {
    const f = String(row.feature || ""), u = row.users;
    if (!USAGE_FEATURES.has(f) || !u || needsGuardian(u)) continue;
    const id = row.user_id, day = String(row.day || ""), n = Number(row.item) || 0, c = Number(row.cnt) || 0;
    const pe = people.get(id) || { gubun: u.type || "", sosok: u.gu || u.bu || "", sebu: u.mok || u.grade || "", name: u.name || "",
      days: new Set(), boardCount: 0, open: 0, kakao: 0, sheet: 0, save: 0, last: day };
    if (day > pe.last) pe.last = day;
    if (f === "board") {
      boardPeople.add(id); boardCount += c; pe.days.add(day); pe.boardCount += c;
    } else {
      const ke = kinds.get(n) || { item: n, label: SHARE_KINDS[n] || ("종류 " + n), open: 0, kakao: 0, sheet: 0, save: 0, people: new Set() };
      if (f === "share-open") { ke.open += c; pe.open += c; }          // 판 열기는 「보내기 쓴 분」에 안 넣는다(열고 안 보낸 분을 가르려고)
      else {
        if (f === "share-kakao") { ke.kakao += c; pe.kakao += c; }
        else if (f === "share-sheet") { ke.sheet += c; pe.sheet += c; }
        else { ke.save += c; pe.save += c; }
        ke.people.add(id); sharePeople.add(id); shareCount += c;
      }
      kinds.set(n, ke);
    }
    people.set(id, pe);
  }

  const byKind = [...kinds.values()].sort((x, y) => x.item - y.item)
    .map((k) => ({ item: k.item, label: k.label, open: k.open, kakao: k.kakao, sheet: k.sheet, save: k.save, people: k.people.size }));
  const sum = (p) => p.boardCount + p.open + p.kakao + p.sheet + p.save;
  const byUser = [...people.values()]
    .sort((x, y) => sum(y) - sum(x) || (x.last < y.last ? 1 : x.last > y.last ? -1 : 0))
    .map((p) => ({ gubun: p.gubun, sosok: p.sosok, sebu: p.sebu, name: p.name, boardDays: p.days.size,
      boardCount: p.boardCount, open: p.open, kakao: p.kakao, sheet: p.sheet, save: p.save, last: p.last }));
  return { ok: true, summary: { board: { people: boardPeople.size, count: boardCount }, share: { people: sharePeople.size, count: shareCount } }, byKind, byUser };
}
// ── 열람 기록 — vm 시험 구간 (여기까지) ──
```

**⑤ `tests/feature-log-smoke.sh:4~5` 머리 — 쓰는 법**

old:
```bash
#   FL_ENV=prod PROD_ANON=... bash tests/feature-log-smoke.sh
#
```
new:
```bash
#   FL_ENV=prod PROD_ANON=... bash tests/feature-log-smoke.sh
#   (공개 키는 js/config.js 의 DEV.ANON · PROD.ANON)
#   보내기 · 게시판 이용 읽기(featureUsage · 2026-11-06): 비번 없이 · 틀린 비번 · (ADMIN_PW 를 주면) 암호만으로는 닫혀 있는지 늘 본다.
#   꼴(칸 · user_id 없음 · 어린이 줄 없음)은 **개발에서만** 교회 어드민과 같은 내부 키 길로 본다 — 키는 SERVICE_KEY,
#   없으면 ~/.church-admin/dev.env 의 DEV_SERVICE_KEY(찍지 않는다 · 빈 기간으로 한 번 불러 맞는 키인지 본다 · 안 맞으면 그 칸만 건너뜀).
#   운영에서는 이름 목록을 받지 않는다(꼴 칸은 늘 건너뜀).
#
```

**⑥ 같은 파일 `:25~26` — 내부 키 부름 · JSON 읽기 도우미(`call()` 바로 아래)**

`icall` 은 `tests/duty-notify.dev.sh:46` 의 것과 같은 꼴이다. `jqn` 은 Git Bash 에서 돌려 봤다(`True` · `['byKind', 'byUser', 'ok', 'summary']` · `\u` 로 적은 「계측시험」 「계측어린이」 「이번 주 말씀」이 맞게 읽힌다).

old:
```bash
    -H "apikey: $KEY" -H "Authorization: Bearer $KEY" --data-binary @"$CALL_TMP"
}
```
new:
```bash
    -H "apikey: $KEY" -H "Authorization: Bearer $KEY" --data-binary @"$CALL_TMP"
}
# 내부 갈래(교회 어드민이 부르는 길) — $1 = x-internal-key 값 · $2 = 본문. 키는 찍지 않는다.
icall() {
  printf '%s' "$2" > "$CALL_TMP"
  curl -s -X POST "$BASE" -H "Content-Type: application/json" -H "x-internal-key: $1" --data-binary @"$CALL_TMP"
}
# 응답 JSON 에 파이썬 식 하나 — 한글은 \u 로 적는다(명령줄 한글은 깨진다)
jqn() {
  PYTHONIOENCODING=utf-8 python -c '
import json, sys
d = json.load(sys.stdin)
print(eval(sys.argv[1]))
' "$1" <<< "$2"
}
```

**⑦ 같은 파일 — featureUsage 두 칸(Task 1 ⑩ 이 만든 끝 셈 바로 앞)**

old:
```bash
echo ""
echo "통과 $pass · 실패 $fail · 건너뜀 $skip"
```
new:
```bash
echo "■ featureUsage(보내기 · 게시판 이용 — 관리자 전용 · 이름이 나온다)는 문이 닫혀 있다"
R=$(call '{"action":"featureUsage"}')
chk "비번 없이 → 닫힘" "$(echo "$R" | grep -c -E '"error":"(unauthorized|no-password-set)"')" "1"
chk "비번 없이 → 명단 없음" "$(echo "$R" | grep -c '"byUser"')" "0"
R=$(call '{"action":"featureUsage","pw":"definitely-wrong"}')
chk "틀린 비번 → 닫힘" "$(echo "$R" | grep -c -E '"error":"(unauthorized|no-password-set)"')" "1"
if [ -n "${ADMIN_PW:-}" ]; then
  # 비번은 파일로 넘겨 명령줄(ps)·화면에 남기지 않는다 · 암호가 맞아도 총괄 본인 확인(staff)이 없으면 닫혀야 한다(_shared.ts adminError)
  #   ⚠️ 암호가 틀려도 같은 답이라, 이 줄이 보는 것은 「featureUsage 가 암호 길(ADMIN_PW_ONLY)에 안 들었다」뿐이다.
  PYTHONIOENCODING=utf-8 python -c 'import json,os;print(json.dumps({"action":"featureUsage","pw":os.environ["ADMIN_PW"]}))' > "$CALL_TMP"
  R=$(curl -s -X POST "$BASE" -H "Content-Type: application/json" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" --data-binary @"$CALL_TMP")
  chk "암호만(총괄 확인 없이) → unauthorized" "$(echo "$R" | grep -o '"error":"unauthorized"')" '"error":"unauthorized"'
else
  sk "암호만으로는 닫힘" "ADMIN_PW 환경변수가 없습니다"
fi

echo "■ (개발 · 내부 키) featureUsage 꼴 — 교회 어드민이 부르는 길 · 응답에 user_id 없음 · 어린이 줄 없음"
if [ "${FL_ENV:-dev}" = "prod" ]; then
  sk "featureUsage 꼴" "운영에서는 이름 목록을 받지 않는다 — 개발에서 본다"
else
  SK="${SERVICE_KEY:-}"
  if [ -z "$SK" ] && [ -f "$HOME/.church-admin/dev.env" ]; then
    SK=$(set -a; . "$HOME/.church-admin/dev.env" >/dev/null 2>&1; printf '%s' "${DEV_SERVICE_KEY:-}")
  fi
  PROBE=0
  [ -n "$SK" ] && PROBE=$(icall "$SK" '{"action":"featureUsage","from":"2000-01-01","to":"2000-01-01"}' | grep -c '"ok":true')
  if [ "$PROBE" != "1" ]; then
    sk "featureUsage 꼴" "맞는 서비스 키가 없다(SERVICE_KEY · ~/.church-admin/dev.env DEV_SERVICE_KEY — 키는 찍지 않는다)"
  else
    R=$(icall "$SK" '{"action":"featureUsage"}')
    chk "ok" "$(jqn 'd.get("ok")' "$R")" "True"
    chk "칸 넷" "$(jqn 'sorted(d.keys())' "$R")" "['byKind', 'byUser', 'ok', 'summary']"
    chk "summary 꼴" "$(jqn 'sorted(d["summary"]) == ["board", "share"] and all(sorted(d["summary"][k]) == ["count", "people"] for k in d["summary"])' "$R")" "True"
    chk "byKind 칸" "$(jqn 'all(sorted(k) == ["item", "kakao", "label", "open", "people", "save", "sheet"] for k in d["byKind"])' "$R")" "True"
    chk "byUser 칸" "$(jqn 'all(sorted(u) == ["boardCount", "boardDays", "gubun", "kakao", "last", "name", "open", "save", "sebu", "sheet", "sosok"] for u in d["byUser"])' "$R")" "True"
    chk "응답에 user_id 없음" "$(echo "$R" | grep -c 'user_id')" "0"
    chk "응답에 uuid 꼴 없음" "$(echo "$R" | grep -c -E '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')" "0"
    chk "계측시험 — 게시판 · 카톡 줄" "$(jqn 'any(u["name"] == "\uacc4\uce21\uc2dc\ud5d8" and u["boardCount"] >= 1 and u["kakao"] >= 1 for u in d["byUser"])' "$R")" "True"
    chk "계측어린이는 없다" "$(jqn 'any(u["name"] == "\uacc4\uce21\uc5b4\ub9b0\uc774" for u in d["byUser"])' "$R")" "False"
    chk "종류 3 이름" "$(jqn '[k["label"] for k in d["byKind"] if k["item"] == 3] == ["\uc774\ubc88 \uc8fc \ub9d0\uc500"]' "$R")" "True"
  fi
fi

echo ""
echo "통과 $pass · 실패 $fail · 건너뜀 $skip"
```

- [ ] **Step 4: 돌려서 통과 확인**

```bash
node --test tests/feature-usage.test.cjs tests/navi.test.cjs 2>&1 | grep -E "^# (pass|fail)"
node --test tests/api-split.test.cjs tests/store-review.test.cjs tests/push-report-cron.test.cjs 2>&1 | grep -E "^# (pass|fail)"
bash -n tests/feature-log-smoke.sh && echo "스모크 문법 통과"
python tools/preflight.py 2>&1 | grep -E "feature-usage|실패|배포"
```
기대:
- 첫 명령: `# pass 26` · `# fail 0`(feature-usage 12 + navi 14)
- 둘째 명령: `# pass 55` · `# fail 0`
- 셋째 명령: `스모크 문법 통과`
- preflight: 「tests/feature-usage.test.cjs — 12가지 통과」 · 「모두 통과 — 배포해도 된다.」(「실패」 줄 없음)

- [ ] **Step 5: 커밋**

```bash
git add -- supabase/functions/api/index.ts tests/feature-usage.test.cjs tests/feature-log-smoke.sh
git diff --cached --stat
git commit -m "feat(api): featureUsage — 보내기 · 게시판 이용(누가) 관리자 읽기 · 교회 어드민 내부 키 묶음 · 다섯 값만 · user_id 없음 · 어린 부서 뺌" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git show --stat HEAD | tail -6
```
`git show --stat` 에는 위 세 파일만 보여야 한다.

- [ ] **Step 6: 개발 배포 · 개발 스모크**

가지가 main 보다 앞서 있으므로 `--allow-ahead` 를 준다. 배포 가드는 커밋 안 된 함수 파일이 있거나 origin/main 보다 뒤처져 있으면 멈춘다. 뒤처져 있으면 `git merge origin/main` 을 한 뒤 Step 4 를 다시 돌린다.

```bash
git fetch origin
python tools/deploy-fn.py api --dev --allow-ahead
ADMIN_PW=$(sed -n 's/^ADMIN_SECRET=//p' C:/Projects/bible-memorize-church-app-v2/.env.dev | tr -d '\r') \
DEV_ANON=sb_publishable_eJKP6u95IU9_DBXTvnvYBA_-yGCf-0Y bash tests/feature-log-smoke.sh 2>&1 | grep -E "✗|건너뜀|통과 "
```
- 비번은 worktree 에 없는 `.env.dev`(키 이름 `ADMIN_SECRET`)를 공용 체크아웃에서 읽는다. 값은 찍지 않는다. `DEV_ANON` 은 `js/config.js:25` 의 공개 키다.
- 기대 끝 줄은 `통과 49 · 실패 0 · 건너뜀 0` 이다. 셈은 이렇다: 값 18 + 어른 거르기 5 + 그 밖 6 + 어린이 6 + 닫힘 3 + 암호만 1 + 꼴 10.
- `~/.church-admin/dev.env` 의 키(`DEV_SERVICE_KEY`)가 api 의 서비스 키와 다르면 `통과 39 · 실패 0 · 건너뜀 1` 이 나온다. 그때는 다른 스모크(`tests/duty-notify.dev.sh:72`)처럼 CLI 에서 키를 받아 다시 돌린다(찍지 않는다).

```bash
SERVICE_KEY=$(supabase projects api-keys --project-ref ktpwthwqzgcqcrmsafdo --reveal -o json 2>/dev/null | PYTHONIOENCODING=utf-8 python -c 'import json,sys; d=json.load(sys.stdin); print(next((k.get("api_key") or "" for k in d if k.get("type")=="secret"), ""))') \
DEV_ANON=sb_publishable_eJKP6u95IU9_DBXTvnvYBA_-yGCf-0Y bash tests/feature-log-smoke.sh 2>&1 | grep -E "✗|건너뜀|통과 "
```
- 「계측시험 — 게시판 · 카톡 줄」과 「종류 3 이름」 **둘만** 떨어지면, 개발 DB 에 `feature_log` 표가 없는 것이다. 이때 featureUsage 는 빈 결과를 내고, featureLog 는 `skipped:"no-table"` 이라도 ok 다. 표 넣기는 이 구역 일이 아니니 친구에게 알린다.

- [ ] **Step 7: main 에 싣고 운영 배포 · 운영 스모크(앱 구역보다 먼저)**

앱이 api 보다 먼저 나가면 새 값이 `skipped:true` 로 버려져, 그 구간 기록이 영영 빈다(설계 3). 그래서 이 구역 커밋만 먼저 싣는다. 공용 체크아웃(`C:\Projects\bible-memorize-church-app-v2`)에서는 merge 하지 않는다. 화면 파일은 바뀌지 않으므로 bump 는 하지 않는다.

```bash
git fetch origin
git log --oneline origin/main..HEAD      # 이 구역 커밋 둘(Task 1 · Task 2)만 — 다른 구역 커밋이 끼어 있으면 멈추고 알린다
python tools/preflight.py 2>&1 | tail -2 # 「모두 통과 — 배포해도 된다.」 — 아니면 멈춘다(푸시 전마다)
git push origin HEAD:main                # pre-push 훅도 preflight 를 돈다 · 거절(main 이 앞섬)이면 git merge origin/main → python tools/preflight.py → 다시
python tools/deploy-fn.py api --prod
ADMIN_PW=$(sed -n 's/^PROD_ADMIN_SECRET=//p' C:/Projects/bible-memorize-church-app-v2/.env | tr -d '\r') \
FL_ENV=prod PROD_ANON=sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl- bash tests/feature-log-smoke.sh 2>&1 | grep -E "✗|건너뜀|통과 "
```
- 기대 끝 줄은 `통과 33 · 실패 0 · 건너뜀 2` 이다. 건너뜀 둘은 어린 부서 계정(운영에는 만들지 않는다)과 꼴 칸(운영에서는 이름 목록을 받지 않는다)이다. ADMIN_PW 없이 돌리면 `통과 32 · 실패 0 · 건너뜀 3` 이 나온다. `PROD_ANON` 은 `js/config.js:20` 의 공개 키다.
- 운영 스모크는 시험 계정 「계측시험」(교구 계측 · 목장 계측)으로 다섯 값을 한 줄씩 남긴다. 그래서 교회 어드민 탭에 「계측 · 계측시험」이 뜨는데, 시험 계정이다.

---

## 구역 2 — 앱 화면 — logFeature 어린 부서 · 게시판 · shareLink 종류 · 묵상 미리보기 · 수료증 (Task 3~5)

| 파일 | 맡은 일 |
|---|---|
| `app.js` | 전역 `USAGE_FEATURES`와, `logFeature` 안에서 어린 부서를 거르는 줄(Task 3) · `renderBoard()` 첫 줄 `logFeature("board", 0)`(Task 3) · `shareLink(text, url, kind)`와 이 함수를 부르는 네 곳 `shareEvent` 4 · `shareApp` 5 · `shareMyVerse` 6 · `shareWeeklyVerse` 9(Task 4) · 묵상 창 `extra.preview` → `openMedShare(m, opts)`(Task 5) |
| `js/edu.js` | 수료증 「저장·공유」. 공유 창이 resolve 하면 `share-sheet` 7, 내려받기로 가면 `share-save` 7을 남긴다. AbortError는 세지 않는다. 부를 때는 typeof로 지킨다(Task 5) |
| `tests/usage-log.test.cjs`(새 파일) | 이 구역 시험 일곱 개(Task 3에서 셋 · Task 4에서 둘 · Task 5에서 둘). vm으로 돌리거나 글자로 확인한다 |
| `tests/pray-share.test.cjs` | 묵상 단추 받이를 글자로 잡는 정규식 두 줄(322 · 388)을 `openMedShare\(m\)` → `openMedShare\(m, opts\)`로 바꾼다(Task 5) |
| `tools/preflight.py` | `PURE_TESTS`에 `tests/usage-log.test.cjs`를 더한다(Task 3) |

> **모든 Task에서 지킬 것**
> - 작업 자리는 성경암송 worktree `C:\Projects\wt-usage`(가지 `usage-log`)의 뿌리다. 아래 명령은 모두 그 뿌리 기준이다(Git Bash).
> - 이 구역에서는 **bump · 푸시 · 배포를 하지 않는다.** 설계서 3에 따르면 api(구역 1)가 먼저 운영에 나가야 하고, 앱은 개인정보 방침 세 자리와 **같은 판**으로 나간다. 앱이 먼저 나가면 새 값이 `skipped`로 버려지거나, 방침보다 기록이 먼저 쌓인다.
> - 작업 트리의 줄 끝은 CRLF다(`core.autocrlf=true`). 시험은 `\r\n`을 `\n`으로 바꿔 읽는다. ⚠️ 스크립트(sed · 파이썬)로 바꿀 때는 old의 줄바꿈을 `\r\n`으로 맞춰야 걸린다. 검증 때 여러 줄 old를 LF로 찾았더니 한 번도 걸리지 않았다.
> - 2026-11-06 main(`0c62e88`)을 `git archive`로 뽑은 사본(CRLF — 작업 트리와 같다)에서 확인한 것:
>   - 아래 old 글자 15곳이 각각 **한 번씩만** 나온다.
>   - 그 사본에 Task 3 → 4 → 5를 차례로 얹어 각 Step 2의 `not ok` 번호와 `# pass`/`# fail` 수, 각 Step 4의 수를 돌려 봤다.
>   - Task 3 · 4 · 5가 끝날 때마다 `python tools/preflight.py`를 돌렸고 모두 「모두 통과」였다.
>   - 기존 시험도 그대로 붙었다: pray-share 34 · lazy-load 11 · edu-front 54 · store-review 32 · navi 13 · duty-flow 36 · home-groups · event-auto · board-report.
>   - 저장소 파일은 건드리지 않았다.
> - 고치는 자리를 글자로 잡고 있는 기존 시험은 `tests/pray-share.test.cjs` 322 · 388(이 구역이 고친다)과 325 · 357 · 366(js/pray-share.js 글자 — 구역 3), `tests/edu-front.test.cjs` 445(`includes` — 고친 뒤에도 그대로 붙는다)뿐이다. tests/ · tools/ · .github/ 를 grep 해서 확인했다.
> - ⚠️ `USAGE_FEATURES`는 app.js의 전역 `const`다. js/*.js에서 같은 이름을 다시 선언하면 안 된다 — 뒤에 실린 파일이 SyntaxError로 통째로 안 실린다.
> - ⚠️ 묵상 단추 받이에서 `openMedShare(…)`를 부르는 줄에 객체 글자(`{ … }`)를 바로 쓰면 안 된다. 그러면 그 줄이 `});`와 줄바꿈으로 끝나는데, `tests/pray-share.test.cjs`가 `cut(mm, 'mShare.addEventListener("click"', '});\n')`로 받이를 거기서 잘라 읽는다. 그 뒤 「옛 pray-share.js」 안내 줄(389)이 잘려 나가 시험이 떨어진다. 그래서 `const opts = …;`를 앞에 두고 `openMedShare(m, opts)`로 부른다.

### Task 3: logFeature 어린 부서 거르기 · 게시판을 연 날 기록(새 시험 파일)
**Files:**
- Create: `tests/usage-log.test.cjs`
- Modify: `app.js:4211~4216 근처`(`featSent` · `logFeature`) · `app.js:4795 근처`(`renderBoard` 첫 줄) · `tools/preflight.py:167 근처`(`PURE_TESTS`)
- Test: `tests/usage-log.test.cjs` 시험 1~3

**Interfaces:**
- Consumes:
  - 기존 `needsGuardian(p)`(app.js:2610 · 보호자 확인 순수 블록)
  - 기존 `loadUser()`(app.js:1982 — 저장된 사용자 `{ name, type, gu, mok, bu, grade, user_id }`)
  - 기존 `api.featureLog(p)`(js/api.js:107)
  - 서버 쪽 이름은 구역 1의 `FEATURES` 다섯 · `USAGE_FEATURES`(index.ts)다. 이 Task의 시험은 서버 쪽을 쓰지 않는다. 서버는 배포 차례(api 먼저)에만 걸린다.
- Produces:
  - app.js 전역 `const USAGE_FEATURES = new Set(["board", "share-open", "share-kakao", "share-sheet", "share-save"])`
  - 다섯 값을 어린 부서면 보내지 않는 `logFeature(feature, item)` — 구역 3 `pshLog`, Task 4 `shareLink`, Task 5 `js/edu.js`가 이 함수를 부른다
  - `renderBoard()` 첫 줄 `logFeature("board", 0)`
  - 시험 파일과 도우미 `test` · `assert` · `vm` · `read` · `APP` · `cut` · `fnAt` · `codeOnly`(Task 4 · 5가 이어 쓴다)

- [ ] **Step 1: 실패하는 시험 쓰기**

(1) 새 파일 `tests/usage-log.test.cjs` — 전부:

```js
// 📤 보내기 · 💬 게시판 이용 기록(2026-11-06) — 앱 화면 쪽(꾸러미 없음 · preflight 가 건다)
//
//   node --test tests/usage-log.test.cjs
//
// 왜: 교회 어드민 「📤 보내기 · 💬 게시판」 탭이 이름 · 소속과 함께 보는 숫자다 — 어린 부서(만 14세 미만)가 섞이거나,
//   닫은 공유 창 · 관리자 미리보기가 「보냈다」로 세지면 숫자가 거짓이 된다. 그 자리를 글자와 vm 으로 지킨다.
//   읽을 것: docs/superpowers/specs/2026-11-06-share-board-usage-log-design.md(2-1 값 · 2-2 종류 코드 · 2-4 어린 부서)
//   보내기 판(js/pray-share.js — 종류 1 · 2 · 3 · 8)은 tests/pray-share.test.cjs 가 본다.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = (...f) => fs.readFileSync(path.join(__dirname, '..', ...f), 'utf8').replace(/\r\n/g, '\n');
const APP = read('app.js');
const cut = (src, a, b) => {
  const i = src.indexOf(a), j = src.indexOf(b, i + a.length);
  assert.ok(i >= 0 && j > i, a + ' 를 못 찾았다 — 이 검사가 낡았다');
  return src.slice(i, j);
};
// 맨 앞 칸의 「}」까지 — 함수 하나 통째(app.js 는 함수 끝만 맨 앞 칸에 「}」가 온다)
const fnAt = (src, head) => cut(src, head, '\n}\n') + '\n}\n';
// 줄 끝 주석(// …)을 걷은 코드 — tests/lazy-load.test.cjs 와 같은 꼴
const codeOnly = (t) => t.split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '')).join('\n');

// ── logFeature — 어린 부서 거르기(설계 2-4) ──
const GUARD = cut(APP, '// ── 보호자 확인 — 순수 (여기부터) ──', '// ── 보호자 확인 — 순수 (여기까지) ──');
const LOGF = fnAt(APP, 'const featSent = {};');
const FIVE = ['board', 'share-open', 'share-kakao', 'share-sheet', 'share-save'];
const mkLog = (user) => {
  const sent = [];
  const ctx = vm.createContext({
    loadUser: () => user,
    api: { featureLog: (p) => { sent.push([p.user_id, p.feature, p.item]); return Promise.resolve({ ok: true }); } },
  });
  const T = vm.runInContext(GUARD + '\n' + LOGF + '\n;({ logFeature, usage: typeof USAGE_FEATURES === "undefined" ? null : Array.from(USAGE_FEATURES) })', ctx);
  return { logFeature: T.logFeature, usage: T.usage ? Array.from(T.usage) : null, sent };
};
const KIDS = [
  { name: '김하늘', type: '교회학교', bu: '유년부', grade: '3학년', user_id: 'k1' },
  { name: '김하늘', type: '교회학교', bu: '초등부', grade: '6학년', user_id: 'k2' },
  { name: '김하늘', type: '교회학교', bu: '사랑부', grade: '', user_id: 'k3' },
  { name: '김하늘', type: '교회학교', bu: '중등부', grade: '1학년', user_id: 'k4' },
  { name: '김하늘', type: '교회학교', bu: '중등부', grade: '2학년', user_id: 'k5' },
  { name: '김하늘', type: '교회학교', bu: '중등부', grade: '', user_id: 'k6' },
];
const GROWN = [
  { name: '김세웅', type: '교구', gu: '3교구', mok: '2목장', user_id: 'a1' },
  { name: '김세웅', type: '교회학교', bu: '중등부', grade: '3학년', user_id: 'a2' },
  { name: '김세웅', type: '교회학교', bu: '초등부', grade: '교사', user_id: 'a3' },
  { name: '김세웅', type: '교회학교', bu: '고등부', grade: '1학년', user_id: 'a4' },
  { name: '김세웅', type: '교회학교', bu: '청년부', grade: '', user_id: 'a5' },
];
const who = (u) => [u.type, u.bu || u.gu, u.grade || u.mok].filter(Boolean).join(' ');

test('logFeature — 보내기 · 게시판 다섯 값(USAGE_FEATURES)은 어린 부서(needsGuardian)면 보내지 않는다 · 다른 열람 기록은 지금 그대로', () => {
  const names = mkLog(null).usage;
  assert.ok(names, 'app.js 에 USAGE_FEATURES 가 없다 — logFeature 바로 위에 둔다');
  assert.deepEqual(names.slice().sort(), FIVE.slice().sort(), 'USAGE_FEATURES = 다섯 값(서버 index.ts 의 같은 이름과 같다)');
  for (const kid of KIDS) {
    const r = mkLog(kid);
    for (const f of FIVE) r.logFeature(f, f === 'board' ? 0 : 3);
    assert.deepEqual(r.sent, [], who(kid) + ' — 다섯 값을 보냈다');
    r.logFeature('psalm', 1001); r.logFeature('meditation', 44);
    assert.deepEqual(r.sent.map((s) => s[1]), ['psalm', 'meditation'], who(kid) + ' — 다른 열람 기록은 지금처럼 남는다');
  }
});

test('logFeature — 교구 · 중등부 3학년 · 부서 선생님 · 고등부 · 청년부는 다섯 값도 남긴다 · 로그인 전은 아무것도 · 60초 안 같은 값은 한 번(지금 그대로)', () => {
  for (const g of GROWN) {
    const r = mkLog(g);
    r.logFeature('board', 0); r.logFeature('share-sheet', 6);
    assert.deepEqual(r.sent, [[g.user_id, 'board', 0], [g.user_id, 'share-sheet', 6]], who(g));
  }
  const r = mkLog(GROWN[0]);
  r.logFeature('share-save', 5); r.logFeature('share-save', 5); r.logFeature('share-save', 4);
  assert.deepEqual(r.sent.map((s) => s.slice(1)), [['share-save', 5], ['share-save', 4]], '60초 안 같은 (값, 종류)는 한 번 · 종류가 다르면 따로');
  for (const u of [null, { name: '손님' }]) {
    const q = mkLog(u);
    q.logFeature('board', 0); q.logFeature('psalm', 1001);
    assert.deepEqual(q.sent, [], '로그인 전(user_id 없음)은 아무것도 안 보낸다');
  }
});

test('게시판 — renderBoard 첫 줄이 logFeature("board", 0)(markBoardSeen 앞) · 게시판 기록은 그 한 곳 · renderBoard 를 다시 부르는 곳이 없다', () => {
  assert.match(APP, /\nfunction renderBoard\(\) \{\n  logFeature\("board", 0\);[^\n]*\n  markBoardSeen\(\);/, 'renderBoard 첫 줄 — 배지 지우기(markBoardSeen) 앞');
  const code = codeOnly(APP);
  assert.equal((code.match(/logFeature\("board"/g) || []).length, 1, '게시판 기록은 renderBoard 한 곳 — loadBoard · 서버 boardList 는 글쓰기 · 공감 · 가리기 뒤마다 다시 불리고 교회 어드민도 부른다');
  assert.equal((code.match(/\brenderBoard\(/g) || []).length, 1, 'renderBoard 를 괄호로 부르는 곳이 없다(첫 화면 #open-board 가 이름으로 넘긴다) — 다시 그리는 곳이 생기면 게시판 연 횟수가 부푼다');
  assert.ok(APP.includes('document.getElementById("open-board").addEventListener("click", renderBoard);'), '들어오는 길은 첫 화면 단추 하나');
});
```

(2) `tools/preflight.py:167` — preflight가 돌리는 목록(`PURE_TESTS`)에 넣는다. 구역 1이 같은 자리에 줄을 더했어도 아래 old는 여전히 한 번만 나온다. 줄 차례는 상관없다.

지금 글자(old):
```python
PURE_TESTS += ["tests/pray-share.test.cjs"]
```
새 글자(new):
```python
PURE_TESTS += ["tests/pray-share.test.cjs"]
# 📤 보내기 · 💬 게시판 이용 기록(2026-11-06) — logFeature 어린 부서 거르기 · 게시판 한 줄 · shareLink 종류 코드(공유 창 · 복사) · 묵상 미리보기 표식 · 교육 수료증
PURE_TESTS += ["tests/usage-log.test.cjs"]
```

- [ ] **Step 2: 돌려서 실패 확인**

```bash
node --test tests/usage-log.test.cjs 2>&1 | grep -E "^(not ok|# (pass|fail))"
```
기대 출력(스크래치 사본에서 확인):
```
not ok 1 - logFeature — 보내기 · 게시판 다섯 값(USAGE_FEATURES)은 어린 부서(needsGuardian)면 보내지 않는다 · 다른 열람 기록은 지금 그대로
not ok 3 - 게시판 — renderBoard 첫 줄이 logFeature("board", 0)(markBoardSeen 앞) · 게시판 기록은 그 한 곳 · renderBoard 를 다시 부르는 곳이 없다
# pass 1
# fail 2
```
- 1번은 「app.js 에 USAGE_FEATURES 가 없다」에서 떨어진다. 지금은 어린 부서도 다섯 값을 보낸다.
- 3번은 renderBoard 첫 줄이 아직 `markBoardSeen();`이라 떨어진다.
- 2번(어른 · 로그인 전 · 60초)은 지금 동작을 지키는 시험이라 이미 붙는다.

- [ ] **Step 3: 구현**

(1) `app.js:4212` — `logFeature` 바로 위(`const featSent = {};` 다음 줄)에 `USAGE_FEATURES`를 둔다.

지금 글자(old):
```js
function logFeature(feature, item) {
```
새 글자(new):
```js
// 📤 보내기 · 💬 게시판 이용 기록(2026-11-06 · docs/superpowers/specs/2026-11-06-share-board-usage-log-design.md) — 이 다섯은 교회 어드민에서
//    「누가」(이름 · 소속)를 보는 값이라 만 14세 미만 어린 부서(needsGuardian — 보호자 확인과 같은 판정)는 아예 보내지 않는다.
//    서버 featureLog 도 같은 다섯(같은 이름 USAGE_FEATURES · index.ts)을 한 번 더 거른다 · 다른 열람 기록(psalm · meditation …)은 지금 그대로.
//    ⚠️ 전역 const 다 — js/*.js 에서 같은 이름을 다시 선언하면 뒤에 실린 파일이 SyntaxError 로 통째로 안 실린다.
const USAGE_FEATURES = new Set(["board", "share-open", "share-kakao", "share-sheet", "share-save"]);
function logFeature(feature, item) {
```

(2) `app.js:4216` — 로그인 확인 바로 다음, 60초 거름(`featSent`) 앞. `u`는 함수 첫 줄의 `loadUser()` 값이다. 그래서 이름 표의 `needsGuardian(loadUser())`와 같은 값이고, localStorage를 두 번 읽지 않는다.

지금 글자(old):
```js
    const k = feature + ":" + (item || 0), now = Date.now();
```
새 글자(new):
```js
    if (USAGE_FEATURES.has(feature) && needsGuardian(u)) return;   // 어린 부서 — 보내기 · 게시판 기록은 남기지 않는다(u = loadUser())
    const k = feature + ":" + (item || 0), now = Date.now();
```

(3) `app.js:4795` — `renderBoard()` 첫 줄, `markBoardSeen()` 앞.

지금 글자(old):
```js
function renderBoard() {
  markBoardSeen(); // 게시판을 열면 첫 화면 '새글' 배지 소멸
```
새 글자(new):
```js
function renderBoard() {
  logFeature("board", 0);   // 💬 게시판을 연 날 · 횟수(2026-11-06 · 어린 부서는 logFeature 가 거른다) — loadBoard · 서버 boardList 에는 넣지 않는다(글쓰기 · 공감 · 가리기 뒤마다 다시 불리고 교회 어드민도 부른다)
  markBoardSeen(); // 게시판을 열면 첫 화면 '새글' 배지 소멸
```

- [ ] **Step 4: 돌려서 통과 확인**

```bash
node --check app.js && node --test tests/usage-log.test.cjs 2>&1 | grep -E "^(not ok|# (pass|fail))"
```
기대: `# pass 3` · `# fail 0`

같은 자리를 읽는 기존 시험도 함께 돌린다:
- store-review — 보호자 확인 블록
- lazy-load — `logFeature`가 app.js에 남아 있는지
- navi ⑤ — 열람 기록
- duty-flow — 가짜 `logFeature`

```bash
node --test tests/usage-log.test.cjs tests/store-review.test.cjs tests/lazy-load.test.cjs tests/navi.test.cjs tests/duty-flow.test.cjs 2>&1 | grep -E "^(not ok|# (pass|fail))"
```
기대: `# pass 95` · `# fail 0`(3 + 32 + 11 + 13 + 36). 구역 1이 navi 시험을 더했으면 그만큼 많다 — 꼭 볼 것은 `# fail 0`이다.
```bash
python tools/preflight.py 2>&1 | grep -E "tests/usage-log|모두 통과|배포를 멈춘다"
```
기대:
```
  통과  tests/usage-log.test.cjs — 3가지 통과
모두 통과 — 배포해도 된다.
```

- [ ] **Step 5: 커밋**

```bash
git add -- app.js tests/usage-log.test.cjs tools/preflight.py
git diff --cached --stat
git commit -m "feat(이용 기록): 게시판 연 날 기록 · 보내기 · 게시판 다섯 값은 어린 부서면 안 보낸다(USAGE_FEATURES · logFeature)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git show --stat HEAD
```
`git show --stat HEAD`에는 파일 셋(`app.js` · `tests/usage-log.test.cjs` · `tools/preflight.py`)만 나와야 한다.

---

### Task 4: shareLink 셋째 인자 kind — 공유 창 · 복사 기록과 부르는 네 곳의 종류 코드
**Files:**
- Modify:
  - `app.js:9347`(`shareEvent`)
  - `app.js:9355~9383`(`shareLink`)
  - `app.js:9385~9392`(`shareApp`)
  - `app.js:9395~9402`(`shareWeeklyVerse`)
  - `app.js:9405~9412`(`shareMyVerse`)
- Test: `tests/usage-log.test.cjs` 시험 4~5(파일 끝에 붙인다)

**Interfaces:**
- Consumes:
  - Task 3 — `logFeature(feature, item)`(어린 부서를 거른다)와 시험 도우미 `test` · `assert` · `vm` · `APP` · `cut` · `fnAt` · `codeOnly`
  - app.js 기존 — `SHARE_TITLE` · `SHARE_HOME` · `EVENT_SHARE_TEXT` · `verseShareUrl(no)` · `showShareToast(msg)`
  - js/events.js:685는 `typeof shareEvent === "function"` 뒤에서 `shareEvent()`를 부른다. 그대로 둔다.
- Produces:
  - `shareLink(text, url, kind)`. `kind`는 숫자 종류 코드다: 4 가을 말씀암송 동행 안내 · 5 앱 소개 · 6 외운 말씀 · 9 이번 주 말씀 주소(서버 `SHARE_KINDS`와 같은 번호).
  - 공유 창이 resolve 하면 `logFeature("share-sheet", kind)`, 복사가 끝나면 `logFeature("share-save", kind)`를 부른다.
  - 시험 도우미 `flush` · `err`는 Task 5가 쓴다.

- [ ] **Step 1: 실패하는 시험 쓰기**

`tests/usage-log.test.cjs` **끝에** 붙인다(앞 블록의 이름을 그대로 쓴다):

```js

// ── shareLink — 글 · 주소 보내기의 종류 코드(설계 2-2: 4 · 5 · 6 · 9) ──
const flush = () => new Promise((r) => setImmediate(r));
const err = (n) => Object.assign(new Error(n), { name: n });
const COPIED = '공유 문구가 복사되었습니다! 붙여넣기 해주세요 📋';
const mkShare = (nav, o = {}) => {
  const logs = [], toasts = [];
  const doc = {
    createElement: () => ({ style: {}, focus() {}, select() {} }),
    body: { appendChild() {}, removeChild() {} },
    execCommand: () => { if (o.exec === 'throw') throw new Error('copy'); return o.exec; },
  };
  const ctx = vm.createContext({ navigator: nav, document: doc, SHARE_TITLE: '[고척교회]', showShareToast: (m) => toasts.push(m), logFeature: (f, k) => logs.push([f, k]) });
  vm.runInContext(fnAt(APP, 'function shareLink('), ctx);
  return { shareLink: ctx.shareLink, logs, toasts };
};

test('shareLink — 공유 창으로 넘기면(resolve) share-sheet · 복사가 끝나면 share-save · 닫음 · 실패 · 종류 없음은 안 센다 · 안내 글은 지금 그대로', async () => {
  const U = 'https://gocheok.onlybible.kr/?v=44';
  const CASES = [
    ['공유 창 — 앱을 골랐다', { share: () => Promise.resolve() }, {}, 6, [['share-sheet', 6]]],
    ['공유 창 — 닫음(AbortError)', { share: () => Promise.reject(err('AbortError')) }, {}, 6, []],
    ['공유 창 — 이미 떠 있음(InvalidStateError)', { share: () => Promise.reject(err('InvalidStateError')) }, {}, 6, []],
    ['공유 창 — 종류 없이 부름', { share: () => Promise.resolve() }, {}, undefined, []],
    ['복사 — 됨', { clipboard: { writeText: () => Promise.resolve() } }, {}, 5, [['share-save', 5]]],
    ['복사 — 막힘', { clipboard: { writeText: () => Promise.reject(err('NotAllowedError')) } }, {}, 5, []],
    ['옛 복사 — execCommand true', {}, { exec: true }, 4, [['share-save', 4]]],
    ['옛 복사 — execCommand false', {}, { exec: false }, 4, []],
    ['옛 복사 — execCommand 예외', {}, { exec: 'throw' }, 4, []],
    ['옛 복사 — 종류 없이 부름', {}, { exec: true }, undefined, []],
  ];
  for (const [name, nav, o, kind, want] of CASES) {
    const r = mkShare(nav, o);
    r.shareLink('글', U, kind);
    await flush();
    assert.deepEqual(r.logs, want, name);
  }
  let r = mkShare({ clipboard: { writeText: () => Promise.resolve() } });
  r.shareLink('글', U, 5); await flush();
  assert.deepEqual(r.toasts, [COPIED], '복사됨 안내');
  r = mkShare({ clipboard: { writeText: () => Promise.reject(err('NotAllowedError')) } });
  r.shareLink('글', U, 5); await flush();
  assert.deepEqual(r.toasts, [U], '복사가 막히면 주소를 보여 준다');
  r = mkShare({}, { exec: 'throw' });
  r.shareLink('글', U, 4); await flush();
  assert.deepEqual(r.toasts, [U], '옛 복사가 넘어지면 주소');
});

test('shareLink 를 부르는 넷 — 종류 코드(가을 동행 안내 4 · 앱 소개 5 · 이번 주 말씀 주소 9 · 외운 말씀 6) · 그 밖에 부르는 곳이 없다', () => {
  const src = cut(APP, 'function shareEvent() {', '\n') + '\n' + fnAt(APP, 'function shareApp() {') + fnAt(APP, 'function shareWeeklyVerse(verse) {') + fnAt(APP, 'function shareMyVerse(verse) {');
  const calls = [];
  const HOME = 'https://gocheok.onlybible.kr/';
  const ctx = vm.createContext({ EVENT_SHARE_TEXT: '안내', SHARE_HOME: HOME, verseShareUrl: (no) => HOME + '?v=' + no, shareLink: (t, u, k) => calls.push([u, k]) });
  vm.runInContext(src, ctx);
  const v = { no: 44, refShort: '눅 17:16', text: '본문' };
  ctx.shareEvent(); ctx.shareApp(); ctx.shareWeeklyVerse(v); ctx.shareMyVerse(v);
  assert.deepEqual(calls, [[HOME + '?from=autumn4', 4], [HOME, 5], [HOME + '?v=44', 9], [HOME + '?v=44', 6]]);
  const callers = codeOnly(APP).split('\n').filter((l) => /\bshareLink\(/.test(l) && !/function shareLink\(/.test(l));
  assert.equal(callers.length, 4, 'shareLink 를 새로 부르면 셋째 인자(종류 코드)를 함께 넘기고 이 시험 · 설계서 2-2 · 서버 SHARE_KINDS 에 더한다: ' + callers.map((l) => l.trim()).join(' / '));
});
```

- [ ] **Step 2: 돌려서 실패 확인**

```bash
node --test tests/usage-log.test.cjs 2>&1 | grep -E "^(not ok|# (pass|fail))"
```
기대 출력(스크래치 사본에서 확인):
```
not ok 4 - shareLink — 공유 창으로 넘기면(resolve) share-sheet · 복사가 끝나면 share-save · 닫음 · 실패 · 종류 없음은 안 센다 · 안내 글은 지금 그대로
not ok 5 - shareLink 를 부르는 넷 — 종류 코드(가을 동행 안내 4 · 앱 소개 5 · 이번 주 말씀 주소 9 · 외운 말씀 6) · 그 밖에 부르는 곳이 없다
# pass 3
# fail 2
```
- 4번은 첫 경우 「공유 창 — 앱을 골랐다」에서 떨어진다. 지금 `shareLink`에는 `then`이 없어 아무것도 남기지 않으므로 `logs`가 `[]`다.
- 5번은 부르는 네 곳이 셋째 인자를 넘기지 않아 `k`가 `undefined`라 떨어진다.

- [ ] **Step 3: 구현**

(1) `app.js:9347` — `shareEvent`

지금 글자(old):
```js
function shareEvent() { shareLink(EVENT_SHARE_TEXT, SHARE_HOME + "?from=autumn4"); }
```
새 글자(new):
```js
function shareEvent() { shareLink(EVENT_SHARE_TEXT, SHARE_HOME + "?from=autumn4", 4); }
```

(2) `app.js:9355~9383` — `shareLink` 통째(머리 주석 둘째 줄부터)

지금 글자(old):
```js
// 폴백에서도 문구를 함께 복사해야 카톡에 붙여넣었을 때 메시지가 완성된다.
function shareLink(text, url) {
  if (navigator.share) {
    navigator.share({ title: SHARE_TITLE, text, url }).catch(function() {});
    return;
  }
  const full = text ? text + "\n" + url : url;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(full).then(function() {
      showShareToast("공유 문구가 복사되었습니다! 붙여넣기 해주세요 📋");
    }).catch(function() {
      showShareToast(url);
    });
    return;
  }
  // execCommand 폴백 (구형 브라우저)
  const ta = document.createElement("textarea");
  ta.value = full;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try { document.execCommand("copy"); showShareToast("공유 문구가 복사되었습니다! 붙여넣기 해주세요 📋"); }
  catch (e) { showShareToast(url); }
  document.body.removeChild(ta);
}
```
새 글자(new):
```js
// 폴백에서도 문구를 함께 복사해야 카톡에 붙여넣었을 때 메시지가 완성된다.
// kind — 보내기 기록의 종류 코드(2026-11-06 · 4 가을 동행 안내 · 5 앱 소개 · 6 외운 말씀 · 9 이번 주 말씀 주소 — 이름은 서버 SHARE_KINDS 한 곳).
//   공유 창으로 넘겼을 때(resolve)만 share-sheet · 복사가 끝났을 때만 share-save — 닫음(AbortError) · 실패는 안 센다 · kind 가 없으면 남기지 않는다.
//   어느 앱을 골랐는지 · 실제로 보냈는지는 알 수 없다(공유 창이 알려 주지 않는다) — 글 · 주소도 싣지 않는다.
function shareLink(text, url, kind) {
  if (navigator.share) {
    navigator.share({ title: SHARE_TITLE, text, url }).then(function() {
      if (kind) logFeature("share-sheet", kind);
    }).catch(function() {});
    return;
  }
  const full = text ? text + "\n" + url : url;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(full).then(function() {
      if (kind) logFeature("share-save", kind);
      showShareToast("공유 문구가 복사되었습니다! 붙여넣기 해주세요 📋");
    }).catch(function() {
      showShareToast(url);
    });
    return;
  }
  // execCommand 폴백 (구형 브라우저)
  const ta = document.createElement("textarea");
  ta.value = full;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    const copied = document.execCommand("copy");
    if (copied === true && kind) logFeature("share-save", kind);   // false = 복사를 못 했다(안내 글은 지금처럼)
    showShareToast("공유 문구가 복사되었습니다! 붙여넣기 해주세요 📋");
  }
  catch (e) { showShareToast(url); }
  document.body.removeChild(ta);
}
```

(3) `app.js:9389~9391` — `shareApp`

지금 글자(old):
```js
    "로그인 없이 바로 체험해볼 수 있습니다. 함께해요! 🙌",
    SHARE_HOME
  );
```
새 글자(new):
```js
    "로그인 없이 바로 체험해볼 수 있습니다. 함께해요! 🙌",
    SHARE_HOME,
    5   // 보내기 기록 종류 — 앱 소개(글)
  );
```

(4) `app.js:9399~9401` — `shareWeeklyVerse`(지금 `const WEEKLY_SHARE = false;` · app.js:3678 이라 단추가 숨어 있다)

지금 글자(old):
```js
    "로그인 없이 바로 외워볼 수 있어요. 함께해요! 🙌",
    verseShareUrl(verse.no)
  );
```
새 글자(new):
```js
    "로그인 없이 바로 외워볼 수 있어요. 함께해요! 🙌",
    verseShareUrl(verse.no),
    9   // 보내기 기록 종류 — 이번 주 말씀 주소(글 · 지금 숨김 WEEKLY_SHARE=false — 켜면 그대로 세진다)
  );
```

(5) `app.js:9409~9411` — `shareMyVerse`

지금 글자(old):
```js
    "함께 말씀 암송해요! 로그인 없이 바로 시작할 수 있어요.",
    verseShareUrl(verse.no)
  );
```
새 글자(new):
```js
    "함께 말씀 암송해요! 로그인 없이 바로 시작할 수 있어요.",
    verseShareUrl(verse.no),
    6   // 보내기 기록 종류 — 외운 말씀(글)
  );
```

- [ ] **Step 4: 돌려서 통과 확인**

pray-share 481은 `function shareWeeklyVerse(verse) {`가 그대로 있는지 보므로 함께 돌린다.
```bash
node --check app.js && node --test tests/usage-log.test.cjs tests/pray-share.test.cjs 2>&1 | grep -E "^(not ok|# (pass|fail))"
```
기대: `# pass 39` · `# fail 0`(5 + 34)
```bash
python tools/preflight.py 2>&1 | grep -E "tests/(usage-log|pray-share)|모두 통과|배포를 멈춘다"
```
기대(스크래치 사본에서 확인):
```
  통과  tests/pray-share.test.cjs — 34가지 통과
  통과  tests/usage-log.test.cjs — 5가지 통과
모두 통과 — 배포해도 된다.
```

- [ ] **Step 5: 커밋**

```bash
git add -- app.js tests/usage-log.test.cjs
git diff --cached --stat
git commit -m "feat(이용 기록): shareLink 셋째 인자 kind — 공유 창으로 넘김 share-sheet · 복사 share-save(가을 동행 4 · 앱 소개 5 · 외운 말씀 6 · 이번 주 말씀 주소 9)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git show --stat HEAD
```
`git show --stat HEAD`에는 파일 둘(`app.js` · `tests/usage-log.test.cjs`)만 나와야 한다.

---

### Task 5: 묵상 미리보기 표식을 보내기 판까지 · 교육 수료증 기록
**Files:**
- Modify:
  - `app.js:9839`(`maybeShowWeeklyMeditation`이 `showMeditationModal`에 넘기는 extra)
  - `app.js:9848~9849`(`showMeditationModal` 머리 주석)
  - `app.js:9917~9919`(묵상 창 `#med-share` 받이)
  - `js/edu.js:700~713`(수료증 「저장·공유」 받이)
  - `tests/pray-share.test.cjs:322 · 388`
- Test: `tests/usage-log.test.cjs` 시험 6~7(파일 끝에 붙인다) · `tests/pray-share.test.cjs`(정규식 두 줄)
- 읽기만: `app.js:10036~10046` `previewDailyMessage`. 이미 `maybeShowWeeklyMeditation(true, false, "preview")`로 연다. 바꾸지 않고 시험이 글자로 지킨다.
  - 그 밖에 묵상 창을 여는 길은 app.js:440(`"widget"`) · 3934(매일 묵상 단추) · 9692 · 9694(자동)다. 모두 미리보기가 아니라 `preview`가 false로 간다.

**Interfaces:**
- Consumes:
  - Task 3 — `logFeature`와 시험 도우미 `test` · `assert` · `vm` · `read` · `APP` · `cut` · `fnAt`
  - Task 4 — 시험 도우미 `flush` · `err`
  - 구역 3(js/pray-share.js) — `openMedShare(m, opts)`는 `opts && opts.preview`면 `pshState.noLog = true`로 둔다. 옛 `openMedShare(m)`는 둘째 인자를 무시하므로 어느 구역이 먼저 들어가도 화면은 깨지지 않는다.
- Produces:
  - `showMeditationModal(…, extra)`의 `extra.preview` — 미리보기(source `"preview"`)일 때만 true
  - 묵상 단추 받이의 `const opts = { preview: !!(extra && extra.preview) };` → `openMedShare(m, opts)`
  - js/edu.js의 `logFeature('share-sheet', 7)` · `logFeature('share-save', 7)`(typeof로 지킨다)
  - pray-share 시험 두 줄의 새 글자 `openMedShare\(m, opts\)`

- [ ] **Step 1: 실패하는 시험 쓰기**

(1) `tests/usage-log.test.cjs` **끝에** 붙인다:

```js

// ── 묵상 미리보기(설계 2-2 끝) · 교육 수료증(종류 7) ──
test('묵상 미리보기 — 관리자 미리보기(source "preview")에서 연 창의 보내기 판은 기록을 남기지 않게 표식(preview)이 openMedShare 까지 간다', () => {
  assert.match(fnAt(APP, 'function previewDailyMessage() {'), /maybeShowWeeklyMeditation\(true, false, "preview"\);/, '미리보기는 source "preview" 로 연다');
  const mw = fnAt(APP, 'function maybeShowWeeklyMeditation(');
  assert.match(mw, /showMeditationModal\(items, pick, verse, sermon, !!withTabs, usingPrev, \{ psalm: todayPsalm, song: todaySong, blessing: todayBless, preview: source === "preview" \}\);/, '창에 표식을 넘긴다(미리보기일 때만 true)');
  const tap = cut(fnAt(APP, 'function showMeditationModal('), 'mShare.addEventListener("click"', '});\n');
  assert.match(tap, /const opts = \{ preview: !!\(extra && extra\.preview\) \};/, '단추가 표식을 판의 opts 로');
  assert.match(tap, /if \(typeof openMedShare === "function"\) openMedShare\(m, opts\);/, '판에 넘긴다(typeof 지킴이 그대로)');
  assert.ok(tap.indexOf('const opts = ') < tap.indexOf('withLazyJs("prayShare"'), '판을 받기 전에 정한다');
});

test('교육 수료증 — 공유 창으로 넘기면 share-sheet 7 · 내려받기로 가면 share-save 7 · 닫음(AbortError)은 안 센다 · typeof 로 지킨다', async () => {
  const EDU = read('js', 'edu.js');
  const HEAD = "document.getElementById('edu-cert-save').addEventListener('click', ";
  const i = EDU.indexOf(HEAD), j = EDU.indexOf('\n      });\n', i);
  assert.ok(i > 0 && j > i, '수료증 「저장·공유」 단추를 못 찾았다 — 이 검사가 낡았다');
  const handler = EDU.slice(i + HEAD.length, j + '\n      }'.length);
  const run = async (nav, withLog = true) => {
    const logs = [], downs = [];
    const g = {
      navigator: nav, blob: {}, url: 'blob:cert', name: 'cert.png',
      File: function File(parts, n) { this.name = n; },
      eduCertDownload: (u, n) => downs.push(n), say: () => {},
    };
    if (withLog) g.logFeature = (f, k) => logs.push([f, k]);
    vm.runInContext('(' + handler + ')()', vm.createContext(g));
    await flush();
    return { logs, downs };
  };
  const can = { canShare: () => true };
  let r = await run({ ...can, share: () => Promise.resolve() });
  assert.deepEqual(r.logs, [['share-sheet', 7]], '공유 창으로 넘겼다'); assert.equal(r.downs.length, 0);
  r = await run({ ...can, share: () => Promise.reject(err('AbortError')) });
  assert.deepEqual(r.logs, [], '닫음은 안 센다'); assert.equal(r.downs.length, 0, '닫으면 내려받지도 않는다(지금 그대로)');
  r = await run({ ...can, share: () => Promise.reject(err('NotAllowedError')) });
  assert.deepEqual(r.logs, [['share-save', 7]], '공유가 실패해 내려받기로'); assert.equal(r.downs.length, 1);
  r = await run({});
  assert.deepEqual(r.logs, [['share-save', 7]], '공유 창이 없는 기기 — 바로 내려받기'); assert.equal(r.downs.length, 1);
  r = await run({ ...can, share: () => Promise.resolve() }, false);
  assert.deepEqual(r.logs, [], 'logFeature 가 없어도(옛 app.js) 넘어지지 않는다');
  const all = (EDU.match(/\blogFeature\(/g) || []).length;
  const safe = (EDU.match(/typeof logFeature === 'function'\) logFeature\(/g) || []).length;
  assert.ok(all >= 4 && all === safe, 'js/edu.js 의 logFeature 는 모두 typeof 뒤에서(' + safe + '/' + all + ')');
});
```
(js/edu.js에는 지금 `logFeature`가 한 곳 있다(436 `'edu'`, typeof 뒤). 이 Task가 셋을 더해 넷이 된다.)

(2) `tests/pray-share.test.cjs` — 지금 받이를 `openMedShare(m)` 글자로 잡고 있는 정규식 두 줄을 새 꼴로 고친다. 깨진 채 올라가면 모든 세션의 배포가 막힌다.

`322` 지금 글자(old):
```js
  assert.match(tap, /openMedShare\(m\)/);
```
새 글자(new):
```js
  assert.match(tap, /openMedShare\(m, opts\)/);
```

`388` 지금 글자(old):
```js
  assert.match(tap, /if \(typeof openMedShare === "function"\) openMedShare\(m\);/, '받기에 실패해도 withLazyJs 는 부른다');
```
새 글자(new):
```js
  assert.match(tap, /if \(typeof openMedShare === "function"\) openMedShare\(m, opts\);/, '받기에 실패해도 withLazyJs 는 부른다');
```
325 · 357 · 366의 `function openMedShare(m) {`는 js/pray-share.js의 글자다. 그 함수의 꼴을 `(m, opts)`로 바꾸는 구역 3이 같은 Task에서 고친다. 이 Task는 손대지 않는다.

- [ ] **Step 2: 돌려서 실패 확인**

```bash
node --test tests/usage-log.test.cjs 2>&1 | grep -E "^(not ok|# (pass|fail))"
```
기대 출력(스크래치 사본에서 확인):
```
not ok 6 - 묵상 미리보기 — 관리자 미리보기(source "preview")에서 연 창의 보내기 판은 기록을 남기지 않게 표식(preview)이 openMedShare 까지 간다
not ok 7 - 교육 수료증 — 공유 창으로 넘기면 share-sheet 7 · 내려받기로 가면 share-save 7 · 닫음(AbortError)은 안 센다 · typeof 로 지킨다
# pass 5
# fail 2
```
- 6번은 「창에 표식을 넘긴다」에서 떨어진다. extra에 아직 `preview`가 없다.
- 7번은 「공유 창으로 넘겼다」에서 떨어진다. 지금 수료증에는 `.catch`만 있어 아무것도 남기지 않는다.

```bash
node --test tests/pray-share.test.cjs 2>&1 | grep -E "^(not ok|# (pass|fail))"
```
기대 출력(스크래치 사본에서 확인):
```
not ok 14 - 배선 — 「🌿 오늘의 묵상」 창: 문은 app.js(MED_SHARE_OPEN · 시험 참여자 먼저) · 설교가 있을 때만 단추 · 지금 보는 요일을 · 창을 먼저 걷고 판을 연다
not ok 18 - typeof 지킴이 · 묵상 단추가 넘기는 칸 — 옛 판과 엇갈려도 깨지지 않는다 · 지금 요일 · 설교 제목
# pass 32
# fail 2
```
받이가 아직 `openMedShare(m)`이라 새 정규식 `openMedShare\(m, opts\)`에 걸리지 않아 떨어진다.

- [ ] **Step 3: 구현**

(1) `app.js:9839` — `maybeShowWeeklyMeditation`이 창을 여는 줄

지금 글자(old):
```js
      showMeditationModal(items, pick, verse, sermon, !!withTabs, usingPrev, { psalm: todayPsalm, song: todaySong, blessing: todayBless });
```
새 글자(new):
```js
      // preview — 관리자 미리보기(source "preview")에서 연 창이라는 표식 · 그 창에서 연 「카톡·문자로 보내기」 판은 기록을 남기지 않는다(2026-11-06 · openMedShare 의 opts.preview → pshState.noLog)
      showMeditationModal(items, pick, verse, sermon, !!withTabs, usingPrev, { psalm: todayPsalm, song: todaySong, blessing: todayBless, preview: source === "preview" });
```

(2) `app.js:9848~9849` — `showMeditationModal` 머리 주석에 `extra.preview`를 적는다

지금 글자(old):
```js
// 여기서는 그 값만 보고 배너를 그릴지 말지 정한다(게이트·시작일 판단을 다시 하지 않는다).
function showMeditationModal(
```
새 글자(new):
```js
// 여기서는 그 값만 보고 배너를 그릴지 말지 정한다(게이트·시작일 판단을 다시 하지 않는다).
// extra.preview: 관리자 미리보기(previewDailyMessage → source "preview")에서 연 창일 때만 true — 「카톡·문자로 보내기」 판에 넘겨 그 판의 기록을 안 남긴다(2026-11-06).
function showMeditationModal(
```

(3) `app.js:9917~9919` — 묵상 창 「카톡·문자로 보내기」 단추 받이. `extra`는 없을 수 있다(이 함수 첫 줄이 `extra && extra.psalm`이다). 그래서 `!!(extra && extra.preview)`로 쓴다.

지금 글자(old):
```js
      done();
      setTimeout(() => withLazyJs("prayShare", () => {
        if (typeof openMedShare === "function") openMedShare(m);
```
새 글자(new):
```js
      // 관리자 미리보기(?preview=daily)에서 연 창이면 판도 기록을 남기지 않는다(2026-11-06 · opts.preview → pshState.noLog) ·
      //   ⚠️ 판 부르기 줄에 객체를 바로 쓰지 말 것 — tests/pray-share.test.cjs 가 이 받이를 「닫는 중괄호 · 괄호 · 세미콜론 · 줄바꿈」이 처음 나오는 자리에서 잘라 읽는다
      const opts = { preview: !!(extra && extra.preview) };
      done();
      setTimeout(() => withLazyJs("prayShare", () => {
        if (typeof openMedShare === "function") openMedShare(m, opts);
```

(4) `js/edu.js:706` — 수료증 공유. `.then(성공, 실패)` 두 칸으로 쓴다. 그래야 성공 쪽 일이 실패해도 내려받기로 넘어가지 않는다. 이 파일은 홑따옴표를 쓴다.

지금 글자(old):
```js
          navigator.share({ files: [file], title: '수료증' }).catch(function (err) {
```
새 글자(new):
```js
          // 📤 보내기 기록(2026-11-06 · 종류 7 교육 수료증) — 공유 창으로 넘기면 share-sheet · 내려받기를 시작하면 share-save · 닫음(AbortError)은 안 센다 ·
          //   어느 앱을 골랐는지 · 실제로 보냈는지는 모른다 · 옛 app.js 와 엇갈려도 넘어지지 않게 typeof 뒤에서
          navigator.share({ files: [file], title: '수료증' }).then(function () {
            if (typeof logFeature === 'function') logFeature('share-sheet', 7);
          }, function (err) {
```

(5) `js/edu.js:708~713` — 내려받기로 넘어가는 두 자리

지금 글자(old):
```js
            eduCertDownload(url, name); say('그림 파일 내려받기를 시작했어요.');
          });
          return;
        }
        eduCertDownload(url, name); say('그림 파일 내려받기를 시작했어요.');
      });
```
새 글자(new):
```js
            eduCertDownload(url, name); say('그림 파일 내려받기를 시작했어요.');
            if (typeof logFeature === 'function') logFeature('share-save', 7);
          });
          return;
        }
        eduCertDownload(url, name); say('그림 파일 내려받기를 시작했어요.');
        if (typeof logFeature === 'function') logFeature('share-save', 7);
      });
```

- [ ] **Step 4: 돌려서 통과 확인**

```bash
node --check app.js && node --check js/edu.js && node --test tests/usage-log.test.cjs tests/pray-share.test.cjs tests/lazy-load.test.cjs tests/edu-front.test.cjs 2>&1 | grep -E "^(not ok|# (pass|fail))"
```
기대: `# pass 106` · `# fail 0`(7 + 34 + 11 + 54).
- lazy-load는 typeof 지킴이가 같은 줄에 남았는지 본다.
- edu-front 445는 `navigator.canShare({ files: [file] })` · `navigator.share({ files: [file]` · `eduCertDownload(url, name)` 글자가 그대로 있는지 본다.

```bash
python tools/preflight.py 2>&1 | grep -E "tests/(usage-log|pray-share)|모두 통과|배포를 멈춘다"
```
기대(스크래치 사본에서 확인):
```
  통과  tests/pray-share.test.cjs — 34가지 통과
  통과  tests/usage-log.test.cjs — 7가지 통과
모두 통과 — 배포해도 된다.
```

- [ ] **Step 5: 커밋**

```bash
git add -- app.js js/edu.js tests/usage-log.test.cjs tests/pray-share.test.cjs
git diff --cached --stat
git commit -m "feat(이용 기록): 묵상 미리보기 표식을 보내기 판까지(opts.preview) · 교육 수료증 공유 창 · 내려받기(종류 7)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git show --stat HEAD
```
`git show --stat HEAD`에는 파일 넷(`app.js` · `js/edu.js` · `tests/usage-log.test.cjs` · `tests/pray-share.test.cjs`)만 나와야 한다.

---

## 구역 3 — 보내기 판 js/pray-share.js — 판 열기 · 카톡 · 공유 창 · 저장 · 설치 주소 (Task 6~7)

| 파일 | 맡은 일 |
|---|---|
| `js/pray-share.js` | 머리 주석 4행을 사실대로 고친다 · `pshState.noLog` · `pshKind()` · `pshLog(feature, item)` · `pshOpen(…, opts)` 에서 판 열기를 남긴다 · 여는 함수 셋(`openPrayShare` · `openMedShare(m, opts)` · `openVerseShare`)의 새 판과 다시 쓰는 판 · 기록 자리 다섯(`pshDownload` · `pshSend` · `pshSendLink` · `pshCopyLink` · `pshKakaoGo`) |
| `tests/pray-share.test.cjs` | 고칠 자리를 글자로 잡던 정규식(325 · 326 · 357 · 366 · 221 · 228 · 232 근처) · 카카오 vm 문맥(690~712 근처)에 가짜 `pshLog` · 판 전체를 싣는 도우미(`PAN` · `usageTick` · `usagePan`) · 새 시험 ① ② |
| `tools/preflight.py` | **고치지 않는다.** `PURE_TESTS += ["tests/pray-share.test.cjs"]` 가 167줄에 이미 있고, 새 시험 파일을 만들지 않는다 |

그대로 두는 자리(글자를 바꾸지 않으므로 그 시험도 그대로 통과한다):
- `pshReuse`: 370 정규식이 글자째 잡는다. 다시 쓰는 갈래의 `noLog` 는 여는 함수 셋 안에서 덮어쓴다.
- `pshLinkNext` · `pshKakaoSend`: 기록은 `pshSend` 의 then 과 `pshKakaoGo` 에서 남긴다.
- `pshSend` 첫 줄(222) · `pshCopyLink` 첫 줄(233 — 설계서 4절이 221 · 228 · 232 와 함께 들었지만, 기록은 `writeText` 의 then 안에 들어가므로 첫 줄 `pshLinkDone();` 은 그대로다) · `sharing` 검사가 `navigator.share(` 보다 앞(378) · `pshOpen` SDK 실패 갈래(644~650).
- `pshState` 머리와 끝(173 · 240 · 660): `noLog` 는 `esc` 와 `sharing` 사이에 넣는다.
- 판 머리(599 · `pshState` ~ `pshSay` 를 빈 vm 에 싣는 시험): 새 `pshKind` · `pshLog` 는 정의만이라 그대로 돈다.
- 개인정보 카카오 문장(850~857).
- 948~950: app.js `routeKakaoCard` 조각이라 pray-share.js 를 싣지 않는다.
- 다른 시험 파일은 `js/pray-share.js` 를 읽지 않는다(`tests/` 전체 grep · `tests/lazy-load.test.cjs` 의 `MODS` 에도 prayShare 가 없다).

미리 확인한 것(저장소 파일은 바꾸지 않았다): 지금 파일 사본(스크래치)에 이 계획의 old → new 25개를 차례로 얹었다. old 글자는 모두 한 번씩 있었다(Task 6 ③ 만 357 · 366 두 번). 두 파일 모두 줄 끝은 LF 다. 단계마다 `node --check js/pray-share.js` 가 통과했다. 구역 1 · 2 의 `USAGE_FEATURES` 는 가짜 한 줄을 `app.js` · `supabase/functions/api/index.ts` 끝에 덧붙였다.

| 상태 | tests | pass | fail | 떨어지는 시험 |
|---|---|---|---|---|
| 지금(시작 전) | 34 | 34 | 0 | — |
| Task 6 시험만 | 35 | 31 | 4 | 14 · 16 · 17 · 35 |
| Task 6 구현까지 | 35 | 35 | 0 | — |
| Task 7 시험만 | 36 | 33 | 3 | 10 · 30 · 36 |
| Task 7 구현까지 | 36 | 36 | 0 | — |
| Task 7 구현까지 · 구역 1 · 2 없음 | 36 | 35 | 1 | 36 — 「USAGE_FEATURES(서버 index.ts · 화면 app.js)를 못 찾았다 — 구역 1 · 2 가 먼저 들어와 있어야 한다」 |

명령은 모두 worktree 뿌리 `C:\Projects\wt-usage`(가지 `usage-log`)에서 Git Bash 로 돌린다. 시험 수는 지금 34개를 기준으로 적었다. 앞 구역이 이 파일에 시험을 더했으면 tests · pass 와 `not ok` 번호가 그만큼 달라진다. 기준은 **fail 수와 실패하는 시험 이름**이다.

---

### Task 6: 판 열기(share-open) — noLog · pshKind · pshLog · 묵상 미리보기 · 머리 주석

**Files:**
- Modify `js/pray-share.js`(줄 번호는 지금 파일 기준 · 위에서부터 고치면 아래 자리는 몇 줄씩 밀린다 — 글자로 찾는다):
  - 4: 머리 주석
  - 512~513: `pshState` 주석 · `noLog`
  - 518: `pshDoc` 아래에 `pshKind` · `pshLog`
  - 754~778: 여는 함수 셋
  - 793 · 860~862: `pshOpen` 머리와 끝
- Test `tests/pray-share.test.cjs`:
  - 325 · 326 · 357 · 366: 정규식
  - 파일 끝(986~987 `routeKakaoCard` 시험 뒤): 도우미와 시험 ①

**Interfaces:**
- Consumes:
  - app.js `logFeature(feature, item)` — 이미 있다(app.js:4212 근처 · 몸 전체가 try · 로그인 전이면 안 보냄 · 60초 막기). 구역 2 가 `USAGE_FEATURES` 어린 부서 거르기를 더한다.
  - 구역 2 의 app.js 묵상 창 단추 `openMedShare(m, { preview: !!extra.preview })` — 구역 2 가 같은 Task 에서 이 시험 파일의 322 · 388 정규식(`/openMedShare\(m\)/` · `/if \(typeof openMedShare === "function"\) openMedShare\(m\);/`)을 고쳤어야 한다.
  - 이름 표: 값 `share-open` · 종류 코드 1 · 2 · 3.
  - 시험 파일에 이미 있는 이름: `test`(node:test) · `assert` · `vm` · `read` · `cut` · `PS` · `APP` · `FILL` · `PURE` · `DOCS` · `LIST` · `MEDS`(248) · `VERSES`(407).
- Produces:
  - `pshState.noLog`
  - `function pshKind()`(1 · 2 · 3)
  - `function pshLog(feature, item)`
  - `openMedShare(m, opts)` — `opts.preview`. 구역 2 의 묵상 창 단추가 `openMedShare(m, { preview: !!extra.preview })` 로 부른다.
  - `pshOpen(title, withName, name, kind, opts)` — `opts.noLog`.
  - 시험 도우미 `PAN` · `usageTick()` · `usagePan(o)`(`o.kakao` · `o.withLog`) — Task 7 이 그대로 쓴다.

- [ ] **Step 1: 실패하는 시험 쓰기**

먼저 지금 상태를 본다. fail 0 이어야 한다. 14 · 17 이 이미 떨어져 있으면 구역 2 가 322 · 388 정규식을 덜 고친 것이니 그쪽을 먼저 끝낸다.
```bash
node --test tests/pray-share.test.cjs 2>&1 | grep -E "^# (tests|pass|fail)|^not ok"
```
기대 출력: `# tests 34` · `# pass 34` · `# fail 0`(앞 구역이 시험을 더했으면 그 수만큼 많다).

① 325 — 묵상 판 받는 쪽 꼴.
old:
```js
  assert.match(PS, /function openMedShare\(m\) \{/);
```
new:
```js
  assert.match(PS, /function openMedShare\(m, opts\) \{/, '미리보기 판을 가르는 opts(2026-11-06 · 이용 기록)');
```

② 326.
old:
```js
  assert.match(PS, /pshOpen\(PSH_TITLE_MED, false, "", "med"\)/, '묵상 판은 이름 칸 없이');
```
new:
```js
  assert.match(PS, /pshOpen\(PSH_TITLE_MED, false, "", "med", \{ noLog \}\)/, '묵상 판은 이름 칸 없이 · 미리보기 판이면 이용 기록을 남기지 않는다');
```

③ 357 · 366 — 두 줄의 글자가 같으므로 Edit 의 `replace_all: true` 로 한 번에 고친다(`'\n}\n'` 는 글자 그대로 — 역빗금 n).
old:
```js
cut(PS, 'function openMedShare(m) {', '\n}\n')
```
new:
```js
cut(PS, 'function openMedShare(m, opts) {', '\n}\n')
```

④ 파일 끝 — `routeKakaoCard` 시험의 마지막 두 줄 뒤에 붙인다.
old:
```js
  assert.equal(h.r, false); assert.deepEqual(h.hist, [], '카드 표가 없으면 주소도 안 건드린다');
});
```
new:
```js
  assert.equal(h.r, false); assert.deepEqual(h.hist, [], '카드 표가 없으면 주소도 안 건드린다');
});

// ── 📊 이용 기록(2026-11-06 친구 「카카오 등의 공유를 누가 사용하는지」 · 설계 docs/superpowers/specs/2026-11-06-share-board-usage-log-design.md) ──
//   판 전체(「// ── 판(아래에서 올라온다) ──」부터 파일 끝)를 가짜 화면에 싣는다 — 그림은 그리지 않는다(pshDraw 가짜 · 판이 그린 셈).
//   logFeature 는 가짜(부른 그대로 적는다) · withLog: false 면 아예 없다(옛 app.js · vm) · 공유 창 · 복사 · 카카오도 가짜.
const PAN = (() => {
  const i = PS.indexOf('// ── 판(아래에서 올라온다) ──');
  assert.ok(i > 0, '판 머리를 못 찾았다 — 이 검사가 낡았다');
  return PS.slice(i);
})();
const usageTick = () => new Promise((r) => setTimeout(r, 5));
const usagePan = (o = {}) => {
  const logs = [], downloads = [], kakaoSent = [], els = {};
  const mk = (id) => {
    const el = { id, hidden: false, disabled: false, textContent: '', innerHTML: '', value: '', src: '', alt: '', dataset: {}, style: {}, isConnected: true, on: {},
      classList: { add() {}, remove() {}, toggle() {} },
      addEventListener(ev, fn) { el.on[ev] = fn; }, removeEventListener() {}, setAttribute() {},
      querySelector: (sel) => (sel[0] === '#' ? els[sel.slice(1)] || null : sel === '.psh-x' ? mk('psh-x') : null),
      querySelectorAll: () => [],
      click() { if (el.download) downloads.push(el.download); },
      remove() { el.isConnected = false; if (el.id === 'psh') for (const k of Object.keys(els)) delete els[k]; } };
    return el;
  };
  const doc = {
    visibilityState: 'hidden', head: { appendChild() {} }, addEventListener() {}, removeEventListener() {},
    createElement: () => mk(''),
    getElementById: (id) => els[id] || null,
    // 판(id="psh")이 붙으면 그 안의 id 칸을 만든다 — innerHTML 에 있는 것만(이름 칸은 기도문 · 카카오 단추는 말씀 판 + 키 + 카톡 기기)
    body: { classList: { add() {}, remove() {} }, appendChild(w) {
      if (w.id !== 'psh') return;
      els.psh = w;
      for (const id of ['psh-name', 'psh-img', 'psh-kakao', 'psh-send', 'psh-hint', 'psh-msg']) if (w.innerHTML.includes('id="' + id + '"')) els[id] = mk(id);
    } },
  };
  const nav = { userAgent: o.kakao ? 'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'
                                   : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
    maxTouchPoints: 0, onLine: true, can: true, next: 'ok', clip: 'ok', shared: [], copied: [],
    canShare: () => nav.can,
    share: (d) => { nav.shared.push(d); return nav.next === 'ok' ? Promise.resolve() : Promise.reject(Object.assign(new Error('x'), { name: nav.next })); },
    clipboard: { writeText: (t) => { nav.copied.push(t); return nav.clip === 'ok' ? Promise.resolve() : Promise.reject(new Error('x')); } } };
  const Kakao = { fail: false, upFail: false, isInitialized: () => true, init() {},
    Share: { uploadImage: () => (Kakao.upFail ? Promise.reject(new Error('x')) : Promise.resolve({ infos: { original: { url: 'https://k.kakaocdn.net/u.jpg' } } })),
             sendDefault: (t) => { if (Kakao.fail) throw new Error('x'); kakaoSent.push(t); } } };
  class File { constructor(parts, name, opt) { this.parts = parts; this.name = name; this.type = opt.type; } }
  const VERSE_SHARE_TEXT = '성경암송 앱 설치 https://gocheok.onlybible.kr/go/app/';
  const g = { document: doc, navigator: nav, File, VERSE_SHARE_TEXT, APP_BUILD: 'T', KAKAO_JS_KEY: o.kakao ? 'k' : '',
    window: { Kakao: o.kakao ? Kakao : undefined, addEventListener() {}, removeEventListener() {} },
    history: { state: null, pushState(s) { this.state = s; }, back() { this.state = null; } },
    requestAnimationFrame: () => 0, URL: { createObjectURL: () => 'blob:psh', revokeObjectURL() {} },
    setTimeout: (fn, ms) => (ms >= 1000 ? 0 : setTimeout(fn, ms)),   // 1초 넘는 타이머(20초 한도 · 6초 「안 열렸으면」)는 울리지 않는다
    clearTimeout: (t) => { if (t) clearTimeout(t); },
    prayEsc: (s) => String(s), pshDraw: () => Promise.resolve({ size: 10 }) };
  if (o.withLog !== false) g.logFeature = (...a) => { logs.push(a); };
  const S = vm.runInContext(FILL + '\n' + PURE + '\n' + DOCS + '\n' + PAN +
    '\n;({ pshState, pshKind, openPrayShare, openMedShare, openVerseShare, prayShareClose, pshSend, pshSendLink, pshCopyLink, pshDownload, pshKakaoSend })', vm.createContext(g));
  return { S, logs, downloads, kakaoSent, els, nav, Kakao, VERSE_SHARE_TEXT };
};

test('📊 이용 기록 ① 판 열기(share-open) — 새 판만(다시 쓰는 판은 안 셈) · 종류 코드 1 기도문 · 2 묵상 · 3 말씀 · 묵상 미리보기(noLog)는 안 셈 · 이름 칸 값은 안 실림 · logFeature 가 없어도', async () => {
  const md = Object.assign({}, MEDS[0], { no: 44, idx: 2 }), vv = VERSES.find((v) => String(v.text || '').trim());
  const P = usagePan();
  P.S.openPrayShare(LIST[0], '김세웅');
  assert.deepEqual(P.logs, [['share-open', 1]], '기도문 판을 새로 열었다');
  P.S.openPrayShare(LIST[0], '김세웅');   // 두 번 누름 — 열린 판을 다시 쓴다(pshReuse)
  assert.equal(P.logs.length, 1, '다시 쓰는 판은 세지 않는다');
  P.S.openMedShare(md); P.S.openMedShare(md);   // 다른 판이라 닫고 새로 · 그다음은 다시 쓰기
  P.S.openVerseShare(vv); P.S.openVerseShare(vv);
  assert.deepEqual(P.logs, [['share-open', 1], ['share-open', 2], ['share-open', 3]], '새로 연 판마다 한 번 · 종류 코드 1 · 2 · 3');
  // 관리자 묵상 미리보기(app.js showMeditationModal 의 source "preview" → openMedShare(m, { preview: true })) — 새로 열어도 · 다시 써도 남기지 않는다
  P.S.prayShareClose();
  P.S.openMedShare(md, { preview: true });
  assert.equal(P.S.pshState.noLog, true, '미리보기 판 표식');
  assert.equal(P.logs.length, 3, '미리보기 판 열기는 안 셈');
  P.S.openMedShare(md);
  assert.equal(P.S.pshState.noLog, false, '다시 쓸 때도 여는 쪽 규칙으로 덮어쓴다');
  P.S.openMedShare(md, { preview: true });
  assert.equal(P.S.pshState.noLog, true);
  assert.equal(P.logs.length, 3, '다시 쓰는 판은 미리보기가 아니어도 판 열기로 안 셈');
  P.S.openPrayShare(LIST[0], '김세웅');
  assert.equal(P.S.pshState.noLog, false, '미리보기 다음에 새로 연 기도문 판에는 표식이 없다');
  assert.deepEqual(P.logs.slice(3), [['share-open', 1]]);
  for (const a of P.logs) assert.equal(a.length, 2, '(값, 종류 코드) 둘만');
  assert.ok(!JSON.stringify(P.logs).includes('김세웅'), '이름 칸 값은 싣지 않는다');
  // pshKind — pshDoc 과 같은 가름(묵상 → 말씀 → 기도문)
  P.S.pshState.med = md; P.S.pshState.verse = vv; assert.equal(P.S.pshKind(), 2);
  P.S.pshState.med = null; assert.equal(P.S.pshKind(), 3);
  P.S.pshState.verse = null; assert.equal(P.S.pshKind(), 1);
  assert.match(PS, /function pshLog\(feature, item\) \{ if \(pshState\.noLog\) return; if \(typeof logFeature === "function"\) logFeature\(feature, item\); \}/, 'logFeature 는 typeof 뒤에서(옛 app.js · vm 에는 없다)');
  assert.ok(!/서버로 아무것도 가지 않는다/.test(PS), '머리 주석 — 이용 기록이 서버로 간다(사실대로)');
  // logFeature 가 없는 화면(옛 app.js · vm)에서도 판은 열린다
  const Q = usagePan({ withLog: false });
  assert.doesNotThrow(() => { Q.S.openPrayShare(LIST[0], '김세웅'); Q.S.openMedShare(md); Q.S.openVerseShare(vv); });
  assert.equal(Q.els.psh.dataset.kind, 'verse', '판이 떠 있다');
  await usageTick();
});
```

- [ ] **Step 2: 돌려서 실패 확인**

```bash
node --test tests/pray-share.test.cjs 2>&1 | grep -E "^# (tests|pass|fail)|^not ok"
```
기대 출력:
```
not ok 14 - 배선 — 「🌿 오늘의 묵상」 창: 문은 app.js(MED_SHARE_OPEN · 시험 참여자 먼저) · …
not ok 16 - 글 한 벌 — medShareDoc(파일 이름 · 설명 · 글꼴 받을 글자) · …
not ok 17 - 두 번 누름 — 판이 열렸다가 스스로 닫히지 않는다(…) · …
not ok 35 - 📊 이용 기록 ① 판 열기(share-open) — …
# tests 35
# pass 31
# fail 4
```
왜 실패하나:
- 14: 고친 325 정규식이 아직 없는 `function openMedShare(m, opts) {` 를 찾는다. 오류 글자는 「미리보기 판을 가르는 opts(2026-11-06 · 이용 기록)」.
- 16 · 17: `cut` 이 「function openMedShare(m, opts) { 를 못 찾았다 — 이 검사가 낡았다」로 떨어진다.
- 35: `usagePan` 이 돌려받는 이름 가운데 `pshKind` 가 아직 없어 `ReferenceError: pshKind is not defined` 가 난다.

- [ ] **Step 3: 구현** (`js/pray-share.js` — 줄 번호는 근처로만 보고, 글자로 찾는다)

A. 머리 주석(4) — 「서버로 아무것도 가지 않는다」를 사실대로 고친다.
old:
```js
//   그림은 이 폰 안에서만 만든다(캔버스) → 폰 공유 창(navigator.share files). 서버로 아무것도 가지 않는다 — 판에서 바꾼 이름도 그림에만 쓴다.
```
new:
```js
//   그림은 이 폰 안에서만 만든다(캔버스) → 폰 공유 창(navigator.share files) · 말씀 판의 「카카오톡으로 보내기」만 그림을 카카오 서버에 올린다(pshKakaoSend).
//   우리 서버로 가는 것은 이용 기록뿐이다(pshLog → app.js logFeature → feature_log: 누가 · 무엇을 눌렀나 · 종류 코드 · 그날 횟수 — 2026-11-06 설계
//   docs/superpowers/specs/2026-11-06-share-board-usage-log-design.md) · 판에서 바꾼 이름 · 글 · 받는 분 · 고른 앱은 싣지 않는다(이름은 그림에만 쓴다) ·
//   관리자 묵상 미리보기 판(pshState.noLog)은 남기지 않는다 · 어린 부서(만 14세 미만)는 app.js logFeature 가 거른다.
```

B. `pshState`(512~513) — `noLog` 를 `esc` 와 `sharing` 사이에 넣는다(173 · 240 · 660 정규식을 피한다).
old:
```js
// kakaoBusy = 지금 올리는 차례의 표(공유 창 잠금 sharing 과 따로 — 액자를 바꾸거나 판을 닫으면 버린다) · kakaoT = 「카카오톡이 안 열렸으면」 타이머
const pshState = { gen: 0, blob: null, url: null, key: "night", vkey: "", leaf: 1, b: null, name: "", med: null, verse: null, file: "", timer: null, pop: null, esc: null, sharing: false, withLink: true, linkNext: false,
```
new:
```js
// kakaoBusy = 지금 올리는 차례의 표(공유 창 잠금 sharing 과 따로 — 액자를 바꾸거나 판을 닫으면 버린다) · kakaoT = 「카카오톡이 안 열렸으면」 타이머
// noLog = 이 판에서 일어난 일을 이용 기록에 남기지 않는다(관리자 묵상 미리보기 — pshOpen 의 opts.noLog · 다시 쓰는 판은 여는 쪽이 덮어쓴다 · 2026-11-06)
const pshState = { gen: 0, blob: null, url: null, key: "night", vkey: "", leaf: 1, b: null, name: "", med: null, verse: null, file: "", timer: null, pop: null, esc: null, noLog: false, sharing: false, withLink: true, linkNext: false,
```

C. `pshDoc` 바로 아래(518). 356 정규식이 잡는 `pshDoc` 줄 자체는 그대로 둔다.
old:
```js
function pshDoc() { return pshState.med ? medShareDoc(pshState.med) : pshState.verse ? verseShareDoc(pshState.verse) : prayShareDoc(pshState.b, pshState.name); }
```
new:
```js
function pshDoc() { return pshState.med ? medShareDoc(pshState.med) : pshState.verse ? verseShareDoc(pshState.verse) : prayShareDoc(pshState.b, pshState.name); }
// 📊 이용 기록(2026-11-06 설계 docs/superpowers/specs/2026-11-06-share-board-usage-log-design.md 2-2) — 종류 코드 1 기도문 · 2 묵상 · 3 이번 주 말씀(pshDoc 과 같은 가름)
function pshKind() { return pshState.med ? 2 : pshState.verse ? 3 : 1; }
// 남기는 것은 (값, 종류 코드) 둘뿐 — 이름 칸 값(pshState.name) · 글 · 파일 이름은 넘기지 않는다 · 미리보기 판(noLog)은 남기지 않는다 ·
//   logFeature 는 app.js 것(로그인 전 · 어린 부서는 거기서 빠진다 · 60초 안 같은 값은 한 번) — 옛 app.js · vm 에는 없을 수 있어 typeof 로
function pshLog(feature, item) { if (pshState.noLog) return; if (typeof logFeature === "function") logFeature(feature, item); }
```

D. `openPrayShare` 다시 쓰는 갈래(756).
old:
```js
  if (pshReuse("pray")) { pshState.b = b; pshState.med = null; pshState.verse = null; pshRedraw(); return; }   // 단추를 두 번 눌러 또 불렸다 — 열린 판을 그대로
```
new:
```js
  if (pshReuse("pray")) { pshState.b = b; pshState.med = null; pshState.verse = null; pshState.noLog = false; pshRedraw(); return; }   // 단추를 두 번 눌러 또 불렸다 — 열린 판을 그대로
```

E. `openMedShare`(763~769). 위 주석 한 줄(「🌿 오늘의 묵상」 창이 부른다 …)은 그대로 두고, 그 아래를 바꾼다.
old:
```js
function openMedShare(m) {
  if (!m || !(m.message || m.question)) return;
  if (pshReuse("med")) { pshState.b = null; pshState.med = m; pshState.verse = null; pshRedraw(); return; }
  prayShareClose();
  pshState.b = null; pshState.med = m; pshState.verse = null; pshState.name = "";
  pshOpen(PSH_TITLE_MED, false, "", "med");
}
```
new:
```js
//   opts.preview = 관리자 묵상 미리보기(?preview=daily → app.js showMeditationModal 의 source "preview")에서 연 판 — 이 판에서 일어난 일은 이용 기록에 남기지 않는다(2026-11-06)
function openMedShare(m, opts) {
  if (!m || !(m.message || m.question)) return;
  const noLog = !!(opts && opts.preview);
  if (pshReuse("med")) { pshState.b = null; pshState.med = m; pshState.verse = null; pshState.noLog = noLog; pshRedraw(); return; }
  prayShareClose();
  pshState.b = null; pshState.med = m; pshState.verse = null; pshState.name = "";
  pshOpen(PSH_TITLE_MED, false, "", "med", { noLog });
}
```

F. `openVerseShare` 다시 쓰는 갈래(774). 470 · 471 · 472 정규식이 잡는 글자는 그대로다.
old:
```js
  if (pshReuse("verse")) { pshState.b = null; pshState.med = null; pshState.verse = v; pshRedraw(); return; }
```
new:
```js
  if (pshReuse("verse")) { pshState.b = null; pshState.med = null; pshState.verse = v; pshState.noLog = false; pshRedraw(); return; }
```

G. `pshOpen` 머리(793~794).
old:
```js
function pshOpen(title, withName, name, kind) {
  pshState.leaf = Math.min(12, 1 + Math.floor(Math.random() * 12));
```
new:
```js
function pshOpen(title, withName, name, kind, opts) {
  pshState.noLog = !!(opts && opts.noLog);   // 📊 opts.noLog = 미리보기 판(openMedShare) — 이 판에서 일어난 일은 남기지 않는다
  pshState.leaf = Math.min(12, 1 + Math.floor(Math.random() * 12));
```

H. `pshOpen` 끝(파일 맨 끝 · 860~862).
old:
```js
  window.addEventListener("popstate", pshState.pop);
  pshRedraw();
}
```
new:
```js
  window.addEventListener("popstate", pshState.pop);
  pshRedraw();
  pshLog("share-open", pshKind());   // 📊 새 판만 — 다시 쓰는 판은 여는 쪽(pshReuse)에서 돌아가 여기를 지나지 않는다
}
```
`openPrayShare` 와 `openVerseShare` 의 `pshOpen(…)` 부름은 그대로 둔다. opts 가 없으면 `noLog` 는 false 이고, 359 · 472 정규식도 그대로 통과한다.

- [ ] **Step 4: 돌려서 통과 확인**

```bash
node --check js/pray-share.js && node --test tests/pray-share.test.cjs 2>&1 | grep -E "^# (tests|pass|fail)|^not ok"
python tools/preflight.py
```
기대 출력:
```
# tests 35
# pass 35
# fail 0
```
preflight 는 [3] 에 「tests/pray-share.test.cjs — 35가지 통과」가 찍히고, 맨 끝이 「모두 통과 — 배포해도 된다.」여야 한다.

- [ ] **Step 5: 커밋**

```bash
git add -- js/pray-share.js tests/pray-share.test.cjs
git diff --cached --stat
git commit -m "feat(보내기 · 이용 기록): 판 열기 share-open — 새 판만 · 종류 1·2·3 · 묵상 미리보기 판은 안 남김(pshState.noLog) · pshKind · pshLog(typeof 지킴이) · 머리 주석 사실대로" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git show --stat HEAD
```
`diff --cached` 와 `show --stat` 에는 두 파일만 보여야 한다.

---

### Task 7: 카톡 · 공유 창 · 내려받기 · 설치 주소(share-kakao · share-sheet · share-save)

**Files:**
- Modify `js/pray-share.js` — Task 6 이 이 자리 앞에 9줄을 더했다(머리 주석 +3 · `pshState` 주석 +1 · `pshKind`/`pshLog` +5). 아래는 Task 6 이 끝난 파일 기준이다. A · B 가 한 줄씩 더하므로 그 뒤 자리는 한두 줄 더 밀린다 — 글자로 찾는다.
  - 568~569: `pshDownload`(`a.click()` 줄 · `pshSay` 줄)
  - 585~586: `pshSend` 의 `sharing = true` · then
  - 610: `pshSendLink` then
  - 624: `pshCopyLink` writeText
  - 709: `pshKakaoGo` catch 줄(그 다음 줄에 넣는다)
- Test `tests/pray-share.test.cjs`(Task 6 은 이 자리 앞에서 줄 수를 바꾸지 않았다):
  - 221 · 228 · 232: 정규식
  - 693 · 711 · 728 · 826: 카카오 vm 시험
  - Task 6 시험 ① 뒤(그 시험 끝 `});` 다음): 시험 ②

**Interfaces:**
- Consumes:
  - Task 6: `pshLog(feature, item)` · `pshKind()` · `pshState.noLog` · `PAN` · `usageTick()` · `usagePan(o)`.
  - 구역 1 서버 `const USAGE_FEATURES = new Set(["board", "share-open", "share-kakao", "share-sheet", "share-save"])`(`supabase/functions/api/index.ts` · `FEATURES`(1914 근처) 바로 아래).
  - 구역 2 화면 `const USAGE_FEATURES = new Set(["board", "share-open", "share-kakao", "share-sheet", "share-save"])`(`app.js` · `logFeature` 바로 위).
  - 두 `USAGE_FEATURES` 는 시험 ⓕ 가 글자로 읽는다. 두 구역이 이 Task 보다 먼저 worktree 에 들어와 있어야 한다(Step 1 의 첫 확인).
  - 이름 표: 값 `share-kakao` · `share-sheet` · `share-save` · 종류 코드 3 · 8.
- Produces: 기록 자리
  - `share-kakao` 3
  - `share-sheet` 1 · 2 · 3 · 8
  - `share-save` 1 · 2 · 3 · 8
  - 구역 1 `featureUsage` 와 교회 어드민 「📤 보내기 · 💬 게시판」 탭이 이 값을 읽는다.

- [ ] **Step 1: 실패하는 시험 쓰기**

먼저 구역 1 · 2 가 들어와 있는지 본다.
```bash
grep -cF 'const USAGE_FEATURES = new Set([' app.js supabase/functions/api/index.ts
```
기대 출력: `app.js:1` · `supabase/functions/api/index.ts:1`. 하나라도 `:0` 이면 멈추고 구역 1 · 2 를 먼저 들인다. 그대로 가면 Step 4 에서 시험 ② 가 「USAGE_FEATURES(서버 index.ts · 화면 app.js)를 못 찾았다 — 구역 1 · 2 가 먼저 들어와 있어야 한다」로 떨어진다(36 중 35 통과).

① 221 — `pshSend` then 몸.
old:
```js
  assert.match(send, /navigator\.share\(data\)\.then\(\(\) => \{ if \(pshState\.verse && pshState\.withLink\) pshLinkNext\(\); \}\)/, '말씀 판 · 체크가 켜져 있으면 그림 다음 차례는 설치 주소');
```
new:
```js
  assert.match(send, /navigator\.share\(data\)\.then\(\(\) => \{ pshLog\("share-sheet", pshKind\(\)\); if \(pshState\.verse && pshState\.withLink\) pshLinkNext\(\); \}\)/, '앱을 골랐다(resolve)에만 share-sheet · 말씀 판 · 체크가 켜져 있으면 그림 다음 차례는 설치 주소');
```

② 228 — 복사 then.
old:
```js
  assert.match(cut(PS, 'function pshCopyLink() {', '\n}\n'), /navigator\.clipboard\.writeText\(VERSE_SHARE_TEXT\)\.then\(\(\) => pshSay\("설치 주소를 복사했어요\./, '복사가 된 뒤에만 「복사했어요」');
```
new:
```js
  assert.match(cut(PS, 'function pshCopyLink() {', '\n}\n'), /navigator\.clipboard\.writeText\(VERSE_SHARE_TEXT\)\.then\(\(\) => \{ pshLog\("share-save", 8\); pshSay\("설치 주소를 복사했어요\./, '복사가 된 뒤에만 「복사했어요」 · share-save 8');
```

③ 232 — `pshSendLink` then 몸.
old:
```js
  assert.match(link, /navigator\.share\(data\)\.then\(\(\) => \{ pshLinkDone\(\); pshSay\(""\); \}\)/, '보낸 뒤 단추는 다시 「그림 보내기」');
```
new:
```js
  assert.match(link, /navigator\.share\(data\)\.then\(\(\) => \{ pshLog\("share-sheet", 8\); pshLinkDone\(\); pshSay\(""\); \}\)/, '보낸 뒤 단추는 다시 「그림 보내기」 · 설치 주소는 share-sheet 8');
```

④ 693 — 카카오 vm 시험(KB 조각 「// 📖 카카오톡으로 보내기(」~「function prayShareClose(」만 싣는다). 진짜 `pshLog` 는 판 머리(`pshDoc` 아래)에 있어 이 문맥에 없다. 그래서 가짜를 넣고, 부른 것을 적는다.
old:
```js
  const said = [], scripts = [], ups = [], sent = [];
```
new:
```js
  const said = [], scripts = [], ups = [], sent = [], logged = [];   // logged = pshLog 가 받은 것(📊 이용 기록 — 진짜 pshLog 는 판 머리에 있어 KB 에 안 실린다)
```

⑤ 711.
old:
```js
    VERSE_KICKER: '이번 주 말씀', pshSay: (t) => said.push(t), pshKeyGet: () => frame,
```
new:
```js
    VERSE_KICKER: '이번 주 말씀', pshSay: (t) => said.push(t), pshKeyGet: () => frame, pshLog: (f, i) => logged.push([f, i]),
```

⑥ 728 — 첫 카드를 보낸 바로 뒤(이 글자는 파일에 한 번뿐이다).
old:
```js
  assert.equal(sent.length, 1);
```
new:
```js
  assert.equal(sent.length, 1);
  assert.deepEqual(logged, [['share-kakao', 3]], '카카오톡을 열었다 — sendDefault 가 던지지 않은 다음 줄에서 한 번(📊 이용 기록)');
```

⑦ 826 — 「그림이 없으면」 앞.
old:
```js
  // 그림이 없으면(그리는 중) 노란 단추를 잠근다
```
new:
```js
  // 📊 카카오톡을 연 만큼만 남는다 — 던짐 · 끊긴 통신 · 올리기 실패 · 늦게 온 옛 결과는 안 셈
  assert.equal(logged.length, sent.length, '카카오톡 열기 = sendDefault 가 끝난 횟수');
  assert.ok(logged.every((a) => a[0] === 'share-kakao' && a[1] === 3), '값 share-kakao · 종류 3(이번 주 말씀)');
  // 그림이 없으면(그리는 중) 노란 단추를 잠근다
```

⑧ Task 6 시험 ① 의 끝 줄 뒤에 붙인다.
old:
```js
  assert.equal(Q.els.psh.dataset.kind, 'verse', '판이 떠 있다');
  await usageTick();
});
```
new:
```js
  assert.equal(Q.els.psh.dataset.kind, 'verse', '판이 떠 있다');
  await usageTick();
});

test('📊 이용 기록 ② 보내기(share-kakao · share-sheet · share-save) — 카톡은 sendDefault 다음 줄에서만 · 공유 창은 resolve 만(닫음 · 이미 떠 있음은 안 셈) · 내려받기 · 설치 주소 보내기 · 복사 · 미리보기는 하나도 · 이름 칸 값은 안 실림 · logFeature 가 없어도', async () => {
  const md = Object.assign({}, MEDS[0], { no: 44, idx: 2 }), vv = VERSES.find((v) => String(v.text || '').trim());
  // ⓐ 기도문 — 공유 창 · 닫음 · 실패하면 내려받기
  const P = usagePan();
  const acts = () => P.logs.filter((a) => a[0] !== 'share-open');
  P.S.openPrayShare(LIST[0], '김세웅'); await usageTick();
  assert.ok(P.S.pshState.blob, '그림이 준비됐다(가짜 pshDraw)');
  P.S.pshSend(); await usageTick();
  assert.deepEqual(acts(), [['share-sheet', 1]], '공유 창에서 앱을 골랐다(resolve) — 보냈는지는 모른다');
  P.nav.next = 'AbortError'; P.S.pshSend(); await usageTick();
  P.nav.next = 'InvalidStateError'; P.S.pshSend(); await usageTick();
  assert.equal(acts().length, 1, '닫음(AbortError) · 이미 떠 있음(InvalidStateError)은 안 셈');
  assert.deepEqual(P.downloads, [], '닫았으면 내려받기로 가지 않는다(그대로)');
  P.nav.next = 'NotAllowedError'; P.S.pshSend(); await usageTick();
  assert.deepEqual(acts().slice(1), [['share-save', 1]], '공유 창이 실패해 내려받기를 시작했다');
  assert.deepEqual(P.downloads, ['blessing-' + LIST[0].no + '.jpg']);
  P.nav.can = false; P.S.pshSend(); await usageTick(); P.nav.can = true;
  assert.deepEqual(acts().slice(2), [['share-save', 1]], '공유 창이 없는 기기 — 곧바로 내려받기');
  // ⓑ 묵상 — 종류 2
  P.nav.next = 'ok';
  P.S.openMedShare(md); await usageTick();
  P.S.pshSend(); await usageTick();
  assert.deepEqual(acts().slice(3), [['share-sheet', 2]], '묵상 그림');
  // ⓒ 이번 주 말씀(공유 창 길 — 카카오 단추가 없는 기기) — 그림 3 · 이어서 설치 주소 8
  P.S.openVerseShare(vv); await usageTick();
  P.S.pshSend(); await usageTick();
  assert.deepEqual(acts().slice(4), [['share-sheet', 3]], '말씀 그림');
  assert.equal(P.S.pshState.linkNext, true, '그림 다음 차례는 설치 주소(그대로)');
  P.S.pshSend(); await usageTick();
  assert.deepEqual(acts().slice(5), [['share-sheet', 8]], '설치 주소를 공유 창으로');
  assert.deepEqual(JSON.parse(JSON.stringify(P.nav.shared[P.nav.shared.length - 1])), { text: P.VERSE_SHARE_TEXT }, '설치 주소는 글만(그대로)');
  P.nav.next = 'AbortError'; P.S.pshSendLink(); await usageTick();
  assert.equal(acts().length, 6, '설치 주소 공유 창을 닫았다 — 안 셈');
  assert.deepEqual(P.nav.copied, [], '닫았으면 복사로 가지 않는다(그대로)');
  P.nav.next = 'NotAllowedError'; P.S.pshSendLink(); await usageTick();
  assert.deepEqual(acts().slice(6), [['share-save', 8]], '공유 창이 실패해 복사했다(writeText resolve)');
  P.nav.clip = 'fail'; P.S.pshCopyLink(); await usageTick();
  assert.equal(acts().length, 7, '복사를 못 했으면 안 셈(주소를 눈으로 옮겨 적게 할 뿐)');
  const cb = P.nav.clipboard; P.nav.clipboard = undefined; P.S.pshCopyLink(); await usageTick(); P.nav.clipboard = cb;
  assert.equal(acts().length, 7, '복사 길이 없는 기기 — 안 셈');
  // ⓓ 카카오톡(말씀 판 · 키 · 카톡 앱 기기) — sendDefault 가 던지지 않은 다음 줄에서만 · 첫 누름 · 늦게 뜬 「카카오톡 열기」 모두
  const K = usagePan({ kakao: true });
  K.S.openVerseShare(vv); await usageTick();
  assert.ok(K.els['psh-kakao'], '카카오 단추가 있다');
  K.S.pshKakaoSend(); await usageTick();
  assert.equal(K.kakaoSent.length, 1);
  assert.deepEqual(K.logs, [['share-open', 3], ['share-kakao', 3]], '카카오톡을 열었다(보냈는지는 모른다)');
  K.S.pshState.kakaoReady = 'https://k.kakaocdn.net/late.jpg'; K.S.pshKakaoSend();
  assert.equal(K.kakaoSent.length, 2); assert.deepEqual(K.logs.slice(2), [['share-kakao', 3]], '늦게 뜬 「카카오톡 열기」도 같은 자리');
  K.Kakao.fail = true; K.S.pshKakaoSend(); await usageTick(); K.Kakao.fail = false;
  assert.equal(K.logs.length, 3, 'SDK 가 던지면 안 셈');
  K.nav.onLine = false; K.S.pshKakaoSend(); await usageTick(); K.nav.onLine = true;
  assert.equal(K.logs.length, 3, '끊긴 통신이면 부르지도 · 세지도 않는다');
  K.Kakao.upFail = true; K.S.pshState.blob = { size: 77 }; K.S.pshKakaoSend(); await usageTick(); K.Kakao.upFail = false;
  assert.equal(K.logs.length, 3, '그림 올리기에 실패하면 안 셈');
  assert.equal(K.kakaoSent.length, 2);
  // ⓔ 관리자 묵상 미리보기 — 판에서 일어난 일을 하나도 남기지 않는다(내려받기는 그대로 된다)
  const V = usagePan();
  V.S.openMedShare(md, { preview: true }); await usageTick();
  V.S.pshSend(); await usageTick();
  V.nav.next = 'NotAllowedError'; V.S.pshSend(); await usageTick();
  V.S.pshDownload();
  assert.equal(V.downloads.length, 2, '미리보기에서도 내려받기는 된다');
  assert.deepEqual(V.logs, [], '미리보기 판은 열기 · 공유 창 · 내려받기 모두 안 셈');
  // ⓕ 무엇을 싣나 — (값, 종류 코드) 둘뿐 · 이름 칸 값은 어디에도 없다 · 값은 이름 표의 넷
  for (const a of [...P.logs, ...K.logs]) { assert.equal(a.length, 2, '(값, 종류 코드) 둘만'); assert.ok([1, 2, 3, 8].includes(a[1]), a.join(':')); }
  assert.ok(!JSON.stringify([P.logs, K.logs]).includes('김세웅'), '이름 칸 값은 싣지 않는다');
  const calls = [...PS.matchAll(/\bpshLog\("([a-z-]+)", (pshKind\(\)|\d)\)/g)];
  assert.equal(calls.length, (PS.match(/\bpshLog\(/g) || []).length - 1, 'pshLog 는 늘 (글자 그대로의 값, pshKind() 또는 숫자 하나) — 이름 · 글을 넘기는 부름이 없다');
  const vals = [...new Set(calls.map((m) => m[1]))].sort();
  assert.deepEqual(vals, ['share-kakao', 'share-open', 'share-save', 'share-sheet']);
  // 이름 표(구역 1 서버 · 구역 2 화면) — 서버가 받는 값 · 화면이 어린 부서를 거르는 값에 다 있다(없으면 서버가 조용히 버리거나 · 어린 부서가 남는다)
  const svr = /const USAGE_FEATURES = new Set\(\[([^\]]*)\]\)/.exec(read('supabase', 'functions', 'api', 'index.ts'));
  const scr = /const USAGE_FEATURES = new Set\(\[([^\]]*)\]\)/.exec(APP);
  assert.ok(svr && scr, 'USAGE_FEATURES(서버 index.ts · 화면 app.js)를 못 찾았다 — 구역 1 · 2 가 먼저 들어와 있어야 한다');
  for (const [m, where] of [[svr, '서버'], [scr, '화면']]) {
    const set = [...m[1].matchAll(/"([a-z-]+)"/g)].map((x) => x[1]);
    for (const f of vals) assert.ok(set.includes(f), f + ' 가 ' + where + ' USAGE_FEATURES 에 없다');
  }
  // ⓖ logFeature 가 없는 화면(옛 app.js · vm)에서도 보내기 길이 죽지 않는다 — 기록이 넘어져 내려받기 · 복사로 새지도 않는다
  const Q = usagePan({ withLog: false, kakao: true });
  Q.S.openVerseShare(vv); await usageTick();
  Q.S.pshKakaoSend(); await usageTick();
  assert.equal(Q.kakaoSent.length, 1, '카카오톡은 열린다');
  Q.S.pshState.kakaoReady = 'https://k.kakaocdn.net/late.jpg';
  assert.doesNotThrow(() => Q.S.pshKakaoSend());
  assert.equal(Q.kakaoSent.length, 2);
  Q.S.pshSend(); await usageTick();
  assert.deepEqual(Q.downloads, [], '공유 창 resolve 뒤 기록이 넘어져 내려받기로 새지 않는다');
  Q.S.pshSend(); await usageTick();
  assert.deepEqual(Q.nav.copied, [], '설치 주소 resolve 뒤 기록이 넘어져 복사로 새지 않는다');
  Q.S.pshCopyLink(); await usageTick();
  assert.equal(Q.nav.copied.length, 1);
  assert.doesNotThrow(() => Q.S.pshDownload());
  assert.equal(Q.downloads.length, 1);
});
```

- [ ] **Step 2: 돌려서 실패 확인**

```bash
node --test tests/pray-share.test.cjs 2>&1 | grep -E "^# (tests|pass|fail)|^not ok"
```
기대 출력:
```
not ok 10 - 배선 — 지연 모듈(LAZY_JS.prayShare · index.html 에 없음) · 단추는 문 안에만 · 보내기는 미리 만든 Blob 으로
not ok 30 - 카카오톡으로 보내기 — SDK 한 번만 · 그림 올리고 카드 · …
not ok 36 - 📊 이용 기록 ② 보내기(share-kakao · share-sheet · share-save) — …
# tests 36
# pass 33
# fail 3
```
왜 실패하나:
- 10: 고친 221 정규식이 아직 없는 `pshLog("share-sheet", pshKind())` 를 찾는다. 오류 글자는 「앱을 골랐다(resolve)에만 share-sheet · …」. 228 · 232 도 같은 시험 안에 있다(221 에서 먼저 멈춘다).
- 30: `deepEqual(logged, [['share-kakao', 3]])` 인데 실제는 `[]` 다. `pshKakaoGo` 가 아직 `pshLog` 를 부르지 않는다.
- 36: ⓐ 첫 `deepEqual(acts(), [['share-sheet', 1]])` 인데 실제는 `[]` 다.

- [ ] **Step 3: 구현** (`js/pray-share.js` — 줄 번호는 Task 6 이 끝난 파일 기준 · 글자로 찾는다)

A. `pshDownload`(568~569).
old:
```js
  document.body.appendChild(a); a.click(); a.remove();
  pshSay("그림 파일 내려받기를 시작했어요.");   // 되었는지는 알 수 없다 — 「시작했어요」까지만(교육 수료증과 같은 말)
```
new:
```js
  document.body.appendChild(a); a.click(); a.remove();
  pshLog("share-save", pshKind());   // 📊 내려받기를 시작했다(되었는지는 모른다 — 아래 말과 같다)
  pshSay("그림 파일 내려받기를 시작했어요.");   // 되었는지는 알 수 없다 — 「시작했어요」까지만(교육 수료증과 같은 말)
```

B. `pshSend` then(585~586 · A 뒤라 586~587). catch 의 AbortError · InvalidStateError 갈래(379 정규식)는 그대로 둔다.
old:
```js
    pshState.sharing = true;
    navigator.share(data).then(() => { if (pshState.verse && pshState.withLink) pshLinkNext(); }).catch((err) => {
```
new:
```js
    pshState.sharing = true;
    // 📊 공유 창에서 앱을 골랐다(resolve)에만 share-sheet — 보냈는지는 모른다 · 닫음(AbortError) · 이미 떠 있음(InvalidStateError)은 세지 않는다
    navigator.share(data).then(() => { pshLog("share-sheet", pshKind()); if (pshState.verse && pshState.withLink) pshLinkNext(); }).catch((err) => {
```

C. `pshSendLink` then(610 · A · B 뒤라 612).
old:
```js
    navigator.share(data).then(() => { pshLinkDone(); pshSay(""); }).catch((err) => {
```
new:
```js
    navigator.share(data).then(() => { pshLog("share-sheet", 8); pshLinkDone(); pshSay(""); }).catch((err) => {   // 📊 8 = 앱 설치 주소
```

D. `pshCopyLink` 복사 성공(624 · 앞 고침 뒤라 626). 실패 갈래 `say` 는 남기지 않는다.
old:
```js
      navigator.clipboard.writeText(VERSE_SHARE_TEXT).then(() => pshSay("설치 주소를 복사했어요. 대화방에 붙여 넣어 주세요."), say);
```
new:
```js
      navigator.clipboard.writeText(VERSE_SHARE_TEXT).then(() => { pshLog("share-save", 8); pshSay("설치 주소를 복사했어요. 대화방에 붙여 넣어 주세요."); }, say);   // 📊 복사가 끝났을 때만
```

E. `pshKakaoGo`(709 · 앞 고침 뒤라 711). `sendDefault` 의 try/catch 다음 줄에 둔다. try 안에 넣으면 기록이 던졌을 때 「카카오톡을 열지 못했어요」 갈래로 샌다.
old:
```js
  catch (e) { pshKakaoFallback("카카오톡을 열지 못했어요. 아래 「문자 · 다른 앱으로 보내기」로 보내 주세요."); return; }
```
new:
```js
  catch (e) { pshKakaoFallback("카카오톡을 열지 못했어요. 아래 「문자 · 다른 앱으로 보내기」로 보내 주세요."); return; }
  pshLog("share-kakao", 3);   // 📊 sendDefault 가 던지지 않았다 = 카카오톡을 열었다(보냈는지는 모른다 · 첫 누름 · 늦게 뜬 「카카오톡 열기」 둘 다 여기)
```

`pshKakaoSend` · `pshLinkNext` 는 고치지 않는다. 첫 누름(올린 뒤 `pshKakaoGo(url)`)과 늦게 뜬 「카카오톡 열기」(`pshKakaoGo(u)`) 모두 E 를 지난다.

- [ ] **Step 4: 돌려서 통과 확인**

```bash
node --check js/pray-share.js && node --test tests/pray-share.test.cjs 2>&1 | grep -E "^# (tests|pass|fail)|^not ok"
python tools/preflight.py
```
기대 출력:
```
# tests 36
# pass 36
# fail 0
```
preflight 는 [3] 에 「tests/pray-share.test.cjs — 36가지 통과」가 찍히고, 맨 끝이 「모두 통과 — 배포해도 된다.」여야 한다.

- [ ] **Step 5: 커밋**

```bash
git add -- js/pray-share.js tests/pray-share.test.cjs
git diff --cached --stat
git commit -m "feat(보내기 · 이용 기록): 카톡 share-kakao 3 · 공유 창 share-sheet(resolve 만) · 내려받기 · 복사 share-save · 설치 주소 8 — 닫음 · 미리보기는 안 셈 · 이름 칸 값은 안 실음" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git show --stat HEAD
```
`diff --cached` 와 `show --stat` 에는 두 파일만 보여야 한다.

---

## 구역 4 — 개인정보 안내 세 자리 · 스토어 메모 (Task 8~9)

| 파일 | 맡은 일 |
|---|---|
| `privacy/index.html` | 1항 「열람 기록」 줄에 게시판과 「누가(이름·소속)」를 넣고, 그 아래 새 줄 「보내기 기록」 · 3항 보관 · 4항 누가 보나(첫 `</ul>` 안) · 5항 지워지는 것 · 6항 어린이 한 줄 · 「마지막 수정」 2026년 11월 6일 |
| `app.js` `renderPrivacyInfo` | 열람 기록 li 고침 · 새 li 「보내기 기록」 · 이용 목적 「기능이 쓰이는지 살펴 앱을 고치는 일」 |
| `app.js` `renderHelp` 🔒 | 「그 밖에 남는 것」 안의 열람 기록 마디 · 새 마디 「보내기 기록」 · 「공개 범위」 |
| `tests/store-review.test.cjs` | `PRIVACY_ITEMS` 에 「보내기 기록」 · 5항 목록 · 새 시험 셋(열람 기록 줄의 게시판 · 보내기 기록 세 자리 · 3·4·6항과 날짜) |
| `tests/pray-share.test.cjs` | 857줄 날짜 검사만 손본다. `마지막 수정: 2026년 11월 5일` 을 글자 그대로 잡고 있어서, 날짜를 올리면 깨진다 |
| `자료/store/README.md` | 플레이 데이터 보안 5절 「앱 상호작용」 줄의 「무엇」 칸 · 판단 한 줄 · 아이폰 App Privacy 확인 줄 |

**그대로 두는 자리(고치지 않는다 · 새 문장 때문에 이 자리들이 거짓이 되지 않는지 확인했다)**

| 자리 | 까닭 |
|---|---|
| `privacy/index.html` 61줄 「아래에 적은 것 외에는 모으지 않습니다」 | 같은 판에 1항 새 줄이 들어가므로 계속 참이다. 그래서 **Task 8 커밋은 구역 2·3(앱 기록)과 같은 bump 로 나간다.** 따로 먼저 푸시하지 않는다. api(구역 1)는 그보다 먼저 운영에 반영한다(설계 3절) |
| 2항 카카오 줄 · `renderPrivacyInfo` 「「이번 주 말씀」 카카오톡으로 보내기」 절 · `renderHelp` 「저장·용도」 li 의 카카오 문장 | `tests/pray-share.test.cjs` 853~856 정규식이 잡고 있다. 카카오로 가는 그림 이야기라 계속 참이다 |
| 로그인 화면 동의 문장(`app.js` 2824~2825 「게시판·알림·이벤트 등을 쓰실 때 더 모으는 것과 … 「자세히 보기」에 있습니다」) | 「자세히 보기」 = `renderPrivacyInfo` 에 새 li 가 들어가므로 참이다 |
| `renderPrivacyInfo` 「보관 기간」(「암송 프로그램 운영 기간 동안 보관하며 …」) | 새 기록도 그대로 덮는다(`supabase/feature_log.sql:59` `user_id uuid not null references public.users(id) on delete cascade`) |
| `자료/store/data-safety-play-2026-10-03.csv` | 답 칸만 있는 파일이다. 「앱 상호작용」의 수집 · 필수 · 목적 답이 그대로이므로 고칠 칸이 없다 |

**어린 부서 한 줄을 둔 곳(이 구역에서 정한 것):** 1항 「보내기 기록」 줄의 마지막 문장 · 6항 둘째 li 뒤의 새 li(「위 부서로 쓰시는 분은 …」 — 6항 첫 li 의 부서 목록 = `needsGuardian` 과 같은 부서이고, `tests/store-review.test.cjs` 114 가 이를 지킨다) · 앱 안 두 곳(보내기 li 의 small · 보내기 마디의 괄호). 낱말은 세 자리 모두 「게시판을 여신 기록과 보내기 기록을 남기지 않…」으로 맞췄다. 그래야 시험이 한 줄로 본다.

**줄 끝:** git 색인에는 여섯 파일 모두 LF 로 들어 있다. 그런데 `core.autocrlf=true` 가 `~/.gitconfig` 에 있어서, 손으로 만든 worktree(`C:\Projects\wt-usage`)에서는 `app.js` · `privacy/index.html` · `tests/store-review.test.cjs` · `tests/pray-share.test.cjs` · `tests/board-report.test.cjs` · `tests/event-auto.test.cjs` · `자료/store/README.md` 가 **모두 CRLF 로 풀린다**. 공용 체크아웃에서 `pray-share`·`event-auto` 만 LF 인 것은 나중에 다시 쓴 파일이라서다. 어느 쪽이든 고칠 때는 Edit 도구를 쓴다. sed·heredoc 로 붙이면 줄 끝이 섞인다. 커밋할 때는 autocrlf 가 LF 로 되돌려 넣는다. 시험은 두 줄 끝 모두에서 통과한다. pray-share 의 `read` 는 `\r\n` 을 `\n` 으로 바꾸고, store-review 의 `textOf` 는 빈칸을 하나로 줄이기 때문이다.

**확인해 둔 것(검증자 · 2026-11-06):** 스크래치 사본(지금 main 작업 트리의 글 파일 557개 + `img/share`)에 대어 돌려 봤다.
- 아래 17곳의 old 글자는 모두 그 파일에 **꼭 한 번** 있었다(privacy 6 · app.js 4 · 시험 4 · README 3).
- 시험만 바꿨을 때: store-review `# tests 35 · # pass 30 · # fail 5`. 떨어진 것은 Step 2 의 다섯이고, 번호와 오류 글자도 그대로 같았다. pray-share 는 34/34.
- 문장까지 바꿨을 때: store-review 35/35 · event-auto 14/14 · board-report 14/14 · pray-share 34/34 · navi 13/13 · `node --check app.js` 통과.
- 모든 글 파일을 CRLF 로 바꾼 사본(새 worktree 와 같은 꼴)에서도 위 다섯이 같은 수로 통과했다.
- README 확인 명령(Task 9): 고치기 전 `0 0 0`, 고친 뒤 `1 1 1`.

---

### Task 8: 개인정보 안내 세 자리 — 게시판 열람 · 보내기 기록

**Files:**
- Modify: `privacy/index.html` — 1항 표 「열람 기록」 `<tr>`(171~177) · 3항 셋째 `<p>`(268) · 4항 마지막 li(296) · 5항 「지워지는 것」(348) · 6항 둘째 li 뒤(376) · footer(394)
- Modify: `app.js` — `renderPrivacyInfo` 수집 항목의 열람 기록 li(지금 main 10304) · 이용 목적(10328) / `renderHelp` 🔒 「그 밖에 남는 것」(10986) · 「공개 범위」(10988). 구역 2·3 이 `app.js` 앞쪽(logFeature 4212 · renderBoard 4795 · shareLink 9356 · 묵상 창 9765~10050 근처)을 먼저 고치므로 줄 번호는 밀려 있다. **글자로 찾는다.**
- Test: `tests/store-review.test.cjs`(372 `PRIVACY_ITEMS` 첫 줄 · 408 「2026-10-01 검토 F3」 주석 줄 앞 · 446 5항 목록) · `tests/pray-share.test.cjs`(857) · 돌리기만: `tests/event-auto.test.cjs`(⑪ 338~352) · `tests/board-report.test.cjs`(88~124)
- 새 시험 파일은 없다. 두 파일 모두 이미 `tools/preflight.py` `PURE_TESTS` 에 들어 있다(`PURE_TESTS += ["tests/store-review.test.cjs"]` 108줄 · `PURE_TESTS += ["tests/pray-share.test.cjs"]` 167줄).

**Interfaces:**
- Consumes:
  - 값 다섯 `board` · `share-open` · `share-kakao` · `share-sheet` · `share-save` 와 종류 코드 1~9. 문장의 「무엇」 목록은 가정 축복 기도문 · 오늘의 묵상 · 이번 주 말씀 · 앱 소개 · 외운 말씀 · 교육 수료증 · 앱 설치 주소이고, 「등」이 4 가을 동행 안내 · 9 이번 주 말씀 주소를 덮는다
  - 「어린이 부서 … 남기지 않」 문장을 받쳐 주는 것: `needsGuardian` — 구역 1 서버 `featureLog` 의 `skipped: "guardian"` 과 구역 2 `logFeature` 의 `USAGE_FEATURES.has(feature) && needsGuardian(loadUser())`
  - 「운영진(총괄 관리자·성경암송 담당자)만」을 받쳐 주는 것: `featureUsage` 가 관리자 전용이다(`INTERNAL_ADMIN_OK` · 교회 어드민 `ACTION_ROLES` `featureUsage: "memorizeadmin"`). 성경암송 관리자 암호로 부르는 길은 `adminError` 가 총괄만 통과시킨다(`supabase/functions/api/_shared.ts:36~44`)
  - 1항 「합계와 함께 누가(이름·소속) 여셨는지도」가 게시판 밖 열람 기록에도 참인 근거: 가정 축복 기도문 열람도 이미 이름으로 본다(church-admin `supabase/functions/church-admin/authz.ts:83` `blessingUsage: "memorizeadmin"`)
  - 3항 「계정을 지우면 함께 지워집니다」의 근거: `supabase/feature_log.sql:59` `on delete cascade`
  - 「기도문 판에 적으신 이름은 남지 않습니다」의 근거: `pshLog` 가 `pshState.name` 을 싣지 않는다
  - 시험 도우미(이미 있음): `privacySpots()` · `textOf` · `cut` · `PRIVACY` · `APP`(store-review) / `P` · `read`(pray-share 852 · 11)
- Produces:
  - store-review 시험 이름 셋: 「개인정보 — 「열람 기록」 줄에 게시판이 있다(…)」 · 「개인정보 — 보내기 기록: …」 · 「개인정보 — privacy/ 3항 · 4항 · 6항이 보내기 기록을 말하고, 마지막 수정이 2026-11-06 뒤다」
  - `PRIVACY_ITEMS` 키 `'보내기 기록(2026-11-06 — 보내기 판 · 카카오톡 열기 · 공유 창 · 내려받기·복사)'`
  - 방침 낱말 「보내기 기록」 · 「열람 기록(게시판 포함)」 · 「성경암송 담당자」. 교회 어드민 `privacy.html` 한 줄과 Task 9 가 같은 낱말을 쓴다. 성도님께 보이는 앱 방침은 4항의 기존 꼴(「사역신청 담당자·총괄 관리자」 · 「그 강좌 담당자·총괄 관리자」)을 따라 「성경암송 담당자」로 쓴다. 교회 어드민 안의 역할 이름은 「성경암송 관리」다(church-admin `supabase/sql/018_memorizeadmin_role.sql:9`)

**지킬 것:** 푸시하기 전에 스토어 심사 중인 판이 없는지 다시 본다(copy-truth ③). 설계에는 「11/06 심사 중 없음」으로 되어 있다. 그 사이 아이폰 1.1.3 이 심사에 들어갔으면 친구에게 묻는다.

- [ ] **Step 1: 실패하는 시험 쓰기**

`tests/store-review.test.cjs` — ① `PRIVACY_ITEMS` 첫 줄(372) 아래에 한 줄을 더한다.

old:
```js
  '열람 기록': ['열람 기록'],
```
new:
```js
  '열람 기록': ['열람 기록'],
  '보내기 기록(2026-11-06 — 보내기 판 · 카카오톡 열기 · 공유 창 · 내려받기·복사)': ['보내기 기록'],
```

② 5항 목록(446):

old:
```js
    '질문 기록', 'AI 답 알림', '열람 기록', '이벤트 신청', '사역 신청', '보호자 확인', '알림 등록 정보', '성경필사']) {
```
new:
```js
    '질문 기록', 'AI 답 알림', '열람 기록', '보내기 기록', '이벤트 신청', '사역 신청', '보호자 확인', '알림 등록 정보', '성경필사']) {
```

③ 새 시험 셋의 자리: 시험 「개인정보 — 새로 모으는 것 · 유튜브 문구가 …」이 끝나는 `});`(406)와 빈 줄(407) 뒤, 주석 `// 2026-10-01 검토 F3 — 서버가 바깥으로 부르는 주소가 …`(408) 바로 앞이다. 주석 줄을 old 로 잡는다.

old:
```js
// 2026-10-01 검토 F3 — 서버가 바깥으로 부르는 주소가 방침 2항 「아래 서비스가 기능 수행에 관여」 표에 다 있는가.
```
new:
```js
// 2026-11-06 — 게시판을 연 날·횟수(feature_log 값 board)도 열람 기록이다. 세 자리의 「열람 기록」 줄이 게시판을 말하는가.
//   privacy/ 는 1항 표의 그 <tr> · renderPrivacyInfo 는 그 <li> · renderHelp 🔒 는 「그 밖에 남는 것」 <li> 안의 그 마디(쉼표 사이).
test('개인정보 — 「열람 기록」 줄에 게시판이 있다(privacy/ 1항 표 · renderPrivacyInfo · renderHelp 🔒)', () => {
  const spots = privacySpots();
  const items = (raw, re) => [...raw.matchAll(re)].map((x) => textOf(x[0]).trim());
  const p1 = cut(spots['privacy/index.html'], '<h2>1. 무엇을 모으나</h2>', '<h2>2. 어디에 보관하나</h2>', 'privacy/index.html');
  const row = items(p1, /<tr>[\s\S]*?<\/tr>/g).find((t) => t.startsWith('열람 기록'));
  const li = items(spots['renderPrivacyInfo'], /<li>[\s\S]*?<\/li>/g).find((t) => t.startsWith('열람 기록'));
  const other = items(spots['renderHelp 🔒'], /<li>[\s\S]*?<\/li>/g).find((t) => t.startsWith('그 밖에 남는 것'));
  const clause = other && other.split(', ').find((c) => c.includes('열람 기록'));
  for (const [where, t] of [['privacy/ 1항 표', row], ['renderPrivacyInfo', li], ['renderHelp 🔒 「그 밖에 남는 것」', clause]]) {
    assert.ok(t, where + ' 에서 「열람 기록」 줄을 못 찾았다 — 이 검사가 낡았다');
    assert.ok(t.includes('게시판'), where + ' 의 열람 기록 줄에 게시판이 없다: ' + t);
  }
});

// 2026-11-06 — 보내기 기록(feature_log 값 share-open · share-kakao · share-sheet · share-save). 「보냈다」는 어느 길로도 알 수 없다(설계 2-1 —
//   카카오는 결과를 돌려주지 않고, 공유 창은 고른 앱도 보냈는지도 알려 주지 않는다). 그래서 세 자리 모두 남지 않는 것을 말하고 「보낸 기록」이라 쓰지 않는다.
//   어린이 부서(needsGuardian)는 두 기록을 남기지 않는다(설계 2-4) · 게시판을 누가 열었는지는 운영진만 본다.
test('개인정보 — 보내기 기록: 세 자리가 남지 않는 것 · 어린이 부서 · 게시판을 누가 열었는지 안 보임을 말하고, 「보냈다」고 쓰지 않는다', () => {
  for (const [where, raw] of Object.entries(privacySpots())) {
    const t = textOf(raw);
    for (const w of ['실제로 보내셨는지', '고르신 앱', '게시판을 여신 기록과 보내기 기록을 남기지 않',
      '게시판을 누가 여셨는지는 글쓴 분과 다른 성도님께 보이지 않']) {
      assert.ok(t.includes(w), where + ' 에 「' + w + '」가 없다');
    }
    for (const bad of ['보낸 기록', '보내신 기록', '보내신 날']) {
      assert.ok(!t.includes(bad), where + ' 에 「' + bad + '」 — 보냈는지는 앱이 알 수 없다(설계 2-1)');
    }
  }
});

// 2026-11-06 — privacy/ 3항(보관) · 4항(누가 보나 — event-auto ⑪ 처럼 첫 </ul> 까지) · 6항(어린이)도 보내기 기록을 말하고, 고친 날을 올렸는가
test('개인정보 — privacy/ 3항 · 4항 · 6항이 보내기 기록을 말하고, 마지막 수정이 2026-11-06 뒤다', () => {
  const p3 = textOf(cut(PRIVACY, '<h2>3. 얼마나 보관하나</h2>', '<h2>4. 누가 볼 수 있나</h2>', 'privacy/index.html'));
  assert.ok(p3.includes('보내기 기록은 암송 프로그램을 운영하는 동안 보관하고, 계정을 지우면 함께 지워집니다'),
    'privacy/ 3항에 보내기 기록의 보관(운영하는 동안 · 계정을 지우면 함께)이 없다');
  const p4 = textOf(cut(PRIVACY, '<h2>4. 누가 볼 수 있나</h2>', '</ul>', 'privacy/index.html'));
  for (const w of ['보내기 기록', '성경암송 담당자', '게시판을 누가 여셨는지는 글쓴 분과 다른 성도님께 보이지 않습니다']) {
    assert.ok(p4.includes(w), 'privacy/ 4항에 「' + w + '」가 없다');
  }
  const p6 = textOf(cut(PRIVACY, '<h2 id="children">', '<h2>7. 문의</h2>', 'privacy/index.html'));
  assert.ok(p6.includes('게시판을 여신 기록과 보내기 기록'), 'privacy/ 6항에 「어린이 부서는 두 기록을 남기지 않는다」가 없다');
  const m = PRIVACY.match(/마지막 수정: (\d{4})년 (\d{1,2})월 (\d{1,2})일/);
  assert.ok(m, 'privacy/ 에 「마지막 수정: YYYY년 M월 D일」이 없다');
  assert.ok(Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]) >= 20261106,
    '보내기 기록을 넣은 방침의 마지막 수정이 2026년 11월 6일 앞이다: ' + m[0]);
});

// 2026-10-01 검토 F3 — 서버가 바깥으로 부르는 주소가 방침 2항 「아래 서비스가 기능 수행에 관여」 표에 다 있는가.
```

`tests/pray-share.test.cjs` — ④ 857줄 날짜 검사. 카카오 키를 넣은 날(11월 5일)을 글자 그대로 잡고 있어서 이번 판에 깨진다. 「11월 5일 이후」인지 견주는 검사로 바꾼다. 853~856 카카오 정규식은 손대지 않는다. 구역 3 도 이 파일을 고치지만 이 줄은 건드리지 않는다.

old:
```js
  assert.match(P, /마지막 수정: 2026년 11월 5일/, '방침을 고친 날');
```
new:
```js
  // 고친 날은 박지 않는다 — 방침을 다시 고치면 날짜가 올라간다(2026-11-06 보내기 기록 · store-review 가 11월 6일 뒤인지 본다)
  const upd = P.match(/마지막 수정: (\d{4})년 (\d{1,2})월 (\d{1,2})일/);
  assert.ok(upd && Number(upd[1]) * 10000 + Number(upd[2]) * 100 + Number(upd[3]) >= 20261105,
    '방침을 고친 날 — 카카오 줄을 넣은 2026년 11월 5일보다 앞이다: ' + (upd && upd[0]));
```

- [ ] **Step 2: 돌려서 실패 확인**

```bash
node --test tests/store-review.test.cjs 2>&1 | grep -E "^(not ok|# (tests|pass|fail))"
node --test tests/pray-share.test.cjs 2>&1 | grep -E "^# (tests|pass|fail)"
```
기대 출력은 지금 main 기준이다. 구역 1~3 이 store-review 에 시험을 더했으면 `# tests` · `# pass` 와 번호가 그만큼 밀린다. **fail 다섯과 그 이름은 같다**:
```
not ok 28 - 개인정보 — 새로 모으는 것 · 유튜브 문구가 privacy/ 와 앱 안 두 곳에 모두 있다
not ok 29 - 개인정보 — 「열람 기록」 줄에 게시판이 있다(privacy/ 1항 표 · renderPrivacyInfo · renderHelp 🔒)
not ok 30 - 개인정보 — 보내기 기록: 세 자리가 남지 않는 것 · 어린이 부서 · 게시판을 누가 열었는지 안 보임을 말하고, 「보냈다」고 쓰지 않는다
not ok 31 - 개인정보 — privacy/ 3항 · 4항 · 6항이 보내기 기록을 말하고, 마지막 수정이 2026-11-06 뒤다
not ok 33 - 개인정보 5항 — 「지워지는 것」에 빠진 것이 없다
# tests 35
# pass 30
# fail 5
```
왜 실패하나(오류 글자 · 검증 때 그대로 나왔다):
- 28 — `privacy/index.html 에 「보내기 기록(…)」(보내기 기록)가 없다`
- 29 — `privacy/ 1항 표 의 열람 기록 줄에 게시판이 없다: 열람 기록(어느 기능을 …) … 운영진은 주로 합계로 봅니다`
- 30 — `privacy/index.html 에 「실제로 보내셨는지」가 없다`
- 31 — `privacy/ 3항에 보내기 기록의 보관(운영하는 동안 · 계정을 지우면 함께)이 없다`
- 33 — `privacy/ 5항 「지워지는 것」에 「보내기 기록」가 없다`

pray-share 는 `# fail 0` 이다. 바꾼 날짜 검사는 지금 날짜인 「11월 5일」에도 참이기 때문이다. `# pass` 는 구역 3 이 더한 시험까지 합친 그 파일의 시험 수이고, main 기준으로는 34 다.

- [ ] **Step 3: 구현**

**`privacy/index.html`** (6곳)

① 1항 표 — 열람 기록 줄을 고치고, 그 아래에 「보내기 기록」 줄을 더한다(171~177).

old:
```html
  <tr>
    <td><b>열람 기록</b><br>(어느 기능을 어느 날 몇 번 여셨는지 — 쉴만한 물가·매일 묵상·말씀 앨범·사용 설명서·
      오늘의 찬양·가정 축복 기도문·이벤트 화면·알림 열기 등)</td>
    <td>그 기능을 여실 때</td>
    <td>기능이 실제로 쓰이는지 보고 앱을 고치기 위해<br>
      운영진은 주로 <b>합계</b>로 봅니다</td>
  </tr>
```
new:
```html
  <tr>
    <td><b>열람 기록</b><br>(어느 기능을 어느 날 몇 번 여셨는지 — 쉴만한 물가·매일 묵상·말씀 앨범·사용 설명서·
      오늘의 찬양·가정 축복 기도문·이벤트 화면·알림 열기·게시판 등)</td>
    <td>그 기능을 여실 때</td>
    <td>기능이 실제로 쓰이는지 보고 앱을 고치기 위해<br>
      운영진(총괄 관리자·성경암송 담당자)은 <b>합계</b>와 함께 <b>누가</b>(이름·소속) 여셨는지도 볼 수 있습니다</td>
  </tr>
  <tr>
    <td><b>보내기 기록</b><br>(가정 축복 기도문·오늘의 묵상·이번 주 말씀·앱 소개·외운 말씀·교육 수료증·앱 설치 주소 등을
      보내시려고 보내기 판을 여시거나, 카카오톡을 여시거나, 공유 창으로 넘기시거나, 그림을 내려받거나 글·주소를 복사하신 날짜·종류·횟수)</td>
    <td>보내기·공유 단추를 누르실 때</td>
    <td>기능이 실제로 쓰이는지 보고 앱을 고치기 위해<br>
      운영진(총괄 관리자·성경암송 담당자)만 <b>이름·소속과 함께</b> 봅니다.
      <b>받는 분 · 실제로 보내셨는지 · 고르신 앱 · 기도문 판에 적으신 이름은 남지 않습니다.</b>
      어린이 부서(6항)로 쓰시는 분은 <b>게시판을 여신 기록과 보내기 기록을 남기지 않습니다.</b></td>
  </tr>
```

② 3항 셋째 `<p>`(268) — 「운영하는 동안」은 그대로 두고, 계정을 지우면 함께 지워진다는 말만 더한다.

old:
```html
  <b>게시판 이용 규칙 동의</b>와 <b>보호자 확인</b> 날짜는 계정과 함께 보관하고, 계정을 지우면 함께 지워집니다.
```
new:
```html
  <b>게시판 이용 규칙 동의</b>와 <b>보호자 확인</b> 날짜는 계정과 함께 보관하고, 계정을 지우면 함께 지워집니다.
  <b>열람 기록</b>(게시판을 여신 기록 포함)과 <b>보내기 기록</b>은 암송 프로그램을 운영하는 동안 보관하고, 계정을 지우면 함께 지워집니다.
```

③ 4항 마지막 li(296). 첫 `</ul>` 안이라 event-auto ⑪ 이 자르는 범위에 든다. 이 li 만 바꾸고, ⑪ 이 보는 문장 li 는 그대로 둔다.

old:
```html
  <li><b>열람 기록</b>과 <b>보호자 확인</b>, <b>마지막 접속 시각</b>은 운영진만 봅니다.</li>
```
new:
```html
  <li><b>열람 기록</b>(게시판을 여신 기록 포함)과 <b>보내기 기록</b>, <b>보호자 확인</b>, <b>마지막 접속 시각</b>은 운영진만 봅니다.
    열람 기록과 보내기 기록은 총괄 관리자와 성경암송 담당자가 이름·소속과 함께 볼 수 있습니다.
    <b>게시판을 누가 여셨는지는 글쓴 분과 다른 성도님께 보이지 않습니다.</b></li>
```

④ 5항 「지워지는 것」(348):

old:
```html
      열람 기록(가정 축복 기도문 포함)<br>
```
new:
```html
      열람 기록(가정 축복 기도문·게시판 포함) · 보내기 기록<br>
```

⑤ 6항 — 둘째 li 뒤에 새 li 를 둔다(376). 「위 부서」는 첫 li 의 목록(영아부 · 유아부 · 유치부 · 유년부 · 초등부 · 사랑부 · 중등부 1·2학년 = `needsGuardian`)을 가리킨다.

old:
```html
  <li>이 확인이 생기기 전부터 쓰시던 어린이는 다음에 앱을 여실 때 한 번 여쭙니다. 그동안의 암송 기록은 그대로 둡니다.</li>
```
new:
```html
  <li>이 확인이 생기기 전부터 쓰시던 어린이는 다음에 앱을 여실 때 한 번 여쭙니다. 그동안의 암송 기록은 그대로 둡니다.</li>
  <li>위 부서로 쓰시는 분은 <b>게시판을 여신 기록과 보내기 기록</b>(1항)을 <b>남기지 않습니다</b>.</li>
```

⑥ footer(394). 실제로 고친 날이 11월 6일보다 늦으면 그날 날짜로 쓴다. 시험은 「11월 6일 이후」인지만 본다.

old:
```html
  마지막 수정: 2026년 11월 5일<br><br>
```
new:
```html
  마지막 수정: 2026년 11월 6일<br><br>
```

**`app.js` `renderPrivacyInfo`** (2곳)

⑦ 수집 항목의 열람 기록 li — 고치고, 바로 아래에 「보내기 기록」 li 를 더한다.

old:
```html
            <li><b>열람 기록</b> — 어느 기능(쉴만한 물가·매일 묵상·말씀 앨범·설명서·오늘의 찬양 등)을 어느 날 몇 번 여셨는지</li>
```
new:
```html
            <li><b>열람 기록</b> — 어느 기능(쉴만한 물가·매일 묵상·말씀 앨범·설명서·오늘의 찬양·게시판 등)을 어느 날 몇 번 여셨는지<br>
              <small>운영진(총괄 관리자·성경암송 담당자)은 합계와 함께 누가(이름·소속) 여셨는지도 볼 수 있어요 · 게시판을 누가 여셨는지는 글쓴 분과 다른 성도님께 보이지 않아요</small></li>
            <li><b>보내기 기록</b> — 기도문·묵상·이번 주 말씀·앱 소개·외운 말씀·수료증 같은 것을 보내시려고 보내기 판을 여시거나, 카카오톡을 여시거나, 공유 창으로 넘기시거나, 그림을 내려받거나 글·주소를 복사하신 날짜·종류·횟수<br>
              <small>운영진(총괄 관리자·성경암송 담당자)만 이름·소속과 함께 봐요 · 받는 분, 실제로 보내셨는지, 고르신 앱, 기도문 판에 적으신 이름은 남지 않아요 · 어린이 부서로 쓰시는 분은 게시판을 여신 기록과 보내기 기록을 남기지 않아요</small></li>
```

⑧ 이용 목적:

old:
```html
            <li>교구/부서별 참여 통계 확인</li>
```
new:
```html
            <li>교구/부서별 참여 통계 확인</li>
            <li>기능이 쓰이는지 살펴 앱을 고치는 일 <small>(열람 기록·보내기 기록)</small></li>
```

**`app.js` `renderHelp` 🔒** (2곳)

⑨ 「그 밖에 남는 것」 li 는 아주 긴 한 줄이다. 그 줄 안에서 이 마디만 바꾸고 나머지 글자는 그대로 둔다. 새 마디 안에는 `, `(쉼표+빈칸)를 넣지 않는다. 시험이 `, ` 로 마디를 가르기 때문이다.

old:
```html
어느 기능을 언제 여셨는지의 <b>열람 기록</b>, 앱을 여실 때 남는
```
new:
```html
어느 기능(게시판 포함)을 언제 여셨는지의 <b>열람 기록</b>, 기도문·묵상·이번 주 말씀 같은 것을 보내시려고 보내기 판을 여시거나 카카오톡을 여시거나 공유 창으로 넘기시거나 내려받기·복사하신 날·종류·횟수의 <b>보내기 기록</b>(기능이 쓰이는지 살펴 앱을 고치려고 남겨요 · 받는 분·실제로 보내셨는지·고르신 앱은 남지 않아요 · 어린이 부서로 쓰시는 분은 게시판을 여신 기록과 보내기 기록을 남기지 않아요), 앱을 여실 때 남는
```

⑩ 「공개 범위」 li:

old:
```html
            <li><b>공개 범위</b>: 도전 순위와 게시판에는 <b>이름과 소속</b>만 표시됩니다(연락처 없음). 순위에는 참여한 분만 표시돼요.</li>
```
new:
```html
            <li><b>공개 범위</b>: 도전 순위와 게시판에는 <b>이름과 소속</b>만 표시됩니다(연락처 없음). 순위에는 참여한 분만 표시돼요. <b>열람 기록</b>과 <b>보내기 기록</b>은 운영진(총괄 관리자·성경암송 담당자)만 이름·소속과 함께 보고, 게시판을 누가 여셨는지는 글쓴 분과 다른 성도님께 보이지 않아요.</li>
```

「저장·용도」 li 의 카카오 문장은 손대지 않는다. pray-share 855 가 그 글자를 잡고 있다.

- [ ] **Step 4: 돌려서 통과 확인**

```bash
node --test tests/store-review.test.cjs 2>&1 | grep -E "^# (tests|pass|fail)"
node --test tests/event-auto.test.cjs 2>&1 | grep -E "^# (tests|pass|fail)"
node --test tests/board-report.test.cjs 2>&1 | grep -E "^# (tests|pass|fail)"
node --test tests/pray-share.test.cjs 2>&1 | grep -E "^# (tests|pass|fail)"
node --check app.js && echo "app.js ok"
python tools/preflight.py 2>&1 | tail -2
git diff -- privacy/index.html app.js | grep "^+" | grep -v "^+++"
```
기대:
- store-review — `# tests 35` · `# pass 35` · `# fail 0`. 앞 구역이 이 파일에 시험을 더했으면 tests · pass 가 그만큼 크다
- event-auto — `# tests 14` · `# pass 14` · `# fail 0`. ⑪ 이 보는 세 가지(4항 첫 `</ul>` 안의 「신청 없이 …」 문장 · 「이벤트에 신청할 때만」 · 「— 4항」)가 그대로다
- board-report — `# tests 14` · `# pass 14` · `# fail 0`. 3항의 「운영진이 신고된 글을 완전히 지우면」 · 「직접 지운 글의 신고」 · 「90일 뒤 저절로 지워집니다」가 그대로다
- pray-share — `# fail 0`. `# pass` 는 Step 2 와 같은 수다(main 기준 34). 853~856 카카오 정규식은 그대로 통과하고, 857 은 11월 6일 ≥ 11월 5일이라 통과한다
- `app.js ok`
- preflight 마지막 글 줄 — `모두 통과 — 배포해도 된다.`
- 마지막 명령은 새로 넣은 줄(+ 줄)만 보여 준다. 시험이 통과해도 새 문장은 눈으로 한 번 더 읽는다(copy-truth ②). 「보냈다」 · 「보내신 날」처럼 앱이 알 수 없는 말이 없는지, 세 자리가 같은 말을 하는지 본다

- [ ] **Step 5: 커밋**

```bash
git add -- privacy/index.html app.js tests/store-review.test.cjs tests/pray-share.test.cjs
git diff --cached --stat          # 이 네 파일만 · app.js 는 renderPrivacyInfo · renderHelp 헝크만인지 git diff --cached app.js 로 눈으로 본다
git commit -m "docs(개인정보): 게시판 열람 · 보내기 기록 — privacy/ 1항(열람 기록에 게시판 · 합계와 함께 누가 · 새 줄 보내기 기록) · 3항 보관 · 4항 운영진만(게시판을 누가 열었는지 안 보임) · 5항 · 6항 어린이 부서는 안 남김 · 앱 안 두 곳(renderPrivacyInfo · renderHelp 🔒) · 이용 목적 · 마지막 수정 11월 6일 · store-review 시험 셋 · pray-share 날짜 검사는 「11월 5일 이후」로" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
이 커밋은 따로 푸시하지 않는다. 구역 2·3 의 앱 기록과 같은 bump(설계 3절 배포 차례 2)로 함께 나간다.

---

### Task 9: 스토어 메모 — 데이터 보안 「앱 상호작용」 · 아이폰 확인 줄

**Files:**
- Modify: `자료/store/README.md` — 5절 표 「앱 활동 → 앱 상호작용」 줄(365) · 그 아래 판단 목록에서 2026-11-05 카카오 항목의 끝 줄(381) 뒤 · 아이폰 「4. App Privacy」 ⚠️ 목록 끝(547)
- 그대로 두는 것: `자료/store/data-safety-play-2026-10-03.csv`(답 칸뿐이라 고칠 칸이 없다)
- Test: 시험 파일은 없다. `자료/` 는 사이트로 나가지 않고 `PURE_TESTS` 에도 없다. 대신 세 자리가 생겼는지 세는 확인 명령을 쓴다

**Interfaces:**
- Consumes: 값 다섯 `board` · `share-open` · `share-kakao` · `share-sheet` · `share-save` · `needsGuardian` · Task 8 의 방침 자리(1·3·4·5·6항 · `renderPrivacyInfo` · `renderHelp` 🔒) · 시험 파일 이름 `tests/store-review.test.cjs`
- Produces: 없음(다음 아이폰 제출 때 친구가 볼 확인 줄)

- [ ] **Step 1: 실패하는 확인 명령 쓰기**

```bash
F="자료/store/README.md"
for w in "게시판 열람 · 보내기 단추(2026-11-06)" \
         "2026-11-06 게시판 열람 · 보내기 단추 기록(" \
         "2026-11-06 게시판 열람 · 보내기 단추 기록 — 다음 아이폰 판을 제출할 때 볼 것"; do
  printf '%s  ← %s\n' "$(grep -cF -- "$w" "$F")" "$w"
done
```

- [ ] **Step 2: 돌려서 실패 확인**

위 명령을 돌린다. 기대: 세 줄 모두 맨 앞 수가 `0` 이다. 5절 「무엇」 칸 · 판단 항목 · 아이폰 확인 묶음이 아직 없어서다.
```
0  ← 게시판 열람 · 보내기 단추(2026-11-06)
0  ← 2026-11-06 게시판 열람 · 보내기 단추 기록(
0  ← 2026-11-06 게시판 열람 · 보내기 단추 기록 — 다음 아이폰 판을 제출할 때 볼 것
```

- [ ] **Step 3: 구현**

① 5절 표 — 「무엇」 칸에 「게시판 열람 · 보내기 단추」를 더한다. 수집 · 공유 · 필수 · 목적 칸은 그대로 둔다.

old:
```
| 앱 활동 → 앱 상호작용 | 예 | **예** — 구글(찬양 재생 때) | 필수 | 수집: 앱 기능 · 분석 / 공유: 앱 기능 · 분석 · 광고 또는 마케팅 · 사기 방지·보안·규정 준수 | 암송·도전·복습 기록 · 열람 기록 · 마지막 접속 시각 / 재생한 찬양 영상 |
```
new:
```
| 앱 활동 → 앱 상호작용 | 예 | **예** — 구글(찬양 재생 때) | 필수 | 수집: 앱 기능 · 분석 / 공유: 앱 기능 · 분석 · 광고 또는 마케팅 · 사기 방지·보안·규정 준수 | 암송·도전·복습 기록 · 열람 기록 · 게시판 열람 · 보내기 단추(2026-11-06) · 마지막 접속 시각 / 재생한 찬양 영상 |
```

② 판단 한 줄 — 2026-11-05 카카오 항목의 마지막 줄 뒤에 더한다.

old:
```
  `privacy/` 2항 표 · 앱 안 두 곳에는 2026-11-05 에 한 줄씩 알렸다(시험이 키와 함께 본다). App Privacy(아이폰)도 같은 판단.
```
new:
```
  `privacy/` 2항 표 · 앱 안 두 곳에는 2026-11-05 에 한 줄씩 알렸다(시험이 키와 함께 본다). App Privacy(아이폰)도 같은 판단.
- **2026-11-06 게시판 열람 · 보내기 단추 기록(`feature_log` 값 `board` · `share-open` · `share-kakao` · `share-sheet` · `share-save`) — 칸은 그대로 (판단 · 다음 제출 때 콘솔 칸 설명으로 다시 볼 것):**
  앱 안에서 무엇을 열고 어느 단추를 눌렀는지(게시판을 연 날 · 보내기 판 열기 · 카카오톡 열기 · 공유 창으로 넘김 · 내려받기·복사의 날 · 종류 · 횟수)라 「앱 상호작용」이고,
  이 줄은 이미 「수집 · 필수 · 앱 기능 · 분석」으로 신고돼 있다(성도님이 끌 수 없으니 필수 · 기능이 쓰이는지 보는 것이 분석). 우리 DB(Supabase)에만 남고 교회 어드민(같은 교회의 관리 화면)이 읽으니 「공유」는 그대로다.
  받는 분 · 고른 앱 · 실제로 보냈는지 · 기도문 판의 이름 칸은 남기지 않아 새 칸(연락처 · 메시지)도 없다. 어린이 부서(`needsGuardian`)는 남기지 않는다.
  `privacy/` 1·3·4·5·6항 · 앱 안 두 곳(`renderPrivacyInfo` · `renderHelp` 🔒)에 같은 판으로 알렸다(`tests/store-review.test.cjs` 가 세 자리를 본다). 아이폰은 아래 「4. App Privacy」 ⚠️ 끝 줄.
```

③ 아이폰 확인 줄 — 「4. App Privacy」 ⚠️ 확인 목록의 마지막 항목 뒤에 새 ⚠️ 묶음을 둔다. 담당자가 다음 제출 때 보는 목록이 이 자리다. 표의 답 칸은 콘솔에 실제로 넣은 값을 모르므로 지금 고치지 않는다. 원래 있던 빈 줄과 「- **개인정보처리방침 URL**」 줄은 이 묶음 아래에 그대로 남는다.

old:
```
- App Review 메모에 "오늘의 찬양이 앱 안에서 유튜브 영상을 재생한다"는 사실을 새로 적을지 — 확인 필요
```
new:
```
- App Review 메모에 "오늘의 찬양이 앱 안에서 유튜브 영상을 재생한다"는 사실을 새로 적을지 — 확인 필요

⚠️ **2026-11-06 게시판 열람 · 보내기 단추 기록 — 다음 아이폰 판을 제출할 때 볼 것(담당자 확인):**
- 위 표 **사용 데이터 → 제품 상호작용**의 목적은 「앱 기능」뿐이고 근거도 암송 진도·도전 기록뿐이다. 열람 기록(`feature_log`)과 게시판 열람 · 보내기 단추 기록은
  운영진이 기능이 쓰이는지 보려고 쓴다(플레이 5절 「앱 상호작용 — 수집: 앱 기능 · 분석」과 같은 근거). App Store Connect 의 목적에 **「분석(Analytics)」**이 있는지 보고, 없으면 더한 뒤 이 표의 답 · 근거 칸도 고친다 — 확인 필요
```

- [ ] **Step 4: 돌려서 통과 확인**

```bash
F="자료/store/README.md"
for w in "게시판 열람 · 보내기 단추(2026-11-06)" \
         "2026-11-06 게시판 열람 · 보내기 단추 기록(" \
         "2026-11-06 게시판 열람 · 보내기 단추 기록 — 다음 아이폰 판을 제출할 때 볼 것"; do
  printf '%s  ← %s\n' "$(grep -cF -- "$w" "$F")" "$w"
done
git diff --stat -- "자료/store/README.md"
```
기대: 세 줄 모두 맨 앞 수가 `1` 이다. diff 는 이 파일 하나에 `+` 12줄 · `-` 1줄이다(표 줄 하나 바뀜 · 판단 다섯 줄 · 빈 줄과 ⚠️ 묶음 넉 줄).
```
1  ← 게시판 열람 · 보내기 단추(2026-11-06)
1  ← 2026-11-06 게시판 열람 · 보내기 단추 기록(
1  ← 2026-11-06 게시판 열람 · 보내기 단추 기록 — 다음 아이폰 판을 제출할 때 볼 것
```

- [ ] **Step 5: 커밋**

```bash
git add -- "자료/store/README.md"
git diff --cached --stat          # 이 파일 하나
git commit -m "docs(스토어): 데이터 보안 「앱 상호작용」 무엇 칸에 게시판 열람 · 보내기 단추 · 칸은 그대로라는 판단 한 줄 · 아이폰 「제품 상호작용」 목적에 「분석」이 있는지 다음 제출 때 확인 줄" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
이 커밋도 따로 먼저 푸시하지 않는다. 이 가지를 푸시하면 앞 커밋인 Task 8 의 방침이 함께 나가기 때문이다. 구역 2·3 의 bump 와 한 판으로 나간다(설계 3절 차례 2).

---

## 구역 5 — 교회 어드민 — 중계 액션 · 통계 다섯째 탭 · 방침 한 줄 (Task 10~12)

> 모든 명령은 교회 어드민 worktree **`C:\Projects\wt-usage-ca`(가지 `usage-log-ca`) 뿌리**에서 Git Bash 로 돌린다. 공용 체크아웃 `C:\Projects\church-admin` 은 건드리지 않는다.
> 손대기 전에 읽을 것: 그 저장소 `CLAUDE.md` 「⚠️ 함정」 첫 줄(새 액션 = `ACTION_ROLES` + `index.ts` case + `PROBE`) · `docs/notes/memorize.md` · `docs/notes/deploy-guard.md`.
> 시험: 교회 어드민 `tools/preflight.py` [2] 는 `tests/*.test.mjs` 를 glob 으로 모두 돈다(이름에 `.dev.` 가 든 것만 뺀다 · `preflight.py:28`). 이 구역은 **새 시험 파일을 만들지 않으므로 preflight 목록 손질이 없다**(지금 「시험 파일 73개」 그대로).
> 지금 시험 수(2026-11-06 main `898de05` 기준): `tests/authz.test.mjs` 25개 · `tests/mem-stats-logic.test.mjs` 17개 — 모두 통과.
> 이 구역의 old→new 는 `898de05` 사본(`git archive` · 저장소 밖)에 그대로 입혀 확인했다 — old 글자는 모두 파일에 **꼭 한 번씩** 있고, 아래 Step 2·4 의 수와 출력은 그 사본에서 나온 것이다(node v22.14.0). preflight [4] 명단 검사만은 사본에 `.git` 이 없어 돌지 못했다(worktree 에서는 돈다).

### 이름 표와 어긋난 것(실제 코드에 이미 그 이름이 있어서)
| 이름 표 | 이 구역이 쓰는 이름 | 까닭 |
|---|---|---|
| 탭 `{ id: "usage", … }` | `TABS` 다섯째 **`["featureUsage", "📤 보내기 · 💬 게시판"]`** | `TABS` 는 객체가 아니라 `[id, 이름]` 배열이고(`stats-logic.js:8`), `"usage"` 는 이미 ① 기간별 사용현황의 이름이다(`stats.js:20` `lastTab` · `:98` · `:99` `cache` · `:105` `data-tab` 이 이 이름으로 가른다). 이름 표도 「TABS 의 실제 꼴을 보고 맞춘다」고 했다. |
| `usageHtml(v)` | **`featureUsageHtml(d, from, to)`** | `stats.js:37` 에 ① 의 `usageHtml(rows, from, to)` 가 이미 있다. |
| `usageView(r)` | `usageView(d)` 그대로 | 겹치는 이름이 없다. |
| 화면 안내 한 줄 | `USAGE_NOTE`(MSG 밖) | `MSG` 의 모든 글은 「요.」로 끝나야 한다는 시험이 있다(`tests/mem-stats-logic.test.mjs:167`) — 이름 표 글자에는 마침표가 없어 `MSG` 밖에 둔다. |

### 이 구역이 고치는 파일
| 파일 | 맡은 일 |
|---|---|
| `supabase/functions/church-admin/authz.ts` | `ACTION_ROLES` 성경암송 덩어리에 `featureUsage: "memorizeadmin"` (Task 10) |
| `supabase/functions/church-admin/index.ts` | 성경암송 중계 case 목록에 `case "featureUsage":` · `MEM_SLOW_MS` 에 30초 (Task 10) |
| `tests/server.dev.test.mjs` | `PROBE` 에 `featureUsage: {}` (Task 10 · 개발 서버 시험은 손으로만) |
| `tests/authz.test.mjs` | 역할 · 중계 case · `MEM_WRITE` 밖 · 30초 · PROBE 를 보는 시험 둘 (Task 10) |
| `js/menus/memorize/stats-logic.js` | `TABS` 다섯째 · `MSG.noShare` · `MSG.usageWho` · `USAGE_NOTE` · `usageView` (Task 11) |
| `js/menus/memorize/stats.js` | import · `featureUsageHtml` · `fetchTab` · `draw` · 머리 주석 (Task 11) |
| `js/menus/registry.js` | 📊 통계 메뉴 설명에 「보내기·게시판 이용」 (Task 11) |
| `tests/mem-stats-logic.test.mjs` | 탭 다섯 · `usageView` · 안내 글 · `stats.js` 글자 시험 (Task 11) · 개인정보 1번 시험 (Task 12) |
| `privacy.html` | 1번에 성경암송 메뉴 한 줄 (Task 12) |
| `docs/notes/memorize.md` | 📊 줄에 `featureUsage` · ⚠️ 한 줄 (Task 12) |
| `CLAUDE.md` | 지도 줄 「통계 넷」 → 「통계 다섯」 (Task 12) |

---

### Task 10: 중계 액션 `featureUsage` — 역할 · case · 기다림 · PROBE

**Files:**
- Modify: `supabase/functions/church-admin/authz.ts:83` 근처(`blessingUsage: "memorizeadmin", ranking: "memorizeadmin",` 줄)
- Modify: `supabase/functions/church-admin/index.ts:611-614` 근처(`MEM_SLOW_MS`) · `:3141` 근처(성경암송 중계 case 첫 줄)
- Modify: `tests/server.dev.test.mjs:132` 근처(`PROBE` 의 `getVerses: {},` 줄)
- Test: `tests/authz.test.mjs`(맨 위 import 한 줄 · 파일 끝에 시험 둘)

**Interfaces:**
- Consumes: 성경암송 구역 1 의 api 액션 **`featureUsage`**(`INTERNAL_ADMIN_OK` 에 `"featureUsage"` · 받는 것 `{ from?, to? }` — 빈 글자 = 그쪽 끝 열림, `blessingUsage` 와 같은 꼴 `supabase/functions/api/blessing.ts:95-96` `if (b.from)` · 응답 꼴 설계 2-5) · 교회 어드민에 이미 있는 `memProxy(ctx, action, b)` · `memCall` · `MEM_SLOW_MS` · `MEM_WRITE` · `canCall` · `ACTION_ROLES`.
- Produces: `ACTION_ROLES.featureUsage === "memorizeadmin"` · `index.ts` 중계 `case "featureUsage":` · `MEM_SLOW_MS.featureUsage = 30000` · `PROBE.featureUsage = {}` — Task 11 의 화면이 `call("featureUsage", { from, to })` 로 부른다.

- [ ] **Step 1: 실패하는 시험 쓰기**

`tests/authz.test.mjs` 맨 위 — 지금 글자(old):
```js
import assert from "node:assert/strict";
```
새 글자(new):
```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
```
`tests/authz.test.mjs` **파일 끝에 덧붙인다**:
```js

// ---------- 📤 보내기 · 💬 게시판(featureUsage · 2026-11 · 성경암송 docs/superpowers/specs/2026-11-06-share-board-usage-log-design.md 2-6) ----------
const readSrc = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const srcBlock = (src, head, tail) => {
  const at = src.indexOf(head);
  const end = at < 0 ? -1 : src.indexOf(tail, at);
  assert.ok(at >= 0 && end > at, "못 찾음: " + head);
  return src.slice(at, end);
};

test("featureUsage — 📊 통계와 같은 성경암송 관리(memorizeadmin) · 총괄은 통과 · 다른 역할은 막는다", () => {
  assert.equal(ACTION_ROLES.featureUsage, "memorizeadmin");
  const cases = [
    [null, "not-registered"],
    [{ status: "pending", roles: ["memorizeadmin"] }, "pending"],
    [{ status: "disabled", roles: ["memorizeadmin"] }, "disabled"],
    [{ status: "active", roles: ["ministry", "directory", "bibleevent"] }, "forbidden"],
    [{ status: "active", roles: ["memorizeadmin"] }, "ok"],
    [{ status: "active", roles: ["super"] }, "ok"],
  ];
  for (const [m, want] of cases) assert.equal(canCall("featureUsage", m), want, JSON.stringify(m));
});

test("featureUsage — 성경암송 중계(memProxy) case 에 있다 · 읽기라 바꾼 기록(MEM_WRITE)에 없다 · 30초 기다린다 · 개발 서버 시험 입력(PROBE)에 있다", () => {
  const idx = readSrc("../supabase/functions/church-admin/index.ts");
  assert.match(srcBlock(idx, 'case "stats": case "participants":', "return json(await memProxy(ctx, action, b));"), /case "featureUsage":/);
  assert.ok(!srcBlock(idx, "const MEM_WRITE = new Set([", "]);").includes('"featureUsage"'),
    "읽기 액션 — MEM_WRITE 에 넣으면 탭을 열 때마다 「바꾼 기록」이 쌓인다");
  assert.match(srcBlock(idx, "const MEM_SLOW_MS: Record<string, number> = {", "};"), /\bfeatureUsage: 30000,/);
  assert.match(readSrc("./server.dev.test.mjs"), /^  featureUsage: \{\},/m);
});
```

- [ ] **Step 2: 돌려서 실패 확인**
```bash
node --experimental-strip-types --test tests/authz.test.mjs 2>&1 | grep -E "^# (pass|fail)|^not ok"
```
기대:
```
not ok 26 - featureUsage — 📊 통계와 같은 성경암송 관리(memorizeadmin) · 총괄은 통과 · 다른 역할은 막는다
not ok 27 - featureUsage — 성경암송 중계(memProxy) case 에 있다 · 읽기라 바꾼 기록(MEM_WRITE)에 없다 · 30초 기다린다 · 개발 서버 시험 입력(PROBE)에 있다
# pass 25
# fail 2
```
(26: `ACTION_ROLES.featureUsage` 가 `undefined` · 27: 중계 case 덩어리에 `case "featureUsage":` 가 없다.)

- [ ] **Step 3: 구현**

① `supabase/functions/church-admin/authz.ts` — 지금 글자(old):
```ts
  blessingUsage: "memorizeadmin", ranking: "memorizeadmin",
```
새 글자(new):
```ts
  blessingUsage: "memorizeadmin", ranking: "memorizeadmin",
  // 📊 통계 다섯째 탭 「📤 보내기 · 💬 게시판」(2026-11) — 성경암송 feature_log 다섯 값(board · share-open · share-kakao · share-sheet · share-save)을
  //   이름·소속별로 읽기만(index.ts MEM_WRITE 에 없다). api 쪽은 INTERNAL_ADMIN_OK 에 있어야 내부 키 길로 열린다 — 성경암송 api 가 먼저 운영에.
  featureUsage: "memorizeadmin",
```
(배포 가드 `tools/deploy-fn.py` `role_keys` 는 `//` 뒤를 버리고 열쇠를 세므로 주석 두 줄은 액션으로 잡히지 않는다.)

② `supabase/functions/church-admin/index.ts` 중계 case — 지금 글자(old):
```ts
      case "stats": case "participants": case "verses": case "blessingUsage": case "ranking":
```
새 글자(new):
```ts
      case "stats": case "participants": case "verses": case "blessingUsage": case "ranking":
      case "featureUsage":   // 📊 통계 「📤 보내기 · 💬 게시판」(2026-11 · 읽기만 — MEM_WRITE 아님)
```

③ `supabase/functions/church-admin/index.ts` `MEM_SLOW_MS` — 지금 글자(old):
```ts
  boardUpload: 30000,   // 공지 사진 한 장(≈300KB)을 Storage 에 — 느린 통신에서 15초를 넘길 수 있다
```
새 글자(new):
```ts
  boardUpload: 30000,   // 공지 사진 한 장(≈300KB)을 Storage 에 — 느린 통신에서 15초를 넘길 수 있다
  featureUsage: 30000,  // 📤 보내기 · 💬 게시판 — 「전체기간」이면 feature_log 다섯 값과 users 를 1,000줄씩 넘겨 읽는다(blessingUsage 와 같은 길 · 줄이 쌓이면 15초를 넘길 수 있다)
```
`MEM_WRITE` 는 **고치지 않는다**(읽기 액션).

④ `tests/server.dev.test.mjs` `PROBE` — 지금 글자(old):
```js
  getVerses: {},                                                   // 📊 통계 구절별 현황의 말씀 이름 — 성경암송 공개 말씀 목록 읽기만(2026-10-13)
```
새 글자(new):
```js
  getVerses: {},                                                   // 📊 통계 구절별 현황의 말씀 이름 — 성경암송 공개 말씀 목록 읽기만(2026-10-13)
  featureUsage: {},                                                // 📤 보내기 · 💬 게시판(2026-11) — 성경암송 feature_log 다섯 값 읽기만 · 기간 없음 = 전체 · 아무것도 쓰지 않는다
```
(개발 서버 시험은 네트워크·개발 키가 있어야 해서 preflight 에 없다 — 손으로 돌리는 확인은 Task 12 Step 6 ③, 개발 함수 배포 뒤. `PROBE` 셋째 자리라 「권한 표」 시험이 일찍 닿는다.)

- [ ] **Step 4: 돌려서 통과 확인**
```bash
node --experimental-strip-types --test tests/authz.test.mjs 2>&1 | grep -E "^# (pass|fail)"
python tools/preflight.py 2>&1 | grep -E "시험 파일|실패|모두 통과"
```
기대: `# pass 27` · `# fail 0` · `통과  시험 파일 73개` · `모두 통과`

- [ ] **Step 5: 커밋**
```bash
git add -- supabase/functions/church-admin/authz.ts supabase/functions/church-admin/index.ts tests/server.dev.test.mjs tests/authz.test.mjs
git commit -m "feat(성경암송 통계): featureUsage 중계 — 역할 memorizeadmin(총괄 통과) · memProxy case · 읽기라 MEM_WRITE 밖 · 기다림 30초 · 개발 시험 PROBE" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git show --stat HEAD
```
`git show --stat` 에 위 네 파일만 있는지 본다.

---

### Task 11: 📊 통계 다섯째 탭 「📤 보내기 · 💬 게시판」 — `usageView` · `featureUsageHtml`

**Files:**
- Modify: `js/menus/memorize/stats-logic.js:2` · `:4`(머리 주석) · `:8`(`TABS`) · `:18`(`MSG.someUnnamed` 줄) · 파일 끝(⑤ 덩어리)
- Modify: `js/menus/memorize/stats.js:1` · `:3` · `:5` · `:8`(머리 주석) · `:16`(import) · `:92` 앞(`const dateBtn` 앞에 `featureUsageHtml`) · `:168`(`fetchTab`) · `:181`(`draw`)
- Modify: `js/menus/registry.js:18`(`mem-stats` 설명)
- Test: `tests/mem-stats-logic.test.mjs`(import 둘 · `:10-12` 탭 시험 · `:166` 해요체 시험 앞에 시험 넷)

**Interfaces:**
- Consumes: Task 10 의 교회 어드민 액션 `featureUsage`(`call("featureUsage", { from, to })`) · 성경암송 구역 1 의 응답 꼴 `summary.board{people,count}` · `summary.share{people,count}` · `byKind[{item,label,open,kakao,sheet,save,people}]` · `byUser[{gubun,sosok,sebu,name,boardDays,boardCount,open,kakao,sheet,save,last}]` · 이미 있는 `blessingWho` · `MSG` · `nText` · `stats.js` 도우미 `kpis` · `toolbar` · `th` · `td` · `tdB` · `table` · `tag` · `empty` · `esc` · `errorText`(실패는 `show()` 가 모든 탭에 같은 글로 — `stats.js:193-197`).
- Produces: `TABS[4] = ["featureUsage", "📤 보내기 · 💬 게시판"]` · `usageView(d)` → `{ summary: { boardPeople, boardCount, sharePeople, shareCount }, byKind, byUser, empty }` · `USAGE_NOTE` · `MSG.noShare` · `MSG.usageWho` · `stats.js` `featureUsageHtml(d, from, to)` · `tests/mem-stats-logic.test.mjs` 의 `readFileSync` import(Task 12 시험이 쓴다).

- [ ] **Step 1: 실패하는 시험 쓰기**

`tests/mem-stats-logic.test.mjs` — 지금 글자(old):
```js
import assert from "node:assert/strict";
```
새 글자(new):
```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
```
지금 글자(old):
```js
  sosokOptions, challengeView, sosokLabel, blessingView, blessingWho } from "../js/menus/memorize/stats-logic.js";
```
새 글자(new):
```js
  sosokOptions, challengeView, sosokLabel, blessingView, blessingWho, usageView, USAGE_NOTE } from "../js/menus/memorize/stats-logic.js";
```
탭 시험 세 줄 — 줄마다 지금 글자(old) 다음에 새 글자(new):
```js
test("보기 넷 · 빠른 기간 셋(옛 화면의 단추 이름)", () => {
```
```js
test("보기 다섯(⑤ 는 2026-11 · 이름 featureUsage — usage 는 ① 이 쓴다) · 빠른 기간 셋(옛 화면의 단추 이름)", () => {
```
```js
  assert.deepEqual(TABS.map(([k]) => k), ["usage", "verses", "challenge", "blessing"]);
```
```js
  assert.deepEqual(TABS.map(([k]) => k), ["usage", "verses", "challenge", "blessing", "featureUsage"]);
```
```js
  assert.deepEqual(TABS.map(([, t]) => t), ["기간별 사용현황", "구절별 현황", "도전 현황", "축복 기도문 사용현황"]);
```
```js
  assert.deepEqual(TABS.map(([, t]) => t), ["기간별 사용현황", "구절별 현황", "도전 현황", "축복 기도문 사용현황", "📤 보내기 · 💬 게시판"]);
```
해요체 시험 앞에 시험 넷 — 지금 글자(old):
```js
test("안내 글은 해요체 · 「전체」 소속 안내", () => {
```
새 글자(new):
```js
// ⑤ 📤 보내기 · 💬 게시판 — 성경암송 api featureUsage 의 답(설계 2-5 꼴 · user_id 없음 · 어린 부서 줄은 api 가 뺀다)
const FEATURE = {
  ok: true,
  summary: { board: { people: 2, count: 9 }, share: { people: 1, count: "3" } },
  byKind: [
    { item: 1, label: "가정 축복 기도문", open: 4, kakao: 0, sheet: 2, save: 1, people: 1 },
    { item: 3, label: "이번 주 말씀", open: 1, kakao: 1, sheet: 0, save: 0, people: 1 },
  ],
  byUser: [
    { gubun: "교구", sosok: "화평", sebu: "20", name: "<b>나</b>", boardDays: 2, boardCount: 7, open: 5, kakao: 1, sheet: 2, save: 1, last: "2026-11-06",
      user_id: "00000000-0000-0000-0000-000000000001" },   // 서버가 잘못 실어 보내도 화면 꼴에는 들어오지 않아야 한다
    { gubun: "교회학교", sosok: "중등부", sebu: 2, name: "가", boardDays: 1, boardCount: 2, open: 0, kakao: 0, sheet: 0, save: 0, last: "2026-11-05" },
  ],
};

test("⑤ 보내기·게시판 — 서버 답을 화면 꼴로 · 이름은 원값 그대로(esc 는 그릴 때) · 차례는 서버 그대로 · user_id 는 싣지 않는다", () => {
  const d = usageView(FEATURE);
  assert.deepEqual(d.summary, { boardPeople: 2, boardCount: 9, sharePeople: 1, shareCount: 3 });
  assert.equal(d.empty, false);
  assert.deepEqual(d.byKind.map((k) => [k.item, k.label, k.open, k.kakao, k.sheet, k.save, k.people]),
    [[1, "가정 축복 기도문", 4, 0, 2, 1, 1], [3, "이번 주 말씀", 1, 1, 0, 0, 1]]);
  assert.deepEqual(d.byUser.map((u) => u.name), ["<b>나</b>", "가"]);
  assert.deepEqual(Object.keys(d.byUser[0]), ["gubun", "sosok", "sebu", "name", "boardDays", "boardCount", "open", "kakao", "sheet", "save", "last"]);
  for (const u of d.byUser) assert.ok(!("user_id" in u), "user_id 를 화면 꼴에 싣지 않는다");
  assert.equal(d.byUser[1].sebu, "2");
  assert.equal(blessingWho(d.byUser[0]), "화평-20");   // 소속 칸은 ④ 와 같은 꼴(gubun · sosok · sebu)
  assert.deepEqual([d.byUser[1].boardDays, d.byUser[1].last], [1, "2026-11-05"]);
});

test("⑤ 보내기·게시판 — 빈 답(표가 아직 없는 DB 도 서버가 이 꼴로 준다) · 게시판만 쓴 기간 · 이름 없는 종류", () => {
  const none = usageView({ ok: true, summary: { board: { people: 0, count: 0 }, share: { people: 0, count: 0 } }, byKind: [], byUser: [] });
  assert.deepEqual(none.summary, { boardPeople: 0, boardCount: 0, sharePeople: 0, shareCount: 0 });
  assert.equal(none.empty, true);
  assert.equal(usageView({}).empty, true);
  assert.equal(usageView(null).empty, true);
  const board = usageView({ summary: { board: { people: 1, count: 1 } }, byUser: [{ name: "가", boardDays: 1, boardCount: 1, last: "2026-11-06" }] });
  assert.equal(board.empty, false);
  assert.deepEqual(board.summary, { boardPeople: 1, boardCount: 1, sharePeople: 0, shareCount: 0 });
  assert.deepEqual(board.byKind, []);
  assert.deepEqual([board.byUser[0].open, board.byUser[0].kakao, board.byUser[0].gubun, board.byUser[0].sosok], [0, 0, "", ""]);
  assert.equal(usageView({ byKind: [{ item: 9, sheet: 1 }] }).byKind[0].label, "종류 9");
});

test("⑤ 화면 안내 한 줄 — 앱이 알 수 있는 것까지만(이름 표 글자 그대로) · 종류가 없을 때 · 누가 표는 참고", () => {
  assert.equal(USAGE_NOTE, "카톡인지 문자인지, 실제로 보냈는지는 앱이 알 수 없어요 · 날짜까지만 남아요 · 만 14세 미만 어린 부서는 남기지 않아요");
  assert.equal(MSG.noShare, "이 기간에 보내기 기록이 없어요.");
  assert.equal(MSG.usageWho, "이 표는 앱이 남긴 기록을 그대로 센 것이라, 참고로만 봐 주세요.");
});

test("⑤ 화면(stats.js) — featureUsage 를 기간과 함께 부르고 · 실패면 그 답 그대로(다른 탭과 같은 errorText) · 그 탭을 그리고 · 글은 모두 esc", () => {
  const src = readFileSync(new URL("../js/menus/memorize/stats.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.ok(src.includes('if (t === "featureUsage") { const r = await call("featureUsage", p); return r.ok ? { ok: true, ...usageView(r) } : r; }'),
    "fetchTab 에 featureUsage 갈래가 없다");
  assert.ok(src.includes(': tab === "featureUsage" ? featureUsageHtml(d, from, to)'), "draw 에 featureUsage 갈래가 없다");
  const at = src.indexOf("function featureUsageHtml(");
  const end = src.indexOf("\n}\n", at);
  assert.ok(at > 0 && end > at, "featureUsageHtml 이 없다");
  const body = src.slice(at, end);
  assert.ok(body.includes("esc(USAGE_NOTE)"), "안내 한 줄이 없다");
  assert.ok(body.includes("esc(MSG.usageWho)"), "누가 표 안내가 없다");
  assert.ok(!/\$\{(r|d|s)\.[a-zA-Z]+/.test(body), "이름·소속·종류 글을 esc 없이 끼우지 않는다(td · tag · kpis 를 거친다)");
  assert.ok(!body.includes("user_id"));
});

test("안내 글은 해요체 · 「전체」 소속 안내", () => {
```

- [ ] **Step 2: 돌려서 실패 확인**
```bash
node --experimental-strip-types --test tests/mem-stats-logic.test.mjs 2>&1 | grep -E "^# (pass|fail)|^not ok|does not provide"
```
기대(모듈을 잇다가 멈춘다 — `stats-logic.js` 에 아직 `USAGE_NOTE`·`usageView` 가 없다 · node v22.14 는 오류 줄을 먼저 찍고, 파일 이름의 `\` 를 두 겹으로 찍는다):
```
# SyntaxError: The requested module '../js/menus/memorize/stats-logic.js' does not provide an export named 'USAGE_NOTE'
not ok 1 - tests\\mem-stats-logic.test.mjs
# pass 0
# fail 1
```

- [ ] **Step 3: 구현**

**① `js/menus/memorize/stats-logic.js`**

머리 주석 둘 — 줄마다 지금 글자(old) 다음에 새 글자(new):
```js
//   네 보기(기간별 사용현황 · 구절별 현황 · 도전 현황 · 축복 기도문 사용현황)가 기간(from·to) 하나를 함께 쓴다.
```
```js
//   다섯 보기(기간별 사용현황 · 구절별 현황 · 도전 현황 · 축복 기도문 사용현황 · 📤 보내기 · 💬 게시판)가 기간(from·to) 하나를 함께 쓴다.
```
```js
//   수는 성경암송 api 가 센 그대로(stats · verses · ranking · blessingUsage). 여기서는 거르기·차례·합계·글만 만든다.
```
```js
//   수는 성경암송 api 가 센 그대로(stats · verses · ranking · blessingUsage · featureUsage). 여기서는 거르기·차례·합계·글만 만든다.
```
`TABS` — 지금 글자(old):
```js
export const TABS = [["usage", "기간별 사용현황"], ["verses", "구절별 현황"], ["challenge", "도전 현황"], ["blessing", "축복 기도문 사용현황"]];
```
새 글자(new):
```js
// ⑤ 의 이름은 "featureUsage"(2026-11) — "usage" 는 ① 기간별 사용현황이 이미 쓴다(lastTab · cache · data-tab 이 이 이름으로 가른다).
export const TABS = [["usage", "기간별 사용현황"], ["verses", "구절별 현황"], ["challenge", "도전 현황"], ["blessing", "축복 기도문 사용현황"],
  ["featureUsage", "📤 보내기 · 💬 게시판"]];
```
`MSG` — 지금 글자(old):
```js
  someUnnamed: "말씀 이름은 앱의 주간 암송 말씀 목록에서 가져와요 — 그 목록에 없는 순번(시편 말씀 액자 등)은 「No.순번」으로 보여요.",
```
새 글자(new):
```js
  someUnnamed: "말씀 이름은 앱의 주간 암송 말씀 목록에서 가져와요 — 그 목록에 없는 순번(시편 말씀 액자 등)은 「No.순번」으로 보여요.",
  noShare: "이 기간에 보내기 기록이 없어요.",
  usageWho: "이 표는 앱이 남긴 기록을 그대로 센 것이라, 참고로만 봐 주세요.",
```
**파일 끝(`blessingWho` 줄 다음)에 덧붙인다:**
```js

// ── ⑤ 📤 보내기 · 💬 게시판(featureUsage · 2026-11) ──
// 화면 안내 한 줄 — 앱이 알 수 있는 것까지만(카카오·공유 창은 무엇을 골라 실제로 보냈는지 돌려주지 않는다 · feature_log 는 날짜까지 · 어린 부서는 앱·api 가 남기지 않는다).
//   MSG 밖에 둔다 — 이름 표(설계 2-6)의 글자 그대로라 끝에 마침표가 없다(MSG 는 「요.」로 끝나야 한다 — 시험).
export const USAGE_NOTE = "카톡인지 문자인지, 실제로 보냈는지는 앱이 알 수 없어요 · 날짜까지만 남아요 · 만 14세 미만 어린 부서는 남기지 않아요";
const n0 = (v) => Number(v) || 0;
const s0 = (v) => String(v ?? "");
// 서버 답 → 화면이 쓰는 꼴. 이름·소속은 원값 그대로(esc 는 stats.js 가 그릴 때) · 차례는 서버가 준 그대로(종류 = item 차례 · 누가 = 횟수 많은 차례).
//   칸을 하나씩 골라 담는다 — 서버가 잘못해 user_id 같은 칸을 실어 보내도 화면 꼴에는 들어오지 않는다.
//   한 줄도 없으면 빈 기간(표가 아직 없는 DB 도 서버가 빈 결과로 준다).
export function usageView(d) {
  const s = d?.summary || {}, b = s.board || {}, sh = s.share || {};
  const summary = { boardPeople: n0(b.people), boardCount: n0(b.count), sharePeople: n0(sh.people), shareCount: n0(sh.count) };
  const byKind = (d?.byKind || []).map((k) => ({ item: n0(k?.item), label: s0(k?.label) || `종류 ${n0(k?.item)}`,
    open: n0(k?.open), kakao: n0(k?.kakao), sheet: n0(k?.sheet), save: n0(k?.save), people: n0(k?.people) }));
  const byUser = (d?.byUser || []).map((u) => ({ gubun: s0(u?.gubun), sosok: s0(u?.sosok), sebu: s0(u?.sebu), name: s0(u?.name),
    boardDays: n0(u?.boardDays), boardCount: n0(u?.boardCount), open: n0(u?.open), kakao: n0(u?.kakao), sheet: n0(u?.sheet),
    save: n0(u?.save), last: s0(u?.last) }));
  return { summary, byKind, byUser, empty: !byKind.length && !byUser.length };
}
```

**② `js/menus/memorize/stats.js`**

머리 주석 넷 — 줄마다 지금 글자(old) 다음에 새 글자(new):
```js
// 📊 통계 — 성경암송 사용 통계 네 보기(2026-10-13 · 옛 성경암송 admin-stats.html 의 네 화면을 옮겼다). 역할 memorizeadmin.
```
```js
// 📊 통계 — 성경암송 사용 통계 다섯 보기(2026-10-13 · 옛 성경암송 admin-stats.html 의 네 화면을 옮겼다 · ⑤ 는 2026-11 새로). 역할 memorizeadmin.
```
```js
//   ③ 도전 현황(ranking — 사람마다 타이핑·음성 · 구분·소속 거르기) ④ 축복 기도문 사용현황(blessingUsage — 많이 읽히는 편 · 누가 얼마나).
```
```js
//   ③ 도전 현황(ranking — 사람마다 타이핑·음성 · 구분·소속 거르기) ④ 축복 기도문 사용현황(blessingUsage — 많이 읽히는 편 · 누가 얼마나)
//   ⑤ 📤 보내기 · 💬 게시판(featureUsage · 2026-11 — 게시판을 연 분 · 보내기 판 열기·카톡 열기·공유 창·내려받기/복사 · 누가).
```
```js
//   기간(from·to)은 네 보기가 함께 쓴다 — 날짜는 picker.js pickDate 단추(시스템 날짜 칸 금지) · 빠른 기간 「전체기간·이번 달·최근 7일」.
```
```js
//   기간(from·to)은 다섯 보기가 함께 쓴다 — 날짜는 picker.js pickDate 단추(시스템 날짜 칸 금지) · 빠른 기간 「전체기간·이번 달·최근 7일」.
```
```js
//      이름이 보이는 표는 옛 화면에도 있던 둘(③ 도전 현황 · ④ 누가 얼마나)뿐이다.
```
```js
//      이름이 보이는 표는 옛 화면에도 있던 둘(③ 도전 현황 · ④ 누가 얼마나)과 ⑤ 누가(2026-11 · 교회 어드민 privacy.html 1번에 적었다) 셋이다.
```
import — 지금 글자(old):
```js
  blessingView, blessingWho } from "./stats-logic.js";
```
새 글자(new):
```js
  blessingView, blessingWho, usageView, USAGE_NOTE } from "./stats-logic.js";
```
그리기 — 지금 글자(old, `blessingHtml` 다음 `dateBtn` 의 첫 줄):
```js
const dateBtn = (k, label) => `<button type="button" class="pk-field ms-${k}" data-act="date" data-k="${k}" aria-haspopup="dialog" aria-expanded="false"` +
```
새 글자(new):
```js
// ⑤ 📤 보내기 · 💬 게시판(featureUsage · 2026-11) — 요약 넷 · 종류별 · 누가(서버 차례 그대로) · 글은 모두 esc(td · tag · kpis)
//   「보내기 횟수」는 카톡 열기 · 공유 창 · 내려받기·복사의 합(판 열기는 넣지 않는다 — 열고 안 보낸 분을 가르려고 · 설계 2-5).
function featureUsageHtml(d, from, to) {
  const note = `<p class="muted ms-note">${esc(USAGE_NOTE)}</p>`;
  if (d.empty) return empty(MSG.empty) + note;
  const s = d.summary;
  return kpis([[s.boardPeople, "게시판 연 분"], [s.boardCount, "게시판 연 횟수"], [s.sharePeople, "보내기 쓴 분"], [s.shareCount, "보내기 횟수"]]) +
    toolbar(from, to, `기록 있는 분 ${nText(d.byUser.length)}명`) + note +
    `<h3 class="sec-title">종류별</h3>` +
    (d.byKind.length
      ? table(th("종류", "l") + th("판 열기") + th("카톡 열기") + th("공유 창") + th("내려받기·복사") + th("쓴 분"),
        d.byKind.map((r) => `<tr>${td(r.label, "l ms-wrap")}${td(nText(r.open))}${td(nText(r.kakao))}${td(nText(r.sheet))}` +
          `${td(nText(r.save))}${tdB(r.people)}</tr>`).join(""))
      : empty(MSG.noShare)) +
    `<h3 class="sec-title">누가</h3><p class="muted ms-note">${esc(MSG.usageWho)}</p>` +
    table(th("구분", "l") + th("소속", "l") + th("이름", "l") + th("게시판 날수") + th("게시판 횟수") + th("카톡 열기") + th("공유 창") +
      th("내려받기·복사") + th("판 열기") + th("마지막", "c"),
      d.byUser.map((r) => `<tr>${tag(r.gubun)}${td(blessingWho(r), "l")}${td(r.name || "-", "l")}${td(nText(r.boardDays))}${td(nText(r.boardCount))}` +
        `${td(nText(r.kakao))}${td(nText(r.sheet))}${td(nText(r.save))}${td(nText(r.open))}${td(r.last || "-", "c")}</tr>`).join(""));
}

const dateBtn = (k, label) => `<button type="button" class="pk-field ms-${k}" data-act="date" data-k="${k}" aria-haspopup="dialog" aria-expanded="false"` +
```
`fetchTab` — 지금 글자(old):
```js
    const r = await call("blessingUsage", p);
```
새 글자(new):
```js
    if (t === "featureUsage") { const r = await call("featureUsage", p); return r.ok ? { ok: true, ...usageView(r) } : r; }
    const r = await call("blessingUsage", p);
```
(실패 답은 그대로 돌려준다 → `show()` 가 다른 탭과 똑같이 `empty(errorText(got))` 로 그린다 — `network` 「인터넷 연결을 확인해 주세요」 · 교회 어드민 함수가 옛 판이면 `unknown-action` 「화면이 옛 판이에요 — 새로고침해 주세요」 · api 가 옛 판이면 api 가 `{ error: "unknown action: featureUsage" }`(400 · `ok` 없음 · api `index.ts:740`)을 주고 그것과 `unauthorized` 는 `js/core/ui.js` `MESSAGES` 에 없어 「처리하지 못했어요」.)

`draw` — 지금 글자(old):
```js
          : blessingHtml(d, from, to);
```
새 글자(new):
```js
          : tab === "featureUsage" ? featureUsageHtml(d, from, to)
            : blessingHtml(d, from, to);
```
새 CSS 는 없다 — `ms-note` · `ms-wrap` · `ms-kpis` · `ms-t` · `sec-title` 는 `css/admin.css`(91 · 2217 · 2218 · 2235)에 이미 있고, 탭 줄 `.tabs` 는 `flex-wrap:wrap`(144)이라 다섯째 탭은 줄을 넘겨 놓인다. 도전 현황 거르기(`.ms-chal`)는 `syncControls` 가 `tab !== "challenge"` 면 숨긴다(`stats.js:143`) — 이 탭에서도 숨는다.

**③ `js/menus/registry.js`** — 지금 글자(old):
```js
  { id: "mem-stats", group: "성경암송", icon: "📊", label: "통계", desc: "기간별 사용현황 · 구절별 현황 · 도전 현황 · 축복 기도문 사용현황",
```
새 글자(new):
```js
  { id: "mem-stats", group: "성경암송", icon: "📊", label: "통계", desc: "기간별 사용현황 · 구절별 현황 · 도전 현황 · 축복 기도문 사용현황 · 보내기·게시판 이용",
```
(`mem-stats` 의 설명 글을 글자로 잡는 시험은 없다 — `tests/be-history-logic.test.mjs:236` · `tests/be-upload-logic.test.mjs:286` 은 다른 메뉴를 본다.)

- [ ] **Step 4: 돌려서 통과 확인**
```bash
node --experimental-strip-types --test tests/mem-stats-logic.test.mjs 2>&1 | grep -E "^# (pass|fail)"
node --check js/menus/memorize/stats.js && echo "문법 통과"
python tools/preflight.py 2>&1 | grep -E "시험 파일|실패|모두 통과"
```
기대: `# pass 21` · `# fail 0` · `문법 통과` · `통과  시험 파일 73개` · `모두 통과`

- [ ] **Step 5: 커밋**
```bash
git add -- js/menus/memorize/stats-logic.js js/menus/memorize/stats.js js/menus/registry.js tests/mem-stats-logic.test.mjs
git commit -m "feat(성경암송 통계): 다섯째 탭 「📤 보내기 · 💬 게시판」 — 요약 넷 · 종류별 · 누가(usageView · 모두 esc · user_id 안 실음) · 안내 한 줄 · 탭 이름 featureUsage(usage 는 ① 이 씀)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git show --stat HEAD
```
`git show --stat` 에 위 네 파일만 있는지 본다.

---

### Task 12: 개인정보 안내 한 줄 · 문서 · 배포

**Files:**
- Modify: `privacy.html:27-28` 근처(1번 「이 안내가 다루는 곳」 · 「마지막 수정」 같은 날짜 자리는 이 파일에 없다 — 더하지 않는다)
- Modify: `docs/notes/memorize.md:9`(📊 줄) · `:23` 다음(⚠️ 한 줄)
- Modify: `CLAUDE.md:24`(지도 줄)
- Test: `tests/mem-stats-logic.test.mjs`(파일 끝에 시험 하나)

**Interfaces:**
- Consumes: Task 11 이 `tests/mem-stats-logic.test.mjs` 에 더한 `import { readFileSync } from "node:fs";` · 역할 이름 「성경암송 관리」(`supabase/sql/018_memorizeadmin_role.sql:9` 의 `memorizeadmin` 이름) · `privacy.html` 의 말투(「총괄 관리자와 「…」 역할을 드린 담당자」) · Task 10·11 의 커밋(배포 차례) · 성경암송 구역 1 의 api `featureUsage` 운영 반영.
- Produces: `privacy.html` 1번 문장(성경암송 앱 개인정보 안내와 같은 날 맞춘다) · `docs/notes/memorize.md` 의 `featureUsage` 줄.

⚠️ 말 고르기: 성경암송 앱 방침(`privacy/index.html:172`)의 「열람 기록」은 쉴만한 물가·매일 묵상·말씀 앨범·사용 설명서 … 를 모두 뜻한다. 그런데 `featureUsage` 는 **다섯 값만** 읽고(설계 2-5 「시편 · 묵상 같은 다른 열람 기록을 이름째 열지 않는다」), 교회 어드민 어디에도 `feature_log` 를 읽는 곳이 없다. 그래서 「앱의 열람 기록(게시판 포함)을 이름으로 본다」고 쓰면 사실보다 넓다 — 「열람 기록 **가운데** 게시판을 연 날·횟수와 보내기 기록」으로 쓴다.

- [ ] **Step 1: 실패하는 시험 쓰기**

`tests/mem-stats-logic.test.mjs` **파일 끝에 덧붙인다**:
```js

test("개인정보 안내(privacy.html) 1번 — 성경암송 메뉴에서 게시판을 연 기록·보내기 기록을 이름·소속별로 본다는 한 줄(2026-11)", () => {
  const pv = readFileSync(new URL("../privacy.html", import.meta.url), "utf8");
  const s1 = pv.indexOf("<h3>1. "), s2 = pv.indexOf("<h3>2. ");
  assert.ok(s1 > 0 && s2 > s1);
  const p1 = pv.slice(s1, s2).replace(/\s+/g, " ");
  assert.ok(p1.includes("총괄 관리자와 「성경암송 관리」 역할을 드린 담당자는 이 화면의 성경암송 메뉴에서 성경암송 앱의 열람 기록 가운데 게시판을 연 날·횟수와 보내기 기록("),
    "1번에 성경암송 기록 보기 한 줄이 없다");
  assert.ok(p1.includes(")을 이름·소속별로 볼 수 있어요. 무엇을 남기고 얼마나 두는지는 앱의 안내를 따라요."));
  // featureUsage 는 다섯 값만 읽는다 — 쉴만한 물가·매일 묵상 같은 다른 열람 기록까지 이름으로 보는 것처럼 쓰지 않는다
  assert.ok(!p1.includes("앱의 열람 기록(게시판"), "열람 기록 전부를 이름으로 보는 것처럼 읽힌다");
});
```

- [ ] **Step 2: 돌려서 실패 확인**
```bash
node --experimental-strip-types --test tests/mem-stats-logic.test.mjs 2>&1 | grep -E "^# (pass|fail)|^not ok"
```
기대:
```
not ok 22 - 개인정보 안내(privacy.html) 1번 — 성경암송 메뉴에서 게시판을 연 기록·보내기 기록을 이름·소속별로 본다는 한 줄(2026-11)
# pass 21
# fail 1
```

- [ ] **Step 3: 구현**

**① `privacy.html`** — 지금 글자(old):
```html
      앱의 안내(<a href="https://gocheok.onlybible.kr/privacy/">gocheok.onlybible.kr/privacy/</a>)를 따릅니다.</p>
```
새 글자(new):
```html
      앱의 안내(<a href="https://gocheok.onlybible.kr/privacy/">gocheok.onlybible.kr/privacy/</a>)를 따릅니다.<br>
      총괄 관리자와 「성경암송 관리」 역할을 드린 담당자는 이 화면의 성경암송 메뉴에서 성경암송 앱의 열람 기록 가운데 게시판을 연 날·횟수와
      보내기 기록(보내기 판 열기 · 카카오톡 열기 · 공유 창으로 넘김 · 내려받기·복사의 날·종류·횟수)을 이름·소속별로 볼 수 있어요.
      무엇을 남기고 얼마나 두는지는 앱의 안내를 따라요.</p>
```
(6~9번을 글자로 잡는 시험 셋 — `tests/be-roster-logic.test.mjs:312` · `tests/be-roster-ui.test.mjs:169` · `tests/history-check.test.mjs:417` — 은 1번을 보지 않아 그대로 통과한다(사본에서 네 파일 함께 100/0). 카드 번호는 그대로.)

**② `docs/notes/memorize.md`** 📊 줄 — 지금 글자(old):
```md
| 📊 통계 — 기간별 · 구절별 · 도전 · 축복 기도문(2026-10-13 탭 넷) | `stats.js` · `stats-logic.js` | stats · verses · ranking · blessingUsage · getVerses(말씀 이름) |
```
새 글자(new):
```md
| 📊 통계 — 기간별 · 구절별 · 도전 · 축복 기도문(2026-10-13 탭 넷) · 📤 보내기 · 💬 게시판(2026-11 다섯째 탭 · 탭 이름 `featureUsage` — `usage` 는 ① 이 쓴다) | `stats.js` · `stats-logic.js`(`usageView`) | stats · verses · ranking · blessingUsage · featureUsage · getVerses(말씀 이름) |
```
⚠️ 목록 끝 — 지금 글자(old):
```md
- 아직 `<select>`·`type="date"` 를 쓰는 옛 화면: `config.js` · `pilsa.js` · `sermon.js`(규칙 위반 · 고칠 때 `picker.js` 로).
```
새 글자(new):
```md
- 아직 `<select>`·`type="date"` 를 쓰는 옛 화면: `config.js` · `pilsa.js` · `sermon.js`(규칙 위반 · 고칠 때 `picker.js` 로).
- **📤 보내기 · 💬 게시판(featureUsage · 2026-11)** — 성경암송 api 의 `featureUsage` 가 **그 환경(개발/운영)에 먼저** 있어야 한다(없으면 api 가 `unknown action` 400 → 탭에 「처리하지 못했어요」). 응답에 `user_id` 가 없고 어린 부서(만 14세 미만) 줄은 api 가 뺀다 — 화면도 `usageView` 가 칸을 골라 담는다. 읽기라 `MEM_WRITE` 에 없다(「바꾼 기록」에 안 남는다) · 「전체기간」은 `MEM_SLOW_MS` 30초 · 내려받기(CSV)는 만들지 않는다 · 카톡인지 문자인지·실제로 보냈는지는 알 수 없다(화면 안내 한 줄 `USAGE_NOTE`) · 「누가」 표는 참고(이 api 에는 JWT 가 없다). 설계: 성경암송 `docs/superpowers/specs/2026-11-06-share-board-usage-log-design.md` · 개인정보 `privacy.html` 1번.
```

**③ `CLAUDE.md`** 지도 줄 — 지금 글자(old):
```md
| 성경암송 메뉴(통계 넷 · 
```
새 글자(new):
```md
| 성경암송 메뉴(통계 다섯 · 
```

- [ ] **Step 4: 돌려서 통과 확인**
```bash
node --experimental-strip-types --test tests/mem-stats-logic.test.mjs 2>&1 | grep -E "^# (pass|fail)"
python tools/preflight.py 2>&1 | grep -E "시험 파일|stamp|명단 검사|배포 가드|실패|모두 통과"
```
기대: `# pass 22` · `# fail 0` · `통과  시험 파일 73개` · `통과  stamp` · `통과  명단 검사` · `통과  배포 가드` · `모두 통과`

- [ ] **Step 5: 커밋**
```bash
git add -- privacy.html docs/notes/memorize.md CLAUDE.md tests/mem-stats-logic.test.mjs
git commit -m "docs(개인정보 · 성경암송 메뉴): privacy 1번에 게시판을 연 기록·보내기 기록을 이름·소속별로 본다는 한 줄(열람 기록 전부가 아니다) · notes 에 featureUsage · 지도 「통계 다섯」" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git show --stat HEAD
git log --oneline -4
```
`git show --stat` 에 위 네 파일만 있는지, `git log` 맨 위 셋이 Task 12 · 11 · 10 차례인지 본다(아래 Step 6 의 `HEAD~2` 가 Task 10 커밋이다).

- [ ] **Step 6: 배포(차례 — 함께 쓰는 자원은 하나씩)**

① **개발 함수** — 앞 조건: 성경암송 구역 1 이 `python tools/deploy-fn.py api --dev` 로 `featureUsage` 를 개발에 올려 둠.
```bash
python tools/preflight.py 2>&1 | grep -E "실패|모두 통과"                 # 모두 통과
python tools/deploy-fn.py church-admin --dev --allow-ahead              # 가지가 아직 main 에 없다
```

② **localhost 확인(개발 DB)** — 카카오가 돌아오는 주소가 8000 이라 그 포트만 쓴다(`CLAUDE.md:41`). 다른 세션이 쓰고 있으면 기다린다(남의 서버를 끄지 않는다).
```bash
netstat -ano | grep ":8000 " | grep LISTEN || echo "8000 비어 있음"     # 「8000 비어 있음」일 때만 다음 줄
python -m http.server 8000                                              # run_in_background 로 띄운다(이 명령은 PID 를 찍지 않는다)
netstat -ano | grep ":8000 " | grep LISTEN                              # 맨 끝 칸이 방금 띄운 서버의 PID — 앞에서 비어 있었으니 내 것이다 · 적어 둔다
```
http://localhost:8000 → 카카오 로그인 → 「개발 DB」 띠가 보이는지 → 성경암송 › 📊 통계 → 「📤 보내기 · 💬 게시판」:
- 「전체기간」에서 안내 한 줄(`USAGE_NOTE`)이 보인다 · 기록이 없으면 「이 기간에 기록이 없어요.」와 안내 한 줄.
- 구역 1 의 개발 스모크가 남긴 시험 계정 줄이 뜨면 구분·소속·이름이 글자 그대로(태그가 먹지 않음) · 어린 부서 시험 계정은 안 뜬다.
- 개발자 도구 네트워크에서 `featureUsage` 응답에 `user_id` 가 없다.
- 다른 탭 넷(기간별 · 구절별 · 도전 · 축복 기도문)이 전과 같다 · 탭을 오가도 「불러오는 중…」에서 멈추지 않는다 · 이 탭에서는 도전 현황의 구분·소속 거르기가 숨는다.
- 끝나면 **내가 띄운 PID 만** 끈다: `taskkill //PID <위에서 적어 둔 PID> //F`.

③ **(손으로 · 개발 DB 를 다른 세션이 안 쓸 때 한 번)** 개발 서버 시험:
```bash
set -a; . ~/.church-admin/dev.env; set +a
node --experimental-strip-types --test tests/server.dev.test.mjs 2>&1 | grep -E "^# (pass|fail)|PROBE 에 없음|featureUsage"
```
기대: 실패 줄에 `featureUsage` 가 없다.
- 「권한 표: 사람 다섯 × 역할이 필요한 액션」 은 `PROBE` 차례대로 도는데 `featureUsage` 는 셋째(`meditationWeeks` · `getVerses` 다음)라 일찍 닿는다 — none·pending·disabled 는 403 각 문지기 글, ministry·directory·bibleevent 는 403 `forbidden`, super 는 500 이 아니고 `GATES` 글이 아니면 통과. 이 시험은 api 옛 판(`unknown action: featureUsage`)이나 `unauthorized` 를 못 잡는다(그 글이 `GATES` 에 없다 · `server.dev.test.mjs:302`) — 그것은 ② 의 화면 확인 몫.
- ⚠️ 「역할이 필요한 액션마다 시험 입력(PROBE)이 있다」 는 **이번 일 전부터** 실패한다 — `898de05` 에서 역할이 필요한 액션 59개가 `PROBE` 에 없고, 시험이 첫 빠짐(`PROBE 에 없음: memberFind`)에서 멈춘다. 그래서 이 시험으로는 `featureUsage` 가 보이지 않는다(PROBE 에 있는지는 Task 10 의 `tests/authz.test.mjs` 시험이 본다). 그 줄의 이름이 `featureUsage` 가 아니면 이번 일과 무관하다.

④ **운영 앞 조건** — 성경암송 api 의 `featureUsage` 가 운영에 나갔는지(성경암송 worktree `C:\Projects\wt-usage` 에서):
```bash
python tools/status.py                     # api 줄이 「같음」(종료코드는 「다름」이 하나라도 있으면 1 — 화면·Actions 줄의 「다름」은 그 까닭을 따로 본다)
git fetch origin && git show origin/main:supabase/functions/api/index.ts | grep -c '"featureUsage"'   # 2 이상(case · INTERNAL_ADMIN_OK)
```
안 나갔으면 여기서 멈춘다(교회 어드민 화면을 먼저 올리면 탭이 「처리하지 못했어요」만 보인다).

⑤ **운영 — 함수 먼저, 화면은 뒤에**(다시 교회 어드민 worktree 에서):
```bash
git fetch origin
git rebase origin/main                     # main 이 움직였으면 · 그 뒤 git log --oneline -4 로 차례 확인
python tools/preflight.py 2>&1 | grep -E "실패|모두 통과"                 # 모두 통과
git push origin HEAD~2:main                # Task 10 커밋만 main 에(함수·시험만 — 화면은 그대로)
python tools/deploy-fn.py church-admin --prod --dry-run                 # 걸리는 것 없는지(함수 폴더가 origin/main 과 같다 — Task 11·12 는 그 폴더를 안 고친다)
python tools/deploy-fn.py church-admin --prod
git push origin HEAD:main                  # Task 11·12 — 화면 · privacy.html 이 운영으로(Actions: preflight → stamp → Pages · bump 없음)
gh run list --repo sewoongkim1/church-admin --limit 3                   # 맨 위 success
```
화면 푸시 날: 함수 운영 뒤면 언제든 되지만, **성경암송 앱 판(구역 2~4 · 방침 세 자리)이 나가는 같은 날**이면 두 안내가 같은 날 같은 말을 한다(친구 결정).

⑥ **이번 판에만 있는 표식으로 확인**:
```bash
curl -s "https://admin.onlybible.kr/js/menus/memorize/stats-logic.js?nocache=$(date +%s)" | grep -c '"featureUsage"'      # 1 이상
curl -s "https://admin.onlybible.kr/privacy.html?nocache=$(date +%s)" | grep -c "역할을 드린 담당자는 이 화면의 성경암송 메뉴에서"   # 1
```

- [ ] **Step 7: 운영 확인**
- admin.onlybible.kr(「개발 DB」 띠 없음) → 성경암송 › 📊 통계 → 다섯째 탭이 열리고 안내 한 줄이 보인다 · 다른 탭 넷 그대로 · `privacy.html` 1번에 새 문장(「열람 기록 가운데 게시판을 연 날·횟수와 보내기 기록」).
- 성경암송 앱 판(구역 2~4)이 나간 뒤: 시험 계정으로 게시판 열기 · 판 셋(기도문 · 묵상 · 이번 주 말씀) 열기 · 카카오톡 열기 · 공유 창에서 앱 고르기 · 공유 창 닫기(취소)를 한 번씩 → 다음 날이 아니어도 「최근 7일」로 탭에서 그 이름이 뜨는지, 취소한 것은 공유 창 수에 안 오르는지 본다.
- 첫날 수가 낮으면 「안 쓴다」로 읽지 않는다 — 켜 둔 앱에는 옛 `js/pray-share.js` 가 다시 켤 때까지 남는다(설계 5절).

---

---

## 구역 6 — 문서 · 합치기 · 배포 · 운영 확인 (Task 13~14)

| 파일 | 맡은 일 |
|---|---|
| `docs/notes/metrics.md` | 값 표에 다섯(+ 빠져 있던 edu · duty · navi) |
| `docs/notes/backend-api.md` | `featureUsage` 액션 · `featureLog` 어린 부서 거르기 |
| `docs/notes/prayer-book.md` | 「서버로 아무것도 안 간다」 → 「누른 사실만 남긴다(그림 · 이름은 안 간다)」 |
| `docs/superpowers/specs/2026-11-04-prayer-share-design.md` | 23 · 88 「기록 없음 · 방침 그대로」 줄에 「2026-11-06 바뀜 → 이 설계」 |
| `CLAUDE.md` | 「측정」 줄에 한 줄 + 링크 |

### Task 13: 문서 맞추기

**Files:** Modify `docs/notes/metrics.md` · `docs/notes/backend-api.md` · `docs/notes/prayer-book.md` · `docs/superpowers/specs/2026-11-04-prayer-share-design.md` · `CLAUDE.md`
**Interfaces:** Consumes 이름 표(설계서 2절) · Task 1~12 의 결과 / Produces 없음

- [ ] **Step 1:** `docs/notes/metrics.md` 값 표(24~35 근처)에 줄 여덟을 더한다: `board`(게시판을 열 때 · item 0) · `share-open`(보내기 판을 새로 열 때 · 1 기도문 2 묵상 3 이번 주 말씀) · `share-kakao`(카카오톡을 연 순간 · 3) · `share-sheet`(공유 창으로 넘김 · 종류 1~9) · `share-save`(내려받기 · 복사 · 종류 1~9) · `edu`(🎓 교육 목록 · 0) · `duty`(🙋 봉사 당번 · 0) · `navi`(📚 주제별 성경암송 · 0). 표 아래에 「다섯 값(board · share-*)은 2026-11-06 부터 · 어린 부서는 남기지 않는다 · 보는 곳 교회 어드민 📊 통계 「📤 보내기 · 💬 게시판」 · 설계 `docs/superpowers/specs/2026-11-06-share-board-usage-log-design.md`」.
- [ ] **Step 2:** `docs/notes/backend-api.md` 의 액션 목록에 `featureUsage`(관리자 · 내부 키 `INTERNAL_ADMIN_OK` · 다섯 값을 이름 · 소속별로 · `user_id` 없음 · 교회 어드민 📊 통계가 부른다)를 `blessingUsage` 줄 옆에 더하고, `featureLog` 줄에 「다섯 값은 어린 부서(needsGuardian)면 `skipped: "guardian"`」을 더한다.
- [ ] **Step 3:** `docs/notes/prayer-book.md` 에서 「서버로 아무것도 가지 않는다」를 담은 줄(85 근처)을 「2026-11-06 부터 누른 사실만 남긴다 — 판 열기 · 카카오톡 열기 · 공유 창 · 내려받기의 날 · 종류 · 횟수(feature_log · 그림 · 이름 칸 · 받는 분은 안 간다) · 상세 `docs/superpowers/specs/2026-11-06-share-board-usage-log-design.md`」로 고친다.
- [ ] **Step 4:** `docs/superpowers/specs/2026-11-04-prayer-share-design.md` 23 · 88 근처 「기록(feature_log) — 이번에는 없다」 · 「서버 · SQL · 개인정보 방침은 바뀌지 않는다」 줄 끝에 「(2026-11-06 바뀜 — 보내기 기록을 남긴다 · `2026-11-06-share-board-usage-log-design.md`)」.
- [ ] **Step 5:** `CLAUDE.md` 표의 「측정(카드 쓰임·전환율·열람 기록)」 줄에 「· **보내기 · 게시판 이용 기록(2026-11-06 · feature_log 값 다섯 · 어린 부서 제외 · 교회 어드민 📊 통계 탭)**」을 더하고 읽을 것 칸에 `docs/superpowers/specs/2026-11-06-share-board-usage-log-design.md` 를 더한다(한 줄만 — 사연은 노트에).
- [ ] **Step 6:** `python tools/preflight.py` → 종료 코드 0 · `git add -- docs/notes/metrics.md docs/notes/backend-api.md docs/notes/prayer-book.md docs/superpowers/specs/2026-11-04-prayer-share-design.md CLAUDE.md` · `git commit -m "docs(이용 기록): 보내기 · 게시판 값 다섯 · featureUsage · 방침 바뀜 메모"`.

### Task 14: 합치기 · 배포 · 운영 확인(본 세션이 한다 — 하위 에이전트에게 맡기지 않는다)

**Files:** 없음(명령만)
**Interfaces:** Consumes Task 1~13 의 커밋(가지 `usage-log` · `usage-log-ca`) / Produces 운영 반영

- [ ] **Step 1 — api 먼저(Task 1~2 커밋만):** 공유 체크아웃에서 `git fetch origin` → `git status -sb` → `git cherry-pick <Task 1 · 2 커밋들>`(가지 순서대로) → `python tools/preflight.py`(0) → `git push origin main` → `python tools/deploy-fn.py api --dev` → 개발 스모크(`bash tests/feature-log-smoke.sh` · Task 1~2 가 적은 환경 변수 그대로) → `python tools/deploy-fn.py api --prod --dry-run` → `--prod` → 운영 스모크(`EVT_ENV`류 운영 스위치를 그 파일 머리 주석대로 · 빼면 개발을 본다) · 남의 경로 한 번(`getVerses`·`ranking`).
- [ ] **Step 2 — 앱 + 방침 한 판(Task 3~9 · 13 커밋):** `git cherry-pick <Task 3~9 · 13 커밋들>` → `python tools/bump.py` → bump 가 바꾼 줄이 태그 · 판 번호뿐인지 확인 → `python tools/preflight.py`(0) → 경로 지정 커밋(bump 파일) → `git push origin main` → 배포 실행이 커밋 sha 로 잡혔는지(`gh run list` · 안 잡히면 `gh workflow run deploy.yml --ref main` 을 30초 간격으로) → 「이번 판에만 있는 표식」: 라이브 `app.js?v=<태그>` 의 `APP_BUILD` = 태그 · `const USAGE_FEATURES` · `logFeature("board", 0)` · 라이브 `js/pray-share.js?v=<태그>` 의 `function pshLog` · 라이브 `privacy/` 의 「보내기 기록」 · 「마지막 수정: 2026년 11월 6일」.
- [ ] **Step 3 — 교회 어드민(Task 10~12):** 교회 어드민 공유 체크아웃에서 `git fetch origin` → 함수 커밋(Task 10)만 먼저 `cherry-pick` → 그 저장소 preflight → `git push origin main` → `python tools/deploy-fn.py church-admin --dev` → localhost:8000(개발 DB)을 **화면 커밋이 다 든 worktree `C:\Projects\wt-usage-ca` 에서** 띄워 📊 통계 새 탭이 뜨는지(2026-11-06 검토 — 공유 체크아웃은 그때 옛 화면이라 탭이 없다 · 기대는 「빈 결과」가 아니라 개발 스모크가 쓴 계측시험 한 줄(게시판 ≥1 · 카톡 열기 ≥1) · 종류별에 이번 주 말씀 · 계측어린이 없음 · 응답 본문에 user_id 없음) → `--prod` → 화면 커밋(Task 11 · 12)을 `cherry-pick` → preflight → `git push origin main`(Pages = 곧 운영).
- [ ] **Step 4 — 운영 확인:** 이 PC 크롬(deviceId `04f903fe-105d-485d-9fdb-63eae0a6beef` — `list_connected_browsers` 로 먼저)에서 admin.onlybible.kr 📊 성경암송 통계 → 「📤 보내기 · 💬 게시판」 탭이 열리고(오류 글 없음) 기간을 바꿔도 되는지 · 응답에 `user_id` 가 없는지(`read_network_requests` 로 응답 본문 확인) · 기록이 쌓이기 시작하면 이름 줄이 뜨는지(첫날은 앱을 다시 켠 분부터 — 켜 둔 앱은 옛 판).
- [ ] **Step 5 — 정리:** `git worktree remove /c/Projects/wt-usage` · `git -C /c/Projects/church-admin worktree remove /c/Projects/wt-usage-ca`(남은 변경이 없을 때만) · 가지 지우기는 main 에 다 들어간 것을 `git branch --merged` 로 본 뒤 · 메모리 feature-log-live · prayer-share-2026-11 에 한 줄 · 친구에게 보고(커밋 범위 · 판 · 스모크 수 · 확인한 것 · 남은 것).
