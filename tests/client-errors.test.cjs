// 화면 오류 모으기(2026-10-12 · docs/notes/client-errors.md) — 개인 값을 싣지 않는가 · 문이 닫히면 아무것도 안 보내는가.
//
//   node --test tests/client-errors.test.cjs
//
// ⚠️ **꾸러미를 하나도 쓰지 않는다**(node:test·node:assert·node:fs·node:path·node:vm 뿐) — tools/preflight.py 가 배포 앞 그물에 건다.
//
// 무엇을 지키나
//   ① 앱(app.js 「화면 오류 모으기」 덩어리)을 가짜 window 위에서 돌려 오류를 일으키고, 나간 몸을 글자로 본다 —
//      칸은 정해진 일곱(action·build·shell·screen·msg·src·browser)뿐 · 심어 둔 개인 값(이름·소속·계정 번호·전화·전자우편·주소의 ? 뒤·UA 원문·기기 토큰)이 한 글자도 없다.
//   ② 문이 닫혔거나 모르면(캐시 없음) 한 건도 안 보낸다 · 같은 오류는 하루 한 번 · 한 번 열 때 다섯 건까지 · 통신 끊김·남의 스크립트는 안 보낸다.
//   ③ 서버(client-errors.ts)의 cerrClean — 아는 칸만 옮긴다(user_id 등은 버린다) · 앱과 서버의 cerrScrub 이 같은 글자다.
//   ④ 문 · 잠금 — errorLogOn 이 공개 키 목록에 있고 서버가 `=== true` 로 본다 · 표에 RLS·revoke · users 를 가리키는 칸이 없다.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const APP = read('app.js');
const SRV = read('supabase/functions/api/client-errors.ts');
const INDEX = read('supabase/functions/api/index.ts');
const SQL = read('supabase/client_errors.sql');

function cut(src, a, b, what) {
  const i = src.indexOf(a), j = src.indexOf(b, i + 1);
  assert.ok(i >= 0 && j > i, what + ' 의 표식을 못 찾았다 — 이 검사가 낡았다');
  return src.slice(i, j);
}
const APP_BLOCK = cut(APP, '// ── 화면 오류 모으기 (여기부터) ──', '// ── 화면 오류 모으기 (여기까지) ──', 'app.js');
const SRV_PURE = cut(SRV, '// ── 화면 오류 — 순수 함수 (여기부터) ──', '// ── 화면 오류 — 순수 함수 (여기까지) ──', 'client-errors.ts');

// 심어 둔 개인 값 — 이것들이 나가는 몸에 한 글자라도 있으면 실패
const UID = '3f2b8c1e-9a4d-4e2f-8b1c-7d6e5f4a3b2c';
const NAME = '홍길동', GU = '제7교구', MOK = '사랑목장', PHONE = '010-1234-5678', MAIL = 'hong.gildong@example.com';
const DEVICE = 'dev-tok-ABCDEF123456';
const UA = 'Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.6668.100 Mobile Safari/537.36 SamsungBrowser/26.0';
const HREF = 'https://gocheok.onlybible.kr/?v=38&lang=en&name=' + encodeURIComponent(NAME);

function makeEnv(opts) {
  const o = opts || {};
  const store = new Map(Object.entries(Object.assign({
    'memorize-user': JSON.stringify({ user_id: UID, name: NAME, gu: GU, mok: MOK, type: '교구' }),
    'life-device': DEVICE,
  }, o.open === undefined ? { 'errlog-open': '1' } : o.open === null ? {} : { 'errlog-open': o.open })));
  const handlers = {};
  const sent = [];
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { if (o.storageThrows) throw new Error('quota'); store.set(k, String(v)); },
    removeItem: (k) => store.delete(k),
  };
  const window = {
    addEventListener: (t, f) => { (handlers[t] = handlers[t] || []).push(f); },
    SUPA: { URL: 'https://ktpwthwqzgcqcrmsafdo.supabase.co', ANON: 'anon-key' },
    api: { getConfig: () => Promise.resolve({ value: o.serverOpen === undefined ? true : o.serverOpen }) },
  };
  const ctx = {
    window, localStorage, console,
    navigator: { userAgent: UA, maxTouchPoints: 5 },
    location: { href: HREF, origin: 'https://gocheok.onlybible.kr' },
    URL, JSON, Date, Promise, String, Array, Math,
    APP_BUILD: '20261012d',
    setTimeout: (f) => { if (o.runTimers) f(); return 0; },
    fetch: (url, init) => { sent.push({ url, init }); return Promise.resolve({ ok: true }); },
    isNativeApp: () => false,
    openedByPlayApp: () => !!o.play,
  };
  ctx.api = window.api;
  vm.createContext(ctx);
  vm.runInContext(APP_BLOCK, ctx);
  const fire = (t, ev) => (handlers[t] || []).forEach((f) => f(ev));
  return { ctx, store, sent, fire, handlers };
}

