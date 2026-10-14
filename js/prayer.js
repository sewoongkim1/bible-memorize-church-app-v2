// 🙏 가정 축복 기도문 화면 — app.js 에서 떼어 냈다(2026-10-12 · 필요할 때 받는다 · docs/notes/lazy-load.md · docs/notes/prayer-book.md).
//   들어오는 길: 첫 화면 「🙏 가정 축복 기도문」 · 묵상 창 「🙏 기도」의 「축복 기도문」 · 위젯 ?w=prayer · ?preview=prayer — 모두 app.js 의 withLazyJs("prayer", …).
//   ⚠️ 첫 화면·묵상 창·위젯 대조 시험이 동기로 부르는 것(loadPrayers·prayToday·prayFill·prayFillHtml·prayJong·prayEsc·fetchTodayBlessing·openBlessingModal·PRAY_ORN·logFeature)은 app.js 에 있다 — 여기로 옮기지 말 것.
//   ⚠️ 이름이 app.js·다른 js 의 let/const 와 같으면 받는 순간 SyntaxError(tests/lazy-load.test.cjs 가 본다).

let prayName = null;      // 누구 이름으로 읽을지(기본은 로그인한 분)
let prayIdx = null;       // 지금 보고 있는 편(0-based)
let prayOpenVerse = false; // 말씀을 펴 뒀나 — 이전/다음에도 이어진다
let prayGroup = null;      // 어느 주제 목록에서 들어왔나 — 돌아갈 길을 남긴다
let prayAutoPlay = false;  // 연속듣기 모드 — TTS 끝나면 다음 편으로 자동 이동
let prayRepeat  = false;  // 반복듣기 모드 — TTS 끝나면 같은 편 다시 재생
// 연속듣기·배경음악 체크박스 — **처음엔 켜져 있다**(2026-09-25 친구 요청).
// ⚠️ 체크박스는 「지금 재생 중인가」(prayAutoPlay·prayBgAudio.paused)가 아니라 **고른 설정**을 비춘다.
//    전에는 재생 상태를 그대로 비춰, 기본을 켜 둬도 멈춤·이전·다음 한 번에 체크가 풀렸다.
// ⚠️ 끄신 것은 기억한다 — 켜 둔 설정을 새 기능이 조건부로 무시하지 않는다(v3.181→182 되돌림 교훈).
// ⚠️ 배경음악은 브라우저가 누르기 전 자동 재생을 막는다 — 「켜짐」은 들려주기를 누를 때 함께 시작한다는 뜻이다.
// 「▶ 이 주제 전체 듣기」로 시작했으면 그 주제의 편 번호들(0-based)을 순서대로 담는다.
// 연속듣기가 104편 전체 대신 이 줄만 따라가고, 끝나면 멈춘다. 멈춤·이전·다음·첫 화면에서 비운다.
let prayQueue = null;
const PRAY_AUTO_KEY = "pray-auto";
const PRAY_BGM_KEY = "pray-bgm";
function prayPref(key) {
  try { return localStorage.getItem(key) !== "0"; } catch { return true; }
}
function setPrayPref(key, on) {
  try { localStorage.setItem(key, on ? "1" : "0"); } catch {}
}
// 배경음악 파일 목록 — music/ 폴더에 파일을 추가하면 이 배열에도 넣는다. 순서대로 재생 후 처음으로 돌아간다.
const PRAY_BGM_LIST = [
  "music/catholicrelax-small-boat-into-silence-471285.mp3",
  "music/catholicrelax-quiet-boat-to-silence-471287.mp3",
];
let prayBgAudio = null;   // 배경음악 <audio> 요소 — 화면 이탈 시 정지
let prayBgTrack = 0;      // 현재 재생 중인 곡 인덱스

function stopPrayBgMusic() {
  if (prayBgAudio) { prayBgAudio.pause(); prayBgAudio.currentTime = 0; }
}
function playBgTrack(idx) {
  prayBgTrack = ((idx % PRAY_BGM_LIST.length) + PRAY_BGM_LIST.length) % PRAY_BGM_LIST.length;
  prayBgAudio.src = PRAY_BGM_LIST[prayBgTrack];
  prayBgAudio.play().catch(() => {});
}
const BGM_VOL_KEY = "bgm-vol";
function getBgmVol() {
  const v = parseFloat(localStorage.getItem(BGM_VOL_KEY));
  return v >= 0.0 && v <= 1.0 ? v : 0.4;
}
function setBgmVol(v) {
  try { localStorage.setItem(BGM_VOL_KEY, String(v)); } catch (e) {}
}
function togglePrayBgMusic(on) {
  if (!prayBgAudio) {
    prayBgAudio = new Audio();
    prayBgAudio.volume = getBgmVol();
    prayBgAudio.addEventListener("ended", () => {
      playBgTrack(prayBgTrack + 1);
    });
  }
  if (on) { playBgTrack(prayBgTrack); }
  else    { prayBgAudio.pause(); }
}

