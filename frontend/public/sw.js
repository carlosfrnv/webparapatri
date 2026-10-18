// Service worker de Estudio IMR: solo recibe los recordatorios (Web Push) y abre la web al tocarlos.

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Estudio IMR", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Estudio IMR 🖤", {
      body: data.body || "",
      icon: "/icon-rosa-512.png",
      badge: "/icon-rosa-512.png",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});

// ---------- Sin conexión ----------
// La web se guarda al usarla: con internet se pide siempre lo último (y se guarda una copia);
// sin internet se usa la copia. Los archivos de /_next/static no cambian nunca (llevan una huella en el nombre).
// Solo se guardan páginas y archivos de la propia web: los datos (servidor de Render, Supabase) no pasan por aquí.

const CACHE = "estudio-imr-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Los modelos 3D del atlas pesan mucho: no se guardan.
  if (url.pathname.startsWith("/atlas/")) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(req);
        if (hit) return hit;
        // Una página que no se había abierto nunca: se abre "Estudiar" (o el inicio) si están guardados.
        if (req.mode === "navigate")
          return (await caches.match("/estudiar")) || (await caches.match("/")) || Response.error();
        return Response.error();
      }),
  );
});
