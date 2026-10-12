// 아침 알림 넷 · 주일 말씀 · 주간 리포트 크론을 관리자 암호 없이 Vault 의 내부 키로(2026-10-12 · supabase/push_report_cron.sql)
//   node --test tests/push-report-cron.test.cjs
//
// ⚠️ **꾸러미를 하나도 쓰지 않는다**(node:test·node:assert·node:fs·node:path·node:vm·node:module 뿐) — tools/preflight.py 가 배포 앞 그물에 건다.
//
// 무엇을 지키나
//   ① 크론 SQL — 여섯 작업의 이름 · 일정 · 본문 · 키 없음 · alter_job(작업 번호 그대로 — monitor 의 cron_last_run 이 끊기지 않게) ·
//      확인 차례 · 「점검만」(v_apply) · 단계(v_only) · 손 부름 본문이 아무에게도 가지 않는 꼴(diag 는 보내기를 막지 않는다)
//   ② 옛 크론 SQL 넷 — 실행 문장은 맨 앞 멈춤 한 줄뿐(되살리면 관리자 암호가 크론 명령에 다시 들어간다)
//   ③ api 글자 — INTERNAL_CRON_OK 는 셋 · 교회 어드민 묶음(INTERNAL_ADMIN_OK)엔 없다 · 암호 길(ADMIN_PW_ONLY) 그대로 ·
//      들머리가 cronOnly 로 본문을 다시 만든다 · weeklyReport 안쪽 stats 가 표를 받는다 · extra · 알림 주소는 이 앱 안만
//   ④ cronOnly(순수 구간 · node:vm) — SQL 의 본문 여섯이 그대로 지나간다(SQL 과 api 가 같은 글자) · 글 · 주소 · 받는 곳은 걷는다 · 꼴이 아니면 null
//   ⑤ weeklyReport · weeklyVersePush 동작(node:vm — 타입은 module.stripTypeScriptTypes(22.13+)로 걷는다 · 없는 node 면 건너뛴다)
//      빠뜨리면 메일은 ok 로 나가는데 누적 참여자 · 주차별 신규가 0 이 된다(monitor 도 못 잡는다).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const rd = (...p) => { const f = path.join(ROOT, ...p); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n') : ''; };
const API = rd('supabase', 'functions', 'api', 'index.ts');
const SH = rd('supabase', 'functions', 'api', '_shared.ts');
const SQL = rd('supabase', 'push_report_cron.sql');
const CODE = SQL.replace(/--.*$/gm, '');   // 주석을 걷은 실행 글자
const OLD = ['push_cron.sql', 'push_cron_hourly.sql', 'weekly_verse_push_cron.sql', 'weekly_report.sql'];
const reEsc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const at = (src, s) => { const i = src.indexOf(s); assert.ok(i >= 0, '못 찾았다: ' + s.slice(0, 90)); return i; };
const fnOf = (name) => { const a = API.indexOf('async function ' + name + '('); assert.ok(a >= 0, name + ' 를 못 찾았다'); return API.slice(a, API.indexOf('\n}\n', a) + 2); };
const setOf = (name, src) => {
  const m = src.match(new RegExp('const ' + name + ' = new Set\\(\\[([\\s\\S]*?)\\]\\);'));
  assert.ok(m, name + ' 를 못 찾았다');
  return new Set([...m[1].replace(/\/\/.*$/gm, '').matchAll(/"([A-Za-z0-9_]+)"/g)].map((x) => x[1]));
};