function renderPrayerBook(idx) {
  prayFullClose();          // 다른 화면에서 돌아올 때 덮개가 남아 있지 않게
  const u = loadUser();
  if (!prayName) prayName = (u && u.name) || "우리 가정";
  const app = document.getElementById("app");
  app.innerHTML = `<div class="pr-wrap"><div class="pr-loading">불러오는 중…</div></div>
    <button class="home-fab" id="pr-home" aria-label="첫 화면으로">${homeFabLabel(u, true)}</button>`;
  window.scrollTo(0, 0);
  document.getElementById("pr-home").addEventListener("click", () => { prayAutoPlay = false; prayQueue = null; stopSpeaking(); stopPrayBgMusic(); renderSummary(); });
  loadPrayers().then((list) => {
    if (idx == null) idx = prayToday(list.length);
    prayIdx = ((idx % list.length) + list.length) % list.length;
    drawPrayer(list, prayIdx);
  }).catch(() => {
    document.querySelector(".pr-loading").textContent = "기도문을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.";
  });
}

// ── 🙏 가정 축복 기도문 A안(2026-10-14 친구 「1안 — 짜임 그대로 · A 옷」 · 샘플 자료/design/2026-10-14-prayer-sample · 스위치 PRAY_LAYOUT(app.js)) ──
//   drawPrayer 가 그릴 때마다 옷만 입힌다 — ⛶ · ⚙ · 들려주기 · 이름 · 이전/다음 · 말씀 펴 보기 · 주제 줄의 꺾쇠. 연결 · 기록 · 이어 듣기 · 이름 채우기는 그대로.
//   ⚠️ 「들려주기」 이름은 재생 · 멈춤 때마다 여러 곳이 textContent 로 다시 쓴다(🔊 들려주기 ↔ ⏹ 그만듣기) — 지켜보다가 그림 글자를 선 아이콘으로 바꾼다.
//   ⚠️ 연속 · 반복 · 배경음악은 코드가 체크를 직접 끄기도 한다(change 가 안 난다) — 칸 색이 아니라 체크 상자 자체로 켬/끔을 보인다(style.css).
function prayApplyA() {
  if (typeof PRAY_LAYOUT === "undefined" || PRAY_LAYOUT !== "a") return;
  const wrap = document.querySelector("#app .pr-wrap");
  if (!wrap) return;
  wrap.classList.add("pr-a");
  const big = document.getElementById("pr-big");
  if (big) { big.innerHTML = haSvg("expand", "pra-ic"); big.setAttribute("aria-label", "크게 보기"); }
  const cfg = document.getElementById("pr-cfg");
  if (cfg) { cfg.innerHTML = haSvg("sliders", "pra-ic"); cfg.setAttribute("aria-label", "듣기 설정"); }
  const sp = document.getElementById("pr-speak");
  if (sp) {
    const deco = () => {
      if (sp.querySelector("svg")) return;
      const stop = /그만/.test(sp.textContent);
      setStripEmoji(sp);
      sp.insertAdjacentHTML("afterbegin", haSvg(stop ? "stop" : "speaker", "pra-ic"));
    };
    deco();
    new MutationObserver(deco).observe(sp, { childList: true, characterData: true, subtree: true });
  }
  const nm = document.getElementById("pr-name");
  if (nm) { setStripEmoji(nm); nm.insertAdjacentHTML("afterbegin", haSvg("user", "pra-ic")); }
  const pv = document.getElementById("pr-prev");
  if (pv) pv.innerHTML = haSvg("back", "pra-ic") + "<span>이전</span>";
  const nx = document.getElementById("pr-next");
  if (nx) nx.innerHTML = "<span>다음</span>" + haSvg("chev", "pra-ic");
  wrap.querySelectorAll(".pr-acc-caret").forEach((c) => { c.innerHTML = haSvg("down", "pra-caret"); });
  const bgm = document.getElementById("pr-bgm-chk");
  const bl = bgm && bgm.parentElement;
  if (bl) [...bl.childNodes].forEach((n) => { if (n.nodeType === 3 && /배경음악/.test(n.data)) n.data = " 배경음악"; });
}

let prayLogged = null;   // 방금 기록한 편 — 이름 바꾸기 등으로 다시 그릴 때 두 번 세지 않게

