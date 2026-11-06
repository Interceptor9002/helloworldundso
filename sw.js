const CACHE = "rk-v66";
const DATEIEN = ["./", "index.html", "app.js", "protokoll.js", "netz.js", "manifest.json", "icon.svg"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(DATEIEN)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(k =>
    Promise.all(k.filter(n => n !== CACHE).map(n => caches.delete(n)))));
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  if(new URL(e.request.url).origin !== location.origin) return;
  if(e.request.mode === "navigate"){
    e.respondWith(fetch(e.request).then(a => {
      const k = a.clone();
      caches.open(CACHE).then(c => c.put("index.html", k)).catch(() => {});
      return a;
    }).catch(() => caches.match("index.html")));
    return;
  }
  e.respondWith(caches.match(e.request).then(t => t || fetch(e.request)));
});