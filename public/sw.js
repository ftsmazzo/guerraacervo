/* GuerraAcervo painel — service worker (Web Push) */
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {
    title: "GuerraAcervo",
    body: "Nova notificação",
    url: "/painel",
  };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    try {
      if (event.data) data.body = event.data.text();
    } catch {
      // ignore
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "GuerraAcervo", {
      body: data.body,
      icon: "/guerraacervo-icon.png",
      badge: "/guerraacervo-icon.png",
      data: { url: data.url || "/painel" },
      tag: "ga-reservation",
      renotify: true,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/painel";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate?.(url);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
