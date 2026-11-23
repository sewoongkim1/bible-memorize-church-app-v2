// 🌿 오늘의 묵상 창 — 날마다 바뀌는 배경 사진 · 제목 글꼴(2026-11-23 · 꾸러미 없음 · preflight 가 건다)
//
//   node --test tests/med-look.test.cjs
//
// 왜: 사진 이름이 하나 틀리면 그 날만 조용히 흰 판이 되고(받기 실패는 오류를 안 낸다) · 철이 어긋나면 7월에 눈 사진이 뜬다.
//   글꼴 수가 7의 배수면 같은 요일에 같은 글꼴로 굳는다. 눈으로는 하루에 한 장씩만 보이는 자리라 글자로 지킨다.
//   읽을 것: docs/notes/meditation.md 끝 「날마다 바뀌는 배경 · 제목 글꼴」
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ROOT = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const CSS = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8').replace(/\r\n/g, '\n');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const cut = (src, a, b) => { const i = src.indexOf(a); assert.ok(i >= 0, a + ' 를 못 찾았다 — 이 검사가 낡았다'); const j = src.indexOf(b, i + a.length); assert.ok(j > i, a + ' 끝을 못 찾았다'); return src.slice(i, j + b.length); };
const SRC = cut(APP, 'const MED_BG = {', '\n};\n') + cut(APP, 'const MED_FONTS = [', '\n];\n') + cut(APP, 'function medDayLook(day) {', '\n}\n');
const box = {};
vm.runInNewContext(SRC + '\nthis.MED_BG = MED_BG; this.MED_FONTS = MED_FONTS; this.medDayLook = medDayLook;', box);
const { MED_BG, MED_FONTS, medDayLook } = box;
const dayOf = (s) => Math.floor(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86400000);   // app.js kstDayNumber 와 같은 셈
const all = Object.values(MED_BG).flat();

test('사진 — 이름마다 img/share 에 파일이 있다 · 한 철 안에 겹치지 않는다 · 뺀 넷은 없다', () => {
  for (const id of all) assert.ok(fs.existsSync(path.join(ROOT, 'img', 'share', id + '.webp')), id + '.webp 가 없다 — 그 날만 흰 판이 된다');
  for (const [k, list] of Object.entries(MED_BG)) assert.equal(new Set(list).size, list.length, k + ' 안에 같은 사진이 두 번');
  for (const id of ['bg-harvest', 'bg-watercolor', 'card-birthday-3', 'card-wedding-3']) assert.ok(!all.includes(id), id + ' 는 뺐다(그림풍 · 행사 느낌)');
  assert.equal(new Set(all).size, 45, '45장(창가 card-healing-2 는 봄 · 여름 둘에)');
});

test('철 — 7월엔 여름 · 4월엔 봄 · 10월엔 가을 · 1월엔 겨울(사계절과 번갈아) · 12/1~25 는 성탄과 겨울만 · 12/26 부터는 성탄 장식 없음', () => {
  const span = (from, n) => Array.from({ length: n }, (_, i) => medDayLook(dayOf(from) + i).bg);
  const only = (bgs, ok, msg) => bgs.forEach((b) => assert.ok(ok.includes(b), msg + ' — ' + b));
  only(span('2027-07-01', 31), MED_BG.summer.concat(MED_BG.all), '7월');
  only(span('2027-04-01', 30), MED_BG.spring.concat(MED_BG.all), '4월');
  only(span('2026-10-01', 31), MED_BG.autumn.concat(MED_BG.all), '10월');
  only(span('2027-01-01', 31), MED_BG.winter.concat(MED_BG.all), '1월');
  only(span('2026-12-01', 25), MED_BG.christmas.concat(MED_BG.winter), '12/1~25');
  only(span('2026-12-26', 6), MED_BG.winter.concat(MED_BG.all), '12/26~31');
  assert.ok(span('2026-12-01', 25).some((b) => MED_BG.christmas.includes(b)), '대림절엔 성탄 사진이 나온다');
  assert.ok(span('2027-07-01', 31).some((b) => MED_BG.summer.includes(b)) && span('2027-07-01', 31).some((b) => MED_BG.all.includes(b)), '철 사진과 사계절 사진이 섞인다');
});

