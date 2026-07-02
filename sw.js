// 성경말씀 암송 v2 — 서비스워커 (Web Push 알림)
self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// 설치(WebAPK) 조건 충족용 fetch 핸들러 — 네트워크 그대로 전달(오프라인 시 무시)
self.addEventListener("fetch", (e) => {
  // GET만 통과 처리(그 외는 브라우저 기본 동작)
  if (e.request.method !== "GET") return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : "" }; }
  const title = d.title || "성경말씀 암송";
  const opts = {
    body: d.body || "오늘의 말씀을 암송해요! 🙌",
    icon: "favicon.png",
    badge: "favicon.png",
    data: { url: d.url || "./" },
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ("focus" in c) return c.focus(); }
      return self.clients.openWindow(url);
    })
  );
});
