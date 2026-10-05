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
  assert.equal(ctx.eduErrText('not-active'), '이미 처리된 신청이에요.');   // 담당자가 먼저 취소·반려한 줄
});

test('eduMd — 없거나 틀린 날짜는 빈 글', () => {
  assert.equal(ctx.eduMd(null), '');
  assert.equal(ctx.eduMd('x'), '');
  assert.equal(ctx.eduMd('2027-01-03'), '1월 3일');
});

test('eduMdw — 요일(날짜만 있는 값은 밀리지 않는다)', () => {
  assert.equal(ctx.eduMdw('2026-10-09'), '10월 9일(금)');
  assert.equal(ctx.eduMdw('2027-01-03'), '1월 3일(일)');
  assert.equal(ctx.eduMdw(null), '');
});

test('eduPhaseLabel — 정원 차고 대기 없음', () => {
  assert.equal(ctx.eduPhaseLabel({ phase: 'open', capacity: 1, confirmed: 1, waitlisted: 0, waitlist: false }), '정원 참');
});

test('eduEsc — boardEsc 없이도 다섯 글자를 막는다(빈 값은 빈 글)', () => {
  assert.equal(typeof ctx.boardEsc, 'undefined');   // 순수 묶음만 돌린다 — 남의 함수에 기대지 않는다
  assert.equal(ctx.eduEsc(`<b class="x">A&B's</b>`), '&lt;b class=&quot;x&quot;&gt;A&amp;B&#39;s&lt;/b&gt;');
  assert.equal(ctx.eduEsc(null), '');
  assert.equal(ctx.eduEsc(undefined), '');
  assert.equal(ctx.eduEsc(12), '12');
});

test('eduPeriodLine — 교육 기간 한 줄(시작일이 없으면 빈 글)', () => {
  assert.equal(ctx.eduPeriodLine({ startsOn: '2027-03-03', endsOn: '2027-05-19' }), '교육 기간 · 2027년 3월 3일(수) ~ 5월 19일(수)');
  assert.equal(ctx.eduPeriodLine({ startsOn: '2027-11-03', endsOn: '2028-01-05' }), '교육 기간 · 2027년 11월 3일(수) ~ 2028년 1월 5일(수)');   // 해가 다르면 연도를 붙인다
  assert.equal(ctx.eduPeriodLine({ startsOn: '2027-03-03', endsOn: '2027-03-03' }), '교육 기간 · 2027년 3월 3일(수)');
  assert.equal(ctx.eduPeriodLine({ startsOn: '2027-03-03', endsOn: null }), '교육 기간 · 2027년 3월 3일(수)');
  assert.equal(ctx.eduPeriodLine({ startsOn: null, endsOn: '2027-05-19' }), '');
  assert.equal(ctx.eduPeriodLine({ startsOn: 'x' }), '');
  assert.equal(ctx.eduPeriodLine({}), '');
  assert.equal(ctx.eduPeriodLine(null), '');
});
