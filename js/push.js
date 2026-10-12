// Web Push 구독 — 서비스워커 등록 → 권한 요청 → 구독 → 서버 저장
const VAPID_PUBLIC = "BGiUBhcC_utl3JD9XEoTLPe50bjLZGMOSRYozEbj_K4G4pqcq57rQO5WNLTT884Yl0nlMuT2iSMs2NejrFihGdg";

// 네이티브(iOS) 앱 안 웹뷰인지 — Capacitor가 window.Capacitor를 심어 둔다.
// 이 경우 Web Push(PushManager)는 아예 지원되지 않고, 대신 AppDelegate가 앱을 켤 때마다
// 스스로 APNs 기기 토큰을 등록·재시도한다(설정 화면의 "알림 받기" 버튼과는 무관하다).
function isNativeApp() {
  try { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); }
  catch (e) { return false; }
}
// 아이폰 앱 껍데기의 판 — AppDelegate.installAppInfoMarker 가 window.GOCHEOK_APP 을 심는다(1.1.0 다음 판부터).
// 웹은 늘 최신인데 껍데기는 성도님마다 판이 달라서, 옛 판에만 App Store 업데이트를 안내할 때 쓴다.
// 앱이 아니면 null · 앱인데 표식이 없으면 version:"" (= 1.1.0 이하, 표식이 들어가기 전 판).
function nativeAppInfo() {
  if (!isNativeApp()) return null;
  const a = window.GOCHEOK_APP || {};
  const num = (v) => String(v == null ? "" : v).replace(/[^0-9.]/g, "");   // 숫자와 점만 — 화면에 그대로 싣는다
  return { platform: "ios", version: num(a.version), build: num(a.build) };
}
// 네이티브 앱에서는 요절 고정 배너(.test-ref-sticky)를 AppDelegate가 그리는 진짜 네이티브
// 오버레이가 대신하므로, 웹 쪽은 (레이아웃/textContent는 남기고) 안 보이게만 한다.
if (isNativeApp()) {
  document.addEventListener("DOMContentLoaded", () => document.body.classList.add("native-app-hide-ref"));
  if (document.body) document.body.classList.add("native-app-hide-ref");
}

// 저녁 알림(20시)이 실제로 나가기 시작한 날 true 로 바꾼다.
//   ⚠️ 이것을 false 로 두는 동안에는 **저녁을 약속하는 문구를 성도님께 보이지 않는다.**
//      칸·토글·액션은 미리 다 있지만 보내는 크론이 아직 없기 때문이다(0판은 준비, 3판이 켠다).
//      켜지 않은 채 「저녁 8시에도 보내드려요」를 내보내면, 기다리시는데 안 오는 일이 생긴다.
//   ⚠️ 켜는 날 할 일 — 이 값을 true 로 → python tools/bump.py → 푸시.
//      같은 꼴의 본보기가 app.js 의 WIDGET_GUIDE 다.
const EVENING_LIVE = false;
window.EVENING_LIVE = EVENING_LIVE;