test('날마다 — 이틀 잇달아 같은 사진 · 같은 글꼴이 아니다 · 같은 요일이 한 글꼴로 굳지 않는다', () => {
  const s = dayOf('2026-11-01');
  for (let d = s; d < s + 430; d++) {
    const a = medDayLook(d), b = medDayLook(d + 1);
    assert.notEqual(a.bg, b.bg, '이틀 잇달아 같은 사진 — day ' + d);
    assert.notEqual(a.font.f, b.font.f, '이틀 잇달아 같은 글꼴 — day ' + d);
  }
  const mondays = new Set(Array.from({ length: 6 }, (_, w) => medDayLook(dayOf('2026-11-23') + w * 7).font.f));
  assert.ok(mondays.size > 1, '월요일마다 같은 글꼴 — 글꼴 수가 7의 배수면 이렇게 된다');
  assert.ok(MED_FONTS.length % 7 !== 0);
});

test('글꼴 — 새 글꼴은 그 제목 글자만 받는다 · 이미 부르는 글꼴은 index.html 이 그 굵기를 부른다', () => {
  const load = cut(APP, 'function medLoadFont(ft, text) {', '\n}\n');
  assert.match(load, /"https:\/\/fonts\.googleapis\.com\/css2\?family=" \+ ft\.g \+ "&text=" \+ encodeURIComponent\(text\) \+ "&display=swap"/, '글자 지정 받기(text=) — 통째로 받으면 한 꼴에 수 MB');
  assert.match(load, /setTimeout\(ok, 4000\)/, '받기가 멈춰도 창은 기다리지 않는다');
  const fontLink = (HTML.match(/fonts\.googleapis\.com\/css2\?[^"]+/) || [''])[0];
  for (const ft of MED_FONTS) {
    if (ft.g) { assert.ok(!/\s/.test(ft.g), ft.f + ' family 값에 빈칸'); continue; }
    const fam = ft.f.replace(/ /g, '+');
    const m = new RegExp('family=' + fam.replace(/\+/g, '\\+') + ':wght@([0-9;]+)').exec(fontLink);
    assert.ok(m && m[1].split(';').includes(String(ft.w)), ft.f + ' ' + ft.w + ' 는 index.html 이 부르는 굵기여야 한다(아니면 굵기를 흉내 낸다)');
  }
});

test('배선 — 문(MED_BG_OPEN · 시험 참여자 먼저 · A안에서만) · 탭마다 그 날의 꼴 · 사진 못 받으면 흰 판 · 어두운 모드 짝', () => {
  assert.match(APP, /const MED_BG_OPEN = (true|false);/);
  assert.match(APP, /function medBgVisible\(\) \{ return MED_LAYOUT === "a" && \(MED_BG_OPEN \|\| \(typeof ministryTesterCached === "function" && ministryTesterCached\(\)\)\); \}/);
  const mm = cut(APP, 'function showMeditationModal(', '\n}\n');
  assert.match(mm, /<div class="cheer-card dmsg-card med\$\{look \? " has-bg" : ""\}"/);
  assert.match(mm, /\$\{look \? '<div class="med-hero" aria-hidden="true"><\/div>' : ""\}/, '사진 칸은 읽어 주기에서 빠진다');
  assert.match(mm, /cur = i;[\s\S]*?if \(look && lookDay != null\) medApplyLook\(wrap, lookDay \+ \(i - startIdx\)\);[\s\S]*?toTop\(\);/, '탭을 넘기면 그 날의 꼴 · 오늘 탭은 오늘의 꼴');
  const ap = cut(APP, 'function medApplyLook(wrap, day) {', '\n}\n');
  assert.match(ap, /im\.onload = \(\) => \{ if \(hero\.dataset\.bg !== url\) return;/, '빨리 탭을 넘기면 늦게 온 앞 사진이 덮지 않는다');
  assert.ok(!/onerror/.test(ap), '사진을 못 받으면 아무것도 안 한다(흰 판 그대로)');
  for (const sel of ['.md-a .med-hero {', '.md-a .has-bg::before {', '.md-a .has-bg .med-tabs {', '.md-a .cheer-card.med.has-bg .dmsg-title {'])
    assert.ok(CSS.includes('.dark ' + sel), sel + ' 어두운 모드 짝');
  assert.match(CSS, /\.md-a \.med-hero \{[^}]*pointer-events: none;/, '사진 칸이 탭을 가로채지 않는다');
});
