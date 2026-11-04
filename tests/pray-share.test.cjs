// 📤 가정 축복 기도문 보내기(2026-11-04) — 그림 배치 순수 함수 · 배선(꾸러미 없음 · preflight 가 건다)
//
//   node --test tests/pray-share.test.cjs
//
// 왜: 그림은 캔버스라 화면처럼 브라우저가 줄을 접어 주지 않는다 — 104편 × 배경 넷 × 긴 이름에서 글이 상자 밖으로 나가거나,
//   이름 조사가 화면과 달라지면(ㄹ 받침) 성도님이 보낸 그림이 틀린다. 그 셈을 글자로 지킨다.
//   읽을 것: docs/superpowers/specs/2026-11-04-prayer-share-design.md · docs/notes/prayer-book.md 「2026-11 보내기」
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = (...f) => fs.readFileSync(path.join(__dirname, '..', ...f), 'utf8').replace(/\r\n/g, '\n');
const APP = read('app.js'), PS = read('js', 'pray-share.js'), PR = read('js', 'prayer.js'), INDEX = read('index.html');
const LIST = JSON.parse(read('blessings.json'));
const cut = (src, a, b) => {
  const i = src.indexOf(a), j = src.indexOf(b, i + a.length);
  assert.ok(i >= 0 && j > i, a + ' 를 못 찾았다 — 이 검사가 낡았다');
  return src.slice(i, j);
};
// 화면과 같은 이름 채우기 · 문장 나누기(app.js) — 그림도 이 둘을 그대로 쓴다
const FILL = cut(APP, 'function prayJong(', '// 이름을 눈에 띄게') + '\n' + cut(APP, 'const PRAY_AMEN', 'function prayFillHtml(') + '\n' + cut(APP, 'function prayFill(', '// 오늘 몇 번째 편인가');
const PURE = cut(PS, '// ── 기도문 그림 — 순수 (여기부터) ──', '// ── 기도문 그림 — 순수 (여기까지) ──');
const T = vm.runInContext(FILL + '\n' + PURE + '\n;({ prayFill, prayChunks, PRAY_AMEN, prayShareName, prayShareRuns, prayShareWrap, praySharePlan, prayShareChoices, PRAY_SHARE_STYLES, PRAY_SHARE_PHOTOS, PSH_MIN, PSH_MAX, PSH_W, PSH_H })', vm.createContext({}));

// 가짜 폭 — 한글 1em · 띄어쓰기 0.3em · 그 밖 0.55em · 800 굵기 1.04배(나눔명조 · Noto 실측보다 조금 넓게 — 넉넉히 잰다)
const px = (font) => Number(/(\d+)px/.exec(font)[1]);
const measure = (s, font) => {
  const z = px(font); let w = 0;
  for (const ch of String(s)) w += /\s/.test(ch) ? 0.3 * z : /[가-힣]/.test(ch) ? z : 0.55 * z;
  return w * (/^800 /.test(font) ? 1.04 : 1);
};
const NAMES = ['김세웅', '김윤월', '가나다라마바사아자차카타'];
const STYLES = ['frame', 'leaf', 'night', 'photo'];
const flat = (s) => String(s).replace(/\s+/g, '');

test('prayShareName — 12자까지 · <> 걷기 · 빈 값은 「우리 가정」', () => {
  assert.equal(T.prayShareName('  김영희  '), '김영희');
  assert.equal(T.prayShareName('<b>김영희</b>'), 'b김영희/b');
  assert.equal(T.prayShareName('가나다라마바사아자차카타파하'), '가나다라마바사아자차카타');
  assert.equal(T.prayShareName(''), '우리 가정');
  assert.equal(T.prayShareName(null), '우리 가정');
  assert.equal(T.prayShareName('  '), '우리 가정');
});

test('prayShareRuns — 이름 자리만 강조 · 조사는 prayFill 과 같다(ㄹ 받침 「로」)', () => {
  const t = '하나님, {이름}{을} 지키시고 {이름}{으로} 복의 근원이 되게 하소서.';
  const r = T.prayShareRuns(t, '김윤월');
  assert.deepEqual(JSON.parse(JSON.stringify(r)), [
    { s: '하나님, ', a: false }, { s: '김윤월', a: true }, { s: '을 지키시고 ', a: false },
    { s: '김윤월', a: true }, { s: '로 복의 근원이 되게 하소서.', a: false },
  ]);
  for (const nm of NAMES) for (const b of LIST) for (const c of T.prayChunks(b.prayer).slice(0, -1)) {
    assert.equal(T.prayShareRuns(c, nm).map((x) => x.s).join(''), T.prayFill(c, nm), b.no + ' ' + nm);
  }
});

