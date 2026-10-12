// 감시의 감시(GitHub 60일 멈춤 대비 · 2026-10-12 · docs/notes/monitor-guard.md) — api 의 순수 구간을 떼어 node:vm 에서 돌리고,
//   monitor·internalMonitorWatch·크론 SQL·monitor.yml 의 배선을 글자로 본다(꾸러미 없음 · preflight 가 건다).
//   한 글자만 틀려도 「조용히 안 지킨다」 — 크론은 net.http_post 를 넣기만 하면 succeeded 이고, 흔적이 없으면 api 는 「모른다」로 알리지 않는다.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = (...file) => fs.readFileSync(path.join(__dirname, '..', ...file), 'utf8').replace(/\r\n/g, '\n');
const API = read('supabase', 'functions', 'api', 'index.ts');
const A = API.indexOf('// ── 감시의 감시 — 순수 함수 (여기부터) ──'), B = API.indexOf('// ── 감시의 감시 — 순수 함수 (여기까지) ──');
assert.ok(A >= 0 && B > A, '순수 구간 표식');
const srv = {}; vm.createContext(srv); vm.runInContext(API.slice(A, B), srv);
const pick = (v) => JSON.parse(JSON.stringify(v));
const fn = (name) => { const a = API.indexOf('async function ' + name + '('); assert.ok(a >= 0, name); const b = API.indexOf('\n}\n', a); return API.slice(a, b); };

const NOW = Date.parse('2026-10-12T03:00:00Z');   // 12:00 KST
const ago = (h) => new Date(NOW - h * 3600000).toISOString();

test('흔적의 나이 — 없거나 못 읽으면 null(「모른다」 · 알리지 않는다)', () => {
  assert.equal(srv.monitorAgeH(null, NOW), null);
  assert.equal(srv.monitorAgeH({}, NOW), null);
  assert.equal(srv.monitorAgeH({ at: 'x' }, NOW), null);
  assert.equal(srv.monitorAgeH('2026-10-12', NOW), null, '글자 하나만 든 값');
  assert.equal(srv.monitorAgeH({ at: ago(5) }, NOW), 5);
  assert.equal(srv.monitorAgeH({ at: new Date(NOW + 3600000).toISOString() }, NOW), 0, '앞날의 시각은 0');
  assert.equal(srv.MONITOR_STALE_H, 36);
});

test('monitor 가 보는 지킴이 — 흔적이 생긴 뒤부터 36시간', () => {
  assert.deepEqual(pick(srv.monitorWatchProblems(null, NOW)), [], '크론을 안 건 곳 — 조용');
  assert.deepEqual(pick(srv.monitorWatchProblems({ at: ago(19) }, NOW)), [], '평소(정오에 돌고 이튿날 07:12 에 본다 — 19시간)');
  assert.deepEqual(pick(srv.monitorWatchProblems({ at: ago(36) }, NOW)), [], '36시간 딱은 아직');
  const p = pick(srv.monitorWatchProblems({ at: ago(43.5) }, NOW));
  assert.equal(p.length, 1);
  assert.ok(p[0].includes('43시간째') && p[0].includes('monitor-watch') && p[0].includes('edu_remind_service_key'));
});

test('워크플로 상태 — 보는 두 개만 · 모르는 꼴은 빈 목록', () => {
  const j = { workflows: [
    { path: '.github/workflows/deploy.yml', state: 'active' },
    { path: '.github/workflows/security-check.yml', state: 'disabled_inactivity' },
    { path: '.github/workflows/monitor.yml', state: 'disabled_inactivity' },
  ] };
  assert.deepEqual(pick(srv.monitorWfStates(j)), [
    { path: '.github/workflows/monitor.yml', state: 'disabled_inactivity' },
    { path: '.github/workflows/security-check.yml', state: 'disabled_inactivity' },
  ]);
  assert.deepEqual(pick(srv.monitorWfStates(null)), []);
  assert.deepEqual(pick(srv.monitorWfStates({ message: 'API rate limit exceeded' })), []);
});

