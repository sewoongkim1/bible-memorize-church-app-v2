# 가정 축복 기도문 — 카톡·문자로 보내기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기도문 화면에서 이름·배경을 골라 그림 한 장(1080×1350 JPEG)을 만들고 폰 공유 창으로 카톡·문자에 보낸다.

**Architecture:** 새 지연 모듈 `js/pray-share.js` 하나에 ① 순수 배치(글 토막 · 줄 접기 · 글씨 크기 셈 → 그릴 것 목록) ② 캔버스 그리기 ③ 아래에서 올라오는 판을 둔다. `js/prayer.js` 는 문(🧪 시험 참여자) 안에서 단추 하나만 더하고 `withLazyJs("prayShare")` 로 연다. 서버 · SQL 은 건드리지 않는다.

**Tech Stack:** Vanilla JS(프레임워크 없음) · Canvas 2D · Web Share API(files) · node:test(꾸러미 없음 · preflight)

설계: `docs/superpowers/specs/2026-11-04-prayer-share-design.md`

## Global Constraints

- 그림 1080 × 1350 · JPEG 품질 0.9 · 맨 아래 가운데 교회 마크(`img/logo-mark.png`)만 — 글씨 없음.
- 기도문 글씨 46px → 2px 씩 → 28px(1080 폭 기준) · 줄 간격 1.7 · 제목 ×1.45 · 말씀 자리 ×0.8 · 28px 로도 넘치면 상자를 마크 위까지 늘린다.
- 이름 채우기는 app.js `prayFill` 만 — 따로 치환 금지(ㄹ 받침 「김윤월로」). 이름은 12자까지 · `<` `>` 는 걷는다 · 비면 「우리 가정」.
- 줄은 낱말(띄어쓰기) 단위로 접는다 — 한 줄보다 긴 낱말만 글자로.
- 공유는 「보내기」 탭 안에서 **미리 만든 Blob** 으로 `navigator.share({ files })` — 탭 안에서 그림을 새로 만들지 않는다. `title`·`text` 없음.
- 문: `PRAY_SHARE_PUBLIC = false`(js/prayer.js) · `PRAY_SHARE_PUBLIC || ministryTesterCached()` 일 때만 단추를 그린다.
- 공용 파일(`app.js`·`style.css`·`index.html`)은 경로를 못 박아 커밋 · 다른 세션이 같은 파일을 고치는 중이면 `git apply --cached` 로 내 헝크만.
- 새 글자색을 `--navy` 등 토큰으로 쓰면 `.dark` 짝 — 이 계획은 값으로 쓰고 `.dark` 짝을 모두 둔다.
- lookbehind 정규식 금지(사파리 16.4 미만에서 앱이 죽는다).

## 파일

| 파일 | 할 일 |
|---|---|
| `js/pray-share.js`(새) | 순수 구간 · 그리기 · 판 · 보내기 |
| `tests/pray-share.test.cjs`(새) | 순수 구간 · 배선 시험 |
| `app.js` | `LAZY_JS.prayShare` 한 줄 |
| `js/prayer.js` | 문 상수 · 단추 · 누르면 열기 · 화면을 다시 그릴 때 판 닫기 |
| `style.css` | `.pr-share` · `.psh-*`(판) · `.dark` 짝 |
| `tools/preflight.py` | `PURE_TESTS += ["tests/pray-share.test.cjs"]` |
| `docs/notes/prayer-book.md` · `CLAUDE.md` | 끝에 「2026-11 보내기」 · 표의 기도문 줄 한 마디 |
| `img/share/*.webp`(Task 4) | 풍경 사진(친구가 고른 것) + 작은 그림 |

---

### Task 1: 순수 배치 — 토막 · 줄 접기 · 글씨 크기 셈

**Files:**
- Create: `js/pray-share.js`(순수 구간만 — 표식 `// ── 기도문 그림 — 순수 (여기부터) ──` ~ `(여기까지) ──`)
- Create: `tests/pray-share.test.cjs`
- Modify: `tools/preflight.py`(PURE_TESTS 끝 · verse-badge · tts-ko-num 다음)

**Interfaces:**
- Consumes: app.js `prayJong(name)` · `prayFill(t, name)` · `PRAY_AMEN` · `prayChunks(t)`(문장 배열 · 끝에 맺음말)
- Produces:
  - `PSH_W=1080` · `PSH_H=1350` · `PSH_MAX=46` · `PSH_MIN=28` · `PSH_STEP=2` · `PSH_LH=1.7` · `PSH_MARK={w:59,h:72,bottom:62}`
  - `PRAY_SHARE_STYLES` — `{ frame, leaf, night, photo }` 각 `{ label, family, align:"center"|"left", valign:"center"|"bottom", ink, accent, sub, orn|null, bar|null, shadow?, box:{x,y,w,bottom}, wBody, wBold }`
  - `PRAY_SHARE_PHOTOS` — `[{ id, label }]`(Task 4 까지 빈 배열)
  - `prayShareName(n) → string`
  - `prayShareRuns(sentence, name) → [{ s, a }]`(a = 이름 자리)
  - `prayShareWrap(runs, maxW, measure(s, a)) → [[{ s, a }]]`
  - `praySharePlan(b, name, styleKey, measure(s, font)) → { size, fit, bottom, limit, ops, box }` · ops = `{k:"text",s,x,y,w,font,color}` | `{k:"orn",x,y,w,color}` | `{k:"bar",x,y,w,color}` | `{k:"mark",x,y,w,h}`
  - `prayShareChoices() → [{ key, style, label, src?, thumb? }]`

- [ ] **Step 1: 실패하는 시험을 쓴다** — `tests/pray-share.test.cjs`

```js
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
  assert.deepEqual(c.slice(0, 3).map((x) => x.key), ['frame', 'leaf', 'night']);
  assert.equal(c.length, 3 + T.PRAY_SHARE_PHOTOS.length);
  for (const p of c.slice(3)) {
    assert.equal(p.style, 'photo');
    assert.match(p.src, /^img\/share\/[a-z0-9-]+\.webp$/);
    assert.ok(fs.existsSync(path.join(__dirname, '..', p.src)), p.src + ' 가 없다');
    assert.ok(fs.existsSync(path.join(__dirname, '..', p.thumb)), p.thumb + ' 가 없다');
  }
});
```

