// 봉사 당번 화면·api 순수 함수 — js/duty.js 와 supabase/functions/api/index.ts 의 표식 사이를 떼어 node:vm 에서 돌린다(꾸러미 없음 · preflight 가 건다)
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const cut = (file, from, to) => {
  const src = fs.readFileSync(path.join(__dirname, '..', ...file), 'utf8');
  const a = src.indexOf(from), b = src.indexOf(to);
  assert.ok(a >= 0 && b > a, '표식을 못 찾았다: ' + file.join('/'));
  const ctx = {}; vm.createContext(ctx); vm.runInContext(src.slice(a, b), ctx);
  return ctx;
};
const ctx = cut(['js', 'duty.js'], '// ── 봉사 당번 순수 함수 (여기부터) ──', '// ── 봉사 당번 순수 함수 (여기까지) ──');
const srv = cut(['supabase', 'functions', 'api', 'index.ts'], '// ── 봉사 당번 — 순수 함수 (여기부터) ──', '// ── 봉사 당번 — 순수 함수 (여기까지) ──');
const pick = (v) => JSON.parse(JSON.stringify(v));   // vm 안 객체를 밖의 deepEqual 과 맞춘다

test('날짜·시각 글 — 요일은 (일) · 잠기는 때는 서버가 준 시각으로', () => {
  assert.equal(ctx.dutyMd('2026-10-18'), '10월 18일'); assert.equal(ctx.dutyMd('x'), ''); assert.equal(ctx.dutyMd(null), '');
  assert.equal(ctx.dutyMdw('2026-10-18'), '10월 18일(일)'); assert.equal(ctx.dutyMdw('2026-10-17'), '10월 17일(토)'); assert.equal(ctx.dutyMdw(''), '');
  assert.equal(ctx.dutyLockText('2026-10-17T10:00:00+00:00'), '10월 17일(토) 저녁 7시');      // 전날 19:00 한국
  assert.equal(ctx.dutyLockText('2026-10-17T10:30:00Z'), '10월 17일(토) 저녁 7시 30분');
  assert.equal(ctx.dutyLockText('2026-10-17T00:00:00Z'), '10월 17일(토) 오전 9시');
  assert.equal(ctx.dutyLockText('2026-10-16T16:00:00Z'), '10월 17일(토) 오전 1시', '한국 날짜로 넘어간다');
  assert.equal(ctx.dutyLockText(''), ''); assert.equal(ctx.dutyLockText(null), '');
  assert.equal(ctx.dutySlotName({ service: '2부', task: '설거지' }), '2부 설거지'); assert.equal(ctx.dutySlotName({ service: '김장', task: '' }), '김장');
  assert.equal(ctx.dutyTimeText({ start: '11:30', end: '12:30' }), '11:30~12:30'); assert.equal(ctx.dutyTimeText({}), '');
});

test('수 말 · 빈 자리 한 줄', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 12].map(ctx.dutyCountWord), ['한 분', '두 분', '세 분', '네 분', '5분', '12분']);
  assert.equal(ctx.dutyCountWord(0), ''); assert.equal(ctx.dutyCountWord(-1), ''); assert.equal(ctx.dutyCountWord('x'), '');
  assert.deepEqual([1, 4, 5].map(ctx.dutySeatWord), ['한 자리', '네 자리', '5자리']); assert.equal(ctx.dutySeatWord(0), ''); assert.equal(ctx.dutySeatWord(null), '');
  assert.equal(ctx.dutyNeedText({ capacity: 2, n: 1 }), '한 분 더 필요해요');
  assert.equal(ctx.dutyNeedText({ capacity: 30, n: 3 }), '27분 더 필요해요');
  assert.equal(ctx.dutyNeedText({ capacity: 2, n: 2 }), '다 찼어요');
  assert.equal(ctx.dutyNeedText({ capacity: 2, n: 3 }), '다 찼어요', '정원을 넘겨 넣은 자리');
});

