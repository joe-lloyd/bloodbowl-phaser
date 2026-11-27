const FILES = "bb-files-v1";
const KEPT = [FILES];
const PAGE = "/index.html";
const MANIFEST = "/offline-manifest.json";
const HASH_HEADER = "x-bb-hash";
const MODEL_FILE = /^\/sprites\/bloodbowl\/(?!sideline_)([^/]+)\/(.+)$/;
const PARALLEL = 6;
const PROGRESS_STEP = 25;

self.addEventListener("install", (event) => {
  event.waitUntil(
    refresh([], () => undefined)
      .catch((error) => console.warn("[sw] offline files not stored", error))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(dropOldCaches().then(() => self.clients.claim()));
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "keep") return;
  const models = Array.isArray(event.data.models)
    ? event.data.models.filter((model) => typeof model === "string")
    : [];
  event.waitUntil(keep(event.data.id, models, event.source));
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
    return { manifest: await freshManifest(), online: true };
  } catch (error) {
    const saved = await caches.match(MANIFEST, { cacheName: FILES });
    if (saved) return { manifest: await saved.json(), online: false };
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

async function refresh(models, report) {
  const { manifest, online } = await latestManifest();
  await sweep(manifest);
  const files = [
    ...coreFiles(manifest).map((file) => [...file, ""]),
    ...models.flatMap((model) => modelFiles(manifest, model).map((file) => [...file, model])),
  ];
  const failed = await storeFiles(files, report);
  const ready = models.filter((model) => model in manifest.models && !failed.has(model));
  return { ready, bytes: manifest.bytes ?? {}, online };
}

async function keep(id, models, client) {
  const report = (done, total) => {
    if (done % PROGRESS_STEP === 0 || done === total)
      client?.postMessage({ type: "progress", id, done, total });
  };
  const kept = await refresh(models, report).catch((error) => {
    console.warn("[sw] offline files not kept", error);
    return { ready: [], bytes: {}, online: false };
  });
  client?.postMessage({ type: "kept", id, ...kept });
}

async function storeFiles(files, report) {
  const cache = await caches.open(FILES);
  const queue = [...files];
  const failed = new Set();
  let done = 0;
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const [path, hash, group] = next;
      const stored = await storeFile(cache, path, hash).catch(() => false);
      if (!stored) failed.add(group);
      done += 1;
      report(done, files.length);
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  return failed;
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
