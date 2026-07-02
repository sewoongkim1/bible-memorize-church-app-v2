// Web Push 구독 — 서비스워커 등록 → 권한 요청 → 구독 → 서버 저장
const VAPID_PUBLIC = "BGiUBhcC_utl3JD9XEoTLPe50bjLZGMOSRYozEbj_K4G4pqcq57rQO5WNLTT884Yl0nlMuT2iSMs2NejrFihGdg";

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
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    alert("이 브라우저에서는 알림을 지원하지 않습니다.\n(아이폰은 '홈 화면에 추가'한 뒤 사용하세요)");
    return false;
  }
  const u = (typeof loadUser === "function") ? loadUser() : null;
  if (!u || !u.user_id) {
    alert("먼저 로그인(기록 동기화) 후 다시 시도해 주세요.");
    return false;
  }
  try {
    const reg = await navigator.serviceWorker.register("sw.js");
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { alert("알림 권한이 허용되지 않았습니다."); return false; }
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC),
      });
    }
    await api.savePush(u.user_id, sub.toJSON());
    alert("🔔 매일 암송 알림이 설정되었습니다!");
    return true;
  } catch (e) {
    alert("알림 설정에 실패했습니다: " + (e && e.message ? e.message : e));
    return false;
  }
}
window.enablePush = enablePush;

// 알림 끄기(구독 해제) — 로컬 구독 취소 + 서버 삭제
async function disablePush() {
  try {
    const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
    let endpoint = null;
    if (reg) {
      const sub = await reg.pushManager.getSubscription();
      if (sub) { endpoint = sub.endpoint; await sub.unsubscribe(); }
    }
    if (endpoint) await api.removePush(endpoint).catch(() => {});
    alert("🔕 매일 암송 알림이 해제되었습니다.");
    if (typeof updateAppStatus === "function") updateAppStatus();
  } catch (e) {
    alert("알림 해제에 실패했습니다: " + (e && e.message ? e.message : e));
  }
}
window.disablePush = disablePush;
