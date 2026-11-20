// ============================================================
// 💬 「내게 주시는 말씀」 에이전트 화면(2026-11-20) — 단계 줄 · 답 · 「이렇게 해 보세요」 카드 · 되묻기 단추 · 🚩 이 답 알리기
//   설계 docs/superpowers/specs/2026-11-20-sermon-agent-design.md §1 · 서버 액션 sermonAgent(api · NDJSON 줄 step · answer · fallback)
//   필요할 때 받는다(app.js LAZY_JS.scAgent — scAsk 가 문 scAgentVisible 을 보고 부른다 · docs/notes/lazy-load.md).
//   app.js 에 있는 것: 문(scAgentVisible · scAgentCached · refreshScAgent) · 돌아갈 곳(scAgentReturnNo · scAgentBackTo — 암송 화면 「답으로」) ·
//     출처 줄(scSourcesHtml) · 지금 길(scAskClassic) · 설교 팝업(scOpenSermon) · 굵게(scEmphasis) · 알리기(openAnswerReport).
//   ⚠️ 맨 위 이름은 scAgent · SCG_ 로 시작한다 — app.js · 처음부터 실리는 js 와 겹치면 받는 순간 SyntaxError(tests/sermon-agent.test.cjs).
//   ⚠️ boardEsc 는 따옴표를 바꾸지 않는다 — 서버 · AI 가 준 글은 속성(data-…="…")에 넣지 않는다. 속성에는 번호만.
//   ⚠️ 빈 화면을 보이지 않는다 — 첫 질문에 답이 없으면(fallback 줄 · 통신 실패 · 빈 답) 지금 길(scAskClassic → sermonChat)로 한 번 더 묻는다.
//   ⚠️ 주제별 성경암송(navi) 구절은 startTest 로 보내지 않는다(js/navi.js 머리 — 주간 1번으로 튄다) · 쉴만한 물가는 renderPsalmStage.
// ============================================================

// ── 에이전트 화면 — 순수 (여기부터) ──
//   tests/sermon-agent.test.cjs 가 이 구간만 잘라 node:vm 에서 돌린다 — document · api · app.js 의 이름을 쓰지 말 것.

// 흘려받은 글 조각 → 다 온 줄(JSON 하나씩)만 풀어 낸다. 덜 온 끝줄은 rest 로 돌려 다음 조각 앞에 붙인다(js/api.js supaStream).
//   빈 줄 · 깨진 JSON · 객체가 아닌 줄(null · 배열 · 글 · 숫자)은 버린다 · \r\n 도 받는다(trim). 끝맺을 때는 rest 에 "\n" 을 한 번 더 넣는다.
function scAgentParseChunk(rest, chunk) {
  const buf = String(rest == null ? "" : rest) + String(chunk == null ? "" : chunk);
  const lines = buf.split("\n");
  const tail = lines.pop();
  const events = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    try {
      const o = JSON.parse(line);
      if (o && typeof o === "object" && !Array.isArray(o)) events.push(o);
    } catch (_) { /* 깨진 줄은 버린다 */ }
  }
  return { events, rest: tail };
}

const SCG_MAX_FOLLOW = 2;   // 되묻기 단추는 한 질문에 두 번까지(설계 §1-4) — 서버도 하루 한도로 센다

