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

test('eduWhenLine — 서버가 고른 시작·끝 + 회차 수', () => {
  assert.equal(ctx.eduWhenLine({ firstDate: '2026-10-25', lastDate: '2026-12-13', sessionsCount: 8 }), '2026년 10월 25일(일) ~ 12월 13일(일) · 8회');
  assert.equal(ctx.eduWhenLine({ firstDate: '2027-11-03', lastDate: '2028-01-05', sessionsCount: 0 }), '2027년 11월 3일(수) ~ 2028년 1월 5일(수)');
  assert.equal(ctx.eduWhenLine({ firstDate: '2027-03-03', lastDate: '2027-03-03', sessionsCount: 1 }), '2027년 3월 3일(수) · 1회');
  assert.equal(ctx.eduWhenLine({ firstDate: '2027-03-03', lastDate: null, sessionsCount: 0 }), '2027년 3월 3일(수)');
  assert.equal(ctx.eduWhenLine({ firstDate: null, lastDate: null, sessionsCount: 8 }), '8회');
  assert.equal(ctx.eduWhenLine({ firstDate: 'x', sessionsCount: 0 }), '');
  assert.equal(ctx.eduWhenLine({}), '');
  assert.equal(ctx.eduWhenLine(null), '');
});

test('eduPhaseChip — 칩에는 숫자가 없다', () => {
  assert.equal(ctx.eduPhaseChip('open'), '모집 중');
  assert.equal(ctx.eduPhaseChip('upcoming'), '곧 열려요');
  assert.equal(ctx.eduPhaseChip('closed'), '모집 끝');
  assert.equal(ctx.eduPhaseChip('running'), '진행 중');
  assert.equal(ctx.eduPhaseChip('x'), '');
});

const OPEN = { phase: 'open', mode: 'auto', capacity: 24, confirmed: 0, waitlisted: 0, waitlist: false, applyTo: '2026-10-18' };
const pick = (v) => JSON.parse(JSON.stringify(v));   // vm 안 객체를 밖의 deepEqual 과 맞춘다

test('eduSeatView ① 선착순 · 자리 있음', () => {
  assert.deepEqual(pick(ctx.eduSeatView(OPEN, true)), { off: false, head: '24자리 남았어요', sub: '10월 18일(일)까지 신청 · 선착순',
    how: '누르시면 바로 확정돼요. 첫 시간 전날까지 앱에서 취소할 수 있어요.', btn: '신청하기',
    ask: { title: '🎓 신청할까요?', line: '선착순이라 누르시면 바로 확정돼요.', ok: '신청하기' } });
  assert.equal(ctx.eduSeatView({ ...OPEN, confirmed: 21 }, true).head, '3자리 남았어요');
  assert.equal(ctx.eduSeatView({ ...OPEN, applyTo: null }, true).sub, '선착순');   // 마감일 없으면 뺀다
});

test('eduSeatView ② 담당자 확정 — 정원만', () => {
  const v = pick(ctx.eduSeatView({ ...OPEN, mode: 'approve', confirmed: 30 }, true));
  assert.equal(v.head, '정원 24명');
  assert.equal(v.sub, '10월 18일(일)까지 신청 · 담당자 확정');
  assert.equal(v.how, '신청하시면 담당자가 확인한 뒤 확정해요.');
  assert.equal(v.btn, '신청하기');
  assert.deepEqual(v.ask, { title: '🎓 신청할까요?', line: '담당자가 확인한 뒤 확정해요.', ok: '신청하기' });
  assert.equal(ctx.eduSeatView({ ...OPEN, mode: 'approve', capacity: null }, true).head, '인원 제한 없이 받아요');
});

test('eduSeatView ③ 인원 제한 없음', () => {
  const v = ctx.eduSeatView({ ...OPEN, capacity: null }, true);
  assert.equal(v.head, '인원 제한 없이 받아요');
  assert.equal(v.sub, '10월 18일(일)까지 신청');
  assert.equal(v.btn, '신청하기');
});

test('eduSeatView ④ 정원 참 · 대기 받음 — 단추가 「대기 신청하기」', () => {
  const v = pick(ctx.eduSeatView({ ...OPEN, confirmed: 24, waitlist: true, waitlisted: 2 }, true));
  assert.equal(v.head, '정원이 찼어요');
  assert.equal(v.sub, '지금 대기 2분 · 10월 18일(일)까지 신청');
  assert.equal(v.how, '대기로 신청하시면 자리가 날 때 순서대로 확정돼요.');
  assert.equal(v.btn, '대기 신청하기');
  assert.deepEqual(v.ask, { title: '🎓 대기로 신청할까요?', line: '자리가 나면 순서대로 확정돼요.', ok: '대기 신청하기' });
  assert.equal(ctx.eduSeatView({ ...OPEN, confirmed: 24, waitlist: true, waitlisted: 0 }, true).sub, '10월 18일(일)까지 신청');
});

