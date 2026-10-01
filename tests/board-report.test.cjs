// 게시판 신고(🚩) — 순수 함수와 「세 곳이 같은가」 검사 (2026-10-01).
//
//   node --test tests/board-report.test.cjs
//
// ⚠️ **꾸러미를 하나도 쓰지 않는다**(node:test·node:assert·node:fs·node:path·node:vm 뿐).
//    그래서 tools/preflight.py 가 이 검사를 배포 앞 그물에 건다 — require('jsdom') 같은 줄을
//    더하는 순간 배포가 통째로 멈춘다. 더하지 말 것.
//
// 무엇을 지키나
//   ① 까닭 목록은 세 곳(app.js · index.ts · supabase/board_reports.sql CHECK)이다. 한 곳만 고치면
//      화면은 열리는데 저장이 막힌다(서버 500 → 「연결이 고르지 않아」). 셋이 같은지 맞대 본다.
//   ② 보관 90일은 개인정보 안내가 약속한 숫자다 — 서버 상수 · SQL cron · privacy/ · 앱 안 안내가
//      같은 말을 하는지 본다(하나라도 다르면 성도님께 사실이 아닌 말을 한 것이 된다).
//   ③ 서버 순수 함수: 받은 값 확인 · 묶기(신고한 분이 새지 않는가) · 발췌.
//   ④ 앱 순수 함수: 서버 오류 코드를 성도님 말로 — 코드를 그대로 보여 드리지 않는가.
//
// app.js·index.ts 는 require() 할 수 없어 두 표식 사이만 잘라 vm 에서 돌린다
// (본보기: tests/send-push-opts.test.cjs · tests/ranking-scope.test.cjs).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

function cut(source, start, end, where) {
  const s = source.indexOf(start);
  const e = source.indexOf(end);
  assert.ok(s >= 0, where + ' 에서 시작 표식을 못 찾았다 — 이 검사가 낡았다: ' + start);
  assert.ok(e > s, where + ' 에서 끝 표식이 시작보다 뒤에 없다 — 이 검사가 낡았다: ' + end);
  return source.slice(s, e);
}
// vm 의 객체는 다른 realm 이라 deepEqual(strict) 이 「같은 모양인데 다르다」로 떨어진다 — JSON 으로 옮겨 담는다.
const J = (x) => JSON.parse(JSON.stringify(x));

// ── 서버(index.ts) ──
const tsSlice = cut(read('supabase/functions/api/index.ts'),
  '// ── 게시판 신고 — 순수 함수 (여기부터) ──', '// ── 게시판 신고 — 순수 함수 (여기까지) ──', 'index.ts');
assert.ok(!/:\s*(any|string|number|boolean|Record|Set)\b/.test(tsSlice),
  'index.ts 신고 순수 구간에 타입 표기가 들어왔다 — node:vm 이 못 돌린다. 표기를 빼거나 구간 밖으로 옮겨라');
const srv = vm.runInContext(tsSlice +
  '\n;({ BOARD_REPORT_REASONS, BOARD_REPORT_LABELS, BOARD_REPORT_NOTE_MAX, BOARD_REPORT_KEEP_DAYS,' +
  ' boardReportInput, boardReportGroup, boardReportExcerpt })', vm.createContext({}));

// ── 앱(app.js) ──
const appSlice = cut(read('app.js'),
  '// ── 게시판 신고 — 순수 (여기부터) ──', '// ── 게시판 신고 — 순수 (여기까지) ──', 'app.js');
const app = vm.runInContext(appSlice +
  '\n;({ BOARD_REPORT_REASONS, BOARD_REPORT_NOTE_MAX, boardReportErrorMsg })', vm.createContext({}));

// ── DB(board_reports.sql) ──
const sql = read('supabase/board_reports.sql');
const sqlReasons = (() => {
  const m = sql.match(/reason\s+text\s+not null\s+check\s*\(\s*reason\s+in\s*\(([^)]*)\)\s*\)/i);
  assert.ok(m, 'board_reports.sql 에서 reason CHECK 를 못 찾았다 — 이 검사가 낡았다');
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
})();

const UID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

