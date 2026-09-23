# 「우리 교구 안에서」 순위 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 개인 순위 화면에 [우리 교구 | 전체] 칩을 더해, 중위 성도님이 **닿을 수 있는 표**를 기본으로 보게 한다.

**Architecture:** 서버·SQL 은 순위 쪽을 한 줄도 안 고친다 — `ranking` 응답이 이미 이름·구분·소속·횟수·응원을 모두 준다.
거르기·재번호는 `narrowRanking()` **순수 함수** 하나로 떼어 `node --test` 로 덮고 `preflight` 그물에 건다.
그리기는 `loadRankingBody`(받아오기) / `drawRankingBody`(그리기) 로 나눠, **칩 전환이 서버를 다시 부르지 않게** 한다.

**Tech Stack:** Vanilla JS · `node:test`(꾸러미 없음) · Supabase Edge Function(`featureLog` 액션 한 줄만)

**설계:** `docs/superpowers/specs/2026-09-23-narrow-ranking-design.md`

## Global Constraints

- **`.rank-filter` 를 재사용하지 않는다** — 앨범 자가점검·이어 듣기·필사 칩·필사 탭·교구 순위가 나눠 쓰는 공용 클래스다.
- **`.rank-mode` 안에 새 단추를 넣지 않는다** — `wireRankMode()`(app.js:9310-9311)가 `document.querySelectorAll(".rank-mode button")` 로 **전부** 집어 `renderRanking()` 을 인자 없이 부른다(기간이 리셋된다).
- **금색(`--gold`)·초록을 쓰지 않는다** — 이 화면에서 금색은 「상위 3명」(`.rank-row.top`), 초록은 「지금 함께 암송 중」(`.rank-row.live`)이다. 새 색을 **한 개도 만들지 않는다**.
- **`user_id` 를 화면·응답 어디에도 싣지 않는다**(이 API 에는 JWT 가 없다).
- **줄 번호를 믿지 말고 `grep` 으로 표식을 찾는다** — 같은 체크아웃에서 다른 세션이 계속 커밋한다. 이 문서의 줄 번호는 2026-09-23 HEAD(`a1aaee7`) 기준이다.
- **커밋은 경로를 못 박는다**: `git commit -m "..." -- <파일들>`. `git add -A` 금지.
- **판 올리기(`python tools/bump.py`)는 Task 6 에서 한 번만.**

---

## File Structure

| 파일 | 하는 일 | Task |
|---|---|---|
| `tests/ranking-scope.test.cjs` | **새로 만듦** — `narrowRanking` 검사 8가지. 꾸러미 0개 | 1 |
| `tools/preflight.py` | `PURE_TESTS` 한 묶음 추가 — 검사가 떨어지면 배포가 안 돈다 | 1 |
| `app.js` (`narrowRanking`) | **순수 함수** — 거르기·재번호·3명 게이트. DOM·전역을 안 본다 | 1 |
| `supabase/ranking_scope_dev_seed.sql` | **새로 만듦** — 개발 DB 전용 가짜 성도 8명 | 2 |
| `app.js` (`loadRankingBody`/`drawRankingBody`) | 받아오기와 그리기를 가른다 | 3 |
| `app.js` (칩·문구) + `style.css` (`.rank-scope`) | 칩 세 갈래와 좁힌 목록 | 4 |
| `app.js` (`logFeature`) + `supabase/functions/api/index.ts` (`FEATURES`) | 측정 한 줄 | 5 |
| `docs/notes/ranking-cheer.md` · `CLAUDE.md` · 설명서 | 기록 | 6 |

---

## ⚠️ 시작 전에 알아야 할 것 — 다른 세션과 겹치는 자리

**`feature_log` 는 다른 세션이 만들고 있다**(`docs/superpowers/plans/2026-09-23-feature-log.md`).
표(`2c7f54b`)·서버 액션(`18cd921`)·앱 공용 함수 `logFeature()`(`d9675f6`)까지 **이미 커밋됐다.**
남은 것은 그 계획의 **Task 9(운영 배포)** 다.

이 계획이 하는 일은 **그 위에 한 줄 얹는 것뿐**이다:
- `FEATURES` 에 `"ranking-scope"` 한 줄(Task 5)
- `logFeature("ranking-scope", ...)` 호출(Task 5)

⚠️ **운영에 아직 `feature_log` 표도 `featureLog` 액션도 없다.** 그래서 Task 5 를 배포해도
**그 세션의 Task 9 가 끝나기 전까지 기록은 0 이다.** 그건 정상이고, 화면은 아무 영향을 안 받는다
(`logFeature` 가 실패를 삼킨다 — 단 Task 5 Step 1 의 `.catch` 를 반드시 붙여야 한다).

⚠️ **`supabase functions deploy` 는 git 이 아니라 작업 트리를 통째로 올린다.**
Task 5 에서 배포하면 그 세션의 커밋된 `index.ts` 변경(`featureLog` 액션 전체)이 **함께 나간다.**
배포 전에 `git status` 를 보고, 그 세션과 순서를 맞춘다.

---

## Task 1: `narrowRanking` 순수 함수 · 검사 · preflight 그물

**Files:**
- Create: `tests/ranking-scope.test.cjs`
- Modify: `app.js` (`async function loadRankingBody(` 바로 앞)
- Modify: `tools/preflight.py` (`# ── 결과 ──` 앞)

**Interfaces:**
- Produces: `narrowRanking(list, me) → { ok, reason, list, ranks, count }`
  - `ok` — 같은 소속이 3명 이상인가 (boolean)
  - `reason` — `""`(ok) · `"no-scope"`(비로그인·소속 빈칸) · `"too-few"`(2명 이하)
  - `list` — 좁힌 줄들, **원본 객체 그대로**. ok 가 아니면 `[]`
  - `ranks` — `list` 와 짝이 되는 화면 등수 `[1,2,3…]`
  - `count` — 같은 소속 줄 수 (게이트를 못 넘어도 안내 문구의 N 에 쓴다)
- Produces: `MIN_SCOPE_ROWS = 3`

⚠️ **세 파일은 반드시 한 커밋으로 나간다.** `preflight.py` 만 먼저 들어가면 **그 푸시부터 배포가 멈춘다**(파일 없음·표식 없음 둘 다 종료코드 1).

- [ ] **Step 1: 검사 파일을 만든다**

`tests/ranking-scope.test.cjs`:

```js
// 「우리 교구 안에서」 순위 — narrowRanking(거르기 · 재번호 · 3명 게이트) 검사.
//
//   node --test tests/ranking-scope.test.cjs
//
// ⚠️ **꾸러미를 하나도 쓰지 않는다**(node:test·node:assert·node:fs·node:path·node:vm 뿐).
//    그래서 tools/preflight.py 가 이 검사를 배포 앞 그물에 걸 수 있다 —
//    tests/member-*.test.cjs 는 PGlite·jsdom·typescript 가 있어야 해서 못 걸었다.
//    ⚠️ 여기에 require('jsdom') 같은 줄을 더하는 순간 배포가 통째로 멈춘다. 더하지 말 것.
//
// app.js 는 브라우저용 전역 스크립트라 require() 할 수 없다. tests/member-profile.test.cjs 가
// applyServerUser 를 떼어 내는 것과 같은 방식으로, 두 표식 사이만 잘라 vm 에서 돌린다.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const start = source.indexOf('const MIN_SCOPE_ROWS =');
const end = source.indexOf('async function loadRankingBody(');
assert.ok(start >= 0, 'app.js 에서 MIN_SCOPE_ROWS 를 못 찾았다 — 이 검사가 낡았다');
assert.ok(end > start, 'app.js 에서 narrowRanking 이 loadRankingBody 바로 앞에 없다 — 이 검사가 낡았다');
const context = vm.createContext({});
vm.runInContext(source.slice(start, end), context);
const narrowRanking = context.narrowRanking;
assert.equal(typeof narrowRanking, 'function', 'narrowRanking 을 못 떼어 냈다');

// 서버 ranking 응답의 줄 모양 그대로 (index.ts 가 주는 칸들).
const row = (rank, name, sosok, count, gubun = '교구') => ({
  rank, name, gubun, sosok, sebu: '1', count, typing: count, voice: 0,
  activeToday: true, cheers: 0, iCheered: false, liveNow: false,
});

// 사랑 5명 · 소망 3명 · 청년부 1명이 서버 등수대로 섞여 있는 목록.
const sample = () => [
  row(1, '가성도', '사랑', 40),
  row(2, '나성도', '소망', 33),
  row(3, '다성도', '사랑', 30),
  row(4, '라성도', '소망', 28),
  row(5, '마성도', '사랑', 22),
  row(6, '바성도', '청년부', 20, '교회학교'),
  row(7, '사성도', '소망', 18),
  row(8, '아성도', '사랑', 9),
  row(9, '자성도', '사랑', 4),
];
const me = (sosok, gubun = '교구') => ({ gubun, sosok });

// ① 다른 소속이 안 섞인다
test('같은 소속 줄만 남는다 — 다른 교구·교회학교는 한 줄도 안 섞인다', () => {
  const list = sample();
  const out = narrowRanking(list, me('사랑'));
  assert.equal(out.ok, true);
  assert.deepEqual(out.list.map((x) => x.name), ['가성도', '다성도', '마성도', '아성도', '자성도']);
  assert.ok(out.list.every((x) => x.sosok === '사랑' && x.gubun === '교구'));
  assert.equal(out.count, 5);
  // 서버가 준 순서(cnt desc)를 그대로 보존한다 — 거른 뒤 다시 정렬하지 않는다
  assert.deepEqual(out.list.map((x) => x.count), [40, 30, 22, 9, 4]);
  // 교회학교는 부서명이 그대로 sosok 이다 — 교구 목록에 섞이지 않는다
  const bu = narrowRanking(list, me('청년부', '교회학교'));
  assert.equal(bu.count, 1);
  assert.equal(bu.ok, false);
});

// ② 번호가 1부터다
test('화면 등수는 1부터 빠짐없이 이어진다 — 서버 등수(1·3·5·8·9)와 다르다', () => {
  const out = narrowRanking(sample(), me('사랑'));
  assert.deepEqual(out.ranks, [1, 2, 3, 4, 5]);
  assert.equal(out.ranks.length, out.list.length);
  assert.deepEqual(out.list.map((x) => x.rank), [1, 3, 5, 8, 9]); // 원본은 그대로 성긴 채
  // 🥇🥈🥉 와 .rank-row.top 이 같은 값을 봐야 한다 — 금색 줄은 ranks[i] <= 3 인 셋
  assert.deepEqual(out.ranks.filter((n) => n <= 3), [1, 2, 3]);
});

// ③ 원본 x.rank 가 안 변한다
test('원본 목록을 건드리지 않는다 — x.rank 도 길이도 그대로', () => {
  const list = sample();
  const before = list.map((x) => ({ ...x }));
  const len = list.length;
  narrowRanking(list, me('사랑'));
  narrowRanking(list, me('소망'));
  narrowRanking(list, null);
  assert.equal(list.length, len);
  assert.deepEqual(list, before);
  // 「내 순위」 바가 보는 객체(me = list.find(...))의 등수가 그대로여야 전체 순위를 복구할 수 있다
  const mine = list.find((x) => x.name === '자성도');
  assert.equal(mine.rank, 9);
});

// ④ 걸러진 원소가 원본과 같은 객체다 (===)
test('걸러진 줄은 원본과 같은 객체다 — 사본을 만들지 않는다', () => {
  const list = sample();
  const out = narrowRanking(list, me('사랑'));
  for (const x of out.list) assert.ok(list.includes(x), `${x.name} 이 사본이다`);
  assert.equal(out.list[0], list[0]);
  assert.equal(out.list[4], list[8]);
  // 응원은 배열 원소를 제자리에서 고친다(giveRankCheer) — 좁힌 화면에서 누른 👏가
  // 「전체」로 돌아가도 그대로 보여야 한다. 사본을 쓰면 여기서 깨진다.
  const target = out.list[1];
  target.iCheered = true;
  target.cheers = (target.cheers || 0) + 1;
  assert.equal(list[2].iCheered, true);
  assert.equal(list[2].cheers, 1);
});

// ⑤ 3명 게이트 — 세 갈래
test('게이트 (a) 같은 소속 3명 이상이면 켠다', () => {
  const out = narrowRanking(sample(), me('소망'));
  assert.equal(out.ok, true);
  assert.equal(out.reason, '');
  assert.equal(out.count, 3);
  assert.deepEqual(out.ranks, [1, 2, 3]);
});

test('게이트 (b) 2명 이하면 안 켜고, 안내 문구에 쓸 N 을 준다', () => {
  const two = [row(1, '가성도', '화평', 10), row(2, '나성도', '사랑', 9), row(3, '다성도', '화평', 8)];
  const out = narrowRanking(two, me('화평'));
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'too-few');
  assert.equal(out.count, 2);        // 「이번 기간에 …에서 기록하신 분은 2명이에요」
  // ⚠️ 빈 배열은 .length 로 본다 — vm 으로 떼어 낸 코드가 만든 [] 는 realm 이 달라
  //    deepEqual/deepStrictEqual 둘 다 「구조는 같은데 참조가 다르다」로 떨어진다(검사만의 사정).
  assert.equal(out.list.length, 0);
  assert.equal(out.ranks.length, 0);
  // 나 혼자 · 한 명도 없음도 같은 갈래
  assert.equal(narrowRanking(two, me('기쁨')).count, 0);
  assert.equal(narrowRanking(two, me('기쁨')).reason, 'too-few');
});

test('게이트 (c) 비로그인 · 소속 빈칸이면 칩을 안 그린다', () => {
  for (const bad of [null, undefined, {}, { gubun: '교구' }, { gubun: '교구', sosok: '' }, { sosok: '사랑' }]) {
    const out = narrowRanking(sample(), bad);
    assert.equal(out.ok, false, JSON.stringify(bad));
    assert.equal(out.reason, 'no-scope', JSON.stringify(bad));
    assert.equal(out.count, 0);
    assert.equal(out.list.length, 0);
    assert.equal(out.ranks.length, 0);
  }
});

test('목록이 비어 있거나 배열이 아니어도 터지지 않는다', () => {
  for (const bad of [[], null, undefined]) {
    const out = narrowRanking(bad, me('사랑'));
    assert.equal(out.ok, false);
    assert.equal(out.reason, 'too-few');
    assert.equal(out.count, 0);
  }
});
```

- [ ] **Step 2: 검사를 돌려 「낡았다」로 떨어지는 것을 본다**

```bash
node --test tests/ranking-scope.test.cjs
```

기대(종료코드 1):
```
# AssertionError [ERR_ASSERTION]: app.js 에서 MIN_SCOPE_ROWS 를 못 찾았다 — 이 검사가 낡았다
not ok 1 - tests/ranking-scope.test.cjs
```

- [ ] **Step 3: `app.js` 에 순수 함수를 넣는다**

자리를 `grep` 으로 찾는다 — `async function loadRankingBody(` 는 app.js 에 **한 번만** 나온다:

```bash
grep -n "async function loadRankingBody(" app.js
```

그 줄 **바로 위 빈 줄**에 아래를 통째로 넣는다:

```js
// 순위 목록을 「나와 같은 소속」으로 좁힌다 — 거르기 · 재번호 · 3명 게이트.
// ⚠️ 순수 함수로 둔다(DOM·전역·localStorage·fetch 를 안 본다). tests/ranking-scope.test.cjs 가
//    이 덩어리만 떼어 내 node 로 돌리고, tools/preflight.py 가 그 검사를 배포 앞에 건다.
// ⚠️ 원본 줄 객체를 그대로 담는다(사본 금지) — 응원은 배열 원소를 제자리에서 고치므로
//    사본을 쓰면 「우리 교구」에서 누른 👏가 「전체」로 돌아갔을 때 안 눌린 것으로 보인다.
// ⚠️ x.rank 를 덮어쓰지 않는다 — me 는 list 안의 같은 객체라 「내 순위」 바가 함께 바뀐다.
//    화면 등수는 ranks[i] 로만 만든다(🥇 와 .rank-row.top 이 같은 값을 봐야 한다).
// ⚠️ 거른 뒤 다시 정렬하지 않는다 — v2_ranking 이 이미 (cnt desc, name) 순이라
//    거르기가 순서를 보존하면 i+1 이 서버 규칙과 어긋나지 않는다.
// 돌려주는 것 { ok, reason, list, ranks, count }
//   ok      같은 소속이 3명 이상이라 「우리 교구」를 보여 줄 수 있나
//   reason  ""(ok) · "no-scope"(비로그인·소속 빈칸) · "too-few"(2명 이하)
//   list    좁힌 줄들 — 원본 객체 그대로 (ok 가 아니면 [])
//   ranks   list 와 짝이 되는 화면 등수 1,2,3…
//   count   같은 소속으로 걸러진 줄 수 (게이트를 못 넘어도 안내 문구의 「N명」에 쓴다)
const MIN_SCOPE_ROWS = 3; // 나 + 둘. 둘이라도 있어야 「순위」라는 말이 성립한다

function narrowRanking(list, me) {
  const rows = Array.isArray(list) ? list : [];
  const gubun = me && me.gubun ? String(me.gubun) : "";
  const sosok = me && me.sosok ? String(me.sosok) : "";
  // 비로그인 · 소속 빈칸 — 칩 자체를 안 그린다
  if (!gubun || !sosok) return { ok: false, reason: "no-scope", list: [], ranks: [], count: 0 };
  // ⚠️ sebu(목장·학년)로는 거르지 않는다 — 자유 입력이고, 목장 단위는 설계상 이번에 안 한다
  const mine = rows.filter((x) => x && x.gubun === gubun && x.sosok === sosok);
  if (mine.length < MIN_SCOPE_ROWS) {
    return { ok: false, reason: "too-few", list: [], ranks: [], count: mine.length };
  }
  return { ok: true, reason: "", list: mine, ranks: mine.map((_, i) => i + 1), count: mine.length };
}
```

⚠️ **이 함수와 `loadRankingBody` 사이에 다른 함수를 끼우지 말 것.** 검사가 `const MIN_SCOPE_ROWS =` ~ `async function loadRankingBody(` 사이를 문자열로 잘라 `vm` 에 넣는다 — 사이에 전역을 보는 코드가 들어가면 거기서 터진다.

- [ ] **Step 4: 검사가 통과하는 것을 본다**

```bash
node --test tests/ranking-scope.test.cjs
```

기대(종료코드 0):
```
# tests 8
# suites 0
# pass 8
# fail 0
```

- [ ] **Step 5: `tools/preflight.py` 에 검사를 건다**

`# ── 결과 ────` 줄 **바로 앞**에 넣는다:

```python
# ── 3) 순수 함수 검사 (꾸러미 없이 도는 것만) ───────────────────────
# ⚠️ 여기에는 **npm 꾸러미가 필요 없는** 검사만 적는다. tests/member-*.test.cjs 는
#    PGlite·jsdom·typescript 가 있어야 해서 못 넣는다 — 넣으면 Actions 러너에
#    node_modules 가 없어 배포가 통째로 멈춘다. 새 검사를 더할 때도 기준은 같다:
#    node 내장(node:test·node:assert·node:fs·node:path·node:vm)만 쓰는가.
PURE_TESTS = ["tests/ranking-scope.test.cjs"]

print("\n[3] 순수 함수 검사 (node --test)")
for t in PURE_TESTS:
    if not os.path.exists(os.path.join(ROOT, t)):
        bad("%s — 파일이 없다 (지웠으면 preflight.py 의 PURE_TESTS 에서도 뺄 것)" % t)
        continue
    r = subprocess.run(["node", "--test", t], cwd=ROOT,
                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    out = r.stdout.decode("utf-8", "replace")
    if r.returncode == 0:
        m = re.search(r"^# pass (\d+)", out, re.M)
        ok("%s — %s가지 통과" % (t, m.group(1) if m else "?"))
    else:
        hits = [ln for ln in out.splitlines()
                if ln.startswith("not ok") or "AssertionError" in ln or "Error:" in ln]
        detail = "\n".join("        " + ln.strip() for ln in hits[:12]) \
                 or "        " + out.strip()[:400]
        bad("%s — 검사가 떨어졌다\n%s\n        → node --test %s 로 자세히 볼 것" % (t, detail, t))
```

⚠️ `os` · `re` · `subprocess` 가 파일 위쪽에 이미 import 돼 있는지 확인한다. 없으면 더한다.

- [ ] **Step 6: preflight 전체를 돌린다**

```bash
python tools/preflight.py
```

기대(종료코드 0 · 약 1.6초):
```
[3] 순수 함수 검사 (node --test)
  통과  tests/ranking-scope.test.cjs — 8가지 통과

모두 통과 — 배포해도 된다.
```

- [ ] **Step 7: 그물이 실제로 무는지 한 번 확인한다**

`app.js` 의 `MIN_SCOPE_ROWS = 3` 을 잠깐 `2` 로 바꾸고:

```bash
python tools/preflight.py
```

기대(종료코드 1):
```
  실패  tests/ranking-scope.test.cjs — 검사가 떨어졌다
        not ok 6 - 게이트 (b) 2명 이하면 안 켜고, 안내 문구에 쓸 N 을 준다
배포를 멈춘다 — 1가지가 걸렸다.
```

확인했으면 **`3` 으로 되돌린다.**

- [ ] **Step 8: 커밋 — 세 파일을 함께**

```bash
git status --porcelain
git commit -m "feat(순위): narrowRanking — 거르기·재번호·3명 게이트 + 배포 앞 검사

거르기·재번호는 순수 계산이라 꾸러미 없이 node --test 로 덮고 preflight 에 걸었다.
tests/member-*.test.cjs 가 preflight 에 못 들어간 이유(PGlite·jsdom)를 피한다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" \
  -- app.js tests/ranking-scope.test.cjs tools/preflight.py
```

---

## Task 2: 개발 DB 시드 — (a) 갈래를 눈으로 볼 수 있게

**Files:**
- Create: `supabase/ranking_scope_dev_seed.sql`

**Interfaces:**
- Consumes: 없음 (Task 1 과 독립)
- Produces: 개발 DB 에 가짜 성도 8명(믿음 5 · 사랑 3) + 암송 기록 177건 + 응원 3건

⚠️ **왜 필요한가:** 개발 DB 에는 가짜 사람이 한둘뿐이고 `screen-sweep` 은 「믿음-99 화면점검」 **한 사람**으로 붙는다.
설명서·앱스토어 캡처 도구는 `ranking` 응답을 아예 `{ok:true,list:[]}` 로 막아 둔다.
**시드 없이는 칩이 켜지고 목록이 걸러진 상태가 한 번도 안 그려진다.**

- [ ] **Step 1: 시드 파일을 만든다**

`supabase/ranking_scope_dev_seed.sql`:

```sql
-- 「우리 교구 안에서」 순위 칩 — **개발 DB 전용** 시드 (2026-09-23)
--   ⚠️⚠️ **운영(xnomlgydifiqiybervtf)에 절대 돌리지 말 것.** 가짜 성도 8명과 암송 기록 177건이
--        순위표·교구 순위·주간 리포트에 그대로 섞여 들어간다. 개발은 ktpwthwqzgcqcrmsafdo 다
--        (supabase/dev-setup.md). `supabase db query --linked` 는 **운영**이니 쓰지 말 것.
--
-- ■ 무엇이 들었나
--   같은 교구(믿음) 5명 + 다른 교구(사랑) 3명 = 8명. 횟수가 전부 달라 순위가 갈린다.
--   목장 번호를 90~96 으로 몰아 두었다(화면점검만 99) — 개발 DB에서 한눈에 가려내고 한 번에 지운다.
--   ┌ 이름   소속      합계  어제  오늘  지금(3분전)
--   │ 강믿음 믿음-90    41    25    15     1
--   │ 정온유 사랑-94    37    22    15     0
--   │ 김소망 믿음-91    33    20    13     0
--   │ 화면점검 믿음-99  22    12     9     1   ← screen-sweep·localhost 로그인 계정
--   │ 한은혜 사랑-95    18    18     0     0   ← 오늘 기록 없음 = 응원 잠김(locked) 확인용
--   │ 박사랑 믿음-92    12     6     6     0
--   │ 오평강 사랑-96     9     9     0     0   ← 잠김 둘째
--   └ 최기쁨 믿음-93     5     2     2     1
--   → 「전체」에서 화면점검은 4위, 「우리 교구(믿음)」로 거르면 3위(🥉)가 된다.
--     원본 x.rank 를 안 건드리고 i+1 로 다시 매기는 것(금색 줄도 함께)을 **눈으로** 볼 수 있는 배치다.
--
-- ■ daily_activity 는 손대지 않는다
--   challenge_log 의 INSERT/DELETE 트리거가 채우고 줄인다(daily-activity.sql).
--   직접 넣으면 두 번 세어져 v2_activity_drift() 가 어긋남을 보고한다(monitor 가 매일 부른다).
--   같은 까닭으로 **truncate 금지** — for each row 트리거는 TRUNCATE 에 안 걸린다.
--
-- ■ 여러 번 돌려도 안전하다
--   ① users 는 on conflict do nothing ② challenge_log 는 **먼저 지우고** 다시 넣는다
--   ③ rank_cheers 는 on conflict do update.
--
-- ■ ⚠️ KST 00:11 이전에는 돌리지 말 것
--   3) 의 「오늘」 행은 greatest() 로 **KST 오늘 00:01** 에 고정된다. 지금이 00:11 보다 이르면
--   그 00:01 이 `now() - 10분` 안에 들어와 **오늘 기록 전부가 「지금 함께 암송 중」**으로 보인다
--   (LIVE_MINUTES = 10).
--
-- ■ ⚠️ 부수 효과 둘
--   · 2) 가 위 여덟 명의 **기존 challenge_log 를 지운다** — 화면점검 계정으로 그동안 쌓인 기록도 사라진다.
--   · tools/screen-sweep.py 는 ranking 을 막지 않는다 — 이 시드 뒤로는 18-ranking·19-my-record
--     두 장에 가짜 이름 여덟이 나온다. 설명서·앱스토어 캡처 도구는 영향 없다.
--
-- ■ ⚠️ 고른 다섯 mode 는 전부 이름에 typing 이 들어간다
--   그래서 v2_ranking 의 voice 칸은 여덟 명 모두 **0** 이다. 순위 화면은 voice 를 안 그리므로
--   보이는 것에는 아무 영향이 없다.
--
-- 적용: Supabase 대시보드(ktpwthwqzgcqcrmsafdo) → SQL Editor 에 통째로 붙여넣고 RUN


-- ════════════════════════════════════════════════════════════
-- 0) 전제 확인 — **먼저 한 번만** 돌려 보고 결과를 눈으로 본다
--    verse_no 가 nullable 이어야 한다. 이 DB 에 그 마이그레이션을 안 돌렸고
--    verses 도 비어 있으면 3) 이 not-null 위반으로 멈춘다.
-- ════════════════════════════════════════════════════════════
select (select is_nullable from information_schema.columns
         where table_schema='public' and table_name='challenge_log'
           and column_name='verse_no')            as verse_no_nullable,   -- 'YES' 여야 안전
       (select count(*) from public.verses)       as verses_행수;         -- 0 이면 위가 YES 여야 한다


begin;

-- ════════════════════════════════════════════════════════════
-- 1) 사람 여덟 — identity_key 는 여섯 조각(type|gu|mok|bu|grade|name)
--    ⚠️ 조각을 하나라도 빠뜨리면 그 계정으로 로그인해도 시드 행에 안 붙고 새 계정이 생긴다.
-- ════════════════════════════════════════════════════════════
insert into public.users (type, gu, mok, bu, grade, name, identity_key)
values
  ('교구', '믿음', '90', null, null, '강믿음',   '교구|믿음|90|||강믿음'),
  ('교구', '믿음', '91', null, null, '김소망',   '교구|믿음|91|||김소망'),
  ('교구', '믿음', '92', null, null, '박사랑',   '교구|믿음|92|||박사랑'),
  ('교구', '믿음', '93', null, null, '최기쁨',   '교구|믿음|93|||최기쁨'),
  ('교구', '믿음', '99', null, null, '화면점검', '교구|믿음|99|||화면점검'),
  ('교구', '사랑', '94', null, null, '정온유',   '교구|사랑|94|||정온유'),
  ('교구', '사랑', '95', null, null, '한은혜',   '교구|사랑|95|||한은혜'),
  ('교구', '사랑', '96', null, null, '오평강',   '교구|사랑|96|||오평강')
on conflict (identity_key) do nothing;

-- ════════════════════════════════════════════════════════════
-- 2) 먼저 지운다 — 다시 돌려도 횟수가 두 배가 되지 않게.
--    delete 트리거가 daily_activity 도 함께 줄인다(직접 손대지 않는다).
-- ════════════════════════════════════════════════════════════
delete from public.challenge_log c
 using public.users u
 where u.id = c.user_id
   and u.identity_key in (
     '교구|믿음|90|||강믿음','교구|믿음|91|||김소망','교구|믿음|92|||박사랑',
     '교구|믿음|93|||최기쁨','교구|믿음|99|||화면점검',
     '교구|사랑|94|||정온유','교구|사랑|95|||한은혜','교구|사랑|96|||오평강');

-- ════════════════════════════════════════════════════════════
-- 3) 암송·도전 기록 177건
--    · mode 는 CHECK 에 있는 여덟 값 중 다섯만 쓴다.
--      learn-* 이 섞여야 앱 순위(learn 포함)와 관리자 도전현황(learn 제외)의 차이도 개발에서 보인다.
--    · verse_no 는 verses 에 실제로 있는 번호를 골라 쓴다. verses 가 비어 있으면 null 이 되는데
--      nullable 이라 그대로 들어간다(FK 도 통과).
--    · 시각은 전부 KST 어제·오늘 — 순위 화면 기본 기간이 「전일~당일」이다.
-- ════════════════════════════════════════════════════════════
with seed(ikey, n_yday, n_today, n_live) as (values
  ('교구|믿음|90|||강믿음',   25, 15, 1),
  ('교구|믿음|91|||김소망',   20, 13, 0),
  ('교구|믿음|92|||박사랑',    6,  6, 0),
  ('교구|믿음|93|||최기쁨',    2,  2, 1),
  ('교구|믿음|99|||화면점검', 12,  9, 1),
  ('교구|사랑|94|||정온유',   22, 15, 0),
  ('교구|사랑|95|||한은혜',   18,  0, 0),
  ('교구|사랑|96|||오평강',    9,  0, 0)
),
pick as (
  select s.*, u.id as uid from seed s join public.users u on u.identity_key = s.ikey
),
rows_all as (
  -- 어제: KST 21:00 + g분 (최대 +25분 → 자정을 넘지 않는다)
  select p.uid, g,
         ((((now() at time zone 'Asia/Seoul')::date - 1) + time '21:00')
            at time zone 'Asia/Seoul') + make_interval(mins => g) as ts
    from pick p cross join lateral generate_series(1, p.n_yday) g
  union all
  -- 오늘: 지금에서 20분 + g*9분 만큼 뒤로. KST 오늘 00:01 보다 앞서지 않게 막는다.
  select p.uid, g,
         greatest(
           (((now() at time zone 'Asia/Seoul')::date + time '00:01') at time zone 'Asia/Seoul'),
           now() - interval '20 minutes' - make_interval(mins => g * 9)
         ) as ts
    from pick p cross join lateral generate_series(1, p.n_today) g
  union all
  -- 지금(최근 10분) — 「지금 함께 암송 중」 표시용. LIVE_MINUTES=10
  select p.uid, g, now() - interval '3 minutes' as ts
    from pick p cross join lateral generate_series(1, p.n_live) g
)
insert into public.challenge_log (user_id, verse_no, mode, created_at)
select r.uid,
       (select v.no from public.verses v order by v.no offset (r.g % 5) limit 1),
       (array['learn-typing','typing','review-typing','learn-typing-card','typing-card'])[1 + (r.g % 5)],
       r.ts
  from rows_all r;

-- ════════════════════════════════════════════════════════════
-- 4) 응원 세 건 (cheer_date 는 KST 오늘)
--    ⚠️ user_id 두 칸이 text 다 — ::text 캐스트가 필요하다.
--    · 주는 쪽·받는 쪽 **둘 다 오늘 기록이 있는 사람**으로만 골랐다 — 앱의 관문과 같은 조건이다.
--    · 화면점검이 받은 둘 중 하나는 **다른 교구(사랑)** 에서 온 것이다 —
--      「👏는 소속과 무관하다」를 개발에서 확인할 자리.
--    · 셋째 줄은 화면점검이 **준** 것 — 김소망 줄의 칩이 켜진(iCheered) 모습을 본다.
-- ════════════════════════════════════════════════════════════
insert into public.rank_cheers (target_user_id, from_user_id, cheer_date, from_name)
select t.id::text, f.id::text, (now() at time zone 'Asia/Seoul')::date, x.from_name
  from (values
    ('교구|믿음|99|||화면점검', '교구|믿음|90|||강믿음', '믿음-90 강믿음'),
    ('교구|믿음|99|||화면점검', '교구|사랑|94|||정온유', '사랑-94 정온유'),
    ('교구|믿음|91|||김소망',   '교구|믿음|99|||화면점검', '믿음-99 화면점검')
  ) as x(tkey, fkey, from_name)
  join public.users t on t.identity_key = x.tkey
  join public.users f on f.identity_key = x.fkey
on conflict (target_user_id, from_user_id, cheer_date)
do update set from_name = excluded.from_name;

commit;

-- ════════════════════════════════════════════════════════════
-- 5) 확인 — 커밋 뒤에 따로 실행한다
-- ════════════════════════════════════════════════════════════

-- 5-a. 집계표가 트리거로 잘 따라왔나 (log_rows 와 agg_sum 이 같아야 한다)
select * from v2_activity_drift();

-- 5-b. 화면이 실제로 부르는 그대로 — 기본 기간(전일~당일)
select * from v2_ranking(
  ((now() at time zone 'Asia/Seoul')::date - 1)::text,
  ((now() at time zone 'Asia/Seoul')::date)::text,
  true, '');
--   기대: 강믿음41 · 정온유37 · 김소망33 · 화면점검22 · 한은혜18 · 박사랑12 · 오평강9 · 최기쁨5
--         한은혜·오평강만 active_today = false
--         voice 는 여덟 명 모두 0 이 정상이다(고른 다섯 mode 가 전부 %typing% 이라서)

-- 5-c. 3명 게이트 — 「우리 교구」 칩이 켜질 소속인가 (app.js 가 세는 것과 같은 창)
select sosok, count(*) as 인원
  from v2_ranking(
    ((now() at time zone 'Asia/Seoul')::date - 1)::text,
    ((now() at time zone 'Asia/Seoul')::date)::text, true, '')
 group by sosok order by 인원 desc;
--   기대: 믿음 5 · 사랑 3  → 둘 다 (a) 갈래(칩 켜짐)

-- 5-d. 「지금 함께 암송 중」 — 최근 10분
select u.name, count(*) as 최근10분
  from public.challenge_log c join public.users u on u.id = c.user_id
 where c.created_at >= now() - interval '10 minutes'
 group by u.name order by u.name;
--   기대: 강믿음 1 · 최기쁨 1 · 화면점검 1  → 「지금 3명」

-- 로그인해서 볼 때: 교구 → 믿음 → 목장 99 → 이름 「화면점검」
--   (tools/screen-sweep.py 의 USER 와 같은 사람이라 도구와 손 확인이 같은 계정을 쓴다)


-- ════════════════════════════════════════════════════════════
-- 6) 되돌리기 — 시험이 끝나면 (개발 DB 에서만)
--    challenge_log 를 먼저 지워 트리거가 daily_activity 를 줄이게 한 뒤 사람을 지운다.
-- ════════════════════════════════════════════════════════════
-- delete from public.challenge_log c using public.users u
--  where u.id = c.user_id and u.mok in ('90','91','92','93','94','95','96');
-- delete from public.rank_cheers rc using public.users u
--  where (u.id::text = rc.target_user_id or u.id::text = rc.from_user_id)
--    and u.mok in ('90','91','92','93','94','95','96');
-- delete from public.users where mok in ('90','91','92','93','94','95','96');
-- (화면점검 99 는 screen-sweep 이 쓰므로 남긴다)
```

- [ ] **Step 2: 개발 DB 에서 0) 만 먼저 돌려 전제를 본다**

Supabase 대시보드(**ktpwthwqzgcqcrmsafdo**) → SQL Editor.
`verse_no_nullable` 이 `YES` 이거나 `verses_행수` 가 0 보다 크면 계속 진행한다.

- [ ] **Step 3: 1)~4) 를 돌린다**

같은 SQL Editor 에 `begin;` 부터 `commit;` 까지 붙여넣고 RUN.

- [ ] **Step 4: 5-a ~ 5-d 로 확인한다**

기대값은 SQL 주석에 적혀 있다. **5-c 가 「믿음 5 · 사랑 3」이어야** 다음 Task 를 확인할 수 있다.

- [ ] **Step 5: 커밋**

```bash
git commit -m "chore(개발): 우리 교구 순위 확인용 개발 DB 시드

개발 DB 에는 가짜 사람이 한둘뿐이라 칩이 켜진 (a) 갈래가 한 번도 안 그려진다.
믿음 5명·사랑 3명으로 3명 게이트 양쪽을 다 볼 수 있게 했다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" \
  -- supabase/ranking_scope_dev_seed.sql
```