// 이 기기의 웹 푸시 구독을 **어느 계정으로 서버에 저장했나**(기기에 적어 둔다 — 계정 번호 하나). 구독 줄의 주인(push_subscriptions.user_id)은
//   알림을 켤 때와 알림 시각을 바꿀 때만 쓰였다 — 「로그인 정보변경」으로 신원이 바뀌면(= 다른 계정) 구독은 앞 계정에 묶인 채라, 새 계정의 당번·교육 알림은
//   올 기기가 없고(화면은 알림이 켜진 것으로 보인다) 앞 계정의 알림은 이 기기에 뜬다. 매일 알림은 모두 같은 글이라 드러나지 않았다 — 사람마다 글이 다른 알림은
//   교육(2026-10-05)·봉사 당번(2026-10-07)부터다(검토 반영 2026-10-07).
const PUSH_OWNER_KEY = "push-owner";
function markPushOwner(userId) { try { if (userId) localStorage.setItem(PUSH_OWNER_KEY, String(userId)); else localStorage.removeItem(PUSH_OWNER_KEY); } catch (e) {} }
// 동기화로 계정 번호가 정해진 뒤 부른다(app.js enterAfterLogin) — 이 기기에 구독이 **이미 있고** 그 주인이 지금 계정이 아니면(또는 모르면) 한 번 다시 저장한다
//   (끝점 upsert 라 주인만 바뀐다 · 시각은 이 기기의 것 그대로). 구독이 없으면 아무것도 하지 않는다 — 권한을 묻지도 구독을 만들지도 않는다.
//   아이폰 앱은 껍데기가 앞에 올 때마다 지금 계정으로 토큰을 다시 등록한다(여기 일이 아니다). → 다시 저장했으면 true
async function syncPushOwner() {
  if (isNativeApp()) return false;
  try {
    const u = (typeof loadUser === "function") ? loadUser() : null;
    if (!u || !u.user_id || !("serviceWorker" in navigator)) return false;
    if (localStorage.getItem(PUSH_OWNER_KEY) === String(u.user_id)) return false;   // 이미 이 계정으로 저장했다
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && reg.pushManager ? await reg.pushManager.getSubscription() : null;
    if (!sub) return false;
    const r = await api.savePush(u.user_id, sub.toJSON(), getPushHour());
    if (!r || r.ok !== true) return false;
    // 저장하는 사이 이 기기의 사람이 바뀌었으면(공용 기기) 표식을 남기지 않는다 — 다음 동기화가 다시 맞춘다
    const now = (typeof loadUser === "function") ? loadUser() : null;
    if (!now || now.user_id !== u.user_id) return false;
    markPushOwner(u.user_id);
    return true;
  } catch (e) { return false; }
}
window.syncPushOwner = syncPushOwner;

// 알림 받을 시간(5·6·7·8시). 기본 7시. localStorage에 보관.
function getPushHour() {
  try { const h = Number(localStorage.getItem("pushHour")); return [5, 6, 7, 8].includes(h) ? h : 7; }
  catch (e) { return 7; }
}
window.getPushHour = getPushHour;

// 알림 시간 변경 — 로컬 저장 + (이미 구독/등록돼 있으면) 서버 반영
async function setPushHour(hour) {
  hour = Number(hour); if (![5, 6, 7, 8].includes(hour)) hour = 7;
  try { localStorage.setItem("pushHour", String(hour)); } catch (e) {}
  const u = (typeof loadUser === "function") ? loadUser() : null;
  // 네이티브 앱은 Web Push 구독이 없다 — 이미 등록된 APNs 기기 토큰의 시간만 바꾼다.
  // 예전엔 이 분기가 없어서 네이티브 사용자가 시간을 바꿔도 조용히 무시됐다(2026-09-16 발견).
  if (isNativeApp()) {
    try {
      if (u && u.user_id) {
        const r = await api.updateIosPushHour(u.user_id, hour);
        if (r && r.ok) return { updated: !!r.updated, hour };
      }
    } catch (e) {}
    return { updated: false, hour };
  }
  try {
    const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
    const sub = reg && await reg.pushManager.getSubscription();
    if (sub && u && u.user_id) { await api.savePush(u.user_id, sub.toJSON(), hour); markPushOwner(u.user_id); return { updated: true, hour }; }
  } catch (e) {}
  return { updated: false, hour };
}
window.setPushHour = setPushHour;

// 저녁 알림(20시)을 받을지 — 기본 켜짐. localStorage 에 보관.
// ⚠️ 기본이 「켜짐」이다. 값이 없거나 못 읽으면 true 로 본다 — 읽기 실패가
//    성도님을 조용히 끄면 안 된다(사파리 프라이빗 모드 등).
function getPushEvening() {
  try { return localStorage.getItem("pushEvening") !== "0"; }
  catch (e) { return true; }
}
window.getPushEvening = getPushEvening;

// 저녁 알림 켜고 끄기 — 로컬 저장 + (로그인돼 있으면) 서버 반영.
// ⚠️ 네이티브 앱도 웹도 **같은 액션**을 쓴다. 서버가 두 표를 함께 고치기 때문이다.
//    setPushHour 는 웹푸시 구독(endpoint)이 있어야 해서 분기가 필요했지만,
//    저녁은 사람 단위라 user_id 하나면 된다 — 그래서 여기엔 분기가 없다.
//    (2026-09-16 에 setPushHour 의 네이티브 분기가 없어 조용히 무시된 사고가 있었다.
//     이 함수가 그 함정을 피하는 방식이 「분기를 두는 것」이 아니라 「분기가 필요 없게 만든 것」이다.
//     회귀 시험: tests/push-evening-native.py)
async function setPushEvening(on) {
  on = on !== false;
  try { localStorage.setItem("pushEvening", on ? "1" : "0"); } catch (e) {}
  const u = (typeof loadUser === "function") ? loadUser() : null;
  if (u && u.user_id) {
    try {
      const r = await api.updatePushEvening(u.user_id, on);
      if (r && r.ok) return { updated: true, on };
    } catch (e) {}
  }
  return { updated: false, on };
}
window.setPushEvening = setPushEvening;

