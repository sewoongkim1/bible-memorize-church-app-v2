// 봉사 당번 알림 — 보내는 길을 끝까지(가짜 DB·가짜 푸시): supabase/functions/api/index.ts 에서 dutyNotifySend · internalDutyNotify · internalDutyRemind ·
//   eduPushDevices · webPushList 를 **글자 그대로** 떼어 타입만 걷고 node:vm 에서 돌린다(꾸러미 없음 · 네트워크·DB 없음 · preflight 가 건다).
//   ⚠️ 개발 계정에는 받는 기기가 없다 — 「같은 글 묶음 안에서 한 분의 기기만 죽은 경우」·「옛 SQL 을 만난 새 api」·「잡기 직전에 끼어든 옮기기」는
//      개발 서버 시험(tests/duty-notify.dev.sh)으로 볼 수 없어 여기서 본다(고침 검토 반영 2026-10-07).
//   타입을 걷는 것은 node 의 module.stripTypeScriptTypes(22.13+) — 없는 판이면 건너뛴다(그 판에서는 글자·값 시험 tests/duty-front.test.cjs 만 돈다).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'api', 'index.ts'), 'utf8').replace(/\r\n/g, '\n');
const fnOf = (name) => { const a = SRC.indexOf('async function ' + name + '('); assert.ok(a >= 0, name + ' 를 못 찾았다'); return SRC.slice(a, SRC.indexOf('\n}\n', a) + 2); };
let CODE = null, WHY = '';
try {
  const { stripTypeScriptTypes } = require('node:module');
  if (typeof stripTypeScriptTypes !== 'function') throw new Error('이 node 에는 stripTypeScriptTypes 가 없다');
  const pure = SRC.slice(SRC.indexOf('// ── 봉사 당번 — 순수 함수 (여기부터) ──'), SRC.indexOf('// ── 봉사 당번 — 순수 함수 (여기까지) ──'));
  const consts = SRC.slice(SRC.indexOf('const DUTY_NOTIFY_TITLE ='), SRC.indexOf('\n', SRC.indexOf('const DUTY_NOTIFY_URL =')) + 1);
  const names = ['webPushList', 'eduPushDevices', 'dutyNotifyGate', 'dutyNotifyPick', 'dutyNotifySend', 'internalDutyNotify', 'internalDutyRemind'];
  CODE = stripTypeScriptTypes([pure, consts, ...names.map(fnOf)].join('\n'));
} catch (e) { WHY = String((e && e.message) || e).split('\n')[0]; }

