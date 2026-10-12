// 필요할 때 받는 화면 코드(2026-10-12) — 🎓 js/edu.js · 🙋 js/duty.js 를 첫 실행에 받지 않는다(docs/notes/lazy-load.md · 꾸러미 없음 · preflight 가 건다)
//   app.js 의 로더 구간(표식 「필요할 때 받는 화면 코드」 ~ 「말씀 데이터」)을 떼어 가짜 document 위에서 돌린다.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = (...f) => fs.readFileSync(path.join(__dirname, '..', ...f), 'utf8').replace(/\r\n/g, '\n');
const APP = read('app.js'), INDEX = read('index.html');
const SEG = APP.slice(APP.indexOf('// ── 필요할 때 받는 화면 코드'), APP.indexOf('// 말씀 데이터: 정적'));

// 가짜 브라우저 — 붙인 <script> 는 ok(src) 가 참이면 다음 차례에 onload(그때 그 파일의 대표 함수를 window 에 단다) · 아니면 onerror
function mk(opt) {
  const o = Object.assign({ search: '', appSrc: 'https://x/app.js?v=TAG1', ok: () => true }, opt);
  const added = [];
  const win = {};
  const ctx = {
    APP_BUILD: 'BUILD', Promise, setTimeout, location: { search: o.search }, window: win,
    document: {
      querySelector: (sel) => (sel === 'script[src*="app.js"]' && o.appSrc ? { src: o.appSrc } : null),
      createElement: () => ({ remove() { this.removed = true; } }),
      head: { appendChild: (s) => { added.push(s); setTimeout(() => {
        if (o.ok(s.src)) { if (/edu\.js/.test(s.src)) win.renderEduList = () => {}; if (/duty\.js/.test(s.src)) win.renderDutyList = () => {}; s.onload(); }
        else s.onerror();
      }, 0); } },
    },
  };
  vm.createContext(ctx); vm.runInContext(SEG, ctx);
  return { ctx, added, win };
}

test('index.html 은 교육·당번 화면 코드를 처음부터 부르지 않는다 · 첫 화면이 쓰는 psalm·events 는 그대로', () => {
  assert.ok(SEG.length > 200, '로더 구간을 못 찾았다');
  assert.ok(!/src="js\/edu\.js/.test(INDEX) && !/src="js\/duty\.js/.test(INDEX));
  for (const f of ['js/config.js', 'js/api.js', 'js/push.js', 'js/psalm.js', 'js/events.js', 'app.js']) assert.ok(INDEX.includes('src="' + f + '?v='), f);
});

test('loadLazyJs — 한 번만 받는다 · app.js 를 부른 ?v= 를 붙인다 · 실패하면 잊어서 다시 받는다 · 이미 있으면 받지 않는다', async () => {
  let r = mk();
  const a = r.ctx.loadLazyJs('duty'), b = r.ctx.loadLazyJs('duty');
  assert.equal(a, b, '같은 약속');
  await a;
  assert.deepEqual(r.added.map((s) => s.src), ['js/duty.js?v=TAG1']);
  await r.ctx.loadLazyJs('duty');
  assert.equal(r.added.length, 1, '받은 뒤에는 다시 받지 않는다');
  // 태그를 못 읽으면 APP_BUILD
  r = mk({ appSrc: null }); await r.ctx.loadLazyJs('edu'); assert.deepEqual(r.added.map((s) => s.src), ['js/edu.js?v=BUILD']);
  // 실패 → 거절 · 붙인 줄은 걷고 · 다음 부름은 새로 받는다
  let fail = true;
  r = mk({ ok: () => !fail });
  await assert.rejects(r.ctx.loadLazyJs('edu'));
  assert.equal(r.added[0].removed, true);
  fail = false; await r.ctx.loadLazyJs('edu');
  assert.equal(r.added.length, 2);
  // 모르는 이름은 거절 · 이미 함수가 있으면(옛 판·시험 도구) 받지 않는다
  await assert.rejects(r.ctx.loadLazyJs('nope'));
  r = mk(); r.win.renderDutyList = () => {}; await r.ctx.loadLazyJs('duty'); assert.equal(r.added.length, 0);
});

test('withLazyJs — 실려 있으면 그 자리에서(기다리지 않는다) · 아니면 받은 뒤 · 받기에 실패해도 부른다(부르는 쪽 typeof 가 「못 불러왔어요」를 알린다)', async () => {
  let r = mk(); r.win.renderEduList = () => {};
  let n = 0; r.ctx.withLazyJs('edu', () => { n++; }); assert.equal(n, 1, '동기로');
  r = mk(); n = 0; r.ctx.withLazyJs('duty', () => { n++; }); assert.equal(n, 0); await new Promise((ok) => setTimeout(ok, 5)); assert.equal(n, 1);
  r = mk({ ok: () => false }); n = 0; r.ctx.withLazyJs('duty', () => { n++; }); await new Promise((ok) => setTimeout(ok, 5)); assert.equal(n, 1);
});