---

## Task 3: 받아오기와 그리기를 가른다 (동작은 그대로)

**Files:**
- Modify: `app.js` — `async function loadRankingBody(r) {` ~ 그 함수 끝

**Interfaces:**
- Consumes: Task 1 의 `narrowRanking`(아직 안 부른다)
- Produces: `drawRankingBody(r, data)` — DOM 을 그리는 부분 전부. **칩 전환이 이 함수만 다시 부른다.**

⚠️ **이 Task 는 화면을 한 픽셀도 바꾸지 않는다.** 순수한 구조 변경이다. 화면이 달라졌다면 잘못 옮긴 것이다.

⚠️ **왜 나누나:** `giveRankCheer` 위 주석이 이미 못 박아 두었다 — 「'전체' 기간은 challenge_log 를
전부 집계하므로 누를 때마다 다시 받으면 버튼이 멈춘 것처럼 느려진다.」 칩 전환도 같다.
받아 둔 `data` 를 들고 **그리기만** 다시 해야 한다.

- [ ] **Step 1: 함수를 둘로 가른다**

`async function loadRankingBody(r) {` 를 찾아, **처음 다섯 줄만 남기고** 나머지를 새 함수로 옮긴다:

```js
async function loadRankingBody(r) {
  const body = document.getElementById("rank-body");
  const data = await callRanking(r.from, r.to).catch(() => ({ ok: false }));
  if (!data || !data.ok) { body.innerHTML = `<p class="rank-msg err">순위를 불러오지 못했습니다.</p>`; return; }
  drawRankingBody(r, data);
}

// 받아 둔 data 로 화면만 그린다 — 범위 칩을 바꿀 때 서버를 다시 부르지 않으려고 나눴다.
// (giveRankCheer 위 주석과 같은 이유다: 「전체」 기간은 집계가 무거워 다시 받으면 멈춘 것처럼 느려진다.)
function drawRankingBody(r, data) {
  const body = document.getElementById("rank-body");
  const u = loadUser();
  const list = data.list || [];
  // ↓ 여기부터 예전 loadRankingBody 의 나머지를 **그대로** 옮긴다
  //   (const keyOf … 부터 mrc 배선까지. 한 줄도 고치지 않는다.)
}
```

⚠️ 옮길 때 **`const u = loadUser();` 와 `const list = data.list || [];` 가 두 번 선언되지 않게** 한다(위에 이미 있다).

- [ ] **Step 2: 문법을 본다**

```bash
node --check app.js && python tools/preflight.py
```

기대: 둘 다 통과(preflight 종료코드 0 · `[3] … 8가지 통과`).

- [ ] **Step 3: localhost 에서 화면이 그대로인지 본다**

```bash
python -m http.server 8000
```

브라우저에서 `http://localhost:8000` → 로그인(교구 → 믿음 → 99 → 화면점검) → 🏆 순위.
확인할 것: **목록·「내 순위」 바·👏 칩·「지금 N명」·머리글·뜻풀이가 Task 3 이전과 똑같다.**
기간 탭 네 개와 👏 누르기·취소도 그대로 된다.

- [ ] **Step 4: 커밋**

```bash
git commit -m "refactor(순위): loadRankingBody 를 받아오기와 그리기로 가른다

범위 칩을 바꿀 때 서버를 다시 부르지 않으려는 준비다 — 화면은 한 픽셀도 안 바뀐다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" \
  -- app.js
```

---

## Task 4: 범위 칩과 좁힌 목록

**Files:**
- Modify: `app.js` — `drawRankingBody` 안, 그리고 파일 위쪽 상수 한 줄
- Modify: `style.css` — `.rank-note.left .rn-l + .rn-l.rn-sub{...}` 줄 **다음 빈 줄**

**Interfaces:**
- Consumes: `narrowRanking(list, me)`(Task 1) · `drawRankingBody(r, data)`(Task 3)
- Produces: 전역 `rankScope`(`"mine"` | `"all"` | `null`) · `RANK_SCOPE_KEY`

### ⚠️ 설계에서 바뀐 것 하나

설계 ③은 「내 순위」 바에 `우리 교구 4위 · 전체 69위`를 나란히 적으려 했다.
**바 대신 뜻풀이(`.rank-note`)에 한 줄로 적는다** — 320px 에서 바에 칸을 하나 더 넣으면 👏 단추가 밀려 잘린다.
같은 줄이 「👏 숫자는 소속과 무관하다」(설계 ④-7)도 함께 해결한다.

- [ ] **Step 1: 상수와 전역 한 줄을 더한다**

`const MIN_SCOPE_ROWS = 3;` **바로 위**에:

```js
// 범위 칩(우리 교구 / 전체) — 성도님이 **직접 고른 것만** 기억한다.
// ⚠️ 게이트가 강제로 켠 「전체」를 저장하면, 나중에 그 교구가 3명을 넘어도
//    그분께는 영영 「우리 교구」가 기본이 되지 않는다.
// ⚠️ 이 키를 clearPersonalData 의 목록에도 넣는다 — 기기 설정이 아니라 「그 사람」의 흔적이다.
const RANK_SCOPE_KEY = "rank-scope";
let rankScope = null;   // "mine" | "all" | null(아직 안 정함 — 화면에 처음 들어올 때 한 번만 정한다)
```

- [ ] **Step 2: `clearPersonalData` 목록에 키를 넣는다**

```bash
grep -n '"board-seen", "album-checked",' app.js
```

그 줄을 이렇게 바꾼다:

```js
    "board-seen", "album-checked", RANK_SCOPE_KEY,
```

- [ ] **Step 3: `drawRankingBody` 안에서 범위를 정하고 목록을 좁힌다**

`const list = data.list || [];` 아래, `const keyOf = ...` 위에 넣는다:

```js
  // ⚠️ narrowRanking 에 넘기는 것은 me(list.find 결과)가 아니라 **로그인 정보의 변환**이다.
  //    me 는 이 기간에 기록이 없는 분께 null 이다(「아직 기록 없어요 🔥」 가지) —
  //    me 를 넘기면 정작 순위를 좁혀 드려야 할 그분께 칩이 안 그려진다.
  //    칸 이름은 mySo 가 쓰는 변환과 같다. sebu 는 거르기에 안 쓰므로 뺀다.
  const myScope = u ? { gubun: u.type, sosok: u.gu || u.bu || "" } : null;
  const nr = narrowRanking(list, myScope);

  // 기본값은 **화면에 처음 들어올 때 한 번만** 정한다.
  // ⚠️ 기간 탭을 옮길 때마다 다시 판정하면 칩이 저절로 켜졌다 꺼진다.
  if (rankScope === null) {
    let saved = null;
    try { saved = localStorage.getItem(RANK_SCOPE_KEY); } catch {}
    rankScope = (saved === "mine" || saved === "all") ? saved : (nr.ok ? "mine" : "all");
  }
  // 고른 기간에서 우리 소속이 3명 아래로 내려가면 그 기간에는 전체를 보여 준다(칩 선택은 그대로 둔다).
  const narrowOn = rankScope === "mine" && nr.ok;
  const view = narrowOn ? nr.list : list;

  // 교구와 교회학교를 말로 가른다 — GU_LIST 는 접미사가 없고("사랑"), BU_LIST 는 이미 부로 끝난다("청년부").
  // ⚠️ `${sosok}교구` 로 쓰면 「청년부교구」가 된다.
  const soWord = u && u.type === "교구" ? "교구" : "부서";
  const soName = u ? (u.type === "교구" ? `${u.gu || ""}교구` : (u.bu || "")) : "";
```

- [ ] **Step 4: 목록을 `view` 로 그리고, 번호·금색을 `ranks` 로 맞춘다**

`const rows = list.map((x, i) => {` 를 찾아 이렇게 바꾼다:

```js
  // ⚠️ 번호와 금색 줄(.rank-row.top)이 **같은 값**을 봐야 한다.
  //    번호만 고치면 🥇는 뜨는데 그 줄이 금색이 아닌 채로 남는다.
  // ⚠️ x.rank 를 덮어쓰지 않는다 — me 가 같은 객체라 「내 순위」 바의 전체 순위가 사라진다.
  const rows = view.map((x, i) => {
    const isMe = keyOf(x.gubun, x.sosok, x.sebu, x.name) === myKey;
    const n = i + 1;
    return `<div class="rank-row ${n <= 3 ? "top" : ""} ${isMe ? "me" : ""} ${x.liveNow ? "live" : ""}">
      <span class="rk-no">${medal(n)}</span>
      <span class="rk-name">${x.liveNow ? `<i class="rk-dot" aria-label="지금 암송 중"></i>` : ""}${x.name}</span>
      <span class="rk-so">${soLabel(x)}</span>
      <span class="rk-cnt">${x.count}회</span>
      ${chip(x, i, isMe)}
    </div>`;
  }).join("");
```

⚠️ `chip(x, i, isMe)` 의 `i` 가 **`view` 의 인덱스**가 됐다. Step 7 의 배선도 `view` 를 쓴다 — **둘이 어긋나면 엉뚱한 분께 응원이 간다.**

- [ ] **Step 5: 「지금 N명」도 `view` 로 센다**

```js
  const liveCount = view.filter((x) => x.liveNow).length;
```

- [ ] **Step 6: 칩 줄을 만든다 — 세 갈래**