// 개인 값이 섞인 오류 — 이름이 든 글자는 앱 코드가 만들 일이 없지만, 주소·번호·전자우편은 오류 글에 섞여 올 수 있다
function personalError() {
  const err = new Error('x');
  err.stack = 'TypeError: x\n    at renderTestScreen (' + HREF + '/app.js?v=20261012d:6612:15)\n    at https://gocheok.onlybible.kr/app.js?v=20261012d:100:3';
  return {
    message: 'TypeError: Cannot read properties of undefined (reading \'no\') at ' + HREF + ' for ' + UID + ' tel ' + PHONE + ' mail ' + MAIL,
    filename: 'https://gocheok.onlybible.kr/app.js?v=20261012d&u=' + UID, lineno: 6612, colno: 15, error: err,
  };
}

test('① 나가는 몸은 일곱 칸뿐 · 심어 둔 개인 값이 한 글자도 없다', () => {
  const env = makeEnv();
  env.fire('error', personalError());
  assert.equal(env.sent.length, 1, '문이 열린 채 오류 한 건이면 한 번 보낸다');
  const { url, init } = env.sent[0];
  assert.equal(url, 'https://ktpwthwqzgcqcrmsafdo.supabase.co/functions/v1/api');
  const raw = init.body;
  const body = JSON.parse(raw);
  assert.deepEqual(Object.keys(body).sort(), ['action', 'browser', 'build', 'msg', 'screen', 'shell', 'src'],
    '보내는 칸이 바뀌었다 — 개인정보 안내(docs/notes/client-errors.md)부터 고칠 것');
  assert.equal(body.action, 'clientError');
  assert.equal(body.build, '20261012d');
  assert.equal(body.shell, 'web');
  assert.equal(body.screen, 'renderTestScreen');
  assert.equal(body.src, 'app.js:6612:15');
  assert.equal(body.browser, 'android-samsung');
  assert.ok(body.msg.length <= 200);
  for (const bad of [UID, NAME, encodeURIComponent(NAME), GU, MOK, PHONE, '1234-5678', '5678', MAIL, 'example.com', DEVICE,
    '?v=', 'v=38', 'lang=', 'name=', 'user_id', 'Build/UP1A', 'SM-S918N', 'Mozilla', UA, 'stack', '    at ']) {
    assert.ok(!raw.includes(bad), '나가는 몸에 「' + bad + '」 가 있다: ' + raw);
  }
  // 머리에도 기기 토큰·계정이 없다(supaCall 을 안 쓰는 까닭)
  assert.ok(!JSON.stringify(init.headers).includes(DEVICE));
  assert.equal(init.keepalive, true);
});

test('① 약속 거절(unhandledrejection)도 같은 칸 · 같은 거름', () => {
  const env = makeEnv();
  const r = new Error('저장 실패 ' + UID + ' ' + HREF);
  r.stack = 'Error: x\n    at supaCall (https://gocheok.onlybible.kr/js/api.js?v=1:22:30)\n    at renderSummary (https://gocheok.onlybible.kr/app.js?v=1:3000:5)';
  env.fire('unhandledrejection', { reason: r });
  assert.equal(env.sent.length, 1);
  const body = JSON.parse(env.sent[0].init.body);
  assert.deepEqual(Object.keys(body).sort(), ['action', 'browser', 'build', 'msg', 'screen', 'shell', 'src']);
  assert.equal(body.src, 'js/api.js:22:30');
  assert.equal(body.screen, 'renderSummary');
  assert.ok(body.msg.startsWith('(promise) Error: 저장 실패'));
  for (const bad of [UID, '?v=', 'name=', NAME]) assert.ok(!env.sent[0].init.body.includes(bad), bad);
});

