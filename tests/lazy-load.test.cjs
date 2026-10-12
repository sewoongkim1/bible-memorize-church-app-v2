// 필요할 때 받는 화면 코드(2026-10-12) — 🎓 js/edu.js · 🙋 js/duty.js · 🙏 js/prayer.js · ✍️ js/pilsa.js 를 첫 실행에 받지 않는다(docs/notes/lazy-load.md · 꾸러미 없음 · preflight 가 건다)
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
  let win;   // = ctx — 브라우저처럼 window 가 곧 전역이다(받은 파일의 함수 선언은 window 에도 · 전역 이름으로도 보인다)
  const alerts = [];
  const ctx = {
    APP_BUILD: 'BUILD', Promise, setTimeout, location: { search: o.search }, appAlert: (m) => alerts.push(m),
    document: {
      querySelector: (sel) => (sel === 'script[src*="app.js"]' && o.appSrc ? { src: o.appSrc } : null),
      createElement: () => ({ remove() { this.removed = true; } }),
      head: { appendChild: (s) => { added.push(s); setTimeout(() => {
        if (o.ok(s.src)) { for (const k in ctx.LAZY_JS) if (s.src.startsWith(ctx.LAZY_JS[k].src + '?')) win[ctx.LAZY_JS[k].fn] = () => {}; s.onload(); }
        else s.onerror();
      }, 0); } },
    },
  };
  win = ctx.window = ctx;
  vm.createContext(ctx); vm.runInContext(SEG, ctx);
  return { ctx, added, win, alerts };
}

test('index.html 은 교육·당번 화면 코드를 처음부터 부르지 않는다 · 첫 화면이 쓰는 psalm·events 는 그대로', () => {
  assert.ok(SEG.length > 200, '로더 구간을 못 찾았다');
  for (const f of ['edu', 'duty', 'prayer', 'pilsa']) assert.ok(!INDEX.includes('src="js/' + f + '.js'), f);
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
  assert.deepEqual(await need('?w=prayer'), [false, ['js/prayer.js']], '기도문 위젯');
  for (const u of ['', '?v=38', '?duty=2', '?duty=10', '?x=1#duty=1', '?w=meditation', '?w=psalm', '?w=prayers', '?x=1#w=prayer', undefined, null]) assert.deepEqual(await need(u), [true, []], String(u));
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

// ── 🙏 기도문 화면 · ✍️ 필사 신청(2026-10-12 · app.js 에서 떼어 냈다) ──────────────
const MODS = { prayer: { file: 'js/prayer.js', fn: 'renderPrayerBook', open: 'openPrayerBook' }, pilsa: { file: 'js/pilsa.js', fn: 'renderPilsaApply', open: 'openPilsaApply' } };
const declOf = (t) => (t.match(/^(?:async )?function [A-Za-z0-9_$]+|^(?:var|let|const|class) [A-Za-z0-9_$]+/gm) || []).map((x) => x.split(' ').pop());
const codeOnly = (t) => t.split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '')).join('\n');
const wordRe = (n) => new RegExp('(?<![A-Za-z0-9_$."\'])' + n.replace(/\$/g, '\\$') + '(?![A-Za-z0-9_$:"\'])');   // 속성 이름(.x · x:)·글자("x" — api.js 의 액션 이름)는 빼고

test('openPrayerBook·openPilsaApply — 받은 뒤 그 화면 · 실려 있으면 그 자리에서 · 받기 실패면 까닭을 알린다', async () => {
  const tick = () => new Promise((ok) => setTimeout(ok, 5));
  let r = mk(); let got = null;
  r.ctx.openPrayerBook(7); await tick();
  assert.deepEqual(r.added.map((s) => s.src), ['js/prayer.js?v=TAG1']);
  r.win.renderPrayerBook = (i) => { got = i; };   // 받은 뒤의 진짜 함수 자리
  r.ctx.openPrayerBook(3); assert.equal(got, 3, '실려 있으면 동기로 · 인자(편 번호)를 그대로');
  r = mk(); let n = 0; r.win.renderPilsaApply = () => { n++; assert.equal(r.ctx.pilsaLoaded, false, '들어올 때마다 서버에서 지금 상태'); };
  r.ctx.pilsaLoaded = true; r.ctx.openPilsaApply(); assert.equal(n, 1); assert.equal(r.added.length, 0);
  for (const k of ['prayer', 'pilsa']) {
    r = mk({ ok: () => false }); r.ctx[MODS[k].open](); await tick();
    assert.equal(r.alerts.length, 1, k + ' 실패 알림'); assert.match(r.alerts[0], /못 불러왔어요/);
  }
});