⚠️ **자리가 중요하다.** `const lockHtml = ...` 정의 **다음**, `if (!list.length) {` 가지 **앞**에 넣는다.
빈 가지가 `scopeHtml` 을 쓰므로 그보다 먼저 만들어져야 한다(뒤에 두면 빈 화면에서 `undefined` 가 찍힌다).
`liveHtml`·`rows` 는 빈 가지보다 뒤라 그대로 둔다.

```js
  // 범위 칩 — #rank-body 맨 위. 왼쪽 라벨이 예전 .rank-more(「전체 N명 참여」)를 흡수한다.
  // ⚠️ .rank-mode 밖에 둔다. wireRankMode() 가 .rank-mode button 을 전부 집어
  //    renderRanking() 을 인자 없이 불러 기간을 리셋한다.
  // ⚠️ .rank-filter(기간 탭)를 재사용하지 않는다 — 공용 클래스이고, 마지막 탭이 「전체」라
  //    같은 모양이면 「전체」 알약이 한 화면에 두 개가 된다.
  const scopeSeg = (mineOn, mineDisabled) => `<span class="rs-seg" role="group" aria-label="순위 범위">
      <button type="button" data-s="mine" class="${mineOn ? "on" : ""}"${mineDisabled ? " disabled" : ""}>우리 ${soWord}</button>
      <button type="button" data-s="all" class="${mineOn ? "" : "on"}">전체</button>
    </span>`;
  let scopeHtml;
  if (nr.reason === "no-scope") {
    // (c) 비로그인·소속 빈칸 — 칩 자체를 안 그린다. 라벨만 남아 예전 「N명 참여」 자리가 된다.
    scopeHtml = `<div class="rank-scope rs-solo" id="rk-scope">
      <span class="rs-label">전체 <b>${list.length}</b>명 참여</span></div>`;
  } else if (!nr.ok) {
    // (b) 같은 소속이 2명 이하 — 「전체」가 켜지고 안내가 아랫줄에 흐른다.
    // ⚠️ 문구에 반드시 **기간**을 넣는다. 서버 목록은 「그 기간에 기록이 있는 분」뿐이라
    //    「우리 교구엔 3명뿐이에요」로 쓰면 교구 인원으로 읽혀 사실이 아닌 말이 된다.
    scopeHtml = `<div class="rank-scope rs-note" id="rk-scope">
      ${scopeSeg(false, true)}
      <span class="rs-label">이번 기간에 ${soName}에서 기록하신 분은 <b>${nr.count}</b>명이에요</span></div>`;
  } else {
    // (a) 3명 이상 — 칩 둘 다 누를 수 있다.
    scopeHtml = `<div class="rank-scope" id="rk-scope">
      <span class="rs-label">${narrowOn ? `${soName} <b>${view.length}</b>명 참여` : `전체 <b>${list.length}</b>명 참여`}</span>
      ${scopeSeg(narrowOn, false)}</div>`;
  }
```

이어서 **빈 목록 가지**를 고친다. `if (!list.length) {` 를 찾아 이렇게 바꾼다:

```js
  // ⚠️ 빈 판정은 **거르기 전 원본**으로 한다. 그리고 칩을 반드시 함께 그린다 —
  //    안 그리면 「우리 교구」에 아무도 없는 기간에서 돌아갈 길이 사라져 화면이 막힌다.
  if (!view.length) {
    body.innerHTML = scopeHtml + myHtml + (list.length
      ? `<p class="rank-msg">이번 기간에 ${soName}에서 기록하신 분이 아직 없어요.<br>「전체」를 눌러 다른 분들을 볼 수 있어요 🙌</p>`
      : `<p class="rank-msg">아직 도전 기록이 없어요.<br>첫 도전의 주인공이 되어보세요! 🔥</p>`);
    wireRankScope(r, data);
    return;
  }
```

⚠️ 이 가지는 `myHtml` 보다 **아래에** 있어야 한다(`myHtml` 이 먼저 만들어져야 한다). 원래 자리 그대로 두되 `list` → `view` 만 바꾸고 위 내용으로 교체한다.

- [ ] **Step 7: 뜻풀이에 두 줄을 더하고, `body.innerHTML` 과 배선을 고친다**

`const noteHtml = ...` 의 마지막 `${u ? ...}` 줄 **다음**에 한 줄 더한다:

```js
      ${narrowOn ? `<span class="rn-l rn-sub">지금은 ${soName} 안에서만 보고 있어요${me ? ` — 전체에서는 <b>${me.rank}</b>위예요` : ""}. 👏 수는 전체에서 받은 것이에요</span>` : ""}
```

그리고 `body.innerHTML = ...` 두 줄을 이렇게 바꾼다(`.rank-more` 는 칩 라벨이 흡수했으므로 뺀다):

```js
  body.innerHTML = scopeHtml + myHtml + lockHtml + liveHtml + headHtml +
    `<div class="rank-list">${rows}</div>` + noteHtml;
```

배선의 `list[...]` 를 `view[...]` 로 바꾸고, 칩 배선을 더한다:

```js
  body.querySelectorAll("[data-rkact]").forEach((btn) => btn.addEventListener("click", () =>
    toggleRankCheer(view[+btn.dataset.rkact], btn, canGive)));
  const mrc = document.getElementById("mr-cheer");
  if (mrc) mrc.addEventListener("click", () => toggleMyCheerers(mrc, r));
  wireRankScope(r, data);
```

- [ ] **Step 8: 칩 배선 함수를 더한다**

`drawRankingBody` 함수 **끝 다음**에 넣는다:

```js
// 범위 칩 배선 — ⚠️ #rk-scope 안으로만 한정한다.
// .rank-mode button 전역 수집(wireRankMode)과 절대 섞지 않는다.
// ⚠️ 서버를 다시 부르지 않는다 — 받아 둔 data 로 그리기만 다시 한다.
function wireRankScope(r, data) {
  const box = document.getElementById("rk-scope");
  if (!box) return;
  box.querySelectorAll("button[data-s]").forEach((b) => b.addEventListener("click", () => {
    const v = b.dataset.s;
    if (v === rankScope) return;
    rankScope = v;
    // ⚠️ 성도님이 **직접 누른 것만** 저장한다(게이트가 강제로 켠 「전체」는 저장하지 않는다).
    try { localStorage.setItem(RANK_SCOPE_KEY, v); } catch {}
    logFeature("ranking-scope", v === "mine" ? 1 : 0);
    drawRankingBody(r, data);
    // 133줄 → 8줄로 줄면 아래를 보던 분이 빈 화면을 본다. 목록 맨 위로 되돌린다.
    const sc = document.querySelector(".rank-screen");
    if (sc) sc.scrollIntoView({ block: "start" });
  }));
}
```

⚠️ `logFeature` 는 Task 5 에서 서버 허용 목록에 값을 더하기 전까지 **아무 일도 안 한다**(서버가 `skipped` 로 돌려준다). 화면에는 영향이 없다.

- [ ] **Step 9: CSS 를 넣는다**

`style.css` 에서 이 줄을 찾는다:

```bash
grep -n "rank-note.left .rn-l + .rn-l.rn-sub" style.css
```

그 **다음 빈 줄**에 아래를 통째로 넣는다(순위 규칙 묶음의 끝이고, 기존 `@media (max-width:344px)` 블록보다 뒤다):

