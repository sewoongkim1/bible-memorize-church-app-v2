// 저녁 알림 옵션(only·userBodies) 순수 함수 검사 — index.ts 에서 구간만 떼어 낸다.
//
//   node --test tests/send-push-opts.test.cjs
//
// ⚠️ **꾸러미를 하나도 쓰지 않는다**(node:test·node:assert·node:fs·node:path·node:vm 뿐).
//    그래야 tools/preflight.py 가 이 검사를 배포 앞 그물에 걸 수 있다.
//    여기에 require('jsdom') 같은 줄을 더하는 순간 배포가 통째로 멈춘다.
//
// ⚠️ index.ts 는 TypeScript 지만 **떼어 내는 구간만은 타입 표기 없이** 쓰기로 약속돼 있다.
//    잘라낸 글에 `: any` 가 보이면 그 약속이 깨진 것이고, 이 검사가 먼저 알려 준다.
//    본보기: tests/ranking-scope.test.cjs 가 app.js 의 narrowRanking 을 같은 방식으로 떼어 낸다.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'supabase/functions/api/index.ts'), 'utf8');
const START = '// ── 저녁 알림 옵션 — 순수 함수 (여기부터) ──';
const END = '// ── 저녁 알림 옵션 — 순수 함수 (여기까지) ──';
const s = source.indexOf(START);
const e = source.indexOf(END);
assert.ok(s >= 0, 'index.ts 에서 순수 함수 시작 표식을 못 찾았다 — 이 검사가 낡았다');
assert.ok(e > s, 'index.ts 에서 순수 함수 끝 표식이 시작보다 뒤에 없다 — 이 검사가 낡았다');
const slice = source.slice(s, e);
assert.ok(!/:\s*(any|string|number|boolean|Record|Set)\b/.test(slice),
  '순수 함수 구간에 타입 표기가 들어왔다 — node:vm 이 못 돌린다. 표기를 빼거나 구간을 옮겨라');
const ctx = vm.createContext({});
vm.runInContext(slice, ctx);
const { buildOnlySet, keepUser, pickMessage } = ctx;
assert.equal(typeof buildOnlySet, 'function', 'buildOnlySet 을 못 떼어 냈다');
assert.equal(typeof keepUser, 'function', 'keepUser 를 못 떼어 냈다');
assert.equal(typeof pickMessage, 'function', 'pickMessage 를 못 떼어 냈다');
// ⚠️ pickMessage 가 돌려주는 객체는 vm 컨텍스트의 Object 로 만들어져, 이 파일(메인 컨텍스트)의
//    객체 리터럴과 구조가 같아도 assert.deepEqual(strict) 이 "same structure but not
//    reference-equal"로 실패한다(프로토타입이 다른 realm). 스프레드로 메인 realm 객체로
//    옮겨 담아 비교한다 — pickMessage 자체의 동작은 그대로, 비교 방식만 고친 것이다.
const pm = (...args) => ({ ...pickMessage(...args) });

test('only 를 안 넘기면 아무도 안 거른다', () => {
  assert.equal(buildOnlySet(undefined), null);
  assert.equal(buildOnlySet(null), null);
  assert.equal(keepUser(null, 'u1'), true);
});

test('⚠️ only 가 빈 배열이면 아무에게도 안 보낸다', () => {
  const set = buildOnlySet([]);
  assert.notEqual(set, null, '빈 배열을 null 로 만들면 전 구독자에게 나간다');
  assert.equal(keepUser(set, 'u1'), false);
});

test('only 목록 안에 있는 사람만 남는다', () => {
  const set = buildOnlySet(['u1', 'u2']);
  assert.equal(keepUser(set, 'u1'), true);
  assert.equal(keepUser(set, 'u3'), false);
});

test('user_id 를 문자열로 통일해 견준다', () => {
  assert.equal(keepUser(buildOnlySet([7]), '7'), true);
  assert.equal(keepUser(buildOnlySet(['7']), 7), true);
});

test('배열이 아닌 only 는 안 넘긴 것으로 본다', () => {
  assert.equal(buildOnlySet('u1'), null);
  assert.equal(buildOnlySet({ u1: true }), null);
});

test('userBodies 가 없으면 기본 문구', () => {
  assert.deepEqual(pm(null, 'u1', '아침', '말씀'), { title: '아침', body: '말씀' });
});

test('userBodies 에 있으면 그 사람 문구', () => {
  const b = { u1: { title: '복습', body: '3구절' } };
  assert.deepEqual(pm(b, 'u1', '아침', '말씀'), { title: '복습', body: '3구절' });
});

test('userBodies 에 없는 사람은 기본 문구 (TypeError 나면 안 된다)', () => {
  const b = { u1: { title: '복습', body: '3구절' } };
  assert.deepEqual(pm(b, 'u2', '아침', '말씀'), { title: '아침', body: '말씀' });
});

test('한쪽만 준 경우 나머지는 기본', () => {
  const b = { u1: { title: '복습' } };
  assert.deepEqual(pm(b, 'u1', '아침', '말씀'), { title: '복습', body: '말씀' });
});

test('title·body 가 아예 없으면 앱 기본 문구', () => {
  assert.deepEqual(pm(null, 'u1', undefined, undefined),
    { title: '성경말씀 암송', body: '오늘의 말씀을 암송해요! 🙌' });
});
