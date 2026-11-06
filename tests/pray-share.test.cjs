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
// 그릴 글 한 벌(prayShareDoc · medShareDoc — DOM 없음)도 싣는다 · 판이 묵상 · 기도문 중 무엇을 그릴지 고르는 길(2026-11-04 검토)
const DOCS = cut(PS, 'function prayShareDoc(', 'function prayShareDraw(');
const T = vm.runInContext(FILL + '\n' + PURE + '\n' + DOCS + '\n;({ VERSE_MARK, VERSE_FRAMES, verseFrameChoices, verseFrameStyle, prayShareDoc, medShareDoc, verseShareDoc, verseSharePlan, verseShareDate, verseShareFoot, verseShareByline, verseSharePastor, VERSE_PASTOR, VERSE_KICKER, prayFill, prayChunks, PRAY_AMEN, prayShareName, prayShareRuns, prayShareWrap, praySharePlan, prayShareChoices, prayShareMark, PRAY_SHARE_STYLES, PRAY_SHARE_PHOTOS, PSH_MARK, PSH_FLOOR, PSH_MIN, PSH_MAX, PSH_W, PSH_H, medShareRuns, medShareParas, medShareFoot, medShareDate, medShareByline, medSharePlan, MED_KICKER, MED_QLABEL })', vm.createContext({}));

// 가짜 폭 — 한글 1em · 띄어쓰기 0.3em · 그 밖 0.55em · 800 굵기 1.04배(나눔명조 · Noto 실측보다 조금 넓게 — 넉넉히 잰다)
const px = (font) => Number(/(\d+)px/.exec(font)[1]);
const measure = (s, font) => {
  const z = px(font); let w = 0;
  for (const ch of String(s)) w += /\s/.test(ch) ? 0.3 * z : /[가-힣]/.test(ch) ? z : 0.55 * z;
  return w * (/^800 /.test(font) ? 1.04 : 1);
};
const NAMES = ['김세웅', '김윤월', '가나다라마바사아자차카타'];
const STYLES = ['frame', 'leaf', 'night', 'photo', 'veil'];   // veil = 밝은 사진(옅은 판 + 진한 글씨 · 2026-11-04)
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