// ① 세 곳
test('까닭 목록 — 앱 · 서버 · DB CHECK 가 같다', () => {
  const appCodes = J(app.BOARD_REPORT_REASONS).map((x) => x[0]);
  const srvCodes = J(srv.BOARD_REPORT_REASONS);
  assert.deepEqual([...appCodes].sort(), [...srvCodes].sort(), '앱과 서버의 까닭 코드가 다르다');
  assert.deepEqual([...sqlReasons].sort(), [...srvCodes].sort(), 'SQL CHECK 와 서버의 까닭 코드가 다르다');
  assert.equal(new Set(srvCodes).size, srvCodes.length, '서버 까닭 코드에 같은 것이 둘 있다');
});

test('까닭 글씨 — 앱 칩과 관리자 화면(서버 라벨)이 같은 말을 한다', () => {
  const labels = J(srv.BOARD_REPORT_LABELS);
  for (const [code, label] of J(app.BOARD_REPORT_REASONS)) {
    assert.equal(labels[code], label, code + ' 의 글씨가 앱과 서버에서 다르다');
  }
  assert.deepEqual(Object.keys(labels).sort(), J(srv.BOARD_REPORT_REASONS).sort());
});

test('덧붙인 말 200자 — 앱 · 서버 · DB CHECK 가 같다', () => {
  assert.equal(app.BOARD_REPORT_NOTE_MAX, srv.BOARD_REPORT_NOTE_MAX);
  const m = sql.match(/char_length\(note\)\s*<=\s*(\d+)/);
  assert.ok(m, 'board_reports.sql 에서 note 길이 CHECK 를 못 찾았다');
  assert.equal(Number(m[1]), srv.BOARD_REPORT_NOTE_MAX);
});

// ② 보관 기간 — 개인정보 안내와 같은 말
test('보관 90일 — 서버 · SQL cron · 개인정보 안내(privacy/ · 앱 안 두 곳)가 같은 숫자다', () => {
  const days = srv.BOARD_REPORT_KEEP_DAYS;
  assert.ok(Number.isInteger(days) && days > 0);
  assert.match(sql, new RegExp("resolved_at < now\\(\\) - interval '" + days + " days'"),
    'SQL cron 의 기간이 서버 BOARD_REPORT_KEEP_DAYS 와 다르다');
  const privacy = read('privacy/index.html');
  assert.ok(privacy.includes('게시판 신고'), 'privacy/index.html 에 게시판 신고가 없다');
  assert.ok(privacy.includes(days + '일 뒤 저절로 지워집니다'), 'privacy/index.html 의 보관 기간이 서버와 다르다');
  const appSrc = read('app.js');
  const priv = cut(appSrc, 'function renderPrivacyInfo(', 'function renderHelp(', 'app.js');
  assert.ok(priv.includes('🚩 신고') && priv.includes(days + '일 뒤'), '앱 「개인정보 수집·이용 안내」에 신고·보관 기간이 없다');
  const help = appSrc.slice(appSrc.indexOf('function renderHelp('));
  const helpPriv = help.slice(help.indexOf('🔒 개인정보 안내'), help.indexOf('</section>', help.indexOf('🔒 개인정보 안내')));
  assert.ok(helpPriv.includes('게시판 신고') && helpPriv.includes(days + '일 뒤'), '도움말 「🔒 개인정보 안내」에 신고·보관 기간이 없다');
});

// 같은 방침 안에서 「글을 지우면」은 글쓴 분이 직접 지우는 것이다(4항 사진 · 5항 「내 글 지우기」).
// 그런데 본인 삭제(boardDeleteMine)는 deleted 표시만 하고 신고를 건드리지 않는다 — cascade 는 관리자
// 완전삭제(boardModerate delete)에서만 돈다. 그래서 3항이 「글이 지워지면 신고도 지워진다」고 뭉뚱그리면
// 지켜지지 않는 약속이 된다. 본인 삭제가 신고를 지우게 하지도 말 것 — 글은 되살릴 수 있어서,
// 욕설을 쓰고 신고받은 뒤 스스로 지워 처리 기록을 없애는 길이 생긴다.
test('보관 — privacy/ 3항은 관리자 완전삭제와 본인 삭제를 나눠 말한다(본인 삭제는 신고를 안 지운다)', () => {
  const p3 = cut(read('privacy/index.html'), '<h2>3. 얼마나 보관하나</h2>', '<h2>4. 누가 볼 수 있나</h2>', 'privacy/index.html');
  assert.ok(!p3.includes('신고된 글이 지워지면'),
    'privacy/ 3항이 「신고된 글이 지워지면 신고도 지워진다」고 한다 — 본인 삭제에는 맞지 않는다');
  assert.ok(p3.includes('운영진이 신고된 글을 완전히 지우면'), 'privacy/ 3항에 「운영진 완전삭제면 함께 지워진다」가 없다');
  assert.ok(p3.includes('직접 지운 글의 신고'), 'privacy/ 3항에 「글쓴 분이 직접 지운 글의 신고는 처리 뒤 90일」이 없다');
  const ts = read('supabase/functions/api/index.ts');
  const s = ts.indexOf('async function boardDeleteMine(');
  assert.ok(s >= 0, 'index.ts 에서 boardDeleteMine 을 못 찾았다 — 이 검사가 낡았다');
  const e = ts.indexOf('\nasync function ', s + 1);
  const mine = ts.slice(s, e > s ? e : undefined);
  assert.ok(!mine.includes('board_reports'),
    'boardDeleteMine 이 신고를 건드린다 — 그렇게 바꿨다면 privacy/ 3항 문구와 이 검사의 까닭부터 다시 볼 것');
});

