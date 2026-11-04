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
const T = vm.runInContext(FILL + '\n' + PURE + '\n;({ prayFill, prayChunks, PRAY_AMEN, prayShareName, prayShareRuns, prayShareWrap, praySharePlan, prayShareChoices, prayShareMark, PRAY_SHARE_STYLES, PRAY_SHARE_PHOTOS, PSH_MARK, PSH_FLOOR, PSH_MIN, PSH_MAX, PSH_W, PSH_H })', vm.createContext({}));

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

test('praySharePlan — 104편 × 배경 넷 × 이름 셋: 글이 상자 안 · 글씨는 바닥 크기 이상 · 글자를 잃지 않는다 · 마크는 오른쪽 위 · 글이 마크 둘레를 피한다', () => {
  const K = T.prayShareMark().keep;
  const meet = (q, z) => q.x < z.x + z.w && q.x + q.w > z.x && q.y < z.y + z.h && q.y + q.h > z.y;
  const hits = (q) => meet(q, K);
  let pushed = 0, floor = 0;
  for (const st of STYLES) {
    const S = T.PRAY_SHARE_STYLES[st];
    for (const nm of NAMES) for (const b of LIST) {
      const p = T.praySharePlan(b, nm, st, measure);
      const at = st + ' #' + b.no + ' ' + nm;
      assert.ok(p.size >= T.PSH_MIN && p.size <= T.PSH_MAX, at + ' 크기 ' + p.size);
      assert.ok(p.bottom <= p.limit + 0.5, at + ' 넘침 ' + p.bottom + ' > ' + p.limit);
      assert.ok(p.limit === S.box.bottom || p.limit === T.PSH_FLOOR, at + ' 바닥 ' + p.limit);
      if (p.limit === T.PSH_FLOOR) floor++;
      assert.ok(p.top >= S.box.y - 0.5, at + ' 위로 넘침 ' + p.top);
      const tx = p.ops.filter((o) => o.k === 'text');
      for (const o of tx) assert.ok(o.x >= S.box.x - 0.5 && o.x + o.w <= S.box.x + S.box.w + 0.5, at + ' 가로 넘침: ' + o.s);
      const want = flat(b.title) + flat(b.ref) + flat(T.prayFill(b.prayer, nm)) + flat(T.PRAY_AMEN);
      assert.equal(flat(tx.map((o) => o.s).join('')), want, at + ' 글자');
      assert.ok(tx.some((o) => o.s === nm && o.color === S.accent), at + ' 이름 강조');
      for (const q of p.rects) assert.ok(!hits(q), at + ' 글이 마크 둘레에 닿는다');
      // 마크에 닿을 때만 내린다(2026-11-04 검토 — 「늘 내리는」 회귀가 통과하던 구멍) — 가운데 정렬이고 윗줄이 둘레 바닥보다 위인 상자(액자 · 밤하늘)에서
      //   글 덩이는 상자 가운데(c0) 아니면 둘레 아래 남은 자리 가운데(c1)에만 있다. c1 이면 c0 자리에서는 닿았어야 한다.
      if (S.valign === 'center' && S.box.y < K.y + K.h) {
        const KB = K.y + K.h, h = p.bottom - p.top;
        const c0 = Math.abs((p.top - S.box.y) - (p.limit - p.bottom)) < 0.5;
        const c1 = Math.abs((p.top - KB) - (p.limit - p.bottom)) < 0.5;
        assert.ok(c0 || c1, at + ' 가운데가 아니다');
        if (!c0) {
          pushed++;
          const dy = (S.box.y + (p.limit - S.box.y - h) / 2) - p.top;
          assert.ok(p.rects.some((q) => hits({ x: q.x, y: q.y + dy, w: q.w, h: q.h })), at + ' 닿지도 않는데 내렸다');
        }
      }
      const mk = p.ops.filter((o) => o.k === 'mark');
      assert.equal(mk.length, 1);
      assert.equal(mk[0].x + mk[0].w, T.PSH_W - T.PSH_MARK.right, at + ' 마크 오른쪽');
      assert.equal(mk[0].y, T.PSH_MARK.top, at + ' 마크 위');
      assert.equal(mk[0].disc, !!S.disc, at + ' 흰 동그라미는 어두운 바탕에만');
      assert.deepEqual([mk[0].cx, mk[0].cy, mk[0].r], [mk[0].x + mk[0].w / 2, mk[0].y + mk[0].h / 2, T.PSH_MARK.disc], at + ' 동그라미는 마크 가운데');
      assert.deepEqual(JSON.parse(JSON.stringify(p.keep)), JSON.parse(JSON.stringify(K)), at + ' plan.keep(별이 피한다)');
      // keep 셈과 따로 — 마크 그림 · 흰 동그라미 자리에도 글이 없다(keep 이 잘못 줄어도 잡는다)
      const disc = { x: mk[0].cx - mk[0].r, y: mk[0].cy - mk[0].r, w: 2 * mk[0].r, h: 2 * mk[0].r };
      for (const q of p.rects) assert.ok(!meet(q, mk[0]) && !meet(q, disc), at + ' 글이 마크 · 동그라미에 닿는다');
    }
  }
  assert.ok(pushed > 0, '긴 제목 · 긴 편이 마크 아래로 내려간 경우가 하나도 없다 — 피하기가 시험되지 않았다');
  console.log('# 마크를 피해 다시 놓은 것 ' + pushed + ' · 바닥을 내린 것 ' + floor + ' / ' + STYLES.length * NAMES.length * LIST.length);
});