test('② 문이 닫혔거나 모르면 한 건도 안 보낸다', () => {
  for (const open of ['0', null, 'true', '']) {
    const env = makeEnv({ open });
    env.fire('error', personalError());
    env.fire('unhandledrejection', { reason: new Error('boom') });
    assert.equal(env.sent.length, 0, 'errlog-open=' + open + ' 인데 보냈다');
  }
});

test('② 문 캐시는 서버 값이 true 하나일 때만 열린다', async () => {
  for (const [v, want] of [[true, '1'], [false, '0'], ['true', '0'], [1, '0'], [null, '0']]) {
    const env = makeEnv({ open: null, serverOpen: v, runTimers: true });
    await new Promise((r) => setImmediate(r));
    assert.equal(env.store.get('errlog-open'), want, 'errorLogOn=' + JSON.stringify(v));
  }
});

test('② 같은 오류는 하루 한 번 · 한 번 열 때 다섯 건까지 · 통신 끊김·남의 스크립트는 안 보낸다', () => {
  const env = makeEnv();
  env.fire('error', personalError());
  env.fire('error', personalError());
  assert.equal(env.sent.length, 1, '같은 오류를 두 번 보냈다');
  // 새로 연 실행(같은 저장소)에서도 오늘은 다시 안 보낸다
  const again = makeEnv();
  again.store.set('errlog-sent', env.store.get('errlog-sent'));
  again.fire('error', personalError());
  assert.equal(again.sent.length, 0, '하루 한 번인데 새 실행에서 다시 보냈다');

  const many = makeEnv();
  for (let i = 0; i < 9; i++) many.fire('error', { message: 'ReferenceError: x' + i + ' is not defined', filename: 'https://gocheok.onlybible.kr/app.js', lineno: 10 + i, colno: 1 });
  assert.equal(many.sent.length, 5, '한 번 열 때 다섯 건까지');

  const quiet = makeEnv();
  quiet.fire('unhandledrejection', { reason: new TypeError('Failed to fetch') });
  quiet.fire('unhandledrejection', { reason: new TypeError('Load failed') });
  quiet.fire('error', { message: 'Script error.', filename: '', lineno: 0, colno: 0 });
  quiet.fire('error', { message: 'TypeError: y', filename: 'chrome-extension://abc/content.js', lineno: 1, colno: 1 });
  quiet.fire('error', { message: '' });   // 자원 오류(그림·스크립트 못 받음)
  quiet.fire('unhandledrejection', { reason: undefined });
  assert.equal(quiet.sent.length, 0, JSON.stringify(quiet.sent.map((x) => x.init.body)));
});

test('② 이 덩어리 스스로 오류를 내지 않는다 — 저장소가 던져도 · fetch 가 없어도', () => {
  const env = makeEnv({ storageThrows: true });
  assert.doesNotThrow(() => env.fire('error', personalError()));
  assert.equal(env.sent.length, 1);
  const env2 = makeEnv();
  env2.ctx.fetch = undefined;
  assert.doesNotThrow(() => env2.fire('error', personalError()));
  assert.doesNotThrow(() => env2.fire('error', null));
  assert.doesNotThrow(() => env2.fire('unhandledrejection', null));
});

test('② 플레이 앱이면 shell=play', () => {
  const env = makeEnv({ play: true });
  env.fire('error', personalError());
  assert.equal(JSON.parse(env.sent[0].init.body).shell, 'play');
});

function serverPure() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(SRV_PURE + '\nthis.cerrClean = cerrClean; this.cerrScrub = cerrScrub;', ctx);
  return ctx;
}