test('멈춤 메일 — 마지막 때(KST) · 시간 · 까닭 · 되살리는 법 · 글자 끼워 넣기 막음', () => {
  const m = srv.monitorStaleMail(52.8, '2026-10-09T22:12:00Z', [{ path: '.github/workflows/monitor.yml', state: 'disabled_inactivity' }]);
  assert.equal(m.subject, '[성경암송 감시] GitHub 매일 점검이 52시간째 멈췄습니다');
  assert.ok(m.text.includes('10-10 07:12 KST (52시간 전)'), m.text);
  assert.ok(m.text.includes('monitor.yml — disabled_inactivity') && m.text.includes('60일'));
  assert.ok(m.text.includes('gh workflow enable monitor.yml -R sewoongkim1/bible-memorize-church-app-v2') && m.text.includes('Run workflow'));
  const n = srv.monitorStaleMail(40, 'x', []);
  assert.ok(n.text.includes('알 수 없음') && n.text.includes('읽지 못했습니다') && !n.text.includes('60일 동안 커밋'));
  const h = srv.monitorStaleMail(40, '2026-10-09T22:12:00Z', [{ path: '.github/workflows/monitor.yml', state: '<b>x</b>' }]).html;
  assert.ok(h.includes('&lt;b&gt;x&lt;/b&gt;') && !h.includes('<b>'));
});

test('배선 — monitor 는 src "gha" 일 때만 흔적 · 지킴이 흔적을 본다 · 내부 액션은 서비스 키 · dry 는 메일 없이', () => {
  const mon = fn('monitor');
  assert.ok(mon.includes('if (b.src === "gha") await monitorTrace("monitorRun", { at: new Date().toISOString() });'));
  assert.ok(mon.indexOf('monitorTrace("monitorRun"') < mon.indexOf('push_subscriptions'), '점검보다 먼저 남긴다');
  assert.ok(mon.indexOf('monitorTrace("monitorRun"') > mon.indexOf('adminError(b)'), '암호 확인 뒤에');
  assert.ok(mon.includes('monitorWatchProblems(mw?.value, now.getTime())') && mon.includes('.eq("key", "monitorWatchRun")'));
  const w = fn('internalMonitorWatch');
  assert.ok(w.indexOf('sameSecret(req.headers.get("x-internal-key")') >= 0 && w.indexOf('sameSecret(') < w.indexOf('db.from('), '키 확인이 읽기보다 먼저');
  assert.ok(w.includes('.eq("key", "monitorRun")') && w.includes('monitorTrace("monitorWatchRun"'));
  assert.ok(w.includes('if (b?.dry === true) mailed = "dry";') && w.includes('sendEmailResend(m.subject, m.html, m.text)'));
  assert.ok(API.includes('case "internalMonitorWatch": return json(await internalMonitorWatch(req, body));'));
  // 흔적 키는 앱이 읽는 키가 아니다(공개 설정·관리자 설정 어디에도 없다)
  assert.equal(/PUBLIC_CONFIG_KEYS = new Set\(\[[^\]]*monitor/.test(API), false);
  assert.equal(/ADMIN_CONFIG_KEYS = new Set\(\[[^\]]*monitor/.test(API), false);
});

test('크론 SQL — 액션 이름 · Vault 이름 · 하루 한 번 · 키를 적지 않는다 · 자리표 주소', () => {
  const cron = read('supabase', 'monitor_watch_cron.sql');
  assert.ok(cron.includes("body := jsonb_build_object('action','internalMonitorWatch')"));
  assert.ok(cron.includes("'x-internal-key',(select decrypted_secret from vault.decrypted_secrets where name = 'edu_remind_service_key'))"));
  assert.ok(cron.includes("perform cron.unschedule(jobid) from cron.job where jobname = 'monitor-watch';") && cron.includes("perform cron.schedule('monitor-watch', '0 3 * * *',"));
  assert.ok(cron.includes("v_url text := 'YOUR_API_URL';"), '주소는 자리표로 커밋');
  assert.equal(/sb_secret_|eyJhbGci/.test(cron), false, '키 모양이 없다');
});

test('monitor.yml — src "gha" 로 부른다 · 교회 어드민은 공개로만 본다 · runs-on 고정', () => {
  const y = read('.github', 'workflows', 'monitor.yml');
  assert.ok(y.includes('\\"src\\":\\"gha\\"'), 'monitor 부름에 src');
  assert.ok(y.includes('runs-on: ubuntu-24.04'));
  assert.ok(y.includes('CA_SITE: https://admin.onlybible.kr/') && y.includes('CA_FN: https://xnomlgydifiqiybervtf.supabase.co/functions/v1/church-admin'));
  assert.ok(y.includes(`grep -q '"error":"unauthenticated"'`) && y.includes('[ "$fcode" != "401" ]'));
  const ca = y.slice(y.indexOf('ca_check() {'), y.indexOf('# 3) '));
  assert.equal(/ADMIN_SECRET|TG_TOKEN|apikey|Authorization|x-internal-key/.test(ca), false, '교회 어드민 점검에는 키를 싣지 않는다');
});