test('기도문·필사 — 들어오는 길은 모두 open… 을 거친다(단추 · 묵상 창 · 위젯 · ?preview=)', () => {
  const code = codeOnly(APP);
  for (const k of Object.keys(MODS)) {
    const { fn, open } = MODS[k];
    // 화면 함수를 직접 부르는 곳은 open… 안의 typeof 줄 하나뿐
    const direct = code.split('\n').filter((l) => new RegExp('\\b' + fn + '\\(').test(l));
    assert.equal(direct.length, 1, fn + ' 은 ' + open + ' 안에서만: ' + direct.map((l) => l.trim()).join(' / '));
    assert.ok(direct[0].includes('typeof ' + fn + ' === "function"'), fn + ' 를 typeof 없이 부른다');
  }
  assert.ok(APP.includes('if (widgetTo === "prayer") { openPrayerBook(); return; }'), '위젯');
  assert.ok(APP.includes('setTimeout(() => openPrayerBook(), 260);'), '묵상 창 「축복 기도문」');
  assert.ok(APP.includes('addEventListener("click", () => openPrayerBook());'), '첫 화면 단추');
  assert.ok(APP.includes('if (loadUser()) openPrayerBook(); else renderEntryScreen();') && APP.includes('if (loadUser()) openPilsaApply(); else renderEntryScreen();'), '?preview=');
  assert.ok(APP.includes('loadLazyJs("pilsa").catch(() => {}); lifeEnter(() => openPilsaApply());'), '필사 단추 — 확인 번호 문을 묻는 동안 받는다');
});

// ⚠️ 떼어 낸 파일의 전역을 app.js·처음부터 실리는 js 가 새로 부르기 시작하면 걸린다 — 첫 화면(동기)이면 파일이 아직 없다.
//    반대로 첫 화면·묵상 창·위젯 대조 시험(tests/widget-parity.py)·다른 js 가 동기로 쓰는 것을 그 파일로 옮기면 걸린다.
test('기도문·필사 — 떼어 낸 파일의 전역은 app.js 가 typeof 로만 · 처음부터 실리는 js 는 안 부른다 · 남겨야 할 것은 app.js 에', () => {
  const ALLOWED = { renderPrayerBook: 'renderPrayerBook', renderPilsaApply: 'renderPilsaApply', pilsaLoaded: 'renderPilsaApply' };   // 이름 → 그 줄이 지켜야 할 typeof
  const EAGER = ['js/config.js', 'js/api.js', 'js/push.js', 'js/psalm.js', 'js/events.js'];
  for (const k of Object.keys(MODS)) {
    const names = declOf(read(MODS[k].file));
    assert.ok(names.includes(MODS[k].fn), MODS[k].fn);
    for (const nm of names) {
      const re = wordRe(nm);
      for (const l of codeOnly(APP).split('\n')) if (re.test(l) && !l.includes('fn: "' + nm + '"')) {
        assert.ok(ALLOWED[nm], nm + ' — app.js 가 새로 부른다(docs/notes/lazy-load.md): ' + l.trim());
        assert.ok(l.includes('typeof ' + ALLOWED[nm] + ' === "function"'), nm + ' — typeof 로 지키지 않았다: ' + l.trim());
      }
      for (const f of EAGER) assert.ok(!re.test(codeOnly(read(...f.split('/')))), nm + ' — ' + f + ' 가 부른다(처음부터 실리는 파일이라 아직 없다)');
    }
  }
  const appDecl = new Set(declOf(APP));
  // tests/widget-parity.py 가 운영 사이트에서 부른다 · 묵상 창 「🙏 기도」 · js/psalm.js 의 PRAY_ORN · 사역신청·js/events.js 의 번호 꼴 · 여러 화면의 logFeature
  for (const nm of ['loadPrayers', 'prayToday', 'prayFill', 'prayFillHtml', 'fetchTodayBlessing', 'openBlessingModal', 'PRAY_ORN', 'logFeature', 'pilsaPhoneFmt', 'pilsaPhoneOk', 'openPrayerBook', 'openPilsaApply'])
    assert.ok(appDecl.has(nm), nm + ' 은 app.js 에 남아야 한다');
});

test('지연 파일 넷 — 서로·처음부터 실리는 js 와 이름이 겹치지 않는다(겹치면 받는 순간 SyntaxError · 함수끼리면 조용히 덮는다)', () => {
  const owner = new Map();
  for (const f of ['app.js', 'js/config.js', 'js/api.js', 'js/push.js', 'js/psalm.js', 'js/events.js', 'js/edu.js', 'js/duty.js', 'js/prayer.js', 'js/pilsa.js'])
    for (const nm of new Set(declOf(read(...f.split('/'))))) {
      if (owner.has(nm)) assert.fail(nm + ' — ' + owner.get(nm) + ' 와 ' + f + ' 에 둘 다 있다');
      owner.set(nm, f);
    }
});
