/* Service worker: keeps the app working with a weak signal in the park.
   App files are cached on install; map tiles you've viewed are cached as you go. */
const VERSION = "v2";
const APP = `ncs-app-${VERSION}`, TILES = "ncs-tiles";
const FILES = [
  "./", "index.html", "styles.css", "app.js", "manifest.webmanifest",
  "hunts/index.json", "hunts/greenwich.json", "hunts/westminster-churches.json", "fonts/barlow-condensed-latin-700-normal.woff2",
  "vendor/leaflet/leaflet.js", "vendor/leaflet/leaflet.css",
  "icons/icon-192.png", "icons/apple-touch-icon.png"
];
const MAX_TILES = 400;

self.addEventListener("install", e => {
  e.waitUntil(caches.open(APP).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => k.startsWith("ncs-app-") && k !== APP).map(k => caches.delete(k))
  )).then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;

  // Map tiles: use the network, fall back to a tile seen earlier
  if (url.hostname === "tile.openstreetmap.org") {
    e.respondWith(caches.open(TILES).then(async c => {
      try {
        const res = await fetch(e.request);
        if (res.ok || res.type === "opaque") { c.put(e.request, res.clone()); trim(c); }
        return res;
      } catch (err) {
        const hit = await c.match(e.request);
        if (hit) return hit;
        throw err;
      }
    }));
    return;
  }

  // App files: network first so updates arrive, cache when offline
  if (url.origin === location.origin) {
    e.respondWith(fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(APP).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true })));
  }
});

async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_TILES; i++) await cache.delete(keys[i]);
}