// ③ 서버 — 받은 값 확인
test('boardReportInput — 신원이 없거나 모양이 틀리면 no-user', () => {
  assert.equal(srv.boardReportInput({}).error, 'no-user');
  assert.equal(srv.boardReportInput(null).error, 'no-user');
  assert.equal(srv.boardReportInput({ user_id: 'abc', reason: 'spam', post_id: 1 }).error, 'no-user');
  assert.equal(srv.boardReportInput({ user_id: 12345, reason: 'spam', post_id: 1 }).error, 'no-user');
});

test('boardReportInput — 목록에 없는 까닭은 bad-reason (라벨 글씨를 보내도)', () => {
  assert.equal(srv.boardReportInput({ user_id: UID, reason: 'nope', post_id: 1 }).error, 'bad-reason');
  assert.equal(srv.boardReportInput({ user_id: UID, post_id: 1 }).error, 'bad-reason');
  assert.equal(srv.boardReportInput({ user_id: UID, reason: '광고·도배', post_id: 1 }).error, 'bad-reason');
  assert.equal(srv.boardReportInput({ user_id: UID, reason: 'constructor', post_id: 1 }).error, 'bad-reason');
});

test('boardReportInput — 대상이 없거나 이상한 번호면 bad-args', () => {
  for (const bad of [{}, { post_id: 0 }, { post_id: -3 }, { post_id: 1.5 }, { post_id: 'x' },
    { post_id: '1e3' }, { reply_id: null }, { post_id: Number.MAX_SAFE_INTEGER + 2 }]) {
    assert.equal(srv.boardReportInput({ user_id: UID, reason: 'spam', ...bad }).error, 'bad-args', JSON.stringify(bad));
  }
});

test('boardReportInput — 글 신고 · 답글 신고(답글 번호가 있으면 답글)', () => {
  assert.deepEqual(J(srv.boardReportInput({ user_id: UID, reason: 'spam', post_id: '7' })),
    { userId: UID, reason: 'spam', kind: 'post', id: 7, note: null });
  assert.deepEqual(J(srv.boardReportInput({ user_id: UID, reason: 'other', post_id: 7, reply_id: 31 })),
    { userId: UID, reason: 'other', kind: 'reply', id: 31, note: null });
  // 대문자 uuid 도 같은 사람이다(본인 글 비교가 어긋나지 않게 소문자로)
  assert.equal(srv.boardReportInput({ user_id: UID.toUpperCase(), reason: 'spam', post_id: 1 }).userId, UID);
});

test('boardReportInput — 덧붙인 말: 공백을 접고, 200자에서 자르고, 이모지를 반으로 쪼개지 않는다', () => {
  const v = srv.boardReportInput({ user_id: UID, reason: 'privacy', post_id: 1, note: '  전화번호가\n\n  보여요  ' });
  assert.equal(v.note, '전화번호가 보여요');
  assert.equal(srv.boardReportInput({ user_id: UID, reason: 'privacy', post_id: 1, note: '   ' }).note, null);
  const long = srv.boardReportInput({ user_id: UID, reason: 'other', post_id: 1, note: '가'.repeat(250) });
  assert.equal(Array.from(long.note).length, 200);
  const emo = srv.boardReportInput({ user_id: UID, reason: 'other', post_id: 1, note: '😀'.repeat(210) });
  assert.equal(Array.from(emo.note).length, 200);
  assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(emo.note), '반쪽 이모지가 남았다');
});

