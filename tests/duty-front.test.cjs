// 봉사 당번 화면·api 순수 함수 — js/duty.js 와 supabase/functions/api/index.ts 의 표식 사이를 떼어 node:vm 에서 돌린다(꾸러미 없음 · preflight 가 건다)
//   화면 흐름(늦게 온 응답 · 다시 받기 실패 · 계정 번호 없음)은 tests/duty-flow.test.cjs 가 가짜 DOM 위에서 본다.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
// ⚠️ 줄 끝을 LF 로 맞춰 읽는다 — 윈도우 작업 폴더(core.autocrlf)는 CRLF 라, 그대로 읽으면 아래 글자 검사가 함수 끝을 못 찾는다(재검증 2026-10-06)
const read = (file) => fs.readFileSync(path.join(__dirname, '..', ...file), 'utf8').replace(/\r\n/g, '\n');
const cut = (file, from, to) => {
  const src = read(file);
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

test('언제까지 취소 — 「확정 전까지」가 참이고 전날 저녁은 「늦어도」다(담당자가 먼저 확정할 수 있다)', () => {
  assert.equal(ctx.dutyUntilText('2026-10-17T10:00:00+00:00'), '확정 전까지 앱에서 취소할 수 있어요(늦어도 10월 17일(토) 저녁 7시에 확정돼요).');
  assert.equal(ctx.dutyUntilText(null), '확정 전까지 앱에서 취소할 수 있어요.');
  // 「○일 저녁 7시까지 취소할 수 있어요」라고 단정하는 문장은 어디에도 없다(순수 구간 전체를 글자로 본다)
  const src = read(['js', 'duty.js']);
  assert.equal(/까지 앱에서 취소할 수 있어요/.test(src.replace(/확정 전까지 앱에서 취소할 수 있어요/g, '')), false, '시각을 못 박아 「…까지 취소할 수 있어요」라고 말하는 줄이 남았다');
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

test('dutySlotView · dutyMeNote — 앱에서 지원하지 못하는 계정(어린이·청소년 부서 · 실을 수 없는 이름)에는 단추를 두지 않고 까닭을 한 줄로', () => {
  for (const why of ['guardian', 'bad-name']) {
    const v = pick(ctx.dutySlotView(DAY, SLOT, { why }));
    assert.deepEqual([v.kind, v.line, v.btn], ['open', '한 분 더 필요해요', null], why);
    assert.ok(ctx.dutyMeNote({ why }).length > 10 && ctx.dutyMeNote({ why }) === ctx.dutyErrText(why), why);
  }
  assert.equal(ctx.dutySlotView(DAY, SLOT, { why: '' }).btn.act, 'apply'); assert.equal(ctx.dutySlotView(DAY, SLOT, {}).btn.act, 'apply');
  assert.equal(ctx.dutyMeNote({ why: '' }), ''); assert.equal(ctx.dutyMeNote(null), ''); assert.equal(ctx.dutyMeNote({ why: 'zzz' }), '', '모르는 까닭은 말하지 않는다');
  // 내 줄은 그대로 보인다(담당자가 넣어 준 어린이 부서 계정의 줄 — 「못 가게 됐어요」는 쓸 수 있다)
  assert.equal(ctx.dutySlotView(DAY, { ...SLOT, why: 'mine', mine: { ...MINE, staffAdded: true } }, { why: 'guardian' }).my.btn.act, 'ask');
});

test('dutyMyView — 내 줄의 모습', () => {
  const my = (d, m, s) => pick(ctx.dutySlotView(d, { ...SLOT, why: m && m.status === 'active' ? 'mine' : 'removed', mine: m, ...(s || {}) }).my);
  let v = my(DAY, MINE);
  assert.deepEqual([v.tone, v.head, v.btn], ['ok', '✅ 지원했어요', { act: 'cancel', label: '지원 취소' }]);
  assert.ok(v.sub.includes('확정 전까지 앱에서 취소할 수 있어요(늦어도 10월 17일(토) 저녁 7시에 확정돼요).'));
  v = my({ ...DAY, locked: true, lockAt: null }, MINE);
  assert.deepEqual([v.tone, v.head, v.btn], ['lock', '🔒 확정됐어요', { act: 'ask', label: '못 가게 됐어요' }]);
  v = my(DAY, { ...MINE, staffAdded: true });
  assert.deepEqual([v.tone, v.head, v.btn.act], ['ok', '✅ 담당자가 넣어 드렸어요', 'ask'], '담당자가 넣은 줄은 잠기기 전에도 취소 단추가 없다');
  // 「못 가게 됐어요」 표시 — 담당자 휴대폰으로 가는 알림이 아니다(당번표의 표시) → 「알렸어요」라고 하지 않고 급하면 직접 연락하시게
  v = my({ ...DAY, locked: true }, { ...MINE, asked: true, why: 'cant' });
  assert.deepEqual([v.tone, v.head, v.btn], ['ask', '📨 담당자 당번표에 표시했어요', { act: 'unask', label: '표시 거두기' }]);
  assert.ok(v.sub.startsWith('사정이 생겨 못 가게 됐어요') && v.sub.includes('급하시면 담당자께 직접 연락해 주세요'));
  assert.equal(JSON.stringify(v).includes('알렸어요'), false);
  v = my({ ...DAY, locked: true }, { ...MINE, asked: true, why: null });
  assert.ok(v.sub.startsWith('못 간다고 표시했어요'));
  v = my(DAY, { ...MINE, asked: true, why: 'notme', staffAdded: true });
  assert.equal(v.btn.act, 'unask', '담당자가 넣은 줄은 잠기기 전에도 표시만 거둔다(스스로 못 뺀다)');
  v = my(DAY, { ...MINE, asked: true, why: 'cant' });
  assert.deepEqual([v.tone, v.btn], ['ask', { act: 'cancel', label: '지원 취소' }], '표시한 뒤 담당자가 확정을 풀었다 — 바로 취소할 수 있다');
  v = my(DAY, { ...MINE, status: 'removed', byStaff: true });
  assert.deepEqual([v.tone, v.head, v.btn], ['soft', '담당자가 빼 드렸어요', null]);
  assert.equal(JSON.stringify(v).includes('removed'), false, '성도님 화면에 담당자 말을 쓰지 않는다');
});

test('dutyMyView — 쉼: 그날이 쉬면 「이날은」 · 자리만 쉬면 「이 자리는」(같은 날 다른 당번까지 빠지시지 않게)', () => {
  const my = (d, m, s) => pick(ctx.dutySlotView(d, { ...SLOT, why: 'mine', mine: m, ...(s || {}) }).my);
  let v = my({ ...DAY, off: true }, MINE);
  assert.deepEqual([v.tone, v.head, v.btn], ['soft', '😴 이날은 쉬어요', { act: 'cancel', label: '지원 취소' }], '다시 열리면 살아나므로 미리 뺄 길은 남긴다');
  assert.equal(my({ ...DAY, off: true }, { ...MINE, staffAdded: true }).btn, null, '담당자가 넣은 줄은 쉬는 날에도 스스로 못 뺀다');
  v = my(DAY, MINE, { off: true });
  assert.deepEqual([v.head, v.btn.act], ['😴 이 자리는 쉬어요', 'cancel']);
  assert.ok(v.sub.startsWith('이 자리는 안 나오셔도 돼요') && !v.sub.includes('이날'));
  v = my({ ...DAY, off: true, locked: true }, { ...MINE, asked: true, why: 'cant' });
  assert.deepEqual([v.head, v.btn], ['😴 이날은 쉬어요', null], '쉬는 날이 표시보다 앞선다(안 나오셔도 된다) · 잠긴 뒤에는 단추 없음');
  // 내 당번 카드 — 서버 duty_mine 의 off(그날이나 그 자리)·dayOff(그날) · 그날 메모(📌)는 그날이 쉴 때만 붙인다
  const m = { id: 5, board: '식당 봉사', date: '2026-10-18', service: '2부', task: '배식', status: 'active', off: true, dayOff: false, note: '추수감사주일 — 손이 더 필요해요', locked: false };
  let c = pick(ctx.dutyMineCard(m));
  assert.deepEqual([c.my.head, c.note], ['😴 이 자리는 쉬어요', ''], '자리만 쉬는데 그날 메모를 붙이지 않는다');
  c = pick(ctx.dutyMineCard({ ...m, dayOff: true, note: '여름 휴가' }));
  assert.deepEqual([c.my.head, c.note], ['😴 이날은 쉬어요', '여름 휴가']);
  c = pick(ctx.dutyMineCard({ ...m, dayOff: undefined }));
  assert.equal(c.my.head, '😴 이 자리는 쉬어요', 'dayOff 를 모르면(옛 서버) 어느 경우에도 참인 말로');
});

test('내 줄의 단추 = 서버 규칙(duty_mine 의 canCancel·canAsk)과 같은 뜻 — 조합마다 맞대 본다', () => {
  // SQL: canCancel = active · 내가 지원한 줄(source <> staff) · 안 잠김 / canAsk = active · (담당자가 넣은 줄 또는 잠김)
  const canCancel = (x) => x.status === 'active' && !x.staffAdded && !x.locked;
  const canAsk = (x) => x.status === 'active' && (x.staffAdded || x.locked);
  for (const status of ['active', 'removed']) for (const locked of [false, true]) for (const staffAdded of [false, true])
    for (const off of [false, true]) for (const asked of [false, true]) {
      const x = { status, locked, staffAdded, off, dayOff: off, asked, why: asked ? 'cant' : null, lockAt: null, byStaff: status !== 'active' };
      const act = (ctx.dutyMyView(x).btn || {}).act || null, tag = JSON.stringify(x);
      if (act === 'cancel') assert.equal(canCancel(x), true, '서버가 거절할 「지원 취소」 단추: ' + tag);
      if (act === 'ask') assert.equal(canAsk(x), true, '서버가 거절할 「못 가게 됐어요」 단추: ' + tag);
      if (act === 'unask') assert.equal(x.status === 'active' && asked, true, tag);
      if (status !== 'active') assert.equal(act, null, '빠진 줄에는 단추가 없다: ' + tag);
      // 쉬는 날·자리에는 알리기 단추를 두지 않는다(안 나오셔도 되는 날이다 — 의도) · 그 밖에는 할 수 있는 일이 단추로 있다
      if (status === 'active' && off) assert.notEqual(act, 'ask', tag);
      if (status === 'active' && !off && !asked) assert.equal(act, canCancel(x) ? 'cancel' : 'ask', tag);
    }
});

test('dutyDayLine — 쉼 · 확정 · 언제 확정되나 · 담당자가 넣는 당번에는 지원·취소 말을 쓰지 않는다', () => {
  assert.equal(ctx.dutyDayLine(DAY), '늦어도 10월 17일(토) 저녁 7시에 확정돼요 — 확정 뒤에는 앱에서 취소할 수 없어요');
  assert.equal(ctx.dutyDayLine({ ...DAY, note: '추수감사주일' }), '늦어도 10월 17일(토) 저녁 7시에 확정돼요 — 확정 뒤에는 앱에서 취소할 수 없어요 · 추수감사주일');
  assert.equal(ctx.dutyDayLine({ ...DAY, locked: true, lockAt: null }), '🔒 확정된 날이에요 — 지금 지원하면 앱에서 취소할 수 없어요');
  assert.equal(ctx.dutyDayLine({ ...DAY, off: true, note: '여름 휴가' }), '😴 이날은 쉬어요 — 여름 휴가');
  assert.equal(ctx.dutyDayLine({ ...DAY, off: true }), '😴 이날은 쉬어요');
  assert.equal(ctx.dutyDayLine({ date: '2026-10-18', note: '메모만' }), '메모만');
  assert.equal(ctx.dutyDayLine(null), '');
  // 담당자가 넣는 당번(지원 멈춤) — 앱에서 지원·취소하지 않는다
  assert.equal(ctx.dutyDayLine(DAY, true), '');
  assert.equal(ctx.dutyDayLine({ ...DAY, note: '추수감사주일' }, true), '추수감사주일');
  assert.equal(ctx.dutyDayLine({ ...DAY, locked: true, lockAt: null, note: '추수감사주일' }, true), '🔒 확정된 날이에요 · 추수감사주일');
  assert.equal(ctx.dutyDayLine({ ...DAY, off: true, note: '여름 휴가' }, true), '😴 이날은 쉬어요 — 여름 휴가');
  for (const d of [DAY, { ...DAY, locked: true }]) assert.equal(/취소|지원/.test(ctx.dutyDayLine(d, true)), false);
});

test('dutyApplyAsk — 누구 이름으로 · 이름이 보인다 · 언제까지 취소 · 잠긴 날은 다른 창', () => {
  const b = { place: '지하 1층 식당' };
  let a = pick(ctx.dutyApplyAsk(b, DAY, SLOT, '가상하나 성도님 · 기쁨 3목장', false));
  assert.deepEqual([a.title, a.ok, a.strong, a.where, a.who], ['🙋 지원할까요?', '지원하기', '10월 18일(일) · 2부 설거지', '11:30~12:30 · 지하 1층 식당', '가상하나 성도님 · 기쁨 3목장']);
  assert.deepEqual(a.lines, ['이 자리에 이름이 보여요.', '확정 전까지 앱에서 취소할 수 있어요(늦어도 10월 17일(토) 저녁 7시에 확정돼요).']);
  a = pick(ctx.dutyApplyAsk(b, { ...DAY, locked: true, lockAt: null }, SLOT, '가상하나 성도님', true));
  assert.deepEqual([a.title, a.ok], ['⚠️ 취소할 수 없는 날이에요', '취소 못 해도 지원하기']);
  assert.ok(a.lines[0].includes('앱에서 취소할 수 없어요') && a.lines.includes('이 자리에 이름이 보여요.'));
  a = pick(ctx.dutyApplyAsk({}, { date: '2026-10-18' }, { service: '김장', task: '' }, '', false));
  assert.deepEqual([a.strong, a.where, a.lines[1]], ['10월 18일(일) · 김장', '', '확정 전까지 앱에서 취소할 수 있어요.']);
});

test('dutyErrText — 서버 거절마다 성도님 말 · 겹침은 무엇과 겹쳤는지', () => {
  for (const c of ['full', 'closed', 'off', 'past', 'started', 'not-yet', 'after-until', 'removed-by-staff', 'guardian', 'bad-name', 'locked', 'locked-day', 'staff-row',
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
  for (const c of ['full', 'closed', 'off', 'removed-by-staff', 'locked', 'locked-day', 'staff-row', 'not-active', 'changed', 'not-found']) assert.equal(ctx.dutyNeedsReload(c), true, c);
  for (const c of ['overlap', 'too-many', 'guardian', 'bad-name', 'not-open', 'zzz']) assert.equal(ctx.dutyNeedsReload(c), false, c);
});

test('당번 카드 · 내 당번 카드', () => {
  assert.equal(ctx.dutyBoardLine({ status: 'open', need: [{ date: '2026-10-18', need: 1 }, { date: '2026-10-25', need: 3 }] }), '손이 필요한 날 · 10월 18일(일) 한 분 · 10월 25일(일) 세 분');
  // need 가 비는 때 = 다 참 · 모두 쉼 · 보이는 날짜가 아직 없음 · 오늘 시작한 자리만 — 어느 쪽에도 참인 말만(「다 찼어요」라고 하지 않는다)
  assert.equal(ctx.dutyBoardLine({ status: 'open', need: [] }), '지금은 지원할 수 있는 자리가 없어요');
  assert.equal(ctx.dutyBoardLine({ status: 'open', need: [{ date: 'x', need: 2 }, { date: '2026-10-18', need: 0 }] }), '지금은 지원할 수 있는 자리가 없어요');
  assert.equal(ctx.dutyBoardLine({ status: 'closed', need: [{ date: '2026-10-18', need: 1 }] }), '담당자가 넣는 당번이에요 — 당번표를 볼 수 있어요');
  assert.equal(ctx.dutyBoardLine(null), '');
  const m = { id: 5, boardId: 'b1', board: '식당 봉사', place: '지하 1층 식당', date: '2026-10-18', service: '2부', task: '설거지', start: '11:30', end: '12:30',
    status: 'active', byStaff: false, staffAdded: false, off: false, dayOff: false, note: '', locked: false, lockAt: '2026-10-17T10:00:00+00:00', asked: false, why: null,
    movedFrom: null, overlap: false, canCancel: true, canAsk: false };
  let c = pick(ctx.dutyMineCard(m));
  assert.deepEqual([c.title, c.where, c.my.head, c.my.btn.act, c.chips, c.note], ['10월 18일(일) · 식당 봉사', '2부 설거지 · 11:30~12:30 · 지하 1층 식당', '✅ 지원했어요', 'cancel', [], '']);
  c = pick(ctx.dutyMineCard({ ...m, movedFrom: 7, overlap: true, locked: true }));
  assert.deepEqual([c.my.head, c.chips.length], ['🔒 확정됐어요', 2]);
  c = pick(ctx.dutyMineCard({ ...m, status: 'removed', byStaff: true, movedFrom: 7, overlap: true }));
  assert.deepEqual([c.my.head, c.chips], ['담당자가 빼 드렸어요', []], '빠진 줄에는 옮김·겹침 표시를 달지 않는다');
  // 문의처 — 스스로 뺄 수 없는 줄에만(「담당자께」라고 말하는 줄에는 닿을 길을 함께)
  const mc = { ...m, contact: '가상담당 집사 010-0000-0000' };
  assert.equal(ctx.dutyMineCard(mc).contact, '', '스스로 취소할 수 있는 줄에는 싣지 않는다');
  for (const x of [{ locked: true }, { staffAdded: true }, { status: 'removed', byStaff: true }, { locked: true, asked: true, why: 'cant' }]) {
    assert.equal(ctx.dutyMineCard({ ...mc, ...x }).contact, '가상담당 집사 010-0000-0000', JSON.stringify(x));
  }
  assert.equal(ctx.dutyMineCard({ ...m, locked: true }).contact, '', '문의처를 안 적은 당번');
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
  assert.equal(ctx.dutyWhyText('notme'), '제가 지원한 게 아니에요'); assert.equal(ctx.dutyWhyText('zzz'), '못 간다고 표시했어요');
});

test('달력 — 날짜가 넷 이상이면 달력 · 그보다 적으면 날짜 카드', () => {
  const days = (n) => Array.from({ length: n }, (_, i) => ({ date: '2026-10-' + String(11 + i).padStart(2, '0') }));
  assert.equal(ctx.DUTY_CAL_MIN, 4);
  assert.deepEqual([0, 1, 3, 4, 20].map((n) => ctx.dutyCalUse(days(n))), [false, false, false, true, true]);
  assert.equal(ctx.dutyCalUse(null), false);
});

test('달력 — 한 달의 칸: 일요일부터 · 앞 빈칸 · 윤년 · 틀린 값은 빈 목록 · 달 이름', () => {
  const oct = pick(ctx.dutyCalMonth('2026-10'));          // 2026-10-01 은 목요일
  assert.equal(oct.length, 4 + 31);
  assert.deepEqual(oct.slice(0, 5), [{ date: '', n: 0 }, { date: '', n: 0 }, { date: '', n: 0 }, { date: '', n: 0 }, { date: '2026-10-01', n: 1 }]);
  assert.deepEqual(oct[oct.length - 1], { date: '2026-10-31', n: 31 });
  assert.equal(oct.findIndex((c) => c.date === '2026-10-18') % 7, 0, '10월 18일은 일요일 — 첫 칸');
  assert.equal(pick(ctx.dutyCalMonth('2026-11'))[0].date, '2026-11-01', '11월 1일은 일요일 — 빈칸 없음');
  assert.equal(pick(ctx.dutyCalMonth('2028-02')).filter((c) => c.date).length, 29); assert.equal(pick(ctx.dutyCalMonth('2027-02')).filter((c) => c.date).length, 28);
  assert.deepEqual(pick(ctx.dutyCalMonth('2026-13')), []); assert.deepEqual(pick(ctx.dutyCalMonth('x')), []); assert.deepEqual(pick(ctx.dutyCalMonth(null)), []);
  assert.equal(ctx.dutyCalTitle('2026-10'), '2026년 10월'); assert.equal(ctx.dutyCalTitle('2027-01'), '2027년 1월'); assert.equal(ctx.dutyCalTitle(''), '');
  assert.equal(ctx.dutyCalMonthWord('2027-01'), '1월'); assert.equal(ctx.dutyCalMonthWord('x'), '');
  assert.deepEqual(pick(ctx.dutyCalMonths([{ date: '2026-11-01' }, { date: '2026-10-18' }, { date: '2026-10-25' }, { date: '2027-01-03' }, { date: 'x' }, null])), ['2026-10', '2026-11', '2027-01']);
});

test('달력 — 그날 한 칸: 채워진 인원/필요 인원 · 손이 필요한 날 · 내 당번 · 쉬는 날', () => {
  const S = (x) => ({ id: 1, service: '2부', task: '설거지', start: '11:30', end: '12:30', capacity: 2, off: false, n: 0, names: [], mine: null, why: '', ...x });
  const M = (x) => ({ id: 5, status: 'active', byStaff: false, staffAdded: false, asked: false, why: null, ...x });
  const cell = (day, me) => pick(ctx.dutyCalCell({ date: '2026-10-18', off: false, locked: false, slots: [], ...day }, me || { why: '' }));
  // 빈 자리가 있다 — 손이 필요한 날 · 숫자는 자리를 모두 더한다
  assert.deepEqual(cell({ slots: [S({ n: 1 }), S({ capacity: 1, n: 0 })] }), { kind: 'need', n: 1, cap: 3, need: 2, mine: false, locked: false });
  // 다 찼다 · 시작했다 · 담당자가 넣는 자리 — 지원할 자리가 없다(숫자는 그대로 보인다)
  assert.deepEqual(cell({ slots: [S({ n: 2, why: 'full' })] }), { kind: 'none', n: 2, cap: 2, need: 0, mine: false, locked: false });
  assert.equal(cell({ slots: [S({ n: 1, why: 'started' })] }).kind, 'none');
  assert.deepEqual(cell({ slots: [S({ n: 1, why: 'closed' })] }), { kind: 'none', n: 1, cap: 2, need: 0, mine: false, locked: false });
  // 내가 서는 날 — 다른 자리가 비어 있어도 「내 당번」이 먼저
  assert.deepEqual(cell({ slots: [S({ n: 1, why: 'mine', mine: M() }), S({ n: 0 })] }), { kind: 'mine', n: 1, cap: 4, need: 2, mine: true, locked: false });
  // 담당자가 뺀 줄·쉬는 자리의 내 줄은 내가 서는 날이 아니다
  assert.equal(cell({ slots: [S({ n: 2, why: 'removed', mine: M({ status: 'removed', byStaff: true }) })] }).kind, 'none');
  assert.equal(cell({ slots: [S({ n: 1, off: true, why: 'mine', mine: M() }), S({ n: 0 })] }).kind, 'need');
  // 쉬는 자리는 세지 않는다 · 그날이 쉬거나 자리가 모두 쉬면 쉬는 날
  assert.deepEqual(cell({ slots: [S({ n: 1 }), S({ off: true, why: 'off', n: 1 })] }), { kind: 'need', n: 1, cap: 2, need: 1, mine: false, locked: false });
  assert.deepEqual(cell({ off: true, slots: [S({ n: 1, why: 'mine', mine: M() })] }), { kind: 'off', n: 0, cap: 0, need: 0, mine: false, locked: false });
  assert.equal(cell({ slots: [S({ off: true, why: 'off' })] }).kind, 'off');
  // 담당자가 정원을 넘겨 넣은 자리는 정원까지만 — 「3/3」인데 손이 필요한 날이 되지 않는다
  assert.deepEqual(cell({ slots: [S({ n: 3, why: 'full' }), S({ capacity: 1, n: 0 })] }), { kind: 'need', n: 2, cap: 3, need: 1, mine: false, locked: false });
  // 앱에서 지원하지 못하는 계정에게도 손이 필요한 날은 손이 필요한 날이다(단추만 없다)
  assert.equal(cell({ slots: [S({ n: 1 })] }, { why: 'guardian' }).kind, 'need');
  assert.equal(cell({ locked: true, slots: [S({ n: 1 })] }).locked, true);
  assert.equal(ctx.dutyCalCell(null, null).kind, 'off');
  // 칸에 적는 글 · 읽어 주는 말
  assert.equal(ctx.dutyCalMark({ kind: 'need', n: 1, cap: 3 }), '1/3'); assert.equal(ctx.dutyCalMark({ kind: 'none', n: 2, cap: 2 }), '2/2');
  assert.equal(ctx.dutyCalMark({ kind: 'mine', n: 0, cap: 12 }), '0/12'); assert.equal(ctx.dutyCalMark({ kind: 'off' }), '쉼');
  const D = { date: '2026-10-18' };
  assert.equal(ctx.dutyCalLabel(D, { kind: 'need', n: 1, cap: 3, need: 2 }), '10월 18일(일) — 손이 필요한 날이에요 · 필요 3명 가운데 1명 채워졌어요');
  assert.equal(ctx.dutyCalLabel(D, { kind: 'mine', n: 2, cap: 2, need: 0, locked: true }), '10월 18일(일) — 내 당번이 있어요 · 필요 2명 가운데 2명 채워졌어요 · 확정된 날');
  assert.equal(ctx.dutyCalLabel(D, { kind: 'none', n: 2, cap: 2 }), '10월 18일(일) — 지금 지원할 수 있는 자리가 없어요 · 필요 2명 가운데 2명 채워졌어요');
  assert.equal(ctx.dutyCalLabel(D, { kind: 'off', locked: true }), '10월 18일(일) — 쉬어요');
});

test('달력 — 처음 고를 날 · 앞뒤 달(날짜가 있는 달로만 · 해를 넘는다)', () => {
  const S = (x) => ({ capacity: 2, off: false, n: 0, mine: null, why: '', ...x });
  const full = (date) => ({ date, off: false, slots: [S({ n: 2, why: 'full' })] }), open = (date) => ({ date, off: false, slots: [S({ n: 1 })] });
  const mine = (date) => ({ date, off: false, slots: [S({ n: 1, why: 'mine', mine: { id: 1, status: 'active' } })] });
  const days = [full('2026-10-11'), full('2026-10-18'), open('2026-10-25'), { date: '2026-11-01', off: true, slots: [S()] }, mine('2026-11-08'), full('2026-12-06'), open('2027-01-03')];
  const me = { why: '' };
  assert.equal(ctx.dutyCalPick(days, '', me), '2026-10-25', '손이 필요하거나 내가 서는 가장 이른 날');
  assert.equal(ctx.dutyCalPick(days, '2026-10-18', me), '2026-10-18', '바라는 날이 있으면 그날');
  assert.equal(ctx.dutyCalPick(days, '2026-09-01', me), '2026-10-25', '바라는 날이 당번표에 없으면 처음 규칙으로');
  assert.equal(ctx.dutyCalPick([full('2026-10-11'), full('2026-10-18')], '', me), '2026-10-11', '모두 찼으면 첫 날');
  assert.equal(ctx.dutyCalPick([], '', me), ''); assert.equal(ctx.dutyCalPick(null, 'x', me), '');
  // 앞뒤 달 — 그 달에서 고를 날(내가 서거나 손이 필요한 가장 이른 날 → 없으면 그 달 첫 날)
  assert.equal(ctx.dutyCalStep(days, '2026-10-25', 'next', me), '2026-11-08', '11월 — 쉬는 1일이 아니라 내가 서는 8일');
  assert.equal(ctx.dutyCalStep(days, '2026-11-08', 'next', me), '2026-12-06', '12월 — 다 찬 날 하나뿐이면 그날');
  assert.equal(ctx.dutyCalStep(days, '2026-12-06', 'next', me), '2027-01-03', '해를 넘어간다');
  assert.equal(ctx.dutyCalStep(days, '2027-01-03', 'next', me), '', '더 없으면 빈 글');
  assert.equal(ctx.dutyCalStep(days, '2026-10-25', 'prev', me), ''); assert.equal(ctx.dutyCalStep(days, '2026-11-08', 'prev', me), '2026-10-25');
  assert.equal(ctx.dutyCalStep(days, '2026-09-30', 'next', me), '', '고른 날의 달이 당번표에 없으면 움직이지 않는다');
  assert.equal(ctx.dutyCalStep([open('2026-10-25'), open('2026-12-06')], '2026-10-25', 'next', me), '2026-12-06', '날짜가 없는 달(11월)은 건너뛴다');
});

test('달력 — 그리기: 날짜가 있는 날만 단추 · 칸에 채워진 인원/필요 인원 · 고른 날 · 오늘 · 앞뒤 달 단추 · 풀이는 있는 표시만', () => {
  const S = (x) => ({ capacity: 2, off: false, n: 0, mine: null, why: '', ...x });
  const days = [{ date: '2026-10-18', off: false, slots: [S({ n: 1 })] }, { date: '2026-10-25', off: false, slots: [S({ n: 2, why: 'full' })] },
    { date: '2026-11-01', off: true, slots: [S()] }, { date: '2026-11-08', off: false, locked: true, slots: [S({ n: 1, why: 'mine', mine: { id: 1, status: 'active' } })] }];
  const oct = ctx.dutyCalHtml(days, '2026-10-18', '2026-10-06', { why: '' });
  assert.equal((oct.match(/<button type="button" class="duty-cal-c has/g) || []).length, 2, '10월에 날짜 둘');
  assert.ok(oct.includes('class="duty-cal-c has k-need on" data-date="2026-10-18" aria-pressed="true"'));
  assert.ok(oct.includes('aria-label="10월 18일(일) — 손이 필요한 날이에요 · 필요 2명 가운데 1명 채워졌어요"'));
  assert.ok(oct.includes('<span>18</span><i aria-hidden="true">1/2</i>') && oct.includes('<span>25</span><i aria-hidden="true">2/2</i>'));
  assert.ok(oct.includes('class="duty-cal-c has k-none" data-date="2026-10-25" aria-pressed="false"'));
  assert.ok(oct.includes('<span class="duty-cal-c today"><span>6</span></span>'), '오늘(당번 없는 날)도 표시');
  assert.ok(oct.includes('<b>2026년 10월</b>') && oct.includes('data-cal="next" aria-label="2026년 11월 보기">11월 ▶</button>') && !oct.includes('data-cal="prev"'));
  assert.ok(oct.includes('숫자는 채워진 인원 / 필요 인원이에요') && oct.includes('</span>손이 필요한 날') && oct.includes('</span>내 당번') && oct.includes('날짜를 누르면 그날의 자리가 아래에 보여요.'));
  const nov = ctx.dutyCalHtml(days, '2026-11-08', '2026-11-08', { why: '' });
  assert.ok(nov.includes('class="duty-cal-c has k-off" data-date="2026-11-01"') && nov.includes('<i aria-hidden="true">쉼</i>'));
  assert.ok(nov.includes('class="duty-cal-c has k-mine on today" data-date="2026-11-08"'));
  assert.ok(nov.includes('aria-label="11월 8일(일) — 내 당번이 있어요 · 필요 2명 가운데 1명 채워졌어요 · 확정된 날 · 오늘"'));
  assert.ok(nov.includes('data-cal="prev" aria-label="2026년 10월 보기">◀ 10월</button>') && !nov.includes('data-cal="next"'));
  // 풀이는 이 당번표에 실제로 있는 표시만 — 손이 필요한 날도 내 당번도 없으면 그 말이 없고, 달이 하나면 앞뒤 달 단추가 없다
  const quiet = ctx.dutyCalHtml([{ date: '2026-10-18', off: false, slots: [S({ n: 2, why: 'full' })] }], '2026-10-18', '', { why: '' });
  assert.ok(quiet.includes('숫자는 채워진 인원 / 필요 인원이에요') && !quiet.includes('손이 필요한 날') && !quiet.includes('내 당번') && !quiet.includes('data-cal='));
  const rest = ctx.dutyCalHtml([{ date: '2026-10-18', off: true, slots: [S()] }], '2026-10-18', '', { why: '' });
  assert.equal(rest.includes('숫자는'), false, '쉬는 날뿐이면 숫자 풀이도 없다'); assert.ok(rest.includes('날짜를 누르면'));
});

test('api dutyNameOk — 당번표에 실을 이름', () => {
  for (const ok of ['가상하나', '가상 하나', 'Kim Mina', '가', '가'.repeat(20), '김123', '김요한2']) assert.equal(srv.dutyNameOk(ok), true, ok);
  for (const bad of ['', '   ', null, undefined, '가'.repeat(21), '<b>가상</b>', '가상"하나', "가상'하나", '가상`하나', '가상' + String.fromCharCode(92) + '하나',
    '가상\n하나', '가상' + String.fromCharCode(0x200b) + '하나', '가상' + String.fromCharCode(0x202e) + '하나', '가상' + String.fromCharCode(0x061c) + '하나',
    '가상' + String.fromCharCode(0x2028) + '하나', '01012345678', '가상1234', '가상 0000']) assert.equal(srv.dutyNameOk(bad), false, JSON.stringify(bad));
  // 보이지 않는 글자뿐인 이름·이름 사이에 숨긴 글자 — 당번표에 빈 이름이 한 자리를 차지하지 않게
  for (const c of [0x00ad, 0x115f, 0x1160, 0x3164, 0xffa0, 0x2800, 0x2060, 0x2064]) {
    assert.equal(srv.dutyNameOk(String.fromCharCode(c)), false, 'U+' + c.toString(16));
    assert.equal(srv.dutyNameOk('가상' + String.fromCharCode(c) + '하나'), false, 'U+' + c.toString(16) + ' 사이');
  }
  assert.equal(srv.dutyNameOk('가상' + String.fromCharCode(0xfeff) + '하나'), false);
  // 막는 목록을 늘리는 대신 「보이는 글자·숫자가 하나는 있어야」 — 목록에 없는 보이지 않는 글자(변형 선택자·몽골 모음 분리자 등)만으로 된 이름도 거절
  for (const c of [0x034f, 0x180e, 0x206a, 0xfe0f, 0xfff9, 0x17b4]) assert.equal(srv.dutyNameOk(String.fromCharCode(c)), false, 'U+' + c.toString(16));
  for (const ok of ['ㄱ', 'José', '山田', 'たろう', 'A', '7']) assert.equal(srv.dutyNameOk(ok), true, ok);
  assert.equal(srv.dutyNameOk('..'), false, '글자·숫자가 하나도 없는 이름');
});

test('api dutyErrOut — 보관한 당번은 없는 당번 · SQL 이 성도님 길에서 주는 거절은 모두 화면에 제 말이 있다', () => {
  assert.equal(srv.dutyErrOut('archived'), 'not-found');
  assert.equal(srv.dutyErrOut('bad-ident'), 'server'); assert.equal(srv.dutyErrOut(null), 'server'); assert.equal(srv.dutyErrOut(''), 'server');
  for (const c of ['not-found', 'archived', 'closed', 'off', 'past', 'started', 'not-yet', 'after-until', 'removed-by-staff', 'locked-day', 'full', 'not-active', 'changed',
    'locked', 'staff-row', 'not-locked']) {
    assert.notEqual(ctx.dutyErrText(srv.dutyErrOut(c)), '잠시 뒤 다시 해 주세요.', c);
  }
});

test('api dutyOverlapOut — 준비 중인 당번과 겹치면 이름을 싣지 않는다', () => {
  assert.deepEqual(pick(srv.dutyOverlapOut({ board: '주차 봉사', service: '2부', task: '안내', start: '11:00', draft: false, same_board: false, extra: 'x' })),
    { board: '주차 봉사', service: '2부', task: '안내', start: '11:00' });
  assert.equal(srv.dutyOverlapOut({ board: '비밀 당번', service: '1부', task: '', start: '09:00', draft: true }), null);
  assert.equal(srv.dutyOverlapOut(null), null); assert.equal(srv.dutyOverlapOut('x'), null);
  assert.deepEqual(pick(srv.dutyOverlapOut({})), { board: '', service: '', task: '', start: '' });
});

// ── api 몸통을 글자로 본다(개발 DB 없이 preflight 에서) — 문·신원·거절 차례가 조용히 빠지지 않게 ──
const API = read(['supabase', 'functions', 'api', 'index.ts']);
const fn = (name) => {
  const a = API.indexOf('async function ' + name + '(');
  assert.ok(a >= 0, name + ' 를 못 찾았다');
  const e = API.indexOf('\n}\n', a);
  assert.ok(e > a, name + ' 의 끝을 못 찾았다');
  const b = API.indexOf('\nasync function ', a + 10), c = API.indexOf('\n// ', e);
  // 주석만 있는 줄은 뺀다 — 주석 처리한 줄이 「있는 줄」로 세어지지 않게
  return API.slice(a, Math.min(b < 0 ? API.length : b, c < 0 ? API.length : c)).replace(/^\s*\/\/.*$/gm, '');
};

test('api 글자 검사 — 여섯 액션 모두 문(dutyGate)이 SQL 보다 먼저 · 닫히면 읽기는 {ok, open:false} · 쓰기는 not-open', () => {
  for (const [name, rpc] of [['dutyList', 'duty_list_view'], ['dutyBoard', 'duty_board_view'], ['dutyMine', 'duty_mine'], ['dutyApply', 'duty_apply'], ['dutyCancel', 'duty_cancel'], ['dutyAsk', 'duty_ask']]) {
    const body = fn(name);
    const g = body.indexOf('await dutyGate(userId)'), r = body.indexOf('db.rpc("' + rpc + '"');
    assert.ok(g > 0 && r > g, name + ' — 문이 SQL 호출보다 앞에 있어야 한다');
    assert.equal((body.match(/db\.rpc\(/g) || []).length, 1, name + ' — SQL 호출은 하나');
    assert.equal(/db\.from\(/.test(body), false, name + ' — 표를 직접 읽거나 쓰지 않는다(규칙은 SQL 함수 한 곳)');
  }
  // 닫힘 답은 문과 SQL 사이에 있어야 한다(있기만 한 것이 아니라 차례로)
  const between = (name, line, rpc) => { const s = fn(name), g = s.indexOf('await dutyGate(userId)'), x = s.indexOf(line), r = s.indexOf('db.rpc("' + rpc + '"'); return g > 0 && x > g && r > x; };
  for (const [name, rpc] of [['dutyList', 'duty_list_view'], ['dutyBoard', 'duty_board_view'], ['dutyMine', 'duty_mine']]) assert.ok(between(name, 'if (!g.open) return { ok: true, open: false };', rpc), name);
  for (const [name, rpc] of [['dutyApply', 'duty_apply'], ['dutyCancel', 'duty_cancel'], ['dutyAsk', 'duty_ask']]) assert.ok(between(name, 'if (!g.open) return { ok: false, error: "not-open" };', rpc), name);
  // 갈래(switch)에 여섯 줄이 살아 있다
  for (const name of ['dutyList', 'dutyBoard', 'dutyMine', 'dutyApply', 'dutyCancel', 'dutyAsk']) assert.ok(new RegExp('\\n\\s*case "' + name + '":\\s+return json\\(await ' + name + '\\(body\\)\\);').test(API), name + ' 갈래');
});

test('api 글자 검사 — 지원: 어린이·청소년 부서·실을 수 없는 이름은 SQL 을 부르기 전에 막는다 · 담당자 길로 새는 인자가 없다', () => {
  const body = fn('dutyApply');
  const why = body.indexOf('dutyMeWhy(u)'), stop = body.indexOf('if (why) return { ok: false, error: why };'), rpc = body.indexOf('db.rpc("duty_apply"');
  assert.ok(why > 0 && stop > why && rpc > stop, 'dutyMeWhy → 거절 → duty_apply 차례');
  assert.ok(body.includes('p_staff: false, p_force: false, p_ack_locked: b.ack_locked === true'), 'p_staff·p_force 는 늘 false · ack 는 === true 만');
  assert.equal(/p_ident:\s*b\./.test(body) || /b\.name|b\.ident|b\.who_type/.test(body), false, '신원은 화면이 보낸 값을 쓰지 않는다');
  const me = API.slice(API.indexOf('const dutyMeWhy ='), API.indexOf('\n', API.indexOf('const dutyMeWhy =')));
  assert.ok(me.includes('needsGuardian(u) ? "guardian"') && me.includes('!dutyNameOk(u?.name) ? "bad-name"'), 'dutyMeWhy 는 두 규칙을 본다');
  // 문은 users 줄이 실제로 있는지를 본다(꼴만 맞는 UUID 는 닫힘) · 판정에 쓰는 칸(type·bu·grade·name)을 읽는다
  const gate = fn('dutyGate');
  assert.ok(gate.includes('.select("id,identity_key,type,gu,mok,bu,grade,name").eq("id", userId).maybeSingle()'));
  const nou = gate.indexOf('if (!u) return { user: null, open: false };');
  assert.ok(nou > 0 && nou < gate.indexOf('"dutyOpen"'), '계정이 없으면 dutyOpen 을 보기 전에 닫힘(그 줄이 없어도 통과하지 않게 위치를 본다)');
  assert.ok(gate.includes('if (ce) throw ce;'), '설정을 못 읽은 것을 닫힘으로 뭉개지 않는다');
});