function drawPrayer(list, i) {
  const b = list[i];
  // 누가 얼마나 보시는지 남긴다(서버가 하루·편 단위로 묶는다).
  // ⚠️ 실패해도 조용히 넘긴다 — 기록 때문에 기도문이 안 열리면 본말이 뒤집힌다.
  if (prayLogged !== b.no) {
    prayLogged = b.no;
    const u = loadUser();
    if (u && u.user_id) { try { api.blessingLog({ user_id: u.user_id, no: b.no }).catch(() => {}); } catch (e) {} }
  }
  const chunks = prayChunks(b.prayer);
  const prayer = chunks.map((sent, k) =>
    `<div class="pr-s${k === chunks.length - 1 ? " pr-amen" : ""}">${prayFillHtml(sent, prayName)}</div>`).join("");
  const groups = [];
  list.forEach((x) => { const g = groups.find((y) => y.g === x.group); g ? g.n++ : groups.push({ g: x.group, n: 1 }); });
  const todayNo = prayToday(list.length);
  const isToday = i === todayNo;
  // ⚠️ 기도문이 먼저다. 말씀은 「필요하면 펴서」 — 이 화면은 읽고 축복하는 자리이지
  //    말씀을 공부하는 자리가 아니다. 편 상태는 이전/다음에도 이어진다(prayOpenVerse).
  document.querySelector(".pr-wrap").innerHTML = `
    <div class="pr-card">
      ${prayGroup ? `<button class="pr-gback pr-gback-in" id="pr-tolist">← ${prayEsc(prayGroup)} 목록</button>` : ""}
      <div class="pr-kicker">${isToday ? "오늘의 가정 축복 기도문" : "가정 축복 기도문"} <span class="pr-count">${i + 1} / ${list.length}</span></div>
      <div class="pr-title">${prayEsc(b.title)}</div>
      <div class="pr-ref">${prayEsc(b.ref)}</div>
      <div class="pr-prayer">${prayer}</div>
      <button class="pr-verse-tog" id="pr-vtog" aria-expanded="${prayOpenVerse}">${prayOpenVerse ? "▴ 말씀 접기" : "▾ 말씀 펴 보기"}</button>
      <div class="pr-verse" id="pr-verse" ${prayOpenVerse ? "" : "hidden"}>${prayEsc(b.verse)}</div>
      <div class="pr-acts">
        <button class="pr-big" id="pr-big" title="크게 보기">⛶</button>
        <button class="pr-speak" id="pr-speak">🔊 들려주기</button>
        <button class="pr-cfg" id="pr-cfg" title="듣기 설정">⚙️</button>
      </div>
      <div class="pr-tts-cfg" id="pr-tts-cfg" hidden>
        <div class="pr-cfg-row">
          <span class="pr-cfg-lbl">속도</span>
          <input type="range" class="pr-cfg-range" id="pr-rate" min="0.4" max="1.5" step="0.1" value="${getSpeakRate()}">
          <span class="pr-cfg-val" id="pr-rate-lbl">${rateLabel(getSpeakRate())}</span>
        </div>
        <div class="pr-cfg-row">
          <span class="pr-cfg-lbl">볼륨</span>
          <input type="range" class="pr-cfg-range" id="pr-vol" min="0.1" max="1.0" step="0.1" value="${getSpeakVol()}">
          <span class="pr-cfg-val" id="pr-vol-lbl">${volLabel(getSpeakVol())}</span>
        </div>
        <div class="pr-cfg-row">
          <span class="pr-cfg-lbl">음악</span>
          <input type="range" class="pr-cfg-range" id="pr-bgm-vol" min="0.0" max="1.0" step="0.1" value="${getBgmVol()}">
          <span class="pr-cfg-val" id="pr-bgm-vol-lbl">${volLabel(getBgmVol())}</span>
        </div>
        <div class="pr-cfg-info">속도·볼륨을 바꾸면 재생이 멈춥니다. 들려주기를 다시 눌러 시작하세요.</div>
      </div>
      <div class="pr-opts">
        <label class="pr-opt-label"><input type="checkbox" id="pr-auto-chk"${!prayRepeat && prayPref(PRAY_AUTO_KEY) ? " checked" : ""}> 연속듣기</label>
        <label class="pr-opt-label"><input type="checkbox" id="pr-repeat-chk"${prayRepeat ? " checked" : ""}> 반복듣기</label>
        <label class="pr-opt-label"><input type="checkbox" id="pr-bgm-chk"${prayPref(PRAY_BGM_KEY) ? " checked" : ""}> 🎵배경음악</label>
      </div>
      <div class="pr-nav">
        <button class="pr-arrow" id="pr-prev">← 이전</button>
        <button class="pr-name" id="pr-name">🙍 ${prayEsc(prayName)}</button>
        <button class="pr-arrow" id="pr-next">다음 →</button>
      </div>
    </div>
    <div class="grp-title">주제로 찾기</div>
    <div class="pr-acc" id="pr-acc">
      ${groups.map((g) => {
        const items = list.map((x, xi) => ({ x, xi })).filter((o) => o.x.group === g.g);
        return `
        <div class="pr-acc-item">
          <button class="pr-acc-head" aria-expanded="false">
            <span>${prayEsc(g.g)} <b>${g.n}</b></span>
            <span class="pr-acc-caret">▾</span>
          </button>
          <div class="pr-acc-body">
            <button class="summary-help pr-group-play" data-g="${prayEsc(g.g)}" data-q="${items.map((o) => o.xi).join(",")}">▶ 이 주제 전체 듣기 <span class="pr-item-ref">${items.length}편</span></button>
            ${items.map((o) => `<button class="summary-help pr-item${o.xi === todayNo ? " on" : ""}" data-i="${o.xi}" data-g="${prayEsc(g.g)}">${prayEsc(o.x.title)}
               <span class="pr-item-ref">${o.xi === todayNo ? "오늘 · " : ""}${prayEsc(prayRefShort(o.x.ref))}</span></button>`).join("")}
          </div>
        </div>`;
      }).join("")}
    </div>`;
  // ⚠️ 이전/다음은 주제 안이 아니라 104편 전체를 돈다 — 그러면 「목록으로」가 거짓말이 되므로 내린다
  document.getElementById("pr-prev").addEventListener("click", () => { prayAutoPlay = false; prayQueue = null; prayRepeat = false; stopSpeaking(); prayGroup = null; drawPrayer(list, (i - 1 + list.length) % list.length); window.scrollTo(0,0); });
  document.getElementById("pr-next").addEventListener("click", () => { prayAutoPlay = false; prayQueue = null; prayRepeat = false; stopSpeaking(); prayGroup = null; drawPrayer(list, (i + 1) % list.length); window.scrollTo(0,0); });
  document.getElementById("pr-name").addEventListener("click", () => askPrayName(list, i));
  const toList = document.getElementById("pr-tolist");
  if (toList) toList.addEventListener("click", () => { prayAutoPlay = false; prayQueue = null; stopSpeaking(); renderPrayerGroup(list, prayGroup); });
  document.getElementById("pr-big").addEventListener("click", () => { stopSpeaking(); prayFullOpen(list, i); });
  document.getElementById("pr-cfg").addEventListener("click", () => {
    const panel = document.getElementById("pr-tts-cfg");
    const btn = document.getElementById("pr-cfg");
    panel.hidden = !panel.hidden;
    btn.classList.toggle("open", !panel.hidden);
  });
  const stopIfPlaying = () => {
    if (window.speechSynthesis && window.speechSynthesis.speaking) {
      prayAutoPlay = false;
      prayRepeat = false;
      prayQueue = null;
      stopSpeaking();
      const sp = document.getElementById("pr-speak");
      if (sp) sp.textContent = "🔊 들려주기";
      // 연속듣기 체크는 「고른 설정」이라 멈춘다고 풀지 않는다(위 PRAY_AUTO_KEY 주석)
      const chkR = document.getElementById("pr-repeat-chk");
      if (chkR) chkR.checked = false;
    }
  };
  document.getElementById("pr-rate").addEventListener("input", (e) => {
    document.getElementById("pr-rate-lbl").textContent = rateLabel(parseFloat(e.target.value));
  });
  document.getElementById("pr-rate").addEventListener("change", (e) => {
    setSpeakRate(parseFloat(e.target.value));
    stopIfPlaying();
  });
  document.getElementById("pr-vol").addEventListener("input", (e) => {
    document.getElementById("pr-vol-lbl").textContent = volLabel(parseFloat(e.target.value));
  });
  document.getElementById("pr-vol").addEventListener("change", (e) => {
    setSpeakVol(parseFloat(e.target.value));
    stopIfPlaying();
  });
  document.getElementById("pr-bgm-vol").addEventListener("input", (e) => {
    const v = parseFloat(e.target.value);
    document.getElementById("pr-bgm-vol-lbl").textContent = volLabel(v);
    if (prayBgAudio) prayBgAudio.volume = v;  // 실시간 반영 — 재시작 불필요
  });
  document.getElementById("pr-bgm-vol").addEventListener("change", (e) => {
    setBgmVol(parseFloat(e.target.value));
  });
  // 주제 아코디언 — 화면을 옮기지 않고 그 자리에서 펴고 접는다. 한 번에 하나만 열린다.
  document.querySelectorAll(".pr-acc-head").forEach((head) => {
    head.addEventListener("click", () => {
      const item = head.closest(".pr-acc-item");
      const willOpen = !item.classList.contains("open");
      document.querySelectorAll(".pr-acc-item.open").forEach((other) => {
        if (other !== item) prAccSet(other, false);
      });
      prAccSet(item, willOpen);
    });
  });
  document.querySelectorAll(".pr-acc-item .pr-item").forEach((el) =>
    el.addEventListener("click", () => {
      prayAutoPlay = false; prayQueue = null;
      stopSpeaking();
      prayGroup = el.dataset.g;   // 「← <주제> 목록」이 여기로 돌아올 수 있게
      drawPrayer(list, Number(el.dataset.i));
      window.scrollTo(0, 0);
    }));
  // 주제 전체 듣기 — 첫 편을 그리고 **이 탭 안에서 바로** 들려주기를 누른다.
  // ⚠️ setTimeout 으로 미루면 사용자 동작과 끊겨 아이폰이 낭독·배경음악을 막는다.
  document.querySelectorAll(".pr-group-play").forEach((el) =>
    el.addEventListener("click", () => {
      const q = el.dataset.q.split(",").map(Number).filter((n) => n >= 0 && n < list.length);
      if (!q.length) return;
      stopSpeaking();
      prayRepeat = false;
      prayGroup = el.dataset.g;
      drawPrayer(list, q[0]);
      prayQueue = q;            // drawPrayer 뒤에 넣는다 — 그리기가 비우는 일은 없지만 순서를 분명히
      window.scrollTo(0, 0);
      const btn = document.getElementById("pr-speak");
      if (btn) btn.click();
    }));
  const tog = document.getElementById("pr-vtog"), vs = document.getElementById("pr-verse");
  tog.addEventListener("click", () => {
    prayOpenVerse = !prayOpenVerse;
    vs.hidden = !prayOpenVerse;
    tog.textContent = prayOpenVerse ? "▴ 말씀 접기" : "▾ 말씀 펴 보기";
    tog.setAttribute("aria-expanded", String(prayOpenVerse));
  });
  // 🔊 — **보이는 것을 읽는다**(말씀을 접어 뒀으면 읽지 않는다). 앨범 「전부 듣기」가
  //      화면에 보이는 순서 그대로 읽는 것과 같은 규칙이다. 사이 마침표가 쉼을 만든다.
  const sp = document.getElementById("pr-speak");
  const buildSaid = (bx) => [bx.title, prayOpenVerse ? bx.verse : "",
    prayChunks(bx.prayer).map((x) => prayFill(x, prayName)).join(" ")].filter(Boolean).join(". ");
  // 연속듣기·반복듣기: TTS 끝나면 다음 편 또는 같은 편 자동 재생
  const playFrom = (idx) => {
    speakText(buildSaid(list[idx]), () => {
      const s = document.getElementById("pr-speak");
      if (prayRepeat) {
        // 같은 편 반복
        setTimeout(() => {
          if (!prayRepeat) return;
          const ns = document.getElementById("pr-speak");
          if (ns) ns.textContent = "⏹ 그만듣기";
          playFrom(idx);
        }, 2000);
        return;
      }
      if (!prayAutoPlay) { prayQueue = null; if (s) s.textContent = "🔊 들려주기"; return; }
      // 주제 전체 듣기면 그 주제 줄만 따라가고 마지막 편에서 멈춘다. 아니면 104편을 한 바퀴.
      let nextIdx;
      if (prayQueue) {
        const k = prayQueue.indexOf(idx);
        nextIdx = k >= 0 && k < prayQueue.length - 1 ? prayQueue[k + 1] : -1;
        if (nextIdx < 0) { prayAutoPlay = false; prayQueue = null; if (s) s.textContent = "🔊 들려주기"; return; }
      } else {
        nextIdx = (idx + 1) % list.length;
        if (nextIdx === 0) { prayAutoPlay = false; if (s) s.textContent = "🔊 들려주기"; return; }
      }
      drawPrayer(list, nextIdx);
      window.scrollTo(0, 0);
      setTimeout(() => {
        if (!prayAutoPlay) return;
        const ns = document.getElementById("pr-speak");
        if (ns) ns.textContent = "⏹ 그만듣기";
        playFrom(nextIdx);
      }, 2000);
    }, 1, "ko-KR");
  };
  sp.addEventListener("click", () => {
    if (window.speechSynthesis && window.speechSynthesis.speaking) {
      prayAutoPlay = false;
      prayRepeat = false;
      prayQueue = null;
      stopSpeaking();
      sp.textContent = "🔊 들려주기";
      return;
    }
    const chkAuto = document.getElementById("pr-auto-chk");
    const chkRep  = document.getElementById("pr-repeat-chk");
    // 주제 전체 듣기는 연속듣기 체크와 상관없이 이어서 읽는다(그걸 하려고 누른 단추다)
    prayAutoPlay = !!prayQueue || !!(chkAuto && chkAuto.checked);
    prayRepeat   = !prayQueue && !!(chkRep  && chkRep.checked);
    // 배경음악이 켜져 있으면 이 탭(사용자 동작) 안에서 함께 시작한다 — 탭 밖에서는 브라우저가 막는다
    const chkBgm = document.getElementById("pr-bgm-chk");
    if (chkBgm && chkBgm.checked && (!prayBgAudio || prayBgAudio.paused)) togglePrayBgMusic(true);
    sp.textContent = "⏹ 그만듣기";
    playFrom(i);
  });
  document.getElementById("pr-auto-chk").addEventListener("change", (e) => {
    prayAutoPlay = e.target.checked;
    setPrayPref(PRAY_AUTO_KEY, e.target.checked);  // 직접 누른 것만 기억한다(반복듣기가 끈 것은 안 남긴다)
    if (e.target.checked) { prayRepeat = false; document.getElementById("pr-repeat-chk").checked = false; }
  });
  document.getElementById("pr-repeat-chk").addEventListener("change", (e) => {
    prayRepeat = e.target.checked;
    if (e.target.checked) { prayAutoPlay = false; document.getElementById("pr-auto-chk").checked = false; }
  });
  document.getElementById("pr-bgm-chk").addEventListener("change", (e) => {
    setPrayPref(PRAY_BGM_KEY, e.target.checked);
    togglePrayBgMusic(e.target.checked);
  });
  prayApplyA();   // 기도문 A안(PRAY_LAYOUT) — 연결을 다 단 뒤 옷만
}

