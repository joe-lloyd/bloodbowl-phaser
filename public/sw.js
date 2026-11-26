const FILES = "bb-files-v1";
const KEPT = [FILES];
const PAGE = "/index.html";
const MANIFEST = "/offline-manifest.json";
const HASH_HEADER = "x-bb-hash";
const MODEL_FILE = /^\/sprites\/bloodbowl\/(?!sideline_)([^/]+)\/(.+)$/;
const PARALLEL = 6;

self.addEventListener("install", (event) => {
  event.waitUntil(
    refresh([])
      .catch((error) => console.warn("[sw] offline files not stored", error))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(dropOldCaches().then(() => self.clients.claim()));
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "keep") return;
  const models = Array.isArray(event.data.models) ? event.data.models : [];
  event.waitUntil(keep(models, event.source));
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/__/")) return;
  if (request.mode === "navigate") event.respondWith(freshPage(event));
  else if (!request.headers.has("range")) event.respondWith(savedFirst(request));
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

async function freshManifest() {
  const response = await fetch(MANIFEST, { cache: "no-cache" });
  if (!response.ok || isHtml(response)) throw new Error(`no ${MANIFEST}: ${response.status}`);
  const cache = await caches.open(FILES);
  await cache.put(MANIFEST, response.clone());
  return response.json();
}

async function latestManifest() {
  try {
    return await freshManifest();
  } catch (error) {
    const saved = await caches.match(MANIFEST, { cacheName: FILES });
    if (saved) return saved.json();
    throw error;
  }
}

function coreFiles(manifest) {
  return Object.entries(manifest.core);
}

function modelFiles(manifest, model) {
  return Object.entries(manifest.models[model] ?? {}).map(([rest, hash]) => [
    `/sprites/bloodbowl/${model}/${rest}`,
    hash,
  ]);
}

function expectedHash(manifest, path) {
  const [, model, rest] = MODEL_FILE.exec(path) ?? [];
  return model === undefined ? manifest.core[path] : manifest.models[model]?.[rest];
}

async function sweep(manifest) {
  const cache = await caches.open(FILES);
  for (const request of await cache.keys()) {
    const path = decodeURI(new URL(request.url).pathname);
    if (path === PAGE || path === MANIFEST) continue;
    const saved = await cache.match(request);
    if (saved?.headers.get(HASH_HEADER) !== expectedHash(manifest, path))
      await cache.delete(request);
  }
}

async function refresh(models) {
  const manifest = await latestManifest();
  await sweep(manifest);
  const files = [coreFiles(manifest), ...models.map((model) => modelFiles(manifest, model))];
  return storeFiles(files.flat());
}

async function keep(models, client) {
  const missing = await refresh(models);
  client?.postMessage({ type: "kept", models, missing });
}

async function storeFiles(files) {
  const cache = await caches.open(FILES);
  const queue = [...files];
  let missing = 0;
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const stored = await storeFile(cache, ...next).catch(() => false);
      if (!stored) missing += 1;
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  return missing;
}

async function storeFile(cache, path, hash) {
  const saved = await cache.match(path);
  if (saved?.headers.get(HASH_HEADER) === hash) return true;
  const response = await fetch(path, { cache: "no-cache" });
  if (!response.ok || (isHtml(response) && !path.endsWith(".html"))) return false;
  const headers = new Headers(response.headers);
  headers.set(HASH_HEADER, hash);
  headers.delete("vary");
  const body = await response.blob();
  await cache.put(path, new Response(body, { status: response.status, headers }));
  return true;
}

async function savedFirst(request) {
  const saved = await caches.match(request, { cacheName: FILES });
  return saved ?? fetch(request);
}

async function freshPage(event) {
  try {
    const response = await fetch(event.request);
    if (response.ok && isHtml(response))
      event.waitUntil(storePage(response.clone()));
    return response;
  } catch (error) {
    const saved = await caches.match(PAGE, { cacheName: FILES });
    if (saved) return saved;
    throw error;
  }
}

async function storePage(response) {
  try {
    const cache = await caches.open(FILES);
    await cache.put(PAGE, response);
  } catch {
    return;
  }
}
