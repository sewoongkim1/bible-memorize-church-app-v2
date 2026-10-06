// 봉사 당번 화면 흐름 — js/duty.js 전체를 가짜 DOM·가짜 api 위에서 돌린다(서버·브라우저·꾸러미 없음 · preflight 가 건다)
//   순수 함수(문구·판정)는 tests/duty-front.test.cjs. 여기는 「늦게 온 응답」·「다시 받기 실패」·「계정 번호 없음」처럼 차례가 얽힌 것만 본다
//   (2026-10-06 검토에서 한꺼번에 나온 자리들 — 첫 화면으로 간 분이 응답 한 번에 당번 화면으로 도로 끌려오던 것 등).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'duty.js'), 'utf8');
const UID = '00000000-0000-4000-8000-000000000001';

function world(over) {
  const o = over || {};
  const alerts = [], confirms = [], logs = [];
  let wrap = null, now = 1760000000000, entry = 0;
  const mkEl = () => ({ addEventListener(t, f) { this['on_' + t] = f; }, dataset: {}, isConnected: true, disabled: false, classList: { add() {}, remove() {} }, remove() {} });
  let fab = mkEl(), back = mkEl();
  const mkWrap = (h) => ({ _h: h, set innerHTML(v) { this._h = String(v); back = mkEl(); }, get innerHTML() { return this._h; }, querySelectorAll() { return []; }, onclick: null, onkeydown: null });
  const app = {
    _h: '',
    set innerHTML(v) { this._h = String(v); if (this._h.includes('class="duty-wrap"')) { wrap = mkWrap(this._h); fab = mkEl(); } else { wrap = null; } },
    get innerHTML() { return this._h; },
  };
  const listeners = {};
  const pending = [];   // 가짜 api — 부른 차례대로 쌓아 두고 시험이 손으로 답한다
  const call = (name) => (...args) => new Promise((ok, no) => pending.push({ name, args, ok, no }));
  class FakeDate extends Date { static now() { return now; } }
  const answers = (o.confirm || []).slice();   // appConfirm 의 답 차례(없으면 늘 「예」)
  const ctx = {
    console, Promise, Number, String, Object, Math, JSON, Array, isNaN, setTimeout, Date: FakeDate,
    window: { scrollTo() {}, scrollY: 0 },
    document: {
      hidden: false,
      getElementById(id) { return id === 'app' ? app : id === 'duty-home' ? fab : id === 'duty-back' ? back : null; },
      querySelector(sel) {
        if (sel === '.duty-wrap') return wrap;
        if (sel === '.duty-wrap .ev-loading') return wrap && wrap._h.includes('ev-loading') ? {} : null;
        return null;
      },
      addEventListener(t, f) { listeners[t] = f; },
      createElement() { return mkEl(); }, body: { appendChild() {} },
    },
    loadUser: () => (o.user === null ? null : (o.user || { name: '화면점검', type: '교구', gu: '믿음', mok: '99', user_id: UID })),
    homeFabLabel: () => 'FAB', userLines: () => ({ l1: '믿음 99목장', l2: '화면점검 성도님' }),
    renderEntryScreen() { entry++; app.innerHTML = '<div>ENTRY</div>'; },
    renderSummary() { app.innerHTML = '<div class="home">HOME</div>'; },
    logFeature(f) { logs.push(f); }, requestAnimationFrame(f) { f(); },
    appAlert(m) { alerts.push(m); return Promise.resolve(true); },
    appConfirm(m, opt) { confirms.push((opt && opt.title) || m); return Promise.resolve(answers.length ? answers.shift() : true); },
    api: o.api === undefined
      ? { dutyList: call('dutyList'), dutyBoard: call('dutyBoard'), dutyApply: call('dutyApply'), dutyCancel: call('dutyCancel'), dutyAsk: call('dutyAsk') }
      : o.api,
  };
  vm.createContext(ctx); vm.runInContext(SRC, ctx, { filename: 'duty.js' });
  const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };
  const kind = (h) => (h.includes('불러오는 중') ? 'loading' : h.includes('duty-day') || h.includes('지금 보이는 날짜') ? 'board' : h.includes('duty-sec') ? 'list' : 'other');
  const tap = (dataset) => {
    const btn = { dataset, disabled: false, isConnected: true };
    wrap.onclick({ target: { closest: (sel) => (sel === 'button[data-act]' ? btn : null) } });
    return btn;
  };
  return { ctx, alerts, confirms, logs, pending, listeners, settle, tap,
    shown: () => (wrap ? 'DUTY[' + kind(wrap._h) + ']' : app._h.includes('HOME') ? 'HOME' : app._h.includes('ENTRY') ? 'ENTRY' : 'OTHER'),
    html: () => (wrap ? wrap._h : ''), goHome: () => fab.on_click(), goBack: () => back.on_click(),
    answer: async (i, v) => { pending.splice(i, 1)[0].ok(v); await settle(); },
    fail: async (i, code, data) => { const e = new Error(code); if (data) e.data = data; pending.splice(i, 1)[0].no(e); await settle(); },
    tickTime: (ms) => { now += ms; }, entries: () => entry, names: () => pending.map((p) => p.name) };
}
const BOARD = { id: 'b-1', title: '식당 봉사', place: '식당', status: 'open', need: [] };
const SLOT = { id: 11, service: '2부', task: '설거지', start: '11:30', end: '12:30', capacity: 2, off: false, n: 0, names: [], mine: null, why: '' };
const DAY = { date: '2026-10-18', off: false, note: '', locked: false, lockAt: '2026-10-17T10:00:00+00:00', slots: [SLOT] };
const listRes = (boards, mine) => ({ ok: true, open: true, today: '2026-10-06', me: { why: '' }, boards: boards || [BOARD], mine: mine || [] });
const boardRes = (x) => ({ ok: true, open: true, today: '2026-10-06', me: { why: '' }, board: { id: 'b-1', title: '식당 봉사', status: 'open' }, days: [DAY], ...(x || {}) });
const MINE = { id: 5, boardId: 'b-1', board: '식당 봉사', place: '식당', contact: '', date: '2026-10-18', service: '2부', task: '설거지', start: '11:30', end: '12:30',
  status: 'active', byStaff: false, staffAdded: false, off: false, dayOff: false, note: '', locked: false, lockAt: '2026-10-17T10:00:00+00:00', asked: false, why: null, movedFrom: null, overlap: false };