```css
/* ── 「우리 교구 안에서」 범위 칩 (2026-09-23) ──────────────────────
   설계: docs/superpowers/specs/2026-09-23-narrow-ranking-design.md ③
   한 줄에 왼쪽 라벨(「사랑교구 8명 참여」 — .rank-more 를 흡수한다) + 오른쪽 범위 칩 두 개.

   ⚠️ .rank-filter(기간 탭)를 재사용하지 않는다 — 앨범 자가점검·이어 듣기·필사 칩·
      필사 탭·교구 순위가 나눠 쓰는 공용 클래스다. 생김새도 달라야 한다:
      기간 탭 마지막이 「전체」라 같은 모양이면 「전체」 알약이 한 화면에 두 개가 된다.
   ⚠️ 색으로 가르지 않는다. 이 화면의 색은 이미 뜻이 박혀 있다 —
      금색 = 상위 3명(.rank-row.top), 초록 = 지금 함께 암송 중(.rank-row.live),
      남색 채움 = 눌린 단추(모드 바·기간 탭·응원 칩·하단 고정 단추).
      그래서 **모양**으로 가른다: 둥근 알약이 아니라 홈에 눌린 판이고, 고른 쪽만 흰 판으로
      떠오른다. 새 색을 한 개도 안 만든다.
   ⚠️ 좁은 폭 보정을 위쪽 @media (max-width:344px) 묶음에 넣지 않는다 — 그 블록이
      파일에서 **앞**이라 특이도가 같아 아래 기본값이 이겨 버린다. 제 블록을 달고 간다.
   ⚠️ font-family:inherit 를 뺄 수 없다 — 이 파일에는 맨 button 선택자 규칙이 없어서
      안 쓰면 브라우저 기본 글꼴로 떨어진다. */
.rank-scope{
  display:flex; align-items:center; gap:8px; flex-wrap:nowrap;
  margin:0 0 10px; padding:0 2px;
}
/* 남는 폭을 흡수하는 칸 — .rank-row .rk-so · .rank-head .rh-who 와 같은 방식이다.
   라벨이 아무리 길어도 …로 줄 뿐, 줄을 늘리거나 칩을 밀어내지 못한다. */
.rank-scope .rs-label{
  flex:1 1 auto; min-width:0;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  font-size:.78rem; font-weight:700; color:var(--gray);
}
.rank-scope .rs-label b{ color:var(--navy); font-weight:800; }
/* (c) 갈래 — 칩을 아예 안 그릴 때. 라벨만 남으면 왼쪽으로 붙어 예전 .rank-more(가운데)와
   달라 보인다. 가운데로 되돌린다. */
.rank-scope.rs-solo .rs-label{ text-align:center; }
/* 홈 — 둘을 한 판에 담아 「둘 중 하나」임을 모양으로 알린다(사이에 gap 없음) */
.rank-scope .rs-seg{
  flex:0 0 auto; display:flex;
  background:#eef1f8; border:1px solid #cfd8e4;
  border-radius:9px; padding:2px;
}
.rank-scope .rs-seg button{
  border:none; background:transparent; color:#5a6273;
  border-radius:7px; padding:5px 10px;
  font-size:.75rem; font-weight:700; line-height:1.25;
  white-space:nowrap; cursor:pointer; font-family:inherit; transition:all .15s;
}
.rank-scope .rs-seg button:hover{ color:var(--navy); }
.rank-scope .rs-seg button.on{
  background:#fff; color:var(--navy); font-weight:800;
  box-shadow:0 1px 3px rgba(26,58,107,.18);
}
.rank-scope .rs-seg button:disabled{ opacity:.45; cursor:default; }

/* (b) 갈래 — 같은 소속이 2명 이하라 「전체」가 강제로 켜진 경우.
   안내 문구에는 반드시 기간이 들어가므로 한 줄에 안 들어온다.
   칩을 윗줄 오른쪽에 두고 문구를 아랫줄 통짜로 흐르게 한다.
   ⚠️ 위 .rank-scope 의 gap:8px 은 wrap 했을 때 row-gap 으로도 쓰인다. 라벨에 margin-top 을
      또 주면 8+6=14px 로 벌어진다 — row-gap 만 6px 로 덮는다. */
.rank-scope.rs-note{ flex-wrap:wrap; row-gap:6px; }
.rank-scope.rs-note .rs-seg{ order:1; margin-left:auto; }
.rank-scope.rs-note .rs-label{
  order:2; flex:1 1 100%;
  white-space:normal; overflow:visible; text-overflow:clip;
  font-weight:600; line-height:1.5; word-break:keep-all;
}

/* 아주 좁은 화면 — 위 .rank-row/.rank-head 블록과 같은 344px 선을 쓴다.
   글자는 그대로 두고 좌우 padding 과 gap 만 덜어 라벨 칸을 넓힌다. */
@media (max-width: 344px){
  .rank-scope{ gap:6px; }
  .rank-scope .rs-seg button{ padding:5px 7px; }
  .rank-scope .rs-label{ font-size:.74rem; }
}

/* 어두운 모드.
   ⚠️ --navy 는 .dark 에서 재정의되지 않는다(.dark{} 토큰 묶음에 --cream/--white/--light/
      --border/--gray 다섯만 있다). var(--navy) 를 쓴 자리는 전부 여기서 되돌려야 한다.
   --gray 는 토큰이 알아서 바뀌므로 .rs-label 본체는 손대지 않는다. */
.dark .rank-scope .rs-label b{ color:#cdd9f2; }
.dark .rank-scope .rs-seg{ background:#1b2436; border-color:#33405a; }
.dark .rank-scope .rs-seg button{ color:#9aa6b8; }
.dark .rank-scope .rs-seg button:hover{ color:#cdd9f2; }
.dark .rank-scope .rs-seg button.on{
  background:#3a4a68; color:#fff; box-shadow:none;
}
```

⚠️ **`style.css` 의 `.dark .rank-filter button` 묶음에 `.rank-scope` 를 끼워 넣지 말 것** — 기간 탭과 똑같아진다.

- [ ] **Step 10: 문법과 검사**

```bash
node --check app.js && python tools/preflight.py
```

기대: 통과(`[3] … 8가지 통과`).

- [ ] **Step 11: localhost 에서 세 갈래를 모두 본다**

```bash
python -m http.server 8000
```

| 보는 것 | 어떻게 | 기대 |
|---|---|---|
| **(a)** 우리 교구 기본 | 믿음-99 화면점검으로 로그인 → 🏆 순위 | 「우리 교구」가 켜져 있고 **믿음 5명**만 보인다. 화면점검이 **🥉 3위**. 라벨 「믿음교구 **5**명 참여」 |
| 전체로 전환 | 「전체」 누르기 | **8명**이 보이고 화면점검은 **4위**. 라벨 「전체 **8**명 참여」. 목록 맨 위로 올라간다 |
| **기억** | 새로고침 | 「전체」가 그대로 켜져 있다 |
| **기간을 옮겨도 안 튄다** | 「이번주」·「오늘」 탭 | 칩이 저절로 안 바뀐다 |
| **👏가 두 화면에서 같다** | 「우리 교구」에서 👏 누르고 → 「전체」로 | 숫자와 켜짐이 **그대로** 유지된다 (사본이면 여기서 깨진다) |
| **금색과 메달이 함께** | (a) 에서 위 세 줄 | 🥇🥈🥉 가 붙은 줄이 **금색 테두리**도 함께 가진다 |
| **(b)** 2명 이하 | 「오늘」 탭에서 사랑 교구 계정으로 로그인(정온유 등) | 「전체」가 켜지고 「우리 교구」가 흐려진다. 아랫줄에 「이번 기간에 사랑교구에서 기록하신 분은 **N**명이에요」 |
| **(c)** 비로그인 | 로그아웃 후 순위 | 칩이 **안 보이고** 「전체 N명 참여」만 가운데에 |
| **전체 순위 보존** | (a) 에서 맨 아래 뜻풀이 | 「지금은 믿음교구 안에서만 보고 있어요 — 전체에서는 **4**위예요」 |

- [ ] **Step 12: 폭과 어두운 모드**

개발자 도구에서 폭을 **320 · 344 · 360 · 390 · 430** 으로 바꿔 가며 본다. 밝음/어두움 둘 다.
확인: 가로 스크롤 0 · 칩이 라벨을 밀어내지 않음 · `.rk-cnt`/`.rk-cheer` 열이 어긋나지 않음 · 어두운 모드에서 흰 알약이 남지 않음.

- [ ] **Step 13: 커밋**

```bash
git commit -m "feat(순위): 「우리 교구 안에서」 범위 칩

상위 10명이 67.7%를 차지하는 전체 순위는 중위 성도님에게 닿을 수 없는 표다.
같은 소속이 3명 이상이면 우리 교구를 기본으로 보여 준다(목장은 178개 중 활동자
중위 1명이라 쓸 수 없었다 — 교구로 올려 잡았다).

거르기는 filter 로 참조를 유지한다 — 응원이 배열 원소를 제자리에서 고치므로
사본을 쓰면 두 화면의 👏 숫자가 갈린다. 번호와 금색 줄은 같은 i+1 을 본다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" \
  -- app.js style.css
```

---

## Task 5: 측정 한 줄

**Files:**
- Modify: `app.js` — `logFeature` 안의 `api.featureLog(...)` 한 줄
- Modify: `supabase/functions/api/index.ts` — `FEATURES` 집합

**Interfaces:**
- Consumes: `logFeature(feature, item)`(다른 세션이 이미 만듦) · Task 4 의 `wireRankScope` 가 부르는 자리

- [ ] **Step 1: `logFeature` 에 `.catch` 를 붙인다**

⚠️ **이 계획이 `logFeature` 의 첫 호출자다.** `supaCall` 은 실패하면 `throw` 하고 `try/catch` 는
**동기 예외만** 삼킨다. 운영에 아직 `featureLog` 액션이 없어, 이대로 부르면
`unhandledrejection` 이 줄줄이 뜬다.

```bash
grep -n "api.featureLog({ user_id: u.user_id" app.js
```

그 줄을 이렇게 바꾼다:

```js
    api.featureLog({ user_id: u.user_id, feature: feature, item: item || 0 }).catch(() => {});
```

그리고 그 함수 주석 묶음 끝에 한 줄 더한다:

```js
// ⚠️ .catch 를 반드시 붙인다 — supaCall 은 실패하면 throw 한다. try/catch 는 동기 예외만
//    삼키므로, 이게 없으면 서버가 액션을 모를 때(배포 전) unhandledrejection 이 줄줄이 뜬다.
```

- [ ] **Step 2: 서버 허용 목록에 한 줄 더한다**

```bash
grep -n '"push",' supabase/functions/api/index.ts
```

그 줄 **다음**에:

```ts
  "ranking-scope",    // 순위 범위 칩 — item: 1=우리 교구 · 0=전체
```

⚠️ **허용 목록은 여기 한 곳뿐이다**(DB 에 CHECK 가 없다 — 일부러 그렇게 뒀다).

- [ ] **Step 3: 60초 창이 뜻하는 것을 확인한다**

`logFeature` 는 같은 `(기능,항목)` 을 60초 안에 다시 안 보낸다.
「우리 교구」→「전체」→「우리 교구」로 오가면 `item` 이 `1`/`0` 으로 달라 **둘 다 나간다.**
같은 칩을 60초 안에 다시 고르면 안 나간다 — `cnt` 는 「고른 횟수」가 아니라 **「1분 단위로 고른 횟수」**다.
재려는 것은 `count(distinct user_id)`(「보고 계신 분이 몇 분인가」)이므로 이 근사로 충분하다.