// 단계 줄의 글 — 「」 안은 AI 가 도구를 부를 때 실제로 넘긴 찾을 말이다(정해 둔 문구를 시간 맞춰 띄우지 않는다 · 설계 §1-1).
//   finished = 그 차례의 답이 이미 왔다(접힌 「AI가 한 일」 안) — 지난 일을 「…중」이라 하지 않는다.
//   다 찾았는데 0개면 「찾지 못했어요」(「설교 0편을 찾았어요」는 어색하다).
function scAgentStepText(s, finished) {
  const kind = s && s.kind, state = s && s.state;
  const q = String((s && s.q) || "").trim(), n = Number(s && s.n) || 0;
  if (kind === "cache") return "📚 전에 같은 질문으로 찾은 답이에요";
  if (kind !== "sermon" && kind !== "verse" && kind !== "write") return "";
  if (state === "fail") return "⚠ 찾지 못했어요";
  if (kind === "sermon") {
    if (state === "done") return n > 0 ? `✓ 설교 ${n}편을 찾았어요` : "⚠ 찾지 못했어요";
    return q ? `🔎 설교에서 「${q}」 찾는 중…` : "🔎 설교를 찾는 중…";
  }
  if (kind === "verse") {
    if (state === "done") return n > 0 ? `✓ 외울 만한 구절 ${n}개` : "⚠ 찾지 못했어요";
    return q ? `📖 「${q}」 구절 찾는 중…` : "📖 구절을 찾는 중…";
  }
  return finished ? "✍️ 답을 썼어요" : "✍️ 답을 쓰는 중…";
}
// 줄의 모양(색) — start(받는 중 · 깜빡이는 점) · done · fail. 다 찾았는데 0개는 fail 모양.
function scAgentStepClass(s) {
  const kind = s && s.kind, state = s && s.state;
  if (state === "fail") return "fail";
  if (state === "done") return (kind === "sermon" || kind === "verse") && !(Number(s.n) > 0) ? "fail" : "done";
  return "start";
}
// step 줄 하나를 쌓는다 — 같은 id 면 그 자리에서 고친다(done 줄에는 kind 가 없을 수 있다) · 모르는 갈래의 새 줄은 버린다.
function scAgentMergeStep(steps, ev) {
  const list = Array.isArray(steps) ? steps : [];
  if (!ev || ev.t !== "step") return list;
  const id = Number(ev.id);
  const old = list.find((s) => s.id === id);
  if (old) {
    if (ev.kind) old.kind = String(ev.kind);
    if (ev.q) old.q = String(ev.q);
    if (ev.state) old.state = String(ev.state);
    if (ev.n != null) old.n = Number(ev.n) || 0;
    return list;
  }
  if (["sermon", "verse", "write", "cache"].indexOf(ev.kind) < 0) return list;
  const s = { id, kind: ev.kind, q: ev.q ? String(ev.q) : "", state: ev.state ? String(ev.state) : "start" };
  if (ev.n != null) s.n = Number(ev.n) || 0;
  list.push(s);
  return list;
}
function scAgentFoldText(n) { return `AI가 한 일 ${Number(n) || 0}가지`; }
// 「이렇게 해 보세요」 구절 카드의 이름 · 단추 — 쉴만한 물가는 「외운다」를 쓰지 않는다(docs/notes/psalm-still-waters.md).
function scAgentVerseLabels(track) {
  if (track === "psalm") return { kind: "🌿 마음에 담을 말씀", go: "바로 열어 보기" };
  return { kind: "📖 외워 볼 말씀", go: "바로 외워 보기" };
}
// 되묻기 단추를 눌렀을 때 서버에 보낼 follow — 앞 차례의 구절 번호 · 설교 id 만(앞 답 글은 안 보낸다 · 설계 §2-4).
//   두 번 썼거나 · 답이 없거나 · 한도 답이거나 · 없는 단추면 null.
function scAgentFollow(state, ci) {
  if (!state || !Array.isArray(state.turns) || (Number(state.used) || 0) >= SCG_MAX_FOLLOW) return null;
  const last = state.turns[state.turns.length - 1];
  const r = last && last.result;
  if (!r || r.limited || !Array.isArray(r.chips)) return null;
  const chip = String(r.chips[ci] == null ? "" : r.chips[ci]).trim();
  if (!chip) return null;
  const prevVerses = (Array.isArray(r.verses) ? r.verses : []).map((v) => Number(v && v.no)).filter((n) => n > 0);
  const sm = r.sermon;
  const prevSermon = sm && sm.sermon_id ? String(sm.sermon_id) : null;   // 서버가 answer 줄 sermon 에 sermon_id 를 싣는다(이름 표 갱신 2026-11-20)
  return { chip, prev_verses: prevVerses, prev_sermon: prevSermon, turn: (Number(state.used) || 0) + 1 };
}
// 🚩 알릴 질문 · 답 — 되묻기 차례는 「첫 질문 ↪ 단추 글」 · 추천 말씀 · 설교는 답 앞에(서버가 1200자에서 자른다 — 뒤가 잘려도 추천은 남게).
function scAgentReportArgs(state, i) {
  const t = state && Array.isArray(state.turns) ? state.turns[i] : null;
  const r = t && t.result;
  if (!r || !String(r.answer || "").trim()) return null;
  const q = String(state.q || "").trim();
  const question = t.chip ? `${q} ↪ ${t.chip}` : q;
  const lines = [];
  const vs = (Array.isArray(r.verses) ? r.verses : []).map((v) => `${String((v && v.ref) || "").trim()} (${Number(v && v.no) || 0})`);
  if (vs.length) lines.push("[추천 말씀] " + vs.join(" · "));
  if (r.sermon && r.sermon.title) lines.push("[추천 설교] " + String(r.sermon.title).trim() + (r.sermon.svc_date ? ` (${r.sermon.svc_date})` : ""));
  return { question, answer: (lines.length ? lines.join("\n") + "\n\n" : "") + String(r.answer).trim() };
}
// ── 에이전트 화면 — 순수 (여기까지) ──