- [ ] **Step 2: 시험을 돌려 실패를 본다**

Run: `node --test tests/pray-share.test.cjs`
Expected: FAIL — `ENOENT … js/pray-share.js`

- [ ] **Step 3: 순수 구간을 쓴다** — `js/pray-share.js`(파일 머리 + 순수 구간)

```js
// 📤 가정 축복 기도문 — 카톡·문자로 보내기(2026-11-04 친구 · 설계 docs/superpowers/specs/2026-11-04-prayer-share-design.md)
//   기도문 화면(js/prayer.js)의 「📤 카톡·문자로 보내기」를 누를 때 받는다(app.js LAZY_JS.prayShare — 기도문 화면이 무거워지지 않게).
//   그림은 이 폰 안에서만 만든다(캔버스) → 폰 공유 창(navigator.share files). 서버로 아무것도 가지 않는다 — 판에서 바꾼 이름도 그림에만 쓴다.
//   ⚠️ 이름 채우기는 app.js prayFill(받침 · ㄹ 받침 규칙) — 따로 치환하지 말 것(docs/notes/prayer-book.md).
//   ⚠️ 공유는 「보내기」를 누른 그 탭 안에서 — 그래서 그림은 미리보기를 그릴 때 이미 만들어 둔다(pshState.blob).

// ── 기도문 그림 — 순수 (여기부터) ──
const PSH_W = 1080, PSH_H = 1350;
const PSH_MAX = 46, PSH_MIN = 28, PSH_STEP = 2, PSH_LH = 1.7;   // 기도문 글씨(1080 폭 기준) — 큰 데서 줄여 내려간다
const PSH_SERIF = '"Nanum Myeongjo", serif', PSH_SANS = '"Noto Sans KR", sans-serif';
const PSH_MARK = { w: 59, h: 72, bottom: 62 };   // 교회 마크(img/logo-mark.png 108×132) — 맨 아래 가운데 · 글씨 없음(친구)
// 배경 넷 — box 는 글 상자(1080×1350 위의 자리). valign: 글 덩이를 상자 가운데(center) / 아래(bottom).
//   액자는 아래 두 귀퉁이에 잎가지가 있어 상자 바닥을 올렸다. 사진은 글을 아래쪽 어두운 막 위에 둔다.
const PRAY_SHARE_STYLES = {
  frame: { label: "액자", family: PSH_SERIF, align: "center", valign: "center", ink: "#1e3264", accent: "#a0701c", sub: "#5b6b8c",
           orn: "#b08a3e", bar: null, box: { x: 150, y: 150, w: 780, bottom: 1040 }, wBody: 700, wBold: 800 },
  leaf:  { label: "잎", family: PSH_SANS, align: "left", valign: "center", ink: "#263a2c", accent: "#8a6a1f", sub: "#4d6a55",
           orn: null, bar: "#8a6a1f", box: { x: 120, y: 330, w: 840, bottom: 1150 }, wBody: 500, wBold: 800 },
  night: { label: "밤하늘", family: PSH_SERIF, align: "center", valign: "center", ink: "#f4ecd8", accent: "#f0d48a", sub: "#c9d3ea",
           orn: "#d9bd72", bar: null, box: { x: 130, y: 150, w: 820, bottom: 1150 }, wBody: 700, wBold: 800 },
  photo: { label: "사진", family: PSH_SANS, align: "left", valign: "bottom", ink: "#ffffff", accent: "#ffe08a", sub: "#f1ece4",
           orn: null, bar: null, shadow: true, box: { x: 110, y: 380, w: 860, bottom: 1160 }, wBody: 500, wBold: 800 },
};
// 풍경 사진(AI 그림 · 친구가 고른 것) — img/share/<id>.webp(1080×1350) + <id>-t.webp(작은 그림). 더하면 시험이 파일이 있는지 본다.
const PRAY_SHARE_PHOTOS = [];
function prayShareChoices() {
  const out = [
    { key: "frame", style: "frame", label: "액자" },
    { key: "leaf", style: "leaf", label: "잎" },
    { key: "night", style: "night", label: "밤하늘" },
  ];
  PRAY_SHARE_PHOTOS.forEach((p) => out.push({ key: "photo:" + p.id, style: "photo", label: p.label,
    src: "img/share/" + p.id + ".webp", thumb: "img/share/" + p.id + "-t.webp" }));
  return out;
}
// 판에서 친 이름 — 12자(👤 이름 칸 askPrayName 과 같다) · <> 는 걷는다(이름 표식과 겹치지 않게) · 비면 「우리 가정」(renderPrayerBook 과 같다)
function prayShareName(n) {
  const s = String(n == null ? "" : n).replace(/[<>\u0001\u0002]/g, "").replace(/\s+/g, " ").trim().slice(0, 12).trim();
  return s || "우리 가정";
}
// 한 문장 → [{ s, a }] 토막(a = 이름 자리 · 강조). 이름 둘레에 태그 꼴 표식을 넣어 prayFill 에 넘기면
//   prayJong 이 태그를 걷어 내고 진짜 이름의 끝 글자로 받침을 본다(prayFillHtml 과 같은 길) — 조사가 화면과 같다.
const PSH_NA = "<\u0001>", PSH_NB = "<\u0002>";
function prayShareRuns(sentence, name) {
  const filled = prayFill(sentence, PSH_NA + name + PSH_NB);
  const out = [];
  filled.split(PSH_NA).forEach((part, k) => {
    if (k === 0) { if (part) out.push({ s: part, a: false }); return; }
    const j = part.indexOf(PSH_NB);
    const nm = j < 0 ? part : part.slice(0, j), rest = j < 0 ? "" : part.slice(j + PSH_NB.length);
    if (nm) out.push({ s: nm, a: true });
    if (rest) out.push({ s: rest, a: false });
  });
  return out;
}
// 토막 → 낱말(띄어쓰기로 가른 것). 한 낱말 안에 이름과 조사가 붙어 있을 수 있다(「김세웅에게」 = 강조 + 보통).
function prayShareWords(runs) {
  const words = []; let cur = [];
  runs.forEach((r) => {
    String(r.s).split(/(\s+)/).forEach((t) => {
      if (!t) return;
      if (/^\s+$/.test(t)) { if (cur.length) { words.push(cur); cur = []; } return; }
      cur.push({ s: t, a: r.a });
    });
  });
  if (cur.length) words.push(cur);
  return words;
}
function prayShareMerge(line) {
  const out = [];
  line.forEach((p) => { const l = out[out.length - 1]; if (l && l.a === p.a) l.s += p.s; else out.push({ s: p.s, a: p.a }); });
  return out;
}
// 낱말 단위로 줄을 접는다(화면의 word-break: keep-all 과 같다) — 한 줄보다 긴 낱말만 글자로 끊는다.
//   measure(s, a) → 폭(px) · a 는 강조(굵은) 글씨인가. 돌려주는 것: 줄마다 [{ s, a }](같은 꼴 토막은 합친다).
function prayShareWrap(runs, maxW, measure) {
  const sp = measure(" ", false);
  const lines = []; let line = [], lw = 0;
  const flush = () => { if (line.length) lines.push(prayShareMerge(line)); line = []; lw = 0; };
  const put = (w, ww) => {
    if (line.length) { line.push({ s: " ", a: false }); lw += sp; }
    w.forEach((p) => line.push({ s: p.s, a: p.a }));
    lw += ww;
  };
  prayShareWords(runs).forEach((w) => {
    const ww = w.reduce((t, p) => t + measure(p.s, p.a), 0);
    if (line.length && lw + sp + ww <= maxW) { put(w, ww); return; }
    if (ww <= maxW) { flush(); put(w, ww); return; }
    flush();   // 한 줄보다 긴 낱말 — 글자로
    w.forEach((p) => {
      for (const ch of p.s) {
        const cw = measure(ch, p.a);
        if (line.length && lw + cw > maxW) flush();
        line.push({ s: ch, a: p.a }); lw += cw;
      }
    });
  });
  flush();
  return lines;
}
// 그릴 것 목록 — measure(s, font) → 폭(px). 기도문 글씨는 PSH_MAX 에서 PSH_STEP 씩 줄여 상자에 들어갈 때까지(PSH_MIN 까지) ·
//   PSH_MIN 으로도 넘치면 상자 바닥을 마크 위까지 내린다. 돌려주는 것:
//   { size, fit, bottom(글 끝), limit(넘으면 안 되는 바닥), box, ops: [text · orn · bar · mark] } — 글은 textBaseline "middle" 의 y.
function praySharePlan(b, name, styleKey, measure) {
  const st = PRAY_SHARE_STYLES[styleKey] || PRAY_SHARE_STYLES.frame;
  const nm = prayShareName(name);
  const font = (size, bold) => (bold ? st.wBold : st.wBody) + " " + size + "px " + st.family;
  const markTop = PSH_H - PSH_MARK.bottom - PSH_MARK.h;
  const chunks = prayChunks(b && b.prayer);   // 끝에 맺음말(PRAY_AMEN)이 붙어 온다
  const lay = (size) => {
    const rows = [];
    const add = (runs, sz, lh, bold, color, gap) => {
      const m = (s, a) => measure(s, font(sz, bold || a));
      prayShareWrap(runs, st.box.w, m).forEach((pieces, k) => rows.push({ pieces, size: sz, lh, bold, color, gap: k === 0 ? gap : 0 }));
    };
    add([{ s: String((b && b.title) || ""), a: false }], Math.round(size * 1.45), 1.3, true, st.ink, 0);
    add([{ s: String((b && b.ref) || ""), a: false }], Math.round(size * 0.8), 1.5, false, st.sub, Math.round(size * 0.2));
    const bodyStart = rows.length;
    const ornGap = (st.orn || st.bar) ? Math.round(size * 1.6) : Math.round(size * 0.9);
    chunks.forEach((c, k) => {
      const last = k === chunks.length - 1;
      add(last ? [{ s: c, a: true }] : prayShareRuns(c, nm), size, PSH_LH, false, st.ink, k === 0 ? ornGap : Math.round(size * 0.5));
    });
    const h = rows.reduce((t, r) => t + r.gap + r.size * r.lh, 0);
    return { rows, h, bodyStart, ornGap };
  };
  let size = PSH_MAX, L = lay(size);
  const boxH = st.box.bottom - st.box.y;
  while (L.h > boxH && size > PSH_MIN) { size -= PSH_STEP; L = lay(size); }
  const limit = L.h <= boxH ? st.box.bottom : markTop - 24;
  const room = limit - st.box.y;
  let y = st.valign === "bottom" ? limit - L.h : st.box.y + (room - L.h) / 2;
  if (L.h > room) y = st.box.y;
  const ops = [];
  L.rows.forEach((r, k) => {
    y += r.gap;
    if (k === L.bodyStart && st.orn) ops.push({ k: "orn", x: PSH_W / 2, y: Math.round(y - L.ornGap / 2), w: Math.round(size * 3.2), color: st.orn });
    if (k === L.bodyStart && st.bar) ops.push({ k: "bar", x: st.box.x, y: Math.round(y - L.ornGap / 2), w: Math.round(size * 1.3), color: st.bar });
    const lineH = r.size * r.lh, cy = y + lineH / 2;
    const ws = r.pieces.map((p) => measure(p.s, font(r.size, r.bold || p.a)));
    const tw = ws.reduce((t, w) => t + w, 0);
    let x = st.align === "center" ? st.box.x + (st.box.w - tw) / 2 : st.box.x;
    r.pieces.forEach((p, j) => {
      ops.push({ k: "text", s: p.s, x, y: Math.round(cy), w: ws[j], font: font(r.size, r.bold || p.a), color: p.a ? st.accent : r.color });
      x += ws[j];
    });
    y += lineH;
  });
  ops.push({ k: "mark", x: (PSH_W - PSH_MARK.w) / 2, y: markTop, w: PSH_MARK.w, h: PSH_MARK.h });
  return { size, fit: y <= limit + 0.5, bottom: y, limit, box: st.box, ops };
}
// ── 기도문 그림 — 순수 (여기까지) ──
```

