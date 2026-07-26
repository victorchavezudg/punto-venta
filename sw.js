/* Service Worker — cachea todo para funcionar sin internet */
var CACHE = "punto-venta-v1";
var ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./data.js",
  "./html5-qrcode.min.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { if (k !== CACHE) return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then(function (hit) {
      return hit || fetch(e.request).then(function (resp) {
        return caches.open(CACHE).then(function (c) {
          try { c.put(e.request, resp.clone()); } catch (x) {}
          return resp;
        });
      }).catch(function () { return caches.match("./index.html"); });
    })
  );
});