test('praySharePlan — PSH_MIN 으로도 넘치면 바닥을 PSH_FLOOR 까지 내리고, 거기서도 마크 둘레를 피한다(104편으로는 안 타는 길 — 문장을 덧붙여 억지로)', () => {
  const K = T.prayShareMark().keep;
  const long = LIST.reduce((a, b) => (b.prayer.length > a.prayer.length ? b : a));
  for (const st of STYLES) {
    let pr = long.prayer, p = null;
    for (let k = 0; k < 60; k++) {
      p = T.praySharePlan({ title: long.title, ref: long.ref, prayer: pr }, '가나다라마바사아자차카타', st, measure);
      if (p.limit === T.PSH_FLOOR) break;
      pr += ' 하나님, 이 가정을 지켜 주옵소서.';
    }
    assert.equal(p.limit, T.PSH_FLOOR, st + ' 바닥 길을 못 탔다');
    assert.equal(p.size, T.PSH_MIN, st + ' 바닥은 가장 작은 글씨에서만');
    assert.ok(p.fit && p.bottom <= T.PSH_FLOOR + 0.5, st + ' 바닥에서도 넘침');
    for (const q of p.rects) assert.ok(!(q.x < K.x + K.w && q.x + q.w > K.x && q.y < K.y + K.h && q.y + q.h > K.y), st + ' 바닥 길에서 마크 둘레');
  }
});

test('prayShareMark — 오른쪽 위 · 처음(59×72)보다 크게 · 그림 비율(108×132) 그대로 · 동그라미가 그림 안', () => {
  const m = T.prayShareMark();
  assert.ok(m.w > 59 && m.h > 72, '크게');
  assert.ok(Math.abs(m.w / m.h - 108 / 132) < 0.01, '비율 ' + m.w + '×' + m.h);
  assert.ok(m.x > T.PSH_W / 2 && m.y < T.PSH_H / 4, '오른쪽 위');
  assert.ok(m.cx + m.r < T.PSH_W - 40 && m.cy - m.r > 40, '동그라미가 가장자리에서 40px 안쪽');
  assert.ok(m.r * 2 >= Math.hypot(m.w, m.h), '동그라미가 마크를 다 덮는다');
  assert.ok(m.keep.x + m.keep.w <= T.PSH_W && m.keep.y >= 0);
  assert.ok(m.keep.x <= m.cx - m.r && m.keep.y <= m.cy - m.r && m.keep.x + m.keep.w >= m.cx + m.r && m.keep.y + m.keep.h >= m.cy + m.r, '둘레가 동그라미를 다 덮는다');
});

test('praySharePlan — 짧은 편은 큰 글씨 · 긴 편은 작은 글씨(가장 긴 40번)', () => {
  const short = LIST.reduce((a, b) => (b.prayer.length < a.prayer.length ? b : a));
  const long = LIST.reduce((a, b) => (b.prayer.length > a.prayer.length ? b : a));
  assert.equal(T.praySharePlan(short, '김세웅', 'frame', measure).size, T.PSH_MAX);
  assert.ok(T.praySharePlan(long, '가나다라마바사아자차카타', 'frame', measure).size < T.PSH_MAX);
});

