// sw.js — minimal service worker so Crease installs as a PWA and the
// app shell loads offline. Live data still needs a connection.
const CACHE = "crease-shell-v1";
const SHELL = ["/", "/index.html", "/manifest.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // never cache API/proxy calls — always go to network
  if (url.pathname.includes("/api/")) return;
  // network-first for navigations, cache fallback when offline
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).catch(() => caches.match("/index.html")));
    return;
  }
  // cache-first for static assets
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request))
  );
});
