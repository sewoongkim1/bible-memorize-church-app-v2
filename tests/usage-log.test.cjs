// 📤 보내기 · 💬 게시판 이용 기록(2026-11-06) — 앱 화면 쪽(꾸러미 없음 · preflight 가 건다)
//
//   node --test tests/usage-log.test.cjs
//
// 왜: 교회 어드민 「📤 보내기 · 💬 게시판」 탭이 이름 · 소속과 함께 보는 숫자다 — 어린 부서(만 14세 미만)가 섞이거나,
//   닫은 공유 창 · 관리자 미리보기가 「보냈다」로 세지면 숫자가 거짓이 된다. 그 자리를 글자와 vm 으로 지킨다.
//   읽을 것: docs/superpowers/specs/2026-11-06-share-board-usage-log-design.md(2-1 값 · 2-2 종류 코드 · 2-4 어린 부서)
//   보내기 판(js/pray-share.js — 종류 1 · 2 · 3 · 8)은 tests/pray-share.test.cjs 가 본다.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = (...f) => fs.readFileSync(path.join(__dirname, '..', ...f), 'utf8').replace(/\r\n/g, '\n');
const APP = read('app.js');
const cut = (src, a, b) => {
  const i = src.indexOf(a), j = src.indexOf(b, i + a.length);
  assert.ok(i >= 0 && j > i, a + ' 를 못 찾았다 — 이 검사가 낡았다');
  return src.slice(i, j);
};
// 맨 앞 칸의 「}」까지 — 함수 하나 통째(app.js 는 함수 끝만 맨 앞 칸에 「}」가 온다)
const fnAt = (src, head) => cut(src, head, '\n}\n') + '\n}\n';
// 줄 끝 주석(// …)을 걷은 코드 — tests/lazy-load.test.cjs 와 같은 꼴
const codeOnly = (t) => t.split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '')).join('\n');

// ── logFeature — 어린 부서 거르기(설계 2-4) ──
const GUARD = cut(APP, '// ── 보호자 확인 — 순수 (여기부터) ──', '// ── 보호자 확인 — 순수 (여기까지) ──');
const LOGF = fnAt(APP, 'const featSent = {};');
const FIVE = ['board', 'share-open', 'share-kakao', 'share-sheet', 'share-save'];
const mkLog = (user) => {
  const sent = [];
  const ctx = vm.createContext({
    loadUser: () => user,
    api: { featureLog: (p) => { sent.push([p.user_id, p.feature, p.item]); return Promise.resolve({ ok: true }); } },
  });
  const T = vm.runInContext(GUARD + '\n' + LOGF + '\n;({ logFeature, usage: typeof USAGE_FEATURES === "undefined" ? null : Array.from(USAGE_FEATURES) })', ctx);
  return { logFeature: T.logFeature, usage: T.usage ? Array.from(T.usage) : null, sent };
};
const KIDS = [
  { name: '김하늘', type: '교회학교', bu: '유년부', grade: '3학년', user_id: 'k1' },
  { name: '김하늘', type: '교회학교', bu: '초등부', grade: '6학년', user_id: 'k2' },
  { name: '김하늘', type: '교회학교', bu: '사랑부', grade: '', user_id: 'k3' },
  { name: '김하늘', type: '교회학교', bu: '중등부', grade: '1학년', user_id: 'k4' },
  { name: '김하늘', type: '교회학교', bu: '중등부', grade: '2학년', user_id: 'k5' },
  { name: '김하늘', type: '교회학교', bu: '중등부', grade: '', user_id: 'k6' },
];
const GROWN = [
  { name: '김세웅', type: '교구', gu: '3교구', mok: '2목장', user_id: 'a1' },
  { name: '김세웅', type: '교회학교', bu: '중등부', grade: '3학년', user_id: 'a2' },
  { name: '김세웅', type: '교회학교', bu: '초등부', grade: '교사', user_id: 'a3' },
  { name: '김세웅', type: '교회학교', bu: '고등부', grade: '1학년', user_id: 'a4' },
  { name: '김세웅', type: '교회학교', bu: '청년부', grade: '', user_id: 'a5' },
];
const who = (u) => [u.type, u.bu || u.gu, u.grade || u.mok].filter(Boolean).join(' ');

test('logFeature — 보내기 · 게시판 다섯 값(USAGE_FEATURES)은 어린 부서(needsGuardian)면 보내지 않는다 · 다른 열람 기록은 지금 그대로', () => {
  const names = mkLog(null).usage;
  assert.ok(names, 'app.js 에 USAGE_FEATURES 가 없다 — logFeature 바로 위에 둔다');
  assert.deepEqual(names.slice().sort(), FIVE.slice().sort(), 'USAGE_FEATURES = 다섯 값(서버 index.ts 의 같은 이름과 같다)');
  for (const kid of KIDS) {
    const r = mkLog(kid);
    for (const f of FIVE) r.logFeature(f, f === 'board' ? 0 : 3);
    assert.deepEqual(r.sent, [], who(kid) + ' — 다섯 값을 보냈다');
    r.logFeature('psalm', 1001); r.logFeature('meditation', 44);
    assert.deepEqual(r.sent.map((s) => s[1]), ['psalm', 'meditation'], who(kid) + ' — 다른 열람 기록은 지금처럼 남는다');
  }
});

test('logFeature — 교구 · 중등부 3학년 · 부서 선생님 · 고등부 · 청년부는 다섯 값도 남긴다 · 로그인 전은 아무것도 · 60초 안 같은 값은 한 번(지금 그대로)', () => {
  for (const g of GROWN) {
    const r = mkLog(g);
    r.logFeature('board', 0); r.logFeature('share-sheet', 6);
    assert.deepEqual(r.sent, [[g.user_id, 'board', 0], [g.user_id, 'share-sheet', 6]], who(g));
  }
  const r = mkLog(GROWN[0]);
  r.logFeature('share-save', 5); r.logFeature('share-save', 5); r.logFeature('share-save', 4);
  assert.deepEqual(r.sent.map((s) => s.slice(1)), [['share-save', 5], ['share-save', 4]], '60초 안 같은 (값, 종류)는 한 번 · 종류가 다르면 따로');
  for (const u of [null, { name: '손님' }]) {
    const q = mkLog(u);
    q.logFeature('board', 0); q.logFeature('psalm', 1001);
    assert.deepEqual(q.sent, [], '로그인 전(user_id 없음)은 아무것도 안 보낸다');
  }
});

test('게시판 — renderBoard 첫 줄이 logFeature("board", 0)(markBoardSeen 앞) · 게시판 기록은 그 한 곳 · renderBoard 를 다시 부르는 곳이 없다', () => {
  assert.match(APP, /\nfunction renderBoard\(\) \{\n  logFeature\("board", 0\);[^\n]*\n  markBoardSeen\(\);/, 'renderBoard 첫 줄 — 배지 지우기(markBoardSeen) 앞');
  const code = codeOnly(APP);
  assert.equal((code.match(/logFeature\("board"/g) || []).length, 1, '게시판 기록은 renderBoard 한 곳 — loadBoard · 서버 boardList 는 글쓰기 · 공감 · 가리기 뒤마다 다시 불리고 교회 어드민도 부른다');
  assert.equal((code.match(/\brenderBoard\(/g) || []).length, 1, 'renderBoard 를 괄호로 부르는 곳이 없다(첫 화면 #open-board 가 이름으로 넘긴다) — 다시 그리는 곳이 생기면 게시판 연 횟수가 부푼다');
  assert.ok(APP.includes('document.getElementById("open-board").addEventListener("click", renderBoard);'), '들어오는 길은 첫 화면 단추 하나');
});