// ③ 서버 — 묶기
const rows = [
  { id: 1, post_id: 10, reply_id: null, reason: 'spam', note: '광고예요', created_at: '2026-10-01T01:00:00+00:00', reporter_id: UID },
  { id: 2, post_id: 10, reply_id: null, reason: 'spam', note: null, created_at: '2026-10-01T03:00:00+00:00', reporter_id: 'x' },
  { id: 3, post_id: 10, reply_id: 55, reason: 'privacy', note: null, created_at: '2026-10-01T02:00:00+00:00', reporter_id: 'y' },
  { id: 4, post_id: 12, reply_id: null, reason: 'inappropriate', note: null, created_at: '2026-10-01T05:00:00+00:00', user_id: UID },
  { id: 5, post_id: 10, reply_id: null, reason: 'other', note: '이상해요', created_at: '2026-09-30T23:00:00+00:00' },
];

test('boardReportGroup — 글·답글 하나당 한 묶음 · 까닭별로 센다 · 많이 신고된 것이 앞', () => {
  const g = J(srv.boardReportGroup(rows));
  assert.equal(g.length, 3);
  assert.deepEqual(g.map((x) => x.kind + ':' + x.id), ['post:10', 'post:12', 'reply:55']);
  assert.deepEqual(g[0], {
    kind: 'post', id: 10, post_id: 10, count: 3, reasons: { spam: 2, other: 1 },
    notes: ['광고예요', '이상해요'], first_at: '2026-09-30T23:00:00+00:00', last_at: '2026-10-01T03:00:00+00:00',
  });
  assert.equal(g[2].post_id, 10, '답글 묶음도 어느 글에 달렸는지 안다');
  // 같은 건수면 최근 것이 앞 — post:12(05시) 가 reply:55(02시) 보다 앞
  assert.equal(g[1].last_at, '2026-10-01T05:00:00+00:00');
});

test('boardReportGroup — 신고한 분(reporter_id · user_id)이 밖으로 새지 않는다', () => {
  const out = JSON.stringify(J(srv.boardReportGroup(rows)));
  assert.ok(!out.includes('reporter'), 'reporter 가 묶음에 실렸다');
  assert.ok(!out.includes('user_id'), 'user_id 가 묶음에 실렸다');
  assert.ok(!out.includes(UID), '신고한 분의 uuid 가 묶음에 실렸다');
  assert.deepEqual(J(srv.boardReportGroup([])), []);
  assert.deepEqual(J(srv.boardReportGroup(null)), []);
});

test('boardReportExcerpt — 길면 자르고 … · 관리자 공지만 태그를 벗긴다', () => {
  assert.equal(srv.boardReportExcerpt('가나다라마', 3, false), '가나다…');
  assert.equal(srv.boardReportExcerpt('짧은 글', 10, false), '짧은 글');
  assert.equal(srv.boardReportExcerpt('<b>공지</b>\n<p>내용</p>', 20, true), '공지 내용');
  assert.equal(srv.boardReportExcerpt('1 < 2 > 0', 20, false), '1 < 2 > 0', '성도 글의 꺾쇠는 글자 그대로');
  assert.equal(srv.boardReportExcerpt(null, 5, false), '');
});

// ④ 앱 — 오류 코드를 성도님 말로
test('boardReportErrorMsg — 아는 코드는 저마다의 말, 모르는 것은 「다시 해 주세요」', () => {
  const codes = ['no-user', 'own', 'not-found', 'bad-reason', 'not-ready'];
  const msgs = codes.map((c) => app.boardReportErrorMsg(c));
  assert.equal(new Set(msgs).size, codes.length, '서로 다른 코드가 같은 말이 됐다');
  for (const [i, m] of msgs.entries()) {
    assert.ok(!m.includes(codes[i]), '코드(' + codes[i] + ')를 그대로 보여 준다');
  }
  const fallback = app.boardReportErrorMsg('Failed to fetch');
  assert.match(fallback, /다시 해 주세요/);
  assert.equal(app.boardReportErrorMsg(undefined), fallback);
  assert.equal(app.boardReportErrorMsg('HTTP 500'), fallback);
});
