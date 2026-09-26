const CACHE = "prodapp-shell-v4";
const API_CACHE = "prodapp-api-v1";
const ROUTES = [
  "/",
  "/tasks",
  "/courses",
  "/timetable",
  "/attendance",
  "/calendar",
  "/zen",
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
function notifyClients(type = "queue-flushed") {
  self.clients.matchAll({ includeUncontrolled: true }).then((clients) => {
    clients.forEach((c) => c.postMessage({ type }));
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

// ---- Push notifications ----
//
// Payloads are the flat shape the backend sends: { title, body, url, tag,
// requireInteraction, data }. A dismissal is a payload with an empty body and
// type "attendance_dismiss" — there is no unsubscribe channel a push service
// offers, so "take this notification down" has to be expressed as another push.

self.addEventListener("push", (event) => {
  let data = { title: "ProdApp", body: "", url: "/" };
  try {
    const payload = event.data?.json() ?? {};
    if (payload.notification) {
      data = {
        title: payload.notification.title || data.title,
        body: payload.notification.body || data.body,
        url: payload.notification.url || payload.url || data.url,
        tag: payload.notification.tag || payload.tag,
        requireInteraction: !!payload.notification.requireInteraction,
        type: payload.data?.type ?? payload.type,
        recordId: payload.data?.recordId,
      };
    } else if (payload.title || payload.body) {
      data = {
        title: payload.title,
        body: payload.body || "",
        url: payload.url || "/",
        tag: payload.tag,
        requireInteraction: !!payload.requireInteraction,
        type: payload.data?.type ?? payload.type,
        recordId: payload.data?.recordId,
      };
    }
  } catch {
    data = { title: "ProdApp", body: event.data?.text() || "", url: "/" };
  }

  // A dismissal carries no body: close whatever is filed under the same tag and
  // show nothing. The tag is what ties a prompt to the record it is about, so
  // the OS tray is never left asking a question that has since been answered.
  if (data.type === "attendance_dismiss" && data.tag) {
    event.waitUntil(
      self.registration
        .getNotifications({ tag: data.tag })
        .then((existing) => Promise.all(existing.map((n) => n.close())))
        .catch(() => {}),
    );
    return;
  }

  event.waitUntil(
    self.registration
      .showNotification(data.title, {
        body: data.body,
        icon: "/icon.png",
        badge: "/icon.png",
        // Grouping and replacement both work off the tag. Without one, two
        // prompts for the same class sit side by side as separate items.
        tag: data.tag,
        // Stays in the tray until answered. A prompt you have to answer is not
        // one that should be missed because you looked away.
        requireInteraction: !!data.requireInteraction,
        data: { url: data.url, tag: data.tag, recordId: data.recordId, type: data.type },
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
  // A browser drops and re-issues push subscriptions on its own schedule (a
  // VAPID key rotation, a profile tidy-up) and will not tell us the new
  // address — only that the old one is void. Re-subscribing needs the
  // application server key and an authenticated POST, neither of which a
  // service worker can do, so this hands the job back to the page instead of
  // pretending to handle it.
  event.waitUntil(notifyClients("push-invalidated"));
});