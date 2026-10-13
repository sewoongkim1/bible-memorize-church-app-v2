// ============================================================
// 📚 네비게이토 성경암송(2026-10-13) — 묶음 목록 · 구절 목록 · 3단계 암송 · 단계 완료 창
//   설계 docs/superpowers/specs/2026-10-13-navigators-design.md · 계획 docs/superpowers/plans/2026-10-13-navigators.md
//   ⚠️ 손대기 전에 docs/notes/navigators.md — 번호대(2001~) · 문(naviVisible 은 app.js) · 「모름」과 「없음」 · 쓰면 안 되는 말.
//
//   필요할 때 받는다(app.js LAZY_JS.navi · openNavi — docs/notes/lazy-load.md). 첫 화면이 동기로 부르는 것(문)은 app.js 에 있다.
//   ⚠️ 이 파일의 맨 위 이름은 app.js·처음부터 실리는 js 와 겹치면 안 된다(받는 순간 SyntaxError) — 그래서 nv·NV_ 로 시작한다.
//      app.js 는 이 파일의 이름을 renderNaviHome 하나만(typeof 로 지켜) 부른다(tests/lazy-load.test.cjs).
//
//   ⚠️ 주간 암송 화면(startTest·renderTestScreen·showStageDoneModal·renderCompleteNav)은 쓰지 않는다 — 「← 목록」·「다음 말씀」·
//      완료 이전/다음이 전역 verses(주간)에 묶여 있어, 네비게이토 구절을 넘기면 주간 1번으로 튄다(쉴만한 물가가 먼저 겪었다).
//      생김새(.test-screen)와 공용 부품(pickBlankIndices · setupAutoCheck 의 onDone · 카드 · 반복해서 쓰기 · 마음에 둠)만 빌린다.
//   ⚠️ 네비게이토는 전역 verses 에 넣지 않는다(첫 화면 「N구절 마쳤어요」·이번 주 말씀·다음 말씀·도전 풀·복습 대기열이 바뀐다).
//   ⚠️ 복습·앨범·영어(NIV)·딥링크(?v=)는 1단계에서 네비게이토를 모른다 — 그래서 「앨범에 담겼어요」·「복습이 예약됐어요」를 쓰지 않는다.
// ============================================================

