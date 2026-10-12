// 📱 안드로이드 플레이 앱 위 띠(상태바) 색 맞추기(2026-10-13) — 색 읽기 · 겹치기 순수 함수 · 문(꾸러미 없음 · preflight 가 건다)
//
//   node --test tests/statusbar-follow.test.cjs
//
// 왜: 크롬 TWA 는 위 띠를 페이지 theme-color 로 칠한다(투명은 못 한다 — 투명도를 버려 검정이 된다).
//   그래서 화면 맨 위에 깔린 색을 재서 불투명한 한 색으로 넣는다 — 반투명 층(창 뒤 어둠막)은 그 아래 색과 섞어야 한다.
//   읽을 것: docs/notes/android-app.md 「위아래 띠」
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const APP = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const S = APP.indexOf('// ── 위 띠 색 — 순수 (여기부터) ──'), E = APP.indexOf('// ── 위 띠 색 — 순수 (여기까지) ──');
assert.ok(S >= 0 && E > S, 'app.js 에서 위 띠 색 순수 구간을 못 찾았다 — 이 검사가 낡았다');
const SB = vm.runInContext(APP.slice(S, E) + '\n;({ sbParseColor, sbBlend })', vm.createContext({}));
const J = (x) => JSON.parse(JSON.stringify(x));

test('sbParseColor — getComputedStyle 꼴(rgb · rgba · 새 문법) · #hex · transparent · 모르는 꼴은 null', () => {
  assert.deepEqual(J(SB.sbParseColor('rgb(253, 248, 240)')), [253, 248, 240, 1]);
  assert.deepEqual(J(SB.sbParseColor('rgba(13, 27, 62, 0.45)')), [13, 27, 62, 0.45]);
  assert.deepEqual(J(SB.sbParseColor('rgba(0, 0, 0, 0)')), [0, 0, 0, 0]);
  assert.deepEqual(J(SB.sbParseColor('rgb(15 18 24 / 50%)')), [15, 18, 24, 0.5]);
  assert.deepEqual(J(SB.sbParseColor('#1a3a6b')), [26, 58, 107, 1]);
  assert.deepEqual(J(SB.sbParseColor('#FFF')), [255, 255, 255, 1]);
  assert.deepEqual(J(SB.sbParseColor('transparent')), [0, 0, 0, 0]);
  for (const bad of ['', null, undefined, 'red', 'linear-gradient(#000, #fff)', 'rgb(1,2)']) assert.equal(SB.sbParseColor(bad), null, String(bad));
});

test('sbBlend — 맨 밑 바탕 위에 층을 겹쳐 불투명한 #rrggbb 하나로(크롬은 투명도를 버린다)', () => {
  const cream = [253, 248, 240, 1];
  assert.equal(SB.sbBlend([], cream), '#fdf8f0', '아무것도 없으면 바탕');
  assert.equal(SB.sbBlend([[26, 58, 107, 1]], cream), '#1a3a6b', '불투명 층(로고 띠 남색)은 그대로');
  assert.equal(SB.sbBlend([[0, 0, 0, 0]], cream), '#fdf8f0', '투명 층은 없는 것과 같다');
  // 창 뒤 어둠막(반투명 검정) — 크림과 섞여 어두워진 색
  assert.equal(SB.sbBlend([[0, 0, 0, 0.5]], cream), '#7f7c78');
  // 아래부터 위로 차례대로
  assert.equal(SB.sbBlend([[255, 255, 255, 1], [0, 0, 0, 0.5]], cream), '#808080');
  assert.equal(SB.sbBlend([[0, 0, 0, 0.5], [255, 255, 255, 1]], cream), '#ffffff');
  assert.equal(SB.sbBlend([null, [15, 18, 24, 1]], cream), '#0f1218', '어두운 모드 바탕');
});

test('문 — 플레이 앱 실행에서만 · 지금은 🧪 시험 참여자만(STATUSBAR_FOLLOW_OPEN = false) · 보통 크롬 탭·아이폰은 건드리지 않는다', () => {
  assert.ok(/^const STATUSBAR_FOLLOW_OPEN = (true|false);/m.test(APP), '스위치 줄(tools/status.py 가 _OPEN 꼴을 읽는다)');
  assert.ok(APP.includes('function statusBarFollowOn() { return openedByPlayApp() && (STATUSBAR_FOLLOW_OPEN || ministryTesterCached()); }'), '문의 꼴');
  const watch = APP.slice(APP.indexOf('(function watchStatusBarColor() {'), APP.indexOf('})();', APP.indexOf('(function watchStatusBarColor() {')));
  assert.ok(/if \(!openedByPlayApp\(\)\) return;/.test(watch), '플레이 앱이 아닌 실행은 듣지도 않는다');
  // 「이번 실행이 플레이 앱」 표식은 파일 아래쪽에서 적힌다 — 판단은 파일이 다 돈 뒤(setTimeout)여야 첫 실행에도 걸린다(2026-10-13 친구 폰)
  assert.ok(watch.indexOf('setTimeout(() => {') >= 0 && watch.indexOf('setTimeout(() => {') < watch.indexOf('if (!openedByPlayApp()) return;'), '플레이 앱 판단을 setTimeout 안에서 한다');
  assert.ok(APP.indexOf('(function watchStatusBarColor() {') < APP.indexOf('const PLAY_SESSION_KEY = "play-app-session";'), '(이 검사의 전제) 감시 코드가 표식 쓰는 곳보다 위에 있다 — 아래로 옮겼으면 이 줄을 고칠 것');
  // theme-color 를 바꾸는 곳은 syncStatusBar 한 곳뿐(다른 곳이 바꾸면 위 띠가 서로 다투게 된다)
  const writes = APP.split('\n').filter((l) => /meta\[name="theme-color"\]/.test(l) && !/^\s*\/\//.test(l));
  assert.equal(writes.length, 1, 'theme-color 를 만지는 곳은 한 곳');
});