test('dutyEsc — 다섯 글자 · 빈 값은 빈 글', () => {
  assert.equal(ctx.dutyEsc(`<b class="x">A&B's</b>`), '&lt;b class=&quot;x&quot;&gt;A&amp;B&#39;s&lt;/b&gt;');
  assert.equal(ctx.dutyEsc(null), ''); assert.equal(ctx.dutyEsc(undefined), ''); assert.equal(ctx.dutyEsc(7), '7');
});

const DAY = { date: '2026-10-18', off: false, note: '', locked: false, lockAt: '2026-10-17T10:00:00+00:00' };
const SLOT = { id: 11, service: '2부', task: '설거지', start: '11:30', end: '12:30', capacity: 2, off: false, n: 1, names: ['가상하나'], mine: null, why: '' };
const MINE = { id: 5, status: 'active', byStaff: false, staffAdded: false, asked: false, why: null };

test('dutySlotView — 지원할 수 있는 자리에만 단추', () => {
  assert.deepEqual(pick(ctx.dutySlotView(DAY, SLOT)), { kind: 'open', my: null, line: '한 분 더 필요해요', btn: { act: 'apply', label: '지원하기' } });
  for (const [why, kind, line] of [['full', 'full', '다 찼어요'], ['started', 'started', '이미 시작했어요'], ['closed', 'closed', '담당자가 넣는 자리예요'],
    ['off', 'off', '쉬어요'], ['zzz', 'closed', '지금은 지원을 받지 않아요']]) {
    const v = ctx.dutySlotView(DAY, { ...SLOT, why });
    assert.deepEqual([v.kind, v.line, v.btn, v.my], [kind, line, null, null], why);
  }
  assert.equal(ctx.dutySlotView({ ...DAY, off: true }, SLOT).kind, 'off', '쉬는 날은 why 가 비어 와도 단추가 없다');
  assert.equal(ctx.dutySlotView(DAY, { ...SLOT, off: true }).btn, null);
  assert.equal(ctx.dutySlotView(null, null).kind, 'open');   // 빈 값에도 죽지 않는다(그리는 쪽은 서버 줄만 넘긴다)
});

test('dutyMyView — 내 줄의 다섯 모습', () => {
  const my = (d, m, s) => pick(ctx.dutySlotView(d, { ...SLOT, why: m && m.status === 'active' ? 'mine' : 'removed', mine: m, ...(s || {}) }).my);
  let v = my(DAY, MINE);
  assert.deepEqual([v.tone, v.head, v.btn], ['ok', '✅ 지원했어요', { act: 'cancel', label: '지원 취소' }]);
  assert.ok(v.sub.includes('10월 17일(토) 저녁 7시까지 앱에서 취소할 수 있어요'));
  v = my({ ...DAY, locked: true, lockAt: null }, MINE);
  assert.deepEqual([v.tone, v.head, v.btn], ['lock', '🔒 확정됐어요', { act: 'ask', label: '못 가게 됐어요' }]);
  v = my(DAY, { ...MINE, staffAdded: true });
  assert.deepEqual([v.tone, v.head, v.btn.act], ['ok', '✅ 담당자가 넣어 드렸어요', 'ask'], '담당자가 넣은 줄은 잠기기 전에도 취소 단추가 없다');
  v = my({ ...DAY, locked: true }, { ...MINE, asked: true, why: 'cant' });
  assert.deepEqual([v.tone, v.head, v.btn], ['ask', '📨 담당자께 알렸어요', { act: 'unask', label: '알림 거두기' }]);
  assert.ok(v.sub.startsWith('사정이 생겨 못 가게 됐어요'));
  v = my({ ...DAY, locked: true }, { ...MINE, asked: true, why: null });
  assert.ok(v.sub.startsWith('못 간다고 알렸어요'));
  v = my(DAY, { ...MINE, status: 'removed', byStaff: true });
  assert.deepEqual([v.tone, v.head, v.btn], ['soft', '담당자가 빼 드렸어요', null]);
  assert.equal(JSON.stringify(v).includes('removed'), false, '성도님 화면에 담당자 말을 쓰지 않는다');
  v = my({ ...DAY, off: true }, MINE);
  assert.deepEqual([v.tone, v.head, v.btn], ['soft', '😴 이날은 쉬어요', { act: 'cancel', label: '지원 취소' }], '다시 열리면 살아나므로 미리 뺄 길은 남긴다');
  assert.equal(my({ ...DAY, off: true }, { ...MINE, staffAdded: true }).btn, null, '담당자가 넣은 줄은 쉬는 날에도 스스로 못 뺀다');
  v = my(DAY, MINE, { off: true });
  assert.equal(v.head, '😴 이날은 쉬어요', '이 자리만 쉬어도');
  v = my({ ...DAY, off: true, locked: true }, { ...MINE, asked: true, why: 'cant' });
  assert.deepEqual([v.head, v.btn], ['😴 이날은 쉬어요', null], '쉬는 날이 알림보다 앞선다(안 나오셔도 된다) · 잠긴 뒤에는 단추 없음');
});