// ── 네비게이토 순수 함수 (여기부터) ──
//   tests/navi.test.cjs 가 이 구간만 잘라 node:vm 에서 돌린다 — 브라우저 전역(document·api·localStorage)·app.js 의 이름을 쓰지 말 것.
// 묶음 — 화면 차례 그대로. code 는 verses.chapter 값(supabase/navi_verses.sql · tools/navi-form-gen.py CHAPTERS)과 같다.
const NV_CHAPTERS = [
  { code: "assurance", title: "그리스도인의 확신" },
  { code: "guide", title: "그리스도인의 생활 지침" },
  { code: "A", title: "새로운 삶" },
  { code: "B", title: "그리스도를 전파함" },
  { code: "C", title: "하나님을 의뢰함" },
  { code: "D", title: "그리스도 제자의 자격" },
  { code: "E", title: "그리스도를 닮아 감" },
];
// 화면에 보일 묶음 이름 — A~E 는 카드 묶음을 부르는 이름 그대로 「A. 새로운 삶」
function nvChapterTitle(code) {
  const c = NV_CHAPTERS.find((x) => x.code === code);
  if (!c) return "";
  return /^[A-E]$/.test(c.code) ? c.code + ". " + c.title : c.title;
}
// 서버 답 → 세 값(스킬 gated-feature ③ — 뭉개면 거짓말이 된다)
//   ok      — 구절이 있다
//   empty   — 서버는 알지만 켜진 카드가 없다(「아직 준비 중이에요」)
//   unknown — 통신 실패 · 서버가 이 갈래를 모르는 옛 판(track:"navi" 를 몰라 **주간 구절**을 돌려준다 — navi:true 표식이 없다) ·
//             칸이 없는 DB(ok:false) — 「지금 불러올 수 없어요」. 주간 말씀을 네비게이토로 그리지 않게 하는 것이 이 값의 일이다.
function nvReadAnswer(d) {
  if (!d || d.ok !== true || d.navi !== true || !Array.isArray(d.verses)) return { state: "unknown", verses: [] };
  const codes = NV_CHAPTERS.map((c) => c.code);
  // ⚠️ 이름을 verses 로 짓지 않는다 — 전역 verses(주간)를 가린다(tests/navi.test.cjs 가 「verses =」를 막는다)
  const cards = d.verses
    .filter((v) => v && Number(v.no) > 2000 && codes.indexOf(v.chapter) >= 0 && String(v.text || "").trim())
    .map((v) => ({
      no: Number(v.no), chapter: v.chapter, topic: String(v.topic || ""),
      refShort: String(v.refShort || ""), refFull: String(v.refFull || v.refShort || ""), text: String(v.text).trim(),
    }))
    .sort((a, b) => a.no - b.no);
  return cards.length ? { state: "ok", verses: cards } : { state: "empty", verses: [] };
}
// 한 묶음의 구절(번호순 — 받은 차례 그대로)
function nvByChapter(list, code) { return (list || []).filter((v) => v.chapter === code); }
// 묶음 안을 주제로 나눈다 — 이어진 같은 주제끼리 한 칸(A~E 는 두 구절씩 · 확신·생활 지침은 한 구절씩)
function nvTopicGroups(list) {
  const out = [];
  (list || []).forEach((v) => {
    const last = out[out.length - 1];
    if (last && last.topic === v.topic) last.verses.push(v);
    else out.push({ topic: v.topic, verses: [v] });
  });
  return out;
}
// 마친(3단계) 수 — passedOf(no) 는 그 구절의 단계(0~3)
function nvDoneCount(list, passedOf) { return (list || []).filter((v) => passedOf(v.no) >= 3).length; }
// 묶음 안 바로 앞 · 바로 뒤(완료 줄의 ◀ 이전 · 다음 ▶)
function nvPrevOf(list, no) { const i = (list || []).findIndex((v) => v.no === no); return i > 0 ? list[i - 1] : null; }
function nvNextOf(list, no) { const i = (list || []).findIndex((v) => v.no === no); return i >= 0 && i < list.length - 1 ? list[i + 1] : null; }
// 다 외운 뒤 완료 창의 큰 단추 — 묶음 안 다음 구절 · 끝이면 아직 안 마친 앞 구절(「남은 말씀」) · 묶음을 다 마쳤으면 null(「묶음 목록으로」)
//   ⚠️ 끝에서 처음으로 그냥 돌려보내지 않는다 — 다 외운 분이 마친 구절로 다시 들어가 갇힌다(주간 2026-09-25 제보와 같은 길).
function nvNextAfter(list, no, passedOf) {
  const next = nvNextOf(list, no);
  if (next) return { verse: next, kind: "next" };
  const left = (list || []).find((v) => v.no !== no && passedOf(v.no) < 3);
  return left ? { verse: left, kind: "left" } : null;
}
// 화면에 쓰는 말 — 전체 수는 쓰지 않는다(마친 수만 · 첫 화면에서 전체 수를 뺀 것과 같은 까닭 — 새로 오신 분께 부담)
const NV_MSG = {
  lead: "주제별로 묶은 암송 말씀이에요. 어느 묶음부터 시작하셔도 돼요.",
  unknown: "말씀을 지금 불러올 수 없어요. 잠시 뒤 다시 열어 주세요.",
  empty: "아직 준비 중이에요.",
  allDone: "🎉 다 마쳤어요",
};
function nvChapterSub(done, total) { return total > 0 && done >= total ? NV_MSG.allDone : done > 0 ? done + "구절 마침" : ""; }
// ── 네비게이토 순수 함수 (여기까지) ──

