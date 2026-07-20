// ============================================================
// 성경 암송 — 회원 버전(교구/교회학교 식별) app.js
// ============================================================
// 익명 버전과 동일한 암송 로직 + 진입(식별)·본인 기록 요약·서버 백업 추가
// ------------------------------------------------------------

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

// 스플래시 제거 — 광고 효과를 위해 시작 후 최소 2초는 유지한 뒤 사라진다.
const SPLASH_MIN_MS = 3000;
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
    if (p === "intro" || p === "blessing" || p === "daily") {
      history.replaceState(null, "", location.pathname);
      return p;
    }
  } catch (e) {}
  return null;
}

// URL의 ?v=<구절번호>를 1회 읽어 반환(읽은 뒤 URL은 정리해 새로고침 시 재진입 방지)
function getDeepLinkVerseNo() {
  try {
    const n = parseInt(new URLSearchParams(location.search).get("v") || "", 10);
    if (Number.isFinite(n) && n > 0) {
      history.replaceState(null, "", location.pathname);
      return n;
    }
  } catch (e) {}
  return null;
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
  let current = null;
  for (const item of dated) {
    if (item.day <= today) current = item;
    else break;
  }

  if (current) {
    const diff = today - current.day;
    return {
      verse: current.verse,
      label: "이번주 말씀",
      isCurrentWeek: diff <= 6,
    };
  }

  return {
    verse: dated[0].verse,
    label: "곧 시작할 말씀",
    isCurrentWeek: false,
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

    const local = loadProgress();
    let changed = false;
    Object.keys(data.progress || {}).forEach((no) => {
      const serverStage = Number(data.progress[no]);
      const cur = local[no]?.stage || 0;
      if (serverStage > cur) {
        local[no] = { stage: serverStage, passed: true };
        changed = true;
      }
    });
    if (changed) {
      try { localStorage.setItem(progressKey(), JSON.stringify(local)); } catch {}
    }

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

// "사랑교구 3목장 김성도" / "초등부 김믿음"
function userLabel(u) {
  if (!u) return "";
  return u.type === "교구"
    ? `${u.gu}-${u.mok} ${u.name}`
    : `${u.bu} ${u.name}`;
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
function progressKey() {
  const u = loadUser();
  if (!u) return PROGRESS_KEY; // 사용자 없으면 기본 키(폴백)
  const id =
    u.type === "교구"
      ? `g|${u.gu}|${u.mok}|${u.name}`
      : `s|${u.bu}|${u.grade}|${u.name}`;
  return PROGRESS_KEY + "::" + id;
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

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(progressKey())) || {};
  } catch {
    return {};
  }
}

function saveProgress(no, stage, mode = "typing") {
  const progress = loadProgress();
  const prev = progress[no]?.stage || 0;
  if (stage > prev) {
    // at: 통과한 날짜(말씀 앨범에 표시). 기존 기록엔 없을 수 있어 앨범에서 없으면 생략한다.
    progress[no] = { stage, passed: true, at: todayYmd() };
    try {
      localStorage.setItem(progressKey(), JSON.stringify(progress));
    } catch {
      /* 저장 실패(시크릿 모드 등) 무시 */
    }
  }
  // 완료(3단계)한 구절은 복습 일정에 등록
  if (stage === 3) ensureReviewScheduled(no);
  // 로컬 진행과 무관하게 통과 활동은 서버에 백업(집계용)
  postProgress(no, stage, mode);
}

function getPassedStage(no) {
  return loadProgress()[no]?.stage || 0;
}

// 통과 단계를 Supabase(API 미들웨어)에 저장
function postProgress(no, stage, mode) {
  const u = loadUser();
  if (!u || !u.user_id) return; // 첫 동기화 전이면 스킵(다음 로그인 때 서버 반영)
  bumpTodayCount(); // 오늘 N회 즉시 +1(서버 커밋 전에 실시간 반영)
  saveSyncStatus("saving", "통과 기록을 서버에 저장하고 있습니다.");
  api.saveProgress(u.user_id, no, stage, mode)
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
    const close = () => { wrap.classList.remove("show"); setTimeout(() => wrap.remove(), 250); };
    const okBtn = document.getElementById("daily-milestone-ok");
    okBtn.addEventListener("click", close);
    okBtn.focus();
    wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });
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
  okBtn.addEventListener("click", close);
  okBtn.focus(); // 키보드로도 바로 확인
  wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); }); // 바깥 탭 닫기
}