const openBoard = async (w, res) => { w.ctx.renderDutyBoard('b-1'); await w.answer(0, res || boardRes()); };

test('들어가기 — 당번이 하나뿐이고 내 당번이 없으면 목록을 건너뛴다 · 둘이면 목록 · 열람 기록은 한 번', async () => {
  let w = world();
  w.ctx.renderDutyList(); assert.equal(w.shown(), 'DUTY[loading]');
  await w.answer(0, listRes());
  assert.deepEqual(w.names(), ['dutyBoard'], '당번 하나 → 자세히를 받는다');
  await w.answer(0, boardRes()); assert.equal(w.shown(), 'DUTY[board]');
  assert.deepEqual(w.logs, ['duty']);
  w.goBack(); await w.answer(0, listRes()); assert.equal(w.shown(), 'DUTY[list]', '자세히에서 돌아오면 목록에 머문다(다시 건너뛰지 않는다)');
  w = world(); w.ctx.renderDutyList(); await w.answer(0, listRes([BOARD, { ...BOARD, id: 'b-2' }])); assert.equal(w.shown(), 'DUTY[list]');
  w = world(); w.ctx.renderDutyList(); await w.answer(0, listRes([BOARD], [MINE])); assert.equal(w.shown(), 'DUTY[list]', '내 당번이 있으면 목록에 선다');
});

test('늦게 온 응답 — 첫 화면으로 나간 뒤 온 목록 응답이 당번 화면을 다시 띄우지 않는다(당번 하나 건너뛰기 포함)', async () => {
  const w = world();
  w.ctx.renderDutyList(); w.goHome(); assert.equal(w.shown(), 'HOME');
  await w.answer(0, listRes());
  assert.equal(w.shown(), 'HOME'); assert.deepEqual(w.names(), [], '자세히를 받으러 가지도 않는다');
  // 자세히를 받는 중에 나간 경우도
  w.ctx.renderDutyBoard('b-1'); w.goHome(); await w.answer(0, boardRes()); assert.equal(w.shown(), 'HOME');
  // 받는 중 실패가 늦게 와도 첫 화면을 건드리지 않는다
  w.ctx.renderDutyList(); w.goHome(); await w.fail(0, 'Failed to fetch'); assert.equal(w.shown(), 'HOME'); assert.deepEqual(w.alerts, []);
});

