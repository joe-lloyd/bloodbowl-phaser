const PAGE_CACHE = "bb-page-v1";
const ASSET_CACHE = "bb-assets-v1";
const KEPT = [PAGE_CACHE, ASSET_CACHE];
const MAX_ASSETS = 120;
const PAGE = "/index.html";
const HASHED_ASSET = /^\/assets\/[^/]+-[\w-]{8}\.(?:js|css|png|jpg|webp|svg|woff2|mp3|ogg)$/;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(dropOldCaches().then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/__/")) return;
  if (request.mode === "navigate") event.respondWith(freshPage(event));
  else if (HASHED_ASSET.test(url.pathname))
    event.respondWith(hashedAsset(event));
});

async function dropOldCaches() {
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((name) => name.startsWith("bb-") && !KEPT.includes(name))
      .map((name) => caches.delete(name))
  );
}

function isHtml(response) {
  return (response.headers.get("content-type") ?? "").includes("text/html");
}

async function freshPage(event) {
  try {
    const response = await fetch(event.request);
    if (response.ok && isHtml(response))
      event.waitUntil(store(PAGE_CACHE, PAGE, response.clone()));
    return response;
  } catch (error) {
    const saved = await caches.match(PAGE, { cacheName: PAGE_CACHE });
    if (saved) return saved;
    throw error;
  }
}

async function hashedAsset(event) {
  const saved = await caches.match(event.request, { cacheName: ASSET_CACHE });
  if (saved) return saved;
  const response = await fetch(event.request);
  if (response.ok && !isHtml(response))
    event.waitUntil(
      store(ASSET_CACHE, event.request, response.clone()).then(trimAssets)
    );
  return response;
}

async function store(cacheName, key, response) {
  try {
    const cache = await caches.open(cacheName);
    await cache.put(key, response);
  } catch {
    return;
  }
}

async function trimAssets() {
  const cache = await caches.open(ASSET_CACHE);
  const keys = await cache.keys();
  await Promise.all(
    keys.slice(0, Math.max(0, keys.length - MAX_ASSETS)).map((key) => cache.delete(key))
  );
}