test('dutyDayLine — 쉼 · 확정 · 언제까지 취소', () => {
  assert.equal(ctx.dutyDayLine(DAY), '10월 17일(토) 저녁 7시까지 앱에서 취소할 수 있어요');
  assert.equal(ctx.dutyDayLine({ ...DAY, note: '추수감사주일' }), '10월 17일(토) 저녁 7시까지 앱에서 취소할 수 있어요 · 추수감사주일');
  assert.equal(ctx.dutyDayLine({ ...DAY, locked: true, lockAt: null }), '🔒 확정된 날이에요 — 지금 지원하면 앱에서 취소할 수 없어요');
  assert.equal(ctx.dutyDayLine({ ...DAY, off: true, note: '여름 휴가' }), '😴 이날은 쉬어요 — 여름 휴가');
  assert.equal(ctx.dutyDayLine({ ...DAY, off: true }), '😴 이날은 쉬어요');
  assert.equal(ctx.dutyDayLine({ date: '2026-10-18', note: '메모만' }), '메모만');
  assert.equal(ctx.dutyDayLine(null), '');
});

test('dutyApplyAsk — 누구 이름으로 · 이름이 보인다 · 언제까지 취소 · 잠긴 날은 다른 창', () => {
  const b = { place: '지하 1층 식당' };
  let a = pick(ctx.dutyApplyAsk(b, DAY, SLOT, '가상하나 성도님 · 기쁨 3목장', false));
  assert.deepEqual([a.title, a.ok, a.strong, a.where, a.who], ['🙋 지원할까요?', '지원하기', '10월 18일(일) · 2부 설거지', '11:30~12:30 · 지하 1층 식당', '가상하나 성도님 · 기쁨 3목장']);
  assert.deepEqual(a.lines, ['이 자리에 이름이 보여요.', '10월 17일(토) 저녁 7시까지 앱에서 취소할 수 있어요.']);
  a = pick(ctx.dutyApplyAsk(b, { ...DAY, locked: true, lockAt: null }, SLOT, '가상하나 성도님', true));
  assert.deepEqual([a.title, a.ok], ['⚠️ 취소할 수 없는 날이에요', '취소 못 해도 지원하기']);
  assert.ok(a.lines[0].includes('앱에서 취소할 수 없어요') && a.lines.includes('이 자리에 이름이 보여요.'));
  a = pick(ctx.dutyApplyAsk({}, { date: '2026-10-18' }, { service: '김장', task: '' }, '', false));
  assert.deepEqual([a.strong, a.where, a.lines[1]], ['10월 18일(일) · 김장', '', '확정되기 전까지 앱에서 취소할 수 있어요.']);
});

