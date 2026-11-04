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