- [ ] **Step 4: 시험을 돌려 통과를 본다**

Run: `node --test tests/pray-share.test.cjs`
Expected: PASS(6가지). 넘침이 나면 배경의 `box` 를 고치지 말고 먼저 어느 편 · 어느 배경인지 보고 — 상자 값은 Task 2 의 눈 확인에서 함께 고른다.

- [ ] **Step 5: preflight 에 넣고 커밋**

`tools/preflight.py` 의 `PURE_TESTS += ["tests/tts-ko-num.test.cjs"]` 다음 줄에:
```python
# 📤 가정 축복 기도문 보내기(2026-11-04) — 그림 배치(104편 × 배경 넷 × 이름 셋 · 상자 안 · 조사 · 글자 안 잃기) · 배선(지연 · 문 · 미리 만든 Blob)
PURE_TESTS += ["tests/pray-share.test.cjs"]
```
```bash
python tools/preflight.py   # 「모두 통과」
git add -- js/pray-share.js tests/pray-share.test.cjs tools/preflight.py
git commit -m "feat(기도문 보내기): 그림 배치 순수 함수 …"
```
⚠️ 이 커밋만으로는 아무 데서도 부르지 않는다(지연 모듈 · 단추 없음) — 푸시해도 성도님 화면은 그대로다.