test('lazyJsForUrl — 알림 주소를 eduTakeDeepLink·dutyDeepLink 와 같은 규칙으로 읽는다 · 주소가 아니면 아무것도 받지 않는다', async () => {
  const need = async (u) => { const r = mk(); const p = r.ctx.lazyJsForUrl(u); if (p) await p; return [p === null, r.added.map((s) => s.src.split('?')[0])]; };
  assert.deepEqual(await need('?edu=0b3c'), [false, ['js/edu.js']]);
  assert.deepEqual(await need('https://gocheok.onlybible.kr/?duty=1'), [false, ['js/duty.js']]);
  assert.deepEqual(await need('?from=push&duty=1'), [false, ['js/duty.js']]);
  assert.deepEqual(await need('?duty=1&from=push#x'), [false, ['js/duty.js']]);
  for (const u of ['', '?v=38', '?duty=2', '?duty=10', '?x=1#duty=1', undefined, null]) assert.deepEqual(await need(u), [true, []], String(u));
  // 처음 실행: 주소에 없으면 _lazyDeepP 는 null(평소 첫 화면은 기다리지 않는다)
  assert.equal(mk({ search: '?v=38' }).ctx._lazyDeepP, null);
  assert.notEqual(mk({ search: '?duty=1' }).ctx._lazyDeepP, null);
  // 받기에 실패해도 풀린다(그때는 파일이 안 실렸을 때와 같이 평소 길)
  const r = mk({ ok: () => false }); await r.ctx.lazyJsForUrl('?edu=1');
});

test('배선 — 말씀을 받은 뒤 routeAfterLoad 앞에서 기다린다 · 열린 창의 알림 · 단추(누를 때 받고 · 보이면 미리)', () => {
  const lv = APP.slice(APP.indexOf('async function loadVerses() {'), APP.indexOf('\n}\n', APP.indexOf('async function loadVerses() {')));
  const waits = lv.split('if (_lazyDeepP) await _lazyDeepP;').length - 1, routes = lv.split('routeAfterLoad();').length - 1;
  assert.equal(routes, 2); assert.equal(waits, 2, 'routeAfterLoad 마다 앞에서');
  assert.ok(APP.includes('const lazyP = lazyJsForUrl(e.data.url);\n    if (lazyP) lazyP.then(() => fromPushOpen(e)); else fromPushOpen(e);'));
  for (const [n, fn] of [['edu', 'renderEduList'], ['duty', 'renderDutyList']]) {
    assert.ok(APP.includes('lifeEnter(() => withLazyJs("' + n + '", () => {') && APP.includes('if (typeof ' + fn + ' === "function") ' + fn + '();'), n + ' 단추');
    assert.ok(APP.includes('    if (b) lazyJsSoon("' + n + '"); }'), n + ' 단추가 보일 때만 미리');
  }
});

// ⚠️ app.js 가 두 파일의 전역을 새로 부르기 시작하면 여기서 걸린다 — 그 자리가 첫 화면(동기)이면 파일이 아직 없다.
//    문 판단(eduVisible·dutyVisible)처럼 첫 화면이 쓰는 것은 app.js 에 두고, 화면 코드를 부르는 자리는 withLazyJs·typeof 로 지킨다(docs/notes/lazy-load.md).
test('app.js 가 부르는 교육·당번 전역은 아는 것뿐(모두 typeof 로 지키거나 받은 뒤에 부른다)', () => {
  const ALLOWED = ['eduTakeDeepLink', 'eduDeepLinkId', 'renderEduCourse', 'renderEduList', 'dutyTakeDeepLink', 'dutyDeepLink', 'renderDutyList', 'dutyResetState'];
  const used = new Set();
  for (const f of ['edu', 'duty']) {
    const names = (read('js', f + '.js').match(/^(?:async )?function [A-Za-z0-9_$]+|^(?:var|let|const) [A-Za-z0-9_$]+/gm) || []).map((s) => s.split(' ').pop());
    for (const nm of names) if (new RegExp('\\b' + nm.replace(/\$/g, '\\$') + '\\b').test(APP)) used.add(nm);
  }
  assert.deepEqual([...used].filter((x) => !ALLOWED.includes(x)), [], '새로 부르는 전역 — docs/notes/lazy-load.md 를 읽고 이 목록에 더할 것');
  for (const nm of ALLOWED) for (const m of APP.matchAll(new RegExp('\\b' + nm + '\\(', 'g'))) {
    const line = APP.slice(APP.lastIndexOf('\n', m.index) + 1, APP.indexOf('\n', m.index));
    const before = APP.slice(APP.lastIndexOf('\n', m.index) + 1, m.index);
    if (/^\s*\/\/|\s\/\/ /.test(before)) continue;   // 주석 속 이름
    assert.ok(line.includes('typeof ' + nm + ' === "function"') || (nm === 'renderEduCourse' && line.includes('if (_eduDeep && loadUser()')), nm + ' — typeof 로 지키지 않은 부름: ' + line.trim());
  }
});
