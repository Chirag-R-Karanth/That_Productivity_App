/* eslint-disable @typescript-eslint/no-explicit-any */
const CACHE = "prodapp-shell-v3";
const API_CACHE = "prodapp-api-v1";
const ROUTES = [
  "/",
  "/tasks",
  "/courses",
  "/timetable",
  "/attendance",
  "/calendar",
  "/pomodoro",
  "/settings",
  "/manifest.webmanifest",
];
const CORE_ASSETS = ROUTES;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE && k !== API_CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method === "GET") {
    if (url.origin === self.location.origin) {
      // App shell: network-first, fall back to cache. Cache successful responses.
      event.respondWith(
        caches.match(request).then((cached) =>
          fetch(request)
            .then((res) => {
              if (res.ok) {
                const copy = res.clone();
                caches.open(CACHE).then((c) => c.put(request, copy));
              }
              return res;
            })
            .catch(() => cached || Response.error()),
        ),
      );
      return;
    }
    // API reads: network-first, fall back to last-seen cached data when offline
    // so the dashboard/tasks/calendar stay usable without a connection.
    event.respondWith(
      caches.match(request).then((cached) =>
        fetch(request)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(API_CACHE).then((c) => c.put(request, copy));
            }
            return res;
          })
          .catch(() => cached || Response.error()),
      ),
    );
    return;
  }

  // Mutations are intentionally NOT intercepted here. When offline, the browser
  // fetch fails and the app's api client queues the write in its own IndexedDB
  // queue (`prodapp-pending`) for replay once we're back online.
});

// Tell pages to replay their queued writes. The page owns the queue and its
// replay dispatches a "sync-refresh" event for live UI updates.
function notifyClients() {
  self.clients.matchAll({ includeUncontrolled: true }).then((clients) => {
    clients.forEach((c) => c.postMessage({ type: "queue-flushed" }));
  });
}

self.addEventListener("sync", (event) => {
  if (event.tag === "prodapp-flush") {
    event.waitUntil(Promise.resolve(notifyClients()));
  }
});

self.addEventListener("online", () => {
  notifyClients();
});

// ---- Push notifications (FCM web) ----
self.addEventListener("push", (event) => {
  let data = { title: "ProdApp", body: "", url: "/" };
  try {
    const payload = event.data?.json() ?? {};
    if (payload.notification) {
      data = {
        title: payload.notification.title || data.title,
        body: payload.notification.body || data.body,
        url: payload.notification.url || payload.url || data.url,
      };
    } else if (payload.title || payload.body) {
      data = { title: payload.title, body: payload.body || "", url: payload.url || "/" };
    }
  } catch {
    data = { title: "ProdApp", body: event.data?.text() || "", url: "/" };
  }

  event.waitUntil(
    self.registration
      .showNotification(data.title, {
        body: data.body,
        icon: "/icon.png",
        badge: "/icon.png",
        data: { url: data.url },
      })
      .catch(() => {}),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("navigate" in client) {
          client.focus().then((focused) => focused.navigate(url));
          return;
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});

self.addEventListener("pushsubscriptionchange", (event) => {
  // Re-subscribe handled by the page; notify it so it can register a new FCM
  // token. Payload is speculative for FCM topics-based setup.
  event.waitUntil(
    notifyClients(),
  );
});