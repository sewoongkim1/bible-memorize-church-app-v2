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

// ── shareLink — 글 · 주소 보내기의 종류 코드(설계 2-2: 4 · 5 · 6 · 9) ──
const flush = () => new Promise((r) => setImmediate(r));
const err = (n) => Object.assign(new Error(n), { name: n });
const COPIED = '공유 문구가 복사되었습니다! 붙여넣기 해주세요 📋';
const mkShare = (nav, o = {}) => {
  const logs = [], toasts = [];
  const doc = {
    createElement: () => ({ style: {}, focus() {}, select() {} }),
    body: { appendChild() {}, removeChild() {} },
    execCommand: () => { if (o.exec === 'throw') throw new Error('copy'); return o.exec; },
  };
  const ctx = vm.createContext({ navigator: nav, document: doc, SHARE_TITLE: '[고척교회]', showShareToast: (m) => toasts.push(m), logFeature: (f, k) => logs.push([f, k]) });
  vm.runInContext(fnAt(APP, 'function shareLink('), ctx);
  return { shareLink: ctx.shareLink, logs, toasts };
};

test('shareLink — 공유 창으로 넘기면(resolve) share-sheet · 복사가 끝나면 share-save · 닫음 · 실패 · 종류 없음은 안 센다 · 안내 글은 지금 그대로', async () => {
  const U = 'https://gocheok.onlybible.kr/?v=44';
  const CASES = [
    ['공유 창 — 앱을 골랐다', { share: () => Promise.resolve() }, {}, 6, [['share-sheet', 6]]],
    ['공유 창 — 닫음(AbortError)', { share: () => Promise.reject(err('AbortError')) }, {}, 6, []],
    ['공유 창 — 이미 떠 있음(InvalidStateError)', { share: () => Promise.reject(err('InvalidStateError')) }, {}, 6, []],
    ['공유 창 — 종류 없이 부름', { share: () => Promise.resolve() }, {}, undefined, []],
    ['복사 — 됨', { clipboard: { writeText: () => Promise.resolve() } }, {}, 5, [['share-save', 5]]],
    ['복사 — 막힘', { clipboard: { writeText: () => Promise.reject(err('NotAllowedError')) } }, {}, 5, []],
    ['옛 복사 — execCommand true', {}, { exec: true }, 4, [['share-save', 4]]],
    ['옛 복사 — execCommand false', {}, { exec: false }, 4, []],
    ['옛 복사 — execCommand 예외', {}, { exec: 'throw' }, 4, []],
    ['옛 복사 — 종류 없이 부름', {}, { exec: true }, undefined, []],
  ];
  for (const [name, nav, o, kind, want] of CASES) {
    const r = mkShare(nav, o);
    r.shareLink('글', U, kind);
    await flush();
    assert.deepEqual(r.logs, want, name);
  }
  let r = mkShare({ clipboard: { writeText: () => Promise.resolve() } });
  r.shareLink('글', U, 5); await flush();
  assert.deepEqual(r.toasts, [COPIED], '복사됨 안내');
  r = mkShare({ clipboard: { writeText: () => Promise.reject(err('NotAllowedError')) } });
  r.shareLink('글', U, 5); await flush();
  assert.deepEqual(r.toasts, [U], '복사가 막히면 주소를 보여 준다');
  r = mkShare({}, { exec: 'throw' });
  r.shareLink('글', U, 4); await flush();
  assert.deepEqual(r.toasts, [U], '옛 복사가 넘어지면 주소');
});

test('shareLink 를 부르는 넷 — 종류 코드(가을 동행 안내 4 · 앱 소개 5 · 이번 주 말씀 주소 9 · 외운 말씀 6) · 그 밖에 부르는 곳이 없다', () => {
  const src = cut(APP, 'function shareEvent() {', '\n') + '\n' + fnAt(APP, 'function shareApp() {') + fnAt(APP, 'function shareWeeklyVerse(verse) {') + fnAt(APP, 'function shareMyVerse(verse) {');
  const calls = [];
  const HOME = 'https://gocheok.onlybible.kr/';
  const ctx = vm.createContext({ EVENT_SHARE_TEXT: '안내', SHARE_HOME: HOME, verseShareUrl: (no) => HOME + '?v=' + no, shareLink: (t, u, k) => calls.push([u, k]) });
  vm.runInContext(src, ctx);
  const v = { no: 44, refShort: '눅 17:16', text: '본문' };
  ctx.shareEvent(); ctx.shareApp(); ctx.shareWeeklyVerse(v); ctx.shareMyVerse(v);
  assert.deepEqual(calls, [[HOME + '?from=autumn4', 4], [HOME, 5], [HOME + '?v=44', 9], [HOME + '?v=44', 6]]);
  const callers = codeOnly(APP).split('\n').filter((l) => /\bshareLink\(/.test(l) && !/function shareLink\(/.test(l));
  assert.equal(callers.length, 4, 'shareLink 를 새로 부르면 셋째 인자(종류 코드)를 함께 넘기고 이 시험 · 설계서 2-2 · 서버 SHARE_KINDS 에 더한다: ' + callers.map((l) => l.trim()).join(' / '));
});