const TITLE = '오직 성경, 말씀이 답이다!';
const HOME = 'https://gocheok.onlybible.kr/';
const PUSH = (h) => "jsonb_build_object('action','sendPush','latest',true,'title','" + TITLE + "','url','" + HOME + "','hour'," + h + ')';
const JOBS = [
  ['daily-push-5', '0 20 * * *', PUSH(5)], ['daily-push-6', '0 21 * * *', PUSH(6)],
  ['daily-push-7', '0 22 * * *', PUSH(7)], ['daily-push-8', '0 23 * * *', PUSH(8)],
  ['weekly-verse-push', '0 23 * * 6', "jsonb_build_object('action','weeklyVersePush')"],
  ['weekly-report-email', '0 23 * * 4', "jsonb_build_object('action','weeklyReport','send',true)"],
];
// SQL 의 jsonb_build_object('k',v,…) → JS 객체(문자열 · true/false · 정수만 — 이 파일의 본문은 그것뿐이다)
function jbo(s) {
  const inner = s.slice(s.indexOf('(') + 1, s.lastIndexOf(')'));
  const parts = []; let cur = '', q = false;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === "'") { if (q && inner[i + 1] === "'") { cur += "'"; i++; continue; } q = !q; cur += c; continue; }
    if (c === ',' && !q) { parts.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  parts.push(cur.trim());
  const val = (t) => (t.startsWith("'") ? t.slice(1, -1) : t === 'true' ? true : t === 'false' ? false : (assert.ok(/^-?[0-9]+$/.test(t), '모르는 값 ' + t), Number(t)));
  const o = {};
  for (let i = 0; i < parts.length; i += 2) o[val(parts[i])] = val(parts[i + 1]);
  return o;
}

// ── ① 크론 SQL ──────────────────────────────────────────────────────────────
test('① 크론 SQL — 여섯 작업 · 이름 · 일정 · 본문(pw 만 뺀 옛 본문) 그대로', () => {
  assert.ok(SQL.length > 0, 'supabase/push_report_cron.sql 이 없다');
  for (const [n, s, b] of JOBS) {
    const row = new RegExp("\\('" + reEsc(n) + "',\\s+'" + reEsc(s) + "', \\$b\\$" + reEsc(b) + '\\$b\\$\\)');
    assert.ok(row.test(CODE), n + ' 줄(이름 · 일정 · 본문)');
  }
  assert.equal((CODE.match(/\$b\$jsonb_build_object/g) || []).length, 6, '본문은 여섯뿐');
});