test('③ 서버 cerrClean — 아는 칸만 옮긴다 · 꼴이 틀리면 빈 칸', () => {
  const { cerrClean } = serverPure();
  const out = cerrClean({
    action: 'clientError', user_id: UID, name: NAME, gu: GU, device: DEVICE, stack: 'at x', href: HREF, ua: UA,
    build: '20261012d', shell: 'web', screen: 'renderSummary', msg: 'TypeError: a\nsecond line ' + UID, src: 'app.js:1:2', browser: 'ios-safari',
  });
  assert.deepEqual(Object.keys(out).sort(), ['browser', 'build', 'msg', 'screen', 'shell', 'src']);
  assert.equal(out.msg, 'TypeError: a');
  assert.ok(!JSON.stringify(out).includes(UID) && !JSON.stringify(out).includes(NAME));
  const bad = cerrClean({ build: '<script>', shell: 'hack', screen: 'render Summary', msg: 'x'.repeat(500), src: '/etc/passwd?x=1', browser: UA });
  assert.equal(bad.build, '');
  assert.equal(bad.shell, 'other');
  assert.equal(bad.screen, '');
  assert.equal(bad.msg.length, 200);
  assert.equal(bad.src, '');
  assert.equal(bad.browser, 'other-other');
  assert.equal(cerrClean({ msg: '   ' }), null);
  assert.equal(cerrClean(null), null);
});

test('③ 앱과 서버의 cerrScrub 은 같은 글자다', () => {
  const fnOf = (src) => { const m = /function cerrScrub\(v\) \{[\s\S]*?\n\}/.exec(src); assert.ok(m, 'cerrScrub 을 못 찾았다'); return m[0]; };
  assert.equal(fnOf(APP_BLOCK), fnOf(SRV_PURE), '앱과 서버의 거름 규칙이 갈렸다 — 두 곳을 함께 고칠 것');
  const { cerrScrub } = serverPure();
  const s = cerrScrub('at ' + HREF + ' id ' + UID + ' ' + PHONE + ' ' + MAIL + ' ./x?token=abc');
  for (const bad of [UID, PHONE, MAIL, '?v=', 'token=abc', 'name=']) assert.ok(!s.includes(bad), bad + ' → ' + s);
});

test('④ 문 · 잠금 — 공개 키 목록 · 서버 문 · RLS·revoke · users 칸 없음', () => {
  const keys = /const PUBLIC_CONFIG_KEYS = new Set\(\[([^\]]*)\]\)/.exec(INDEX);
  assert.ok(keys && /"errorLogOn"/.test(keys[1]), 'errorLogOn 이 PUBLIC_CONFIG_KEYS 에 없다 — 켜도 앱이 영영 모른다');
  assert.match(INDEX, /^\s*case "clientError":\s*return json\(await clientError\(body\)\);/m);
  assert.match(INDEX, /^import \{ clientError \} from "\.\/client-errors\.ts";/m);
  assert.match(SRV, /\.eq\("key", "errorLogOn"\)/);
  assert.match(SRV, /data\?\.value !== true\) return \{ ok: true, skipped: "closed" \}/, '서버 문은 true 하나만 연다');
  assert.ok(!/user_id|users/.test(SRV.replace(/\/\/.*$/gm, '')), '서버 영역이 user_id·users 를 만진다');
  assert.match(SQL, /alter table public\.client_errors enable row level security;/);
  assert.match(SQL, /revoke all on public\.client_errors from public, anon, authenticated;/);
  assert.match(SQL, /revoke all on function public\.v2_client_error\(text, text, text, text, text, text\) from public, anon, authenticated;/);
  const table = /create table if not exists public\.client_errors \(([\s\S]*?)\n\);/.exec(SQL);
  assert.ok(table, '표 정의를 못 찾았다');
  assert.ok(!/user_id|references|users|name\b|ip\b|ua\b|stack/i.test(table[1].replace(/--.*$/gm, '')), '표에 개인 값 칸이 생겼다');
  assert.ok(!/to authenticated/i.test(SQL.replace(/--.*$/gm, '')), 'TO authenticated 금지');
  assert.match(SQL, /interval|- 90/);
});