// 주제 아코디언 한 칸을 펴거나 접는다.
//   ⚠️ max-height 를 큰 고정값(2000px 등)으로 트랜지션하면 실제 내용 높이에 먼저
//      도달해 버려 "확 펼쳐졌다 뚝 멈추는" 느낌이 난다 — scrollHeight 를 실측해
//      정확한 값을 준다(닫을 때도 먼저 그 값이어야 0으로 되짚어 갈 수 있다).
//   ⚠️ 다 펼친 뒤에는 max-height 를 **풀어 준다(none)**. 잰 높이를 그대로 두면, 그 뒤 글씨가
//      커지거나(웹폰트 교체·글씨 크기 설정) 줄이 바뀌어 내용이 길어질 때 단추들이 좁은 상자 안에
//      눌려 납작해지고 글자가 반쯤 잘렸다(2026-09-25 실기기 제보 — 「지혜와 형통」 다섯 칸).
//      접을 때는 none 에서는 트랜지션이 안 되므로 지금 높이로 되돌려 놓고 한 번 그린 뒤 0 으로 간다.
function prAccSet(item, open) {
  const body = item.querySelector(".pr-acc-body");
  const head = item.querySelector(".pr-acc-head");
  item.classList.toggle("open", open);
  head.setAttribute("aria-expanded", String(open));
  if (open) {
    body.style.maxHeight = body.scrollHeight + "px";
    const done = (e) => {
      if (e.target !== body) return;
      body.removeEventListener("transitionend", done);
      if (item.classList.contains("open")) body.style.maxHeight = "none";
    };
    body.addEventListener("transitionend", done);
  } else {
    body.style.maxHeight = body.scrollHeight + "px";
    void body.offsetHeight; // 지금 높이를 한 번 그려야 0 까지 트랜지션이 걸린다
    body.style.maxHeight = "0px";
  }
}

