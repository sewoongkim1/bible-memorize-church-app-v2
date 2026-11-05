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
const T = vm.runInContext(FILL + '\n' + PURE + '\n' + DOCS + '\n;({ VERSE_FRAMES, verseFrameChoices, verseFrameStyle, prayShareDoc, medShareDoc, verseShareDoc, verseSharePlan, verseShareDate, verseShareFoot, verseShareByline, VERSE_KICKER, prayFill, prayChunks, PRAY_AMEN, prayShareName, prayShareRuns, prayShareWrap, praySharePlan, prayShareChoices, prayShareMark, PRAY_SHARE_STYLES, PRAY_SHARE_PHOTOS, PSH_MARK, PSH_FLOOR, PSH_MIN, PSH_MAX, PSH_W, PSH_H, medShareRuns, medShareParas, medShareFoot, medShareDate, medShareByline, medSharePlan, MED_KICKER, MED_QLABEL })', vm.createContext({}));

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
  assert.match(send, /navigator\.share\(\{ files: \[file\] \}\)/);
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
  assert.match(tap, /openMedShare\(m\)/);
  assert.match(tap, /preacher: \(sermon && sermon\.preacher\) \|\| "", sermonDate: \(sermon && sermon\.date\) \|\| ""/, '맨 아래 둘째 줄 — 설교하신 분 · 설교 날짜');
  assert.match(tap, /verseRef: \(verse && \(verse\.refFull \|\| verse\.refShort\)\)/, '구절은 긴 한국어 표기(「누가복음 17장 16절」) — 영어 모드와 상관없이 · 줄임말(「눅」)은 받는 분께 낯설다');
  assert.match(PS, /function openMedShare\(m\) \{/);
  assert.match(PS, /pshOpen\(PSH_TITLE_MED, false, "", "med"\)/, '묵상 판은 이름 칸 없이');
});