- [ ] **Step 4: 개발에 배포하고 확인한다**

⚠️ **배포 전에 `git status` 를 본다** — `supabase functions deploy` 는 작업 트리를 통째로 올린다.
다른 세션의 커밋 안 된 `index.ts` 코드가 함께 나간다.

```bash
git status --porcelain
supabase functions deploy api --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo
```

개발 DB 에 `feature_log` 표가 있으면 localhost 에서 칩을 눌러 본 뒤 SQL Editor 에서:

```sql
select feature, item, cnt, day from feature_log where feature = 'ranking-scope' order by day desc limit 10;
```

표가 아직 없으면 **행이 안 쌓이는 것이 정상**이다(다른 세션의 Task 1 이 세운다). 화면은 멀쩡해야 한다.

- [ ] **Step 5: 커밋**

```bash
git commit -m "feat(계측): 순위 범위 칩을 잰다 — ranking-scope

logFeature 의 첫 호출자라 .catch 를 함께 붙인다 — supaCall 은 throw 하고
try/catch 는 동기 예외만 삼켜, 액션이 배포되기 전에는 unhandledrejection 이 된다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" \
  -- app.js supabase/functions/api/index.ts
```

⚠️ **운영 Edge Function 배포는 다른 세션의 feature-log 계획 Task 9 와 함께** 한다. 순서를 맞춘 뒤:

```bash
supabase functions deploy api --no-verify-jwt --project-ref xnomlgydifiqiybervtf
```

---

## Task 6: 문서 · 판 올리기 · 배포 확인

**Files:**
- Modify: `docs/notes/ranking-cheer.md` (한 절)
- Modify: `CLAUDE.md` (한 줄 + preflight 시간)
- Modify: `app.js` 안 사용 설명서의 순위 절
- Modify: `index.html` · `app.js` (`bump.py` 가 자동으로)

- [ ] **Step 1: `docs/notes/ranking-cheer.md` 에 한 절을 더한다**

파일 끝에:

```markdown
- **「우리 교구 안에서」 범위 칩(2026-09-23):** 개인 순위에 `[우리 교구 | 전체]` 칩. 같은 소속이 **3명 이상**이면
  「우리 교구」가 기본이다. ⚠️ **목장 단위로 되돌리지 말 것** — 2026-09-23 실측으로 목장 178개·목장당 활동자
  중위 1명·최근 30일 활동자 3명 이상인 목장은 7개(4%)뿐이라, 열에 여덟이 **자기 혼자 있는 표**를 본다.
  교구는 기본 기간(전일~당일)에도 기쁨 3 · 화평 4 · 섬김 4 · 믿음 6 · 사랑 8 · 은혜 9 · 소망 12명이다.
  ⚠️ **거르기는 `list.filter` 로 참조를 유지한다**(`narrowRanking`). 응원은 배열 원소를 **제자리에서** 고치므로
  (`giveRankCheer`), 사본을 쓰면 「우리 교구」에서 누른 👏가 「전체」로 돌아갔을 때 안 눌린 것으로 보이고,
  다시 누르면 서버는 `ignoreDuplicates` 로 ok 를 줘 **화면 숫자만 어긋난다.**
  ⚠️ **`x.rank` 를 덮어쓰지 않는다** — `me` 가 list 안의 같은 객체라 「내 순위」 바의 전체 순위가 사라진다.
  화면 등수는 렌더 때 `i+1` 로만 만들고, **번호와 금색 줄(`.rank-row.top`)이 같은 값을 본다**(둘 중 하나만
  고치면 🥇는 뜨는데 금색이 안 붙는다).
  ⚠️ **`data-rkact` 인덱스와 `chip(x, i, …)` 의 `i` 는 둘 다 걸러진 배열 기준**이어야 한다 — 한쪽만 고치면
  엉뚱한 분께 응원이 간다.
  ⚠️ **칩은 `.rank-mode` 밖에** 둔다(`wireRankMode()` 가 `.rank-mode button` 을 전부 집어 기간을 리셋한다).
  **`.rank-filter` 도 재사용하지 않는다**(다섯 화면이 나눠 쓰는 공용 클래스 · 「전체」 알약이 두 개가 된다).
  **금색·초록을 안 쓴다** — 이 화면에서 금색은 상위 3명, 초록은 「지금 함께 암송 중」이다.
  ⚠️ (b) 갈래 문구에 **기간**을 넣는다 — 목록은 「그 기간에 기록이 있는 분」뿐이라 「우리 교구엔 3명뿐」이라고
  쓰면 교구 인원으로 읽혀 사실이 아닌 말이 된다.
  자동 판정은 **화면에 처음 들어올 때 한 번만** 한다(기간 탭마다 다시 판정하면 칩이 저절로 켜졌다 꺼진다).
  저장은 **성도님이 직접 누른 것만**(게이트가 강제로 켠 「전체」를 저장하면 영영 안 풀린다).
  검사: `tests/ranking-scope.test.cjs`(꾸러미 0개) — `tools/preflight.py` 가 배포 앞에 건다.
  설계 `docs/superpowers/specs/2026-09-23-narrow-ranking-design.md` · 계획 `docs/superpowers/plans/2026-09-23-narrow-ranking.md`
```

- [ ] **Step 2: `CLAUDE.md` 에 한 줄**

「주요 기능」의 순위 줄 근처에:

```markdown
- **「우리 교구 안에서」 순위(2026-09-23)** — 전체 순위는 상위 10명이 67.7%라 중위 성도님에게 닿지 않는다.
  같은 소속 3명 이상이면 우리 교구를 기본으로. ⚠️ 손대기 전에 `docs/notes/ranking-cheer.md` —
  **목장 단위 금지**(실측 근거)·복사본 금지·`x.rank` 덮어쓰기 금지·응원 인덱스 통일이 거기 있다.
```

그리고 preflight 시간 줄(「0.35초」)을 실측으로 고친다 — 순수 함수 검사가 붙어 **약 1.6초**다.

- [ ] **Step 3: 사용 설명서의 순위 절을 고친다**

```bash
grep -n "기간을 바꿀 수 있어요\|오늘·전일" app.js | head
```

기간 탭 설명 뒤에 한 줄 더한다:

```
「우리 교구」를 누르면 같은 교구(교회학교는 같은 부서) 분들만 모아 1위부터 다시 보여드려요.
```

- [ ] **Step 4: 판을 올린다**

```bash
git status --porcelain
python tools/bump.py
```

- [ ] **Step 5: 마지막 검사**

```bash
python tools/preflight.py
```

기대: 종료코드 0 · `[1] 문법` · `[2] 캐시태그` · `[3] 8가지 통과` 모두 통과.

- [ ] **Step 6: 커밋하고 푸시한다**

```bash
git diff --cached
git commit -m "docs(순위): 우리 교구 범위 칩 — 노트·설명서·판 올리기

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" \
  -- app.js index.html docs/notes/ranking-cheer.md CLAUDE.md
git push
```

- [ ] **Step 7: 배포를 확인한다 — 이번 판에만 있는 표식으로**

```bash
V=$(grep -o 'app.js?v=[0-9a-z]*' index.html | head -1 | cut -d= -f2)
curl -s "https://gocheok.onlybible.kr/app.js?v=$V" | grep -o 'APP_BUILD = "[0-9a-z]*"'
curl -s "https://gocheok.onlybible.kr/app.js?v=$V" | grep -c 'MIN_SCOPE_ROWS'
```

기대: `APP_BUILD` 가 `index.html` 의 `?v=` 와 같고, `MIN_SCOPE_ROWS` 가 **1 이상**(이전 판에는 없던 표식).

- [ ] **Step 8: 실제 화면에서 한 번 본다**

`gocheok.onlybible.kr` 에 본인 계정으로 들어가 🏆 순위를 연다.
기대: 「우리 교구」가 켜진 채로 같은 교구 분들만 보이고, 「전체」를 누르면 133명이 돌아온다.

---

## ⑦ 되돌리기 기준 — 2주 뒤에 본다

⚠️ **응원의 79%가 교구를 건넌다**(최근 7일 583건 중 같은 소속 123건 · 주는 분 18명 · 받는 분 72명).
「우리 교구」가 기본이 되면 한 화면에서 👏를 누를 수 있는 사람이 133명에서 8~12명으로 준다.

- **2주 뒤** `rank_cheers` 의 주간 건수를 본다.
- 배포 전 2주 평균의 **60% 아래로 떨어지면** `rankScope` 기본값을 `"all"` 로 되돌린다(칩은 그대로 둔다).
  고칠 곳은 한 줄이다: `rankScope = ... : (nr.ok ? "mine" : "all")` → `: "all"`.
- 판단할 때 **응원 주는 분이 18명뿐**임을 함께 본다 — 열성 사용자라 한 번 「전체」를 고르면 기억된다.
  첫 며칠의 출렁임과 자리 잡은 뒤를 구분한다.
- 함께 볼 것: `feature_log` 의 `ranking-scope` — `item=1`(우리 교구)을 고른 분이 몇 분인가.

```sql
-- 응원 주간 추이
select date_trunc('week', cheer_date) as 주, count(*) as 건수,
       count(distinct from_user_id) as 준사람, count(distinct target_user_id) as 받은사람
  from rank_cheers group by 1 order by 1 desc limit 8;

-- 범위 칩 — 누가 무엇을 보고 있나
select item, count(distinct user_id) as 사람, sum(cnt) as 횟수
  from feature_log where feature = 'ranking-scope' group by 1;
```
