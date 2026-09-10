// ============================================================
// 시편 말씀 액자 — 하루에 한 편씩 열리는 시편 180구절 암송
//   설계: docs/superpowers/specs/2026-09-10-psalm-frame-design.html
//
// ⚠️ 시편 구절은 전역 `verses` 배열에 넣지 않는다. 넣는 순간 첫 화면 진행 막대·
//    앨범·어려운 도전·다음 구절 등 여덟 곳의 의미가 통째로 바뀐다.
// ⚠️ 화면에 들어올 때만 받는다 — 첫 화면에서 미리 받으면 글꼴 765KB 사건과 같은 길이다.
// ============================================================

const PSALM_NO_BASE = 1000;   // 시편 구절 번호 = 1000 + day_no. 이 번호가 곧 「시편이다」

let psalmVerses = [];         // 열린 구절만 (서버가 안 열린 것은 안 내려보낸다)
let psalmOpen = 0;            // 오늘까지 열린 편수
let psalmTotal = 180;
let psalmStartDate = "";
let psalmLoaded = false;

function isPsalmNo(no) { return Number(no) > PSALM_NO_BASE; }
function psalmByNo(no) { return psalmVerses.find((v) => v.no === Number(no)) || null; }

async function loadPsalmVerses(force) {
  if (psalmLoaded && !force) return psalmVerses;
  const d = await api.getVerses("psalm");
  psalmVerses = (d && d.verses) || [];
  psalmOpen = Number(d && d.openCount) || 0;
  psalmTotal = Number(d && d.totalDays) || 180;
  psalmStartDate = (d && d.startDate) || "";
  psalmLoaded = true;
  return psalmVerses;
}

// 오늘의 한 편 = 열린 것 중 마지막(dayNo === psalmOpen)
function psalmToday() {
  if (!psalmVerses.length) return null;
  return psalmVerses.find((v) => v.dayNo === psalmOpen) || psalmVerses[psalmVerses.length - 1];
}

// 몇 편을 3단계까지 마쳤나 — getPassedStage 는 app.js 의 것을 그대로 쓴다
function psalmDoneCount() {
  return psalmVerses.filter((v) => getPassedStage(v.no) >= 3).length;
}

function renderPsalmHome() {
  stopSpeaking();
  const u = loadUser();
  const app = document.getElementById("app");
  app.innerHTML = `<div class="ps-wrap"><div class="ps-loading">불러오는 중…</div></div>
    <button class="home-fab" id="ps-home" aria-label="첫 화면으로">${homeFabLabel(u, true)}</button>`;
  window.scrollTo(0, 0);
  document.getElementById("ps-home").addEventListener("click", () => { stopSpeaking(); renderSummary(); });

  loadPsalmVerses().then(() => drawPsalmHome()).catch(() => {
    const el = document.querySelector(".ps-loading");
    if (el) el.textContent = "말씀을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.";
  });
}

function drawPsalmHome() {
  const wrap = document.querySelector(".ps-wrap");
  if (!wrap) return;

  // 아직 시작 전
  if (psalmOpen <= 0) {
    const d = psalmStartDate ? psalmStartDate.replace(/-/g, ".") : "";
    wrap.innerHTML = `<div class="ps-soon">
      <div class="ps-soon-icon">📿</div>
      <div class="ps-soon-t">${d} 에 시작해요</div>
      <div class="ps-soon-s">시편 말씀을 하루에 한 편씩 함께 외웁니다</div>
    </div>`;
    return;
  }

  const today = psalmToday();
  const done = psalmDoneCount();
  const past = psalmVerses.filter((v) => v.dayNo !== (today && today.dayNo))
                          .sort((a, b) => b.dayNo - a.dayNo);

  // 늦게 오신 분을 달랜다 — 「49편이나 밀렸다」로 읽히지 않게 하는 것이 이 줄이 하는 일 전부다
  const catchUp = past.length >= 7
    ? `<div class="ps-catch">지난 말씀 ${past.length}편이 기다리고 있어요 · 서두르지 않으셔도 돼요</div>`
    : "";

  wrap.innerHTML = `
    <div class="ps-head">
      <span class="ps-day">${psalmOpen}일차</span>
      <span class="ps-total">전체 ${psalmTotal}편</span>
    </div>
    ${today ? psalmFrameHtml(today, { preview: true }) : ""}
    <button class="ps-go" id="ps-start">외우기 시작</button>
    <div class="ps-progress">${done > 0
      ? `${psalmTotal}편 중 <b>${done}편</b> 마쳤어요`
      : "아직 시작 전이에요 · 오늘 한 편부터"}</div>
    ${catchUp}
    ${past.length ? `
      <button class="ps-acc-btn" id="ps-past-btn" aria-expanded="false" aria-controls="ps-past">
        지난 말씀 ${past.length}편 <span class="ps-caret">▾</span>
      </button>
      <div class="ps-acc" id="ps-past" hidden>
        ${past.map((v) => `
          <button class="ps-past-row" data-no="${v.no}">
            <span class="ps-past-day">${v.dayNo}일차</span>
            <span class="ps-past-ref">${v.refFull}</span>
            <span class="ps-past-mark">${getPassedStage(v.no) >= 3 ? "✅" : ""}</span>
          </button>`).join("")}
      </div>` : ""}
  `;

  const go = document.getElementById("ps-start");
  if (go && today) go.addEventListener("click", () => renderPsalmStage(today, 0));

  const pb = document.getElementById("ps-past-btn");
  if (pb) pb.addEventListener("click", () => {
    const box = document.getElementById("ps-past");
    const open = pb.getAttribute("aria-expanded") === "true";
    pb.setAttribute("aria-expanded", String(!open));
    box.hidden = open;
  });

  wrap.querySelectorAll(".ps-past-row").forEach((b) => {
    b.addEventListener("click", () => {
      const v = psalmByNo(b.dataset.no);
      if (v) renderPsalmStage(v, 0);
    });
  });
}

