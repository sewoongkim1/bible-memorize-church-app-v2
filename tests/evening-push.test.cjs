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

// 2026-10-12 — 복습 갈래를 걷었다(첫 화면에 🔁 복습 단추가 없다 · docs/notes/home-screen.md 끝).
//   밀린 복습이 있는 분도 이번 주 말씀 암송으로 부른다. 그래서 문구는 말씀 한 줄만 받는다.
test('이번 주 말씀이 있으면 그 말씀으로 암송에 부른다 — 본문이 그대로 들어간다', () => {
  const m = eveningMessage('우리가 살아도 주를 위하여 (롬 14:8)');
  assert.match(m.title, /이번 주 암송 말씀/);
  assert.match(m.body, /우리가 살아도 주를 위하여 \(롬 14:8\)/);
  assert.match(m.body, /암송/);
});

test('⚠️ 「복습」으로 부르지 않는다 — 첫 화면에 복습 단추가 없다(2026-10-11)', () => {
  for (const v of ['우리가 살아도 주를 위하여 (롬 14:8)', '', undefined, null]) {
    const m = eveningMessage(v);
    assert.ok(!/복습|🔁/.test(m.title + ' ' + m.body), `복습으로 부른다: ${m.title} / ${m.body}`);
  }
});

test('⚠️ 「만」을 쓰지 않는다 (첫 화면이 일부러 피한 표현이다)', () => {
  for (const v of ['x', '']) {
    const m = eveningMessage(v);
    assert.ok(!/구절만|만 /.test(m.title + ' ' + m.body.replace(/x/g, '')), `「만」이 들어갔다: ${m.body}`);
  }
});

test('⚠️ 부정 전제를 쓰지 않는다 — 22시에 늘 하시는 분께 사실이 아니다', () => {
  for (const v of ['x', '']) {
    const m = eveningMessage(v);
    const all = m.title + ' ' + m.body;
    assert.ok(!/아직|못 하|안 하|놓치|잊/.test(all), `부정 전제가 들어갔다: ${all}`);
  }
});

test('말씀 한 줄이 비어도 터지지 않고 · 「이번 주 말씀」이라 말하지 않는다(없는 것을 있다고 하지 않게)', () => {
  for (const v of ['', undefined, null]) {
    const m = eveningMessage(v);
    assert.equal(typeof m.title, 'string');
    assert.ok(m.body.length > 0, '본문이 비면 안 된다');
    assert.ok(!/이번 주/.test(m.title + m.body), '말씀이 없는데 「이번 주」라 말한다');
  }
});

test('eveningPush 는 사람마다 다른 문구(userBodies)도 밀린 복습(reviews)도 더는 안 본다', () => {
  const at = source.indexOf('async function eveningPush(');
  assert.ok(at >= 0, 'eveningPush 를 못 찾았다 — 이 검사가 낡았다');
  const end = /\r?\n\}\r?\n/.exec(source.slice(at));
  assert.ok(end, 'eveningPush 의 끝을 못 찾았다 — 이 검사가 낡았다');
  const body = source.slice(at, at + end.index);
  assert.ok(!/from\("reviews"\)/.test(body), '저녁 알림이 다시 reviews 를 읽는다 — 복습 갈래를 되살렸다면 문구·시험도 함께');
  assert.ok(body.includes('eveningMessage(verseLine)'));
  assert.ok(!/latest\s*:/.test(body), 'latest 를 넘기면 아침 묵상 알림이 한 번 더 나간다');
});
