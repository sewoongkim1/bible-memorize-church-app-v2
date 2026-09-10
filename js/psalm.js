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
            <span class="ps-past-mark">${psalmMark(v)}</span>
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

// 지난 말씀 줄의 표식 — 마친 편은 ✅, 그중 「마음에 둠」까지 하신 편은 👑 을 함께 단다.
// ⚠️ ✅ 만 그리면 「마음에 둠」이 시편 안에서 아무 데도 안 보인다 — 주간은 목록 카드에
//    👑 리본(.heart-ribbon)이 있고 앨범 카드에도 왕관이 붙는데, 시편에서 체크할 자리만
//    만들고 보일 자리를 안 만들면 체크한 분께 그것이 어디로 갔는지 알 길이 없다.
function psalmMark(v) {
  if (getPassedStage(v.no) < 3) return "";
  return isHearted(v.no) ? "✅👑" : "✅";
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
// ⚠️ **글씨 크기를 여기서 계산하지 않는다.** 성경암송 화면(.test-sentence)과 **같은
//    글꼴·같은 크기**를 쓴다(style.css). 성도님 결정(2026-09-10): 「폰트 및 크기는
//    성경암송과 같게 하는 게 어떨까요」.
//
//    그전에는 「다섯 줄에 꼭 맞는 글씨」를 화면 폭으로 계산했는데, 그 장치 하나에서
//    하루에 결함이 셋 나왔다 —
//      · 폭을 1370px 고정값으로 둬 320px 폰에서 상한 안쪽 구절까지 넘쳤다
//      · 폴백이 실제 .ps-wrap 폭과 다른 식이라 첫 렌더와 그 뒤 렌더의 글씨가 달랐다
//      · 빈칸 폭을 ch 로 재 「여호와는」이 「여호와」로 잘렸다
//    계산을 없애니 셋이 한꺼번에 사라진다. 그리고 **같은 말씀이 화면마다 같은 글씨로**
//    보인다 — 성도님이 암송 화면과 액자를 오가며 쓰기 때문에 그게 더 중요하다.
//
//    「액자에 다섯 줄」은 이제 **구절을 고를 때의 잣대**다(렌더링 제약이 아니다).
//    tools/psalm-fit.py 가 `글자수 + 낱말수 ≤ 76` 으로 거르고,
//    tools/psalm-measure.py 가 실제로 몇 줄인지 재 준다.

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
  const body = o.bodyHtml != null ? o.bodyHtml : psalmEsc(verse.text);
  return `
    <div class="ps-frame ps-fr-${fr.color} ps-pos-${fr.pos}" style="--ps-lw:${lw}px">
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
    // ⚠️ 마음에 둔 편은 곧바로 3단계로 — 체크 문구가 「다음부터 바로 3단계로 시작해요」라고
    //    약속하기 때문이다(app.js 의 heartCheckHtml). 시편 진입은 늘 renderPsalmStage(v, 0)
    //    → 「다음 →」이라, 이 줄이 없으면 마음에 둔 편도 1단계부터 다시 시작해 그 약속이
    //    시편에서만 거짓이 된다. 판단은 app.js 의 startTest 것을 그대로 옮겼다
    //    (마음에 두었고 + 실제로 3단계를 마쳤을 때만).
    if (isHearted(verse.no) && passed >= 3) return renderPsalmStage(verse, 3);
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
    // ⚠️ **한글은 `em` 이다. `ch` 를 쓰면 안 된다.**
    //    1ch 는 숫자 「0」의 폭(≈0.5em)이라, 네 글자 칸이 두 글자 반 크기가 되어
    //    「여호와는」이 「여호와」로 잘린다(성도님 제보 2026-09-10, 운영 미리보기).
    //    주간 암송 화면(app.js renderTestScreen)도 한글은 em, ch 는 영어에만 쓴다.
    //    em 은 이 칸의 글씨 크기(암송 화면과 같은 값)를 가리키므로,
    //    psalmWidthEm(글자수+낱말수)이 그대로 한 줄 폭의 합이 된다.
    const w = Array.from(word).length;
    return `<input class="word-input" data-answer="${psalmEsc(word)}"`
         + ` autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"`
         + ` style="width:${w + 1}em" />`;
  }).join(" ");

  // 3단계에만 — 주간 암송 화면(app.js renderTestScreen)에 있던 것을 그대로 가져온다.
  //  · 🔁 반복해서 쓰기 : psalmStageDone 이 이미 isRepeatPractice() 를 읽고 따르는데
  //    켜고 끄는 자리가 시편 화면에만 없었다. 읽기만 하고 켤 수 없는 설정은 없는 것과 같다.
  //    ⚠️ 복습에는 두지 않는다 — 주간 복습 화면(renderReview)에도 없고, psalmStageDone 의
  //    복습 갈래가 isRepeatPractice() 를 보기 전에 return 하므로 켜도 아무 일이 안 일어난다.
  //  · 👑 마음에 둠 : 3단계에 들어오면 곧바로 체크할 수 있다(다 맞혀야 풀리는 잠금은 주간에서
  //    이미 없앴다 — 반복해서 쓰기가 켜져 있으면 정답 직후 화면이 바뀌어 체크할 틈이 없다).
  //    복습에도 둔다 — 주간 복습 화면이 그렇게 하고 있다.
  const repeatHtml = (stage === 3 && !psalmInReview(verse)) ? `
        <label class="repeat-toggle" id="repeat-label">
          <input type="checkbox" id="repeat-check"${isRepeatPractice() ? " checked" : ""} />
          <span class="repeat-text">🔁 반복해서 쓰기</span>
          <span class="repeat-desc">외울 때까지, 정답을 맞히면 자동으로 다시 써요</span>
        </label>` : "";
  const heartHtml = stage === 3 ? heartCheckHtml(verse) : "";

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
      <div id="ps-result" class="ps-result"></div>
      ${repeatHtml}
      ${heartHtml}
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

  // 「반복해서 쓰기」 저장 — 주간 화면과 같은 열쇠(REPEAT_KEY)라 한쪽에서 켜면 양쪽이 켜진다.
  const repeatInput = document.getElementById("repeat-check");
  if (repeatInput) repeatInput.addEventListener("change", () => setRepeatPractice(repeatInput.checked));
  // 「마음에 둠」 체크 — 꼬리표 없이(화면에 한 벌뿐이다). 주간처럼 축하창을 띄운다.
  setupHeartCheck(verse);

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
  if (stage < 3) {
    // ⚠️ 「반복해서 쓰기」를 켜 두신 분께는 창을 띄우지 않는다 — 그 토글의 뜻이 「멈추지 말고
    //    계속」이라, 새로 만든 창이 그 흐름 앞을 가로막으면 켜 둔 설정을 무시하는 것이 된다
    //    (v3.181→182 되돌림과 같은 원칙).
    // ⚠️ 복습은 이 함수 맨 위에서 이미 return 했으므로 여기까지 오지 않는다 — 그래도 한 번 더
    //    본다(psalmInReview 가 깃발과 구절을 함께 맞춰 보는 세 번째 방어선인 것과 같은 이유).
    if (isRepeatPractice() || psalmInReview(verse)) return renderPsalmStage(verse, stage + 1);
    // ⚠️ 화면에도 「N+1단계로」를 남긴 뒤에 창을 띄운다 — 창은 Escape·바깥 탭으로 닫힐
    //    수 있고, 폰에서는 카드 밖을 건드리기가 쉬다. 그때 뒤 화면에 갈 길이 없으면
    //    빈칸이 전부 초록인 채 멈춰 있는 화면에 갇힌다(「← 목록」만 남는다).
    //    주간 암송도 같은 이유로 #result-area 에 단추를 먼저 넣고 창을 띄운다
    //    (app.js checkAllComplete). 그 순서를 그대로 따른다.
    const rs = document.getElementById("ps-result");
    if (rs) {
      rs.innerHTML = `<button class="ps-go" id="ps-next-stage">${stage + 1}단계로</button>`;
      document.getElementById("ps-next-stage")
        .addEventListener("click", () => renderPsalmStage(verse, stage + 1));
    }
    return psalmStageModal(verse, stage, wasFirst);
  }
  // 「반복해서 쓰기」가 켜져 있으면 완료 화면을 건너뛰고 바로 새 3단계로 — 주간 암송
  // (checkAllComplete)과 같은 동작. 켜 둔 설정을 새 기능이 조건부로 무시하면 안 된다
  // (v3.181→182 되돌림 사례와 같은 원칙, 2026-09-10 리뷰 지적). 진도 저장(saveProgress)은
  // 이미 위에서 끝났다 — 여기서 또 저장하지 않는다.
  if (isRepeatPractice()) return renderPsalmBlank(verse, 3);
  renderPsalmDone(verse, wasFirst);   // 3단계면 복습은 saveProgress 안에서 이미 예약됐다
}

