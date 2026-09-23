// 성경말씀 암송 v2 — 서비스워커 (Web Push 알림)
self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// 설치(WebAPK) 조건 충족용 fetch 핸들러 — 네트워크 그대로 전달(오프라인 시 무시)
self.addEventListener("fetch", (e) => {
  // GET만 통과 처리(그 외는 브라우저 기본 동작)
  if (e.request.method !== "GET") return;
  // 화면(HTML)은 캐시를 건너뛰고 늘 새로 받는다 — 옛 index.html이 남으면
  // 그 안의 app.js?v= 도 옛 번호라 화면이 통째로 옛것이 된다.
  if (e.request.mode === "navigate" || e.request.destination === "document") {
    e.respondWith(
      fetch(e.request.url, { cache: "no-store", credentials: "same-origin" })
        .catch(() => caches.match(e.request)),
    );
    return;
  }
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
  // 알림을 눌러 들어온 것임을 앱에 알린다 — 발송(push_log)은 남지만 「누가 눌렀는지」는
  // 지금껏 아무 데도 안 남았다. 앱이 이 표식을 보고 한 번 기록한 뒤 주소에서 지운다.
  // ⚠️ 기존 딥링크(?v=38)와 섞여도 안전하도록 파라미터로 붙인다.
  const marked = url + (url.indexOf("?") >= 0 ? "&" : "?") + "from=push";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          // ⚠️ 이미 열린 창은 focus 만 하고 주소가 안 바뀐다 — 그래서 따로 알린다.
          try { c.postMessage({ type: "from-push" }); } catch (_) {}
          return c.focus();
        }
      }
      return self.clients.openWindow(marked);
    })
  );
});