let nvVerses = [];          // 받은 카드(번호순) — 전역 verses(주간)와 따로 둔다
let nvLoadState = "";       // "" 아직 · "ok" · "empty" · "unknown"
let nvLoadedDay = "";       // 받은 한국 날짜 — 날이 바뀌면 다시 받는다(담당자가 본문을 고쳤을 수 있다)
let nvLoadingP = null;
let nvCurChapter = "";      // 지금 보고 있는 묶음(늦게 온 답이 다른 화면을 덮지 않게)
const NV_CHEV = `<svg class="nv-chev" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 5.5 15.5 12 9 18.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function nvLoad(force) {
  const day = todayYmd();
  if (!force && nvLoadState === "ok" && nvLoadedDay === day) return Promise.resolve(nvLoadState);
  if (nvLoadingP) return nvLoadingP;
  nvLoadingP = Promise.resolve()
    .then(() => api.getVerses("navi"))
    .then((d) => nvReadAnswer(d), () => nvReadAnswer(null))
    .then((r) => {
      nvLoadingP = null;
      // 「모름」이면 전에 받아 둔 카드를 버리지 않는다(통신이 잠깐 끊긴 것뿐일 수 있다) — 받아 둔 것이 있으면 그것으로 그린다
      if (r.state === "unknown" && nvVerses.length) return "ok";
      nvLoadState = r.state;
      nvVerses = r.verses;
      if (r.state === "ok") nvLoadedDay = day;
      return r.state;
    });
  return nvLoadingP;
}
function nvPassed(no) { return getPassedStage(no); }
function nvMsgHtml(state) {
  if (state === "unknown") return `<p class="vl-empty">${NV_MSG.unknown}</p><div class="nv-retry-row"><button type="button" class="ps-tool" id="nv-retry">다시 불러오기</button></div>`;
  return `<p class="vl-empty">${NV_MSG.empty}</p>`;
}
function nvWireRetry(again) {
  const b = document.getElementById("nv-retry");
  if (b) b.addEventListener("click", () => again());
}

// ---------- 묶음 목록 ----------
// app.js openNavi 가 부르는 대표 함수(LAZY_JS.navi.fn) — 첫 화면 「암송 과정」 단추 하나가 들어오는 길이다.
function renderNaviHome() {
  stopSpeaking();
  nvCurChapter = "";
  const u = loadUser();
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="nv-screen">
      <div class="nv-head">
        <h2 class="nv-title">📚 주제별 성경암송</h2>
        <p class="nv-lead">${NV_MSG.lead}</p>
      </div>
      <div class="nv-chapters" id="nv-chapters"><p class="vl-empty">불러오는 중…</p></div>
      <button class="home-fab" id="nv-home" aria-label="첫 화면으로">${homeFabLabel(u, false)}</button>
    </div>`;
  window.scrollTo(0, 0);
  document.getElementById("nv-home").addEventListener("click", () => { albumPlayStop(); renderSummary(); });
  nvLoad().then((state) => nvDrawChapters(state));
}

function nvDrawChapters(state) {
  const box = document.getElementById("nv-chapters");
  if (!box || nvCurChapter) return;   // 그사이 다른 화면으로 갔다
  if (state !== "ok") {
    box.innerHTML = nvMsgHtml(state);
    nvWireRetry(() => { box.innerHTML = `<p class="vl-empty">불러오는 중…</p>`; nvLoad(true).then((s) => nvDrawChapters(s)); });
    return;
  }
  box.innerHTML = NV_CHAPTERS.map((c) => {
    const list = nvByChapter(nvVerses, c.code);
    if (!list.length) return "";
    const done = nvDoneCount(list, nvPassed);
    const sub = nvChapterSub(done, list.length);
    const all = done >= list.length;
    return `<button type="button" class="verse-card nv-ch${all ? " status-done" : ""}" data-ch="${c.code}">
        <span class="nv-ch-main"><span class="nv-ch-name">${psalmEsc(nvChapterTitle(c.code))}</span>${sub ? `<span class="nv-ch-sub">${sub}</span>` : ""}</span>
        ${NV_CHEV}
      </button>`;
  }).join("");
  box.querySelectorAll(".nv-ch").forEach((b) => b.addEventListener("click", () => renderNaviChapter(b.dataset.ch)));
}