test('dutyErrText — 서버 거절마다 성도님 말 · 겹침은 무엇과 겹쳤는지', () => {
  for (const c of ['full', 'closed', 'off', 'past', 'started', 'not-yet', 'after-until', 'removed-by-staff', 'guardian', 'bad-name', 'locked', 'staff-row',
    'not-locked', 'not-active', 'changed', 'not-open', 'no-user', 'not-found']) {
    assert.ok(ctx.dutyErrText(c).length > 5 && ctx.dutyErrText(c) !== '잠시 뒤 다시 해 주세요.', c);
  }
  assert.equal(ctx.dutyErrText('zzz'), '잠시 뒤 다시 해 주세요.'); assert.equal(ctx.dutyErrText('toString'), '잠시 뒤 다시 해 주세요.');
  assert.equal(ctx.dutyErrText('overlap', { with: { board: '주차 봉사', service: '2부', task: '안내', start: '11:00' } }), '같은 날 겹치는 시간에 이미 주차 봉사 2부 안내(11:00) 당번이 있어요.');
  assert.equal(ctx.dutyErrText('overlap', { with: null }), '같은 날 겹치는 시간에 이미 다른 당번이 있어요.', '아직 공개 전인 당번과 겹치면 이름 없이');
  assert.equal(ctx.dutyErrText('overlap'), '같은 날 겹치는 시간에 이미 다른 당번이 있어요.');
  assert.equal(ctx.dutyErrText('too-many', { max: 3 }), '이 당번은 한 분이 세 자리까지 미리 잡아 둘 수 있어요. 서신 뒤에 다시 지원해 주세요.');
  assert.equal(ctx.dutyErrText('too-many', { max: 12 }), '이 당번은 한 분이 12자리까지 미리 잡아 둘 수 있어요. 서신 뒤에 다시 지원해 주세요.');
  assert.equal(ctx.dutyErrText('too-many', {}).includes('정해진 수'), true);
  for (const c of ['full', 'closed', 'off', 'removed-by-staff', 'locked', 'staff-row', 'not-active', 'changed', 'not-found']) assert.equal(ctx.dutyNeedsReload(c), true, c);
  for (const c of ['overlap', 'too-many', 'guardian', 'bad-name', 'not-open', 'zzz']) assert.equal(ctx.dutyNeedsReload(c), false, c);
});

test('당번 카드 · 내 당번 카드', () => {
  assert.equal(ctx.dutyBoardLine({ status: 'open', need: [{ date: '2026-10-18', need: 1 }, { date: '2026-10-25', need: 3 }] }), '손이 필요한 날 · 10월 18일(일) 한 분 · 10월 25일(일) 세 분');
  assert.equal(ctx.dutyBoardLine({ status: 'open', need: [] }), '가까운 날은 다 찼어요');
  assert.equal(ctx.dutyBoardLine({ status: 'open', need: [{ date: 'x', need: 2 }, { date: '2026-10-18', need: 0 }] }), '가까운 날은 다 찼어요');
  assert.equal(ctx.dutyBoardLine({ status: 'closed', need: [{ date: '2026-10-18', need: 1 }] }), '담당자가 넣는 당번이에요 — 당번표를 볼 수 있어요');
  assert.equal(ctx.dutyBoardLine(null), '');
  const m = { id: 5, boardId: 'b1', board: '식당 봉사', place: '지하 1층 식당', date: '2026-10-18', service: '2부', task: '설거지', start: '11:30', end: '12:30',
    status: 'active', byStaff: false, staffAdded: false, off: false, note: '', locked: false, lockAt: '2026-10-17T10:00:00+00:00', asked: false, why: null,
    movedFrom: null, overlap: false, canCancel: true, canAsk: false };
  let c = pick(ctx.dutyMineCard(m));
  assert.deepEqual([c.title, c.where, c.my.head, c.my.btn.act, c.chips, c.note], ['10월 18일(일) · 식당 봉사', '2부 설거지 · 11:30~12:30 · 지하 1층 식당', '✅ 지원했어요', 'cancel', [], '']);
  c = pick(ctx.dutyMineCard({ ...m, movedFrom: 7, overlap: true, locked: true }));
  assert.deepEqual([c.my.head, c.chips.length], ['🔒 확정됐어요', 2]);
  c = pick(ctx.dutyMineCard({ ...m, status: 'removed', byStaff: true, movedFrom: 7, overlap: true }));
  assert.deepEqual([c.my.head, c.chips], ['담당자가 빼 드렸어요', []], '빠진 줄에는 옮김·겹침 표시를 달지 않는다');
  c = pick(ctx.dutyMineCard({ ...m, off: true, note: '여름 휴가' }));
  assert.deepEqual([c.my.head, c.note], ['😴 이날은 쉬어요', '여름 휴가']);
  // 서버의 canCancel·canAsk 와 화면이 고른 단추가 같은 뜻이다(잠김·담당자가 넣음)
  for (const [x, act] of [[{ locked: false, staffAdded: false }, 'cancel'], [{ locked: true, staffAdded: false }, 'ask'], [{ locked: false, staffAdded: true }, 'ask']]) {
    assert.equal(ctx.dutyMineCard({ ...m, ...x }).my.btn.act, act, JSON.stringify(x));
  }
});

