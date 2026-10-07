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
    assert.ok(ctx.dutyErrText(c).length > 5 && ctx.dutyErrText(c) !== ctx.DUTY_UNSURE && ctx.dutyErrKnown(c) === true, c);
  }
  // 표에 없는 코드 = 됐는지 알 수 없는 답(통신 끊김 · 서버 오류 — 서버에는 이미 쓰였을 수 있다): 「다시 해 주세요」라고 하지 않고 확인하시게 한다
  assert.equal(ctx.dutyErrText('zzz'), ctx.DUTY_UNSURE); assert.equal(ctx.dutyErrText('toString'), ctx.DUTY_UNSURE);
  assert.ok(ctx.DUTY_UNSURE.includes('됐는지 확인하지 못했어요') && !/다시 해 주세요/.test(ctx.DUTY_UNSURE) && ctx.DUTY_UNSURE_FAIL.includes('다시 열어 확인해 주세요'));
  for (const c of ['Failed to fetch', 'Load failed', 'HTTP 502', 'server', 'zzz', undefined, null]) assert.equal(ctx.dutyErrKnown(c), false, String(c));
  for (const c of ['overlap', 'too-many']) assert.equal(ctx.dutyErrKnown(c), true, c);
  // 자리만 쉬어도 같은 코드로 온다 · 사라진 계정은 로그인돼 있는 분이다 · 보호자 확인 부서는 어린이 부서만이 아니다(사랑부 · 중등부 1·2학년 — 중3·고등부는 지원한다)
  assert.equal(ctx.dutyErrText('off'), '쉬는 날이거나 쉬는 자리예요.');
  assert.equal(ctx.dutyErrText('no-user'), ctx.dutyErrText('not-open')); assert.equal(ctx.dutyErrText('no-user').includes('로그인'), false);
  assert.equal(/어린이|청소년/.test(ctx.dutyErrText('guardian')), false); assert.ok(ctx.dutyErrText('guardian').includes('앱에서 바로 지원할 수 없어요'));
  assert.equal(ctx.dutyErrText('overlap', { with: { board: '주차 봉사', service: '2부', task: '안내', start: '11:00' } }), '같은 날 겹치는 시간에 이미 주차 봉사 2부 안내(11:00) 당번이 있어요.');
  // 아직 공개 전인(준비 중) 당번과 겹치면 이름 없이 — 그 당번은 「내 당번」에도 없으므로 그렇다고 말한다(까닭을 찾을 화면이 없다)
  //   「아직 열리지 않은」이라고 하지 않는다 — 받는 중이던 당번을 준비로 되돌린 것일 수 있다
  const hidden = '같은 날 겹치는 시간에 이미 다른 당번이 있어요. 「내 당번」에 보이지 않으면 지금 앱에 열려 있지 않은 당번이에요 — 담당자께 말씀해 주세요.';
  assert.equal(ctx.dutyErrText('overlap', { with: null }), hidden); assert.equal(ctx.dutyErrText('overlap'), hidden);
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
  // 「담당자가 넣는 자리」 — 받는 중 당번이면 남은 자리다(뺀 틀·요일을 바꾼 틀 — 새 지원을 받지 않는다): 서 있는 분은 세되 빈 칸은 필요 인원이 아니다
  //   (서버의 「손이 필요한 수」도 남은 자리를 뺀다). 담당자가 넣는 당번(me.staffOnly)이면 그 정원이 곧 필요 인원이다.
  assert.deepEqual(cell({ slots: [S({ n: 1, why: 'closed' })] }), { kind: 'none', n: 1, cap: 1, need: 0, mine: false, locked: false });
  assert.deepEqual(cell({ slots: [S({ n: 1, why: 'closed' })] }, { why: '', staffOnly: true }), { kind: 'none', n: 1, cap: 2, need: 0, mine: false, locked: false });
  assert.deepEqual(cell({ slots: [S({ n: 2, why: 'full' }), S({ n: 0, why: 'closed' })] }), { kind: 'none', n: 2, cap: 2, need: 0, mine: false, locked: false }, '다 찬 날에 남은 빈 자리가 있어도 「2/2」(「2/4」가 아니다)');
  assert.deepEqual(cell({ slots: [S({ n: 0, why: 'closed' })] }), { kind: 'none', n: 0, cap: 0, need: 0, mine: false, locked: false }, '아무도 없는 남은 자리뿐인 날 — 쉬는 날은 아니다');
  assert.equal(ctx.dutyCalMark({ kind: 'none', n: 0, cap: 0 }), '', '셀 것이 없으면 숫자를 적지 않는다(「0/0」이 아니다)');
  assert.equal(ctx.dutyCalLabel({ date: '2026-10-18' }, { kind: 'none', n: 0, cap: 0 }), '10월 18일(일) — 지금 지원할 수 있는 자리가 없어요');
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
  assert.ok(oct.includes('class="duty-cal-c has k-need on sun" data-date="2026-10-18" aria-pressed="true"'));
  assert.ok(oct.includes('aria-label="10월 18일(일) — 손이 필요한 날이에요 · 필요 2명 가운데 1명 채워졌어요"'));
  assert.ok(oct.includes('<span>18</span><i aria-hidden="true">1/<wbr>2</i>') && oct.includes('<span>25</span><i aria-hidden="true">2/<wbr>2</i>'), '인원 글은 「/」 뒤에서 줄을 바꿀 수 있다(<wbr> — 칸에 한 줄로 못 들 때만 두 줄)');
  assert.ok(oct.includes('class="duty-cal-c has k-none sun" data-date="2026-10-25" aria-pressed="false"'));
  assert.ok(oct.includes('<span class="duty-cal-c today"><span>6</span></span>'), '오늘(당번 없는 날)도 표시');
  assert.ok(oct.includes('<b>2026년 10월</b>') && oct.includes('data-cal="next" aria-label="2026년 11월 보기"><span class="m">11월</span> ▶</button>') && !oct.includes('data-cal="prev"'));
  assert.ok(oct.includes('숫자는 채워진 인원 / 필요 인원이에요') && oct.includes('</span>손이 필요한 날') && oct.includes('</span>내 당번') && oct.includes('날짜를 누르면 그날의 자리가 아래에 보여요.'));
  const nov = ctx.dutyCalHtml(days, '2026-11-08', '2026-11-08', { why: '' });
  assert.ok(nov.includes('class="duty-cal-c has k-off sun" data-date="2026-11-01"') && nov.includes('<i aria-hidden="true">쉼</i>'));
  assert.ok(nov.includes('class="duty-cal-c has k-mine on today sun" data-date="2026-11-08"'));
  assert.ok(nov.includes('aria-label="11월 8일(일) — 내 당번이 있어요 · 필요 2명 가운데 1명 채워졌어요 · 확정된 날 · 오늘"'));
  assert.ok(nov.includes('data-cal="prev" aria-label="2026년 10월 보기">◀ <span class="m">10월</span></button>') && !nov.includes('data-cal="next"'));
  // 풀이는 이 당번표에 실제로 있는 표시만 — 손이 필요한 날도 내 당번도 없으면 그 말이 없고, 달이 하나면 앞뒤 달 단추가 없다
  const quiet = ctx.dutyCalHtml([{ date: '2026-10-18', off: false, slots: [S({ n: 2, why: 'full' })] }], '2026-10-18', '', { why: '' });
  assert.ok(quiet.includes('숫자는 채워진 인원 / 필요 인원이에요') && !quiet.includes('손이 필요한 날') && !quiet.includes('내 당번') && !quiet.includes('data-cal='));
  const rest = ctx.dutyCalHtml([{ date: '2026-10-18', off: true, slots: [S()] }], '2026-10-18', '', { why: '' });
  assert.equal(rest.includes('숫자는'), false, '쉬는 날뿐이면 숫자 풀이도 없다'); assert.ok(rest.includes('날짜를 누르면'));
});

test('공휴일 표 — 꼴 · 해마다 있어야 하는 날 · 대체공휴일을 규칙으로 다시 셈한 것과 같다(친구 요청 2026-10-07 — 달력의 빨간 날짜)', () => {
  const H = pick(ctx.DUTY_HOLIDAYS), keys = Object.keys(H), from = ctx.DUTY_HOL_FROM, until = ctx.DUTY_HOL_UNTIL;
  const utc = (s) => new Date(s + 'T00:00:00Z'), dow = (s) => utc(s).getUTCDay(), next = (s) => new Date(utc(s).getTime() + 86400000).toISOString().slice(0, 10);
  // 꼴: 실제 날짜 · 날짜 차례 · 표의 범위(DUTY_HOL_FROM ~ DUTY_HOL_UNTIL) 안 · 이름은 정해 둔 낱말만(선거일·임시공휴일이 생기면 그 이름으로 — 「…선거」·「임시공휴일」)
  //   노동절·제헌절은 2026년 5월부터 공휴일이다(공휴일에 관한 법률 제2조 개정 — 옛 지식으로 만든 표에는 빠진다).
  const NAMES = ['신정', '설날', '삼일절', '노동절', '어린이날', '부처님오신날', '현충일', '제헌절', '광복절', '추석', '개천절', '한글날', '성탄절', '대체공휴일', '임시공휴일'];
  assert.ok(keys.length >= 4 && /^\d{4}-\d{2}-\d{2}$/.test(until) && utc(until).toISOString().slice(0, 10) === until, 'DUTY_HOL_UNTIL');
  assert.ok(/^\d{4}-\d{2}-01$/.test(from) && utc(from).toISOString().slice(0, 10) === from && from < until, 'DUTY_HOL_FROM — 달의 1일(달을 반만 덮으면 그 달의 풀이가 틀린 말을 한다)');
  keys.forEach((k, i) => {
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(k) && !isNaN(utc(k).getTime()) && utc(k).toISOString().slice(0, 10) === k, k + ' — 실제 날짜가 아니다');
    assert.ok(k >= from, k + ' — 표가 시작하기(DUTY_HOL_FROM) 전의 날짜');
    assert.ok(k <= until, k + ' — 표 끝(DUTY_HOL_UNTIL) 뒤의 날짜');
    if (i) assert.ok(keys[i - 1] < k, k + ' — 날짜 차례가 아니다');
    assert.ok(NAMES.includes(H[k]) || /선거$/.test(H[k]), k + ' — 모르는 이름: ' + H[k]);
  });
  // 표가 통째로 덮는 해마다: 양력 공휴일 열(그날이 추석 연휴와 겹치면 추석으로 적혀 있다 — 2028-10-03) · 설날·추석은 이어진 사흘 · 부처님오신날은 꼭 하루.
  //   「통째로 덮는 해」는 **표의 범위**(DUTY_HOL_FROM ~ DUTY_HOL_UNTIL)로 정한다 — 그 해의 줄이 있나로 고르면, 새 해를 더하다 1월 1일을 빠뜨리거나 DUTY_HOL_UNTIL 만 올린 표가
  //   그 해의 검사를 통째로 건너뛴다(지문은 표가 바뀌면 늘 떨어지며 새 값을 보여 주므로, 새 줄을 지키는 것은 이 규칙 검사뿐이다 — 독립 검토 반영 2026-10-07).
  //   ⚠️ 이 검사가 못 보는 것: **음력 날짜 자체**(설날·부처님오신날·추석이 며칠인가)와 **선거일**(있는 해인가 · 며칠인가) — 근거 자료에서 옮기고 눈으로 맞댄다.
  const FIXED = { '01-01': '신정', '03-01': '삼일절', '05-01': '노동절', '05-05': '어린이날', '06-06': '현충일', '07-17': '제헌절', '08-15': '광복절', '10-03': '개천절', '10-09': '한글날', '12-25': '성탄절' };
  const lunar = (name) => name === '설날' || name === '추석';
  const first = Number(from.slice(0, 4)), last = Number(until.slice(0, 4)), full = [];
  for (let y = first; y <= last; y++) if (y > first || from.slice(5) === '01-01') full.push(y);
  assert.ok(full.length >= 1, '통째로 덮는 해가 하나는 있어야 한다(없으면 이 검사가 아무것도 보지 않는다)');
  assert.ok(until.slice(5) === '12-31', '표 끝은 그 해의 마지막 날이어야 한다(해를 반만 덮으면 「없는 날」과 「아직 안 적은 날」을 가를 수 없다)');
  for (const y of full) {
    for (const md of Object.keys(FIXED)) assert.ok(H[y + '-' + md] === FIXED[md] || lunar(H[y + '-' + md]), y + '-' + md + ' ' + FIXED[md] + ' — 표에는 ' + H[y + '-' + md]);
    for (const name of ['설날', '추석']) {
      const ds = keys.filter((k) => k.startsWith(y + '-') && H[k] === name);
      assert.equal(ds.length, 3, y + '년 ' + name + ' — 사흘이어야 한다'); assert.ok(next(ds[0]) === ds[1] && next(ds[1]) === ds[2], y + '년 ' + name + ' — 이어진 사흘이어야 한다');
    }
    // 부처님오신날이 양력 공휴일(어린이날 등)과 겹치는 해가 오면 그 해의 줄 이름에 맞춰 여기에 예외를 적는다(이 표의 해에는 없다)
    assert.equal(keys.filter((k) => k.startsWith(y + '-') && H[k] === '부처님오신날').length, 1, y + '년 부처님오신날 — 하루여야 한다(빠졌거나 두 번 적혔다)');
  }
  // 대체공휴일 — 「관공서의 공휴일에 관한 규정」 제3조(대통령령 제36290호 · 2026-04-30)를 여기서 다시 셈해 표와 맞댄다(표를 손으로 적다 하루를 빠뜨리거나 더 넣는 것을 잡는다):
  //   ① 국경일(삼일절·제헌절·광복절·개천절·한글날)·부처님오신날·노동절·어린이날·성탄절이 토요일·일요일과 겹치면 ② 설날·추석 연휴의 하루가 일요일과 겹치면
  //   ③ 연휴의 하루가 다른 공휴일과 겹치면 → 그 공휴일(연휴) 다음의 첫 비공휴일(토·일·공휴일·이미 잡힌 대체공휴일이 아닌 날). 신정·현충일·선거일은 대체공휴일이 없다.
  const base = keys.filter((k) => H[k] !== '대체공휴일'), want = new Set();
  const free = (d) => { let x = next(d); while (dow(x) === 0 || dow(x) === 6 || base.includes(x) || want.has(x)) x = next(x); return x; };
  const WEEKEND = ['삼일절', '제헌절', '광복절', '개천절', '한글날', '부처님오신날', '노동절', '어린이날', '성탄절'];
  const blockEnd = (k) => { let e = k; while (H[next(e)] === H[k]) e = next(e); return e; };
  for (const k of base) {
    if (lunar(H[k])) { if (dow(k) === 0 || WEEKEND.includes(FIXED[k.slice(5)])) want.add(free(blockEnd(k))); }
    else if (WEEKEND.includes(H[k]) && (dow(k) === 0 || dow(k) === 6)) want.add(free(k));
  }
  assert.deepEqual(keys.filter((k) => H[k] === '대체공휴일'), [...want].filter((d) => d <= until).sort(), '대체공휴일이 규칙으로 셈한 것과 다르다(빠졌거나 더 들었다)');
  // ⚠️ 표는 두 저장소에 있다 — 교회 어드민 tests/duty-cal.test.mjs 의 지문과 **같은 값**이어야 한다. 표를 고치면 두 표와 두 지문을 함께 고친다.
  //   지문은 범위(DUTY_HOL_FROM~DUTY_HOL_UNTIL)도 싣는다 — 달력의 풀이가 그 범위를 말하므로(「…다른 공휴일은 2028년 12월까지만 표시돼요」) 범위만 달라도 두 달력이 다른 말을 한다.
  const print = require('crypto').createHash('sha256').update([from + '~' + until].concat(keys.map((k) => k + '=' + H[k])).join('\n')).digest('hex').slice(0, 12);
  assert.equal(print, '9c07bd766842', '공휴일 표(또는 그 범위)가 바뀌었다 — 교회 어드민 js/menus/duty/holidays.js 의 HOLIDAYS·HOL_FROM·HOL_UNTIL 도 같게 고치고, 두 저장소 시험의 지문을 같은 값으로 바꾼다');
  // 표가 덮지 않는 달 — 평일이 빨갛지 않은 것이 「공휴일이 없다」는 뜻이 아니다(달력의 풀이가 그렇게 말한다 · 일요일은 표와 상관없이 어느 달이나 빨갛다). 「앞으로 1년」 당번은 표 끝의 한 해 전부터 그 뒤의 달을 보여 준다
  assert.equal(ctx.dutyHolOutside(from.slice(0, 7)), ''); assert.equal(ctx.dutyHolOutside(until.slice(0, 7)), ''); assert.equal(ctx.dutyHolOutside('2027-06'), '');
  assert.equal(ctx.dutyHolOutside(next(until).slice(0, 7)), 'after'); assert.equal(ctx.dutyHolOutside('2026-09'), 'before'); assert.equal(ctx.dutyHolOutside('2031-03'), 'after');
  for (const bad of ['', null, undefined, 'x', '2029', '2029-1', '2029-01-01', 202901]) assert.equal(ctx.dutyHolOutside(bad), '', String(bad));
  assert.equal(ctx.dutyHolOutsideText('after'), '이 달은 일요일만 빨갛게 보여요(다른 공휴일은 2028년 12월까지만 표시돼요).');
  assert.equal(ctx.dutyHolOutsideText('before'), '이 달은 일요일만 빨갛게 보여요(다른 공휴일은 2026년 10월부터 표시돼요).');
  assert.equal(ctx.dutyHolOutsideText(''), ''); assert.equal(ctx.dutyHolOutsideText(undefined), '');
  // 이름 찾기 — 표에 있는 날짜만 · 날짜로 시작하는 글 · 틀린 값·객체의 물려받은 이름은 빈 글
  assert.equal(ctx.dutyHoliday('2026-10-09'), '한글날'); assert.equal(ctx.dutyHoliday('2026-10-05'), '대체공휴일'); assert.equal(ctx.dutyHoliday('2026-10-06'), '');
  assert.equal(ctx.dutyHoliday('2026-10-09T00:00:00+09:00'), '한글날', '날짜로 시작하는 글');
  for (const bad of ['', null, undefined, '2026-10-9', 'toString', '__proto__', 'constructor', 20261009]) assert.equal(ctx.dutyHoliday(bad), '', String(bad));
  assert.equal(ctx.dutyHoliday(next(until)), '', '표 끝 뒤의 날짜는 공휴일이라고도 아니라고도 하지 않는다(빈 글 — 빨갛게 안 보일 뿐)');
});

