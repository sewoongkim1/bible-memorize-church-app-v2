// npm install --prefix <test-dir> --no-package-lock @electric-sql/pglite@0.3.14 typescript@5.9.3 jsdom@26.1.0
// NODE_PATH=<test-dir>/node_modules node --test tests/member-profile.test.cjs
// In-memory PostgreSQL and mocked DOM/API only: never connects to church databases.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const key = p => ['type', 'gu', 'mok', 'bu', 'grade', 'name'].map(k => p[k] || '').join('|');
const district = (name, mok = '1') => ({ type: '교구', gu: '사랑', mok, bu: null, grade: null, name });
let db;
async function login(p) {
  return (await db.query('select member_login($1::jsonb) as result', [JSON.stringify({ ...p, identity_key: key(p) })])).rows[0].result;
}
async function change(user, profile, reason = '목장 이동') {
  return (await db.query('select admin_update_member_profile($1::uuid,$2,$3::jsonb,$4) as result',
    [user.id, user.identity_key, JSON.stringify({ ...profile, identity_key: key(profile) }), reason])).rows[0].result;
}
before(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table users(id uuid primary key default gen_random_uuid(), type text not null,
      gu text,mok text,bu text,grade text,name text not null,identity_key text not null unique,
      created_at timestamptz not null default now(),last_seen_at timestamptz);
    create table progress(user_id uuid references users(id), verse_no int, lang text, stage int, primary key(user_id,verse_no,lang));
    create table challenge_log(id int primary key,user_id uuid references users(id),score int);
    create table reviews(user_id uuid references users(id),verse_no int,box int);
    create table push_subscriptions(user_id uuid references users(id),endpoint text);
    create table app_config(key text primary key,value jsonb not null,updated_at timestamptz default now());
    grant all on users,app_config to service_role;
    alter table users enable row level security;
  `);
  await db.exec(read('supabase/member_profile.sql'));
  await db.exec(read('supabase/member_profile.sql')); // rerunnable migration
});
after(async () => { await db?.close(); });

test('rename preserves ID, all records, notification config; old/new login converge', async () => {
  const p = district('테스트성도'); const user = await login(p);
  await db.query('insert into progress values($1,1,\'ko\',3),($1,1,\'en\',2)', [user.id]);
  await db.query('insert into challenge_log values(1,$1,95)', [user.id]);
  await db.query('insert into reviews values($1,1,4)', [user.id]);
  await db.query('insert into push_subscriptions values($1,\'test-endpoint\')', [user.id]);
  await db.query('insert into app_config values(\'pilsaAdmins\',$1::jsonb,now())', [JSON.stringify([key(p), 'other-admin'])]);
  const tables = ['progress', 'challenge_log', 'reviews', 'push_subscriptions'];
  const beforeRows = await Promise.all(tables.map(t => db.query(`select * from ${t}`)));
  const next = { ...p, name: '테스트성도수정', gu: '화평', mok: '20' };
  const result = await change(user, next);
  assert.equal(result.ok, true); assert.equal(result.user.id, user.id);
  assert.equal(result.user.created_at, user.created_at);
  assert.deepEqual((await login(p)).id, user.id);
  assert.equal((await login(p)).name, next.name);
  assert.equal((await login(next)).id, user.id);
  for (let i = 0; i < tables.length; i++) assert.deepEqual((await db.query(`select * from ${tables[i]}`)).rows, beforeRows[i].rows);
  assert.deepEqual((await db.query("select value from app_config where key='pilsaAdmins'")).rows[0].value, [key(next), 'other-admin']);
  const history = (await db.query('select * from user_profile_changes where user_id=$1', [user.id])).rows;
  assert.equal(history.length, 1); assert.equal(history[0].before_profile.name, p.name);
  assert.equal(history[0].after_profile.name, next.name);
  assert.equal((await db.query('select count(*)::int as n from users')).rows[0].n, 1);
});

test('conflicts, stale editor, missing user and unchanged edits are handled without overwrites', async () => {
  const a = await login(district('중복가')); const b = await login(district('중복나'));
  assert.equal((await change(a, district('중복나'))).error, 'identity-conflict');
  const changed = await change(a, district('이동가'));
  assert.equal((await change(a, district('덮어쓰기'))).error, 'member-changed');
  assert.equal((await change(b, district('중복가'))).error, 'identity-conflict');
  assert.equal((await change(changed.user, district('이동가'))).changed, false);
  assert.equal((await change({ ...a, id: '00000000-0000-0000-0000-000000000000' }, district('없음'))).error, 'member-not-found');
  await assert.rejects(db.query("insert into users(type,gu,mok,name,identity_key) values('교구','사랑','1','중복가',$1)", [key(district('중복가'))]), /identity-conflict/);
  assert.equal((await db.query('select count(*)::int n from user_profile_changes where user_id=$1', [a.id])).rows[0].n, 1);
});

test('school transfer, repeated moves and restoring original profile retain all aliases', async () => {
  const p = district('부서이동'); const a = await login(p);
  const school = { type: '교회학교', gu: null, mok: null, bu: '청년부', grade: '1학년', name: p.name };
  const b = (await change(a, school)).user;
  assert.equal(b.gu, null); assert.equal(b.mok, null);
  const c = (await change(b, { ...school, grade: '2학년' })).user;
  const restored = (await change(c, p)).user;
  assert.equal(restored.id, a.id);
  assert.equal((await login(school)).id, a.id);
  assert.equal((await login({ ...school, grade: '2학년' })).identity_key, key(p));
});

test('audit failure rolls back profile, aliases and notification settings atomically', async () => {
  const a = await login(district('원자성'));
  await db.query("update app_config set value=$1::jsonb where key='pilsaAdmins'", [JSON.stringify([a.identity_key])]);
  await assert.rejects(change(a, district('원자성변경'), null), /null value/);
  assert.equal((await db.query('select identity_key from users where id=$1', [a.id])).rows[0].identity_key, a.identity_key);
  assert.equal((await db.query('select count(*)::int n from user_identity_aliases where user_id=$1', [a.id])).rows[0].n, 0);
  assert.deepEqual((await db.query("select value from app_config where key='pilsaAdmins'")).rows[0].value, [a.identity_key]);
});

test('public roles cannot execute RPC or read private aliases/history; service role can', async () => {
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(db.query('select member_login($1::jsonb)', ['{}']), /permission denied/);
    await assert.rejects(db.query('select admin_update_member_profile(null,null,null,null)'), /permission denied/);
    await assert.rejects(db.query('select * from user_profile_changes'), /permission denied/);
    await assert.rejects(db.query('select * from user_identity_aliases'), /permission denied/);
    await db.exec('reset role');
  }
  await db.exec('set role service_role');
  try {
    const a = await login(district('서비스역할'));
    assert.equal((await change(a, district('서비스변경'))).ok, true);
  } finally { await db.exec('reset role'); }
});

function backend(dbMock) {
  const source = read('supabase/functions/api/index.ts');
  const start = source.indexOf('// ---------- 관리자 사용자 정보 변경 ----------');
  const end = source.indexOf('// ---------- login ----------', start);
  const code = ts.transpile(source.slice(start, end), { target: ts.ScriptTarget.ES2022 });
  const context = vm.createContext({ db: dbMock, norm: s => String(s ?? '').trim().replace(/\s+/g, ' '), identityKey: key, adminError: b => b.pw === 'test-admin' ? null : 'unauthorized' });
  vm.runInContext(code, context); return context;
}
test('all admin endpoints reject unauthenticated calls before database access', async () => {
  const api = backend(new Proxy({}, { get() { throw Error('unexpected DB access'); } }));
  for (const name of ['adminFindMembers', 'adminUpdateMember', 'adminMemberHistory']) assert.equal((await api[name]({})).error, 'unauthorized');
});
test('admin validation, inactive affiliation cleanup, normalization and SQL conflict mapping', async () => {
  let args, error = null;
  const api = backend({ rpc: async (fn, p) => { args = p; return { data: { ok: true }, error }; } });
  const b = { pw: 'test-admin', user_id: '12345678-1234-1234-1234-123456789012', expected_key: 'old', reason: ' 변경 ', profile: district(' 테스트  이름 ') };
  assert.equal((await api.adminUpdateMember(b)).ok, true);
  assert.equal(args.p_profile.name, '테스트 이름'); assert.equal(args.p_reason, '변경');
  for (const profile of [{ ...b.profile, name: ' ' }, { ...b.profile, name: '가|나' }, { ...b.profile, name: '<img>' }, { ...b.profile, mok: '3목장' }, { ...b.profile, type: '잘못된구분' }, { type: '교회학교', name: '아이', bu: '청년부', grade: '' }])
    assert.equal((await api.adminUpdateMember({ ...b, profile })).error, 'invalid-profile');
  assert.equal((await api.adminUpdateMember({ ...b, reason: '' })).error, 'invalid-profile');
  assert.equal((await api.adminUpdateMember({ ...b, user_id: 'invalid' })).error, 'invalid-member');
  await api.adminUpdateMember({ ...b, profile: { ...b.profile, type: '교회학교', bu: '청년부', grade: '1학년' } });
  assert.equal(args.p_profile.gu, null); assert.equal(args.p_profile.mok, null);
  error = { code: '23505' }; assert.equal((await api.adminUpdateMember(b)).error, 'identity-conflict');
});

test('canonical profile sync carries unsynced ko/en progress, keeps device and same user ID', () => {
  const values = new Map();
  let user = { ...district('옛이름'), user_id: 'same-user', cid: 'same-device' };
  const id = () => key(user);
  const context = vm.createContext({
    localStorage: { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) },
    loadProgress: lang => JSON.parse(values.get(`progress-${lang}:${id()}`) || '{}'),
    progressKey: lang => `progress-${lang}:${id()}`, blessKey: () => `bless:${id()}`,
    saveUser: u => { user = u; },
  });
  const source = read('app.js');
  vm.runInContext(source.slice(source.indexOf('function applyServerUser('), source.indexOf('// 복습은 서버가 소스 오브 트루스')), context);
  values.set(`progress-ko:${id()}`, JSON.stringify({ 1: { stage: 3, passed: true } }));
  values.set(`progress-en:${id()}`, JSON.stringify({ 2: { stage: 2, passed: true } }));
  values.set(`bless:${id()}`, '1');
  const next = { ...district('새이름', '2'), id: user.user_id };
  assert.equal(context.applyServerUser(user, { user_id: user.user_id, user: next }), true);
  assert.equal(user.name, '새이름'); assert.equal(user.cid, 'same-device');
  assert.equal(JSON.parse(values.get(`progress-ko:${id()}`))[1].stage, 3);
  assert.equal(JSON.parse(values.get(`progress-en:${id()}`))[2].stage, 2);
  assert.equal(values.get(`bless:${id()}`), '1');
  const other = { ...district('다른사람'), id: 'other-user' };
  context.applyServerUser(user, { user_id: other.id, user: other });
  assert.equal(values.get(`progress-ko:${id()}`), undefined);
});

test('pending sync cannot replace the next person on a shared device', async () => {
  let current = { ...district('이전사람'), user_id: 'first' };
  let applied = false;
  const context = vm.createContext({
    loadUser: () => current,
    saveSyncStatus: () => {},
    api: { login: async () => { current = { ...district('다음사람'), user_id: 'second' }; return { user_id: 'first' }; } },
    applyServerUser: () => { applied = true; },
  });
  const source = read('app.js');
  vm.runInContext(source.slice(source.indexOf('async function syncProgress()'), source.indexOf('// 관리자가 이름·소속을 바꿔도')), context);
  assert.equal(await context.syncProgress(), false);
  assert.equal(applied, false);
  assert.equal(current.user_id, 'second');
});

test('renamed members can delete own posts by ID; name fallback is only for legacy rows without ID', async () => {
  const rows = [
    { id: 1, user_id: 'me', name: '이전소속 이전이름' },
    { id: 2, user_id: 'other', name: '현재소속 현재이름' },
    { id: 3, user_id: null, name: '현재소속 현재이름' },
  ];
  const mock = { from: () => ({ update: patch => {
    const conditions = [];
    const q = {
      eq(k, v) { conditions.push(r => r[k] === v); return q; },
      is(k, v) { conditions.push(r => r[k] === v); return q; },
      async select() {
        const found = rows.filter(r => conditions.every(f => f(r)));
        found.forEach(r => Object.assign(r, patch));
        return { data: found.map(r => ({ id: r.id })), error: null };
      },
    }; return q;
  } }) };
  const source = read('supabase/functions/api/index.ts');
  const body = source.slice(source.indexOf('async function boardDeleteMine('), source.indexOf('async function boardModerate('));
  const context = vm.createContext({ db: mock, boardDropImages: async () => {} });
  vm.runInContext(ts.transpile(body, { target: ts.ScriptTarget.ES2022 }), context);
  assert.equal((await context.boardDeleteMine({ id: 1, user_id: 'me', who: '현재소속 현재이름' })).ok, true);
  assert.equal(rows[0].deleted, true);
  assert.equal((await context.boardDeleteMine({ id: 2, user_id: 'me', who: '현재소속 현재이름' })).error, 'not-owner');
  assert.equal(rows[1].deleted, undefined);
  assert.equal((await context.boardDeleteMine({ id: 3, user_id: 'me', who: '현재소속 현재이름' })).ok, true);
});

test('admin search escapes wildcards and limits results; history requires a valid user ID', async () => {
  const seen = {};
  const chain = {
    select() { return chain; }, ilike(column, pattern) { seen.pattern = pattern; return chain; },
    order() { return chain; }, limit(n) { seen.limit = n; return Promise.resolve({ data: Array.from({ length: 51 }, (_, id) => ({ id })), error: null }); },
  };
  const api = backend({ from: () => chain });
  const result = await api.adminFindMembers({ pw: 'test-admin', query: '김%_\\' });
  assert.equal(seen.pattern, '%김\\%\\_\\\\%'); assert.equal(seen.limit, 51);
  assert.equal(result.users.length, 50); assert.equal(result.more, true);
  assert.equal((await api.adminMemberHistory({ pw: 'test-admin', user_id: 'invalid' })).error, 'invalid-member');
});

const tick = () => new Promise(resolve => setImmediate(resolve));
test('admin DOM: authenticate, search, school transfer, preview, conflict, retry, history and escaped content', async () => {
  const dom = new JSDOM(read('admin-members.html'), { url: 'https://local.test/admin-members.html', runScripts: 'outside-only' });
  const w = dom.window, doc = w.document, calls = [];
  const user = { ...district('홍길동'), id: 'test-user', identity_key: key(district('홍길동')), created_at: '2026-09-01T00:00:00Z' };
  let failSave = true;
  w.supaCall = async (action, body) => {
    calls.push({ action, body });
    if (action === 'authCheck') return { ok: true };
    if (action === 'adminFindMembers') return { ok: true, users: [user], more: false };
    if (action === 'adminMemberHistory') return { ok: true, history: [{ created_at: user.created_at, before_profile: user, after_profile: user, reason: '<img src=x onerror=alert(1)>' }] };
    if (action === 'adminUpdateMember') {
      if (failSave) throw Error('identity-conflict');
      return { ok: true, changed: true, user: { ...body.profile, id: user.id, identity_key: key(body.profile) } };
    }
    throw Error(action);
  };
  w.eval(read('js/admin-members.js'));
  const submit = id => doc.getElementById(id).dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  doc.getElementById('password').value = 'test-admin'; submit('login-form'); await tick();
  assert.equal(doc.getElementById('workspace').hidden, false);
  doc.getElementById('query').value = '홍길동'; submit('search-form'); await tick();
  doc.querySelector('#results button').click(); await tick();
  assert.equal(doc.querySelector('#history img'), null);
  doc.getElementById('member-type').value = '교회학교'; doc.getElementById('member-type').dispatchEvent(new w.Event('change'));
  assert.equal(doc.getElementById('district-fields').hidden, true); assert.equal(doc.getElementById('member-gu').required, false);
  doc.getElementById('member-bu').value = '청년부'; doc.getElementById('member-grade').value = '1학년'; doc.getElementById('reason').value = '부서 이동';
  submit('edit-form');
  assert.equal(doc.getElementById('confirmation').hidden, false);
  assert.match(doc.getElementById('after').textContent, /청년부/);
  assert.equal(calls.filter(c => c.action === 'adminUpdateMember').length, 0);
  doc.getElementById('save-button').click(); await tick();
  assert.match(doc.getElementById('edit-status').textContent, /다른 성도/);
  failSave = false; doc.getElementById('save-button').click(); await tick();
  assert.match(doc.getElementById('edit-status').textContent, /유지됩니다/);
  const sent = calls.find(c => c.action === 'adminUpdateMember').body;
  assert.equal(sent.user_id, user.id); assert.equal(sent.expected_key, user.identity_key);
  assert.equal(sent.profile.gu, null); assert.equal(sent.profile.mok, null);
  assert.equal(sent.pw, 'test-admin'); dom.window.close();
});