test('늦게 온 응답 — 지원을 보낸 뒤 첫 화면으로 나갔으면 응답이 화면을 도로 끌어오지 않는다(성공·거절 모두)', async () => {
  let w = world(); await openBoard(w);
  w.tap({ act: 'apply', d: '0', s: '0' }); await w.settle();
  assert.deepEqual(w.names(), ['dutyApply']); assert.equal(w.pending[0].args[2], false, '안 잠긴 날 — ack 없이');
  w.goHome(); await w.answer(0, { ok: true });
  assert.equal(w.shown(), 'HOME'); assert.deepEqual(w.names(), [], '다시 받지 않는다'); assert.equal(w.ctx.dutyState.busy, false);
  w = world(); await openBoard(w);
  w.tap({ act: 'apply', d: '0', s: '0' }); await w.settle(); w.goHome();
  await w.fail(0, 'full', { ok: false, error: 'full' });
  assert.equal(w.shown(), 'HOME'); assert.deepEqual(w.names(), []);
  assert.equal(w.alerts.length, 1, '안 됐다는 것은 어느 화면에서든 알린다'); assert.ok(w.alerts[0].includes('방금 자리가 찼어요'));
});

test('지원 뒤 — 그 화면이면 자리를 지킨 채 다시 받고 · 당번 화면 안에서 옮겼으면 지금 보는 쪽을 다시 받는다', async () => {
  let w = world(); await openBoard(w);
  w.tap({ act: 'apply', d: '0', s: '0' }); await w.settle(); await w.answer(0, { ok: true });
  assert.deepEqual(w.names(), ['dutyBoard']); assert.equal(w.shown(), 'DUTY[board]', '화면을 비우지 않는다(soft)');
  await w.answer(0, boardRes({ days: [{ ...DAY, slots: [{ ...SLOT, n: 1, names: ['화면점검'], why: 'mine', mine: { id: 5, status: 'active', byStaff: false, staffAdded: false, asked: false, why: null } }] }] }));
  assert.ok(w.html().includes('지원했어요') && !w.html().includes('data-act="apply"'));
  // 지원을 보낸 뒤 「← 봉사 당번」으로 목록에 갔다 — 응답이 오면 목록을 다시 받는다(자세히로 끌어오지 않는다)
  w = world(); await openBoard(w);
  w.tap({ act: 'apply', d: '0', s: '0' }); await w.settle();
  w.goBack(); assert.deepEqual(w.names(), ['dutyApply', 'dutyList']);
  await w.answer(0, { ok: true });
  assert.deepEqual(w.names(), ['dutyList', 'dutyList'], '보던 목록을 한 번 더 받는다(방금 지원이 내 당번에 보이게)');
  await w.answer(0, listRes([BOARD, { ...BOARD, id: 'b-2' }])); assert.equal(w.shown(), 'DUTY[loading]', '앞선 목록 응답은 버려진다');
  await w.answer(0, listRes([BOARD, { ...BOARD, id: 'b-2' }], [MINE])); assert.equal(w.shown(), 'DUTY[list]');
  assert.ok(w.html().includes('내 당번'));
});

test('다시 받기 실패 — 일은 됐는데 화면을 못 받았으면 그렇다고 알린다(옛 화면이라 안 된 줄 아신다) · 그냥 다시 받기 실패는 조용히', async () => {
  let w = world(); await openBoard(w);
  w.tap({ act: 'apply', d: '0', s: '0' }); await w.settle(); await w.answer(0, { ok: true });
  await w.fail(0, 'Failed to fetch');
  assert.equal(w.alerts.length, 1); assert.ok(w.alerts[0].startsWith('지원은 됐어요.') && w.alerts[0].includes('다시 열어 확인해 주세요'));
  assert.equal(w.shown(), 'DUTY[board]', '보던 화면은 그대로');
  // 다른 앱에 다녀온 뒤의 조용한 다시 받기 — 실패해도 알리지 않고 보던 화면 그대로
  w = world(); await openBoard(w);
  w.tickTime(16000); w.listeners.visibilitychange(); assert.deepEqual(w.names(), ['dutyBoard']);
  await w.fail(0, 'Failed to fetch'); assert.deepEqual(w.alerts, []); assert.equal(w.shown(), 'DUTY[board]');
  // 15초 안에는 다시 받지 않는다
  w.listeners.visibilitychange(); assert.deepEqual(w.names(), ['dutyBoard'], '방금 실패했으니(받은 때는 그대로) 다시 받는다');
  await w.answer(0, boardRes()); w.listeners.visibilitychange(); assert.deepEqual(w.names(), []);
});