function urlB64ToUint8Array(base64) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

// ── 🔔 알림이 안 켜질 때 길잡이(2026-10-13 친구 — 「알림 권한이 허용되지 않았습니다」 한 줄만 뜨고 끝났다 · 「사용자가 쉽게 설정할 수 있게」) ──
//   기기·창마다 켜는 곳이 다르다 — 지금 이 화면이 어디서 열렸는지(pushEnv) 보고 그 길만 차근차근 보여 준다.
//   설정에서 켜고 이 화면으로 돌아오면(화면이 다시 보일 때) 권한을 다시 보고, 허용이면 저절로 알림을 마저 켠다(armPushRetry).
//   ⚠️ 길 이름은 폰·판마다 조금 다르다 — 그래서 「또는」을 함께 적고, 막히면 다른 길(크롬 · 스토어 앱)을 하나 더 적는다.
//   앱 이름: 플레이스토어 앱 = 「성경암송」(android-app build.gradle launcherName) · 아이폰 앱 = 「고척교회 성경암송」(Info.plist) · 홈 화면 앱 = 「성경암송」(manifest.json).
function pushEnv() {
  const ua = navigator.userAgent || "";
  if (isNativeApp()) return "ios-app";
  if (/KAKAOTALK|NAVER|Instagram|FBAN|FBAV|Line\//i.test(ua)) return /KAKAOTALK/i.test(ua) ? "kakao" : "inapp";
  const standalone = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
  const ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (ios) return standalone ? "ios-home" : "ios-browser";
  if (/Android/i.test(ua)) {
    const play = (typeof openedByPlayApp === "function" && openedByPlayApp())
      || (typeof isPlayStoreApp === "function" && isPlayStoreApp() && !(typeof isBrowserTab === "function" && isBrowserTab()));
    if (play || standalone) return "android-app";
    return /SamsungBrowser/i.test(ua) ? "samsung" : "android";
  }
  return "pc";
}
const BACK_AUTO = "이 화면으로 돌아오시면 <b>알림이 저절로 켜져요</b>.";
const PUSH_HELP = {
  "android-app": { lead: "폰 설정에서 <b>성경암송</b> 앱의 알림을 켜 주세요.",
    steps: ["바탕화면의 <b>성경암송</b> 앱 아이콘을 <b>꾹</b> 누르세요.", "<b>ⓘ</b>(앱 정보)를 누르세요.", "<b>알림</b>을 눌러 <b>「알림 허용」</b>을 켜세요.", BACK_AUTO],
    tip: "아이콘에서 안 되면: 폰 <b>설정 → 애플리케이션(앱) → 성경암송 → 알림</b>." },
  "android": { lead: "크롬에서 이 사이트의 알림을 허용해 주세요.",
    steps: ["화면 맨 위 주소창 <b>맨 왼쪽 아이콘</b>(🔒 또는 ⚙)을 누르세요.", "<b>권한</b>(또는 <b>사이트 설정</b>)에서 <b>알림</b>을 누르세요.", "<b>허용</b>으로 바꾸세요.", BACK_AUTO],
    tip: "안 보이면: 크롬 오른쪽 위 <b>⋮ → 설정 → 사이트 설정 → 알림</b>에서 <b>gocheok.onlybible.kr</b> 을 허용. 플레이스토어 <b>성경암송</b> 앱으로 받으시면 더 쉬워요." },
  "samsung": { lead: "삼성 인터넷에서 이 사이트의 알림을 허용해 주세요.",
    steps: ["아래 <b>≡</b>(메뉴) → <b>설정</b>을 누르세요.", "<b>사이트 및 다운로드</b>에서 <b>사이트 권한</b>(또는 <b>알림</b>)을 누르세요.", "<b>gocheok.onlybible.kr</b> 을 <b>허용</b>으로 바꾸세요.", BACK_AUTO],
    tip: "메뉴 이름은 폰·판마다 조금 달라요. 어려우시면 플레이스토어에서 <b>성경암송</b> 앱을 받으시면 알림 켜기가 쉬워요." },
  "ios-home": { lead: "아이폰 설정에서 <b>성경암송</b>의 알림을 켜 주세요.",
    steps: ["아이폰 <b>설정</b> 앱을 여세요.", "<b>알림</b>을 누르세요.", "목록에서 <b>성경암송</b>을 찾아 <b>「알림 허용」</b>을 켜세요.", BACK_AUTO],
    tip: "알림은 아이폰 iOS 16.4 이상에서 받을 수 있어요." },
  "ios-app": { lead: "이 앱은 켜실 때 알림을 자동으로 설정해 드려요.",
    steps: ["알림이 안 오면 아이폰 <b>설정</b> 앱을 여세요.", "<b>고척교회 성경암송</b>을 누르세요(또는 <b>설정 → 알림</b>에서 찾기).", "<b>알림 → 「알림 허용」</b>을 켜세요."],
    tip: "" },
  "ios-browser": { lead: "아이폰은 <b>사파리 창에서는</b> 알림을 받을 수 없어요. 아래 둘 중 하나로 받으세요.",
    steps: ["<b>앱스토어</b>에서 <b>고척교회 암송</b>을 받으세요 — 앱을 켜면 알림이 저절로 설정돼요.", "또는 사파리 <b>공유(⬆️) → 홈 화면에 추가</b>로 앱을 만들고, 그 앱에서 🔔 <b>알림</b>을 누르세요(iOS 16.4 이상). <button type=\"button\" class=\"ph-link\" id=\"ph-install\">홈 화면에 추가하는 법 보기</button>"],
    tip: "" },
  "kakao": { lead: "카카오톡 안에서 연 화면에서는 알림을 켤 수 없어요.",
    steps: ["아래 <b>「크롬·사파리로 열기」</b>를 누르세요.", "열린 화면에서 다시 🔔 <b>알림</b>을 누르세요."],
    tip: "" },
  "inapp": { lead: "이 앱(네이버·인스타그램 등) 안에서 연 화면에서는 알림을 켤 수 없어요.",
    steps: ["오른쪽 위(또는 아래) <b>⋮</b> 나 <b>…</b> 를 누르세요.", "<b>다른 브라우저로 열기</b>(크롬·사파리)를 고르세요.", "열린 화면에서 다시 🔔 <b>알림</b>을 누르세요."],
    tip: "" },
  "pc": { lead: "이 브라우저에서 사이트 알림을 허용해 주세요.",
    steps: ["주소창 왼쪽 <b>자물쇠(🔒)</b> 또는 <b>⚙</b> 를 누르세요.", "<b>알림</b>을 <b>허용</b>으로 바꾸세요.", BACK_AUTO],
    tip: "" },
};
// 길잡이 창 — 무엇을 누르면 되는지 번호로. 끝 단추는 그 길에 맞게(다시 켜기 · 앱스토어 · 홈 화면 추가 · 크롬으로 열기)
async function showPushHelp(env, why) {
  env = env || pushEnv();
  const h = PUSH_HELP[env] || PUSH_HELP.pc;
  const head = why === "vanished"
    ? "알림이 곧바로 꺼졌어요 — 폰에서 이 앱의 알림이 꺼져 있는 것 같아요.<br>"
    : why === "denied" ? "지금 이 기기에서 알림이 <b>막혀</b> 있어요.<br>" : "";
  const msg = `<div class="ph-wrap">${head ? `<p class="ph-why">${head}</p>` : ""}<p class="ph-lead">${h.lead}</p>`
    + `<ol class="ph-steps">${h.steps.map((x) => `<li>${x}</li>`).join("")}</ol>`
    + (h.tip ? `<p class="ph-tip">💡 ${h.tip}</p>` : "") + `</div>`;
  const retry = ["android-app", "android", "samsung", "ios-home", "pc"].indexOf(env) >= 0;
  if (retry) armPushRetry();
  if (env === "ios-browser") {
    // 「홈 화면에 추가하는 법」은 창 안 글 단추로 — 닫기(바깥 누름 포함)와 섞이면 안 된다
    const pr = appModal({ title: "🔔 알림 켜는 방법", msg, okText: "앱스토어에서 받기", cancelText: "닫기" });
    const link = document.getElementById("ph-install");
    if (link) link.addEventListener("click", () => {
      const m = document.getElementById("app-modal");
      if (m) m.remove();
      if (typeof renderInstallGuide === "function") renderInstallGuide();
    });
    if (await pr) { try { location.href = (typeof IOS_APP_STORE_URL !== "undefined") ? IOS_APP_STORE_URL : "https://apps.apple.com/app/id6811724527"; } catch (e) {} }
    return;
  }
  if (env === "kakao") {
    const go = await appModal({ title: "🔔 알림 켜는 방법", msg, okText: "크롬·사파리로 열기", cancelText: "닫기" });
    if (go) location.href = "kakaotalk://web/openExternal?url=" + encodeURIComponent(location.origin + "/");
    return;
  }
  const again = await appModal({ title: "🔔 알림 켜는 방법", msg, okText: retry ? "다시 켜기" : "확인", cancelText: retry ? "닫기" : null });
  if (again && retry) {
    disarmPushRetry();
    const perm = (window.Notification && Notification.permission) || "default";
    if (perm === "denied") showPushHelp(env, "denied");   // 아직 막혀 있다 — 같은 길을 다시
    else enablePush();
  }
}
// 설정 앱에 다녀와 이 화면이 다시 보이면 권한을 다시 본다 — 허용이면 길잡이 창을 닫고 알림을 마저 켠다(한 번만)
let _pushRetry = null;
function armPushRetry() {
  disarmPushRetry();
  const check = () => {
    if (document.visibilityState && document.visibilityState !== "visible") return;
    const perm = (window.Notification && Notification.permission) || "default";
    if (perm !== "granted") return;
    disarmPushRetry();
    const m = document.getElementById("app-modal");
    if (m) m.remove();
    enablePush();
  };
  _pushRetry = check;
  document.addEventListener("visibilitychange", check);
  window.addEventListener("focus", check);
}
function disarmPushRetry() {
  if (!_pushRetry) return;
  document.removeEventListener("visibilitychange", _pushRetry);
  window.removeEventListener("focus", _pushRetry);
  _pushRetry = null;
}
window.showPushHelp = showPushHelp;

// 알림 켜기. 성공 시 true.
async function enablePush(again) {
  // 네이티브(iOS) 앱은 로그인 직후 AppDelegate가 스스로 알림 권한을 묻고 기기 토큰을
  // 등록한다 — 이 버튼은 애초에 안 보이지만(renderSettings), 혹시 눌렸다면 그 사실을
  // 안내한다. "이 브라우저는 지원 안 함" 문구는 웹뷰 안에서는 맥락 없이 혼란만 준다
  // (2026-09-16, 성도님 제보 — 실제로 이 메시지를 보고 오해가 있었다).
  if (isNativeApp()) {
    showPushHelp("ios-app");
    return false;
  }
  // 아이폰 사파리 창 · 카톡 같은 앱 안 창은 알림을 받을 수 없다 — 기능이 보이는 척해도 갈 길(앱스토어 · 홈 화면 · 다른 브라우저)을 먼저
  const env = pushEnv();
  if (env === "ios-browser" || env === "kakao" || env === "inapp") { showPushHelp(env); return false; }
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !window.Notification) {
    showPushHelp();   // 이 창에서는 알림이 안 된다 — 아이폰 사파리 · 카톡 안 등은 갈 길을, 그 밖은 이 브라우저 길을
    return false;
  }
  const u = (typeof loadUser === "function") ? loadUser() : null;
  if (!u || !u.user_id) {
    appAlert("먼저 로그인(기록 동기화) 후 다시 시도해 주세요.");
    return false;
  }
  // 이미 막혀 있으면 물어봐도 창이 안 뜬다(브라우저가 곧바로 거절) — 켜는 길을 바로 보여 준다
  if (Notification.permission === "denied") { showPushHelp(null, "denied"); return false; }
  // 처음 묻기 전 한 장 — 다음 창에서 「허용」을 눌러야 한다는 것을 먼저 말씀드린다(「차단」을 잘못 누르시면 되돌리기가 어렵다)
  if (Notification.permission === "default" && again !== true) {
    const go = await appModal({ title: "🔔 매일 말씀 알림",
      msg: `매일 오전 <b>${getPushHour()}시</b>에 이번 주 말씀을 보내 드려요.<br>곧 뜨는 창에서 <b>「허용」</b>을 눌러 주세요.`,
      okText: "알림 켜기", cancelText: "나중에" });
    if (!go) return false;
  }
  try {
    const reg = await navigator.serviceWorker.register("sw.js");
    const perm = await Notification.requestPermission();
    if (perm === "denied") { showPushHelp(null, "denied"); return false; }
    if (perm !== "granted") {   // 창을 그냥 닫으셨다 — 한 번 더 물을 수 있다
      const retry = await appModal({ title: "🔔 알림이 아직 꺼져 있어요",
        msg: "알림을 받으시려면 뜨는 창에서 <b>「허용」</b>을 눌러 주세요.", okText: again === true ? "켜는 방법 보기" : "다시 묻기", cancelText: "나중에" });
      if (retry) { if (again === true) showPushHelp(); else return enablePush(true); }
      return false;
    }
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC),
      });
    }
    const hour = getPushHour();
    await api.savePush(u.user_id, sub.toJSON(), hour);
    markPushOwner(u.user_id);
    // 플레이스토어(TWA) 설치본은 안드로이드 시스템의 앱별 알림 권한이 곧 이 사이트의
    // 알림 권한이다 — 별도로 크롬이 기억하는 권한이 아니다. 그 권한이 실제로는
    // 꺼져 있으면 위 subscribe()는 잠깐 성공하지만 크롬이 곧바로 구독을 무효화한다
    // (2026-08-29, 마켓 설치 테스터가 '설정됨' 메시지를 보고도 알림을 못 받은 사고로
    // 발견). 그래서 바로 성공을 알리지 않고, 잠깐 뒤 구독이 실제로 남아 있는지
    // 다시 확인한다 — 이게 남아 있어야 "설정됨"이 거짓이 아니다.
    await new Promise((r) => setTimeout(r, 700));
    const stillSub = await reg.pushManager.getSubscription();
    if (!stillSub) {
      showPushHelp("android-app", "vanished");   // 플레이스토어 앱의 시스템 알림 권한이 꺼져 있다(2026-08-29 사고) — 앱 알림 켜는 길
      if (typeof updateAppStatus === "function") updateAppStatus();
      return false;
    }
    // 설정 직후 본인 기기로 '오늘의 묵상'을 첫 알림으로 발송(preview=true) — 무엇을 받을지 바로 체감
    api.testPush(sub.endpoint, hour, true).catch(() => {});
    // 저녁 알림이 아직 안 나가는 동안(EVENING_LIVE=false)은 저녁 이야기를 빼고 예전 문구 그대로.
    const eveOn = window.EVENING_LIVE && ((typeof getPushEvening === "function") ? getPushEvening() : true);
    appAlert("🔔 알림이 설정되었습니다!\n매일 오전 " + hour + "시"
      + (eveOn ? "와 저녁 8시" : "") + "에 말씀을 보내드려요."
      + (eveOn ? "\n(저녁은 ⚙️ 설정에서 끄실 수 있어요)" : "")
      + "\n방금 오늘의 묵상을 이 기기로 보냈어요 — 잠시 후 확인해보세요.");
    if (typeof updateAppStatus === "function") updateAppStatus();
    return true;
  } catch (e) {
    appAlert("알림 설정에 실패했습니다: " + (e && e.message ? e.message : e));
    return false;
  }
}
window.enablePush = enablePush;

