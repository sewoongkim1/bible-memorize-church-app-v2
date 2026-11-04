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
  // 사이 띄어쓰기는 양쪽이 다 강조일 때 강조로(「우리 가정」 · 맺음말이 한 토막으로 이어진다)
  const gapA = (w) => !!(line.length && line[line.length - 1].a && w[0].a);
  const lines = []; let line = [], lw = 0;
  const flush = () => { if (line.length) lines.push(prayShareMerge(line)); line = []; lw = 0; };
  const put = (w, ww) => {
    if (line.length) { const a = gapA(w); line.push({ s: " ", a }); lw += measure(" ", a); }
    w.forEach((p) => line.push({ s: p.s, a: p.a }));
    lw += ww;
  };
  prayShareWords(runs).forEach((w) => {
    const ww = w.reduce((t, p) => t + measure(p.s, p.a), 0);
    if (line.length && lw + measure(" ", gapA(w)) + ww <= maxW) { put(w, ww); return; }
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
// 맺음말처럼 한 줄에 안 드는 한 덩이를 가운데에 가까운 띄어쓰기에서 둘로(「예수님의 이름으로 축복하며 / 기도합니다. 아멘!」) —
//   낱말 단위로만 접으면 「아멘!」 하나가 끝줄에 외따로 남는다.
function prayShareHalves(s) {
  const t = String(s), mid = t.length / 2;
  let best = -1;
  for (let k = 0; k < t.length; k++) if (t[k] === " " && (best < 0 || Math.abs(k - mid) < Math.abs(best - mid))) best = k;
  return best < 0 ? [t] : [t.slice(0, best), t.slice(best + 1)];
}
// 그릴 것 목록 — measure(s, font) → 폭(px). 기도문 글씨는 PSH_MAX 에서 PSH_STEP 씩 줄여 상자에 들어갈 때까지(PSH_MIN 까지) ·
//   PSH_MIN 으로도 넘치면 상자 바닥을 마크 위까지 내린다. 돌려주는 것:
//   { size, fit, top(글 첫머리), bottom(글 끝), limit(넘으면 안 되는 바닥), box, rects(글 토막 자리 — 배경이 피한다), ops: [text · orn · bar · mark] }
//   — 글은 textBaseline "middle" 의 y.
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
      const gap = k === 0 ? ornGap : Math.round(size * 0.5);
      if (k < chunks.length - 1) { add(prayShareRuns(c, nm), size, PSH_LH, false, st.ink, gap); return; }
      const parts = measure(c, font(size, true)) <= st.box.w ? [c] : prayShareHalves(c);   // 맺음말
      parts.forEach((t, j) => add([{ s: t, a: true }], size, PSH_LH, false, st.ink, j === 0 ? gap : 0));
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
  const ops = [], rects = [];
  let top = null;
  L.rows.forEach((r, k) => {
    y += r.gap;
    if (top === null) top = y;
    if (k === L.bodyStart && st.orn) ops.push({ k: "orn", x: PSH_W / 2, y: Math.round(y - L.ornGap / 2), w: Math.round(size * 3.2), color: st.orn });
    if (k === L.bodyStart && st.bar) ops.push({ k: "bar", x: st.box.x, y: Math.round(y - L.ornGap / 2), w: Math.round(size * 1.3), color: st.bar });
    const lineH = r.size * r.lh, cy = y + lineH / 2;
    const ws = r.pieces.map((p) => measure(p.s, font(r.size, r.bold || p.a)));
    const tw = ws.reduce((t, w) => t + w, 0);
    let x = st.align === "center" ? st.box.x + (st.box.w - tw) / 2 : st.box.x;
    r.pieces.forEach((p, j) => {
      ops.push({ k: "text", s: p.s, x, y: Math.round(cy), w: ws[j], font: font(r.size, r.bold || p.a), color: p.a ? st.accent : r.color });
      rects.push({ x, y, w: ws[j], h: lineH });
      x += ws[j];
    });
    y += lineH;
  });
  ops.push({ k: "mark", x: (PSH_W - PSH_MARK.w) / 2, y: markTop, w: PSH_MARK.w, h: PSH_MARK.h });
  return { size, fit: y <= limit + 0.5, top: top === null ? st.box.y : top, bottom: y, limit, box: st.box, rects, ops };
}
// ── 기도문 그림 — 순수 (여기까지) ──

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
// plan(praySharePlan) 을 받아 글을 피한다 — 액자 잎가지는 글 끝 아래로만 · 잎 한 가지는 글 첫머리 위로만 · 별은 글 토막 위에 찍지 않는다
//   (2026-11-04 그려 보니 긴 편에서 잎가지가 첫 줄을 가로질렀고, 글 옆 별 하나가 마침표처럼 읽혔다 — 「좌로나.」).
function pshBg(ctx, style, img, seed, plan) {
  const W = PSH_W, H = PSH_H;
  if (style === "frame") {
    ctx.fillStyle = "#fdf8ef"; ctx.fillRect(0, 0, W, H);
    if (img) {
      const ratio = img.naturalHeight / img.naturalWidth;
      const lh = Math.min(250 * ratio, 330, H - 40 - (plan.bottom + 12)), lw = lh / ratio;   // 키 큰 잎가지(7번 2.75배)가 글로 올라오지 않게
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
      // 오른쪽 위 — 18° 기울인 잎가지의 바깥 상자 바닥이 글 첫머리보다 24px 위 · 상자의 4분의 1까지만 위로 잘려 나가게 크기를 줄인다
      const ratio = img.naturalHeight / img.naturalWidth, th = 18 * Math.PI / 180;
      let lw = Math.min(560, 640 / ratio), lh = lw * ratio;
      const hb = lw * Math.sin(th) + lh * Math.cos(th), wb = lw * Math.cos(th) + lh * Math.sin(th);
      const bottom = Math.min(plan.top - 24, 620), sc = Math.min(1, bottom / (hb * 0.75));
      lw *= sc; lh *= sc;
      ctx.save(); ctx.globalAlpha = 0.9; ctx.translate(W - (wb * sc) / 2 + 20, bottom - (hb * sc) / 2); ctx.rotate(th);
      ctx.drawImage(img, -lw / 2, -lh / 2, lw, lh); ctx.restore();
    }
    return;
  }
  if (style === "night") {
    pshNight(ctx);
    const r = pshRand(seed * 7919), pad = 16;
    const onText = (x, y) => plan.rects.some((q) => x > q.x - pad && x < q.x + q.w + pad && y > q.y - pad && y < q.y + q.h + pad);
    for (let k = 0; k < 110; k++) {
      const x = r() * W, y = r() * H * 0.84, rad = 0.8 + r() * 1.8, a = 0.35 + r() * 0.55;
      if (onText(x, y)) continue;
      ctx.globalAlpha = a; ctx.fillStyle = "#ffffff";
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
    const plan = praySharePlan(b, nm, choice.style, (s, f) => { ctx.font = f; return ctx.measureText(s).width; });
    pshBg(ctx, choice.style, bg, Number(b.no) || 1, plan);   // 배치를 먼저 — 배경이 글 자리를 피한다
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
