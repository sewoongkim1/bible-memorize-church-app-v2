// 교회 생활 확인 번호 — 순수 함수 (2026-10-08 · Plan 1 Task 2)
// ⚠️ 아래 세 함수는 index.ts 의 같은 이름 함수와 **글자까지 같아야 한다**(순수 로직 복사 검증).
//    index.ts 를 고치면 여기도 함께. preflight 가 이 파일을 돌린다.
const { test } = require('node:test');
const assert = require('node:assert/strict');

function lifePinValid(pin) { return typeof pin === 'string' && /^[0-9]{4}$/.test(pin); }
function lifeFailsToday(fails, failDay, today) { return failDay === today ? (Number(fails) || 0) : 0; }
function lifeGateState(s) {
  if (!s.switchOn) return 'off';
  if (s.switchOn === 'test' && !s.isTester) return 'off';
  if (s.locked) return 'locked';
  if (!s.hasPin) return 'new';
  return s.deviceOk ? 'ok' : 'ask';
}

test('4자리만 받는다', () => {
  for (const ok of ['0000', '1234', '9999']) assert.equal(lifePinValid(ok), true);
  for (const no of ['123', '12345', 'abcd', '12 3', '', null, 12]) assert.equal(lifePinValid(no), false);
});

test('틀린 횟수는 오늘 것만 센다', () => {
  assert.equal(lifeFailsToday(4, '2026-10-08', '2026-10-08'), 4);
  assert.equal(lifeFailsToday(4, '2026-10-07', '2026-10-08'), 0);   // 날이 바뀌면 0
  assert.equal(lifeFailsToday(0, null, '2026-10-08'), 0);
});

test('문 상태 다섯', () => {
  assert.equal(lifeGateState({ switchOn: false }), 'off');
  assert.equal(lifeGateState({ switchOn: 'test', isTester: false }), 'off');
  assert.equal(lifeGateState({ switchOn: 'test', isTester: true, hasPin: false }), 'new');
  assert.equal(lifeGateState({ switchOn: 'on', hasPin: false }), 'new');
  assert.equal(lifeGateState({ switchOn: 'on', hasPin: true, deviceOk: false }), 'ask');
  assert.equal(lifeGateState({ switchOn: 'on', hasPin: true, deviceOk: true }), 'ok');
  assert.equal(lifeGateState({ switchOn: 'on', hasPin: true, locked: true }), 'locked');
});