function setHearted(no, on) {
  const h = loadHearted();
  if (on) h[no] = true; else delete h[no];
  try { localStorage.setItem(heartKey(), JSON.stringify(h)); } catch {}
  const u = loadUser();
  if (u && u.user_id && window.api && api.saveHeart) {
    api.saveHeart(u.user_id, no, on).catch(() => {});
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
function renderSummary() {
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
      <button class="weekly-share" id="weekly-share">🔗 이번주 말씀 함께 나누기</button>
    </div>` : "";

  const appEl = document.getElementById("app");
  appEl.innerHTML = `
<div class="summary-screen">
  <div class="summary-card">
    <div class="summary-headrow">
      <div class="summary-hello"><span class="summary-affil">${u.type === "교구" ? `${u.gu}-${u.mok}` : `${u.bu}${u.grade ? " " + u.grade : ""}`}</span> <span class="summary-user">${u.name}</span> <span class="summary-honor">성도님</span><br>주님의 이름으로 환영합니다 🙌</div>
    </div>
    <div class="today-strip" id="today-strip"><span class="today-txt">오늘의 말씀 활동을 불러오는 중…</span></div>
    <div class="stat-grid">
      <div class="stat-box status-heart"><div class="stat-num">${heartCount}</div><div class="stat-lbl">마음</div></div>
      <div class="stat-box status-done"><div class="stat-num">${doneOnly}</div><div class="stat-lbl">암송</div></div>
      <div class="stat-box status-s1"><div class="stat-num">${inProgress}</div><div class="stat-lbl">진행중</div></div>
      <div class="stat-box status-none"><div class="stat-num">${counts[0]}</div><div class="stat-lbl">미시도</div></div>
    </div>
    <div class="summary-actions">
      <button class="summary-go act-btn" id="go-list"><span class="act-ic">📖</span><span class="act-tx">암송<br>하기</span></button>
      ${dueCount > 0 ? `<button class="summary-go review-cta act-btn" id="go-review"><span class="act-ic">📖</span><span class="act-tx">복습</span><span class="act-sub">${dueCount}구절</span></button>` : ""}
      <button class="summary-go challenge-cta act-btn" id="go-challenge"><span class="act-ic">🔥</span><span class="act-tx">말씀<br>도전</span></button>
    </div>
    ${weeklyHtml}
    <button class="summary-help med-cta" id="open-meditation">🌿 매일 묵상</button>
    <button class="summary-help album-cta" id="open-album">📖 나의 말씀 앨범</button>
    <button class="summary-help" id="open-ranking">🏆 도전 순위 보기</button>
<button class="summary-help praise-cta" id="open-praise">🎵 고척교회 찬양 아카이브</button>
<button class="summary-help board-cta" id="open-board">💬 질문·제안 게시판</button>
    <div class="summary-icons summary-icons-bottom">
      <button class="summary-icon icon-alarm" id="open-alarm" aria-label="매일 암송 알림 받기" title="매일 암송 알림 받기">🔔</button>
      <button class="summary-icon icon-share" id="open-share" aria-label="공유하기" title="함께할 친구에게 공유하기">🔗</button>
      <button class="summary-icon icon-install" id="open-install" aria-label="바로가기(홈 화면에 추가)" title="홈 화면에 바로가기 추가">📲</button>
      <button class="summary-icon" id="open-help-summary" aria-label="도움말" title="도움말">❓</button>
      <button class="summary-icon" id="open-settings" aria-label="설정" title="설정">⚙️</button>
    </div>
  </div>
</div>
`;

  document.getElementById("go-list").addEventListener("click", renderVerseList);
  loadTodayCount(u); // 첫 화면 '오늘 N회' 띠 채우기
  document.getElementById("open-board").addEventListener("click", renderBoard);
  if (weeklyVerse) document.getElementById("weekly-start").addEventListener("click", () => startTest(weeklyVerse));
  if (weeklyVerse) document.getElementById("weekly-share").addEventListener("click", () => shareWeeklyVerse(weeklyVerse));
  fillWeeklySummaryBtn(weeklyVerse); // 요약이 있으면 '설교보기' 옆에 요약보기 버튼 추가
  if (dueCount > 0) document.getElementById("go-review").addEventListener("click", startReview);
  document.getElementById("go-challenge").addEventListener("click", startChallenge);
  document.getElementById("open-meditation").addEventListener("click", () => maybeShowWeeklyMeditation(true, true));
  document.getElementById("open-album").addEventListener("click", () => renderAlbum());
  document.getElementById("open-ranking").addEventListener("click", () => renderRanking());
  document.getElementById("open-praise").addEventListener("click", () => window.open("https://worship.onlybible.kr/", "_blank", "noopener"));
  document.getElementById("open-help-summary").addEventListener("click", () => renderHelp(renderSummary));
  document.getElementById("open-settings").addEventListener("click", renderSettings);
  document.getElementById("open-share").addEventListener("click", shareApp);
  document.getElementById("open-alarm").addEventListener("click", alarmFromHome);
  document.getElementById("open-install").addEventListener("click", installToHome);
  // 이미 설치(홈 화면 앱)된 경우 바로가기 아이콘 숨김
  const standalone = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
  if (standalone) { const ib = document.getElementById("open-install"); if (ib) ib.hidden = true; }
  // 아직 알림을 안 켠 사람에게만 종 아이콘을 살짝 강조(독려). 이미 켠 사람은 손대지 않음.
  (async () => {
    try {
      const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
      const sub = reg && await reg.pushManager.getSubscription();
      const bell = document.getElementById("open-alarm");
      if (bell && !sub) bell.classList.add("pulse");
    } catch (e) {}
  })();
}

// 첫화면 📲 바로가기: 홈 화면에 앱 추가(설치 프롬프트 또는 방법 안내)
function installToHome() {
  const ua = navigator.userAgent || "";
  if (window.__pwaInstallPrompt) {
    window.__pwaInstallPrompt.prompt();
    window.__pwaInstallPrompt.userChoice.then(({ outcome }) => {
      if (outcome === "accepted") window.__pwaInstallPrompt = null;
    }).catch(() => {});
    return;
  }
  if (/iphone|ipad|ipod/i.test(ua)) {
    alert("📱 홈 화면에 바로가기 추가\n\n① 하단 공유 버튼(□↑)을 누르세요\n② \"홈 화면에 추가\"를 선택하세요\n③ 오른쪽 위 \"추가\"를 눌러 완료!");
  } else if (/android/i.test(ua)) {
    alert("📱 홈 화면에 바로가기 추가\n\n① 브라우저 우측 상단 메뉴(⋮)를 누르세요\n② \"홈 화면에 추가\"를 선택하세요\n③ \"추가\"를 눌러 완료!");
  } else {
    alert("📱 홈 화면에 바로가기 추가\n\n• iOS Safari: 공유 버튼(□↑) → 홈 화면에 추가\n• Android Chrome: 메뉴(⋮) → 홈 화면에 추가");
  }
}

// 첫화면 🔔: 미구독자만 기본 7시로 켜고, 이미 켜진 사람은 손대지 않고 안내만
async function alarmFromHome() {
  try {
    const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
    const sub = reg && await reg.pushManager.getSubscription();
    if (sub) {
      const h = (typeof getPushHour === "function") ? getPushHour() : 7;
      alert(`🔔 이미 매일 암송 알림이 켜져 있어요.\n(매일 오전 ${h}시)\n\n시간 변경·끄기는 ⚙️ 설정에서 하실 수 있어요.`);
      return;
    }
  } catch (e) {}
  if (typeof enablePush === "function") {
    const ok = await enablePush(); // 신규는 getPushHour()=기본 7시로 저장됨
    if (ok) renderSummary();       // 종 강조(pulse) 해제 등 상태 갱신
  }
}

// ---------- 질문·제안 공개 게시판 ----------
function boardTime(iso) {
  try {
    const k = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
    const z = (n) => String(n).padStart(2, "0");
    return `${k.getUTCMonth() + 1}/${k.getUTCDate()} ${z(k.getUTCHours())}:${z(k.getUTCMinutes())}`;
  } catch (e) { return ""; }
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
// 본인 글 판별: 소속+이름 일치(옛 글 포함) 또는 user_id 일치
function boardIsMine(item) {
  const who = boardWho(); const uid = myUserId();
  return (!!who && item.name === who) || (!!uid && !!item.user_id && item.user_id === uid);
}
function renderBoard() {
  const appEl = document.getElementById("app");
  appEl.innerHTML = `
    <div class="summary-screen">
      <div class="summary-card">
        <div class="settings-head">
          <h2 class="rank-title">💬 질문·제안</h2>
          <button class="settings-back-btn" id="board-back">← 뒤로</button>
        </div>
        <p class="board-intro">궁금한 점이나 건의사항을 자유롭게 남겨주세요. 모든 글과 답글은 공개됩니다. 🙌</p>
        <p class="board-notice">🙏 <b>성경암송</b>과 관련된 질문·제안을 남겨주세요. 주제와 관련 없는 글은 부득이 삭제될 수 있습니다.<br>⚠️ 전화번호 등 <b>민감한 개인정보</b>는 올리지 말아주세요.</p>
        <div class="board-form">
          <div class="board-who" id="bp-who"></div>
          <textarea id="bp-content" class="board-in board-in-lg" rows="5" maxlength="2000" placeholder="질문이나 제안을 적어주세요"></textarea>
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
  try { d = await api.boardList(); }
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
      </div>`).join("");
    return `
      <div class="board-post" data-id="${p.id}">
        <div class="board-meta"><b>${boardEsc(p.name)}</b> · ${boardTime(p.created_at)}${delBtn("post", p)}</div>
        <div class="board-text">${boardEsc(p.content)}</div>
        ${replies}
        <div class="board-reply-form">
          <textarea class="board-in br-content" rows="2" maxlength="2000" placeholder="답글 달기"></textarea>
          <button class="board-reply-btn" data-id="${p.id}">답글 등록</button>
        </div>
      </div>`;
  }).join("");
  box.querySelectorAll(".board-reply-btn").forEach((btn) => btn.addEventListener("click", () => submitBoardReply(btn)));
  box.querySelectorAll(".board-del").forEach((btn) => btn.addEventListener("click", () => deleteMine(btn)));
}
async function submitBoardPost() {
  const content = document.getElementById("bp-content").value.trim();
  const msg = document.getElementById("bp-msg");
  if (!content) { msg.className = "msg err"; msg.textContent = "내용을 입력해주세요."; return; }
  if (!confirm("이 내용으로 글을 올릴까요?\n작성한 글은 모든 분에게 공개됩니다.")) return;
  const btn = document.getElementById("bp-submit"); btn.disabled = true; msg.className = "msg"; msg.textContent = "등록 중...";
  try { await api.boardPost(boardWho(), content, myUserId()); }
  catch (e) { btn.disabled = false; msg.className = "msg err"; msg.textContent = "등록 실패: " + (e && e.message ? e.message : e); return; }
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
  if (!confirm("답글을 등록할까요?\n작성한 답글은 모든 분에게 공개됩니다.")) return;
  btn.disabled = true;
  try { await api.boardReply(Number(btn.dataset.id), boardWho(), content, myUserId()); }
  catch (e) { btn.disabled = false; alert("답글 등록 실패: " + (e && e.message ? e.message : e)); return; }
  loadBoard();
}
async function deleteMine(btn) {
  if (!confirm("이 글을 삭제할까요?")) return;
  try { await api.boardDeleteMine(btn.dataset.kind, Number(btn.dataset.id), myUserId(), boardWho()); }
  catch (e) { alert("삭제 실패: " + (e && e.message ? e.message : e)); return; }
  loadBoard();
}

// 설정 화면 — 로그인 정보변경 · 알림 · 홈 화면 추가 · 공유 (요약에서 분리)
function renderSettings() {
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
        <button class="push-off" id="disable-push">🔕 알림 끄기</button>
        <button class="summary-install" id="share-btn">🔗 공유하기</button>
        <button class="summary-install" id="test-push">🧪 내 기기로 테스트 알림</button>
        <a class="summary-install" href="admin.html">📊 관리자 페이지</a>
        <button class="summary-install" id="privacy-info">🔐 개인정보 안내 보기</button>
        <div class="setting-block">
          <div class="setting-label">☁️ 동기화 상태</div>
          ${syncStatusHtml()}
        </div>
      </div>
    </div>`;
  document.getElementById("settings-back").addEventListener("click", () => { stopSpeaking(); renderSummary(); });
  document.getElementById("change-user").addEventListener("click", renderEntryScreen);
  document.getElementById("privacy-info").addEventListener("click", () => renderPrivacyInfo(renderSettings));
  document.getElementById("share-btn").addEventListener("click", shareApp);
  document.getElementById("enable-push").addEventListener("click", () => { if (typeof enablePush === "function") enablePush(); });
  document.getElementById("disable-push").addEventListener("click", () => { if (typeof disablePush === "function") disablePush(); });
  document.getElementById("test-push").addEventListener("click", () => { if (typeof testMyPush === "function") testMyPush(); });
  updateAppStatus();
  setupSyncRetry();
  setupThemeSetting();
  setupFontSize();
  setupTtsRate();
  setupPushHour();
  setupInstallButton();
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
      alert(
        "📱 홈 화면에 추가하는 방법\n\n" +
        "① 하단 공유 버튼(□↑)을 누르세요\n" +
        "② 목록에서 \"홈 화면에 추가\"를 선택하세요\n" +
        "③ 오른쪽 위 \"추가\"를 눌러 완료!"
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
        alert(
          "📱 홈 화면에 추가하는 방법\n\n" +
          "① 브라우저 우측 상단 메뉴(⋮)를 누르세요\n" +
          "② \"홈 화면에 추가\"를 선택하세요\n" +
          "③ \"추가\"를 눌러 완료!"
        );
      } else {
        alert(
          "📱 홈 화면에 추가하는 방법\n\n" +
          "• iOS Safari: 공유 버튼(□↑) → 홈 화면에 추가\n" +
          "• Android Chrome: 메뉴(⋮) → 홈 화면에 추가"
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
  appEl.innerHTML = `
    <div class="list-nav">
      <button class="remind-cta nav-record" id="to-summary">← ${userLabel(u)} 성도님<span id="nav-total" class="nav-total"></span></button>
    </div>
    <div id="verse-list" class="verse-grid"></div>
  `;

  const listEl = document.getElementById("verse-list");
  document.getElementById("to-summary").addEventListener("click", renderSummary);
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
    card.addEventListener("click", () => startTest(v));
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
        speakText(`${v.refFull}. ${v.text}`, null, clickCount);
        clickCount = 0;
      }, 350); // 350ms 안에 연속 클릭한 횟수만큼 반복
    });
    listEl.appendChild(card);
  });

  applyVerseCounts();   // 캐시가 있으면 즉시 반영(재방문 시 깜빡임 없음)
  loadVerseCounts(u);   // 서버에서 최신 횟수 갱신
}