test('prayShareChoices — 밤하늘 · 액자 · 잎 다음에 풍경 사진(img/share/<id>.webp · 작은 그림 <id>-t.webp)', () => {
  const c = T.prayShareChoices();
  assert.deepEqual(JSON.parse(JSON.stringify(c.slice(0, 3).map((x) => x.key))), ['night', 'frame', 'leaf'], '밤하늘이 맨 왼쪽(친구 2026-11-04)');
  assert.match(PS, /const pshState = \{ gen: 0, blob: null, url: null, key: "night",/, '처음 고른 배경은 밤하늘');
  assert.equal(c.length, 3 + T.PRAY_SHARE_PHOTOS.length);
  // 추수감사 둘은 사진 맨 앞(친구 2026-11-04 「추수감사절 배경 이미지로 2개 추가」 — 철이 지나 차례를 바꾸면 이 줄도 함께)
  assert.deepEqual(JSON.parse(JSON.stringify(T.PRAY_SHARE_PHOTOS.slice(0, 2).map((p) => p.id))), ['bg-basket', 'bg-persimmon']);
  // 친구가 준 추수감사 그림 셋(같은 날) — 감나무 다음 · 밝은 둘은 veil(흰 글씨가 안 읽혔다)
  assert.deepEqual(JSON.parse(JSON.stringify(T.PRAY_SHARE_PHOTOS.slice(2, 5).map((p) => [p.id, p.style || 'photo']))),
    [['bg-maple', 'photo'], ['bg-harvest', 'veil'], ['bg-watercolor', 'veil']]);
  for (const p of c.slice(3)) {
    assert.ok(p.style === 'photo' || p.style === 'veil', p.key + ' 꼴 ' + p.style);
    assert.match(p.src, /^img\/share\/[a-z0-9-]+\.webp$/);
    assert.ok(fs.existsSync(path.join(__dirname, '..', p.src)), p.src + ' 가 없다');
    assert.ok(fs.existsSync(path.join(__dirname, '..', p.thumb)), p.thumb + ' 가 없다');
  }
});

test('배선 — 지연 모듈(LAZY_JS.prayShare · index.html 에 없음) · 단추는 문 안에만 · 보내기는 미리 만든 Blob 으로', () => {
  assert.match(APP, /prayShare: \{ src: "js\/pray-share\.js", fn: "openPrayShare" \}/);
  assert.ok(!INDEX.includes('js/pray-share.js'), 'index.html 이 처음부터 부르면 안 된다');
  // 문은 app.js 한 곳(2026-11-04 — 「🙏 오늘의 기도」 창도 본다 · js/prayer.js 는 지연이라 그 창이 먼저 뜰 수 있다)
  assert.match(APP, /const PRAY_SHARE_OPEN = (true|false);/);
  assert.match(APP, /function prayShareVisible\(\) \{ return PRAY_SHARE_OPEN \|\| \(typeof ministryTesterCached === "function" && ministryTesterCached\(\)\); \}/);
  // ⚠️ 판이 엇갈려도 깨지지 않게 — 배포 직후 CDN 이 옛 prayer.js(const PRAY_SHARE_PUBLIC)를 주면 app.js 의 같은 이름 const 가 그 파일을 「이미 선언됨」으로 깨뜨린다 ·
  //    켜 둔 앱(옛 app.js)에 새 prayer.js 가 실리면 prayShareVisible 이 없다 — 그래서 typeof 로 부른다
  assert.doesNotMatch(APP, /(const|let|var)\s+PRAY_SHARE_PUBLIC\b/, 'app.js 에 옛 상수 이름을 선언하지 않는다');
  assert.doesNotMatch(PR, /^\s*(const|let|var)\s+PRAY_SHARE_\w+/m, 'js/prayer.js 는 문을 다시 선언하지 않는다');
  assert.match(PR, /\$\{typeof prayShareVisible === "function" && prayShareVisible\(\) \? `<button class="pr-share" id="pr-share">/, '단추는 문 안에서만 · typeof 로');
  // 「말씀 펴 보기」 바로 아래 · 들려주기 줄 위(친구 2026-11-04 — 카드 맨 아래에서는 눈에 안 띄었다)
  const card = cut(PR, 'id="pr-vtog"', 'class="grp-title"');
  const iv = card.indexOf('id="pr-verse"'), is = card.indexOf('id="pr-share"'), ia = card.indexOf('class="pr-acts"');
  assert.ok(iv >= 0 && is > iv && ia > is, '단추 자리: 말씀 펴 보기 → 보내기 → 들려주기');
  assert.equal(card.split('id="pr-share"').length - 1, 1, '단추는 하나');
  assert.match(PS, /const PSH_TITLE_PRAY = "📤 가정 축복 기도문 보내기", PSH_TITLE_MED = "📤 오늘의 묵상 보내기";/, '판 제목(친구 2026-11-04)');
  assert.match(PS, /<b id="psh-h">\$\{prayEsc\(title\)\}<\/b>/);
  assert.match(PS, /\$\{withName \? `<label class="psh-lbl" for="psh-name">/, '이름 칸은 기도문에만(묵상에는 이름 자리가 없다)');
  // 「🙏 오늘의 기도」 창(app.js openBlessingModal · 친구 2026-11-04) — 머리 「오늘의 기도」 · 보내기 단추는 문 안 + 원문(tpl)이 있을 때만 ·
  //   창을 먼저 걷고(done) 판을 연다 · 판에는 원문(이름 토큰 그대로)을 넘긴다(위젯 글 prayer 는 「우리 가족」으로 이미 채워져 있다)
  const bm = cut(APP, 'function openBlessingModal(b) {', '\n}\n');
  assert.match(bm, /<div class="cheer-ref dmsg-badge">🙏 오늘의 기도<\/div>/);
  assert.match(bm, /const canShare = !!b\.tpl && prayShareVisible\(\);/);
  assert.match(bm, /\$\{canShare \? `<button class="pr-share" id="bless-share">/);
  const tap = cut(bm, 'share.addEventListener("click"', '});');
  assert.ok(tap.indexOf('done();') >= 0 && tap.indexOf('done();') < tap.indexOf('withLazyJs("prayShare"'), '창을 먼저 걷고 판을 연다');
  assert.match(tap, /openPrayShare\(\{ no: b\.no, title: b\.title, ref: b\.ref, prayer: b\.tpl \}/, '판에는 원문(tpl)');
  assert.match(PR, /withLazyJs\("prayShare"/);
  const send = cut(PS, 'function pshSend() {', '\n}\n');
  assert.match(send, /pshState\.blob/);
  assert.match(send, /const data = \{ files: \[file\] \};\n/, '그림 한 장만(기도문 · 묵상 · 말씀 모두)');
  assert.doesNotMatch(send, /data\.text|VERSE_SHARE_TEXT/, '그림에 글을 붙이지 않는다 — 카톡이 그림에 붙인 글을 버렸다(친구 2026-11-05 「설치 URL은 연결 해달라고 했는데 없네요」)');
  assert.match(send, /navigator\.share\(data\)\.then\(\(\) => \{ if \(pshState\.verse && pshState\.withLink\) pshLinkNext\(\); \}\)/, '말씀 판 · 체크가 켜져 있으면 그림 다음 차례는 설치 주소');
  assert.match(send, /^function pshSend\(\) \{\n  if \(pshState\.verse && pshState\.linkNext\) \{ pshSendLink\(\); return; \}/, '그 차례에는 같은 단추가 설치 주소를(그림을 또 보내지 않는다)');
  const link = cut(PS, 'function pshSendLink() {', '\n}\n');
  assert.match(link, /const data = \{ text: VERSE_SHARE_TEXT \};/, '설치 주소는 글만(주소가 눌리는 글 · 작은 상자)');
  assert.ok(!/files/.test(link), '설치 주소에는 그림이 없다');
  assert.match(link, /if \(pshState\.sharing\) return;/, '공유 창이 떠 있을 때 또 누르면 무시');
  assert.match(link, /pshCopyLink\(\);/, '공유 창이 없으면 복사');
  assert.match(cut(PS, 'function pshCopyLink() {', '\n}\n'), /navigator\.clipboard\.writeText\(VERSE_SHARE_TEXT\)\.then\(\(\) => pshSay\("설치 주소를 복사했어요\./, '복사가 된 뒤에만 「복사했어요」');
  const ln = cut(PS, 'function pshLinkNext() {', '\n}\n');
  assert.match(ln, /pshState\.linkNext = true; pshSendLabel\(false\);/);
  assert.match(ln, /pshSay\("이어서 설치 주소도 같은 대화방에 보내 주세요\."\)/, '「보냈어요」라고 하지 않는다(어디로 갔는지 모른다)');
  assert.match(link, /navigator\.share\(data\)\.then\(\(\) => \{ pshLinkDone\(\); pshSay\(""\); \}\)/, '보낸 뒤 단추는 다시 「그림 보내기」');
  assert.match(cut(PS, 'function pshCopyLink() {', '\n}\n'), /^function pshCopyLink\(\) \{\n  pshLinkDone\(\);/, '복사로 끝나도 차례를 거둔다');
  const lab = cut(PS, 'function pshSendLabel(busy) {', '\n}\n');
  assert.match(lab, /const next = !busy && pshState\.linkNext;/);
  assert.match(lab, /s\.disabled = !next && \(!!busy \|\| !pshState\.blob\);/, '금색 차례에는 그림이 없어도 누를 수 있다');
  assert.match(lab, /s\.classList\.toggle\("next", next\);/);
  assert.match(lab, /next \? "이어서 설치 주소 보내기" : pshKakaoOn\(\) \? "문자 · 다른 앱으로 보내기" : "보내기 \(카톡 · 문자\)"/, '같은 자리 단추 이름이 바뀐다(엄지가 옮겨 가지 않게) · 카카오 단추가 있으면 「문자 · 다른 앱」');
  assert.match(cut(PS, 'function pshRedraw() {', '\n}\n'), /pshState\.blob = null; pshState\.linkNext = false;/, '그림이 바뀌면 다시 그림부터');
  assert.match(PS, /sharing: false, withLink: true, linkNext: false,\n\s+kakaoUp: \{\}, kakaoReady: "", kakaoBusy: null, kakaoT: 0 \};/, '체크는 처음에 켜져 있다');
  assert.doesNotMatch(send, /prayShareDraw\(|pshDraw\(/, '보내기 탭 안에서 그림을 새로 만들면 공유가 막힌다');
  assert.match(send, /pshState\.file/, '파일 이름은 그린 글 한 벌(doc.file)에서 — 기도문 blessing-N · 묵상 meditation-N-요일');
  assert.doesNotMatch(PS, /\(\?<[=!]/, 'lookbehind 금지(사파리 16.4 미만)');
});

// ── 🌿 오늘의 묵상 보내기(2026-11-04 친구 「그림 한 장 · 적용 질문 · 설교 제목 · 말씀」) ──
//   실제 묵상(설교 아카이브 요일 묵상 784편)은 저장소에 없다 — 가장 긴 길이(제목 19 · 글 152 · 질문 63자)에 맞춘 본보기를 지어 넣는다.
const MEDS = [
  { heading: '날마다 새로 발견하는 감사의 길', message: '감사는 **환경이 바뀔 때** 생기지 않습니다. 같은 하루 속에서도 하나님이 이미 주신 것을 **새롭게 보는 눈**이 열릴 때 시작됩니다. 오늘 내가 당연하게 여긴 숨결과 밥상과 이웃의 얼굴을 다시 바라보십시오. 그 안에 숨어 있던 은혜가 보이기 시작할 것입니다. **감사는 발견입니다.**',
    question: '오늘 하루 당연하게 여겼던 것 가운데 하나님께 감사로 올려 드릴 것 세 가지는 무엇이며, 누구와 그 감사를 나누겠습니까?', sermonTitle: '감사는 발견입니다', verseRef: '누가복음 17:15-16', preacher: '차동혁 위임목사', sermonDate: '2026-11-01' },
  { heading: '돌아온 한 사람', message: '열 명이 고침을 받았지만 **한 사람만** 돌아왔습니다. 감사는 받은 은혜를 기억하는 데서 자랍니다.', question: '나는 무엇을 기억하며 돌아가겠습니까?', sermonTitle: '감사는 발견입니다', verseRef: '누가복음 17:15-16', preacher: '차동혁 담임목사', sermonDate: '2026-11-01' },
  { heading: '', message: '**사랑합니다. 감사합니다.** 오늘도 이 두 마디로 하루를 여십시오.', question: '', sermonTitle: '', verseRef: '' },
  { heading: '말씀 앞에 서는 아침', message: '짧은 묵상.', question: '오늘 붙들 말씀 한 구절은 무엇입니까?', sermonTitle: '아주 긴 설교 제목이 들어오면 맨 아래 줄은 어떻게 접히는가', verseRef: '데살로니가전서 5:16-18', preacher: '', sermonDate: '2026-11-08' },
];
const medFlat = (m) => flat(T.MED_KICKER) + flat(String(m.heading || '').replace(/\*\*/g, '') || T.MED_KICKER) + flat(m.message.replace(/\*\*/g, '')) +
  (m.question ? flat(T.MED_QLABEL) + flat(m.question) : '') + flat(T.medShareFoot(m)) + flat(T.medShareByline(m));

test('medShareRuns · medShareParas — **강조** 는 강조 토막 · 짝 없는 ** 는 걷는다 · 문장마다 끊되 강조가 문장을 넘어도 이어진다', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(T.medShareRuns('가 **나다** 라'))), [{ s: '가 ', a: false }, { s: '나다', a: true }, { s: ' 라', a: false }]);
  assert.deepEqual(JSON.parse(JSON.stringify(T.medShareRuns('가**나'))), [{ s: '가나', a: false }]);
  const ps = T.medShareParas(MEDS[2].message);
  assert.equal(ps.length, 3, '문장 셋');
  assert.deepEqual(JSON.parse(JSON.stringify(ps[0])), [{ s: '사랑합니다.', a: true }]);
  assert.deepEqual(JSON.parse(JSON.stringify(ps[1])), [{ s: '감사합니다.', a: true }], '강조가 다음 문장에도 이어진다');
  for (const m of MEDS) assert.equal(flat(T.medShareParas(m.message).map((p) => p.map((x) => x.s).join('')).join('')), flat(m.message.replace(/\*\*/g, '')), '글자를 잃지 않는다');
});

test('medShareFoot — 「설교 「제목」 · 구절」 · 있는 것만 · 「이번 주」 라고 쓰지 않는다(지난주 것을 보여 줄 때가 있다)', () => {
  assert.equal(T.medShareFoot(MEDS[0]), '설교 「감사는 발견입니다」 · 누가복음 17:15-16');
  assert.equal(T.medShareFoot({ sermonTitle: '', verseRef: '시편 23:1' }), '시편 23:1');
  assert.equal(T.medShareFoot({ sermonTitle: '제목', verseRef: '' }), '설교 「제목」');
  assert.equal(T.medShareFoot({}), '');
  assert.doesNotMatch(PS.slice(PS.indexOf('function medShareFoot'), PS.indexOf('function medSharePlan')), /이번 주/);
  // 둘째 줄 — 설교하신 분 · 설교 날짜(친구 2026-11-04 「목사님 설교 일자도」)
  assert.equal(T.medShareDate('2026-11-01'), '2026년 11월 1일');
  assert.equal(T.medShareDate('2026-11-01T00:00:00+09:00'), '2026년 11월 1일');
  assert.equal(T.medShareDate(''), '');
  assert.equal(T.medShareDate('11월 1일'), '', '못 읽는 꼴은 빈 값(지어내지 않는다)');
  assert.equal(T.medShareByline(MEDS[0]), '차동혁 위임목사 · 2026년 11월 1일');
  assert.equal(T.medShareByline(MEDS[3]), '2026년 11월 8일', '설교자가 없으면 날짜만');
  assert.equal(T.medShareByline({}), '');
});

test('medSharePlan — 본보기 묵상 × 배경 넷: 상자 안 · 글자를 잃지 않는다 · 마크 둘레를 피한다 · 강조는 강조색 · 질문 · 맨 아래 줄은 있을 때만', () => {
  const K = T.prayShareMark().keep;
  const meet = (q, z) => q.x < z.x + z.w && q.x + q.w > z.x && q.y < z.y + z.h && q.y + q.h > z.y;
  for (const st of STYLES) {
    const S = T.PRAY_SHARE_STYLES[st];
    for (const [k, m] of MEDS.entries()) {
      const p = T.medSharePlan(m, st, measure);
      const at = st + ' 묵상' + k;
      assert.ok(p.size >= T.PSH_MIN && p.size <= T.PSH_MAX, at + ' 크기 ' + p.size);
      assert.ok(p.fit && p.bottom <= p.limit + 0.5, at + ' 넘침');
      const tx = p.ops.filter((o) => o.k === 'text');
      for (const o of tx) assert.ok(o.x >= S.box.x - 0.5 && o.x + o.w <= S.box.x + S.box.w + 0.5, at + ' 가로 넘침: ' + o.s);
      for (const q of p.rects) assert.ok(!meet(q, K), at + ' 글이 마크 둘레에 닿는다');
      assert.equal(flat(tx.map((o) => o.s).join('')), medFlat(m), at + ' 글자');
      assert.equal(tx[0].s, T.MED_KICKER, at + ' 맨 위는 「오늘의 묵상」');
      assert.equal(tx[0].color, S.accent, at + ' 「오늘의 묵상」은 강조색');
      assert.equal(tx.some((o) => o.s === T.MED_QLABEL), !!m.question, at + ' 적용 질문 이름은 질문이 있을 때만');
      if (T.medShareFoot(m)) assert.equal(tx[tx.length - 1].color, S.sub, at + ' 맨 아래는 설교 · 말씀(작은 옅은 글씨)');
      const by = T.medShareByline(m);
      if (by) assert.ok(flat(tx.map((o) => o.s).join('')).endsWith(flat(by)) && tx[tx.length - 1].color === S.sub, at + ' 맨 끝은 설교하신 분 · 날짜');
      for (const em of (m.message.match(/\*\*([^*]+)\*\*/g) || []).map((x) => x.slice(2, -2))) {
        const first = flat(em).slice(0, 2);
        assert.ok(tx.some((o) => o.color === S.accent && flat(o.s).includes(first)), at + ' 강조가 강조색이 아니다: ' + em);
      }
      assert.equal(p.ops.filter((o) => o.k === 'mark').length, 1, at + ' 마크 하나');
    }
  }
});

test('배선 — 「🌿 오늘의 묵상」 창: 문은 app.js(MED_SHARE_OPEN · 시험 참여자 먼저) · 설교가 있을 때만 단추 · 지금 보는 요일을 · 창을 먼저 걷고 판을 연다', () => {
  assert.match(APP, /const MED_SHARE_OPEN = (true|false);/);
  assert.match(APP, /function medShareVisible\(\) \{ return MED_SHARE_OPEN \|\| \(typeof ministryTesterCached === "function" && ministryTesterCached\(\)\); \}/);
  const mm = cut(APP, 'function showMeditationModal(', '\n}\n');
  assert.match(mm, /\$\{sermon && medShareVisible\(\) \? `<button class="pr-share" id="med-share">/, '「준비하고 있어요」 자리(설교 없음)에는 단추가 없다');
  assert.match(mm, /cur = i;/, '탭을 넘기면 그 요일을 보낸다');
  const tap = cut(mm, 'mShare.addEventListener("click"', '});\n');
  assert.ok(tap.indexOf('done();') >= 0 && tap.indexOf('done();') < tap.indexOf('withLazyJs("prayShare"'), '창을 먼저 걷고 판을 연다');
  assert.match(tap, /items\[cur\]/);
  assert.match(tap, /openMedShare\(m, opts\)/);
  assert.match(tap, /preacher: \(sermon && sermon\.preacher\) \|\| "", sermonDate: \(sermon && sermon\.date\) \|\| ""/, '맨 아래 둘째 줄 — 설교하신 분 · 설교 날짜');
  assert.match(tap, /verseRef: \(verse && \(verse\.refFull \|\| verse\.refShort\)\)/, '구절은 긴 한국어 표기(「누가복음 17장 16절」) — 영어 모드와 상관없이 · 줄임말(「눅」)은 받는 분께 낯설다');
  assert.match(PS, /function openMedShare\(m, opts\) \{/, '미리보기 판을 가르는 opts(2026-11-06 · 이용 기록)');
  assert.match(PS, /pshOpen\(PSH_TITLE_MED, false, "", "med", \{ noLog \}\)/, '묵상 판은 이름 칸 없이 · 미리보기 판이면 이용 기록을 남기지 않는다');
});

test('보내기 판 — 폰에서 「보내기」가 아래로 숨지 않는다(친구 2026-11-04 · 갤럭시) — 미리보기는 화면 높이에 맞춰 줄고 · 단추는 판 아래에 붙는다', () => {
  const CSS = read('style.css');
  assert.match(CSS, /\.psh-acts \{ position: sticky; bottom: 0; z-index: 1; background: #fdf8f0;/, '단추 덩어리가 판 아래에 붙는다(sticky · 말씀 판은 체크도 함께)');
  assert.match(CSS, /\.dark \.psh-acts \{ background: #1a202b;/, '어두운 모드 짝');
  assert.doesNotMatch(CSS, /\.psh-send \{ position: sticky/, '단추 하나만 붙이면 체크가 아래로 숨는다');
  assert.match(CSS, /\.psh-pv \{ width: min\(100%, 300px, max\(180px, calc\(\(100vh - 420px\) \* \.8\)\)\); \}/, '미리보기 폭이 화면 높이를 따른다');
  assert.match(CSS, /@supports \(height: 100dvh\) \{\n  \.psh-sheet \{ max-height: 94dvh; \}/, '주소창이 있는 브라우저 — dvh');
  // 단추 자리는 미리보기 바로 다음(sticky 가 붙을 자리) — 판 짜임이 바뀌면 이 시험도 함께
  assert.match(PS, /<div class="psh-pv"><img id="psh-img" alt=""><\/div>\n      <div class="psh-acts">\$\{kakao \? `<button type="button" class="psh-kakao" id="psh-kakao">\$\{PSH_KAKAO_IC\}<span class="psh-kakao-t">카카오톡으로 보내기<\/span><\/button>` : ""\}\n        <button type="button" class="psh-send" id="psh-send"\$\{kakao \? " hidden" : ""\} disabled>/, '미리보기 바로 아래 덩어리 — (말씀 판 · 키가 있으면) 카카오 단추 · 그 아래 보내기(카카오면 숨김) · 체크 칸은 없다(친구 2026-11-06 「체크박스 컨트롤 삭제」)');
  assert.ok(!/psh-link/.test(PS), '따로 선 ② 단추는 없다(친구 「check box로」)');
  assert.match(CSS, /\.psh-send\.next \{ background: linear-gradient/, '그림 다음 차례는 금색');
  assert.match(CSS, /\.dark \.psh-send\.next \{/, '금색 어두운 모드 짝');
  assert.ok(!/psh-withlink|psh-chk/.test(PS) && !/\.psh-chk/.test(CSS), '「설치 주소도 보내기」 체크 칸은 판에도 CSS 에도 없다(친구 2026-11-06)');
});

// ── 2026-11-04 검토(review-share-v3) — 두 번 누름 · 묵상 판 그리기 길 · 기도문 판 되돌림 · typeof 지킴이 ──
test('글 한 벌 — medShareDoc(파일 이름 · 설명 · 글꼴 받을 글자) · prayShareDoc · 판이 묵상 · 기도문을 가른다', () => {
  const md0 = Object.assign({}, MEDS[0], { no: 44, idx: 4 }), md = T.medShareDoc(md0);
  assert.equal(md.file, 'meditation-44-5.jpg', '파일 이름 = 구절 · 요일(1부터)');
  assert.equal(md.alt, '보낼 그림 — 오늘의 묵상 · ' + MEDS[0].heading);
  for (const piece of [T.MED_KICKER, T.MED_QLABEL, T.medShareFoot(md0), T.medShareByline(md0)]) assert.ok(md.text.includes(piece), '글꼴 받을 글자에 ' + piece);
  assert.ok(!md.text.includes('**'), '강조 표식은 글꼴 글자에서 뺀다');
  assert.equal(JSON.stringify(md.plan('night', measure)), JSON.stringify(T.medSharePlan(md0, 'night', measure)), '한 벌의 plan = medSharePlan');
  const pd = T.prayShareDoc(LIST[0], '김세웅');
  assert.equal(pd.file, 'blessing-' + LIST[0].no + '.jpg');
  assert.equal(JSON.stringify(pd.plan('frame', measure)), JSON.stringify(T.praySharePlan(LIST[0], '김세웅', 'frame', measure)));
  assert.match(PS, /const doc = pshDoc\(\);/);
  assert.match(PS, /function pshDoc\(\) \{ return pshState\.med \? medShareDoc\(pshState\.med\) : pshState\.verse \? verseShareDoc\(pshState\.verse\) : prayShareDoc\(pshState\.b, pshState\.name\); \}/, '판은 묵상 · 말씀 · 기도문 가운데 찬 것을');
  const op = cut(PS, 'function openPrayShare(b, name) {', '\n}\n'), om = cut(PS, 'function openMedShare(m, opts) {', '\n}\n');
  assert.match(op, /prayShareClose\(\);\n  pshState\.b = b; pshState\.med = null;/, '묵상을 보낸 뒤에도 기도문 판은 기도문을(prayShareClose 는 med 를 안 지운다)');
  assert.match(op, /pshOpen\(PSH_TITLE_PRAY, true, name, "pray"\);/, '기도문 판 — 제목 · 이름 칸');
  assert.match(op, /pshState\.b = b; pshState\.med = null; pshState\.verse = null;/, '말씀을 보낸 뒤에도 기도문 판은 기도문을');
  assert.match(om, /pshState\.b = null; pshState\.med = m;/);
  assert.match(cut(PS, 'function pshOpen(', '\n}\n'), /const inp = wrap\.querySelector\("#psh-name"\);\n  if \(inp\) \{/, '이름 칸 없는 묵상 판에서 넘어지지 않게');
});

test('두 번 누름 — 판이 열렸다가 스스로 닫히지 않는다(열린 같은 판은 다시 쓴다) · 창 단추는 한 번만 · 공유 중 또 누르면 내려받기로 가지 않는다', () => {
  const op = cut(PS, 'function openPrayShare(b, name) {', '\n}\n'), om = cut(PS, 'function openMedShare(m, opts) {', '\n}\n');
  assert.ok(op.indexOf('pshReuse("pray")') >= 0 && op.indexOf('pshReuse("pray")') < op.indexOf('prayShareClose()'), '기도문 — 닫기(history.back) 전에 다시 쓰기');
  assert.ok(om.indexOf('pshReuse("med")') >= 0 && om.indexOf('pshReuse("med")') < om.indexOf('prayShareClose()'), '묵상 — 닫기 전에 다시 쓰기');
  assert.match(PS, /wrap\.dataset\.kind = kind \|\| \(withName \? "pray" : "med"\);/, '판 종류 표식');
  assert.match(PS, /function pshReuse\(kind\) \{ const w = document\.getElementById\("psh"\); return !!\(w && w\.dataset\.kind === kind && pshState\.pop\); \}/);
  const bm = cut(APP, 'function openBlessingModal(b) {', '\n}\n'), mm = cut(APP, 'function showMeditationModal(', '\n}\n');
  const t1 = cut(bm, 'share.addEventListener("click"', '});'), t2 = cut(mm, 'mShare.addEventListener("click"', '});\n');
  for (const [t, nm] of [[t1, 'share'], [t2, 'mShare']]) {
    const g = t.indexOf('if (' + nm + '.disabled) return;'), d = t.indexOf(nm + '.disabled = true;');
    assert.ok(g >= 0 && d > g && d < t.indexOf('done();'), nm + ' 은 한 번만(창이 걷히는 동안의 둘째 탭)');
  }
  const send = cut(PS, 'function pshSend() {', '\n}\n');
  assert.ok(send.indexOf('if (pshState.sharing) return;') >= 0 && send.indexOf('if (pshState.sharing) return;') < send.indexOf('navigator.share('), '공유 창이 떠 있는 동안 또 누르면 아무것도 안 한다');
  assert.match(send, /err\.name === "AbortError" \|\| err\.name === "InvalidStateError"/, '이미 떠 있다(InvalidStateError)는 내려받기로 가지 않는다');
  assert.match(send, /\.finally\(\(\) => \{ pshState\.sharing = false; \}\)/);
});

test('typeof 지킴이 · 묵상 단추가 넘기는 칸 — 옛 판과 엇갈려도 깨지지 않는다 · 지금 요일 · 설교 제목', () => {
  const all = (PR.match(/\bprayShareVisible\(/g) || []).length, safe = (PR.match(/typeof prayShareVisible === "function" && prayShareVisible\(/g) || []).length;
  assert.ok(all > 0 && all === safe, 'js/prayer.js 의 prayShareVisible() 는 모두 typeof 뒤에서 — 옛 app.js(v3.700~701)에는 이 함수가 없다');
  const mm = cut(APP, 'function showMeditationModal(', '\n}\n'), bm = cut(APP, 'function openBlessingModal(b) {', '\n}\n');
  const tap = cut(mm, 'mShare.addEventListener("click"', '});\n');
  assert.match(tap, /if \(typeof openMedShare === "function"\) openMedShare\(m, opts\);/, '받기에 실패해도 withLazyJs 는 부른다');
  assert.match(tap, /typeof openPrayShare === "function" \? "앱이 새 판으로 바뀌었어요\. 앱을 껐다가 다시 열어 주세요\."/, '옛 pray-share.js 가 실려 있으면 다시 눌러도 같다 — 껐다 켜기로');
  assert.match(cut(bm, 'share.addEventListener("click"', '});'), /if \(typeof openPrayShare === "function"\) openPrayShare\(\{ no: b\.no/);
  assert.match(PR, /if \(typeof openPrayShare === "function"\) openPrayShare\(list\[i\], prayName\);/);
  assert.match(tap, /sermonTitle: \(sermon && sermon\.title\) \|\| ""/, '맨 아래 「설교 「제목」」');
  assert.match(tap, /idx: cur\b/, '파일 이름 · 별 자리도 지금 요일');
  assert.match(mm, /let cur = startIdx;[\s\S]*?const render = \(i\) => \{\s*const it = items\[i\];\s*cur = i;/, '탭을 넘기면 그 요일을(let · render 안에서)');
  // 반대쪽 문장 경계 — 「…것입니다. **감사는 발견입니다.**」 끝이 앞 토막에 있고 다음 문장이 강조로 시작해도 끊는다
  const p0 = T.medShareParas(MEDS[0].message);
  assert.equal(p0.length, 5);
  assert.deepEqual(JSON.parse(JSON.stringify(p0[4])), [{ s: '감사는 발견입니다.', a: true }]);
  assert.deepEqual(JSON.parse(JSON.stringify(T.medShareParas('가 **나다** 라. 마'))), [[{ s: '가 ', a: false }, { s: '나다', a: true }, { s: ' 라.', a: false }], [{ s: '마', a: false }]]);
  // 질문은 강조색(맺음말처럼)
  const pl = T.medSharePlan(MEDS[0], 'frame', measure), tx = pl.ops.filter((o) => o.k === 'text');
  const qi = tx.findIndex((o) => o.s === T.MED_QLABEL);
  assert.ok(qi > 0 && tx[qi + 1].color === T.PRAY_SHARE_STYLES.frame.accent, '적용 질문은 강조색');
});

// ── 📖 이번 주 말씀 보내기(2026-11-05 친구 「첫 화면 이번 주 말씀도 · 오른쪽 위 작은 아이콘」 · 그림 + 주소 단추) ──
const VERSES = JSON.parse(read('verses.json')).verses;
test('verseShareDate · byline — verses.date 는 UTC(그 주일 0시 KST) → 한국 날짜 · 「설교하신 분 · 날짜」', () => {
  assert.equal(T.verseShareDate('2026-06-27T15:00:00.000Z'), '2026-06-28');
  assert.equal(T.verseShareDate('2026-10-31T15:00:00+00:00'), '2026-11-01');
  assert.equal(T.verseShareDate('2026-11-01'), '2026-11-01');
  assert.equal(T.verseShareDate(''), '');
  assert.equal(T.verseShareDate('이번 주'), '', '못 읽으면 빈 값(지어내지 않는다)');
  assert.equal(T.verseShareByline({ pastor: '차동혁 담임목사', date: '2026-10-31T15:00:00+00:00' }), '2026년 11월 1일', '맨 끝은 날짜만(설교하신 분은 그 위 한 줄)');
  assert.equal(T.verseShareByline({ date: '' }), '');
  // 친구 2026-11-05 「날짜 위에 "고척교회 차동혁 목사"」 · 「고척교회 목사님이예요」(권영준 · 한충성)
  assert.equal(T.verseSharePastor({ pastor: '' }), '고척교회 차동혁 목사', '칸이 비면 차동혁 목사(이번 주 44번)');
  assert.equal(T.verseSharePastor({}), '고척교회 차동혁 목사');
  assert.equal(T.verseSharePastor({ pastor: '차동혁 담임목사' }), '고척교회 차동혁 목사');
  assert.equal(T.verseSharePastor({ pastor: '차동혁 위임목사' }), '고척교회 차동혁 목사');
  assert.equal(T.verseSharePastor({ pastor: '권영준 목사' }), '고척교회 권영준 목사');
  assert.equal(T.verseSharePastor({ pastor: '한충성  담임 목사' }), '고척교회 한충성 목사', '띄어쓰기가 달라도');
  assert.equal(T.verseSharePastor({ pastor: '김요한 목사(새빛교회)' }), '김요한 목사(새빛교회)', '교회 이름이 든 칸은 그대로(손님 설교)');
  assert.equal(T.verseShareFoot({ sermonTitle: '감사는 발견입니다' }), '설교 「감사는 발견입니다」');
  assert.equal(T.verseShareFoot({}), '');
});

test('verseSharePlan — verses.json 전부 × 배경 다섯: 상자 안 · 글자를 잃지 않는다 · 마크 둘레를 피한다 · 맨 위 「이번 주 말씀」 · 맨 끝 설교하신 분 · 날짜', () => {
  const K = T.prayShareMark().keep;
  const meet = (q, z) => q.x < z.x + z.w && q.x + q.w > z.x && q.y < z.y + z.h && q.y + q.h > z.y;
  assert.ok(VERSES.length >= 20);
  for (const st of STYLES) {
    const S = T.PRAY_SHARE_STYLES[st];
    for (const v of VERSES) {
      const p = T.verseSharePlan(v, st, measure), at = st + ' 구절' + v.no;
      assert.ok(p.fit && p.bottom <= p.limit + 0.5 && p.size >= T.PSH_MIN, at + ' 넘침');
      const tx = p.ops.filter((o) => o.k === 'text');
      for (const o of tx) assert.ok(o.x >= S.box.x - 0.5 && o.x + o.w <= S.box.x + S.box.w + 0.5, at + ' 가로 넘침: ' + o.s);
      for (const q of p.rects) assert.ok(!meet(q, K), at + ' 글이 마크 둘레에 닿는다');
      const want = flat(T.VERSE_KICKER) + flat(v.text) + flat(v.refFull || v.refShort) + flat(T.verseShareFoot(v)) + flat(T.verseSharePastor(v)) + flat(T.verseShareByline(v));   // 말씀이 먼저 · 구절 자리는 그 아래
      assert.equal(flat(tx.map((o) => o.s).join('')), want, at + ' 글자');
      assert.equal(tx[0].s, T.VERSE_KICKER); assert.equal(tx[0].color, S.accent, at + ' 「이번 주 말씀」은 강조색');
      assert.ok(flat(tx.map((o) => o.s).join('')).endsWith(flat(T.verseSharePastor(v)) + flat(T.verseShareByline(v))) && tx[tx.length - 1].color === S.sub, at + ' 맨 끝은 「고척교회 ○○○ 목사」 · 날짜');
      const wi = tx.findIndex((o) => o.s === T.verseSharePastor(v));
      assert.ok(wi > 0 && (!T.verseShareByline(v) || (tx[wi + 1].s === T.verseShareByline(v) && tx[wi + 1].y > tx[wi].y)), at + ' 설교하신 분은 날짜 바로 위 한 줄');
      assert.equal(p.ops.filter((o) => o.k === 'mark').length, 1);
    }
  }
  const d = T.verseShareDoc(VERSES[0]);
  assert.equal(d.file, 'verse-' + VERSES[0].no + '.jpg');
  assert.equal(d.alt, '보낼 그림 — 이번 주 말씀 · ' + VERSES[0].refFull);
  assert.equal(JSON.stringify(d.plan('night', measure)), JSON.stringify(T.verseSharePlan(VERSES[0], 'night', measure)));
});

test('배선 — 첫 화면 「이번 주 말씀」 오른쪽 위 아이콘: 문(VERSE_SHARE_OPEN · 시험 참여자 먼저) · 진행 표시 오른쪽 · 판 · 주소 단추', () => {
  assert.match(APP, /const VERSE_SHARE_OPEN = (true|false);/);
  assert.match(APP, /function verseShareVisible\(\) \{ return VERSE_SHARE_OPEN \|\| \(typeof ministryTesterCached === "function" && ministryTesterCached\(\)\); \}/);
  const top = cut(APP, '<div class="weekly-topline">', '<div class="weekly-title">');
  const st = top.indexOf('class="weekly-state'), ic = top.indexOf('id="weekly-share-ic"');
  assert.ok(st > 0 && ic > st, '아이콘은 진행 표시 오른쪽(위 줄 끝)');
  assert.match(top, /\$\{verseShareVisible\(\) \? `<button type="button" class="weekly-share-ic" id="weekly-share-ic" aria-label="이번 주 말씀 카카오톡으로 보내기" title="카카오톡으로 보내기">\$\{KAKAO_TALK_IC\}<\/button>`/, '문 안에서만 · 읽어 주는 이름 · 카카오톡 아이콘(친구 2026-11-05 「첫화면 아이콘을 카카오톡 아이콘으로」)');
  assert.match(APP, /const KAKAO_TALK_IC = '<svg class="wsi-ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 3\.5c-5\.25/, '말풍선 — 판의 노란 단추와 같은 꼴');
  assert.match(read('style.css'), /\.weekly-share-ic \{\n[^}]*background: #fee500; color: #191919;/, '노란 동그라미 · 검은 말풍선');
  const h = cut(APP, 'const ic = document.getElementById("weekly-share-ic");', '})); }');
  assert.match(h, /withLazyJs\("prayShare"/);
  assert.match(h, /if \(typeof openVerseShare === "function"\) openVerseShare\(\{ no: weeklyVerse\.no, text: weeklyVerse\.text, refFull: weeklyVerse\.refFull/);
  assert.match(h, /pastor: weeklyVerse\.pastor, date: weeklyVerse\.date/);
  assert.match(h, /typeof openPrayShare === "function" \? "앱이 새 판으로 바뀌었어요\./, '옛 pray-share.js 가 실린 앱엔 껐다 켜기로');
  const ov = cut(PS, 'function openVerseShare(v) {', '\n}\n');
  assert.ok(ov.indexOf('pshReuse("verse")') >= 0 && ov.indexOf('pshReuse("verse")') < ov.indexOf('prayShareClose()'), '두 번 눌러도 판은 하나');
  assert.match(ov, /pshState\.b = null; pshState\.med = null; pshState\.verse = v;/);
  assert.match(ov, /pshOpen\(PSH_TITLE_VERSE, false, "", "verse"\);/);
  assert.match(PS, /const PSH_TITLE_VERSE = "📤 이번 주 말씀 보내기";/);
  const po = cut(PS, 'function pshOpen(', '\n}\n');
  assert.ok(!/주소로 보내기<\/button>|shareWeeklyVerse/.test(po), '구절 바로가기 「🔗 주소로 보내기」는 뺐다(친구 2026-11-05 — 카톡이 큰 미리보기 상자를 붙였다)');
  assert.ok(!/#psh-withlink/.test(po), '체크 받이도 없다 — 공유 창 길은 늘 그림 다음에 설치 주소(withLink 늘 켬)');
  assert.match(po, /<p class="psh-hint" id="psh-hint">\$\{pshHintText\(kind, kakao\)\}<\/p>/, '판 아래 안내는 한 곳(pshHintText)');
  const hint = cut(PS, 'function pshHintText(kind, kakao) {', '\n}\n');
  assert.match(hint, /return "그림을 보낸 뒤 한 번 더 누르면 설치 주소도 가요\.";/, '말씀 판(카카오 없음) 안내 — 짧게(친구 「아래 안내는 간단하게」 · 참인 말)');
  assert.match(hint, /if \(kind !== "verse"\) return "폰의 공유 창에서 카카오톡이나 메시지를 골라 주세요\." \+ tail;/, '기도문 · 묵상 안내는 그대로');
  assert.match(APP, /function shareWeeklyVerse\(verse\) \{/, 'shareWeeklyVerse 는 app.js 에 그대로 있다(WEEKLY_SHARE 를 내려도 지우지 말 것)');
  const CSS = read('style.css');
  assert.match(CSS, /\.weekly-topline \.weekly-kicks \{ margin-right: auto; \}/, '진행 표시 · 아이콘이 오른쪽에 나란히');
  assert.match(CSS, /\.dark \.weekly-share-ic \{/, '어두운 모드 짝');
});

test('📖 말씀 액자(친구 2026-11-05 「기존에 없던 것으로 · 너무 크지 않게」) — 다섯 장 × verses.json 전부: 정사각형 · 글은 안쪽 글 자리에만 · 24~40px · 마크를 피한다 · 글자를 잃지 않는다', () => {
  const ch = T.verseFrameChoices();
  assert.equal(ch.length, T.VERSE_FRAMES.length);
  assert.ok(ch.length >= 4, '액자는 넷 이상');
  const meet = (q, z) => q.x < z.x + z.w && q.x + q.w > z.x && q.y < z.y + z.h && q.y + q.h > z.y;
  for (const c of ch) {
    assert.match(c.key, /^vf:vf-[a-z]+$/);
    for (const f of [c.src, c.thumb]) assert.ok(fs.existsSync(path.join(__dirname, '..', f)), f + ' 가 없다');
    const st = c.style;
    assert.equal(st.W, 1080); assert.equal(st.H, 1080, '정사각형');
    assert.ok(st.max === 48 && st.min >= 24, '글씨 24~48px(같은 날 「글자도 키워」)');
    assert.ok(st.floor > st.box.bottom && st.floor < st.H - 40, c.key + ' 바닥은 글 자리 아래 · 액자 안(그림마다 잰 값 — 같은 +40 이면 원목 · 남색 창 밖이었다)');
    assert.ok(st.bg && /^#[0-9a-f]{6}$/i.test(st.bg), c.key + ' 그림을 못 받았을 때 바탕');
    assert.ok(st.box.x > 0 && st.box.x + st.box.w < st.W && st.box.y > 0 && st.box.bottom < st.H, c.key + ' 글 자리가 그림 안');
    for (const v of VERSES) {
      const p = T.verseSharePlan(v, st, measure), at = c.label + ' 구절' + v.no;
      assert.ok(p.fit && p.bottom <= p.limit + 0.5, at + ' 넘침 ' + p.bottom + ' > ' + p.limit);
      assert.ok(p.limit <= st.floor, at + ' 바닥');
      assert.ok(p.size >= st.min && p.size <= st.max, at + ' 글씨 ' + p.size);
      assert.ok(p.top >= st.box.y - 0.5, at + ' 위로 넘침');
      const tx = p.ops.filter((o) => o.k === 'text');
      for (const o of tx) assert.ok(o.x >= st.box.x - 0.5 && o.x + o.w <= st.box.x + st.box.w + 0.5, at + ' 가로 넘침: ' + o.s);
      for (const q of p.rects) assert.ok(!meet(q, p.keep), at + ' 글이 마크 둘레에 닿는다');
      const want = flat(T.VERSE_KICKER) + flat(v.text) + flat(v.refFull || v.refShort) + flat(T.verseShareFoot(v)) + flat(T.verseSharePastor(v)) + flat(T.verseShareByline(v));
      assert.equal(flat(tx.map((o) => o.s).join('')), want, at + ' 글자');
      const mo = p.ops.find((o) => o.k === 'mark'), ko = tx[0];
      if (T.VERSE_MARK) {   // 다시 켜면 — 「이번 주 말씀」 바로 오른쪽(같은 줄 · 묶음을 가운데로)
        assert.equal(p.ops.filter((o) => o.k === 'mark').length, 1);
        assert.ok(Math.abs(mo.cy - ko.y) < 1 && mo.x > ko.x + ko.w, at + ' 마크는 「이번 주 말씀」 바로 오른쪽(같은 줄 · 친구 2026-11-05)');
        assert.ok(Math.abs((ko.x + mo.x + mo.w) / 2 - (st.box.x + st.box.w / 2)) < 1.5, at + ' 「글자 + 마크」 묶음이 가운데');
        assert.ok(mo.x + mo.w <= st.box.x + st.box.w && mo.h < 80, at + ' 마크도 글 자리 안 · 작게');
        assert.equal(mo.disc, !!st.disc);
      } else {
        assert.ok(!mo, at + ' 말씀 액자에는 교회 마크가 없다(친구 2026-11-05 「우선 교회마크를 빼주세요」)');
        assert.ok(Math.abs(ko.x + ko.w / 2 - (st.box.x + st.box.w / 2)) < 1.5, at + ' 「이번 주 말씀」은 가운데(마크 자리만큼 비켜 두지 않는다)');
      }
      assert.ok(!p.ops.some((o) => o.k === 'note'), at + ' 설치 주소는 그림에 넣지 않는다(친구 — 보내기 글로)');
    }
  }
  // 판 — 말씀은 말씀 액자만 · 고른 액자는 따로 기억(기도문 · 묵상의 「밤하늘 먼저」와 섞이지 않게)
  assert.match(PS, /function pshChoices\(\) \{ return pshState\.verse \? verseFrameChoices\(\) : prayShareChoices\(\); \}/);
  assert.match(PS, /function pshKeyGet\(\) \{ return pshState\.verse \? pshState\.vkey : pshState\.key; \}/);
  assert.match(PS, /if \(style && typeof style === "object"\) \{/, '액자 그림을 바탕 가득');
  assert.match(PS, /cv\.width = st\.W \|\| PSH_W; cv\.height = st\.H \|\| PSH_H;/, '정사각형 바탕');
});

// ── 말씀 액자 둘째 판(2026-11-05 친구 「설치는 그림 말고 액자 아래 · 누르면 연결 · URL 박스가 크지 않게」 · 「남색 글자가 작아요」 · 「마크를 오른쪽 위로」) ──
test('말씀 보내기 글 — 짧은 주소 go/app/(대표 그림 없음 → 카톡 작은 상자) → /install/', () => {
  const t = cut(PS, 'const VERSE_SHARE_TEXT = "', '";');
  assert.match(t, /성경암송 앱 설치 https:\/\/gocheok\.onlybible\.kr\/go\/app\/$/);
  const G = read('go', 'app', 'index.html');
  assert.ok(!/property="og:image"/.test(G), 'og:image 가 있으면 카톡이 큰 상자를 만든다');
  assert.match(G, /<meta property="og:url" content="https:\/\/gocheok\.onlybible\.kr\/go\/app\/">/, 'og:url 은 이 쪽 자신(설치 안내의 대표 그림을 다시 읽지 않게)');
  assert.match(G, /<meta http-equiv="refresh" content="0; url=\/install\/">/);
  assert.match(G, /<a class="b" href="\/install\/">/, '넘기지 못해도 누를 곳');
  assert.match(read('tools', 'site.py'), /SITE_DIRS = \[[^\]]*"go"/, 'go/ 는 사이트로 나간다');
});

test('말씀 액자 — 아주 긴 구절(138자)도 바닥 안 · 글자를 잃지 않는다 · 마크는 끄거나(VERSE_MARK) 「이번 주 말씀」 오른쪽', () => {
  const long = { no: 99, refFull: '갈라디아서 2장 20절', text: '내가 그리스도와 함께 십자가에 못 박혔나니 그런즉 이제는 내가 사는 것이 아니요 오직 내 안에 그리스도께서 사시는 것이라 이제 내가 육체 가운데 사는 것은 나를 사랑하사 나를 위하여 자기 자신을 버리신 하나님의 아들을 믿는 믿음 안에서 사는 것이라',
                 sermonTitle: '그리스도와 함께', pastor: '차동혁 위임목사', date: '2026-04-18T15:00:00.000Z' };
  assert.ok(long.text.length >= 130);
  for (const c of T.verseFrameChoices()) {
    const st = c.style, p = T.verseSharePlan(long, st, measure);
    assert.ok(p.fit && p.bottom <= st.floor + 0.5, c.label + ' 긴 구절이 바닥 밖 ' + Math.round(p.bottom) + ' > ' + st.floor);
    const tx = p.ops.filter((o) => o.k === 'text');
    assert.equal(flat(tx.map((o) => o.s).join('')), flat(T.VERSE_KICKER) + flat(long.text) + flat(long.refFull) + flat(T.verseShareFoot(long)) + flat(T.verseSharePastor(long)) + flat(T.verseShareByline(long)), c.label + ' 글자');
    const mo = p.ops.find((o) => o.k === 'mark');
    if (T.VERSE_MARK) assert.ok(Math.abs(mo.cy - tx[0].y) < 1 && mo.x > tx[0].x + tx[0].w, c.label + ' 긴 구절에서도 마크는 「이번 주 말씀」 오른쪽');
    else assert.ok(!mo, c.label + ' 마크 없음');
  }
  const navy = T.VERSE_FRAMES.find((f) => f.id === 'vf-navy');
  assert.ok(navy.box.w >= 700, '남색은 창 없는 새 그림 — 글 자리가 넓다(「글자가 작아요」)');
});

test('pshDraw — 가짜 캔버스: 말씀 액자는 1080×1080 · 액자 그림을 바탕 가득 · 마크는 계획 자리(없으면 안 그림) · 기도문은 1080×1350 · 그림 못 받으면 액자마다 바탕색', async () => {
  const DRAW = cut(PS, '// ── 그리기 ──', '// ── 판(아래에서 올라온다) ──');
  const made = [];
  const mkCtx = (cv) => new Proxy({ canvas: cv, font: '700 30px x', calls: [], measureText(t) { return { width: measure(t, this.font) }; },
    createRadialGradient: () => ({ addColorStop() {} }), createLinearGradient: () => ({ addColorStop() {} }) },
    { get: (t, k) => (k in t ? t[k] : (...a) => { t.calls.push([k, ...a]); }), set: (t, k, v) => { t[k] = v; if (k === 'fillStyle') t.calls.push(['fillStyle', v]); return true; } });
  const document = { createElement: () => { const cv = { width: 0, height: 0, toBlob: (cb) => cb({ size: 1 }) }; cv.getContext = () => (cv.ctx = cv.ctx || mkCtx(cv)); made.push(cv); return cv; },
                     fonts: { load: () => Promise.resolve() } };
  let fail = false;
  class Image { set src(v) { this._src = v; this.naturalWidth = 1080; this.naturalHeight = /vf-/.test(v) ? 1080 : 1350; setTimeout(() => (fail && /vf-/.test(v) ? this.onerror && this.onerror() : this.onload && this.onload()), 0); } get src() { return this._src; } }
  const quick = (fn, ms) => (ms >= 1000 ? 0 : setTimeout(fn, ms));   // 글꼴 5초 기다림은 건너뛴다(시험이 5초 멈추지 않게)
  const D = vm.runInContext(FILL + '\n' + PURE + '\n' + DRAW + '\n;({ pshDraw, verseShareDoc, prayShareDoc, verseFrameChoices, prayShareChoices })', vm.createContext({ document, Image, setTimeout: quick, Promise, APP_BUILD: 'T' }));
  const vf = D.verseFrameChoices()[0];
  await D.pshDraw(D.verseShareDoc(VERSES[0]), vf, 1);
  let cv = made[made.length - 1];
  assert.deepEqual([cv.width, cv.height], [1080, 1080], '말씀 액자는 정사각형');
  const imgs = cv.ctx.calls.filter((c) => c[0] === 'drawImage');
  const bg = imgs.find((c) => /vf-hanji\.webp/.test(c[1]._src));
  assert.ok(bg, '액자 그림을 그린다');
  assert.deepEqual(bg.slice(2).map(Math.round), [0, 0, 1080, 1080], '바탕 가득');
  const plan = D.verseShareDoc(VERSES[0]).plan(vf.style, (t, f) => measure(t, f)), mk = plan.ops.find((o) => o.k === 'mark');
  const logo = imgs.find((c) => /logo-mark\.png/.test(c[1]._src));
  if (mk) assert.deepEqual(logo.slice(2), [mk.x, mk.y, mk.w, mk.h], '마크는 계획 자리');
  else assert.ok(!logo, '마크가 없는 꼴이면 마크를 그리지 않는다');
  assert.ok(!cv.ctx.calls.some((c) => c[0] === 'fillRect' && c[3] === 0 && c[4] === 1080 && c[5] === 1080 && cv.ctx.calls.indexOf(c) > cv.ctx.calls.indexOf(bg)), '액자 위에 막을 덮지 않는다');
  assert.ok(cv.ctx.calls.filter((c) => c[0] === 'fillText').length >= 4, '글을 쓴다');
  await D.pshDraw(D.prayShareDoc(LIST[0], '김세웅'), D.prayShareChoices()[0], 1);
  cv = made[made.length - 1];
  assert.deepEqual([cv.width, cv.height], [1080, 1350], '기도문 · 묵상은 그대로 1080×1350');
  fail = true;   // 남색 그림을 못 받으면 — 밝은 글씨가 묻히지 않게 어두운 바탕
  const navy = D.verseFrameChoices().find((c) => c.key === 'vf:vf-navy');
  await D.pshDraw(D.verseShareDoc(VERSES[0]), navy, 1);
  cv = made[made.length - 1];
  assert.ok(cv.ctx.calls.some((c) => c[0] === 'fillStyle' && c[1] === navy.style.bg), '그림을 못 받으면 액자 바탕색(' + navy.style.bg + ')');
});

test('말씀 판 — 배경은 액자만 · 고른 액자는 따로 기억(기도문 · 묵상의 「밤하늘 먼저」와 안 섞인다) · 정사각형 미리보기', () => {
  const HEAD = cut(PS, 'const pshState = {', 'function pshSay(');
  const S = vm.runInContext(FILL + '\n' + PURE + '\n' + DOCS + '\n' + HEAD + '\n;({ pshState, pshChoices, pshKeyGet, pshKeySet })', vm.createContext({}));
  assert.equal(S.pshKeyGet(), 'night', '기도문 · 묵상 처음 값');
  S.pshState.verse = { no: 1, text: '말씀' };
  assert.ok(S.pshChoices().every((c) => /^vf:/.test(c.key)), '말씀 판은 액자만');
  S.pshKeySet('vf:vf-gold');
  assert.equal(S.pshState.vkey, 'vf:vf-gold'); assert.equal(S.pshState.key, 'night', '말씀에서 고른 액자가 기도문 배경으로 새지 않는다');
  S.pshState.verse = null;
  assert.equal(S.pshKeyGet(), 'night'); assert.ok(S.pshChoices().some((c) => c.key === 'night'));
  const CSS = read('style.css');
  assert.match(CSS, /\.psh-dim\[data-kind="verse"\] \.psh-pv \{ aspect-ratio: 1 \/ 1; \}/, '말씀 미리보기는 정사각형');
  assert.match(CSS, /\.psh-pv img \{ display: block; width: 100%; height: 100%; object-fit: contain; \}/, '미리보기를 늘이지 않는다');
  assert.match(CSS, /\.psh-t-vframe img \{ width: 100%; height: 100%; object-fit: cover; \}/, '액자 작은 그림');
});

// ── 말씀 액자 다섯째 판(2026-11-05 친구 「첫번째 액자가 왼쪽으로 치우쳤어요」 · 「청색 글씨가 오른쪽으로 치우쳤어요」) ──
//   한지 · 남색은 그림자까지 넣어 잰 테두리로 잘라 액자가 왼쪽 위로 밀렸다(한지 여백 왼 28 · 오른 104 / 남색 안쪽 가운데 510 · 글 자리 540) —
//   테두리 자신의 가운데로 다시 잘랐다. 그림 속 테두리는 이 시험이 못 잰다(PIL 로 잰 값은 docs/notes/prayer-book.md) — 글 자리만 본다.
test('말씀 액자 — 글 자리 가운데가 그림 가운데에서 5px 안(액자를 테두리 가운데로 잘랐다) · 좌우 여백이 같다', () => {
  for (const f of T.VERSE_FRAMES) {
    const cx = f.box.x + f.box.w / 2;
    assert.ok(Math.abs(cx - 540) <= 5, f.label + ' 글 자리 가운데 ' + cx);
  }
  const hanji = T.VERSE_FRAMES.find((f) => f.id === 'vf-hanji'), navy = T.VERSE_FRAMES.find((f) => f.id === 'vf-navy');
  assert.ok(Math.abs(hanji.box.x + hanji.box.w / 2 - 540) <= 1 && Math.abs((hanji.box.y + hanji.box.bottom) / 2 - 540) <= 1, '한지는 위아래 · 좌우 가운데');
  assert.ok(Math.abs(navy.box.x + navy.box.w / 2 - 541) <= 1, '남색 안쪽(102~980) 가운데');
  assert.ok(navy.floor <= 983 - 18, '남색 바닥은 안쪽(아래 끝 983) 안');
});

// ── 📖 카카오톡으로 보내기(2026-11-05 친구 「URL에 그림도 같이 나오게」 · 카드 맨 아래 이름은 「지금 이름을 그대로」) ──
//   공유 창 길로는 카톡이 그림에 붙인 글을 버린다 → 카카오 JavaScript SDK 피드 메시지(그림 + 「앱 설치」 단추 한 통). 키가 비면 단추가 없다.
//   같은 날 검토(review-kakao-share)로 고친 것: 공유 창 잠금과 따로 쓰는 표(kakaoBusy) · 20초 한도 · 카톡 앱으로 여는 기기만 · 끊긴 통신 · 늦은 응답 · 개인정보 문장.
// config.js 를 실제로 돌려 본다(글자 꼴로 찾으면 조금만 바뀌어도 개발 빈 키를 잡고 조용히 지나간다 — 같은 날 검토)
const runCfg = (host) => {
  const w = {};
  vm.runInContext(read('js', 'config.js'), vm.createContext({ window: w, location: { hostname: host }, document: { body: null, addEventListener() {}, getElementById() { return null; } } }));
  return w;
};

test('카카오톡으로 보내기 — 배선: 말씀 판 · 키 · 카톡 앱 기기만 · 덩어리 맨 위 노란 단추 · SDK 를 못 받으면 (그 판만) 거둔다 · 운영 키는 config.js', () => {
  assert.match(PS, /const KAKAO_SDK = \{ src: "https:\/\/t1\.kakaocdn\.net\/kakao_js_sdk\/2\.8\.4\/kakao\.min\.js", integrity: "sha384-BGX7Wb16GmRFagri4bLJV2DgipVZaU2AI812GZtHtHzzDQJnfHasDXN5houxv45w" \};/,
    'SDK 판 · SRI 는 카카오 문서 값(파일을 받아 sha384 를 다시 계산해 같았다) — 판을 바꾸면 둘을 함께');
  assert.match(PS, /const KAKAO_INSTALL = "https:\/\/gocheok\.onlybible\.kr\/install\/";/, '그림 · 단추 모두 설치 안내로(카카오 콘솔 웹 도메인에 등록한 주소)');
  assert.match(PS, /const KAKAO_WAIT = 2000;/, '올리기 문턱 2초(크롬 5초 − SDK 가 묻는 두 번)');
  assert.match(PS, /const KAKAO_LIMIT = 20000;/, 'SDK 받기 · 올리기 한도 20초');
  const po = cut(PS, 'function pshOpen(', '\n}\n');
  assert.match(po, /const kakao = kind === "verse" && !!pshKakaoKey\(\) && pshKakaoTalkDevice\(\);/, '말씀 판 · 키가 있고 · 카톡 앱으로 여는 기기만');
  assert.match(po, /const kk = wrap\.querySelector\("#psh-kakao"\);\n  if \(kk\) \{\n    kk\.addEventListener\("click", pshKakaoSend\);\n    pshKakaoLoad\(\)\.catch\(\(\) => \{/, '판을 열 때 SDK 를 미리 받는다(누르는 순간엔 준비돼 있게)');
  assert.match(po, /if \(!wrap\.isConnected\) return;\n      kk\.remove\(\);\n      const h = wrap\.querySelector\("#psh-hint"\); if \(h\) h\.innerHTML = pshHintText\("verse", false\);\n      const s = wrap\.querySelector\("#psh-send"\); if \(s\) \{ s\.hidden = false; if \(!s\.disabled\) pshSendLabel\(false\); \}/,
    '못 받으면 그 판이 아직 열려 있을 때만 — 단추를 거두고 안내 · 숨긴 공유 창 단추를 꺼낸다(다른 판 글을 덮지 않게)');
  assert.match(PS, /<button type="button" class="psh-send" id="psh-send"\$\{kakao \? " hidden" : ""\} disabled>/, '카카오 단추가 있으면 「카카오톡으로 보내기」만(친구 2026-11-05 「문자 다른 앱으로 보내기는 숨겨 주세요」)');
  assert.match(read('style.css'), /\.psh-send\[hidden\] \{ display: none; \}/, '숨김이 실제로 숨는다');
  assert.match(cut(PS, 'function pshKakaoFallback(msg) {', '\n}\n'), /const s = document\.getElementById\("psh-send"\);\n  if \(s\) s\.hidden = false;\n  pshSay\(msg\);/, '카카오로 못 보냈을 때만 숨긴 단추를 꺼낸다');
  assert.match(cut(PS, 'function pshHintText(kind, kakao) {', '\n}\n'), /if \(kakao\) return "말씀 그림과 「말씀 외워 보기」 단추가 함께 가요\.";/, '카카오 판 안내 — 한 줄(친구 2026-11-06 「아래 안내는 간단하게」)');
  assert.match(cut(PS, 'function pshRedraw() {', '\n}\n'), /pshState\.kakaoReady = ""; pshState\.kakaoBusy = null;/, '그림이 바뀌면 「카카오톡 열기」 차례 · 올리던 표를 버린다');
  const close = cut(PS, 'function prayShareClose(fromPop) {', '\n}\n');
  assert.match(close, /pshState\.kakaoReady = ""; pshState\.kakaoBusy = null; clearTimeout\(pshState\.kakaoT\);/, '판을 닫으면 차례 · 표 · 타이머를 거둔다');
  assert.doesNotMatch(close, /kakaoUp = /, '올린 그림 주소는 남긴다(다시 열어 같은 그림이면 또 올리지 않게)');
  assert.match(cut(PS, 'function pshSendLabel(busy) {', '\n}\n'), /pshKakaoBtn\(pshState\.kakaoBusy \? "busy" : pshState\.kakaoReady \? "open" : ""\);/, '노란 단추도 그림을 따른다');
  const ks = cut(PS, 'function pshKakaoSend() {', '\n}\n');
  assert.doesNotMatch(ks, /pshState\.sharing = /, '공유 창 잠금(sharing)을 쥐지 않는다 — 올리는 동안에도 다른 단추 · 다른 판이 눌린다');
  assert.match(PS, /kakaoUp: \{\}, kakaoReady: "", kakaoBusy: null, kakaoT: 0 \};/, '올린 그림 주소 · 열 차례 · 표 · 타이머');
  const CSS = read('style.css');
  assert.match(CSS, /\.psh-kakao \{\n[^}]*background: #fee500; color: #191919;/, '카카오 노란색 · 검은 글씨(카카오 디자인 가이드)');
  assert.match(CSS, /\.dark \.psh-kakao\.next \{/, '「카카오톡 열기」 차례 어두운 모드 짝');
  assert.match(CSS, /html\[data-fs="xl"\] \.psh-kakao \{ font-size: 1\.28rem; \}/, '아주 큰 글씨');
  // 운영 주소 → 운영 키 · 그 밖 → 빈 값(콘솔에 등록하지 않았다) — config.js 를 실제로 돌린다
  const p = runCfg('gocheok.onlybible.kr'), d = runCfg('localhost'), g = runCfg('sewoongkim1.github.io');
  assert.equal(p.KAKAO_JS_KEY, p.SUPA_PROD.KAKAO, '운영 주소 → 운영 키');
  assert.equal(d.KAKAO_JS_KEY, '', 'localhost → 빈 값(단추 없음)');
  assert.equal(g.KAKAO_JS_KEY, '', '미리보기 주소 → 빈 값');
  if (p.KAKAO_JS_KEY) assert.match(p.KAKAO_JS_KEY, /^[0-9a-f]{32}$/, 'JavaScript 키 꼴(32자) — 네이티브 앱 키(kakao…)가 아니다(친구가 처음에 네이티브 키를 보냈다)');
});

test('카카오톡으로 보내기 — 카톡 앱으로 여는 기기만(SDK 판별 그대로 · 안드로이드 태블릿 · PC 는 카카오 웹 로그인 창이 떠서 뺀다)', () => {
  const DEV = cut(PS, 'function pshKakaoTalkDevice() {', '\n}\n') + '\n}\n';
  const on = (ua, tp) => vm.runInContext(DEV + ';pshKakaoTalkDevice()', vm.createContext({ navigator: { userAgent: ua, maxTouchPoints: tp || 0 } }));
  assert.equal(on('Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'), true, '안드로이드 폰(크롬 · TWA)');
  assert.equal(on('Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0 Mobile Safari/537.36'), true, '안드로이드 폰(삼성 인터넷)');
  assert.equal(on('Mozilla/5.0 (Linux; Android 14; SM-X910) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'), false, '안드로이드 태블릿(Mobile 없음)');
  assert.equal(on('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'), true, '아이폰 앱(WKWebView)');
  assert.equal(on('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15', 5), true, '아이패드(데스크톱 UA + 터치)');
  assert.equal(on('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15', 0), false, '맥');
  assert.equal(on('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'), false, 'PC');
  assert.equal(on('Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 KAKAOTALK 10.8.0'), true, '카톡 안 브라우저');
  assert.equal(on('Mozilla/5.0 (Linux; Android 14; SM-X910) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 KAKAOTALK 10.8.0'), true, '태블릿이라도 카톡 안 브라우저면(SDK 가 카톡 길로 간다)');
  assert.equal(on('Mozilla/5.0 (Linux; Android 12; NOH-AN00) AppleWebKit/537.36 (KHTML, like Gecko) HuaweiBrowser/13.0 Chrome/99.0 Mobile Safari/537.36'), false, '화웨이 브라우저(SDK 가 웹 길로 보낸다)');
  assert.equal(on('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 OPR/85.0'), false, '오페라');
  assert.equal(vm.runInContext(DEV + ';pshKakaoTalkDevice()', vm.createContext({})), false, 'navigator 가 없으면 아니다');
});

test('카카오톡으로 보내기 — SDK 한 번만 · 그림 올리고 카드 · 같은 그림은 한 번만 · 2초 문턱 · 표(늦은 응답 · 바뀐 그림 · 닫힘) · 20초 한도 · 끊긴 통신 · 안 열렸으면', async () => {
  const KB = cut(PS, '// 📖 카카오톡으로 보내기(', 'function prayShareClose(');
  const tick = () => new Promise((r) => setTimeout(r, 5));
  const said = [], scripts = [], ups = [], sent = [];
  let clock = 1000, upDelay = 0, upFail = false, upHold = false, longMs = null, frame = 'vf:vf-hanji';
  const held = [];
  const btn = { disabled: false, cls: new Set(), t: { textContent: '카카오톡으로 보내기' },
    classList: { toggle(c, on) { if (on) btn.cls.add(c); else btn.cls.delete(c); } }, querySelector: () => btn.t };
  const sendBtn = { hidden: true };   // 카카오 판에서는 숨겨 둔 「문자 · 다른 앱으로 보내기」
  const doc = { visibilityState: 'hidden', getElementById: (id) => (id === 'psh-kakao' ? btn : id === 'psh-send' ? sendBtn : null), createElement: () => { const s = {}; scripts.push(s); return s; }, head: { appendChild() {} } };
  const Kakao = { n: 0, key: '', isInitialized() { return this.n > 0; }, init(k) { this.n++; this.key = k; },
    Share: { uploadImage(a) { ups.push(a); if (upHold) return new Promise((ok) => held.push(ok));
               return new Promise((ok, no) => setTimeout(() => { clock += upDelay; if (upFail) no(new Error('x')); else ok({ infos: { original: { url: 'https://k.kakaocdn.net/u' + ups.length + '.jpg' } } }); }, 0)); },
             sendDefault(t) { sent.push(t); } } };
  const win = {};
  class File { constructor(parts, name, o) { this.parts = parts; this.name = name; this.type = o.type; } }
  // 1초 넘는 타이머(20초 한도 · 6초 「안 열렸으면」)는 longMs 가 null 이면 안 울린다 · 숫자면 그만큼 뒤에 울린다
  const st = (fn, ms) => (ms >= 1000 ? (longMs === null ? 0 : setTimeout(fn, longMs)) : setTimeout(fn, ms));
  const ct = (t) => { if (t) clearTimeout(t); };
  const nav = { onLine: true };
  const ctx = vm.createContext({ window: win, document: doc, navigator: nav, KAKAO_JS_KEY: ' test-key ', File, setTimeout: st, clearTimeout: ct, Promise, Date: { now: () => clock },
    VERSE_KICKER: '이번 주 말씀', pshSay: (t) => said.push(t), pshKeyGet: () => frame,
    pshState: { gen: 1, blob: { size: 123 }, verse: { no: 44, refFull: '누가복음 17장 16절', text: '말씀' }, file: 'verse-44.jpg', sharing: false, withLink: true, kakaoUp: {}, kakaoReady: '', kakaoBusy: null, kakaoT: 0 } });
  vm.runInContext(KB, ctx);
  const K = (s) => vm.runInContext(s, ctx);
  const p1 = K('pshKakaoLoad()'), p2 = K('pshKakaoLoad()');
  assert.equal(p1, p2, 'SDK 는 한 번만 받는다');
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].src, 'https://t1.kakaocdn.net/kakao_js_sdk/2.8.4/kakao.min.js');
  assert.equal(scripts[0].integrity, 'sha384-BGX7Wb16GmRFagri4bLJV2DgipVZaU2AI812GZtHtHzzDQJnfHasDXN5houxv45w');
  assert.equal(scripts[0].crossOrigin, 'anonymous');
  win.Kakao = Kakao; scripts[0].onload();
  await p1;
  assert.equal(Kakao.key, 'test-key', '키 앞뒤 빈칸은 뗀다'); assert.equal(Kakao.n, 1);
  // 빠를 때 — 올리고 곧바로 카드
  K('pshKakaoSend()'); await tick();
  assert.equal(ups.length, 1);
  assert.ok(ups[0].file[0] instanceof File && ups[0].file[0].type === 'image/jpeg' && ups[0].file[0].name === 'verse-44.jpg', '그림은 File 로 [file]');
  assert.equal(sent.length, 1);
  // 폰은 표 kk=1 을 붙인 우리 쪽(깔린 앱 · 없으면 설치 안내 — app.js routeKakaoCard) · PC 카카오톡은 설치 안내 그대로
  const t = sent[0], link = { mobileWebUrl: 'https://gocheok.onlybible.kr/?kk=1', webUrl: 'https://gocheok.onlybible.kr/install/' };
  assert.equal(t.objectType, 'feed');
  assert.equal(t.content.imageUrl, 'https://k.kakaocdn.net/u1.jpg');
  assert.equal(t.content.imageWidth, 1080); assert.equal(t.content.imageHeight, 1080, '정사각 크기를 알려 줘야 잘리지 않는다');
  assert.equal(t.content.title, '이번 주 말씀 · 누가복음 17장 16절');
  assert.equal(t.content.description, '성경암송 앱을 설치하고 함께 외워 보세요');
  assert.deepEqual(JSON.parse(JSON.stringify(t.content.link)), link, '그림을 눌러도 설치 안내');
  assert.equal(t.buttons.length, 1); assert.equal(t.buttons[0].title, '말씀 외워 보기', '카톡 카드 단추 이름(친구 2026-11-06 「카카오톡: 말씀 외워 보기」)');
  assert.deepEqual(JSON.parse(JSON.stringify(t.buttons[0].link)), link);
  assert.equal(K('pshKakaoTemplate({ refShort: "눅 17:16" }, "u", true)').content.title, '이번 주 말씀 · 눅 17:16', '긴 이름이 없으면 짧은 이름');
  assert.equal(K('pshKakaoTemplate({}, "u", true)').content.title, '이번 주 말씀', '구절 이름이 없으면 「이번 주 말씀」만');
  // 카드 단추는 늘 「앱 설치」 하나(친구 2026-11-06 「설치 주소도 보내기 체크박스 컨트롤 삭제」 — 그 전엔 끄면 「말씀 외워 보기」)
  const tt = K('pshKakaoTemplate({ no: 44, refFull: "누가복음 17장 16절" }, "u")');
  assert.equal(tt.buttons.length, 1); assert.equal(tt.buttons[0].title, '말씀 외워 보기');
  assert.deepEqual(JSON.parse(JSON.stringify(tt.buttons[0].link)), link, '폰은 ?kk=1(앱 첫 화면 · 없으면 설치 안내 — routeKakaoCard) · PC 는 설치 안내');
  assert.ok(!JSON.stringify(tt).includes('?v='), '카드에 구절 바로가기는 없다(첫 화면 · 설치 안내만)');
  assert.ok(!/withLink \? "앱 설치"/.test(PS), '체크로 단추를 가르던 갈래는 걷었다(이름은 늘 「말씀 외워 보기」)');
  assert.equal(btn.t.textContent, '카카오톡으로 보내기'); assert.equal(btn.disabled, false); assert.equal(K('pshState.kakaoBusy'), null);
  assert.equal(K('pshState.sharing'), false, '공유 창 잠금은 건드리지 않는다');
  // 같은 그림 — 다시 올리지 않는다 · 액자나 파일이 다르면 크기가 같아도 다시
  K('pshKakaoSend()'); await tick();
  assert.equal(ups.length, 1, '같은 그림은 한 번만 올린다'); assert.equal(sent.length, 2);
  frame = 'vf:vf-gold'; K('pshKakaoSend()'); await tick();
  assert.equal(ups.length, 2, '다른 액자 · 같은 크기 → 다시 올린다');
  frame = 'vf:vf-hanji'; K('pshState.file = "verse-45.jpg"'); K('pshKakaoSend()'); await tick();
  assert.equal(ups.length, 3, '다른 구절 · 같은 액자 · 같은 크기 → 다시 올린다');
  K('pshState.file = "verse-44.jpg"'); assert.equal(sent.length, 4);
  // 2초 문턱 — 안이면 곧바로 · 넘으면 「카카오톡 열기」
  K('pshState.blob = { size: 2001 }'); upDelay = 1900; K('pshKakaoSend()'); await tick();
  assert.equal(sent.length, 5, '2초 안 → 곧바로 연다');
  K('pshState.blob = { size: 2002 }'); upDelay = 2100; K('pshKakaoSend()');
  assert.equal(btn.disabled, true, '올리는 동안 잠금'); assert.equal(btn.t.textContent, '카카오톡 준비 중…');
  K('pshKakaoSend()');   // 그사이 또 누름
  await tick();
  assert.equal(ups.length, 5, '두 번 눌러도 한 번만 올린다');
  assert.equal(sent.length, 5, '늦었으니 곧바로 열지 않는다');
  assert.ok(btn.cls.has('next')); assert.equal(btn.t.textContent, '카카오톡 열기'); assert.equal(btn.disabled, false);
  assert.equal(K('pshState.kakaoReady'), 'https://k.kakaocdn.net/u5.jpg');
  assert.match(said[said.length - 1], /「카카오톡 열기」를 눌러 주세요/);
  K('pshKakaoSend()');
  assert.equal(sent.length, 6); assert.equal(sent[5].content.imageUrl, 'https://k.kakaocdn.net/u5.jpg', '한 번 더 누르면 곧바로(올리지 않고)');
  assert.equal(ups.length, 5); assert.equal(K('pshState.kakaoReady'), ''); assert.ok(!btn.cls.has('next'));
  // 다른 공유 창이 떠 있는 사이에 올라왔다 — 곧바로 열지 않고 한 번 더
  upDelay = 0; K('pshState.blob = { size: 3000 }'); K('pshKakaoSend()'); K('pshState.sharing = true');
  await tick();
  assert.equal(sent.length, 6, '공유 창이 떠 있으면 열지 않는다'); assert.ok(btn.cls.has('next'));
  K('pshState.sharing = false; pshState.kakaoReady = ""'); btn.cls.clear();
  // 표 — 올리는 사이 액자를 바꿨다(pshRedraw 가 표를 버린다) → 새 그림은 새로 올리고, 늦게 온 옛 결과는 아무것도 안 바꾼다
  upHold = true; K('pshState.blob = { size: 4000 }'); K('pshKakaoSend()'); await tick();
  assert.equal(held.length, 1); assert.ok(K('pshState.kakaoBusy'), '올리는 중');
  assert.equal(K('pshState.sharing'), false, '카카오가 올리는 동안에도 공유 창 잠금은 풀려 있다(다른 단추 · 다른 판이 눌린다)');
  K('pshState.kakaoReady = ""; pshState.kakaoBusy = null; pshState.blob = { size: 4001 }');   // = pshRedraw · prayShareClose 가 하는 일(위 배선 시험이 본다)
  upHold = false; K('pshKakaoSend()'); await tick();
  assert.equal(ups.length, 8, '새 그림은 새로 올린다(옛 차례에 막히지 않는다)'); assert.equal(sent.length, 7);
  const n7 = said.length;
  held[0]({ infos: { original: { url: 'https://k.kakaocdn.net/old.jpg' } } }); await tick();
  assert.equal(sent.length, 7, '늦게 온 옛 결과로는 보내지 않는다'); assert.equal(said.length, n7, '옛 결과는 말도 안 한다');
  assert.equal(K('pshState.kakaoReady'), ''); assert.equal(K('pshState.kakaoBusy'), null);
  // 늦게 온 옛 실패도 아무것도 안 바꾼다
  upHold = true; K('pshState.blob = { size: 4002 }'); K('pshKakaoSend()'); await tick();
  assert.equal(held.length, 2);
  K('pshState.kakaoBusy = null');
  upHold = false; upFail = true; const n8 = said.length;
  held[1](Promise.reject(new Error('x'))); await tick();
  assert.equal(said.length, n8, '옛 실패는 말하지 않는다(다른 판 · 새 그림에 엉뚱한 말이 뜨지 않게)');
  // 실패 — 말하고 · 기억하지 않는다(다시 누르면 다시 올린다)
  K('pshState.blob = { size: 5000 }');
  K('pshKakaoSend()'); await tick();
  assert.equal(sent.length, 7); assert.match(said[said.length - 1], /카카오톡으로 보내지 못했어요\. 아래 「문자 · 다른 앱으로 보내기」로 보내 주세요\./);
  assert.equal(sendBtn.hidden, false, '못 보냈으면 숨겨 둔 「문자 · 다른 앱으로 보내기」를 꺼낸다(보낼 길을 남긴다)'); sendBtn.hidden = true;
  assert.equal(K('pshState.kakaoBusy'), null); assert.equal(btn.disabled, false);
  upFail = false; K('pshKakaoSend()'); await tick();
  assert.equal(sent.length, 8, '실패한 그림은 기억하지 않는다');
  // 20초 한도 — 올리기가 멈추면 「준비 중」으로 굳지 않고 말한다
  upHold = true; longMs = 1; K('pshState.blob = { size: 6000 }'); K('pshKakaoSend()');
  await tick(); await tick();
  assert.match(said[said.length - 1], /카카오톡으로 보내지 못했어요/, '멈춘 올리기는 한도에서 끊는다');
  assert.equal(K('pshState.kakaoBusy'), null); assert.equal(btn.t.textContent, '카카오톡으로 보내기');
  upHold = false; longMs = null;
  // 통신이 끊겼으면 SDK 를 부르지 않는다(실패하면 SDK 가 화면을 카카오 오류 쪽으로 옮긴다)
  nav.onLine = false; K('pshState.blob = { size: 123 }; pshState.file = "verse-44.jpg"'); frame = 'vf:vf-hanji';
  K('pshKakaoSend()'); await tick();
  assert.equal(sent.length, 8, '끊긴 통신 → 부르지 않는다'); assert.match(said[said.length - 1], /인터넷에 연결되지 않았어요/);
  nav.onLine = true;
  // 카드를 못 열었다(sendDefault 가 던짐) — 말한다
  const sd = Kakao.Share.sendDefault; Kakao.Share.sendDefault = () => { throw new Error('x'); };
  K('pshKakaoSend()'); await tick();
  assert.match(said[said.length - 1], /카카오톡을 열지 못했어요\. 아래 「문자 · 다른 앱으로 보내기」로 보내 주세요\./);
  assert.equal(sendBtn.hidden, false, '카드를 못 열었으면 숨긴 단추를 꺼낸다'); sendBtn.hidden = true;
  Kakao.Share.sendDefault = sd;
  // 6초 뒤에도 판이 보이면 — 「열리지 않았으면」(카톡이 열려 화면이 가려졌으면 말하지 않는다)
  longMs = 1; doc.visibilityState = 'visible'; K('pshKakaoSend()'); await tick(); await tick();
  assert.match(said[said.length - 1], /카카오톡이 열리지 않았으면 한 번 더 눌러 주세요/);
  const n9 = said.length; doc.visibilityState = 'hidden'; K('pshKakaoSend()'); await tick(); await tick();
  assert.equal(said.length, n9 + 1, '가려졌으면(카톡이 열렸다) 그 말은 없다 — 보내기 전 비우는 말 하나뿐');
  longMs = null;
  // 그림이 없으면(그리는 중) 노란 단추를 잠근다
  K('pshState.blob = null; pshKakaoBtn("")');
  assert.equal(btn.disabled, true, '그리는 동안 잠금');
  // 키가 없으면 SDK 를 받지 않는다
  const n0 = scripts.length;
  const ctx2 = vm.createContext({ window: {}, document: doc, KAKAO_JS_KEY: '', Promise, setTimeout: st, clearTimeout: ct });
  vm.runInContext(KB, ctx2);
  await assert.rejects(vm.runInContext('pshKakaoLoad()', ctx2));
  assert.equal(scripts.length, n0, '키가 없으면 스크립트를 붙이지 않는다');
  // 못 받았으면 다음에 다시 · 멈춘 받기도 한도에서 끊고 다음에 다시
  const ctx3 = vm.createContext({ window: {}, document: doc, KAKAO_JS_KEY: 'k', Promise, setTimeout: st, clearTimeout: ct });
  vm.runInContext(KB, ctx3);
  const e1 = vm.runInContext('pshKakaoLoad()', ctx3);
  scripts[scripts.length - 1].onerror();
  await assert.rejects(e1);
  longMs = 1;
  const e2 = vm.runInContext('pshKakaoLoad()', ctx3);
  assert.equal(scripts.length, n0 + 2, 'SDK 를 못 받았으면 다음에 다시 붙인다');
  await assert.rejects(e2, /timeout/, '멈춘 받기는 한도에서 끊는다');
  longMs = null;   // 마지막 받기는 끝까지 기다리게(한도 타이머 없음 — 처리 안 된 거절을 남기지 않게)
  vm.runInContext('pshKakaoLoad()', ctx3);
  assert.equal(scripts.length, n0 + 3, '끊긴 뒤에도 다음에 다시');
});

test('카카오톡 키를 넣는 커밋에 — 개인정보 안내 세 자리에 카카오 줄(새 외부 서비스 · copy-truth) — 무엇이 · 어디로 · 얼마나', () => {
  if (!runCfg('gocheok.onlybible.kr').KAKAO_JS_KEY) return;   // 운영 키가 비어 있다 — 단추가 안 보이고 카카오로 아무것도 가지 않는다
  const P = read('privacy', 'index.html'), PI = cut(APP, 'function renderPrivacyInfo(', '\n}\n'), H = cut(APP, 'function renderHelp(', '\n}\n');
  assert.match(P, /<td>카카오<br>\(카카오톡 공유\)<\/td>[\s\S]*?카카오톡으로 보내기[\s\S]*?설교하신 목사님 성함[\s\S]*?보내시는 분의 이름·소속 같은 개인정보는 없습니다[\s\S]*?카카오 서버에 최대 100일 보관[\s\S]*?접속 IP[\s\S]*?<\/tr>/, 'privacy/ 2항 표 줄');
  assert.match(PI, /<h3>「이번 주 말씀」 카카오톡으로 보내기<\/h3>\s*<ul>[\s\S]*?<b>카카오 서버<\/b>에 올라가 최대 100일[\s\S]*?설교하신 목사님 성함[\s\S]*?보내시는 분의 이름·소속 같은 개인정보는 없어요[\s\S]*?접속 기록\(IP·기기 정보\)[\s\S]*?<\/ul>/, 'renderPrivacyInfo 절');
  assert.match(H, /<b>「이번 주 말씀」을 카카오톡으로 보내기<\/b>를 누르시면[^<]*<b>카카오 서버<\/b>에 올라가 최대 100일 보관됩니다\(그림에는 설교하신 목사님 성함이 들어가고 보내시는 분의 이름·소속 같은 개인정보는 없습니다/, 'renderHelp 🔒 문장');
  for (const [n, s] of [['privacy/', P], ['renderPrivacyInfo', PI], ['renderHelp', H]]) assert.doesNotMatch(s, /이름 같은 개인정보는 없/, n + ' — 「이름 같은 개인정보는 없다」는 틀렸다(목사님 성함이 들어간다 · 같은 날 검토)');
  assert.match(P, /마지막 수정: 2026년 11월 5일/, '방침을 고친 날');
});

// ── 카톡 카드 단추를 누르면 — 카톡 안 브라우저 → 밖으로(2026-11-06 친구 「설치된 앱으로 안 가고 브라우저에서 열리네요」) ──
//   예전엔 안드로이드에서 크롬을 콕 집어(package=com.android.chrome) 깔린 플레이 앱으로 안 갔다. 패키지를 비우면 안드로이드가 고른다 —
//   앱 링크(autoVerify · assetlinks)로 플레이 앱이 깔려 있으면 앱, 없으면 기본 브라우저. 아이폰 앱은 유니버설 링크가 없어 사파리로 간다(앱 새 판이 있어야 한다).
test('카톡 안 브라우저 → 밖으로 — 안드로이드는 패키지를 정하지 않은 intent(깔린 앱 · 없으면 기본 브라우저) · 넘기는 주소에 ?v= 가 남는다', () => {
  const f = cut(APP, 'function promptOpenExternal() {', '\n}\n');
  assert.doesNotMatch(f, /package=com\.android\.chrome/, '크롬을 콕 집으면 깔린 앱으로 안 간다');
  assert.match(f, /"#Intent;scheme=https;S\.browser_fallback_url=" \+\n    encodeURIComponent\(url\) \+\n    ";end";/, '패키지 없는 https intent · 앱도 브라우저도 없으면 그 주소로');
  assert.match(f, /\$\{isAndroid \? "앱 · 기본 브라우저로 열기" : "기본 브라우저로 열기"\}/, '안내 단추 이름도 사실대로(안드로이드는 깔린 앱이 열 수 있다)');
  assert.match(APP, /\nif \(!routeKakaoCard\(\)\) promptOpenExternal\(\);[^\n]*\nloadVerses\(\);/, '카톡 카드 길 · 밖으로 넘기기가 ?v= 를 읽어 지우기(loadVerses → getDeepLinkVerseNo)보다 먼저 — 넘기는 주소에 구절 바로가기가 남는다');
  const M = read('android-app', 'app', 'src', 'main', 'AndroidManifest.xml');
  assert.match(M, /<intent-filter android:autoVerify="true">[\s\S]*?android:scheme="https"[\s\S]*?android:host="@string\/hostName"/, '플레이 앱이 우리 주소를 받는다(앱 링크)');
  const AL = JSON.parse(read('.well-known', 'assetlinks.json'));
  assert.ok(AL.some((x) => x.target.package_name === 'kr.onlybible.gocheok' && x.relation.includes('delegate_permission/common.handle_all_urls')), 'assetlinks 에 새 앱 — 앱 링크 확인');
});

// 같은 날 둘째 판(친구 「갤럭시에서 열었는데 브라우저에서 열려요」) — 패키지 없는 intent 는 카톡 · 폰이 브라우저를 골랐다(앱 링크 확인 파일은 멀쩡했다 —
//   assetlinks 200 · 구글 확인 API 에 새 앱 지문). 그래서 ① 플레이 앱을 콕 집어 → 없으면 카톡이 fallback(같은 주소 + kx=1)을 이 창에 → ② 패키지 없는 intent(기본 브라우저).
test('카톡 안 브라우저 → 밖으로(둘째 판) — 실제로 돌려 본다: ① 앱 먼저 · 2.5초 뒤에도 보이면 브라우저 · ② 돌아온 길(kx=1)은 표를 떼고 브라우저 · 한 번씩만 · 아이폰은 사파리', () => {
  const f = cut(APP, 'function kakaoCloseWhenHidden(ua) {', '\n}\n') + '\n}\n' + cut(APP, 'function promptOpenExternal() {', '\n}\n') + '\n}\n';
  assert.match(APP, /const PLAY_APP_ID = "kr\.onlybible\.gocheok";/);
  const ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 KAKAOTALK 10.8.0';
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.0';
  const sim = (href, ua, store) => {
    const loc = { href }, hist = [], timers = [], listeners = [];
    let bar = null;
    const doc = { visibilityState: 'visible', body: { prepend(b) { bar = b; } },
      createElement: () => ({ className: '', innerHTML: '', querySelector: () => ({ addEventListener() {} }), remove() {} }),
      addEventListener: (t, fn) => listeners.push([t, fn]), removeEventListener: (t, fn) => { const i = listeners.findIndex((x) => x[1] === fn); if (i >= 0) listeners.splice(i, 1); } };
    const ctx = vm.createContext({ navigator: { userAgent: ua }, location: loc, URL, encodeURIComponent, document: doc,
      history: { replaceState(a, b, u) { hist.push(u); loc.href = new URL(u, loc.href).toString(); } },
      sessionStorage: { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; } },
      setTimeout: (fn, ms) => timers.push([fn, ms]) });
    vm.runInContext('const PLAY_APP_ID = "kr.onlybible.gocheok";\n' + f + 'promptOpenExternal();', ctx);
    return { loc, hist, timers, doc, bar: () => bar, listeners };
  };
  // 넘긴 뒤 창이 가려지면(앱 · 브라우저가 열렸다) 카톡 창을 닫는다(친구 2026-11-06 「카카오톡에서도 페이지가 열리는데 안 열리게」)
  const closeAfter = (s) => {
    assert.equal(s.listeners.length, 1, '가려지면 닫으려고 기다린다'); assert.equal(s.listeners[0][0], 'visibilitychange');
    s.doc.visibilityState = 'hidden'; s.listeners[0][1]();
    assert.equal(s.listeners.length, 0, '한 번만');
    const t = s.timers[s.timers.length - 1]; assert.equal(t[1], 300); t[0]();
    return s.loc.href;
  };
  const V = 'https://gocheok.onlybible.kr/?v=44';
  const browserIntent = 'intent://gocheok.onlybible.kr/?v=44#Intent;scheme=https;S.browser_fallback_url=' + encodeURIComponent(V) + ';end';
  // ① 처음 — 플레이 앱을 콕 집는다 · 앱이 없을 때 돌아올 주소는 같은 구절 + kx=1
  const s1 = {}, a = sim(V, ANDROID, s1);
  assert.equal(a.loc.href, 'intent://gocheok.onlybible.kr/?v=44#Intent;scheme=https;package=kr.onlybible.gocheok;S.browser_fallback_url=' + encodeURIComponent(V + '&kx=1') + ';end', '깔린 앱을 콕 집는다(?v= 구절 그대로)');
  assert.equal(s1.kakaoExtApp, '1'); assert.ok(!s1.kakaoExtTried2, '브라우저는 아직');
  assert.equal(a.timers.length, 1); assert.equal(a.timers[0][1], 2500);
  a.doc.visibilityState = 'hidden'; a.timers[0][0]();
  assert.ok(a.loc.href.includes('package=kr.onlybible.gocheok'), '앱이 열려 이 창이 가려졌으면 브라우저로 안 간다');
  assert.equal(closeAfter(a), 'kakaotalk://inappbrowser/close', '앱이 열린 뒤 카톡 창을 닫는다(안드로이드 주소 — 교회 어드민과 같다)');
  const s1b = {}, a2 = sim(V, ANDROID, s1b); a2.timers[0][0]();
  assert.equal(a2.loc.href, browserIntent, '2.5초 뒤에도 보이면(앱도 fallback 도 안 됐다) 기본 브라우저로');
  assert.equal(s1b.kakaoExtTried2, '1');
  // ② 앱이 없어 카톡이 fallback 을 이 창에 연 길 — 표를 떼고(?v= 는 남긴다) 브라우저로 · 앱은 다시 안 부른다
  const s2 = { kakaoExtApp: '1' }, b = sim(V + '&kx=1', ANDROID, s2);
  assert.deepEqual(b.hist, ['/?v=44'], '주소에서 kx 표만 뗀다(구절 바로가기는 loadVerses 가 읽는다)');
  assert.equal(b.loc.href, browserIntent, '기본 브라우저로 — kx 표 없이 · ?v= 그대로');
  assert.equal(b.timers.length, 0);
  assert.ok(b.bar() && b.bar().innerHTML.includes('href="' + browserIntent + '"'), '띠 단추는 브라우저 쪽');
  // 세션 저장이 안 되는 창 — 돌아온 길(kx=1)에서 앱을 또 부르면 앱 ↔ fallback 이 끝없이 돈다 → 표(kx)만 보고 브라우저로
  const n = sim(V + '&kx=1', ANDROID, null);
  assert.equal(n.loc.href, browserIntent, '세션 저장이 없어도 돌아온 길은 브라우저로(끝없는 넘김 없음)');
  // 같은 창에서 또 — 자동 전환은 한 번씩만(무한 넘김 막기) · 띠만
  const c = sim(V, ANDROID, { kakaoExtApp: '1', kakaoExtTried2: '1' });
  assert.equal(c.loc.href, V, '이미 둘 다 해 봤으면 다시 넘기지 않는다'); assert.ok(c.bar());
  assert.equal(c.listeners.length, 0, '넘기지 않았으면 카톡 창도 닫지 않는다(읽던 화면을 잃지 않게)');
  // 아이폰 — 카카오 외부 열기(사파리 · 아이폰 앱은 유니버설 링크가 없다)
  const d = sim(V, IPHONE, {});
  assert.equal(d.loc.href, 'kakaotalk://web/openExternal?url=' + encodeURIComponent(V)); assert.equal(d.timers.length, 0);
  assert.equal(closeAfter(d), 'kakaoweb://closeBrowser', '사파리가 열린 뒤 카톡 창을 닫는다(아이폰 주소)');
  // 카톡 밖이면 아무것도
  const e = sim(V, 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36', {});
  assert.equal(e.loc.href, V); assert.equal(e.bar(), null);
});

// 셋째 판(친구 2026-11-06 「앱이 열렸어요 · 카카오톡에서도 페이지가 열리는데 안 열리게 · 앱이 없으면 설치 페이지로」) — 카톡 카드 단추는 표 kk=1 을 단 우리 쪽으로.
test('카톡 카드에서 온 길(?kk=1 · routeKakaoCard) — 안드로이드: 깔린 앱을 콕 · 없으면 설치 안내 · 2.5초에도 보이면 설치 안내 · 카톡 창 닫기 / 아이폰: 「앱 설치」는 설치 안내 · 「말씀」은 사파리 길로', () => {
  const f = cut(APP, 'function kakaoCloseWhenHidden(ua) {', '\n}\n') + '\n}\n' + cut(APP, 'function routeKakaoCard() {', '\n}\n') + '\n}\n';
  const KAKAO_AND = 'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 KAKAOTALK 10.8.0';
  const CHROME_AND = 'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
  const KAKAO_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.0';
  const PC = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
  const sim = (href, ua, tp) => {
    const loc = { href, replaced: '', replace(u) { this.replaced = u; } }, hist = [], timers = [], listeners = [];
    const doc = { visibilityState: 'visible', addEventListener: (t, fn) => listeners.push([t, fn]), removeEventListener: (t, fn) => { const i = listeners.findIndex((x) => x[1] === fn); if (i >= 0) listeners.splice(i, 1); } };
    const ctx = vm.createContext({ navigator: { userAgent: ua, maxTouchPoints: tp || 0 }, location: loc, URL, encodeURIComponent, document: doc,
      history: { replaceState(a, b, u) { hist.push(u); loc.href = new URL(u, loc.href).toString(); } }, setTimeout: (fn, ms) => timers.push([fn, ms]) });
    const r = vm.runInContext('const PLAY_APP_ID = "kr.onlybible.gocheok";\n' + f + 'routeKakaoCard();', ctx);
    return { r, loc, hist, timers, listeners, doc };
  };
  const INSTALL = 'https://gocheok.onlybible.kr/install/';
  const appTo = (path) => 'intent://gocheok.onlybible.kr' + path + '#Intent;scheme=https;package=kr.onlybible.gocheok;S.browser_fallback_url=' + encodeURIComponent(INSTALL) + ';end';
  // 안드로이드 카톡 — 「말씀 외워 보기」(?v=44&kk=1)
  const a = sim('https://gocheok.onlybible.kr/?v=44&kk=1', KAKAO_AND);
  assert.equal(a.r, true, '카드 길이면 여기서 끝(아래 promptOpenExternal 은 안 탄다)');
  assert.deepEqual(a.hist, ['/?v=44'], '표 kk 만 뗀다(?v= 는 loadVerses 가 읽는다)');
  assert.equal(a.loc.href, appTo('/'), '깔린 앱을 콕 집어 첫 화면으로(친구 2026-11-06 「앱이 깔려 있으면 첫화면」 · 옛 카드의 구절 주소도) · 없으면 설치 안내');
  assert.equal(a.timers[0][1], 2500); a.timers[0][0]();
  assert.equal(a.loc.replaced, INSTALL, '2.5초가 지나도 창이 보이면(아무 일도 안 됐다) 설치 안내로');
  assert.equal(a.listeners.length, 1, '카톡 안이면 — 가려지면 카톡 창을 닫으려고 기다린다');
  const nT = a.timers.length; a.listeners[0][1]();   // 보이는 채로 바뀜 알림(돌아왔다 등)
  assert.equal(a.timers.length, nT, '창이 보이는 동안에는 닫지 않는다(읽던 화면을 잃지 않게)'); assert.equal(a.listeners.length, 1);
  a.doc.visibilityState = 'hidden'; a.listeners[0][1](); a.timers[a.timers.length - 1][0]();
  assert.equal(a.loc.href, 'kakaotalk://inappbrowser/close', '앱이 열린 뒤 카톡 창을 닫는다');
  // 안드로이드 카톡 — 「앱 설치」(?kk=1) — 깔려 있으면 앱 첫 화면 · 없으면 설치 안내
  const b = sim('https://gocheok.onlybible.kr/?kk=1', KAKAO_AND);
  assert.equal(b.loc.href, appTo('/'), '「앱 설치」 — 깔린 앱이면 그 앱 첫 화면');
  const b2 = sim('https://gocheok.onlybible.kr/?kk=1', KAKAO_AND); b2.doc.visibilityState = 'hidden'; b2.timers[0][0]();
  assert.equal(b2.loc.replaced, '', '앱이 열려 창이 가려졌으면 설치 안내로 안 간다');
  // 안드로이드 크롬(카톡 밖) — 같은 길 · 카톡 창이 없으니 닫기는 없다
  const c = sim('https://gocheok.onlybible.kr/?v=44&kk=1', CHROME_AND);
  assert.equal(c.r, true); assert.equal(c.loc.href, appTo('/')); assert.equal(c.listeners.length, 0, '카톡 밖이면 닫을 창이 없다');
  // 아이폰 카톡 — 앱이 깔렸는지 알 길이 없다: 「앱 설치」는 설치 안내 · 「말씀 외워 보기」는 promptOpenExternal(사파리)로 넘긴다
  const d = sim('https://gocheok.onlybible.kr/?kk=1', KAKAO_IOS);
  assert.equal(d.r, true); assert.equal(d.loc.replaced, INSTALL, '「앱 설치」 → 설치 안내');
  const e = sim('https://gocheok.onlybible.kr/?v=44&kk=1', KAKAO_IOS);
  assert.equal(e.r, true); assert.equal(e.loc.replaced, INSTALL, '아이폰은 무조건 설치 안내(친구 2026-11-06 — 옛 카드의 구절 주소도)');
  const ipad = sim('https://gocheok.onlybible.kr/?kk=1', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15', 5);
  assert.equal(ipad.r, true); assert.equal(ipad.loc.replaced, INSTALL, '아이패드(데스크톱 UA + 터치)도 설치 안내');
  // PC · 표 없음 — 아무것도 안 한다
  const g = sim('https://gocheok.onlybible.kr/?v=44&kk=1', PC);
  assert.equal(g.r, false); assert.equal(g.loc.replaced, ''); assert.ok(!g.loc.href.startsWith('intent:'));
  const h = sim('https://gocheok.onlybible.kr/?v=44', KAKAO_AND);
  assert.equal(h.r, false); assert.deepEqual(h.hist, [], '카드 표가 없으면 주소도 안 건드린다');
});

// ── 📊 이용 기록(2026-11-06 친구 「카카오 등의 공유를 누가 사용하는지」 · 설계 docs/superpowers/specs/2026-11-06-share-board-usage-log-design.md) ──
//   판 전체(「// ── 판(아래에서 올라온다) ──」부터 파일 끝)를 가짜 화면에 싣는다 — 그림은 그리지 않는다(pshDraw 가짜 · 판이 그린 셈).
//   logFeature 는 가짜(부른 그대로 적는다) · withLog: false 면 아예 없다(옛 app.js · vm) · 공유 창 · 복사 · 카카오도 가짜.
const PAN = (() => {
  const i = PS.indexOf('// ── 판(아래에서 올라온다) ──');
  assert.ok(i > 0, '판 머리를 못 찾았다 — 이 검사가 낡았다');
  return PS.slice(i);
})();
const usageTick = () => new Promise((r) => setTimeout(r, 5));
const usagePan = (o = {}) => {
  const logs = [], downloads = [], kakaoSent = [], els = {};
  const mk = (id) => {
    const el = { id, hidden: false, disabled: false, textContent: '', innerHTML: '', value: '', src: '', alt: '', dataset: {}, style: {}, isConnected: true, on: {},
      classList: { add() {}, remove() {}, toggle() {} },
      addEventListener(ev, fn) { el.on[ev] = fn; }, removeEventListener() {}, setAttribute() {},
      querySelector: (sel) => (sel[0] === '#' ? els[sel.slice(1)] || null : sel === '.psh-x' ? mk('psh-x') : null),
      querySelectorAll: () => [],
      click() { if (el.download) downloads.push(el.download); },
      remove() { el.isConnected = false; if (el.id === 'psh') for (const k of Object.keys(els)) delete els[k]; } };
    return el;
  };
  const doc = {
    visibilityState: 'hidden', head: { appendChild() {} }, addEventListener() {}, removeEventListener() {},
    createElement: () => mk(''),
    getElementById: (id) => els[id] || null,
    // 판(id="psh")이 붙으면 그 안의 id 칸을 만든다 — innerHTML 에 있는 것만(이름 칸은 기도문 · 카카오 단추는 말씀 판 + 키 + 카톡 기기)
    body: { classList: { add() {}, remove() {} }, appendChild(w) {
      if (w.id !== 'psh') return;
      els.psh = w;
      for (const id of ['psh-name', 'psh-img', 'psh-kakao', 'psh-send', 'psh-hint', 'psh-msg']) if (w.innerHTML.includes('id="' + id + '"')) els[id] = mk(id);
    } },
  };
  const nav = { userAgent: o.kakao ? 'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'
                                   : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
    maxTouchPoints: 0, onLine: true, can: true, next: 'ok', clip: 'ok', shared: [], copied: [],
    canShare: () => nav.can,
    share: (d) => { nav.shared.push(d); return nav.next === 'ok' ? Promise.resolve() : Promise.reject(Object.assign(new Error('x'), { name: nav.next })); },
    clipboard: { writeText: (t) => { nav.copied.push(t); return nav.clip === 'ok' ? Promise.resolve() : Promise.reject(new Error('x')); } } };
  const Kakao = { fail: false, upFail: false, isInitialized: () => true, init() {},
    Share: { uploadImage: () => (Kakao.upFail ? Promise.reject(new Error('x')) : Promise.resolve({ infos: { original: { url: 'https://k.kakaocdn.net/u.jpg' } } })),
             sendDefault: (t) => { if (Kakao.fail) throw new Error('x'); kakaoSent.push(t); } } };
  class File { constructor(parts, name, opt) { this.parts = parts; this.name = name; this.type = opt.type; } }
  const VERSE_SHARE_TEXT = '성경암송 앱 설치 https://gocheok.onlybible.kr/go/app/';
  const g = { document: doc, navigator: nav, File, VERSE_SHARE_TEXT, APP_BUILD: 'T', KAKAO_JS_KEY: o.kakao ? 'k' : '',
    window: { Kakao: o.kakao ? Kakao : undefined, addEventListener() {}, removeEventListener() {} },
    history: { state: null, pushState(s) { this.state = s; }, back() { this.state = null; } },
    requestAnimationFrame: () => 0, URL: { createObjectURL: () => 'blob:psh', revokeObjectURL() {} },
    setTimeout: (fn, ms) => (ms >= 1000 ? 0 : setTimeout(fn, ms)),   // 1초 넘는 타이머(20초 한도 · 6초 「안 열렸으면」)는 울리지 않는다
    clearTimeout: (t) => { if (t) clearTimeout(t); },
    prayEsc: (s) => String(s), pshDraw: () => Promise.resolve({ size: 10 }) };
  if (o.withLog !== false) g.logFeature = (...a) => { logs.push(a); };
  const S = vm.runInContext(FILL + '\n' + PURE + '\n' + DOCS + '\n' + PAN +
    '\n;({ pshState, pshKind, openPrayShare, openMedShare, openVerseShare, prayShareClose, pshSend, pshSendLink, pshCopyLink, pshDownload, pshKakaoSend })', vm.createContext(g));
  return { S, logs, downloads, kakaoSent, els, nav, Kakao, VERSE_SHARE_TEXT };
};

test('📊 이용 기록 ① 판 열기(share-open) — 새 판만(다시 쓰는 판은 안 셈) · 종류 코드 1 기도문 · 2 묵상 · 3 말씀 · 묵상 미리보기(noLog)는 안 셈 · 이름 칸 값은 안 실림 · logFeature 가 없어도', async () => {
  const md = Object.assign({}, MEDS[0], { no: 44, idx: 2 }), vv = VERSES.find((v) => String(v.text || '').trim());
  const P = usagePan();
  P.S.openPrayShare(LIST[0], '김세웅');
  assert.deepEqual(P.logs, [['share-open', 1]], '기도문 판을 새로 열었다');
  P.S.openPrayShare(LIST[0], '김세웅');   // 두 번 누름 — 열린 판을 다시 쓴다(pshReuse)
  assert.equal(P.logs.length, 1, '다시 쓰는 판은 세지 않는다');
  P.S.openMedShare(md); P.S.openMedShare(md);   // 다른 판이라 닫고 새로 · 그다음은 다시 쓰기
  P.S.openVerseShare(vv); P.S.openVerseShare(vv);
  assert.deepEqual(P.logs, [['share-open', 1], ['share-open', 2], ['share-open', 3]], '새로 연 판마다 한 번 · 종류 코드 1 · 2 · 3');
  // 관리자 묵상 미리보기(app.js showMeditationModal 의 source "preview" → openMedShare(m, { preview: true })) — 새로 열어도 · 다시 써도 남기지 않는다
  P.S.prayShareClose();
  P.S.openMedShare(md, { preview: true });
  assert.equal(P.S.pshState.noLog, true, '미리보기 판 표식');
  assert.equal(P.logs.length, 3, '미리보기 판 열기는 안 셈');
  P.S.openMedShare(md);
  assert.equal(P.S.pshState.noLog, false, '다시 쓸 때도 여는 쪽 규칙으로 덮어쓴다');
  P.S.openMedShare(md, { preview: true });
  assert.equal(P.S.pshState.noLog, true);
  assert.equal(P.logs.length, 3, '다시 쓰는 판은 미리보기가 아니어도 판 열기로 안 셈');
  P.S.openPrayShare(LIST[0], '김세웅');
  assert.equal(P.S.pshState.noLog, false, '미리보기 다음에 새로 연 기도문 판에는 표식이 없다');
  assert.deepEqual(P.logs.slice(3), [['share-open', 1]]);
  for (const a of P.logs) assert.equal(a.length, 2, '(값, 종류 코드) 둘만');
  assert.ok(!JSON.stringify(P.logs).includes('김세웅'), '이름 칸 값은 싣지 않는다');
  // pshKind — pshDoc 과 같은 가름(묵상 → 말씀 → 기도문)
  P.S.pshState.med = md; P.S.pshState.verse = vv; assert.equal(P.S.pshKind(), 2);
  P.S.pshState.med = null; assert.equal(P.S.pshKind(), 3);
  P.S.pshState.verse = null; assert.equal(P.S.pshKind(), 1);
  assert.match(PS, /function pshLog\(feature, item\) \{ if \(pshState\.noLog\) return; if \(typeof logFeature === "function"\) logFeature\(feature, item\); \}/, 'logFeature 는 typeof 뒤에서(옛 app.js · vm 에는 없다)');
  assert.ok(!/서버로 아무것도 가지 않는다/.test(PS), '머리 주석 — 이용 기록이 서버로 간다(사실대로)');
  // logFeature 가 없는 화면(옛 app.js · vm)에서도 판은 열린다
  const Q = usagePan({ withLog: false });
  assert.doesNotThrow(() => { Q.S.openPrayShare(LIST[0], '김세웅'); Q.S.openMedShare(md); Q.S.openVerseShare(vv); });
  assert.equal(Q.els.psh.dataset.kind, 'verse', '판이 떠 있다');
  await usageTick();
});
