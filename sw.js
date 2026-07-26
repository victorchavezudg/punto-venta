/* Service Worker — cachea la app para funcionar sin internet.
   OJO: subir el número de versión cada vez que cambien los archivos. */
var CACHE = "punto-venta-v2";
var ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./store.js",
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
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  // nunca cachear la API de GitHub (sincronización)
  if (url.hostname === "api.github.com" || url.hostname.indexOf("githubusercontent") > -1) return;

  // los archivos propios: primero red, si falla la caché (así se actualizan solos)
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(req).then(function (resp) {
        var copy = resp.clone();
        caches.open(CACHE).then(function (c) { try { c.put(req, copy); } catch (x) {} });
        return resp;
      }).catch(function () {
        return caches.match(req).then(function (hit) { return hit || caches.match("./index.html"); });
      })
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(function (hit) { return hit || fetch(req); })
  );
});