---

### Task 2: 그리기 · 판 · 단추(🧪 문 안)

**Files:**
- Modify: `js/pray-share.js`(순수 구간 아래에 그리기 · 판 · 보내기)
- Modify: `app.js` — `LAZY_JS` 에 한 줄
- Modify: `js/prayer.js` — 문 상수 · `drawPrayer` 단추 · 누르면 열기 · `renderPrayerBook` 에서 판 닫기
- Modify: `style.css` — 끝에 `.pr-share` · `.psh-*` · `.dark` 짝
- Test: `tests/pray-share.test.cjs`(배선 시험 더하기)

**Interfaces:**
- Consumes: Task 1 의 `praySharePlan` · `prayShareChoices` · `prayShareName` · `PRAY_SHARE_STYLES` · app.js `withLazyJs(name, fn)` · `prayEsc` · `prayFill` · `PRAY_AMEN` · `APP_BUILD` · `appAlert` · `ministryTesterCached()`
- Produces: 전역 `openPrayShare(b, name)` · `prayShareClose(fromPop)` · `prayShareDraw(b, name, choice, leafNo) → Promise<Blob>` · `prayShareVisible()`(js/prayer.js)

- [ ] **Step 1: 배선 시험을 더한다**(`tests/pray-share.test.cjs` 끝)