test('① 크론 SQL — 키 · 암호를 적지 않는다 · 주소는 자리표 · 명령은 돌 때 Vault 에서 · 끼우는 값은 주소 하나', () => {
  assert.ok(!/sb_secret_|sb_publishable_|eyJ[A-Za-z0-9_-]{10,}|YOUR_ADMIN_SECRET/.test(SQL), '키 · 암호 자리표가 들어 있다');
  assert.ok(!/'pw'\s*,\s*'/.test(SQL), "값을 단 'pw' 칸이 있다");
  assert.ok(/v_url\s+text\s+:= 'YOUR_API_URL';/.test(CODE), '주소 자리표');
  const tpl = CODE.slice(at(CODE, '$cmd$select net.http_post('), at(CODE, ')$cmd$;') + 1);
  assert.ok(tpl.includes("'x-internal-key',(select decrypted_secret from vault.decrypted_secrets where name = 'edu_remind_service_key'))"), 'Vault 를 돌 때 읽는다');
  assert.equal((tpl.match(/%L/g) || []).length, 1, '%L 은 주소 하나');
  assert.equal((tpl.match(/%s/g) || []).length, 1, '%s 는 본문 하나');
  assert.ok(!/'pw'|apikey|Authorization/.test(tpl), '명령 틀에 pw · 공개 키 머리가 없다');
  assert.ok(CODE.includes('v_cmd := format(v_tpl, v_url, r.body);'));
});

test('① 크론 SQL — 명령만 바꾼다(alter_job · 번호 · 기록 그대로) · 지우고 다시 걸지 않는다 · 기본은 점검만 · 여섯 모두', () => {
  assert.ok(!/cron\.unschedule\(/.test(CODE), 'unschedule 이 있다(작업 번호가 바뀐다 — monitor 헛경보 · 되돌리기 ㉡ 못 씀)');
  assert.equal((CODE.match(/cron\.schedule\(/g) || []).length, 1, 'schedule 은 되살리기(v_create) 갈래 하나뿐');
  assert.equal((CODE.match(/cron\.alter_job\(/g) || []).length, 1);
  assert.ok(/v_create\s+boolean\s+:= false;/.test(CODE), 'v_create 기본 false');
  assert.ok(/v_apply\s+boolean\s+:= false;/.test(CODE), 'v_apply 기본 false(점검만)');
  assert.ok(/v_only\s+text\[\]\s+:= null;/.test(CODE), 'v_only 기본 null(여섯 모두)');
  assert.ok(at(CODE, 'if not v_create then') < at(CODE, 'perform cron.schedule(r.jobname, r.sched, v_cmd);'), '없는 작업은 v_create 일 때만');
  assert.ok(CODE.includes('perform cron.alter_job(job_id := v_id, command := v_cmd);'));
  assert.ok(CODE.includes('where t.jobname = any(v_want)'), '대상만 돈다');
});

test('① 크론 SQL — 확인 차례 · 끝 확인 · 점검만이면 일부러 멈춘다', () => {
  const iNotice = at(CODE, 'raise notice'), iUrl = at(CODE, "raise exception 'YOUR_API_URL"), iOnly = at(CODE, 'if v_only is not null'),
        iVaultExt = at(CODE, "extname = 'supabase_vault'"), iKey = at(CODE, "raise exception 'Vault 에 edu_remind_service_key"), iLoop = at(CODE, 'for r in');
  assert.ok(iNotice < iUrl && iUrl < iOnly && iOnly < iVaultExt && iVaultExt < iKey && iKey < iLoop, '머리 확인 차례(확장 없으면 Vault 를 보기 전에 알리고 끝)');
  const iCount = at(CODE, 'if v_n > 1 then'), iSched = at(CODE, 'if v_sched is distinct from r.sched then'),
        iAddr = at(CODE, 'if position(quote_literal(v_url) in v_cur) = 0 then'),
        iStrip = at(CODE, "v_old := regexp_replace(v_old, '\\s*,\\s*''pw''\\s*,\\s*''[^'']*''', '', 'g');"),
        iEval = at(CODE, "execute 'select ' || v_old into v_old_body;"), iSame = at(CODE, 'if v_old_body is distinct from v_new_body then'),
        iAlter = at(CODE, 'perform cron.alter_job(');
  const iExplain = CODE.lastIndexOf("execute 'explain ' || v_cmd;", iAlter);
  assert.ok(iLoop < iCount && iCount < iSched && iSched < iAddr && iAddr < iStrip && iStrip < iEval && iEval < iSame && iSame < iExplain && iExplain < iAlter, '걸기 전 확인 차례');
  const guard = CODE.slice(iEval, CODE.indexOf('end;', iEval));
  assert.ok(guard.includes('exception when others then') && !/SQLERRM|SQLSTATE/.test(guard), '옛 본문 계산 오류는 글을 바꿔 낸다(암호가 오류 글에 실리지 않게)');
  const iDone = at(CODE, 'if v_done <> cardinality(v_want) then');
  const end = CODE.slice(at(CODE, 'if (select count(*) from cron.job'), at(CODE, 'if not v_apply then'));
  for (const s of ['jobname = any(v_want)', "command !~ '''pw'''", "command !~ 'sb_(publishable|secret)_|eyJ[A-Za-z0-9_-]{10,}\\.'",
    "position('vault.decrypted_secrets' in command) > 0", "position('''x-internal-key''' in command) > 0",
    'position(quote_literal(v_url) in command) > 0', '<> cardinality(v_want) then'])
    assert.ok(end.includes(s), '끝 확인에 ' + s);
  const iEnd = at(CODE, 'if (select count(*) from cron.job'), iDry = at(CODE, 'if not v_apply then'), iOk = CODE.lastIndexOf('raise notice');
  assert.ok(iAlter < iDone && iDone < iEnd && iEnd < iDry && iDry < iOk, '바꾸기 → 수 확인 → 끝 확인 → 점검만이면 멈춤 → 알림');
  assert.ok(/if not v_apply then\s*\n\s*raise exception '점검만/.test(CODE), '점검만은 오류로 멈춰 통째로 무른다');
});

test('① 크론 SQL — 손 부름은 아무에게도 가지 않는 꼴(diag 는 보내기를 막지 않는다)', () => {
  const probe = SQL.slice(at(SQL, '-- ① 걸기 전'), at(SQL, '-- ② 바꾼 뒤'));
  const zero = "'hour',99,'user_id','00000000-0000-0000-0000-000000000000','diag',true";
  assert.ok(probe.includes("jsonb_build_object('action','sendPush'," + zero + ')'), 'sendPush 손 부름 — 없는 시각 · 없는 계정');
  assert.ok(probe.includes("jsonb_build_object('action','weeklyVersePush'," + zero + ')'), 'weeklyVersePush 손 부름 — 없는 시각 · 없는 계정');
  const rep = probe.slice(at(probe, "jsonb_build_object('action','weeklyReport',\n"), at(probe, 'as p_report'));
  assert.ok(!rep.includes("'send'"), '리포트 손 부름은 미리보기(send 없음)');
  assert.ok(probe.includes("jsonb_build_object('action','sendPush','hour',99)) as n_send") && probe.includes("jsonb_build_object('action','weeklyReport','from','x')) as n_report"),
    '좁히기가 올라갔는지 보는 부름 둘(어느 판에서도 아무에게도 안 간다)');
});

// ── ② 옛 크론 SQL ───────────────────────────────────────────────────────────
test('② 옛 크론 SQL 넷 — 실행 문장은 맨 앞 멈춤 한 줄뿐', () => {
  const STOP = "do $$ begin raise exception '옛 방식 — supabase/push_report_cron.sql 을 쓰세요(아무것도 바꾸지 않았습니다)'; end $$;";
  for (const f of OLD) {
    const src = rd('supabase', f);
    assert.ok(src.length > 0, f + ' 가 없다');
    const live = src.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('--'));
    assert.deepEqual(live, [STOP], f + ' — 주석 밖에 멈춤 말고 다른 문장이 있다');
  }
});

// ── ③ api 글자 ──────────────────────────────────────────────────────────────
test('③ api — 크론 셋만 따로 둔 목록 · 교회 어드민 묶음엔 없다 · 암호 길 그대로', () => {
  assert.deepEqual([...setOf('INTERNAL_CRON_OK', API)].sort(), ['sendPush', 'weeklyReport', 'weeklyVersePush']);
  const adm = setOf('INTERNAL_ADMIN_OK', API);
  for (const a of ['sendPush', 'weeklyVersePush', 'weeklyReport', 'eveningPush', 'testPush']) assert.ok(!adm.has(a), a + ' 가 교회 어드민 묶음에 들었다');
  const pw = setOf('ADMIN_PW_ONLY', SH);
  for (const a of ['sendPush', 'weeklyVersePush', 'weeklyReport', 'monitor']) assert.ok(pw.has(a), a + ' 가 암호 길에서 빠졌다(admin-stats · monitor.yml · 되돌리기 ㉡ 가 쓴다)');
});

test('③ api — 들머리: 내부 키 + 크론 셋이면 cronOnly 로 본문을 다시 만들고 표를 붙인다 · 꼴이 아니면 bad-args', () => {
  const entry = API.slice(at(API, 'Deno.serve(async (req) => {'), at(API, 'switch (body.action) {'));
  const iAdm = at(entry, 'if (INTERNAL_ADMIN_OK.has(body.action) &&'), iCron = at(entry, 'if (INTERNAL_CRON_OK.has(body.action) &&');
  assert.ok(iAdm < iCron, '교회 어드민 갈래 다음에');
  const blk = entry.slice(iCron);
  assert.ok(/^if \(INTERNAL_CRON_OK\.has\(body\.action\) &&\s*\n\s*sameSecret\(req\.headers\.get\("x-internal-key"\) \?\? "", Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\) \?\? ""\)\) \{\s*\n\s*const nb = cronOnly\(body\);\s*\n\s*if \(!nb\) return json\(\{ ok: false, error: "bad-args" \}\);\s*\n\s*for \(const k of Object\.keys\(body\)\) delete \(body as any\)\[k\];\s*\n\s*Object\.assign\(body, nb\);\s*\n\s*\(body as any\)\[INTERNAL_OK\] = true;\s*\n\s*\}/.test(blk),
    '들머리 블록의 꼴(키 확인 → 다시 만들기 → 표)');
});

test('③ api — weeklyReport 안쪽 부름이 표를 넘긴다 · 내부 키 길의 리포트는 받는 곳을 더하지 않는다 · 알림 주소는 이 앱 안만', () => {
  const wr = fnOf('weeklyReport');
  const calls = [...wr.matchAll(/\bstats\((\{[^}]*\}|[a-z]+)\)/g)].map((m) => m[1]);
  assert.ok(calls.length >= 3, 'stats 부름을 못 찾았다');
  for (const c of calls) assert.ok(c === 'q' || c.includes('[INTERNAL_OK]: (b as any)[INTERNAL_OK] === true'), 'stats(' + c + ') 가 표를 안 넘긴다');
  assert.ok(wr.includes('const q = { ...b, from: range.from, to: range.to };'), 'stats · participants · verseStats(q) 는 펼침(표가 따라간다)');
  assert.ok(wr.includes('sendEmailResend(subject, html, text, (b as any)[INTERNAL_OK] === true ? undefined : b.extra)'), 'extra');
  const vp = fnOf('weeklyVersePush');
  assert.ok(/sendPush\(\{\s*\.\.\.b,/.test(vp) || vp.includes('[INTERNAL_OK]'), 'weeklyVersePush 가 안쪽 sendPush 에 표를 넘긴다');
  assert.ok(fnOf('sendPush').includes('const pushUrl = (typeof b.url === "string" && b.url.startsWith("https://gocheok.onlybible.kr/")) ? b.url : "https://gocheok.onlybible.kr/";'),
    '알림 주소는 이 앱 안만(sw.js 는 출처를 보지 않고 연다)');
});

// ── ④ cronOnly ─────────────────────────────────────────────────────────────
const START = '// ── 크론 길 본문 — 순수 함수 (여기부터) ──', END = '// ── 크론 길 본문 — 순수 함수 (여기까지) ──';
function loadCron() {
  const s = API.indexOf(START), e = API.indexOf(END);
  assert.ok(s >= 0 && e > s, 'index.ts 에서 크론 길 순수 구간 표식을 못 찾았다');
  const slice = API.slice(s, e);
  assert.ok(!/:\s*(any|string|number|boolean|Record|Set)\b/.test(slice), '순수 구간에 타입 표기가 들어왔다 — node:vm 이 못 돌린다');
  const ctx = vm.createContext({});
  vm.runInContext(slice, ctx);
  assert.equal(typeof ctx.cronOnly, 'function', 'cronOnly 를 못 떼어 냈다');
  return ctx;
}
const plain = (o) => (o === null ? null : JSON.parse(JSON.stringify(o)));   // vm 쪽 객체를 이쪽 객체로(같은 꼴 비교)

test('④ cronOnly — SQL 의 본문 여섯은 그대로 지나간다(SQL 과 api 가 같은 글자 · 같은 시각)', () => {
  const C = loadCron();
  assert.equal(C.CRON_PUSH_TITLE, TITLE);
  assert.equal(C.CRON_PUSH_URL, HOME);
  assert.deepEqual([...C.CRON_PUSH_HOURS], [5, 6, 7, 8]);
  const bodies = [...CODE.matchAll(/\$b\$(jsonb_build_object\([^$]*\))\$b\$/g)].map((m) => jbo(m[1]));
  assert.equal(bodies.length, 6);
  for (const b of bodies) assert.deepEqual(plain(C.cronOnly(b)), b, JSON.stringify(b) + ' 가 그대로 지나가지 않는다(SQL 만 바꿨나 — api 의 CRON_PUSH_* 도 함께)');
});

test('④ cronOnly — 글 · 주소 · 받는 곳은 걷는다(서버가 정한다)', () => {
  const C = loadCron();
  const odd = { title: 'X', body: 'Y', url: 'https://evil.example/', only: ['u'], userBodies: { u: { title: 'Z' } }, mode: 'manual', extra: 'a@b.c', pw: 'p', latest: false };
  assert.deepEqual(plain(C.cronOnly({ action: 'sendPush', hour: 7, ...odd })),
    { action: 'sendPush', latest: true, title: TITLE, url: HOME, hour: 7 });
  assert.deepEqual(plain(C.cronOnly({ action: 'weeklyVersePush', ...odd })), { action: 'weeklyVersePush' });
  assert.deepEqual(plain(C.cronOnly({ action: 'weeklyReport', send: true, ...odd })), { action: 'weeklyReport', send: true });
});

test('④ cronOnly — 손 부름(diag + 없는 계정)은 지나가고, 기록 없이 여럿에게 가는 꼴 · 모두에게 가는 꼴은 막는다', () => {
  const C = loadCron();
  const Z = '00000000-0000-0000-0000-000000000000';
  assert.deepEqual(plain(C.cronOnly({ action: 'sendPush', hour: 99, user_id: Z, diag: true })),
    { action: 'sendPush', latest: true, title: TITLE, url: HOME, hour: 99, user_id: Z, diag: true });
  assert.deepEqual(plain(C.cronOnly({ action: 'weeklyVersePush', hour: 99, user_id: Z, diag: true })), { action: 'weeklyVersePush', hour: 99, user_id: Z, diag: true });
  assert.deepEqual(plain(C.cronOnly({ action: 'weeklyReport', from: '2026-10-19', to: '2026-10-25' })), { action: 'weeklyReport', from: '2026-10-19', to: '2026-10-25' });
  const no = [
    { action: 'sendPush' },                                   // 시각 없음 = 모두에게
    { action: 'sendPush', hour: 0 },                          // 0 은 거르지 않는다 = 모두에게
    { action: 'sendPush', hour: 9 },                          // 크론의 시각이 아니다
    { action: 'sendPush', hour: 99 },                         // 손 부름 꼴이 아닌데 크론의 시각도 아니다
    { action: 'sendPush', hour: '7' },                        // 글자 시각
    { action: 'sendPush', hour: 7.5 },
    { action: 'sendPush', hour: 7, diag: true },              // diag 인데 한 사람이 아니다(기록 없이 여럿에게)
    { action: 'sendPush', hour: 7, diag: 'yes', user_id: Z },
    { action: 'sendPush', hour: 7, user_id: 'not-a-uuid' },
    { action: 'weeklyVersePush', diag: true },
    { action: 'weeklyVersePush', hour: 'x' },
    { action: 'weeklyReport', send: 'true' },
    { action: 'weeklyReport', from: 'x' },
    { action: 'weeklyReport', to: '2026-1-5' },
    { action: 'weeklyReport', hour: 5 },
    { action: 'weeklyReport', user_id: Z },
    { action: 'eveningPush' }, { action: 'monitor' }, { action: 'stats' }, null, [], 'sendPush',
  ];
  for (const b of no) assert.equal(C.cronOnly(b), null, JSON.stringify(b) + ' 를 막지 않았다');
});

// ── ⑤ weeklyReport · weeklyVersePush 동작 ────────────────────────────────────
const { stripTypeScriptTypes } = require('node:module');
let RUN = null, WHY = '';
{
  // 떼어 내기는 node 와 무관하다(못 찾으면 어느 판에서나 떨어진다)
  const gate = SH.slice(at(SH, 'export const SUPER_OK'), at(SH, '// ---------- 위젯 날짜')).replace(/^export /gm, '');
  const parts = [gate, fnOf('weeklyReport'), fnOf('weeklyVersePush')].join('\n');
  if (typeof stripTypeScriptTypes !== 'function') WHY = '이 node 에는 module.stripTypeScriptTypes(22.13+)가 없다';
  else { try { RUN = stripTypeScriptTypes(parts); } catch (e) { WHY = '타입을 걷다 실패했다 — ' + String((e && e.message) || e).split('\n')[0]; } }
}
function world() {
  const w = { seen: [], mailExtra: 'UNSET', weekly: null, pushed: [] };
  const rows = [0, 1, 2].map((i) => ({ user_id: 'u' + i, created_at: '2026-10-0' + (i + 1) + 'T01:00:00Z' }));
  const chain = () => { let used = false; const q = { select: () => q, gte: () => q, lte: () => q, order: () => q, range: () => { const d = used ? [] : rows; used = true; return Promise.resolve({ data: d, error: null }); } }; return q; };
  const ctx = {
    Deno: { env: { get: (k) => (k === 'ADMIN_SECRET' ? 'right-pw' : '') } }, Promise, Set, Map, Array, Date, Math, Number, String, JSON, Object, Symbol,
    DAY_MS: 86400000, KST: '+09:00', ymd: (d) => d.toISOString().slice(0, 10), kstDay: (s) => String(s).slice(0, 10),
    reportWeekRange: () => ({ from: '2026-10-02', to: '2026-10-08' }), db: { from: () => chain() },
    verseLabelMap: async () => new Map(), latestVerse: async () => ({ no: 1, ref: 'R', text: 'T' }),
    buildWeeklyHtml: (_r, _v, _d, weekly) => { w.weekly = weekly; return ''; }, buildWeeklyText: () => '', buildWeeklyCsv: () => '',
    sendEmailResend: async (_s, _h, _t, extra) => { w.mailExtra = extra; return { ok: true }; },
  };
  vm.createContext(ctx);
  vm.runInContext(RUN + '\n;globalThis.__x = { SUPER_OK, INTERNAL_OK, adminError, weeklyReport, weeklyVersePush };', ctx);
  const X = ctx.__x;
  const gated = (label, ok) => async (q) => { const e = X.adminError(q); w.seen.push(label + ':' + (e || 'ok')); return e ? { ok: false, error: e } : ok; };
  ctx.stats = gated('stats', { ok: true, list: [{ participants: 7, newCount: 2 }] });
  ctx.participants = gated('participants', { ok: true, list: [] });
  ctx.verseStats = gated('verseStats', { ok: true, list: [] });
  ctx.ranking = async () => ({ ok: true, list: [] });
  ctx.sendPush = async (b) => { const e = X.adminError(b); w.seen.push('sendPush:' + (e || 'ok')); w.pushed.push(Object.keys(b).sort().join(',')); return e ? { ok: false, error: e } : { ok: true }; };
  return { w, X, I: (o) => Object.assign(o, { [X.INTERNAL_OK]: true }) };
}
const skip = () => (RUN ? false : WHY);

test('⑤ weeklyReport — 내부 키(표)와 암호 길이 같은 숫자 · 안쪽 거절 0 · 표도 암호도 없으면 unauthorized', { skip: skip() }, async () => {
  for (const [label, mk, ok] of [['내부 키', (I) => I({ action: 'weeklyReport' }), true], ['암호 길', () => ({ action: 'weeklyReport', pw: 'right-pw' }), true],
    ['표 · 암호 없음', () => ({ action: 'weeklyReport' }), false], ['틀린 암호', () => ({ action: 'weeklyReport', pw: 'nope' }), false]]) {
    const x = world();
    const res = await x.X.weeklyReport(mk(x.I));
    assert.equal(res.ok, ok, label + ' ok');
    if (!ok) { assert.equal(res.error, 'unauthorized', label); continue; }
    assert.equal(res.report.summary.cumParticipants, 7, label + ' — 누적 참여자(0 이면 안쪽 stats 가 표를 못 받았다)');
    assert.deepEqual(x.w.weekly.map((k) => k.newCount), [2, 2, 2, 2, 2, 2, 2, 2], label + ' — 주차별 신규');
    assert.equal(x.w.seen.filter((s) => !s.endsWith(':ok')).length, 0, label + ' — 안쪽 거절');
  }
});

test('⑤ weeklyReport — 보내기: 내부 키 길은 받는 곳을 더하지 않는다 · 암호 길은 그대로', { skip: skip() }, async () => {
  const a = world(); await a.X.weeklyReport(a.I({ action: 'weeklyReport', send: true, extra: 'x@y.z' }));
  assert.equal(a.w.mailExtra, undefined, '내부 키 + extra');
  const b = world(); await b.X.weeklyReport({ action: 'weeklyReport', pw: 'right-pw', send: true, extra: 'x@y.z' });
  assert.equal(b.w.mailExtra, 'x@y.z', '암호 + extra');
});

test('⑤ weeklyVersePush — 내부 키 길에서 안쪽 sendPush 가 표를 받는다 · adminError 는 표를 맨 앞에서 본다', { skip: skip() }, async () => {
  const a = world();
  const r = await a.X.weeklyVersePush(a.I({ action: 'weeklyVersePush' }));
  assert.equal(r.ok, true);
  assert.deepEqual(a.w.seen, ['sendPush:ok']);
  assert.equal(a.X.adminError(a.I({ action: 'sendPush' })), null);
  assert.equal(a.X.adminError({ action: 'sendPush' }), 'unauthorized');
  assert.equal(a.X.adminError({ action: 'sendPush', pw: 'right-pw' }), null, '암호 길(ADMIN_PW_ONLY) 그대로');
});