// ------------------------------------------------------------
// 화면 3: 테스트 (익명 버전과 동일)
// ------------------------------------------------------------
function startTest(verse) {
  setCardMode(false); // 암송화면 기본은 '쓰기' — 카드 모드는 그 구절 안에서만 유지된다
  // 마음에 둔 구절은 곧바로 3단계(전체 빈칸)로 — 체크 해제도 여기서 바로 가능
  if (isHearted(verse.no)) return renderTestScreen(verse, 3);
  const passed = getPassedStage(verse.no);
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
function fillSermonSummaryBtn(verse, stage) {
  const slot = document.getElementById("sermon-summary-slot");
  if (!slot) return;
  loadSermons().then((sermons) => {
    const s = findSermonForVerse(verse.no, sermons);
    if (!s || !document.getElementById("sermon-summary-slot")) return;
    slot.innerHTML = `<button class="sc-btn sc-summary" id="sermon-summary-btn">📄 요약보기</button>`;
    document.getElementById("sermon-summary-btn")
      .addEventListener("click", () =>
        renderSermonSummary(verse, s, () => renderTestScreen(verse, stage), "← 암송으로"));
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
                <p class="ss-point-body">${boardEsc(p.body || "")}</p>
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
          <button class="ss-read" id="ss-read">🔊 읽어주기</button>
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
          <blockquote class="ss-summary">${boardEsc(sermon.summary)}</blockquote>
        </section>
        ${pointsHtml}
        ${sermon.conclusion ? `
        <section class="ss-section">
          <div class="ss-label">맺음말</div>
          <blockquote class="ss-summary ss-conclusion">${boardEsc(sermon.conclusion)}</blockquote>
        </section>` : ""}
      </div>
    </div>`;
  document.getElementById("ss-back").addEventListener("click", onBack);

  // 화면에 보이는 그대로(제목 → 요약 → 핵심 포인트) 읽어준다.
  const readText = [
    sermon.title || "",
    sermon.summary || "",
    points.length ? "핵심 포인트." : "",
    ...points.map((p, i) => `${i + 1}. ${p.heading || ""}. ${p.body || ""}`),
    sermon.conclusion ? `맺음말. ${sermon.conclusion}` : "",
  ].filter(Boolean).join("\n");

  const readBtn = document.getElementById("ss-read");
  const audioUrl = sermon.audio ? (SERMON_AUDIO_BASE + sermon.audio + "?v3") : null;
  const IDLE = "🔊 읽어주기";   // 재생 전/일시정지 상태
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

const REPEAT_KEY = "repeat-practice";
function isRepeatPractice() { try { return localStorage.getItem(REPEAT_KEY) === "1"; } catch (e) { return false; } }
function setRepeatPractice(on) { try { localStorage.setItem(REPEAT_KEY, on ? "1" : "0"); } catch (e) {} }

function renderTestScreen(verse, stage) {
  stopSpeaking(); // 화면 전환 시 읽어주기 정지
  const appEl = document.getElementById("app");
  const tokens = verse.text.trim().split(/\s+/);

  const blankRatio = stage === 1 ? 0.25 : stage === 2 ? 0.65 : 1.0;
  const blankFlags = pickBlankIndices(tokens, blankRatio);

  const blanks = [];
  const wordsHtml = tokens
    .map((word, i) => {
      if (blankFlags[i]) {
        const blankIndex = blanks.length;
        blanks.push(word);
        const width = Array.from(word).length + 1;
        return `<input class="word-input" data-blank="${blankIndex}" data-answer="${word}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" style="width:${width}em" />`;
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
  const sermonConnect = `
    <div class="sermon-connect">
      ${verse.sermonTitle ? `<div class="sc-topic"><span class="sc-topic-label">📖 설교</span><span class="sc-topic-title">${verse.sermonTitle}</span></div>` : ""}
      <div class="sc-buttons">
        ${verse.url
          ? `<a class="sc-btn sc-watch" href="${verse.url}" target="_blank" rel="noopener">▶️ 영상보기</a>`
          : `<span class="sc-btn sc-soon">⏳ 영상 준비 중</span>`}
        <span id="sermon-summary-slot"></span>
      </div>
    </div>`;

  // 3단계에만: "내 마음에 두었나이다" 체크. 아직 통과 전이면 비활성(안내문 노출),
  // 이미 체크한 구절은 처음부터 활성 → 바로 해제 가능.
  const heartOn = isHearted(verse.no);
  const heartHtml = stage === 3 ? `
        <label class="heart-check${heartOn ? " on" : " locked"}" id="heart-label">
          <input type="checkbox" id="heart-check" ${heartOn ? "checked" : "disabled"} />
          <span class="heart-text">👑 이 말씀을 내 마음에 두었나이다</span>
          <span class="heart-hint" id="heart-hint"${heartOn ? " hidden" : ""}>암송을 마치면 체크할 수 있어요</span>
          <span class="heart-desc">이 말씀을 <b>완전히 암송했다</b>는 뜻이에요. 체크하면 목록에 👑 금배지가 달리고, 다음부터 바로 3단계로 시작해요.</span>
        </label>` : "";

  // 3단계에만: '반복해서 쓰기' 토글. 켜두면 정답 후 자동으로 새 3단계가 나온다.
  const repeatHtml = stage === 3 ? `
        <label class="repeat-toggle" id="repeat-label">
          <input type="checkbox" id="repeat-check"${isRepeatPractice() ? " checked" : ""} />
          <span class="repeat-text">🔁 반복해서 쓰기</span>
          <span class="repeat-desc">외울 때까지, 정답을 맞히면 자동으로 다시 써요</span>
        </label>` : "";

  appEl.innerHTML = `
    <div class="test-screen">
      <div class="test-card">
        <div class="btn-row">
          <button class="answer-btn" id="show-answer-btn">보기</button>
          <button class="answer-btn" id="listen-answer-btn" aria-label="정답 음성으로 듣기">🔊 듣기</button>
          <button class="voice-btn" id="voice-toggle">🎤 암송</button>
          <button class="answer-btn mode-btn" id="mode-toggle">${isCardMode() ? "⌨️ 쓰기" : "👆 카드"}</button>
        </div>
        <div class="test-top">
          <div class="test-head">
            <div class="test-stage">${stage}단계</div>
            <div class="test-ref">${verse.refShort}</div>
          </div>
          <button class="back-btn" id="back-to-list-btn">← 목록</button>
        </div>
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

        <div id="voice-panel" class="voice-panel" hidden>
          <div class="voice-status" id="voice-status">🎙️ 듣고 있어요… <b>‘암송 종료’</b>를 누를 때까지 계속 들어요</div>
          <div class="voice-live" id="voice-live"></div>
        </div>
        <div id="voice-result" class="voice-result"></div>

        ${sermonConnect}
      </div>
    </div>
  `;

  document
    .getElementById("back-to-list-btn")
    .addEventListener("click", () => { stopSpeaking(); renderVerseList(); });

  // 이 구절에 대응하는 설교 요약이 있으면 배너 아래에 '설교 요약 보기' 버튼을 채운다.
  fillSermonSummaryBtn(verse, stage);

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
  const heartInput = document.getElementById("heart-check");
  if (heartInput) {
    heartInput.addEventListener("change", () => {
      setHearted(verse.no, heartInput.checked);
      document.getElementById("heart-label").classList.toggle("on", heartInput.checked);
      if (heartInput.checked) showHeartCheer(verse); // 체크(마음에 둠)할 때만 축하
    });
  }

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
      speakText(`${verse.refFull}. ${verse.text}`, () => {
        listenBtn.textContent = "🔊 듣기";
      });
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

// text 를 times 번 연속해서 읽어준다. (빠르게 N번 클릭하면 N번 반복)
function speakText(text, onEnd, times = 1) {
  if (!("speechSynthesis" in window)) {
    alert("이 브라우저는 읽어주기(음성 합성)를 지원하지 않습니다.\n크롬·사파리에서 이용해 주세요.");
    if (onEnd) onEnd();
    return;
  }
  window.speechSynthesis.cancel(); // 중복 재생 방지
  const n = Math.max(1, times);
  for (let i = 0; i < n; i++) {
    const ut = new SpeechSynthesisUtterance(text);
    ut.lang = "ko-KR";
    ut.rate = getSpeakRate();
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

function speakLong(text, onEnd) {
  if (!("speechSynthesis" in window)) {
    alert("이 브라우저는 읽어주기(음성 합성)를 지원하지 않습니다.\n크롬·사파리에서 이용해 주세요.");
    if (onEnd) onEnd();
    return;
  }
  const parts = splitForSpeech(text);
  if (!parts.length) { if (onEnd) onEnd(); return; }
  window.speechSynthesis.cancel();
  _ttsStopKeepAlive();

  let i = 0;
  const speakNext = () => {
    if (i >= parts.length) { _ttsStopKeepAlive(); if (onEnd) onEnd(); return; }
    const ut = new SpeechSynthesisUtterance(parts[i]);
    ut.lang = "ko-KR";
    ut.rate = getSpeakRate();
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
    const { accuracy, marks, ansWords } = scoreSpoken(verse.text, heard);
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
    if (passed) saveProgress(verse.no, stage, "voice");
    if (passed && stage === 3) unlockHeartCheck(); // 음성으로 3단계 통과해도 체크 가능
    const vIdx = verses.findIndex((v) => v.no === verse.no);
    const vPrev = vIdx > 0 ? verses[vIdx - 1] : null;
    const vNext = (vIdx >= 0 && vIdx < verses.length - 1) ? verses[vIdx + 1] : null;
    const nav = !passed
      ? ""
      : stage < 3
      ? `<button class="next-btn" id="voice-next-stage">${stage + 1}단계로</button>`
      : `<div class="complete-nav">
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
    r.lang = "ko-KR";
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

  // 모바일 키보드(3벌식·iOS 등)는 한글을 NFD(자모 분리형)로 입력할 수 있어
  // NFC(완성형)로 정규화한 뒤 비교해야 정답 판정이 된다.
  const norm = (s) => String(s || "").trim().normalize("NFC");
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
  function scrollIntoCenter(input) {
    // 키보드가 올라온 뒤 위치가 잡히도록 약간 지연
    setTimeout(() => {
      const vh = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
      const top = input.getBoundingClientRect().top;
      const target = vh / 2 - 80; // 화면 중앙보다 약 2cm(80px) 위
      window.scrollBy({ top: top - target, behavior: "smooth" });
    }, 250);
  }

  inputs.forEach((input, idx) => {
    let timer = null;

    // 정답이면 즉시 통과(조합 상태와 무관). 매 입력마다 검사.
    function checkAccept() {
      if (input.disabled) return false;
      if (norm(input.value) === norm(input.dataset.answer)) {
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

// 3단계 통과 → 체크박스 잠금 해제(타이핑·음성 공통)
function unlockHeartCheck() {
  const el = document.getElementById("heart-check");
  if (!el) return;
  el.disabled = false;
  const label = document.getElementById("heart-label");
  if (label) label.classList.remove("locked");
  const hint = document.getElementById("heart-hint");
  if (hint) hint.hidden = true;
}

function checkAllComplete(inputs, verse, stage) {
  const allCorrect = inputs.every((inp) => inp.classList.contains("correct"));
  if (!allCorrect) return;

  saveProgress(verse.no, stage, "typing");

  const resultEl = document.getElementById("result-area");
  if (stage < 3) {
    resultEl.innerHTML = `<button class="next-btn" id="next-stage-btn">${stage + 1}단계로</button>`;
    document.getElementById("next-stage-btn").addEventListener("click", () => renderTestScreen(verse, stage + 1));
    return;
  }
  unlockHeartCheck(); // 3단계 통과 → "마음에 두었나이다" 체크 가능

  // '반복해서 쓰기'가 켜져 있으면 아무것도 띄우지 않고 바로 새 3단계로 넘어간다.
  // (정답마다 위의 saveProgress가 실행되므로 도전 기록에 '매번' 카운트된다. 멈추려면 체크박스 해제)
  if (isRepeatPractice()) {
    setTimeout(() => renderTestScreen(verse, 3), 350); // 마지막 글자 정답 표시가 잠깐 보이도록만
    return;
  }
  renderCompleteNav(verse);
}

// 3단계 완료 네비 — 이전 · 다시 암송 · 다음 + 말씀 나누기
function renderCompleteNav(verse) {
  const resultEl = document.getElementById("result-area");
  if (!resultEl) return;
  const idx = verses.findIndex((v) => v.no === verse.no);
  const prev = idx > 0 ? verses[idx - 1] : null;
  const next = (idx >= 0 && idx < verses.length - 1) ? verses[idx + 1] : null;
  resultEl.innerHTML = `
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
    if (m) {                                     // ① 관리자 공지·격려가 있으면 우선
      const key = dailyMsgSeenKey(m.id || "x");
      try { if (localStorage.getItem(key) === "1") return; } catch {}
      try { localStorage.setItem(key, "1"); } catch {}
      showDailyMessage(m);
      return;
    }
    maybeShowWeeklyMeditation();                  // ② 공지 없으면 이번주 말씀 묵상(매일 다름)
  }).catch(() => { maybeShowWeeklyMeditation(); });
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
    items.push({ heading: "", message: verse.text, question: "오늘 이 말씀을 삶의 어느 자리에 적용할 수 있을까요?" });
  }
  return items;
}

// force   : '하루 1회' 제한을 무시하고 무조건 표시(미리보기·버튼)
// withTabs: 요일 탭 표시 여부 — 자동 팝업/어드민 미리보기는 false(성도가 보는 그대로), 매일묵상 버튼만 true
function maybeShowWeeklyMeditation(force, withTabs) {
  const info = getWeeklyVerseInfo();
  if (!info || !info.verse) return;
  const verse = info.verse;
  loadSermons().then((sermons) => {
    const sermon = findSermonForVerse(verse.no, sermons);
    const items = buildWeeklyMeditations(verse, sermon);
    if (!items.length) return;
    // 요일별로 하나씩(주일=0 … 토=6). 7개면 요일마다 고정, 그보다 적으면 순환.
    const p = kstDateParts() || {};
    const dow = p.y ? new Date(p.y, (p.m || 1) - 1, p.d || 1).getDay() : (kstDayNumber() % 7);
    const pick = ((dow % items.length) + items.length) % items.length;
    const item = items[pick];
    if (!force) {                                // 하루 1회만 자동 표시(미리보기는 무시)
      const key = dailyMsgSeenKey(`med-${verse.no}-${pick}`);
      try { if (localStorage.getItem(key) === "1") return; } catch {}
      try { localStorage.setItem(key, "1"); } catch {}
    }
    // 자동 팝업·어드민 미리보기는 '오늘 것 하나만'. 요일 탭은 매일 묵상 버튼으로 열 때만.
    showMeditationModal(items, pick, verse, sermon, !!withTabs);
  }).catch(() => {});
}

// 오늘의 묵상 모달 — 이번주 묵상 전체를 탭으로 넘겨볼 수 있다(기본은 오늘 것).
function showMeditationModal(items, startIdx, verse, sermon, showTabs) {
  // 탭은 요일 한 글자(7일치일 때). 그 외에는 번호 — 제목을 쓰면 너무 길어 화면을 잡아먹는다.
  const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
  const tabLabel = (i) => (items.length === 7 ? DAYS[i] : String(i + 1));
  const open = () => {
    if (document.querySelector(".cheer-overlay")) { setTimeout(open, 300); return; }
    const wrap = document.createElement("div");
    wrap.id = "daily-message";
    wrap.className = "cheer-overlay";
    wrap.innerHTML = `
      <div class="cheer-card dmsg-card med" role="dialog" aria-modal="true">
        <div class="cheer-ref dmsg-badge">🌿 오늘의 묵상</div>
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
        `<div class="med-msg">${it.message}</div>` +
        (it.question ? `<div class="med-q"><b>💬 오늘의 적용 질문</b><br>${it.question}</div>` : "");
      wrap.querySelectorAll(".med-tab").forEach((b) => b.classList.toggle("on", Number(b.dataset.i) === i));
      toTop();
    };
    render(startIdx);
    wrap.querySelectorAll(".med-tab").forEach((b) =>
      b.addEventListener("click", () => render(Number(b.dataset.i))));
    requestAnimationFrame(() => wrap.classList.add("show"));
    const close = () => { wrap.classList.remove("show"); setTimeout(() => wrap.remove(), 250); };
    const ok = wrap.querySelector("#dmsg-ok");
    ok.addEventListener("click", close);
    const sBtn = wrap.querySelector("#med-sermon");   // 묵상 → 설교 요약으로 이동
    if (sBtn) sBtn.addEventListener("click", () => {
      close();
      setTimeout(() => renderSermonSummary(verse, sermon, renderSummary, "← 뒤로"), 260);
    });
    try { ok.focus({ preventScroll: true }); } catch (e) {}
    toTop();
    wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });
  };
  open();
}

// 관리자 미리보기 — 하루1회 상태(localStorage) 안 건드리고 강제 표시
function previewDailyMessage() {
  if (!window.api || !api.getConfig) return;
  api.getConfig("dailyMessage").then((d) => {
    const m = pickActiveDailyMessage(d && d.value);
    if (m) { showDailyMessage(m); return; }
    maybeShowWeeklyMeditation(true); // 공지 없으면 '오늘의 묵상' 미리보기(하루1회 상태 무시)
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
    ok.addEventListener("click", close);
    try { ok.focus({ preventScroll: true }); } catch (e) { ok.focus(); } // 포커스로 하단 스크롤되지 않게
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
            <li>기기 식별용 임의 ID</li>
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
        <button class="help-go" id="privacy-back">확인했습니다</button>
      </div>
    </div>`;
  document.getElementById("privacy-close").addEventListener("click", back);
  document.getElementById("privacy-back").addEventListener("click", back);
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
            <li><b>수집 항목</b>: 구분(교구/교회학교)·소속·목장/학년·이름과 암송·도전 기록뿐이에요. 연락처·주민번호 등 민감정보는 <b>받지 않습니다</b>.</li>
            <li><b>저장·용도</b>: 기록은 교회 내부 시트에 저장되어 <b>본인 진도 관리와 도전 순위</b>에만 쓰입니다. 외부에 공개하거나 다른 시스템과 연동하지 않아요.</li>
            <li><b>순위 공개 범위</b>: 도전 순위에는 <b>이름과 소속</b>만 표시됩니다(연락처 없음). 참여한 분만 표시돼요.</li>
            <li><b>변경·삭제</b>: 이름·소속은 <b>로그인 정보변경</b>에서 언제든 수정할 수 있어요. 기록 삭제가 필요하면 <b>교구 목사님 또는 제자양육부 신앙운동팀</b>에 요청해 주세요.</li>
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
  let pool = verses.filter((v) => !challengeSession.includes(v.no));
  if (!pool.length) { challengeSession = []; pool = verses.slice(); }
  const pick = pool[Math.floor(Math.random() * pool.length)];
  challengeSession.push(pick.no);
  renderChallenge(pick);
}

// 도전 화면 — 3단계(전체 빈칸) 고정 + 힌트 버튼 + 음성
function renderChallenge(verse) {
  const appEl = document.getElementById("app");
  const tokens = verse.text.trim().split(/\s+/);

  const wordsHtml = tokens
    .map((word) => {
      const width = Array.from(word).length + 1;
      return `<input class="word-input" data-answer="${word}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" style="width:${width}em" />`;
    })
    .join(" ");

  appEl.innerHTML = `
    <div class="test-screen">
      <div class="test-card">
        <div class="btn-row" style="flex-wrap:wrap;">
          <button class="answer-btn" id="hint-btn">💡 힌트</button>
          <button class="answer-btn" id="ch-shuffle">🔀 다른말씀</button>
          <button class="voice-btn" id="voice-toggle">🎤 암송</button>
        </div>
        <div class="test-top">
          <div class="test-head">
            <div class="test-stage challenge-badge">🔥 도전</div>
            <div class="test-ref">${verse.refShort}</div>
          </div>
          <button class="back-btn" id="ch-exit">← 뒤로</button>
        </div>
        <div class="challenge-hint-line">출처만 보고 전체를 외워보세요!</div>
        <div class="test-sentence">${wordsHtml}</div>
        <div class="challenge-remain" id="ch-remain"></div>
        <div id="result-area"></div>
        <div id="voice-panel" class="voice-panel" hidden>
          <div class="voice-status" id="voice-status">🎙️ 듣고 있어요… <b>‘암송 종료’</b>를 누를 때까지 계속 들어요</div>
          <div class="voice-live" id="voice-live"></div>
        </div>
        <div id="voice-result" class="voice-result"></div>
      </div>
    </div>`;

  document.getElementById("ch-exit").addEventListener("click", () => { stopSpeaking(); renderSummary(); });
  document.getElementById("ch-shuffle").addEventListener("click", () => { stopSpeaking(); startChallenge(); });
  setupHint();
  setupChallengeTyping(verse, (mode) => challengeComplete(verse, mode));
  setupVoice(verse, 3, () => challengeComplete(verse, "voice"));
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
  const tokens = verse.text.trim().split(/\s+/);
  const wordsHtml = tokens
    .map((word) => {
      const width = Array.from(word).length + 1;
      return `<input class="word-input" data-answer="${word}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" style="width:${width}em" />`;
    })
    .join(" ");
  const answerHtml = tokens.map((word) => `<strong class="ans-word">${word}</strong>`).join(" ");

  appEl.innerHTML = `
    <div class="test-screen">
      <div class="test-card">
        <div class="btn-row">
          <button class="answer-btn" id="show-answer-btn">보기</button>
          <button class="answer-btn" id="listen-answer-btn" aria-label="정답 음성으로 듣기">🔊 듣기</button>
          <button class="voice-btn" id="voice-toggle">🎤 암송</button>
        </div>
        <div class="test-top">
          <div class="test-head">
            <div class="test-stage review-badge">📖 복습</div>
            <div class="test-ref">${verse.refShort}</div>
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
        <div id="voice-panel" class="voice-panel" hidden>
          <div class="voice-status" id="voice-status">🎙️ 듣고 있어요… <b>‘암송 종료’</b>를 누를 때까지 계속 들어요</div>
          <div class="voice-live" id="voice-live"></div>
        </div>
        <div id="voice-result" class="voice-result"></div>
      </div>
    </div>`;

  document.getElementById("rv-exit").addEventListener("click", () => { stopSpeaking(); renderSummary(); });
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
      speakText(`${verse.refFull}. ${verse.text}`, () => { listenBtn.textContent = "🔊 듣기"; });
    });
  }
  const onDone = (mode) => {
    postChallenge(verse, mode || "voice"); // 복습 완료도 도전 순위 데이터에 누적
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
function setupChallengeTyping(verse, onComplete) {
  const inputs = Array.from(document.querySelectorAll(".word-input"));
  const remainEl = document.getElementById("ch-remain");
  let done = false;
  function updateRemain() {
    const left = inputs.filter((i) => !i.classList.contains("correct")).length;
    if (remainEl) {
      remainEl.textContent = left > 0 ? `남은 빈칸 ${left}개` : "모두 맞혔어요! 🎉";
      remainEl.classList.toggle("clear", left === 0);
    }
    return left;
  }
  function evaluate(input, idx, isComposing) {
    if (input.disabled) return;
    const val = input.value.trim();
    const answer = input.dataset.answer;
    if (val === answer) {
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
  updateRemain();
  if (inputs[0]) inputs[0].focus();
}

// 도전 완료 처리 → 서버 기록 + 완료 화면
function challengeComplete(verse, mode) {
  stopSpeaking();
  const n = bumpTodayChallenge();
  postChallenge(verse, mode);
  renderChallengeDone(verse, mode, n);
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

function renderChallengeDone(verse, mode, todayCount) {
  const appEl = document.getElementById("app");
  appEl.innerHTML = `
    <div class="summary-screen">
      <div class="summary-card cd-card">
        <div class="cd-emoji">🎉</div>
        <div class="cd-title">도전 완료!</div>
        <div class="cd-sub">${verse.refShort} · ${mode === "voice" ? "음성" : "타이핑"} 암송</div>
        <div class="cd-count">오늘 <b id="cd-today-count">${todayCount}회</b> 완료</div>
        <button class="summary-go challenge-cta" id="cd-again">🔥 한 번 더 도전</button>
        <button class="summary-help" id="cd-rank">🏆 순위 보기</button>
        <button class="summary-change" id="cd-home">기록 화면으로</button>
      </div>
    </div>`;
  document.getElementById("cd-again").addEventListener("click", startChallenge);
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
  return api.ranking(from, to, true); // 암송(학습) 기록도 포함해 순위 집계
}

// ------------------------------------------------------------
// 나의 말씀 앨범 — 3단계 완료 구절을 모아 보고(👑 마음에 둠 필터), 공유한다.
//   완료일(at)은 saveProgress가 기록. 이전에 완료한 구절은 없을 수 있어 있을 때만 표시.
// ------------------------------------------------------------
function renderAlbum(filter) {
  const f = filter === "heart" ? "heart" : "all";
  const u = loadUser();
  const appEl = document.getElementById("app");
  const prog = loadProgress();
  const done = verses.filter((v) => getPassedStage(v.no) >= 3);
  const hearted = done.filter((v) => isHearted(v.no));
  const list = f === "heart" ? hearted : done;

  const cards = list.map((v) => {
    const raw = prog[v.no] && prog[v.no].at ? String(prog[v.no].at) : "";
    const at = raw ? raw.slice(5).replace("-", ".") : ""; // YYYY-MM-DD → MM.DD
    const heart = isHearted(v.no);
    return `
      <button class="album-card${heart ? " hearted" : ""}" data-no="${v.no}">
        ${heart ? `<span class="album-crown">👑</span>` : ""}
        <span class="album-ref">${v.refShort}</span>
        <span class="album-text">${v.text}</span>
        ${at ? `<span class="album-at">${at} 완료</span>` : ""}
      </button>`;
  }).join("");

  appEl.innerHTML = `
    <div class="album-screen">
      <div class="list-nav">
        <button class="remind-cta nav-record" id="ab-back">← ${userLabel(u)} 성도님</button>
      </div>
      <h2 class="rank-title">📖 나의 말씀 앨범</h2>
      <div class="album-banner">
        <div class="ab-line"><b class="ab-num">${hearted.length}</b>구절을 마음에 두었습니다 👑</div>
        <div class="ab-sub">암송 완료 ${done.length}구절 · 전체 ${verses.length}구절</div>
      </div>
      <div class="rank-filter album-filter" id="ab-filter">
        <button data-f="all" class="${f === "all" ? "on" : ""}">전체 ${done.length}</button>
        <button data-f="heart" class="${f === "heart" ? "on" : ""}">👑 마음에 둠 ${hearted.length}</button>
      </div>
      ${list.length
        ? `<div class="album-grid">${cards}</div>`
        : `<p class="album-empty">${f === "heart"
            ? "아직 '마음에 둠'으로 체크한 구절이 없어요.<br>3단계까지 암송하면 체크할 수 있습니다 🙌"
            : "아직 완료한 구절이 없어요.<br>첫 구절을 암송해 보세요 📖"}</p>`}
    </div>`;

  document.getElementById("ab-back").addEventListener("click", renderSummary);
  document.getElementById("ab-filter").querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => renderAlbum(b.dataset.f)));
  appEl.querySelectorAll(".album-card").forEach((c) =>
    c.addEventListener("click", () => {
      const v = verses.find((x) => x.no === Number(c.dataset.no));
      if (v) startTest(v);
    }));
}

function renderRanking(range) {
  const r = range || rankRangeFor("yday");
  const u = loadUser();
  const appEl = document.getElementById("app");
  const tabs = [["today", "오늘"], ["yday", "전일~당일"], ["week", "이번주"], ["all", "전체"]];
  appEl.innerHTML = `
    <div class="rank-screen">
      <div class="list-nav">
        <button class="remind-cta nav-record" id="rk-back">← ${userLabel(u)} 성도님</button>
      </div>
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
    </div>`;
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
  const soLabel = (x) => (x.gubun === "교구" ? `${x.sosok}교구 ${x.sebu}목장` : `${x.sosok} ${x.sebu}`);

  const myHtml = u
    ? `<div class="my-rank">
         <span class="mr-label">내 순위</span>
         ${me
            ? `<span class="mr-rank">${medal(me.rank)}</span><span class="mr-name">${u.name}</span><span class="mr-cnt">${me.count}회</span>`
            : `<span class="mr-name">${u.name}</span><span class="mr-cnt none">아직 기록 없음 — 도전해보세요! 🔥</span>`}
       </div>`
    : "";

  if (!list.length) {
    body.innerHTML = myHtml + `<p class="rank-msg">아직 도전 기록이 없어요.<br>첫 도전의 주인공이 되어보세요! 🔥</p>`;
    return;
  }

  const rows = list.map((x) => {
    const isMe = keyOf(x.gubun, x.sosok, x.sebu, x.name) === myKey;
    return `<div class="rank-row ${x.rank <= 3 ? "top" : ""} ${isMe ? "me" : ""}">
      <span class="rk-no">${medal(x.rank)}</span>
      <span class="rk-name">${x.name}</span>
      <span class="rk-so">${soLabel(x)}</span>
      <span class="rk-cnt">${x.count}회</span>
    </div>`;
  }).join("");

  body.innerHTML = myHtml + `<div class="rank-list">${rows}</div>` +
    `<p class="rank-more">전체 ${list.length}명 참여</p>`;
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
      <div class="list-nav">
        <button class="remind-cta nav-record" id="gk-back">← ${userLabel(u)} 성도님</button>
      </div>
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
    </div>`;
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
      <div class="list-nav">
        <button class="remind-cta nav-record" id="rk-back">← ${userLabel(u)} 성도님</button>
      </div>
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
    </div>`;
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
function currentAppVersion() {
  const s = document.querySelector('script[src*="app.js"]');
  const m = s && s.src.match(/[?&]v=([^&"']+)/);
  return m ? m[1] : null;
}
function checkForUpdate() {
  if (_updateBannerShown) return;
  const cur = currentAppVersion();
  if (!cur) return;
  fetch("index.html", { cache: "no-store" })
    .then((r) => (r.ok ? r.text() : Promise.reject()))
    .then((html) => {
      const m = html.match(/app\.js\?v=([^"'&]+)/);
      const fresh = m ? m[1] : null;
      if (fresh && fresh !== cur) showUpdateBanner();
    })
    .catch(() => {});
}
function showUpdateBanner() {
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
  document.getElementById("ub-refresh").addEventListener("click", () => {
    try { if (window.caches) caches.keys().then((ks) => ks.forEach((k) => caches.delete(k))); } catch (e) {}
    const base = location.pathname.replace(/index\.html$/, "");
    location.replace(base + "?u=" + Date.now()); // 캐시버스트 URL → 서버 최신 index.html
  });
  document.getElementById("ub-close").addEventListener("click", () => {
    bar.classList.remove("show");
    setTimeout(() => bar.remove(), 250);
    _updateBannerShown = false;
  });
}
setTimeout(checkForUpdate, 4000); // 시작 몇 초 뒤 1회
document.addEventListener("visibilitychange", () => { if (!document.hidden) checkForUpdate(); }); // 앱 복귀 시

promptOpenExternal();
loadVerses();
