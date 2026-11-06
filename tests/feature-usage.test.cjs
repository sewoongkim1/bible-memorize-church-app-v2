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