test('달력 — 공휴일은 날짜 숫자만 빨갛게(hol): 당번이 없는 날도 · 칸의 뜻(초록·남색)은 그대로 · 그 달에 있으면 풀이에 이름 · 그날 카드에도 이름', () => {
  const S = (x) => ({ capacity: 2, off: false, n: 0, mine: null, why: '', ...x });
  const days = [{ date: '2026-10-09', off: false, slots: [S({ n: 1 })] }, { date: '2026-10-11', off: false, slots: [S({ n: 1, why: 'mine', mine: { id: 1, status: 'active' } })] },
    { date: '2026-11-08', off: false, slots: [S()] }, { date: '2026-12-25', off: false, slots: [S({ n: 1, why: 'mine', mine: { id: 2, status: 'active' } })] }];
  const oct = ctx.dutyCalHtml(days, '2026-10-09', '2026-10-05', { why: '' });
  assert.ok(oct.includes('class="duty-cal-c has k-need on hol" data-date="2026-10-09"'), '당번이 있는 공휴일 — 칸의 뜻(k-need)은 그대로이고 hol 이 붙는다');
  assert.ok(oct.includes('aria-label="10월 9일(금) — 손이 필요한 날이에요 · 필요 2명 가운데 1명 채워졌어요 · 공휴일(한글날)"'), '낭독에도 공휴일');
  assert.ok(oct.includes('<span class="duty-cal-c hol" title="개천절"><span>3</span></span>'), '당번이 없는 공휴일도 빨갛게');
  assert.ok(oct.includes('<span class="duty-cal-c today hol" title="대체공휴일"><span>5</span></span>'), '오늘이면서 공휴일');
  // 일요일도 빨갛다(친구 결정 2026-10-07 「네 빨갛게」) — 공휴일 표식(hol · 이름)과는 따로인 표식(sun): 날짜 숫자만 빨갛고 칸의 뜻(k-mine)은 그대로다
  assert.ok(oct.includes('class="duty-cal-c has k-mine sun" data-date="2026-10-11"'), '공휴일이 아닌 주일 — hol 은 없고 sun 이 붙는다');
  assert.ok(oct.includes('<span class="duty-cal-c sun"><span>4</span></span>') && oct.includes('<span class="duty-cal-c"><span>10</span></span>'), '당번이 없는 일요일도 sun · 토요일은 그대로');
  assert.equal((oct.match(/ sun"/g) || []).length, 4, '10월의 일요일은 넷(4·11·18·25일) — 그날이 공휴일이면 hol 이 뒤에 붙는다(이 달에는 없다)');
  assert.ok(oct.includes('<div class="duty-cal-w" aria-hidden="true"><span class="sun">일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span></div>'), '요일 줄의 「일」도 빨갛다');
  assert.equal(oct.includes('title="') && /class="duty-cal-c sun" title=/.test(oct), false, '일요일에는 이름(title)이 없다 — 이름은 공휴일에만');
  assert.equal((oct.match(/ hol"/g) || []).length, 3, '10월의 공휴일 표식은 셋(3·5·9일 — 빨간 날짜는 일요일 넷을 더해 일곱이다)');
  assert.ok(oct.includes('<span class="hd">빨간 날짜</span>는 일요일과 공휴일이에요(<span class="ki">3일 개천절</span> · <span class="ki">5일 대체공휴일</span> · <span class="ki">9일 한글날</span>).<br>날짜를 누르면 그날의 자리가 아래에 보여요.'),
    '풀이에 이름(색만으로 말하지 않는다 · 한 조각씩 줄이 갈리지 않게)');
  const nov = ctx.dutyCalHtml(days, '2026-11-08', '', { why: '' });
  assert.equal(nov.includes('빨간 날짜'), false, '공휴일이 없는 달에는 그 말이 없다(일요일은 요일 줄의 빨간 「일」이 말한다)'); assert.equal(/ hol"/.test(nov), false);
  assert.ok(nov.includes('class="duty-cal-c has k-need on sun" data-date="2026-11-08"') && nov.includes('<span class="duty-cal-c sun"><span>1</span></span>'), '공휴일이 없는 달에도 일요일은 빨갛다');
  const dec = ctx.dutyCalHtml(days, '2026-12-25', '2026-12-25', { why: '' });
  assert.ok(dec.includes('class="duty-cal-c has k-mine on today hol" data-date="2026-12-25"') && dec.includes('· 공휴일(성탄절) · 오늘"'), '내 당번(남색 칸) · 오늘 · 공휴일이 함께(금요일 — sun 은 없다)');
  // 일요일이면서 공휴일인 날(2027-02-07 설날 · 2027-06-06 현충일) — sun 과 hol 이 함께(hol 이 뒤 · 이름은 그대로)
  const feb = ctx.dutyCalHtml([{ date: '2027-02-07', off: true, slots: [S()] }, { date: '2027-02-14', off: false, slots: [S()] }], '2027-02-14', '', { why: '' });
  assert.ok(feb.includes('class="duty-cal-c has k-off sun hol" data-date="2027-02-07"') && feb.includes('· 공휴일(설날)"') && feb.includes('<span class="duty-cal-c hol" title="설날"><span>6</span></span>'), '주일인 설날 · 토요일인 설날');
  // 일요일인가 — 날짜만 있는 값이라 UTC 로 읽는다(기기의 시간대에 밀리지 않는다) · 틀린 값은 거짓
  for (const d of ['2026-10-04', '2026-10-11', '2027-02-07', '2028-12-31', '2029-01-07', '2024-02-25', '2026-10-11T00:00:00+09:00']) assert.equal(ctx.dutyIsSunday(d), true, d);
  for (const d of ['2026-10-03', '2026-10-05', '2026-10-10', '2026-12-25', '', null, undefined, 'x', '2026-10-1', '2026-13-01', '2026-02-30', '2026-02-29', 20261011]) assert.equal(ctx.dutyIsSunday(d), false, String(d));   // 2026-02-29 는 없는 날 — 넘겨 읽으면 3월 1일(일요일)이 된다
  for (let i = 0, n = 0; i < 800; i++) {   // 두 해 남짓을 하루씩 — 이레마다 꼭 한 번 · 달력 칸의 첫 열과 같다
    const d = new Date(Date.UTC(2026, 9, 1) + i * 86400000).toISOString().slice(0, 10), col = pick(ctx.dutyCalMonth(d.slice(0, 7))).findIndex((c) => c.date === d) % 7;
    assert.equal(ctx.dutyIsSunday(d), col === 0, d); n += ctx.dutyIsSunday(d) ? 1 : 0;
    if (i === 799) assert.equal(n, 114, '800일 가운데 일요일 114번');
  }
  // 다른 시간대의 기기에서도 같은 답인가(올리기 전 확인 반영 2026-10-07) — 이 시험이 도는 PC(한국)와 배포 전 검사(UTC)에서는 getDay 와 getUTCDay 가 같은 값이라,
  //   요일을 기기 시각으로 읽게 바꿔도 여기까지는 모두 통과한다(미주의 폰에서만 월요일이 빨개진다). 순수 구간을 통째로 UTC 서쪽·날짜선 양쪽 시간대의 자식 node 에서 다시 돌려
  //   일요일 판정 · 요일 글자(dutyMdw) · 달력의 열(dutyCalMonth)을 함께 본다. ⚠️ 손으로 볼 때 Git Bash 의 `TZ=… node` 는 node 에 닿지 않는다 — 자식의 env 로 준다.
  const duty = read(['js', 'duty.js']), pure = duty.slice(duty.indexOf('// ── 봉사 당번 순수 함수 (여기부터) ──'), duty.indexOf('// ── 봉사 당번 순수 함수 (여기까지) ──'));
  const DS = ['2026-10-10', '2026-10-11', '2026-10-12', '2027-01-03', '2027-01-04', '2028-12-31', '2029-01-01'];
  const child = "const vm = require('node:vm'), c = {}; vm.createContext(c); vm.runInContext(require('node:fs').readFileSync(0, 'utf8'), c); const D = " + JSON.stringify(DS) +
    "; process.stdout.write(JSON.stringify({ sun: D.map(c.dutyIsSunday), label: D.map(c.dutyMdw), col: D.map(function (d) { return c.dutyCalMonth(d.slice(0, 7)).findIndex(function (x) { return x.date === d; }) % 7; }) }));";
  for (const tz of ['America/Los_Angeles', 'Pacific/Pago_Pago', 'Pacific/Kiritimati']) {
    const r = require('node:child_process').spawnSync(process.execPath, ['-e', child], { input: pure, env: { ...process.env, TZ: tz }, encoding: 'utf8' });
    assert.equal(r.status, 0, tz + ' — ' + r.stderr);
    assert.deepEqual(JSON.parse(r.stdout), { sun: [false, true, false, true, false, true, false], label: ['10월 10일(토)', '10월 11일(일)', '10월 12일(월)', '1월 3일(일)', '1월 4일(월)', '12월 31일(일)', '1월 1일(월)'], col: [6, 0, 1, 0, 1, 0, 1] }, tz);
  }
  assert.ok(dec.includes('공휴일이에요(<span class="ki">25일 성탄절</span>).'));
  // 풀이 한 줄 — 이어진 같은 이름은 범위로 · 없는 달·틀린 값은 빈 글
  assert.equal(ctx.dutyHolLine('2026-10'), '3일 개천절 · 5일 대체공휴일 · 9일 한글날'); assert.equal(ctx.dutyHolLine('2027-02'), '6~8일 설날 · 9일 대체공휴일');
  assert.equal(ctx.dutyHolLine('2027-09'), '14~16일 추석'); assert.equal(ctx.dutyHolLine('2026-11'), '');
  // 2026년 5월부터 공휴일이 된 두 날 — 2027년에는 둘 다 토요일이라 월요일이 대체공휴일이다
  assert.equal(ctx.dutyHolLine('2027-05'), '1일 노동절 · 3일 대체공휴일 · 5일 어린이날 · 13일 부처님오신날'); assert.equal(ctx.dutyHolLine('2027-07'), '17일 제헌절 · 19일 대체공휴일');
  // 설날은 한국 음력이다 — 2027·2028년은 중국 춘절보다 하루 늦다(2027-02-07 · 2028-01-27). 2028-10-03 은 추석이면서 개천절(이름은 추석) · 선거일도 공휴일이다
  assert.equal(ctx.dutyHolLine('2028-01'), '1일 신정 · 26~28일 설날'); assert.equal(ctx.dutyHolLine('2028-10'), '2~4일 추석 · 5일 대체공휴일 · 9일 한글날'); assert.equal(ctx.dutyHolLine('2028-04'), '12일 국회의원 선거');
  assert.equal(ctx.dutyHoliday('2027-06-07'), '', '현충일은 대체공휴일이 없다'); assert.equal(ctx.dutyHoliday('2028-01-03'), '', '신정도 없다');
  assert.deepEqual(pick(ctx.dutyHolItems('2026-10')), ['3일 개천절', '5일 대체공휴일', '9일 한글날']); assert.deepEqual(pick(ctx.dutyHolItems('2026-11')), []); assert.equal(ctx.dutyHolLine('x'), ''); assert.equal(ctx.dutyHolLine(null), '');
  // 그날 카드의 이름 — 달력이 없는 당번(날짜가 적다)에서는 이것이 유일한 표시다
  assert.equal(ctx.dutyHolChip('2026-12-25'), '<span class="duty-hol">성탄절</span>'); assert.equal(ctx.dutyHolChip('2026-12-24'), ''); assert.equal(ctx.dutyHolChip(null), '');
  assert.ok(read(['js', 'duty.js']).includes("'<div class=\"duty-day-h\"><b>' + dutyEsc(dutyMdw(d.date)) + '</b>' + dutyHolChip(d.date) + (d.date === today ?"), '그날 카드가 그 이름을 붙인다');
  // 색 — 새 값을 만들지 않는다: 밝은 바탕은 --error(내 달력의 일요일과 같은 값) · 남색 칸과 어두운 모드는 이미 쓰는 #ffaaa2
  const css = read(['style.css']);
  for (const rule of ['.duty-cal-c.hol > span { color: var(--error); }', '.duty-cal-c.k-mine.hol > span { color: #ffaaa2; }', '.duty-cal-k .hd { color: var(--error); font-weight: 700; }',
    '.dark .duty-cal-c.hol > span, .dark .duty-hol, .dark .duty-cal-k .hd { color: #ffaaa2; }',
    // 일요일은 공휴일과 같은 값(밝은 바탕 --error · 내 당번 칸과 어두운 모드 #ffaaa2) — 요일 줄의 「일」도
    '.duty-cal-c.sun > span, .duty-cal-w .sun { color: var(--error); }', '.duty-cal-c.k-mine.sun > span { color: #ffaaa2; }', '.dark .duty-cal-c.sun > span, .dark .duty-cal-w .sun { color: #ffaaa2; }']) assert.ok(css.includes(rule), rule);
  assert.ok(css.indexOf('.duty-cal-c.sun > span, .duty-cal-w .sun {') > css.indexOf('.duty-cal-c.k-off {') && css.indexOf('.duty-cal-c.sun > span, .duty-cal-w .sun {') > css.indexOf('.duty-cal-w span {'), '일요일 색이 칸의 뜻 색·요일 줄의 기본 색 뒤에 온다');
  assert.ok(css.includes('.dark .sync-status.error .sync-title{ color:#ffaaa2; }') && css.includes('.mc-day.sun{ color:var(--error) !important; }'), '두 값 모두 다른 화면이 이미 쓰는 값이다');
  assert.equal(/\.duty-(cal|hol|day)[^{}]*\{[^}]*#(?:c0392b|e74c3c|ff0000|f00\b)/i.test(css), false, '당번 달력에 빨강을 글자 값으로 새로 적지 않는다(--error 를 쓴다)');
});

test('달력 · 그날 카드(독립 검토 반영 2026-10-07) — 표 밖의 달은 풀이가 그렇게 말한다 · 큰 수는 줄을 바꾼다 · 좁은 폰에서 머리가 꺾이지 않는다', () => {
  const S = (x) => ({ capacity: 2, off: false, n: 0, mine: null, why: '', ...x });
  // 「앞으로 1년」 당번은 표 끝(2028-12-31)의 한 해 전부터 그 뒤의 달을 보여 준다 — 그 달의 평일이 빨갛지 않은 것은 「공휴일이 없다」가 아니다(일요일은 그 달에도 빨갛다)
  const far = [{ date: '2028-12-24', off: false, slots: [S({ n: 1 })] }, { date: '2028-12-31', off: false, slots: [S()] }, { date: '2029-01-07', off: false, slots: [S()] }, { date: '2029-01-14', off: false, slots: [S()] }];
  const jan = ctx.dutyCalHtml(far, '2029-01-07', '2028-12-20', { why: '' });
  assert.ok(jan.includes('<br>이 달은 일요일만 빨갛게 보여요(다른 공휴일은 2028년 12월까지만 표시돼요).<br>날짜를 누르면 그날의 자리가 아래에 보여요.</p>'), '표 끝 뒤의 달');
  assert.equal(/ hol"/.test(jan) || jan.includes('빨간 날짜'), false, '공휴일 표식은 없다(1월 1일도)');
  assert.ok(jan.includes('class="duty-cal-c has k-need on sun" data-date="2029-01-07"') && (jan.match(/ sun"/g) || []).length === 4, '표 밖의 달에도 일요일은 빨갛다(7·14·21·28일 — 표가 아니라 요일로 본다)');
  const dec = ctx.dutyCalHtml(far, '2028-12-24', '2028-12-20', { why: '' });
  assert.ok(dec.includes('는 일요일과 공휴일이에요(<span class="ki">25일 성탄절</span>).') && !dec.includes('일요일만'), '표 안의 마지막 달은 그대로');
  const before = ctx.dutyCalHtml([{ date: '2026-09-27', off: false, slots: [S()] }], '2026-09-27', '', { why: '' });
  assert.ok(before.includes('이 달은 일요일만 빨갛게 보여요(다른 공휴일은 2026년 10월부터 표시돼요).'), '표가 시작하기 전의 달');
  const nov = ctx.dutyCalHtml([{ date: '2026-11-08', off: false, slots: [S()] }], '2026-11-08', '', { why: '' });
  assert.equal(nov.includes('일요일만') || nov.includes('표시돼요'), false, '표 안의 달에 공휴일이 없으면 아무 말도 하지 않는다');
  // 큰 수 — 「100/120」은 좁은 폰의 칸을 넘친다: 「/」 뒤에서 줄을 바꿀 수 있게(<wbr>) · 낭독의 수는 그대로 · 쉬는 날(「쉼」)에는 넣을 자리가 없다
  const big = ctx.dutyCalHtml([{ date: '2026-11-08', off: false, slots: [S({ capacity: 120, n: 100 })] }, { date: '2026-11-15', off: true, slots: [S()] }], '2026-11-08', '', { why: '' });
  assert.ok(big.includes('<span>8</span><i aria-hidden="true">100/<wbr>120</i>') && big.includes('필요 120명 가운데 100명 채워졌어요') && big.includes('<i aria-hidden="true">쉼</i>'));
  assert.equal(ctx.dutyCalMark({ kind: 'need', n: 100, cap: 120 }), '100/120', '칸의 글 자체는 그대로다(줄 바꿀 자리는 그릴 때만 넣는다)');
  const css = read(['style.css']);
  assert.equal(/\.duty-cal-c i \{[^}]*nowrap/.test(css), false, '인원 글에 nowrap 을 걸지 않는다(못 들면 줄을 바꾼다 — 넘쳐 이웃 칸에 묻히지 않게)');
  // 올리기 전 확인 반영 — 줄을 바꾸는 문턱은 **칸 폭**이다: 인원 글이 칸의 투명 테두리(2px) 자리까지 쓴다(좌우 여백 −2px). 없으면 문턱이 안쪽 폭(칸 − 4px)이 되어
  //   폭 329px 이하에서 「10/12」처럼 칸에 드는 두 자리/두 자리 수까지 두 줄이 된다(앞 판에서는 한 줄이던 글). 테두리 굵기와 여백은 같은 값이어야 한다
  const cellRule = css.match(/\.duty-cal-c \{[^}]*\}/)[0], markRule = css.match(/\.duty-cal-c i \{[^}]*\}/)[0];
  const bw = Number((cellRule.match(/border: (\d+)px solid transparent/) || [])[1]), mg = (markRule.match(/margin: 0 -(\d+)px;/) || [])[1];
  assert.ok(bw > 0 && Number(mg) === bw, `인원 글의 좌우 여백(−${mg}px)이 칸의 테두리(${bw}px)와 같다`);
  // 물려받는 nowrap 도 걸지 않는다 — 크롬은 nowrap 아래에서도 <wbr> 에서 줄을 바꾸지만 사파리·파이어폭스는 바꾸지 않아 「100/120」이 다시 칸을 넘친다(올리기 전 확인이 세 엔진으로 잰 것)
  const inherits = /\.duty-cal(-g|-c)?(?![-\w])[^{}]*\{[^}]*nowrap/, bare = css.replace(/\/\*[\s\S]*?\*\//g, '');   // 주석은 걷어 내고 본다(주석 속의 이름에서 다음 규칙까지 이어 읽지 않게)
  assert.equal(inherits.test(bare), false, '달력 상자·격자·칸에 nowrap 을 걸지 않는다(인원 글이 물려받는다)');
  for (const bad of ['.duty-cal-c { white-space: nowrap; }', '.duty-cal-c.has { cursor: pointer; white-space: nowrap; }', '.duty-cal-w, .duty-cal-g { white-space: nowrap; }', '.duty-cal { white-space: nowrap; }']) assert.ok(inherits.test(bad), bad);
  for (const fine of ['.duty-cal-h b { white-space: nowrap; }', '.duty-cal-nav { white-space: nowrap; }', '.duty-cal-k .ki { white-space: nowrap; }']) assert.equal(inherits.test(fine), false, fine);
  assert.equal(/\.duty-cal-c[^{}]*\{[^}]*overflow:\s*hidden/.test(css), false, '칸을 잘라 내지 않는다(잘린 수는 틀린 수로 읽힌다)');
  // 그날 카드의 머리 — 폭 320px 에서 「오늘」이면서 이름이 긴 공휴일인 날: 한 줄에 못 들면 조각째 다음 줄로(날짜가 두 줄로 갈리거나 「오늘」이 세로로 꺾이지 않게)
  assert.ok(css.includes('.duty-day-h { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; }'), '머리는 조각째 넘긴다');
  assert.ok(css.includes('.duty-day-h b { font-size: 17px; color: var(--navy); white-space: nowrap; }'), '날짜는 한 줄');
  assert.ok(/\.duty-today \{ flex: none;[^}]*white-space: nowrap; \}/.test(css) && /\.duty-hol \{[^}]*white-space: nowrap; \}/.test(css), '「오늘」·공휴일 이름도 저마다 한 줄 · 「오늘」은 줄어들지 않는다');
});

test('달력 굴리기(dutyRevealBy) — 달력을 맨 위에 · 그래도 보여야 할 것이 🏠 단추에 가리면 모자란 만큼만 더 · 이미 보이면 그대로', () => {
  const by = (g, force) => ctx.dutyRevealBy({ calGap: 8, cardGap: 12, ...g }, force);
  // 390×844(맨 위에서 날짜를 고름): 달력 230 · 그날 카드 655 · 첫 단추가 든 자리의 끝 831 · 🏠 768 → 달력을 맨 위로(222). 그러면 카드 433 · 끝 609 라 더 올릴 것이 없다
  assert.equal(by({ calTop: 230, cardTop: 655, aimBottom: 831, floor: 768 }), 222);
  // 390×664(아이폰 사파리 · 주소창이 있을 때): 🏠 588 → 609 − 588 = 21 만큼 더(달력 윗부분 21px 가 밀려난다 · 날짜 줄은 그대로 보인다)
  assert.equal(by({ calTop: 230, cardTop: 655, aimBottom: 831, floor: 588 }), 243);
  // 320×568 · 6주짜리 달: 달력을 붙이면 그날 카드 위끝(504)부터 🏠(492) 밑이다 — 모자란 만큼(504 + 190 − 492 = 202) 더
  assert.equal(by({ calTop: 200, cardTop: 696, aimBottom: 886, floor: 492 }), 192 + 202);
  // 보여야 할 것이 화면보다 길면 그날 카드를 맨 위(여백 12)에 둔다 — 그 이상은 올리지 않는다(카드 머리가 화면 밖으로 나가지 않게)
  assert.equal(by({ calTop: 230, cardTop: 655, aimBottom: 1455, floor: 588 }), 222 + 421);
  // 이미 다 보이면 움직이지 않는다 · force(「내 당번」 카드로 들어옴)는 그래도 달력을 맨 위로(위로 굴리는 것도 된다)
  assert.equal(by({ calTop: -125, cardTop: 300, aimBottom: 476, floor: 768 }), null);
  assert.equal(by({ calTop: -125, cardTop: 300, aimBottom: 476, floor: 768 }, true), -133);
  assert.equal(by({ calTop: -125, cardTop: 300, aimBottom: 476, floor: 588 }, true), -112, 'force 여도 가리면 모자란 만큼 더(-133 + 21)');
  // 끝이 🏠 위끝과 딱 맞으면 보이는 것 · 1px 이라도 가리면 굴린다 · 그날 카드 위끝이 화면 위로 나가 있으면 보이는 것이 아니다
  assert.equal(by({ calTop: 8, cardTop: 433, aimBottom: 588, floor: 588 }), null);
  assert.equal(by({ calTop: 8, cardTop: 433, aimBottom: 589, floor: 588 }), 1);
  assert.equal(by({ calTop: -500, cardTop: -75, aimBottom: 101, floor: 768 }), -508, '달력을 맨 위로 되돌린다');
  // 보여야 할 것의 끝이 카드 위끝보다 위일 수는 없다(틀린 값) — 그때는 카드 위끝까지는 보이게 · 값이 비어도 던지지 않는다
  assert.equal(by({ calTop: 230, cardTop: 655, aimBottom: 0, floor: 768 }), null);
  assert.equal(by({ calTop: 230, cardTop: 655, aimBottom: 0, floor: 300 }, true), 222 + 133, '카드 위끝(433)이 🏠(300) 위로 오게');
  assert.equal(typeof by({}, true), 'number'); assert.equal(typeof ctx.dutyRevealBy({}, true), 'number');
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
    assert.equal(ctx.dutyErrKnown(srv.dutyErrOut(c)), true, c);
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

// ── 3단계(알림) — 알림 글·거르기(api 순수 구간) · 알림 주소(화면 순수 구간) · api 몸통 글자 검사 ──
const NR = (x) => ({ id: 1, uid: 'u1', status: 'active', reason: null, boardId: 'b1', board: '식당 봉사', place: '지하 1층 식당', date: '2026-10-18',
  service: '2부', task: '설거지', start: '11:30', end: '12:30', off: false, dayOff: false, locked: false, past: false, pastCutoff: false, movedFrom: null, ...(x || {}) });

test('api 알림 — dutyPlain: 담당자가 쓴 글의 줄바꿈·제어·방향 바꿈 글자는 빈칸 · 길이', () => {
  assert.equal(srv.dutyPlain('  식당\n봉사\t' + String.fromCharCode(0x202e) + '2부 ', 40), '식당 봉사 2부');
  assert.equal(srv.dutyPlain('가'.repeat(50), 10), '가'.repeat(9) + '…');
  assert.equal(srv.dutyPlain(null, 10), ''); assert.equal(srv.dutyNoteDay('2026-10-18'), '10월 18일(일)'); assert.equal(srv.dutyNoteDay('x'), '');
});

test('api 알림 — dutyNoteKeep: 종류마다 받을 줄(지난 날·계정 없는 줄은 어느 종류도 받지 않는다)', () => {
  const k = (kind, x) => srv.dutyNoteKeep(kind, NR(x));
  for (const kind of ['confirmed', 'remind', 'added', 'moved', 'reopen']) assert.equal(k(kind), true, kind);
  for (const kind of pick(srv.DUTY_NOTE_KINDS)) {
    assert.equal(k(kind, { uid: null }), false, kind + ' 계정 없는 줄');
    assert.equal(k(kind, { past: true }), false, kind + ' 지난 날');
  }
  assert.equal(k('confirmed', { pastCutoff: true }), false, '전날 저녁이 지난 날(저절로 잠긴 날)은 확정 알림을 보내지 않는다 — 전날 알림이 갔다');
  assert.equal(k('confirmed', { off: true }), false); assert.equal(k('remind', { off: true }), false, '쉬는 날·자리에는 전날 알림이 가지 않는다');
  assert.equal(k('applied'), false, '잠기지 않은 날의 앱 지원은 알리지 않는다'); assert.equal(k('applied', { locked: true }), true);
  assert.equal(k('removed'), false); assert.equal(k('removed', { status: 'removed', reason: 'staff' }), true);
  assert.equal(k('removed', { status: 'cancelled', reason: 'self' }), false, '본인 취소는 알리지 않는다');
  assert.equal(k('off'), false); assert.equal(k('off', { off: true }), true); assert.equal(k('off', { off: true, status: 'removed' }), false);
  assert.equal(k('zzz'), false);
  // 검토 반영(2026-10-07) — 확정은 지금도 확정인 날만(옛 SQL 은 그 칸이 없다 — 그대로 지난다) · 전날은 고른 날짜의 줄만
  assert.equal(k('confirmed', { confirmed: false }), false, '부탁과 보내기 사이에 확정이 풀렸다'); assert.equal(k('confirmed', { confirmed: true }), true);
  assert.equal(srv.dutyNoteKeep('remind', NR(), '2026-10-18'), true); assert.equal(srv.dutyNoteKeep('remind', NR(), '2026-10-25'), false, '그사이 다른 날로 옮겨진 줄에 「내일」이라 하지 않는다');
  // 오늘 이미 끝난 자리를 바로잡는 것(넣음·옮김·뺌·쉼·다시 엶)은 알리지 않는다 — 확정·전날·잠긴 날 지원은 제 규칙이 따로 있다
  for (const kind of ['added', 'moved', 'reopen']) assert.equal(k(kind, { ended: true }), false, kind + ' 끝난 자리');
  assert.equal(k('removed', { status: 'removed', reason: 'staff', ended: true }), false, '끝난 뒤의 「안 나오셔도 돼요」'); assert.equal(k('off', { off: true, ended: true }), false);
  for (const kind of ['confirmed', 'remind', 'applied']) assert.equal(k(kind, { ended: true, locked: true }), true, kind);
  // 고침 검토 반영(2026-10-07) — 옮김만은 떠난 자리로도 가른다: 아직 안 끝난 자리에 서 있던 줄을 오늘 끝난 자리로 옮기면 남은 당번이 사라진다 → 알린다
  const left = (live) => ({ date: '2026-10-25', service: '2부', task: '설거지', start: '11:30', ...(live === undefined ? {} : { live }) });
  assert.equal(k('moved', { ended: true, movedFrom: left(true) }), true, '앞날 줄 → 오늘 끝난 자리');
  assert.equal(k('moved', { ended: true, movedFrom: left(false) }), false, '끝난 자리끼리·지난 날 줄의 바로잡기는 조용');
  assert.equal(k('moved', { ended: true, movedFrom: left() }), false, '옛 SQL(live 없음)은 그대로 거른다'); assert.equal(k('moved', { ended: true, movedFrom: left('true') }), false, 'true 하나일 때만');
  for (const kind of ['added', 'reopen']) assert.equal(k(kind, { ended: true, movedFrom: left(true) }), false, kind + ' — 옮김만이다');
  assert.equal(k('removed', { status: 'removed', reason: 'staff', ended: true, movedFrom: left(true) }), false); assert.equal(k('off', { off: true, ended: true, movedFrom: left(true) }), false);
  assert.equal(k('moved', { ended: true, past: true, movedFrom: left(true) }), false, '지난 날 자리는 그래도 안 간다'); assert.equal(k('moved', { ended: true, off: true, movedFrom: left(true) }), false, '쉬는 자리도');
  assert.equal(k('moved', { movedFrom: left(false) }), true, '안 끝난 자리로 옮긴 것은 떠난 자리와 무관하게 간다');
  // 끝난 줄(살아 있지 않은 줄)은 「빼 드렸어요」 말고는 어느 종류도 받지 않는다
  for (const kind of pick(srv.DUTY_NOTE_KINDS)) {
    if (kind === 'removed') continue;
    assert.equal(k(kind, { status: 'removed', reason: 'staff', off: kind === 'off', locked: true }), false, kind + ' — 담당자가 뺀 줄');
    assert.equal(k(kind, { status: 'cancelled', reason: 'self', off: kind === 'off', locked: true }), false, kind + ' — 본인이 취소한 줄');
  }
  // 겹친 줄(같은 자리 · 같은 이름)을 정리하며 앱 줄을 뺀 것 — 그분은 남은 줄로 서 있다
  assert.equal(k('removed', { status: 'removed', reason: 'staff', dup: true }), false); assert.equal(k('removed', { status: 'removed', reason: 'staff', dup: false }), true);
  // 교회 어드민이 부탁하는 여섯(duty-db.ts withNotify 의 kind) · 잡는 종류는 SQL duty_notify_log 의 CHECK 와 같다
  assert.deepEqual(pick(srv.DUTY_NOTE_STAFF_KINDS).sort(), ['added', 'confirmed', 'moved', 'off', 'removed', 'reopen']);
  assert.deepEqual(pick(srv.DUTY_NOTE_CLAIM).sort(), ['confirmed', 'remind']);
  const sql = read(['supabase', 'duty.sql']);
  assert.ok(sql.includes("kind      text   not null check (kind in ('confirmed','remind'))"), 'duty_notify_log 의 kind CHECK 가 DUTY_NOTE_CLAIM 과 같아야 한다');
});

test('api 알림 — dutyNoteText: 종류마다 한 통(한 분의 여러 자리는 한 글로)', () => {
  const t = (kind, rows) => srv.dutyNoteText(kind, rows);
  assert.equal(t('confirmed', [NR()]), '10월 18일(일) 식당 봉사 2부 설거지 당번이 확정됐어요. 이제 앱에서는 취소할 수 없어요 — 못 오시면 담당자께 알려 주세요');
  assert.equal(t('confirmed', [NR({ service: '1부', start: '09:00' }), NR()]), '10월 18일(일) 식당 봉사 1부 설거지 · 2부 설거지 당번이 확정됐어요. 이제 앱에서는 취소할 수 없어요 — 못 오시면 담당자께 알려 주세요');
  assert.equal(t('remind', [NR()]), '내일 10월 18일(일) 당번이에요 — 식당 봉사 2부 설거지 11:30 · 지하 1층 식당');
  assert.equal(t('remind', [NR(), NR({ boardId: 'b2', board: '주차 봉사', service: '1부', task: '안내', start: '08:30', place: '주차장' })]),
    '내일 10월 18일(일) 당번이에요 — 식당 봉사 2부 설거지 11:30 · 지하 1층 식당 / 주차 봉사 1부 안내 08:30 · 주차장');
  assert.equal(t('applied', [NR({ locked: true })]), '10월 18일(일) 식당 봉사 2부 설거지에 지원하셨어요 — 확정된 날이라 앱에서 취소할 수 없어요');
  assert.equal(t('added', [NR()]), '담당자가 10월 18일(일) 식당 봉사 2부 설거지 당번에 넣어 드렸어요');
  assert.equal(t('moved', [NR({ service: '1부', start: '09:00', movedFrom: { date: '2026-10-18', service: '2부', task: '설거지', start: '11:30' } })]),
    '담당자가 당번 자리를 옮겨 드렸어요 — 10월 18일(일) 2부 설거지 11:30 → 10월 18일(일) 식당 봉사 1부 설거지 09:00');
  assert.equal(t('moved', [NR()]), '담당자가 당번 자리를 옮겨 드렸어요 — 10월 18일(일) 식당 봉사 2부 설거지 11:30');
  assert.equal(t('removed', [NR({ status: 'removed', reason: 'staff' })]), '담당자가 10월 18일(일) 식당 봉사 2부 설거지 당번에서 빼 드렸어요 — 안 나오셔도 돼요');
  assert.equal(t('off', [NR({ off: true, dayOff: true })]), '10월 18일(일) 식당 봉사 당번은 쉬어요 — 안 나오셔도 돼요');
  assert.equal(t('off', [NR({ off: true, dayOff: false })]), '10월 18일(일) 식당 봉사 2부 설거지 당번은 쉬어요 — 안 나오셔도 돼요', '자리만 쉬면 그 자리를 말한다(그날 다른 당번까지 빠지시지 않게)');
  assert.equal(t('off', [NR({ off: true, dayOff: true }), NR({ off: true, dayOff: true, date: '2026-10-25' })]), '10월 18일(일) 식당 봉사 / 10월 25일(일) 식당 봉사 당번은 쉬어요 — 안 나오셔도 돼요');
  assert.equal(t('reopen', [NR()]), '10월 18일(일) 식당 봉사 2부 설거지 11:30 당번을 다시 서요');
  assert.equal(t('zzz', [NR()]), ''); assert.equal(t('confirmed', []), '');
  // 여러 주를 한 번에 쉬게 하거나 다시 열면 180자를 넘는다 — 뜻을 앞에 두고 목록을 「외 N일」로 줄인다(끝에서 잘려 「쉬어요」·「다시 서요」가 사라지던 것)
  const weeks = (n, x) => Array.from({ length: n }, (_, i) => NR({ date: new Date(Date.UTC(2026, 9, 11 + 7 * i)).toISOString().slice(0, 10), ...(x || {}) }));
  const shown = (s) => s.split(' / ').length, more = (s) => Number((/ 외 (\d+)[일건]/.exec(s) || [0, 0])[1]);
  assert.ok(t('off', weeks(6, { off: true, dayOff: true })).endsWith(' 당번은 쉬어요 — 안 나오셔도 돼요'), '들어가면 문장 꼴 그대로');
  const off12 = t('off', weeks(12, { off: true, dayOff: true }));
  assert.ok(off12.startsWith('당번이 쉬어요(안 나오셔도 돼요) — 10월 11일(일) 식당 봉사 / 10월 18일(일) 식당 봉사 / ') && / 외 \d+일$/.test(off12) && Array.from(off12).length <= 180, off12);
  assert.equal(shown(off12) + more(off12), 12, '실은 날 + 「외 N일」 = 모두');
  const re8 = t('reopen', weeks(8));
  assert.ok(re8.startsWith('당번을 다시 서요 — 10월 11일(일) 식당 봉사 2부 설거지 11:30 / ') && / 외 \d+일$/.test(re8) && Array.from(re8).length <= 180, re8);
  assert.equal(shown(re8) + more(re8), 8);
  for (const kind of ['confirmed', 'applied', 'added', 'removed']) {
    const s = t(kind, weeks(9, { status: kind === 'removed' ? 'removed' : 'active', locked: true }));
    assert.ok(Array.from(s).length <= 180 && / 외 \d+일$/.test(s) && /^(당번이 확정됐어요|확정된 날에 지원하셨어요|담당자가 당번에 넣어 드렸어요|담당자가 당번에서 빼 드렸어요)/.test(s), kind + ': ' + s);
  }
  const rem12 = t('remind', Array.from({ length: 12 }, (_, i) => NR({ boardId: 'b' + i, board: '당번' + i })));
  assert.ok(rem12.startsWith('내일 10월 18일(일) 당번이에요 — 당번0 2부 설거지 11:30 · 지하 1층 식당 / ') && / 외 \d+건$/.test(rem12), '같은 날의 여러 당번은 「건」: ' + rem12);
  // dutyNoteFit — 들어가는 만큼만 · 첫 조각은 넘쳐도 싣는다 · 남은 것이 앞에 실은 날짜와 같으면 「건」
  const fit = (n, room) => srv.dutyNoteFit(Array.from({ length: n }, (_, i) => ({ text: 'ㄱ'.repeat(10), date: 'd' + i })), ' / ', room);
  assert.equal(fit(3, 100), ['ㄱ'.repeat(10), 'ㄱ'.repeat(10), 'ㄱ'.repeat(10)].join(' / '));
  assert.equal(fit(3, 20), 'ㄱ'.repeat(10) + ' 외 2일'); assert.equal(fit(3, 28), 'ㄱ'.repeat(10) + ' / ' + 'ㄱ'.repeat(10) + ' 외 1일'); assert.equal(fit(1, 5), 'ㄱ'.repeat(10));
  assert.equal(srv.dutyNoteFit([{ text: 'A', date: 'd' }, { text: 'B', date: 'd' }, { text: 'C', date: 'e' }], ' / ', 6), 'A 외 2건');
  assert.equal(srv.dutyNoteFit([], ' / ', 10), ''); assert.equal(srv.dutyNoteFit(null, ' / ', 10), '');
  // dutyNoteGroups — 한 분씩 글을 만들어 같은 글끼리 한 묶음(push_log 한 줄) · 계정 없는 줄·글이 없는 종류는 없다
  const grp = pick(srv.dutyNoteGroups('confirmed', [NR({ uid: 'u1' }), NR({ uid: 'u2' }), NR({ uid: 'u3', service: '1부' }), NR({ uid: null })]));
  assert.deepEqual(grp.map((x) => x.uids), [['u1', 'u2'], ['u3']]); assert.equal(grp[0].text, t('confirmed', [NR()]));
  assert.deepEqual(pick(srv.dutyNoteGroups('zzz', [NR()])), []); assert.deepEqual(pick(srv.dutyNoteGroups('added', null)), []);
  const two = pick(srv.dutyNoteGroups('remind', [NR({ uid: 'u1' }), NR({ uid: 'u1', service: '1부', start: '09:00' })]));
  assert.equal(two.length, 1, '한 분의 두 자리는 한 통'); assert.deepEqual(two[0].uids, ['u1']);
  assert.ok(two[0].text.includes('2부 설거지 11:30') && two[0].text.includes('1부 설거지 09:00'), '두 자리가 모두 글에 실린다: ' + two[0].text);
  const HEAD = { confirmed: '당번이 확정됐어요(', applied: '확정된 날에 지원하셨어요(', added: '담당자가 당번에 넣어 드렸어요 — ', removed: '담당자가 당번에서 빼 드렸어요(' };
  for (const kind of Object.keys(HEAD)) assert.ok(t(kind, weeks(9, { status: kind === 'removed' ? 'removed' : 'active', locked: true })).startsWith(HEAD[kind]), kind + ' — 제 머리로 시작한다');
  // 담당자가 쓴 글의 줄바꿈·제어 글자는 알림에 그대로 가지 않는다 · 길면 180자에서 자른다 · 받는 분 번호(uid)는 글에 없다
  assert.equal(t('added', [NR({ board: '식당\n봉사', service: '2부' + String.fromCharCode(0x202e) })]).includes('\n'), false);
  assert.ok(Array.from(t('remind', Array.from({ length: 12 }, (_, i) => NR({ boardId: 'b' + i, board: '당번' + i })))).length <= 180);
  for (const kind of pick(srv.DUTY_NOTE_KINDS)) assert.equal(t(kind, [NR({ uid: 'UID-XYZ', status: kind === 'removed' ? 'removed' : 'active', off: kind === 'off' })]).includes('UID-XYZ'), false, kind);
  assert.deepEqual([...srv.dutyClaimedIds([3, '5', 0, -1, 'x', null])], [3, 5]); assert.deepEqual([...srv.dutyClaimedIds(null)], []);
});

test('알림 주소 — dutyDeepLink: ?duty=1 만 · 다른 파라미터가 섞여 있어도', () => {
  assert.equal(ctx.dutyDeepLink('https://gocheok.onlybible.kr/?duty=1'), true);
  assert.equal(ctx.dutyDeepLink('?duty=1&from=push'), true); assert.equal(ctx.dutyDeepLink('https://x/?from=push&duty=1#top'), true);
  for (const bad of ['', null, 'https://gocheok.onlybible.kr/', '?duty=2', '?duty', '?xduty=1', '?edu=1', 'duty=1']) assert.equal(ctx.dutyDeepLink(bad), false, String(bad));
});

test('api 글자 검사 — 알림: 내부 액션 둘은 서비스 키 문이 맨 앞 · 응답에 받는 분 번호 없음 · 문·잡기 차례', () => {
  for (const name of ['internalDutyNotify', 'internalDutyRemind']) {
    const body = fn(name);
    const gate = body.indexOf('if (!sameSecret(req.headers.get("x-internal-key") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""))');
    assert.ok(gate > 0 && gate < body.indexOf('dutyNotifySend(') && body.indexOf('return { ok: false, error: "unauthorized" };') > gate, name + ' — 서비스 키 확인이 맨 앞');
    assert.equal(/uid|user_id/.test(body.replace(/\/\/.*$/gm, '')), false, name + ' — 응답에 받는 분 번호를 싣지 않는다');
  }
  assert.ok(fn('internalDutyNotify').includes('if (DUTY_NOTE_STAFF_KINDS.indexOf(kind) < 0) return { ok: false, error: "bad-kind" };'), '교회 어드민은 여섯 종류만(remind·applied 는 못 부른다)');
  const send = fn('dutyNotifySend'), pickFn = fn('dutyNotifyPick');
  // 고르기(읽기만): 재료 → 거르기 → 문(닫혔으면 시험 참여자만) — 잡지도 보내지도 않는다
  const rows = pickFn.indexOf('db.rpc("duty_notify_rows"'), keep = pickFn.indexOf('rows = rows.filter((r) => dutyNoteKeep(kind, r, day));'), open = pickFn.indexOf('if (!rows.length || open) return rows;');
  assert.ok(rows > 0 && keep > rows && open > keep && pickFn.indexOf('return rows.filter((r) => testers.has(String(r.uid)));') > open, '재료 → 거르기 → 문이 닫힌 동안에는 시험 참여자에게만');
  assert.equal(/duty_notify_claim|eduPushDevices|eduDevicesOf|\.insert\(|\.upsert\(|\.delete\(/.test(pickFn), false, '고르기는 읽기만 한다');
  // 꺼 두었으면 잡기·보내기에 닿기 전에 돌아간다 — 고르기만 해서 held(받을 분 수)를 준다 · 읽다 실패하면 held 없이
  const off = send.indexOf('if (gate.off) {'), offEnd = send.indexOf('return { sent: 0, missed: 0, off: true, ...(held === undefined ? {} : { held }) };');
  const go = send.indexOf('let rows = await dutyNotifyPick(kind, list, day, gate.open);'), dev = send.indexOf('await eduDevicesOf('), claim = send.indexOf('db.rpc("duty_notify_claim"'), push = send.indexOf('await eduPushDevices(');
  assert.ok(off > 0 && offEnd > off && go > offEnd, '꺼 둔 갈래가 먼저 끝난다');
  const offBody = send.slice(off, offEnd);
  assert.equal(/duty_notify_claim|eduPushDevices|eduDevicesOf/.test(offBody), false, '꺼 둔 동안에는 잡지도 보내지도 기기를 읽지도 않는다');
  assert.ok(offBody.includes('try { held = new Set((await dutyNotifyUnclaimed(kind, await dutyNotifyPick(kind, list, day, gate.open))).map((r) => String(r.uid))).size; }') && offBody.includes('catch (e)'));
  // 회귀 확인 반영(2026-10-07) — 확정·전날은 이미 잡힌(받은) 줄을 held 에서 뺀다: 잡기와 같은 겹침 키(signup_id, kind)로 **읽기만** 한다 · 잡지 않는 종류는 그대로
  const unc = fn('dutyNotifyUnclaimed');
  assert.ok(unc.includes('if (!rows.length || DUTY_NOTE_CLAIM.indexOf(kind) < 0) return rows;') && unc.includes('db.from("duty_notify_log").select("signup_id").eq("kind", kind).in("signup_id",') && unc.includes('if (error) throw error;'));
  assert.equal(/\.rpc\(|\.insert\(|\.upsert\(|\.delete\(|\.update\(/.test(unc), false, '읽기만 한다(잡지 않는다)');
  assert.equal(send.split('dutyNotifyUnclaimed(').length, 2, '꺼 둔 갈래에서만 쓴다(켜 둔 갈래는 잡기가 거른다)');
  assert.ok(dev > go && claim > dev && push > claim, '고르기 → 기기 읽기 → 잡기 → 보내기 차례(걸러진 줄은 잡지 않는다 · 잡은 뒤에 기기를 읽지 않는다)');
  // 알린 분 수 — 받는 분마다 센다(dutyNoteTally · 값 시험은 아래) · 기기 줄은 보내는 쪽이 받아들여진 것을 따로 돌려준다
  assert.ok(send.includes('if (d) { web.push(...d.web); ios.push(...d.ios); }'));
  assert.ok(send.includes('const t = dutyNoteTally(g.uids, devs, res ? res.okWeb : null, res ? res.okIos : null);') && send.includes('sent += t.sent; missed += t.missed;') && send.includes('return { sent, missed };'));
  const wpl = fn('webPushList'), epd = fn('eduPushDevices');
  assert.ok(wpl.includes('sent++; ok.push(s);') && wpl.includes('return { sent, failed, last, codes, ok };'), '웹 푸시 — 받아들여진 구독 줄');
  assert.ok(epd.includes('if (r === "ok") { sent++; okIos.push(t); continue; }') && epd.includes('return { sent, failed, total, okWeb: w.ok, okIos };'), '아이폰 — 받아들여진 토큰 줄(웹과 따로)');
  // 전날 알림은 고른 날짜를 잡는 문장에도 싣는다 · 옛 SQL(그 인자가 없는 꼴)이면 그 오류일 때만 인자 둘로 물러선다
  assert.ok(send.includes('let dated = kind === "remind" && !!day;') && send.includes('dated ? { p_kind: kind, p_ids, p_date: day } : { p_kind: kind, p_ids }'));
  assert.ok(send.includes('if (error && dated && dutyNoFn(error)) {') && send.includes('dated = false;') && send.includes('({ data, error } = await db.rpc("duty_notify_claim", { p_kind: kind, p_ids }));'));
  assert.ok(send.includes('for (const g of dutyNoteGroups(kind, rows))') && send.includes('const d = devs.get(uid);'), '그분 글은 그분 기기로(묶음의 uid 로 기기를 찾는다)');
  // 잡다가 DB 오류 — 그때까지 잡힌 줄은 보낸 뒤 던진다(잡힌 채 안 가는 줄을 남기지 않는다)
  assert.ok(send.includes('if (error) { claimErr = error; break; }') && send.lastIndexOf('if (claimErr) throw claimErr;') > push);
  assert.ok(send.includes('rows = rows.filter((r) => got.has(Number(r.id)));'), '잡힌 줄에만 보낸다');
  const gate = fn('dutyNotifyGate');
  assert.ok(gate.includes('.in("key", ["dutyOpen", "dutyNotifyOff"])') && gate.includes('if (error) throw error;') && gate.includes('return dutyGateOf(data);'), '두 스위치 · DB 오류는 던진다(값 읽기는 dutyGateOf — 아래 값 시험)');
  assert.equal(/PUBLIC_CONFIG_KEYS = new Set\(\[[^\]]*(dutyNotifyOff|dutyRemindRun)/.test(API), false, '알림 스위치·흔적은 앱이 읽는 키가 아니다');
  assert.ok(fn('internalDutyNotify').includes('return { ok: true, sent: n.sent, missed: n.missed, ...(n.off ? { off: true, ...(n.held === undefined ? {} : { held: n.held }) } : {}) };'));
  // 전날 알림 — 한국 19시 전에는 돌지 않는다(크론은 anytime 을 싣지 않는다) · 고른 날짜를 거르기에 넘긴다 · 돌 때마다 흔적 · monitor 가 본다
  const rem = fn('internalDutyRemind');
  assert.ok(rem.includes('if (b?.anytime !== true && new Date(Date.now() + 9 * 3600 * 1000).getUTCHours() < 19) return { ok: false, error: "too-early" };'));
  assert.ok(rem.indexOf('"too-early"') > 0 && rem.indexOf('"too-early"') < rem.indexOf('db.rpc("duty_remind_ids"'), '시각 확인이 읽기보다 먼저');
  assert.ok(rem.includes('dutyNotifySend("remind", ids, day)') && rem.includes('key: "dutyRemindRun"'));
  const cron = read(['supabase', 'duty_remind_cron.sql']);
  assert.equal(cron.includes('anytime'), false, '크론은 anytime 을 싣지 않는다'); assert.ok(cron.includes("'0,20 10 * * *'"), '19:00 · 19:20 두 번');
  assert.ok(read(['supabase', 'edu_remind_cron.sql']).includes('duty-remind'), '교육 크론 파일이 비밀을 당번 크론도 읽는다고 말한다');
  // 크론이 부르는 액션 이름·Vault 이름 — 한 글자만 틀려도 전날 알림이 조용히 안 간다(크론은 넣기만 하면 succeeded 다)
  assert.ok(cron.includes("body := jsonb_build_object('action','internalDutyRemind')") && API.includes('case "internalDutyRemind":'), '액션 이름');
  assert.ok(cron.includes("'x-internal-key',(select decrypted_secret from vault.decrypted_secrets where name = 'edu_remind_service_key'))"), 'Vault 이름(명령 속)');
  assert.ok(cron.includes("perform cron.unschedule(jobid) from cron.job where jobname = 'duty-remind';") && cron.includes("perform cron.schedule('duty-remind',"), '같은 이름의 작업은 하나');
  const mon = fn('monitor');
  assert.ok(mon.includes('dutyRemindProblems(v, now.getTime(), off)'), 'monitor 의 판정은 순수 함수(아래 값 시험)');
  // 잠긴 날의 앱 지원 — 응답을 기다리게 하지 않고(eduAfterResponse) 이미 서 있던 줄은 알리지 않는다
  const apply = fn('dutyApply');
  assert.ok(apply.includes('r.locked === true && r.already !== true') && apply.includes('eduAfterResponse(dutyNotifySend("applied", [Number(r.id)]), "dutyApply notify")'));
  assert.equal((apply.match(/db\.rpc\(/g) || []).length, 1);
  // switch 에 두 줄
  assert.ok(API.includes('case "internalDutyNotify": return json(await internalDutyNotify(req, body));') && API.includes('case "internalDutyRemind": return json(await internalDutyRemind(req, body));'));
});

// ── 앱 쪽 배선(검토 반영 2026-10-07) — app.js · sw.js · js/push.js 는 순수 구간이 아니라 글자로 보고, 떼어 낼 수 있는 조각은 가짜 환경에서 돌린다 ──
const APP = read(['app.js']), SW = read(['sw.js']), PUSH = read(['js', 'push.js']), DUTY_JS = read(['js', 'duty.js']);
const cutFn = (src, head) => { const a = src.indexOf(head); assert.ok(a >= 0, head + ' 를 못 찾았다'); const e = src.indexOf('\n}\n', a); assert.ok(e > a); return src.slice(a, e + 2); };

test('알림 주소 배선 — api 가 보내는 주소 = 앱이 읽는 주소 · routeAfterLoad·열린 창은 🙋 가 보이는 분만 · dutyVisible 세 조건 · 주소에서 duty 만 지운다', () => {
  const url = /const DUTY_NOTIFY_URL = "([^"]+)";/.exec(API)[1];
  assert.equal(ctx.dutyDeepLink(url), true, 'api 의 알림 주소를 앱이 당번 알림으로 읽는다'); assert.equal(ctx.dutyDeepLink(url + '&from=push'), true);
  assert.ok(APP.includes('if (_dutyDeep && loadUser() && dutyVisible() && typeof renderDutyList === "function") { renderDutyList({ stay: true }); return; }'), 'routeAfterLoad');
  assert.ok(APP.includes('else if (typeof dutyDeepLink === "function" && dutyDeepLink(e.data.url) && loadUser() && dutyVisible() && typeof renderDutyList === "function") renderDutyList({ stay: true });'), '이미 열린 창(from-push)');
  const vis = cutFn(APP, 'function dutyVisible() {');
  assert.ok(vis.includes('if (ministryHiddenOnPlay()) return false;') && vis.includes('if (!u || !u.user_id) return false;') && vis.includes('return dutyOpenCached() || ministryTesterCached();'), '플레이 앱 숨김 · 계정 번호 · 문 또는 시험 참여자');
  // dutyTakeDeepLink — 읽고 duty 만 지운다(다른 파라미터는 둔다) · 알림 주소가 아니면 주소를 건드리지 않는다
  const take = (search) => {
    const calls = [], c = { dutyDeepLink: ctx.dutyDeepLink, URLSearchParams, location: { search, pathname: '/' }, history: { replaceState: (a, b, u) => calls.push(u) } };
    vm.createContext(c); vm.runInContext(cutFn(DUTY_JS, 'function dutyTakeDeepLink() {') + '\nvar out = dutyTakeDeepLink();', c);
    return [c.out, calls];
  };
  assert.deepEqual(take('?duty=1'), [true, ['/']]); assert.deepEqual(take('?duty=1&v=38'), [true, ['/?v=38']]); assert.deepEqual(take('?from=push&duty=1'), [true, ['/?from=push']]);
  assert.deepEqual(take('?v=38'), [false, []]); assert.deepEqual(take(''), [false, []]); assert.deepEqual(take('?duty=2'), [false, []]);
});

test('문 캐시가 뒤처진 기기의 알림 누름 — 평소 길로 간 뒤 문 확인이 끝나 🙋 가 보이면 그때 연다(한 번 · 10초 안 · 첫 화면이 떠 있고 다른 창이 없을 때만)', () => {
  assert.ok(APP.includes('if (_dutyDeep && loadUser()) dutyWantOpen();'), 'routeAfterLoad — 보이지 않아 평소 길로 갈 때 품는다');
  assert.ok(APP.includes('else if (typeof dutyDeepLink === "function" && dutyDeepLink(e.data.url) && loadUser()) { dutyWantOpen(); refreshDutyOpen(); refreshMinistryTester(); }'), '열린 창 — 품고 문을 다시 확인한다');
  assert.ok(cutFn(APP, 'function refreshDutyOpen() {').includes('dutyOpenIfWanted();') && cutFn(APP, 'function refreshMinistryTester() {').includes('dutyOpenIfWanted();'), '두 문 확인의 답에서 본다');
  const seg = APP.slice(APP.indexOf('var _dutyWantAt = 0;'), APP.indexOf('\n}\n', APP.indexOf('function dutyOpenIfWanted() {')) + 2);
  const mk = (o) => {
    let t = 1.7e12, opened = 0;
    const s = { visible: false, home: true, modal: false, ...(o || {}) };
    const c = { Date: { now: () => t }, dutyVisible: () => s.visible, renderDutyList: () => { opened++; },
      document: { getElementById: (id) => (id === 'go-list' ? (s.home ? {} : null) : id === 'app-modal' ? (s.modal ? {} : null) : null) } };
    vm.createContext(c); vm.runInContext(seg, c);
    return { c, s, tick: (ms) => { t += ms; }, opened: () => opened };
  };
  let w = mk({ visible: true }); w.c.dutyOpenIfWanted(); assert.equal(w.opened(), 0, '알림으로 온 것이 아니면 열지 않는다');
  w = mk(); w.c.dutyWantOpen(); w.c.dutyOpenIfWanted(); assert.equal(w.opened(), 0, '아직 안 보인다');
  w.s.visible = true; w.c.dutyOpenIfWanted(); assert.equal(w.opened(), 1, '보이게 되면 연다'); w.c.dutyOpenIfWanted(); assert.equal(w.opened(), 1, '한 번만');
  w = mk({ visible: true, home: false }); w.c.dutyWantOpen(); w.c.dutyOpenIfWanted(); assert.equal(w.opened(), 0, '첫 화면을 떠났으면 끌고 가지 않는다');
  w.s.home = true; w.c.dutyOpenIfWanted(); assert.equal(w.opened(), 1, '(10초 안에 첫 화면이면 연다)');
  w = mk({ visible: true, modal: true }); w.c.dutyWantOpen(); w.c.dutyOpenIfWanted(); assert.equal(w.opened(), 0, '다른 창이 떠 있으면 열지 않는다');
  w = mk(); w.c.dutyWantOpen(); w.tick(10001); w.s.visible = true; w.c.dutyOpenIfWanted(); assert.equal(w.opened(), 0, '10초가 지나면 버린다'); w.c.dutyOpenIfWanted(); assert.equal(w.opened(), 0);
});

test('서비스워커 — 알림을 누르면 앱 창에만 알리고 앞으로 올린다 · 앱 창이 없으면(다른 쪽만 떠 있어도) 그 주소를 새로 연다', async () => {
  const runSw = (urls, data) => {
    const L = {}, log = [];
    const self_ = { addEventListener: (t, f) => { L[t] = f; }, skipWaiting() {}, registration: { scope: 'https://gocheok.onlybible.kr/', showNotification() {} },
      clients: { claim() {}, openWindow: async (u) => { log.push('open ' + u); },
        matchAll: async () => urls.map((u) => ({ url: u, focus: async () => { log.push('focus ' + u); }, postMessage: (m) => { log.push('msg ' + u + ' ← ' + m.type + ' ' + m.url); } })) } };
    const c = { self: self_, URL, Promise }; vm.createContext(c); vm.runInContext(SW, c);
    let p; L.notificationclick({ notification: { close() {}, data }, waitUntil: (x) => { p = x; } });
    return p.then(() => log);
  };
  const D = { url: 'https://gocheok.onlybible.kr/?duty=1' }, R = 'https://gocheok.onlybible.kr/';
  assert.deepEqual(await runSw([R + 'privacy/', R], D), ['msg ' + R + ' ← from-push ' + D.url, 'focus ' + R], '다른 쪽이 먼저 잡혀도 앱 창으로');
  assert.deepEqual(await runSw([R + '?v=38'], D), ['msg ' + R + '?v=38 ← from-push ' + D.url, 'focus ' + R + '?v=38']);
  assert.deepEqual(await runSw([R + 'index.html'], D), ['msg ' + R + 'index.html ← from-push ' + D.url, 'focus ' + R + 'index.html']);
  for (const other of [[R + 'quiz/'], [R + 'guide/', R + 'admin.html'], []]) assert.deepEqual(await runSw(other, D), ['open ' + D.url + '&from=push'], JSON.stringify(other));
  assert.deepEqual(await runSw([], {}), ['open ./?from=push'], '주소 없는 알림(매일 알림)은 앱 뿌리로');
});

test('웹 푸시 구독의 주인 — 동기화 뒤 지금 계정으로 맞춘다(구독이 있을 때만 · 한 번) · 아이폰 앱 「내 정보 지우기」는 그 계정의 기기 토큰을 지운다', async () => {
  const run = async (o, fn) => {
    const store = { ...(o.store || {}) }, calls = [], alerts = [];
    let user = o.user;
    const c = { console, Promise, Number, String, setTimeout, window: { ...(o.native ? { Capacitor: { isNativePlatform: () => true } } : {}) },
      document: { addEventListener() {}, body: null },
      localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
      navigator: { serviceWorker: { getRegistration: async () => (o.sub === undefined ? null : { pushManager: { getSubscription: async () => o.sub } }) } },
      loadUser: () => user, appAlert: (m) => { alerts.push(m); },
      api: { savePush: async (uid, sub, hour) => { calls.push(['savePush', uid, sub.endpoint, hour]); if (o.swapUser) user = o.swapUser; return o.saveRes || { ok: true, hour }; },
        removePush: async (ep) => { calls.push(['removePush', ep]); return { ok: true }; }, removeIosPush: async (uid) => { calls.push(['removeIosPush', uid]); return { ok: true }; } } };
    vm.createContext(c); vm.runInContext(PUSH, c);
    const out = await fn(c);
    return { out, store, calls, alerts };
  };
  const SUB = { endpoint: 'E1', toJSON: () => ({ endpoint: 'E1' }), unsubscribe: async () => true }, A = { name: '가', user_id: 'U-A' }, B = { name: '나', user_id: 'U-B' };
  let r = await run({ user: B, sub: SUB, store: { 'push-owner': 'U-A', pushHour: '5' } }, (c) => c.syncPushOwner());
  assert.deepEqual([r.out, r.calls, r.store['push-owner']], [true, [['savePush', 'U-B', 'E1', 5]], 'U-B'], '신원이 바뀐 기기 — 지금 계정으로 다시 저장(시각은 이 기기의 것)');
  r = await run({ user: B, sub: SUB, store: { 'push-owner': 'U-B' } }, (c) => c.syncPushOwner());
  assert.deepEqual([r.out, r.calls], [false, []], '이미 이 계정이면 부르지 않는다');
  r = await run({ user: B, sub: SUB }, (c) => c.syncPushOwner());
  assert.deepEqual([r.out, r.calls.length, r.store['push-owner']], [true, 1, 'U-B'], '표식이 없는 기기(이 판 전에 켠 구독)는 한 번 맞춘다');
  r = await run({ user: B, sub: null }, (c) => c.syncPushOwner()); assert.deepEqual([r.out, r.calls], [false, []], '구독이 없으면 아무것도 하지 않는다(권한을 묻지도 않는다)');
  r = await run({ user: B }, (c) => c.syncPushOwner()); assert.deepEqual([r.out, r.calls], [false, []], '서비스워커 등록이 없다');
  r = await run({ user: { name: '나' }, sub: SUB }, (c) => c.syncPushOwner()); assert.deepEqual([r.out, r.calls], [false, []], '계정 번호를 받기 전');
  r = await run({ user: B, sub: SUB, saveRes: { ok: false } }, (c) => c.syncPushOwner()); assert.deepEqual([r.out, r.store['push-owner']], [false, undefined], '저장이 안 됐으면 표식을 남기지 않는다');
  r = await run({ user: B, sub: SUB, swapUser: A }, (c) => c.syncPushOwner()); assert.deepEqual([r.out, r.store['push-owner']], [false, undefined], '저장하는 사이 사람이 바뀌었으면 표식을 남기지 않는다');
  r = await run({ user: B, sub: SUB, native: true }, (c) => c.syncPushOwner()); assert.deepEqual([r.out, r.calls], [false, []], '아이폰 앱은 껍데기가 맡는다');
  // 알림을 끄면(구독 해제) 표식도 지운다 · 아이폰 앱의 조용한 끄기(내 정보 지우기)는 그 계정의 토큰을 서버에서 지운다 · 조용하지 않으면 안내만
  r = await run({ user: B, sub: SUB, store: { 'push-owner': 'U-B' } }, (c) => c.disablePush(true));
  assert.deepEqual([r.calls, r.store['push-owner'], r.alerts.length], [[['removePush', 'E1']], undefined, 0]);
  r = await run({ user: B, native: true }, (c) => c.disablePush(true)); assert.deepEqual([r.calls, r.alerts.length], [[['removeIosPush', 'U-B']], 0]);
  r = await run({ user: B, native: true }, (c) => c.disablePush(false)); assert.deepEqual([r.calls, r.alerts.length], [[], 1]);
  r = await run({ user: null, native: true }, (c) => c.disablePush(true)); assert.deepEqual(r.calls, [], '로그인한 분이 없으면 부르지 않는다');
  // 배선: 동기화 뒤에 부른다(app.js enterAfterLogin) · 화면 api · 서버 액션(계정 번호 꼴만 · 그 계정의 토큰만)
  const enter = APP.slice(APP.indexOf('async function enterAfterLogin(opts) {'), APP.indexOf('\n}\n', APP.indexOf('async function enterAfterLogin(opts) {')));
  assert.ok(enter.indexOf('if (typeof syncPushOwner === "function") syncPushOwner();') > enter.indexOf('await syncProgress();'), '계정 번호가 정해진 뒤에');
  assert.ok(read(['js', 'api.js']).includes('removeIosPush: (user_id) => supaCall("removeIosPush", { user_id }),'));
  const rm = fn('removeIosPush');
  assert.ok(rm.includes('const userId = eduUid(b.user_id);') && rm.includes('if (!userId) return { ok: false, error: "no-user" };') && rm.includes('db.from("ios_push_tokens").delete().eq("user_id", userId)'));
  assert.ok(API.includes('case "removeIosPush": return json(await removeIosPush(body));'));
});

test('배포 직후의 새로고침(ensureFreshBuild) — 알림·딥링크 주소를 잃지 않게 처음 주소로 다시 연다(from=push 는 빼고)', async () => {
  const a = APP.indexOf('(function ensureFreshBuild() {'), seg = APP.slice(a, APP.indexOf('})();', a) + 5);
  const fresh = async (href0, hrefLater, src) => {
    const log = [], loc = { href: href0, reload() { log.push('reload'); }, replace(u) { log.push('replace ' + u); } };
    const c = { APP_BUILD: 'OLD', URL, Promise, document: { querySelector: () => ({ src: src || 'https://x/app.js?v=NEW' }) }, sessionStorage: { getItem: () => null, setItem() {} },
      fetch: async () => ({}), window: {}, location: loc };
    vm.createContext(c); vm.runInContext(seg, c); loc.href = hrefLater;
    await new Promise((r) => setTimeout(r, 20));
    return log;
  };
  assert.deepEqual(await fresh('https://x/?duty=1&from=push', 'https://x/'), ['replace https://x/?duty=1'], '앱이 주소를 정리한 뒤에 와도 당번 알림 주소로');
  assert.deepEqual(await fresh('https://x/?edu=abc#top', 'https://x/'), ['replace https://x/?edu=abc']);
  assert.deepEqual(await fresh('https://x/?v=38', 'https://x/?v=38'), ['reload'], '주소가 그대로면 그냥 다시 받는다');
  assert.deepEqual(await fresh('https://x/', 'https://x/'), ['reload']);
  assert.deepEqual(await fresh('https://x/?from=push', 'https://x/'), ['reload'], '알림 표식뿐이었으면 그냥 다시 받는다(두 번 세지 않는다)');
  assert.deepEqual(await fresh('https://x/?duty=1', 'https://x/', 'https://x/app.js?v=OLD'), [], '번호가 같으면 아무것도 하지 않는다');
  // 고침 검토 반영(2026-10-07) — 다시 받기가 앱의 주소 읽기보다 먼저 끝난 차례: 표식이 아직 주소에 있다 → 그대로 다시 받는다(새로 뜬 실행이 한 번 센다 · 딥링크도 그대로)
  for (const u of ['https://x/?from=push', 'https://x/?duty=1&from=push', 'https://x/?v=38&lang=en&from=push', 'https://x/?edu=abc&from=push#top']) assert.deepEqual(await fresh(u, u), ['reload'], u);
  assert.deepEqual(await fresh('https://x/?from=push&duty=1', 'https://x/?duty=1'), ['reload'], '표식만 읽힌 사이(처음 주소와 같다)');
  assert.deepEqual(await fresh('https://x/?v=38&from=push', 'https://x/'), ['replace https://x/?v=38'], '읽고 지운 뒤에는 표식 없는 처음 주소로(두 번 세지 않는다)');
});

// ── 고침의 독립 검토 반영(2026-10-07) — 셈·스위치·흔적·monitor 는 값으로, 앱 배선은 진짜 함수를 가짜 환경에서 ──
test('api 알림 — dutyNoteTally: 받는 분마다 「자기 기기 가운데 하나라도 받아들여졌나」로 센다(같은 글 묶음 안의 죽은 기기)', () => {
  const a1 = { id: 1 }, b1 = { id: 2 }, b2 = { id: 3 }, i1 = { id: 1 }, e1 = { id: 9 };   // 웹 구독 1번(A)과 아이폰 줄 1번(C)은 다른 줄이다(번호가 같아도)
  const devs = new Map([['A', { web: [a1], ios: [] }], ['B', { web: [b1, b2], ios: [] }], ['C', { web: [], ios: [i1] }], ['D', { web: [], ios: [] }], ['E', { web: [e1], ios: [] }]]);
  const tally = (uids, okWeb, okIos) => pick(srv.dutyNoteTally(uids, devs, okWeb, okIos));
  assert.deepEqual(tally(['A', 'B'], [a1], []), { sent: 1, missed: 1 }, '같은 글 두 분 · 한 분의 기기만 받아들여졌다(묶음으로 세면 2·0 이 된다)');
  assert.deepEqual(tally(['A', 'B'], [a1, b2], []), { sent: 2, missed: 0 }, '기기 둘 가운데 하나면 받은 분');
  assert.deepEqual(tally(['A', 'B', 'C', 'D', 'E'], [a1], []), { sent: 1, missed: 4 }, '통째 쉼 다섯 분 · 한 분만 받았다');
  assert.deepEqual(tally(['A', 'C'], [], [i1]), { sent: 1, missed: 1 }, '아이폰 줄이 받아들여졌다고 번호가 같은 웹 구독의 주인이 받은 것이 아니다');
  assert.deepEqual(tally(['A', 'C'], [a1], []), { sent: 1, missed: 1 }, '그 반대도');
  assert.deepEqual(tally(['C'], [], [{ id: 1 }]), { sent: 0, missed: 1 }, '보낸 그 객체로 견준다(번호만 같은 다른 객체는 아니다)');
  assert.deepEqual(tally(['D', 'Z'], [a1], [i1]), { sent: 0, missed: 2 }, '기기가 없는 분 · 기기 표에 없는 분');
  assert.deepEqual(tally(['A', 'B'], null, undefined), { sent: 0, missed: 2 }, '보내다 던졌으면 모두 가지 않은 것으로');
  assert.deepEqual(tally([], [a1], []), { sent: 0, missed: 0 }); assert.deepEqual(pick(srv.dutyNoteTally(['A'], null, [a1], [])), { sent: 0, missed: 1 }, '기기 표가 없다');
});

test('api 알림 — 두 스위치(dutyGateOf)·「그런 함수가 없다」(dutyNoFn): true 하나일 때만 · 문과 끄기를 뒤바꾸지 않는다', () => {
  const g = (rows) => pick(srv.dutyGateOf(rows));
  assert.deepEqual(g([{ key: 'dutyOpen', value: true }]), { open: true, off: false }, '문만');
  assert.deepEqual(g([{ key: 'dutyNotifyOff', value: true }]), { open: false, off: true }, '끄기만');
  assert.deepEqual(g([{ key: 'dutyOpen', value: true }, { key: 'dutyNotifyOff', value: true }]), { open: true, off: true });
  for (const v of ['true', 1, { on: true }, null, false, 'TRUE']) assert.deepEqual(g([{ key: 'dutyOpen', value: v }, { key: 'dutyNotifyOff', value: v }]), { open: false, off: false }, JSON.stringify(v));
  assert.deepEqual(g([]), { open: false, off: false }); assert.deepEqual(g(null), { open: false, off: false }); assert.deepEqual(g([null, { key: 'eduOpen', value: true }]), { open: false, off: false });
  assert.equal(srv.dutyNoFn({ code: 'PGRST202' }), true); assert.equal(srv.dutyNoFn({ code: '42883' }), true);
  for (const e of [{ code: '23505' }, { code: 'PGRST301' }, { message: 'PGRST202' }, null, 'PGRST202', {}, { code: null }]) assert.equal(srv.dutyNoFn(e), false, JSON.stringify(e));
});

test('api 알림 — 전날 알림 흔적(dutyRemindTrace): 같은 날의 둘째 부름이 첫 부름의 결과를 0·0 으로 덮지 않는다 · 꺼 둔 부름은 off·held', () => {
  const T = (prev, now) => pick(srv.dutyRemindTrace(prev, now));
  const first = T(null, { at: '2026-10-10T10:00:01.000Z', day: '2026-10-11', rows: 3, sent: 2, missed: 1, off: false });
  assert.deepEqual(first, { at: '2026-10-10T10:00:01.000Z', day: '2026-10-11', rows: 3, sent: 2, missed: 1, runs: 1 });
  const second = T(first, { at: '2026-10-10T10:20:01.000Z', day: '2026-10-11', rows: 3, sent: 0, missed: 0, off: false });
  assert.deepEqual(second, { at: '2026-10-10T10:20:01.000Z', day: '2026-10-11', rows: 3, sent: 2, missed: 1, runs: 2 }, 'at 은 마지막으로 돈 때 · 수는 더한다');
  assert.deepEqual(T(second, { at: '2026-10-11T10:00:01.000Z', day: '2026-10-12', rows: 0, sent: 0, missed: 0 }), { at: '2026-10-11T10:00:01.000Z', day: '2026-10-12', rows: 0, sent: 0, missed: 0, runs: 1 }, '날이 바뀌면 새로');
  assert.deepEqual(T({ at: 'x', day: '2026-10-11', rows: 3, sent: 2, missed: 1 }, { at: 'y', day: '2026-10-11', rows: 3, sent: 0, missed: 0 }), { at: 'y', day: '2026-10-11', rows: 3, sent: 2, missed: 1, runs: 2 }, '옛 흔적(runs 없음)은 한 번 돈 것으로');
  assert.deepEqual(T(first, { at: 'z', day: '2026-10-11', rows: 3, sent: 0, missed: 0, off: true, held: 2 }), { at: 'z', day: '2026-10-11', rows: 3, sent: 2, missed: 1, runs: 2, off: true, held: 2 });
  assert.deepEqual(T(null, { at: 'z', day: '2026-10-11', rows: 3, sent: 0, missed: 0, off: true }), { at: 'z', day: '2026-10-11', rows: 3, sent: 0, missed: 0, runs: 1, off: true }, 'held 를 못 읽었으면 싣지 않는다');
  assert.deepEqual(T({ off: true, held: 5, day: '2026-10-11', sent: 0, missed: 0, runs: 1 }, { at: 'k', day: '2026-10-11', rows: 3, sent: 3, missed: 0, off: false, held: undefined }),
    { at: 'k', day: '2026-10-11', rows: 3, sent: 3, missed: 0, runs: 2 }, '켠 뒤의 부름은 off·held 를 남기지 않는다');
  for (const junk of ['x', 3, [], { day: null }]) assert.equal(T(junk, { at: 'a', day: '2026-10-11', rows: 1, sent: 1, missed: 0 }).runs, 1, JSON.stringify(junk));
  assert.deepEqual(T({ day: '2026-10-11', sent: -4, missed: 'x', runs: 0 }, { at: 'a', day: '2026-10-11', rows: 1.9, sent: 1, missed: 0 }), { at: 'a', day: '2026-10-11', rows: 1, sent: 1, missed: 0, runs: 2 }, '틀린 수는 0 으로');
});

test('monitor — 봉사 당번 알림(dutyRemindProblems): 흔적이 생긴 뒤부터 26시간 · 꺼 둔 채면 아침마다 한 줄', () => {
  const NOW = Date.parse('2026-10-11T22:12:00Z'), H = 3600000;
  const at = (h) => new Date(NOW - h * H).toISOString();
  const Q = (v, off) => pick(srv.dutyRemindProblems(v, NOW, off));
  assert.deepEqual(Q(null, false), [], '흔적이 없으면 조용(크론을 안 건 곳)'); assert.deepEqual(Q(undefined, false), []); assert.deepEqual(Q({}, false), []);
  assert.deepEqual(Q({ at: at(12), day: 'd', rows: 2 }, false), [], '12시간 — 조용'); assert.deepEqual(Q({ at: at(25.9) }, false), [], '26시간 안');
  const late = Q({ at: at(30) }, false);
  assert.equal(late.length, 1); assert.ok(late[0].startsWith('봉사 당번 전날 알림이 30시간째 돌지 않았습니다') && late[0].includes('duty-remind') && late[0].includes('edu_remind_service_key'), late[0]);
  for (const bad of ['어제', '', 12345, null, 'not-a-date']) assert.deepEqual(Q({ at: bad }, false), [], '날짜로 읽히지 않는 at 은 없는 것으로: ' + String(bad));
  const off = Q({ at: at(1), off: true, held: 3 }, true);
  assert.equal(off.length, 1); assert.ok(off[0].startsWith('봉사 당번 앱 알림이 꺼져 있습니다(app_config dutyNotifyOff)') && off[0].includes('3분께 가지 않음') && off[0].includes('지우세요'), off[0]);
  assert.equal(Q({ at: at(1), off: true, held: 0 }, true)[0].includes('가지 않음'), false, '가지 못한 분이 없으면 수를 말하지 않는다');
  assert.equal(Q({ at: at(1), held: 3 }, true)[0].includes('가지 않음'), false, '마지막 부름이 꺼 둔 채가 아니었으면 그 수는 낡았다');
  assert.equal(Q(null, true).length, 1, '흔적이 없어도 꺼 둔 것은 말한다'); assert.equal(Q({ at: at(40) }, true).length, 2, '둘 다');
  for (const v of ['true', 1, null, undefined]) assert.deepEqual(Q({ at: at(1) }, v), [], '스위치는 true 하나일 때만: ' + String(v));
  // monitor 가 그 함수를 쓴다(끄는 스위치도 함께 읽는다) · 전날 알림이 흔적을 그 꼴로 쓴다 · 쓰기 오류를 삼키지 않는다
  const mon = fn('monitor');
  assert.ok(mon.includes('.in("key", ["dutyRemindRun", "dutyNotifyOff"])') && mon.includes('const off = dutyGateOf(dc).off;') && mon.includes('for (const p of dutyRemindProblems(v, now.getTime(), off)) problems.push(p);'));
  const rem = fn('internalDutyRemind');
  assert.ok(rem.includes('const value = dutyRemindTrace(was?.value, { at, day, rows: ids.length, sent: n.sent, missed: n.missed, off: n.off === true, held: n.held });'));
  assert.ok(rem.includes('.upsert({ key: "dutyRemindRun", value, updated_at: at })') && rem.includes('if (te) console.error("dutyRemindRun"'), '흔적 쓰기 오류를 본다');
});

test('문 확인의 답 → 캐시 → 🙋 보임 → 당번 목록 — 진짜 함수들을 가짜 저장소·api 위에서(캐시를 쓴 뒤에 본다 · 한 번 · {stay:true})', async () => {
  const seg = [
    APP.slice(APP.indexOf('const DUTY_PUB_KEY = "duty-open";'), APP.indexOf('\n}\n', APP.indexOf('function dutyVisible() {')) + 2),
    APP.slice(APP.indexOf('const MIN_TESTER_KEY = "ministry-tester::";'), APP.indexOf('\n}\n', APP.indexOf('function refreshMinistryTester() {')) + 2),
  ].join('\n');
  for (const name of ['function refreshDutyOpen() {', 'function dutyOpenIfWanted() {', 'function dutyVisible() {', 'function ministryTesterCached() {', 'function refreshMinistryTester() {']) assert.ok(seg.includes(name), name);
  const mk = (o) => {
    const x = o || {}, store = { ...(x.store || {}) }, opened = [], drawn = [], pend = {};
    let t = 1.7e12;
    const user = x.user === undefined ? { name: '가', user_id: 'U1' } : x.user;
    const later = (name) => new Promise((res) => { pend[name] = res; });
    const c = { console, Promise, JSON, Date: { now: () => t },
      localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
      loadUser: () => user, ministryHiddenOnPlay: () => !!x.play,
      document: { getElementById: (id) => (id === 'go-list' && !opened.length ? {} : null), querySelector: () => (opened.length ? null : {}) },
      renderDutyList: (a) => { opened.push(a); }, renderSummary: () => { drawn.push(1); }, refreshEventOpen: () => {},
      api: { getConfig: (k) => later('cfg:' + k), ministryTester: (uid) => later('tester:' + uid) } };
    c.window = c;
    vm.createContext(c); vm.runInContext(seg, c);
    const settle = () => new Promise((r) => setTimeout(r, 0));
    return { c, store, opened, drawn, pend, tick: (ms) => { t += ms; }, answer: async (name, v) => { assert.ok(pend[name], name + ' 을 부르지 않았다'); pend[name](v); await settle(); await settle(); } };
  };
  const OPEN = { ok: true, value: true }, SHUT = { ok: true, value: null }, IN = { ok: true, tester: true }, OUT = { ok: true, tester: false };
  // ① 문은 닫힘 · 새로 명단에 오른 시험 참여자(지금 운영의 길) — 문 답이 먼저 와도, 시험 참여자 답이 캐시에 적힌 뒤에 열린다
  let w = mk(); w.c.dutyWantOpen(); w.c.refreshDutyOpen(); w.c.refreshMinistryTester();
  await w.answer('cfg:dutyOpen', SHUT); assert.deepEqual(w.opened, [], '문만으로는 안 보인다'); assert.equal(w.store['duty-open'], '0');
  await w.answer('tester:U1', IN);
  assert.deepEqual(pick(w.opened), [{ stay: true }], '시험 참여자 답 뒤에 한 번 · 머무는 꼴로'); assert.equal(w.store['ministry-tester::U1'], '1'); assert.deepEqual(w.drawn, [], '열었으면 첫 화면을 다시 그리지 않는다');
  // ② 답이 거꾸로 와도 한 번
  w = mk(); w.c.dutyWantOpen(); w.c.refreshDutyOpen(); w.c.refreshMinistryTester();
  await w.answer('tester:U1', IN); assert.equal(w.opened.length, 1); await w.answer('cfg:dutyOpen', SHUT); assert.equal(w.opened.length, 1, '두 번 열지 않는다');
  // ③ 문이 열렸는데 이 기기의 캐시만 닫힘 — 문 답이 캐시에 적힌 뒤에 열린다
  w = mk({ store: { 'duty-open': '0' } }); w.c.dutyWantOpen(); w.c.refreshDutyOpen(); w.c.refreshMinistryTester();
  await w.answer('cfg:dutyOpen', OPEN); assert.deepEqual(pick(w.opened), [{ stay: true }]); assert.equal(w.store['duty-open'], '1');
  await w.answer('tester:U1', OUT); assert.equal(w.opened.length, 1);
  // ④ 서버도 닫힘·시험 참여자도 아님 / 플레이 앱 / 계정 번호 없음 / 10초 뒤 / 알림으로 온 것이 아님 — 열지 않는다
  w = mk(); w.c.dutyWantOpen(); w.c.refreshDutyOpen(); w.c.refreshMinistryTester(); await w.answer('cfg:dutyOpen', SHUT); await w.answer('tester:U1', OUT); assert.deepEqual(w.opened, []);
  w = mk({ play: true }); w.c.dutyWantOpen(); w.c.refreshDutyOpen(); w.c.refreshMinistryTester(); await w.answer('cfg:dutyOpen', OPEN); await w.answer('tester:U1', IN); assert.deepEqual(w.opened, [], '플레이 앱(숨김)');
  w = mk({ user: { name: '가' } }); w.c.dutyWantOpen(); w.c.refreshDutyOpen(); w.c.refreshMinistryTester(); assert.equal(w.pend['tester:undefined'], undefined, '계정 번호가 없으면 시험 참여자를 묻지 않는다');
  await w.answer('cfg:dutyOpen', OPEN); assert.deepEqual(w.opened, [], '계정 번호를 받기 전');
  w = mk(); w.c.dutyWantOpen(); w.c.refreshDutyOpen(); w.tick(10001); await w.answer('cfg:dutyOpen', OPEN); assert.deepEqual(w.opened, [], '10초가 지났다');
  w = mk(); w.c.refreshDutyOpen(); w.c.refreshMinistryTester(); await w.answer('cfg:dutyOpen', OPEN); await w.answer('tester:U1', IN); assert.deepEqual(w.opened, [], '평소 실행은 저절로 당번 화면으로 가지 않는다');
  assert.equal(w.drawn.length, 1, '(시험 참여자 값이 바뀌면 첫 화면은 다시 그린다)');
  // ⑤ 답이 틀린 꼴이면 캐시를 건드리지 않는다
  w = mk(); w.c.dutyWantOpen(); w.c.refreshMinistryTester(); await w.answer('tester:U1', { ok: false }); assert.deepEqual([w.opened.length, w.store['ministry-tester::U1']], [0, undefined]);
});

test('서비스워커 — 앱 창은 범위의 뿌리(또는 그 index.html)뿐: 하위 경로에 둔 사이트 · 다른 폴더의 index.html', async () => {
  const runSw = (scope, urls, data) => {
    const L = {}, log = [];
    const self_ = { addEventListener: (t, f) => { L[t] = f; }, skipWaiting() {}, registration: { scope, showNotification() {} },
      clients: { claim() {}, openWindow: async (u) => { log.push('open ' + u); },
        matchAll: async () => urls.map((u) => ({ url: u, focus: async () => { log.push('focus ' + u); }, postMessage: (m) => { log.push('msg ' + u + ' ← ' + m.type + ' ' + m.url); } })) } };
    const c = { self: self_, URL, Promise }; vm.createContext(c); vm.runInContext(SW, c);
    let p; L.notificationclick({ notification: { close() {}, data }, waitUntil: (x) => { p = x; } });
    return p.then(() => log);
  };
  const D = { url: 'https://gocheok.onlybible.kr/?duty=1' }, G = 'https://x.github.io/app/', R = 'https://gocheok.onlybible.kr/', NEW = ['open ' + D.url + '&from=push'];
  assert.deepEqual(await runSw(G, [G + '?v=38'], D), ['msg ' + G + '?v=38 ← from-push ' + D.url, 'focus ' + G + '?v=38'], '하위 경로에 둔 사이트의 앱 창');
  assert.deepEqual(await runSw(G, ['https://x.github.io/'], D), NEW, '도메인 뿌리는 이 앱의 창이 아니다');
  assert.deepEqual(await runSw(G, [G + 'privacy/index.html', G + 'guide/'], D), NEW, '다른 폴더의 index.html 은 앱 창이 아니다');
  assert.deepEqual(await runSw(R, [R + 'privacy/index.html', R + 'quiz/index.html'], D), NEW);
  assert.deepEqual(await runSw(R, [R + 'index.html?v=3#x'], D), ['msg ' + R + 'index.html?v=3#x ← from-push ' + D.url, 'focus ' + R + 'index.html?v=3#x']);
});

test('아이폰 앱 「내 정보 지우기」 — 토큰을 못 지웠으면 삼키지 않는다(지우기 전에 묻고 · 끝낸 말도 사실대로) · 다른 아이폰도 꺼진다고 말한다 · 웹은 그대로', async () => {
  // js/push.js disablePush(true) — 돌려주는 것 = 이 기기의 알림이 꺼졌나
  const pushCtx = (o) => {
    const calls = [];
    let n = 0;
    const c = { console, Promise, Number, String, setTimeout, window: o.native ? { Capacitor: { isNativePlatform: () => true } } : {}, document: { addEventListener() {}, body: null },
      localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, navigator: {}, loadUser: () => o.user, appAlert: () => {},
      api: { removeIosPush: async (uid) => { calls.push(uid); const r = (o.answers || [])[n++]; if (r === 'throw') throw new Error('net'); return r === undefined ? { ok: true } : r; } } };
    if (o.noApi) delete c.api;                       // 선언조차 없다(맨이름으로 읽으면 ReferenceError)
    if (o.oldApi) c.api = { removePush: async () => ({ ok: true }) };
    vm.createContext(c); vm.runInContext(PUSH, c);
    return { c, calls };
  };
  const U = { name: '가', user_id: 'U-A' };
  let q = pushCtx({ native: true, user: U }); assert.equal(await q.c.disablePush(true), true, '서버가 지웠다'); assert.deepEqual(q.calls, ['U-A']);
  q = pushCtx({ native: true, user: U, answers: ['throw', { ok: true }] }); assert.equal(await q.c.disablePush(true), true, '한 번 더 해 본다'); assert.equal(q.calls.length, 2);
  q = pushCtx({ native: true, user: U, answers: ['throw', 'throw'] }); assert.equal(await q.c.disablePush(true), false, '두 번 다 실패 — 거짓(삼키지 않는다)'); assert.equal(q.calls.length, 2);
  q = pushCtx({ native: true, user: U, answers: [{ ok: false, error: 'no-user' }, { ok: false }] }); assert.equal(await q.c.disablePush(true), false, '서버가 거절해도 거짓');
  q = pushCtx({ native: true, user: { name: '가' } }); assert.equal(await q.c.disablePush(true), true, '계정 번호를 받기 전 — 지울 줄이 없다'); assert.deepEqual(q.calls, []);
  q = pushCtx({ native: true, user: null }); assert.equal(await q.c.disablePush(true), true); assert.deepEqual(q.calls, []);
  // 회귀 확인 반영(2026-10-07) — js/api.js 가 실리지 않은 실행(api 가 선언조차 없다): 던지지 않고 거짓(→ 「알림을 끄지 못했어요 — 그래도 지우기」 창 · 정보는 지울 수 있다)
  //   계정 번호가 없으면 그 전에 참(지울 줄이 없다) · api 는 있는데 그 길만 없는 옛 api.js 는 예전처럼 참
  q = pushCtx({ native: true, user: U, noApi: true }); assert.equal(await q.c.disablePush(true), false, 'api.js 가 안 실렸다 — 못 지운 것(던지지 않는다)');
  q = pushCtx({ native: true, user: { name: '가' }, noApi: true }); assert.equal(await q.c.disablePush(true), true, 'api 가 없어도 계정 번호가 없으면 지울 줄이 없다');
  q = pushCtx({ native: true, user: U, oldApi: true }); assert.equal(await q.c.disablePush(true), true, '옛 api.js(그 길이 없다) — 예전처럼 참'); assert.deepEqual(q.calls, []);
  // app.js clearMeOnThisDevice — 진짜 함수를 가짜 창·가짜 끄기로
  const clearSeg = cutFn(APP, 'async function clearMeOnThisDevice() {');
  const runClear = async (o) => {
    const log = [], answers = [...(o.confirms || [])];
    const c = { Promise, loadUser: () => ({ name: '가' }), userLabel: () => '가', isNativeApp: () => !!o.native,
      appConfirm: async (msg, opts) => { log.push(['confirm:' + opts.title, msg, opts]); return answers.length ? answers.shift() : true; },
      appAlert: async (msg) => { log.push(['alert', msg]); }, disablePush: async (silent) => { log.push(['disablePush', silent]); return o.off; },
      clearPersonalData: () => { log.push(['clear']); }, stopSpeaking: () => {}, renderEntryScreen: () => { log.push(['entry']); } };
    vm.createContext(c); vm.runInContext(clearSeg + '\nvar done = clearMeOnThisDevice();', c);
    await c.done;
    return log;
  };
  const names = (log) => log.map((x) => x[0]), ASK = 'confirm:🚪 내 정보 지우기', FAIL = 'confirm:🔔 알림을 끄지 못했어요';
  let L = await runClear({ native: false, off: undefined });   // 웹·안드로이드 — 예전 그대로(disablePush 는 값을 주지 않는다)
  assert.deepEqual(names(L), [ASK, 'disablePush', 'clear', 'alert', 'entry']); assert.equal(L[1][1], true, '조용한 끄기');
  assert.ok(L[0][1].includes('이 기기의 알림도 함께 꺼집니다.')); assert.equal(L[0][1].includes('다른 아이폰'), false, '웹·안드로이드에 보이는 문장은 그대로'); assert.equal(L[3][1].includes('끄지 못했어요'), false);
  L = await runClear({ native: true, off: true });
  assert.deepEqual(names(L), [ASK, 'disablePush', 'clear', 'alert', 'entry']);
  assert.ok(L[0][1].includes('같은 이름으로 쓰시는 다른 아이폰의 알림도, 그 폰에서 앱을 다시 여실 때까지 꺼져요.'), '아이폰 앱에서만 한 줄 더'); assert.equal(L[3][1].includes('끄지 못했어요'), false);
  L = await runClear({ native: true, off: false, confirms: [true, false] });
  assert.deepEqual(names(L), [ASK, 'disablePush', FAIL], '못 껐으면 지우기 전에 묻는다 — 취소하면 아무것도 지우지 않는다');
  assert.ok(L[2][1].includes('알림을 끄지 못했어요') && L[2][1].includes('계속 올 수 있어요') && L[2][2].okText === '그래도 지우기');
  // 독립 검토 반영(2026-10-07) — 이 창은 「지금 통신이 안 된다」와 「앱을 켤 때 api.js 가 안 실렸다」 둘에 함께 쓴다. 뒤의 경우에는 다시 눌러도 통신을 시도조차 하지 않으므로
  //   「잠시 뒤 다시」만 권하면 헛돈다 — 「앱을 완전히 닫았다 다시 열어 주세요」도 적는다.
  //   올리기 전 확인 반영: 그 구절은 **통신이 되는데도 계속 뜰 때**의 처방으로만 · 두 길(잠시 뒤 다시 · 그대로 지우고 설정에서 끄기) **뒤에** 적는다 — 통신이 끊긴 채 앱을 닫으면
  //   아이폰 앱은 다시 뜨지 않아 「그래도 지우기」 길까지 잃는다(조건 없이 「그래도 안 되면 앱을 닫았다 열어 주세요」라고 적었었다).
  const tip = L[2][1], iRetry = tip.indexOf('「취소」를 누르고 잠시 뒤 다시 해 보시거나, 그대로 지우신 뒤 아이폰 설정 → 고척교회 성경암송 → 알림에서 꺼 주세요.');
  const iClose = tip.indexOf('(통신이 되는데도 이 창이 계속 뜨면 앱을 완전히 닫았다 다시 열어 주세요.)');
  assert.ok(iRetry > 0 && iClose > iRetry, '못 껐을 때의 권고 — 두 길이 먼저 · 앱을 닫았다 열기는 조건을 달아 그 뒤에');
  assert.equal(tip.includes('그래도 안 되면 앱을'), false, '조건 없는 「앱을 닫았다 열어 주세요」를 되살리지 않는다');
  assert.equal((tip.match(/앱을 완전히 닫았다/g) || []).length, 1);
  L = await runClear({ native: true, off: false, confirms: [true, true] });
  assert.deepEqual(names(L), [ASK, 'disablePush', FAIL, 'clear', 'alert', 'entry']);
  assert.ok(L[4][1].includes('알림은 끄지 못했어요') && L[4][1].includes('아이폰 설정'), '끝낸 말도 사실대로');
  L = await runClear({ native: true, off: true, confirms: [false] }); assert.deepEqual(names(L), [ASK], '처음에 취소');
  // 차례: 알림 끄기가 정보 지우기보다 먼저다(지운 뒤에는 계정 번호가 없어 토큰을 지울 수 없다)
  const iOff = clearSeg.indexOf('await disablePush(true)'), iClr = clearSeg.indexOf('clearPersonalData();');
  assert.ok(iOff > 0 && iClr > iOff);
  // 서버 액션 — 돌려주는 것은 둘뿐(지운 줄·번호·토큰을 싣지 않는다) · 읽기 스모크가 그 액션이 살아 있는지 본다(아무것도 지우지 않는 부름)
  const rmI = fn('removeIosPush');
  assert.deepEqual((rmI.match(/return \{[^}]*\};/g) || []).sort(), ['return { ok: false, error: "no-user" };', 'return { ok: true };']);
  assert.equal(/\.select\(/.test(rmI), false, '지운 줄을 돌려받지 않는다');
  assert.ok(read(['tests', 'smoke-readonly.sh']).includes('{"action":"removeIosPush"}') && read(['tests', 'smoke-readonly.sh']).includes('"error":"no-user"'));
});