test('eduSeatView ⑤⑥⑦·문 닫힘 — 누를 단추가 없다', () => {
  const full = ctx.eduSeatView({ ...OPEN, confirmed: 24 }, true);
  assert.equal(full.off, true); assert.equal(full.btn, null); assert.equal(full.ask, null);
  assert.equal(full.head, '정원이 찼어요'); assert.equal(full.sub, '함께하고 싶으시면 담당자에게 말씀해 주세요');
  const soon = ctx.eduSeatView({ phase: 'upcoming', applyFrom: '2026-10-11' }, true);
  assert.equal(soon.head, '10월 11일(일)부터 신청할 수 있어요'); assert.equal(soon.sub, '그때 다시 열어 주세요'); assert.equal(soon.btn, null);
  assert.equal(ctx.eduSeatView({ phase: 'upcoming' }, true).head, '곧 신청을 받아요');
  for (const p of ['closed', 'running']) {
    const v = ctx.eduSeatView({ phase: p }, true);
    assert.equal(v.head, '신청을 마감했어요'); assert.equal(v.btn, null);
  }
  const shut = ctx.eduSeatView(OPEN, false);
  assert.equal(shut.head, '아직 신청을 받지 않아요'); assert.equal(shut.btn, null); assert.equal(shut.off, true);
  assert.equal(ctx.eduSeatView({ phase: 'closed' }, false).head, '신청을 마감했어요');   // 단계가 문보다 먼저
});

test('eduMineView ⑧~⑫ — 신청한 뒤', () => {
  const ok = pick(ctx.eduMineView({ status: 'confirmed', canCancel: true, cancelUntil: '2026-10-24', nextSession: { no: 1, date: '2026-10-25', start: '14:30' } }));
  assert.deepEqual(ok, { tone: 'ok', head: '✅ 확정됐어요', lines: ['첫 시간 · 10월 25일(일) 14:30'],
    cancelLine: '10월 24일(토)까지 앱에서 취소할 수 있어요.', cancelBtn: '신청 취소', cancelAsk: '신청을 취소할까요?' });
  assert.deepEqual(pick(ctx.eduMineView({ status: 'confirmed', canCancel: false, nextSession: { no: 3, date: '2026-11-08', start: null } })).lines, ['다음 시간 · 11월 8일(일)']);
  const late = ctx.eduMineView({ status: 'confirmed', canCancel: false, nextSession: null });
  assert.equal(late.lines.length, 0); assert.equal(late.cancelBtn, null);
  assert.equal(late.cancelLine, '시작한 뒤에는 취소를 담당자에게 말씀해 주세요.');
  const ap = ctx.eduMineView({ status: 'applied', canCancel: true, cancelUntil: null });
  assert.equal(ap.tone, 'on'); assert.equal(ap.head, '📝 신청했어요');
  assert.equal(ap.lines[0], '담당자가 확인하고 있어요. 확정되면 「내 강좌」에 「확정」으로 바뀌어요.');
  assert.equal(ap.cancelLine, '첫 시간 전날까지 앱에서 취소할 수 있어요.');   // cancelUntil 이 없을 때
  const wt = ctx.eduMineView({ status: 'waitlisted', waitNo: 2, canCancel: true, cancelUntil: '2026-10-24' });
  assert.equal(wt.head, '⏳ 대기 2번이에요'); assert.equal(wt.lines[0], '자리가 나면 순서대로 확정돼요.');
  assert.equal(wt.cancelBtn, '대기 취소'); assert.equal(wt.cancelAsk, '대기를 취소할까요?');
  const no = pick(ctx.eduMineView({ status: 'declined', statusLabel: '반려' }));
  assert.deepEqual(no, { tone: 'soft', head: '이번 신청은 확정되지 않았어요', lines: ['궁금하시면 담당자에게 말씀해 주세요.'], cancelLine: '', cancelBtn: null, cancelAsk: '' });
  assert.equal(JSON.stringify(no).indexOf('반려'), -1);   // 성도님 화면에 「반려」를 쓰지 않는다
  assert.equal(ctx.eduMineView(null), null);
  assert.equal(ctx.eduMineView({ status: 'cancelled' }), null);
});
