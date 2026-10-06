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
  let wrap = null, now = 1760000000000, entry = 0, cardTop = 700, calHeight = 400, modal = false;
  const created = [];   // document.createElement 로 만든 것(까닭 고르기 창)
  const touched = [];   // 화면이 건드린 것(초점 · 굴리기) — 달력
  const mkEl = () => ({ addEventListener(t, f) { this['on_' + t] = f; }, dataset: {}, isConnected: true, disabled: false, classList: { add() {}, remove() {} }, remove() {} });
  let fab = mkEl(), back = mkEl();
  const mkWrap = (h) => ({ _h: h, set innerHTML(v) { this._h = String(v); back = mkEl(); }, get innerHTML() { return this._h; }, onclick: null, onkeydown: null,
    querySelectorAll(sel) {   // 날짜 카드들(굴리기를 받아 적는다) — 그 밖은 빈 목록
      if (sel !== '.duty-day') return [];
      return [...this._h.matchAll(/<section class="duty-day[^"]*" data-date="([^"]+)"/g)].map((m) => ({ dataset: { date: m[1] },
        scrollIntoView(o) { touched.push('scroll .duty-day[' + m[1] + '] ' + ((o && o.block) || '')); } }));
    },
    querySelector(sel) {   // 달력이 찾는 것만 — 그 글자가 화면에 있으면 흉내 낸 요소를 준다
      const m = /^button\[data-cal="(prev|next)"\]$/.exec(sel);
      const has = m ? this._h.includes('data-cal="' + m[1] + '"') : sel === '.duty-cal' ? this._h.includes('class="duty-cal"') : sel === '.duty-day' ? this._h.includes('<section class="duty-day')
        : sel === '.duty-cal-c.on' ? /class="duty-cal-c has k-\w+ on/.test(this._h) : false;
      if (!has) return null;
      return { focus() { touched.push('focus ' + sel); }, scrollIntoView(o) { touched.push('scroll ' + sel + ' ' + ((o && o.block) || '')); },
        getBoundingClientRect: () => ({ top: cardTop, height: sel === '.duty-cal' ? calHeight : 300 }) };
    } });
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
    window: { scrollTo() {}, scrollY: 0, innerHeight: 800 },
    document: {
      hidden: false,
      getElementById(id) {
        if (id === 'app-modal') return modal ? { remove() { modal = false; } } : null;   // 떠 있는 창(확인 창·알림) — 시험이 켜고 끈다
        return id === 'app' ? app : id === 'duty-home' ? fab : id === 'duty-back' ? back : null;
      },
      querySelector(sel) {
        if (sel === '.duty-wrap') return wrap;
        if (sel === '.duty-wrap .ev-loading') return wrap && wrap._h.includes('ev-loading') ? {} : null;
        return null;
      },
      addEventListener(t, f) { listeners[t] = f; },
      createElement() { const el = mkEl(); created.push(el); return el; }, body: { appendChild() {} },
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
  const kind = (h) => (h.includes('불러오는 중') ? 'loading' : h.includes('duty-day') || h.includes('당번표에 보이는 날짜가 없어요') ? 'board' : h.includes('duty-sec') ? 'list' : 'other');
  const tapSel = (want, dataset) => {
    const btn = { dataset, disabled: false, isConnected: true };
    wrap.onclick({ target: { closest: (sel) => (sel === want ? btn : null) } });
    return btn;
  };
  const tap = (dataset) => tapSel('button[data-act]', dataset);
  return { ctx, alerts, confirms, logs, pending, listeners, settle, tap,
    tapDate: (date) => tapSel('button[data-date]', { date }), tapCal: (dir) => tapSel('button[data-cal]', { cal: dir }),   // 달력의 날짜 · 앞뒤 달 단추
    touched: () => touched.splice(0), setCardTop: (v) => { cardTop = v; }, setCalHeight: (v) => { calHeight = v; },
    setModal: (v) => { modal = !!v; },   // 다른 창이 떠 있다
    pickWhy: (why) => created[created.length - 1].on_click({ target: { closest: (sel) => (sel === '[data-why]' ? { dataset: { why } } : null) } }),   // 「못 가게 됐어요」 까닭 고르기
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
  assert.equal(w.alerts.length, 1); assert.ok(w.alerts[0].startsWith('10월 18일(일) 2부 설거지 — 지원은 됐어요.') && w.alerts[0].includes('다시 열어 확인해 주세요'));
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
  // …그래도 **안 됐다는 것은 알린다**(확인 창에서 「지원하기」를 누르신 분이 지원한 줄 아신다 — 2026-10-06 검증 M-1)
  assert.equal(w.alerts.length, 1); assert.ok(w.alerts[0].includes('10월 18일(일) 2부 설거지 지원이 안 됐어요') && w.alerts[0].includes('그사이 확정된 날이 됐어요'));
  assert.deepEqual(w.names(), [], '첫 화면에서는 다시 받지 않는다');
  // 목록으로 옮겼으면 알리고 목록을 다시 받는다
  w = world(); await openBoard(w);
  w.tap({ act: 'apply', d: '0', s: '0' }); await w.settle(); w.goBack();
  await w.fail(0, 'locked-day'); assert.equal(w.alerts.length, 1); assert.deepEqual(w.confirms, ['🙋 지원할까요?']);
  assert.deepEqual(w.names(), ['dutyList', 'dutyList']);
  // 같은 당번을 그대로 보고 있으면(그사이 화면만 다시 받았다 — 화면 번호가 달라졌다) 창을 띄운다
  w = world(); await openBoard(w);
  w.tap({ act: 'apply', d: '0', s: '0' }); await w.settle();
  w.ctx.renderDutyBoard('b-1', { soft: true }); await w.answer(1, boardRes());
  await w.fail(0, 'locked-day'); assert.deepEqual(w.confirms, ['🙋 지원할까요?', '⚠️ 취소할 수 없는 날이에요']); assert.deepEqual(w.alerts, []);
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
  assert.ok(!w.html().includes('data-act="apply"') && w.html().includes('이 계정은 앱에서 바로 지원할 수 없어요'));
  assert.ok(w.html().includes('한 분 더 필요해요') || w.html().includes('두 분 더 필요해요'), '빈 자리 수는 그대로 보인다');
  const ok = world(); await openBoard(ok); assert.ok(ok.html().includes('data-act="apply"') && !ok.html().includes('바로 지원할 수 없어요'));
});

test('내 당번 — 취소는 확인 한 번 · 끝나면 목록을 자리 지킨 채 다시 받고 한 줄 · 못 가게 됐어요는 「표시했어요」', async () => {
  const w = world(); w.ctx.renderDutyList(); await w.answer(0, listRes([BOARD], [MINE]));
  assert.ok(w.html().includes('data-act="cancel"'));
  w.tap({ act: 'cancel', m: '0' }); await w.settle();
  assert.equal(w.confirms.length, 1, '확인 창 한 번'); assert.ok(w.confirms[0].includes('10월 18일(일) 2부 설거지 지원을 취소할까요?'));
  assert.deepEqual(w.names(), ['dutyCancel']); assert.deepEqual(w.pending[0].args, [5, UID]);
  await w.answer(0, { ok: true }); assert.deepEqual(w.names(), ['dutyList']);
  await w.answer(0, listRes([BOARD], [])); assert.ok(w.html().includes('취소했어요.')); assert.equal(w.shown(), 'DUTY[list]');
  // 스스로 못 빼는 줄(잠김)에는 문의처가 함께 보인다
  const l = world(); l.ctx.renderDutyList();
  await l.answer(0, listRes([BOARD], [{ ...MINE, locked: true, lockAt: null, contact: '가상담당 집사 010-0000-0000' }]));
  assert.ok(l.html().includes('href="tel:01000000000"') && l.html().includes('data-act="ask"'));
  assert.equal(l.html().includes('알렸어요'), false, '「알렸어요」라고 하지 않는다(담당자 휴대폰으로 가는 알림이 아니다)');
  // 「돌아가기」면 취소를 보내지 않는다
  const n = world({ confirm: [false] }); n.ctx.renderDutyList(); await n.answer(0, listRes([BOARD], [MINE]));
  n.tap({ act: 'cancel', m: '0' }); await n.settle(); assert.equal(n.confirms.length, 1); assert.deepEqual(n.names(), []);
  // 못 가게 됐어요 — 까닭을 고르면 그 값으로 보내고, 끝나면 「담당자 당번표에 표시했어요.」 한 줄
  l.tap({ act: 'ask', m: '0' }); await l.settle(); assert.deepEqual(l.names(), [], '까닭을 고르기 전에는 보내지 않는다');
  l.pickWhy('cant'); await l.settle();
  assert.deepEqual(l.names(), ['dutyAsk']); assert.deepEqual(l.pending[0].args, [5, UID, 'cant']);
  await l.answer(0, { ok: true }); assert.deepEqual(l.names(), ['dutyList']);
  await l.answer(0, listRes([BOARD], [{ ...MINE, locked: true, lockAt: null, asked: true, why: 'cant' }]));
  assert.ok(l.html().includes('담당자 당번표에 표시했어요.') && l.html().includes('data-act="unask"') && !l.html().includes('알렸어요'));
});

test('일을 보내는 중 — 다른 단추는 막히고 · 20초가 넘도록 답이 없으면 풀린다 · 로그아웃은 메모리를 비운다', async () => {
  const w = world(); await openBoard(w);
  w.tap({ act: 'apply', d: '0', s: '0' }); await w.settle();
  w.tap({ act: 'apply', d: '0', s: '0' }); await w.settle();
  assert.deepEqual(w.names(), ['dutyApply'], '보내는 중에는 또 보내지 않는다'); assert.equal(w.confirms.length, 1);
  w.tickTime(16000); w.listeners.visibilitychange();
  assert.deepEqual(w.names(), ['dutyApply'], '보내는 중에는 다시 받지도 않는다(받은 지 15초가 넘었어도 — 그 검사에 걸려 통과하던 단언이었다)');
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

test('날짜가 하나도 없는 당번(자리 틀을 아직 안 넣음 · 끝 날짜가 지남) — 까닭을 한 줄로 · 지원 단추는 없다', async () => {
  const w = world(); w.ctx.renderDutyBoard('b-1'); await w.answer(0, boardRes({ days: [] }));
  assert.equal(w.shown(), 'DUTY[board]');
  assert.ok(w.html().includes('지금은 당번표에 보이는 날짜가 없어요 — 궁금하신 점은 담당자께 문의해 주세요.') && !w.html().includes('data-act="apply"'));
  // 까닭을 넘겨짚지 않는다 — 「담당자가 날짜를 넣으면」(이미 넣었을 수 있다) · 「가까워지면」(끝 날짜가 지났으면 오지 않는다)
  assert.equal(/담당자가 날짜를 넣으면|가까워지/.test(w.html()), false);
  // 담당자가 이미 더한 날짜가 보이는 기간 밖일 때도 참인 말이어야 한다 — 그 날짜에 내 줄이 있으면 「내 당번」 안내 줄과 함께 뜬다(서로 어긋나지 않게 · 검증 M-2)
  const m = world(); m.ctx.renderDutyBoard('b-1', { focusDate: '2026-12-05' }); await m.answer(0, boardRes({ days: [] }));
  assert.ok(m.html().includes('12월 5일(토) 당번은 지금 당번표에 보이지 않는 날짜예요') && m.html().includes('지금은 당번표에 보이는 날짜가 없어요'));
  assert.equal(m.html().includes('당번표에 날짜가 없어요'), false, '「날짜가 없다」고 하지 않는다(보이지 않을 뿐이다)');
});

// ── 달력(날짜가 넷 이상인 당번) — 2026-10-06 친구 요청: 보이는 기간이 1년이면 날짜 카드가 52장이 된다 ──
const CAL_DAYS = ['2026-10-11', '2026-10-18', '2026-10-25', '2026-11-01', '2026-11-08', '2026-12-06']
  .map((date, i) => ({ ...DAY, date, lockAt: null, slots: [{ ...SLOT, id: 100 + i, n: i === 0 ? 2 : 0, why: i === 0 ? 'full' : '' }] }));
const calRes = (x) => boardRes({ days: CAL_DAYS, ...(x || {}) });
const dayCount = (h) => (h.match(/<section class="duty-day/g) || []).length;
const selOf = (h) => (/class="duty-cal-c has k-\w+ on[^"]*" data-date="([^"]+)"/.exec(h) || [])[1] || '';

test('달력 — 날짜가 넷 이상이면 달력 + 고른 날 하나 · 셋 이하면 날짜 카드 모두(달력 없음)', async () => {
  let w = world(); await openBoard(w, boardRes({ days: CAL_DAYS.slice(0, 3) }));
  assert.equal(dayCount(w.html()), 3); assert.equal(w.html().includes('duty-cal'), false);
  w = world(); await openBoard(w, calRes());
  assert.equal(dayCount(w.html()), 1, '고른 날 하나만'); assert.ok(w.html().includes('class="duty-cal"'));
  assert.equal(selOf(w.html()), '2026-10-18', '다 찬 11일이 아니라 손이 필요한 가장 이른 날');
  assert.ok(w.html().includes('<b>2026년 10월</b>') && w.html().includes('<i aria-hidden="true">2/2</i>') && w.html().includes('<i aria-hidden="true">0/2</i>'), '칸에 채워진 인원/필요 인원');
  assert.equal(w.shown(), 'DUTY[board]'); assert.deepEqual(w.touched(), [], '그냥 열 때는 화면을 굴리지 않는다');
});

test('달력 — 날짜를 누르면 서버를 다시 부르지 않고 그날의 자리로 바꾼다 · 앞뒤 달은 날짜가 있는 달로', async () => {
  const w = world(); await openBoard(w, calRes());
  w.tapDate('2026-10-25');
  assert.deepEqual(w.names(), [], '서버를 부르지 않는다'); assert.equal(selOf(w.html()), '2026-10-25'); assert.equal(dayCount(w.html()), 1);
  assert.ok(w.html().includes('<b>10월 25일(일)</b>'));
  assert.deepEqual(w.touched(), ['focus .duty-cal-c.on', 'scroll .duty-cal start'], '고른 칸에 초점 · 그날 카드가 화면 아래에 걸렸으면 달력을 위로');
  // 그날 카드가 이미 보이면 화면을 움직이지 않는다
  w.setCardTop(300); w.tapDate('2026-10-11'); assert.deepEqual(w.touched(), ['focus .duty-cal-c.on']); assert.equal(selOf(w.html()), '2026-10-11');
  // 이미 고른 날을 또 누르면 다시 그리지 않는다(그날 카드만 보이게) · 당번표에 없는 날짜는 무시한다
  w.setCardTop(700); w.tapDate('2026-10-11'); assert.deepEqual(w.touched(), ['scroll .duty-cal start']);
  w.tapDate('2026-10-12'); assert.equal(selOf(w.html()), '2026-10-11'); assert.deepEqual(w.touched(), []);
  // 다음 달 — 초점은 누른 단추에 · 더 갈 달이 없어 단추가 사라졌으면 고른 날에
  w.tapCal('next'); assert.equal(selOf(w.html()), '2026-11-01'); assert.ok(w.html().includes('<b>2026년 11월</b>'));
  assert.deepEqual(w.touched(), ['focus button[data-cal="next"]']);
  w.tapCal('next'); assert.equal(selOf(w.html()), '2026-12-06'); assert.deepEqual(w.touched(), ['focus .duty-cal-c.on']);
  w.tapCal('next'); assert.equal(selOf(w.html()), '2026-12-06', '더 없으면 그대로'); assert.deepEqual(w.touched(), []);
  w.tapCal('prev'); assert.equal(selOf(w.html()), '2026-11-01'); assert.deepEqual(w.names(), []);
});

test('달력 — 지원한 뒤 다시 받아도 고른 날이 그대로 · 다른 앱에 다녀와도 그대로 · 고른 날이 사라졌거나 새로 열면 처음 규칙으로', async () => {
  const w = world(); await openBoard(w, calRes());
  w.tapDate('2026-11-08');
  const di = CAL_DAYS.findIndex((d) => d.date === '2026-11-08');
  assert.ok(w.html().includes('data-act="apply" data-d="' + di + '" data-s="0"'), '단추의 차례 번호는 days 의 자리 그대로');
  w.tap({ act: 'apply', d: String(di), s: '0' }); await w.settle();
  assert.deepEqual(w.names(), ['dutyApply']); assert.equal(w.pending[0].args[0], 100 + di, '고른 날의 자리로 보낸다');
  await w.answer(0, { ok: true }); assert.deepEqual(w.names(), ['dutyBoard']);
  const after = CAL_DAYS.map((d, i) => (i === di ? { ...d, slots: [{ ...d.slots[0], n: 1, names: ['화면점검'], why: 'mine', mine: { id: 5, status: 'active', byStaff: false, staffAdded: false, asked: false, why: null } }] } : d));
  await w.answer(0, calRes({ days: after }));
  assert.equal(selOf(w.html()), '2026-11-08'); assert.ok(w.html().includes('지원했어요') && w.html().includes('k-mine on') && w.html().includes('<i aria-hidden="true">1/2</i>'));
  // 다른 날을 골라 둔 채 다른 앱에 다녀왔다 — 다시 받아도 고른 날 그대로
  w.tapDate('2026-11-01'); w.tickTime(16000); w.listeners.visibilitychange(); await w.answer(0, calRes({ days: after }));
  assert.equal(selOf(w.html()), '2026-11-01');
  // 고른 날이 당번표에서 사라졌으면(담당자가 날짜를 뺌) 처음 규칙으로
  w.tickTime(16000); w.listeners.visibilitychange(); await w.answer(0, calRes({ days: after.filter((d) => d.date !== '2026-11-01') }));
  assert.equal(selOf(w.html()), '2026-10-18');
  // 목록에 갔다가 새로 열면 고른 날을 잊는다
  w.tapDate('2026-12-06'); w.goBack(); await w.answer(0, listRes([BOARD, { ...BOARD, id: 'b-2' }]));
  w.ctx.renderDutyBoard('b-1'); await w.answer(0, calRes({ days: after }));
  assert.equal(selOf(w.html()), '2026-10-18', '새로 열면 처음 규칙(내가 서거나 손이 필요한 가장 이른 날)');
  w.ctx.dutyResetState(); assert.equal(w.ctx.dutyState.calSel, '', '로그아웃은 고른 날도 비운다');
});

const MINE_ON = (i) => CAL_DAYS.map((d, k) => (k === i ? { ...d, slots: [{ ...d.slots[0], n: 1, names: ['화면점검'], why: 'mine', mine: { id: 5, status: 'active', byStaff: false, staffAdded: false, asked: false, why: null } }] } : d));
const OFF_BTN = /<button class="duty-btn[^"]*" data-act="[a-z]+"[^>]*disabled/;

test('달력 — 답을 기다리는 사이 다른 날짜를 보면: 자리 단추는 꺼진 모습(눌러도 말없이 버려지는 단추가 없다) · 답이 와도 보던 날에 머물고 맨 위 한 줄로 알린다', async () => {
  const w = world(); await openBoard(w, calRes());
  w.tap({ act: 'apply', d: '1', s: '0' }); await w.settle(); assert.deepEqual(w.names(), ['dutyApply']);   // 10월 18일 — 보냄(답은 아직)
  w.tapDate('2026-10-25'); assert.equal(selOf(w.html()), '2026-10-25');
  assert.ok(OFF_BTN.test(w.html()), '보내는 동안 다시 그린 카드의 단추는 꺼진 모습이다');
  await w.answer(0, { ok: true }); assert.deepEqual(w.names(), ['dutyBoard'], '다시 받는다(화면 번호 그대로 — 응답을 버리지 않는다)');
  await w.answer(0, calRes({ days: MINE_ON(1) }));
  assert.equal(selOf(w.html()), '2026-10-25', '보던 날에 머문다 — 앞 날짜로 끌고 가 그 자리에 앞 일의 결과를 그리지 않는다');
  assert.ok(w.html().includes('10월 18일(일) 2부 설거지 — 지원했어요.'), '어느 날·어느 자리인지 맨 위 한 줄로');
  assert.ok(/class="duty-cal-c has k-mine" data-date="2026-10-18"/.test(w.html()), '달력의 18일 칸은 내 당번으로 바뀐다');
  assert.equal(OFF_BTN.test(w.html()), false, '답이 온 뒤에는 단추가 켜진다');
  // 그날을 그대로 보고 있었으면 그 칸이 바뀐다(맨 위 줄 없음)
  const s = world(); await openBoard(s, calRes());
  s.tap({ act: 'apply', d: '1', s: '0' }); await s.settle(); await s.answer(0, { ok: true }); await s.answer(0, calRes({ days: MINE_ON(1) }));
  assert.equal(selOf(s.html()), '2026-10-18'); assert.ok(s.html().includes('지원했어요') && !s.html().includes('— 지원했어요.'));
  // 취소도 같다 — 다른 날을 보고 있으면 「10월 18일(일) 2부 설거지 — 취소했어요.」
  const c = world(); await openBoard(c, calRes({ days: MINE_ON(1) })); assert.equal(selOf(c.html()), '2026-10-18');
  c.tap({ act: 'cancel', d: '1', s: '0' }); await c.settle(); assert.deepEqual(c.names(), ['dutyCancel']);
  c.tapCal('next'); c.tapCal('prev'); assert.equal(selOf(c.html()), '2026-10-18');   // 달을 넘겼다 돌아와 같은 날을 다시 그림
  assert.ok(/data-act="cancel"[^>]*disabled/.test(c.html()), '내 줄의 단추(지원 취소)도 보내는 동안 꺼진 모습이다');
  c.tapDate('2026-11-01'); assert.ok(OFF_BTN.test(c.html()));
  await c.answer(0, { ok: true }); await c.answer(0, calRes());
  assert.equal(selOf(c.html()), '2026-11-01'); assert.ok(c.html().includes('10월 18일(일) 2부 설거지 — 취소했어요.'));
  // 거절이면 알림이 말한다(맨 위 줄 없음) — 보던 날은 그대로
  const r = world(); await openBoard(r, calRes());
  r.tap({ act: 'apply', d: '1', s: '0' }); await r.settle(); r.tapDate('2026-10-25');
  await r.fail(0, 'full', { ok: false, error: 'full' }); await r.answer(0, calRes());
  assert.equal(selOf(r.html()), '2026-10-25'); assert.ok(r.alerts[0].startsWith('10월 18일(일) 2부 설거지 — ')); assert.equal(r.html().includes('— 지원했어요.'), false);
});

test('달력 — 「내 당번」 카드로 연 당번표의 첫 읽기가 조용한 다시 받기에 밀려나도 그 날짜를 고르고 · 안내 줄·굴리기도 남는다', async () => {
  // ① 목록에서 다른 줄을 취소(확인)하고 답이 오기 전에 11월 8일 카드를 누른다 → 취소의 답이 당번표를 soft 로 다시 받아 첫 읽기를 밀어낸다
  let w = world(); w.ctx.renderDutyList(); await w.answer(0, listRes([BOARD], [{ ...MINE, id: 6, date: '2026-10-18' }, { ...MINE, date: '2026-11-08' }]));
  w.tap({ act: 'cancel', m: '0' }); await w.settle(); assert.deepEqual(w.names(), ['dutyCancel']);
  w.ctx.renderDutyBoard('b-1', { focusDate: '2026-11-08' });
  await w.answer(0, { ok: true }); assert.deepEqual(w.names(), ['dutyBoard', 'dutyBoard']);
  await w.answer(0, calRes()); await w.answer(0, calRes());        // 앞 읽기(focusDate 를 가진 것)는 버려지고 뒤 읽기가 그린다
  assert.equal(selOf(w.html()), '2026-11-08', '누른 카드의 날짜');
  assert.deepEqual(w.touched(), ['scroll .duty-cal start'], '달력을 화면에');
  // ② 받는 사이 화면이 다시 보였을 때(visibilitychange)도 같다 · 당번표에 없는 날짜면 맨 위 안내 줄이 남는다
  w = world(); w.ctx.renderDutyList(); await w.answer(0, listRes([BOARD], [{ ...MINE, date: '2026-11-08' }]));
  w.tickTime(16000); w.ctx.renderDutyBoard('b-1', { focusDate: '2026-11-08' }); w.listeners.visibilitychange();
  assert.deepEqual(w.names(), ['dutyBoard', 'dutyBoard']);
  await w.answer(0, calRes()); await w.answer(0, calRes()); assert.equal(selOf(w.html()), '2026-11-08');
  w = world(); w.ctx.renderDutyList(); await w.answer(0, listRes([BOARD], [{ ...MINE, date: '2027-03-07' }]));
  w.tickTime(16000); w.ctx.renderDutyBoard('b-1', { focusDate: '2027-03-07' }); w.listeners.visibilitychange();
  await w.answer(0, calRes()); await w.answer(0, calRes());
  assert.ok(w.html().includes('3월 7일(일) 당번은 지금 당번표에 보이지 않는 날짜예요'));
  // ③ 한 번 그린 뒤의 다시 받기는 그 날짜를 다시 끌어오지 않는다(달력에서 고른 날을 지킨다)
  w = world(); w.ctx.renderDutyBoard('b-1', { focusDate: '2026-11-08' }); await w.answer(0, calRes());
  w.tapDate('2026-11-01'); w.tickTime(16000); w.listeners.visibilitychange(); await w.answer(0, calRes());
  assert.equal(selOf(w.html()), '2026-11-01');
});

test('달력 — 일을 끝낸 답에서 날짜가 줄어 날짜 카드 모양으로 바뀌면 방금 한 날의 카드로 굴린다 · 작은 화면에서는 달력 대신 그날 카드를 맨 위로', async () => {
  const four = CAL_DAYS.slice(0, 4), w = world(); w.ctx.renderDutyBoard('b-1'); await w.answer(0, boardRes({ days: four }));
  w.tapCal('next'); assert.equal(selOf(w.html()), '2026-11-01'); w.touched();
  w.tap({ act: 'apply', d: '3', s: '0' }); await w.settle(); await w.answer(0, { ok: true });
  const after = four.slice(1).map((d, i) => (i === 2 ? { ...d, slots: [{ ...d.slots[0], n: 1, names: ['화면점검'], why: 'mine', mine: { id: 5, status: 'active', byStaff: false, staffAdded: false, asked: false, why: null } }] } : d));
  await w.answer(0, boardRes({ days: after }));                    // 첫 날이 빠져 셋 — 날짜 카드 셋으로 바뀐다
  assert.equal(dayCount(w.html()), 3); assert.ok(w.html().includes('지원했어요'));
  assert.deepEqual(w.touched(), ['scroll .duty-day[2026-11-01] start'], '방금 지원한 날짜 카드로');
  // 모양이 그대로면(달력 → 달력 · 카드 → 카드) 보던 자리를 지킨다
  const k = world(); await openBoard(k, calRes()); k.tap({ act: 'apply', d: '1', s: '0' }); await k.settle(); await k.answer(0, { ok: true }); await k.answer(0, calRes({ days: MINE_ON(1) }));
  assert.deepEqual(k.touched(), []);
  // 작은 화면(달력을 맨 위에 붙이면 그 아래 200px 도 안 남는다) — 날짜를 고르면 달력 대신 그날 카드를 맨 위로
  const t = world(); await openBoard(t, calRes()); t.setCalHeight(700);
  t.tapDate('2026-10-25'); assert.deepEqual(t.touched(), ['focus .duty-cal-c.on', 'scroll .duty-day start']);
  t.setCalHeight(400); t.tapDate('2026-10-11'); assert.deepEqual(t.touched(), ['focus .duty-cal-c.on', 'scroll .duty-cal start']);
});

test('잠긴 날 — 다시 묻기 창은 떠 있던 알림이 닫힌 뒤에 띄운다(그 알림을 답 없이 지우지 않는다)', async () => {
  const w = world(); await openBoard(w);
  w.tap({ act: 'apply', d: '0', s: '0' }); await w.settle(); w.setModal(true);            // 다른 일의 알림이 떠 있다
  await w.fail(0, 'locked-day', { ok: false, error: 'locked-day' });
  assert.deepEqual(w.confirms, ['🙋 지원할까요?'], '떠 있는 창을 지우며 띄우지 않는다');
  w.setModal(false); await new Promise((r) => setTimeout(r, 450)); await w.settle();
  assert.deepEqual(w.confirms, ['🙋 지원할까요?', '⚠️ 취소할 수 없는 날이에요']); assert.deepEqual(w.alerts, []);
  // 창이 닫힌 때에 이 당번을 떠났으면 창 대신 안 됐다고 알린다
  const g = world(); await openBoard(g);
  g.tap({ act: 'apply', d: '0', s: '0' }); await g.settle(); g.setModal(true);
  await g.fail(0, 'locked-day', { ok: false, error: 'locked-day' }); g.goHome();
  g.setModal(false); await new Promise((r) => setTimeout(r, 450)); await g.settle();
  assert.deepEqual(g.confirms, ['🙋 지원할까요?']); assert.equal(g.alerts.length, 1); assert.ok(g.alerts[0].includes('지원이 안 됐어요'));
});

test('달력 — 내 당번 카드로 오면 그 날짜를 고르고 달력을 화면에 · 그 날짜가 당번표에 없으면 맨 위 안내 줄을 가리지 않는다', async () => {
  let w = world(); w.ctx.renderDutyBoard('b-1', { focusDate: '2026-11-08' }); await w.answer(0, calRes());
  assert.equal(selOf(w.html()), '2026-11-08'); assert.ok(w.html().includes('<b>2026년 11월</b>'));
  assert.deepEqual(w.touched(), ['scroll .duty-cal start']);
  w = world(); w.ctx.renderDutyBoard('b-1', { focusDate: '2027-03-07' }); await w.answer(0, calRes());
  assert.ok(w.html().includes('3월 7일(일) 당번은 지금 당번표에 보이지 않는 날짜예요')); assert.equal(selOf(w.html()), '2026-10-18');
  assert.deepEqual(w.touched(), [], '달력으로 굴리지 않는다(안내 줄이 보이게)');
});

// ── 2026-10-06 검증(읽기 전용 세 갈래)에서 나온 것 — 일의 답은 「됐다 · 거절 · 알 수 없다」 셋이다 ──
const APPLIED = () => boardRes({ days: [{ ...DAY, slots: [{ ...SLOT, n: 1, names: ['화면점검'], why: 'mine', mine: { id: 5, status: 'active', byStaff: false, staffAdded: false, asked: false, why: null } }] }] });

test('됐는지 알 수 없는 답(통신 끊김·서버 오류) — 「확인하지 못했어요」라고 말하고 화면을 다시 받는다 · 그것도 실패하면 다시 열어 확인하시게', async () => {
  let w = world(); await openBoard(w);
  w.tap({ act: 'apply', d: '0', s: '0' }); await w.settle();
  await w.fail(0, 'Failed to fetch');
  assert.equal(w.alerts.length, 1); assert.ok(w.alerts[0].includes('10월 18일(일) 2부 설거지') && w.alerts[0].includes('됐는지 확인하지 못했어요') && !w.alerts[0].includes('다시 해 주세요'));
  assert.deepEqual(w.names(), ['dutyBoard'], '서버에는 쓰였을 수 있다 — 다시 받아 보여 준다');
  await w.answer(0, APPLIED()); assert.ok(w.html().includes('지원했어요')); assert.equal(w.alerts.length, 1, '받았으면 더 말하지 않는다');
  w.tickTime(16000); w.listeners.visibilitychange(); await w.fail(0, 'Failed to fetch'); assert.equal(w.alerts.length, 1, '그 뒤의 조용한 다시 받기 실패에 다시 말하지 않는다');
  // 다시 받기도 실패 — 한 번 더 알린다
  w = world(); await openBoard(w);
  w.tap({ act: 'apply', d: '0', s: '0' }); await w.settle(); await w.fail(0, 'HTTP 502'); await w.fail(0, 'Failed to fetch');
  assert.equal(w.alerts.length, 2); assert.ok(w.alerts[1].includes('화면을 새로 받지 못했어요') && w.alerts[1].includes('다시 열어 확인해 주세요'));
  // 첫 화면으로 나간 뒤에 온 끊김 — 알리기만 한다(화면을 도로 끌어오지 않는다)
  w = world(); await openBoard(w);
  w.tap({ act: 'apply', d: '0', s: '0' }); await w.settle(); w.goHome(); await w.fail(0, 'Failed to fetch');
  assert.equal(w.alerts.length, 1); assert.deepEqual(w.names(), []); assert.equal(w.shown(), 'HOME');
  // 내 당번의 취소도 같다
  w = world(); w.ctx.renderDutyList(); await w.answer(0, listRes([BOARD], [MINE]));
  w.tap({ act: 'cancel', m: '0' }); await w.settle(); await w.fail(0, 'Failed to fetch');
  assert.ok(w.alerts[0].includes('됐는지 확인하지 못했어요')); assert.deepEqual(w.names(), ['dutyList']);
  // 서버가 거절한 것(표에 있는 코드)은 그대로 — 다시 받을 까닭이 없는 거절은 다시 받지 않는다
  w = world(); await openBoard(w);
  w.tap({ act: 'apply', d: '0', s: '0' }); await w.settle();
  await w.fail(0, 'too-many', { ok: false, error: 'too-many', max: 2 });
  assert.ok(w.alerts[0].includes('두 자리까지 미리 잡아 둘 수 있어요')); assert.deepEqual(w.names(), []);
});

test('일은 됐는데 — 뒤따른 다시 받기가 다른 다시 받기에 밀려났어도, 화면을 못 받았으면 그 일은 됐다고 알린다', async () => {
  let w = world(); await openBoard(w);
  w.tap({ act: 'apply', d: '0', s: '0' }); await w.settle(); await w.answer(0, { ok: true });
  assert.deepEqual(w.names(), ['dutyBoard']);
  w.tickTime(16000); w.listeners.visibilitychange();                 // 다른 앱에 다녀옴 — 조용한 다시 받기가 앞 것을 밀어낸다
  assert.deepEqual(w.names(), ['dutyBoard', 'dutyBoard']);
  await w.fail(0, 'Failed to fetch'); assert.deepEqual(w.alerts, [], '밀려난 요청의 실패는 버려진다');
  await w.fail(0, 'Failed to fetch');
  assert.equal(w.alerts.length, 1, '옛 화면에 「지원하기」가 그대로라 안 된 줄 아신다'); assert.ok(w.alerts[0].startsWith('10월 18일(일) 2부 설거지 — 지원은 됐어요.'));
  // 밀어낸 쪽이 성공하면 말하지 않는다(새 화면에 보인다) · 그 뒤의 실패에도 다시 말하지 않는다
  w = world(); await openBoard(w);
  w.tap({ act: 'apply', d: '0', s: '0' }); await w.settle(); await w.answer(0, { ok: true });
  w.tickTime(16000); w.listeners.visibilitychange(); await w.fail(0, 'Failed to fetch'); await w.answer(0, APPLIED());
  assert.deepEqual(w.alerts, []); assert.ok(w.html().includes('지원했어요'));
  w.tickTime(16000); w.listeners.visibilitychange(); await w.fail(0, 'Failed to fetch'); assert.deepEqual(w.alerts, []);
  // 지원을 보낸 뒤 목록으로 옮겼는데 목록을 못 받았다 — 「불러올 수 없어요」와 함께 그 일은 됐다고 알린다
  w = world(); await openBoard(w);
  w.tap({ act: 'apply', d: '0', s: '0' }); await w.settle(); w.goBack(); await w.answer(0, { ok: true });
  assert.deepEqual(w.names(), ['dutyList', 'dutyList']);
  await w.fail(0, 'Failed to fetch'); await w.fail(0, 'Failed to fetch');
  assert.ok(w.html().includes('지금 불러올 수 없어요')); assert.equal(w.alerts.length, 1); assert.ok(w.alerts[0].startsWith('10월 18일(일) 2부 설거지 — 지원은 됐어요.'));
  // 첫 화면으로 나가면 품고 있던 말을 버린다(다음에 당번을 열었을 때 엉뚱하게 뜨지 않게)
  w = world(); await openBoard(w);
  w.tap({ act: 'apply', d: '0', s: '0' }); await w.settle(); await w.answer(0, { ok: true }); w.goHome(); await w.fail(0, 'Failed to fetch');
  w.ctx.renderDutyList(); await w.fail(0, 'Failed to fetch'); assert.deepEqual(w.alerts, []);
});

test('늦게 온 답 — 풀린 뒤 보낸 다른 일의 막음을 풀지 않는다 · 어느 자리 일인지 말한다 · 로그아웃 뒤에는 알리지 않는다 · 떠 있는 창을 지우지 않는다', async () => {
  const two = () => boardRes({ days: [{ ...DAY, slots: [SLOT, { ...SLOT, id: 12, service: '3부' }] }] });
  let w = world(); await openBoard(w, two());
  w.tap({ act: 'apply', d: '0', s: '0' }); await w.settle();        // 2부 — 답이 안 온다
  w.tickTime(21000);
  w.tap({ act: 'apply', d: '0', s: '1' }); await w.settle();        // 20초가 넘어 풀린 뒤 3부를 보냄
  assert.deepEqual(w.names(), ['dutyApply', 'dutyApply']); assert.equal(w.pending[1].args[0], 12);
  await w.fail(0, 'full', { ok: false, error: 'full' });            // 2부의 늦은 거절
  assert.equal(w.ctx.dutyState.busy, true, '3부를 보내는 중인 막음은 그대로다');
  assert.ok(w.alerts[0].startsWith('10월 18일(일) 2부 설거지 — '), '어느 자리 일인지 말한다(3부가 찬 줄 아시지 않게)');
  await w.answer(0, { ok: true }); assert.equal(w.ctx.dutyState.busy, false, '제 답이 오면 풀린다');
  // 로그아웃·신원 바꿈 뒤에 온 거절 — 앞사람의 당번 이름·시각을 다음 분께 알리지 않는다
  w = world(); await openBoard(w);
  w.tap({ act: 'apply', d: '0', s: '0' }); await w.settle(); w.ctx.dutyResetState();
  await w.fail(0, 'overlap', { ok: false, error: 'overlap', with: { board: '주차 봉사', service: '1부', task: '안내', start: '09:00' } });
  assert.deepEqual(w.alerts, []); assert.deepEqual(w.names(), []);
  // 로그아웃 뒤 다음 분이 같은 당번을 열어 둔 사이 앞사람의 locked-day 가 왔다 — 「취소할 수 없는 날」 창을 다음 분께 띄우지 않는다(누르면 앞사람 이름으로 지원된다)
  w = world(); await openBoard(w);
  w.tap({ act: 'apply', d: '0', s: '0' }); await w.settle(); w.ctx.dutyResetState();
  w.ctx.renderDutyBoard('b-1'); await w.answer(1, boardRes()); assert.equal(w.shown(), 'DUTY[board]');
  await w.fail(0, 'locked-day'); assert.deepEqual(w.confirms, ['🙋 지원할까요?']); assert.deepEqual(w.alerts, []); assert.deepEqual(w.names(), []);
  // 다른 창(확인 창)을 읽는 중에 온 거절 — 그 창을 지우지 않고 닫힌 뒤에 알린다
  w = world(); await openBoard(w);
  w.tap({ act: 'apply', d: '0', s: '0' }); await w.settle(); w.setModal(true);
  await w.fail(0, 'full', { ok: false, error: 'full' });
  assert.deepEqual(w.alerts, [], '떠 있는 창을 지우지 않는다');
  w.setModal(false); await new Promise((r) => setTimeout(r, 450)); await w.settle();
  assert.equal(w.alerts.length, 1, '닫힌 뒤에 알린다'); assert.ok(w.alerts[0].includes('방금 자리가 찼어요'));
});

test('다른 창이 떠 있는 동안에는 화면을 다시 받지 않는다(읽던 창 밑의 화면이 바뀌지 않게) · 서버에 계정이 없다는 답은 닫힘처럼 목록으로', async () => {
  const m = world(); await openBoard(m);
  m.tickTime(16000); m.setModal(true); m.listeners.visibilitychange(); assert.deepEqual(m.names(), []);
  m.setModal(false); m.listeners.visibilitychange(); assert.deepEqual(m.names(), ['dutyBoard']);
  const w = world(); await openBoard(w);
  w.tap({ act: 'apply', d: '0', s: '0' }); await w.settle(); await w.fail(0, 'no-user', { ok: false, error: 'no-user' });
  assert.ok(w.alerts[0].includes('지금은 봉사 당번을 쓸 수 없어요') && !w.alerts[0].includes('로그인')); assert.deepEqual(w.names(), ['dutyList']);
});

// ── 2026-10-07 독립 검토(흐름 갈래)에서 나온 시험 빈 곳 — 지원 쪽에서만 지켜지던 것을 내 줄(취소·표시) 쪽에도 ──
const TWO_MINE = () => listRes([BOARD], [MINE, { ...MINE, id: 6, date: '2026-10-25' }]);

test('내 줄(취소·표시)도 같다 — 늦게 온 답이 남의 막음을 풀지 않는다 · 거절은 자리 이름으로 알리고 다시 받는다 · 로그아웃 뒤에는 알리지 않는다 · 닫힘은 목록으로', async () => {
  // 취소가 21초 넘게 답이 없다 → 다른 줄 취소를 보낸다 → 앞 일의 늦은 거절이 뒤 일의 막음을 풀지 않는다
  let w = world(); w.ctx.renderDutyList(); await w.answer(0, TWO_MINE());
  w.tap({ act: 'cancel', m: '0' }); await w.settle(); w.tickTime(21000);
  w.tap({ act: 'cancel', m: '1' }); await w.settle(); assert.deepEqual(w.names(), ['dutyCancel', 'dutyCancel']);
  await w.fail(0, 'locked', { ok: false, error: 'locked' });
  assert.equal(w.ctx.dutyState.busy, true, '뒤에 보낸 취소의 막음은 그대로다');
  assert.ok(w.alerts[0].startsWith('10월 18일(일) 2부 설거지 — ') && w.alerts[0].includes('확정된 날이라'), '어느 줄의 거절인지 말한다');
  assert.deepEqual(w.names(), ['dutyCancel', 'dutyList'], '다시 받아야 하는 거절 — 목록을 다시 받는다');
  // 취소를 보낸 뒤 로그아웃 — 성공이든 거절이든 알림·다시 받기·품은 말 없음
  for (const end of ['ok', 'no']) {
    w = world(); w.ctx.renderDutyList(); await w.answer(0, TWO_MINE());
    w.tap({ act: 'cancel', m: '0' }); await w.settle(); w.ctx.dutyResetState();
    if (end === 'ok') await w.answer(0, { ok: true }); else await w.fail(0, 'locked', { ok: false, error: 'locked' });
    assert.deepEqual(w.alerts, [], end); assert.deepEqual(w.names(), [], end); assert.equal(w.ctx.dutyState.owe, '', end);
  }
  // 지원도: 로그아웃 뒤 다음 분이 당번을 연 채 앞사람의 OK 가 오면 다시 받지도 품지도 않는다
  w = world(); await openBoard(w); w.tap({ act: 'apply', d: '0', s: '0' }); await w.settle(); w.ctx.dutyResetState();
  w.ctx.renderDutyBoard('b-1'); await w.answer(1, boardRes()); await w.answer(0, { ok: true });
  assert.deepEqual(w.names(), []); assert.equal(w.ctx.dutyState.owe, ''); assert.deepEqual(w.alerts, []);
  // 닫힘(not-open) — 지원·취소 모두 알리고 목록으로
  w = world(); await openBoard(w); w.tap({ act: 'apply', d: '0', s: '0' }); await w.settle(); await w.fail(0, 'not-open', { ok: false, error: 'not-open' });
  assert.ok(w.alerts[0].includes('지금은 봉사 당번을 쓸 수 없어요')); assert.deepEqual(w.names(), ['dutyList']);
  w = world(); w.ctx.renderDutyList(); await w.answer(0, TWO_MINE()); w.tap({ act: 'cancel', m: '0' }); await w.settle(); await w.fail(0, 'not-open', { ok: false, error: 'not-open' });
  assert.ok(w.alerts[0].includes('지금은 봉사 당번을 쓸 수 없어요')); assert.deepEqual(w.names(), ['dutyList']);
  // 취소의 알 수 없는 답 뒤 다시 받기도 실패 — 「화면을 새로 받지 못했어요」 한 번
  w = world(); w.ctx.renderDutyList(); await w.answer(0, TWO_MINE()); w.tap({ act: 'cancel', m: '0' }); await w.settle();
  await w.fail(0, 'Failed to fetch'); await w.fail(0, 'Failed to fetch');
  assert.equal(w.alerts.length, 2); assert.ok(w.alerts[0].startsWith('10월 18일(일) 2부 설거지 — ') && w.alerts[1].includes('화면을 새로 받지 못했어요'));
  // 취소는 됐는데 목록을 못 받았다 — 어느 줄의 일인지 함께(「지원은 됐어요」가 아니다)
  w = world(); w.ctx.renderDutyList(); await w.answer(0, TWO_MINE()); w.tap({ act: 'cancel', m: '0' }); await w.settle();
  await w.answer(0, { ok: true }); await w.fail(0, 'Failed to fetch');
  assert.equal(w.alerts.length, 1); assert.ok(w.alerts[0].startsWith('10월 18일(일) 2부 설거지 — 취소는 됐어요.') && w.alerts[0].includes('다시 열어 확인해 주세요'));
  // 표시 거두기는 까닭 없이(null) 보낸다 · 끝나면 「표시를 거뒀어요.」 · 못 받았으면 「표시는 거뒀어요」(「알렸어요」가 아니다)
  const ASKED = () => listRes([BOARD], [{ ...MINE, locked: true, lockAt: null, asked: true, why: 'cant' }]);
  w = world(); w.ctx.renderDutyList(); await w.answer(0, ASKED());
  w.tap({ act: 'unask', m: '0' }); await w.settle(); assert.deepEqual(w.pending[0].args, [5, UID, null]);
  await w.answer(0, { ok: true }); await w.answer(0, listRes([BOARD], [{ ...MINE, locked: true, lockAt: null }]));
  assert.ok(w.html().includes('표시를 거뒀어요.'));
  w = world(); w.ctx.renderDutyList(); await w.answer(0, ASKED()); w.tap({ act: 'unask', m: '0' }); await w.settle();
  await w.answer(0, { ok: true }); await w.fail(0, 'Failed to fetch');
  assert.ok(w.alerts[0].includes('— 표시는 거뒀어요.') && !w.alerts[0].includes('알렸어요'));
});

test('품은 말(일은 됐는데 화면을 못 받음) — 한 번만 알린다 · 닫힘 답에서도 알린다 · 뒤에 온 거절의 다시 받기가 덮어 지우지 않는다 · 새 화면을 받았으면 미뤄 둔 말은 버린다', async () => {
  // 알린 뒤의 실패에는 또 알리지 않는다
  let w = world(); await openBoard(w);
  w.tap({ act: 'apply', d: '0', s: '0' }); await w.settle(); await w.answer(0, { ok: true }); await w.fail(0, 'Failed to fetch');
  assert.equal(w.alerts.length, 1);
  w.tickTime(16000); w.listeners.visibilitychange(); await w.fail(0, 'Failed to fetch'); assert.equal(w.alerts.length, 1, '같은 말을 실패마다 또 하지 않는다');
  // 닫힘 답(문이 그사이 닫힘)에서도 그 일은 됐다고 알린다
  w = world(); await openBoard(w);
  w.tap({ act: 'apply', d: '0', s: '0' }); await w.settle(); await w.answer(0, { ok: true }); await w.answer(0, { ok: true, open: false });
  assert.equal(w.alerts.length, 1); assert.ok(w.alerts[0].includes('지원은 됐어요.')); assert.ok(w.html().includes('지금은 봉사 당번을 볼 수 없어요'));
  // 성공 A 의 다시 받기가 걸려 있는 사이 B 가 거절됐다 — B 의 다시 받기(말 없는 다시 받기)가 A 의 말을 덮어 지우지 않는다
  const two = () => boardRes({ days: [{ ...DAY, slots: [SLOT, { ...SLOT, id: 12, service: '3부' }] }] });
  w = world(); await openBoard(w, two());
  w.tap({ act: 'apply', d: '0', s: '0' }); await w.settle(); await w.answer(0, { ok: true });      // A 됨 — 다시 받기가 걸려 있다
  w.tap({ act: 'apply', d: '0', s: '1' }); await w.settle(); assert.deepEqual(w.names(), ['dutyBoard', 'dutyApply']);
  await w.fail(1, 'full', { ok: false, error: 'full' });                                            // B 거절 → 다시 받기
  await w.fail(0, 'Failed to fetch'); await w.fail(0, 'Failed to fetch');
  assert.equal(w.alerts.length, 2); assert.ok(w.alerts[0].includes('3부 설거지 — 방금 자리가 찼어요.') && w.alerts[1].startsWith('10월 18일(일) 2부 설거지 — 지원은 됐어요.'));
  // 미뤄 둔 말(다른 창이 떠 있어 기다림)은 뜨는 때에 다시 본다 — 그사이 새 화면을 받았으면 버린다
  w = world(); await openBoard(w);
  w.tap({ act: 'apply', d: '0', s: '0' }); await w.settle(); await w.answer(0, { ok: true }); w.setModal(true);
  await w.fail(0, 'Failed to fetch'); assert.deepEqual(w.alerts, [], '떠 있는 창 뒤에서 기다린다');
  w.ctx.renderDutyBoard('b-1', { soft: true }); await w.answer(0, APPLIED());                       // 그사이 새 화면을 받았다
  w.setModal(false); await new Promise((r) => setTimeout(r, 450)); await w.settle();
  assert.deepEqual(w.alerts, [], '새 화면 위에 「새로 받지 못했어요」를 띄우지 않는다'); assert.ok(w.html().includes('지원했어요'));
  // 기다리는 알림들은 온 차례대로 뜬다
  w = world(); await openBoard(w, two()); w.setModal(true);
  w.ctx.dutyTell('하나'); w.ctx.dutyTell('둘'); assert.deepEqual(w.alerts, []);
  w.setModal(false); await new Promise((r) => setTimeout(r, 450)); assert.deepEqual(w.alerts, ['하나', '둘']);
});

test('잠긴 날 — 다른 당번을 보고 있으면 「취소할 수 없는 날」 창 대신 안 됐다고 알린다', async () => {
  const w = world(); await openBoard(w);
  w.tap({ act: 'apply', d: '0', s: '0' }); await w.settle();
  w.ctx.renderDutyBoard('b-2'); await w.answer(1, boardRes({ board: { id: 'b-2', title: '주차 봉사', status: 'open' } }));
  await w.fail(0, 'locked-day', { ok: false, error: 'locked-day' });
  assert.deepEqual(w.confirms, ['🙋 지원할까요?']); assert.equal(w.alerts.length, 1); assert.ok(w.alerts[0].includes('2부 설거지 지원이 안 됐어요'));
});