test('prayShareWrap — 낱말 중간에서 안 끊는다 · 줄이 폭을 안 넘는다 · 한 줄보다 긴 낱말만 글자로', () => {
  const m = (s, a) => measure(s, (a ? '800 ' : '700 ') + '30px x');
  const runs = T.prayShareRuns(T.prayChunks(LIST[0].prayer)[0], '김세웅');
  const lines = T.prayShareWrap(runs, 400, m);
  assert.ok(lines.length > 1);
  for (const ln of lines) {
    const s = ln.map((p) => p.s).join('');
    assert.ok(ln.reduce((t, p) => t + m(p.s, p.a), 0) <= 400 + 0.01, '폭: ' + s);
    assert.ok(!/^\s|\s$/.test(s), '앞뒤 띄어쓰기 없음: ' + s);
  }
  assert.equal(lines.map((ln) => ln.map((p) => p.s).join('')).join(' '), runs.map((r) => r.s).join('').replace(/\s+/g, ' ').trim(), '글자를 잃지 않는다');
  const long = T.prayShareWrap([{ s: '가'.repeat(30), a: false }], 300, m);
  assert.equal(long.length, 3, '30자 낱말은 10자씩 세 줄');
});

test('praySharePlan — 104편 × 배경 넷 × 이름 셋: 글이 상자 안 · 글씨는 바닥 크기 이상 · 글자를 잃지 않는다 · 마크는 맨 아래', () => {
  for (const st of STYLES) {
    const S = T.PRAY_SHARE_STYLES[st];
    for (const nm of NAMES) for (const b of LIST) {
      const p = T.praySharePlan(b, nm, st, measure);
      const at = st + ' #' + b.no + ' ' + nm;
      assert.ok(p.size >= T.PSH_MIN && p.size <= T.PSH_MAX, at + ' 크기 ' + p.size);
      assert.ok(p.bottom <= p.limit + 0.5, at + ' 넘침 ' + p.bottom + ' > ' + p.limit);
      const tx = p.ops.filter((o) => o.k === 'text');
      for (const o of tx) assert.ok(o.x >= S.box.x - 0.5 && o.x + o.w <= S.box.x + S.box.w + 0.5, at + ' 가로 넘침: ' + o.s);
      const want = flat(b.title) + flat(b.ref) + flat(T.prayFill(b.prayer, nm)) + flat(T.PRAY_AMEN);
      assert.equal(flat(tx.map((o) => o.s).join('')), want, at + ' 글자');
      assert.ok(tx.some((o) => o.s === nm && o.color === S.accent), at + ' 이름 강조');
      const mk = p.ops.filter((o) => o.k === 'mark');
      assert.equal(mk.length, 1);
      assert.ok(p.limit <= mk[0].y, at + ' 글이 마크를 덮는다');
      assert.equal(mk[0].y + mk[0].h, T.PSH_H - 62);
    }
  }
});

test('praySharePlan — 짧은 편은 큰 글씨 · 긴 편은 작은 글씨(가장 긴 40번)', () => {
  const short = LIST.reduce((a, b) => (b.prayer.length < a.prayer.length ? b : a));
  const long = LIST.reduce((a, b) => (b.prayer.length > a.prayer.length ? b : a));
  assert.equal(T.praySharePlan(short, '김세웅', 'frame', measure).size, T.PSH_MAX);
  assert.ok(T.praySharePlan(long, '가나다라마바사아자차카타', 'frame', measure).size < T.PSH_MAX);
});

test('prayShareChoices — 액자 · 잎 · 밤하늘 다음에 풍경 사진(img/share/<id>.webp · 작은 그림 <id>-t.webp)', () => {
  const c = T.prayShareChoices();
  assert.deepEqual(JSON.parse(JSON.stringify(c.slice(0, 3).map((x) => x.key))), ['frame', 'leaf', 'night']);
  assert.equal(c.length, 3 + T.PRAY_SHARE_PHOTOS.length);
  for (const p of c.slice(3)) {
    assert.equal(p.style, 'photo');
    assert.match(p.src, /^img\/share\/[a-z0-9-]+\.webp$/);
    assert.ok(fs.existsSync(path.join(__dirname, '..', p.src)), p.src + ' 가 없다');
    assert.ok(fs.existsSync(path.join(__dirname, '..', p.thumb)), p.thumb + ' 가 없다');
  }
});
