// 📤 가정 축복 기도문 · 🌿 오늘의 묵상 · 📖 이번 주 말씀 — 카톡·문자로 보내기(2026-11-04~05 친구 · 설계 docs/superpowers/specs/2026-11-04-prayer-share-design.md)
//   기도문 화면(js/prayer.js) · 「🙏 오늘의 기도」 창 · 「🌿 오늘의 묵상」 창 · 첫 화면 「이번 주 말씀」 아이콘(app.js)을 누를 때 받는다
//   (app.js LAZY_JS.prayShare — 처음 화면이 무거워지지 않게). 기도문 openPrayShare · 묵상 openMedShare · 말씀 openVerseShare — 판 · 배경 · 그리기는 하나다.
//   그림은 이 폰 안에서만 만든다(캔버스) → 폰 공유 창(navigator.share files) · 말씀 판의 「카카오톡으로 보내기」만 그림을 카카오 서버에 올린다(pshKakaoSend).
//   우리 서버로 가는 것은 이용 기록뿐이다(pshLog → app.js logFeature → feature_log: 누가 · 무엇을 눌렀나 · 종류 코드 · 그날 횟수 — 2026-11-06 설계
//   docs/superpowers/specs/2026-11-06-share-board-usage-log-design.md) · 판에서 바꾼 이름 · 글 · 받는 분 · 고른 앱은 싣지 않는다(이름은 그림에만 쓴다) ·
//   관리자 묵상 미리보기 판(pshState.noLog)은 남기지 않는다 · 어린 부서(만 14세 미만)는 app.js logFeature 가 거른다.
//   ⚠️ 이름 채우기는 app.js prayFill(받침 · ㄹ 받침 규칙) — 따로 치환하지 말 것(docs/notes/prayer-book.md).
//   ⚠️ 공유는 「보내기」를 누른 그 탭 안에서 — 그래서 그림은 미리보기를 그릴 때 이미 만들어 둔다(pshState.blob).