test('보내기 판 — 폰에서 「보내기」가 아래로 숨지 않는다(친구 2026-11-04 · 갤럭시) — 미리보기는 화면 높이에 맞춰 줄고 · 단추는 판 아래에 붙는다', () => {
  const CSS = read('style.css');
  assert.match(CSS, /\.psh-send \{ position: sticky; bottom: 0;/, '단추가 판 아래에 붙는다(sticky)');
  assert.match(CSS, /\.psh-pv \{ width: min\(100%, 300px, max\(180px, calc\(\(100vh - 420px\) \* \.8\)\)\); \}/, '미리보기 폭이 화면 높이를 따른다');
  assert.match(CSS, /@supports \(height: 100dvh\) \{\n  \.psh-sheet \{ max-height: 94dvh; \}/, '주소창이 있는 브라우저 — dvh');
  // 단추 자리는 미리보기 바로 다음(sticky 가 붙을 자리) — 판 짜임이 바뀌면 이 시험도 함께
  const pv = PS.indexOf('<div class="psh-pv">'), send = PS.indexOf('id="psh-send"');
  assert.ok(pv > 0 && send > pv && send - pv < 120, '보내기는 미리보기 바로 아래');
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
  const op = cut(PS, 'function openPrayShare(b, name) {', '\n}\n'), om = cut(PS, 'function openMedShare(m) {', '\n}\n');
  assert.match(op, /prayShareClose\(\);\n  pshState\.b = b; pshState\.med = null;/, '묵상을 보낸 뒤에도 기도문 판은 기도문을(prayShareClose 는 med 를 안 지운다)');
  assert.match(op, /pshOpen\(PSH_TITLE_PRAY, true, name, "pray"\);/, '기도문 판 — 제목 · 이름 칸');
  assert.match(op, /pshState\.b = b; pshState\.med = null; pshState\.verse = null;/, '말씀을 보낸 뒤에도 기도문 판은 기도문을');
  assert.match(om, /pshState\.b = null; pshState\.med = m;/);
  assert.match(cut(PS, 'function pshOpen(', '\n}\n'), /const inp = wrap\.querySelector\("#psh-name"\);\n  if \(inp\) \{/, '이름 칸 없는 묵상 판에서 넘어지지 않게');
});

test('두 번 누름 — 판이 열렸다가 스스로 닫히지 않는다(열린 같은 판은 다시 쓴다) · 창 단추는 한 번만 · 공유 중 또 누르면 내려받기로 가지 않는다', () => {
  const op = cut(PS, 'function openPrayShare(b, name) {', '\n}\n'), om = cut(PS, 'function openMedShare(m) {', '\n}\n');
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
  assert.match(tap, /if \(typeof openMedShare === "function"\) openMedShare\(m\);/, '받기에 실패해도 withLazyJs 는 부른다');
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
  assert.equal(T.verseShareByline({ pastor: '차동혁 담임목사', date: '2026-10-31T15:00:00+00:00' }), '차동혁 담임목사 · 2026년 11월 1일');
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
      const want = flat(T.VERSE_KICKER) + flat(v.text) + flat(v.refFull || v.refShort) + flat(T.verseShareFoot(v)) + flat(T.verseShareByline(v));   // 말씀이 먼저 · 구절 자리는 그 아래
      assert.equal(flat(tx.map((o) => o.s).join('')), want, at + ' 글자');
      assert.equal(tx[0].s, T.VERSE_KICKER); assert.equal(tx[0].color, S.accent, at + ' 「이번 주 말씀」은 강조색');
      assert.ok(flat(tx.map((o) => o.s).join('')).endsWith(flat(T.verseShareByline(v))) && tx[tx.length - 1].color === S.sub, at + ' 맨 끝은 설교하신 분 · 날짜');
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
  assert.match(top, /\$\{verseShareVisible\(\) \? `<button type="button" class="weekly-share-ic" id="weekly-share-ic" aria-label="이번 주 말씀 카톡·문자로 보내기"/, '문 안에서만 · 읽어 주는 이름');
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
  assert.ok(!/psh-link|주소로 보내기<\/button>/.test(po), '「🔗 주소로 보내기」는 뺐다(친구 2026-11-05 — 카톡이 큰 미리보기 상자를 붙였다 · 설치 주소는 그림 아래 한 줄)');
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
    assert.ok(st.max <= 48 && st.min >= 28, '글씨 28~48px(같은 날 「글자도 키워」)');
    assert.ok(st.box.x > 0 && st.box.x + st.box.w < st.W && st.box.y > 0 && st.box.bottom < st.H, c.key + ' 글 자리가 그림 안');
    const mk = T.prayShareMark(st.W, st.mark);
    assert.ok(mk.x > st.box.x && mk.x + mk.w < st.W && mk.y > 0 && mk.y < st.box.y + 80, c.key + ' 마크는 안쪽 오른쪽 위');
    for (const v of VERSES) {
      const p = T.verseSharePlan(v, st, measure), at = c.label + ' 구절' + v.no;
      assert.ok(p.fit && p.bottom <= p.limit + 0.5, at + ' 넘침 ' + p.bottom + ' > ' + p.limit);
      assert.ok(p.limit <= st.floor, at + ' 바닥');
      assert.ok(p.size >= st.min && p.size <= st.max, at + ' 글씨 ' + p.size);
      assert.ok(p.top >= st.box.y - 0.5, at + ' 위로 넘침');
      const tx = p.ops.filter((o) => o.k === 'text');
      for (const o of tx) assert.ok(o.x >= st.box.x - 0.5 && o.x + o.w <= st.box.x + st.box.w + 0.5, at + ' 가로 넘침: ' + o.s);
      for (const q of p.rects) assert.ok(!meet(q, p.keep), at + ' 글이 마크 둘레에 닿는다');
      const want = flat(T.VERSE_KICKER) + flat(v.text) + flat(v.refFull || v.refShort) + flat(T.verseShareFoot(v)) + flat(T.verseShareByline(v));
      assert.equal(flat(tx.map((o) => o.s).join('')), want, at + ' 글자');
      const mo = p.ops.find((o) => o.k === 'mark');
      assert.equal(mo.x, mk.x); assert.equal(mo.w, 62, '마크는 작게(62×76)');
      const no = p.ops.filter((o) => o.k === 'note');
      assert.equal(no.length, 1, at + ' 액자 아래 설치 주소 한 줄');
      assert.ok(/gocheok\.onlybible\.kr\/install/.test(no[0].s), at + ' 설치 주소');
      assert.ok(no[0].y > st.box.bottom && no[0].y < st.H, at + ' 글 자리 아래 · 그림 안');
      assert.ok(Math.abs(no[0].x + no[0].w / 2 - st.W / 2) <= 1 && no[0].w <= st.W - 120, at + ' 가운데 · 폭 안');
      assert.equal(mo.disc, !!st.disc);
    }
  }
  // 판 — 말씀은 말씀 액자만 · 고른 액자는 따로 기억(기도문 · 묵상의 「밤하늘 먼저」와 섞이지 않게)
  assert.match(PS, /function pshChoices\(\) \{ return pshState\.verse \? verseFrameChoices\(\) : prayShareChoices\(\); \}/);
  assert.match(PS, /function pshKeyGet\(\) \{ return pshState\.verse \? pshState\.vkey : pshState\.key; \}/);
  assert.match(PS, /if \(style && typeof style === "object"\) \{/, '액자 그림을 바탕 가득');
  assert.match(PS, /cv\.width = st\.W \|\| PSH_W; cv\.height = st\.H \|\| PSH_H;/, '정사각형 바탕');
});
