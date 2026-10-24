// 첫 화면 A안 묶음표(HA_GROUPS)와 renderSummary 템플릿의 단추가 짝이 맞는가(2026-10-13 · 꾸러미 없음 · preflight 가 건다)
//
//   node --test tests/home-groups.test.cjs
//
// 왜: A안은 템플릿이 그린 단추를 id 로 찾아 「묶음 제목 + 흰 카드 줄」로 옮겨 담는다(app.js applyHomeA).
//   ⚠️ 템플릿 단추 id 가 HA_GROUPS 에서 빠지면 그 단추는 옮겨지지 않고 바탕 띠(.ha-zone) 뒤에 옛 모양으로 남아
//      띠의 음수 아래 여백·둥근 모서리와 겹친다(「더 보기」 안이면 숨은 채 사라진다). 두 번 쓰면 앞 묶음이 빈 카드로 남는다.
//   묶음을 옮기는 일(2026-10-13 「암송 과정」을 「함께」 위로 · 넷을 옮김)마다 눈으로만 보던 자리라 글자로 지킨다.
//   읽을 것: docs/notes/home-screen.md 「암송 과정」 · docs/notes/design-refresh.md
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const APP = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').replace(/\r\n/g, '\n');

const RS = (() => {
  const a = APP.indexOf('function renderSummary() {');
  const b = APP.indexOf('\nfunction ', a + 30);
  assert.ok(a >= 0 && b > a, 'renderSummary 를 못 찾았다 — 이 검사가 낡았다');
  return APP.slice(a, b);
})();
const HA = (() => {
  const a = APP.indexOf('const HA_GROUPS = [');
  const b = APP.indexOf('];', a);
  assert.ok(a >= 0 && b > a, 'HA_GROUPS 를 못 찾았다 — 이 검사가 낡았다');
  return APP.slice(a, b);
})();
const groups = [...HA.matchAll(/\{ title: "([^"]+)"[^\n]*?ids: \[([^\]]*)\]/g)]
  .map((m) => ({ title: m[1], ids: [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]) }));
const haIds = groups.flatMap((g) => g.ids);
// 묶음에 들어가는 단추 — 「함께」 꼴(.summary-help)과 「말씀 묵상」 둘(.feat-actions 의 .summary-go). 위쪽 큰 단추(말씀 암송·도전 — ${s.id})는 묶음 밖이다.
const tplHelp = [...RS.matchAll(/<button class="summary-help[^"]*" id="([^"]+)"/g)].map((m) => m[1]);
const featBox = RS.slice(RS.indexOf('<div class="summary-actions feat-actions">'), RS.indexOf('</div>', RS.indexOf('<div class="summary-actions feat-actions">')));
const tplFeat = [...featBox.matchAll(/<button class="summary-go[^"]*" id="([^"]+)"/g)].map((m) => m[1]);

test('A안 묶음표 — 템플릿의 묶음 단추가 모두 정확히 한 번씩 들어 있다(빠지면 띠 밖에 옛 모양으로 남는다)', () => {
  assert.ok(groups.length >= 5 && tplHelp.length >= 10, '묶음·단추를 못 읽었다 — 이 검사가 낡았다');
  assert.deepEqual(tplFeat, ['open-sermon-chat', 'open-meditation'], '「말씀 묵상」 두 단추');
  const dup = haIds.filter((x, i) => haIds.indexOf(x) !== i);
  assert.deepEqual(dup, [], 'HA_GROUPS 에 두 번 쓴 단추');
  const tpl = tplFeat.concat(tplHelp);
  assert.deepEqual(tpl.filter((x) => !haIds.includes(x)), [], 'HA_GROUPS 에 없는 템플릿 단추(A안에서 띠 밖에 남는다)');
  assert.deepEqual(haIds.filter((x) => !tpl.includes(x)), [], '템플릿에 없는 HA_GROUPS 단추(이름이 틀렸나)');
  // 줄 아이콘도 단추마다(빠지면 아이콘 칸에 › 가 그려진다)
  const rowIcon = APP.slice(APP.indexOf('const HA_ROW_ICON = {'), APP.indexOf('};', APP.indexOf('const HA_ROW_ICON = {')));
  for (const id of haIds) assert.ok(rowIcon.includes('"' + id + '":'), id + ' — HA_ROW_ICON 에 아이콘이 없다');
});

test('A안 묶음 차례 — 「암송 과정」은 「함께」 바로 위 · 쉴만한 물가 · 내 안에 거하는 말씀 · 네비게이토 · 퀴즈(친구 2026-10-13)', () => {
  assert.deepEqual(groups.map((g) => g.title), ['말씀 묵상', '내 기록', '교회 생활 (시험 참여자용)', '암송 과정', '함께', '교회 사이트']);
  assert.deepEqual(groups.find((g) => g.title === '암송 과정').ids, ['open-psalm', 'open-passages', 'open-navi', 'open-quiz']);
  assert.deepEqual(groups.find((g) => g.title === '함께').ids, ['open-board', 'open-prayer', 'open-pilsa']);
  // 교회 사이트 — 찬양 · 말씀 아카이브 아래 고척교회 유튜브(친구 2026-10-13)
  assert.deepEqual(groups.find((g) => g.title === '교회 사이트').ids, ['open-praise', 'open-sermon-archive', 'open-youtube']);
  assert.ok(APP.includes('window.open("https://www.youtube.com/@GocheokCh", "_blank", "noopener")'), '고척교회 유튜브 주소');
});

test('설명서 — 자리를 말하는 쉴만한 물가 줄은 첫 화면 꼴(HOME_LAYOUT)로 갈라 쓴다(A안 「암송 과정」 · 옛 첫 화면 「함께」)', () => {
  assert.ok(/HOME_LAYOUT === "a"[^\n]*\n\s*\? "첫 화면 <b>「암송 과정」<\/b>에서 <b>🐑 쉴만한 물가<\/b>를 누르세요\."\n\s*: "첫 화면 <b>「함께」<\/b>에서 <b>🐑 쉴만한 물가<\/b>를 누르세요\."/.test(APP),
    '설명서 쉴만한 물가 첫 걸음이 두 꼴로 갈라져 있지 않다');
  // 옛 첫 화면(롤백 템플릿)에서 물가는 「함께」 덩이에 있다 — 그래서 옛 말이 참이다
  const together = RS.slice(RS.indexOf('<div class="grp-title">함께</div>'), RS.indexOf('id="more-toggle"'));
  assert.ok(together.includes('id="open-psalm"'), '옛 첫 화면 「함께」에 쉴만한 물가가 없다 — 설명서 옛 말을 고칠 것');
});