test('dutyContactHtml — 전화번호만 눌러서 걸리게 · 나머지는 이스케이프', () => {
  assert.equal(ctx.dutyContactHtml('가상담당 집사 010-0000-0000 (저녁)'), '가상담당 집사 <a class="duty-tel" href="tel:01000000000">010-0000-0000</a> (저녁)');
  assert.equal(ctx.dutyContactHtml('교회 사무실로'), '교회 사무실로');
  assert.equal(ctx.dutyContactHtml('<img src=x> 010-0000-0000'), '&lt;img src=x&gt; <a class="duty-tel" href="tel:01000000000">010-0000-0000</a>');
  assert.equal(ctx.dutyContactHtml(null), ''); assert.equal(ctx.dutyContactHtml(''), '');
});

test('못 가게 됐어요 까닭 — 화면 값이 서버(dutyWhyOf)가 받는 값과 같다', () => {
  const codes = pick(ctx.DUTY_WHY).map((x) => x[0]);
  assert.deepEqual(codes, ['cant', 'mistake', 'notme']);
  for (const c of codes) assert.deepEqual(pick(srv.dutyWhyOf(c)), { ok: true, why: c });
  assert.deepEqual(pick(srv.dutyWhyOf(null)), { ok: true, why: null }); assert.deepEqual(pick(srv.dutyWhyOf('')), { ok: true, why: null });
  assert.deepEqual(pick(srv.dutyWhyOf('x')), { ok: false, why: null }); assert.deepEqual(pick(srv.dutyWhyOf({})), { ok: false, why: null });
  assert.equal(ctx.dutyWhyText('notme'), '제가 지원한 게 아니에요'); assert.equal(ctx.dutyWhyText('zzz'), '못 간다고 알렸어요');
});

test('api dutyNameOk — 당번표에 실을 이름', () => {
  for (const ok of ['가상하나', '가상 하나', 'Kim Mina', '가', '가'.repeat(20), '김123']) assert.equal(srv.dutyNameOk(ok), true, ok);
  for (const bad of ['', '   ', null, undefined, '가'.repeat(21), '<b>가상</b>', '가상"하나', "가상'하나", '가상`하나', '가상' + String.fromCharCode(92) + '하나',
    '가상\n하나', '가상' + String.fromCharCode(0x200b) + '하나', '가상' + String.fromCharCode(0x202e) + '하나', '가상' + String.fromCharCode(0x061c) + '하나', '가상' + String.fromCharCode(0x2028) + '하나', '01012345678', '가상1234', '가상 0000']) assert.equal(srv.dutyNameOk(bad), false, JSON.stringify(bad));
});

test('api dutyOverlapOut — 준비 중인 당번과 겹치면 이름을 싣지 않는다', () => {
  assert.deepEqual(pick(srv.dutyOverlapOut({ board: '주차 봉사', service: '2부', task: '안내', start: '11:00', draft: false, same_board: false, extra: 'x' })),
    { board: '주차 봉사', service: '2부', task: '안내', start: '11:00' });
  assert.equal(srv.dutyOverlapOut({ board: '비밀 당번', service: '1부', task: '', start: '09:00', draft: true }), null);
  assert.equal(srv.dutyOverlapOut(null), null); assert.equal(srv.dutyOverlapOut('x'), null);
  assert.deepEqual(pick(srv.dutyOverlapOut({})), { board: '', service: '', task: '', start: '' });
});
