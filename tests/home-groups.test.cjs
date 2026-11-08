// 첫 화면 A안 묶음표(HA_GROUPS)와 renderSummary 템플릿의 단추가 짝이 맞는가(2026-10-13 · 꾸러미 없음 · preflight 가 건다)
//
//   node --test tests/home-groups.test.cjs
//
// 왜: A안은 템플릿이 그린 단추를 id 로 찾아 「묶음 제목 + 흰 카드 줄」로 옮겨 담는다(app.js applyHomeA).
//   ⚠️ 템플릿 단추 id 가 HA_GROUPS 에서 빠지면 그 단추는 옮겨지지 않고 바탕 띠(.ha-zone) 뒤에 옛 모양으로 남아
//      띠의 음수 아래 여백·둥근 모서리와 겹친다(「더 보기」 안이면 숨은 채 사라진다). 두 번 쓰면 앞 묶음이 빈 카드로 남는다.
//   묶음을 옮기는 일(2026-10-13 「암송 과정」을 「함께」 위로 · 넷을 옮김 · 2026-10-29 「함께」 아래로)마다 눈으로만 보던 자리라 글자로 지킨다.
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
// 「새 소식」 맨 위 줄(HA_NEWS · 2026-11-07 🎓 수험생 응원기도카드) — HA_GROUPS 밖에서 haGroupsFor 가 맨 앞에 붙인다(단추가 없으면 묶음째 없다)
const newsM = /const HA_NEWS = \[([^\]]*)\];/.exec(APP);
assert.ok(newsM, 'HA_NEWS 를 못 찾았다 — 이 검사가 낡았다');
const newsIds = [...newsM[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
const haIds = groups.flatMap((g) => g.ids).concat(newsIds);
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

test('A안 묶음 차례 — 「암송 과정」은 「함께」 바로 아래(친구 2026-10-29) · 쉴만한 물가 · 내 안에 거하는 말씀 · 네비게이토 · 퀴즈(친구 2026-10-13)', () => {
  assert.deepEqual(groups.map((g) => g.title), ['말씀 묵상', '내 기록', '교회 생활', '함께', '암송 과정', '교회 사이트']);
  assert.deepEqual(groups.find((g) => g.title === '암송 과정').ids, ['open-psalm', 'open-passages', 'open-navi', 'open-quiz']);
  assert.deepEqual(groups.find((g) => g.title === '함께').ids, ['open-board', 'open-prayer', 'open-cards', 'open-pilsa']);   // 💌 말씀카드는 가정 축복 기도문 바로 아래(2026-11-07)
  // 교회 사이트 — 찬양 · 말씀 아카이브 아래 고척교회 유튜브(친구 2026-10-13)
  assert.deepEqual(groups.find((g) => g.title === '교회 사이트').ids, ['open-praise', 'open-sermon-archive', 'open-youtube']);
  assert.ok(APP.includes('window.open("https://www.youtube.com/@GocheokCh", "_blank", "noopener")'), '고척교회 유튜브 주소');
});

test('💬 응원·기도·공감 한 주간 맨 위(친구 2026-11-06) — 11/12(목)까지 이번 주 말씀 바로 아래 「새 소식」 · 11/13 부터 저절로 「함께」 첫 줄', () => {
  const vm = require('node:vm');
  const cut = (head) => {
    const a = APP.indexOf(head);
    const b = APP.indexOf('\n}\n', a);
    assert.ok(a >= 0 && b > a, head + ' 를 못 찾았다 — 이 검사가 낡았다');
    return APP.slice(a, b + 3);
  };
  const until = /const BOARD_TOP_UNTIL = "(\d{4}-\d{2}-\d{2})";/.exec(APP);
  assert.ok(until, 'BOARD_TOP_UNTIL 을 못 찾았다');
  assert.equal(until[1], '2026-11-12', '기간 끝 — 공지 #62 「11월 12일(목)까지」와 같은 날');
  const src = HA + '];\n' + newsM[0] + '\n' + until[0] + '\n' + cut('function kstDateParts(raw) {') + cut('function boardTopOn(raw) {') + cut('function haGroupsFor(raw) {');
  const ctx = vm.runInNewContext(src + '\n({ HA_GROUPS, boardTopOn, haGroupsFor })');
  const plain = (gs) => JSON.parse(JSON.stringify(gs.map((g) => ({ title: g.title, ids: g.ids }))));
  const ids = (gs) => gs.flatMap((g) => g.ids).slice().sort();
  for (const at of ['2026-11-06T02:00:00+09:00', '2026-11-12T23:59:00+09:00']) {
    const gs = plain(ctx.haGroupsFor(at));
    assert.deepEqual(gs[0], { title: '새 소식', ids: ['open-card-suneung', 'open-board'] }, at + ' — 맨 위 「새 소식」이 🎓 카드 · 💬 게시판이 아니다');
    assert.deepEqual(gs.find((g) => g.title === '함께').ids, ['open-prayer', 'open-cards', 'open-pilsa'], at + ' — 「함께」에 게시판이 남았다(두 번)');
    assert.deepEqual(ids(gs), ids(plain(ctx.HA_GROUPS)).concat(newsIds).sort(), at + ' — 단추가 빠지거나 늘었다');
  }
  // 11/13 0시(KST · UTC 로는 11/12 15시) — 원래 묶음표 그대로
  const after = plain(ctx.haGroupsFor('2026-11-12T15:00:00Z'));
  assert.deepEqual(after[0], { title: '새 소식', ids: ['open-card-suneung'] }, '11/13(KST) — 「새 소식」은 🎓 카드 한 줄뿐');
  assert.deepEqual(after.slice(1), plain(ctx.HA_GROUPS), '11/13(KST)인데 아직 게시판이 맨 위다');
  assert.equal(ctx.boardTopOn('2026-11-12T14:59:00Z'), true, '11/12 23:59(KST)인데 벌써 내려갔다');
  // 조립은 오늘 날짜의 묶음표로 · 설명서 첫 걸음도 같은 문으로 갈라 쓴다
  assert.match(APP, /haGroupsFor\(\)\.forEach\(\(g\) => \{/, 'applyHomeA 가 haGroupsFor() 를 쓰지 않는다');
  assert.ok(!/\n\s*HA_GROUPS\.forEach\(/.test(APP), 'HA_GROUPS 를 바로 도는 곳이 남았다(한 주간 자리가 안 바뀐다)');
  assert.ok(/HOME_LAYOUT === "a" && boardTopOn\(\)[^\n]*\n\s*\? "첫 화면 <b>「이번 주 말씀」<\/b> 바로 아래 <b>「새 소식」<\/b>에서 <b>💬 응원·기도·공감<\/b>을 누르세요\."\n\s*: "첫 화면 <b>「함께」<\/b>에서 <b>💬 응원·기도·공감<\/b>을 누르세요\."/.test(APP),
    '설명서 게시판 첫 걸음이 한 주간 자리와 갈라져 있지 않다');
});

test('설명서 — 자리를 말하는 쉴만한 물가 줄은 첫 화면 꼴(HOME_LAYOUT)로 갈라 쓴다(A안 「암송 과정」 · 옛 첫 화면 「함께」)', () => {
  assert.ok(/HOME_LAYOUT === "a"[^\n]*\n\s*\? "첫 화면 <b>「암송 과정」<\/b>에서 <b>🐑 쉴만한 물가<\/b>를 누르세요\."\n\s*: "첫 화면 <b>「함께」<\/b>에서 <b>🐑 쉴만한 물가<\/b>를 누르세요\."/.test(APP),
    '설명서 쉴만한 물가 첫 걸음이 두 꼴로 갈라져 있지 않다');
  // 옛 첫 화면(롤백 템플릿)에서 물가는 「함께」 덩이에 있다 — 그래서 옛 말이 참이다
  const together = RS.slice(RS.indexOf('<div class="grp-title">함께</div>'), RS.indexOf('id="more-toggle"'));
  assert.ok(together.includes('id="open-psalm"'), '옛 첫 화면 「함께」에 쉴만한 물가가 없다 — 설명서 옛 말을 고칠 것');
});

test('🎓 수험생 응원기도카드(친구 2026-11-07) — 「새 소식」 맨 위 · 문(🧪 시험 참여자 먼저) · 기간(12/11 까지) 안에만 단추 · 단추가 없으면 묶음째 없다', () => {
  assert.deepEqual(newsIds, ['open-card-suneung'], '「새 소식」 맨 위는 카드 한 줄(게시판 한 주간은 그 아래)');
  assert.match(APP, /const CARD_SHARE_OPEN = true;/, '2026-11-07 모두에게 열었다(친구 「모두 열어 주세요」 · 닫으려면 false 한 줄 + bump — 그러면 🧪 시험 참여자만)');
  assert.match(APP, /function cardShareVisible\(\) \{ return CARD_SHARE_OPEN \|\| \(typeof ministryTesterCached === "function" && ministryTesterCached\(\)\); \}/);
  assert.match(APP, /const CARD_SUNEUNG_UNTIL = "2026-12-11";/, '성적 통지 날까지');
  assert.match(APP, /function cardSuneungOn\(\) \{ return cardShareVisible\(\) && todayYmd\(\) <= CARD_SUNEUNG_UNTIL; \}/, '문 · 기간(KST 날짜)');
  assert.match(RS, /\$\{cardSuneungOn\(\) \? `<button class="summary-help" id="open-card-suneung">🎓 수험생 응원기도카드<\/button>` : ""\}/, '단추는 문 · 기간 안에만 그린다');
  assert.match(APP, /const rows = g\.ids\.map\(\(id\) => document\.getElementById\(id\)\)\.filter\(Boolean\);\n\s*if \(!rows\.length\) return;/, '단추가 없는 묶음(「새 소식」)은 제목째 없다');
  // 옛 파일에 없던 이름 — 다른 화면 파일이 같은 이름을 선언하면 CDN 옛 파일과 「이미 선언됨」으로 깨진다(prayer-book.md)
  const others = ['js/pray-share.js', 'js/prayer.js'].map((f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
  for (const nm of ['CARD_SHARE_OPEN', 'cardShareVisible', 'CARD_SUNEUNG_UNTIL', 'cardSuneungOn', 'HA_NEWS']) {
    assert.ok(!new RegExp('(const|let|var|function) ' + nm + '\\b').test(others), nm + ' 를 다른 화면 파일이 선언한다');
  }
});

test('💌 말씀카드(친구 2026-11-07 「늘 쓰는 축하, 위로만 먼저」) — 「함께」 가정 축복 기도문 바로 아래 · 문(🧪 시험 참여자 먼저) 안에만 · 옛 첫 화면에도 · 지연 모듈 · 옛 pray-share.js 면 껐다 켜기 · 설명서 한 걸음', () => {
  assert.match(APP, /const CARD_MORE_OPEN = true;/, '2026-11-08 모두에게(닫으려면 false 한 줄 + bump)');
  assert.match(APP, /function cardMoreVisible\(\) \{ return CARD_MORE_OPEN \|\| \(typeof ministryTesterCached === "function" && ministryTesterCached\(\)\); \}/);
  assert.match(RS, /<button class="summary-help" id="open-prayer">[^\n]*\n[^\n]*\n\s*\$\{cardMoreVisible\(\) \? `<button class="summary-help" id="open-cards">💌 말씀카드\$\{newBadge\("cards"\)\}<\/button>` : ""\}/, '옛 첫 화면 — 「함께」 가정 축복 기도문 바로 아래 · 문 안에만 그린다');
  const together = groups.find((g) => g.title === '함께').ids;
  assert.equal(together.indexOf('open-cards'), together.indexOf('open-prayer') + 1, 'A안 — 「함께」 가정 축복 기도문 바로 아래');
  assert.match(APP, /"open-cards": "mail"/); assert.match(APP, /\n  mail: "M[^"]+",/, '편지 아이콘');
  assert.match(APP, /const b = document\.getElementById\("open-cards"\);[^\n]*\n\s*if \(b\) b\.addEventListener\("click", \(\) => \{ markFeatSeen\("cards"\); scRemoveBadge\("open-cards"\); withLazyJs\("prayShare", \(\) => \{\n\s*if \(typeof openCardPick === "function"\) openCardPick\(cardSuneungOn\(\)\);\n\s*else appAlert\(typeof openPrayShare === "function" \? "앱이 새 판으로 바뀌었어요\. 앱을 껐다가 다시 열어 주세요\." : /,
    '단추 — js/pray-share.js 를 받아 openCardPick(수험생은 기간 안에만 맨 앞) · 옛 파일이면 껐다 켜기 안내');
  const a = APP.indexOf('icon: "🙏", title: "가정 축복 기도문"'), man = APP.slice(a, APP.indexOf('tip:', a));
  assert.ok(a > 0 && /get steps\(\) \{/.test(man), '설명서 — 문 · 기간은 펼 때 본다(getter)');
  assert.ok(man.includes('...(cardMoreVisible() ? ["첫 화면 <b>「함께」</b>의 <b>💌 말씀카드</b>에서 생일 · 결혼기념일 · 새 출발 · 위로 · 병문안 카드를 이름을 넣어 <b>그림 한 장</b>으로 보낼 수 있어요."] : []),'), '설명서 「가정 축복 기도문」 장 — 💌 걸음(문 안에만)');
  assert.ok(man.indexOf('cardMoreVisible()') > man.indexOf('cardSuneungOn()'), '수험생 걸음 곁(아래)');
  const others = ['js/pray-share.js', 'js/prayer.js'].map((f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
  for (const nm of ['CARD_MORE_OPEN', 'cardMoreVisible']) assert.ok(!new RegExp('(const|let|var|function) ' + nm + '\\b').test(others), nm + ' 를 다른 화면 파일이 선언한다');
  for (const nm of ['openCardPick', 'CARD_MENU', 'pshCardSwap', 'pshCardUse', 'cardTitle', 'cardSetKey', 'pshThumbHtml', 'pshThumbsWire']) assert.ok(!new RegExp('(const|let|var|function) ' + nm + '\\b').test(APP), nm + ' 를 app.js 가 선언한다(판 파일과 「이미 선언됨」)');
});