// ── 크게 보기(전체 화면) ──────────────────────────────────────
//   가정 예배에서 온 식구가 함께 보는 자리. 글씨를 화면에 꽉 차게 키운다.
//   ⚠️ **전체화면 API(requestFullscreen)를 쓰지 않는다.** 2026-09-03 에 넣었다가 뺐다 —
//      안드로이드 크롬은 전체화면에 들어간 **그 방향으로 화면을 고정**해 버려서,
//      가로로 들어가면 세로로 되돌릴 수가 없었다. 덮개(position:fixed inset:0)만으로
//      화면은 이미 다 덮이고, 그 대가는 주소창이 남는 것뿐이다 — 방향이 갇히는 것보다 싸다.
//      아이폰 사파리는 애초에 video 말고는 전체화면을 주지도 않았다.
//   ⚠️ 화면 방향은 강제로 못 돌린다(iOS 는 screen.orientation.lock 자체가 없다).
let prayFullEsc = null;
let prayFullPop = null;
let prayRot = false;   // 크게 보기를 90° 돌려 볼까 — 폰이 세로로 잠겨 있어도 가로로 읽게
// 출처를 짧게 — 「창세기 26:2-4」 → 「창 26:2-4」. 제목 옆에 붙일 자리가 좁다.
// ⚠️ 못 알아본 책 이름은 **그대로 둔다**(자르지 않는다) — 틀린 약자보다 긴 본명이 낫다.
const PRAY_BOOK = {
  창세기: "창", 출애굽기: "출", 레위기: "레", 민수기: "민", 신명기: "신",
  여호수아: "수", 사사기: "삿", 룻기: "룻", 사무엘상: "삼상", 사무엘하: "삼하",
  열왕기상: "왕상", 열왕기하: "왕하", 역대상: "대상", 역대하: "대하",
  에스라: "스", 느헤미야: "느", 에스더: "에", 욥기: "욥", 시편: "시",
  잠언: "잠", 전도서: "전", 아가: "아", 이사야: "사", 예레미야: "렘",
};
function prayRefShort(ref) {
  const m = String(ref || "").match(/^([가-힣]+)\s*(.*)$/);
  if (!m) return ref || "";
  const short = PRAY_BOOK[m[1]];
  return short ? short + " " + m[2] : ref;
}

