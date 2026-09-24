// 저녁 알림 문구 짓기 — index.ts 에서 구간만 떼어 낸다.
//
//   node --test tests/evening-push.test.cjs
//
// ⚠️ **꾸러미를 하나도 쓰지 않는다**(node:test·node:assert·node:fs·node:path·node:vm 뿐).
//    그래야 tools/preflight.py 가 배포 앞 그물에 걸 수 있다.
//
// ⚠️ 떼어 내는 구간에는 **타입 표기를 쓰지 않기로** 약속돼 있다(주석에도 예를 적지 않는다 —
//    가드 정규식이 주석까지 본다).
//
// ⚠️ vm 크로스 realm — vm 안에서 만든 객체는 프로토타입이 달라 deepStrictEqual 이 실패한다.
//    runInThisContext 로 **같은 realm** 에서 돌려 그 함정을 피한다
//    (tests/send-push-opts.test.cjs 는 스프레드로 우회했는데, 이쪽이 더 낫다).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'supabase/functions/api/index.ts'), 'utf8');
const START = '// ── 저녁 알림 문구 — 순수 함수 (여기부터) ──';
const END = '// ── 저녁 알림 문구 — 순수 함수 (여기까지) ──';
const s = source.indexOf(START);
const e = source.indexOf(END, s + START.length);
assert.ok(s >= 0, 'index.ts 에서 문구 순수 함수 시작 표식을 못 찾았다 — 이 검사가 낡았다');
assert.ok(e > s, 'index.ts 에서 끝 표식이 시작보다 뒤에 없다 — 이 검사가 낡았다');
const slice = source.slice(s, e);
assert.ok(!/:\s*(any|string|number|boolean|Record|Set)\b/.test(slice),
  '문구 구간에 타입 표기가 들어왔다 — node:vm 이 못 돌린다');
// 같은 realm 에서 돌린다 — 돌려받은 객체를 그대로 비교할 수 있다.
new vm.Script(slice + '\n;globalThis.__eveningMessage = eveningMessage;').runInThisContext();
const eveningMessage = globalThis.__eveningMessage;
assert.equal(typeof eveningMessage, 'function', 'eveningMessage 를 못 떼어 냈다');

test('밀린 복습이 있으면 복습 문구', () => {
  const m = eveningMessage(5, '말씀 한 줄 (롬 14:8)');
  assert.match(m.title, /복습/);
  assert.match(m.body, /3구절/);       // 5개 밀려도 한 번에 하는 3구절로 말한다
});

test('밀린 것이 3보다 적으면 그 수로 말한다', () => {
  assert.match(eveningMessage(2, 'x').body, /2구절/);
  assert.match(eveningMessage(1, 'x').body, /1구절/);
});

test('⚠️ 「만」을 쓰지 않는다 (첫 화면이 일부러 피한 표현이다)', () => {
  for (const n of [1, 2, 3, 10]) {
    const m = eveningMessage(n, 'x');
    assert.ok(!/구절만/.test(m.body), `${n}일 때 「구절만」이 들어갔다: ${m.body}`);
  }
});

test('밀린 것이 없으면 말씀 문구 — 본문이 그대로 들어간다', () => {
  const m = eveningMessage(0, '우리가 살아도 주를 위하여 (롬 14:8)');
  assert.ok(!/복습/.test(m.title), '복습이 없는데 복습이라 말하면 안 된다');
  assert.match(m.body, /롬 14:8/);
});

test('⚠️ 부정 전제를 쓰지 않는다 — 22시에 늘 하시는 분께 사실이 아니다', () => {
  for (const [n, v] of [[0, 'x'], [3, 'x']]) {
    const m = eveningMessage(n, v);
    const all = m.title + ' ' + m.body;
    assert.ok(!/아직|못 하|안 하|놓치/.test(all), `부정 전제가 들어갔다: ${all}`);
  }
});

test('말씀 한 줄이 비어도 터지지 않는다', () => {
  const m = eveningMessage(0, '');
  assert.equal(typeof m.title, 'string');
  assert.ok(m.body.length > 0, '본문이 비면 안 된다');
});

test('음수·이상한 값도 말씀 갈래로 떨어진다', () => {
  assert.ok(!/복습/.test(eveningMessage(-1, 'x').title));
  assert.ok(!/복습/.test(eveningMessage(undefined, 'x').title));
});
