/* オフライン対応
 * - アプリ本体（HTML/CSS/JS/アイコン）: キャッシュを先に返し、裏で最新に更新
 * - 旅程データ（data/itinerary.json）: ネットを先に試し、3秒でだめならキャッシュ
 * アプリ本体を直したら CACHE の番号を上げると確実に入れ替わります。
 */
const CACHE = "hawaii2026-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./data/itinerary.json",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // 旅程データ: ネット優先
  if (url.pathname.endsWith("/data/itinerary.json")) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await Promise.race([fetch(req, { cache: "no-cache" }), timeout(3000)]);
        if (res.ok) cache.put("./data/itinerary.json", res.clone());
        return res;
      } catch (err) {
        const hit = await cache.match("./data/itinerary.json");
        return hit || new Response("{}", { status: 503, headers: { "Content-Type": "application/json" } });
      }
    })());
    return;
  }

  // それ以外: キャッシュ優先＋裏で更新
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true }) ||
      (req.mode === "navigate" ? await cache.match("./index.html") : null);
    const net = fetch(req).then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    const res = await net;
    return res || new Response("オフラインです", { status: 503 });
  })());
});