// 액자 — 말씀카드(액자용)의 양식을 그대로 옮겼다: 이중 테두리 + 수채화 잎가지 + ❖ 장식.
// 소재는 `img/frame/leaf1~6.webp`(`tools/frame-art.py`가 말씀카드 원본에서 줄여 만든다).
// ⚠️ **여는 순간에만 받는다** — 한 번 열 때 잎가지 한 장(27~46KB)뿐이다. 미리 받아 두면
//    글꼴 765KB 사건과 같은 길이가 된다(기도문 화면은 이미 blessings 83KB를 받는다).
// ⚠️ 장식이므로 낭독기가 건너뛰게 `aria-hidden` · `alt=""`. 뜻을 나르는 그림이 아니다.
// ⚠️ 잎가지 자리(`pos`)와 크기(`w`)도 함께 가른다 — 여섯이 다 같은 자리면
//    「액자 하나에 풀만 바꾼 것」으로 보인다. b=아래 두 귀퉁이 · d=엇갈리게(왼쪽 위·오른쪽 아래).
const PRAY_FRAMES = [
  { c: "gold", art: 6, pos: "b", w: 25 },   // 금색 · 밀이삭    (말씀카드 스바냐 면과 같은 짝)
  { c: "navy", art: 4, pos: "b", w: 24 },   // 군청 · 흰꽃      (말씀카드 나훔 면과 같은 짝)
  { c: "gold", art: 1, pos: "d", w: 30 },   // 금색 · 유칼립투스
  { c: "navy", art: 3, pos: "b", w: 33 },   // 군청 · 유칼립투스와 올리브잎
  { c: "gold", art: 5, pos: "d", w: 36 },   // 금색 · 올리브가지
  { c: "navy", art: 2, pos: "b", w: 35 },   // 군청 · 유칼립투스와 열매
];
let prayFrameLast = -1;
function prayPickFrame() {
  let k = Math.floor(Math.random() * PRAY_FRAMES.length);
  if (k >= PRAY_FRAMES.length) k = PRAY_FRAMES.length - 1;      // Math.random()이 1을 줄 때
  // 바로 앞과 같은 액자는 피한다 — 두 번 잇달아 같으면 「하나뿐인가」로 보인다
  if (k === prayFrameLast) k = (k + 1) % PRAY_FRAMES.length;
  prayFrameLast = k;
  return PRAY_FRAMES[k];
}

