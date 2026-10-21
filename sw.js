const CACHE = "hearth-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./css/app.css",
  "./js/main.js",
  "./js/ui.js",
  "./js/engine.js",
  "./js/game.js",
  "./js/dict.js",
  "./js/bot.js",
  "./js/worker.js",
  "./words/words.txt",
  "./manifest.webmanifest",
  "./favicon.svg",
  "./icon-180.png",
  "./icon-192.png",
  "./icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith((async () => {
    try {
      const response = await fetch(event.request);
      if (response && response.ok && (response.type === "basic" || response.type === "default")) {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => {});
      }
      return response;
    } catch {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      return new Response("", { status: 504, statusText: "Offline" });
    }
  })());
});
