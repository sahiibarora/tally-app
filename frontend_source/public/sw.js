// Tally service worker: enables real push notifications (the app doesn't
// need to be open for these to arrive) and a minimal offline fallback.

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// A push notification arrives here even if the app is closed. This is what
// makes it a *real* notification instead of an in-app banner.
self.addEventListener("push", (event) => {
  let data = { title: "Tally", body: "" };
  try {
    data = event.data.json();
  } catch (e) {
    data.body = event.data ? event.data.text() : "";
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Tally", {
      body: data.body || "",
      tag: data.tag || "tally",
      icon: "/static/icon-192.png",
      badge: "/static/icon-192.png",
    })
  );
});

// Tapping the notification focuses an already-open tab if there is one,
// otherwise opens a new one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("/");
    })
  );
});