var scAgentState = null;   // { q, turns:[{ chip, steps, result }], used, awayAt } — 암송 · 설교 요약에 다녀오면 이 값으로 다시 그린다
let scAgentRun = 0;        // 묻기마다 하나씩 — 늦게 온 줄(앞 질문 · 「새로 물어보기」 전)이 지금 화면을 덮지 않게
let scAgentCtl = { abort() {}, signal: undefined };   // 흐르는 줄 하나의 끊개 — 「새로 물어보기」가 끊어 질문 단추 지킴(scAgentAsking)을 바로 푼다
let scAgentBusy = false;   // 지금 받는 중(되묻기 단추 · 「새로 물어보기」를 숨긴다)
let scAgentFolds = {};     // 펼친 「AI가 한 일」(차례 번호 → true) — 줄이 올 때마다 다시 그려도 펼친 채
const SCG_KEEP_MS = 60 * 60 * 1000;   // 다녀온 뒤 다시 그려 주는 시간(한 시간 — 그보다 오래면 새로 묻게)
const SCG_EMPTY = "궁금한 것을 물어보세요. 담임목사님 설교에서 답해드립니다.";   // renderSermonChat 의 첫 글과 같다

// 「질문」 단추 — 받는 동안 「찾는 중…」(지금 길과 같다) · 끝나면 A안 이름(scSendLabel)으로
function scAgentSendBtn(busy) {
  const btn = document.getElementById("sc-send");
  if (!btn) return;
  btn.disabled = !!busy;
  if (busy) btn.textContent = "찾는 중…";
  else if (typeof scSendLabel === "function") scSendLabel(btn);
  else btn.textContent = "질문";
}
function scAgentScrollTo(i) {
  const out = document.getElementById("sc-out");
  if (!out) return;
  const el = i >= 0 ? out.querySelector(`.scg-turn[data-turn="${i}"]`) : out;
  if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

// 묻기 — message 는 첫 질문(되묻기여도 첫 질문 그대로) · follow 는 scAgentFollow 가 만든 것(없으면 새 질문).
async function scAgentAsk(message, follow) {
  const msg = String(message == null ? "" : message).trim();
  if (!msg || !document.getElementById("sc-out")) return;
  const isFollow = !!(follow && follow.chip && scAgentState && scAgentState.q === msg);
  if (!isFollow) {
    scAgentState = { q: msg, turns: [], used: 0, awayAt: 0 };
    scAgentFolds = {};
    // 예제 목록을 접어 답이 밀리지 않게(지금 길 scAskClassic 과 같다)
    const tqs = document.getElementById("sc-tqs");
    if (tqs) tqs.innerHTML = "";
    document.querySelectorAll("#sc-cloud button.on").forEach((b) => b.classList.remove("on"));
  }
  const st = scAgentState;
  const turn = { chip: isFollow ? String(follow.chip) : null, steps: [], result: null };
  st.turns.push(turn);
  const idx = st.turns.length - 1;
  const run = ++scAgentRun;
  try { if (scAgentCtl) scAgentCtl.abort(); } catch (_) {}
  scAgentCtl = typeof AbortController === "function" ? new AbortController() : { abort() {}, signal: undefined };
  scAgentBusy = true;
  scAgentSendBtn(true);
  scAgentRender();
  scAgentScrollTo(isFollow ? idx : -1);
  const body = { message: msg, user_id: myUserId() };
  if (isFollow) body.follow = { chip: turn.chip, prev_verses: follow.prev_verses || [], prev_sermon: follow.prev_sermon || null, turn: follow.turn };
  let answered = false;
  try {
    await supaStream("sermonAgent", body, (ev) => {
      if (run !== scAgentRun || !ev) return;
      if (ev.t === "step") { scAgentMergeStep(turn.steps, ev); scAgentRender(); }
      else if (ev.t === "answer" && String(ev.answer || "").trim()) { turn.result = ev; answered = true; }
      // fallback 줄은 볼 것이 없다 — 답이 없으니 아래에서 지금 길로 간다
    }, scAgentCtl.signal);
  } catch (_) { /* 통신 실패 · 옛 서버 · 60초 넘김 — 아래에서 지금 길로 */ }
  if (run !== scAgentRun) return;   // 그사이 새로 물었거나 「새로 물어보기」를 눌렀다
  scAgentBusy = false;
  scAgentSendBtn(false);
  if (answered) {
    if (isFollow) st.used += 1;
    scAgentRender();
    scAgentScrollTo(isFollow ? idx : -1);
    return;
  }
  st.turns.pop();
  if (isFollow) {
    // 되묻기만 실패 — 앞 답은 그대로 두고 알린다(단추 수는 안 깎는다 · 지금 길로 다시 묻지 않는다)
    scAgentRender();
    if (typeof boardToast === "function") boardToast("지금은 더 찾지 못했어요. 잠시 뒤에 다시 눌러 주세요");
    return;
  }
  // 첫 질문에 답이 없다 — 지금 길(sermonChat)로 한 번 더. 화면을 떠났으면 그만둔다(scAskClassic 은 이 화면의 칸을 쓴다).
  scAgentState = null;
  if (document.getElementById("sc-out") && typeof scAskClassic === "function") return scAskClassic(msg);
}

// scAgentState 를 #sc-out 에 그린다(줄이 올 때마다 · 답이 오면 · 돌아왔을 때). 화면을 떠났으면 아무것도 안 한다.
function scAgentRender() {
  const out = document.getElementById("sc-out");
  const st = scAgentState;
  if (!out || !st) return;
  // 스크린리더 알림 칸(#scg-live)은 한 번 만들고 그대로 둔다 — 그리기마다 새로 만들면 알려 주지 않는다. 몸(#scg-body)만 갈아 끼우고 live 칸은 글만 바꾼다.
  let live = out.querySelector("#scg-live"), body = out.querySelector("#scg-body");
  if (!live || !body) {
    out.innerHTML = `<div id="scg-live" class="scg-live" aria-live="polite" aria-atomic="true"></div><div id="scg-body"></div>`;
    live = out.querySelector("#scg-live"); body = out.querySelector("#scg-body");
  }
  body.innerHTML = `<div class="sc-q-echo">${boardEsc(st.q)}</div>`
    + st.turns.map((t, i) => scAgentTurnHtml(t, i)).join("")
    + (scAgentBusy ? "" : scAgentTailHtml(st.turns[st.turns.length - 1]));
  const lt = st.turns[st.turns.length - 1];
  const ls = lt && !lt.result ? lt.steps.filter((x) => x.kind !== "cache") : [];
  live.textContent = ls.length ? scAgentStepText(ls[ls.length - 1], false) : "";
  scAgentBind(out);
  if (typeof applyScOutA === "function") applyScOutA();   // A안 — 출처 설교 줄 아이콘(지금 길과 같은 옷)
  scAgentFlagIcons(out);
}
function scAgentStepHtml(s, finished) {
  const cls = scAgentStepClass(s);
  const showQ = (s.kind === "sermon" || s.kind === "verse") && cls !== "start" && s.q;
  return `<div class="scg-step ${cls}">${boardEsc(scAgentStepText(s, finished))}`
    + (showQ ? `<span class="scg-step-q">「${boardEsc(s.q)}」</span>` : "") + `</div>`;
}
// 한 차례 — (되묻기면 누른 단추) · 단계 줄(받는 중) 또는 접힌 「AI가 한 일」 · 답 · 출처 · 「이렇게 해 보세요」 · 🚩
function scAgentTurnHtml(t, i) {
  const r = t.result;
  const steps = t.steps.filter((s) => s.kind !== "cache");
  const cached = !!(r && r.cached) || t.steps.some((s) => s.kind === "cache");
  let h = `<div class="scg-turn" data-turn="${i}">`;
  if (t.chip) h += `<div class="sc-q-echo scg-chip-echo">↪ ${boardEsc(t.chip)}</div>`;
  if (cached) {
    h += `<div class="scg-cache">${boardEsc(scAgentStepText({ kind: "cache" }))}</div>`;
  } else if (!r) {
    h += `<div class="scg-steps">`
      + (steps.length ? steps.map((s) => scAgentStepHtml(s, false)).join("")
        : `<div class="scg-step start scg-wait">🤔 무엇을 찾아볼지 생각하는 중…</div>`)
      + `</div>`;
  } else if (steps.length) {
    const open = !!scAgentFolds[i];
    h += `<button type="button" class="scg-fold" data-fold="${i}" aria-expanded="${open}">${boardEsc(scAgentFoldText(steps.length))}`
      + ` <span class="scg-fold-ar">${open ? "▴" : "▾"}</span></button>`
      + `<div class="scg-steps scg-done"${open ? "" : " hidden"}>${steps.map((s) => scAgentStepHtml(s, true)).join("")}</div>`;
  }
  if (r) {
    h += `<div class="sc-answer">${scEmphasis(r.answer)}</div>`;
    if (!r.limited) {
      const src = scSourcesHtml(r.sources);
      if (src) h += `<div class="sc-sources" data-turn="${i}">${src}</div>`;
      h += scAgentTryHtml(r);
      if (myUserId()) h += `<button type="button" class="sc-flag scg-flag" data-turn="${i}">🚩 이 답 알리기</button>`;
    }
  }
  return h + `</div>`;
}
// 「이렇게 해 보세요」 — 📖 외워 볼 말씀 1~2장 · 🎧 들어 볼 설교 1장(서버가 이미 거른 것만 온다 · 설계 §2-2 ③)
function scAgentTryHtml(r) {
  const vs = (Array.isArray(r.verses) ? r.verses : []).filter((v) => v && Number(v.no) > 0).slice(0, 2);
  const sm = r.sermon && r.sermon.title ? r.sermon : null;
  if (!vs.length && !sm) return "";
  let h = `<div class="scg-try"><div class="scg-try-h">이렇게 해 보세요</div>`;
  for (const v of vs) {
    const L = scAgentVerseLabels(scAgentTrack(v));
    h += `<div class="scg-card">`
      + `<div class="scg-card-k">${L.kind}</div>`
      + `<div class="scg-card-t">${boardEsc(v.ref)}</div>`
      + (v.text ? `<div class="scg-card-x">${boardEsc(v.text)}</div>` : "")
      + (v.why ? `<div class="scg-card-why">${boardEsc(v.why)}</div>` : "")
      + `<div class="scg-card-btns"><button type="button" class="scg-go" data-no="${Number(v.no)}">${L.go}</button></div>`
      + `</div>`;
  }
  if (sm) {
    const meta = [sm.svc_date, sm.scripture].filter(Boolean).map((x) => boardEsc(x)).join(" · ");
    h += `<div class="scg-card scg-card-sermon">`
      + `<div class="scg-card-k">🎧 들어 볼 설교</div>`
      + `<div class="scg-card-t">${boardEsc(sm.title)}</div>`
      + (meta ? `<div class="scg-card-m">${meta}</div>` : "")
      + (sm.why ? `<div class="scg-card-why">${boardEsc(sm.why)}</div>` : "")
      + `<div class="scg-card-btns"><button type="button" class="scg-go scg-sum">3분 요약 듣기</button>`
      + (sm.youtube_id ? `<button type="button" class="scg-sub scg-vid">영상</button>` : "")
      + `</div></div>`;
  }
  return h + `</div>`;
}
// 맨 아래 — 되묻기 단추(두 번까지) · 「새로 물어보기」 · 안내 줄. 받는 중이거나 답이 없으면 안 그린다.
function scAgentTailHtml(t) {
  const r = t && t.result;
  if (!r) return "";
  let h = "";
  const left = SCG_MAX_FOLLOW - ((scAgentState && Number(scAgentState.used)) || 0);
  if (!r.limited && left > 0 && Array.isArray(r.chips)) {
    const chips = r.chips.slice(0, 3).map((c, ci) => (String(c == null ? "" : c).trim()
      ? `<button type="button" class="scg-chip" data-ci="${ci}">${boardEsc(String(c).trim())}</button>` : "")).join("");
    if (chips) h += `<div class="scg-more"><div class="scg-try-h">이어서 물어보기</div><div class="scg-chips">${chips}</div></div>`;
  }
  h += `<button type="button" class="scg-new">새로 물어보기</button>`;
  h += `<div class="sc-disc">※ 이 답은 AI가 설교와 앱의 암송 구절을 찾아 만든 것이에요. 정확한 내용은 원 설교를 확인하세요.</div>`;
  return h;
}
function scAgentBind(out) {
  const st = scAgentState;
  const turnOf = (el) => { const box = el.closest(".scg-turn"); return box && st ? st.turns[+box.dataset.turn] : null; };
  out.querySelectorAll(".sc-sources .sc-src").forEach((b) => {
    b.onclick = () => {
      const t = turnOf(b);
      const s = t && t.result && (t.result.sources || [])[+b.dataset.i];
      if (s) scOpenSermon(s);
    };
  });
  out.querySelectorAll(".scg-fold").forEach((b) => {
    b.onclick = () => {
      const i = +b.dataset.fold, open = !scAgentFolds[i];
      scAgentFolds[i] = open;
      b.setAttribute("aria-expanded", open ? "true" : "false");
      const ar = b.querySelector(".scg-fold-ar");
      if (ar) ar.textContent = open ? "▴" : "▾";
      const box = b.nextElementSibling;
      if (box) box.hidden = !open;
    };
  });
  out.querySelectorAll(".scg-go[data-no]").forEach((b) => { b.onclick = () => scAgentOpenVerse(+b.dataset.no); });
  out.querySelectorAll(".scg-sum").forEach((b) => { b.onclick = () => { const t = turnOf(b); if (t) scAgentOpenSummary(t); }; });
  out.querySelectorAll(".scg-vid").forEach((b) => {
    b.onclick = () => {
      const t = turnOf(b);
      const s = t && t.result && t.result.sermon;
      if (s && s.youtube_id) window.open("https://youtube.com/watch?v=" + encodeURIComponent(s.youtube_id), "_blank", "noopener");
    };
  });
  out.querySelectorAll(".scg-chip").forEach((b) => { b.onclick = () => scAgentChip(+b.dataset.ci); });
  out.querySelectorAll(".scg-new").forEach((b) => { b.onclick = () => scAgentReset(); });
  out.querySelectorAll(".scg-flag").forEach((b) => {
    b.onclick = () => {
      const a = scAgentReportArgs(scAgentState, +b.dataset.turn);
      if (a) openAnswerReport(a.question, a.answer, b, { agent: true });   // 서버가 캐시 kind "agent" 를 먼저 찾는다(app.js · js/api.js 가 agent:true 를 싣는다)
    };
  });
}
// A안 — 🚩 를 깃발 아이콘으로(applyScOutA 는 id sc-flag 하나만 본다 — 차례마다 하나씩이라 여기서)
function scAgentFlagIcons(out) {
  if (typeof SC_LAYOUT === "undefined" || SC_LAYOUT !== "a" || typeof haSvg !== "function") return;
  out.querySelectorAll(".scg-flag").forEach((fl) => {
    if (fl.querySelector("svg")) return;
    if (typeof setStripEmoji === "function") setStripEmoji(fl);
    fl.insertAdjacentHTML("afterbegin", haSvg("flag", "sca-ic"));
  });
}
function scAgentChip(ci) {
  if (scAgentBusy || !scAgentState) return;
  const f = scAgentFollow(scAgentState, ci);
  if (f) scAgentAsk(scAgentState.q, f);
}
// 「새로 물어보기」 — 받는 중이던 것도 버린다(scAgentRun) · 첫 화면 꼴로(주제 · 예시 질문)
function scAgentReset() {
  scAgentRun++;
  try { scAgentCtl.abort(); } catch (_) {}   // 흐르는 줄을 끊는다 — 질문 단추가 60초 막히지 않게
  scAgentBusy = false;
  scAgentState = null;
  scAgentFolds = {};
  scAgentSendBtn(false);
  const out = document.getElementById("sc-out");
  if (out) out.innerHTML = `<div class="sc-empty">${SCG_EMPTY}</div>`;
  const q = document.getElementById("sc-q");
  if (q) q.value = "";
  if (typeof scBuildCloud === "function" && document.getElementById("sc-cloud")) scBuildCloud();
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (q) setTimeout(() => { try { q.focus(); } catch (_) {} }, 300);
}

// 구절의 갈래 — 서버가 실어 준 track 을 먼저 · 없으면 번호대(js/psalm.js isPsalmNo · isNonWeeklyNo 한 곳)
function scAgentTrack(v) {
  const t = v && v.track;
  if (t === "weekly" || t === "navi" || t === "psalm") return t;
  const no = Number(v && v.no);
  if (typeof isPsalmNo === "function" && isPsalmNo(no)) return "psalm";
  if (typeof isNonWeeklyNo === "function" && isNonWeeklyNo(no)) return "navi";
  return "weekly";
}
function scAgentFindVerse(no) {
  const st = scAgentState;
  if (!st) return null;
  for (const t of st.turns) for (const v of ((t.result && t.result.verses) || [])) if (v && Number(v.no) === no) return v;
  return null;
}
// 「바로 외워 보기」 — 갈래마다 제 암송 화면으로 · 그 화면의 「뒤로」는 이 답으로(app.js scAgentReturnNo · scAgentBackTo).
//   「모름」(못 받음)과 「없음」(지금 열 수 없는 구절)을 가른다(스킬 gated-feature ③).
function scAgentOpenVerse(no) {
  const n = Number(no);
  if (!(n > 0)) return;
  const track = scAgentTrack(scAgentFindVerse(n) || { no: n });
  const say = (m) => { if (typeof appAlert === "function") appAlert(m); };
  const cantLoad = () => say("지금 말씀을 불러올 수 없어요. 잠시 뒤 다시 눌러 주세요.");
  const go = (open) => {
    if (scAgentState) scAgentState.awayAt = Date.now();
    scAgentReturnNo = n;   // app.js 의 let — 그 구절 화면의 「뒤로」가 이 답으로 온다
    open();
  };
  if (track === "weekly") {
    const v = (typeof verses !== "undefined" && Array.isArray(verses)) ? verses.find((x) => x.no === n) : null;
    if (!v) return say("이 말씀은 지금 열 수 없어요.");
    return go(() => startTest(v));
  }
  if (track === "psalm") {
    if (typeof loadPsalmVerses !== "function" || typeof renderPsalmStage !== "function") return cantLoad();
    loadPsalmVerses().then(() => {
      const v = typeof psalmByNo === "function" ? psalmByNo(n) : null;
      if (!v) return say("쉴만한 물가에서 아직 열리지 않은 말씀이에요.");
      go(() => renderPsalmStage(v, 0));
    }, cantLoad);
    return;
  }
  // 주제별 성경암송 — 화면 코드(js/navi.js)와 카드(nvLoad)를 받은 뒤 그 화면으로(startTest 로 보내면 주간 1번으로 튄다)
  withLazyJs("navi", () => {
    if (typeof nvLoad !== "function" || typeof nvStart !== "function") return cantLoad();
    nvLoad().then((state) => {
      const v = (typeof nvVerses !== "undefined" && Array.isArray(nvVerses)) ? nvVerses.find((x) => x.no === n) : null;
      if (!v) return state === "unknown" ? cantLoad() : say("이 말씀은 지금 열 수 없어요.");
      go(() => nvStart(v));
    }, cantLoad);
  });
}
// 「3분 요약 듣기」 — 말씀 아카이브 요약 화면(renderSermonSummary · 🔊 3분요약)으로 · 뒤로 = 이 답.
//   아카이브에 그 설교 요약이 없거나 못 받으면 지금의 설교 팝업(📺 설교 보기 · 📄 말씀 요약 — scOpenSermon).
async function scAgentOpenSummary(t) {
  const s = t && t.result && t.result.sermon;
  if (!s) return;
  const id = String(s.youtube_id || s.sermon_id || "");
  let full = null;
  try {
    const list = typeof loadSermons === "function" ? await loadSermons() : [];
    full = (list || []).find((x) => x && String(x.id) === id && x.summary) || null;
  } catch (_) { full = null; }
  if (!full || typeof renderSermonSummary !== "function") { scOpenSermon(s); return; }
  if (scAgentState) scAgentState.awayAt = Date.now();
  renderSermonSummary(null, full, () => {
    if (typeof stopSermonAudio === "function") stopSermonAudio();
    renderSermonChat();
  }, "← 답으로");
}
// renderSermonChat 끝에서(app.js 가 typeof 로) — 「바로 외워 보기」 · 「3분 요약 듣기」에 다녀왔으면 그 답을 그대로 다시 그린다.
//   다녀온 적이 없거나 한 시간이 지났으면 새 화면(지난 답을 붙들지 않는다).
function scAgentRestore() {
  const st = scAgentState;
  if (!st || !st.awayAt || !st.turns.length) return false;
  if (Date.now() - st.awayAt > SCG_KEEP_MS) { scAgentState = null; return false; }
  st.awayAt = 0;
  const q = document.getElementById("sc-q");
  if (q) q.value = st.q;
  const tqs = document.getElementById("sc-tqs");
  if (tqs) tqs.innerHTML = "";
  document.querySelectorAll("#sc-cloud button.on").forEach((b) => b.classList.remove("on"));
  scAgentRender();
  scAgentScrollTo(st.turns.length - 1);
  return true;
}