// 알림 끄기(구독 해제) — 로컬 구독 취소 + 서버 삭제
// silent=true — "내 정보 지우기"처럼 다른 안내가 이어질 때 알림창 없이 조용히 해제
async function disablePush(silent) {
  if (isNativeApp()) {
    // 「내 정보 지우기」(silent) — 이 계정에 묶인 아이폰 기기 토큰을 서버에서 지운다. 안 지우면 다음 분이 로그인해 앱이 다시 앞에 올 때까지 앞 계정의 알림
    //   (당번·교육은 그분의 날짜·자리다)이 이 아이폰에 뜬다 — 화면은 「이 기기의 알림도 함께 꺼집니다」라고 말한다(검토 반영 2026-10-07).
    //   앱 껍데기는 로그인한 계정이 있을 때만, **앱이 앞에 올 때** 토큰을 다시 저장한다(AppDelegate attemptSavePushToken) — 지운 뒤에는 다음 분이 로그인하고
    //   앱이 한 번 뒤로 갔다 앞에 올 때 그분 것으로 등록된다(로그인만으로는 껍데기가 깨지 않는다). 그 계정의 토큰을 모두 지우므로(토큰은 껍데기만 안다)
    //   같은 이름으로 쓰는 다른 아이폰도 그 폰에서 앱을 다시 열 때까지 알림이 멈춘다 — 확인 창(app.js clearMeOnThisDevice)이 그렇게 말한다.
    //   돌려주는 것 = 이 기기의 알림이 꺼졌나: 지울 줄이 없으면(계정 번호를 받기 전) 참 · 서버가 지웠으면 참 · **못 지웠으면 거짓**(한 번 더 해 본 뒤) —
    //   삼키면 「이 기기의 알림도 함께 꺼집니다」가 거짓으로 남는다(아이폰은 서버 줄을 지우는 것이 유일한 길이다 · 고침 검토 반영 2026-10-07).
    if (silent) {
      const u0 = (typeof loadUser === "function") ? loadUser() : null;
      if (!u0 || !u0.user_id) return true;
      // js/api.js 가 실리지 않은 실행(통신이 고르지 않아 스크립트 하나가 빠졌다 — 앱은 그 상태로도 뜬다)에서는 api 가 선언조차 없다. 맨이름으로 읽다 던지면
      //   「지우기」를 눌러도 아무것도 지워지지 않고 아무 말도 없다(회귀 확인 반영 2026-10-07). 못 지운 것으로 답한다 — 거짓 → 「알림을 끄지 못했어요 — 그래도 지우기」 창.
      //   api 는 있는데 그 길만 없는 옛 api.js 는 예전처럼 참(지울 길이 없던 판이다).
      let hasApi = false, canRemove = false;
      try { hasApi = typeof api !== "undefined" && !!api; canRemove = hasApi && typeof api.removeIosPush === "function"; } catch (e) {}
      if (!hasApi) return false;
      if (!canRemove) return true;
      for (let i = 0; i < 2; i++) {
        try { const r = await api.removeIosPush(u0.user_id); if (r && r.ok === true) return true; } catch (e) {}
      }
      return false;
    }
    appAlert("이 앱의 알림은 아이폰 설정 → 고척교회 성경암송 → 알림에서 꺼주세요.");
    return;
  }
  try {
    const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
    let endpoint = null;
    if (reg) {
      const sub = await reg.pushManager.getSubscription();
      if (sub) { endpoint = sub.endpoint; await sub.unsubscribe(); }
    }
    if (endpoint) await api.removePush(endpoint).catch(() => {});
    markPushOwner("");
    if (!silent) appAlert("🔕 매일 암송 알림이 해제되었습니다.");
    if (typeof updateAppStatus === "function") updateAppStatus();
  } catch (e) {
    if (!silent) appAlert("알림 해제에 실패했습니다: " + (e && e.message ? e.message : e));
  }
}
window.disablePush = disablePush;