// 액자 = 색(금색/군청) × 잎가지(1~12). 구절마다 고정이다 —
// 무작위로 하면 「같은 그림이 기억의 고리」가 되지 못한다.
// 색은 잎가지 번호의 홀짝으로 가른다(둘 다 12장에 고르게 퍼진다).
function psalmFrame(verse) {
  const art = Math.min(12, Math.max(1, Number(verse.frameArt) || 1));
  return { art, color: art % 2 ? "gold" : "navy", pos: art % 3 === 0 ? "d" : "b" };
}

// 3단계에서 차지하는 가로 길이(em) = 글자수(공백 제외) + 낱말수.
// 빈칸(.word-input)이 낱말마다 1em 씩 넓어지기 때문이다 — 0단계 기준으로 재면
// 3단계에서 6~7줄이 되어 액자를 뚫는다. tools/psalm-fit.py 와 같은 식이다.
function psalmWidthEm(text) {
  const t = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (!t.length) return 0;
  return t.join("").length + t.length;
}

const PSALM_USABLE_PX = 1370;   // 액자 안쪽 322px × 5줄 × 낭비 15%
function psalmFitFont(verse) {
  const w = psalmWidthEm(verse.text);
  if (!w) return 28;
  return Math.round(Math.max(20, Math.min(34, PSALM_USABLE_PX / w)));
}

function psalmEsc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ⚠️ 액자 색(--ps-fr)은 바깥 상자에 붙인다 — ❖ 장식도 같은 색을 쓰는데
//    CSS 변수는 형제에게 안 내려가고 자손에게만 내려간다(기도문 액자에서 배운 것).
// ⚠️ 잎가지 폭은 「화면의 짧은 쪽」 기준 픽셀로 넣는다 — %로 두면 액자의 가로를 따라
//    돌려 보기에서 두 배로 부푼다.
function psalmFrameHtml(verse, opts) {
  const o = opts || {};
  const fr = psalmFrame(verse);
  const leaf = "img/frame/leaf" + fr.art + ".webp?v=" + APP_BUILD;
  const shortSide = Math.min(window.innerWidth || 390, window.innerHeight || 700);
  const lw = Math.round(shortSide * 0.28);
  const fs = o.fontSize || psalmFitFont(verse);
  const body = o.bodyHtml != null ? o.bodyHtml : psalmEsc(verse.text);
  return `
    <div class="ps-frame ps-fr-${fr.color} ps-pos-${fr.pos}" style="--ps-lw:${lw}px;--psalm-fs:${fs}px">
      <img class="ps-leaf l" src="${leaf}" alt="" aria-hidden="true">
      <img class="ps-leaf r" src="${leaf}" alt="" aria-hidden="true">
      <div class="ps-fr-in">
        <div class="ps-fr-ref">${verse.refFull}</div>
        <div class="ps-fr-orn" aria-hidden="true"><i></i>${PRAY_ORN}<i></i></div>
        <div class="ps-fr-body">${body}</div>
      </div>
    </div>`;
}

// 0단계 — 읽고 들어보는 칸. 횟수를 세지 않는다.
// 준비되셨다 싶을 때 누르시면 된다 — 이미 외우신 분께 걸림돌을 두지 않는다.
function renderPsalmStage(verse, stage) {
  if (stage > 0) return renderPsalmBlank(verse, stage);   // Task 6
  stopSpeaking();
  const u = loadUser();
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="ps-wrap ps-stage">
      <div class="ps-head">
        <span class="ps-day">${verse.dayNo}일차</span>
        <span class="ps-step">읽어 보세요</span>
        <button class="ps-back" id="ps-back">← 목록</button>
      </div>
      ${psalmFrameHtml(verse)}
      <div class="ps-tools">
        <button class="ps-tool" id="ps-listen">🔊 들어보기</button>
      </div>
      <button class="ps-go" id="ps-next">다음 →</button>
    </div>
    <button class="home-fab" id="ps-home" aria-label="첫 화면으로">${homeFabLabel(u, true)}</button>`;
  window.scrollTo(0, 0);

  document.getElementById("ps-home").addEventListener("click", () => { stopSpeaking(); renderSummary(); });
  document.getElementById("ps-back").addEventListener("click", () => { stopSpeaking(); renderPsalmHome(); });
  document.getElementById("ps-next").addEventListener("click", () => {
    stopSpeaking();
    const passed = getPassedStage(verse.no);
    renderPsalmStage(verse, passed >= 3 ? 1 : Math.min(3, passed + 1));
  });

  // 낭독은 「요절 → (쉼) → 말씀」 — 앨범·말씀 목록과 같은 순서다.
  document.getElementById("ps-listen").addEventListener("click", () => {
    speakText(verseSpokenText({ ...verse, refFull: verse.refFull, text: verse.text }));
  });
}