test('praySharePlan — 맺음말이 한 줄에 안 들면 가운데에서 둘로(「아멘!」 홀로 남지 않게) · 글 자리(top · rects)를 돌려준다(배경이 피한다)', () => {
  const short = LIST.reduce((a, b) => (b.prayer.length < a.prayer.length ? b : a));
  for (const st of STYLES) {
    const p = T.praySharePlan(short, '김세웅', st, measure);
    const tx = p.ops.filter((o) => o.k === 'text');
    const amen = tx.filter((o) => o.color === T.PRAY_SHARE_STYLES[st].accent && o.s !== '김세웅').map((o) => o.s);
    assert.deepEqual(JSON.parse(JSON.stringify(amen)), ['예수님의 이름으로 축복하며', '기도합니다. 아멘!'], st);
    assert.equal(p.rects.length, tx.length, st + ' 글 토막마다 자리');
    assert.ok(p.top >= T.PRAY_SHARE_STYLES[st].box.y && p.top < p.bottom, st + ' top');
  }
});

test('prayShareChoices — 액자 · 잎 · 밤하늘 다음에 풍경 사진(img/share/<id>.webp · 작은 그림 <id>-t.webp)', () => {
  const c = T.prayShareChoices();
  assert.deepEqual(JSON.parse(JSON.stringify(c.slice(0, 3).map((x) => x.key))), ['frame', 'leaf', 'night']);
  assert.equal(c.length, 3 + T.PRAY_SHARE_PHOTOS.length);
  // 추수감사 둘은 사진 맨 앞(친구 2026-11-04 「추수감사절 배경 이미지로 2개 추가」 — 철이 지나 차례를 바꾸면 이 줄도 함께)
  assert.deepEqual(JSON.parse(JSON.stringify(T.PRAY_SHARE_PHOTOS.slice(0, 2).map((p) => p.id))), ['bg-basket', 'bg-persimmon']);
  for (const p of c.slice(3)) {
    assert.equal(p.style, 'photo');
    assert.match(p.src, /^img\/share\/[a-z0-9-]+\.webp$/);
    assert.ok(fs.existsSync(path.join(__dirname, '..', p.src)), p.src + ' 가 없다');
    assert.ok(fs.existsSync(path.join(__dirname, '..', p.thumb)), p.thumb + ' 가 없다');
  }
});

test('배선 — 지연 모듈(LAZY_JS.prayShare · index.html 에 없음) · 단추는 문 안에만 · 보내기는 미리 만든 Blob 으로', () => {
  assert.match(APP, /prayShare: \{ src: "js\/pray-share\.js", fn: "openPrayShare" \}/);
  assert.ok(!INDEX.includes('js/pray-share.js'), 'index.html 이 처음부터 부르면 안 된다');
  assert.match(PR, /const PRAY_SHARE_PUBLIC = (true|false);/);
  assert.match(PR, /function prayShareVisible\(\) \{ return PRAY_SHARE_PUBLIC \|\| \(typeof ministryTesterCached === "function" && ministryTesterCached\(\)\); \}/);
  assert.match(PR, /\$\{prayShareVisible\(\) \? `<button class="pr-share" id="pr-share">/, '단추는 문 안에서만 그린다');
  // 「말씀 펴 보기」 바로 아래 · 들려주기 줄 위(친구 2026-11-04 — 카드 맨 아래에서는 눈에 안 띄었다)
  const card = cut(PR, 'id="pr-vtog"', 'class="grp-title"');
  const iv = card.indexOf('id="pr-verse"'), is = card.indexOf('id="pr-share"'), ia = card.indexOf('class="pr-acts"');
  assert.ok(iv >= 0 && is > iv && ia > is, '단추 자리: 말씀 펴 보기 → 보내기 → 들려주기');
  assert.equal(card.split('id="pr-share"').length - 1, 1, '단추는 하나');
  assert.match(PS, /<b id="psh-h">📤 가정 축복 기도문 보내기<\/b>/, '판 제목(친구 2026-11-04)');
  assert.match(PR, /withLazyJs\("prayShare"/);
  const send = cut(PS, 'function pshSend() {', '\n}\n');
  assert.match(send, /pshState\.blob/);
  assert.match(send, /navigator\.share\(\{ files: \[file\] \}\)/);
  assert.doesNotMatch(send, /prayShareDraw\(/, '보내기 탭 안에서 그림을 새로 만들면 공유가 막힌다');
  assert.doesNotMatch(PS, /\(\?<[=!]/, 'lookbehind 금지(사파리 16.4 미만)');
});