function prayFullOpen(list, i) {
  const b = list[i];
  const fr = prayPickFrame();
  // ⚠️ `?v=`를 붙인다(말씀 연상 그림과 같은 규칙) — 안 붙이면 소재를 고쳐도 옛 그림이 남는다
  const leaf = "img/frame/leaf" + fr.art + ".webp?v=" + APP_BUILD;
  const wrap = document.createElement("div");
  // ⚠️ 액자 색은 **덮개**에 붙인다 — 테두리 색(`--fr`)을 ❖ 장식도 같이 써야 하는데,
  //    CSS 변수는 형제에게 안 내려가고 자손에게만 내려간다.
  wrap.className = "pr-full pr-fr-" + fr.c;
  wrap.innerHTML = `
    <div class="pr-frame pr-pos-${fr.pos}" data-lw="${fr.w}" aria-hidden="true">
      <img class="pr-fr-leaf l" src="${leaf}" alt="">
      <img class="pr-fr-leaf r" src="${leaf}" alt="">
      <div class="pr-fr-box"></div>
    </div>
    <button class="pr-f-x" aria-label="닫기">✕</button>
    <button class="pr-f-rot" aria-label="가로로 돌려 보기">⟳</button>
    <div class="pr-f-in">
      <div class="pr-f-title">${prayEsc(b.title)} <span class="pr-f-ref">${prayEsc(prayRefShort(b.ref))}</span></div>
      <div class="pr-f-orn" aria-hidden="true"><i></i>${PRAY_ORN}<i></i></div>
      <div class="pr-f-body">${prayChunks(b.prayer).map((sent, k, arr) =>
        `<div class="pr-s${k === arr.length - 1 ? " pr-amen" : ""}">${prayFillHtml(sent, prayName)}</div>`).join("")}</div>
    </div>`;
  document.body.appendChild(wrap);
  document.body.classList.add("pr-full-on");
  // 잎가지를 못 받으면 조용히 감춘다 — 깨진 그림 표시가 뜨면 액자가 없느니만 못하다
  wrap.querySelectorAll(".pr-fr-leaf").forEach((im) => { im.onerror = () => { im.style.display = "none"; }; });
  wrap.classList.toggle("pr-rot", prayRot);      // 지난번에 돌려 뒀으면 그대로
  // 옛 판(2026-09-03 이전)으로 전체화면에 들어가 갇힌 분이 있을 수 있다 — 열 때 풀어 준다.
  // ⚠️ 안드로이드 크롬은 전체화면에 들어간 그 방향으로 화면을 고정한다.
  try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {}); } catch (e) {}
  // 안드로이드 「뒤로 가기」로도 닫히게 — 없으면 덮개가 남은 채 앱을 빠져나간다
  try { history.pushState({ prFull: 1 }, ""); } catch (e) {}
  prayFullPop = () => prayFullClose(false, true);
  window.addEventListener("popstate", prayFullPop);
  keepScreenAwake(true);                      // 함께 읽는 동안 화면이 꺼지면 안 된다
  prayFitText(wrap);
  // ⚠️ 글꼴이 늦게 온다. 이 앱은 한글 웹폰트를 media="print" 로 미뤄 받으므로(첫 화면이
  //    765KB 를 기다리지 않게), 방금 잰 것은 **기기 기본 글꼴** 폭이다. 웹폰트로 바뀌면
  //    글자가 넓어져 좌우로 삐져나간다 — 준비되면 한 번 더 잰다.
  try { if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => prayFullResize()); } catch (e) {}
  const close = () => prayFullClose();
  wrap.querySelector(".pr-f-x").addEventListener("click", close);
  // ⟳ — 기기를 돌리는 게 아니라 **글자를 돌려 그린다**. 폰이 세로로 잠겨 있어도(자동 회전
  //     꺼짐·앱 껍데기의 세로 고정) 폰만 옆으로 들면 가로로 읽을 수 있다.
  wrap.querySelector(".pr-f-rot").addEventListener("click", () => {
    prayRot = !prayRot;
    wrap.classList.toggle("pr-rot", prayRot);
    prayFitText(wrap);
  });
  prayFullEsc = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", prayFullEsc);
  window.addEventListener("resize", prayFullResize);
}
function prayFullResize() {
  const w = document.querySelector(".pr-full");
  if (w) prayFitText(w);
}
function prayFullClose(keepAwake, fromPop) {
  const w = document.querySelector(".pr-full");
  if (w) w.remove();
  document.body.classList.remove("pr-full-on");
  window.removeEventListener("resize", prayFullResize);
  if (prayFullPop) { window.removeEventListener("popstate", prayFullPop); prayFullPop = null; }
  // 뒤로 가기로 닫힌 것이 아니면, 열 때 쌓아 둔 기록을 되돌린다(안 그러면 뒤로 가기가 한 번 헛돈다)
  if (!fromPop && w) { try { if (history.state && history.state.prFull) history.back(); } catch (e) {} }
  if (prayFullEsc) { document.removeEventListener("keydown", prayFullEsc); prayFullEsc = null; }
  // 우리는 이제 전체화면에 들어가지 않지만, 옛 판으로 들어갔다가 갇힌 분이 닫으면 풀리도록 남긴다
  try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {}); } catch (e) {}
  if (!keepAwake) keepScreenAwake(false);
}
// 글씨를 화면에 꽉 차게 — 넘치지 않는 가장 큰 크기를 이분법으로 찾는다.
//   ⚠️ 바깥의 scrollHeight 로 재지 않는다. 가운데 정렬(justify-content:center)이면
//      **위로 넘친 만큼은 scrollHeight 에 안 잡혀** 넘쳤는지 모른 채 지나간다
//      (말씀 카드에서 출처가 테두리 밖으로 나갔던 것과 같은 함정).
//      안쪽 덩이의 실제 높이를 재서 견준다.
// 화면 가장자리의 안전 여백(상태바·노치·홈 막대, px) — env() 는 CSS 에서만 읽히므로
// 보이지 않는 상자에 여백으로 걸어 잰다. 사파리·안드로이드에서는 대개 0 이다.
function safeAreaInsets() {
  const p = document.createElement("div");
  p.style.cssText = "position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;" +
    "padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) " +
    "env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)";
  document.body.appendChild(p);
  const cs = getComputedStyle(p);
  const r = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0,
              b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
  p.remove();
  return r;
}
function prayFitText(wrap) {
  const box = wrap.querySelector(".pr-f-in");
  const cs = getComputedStyle(wrap);
  const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const rot = wrap.classList.contains("pr-rot");
  // 액자도 글과 함께 돈다 — 돌려 볼 때 잎가지가 위·아래에서 자라 나오면 액자로 안 보인다.
  // ⚠️ 100vw/100vh 로 쓰지 않는다(주소창 때문에 실제 덮개 크기와 어긋난다) — 덮개를 직접 잰다.
  const frame = wrap.querySelector(".pr-frame");
  if (frame) {
    // ⚠️ 덮개는 물리 화면 끝까지라, 돌려 볼 때 덮개 크기를 그대로 쓰면 액자 테두리가
    //    상태바·홈 막대 밑으로 들어간다(아이폰 앱) — 안전 여백을 빼서 넣는다.
    const sa = rot ? safeAreaInsets() : null;
    frame.style.width = rot ? (wrap.clientHeight - sa.t - sa.b) + "px" : "";
    frame.style.height = rot ? (wrap.clientWidth - sa.l - sa.r) + "px" : "";
    // ⚠️ 잎가지 폭은 **화면의 짧은 쪽**을 따라간다. `%`로 두면 액자의 가로를 따르는데,
    //    돌려 보기에서는 그 가로가 화면 세로(긴 쪽)라 잎가지가 두 배로 부풀어
    //    화면 폭의 3분의 2를 덮었다(2026-09-04 실측). 여기서 픽셀로 정한다.
    const side = Math.min(frame.offsetWidth, frame.offsetHeight);
    frame.style.setProperty("--lw", Math.round(side * (Number(frame.dataset.lw) || 30) / 100) + "px");
  }
  // 90° 돌리면 **글이 흐르는 폭은 화면 높이**가 되고, 채울 높이는 화면 폭이 된다
  const availW = (rot ? wrap.clientHeight - padY : wrap.clientWidth - padX);
  const availH = (rot ? wrap.clientWidth - padX : wrap.clientHeight - padY);
  box.style.width = rot ? availW + "px" : "";
  let lo = 13, hi = 108, best = 13;   // 천장: 짧은 편이 72px 에서 걸려 더 못 크고 있었다
  for (let k = 0; k < 12; k++) {
    const mid = (lo + hi) / 2;
    box.style.fontSize = mid + "px";
    // ⚠️ offsetHeight 로 잰다 — getBoundingClientRect 는 **돌린 뒤의 겉넓이**를 주므로
    //    회전 모드에서 가로·세로가 뒤바뀐 값이 나온다. offsetHeight 는 돌리기 전 배치 높이다.
    const fit = box.offsetHeight <= availH && box.scrollWidth <= box.clientWidth + 1;
    if (fit) { best = mid; lo = mid; } else hi = mid;
  }
  // ⚠️ 여기서 찾는 것은 「넘치지 않는 **가장 큰** 크기」다. 그래서 이 화면은 스크롤이 없다
  //    (.pr-full 은 overflow:hidden 이라 넘칠 수도 없다). 줄간격만 줄이면 그 자리를 글씨가
  //    도로 차지해 오히려 커지므로, 여기서 크기를 줄이려면 찾은 값에 비율을 곱해야 한다.
  box.style.fontSize = (Math.floor(best * 10) / 10) + "px";
}