// 내 기기로 테스트 알림 보내기(설정 확인용)
async function testMyPush() {
  if (isNativeApp()) {
    const u = (typeof loadUser === "function") ? loadUser() : null;
    if (!u || !u.user_id) { appAlert("먼저 로그인(기록 동기화) 후 다시 시도해 주세요."); return; }
    const data = await api.testIosPush(u.user_id).catch(() => ({ ok: false, error: "network" }));
    if (data.ok) appAlert("🔔 테스트 알림을 보냈어요!\n몇 초 뒤 이 기기에 알림이 오는지 확인해줘요.");
    else appAlert("테스트 실패: " + (data.error || "오류") + "\n앱을 한 번 재실행한 뒤 다시 시도해 주세요(기기 등록이 아직 안 끝났을 수 있어요).");
    return;
  }
  if (!("serviceWorker" in navigator)) { appAlert("이 브라우저는 알림을 지원하지 않습니다."); return; }
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && await reg.pushManager.getSubscription();
  if (!sub) { appAlert("먼저 '매일 암송 알림 받기'를 켜주세요."); return; }
  const data = await api.testPush(sub.endpoint, getPushHour()).catch(() => ({ ok: false, error: "network" }));
  if (data.ok) appAlert("🔔 테스트 알림을 보냈어요!\n몇 초 뒤 이 기기에 알림이 오는지 확인해줘요.");
  else appAlert("테스트 실패: " + (data.error || "오류") + "\n'알림 받기'를 다시 켜보세요.");
}
window.testMyPush = testMyPush;
