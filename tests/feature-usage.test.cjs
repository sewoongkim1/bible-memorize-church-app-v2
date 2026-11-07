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
//   ② featureUsage 문 — 교회 어드민 내부 키 묶음(INTERNAL_ADMIN_OK)에 있고 암호 길(ADMIN_PW_ONLY)에는 없다 · switch 한 줄.
//   ③ featureUsage — 관리자 문이 먼저 · 다섯 값만 · 기간 · 기본 키 차례 · 틀린 날짜는 bad-args · 표가 없으면 빈 결과 ·
//      합계 · 종류별 · 사람별 차례 · 어린 부서 · 사람 모름 줄은 뺀다 · 응답에 user_id 가 없다 · 종류 이름(SHARE_KINDS).
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
const S = vm.runInContext(SEC + '\n;({ FEATURES, USAGE_FEATURES, featureLog,' +
  ' SHARE_KINDS: typeof SHARE_KINDS === "undefined" ? undefined : SHARE_KINDS,' +
  ' featureUsage: typeof featureUsage === "function" ? featureUsage : undefined })', CTX);

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
  // 날짜를 맨 앞에(2026-11-06 검토) — 새 줄은 늘 오늘 날짜라 맨 끝 묶음에만 들어가 읽는 동안 앞 쪽이 밀리지 않는다(user_id 가 맨 앞이면 한 줄이 두 번 세일 수 있다)
  assert.deepEqual(op('order').map((o) => o[1]), ['day', 'user_id', 'feature', 'item'], '쪽 넘기기는 날짜 먼저 · 기본 키 네 칸 차례로');
  const all = await runUsage({ from: '', to: '' }, { rows: [] });
  assert.deepEqual(all.q.ops.filter((o) => o[0] === 'gte' || o[0] === 'lte'), [], '기간이 비면 제한 없음(blessingUsage 와 같다)');
  // 꼴은 맞아도 없는 날짜(2026-02-30 · 2026-13-01)도 bad-args — DB 로 보내면 Postgres 가 out of range 로 500 을 낸다(2026-11-06 검토)
  for (const body of [{ from: '2026/11/01' }, { to: '2026-11-06 or 1=1' }, { from: 20261101 }, { from: '2026-02-30' }, { to: '2026-13-01' }]) {
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

test('③ SHARE_KINDS — 종류 코드 1~10 이름(설계 2-2 · 이름은 서버 한 곳) · 모르는 코드는 「종류 N」으로 드러난다', async () => {
  assert.deepEqual(J(S.SHARE_KINDS), { 1: '가정 축복 기도문', 2: '오늘의 묵상', 3: '이번 주 말씀', 4: '가을 말씀암송 동행 안내',
    5: '앱 소개', 6: '외운 말씀', 7: '교육 수료증', 8: '앱 설치 주소', 9: '이번 주 말씀 주소', 10: '수험생 응원기도카드' });   // 10 = 🎓 기념일 말씀카드(2026-11-07)
  const { r } = await runUsage({}, { rows: [row('a', '2026-11-02', 'share-sheet', 12, 1)] });
  assert.deepEqual(r.byKind.map((k) => [k.item, k.label]), [[12, '종류 12']]);
});
