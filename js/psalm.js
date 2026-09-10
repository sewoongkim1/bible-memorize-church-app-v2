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
const PSALM_DEFAULT_START = "2026-09-21";   // 서버가 안 알려줄 때 쓰는 값
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

// ⚠️ 복습 중 「← 목록」·「첫 화면으로」로 나가면 psalmReviewCtx 깃발이 안 내려가던 문제가
//    있었다(2026-09-10 리뷰 지적) — 여기서 내리면 renderPsalmReview()는 이 함수를 거치지
//    않고 renderPsalmBlank()를 직접 부르므로 복습 자체는 영향받지 않는다.
function renderPsalmHome() {
  psalmReviewCtx = null;
  stopSpeaking();
  const u = loadUser();
  const app = document.getElementById("app");
  app.innerHTML = `<div class="ps-wrap"><div class="ps-loading">불러오는 중…</div></div>
    <button class="home-fab" id="ps-home" aria-label="첫 화면으로">${homeFabLabel(u, true)}</button>`;
  window.scrollTo(0, 0);
  document.getElementById("ps-home").addEventListener("click", () => { psalmReviewCtx = null; stopSpeaking(); renderSummary(); });

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
    // ⚠️ 서버가 옛 판이면 startDate 가 안 온다 — 그때 「 에 시작해요」로 보였다(2026-09-10).
    const d = (psalmStartDate || PSALM_DEFAULT_START).replace(/-/g, ".");
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

// ⚠️ 고정값이면 안 된다 — 화면이 좁아져도 글씨가 안 줄어 다섯 줄을 넘긴다.
//    (2026-09-10 실측: 320px 에서 폭 46 짜리까지 6줄이 됐다. 옛 PSALM_USABLE_PX=1370은
//    폰 폭 390px 하나만 가정한 고정값이었다 — 아래는 style.css 좌우 여백을 그대로 센 것)
//
// 좌우로 먹는 값(.ps-wrap → .ps-frame → .ps-fr-in, 전부 box-sizing:border-box):
//   .ps-wrap   padding 14px×2                 = 28
//   .ps-frame  border 3px×2 + padding 7px×2   = 20
//   .ps-fr-in  border 1px×2                   = 2
//   .ps-fr-in  padding(좌우, 한쪽) × 2         = PSALM_FR_PAD 또는 PSALM_FR_PAD_NARROW 의 2배
const PSALM_FR_PAD = 30;          // .ps-fr-in 좌우 padding(px, 한쪽) — 기본
const PSALM_FR_PAD_NARROW = 20;   // 좁은 화면 값 — 옛 @media (max-width:340px) 과 같은 수
const PSALM_NARROW_VW = 340;      // 이 기준은 .ps-wrap 의 실제 폭(vw)으로 잰다 — 아래 이유 참고
const PSALM_WASTE = 0.98;         // 줄바꿈 낭비 계수 — tools/psalm-measure.py 로 맞춘 값

// ⚠️ 화면이 좁을 때 .ps-fr-in 좌우 padding 을 줄이는 것을 예전에는 CSS
//    `@media (max-width:340px)` 로만 했다. 그런데 그 미디어쿼리는 **진짜 뷰포트 폭**을
//    보는데, 측정 도구(tools/psalm-measure.py)는 진짜 뷰포트를 못 바꾸고 .ps-wrap 의
//    CSS 폭만 강제로 박아 넣는다(실측: 헤드리스 뷰포트는 754px 고정 — --window-size 를
//    줘도 그렇다는 것이 curl 한글 인코딩·헤드리스 뷰포트 메모와 같은 결의 함정이다).
//    그 상태로는 이 미디어쿼리가 "--width 320" 을 줘도 절대 안 걸려 좁은 화면을 영영
//    테스트할 수 없다. 그래서 이 padding 값도 글씨 크기와 **같은 기준(.ps-wrap 의 실제
//    폭 vw)** 으로 정해 인라인 CSS 변수(--ps-fr-pad)로 박는다 — 글씨 크기 계산과 실제
//    적용되는 여백이 다른 기준을 보면 서로 어긋난다. 옛 미디어쿼리는 지웠다(이 변수가
//    같은 값을 대신한다 — style.css 참고).
function psalmChrome(vw) {
  const narrow = vw <= PSALM_NARROW_VW;
  const pad = narrow ? PSALM_FR_PAD_NARROW : PSALM_FR_PAD;
  return { pad, chrome: 28 + 20 + 2 + pad * 2 };
}

// 액자가 실제로 차지하는 폭(px). .ps-wrap 이 아직 없으면(이 화면에 처음 들어오는 아주
// 짧은 순간) window.innerWidth 로 어림잡는다 — .ps-wrap 은 항상 renderPsalmHome() 이
// 먼저 「불러오는 중…」으로 만들어 두므로 실제로는 거의 이 대체 경로를 안 탄다.
function psalmWrapWidth() {
  const wrap = document.querySelector(".ps-wrap");
  if (wrap) {
    const w = wrap.getBoundingClientRect().width;
    if (w > 0) return w;
  }
  // ⚠️ 폴백은 **실제 .ps-wrap 폭과 같은 식**이어야 한다.
  //    .ps-wrap 은 max-width:520 · padding:14×2 이므로 안쪽 폭 = min(vw, 520) - 28.
  //    옛 식(min(max(vw-40,200),520))은 390px 폰에서 350(실제 362), 넓은 화면에서
  //    520(실제 492)으로 양쪽 다 빗나갔다 — 첫 렌더와 그 뒤 렌더의 글씨가 달라진다.
  return Math.max(200, Math.min(window.innerWidth || 390, 520) - 28);
}

function psalmUsablePx(vw) {
  const line = Math.max(120, vw - psalmChrome(vw).chrome);
  return line * 5 * PSALM_WASTE;
}

// 글씨 크기 설정(⚙️ 「크게」·「아주 크게」)이 상한을 밀어 올린다. 안 올리면 그 설정을
// 켠 분에게는 빈칸(.word-input, style.css의 html[data-fs] 규칙)만 23~31px로 고정되고
// 고정 글자(이 함수의 계산값)는 그대로라 한 문장 안에 두 크기가 섞인다
// (CLAUDE.md 「어려운 도전」이 적어 둔 함정의 재발 — 2026-09-10 리뷰 지적).
// ⚠️ 다섯 줄 예산을 넘기지 않는다 — psalmFitFont는 늘 `min(상한, 이상적값)`을 쓴다.
//    이상적값(psalmUsablePx(vw)/w)은 "다섯 줄에 꼭 맞는" 폰트다. 상한을 올려도
//    실제로 쓰이는 값은 여전히 그 이상적값을 넘지 못한다 — 이상적값이 상한보다
//    작으면 그대로 쓰이고(전과 같다), 크면 상한이 쓰이는데 상한 < 이상적값이라
//    실제 필요한 폭보다 좁게 잡혀 다섯 줄 안에 들어간다. 즉 상한을 얼마나 올리든
//    "다섯 줄을 넘기는" 방향으로는 절대 움직이지 않는다.
function psalmFsCap() {
  const fs = document.documentElement.getAttribute("data-fs");
  return fs === "xl" ? 6 : fs === "lg" ? 3 : 0;
}

function psalmFitFont(verse, vw) {
  const w = psalmWidthEm(verse.text);
  if (!w) return 28;
  return Math.round(Math.max(20, Math.min(34 + psalmFsCap(), psalmUsablePx(vw) / w)));
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
  const vw = psalmWrapWidth();
  const pad = psalmChrome(vw).pad;
  const fs = o.fontSize || psalmFitFont(verse, vw);
  const body = o.bodyHtml != null ? o.bodyHtml : psalmEsc(verse.text);
  return `
    <div class="ps-frame ps-fr-${fr.color} ps-pos-${fr.pos}" style="--ps-lw:${lw}px;--psalm-fs:${fs}px;--ps-fr-pad:${pad}px">
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
// ⚠️ 이 함수는 복습 경로(renderPsalmReview → renderPsalmBlank)를 거치지 않는다 — 그래서
//    맨 앞에서 psalmReviewCtx 를 내려도 복습에 영향이 없다. 정상 암송으로 들어오는
//    자리이니 여기서 내려야 「복습을 중간에 나갔다가 다른 구절을 정상으로 여는」 경우가
//    안전해진다.
function renderPsalmStage(verse, stage) {
  psalmReviewCtx = null;
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

  document.getElementById("ps-home").addEventListener("click", () => { psalmReviewCtx = null; stopSpeaking(); renderSummary(); });
  document.getElementById("ps-back").addEventListener("click", () => { psalmReviewCtx = null; stopSpeaking(); renderPsalmHome(); });
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
        <span class="ps-step">${psalmInReview(verse) ? "복습" : stage + "단계"}</span>
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
    </div>
    <button class="home-fab" id="ps-home" aria-label="첫 화면으로">${homeFabLabel(u, true)}</button>`;
  window.scrollTo(0, 0);

  // ⚠️ 이 화면은 복습(renderPsalmReview)도 함께 쓴다 — 여기서 나가면(복습 중이든 아니든)
  //    깃발을 반드시 내린다. 안 내리면 다음에 여는 아무 시편 구절이나 「복습」으로 찍히고,
  //    그 구절을 정상으로 마쳤을 때 saveProgress 가 건너뛰어진다(2026-09-10 리뷰 지적).
  document.getElementById("ps-home").addEventListener("click", () => { psalmReviewCtx = null; stopSpeaking(); renderSummary(); });
  document.getElementById("ps-back").addEventListener("click", () => { psalmReviewCtx = null; stopSpeaking(); renderPsalmHome(); });
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
// ⚠️ 카드 쟁반을 여기서 만들지 않는다 — app.js 의 setupAutoCheck 가 이미
//    같은 #card-tray 에 자기 쟁반(.wcard)을 만들고, 그것이 나중에 실행되어
//    여기서 만든 것을 덮어쓴다. 예전에 그래서 카드로 푼 암송이 전부
//    typing 으로 기록됐다(2026-09-10 실행으로 확인).
// ⚠️ 카드 여부는 주간 암송 화면(checkAllComplete)과 **같은 뜻**으로 센다 —
//    「카드 모드로 켜 둔 채 마쳤다」. 그래야 두 숫자를 나란히 놓을 수 있다.
function psalmSetupCheck(verse, stage) {
  setupAutoCheck(verse, stage, () => psalmStageDone(verse, stage, isCardMode()));
}

// 이 구절이 그분의 '첫 완주'인가 — saveProgress 보다 먼저 봐야 한다.
// ⚠️ isFirstJourney() 는 전역 verses(주간 35구절)만 센다. 시편만 하시는 분은
//    아무리 마쳐도 계속 true 라 축하 문구가 매번 뜬다 — 시편 쪽도 함께 본다.
function psalmWasFirst() {
  return isFirstJourney() && psalmDoneCount() === 0;
}

let psalmReviewCtx = null;   // 복습 중이면 { queue, idx }

// 깃발이 있고, 지금 보고 있는 구절이 그 복습 큐가 가리키는 바로 그 구절일 때만 "복습"이다.
// ⚠️ 깃발만 보면 나가는 걸 깜빡했을 때(다른 화면으로 갔다가 새 구절을 열어도 깃발이
//    안 내려간 경우) 엉뚱한 구절까지 「복습」으로 찍히고, saveProgress 가 건너뛰어진다
//    (2026-09-10 리뷰 지적). ps-home·ps-back·renderPsalmHome·renderPsalmStage 에서
//    깃발을 내리는 것과 별개로, 여기서도 구절을 한 번 더 맞춰 본다 — 세 번째 방어선.
function psalmInReview(verse) {
  return !!(psalmReviewCtx && verse &&
    psalmReviewCtx.queue[psalmReviewCtx.idx] &&
    psalmReviewCtx.queue[psalmReviewCtx.idx].no === verse.no);
}

// 복습 — 3단계(전체 빈칸)를 액자 안에서. 외울 때와 같은 그림이어야 기억의 고리가 이어진다.
// ⚠️ 깃발을 render 「전에」 세운다 — psalmSetupCheck 가 render 안에서 콜백을 걸기 때문이다.
function renderPsalmReview(queue, idx) {
  psalmReviewCtx = { queue, idx };
  renderPsalmBlank(queue[idx], 3);
}

function psalmStageDone(verse, stage, cardUsed) {
  // 복습 중이면 진도를 다시 저장하지 않는다 — 복습은 간격을 미루는 일이다
  if (psalmInReview(verse)) {
    const { queue, idx } = psalmReviewCtx;
    psalmReviewCtx = null;
    advanceReview(verse.no);
    // ⚠️ postChallenge 는 **구절 객체**를 받는다(verse_no 가 아니다) — app.js:7120.
    // ⚠️ 복습은 review- 접두사로 남긴다(2026-09-02 결정). 보이는 숫자는 안 바뀐다
    //    (순위·통계가 %typing%·includes("typing") 으로 세므로 그대로 들어간다).
    // ⚠️ 복습 화면에는 원래 카드가 없어 `review-typing-card` 가 CHECK 제약에 없다.
    //    카드로 풀었어도 `review-typing` 으로 남긴다 — 구분보다 기록이 먼저다.
    //    구분하고 싶으면 supabase/migrate_modes_card.sql 에 그 값을 **먼저** 더한다.
    postChallenge(verse, "review-typing");
    // ⚠️ 주간 복습(renderReview)과 같은 경로(reviewNext)를 타야 한다 — 여기서 직접
    //    renderReview/renderSummary 로 가르면 큐의 마지막 구절일 때 renderReviewDone
    //    (「🎉 복습 완료!」)을 건너뛰고 첫 화면으로 바로 떨어진다. 시편은 늘 큐의 뒤쪽이라
    //    (startReview 의 pool = verses.concat(psalmVerses)) 시편 복습이 하나라도 있으면
    //    매번 축하 없이 끝나고 있었다(2026-09-10 리뷰 지적). stopSpeaking()도 reviewNext가 한다.
    return reviewNext(queue, idx);
  }
  const wasFirst = psalmWasFirst();
  // ⚠️ 카드 여부는 실제 클릭 횟수가 아니라 isCardMode() 로 본다 — 주간 암송
  //    화면(checkAllComplete)과 같은 뜻이다. 카드 모드에서는 입력칸이
  //    readOnly 라 자판으로 칠 수 없으므로 "카드 모드로 마쳤다"와
  //    "카드로 채웠다"가 이 조합에서는 동치다.
  saveProgress(verse.no, stage, cardUsed ? "card" : "typing");
  if (stage < 3) return renderPsalmStage(verse, stage + 1);
  // 「반복해서 쓰기」가 켜져 있으면 완료 화면을 건너뛰고 바로 새 3단계로 — 주간 암송
  // (checkAllComplete)과 같은 동작. 켜 둔 설정을 새 기능이 조건부로 무시하면 안 된다
  // (v3.181→182 되돌림 사례와 같은 원칙, 2026-09-10 리뷰 지적). 진도 저장(saveProgress)은
  // 이미 위에서 끝났다 — 여기서 또 저장하지 않는다.
  if (isRepeatPractice()) return renderPsalmBlank(verse, 3);
  renderPsalmDone(verse, wasFirst);   // 3단계면 복습은 saveProgress 안에서 이미 예약됐다
}

// 다 외우셨어요 — 시편의 완료 화면. 전역 verses·showStageDoneModal 을 쓰지 않는다
// (그건 주간 35구절에서 「다음 말씀」을 찾으므로 시편에 쓰면 1번 구절로 튕긴다).
function renderPsalmDone(verse, wasFirst) {
  stopSpeaking();
  const u = loadUser();
  // 다음 편 = 열린 것 중 dayNo 가 하나 큰 것. 없으면 오늘 것까지 다 한 것이다.
  const next = psalmVerses.find((v) => v.dayNo === verse.dayNo + 1) || null;
  const done = psalmDoneCount();
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="ps-wrap ps-done">
      <div class="ps-done-icon">🎉</div>
      <div class="ps-done-t">다 외우셨어요!</div>
      <div class="ps-done-ref">${psalmEsc(verse.refFull)}</div>
      ${wasFirst ? FIRST_DONE_HTML : `
        <div class="ps-done-s">말씀 앨범에 담겼고, 복습이 예약됐어요</div>`}
      <div class="ps-done-bar">${psalmTotal}편 중 <b>${done}편</b> 마쳤어요</div>
      ${next
        ? `<button class="ps-go" id="ps-next">다음 말씀 ▶ <span class="ps-next-ref">${psalmEsc(next.refFull)}</span></button>`
        : `<div class="ps-done-wait">오늘 열린 말씀은 여기까지예요 · 내일 한 편이 더 열려요</div>`}
      <button class="ps-tool ps-wide" id="ps-again">↺ 이 말씀 다시 암송</button>
      <button class="ps-tool ps-wide" id="ps-list">지난 말씀 보기</button>
    </div>
    <button class="home-fab" id="ps-home" aria-label="첫 화면으로">${homeFabLabel(u, true)}</button>`;
  window.scrollTo(0, 0);

  document.getElementById("ps-home").addEventListener("click", () => renderSummary());
  document.getElementById("ps-list").addEventListener("click", () => renderPsalmHome());
  document.getElementById("ps-again").addEventListener("click", () => renderPsalmStage(verse, 3));
  const nb = document.getElementById("ps-next");
  if (nb && next) nb.addEventListener("click", () => renderPsalmStage(next, 0));
}
