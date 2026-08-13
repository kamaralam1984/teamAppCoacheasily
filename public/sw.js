/* CoachEasily service worker — app shell cache + read-only offline data. */
const SHELL = "ce-shell-v1";
const DATA = "ce-data-v1";
const SHELL_ASSETS = ["/", "/dashboard", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL).then((c) => c.addAll(SHELL_ASSETS.map((u) => new Request(u, { cache: "reload" })))).catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== DATA).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isSupabaseRead(url, request) {
  return (
    request.method === "GET" &&
    url.pathname.startsWith("/rest/v1/") &&
    !url.pathname.includes("/auth/")
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never touch auth or writes.
  if (request.method !== "GET" || url.pathname.includes("/auth/v1/")) return;

  // Navigations: network first, fall back to the cached shell so the app opens offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put(request, copy)).catch(() => undefined);
          return res;
        })
        .catch(async () => (await caches.match(request)) || (await caches.match("/dashboard")) || (await caches.match("/")) || Response.error()),
    );
    return;
  }

  // Supabase reads: network first, cached copy when offline (read-only viewing).
  if (isSupabaseRead(url, request)) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(DATA).then((c) => c.put(request, copy)).catch(() => undefined);
          }
          return res;
        })
        .catch(async () => (await caches.match(request)) || Response.error()),
    );
    return;
  }

  // Same-origin static assets: cache first.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(SHELL).then((c) => c.put(request, copy)).catch(() => undefined);
            }
            return res;
          }),
      ),
    );
  }
});