```js
test('배선 — 지연 모듈(LAZY_JS.prayShare · index.html 에 없음) · 단추는 문 안에만 · 보내기는 미리 만든 Blob 으로', () => {
  assert.match(APP, /prayShare: \{ src: "js\/pray-share\.js", fn: "openPrayShare" \}/);
  assert.ok(!INDEX.includes('js/pray-share.js'), 'index.html 이 처음부터 부르면 안 된다');
  assert.match(PR, /const PRAY_SHARE_PUBLIC = (true|false);/);
  assert.match(PR, /function prayShareVisible\(\) \{ return PRAY_SHARE_PUBLIC \|\| \(typeof ministryTesterCached === "function" && ministryTesterCached\(\)\); \}/);
  assert.match(PR, /\$\{prayShareVisible\(\) \? `<button class="pr-share" id="pr-share">/, '단추는 문 안에서만 그린다');
  assert.match(PR, /withLazyJs\("prayShare"/);
  const send = cut(PS, 'function pshSend() {', '\n}\n');
  assert.match(send, /pshState\.blob/);
  assert.match(send, /navigator\.share\(\{ files: \[file\] \}\)/);
  assert.doesNotMatch(send, /prayShareDraw\(/, '보내기 탭 안에서 그림을 새로 만들면 공유가 막힌다');
  assert.doesNotMatch(PS, /\(\?<[=!]/, 'lookbehind 금지(사파리 16.4 미만)');
});
```
Run: `node --test tests/pray-share.test.cjs` → Expected: FAIL(LAZY_JS 줄 없음)

- [ ] **Step 2: `app.js` LAZY_JS 에 한 줄**(`navi:` 줄 다음)

```js
  prayShare: { src: "js/pray-share.js", fn: "openPrayShare" },   // 📤 기도문 보내기(2026-11-04 · 기도문 화면의 단추를 누를 때 — js/prayer.js 안에서 부른다)
```

- [ ] **Step 3: `js/prayer.js`**

머리(`let prayRepeat` 줄 아래)에:
```js
// 📤 카톡·문자로 보내기(2026-11-04 · js/pray-share.js 지연 · 설계 docs/superpowers/specs/2026-11-04-prayer-share-design.md)
//   먼저 🧪 시험 참여자에게만 — 친구 폰에서 카톡 · 문자 · 아이폰 앱 · 플레이 앱을 본 뒤 true 한 줄 + bump 로 모두에게.
const PRAY_SHARE_PUBLIC = false;
function prayShareVisible() { return PRAY_SHARE_PUBLIC || (typeof ministryTesterCached === "function" && ministryTesterCached()); }
```
`drawPrayer` 템플릿의 `.pr-nav` 닫는 `</div>` 다음(`.pr-card` 닫기 전)에:
```js
      ${prayShareVisible() ? `<button class="pr-share" id="pr-share">📤 카톡·문자로 보내기</button>` : ""}
```
`document.getElementById("pr-name").addEventListener(...)` 줄 다음에:
```js
  const shareBtn = document.getElementById("pr-share");
  if (shareBtn) shareBtn.addEventListener("click", () => withLazyJs("prayShare", () => {
    if (typeof openPrayShare === "function") openPrayShare(list[i], prayName);
    else appAlert("보내기 화면을 아직 못 불러왔어요. 잠시 뒤 다시 눌러 주세요.");
  }));
```
`renderPrayerBook` 의 `prayFullClose();` 다음 줄에:
```js
  if (typeof prayShareClose === "function") prayShareClose();   // 보내기 판이 남아 있지 않게
```

- [ ] **Step 4: `js/pray-share.js` — 순수 구간 아래에 그리기 · 판 · 보내기**

```js
// ── 그리기 ──
function pshImg(src) {
  if (!src) return Promise.resolve(null);
  return new Promise((ok) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ok(null); im.src = src; });
}
// 별 자리는 편 번호로 정한다 — 같은 편은 늘 같은 하늘(다시 그려도 별이 뛰지 않게)
function pshRand(seed) { let s = (seed >>> 0) || 1; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }
function pshNight(ctx) {
  const g = ctx.createRadialGradient(PSH_W / 2, 0, 0, PSH_W / 2, 0, PSH_H * 1.1);
  g.addColorStop(0, "#2a4a8a"); g.addColorStop(0.55, "#15264f"); g.addColorStop(1, "#0c1734");
  ctx.fillStyle = g; ctx.fillRect(0, 0, PSH_W, PSH_H);
}
function pshBg(ctx, style, img, seed) {
  const W = PSH_W, H = PSH_H;
  if (style === "frame") {
    ctx.fillStyle = "#fdf8ef"; ctx.fillRect(0, 0, W, H);
    if (img) {
      const lw = 250, lh = lw * img.naturalHeight / img.naturalWidth;
      ctx.globalAlpha = 0.95;
      ctx.drawImage(img, 40, H - 40 - lh, lw, lh);
      ctx.save(); ctx.translate(W, 0); ctx.scale(-1, 1); ctx.drawImage(img, 40, H - 40 - lh, lw, lh); ctx.restore();
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = "#b08a3e"; ctx.lineWidth = 5; ctx.strokeRect(46, 46, W - 92, H - 92);
    ctx.lineWidth = 2; ctx.strokeRect(62, 62, W - 124, H - 124);
    return;
  }
  if (style === "leaf") {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#f6f3ea"); g.addColorStop(1, "#e8efe4");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (img) {
      const lw = 600, lh = lw * img.naturalHeight / img.naturalWidth;
      ctx.save(); ctx.globalAlpha = 0.9; ctx.translate(W - 210, 120); ctx.rotate(18 * Math.PI / 180);
      ctx.drawImage(img, -lw / 2, -lh / 2, lw, lh); ctx.restore();
    }
    return;
  }
  if (style === "night") {
    pshNight(ctx);
    const r = pshRand(seed * 7919);
    for (let k = 0; k < 70; k++) {
      const x = r() * W, y = r() * H * 0.78, rad = 0.8 + r() * 1.8;
      ctx.globalAlpha = 0.35 + r() * 0.55; ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    return;
  }
  // photo — 그림을 꽉 채우고(잘라서) 글이 올라갈 아래쪽을 어둡게. 그림을 못 받으면 남색 하늘로.
  if (!img) { pshNight(ctx); return; }
  const sc = Math.max(W / img.naturalWidth, H / img.naturalHeight);
  const dw = img.naturalWidth * sc, dh = img.naturalHeight * sc;
  ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
  ctx.fillStyle = "rgba(0, 0, 0, 0.12)"; ctx.fillRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, H * 0.25, 0, H);
  g.addColorStop(0, "rgba(18, 14, 26, 0)"); g.addColorStop(1, "rgba(18, 14, 26, 0.72)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
// 그림 한 장(JPEG Blob). choice = prayShareChoices() 의 한 칸 · leafNo = 1~12(액자 · 잎).
function prayShareDraw(b, name, choice, leafNo) {
  const st = PRAY_SHARE_STYLES[choice.style] || PRAY_SHARE_STYLES.frame;
  const nm = prayShareName(name);
  const v = "?v=" + (typeof APP_BUILD === "string" ? APP_BUILD : "");
  // 글꼴 — 앱이 미뤄 부른 한글 웹폰트에서 이 그림에 쓰는 글자의 조각만 받는다(5초 안 오면 기기 글꼴 · 교육 수료증과 같은 꼴)
  const fam = st.family.split(",")[0].replace(/"/g, "");
  const all = [b.title, b.ref, prayFill(b.prayer, nm), PRAY_AMEN].join(" ");
  const fonts = (document.fonts && document.fonts.load)
    ? Promise.all([st.wBody, st.wBold].map((w) => document.fonts.load(w + ' 40px "' + fam + '"', all).catch(() => null)))
    : Promise.resolve();
  const late = (p, ms) => Promise.race([p, new Promise((ok) => setTimeout(ok, ms))]);
  const bgSrc = (choice.style === "frame" || choice.style === "leaf") ? "img/frame/leaf" + leafNo + ".webp" + v
    : choice.src ? choice.src + v : null;
  return Promise.all([late(fonts, 5000), pshImg(bgSrc), pshImg("img/logo-mark.png" + v)]).then((got) => {
    const bg = got[1], mark = got[2];
    const cv = document.createElement("canvas"); cv.width = PSH_W; cv.height = PSH_H;
    const ctx = cv.getContext("2d");
    pshBg(ctx, choice.style, bg, Number(b.no) || 1);
    const plan = praySharePlan(b, nm, choice.style, (s, f) => { ctx.font = f; return ctx.measureText(s).width; });
    ctx.textBaseline = "middle"; ctx.textAlign = "left";
    plan.ops.forEach((o) => {
      if (o.k === "text") {
        ctx.save();
        if (st.shadow) { ctx.shadowColor = "rgba(0, 0, 0, 0.55)"; ctx.shadowBlur = 12; ctx.shadowOffsetY = 2; }
        ctx.font = o.font; ctx.fillStyle = o.color; ctx.fillText(o.s, o.x, o.y);
        ctx.restore();
        return;
      }
      if (o.k === "orn") {   // ― ◆ ― (글꼴에 ❖ 가 없을 수 있어 선과 마름모로 그린다)
        ctx.strokeStyle = o.color; ctx.fillStyle = o.color; ctx.lineWidth = 2;
        const half = o.w / 2, d = 7;
        ctx.beginPath(); ctx.moveTo(o.x - half, o.y); ctx.lineTo(o.x - d * 2, o.y); ctx.moveTo(o.x + d * 2, o.y); ctx.lineTo(o.x + half, o.y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(o.x, o.y - d); ctx.lineTo(o.x + d, o.y); ctx.lineTo(o.x, o.y + d); ctx.lineTo(o.x - d, o.y); ctx.closePath(); ctx.fill();
        return;
      }
      if (o.k === "bar") { ctx.fillStyle = o.color; ctx.fillRect(o.x, o.y - 3, o.w, 6); return; }
      if (o.k === "mark" && mark) {
        if (choice.style === "night" || choice.style === "photo") {   // 어두운 바탕 — 마크(남색 · 주황)가 묻히지 않게 흰 동그라미 위에
          ctx.globalAlpha = 0.92; ctx.fillStyle = "#ffffff";
          ctx.beginPath(); ctx.arc(o.x + o.w / 2, o.y + o.h / 2, 50, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 0.95; ctx.drawImage(mark, o.x, o.y, o.w, o.h); ctx.globalAlpha = 1;
      }
    });
    return new Promise((ok, no) => cv.toBlob((bl) => (bl ? ok(bl) : no(new Error("blob"))), "image/jpeg", 0.9));
  });
}

// ── 판(아래에서 올라온다) ──
const pshState = { gen: 0, blob: null, url: null, key: "frame", leaf: 1, b: null, name: "", timer: null, pop: null, esc: null };
function pshSay(t) { const m = document.getElementById("psh-msg"); if (m) m.textContent = t; }
function pshSendLabel(busy) {
  const s = document.getElementById("psh-send");
  if (!s) return;
  s.disabled = !!busy || !pshState.blob;
  s.textContent = busy ? "그리는 중…" : "보내기 (카톡 · 문자)";
}
function pshLeafSrc() { return "img/frame/leaf" + pshState.leaf + ".webp?v=" + (typeof APP_BUILD === "string" ? APP_BUILD : ""); }
function pshRedraw() {
  const my = ++pshState.gen;
  pshState.blob = null;
  pshSendLabel(true); pshSay("");
  const all = prayShareChoices();
  const ch = all.find((c) => c.key === pshState.key) || all[0];
  prayShareDraw(pshState.b, pshState.name, ch, pshState.leaf).then((blob) => {
    if (my !== pshState.gen) return;   // 그사이 이름 · 배경이 또 바뀌었다
    if (pshState.url) { try { URL.revokeObjectURL(pshState.url); } catch (e) {} }
    pshState.blob = blob; pshState.url = URL.createObjectURL(blob);
    const img = document.getElementById("psh-img");
    if (img) { img.src = pshState.url; img.alt = "보낼 그림 — " + String(pshState.b.title || "") + " · " + pshState.name; }
    pshSendLabel(false);
  }).catch(() => {
    if (my !== pshState.gen) return;
    pshSendLabel(false);
    pshSay("그림을 만들지 못했어요. 잠시 뒤 다시 열어 주세요.");
  });
}
function pshDownload() {
  if (!pshState.url) return;
  const a = document.createElement("a");
  a.href = pshState.url; a.download = "blessing-" + (Number(pshState.b && pshState.b.no) || 0) + ".jpg"; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
  pshSay("그림 파일 내려받기를 시작했어요.");   // 되었는지는 알 수 없다 — 「시작했어요」까지만(교육 수료증과 같은 말)
}
// ⚠️ 누른 그 탭 안에서 share — 그림은 미리보기 때 만든 pshState.blob(여기서 새로 그리면 사용자 동작이 식어 막힌다)
function pshSend() {
  const blob = pshState.blob;
  if (!blob) return;
  let file = null;
  try { file = new File([blob], "blessing-" + (Number(pshState.b && pshState.b.no) || 0) + ".jpg", { type: "image/jpeg" }); } catch (e) {}
  let can = false;
  try { can = !!(file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })); } catch (e) {}
  if (can) {
    navigator.share({ files: [file] }).catch((err) => {
      if (err && err.name === "AbortError") return;   // 성도님이 공유 창을 닫았다
      pshDownload();
    });
    return;
  }
  pshDownload();
}
function prayShareClose(fromPop) {
  const w = document.getElementById("psh");
  pshState.gen++; clearTimeout(pshState.timer);
  if (pshState.esc) { document.removeEventListener("keydown", pshState.esc); pshState.esc = null; }
  if (pshState.pop) {
    window.removeEventListener("popstate", pshState.pop); pshState.pop = null;
    // 뒤로 가기로 닫힌 것이 아니면 열 때 쌓은 기록을 되돌린다(안 그러면 뒤로 가기가 한 번 헛돈다 · prayFullClose 와 같다)
    if (!fromPop && w) { try { if (history.state && history.state.psh) history.back(); } catch (e) {} }
  }
  if (pshState.url) { try { URL.revokeObjectURL(pshState.url); } catch (e) {} pshState.url = null; }
  pshState.blob = null;
  document.body.classList.remove("psh-on");
  if (w) w.remove();
}
function openPrayShare(b, name) {
  if (!b) return;
  prayShareClose();
  pshState.b = b;
  pshState.name = prayShareName(name);
  pshState.leaf = Math.min(12, 1 + Math.floor(Math.random() * 12));
  const choices = prayShareChoices();
  if (!choices.some((c) => c.key === pshState.key)) pshState.key = "frame";
  const thumb = (c) => {
    const inner = c.style === "photo" ? `<img src="${prayEsc(c.thumb)}?v=${prayEsc(String(APP_BUILD))}" alt="">`
      : c.style === "night" ? "" : `<img class="psh-leaf" src="${pshLeafSrc()}" alt="">`;
    return `<button type="button" class="psh-t psh-t-${c.style}" role="radio" aria-checked="${c.key === pshState.key}" data-k="${prayEsc(c.key)}" aria-label="${prayEsc(c.label)}">${inner}<i>${prayEsc(c.label)}</i></button>`;
  };
  const wrap = document.createElement("div");
  wrap.className = "psh-dim"; wrap.id = "psh";
  wrap.innerHTML = `
    <div class="psh-sheet" role="dialog" aria-modal="true" aria-labelledby="psh-h">
      <div class="psh-grab" aria-hidden="true"></div>
      <div class="psh-top"><b id="psh-h">📤 기도문 보내기</b><button type="button" class="psh-x" aria-label="닫기">✕</button></div>
      <label class="psh-lbl" for="psh-name">누구를 위한 기도인가요?</label>
      <input id="psh-name" class="psh-name" type="text" maxlength="12" autocomplete="off">
      <div class="psh-lbl" id="psh-bg-l">배경 고르기</div>
      <div class="psh-thumbs" role="radiogroup" aria-labelledby="psh-bg-l">${choices.map(thumb).join("")}</div>
      <div class="psh-pv"><img id="psh-img" alt=""></div>
      <button type="button" class="psh-send" id="psh-send" disabled>그리는 중…</button>
      <p class="psh-hint">폰의 공유 창에서 카카오톡이나 메시지를 골라 주세요. 안 되면 위 그림을 길게 눌러 저장해 주세요.</p>
      <p class="psh-msg" id="psh-msg" role="status"></p>
    </div>`;
  document.body.appendChild(wrap);
  document.body.classList.add("psh-on");
  requestAnimationFrame(() => wrap.classList.add("show"));
  wrap.querySelectorAll(".psh-t img").forEach((im) => { im.onerror = () => { im.style.display = "none"; }; });
  const inp = wrap.querySelector("#psh-name");
  inp.value = pshState.name === "우리 가정" && !String(name || "").trim() ? "" : pshState.name;   // 글자 그대로(속성에 넣지 않는다)
  inp.addEventListener("input", () => {
    clearTimeout(pshState.timer);
    pshState.gen++; pshState.blob = null; pshSendLabel(true);   // 다 치기 전에 옛 이름 그림이 나가지 않게
    pshState.timer = setTimeout(() => { pshState.name = prayShareName(inp.value); pshRedraw(); }, 300);
  });
  wrap.querySelectorAll(".psh-t").forEach((t) => t.addEventListener("click", () => {
    const k = t.dataset.k;
    // 액자 · 잎을 다시 누르면 다른 잎가지(12가지)
    if (k === pshState.key && (k === "frame" || k === "leaf")) {
      pshState.leaf = pshState.leaf % 12 + 1;
      wrap.querySelectorAll(".psh-leaf").forEach((im) => { im.style.display = ""; im.src = pshLeafSrc(); });
    }
    pshState.key = k;
    wrap.querySelectorAll(".psh-t").forEach((x) => x.setAttribute("aria-checked", x.dataset.k === k ? "true" : "false"));
    pshRedraw();
  }));
  wrap.querySelector(".psh-x").addEventListener("click", () => prayShareClose());
  wrap.addEventListener("click", (e) => { if (e.target === wrap) prayShareClose(); });
  wrap.querySelector("#psh-send").addEventListener("click", pshSend);
  pshState.esc = (e) => { if (e.key === "Escape") prayShareClose(); };
  document.addEventListener("keydown", pshState.esc);
  try { history.pushState({ psh: 1 }, ""); } catch (e) {}   // 안드로이드 「뒤로 가기」로 닫히게
  pshState.pop = () => prayShareClose(true);
  window.addEventListener("popstate", pshState.pop);
  pshRedraw();
}
```

- [ ] **Step 5: `style.css` 끝에**

```css
/* ── 📤 가정 축복 기도문 보내기(2026-11-04 · js/pray-share.js · 설계 docs/superpowers/specs/2026-11-04-prayer-share-design.md) ──
   기도문 카드 맨 아래 금색 테두리 단추 · 누르면 아래에서 올라오는 판(묵상 A 판과 같은 꼴) — 이름 · 배경 · 미리보기 · 보내기. */
.pr-share {
  display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%; min-height: 48px; margin-top: 10px;
  border: 1.5px solid #c9a04a; border-radius: 12px; background: #fffaf0; color: #7a5a12; font-size: 1rem; font-weight: 800;
}
.pr-share:hover { background: #fbf0d9; color: #7a5a12; }
.dark .pr-share { background: #2a2416; border-color: #8a6f33; color: #f0d48a; }
.dark .pr-share:hover { background: #352c19; color: #f0d48a; }
body.psh-on { overflow: hidden; }
.psh-dim {
  position: fixed; inset: 0; z-index: 9500; display: flex; align-items: flex-end; justify-content: center;
  background: rgba(13, 27, 62, 0); transition: background .2s;
}
.psh-dim.show { background: rgba(13, 27, 62, .45); }
.psh-sheet {
  width: 100%; max-width: 600px; max-height: 94vh; overflow-y: auto; box-sizing: border-box;
  padding: 10px 18px calc(18px + env(safe-area-inset-bottom, 0px)); text-align: left;
  background: #fdf8f0; border-radius: 22px 22px 0 0; box-shadow: 0 -8px 30px rgba(13, 27, 62, .18);
  transform: translateY(40px); transition: transform .2s;
}
.psh-dim.show .psh-sheet { transform: none; }
.psh-grab { width: 44px; height: 5px; margin: 0 auto 10px; border-radius: 3px; background: #d5d0c6; }
.psh-top { display: flex; align-items: center; justify-content: space-between; font-size: 1.1rem; color: #1b2333; }
.psh-x { width: 44px; height: 44px; padding: 0; border: 0; border-radius: 10px; background: transparent; color: #6b6355; font-size: 1.2rem; }
.psh-lbl { display: block; margin: 12px 2px 6px; font-size: .9rem; font-weight: 800; color: #4a5468; }
.psh-name {
  width: 100%; box-sizing: border-box; min-height: 46px; padding: 8px 12px; border: 1.5px solid #8da3c8; border-radius: 12px;
  background: #fff; color: #1b2333; font-size: 1.05rem; font-weight: 700;
}
.psh-thumbs { display: flex; gap: 8px; overflow-x: auto; padding: 2px 2px 6px; -webkit-overflow-scrolling: touch; }
.psh-t {
  position: relative; flex: 0 0 auto; width: 64px; height: 80px; padding: 0; overflow: hidden;
  border: 2px solid #e5dfd4; border-radius: 10px; background: #fff;
}
.psh-t[aria-checked="true"] { border-color: #1e3a6b; box-shadow: 0 0 0 2px #1e3a6b; }
.psh-t i {
  position: absolute; left: 0; right: 0; bottom: 0; padding: 2px 0; font-style: normal; font-size: .72rem; font-weight: 800;
  text-align: center; background: rgba(255, 255, 255, .88); color: #1b2333;
}
.psh-t-frame { background: #fdf8ef; }
.psh-t-frame::before { content: ""; position: absolute; inset: 4px; border: 1.5px solid #b08a3e; }
.psh-t-frame img { position: absolute; left: 3px; bottom: 16px; width: 45%; }
.psh-t-leaf { background: linear-gradient(160deg, #f6f3ea, #e8efe4); }
.psh-t-leaf img { position: absolute; top: -6px; right: -12px; width: 80%; transform: rotate(18deg); }
.psh-t-night { background: radial-gradient(120% 90% at 50% 0%, #2a4a8a, #15264f 55%, #0c1734); }
.psh-t-photo img { width: 100%; height: 100%; object-fit: cover; }
.psh-pv {
  margin: 10px auto 0; width: min(100%, 300px); aspect-ratio: 4 / 5; border-radius: 8px; overflow: hidden;
  background: #ece7dd; box-shadow: 0 2px 10px rgba(0, 0, 0, .15);
}
.psh-pv img { display: block; width: 100%; height: 100%; }
.psh-send {
  width: 100%; min-height: 52px; margin-top: 12px; border: 0; border-radius: 12px;
  background: #1e3a6b; color: #fff; font-size: 1.05rem; font-weight: 800;
}
.psh-send:disabled { opacity: .6; }
.psh-hint { margin: 8px 2px 0; font-size: .86rem; color: #4a5468; text-align: center; word-break: keep-all; }
.psh-msg { margin: 6px 2px 0; font-size: .9rem; font-weight: 700; color: #1e3a6b; text-align: center; }
.psh-msg:empty { display: none; }
.dark .psh-sheet { background: #1a202b; }
.dark .psh-grab { background: #3a4252; }
.dark .psh-top { color: #f1eee7; }
.dark .psh-x { color: #b9c0cd; }
.dark .psh-lbl, .dark .psh-hint { color: #b9c0cd; }
.dark .psh-name { background: #11161f; border-color: #4a6597; color: #f1eee7; }
.dark .psh-t { border-color: #2c3442; }
.dark .psh-t[aria-checked="true"] { border-color: #9dbbea; box-shadow: 0 0 0 2px #9dbbea; }
.dark .psh-pv { background: #262d39; }
.dark .psh-send { background: #3b5a94; color: #fff; }
.dark .psh-msg { color: #9dbbea; }
```

- [ ] **Step 6: 시험 · preflight**

Run: `node --test tests/pray-share.test.cjs` → PASS(7가지) · `python tools/preflight.py` → 「모두 통과」

- [ ] **Step 7: 그림을 눈으로 본다(헤드리스)** — 스크래치 하네스(저장소 밖에 쓰지 않는다 · `tmp/` 는 .gitignore)
  `tmp/psh-harness.html` 이 app.js 의 FILL 구간(시험과 같은 표식)과 `js/pray-share.js` 를 실어, 가장 긴 편(40) · 가장 짧은 편 × 배경 셋 × 이름 「김세웅」·「가나다라마바사아자차카타」 를 `prayShareDraw` 로 그려 `<img>` 로 늘어놓는다.
  `python -m http.server 8765`(내가 띄운 PID 만 끈다) → 헤드리스 크롬으로 캡처 → 볼 것: 잎가지가 글을 덮지 않나 · 밤하늘 마크 · 이름 강조색 · 글씨가 나눔명조/Noto 로 바뀌었나.
  잎가지가 글에 닿으면 `frame.box.bottom` 을 줄인다(시험이 함께 지킨다). 다 보면 `tmp/psh-harness.html` 을 지운다.

- [ ] **Step 8: 판을 앱에서 본다(localhost · 개발 DB)** — 크롬(이 PC deviceId 확인)에서 `http://localhost:8765/` 로그인(개발 DB 시험 계정) → 콘솔로 `localStorage.setItem("ministry-tester::"+loadUser().user_id,"1")` → 기도문 → 「📤」 → 판: 이름 바꾸기 · 배경 셋 · 액자 다시 누르기(잎 바뀜) · 닫기(✕ · 바깥 · 뒤로 가기) · 어두운 모드 · 큰 글씨. PC 크롬은 공유 창이 없으면 내려받기로 간다(「내려받기를 시작했어요」). ⚠️ 브라우저 확인 창을 띄우는 것은 누르지 않는다.

- [ ] **Step 9: 커밋**
```bash
git add -- js/pray-share.js js/prayer.js tests/pray-share.test.cjs
git diff -- app.js style.css    # 남의 헝크가 없으면 그대로, 있으면 git apply --cached 로 내 헝크만
git add -- app.js style.css
git commit -m "feat(기도문 보내기): 그리기 · 판 · 🧪 단추 …"
```

---

### Task 3: 시험 참여자에게 내보내기

- [ ] `docs/notes/prayer-book.md` 끝에 「2026-11 보내기」 절(무엇 · 파일 · ⚠️ 함정: 미리 만든 Blob · prayFill · 문 · 사진 더하는 법) · `CLAUDE.md` 표의 기도문 줄에 「📤 보내기(2026-11 · 🧪 · `PRAY_SHARE_PUBLIC`)」 한 마디.
- [ ] 스킬 `release` — bump → preflight → 경로 지정 커밋 → 푸시 → Actions → 라이브 `js/pray-share.js?v=<태그>` 에 `openPrayShare` 가 있는지 · `js/prayer.js` 에 `pr-share` 가 있는지(이번 판에만 있는 표식).
- [ ] 친구에게: 🧪 명단 폰에서 기도문 → 📤 → 카톡 · 문자로 보내 보기(아이폰 사파리 · 아이폰 앱 · 플레이 앱).

### Task 4: 풍경 사진(키가 들어온 뒤)

- [ ] `.env` 의 `GEMINI_API_KEY` 를 명령 안에서만 읽어 스크래치 스크립트로 10~12장(세로 4:5 · 사람 · 글자 · 상징물 없음 · 아래 40% 단순). 원본은 스크래치.
- [ ] 시안 창에 늘어놓고 친구가 4~6장 고른다.
- [ ] 고른 것만 `img/share/<id>.webp`(1080×1350 · q78 · 150KB 이하) + `<id>-t.webp`(128×160 · q70) · `PRAY_SHARE_PHOTOS` 에 `{ id, label }` · 시험(파일 있음) · 헤드리스로 글이 읽히는지 · release.

### Task 5: 모두에게 열기(친구 확인 뒤)

- [ ] `PRAY_SHARE_PUBLIC = true` 한 줄 · 설명서/도움말 기도문 장에 한 줄(스킬 `copy-truth` — 「폰 공유 창」이 없는 기기 말 포함) · release · 메모리 · `docs/notes/prayer-book.md` 에 연 날.