// ---------- 구절 목록(묶음 안) ----------
function renderNaviChapter(code) {
  stopSpeaking();
  nvCurChapter = code;
  const u = loadUser();
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="nv-screen">
      <div class="nv-head nv-head-row">
        <h2 class="nv-title">${psalmEsc(nvChapterTitle(code))}</h2>
        <button class="back-btn nv-back" id="nv-back">← 묶음 목록</button>
      </div>
      <div class="rank-filter album-play vl-play" id="nv-play" hidden><button id="nv-play-go" class="ab-go"></button></div>
      <div class="nv-list" id="nv-list"><p class="vl-empty">불러오는 중…</p></div>
      <button class="home-fab" id="nv-home" aria-label="첫 화면으로">${homeFabLabel(u, false)}</button>
    </div>`;
  window.scrollTo(0, 0);
  document.getElementById("nv-back").addEventListener("click", () => { albumPlayStop(); renderNaviHome(); });
  document.getElementById("nv-home").addEventListener("click", () => { albumPlayStop(); renderSummary(); });
  nvLoad().then((state) => nvDrawList(code, state));
}

function nvDrawList(code, state) {
  const box = document.getElementById("nv-list");
  if (!box || nvCurChapter !== code) return;
  const list = state === "ok" ? nvByChapter(nvVerses, code) : [];
  if (!list.length) {
    box.innerHTML = nvMsgHtml(state === "ok" ? "empty" : state);
    nvWireRetry(() => { box.innerHTML = `<p class="vl-empty">불러오는 중…</p>`; nvLoad(true).then((s) => nvDrawList(code, s)); });
    return;
  }
  const heartMap = loadHearted();
  box.innerHTML = "";
  let k = 0;
  nvTopicGroups(list).forEach((g) => {
    const sec = document.createElement("section");
    sec.className = "nv-topic";
    sec.innerHTML = `<h3 class="nv-topic-t">${psalmEsc(g.topic)}</h3><div class="verse-grid"></div>`;
    const grid = sec.querySelector(".verse-grid");
    g.verses.forEach((v) => { k += 1; grid.appendChild(nvCard(v, k, heartMap)); });
    box.appendChild(sec);
  });
  // ▶️ 이 묶음 듣기 — 말씀 목록 「전체 듣기」와 같은 재생기(앨범 이어 듣기 · 화면에 보이는 차례 그대로)
  const play = document.getElementById("nv-play"), go = document.getElementById("nv-play-go");
  if (play && go) {
    const dur = albumDurText(verseItemsFor(list));
    go.innerHTML = `▶️ 이 묶음 듣기${dur ? ` <span class="ab-dur">${dur}</span>` : ""}`;
    play.hidden = false;
    go.addEventListener("click", () => albumPlayStart(verseItemsFor(list)));
  }
}

// 카드 한 장 — 말씀 목록(시안 B)과 같은 꼴: 장절 · 본문 두 줄 · 상태 칩 · 🔊.
//   클래스 .verse-card[data-no] 는 재생기(albumPlayFocus)가 읽는 카드를 짚는 이름이다.
//   ⚠️ .verse-status 에 data-no 를 달지 않는다 — 말씀 목록의 「· N회」(applyVerseCounts)는 주간 화면 것이다.
//   마음에 둔 구절은 본문 대신 첫 낱말 힌트(말씀 목록과 같은 vlAutoHint) — 다 외운 말씀이니 목록에서 떠올려 보게 한다.
function nvCard(v, k, heartMap) {
  const passed = nvPassed(v.no);
  const status = STATUS_LABEL[passed] || STATUS_LABEL[0];
  const isHeart = !!heartMap[v.no];
  const refShow = String(v.refFull).replace(/(\d)-(\d)/g, "$1-⁠$2");   // 「11-12절」이 하이픈에서 꺾이지 않게(말씀 목록과 같다)
  const body = isHeart ? vlAutoHint(v.text) : v.text;
  const card = document.createElement("div");
  card.className = `verse-card vl-card nv-card ${status.cls}${isHeart ? " hearted-verse" : ""}`;
  card.dataset.no = v.no;
  card.innerHTML = `
      <div class="vl-main">
        <div class="vl-top"><span class="vl-no">${k}</span><span class="verse-ref">${psalmEsc(refShow)}</span></div>
        <div class="vl-text${isHeart ? " vl-hint" : ""}">${psalmEsc(body)}</div>
        <div class="vl-state">
          <span class="verse-status ${status.cls}">${status.text}</span>
          ${isHeart ? `<span class="heart-ribbon">👑 마음에 둠</span>` : ""}
        </div>
      </div>
      <button class="card-listen" aria-label="${psalmEsc(v.refFull)} 듣기" title="듣기">🔊</button>`;
  card.addEventListener("click", () => { albumPlayStop(); nvStart(v); });
  // 듣기 — 카드 누름(암송 시작)으로 번지지 않게 · 빠르게 N번 누르면 N번 읽는다(말씀 목록과 같다)
  const listenBtn = card.querySelector(".card-listen");
  let clicks = 0, timer = null;
  listenBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    clicks += 1;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { speakText(verseSpokenText(v), null, clicks, "ko-KR"); clicks = 0; }, 350);
  });
  return card;
}

// ---------- 3단계 암송 ----------
// 시작 단계 — 주간 startTest 와 같은 판단: 마음에 두었고 3단계를 마쳤으면 곧바로 3단계 · 다 마쳤으면 1단계부터 다시 · 아니면 다음 단계.
//   ⚠️ 설정 「카드로 시작」을 구절을 열 때마다 다시 읽는다(주간·물가와 같은 자리 — 안 그러면 마지막으로 누른 토글을 물려받는다).
function nvStart(v) {
  setCardMode(isCardStart());
  const passed = nvPassed(v.no);
  if (isHearted(v.no) && passed >= 3) return renderNaviTest(v, 3);
  renderNaviTest(v, passed >= 3 ? 1 : passed + 1);
}

// 첫 완주를 걷는 중인가 — 저장하기 전에 본다. isFirstJourney 는 주간만 세므로 네비게이토 마친 수도 함께 본다(물가와 같다).
function nvWasFirst() { return isFirstJourney() && nvDoneCount(nvVerses, nvPassed) === 0; }

// 생김새는 주간 암송 화면(.test-screen)과 같다 — 다만 🎤 소리 내어 암송·풀이·설교 연결은 1단계에서 뺐다(설계 §2-4).
function renderNaviTest(verse, stage) {
  stopSpeaking();
  const app = document.getElementById("app");
  const first = nvWasFirst();
  const tokens = String(verse.text || "").trim().split(/\s+/);
  const ratio = stage === 1 ? 0.25 : stage === 2 ? 0.65 : 1.0;
  const flags = pickBlankIndices(tokens, ratio);
  // ⚠️ 한글 칸 폭은 em(주간·물가와 같다 — ch 는 숫자 0 의 폭이라 네 글자 칸이 두 글자 반이 된다)
  const wordsHtml = tokens.map((w, i) => flags[i]
    ? `<input class="word-input" data-answer="${psalmEsc(w)}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" style="width:${Array.from(w).length + 1}em" />`
    : `<span class="word-fixed">${psalmEsc(w)}</span>`).join(" ");
  const answerHtml = tokens.map((w, i) => (flags[i] ? `<strong class="ans-word">${psalmEsc(w)}</strong>` : psalmEsc(w))).join(" ");
  const repeatHtml = stage === 3 ? `
        <label class="repeat-toggle" id="repeat-label">
          <input type="checkbox" id="repeat-check"${isRepeatPractice() ? " checked" : ""} />
          <span class="repeat-text">🔁 반복해서 쓰기</span>
          <span class="repeat-desc">외울 때까지, 정답을 맞히면 자동으로 다시 써요</span>
        </label>` : "";
  const heartHtml = stage === 3 ? heartCheckHtml(verse) : "";
  const tag = [nvChapterTitle(verse.chapter), verse.topic].filter(Boolean).join(" · ");
  app.innerHTML = `
    <div class="test-screen nv-test">
      <div class="test-card with-ref-banner">
        <div class="test-ref-sticky">${psalmEsc(verse.refFull)}</div>
        <div class="btn-row">
          <button class="answer-btn" id="show-answer-btn">보기</button>
          <button class="answer-btn" id="listen-answer-btn" aria-label="정답 음성으로 듣기">🔊 듣기</button>
          <button class="answer-btn mode-btn" id="mode-toggle">${isCardMode() ? "⌨️ 쓰기" : "👆 카드"}</button>
        </div>
        <div class="test-top">
          <div class="test-head">
            <div class="test-stage">${stage}단계${first ? stepDots(stage) : ""}</div>
          </div>
          <button class="back-btn" id="back-to-list-btn">← 목록으로</button>
        </div>
        ${tag ? `<div class="nv-tag">${psalmEsc(tag)}</div>` : ""}
        ${first && stage === 1 ? `<div class="first-guide">세 걸음이면 이 말씀을 외우게 돼요</div>` : ""}
        <div class="test-sentence">${wordsHtml}</div>
        <div id="card-tray" class="card-tray"></div>
        <div id="answer-panel" class="answer-panel" hidden>
          <div class="answer-title">정답</div>
          <div class="answer-text">${answerHtml}</div>
          <button class="back-to-test-btn" id="back-to-test-btn">돌아가서 계속하기</button>
        </div>
        ${repeatHtml}
        <div id="result-area"></div>
        ${heartHtml}
      </div>
    </div>`;

  initStickyRef();
  scrollPastBtnRow();
  document.getElementById("back-to-list-btn").addEventListener("click", () => { stopSpeaking(); renderNaviChapter(verse.chapter); });
  document.getElementById("mode-toggle").addEventListener("click", () => { setCardMode(!isCardMode()); renderNaviTest(verse, stage); });
  const repeatInput = document.getElementById("repeat-check");
  if (repeatInput) repeatInput.addEventListener("change", () => setRepeatPractice(repeatInput.checked));
  setupHeartCheck(verse);
  const listenBtn = document.getElementById("listen-answer-btn");
  listenBtn.addEventListener("click", () => {
    if (window.speechSynthesis && window.speechSynthesis.speaking) {
      stopSpeaking();
      listenBtn.textContent = "🔊 듣기";
      return;
    }
    listenBtn.textContent = "⏹ 정지";
    speakText(verseSpokenText(verse), () => { listenBtn.textContent = "🔊 듣기"; }, 1, "ko-KR");
  });
  setupAnswerToggle();
  // ⚠️ 카드 여부는 「카드 모드로 마쳤는가」(isCardMode)로 센다 — 주간 checkAllComplete·물가와 같은 뜻이다.
  setupAutoCheck(verse, stage, () => nvStageDone(verse, stage, isCardMode()));
}

// 빈칸을 다 채웠을 때 — 저장(주간과 같은 길: progress·challenge_log learn-typing/learn-typing-card → 오늘 N회·순위·도장)
//   ⚠️ mode 는 "typing"/"card" — 서버가 learn-* 로 옮긴다. 새 mode 를 만들지 않는다(CHECK 제약 · 집계가 learn- 앞머리로 가른다).
//   ⚠️ 복습은 예약되지 않는다 — saveProgress 의 ensureReviewScheduled 와 서버가 isNonWeeklyNo(1000 초과)로 뺀다.
function nvStageDone(verse, stage, cardUsed) {
  const wasFirst = nvWasFirst();   // 저장하고 나면 이미 「한 구절 마친 분」이 된다
  saveProgress(verse.no, stage, cardUsed ? "card" : "typing");
  const rs = document.getElementById("result-area");
  if (stage < 3) {
    // 창보다 먼저 화면에도 「N+1단계로」를 남긴다 — 창은 바깥 탭·Escape 로 닫힐 수 있다(그때 갈 길이 없으면 갇힌다 · 주간과 같다)
    if (rs) {
      rs.innerHTML = (wasFirst && STEP_CHEER[stage] ? `<div class="step-cheer">${STEP_CHEER[stage]}</div>` : "")
        + `<button class="next-btn" id="next-stage-btn">${stage + 1}단계로</button>`;
      document.getElementById("next-stage-btn").addEventListener("click", () => renderNaviTest(verse, stage + 1));
    }
    nvStageModal(verse, stage, wasFirst);
    return;
  }
  // 「반복해서 쓰기」를 켜 두셨으면 창 없이 새 3단계(주간과 같다 — 켜 둔 설정을 새 기능이 무시하지 않는다)
  if (isRepeatPractice()) { renderNaviTest(verse, 3); return; }
  nvCompleteNav(verse);
  nvStageModal(verse, 3, wasFirst);
}

// 3단계를 마친 뒤 화면에 남는 줄 — ◀ 이전 · 다시 암송 · 다음 ▶(묶음 안)
function nvCompleteNav(verse) {
  const rs = document.getElementById("result-area");
  if (!rs) return;
  const list = nvByChapter(nvVerses, verse.chapter);
  const prev = nvPrevOf(list, verse.no), next = nvNextOf(list, verse.no);
  rs.innerHTML = `
    <div class="complete-nav">
      <button class="nav3-btn" id="prev-verse-btn" ${prev ? "" : "disabled"}>◀ 이전</button>
      <button class="nav3-btn redo" id="redo-verse-btn">다시 암송</button>
      <button class="nav3-btn" id="next-verse-btn" ${next ? "" : "disabled"}>다음 ▶</button>
    </div>`;
  document.getElementById("redo-verse-btn").addEventListener("click", () => renderNaviTest(verse, 3));
  if (prev) document.getElementById("prev-verse-btn").addEventListener("click", () => nvStart(prev));
  if (next) document.getElementById("next-verse-btn").addEventListener("click", () => nvStart(next));
}

// 단계 완료 창 — 주간 showStageDoneModal 과 같은 생김새·같은 조작(Enter·스페이스 = 큰 단추 · Escape·바깥 탭 = 닫기).
//   ⚠️ id 에 nv- 를 붙인다 — 창은 document.body 에 붙어 주간 창(sd-main …)·물가 창(ps-sd-…)과 같은 문서에 산다.
//   ⚠️ 단추를 누르면 다음 화면을 **그 자리에서 바로** 그린다(setTimeout 으로 미루면 아이폰 사파리가 다음 빈칸에 자판을 안 띄운다 — 주간 2026-09-18).
function nvStageModal(verse, stage, wasFirst) {
  const list = nvByChapter(nvVerses, verse.chapter);
  const nx = stage >= 3 ? nvNextAfter(list, verse.no, nvPassed) : null;
  const head = stage < 3
    ? `<div class="cheer-icon">✅</div>
       <div class="cheer-ref">${stage}단계 완료!</div>
       ${wasFirst && STEP_CHEER[stage] ? `<div class="cheer-msg">${STEP_CHEER[stage]}</div>` : ""}`
    : `<div class="cheer-icon">🎉</div>
       <div class="cheer-ref">다 외우셨어요!</div>
       <div class="cheer-msg">${psalmEsc(verse.refFull)}</div>`;
  const mainLabel = stage < 3 ? `${stage + 1}단계로 계속하기`
    : nx ? (nx.kind === "next" ? "다음 말씀 ▶" : "남은 말씀 ▶")
    : "묶음 목록으로";
  const wrap = document.createElement("div");
  wrap.className = "cheer-overlay stage-done";
  wrap.innerHTML = `
    <div class="cheer-card" role="dialog" aria-modal="true">
      ${head}
      ${stage >= 3 ? heartCheckHtml(verse, "-m") : ""}
      <button class="cheer-ok" id="nv-sd-main">${mainLabel}</button>
      <div class="sd-sub">
        <button class="sd-btn" id="nv-sd-again">${stage < 3 ? "이 단계 다시" : "다시 암송"}</button>
        <button class="sd-btn" id="nv-sd-list">목록으로</button>
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
  const go = (fn) => { close(); if (fn) fn(); };
  const main = () => go(stage < 3 ? () => renderNaviTest(verse, stage + 1)
    : nx ? () => nvStart(nx.verse)
    : () => renderNaviHome());
  // ⚠️ 캡처 단계에서 듣는다 — 빈칸(.word-input)이 키를 먼저 먹으면 Enter 가 창에 안 닿는다
  const onKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key !== "Enter" && e.key !== " ") return;
    const ae = document.activeElement;
    if (ae && ae.type === "checkbox") return;   // 마음에 둠 체크를 스페이스로 켜고 끄는 중
    e.preventDefault();
    e.stopPropagation();
    main();
  };
  document.addEventListener("keydown", onKey, true);

  const mainBtn = document.getElementById("nv-sd-main");
  mainBtn.addEventListener("click", main);
  document.getElementById("nv-sd-again").addEventListener("click", () => go(() => renderNaviTest(verse, stage < 3 ? stage : 3)));
  document.getElementById("nv-sd-list").addEventListener("click", () => go(() => renderNaviChapter(verse.chapter)));
  wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });
  setupHeartCheck(verse, "-m", true);   // 창 안에서는 축하창을 겹쳐 띄우지 않는다(Enter 한 번에 둘 다 닫힌다)
  const focus = () => { try { mainBtn.focus({ preventScroll: true }); } catch (e) { mainBtn.focus(); } };
  focus();
  setTimeout(focus, 80);   // 자판이 내려가며 초점을 뺏길 수 있어 한 번 더
}