// 주제 하나의 목록
function renderPrayerGroup(list, g) {
  const items = list.map((b, i) => ({ b, i })).filter((x) => x.b.group === g);
  const today = prayToday(list.length);
  prayGroup = g;                       // 여기서 들어간 기도문에는 「목록으로」를 띄운다
  document.querySelector(".pr-wrap").innerHTML = `
    <div class="pr-ghead">
      <span class="pr-gname">${prayEsc(g)} <b>${items.length}</b></span>
      <button class="pr-gback" id="pr-back">← 뒤로</button>
    </div>
    ${items.map((x) => `<button class="summary-help pr-item${x.i === today ? " on" : ""}" data-i="${x.i}">${prayEsc(x.b.title)}
       <span class="pr-item-ref">${x.i === today ? "오늘 · " : ""}${prayEsc(prayRefShort(x.b.ref))}</span></button>`).join("")}`;
  window.scrollTo(0, 0);
  document.querySelectorAll(".pr-item").forEach((el) =>
    el.addEventListener("click", () => drawPrayer(list, Number(el.dataset.i))));
  document.getElementById("pr-back").addEventListener("click", () => { prayGroup = null; drawPrayer(list, prayIdx); });
}

// 누구 이름으로 읽을지 — 가족 이름으로도 읽을 수 있게.
// ⚠️ 창을 띄우지 않고 그 자리에 입력 줄을 편다. 어르신께는 창이 하나 덜 뜨는 편이 낫다.
function askPrayName(list, i) {
  const btn = document.getElementById("pr-name");
  if (!btn || document.getElementById("pr-name-row")) return;
  const row = document.createElement("div");
  row.className = "pr-name-row"; row.id = "pr-name-row";
  row.innerHTML = `<input id="pr-name-in" type="text" maxlength="12" value="${prayName}"
                     aria-label="누구를 위해 읽을지" autocomplete="off">
                   <button class="pr-name-ok" id="pr-name-ok">확인</button>`;
  btn.parentNode.insertAdjacentElement("afterend", row);
  const inp = document.getElementById("pr-name-in");
  inp.focus(); inp.select();
  const ok = () => {
    const n = inp.value.trim();
    if (n) { prayName = n; }
    drawPrayer(list, i);
  };
  document.getElementById("pr-name-ok").addEventListener("click", ok);
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter") ok(); });
}