// 단계 완료 창(1·2단계) — 주간 암송의 showStageDoneModal 과 같은 생김새·같은 조작이다.
//   Enter·스페이스 = 기본 단추 · Escape·바깥 탭 = 그냥 닫기(뒤 화면이 그대로 남는다).
// 왜 창인가: 그전에는 마지막 빈칸을 채우면 아무 말 없이 다음 단계가 그려졌다 — 큰 글씨에
//   키보드까지 올라와 있으면 화면이 바뀐 것조차 모르고, 다 외우고도 끝난 줄 모르고 앉아
//   계신다. 주간 암송에서 같은 이유로 만든 창이 시편에만 없었다.
// ⚠️ showStageDoneModal 을 그대로 쓸 수 없다 — 전역 verses(주간 35구절)에서 「다음 말씀」을
//    찾으므로 시편 구절이 오면 idx = -1 이 되어 엉뚱한 구절로 튕긴다.
// ⚠️ 3단계에는 이 창을 띄우지 않는다 — 이미 renderPsalmDone 이 온 화면으로 축하한다. 창까지
//    겹치면 두 겹이 되어 Enter 한 번에 둘 다 닫힌다(주간에서 배운 것).
// ⚠️ id 에 ps- 를 붙인다 — app.js 의 sd-main·sd-again·sd-list 와 부딪히면 안 된다.
function psalmStageModal(verse, stage, wasFirst) {
  const wrap = document.createElement("div");
  wrap.className = "cheer-overlay stage-done";
  wrap.innerHTML = `
    <div class="cheer-card" role="dialog" aria-modal="true">
      <div class="cheer-icon">✅</div>
      <div class="cheer-ref">${stage}단계 완료!</div>
      ${wasFirst && STEP_CHEER[stage] ? `<div class="cheer-msg">${STEP_CHEER[stage]}</div>` : ""}
      <button class="cheer-ok" id="ps-sd-main">${stage + 1}단계로 계속하기</button>
      <div class="sd-sub">
        <button class="sd-btn" id="ps-sd-again">이 단계 다시</button>
        <button class="sd-btn" id="ps-sd-list">목록으로</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add("show"));

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKey, true);
    wrap.classList.remove("show");
    setTimeout(() => wrap.remove(), 250);
  };
  const go = (fn) => { close(); if (fn) setTimeout(fn, 60); };
  const main = () => go(() => renderPsalmStage(verse, stage + 1));
  // ⚠️ 캡처 단계에서 듣는다 — 빈칸(.word-input)이 키를 먼저 먹으면 Enter 가 창에 안 닿는다.
  const onKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    e.stopPropagation();
    main();
  };
  document.addEventListener("keydown", onKey, true);

  const mainBtn = document.getElementById("ps-sd-main");
  mainBtn.addEventListener("click", main);
  document.getElementById("ps-sd-again")
    .addEventListener("click", () => go(() => renderPsalmStage(verse, stage)));
  document.getElementById("ps-sd-list").addEventListener("click", () => go(renderPsalmHome));
  wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });
  const focus = () => { try { mainBtn.focus({ preventScroll: true }); } catch (e) { mainBtn.focus(); } };
  focus();
  setTimeout(focus, 80);   // 키보드가 내려가며 초점을 뺏길 수 있어 한 번 더
}

// 다 외우셨어요 — 시편의 완료 화면. 전역 verses·showStageDoneModal 을 쓰지 않는다
// (그건 주간 35구절에서 「다음 말씀」을 찾으므로 시편에 쓰면 1번 구절로 튕긴다).
function renderPsalmDone(verse, wasFirst) {
  stopSpeaking();
  const u = loadUser();
  // 다음 편 = 열린 것 중 dayNo 가 하나 큰 것. 없으면 오늘 것까지 다 한 것이다.
  const next = psalmVerses.find((v) => v.dayNo === verse.dayNo + 1) || null;
  // 이전 편 = dayNo 가 하나 작은 것. 1일차면 없어서 회색으로 비활성이다.
  // ⚠️ 주간 암송의 완료 화면(renderCompleteNav)에는 처음부터 있던 길인데 시편에만 없어,
  //    앞 편으로 가려면 「지난 말씀 보기」로 목록을 한 번 거쳐야 했다.
  //    psalmVerses 에는 열린 편만 들어 있으므로 dayNo > 1 이면 앞 편은 반드시 있다.
  const prev = psalmVerses.find((v) => v.dayNo === verse.dayNo - 1) || null;
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
      <div class="ps-nav">
        <button class="ps-nav-btn" id="ps-prev"${prev ? "" : " disabled"}>◀ 이전${
          prev ? `<span class="ps-next-ref">${psalmEsc(prev.refFull)}</span>` : ""}</button>
        <button class="ps-nav-btn next" id="ps-next"${next ? "" : " disabled"}>다음 말씀 ▶${
          next ? `<span class="ps-next-ref">${psalmEsc(next.refFull)}</span>` : ""}</button>
      </div>
      ${next ? "" : `<div class="ps-done-wait">오늘 열린 말씀은 여기까지예요 · 내일 한 편이 더 열려요</div>`}
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
  // 「◀ 이전」도 0단계(액자로 읽기)부터 — 앞 편을 다시 만나는 자리라 읽는 것부터가 맞다.
  const pv = document.getElementById("ps-prev");
  if (pv && prev) pv.addEventListener("click", () => renderPsalmStage(prev, 0));
}