// 가짜 세상 — app_config · 지원 줄(duty_notify_rows 의 꼴) · 잡힌 기록 · push_log · 기기. SQL 함수 셋은 뜻만 흉내 낸다(잡기 = 살아 있음·계정·쉼 아님·[날짜]).
function world(o) {
  const w = { cfg: { ...(o.cfg || {}) }, rows: (o.rows || []).map((r) => ({ ...r })), claimed: new Set(), pushLog: [], sentTo: [], gone: [], rpc: [], oldSql: !!o.oldSql, claimFail: o.claimFail || null,
    devs: o.devs || new Map(), testers: new Set(o.testers || []), now: o.now || '2026-10-10', throwPush: !!o.throwPush, rowsFail: !!o.rowsFail, upsertErr: o.upsertErr || null, errs: [], beforeClaim: null };
  const done = (v) => ({ then: (ok, no) => Promise.resolve(v).then(ok, no) });
  const table = (name) => {
    const q = { f: {}, op: 'select', val: null };
    const run = (single) => {
      if (name === 'app_config') {
        if (q.op === 'upsert') { if (w.upsertErr) return Promise.resolve({ error: w.upsertErr }); w.cfg[q.val.key] = q.val.value; return Promise.resolve({ error: null }); }
        const data = (q.f.key || Object.keys(w.cfg)).filter((k) => k in w.cfg).map((k) => ({ key: k, value: w.cfg[k] }));
        return Promise.resolve(single ? { data: data[0] ? { value: data[0].value } : null, error: null } : { data, error: null });
      }
      if (name === 'push_log') { w.pushLog.push(q.val); return Promise.resolve({ error: null }); }
      if (q.op === 'delete') { w.gone.push(name + ':' + q.f.id[0]); return Promise.resolve({ error: null }); }
      return Promise.resolve({ data: [], error: null });
    };
    const api = { select: () => api, order: () => api, in: (k, list) => { q.f[k] = list; return api; }, eq: (k, v) => { q.f[k] = [v]; return api; },
      delete: () => { q.op = 'delete'; return api; }, insert: (val) => { q.op = 'insert'; q.val = val; return api; }, upsert: (val) => { q.op = 'upsert'; q.val = val; return api; },
      maybeSingle: () => run(true), then: (ok, no) => run(false).then(ok, no) };
    return api;
  };
  const db = { from: table, rpc: (name, args) => {
    w.rpc.push([name, Object.keys(args).sort().join(',')]);
    if (name === 'duty_notify_rows') return done(w.rowsFail ? { data: null, error: { code: 'XX000', message: 'rows' } } : { data: w.rows.filter((r) => args.p_ids.includes(r.id)), error: null });
    if (name === 'duty_remind_ids') return done({ data: w.rows.filter((r) => r.date === args.p_date && r.status === 'active' && r.uid).map((r) => r.id), error: null });
    if (name === 'duty_notify_claim') {
      if (w.oldSql && 'p_date' in args) return done({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
      if (w.claimFail) return done({ data: null, error: w.claimFail });
      if (w.beforeClaim) { const f = w.beforeClaim; w.beforeClaim = null; f(); }
      const got = [];
      for (const id of args.p_ids) {
        const r = w.rows.find((x) => x.id === id), k = args.p_kind + ':' + id;
        if (!r || r.status !== 'active' || !r.uid || r.off || w.claimed.has(k)) continue;
        if (args.p_date != null && r.date !== args.p_date) continue;
        w.claimed.add(k); got.push(id);
      }
      return done({ data: got, error: null });
    }
    throw new Error('rpc ' + name);
  } };
  const ctx = { console: { error: (...a) => w.errs.push(a.map(String).join(' ')) }, Promise, JSON, Set, Map, Array, Number, String, Object, Math, Date, isNaN, db,
    webpush: { sendNotification: async (sub) => {
      if (w.throwPush) throw new Error('boom');
      if (sub.endpoint.includes('dead')) { const e = new Error('gone'); e.statusCode = sub.endpoint.includes('500') ? 500 : 410; throw e; }
      w.sentTo.push(sub.endpoint);
    } },
    sendApns: async (token, _t, _b, o) => { if (token.includes('gone')) return 'gone'; if (token.includes('bad')) { o.reason = 'TooManyProviderTokenUpdates'; return 'error'; } w.sentTo.push(token); return 'ok'; },
    eduDevicesOf: async (uids) => new Map(uids.map((u) => [u, w.devs.get(u) || { web: [], ios: [] }])),
    ministryTesterIds: async () => w.testers, sameSecret: () => true, Deno: { env: { get: () => 'k' } }, eduKst: () => w.now };
  vm.createContext(ctx); vm.runInContext(CODE, ctx);
  return { w, ctx };
}
const R = (id, uid, x) => ({ id, uid, status: 'active', reason: null, boardId: 'b1', board: '식당 봉사', place: '식당', date: '2026-10-25', service: '2부', task: '설거지', start: '11:30', end: '12:30',
  off: false, dayOff: false, locked: false, confirmed: true, past: false, pastCutoff: false, ended: false, dup: false, movedFrom: null, ...(x || {}) });
const web = (id, ep) => ({ id, endpoint: ep, p256dh: 'p', auth: 'a', user_id: 'x' }), ios = (id, tk) => ({ id, device_token: tk, user_id: 'x' });
const J = (v) => JSON.parse(JSON.stringify(v));
const eq = (got, want, msg) => assert.deepEqual(J(got), want, msg);
const REQ = { headers: { get: () => 'k' } };
const run = (name, fn) => test(name, { skip: CODE ? false : '타입을 걷지 못해 건너뛴다 — ' + WHY }, fn);

run('보낸 분 수 — 받는 분마다 센다: 같은 글 묶음 안에서 한 분의 기기만 죽어도 그분은 「가지 않은 분」이다', async () => {
  let { w, ctx } = world({ cfg: { dutyOpen: true }, rows: [R(1, 'A'), R(2, 'B')], devs: new Map([['A', { web: [web(1, 'ok-a')], ios: [] }], ['B', { web: [web(2, 'dead-b')], ios: [] }]]) });
  eq(await ctx.dutyNotifySend('confirmed', [1, 2]), { sent: 1, missed: 1 }, '같은 글 두 분 · B 의 하나뿐인 구독이 410(묶음으로 세면 2·0 이 된다)');
  eq(w.pushLog.map((x) => [x.mode, x.sent, x.failed, x.total]), [['duty-confirmed', 1, 1, 2]], '한 글 = push_log 한 줄 · 기기 수');
  eq([w.gone, [...w.claimed].sort()], [['push_subscriptions:2'], ['confirmed:1', 'confirmed:2']], '죽은 구독은 그 자리에서 지운다 · 두 줄 모두 잡혔다');
  eq(await ctx.dutyNotifySend('confirmed', [1, 2]), { sent: 0, missed: 0 }, '다시 부탁하면 0·0(잡힌 줄)');
  ({ w, ctx } = world({ cfg: { dutyOpen: true }, rows: ['A', 'B', 'C', 'D', 'E'].map((u, i) => R(i + 1, u, { off: true, dayOff: true })),
    devs: new Map([['A', { web: [web(1, 'ok-a')], ios: [] }], ['B', { web: [], ios: [ios(1, 'bad-b')] }], ['C', { web: [], ios: [ios(2, 'gone-c')] }], ['D', { web: [web(4, 'dead-500-d')], ios: [] }]]) }));
  eq(await ctx.dutyNotifySend('off', [1, 2, 3, 4, 5]), { sent: 1, missed: 4 }, '통째 쉼 다섯 분(웹 정상 1 · 아이폰 오류 2 · 웹 500 1 · 기기 없음 1) — 받은 분은 한 분');
  eq([w.pushLog.length, w.pushLog[0].sent, w.pushLog[0].failed, w.pushLog[0].total, w.gone], [1, 1, 3, 4, ['ios_push_tokens:2']], 'gone 토큰만 지운다');
  ({ w, ctx } = world({ cfg: { dutyOpen: true }, rows: [R(1, 'A'), R(2, 'B'), R(3, 'C')],
    devs: new Map([['A', { web: [web(1, 'dead-a'), web(2, 'ok-a2')], ios: [] }], ['B', { web: [], ios: [ios(1, 'tok-b')] }], ['C', { web: [web(3, 'dead-c')], ios: [ios(3, 'bad-c')] }]]) }));
  eq(await ctx.dutyNotifySend('confirmed', [1, 2, 3]), { sent: 2, missed: 1 }, '기기 둘 가운데 하나 · 아이폰만 쓰는 분은 받은 분(웹 1번과 아이폰 1번은 다른 줄) · 모두 실패한 분만 missed');
  ({ w, ctx } = world({ cfg: { dutyOpen: true }, rows: [R(1, 'A'), R(2, 'B', { service: '1부', start: '09:00' })], devs: new Map([['A', { web: [web(1, 'ok-a')], ios: [] }], ['B', { web: [web(2, 'dead-b')], ios: [] }]]) }));
  eq([await ctx.dutyNotifySend('confirmed', [1, 2]), w.pushLog.length], [{ sent: 1, missed: 1 }, 2], '글이 다르면 묶음 둘');
  ({ w, ctx } = world({ cfg: { dutyOpen: true }, rows: [R(1, 'A'), R(2, 'B')], devs: new Map([['A', { web: [web(1, 'ok-a')], ios: [] }], ['B', { web: [web(2, 'ok-b')], ios: [] }]]), throwPush: true }));
  eq(await ctx.dutyNotifySend('added', [1, 2]), { sent: 0, missed: 2 }, '보내는 것이 모두 던지면 모두 가지 않은 것으로');
  ({ w, ctx } = world({ cfg: {}, rows: [R(1, 'A'), R(2, 'B')], testers: ['B'], devs: new Map([['A', { web: [web(1, 'ok-a')], ios: [] }]]) }));
  eq([await ctx.dutyNotifySend('confirmed', [1, 2]), [...w.claimed], w.sentTo], [{ sent: 0, missed: 1 }, ['confirmed:2'], []], '문이 닫힌 동안 — 시험 참여자만(걸러진 분은 어느 수에도 안 들고 잡히지 않는다)');
});

run('끄는 스위치 — 잡지도 보내지도 않는다 · held = 꺼 두지 않았으면 보냈을 분 수(읽다 실패하면 없이) · 값이 true 하나일 때만', async () => {
  let { w, ctx } = world({ cfg: { dutyOpen: true, dutyNotifyOff: true }, rows: [R(1, 'A'), R(2, 'B'), R(3, 'A', { service: '1부' }), R(4, 'C', { past: true }), R(5, null)], devs: new Map([['A', { web: [web(1, 'ok-a')], ios: [] }]]) });
  eq(await ctx.dutyNotifySend('confirmed', [1, 2, 3, 4, 5]), { sent: 0, missed: 0, off: true, held: 2 }, 'A·B 두 분(지난 날·계정 없는 줄은 빼고 · 한 분의 두 줄은 한 분)');
  eq([[...w.claimed], w.sentTo, w.pushLog.length, w.rpc.map((x) => x[0])], [[], [], 0, ['duty_notify_rows']], '재료만 읽었다(기기도 안 읽는다)');
  eq(await ctx.internalDutyNotify(REQ, { kind: 'confirmed', signup_ids: [1, 2] }), { ok: true, sent: 0, missed: 0, off: true, held: 2 }, '교회 어드민 액션의 응답');
  eq(await ctx.dutyNotifySend('removed', [4]), { sent: 0, missed: 0, off: true, held: 0 }, '알림이 갈 일이 없던 저장(지난 날 줄)은 held 0');
  ({ w, ctx } = world({ cfg: { dutyNotifyOff: true }, rows: [R(1, 'A')], rowsFail: true }));
  eq([await ctx.dutyNotifySend('confirmed', [1]), w.errs.length], [{ sent: 0, missed: 0, off: true }, 1], '읽다 실패해도 던지지 않는다 — held 없이');
  ({ w, ctx } = world({ cfg: { dutyNotifyOff: true }, rows: [R(1, 'A'), R(2, 'B')], testers: ['B'] }));
  eq(await ctx.dutyNotifySend('confirmed', [1, 2]), { sent: 0, missed: 0, off: true, held: 1 }, '문이 닫힌 동안의 held 는 시험 참여자만');
  ({ w, ctx } = world({ cfg: { dutyNotifyOff: 'true' }, rows: [R(1, 'A')], devs: new Map([['A', { web: [web(1, 'ok-a')], ios: [] }]]), testers: ['A'] }));
  eq(await ctx.dutyNotifySend('confirmed', [1]), { sent: 1, missed: 0 }, '글자 "true" 는 꺼진 것이 아니다');
});

run('전날 알림 — 잡는 문장에 날짜를 싣는다(그사이 옮겨진 줄은 잡히지 않는다) · 옛 SQL 이면 인자 둘로 물러선다(그 오류일 때만)', async () => {
  const rows = () => [R(1, 'A', { date: '2026-10-11' }), R(2, 'B', { date: '2026-10-11' })];
  const devs = () => new Map([['A', { web: [web(1, 'ok-a')], ios: [] }], ['B', { web: [web(2, 'ok-b')], ios: [] }]]);
  const claims = (w) => w.rpc.filter((x) => x[0] === 'duty_notify_claim').map((x) => x[1]);
  let { w, ctx } = world({ cfg: { dutyOpen: true }, rows: rows(), devs: devs() });
  w.beforeClaim = () => { w.rows.find((r) => r.id === 2).date = '2026-10-18'; };   // 재료를 읽은 뒤·잡기 직전에 담당자의 옮기기가 끼어든다
  eq(await ctx.internalDutyRemind(REQ, { anytime: true }), { ok: true, day: '2026-10-11', rows: 2, sent: 1, missed: 0 }, '옮겨진 줄은 「내일」을 받지 않는다');
  eq([[...w.claimed], w.sentTo, claims(w)], [['remind:1'], ['ok-a'], ['p_date,p_ids,p_kind']], '그 줄은 잡히지 않았다(새 날짜의 전날 알림이 살아 있다)');
  ({ w, ctx } = world({ cfg: { dutyOpen: true }, rows: rows(), devs: devs(), oldSql: true }));
  eq(await ctx.internalDutyRemind(REQ, { anytime: true }), { ok: true, day: '2026-10-11', rows: 2, sent: 2, missed: 0 }, '옛 SQL — 물러서서 간다');
  eq(claims(w), ['p_date,p_ids,p_kind', 'p_ids,p_kind']);
  ({ w, ctx } = world({ cfg: { dutyOpen: true }, rows: rows(), devs: devs(), claimFail: { code: '57014', message: 'timeout' } }));
  await assert.rejects(() => ctx.internalDutyRemind(REQ, { anytime: true }), (e) => e.code === '57014', '다른 오류는 물러서지 않고 던진다');
  eq([w.sentTo, 'dutyRemindRun' in w.cfg, claims(w).length], [[], false, 1], '아무것도 안 보냈다 · 흔적 없음(다음 부름·monitor 가 본다)');
  ({ w, ctx } = world({ cfg: { dutyOpen: true }, rows: [R(1, 'A')], devs: devs() }));
  eq([await ctx.dutyNotifySend('confirmed', [1]), claims(w)], [{ sent: 1, missed: 0 }, ['p_ids,p_kind']], '확정은 날짜를 싣지 않는다');
});

run('전날 알림의 흔적 — 19:00 의 결과를 19:20 이 덮지 않는다 · 꺼 둔 저녁은 off·held · 쓰기 오류를 남긴다', async () => {
  const devs = () => new Map([['A', { web: [web(1, 'ok-a')], ios: [] }], ['B', { web: [web(2, 'ok-b')], ios: [] }]]);
  let { w, ctx } = world({ cfg: { dutyOpen: true }, rows: [R(1, 'A', { date: '2026-10-11' }), R(2, 'B', { date: '2026-10-11' }), R(3, 'C', { date: '2026-10-11' })], devs: devs() });
  const tr = (x) => { const v = { ...x.cfg.dutyRemindRun }; assert.ok(!isNaN(Date.parse(v.at)), 'at 은 날짜로 읽힌다'); delete v.at; return v; };
  await ctx.internalDutyRemind(REQ, { anytime: true }); eq(tr(w), { day: '2026-10-11', rows: 3, sent: 2, missed: 1, runs: 1 });
  eq(await ctx.internalDutyRemind(REQ, { anytime: true }), { ok: true, day: '2026-10-11', rows: 3, sent: 0, missed: 0 }, '둘째 부름은 0·0(이미 잡힌 줄)');
  eq(tr(w), { day: '2026-10-11', rows: 3, sent: 2, missed: 1, runs: 2 }, '흔적은 더한 값');
  ({ w, ctx } = world({ cfg: { dutyOpen: true, dutyNotifyOff: true }, rows: [R(1, 'A', { date: '2026-10-11' }), R(2, 'B', { date: '2026-10-11' })], devs: devs() }));
  eq(await ctx.internalDutyRemind(REQ, { anytime: true }), { ok: true, day: '2026-10-11', rows: 2, sent: 0, missed: 0, off: true }, '꺼 둔 저녁');
  eq(tr(w), { day: '2026-10-11', rows: 2, sent: 0, missed: 0, runs: 1, off: true, held: 2 });
  eq(ctx.dutyRemindProblems(w.cfg.dutyRemindRun, Date.now(), true).map((s) => s.includes('2분께 가지 않음')), [true], 'monitor 글에 가지 않은 분 수');
  delete w.cfg.dutyNotifyOff;
  eq(await ctx.internalDutyRemind(REQ, { anytime: true }), { ok: true, day: '2026-10-11', rows: 2, sent: 2, missed: 0 }, '같은 저녁에 켜고 다시 부르면 간다(잡힌 것이 없었다)');
  eq(tr(w), { day: '2026-10-11', rows: 2, sent: 2, missed: 0, runs: 2 }, 'off 가 사라지고 더해졌다');
  ({ w, ctx } = world({ cfg: { dutyOpen: true }, rows: [R(1, 'A', { date: '2026-10-11' })], devs: devs(), upsertErr: { message: 'denied' } }));
  eq([await ctx.internalDutyRemind(REQ, { anytime: true }), w.errs.some((s) => s.includes('dutyRemindRun') && s.includes('denied'))], [{ ok: true, day: '2026-10-11', rows: 1, sent: 1, missed: 0 }, true], '흔적 쓰기 오류 — 응답은 그대로 · 오류를 남긴다');
});

run('옮김 — 오늘 끝난 자리로 옮겨도 떠난 자리가 아직 안 끝났으면 알린다 · 끝난 자리끼리는 조용 · 기록에 받는 분 번호 없음', async () => {
  const mf = (live) => ({ date: '2026-10-25', service: '2부', task: '설거지', start: '11:30', ...(live === undefined ? {} : { live }) });
  const { w, ctx } = world({ cfg: { dutyOpen: true }, rows: [R(1, 'UA', { date: '2026-10-10', ended: true, movedFrom: mf(true) }), R(2, 'UB', { date: '2026-10-10', ended: true, movedFrom: mf(false) }), R(3, 'UC', { date: '2026-10-10', ended: true, movedFrom: mf() })],
    devs: new Map([['UA', { web: [web(1, 'ok-a')], ios: [] }], ['UB', { web: [web(2, 'ok-b')], ios: [] }], ['UC', { web: [web(3, 'ok-c')], ios: [] }]]) });
  eq([await ctx.dutyNotifySend('moved', [1, 2, 3]), w.sentTo], [{ sent: 1, missed: 0 }, ['ok-a']], '앞날 줄 → 오늘 끝난 자리만');
  assert.equal(w.pushLog[0].body, '담당자가 당번 자리를 옮겨 드렸어요 — 10월 25일(일) 2부 설거지 11:30 → 10월 10일(토) 식당 봉사 2부 설거지 11:30');
  assert.equal(/UA|UB|UC|uid|user_id/.test(JSON.stringify(w.pushLog)), false, 'push_log 에 받는 분 번호가 없다');
});