// ── 기도문 그림 — 순수 (여기부터) ──
const PSH_W = 1080, PSH_H = 1350;
const PSH_MAX = 46, PSH_MIN = 28, PSH_STEP = 2, PSH_LH = 1.7;   // 기도문 글씨(1080 폭 기준) — 큰 데서 줄여 내려간다
const PSH_SERIF = '"Nanum Myeongjo", serif', PSH_SANS = '"Noto Sans KR", sans-serif';
// 교회 마크(img/logo-mark.png 108×132) — 오른쪽 위 · 글씨 없음(친구 2026-11-04 「오른쪽 위로 · 조금 크게」 — 처음엔 맨 아래 가운데 59×72).
//   어두운 바탕(disc)에서는 흰 동그라미(반지름 disc) 위에 놓는다. 글 · 별은 동그라미 둘레 + pad 안에 들어가지 않는다.
const PSH_MARK = { w: 82, h: 100, right: 92, top: 88, disc: 68, pad: 16 };
const PSH_FLOOR = PSH_H - 92;   // PSH_MIN 으로도 상자에 안 들 때 글이 내려갈 수 있는 바닥(액자 안쪽 테두리 1288 보다 30 위)
// 배경 넷 — box 는 글 상자(1080×1350 위의 자리). valign: 글 덩이를 상자 가운데(center) / 아래(bottom).
//   액자는 아래 두 귀퉁이에 잎가지가 있어 상자 바닥을 올렸다. 사진은 글을 아래쪽 어두운 막 위에 둔다.
const PRAY_SHARE_STYLES = {
  frame: { label: "액자", family: PSH_SERIF, align: "center", valign: "center", ink: "#1e3264", accent: "#a0701c", sub: "#5b6b8c",
           orn: "#b08a3e", bar: null, box: { x: 150, y: 150, w: 780, bottom: 1040 }, wBody: 700, wBold: 800 },
  leaf:  { label: "잎", family: PSH_SANS, align: "left", valign: "center", ink: "#263a2c", accent: "#8a6a1f", sub: "#4d6a55",
           orn: null, bar: "#8a6a1f", box: { x: 120, y: 330, w: 840, bottom: 1150 }, wBody: 500, wBold: 800 },
  night: { label: "밤하늘", family: PSH_SERIF, align: "center", valign: "center", ink: "#f4ecd8", accent: "#f0d48a", sub: "#c9d3ea",
           orn: "#d9bd72", bar: null, disc: true, box: { x: 130, y: 150, w: 820, bottom: 1150 }, wBody: 700, wBold: 800 },
  photo: { label: "사진", family: PSH_SANS, align: "left", valign: "bottom", ink: "#ffffff", accent: "#ffe08a", sub: "#f1ece4",
           orn: null, bar: null, disc: true, shadow: true, box: { x: 110, y: 380, w: 860, bottom: 1160 }, wBody: 500, wBold: 800 },
  // 밝은 사진(수채화 · 밝은 나무 탁자 — 흰 글씨가 안 읽힌다) — 사진 위에 옅은 막(veil) · 글 뒤에 둥근 판(panel) · 글은 액자처럼 진하게(2026-11-04)
  veil:  { label: "사진", family: PSH_SERIF, align: "center", valign: "center", ink: "#1e3264", accent: "#9a6a17", sub: "#4f5f80",
           orn: "#b08a3e", bar: null, disc: true, veil: 0.28, panel: 0.8, box: { x: 150, y: 190, w: 780, bottom: 1170 }, wBody: 700, wBold: 800 },
};
// 마크 자리 — { x, y, w, h(그림) · cx, cy, r(동그라미) · keep(글 · 별이 피할 곳) }
//   W · spec — 바탕 폭과 마크 자리(말씀 액자는 정사각형 · 액자 안쪽 오른쪽 위 · 2026-11-05) · 안 넘기면 기도문 · 묵상의 자리
function prayShareMark(W, spec) {
  const m = spec || PSH_MARK, x = (W || PSH_W) - m.right - m.w, y = m.top, cx = x + m.w / 2, cy = y + m.h / 2, k = m.disc + m.pad;
  return { x, y, w: m.w, h: m.h, cx, cy, r: m.disc, keep: { x: cx - k, y: cy - k, w: k * 2, h: k * 2 } };
}
// 풍경 사진(AI 그림 · 친구가 고른 것) — img/share/<id>.webp(1080×1350) + <id>-t.webp(작은 그림). 더하면 시험이 파일이 있는지 본다.
const PRAY_SHARE_PHOTOS = [   // 2026-11-04 · Gemini 로 열두 장 그려 여섯을 골랐다 · 같은 날 추수감사 둘을 맨 앞에(여섯 장 그려 둘 · 만든 말은 img/share/prompts.md)
  { id: "bg-basket", label: "열매" }, { id: "bg-persimmon", label: "감나무" },
  // 친구가 준 추수감사 그림 셋(같은 날 「넣어 주세요」 · 웹에 올릴 허락은 친구가 확인 · 세로 4:5 로 자름 — prompts.md) · 밝은 둘은 veil(옅은 판 + 진한 글씨)
  { id: "bg-maple", label: "단풍길" }, { id: "bg-harvest", label: "풍성", style: "veil" }, { id: "bg-watercolor", label: "수채화", style: "veil" },
  { id: "bg-dawn", label: "새벽" }, { id: "bg-wheat", label: "들판" }, { id: "bg-sea", label: "바다" },
  { id: "bg-blossom", label: "꽃길" }, { id: "bg-lavender", label: "라벤더" }, { id: "bg-lake", label: "호수" },
];
function prayShareChoices() {
  const out = [
    { key: "night", style: "night", label: "밤하늘" },   // 맨 왼쪽 · 처음 고른 것(친구 2026-11-04 「밤하늘이 기본으로 왼쪽으로」 — 기도문 · 묵상 같은 차례)
    { key: "frame", style: "frame", label: "액자" },
    { key: "leaf", style: "leaf", label: "잎" },
  ];
  PRAY_SHARE_PHOTOS.forEach((p) => out.push({ key: "photo:" + p.id, style: p.style || "photo", label: p.label,
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
// 글 덩이 배치 — 기도문(praySharePlan) · 오늘의 묵상(medSharePlan)이 함께 쓴다. measure(s, font) → 폭(px).
//   rowsOf(size, c) 가 줄을 차례로 더한다 — c.add(runs, 크기, 줄높이, 굵게, 색, 앞 간격) · c.body() = 여기부터 몸글(장식 orn · bar 가 그 위에 온다) ·
//   c.st(배경 값) · c.font(크기, 굵게) · c.ornGap. 글씨 size 는 PSH_MAX 에서 PSH_STEP 씩 줄여 상자에 들어갈 때까지(PSH_MIN 까지) ·
//   글 토막이 오른쪽 위 마크 둘레(keep)에 닿으면 글 덩이를 그 아래로 내린다(긴 제목 · 긴 편) · PSH_MIN 으로도 넘치면 바닥을 PSH_FLOOR 까지 내린다.
//   돌려주는 것: { size, fit, top(글 첫머리), bottom(글 끝), limit(넘으면 안 되는 바닥), box, rects(글 토막 자리 — 배경이 피한다), keep, ops: [text · orn · bar · mark] }
//   — 글은 textBaseline "middle" 의 y.
//   styleKey 는 PRAY_SHARE_STYLES 의 이름 또는 꼴 값 그대로(말씀 액자 — W · H · box · mark · max · min · floor 를 저마다 가진다 · 2026-11-05).
function pshPlan(styleKey, measure, rowsOf) {
  const st = (styleKey && typeof styleKey === "object") ? styleKey : (PRAY_SHARE_STYLES[styleKey] || PRAY_SHARE_STYLES.frame);
  const W = st.W || PSH_W, MAX = st.max || PSH_MAX, MIN = st.min || PSH_MIN, FLOOR = st.floor || ((st.H || PSH_H) - 92);
  const font = (size, bold) => (bold ? st.wBold : st.wBody) + " " + size + "px " + st.family;
  // markInline(말씀 액자) — 마크는 글 덩이 안(「이번 주 말씀」 오른쪽 · verseSharePlan 이 놓는다)이라 오른쪽 위 피하기가 없다
  const mk = st.markInline ? null : prayShareMark(W, st.mark), K = mk ? mk.keep : { x: -1e4, y: -1e4, w: 0, h: 0 };
  const lay = (size) => {
    const rows = [];
    let bodyStart = -1;
    const add = (runs, sz, lh, bold, color, gap) => {
      const m = (s, a) => measure(s, font(sz, bold || a));
      prayShareWrap(runs, st.box.w, m).forEach((pieces, k) => rows.push({ pieces, size: sz, lh, bold, color, gap: k === 0 ? gap : 0 }));
    };
    const ornGap = (st.orn || st.bar) ? Math.round(size * 1.6) : Math.round(size * 0.9);
    rowsOf(size, { st, font, ornGap, add, body: () => { bodyStart = rows.length; } });
    const h = rows.reduce((t, r) => t + r.gap + r.size * r.lh, 0);
    return { rows, h, bodyStart, ornGap };
  };
  // 글 덩이를 y0 에서부터 줄줄이 놓는다 — hit: 글 토막 하나라도 마크 둘레(K)에 닿았나
  const place = (L, size, y0) => {
    const ops = [], rects = [];
    let y = y0, top = null, hit = false;
    L.rows.forEach((r, k) => {
      y += r.gap;
      if (top === null) top = y;
      if (k === L.bodyStart && st.orn) ops.push({ k: "orn", x: st.box.x + st.box.w / 2, y: Math.round(y - L.ornGap / 2), w: Math.round(size * 3.2), color: st.orn });
      if (k === L.bodyStart && st.bar) ops.push({ k: "bar", x: st.box.x, y: Math.round(y - L.ornGap / 2), w: Math.round(size * 1.3), color: st.bar });
      const lineH = r.size * r.lh, cy = y + lineH / 2;
      const ws = r.pieces.map((p) => measure(p.s, font(r.size, r.bold || p.a)));
      const tw = ws.reduce((t, w) => t + w, 0);
      let x = st.align === "center" ? st.box.x + (st.box.w - tw) / 2 : st.box.x;
      r.pieces.forEach((p, j) => {
        ops.push({ k: "text", s: p.s, x, y: Math.round(cy), w: ws[j], font: font(r.size, r.bold || p.a), color: p.a ? st.accent : r.color });
        rects.push({ x, y, w: ws[j], h: lineH });
        if (x < K.x + K.w && x + ws[j] > K.x && y < K.y + K.h && y + lineH > K.y) hit = true;
        x += ws[j];
      });
      y += lineH;
    });
    return { ops, rects, top: top === null ? y0 : top, bottom: y, hit };
  };
  // from~limit 사이에 — 가운데(center) 또는 아래(bottom) · 안 들면 from 부터
  const at = (L, from, limit) => {
    const room = limit - from;
    if (L.h > room) return from;
    return st.valign === "bottom" ? limit - L.h : from + (room - L.h) / 2;
  };
  const put = (L, size, limit) => {
    const P = place(L, size, at(L, st.box.y, limit));
    return P.hit ? place(L, size, at(L, Math.max(st.box.y, K.y + K.h), limit)) : P;   // 마크에 닿으면 마크 둘레 아래에서 다시
  };
  let size = MAX, L = lay(size), limit = st.box.bottom, P = put(L, size, limit);
  while (P.bottom > limit + 0.5 && size > MIN) { size -= PSH_STEP; L = lay(size); P = put(L, size, limit); }
  if (P.bottom > limit + 0.5) { limit = FLOOR; P = put(L, size, limit); }   // 가장 작은 글씨로도 넘친다 — 바닥을 내린다
  if (mk) P.ops.push({ k: "mark", x: mk.x, y: mk.y, w: mk.w, h: mk.h, cx: mk.cx, cy: mk.cy, r: mk.r, disc: !!st.disc });
  return { size, fit: P.bottom <= limit + 0.5, top: P.top, bottom: P.bottom, limit, box: st.box, rects: P.rects, keep: K, ops: P.ops };
}
// 기도문 — 제목 · 말씀 자리 · (장식) · 이름 든 기도문(문장마다) · 맺음말(강조 · 한 줄에 안 들면 가운데에서 둘로)
function praySharePlan(b, name, styleKey, measure) {
  const nm = prayShareName(name);
  const chunks = prayChunks(b && b.prayer);   // 끝에 맺음말(PRAY_AMEN)이 붙어 온다
  return pshPlan(styleKey, measure, (size, c) => {
    const st = c.st;
    c.add([{ s: String((b && b.title) || ""), a: false }], Math.round(size * 1.45), 1.3, true, st.ink, 0);
    c.add([{ s: String((b && b.ref) || ""), a: false }], Math.round(size * 0.8), 1.5, false, st.sub, Math.round(size * 0.2));
    c.body();
    chunks.forEach((t, k) => {
      const gap = k === 0 ? c.ornGap : Math.round(size * 0.5);
      if (k < chunks.length - 1) { c.add(prayShareRuns(t, nm), size, PSH_LH, false, st.ink, gap); return; }
      const parts = measure(t, c.font(size, true)) <= st.box.w ? [t] : prayShareHalves(t);   // 맺음말
      parts.forEach((x, j) => c.add([{ s: x, a: true }], size, PSH_LH, false, st.ink, j === 0 ? gap : 0));
    });
  });
}
// 🌿 오늘의 묵상(2026-11-04 친구 「그림 한 장 · 적용 질문 · 설교 제목 · 말씀 · 목사님 설교 일자」) — m = { heading, message, question, sermonTitle, verseRef, preacher, sermonDate }
//   「오늘의 묵상」(작게 · 강조색) · 제목 · (장식) · 묵상 글(문장마다 · **강조** 는 강조색) · 「오늘의 적용 질문」 + 질문(강조) ·
//   맨 아래 작게 두 줄 — 설교 제목 · 말씀 자리 / 설교하신 분 · 설교 날짜.
//   묵상 글은 설교 아카이브의 요일 묵상(784편 · 2026-11-04 · 셋을 합쳐 가장 긴 것 206자) — 「이번 주」라고 쓰지 않는다(지난주 것을 보여 줄 때가 있다).
const MED_KICKER = "오늘의 묵상", MED_QLABEL = "오늘의 적용 질문";
function medShareRuns(t) {   // **…** → 강조 토막(scEmphasis 와 같은 표식) · 짝 없는 ** 는 걷는다
  const out = [];
  String(t == null ? "" : t).split(/(\*\*[^*]+\*\*)/).forEach((seg) => {
    const m = /^\*\*([^*]+)\*\*$/.exec(seg);
    const s = m ? m[1] : seg.replace(/\*\*/g, "");
    if (s) out.push({ s, a: !!m });
  });
  return out;
}
function medShareParas(t) {   // 문장마다 한 덩이(prayChunks 와 같은 자리에서 끊되 맺음말은 없다) · 강조는 문장을 넘어도 이어진다
  const paras = [[]];
  let endS = false;   // 앞 토막이 문장 끝으로 끝났나 — 「**…다.** 다음」처럼 끝(.)과 띄어쓰기가 서로 다른 토막에 걸릴 때도 끊는다
  medShareRuns(String(t == null ? "" : t).trim()).forEach((r) => {
    let s = r.s;
    if (endS && /^\s/.test(s)) { paras.push([]); s = s.replace(/^\s+/, ""); }
    s.replace(/([.!?])\s+/g, "$1\u0001").split("\u0001").forEach((piece, k) => {
      if (k > 0) paras.push([]);
      if (piece) paras[paras.length - 1].push({ s: piece, a: r.a });
    });
    endS = /[.!?]$/.test(r.s);
  });
  return paras.filter((p) => p.some((x) => x.s.trim()));
}
function medShareFoot(m) {
  const a = String((m && m.sermonTitle) || "").trim(), b = String((m && m.verseRef) || "").trim();
  return [a ? "설교 「" + a + "」" : "", b].filter(Boolean).join(" · ");
}
// 맨 아래 둘째 줄 — 설교하신 분 · 설교 날짜(친구 2026-11-04 「목사님 설교 일자도」) · 설교자 이름은 자료 그대로(위임목사 · 담임목사)
function medShareDate(d) {   // 「2026-11-01」 → 「2026년 11월 1일」 · 못 읽으면 빈 값
  const x = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d == null ? "" : d));
  return x ? x[1] + "년 " + Number(x[2]) + "월 " + Number(x[3]) + "일" : "";
}
function medShareByline(m) {
  const p = String((m && m.preacher) || "").trim(), d = medShareDate(m && m.sermonDate);
  return [p, d].filter(Boolean).join(" · ");
}
function medSharePlan(m, styleKey, measure) {
  return pshPlan(styleKey, measure, (size, c) => {
    const st = c.st;
    c.add([{ s: MED_KICKER, a: true }], Math.round(size * 0.78), 1.5, true, st.accent, 0);
    c.add([{ s: String((m && m.heading) || "").replace(/\*\*/g, "").trim() || MED_KICKER, a: false }], Math.round(size * 1.45), 1.3, true, st.ink, Math.round(size * 0.15));
    c.body();
    medShareParas(m && m.message).forEach((p, k) => c.add(p, size, PSH_LH, false, st.ink, k === 0 ? c.ornGap : Math.round(size * 0.5)));
    const q = String((m && m.question) || "").replace(/\*\*/g, "").trim();
    if (q) {
      c.add([{ s: MED_QLABEL, a: true }], Math.round(size * 0.78), 1.5, true, st.accent, Math.round(size * 1.1));
      c.add([{ s: q, a: true }], size, PSH_LH, false, st.ink, Math.round(size * 0.15));
    }
    const foot = medShareFoot(m), by = medShareByline(m);
    if (foot) c.add([{ s: foot, a: false }], Math.round(size * 0.68), 1.5, false, st.sub, Math.round(size * 1.1));
    if (by) c.add([{ s: by, a: false }], Math.round(size * 0.68), 1.5, false, st.sub, foot ? 0 : Math.round(size * 1.1));
  });
}
// 📖 말씀 액자(2026-11-05 친구 「이미지는 기존에 없던 것으로 · 말씀 액자이니 너무 크지 않게」) — Gemini 정사각형 여섯 장 중 다섯(만든 말 img/share/prompts.md).
//   정사각형 1080×1080 · 액자 긴 변 960px 을 가운데에(같은 날 친구 「액자 밖 여백이 너무 많아요 · 액자를 크게 · 글자도 키워」) ·
//   ⚠️ 가운데는 테두리 자신의 바깥 끝으로 잰다 — 그림자까지 넣어 재면 액자가 왼쪽 위로 밀린다(한지 · 남색이 그랬다 · 친구 「첫번째 액자가 왼쪽으로 치우쳤어요」 ·
//   「청색 글씨가 오른쪽으로 치우쳤어요」 — 글 자리는 그림 가운데인데 남색 안쪽은 30px 왼쪽이었다) · 글은 액자 안쪽 바탕(box — 테두리 가운데에 맞춘 자리)에만 · 글씨 48px → 24px ·
//   남색은 창 없는 새 그림(「글자가 작아요」 — 안쪽 창이 글 자리를 좁혔다).
//   설치 주소는 그림에 넣지 않는다 — 판의 「설치 주소도 보내기」 체크가 그림 다음에 글로 따로(VERSE_SHARE_TEXT). ⚠️ 그림을 바꾸면 box · floor 를 다시 잴 것.
// 그림 다음에 보내는 설치 주소 글(친구 2026-11-05 「설치는 그림 말고 액자 아래 · 누르면 연결 · URL 박스가 크지 않게」) —
//   주소는 대표 그림(og:image)이 없는 짧은 주소 go/app/ → /install/ 이라 카톡 미리보기가 작은 상자(제목 · 주소)가 된다.
//   그림과 한 번에 보내지 않는 까닭: 카톡이 그림에 붙인 글을 버렸다(친구 폰 · 같은 날 「설치 URL은 연결 해달라고 했는데 없네요」).
const VERSE_SHARE_TEXT = "성경암송 앱 설치 https://gocheok.onlybible.kr/go/app/";
const VERSE_FRAMES = [   // floor = 안쪽 바탕 끝에서 18~20px 안(가장 작은 글씨로도 넘칠 때 내려갈 바닥 — 2026-11-05 검토: 같은 +40 이면 원목 · 남색 창 밖으로 나갔다) · bg = 그림을 못 받았을 때 바탕
  { id: "vf-hanji", label: "한지", ink: "#2b2620", accent: "#8a4f1a", sub: "#6b6250", orn: "#8a6a3a", bg: "#f3ead8", box: { x: 162, y: 162, w: 756, bottom: 919 }, floor: 977 },
  { id: "vf-gold", label: "금테", ink: "#3a2c18", accent: "#9a6a17", sub: "#6b5a3a", orn: "#b08a3e", bg: "#f5ecdd", box: { x: 220, y: 204, w: 638, bottom: 859 }, floor: 909 },
  { id: "vf-oak", label: "원목", ink: "#2f3440", accent: "#7a5a2a", sub: "#5f6672", orn: "#a07a4a", bg: "#ece8e2", box: { x: 290, y: 301, w: 493, bottom: 811 }, floor: 838 },
  { id: "vf-wreath", label: "꽃테", ink: "#33402f", accent: "#a0566a", sub: "#6b7a68", orn: "#8aa07a", bg: "#f4f1ea", box: { x: 262, y: 246, w: 565, bottom: 842 }, floor: 859 },
  { id: "vf-navy", label: "남색", ink: "#f4ecd8", accent: "#f0d48a", sub: "#c9d3ea", orn: "#d9bd72", bg: "#0c1734", disc: true, box: { x: 161, y: 164, w: 760, bottom: 916 }, floor: 965 },
];
function verseFrameStyle(f) {
  return { label: f.label, family: PSH_SERIF, align: "center", valign: "center", ink: f.ink, accent: f.accent, sub: f.sub, orn: f.orn, bar: null,
           disc: !!f.disc, W: 1080, H: 1080, max: 48, min: 24, floor: f.floor, bg: f.bg, box: f.box,
           markInline: true, wBody: 700, wBold: 800 };
}
function verseFrameChoices() {
  return VERSE_FRAMES.map((f) => ({ key: "vf:" + f.id, style: verseFrameStyle(f), label: f.label, src: "img/share/" + f.id + ".webp", thumb: "img/share/" + f.id + "-t.webp" }));
}
// 📖 이번 주 말씀(2026-11-05 친구 「첫 화면 이번 주 말씀도 카톡 공유 · 오른쪽 위 작은 아이콘」 · 그림 + 주소 단추) — v = { no, text, refFull, refShort, sermonTitle, pastor, date }
//   「이번 주 말씀」(작게 · 강조색) · (장식) · 말씀(문장마다) · 구절 자리 · 맨 아래 작게 「설교 「제목」」 / 「고척교회 ○○○ 목사」 / 「날짜」(한 줄씩).
//   구절 본문은 20~69자(운영 44구절 · 2026-11-05) — 짧아서 큰 글씨로 든다. verses.date 는 UTC(그 주일 0시 KST = 토 15:00Z) — 한국 날짜로 바꿔 쓴다.
const VERSE_KICKER = "이번 주 말씀";
// 말씀 액자에 교회 마크를 넣나 — 친구 2026-11-05 「우선 교회마크를 빼주세요」. 다시 넣으려면 true(「이번 주 말씀」 바로 오른쪽 · 묶음을 가운데로).
//   기도문 · 묵상 그림의 오른쪽 위 마크와는 따로다(그쪽은 그대로).
const VERSE_MARK = false;
function verseShareDate(d) {   // 「2026-06-27T15:00:00.000Z」 → 「2026-06-28」(KST) · 시각이 없으면 그대로 · 못 읽으면 빈 값
  const s = String(d == null ? "" : d).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const t = Date.parse(s);
  return isNaN(t) ? "" : new Date(t + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
function verseShareFoot(v) { const t = String((v && v.sermonTitle) || "").trim(); return t ? "설교 「" + t + "」" : ""; }
// 설교하신 분 — 날짜 위 한 줄(친구 2026-11-05 「날짜 위에 "고척교회 차동혁 목사"」) · 「담임목사 · 위임목사」는 「목사」로 ·
//   설교자 칸이 비면 차동혁 목사(운영 44구절 중 41 · 이번 주 44번이 빈 칸) · 다른 분도 고척교회 목사님(친구 — 권영준 · 한충성) ·
//   칸에 교회 이름이 이미 들었으면(손님 설교) 그대로.
const VERSE_PASTOR = "차동혁 목사";
function verseSharePastor(v) {
  let p = String((v && v.pastor) || "").replace(/\s+/g, " ").trim().replace(/(담임|위임)\s*목사/g, "목사");
  if (!p || /차동혁/.test(p)) p = VERSE_PASTOR;
  return /교회/.test(p) ? p : "고척교회 " + p;
}
function verseShareByline(v) { return medShareDate(verseShareDate(v && v.date)); }   // 맨 끝 — 설교 날짜만(「2026년 11월 1일」)
//   말씀 액자답게 말씀이 먼저 · 구절 자리는 그 아래 강조색(안쪽이 420px 쯤이라 큰 제목으로 두면 「디모데전서 1장 11절」이 두 줄로 꺾였다).
function verseSharePlan(v, styleKey, measure) {
  const plan = pshPlan(styleKey, measure, (size, c) => {
    const st = c.st;
    c.add([{ s: VERSE_KICKER, a: true }], Math.round(size * 0.78), 1.5, true, st.accent, 0);
    c.body();
    medShareParas(v && v.text).forEach((p, k) => c.add(p, size, PSH_LH, false, st.ink, k === 0 ? c.ornGap : Math.round(size * 0.35)));
    const ref = String((v && (v.refFull || v.refShort)) || "").trim();
    if (ref) c.add([{ s: ref, a: true }], Math.round(size * 0.86), 1.5, true, st.accent, Math.round(size * 0.6));
    const foot = verseShareFoot(v), who = verseSharePastor(v), by = verseShareByline(v);
    if (foot) c.add([{ s: foot, a: false }], Math.round(size * 0.68), 1.5, false, st.sub, Math.round(size * 1.1));
    c.add([{ s: who, a: false }], Math.round(size * 0.68), 1.5, false, st.sub, foot ? 0 : Math.round(size * 1.1));
    if (by) c.add([{ s: by, a: false }], Math.round(size * 0.68), 1.5, false, st.sub, 0);
  });
  // 말씀 액자 — 교회 마크를 「이번 주 말씀」 바로 오른쪽에(친구 2026-11-05 「마크의 위치가 좀 이상해요」 — 안쪽 바탕 모서리에서는 따로 떨어져 보였다).
  //   「글자 + 틈 + 마크」 묶음이 가운데에 오게 글자를 왼쪽으로 반만큼 옮긴다 · 마크 높이 = 그 글자 크기의 1.45배.
  const st = (styleKey && typeof styleKey === "object") ? styleKey : null;
  const ki = plan.ops.findIndex((o) => o.k === "text" && o.s === VERSE_KICKER);
  if (st && st.markInline && VERSE_MARK && ki >= 0) {
    const ko = plan.ops[ki], kz = Number(/(\d+)px/.exec(ko.font)[1]);
    const h = Math.round(kz * 1.45), w = Math.round(h * 108 / 132), gap = Math.round(kz * 0.35);
    const shift = (gap + w) / 2;
    ko.x -= shift;
    const ri = plan.rects.findIndex((q) => Math.abs(q.x - (ko.x + shift)) < 0.5 && Math.abs(q.w - ko.w) < 0.5);
    if (ri >= 0) plan.rects[ri].x -= shift;
    const x = Math.round(ko.x + ko.w + gap), y = Math.round(ko.y - h / 2);
    plan.ops.push({ k: "mark", x, y, w, h, cx: x + w / 2, cy: ko.y, r: Math.round(h * 0.6), disc: !!st.disc });
  }
  return plan;
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
// plan(praySharePlan) 을 받아 글을 피한다 — 액자 잎가지는 글 끝 아래로만 · 잎 한 가지는 글 첫머리 위로만 · 별은 글 토막 · 마크 둘레에 찍지 않는다
//   (2026-11-04 그려 보니 긴 편에서 잎가지가 첫 줄을 가로질렀고, 글 옆 별 하나가 마침표처럼 읽혔다 — 「좌로나.」).
//   잎 한 가지는 왼쪽 위 — 오른쪽 위는 교회 마크 자리다(같은 날 마크를 옮겼다).
function pshBg(ctx, style, img, seed, plan) {
  const W = (ctx.canvas && ctx.canvas.width) || PSH_W, H = (ctx.canvas && ctx.canvas.height) || PSH_H;
  if (style && typeof style === "object") {   // 📖 말씀 액자(2026-11-05) — 액자 그림을 바탕 가득(정사각형 그림 · 글은 그 안쪽 바탕에). 그림을 못 받으면 미색 바탕.
    if (!img) { ctx.fillStyle = style.bg || "#fbf7ee"; ctx.fillRect(0, 0, W, H); return; }   // 액자마다 글씨에 맞춘 바탕(남색은 어둡게 — 밝은 글씨가 묻히지 않게)
    const sc = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    const dw = img.naturalWidth * sc, dh = img.naturalHeight * sc;
    ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
    return;
  }
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
      // 왼쪽 위(좌우를 뒤집어) — 18° 기울인 잎가지의 바깥 상자 바닥이 글 첫머리보다 24px 위 · 상자의 4분의 1까지만 위로 잘려 나가게 크기를 줄인다
      const ratio = img.naturalHeight / img.naturalWidth, th = 18 * Math.PI / 180;
      let lw = Math.min(560, 640 / ratio), lh = lw * ratio;
      const hb = lw * Math.sin(th) + lh * Math.cos(th), wb = lw * Math.cos(th) + lh * Math.sin(th);
      const bottom = Math.min(plan.top - 24, 620), sc = Math.min(1, bottom / (hb * 0.75));
      lw *= sc; lh *= sc;
      ctx.save(); ctx.globalAlpha = 0.9; ctx.translate((wb * sc) / 2 - 20, bottom - (hb * sc) / 2); ctx.scale(-1, 1); ctx.rotate(th);
      ctx.drawImage(img, -lw / 2, -lh / 2, lw, lh); ctx.restore();
    }
    return;
  }
  if (style === "night") {
    pshNight(ctx);
    const r = pshRand(seed * 7919), pad = 16;
    const onText = (x, y) => plan.rects.concat([plan.keep]).some((q) => x > q.x - pad && x < q.x + q.w + pad && y > q.y - pad && y < q.y + q.h + pad);
    for (let k = 0; k < 110; k++) {
      const x = r() * W, y = r() * H * 0.84, rad = 0.8 + r() * 1.8, a = 0.35 + r() * 0.55;
      if (onText(x, y)) continue;
      ctx.globalAlpha = a; ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    return;
  }
  if (style === "veil") {   // 밝은 사진 — 꽉 채우고 옅은 막 · 글 덩이 뒤에 둥근 판(진한 글씨가 읽히게). 그림을 못 받으면 액자 바탕색.
    const S = PRAY_SHARE_STYLES.veil;
    if (!img) { ctx.fillStyle = "#fdf8ef"; ctx.fillRect(0, 0, W, H); return; }
    const sc = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    const dw = img.naturalWidth * sc, dh = img.naturalHeight * sc;
    ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
    ctx.fillStyle = "rgba(255, 251, 244, " + S.veil + ")"; ctx.fillRect(0, 0, W, H);
    const x = plan.box.x - 50, y = plan.top - 46, w = plan.box.w + 100, h = plan.bottom - plan.top + 90, r = 30;
    ctx.fillStyle = "rgba(255, 251, 244, " + S.panel + ")";
    ctx.beginPath();   // 둥근 판 — ctx.roundRect 는 사파리 16 미만에 없어 손으로 그린다
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); ctx.fill();
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
// 그림에 쓸 글 한 벌 — { plan(배경, measure), text(글꼴 조각을 받을 글자), seed(별 자리), file(파일 이름), alt(미리보기 설명) }
function prayShareDoc(b, name) {
  const nm = prayShareName(name), no = Number(b && b.no) || 0;
  return { plan: (style, measure) => praySharePlan(b, nm, style, measure), text: [b.title, b.ref, prayFill(b.prayer, nm), PRAY_AMEN].join(" "),
           seed: no || 1, file: "blessing-" + no + ".jpg", alt: "보낼 그림 — " + String(b.title || "") + " · " + nm };
}
function medShareDoc(m) {
  const no = Number(m && m.no) || 0, idx = Number(m && m.idx) || 0;
  const head = String((m && m.heading) || "").replace(/\*\*/g, "").trim() || MED_KICKER;
  return { plan: (style, measure) => medSharePlan(m, style, measure),
           text: [MED_KICKER, head, m && m.message, MED_QLABEL, m && m.question, medShareFoot(m), medShareByline(m)].join(" ").replace(/\*\*/g, ""),
           seed: no * 7 + idx + 1, file: "meditation-" + no + "-" + (idx + 1) + ".jpg", alt: "보낼 그림 — 오늘의 묵상 · " + head };
}
function verseShareDoc(v) {
  const no = Number(v && v.no) || 0, ref = String((v && (v.refFull || v.refShort)) || "").trim();
  return { plan: (style, measure) => verseSharePlan(v, style, measure),
           text: [VERSE_KICKER, ref, v && v.text, verseShareFoot(v), verseSharePastor(v), verseShareByline(v)].join(" ").replace(/\*\*/g, ""),
           seed: no * 13 + 5, file: "verse-" + no + ".jpg", alt: "보낼 그림 — 이번 주 말씀 · " + (ref || VERSE_KICKER) };
}
function prayShareDraw(b, name, choice, leafNo) { return pshDraw(prayShareDoc(b, name), choice, leafNo); }
// 그림 한 장(JPEG Blob). doc = prayShareDoc · medShareDoc 의 한 벌 · choice = prayShareChoices() 의 한 칸 · leafNo = 1~12(액자 · 잎).
function pshDraw(doc, choice, leafNo) {
  const st = (choice.style && typeof choice.style === "object") ? choice.style : (PRAY_SHARE_STYLES[choice.style] || PRAY_SHARE_STYLES.frame);
  const v = "?v=" + (typeof APP_BUILD === "string" ? APP_BUILD : "");
  // 글꼴 — 앱이 미뤄 부른 한글 웹폰트에서 이 그림에 쓰는 글자의 조각만 받는다(5초 안 오면 기기 글꼴 · 교육 수료증과 같은 꼴)
  const fam = st.family.split(",")[0].replace(/"/g, "");
  const all = doc.text;
  const fonts = (document.fonts && document.fonts.load)
    ? Promise.all([st.wBody, st.wBold].map((w) => document.fonts.load(w + ' 40px "' + fam + '"', all).catch(() => null)))
    : Promise.resolve();
  const late = (p, ms) => Promise.race([p, new Promise((ok) => setTimeout(ok, ms))]);
  const bgSrc = (choice.style === "frame" || choice.style === "leaf") ? "img/frame/leaf" + leafNo + ".webp" + v
    : choice.src ? choice.src + v : null;
  return Promise.all([late(fonts, 5000), pshImg(bgSrc), pshImg("img/logo-mark.png" + v)]).then((got) => {
    const bg = got[1], mark = got[2];
    const cv = document.createElement("canvas"); cv.width = st.W || PSH_W; cv.height = st.H || PSH_H;   // 말씀 액자는 정사각형
    const ctx = cv.getContext("2d");
    const plan = doc.plan(choice.style, (s, f) => { ctx.font = f; return ctx.measureText(s).width; });
    pshBg(ctx, choice.style, bg, doc.seed, plan);   // 배치를 먼저 — 배경이 글 자리를 피한다
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
        if (o.disc) {   // 어두운 바탕 — 마크(남색 · 주황)가 묻히지 않게 흰 동그라미 위에
          ctx.globalAlpha = 0.92; ctx.fillStyle = "#ffffff";
          ctx.beginPath(); ctx.arc(o.cx, o.cy, o.r, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 0.95; ctx.drawImage(mark, o.x, o.y, o.w, o.h); ctx.globalAlpha = 1;
      }
    });
    return new Promise((ok, no) => cv.toBlob((bl) => (bl ? ok(bl) : no(new Error("blob"))), "image/jpeg", 0.9));
  });
}

// ── 판(아래에서 올라온다) ──
// b · name = 기도문(이름 칸이 있다) · med = 오늘의 묵상 · verse = 이번 주 말씀(이름 자리가 없다) — 한 번에 하나만 차 있다 · file = 지금 그림의 파일 이름
// withLink = 말씀 판 「설치 주소도 보내기」 체크(처음엔 켬) · linkNext = 그림을 보낸 뒤라 같은 단추가 설치 주소를 보낼 차례
// kakaoUp = 카카오 서버에 올린 그림 주소(액자 · 파일 · 크기 → 주소 — 같은 그림은 한 번만) · kakaoReady = 올리기가 늦어 「카카오톡 열기」를 한 번 더 누를 차례의 주소 ·
// kakaoBusy = 지금 올리는 차례의 표(공유 창 잠금 sharing 과 따로 — 액자를 바꾸거나 판을 닫으면 버린다) · kakaoT = 「카카오톡이 안 열렸으면」 타이머
// noLog = 이 판에서 일어난 일을 이용 기록에 남기지 않는다(관리자 묵상 미리보기 — pshOpen 의 opts.noLog · 다시 쓰는 판은 여는 쪽이 덮어쓴다 · 2026-11-06)
const pshState = { gen: 0, blob: null, url: null, key: "night", vkey: "", leaf: 1, b: null, name: "", med: null, verse: null, file: "", timer: null, pop: null, esc: null, noLog: false, sharing: false, withLink: true, linkNext: false,
                   kakaoUp: {}, kakaoReady: "", kakaoBusy: null, kakaoT: 0 };
const PSH_TITLE_PRAY = "📤 가정 축복 기도문 보내기", PSH_TITLE_MED = "📤 오늘의 묵상 보내기";
const PSH_TITLE_VERSE = "📤 이번 주 말씀 보내기";
// 판이 그릴 글 한 벌 — 묵상 · 말씀 · 기도문 가운데 지금 찬 것
function pshDoc() { return pshState.med ? medShareDoc(pshState.med) : pshState.verse ? verseShareDoc(pshState.verse) : prayShareDoc(pshState.b, pshState.name); }
// 📊 이용 기록(2026-11-06 설계 docs/superpowers/specs/2026-11-06-share-board-usage-log-design.md 2-2) — 종류 코드 1 기도문 · 2 묵상 · 3 이번 주 말씀(pshDoc 과 같은 가름)
function pshKind() { return pshState.med ? 2 : pshState.verse ? 3 : 1; }
// 남기는 것은 (값, 종류 코드) 둘뿐 — 이름 칸 값(pshState.name) · 글 · 파일 이름은 넘기지 않는다 · 미리보기 판(noLog)은 남기지 않는다 ·
//   logFeature 는 app.js 것(로그인 전 · 어린 부서는 거기서 빠진다 · 60초 안 같은 값은 한 번) — 옛 app.js · vm 에는 없을 수 있어 typeof 로
function pshLog(feature, item) { if (pshState.noLog) return; if (typeof logFeature === "function") logFeature(feature, item); }
// 배경 목록 · 고른 배경 — 말씀 판은 말씀 액자만(친구 2026-11-05 「기존에 없던 것으로」) · 고른 것도 따로 기억한다(기도문 · 묵상은 「밤하늘 먼저」를 함께 쓴다)
function pshChoices() { return pshState.verse ? verseFrameChoices() : prayShareChoices(); }
function pshKeyGet() { return pshState.verse ? pshState.vkey : pshState.key; }
function pshKeySet(k) { if (pshState.verse) pshState.vkey = k; else pshState.key = k; }
function pshSay(t) { const m = document.getElementById("psh-msg"); if (m) m.textContent = t; }
function pshSendLabel(busy) {
  const s = document.getElementById("psh-send");
  if (!s) return;
  const next = !busy && pshState.linkNext;   // 📖 그림을 보낸 뒤 — 같은 자리 금색 단추가 설치 주소를(엄지가 옮겨 가지 않게)
  s.disabled = !next && (!!busy || !pshState.blob);
  s.classList.toggle("next", next);
  s.textContent = busy ? "그리는 중…" : next ? "이어서 설치 주소 보내기" : pshKakaoOn() ? "문자 · 다른 앱으로 보내기" : "보내기 (카톡 · 문자)";
  pshKakaoBtn(pshState.kakaoBusy ? "busy" : pshState.kakaoReady ? "open" : "");   // 노란 단추도 그림을 따른다(그리는 동안 잠금)
}
function pshLeafSrc() { return "img/frame/leaf" + pshState.leaf + ".webp?v=" + (typeof APP_BUILD === "string" ? APP_BUILD : ""); }
function pshRedraw() {
  const my = ++pshState.gen;
  pshState.blob = null; pshState.linkNext = false;   // 그림이 바뀌면 단추는 다시 「그림 보내기」
  pshState.kakaoReady = ""; pshState.kakaoBusy = null;   // 올리던 옛 그림은 버린다(늦게 와도 표가 달라 무시된다)
  pshSendLabel(true); pshSay("");
  const all = pshChoices();
  const ch = all.find((c) => c.key === pshKeyGet()) || all[0];
  const doc = pshDoc();
  pshDraw(doc, ch, pshState.leaf).then((blob) => {
    if (my !== pshState.gen) return;   // 그사이 이름 · 배경이 또 바뀌었다
    if (pshState.url) { try { URL.revokeObjectURL(pshState.url); } catch (e) {} }
    pshState.blob = blob; pshState.url = URL.createObjectURL(blob); pshState.file = doc.file;
    const img = document.getElementById("psh-img");
    if (img) { img.src = pshState.url; img.alt = doc.alt; }
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
  a.href = pshState.url; a.download = pshState.file || "blessing.jpg"; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
  pshLog("share-save", pshKind());   // 📊 내려받기를 시작했다(되었는지는 모른다 — 아래 말과 같다)
  pshSay("그림 파일 내려받기를 시작했어요.");   // 되었는지는 알 수 없다 — 「시작했어요」까지만(교육 수료증과 같은 말)
}
// ⚠️ 누른 그 탭 안에서 share — 그림은 미리보기 때 만든 pshState.blob(여기서 새로 그리면 사용자 동작이 식어 막힌다)
function pshSend() {
  if (pshState.verse && pshState.linkNext) { pshSendLink(); return; }   // 그림 다음 — 같은 단추가 설치 주소를
  const blob = pshState.blob;
  if (!blob) return;
  let file = null;
  try { file = new File([blob], pshState.file || "blessing.jpg", { type: "image/jpeg" }); } catch (e) {}
  // 그림 한 장만 — 말씀 판의 설치 주소는 그다음 같은 단추로 글만 따로(카톡이 그림에 붙인 글을 버렸다 · 친구 2026-11-05)
  const data = { files: [file] };
  let can = false;
  try { can = !!(file && navigator.share && navigator.canShare && navigator.canShare(data)); } catch (e) {}
  if (can) {
    // 공유 창이 뜨는 사이 한 번 더 누르면 두 번째 share 가 InvalidStateError 로 끝난다 — 그걸 「공유를 못 한다」로 보고 내려받기로 가지 않게(2026-11-04 검토)
    if (pshState.sharing) return;
    pshState.sharing = true;
    // 📊 공유 창에서 앱을 골랐다(resolve)에만 share-sheet — 보냈는지는 모른다 · 닫음(AbortError) · 이미 떠 있음(InvalidStateError)은 세지 않는다
    navigator.share(data).then(() => { pshLog("share-sheet", pshKind()); if (pshState.verse && pshState.withLink) pshLinkNext(); }).catch((err) => {
      if (err && (err.name === "AbortError" || err.name === "InvalidStateError")) return;   // 성도님이 공유 창을 닫았다 · 이미 떠 있다
      pshDownload();
    }).finally(() => { pshState.sharing = false; });
    return;
  }
  pshDownload();
}
// 📖 말씀 판 「설치 주소도 보내기」(친구 2026-11-05 「설치 URL은 연결 해달라고 했는데 없네요」 → 「설치주소 보내기를 check box로」) —
//   켜 두면 그림을 보낸 뒤 같은 단추가 금색 「이어서 설치 주소 보내기」가 되고, 누르면 글만 보낸다. 한 번에 못 보내는 까닭: 카톡이 그림에 붙인 글을
//   버렸고(친구 폰) · 폰은 누를 때마다 공유 창을 하나만 연다(두 번째 share 는 새로 눌러야 한다). 글만 보내면 카톡에서 주소가 눌리는 글이 되고
//   go/app/ 은 대표 그림이 없어 미리보기가 작은 상자다(「URL 박스가 크지 않게」). 공유 창이 없으면 복사해 둔다.
function pshLinkNext() {   // 그림을 보낸 뒤 — 어디로 갔는지는 알 수 없다(「보냈어요」라고 하지 않는다)
  pshState.linkNext = true; pshSendLabel(false);
  pshSay("이어서 설치 주소도 같은 대화방에 보내 주세요.");
}
function pshLinkDone() { pshState.linkNext = false; pshSendLabel(false); }
function pshSendLink() {
  const data = { text: VERSE_SHARE_TEXT };
  let can = false;
  try { can = !!(navigator.share && (!navigator.canShare || navigator.canShare(data))); } catch (e) {}
  if (can) {
    if (pshState.sharing) return;
    pshState.sharing = true;
    navigator.share(data).then(() => { pshLog("share-sheet", 8); pshLinkDone(); pshSay(""); }).catch((err) => {   // 📊 8 = 앱 설치 주소
      if (err && (err.name === "AbortError" || err.name === "InvalidStateError")) return;   // 닫았다 — 금색 단추 그대로(다시 누를 수 있게)
      pshCopyLink();
    }).finally(() => { pshState.sharing = false; });
    return;
  }
  pshCopyLink();
}
function pshCopyLink() {
  pshLinkDone();
  const url = VERSE_SHARE_TEXT.slice(VERSE_SHARE_TEXT.indexOf("https://"));
  const say = () => pshSay("설치 주소: " + url);   // 복사도 못 하면 눈으로 옮겨 적게
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(VERSE_SHARE_TEXT).then(() => { pshLog("share-save", 8); pshSay("설치 주소를 복사했어요. 대화방에 붙여 넣어 주세요."); }, say);   // 📊 복사가 끝났을 때만
      return;
    }
  } catch (e) {}
  say();
}
// 📖 카카오톡으로 보내기(친구 2026-11-05 「URL에 그림도 같이 나오게」) — 카톡 한 통에 말씀 그림(정사각 그대로) + 「앱 설치」 단추.
//   공유 창 길로는 카톡이 그림에 붙인 글을 버린다(카카오 데브톡 2023~2024 같은 보고 · 카카오 답 「SDK 를 쓰라」) — 카카오가 주는 공유
//   (JavaScript SDK · 피드 메시지)로 보낸다. 문자 · 다른 앱은 위 공유 창 길 그대로. 카드 맨 아래 이름은 카카오 앱 이름(친구 「지금 이름을 그대로」).
//   키 = js/config.js 의 KAKAO_JS_KEY(운영 주소에서만 · 공개용 키) · 비면 단추를 안 보인다.
//   SDK 판 · SRI 는 카카오 문서(developers.kakao.com/docs/ko/javascript/download) 값 — 2026-11-05 파일을 받아 sha384 를 다시 계산해 같았다. 판을 바꾸면 둘을 함께.
//   ⚠️ 그림은 카카오 서버에 올려야 카드에 넣을 수 있다(uploadImage · 최대 100일 보관) — 개인정보 안내 세 자리에 그 말이 있어야 한다(키를 넣는 커밋에).
const KAKAO_SDK = { src: "https://t1.kakaocdn.net/kakao_js_sdk/2.8.4/kakao.min.js", integrity: "sha384-BGX7Wb16GmRFagri4bLJV2DgipVZaU2AI812GZtHtHzzDQJnfHasDXN5houxv45w" };
const KAKAO_INSTALL = "https://gocheok.onlybible.kr/install/";
// 크롬은 누른 뒤 5초쯤 지나면 카카오톡을 여는 이동을 막는다 · SDK 도 열기 전에 카카오에 두 번 묻는다(사전 요청 포함 · 그 몫 3초) —
//   올리기가 이보다 늦으면 「카카오톡 열기」로 한 번 더(2026-11-05 검토 — 3초는 빠듯했다)
const KAKAO_WAIT = 2000;
// SDK 받기 · 그림 올리기를 이만큼만 기다린다 — 멈춘 통신에서 단추가 「준비 중」으로 굳지 않게 · 못 받은 SDK 는 다음에 다시(2026-11-05 검토)
const KAKAO_LIMIT = 20000;
function pshLate(p, ms) {
  let t = 0;
  return Promise.race([p, new Promise((ok, no) => { t = setTimeout(() => no(new Error("timeout")), ms); })]).finally(() => clearTimeout(t));
}
// SDK 가 카카오톡 앱으로 여는 기기만(폰 · 아이패드 · 카톡 안 브라우저) — SDK 판별 그대로(2.8.4 소스: 모바일 또는 iOS 태블릿 · 오페라 · 화웨이 브라우저는 뺀다).
//   안드로이드 태블릿 · PC 에서는 카톡이 아니라 카카오 웹 로그인 창이 떠서 단추를 안 보인다(2026-11-05 검토).
function pshKakaoTalkDevice() {
  const ua = String((typeof navigator !== "undefined" && navigator.userAgent) || "").toLowerCase();
  if (/kakaotalk/.test(ua)) return true;
  if (/opr\/|opt\/|huawei/.test(ua)) return false;
  return /iphone|ipod|ipad|android.+mobi/.test(ua) || (/macintosh/.test(ua) && typeof navigator !== "undefined" && navigator.maxTouchPoints > 1);
}
const PSH_KAKAO_IC = '<svg class="psh-kakao-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5c-5.25 0-9.5 3.33-9.5 7.44 0 2.66 1.78 4.99 4.46 6.31-.15.52-.94 3.27-.97 3.49 0 0-.02.16.09.22.1.06.23.01.23.01.3-.04 3.5-2.29 4.05-2.68.53.08 1.08.12 1.64.12 5.25 0 9.5-3.33 9.5-7.44S17.25 3.5 12 3.5z"/></svg>';
function pshKakaoKey() { return typeof KAKAO_JS_KEY === "string" ? KAKAO_JS_KEY.trim() : ""; }
function pshKakaoOn() { return !!document.getElementById("psh-kakao"); }
let pshKakaoP = null;
function pshKakaoLoad() {   // SDK 는 한 번만(못 받았으면 다음에 다시) · 판을 열 때 미리 불러 누르는 순간엔 준비돼 있게
  if (pshKakaoP) return pshKakaoP;
  const key = pshKakaoKey();
  if (!key) return Promise.reject(new Error("kakao-key"));
  pshKakaoP = pshLate(new Promise((ok, no) => {
    const ready = () => {
      try { const K = window.Kakao; if (!K.isInitialized()) K.init(key); ok(K); } catch (e) { no(e); }
    };
    if (window.Kakao && window.Kakao.Share) { ready(); return; }
    const s = document.createElement("script");
    s.src = KAKAO_SDK.src; s.integrity = KAKAO_SDK.integrity; s.crossOrigin = "anonymous"; s.async = true;
    s.onload = ready; s.onerror = () => no(new Error("kakao-sdk"));
    document.head.appendChild(s);
  }), KAKAO_LIMIT).catch((e) => { pshKakaoP = null; throw e; });
  return pshKakaoP;
}
// 카드 — 그림(1080 정사각 · 크기를 알려 줘야 잘리지 않는다) · 제목 「이번 주 말씀 · 누가복음 17장 16절」 · 단추는 「말씀 외워 보기」 하나(그림을 눌러도 같은 곳).
//   (친구 2026-11-06 「설치 주소도 보내기 체크박스 삭제」 · 「카카오톡: 말씀 외워 보기」 — 단추 이름만 · 가는 곳은 아래)
//   폰(mobileWebUrl)은 표 kk=1 을 붙인 우리 첫 화면 → app.js routeKakaoCard: 안드로이드는 앱이 깔려 있으면 앱 첫 화면(카톡 창은 닫힌다) · 없으면 설치 안내 ·
//   아이폰은 늘 설치 안내(친구 「아이폰은 무조건 앱 설치로」) · PC 카카오톡(webUrl)은 설치 안내.
const KAKAO_SITE = "https://gocheok.onlybible.kr/";
function pshKakaoTemplate(v, imageUrl) {
  const ref = String((v && (v.refFull || v.refShort)) || "").trim();
  const link = { mobileWebUrl: KAKAO_SITE + "?kk=1", webUrl: KAKAO_INSTALL };
  return {
    objectType: "feed",
    content: { title: ref ? VERSE_KICKER + " · " + ref : VERSE_KICKER, description: "성경암송 앱을 설치하고 함께 외워 보세요",
               imageUrl, imageWidth: 1080, imageHeight: 1080, link },
    buttons: [{ title: "말씀 외워 보기", link }],
  };
}
// 카카오로 못 보냈다 — 숨겨 둔 「문자 · 다른 앱으로 보내기」를 꺼내 보낼 길을 남긴다(친구 2026-11-05 「카카오톡으로 보내기만 남겨 주세요」 — 평소엔 숨김)
function pshKakaoFallback(msg) {
  const s = document.getElementById("psh-send");
  if (s) s.hidden = false;
  pshSay(msg);
}
function pshKakaoBtn(st) {   // "" = 보통 · busy = 올리는 중(잠금) · open = 늦었으니 한 번 더 · 그림이 없으면(그리는 중) 잠근다
  const b = document.getElementById("psh-kakao");
  if (!b) return;
  b.disabled = st === "busy" || !pshState.blob;
  b.classList.toggle("next", st === "open");
  const t = b.querySelector(".psh-kakao-t");
  if (t) t.textContent = st === "busy" ? "카카오톡 준비 중…" : st === "open" ? "카카오톡 열기" : "카카오톡으로 보내기";
}
// ⚠️ sendDefault 는 결과를 돌려주지 않는다 — 여기 try/catch 는 꼴 검사(동기)만 잡는다. 모바일에서 SDK 가 카카오에 묻는 요청이 실패하면
//   SDK 가 이 화면을 sharer.kakao.com/picker/failed 로 옮긴다(2.8.4 소스 · 2026-11-05 검토) — 그래서 통신이 끊겼으면 부르지 않는다.
function pshKakaoGo(url) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) { pshSay("인터넷에 연결되지 않았어요. 연결된 뒤 다시 눌러 주세요."); return; }
  try { window.Kakao.Share.sendDefault(pshKakaoTemplate(pshState.verse, url)); }
  catch (e) { pshKakaoFallback("카카오톡을 열지 못했어요. 아래 「문자 · 다른 앱으로 보내기」로 보내 주세요."); return; }
  pshLog("share-kakao", 3);   // 📊 sendDefault 가 던지지 않았다 = 카카오톡을 열었다(보냈는지는 모른다 · 첫 누름 · 늦게 뜬 「카카오톡 열기」 둘 다 여기)
  // 카카오톡이 열리면 이 화면은 가려진다 — 6초 뒤에도 판이 보이면 안 열렸을 수 있다(누른 동작이 식었다 · 「열리지 않았으면」까지만 말한다)
  clearTimeout(pshState.kakaoT);
  pshState.kakaoT = setTimeout(() => {
    if (document.visibilityState === "visible" && pshKakaoOn()) pshSay("카카오톡이 열리지 않았으면 한 번 더 눌러 주세요.");
  }, 6000);
}
function pshKakaoSend() {
  if (pshState.kakaoReady) {   // 늦게 올라간 그림 — 지금 누른 동작으로 곧바로 연다
    const u = pshState.kakaoReady;
    pshState.kakaoReady = ""; pshKakaoBtn(""); pshSay("");
    pshKakaoGo(u);
    return;
  }
  const blob = pshState.blob, v = pshState.verse;
  if (!blob || !v || pshState.kakaoBusy) return;
  // 차례마다 표 하나 — 액자를 바꾸거나(pshRedraw) 판을 닫으면(prayShareClose) 표를 버리고, 늦게 온 옛 결과는 표가 달라 아무것도 안 바꾼다.
  //   공유 창 잠금(sharing)은 쓰지 않는다 — 올리는 동안에도 「문자 · 다른 앱으로 보내기」 · 다른 판은 그대로 눌린다(2026-11-05 검토).
  const t0 = Date.now(), tok = {}, tag = pshKeyGet() + "|" + pshState.file + "|" + blob.size;
  pshState.kakaoBusy = tok; pshKakaoBtn("busy"); pshSay("");   // 지난 말(「안 열렸으면」 등)은 지운다
  let file = null;
  try { file = new File([blob], pshState.file || "verse.jpg", { type: "image/jpeg" }); } catch (e) {}
  const up = pshState.kakaoUp[tag] ? Promise.resolve(pshState.kakaoUp[tag])
    : pshLate(pshKakaoLoad().then((K) => K.Share.uploadImage({ file: [file] })), KAKAO_LIMIT).then((r) => (pshState.kakaoUp[tag] = r.infos.original.url));
  up.then((url) => {
    if (pshState.kakaoBusy !== tok) return;   // 그사이 액자를 바꿨거나 판을 닫았다 — 버린다
    pshState.kakaoBusy = null;
    if (Date.now() - t0 > KAKAO_WAIT || pshState.sharing) {   // 누른 동작이 식었다 · 다른 공유 창이 떠 있다 — 한 번 더 누르게
      pshState.kakaoReady = url; pshKakaoBtn("open");
      pshSay("준비됐어요. 「카카오톡 열기」를 눌러 주세요.");
      return;
    }
    pshKakaoBtn(""); pshKakaoGo(url);
  }).catch(() => {
    if (pshState.kakaoBusy !== tok) return;
    pshState.kakaoBusy = null; pshKakaoBtn("");
    pshKakaoFallback("카카오톡으로 보내지 못했어요. 아래 「문자 · 다른 앱으로 보내기」로 보내 주세요.");
  });
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
  pshState.blob = null; pshState.kakaoReady = ""; pshState.kakaoBusy = null; clearTimeout(pshState.kakaoT);   // 올린 그림 주소(kakaoUp)는 남긴다 — 다시 열어 같은 그림이면 또 올리지 않게
  document.body.classList.remove("psh-on");
  if (w) w.remove();
}
// 기도문 화면 · 「🙏 오늘의 기도」 창이 부른다 — 이름 칸이 있다(처음 값 name)
function openPrayShare(b, name) {
  if (!b) return;
  if (pshReuse("pray")) { pshState.b = b; pshState.med = null; pshState.verse = null; pshState.noLog = false; pshRedraw(); return; }   // 단추를 두 번 눌러 또 불렸다 — 열린 판을 그대로
  prayShareClose();
  pshState.b = b; pshState.med = null; pshState.verse = null;
  pshState.name = prayShareName(name);
  pshOpen(PSH_TITLE_PRAY, true, name, "pray");
}
// 「🌿 오늘의 묵상」 창이 부른다(2026-11-04 친구) — m = { heading, message, question, sermonTitle, verseRef, no(구절), idx(요일) } · 이름 칸 없음
//   opts.preview = 관리자 묵상 미리보기(?preview=daily → app.js showMeditationModal 의 source "preview")에서 연 판 — 이 판에서 일어난 일은 이용 기록에 남기지 않는다(2026-11-06)
function openMedShare(m, opts) {
  if (!m || !(m.message || m.question)) return;
  const noLog = !!(opts && opts.preview);
  if (pshReuse("med")) { pshState.b = null; pshState.med = m; pshState.verse = null; pshState.noLog = noLog; pshRedraw(); return; }
  prayShareClose();
  pshState.b = null; pshState.med = m; pshState.verse = null; pshState.name = "";
  pshOpen(PSH_TITLE_MED, false, "", "med", { noLog });
}
// 첫 화면 「이번 주 말씀」 카드의 작은 아이콘이 부른다(2026-11-05 친구) — v = 이번 주 구절({ no, text, refFull, refShort, sermonTitle, pastor, date }) ·
//   이름 칸 없음 · 그림은 말씀 액자(VERSE_FRAMES) · 설치 주소는 그림 다음에 글로 따로(「설치 주소도 보내기」 체크)
function openVerseShare(v) {
  if (!v || !String(v.text || "").trim()) return;
  if (pshReuse("verse")) { pshState.b = null; pshState.med = null; pshState.verse = v; pshState.noLog = false; pshRedraw(); return; }
  prayShareClose();
  pshState.b = null; pshState.med = null; pshState.verse = v; pshState.name = "";
  pshOpen(PSH_TITLE_VERSE, false, "", "verse");
}
// 같은 판이 이미 열려 있나(2026-11-04 검토) — 열린 판을 닫고 다시 열면 prayShareClose 의 history.back() 이 늦게 도착해
//   pshOpen 이 막 단 popstate 받이가 그걸 받고 새 판을 닫는다(빠르게 두 번 누를 때 · 판이 떴다가 사라진다). 그래서 닫지 않고 내용만 바꾼다.
function pshReuse(kind) { const w = document.getElementById("psh"); return !!(w && w.dataset.kind === kind && pshState.pop); }
// kind = "pray" · "med" · "verse"(판 종류 표식 — pshReuse 가 본다 · 말씀 판은 미리보기 칸이 정사각형)
//   「🔗 주소로 보내기」(구절 바로가기)는 뺐다(친구 2026-11-05 — 카톡이 큰 미리보기 상자를 붙였다) · 단추는 한 덩어리(.psh-acts)로 판 아래에 붙는다(갤럭시에서 아래로 숨지 않게) ·
//   키가 있으면 노란 「카카오톡으로 보내기」(위 pshKakaoSend) 하나만(친구 2026-11-05) — 「문자 · 다른 앱으로 보내기」는 숨겨 두고 카카오로 못 보냈을 때만 꺼낸다(pshKakaoFallback).
//   「설치 주소도 보내기」 체크는 뺐다(친구 2026-11-06) — 카톡 카드엔 늘 「앱 설치」 · 공유 창 길은 늘 그림 다음에 설치 주소(pshState.withLink 는 늘 켬).
// 판 아래 안내 — 짧게(친구 2026-11-06 「아래 안내는 간단하게」) · 말씀 판은 카카오 단추가 있느냐에 따라 · 그 밖은 공유 창 한 줄
function pshHintText(kind, kakao) {
  const tail = " 안&nbsp;되면 위 그림을 길게 눌러 저장해 주세요.";
  if (kind !== "verse") return "폰의 공유 창에서 카카오톡이나 메시지를 골라 주세요." + tail;
  if (kakao) return "말씀 그림과 「말씀 외워 보기」 단추가 함께 가요.";
  return "그림을 보낸 뒤 한 번 더 누르면 설치 주소도 가요.";
}
function pshOpen(title, withName, name, kind, opts) {
  pshState.noLog = !!(opts && opts.noLog);   // 📊 opts.noLog = 미리보기 판(openMedShare) — 이 판에서 일어난 일은 남기지 않는다
  pshState.leaf = Math.min(12, 1 + Math.floor(Math.random() * 12));
  const kakao = kind === "verse" && !!pshKakaoKey() && pshKakaoTalkDevice();   // 📖 카카오톡으로 보내기 — 말씀 판 · 키가 있고 · 카카오톡 앱으로 여는 기기만
  const choices = pshChoices();
  if (!choices.some((c) => c.key === pshKeyGet())) pshKeySet(choices[0].key);   // 처음엔 맨 왼쪽(밤하늘) · 이 화면을 쓰는 동안은 마지막에 고른 배경을 기억한다
  const thumb = (c) => {
    const inner = c.thumb ? `<img src="${prayEsc(c.thumb)}?v=${prayEsc(String(APP_BUILD))}" alt="">`   // 사진(photo · veil)은 작은 그림
      : c.style === "night" ? "" : `<img class="psh-leaf" src="${pshLeafSrc()}" alt="">`;
    return `<button type="button" class="psh-t psh-t-${typeof c.style === "string" ? c.style : "vframe"}" role="radio" aria-checked="${c.key === pshKeyGet()}" data-k="${prayEsc(c.key)}" aria-label="${prayEsc(c.label)}">${inner}<i>${prayEsc(c.label)}</i></button>`;
  };
  const wrap = document.createElement("div");
  wrap.className = "psh-dim"; wrap.id = "psh"; wrap.dataset.kind = kind || (withName ? "pray" : "med");
  wrap.innerHTML = `
    <div class="psh-sheet" role="dialog" aria-modal="true" aria-labelledby="psh-h">
      <div class="psh-grab" aria-hidden="true"></div>
      <div class="psh-top"><b id="psh-h">${prayEsc(title)}</b><button type="button" class="psh-x" aria-label="닫기">✕</button></div>
      ${withName ? `<label class="psh-lbl" for="psh-name">누구를 위한 기도인가요?</label>
      <input id="psh-name" class="psh-name" type="text" maxlength="12" autocomplete="off">` : ""}
      <div class="psh-lbl" id="psh-bg-l">배경 고르기</div>
      <div class="psh-thumbs" role="radiogroup" aria-labelledby="psh-bg-l">${choices.map(thumb).join("")}</div>
      <div class="psh-pv"><img id="psh-img" alt=""></div>
      <div class="psh-acts">${kakao ? `<button type="button" class="psh-kakao" id="psh-kakao">${PSH_KAKAO_IC}<span class="psh-kakao-t">카카오톡으로 보내기</span></button>` : ""}
        <button type="button" class="psh-send" id="psh-send"${kakao ? " hidden" : ""} disabled>그리는 중…</button></div>
      <p class="psh-hint" id="psh-hint">${pshHintText(kind, kakao)}</p>
      <p class="psh-msg" id="psh-msg" role="status"></p>
    </div>`;
  document.body.appendChild(wrap);
  document.body.classList.add("psh-on");
  requestAnimationFrame(() => wrap.classList.add("show"));
  wrap.querySelectorAll(".psh-t img").forEach((im) => { im.onerror = () => { im.style.display = "none"; }; });
  const inp = wrap.querySelector("#psh-name");
  if (inp) {
    inp.value = pshState.name === "우리 가정" && !String(name || "").trim() ? "" : pshState.name;   // 글자 그대로(속성에 넣지 않는다)
    inp.addEventListener("input", () => {
      clearTimeout(pshState.timer);
      pshState.gen++; pshState.blob = null; pshSendLabel(true);   // 다 치기 전에 옛 이름 그림이 나가지 않게
      pshState.timer = setTimeout(() => { pshState.name = prayShareName(inp.value); pshRedraw(); }, 300);
    });
  }
  wrap.querySelectorAll(".psh-t").forEach((t) => t.addEventListener("click", () => {
    const k = t.dataset.k;
    // 액자 · 잎을 다시 누르면 다른 잎가지(12가지)
    if (k === pshKeyGet() && (k === "frame" || k === "leaf")) {
      pshState.leaf = pshState.leaf % 12 + 1;
      wrap.querySelectorAll(".psh-leaf").forEach((im) => { im.style.display = ""; im.src = pshLeafSrc(); });
    }
    pshKeySet(k);
    wrap.querySelectorAll(".psh-t").forEach((x) => x.setAttribute("aria-checked", x.dataset.k === k ? "true" : "false"));
    pshRedraw();
  }));
  wrap.querySelector(".psh-x").addEventListener("click", () => prayShareClose());
  wrap.addEventListener("click", (e) => { if (e.target === wrap) prayShareClose(); });
  wrap.querySelector("#psh-send").addEventListener("click", pshSend);
  const kk = wrap.querySelector("#psh-kakao");
  if (kk) {
    kk.addEventListener("click", pshKakaoSend);
    pshKakaoLoad().catch(() => {   // SDK 를 못 받았다(통신 · 막힘 · 20초) — 이 판이 아직 열려 있을 때만 카카오 단추를 거두고 공유 창 길로(다른 판 글을 덮지 않게)
      if (!wrap.isConnected) return;
      kk.remove();
      const h = wrap.querySelector("#psh-hint"); if (h) h.innerHTML = pshHintText("verse", false);
      const s = wrap.querySelector("#psh-send"); if (s) { s.hidden = false; if (!s.disabled) pshSendLabel(false); }   // 숨겨 둔 공유 창 단추를 꺼낸다
    });
  }
  pshState.esc = (e) => { if (e.key === "Escape") prayShareClose(); };
  document.addEventListener("keydown", pshState.esc);
  try { history.pushState({ psh: 1 }, ""); } catch (e) {}   // 안드로이드 「뒤로 가기」로 닫히게
  pshState.pop = () => prayShareClose(true);
  window.addEventListener("popstate", pshState.pop);
  pshRedraw();
  pshLog("share-open", pshKind());   // 📊 새 판만 — 다시 쓰는 판은 여는 쪽(pshReuse)에서 돌아가 여기를 지나지 않는다
}
