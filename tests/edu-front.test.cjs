// 교육신청 화면 순수 함수 — js/edu.js 의 표식 사이를 떼어 node:vm 에서 돌린다(꾸러미 없음 · preflight 가 건다)
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'edu.js'), 'utf8');
const a = src.indexOf('// ── 교육 순수 함수 (여기부터) ──'), b = src.indexOf('// ── 교육 순수 함수 (여기까지) ──');
assert.ok(a >= 0 && b > a, '표식을 못 찾았다');
const ctx = {}; vm.createContext(ctx); vm.runInContext(src.slice(a, b), ctx);

test('eduPhaseLabel', () => {
  assert.equal(ctx.eduPhaseLabel({ phase: 'upcoming', applyFrom: '2027-01-03' }), '1월 3일부터 신청');
  assert.equal(ctx.eduPhaseLabel({ phase: 'open', capacity: 20, confirmed: 14, waitlisted: 0, mode: 'auto' }), '모집 중 · 14/20');
  assert.equal(ctx.eduPhaseLabel({ phase: 'open', capacity: 20, confirmed: 20, waitlisted: 3, mode: 'auto', waitlist: true }), '모집 중 · 정원 참 · 대기 3');
  assert.equal(ctx.eduPhaseLabel({ phase: 'closed' }), '모집 끝');
  assert.equal(ctx.eduPhaseLabel({ phase: 'running' }), '진행 중');
});

test('eduApplyMessage — 결과마다 한 줄', () => {
  assert.equal(ctx.eduApplyMessage({ ok: true, status: 'confirmed' }), '확정됐어요');
  assert.equal(ctx.eduApplyMessage({ ok: true, status: 'waitlisted', waitNo: 2 }), '대기 2번이에요 — 자리가 나면 확정돼요');
  assert.equal(ctx.eduApplyMessage({ ok: true, status: 'applied' }), '신청했어요 — 담당자가 확정하면 「내 강좌」에 보여요');
  assert.equal(ctx.eduApplyMessage({ ok: true, status: 'confirmed', already: true }), '이미 신청하셨어요');
  assert.equal(ctx.eduApplyMessage({ ok: true, status: 'declined', already: true }), '이 강좌는 담당자에게 말씀해 주세요');
});

test('eduStatusLine', () => {
  assert.equal(ctx.eduStatusLine({ status: 'waitlisted', statusLabel: '대기', waitNo: 1 }), '대기 1번');
  assert.equal(ctx.eduStatusLine({ status: 'confirmed', statusLabel: '확정' }), '확정');
});

test('eduErrText', () => {
  assert.equal(ctx.eduErrText('full'), '정원이 찼어요.');
  assert.equal(ctx.eduErrText('too-late'), '시작한 뒤에는 앱에서 취소할 수 없어요. 담당자에게 말씀해 주세요.');
  assert.equal(ctx.eduErrText('not-open'), '아직 신청을 받지 않아요.');
  assert.equal(ctx.eduErrText('x'), '잠시 뒤 다시 해 주세요.');
});