test('처음 받는 중에 화면이 다시 보여 조용한 다시 받기가 앞 요청을 밀어냈는데 그것이 실패 — 「불러오는 중」에 갇히지 않는다', async () => {
  const w = world();
  w.ctx.renderDutyList(); w.listeners.visibilitychange();
  assert.deepEqual(w.names(), ['dutyList', 'dutyList']);
  await w.answer(0, listRes([BOARD, { ...BOARD, id: 'b-2' }])); assert.equal(w.shown(), 'DUTY[loading]', '앞 응답은 버려진다');
  await w.fail(0, 'Failed to fetch');
  assert.equal(w.shown(), 'DUTY[other]'); assert.ok(w.html().includes('지금 불러올 수 없어요'));
  // 자세히도 같다
  const b = world();
  b.ctx.renderDutyBoard('b-1'); b.listeners.visibilitychange(); await b.fail(1, 'Failed to fetch');
  assert.ok(b.html().includes('지금 불러올 수 없어요') && !b.html().includes('불러오는 중'));
});

test('그사이 당번이 내려갔다(보관·준비) — 다시 받기의 not-found 는 낡은 당번표와 단추를 남기지 않는다', async () => {
  const w = world(); await openBoard(w);
  assert.ok(w.html().includes('data-act="apply"'));
  w.tap({ act: 'apply', d: '0', s: '0' }); await w.settle();
  await w.fail(0, 'not-found', { ok: false, error: 'not-found' });   // api 가 archived 를 not-found 로 바꿔 준다
  assert.ok(w.alerts[0].includes('찾을 수 없어요')); assert.deepEqual(w.names(), ['dutyBoard'], '다시 받는다');
  await w.fail(0, 'not-found');
  assert.ok(w.html().includes('지금은 볼 수 없는 당번이에요') && !w.html().includes('data-act="apply"'));
  w.goBack(); assert.deepEqual(w.names(), ['dutyList']);
});

test('잠긴 날 — 화면을 열어 둔 사이 잠겼으면 「취소할 수 없는 날」 창을 한 번 더 거쳐 ack 로 다시 보낸다 · 떠났으면 창을 띄우지 않는다', async () => {
  let w = world(); await openBoard(w);
  w.tap({ act: 'apply', d: '0', s: '0' }); await w.settle();
  await w.fail(0, 'locked-day', { ok: false, error: 'locked-day' });
  assert.deepEqual(w.confirms, ['🙋 지원할까요?', '⚠️ 취소할 수 없는 날이에요']);
  assert.deepEqual(w.names(), ['dutyApply']); assert.equal(w.pending[0].args[2], true, 'ack_locked 로 다시');
  assert.deepEqual(w.alerts, []);
  // 처음부터 잠긴 날이면 그 창 하나만
  w = world(); await openBoard(w, boardRes({ days: [{ ...DAY, locked: true, lockAt: null }] }));
  w.tap({ act: 'apply', d: '0', s: '0' }); await w.settle();
  assert.deepEqual(w.confirms, ['⚠️ 취소할 수 없는 날이에요']); assert.equal(w.pending[0].args[2], true);
  // 「돌아가기」면 보내지 않는다
  w = world({ confirm: [false] }); await openBoard(w);
  w.tap({ act: 'apply', d: '0', s: '0' }); await w.settle(); assert.deepEqual(w.names(), []); assert.equal(w.ctx.dutyState.busy, false);
  // 보낸 뒤 첫 화면으로 나갔는데 locked-day — 다른 화면에 확인 창을 띄우지 않는다(아무것도 안 쓰였다)
  w = world(); await openBoard(w);
  w.tap({ act: 'apply', d: '0', s: '0' }); await w.settle(); w.goHome();
  await w.fail(0, 'locked-day'); assert.deepEqual(w.confirms, ['🙋 지원할까요?']); assert.equal(w.shown(), 'HOME');
});

test('계정 번호(user_id)를 아직 못 받았으면 서버를 부르지 않는다 — 「아직 열지 않았어요」라고 사실이 아닌 말을 하지 않는다', async () => {
  const w = world({ user: { name: '화면점검', type: '교구', gu: '믿음', mok: '99' } });
  w.ctx.renderDutyList(); await w.settle();
  assert.deepEqual(w.names(), []); assert.ok(w.html().includes('아직 서버와 연결되지 않았어요') && !w.html().includes('열지 않았어요'));
  w.ctx.renderDutyBoard('b-1'); await w.settle(); assert.deepEqual(w.names(), []); assert.ok(w.html().includes('아직 서버와 연결되지 않았어요'));
  // 로그인하지 않았으면 로그인 화면으로
  const n = world({ user: null }); n.ctx.renderDutyList(); assert.equal(n.entries(), 1); assert.equal(n.shown(), 'ENTRY');
  // 문이 닫혔다는 답(계정이 있을 때)에는 그 말을 한다
  const c = world(); c.ctx.renderDutyList(); await c.answer(0, { ok: true, open: false }); assert.ok(c.html().includes('지금은 봉사 당번을 볼 수 없어요') && !c.html().includes('열지 않았어요'));
  // 배포 직후 옛 js/api.js(당번 함수가 없다) — 「불러오는 중」에 갇히지 않는다
  const old = world({ api: {} }); old.ctx.renderDutyList(); assert.ok(old.html().includes('새 화면을 받는 중이에요'));
});

