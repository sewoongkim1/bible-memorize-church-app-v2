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
let psalmLoadedDay = "";      // 캐시가 속한 KST 날짜(YYYY-MM-DD) — 자정 넘김 판별용
                               // (todayYmd 는 app.js 것을 그대로 쓴다 — 새로 만들지 않는다)

function isPsalmNo(no) { return Number(no) > PSALM_NO_BASE; }
function psalmByNo(no) { return psalmVerses.find((v) => v.no === Number(no)) || null; }

async function loadPsalmVerses(force) {
  const today = todayYmd();
  if (psalmLoaded && !force && psalmLoadedDay === today) return psalmVerses;
  const d = await api.getVerses("psalm");
  psalmVerses = (d && d.verses) || [];
  psalmOpen = Number(d && d.openCount) || 0;
  psalmTotal = Number(d && d.totalDays) || 180;
  psalmStartDate = (d && d.startDate) || "";
  psalmLoaded = true;
  psalmLoadedDay = today;
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
      <div class="ps-soon-t">${psalmEsc(d)} 에 시작해요</div>
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
    ${today ? psalmFrameHtml(today) : ""}
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
            <span class="ps-past-ref">${psalmEsc(v.refFull)}</span>
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
        <div class="ps-fr-ref">${psalmEsc(verse.refFull)}</div>
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

// 1~3단계 — 액자는 그대로 있고 안쪽 글자만 빈칸이 된다.
// 「암송카드 한 장을 받아 채워 간다」는 느낌이 여기서 산다.
function renderPsalmBlank(verse, stage) {
  stopSpeaking();
  const u = loadUser();
  const tokens = String(verse.text || "").trim().split(/\s+/);
  const ratio = stage === 1 ? 0.25 : stage === 2 ? 0.65 : 1.0;
  const flags = pickBlankIndices(tokens, ratio);

  const bodyHtml = tokens.map((word, i) => {
    if (!flags[i]) return `<span class="word-fixed">${psalmEsc(word)}</span>`;
    // ⚠️ em 이 아니라 ch 로 잰다 — em 은 --psalm-fs 와 곱해져 큰 글씨 구절에서 액자를 뚫는다.
    const w = Array.from(word).length;
    return `<input class="word-input" data-answer="${psalmEsc(word)}"`
         + ` autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"`
         + ` style="width:${(w + 1) * 1.05}ch" />`;
  }).join(" ");

  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="ps-wrap ps-stage${isCardMode() ? " ps-card-on" : ""}">
      <div class="ps-head">
        <span class="ps-day">${verse.dayNo}일차</span>
        <span class="ps-step">${stage}단계</span>
        <button class="ps-back" id="ps-back">← 목록</button>
      </div>
      ${psalmFrameHtml(verse, { bodyHtml })}
      <div class="ps-tools">
        <button class="ps-tool" id="ps-answer">보기</button>
        <button class="ps-tool" id="ps-listen">🔊 듣기</button>
        <button class="ps-tool" id="ps-mode">${isCardMode() ? "⌨️ 쓰기" : "👆 카드"}</button>
      </div>
      <div id="card-tray" class="card-tray"></div>
      <div id="ps-answer-panel" class="ps-answer" hidden>
        <div class="ps-answer-t">정답</div>
        <div class="ps-answer-b">${tokens.map((w, i) =>
          flags[i] ? `<strong>${psalmEsc(w)}</strong>` : psalmEsc(w)).join(" ")}</div>
        <button class="ps-tool" id="ps-answer-back">돌아가서 계속하기</button>
      </div>
      <div id="ps-result"></div>
    </div>
    <button class="home-fab" id="ps-home" aria-label="첫 화면으로">${homeFabLabel(u, true)}</button>`;
  window.scrollTo(0, 0);

  document.getElementById("ps-home").addEventListener("click", () => { stopSpeaking(); renderSummary(); });
  document.getElementById("ps-back").addEventListener("click", () => { stopSpeaking(); renderPsalmHome(); });
  document.getElementById("ps-listen").addEventListener("click", () => speakText(verseSpokenText(verse)));

  const ap = document.getElementById("ps-answer-panel");
  document.getElementById("ps-answer").addEventListener("click", () => { ap.hidden = false; });
  document.getElementById("ps-answer-back").addEventListener("click", () => { ap.hidden = true; });

  document.getElementById("ps-mode").addEventListener("click", () => {
    setCardMode(!isCardMode());
    renderPsalmBlank(verse, stage);
  });

  psalmSetupCheck(verse, stage);
}

// ⚠️ mode 는 "typing" / "card" 를 보낸다 — 주간 암송 화면과 똑같다.
//    서버(saveProgress)가 learn-typing / learn-typing-card 로 옮겨 주고,
//    제약이 아직 안 넓혀진 DB에서는 조용히 learn-typing 으로 되돌리는 폴백까지 있다.
//    여기서 "learn-typing" 을 직접 보내면 서버가 그것을 다시 매핑해
//    엉뚱한 값이 되거나 제약에 걸린다.
// ⚠️ 시편은 verse_no ≥ 1001 로 이미 갈리므로 새 mode 를 만들지 않는다.
function psalmSetupCheck(verse, stage) {
  let cardUsedHere = false;
  const tray = document.getElementById("card-tray");
  if (isCardMode() && tray) {
    psalmBuildTray(verse, () => { cardUsedHere = true; },
                   () => psalmStageDone(verse, stage, true));
  }
  // 자판 경로 — app.js 의 setupAutoCheck 를 그대로 쓰고 완료만 넘겨받는다.
  setupAutoCheck(verse, stage, () => psalmStageDone(verse, stage, cardUsedHere));
}

// 이 구절이 그분의 '첫 완주'인가 — saveProgress 보다 먼저 봐야 한다.
// ⚠️ isFirstJourney() 는 전역 verses(주간 35구절)만 센다. 시편만 하시는 분은
//    아무리 마쳐도 계속 true 라 축하 문구가 매번 뜬다 — 시편 쪽도 함께 본다.
function psalmWasFirst() {
  return isFirstJourney() && psalmDoneCount() === 0;
}

function psalmStageDone(verse, stage, cardUsed) {
  const wasFirst = psalmWasFirst();
  // ⚠️ 카드 여부는 isCardMode() 가 아니라 실제로 카드를 눌렀는지로 본다 —
  //    카드로 켜 두고 자판으로 치신 분을 카드 사용자로 세면 측정이 흐려진다.
  saveProgress(verse.no, stage, cardUsed ? "card" : "typing");
  if (stage < 3) return renderPsalmStage(verse, stage + 1);
  renderPsalmDone(verse, wasFirst);   // 3단계면 복습은 saveProgress 안에서 이미 예약됐다
}

// 낱말을 눌러 채우는 방식. 자판이 벽인 분이 54명(전체의 32%)이다.
// ⚠️ 쟁반은 액자 「밖」 아래에 둔다 — 안에 넣으면 다섯 줄 규칙이 무의미해진다.
function psalmBuildTray(verse, onCardUse, onAllDone) {
  const tray = document.getElementById("card-tray");
  const inputs = Array.from(document.querySelectorAll(".word-input"));
  if (!tray || !inputs.length) return;

  // ⚠️ norm 은 setupAutoCheck 안의 지역 함수다 — 여기에 따로 둔다.
  //    없이 부르면 카드 모드일 때만 화면이 통째로 멈춘다.
  const norm = (s) => String(s || "").trim().normalize("NFC");

  const words = inputs.map((i) => norm(i.dataset.answer));
  const shuffled = words.slice().sort(() => Math.random() - 0.5);
  tray.innerHTML = shuffled.map((w, k) =>
    `<button class="card-word" data-w="${psalmEsc(w)}" data-k="${k}">${psalmEsc(w)}</button>`).join("");

  tray.addEventListener("click", (e) => {
    const b = e.target.closest(".card-word");
    if (!b || b.disabled) return;
    const target = inputs.find((i) => !i.classList.contains("correct"));
    if (!target) return;
    if (norm(target.dataset.answer) !== norm(b.dataset.w)) {
      b.classList.add("shake");
      setTimeout(() => b.classList.remove("shake"), 320);
      return;
    }
    target.value = norm(target.dataset.answer);
    target.classList.add("correct");
    b.disabled = true;
    onCardUse();
    if (inputs.every((i) => i.classList.contains("correct"))) setTimeout(onAllDone, 260);
  });
}
