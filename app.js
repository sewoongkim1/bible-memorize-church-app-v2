// ============================================================
// 성경 암송 — 회원 버전(교구/교회학교 식별) app.js
// ============================================================
// 익명 버전과 동일한 암송 로직 + 진입(식별)·본인 기록 요약·서버 백업 추가
// ------------------------------------------------------------

// 이 파일의 빌드 번호 — index.html의 app.js?v= 와 반드시 같아야 한다.
// (tools/bump.py가 둘을 함께 올린다)
const APP_BUILD = "20260905n";

// 배포 직후 CDN이 아직 옛 app.js를 내보내면, 브라우저는 그 옛 내용을 '새 주소'
// 아래 캐시해 버린다. 주소가 다시 바뀌기 전까지(최대 10분) 옛 화면이 남는 이유다.
// index.html이 부른 번호와 실제 실행되는 번호가 다르면 캐시를 갱신해 다시 받는다.
(function ensureFreshBuild() {
  try {
    const el = document.querySelector('script[src*="app.js"]');
    const m = el && el.src.match(/[?&]v=([^&"']+)/);
    const want = m ? m[1] : null;
    if (!want || want === APP_BUILD) return;
    if (sessionStorage.getItem("build-fix") === want) return;   // 한 세션에 한 번만
    sessionStorage.setItem("build-fix", want);
    // cache: "reload" — 네트워크에서 받아 HTTP 캐시의 내용까지 갈아 끼운다
    Promise.all([
      fetch("app.js?v=" + want, { cache: "reload" }),
      fetch("style.css?v=" + want, { cache: "reload" }).catch(function () {}),
    ])
      .then(function () {
        return window.caches
          ? caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); })
          : null;
      })
      .then(function () { location.reload(); })
      .catch(function () {});
  } catch (_) {}
})();

// 말씀 데이터: 정적 verses.json 1순위, 실패 시 시트 API 폴백
const DATA_URL = "verses.json";
const API_URL = "https://script.google.com/macros/s/AKfycbzO4GDAy0hJBbZ-L3hVuZQI4cqnjiZdy2afUujnxmmAr8NAh1lJURhrfT37PaFanPR4PA/exec";

// v2: 데이터 저장/조회는 Supabase API 미들웨어(js/api.js의 window.api)로 처리.
// (아래 플래그는 동기화 상태 UI 분기용 — v2는 항상 서버를 사용)
const POST_URL = true;

// 식별 항목 (summer-bible 등록 화면과 동일)
const GU_LIST = ["믿음", "소망", "사랑", "섬김", "은혜", "화평", "기쁨", "새가족"];
const BU_LIST = ["사랑부", "영아부", "유아부", "유치부", "유년부", "초등부", "중등부", "고등부", "청년부"];

let verses = []; // 화면에 쓰는 구절 데이터

// 화면 전환 시 보이는 로딩 표시 (로고 + "불러오는 중...")
const LOADING_HTML = `
  <div class="app-loading">
    <img class="al-logo" src="https://summer.onlybible.kr/logo3.png" alt="" />
    <div class="al-text">불러오는 중...</div>
  </div>`;

// 스플래시 제거 — 광고 효과를 위해 시작 후 최소 이만큼은 유지한 뒤 사라진다.
// (여는 사람 입장에서는 기다림이므로 짧을수록 좋다. index.html의 안전장치보다는 짧아야 한다)
const SPLASH_MIN_MS = 2000;
function dismissSplash() {
  const s = document.getElementById("splash");
  if (!s) return;
  const start = window.__splashStart || Date.now();
  const wait = Math.max(0, SPLASH_MIN_MS - (Date.now() - start));
  setTimeout(() => {
    s.classList.add("hide");
    setTimeout(() => { if (s.parentNode) s.parentNode.removeChild(s); }, 450);
  }, wait);
}

// ------------------------------------------------------------
// 데이터 로드 → 사용자 유무에 따라 진입/요약으로 분기
// ------------------------------------------------------------
async function loadVerses() {
  const appEl = document.getElementById("app");
  appEl.innerHTML = LOADING_HTML;

  // 1) DB(관리자 편집 반영) 우선
  try {
    if (window.api && api.getVerses) {
      const introP = loadIntroSlides(); // 인트로 슬라이드도 병렬 로드(첫 화면/미리보기 전에 준비)
      const d = await api.getVerses();
      await introP;
      if (d && d.ok && d.verses && d.verses.length) {
        verses = d.verses;
        dismissSplash();
        routeAfterLoad();
        return;
      }
    }
  } catch (e) { /* DB 실패 → 아래 정적 폴백 */ }

  // 2) 폴백: 정적 verses.json (→ 구 API)
  for (const url of [DATA_URL, API_URL]) {
    try {
      const res = await fetch(url, { cache: "no-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (!data.verses || !data.verses.length) throw new Error("데이터 없음");

      verses = data.verses;
      dismissSplash();
      routeAfterLoad();
      return;
    } catch (err) {
      if (url === API_URL) {
        dismissSplash();
        appEl.innerHTML = `<p class="error" style="text-align:center;padding:40px">연결 실패: ${err.message}</p>`;
      }
    }
  }
}

// 사용자 정보가 있으면 (서버 기록 동기화 후) 본인 기록 요약, 없으면 진입 화면
function routeAfterLoad() {
  _passagesPreview = getPassagesPreview();
  refreshPassagesPublic();
  // 어드민 테스트 진입(?passages=1): 홈을 거치지 않고 곧바로 핵심 암송 목록으로.
  if (_passagesPreview) { renderPassageList(); return; }
  // 딥링크(?v=구절번호): 설교 아카이브 등 외부에서 특정 구절로 바로 진입
  const deepNo = getDeepLinkVerseNo();
  if (deepNo != null) {
    const v = verses.find((x) => x.no === deepNo);
    if (v) { startTest(v); return; } // 로그인 없이도 암송 화면 진입(완료 시 로그인 유도)
  }
  // 미리보기(?preview=intro|blessing): 관리자 허브에서 확인용으로 강제 노출.
  // "이미 봤음" 상태를 건드리지 않아 성도님들 화면에는 영향이 없다.
  const preview = getPreviewKind();
  if (preview === "intro") {
    renderIntro(() => { if (loadUser()) enterAfterLogin(); else renderEntryScreen(); });
    return;
  }
  if (preview === "blessing" && loadUser()) {
    renderBlessing(() => enterAfterLogin()); // markBlessingSeen 호출 안 함 = 상태 불변
    return;
  }
  if (preview === "promo") {
    // 홍보 카드·NEW 배지를 이 기기에서 초기화해 다시 표시(다른 상태는 불변)
    try {
      localStorage.removeItem(PROMO_KEY);
      ["sermon", "meditation", "passages"].forEach((k) => localStorage.removeItem("feat-seen-" + k));
    } catch (e) {}
    if (loadUser()) enterAfterLogin(); else renderEntryScreen();
    return;
  }
  // 가정 축복 기도문 — 아직 성도님 첫 화면에는 없다(어드민에서만 확인).
  //   성도님께 열 때: renderSummary 의 「함께」 묶음에 한 줄을 더하면 된다.
  if (preview === "prayer") {
    if (loadUser()) renderPrayerBook(); else renderEntryScreen();
    return;
  }
  if (preview === "pilsa") {          // 성경필사 노트 신청 — 성도 화면 그대로 바로 진입
    if (loadUser()) renderPilsaApply(); else renderEntryScreen();
    return;
  }
  if (preview === "daily") {
    _skipAutoDaily = true;                              // enterAfterLogin의 자동 표시는 막고
    if (loadUser()) enterAfterLogin(); else renderEntryScreen();
    _skipAutoDaily = false;                             // (maybeShowDailyMessage는 위에서 동기 호출됨)
    previewDailyMessage();                              // 하루1회 상태 안 건드리고 강제 표시
    return;
  }

  maybeShowIntro(() => {
    if (loadUser()) enterAfterLogin();
    else renderEntryScreen();
  });
}

// URL의 ?preview=<종류>를 1회 읽어 반환(읽은 뒤 URL 정리 → 새로고침 시 재진입 방지)
function getPreviewKind() {
  try {
    const p = new URLSearchParams(location.search).get("preview");
    if (p === "intro" || p === "blessing" || p === "daily" || p === "promo" || p === "pilsa" || p === "prayer") {
      history.replaceState(null, "", location.pathname);
      return p;
    }
  } catch (e) {}
  return null;
}

// URL의 ?v=<구절번호>를 1회 읽어 반환(읽은 뒤 URL은 정리해 새로고침 시 재진입 방지)
// ?v=N&lang=en 이면 영어(NIV) 모드로 열어준다.
function getDeepLinkVerseNo() {
  try {
    const q = new URLSearchParams(location.search);
    const n = parseInt(q.get("v") || "", 10);
    if (Number.isFinite(n) && n > 0) {
      if (q.get("lang") === "en") setLang("en");
      history.replaceState(null, "", location.pathname);
      return n;
    }
  } catch (e) {}
  return null;
}

// 📜 내 안에 거하는 말씀(긴 본문 암송, 구 '핵심 암송') — 사용자 노출 게이트 & 데이터 로더 & 진행 기록
let _passagesPreview = false; // ?passages=1 이면 공개 플래그와 무관하게 노출(어드민 미리보기)
function getPassagesPreview() {
  try {
    if (new URLSearchParams(location.search).get("passages") === "1") {
      history.replaceState(null, "", location.pathname);
      return true;
    }
  } catch (e) {}
  return false;
}
const PASSAGES_PUB_KEY = "passages-public";
function passagesPublicCached() { try { return localStorage.getItem(PASSAGES_PUB_KEY) === "1"; } catch (e) { return false; } }
function refreshPassagesPublic() {
  if (!window.api || !api.getConfig) return;
  api.getConfig("passagesPublic").then((d) => {
    try { localStorage.setItem(PASSAGES_PUB_KEY, d && d.value ? "1" : "0"); } catch (e) {}
  }).catch(() => {});
}
function passagesVisible() { return _passagesPreview || passagesPublicCached(); }

let passagesCache = null;
async function loadPassages() {
  if (passagesCache) return passagesCache;
  if (!window.api || !api.getPassages) return [];
  try { const d = await api.getPassages(); passagesCache = (d && d.passages) || []; }
  catch (e) { passagesCache = []; }
  return passagesCache;
}

// 진행 기록(로컬) — { [passageId]: { done:[0,1,...], completed:bool } }
const PASSAGE_KEY = "memorize-passage";
function passageProgKey() { const u = loadUser(); return `${PASSAGE_KEY}::${u && u.user_id ? u.user_id : "guest"}`; }
function loadPassageProg() { try { return JSON.parse(localStorage.getItem(passageProgKey()) || "{}"); } catch (e) { return {}; } }
function savePassageProg(obj) { try { localStorage.setItem(passageProgKey(), JSON.stringify(obj)); } catch (e) {} }
function passageDone(id) { const p = loadPassageProg()[id]; return p && Array.isArray(p.done) ? p.done : []; }
function passageCompleted(id) { const p = loadPassageProg()[id]; return !!(p && p.completed); }
function syncPassageProgress(id, cur) {
  const u = loadUser();
  if (!u || !u.user_id || !api.savePassageProgress) return;
  api.savePassageProgress(u.user_id, id, cur.done, !!cur.completed).catch(() => {});
}
function markLineDone(id, seq) {
  const all = loadPassageProg(); const cur = all[id] || { done: [], completed: false };
  if (!cur.done.includes(seq)) cur.done.push(seq);
  cur.t = Date.now(); // 기기 동기화 때 최신 판정용
  all[id] = cur; savePassageProg(all); syncPassageProgress(id, cur);
}
function markPassageCompleted(id) {
  const all = loadPassageProg(); const cur = all[id] || { done: [], completed: false };
  cur.completed = true; cur.t = Date.now();
  all[id] = cur; savePassageProg(all); syncPassageProgress(id, cur);
}
// 서버의 마디 진행을 로컬과 병합 — 여러 기기에서 진도가 같아지게.
// 본문별로 최신 쪽(로컬 t vs 서버 updated_at)이 이기고, 로컬이 최신이거나 서버에 없으면 다시 올린다.
async function pullPassageProgress() {
  const u = loadUser();
  if (!u || !u.user_id || !api || !api.getPassageProgress) return;
  let rows;
  try {
    const d = await api.getPassageProgress(u.user_id);
    if (!d || !d.ok) return; rows = d.progress || [];
  } catch { return; }
  const all = loadPassageProg();
  rows.forEach((r) => {
    const st = r.updated_at ? Date.parse(r.updated_at) || 0 : 0;
    const loc = all[r.passage_id];
    if (!loc || st >= (loc.t || 0)) {
      all[r.passage_id] = { done: Array.isArray(r.done) ? r.done : [], completed: !!r.completed, t: st };
    } else {
      syncPassageProgress(r.passage_id, loc); // 로컬이 최신(예: 오프라인 진행) — 서버를 따라잡게
    }
  });
  Object.keys(all).forEach((id) => { // 서버에 아예 없는 로컬 진행(과거 동기화 실패분)도 올려준다
    if (!rows.some((r) => String(r.passage_id) === String(id))) syncPassageProgress(Number(id), all[id]);
  });
  savePassageProg(all);
}
// '처음으로': 이 본문의 진행(마음에 둠·완주)만 초기화한다. 이미 통계에 남긴 활동 기록은 지우지 않는다.
// 지우는 대신 '빈 진행+시각'을 남겨야 기기 동기화 때 옛 진도가 되살아나지 않는다.
function resetPassageProgress(id) {
  const all = loadPassageProg(); all[id] = { done: [], completed: false, t: Date.now() }; savePassageProg(all);
  const u = loadUser();
  if (u && u.user_id && api && api.savePassageProgress) api.savePassageProgress(u.user_id, id, [], false).catch(() => {});
}
// 내 안에 거하는 말씀 활동을 통계에 반영 — 마디 1·2·3단계와 전체 이어서, 매 단계 통과마다 1회씩
// challenge_log(verse_no=null, learn-* 모드)로 기록해 일반 암송에 합산.
// (오늘 N회·출석/스트릭·랭킹에 들어가고, 구절별 통계는 verse_no null이라 제외됨)
function logPassageActivity(mode) {
  const u = loadUser();
  if (!u || !u.user_id || !api || !api.challenge) return;
  api.challenge(u.user_id, null, mode === "voice" ? "learn-voice" : "learn-typing").catch(() => {});
}

function kstDateParts(raw) {
  const d = raw ? new Date(raw) : new Date();
  if (isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d).split("-").map(Number);
  return { y: parts[0], m: parts[1], d: parts[2] };
}

function kstDayNumber(raw) {
  const p = kstDateParts(raw);
  if (!p) return null;
  return Math.floor(Date.UTC(p.y, p.m - 1, p.d) / 86400000);
}

function getWeeklyVerseInfo() {
  const dated = verses
    .map((verse) => ({ verse, day: kstDayNumber(verse.date) }))
    .filter((x) => x.day !== null)
    .sort((a, b) => a.day - b.day);
  if (!dated.length) return null;

  const today = kstDayNumber();
  let idx = -1;
  dated.forEach((item, i) => { if (item.day <= today) idx = i; });

  if (idx >= 0) {
    const current = dated[idx];
    const diff = today - current.day;
    return {
      verse: current.verse,
      label: "이번주 말씀",
      isCurrentWeek: diff <= 6,
      prevVerse: idx > 0 ? dated[idx - 1].verse : null, // 직전 주 구절 — 이번주 설교 미등록 시 묵상 대체용
    };
  }

  return {
    verse: dated[0].verse,
    label: "곧 시작할 말씀",
    isCurrentWeek: false,
    prevVerse: null,
  };
}

// 로그인 직후: 로컬 기록으로 요약 화면을 즉시 띄우고,
// 서버 동기화는 백그라운드로 진행한다(Apps Script 콜드 스타트로 화면이 지연되지 않도록).
// opts.fresh = 로그인 폼으로 방금 들어온 경우에만 true.
// 앱 실행 때마다 호출되는 경로(routeAfterLoad)에서는 축복 화면을 띄우지 않는다
// — 기존 성도님 전원에게 축복 카드가 뜨는 걸 막기 위함.
async function enterAfterLogin(opts) {
  if (opts && opts.fresh && !blessingSeen()) {
    renderBlessing(() => { markBlessingSeen(); enterAfterLogin(); });
    return;
  }
  renderSummary(); // 로컬 진행 기록으로 곧바로 표시
  loadHeartMessages(); // 축하 메시지(관리자 설정) 백그라운드 로드
  loadDailyMilestoneMessages(); // 10·20·30회 달성 응원 문구 백그라운드 로드
  maybeShowDailyMessage(); // 관리자 '오늘의 메시지'(공지·격려) 하루 1회

  // 서버(진도·복습) 동기화 후, 요약 화면이 아직 떠 있으면 갱신(복습 due 반영)
  await syncProgress();
  if (document.getElementById("go-list")) renderSummary();
}

// ------------------------------------------------------------
// 첫 로그인 축복 인사 (사용자별 1회)
//   key: "memorize-blessing-seen::<사용자>" — 공용 기기에서도 각자 한 번씩 받도록
//   사용자별 키는 REVIEW_KEY·HEART_KEY와 같은 방식.
// ------------------------------------------------------------
const BLESS_KEY = "memorize-blessing-seen";

function blessKey() {
  const u = loadUser();
  if (!u) return BLESS_KEY;
  const id = u.type === "교구" ? `g|${u.gu}|${u.mok}|${u.name}` : `s|${u.bu}|${u.grade}|${u.name}`;
  return BLESS_KEY + "::" + id;
}
function blessingSeen() {
  if (!loadUser()) return true; // 사용자 정보 없으면 축복 화면 자체가 의미 없음
  try { return localStorage.getItem(blessKey()) === "1"; } catch { return true; }
}
function markBlessingSeen() {
  try { localStorage.setItem(blessKey(), "1"); } catch {}
}

function renderBlessing(next) {
  const u = loadUser();
  const appEl = document.getElementById("app");
  const affil = u.type === "교구"
    ? `${u.gu}-${u.mok}`
    : `${u.bu}${u.grade ? " " + u.grade : ""}`;

  appEl.innerHTML = `
    <div class="intro-screen bless-screen">
      <div class="intro-card bless-card">
        <div class="bless-affil">${affil}</div>
        <div class="intro-title bless-title"><b>${u.name}</b> 성도님,<br>환영합니다</div>
        <div class="bless-verse">
          여호와는 네게 복을 주시고<br>너를 지키시기를 원하며<br>
          여호와는 그의 얼굴을 네게 비추사<br>은혜 베푸시기를 원하며<br>
          여호와는 그 얼굴을 네게로 향하여 드사<br>평강 주시기를 원하노라
        </div>
        <div class="bless-ref">민수기 6:24-26</div>
        <div class="bless-msg">
          오늘부터 주의 말씀을 마음에 새기는<br>은혜의 여정을 함께해요. 🌿
        </div>
        <div class="bless-from">고척교회 제자양육부 신앙운동팀</div>
        <button class="intro-next bless-go" id="bless-go">아멘, 시작하기</button>
      </div>
    </div>`;

  document.getElementById("bless-go").addEventListener("click", next);
}

// 서버(시트)의 본인 기록을 받아 로컬 진행과 더 높은 단계로 병합.
// 이를 통해 다른 기기/브라우저에서 로그인해도 진도가 따라온다.
async function syncProgress() {
  const u = loadUser();
  if (!u) return false;

  try {
    saveSyncStatus("checking", "서버 기록을 확인하고 있습니다.");
    const data = await api.login({
      type: u.type, gu: u.gu, mok: u.mok, bu: u.bu, grade: u.grade, name: u.name,
    });
    // 서버 사용자 id 저장(이후 저장/도전/복습 API에 사용)
    if (data.user_id && u.user_id !== data.user_id) {
      u.user_id = data.user_id;
      saveUser(u);
    }

    // 한글·영어 진도를 각각 병합한다(서버가 언어별로 따로 보관)
    let changed = false;
    [["ko", data.progress], ["en", data.progressEn]].forEach(([lang, srv]) => {
      const local = loadProgress(lang);
      let dirty = false;
      Object.keys(srv || {}).forEach((no) => {
        const serverStage = Number(srv[no]);
        const cur = local[no]?.stage || 0;
        if (serverStage > cur) {
          local[no] = { stage: serverStage, passed: true };
          dirty = true;
        }
      });
      if (dirty) {
        changed = true;
        try { localStorage.setItem(progressKey(lang), JSON.stringify(local)); } catch {}
      }
    });

    // 서버 복습 일정 병합(다른 기기에서 완료한 복습 예약 반영)
    mergeServerReviews(data.reviews || []);
    // "마음에 둠" 체크도 서버 기준으로 반영(구버전 응답이면 hearted 없음 → 건너뜀)
    if (Array.isArray(data.hearted)) mergeServerHearted(data.hearted);
    saveSyncStatus("success", changed ? "서버 기록을 가져와 반영했습니다." : "서버와 기록을 확인했습니다.");
    return changed;
  } catch {
    saveSyncStatus("error", "서버 연결에 실패했습니다. 기록은 이 기기에 저장되어 있습니다.");
    return false;
  }
}

// 복습은 서버가 소스 오브 트루스 — 서버 목록으로 로컬을 완전 교체(기기 간 동일)
function mergeServerReviews(reviews) {
  if (!reviews) return;
  const r = {};
  reviews.forEach((sv) => {
    // due_at: "YYYY-MM-DD..." → 앞 10자리(로컬 비교 형식과 동일)
    const next = String(sv.due_at || "").slice(0, 10);
    r[sv.verse_no] = { level: Math.max(0, (sv.box || 1) - 1), next };
  });
  saveReviewData(r);
}

// ------------------------------------------------------------
// 사용자 식별 정보 (localStorage)
//   key: "memorize-user"
//   교구:    { type:"교구",   gu, mok,  name, cid }
//   교회학교: { type:"교회학교", bu, grade, name, cid }
// ------------------------------------------------------------
const USER_KEY = "memorize-user";
const PRIVACY_CONSENT_KEY = "privacy-consent";

function hasPrivacyConsent() {
  try {
    return localStorage.getItem(PRIVACY_CONSENT_KEY) === "1";
  } catch {
    return false;
  }
}

function savePrivacyConsent() {
  try {
    localStorage.setItem(PRIVACY_CONSENT_KEY, "1");
  } catch {
    /* 저장 실패 무시 */
  }
}

function loadUser() {
  try {
    const u = JSON.parse(localStorage.getItem(USER_KEY));
    return u && u.name ? u : null;
  } catch {
    return null;
  }
}

function saveUser(user) {
  if (!user.cid) {
    user.cid =
      (window.crypto && crypto.randomUUID && crypto.randomUUID()) ||
      "c" + Date.now().toString(36);
  }
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

function clearUser() {
  localStorage.removeItem(USER_KEY);
}

// 공용 기기에서 넘겨주기 전에 이 기기에 남은 "그 사람" 흔적을 모두 지운다.
// 화면 밝기·글씨 크기·듣기 속도 같은 기기 설정은 다음 사람에게도 그대로 쓸모가 있어 남긴다.
// 서버 기록은 건드리지 않으므로 같은 이름으로 다시 들어오면 진도가 그대로 복구된다.
function clearPersonalData() {
  // 상수들이 이 함수보다 아래에서 선언되므로 호출 시점에 목록을 만든다
  [
    USER_KEY, PRIVACY_CONSENT_KEY, PROGRESS_KEY, PROGRESS_KEY + "-en", SYNC_STATUS_KEY, REVIEW_KEY,
    HEART_KEY, PASSAGE_KEY, DAILY_MILESTONE_KEY, BLESS_KEY, EVENT_ENTERED_KEY,
    "board-seen", "album-checked",
  ].forEach((k) => { try { localStorage.removeItem(k); } catch {} });
  try { sessionStorage.clear(); } catch {}
}

// "사랑교구 3목장 김성도" / "초등부 김믿음"
function userLabel(u) {
  if (!u) return "";
  return u.type === "교구"
    ? `${u.gu}-${u.mok} ${u.name}`
    : `${u.bu} ${u.name}`;
}

// 아래 고정 단추의 글 — '무엇을 하는 단추인지'가 먼저다.
// 이름만 적혀 있으면 이름표처럼 읽혀 누르는 것인 줄 모르신다(어르신 실사용에서 확인).
// 동작을 크게 위에, 이름·횟수는 작게 아래에. 화면 낭독기는 aria-label로 이미 알려 주지만
// 눈으로 보는 분께는 그 말이 안 보였다.
function homeFabLabel(u, withTotal) {
  const act = `<span class="hf-act">🏠 첫 화면으로</span>`;
  if (!u) return act;
  const total = withTotal ? `<span id="nav-total" class="nav-total"></span>` : "";
  return act + `<span class="hf-sub">${userLabel(u)} 성도님${total}</span>`;
}

// 로그인 정보를 2줄로: { l1: 소속, l2: 이름 + "성도님" }
function userLines(u) {
  if (!u) return { l1: "", l2: "" };
  const l1 =
    u.type === "교구"
      ? `${u.gu} ${u.mok}목장`
      : `${u.bu}${u.grade ? " " + u.grade : ""}`;
  return { l1, l2: `${u.name} 성도님` };
}

// ------------------------------------------------------------
// 진행 상태 (localStorage) + 서버 백업
//   사용자(신원)별로 분리 저장한다. 키 = "memorize-progress::" + 신원식별자
//   신원식별자: 교구  → g|교구|목장|이름,  교회학교 → s|부서|학년|이름
//   → 로그인 정보를 바꾸면 다른 사람의 기록이 보이지 않는다.
// ------------------------------------------------------------
const PROGRESS_KEY = "memorize-progress";
const SYNC_STATUS_KEY = "memorize-sync-status";

// 현재 사용자 신원에 해당하는 진행 기록 저장 키
//   한글과 영어(NIV)는 서로 다른 암송이라 진도를 따로 센다 —
//   한글을 3단계까지 마쳤어도 영어로 처음 하면 1단계부터 시작한다.
//   영어는 키 뒤에 "-en"을 붙여 나눠 담는다(기존 한글 기록은 그대로).
function progressKey(lang) {
  const u = loadUser();
  const base = PROGRESS_KEY + (lang === "en" ? "-en" : "");
  if (!u) return base; // 사용자 없으면 기본 키(폴백)
  const id =
    u.type === "교구"
      ? `g|${u.gu}|${u.mok}|${u.name}`
      : `s|${u.bu}|${u.grade}|${u.name}`;
  return base + "::" + id;
}

// 그 구절을 지금 어느 언어로 암송하고 있는지 — 영어 본문이 없으면 늘 한글
function verseLang(no) {
  const v = (verses || []).find((x) => x.no === Number(no));
  return (v && typeof isEnMode === "function" && isEnMode(v)) ? "en" : "ko";
}

function syncStatusKey() {
  return SYNC_STATUS_KEY + "::" + progressKey();
}

function loadSyncStatus() {
  try {
    return JSON.parse(localStorage.getItem(syncStatusKey())) || { state: "idle" };
  } catch {
    return { state: "idle" };
  }
}

function saveSyncStatus(state, message) {
  const data = { state, message: message || "", at: new Date().toISOString() };
  try {
    localStorage.setItem(syncStatusKey(), JSON.stringify(data));
  } catch {
    /* 저장 실패 무시 */
  }
  updateSyncStatusView(data);
}

function syncTimeLabel(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function syncStatusMeta(status) {
  const s = status || loadSyncStatus();
  const at = syncTimeLabel(s.at);
  if (!POST_URL) return { cls: "local", title: "로컬 저장 중", detail: "서버 저장 주소가 없어 이 기기에만 기록됩니다." };
  if (s.state === "saving") return { cls: "saving", title: "서버 저장 중", detail: "방금 통과한 기록을 저장하고 있습니다." };
  if (s.state === "checking") return { cls: "saving", title: "서버 확인 중", detail: "다른 기기의 기록을 확인하고 있습니다." };
  if (s.state === "success") return { cls: "success", title: "동기화 완료", detail: `${at ? at + " · " : ""}${s.message || "서버에 기록되었습니다."}` };
  if (s.state === "error") return { cls: "error", title: "동기화 실패", detail: `${at ? at + " · " : ""}${s.message || "기록은 이 기기에 저장되어 있습니다."}` };
  return { cls: "idle", title: "동기화 대기", detail: "암송을 통과하면 서버에 자동 저장됩니다." };
}

function syncStatusHtml(compact = false) {
  const meta = syncStatusMeta();
  return `
    <div class="sync-status ${meta.cls} ${compact ? "compact" : ""}" id="sync-status">
      <div>
        <div class="sync-title">${meta.title}</div>
        <div class="sync-detail">${meta.detail}</div>
      </div>
      <button class="sync-retry" id="sync-retry" type="button">재확인</button>
    </div>`;
}

function updateSyncStatusView(status) {
  const el = document.getElementById("sync-status");
  if (!el) return;
  const meta = syncStatusMeta(status);
  el.className = `sync-status ${meta.cls}${el.classList.contains("compact") ? " compact" : ""}`;
  const title = el.querySelector(".sync-title");
  const detail = el.querySelector(".sync-detail");
  if (title) title.textContent = meta.title;
  if (detail) detail.textContent = meta.detail;
}

function setupSyncRetry(afterSync) {
  const btn = document.getElementById("sync-retry");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    const changed = await syncProgress();
    btn.disabled = false;
    if (typeof afterSync === "function") afterSync(changed);
  });
}

function loadProgress(lang) {
  try {
    return JSON.parse(localStorage.getItem(progressKey(lang))) || {};
  } catch {
    return {};
  }
}

function saveProgress(no, stage, mode = "typing", lang) {
  const L = lang || verseLang(no);
  const progress = loadProgress(L);
  const prev = progress[no]?.stage || 0;
  if (stage > prev) {
    // at: 통과한 날짜(말씀 앨범에 표시). 기존 기록엔 없을 수 있어 앨범에서 없으면 생략한다.
    progress[no] = { stage, passed: true, at: todayYmd() };
    try {
      localStorage.setItem(progressKey(L), JSON.stringify(progress));
    } catch {
      /* 저장 실패(시크릿 모드 등) 무시 */
    }
  }
  // 완료(3단계)한 구절은 복습 일정에 등록(복습은 언어를 가리지 않는다)
  if (stage === 3) ensureReviewScheduled(no);
  // 로컬 진행과 무관하게 통과 활동은 서버에 백업(집계용)
  postProgress(no, stage, mode, L);
}

function getPassedStage(no, lang) {
  return loadProgress(lang || verseLang(no))[no]?.stage || 0;
}

// 통과 단계를 Supabase(API 미들웨어)에 저장
function postProgress(no, stage, mode, lang) {
  const u = loadUser();
  if (!u || !u.user_id) return; // 첫 동기화 전이면 스킵(다음 로그인 때 서버 반영)
  bumpTodayCount(); // 오늘 N회 즉시 +1(서버 커밋 전에 실시간 반영)
  saveSyncStatus("saving", "통과 기록을 서버에 저장하고 있습니다.");
  api.saveProgress(u.user_id, no, stage, mode, lang || verseLang(no))
    .then((d) => {
      saveSyncStatus("success", "방금 통과한 기록이 서버에 저장되었습니다.");
      maybeShowDailyMilestone(d);
    })
    .catch(() => {
      unbumpTodayCount(); // 저장 실패 → 낙관적 +1 취소
      saveSyncStatus("error", "서버 저장에 실패했습니다. 기록은 이 기기에 저장되어 있습니다.");
    });
}

// ------------------------------------------------------------
// 모달 확인 — 엔터 하나로 넘어가게 한다.
//
// okBtn.focus()만으로는 모자랐다. 이 모달들은 암송·도전을 마친 직후에 뜨는데,
// 그 순간 화면이 모달 아래에서 다시 그려지며(다음 구절·반복해서 쓰기 등)
// 입력칸이 포커스를 도로 가져간다. 그러면 엔터가 단추까지 오지 않는다.
// 그래서 두 겹으로 둔다.
//   1) 열려 있는 동안 문서에서 엔터를 직접 받는다(캡처 단계 — 입력칸이 먼저 먹지 않게)
//   2) 포커스도 한 번 더 잡아 준다(80ms 뒤 — 뺏겼으면 되찾는다)
// Space·Esc도 같이 받는다. 모달이 떠 있는 동안은 그 키들이 할 일이 달리 없다.
function wireModalConfirm(okBtn, close) {
  const done = () => {
    document.removeEventListener("keydown", onKey, true);
    close();
  };
  const onKey = (e) => {
    if (e.key !== "Enter" && e.key !== " " && e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    done();
  };
  document.addEventListener("keydown", onKey, true);
  if (okBtn) {
    okBtn.addEventListener("click", done);
    const focus = () => { try { okBtn.focus({ preventScroll: true }); } catch (e) { okBtn.focus(); } };
    focus();
    setTimeout(focus, 80);
  }
  return done;   // 바깥을 눌러 닫을 때도 이걸 부른다(리스너까지 정리된다)
}

// 오늘의 완료 10회 단위 응원 — 일반 암송(3단계 완료)·말씀 도전·복습을 모두 합산.
// 서버가 KST 기준 누적 횟수를 계산하고, 클라이언트는 같은 단계의 중복 표시만 막는다.
// ------------------------------------------------------------
const DAILY_MILESTONE_KEY = "memorize-daily-milestone";
let dailyMilestoneMessages = {};

// app_config.milestoneMessages = [{ count:10, message:"..." }, ...]
// 설정을 읽지 못했거나 해당 단계가 비어 있으면 기존 기본 문구를 사용한다.
function loadDailyMilestoneMessages() {
  if (!window.api || !api.getConfig) return;
  api.getConfig("milestoneMessages").then((d) => {
    const list = d && d.value;
    if (!Array.isArray(list)) return;
    const next = {};
    list.forEach((item) => {
      const count = Number(item && item.count);
      const message = String((item && item.message) || "").trim();
      if (count > 0 && count % 10 === 0 && message) next[count] = message;
    });
    dailyMilestoneMessages = next;
  }).catch(() => {});
}

function dailyMilestoneStorageKey() {
  const u = loadUser();
  const p = kstDateParts() || {};
  const day = [p.y, String(p.m || "").padStart(2, "0"), String(p.d || "").padStart(2, "0")].join("-");
  return `${DAILY_MILESTONE_KEY}::${u && u.user_id ? u.user_id : "guest"}::${day}`;
}

function dailyMilestoneMessage(count) {
  const custom = dailyMilestoneMessages[count];
  if (custom) return custom.replace(/\{count\}/g, String(count));
  if (count >= 50) return `${count}번의 귀한 암송이 쌓였어요!\n말씀을 향한 열정이 참 아름답습니다. 👑`;
  if (count >= 30) return `오늘 ${count}회 달성!\n꾸준히 말씀을 붙드는 모습이 정말 멋져요. 🔥`;
  if (count >= 20) return `벌써 오늘 ${count}번이나 말씀과 함께했어요!\n귀한 걸음을 힘껏 응원합니다. 🙌`;
  return `오늘 말씀 활동 ${count}회를 달성했어요!\n한 번 한 번의 수고가 귀한 열매가 됩니다. 🌱`;
}

// 응원창을 닫으면 손이 다시 키보드로 가야 한다 — 아직 비어 있는 첫 빈칸에 커서를 둔다.
// 반드시 클릭 핸들러 안에서 '동기적으로' 불러야 한다. setTimeout으로 미루면 사용자 제스처가
// 끊겨 iOS에서 키보드가 올라오지 않는다.
function focusFirstBlank() {
  const inputs = Array.from(document.querySelectorAll(".word-input:not([disabled])"));
  if (!inputs.length) return;                       // 암송 화면이 아니면 할 일 없음
  const target = inputs.find((el) => !el.value.trim()) || inputs[0];
  try { target.focus({ preventScroll: true }); } catch (e) { target.focus(); }
}

function maybeShowDailyMilestone(data) {
  const count = Number(data && data.milestone);
  if (!count || count % 10 !== 0) return;
  const key = dailyMilestoneStorageKey();
  let shown = 0;
  try { shown = Number(localStorage.getItem(key) || 0); } catch {}
  if (shown >= count) return;
  try { localStorage.setItem(key, String(count)); } catch {}

  // '마음에 둠' 축하창과 겹치면 먼저 열린 창을 닫은 뒤 이어서 보여준다.
  const openWhenReady = () => {
    if (document.querySelector(".cheer-overlay")) {
      setTimeout(openWhenReady, 300);
      return;
    }
    const wrap = document.createElement("div");
    wrap.id = "daily-milestone";
    wrap.className = "cheer-overlay";
    wrap.innerHTML = `
      <div class="cheer-card" role="dialog" aria-modal="true" aria-labelledby="daily-milestone-title">
        <div class="cheer-icon">🎉</div>
        <div class="cheer-ref" id="daily-milestone-title">오늘 ${count}회 달성</div>
        <div class="cheer-msg">${boardEsc(dailyMilestoneMessage(count)).replace(/\n/g, "<br>")}</div>
        <button class="cheer-ok" id="daily-milestone-ok">계속 도전하기 💪</button>
      </div>`;
    document.body.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add("show"));
    const close = () => {
      focusFirstBlank();          // 제스처 안에서 즉시 — 닫자마자 이어서 칠 수 있다
      wrap.classList.remove("show");
      setTimeout(() => wrap.remove(), 250);
    };
    const okBtn = document.getElementById("daily-milestone-ok");
    const done = wireModalConfirm(okBtn, close);
    wrap.addEventListener("click", (e) => { if (e.target === wrap) done(); });
  };
  openWhenReady();
}

// ------------------------------------------------------------
// "이 말씀을 내 마음에 두었나이다" 체크 — 금배지 + 3단계 직행.
//   key: "memorize-hearted::<사용자>" → { "7": true, ... }
//   progress와 분리 저장: saveProgress가 progress[no]를 통째로 덮어써서
//   같이 두면 다음 통과 때 조용히 날아간다.
// ------------------------------------------------------------
const HEART_KEY = "memorize-hearted";

function heartKey() {
  const u = loadUser();
  if (!u) return HEART_KEY;
  const id = u.type === "교구" ? `g|${u.gu}|${u.mok}|${u.name}` : `s|${u.bu}|${u.grade}|${u.name}`;
  return HEART_KEY + "::" + id;
}
function loadHearted() {
  try { return JSON.parse(localStorage.getItem(heartKey())) || {}; } catch { return {}; }
}
function isHearted(no) {
  return !!loadHearted()[no];
}
// 체크/해제 → 로컬 즉시 반영 + 서버 저장(실패해도 로컬은 유지)
// "마음에 둠" 체크 시 감사·응원 메시지(랜덤). 암송의 수고를 격려한다.
// 기본값(폴백) — 관리자가 설정을 안 넣었거나 DB를 못 불러올 때 이걸 쓴다.
const HEART_MESSAGES_DEFAULT = [
  "말씀 한 구절을 마음에 새기셨네요 🌱\n그 수고를 주님이 기억하십니다.",
  "잘하셨어요! 오늘 새긴 말씀이\n삶의 길에 등불이 될 거예요 💛",
  "한 구절 한 구절, 성도님의 정성이\n마음의 밭에 씨앗으로 심겼어요 🌾",
  "수고 많으셨어요 🙌\n외운 말씀은 어디서도 빼앗기지 않는 보물이에요.",
  "마음에 새긴 이 말씀이\n힘든 날 성도님을 붙들어 줄 거예요 🤍",
  "귀한 걸음이에요 👑\n말씀을 사랑하는 그 마음, 참 아름답습니다.",
];
// 관리자 설정(app_config.heartMessages)을 1회 로드해 캐시. 실패·빈값이면 기본값 유지.
let heartMessages = HEART_MESSAGES_DEFAULT;
function loadHeartMessages() {
  if (!window.api || !api.getConfig) return;
  api.getConfig("heartMessages").then((d) => {
    const arr = d && d.value;
    if (Array.isArray(arr)) {
      const clean = arr.map((s) => String(s).trim()).filter(Boolean);
      if (clean.length) heartMessages = clean;
    }
  }).catch(() => {});
}

// 축하 모달 표시(체크 켤 때만). 확인 누르면 닫힘.
function showHeartCheer(verse) {
  const pool = heartMessages.length ? heartMessages : HEART_MESSAGES_DEFAULT;
  const msg = pool[Math.floor(Math.random() * pool.length)];
  const existing = document.getElementById("heart-cheer");
  if (existing) existing.remove();
  const wrap = document.createElement("div");
  wrap.id = "heart-cheer";
  wrap.className = "cheer-overlay";
  wrap.innerHTML = `
    <div class="cheer-card" role="dialog" aria-modal="true">
      <div class="cheer-icon">👑</div>
      <div class="cheer-ref">${boardEsc(verse.refShort || "")}</div>
      <div class="cheer-msg">${boardEsc(msg).replace(/\n/g, "<br>")}</div>
      <button class="cheer-ok" id="cheer-ok">아멘 🙏</button>
    </div>`;
  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add("show"));
  const close = () => { wrap.classList.remove("show"); setTimeout(() => wrap.remove(), 250); };
  const okBtn = document.getElementById("cheer-ok");
  const done = wireModalConfirm(okBtn, close);
  wrap.addEventListener("click", (e) => { if (e.target === wrap) done(); }); // 바깥 탭 닫기
}

function setHearted(no, on) {
  const h = loadHearted();
  if (on) h[no] = true; else delete h[no];
  try { localStorage.setItem(heartKey(), JSON.stringify(h)); } catch {}
  const u = loadUser();
  if (u && u.user_id && window.api && api.saveHeart) {
    api.saveHeart(u.user_id, no, on, verseLang(no)).catch(() => {});
  }
}
// 로그인 시 서버의 체크 목록으로 로컬을 교체(기기 간 동일)
function mergeServerHearted(list) {
  const h = {};
  (list || []).forEach((no) => { h[no] = true; });
  try { localStorage.setItem(heartKey(), JSON.stringify(h)); } catch {}
}

const STATUS_LABEL = {
  0: { cls: "status-none", text: "미시도" },
  1: { cls: "status-s1", text: "1단계 완료" },
  2: { cls: "status-s2", text: "2단계 완료" },
  3: { cls: "status-done", text: "완료" },
};

// ------------------------------------------------------------
// 복습 모드(간격 반복) — 주 단위. 완료(3단계)한 구절을 잊기 전에 다시 암송.
//   key: "memorize-review::<사용자>" → { "7": { level:2, next:"2026-07-15" }, ... }
//   간격(일): 3일 → 1주 → 2주 → 1개월 → 2개월 (복습할수록 길어짐)
// ------------------------------------------------------------
const REVIEW_KEY = "memorize-review";
const REVIEW_INTERVALS = [3, 7, 14, 30, 60];

function reviewKey() {
  const u = loadUser();
  if (!u) return REVIEW_KEY;
  const id = u.type === "교구" ? `g|${u.gu}|${u.mok}|${u.name}` : `s|${u.bu}|${u.grade}|${u.name}`;
  return REVIEW_KEY + "::" + id;
}
function loadReview() {
  try { return JSON.parse(localStorage.getItem(reviewKey())) || {}; } catch { return {}; }
}
function saveReviewData(r) {
  try { localStorage.setItem(reviewKey(), JSON.stringify(r)); } catch {}
}
function ymdLocal(d) {
  const z = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate());
}
function afterDaysStr(days) { const d = new Date(); d.setDate(d.getDate() + days); return ymdLocal(d); }

// 완료(3단계) 시 복습 일정 시작 (이미 있으면 유지)
function ensureReviewScheduled(no) {
  const r = loadReview();
  if (!r[no]) { r[no] = { level: 0, next: afterDaysStr(REVIEW_INTERVALS[0]) }; saveReviewData(r); }
}
// 오늘까지 복습 예정인 구절No 목록
function dueReviewNos() {
  const r = loadReview(); const t = ymdLocal(new Date());
  return Object.keys(r).filter((no) => r[no] && r[no].next <= t).map(Number);
}
// 복습 완료 → 다음(더 긴) 간격으로
function advanceReview(no) {
  const r = loadReview();
  const level = Math.min(((r[no] && r[no].level) || 0) + 1, REVIEW_INTERVALS.length - 1);
  r[no] = { level, next: afterDaysStr(REVIEW_INTERVALS[level]) };
  saveReviewData(r);
  const u = loadUser();
  if (u && u.user_id) api.advanceReview(u.user_id, no).catch(() => {});
}

// ------------------------------------------------------------
// 화면 0: 진입(식별) 화면 — 구분(교구/교회학교) 분기 입력
// ------------------------------------------------------------
// 목장 허용 형식: 숫자만(3, 99) 또는 "남성". 서버가 아닌 입력 폼에서만 검사한다
// — 서버에서 막으면 기존에 다른 표기로 가입한 분들이 로그인조차 못 하게 된다.
const MOK_RE = /^(\d+|남성)$/;

function renderEntryScreen() {
  const u = loadUser() || { type: "교구" };
  const appEl = document.getElementById("app");

  appEl.innerHTML = `
    <div class="entry-header">
      <h2 class="entry-main-title">성경말씀 암송하기</h2>
      <p class="entry-sub-title">내가 주의 말씀을 내 마음에 두었나이다</p>
    </div>
    <div class="entry-screen">
      <div class="entry-card">
        <div class="login-help-row">
          <button class="login-help-btn" id="login-help">❓ 로그인 방법</button>
        </div>
        <div class="entry-field inline">
          <div class="entry-label">구분</div>
          <div class="radio-row" id="type-row">
            ${["교구", "교회학교"].map((t) => `
              <label class="radio-chip">
                <input type="radio" name="type" value="${t}" ${u.type === t ? "checked" : ""}/>
                <span>${t}</span>
              </label>`).join("")}
          </div>
        </div>

        <!-- 교구 분기 -->
        <div id="gu-fields">
          <div class="entry-field">
            <div class="entry-label">교구</div>
            <div class="radio-row wrap">
              ${GU_LIST.map((g) => `
                <label class="radio-chip">
                  <input type="radio" name="gu" value="${g}" ${u.gu === g ? "checked" : ""}/>
                  <span>${g}</span>
                </label>`).join("")}
            </div>
          </div>
          <div class="entry-field inline">
            <div class="entry-label">목장</div>
            <input class="entry-input" id="mok" placeholder="숫자 또는 남성 (예: 3, 남성, 없으면 99)" value="${u.mok || ""}"/>
          </div>
        </div>

        <!-- 교회학교 분기 -->
        <div id="school-fields" hidden>
          <div class="entry-field">
            <div class="entry-label">부서</div>
            <div class="radio-row wrap">
              ${BU_LIST.map((b) => `
                <label class="radio-chip">
                  <input type="radio" name="bu" value="${b}" ${u.bu === b ? "checked" : ""}/>
                  <span>${b}</span>
                </label>`).join("")}
            </div>
          </div>
          <div class="entry-field inline">
            <div class="entry-label">학년</div>
            <input class="entry-input" id="grade" placeholder="예: 3학년" value="${u.grade || ""}"/>
          </div>
        </div>

        <div class="entry-field inline">
          <div class="entry-label">성명</div>
          <input class="entry-input" id="name" placeholder="이름" value="${u.name || ""}"/>
        </div>

        <div class="privacy-box">
          <div class="privacy-title">개인정보 수집·이용 안내</div>
          <p>
            성경말씀 암송 앱은 개인 암송 진도 저장과 교회 내 참여 통계를 위해
            이름, 소속, 암송 진행 기록, 복습 및 도전 참여 기록을 저장합니다.
            수집된 정보는 암송 프로그램 운영 목적으로만 사용되며,
            운영 종료 또는 삭제 요청 시 정리됩니다.
          </p>
          <button class="privacy-more" id="privacy-more" type="button">자세히 보기</button>
          <label class="privacy-consent">
            <input type="checkbox" id="privacy-consent" ${hasPrivacyConsent() ? "checked" : ""}/>
            <span>위 개인정보 수집·이용 안내를 확인하고 동의합니다.</span>
          </label>
        </div>

        <div class="entry-error" id="entry-error" hidden></div>
        <button class="entry-submit" id="entry-submit">시작하기</button>
      </div>
    </div>
  `;

  document.getElementById("login-help").addEventListener("click", () => renderLoginHelp(renderEntryScreen));
  document.getElementById("privacy-more").addEventListener("click", () => renderPrivacyInfo(renderEntryScreen));

  const guFields = document.getElementById("gu-fields");
  const schoolFields = document.getElementById("school-fields");

  function applyType() {
    const type = document.querySelector('input[name="type"]:checked').value;
    const isGu = type === "교구";
    guFields.hidden = !isGu;
    schoolFields.hidden = isGu;
  }
  document.querySelectorAll('input[name="type"]').forEach((r) =>
    r.addEventListener("change", applyType)
  );
  applyType();

  document.getElementById("entry-submit").addEventListener("click", () => {
    const type = document.querySelector('input[name="type"]:checked').value;
    const name = document.getElementById("name").value.trim();
    const errEl = document.getElementById("entry-error");
    const fail = (msg) => {
      errEl.textContent = msg;
      errEl.hidden = false;
    };

    if (!name) return fail("이름을 입력해 주세요.");
    if (!document.getElementById("privacy-consent").checked) {
      return fail("개인정보 수집·이용 안내에 동의해 주세요.");
    }

    let user;
    if (type === "교구") {
      const gu = document.querySelector('input[name="gu"]:checked')?.value;
      const mok = document.getElementById("mok").value.trim();
      if (!gu) return fail("교구를 선택해 주세요.");
      if (!mok) return fail("목장을 입력해 주세요.");
      // 목장은 숫자(3목장→3, 없으면→99) 또는 "남성"(남성목장)만 허용.
      // identity_key(g|교구|목장|이름)의 일부라 표기가 흔들리면 같은 사람이 다른 사람으로 갈린다.
      if (!MOK_RE.test(mok)) {
        return fail("목장은 숫자 또는 '남성'만 입력할 수 있어요. (예: 3목장 → 3, 남성목장 → 남성, 없으면 → 99)");
      }
      user = { type, gu, mok, name };
    } else {
      const bu = document.querySelector('input[name="bu"]:checked')?.value;
      const grade = document.getElementById("grade").value.trim();
      if (!bu) return fail("부서를 선택해 주세요.");
      if (!grade) return fail("학년을 입력해 주세요.");
      user = { type, bu, grade, name };
    }

    const prev = loadUser();
    if (prev && prev.cid) user.cid = prev.cid; // 기존 기기 식별자 유지
    savePrivacyConsent();
    saveUser(user);
    enterAfterLogin({ fresh: true }); // 첫 로그인이면 축복 인사 → 서버 동기화 후 요약 화면
  });
}

// ------------------------------------------------------------
// 화면 1: 본인 기록 요약 (로그인 직후)
// ------------------------------------------------------------
// ── 신기능 홍보(상단 카드 + NEW 배지) — 기기(localStorage)에만 저장 ──
const PROMO_KEY = "promo-newfeat"; // { dismissed, firstSeen }
function promoState() { try { return JSON.parse(localStorage.getItem(PROMO_KEY)) || {}; } catch { return {}; } }
function featSeen(k) { try { return localStorage.getItem("feat-seen-" + k) === "1"; } catch { return false; } }
function markFeatSeen(k) { try { localStorage.setItem("feat-seen-" + k, "1"); } catch {} }

// ── NEW 배지는 날짜로 내린다 (2026-09-02) ──────────────────────────
// ⚠️ 전에는 「눌러 본 적 있나」만 봤다. 그래서 **안 눌러 보신 분께는 영영 NEW**였고,
//    셋(내게 주시는 말씀·매일 묵상·내 안에 거하는 말씀)이 전부 2026-07-20~23 기능인데
//    여섯 주째 NEW를 달고 있었다. NEW가 셋이면 아무것도 새롭지 않다 —
//    어르신 눈에는 그냥 빨간 점 세 개다.
// 새 기능을 넣으면 **여기에 나온 날을 적는다.** 안 적으면 NEW가 아예 안 뜬다
//    (영원히 붙어 있느니 안 뜨는 편이 낫다).
const FEAT_SINCE = {
  prayer: "2026-09-03",
  meditation: "2026-07-20",   // 매일 묵상
  sermon: "2026-07-23",       // 내게 주시는 말씀
  passages: "2026-07-23",     // 내 안에 거하는 말씀
};
const FEAT_NEW_DAYS = 14;

function featIsNew(k) {
  if (featSeen(k)) return false;
  const since = FEAT_SINCE[k];
  if (!since) return false;
  const d = kstDayNumber() - kstDayNumber(since);
  return d !== null && d >= 0 && d <= FEAT_NEW_DAYS;
}
// 여럿이 겹치면 **가장 최근 것 하나만** 붙인다 — NEW가 둘이면 이미 NEW가 아니다.
function newestNewFeat() {
  let best = null;
  Object.keys(FEAT_SINCE).forEach((k) => {
    if (!featIsNew(k)) return;
    if (!best || kstDayNumber(FEAT_SINCE[k]) > kstDayNumber(FEAT_SINCE[best])) best = k;
  });
  return best;
}
function newBadge(k) { return k === newestNewFeat() ? `<span class="new-badge">NEW</span>` : ""; }
function scRemoveBadge(btnId) { const b = document.getElementById(btnId); const badge = b && b.querySelector(".new-badge"); if (badge) badge.remove(); }
// 게시판 버튼 배지 — 최근 7일 내(마지막으로 본 이후) 새 글/답글 개수.
// 게시판을 열면(board-seen 갱신) 사라지고, 그 뒤 새로 올라온 것만 다시 센다.
// 홈 재진입마다 부르지 않게 10분 캐시(sessionStorage).
async function fillBoardBadge() {
  const CK = "board-recent";
  const seen = (() => { try { return localStorage.getItem("board-seen") || ""; } catch { return ""; } })();
  let n = null;
  try {
    const c = JSON.parse(sessionStorage.getItem(CK) || "null");
    if (c && c.seen === seen && Date.now() - c.t < 10 * 60 * 1000) n = c.n;
  } catch {}
  if (n == null) {
    try {
      const d = await api.boardCheck(seen || undefined); n = (d && d.recent) || 0;
      sessionStorage.setItem(CK, JSON.stringify({ t: Date.now(), n, seen }));
    } catch { return; }
  }
  const btn = document.getElementById("open-board");
  if (btn && n > 0 && !btn.querySelector(".board-new")) btn.insertAdjacentHTML("beforeend", `<span class="board-new">새글 ${n}</span>`);
}
// 게시판을 봤다고 기록 — 배지 즉시 소멸(캐시도 0으로 갱신해 재조회 없이 반영)
function markBoardSeen() {
  try {
    const now = new Date().toISOString();
    localStorage.setItem("board-seen", now);
    sessionStorage.setItem("board-recent", JSON.stringify({ t: Date.now(), n: 0, seen: now }));
  } catch {}
}

// ── 커스텀 모달(시스템 alert/confirm 대체) — Promise<boolean> 반환 ──
function appModal({ title = "", msg = "", okText = "확인", cancelText = null, danger = false }) {
  return new Promise((resolve) => {
    const old = document.getElementById("app-modal"); if (old) old.remove();
    const wrap = document.createElement("div");
    wrap.id = "app-modal"; wrap.className = "am-overlay";
    wrap.innerHTML = `
      <div class="am-card" role="dialog" aria-modal="true">
        ${title ? `<div class="am-title">${title}</div>` : ""}
        <div class="am-msg">${msg}</div>
        <div class="am-btns">
          ${cancelText ? `<button class="am-btn am-cancel">${cancelText}</button>` : ""}
          <button class="am-btn am-ok${danger ? " danger" : ""}">${okText}</button>
        </div>
      </div>`;
    const close = (v) => { wrap.classList.remove("show"); setTimeout(() => wrap.remove(), 160); resolve(v); };
    wrap.addEventListener("click", (e) => { if (e.target === wrap && cancelText) close(false); }); // 바깥 탭=취소(confirm만)
    wrap.querySelector(".am-ok").addEventListener("click", () => close(true));
    const c = wrap.querySelector(".am-cancel"); if (c) c.addEventListener("click", () => close(false));
    document.body.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add("show"));
  });
}
const appAlert = (msg, title = "") => appModal({ title, msg });
const appConfirm = (msg, opts = {}) => appModal({ msg, cancelText: "취소", ...opts });
function promoCardHtml() {
  const st = promoState();
  if (st.dismissed) return "";
  const now = Date.now();
  if (!st.firstSeen) { try { localStorage.setItem(PROMO_KEY, JSON.stringify({ firstSeen: now })); } catch {} }
  else if (now - st.firstSeen > 14 * 864e5) return ""; // 2주 지나면 자동으로 안 뜸
  return `<div class="promo-card" id="promo-card">
      <button class="promo-x" id="promo-x" aria-label="닫기">✕</button>
      <div class="promo-title">✨ 새로워진 기능을 만나보세요</div>
      <div class="promo-btns">
        <button class="promo-btn sermon" id="promo-sermon">💬 내게 주시는 말씀</button>
        ${passagesVisible() ? `<button class="promo-btn passages" id="promo-passages">📜 내 안에 거하는 말씀</button>` : ""}
      </div>
    </div>`;
}

// ------------------------------------------------------------
// 말씀 이벤트 — 관리자가 app_config(key:event)로 회차를 연다.
//   { id, name, start:"YYYY-MM-DD", end:"YYYY-MM-DD", fromNo, toNo }
//   진행 중 상태는 저장하지 않는다(중도 이탈 시 처음부터). 응모 여부만 서버 기록.
// ------------------------------------------------------------
let eventConfig = null;                       // 로드된 이벤트 설정(없으면 null)
let _eventAdvanceTimer = null;                // 정답 후 다음 문제로 넘어가는 예약 타이머(나가기 시 취소)
// { "<eventId>|<user_id>": "2026-09-01T..." }
// 한 기기를 여러 성도가 함께 쓰는 경우(교회 공용 기기·가족 공용 폰)가 있어
// 반드시 사용자별로 구분해 저장한다. 회차 단위로만 저장하면 다른 성도가 로그인했을 때도
// 남의 '응모 완료'가 그대로 보인다.
const EVENT_ENTERED_KEY = "event-entered";

function eventEnteredMap() {
  try { return JSON.parse(localStorage.getItem(EVENT_ENTERED_KEY) || "{}") || {}; }
  catch (e) { return {}; }
}
// 현재 로그인한 성도 기준의 저장 키. 로그인 정보가 없으면 null.
function eventEnteredKey(eventId) {
  const u = loadUser();
  const uid = u && u.user_id;
  return (eventId && uid) ? `${eventId}|${uid}` : null;
}
function markEventEntered(eventId, at) {
  const key = eventEnteredKey(eventId);
  if (!key) return;
  try {
    const m = eventEnteredMap();
    m[key] = at || new Date().toISOString();
    localStorage.setItem(EVENT_ENTERED_KEY, JSON.stringify(m));
  } catch (e) {}
}
// 서버가 '응모 안 됨'이라고 답하면 로컬 캐시도 지운다(잘못 남은 완료 표시 자동 정정).
function clearEventEntered(eventId) {
  const key = eventEnteredKey(eventId);
  if (!key) return;
  try {
    const m = eventEnteredMap();
    if (!(key in m)) return;
    delete m[key];
    localStorage.setItem(EVENT_ENTERED_KEY, JSON.stringify(m));
  } catch (e) {}
}
function eventEntered() {
  if (!eventConfig) return false;
  const key = eventEnteredKey(eventConfig.id);
  return !!(key && eventEnteredMap()[key]);
}

// 오늘(KST)이 이벤트 기간 안인지 — 종료일 당일 포함.
function eventActive() {
  if (!eventConfig || !eventConfig.id) return false;
  const p = kstDateParts();
  if (!p) return false;
  const z = (n) => String(n).padStart(2, "0");
  const today = `${p.y}-${z(p.m)}-${z(p.d)}`;
  const start = String(eventConfig.start || "");
  const end = String(eventConfig.end || "");
  if (start && today < start) return false;
  if (end && today > end) return false;
  return true;
}

// 이벤트 대상 구절(fromNo~toNo). 설정이 이상하면 빈 배열.
function eventVerses() {
  if (!eventConfig) return [];
  const from = Number(eventConfig.fromNo), to = Number(eventConfig.toNo);
  if (!(from >= 1) || !(to >= from)) return [];
  return verses.filter((v) => Number(v.no) >= from && Number(v.no) <= to);
}

// ------------------------------------------------------------
// 말씀 이벤트 진행 화면 — 대상 구절을 매번 무작위 순서로, 구절당 빈칸 1개.
//   진행 상태는 저장하지 않는다(나가면 처음부터, 문제도 새로 뽑힘).
// ------------------------------------------------------------

// 공백 기준 토큰 중 2글자 이상인 것 하나를 무작위로 고른다.
// 2글자 이상이 하나도 없으면 가장 긴 토큰(조사 한 글자만 남는 어색함 방지).
function pickEventBlankIndex(tokens) {
  const candidates = [];
  tokens.forEach((t, i) => { if (Array.from(t).length >= 2) candidates.push(i); });
  if (candidates.length) return candidates[Math.floor(Math.random() * candidates.length)];
  let best = 0;
  tokens.forEach((t, i) => { if (Array.from(t).length > Array.from(tokens[best]).length) best = i; });
  return best;
}

function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 이번 회차에 실제로 출제할 문제 수 — 관리자가 정한 count(없거나 범위를 넘으면 전체).
function eventQuestionCount(pool) {
  const n = Number(eventConfig && eventConfig.count) || 0;
  return (n >= 1 && n < pool.length) ? n : pool.length;
}

function startEvent() {
  if (!eventActive()) { appAlert("지금은 진행 중인 이벤트가 없어요."); return renderSummary(); }
  const pool = eventVerses();
  if (!pool.length) { appAlert("이벤트 대상 구절이 아직 준비되지 않았어요."); return renderSummary(); }
  // 대상 구절을 섞은 뒤 정해진 문제 수만큼만 낸다(매번 다른 구절이 뽑힌다).
  const queue = shuffled(pool).slice(0, eventQuestionCount(pool));
  renderEventStep(queue, 0);
}

function renderEventStep(queue, idx) {
  stopSpeaking();
  clearTimeout(_eventAdvanceTimer);
  _eventAdvanceTimer = null;
  const verse = queue[idx];
  const appEl = document.getElementById("app");
  const tokens = String(verse.text || "").trim().split(/\s+/);
  const blankAt = pickEventBlankIndex(tokens);
  const answer = tokens[blankAt];

  const sentenceHtml = tokens.map((word, i) => {
    if (i !== blankAt) return `<span class="word-fixed">${word}</span>`;
    const w = Array.from(word).length + 1;
    return `<input class="word-input" id="ev-input" data-answer="${word}" autocomplete="off"
      autocapitalize="off" autocorrect="off" spellcheck="false" style="width:${w}em" />`;
  }).join(" ");

  appEl.innerHTML = `
    <div class="test-screen">
      <div class="test-card with-ref-banner event-step">
        <div class="test-ref-sticky">${verseRefFull(verse)}</div>
        <div class="test-top">
          <div class="test-head">
            <div class="test-stage event-badge">🎉 이벤트</div>
            <div class="ev-progress">${idx + 1} / ${queue.length}</div>
          </div>
          <button class="back-btn" id="ev-exit">← 나가기</button>
        </div>
        <div class="ev-verse-block"><div class="test-sentence">${sentenceHtml}</div></div>
        <div class="ev-hint" id="ev-hint"></div>
        <div class="ev-explain" id="ev-explain"></div>
      </div>
    </div>`;

  document.getElementById("ev-exit").addEventListener("click", () => {
    stopSpeaking();
    clearTimeout(_eventAdvanceTimer);
    _eventAdvanceTimer = null;
    renderSummary();
  });
  fillEventExplain(verse);
  setupEventInput(queue, idx, answer);
  initStickyRef();
  scrollPastBtnRow();
}

// 구절 아래 AI 풀이(설교 아카이브 easyExplain)를 펼친 채로 보여준다. 없으면 표시 안 함.
function fillEventExplain(verse) {
  loadSermons().then((sermons) => {
    const s = (sermons || []).find((x) => x.memVerseNo === verse.no && x.easyExplain);
    const el = document.getElementById("ev-explain");
    if (!el || !s) return;
    el.innerHTML = `<div class="ev-explain-label">💡 풀이</div><div class="ev-explain-body"></div>`;
    el.querySelector(".ev-explain-body").textContent = s.easyExplain;
  }).catch(() => {});
}

// 빈칸 채점 — 맞히면 다음 구절로, 마지막이면 응모 처리.
function setupEventInput(queue, idx, answer) {
  const input = document.getElementById("ev-input");
  const hint = document.getElementById("ev-hint");
  if (!input) return;
  let done = false;

  const evaluate = (isComposing) => {
    if (done || input.disabled) return;
    const val = input.value.trim();
    if (val === answer) {
      done = true;
      input.value = answer;
      input.classList.add("correct");
      input.classList.remove("wrong");
      input.disabled = true;
      if (hint) hint.textContent = "";
      _eventAdvanceTimer = setTimeout(() => {
        _eventAdvanceTimer = null;
        if (idx + 1 < queue.length) renderEventStep(queue, idx + 1);
        else finishEvent();
      }, 400);
    } else if (!isComposing && Array.from(val).length >= Array.from(answer).length) {
      input.classList.add("wrong");
      if (hint) hint.textContent = "다시 한 번 입력해 보세요";
      setTimeout(() => {
        if (done) return;
        input.value = "";
        input.classList.remove("wrong");
        input.focus();
      }, 400);
    }
  };

  let composing = false;
  input.addEventListener("compositionstart", () => { composing = true; });
  input.addEventListener("compositionend", () => { composing = false; evaluate(false); });
  input.addEventListener("input", (e) => evaluate(composing || e.isComposing));
  input.focus();
}

// 12개를 모두 맞힘 → 서버에 응모를 기록한 뒤 완료 화면.
// 서버 기록에 실패하면 markEventEntered를 호출하지 않고 '기록 실패' 화면(재시도 가능)을 띄운다 —
// 로컬에서만 응모 완료로 표시하면 실제로는 당첨자 명단에 오르지 못한 채 사용자만 안심하게 되므로.
function finishEvent() {
  const u = loadUser();
  const eventId = eventConfig ? eventConfig.id : "";
  if (u && u.user_id && eventId && window.api && api.eventEnter) {
    attemptEventEnter(eventId, u.user_id);
  } else {
    renderEventDone(false, eventId, u && u.user_id);
  }
}

// api.eventEnter 호출 → 성공 시에만 markEventEntered 후 정상 완료 화면, 실패 시 실패 화면.
function attemptEventEnter(eventId, userId) {
  return api.eventEnter(eventId, userId)
    .then((d) => { markEventEntered(eventId, d && d.entered_at); renderEventDone(true); })
    .catch(() => { renderEventDone(false, eventId, userId); });
}

// ------------------------------------------------------------
// 이벤트 현황(성도 공개) — 목표 대비 진행률 + 소속별 순위 + 참여자 명단(실명, 최신순).
//   서로의 참여를 보며 격려·경쟁하도록 만든 화면. 관리자 명단과 달리 비밀번호가 필요 없다.
// ------------------------------------------------------------
let ebRows = [];          // 참여자 전체(최신순)
let ebShown = 0;          // 명단에서 현재까지 보여준 수
const EB_PAGE = 50;       // '더 보기' 한 번에 늘어나는 수

function renderEventBoard() {
  stopSpeaking();
  if (!eventConfig || !eventConfig.id) { appAlert("진행 중인 이벤트가 없어요."); return renderSummary(); }
  document.getElementById("app").innerHTML = `
    <div class="summary-screen"><div class="summary-card">
      <div class="settings-head sc-head">
        <h2 class="rank-title">🏆 이벤트 현황</h2>
        <button class="settings-back-btn" id="eb-back">← 뒤로</button>
      </div>
      <div id="eb-body"><div class="sc-empty">불러오는 중…</div></div>
    </div></div>`;
  document.getElementById("eb-back").addEventListener("click", renderSummary);
  window.scrollTo(0, 0);
  loadEventBoard();
}

async function loadEventBoard() {
  const body = document.getElementById("eb-body");
  if (!body) return;
  let d = null;
  try { d = await api.eventBoard(eventConfig.id); }
  catch (e) { body.innerHTML = `<div class="sc-empty">현황을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</div>`; return; }
  if (!d || !d.ok) { body.innerHTML = `<div class="sc-empty">현황을 불러오지 못했어요.</div>`; return; }

  ebRows = d.list || [];
  ebShown = 0;
  const total = Number(d.total) || 0;
  const goal = Number(eventConfig.goal) || 0;
  const me = loadUser() || {};
  const mySosok = me.gu || me.bu || "";

  const pct = goal > 0 ? Math.min(100, Math.round((total / goal) * 100)) : 0;
  const progressHtml = goal > 0
    ? `<div class="eb-goal">
         <div class="eb-goal-top"><b>${total.toLocaleString()}명</b> 참여 <span class="eb-goal-sub">/ 목표 ${goal.toLocaleString()}명</span></div>
         <div class="eb-bar"><div class="eb-bar-fill" style="width:${pct}%"></div></div>
         <div class="eb-goal-pct">${pct}% 달성</div>
       </div>`
    : `<div class="eb-goal"><div class="eb-goal-top"><b>${total.toLocaleString()}명</b> 참여</div></div>`;

  const groups = d.groups || [];
  const groupHtml = groups.length
    ? `<div class="eb-sec-title">📊 소속별 참여</div>
       <div class="eb-groups">${groups.map((g) => `
         <div class="eb-group${g.sosok === mySosok ? " mine" : ""}">
           <span class="eb-g-rank">${g.rank}</span>
           <span class="eb-g-name">${boardEsc(g.sosok)}${g.sosok === mySosok ? ' <span class="eb-mine-tag">우리</span>' : ""}</span>
           <span class="eb-g-count">${g.count}명</span>
         </div>`).join("")}</div>`
    : "";

  body.innerHTML = `
    ${progressHtml}
    ${groupHtml}
    <div class="eb-sec-title">🙌 참여하신 분들</div>
    <div class="eb-list" id="eb-list"></div>
    <div id="eb-more-wrap"></div>`;
  ebRenderMore();
}

// 명단을 EB_PAGE개씩 이어붙인다(1,200명까지 한 번에 그리면 무거워진다).
function ebRenderMore() {
  const listEl = document.getElementById("eb-list");
  const moreWrap = document.getElementById("eb-more-wrap");
  if (!listEl || !moreWrap) return;
  if (!ebRows.length) {
    listEl.innerHTML = `<div class="sc-empty">아직 참여하신 분이 없어요.<br>첫 번째 주인공이 되어 주세요 🙌</div>`;
    moreWrap.innerHTML = "";
    return;
  }
  const next = ebRows.slice(ebShown, ebShown + EB_PAGE);
  listEl.insertAdjacentHTML("beforeend", next.map((r) => `
    <div class="eb-row">
      <span class="eb-name">${boardEsc(r.name)}</span>
      <span class="eb-affil">${boardEsc([r.sosok, r.sebu].filter(Boolean).join(" · "))}</span>
    </div>`).join(""));
  ebShown += next.length;
  moreWrap.innerHTML = ebShown < ebRows.length
    ? `<button class="summary-help" id="eb-more">더 보기 (${ebRows.length - ebShown}명 남음)</button>`
    : "";
  const btn = document.getElementById("eb-more");
  if (btn) btn.addEventListener("click", ebRenderMore);
}

// 응모 완료 화면. ok=true면 정상 완료, false면 정답은 맞혔지만 서버 기록에 실패했다는
// 안내와 '다시 시도' 버튼을 보여준다(재시도 성공 시 정상 완료 화면으로 전환).
function renderEventDone(ok, eventId, userId) {
  const u = loadUser() || {};
  const name = u.name || "";
  const eventName = (eventConfig && eventConfig.name) || "말씀 이벤트";
  const appEl = document.getElementById("app");
  const bodyHtml = ok ? `
        <div class="cd-emoji">🎉</div>
        <div class="cd-title">이벤트 응모가<br>완료되었습니다</div>
        <div class="cd-sub">${eventName}${name ? ` · ${name} 성도님` : ""}</div>
        <div class="ev-done-msg">말씀을 마음에 새기신 것을 축하드립니다.<br>당첨자 발표는 교회 안내를 확인해 주세요.</div>
        <button class="summary-go challenge-cta" id="ev-go-challenge">🔥 말씀 도전으로 이어가기</button>` : `
        <div class="cd-emoji">🙏</div>
        <div class="cd-title">정답은 모두<br>맞히셨어요</div>
        <div class="cd-sub">${eventName}${name ? ` · ${name} 성도님` : ""}</div>
        <div class="ev-done-msg">다만 응모 기록이 서버에 저장되지 못했어요.<br>인터넷 연결을 확인하신 뒤 다시 시도해 주시면 바로 저장돼요.</div>
        <button class="summary-go challenge-cta" id="ev-retry">다시 시도</button>
        <button class="summary-help" id="ev-go-challenge">🔥 말씀 도전으로 이어가기</button>`;
  appEl.innerHTML = `
    <div class="summary-screen">
      <div class="summary-card cd-card">
        ${bodyHtml}
        <button class="summary-help event-board-cta" id="ev-board">🏆 이벤트 현황 보기</button>
        <button class="summary-change" id="ev-go-home">기록 화면으로</button>
      </div>
    </div>`;
  if (!ok) {
    const retryBtn = document.getElementById("ev-retry");
    retryBtn.addEventListener("click", () => {
      if (!eventId || !userId || !window.api || !api.eventEnter) {
        appAlert("지금은 다시 시도할 수 없어요. 잠시 후 다시 열어 주세요.");
        return;
      }
      retryBtn.disabled = true;
      retryBtn.textContent = "저장하는 중...";
      // attemptEventEnter는 성공/실패 어느 쪽이든 renderEventDone을 다시 호출해 화면을 새로 그리므로
      // (실패 시 이 버튼도 새로 만들어짐) 여기서 별도 복구 처리는 필요 없다.
      attemptEventEnter(eventId, userId);
    });
  }
  document.getElementById("ev-go-challenge").addEventListener("click", startChallenge);
  { const b = document.getElementById("ev-board"); if (b) b.addEventListener("click", renderEventBoard); }
  document.getElementById("ev-go-home").addEventListener("click", renderSummary);
}

// 설정과 응모 여부를 불러온 뒤 첫 화면 버튼을 갱신한다(요약 화면이 떠 있을 때만).
async function loadEventState() {
  if (!window.api || !api.getConfig) return;
  try {
    const d = await api.getConfig("event");
    const v = d && d.value;
    eventConfig = v && v.id ? v : null;
  } catch (e) { eventConfig = null; }
  if (!eventActive()) { renderEventButton(); return; }

  const u = loadUser();
  if (u && u.user_id && api.eventStatus) {
    try {
      const s = await api.eventStatus(eventConfig.id, u.user_id);
      if (s && s.entered) markEventEntered(eventConfig.id, s.entered_at);
      else if (s && s.ok) clearEventEntered(eventConfig.id);   // 서버 기준으로 로컬 표시 정정
    } catch (e) {}
  }
  renderEventButton();
}

// 첫 화면의 이벤트 카드를 그린다. 기간 밖이면 두 자리 모두 비워 둔다.
// 종료일까지 남은 일수(KST). 오늘이 종료일이면 0.
function eventDaysLeft() {
  if (!eventConfig || !eventConfig.end) return null;
  const p = kstDateParts(); if (!p) return null;
  const end = String(eventConfig.end).split("-").map(Number);
  if (end.length !== 3 || end.some(isNaN)) return null;
  const a = Date.UTC(p.y, p.m - 1, p.d), b = Date.UTC(end[0], end[1] - 1, end[2]);
  return Math.round((b - a) / 86400000);
}

function renderEventButton() {
  // 참여 전에는 맨 위(#event-slot)에서 눈에 띄게, 응모를 마치면 맨 아래
  // (#event-slot-bottom)로 내려 자리를 비운다.
  const topSlot = document.getElementById("event-slot");
  const botSlot = document.getElementById("event-slot-bottom");
  if (topSlot) topSlot.innerHTML = "";
  if (botSlot) botSlot.innerHTML = "";
  const pool = eventVerses();
  if (!eventActive() || !pool.length) return;
  const done = eventEntered();
  const slot = (done ? botSlot : topSlot) || topSlot || botSlot;
  if (!slot) return;
  const name = (eventConfig && eventConfig.name) || "말씀 이벤트";
  const left = eventDaysLeft();
  const endTxt = eventConfig && eventConfig.end
    ? String(eventConfig.end).slice(5).replace("-", "월 ") + "일까지" : "";
  const dday = left === null ? "" : (left > 0 ? `D-${left}` : "오늘 마감");

  slot.innerHTML = `
    <div class="event-card${done ? " done" : ""}" id="event-card">
      <div class="event-card-head">
        <span class="event-card-title">🎉 ${boardEsc(name)}</span>
        ${dday ? `<span class="event-dday${left !== null && left <= 7 ? " urgent" : ""}">${dday}</span>` : ""}
      </div>
      <button class="event-join-btn${done ? " done" : ""}" id="open-event">${
        done ? "✅ 응모 완료 · 다시 풀기" : "지금 참여하기"}</button>
      <div class="event-card-foot">
        ${endTxt ? `<span class="event-end">🗓 ${endTxt}</span>` : "<span></span>"}
        <button class="event-board-link" id="open-event-board">🏆 현황 보기</button>
      </div>
    </div>`;
  fitEventTitle();
  document.getElementById("open-event").addEventListener("click", startEvent);
  document.getElementById("open-event-board").addEventListener("click", renderEventBoard);
}


// 회차 이름을 카드 폭에 맞춘다. CSS clamp는 화면 폭만 알고 이름 길이는 모르므로,
// 실제로 넘치는지 재서 넘칠 때만 글자를 줄인다(말줄임은 최후 수단).
// 웹폰트가 늦게 오면 폭이 달라지므로 폰트 로드 후 한 번 더 맞춘다.
function fitEventTitle() {
  const el = document.querySelector(".event-card-title");
  if (!el) return;
  const fit = () => {
    el.style.fontSize = "";                     // 매번 CSS 기본값에서 다시 계산
    let px = parseFloat(getComputedStyle(el).fontSize) || 16;
    for (let i = 0; i < 24 && el.scrollWidth > el.clientWidth && px > 11; i++) {
      px -= 0.5;
      el.style.fontSize = px + "px";
    }
  };
  fit();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit).catch(() => {});
}

// 첫 화면 정리(2026-09-02) — 「🔗 이번주 말씀 함께 나누기」를 숨긴다.
// 지우지 않고 스위치만 내렸다: 되살리려면 true 로. shareWeeklyVerse() 는 그대로 있다.
const WEEKLY_SHARE = false;

function renderSummary() {
  relearnBackToChallenge = false;   // 홈으로 나갔으면 도전 복귀도 없다
  stopSpeaking(); // 화면 전환 시 읽어주기 정지
  const u = loadUser();
  if (!u) return renderEntryScreen();

  const total = verses.length;
  const counts = { 0: 0, 1: 0, 2: 0, 3: 0 };
  verses.forEach((v) => {
    counts[getPassedStage(v.no)]++;
  });
  const done = counts[3];
  // 통계 4칸은 서로 겹치지 않게 나눈다(합 = 전체 구절 수).
  //   마음에 둠 → 완료 → 진행중 → 미시도 의 성장 사다리.
  //   '마음에 둠'은 3단계를 통과해야 체크할 수 있어 done의 부분집합이므로
  //   '완료'에서 빼야 중복 계산이 안 된다.
  const heartMapS = loadHearted();
  const heartCount = verses.filter((v) => heartMapS[v.no] && getPassedStage(v.no) === 3).length;
  const doneOnly = done - heartCount;      // 완료했지만 아직 체크 안 함
  const inProgress = counts[1] + counts[2]; // 1·2단계
  // 이미 완료(3단계)한 구절을 복습 일정에 등록(과거 완료분도 포함, 중복 없음)
  verses.forEach((v) => { if (getPassedStage(v.no) === 3) ensureReviewScheduled(v.no); });
  const dueCount = dueReviewNos().length; // 오늘 복습할 구절 수

  // ── 오늘 할 일 하나 (2026-09-02) ────────────────────────────────
  // ⚠️ 전에는 「암송하기」와 「말씀 도전」이 늘 나란히 있었다. 그러면 무엇을 먼저 할지
  //    **성도님이 매번 고르셔야 한다.** 첫 화면에 누를 것이 24개나 되는 마당에
  //    그 판단까지 떠넘기면 「오늘 뭘 하면 되나요」에 답이 없다.
  //    상태를 보고 하나만 크게 내놓고, 나머지는 그 아래 작게 둔다.
  // 순서: 복습(잊기 전이 먼저) → 안 외운 게 남았으면 암송 → 다 외웠으면 도전.
  const notDone = counts[0] + counts[1] + counts[2];   // 아직 3단계를 못 마친 구절
  const TODO = dueCount > 0
    ? { id: "go-review", cls: "review-cta", ic: "🔁",
        tx: `오늘 복습 ${dueCount}구절`, sub: "잊기 전에 다시 한 번" }
    : notDone > 0
    ? { id: "go-list", cls: "", ic: "📖",
        tx: "말씀 암송하기", sub: `아직 ${notDone}구절 남았어요` }
    : { id: "go-challenge", cls: "challenge-cta", ic: "🔥",
        tx: "말씀 도전", sub: `외운 ${done}구절로 도전해 보세요` };
  // 큰 단추로 올라간 것은 아래에서 뺀다 — 같은 것이 두 번 있으면 고르는 짐이 그대로다.
  const SUB = [];
  if (TODO.id !== "go-review" && dueCount > 0)
    SUB.push({ id: "go-review", cls: "review-cta", ic: "🔁", tx: `복습 ${dueCount}구절` });
  if (TODO.id !== "go-list") SUB.push({ id: "go-list", cls: "", ic: "📖", tx: "암송하기" });
  if (TODO.id !== "go-challenge")
    SUB.push({ id: "go-challenge", cls: "challenge-cta", ic: "🔥", tx: "말씀 도전" });

  const pct = total ? Math.round((done / total) * 100) : 0;
  // 진행 막대 문구 — 「35구절 중 35구절 마침」은 「구절」이 두 번 나와 겹쳐 읽혔고,
  // 다 마치신 분께는 같은 숫자가 두 번 나와 더 이상했다(2026-09-02).
  // 단위는 한 번만 쓰고, 세 처지에 각각 다른 말을 한다 —
  // 아직 시작 전 / 가는 중 / 다 마침. 다 마치신 분께는 세는 대신 축하한다.
  const sbLine = done >= total && total > 0
    ? `<b>${total}</b>구절 모두 마쳤어요 🎉`
    : done === 0
    ? `전체 <b>${total}</b>구절 · 이제 시작이에요`
    : `<b>${done}</b>구절 마쳤어요 <span class="sb-of">/ 전체 ${total}</span>`;
  const weeklyInfo = getWeeklyVerseInfo();
  const weeklyVerse = weeklyInfo && weeklyInfo.verse;
  const weeklyStage = weeklyVerse ? getPassedStage(weeklyVerse.no) : 0;
  const weeklyStatus = weeklyVerse ? STATUS_LABEL[weeklyStage] : null;
  const weeklyActionText = weeklyStage >= 3 ? "복습하기" : "암송하기";
  const weeklyHeart = weeklyVerse ? isHearted(weeklyVerse.no) : false;
  const weeklyHtml = weeklyVerse ? `
    <div class="weekly-card${weeklyHeart ? " hearted" : ""}">
      <div class="weekly-topline">
        <div class="weekly-kicks">
          <div class="weekly-kicker">${weeklyInfo.label}</div>
          ${weeklyHeart ? `<div class="heart-ribbon">👑 마음에 둠</div>` : ""}
        </div>
        ${weeklyHeart ? "" : `<div class="weekly-state ${weeklyStatus.cls}">${weeklyStatus.text}</div>`}
      </div>
      <div class="weekly-title">${weeklyVerse.sermonTitle || weeklyVerse.refFull || ""}</div>
      <div class="weekly-text">${weeklyVerse.text} <span class="weekly-inref">(${weeklyVerse.refShort})</span></div>
      <div class="weekly-actions ${weeklyVerse.url ? "" : "single"}">
        <button class="weekly-primary" id="weekly-start">${weeklyActionText}</button>
        ${weeklyVerse.url ? `<a class="weekly-secondary" id="weekly-sermon" href="${weeklyVerse.url}" target="_blank" rel="noopener">설교보기</a>` : ""}
        <span id="weekly-summary-slot"></span>
      </div>
      ${WEEKLY_SHARE ? `<button class="weekly-share" id="weekly-share">🔗 이번주 말씀 함께 나누기</button>` : ""}
    </div>` : "";

  const appEl = document.getElementById("app");
  appEl.innerHTML = `
<div class="summary-screen">
  <div class="summary-card">
    <div class="summary-headrow">
      <div class="summary-hello"><span class="summary-affil">${u.type === "교구" ? `${u.gu}-${u.mok}` : `${u.bu}${u.grade ? " " + u.grade : ""}`}</span> <span class="summary-user">${u.name}</span> <span class="summary-honor">성도님</span><br>주님의 이름으로 환영합니다 🙌</div>
    </div>
    <!-- 「읽는 것」 둘을 위에 나란히 모은다 (2026-09-02).
         전에는 이 둘 사이에 이벤트 카드(#event-slot)가 끼어 묶음이 갈라졌다 —
         정보 · 카드 · 정보 순서라 무엇이 한 덩이인지 읽히지 않았다.
         이제 정보 둘 → 이벤트 카드 → 오늘 할 일 순이다. -->
    <div class="user-info" id="user-info">
      <div class="today-strip" id="today-strip"><span class="today-txt">오늘의 말씀 활동을 불러오는 중…</span></div>
      <div class="ui-div"></div>
      <!-- 진행 막대 — 다 마치신 분일수록 네 칸이 「암송 0 · 진행중 0 · 미시도 0」이
           되어 아무것도 안 한 것처럼 보였다(마음에 둠은 완료의 부분집합이라 완료에서
           빼기 때문). 한 줄로만 말한다. -->
      <div class="stat-bar">
        <span class="sb-line">${sbLine}</span>
        <span class="sb-pct">${pct}%</span>
        <span class="sb-track"><i style="width:${pct}%"></i></span>
      </div>
    </div>
    <!-- 이벤트는 「오늘 할 일」 바로 위 — 누르는 것들 바로 앞자리다 -->
    <div id="event-slot"></div>
    <!-- 홈 화면 정리: 알림 켜기 배너·신기능 홍보 카드 숨김(코드는 유지, 필요 시 되살리면 됨) -->
    <div id="push-nudge" hidden></div>
    <button class="todo-go ${TODO.cls}" id="${TODO.id}">
      <span class="todo-ic">${TODO.ic}</span>
      <span class="todo-body"><span class="todo-tx">${TODO.tx}</span><span class="todo-sub">${TODO.sub}</span></span>
    </button>
    <div class="summary-actions sub-actions${SUB.length === 1 ? " one" : ""}">
      ${SUB.map((s) => `<button class="summary-go act-btn ${s.cls}" id="${s.id}"><span class="act-ic">${s.ic}</span><span class="act-tx">${s.tx}</span></button>`).join("")}
    </div>
    ${weeklyHtml}
    <!-- 이 두 칸은 **목사님 설교에서 나온 것**이다 (2026-09-02).
         전에는 「내 안에 거하는 말씀」이 여기 셋째로 있었는데 성격이 달랐다 —
         그건 긴 본문을 마디로 나눠 **외우는** 기능(진도·완료·마음에 둠·듣기)이라
         「말씀 목록」과 구조가 같고, 설교에서 나온 이 둘과는 계보가 다르다.
         셋이 한 줄에 있으면 「같은 종류」라는 뜻이 되어 버린다 → 아래 목록으로 옮겼다.
         ⚠️ 여기에 셋째를 더할 때는 **설교에서 나온 것인지** 먼저 볼 것. -->
    <div class="summary-actions feat-actions">
      <button class="summary-go sermon-act act-btn" id="open-sermon-chat"><span class="act-ic">💬</span><span class="act-tx">내게 주시는<br>말씀</span>${newBadge("sermon")}</button>
      <button class="summary-go med-act act-btn" id="open-meditation"><span class="act-ic">🌿</span><span class="act-tx">매일<br>묵상</span>${newBadge("meditation")}</button>
    </div>
    <!-- 성격별로 묶는다 (2026-09-02) — 전에는 일곱 줄이 같은 모양·다른 색으로 나열돼
         무엇이 무엇인지 색으로도 자리로도 알 수 없었다.
         ⚠️ 단추마다 있던 제 색(보라·초록·청록·금…)을 뗐다. 색은 「누구인가」가 아니라
            「무엇인가」를 말해야 한다 — 아래 CSS의 네 단계만 남긴다. -->
    <div class="grp-title">내 기록</div>
    <button class="summary-help" id="open-album">📖 나의 말씀 앨범</button>
    <button class="summary-help" id="open-ranking">🏆 도전 순위 보기</button>
    <div class="grp-title">함께</div>
    <button class="summary-help" id="open-board">💬 응원·기도·공감</button>
    <button class="summary-help" id="open-prayer">🙏 가정 축복 기도문${newBadge("prayer")}</button>
    <button class="summary-help" id="open-quiz">🎯 성경암송 퀴즈</button>
    <button class="summary-help" id="open-pilsa">✍️ 성경필사 노트 신청</button>
    ${passagesVisible() ? `<button class="summary-help" id="open-passages">📜 내 안에 거하는 말씀${newBadge("passages")}</button>` : ""}
    <!-- 아카이브 둘은 앱 밖(다른 사이트)으로 나간다. 그 사실이 보이게 ↗ 와 흰 바탕으로
         구분하고, 여기서 잘 안 누르는 것이라 접어 둔다(연 상태는 기억한다). -->
    <button class="grp-more" id="more-toggle" aria-expanded="false" aria-controls="more-box">더 보기 <span class="gm-caret">▾</span></button>
    <div id="more-box" hidden>
      <button class="summary-help ext-cta" id="open-praise">🎵 고척교회 찬양 아카이브 <span class="ext-mark">↗</span></button>
      <button class="summary-help ext-cta" id="open-sermon-archive">📺 고척교회 설교 아카이브 <span class="ext-mark">↗</span></button>
    </div>
    <div id="event-slot-bottom"></div>
    <div class="summary-icons summary-icons-bottom">
      <div class="icon-cap"><button class="summary-icon icon-alarm" id="open-alarm" aria-label="매일 암송 알림 받기" title="매일 암송 알림 받기">🔔</button><span class="icon-cap-label">알림</span></div>
      <div class="icon-cap"><button class="summary-icon" id="toggle-ref-first" aria-label="도전에 구절 먼저 쓰기 전환" title="도전에 구절 먼저 쓰기 전환">📕</button><span class="icon-cap-label" id="toggle-ref-first-label">구절</span></div>
      <div class="icon-cap"><button class="summary-icon" id="toggle-card-input" aria-label="암송 입력 방법 전환" title="암송 입력 방법 전환">⌨️</button><span class="icon-cap-label" id="toggle-card-input-label">쓰기</span></div>
      <div class="icon-cap"><button class="summary-icon" id="open-help-summary" aria-label="도움말" title="도움말">❓</button><span class="icon-cap-label">도움말</span></div>
      <div class="icon-cap"><button class="summary-icon" id="open-settings" aria-label="설정" title="설정">⚙️</button><span class="icon-cap-label">설정</span></div>
    </div>
  </div>
</div>
`;

  document.getElementById("go-list").addEventListener("click", renderVerseList);
  setupMoreToggle();   // 「더 보기」 — 앱 밖 아카이브 둘
  loadTodayCount(u); // 첫 화면 '오늘 N회' 띠 채우기
  renderEventButton();  // 이미 로드된 설정이 있으면 즉시 표시
  loadEventState();     // 서버에서 설정·응모여부 갱신 후 다시 표시
  document.getElementById("open-board").addEventListener("click", renderBoard);
  document.getElementById("open-prayer").addEventListener("click", () => renderPrayerBook());
  document.getElementById("open-pilsa").addEventListener("click", () => {
    pilsaLoaded = false;          // 들어올 때마다 서버에서 지금 상태를 받는다
    renderPilsaApply();
  });
  // 형제 앱(찬양·말씀 아카이브)으로 이동 — 새 탭이라 암송 진행 상태를 잃지 않는다
  document.getElementById("open-praise").addEventListener("click", () => window.open("https://worship.onlybible.kr/", "_blank", "noopener"));
  document.getElementById("open-sermon-archive").addEventListener("click", () => window.open("https://sermon.onlybible.kr/", "_blank", "noopener"));
  fillBoardBadge(); // 최근 1주 새 글/답글 있으면 게시판 버튼에 배지
  if (weeklyVerse) document.getElementById("weekly-start").addEventListener("click", () => startTest(weeklyVerse));
  { const b = document.getElementById("weekly-share");   // WEEKLY_SHARE 가 false 면 없다
    if (b && weeklyVerse) b.addEventListener("click", () => shareWeeklyVerse(weeklyVerse)); }
  fillWeeklySummaryBtn(weeklyVerse); // 요약이 있으면 '설교보기' 옆에 요약보기 버튼 추가
  if (dueCount > 0) document.getElementById("go-review").addEventListener("click", startReview);
  document.getElementById("go-challenge").addEventListener("click", startChallenge);
  document.getElementById("open-meditation").addEventListener("click", () => { markFeatSeen("meditation"); scRemoveBadge("open-meditation"); maybeShowWeeklyMeditation(true, true); });
  document.getElementById("open-sermon-chat").addEventListener("click", () => { markFeatSeen("sermon"); renderSermonChat(); });
  document.getElementById("open-album").addEventListener("click", () => renderAlbum());
  { const b = document.getElementById("open-passages"); if (b) b.addEventListener("click", () => { markFeatSeen("passages"); renderPassageList(); }); }
  document.getElementById("open-ranking").addEventListener("click", () => renderRanking());
  // 퀴즈는 quiz/ 아래 따로 있는 화면이다(로그인 없이 열리고 app.js를 쓰지 않는다).
  //   같은 주소 안이라 설치된 앱에서 눌러도 앱 밖으로 나가지 않는다.
  document.getElementById("open-quiz").addEventListener("click", () => { location.href = "quiz/"; });
  document.getElementById("open-help-summary").addEventListener("click", () => renderManual(renderSummary, -1));
  document.getElementById("open-settings").addEventListener("click", renderSettings);
  document.getElementById("open-alarm").addEventListener("click", alarmFromHome);
  // 📲 바로가기 자리를 대신한 암송 입력 방법(쓰기/카드) 전환 — 설정 화면의
  // cardstart-row와 같은 상태(CARD_START_KEY)를 쓴다. 눌러야 데이터가 나가는
  // 것도 아니고 화면 전환도 없어 아이콘 한 칸으로 충분하다.
  setupCardToggleIcon();
  // "공유" 아이콘 자리를 대신한 "도전에 구절 먼저 쓰기" 전환 — 공유 자체는 없어진 게
  // 아니라 설정 화면(share-btn)에 그대로 있다(2026-08-31 사용자 결정).
  setupRefFirstToggle();
  // 아직 알림을 안 켠 사람: 종 아이콘만 강조한다.
  // (상단 '알림 켜기' 배너는 홈 화면 정리로 숨김 — showPushNudge 코드는 유지)
  (async () => {
    try {
      const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
      const sub = reg && await reg.pushManager.getSubscription();
      const bell = document.getElementById("open-alarm");
      if (bell && !sub) bell.classList.add("pulse");
    } catch (e) {}
  })();
}

// 「더 보기」 — 앱 밖 아카이브 둘. 이건 연 상태를 기억한다.
// 자주 쓰시는 분이 매번 다시 펴야 하면 접어 둔 뜻이 없다.
const MORE_OPEN_KEY = "home-more-open";
function setupMoreToggle() {
  const btn = document.getElementById("more-toggle");
  const box = document.getElementById("more-box");
  if (!btn || !box) return;
  const apply = (open) => {
    box.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
    btn.classList.toggle("open", open);
  };
  let open = false;
  try { open = localStorage.getItem(MORE_OPEN_KEY) === "1"; } catch (e) {}
  apply(open);
  btn.addEventListener("click", () => {
    open = box.hidden;
    apply(open);
    try { localStorage.setItem(MORE_OPEN_KEY, open ? "1" : "0"); } catch (e) {}
  });
}

// ============================================================
// 가정 축복 기도문 (2026-09-03)
//   104편을 「오늘의 기도문 한 편 + 주제로 찾기」 한 화면에 담는다.
//   ⚠️ 쓰기·채점·진도가 없다 — 이건 「외우는 것」이 아니라 「읽고 축복하는 것」이다.
//      도전 순위에 섞으면 둘 다 흐려진다.
//   ⚠️ 104편을 목록으로 먼저 내놓지 않는다. 어르신께 104개 중 고르라는 것이
//      그 자체로 벽이다. 오늘 한 편이 먼저고, 주제는 그 아래에 둔다.
//   자료는 blessings.json — 83KB라 **화면에 들어올 때만** 받는다(글꼴 765KB 사건과 같은 이유).
// ============================================================
let prayCache = null;
let prayName = null;      // 누구 이름으로 읽을지(기본은 로그인한 분)
let prayIdx = null;       // 지금 보고 있는 편(0-based)
let prayOpenVerse = false; // 말씀을 펴 뒀나 — 이전/다음에도 이어진다
let prayGroup = null;      // 어느 주제 목록에서 들어왔나 — 돌아갈 길을 남긴다
let prayAutoPlay = false;  // 연속듣기 모드 — TTS 끝나면 다음 편으로 자동 이동
let prayRepeat  = false;  // 반복듣기 모드 — TTS 끝나면 같은 편 다시 재생
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

async function loadPrayers() {
  if (prayCache) return prayCache;
  // DB(blessings 표)에서 받는다. 표를 아직 안 만든 판에서는 파일로 물러선다 —
  // ⚠️ blessings.json 은 **폴백일 뿐** 진짜 자료가 아니다. 내용을 고칠 때는
  //    supabase/blessings.sql 을 다시 만들어 DB 를 고치고, 파일도 함께 갱신할 것.
  try {
    const d = await api.getBlessings();
    if (d && d.ok && Array.isArray(d.blessings) && d.blessings.length) {
      prayCache = d.blessings;
      return prayCache;
    }
  } catch (e) {}
  const r = await fetch("blessings.json?v=" + APP_BUILD);
  prayCache = await r.json();
  return prayCache;
}

// 이름에 따라 조사를 고른다 — 말씀 카드에 쓴 규칙과 같다.
// ⚠️ ㄹ 받침은 「으로」가 아니라 「로」다: 김윤월로(○) 김윤월으로(×).
function prayJong(name) {
  const bare = String(name).replace(/<[^>]*>/g, "");   // 태그를 뺀 진짜 이름의 끝 글자로 본다
  const c = bare.charCodeAt(bare.length - 1);
  return (c >= 0xac00 && c <= 0xd7a3) ? (c - 0xac00) % 28 : 0;
}
// 이름을 눈에 띄게 — 화면용. ⚠️ 이름은 성도님이 직접 치는 값이라 반드시 escape 한다.
//   낭독(TTS)에는 태그가 섞이면 안 되므로 prayFill(민글) 을 따로 쓴다.
function prayEsc(t) {
  return String(t == null ? "" : t)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
// 읽기 좋게 **문단으로만** 나눈다.
//   문장 중앙값이 63자, 최장 182자다 — 한 덩이로 두면 소리 내어 읽을 때 숨 쉴 자리가 없다.
//   ⚠️ 그렇다고 마디(쉼표·연결어미)까지 끊으면 안 된다. 폰마다 폭이 달라 **줄이 들쭉날쭉**해진다
//      — 글자 수로 끊은 자리와 브라우저가 접는 자리가 어긋나 짧은 토막이 생긴다(2026-09-03 되돌림).
//      나누는 것은 문장까지, 줄 접는 것은 브라우저에 맡긴다.
// 맺음말은 자료가 아니라 **늘 같은 한 줄**이라 여기서 붙인다(104편에 같은 문장을 넣지 않는다).
//   ⚠️ 문장을 가른 **뒤에** 붙인다 — 먼저 붙이면 안의 마침표에서 둘로 쪼개진다.
const PRAY_AMEN = "예수님의 이름으로 축복하며 기도합니다. 아멘!";
function prayChunks(t) {
  const out = String(t || "").replace(/([.!?])\s+/g, "$1").split("").filter(Boolean);
  out.push(PRAY_AMEN);
  return out;
}
function prayFillHtml(t, name) {
  return prayFill(prayEsc(t), '<b class="pr-nm">' + prayEsc(name) + "</b>");
}
function prayFill(t, name) {
  const j = prayJong(name);
  return String(t || "")
    .replace(/\{이름\}/g, name)
    .replace(/\{이\}/g,   j ? "이" : "가")
    .replace(/\{을\}/g,   j ? "을" : "를")
    .replace(/\{은\}/g,   j ? "은" : "는")
    .replace(/\{과\}/g,   j ? "과" : "와")
    .replace(/\{으로\}/g, (j === 0 || j === 8) ? "로" : "으로");
}
// 오늘 몇 번째 편인가 — 날짜로 돌린다(104편이면 석 달 반 동안 매일 다르다)
function prayToday(n) {
  const d = new Date(todayYmd() + "T00:00:00");
  return Math.floor(d.getTime() / 864e5) % n;
}

function renderPrayerBook(idx) {
  prayFullClose();          // 다른 화면에서 돌아올 때 덮개가 남아 있지 않게
  const u = loadUser();
  if (!prayName) prayName = (u && u.name) || "우리 가정";
  const app = document.getElementById("app");
  app.innerHTML = `<div class="pr-wrap"><div class="pr-loading">불러오는 중…</div></div>
    <button class="home-fab" id="pr-home" aria-label="첫 화면으로">${homeFabLabel(u, true)}</button>`;
  window.scrollTo(0, 0);
  document.getElementById("pr-home").addEventListener("click", () => { prayAutoPlay = false; stopSpeaking(); stopPrayBgMusic(); renderSummary(); });
  loadPrayers().then((list) => {
    if (idx == null) idx = prayToday(list.length);
    prayIdx = ((idx % list.length) + list.length) % list.length;
    drawPrayer(list, prayIdx);
  }).catch(() => {
    document.querySelector(".pr-loading").textContent = "기도문을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.";
  });
}

let prayLogged = null;   // 방금 기록한 편 — 이름 바꾸기 등으로 다시 그릴 때 두 번 세지 않게

function drawPrayer(list, i) {
  const b = list[i];
  // 누가 얼마나 보시는지 남긴다(서버가 하루·편 단위로 묶는다).
  // ⚠️ 실패해도 조용히 넘긴다 — 기록 때문에 기도문이 안 열리면 본말이 뒤집힌다.
  if (prayLogged !== b.no) {
    prayLogged = b.no;
    const u = loadUser();
    if (u && u.user_id) { try { api.blessingLog({ user_id: u.user_id, no: b.no }); } catch (e) {} }
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
        <label class="pr-opt-label"><input type="checkbox" id="pr-auto-chk"${prayAutoPlay ? " checked" : ""}> 연속듣기</label>
        <label class="pr-opt-label"><input type="checkbox" id="pr-repeat-chk"${prayRepeat ? " checked" : ""}> 반복듣기</label>
        <label class="pr-opt-label"><input type="checkbox" id="pr-bgm-chk"${prayBgAudio && !prayBgAudio.paused ? " checked" : ""}> 🎵배경음악</label>
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
            ${items.map((o) => `<button class="summary-help pr-item${o.xi === todayNo ? " on" : ""}" data-i="${o.xi}" data-g="${prayEsc(g.g)}">${prayEsc(o.x.title)}
               <span class="pr-item-ref">${o.xi === todayNo ? "오늘 · " : ""}${prayEsc(prayRefShort(o.x.ref))}</span></button>`).join("")}
          </div>
        </div>`;
      }).join("")}
    </div>`;
  // ⚠️ 이전/다음은 주제 안이 아니라 104편 전체를 돈다 — 그러면 「목록으로」가 거짓말이 되므로 내린다
  document.getElementById("pr-prev").addEventListener("click", () => { prayAutoPlay = false; prayRepeat = false; stopSpeaking(); prayGroup = null; drawPrayer(list, (i - 1 + list.length) % list.length); window.scrollTo(0,0); });
  document.getElementById("pr-next").addEventListener("click", () => { prayAutoPlay = false; prayRepeat = false; stopSpeaking(); prayGroup = null; drawPrayer(list, (i + 1) % list.length); window.scrollTo(0,0); });
  document.getElementById("pr-name").addEventListener("click", () => askPrayName(list, i));
  const toList = document.getElementById("pr-tolist");
  if (toList) toList.addEventListener("click", () => { stopSpeaking(); renderPrayerGroup(list, prayGroup); });
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
      stopSpeaking();
      const sp = document.getElementById("pr-speak");
      if (sp) sp.textContent = "🔊 들려주기";
      const chkA = document.getElementById("pr-auto-chk");
      const chkR = document.getElementById("pr-repeat-chk");
      if (chkA) chkA.checked = false;
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
      stopSpeaking();
      prayGroup = el.dataset.g;   // 「← <주제> 목록」이 여기로 돌아올 수 있게
      drawPrayer(list, Number(el.dataset.i));
      window.scrollTo(0, 0);
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
      if (!prayAutoPlay) { if (s) s.textContent = "🔊 들려주기"; return; }
      const nextIdx = (idx + 1) % list.length;
      if (nextIdx === 0) { prayAutoPlay = false; if (s) s.textContent = "🔊 들려주기"; return; }
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
      stopSpeaking();
      sp.textContent = "🔊 들려주기";
      return;
    }
    const chkAuto = document.getElementById("pr-auto-chk");
    const chkRep  = document.getElementById("pr-repeat-chk");
    prayAutoPlay = !!(chkAuto && chkAuto.checked);
    prayRepeat   = !!(chkRep  && chkRep.checked);
    sp.textContent = "⏹ 그만듣기";
    playFrom(i);
  });
  document.getElementById("pr-auto-chk").addEventListener("change", (e) => {
    prayAutoPlay = e.target.checked;
    if (e.target.checked) { prayRepeat = false; document.getElementById("pr-repeat-chk").checked = false; }
  });
  document.getElementById("pr-repeat-chk").addEventListener("change", (e) => {
    prayRepeat = e.target.checked;
    if (e.target.checked) { prayAutoPlay = false; document.getElementById("pr-auto-chk").checked = false; }
  });
  document.getElementById("pr-bgm-chk").addEventListener("change", (e) => {
    togglePrayBgMusic(e.target.checked);
  });
}

// 주제 아코디언 한 칸을 펴거나 접는다.
//   ⚠️ max-height 를 큰 고정값(2000px 등)으로 트랜지션하면 실제 내용 높이에 먼저
//      도달해 버려 "확 펼쳐졌다 뚝 멈추는" 느낌이 난다 — scrollHeight 를 실측해
//      정확한 값을 준다(닫을 때도 먼저 그 값이어야 0으로 되짚어 갈 수 있다).
function prAccSet(item, open) {
  const body = item.querySelector(".pr-acc-body");
  const head = item.querySelector(".pr-acc-head");
  item.classList.toggle("open", open);
  head.setAttribute("aria-expanded", String(open));
  body.style.maxHeight = open ? body.scrollHeight + "px" : "0px";
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
// ❖ — 말씀카드의 장식과 같은 모양. 글꼴에 있는 글자(U+2756)는 기기마다 없거나
//     이모지로 나와서 그림으로 그린다(말씀카드도 같은 이유로 SVG다).
const PRAY_ORN =
  '<svg class="pr-orn-d" viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor">' +
  '<path d="M12 1.6 14.7 6.6 12 11.6 9.3 6.6Z"/><path d="M12 12.4 14.7 17.4 12 22.4 9.3 17.4Z"/>' +
  '<path d="M1.6 12 6.6 9.3 11.6 12 6.6 14.7Z"/><path d="M12.4 12 17.4 9.3 22.4 12 17.4 14.7Z"/>' +
  "</g></svg>";

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
    frame.style.width = rot ? wrap.clientHeight + "px" : "";
    frame.style.height = rot ? wrap.clientWidth + "px" : "";
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

// 첫화면 상단 '알림 켜기' 배너 — 미구독자에게만. 켜면 사라지고, ✕로 14일간 접어둘 수 있다.
const PUSH_NUDGE_SNOOZE = "push-nudge-snooze";
function showPushNudge() {
  const slot = document.getElementById("push-nudge");
  if (!slot) return;
  try {
    const until = Number(localStorage.getItem(PUSH_NUDGE_SNOOZE) || 0);
    if (until && Date.now() < until) return; // 최근에 ✕로 닫음
  } catch (e) {}
  slot.innerHTML = `
    <div class="push-nudge">
      <button class="pn-x" id="pn-x" aria-label="닫기">✕</button>
      <div class="pn-title">🔔 매일 아침, 오늘의 묵상을 받아보세요</div>
      <div class="pn-sub">하루 한 구절 · 짧은 묵상으로 하루를 시작해요</div>
      <button class="pn-btn" id="pn-on">🔔 알림 켜기</button>
    </div>`;
  document.getElementById("pn-on").addEventListener("click", async () => {
    await alarmFromHome();       // 권한 요청 + 구독 → 성공 시 renderSummary가 배너를 자동 제거
  });
  document.getElementById("pn-x").addEventListener("click", () => {
    try { localStorage.setItem(PUSH_NUDGE_SNOOZE, String(Date.now() + 14 * 864e5)); } catch (e) {}
    slot.innerHTML = "";
  });
}

// 첫화면 📲 바로가기: 홈 화면에 앱 추가
// 안드로이드는 브라우저가 설치 대화상자를 대신 띄워 준다 — 한 번만 누르면 끝난다.
// 아이폰 사파리에는 그런 길이 아예 없어 공유 시트를 거쳐야 하는데, 글로만 적으면
// '공유 단추'가 어느 것인지 못 찾으신다. 그래서 그림으로 짚어 준다.
function installToHome() {
  if (window.__pwaInstallPrompt) {
    window.__pwaInstallPrompt.prompt();
    window.__pwaInstallPrompt.userChoice.then(({ outcome }) => {
      if (outcome === "accepted") window.__pwaInstallPrompt = null;
    }).catch(() => {});
    return;
  }
  renderInstallGuide();
}

// 그림 안내 — 폰에 맞는 쪽을 먼저 펼쳐 보여 준다
function renderInstallGuide() {
  const ua = navigator.userAgent || "";
  const ios = /iphone|ipad|ipod/i.test(ua);
  const old = document.getElementById("iw-wrap");
  if (old) old.remove();

  const iosBlock = `
    <div class="iw-block${ios ? " on" : ""}">
      <div class="iw-head">📱 아이폰 (사파리)</div>
      <div class="iw-art">
        <div class="iw-bar"><span class="iw-share">⬆️</span></div>
        <div class="iw-point">▲</div>
        <div class="iw-note">화면 <b>맨 아래 가운데</b>에 있어요</div>
      </div>
      <ol class="iw-steps">
        <li>아래 <b>공유 단추</b>(네모에 화살표)를 누르세요.</li>
        <li>목록을 <b>아래로 넘겨</b> <b>「홈 화면에 추가」</b>를 찾으세요.</li>
        <li>오른쪽 위 <b>「추가」</b>를 누르면 끝이에요.</li>
      </ol>
      <div class="iw-warn">⚠️ <b>사파리</b>에서만 됩니다. 카카오톡으로 여셨다면
        오른쪽 아래 <b>⋯ → 사파리로 열기</b>를 먼저 눌러 주세요.</div>
    </div>`;

  const androidBlock = `
    <div class="iw-block${ios ? "" : " on"}">
      <div class="iw-head">🤖 안드로이드 (크롬)</div>
      <div class="iw-art">
        <div class="iw-note"><b>화면 오른쪽 위</b>에 있어요</div>
        <div class="iw-point">▼</div>
        <div class="iw-bar iw-bar-right"><span class="iw-dots">⋮</span></div>
      </div>
      <ol class="iw-steps">
        <li>오른쪽 위 <b>점 세 개</b>(⋮)를 누르세요.</li>
        <li><b>「홈 화면에 추가」</b> 또는 <b>「앱 설치」</b>를 누르세요.</li>
        <li><b>「추가」</b>를 누르면 끝이에요.</li>
      </ol>
      <div class="iw-warn">⚠️ <b>크롬</b>에서만 됩니다. 카카오톡으로 여셨다면
        오른쪽 위 <b>⋮ → 다른 브라우저로 열기</b>를 먼저 눌러 주세요.</div>
    </div>`;

  const wrap = document.createElement("div");
  wrap.id = "iw-wrap";
  wrap.className = "iw-wrap";
  wrap.innerHTML = `
    <div class="iw-card">
      <div class="iw-top">
        <h3 class="iw-title">📲 홈 화면에 앱 만들기</h3>
        <button class="iw-close" id="iw-close">✕</button>
      </div>
      <p class="iw-lead">한 번만 해 두면 다음부터 <b>바탕화면 그림</b>만 누르면 열려요.</p>
      ${ios ? iosBlock + androidBlock : androidBlock + iosBlock}
      <button class="iw-ok" id="iw-ok">알겠습니다</button>
    </div>`;
  document.body.appendChild(wrap);
  const close = () => wrap.remove();
  wrap.querySelector("#iw-close").addEventListener("click", close);
  wrap.querySelector("#iw-ok").addEventListener("click", close);
  wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });
  wrap.querySelectorAll(".iw-head").forEach((h) =>
    h.addEventListener("click", () => h.parentElement.classList.toggle("on")));
}

// 첫화면 🔔: 미구독자만 기본 7시로 켜고, 이미 켜진 사람은 손대지 않고 안내만
async function alarmFromHome() {
  try {
    const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
    const sub = reg && await reg.pushManager.getSubscription();
    if (sub) {
      const h = (typeof getPushHour === "function") ? getPushHour() : 7;
      appAlert(`이미 매일 암송 알림이 켜져 있어요.\n(매일 오전 ${h}시)\n\n시간 변경·끄기는 ⚙️ 설정에서 하실 수 있어요.`, "🔔 암송 알림");
      return;
    }
  } catch (e) {}
  if (typeof enablePush === "function") {
    const ok = await enablePush(); // 신규는 getPushHour()=기본 7시로 저장됨
    if (ok) renderSummary();       // 종 강조(pulse) 해제 등 상태 갱신
  }
}

// ---------- 응원·기도·공감 공개 게시판 ----------
function boardTime(iso) {
  try {
    const k = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
    const z = (n) => String(n).padStart(2, "0");
    return `${k.getUTCMonth() + 1}/${k.getUTCDate()} ${z(k.getUTCHours())}:${z(k.getUTCMinutes())}`;
  } catch (e) { return ""; }
}
// 관리자 공지만 HTML로 그린다 — 서버가 rich 표시를 붙여 준 글이다(boardPost).
//   ⚠️ 그래도 화이트리스트로 한 번 거른다. 다른 데서 복사해 온 글에 추적 스크립트가
//      묻어 올 수 있고, 언젠가 표시가 잘못 붙는 날을 대비한 이중 잠금이다.
//      모르는 태그는 지우지 말고 '껍데기만 벗겨' 안의 글은 남긴다 — 글이 사라지는 것보다 낫다.
const RICH_TAGS = { B:1, STRONG:1, I:1, EM:1, U:1, S:1, BR:1, P:1, DIV:1, SPAN:1,
  UL:1, OL:1, LI:1, H3:1, H4:1, A:1, HR:1, SMALL:1, BLOCKQUOTE:1, CODE:1 };
const RICH_STYLE = /^(color|background-color|background|font-weight|font-size|font-style|text-align|text-decoration|line-height|margin|margin-top|margin-bottom|padding|border-radius|border-left)$/;

function boardRich(src) {
  let root;
  try {
    const doc = new DOMParser().parseFromString("<div>" + String(src == null ? "" : src) + "</div>", "text/html");
    root = doc.body.firstElementChild;
  } catch (e) { return boardEsc(src); }
  if (!root) return boardEsc(src);
  (function walk(node) {
    Array.prototype.slice.call(node.childNodes).forEach((c) => {
      if (c.nodeType === 3) return;                       // 글자는 그대로 둔다
      if (c.nodeType !== 1) return c.remove();            // 주석 등은 버린다
      if (!RICH_TAGS[c.tagName]) {                        // 모르는 태그 — 껍데기만 벗긴다
        while (c.firstChild) c.parentNode.insertBefore(c.firstChild, c);
        return c.remove();
      }
      Array.prototype.slice.call(c.attributes).forEach((a) => {
        const n = a.name.toLowerCase();
        if (n === "href" && c.tagName === "A") {
          if (!/^https?:\/\//i.test(a.value)) c.removeAttribute("href");
          return;
        }
        if (n === "style") {
          const keep = a.value.split(";").map((d) => d.trim()).filter((d) => {
            const k = (d.split(":")[0] || "").trim().toLowerCase();
            return RICH_STYLE.test(k) && !/url\s*\(|expression|javascript:/i.test(d);
          });
          if (keep.length) c.setAttribute("style", keep.join("; "));
          else c.removeAttribute("style");
          return;
        }
        c.removeAttribute(a.name);                        // on* · src · srcset … 전부 버린다
      });
      if (c.tagName === "A") { c.setAttribute("target", "_blank"); c.setAttribute("rel", "noopener noreferrer"); }
      walk(c);
    });
  })(root);
  return root.innerHTML;
}

function boardEsc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
}
// 로그인 정보로 '소속 이름' 생성(게시판 작성자 표시용, 수정 불가)
function boardWho() {
  const u = (typeof loadUser === "function") ? loadUser() : null;
  if (!u || !u.name) return "";
  const affil = u.type === "교구"
    ? `${u.gu || ""}-${u.mok || ""}`
    : `${u.bu || ""}${u.grade ? " " + u.grade : ""}`;
  return `${affil} ${u.name}`.trim().replace(/^-\s*/, "");
}
function myUserId() {
  const u = (typeof loadUser === "function") ? loadUser() : null;
  return u && u.user_id ? u.user_id : null;
}
let boardMineOnly = false; // 게시판 '내 글만 보기' 상태
// 본인 글 판별: 소속+이름 일치(옛 글 포함) 또는 서버가 알려준 isMine.
// 예전엔 응답에 실려 온 user_id를 직접 비교했는데, 그러려면 서버가 모든 글의
// user_id를 내려보내야 해서 남의 것까지 새어 나갔다. 이제 서버가 '내 것인가'만
// 판단해 참/거짓으로 준다(이름을 바꾼 뒤에도 옛 글이 내 것으로 잡힌다).
function boardIsMine(item) {
  const who = boardWho();
  return item.isMine === true || (!!who && item.name === who);
}
// ── 내게 주시는 말씀 (인앱 RAG 챗봇 화면, 구 '설교말씀 도우미') — 게시판 등과 같은 공통 헤더 사용 ──
// 5x2 주제 그리드: [전체] + 샘플 많은 순 8개 + [기타]. 질문은 실제 설교(2024~2026 전체) 제목·내용 기반.
const SERMON_TOPICS = [
  { t:"대표", qs:["그리스도의 교훈 안에 거한다는 것은 무슨 뜻인가요?","요즘 지치고 힘든데 위로가 되는 말씀을 들려주세요","우리는 존귀한 사람이라는 말씀이 무슨 뜻인가요?","행복한 사람은 어떤 사람인가요?","파손되지 않는 기쁨은 어떻게 얻나요?","목사님이 새해에 주신 말씀은 무엇인가요?","마음이 흔들릴 때 평강을 지키는 비결이 있을까요?","처음 사랑을 회복하려면 어떻게 해야 하나요?","거룩하게 산다는 게 요즘 시대에는 어떤 의미인가요?","인생의 중요한 결정 앞에서 무엇을 붙들어야 하나요?","어른답게 산다는 게 무슨 뜻인가요?","고요하고 평온한 마음은 어떻게 얻을 수 있나요?","삶이 엉망진창처럼 느껴질 때 하나님은 어디 계신가요?","부활의 소망이 오늘 나에게 어떤 의미가 있나요?"] },
  { t:"기도", qs:["기도가 잘 안 될 때 어떻게 해야 하나요?","응답이 없는 기도는 어떻게 붙들어야 하나요?","천만인이 에워싸도 두렵지 않은 기도는 무엇인가요?","기도의 응답이 왜 사명의 시작인가요?","기도의 능력에 대해 목사님은 뭐라고 하셨나요?"] },
  { t:"감사", qs:["감사가 나오지 않을 때 어떻게 감사할 수 있나요?","성도의 세 가지 감사는 무엇인가요?","에벤에셀 후에도 감사하라는 말씀이 무슨 뜻인가요?","그 후에는 감사라는 설교에서 뭐라고 하셨나요?","감사하는 성도가 꿈꾸는 교회는 어떤 모습인가요?"] },
  { t:"말씀", qs:["말씀을 어떻게 삶에 적용해야 하나요?","말씀의 활력이란 무엇인가요?","말씀을 받는 자세는 어떠해야 하나요?","말씀이 성취된다는 것을 어떻게 믿을 수 있나요?","왜 오직 성경이 답인가요?"] },
  { t:"동행", qs:["예수님과 동행하는 삶은 어떤 삶인가요?","춤추듯 예수님과 동행한다는 것은 무슨 뜻인가요?","인생의 큰 광풍을 만났을 때 어떻게 해야 하나요?","예수동행하는 교회는 어떤 교회인가요?"] },
  { t:"은혜", qs:["하나님의 은혜를 어떻게 경험할 수 있나요?","역청의 은혜란 무엇인가요?","은혜를 받은 자는 어떻게 살아야 하나요?","은혜라서 감사하다는 것은 무슨 의미인가요?"] },
  { t:"고난", qs:["고난을 겪을 때 어떻게 믿음을 지킬 수 있나요?","이 또한 지나가리라는 말씀의 진짜 의미는 무엇인가요?","아직 어두울 때에 하나님은 무엇을 하고 계시나요?","힘든 시간을 어떻게 견뎌야 하나요?"] },
  { t:"믿음", qs:["믿음이 약해질 때 어떻게 해야 하나요?","믿고 가는 길이란 어떤 길인가요?","갈렙처럼 믿음으로 산다는 것은 무엇인가요?","광야 같은 시간에 붙들어야 할 질문은 무엇인가요?"] },
  { t:"제자", qs:["예수님의 제자로 산다는 것은 무엇인가요?","제자는 알바가 아니라는 말씀이 무슨 뜻인가요?","방문자와 제자의 차이는 무엇인가요?","그리스도인이라 불린다는 것은 어떤 의미인가요?"] },
  { t:"기타", qs:["하나님께 순종하기 어려울 때 어떻게 해야 하나요?","어떻게 복음을 전해야 하나요?","하나님의 사랑을 어떻게 알 수 있나요?","십자가는 우리에게 어떤 의미인가요?","일터에서 어떻게 신앙생활을 해야 하나요?","참된 안식은 어디에서 오나요?"] },
];
let scSources = [];
// **굵게** 마크다운을 <strong>으로 렌더(나머지는 이스케이프 — XSS 방지).
function scEmphasis(raw) {
  return String(raw == null ? "" : raw).split(/(\*\*[^*]+\*\*)/).map((seg) => {
    const m = seg.match(/^\*\*([^*]+)\*\*$/);
    return m ? `<strong>${boardEsc(m[1])}</strong>` : boardEsc(seg);
  }).join("");
}
function renderSermonChat() {
  stopSpeaking();
  document.getElementById("app").innerHTML = `
    <div class="summary-screen"><div class="summary-card">
      <div class="settings-head sc-head">
        <h2 class="rank-title">💬 내게 주시는 말씀</h2>
        <button class="settings-back-btn" id="sc-back">← 뒤로</button>
      </div>
      <div class="sc-ask">
        <input id="sc-q" placeholder="예) 용서에 대해 목사님이 뭐라고 하셨나요?" />
        <button id="sc-send">질문</button>
      </div>
      <div class="sc-hint">
        <b class="h">💡 이렇게 이용하세요</b>
        <p>AI가 설교를 하나하나 찾아 답을 만들기 때문에 <b>몇 초 정도 걸릴 수 있어요.</b> 잠시만 기다려 주세요.</p>
        <p>입력창에 궁금한 점을 더 적어 <b>이어서 질문해도 됩니다.</b></p>
      </div>
      <div class="sc-cloud" id="sc-cloud"></div>
      <div class="sc-tqs" id="sc-tqs"></div>
      <div id="sc-out"><div class="sc-empty">궁금한 것을 물어보세요. 담임목사님 설교에서 답해드립니다.</div></div>
    </div></div>`;
  document.getElementById("sc-back").addEventListener("click", renderSummary);
  document.getElementById("sc-send").addEventListener("click", scAsk);
  document.getElementById("sc-q").addEventListener("keydown", (e) => { if (e.key === "Enter") scAsk(); });
  scBuildCloud();
}
function scBuildCloud() {
  const cloud = document.getElementById("sc-cloud");
  cloud.innerHTML = SERMON_TOPICS.map((tp, i) => `<button data-i="${i}">${boardEsc(tp.t)}</button>`).join("");
  cloud.querySelectorAll("button").forEach((b) => { b.onclick = () => scSelectTopic(+b.dataset.i, b); });
  const first = cloud.querySelector("button");
  if (first) scSelectTopic(0, first); // 첫 화면에 '대표' 선택 + 샘플 질문 노출
}
function scSelectTopic(i, btn) {
  document.querySelectorAll("#sc-cloud button").forEach((b) => b.classList.remove("on"));
  btn.classList.add("on");
  const qs = SERMON_TOPICS[i].qs;
  const tqs = document.getElementById("sc-tqs");
  tqs.innerHTML = qs.map((q, idx) => `<button class="sc-tq" data-q="${idx}">${boardEsc(q)}</button>`).join("");
  tqs.querySelectorAll(".sc-tq").forEach((b) => {
    // 샘플 질문은 답변이 캐시돼 있어 바로 조회한다(입력창에도 채워 이어서 질문 가능).
    b.onclick = () => { document.getElementById("sc-q").value = qs[+b.dataset.q]; scAsk(); };
  });
}
async function scAsk() {
  const message = document.getElementById("sc-q").value.trim();
  if (!message) return;
  // 예제 목록을 접어 답변이 밀리지 않게 하고, 답변 영역으로 스크롤한다.
  document.getElementById("sc-tqs").innerHTML = "";
  document.querySelectorAll("#sc-cloud button.on").forEach((b) => b.classList.remove("on"));
  const btn = document.getElementById("sc-send");
  btn.disabled = true; btn.textContent = "찾는 중…";
  const out = document.getElementById("sc-out");
  // 질문을 말풍선으로 먼저 보여주고 그 아래 답변을 붙인다(별도 라벨 없이 모양으로 구분).
  const qEcho = `<div class="sc-q-echo">${boardEsc(message)}</div>`;
  out.innerHTML = `${qEcho}<div class="sc-empty">설교를 찾고 있어요… 잠시만 기다려 주세요 🔎</div>`;
  out.scrollIntoView({ behavior: "smooth", block: "start" });
  try {
    const j = await api.sermonChat(message, myUserId());
    scSources = j.sources || [];
    const srcHtml = scSources.map((s, i) => `
      <button class="sc-src" data-i="${i}">
        <span class="sc-src-icon">📖</span>
        <span class="sc-src-body">
          <span class="sc-src-title">${boardEsc(s.title)}</span>
          ${s.scripture ? `<span class="sc-src-scripture">${boardEsc(s.scripture)}</span>` : ""}
          ${s.svc_date ? `<span class="sc-src-date">${boardEsc(s.svc_date)}</span>` : ""}
        </span>
        <span class="sc-src-arrow">›</span>
      </button>`).join("");
    out.innerHTML = `
      ${qEcho}
      <div class="sc-answer">${scEmphasis(j.answer)}</div>
      ${srcHtml ? `<div class="sc-sources">${srcHtml}</div>` : ""}
      <div class="sc-disc">※ 이 답변은 설교 아카이브를 검색한 AI 요약입니다. 정확한 내용은 원 설교를 확인하세요.</div>`;
    out.scrollIntoView({ behavior: "smooth", block: "start" });
    document.querySelectorAll("#sc-out .sc-src").forEach((b) => { b.onclick = () => scOpenSermon(scSources[+b.dataset.i]); });
  } catch (e) {
    out.innerHTML = `${qEcho}<div class="sc-empty">잠시 후 다시 시도해 주세요.</div>`;
  } finally {
    btn.disabled = false; btn.textContent = "질문";
  }
}
function scOpenSermon(s) {
  if (!s) return;
  const m = document.createElement("div");
  m.className = "sc-modal-bg";
  m.innerHTML = `<div class="sc-modal">
    <button class="sc-modal-x" aria-label="닫기">✕</button>
    <div class="sc-modal-rows">
      <div><span class="k">제목</span><span class="v">${boardEsc(s.title)}</span></div>
      <div><span class="k">말씀</span><span class="v">${boardEsc(s.scripture || "-")}</span></div>
      <div><span class="k">일자</span><span class="v">${boardEsc(s.svc_date || "-")}</span></div>
      <div><span class="k">설교자</span><span class="v">${boardEsc(s.preacher || "-")}</span></div>
    </div>
    <div class="sc-modal-btns">
      <button class="sc-mb watch">📺 설교 보기</button>
      <button class="sc-mb summary">📄 말씀 요약</button>
    </div>
    <div class="sc-modal-summary" id="sc-msum" hidden></div>
  </div>`;
  document.body.appendChild(m);
  const close = () => m.remove();
  m.onclick = (e) => { if (e.target === m) close(); };
  m.querySelector(".sc-modal-x").onclick = close;
  m.querySelector(".watch").onclick = () => { window.open("https://youtube.com/watch?v=" + encodeURIComponent(s.youtube_id), "_blank", "noopener"); };
  m.querySelector(".summary").onclick = async () => {
    const el = m.querySelector("#sc-msum");
    el.hidden = false; el.textContent = "요약을 불러오는 중…";
    try {
      const j = await api.sermonSummary(s.youtube_id, myUserId());
      el.innerHTML = (j && j.summary) ? scEmphasis(j.summary) : boardEsc(s.summary || "아직 등록된 요약이 없어요.");
    } catch (e) { el.textContent = s.summary || "요약을 불러오지 못했어요."; }
  };
}

// ── 공감 이모지 ───────────────────────────────────────────────
// 카카오톡처럼 글 아래에 이모지+숫자 칩이 붙는다. 여러 개를 누를 수 있고,
// 다시 누르면 취소된다. 칩을 누르면 누가 눌렀는지 이름이 뜬다.
const BOARD_EMOJI = [
  ["👍", "좋아요"], ["🙏", "기도할게요"], ["❤️", "공감해요"],
  ["😊", "힘내세요"], ["🎉", "축하해요"],
];

function boardRxHtml(kind, item) {
  const counts = item.reactions || {};
  const mine = item.myReacts || [];
  const chips = BOARD_EMOJI
    .filter(([e]) => counts[e])
    .map(([e]) => '<button class="rx-chip' + (mine.indexOf(e) >= 0 ? " on" : "") + '"' +
      ' data-rx="' + kind + '" data-id="' + item.id + '" data-emoji="' + e + '">' +
      e + '<b>' + counts[e] + '</b></button>')
    .join("");
  return '<div class="rx-row">' + chips +
    '<button class="rx-add" data-rxadd="' + kind + '" data-id="' + item.id + '" aria-label="공감 남기기">＋</button>' +
    '</div><div class="rx-names" hidden></div>';
}

// 이모지 고르는 작은 줄 — 한 번에 하나만 열린다
function boardRxPicker(btn) {
  document.querySelectorAll(".rx-pick").forEach((x) => x.remove());
  const kind = btn.dataset.rxadd, id = btn.dataset.id;
  const box = document.createElement("div");
  box.className = "rx-pick";
  box.innerHTML = BOARD_EMOJI.map(([e, label]) =>
    '<button data-e="' + e + '" title="' + label + '"><span>' + e + '</span><i>' + label + '</i></button>').join("");
  btn.parentElement.appendChild(box);
  box.querySelectorAll("button").forEach((b) => {
    b.addEventListener("click", (ev) => {
      ev.stopPropagation();
      box.remove();
      toggleBoardReact(kind, id, b.dataset.e, true);
    });
  });
  setTimeout(() => {
    document.addEventListener("click", function once() {
      box.remove(); document.removeEventListener("click", once);
    }, { once: true });
  }, 0);
}

async function toggleBoardReact(kind, id, emoji, on) {
  const u = loadUser();
  if (!u || !u.user_id) { appAlert("로그인하시면 공감을 남길 수 있어요."); return; }
  try {
    await api.boardReact(kind, Number(id), u.user_id, boardWho(), emoji, on);
    loadBoard();
  } catch (e) {
    appAlert("공감을 저장하지 못했어요.<br>" + boardEsc(e && e.message ? e.message : e));
  }
}

// 누가 눌렀는지 — 모달 대신 칩 바로 아래에 이름 줄이 펼쳐진다(같은 칩을 또 누르면 접힘).
// 내 공감 취소도 이 줄에서 한다. 그래야 칩 탭의 뜻이 '누가 눌렀나 보기' 하나로 통일된다
// (예전에는 내가 누른 칩이면 곧장 취소돼서, 그 이모지는 명단을 볼 방법이 없었다).
async function showBoardReactors(kind, id, emoji, chip) {
  const row = chip.closest(".rx-row");
  const box = row && row.nextElementSibling;
  if (!box || !box.classList.contains("rx-names")) return;
  row.querySelectorAll(".rx-chip.open").forEach((c) => c.classList.remove("open"));
  if (!box.hidden && box.dataset.emoji === emoji) { // 같은 칩을 또 눌렀다 → 접는다
    box.hidden = true; box.dataset.emoji = ""; return;
  }
  box.dataset.emoji = emoji;
  box.hidden = false;
  chip.classList.add("open");
  box.innerHTML = '<div class="rx-names-top"><span class="rx-names-msg">불러오는 중…</span></div>';
  let list;
  try { list = (await api.boardReactors(kind, Number(id), emoji)).list || []; }
  catch (e) { box.innerHTML = '<div class="rx-names-top"><span class="rx-names-msg">이름을 불러오지 못했어요.</span></div>'; return; }
  if (box.dataset.emoji !== emoji) return; // 기다리는 사이 다른 칩을 눌렀으면 버린다
  box.innerHTML = '<div class="rx-names-top"><span class="rx-names-e">' + emoji + '</span>' +
    (list.length
      ? '<span class="rx-names-l">' + list.map((n) => boardEsc(n)).join(" · ") + '</span>'
      : '<span class="rx-names-msg">아직 아무도 누르지 않았어요.</span>') + '</div>' +
    (chip.classList.contains("on") ? '<button class="rx-undo">내 공감 취소</button>' : "");
  const undo = box.querySelector(".rx-undo");
  if (undo) undo.addEventListener("click", (ev) => {
    ev.stopPropagation(); toggleBoardReact(kind, id, emoji, false);
  });
}

function renderBoard() {
  markBoardSeen(); // 게시판을 열면 첫 화면 '새글' 배지 소멸
  const appEl = document.getElementById("app");
  appEl.innerHTML = `
    <div class="summary-screen">
      <div class="summary-card">
        <div class="settings-head">
          <h2 class="rank-title">💬 응원·기도·공감</h2>
          <button class="settings-back-btn" id="board-back">← 뒤로</button>
        </div>
        <p class="board-intro">암송하며 받은 은혜, 기도 부탁드릴 일, 서로에게 힘이 되는 이야기를 나눠 주세요. 모든 글과 답글은 공개됩니다. 🙌</p>
        <p class="board-notice">🙏 <b>성경암송</b>과 관련된 이야기를 나눠 주세요. 주제와 관련 없는 글은 부득이 삭제될 수 있습니다.<br>⚠️ 전화번호 등 <b>민감한 개인정보</b>는 올리지 말아주세요.<br>📷 사진에 <b>다른 분이 나온다면</b> 그분께 먼저 여쭤봐 주세요.</p>
        <div class="board-form">
          <div class="board-who" id="bp-who"></div>
          <textarea id="bp-content" class="board-in board-in-lg" rows="5" maxlength="2000" placeholder="받은 은혜나 기도 부탁을 적어주세요"></textarea>
          <div id="bp-photos" class="bp-photos"></div>
          <input type="file" id="bp-file" accept="image/*" multiple hidden />
          <button type="button" class="board-photo-btn" id="bp-add-photo">📷 사진 넣기</button>
          <button class="summary-go" id="bp-submit">✏️ 글 남기기</button>
          <div id="bp-msg" class="msg"></div>
        </div>
        <div class="board-filter">
          <button id="bf-all" class="bf-btn">전체 보기</button>
          <button id="bf-mine" class="bf-btn">내 글만 보기</button>
        </div>
        <div id="board-list"><p style="text-align:center;color:#888;padding:16px 0">불러오는 중...</p></div>
      </div>
    </div>`;
  document.getElementById("board-back").addEventListener("click", renderSummary);
  const who = boardWho();
  document.getElementById("bp-who").innerHTML = who
    ? `✍️ <b>${boardEsc(who)}</b> <span class="board-who-sub">성도님</span>`
    : `✍️ <b>익명</b>`;
  boardPhotos = [];   // 게시판을 새로 열면 고르던 사진은 비운다
  renderBoardPhotoTray();
  const fileEl = document.getElementById("bp-file");
  document.getElementById("bp-add-photo").addEventListener("click", () => fileEl.click());
  fileEl.addEventListener("change", () => pickBoardPhotos(fileEl));
  document.getElementById("bp-submit").addEventListener("click", submitBoardPost);
  const setFilter = (mine) => {
    boardMineOnly = mine;
    document.getElementById("bf-all").classList.toggle("on", !mine);
    document.getElementById("bf-mine").classList.toggle("on", mine);
    loadBoard();
  };
  document.getElementById("bf-all").addEventListener("click", () => setFilter(false));
  document.getElementById("bf-mine").addEventListener("click", () => setFilter(true));
  setFilter(boardMineOnly);
}
async function loadBoard() {
  const box = document.getElementById("board-list");
  let d;
  try { d = await api.boardList(myUserId()); }
  catch (e) { box.innerHTML = `<p class="msg err">게시판을 불러오지 못했습니다.</p>`; return; }
  let posts = (d && d.posts) || [];
  if (boardMineOnly) posts = posts.filter((p) => boardIsMine(p));
  if (!posts.length) {
    box.innerHTML = `<p style="text-align:center;color:#888;padding:24px 0">${boardMineOnly ? "작성하신 글이 없어요." : "아직 글이 없어요.<br>첫 글을 남겨보세요!"}</p>`;
    return;
  }
  const delBtn = (kind, item) => boardIsMine(item)
    ? ` · <button class="board-del" data-kind="${kind}" data-id="${item.id}">삭제</button>` : "";
  box.innerHTML = posts.map((p) => {
    const replies = (p.replies || []).map((r) => `
      <div class="board-reply${r.is_admin ? " admin" : ""}">
        <div class="board-meta">${r.is_admin ? '<span class="board-badge">관리자</span>' : `<b>${boardEsc(r.name)}</b>`} · ${boardTime(r.created_at)}${r.is_admin ? "" : delBtn("reply", r)}</div>
        <div class="board-text">${boardEsc(r.content)}</div>
        ${boardRxHtml("reply", r)}
      </div>`).join("");
    return `
      <div class="board-post" data-id="${p.id}">
        <div class="board-meta"><b>${boardEsc(p.name)}</b> · ${boardTime(p.created_at)}${delBtn("post", p)}</div>
        <div class="board-text${p.rich ? " rich" : ""}">${p.rich ? boardRich(p.content) : boardEsc(p.content)}</div>
        ${boardPhotosHtml(p)}
        ${boardRxHtml("post", p)}
        ${replies}
        <div class="board-reply-form">
          <textarea class="board-in br-content" rows="2" maxlength="2000" placeholder="답글 달기"></textarea>
          <button class="board-reply-btn" data-id="${p.id}">답글 등록</button>
        </div>
      </div>`;
  }).join("");
  box.querySelectorAll(".board-photo").forEach((im) => im.addEventListener("click", () => openPhotoViewer(im.dataset.full)));
  box.querySelectorAll(".board-reply-btn").forEach((btn) => btn.addEventListener("click", () => submitBoardReply(btn)));
  box.querySelectorAll(".board-del").forEach((btn) => btn.addEventListener("click", () => deleteMine(btn)));
  box.querySelectorAll("[data-rxadd]").forEach((btn) => btn.addEventListener("click", (e) => {
    e.stopPropagation(); boardRxPicker(btn);
  }));
  box.querySelectorAll("[data-rx]").forEach((btn) => btn.addEventListener("click", (e) => {
    e.stopPropagation();
    showBoardReactors(btn.dataset.rx, btn.dataset.id, btn.dataset.emoji, btn);
  }));
}
// 글에 붙은 사진. 서버는 파일 이름만 저장하고 볼 수 있는 주소는 그때 만들어 준다.
function boardPhotosHtml(p) {
  const list = Array.isArray(p.photos) ? p.photos.filter((u) => /^https:\/\//.test(u)) : [];
  if (!list.length) return "";
  return `<div class="board-photos${list.length === 1 ? " one" : ""}">` +
    list.map((u) => `<img class="board-photo" src="${boardEsc(u)}" alt="첨부 사진" loading="lazy" data-full="${boardEsc(u)}">`).join("") +
    `</div>`;
}

// 사진을 눌렀을 때 크게 — 어르신은 작은 그림에서 잘 못 알아보신다.
function openPhotoViewer(url) {
  const wrap = document.createElement("div");
  wrap.className = "photo-viewer";
  wrap.innerHTML = `<img src="${boardEsc(url)}" alt="첨부 사진"><button class="pv-close" aria-label="닫기">✕ 닫기</button>`;
  document.body.appendChild(wrap);
  const close = () => { document.removeEventListener("keydown", onKey, true); wrap.remove(); };
  const onKey = (e) => {
    if (e.key !== "Escape" && e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault(); e.stopPropagation(); close();
  };
  document.addEventListener("keydown", onKey, true);
  wrap.addEventListener("click", close);
}

// ── 게시판 사진 ──────────────────────────────────────────────
// 글 하나에 넉 장까지. 답글에는 넣지 않는다(화면이 복잡해진다).
const BOARD_PHOTO_MAX = 4;
// 긴 변 1080px이면 폰에서 보기에 넉넉하다. 1280px으로 뒀더니 한 장이 1MB를 넘겨
// 폰 업로드가 끊겼다("Failed to fetch") — 화질보다 '올라가는 것'이 먼저다.
const BOARD_PHOTO_SIDE = 1080;
const BOARD_PHOTO_TARGET = 400_000;   // dataURL 글자 수 ≈ 300KB
const BOARD_PHOTO_HARD = 900_000;     // 이보다 크면 아예 보내지 않는다
let boardPhotos = [];            // [{ name, mime, dataUrl }] — 아직 안 올린 것

// 폰 사진을 그대로 보내면 안 되는 이유가 둘이다.
//  ① 3~8MB라 요청이 너무 크고 어르신 데이터 요금도 나간다 (→ 200~400KB)
//  ② 더 중요한 것: EXIF에 **찍은 장소의 GPS**가 들어 있다. 그대로 올리면 집에서 찍은
//     사진에 집 주소가 붙어 공개 게시판에 올라간다.
//     캔버스에 다시 그리면 화소만 남고 EXIF가 통째로 사라진다 — 그래서 이 과정이 필수다.
function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const draw = (side) => {
        const long = Math.max(img.width, img.height) || 1;
        const k = Math.min(1, side / long);
        const w = Math.max(1, Math.round(img.width * k));
        const h = Math.max(1, Math.round(img.height * k));
        const cv = document.createElement("canvas");
        cv.width = w; cv.height = h;
        const ctx = cv.getContext("2d");
        ctx.fillStyle = "#fff";        // 투명 PNG가 검게 나오지 않도록
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        // 목표 크기에 닿을 때까지 품질을 한 단계씩 낮춘다
        let q = 0.7, out = cv.toDataURL("image/jpeg", q);
        while (out.length > BOARD_PHOTO_TARGET && q > 0.4) {
          q -= 0.1; out = cv.toDataURL("image/jpeg", q);
        }
        return out;
      };
      let out = draw(BOARD_PHOTO_SIDE);
      // 품질을 다 낮춰도 크면 그림 자체를 줄인다(잘게 찍힌 사진은 품질만으론 안 준다)
      if (out.length > BOARD_PHOTO_TARGET) out = draw(Math.round(BOARD_PHOTO_SIDE * 0.7));
      if (out.length > BOARD_PHOTO_HARD) {
        reject(new Error("사진이 너무 큽니다. 다른 사진으로 해보세요"));
        return;
      }
      resolve({ name: file.name || "photo.jpg", mime: "image/jpeg", dataUrl: out });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("사진을 열지 못했어요")); };
    img.src = url;
  });
}

function renderBoardPhotoTray() {
  const tray = document.getElementById("bp-photos");
  if (!tray) return;
  tray.innerHTML = boardPhotos.map((p, i) => `
    <div class="bp-thumb">
      <img src="${p.dataUrl}" alt="">
      <button type="button" class="bp-thumb-x" data-rm="${i}" aria-label="이 사진 빼기">✕</button>
    </div>`).join("");
  tray.querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", () => {
    boardPhotos.splice(Number(b.dataset.rm), 1);
    renderBoardPhotoTray();
  }));
  const add = document.getElementById("bp-add-photo");
  if (add) {
    add.disabled = boardPhotos.length >= BOARD_PHOTO_MAX;
    add.textContent = boardPhotos.length
      ? `📷 사진 ${boardPhotos.length}/${BOARD_PHOTO_MAX}`
      : "📷 사진 넣기";
  }
}

async function pickBoardPhotos(input) {
  const files = Array.from(input.files || []);
  input.value = "";                      // 같은 사진을 다시 골라도 열리도록
  const msg = document.getElementById("bp-msg");
  const room = BOARD_PHOTO_MAX - boardPhotos.length;
  if (files.length > room && msg) {
    msg.className = "msg";
    msg.textContent = `사진은 ${BOARD_PHOTO_MAX}장까지예요. 앞의 ${room}장만 넣었어요.`;
  }
  for (const f of files.slice(0, room)) {
    if (!/^image\//.test(f.type)) continue;
    try { boardPhotos.push(await shrinkImage(f)); }
    catch (e) { if (msg) { msg.className = "msg err"; msg.textContent = "사진 하나를 열지 못했어요."; } }
  }
  renderBoardPhotoTray();
}

async function submitBoardPost() {
  const content = document.getElementById("bp-content").value.trim();
  const msg = document.getElementById("bp-msg");
  if (!content) { msg.className = "msg err"; msg.textContent = "내용을 입력해주세요."; return; }
  if (!(await appConfirm("이 내용으로 글을 올릴까요?\n작성한 글은 모든 분에게 공개됩니다.", { okText: "올리기" }))) return;
  const btn = document.getElementById("bp-submit"); btn.disabled = true; msg.className = "msg"; msg.textContent = "등록 중...";
  // 사진을 먼저 한 장씩 올린다. 폰 사정이 느릴 수 있어 몇 장째인지 보여 준다 —
  // 아무 말 없이 멈춰 있으면 어르신은 고장인 줄 알고 다시 누르신다.
  const names = [];
  for (let i = 0; i < boardPhotos.length; i++) {
    msg.className = "msg";
    msg.textContent = `사진 올리는 중… (${i + 1}/${boardPhotos.length})`;
    try {
      let d;
      try {
        d = await api.boardUpload(boardPhotos[i].mime, boardPhotos[i].dataUrl);
      } catch (e1) {
        // 폰 통신은 한 번씩 끊긴다("Failed to fetch"). 한 번은 조용히 다시 해본다.
        if (!/fetch|network|Load failed/i.test(String(e1 && e1.message))) throw e1;
        msg.textContent = `사진 올리는 중… (${i + 1}/${boardPhotos.length}) 다시 시도`;
        await new Promise((r) => setTimeout(r, 1200));
        d = await api.boardUpload(boardPhotos[i].mime, boardPhotos[i].dataUrl);
      }
      if (d && d.ok && d.path) names.push(d.path);
      else throw new Error((d && d.error) || "사진 오류");
    } catch (e) {
      btn.disabled = false;
      msg.className = "msg err";
      const why = String((e && e.message) || e);
      msg.textContent = /fetch|network|Load failed/i.test(why)
        ? "사진을 올리지 못했어요 — 인터넷이 끊긴 것 같아요. 잠시 뒤 다시 눌러 주세요."
        : "사진을 올리지 못했어요: " + why;
      return;   // 글은 아직 안 올렸다 — 적은 내용이 그대로 남아 다시 누르면 된다
    }
  }
  msg.textContent = "등록 중...";
  try { await api.boardPost(boardWho(), content, myUserId(), names); }
  catch (e) { btn.disabled = false; msg.className = "msg err"; msg.textContent = "등록 실패: " + (e && e.message ? e.message : e); return; }
  boardPhotos = [];
  renderBoardPhotoTray();
  document.getElementById("bp-content").value = "";
  msg.className = "msg"; msg.textContent = "✅ 등록되었습니다.";
  btn.disabled = false;
  loadBoard();
}
async function submitBoardReply(btn) {
  const post = btn.closest(".board-post");
  const contentEl = post.querySelector(".br-content");
  const content = contentEl.value.trim();
  if (!content) { contentEl.focus(); return; }
  if (!(await appConfirm("답글을 등록할까요?\n작성한 답글은 모든 분에게 공개됩니다.", { okText: "등록" }))) return;
  btn.disabled = true;
  try { await api.boardReply(Number(btn.dataset.id), boardWho(), content, myUserId()); }
  catch (e) { btn.disabled = false; appAlert("답글 등록 실패: " + (e && e.message ? e.message : e)); return; }
  loadBoard();
}
async function deleteMine(btn) {
  if (!(await appConfirm("이 글을 삭제할까요?", { okText: "삭제", danger: true }))) return;
  try { await api.boardDeleteMine(btn.dataset.kind, Number(btn.dataset.id), myUserId(), boardWho()); }
  catch (e) { appAlert("삭제 실패: " + (e && e.message ? e.message : e)); return; }
  loadBoard();
}

// 설정 화면 — 로그인 정보변경 · 알림 · 홈 화면 추가 · 공유 (요약에서 분리)
function renderSettings() {
  // 실시간 구독 상태 진단(아래 startPushLiveStatus)이 화면을 나가도 계속 도는 걸
  // 막는다 — 여러 번 설정에 들어오면 이전 타이머가 쌓이지 않게 먼저 멈춘다.
  if (window.__pushLiveTimer) { clearInterval(window.__pushLiveTimer); window.__pushLiveTimer = null; }
  const appEl = document.getElementById("app");
  appEl.innerHTML = `
    <div class="summary-screen">
      <div class="summary-card">
        <div class="settings-head">
          <h2 class="rank-title">⚙️ 설정</h2>
          <button class="settings-back-btn" id="settings-back">← 뒤로</button>
        </div>
        <button class="summary-install" id="change-user">👤 로그인 정보변경</button>
        <button class="summary-install" id="install-btn">⛪ 홈 화면에 추가</button>
        <div class="setting-block">
          <div class="setting-label">🌙 화면 밝기</div>
          <div class="tts-rate-row" id="theme-row">
            <button data-theme="light">☀️ 밝게</button>
            <button data-theme="dark">🌙 어둡게</button>
          </div>
        </div>
        <div class="setting-block">
          <div class="setting-label">🔎 글씨 크기</div>
          <div class="tts-rate-row" id="fontsize-row">
            <button data-fs="normal">보통</button>
            <button data-fs="lg">크게</button>
            <button data-fs="xl">아주 크게</button>
          </div>
        </div>
        <div class="setting-block">
          <div class="setting-label">✍️ 암송 입력 방법</div>
          <div class="tts-rate-row" id="cardstart-row">
            <button data-cs="0">⌨️ 쓰기</button>
            <button data-cs="1">👆 카드</button>
          </div>
          <div class="btn-sub" style="text-align:center;">낱말을 눌러서 채웁니다 — 자판이 번거로우실 때 편해요</div>
        </div>
        <div class="setting-block">
          <div class="setting-label">🌐 암송 언어</div>
          <div class="tts-rate-row" id="lang-row">
            <button data-lang="ko">한국어</button>
            <button data-lang="en">English (NIV)</button>
          </div>
          <div class="btn-sub" style="text-align:center;">영어 본문이 있는 구절(EN 표시)만 영어로 나와요</div>
        </div>
        <div class="setting-block">
          <div class="setting-label">🔊 말씀 듣기 속도</div>
          <div class="tts-rate-row" id="tts-rate-row">
            <button data-rate="0.5">느리게</button>
            <button data-rate="0.7">보통</button>
            <button data-rate="0.9">조금 빠르게</button>
            <button data-rate="1.1">빠르게</button>
          </div>
          <button class="tts-preview" id="tts-preview">🔊 이 속도로 들어보기</button>
        </div>
        <div class="setting-block">
          <div class="setting-label">🕖 알림 시간 (아침)</div>
          <div class="tts-rate-row" id="pushhour-row">
            <button data-hour="5">5시</button>
            <button data-hour="6">6시</button>
            <button data-hour="7">7시</button>
            <button data-hour="8">8시</button>
          </div>
          <div id="pushhour-msg" class="btn-sub" style="text-align:center;color:#2f6b4f;min-height:16px"></div>
        </div>
        <button class="summary-install" id="enable-push">🔔 매일 암송 알림 받기<br><span class="btn-sub">( 매일 아침 · 위에서 시간 선택 )</span></button>
        <div class="app-status" id="app-status"></div>
        <div class="app-status" id="push-live-status" style="color:#8a6d1f"></div>
        <button class="push-off" id="disable-push">🔕 알림 끄기</button>
        <button class="summary-install" id="test-push">🧪 내 기기로 테스트 알림</button>
        <button class="summary-install" id="share-btn">🔗 공유하기</button>
        <a class="summary-install" href="admin.html">📊 관리자 페이지</a>
        <button class="summary-install" id="privacy-info">🔐 개인정보 안내 보기</button>
        <button class="push-off" id="clear-me">🚪 이 기기에서 내 정보 지우기<br><span class="btn-sub">( 공용 기기에서 사용하셨다면 눌러주세요 )</span></button>
        <div class="setting-block">
          <div class="setting-label">☁️ 동기화 상태</div>
          ${syncStatusHtml()}
        </div>
      </div>
    </div>`;
  document.getElementById("settings-back").addEventListener("click", () => {
    if (window.__pushLiveTimer) { clearInterval(window.__pushLiveTimer); window.__pushLiveTimer = null; }
    stopSpeaking(); renderSummary();
  });
  document.getElementById("change-user").addEventListener("click", renderEntryScreen);
  document.getElementById("privacy-info").addEventListener("click", () => renderPrivacyInfo(renderSettings));
  document.getElementById("share-btn").addEventListener("click", shareApp);
  document.getElementById("enable-push").addEventListener("click", () => { if (typeof enablePush === "function") enablePush(); });
  document.getElementById("disable-push").addEventListener("click", () => { if (typeof disablePush === "function") disablePush(); });
  document.getElementById("clear-me").addEventListener("click", clearMeOnThisDevice);
  document.getElementById("test-push").addEventListener("click", () => { if (typeof testMyPush === "function") testMyPush(); });
  updateAppStatus();
  startPushLiveStatus();
  setupSyncRetry();
  setupThemeSetting();
  setupFontSize();
  setupCardStart();
  setupLangSetting();
  setupTtsRate();
  setupPushHour();
  setupInstallButton();
}

// 공용 기기(로비 지원용 태블릿 등)를 다음 사람에게 넘기기 전에 내 흔적을 지운다.
// 서버 기록은 그대로여서 같은 이름으로 다시 들어오면 진도가 복구된다.
async function clearMeOnThisDevice() {
  const u = loadUser();
  const who = u ? userLabel(u) : "이 기기";
  const ok = await appConfirm(
    `<b>${who}</b> 님의 정보를 이 기기에서 지웁니다.<br><br>` +
      `암송 기록은 <b>서버에 그대로 남아</b> 있어서, 나중에 같은 이름으로 다시 들어오시면 진도가 그대로 이어집니다.<br><br>` +
      `이 기기의 알림도 함께 꺼집니다.`,
    { title: "🚪 내 정보 지우기", okText: "지우기", danger: true }
  );
  if (!ok) return;
  if (typeof disablePush === "function") await disablePush(true); // 다음 사람에게 내 알림이 가지 않도록
  clearPersonalData();
  stopSpeaking();
  await appAlert("이 기기에서 정보를 지웠습니다.<br>다음 분이 새로 시작하실 수 있어요.");
  renderEntryScreen();
}

// 암송 언어(한국어/영어 NIV) 선택 UI — 영어 본문이 있는 구절에만 적용된다
function setupLangSetting() {
  const row = document.getElementById("lang-row");
  if (!row) return;
  const btns = Array.from(row.querySelectorAll("button"));
  const sync = () => btns.forEach((b) => b.classList.toggle("on", b.dataset.lang === getLang()));
  sync();
  btns.forEach((b) => {
    b.addEventListener("click", () => { setLang(b.dataset.lang); sync(); });
  });
}

// 알림 시간(5·6·7·8시) 선택 UI — 고르면 즉시 서버 반영(구독 중일 때)
function setupPushHour() {
  const row = document.getElementById("pushhour-row");
  if (!row) return;
  const msg = document.getElementById("pushhour-msg");
  const btns = Array.from(row.querySelectorAll("button"));
  const cur = (typeof getPushHour === "function") ? getPushHour() : 7;
  const sync = (h) => btns.forEach((b) => b.classList.toggle("on", Number(b.dataset.hour) === h));
  sync(cur);
  btns.forEach((b) => {
    b.addEventListener("click", async () => {
      const h = Number(b.dataset.hour);
      sync(h);
      if (msg) msg.textContent = "저장 중...";
      let r = { updated: false, hour: h };
      if (typeof setPushHour === "function") r = await setPushHour(h);
      if (msg) msg.textContent = r.updated
        ? `✅ 매일 오전 ${h}시에 받도록 변경됐어요.`
        : `오전 ${h}시로 설정했어요. 아래 '알림 받기'를 켜면 적용돼요.`;
    });
  });
}

// 글씨 크기(고령 성도 배려) 선택 UI — normal/lg/xl. 본문·버튼이 함께 커짐
function setupFontSize() {
  const row = document.getElementById("fontsize-row");
  if (!row) return;
  const btns = Array.from(row.querySelectorAll("button"));
  let cur = "normal";
  try { const s = localStorage.getItem("fontscale"); if (s === "lg" || s === "xl") cur = s; } catch (e) {}
  const sync = (v) => btns.forEach((b) => b.classList.toggle("on", b.dataset.fs === v));
  sync(cur);
  btns.forEach((b) => {
    b.addEventListener("click", () => {
      const v = b.dataset.fs;
      if (v === "normal") { document.documentElement.removeAttribute("data-fs"); try { localStorage.removeItem("fontscale"); } catch (e) {} }
      else { document.documentElement.setAttribute("data-fs", v); try { localStorage.setItem("fontscale", v); } catch (e) {} }
      sync(v);
    });
  });
}

// 암송 입력 방법 — 쓰기 / 카드.
// 카드 모드 자체는 구절마다 꺼지는 것이 기본이지만(암송의 기본은 '쓰기'),
// 타자가 어려운 분은 구절마다 👆를 다시 눌러야 했다. 여기서 켜 두면 늘 카드로 시작한다.
function setupCardStart() {
  const row = document.getElementById("cardstart-row");
  if (!row) return;
  const btns = Array.from(row.querySelectorAll("button"));
  const sync = (on) => btns.forEach((b) => b.classList.toggle("on", (b.dataset.cs === "1") === on));
  sync(isCardStart());
  btns.forEach((b) => {
    b.addEventListener("click", () => {
      const on = b.dataset.cs === "1";
      setCardStart(on);
      setCardMode(on);   // 지금 켠 것이 다음 구절부터가 아니라 바로 먹히게
      sync(on);
    });
  });
}

// 첫 화면 아이콘 줄의 암송 입력 방법 전환 — 위 setupCardStart와 같은 상태
// (CARD_START_KEY)를 쓰지만, 아이콘 한 칸에 넣어야 해서 버튼 두 개가 아니라
// 하나를 눌러 상태가 넘어가는 모양으로 짰다. 쓰기(⌨️)면 눌러서 카드(👆)로,
// 카드면 눌러서 쓰기로.
function setupCardToggleIcon() {
  const btn = document.getElementById("toggle-card-input");
  if (!btn) return;
  const capLabel = document.getElementById("toggle-card-input-label");
  const paint = (on) => {
    btn.textContent = on ? "👆" : "⌨️";
    const label = on ? "지금 카드 — 눌러서 쓰기로" : "지금 쓰기 — 눌러서 카드로";
    btn.setAttribute("aria-label", label);
    btn.title = label;
    if (capLabel) capLabel.textContent = on ? "카드" : "쓰기"; // 아이콘 밑 상시 캡션도 같이
  };
  paint(isCardStart());
  btn.addEventListener("click", () => {
    const on = !isCardStart();
    setCardStart(on);
    setCardMode(on);   // 설정 화면과 마찬가지로 지금 구절부터 바로 먹힌다
    paint(on);
  });
}

// 첫 화면 아이콘 줄의 "도전에 구절 먼저 쓰기" 켬/끔 — "공유" 아이콘 자리를 대신한다
// (공유는 없앤 게 아니라 설정 화면에도 그대로 있다). 위 setupCardToggleIcon과 같은 모양:
// 한 칸에 아이콘 하나, 눌러서 상태를 뒤집는다.
function setupRefFirstToggle() {
  const btn = document.getElementById("toggle-ref-first");
  if (!btn) return;
  const capLabel = document.getElementById("toggle-ref-first-label");
  const paint = (on) => {
    btn.classList.toggle("icon-on", on);
    // 원 배경만 파랑/빨강으로 바뀌고 안의 이모지(🔖 등)는 그 자체 색을 그대로 가져
    // 원과 안 어울린다는 지적 — 아이콘 자체를 색이 있는 책 이모지로 바꿔 안팎이 같이 바뀌게 한다.
    btn.textContent = on ? "📘" : "📕";
    const label = on ? "도전에 구절 먼저 쓰기 켜짐 — 눌러서 끄기" : "도전에 구절 먼저 쓰기 꺼짐 — 눌러서 켜기";
    btn.setAttribute("aria-label", label);
    btn.title = label;
    if (capLabel) capLabel.textContent = "구절"; // 켬/끔은 아이콘 색으로만(icon-on) — 글자를 안 늘린다
  };
  paint(isChallengeRefFirst());
  btn.addEventListener("click", () => {
    const on = !isChallengeRefFirst();
    setChallengeRefFirst(on);
    paint(on);
  });
}

// 설정 화면 하단: 현재 실행 모드/알림 권한 상태 표시(설치 확인용)
function updateAppStatus() {
  const el = document.getElementById("app-status");
  if (!el) return;
  const standalone =
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
    window.navigator.standalone === true;
  const perm = (window.Notification && Notification.permission) || "default";
  const permTxt = perm === "granted" ? "허용됨" : perm === "denied" ? "거부됨" : "미설정";
  el.textContent = `실행 모드: ${standalone ? "📱 설치된 앱" : "🌐 브라우저"} · 알림 권한: ${permTxt}`;
}

// 구독 실시간 상태 진단(2026-08-29) — 플레이스토어(TWA) 설치본에서 「알림이
// 설정되었습니다」가 뜨고도 몇 초~몇 분 뒤 구독이 사라지는 신고가 있었다.
// 즉시 사라지는 경우는 enablePush()의 700ms 재확인이 잡아내지만, 더 늦게
// 사라지는 경우는 못 잡는다 — 화면을 계속 지켜봐야 언제 사라지는지 알 수 있는데
// 개발자는 그 폰을 볼 수 없으므로, 폰 화면 자체에 2초마다 갱신되는 상태를
// 띄워 성도님이 직접 캡처해서 보내주실 수 있게 한다. 설정 화면을 나가면 멈춘다.
function startPushLiveStatus() {
  const el = document.getElementById("push-live-status");
  if (!el || !("serviceWorker" in navigator)) return;
  const check = async () => {
    if (!document.getElementById("push-live-status")) return; // 화면이 이미 바뀜
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg && await reg.pushManager.getSubscription();
      const perm = (window.Notification && Notification.permission) || "default";
      const now = new Date().toLocaleTimeString("ko-KR", { hour12: false });
      const tail = sub ? sub.endpoint.slice(-8) : null;
      el.textContent = sub
        ? `🔎 ${now} · 구독 있음(…${tail}) · 권한:${perm}`
        : `🔎 ${now} · 구독 없음 · 권한:${perm}`;
    } catch (e) {
      el.textContent = `🔎 확인 중 오류: ${e && e.message ? e.message : e}`;
    }
  };
  check();
  window.__pushLiveTimer = setInterval(check, 2000);
}

// 화면 밝기(다크 모드) 선택 UI
function setupThemeSetting() {
  const row = document.getElementById("theme-row");
  if (!row) return;
  const btns = Array.from(row.querySelectorAll("button"));
  const sync = () => {
    const dark = document.documentElement.classList.contains("dark");
    btns.forEach((b) => b.classList.toggle("on", b.dataset.theme === (dark ? "dark" : "light")));
  };
  sync();
  btns.forEach((b) => {
    b.addEventListener("click", () => {
      const dark = b.dataset.theme === "dark";
      document.documentElement.classList.toggle("dark", dark);
      try { localStorage.setItem("theme", dark ? "dark" : "light"); } catch (e) {}
      sync();
    });
  });
}

// 듣기(TTS) 속도 선택 UI
function setupTtsRate() {
  const row = document.getElementById("tts-rate-row");
  if (!row) return;
  const cur = getSpeakRate();
  const btns = Array.from(row.querySelectorAll("button"));
  // 현재 값과 가장 가까운 버튼을 활성화
  let nearest = btns[1];
  let best = Infinity;
  btns.forEach((b) => {
    const d = Math.abs(parseFloat(b.dataset.rate) - cur);
    if (d < best) { best = d; nearest = b; }
  });
  btns.forEach((b) => b.classList.toggle("on", b === nearest));
  btns.forEach((b) => {
    b.addEventListener("click", () => {
      const r = parseFloat(b.dataset.rate);
      setSpeakRate(r);
      btns.forEach((x) => x.classList.toggle("on", x === b));
      stopSpeaking();
      speakText("주의 말씀은 내 발에 등이요 내 길에 빛이니이다");
    });
  });
  const prev = document.getElementById("tts-preview");
  if (prev) prev.addEventListener("click", () => {
    stopSpeaking();
    speakText("주의 말씀은 내 발에 등이요 내 길에 빛이니이다");
  });
}

// PWA '홈 화면에 추가' 버튼 로직 (설정 화면)
function setupInstallButton() {
  const installBtn = document.getElementById("install-btn");
  if (!installBtn) return;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isInStandaloneMode =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone;

  if (isInStandaloneMode) {
    installBtn.hidden = true; // 이미 설치됨
  } else if (isIOS) {
    installBtn.addEventListener("click", () => {
      appAlert(
        "① 하단 공유 버튼(□↑)을 누르세요\n" +
        "② 목록에서 \"홈 화면에 추가\"를 선택하세요\n" +
        "③ 오른쪽 위 \"추가\"를 눌러 완료!",
        "📱 홈 화면에 추가하는 방법"
      );
    });
  } else if (window.__pwaInstallPrompt) {
    installBtn.addEventListener("click", async () => {
      window.__pwaInstallPrompt.prompt();
      const { outcome } = await window.__pwaInstallPrompt.userChoice;
      if (outcome === "accepted") {
        installBtn.hidden = true;
        window.__pwaInstallPrompt = null;
      }
    });
  } else {
    installBtn.addEventListener("click", () => {
      const ua = navigator.userAgent || "";
      if (/android/i.test(ua)) {
        appAlert(
          "① 브라우저 우측 상단 메뉴(⋮)를 누르세요\n" +
          "② \"홈 화면에 추가\"를 선택하세요\n" +
          "③ \"추가\"를 눌러 완료!",
          "📱 홈 화면에 추가하는 방법"
        );
      } else {
        appAlert(
          "• iOS Safari: 공유 버튼(□↑) → 홈 화면에 추가\n" +
          "• Android Chrome: 메뉴(⋮) → 홈 화면에 추가",
          "📱 홈 화면에 추가하는 방법"
        );
      }
    });
  }
}

// ------------------------------------------------------------
// 화면 2: 구절 목록
// ------------------------------------------------------------
// 구절별 암송 횟수(암송·도전·복습 전부) 캐시. { verse_no: n } — 서버 challenge_log 집계.
let verseCountCache = null;

// 첫 화면 '오늘 N회' 띠. 횟수(암송·도전·복습 전부, KST)에 따라 짧은 격려어가 달라진다.
let todayCountCache = null; // 오늘 활동 횟수(숫자) 또는 null(미로드)
let todayCountDay = null;   // 그 캐시가 속한 KST 날짜(YYYY-MM-DD) — 자정 넘김 판별용

function todayYmd() {
  const p = kstDateParts() || {};
  return [p.y, String(p.m).padStart(2, "0"), String(p.d).padStart(2, "0")].join("-");
}

function todayTier(n) {
  if (n <= 0)  return { word: "오늘 첫 말씀을 시작해요", emoji: "🌱", cls: "t0" };
  if (n < 5)   return { word: "좋은 출발",   emoji: "☀️", cls: "t1" };
  if (n < 10)  return { word: "꾸준해요",     emoji: "🌿", cls: "t2" };
  if (n < 20)  return { word: "열심이에요",   emoji: "🔥", cls: "t3" };
  if (n < 30)  return { word: "대단해요",     emoji: "✨", cls: "t4" };
  return { word: "말씀의 사람", emoji: "👑", cls: "t5" };
}

function applyTodayStrip() {
  const el = document.getElementById("today-strip");
  if (!el || todayCountCache == null) return;
  const n = todayCountCache;
  const t = todayTier(n);
  el.className = "today-strip " + t.cls;
  // 오늘 회수에 따른 색은 **상자 전체**가 받는다 — 안의 줄만 물들이면 상자 안에
  // 또 상자가 있는 꼴이 된다(2026-09-02에 두 줄을 한 상자로 합치면서).
  const box = document.getElementById("user-info");
  if (box) box.className = "user-info " + t.cls;
  el.innerHTML = n > 0
    ? `<span class="today-count">오늘 <b>${n}회</b></span><span class="today-word">${t.word} ${t.emoji}</span>`
    : `<span class="today-word">${t.word} ${t.emoji}</span>`;
}

// 활동(암송·도전·복습) 완료 시 즉시 +1. 서버 커밋을 기다리지 않아 '실시간'으로 느껴진다.
// 캐시 미로드/날짜 바뀜이면 건너뛰고 다음 mydays가 채운다.
function bumpTodayCount() {
  if (todayCountCache == null || todayCountDay !== todayYmd()) return;
  todayCountCache += 1;
  applyTodayStrip(); // 홈 화면이면 즉시 반영, 아니면 다음 renderSummary에서 보임
}
// 저장 실패 시 낙관적 +1 되돌리기(과다 계상 방지)
function unbumpTodayCount() {
  if (todayCountCache == null || todayCountDay !== todayYmd()) return;
  todayCountCache = Math.max(0, todayCountCache - 1);
  applyTodayStrip();
}

function loadTodayCount(u) {
  applyTodayStrip(); // 캐시 있으면 즉시(재방문 깜빡임 방지)
  if (!u || !u.user_id || !window.api || !api.mydays) return;
  const ymd = todayYmd();
  api.mydays(u.user_id, ymd, ymd)
    .then((d) => {
      const serverVal = (d && d.days && Number(d.days[ymd])) || 0;
      if (todayCountDay === ymd && todayCountCache != null) {
        // 같은 날: 방금 낙관적 +1을 경합하던 mydays가 옛 값으로 되돌리지 않게 큰 값 유지
        todayCountCache = Math.max(todayCountCache, serverVal);
      } else {
        // 첫 로드 또는 자정 넘김 → 서버값으로 리셋
        todayCountCache = serverVal;
        todayCountDay = ymd;
      }
      applyTodayStrip();
    })
    .catch(() => {});
}

// 카드 상태 배지에 " · N회" 병기. data-base(단계 텍스트) 기준이라 여러 번 호출해도 안전.
function applyVerseCounts() {
  if (!verseCountCache) return;
  document.querySelectorAll("#verse-list .verse-status[data-no]").forEach((el) => {
    const base = el.dataset.base || el.textContent;
    const n = verseCountCache[el.dataset.no] || 0;
    el.textContent = n > 0 ? `${base} · ${n}회` : base;
  });
  // 성도님 이름 뒤 총 암송 횟수(모든 구절 합계)
  const totalEl = document.getElementById("nav-total");
  if (totalEl) {
    const total = Object.values(verseCountCache).reduce((a, b) => a + b, 0);
    totalEl.textContent = total > 0 ? ` · 총 ${total}회` : "";
  }
}

// 서버에서 구절별 횟수를 불러와 캐시에 담고 배지를 갱신(비동기, 실패해도 조용히 무시).
function loadVerseCounts(u) {
  if (!u || !u.user_id || !window.api || !api.verseCounts) return;
  api.verseCounts(u.user_id)
    .then((d) => { verseCountCache = d.counts || {}; applyVerseCounts(); })
    .catch(() => {});
}

function renderVerseList() {
  const u = loadUser();
  const appEl = document.getElementById("app");
  // 화면에 보이는 순서(최신 구절부터)가 곧 재생 순서다 — 앨범과 같은 규칙.
  // 여기서는 3분요약을 넣지 않는다. 말씀 목록은 '말씀을 훑는' 화면이기 때문.
  const playOrder = [...verses].reverse();
  const playItems = verseItemsFor(playOrder);
  const playDur = albumDurText(playItems);

  appEl.innerHTML = `
    ${verses.length ? `<div class="rank-filter album-play vl-play">
      <button id="vl-play-go" class="ab-go">▶️ 전체 듣기${playDur ? ` <span class="ab-dur">${playDur}</span>` : ""}</button>
    </div>` : ""}
    <div id="verse-list" class="verse-grid"></div>
    <button class="home-fab" id="to-summary" aria-label="첫 화면으로">${homeFabLabel(u, true)}</button>
  `;

  const listEl = document.getElementById("verse-list");
  window.scrollTo(0, 0); // 이전 화면의 스크롤 위치가 남지 않도록
  document.getElementById("to-summary").addEventListener("click", () => { albumPlayStop(); renderSummary(); });
  const vlGo = document.getElementById("vl-play-go");
  if (vlGo) vlGo.addEventListener("click", () => albumPlayStart(verseItemsFor(playOrder)));
  const weeklyInfo = getWeeklyVerseInfo();
  const weeklyNo = weeklyInfo && weeklyInfo.verse ? weeklyInfo.verse.no : null;
  const weeklyBadge = weeklyInfo ? weeklyInfo.label : "이번 주";

  const heartMap = loadHearted();

  [...verses].reverse().forEach((v) => {
    const passed = getPassedStage(v.no);
    const status = STATUS_LABEL[passed];
    const isWeekly = v.no === weeklyNo;
    const isHeart = !!heartMap[v.no];

    const card = document.createElement("div");
    card.className = `verse-card ${status.cls}${isWeekly ? " weekly-verse" : ""}${isHeart ? " hearted-verse" : ""}`;
    card.dataset.no = v.no;   // 재생 중인 카드를 짚기 위해
    // 주간·금배지는 좌상단에 나란히(절대배치) — 한 줄 폭에 영향 없어 🔊 아이콘이 밀리지 않는다.
    card.innerHTML = `
      ${isWeekly || isHeart ? `<div class="card-badges">
        ${isWeekly ? `<div class="weekly-list-badge">${weeklyBadge}</div>` : ""}
        ${isHeart ? `<div class="heart-ribbon">👑 마음에 둠</div>` : ""}
      </div>` : ""}
      <div class="verse-no">${String(v.no).padStart(2, "0")}</div>
      <div class="verse-ref">${v.refShort}</div>
      <div class="verse-hint">${v.hintText || ""}</div>
      <div class="verse-status ${status.cls}" data-no="${v.no}" data-base="${status.text}">${status.text}</div>
      <button class="card-listen" aria-label="${v.refShort} 듣기" title="듣기">🔊</button>
    `;
    card.addEventListener("click", () => { albumPlayStop(); startTest(v); });
    // 듣기 버튼: 카드 클릭(테스트 시작)으로 번지지 않게 막고 본문을 읽어준다.
    // 빠르게 N번 클릭하면 N번 반복해서 읽어준다(2번 클릭 → 2번 듣기).
    const listenBtn = card.querySelector(".card-listen");
    let clickCount = 0;
    let clickTimer = null;
    listenBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      clickCount++;
      if (clickTimer) clearTimeout(clickTimer);
      clickTimer = setTimeout(() => {
        speakText(verseSpokenText(v), null, clickCount, verseTtsLang(v));
        clickCount = 0;
      }, 350); // 350ms 안에 연속 클릭한 횟수만큼 반복
    });
    listEl.appendChild(card);
  });

  applyVerseCounts();   // 캐시가 있으면 즉시 반영(재방문 시 깜빡임 없음)
  loadVerseCounts(u);   // 서버에서 최신 횟수 갱신
}

// 📜 핵심 암송 — 본문 목록
function renderPassageList() {
  const u = loadUser();
  const appEl = document.getElementById("app");
  const backLabel = homeFabLabel(u, true);
  appEl.innerHTML = `
    <div id="pg-list" class="pg-list"><div class="pg-empty">불러오는 중…</div></div>
    <button class="home-fab" id="pg-back" aria-label="첫 화면으로">${backLabel}</button>
  `;
  window.scrollTo(0, 0); // 이전 화면의 스크롤 위치가 남지 않도록
  document.getElementById("pg-back").addEventListener("click", renderSummary);
  if (u) { applyVerseCounts(); loadVerseCounts(u); } // 뒤로 버튼의 '· 총 N회'를 일반 목록과 동일하게 채움
  const listEl = document.getElementById("pg-list");
  // 서버 진도를 먼저 병합해 어느 기기에서 열어도 같은 진도가 보이게 한다
  Promise.all([loadPassages(), pullPassageProgress()]).then(([passages]) => {
    if (!passages.length) { listEl.innerHTML = `<div class="pg-empty">아직 등록된 본문이 없어요.</div>`; return; }
    listEl.innerHTML = "";
    passages.forEach((p) => {
      const total = passageChunks(p).length;
      const done = passageDone(p.id).length;
      const complete = passageCompleted(p.id);
      const status = complete ? `<span class="pg-badge done">완료</span>`
        : done > 0 ? `<span class="pg-badge prog">${done}/${total}</span>`
        : `<span class="pg-badge">${total}마디</span>`;
      const card = document.createElement("div");
      card.className = `pg-card${complete ? " complete" : ""}`;
      card.innerHTML = `
        ${complete ? `<div class="card-badges"><div class="heart-ribbon">👑 마음에 둠</div></div>` : ""}
        <div class="pg-card-main">
          <span class="pg-card-title">${p.title}</span>${p.ref ? ` <span class="pg-card-ref">${p.ref}</span>` : ""}
        </div>
        ${status}
        <button class="card-listen" aria-label="${p.title} 듣기" title="듣기">🔊</button>`;
      card.addEventListener("click", () => startPassage(p));
      // 듣기: 카드 클릭(암송 시작)으로 번지지 않게 막고 본문 전체를 읽어준다(연속 클릭 N번 → N번 반복).
      const listenBtn = card.querySelector(".card-listen");
      let clickCount = 0, clickTimer = null;
      listenBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        clickCount++;
        if (clickTimer) clearTimeout(clickTimer);
        clickTimer = setTimeout(() => {
          speakText(`${p.title}. ${passageChunks(p).join(" ")}`, null, clickCount, "ko-KR");
          clickCount = 0;
        }, 350);
      });
      listEl.appendChild(card);
    });
  });
}

// 암송 마디 = 관리자가 입력한 '한 줄'. 관리자가 한 번에 외울 분량을 줄 단위로 직접 정한다.
// (빈 줄은 건너뛴다. 같은 입력→같은 마디로 결정적)
function passageChunks(p) {
  return (p.lines || []).map((s) => String(s || "").trim()).filter(Boolean);
}

// 마디 도우미 — 쉬운 풀이·기억법·영어. 구절 암송 화면(fillVerseHelp)과 같은 탭 UI.
// 서버가 마디당 1회 생성 후 캐시하므로 첫 탭만 잠깐 기다리고, 이후엔 즉시 열린다.
const passageHelpMem = {}; // 같은 세션 안에서 재조회 방지
function mountPassageHelpTabs(cacheKey, load) {
  const el = document.getElementById("help-slot");
  if (!el) return;
  const items = [
    { k: "easy", label: "💡 풀이" },
    { k: "tip",  label: "🧠 기억법" },
    { k: "en",   label: "🌐 영어" },
  ];
  el.innerHTML = `
    <div class="help-tabs">
      ${items.map((i) => `<button class="help-btn" data-k="${i.k}">${i.label}</button>`).join("")}
    </div>
    <div class="help-body" id="help-body" hidden></div>`;
  const body = document.getElementById("help-body");
  el.querySelectorAll(".help-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const wasOn = btn.classList.contains("on");
      el.querySelectorAll(".help-btn").forEach((b) => b.classList.remove("on"));
      if (wasOn) { body.hidden = true; return; }
      btn.classList.add("on");
      let d = passageHelpMem[cacheKey];
      if (!d) {
        body.textContent = "✨ 도우미를 준비하고 있어요… 잠시만요";
        body.hidden = false;
        try { d = await load(); } catch { d = null; }
        if (!d) {
          if (btn.classList.contains("on")) body.textContent = "도우미를 불러오지 못했어요. 잠시 후 다시 눌러주세요.";
          return;
        }
        passageHelpMem[cacheKey] = d;
      }
      if (!btn.classList.contains("on")) return; // 기다리는 사이 다른 탭으로 갔으면 그쪽이 그린다
      body.textContent = d[btn.dataset.k] || "";
      body.hidden = false;
    });
  });
}
// 마디 화면: 그 마디 하나의 도우미
function fillPassageHelp(p, idx) {
  mountPassageHelpTabs(`${p.id}:${idx}`, async () => {
    const d = await api.passageHelp(p.id, idx);
    return d && d.ok ? { easy: d.easy, tip: d.tip, en: d.en } : null;
  });
}
// 전체 이어서 화면: 모든 마디의 도우미를 합쳐서(쉬운 풀이·기억법은 마디 번호 붙여, 영어는 줄로 이어)
function fillPassageFinalHelp(p) {
  mountPassageHelpTabs(`${p.id}:all`, async () => {
    const d = await api.passageHelpAll(p.id);
    if (!d || !d.ok || !Array.isArray(d.items)) return null;
    const num = (k) => d.items.map((x, i) => x && x[k] ? `${i + 1}. ${x[k]}` : null).filter(Boolean).join("\n\n");
    const easy = num("easy"), tip = num("tip");
    const en = d.items.map((x) => x && x.en ? x.en : null).filter(Boolean).join("\n");
    if (!easy && !tip && !en) return null;
    return { easy, tip, en };
  });
}

// 📜 본문 시작 — 첫 미완성 마디부터 자동 진행(카드 탭 한 번이면 끝까지 이어짐)
function startPassage(p) {
  const chunks = passageChunks(p);
  const done = passageDone(p.id);
  const nextIdx = chunks.findIndex((_, i) => !done.includes(i));
  if (nextIdx === -1) renderPassageFinal(p);  // 모든 마디 완료 → 전체 이어서(복습)
  else renderPassageChunk(p, nextIdx);
}

// 📜 마디 하나 암송 — 일반 구절처럼 단계별 빈칸(1단계 25% → 2단계 65% → 3단계 100%).
// 3단계를 마치면 '👑 마음에 둠'을 직접 체크해야 다음 마디로 넘어간다(음성 통과는 3단계로 바로 점프).
function renderPassageChunk(p, idx, stage, heartReady) {
  stopSpeaking();
  stage = stage || 1;
  const appEl = document.getElementById("app");
  const chunks = passageChunks(p);
  const total = chunks.length;
  const text = chunks[idx] || "";
  const tokens = text.trim().split(/\s+/);
  const blankRatio = stage === 1 ? 0.25 : stage === 2 ? 0.65 : 1.0;
  const blankFlags = pickBlankIndices(tokens, blankRatio);
  const blanks = [];
  const wordsHtml = tokens.map((word, i) => {
    if (blankFlags[i]) {
      const bi = blanks.length; blanks.push(word);
      return `<input class="word-input" data-blank="${bi}" data-answer="${word}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" style="width:${Array.from(word).length + 1}em" />`;
    }
    return `<span class="word-fixed">${word}</span>`;
  }).join(" ");
  const answerHtml = tokens.map((word, i) =>
    blankFlags[i] ? `<strong class="ans-word">${word}</strong>` : word
  ).join(" ");
  // 3단계에만: '이 마디를 마음에 두었나이다' 체크. 다 채우기 전엔 비활성(음성 통과 시 heartReady로 바로 활성).
  const heartHtml = stage === 3 ? `
        <label class="heart-check${heartReady ? "" : " locked"}" id="pg-heart-label">
          <span class="heart-row1">
            <input type="checkbox" id="pg-heart-check"${heartReady ? "" : " disabled"} />
            <span class="heart-text">이 마디를 마음에 두었나이다</span>
          </span>
          <span class="heart-hint" id="pg-heart-hint"${heartReady ? " hidden" : ""}>암송을 마치면 체크할 수 있어요</span>
          <span class="heart-desc">이 마디를 <b>외웠다</b>는 뜻이에요. 체크하면 다음 마디로 넘어가요.</span>
        </label>` : "";
  // setupChallengeTyping/setupVoice가 기대하는 verse 유사 객체(영어 아님 → isEnMode=false)
  const chunkVerse = { no: p.id * 1000 + idx, text, refShort: p.title };
  appEl.innerHTML = `
    <div class="test-screen">
      <div class="test-card">
        <div class="btn-row">
          <button class="answer-btn" id="show-answer-btn">보기</button>
          <button class="answer-btn" id="listen-answer-btn" aria-label="정답 음성으로 듣기">🔊 듣기</button>
          <button class="voice-btn" id="voice-toggle">🎤 암송</button>
        </div>
        <div class="pg-hd">
          <div class="pg-hd-top">
            <div class="test-stage">${idx + 1}/${total}마디 · ${stage}단계</div>
            <button class="back-btn" id="pg-line-back">← 목록으로</button>
          </div>
          <div class="pg-hd-title">
            <span class="test-ref">${p.title}</span>
            ${p.ref ? `<span class="pg-hd-scr">📖 ${p.ref}</span>` : ""}
          </div>
        </div>
        <div class="test-sentence">${wordsHtml}</div>
        <div class="challenge-remain" id="ch-remain"></div>
        <div id="result-area"></div>
        <div id="answer-panel" class="answer-panel" hidden>
          <div class="answer-title">정답</div>
          <div class="answer-text">${answerHtml}</div>
          <button class="back-to-test-btn" id="back-to-test-btn">돌아가서 계속하기</button>
        </div>
        <div id="help-slot" class="help-slot"></div>
        ${heartHtml}
        ${stage === 3 ? `<button class="summary-help pg-redo-btn" id="pg-redo">↻ 다시 암송</button>` : ""}
        <div id="voice-panel" class="voice-panel" hidden>
          <div class="voice-status" id="voice-status">🎙️ 듣고 있어요… <b>‘암송 종료’</b>를 누를 때까지 계속 들어요</div>
          <div class="voice-live" id="voice-live"></div>
        </div>
        <div id="voice-result" class="voice-result"></div>
      </div>
    </div>`;
  document.getElementById("pg-line-back").addEventListener("click", () => { stopSpeaking(); renderPassageList(); });
  { const b = document.getElementById("pg-redo"); if (b) b.addEventListener("click", () => { stopSpeaking(); renderPassageChunk(p, idx, 3); }); }
  fillPassageHelp(p, idx); // 마디 도우미 — 쉬운 풀이·기억법·영어(참고)
  setupAnswerToggle();
  const listenBtn = document.getElementById("listen-answer-btn");
  listenBtn.addEventListener("click", () => {
    if (window.speechSynthesis && window.speechSynthesis.speaking) { stopSpeaking(); listenBtn.textContent = "🔊 듣기"; return; }
    listenBtn.textContent = "⏹ 정지";
    speakText(text, () => { listenBtn.textContent = "🔊 듣기"; }, 1, "ko-KR");
  });
  let moved = false;
  let completionMode = heartReady ? "voice" : "typing"; // 마음에 둠을 통계에 기록할 때 쓸 완료 방식
  const enablePassageHeart = () => {
    const chk = document.getElementById("pg-heart-check");
    if (!chk) return;
    chk.disabled = false;
    const lbl = document.getElementById("pg-heart-label"); if (lbl) lbl.classList.remove("locked");
    const hint = document.getElementById("pg-heart-hint"); if (hint) hint.hidden = true;
    if (lbl && lbl.scrollIntoView) lbl.scrollIntoView({ block: "center", behavior: "smooth" });
  };
  const goNextChunk = () => {
    markLineDone(p.id, idx);
    stopSpeaking();
    const nextIdx = chunks.findIndex((_, i) => !passageDone(p.id).includes(i));
    setTimeout(() => {
      if (nextIdx === -1) renderPassageFinal(p);  // 모든 마디 마음에 둠 → 전체 이어서
      else renderPassageChunk(p, nextIdx, 1);       // 다음 마디는 1단계부터
    }, 450);
  };
  const onDone = (mode) => {
    // 모든 단계 통과를 각각 통계(암송)에 1회씩 반영 — 중복 진행 가드 뒤에서 기록
    if (mode === "typing") {
      if (stage < 3) { if (moved) return; moved = true; logPassageActivity("typing"); stopSpeaking(); setTimeout(() => renderPassageChunk(p, idx, stage + 1), 400); return; }
      completionMode = "typing"; logPassageActivity("typing"); enablePassageHeart(); return; // 3단계 다 채움 → '마음에 둠' 체크 활성화(자동 진행 안 함)
    }
    // 음성: 마디를 통째로 외운 것 → 3단계 화면에서 '마음에 둠' 바로 활성화
    completionMode = "voice";
    if (stage < 3) { if (moved) return; moved = true; logPassageActivity("voice"); stopSpeaking(); setTimeout(() => renderPassageChunk(p, idx, 3, true), 400); return; }
    logPassageActivity("voice");
    enablePassageHeart();
  };
  const heartChk = document.getElementById("pg-heart-check");
  if (heartChk) heartChk.addEventListener("change", () => {
    if (!heartChk.checked || moved) return; moved = true;
    const lbl = document.getElementById("pg-heart-label"); if (lbl) lbl.classList.add("on");
    goNextChunk(); // 활동 기록은 단계 통과 시점(onDone)에 이미 반영됨 — 여기서 또 세지 않는다
  });
  setupChallengeTyping(chunkVerse, onDone);
  setupVoice(chunkVerse, 3, onDone);
}

// 📜 전체 이어서 암송 — 모든 절을 이어붙여 100% 빈칸. 통과 시 완료 배지.
function renderPassageFinal(p) {
  stopSpeaking();
  const appEl = document.getElementById("app");
  const lines = p.lines || [];
  // 절별로 한 줄씩, 각 줄의 단어를 빈칸 input으로. 절 경계는 <div class="pg-final-line">로 구분.
  let blankIdx = 0;
  const linesHtml = lines.map((line) => {
    const inputs = line.trim().split(/\s+/).map((word) =>
      `<input class="word-input" data-answer="${word}" data-blank="${blankIdx++}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" style="width:${Array.from(word).length + 1}em" />`
    ).join(" ");
    return `<div class="pg-final-line">${inputs}</div>`;
  }).join("");
  const fullText = lines.join(" ");
  const fullVerse = { no: p.id * 1000, text: fullText, refShort: p.title };
  const answerHtml = lines.map((line) =>
    `<div class="pg-final-line">${line.trim().split(/\s+/).map((w) => `<strong class="ans-word">${w}</strong>`).join(" ")}</div>`
  ).join("");
  appEl.innerHTML = `
    <div class="test-screen">
      <div class="test-card">
        <div class="btn-row">
          <button class="answer-btn" id="show-answer-btn">보기</button>
          <button class="answer-btn" id="listen-answer-btn" aria-label="정답 음성으로 듣기">🔊 듣기</button>
          <button class="voice-btn" id="voice-toggle">🎤 암송</button>
        </div>
        <div class="pg-hd">
          <div class="pg-hd-top">
            <div class="test-stage challenge-badge">🔥 전체</div>
            <button class="back-btn" id="pg-final-back">← 목록으로</button>
          </div>
          <div class="pg-hd-title">
            <span class="test-ref">${p.title}</span>
            ${p.ref ? `<span class="pg-hd-scr">📖 ${p.ref}</span>` : ""}
          </div>
        </div>
        <div class="pg-final-hint">처음부터 끝까지 이어서 외워보세요!</div>
        <div class="test-sentence pg-final-sentence">${linesHtml}</div>
        <div class="challenge-remain" id="ch-remain"></div>
        <div id="result-area"></div>
        <div id="answer-panel" class="answer-panel" hidden>
          <div class="answer-title">정답</div>
          <div class="answer-text pg-final-sentence">${answerHtml}</div>
          <button class="back-to-test-btn" id="back-to-test-btn">돌아가서 계속하기</button>
        </div>
        <div id="help-slot" class="help-slot"></div>
        <label class="heart-check locked" id="pg-final-heart-label">
          <span class="heart-row1">
            <input type="checkbox" id="pg-final-heart-check" disabled />
            <span class="heart-text">이 말씀을 내 마음에 두었나이다</span>
          </span>
          <span class="heart-hint" id="pg-final-heart-hint">전체를 이어서 외우면 체크할 수 있어요</span>
          <span class="heart-desc">처음부터 끝까지 <b>완전히 외웠다</b>는 뜻이에요. 체크하면 '외운 말씀' 배지가 달려요.</span>
        </label>
        <button class="summary-help" id="pg-final-restart" style="margin-top:8px;">↺ 처음으로</button>
        <div id="voice-panel" class="voice-panel" hidden>
          <div class="voice-status" id="voice-status">🎙️ 듣고 있어요… <b>‘암송 종료’</b>를 누를 때까지 계속 들어요</div>
          <div class="voice-live" id="voice-live"></div>
        </div>
        <div id="voice-result" class="voice-result"></div>
      </div>
    </div>`;
  document.getElementById("pg-final-back").addEventListener("click", () => { stopSpeaking(); renderPassageList(); });
  fillPassageFinalHelp(p); // 전체 도우미 — 모든 마디의 쉬운 풀이·기억법·영어 합본
  setupAnswerToggle();
  const listenBtn = document.getElementById("listen-answer-btn");
  listenBtn.addEventListener("click", () => {
    if (window.speechSynthesis && window.speechSynthesis.speaking) { stopSpeaking(); listenBtn.textContent = "🔊 듣기"; return; }
    listenBtn.textContent = "⏹ 정지";
    speakText(fullText, () => { listenBtn.textContent = "🔊 듣기"; }, 1, "ko-KR");
  });
  let finished = false;
  let finalMode = "typing"; // 완주를 통계에 기록할 때 쓸 완료 방식
  const enableFinalHeart = () => {
    const chk = document.getElementById("pg-final-heart-check"); if (!chk) return;
    chk.disabled = false;
    const lbl = document.getElementById("pg-final-heart-label"); if (lbl) lbl.classList.remove("locked");
    const hint = document.getElementById("pg-final-heart-hint"); if (hint) hint.hidden = true;
    if (lbl && lbl.scrollIntoView) lbl.scrollIntoView({ block: "center", behavior: "smooth" });
  };
  // 전체 통과 → 통계(암송) 1회 반영 + '마음에 둠' 활성화(자동 완주 안 함)
  const onDone = (mode) => { finalMode = mode === "voice" ? "voice" : "typing"; logPassageActivity(finalMode); stopSpeaking(); enableFinalHeart(); };
  const heartChk = document.getElementById("pg-final-heart-check");
  if (heartChk) heartChk.addEventListener("change", () => {
    if (!heartChk.checked || finished) return; finished = true;
    const lbl = document.getElementById("pg-final-heart-label"); if (lbl) lbl.classList.add("on");
    markPassageCompleted(p.id); stopSpeaking(); renderPassageDone(p); // 활동 기록은 통과 시점(onDone)에 반영됨
  });
  const restartBtn = document.getElementById("pg-final-restart");
  if (restartBtn) restartBtn.addEventListener("click", async () => {
    if (!(await appConfirm("이 본문의 진행(마음에 둠·완주)을 지우고 처음 마디부터 다시 시작할까요?\n기록 통계에는 영향이 없어요.", { title: "↺ 처음부터 다시", okText: "다시 시작" }))) return;
    resetPassageProgress(p.id); stopSpeaking(); renderPassageChunk(p, 0, 1);
  });
  setupChallengeTyping(fullVerse, onDone);
  setupVoice(fullVerse, 3, onDone);
}

// 📜 완료 축하
function renderPassageDone(p) {
  const appEl = document.getElementById("app");
  appEl.innerHTML = `
    <div class="summary-screen">
      <div class="summary-card cd-card">
        <div class="cd-emoji">👑</div>
        <div class="cd-title">${p.title} 완주!</div>
        <div class="cd-sub">전체를 이어서 외웠어요. 정말 잘하셨어요! 🙌</div>
        <div class="cd-count">'외운 말씀' 배지가 달렸어요.</div>
        <button class="summary-go" id="pg-done-list">다른 본문 보기</button>
        <button class="summary-help" id="pg-done-restart">↺ 처음으로</button>
      </div>
    </div>`;
  document.getElementById("pg-done-list").addEventListener("click", renderPassageList);
  document.getElementById("pg-done-restart").addEventListener("click", async () => {
    if (!(await appConfirm("이 본문의 진행(마음에 둠·완주)을 지우고 처음 마디부터 다시 시작할까요?\n기록 통계에는 영향이 없어요.", { title: "↺ 처음부터 다시", okText: "다시 시작" }))) return;
    resetPassageProgress(p.id); renderPassageChunk(p, 0, 1);
  });
}

// ------------------------------------------------------------
// 화면 3: 테스트 (익명 버전과 동일)
// ------------------------------------------------------------
// 도전 화면은 언제나 3단계(전체 빈칸)다. 힌트를 보고 맞힌 뒤 '다시 암송'도 같은
// 3단계로 열어야 '힌트 보고 맞혔는데 1단계가 나온다'는 어긋남이 없다.
// startTest를 쓰지 않는 이유: 그쪽은 이미 3단계를 마친 구절을 1단계부터 다시 돌린다.
//
// '다시 암송'은 도전에서 잠깐 빠져나온 샛길이다. 돌아오는 길이 없으면
//   · 반복해서 쓰기가 켜져 있을 때 같은 구절이 끝없이 되풀이되고
//   · 꺼져 있어도 이전/다시/다음에 멈춰 도전이 영영 이어지지 않는다.
// 그래서 '자동으로 계속 도전하기' 중에 들어왔다면 마치고 도전으로 돌려보낸다.
let relearnBackToChallenge = false;

function startRelearn(verse) {
  setCardMode(isCardStart());
  relearnBackToChallenge = isAutoChallenge();
  renderTestScreen(verse, 3);
}

// ── 첫 구절 이정표 ──────────────────────────────────────────
// 끝이 어디인지 모르는 일은 그만두기 쉽다. 실제로 3회 이하에서 멈춘 분이 42명이었는데,
// 3회는 한 구절을 마치는 데 필요한 최소 횟수다 — 한 구절도 못 끝내고 떠나셨다는 뜻이다.
// 그래서 '세 걸음 중 몇 걸음째'와 '마치면 무엇이 일어나는지'를 보여 준다.
// 한 구절이라도 3단계까지 마치면 사라진다 — 이미 아는 분께 표지판은 방해다.
function doneVerseCount() {
  try { return verses.filter((v) => getPassedStage(v.no) >= 3).length; } catch (e) { return 1; }
}
function isFirstJourney() { return doneVerseCount() === 0; }
function stepDots(stage) {
  return ` <span class="step-dots">` +
    [1, 2, 3].map((n) => `<i class="step-dot${n <= stage ? " on" : ""}"></i>`).join("") + `</span>`;
}
const STEP_CHEER = { 1: "잘하셨어요! 두 걸음 남았어요", 2: "거의 다 왔어요! 한 걸음 남았어요" };
// 첫 완주 축하 — 지금은 3단계를 마쳐도 버튼만 바뀌어 무엇이 끝났는지 모른 채 지나간다.
const FIRST_DONE_HTML = `
  <div class="first-done">
    <div class="fd-title">🎉 첫 말씀을 마음에 새기셨어요!</div>
    <div class="fd-line">📖 <b>말씀 앨범</b>에 담겼어요</div>
    <div class="fd-line">🔁 잊지 않도록 <b>복습이 예약</b>됐어요</div>
  </div>`;

// 단계를 마쳤을 때 뜨는 메시지 박스.
// 그전에는 마지막 빈칸을 채우면 문장 '아래' result-area에 작은 단추가 생겼다 —
// 긴 구절에 큰 글씨면 화면 밖이고, 키보드가 올라와 있으면 확실히 안 보인다.
// 다 외우고도 끝난 줄 모르고 앉아 계셨다는 뜻이다. 가운데 뜨는 창이면 놓칠 수 없다.
//   · Enter·스페이스 = 기본 단추(1·2단계는 '다음 단계', 3단계는 '다음 말씀')
//   · Escape·바깥 탭 = 그냥 닫기 — 뒤 화면이 그대로라 마음에 둠·말씀 나누기를 계속 쓸 수 있다
//   · 3단계에는 '마음에 둠'을 창 안에 둔다. 밖에 두면 Enter 한 번에 지나쳐 버린다.
function showStageDoneModal(verse, stage, wasFirst) {
  const idx = verses.findIndex((v) => v.no === verse.no);
  const next = (idx >= 0 && idx < verses.length - 1) ? verses[idx + 1] : null;
  const head = stage < 3
    ? `<div class="cheer-icon">✅</div>
       <div class="cheer-ref">${stage}단계 완료!</div>
       ${wasFirst && STEP_CHEER[stage] ? `<div class="cheer-msg">${STEP_CHEER[stage]}</div>` : ""}`
    : `<div class="cheer-icon">🎉</div>
       <div class="cheer-ref">다 외우셨어요!</div>
       ${wasFirst ? FIRST_DONE_HTML : ""}`;
  // 마지막 말씀이면 다음이 없다. 그때 '목록으로'를 쓰면 아래 단추와 똑같은 것이 둘이 된다 —
  // 처음 말씀으로 돌려보내 한 바퀴를 잇는다.
  const first = (!next && verses.length > 1) ? verses[0] : null;
  const mainLabel = stage < 3 ? `${stage + 1}단계로 계속하기`
    : next ? "다음 말씀 ▶" : (first ? "↺ 처음 말씀으로" : "목록으로");

  // 도전에는 이 앱의 '함께'가 모여 있다(순위·응원·어려운 도전). 그런데 4명 중 3명이
  // 한 번도 들어와 보지 않았다 — 2026-08-25 기준 오늘 33명 중 8명(24%)뿐.
  // 첫 화면에 큰 단추가 있는데도 안 누르신다. 그래서 '막 한 구절을 다 외운 그 순간',
  // 가장 자신 있을 때 권한다. 흐름을 끊지 않는 자리다.
  //   · 마친 구절이 3개는 되어야 한다(도전거리가 있어야 한다)
  //   · 오늘 이미 도전하셨으면 권하지 않는다(매일 하시는 분께는 잔소리다)
  const doneN = doneVerseCount();
  const invite = stage >= 3 && doneN >= 3 && todayChallengeCount() === 0;

  const wrap = document.createElement("div");
  wrap.className = "cheer-overlay stage-done";
  wrap.innerHTML = `
    <div class="cheer-card" role="dialog" aria-modal="true">
      ${head}
      ${stage >= 3 ? heartCheckHtml(verse, "-m") : ""}
      <button class="cheer-ok" id="sd-main">${mainLabel}</button>
      ${invite ? `<button class="sd-challenge" id="sd-challenge">🔥 외운 ${doneN}구절로 도전해 보기
        <span>외운 구절이 하나씩 무작위로 나와요</span></button>` : ""}
      <div class="sd-sub">
        <button class="sd-btn" id="sd-again">${stage < 3 ? "이 단계 다시" : "다시 암송"}</button>
        <button class="sd-btn" id="sd-list">목록으로</button>
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
  const main = () => go(stage < 3
    ? () => renderTestScreen(verse, stage + 1)
    : next ? () => startTest(next)
    : first ? () => startTest(first)
    : renderVerseList);
  const onKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key !== "Enter" && e.key !== " ") return;
    // 체크박스에 손이 가 있으면 그 체크를 먼저 존중한다(스페이스로 켜고 끄는 중일 수 있다)
    const ae = document.activeElement;
    if (ae && ae.type === "checkbox") return;
    e.preventDefault();
    e.stopPropagation();
    main();
  };
  document.addEventListener("keydown", onKey, true);

  const mainBtn = document.getElementById("sd-main");
  mainBtn.addEventListener("click", main);
  document.getElementById("sd-again").addEventListener("click",
    () => go(() => renderTestScreen(verse, stage < 3 ? stage : 3)));
  document.getElementById("sd-list").addEventListener("click", () => go(renderVerseList));
  const chBtn = document.getElementById("sd-challenge");
  if (chBtn) chBtn.addEventListener("click", () => go(startChallenge));
  wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });
  setupHeartCheck(verse, "-m", true);
  const focus = () => { try { mainBtn.focus({ preventScroll: true }); } catch (e) { mainBtn.focus(); } };
  focus();
  setTimeout(focus, 80);   // 키보드가 내려가며 초점을 뺏길 수 있어 한 번 더
}

function startTest(verse) {
  setCardMode(isCardStart()); // 기본은 '쓰기' — 설정에서 「카드로 시작」을 켜 두신 분만 카드로
  relearnBackToChallenge = false;
  const passed = getPassedStage(verse.no);   // 지금 고른 언어의 단계
  // 마음에 둔 구절은 곧바로 3단계(전체 빈칸)로 — 체크 해제도 여기서 바로 가능.
  // 단, 그 언어로 3단계를 마쳤을 때만. 한글로 마음에 두었어도 영어는 처음부터 한다.
  if (isHearted(verse.no) && passed >= 3) return renderTestScreen(verse, 3);
  const startStage = passed >= 3 ? 1 : passed + 1;
  renderTestScreen(verse, startStage);
}

// ------------------------------------------------------------
// 설교 요약(말씀 아카이브 연동, 읽기 전용) — 암송 화면 설교 연결에서 참조
//   getSermons 1회 로드 → memVerseNo로 이번 구절과 매칭. 요약이 있는 구절만 버튼 노출.
// ------------------------------------------------------------
let sermonsCache = null; // [{ memVerseNo, scripture, summary, title, ... }]

async function loadSermons() {
  if (sermonsCache) return sermonsCache;
  if (!window.api || !api.getSermons) return [];
  try {
    const d = await api.getSermons();
    sermonsCache = (d && d.sermons) || [];
  } catch { sermonsCache = []; }
  return sermonsCache;
}
// 이번 구절(no)에 대응하는 설교 중 요약이 있는 것
function findSermonForVerse(no, sermons) {
  return (sermons || []).find((s) => s.memVerseNo === no && s.summary);
}

// 암송 화면 설교 배너 옆 '설교 요약 보기' 버튼을 비동기로 채운다(있을 때만).
// onBack 생략 시 renderTestScreen(verse, stage)로 복귀(기존 동작) — 복습/도전 화면은 자기 화면으로 돌아오게 onBack을 넘긴다.
function fillSermonSummaryBtn(verse, stage, onBack) {
  const slot = document.getElementById("sermon-summary-slot");
  if (!slot) return;
  loadSermons().then((sermons) => {
    const s = findSermonForVerse(verse.no, sermons);
    if (!s || !document.getElementById("sermon-summary-slot")) return;
    slot.innerHTML = `<button class="sc-btn sc-summary" id="sermon-summary-btn">📄 요약보기</button>`;
    document.getElementById("sermon-summary-btn")
      .addEventListener("click", () =>
        renderSermonSummary(verse, s, onBack || (() => renderTestScreen(verse, stage)), "← 암송으로"));
  });
}

// 설교 연결 배너 — 주제(제목) + [영상보기][요약보기]. 요약 버튼은 fillSermonSummaryBtn이 있을 때만 채운다.
function sermonConnectHtml(verse) {
  return `
    <div class="sermon-connect">
      ${verse.sermonTitle ? `<div class="sc-topic"><span class="sc-topic-label">📖 설교</span><span class="sc-topic-title">${verse.sermonTitle}</span></div>` : ""}
      <div class="sc-buttons">
        ${verse.url
          ? `<a class="sc-btn sc-watch" href="${verse.url}" target="_blank" rel="noopener">▶️ 영상보기</a>`
          : `<span class="sc-btn sc-soon">⏳ 영상 준비 중</span>`}
        <span id="sermon-summary-slot"></span>
      </div>
    </div>`;
}

// "내 마음에 두었나이다" 체크 블록 — 완전 암송 표시(👑 금배지). 3단계(=전체 빈칸) 화면에서만 의미가 있다.
// sfx: 같은 체크박스를 화면과 메시지 박스 두 곳에 둘 때 id가 부딪히지 않게 하는 꼬리표.
function heartCheckHtml(verse, sfx) {
  const s = sfx || "";
  const heartOn = isHearted(verse.no);
  return `
        <label class="heart-check${heartOn ? " on" : ""}" id="heart-label${s}">
          <span class="heart-row1">
            <input type="checkbox" id="heart-check${s}" ${heartOn ? "checked" : ""} />
            <span class="heart-text">이 말씀을 내 마음에 두었나이다</span>
          </span>
          <span class="heart-desc">이 말씀을 <b>완전히 암송했다</b>는 뜻이에요. 체크하면 목록에 👑 금배지가 달리고, 다음부터 바로 3단계로 시작해요.</span>
        </label>`;
}
// heartCheckHtml로 그려진 체크박스에 토글 동작을 연결(공통 로직)
function setupHeartCheck(verse, sfx, silent) {
  const s = sfx || "";
  const heartInput = document.getElementById("heart-check" + s);
  if (!heartInput) return;
  heartInput.addEventListener("change", () => {
    setHearted(verse.no, heartInput.checked);
    const lab = document.getElementById("heart-label" + s);
    if (lab) lab.classList.toggle("on", heartInput.checked);
    // 화면과 메시지 박스에 같은 체크박스가 둘 있을 수 있다 — 한쪽을 누르면 다른 쪽도 따라간다.
    const os = s ? "" : "-m";
    const other = document.getElementById("heart-check" + os);
    if (other && other.checked !== heartInput.checked) {
      other.checked = heartInput.checked;
      const ol = document.getElementById("heart-label" + os);
      if (ol) ol.classList.toggle("on", heartInput.checked);
    }
    // ⚠️ 메시지 박스 안에서는 축하창을 겹쳐 띄우지 않는다(silent).
    //    창이 두 겹이 되면 둘 다 캡처 단계에서 키를 들어서, Enter 한 번에 둘 다 닫히고
    //    뜻하지 않게 다음 구절로 넘어간다.
    if (heartInput.checked && !silent) showHeartCheer(verse);
  });
}

// 말씀 연상 그림 — 구절 번호 → 그림 설명(= alt 텍스트).
//   키가 있으면 img/verse/<번호>.webp 가 있다는 뜻이라 파일 목록을 따로 두지 않는다.
//   값은 화면 낭독기가 읽고, 그림을 못 불러올 때 대신 보인다. 그래서 프롬프트가 아니라
//   실제로 그려진 그림을 보고 적는다(30번은 '덮어 둔 편지'를 시켰지만 빈 편지지가 나왔다).
//   그림을 새로 넣으면 여기 한 줄을 더한다. 화풍·프롬프트는 img/verse/prompts.md.
const VERSE_IMG = {
  1: "밤 돌계단 위, 몇 걸음만 비추는 작은 등불",
  2: "언덕 위 홀로 선 올리브나무",
  3: "나무 받침대에 펼쳐진 빈 두루마리",
  4: "사막 위로 솟아오른 구름기둥, 은은히 빛나는 밑동",
  5: "풀밭에서 홀로 떨어져 선 흰 백합",
  6: "열린 감옥 문 옆에 놓인 열쇠",
  7: "나무 탁자 위에 펼쳐진 짙은 보라색 옷감",
  8: "구름 바다 위로 솟은 산봉우리",
  9: "사막 바위 사이로 먼 산을 향해 난 좁은 길",
  10: "나무 탁자 위에 놓인 매끈한 동전 하나",
  11: "언덕 위 바위에 기대어 선 목자의 지팡이",
  12: "바람에 흔들려도 꺼지지 않는 촛불",
  13: "문가에 홀로 선 어린 나귀와 느슨히 묶인 밧줄",
  14: "굴려 열린 무덤 입구의 둥근 돌",
  15: "포도나무에 묵직하게 매달린 포도송이",
  16: "달빛 아래 땅에 꽂힌 창과 물병",
  17: "시냇가에 뿌리를 드러내고 굳건히 선 나무",
  18: "건축 부지에 가지런히 쌓인 다듬은 돌과 목재",
  19: "꽃 핀 나뭇가지 둥지에 놓인 알 하나",
  20: "마른 강바닥 한가운데 흔들림 없이 놓인 돌",
  21: "작은 그릇에서 피어오르는 향 연기",
  22: "고요한 물 위로 겹겹이 퍼져 나가는 물결",
  23: "새벽 항구에 정박한 배의 돛대와 접힌 돛",
  24: "커튼이 흔들리며 빛이 스며드는 열린 창문",
  25: "무성한 정원 속, 금빛 열매가 달린 나무",
  26: "돌 선반 위 열린 나무 상자, 안에서 새어 나오는 금빛",
  27: "새벽 물가에 널어 말리는 빈 그물",
  28: "새벽 하늘을 거울처럼 비추는 잔잔한 호수",
  29: "작은 화단 옆에 놓인 낡은 장갑과 원예 도구",
  30: "펼쳐진 빈 편지지와 그 옆에 김이 오르는 찻잔 둘",
  31: "가느다란 나뭇가지에 앉은 참새 한 마리",
  32: "겉껍질이 갈라져 속의 붉은 씨가 드러난 석류 한 알",
  33: "새벽 호숫가에 놓인 빈 나무 의자",
  34: "새벽빛이 든 들길이 언덕 너머로 곧게 이어진 풍경",
  35: "다림줄에 매달려 고요히 멈춘 추와 발치에 놓인 주춧돌",
};

// 화풍 비교용 — 1번 구절에만 있다(2026-08-28, 수채·먹선 외에 구아슈·색연필 화풍도
// 시험해 보려고 둠). 다른 33장은 이 표에 없으니 기존과 똑같이 그림 한 장만 뜬다.
const VERSE_IMG_MORE = {
  1: [
    { file: "1b", alt: "구아슈·색연필 화풍 — 어두운 숲 돌계단 아래, 등불이 놓인 넓은 장면" },
    { file: "1c", alt: "구아슈·색연필 화풍 — 유리 등피가 있는 기름등이 돌길을 밝히는 가까운 장면" },
  ],
  3: [
    { file: "3b", alt: "구아슈·색연필 화풍 — 나무 탁자 위에 펼쳐진 빈 두루마리" },
    { file: "3c", alt: "구아슈·색연필 화풍 — 끈으로 묶어 만 두루마리" },
  ],
  2: [
    { file: "2b", alt: "구아슈·색연필 화풍 — 노을 진 언덕 위 올리브나무, 멀리 펼쳐진 들판" },
    { file: "2c", alt: "구아슈·색연필 화풍 — 올리브나무를 가까이서 본 장면, 뒤로 물든 들판" },
  ],
  4: [
    { file: "4c", alt: "구아슈·색연필 화풍 — 노을 든 하늘 아래 사막 위로 솟은 구름기둥" },
    { file: "4b", alt: "구아슈·색연필 화풍 — 노을 진 사막 위로 솟은 구름기둥" },
  ],
  5: [
    { file: "5b", alt: "구아슈·색연필 화풍 — 마른 풀밭 사이 홀로 핀 백합" },
    { file: "5c", alt: "구아슈·색연필 화풍 — 하늘을 배경으로 곧게 선 백합" },
  ],
  6: [
    { file: "6b", alt: "구아슈·색연필 화풍 — 빗장 열린 감옥 문과 바닥에 놓인 열쇠" },
    { file: "6c", alt: "구아슈·색연필 화풍 — 열린 문 안쪽 깊숙이까지 보이는 장면" },
  ],
  7: [
    { file: "7b", alt: "구아슈·색연필 화풍 — 창가 나무 탁자에 펼쳐진 보라색 옷감" },
    { file: "7c", alt: "구아슈·색연필 화풍 — 나무 탁자에 펼쳐 늘어뜨린 보라색 옷감" },
  ],
  8: [
    { file: "8b", alt: "구아슈·색연필 화풍 — 구름 바다 위에 홀로 솟은 산봉우리, 넓은 장면" },
    { file: "8c", alt: "구아슈·색연필 화풍 — 노을 속 산봉우리를 가까이서 본 장면" },
  ],
  9: [
    { file: "9b", alt: "구아슈·색연필 화풍 — 바위 사이로 먼 산까지 이어진 낮의 사막 길" },
    { file: "9c", alt: "구아슈·색연필 화풍 — 해가 떠 있는 하늘 아래 굽이진 사막 길" },
  ],
  10: [
    { file: "10b", alt: "구아슈·색연필 화풍 — 나무 탁자 위 매끈한 동전" },
    { file: "10c", alt: "구아슈·색연필 화풍 — 나무 탁자 위에 놓인 매끈한 동전" },
  ],
  11: [
    { file: "11b", alt: "구아슈·색연필 화풍 — 바위에 기댄 지팡이와 내려다보이는 골짜기" },
    { file: "11c", alt: "구아슈·색연필 화풍 — 바위에 기댄 지팡이와 내려다보이는 골짜기" },
  ],
  12: [
    { file: "12c", alt: "구아슈·색연필 화풍 — 어둠 속에서 녹아내리는 촛불" },
    { file: "12b", alt: "구아슈·색연필 화풍 — 어둠 속에서 녹아내리며 타는 촛불" },
  ],
  13: [
    { file: "13c", alt: "구아슈·색연필 화풍 — 문가에 선 어린 나귀를 가까이서 본 장면" },
    { file: "13b", alt: "구아슈·색연필 화풍 — 나무 울타리 옆에 선 어린 나귀와 감긴 밧줄" },
  ],
  14: [
    { file: "14b", alt: "구아슈·색연필 화풍 — 열린 무덤 입구를 조금 떨어져서 본 장면" },
    { file: "14c", alt: "구아슈·색연필 화풍 — 무덤 입구를 가까이서 본 장면, 어둠 속으로 빛이 스밈" },
  ],
  15: [
    { file: "15b", alt: "구아슈·색연필 화풍 — 잎이 무성한 포도나무에 매달린 포도송이" },
    { file: "15c", alt: "구아슈·색연필 화풍 — 포도송이를 가까이서 본 장면" },
  ],
  16: [
    { file: "16b", alt: "구아슈·색연필 화풍 — 달빛 아래 천막이 보이는 진영, 창과 물병" },
    { file: "16c", alt: "구아슈·색연필 화풍 — 달빛 아래 땅에 꽂힌 창과 물병" },
  ],
  17: [
    { file: "17b", alt: "구아슈·색연필 화풍 — 잎이 무성한 나무와 굽이치는 시냇물" },
    { file: "17c", alt: "구아슈·색연필 화풍 — 잎이 진 나무의 뿌리와 시냇물을 가까이서 본 장면" },
  ],
  18: [
    { file: "18b", alt: "구아슈·색연필 화풍 — 숲 앞에 쌓인 돌과 목재, 낮의 장면" },
    { file: "18c", alt: "구아슈·색연필 화풍 — 나무숲을 배경으로 쌓인 돌과 목재" },
  ],
  19: [
    { file: "19b", alt: "구아슈·색연필 화풍 — 꽃 핀 가지에 놓인 둥지, 넓은 장면" },
    { file: "19c", alt: "구아슈·색연필 화풍 — 알을 품은 둥지를 가까이서 본 장면" },
  ],
  20: [
    { file: "20b", alt: "구아슈·색연필 화풍 — 소용돌이 무늬 진흙 바닥에 놓인 돌" },
    { file: "20c", alt: "구아슈·색연필 화풍 — 마른 강바닥의 돌을 가까이서 본 장면" },
  ],
  21: [
    { file: "21b", alt: "구아슈·색연필 화풍 — 그릇에서 피어오르는 향 연기, 넓은 장면" },
    { file: "21c", alt: "구아슈·색연필 화풍 — 금빛 빛무리 속으로 오르는 향 연기" },
  ],
  22: [
    { file: "22b", alt: "구아슈·색연필 화풍 — 고요한 물 위로 퍼지는 물결" },
    { file: "22c", alt: "구아슈·색연필 화풍 — 물결을 더 가까이서 본 장면" },
  ],
  23: [
    { file: "23b", alt: "구아슈·색연필 화풍 — 돛대에 묶인 접힌 돛을 가까이서 본 장면" },
    { file: "23c", alt: "구아슈·색연필 화풍 — 노을 진 항구에서 본 돛대와 돛" },
  ],
  24: [
    { file: "24b", alt: "구아슈·색연필 화풍 — 화분과 커튼이 있는 창가를 가까이서 본 장면" },
    { file: "24c", alt: "구아슈·색연필 화풍 — 의자가 놓인 방 전체를 본 장면" },
  ],
  25: [
    { file: "25b", alt: "구아슈·색연필 화풍 — 금빛 열매 달린 나무와 주변 들판" },
    { file: "25c", alt: "구아슈·색연필 화풍 — 나무를 가까이서 본 장면, 무성한 수풀" },
  ],
  26: [
    { file: "26b", alt: "구아슈·색연필 화풍 — 이끼 낀 돌 위에 놓인 열린 나무 상자" },
    { file: "26c", alt: "구아슈·색연필 화풍 — 돌담 위 나무 상자를 가까이서 본 장면" },
  ],
  27: [
    { file: "27b", alt: "구아슈·색연필 화풍 — 노을 진 바닷가에 널린 그물, 넓은 장면" },
    { file: "27c", alt: "구아슈·색연필 화풍 — 그물을 가까이서 본 장면, 바위와 노을" },
  ],
  28: [
    { file: "28b", alt: "구아슈·색연필 화풍 — 노을 하늘을 비추는 잔잔한 호수" },
    { file: "28c", alt: "구아슈·색연필 화풍 — 새벽 숲을 비추는 잔잔한 호수" },
  ],
  29: [
    { file: "29b", alt: "구아슈·색연필 화풍 — 꽃밭 옆에 놓인 장갑과 도구, 넓은 장면" },
    { file: "29c", alt: "구아슈·색연필 화풍 — 장갑과 갈퀴를 가까이서 본 장면" },
  ],
  30: [
    { file: "30b", alt: "구아슈·색연필 화풍 — 나무 탁자 위 편지와 찻잔 둘" },
    { file: "30c", alt: "구아슈·색연필 화풍 — 봉투와 머그잔 둘이 놓인 탁자, 의자가 보이는 장면" },
  ],
  31: [
    { file: "31b", alt: "구아슈·색연필 화풍 — 가지에 앉은 참새를 가까이서 본 장면" },
    { file: "31c", alt: "구아슈·색연필 화풍 — 하늘을 배경으로 가지에 앉은 참새" },
  ],
  32: [
    { file: "32c", alt: "구아슈·색연필 화풍 — 갈라진 석류를 가까이서 본 장면" },
    { file: "32b", alt: "구아슈·색연필 화풍 — 갈라져 붉은 씨가 드러난 석류" },
  ],
  33: [
    { file: "33b", alt: "구아슈·색연필 화풍 — 새벽빛 호숫가에 놓인 빈 의자" },
    { file: "33c", alt: "구아슈·색연필 화풍 — 노을 진 물가에 놓인 빈 나무 의자" },
  ],
  34: [
    { file: "34b", alt: "구아슈·색연필 화풍 — 노을 지는 언덕 너머로 이어진 들길" },
    { file: "34c", alt: "구아슈·색연필 화풍 — 해가 떠오르는 들판 사이 굽이진 길" },
  ],
  35: [
    { file: "35b", alt: "구아슈·색연필 화풍 — 새벽 하늘 아래 드리운 다림줄과 주춧돌" },
    { file: "35c", alt: "구아슈·색연필 화풍 — 다림줄 추를 가까이서 본 장면" },
  ],
};

// 암송 도우미 — '쉬운 풀이'(구절 뜻을 쉬운 말로) · '기억법'(외우는 요령).
//   말씀 아카이브에 설교 등록 시 미리 생성돼 sermons에 저장된 내용을 읽어와,
//   암송 화면에서 접었다 펴는 형태로 보여준다(필요할 때만 펴니 화면을 차지하지 않음).
function fillVerseHelp(verse, opts) {
  if (!document.getElementById("help-slot")) return;
  loadSermons().then((sermons) => {
    const s = (sermons || []).find(
      (x) => x.memVerseNo === verse.no && (x.easyExplain || x.memoryTip));
    const el = document.getElementById("help-slot");
    if (!el) return;

    const items = [];
    if (s && s.easyExplain) items.push({ k: "easy", label: "💡 풀이", text: s.easyExplain });
    if (s && s.memoryTip)   items.push({ k: "tip",  label: "🧠 기억법",   text: s.memoryTip });
    // 지금 암송 중인 언어의 반대쪽을 살짝 보여준다 — 한글 화면엔 영어를, 영어 화면엔 한글을
    if (hasEn(verse)) {
      items.push(isEnMode(verse)
        ? { k: "ko", label: "🇰🇷 한글", text: verse.text }
        : { k: "en", label: "🌐 영어", text: verse.textEn });
    }
    // 🖼️ 그림 — 말씀을 장면으로 붙잡게 하는 도우미. 글자가 없어 언어와 무관하다.
    //   그림이 있는 구절만 탭이 뜬다(풀이가 없으면 풀이 탭이 없는 것과 같은 규칙).
    //   ⚠️ 아래 items.length 검사보다 먼저다 — 뒤에 두면 설교 도우미가 없는 구절에서
    //      함수가 먼저 빠져나가 그림 탭까지 함께 사라진다.
    if (VERSE_IMG[verse.no]) items.push({ k: "img", label: "🖼️ 그림" });
    if (!items.length) return;

    el.innerHTML = `
      <div class="help-tabs">
        ${items.map((i) => `<button class="help-btn" data-k="${i.k}">${i.label}</button>`).join("")}
      </div>
      <div class="help-body" id="help-body" hidden></div>`;

    const body = document.getElementById("help-body");
    el.querySelectorAll(".help-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const wasOn = btn.classList.contains("on");
        el.querySelectorAll(".help-btn").forEach((b) => b.classList.remove("on"));
        if (wasOn) { body.hidden = true; return; }   // 같은 버튼 다시 누르면 접기
        btn.classList.add("on");
        // '도움 받음'은 도전 화면에서만 센다 — 이 함수는 암송·복습 화면도 함께 쓰므로,
        // 거기서 연 기억법까지 세면 엉뚱한 구절이 '다시 암송' 대상이 된다.
        //   🖼️ 그림도 세지 않는다 — 답을 알려 주지 않고 뜻을 떠올리게 할 뿐이다(💡 풀이와 같은 쪽).
        if (btn.dataset.k === "tip" && opts && opts.forChallenge) challengeUsedHelp = true;
        const item = items.find((i) => i.k === btn.dataset.k) || {};
        body.innerHTML = "";
        if (item.k === "img") {
          // 탭을 누른 지금에야 받는다 — 화면에 들어올 때 미리 받으면 첫 실행이
          // 무거워진다(글꼴 CSS 765KB 사건과 같은 길, 2026-08-27).
          // VERSE_IMG_MORE가 없는 33장은 imgs.length===1이라 예전과 똑같이 한 장만 뜬다.
          const imgs = [{ file: String(verse.no), alt: VERSE_IMG[verse.no] },
                        ...(VERSE_IMG_MORE[verse.no] || [])];
          let idx = 0;
          const img = document.createElement("img");
          img.className = "help-img";
          const showImg = () => {
            img.alt = imgs[idx].alt;
            img.src = `img/verse/${imgs[idx].file}.webp?v=${APP_BUILD}`;
          };
          img.addEventListener("error", () => {
            const msg = document.createElement("div");
            msg.textContent = "그림을 불러오지 못했어요.";
            img.replaceWith(msg);
          });
          showImg();
          body.appendChild(img);
          if (imgs.length > 1) {
            const nav = document.createElement("button");
            nav.type = "button";
            nav.className = "help-img-next";
            const label = () => { nav.textContent = `🔄 보기 (${idx + 1}/${imgs.length})`; };
            label();
            nav.addEventListener("click", () => {
              idx = (idx + 1) % imgs.length;
              showImg();
              label();
            });
            body.appendChild(nav);
          }
          body.hidden = false;
          return;
        }
        const textEl = document.createElement("div");
        textEl.textContent = item.text || "";
        body.appendChild(textEl);
        if (item.k === "en") {
          const attr = document.createElement("div");
          attr.className = "niv-attribution";
          attr.textContent = NIV_ATTRIBUTION_TEXT;
          body.appendChild(attr);
        }
        body.hidden = false;
      });
    });
  });
}

// 이번주 말씀 카드에서도 요약을 열 수 있게 — 뒤로는 요약 화면으로
function fillWeeklySummaryBtn(verse) {
  if (!verse || !document.getElementById("weekly-summary-slot")) return;
  loadSermons().then((sermons) => {
    const s = findSermonForVerse(verse.no, sermons);
    const el = document.getElementById("weekly-summary-slot");
    if (!s || !el) return;
    el.outerHTML = `<button class="weekly-secondary" id="weekly-summary">요약보기</button>`;
    document.getElementById("weekly-summary")
      .addEventListener("click", () => renderSermonSummary(verse, s, renderSummary, "← 뒤로"));
  });
}

// 한글 책이름 → 대한성서공회 성경 코드(OSIS 소문자). scripture "이사야 26:1-7"을
// 개역개정(GAE) 본문 페이지로 링크하기 위한 매핑.
const BOOK_CODE = {
  창세기:"gen", 출애굽기:"exo", 레위기:"lev", 민수기:"num", 신명기:"deu",
  여호수아:"jos", 사사기:"jdg", 룻기:"rut", 사무엘상:"1sa", 사무엘하:"2sa",
  열왕기상:"1ki", 열왕기하:"2ki", 역대상:"1ch", 역대하:"2ch", 에스라:"ezr",
  느헤미야:"neh", 에스더:"est", 욥기:"job", 시편:"psa", 잠언:"pro",
  전도서:"ecc", 아가:"sng", 이사야:"isa", 예레미야:"jer", 예레미야애가:"lam",
  에스겔:"ezk", 다니엘:"dan", 호세아:"hos", 요엘:"jol", 아모스:"amo",
  오바댜:"oba", 요나:"jon", 미가:"mic", 나훔:"nam", 하박국:"hab",
  스바냐:"zep", 학개:"hag", 스가랴:"zec", 말라기:"mal",
  마태복음:"mat", 마가복음:"mrk", 누가복음:"luk", 요한복음:"jhn", 사도행전:"act",
  로마서:"rom", 고린도전서:"1co", 고린도후서:"2co", 갈라디아서:"gal", 에베소서:"eph",
  빌립보서:"php", 골로새서:"col", 데살로니가전서:"1th", 데살로니가후서:"2th",
  디모데전서:"1ti", 디모데후서:"2ti", 디도서:"tit", 빌레몬서:"phm", 히브리서:"heb",
  야고보서:"jas", 베드로전서:"1pe", 베드로후서:"2pe", 요한일서:"1jn", 요한이서:"2jn",
  요한삼서:"3jn", 유다서:"jud", 요한계시록:"rev",
};

// scripture(예: "마태복음 13:24-30 (가라지 비유)") → 개역개정 본문 URL. 파싱 실패 시 null.
function scriptureUrl(scripture) {
  const m = String(scripture || "").match(/^\s*([가-힣]+)\s*(\d+)\s*:/);
  if (!m) return null;
  const code = BOOK_CODE[m[1]];
  if (!code) return null;
  return `https://www.bskorea.or.kr/bible/korbibReadpage.php?version=GAE&book=${code}&chap=${m[2]}`;
}

// onBack: 뒤로 눌렀을 때 돌아갈 화면(암송 화면 / 요약 화면)
function renderSermonSummary(verse, sermon, onBack, backLabel) {
  stopSpeaking();
  const appEl = document.getElementById("app");
  const points = Array.isArray(sermon.points) ? sermon.points : [];
  const pointsHtml = points.length ? `
        <section class="ss-section">
          <div class="ss-label">핵심 포인트</div>
          <ol class="ss-points">
            ${points.map((p, i) => `
              <li>
                <div class="ss-point-top">
                  <span class="ss-point-no">${i + 1}</span>
                  <h3 class="ss-point-head">${boardEsc(p.heading || "")}</h3>
                </div>
                <p class="ss-point-body">${scEmphasis(p.body || "")}</p>
              </li>`).join("")}
          </ol>
        </section>` : "";

  // 예배일·설교자 — 있는 것만 눈썹 정보로(맥락 제공)
  const meta = [
    sermon.date ? String(sermon.date).replace(/-/g, ".") : "",
    sermon.preacher || "",
  ].filter(Boolean).join(" · ");

  appEl.innerHTML = `
    <div class="test-screen">
      <div class="test-card sermon-sum-card">
        <div class="ss-top">
          <button class="ss-read" id="ss-read">🔊 3분요약</button>
          <button class="back-btn" id="ss-back">${backLabel || "← 뒤로"}</button>
        </div>
        <header class="ss-head">
          ${meta ? `<div class="ss-meta">${boardEsc(meta)}</div>` : ""}
          ${sermon.title ? `<h2 class="ss-title">${boardEsc(sermon.title)}</h2>` : ""}
        </header>
        ${sermon.scripture ? `
        <section class="ss-section">
          <div class="ss-label">성경말씀</div>
          ${(() => {
            const url = scriptureUrl(sermon.scripture);
            const inner = `<span class="ss-scripture-ref">${boardEsc(sermon.scripture)}</span>`;
            return url
              ? `<a class="ss-scripture ss-scripture-link" href="${url}" target="_blank" rel="noopener">
                   ${inner}<span class="ss-scripture-ext">개역개정 ↗</span>
                 </a>`
              : `<div class="ss-scripture">${inner}</div>`;
          })()}
        </section>` : ""}
        <section class="ss-section">
          <div class="ss-label">설교 요약</div>
          <blockquote class="ss-summary">${scEmphasis(sermon.summary)}</blockquote>
        </section>
        ${pointsHtml}
        ${sermon.conclusion ? `
        <section class="ss-section">
          <div class="ss-label">맺음말</div>
          <blockquote class="ss-summary ss-conclusion">${scEmphasis(sermon.conclusion)}</blockquote>
        </section>` : ""}
      </div>
    </div>`;
  document.getElementById("ss-back").addEventListener("click", onBack);

  // 화면에 보이는 그대로(제목 → 요약 → 핵심 포인트) 읽어준다. **강조 별표**는 음성에서 제거.
  const readText = [
    sermon.title || "",
    sermon.summary || "",
    points.length ? "핵심 포인트." : "",
    ...points.map((p, i) => `${i + 1}. ${p.heading || ""}. ${p.body || ""}`),
    sermon.conclusion ? `맺음말. ${sermon.conclusion}` : "",
  ].filter(Boolean).join("\n").replace(/\*\*/g, "");

  const readBtn = document.getElementById("ss-read");
  const audioUrl = sermon.audio ? (SERMON_AUDIO_BASE + sermon.audio + "?v3") : null;
  const IDLE = "🔊 3분요약";    // 재생 전/일시정지 상태
  const PLAYING = "⏸ 멈춤";     // 재생 중
  readBtn.addEventListener("click", () => {
    if (audioUrl) {
      // 3분 요약 MP3 — 멈춤(위치 유지)/이어재생 토글
      if (sermonAudio && sermonAudio.src && !sermonAudio.paused) {
        stopSermonAudio(); readBtn.textContent = IDLE; return;   // 재생 중 → 멈춤(위치 유지)
      }
      readBtn.textContent = PLAYING;
      playSermonAudio(audioUrl, () => { readBtn.textContent = IDLE; }); // 처음/이어재생
    } else {
      // MP3 없는 설교는 브라우저 TTS 폴백 — 멈춤/이어읽기 토글
      const ss = window.speechSynthesis;
      if (ss && ss.speaking && !ss.paused) {   // 읽는 중 → 멈춤(일시정지)
        _ttsStopKeepAlive(); try { ss.pause(); } catch (e) {}
        readBtn.textContent = IDLE; return;
      }
      if (ss && ss.paused) {                    // 멈춤 상태 → 이어읽기
        try { ss.resume(); } catch (e) {} _ttsStartKeepAlive();
        readBtn.textContent = PLAYING; return;
      }
      readBtn.textContent = PLAYING;            // 처음부터
      speakLong(readText, () => { readBtn.textContent = IDLE; });
    }
  });
}

// 3단계 '반복해서 쓰기' — 켜두면 정답을 맞힐 때마다 자동으로 새 3단계가 나온다(외울 때까지).
// 👆 카드 모드 — 타이핑이 어려운 성도용. 빈칸에 들어갈 정답 단어를 카드로 띄워 순서대로 탭한다.
const CARD_MODE_KEY = "input-card-mode";
function isCardMode() { try { return localStorage.getItem(CARD_MODE_KEY) === "1"; } catch (e) { return false; } }
function setCardMode(on) { try { localStorage.setItem(CARD_MODE_KEY, on ? "1" : "0"); } catch (e) {} }
// 구절이 바뀌면 카드 모드는 꺼진다(암송의 기본은 '쓰기'). 그런데 타자가 어려운 분은
// 구절마다 👆를 다시 눌러야 했다 — 늘 카드로 하실 분을 위한 설정.
const CARD_START_KEY = "card-start";
function isCardStart() { try { return localStorage.getItem(CARD_START_KEY) === "1"; } catch (e) { return false; } }
function setCardStart(on) { try { localStorage.setItem(CARD_START_KEY, on ? "1" : "0"); } catch (e) {} }

// 도전에서 "구절 먼저 쓰기" — 본문 빈칸을 채우기 전에 구절(예 "시편 116편 1절")부터
// 빈칸으로 채우게 한다. 기본은 꺼짐(기존 흐름을 그대로 두기 위해) — 첫 화면 아이콘
// (예전 📲 자리를 대신한 것과 같은 자리, 이번엔 "공유"를 대신한다)으로 켠다.
// 자동으로 계속 도전 중에도 이 관문은 그대로 낀다(2026-08-31 사용자 결정 — 카드/쓰기 전환과
// 달리 이건 "빠르게 돌기"보다 "구절까지 함께 외우기"가 목적이라 자동에서 빼면 의미가 없다).
const CHALLENGE_REF_FIRST_KEY = "challenge-ref-first";
function isChallengeRefFirst() { try { return localStorage.getItem(CHALLENGE_REF_FIRST_KEY) === "1"; } catch (e) { return false; } }
function setChallengeRefFirst(on) { try { localStorage.setItem(CHALLENGE_REF_FIRST_KEY, on ? "1" : "0"); } catch (e) {} }

const REPEAT_KEY = "repeat-practice";
function isRepeatPractice() { try { return localStorage.getItem(REPEAT_KEY) === "1"; } catch (e) { return false; } }
function setRepeatPractice(on) { try { localStorage.setItem(REPEAT_KEY, on ? "1" : "0"); } catch (e) {} }

// '말씀 도전' 완료 화면에서 켜두면, 다음부터는 완료 화면을 건너뛰고 바로 새 도전으로 넘어간다.
// 어려운 도전 — 다섯 번에 한 번, 칸 너비를 모두 같게 해 '몇 글자인지'를 감춘다.
// 도전 화면이 새고 있던 가장 큰 힌트는 밑줄이 아니라 칸 너비였다:
// width가 단어 길이를 따라가서 「사랑하라」와 「내」가 모양만으로 구분됐다.
const HARD_COUNT_KEY = "hard-challenge-count";
const HARD_EVERY = 5;
function hardDoneCount() { try { return Number(localStorage.getItem(HARD_COUNT_KEY)) || 0; } catch (e) { return 0; } }
function bumpHardDoneCount() { try { localStorage.setItem(HARD_COUNT_KEY, String(hardDoneCount() + 1)); } catch (e) {} }
// 다음 도전이 어려운 차례인가 — 예고와 실제 판정이 같은 함수를 봐야 말이 어긋나지 않는다.
function isHardTurn() { return (hardDoneCount() + 1) % HARD_EVERY === 0; }
// 어려운 도전에 쓸 구절 — 3단계까지 마친 것만. 지금 보는 언어 기준이다
// (한글로 다 외웠어도 영어로 처음이면 어려운 도전은 이르다).
function hardPool() { return verses.filter((v) => getPassedStage(v.no) >= 3); }
// 예고도 이 함수를 본다. 마친 구절이 하나도 없으면 예고하지 않는다 —
// 예고해 놓고 오지 않으면 완료할 때마다 거짓말을 하게 된다.
function hardNext() { return isHardTurn() && hardPool().length > 0; }

const AUTO_CHALLENGE_KEY = "auto-challenge";
function isAutoChallenge() { try { return localStorage.getItem(AUTO_CHALLENGE_KEY) === "1"; } catch (e) { return false; } }
function setAutoChallenge(on) { try { localStorage.setItem(AUTO_CHALLENGE_KEY, on ? "1" : "0"); } catch (e) {} }

// 🌐 암송 언어 — 영어(NIV) 본문이 있는 구절은 한/영을 오가며 암송할 수 있다.
//   기록(진행 단계·복습·랭킹)은 언어와 무관하게 구절 번호 하나로 쌓인다.
const LANG_KEY = "memorize-lang"; // "ko" | "en"
function getLang() { try { return localStorage.getItem(LANG_KEY) === "en" ? "en" : "ko"; } catch (e) { return "ko"; } }
function setLang(v) { try { localStorage.setItem(LANG_KEY, v === "en" ? "en" : "ko"); } catch (e) {} }
function hasEn(verse) { return !!(verse && verse.textEn && verse.textEn.trim()); }
function isEnMode(verse) { return getLang() === "en" && hasEn(verse); } // 영어 없는 구절은 자동 한국어
function verseText(verse) { return isEnMode(verse) ? verse.textEn : verse.text; }
function verseRefShort(verse) { return isEnMode(verse) ? (verse.refEn || verse.refShort) : verse.refShort; }
// "시편 119편 105절" — 넓게 쓸 수 있는 화면(앨범)용. 영어 모드는 원래 표기를 그대로 쓴다.
function verseRefFull(verse) {
  return isEnMode(verse) ? (verse.refEn || verse.refFull || verse.refShort) : (verse.refFull || verse.refShort);
}

// 귀로 들을 때 읽어 줄 말 — 요절을 먼저 부르고 말씀을 읽는다.
//   "시편 119편 105절. 주의 말씀은 내 발에 등이요…"
// 어느 구절인지 알고 들어야 머리에 자리를 잡는다(성경을 펴 놓고 찾아 읽는 순서와 같다).
// 마침표를 끼우는 이유: splitForSpeech가 문장 끝에서 끊어 큐에 넣으므로 그 자리에 쉼이 생긴다.
// 영어 모드인데 영어 요절이 없으면 붙이지 않는다 — 한국어 요절을 en-US 음성이 읽으면 알아들을 수 없다.
function verseSpokenText(verse) {
  const body = String(verseText(verse) || "").trim();
  const ref = isEnMode(verse) ? (verse.refEn || "") : (verse.refFull || verse.refShort || "");
  if (!ref) return body;
  return ref + ". " + body;
}
function verseTtsLang(verse) { return isEnMode(verse) ? "en-US" : "ko-KR"; }

// 암송화면 상단 요절 배너 고정 — #update-banner와 동일하게 처음부터 항상 position:fixed로 고정한다
// (조건부로 스크롤 위치를 계산해 켜고 끄는 방식은 모바일 키보드가 열고 닫힐 때 타이밍이 꼬여
// 중간에 사라지는 문제가 있었음). 모바일 키보드가 열리면 화면에 실제 보이는 영역(visual viewport)이
// 줄어드는데 일반 position:fixed는 이를 못 따라가므로, visualViewport API로 top만 보정한다.
// (3단계·도전·복습 화면 공통 호출). 화면이 바뀔 때마다 이전 리스너는 정리하고 새로 붙인다.
let _stickyRefOnVV = null;
function initStickyRef() {
  if (_stickyRefOnVV && window.visualViewport) {
    window.visualViewport.removeEventListener("resize", _stickyRefOnVV);
    window.visualViewport.removeEventListener("scroll", _stickyRefOnVV);
    _stickyRefOnVV = null;
  }
  const ref = document.querySelector(".test-ref-sticky");
  if (!ref || !window.visualViewport) return;
  const update = () => { ref.style.top = `${window.visualViewport.offsetTop}px`; };
  _stickyRefOnVV = update;
  update();
  window.visualViewport.addEventListener("resize", _stickyRefOnVV);
  window.visualViewport.addEventListener("scroll", _stickyRefOnVV);
}

// 암송화면은 내용이 길어 빈칸 자동 포커스 시 브라우저가 알아서 스크롤해 버튼 줄을 가려주지만,
// 도전·복습 화면은 내용이 짧아 브라우저가 "스크롤 필요 없음"으로 판단해 그대로 둔다.
// 세 화면 모두 동일하게 보이도록, 버튼 줄 바로 아래까지 명시적으로 스크롤한다.
// 포커스로 인한 브라우저 자체 스크롤과 순서가 꼬이지 않도록 살짝 지연 후 마지막에 실행한다.
function scrollPastBtnRow() {
  setTimeout(() => {
    const btnRow = document.querySelector(".test-card .btn-row");
    if (!btnRow) return;
    const y = btnRow.getBoundingClientRect().bottom + window.scrollY;
    window.scrollTo(0, y);
  }, 80);
}

// 상단 로고 배너(.page-header)를 숨겨야 하는 화면이 있다.
//   .test-ref-sticky — 요절 고정 배너가 top:0을 쓰므로 로고 배너와 겹친다(암송·도전·복습)
//   .album-screen    — 구절을 길게 훑는 화면이라 위쪽 공간을 온전히 내준다
//   .pr-wrap         — 축복 기도문. 소리 내어 읽는 화면이라 스크롤을 한 줄이라도 줄인다
// #app 내용이 바뀔 때마다 감시해서, 어떤 경로로 전환되든(뒤로가기 포함) 항상 따라간다.
(function watchPageHeaderVsStickyRef() {
  const appEl = document.getElementById("app");
  const header = document.querySelector(".page-header");
  if (!appEl || !header) return;
  const sync = () => {
    header.style.display = appEl.querySelector(".test-ref-sticky, .album-screen, .pr-wrap") ? "none" : "";
  };
  sync();
  new MutationObserver(sync).observe(appEl, { childList: true });
})();

// 영어 관용 비교용 정규화 — 대소문자·문장부호·스마트따옴표 차이는 정답으로 인정
function easyEnNorm(s) {
  return String(s || "").trim().normalize("NFC").toLowerCase()
    .replace(/[‘’“”]/g, "'")
    .replace(/[.,;:!?"'()\[\]–—-]/g, "");
}

// NIV 저작권 표기(Biblica 인용 조건) — 영어 모드 화면 하단, '영어' 도우미 버튼에 공통 사용
const NIV_ATTRIBUTION_TEXT = "NIV® Copyright © 1973, 1978, 1984, 2011 by Biblica, Inc. Used by permission.";
function nivAttributionHtml(verse) {
  if (!isEnMode(verse)) return "";
  return `<div class="niv-attribution">${NIV_ATTRIBUTION_TEXT}</div>`;
}


function renderTestScreen(verse, stage) {
  stopSpeaking(); // 화면 전환 시 읽어주기 정지
  const appEl = document.getElementById("app");
  const firstJourney = isFirstJourney();   // 첫 구절을 걷는 중에만 이정표를 보인다
  const en = isEnMode(verse);
  const tokens = verseText(verse).trim().split(/\s+/);

  const blankRatio = stage === 1 ? 0.25 : stage === 2 ? 0.65 : 1.0;
  const blankFlags = pickBlankIndices(tokens, blankRatio);

  const blanks = [];
  const wordsHtml = tokens
    .map((word, i) => {
      if (blankFlags[i]) {
        const blankIndex = blanks.length;
        blanks.push(word);
        // 영어는 글자폭이 좁아 em 기준이 과대 — ch 단위로 잰다
        const style = en ? `width:${Array.from(word).length + 2}ch` : `width:${Array.from(word).length + 1}em`;
        return `<input class="word-input" data-blank="${blankIndex}" data-answer="${word}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" style="${style}" />`;
      } else {
        return `<span class="word-fixed">${word}</span>`;
      }
    })
    .join(" ");

  const answerHtml = tokens
    .map((word, i) =>
      blankFlags[i] ? `<strong class="ans-word">${word}</strong>` : word
    )
    .join(" ");

  // 설교 연결: 주제(제목) 텍스트 + [영상보기][요약보기] 대등한 2버튼.
  // 구역 라벨이 이미 '설교'이므로 버튼에서는 '설교'를 반복하지 않는다.
  // 요약보기 버튼은 매칭되는 요약이 있을 때만 slot에 비동기로 채워진다.
  const sermonConnect = sermonConnectHtml(verse);

  // 3단계에 들어오면 곧바로 체크 가능(빈칸을 다 맞혀야 풀리는 잠금은 없앰) —
  // '반복해서 쓰기'를 켜둔 경우 정답 직후 곧장 다음 3단계로 자동 진행돼 버려서
  // 체크할 틈이 없었다. 처음부터 열어두면 그 틈에도 자유롭게 체크할 수 있다.
  const heartHtml = stage === 3 ? heartCheckHtml(verse) : "";

  // 3단계에만: '반복해서 쓰기' 토글. 켜두면 정답 후 자동으로 새 3단계가 나온다.
  const repeatHtml = stage === 3 ? `
        <label class="repeat-toggle" id="repeat-label">
          <input type="checkbox" id="repeat-check"${isRepeatPractice() ? " checked" : ""} />
          <span class="repeat-text">🔁 반복해서 쓰기</span>
          <span class="repeat-desc">외울 때까지, 정답을 맞히면 자동으로 다시 써요</span>
        </label>` : "";

  appEl.innerHTML = `
    <div class="test-screen${en ? " en" : ""}">
      <div class="test-card with-ref-banner">
        <div class="test-ref-sticky">${verseRefFull(verse)}</div>
        <div class="btn-row">
          <button class="answer-btn" id="show-answer-btn">보기</button>
          <button class="answer-btn" id="listen-answer-btn" aria-label="정답 음성으로 듣기">🔊 듣기</button>
          <button class="voice-btn" id="voice-toggle">🎤 암송</button>
          <button class="answer-btn mode-btn" id="mode-toggle">${isCardMode() ? "⌨️ 쓰기" : "👆 카드"}</button>
        </div>
        <div class="test-top">
          <div class="test-head">
            <div class="test-stage">${stage}단계${firstJourney ? stepDots(stage) : ""}</div>
          </div>
          <button class="back-btn" id="back-to-list-btn">← 목록으로</button>
        </div>
        ${firstJourney && stage === 1 ? `<div class="first-guide">세 걸음이면 이 말씀을 외우게 돼요</div>` : ""}
        <div class="test-sentence">${wordsHtml}</div>
        <div id="card-tray" class="card-tray"></div>
        <div id="answer-panel" class="answer-panel" hidden>
          <div class="answer-title">정답</div>
          <div class="answer-text">${answerHtml}</div>
          <button class="back-to-test-btn" id="back-to-test-btn">돌아가서 계속하기</button>
        </div>
        <div id="help-slot" class="help-slot"></div>
        ${repeatHtml}
        <div id="result-area"></div>
        ${heartHtml}

        <div id="voice-panel" class="voice-panel" hidden>
          <div class="voice-status" id="voice-status">🎙️ 듣고 있어요… <b>‘암송 종료’</b>를 누를 때까지 계속 들어요</div>
          <div class="voice-live" id="voice-live"></div>
        </div>
        <div id="voice-result" class="voice-result"></div>

        ${sermonConnect}
        ${nivAttributionHtml(verse)}
      </div>
    </div>
  `;

  initStickyRef();
  scrollPastBtnRow();
  document
    .getElementById("back-to-list-btn")
    .addEventListener("click", () => { stopSpeaking(); renderVerseList(); });

  // 이 구절에 대응하는 설교 요약이 있으면 배너 아래에 '설교 요약 보기' 버튼을 채운다.
  fillSermonSummaryBtn(verse, stage);
  // 쉬운 풀이·기억법(있는 구절만)
  fillVerseHelp(verse);

  // '쓰기 ↔ 카드' 입력 방식 전환(설정 저장 후 화면 다시 그림)
  const modeBtn = document.getElementById("mode-toggle");
  if (modeBtn) {
    modeBtn.addEventListener("click", () => {
      setCardMode(!isCardMode());
      renderTestScreen(verse, stage);
    });
  }

  // '반복해서 쓰기' 토글 저장
  const repeatInput = document.getElementById("repeat-check");
  if (repeatInput) {
    repeatInput.addEventListener("change", () => setRepeatPractice(repeatInput.checked));
  }

  // "내 마음에 두었나이다" 체크/해제
  setupHeartCheck(verse);

  // 시각장애인 등을 위한 '정답 듣기'(TTS): 출처 + 본문을 음성으로 읽어준다.
  const listenBtn = document.getElementById("listen-answer-btn");
  if (listenBtn) {
    listenBtn.addEventListener("click", () => {
      if (window.speechSynthesis && window.speechSynthesis.speaking) {
        stopSpeaking(); // 재생 중이면 정지(토글)
        listenBtn.textContent = "🔊 듣기";
        return;
      }
      listenBtn.textContent = "⏹ 정지";
      speakText(`${verseRefFull(verse)}. ${verseText(verse)}`, () => {
        listenBtn.textContent = "🔊 듣기";
      }, 1, verseTtsLang(verse));
    });
  }

  setupAnswerToggle();
  setupAutoCheck(verse, stage);
  setupVoice(verse, stage);
}

// ------------------------------------------------------------
// 음성 합성(TTS) — 구절을 한국어로 읽어준다(설치·권한 불필요)
// ------------------------------------------------------------
const SPEAK_RATE = 0.7; // 기본 읽기 속도(낮을수록 느림)
const TTS_RATE_KEY = "tts-rate"; // 사용자가 설정 화면에서 고른 듣기 속도
function getSpeakRate() {
  const v = parseFloat(localStorage.getItem(TTS_RATE_KEY));
  return v >= 0.4 && v <= 1.5 ? v : SPEAK_RATE;
}
function setSpeakRate(v) {
  try { localStorage.setItem(TTS_RATE_KEY, String(v)); } catch (e) {}
}
const TTS_VOL_KEY = "tts-vol";
function getSpeakVol() {
  const v = parseFloat(localStorage.getItem(TTS_VOL_KEY));
  return v >= 0.1 && v <= 1.0 ? v : 1.0;
}
function setSpeakVol(v) {
  try { localStorage.setItem(TTS_VOL_KEY, String(v)); } catch (e) {}
}
function rateLabel(v) {
  if (v <= 0.5) return "매우 느리게";
  if (v <= 0.65) return "느리게";
  if (v <= 0.8) return "보통";
  if (v <= 1.1) return "빠르게";
  return "매우 빠르게";
}
function volLabel(v) {
  if (v <= 0.3) return "작게";
  if (v <= 0.65) return "보통";
  return "크게";
}

// text 를 times 번 연속해서 읽어준다. (빠르게 N번 클릭하면 N번 반복)
function speakText(text, onEnd, times = 1, lang = "ko-KR") {
  if (!("speechSynthesis" in window)) {
    appAlert("이 브라우저는 읽어주기(음성 합성)를 지원하지 않습니다.\n크롬·사파리에서 이용해 주세요.");
    if (onEnd) onEnd();
    return;
  }
  window.speechSynthesis.cancel(); // 중복 재생 방지
  const n = Math.max(1, times);
  for (let i = 0; i < n; i++) {
    const ut = new SpeechSynthesisUtterance(text);
    ut.lang = lang;
    ut.rate = getSpeakRate();
    ut.volume = getSpeakVol();
    ut.pitch = 1;
    if (onEnd && i === n - 1) {
      // 마지막 반복이 끝났을 때만 콜백
      ut.onend = onEnd;
      ut.onerror = onEnd;
    }
    window.speechSynthesis.speak(ut); // speak 는 큐에 쌓이므로 순서대로 N번 재생
  }
}

// 긴 글을 문장 단위로 쪼갠다. 크롬은 발화 하나가 길면(~15초) 조용히 끊기므로
// 쪼개서 큐에 넣어야 끝까지 읽는다.
// ※ lookbehind(?<=)는 사파리 16.4 미만에서 파싱 자체가 실패해 앱이 죽으므로 쓰지 않는다.
function splitForSpeech(text, max = 150) {
  const out = [];
  String(text || "").split(/\n+/).forEach((para) => {
    // 문장부호를 남기면서 자르기(구분자 보존 후 분리)
    para.replace(/([.!?])\s+/g, "$1\u0001").split("\u0001").forEach((sent) => {
      let s = String(sent).trim();
      if (!s) return;
      while (s.length > max) {          // 한 문장이 너무 길면 쉼표에서 한 번 더
        let cut = s.lastIndexOf(",", max);
        if (cut < max * 0.5) cut = max - 1;
        out.push(s.slice(0, cut + 1).trim());
        s = s.slice(cut + 1).trim();
      }
      if (s) out.push(s);
    });
  });
  return out;
}

// 긴 글 읽어주기(설교 요약 등). 마지막 조각이 끝나면 onEnd.
// 크롬은 (1) 발화 하나가 길면 ~15초에서 끊고, (2) 여러 발화를 한꺼번에 큐에 넣으면
// ~15초 뒤 세션 자체를 멈춰 나머지를 버린다. 그래서 ① 문장 단위로 쪼개 ② 한 개씩
// 순차 재생(onend에서 다음)하고 ③ 주기적으로 resume해 자동 정지를 막는다.
let _ttsKeepAlive = null;
function _ttsStopKeepAlive() { if (_ttsKeepAlive) { clearInterval(_ttsKeepAlive); _ttsKeepAlive = null; } }
function _ttsStartKeepAlive() {
  _ttsStopKeepAlive();
  _ttsKeepAlive = setInterval(() => {
    const ss = window.speechSynthesis;
    if (ss && ss.speaking && !ss.paused) ss.resume(); // 멈춤(paused) 중엔 되살리지 않음
  }, 5000);
}

// 설교 3분 요약 MP3(아카이브, Azure 뉴럴 음성) — <audio>라 어느 기기서도 안 끊긴다.
const SERMON_AUDIO_BASE = "https://sermon.onlybible.kr/";
let sermonAudio = null; // 재사용 <audio> 엘리먼트
function stopSermonAudio() {
  if (sermonAudio) { try { sermonAudio.pause(); } catch (e) {} }
}
function playSermonAudio(url, onEnd) {
  stopSpeaking(); // TTS 중이면 중단(오디오와 겹치지 않게)
  if (!sermonAudio) sermonAudio = new Audio();
  if (sermonAudio.src !== url) sermonAudio.src = url;
  sermonAudio.onended = () => { try { sermonAudio.currentTime = 0; } catch (e) {} if (onEnd) onEnd(); };
  sermonAudio.play().catch(() => { if (onEnd) onEnd(); });
}

// 낭독 세대 번호 — speechSynthesis.cancel()은 브라우저에 따라 지금 읽던 발화의
// onend를 부른다. 그대로 두면 '멈춤' 직후 다음 조각이 이어져 읽히고, 3분요약 MP3와
// 목소리가 겹친다. 멈출 때마다 번호를 올려 철 지난 콜백을 버린다.
let _ttsGen = 0;

function speakLong(text, onEnd, lang = "ko-KR") {
  if (!("speechSynthesis" in window)) {
    appAlert("이 브라우저는 읽어주기(음성 합성)를 지원하지 않습니다.\n크롬·사파리에서 이용해 주세요.");
    if (onEnd) onEnd();
    return;
  }
  const parts = splitForSpeech(text);
  if (!parts.length) { if (onEnd) onEnd(); return; }
  window.speechSynthesis.cancel();
  _ttsStopKeepAlive();
  const gen = ++_ttsGen;   // cancel()이 부를 옛 콜백은 여기서 무효가 된다

  let i = 0;
  const speakNext = () => {
    if (gen !== _ttsGen) return;                       // 멈춘 뒤라면 더 읽지 않는다
    if (i >= parts.length) { _ttsStopKeepAlive(); if (onEnd) onEnd(); return; }
    const ut = new SpeechSynthesisUtterance(parts[i]);
    ut.lang = lang;
    ut.rate = getSpeakRate();
    ut.volume = getSpeakVol();
    ut.pitch = 1;
    ut.onend = () => { i++; speakNext(); };
    ut.onerror = () => { i++; speakNext(); }; // 한 조각 실패해도 계속 진행
    window.speechSynthesis.speak(ut);
  };
  // 크롬 자동 정지 방어 — 일시정지 상태가 아닐 때만 resume()(사용자가 누른 '멈춤'을 되살리지 않도록)
  _ttsStartKeepAlive();
  speakNext();
}

function stopSpeaking() {
  _ttsGen++;           // 진행 중인 낭독의 이어읽기 콜백을 무효로
  _ttsStopKeepAlive(); // 긴 낭독 keep-alive 타이머 정리
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  if (sermonAudio) { try { sermonAudio.pause(); } catch (e) {} } // 설교 MP3도 정지
  killVoice(); // 화면 전환 시 음성인식(입력)도 함께 중단
}

// 현재 활성 음성인식을 안전하게 중단(자동 재시작·뒤늦은 채점 방지)
let voiceKill = null;
function killVoice() {
  if (voiceKill) { try { voiceKill(); } catch (e) {} voiceKill = null; }
}

function setupAnswerToggle() {
  const showBtn = document.getElementById("show-answer-btn");
  const backBtn = document.getElementById("back-to-test-btn");
  const panel = document.getElementById("answer-panel");

  showBtn.addEventListener("click", () => {
    panel.hidden = false;
    showBtn.hidden = true;
  });

  backBtn.addEventListener("click", () => {
    panel.hidden = true;
    showBtn.hidden = false;
    const next = document.querySelector(".word-input:not([disabled])");
    if (next) next.focus();
  });
}

// ------------------------------------------------------------
// 음성 암송 (익명 버전과 동일, 통과 시 3단계 저장)
// ------------------------------------------------------------
const VOICE_PASS = 85;

function normalizeWords(s) {
  return String(s || "")
    .normalize("NFC") // 분리형(NFD) 한글도 완성형으로 맞춰 가-힣 범위에 매칭되게
    .toLowerCase()    // 영어(NIV) 음성 채점용 — 한글에는 영향 없음
    .replace(/[^가-힣a-zA-Z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

// 인식기가 같은 말을 반복 출력하는 경우 대비: 연속 중복 단어/구를 정리
function collapseRepeats(s) {
  const a = [];
  String(s || "").trim().split(/\s+/).filter(Boolean).forEach((w) => {
    if (a[a.length - 1] !== w) a.push(w); // 연속 동일 단어 제거
  });
  // 직전과 동일한 2~4단어 구가 바로 반복되면 제거
  for (let k = 4; k >= 2; k--) {
    let i = 0;
    while (i + 2 * k <= a.length) {
      if (a.slice(i, i + k).join(" ") === a.slice(i + k, i + 2 * k).join(" ")) {
        a.splice(i + k, k);
      } else {
        i++;
      }
    }
  }
  return a.join(" ");
}

// 배열 LCS 길이
function lcsLen(a, b) {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[n][m];
}

// 두 단어의 음절 유사도(0~1). 음성 인식의 유사 발음 오인 허용에 사용
function wordSim(a, b) {
  const A = Array.from(a), B = Array.from(b);
  if (!A.length && !B.length) return 1;
  return (2 * lcsLen(A, B)) / (A.length + B.length);
}

const WORD_SIM_PASS = 0.5; // 이 이상 비슷하면 같은 단어로 인정(마크 초록)

function scoreSpoken(answerText, spokenText) {
  const ans = normalizeWords(answerText);
  const said = normalizeWords(spokenText);
  const n = ans.length;
  const m = said.length;

  // 단어 정렬(LCS) — 단, 완전일치가 아니라 '유사하면' 일치로 본다(마크용)
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = wordSim(ans[i - 1], said[j - 1]) >= WORD_SIM_PASS
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const marks = new Array(n).fill(false);
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (wordSim(ans[i - 1], said[j - 1]) >= WORD_SIM_PASS) { marks[i - 1] = true; i--; j--; }
    else if (dp[i - 1][j] >= dp[i][j - 1]) i--;
    else j--;
  }

  // 정확도는 음절(글자) 단위 LCS로 산정 → 1~2글자 오인은 부분 감점만(거의 같으면 높은 점수)
  const ansSyl = Array.from(ans.join(""));
  const saidSyl = Array.from(said.join(""));
  const accuracy = ansSyl.length
    ? Math.round((lcsLen(ansSyl, saidSyl) / ansSyl.length) * 100)
    : 0;

  return { accuracy, marks, ansWords: ans };
}

function setupVoice(verse, stage, onPass) {
  killVoice(); // 이전 화면에서 시작된 음성인식이 남아 있으면 중단
  const toggleBtn = document.getElementById("voice-toggle");
  const panel = document.getElementById("voice-panel");
  const statusEl = document.getElementById("voice-status");
  const liveEl = document.getElementById("voice-live");
  const resultEl = document.getElementById("voice-result");

  const ua = navigator.userAgent || "";
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (/KAKAOTALK/i.test(ua)) {
    toggleBtn.addEventListener("click", () => {
      resultEl.innerHTML =
        `<div class="voice-msg">카카오톡 브라우저에서는 음성 암송이 동작하지 않습니다.<br>아래 버튼으로 크롬·사파리에서 열어 사용해 주세요.</div>
         <a class="voice-btn" id="voice-ext" style="margin-top:10px;" href="kakaotalk://web/openExternal?url=${encodeURIComponent(location.href)}">🔗 외부 브라우저로 열기</a>`;
    });
    return;
  }

  if (!SR) {
    toggleBtn.addEventListener("click", () => {
      resultEl.innerHTML =
        `<div class="voice-msg">이 브라우저는 음성인식을 지원하지 않습니다.<br>크롬(안드로이드·PC)·사파리에서 이용하거나 타이핑으로 암송해 주세요.</div>`;
    });
    return;
  }

  let rec = null;
  let finalText = "";
  let stopped = false;
  let running = false;

  function setRunning(on) {
    running = on;
    panel.hidden = !on;
    if (on) {
      toggleBtn.textContent = "■ 종료";
      toggleBtn.classList.remove("voice-btn");
      toggleBtn.classList.add("voice-stop");
    } else {
      toggleBtn.textContent = "🎤 암송";
      toggleBtn.classList.remove("voice-stop");
      toggleBtn.classList.add("voice-btn");
    }
  }

  function evaluateAndShow() {
    const heard = collapseRepeats(finalText); // 반복 정리된 인식 결과
    const { accuracy, marks, ansWords } = scoreSpoken(verseText(verse), heard);
    const wordsHtml = ansWords
      .map((w, i) => `<span class="${marks[i] ? "v-ok" : "v-no"}">${w}</span>`)
      .join(" ");
    const passed = accuracy >= VOICE_PASS;

    resultEl.innerHTML = `
      <div class="voice-summary"><span class="voice-pct ${passed ? "pass" : "fail"}">${accuracy}%</span> ${passed ? "음성 암송 통과! 🎉" : `조금 더! (통과 ${VOICE_PASS}%)`}</div>
      <div class="voice-words">${wordsHtml}</div>
      <div class="voice-heard">들린 내용: ${heard ? heard : "(인식 안 됨)"}</div>
    `;

    // 도전 모드: 통과 시 콜백으로 완료 처리(단계 네비 없음)
    if (onPass) { if (passed) onPass("voice"); return; }

    // (연습 모드) 저장 + 다음 단계 네비
    const vWasFirst = passed && isFirstJourney();   // 저장하면 이미 '마친 사람'이 된다
    if (passed) saveProgress(verse.no, stage, "voice");
    const vIdx = verses.findIndex((v) => v.no === verse.no);
    const vPrev = vIdx > 0 ? verses[vIdx - 1] : null;
    const vNext = (vIdx >= 0 && vIdx < verses.length - 1) ? verses[vIdx + 1] : null;
    // 도전에서 '다시 암송'으로 들어온 화면이면 음성으로 마쳐도 도전으로 돌아간다
    if (passed && stage >= 3 && relearnBackToChallenge) {
      relearnBackToChallenge = false;
      const back = document.getElementById("result-area");
      if (back) back.innerHTML = `<div class="relearn-back">잘하셨어요! 다음 구절로 넘어갑니다…</div>`;
      setTimeout(startChallenge, 900);
      return;
    }
    const nav = !passed
      ? ""
      : stage < 3
      ? (vWasFirst && STEP_CHEER[stage] ? `<div class="step-cheer">${STEP_CHEER[stage]}</div>` : "") +
        `<button class="next-btn" id="voice-next-stage">${stage + 1}단계로</button>`
      : (vWasFirst ? FIRST_DONE_HTML : "") +
        `<div class="complete-nav">
           <button class="nav3-btn" id="voice-prev-verse" ${vPrev ? "" : "disabled"}>◀ 이전</button>
           <button class="nav3-btn redo" id="voice-redo-verse">다시 암송</button>
           <button class="nav3-btn" id="voice-next-verse" ${vNext ? "" : "disabled"}>다음 ▶</button>
         </div>
         <button class="share-brag" id="voice-brag">🙌 말씀 나누기</button>`;
    const topArea = document.getElementById("result-area");
    if (topArea) topArea.innerHTML = nav;
    if (passed && stage < 3) {
      document
        .getElementById("voice-next-stage")
        .addEventListener("click", () => renderTestScreen(verse, stage + 1));
    } else if (passed) {
      document.getElementById("voice-redo-verse").addEventListener("click", () => renderTestScreen(verse, 3));
      document.getElementById("voice-brag").addEventListener("click", () => shareMyVerse(verse));
      if (vPrev) document.getElementById("voice-prev-verse").addEventListener("click", () => startTest(vPrev));
      if (vNext) document.getElementById("voice-next-verse").addEventListener("click", () => startTest(vNext));
    }
  }

  function newSession() {
    const r = new SR();
    r.lang = verseTtsLang(verse); // 영어(NIV) 모드면 en-US로 인식
    r.interimResults = true;
    r.continuous = true; // 계속 듣기(말이 끝나기 전에 멈추지 않도록)

    // 이 세션의 확정 텍스트. 확정 결과들을 '병합'해 중복을 막는다.
    let sessionFinal = "";

    r.onresult = (e) => {
      const finals = [];
      let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const t = e.results[i][0].transcript.trim();
        if (e.results[i].isFinal) {
          if (t) finals.push(t);
        } else {
          interim += e.results[i][0].transcript;
        }
      }
      // 안드로이드는 확정 결과가 '점점 길어지며' 누적됨 → 앞을 포함하면 덮어쓰고,
      // 새 구간이면 이어붙여 중복을 제거한다.
      let merged = "";
      for (const f of finals) {
        if (!merged) merged = f;
        else if (f.startsWith(merged)) merged = f; // 성장형 → 대체
        else if (!merged.endsWith(f)) merged = (merged + " " + f).trim(); // 새 구간 → 추가
      }
      sessionFinal = merged;
      liveEl.textContent = (finalText + " " + merged + " " + interim).replace(/\s+/g, " ").trim();
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed" || e.error === "audio-capture") {
        stopped = true;
        statusEl.textContent = "마이크 권한이 필요합니다. 브라우저에서 마이크를 허용해 주세요.";
      }
    };
    r.onend = () => {
      // 세션 확정분 누적 후 반복 정리(세션 경계 중복까지 제거)
      finalText = collapseRepeats((finalText + " " + sessionFinal).replace(/\s+/g, " ").trim());
      sessionFinal = "";
      // 사용자가 '암송 종료'를 누르기 전까지는 자동 재시작해 계속 듣는다.
      if (!stopped) {
        try { rec = newSession(); rec.start(); return; } catch (e) {}
      }
      voiceKill = null; // 이 인식 세션 종료
      setRunning(false);
      evaluateAndShow();
    };
    return r;
  }

  toggleBtn.addEventListener("click", () => {
    if (!running) {
      finalText = "";
      stopped = false;
      resultEl.innerHTML = "";
      liveEl.textContent = "";
      statusEl.innerHTML = "🎙️ 듣고 있어요… 다 외우면 <b>‘암송 종료’</b>를 누르세요";
      setRunning(true);
      try {
        rec = newSession();
        rec.start();
        // 화면을 벗어나면 이 인식을 강제 종료(자동 재시작·뒤늦은 채점 방지)
        voiceKill = () => { stopped = true; if (rec) { try { rec.onend = null; rec.stop(); } catch (e) {} } };
      } catch (err) {
        setRunning(false);
        statusEl.textContent = "음성인식을 시작할 수 없습니다.";
      }
    } else {
      stopped = true;
      if (rec) rec.stop();
    }
  });
}

// 본문 토큰 중 빈칸 인덱스 선정 (글자 긴 단어 우선)
function pickBlankIndices(tokens, ratio) {
  const flags = new Array(tokens.length).fill(false);
  const candidates = tokens
    .map((word, i) => ({ i, len: word.length }))
    .sort((a, b) => b.len - a.len);
  const targetCount = Math.max(1, Math.round(tokens.length * ratio));
  candidates.slice(0, targetCount).forEach((c) => {
    flags[c.i] = true;
  });
  return flags;
}

// ------------------------------------------------------------
// 자동 채점 (익명 버전과 동일)
// ------------------------------------------------------------
function setupAutoCheck(verse, stage) {
  const inputs = Array.from(document.querySelectorAll(".word-input"));
  const en = isEnMode(verse); // 영어 모드면 대소문자·문장부호 차이는 관용 처리

  // 모바일 키보드(3벌식·iOS 등)는 한글을 NFD(자모 분리형)로 입력할 수 있어
  // NFC(완성형)로 정규화한 뒤 비교해야 정답 판정이 된다.
  const norm = (s) => String(s || "").trim().normalize("NFC");
  const same = (a, b) => (en ? easyEnNorm(a) === easyEnNorm(b) : norm(a) === norm(b));
  const len = (s) => Array.from(s).length;
  // 아이폰 천지인 등은 조합 중 낱자모(ㆍ U+318D, ㄱ~ㅣ 등 호환 자모)가 칸에 남는다.
  // 이게 남아 있으면 "아직 조합 중"으로 보고 오답 삭제를 하지 않는다.
  const isComposingJamo = (s) => /[ㄱ-ㆎᄀ-ᇿ]/.test(String(s || ""));

  function accept(input, idx) {
    input.value = norm(input.dataset.answer);
    input.classList.add("correct");
    input.classList.remove("wrong");
    input.disabled = true;

    const next = inputs.slice(idx + 1).find((inp) => !inp.disabled);
    if (next) next.focus();
    else checkAllComplete(inputs, verse, stage);
  }

  function markWrong(input) {
    input.classList.add("wrong");
    input.classList.remove("correct");
    setTimeout(() => {
      input.blur();
      input.value = "";
      input.classList.remove("wrong");
      input.focus();
    }, 400);
  }

  // 모바일 키보드에 가리지 않도록, 포커스된 입력 칸을 화면 중앙보다 약간 위로 올린다.
  // 단, 이미 화면(키보드 위) 안에 충분히 보이면 그대로 두고 가려질 때만 스크롤한다
  // — 매 빈칸마다 화면이 계속 움직이는 걸 막기 위함.
  function scrollIntoCenter(input) {
    // 키보드가 올라온 뒤 위치가 잡히도록 약간 지연
    setTimeout(() => {
      const vh = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
      const top = input.getBoundingClientRect().top;
      if (top >= 40 && top <= vh - 60) return; // 이미 충분히 보임 — 그대로 둠
      const target = vh / 2 - 80; // 화면 중앙보다 약 2cm(80px) 위
      window.scrollBy({ top: top - target, behavior: "smooth" });
    }, 250);
  }

  inputs.forEach((input, idx) => {
    let timer = null;

    // 정답이면 즉시 통과(조합 상태와 무관). 매 입력마다 검사.
    function checkAccept() {
      if (input.disabled) return false;
      if (same(input.value, input.dataset.answer)) {
        clearTimeout(timer);
        accept(input, idx);
        return true;
      }
      return false;
    }

    // 오답 처리는 "입력이 멈춘 뒤"에만, 그리고
    //  - 칸에 조합 중 낱자모가 없고(천지인 등 조합 완료),
    //  - 글자 수가 정답보다 '많을 때'만 지운다.
    // (한글 받침/모음을 채우는 동안의 동일 글자수 중간 상태는 절대 지우지 않음)
    function scheduleWrongCheck() {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (input.disabled) return;
        if (checkAccept()) return;
        if (isComposingJamo(input.value)) return; // 아직 조합 중
        const val = norm(input.value);
        const answer = norm(input.dataset.answer);
        if (val && len(val) > len(answer)) markWrong(input);
      }, 700);
    }

    // 입력/조합완료/키업 모두에서 정답을 확인(아이폰은 완료 신호가 늦거나 누락될 수 있음)
    function onChange() {
      if (!checkAccept()) scheduleWrongCheck();
    }
    input.addEventListener("compositionend", onChange);
    input.addEventListener("input", onChange);
    input.addEventListener("keyup", onChange);
    input.addEventListener("focus", () => scrollIntoCenter(input));
  });

  // 👆 카드 모드 — 정답 단어만 섞어 카드로 띄우고, 순서대로 탭해 빈칸을 채운다.
  //   채점/기록은 위 accept()를 그대로 써서 쓰기 모드와 완전히 동일하게 동작한다.
  const tray = document.getElementById("card-tray");
  if (isCardMode() && tray && inputs.length) {
    inputs.forEach((inp) => { inp.readOnly = true; inp.setAttribute("inputmode", "none"); });
    const shuffled = inputs
      .map((inp) => norm(inp.dataset.answer))
      .map((w) => ({ w, r: Math.random() }))
      .sort((a, b) => a.r - b.r)
      .map((x) => x.w);
    tray.innerHTML = shuffled
      .map((w, k) => `<button type="button" class="wcard" data-k="${k}">${w}</button>`)
      .join("");
    tray.querySelectorAll(".wcard").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = inputs.findIndex((inp) => !inp.disabled); // 다음 빈칸
        if (idx < 0) return;
        const target = inputs[idx];
        if (shuffled[Number(btn.dataset.k)] === norm(target.dataset.answer)) {
          btn.classList.add("used");
          btn.disabled = true;
          accept(target, idx);
        } else {
          btn.classList.add("shake");
          target.classList.add("wrong");
          setTimeout(() => { btn.classList.remove("shake"); target.classList.remove("wrong"); }, 450);
        }
      });
    });
  }

  if (!isCardMode() && inputs[0]) inputs[0].focus(); // 카드 모드에선 키보드를 띄우지 않는다
}

function checkAllComplete(inputs, verse, stage) {
  const allCorrect = inputs.every((inp) => inp.classList.contains("correct"));
  if (!allCorrect) return;

  // saveProgress보다 먼저 봐야 한다 — 저장하고 나면 이미 '한 구절 마친 사람'이 된다.
  const wasFirst = isFirstJourney();
  // 카드로 맞힌 것을 'typing'으로 남기면, 타자가 어려운 분들이 실제로 어떻게
  // 하고 계신지 알 길이 없다. 음성은 0.1%인 걸 알았는데 그 대안인 카드는
  // 측정조차 안 되고 있었다.
  saveProgress(verse.no, stage, isCardMode() ? "card" : "typing");

  const resultEl = document.getElementById("result-area");
  if (stage < 3) {
    resultEl.innerHTML =
      (wasFirst && STEP_CHEER[stage] ? `<div class="step-cheer">${STEP_CHEER[stage]}</div>` : "") +
      `<button class="next-btn" id="next-stage-btn">${stage + 1}단계로</button>`;
    document.getElementById("next-stage-btn").addEventListener("click", () => renderTestScreen(verse, stage + 1));
    showStageDoneModal(verse, stage, wasFirst);
    return;
  }

  // '반복해서 쓰기'가 켜져 있으면 아무것도 띄우지 않고 바로 새 3단계로 넘어간다.
  // (정답마다 위의 saveProgress가 실행되므로 도전 기록에 '매번' 카운트된다. 멈추려면 체크박스 해제)
  // 마음에 두었나이다 체크는 3단계 진입과 동시에 항상 가능해서, 자동 진행 중에도 체크할 수 있다.
  // 도전에서 '다시 암송'으로 들어온 화면이면 여기서 도전으로 돌아간다.
  // 반복해서 쓰기 검사보다 먼저 봐야 한다 — 뒤에 두면 같은 구절에 갇힌다.
  if (relearnBackToChallenge) {
    relearnBackToChallenge = false;
    if (resultEl) resultEl.innerHTML = `<div class="relearn-back">잘하셨어요! 다음 구절로 넘어갑니다…</div>`;
    setTimeout(startChallenge, 900);
    return;
  }
  if (isRepeatPractice()) {
    setTimeout(() => renderTestScreen(verse, 3), 350); // 마지막 글자 정답 표시가 잠깐 보이도록만
    return;
  }
  renderCompleteNav(verse, wasFirst);
  showStageDoneModal(verse, 3, wasFirst);
}

// 3단계 완료 네비 — 이전 · 다시 암송 · 다음 + 말씀 나누기
// celebrate: 이 구절이 그분의 '첫 완주'였다면 무엇이 일어났는지 알려 준다.
function renderCompleteNav(verse, celebrate) {
  const resultEl = document.getElementById("result-area");
  if (!resultEl) return;
  const idx = verses.findIndex((v) => v.no === verse.no);
  const prev = idx > 0 ? verses[idx - 1] : null;
  const next = (idx >= 0 && idx < verses.length - 1) ? verses[idx + 1] : null;
  resultEl.innerHTML = `
    ${celebrate ? FIRST_DONE_HTML : ""}
    <div class="complete-nav">
      <button class="nav3-btn" id="prev-verse-btn" ${prev ? "" : "disabled"}>◀ 이전</button>
      <button class="nav3-btn redo" id="redo-verse-btn">다시 암송</button>
      <button class="nav3-btn" id="next-verse-btn" ${next ? "" : "disabled"}>다음 ▶</button>
    </div>
    <button class="share-brag" id="brag-btn">🙌 말씀 나누기</button>`;
  document.getElementById("brag-btn").addEventListener("click", () => shareMyVerse(verse));
  document.getElementById("redo-verse-btn").addEventListener("click", () => renderTestScreen(verse, 3));
  if (prev) document.getElementById("prev-verse-btn").addEventListener("click", () => startTest(prev));
  if (next) document.getElementById("next-verse-btn").addEventListener("click", () => startTest(next));
}

// ------------------------------------------------------------
// 공유하기 — Web Share API(모바일) 우선, 미지원 시 URL 복사
// ------------------------------------------------------------
const SHARE_HOME = "https://gocheok.onlybible.kr/";
const SHARE_TITLE = "[고척교회]  오직 성경, 말씀이 답이다!";

// 구절 딥링크 — 받는 사람이 로그인 없이 그 구절 암송 화면으로 바로 들어간다.
function verseShareUrl(no) {
  return SHARE_HOME + "?v=" + no;
}

// 공유 공통 — Web Share API(모바일) 우선, 미지원 시 문구+링크를 클립보드로.
// 폴백에서도 문구를 함께 복사해야 카톡에 붙여넣었을 때 메시지가 완성된다.
function shareLink(text, url) {
  if (navigator.share) {
    navigator.share({ title: SHARE_TITLE, text, url }).catch(function() {});
    return;
  }
  const full = text ? text + "\n" + url : url;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(full).then(function() {
      showShareToast("공유 문구가 복사되었습니다! 붙여넣기 해주세요 📋");
    }).catch(function() {
      showShareToast(url);
    });
    return;
  }
  // execCommand 폴백 (구형 브라우저)
  const ta = document.createElement("textarea");
  ta.value = full;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try { document.execCommand("copy"); showShareToast("공유 문구가 복사되었습니다! 붙여넣기 해주세요 📋"); }
  catch (e) { showShareToast(url); }
  document.body.removeChild(ta);
}

// 헤더 🔗 — 앱 전체 소개(딥링크 아님)
function shareApp() {
  shareLink(
    "고척교회 성경말씀 암송이에요 📖\n" +
    "매주 말씀을 단계별 빈칸으로 채우며 마음에 새길 수 있어요.\n" +
    "로그인 없이 바로 체험해볼 수 있습니다. 함께해요! 🙌",
    SHARE_HOME
  );
}

// 이번주 말씀 — 목장 단톡방 전파용(딥링크)
function shareWeeklyVerse(verse) {
  shareLink(
    `[고척교회] 이번주 말씀 · ${verse.refShort}\n` +
    `"${verse.text}"\n\n` +
    "로그인 없이 바로 외워볼 수 있어요. 함께해요! 🙌",
    verseShareUrl(verse.no)
  );
}

// 암송 완료 직후 — 공유 동기가 가장 높은 순간(딥링크)
function shareMyVerse(verse) {
  shareLink(
    `저는 오늘 ${verse.refShort} 말씀을 마음에 새겼어요 🙌\n` +
    `"${verse.text}"\n\n` +
    "함께 말씀 암송해요! 로그인 없이 바로 시작할 수 있어요.",
    verseShareUrl(verse.no)
  );
}

// 공유 결과 토스트 메시지
function showShareToast(msg) {
  const existing = document.getElementById("share-toast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.id = "share-toast";
  toast.className = "share-toast";
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(function() { toast.classList.add("share-toast-show"); }, 10);
  setTimeout(function() {
    toast.classList.remove("share-toast-show");
    setTimeout(function() { toast.remove(); }, 400);
  }, 2800);
}

// ------------------------------------------------------------
// 카카오톡 인앱 브라우저 → 기본(외부) 브라우저로 열기 유도
//   안드로이드: 자동 전환(세션당 1회). 아이폰: 자동이 막히면 배너 버튼으로.
// ------------------------------------------------------------
function promptOpenExternal() {
  const ua = navigator.userAgent || "";
  if (!/KAKAOTALK/i.test(ua)) return; // 카톡 인앱 브라우저일 때만

  const url = location.href;
  const isIOS = /iphone|ipad|ipod/i.test(ua);
  const isAndroid = /android/i.test(ua);

  // 안드로이드: 크롬 intent 스킴(자동 전환 성공률 높음, 미설치 시 fallback)
  const androidIntent =
    "intent://" +
    url.replace(/^https?:\/\//, "") +
    "#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=" +
    encodeURIComponent(url) +
    ";end";
  // iOS·기타: 카카오 공식 외부 열기 스킴(기본 브라우저)
  const kakaoExt = "kakaotalk://web/openExternal?url=" + encodeURIComponent(url);
  const ext = isAndroid ? androidIntent : kakaoExt;

  // 1) 세션당 1회 자동 전환 시도(실패 시 무한 리다이렉트 방지)
  try {
    if (!sessionStorage.getItem("kakaoExtTried2")) {
      sessionStorage.setItem("kakaoExtTried2", "1");
      location.href = ext;
    }
  } catch {
    location.href = ext;
  }

  // 2) 상단 안내 배너(자동 전환이 막힌 경우 수동 버튼/가이드)
  const bar = document.createElement("div");
  bar.className = "kakao-ext-bar";
  bar.innerHTML = `
    <span class="kakao-ext-msg">카카오톡에서는 음성 암송 등 일부 기능이 제한돼요.</span>
    <a class="kakao-ext-open" href="${ext}">기본 브라우저로 열기</a>
    <button type="button" class="kakao-ext-close" aria-label="닫기">✕</button>
    <span class="kakao-ext-hint">안 열리면 우측 ${isIOS ? "하단 공유 → ‘Safari로 열기’" : "⋮ → ‘다른 브라우저로 열기’"}</span>`;
  document.body.prepend(bar);
  bar.querySelector(".kakao-ext-close").addEventListener("click", () => bar.remove());
}

// ------------------------------------------------------------
// 시작
// ------------------------------------------------------------
// ----  PWA 홈 화면 추가: beforeinstallprompt 캡처 ----
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  window.__pwaInstallPrompt = e;
  // 요약 화면이 이미 렌더링된 상태라면 버튼을 바로 활성화
  const btn = document.getElementById("install-btn");
  if (btn) btn.hidden = false;
});

window.addEventListener("appinstalled", () => {
  window.__pwaInstallPrompt = null;
  const btn = document.getElementById("install-btn");
  if (btn) btn.hidden = true;
});

// ------------------------------------------------------------
// 첫 방문 인트로 + 도움말
// ------------------------------------------------------------
// ------------------------------------------------------------
// 관리자 '오늘의 메시지'(공지·격려) — 그날 첫 접속 1회 모달.
//   app_config.dailyMessage = { id, type:"notice"|"cheer", title, body, from, to }
//   표시 조건: from<=오늘<=to (각 비면 무제한) AND 그 메시지를 오늘 아직 안 봄
//   하루 1회 판별: localStorage "memorize-dailymsg::<사용자>::<id>::<날짜>"
// ------------------------------------------------------------
function dailyMsgSeenKey(id) {
  const u = loadUser();
  const uid = u && u.user_id ? u.user_id : "guest";
  return `memorize-dailymsg::${uid}::${id}::${todayYmd()}`;
}
function dailyMsgActive(m) {
  if (!m || !m.body) return false;
  const today = todayYmd();
  if (m.from && today < m.from) return false; // 시작 전
  if (m.to && today > m.to) return false;      // 종료 후
  return true;
}
let _skipAutoDaily = false; // 미리보기(?preview=daily) 때 자동 표시를 막아 중복 노출 방지

// 활성(기간 내) 목록에서 표시할 하나 고르기 — 겹치면 가장 최근 등록(id 큰 것)
function pickActiveDailyMessage(value) {
  const list = Array.isArray(value) ? value : (value && value.body ? [value] : []);
  const active = list.filter(dailyMsgActive);
  if (!active.length) return null;
  return active.reduce((a, b) => (Number(b.id) > Number(a.id) ? b : a));
}

function maybeShowDailyMessage() {
  if (_skipAutoDaily || !window.api || !api.getConfig) return;
  api.getConfig("dailyMessage").then((d) => {
    const m = pickActiveDailyMessage(d && d.value);
    if (m) {                                     // ① 관리자 공지·격려가 있으면 표시(하루 1회)
      const key = dailyMsgSeenKey(m.id || "x");
      let seen = false;
      try { seen = localStorage.getItem(key) === "1"; } catch {}
      if (!seen) {
        try { localStorage.setItem(key, "1"); } catch {}
        showDailyMessage(m);
      }
    }
    maybeShowWeeklyMeditation();                  // ② 공지 유무와 무관하게 오늘의 묵상은 항상 표시(모달은 겹치지 않게 순서대로 뜸)
    maybeShowSermonChatPromo();                   // ③ 평생 1회, '내게 주시는 말씀' 홍보 팝업(역시 겹치지 않게 순서대로 뜸)
  }).catch(() => { maybeShowWeeklyMeditation(); maybeShowSermonChatPromo(); });
}

// 긴 본문을 문장 경계에서 약 절반으로 줄인다(오늘의 묵상이 너무 길지 않게).
function halfText(text) {
  const t = String(text || "").trim();
  const parts = t.match(/[^.!?。]+[.!?。]*\s*/g);
  if (!parts || parts.length <= 1) return t;
  const target = t.length * 0.5;
  let out = "";
  for (const p of parts) { out += p; if (out.length >= target) break; }
  return out.trim();
}

// buildWeeklyMeditations가 '풍성한' 결과(요일별 여러 항목)를 만들 수 있는 설교인지.
// 없으면(주로 주일 예배 직후, 설교가 아직 아카이브에 안 올라온 잠깐의 공백) 전주 자료로 대체할지 판단하는 데 쓴다.
function sermonHasMeditationContent(s) {
  return !!(s && (
    (s.dailyMeditations && s.dailyMeditations.length) ||
    (s.points && s.points.length) ||
    (s.questions && s.questions.length)
  ));
}

// 공지가 없는 날: 이번주 말씀 + 연결 설교의 핵심포인트·적용질문으로 '오늘의 묵상'을 매일 다르게 보여준다.
function buildWeeklyMeditations(verse, sermon) {
  // ① 설교에 7일치 묵상(dailyMeditations)이 있으면 그것을 그대로 쓴다(요일별로 하나씩).
  const daily = (sermon && sermon.dailyMeditations) || [];
  if (daily.length) {
    return daily
      .filter((d) => d && (d.message || d.question))
      .map((d) => ({ heading: d.heading || "", message: d.message || "", question: d.question || "" }));
  }
  // ② 없으면(예전 설교) 기존처럼 핵심포인트+적용질문으로 구성한다.
  const items = [];
  const pts = (sermon && sermon.points) || [];
  const qs = (sermon && sermon.questions) || [];
  const n = Math.max(pts.length, qs.length);
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q = qs.length ? qs[i % qs.length] : "";
    const full = p ? (p.body || "") : ((sermon && sermon.summary) || verse.text);
    const message = halfText(full);            // 핵심포인트 전문 대신 절반 분량으로
    if (!message && !q) continue;
    items.push({ heading: p ? (p.heading || "") : "", message, question: q });
  }
  if (!items.length) {
    // 이번주 설교가 말씀 아카이브에 아직 등록 전(주로 주일 예배 직후 관리자가 올리기 전 잠깐의 공백).
    // 예전엔 이때 이번주 말씀 본문만 밋밋하게 보여줘서 '멈춘 것처럼' 보였다 — 안내 문구로 구분.
    items.push(!sermon
      ? { heading: "", message: "이번 주 설교 묵상 자료를 준비하고 있어요.\n잠시 후 다시 확인해 주세요 🙏", question: "" }
      : { heading: "", message: verse.text, question: "오늘 이 말씀을 삶의 어느 자리에 적용할 수 있을까요?" });
  }
  return items;
}

// force   : '하루 1회' 제한을 무시하고 무조건 표시(미리보기·버튼)
// withTabs: 요일 탭 표시 여부 — 자동 팝업/어드민 미리보기는 false(성도가 보는 그대로), 매일묵상 버튼만 true
function maybeShowWeeklyMeditation(force, withTabs) {
  const info = getWeeklyVerseInfo();
  if (!info || !info.verse) return;
  loadSermons().then((sermons) => {
    // 묵상 발행 주기는 '월~일'이다 — 설교(및 요일별 묵상)는 주일 오후에 등록되므로, 그 설교가
    // 실제로 다루는 한 주는 다음날(월)부터 그다음 주일까지. 즉 주일(오늘)은 이번주 설교가
    // 아직 없을뿐더러, 있다 해도 그 주기의 첫날이 아니라 직전 설교(지난주 등록분) 주기의
    // 마지막 날이다 — 그래서 주일엔 항상 직전 주 말씀·설교를 쓴다.
    // ⚠️ 다음 주 구절이 토요일에 먼저 올라올 때도 있다(2026-08-29 확인 — 35번이 8/28
    // 토요일에 등록, 설교는 그다음 날인 주일 오후에야 연결됨). 그 사이 토요일에 접속하면
    // 다음 주 구절이 '이번 주'로 잡혀 있는데 설교가 없어 '준비 중'만 뜬다 — 그래서
    // 토요일도 주일과 똑같이 직전 주 말씀·설교를 쓴다.
    const p = kstDateParts() || {};
    const todayDow = p.y ? new Date(p.y, (p.m || 1) - 1, p.d || 1).getDay() : (kstDayNumber() % 7);
    const isWeekendGap = todayDow === 6 || todayDow === 0; // 토(6) · 일(0)
    let verse = info.verse;
    let usingPrev = false;
    if (isWeekendGap && info.prevVerse) { verse = info.prevVerse; usingPrev = true; }
    let sermon = findSermonForVerse(verse.no, sermons);
    if (usingPrev && !sermonHasMeditationContent(sermon)) { // 전주 자료조차 없으면(극초기) 이번주로 되돌림
      verse = info.verse; sermon = findSermonForVerse(verse.no, sermons); usingPrev = false;
    }
    const items = buildWeeklyMeditations(verse, sermon);
    if (!items.length) return;
    // 월=0 … 일=6 (발행 주기가 월~일이므로 요일 인덱스도 월요일 기준). 7개면 요일마다 고정, 그보다 적으면 순환.
    const dayIdx = (todayDow + 6) % 7;
    const pick = dayIdx % items.length;
    if (!force) {                                // 하루 1회만 자동 표시(미리보기는 무시). 이번주 구절 기준으로 고정(대체 여부 무관).
      const key = dailyMsgSeenKey(`med-${info.verse.no}-${pick}`);
      try { if (localStorage.getItem(key) === "1") return; } catch {}
      try { localStorage.setItem(key, "1"); } catch {}
    }
    // 자동 팝업·어드민 미리보기는 '오늘 것 하나만'. 요일 탭은 매일 묵상 버튼으로 열 때만.
    showMeditationModal(items, pick, verse, sermon, !!withTabs, usingPrev);
  }).catch(() => {});
}

// 오늘의 묵상 모달 — 이번주 묵상 전체를 탭으로 넘겨볼 수 있다(기본은 오늘 것).
// usingPrev: 이번주 설교가 아직 준비 전이라 전주 자료로 대체해 보여주는 중임을 표시.
function showMeditationModal(items, startIdx, verse, sermon, showTabs, usingPrev) {
  // 탭은 요일 한 글자(7일치일 때). 그 외에는 번호 — 제목을 쓰면 너무 길어 화면을 잡아먹는다.
  // 발행 주기가 월~일이라 배열 인덱스도 월요일 시작(maybeShowWeeklyMeditation의 dayIdx와 동일 기준).
  const DAYS = ["월", "화", "수", "목", "금", "토", "일"];
  const tabLabel = (i) => (items.length === 7 ? DAYS[i] : String(i + 1));
  const open = () => {
    if (document.querySelector(".cheer-overlay")) { setTimeout(open, 300); return; }
    const wrap = document.createElement("div");
    wrap.id = "daily-message";
    wrap.className = "cheer-overlay";
    wrap.innerHTML = `
      <div class="cheer-card dmsg-card med" role="dialog" aria-modal="true">
        <div class="cheer-ref dmsg-badge">🌿 오늘의 묵상${usingPrev ? ' <span class="med-prev-tag">지난주</span>' : ""}</div>
        ${showTabs && items.length > 1
          ? `<div class="med-tabs">${items.map((it, i) =>
              `<button class="med-tab${i === startIdx ? " today" : ""}" data-i="${i}">${tabLabel(i)}</button>`).join("")}</div>`
          : ""}
        <div class="dmsg-title" id="med-title"></div>
        <div class="cheer-msg dmsg-body" id="med-body"></div>
        <div class="med-actions">
          ${verse && verse.url ? `<a class="med-more" id="med-watch" href="${verse.url}" target="_blank" rel="noopener">설교</a>` : ""}
          ${sermon ? `<button class="med-more" id="med-sermon">요약</button>` : ""}
          <button class="cheer-ok" id="dmsg-ok">확인</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    const card = wrap.querySelector(".dmsg-card");
    const toTop = () => { if (card) { card.scrollTop = 0; requestAnimationFrame(() => { card.scrollTop = 0; }); } };
    const render = (i) => {
      const it = items[i];
      wrap.querySelector("#med-title").textContent = it.heading || "오늘의 묵상";
      wrap.querySelector("#med-body").innerHTML =
        `<div class="med-msg">${scEmphasis(it.message)}</div>` +
        (it.question ? `<div class="med-q"><b>💬 오늘의 적용 질문</b><br>${scEmphasis(it.question)}</div>` : "");
      wrap.querySelectorAll(".med-tab").forEach((b) => b.classList.toggle("on", Number(b.dataset.i) === i));
      toTop();
    };
    render(startIdx);
    wrap.querySelectorAll(".med-tab").forEach((b) =>
      b.addEventListener("click", () => render(Number(b.dataset.i))));
    requestAnimationFrame(() => wrap.classList.add("show"));
    const close = () => { wrap.classList.remove("show"); setTimeout(() => wrap.remove(), 250); };
    const ok = wrap.querySelector("#dmsg-ok");
    const done = wireModalConfirm(ok, close);
    const sBtn = wrap.querySelector("#med-sermon");   // 묵상 → 설교 요약으로 이동
    if (sBtn) sBtn.addEventListener("click", () => {
      done();
      setTimeout(() => renderSermonSummary(verse, sermon, renderSummary, "← 뒤로"), 260);
    });
    toTop();
    wrap.addEventListener("click", (e) => { if (e.target === wrap) done(); });
  };
  open();
}

// '내게 주시는 말씀' 홍보 팝업 — 평생 1회, 예시 질문을 탭하면 그 화면으로 이동해 바로 질문·답변까지 보여준다.
// 예시 질문은 '대표' 주제의 기본 질문 목록에서 매주 월요일 기준으로 하나씩 순환한다(오늘의 묵상과 동일한 월~일 주기 계산 방식).
const SC_PROMO_SEEN_KEY = "sc-promo-seen-v1";
function scPromoWeeklyQuestion() {
  const qs = (SERMON_TOPICS[0] && SERMON_TOPICS[0].qs) || [];
  if (!qs.length) return "";
  const p = kstDateParts() || {};
  const todayDow = p.y ? new Date(p.y, (p.m || 1) - 1, p.d || 1).getDay() : 0;
  const dayIdx = (todayDow + 6) % 7; // 월=0…일=6
  const weekIdx = Math.floor(((kstDayNumber() || 0) - dayIdx) / 7);
  return qs[((weekIdx % qs.length) + qs.length) % qs.length];
}
function maybeShowSermonChatPromo() {
  try { if (localStorage.getItem(SC_PROMO_SEEN_KEY) === "1") return; } catch {}
  const sampleQ = scPromoWeeklyQuestion();
  if (!sampleQ) return;
  const open = () => {
    if (document.querySelector(".cheer-overlay")) { setTimeout(open, 300); return; } // 다른 모달과 안 겹치게 대기
    // '나중에 볼게요'로 건너뛰면 다음 로그인 때 다시 뜬다 — 실제로 체험(질문 탭)했을 때만 평생 숨김 처리.
    const wrap = document.createElement("div");
    wrap.id = "sc-promo";
    wrap.className = "cheer-overlay";
    wrap.innerHTML = `
      <div class="cheer-card promo-sc" role="dialog" aria-modal="true">
        <div class="cheer-ref dmsg-badge">💬 이럴 때, 물어보세요</div>
        <div class="dmsg-title">내게 주시는 말씀</div>
        <div class="cheer-msg">궁금하거나 힘들 때, 담임목사님 설교에서 AI가 답을 찾아드려요.<br>이번 주엔 이런 질문은 어떠세요?</div>
        <button class="sc-promo-q" id="sc-promo-q">${sampleQ}</button>
        <button class="sc-promo-skip" id="sc-promo-skip">나중에 볼게요</button>
      </div>`;
    document.body.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add("show"));
    const close = () => { wrap.classList.remove("show"); setTimeout(() => wrap.remove(), 250); };
    wrap.querySelector("#sc-promo-skip").addEventListener("click", close);
    wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });
    wrap.querySelector("#sc-promo-q").addEventListener("click", () => {
      try { localStorage.setItem(SC_PROMO_SEEN_KEY, "1"); } catch {} // 체험했을 때만 평생 숨김
      close();
      setTimeout(() => {
        renderSermonChat();
        const input = document.getElementById("sc-q");
        if (input) { input.value = sampleQ; scAsk(); }
      }, 260);
    });
  };
  open();
}

// 관리자 미리보기 — 하루1회 상태(localStorage) 안 건드리고 강제 표시
function previewDailyMessage() {
  if (!window.api || !api.getConfig) return;
  api.getConfig("dailyMessage").then((d) => {
    const m = pickActiveDailyMessage(d && d.value);
    if (m) showDailyMessage(m);        // 공지·격려가 있으면 미리보기
    maybeShowWeeklyMeditation(true);   // 공지 유무와 무관하게 오늘의 묵상도 항상 미리보기(하루1회 상태 무시)
  }).catch(() => {});
}
function showDailyMessage(m) {
  const isNotice = m.type === "notice";
  const isMed = m.type === "meditation";
  const icon = isNotice ? "📢" : "🌿";
  const badge = isNotice ? "공지" : isMed ? "오늘의 묵상" : "격려";
  const open = () => {
    if (document.querySelector(".cheer-overlay")) { setTimeout(open, 300); return; } // 다른 모달과 안 겹치게
    const wrap = document.createElement("div");
    wrap.id = "daily-message";
    wrap.className = "cheer-overlay";
    wrap.innerHTML = `
      <div class="cheer-card dmsg-card${isNotice ? " notice" : ""}${isMed ? " med" : ""}" role="dialog" aria-modal="true">
        <div class="cheer-icon">${icon}</div>
        <div class="cheer-ref dmsg-badge">${badge}</div>
        ${m.title ? `<div class="dmsg-title">${boardEsc(m.title)}</div>` : ""}
        <div class="cheer-msg dmsg-body">${String(m.body || "").replace(/\n/g, "<br>")}</div>
        <button class="cheer-ok" id="dmsg-ok">확인</button>
      </div>`;
    document.body.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add("show"));
    const close = () => { wrap.classList.remove("show"); setTimeout(() => wrap.remove(), 250); };
    const ok = document.getElementById("dmsg-ok");
    wireModalConfirm(ok, close);   // 포커스로 하단 스크롤되지 않게 preventScroll을 쓴다
    const card = wrap.querySelector(".dmsg-card");
    if (card) { card.scrollTop = 0; requestAnimationFrame(() => { card.scrollTop = 0; }); } // 항상 맨 위부터
    wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });
  };
  open();
}

const INTRO_KEY = "memorize-intro-seen";

function maybeShowIntro(next) {
  let seen = false;
  try { seen = localStorage.getItem(INTRO_KEY) === "1"; } catch {}
  if (seen) return next();
  renderIntro(next);
}

function markIntroSeen() {
  try { localStorage.setItem(INTRO_KEY, "1"); } catch {}
}

// 인트로 기본값(폴백) — 관리자가 introSlides를 안 넣었거나 못 불러올 때 사용.
const INTRO_SLIDES_DEFAULT = [
  { icon: "🙏", title: "환영합니다", body: "고척교회 <b>성경말씀 암송</b>에<br>오신 것을 진심으로 환영합니다.<br><br>주의 말씀을 마음에 새기는 이 길에<br>하나님의 은혜가 함께하시기를<br>기도합니다. 🌿" },
  { icon: "📖", title: "성경말씀 암송하기", body: "성경 구절을 단계별로 직접 채우며 암송해요.<br>교구·교회학교로 로그인하면 내 진도가 저장돼요." },
  { icon: "✍️", title: "3단계로 익혀요", body: "① 빈칸 맛보기 (약 25%)<br>② 빈칸 늘리기 (약 65%)<br>③ 전체 암송 (100%)<br><br>맞으면 다음 칸으로, 틀리면 다시 입력해요." },
  { icon: "🔊", title: "듣고, 말하며 암송", body: "🔊 듣기로 말씀을 들어요 (빠르게 여러 번 누르면 반복).<br>🎤 음성 암송으로 직접 말해서 점검해요." },
];
let introSlidesCache = null; // 관리자 설정(app_config.introSlides) 캐시

// 인트로 슬라이드를 미리 로드해 캐시. 실패/빈값이면 기본값 유지. (프로미스 반환 — 시작 시 대기용)
function loadIntroSlides() {
  if (!window.api || !api.getConfig) return Promise.resolve();
  return api.getConfig("introSlides").then((d) => {
    const arr = d && d.value;
    if (Array.isArray(arr)) {
      const clean = arr.filter((s) => s && (s.title || s.body));
      if (clean.length) introSlidesCache = clean;
    }
  }).catch(() => {});
}

// 첫 방문 인트로 (관리자 편집 가능, 없으면 기본값)
function renderIntro(next) {
  const slides = (introSlidesCache && introSlidesCache.length) ? introSlidesCache : INTRO_SLIDES_DEFAULT;
  let idx = 0;
  const appEl = document.getElementById("app");

  function draw() {
    const s = slides[idx];
    const last = idx === slides.length - 1;
    appEl.innerHTML = `
      <div class="intro-screen">
        <div class="intro-card">
          <div class="intro-icon">${s.icon}</div>
          <div class="intro-title">${s.title}</div>
          <div class="intro-body">${s.body}</div>
          <div class="intro-dots">${slides.map((_, i) => `<span class="intro-dot ${i === idx ? "on" : ""}"></span>`).join("")}</div>
          ${last ? `<a class="intro-watch" href="guide/">▶️ 화면으로 따라 하기</a>` : ""}
          <div class="intro-nav">
            <button class="intro-skip" id="intro-skip">건너뛰기</button>
            <button class="intro-next" id="intro-next">${last ? "시작하기" : "다음 ▸"}</button>
          </div>
        </div>
      </div>`;
    document.getElementById("intro-skip").addEventListener("click", done);
    document.getElementById("intro-next").addEventListener("click", () => {
      if (last) done();
      else { idx++; draw(); }
    });
  }
  function done() { markIntroSeen(); next(); }
  draw();
}

// 로그인 방법 안내 (교구/교회학교 탭으로 분리)
function renderLoginHelp(back) {
  const appEl = document.getElementById("app");
  const stepsFor = {
    교구: [
      '<b>구분</b>에서 <b>교구</b>를 선택하세요',
      '<b>교구</b>를 고르세요 (믿음·소망·사랑·섬김·은혜·화평·기쁨·새가족)',
      '<b>목장</b>을 적으세요 (예: 3목장 → 3, 남성목장 → 남성, 없으면 → 99)',
      '<b>이름</b>을 공백 없이 적으세요',
      '맨 아래 <b>시작하기</b>를 누르면 끝이에요! 🙌',
    ],
    교회학교: [
      '<b>구분</b>에서 <b>교회학교</b>를 선택하세요',
      '<b>부서</b>를 고르세요 (사랑부·영아부·유아부·유치부·유년부·초등부·중등부·고등부·청년부)',
      '<b>학년</b>을 적으세요 (예: 3학년)',
      '<b>이름</b>을 공백 없이 적으세요',
      '맨 아래 <b>시작하기</b>를 누르면 끝이에요! 🙌',
    ],
  };
  let tab = "교구";

  function draw() {
    const steps = stepsFor[tab]
      .map((t, i) => `<div class="lh-step"><span class="lh-no">${i + 1}</span><div>${t}</div></div>`)
      .join("");
    appEl.innerHTML = `
      <div class="help-screen">
        <div class="help-card">
          <div class="help-top">
            <h2 class="help-title">🔑 로그인 방법</h2>
            <button class="help-close" id="lh-close">✕ 닫기</button>
          </div>
          <p class="lh-intro">본인에게 맞는 탭을 고르고, 순서대로만 하시면 됩니다. 😊</p>
          <div class="lh-tabs">
            <button data-t="교구" class="${tab === "교구" ? "on" : ""}">교구</button>
            <button data-t="교회학교" class="${tab === "교회학교" ? "on" : ""}">교회학교</button>
          </div>
          <div class="login-steps">${steps}</div>
          <p class="lh-tip">💡 한 번 입력하면 다음부터는 자동으로 채워져요. 바꾸고 싶으면 <b>로그인 정보변경</b>에서 언제든 수정할 수 있어요.</p>
          <button class="help-go" id="lh-go">닫고 로그인하기</button>
        </div>
      </div>`;
    document.getElementById("lh-close").addEventListener("click", back);
    document.getElementById("lh-go").addEventListener("click", back);
    appEl.querySelectorAll(".lh-tabs button").forEach((b) =>
      b.addEventListener("click", () => { tab = b.dataset.t; draw(); })
    );
  }
  draw();
}

function renderPrivacyInfo(back) {
  const appEl = document.getElementById("app");
  appEl.innerHTML = `
    <div class="help-screen">
      <div class="help-card">
        <div class="help-top">
          <h2 class="help-title">🔐 개인정보 수집·이용 안내</h2>
          <button class="help-close" id="privacy-close">✕ 닫기</button>
        </div>
        <section class="help-section">
          <h3>수집 항목</h3>
          <ul>
            <li>이름</li>
            <li>교구/목장 또는 교회학교 부서/학년</li>
            <li>암송 진행 기록, 복습 및 도전 참여 기록</li>
            <li>게시판에 올리신 글·답글과 <b>사진</b> (모든 분에게 공개)</li>
            <li>성경필사 노트 신청 시 <b>휴대폰 번호</b> (배부가 끝나면 삭제)</li>
            <li>기기 식별용 임의 ID (알림을 켤 때만)</li>
          </ul>
        </section>
        <section class="help-section">
          <h3>이용 목적</h3>
          <ul>
            <li>개인 암송 진도 저장과 기기 간 진도 동기화</li>
            <li>교구/부서별 참여 통계 확인</li>
            <li>암송 프로그램 운영, 격려, 보고 자료 작성</li>
          </ul>
        </section>
        <section class="help-section">
          <h3>보관 기간</h3>
          <p>암송 프로그램 운영 기간 동안 보관하며, 운영 종료 또는 삭제 요청 시 확인 후 정리합니다.</p>
        </section>
        <section class="help-section">
          <h3>관리 주체</h3>
          <p>고척교회 제자양육부 신앙운동팀</p>
        </section>
        <a class="help-go privacy-full" href="privacy/">📄 전체 안내 보기 (보관·삭제·문의)</a>
        <button class="help-go" id="privacy-back">확인했습니다</button>
      </div>
    </div>`;
  document.getElementById("privacy-close").addEventListener("click", back);
  document.getElementById("privacy-back").addEventListener("click", back);
}

// ============================================================
// 📘 사용 설명서 — 어르신도 혼자 보실 수 있게.
//   한 화면에 한 가지 · 큰 글씨 · 그림 · 큰 [다음] 단추.
//   글이 빽빽한 기존 도움말(renderHelp)은 맨 끝 '자세한 안내'로 옮겼다.
//   그림은 실제 화면 사진이 아니라 단순한 그림이다 — 사진은 폰마다 다르고
//   화면이 바뀌면 곧 낡는데, 낡은 사진은 없느니만 못하다.
// ============================================================
const MANUAL = [
  {
    icon: "📱", title: "홈 화면에 앱 만들기",
    lead: "한 번만 해 두면 다음부터 바로 열려요.",
    art: '<div class="mn-phone"><div class="mn-ico">📖</div><div class="mn-cap">말씀암송</div></div>',
    steps: [
      "첫 화면 위쪽 <b>📲</b>를 누르세요.",
      "<b>안드로이드</b>는 <b>「설치」</b> 창이 바로 떠요. 누르면 끝이에요.",
      "<b>아이폰</b>은 화면 아래 <b>공유 단추</b>(□에 ↑)를 누르고,",
      "목록에서 <b>「홈 화면에 추가」</b> → <b>「추가」</b>를 누르세요.",
    ],
    tip: "바탕화면에 📖 그림이 생겨요. 다음부터는 그것만 누르시면 됩니다.",
    act: { id: "install", label: "📲 지금 만들기" },
  },
  {
    icon: "🔔", title: "알림 켜기",
    lead: "아침에 오늘의 말씀을 알려 드려요.",
    art: '<div class="mn-row"><span class="mn-btn">🔔 알림</span></div>',
    steps: [
      "첫 화면 위쪽 <b>🔔</b>를 누르세요.",
      "폰이 <b>「허용하시겠습니까?」</b> 하고 물어봐요.",
      "<b>「허용」</b>을 누르세요.",
    ],
    tip: "「허용 안 함」을 누르셨다면 폰 설정에서 다시 켜야 해요. 옆에 계신 분께 부탁하세요.",
    act: { id: "alarm", label: "🔔 지금 켜기" },
  },
  {
    icon: "🙋", title: "처음 시작하기",
    lead: "이름을 넣으면 내 기록이 저장돼요.",
    art: '<div class="mn-form"><div class="mn-line">교구 ▾</div><div class="mn-line">목장 ▾</div><div class="mn-line">이름</div></div>',
    steps: [
      "<b>교구</b>인지 <b>교회학교</b>인지 고르세요.",
      "교구는 <b>교구 · 목장 · 이름</b>을 넣어요.",
      "교회학교는 <b>부서 · 학년 · 이름</b>을 넣어요.",
      "한 번 넣으면 다음부터 그대로 이어집니다.",
    ],
    tip: "비밀번호는 없어요. 이름만 맞으면 됩니다.",
  },
  {
    icon: "✍️", title: "말씀 암송하기",
    lead: "빈칸을 채우며 세 번에 나누어 외워요.",
    art: '<div class="mn-verse">주의 말씀은 내 <span class="mn-blank">◻︎◻︎</span>에 <span class="mn-blank">◻︎</span>이요</div>',
    steps: [
      "<b>1단계</b> — 빈칸이 조금 (넷 중 하나쯤)",
      "<b>2단계</b> — 빈칸이 많이 (셋 중 둘쯤)",
      "<b>3단계</b> — 전부 빈칸",
      "맞으면 <b>초록색</b>으로 바뀌고 다음 칸으로 넘어가요.",
      "틀리면 잠깐 <b>빨간색</b>이 되고, 다시 넣으면 돼요.",
    ],
    tip: "막히면 <b>💡 힌트</b>를 누르세요. 한 글자씩 보여 줍니다.",
  },
  {
    icon: "🔊", title: "말씀 듣기",
    lead: "눈이 피로하실 땐 귀로 들으세요.",
    art: '<div class="mn-row"><span class="mn-btn mn-btn-on">▶️ 전체 듣기</span><span class="mn-btn">🔊</span></div>',
    steps: [
      "구절 옆 <b>🔊</b>를 누르면 그 말씀 하나를 읽어 줘요.",
      "<b>말씀 목록</b> 맨 위 <b>▶️ 전체 듣기</b>를 누르면 처음부터 끝까지 이어서 읽어 줘요.",
      "요절을 먼저 부르고, 잠깐 쉰 뒤 다음 말씀으로 넘어가요.",
      "듣는 동안 <b>화면이 저절로 꺼지지 않아요.</b>",
    ],
    tip: "「나의 말씀 앨범」에서는 <b>📻 3분요약</b>(설교 요약)도 함께 들을 수 있어요.",
  },
  {
    icon: "🎤", title: "소리 내어 암송하기",
    lead: "소리 내어 외우셔도 됩니다.",
    art: '<div class="mn-row"><span class="mn-btn mn-btn-on">🎤 암송 시작</span></div>',
    steps: [
      "<b>🎤 암송 시작</b>을 누르세요.",
      "말씀을 <b>소리 내어</b> 외우세요.",
      "다 하시면 <b>■ 종료</b>를 누르세요.",
      "얼마나 맞았는지 알려 줍니다.",
    ],
    tip: "처음에 폰이 <b>마이크를 써도 되냐</b>고 물어봐요. <b>「허용」</b>을 누르세요.",
  },
  {
    icon: "👑", title: "마음에 둠 · 나의 말씀 앨범",
    lead: "외운 말씀을 모아 두는 곳이에요.",
    art: '<div class="mn-row"><span class="mn-btn">👑 마음에 두었나이다</span></div>',
    steps: [
      "3단계까지 마치면 <b>👑 마음에 두었나이다</b>를 누를 수 있어요.",
      "첫 화면 <b>📖 나의 말씀 앨범</b>에 모입니다.",
      "앨범에서는 <b>요절이나 말씀을 가리고</b> 스스로 맞혀 볼 수 있어요.",
    ],
    tip: "앨범에서도 <b>▶️ 전부 듣기</b>로 이어서 들을 수 있어요.",
  },
  {
    icon: "🏆", title: "순위와 응원",
    lead: "함께 하면 더 오래 갑니다.",
    art: '<div class="mn-rank"><span>1위  화평-20 김○○</span><span class="mn-chip">👏 3</span></div>',
    steps: [
      "첫 화면 <b>🏆 순위</b>에서 이번 주 도전 순위를 봐요.",
      "다른 분 줄의 <b>👏</b>를 누르면 응원이 전해져요.",
      "응원은 <b>하루에 한 분당 한 번</b>이에요.",
    ],
    tip: "내가 <b>오늘 한 번이라도 도전</b>해야 응원을 보낼 수 있어요.",
  },
  {
    icon: "💬", title: "응원·기도·공감 게시판",
    lead: "서로 격려하는 자리예요.",
    art: '<div class="mn-row"><span class="mn-chip">👍</span><span class="mn-chip">🙏</span><span class="mn-chip">❤️</span></div>',
    steps: [
      "첫 화면 <b>💬 응원·기도·공감</b>을 누르세요.",
      "글을 남기거나 남의 글에 답글을 달 수 있어요.",
      "<b>👍 🙏 ❤️</b>를 눌러 마음을 표시할 수도 있어요.",
    ],
    tip: "기도 제목을 남기시면 함께 기도합니다.",
  },
  {
    icon: "💬", title: "내게 주시는 말씀",
    lead: "궁금한 것을 물어보면 설교에서 찾아 답해 드려요.",
    art: '<div class="mn-row"><span class="mn-btn mn-btn-on">💬 내게 주시는 말씀</span></div>',
    steps: [
      "첫 화면 <b>💬 내게 주시는 말씀</b>을 누르세요.",
      "궁금한 것이나 마음에 걸리는 일을 적으세요.",
      "<b>목사님 설교에서 찾아</b> 답해 드립니다.",
    ],
    tip: "인터넷에서 아무 말이나 가져오는 것이 아니라, <b>목사님 설교</b> 안에서만 찾습니다.",
  },
  {
    icon: "🌿", title: "매일 묵상",
    lead: "그 주 설교를 요일마다 한 조각씩.",
    art: '<div class="mn-row"><span class="mn-btn mn-btn-on">🌿 매일 묵상</span></div>',
    steps: [
      "첫 화면 <b>🌿 매일 묵상</b>을 누르세요.",
      "그 주 설교가 <b>요일별로 한 조각씩</b> 나뉘어 있어요.",
      "요일 단추를 눌러 다른 날 것도 볼 수 있어요.",
    ],
    tip: "짧아서 아침에 한 번 읽기 좋습니다.",
  },
  {
    icon: "✍️", title: "성경필사 노트 신청",
    lead: "말씀을 손으로 따라 쓰는 노트예요.",
    art: '<div class="mn-row"><span class="mn-btn mn-btn-on">✍️ 성경필사 노트 신청</span></div>',
    steps: [
      "첫 화면 <b>✍️ 성경필사 노트 신청</b>을 누르세요.",
      "노트 크기(A5·A4)와 <b>필사 유형</b>, 번역본을 고르세요.",
      "원하는 성경을 골라 담으세요. <b>한 분 5부까지</b>.",
      "휴대폰 번호를 남기시면 준비되는 대로 알려 드립니다.",
    ],
    tip: "주일에 <b>4층 새가족실</b>에서 받으시고, 그때 <b>권당 3,000원</b>을 내시면 됩니다.",
  },
  {
    icon: "⚙️", title: "글씨 크게 하기",
    lead: "잘 안 보이시면 키우세요.",
    art: '<div class="mn-row"><span class="mn-btn">가</span><span class="mn-btn mn-btn-mid">가</span><span class="mn-btn mn-btn-on mn-btn-big">가</span></div>',
    steps: [
      "첫 화면 위쪽 <b>⚙️</b>를 누르세요.",
      "<b>글씨 크기</b>에서 <b>큼</b>이나 <b>아주 큼</b>을 고르세요.",
      "이름이나 목장이 바뀌었으면 <b>정보 변경</b>에서 고치세요.",
    ],
    tip: "읽어 주는 <b>속도</b>도 여기서 느리게 할 수 있어요.",
  },
];

let manualIdx = -1;      // -1이면 목차 화면
let _manualClose = null; // 닫을 때 돌아갈 곳

// 목차 <-> 한 항목. 어느 쪽에서든 X로 나갈 수 있어야 갇힌 느낌이 안 든다.
function renderManual(onClose, idx) {
  if (onClose) _manualClose = onClose;
  manualIdx = typeof idx === "number" ? idx : -1;
  const appEl = document.getElementById("app");
  const back = () => (_manualClose || renderSummary)();
  const NUM = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮";

  if (manualIdx < 0) {
    appEl.innerHTML = `
      <div class="mn-screen">
        <div class="mn-top">
          <h2 class="mn-title">📘 사용 설명서</h2>
          <button class="mn-close" id="mn-close">✕ 닫기</button>
        </div>
        <p class="mn-lead2">어려우시면 <b>①번부터 하나씩</b> 따라 해 보세요.</p>
        <a class="mn-watch" href="guide/">▶️ 화면으로 따라 하기</a>
        <div class="mn-toc">
          ${MANUAL.map((m, i) => `
            <button class="mn-item" data-go="${i}">
              <span class="mn-num">${NUM.charAt(i) || (i + 1)}</span>
              <span class="mn-ic">${m.icon}</span>
              <span class="mn-tx"><b>${m.title}</b><br><span class="mn-sub">${m.lead}</span></span>
              <span class="mn-arrow">›</span>
            </button>`).join("")}
        </div>
        <button class="mn-more" id="mn-more">❓ 자세한 안내 · 개인정보 보기</button>
        <p class="mn-help-line">잘 안 되시면 주일 <b>1층 로비</b>에서 도와드립니다 🙌</p>
      </div>`;
    document.getElementById("mn-close").addEventListener("click", back);
    document.getElementById("mn-more").addEventListener("click", () => renderHelp(() => renderManual(null, -1)));
    appEl.querySelectorAll(".mn-item").forEach((b) =>
      b.addEventListener("click", () => renderManual(null, Number(b.dataset.go))));
    window.scrollTo(0, 0);
    return;
  }

  const m = MANUAL[manualIdx];
  const prev = manualIdx > 0 ? manualIdx - 1 : null;
  const next = manualIdx < MANUAL.length - 1 ? manualIdx + 1 : null;
  appEl.innerHTML = `
    <div class="mn-screen mn-detail">
      <div class="mn-top">
        <button class="mn-back" id="mn-toc">☰ 목차</button>
        <span class="mn-count">${manualIdx + 1} / ${MANUAL.length}</span>
        <button class="mn-close" id="mn-close">✕ 닫기</button>
      </div>
      <div class="mn-card">
        <div class="mn-big-ic">${m.icon}</div>
        <h3 class="mn-h3">${NUM.charAt(manualIdx) || ""} ${m.title}</h3>
        <p class="mn-lead">${m.lead}</p>
        ${m.art ? `<div class="mn-art">${m.art}</div>` : ""}
        <ol class="mn-steps">${m.steps.map((t) => `<li>${t}</li>`).join("")}</ol>
        ${m.tip ? `<div class="mn-tip">💡 ${m.tip}</div>` : ""}
        ${m.act ? `<button class="mn-act" id="mn-act">${m.act.label}</button>` : ""}
      </div>
      <div class="mn-nav">
        ${prev !== null ? `<button class="mn-nav-btn" id="mn-prev">◀ 이전</button>` : `<span class="mn-nav-gap"></span>`}
        ${next !== null
          ? `<button class="mn-nav-btn mn-nav-main" id="mn-next">다음 ▶</button>`
          : `<button class="mn-nav-btn mn-nav-main" id="mn-done">✓ 다 봤어요</button>`}
      </div>
    </div>`;
  document.getElementById("mn-close").addEventListener("click", back);
  document.getElementById("mn-toc").addEventListener("click", () => renderManual(null, -1));
  if (prev !== null) document.getElementById("mn-prev").addEventListener("click", () => renderManual(null, prev));
  if (next !== null) document.getElementById("mn-next").addEventListener("click", () => renderManual(null, next));
  const done = document.getElementById("mn-done");
  if (done) done.addEventListener("click", back);
  // 읽고 나서 그 자리에서 바로 해 볼 수 있게 — 화면을 옮기지 않는다
  const act = document.getElementById("mn-act");
  if (act && m.act) act.addEventListener("click", () => {
    if (m.act.id === "install") installToHome();
    else if (m.act.id === "alarm") alarmFromHome();
  });
  window.scrollTo(0, 0);
}

// 도움말 전체 화면 (onClose: 닫을 때 돌아갈 처리)
function renderHelp(onClose) {
  const appEl = document.getElementById("app");
  appEl.innerHTML = `
    <div class="help-screen">
      <div class="help-card">
        <div class="help-top">
          <h2 class="help-title">❓ 도움말</h2>
          <button class="help-close" id="help-close">✕ 닫기</button>
        </div>

        <section class="help-section">
          <h3>📖 이 앱은?</h3>
          <p>성경 구절을 단계별로 직접 채우며 암송하는 도구예요. 교구·교회학교로 로그인하면 개인별 진도가 저장되고, 다른 기기에서도 이어서 할 수 있어요.</p>
        </section>

        <section class="help-section">
          <h3>🙋 로그인 (정보 입력)</h3>
          <p>처음에 <b>구분(교구/교회학교)</b>을 고르고 정보를 입력해요. 교구는 <b>교구·목장·이름</b>, 교회학교는 <b>부서·학년·이름</b>이에요. 한 번 입력하면 다음부터는 그대로 이어집니다. <b>정보 변경</b>으로 언제든 바꿀 수 있어요.</p>
        </section>

        <section class="help-section">
          <h3>✍️ 3단계 학습</h3>
          <ul>
            <li><b>1단계</b> 빈칸 맛보기 — 일부 단어만 빈칸 (약 25%)</li>
            <li><b>2단계</b> 빈칸 늘리기 — 더 많은 빈칸 (약 65%)</li>
            <li><b>3단계</b> 전체 암송 — 출처만 보고 전체 입력</li>
          </ul>
          <p>맞으면 초록색으로 잠기고 다음 칸으로 이동해요. 틀리면 잠깐 빨갛게 표시된 뒤 다시 입력할 수 있어요. 모든 칸을 맞히면 다음 단계로 넘어가요.</p>
        </section>

        <section class="help-section">
          <h3>🔊 말씀 듣기</h3>
          <p>목록의 <b>🔊</b> 버튼이나 테스트 화면의 <b>🔊 듣기</b>로 말씀을 들을 수 있어요. <b>빠르게 여러 번 누르면 그 횟수만큼 반복</b>해서 읽어줘요.</p>
        </section>

        <section class="help-section">
          <h3>🎤 음성 암송</h3>
          <p><b>🎤 암송 시작</b>을 누르고 말씀을 소리 내어 외운 뒤 <b>■ 종료</b>를 누르면 정확도를 알려줘요 (정확도가 충분히 높으면 통과). 크롬·사파리에서 마이크를 허용해 주세요.</p>
        </section>

        <section class="help-section">
          <h3>🏷️ 내 기록 & 진행 표시</h3>
          <p><b>기록보기</b>에서 전체 완료율과 단계별 개수를 한눈에 볼 수 있어요. 카드 배지는 <b>미시도 · 1단계 · 2단계 · 완료</b>(+ 암송 횟수)를 나타내요.</p>
        </section>

        <section class="help-section">
          <h3>📲 공유 & 홈 화면 추가</h3>
          <p>요약 화면의 <b>공유하기</b>로 가족·목장원들에게 링크를 보낼 수 있고, <b>홈 화면에 추가</b>로 앱처럼 바로 열 수 있어요.</p>
        </section>

        <section class="help-section">
          <h3>🔒 개인정보 안내</h3>
          <ul>
            <li><b>수집 항목</b>: 구분(교구/교회학교)·소속·목장/학년·이름과 암송·도전 기록이에요. <b>성경필사 노트를 신청할 때만 휴대폰 번호</b>를 받습니다(노트가 준비되면 연락드리기 위해). 주민등록번호·주소·결제정보는 <b>받지 않습니다</b>.</li>
            <li><b>저장·용도</b>: 기록은 교회가 쓰는 클라우드 데이터베이스에 암호화 전송으로 저장되어 <b>본인 진도 관리와 도전 순위</b>에만 쓰입니다. 광고에 쓰거나 팔지 않습니다. 「내게 주시는 말씀」에 물어보신 <b>질문 글은 답을 만드는 AI로 전달</b>됩니다.</li>
            <li><b>순위 공개 범위</b>: 도전 순위에는 <b>이름과 소속</b>만 표시됩니다(연락처 없음). 참여한 분만 표시돼요.</li>
            <li><b>변경·삭제</b>: 이름·소속은 <b>로그인 정보변경</b>에서 언제든 수정할 수 있어요. 기록을 지우고 싶으시면 <a href="privacy/" target="_blank" rel="noopener">개인정보 안내</a>의 방법으로 알려 주세요(게시판·이메일·로비).</li>
          </ul>
        </section>

        <button class="help-go" id="help-go">닫고 시작하기</button>
      </div>
    </div>`;
  document.getElementById("help-close").addEventListener("click", onClose);
  document.getElementById("help-go").addEventListener("click", onClose);
}

// ============================================================
// 매일 말씀 암송 도전(챌린지) + 순위
// ============================================================
let challengeSession = []; // 이번 세션에 이미 나온 구절 no (중복 회피)

// 오늘 도전 완료 수 (이 기기, 새로고침에도 유지)
function challengeCountKey() {
  const d = new Date();
  const z = (n) => String(n).padStart(2, "0");
  return "challenge-count-" + d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate());
}
function todayChallengeCount() {
  try { return parseInt(localStorage.getItem(challengeCountKey()) || "0", 10) || 0; }
  catch (e) { return 0; }
}
function bumpTodayChallenge() {
  const k = challengeCountKey();
  let n = 0;
  try { n = parseInt(localStorage.getItem(k) || "0", 10) || 0; } catch {}
  n++;
  try { localStorage.setItem(k, String(n)); } catch {}
  return n;
}

// 랜덤 구절 배정(세션 내 중복 회피, 모두 소진 시 리셋) → 도전 시작
function startChallenge() {
  if (!verses.length) return;
  // 어려운 차례에는 '이미 3단계까지 마친 구절'에서 고른다. 아직 익히는 중인 구절에
  // 글자 수까지 감추면 도전이 아니라 벽이 된다. 마친 구절이 없으면 그냥 보통 도전이다.
  const ready = isHardTurn() ? hardPool() : [];
  const hard = ready.length > 0;
  const from = hard ? ready : verses;
  let pool = from.filter((v) => !challengeSession.includes(v.no));
  if (!pool.length) { challengeSession = []; pool = from.slice(); }
  const pick = pool[Math.floor(Math.random() * pool.length)];
  challengeSession.push(pick.no);
  challengeEased = false;
  renderChallenge(pick, hard);
}

// 어려운 도전을 '이번만' 접었는지. startChallenge에서만 내린다 —
// renderChallenge는 3분요약을 닫을 때도 다시 그려서, 거기서 내리면 접은 것이 풀린다.
let challengeEased = false;

// 도전에서 '도움'을 받았는지 — 💡 힌트 또는 🧠 기억법을 한 번이라도 열었는지.
//   힌트를 보고 맞힌 구절은 아직 덜 익은 것이라, 완료 뒤 그 구절 암송 화면으로 이어 준다.
//   💡 풀이는 뜻을 이해하는 것이지 답을 얻는 게 아니라 도움으로 세지 않는다.
let challengeUsedHelp = false;

// "구절" 밑줄(빈칸 폭)을 em 배율로 어림하는 방식은 한글·숫자·콜론이 섞이면 늘 어딘가
// 어긋났다("밑줄이 그래도 길어요") — 그래서 어림을 관두고 캔버스로 그 폰트의 실제
// 글자 폭을 정확히 재서 폭을 맞춘다.
// ⚠️ 처음엔 좁은 화면을 감안해 시작 크기 자체를 16px로 낮췄더니, "막 11:3"처럼 짧은
// 참조까지 본문보다 작게 나와 "폰트가 너무 작다"는 지적을 받았다(2026-08-31) — **짧은
// 참조는 줄일 이유가 없다.** 이제 본문과 같은 크기(19px 안팎, 글씨 크게 설정이면
// 23·27px)로 시작하고, 실제로 "← 뒤로"와 한 줄에 안 들어갈 때만(책 이름이 길어
// 참조 자체가 긴 경우) 렌더 직후 실측해 그때만 줄인다.
function fitRefBadgeOneLine() {
  const badge = document.querySelector(".test-stage.ref-badge");
  const backBtn = document.getElementById("ch-exit");
  const input = document.querySelector(".ref-input");
  if (!badge || !backBtn || !input) return;
  const text = input.dataset.answer || input.placeholder || "";
  const canvas = fitRefBadgeOneLine._canvas || (fitRefBadgeOneLine._canvas = document.createElement("canvas"));
  const ctx = canvas.getContext("2d");
  const cs = getComputedStyle(input);
  const startSize = parseFloat(cs.fontSize) || 19; // 폭 바꾸기 전에 원래(본문과 같은) 크기를 먼저 붙잡아 둔다
  const fontWeight = cs.fontWeight, fontFamily = cs.fontFamily;
  const measure = (px) => {
    ctx.font = `${fontWeight} ${px}px ${fontFamily}`;
    return ctx.measureText(text).width;
  };
  const applySize = (px) => {
    input.style.fontSize = px + "px";
    input.style.width = Math.ceil(measure(px) + 10) + "px"; // 커서 여유 10px만
  };
  let size = startSize;
  applySize(size);
  const sameLine = () => Math.abs(badge.getBoundingClientRect().top - backBtn.getBoundingClientRect().top) < 4;
  const minSize = 12;
  let guard = 0;
  while (!sameLine() && size > minSize && guard < 8) {
    size -= 1;
    applySize(size);
    guard++;
  }
}

// 도전 화면 — 3단계(전체 빈칸) 고정 + 힌트 버튼 + 음성
function renderChallenge(verse, hard) {
  challengeUsedHelp = false;   // 구절이 바뀌면 새로 센다
  relearnBackToChallenge = false;
  const appEl = document.getElementById("app");
  const en = isEnMode(verse);
  // "구절 먼저 쓰기"가 켜져 있으면 구절(예 "시 116:1")도 같은 빈칸·카드 방식으로 본문
  // 바로 위에 붙인다 — 화면을 둘로 나누지 않고 한 번에 채운다(2026-08-31 사용자 요청:
  // "두 번 하는 게 아니라 하나로"). ⚠️ 처음엔 "빈칸이니 정답(.test-ref-sticky)을 가려야
  // 한다"고 지레짐작해 배너를 숨겼는데, 사용자의 원래 취지는 "안 보고 맞히기"가 아니라
  // "보이는 걸 그대로 써서 손으로 익히기"였다(맨 처음 요청에 "물론 보이지만" 이라고
  // 이미 적혀 있었다) — 배너를 숨겼더니 "위에 보이던 구절이 없어졌다"는 지적을 받고
  // 되돌림. **.test-ref-sticky는 이제 refFirst 여부와 무관하게 항상 보인다.**
  // 구절은 "수 1:8"(refShort, refFull이 아니다 — "장"·"절" 조사까지 안 틀리고 쓸 필요는
  // 없다) 표기 그대로 한 칸에 통째로 쓴다(2026-08-31 사용자 요청 — 여러 칸으로 나눴다가
  // 도로 한 칸으로).
  const refFirst = isChallengeRefFirst();
  const refTokens = refFirst ? [verseRefShort(verse)] : [];
  const refWordsHtml = refTokens
    .map((word) => {
      // 구절 글자를 본문보다 크게 키웠더니(24px) "너무 크다"·"구절 줄이 뒤로 버튼과
      // 나뉘어 2줄로 보인다"는 지적을 받고 되돌림(2026-08-31) — 이제 본문 빈칸과 같은
      // 크기를 쓴다. 폭 계산은 본문 빈칸(len+1em, 한글 낱말 전제)을 그대로 못 쓴다 —
      // "벧전 4:16"처럼 한글+숫자+콜론이 섞이면 숫자·콜론·공백은 한 글자(1em)보다
      // 훨씬 좁아서, 그 배율대로 재면 실제 글자보다 밑줄이 한참 길게 남는다
      // ("밑줄이 너무 길어요" 지적) — 한글은 1.05em, 나머지(숫자·콜론·공백)는
      // 0.62em으로 따로 센다.
      const chars = Array.from(word);
      const wideCount = chars.filter((c) => /[가-힣]/.test(c)).length;
      const narrowCount = chars.length - wideCount;
      const style = `width:${(wideCount * 1.05 + narrowCount * 0.62 + 1.2).toFixed(2)}em`;
      // 위 배너는 "시편 119편 105절"(refFull)인데 이 빈칸은 "시 119:105"(refShort)라
      // 어떻게 줄여 써야 하는지 알 길이 없었다("구절은 어떻게 입력해야 하나요?" 지적,
      // 2026-08-31) — placeholder로 정답 표기 형식을 옅게 미리 보여준다(포기 취지가
      // 애초에 "보고 그대로 쓰기"였으니 형식을 알려주는 건 어긋나지 않는다).
      return `<input class="word-input ref-input" data-answer="${word}" placeholder="${word}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" style="${style}" />`;
    })
    .join(" ");
  const tokens = verseText(verse).trim().split(/\s+/);

  const wordsHtml = tokens
    .map((word) => {
      // 어려운 도전은 모든 칸이 같은 폭이다. 긴 단어는 칸을 넘어가지만 채점은 값으로 하니
      // 지장이 없다 — 넘어가는 그 답답함이 곧 난도다.
      // 어려운 도전은 '암송 화면과 같은 모양'에서 밑줄만 지운다.
      // 칸 너비를 통일해 봤더니 큰 글씨에서 한 줄에 한 칸씩만 들어가
      // 보이지 않는 칸들이 커다란 여백만 남겼다 — 너비는 건드리지 않는다.
      const style = en ? `width:${Array.from(word).length + 2}ch` : `width:${Array.from(word).length + 1}em`;
      return `<input class="word-input${hard ? " hard-blank" : ""}" data-answer="${word}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" style="${style}" />`;
    })
    .join(" ");
  const heartHtml = heartCheckHtml(verse);
  const sermonConnect = sermonConnectHtml(verse);

  appEl.innerHTML = `
    <div class="test-screen">
      <div class="test-card with-ref-banner">
        <div class="test-ref-sticky">${verseRefFull(verse)}</div>
        <div class="btn-row" style="flex-wrap:wrap;">
          <button class="answer-btn" id="hint-btn">💡 힌트</button>
          <button class="answer-btn" id="ch-shuffle">🔀 다른말씀</button>
          <button class="voice-btn" id="voice-toggle">🎤 암송</button>
          <button class="answer-btn mode-btn" id="ch-mode-toggle">${isCardMode() ? "⌨️ 쓰기" : "👆 카드"}</button>
        </div>
        <div class="test-top">
          <div class="test-head">
            <div class="test-stage challenge-badge${hard ? " hard-badge" : ""}${refFirst ? " ref-badge" : ""}">${
              refFirst
                ? `<span class="ref-label">구절</span>${refWordsHtml}`
                : (hard ? "🔥🔥 어려운 도전" : "🔥 도전")
            }</div>
          </div>
          <button class="back-btn" id="ch-exit">← 뒤로</button>
        </div>
        ${hard && !refFirst ? `<div class="ch-hard-note">
          <span><b>밑줄이 없어요</b></span>
          <button class="ch-ease" id="ch-ease">그냥 할래요</button>
        </div>` : ""}
        <div class="test-sentence">${wordsHtml}</div>
        <div id="card-tray" class="card-tray"></div>
        <div class="challenge-remain" id="ch-remain"></div>
        <div id="result-area"></div>
        <div id="help-slot" class="help-slot"></div>
        ${heartHtml}
        <div id="voice-panel" class="voice-panel" hidden>
          <div class="voice-status" id="voice-status">🎙️ 듣고 있어요… <b>‘암송 종료’</b>를 누를 때까지 계속 들어요</div>
          <div class="voice-live" id="voice-live"></div>
        </div>
        <div id="voice-result" class="voice-result"></div>
        ${sermonConnect}
        ${nivAttributionHtml(verse)}
      </div>
    </div>`;

  initStickyRef();
  scrollPastBtnRow();
  if (refFirst) fitRefBadgeOneLine();
  document.getElementById("ch-exit").addEventListener("click", () => { stopSpeaking(); renderSummary(); });
  document.getElementById("ch-shuffle").addEventListener("click", () => { stopSpeaking(); startChallenge(); });
  // 도전도 카드로 할 수 있어야 한다. 없으면 카드로 암송하시던 분이 도전 단추를 누르는 순간
  // 타자만 되는 화면 앞에 서게 된다 — 없애려던 벽 앞에 데려다 놓는 셈이다.
  document.getElementById("ch-mode-toggle").addEventListener("click", () => {
    stopSpeaking();
    setCardMode(!isCardMode());
    renderChallenge(verse, hard);
  });
  // 빠져나갈 길 — 이 앱은 어르신이 많고, 못 빠져나가는 어려움은 앱을 닫게 만든다.
  // 접어도 카운터는 올라가지 않아 다음 도전에 다시 온다(없애는 게 아니라 미루는 것).
  const easeBtn = document.getElementById("ch-ease");
  if (easeBtn) easeBtn.addEventListener("click", () => {
    stopSpeaking();
    challengeEased = true;
    renderChallenge(verse, false);
  });
  fillVerseHelp(verse, { forChallenge: true });
  fillSermonSummaryBtn(verse, null, () => renderChallenge(verse, hard));
  setupHeartCheck(verse);
  setupHint();
  setupChallengeTyping(verse, (mode) => challengeComplete(verse, cardUsed ? "card" : mode));
  setupVoice(verse, 3, () => challengeComplete(verse, "voice"));
  // "구절" 칸이 스크롤하면 위쪽 고정 배너(.test-ref-sticky, position:fixed;top:0)
  // 아래로 가려 안 보이는 문제가 있었다(2026-08-31 제보 — 키보드가 아니라 이 고정
  // 배너가 원인이었다). scrollIntoView는 fixed 요소를 모르고 맨 위까지 붙여버리므로,
  // .ref-input에 준 scroll-margin-top(스타일시트)이 그 자리만큼 여유를 두게 한다.
  if (refFirst) {
    setTimeout(() => {
      const ref = document.querySelector(".ref-input");
      if (ref) ref.scrollIntoView({ block: "start" }); // 즉시 이동 — smooth는 키보드가
      // 같이 올라오는 애니메이션과 겹치면 오히려 덜 매끄럽고, 헤드리스 테스트에서도
      // 끝났는지 확인하기 어려웠다(가상시간에서 애니메이션이 제대로 안 끝남).
    }, 250);
  }
}

// ------------------------------------------------------------
// 복습 화면 — 오늘 복습 대상 구절을 순서대로 3단계(전체 빈칸)로 다시 암송
// ------------------------------------------------------------
function startReview() {
  const dueNos = dueReviewNos();
  const queue = verses.filter((v) => dueNos.includes(v.no));
  if (!queue.length) { renderSummary(); return; }
  renderReview(queue, 0);
}

function renderReview(queue, idx) {
  const verse = queue[idx];
  const appEl = document.getElementById("app");
  const en = isEnMode(verse);
  const tokens = verseText(verse).trim().split(/\s+/);
  const wordsHtml = tokens
    .map((word) => {
      const style = en ? `width:${Array.from(word).length + 2}ch` : `width:${Array.from(word).length + 1}em`;
      return `<input class="word-input" data-answer="${word}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" style="${style}" />`;
    })
    .join(" ");
  const answerHtml = tokens.map((word) => `<strong class="ans-word">${word}</strong>`).join(" ");
  const heartHtml = heartCheckHtml(verse);
  const sermonConnect = sermonConnectHtml(verse);

  appEl.innerHTML = `
    <div class="test-screen">
      <div class="test-card with-ref-banner">
        <div class="test-ref-sticky">${verseRefFull(verse)}</div>
        <div class="btn-row">
          <button class="answer-btn" id="show-answer-btn">보기</button>
          <button class="answer-btn" id="listen-answer-btn" aria-label="정답 음성으로 듣기">🔊 듣기</button>
          <button class="voice-btn" id="voice-toggle">🎤 암송</button>
        </div>
        <div class="test-top">
          <div class="test-head">
            <div class="test-stage review-badge">📖 복습</div>
          </div>
          <button class="back-btn" id="rv-exit">← 뒤로</button>
        </div>
        <div class="challenge-hint-line">복습 ${idx + 1} / ${queue.length} · 다시 외워볼까요?</div>
        <div class="test-sentence">${wordsHtml}</div>
        <div class="challenge-remain" id="ch-remain"></div>
        <div id="result-area"></div>
        <div id="answer-panel" class="answer-panel" hidden>
          <div class="answer-title">정답</div>
          <div class="answer-text">${answerHtml}</div>
          <button class="back-to-test-btn" id="back-to-test-btn">돌아가서 계속하기</button>
        </div>
        <div id="help-slot" class="help-slot"></div>
        ${heartHtml}
        <div id="voice-panel" class="voice-panel" hidden>
          <div class="voice-status" id="voice-status">🎙️ 듣고 있어요… <b>‘암송 종료’</b>를 누를 때까지 계속 들어요</div>
          <div class="voice-live" id="voice-live"></div>
        </div>
        <div id="voice-result" class="voice-result"></div>
        ${sermonConnect}
        ${nivAttributionHtml(verse)}
      </div>
    </div>`;

  initStickyRef();
  scrollPastBtnRow();
  document.getElementById("rv-exit").addEventListener("click", () => { stopSpeaking(); renderSummary(); });
  fillVerseHelp(verse);
  fillSermonSummaryBtn(verse, null, () => renderReview(queue, idx));
  setupHeartCheck(verse);
  setupAnswerToggle();
  // 정답 듣기(TTS)
  const listenBtn = document.getElementById("listen-answer-btn");
  if (listenBtn) {
    listenBtn.addEventListener("click", () => {
      if (window.speechSynthesis && window.speechSynthesis.speaking) {
        stopSpeaking();
        listenBtn.textContent = "🔊 듣기";
        return;
      }
      listenBtn.textContent = "⏹ 정지";
      speakText(`${verseRefFull(verse)}. ${verseText(verse)}`, () => { listenBtn.textContent = "🔊 듣기"; }, 1, verseTtsLang(verse));
    });
  }
  const onDone = (mode) => {
    // 복습은 `review-` 를 붙여 남긴다 (2026-09-02).
    // ⚠️ 전에는 도전과 똑같이 `typing` 으로 남겼다. 그래서 「도전까지 가셨는가」를
    //    데이터로 가릴 수 없었다 — typing 48명 안에 복습만 하신 분이 섞여 있었고,
    //    도전 전환율이 부풀려 보였다(review-typing 은 1건뿐이라 더 눈에 안 띄었다).
    // ⚠️ **보이는 숫자는 하나도 안 바뀐다** — 순위·통계는 모두 `%typing%`·
    //    `includes("typing")` 으로 세므로 `review-typing` 도 그대로 들어간다.
    //    「복습도 도전 순위에 함께 센다」는 본래 뜻은 그대로다.
    // ⚠️ 복습 화면에는 카드 입력이 없어 `review-typing-card` 는 나오지 않는다.
    //    복습에도 카드를 넣게 되면 제약(supabase/migrate_modes_card.sql)에 그 값을
    //    **먼저** 더할 것 — 안 그러면 기록이 통째로 거부된다.
    postChallenge(verse, "review-" + (mode || "voice"));
    advanceReview(verse.no);
    reviewNext(queue, idx);
  };
  setupChallengeTyping(verse, onDone);
  setupVoice(verse, 3, onDone);
}

function reviewNext(queue, idx) {
  stopSpeaking();
  if (idx + 1 < queue.length) renderReview(queue, idx + 1);
  else renderReviewDone(queue.length);
}

function renderReviewDone(count) {
  const appEl = document.getElementById("app");
  appEl.innerHTML = `
    <div class="summary-screen">
      <div class="summary-card cd-card">
        <div class="cd-emoji">🎉</div>
        <div class="cd-title">복습 완료!</div>
        <div class="cd-sub">오늘 복습 ${count}구절을 마쳤어요. 잘하셨어요! 🙌</div>
        <div class="cd-count">다음 복습은 자동으로 안내됩니다.</div>
        <button class="summary-go" id="rv-home">기록 화면으로</button>
      </div>
    </div>`;
  document.getElementById("rv-home").addEventListener("click", renderSummary);
}

// 힌트: 현재(포커스된) 빈칸의 앞 글자를 한 글자씩 열어준다.
function setupHint() {
  const btn = document.getElementById("hint-btn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    challengeUsedHelp = true;
    const inputs = Array.from(document.querySelectorAll(".word-input:not([disabled])"));
    if (!inputs.length) return;
    const target = inputs.includes(document.activeElement) ? document.activeElement : inputs[0];
    const ans = Array.from(target.dataset.answer);
    const maxReveal = Math.max(1, ans.length - 1); // 전체는 안 보여줌(마지막 글자는 직접 입력)
    const cur = target.placeholder ? Array.from(target.placeholder).length : 0;
    target.placeholder = ans.slice(0, Math.min(cur + 1, maxReveal)).join("");
    target.focus();
  });
}

// 타이핑 채점 — 전부 맞히면 onComplete 호출 (도전/복습 공용)
let cardUsed = false;   // 이번 도전을 카드로 풀었는지 — 도전 화면에서만 본다
function setupChallengeTyping(verse, onComplete) {
  cardUsed = false;
  const inputs = Array.from(document.querySelectorAll(".word-input"));
  const remainEl = document.getElementById("ch-remain");
  const en = isEnMode(verse); // 영어 모드면 대소문자·문장부호 차이는 관용 처리
  let done = false;
  function updateRemain() {
    const left = inputs.filter((i) => !i.classList.contains("correct")).length;
    if (remainEl) {
      remainEl.textContent = left > 0 ? `남은 빈칸 ${left}개` : "모두 맞혔어요! 🎉";
      remainEl.classList.toggle("clear", left === 0);
    }
    return left;
  }
  // 구절 빈칸(예 "삿 8:23")은 콜론이 자판을 바꿔야 나오는 기기가 많아 치기 번거롭다 —
  // 콜론 대신 띄어쓰기를 넣어도 같은 것으로 본다(2026-08-31 사용자 요청: "':' 는 ':' 또는 ' '").
  const refNorm = (s) => String(s || "").replace(/[: ]+/g, " ").trim();
  function evaluate(input, idx, isComposing) {
    if (input.disabled) return;
    const val = input.value.trim();
    const answer = input.dataset.answer;
    const isRef = input.classList.contains("ref-input");
    const match = en ? easyEnNorm(val) === easyEnNorm(answer)
      : isRef ? refNorm(val) === refNorm(answer)
      : val === answer;
    if (match) {
      input.value = answer;
      input.classList.add("correct");
      input.classList.remove("wrong");
      input.disabled = true;
      const left = updateRemain();
      // 남은 빈칸이 0이면 완료 (입력 순서와 무관하게 확실히 판정)
      if (left === 0 && !done) { done = true; onComplete("typing"); return; }
      const next = inputs.slice(idx + 1).find((inp) => !inp.disabled) || inputs.find((inp) => !inp.disabled);
      if (next) next.focus();
    } else if (!isComposing && Array.from(val).length >= Array.from(answer).length) {
      input.classList.add("wrong");
      input.classList.remove("correct");
      setTimeout(() => { input.blur(); input.value = ""; input.classList.remove("wrong"); input.focus(); }, 400);
    }
  }
  inputs.forEach((input, idx) => {
    let composing = false;
    input.addEventListener("compositionstart", () => { composing = true; });
    input.addEventListener("compositionend", () => { composing = false; evaluate(input, idx, false); });
    input.addEventListener("input", (e) => { evaluate(input, idx, composing || e.isComposing); });
  });

  // 카드 모드 — 낱말을 눌러서 채운다(암송 화면과 같은 방식).
  // #card-tray 가 있는 화면에서만 만들어진다(지금은 도전). 맞으면 evaluate의 성공 경로를
  // 그대로 태워, 완료 판정이 타자와 한 길로 흐르게 한다.
  const tray = document.getElementById("card-tray");
  if (isCardMode() && tray && inputs.length) {
    // 암송 화면(setupAutoCheck)의 norm과 같은 것. 거기서는 그 함수 안의 지역 함수라
    // 여기서 그냥 부르면 'norm is not defined'로 도전 화면이 통째로 멈춘다
    // (카드 모드일 때만 나므로, 확인 없이 배포하면 카드 쓰시는 분만 골라 망가진다).
    const norm = (t) => String(t || "").trim().normalize("NFC");
    inputs.forEach((inp) => { inp.readOnly = true; inp.setAttribute("inputmode", "none"); });
    const shuffled = inputs
      .map((inp) => norm(inp.dataset.answer))
      .map((w) => ({ w, r: Math.random() }))
      .sort((a, b) => a.r - b.r)
      .map((x) => x.w);
    tray.innerHTML = shuffled
      .map((w, k) => `<button type="button" class="wcard" data-k="${k}">${w}</button>`)
      .join("");
    tray.querySelectorAll(".wcard").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = inputs.findIndex((inp) => !inp.disabled);
        if (idx < 0) return;
        const target = inputs[idx];
        if (shuffled[Number(btn.dataset.k)] === norm(target.dataset.answer)) {
          btn.classList.add("used");
          btn.disabled = true;
          cardUsed = true;
          target.value = target.dataset.answer;
          evaluate(target, idx, false);
        } else {
          btn.classList.add("shake");
          target.classList.add("wrong");
          setTimeout(() => { btn.classList.remove("shake"); target.classList.remove("wrong"); }, 450);
        }
      });
    });
  }

  updateRemain();
  if (!isCardMode() && inputs[0]) inputs[0].focus();   // 카드일 땐 키보드를 띄우지 않는다
}

// 도전 완료 처리 → 서버 기록 + 완료 화면
function challengeComplete(verse, mode) {
  stopSpeaking();
  const n = bumpTodayChallenge();
  const usedHelp = challengeUsedHelp;   // 화면을 갈아끼우기 전에 붙잡아 둔다
  // 접은 도전은 세지 않는다 — 세어 버리면 미뤄 둔 어려운 차례가 그대로 지나가 버린다.
  if (!challengeEased) bumpHardDoneCount();
  postChallenge(verse, mode);
  renderChallengeDone(verse, mode, n, usedHelp);
}

// 도전/복습 완료를 Supabase(challenge_log)에 저장
function postChallenge(verse, mode) {
  const u = loadUser();
  if (!u || !u.user_id) return Promise.resolve(null);
  bumpTodayCount(); // 오늘 N회 즉시 +1(도전·복습 완료)
  saveSyncStatus("saving", "도전 기록을 서버에 저장하고 있습니다.");
  return api.challenge(u.user_id, verse.no, mode)
    .then((d) => {
      saveSyncStatus("success", "도전 기록이 서버에 저장되었습니다.");
      maybeShowDailyMilestone(d);
      const countEl = document.getElementById("cd-today-count");
      if (countEl && d && d.todayCount != null && Number.isFinite(Number(d.todayCount))) {
        countEl.textContent = `${d.todayCount}회`;
      }
      return d;
    })
    .catch(() => {
      unbumpTodayCount(); // 저장 실패 → 낙관적 +1 취소
      saveSyncStatus("error", "도전 기록 서버 저장에 실패했습니다. 기록은 이 기기에 저장되어 있습니다.");
      return null;
    });
}

function renderChallengeDone(verse, mode, todayCount, usedHelp) {
  // 힌트·기억법을 보고 맞힌 구절은 아직 덜 익은 것이다. 그냥 지나가면 다음에 또 힌트를
  // 봐야 하므로, 그 구절 암송 화면으로 이어 준다. 자동 계속 도전 중이라도 이때는 멈춘다
  // (자동은 '이미 아는 구절을 빠르게' 도는 장치인데, 막혔다면 멈출 때다).
  if (isAutoChallenge()) {
    setTimeout(usedHelp ? () => startRelearn(verse) : startChallenge, 350);
    return;
  }
  const appEl = document.getElementById("app");
  const againHtml = usedHelp
    ? `<div class="cd-help-note">💡 힌트를 보고 맞히셨네요.<br>한 번 더 익혀 두면 다음엔 힌트 없이 됩니다.</div>
       <button class="summary-go cd-relearn" id="cd-relearn">📖 이 말씀 다시 암송하기</button>`
    : "";
  appEl.innerHTML = `
    <div class="summary-screen">
      <div class="summary-card cd-card">
        <div class="cd-emoji">🎉</div>
        <div class="cd-title">도전 완료!</div>
        <div class="cd-sub">${verse.refShort} · ${mode === "voice" ? "음성" : "타이핑"} 암송</div>
        <div class="cd-count">오늘 <b id="cd-today-count">${todayCount}회</b> 완료</div>
        ${hardNext() ? `<div class="cd-hard-next">다음은 🔥🔥 <b>어려운 도전</b>이에요
          <span>밑줄이 보이지 않아요</span></div>` : ""}
        ${againHtml}
        <button class="summary-go challenge-cta" id="cd-again">🔥 한 번 더 도전</button>
        <label class="repeat-toggle" id="cd-auto-label">
          <input type="checkbox" id="cd-auto-check"${isAutoChallenge() ? " checked" : ""} />
          <span class="repeat-text">🔁 자동으로 계속 도전하기</span>
          <span class="repeat-desc">체크하면 이 화면 없이 바로 다음 도전으로 넘어가요</span>
        </label>
        <button class="summary-help" id="cd-rank">🏆 순위 보기</button>
        <button class="summary-change" id="cd-home">기록 화면으로</button>
      </div>
    </div>`;
  const relearn = document.getElementById("cd-relearn");
  if (relearn) relearn.addEventListener("click", () => startRelearn(verse));
  document.getElementById("cd-again").addEventListener("click", startChallenge);
  document.getElementById("cd-auto-check").addEventListener("change", (e) => setAutoChallenge(e.target.checked));
  document.getElementById("cd-rank").addEventListener("click", () => renderRanking());
  document.getElementById("cd-home").addEventListener("click", renderSummary);
}

// ---- 순위 ----
function ymdKo(d) {
  const z = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate());
}
function rankRangeFor(key) {
  const now = new Date();
  if (key === "today") { const t = ymdKo(now); return { key, from: t, to: t }; }
  if (key === "week") { const w = new Date(now); w.setDate(w.getDate() - 6); return { key, from: ymdKo(w), to: ymdKo(now) }; }
  if (key === "all") { return { key, from: "", to: "" }; }
  const y = new Date(now); y.setDate(y.getDate() - 1); // 기본: 전일~당일
  return { key: "yday", from: ymdKo(y), to: ymdKo(now) };
}
async function callRanking(from, to) {
  // me=내 user_id — 응원 칩의 켬/끔과 자격(canCheer)을 서버가 판단한다.
  // 내 것만 보내므로 새로 새는 정보가 없다(게시판 공감과 같은 방식).
  return api.ranking(from, to, true, myUserId()); // 암송(학습) 기록도 포함해 순위 집계
}

// ------------------------------------------------------------
// 성경필사 노트 신청
//   원본(summer-bible 신청 폼)의 구성을 그대로 옮기되,
//   개인 정보(교구·목장·이름)는 암송 앱 로그인 정보로 대신한다(직분은 받지 않음).
//
//   고르는 것 : 필사 유형(오른쪽/아래쪽) · 번역본(개역개정/쉬운성경/NIV)
//               성경 단위별 부수(구약 21 + 신약 10 = 31단위) · 요청 사항
//   상한     : 총 5부. 기간 제한 없음.
//   상태 흐름 : 신청완료 → 준비중 → 준비완료 → 배부완료
//               성도가 고칠 수 있는 것은 '신청완료' 단계뿐이다.
//
//   ※ 지금은 화면만 — 서버 연동(submitPilsa/askCancelPilsa)은 다음 단계.
// ------------------------------------------------------------
const PILSA_TOTAL_MAX = 5;                 // 한 분당 총 부수 상한
const PILSA_PRICE = 3000;                  // 권당 가격(원)
function pilsaWon(n) { return (n * PILSA_PRICE).toLocaleString("ko-KR") + "원"; }
const PILSA_SIZE = [
  ["A4", "큰 것"],
  ["A5", "작은 것"],
];
const PILSA_TYPE1 = [
  ["아래쪽 필사형", "본문 아래 필사 공간"],
  ["오른쪽 필사형", "본문 오른쪽에 필사 공간"],
];
// A5는 지면이 좁아 오른쪽 필사형을 만들 수 없다
const PILSA_TYPE1_BLOCKED = { "A5": ["오른쪽 필사형"] };
const PILSA_TYPE2 = ["개역개정", "쉬운성경", "NIV", "한영(개역개정/NIV)", "영한(NIV/개역개정)"];

function pilsaBlocked(size, t1) {
  const list = PILSA_TYPE1_BLOCKED[size] || [];
  return list.indexOf(t1) >= 0;
}

// 한 쪽에 두 언어를 나란히 넣으려면 지면이 넓어야 한다 —
// A4 + 오른쪽 필사형에서만 만들 수 있다.
const PILSA_DUAL = ["한영(개역개정/NIV)", "영한(NIV/개역개정)"];
function pilsaDualOff(f) { return f.size === "A5" || f.type1 === "아래쪽 필사형"; }
function pilsaT2Blocked(f, t2) {
  return PILSA_DUAL.indexOf(t2) >= 0 && pilsaDualOff(f);
}

// 묶음(sub)은 함께 제작되는 한 권이다 — 원본 목록 그대로
const PILSA_UNITS = {
  ot: [
    { id: "ot01", g: "모세오경", label: "창세기" },
    { id: "ot02", g: "모세오경", label: "출애굽기" },
    { id: "ot03", g: "모세오경", label: "레위기" },
    { id: "ot04", g: "모세오경", label: "민수기" },
    { id: "ot05", g: "모세오경", label: "신명기" },
    { id: "ot06", g: "역사서", label: "여호수아" },
    { id: "ot07", g: "역사서", label: "사사기", sub: "룻기" },
    { id: "ot08", g: "역사서", label: "사무엘상" },
    { id: "ot09", g: "역사서", label: "사무엘하" },
    { id: "ot10", g: "역사서", label: "열왕기상" },
    { id: "ot11", g: "역사서", label: "열왕기하" },
    { id: "ot12", g: "역사서", label: "역대상" },
    { id: "ot13", g: "역사서", label: "역대하" },
    { id: "ot14", g: "역사서", label: "에스라", sub: "느헤미야 · 에스더" },
    { id: "ot15", g: "시가서", label: "욥기" },
    { id: "ot16", g: "시가서", label: "시편" },
    { id: "ot17", g: "시가서", label: "잠언", sub: "전도서 · 아가" },
    { id: "ot18", g: "대선지서", label: "이사야" },
    { id: "ot19", g: "대선지서", label: "예레미야", sub: "예레미야애가" },
    { id: "ot20", g: "대선지서", label: "에스겔", sub: "다니엘" },
    { id: "ot21", g: "소선지서", label: "호세아", sub: "요엘 · 아모스 · 오바댜 · 요나 · 미가 · 나훔 · 하박국 · 스바냐 · 학개 · 스가랴 · 말라기" },
  ],
  nt: [
    { id: "nt01", g: "복음서", label: "마태복음" },
    { id: "nt02", g: "복음서", label: "마가복음" },
    { id: "nt03", g: "복음서", label: "누가복음" },
    { id: "nt04", g: "복음서", label: "요한복음" },
    { id: "nt05", g: "역사서", label: "사도행전" },
    { id: "nt06", g: "바울서신", label: "로마서" },
    { id: "nt07", g: "바울서신", label: "고린도전서", sub: "고린도후서" },
    { id: "nt08", g: "바울서신", label: "갈라디아서", sub: "에베소서 · 빌립보서 · 골로새서 · 데살로니가전서 · 데살로니가후서 · 디모데전서 · 디모데후서 · 디도서 · 빌레몬서" },
    { id: "nt09", g: "일반서신", label: "히브리서", sub: "야고보서 · 베드로전서 · 베드로후서 · 요한일서 · 요한이서 · 요한삼서 · 유다서" },
    { id: "nt10", g: "예언서", label: "요한계시록" },
  ],
};
const PILSA_ALL = PILSA_UNITS.ot.concat(PILSA_UNITS.nt);

const PILSA_STEPS = ["신청완료", "준비중", "준비완료", "배부완료"];
const PILSA_INFO = {
  "신청완료": { cls: "s1", ic: "📝", msg: "신청이 접수되었습니다. 준비에 <b>1주일 정도</b> 소요되며 <b>주일</b>에 전달해 드려요.<br>준비가 시작되기 전까지는 신청 내용을 고치거나 취소하실 수 있어요." },
  "준비중":   { cls: "s2", ic: "📦", msg: "노트를 준비하고 있습니다. 준비가 끝나면 돌아오는 <b>주일</b>에 전달해 드려요.<br>이 단계부터는 내용을 바꿀 수 없어요." },
  "준비완료": { cls: "s3", ic: "✅", msg: "노트가 준비되었습니다. 휴대폰으로도 알려드렸어요.<br>주일에 4층 새가족실에서 찾아가세요.<br>비용은 그때 내시면 됩니다." },
  "배부완료": { cls: "s4", ic: "🎁", msg: "노트를 받아 가셨습니다. 매일 한 구절씩 손으로 새겨 보세요." },
};

let pilsaForm = null;      // 작성 중인 신청 { type1, type2, qtys, memo }
let pilsaMine = null;      // 접수된 내 신청 { ...form, status, at }
let pilsaTab = "ot";       // 구약/신약 탭
let pilsaEditing = false;  // 접수된 신청을 고치는 중
let pilsaLoaded = false;   // 서버에서 내 신청을 불러왔는지


// 브라우저가 옛 js/api.js를 물고 있으면 필사 액션이 아예 없다 —
// "함수가 없습니다" 대신 새로고침을 안내한다.
function pilsaApiReady() { return !!(window.api && api.pilsaApply && api.pilsaMine); }

// 내 신청 한 건을 서버에서 가져온다(화면 진입 때 한 번)
async function pilsaLoadMine(u) {
  if (!pilsaApiReady()) { pilsaLoaded = true; return; }
  try {
    const r = await api.pilsaMine(u.user_id);
    pilsaMine = r.order || null;
    if (pilsaMine) pilsaForm = pilsaFormFrom(pilsaMine);
  } catch (_) {
    pilsaMine = null;          // 못 가져오면 새 신청 화면으로 — 저장할 때 다시 확인한다
  }
  pilsaLoaded = true;
}

// 접수된 신청 → 고치기 좋은 양식으로
function pilsaFormFrom(m) {
  return { size: m.size, type1: m.type1, type2: m.type2, phone: m.phone || "",
           qtys: Object.assign({}, m.qtys), memo: m.memo || "" };
}

// 숫자만 남겨 010-1234-5678 꼴로 — 어르신이 하이픈을 신경 쓰지 않아도 되게
function pilsaPhoneFmt(v) {
  const d = String(v || "").replace(/[^0-9]/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 7) return d.slice(0, 3) + "-" + d.slice(3);
  return d.slice(0, 3) + "-" + d.slice(3, 7) + "-" + d.slice(7);
}
function pilsaPhoneOk(v) {
  return /^01[016-9]-?\d{3,4}-?\d{4}$/.test(String(v || "").trim());
}

function pilsaNewForm() { return { size: "", type1: "", type2: "", phone: "", qtys: {}, memo: "" }; }

// A5는 지면이 좁고 한영·영한은 두 언어를 같이 실어, 한 부가 두 권으로 나온다.
// (A5에서는 한영·영한을 못 고르므로 두 조건이 겹치는 일은 없다 — 배수는 최대 2)
function pilsaMult(f) {
  return (f.size === "A5" || PILSA_DUAL.indexOf(f.type2) >= 0) ? 2 : 1;
}
function pilsaMultWhy(f) {
  if (f.size === "A5") return "A5(작은 것)";
  if (PILSA_DUAL.indexOf(f.type2) >= 0) return "한영·영한";
  return "";
}
// 고른 부수 — 신청 상한(5부)은 이 값을 본다
function pilsaPicks(f) {
  return PILSA_ALL.reduce(function (a, u) { return a + (Number(f.qtys[u.id]) || 0); }, 0);
}
// 실제 만들어지는 권수 — 금액은 이 값을 본다
function pilsaTotal(f) {
  return pilsaPicks(f) * pilsaMult(f);
}
function pilsaPicked(f) {
  return PILSA_ALL.filter(function (u) { return (Number(f.qtys[u.id]) || 0) > 0; });
}
function pilsaUnitName(u) { return u.label + (u.sub ? " 외" : ""); }

// "화평 20목장" / "초등부 3학년" — 이름을 뺀 소속만(명단에 그대로 쓴다)
function pilsaAffil(u) {
  if (!u) return "";
  return u.type === "교구"
    ? [u.gu, u.mok ? u.mok + "목장" : ""].filter(Boolean).join(" ")
    : [u.bu, u.grade].filter(Boolean).join(" ");
}
// "화평 20목장 · 김세웅" / "초등부 3학년 · 김믿음"
function pilsaWho(u) {
  if (!u) return "";
  return [pilsaAffil(u), u.name].filter(Boolean).join(" · ");
}

function pilsaStepsHtml(cur) {
  const i = PILSA_STEPS.indexOf(cur);
  return '<div class="pl-steps">' + PILSA_STEPS.map(function (s, k) {
    return '<div class="pl-step ' + (k < i ? "done" : k === i ? "now" : "") +
           '"><i></i><span>' + s + '</span></div>';
  }).join("") + '</div>';
}

// ── 화면 맨 아래 동작 버튼 ────────────────────────────────────
// 취소는 접수된 신청이 있고 아직 '신청완료' 단계일 때만 나온다.
function pilsaActionsHtml(showForm) {
  const st = pilsaMine && pilsaMine.status;
  const editable = st === "신청완료";     // 이때만 성도가 고치거나 취소할 수 있다
  const finished = st === "배부완료";     // 받아 가셨으면 다시 신청할 수 있다
  const btns = [];
  if (showForm) {
    btns.push('<button class="pl-act go" id="pl-submit">' + (pilsaMine ? "수정 신청" : "신청") + '</button>');
  } else if (editable) {
    btns.push('<button class="pl-act go" id="pl-edit">수정하기</button>');
  } else if (finished) {
    btns.push('<button class="pl-act go" id="pl-new">새로 신청</button>');
  }
  if (editable) btns.push('<button class="pl-act danger" id="pl-cancel">취소</button>');
  btns.push('<button class="pl-act ghost" id="pl-exit">뒤로</button>');
  // 성경 31단위를 훑다 보면 화면이 길어진다 — 버튼은 늘 아래에 붙여 둔다
  return '<div class="pl-acts sticky">' + btns.join("") + '</div>';
}

function wirePilsaActions(u) {
  const ex = document.getElementById("pl-exit");
  if (ex) ex.addEventListener("click", function () {
    pilsaEditing = false;
    pilsaLoaded = false;        // 다시 들어오면 그동안 바뀐 상태를 새로 받는다
    renderSummary();
  });
  const sb = document.getElementById("pl-submit");
  if (sb) sb.addEventListener("click", function () { pilsaTrySubmit(u); });
  const ed = document.getElementById("pl-edit");
  if (ed) ed.addEventListener("click", function () {
    pilsaForm = pilsaFormFrom(pilsaMine);
    pilsaEditing = true;
    renderPilsaApply();
  });
  const nw = document.getElementById("pl-new");
  if (nw) nw.addEventListener("click", function () {
    pilsaMine = null;                 // 지난 신청은 끝났다 — 빈 양식으로 새로 시작
    pilsaForm = pilsaNewForm();
    pilsaEditing = false;
    pilsaTab = "ot";
    renderPilsaApply();
  });
  const cc = document.getElementById("pl-cancel");
  if (cc) cc.addEventListener("click", function () { askCancelPilsa(u); });
}

function pilsaTrySubmit(u) {
  const t = document.getElementById("pl-memo");
  if (t) pilsaForm.memo = t.value;
  const miss = [];
  if (!pilsaForm.size) miss.push("노트 크기");
  if (!pilsaForm.type1) miss.push("필사 유형");
  if (!pilsaForm.type2) miss.push("성경 번역본");
  if (!pilsaTotal(pilsaForm)) miss.push("성경 (부수를 1부 이상)");
  if (miss.length) { appAlert("다음을 골라 주세요.<br><b>" + miss.join(" · ") + "</b>"); return; }
  const ph = (pilsaForm.phone || "").trim();
  if (!ph) {
    appAlert("휴대폰 번호를 적어 주세요.").then(function () {
      const el = document.getElementById("pl-phone");
      if (el) { el.classList.add("err"); el.focus(); }
    });
    return;
  }
  if (!pilsaPhoneOk(ph)) {
    appAlert("휴대폰 번호를 다시 확인해 주세요.<br><b>010-1234-5678</b> 꼴로 적어 주세요.").then(function () {
      const el = document.getElementById("pl-phone");
      if (el) { el.classList.add("err"); el.focus(); }
    });
    return;
  }
  renderPilsaConfirm(u);
}

// ── 신청 화면 ────────────────────────────────────────────────
function renderPilsaApply(keepScroll) {
  const u = loadUser();
  if (!u) { renderEntryScreen(); return; }
  // 서버에서 내 신청을 아직 못 가져왔으면 먼저 가져온다
  if (!pilsaLoaded) {
    document.getElementById("app").innerHTML =
      '<div class="pilsa-screen"><h2 class="rank-title">✍️ 성경필사 노트 신청</h2>' +
      '<p class="msg">신청 내용을 불러오는 중…</p></div>';
    window.scrollTo(0, 0);
    pilsaLoadMine(u).then(function () { renderPilsaApply(); });
    return;
  }
  if (!pilsaForm) pilsaForm = pilsaNewForm();
  const appEl = document.getElementById("app");
  const showForm = !pilsaMine || pilsaEditing;

  appEl.innerHTML =
    '<div class="pilsa-screen">' +
      '<h2 class="rank-title">✍️ 성경필사 노트 신청</h2>' +
      '<p class="pilsa-sub">준비가 끝나면 <b>휴대폰</b>으로 알려드립니다<br>' +
        '<b>4층 새가족실</b>에서 찾아가세요</p>' +
      (showForm ? pilsaFormHtml(u) : pilsaMineHtml(u)) +
      pilsaActionsHtml(showForm) +
    '</div>';

  window.scrollTo(0, keepScroll == null ? 0 : keepScroll);
  wirePilsaActions(u);
  if (showForm) wirePilsaForm(u);
}

function pilsaMineHtml(u) {
  const m = pilsaMine;
  const info = PILSA_INFO[m.status] || PILSA_INFO["신청완료"];
  return '<div class="pilsa-state ' + info.cls + '">' +
      '<div class="ps-top"><span class="ps-ic">' + info.ic + '</span>' +
      '<span class="ps-name">' + m.status + '</span></div>' +
      '<div class="ps-msg">' + info.msg + '</div></div>' +
    pilsaStepsHtml(m.status) +
    pilsaSummaryHtml(u, m) +
    (m.status === "신청완료" ? '' :
     m.status === "배부완료"
      ? '<div class="pl-help done">필사 노트가 더 필요하시면 <b>새로 신청</b>하실 수 있어요.</div>'
      : '<div class="pl-help lock">준비가 시작되어 변경할 수 없습니다.<br>' +
        '꼭 바꾸셔야 하면 <b>신앙운동팀</b>에 말씀해 주세요.</div>');
}

// 신청 내용 요약 — 확인 화면과 접수 뒤 화면이 함께 쓴다
function pilsaSummaryHtml(u, f) {
  const rows = pilsaPicked(f).map(function (x) {
    return '<div class="pc-row"><span>' + boardEsc(pilsaUnitName(x)) + '</span>' +
           '<b>' + f.qtys[x.id] + '부</b></div>';
  }).join("");
  return '<div class="pilsa-confirm">' +
      '<div class="pc-row"><span>신청자</span><b>' + boardEsc(pilsaWho(u)) + '</b></div>' +
      '<div class="pc-row"><span>노트 크기</span><b>' + boardEsc(f.size) + '</b></div>' +
      '<div class="pc-row"><span>필사 유형</span><b>' + boardEsc(f.type1) + '</b></div>' +
      '<div class="pc-row"><span>번역본</span><b>' + boardEsc(f.type2) + '</b></div>' +
      '<div class="pc-row"><span>휴대폰</span><b>' + boardEsc(pilsaPhoneFmt(f.phone) || "-") + '</b></div>' +
      (f.at ? '<div class="pc-row"><span>신청일</span><b>' + boardEsc(f.at) + '</b></div>' : '') +
    '</div>' +
    '<div class="pl-sec">성경 선택</div>' +
    '<div class="pilsa-confirm">' + rows +
      (pilsaMult(f) > 1
        ? '<div class="pc-row"><span>신청부수</span><b>' + pilsaPicks(f) + '부 × 2</b></div>'
        : '') +
      '<div class="pc-row total"><span>총 제작 권수</span><b>' + pilsaTotal(f) + '권</b></div>' +
    '</div>' +
    '<div class="pl-price">' +
      '<div class="pp-row"><span>예상 금액 <i>(권당 ' + PILSA_PRICE.toLocaleString("ko-KR") + '원)</i></span>' +
      '<b>' + pilsaWon(pilsaTotal(f)) + '</b></div>' +
      '<div class="pp-note">' +
      (pilsaMult(f) > 1
        ? '<b>' + pilsaMultWhy(f) + '</b>은 한 부가 <b>2권</b>이라 2배로 계산했습니다.<br>'
        : '') +
      '말씀 길이에 따라 한 단위가 여러 권으로 나올 수 있어, 실제 권수와 금액은 달라질 수 있습니다.<br>' +
      '<b>비용은 노트를 찾으실 때 내시면 됩니다.</b></div>' +
    '</div>' +
    (f.memo ? '<div class="pl-memo"><b>💬 요청사항</b><br>' + boardEsc(f.memo) + '</div>' : '');
}

// 고른 성경 요약 — ＋/− 때 이 부분만 갈아 끼운다
function pilsaSumInner(f) {
  const picked = pilsaPicked(f);
  if (!picked.length) return '<span class="none">아직 고르신 성경이 없습니다.</span>';
  const n = pilsaTotal(f);
  const mult = pilsaMult(f);
  return '<b>✅ ' + picked.length + '종 · ' +
    (mult > 1 ? '신청 ' + pilsaPicks(f) + '부 → ' : '') +
    '총 ' + n + '권 · ' + pilsaWon(n) + '</b><br><span>' +
    picked.map(function (x) { return boardEsc(pilsaUnitName(x)) + " " + f.qtys[x.id] + "부"; }).join(" · ") +
    '</span>';
}

function pilsaFormHtml(u) {
  const f = pilsaForm;
  const left = PILSA_TOTAL_MAX - pilsaPicks(f);
  const mult = pilsaMult(f);

  const sz = PILSA_SIZE.map(function (t) {
    return '<button class="pl-type' + (f.size === t[0] ? " on" : "") + '" data-size="' + t[0] + '">' +
      '<b>' + t[0] + '</b><i>' + t[1] + '</i></button>';
  }).join("");
  const t1 = PILSA_TYPE1.map(function (t) {
    const off = pilsaBlocked(f.size, t[0]);
    return '<button class="pl-type' + (f.type1 === t[0] ? " on" : "") + '" data-t1="' + t[0] + '"' +
      (off ? " disabled" : "") + '><b>' + t[0] + '</b><i>' +
      (off ? "A5에는 만들지 않아요" : t[1]) + '</i></button>';
  }).join("");
  const t2 = PILSA_TYPE2.map(function (t) {
    const off = pilsaT2Blocked(f, t);
    return '<button data-t2="' + t + '" class="' + (f.type2 === t ? "on" : "") + '"' +
      (off ? " disabled" : "") + '>' + t + '</button>';
  }).join("");

  let rows = "", lastG = null;
  PILSA_UNITS[pilsaTab].forEach(function (x) {
    if (x.g !== lastG) { rows += '<div class="pl-genre">' + x.g + '</div>'; lastG = x.g; }
    const q = Number(f.qtys[x.id]) || 0;
    rows +=
      '<div class="pl-unit">' +
        '<div class="pl-un"><b>' + boardEsc(x.label) + '</b>' +
          (x.sub ? '<i>+ ' + boardEsc(x.sub) + '</i>' : '') + '</div>' +
        '<div class="pl-ctl">' +
          '<button class="pl-mn" data-minus="' + x.id + '"' + (q ? "" : " disabled") + '>−</button>' +
          '<span class="pl-num' + (q ? " has" : "") + '">' + q + '</span>' +
          '<button class="pl-pl' + (left > 0 ? "" : " off") + '" data-plus="' + x.id + '">＋</button>' +
        '</div>' +
      '</div>';
  });

  return '<div class="pl-sec">필사 옵션</div>' +
    '<div class="pilsa-box">' +
      '<div class="pl-label">노트 크기</div>' +
      '<div class="pl-types" id="pl-size">' + sz + '</div>' +
      '<div class="pl-label" style="margin-top:14px">필사 유형</div>' +
      '<div class="pl-types" id="pl-t1">' + t1 + '</div>' +
      (f.size === "A5" ? '<div class="pl-note">A5는 <b>아래쪽 필사형</b>으로만 제작됩니다</div>' : '') +
      '<div class="pl-label" style="margin-top:14px">성경 번역본</div>' +
      '<div class="rank-filter pl-chips" id="pl-t2">' + t2 + '</div>' +
      (pilsaDualOff(f)
        ? '<div class="pl-note">한영·영한은 <b>A4 + 오른쪽 필사형</b>에서만 만들 수 있어요</div>'
        : '') +
    '</div>' +

    '<div class="pl-sec">성경 선택 및 부수</div>' +
    '<div class="pl-notice">신청 단위별로 부수를 골라 주세요. 묶음 항목은 함께 제작되는 한 권입니다.<br>' +
      '<b>A5(작은 것)</b>와 <b>한영·영한</b>은 한 부가 <b>2권</b>으로 나와 권수와 금액이 2배가 됩니다.<br>' +
      '말씀이 길면 <b>한 단위가 여러 권</b>으로 나올 수 있어 권수는 늘거나 줄 수 있습니다.<br>' +
      '<b>권당 3,000원</b> · ' +
      '<b>한 분당 총 ' + PILSA_TOTAL_MAX + '부까지</b> 신청하실 수 있어요' +
      '<span class="pl-left">' + (left > 0 ? " (앞으로 " + left + "부)" : " — 상한에 닿았습니다") + '</span></div>' +
    (mult > 1
      ? '<div class="pl-note x2">지금 고르신 <b>' + pilsaMultWhy(f) + '</b>은 한 부가 <b>2권</b>입니다 — ' +
        '아래에서 고르신 부수의 <b>2배</b>로 만들어지고, 금액도 2배로 계산됩니다.</div>'
      : '') +
    '<div class="rank-filter pl-tab" id="pl-tab">' +
      '<button data-tab="ot" class="' + (pilsaTab === "ot" ? "on" : "") + '">구약</button>' +
      '<button data-tab="nt" class="' + (pilsaTab === "nt" ? "on" : "") + '">신약</button>' +
    '</div>' +
    '<div class="pl-units">' + rows + '</div>' +
    '<div class="pl-sum2">' + pilsaSumInner(f) + '</div>' +

    '<div class="pl-sec">휴대폰 번호 <span class="req">필수</span></div>' +
    '<input type="tel" id="pl-phone" class="pl-memo-in pl-phone" inputmode="numeric" ' +
      'maxlength="13" placeholder="010-1234-5678" value="' + boardEsc(pilsaPhoneFmt(f.phone)) + '">' +
    '<div class="pl-hint">노트가 준비되면 이 번호로 알려드립니다</div>' +
    '<div class="pl-sec">요청사항 <span class="opt">선택</span></div>' +
    '<textarea id="pl-memo" class="pl-memo-in" rows="3" maxlength="300" ' +
      'placeholder="수량 조정, 그 밖에 요청하실 내용을 적어 주세요.">' + boardEsc(f.memo) + '</textarea>';
}

// ＋/− 는 화면을 다시 그리지 않는다 — 다시 그리면 보고 있던 자리를 잃는다.
// 숫자·잠금·요약·남은 부수만 제자리에서 갱신한다.
function pilsaRefreshCounts() {
  const f = pilsaForm;
  const left = PILSA_TOTAL_MAX - pilsaPicks(f);
  document.querySelectorAll(".pl-unit").forEach(function (row) {
    const plus = row.querySelector("[data-plus]");
    const minus = row.querySelector("[data-minus]");
    const num = row.querySelector(".pl-num");
    if (!plus || !num) return;
    const q = Number(f.qtys[plus.dataset.plus]) || 0;
    num.textContent = q;
    num.classList.toggle("has", q > 0);
    plus.classList.toggle("off", left <= 0);   // 잠그지 않는다 — 눌러 보면 이유를 알려 준다
    if (minus) minus.disabled = q <= 0;
  });
  const lf = document.querySelector(".pl-left");
  if (lf) lf.textContent = left > 0 ? " (앞으로 " + left + "부)" : " — 상한에 닿았습니다";
  const sum = document.querySelector(".pl-sum2");
  if (sum) sum.innerHTML = pilsaSumInner(f);
}

function wirePilsaForm(u) {
  const appEl = document.getElementById("app");
  const keepMemo = function () {
    const t = document.getElementById("pl-memo");
    if (t) pilsaForm.memo = t.value;
    const ph = document.getElementById("pl-phone");
    if (ph) pilsaForm.phone = ph.value;
  };
  appEl.querySelectorAll("[data-size]").forEach(function (b) {
    b.addEventListener("click", function () {
      keepMemo();
      pilsaForm.size = b.dataset.size;
      if (pilsaBlocked(pilsaForm.size, pilsaForm.type1)) pilsaForm.type1 = "";
      if (pilsaT2Blocked(pilsaForm, pilsaForm.type2)) pilsaForm.type2 = "";
      renderPilsaApply(window.scrollY);
    });
  });
  appEl.querySelectorAll("[data-t1]").forEach(function (b) {
    b.addEventListener("click", function () {
      keepMemo();
      pilsaForm.type1 = b.dataset.t1;
      if (pilsaT2Blocked(pilsaForm, pilsaForm.type2)) pilsaForm.type2 = "";
      renderPilsaApply(window.scrollY);
    });
  });
  appEl.querySelectorAll("[data-t2]").forEach(function (b) {
    b.addEventListener("click", function () {
      keepMemo(); pilsaForm.type2 = b.dataset.t2; renderPilsaApply(window.scrollY);
    });
  });
  document.getElementById("pl-tab").querySelectorAll("button").forEach(function (b) {
    b.addEventListener("click", function () {
      keepMemo(); pilsaTab = b.dataset.tab; renderPilsaApply(window.scrollY);
    });
  });
  appEl.querySelectorAll("[data-plus]").forEach(function (b) {
    b.addEventListener("click", function () {
      if (pilsaPicks(pilsaForm) >= PILSA_TOTAL_MAX) {
        appAlert("한 분당 <b>총 " + PILSA_TOTAL_MAX + "부까지</b> 신청하실 수 있습니다.<br><br>" +
          "다른 성경을 고르시려면 먼저 <b>−</b>로 부수를 줄여 주세요.<br>" +
          "더 필요하시면 <b>신앙운동팀</b>에 말씀해 주세요.", "🙏 신청 부수 안내");
        return;
      }
      const id = b.dataset.plus;
      pilsaForm.qtys[id] = (Number(pilsaForm.qtys[id]) || 0) + 1;
      pilsaRefreshCounts();
    });
  });
  appEl.querySelectorAll("[data-minus]").forEach(function (b) {
    b.addEventListener("click", function () {
      const id = b.dataset.minus;
      pilsaForm.qtys[id] = Math.max(0, (Number(pilsaForm.qtys[id]) || 0) - 1);
      pilsaRefreshCounts();
    });
  });
  const memo = document.getElementById("pl-memo");
  if (memo) memo.addEventListener("input", function () { pilsaForm.memo = memo.value; });
  const phone = document.getElementById("pl-phone");
  if (phone) phone.addEventListener("input", function () {
    phone.value = pilsaPhoneFmt(phone.value);      // 010-1234-5678 꼴로 자동 정리
    pilsaForm.phone = phone.value;
  });
}

// ── 확인 화면 ────────────────────────────────────────────────
function renderPilsaConfirm(u) {
  const appEl = document.getElementById("app");
  appEl.innerHTML =
    '<div class="pilsa-screen">' +
      '<h2 class="rank-title">📋 신청 내용 확인</h2>' +
      '<p class="pilsa-sub">아래 내용이 맞으면 ' + (pilsaMine ? "수정 신청" : "신청") + '을 눌러 주세요<br>' +
        '<span class="nb"><b>1주일 정도</b> 소요되며 <b>주일</b>에 전달해 드립니다</span></p>' +
      pilsaSummaryHtml(u, pilsaForm) +
      // 확인하지 않고 화면을 떠나는 일이 없게, 버튼을 아래에 붙여 둔다
      '<div class="pl-acts sticky">' +
        '<button class="pl-act go" id="pl-ok">' + (pilsaMine ? "수정 신청" : "신청") + '</button>' +
        '<button class="pl-act ghost" id="pl-again">뒤로</button>' +
      '</div>' +
    '</div>';
  window.scrollTo(0, 0);
  document.getElementById("pl-again").addEventListener("click", function () { renderPilsaApply(); });
  document.getElementById("pl-ok").addEventListener("click", function () { submitPilsa(u); });
}

async function askCancelPilsa(u) {
  const ok = await appConfirm(
    "신청하신 <b>필사 노트 " + pilsaTotal(pilsaMine) + "권</b>을 취소할까요?<br><br>언제든 다시 신청하실 수 있어요.",
    // 두 버튼이 모두 '취소'로 보이면 어느 쪽이 무엇인지 알 수 없다
    { title: "🗑 신청 취소", okText: "신청 취소", cancelText: "돌아가기", danger: true });
  if (!ok) return;
  if (pilsaMine && pilsaMine.id) {
    try {
      await api.pilsaCancel(u.user_id, pilsaMine.id);
    } catch (e) {
      await appAlert("취소하지 못했습니다.<br>" + boardEsc(e && e.message ? e.message : e));
      return;
    }
  }
  pilsaMine = null;
  pilsaEditing = false;
  pilsaForm = pilsaNewForm();
  await appAlert("신청이 취소되었습니다.");
  renderPilsaApply();
}

// 신청이든 수정이든 성도가 알아야 할 내용은 같다 — 한곳에서 만든다
function pilsaDoneMsg(n) {
  return "필사 노트 <b>" + n + "권</b>을 신청했습니다.<br><br>" +
    "준비에 <b>1주일 정도</b> 소요되며 <b>주일</b>에 전달해 드립니다.<br>" +
    "준비가 끝나면 휴대폰으로 알려드릴게요.";
}

async function submitPilsa(u) {
  const edit = !!pilsaMine;                 // 저장하면 pilsaMine이 바뀌니 먼저 잡아 둔다
  const label = edit ? "수정 신청" : "신청";
  const btn = document.getElementById("pl-ok");
  if (btn) { btn.disabled = true; btn.textContent = "처리 중…"; }
  if (!pilsaApiReady()) {
    if (btn) { btn.disabled = false; btn.textContent = label; }
    await appAlert("앱이 옛 버전이라 신청을 보낼 수 없습니다.<br>새로고침한 뒤 다시 신청해 주세요.");
    return;
  }
  try {
    const r = await api.pilsaApply({
      user_id: u.user_id,
      name: u.name,
      who: pilsaAffil(u),
      phone: pilsaForm.phone,
      size: pilsaForm.size, type1: pilsaForm.type1, type2: pilsaForm.type2,
      qtys: pilsaForm.qtys, memo: pilsaForm.memo,
    });
    pilsaMine = r.order;
    pilsaForm = pilsaFormFrom(pilsaMine);
    pilsaEditing = false;
    await appAlert(pilsaDoneMsg(pilsaMine.total), edit ? "✅ 수정 완료" : "✅ 신청 완료");
    renderPilsaApply();
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = label; }
    await appAlert("신청을 저장하지 못했습니다.<br>" + boardEsc(e && e.message ? e.message : e));
  }
}

// ------------------------------------------------------------
// 나의 말씀 앨범 — 3단계 완료 구절을 모아 보고, 그 자리에서 스스로 점검한다.
// ------------------------------------------------------------
// 가림 상태는 저장하지 않는다 — 다시 들어오면 늘 다 보이는 상태로 시작.
let albumHideRef = false;
let albumHideText = false;
let albumHint = false;      // 첫 글자 힌트(말씀 숨김과 배타 — 같은 것의 세기 차이라 동시에 켜면 헷갈린다)
let albumOrder = null;      // 섞기 결과(구절 번호 배열). null이면 원래 순서
let albumUnseenOnly = false; // 오늘 아직 확인하지 않은 구절만 보기

// ── 이어 듣기 ────────────────────────────────────────────────
// 재생 목록은 '화면에 보이는 순서 그대로'다(섞기·미확인이 걸린 그 목록).
// 따로 배울 규칙을 만들지 않으려는 것 — 눈에 보이는 것이 곧 들리는 것이다.
let albumPickMode = false;          // '고르기' 켬 — 카드마다 말씀/3분요약을 따로 담는다
let albumPicks = new Map();         // no -> { v, a }. 저장하지 않는다 — 앱을 다시 열면 비어 있다(숨김·섞기와 같은 규칙)
let albumSermonsReady = false;      // 설교 데이터(1MB)를 받아 두었나
const ALBUM_SUM_KEY = "album-play-summary";  // 이 토글만 저장한다 — 매번 켜기 번거로우니
function albumWithSummary() { try { return localStorage.getItem(ALBUM_SUM_KEY) === "1"; } catch (e) { return false; } }
function setAlbumWithSummary(on) { try { localStorage.setItem(ALBUM_SUM_KEY, on ? "1" : "0"); } catch (e) {} }

// 재생 상태. gen(세대)은 철 지난 콜백을 버리기 위한 것 —
// speechSynthesis.cancel()이 브라우저에 따라 onend를 부르는데, 그대로 두면
// '다음'을 한 번 눌러도 두 칸이 건너뛰어진다.
let albumPlayer = null;             // { items, i, paused }
let albumPlayGen = 0;

// 한국어 낭독 속도 어림값(초당 글자수). 3분요약 대본 중앙값 989자가 약 3분이라 5.5.
const ALBUM_CPS = 5.5;

// 한 항목이 끝나고 다음이 시작하기까지 쉬는 시간. 쉼 없이 이어 붙으면 어디서
// 한 구절이 끝났는지 귀로 가늠이 안 된다 — 떠올려 볼 틈도 여기서 난다.
const ALBUM_GAP_MS = 2000;
let albumGapTimer = null;

// 듣는 동안 화면이 저절로 꺼지지 않게 붙잡는다(Screen Wake Lock).
// 화면이 꺼지면 TTS가 멈추기 때문 — 특히 아이폰. iOS 16.4+·안드로이드 크롬에서 된다.
//   · 반드시 사용자의 탭에서 요청해야 한다(재생 버튼이 그 자리)
//   · 다른 앱에 화면을 내주면 잠금이 저절로 풀리므로 돌아왔을 때 다시 건다
//   · 전원 버튼을 직접 누르는 것까지 막지는 못한다
let _wakeLock = null;
let albumWakeOn = false;
let albumWakeErr = "";   // 실패 원인. 조용히 삼키면 왜 화면이 꺼지는지 아무도 모른다 — 재생 바에 적는다
async function keepScreenAwake(on) {
  try {
    if (!on) {
      if (_wakeLock) { const w = _wakeLock; _wakeLock = null; await w.release(); }
      albumWakeOn = false; albumWakeErr = "";
      return false;
    }
    if (!("wakeLock" in navigator)) { albumWakeErr = "미지원"; albumWakeOn = false; return false; }
    if (_wakeLock) return true;
    _wakeLock = await navigator.wakeLock.request("screen");
    // 화면이 꺼지거나 다른 앱으로 넘어가면 브라우저가 스스로 놓는다 — 상태도 함께 내린다
    _wakeLock.addEventListener("release", () => { _wakeLock = null; albumWakeOn = false; });
    albumWakeOn = true; albumWakeErr = "";
    return true;
  } catch (e) {           // 절전 모드 등으로 거절될 수 있다(NotAllowedError)
    _wakeLock = null;
    albumWakeOn = false;
    albumWakeErr = String((e && (e.name || e.message)) || "거절됨");
    return false;
  }
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  if (albumPlayer) keepScreenAwake(true).then(() => albumPlayBar());
  // 기도문 「크게 보기」도 같다 — 다른 앱에 갔다 오면 브라우저가 잠금을 놓아 버린다.
  // 온 식구가 둘러앉아 읽는 화면이라 여기서 화면이 꺼지면 기도가 끊긴다.
  else if (document.querySelector(".pr-full")) keepScreenAwake(true);
});
function albumClearGap() { if (albumGapTimer) { clearTimeout(albumGapTimer); albumGapTimer = null; } }

function albumSermonOf(no) {
  return (sermonsCache || []).find((x) => x.memVerseNo === no && x.audio) || null;
}

// 지금 목록에서 실제로 재생할 항목들을 만든다.
//   고르기 켬 → 카드마다 고른 것만 / 끔 → 말씀 전부(+'요약 함께'면 요약도)
// 재생 목록의 한 칸(말씀) — 앨범과 말씀 목록이 함께 쓴다
function verseItem(v) {
  const text = verseSpokenText(v);   // 말씀 + 요절
  return { no: v.no, kind: "verse", ref: verseRefFull(v), text: text,
           lang: isEnMode(v) ? "en-US" : "ko-KR",
           sec: text.length / (ALBUM_CPS * getSpeakRate()) };
}

// 말씀만 읽는 재생 목록(3분요약 없음) — 말씀 목록 화면이 쓴다
function verseItemsFor(list) { return list.map(verseItem); }

function albumItemsFor(list) {
  const items = [];
  list.forEach((v) => {
    const want = albumPickMode
      ? (albumPicks.get(v.no) || { v: false, a: false })
      : { v: true, a: albumWithSummary() };
    if (want.v) items.push(verseItem(v));
    if (want.a) {
      const sm = albumSermonOf(v.no);
      if (sm) items.push({ no: v.no, kind: "audio", ref: verseRefFull(v),
                           url: SERMON_AUDIO_BASE + sm.audio + "?v3",
                           sec: (sm.audioScript || "").length / ALBUM_CPS || 180 });
    }
  });
  return items;
}

// 모르고 눌렀다가 당황하지 않도록 버튼에 미리 적어 둔다(전부+요약이면 한 시간이 넘는다)
function albumPlayStart(items) {
  if (!items.length) { appAlert("들을 것을 하나 이상 골라 주세요."); return; }
  albumPlayer = { items: items, i: 0, paused: false };
  keepScreenAwake(true).then(() => albumPlayBar());   // 탭한 그 자리에서 요청해야 받아 준다
  albumPlayStep();
}

function albumPlayStep() {
  const p = albumPlayer;
  if (!p) return;
  const it = p.items[p.i];
  if (!it) { albumPlayStop(); return; }
  const gen = ++albumPlayGen;                 // 이 재생의 번호
  albumPlayBar();
  albumPlayFocus(it.no);
  const next = () => {
    if (gen !== albumPlayGen || !albumPlayer) return;   // 철 지난 콜백은 버린다
    albumPlayer.i++;
    if (albumPlayer.i >= albumPlayer.items.length) { albumPlayStop(); return; }
    albumClearGap();
    albumGapTimer = setTimeout(() => {
      albumGapTimer = null;
      if (gen !== albumPlayGen || !albumPlayer) return;
      // 쉬는 동안 멈춤을 눌렀다면 여기서 시작하지 않는다 — '이어서'를 누를 때 간다
      if (albumPlayer.paused) { albumPlayer.gapDone = true; return; }
      albumPlayStep();
    }, ALBUM_GAP_MS);
  };
  if (it.kind === "verse") speakLong(it.text, next, it.lang);
  else playSermonAudio(it.url, next);
}

function albumPlayToggle() {
  const p = albumPlayer;
  if (!p) return;
  p.paused = !p.paused;
  if (!p.paused) keepScreenAwake(true).then(() => albumPlayBar());  // 탭한 김에 다시 시도
  if (!p.paused && p.gapDone) {   // 쉬는 사이에 멈췄다가 이어서 — 기다릴 것 없이 바로
    p.gapDone = false;
    albumPlayStep();
    return;
  }
  const it = p.items[p.i] || {};
  if (it.kind === "audio") {
    if (p.paused) { try { sermonAudio && sermonAudio.pause(); } catch (e) {} }
    else if (sermonAudio) sermonAudio.play().catch(() => {});
  } else if (window.speechSynthesis) {
    if (p.paused) window.speechSynthesis.pause();
    else window.speechSynthesis.resume();
  }
  albumPlayBar();
}

// 이전/다음 — 목록 밖으로 나가면 재생을 마친다
function albumPlayJump(d) {
  const p = albumPlayer;
  if (!p) return;
  const n = p.i + d;
  if (n < 0 || n >= p.items.length) { albumPlayStop(); return; }
  albumPlayGen++;            // 지금 재생의 콜백을 무효로
  albumClearGap();
  keepScreenAwake(true);     // 이전/다음도 사용자의 탭이다 — 이 김에 다시 걸어 본다
  stopSpeaking();
  p.i = n;
  p.paused = false;
  p.gapDone = false;
  albumPlayStep();
}

function albumPlayStop() {
  albumPlayGen++;
  albumClearGap();
  keepScreenAwake(false);
  stopSpeaking();
  albumPlayer = null;
  albumPlayBar();
  document.querySelectorAll(".playing").forEach((c) => c.classList.remove("playing"));
}

// 읽는 카드를 강조하고 화면 가운데로 따라 올린다
// 앨범 카드와 말씀 목록 카드 양쪽에 쓰인다
function albumPlayFocus(no) {
  document.querySelectorAll(".playing").forEach((c) => c.classList.remove("playing"));
  const c = document.querySelector('.album-card[data-no="' + no + '"], .verse-card[data-no="' + no + '"]');
  if (!c) return;
  c.classList.add("playing");
  try { c.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (e) { c.scrollIntoView(); }
}

// 화면 아래 고정 재생 바 — 재생 중에만 존재한다
function albumPlayBar() {
  let bar = document.getElementById("ab-play-bar");
  if (!albumPlayer) {
    if (bar) bar.remove();
    document.body.classList.remove("ab-playing");
    return;
  }
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "ab-play-bar";
    bar.className = "ab-play-bar";
    document.body.appendChild(bar);
    document.body.classList.add("ab-playing");
  }
  const p = albumPlayer;
  const it = p.items[p.i] || {};
  // 3분요약이 섞인 목록에서만 '요약은 이어집니다'라고 쓴다 —
  // 말씀 목록 화면은 요약이 없어 그 말이 거짓이 된다.
  const hasAudio = p.items.some((x) => x.kind === "audio");
  const tail = hasAudio
    ? "화면이 꺼지면 말씀 낭독이 멈춥니다 (3분요약은 이어집니다)"
    : "화면이 꺼지면 낭독이 멈춥니다";
  const note = albumWakeOn
    ? "🔆 듣는 동안 화면이 저절로 꺼지지 않게 해 둡니다 (전원 버튼을 누르면 멈춰요)"
    : albumWakeErr
      ? "⚠️ 화면 켜 두기 실패 [" + albumWakeErr + "] — 절전 모드를 끄면 될 수 있어요. " + tail
      : "ⓘ " + tail;
  bar.innerHTML =
    '<div class="pb-now"><b>' + (p.i + 1) + ' / ' + p.items.length + '</b>' +
      '<span class="pb-ref">' + (it.ref || "") + '</span>' +
      (it.kind === "audio" ? '<span class="pb-kind">📻 3분요약</span>' : '') + '</div>' +
    '<div class="pb-btns">' +
      '<button id="pb-prev" aria-label="이전">⏮</button>' +
      '<button id="pb-play" class="pb-main">' + (p.paused ? "▶️ 이어서" : "⏸ 일시정지") + '</button>' +
      '<button id="pb-next" aria-label="다음">⏭</button>' +
      '<button id="pb-close" aria-label="재생 닫기">✕</button>' +
    '</div>' +
    '<div class="pb-note">' + note + '</div>';
  bar.querySelector("#pb-prev").addEventListener("click", () => albumPlayJump(-1));
  bar.querySelector("#pb-next").addEventListener("click", () => albumPlayJump(1));
  bar.querySelector("#pb-play").addEventListener("click", albumPlayToggle);
  bar.querySelector("#pb-close").addEventListener("click", albumPlayStop);
}

function albumDurText(items) {
  const gaps = Math.max(0, items.length - 1) * (ALBUM_GAP_MS / 1000);
  const sec = Math.round(items.reduce((a, x) => a + (x.sec || 0), 0) + gaps);
  if (!sec) return "";
  if (sec < 60) return "약 " + sec + "초";
  const m = Math.round(sec / 60);
  if (m < 60) return "약 " + m + "분";
  const rest = m % 60;
  return "약 " + Math.floor(m / 60) + "시간" + (rest ? " " + rest + "분" : "");
}

// "주의 말씀은 내 발에" → "주○ 말○○ 내 발○" — 문장부호는 남겨 리듬을 유지한다
function firstCharHint(text) {
  return String(text || "")
    .split(/(\s+)/)
    .map((w) => (/^\s+$/.test(w) || w.length < 2
      ? w
      : w[0] + w.slice(1).replace(/[^\s.,!?·:;"'()[\]]/g, "○")))
    .join("");
}

// 오늘 확인한 구절 — 날짜(KST)가 바뀌면 자동으로 비워진다
const ALBUM_CHECKED_KEY = "album-checked";
function albumTodayStr() {
  const p = kstDateParts();
  if (!p) return "";
  const z = (n) => String(n).padStart(2, "0");
  return `${p.y}-${z(p.m)}-${z(p.d)}`;
}
function albumCheckedToday() {
  try {
    const raw = JSON.parse(localStorage.getItem(ALBUM_CHECKED_KEY) || "{}");
    return raw.date === albumTodayStr() && Array.isArray(raw.nos) ? raw.nos : [];
  } catch { return []; }
}
// 켜고 끄기 — 잘못 눌렀을 때 되돌릴 수 있어야 한다
function toggleAlbumChecked(no) {
  const nos = albumCheckedToday();
  const i = nos.indexOf(no);
  if (i >= 0) nos.splice(i, 1); else nos.push(no);
  try { localStorage.setItem(ALBUM_CHECKED_KEY, JSON.stringify({ date: albumTodayStr(), nos })); } catch {}
  return i < 0; // 이번에 확인 표시가 켜졌으면 true
}

function renderAlbum() {
  const u = loadUser();
  const appEl = document.getElementById("app");
  const done = verses.filter((v) => getPassedStage(v.no) >= 3);
  const hearted = done.filter((v) => isHearted(v.no));
  const hiding = albumHideRef || albumHideText || albumHint;
  const checked = albumCheckedToday();

  // 기본 정렬: 오늘 확인하지 않은 것 먼저 → 그 안에서 최신(구절 번호 큰 것) 먼저.
  // 아직 볼 것이 위로 모여 스크롤 없이 이어서 할 수 있다.
  let list = [...done].sort((a, b) => {
    const ca = checked.includes(a.no) ? 1 : 0;
    const cb = checked.includes(b.no) ? 1 : 0;
    return ca !== cb ? ca - cb : b.no - a.no;
  });
  if (albumOrder) {
    const byNo = new Map(done.map((v) => [v.no, v]));
    const mixed = albumOrder.map((n) => byNo.get(n)).filter(Boolean);
    const seen = new Set(mixed.map((v) => v.no));
    list = mixed.concat(done.filter((v) => !seen.has(v.no)));
  }
  if (albumUnseenOnly) list = list.filter((v) => !checked.includes(v.no));

  const cards = list.map((v) => {
    const heart = isHearted(v.no);
    const isChecked = checked.includes(v.no);
    const ref = verseRefFull(v);
    // 고르기 모드에서만 보이는 선택 칩 — 말씀과 3분요약을 따로 담는다
    const pk = albumPicks.get(v.no) || { v: false, a: false };
    const hasAudio = !!albumSermonOf(v.no);
    const chip = (kind, on, label) =>
      `<span class="ap-chip${on ? " on" : ""}" data-pick="${v.no}" data-kind="${kind}"` +
      ` role="button" tabindex="0" aria-pressed="${on}">${on ? "⬤" : "○"} ${label}</span>`;
    const pickHtml = albumPickMode
      ? `<span class="album-pick">${chip("v", pk.v, "말씀")}${hasAudio ? chip("a", pk.a, "📻 3분요약") : ""}</span>`
      : "";
    // 확인한 구절은 숨김·힌트와 무관하게 늘 전문을 보여준다
    const body = albumHint && !isChecked ? firstCharHint(verseText(v)) : verseText(v);
    return `
      <button class="album-card${heart ? " hearted" : ""}${isChecked ? " checked" : ""}" data-no="${v.no}">
        ${heart ? `<span class="album-crown">👑</span>` : ""}
        ${pickHtml}
        <span class="album-ref">${ref}</span>
        <span class="album-text">${body}</span>
        <span class="album-tools">
          <span class="album-go" data-go="${v.no}" role="button" tabindex="0" aria-label="${ref} 암송하기">📖 암송</span>
          <span class="album-listen" data-listen="${v.no}" role="button" tabindex="0" aria-label="${ref} 들어보기">🔊 듣기</span>
          <span class="album-why" data-why="${v.no}" role="button" tabindex="0"
                aria-expanded="false" aria-label="${ref} 풀이 보기">💡 풀이</span>
          <span class="album-check${isChecked ? " on" : ""}" data-check="${v.no}" role="button" tabindex="0"
                aria-pressed="${isChecked}" aria-label="${ref} 오늘 확인">${isChecked ? "✅ 확인함" : "✓ 확인"}</span>
        </span>
        <span class="album-why-body" data-body="${v.no}" hidden></span>
      </button>`;
  }).join("");

  const playItems = albumItemsFor(list);
  const playLabel = (items) => {
    const d = albumDurText(items);
    return (albumPickMode ? "▶️ " + items.length + "개 듣기" : "▶️ 전부 듣기") +
           (d ? ' <span class="ab-dur">' + d + "</span>" : "");
  };

  appEl.innerHTML = `
    <div class="album-screen">
      <h2 class="rank-title">📖 나의 말씀 앨범</h2>
      <div class="album-banner">
        <div class="ab-line"><b class="ab-num">${hearted.length}</b>구절을 마음에 두었습니다 👑</div>
      </div>
      <div class="rank-filter album-quiz" id="ab-quiz">
        <button data-h="ref" class="${albumHideRef ? "on" : ""}">${albumHideRef ? "🙈" : "👁"} 요절 숨김</button>
        <button data-h="text" class="${albumHideText ? "on" : ""}">${albumHideText ? "🙈" : "👁"} 말씀 숨김</button>
        <button data-h="hint" class="${albumHint ? "on" : ""}">💡 힌트</button>
        <button data-h="shuffle" class="${albumOrder ? "on" : ""}">🔀 섞기</button>
        <button data-h="unseen" class="${albumUnseenOnly ? "on" : ""}">🔎 미확인</button>
      </div>
      ${list.length ? `
      <div class="rank-filter album-play" id="ab-play">
        <button id="ab-play-go" class="ab-go">${playLabel(playItems)}</button>
        <button data-p="pick" class="${albumPickMode ? "on" : ""}">☑️ 고르기</button>
        ${albumPickMode
          ? `<button data-p="all">전체 선택</button><button data-p="none">해제</button>`
          : `<button data-p="sum" class="${albumWithSummary() ? "on" : ""}">📄 요약 함께</button>`}
      </div>` : ""}
      ${hiding ? `<p class="album-hint">가려진 곳을 떠올려 보고, 카드를 눌러 확인하세요</p>` : ""}
      ${list.length
        ? `<div class="album-grid${albumHideRef ? " hide-ref" : ""}${albumHideText ? " hide-text" : ""}">${cards}</div>`
        : `<p class="album-empty">${done.length
            ? "오늘 전부 확인하셨어요! 🎉<br>「미확인」을 끄면 다시 볼 수 있어요."
            : "아직 완료한 구절이 없어요.<br>첫 구절을 암송해 보세요 📖"}</p>`}
    </div>
    <button class="home-fab" id="ab-back" aria-label="첫 화면으로">${homeFabLabel(u)}</button>`;

  window.scrollTo(0, 0); // 첫 화면에서 내려온 위치가 남아 중간부터 보이던 문제
  if (albumPlayer) albumPlayFocus((albumPlayer.items[albumPlayer.i] || {}).no);
  document.getElementById("ab-back").addEventListener("click", () => { albumPlayStop(); renderSummary(); });
  document.getElementById("ab-quiz").querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => {
      const h = b.dataset.h;
      if (h === "ref") albumHideRef = !albumHideRef;
      else if (h === "text") { albumHideText = !albumHideText; if (albumHideText) albumHint = false; }
      else if (h === "hint") { albumHint = !albumHint; if (albumHint) albumHideText = false; }
      else if (h === "unseen") albumUnseenOnly = !albumUnseenOnly;
      else albumOrder = albumOrder ? null : shuffled(done.map((v) => v.no));
      renderAlbum();
    }));

  // 재생 줄 — '전부 듣기'(말씀만)는 설교 데이터 없이 바로 된다.
  // 설교는 1MB라 '요약 함께'·'고르기'를 켤 때 비로소 받는다(앨범의 기존 규칙).
  const goBtn = document.getElementById("ab-play-go");
  if (goBtn) goBtn.addEventListener("click", () => albumPlayStart(albumItemsFor(list)));
  const playRow = document.getElementById("ab-play");
  if (playRow) playRow.querySelectorAll("button[data-p]").forEach((b) =>
    b.addEventListener("click", async () => {
      const k = b.dataset.p;
      if (k === "pick" || k === "sum") {
        const turningOn = k === "pick" ? !albumPickMode : !albumWithSummary();
        if (turningOn && !albumSermonsReady) {
          b.textContent = "불러오는 중…";
          b.disabled = true;
          await loadSermons().catch(() => []);
          albumSermonsReady = true;
        }
        if (k === "pick") { albumPickMode = !albumPickMode; if (!albumPickMode) albumPicks.clear(); }
        else setAlbumWithSummary(!albumWithSummary());
      } else if (k === "all") {
        list.forEach((v) => albumPicks.set(v.no, { v: true, a: !!albumSermonOf(v.no) }));
      } else if (k === "none") {
        albumPicks.clear();
      }
      renderAlbum();
    }));

  // 칩 하나를 눌렀다고 목록을 다시 그리면 화면이 맨 위로 튄다 — 그 자리에서만 바꾼다
  const refreshGo = () => {
    const g = document.getElementById("ab-play-go");
    if (g) g.innerHTML = playLabel(albumItemsFor(list));
  };
  appEl.querySelectorAll(".ap-chip").forEach((s) =>
    s.addEventListener("click", (e) => {
      e.stopPropagation();
      const no = Number(s.dataset.pick), kind = s.dataset.kind;
      const cur = albumPicks.get(no) || { v: false, a: false };
      if (kind === "v") cur.v = !cur.v; else cur.a = !cur.a;
      albumPicks.set(no, cur);
      const on = kind === "v" ? cur.v : cur.a;
      s.classList.toggle("on", on);
      s.setAttribute("aria-pressed", String(on));
      s.textContent = (on ? "⬤ " : "○ ") + (kind === "v" ? "말씀" : "📻 3분요약");
      refreshGo();
    }));

  appEl.querySelectorAll(".album-listen").forEach((s) =>
    s.addEventListener("click", (e) => {
      e.stopPropagation(); // 카드 열기(확인/암송)와 겹치지 않게
      const v = verses.find((x) => x.no === Number(s.dataset.listen));
      if (!v) return;
      if (window.speechSynthesis && window.speechSynthesis.speaking) { stopSpeaking(); return; }
      speakText(verseSpokenText(v), null, 1, isEnMode(v) ? "en-US" : "ko-KR");
    }));

  const goTest = (no) => {
    const v = verses.find((x) => x.no === Number(no));
    if (v) { albumPlayStop(); startTest(v); }
  };
  appEl.querySelectorAll(".album-go").forEach((s) =>
    s.addEventListener("click", (e) => { e.stopPropagation(); goTest(s.dataset.go); }));

  // 가려둔 곳을 펼치고 되돌린다 — 카드를 누르든 확인을 누르든 같게 동작해야 한다.
  // 힌트는 blur가 아니라 글자 자체를 바꾼 것이라 본문을 직접 갈아끼운다.
  const setText = (c, hinted) => {
    if (!albumHint) return;
    const v = verses.find((x) => x.no === Number(c.dataset.no));
    const el = c.querySelector(".album-text");
    if (v && el) el.textContent = hinted ? firstCharHint(verseText(v)) : verseText(v);
  };
  const reveal = (c) => {
    if (!hiding || c.classList.contains("peek")) return;
    c.classList.add("peek");
    setText(c, false);
  };
  const conceal = (c) => {
    if (!c.classList.contains("peek")) return;
    c.classList.remove("peek");
    setText(c, true);
  };

  // 확인 상태를 화면에 반영한다. 여기서 목록을 다시 그리면 「미확인」일 때 카드가
  // 눈앞에서 사라져 놀라므로, 화면은 그대로 두고 표시만 바꾼다.
  const applyChecked = (card, on) => {
    const chip = card.querySelector(".album-check");
    card.classList.toggle("checked", on);
    if (chip) {
      chip.classList.toggle("on", on);
      chip.textContent = on ? "✅ 확인함" : "✓ 확인";
      chip.setAttribute("aria-pressed", String(on));
    }
    // 확인 = 답 맞춰보기라 함께 펼치고, 확인을 풀면 다시 가려 처음처럼 되돌린다
    if (on) reveal(card); else conceal(card);
  };

  appEl.querySelectorAll(".album-check").forEach((s) =>
    s.addEventListener("click", (e) => {
      e.stopPropagation();
      applyChecked(s.closest(".album-card"), toggleAlbumChecked(Number(s.dataset.check)));
    }));

  // 💡 풀이 — 말씀이 나온 자리를 함께 보면 훨씬 오래 남는다.
  // 설교 데이터가 1MB라 미리 받지 않고, 처음 누른 순간에만 불러온다(이후 캐시).
  appEl.querySelectorAll(".album-why").forEach((btn) =>
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const no = Number(btn.dataset.why);
      const body = appEl.querySelector('.album-why-body[data-body="' + no + '"]');
      if (!body) return;
      if (!body.hidden) {                       // 열려 있으면 접기
        body.hidden = true;
        btn.classList.remove("on");
        btn.setAttribute("aria-expanded", "false");
        return;
      }
      btn.classList.add("on");
      btn.setAttribute("aria-expanded", "true");
      body.hidden = false;
      if (body.dataset.filled) return;
      body.textContent = "불러오는 중…";
      const list = await loadSermons().catch(() => []);
      const sm = (list || []).find((x) => x.memVerseNo === no && (x.easyExplain || x.memoryTip));
      if (!sm) { body.textContent = "이 구절은 아직 풀이가 준비되지 않았어요."; return; }
      body.innerHTML = "";
      const add = (label, text) => {
        if (!text) return;
        const row = document.createElement("span");
        row.className = "awb-row";
        const b = document.createElement("b"); b.textContent = label;
        row.appendChild(b);
        row.appendChild(document.createTextNode(" " + text));
        body.appendChild(row);
      };
      add("쉬운 풀이", sm.easyExplain);
      add("기억법", sm.memoryTip);
      body.dataset.filled = "1";
    }));

  // 말씀 영역을 누르는 것도 '확인'이다 — 펼쳐 보는 순간 답을 본 것이므로.
  // 다만 해제는 버튼으로만 한다(스크롤 중 잘못 눌러 확인이 풀리면 곤란하다).
  // 암송 진입은 📖 암송 버튼으로만 — 더블탭은 iOS 확대와 부딪히고 타이밍 부담도 크다.
  appEl.querySelectorAll(".album-card").forEach((c) =>
    c.addEventListener("click", () => {
      if (albumPickMode) return;   // 고르기 중에는 칩으로만 담는다
      if (c.classList.contains("checked")) return;
      toggleAlbumChecked(Number(c.dataset.no));
      applyChecked(c, true);
    }));
}

function renderRanking(range) {
  const r = range || rankRangeFor("yday");
  const u = loadUser();
  const appEl = document.getElementById("app");
  const tabs = [["today", "오늘"], ["yday", "전일~당일"], ["week", "이번주"], ["all", "전체"]];
  appEl.innerHTML = `
    <div class="rank-screen">
      ${rankModeBar("rank")}
      <h2 class="rank-title">🏆 말씀 도전 순위</h2>
      <div class="rank-filter" id="rk-filter">
        ${tabs.map(([k, l]) => `<button data-k="${k}" class="${r.key === k ? "on" : ""}">${l}</button>`).join("")}
      </div>
      <div class="rank-dates">
        <input type="date" id="rk-from" value="${r.from || ""}" />
        <span class="rd-sep">~</span>
        <input type="date" id="rk-to" value="${r.to || ""}" />
        <button class="rd-go" id="rk-go">조회</button>
      </div>
      <div id="rank-body"><p class="rank-msg">불러오는 중...</p></div>
    </div>
    <button class="home-fab" id="rk-back" aria-label="첫 화면으로">${homeFabLabel(u)}</button>`;
  window.scrollTo(0, 0); // 이전 화면의 스크롤 위치가 남지 않도록
  document.getElementById("rk-back").addEventListener("click", renderSummary);
  wireRankMode();
  document.getElementById("rk-filter").querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => renderRanking(rankRangeFor(b.dataset.k)))
  );
  document.getElementById("rk-go").addEventListener("click", () => {
    const from = document.getElementById("rk-from").value;
    const to = document.getElementById("rk-to").value;
    renderRanking({ key: "custom", from, to });
  });
  loadRankingBody(r);
}

async function loadRankingBody(r) {
  const body = document.getElementById("rank-body");
  const u = loadUser();
  const data = await callRanking(r.from, r.to).catch(() => ({ ok: false }));
  if (!data || !data.ok) { body.innerHTML = `<p class="rank-msg err">순위를 불러오지 못했습니다.</p>`; return; }

  const list = data.list || [];
  const keyOf = (g, s, sb, n) => g + "|" + s + "|" + sb + "|" + n;
  const myKey = u ? keyOf(u.type, u.gu || u.bu || "", u.mok || u.grade || "", u.name) : null;
  const me = myKey ? list.find((x) => keyOf(x.gubun, x.sosok, x.sebu, x.name) === myKey) : null;
  const medal = (n) => (n === 1 ? "🥇" : n === 2 ? "🥈" : n === 3 ? "🥉" : n);
  // 소속 표기 — '사랑교구 3목장' → '사랑-3'. 순위 줄을 한 줄로 지키려고 짧게 쓴다.
  // 목장은 입력 단계에서 숫자 또는 '남성'만 허용되고(app.js의 검사), 99는 '없음'을 뜻한다.
  const soLabel = (x) => {
    const head = String(x.sosok || "").trim();
    let tail = String(x.sebu || "").trim();
    if (x.gubun === "교구") { if (tail === "99") tail = ""; }
    else tail = tail.replace(/학년$/, "");
    return tail ? `${head}-${tail}` : head;
  };

  // 응원을 '줄' 수 있는 조건 — 로그인했고, 오늘 내 활동이 있고, 보고 있는 기간이 오늘을
  // 포함해야 한다. 오늘이 안 든 기간(직접 지정)에서는 응원이 오늘로 기록되는데 화면은 그
  // 기간만 세므로, 눌러도 숫자가 안 변해 어리둥절해진다.
  const rangeHasToday = !r.to || r.to >= ymdKo(new Date());
  const canGive = !!u && !!data.canCheer && rangeHasToday;

  // 한 줄에 손댈 곳이 둘이다. 뜻을 확실히 갈라 둔다 —
  //   👏 칩  = 응원 주기/취소만 (+ / −)
  //   42회   = 누르면 '누가 응원했나' 명단
  // 칩 하나에 두 뜻을 겹쳐 뒀더니 명단을 보려다 응원이 지워졌다. 칩 안을 다시 둘로
  // 쪼개는 것도 탭 영역이 30px도 안 돼 위험하다. 이미 넉넉한 '횟수'를 명단 자리로 쓴다.
  const chip = (x, i, isMe) => {
    const n = x.cheers || 0;
    const num = n ? `<b>${n}</b>` : ""; // 0이면 숫자를 그리지 않는다(0이 줄줄이 드러나면 상처가 된다)
    // 자기 자신은 응원할 수 없다 — 내 줄의 칩은 받은 수만 보여주는 표식이다.
    if (isMe) return `<span class="rk-cheer mine" aria-label="내가 받은 응원 ${n}">👏${num}</span>`;
    // 오늘 기록이 없는 분은 아직 응원을 받을 수 없다(주는 쪽과 대칭). 눌러도 되는 것처럼
    // 보이지 않게 흐리게 두되, 눌리기는 해서 왜 안 되는지 알려 준다.
    const lock = x.activeToday ? "" : " locked";
    return `<button class="rk-cheer${x.iCheered ? " on" : ""}${lock}" data-rkact="${i}"
      aria-label="${x.iCheered ? "응원 취소" : "응원하기"}">👏${num}</button>`;
  };

  // 내 소속도 목록의 줄과 같은 표기로 보여준다(화평-20). 같은 이름이 여럿일 때
  // 목록에서 내 줄을 찾는 실마리가 된다.
  const mySo = u ? soLabel({
    gubun: u.type, sosok: u.gu || u.bu || "", sebu: u.mok || u.grade || "",
  }) : "";
  // 받은 응원은 '내 순위'에서만 이름까지 본다. 남의 줄은 숫자만 보이고 누가 눌렀는지는
  // 보이지 않는다 — 누가 누구를 응원했는지가 온 교회에 드러날 일은 아니다.
  const myCheers = (me && me.cheers) || 0;
  const myHtml = u
    ? `<div class="my-rank">
         ${me ? `<span class="mr-rank">${medal(me.rank)}</span>` : ""}
         <span class="mr-name">${u.name}</span>
         <span class="mr-so">${mySo}</span>
         ${me
            ? `<span class="mr-cnt">${me.count}회</span>`
            : `<span class="mr-cnt none">아직 기록 없어요 🔥</span>`}
         <button class="mr-cheer" id="mr-cheer"${myCheers ? "" : " disabled"}
           aria-label="나를 응원한 사람 ${myCheers}명 보기">👏${myCheers ? `<b>${myCheers}</b>` : ""}</button>
       </div>
       <div class="rk-names" id="mr-names" hidden></div>`
    : "";

  // 자격이 없으면 목록 위에 한 줄로 알린다. 줄마다 자물쇠를 달면 화면이 시끄러워진다.
  const lockHtml = (u && !data.canCheer && rangeHasToday)
    ? `<p class="rank-lock">🔒 오늘 말씀을 한 번이라도 암송하면 서로 응원할 수 있어요
         <button id="rk-go-test">도전하러 가기 ›</button></p>`
    : "";

  if (!list.length) {
    body.innerHTML = myHtml + `<p class="rank-msg">아직 도전 기록이 없어요.<br>첫 도전의 주인공이 되어보세요! 🔥</p>`;
    return;
  }

  const rows = list.map((x, i) => {
    const isMe = keyOf(x.gubun, x.sosok, x.sebu, x.name) === myKey;
    return `<div class="rank-row ${x.rank <= 3 ? "top" : ""} ${isMe ? "me" : ""} ${x.liveNow ? "live" : ""}">
      <span class="rk-no">${medal(x.rank)}</span>
      <span class="rk-name">${x.liveNow ? `<i class="rk-dot" aria-label="지금 암송 중"></i>` : ""}${x.name}</span>
      <span class="rk-so">${soLabel(x)}</span>
      <span class="rk-cnt">${x.count}회</span>
      ${chip(x, i, isMe)}
    </div>`;
  }).join("");

  // 지금 함께하고 있는 분이 있으면 그것부터 알린다 — 초록 점이 무슨 뜻인지도 여기서 알게 된다
  const liveCount = list.filter((x) => x.liveNow).length;
  const liveHtml = liveCount
    ? `<p class="rank-live-line"><i class="rk-dot"></i> 지금 <b>${liveCount}명</b>이 함께 암송하고 있어요</p>`
    : "";
  body.innerHTML = myHtml + lockHtml + liveHtml + `<div class="rank-list">${rows}</div>` +
    `<p class="rank-more">전체 ${list.length}명 참여</p>`;

  const goTest = document.getElementById("rk-go-test");
  if (goTest) goTest.addEventListener("click", renderSummary);
  body.querySelectorAll("[data-rkact]").forEach((btn) => btn.addEventListener("click", () =>
    toggleRankCheer(list[+btn.dataset.rkact], btn, canGive)));
  const mrc = document.getElementById("mr-cheer");
  if (mrc) mrc.addEventListener("click", () => toggleMyCheerers(mrc, r));
}

// 「내 순위」의 👏 = 나를 응원한 사람 명단(다시 누르면 접힘).
// 서버는 부른 사람 본인 것만 돌려준다 — 남의 명단은 물어볼 길이 없다.
async function toggleMyCheerers(btn, r) {
  const box = document.getElementById("mr-names");
  if (!box) return;
  if (!box.hidden) { box.hidden = true; btn.classList.remove("open"); return; }
  box.hidden = false;
  btn.classList.add("open");
  box.innerHTML = '<div class="rx-names-top"><span class="rx-names-msg">불러오는 중…</span></div>';
  let names;
  try { names = (await api.rankCheerers(myUserId(), r.from, r.to)).list || []; }
  catch (e) { box.innerHTML = '<div class="rx-names-top"><span class="rx-names-msg">이름을 불러오지 못했어요.</span></div>'; return; }
  box.innerHTML = '<div class="rx-names-top"><span class="rx-names-e">👏</span>' +
    (names.length
      ? '<span class="rx-names-l">' + names.map((n) => boardEsc(n)).join(" · ") + '</span>'
      : '<span class="rx-names-msg">아직 받은 응원이 없어요.</span>') + '</div>';
}

// 👏 칩 = 응원 주기/취소. 칩은 이 일만 한다.
async function toggleRankCheer(x, btn, canGive) {
  if (!canGive) {
    appAlert("오늘 말씀을 한 번이라도 암송하면<br>서로 응원할 수 있어요. 🔥");
    return;
  }
  // 이미 준 응원을 무르는 건 언제나 된다. 새로 주는 것만 받는 쪽 조건을 본다.
  if (!x.iCheered && !x.activeToday) {
    appAlert("오늘 말씀을 암송한 성도님께<br>응원할 수 있어요. 🙌");
    return;
  }
  // 주기도 취소도 묻지 않고 바로 한다. 칩이 이 일만 하므로 잘못 누를 여지가 적고,
  // 다시 누르면 그 자리에서 되돌아간다.
  const on = !x.iCheered;
  btn.disabled = true; // 연타로 두 번 보내지 않도록
  const ok = await giveRankCheer(x, on);
  btn.disabled = false;
  if (!ok) return;
  btn.classList.toggle("on", x.iCheered);
  btn.innerHTML = "👏" + (x.cheers ? `<b>${x.cheers}</b>` : "");
  btn.setAttribute("aria-label", x.iCheered ? "응원 취소" : "응원하기");
}

// 응원 주기/취소 — 서버가 자격을 다시 검사하므로, 거절되면 그 문구를 그대로 보여준다.
// 성공하면 순위를 통째로 다시 받지 않고 x와 칩만 고친다. '전체' 기간은 challenge_log를
// 전부 집계하므로(한 사람만 수천 건), 누를 때마다 다시 받으면 버튼이 멈춘 것처럼 느려진다.
// 응원할 수 있다는 것은 오늘이 조회 기간 안이라는 뜻이라(canGive), ±1 계산이 화면에
// 보이는 숫자와 어긋나지 않는다.
async function giveRankCheer(x, on) {
  const u = loadUser();
  if (!u || !u.user_id) { appAlert("로그인하시면 응원할 수 있어요."); return false; }
  let d;
  try { d = await api.rankCheer(x.gubun, x.sosok, x.sebu, x.name, u.user_id, boardWho(), on); }
  catch (e) { appAlert("응원을 저장하지 못했어요.<br>" + boardEsc(e && e.message ? e.message : e)); return false; }
  if (!d || !d.ok) { appAlert(boardEsc((d && d.error) || "응원하지 못했어요.")); return false; }
  x.iCheered = on;
  x.cheers = Math.max(0, (x.cheers || 0) + (on ? 1 : -1));
  return true;
}

// ---- 순위/내참여 모드 전환 바 ----
function rankModeBar(active) {
  return `<div class="rank-mode">
    <button class="${active === "rank" ? "on" : ""}" data-m="rank">🏆 개인</button>
    <button class="${active === "gu" ? "on" : ""}" data-m="gu">⛪ 교구</button>
    <button class="${active === "mine" ? "on" : ""}" data-m="mine">📅 내 참여</button>
  </div>`;
}
function wireRankMode() {
  document.querySelectorAll(".rank-mode button").forEach((b) =>
    b.addEventListener("click", () => {
      if (b.dataset.m === "mine") return renderMyRecord();
      if (b.dataset.m === "gu") return renderGuRanking();
      renderRanking();
    })
  );
}

// ---- 교구별 순위 ----
function renderGuRanking(range) {
  const r = range || rankRangeFor("yday"); // 개인 순위와 같은 기본값(전일~당일)
  const u = loadUser();
  const appEl = document.getElementById("app");
  // 조회 조건은 개인 순위와 동일(같은 탭 + 날짜 직접 지정)
  const tabs = [["today", "오늘"], ["yday", "전일~당일"], ["week", "이번주"], ["all", "전체"]];
  appEl.innerHTML = `
    <div class="rank-screen">
      ${rankModeBar("gu")}
      <h2 class="rank-title">⛪ 교구별 순위</h2>
      <div class="rank-filter" id="gk-filter">
        ${tabs.map(([k, l]) => `<button data-k="${k}" class="${r.key === k ? "on" : ""}">${l}</button>`).join("")}
      </div>
      <div class="rank-dates">
        <input type="date" id="gk-from" value="${r.from || ""}" />
        <span class="rd-sep">~</span>
        <input type="date" id="gk-to" value="${r.to || ""}" />
        <button class="rd-go" id="gk-go">조회</button>
      </div>
      <div id="gu-body"><p class="rank-msg">불러오는 중...</p></div>
    </div>
    <button class="home-fab" id="gk-back" aria-label="첫 화면으로">${homeFabLabel(u)}</button>`;
  window.scrollTo(0, 0); // 이전 화면의 스크롤 위치가 남지 않도록
  document.getElementById("gk-back").addEventListener("click", renderSummary);
  wireRankMode();
  document.getElementById("gk-filter").querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => renderGuRanking(rankRangeFor(b.dataset.k)))
  );
  document.getElementById("gk-go").addEventListener("click", () => {
    const from = document.getElementById("gk-from").value;
    const to = document.getElementById("gk-to").value;
    renderGuRanking({ key: "custom", from, to });
  });
  loadGuRankingBody(r);
}

async function loadGuRankingBody(r) {
  const body = document.getElementById("gu-body");
  const u = loadUser();
  const data = await api.guRanking(r.from, r.to).catch(() => ({ ok: false }));
  if (!data || !data.ok) { body.innerHTML = `<p class="rank-msg err">순위를 불러오지 못했습니다.</p>`; return; }

  const list = data.list || [];
  if (!list.length) {
    body.innerHTML = `<p class="rank-msg">아직 기록이 없어요.<br>우리 교구가 첫 주인공이 되어보세요! 🔥</p>`;
    return;
  }
  const medal = (n) => (n === 1 ? "🥇" : n === 2 ? "🥈" : n === 3 ? "🥉" : n);
  const myGu = u && u.type === "교구" ? u.gu : null;

  const rows = list.map((x) => `
    <div class="rank-row ${x.rank <= 3 ? "top" : ""} ${x.gu === myGu ? "me" : ""}">
      <span class="rk-no">${medal(x.rank)}</span>
      <span class="rk-name">${x.gu}</span>
      <span class="rk-so">${x.people}명</span>
      <span class="rk-cnt">${x.count}회</span>
    </div>`).join("");

  const total = list.reduce((s, x) => s + x.count, 0);
  // 성도는 교구를 하나만 가지므로 교구별 인원을 더하면 곧 전체 참여 인원(중복 없음)
  const people = list.reduce((s, x) => s + x.people, 0);
  body.innerHTML = `<div class="rank-list">${rows}</div>` +
    `<p class="rank-more">${list.length}개 교구 · 총 참여 <b>${people}명</b> · 총 <b>${total}회</b></p>` +
    `<p class="rank-note">암송 · 도전 · 복습을 <b>모두 합한 횟수</b>예요 🙌</p>`;
}

// ---- 내 참여(주간/월간 달력) ----
function mdLabel(d) { return (d.getMonth() + 1) + "/" + d.getDate(); }
function weekRange(anchor) {
  const a = new Date(anchor); a.setHours(0, 0, 0, 0);
  const start = new Date(a); start.setDate(a.getDate() - a.getDay()); // 일요일
  const end = new Date(start); end.setDate(start.getDate() + 6);
  return { start, end };
}
function monthRange(anchor) {
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  return { start, end };
}
function shiftPeriod(s, dir) {
  const a = new Date(s.anchor);
  if (s.mode === "week") a.setDate(a.getDate() + 7 * dir);
  else a.setMonth(a.getMonth() + dir);
  return { mode: s.mode, anchor: a };
}
async function callMyDays(u, from, to) {
  if (!u || !u.user_id) return { ok: false };
  return api.mydays(u.user_id, from, to); // { ok, days:{ymd:count} }
}

function renderMyRecord(state) {
  const s = state || { mode: "week", anchor: new Date() };
  const u = loadUser();
  const appEl = document.getElementById("app");
  appEl.innerHTML = `
    <div class="rank-screen">
      ${rankModeBar("mine")}
      <h2 class="rank-title">📅 나의 말씀 암송 참여</h2>
      <div class="myrec-ctrl">
        <div class="myrec-toggle">
          <button data-md="week" class="${s.mode === "week" ? "on" : ""}">주간</button>
          <button data-md="month" class="${s.mode === "month" ? "on" : ""}">월간</button>
        </div>
        <div class="myrec-nav">
          <button id="mr-prev">◀</button>
          <span id="mr-label">…</span>
          <button id="mr-next">▶</button>
        </div>
      </div>
      <div id="myrec-body"><p class="rank-msg">불러오는 중...</p></div>
    </div>
    <button class="home-fab" id="rk-back" aria-label="첫 화면으로">${homeFabLabel(u)}</button>`;
  window.scrollTo(0, 0); // 이전 화면의 스크롤 위치가 남지 않도록
  document.getElementById("rk-back").addEventListener("click", renderSummary);
  wireRankMode();
  appEl.querySelectorAll(".myrec-toggle button").forEach((b) =>
    b.addEventListener("click", () => renderMyRecord({ mode: b.dataset.md, anchor: s.anchor }))
  );
  document.getElementById("mr-prev").addEventListener("click", () => renderMyRecord(shiftPeriod(s, -1)));
  document.getElementById("mr-next").addEventListener("click", () => renderMyRecord(shiftPeriod(s, 1)));
  loadMyRecord(s);
}

async function loadMyRecord(s) {
  const u = loadUser();
  const body = document.getElementById("myrec-body");
  const label = document.getElementById("mr-label");
  const { start, end } = s.mode === "week" ? weekRange(s.anchor) : monthRange(s.anchor);
  label.textContent = s.mode === "week"
    ? `${mdLabel(start)} ~ ${mdLabel(end)}`
    : `${start.getFullYear()}년 ${start.getMonth() + 1}월`;
  if (!u) { body.innerHTML = `<p class="rank-msg">로그인 정보가 없습니다.</p>`; return; }
  const data = await callMyDays(u, ymdKo(start), ymdKo(end)).catch(() => ({ ok: false }));
  if (!data || !data.ok) { body.innerHTML = `<p class="rank-msg err">기록을 불러오지 못했습니다.</p>`; return; }
  body.innerHTML = renderCalendar(start, end, data.days || {}, s.mode);
}

// 공휴일(빨강) — 2026년 대한민국 공휴일. 필요 시 여기 날짜를 추가/수정하세요.
const HOLIDAYS = new Set([
  "2026-01-01",                             // 신정
  "2026-02-16", "2026-02-17", "2026-02-18", // 설날 연휴
  "2026-03-01", "2026-03-02",               // 삼일절(+대체)
  "2026-05-05",                             // 어린이날
  "2026-05-24", "2026-05-25",               // 부처님오신날(+대체)
  "2026-06-06",                             // 현충일
  "2026-08-15", "2026-08-17",               // 광복절(+대체)
  "2026-09-24", "2026-09-25", "2026-09-26", // 추석 연휴
  "2026-10-03", "2026-10-05",               // 개천절(+대체)
  "2026-10-09",                             // 한글날
  "2026-12-25",                             // 성탄절
]);
function dayColorClass(d, key) {
  const dow = d.getDay();
  if (HOLIDAYS.has(key) || dow === 0) return "sun"; // 일요일·공휴일 빨강
  if (dow === 6) return "sat";                       // 토요일 파랑
  return "";
}

function renderCalendar(start, end, days, mode) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dates = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) dates.push(new Date(d));

  let participated = 0, missed = 0, total = 0;
  const cell = (d) => {
    const key = ymdKo(d);
    const cnt = days[key] || 0;
    const isFuture = d > today;
    const isToday = d.getTime() === today.getTime();
    let cls = "mc-cell";
    let mark = "";
    if (isFuture) { cls += " future"; mark = ""; }
    else {
      total++;
      if (cnt > 0) { cls += " done"; participated++; mark = `<div class="mc-cnt">✅ ${cnt}</div>`; }
      else { cls += " miss"; missed++; mark = `<div class="mc-cnt miss">·</div>`; }
    }
    if (isToday) cls += " today";
    return `<div class="${cls}"><div class="mc-day ${dayColorClass(d, key)}">${d.getDate()}</div>${mark}</div>`;
  };

  const head = `<div class="mc-week-head">${["일","월","화","수","목","금","토"].map((w, i) => `<span class="${i === 0 ? "sun" : i === 6 ? "sat" : ""}">${w}</span>`).join("")}</div>`;
  let cellsHtml = "";
  if (mode === "month") {
    const lead = new Date(start).getDay();
    cellsHtml = Array.from({ length: lead }, () => `<div class="mc-cell blank"></div>`).join("");
  }
  cellsHtml += dates.map(cell).join(""); // cell() 실행 중 카운터 집계

  const summary = `<div class="mc-summary">참여 <b class="done">${participated}일</b> · 미참여 <b class="miss">${missed}일</b> <span class="mc-sub">(지난 ${total}일 기준)</span></div>`;
  return summary + head + `<div class="mc-grid">${cellsHtml}</div>`;
}

// ------------------------------------------------------------
// 새 버전 자동 감지 → '새로고침' 배너
//   실행 중 app.js 버전(캐시된 index.html의 <script> ?v=)과
//   서버 최신 index.html(no-store)의 app.js ?v= 를 비교. 다르면 배너.
//   '새로고침'은 브라우저 HTTP 캐시(약 10분)를 우회하려 캐시버스트 URL로 재진입 + SW 캐시 정리.
// ------------------------------------------------------------
let _updateBannerShown = false;
let _updateLastCheck = 0;
const UPDATE_SEEN_KEY = "update-seen";     // 이미 새로고침하거나 닫은 버전
const UPDATE_QUIET_MS = 30 * 60 * 1000;    // 그 뒤 30분은 다시 조르지 않는다
function currentAppVersion() {
  const s = document.querySelector('script[src*="app.js"]');
  const m = s && s.src.match(/[?&]v=([^&"']+)/);
  return m ? m[1] : null;
}
// 새로고침을 눌렀는데도 브라우저 캐시(max-age 10분) 때문에 옛 index.html이 다시
// 열릴 수 있다. 그때마다 배너를 또 띄우면 성도는 같은 안내를 계속 받는다.
function updateSeen(v) {
  try { localStorage.setItem(UPDATE_SEEN_KEY, JSON.stringify({ v: v, t: Date.now() })); } catch (e) {}
}
function updateMuted(v) {
  try {
    const o = JSON.parse(localStorage.getItem(UPDATE_SEEN_KEY) || "null");
    return !!(o && o.v === v && Date.now() - o.t < UPDATE_QUIET_MS);
  } catch (e) { return false; }
}
function checkForUpdate() {
  if (_updateBannerShown) return;
  if (Date.now() - _updateLastCheck < 60000) return;   // 앱을 오갈 때마다 묻지 않게
  _updateLastCheck = Date.now();
  const cur = currentAppVersion();
  if (!cur) return;
  fetch("index.html", { cache: "no-store" })
    .then((r) => (r.ok ? r.text() : Promise.reject()))
    .then((html) => {
      const m = html.match(/app\.js\?v=([^"'&]+)/);
      const fresh = m ? m[1] : null;
      if (fresh && fresh !== cur && !updateMuted(fresh)) showUpdateBanner(fresh);
    })
    .catch(() => {});
}
function showUpdateBanner(fresh) {
  if (_updateBannerShown || document.getElementById("update-banner")) return;
  _updateBannerShown = true;
  const bar = document.createElement("div");
  bar.id = "update-banner";
  bar.innerHTML =
    `<span class="ub-text">🔄 새 버전이 나왔어요</span>` +
    `<button class="ub-btn" id="ub-refresh">새로고침</button>` +
    `<button class="ub-x" id="ub-close" aria-label="닫기">✕</button>`;
  document.body.appendChild(bar);
  requestAnimationFrame(() => bar.classList.add("show"));
  document.getElementById("ub-refresh").addEventListener("click", async () => {
    updateSeen(fresh);
    const btn = document.getElementById("ub-refresh");
    if (btn) { btn.disabled = true; btn.textContent = "받는 중…"; }
    // 새 주소로 들어가도 옛 내용이 캐시에 남아 있을 수 있다 —
    // cache:"reload"로 먼저 갈아 끼운 뒤 들어간다.
    try {
      await Promise.all([
        fetch("app.js?v=" + fresh, { cache: "reload" }),
        fetch("style.css?v=" + fresh, { cache: "reload" }).catch(() => {}),
        fetch("index.html", { cache: "reload" }).catch(() => {}),
      ]);
    } catch (e) {}
    try { if (window.caches) await caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k)))); } catch (e) {}
    const base = location.pathname.replace(/index\.html$/, "");
    location.replace(base + "?u=" + Date.now()); // 캐시버스트 URL → 서버 최신 index.html
  });
  document.getElementById("ub-close").addEventListener("click", () => {
    updateSeen(fresh);                 // 닫았으면 그 버전은 더 묻지 않는다
    bar.classList.remove("show");
    setTimeout(() => bar.remove(), 250);
    _updateBannerShown = false;
  });
}
setTimeout(checkForUpdate, 4000); // 시작 몇 초 뒤 1회
document.addEventListener("visibilitychange", () => { if (!document.hidden) checkForUpdate(); }); // 앱 복귀 시

promptOpenExternal();
loadVerses();