test('앱에서 지원하지 못하는 계정(me.why) — 「지원하기」 단추를 두지 않고 까닭을 맨 위에 한 줄', async () => {
  const w = world(); await openBoard(w, boardRes({ me: { why: 'guardian' } }));
  assert.ok(!w.html().includes('data-act="apply"') && w.html().includes('어린이·청소년 부서는 앱에서 지원하지 않아요'));
  assert.ok(w.html().includes('한 분 더 필요해요') || w.html().includes('두 분 더 필요해요'), '빈 자리 수는 그대로 보인다');
  const ok = world(); await openBoard(ok); assert.ok(ok.html().includes('data-act="apply"') && !ok.html().includes('어린이·청소년'));
});

test('내 당번 — 취소는 확인 한 번 · 끝나면 목록을 자리 지킨 채 다시 받고 한 줄 · 못 가게 됐어요는 「표시했어요」', async () => {
  const w = world(); w.ctx.renderDutyList(); await w.answer(0, listRes([BOARD], [MINE]));
  assert.ok(w.html().includes('data-act="cancel"'));
  w.tap({ act: 'cancel', m: '0' }); await w.settle();
  assert.deepEqual(w.names(), ['dutyCancel']); assert.deepEqual(w.pending[0].args, [5, UID]);
  await w.answer(0, { ok: true }); assert.deepEqual(w.names(), ['dutyList']);
  await w.answer(0, listRes([BOARD], [])); assert.ok(w.html().includes('취소했어요.')); assert.equal(w.shown(), 'DUTY[list]');
  // 스스로 못 빼는 줄(잠김)에는 문의처가 함께 보인다
  const l = world(); l.ctx.renderDutyList();
  await l.answer(0, listRes([BOARD], [{ ...MINE, locked: true, lockAt: null, contact: '가상담당 집사 010-0000-0000' }]));
  assert.ok(l.html().includes('href="tel:01000000000"') && l.html().includes('data-act="ask"'));
  assert.equal(l.html().includes('알렸어요'), false, '「알렸어요」라고 하지 않는다(담당자 휴대폰으로 가는 알림이 아니다)');
});

test('일을 보내는 중 — 다른 단추는 막히고 · 20초가 넘도록 답이 없으면 풀린다 · 로그아웃은 메모리를 비운다', async () => {
  const w = world(); await openBoard(w);
  w.tap({ act: 'apply', d: '0', s: '0' }); await w.settle();
  w.tap({ act: 'apply', d: '0', s: '0' }); await w.settle();
  assert.deepEqual(w.names(), ['dutyApply'], '보내는 중에는 또 보내지 않는다'); assert.equal(w.confirms.length, 1);
  w.listeners.visibilitychange(); assert.deepEqual(w.names(), ['dutyApply'], '보내는 중에는 다시 받지도 않는다');
  w.tickTime(21000);
  w.tap({ act: 'apply', d: '0', s: '0' }); await w.settle();
  assert.deepEqual(w.names(), ['dutyApply', 'dutyApply'], '끊긴 요청 하나가 단추를 영영 막지 않는다');
  w.ctx.dutyResetState();
  assert.deepEqual([w.ctx.dutyState.at, w.ctx.dutyState.busy, w.ctx.dutyState.boards.length, w.ctx.dutyState.mine.length, w.ctx.dutyState.days.length], ['', false, 0, 0, 0]);
  await w.answer(0, { ok: true }); assert.deepEqual(w.names(), ['dutyApply'], '비운 뒤 온 응답은 화면을 다시 받지 않는다');
});

test('내 당번 카드로 왔는데 그 날짜가 당번표에 없다(보이는 기간 밖 · 끝 날짜 뒤) — 맨 위에 한 줄 · 「아직」이라고 하지 않는다', async () => {
  const w = world(); w.ctx.renderDutyBoard('b-1', { focusDate: '2026-12-25' }); await w.answer(0, boardRes());
  assert.ok(w.html().includes('12월 25일(금) 당번은 지금 당번표에 보이지 않는 날짜예요') && !w.html().includes('아직 당번표'));
  const ok = world(); ok.ctx.renderDutyBoard('b-1', { focusDate: '2026-10-18' }); await ok.answer(0, boardRes());
  assert.equal(ok.html().includes('보이지 않는 날짜'), false, '그 날짜가 있으면 말하지 않는다');
});
