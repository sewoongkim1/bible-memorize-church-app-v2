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
    if (sub && u && u.user_id) { await api.savePush(u.user_id, sub.toJSON(), hour); return { updated: true, hour }; }
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

// 알림 켜기. 성공 시 true.
async function enablePush() {
  // 네이티브(iOS) 앱은 로그인 직후 AppDelegate가 스스로 알림 권한을 묻고 기기 토큰을
  // 등록한다 — 이 버튼은 애초에 안 보이지만(renderSettings), 혹시 눌렸다면 그 사실을
  // 안내한다. "이 브라우저는 지원 안 함" 문구는 웹뷰 안에서는 맥락 없이 혼란만 준다
  // (2026-09-16, 성도님 제보 — 실제로 이 메시지를 보고 오해가 있었다).
  if (isNativeApp()) {
    appAlert("이 앱은 켜실 때 알림을 자동으로 설정해 드려요.\n혹시 알림이 안 온다면, 아이폰 설정 → 고척교회 성경암송 → 알림에서 켜져 있는지 확인해 주세요.");
    return false;
  }
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    appAlert("이 브라우저에서는 알림을 지원하지 않습니다.\n(아이폰은 '홈 화면에 추가'한 뒤 사용하세요)");
    return false;
  }
  const u = (typeof loadUser === "function") ? loadUser() : null;
  if (!u || !u.user_id) {
    appAlert("먼저 로그인(기록 동기화) 후 다시 시도해 주세요.");
    return false;
  }
  try {
    const reg = await navigator.serviceWorker.register("sw.js");
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { appAlert("알림 권한이 허용되지 않았습니다."); return false; }
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC),
      });
    }
    const hour = getPushHour();
    await api.savePush(u.user_id, sub.toJSON(), hour);
    // 플레이스토어(TWA) 설치본은 안드로이드 시스템의 앱별 알림 권한이 곧 이 사이트의
    // 알림 권한이다 — 별도로 크롬이 기억하는 권한이 아니다. 그 권한이 실제로는
    // 꺼져 있으면 위 subscribe()는 잠깐 성공하지만 크롬이 곧바로 구독을 무효화한다
    // (2026-08-29, 마켓 설치 테스터가 '설정됨' 메시지를 보고도 알림을 못 받은 사고로
    // 발견). 그래서 바로 성공을 알리지 않고, 잠깐 뒤 구독이 실제로 남아 있는지
    // 다시 확인한다 — 이게 남아 있어야 "설정됨"이 거짓이 아니다.
    await new Promise((r) => setTimeout(r, 700));
    const stillSub = await reg.pushManager.getSubscription();
    if (!stillSub) {
      appAlert("알림 구독이 곧바로 사라졌어요.\n안드로이드 설정에서 이 앱(성경암송)의 시스템 알림 권한이 꺼져 있는 것 같아요.\n\n폰 설정 → 앱 → 성경암송 → 알림에서 켜신 뒤 다시 시도해 주세요.");
      if (typeof updateAppStatus === "function") updateAppStatus();
      return false;
    }
    // 설정 직후 본인 기기로 '오늘의 묵상'을 첫 알림으로 발송(preview=true) — 무엇을 받을지 바로 체감
    api.testPush(sub.endpoint, hour, true).catch(() => {});
    appAlert("🔔 알림이 설정되었습니다!\n매일 오전 " + hour + "시에 오늘의 묵상을 보내드려요.\n방금 오늘의 묵상을 이 기기로 보냈어요 — 잠시 후 확인해보세요.");
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
    if (!silent) appAlert("이 앱의 알림은 아이폰 설정 → 고척교회 성경암송 → 알림에서 꺼주세요.");
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
