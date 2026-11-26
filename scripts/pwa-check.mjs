import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { chromium } from "@playwright/test";

const DIST = process.argv[2] ?? "dist";
const PORT = Number(process.argv[3] ?? 5399);
const ORIGIN = `http://localhost:${PORT}`;
const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".json": "application/json",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".mp3": "audio/mpeg",
};
const BUNDLES = { one: await entryOf(), two: "index-Deploy02.js" };
let deploy = "one";

async function entryOf() {
  const page = await readFile(join(DIST, "index.html"), "utf8");
  return /assets\/(index-[\w-]{8}\.js)/.exec(page)[1];
}

async function deployedFile(file) {
  if (file === "index.html" || file === "offline-manifest.json") {
    const page = await readFile(join(DIST, file), "utf8");
    return page.replaceAll(BUNDLES.one, BUNDLES[deploy]);
  }
  if (file.startsWith("assets/index-") && file.endsWith(".js")) {
    if (file !== `assets/${BUNDLES[deploy]}`) throw new Error("not in this deploy");
    const code = await readFile(join(DIST, "assets", BUNDLES.one), "utf8");
    return `document.documentElement.dataset.bundle="${deploy}";${code}`;
  }
  return readFile(join(DIST, file));
}

const server = createServer(async (request, response) => {
  const path = decodeURIComponent(new URL(request.url, ORIGIN).pathname);
  const send = async (file) => {
    const body = await deployedFile(file);
    response.writeHead(200, {
      "content-type": TYPES[extname(file)] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    response.end(body);
  };
  try {
    await send(path === "/" ? "index.html" : path.slice(1));
  } catch {
    await send("index.html");
  }
}).listen(PORT);

const failures = [];
const check = (name, passed, detail = "") => {
  console.log(`${passed ? "ok  " : "FAIL"} ${name} ${detail}`);
  if (!passed) failures.push(name);
};

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
const mounted = () =>
  page
    .getByRole("heading", { name: "BLOOD BOWL", exact: true })
    .waitFor({ timeout: 20_000 })
    .then(() => true, () => false);
const running = () => page.locator("html").getAttribute("data-bundle");
const checkRuns = async (name, bundle) => {
  const up = await mounted();
  const now = await running();
  check(name, up && now === bundle, `mounted ${up}, bundle ${now}`);
};
const checkControlled = async (name) => {
  const controlled = await page
    .waitForFunction(() => navigator.serviceWorker.controller?.state === "activated", null, {
      timeout: 20_000,
    })
    .then(() => true, () => false);
  check(name, controlled);
};
const cached = () =>
  page.evaluate(async () => {
    const out = {};
    for (const name of await caches.keys())
      out[name] = (await (await caches.open(name)).keys()).map((r) => r.url);
    return out;
  });

await page.goto(ORIGIN);
await checkControlled("the worker takes control");

const cdp = await context.newCDPSession(page);
const { errors, data } = await cdp.send("Page.getAppManifest");
const manifest = JSON.parse(data);
check("manifest has no errors", errors.length === 0, JSON.stringify(errors));
check("manifest display", manifest.display === "fullscreen" && manifest.display_override.includes("standalone"));
const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
check("no installability errors", installabilityErrors.length === 0, JSON.stringify(installabilityErrors));

await page.reload();
await checkRuns("the first deploy runs", "one");
await page.waitForTimeout(1500);
deploy = "two";
await page.reload();
await checkRuns("a new deploy's bundle runs on the next load", "two");
await page.goto(`${ORIGIN}/leagues`);
check("a deep link runs the new bundle", (await running()) === "two");
await page.waitForTimeout(800);

const offlineManifest = JSON.parse(await deployedFile("offline-manifest.json"));
const coreUrls = Object.keys(offlineManifest.core).map((path) => new URL(path, ORIGIN).href);
const cachedUrls = async () => new Set(Object.values(await cached()).flat());
const missingCore = async () => {
  const stored = await cachedUrls();
  return coreUrls.filter((url) => !stored.has(url));
};
let missing = await missingCore();
for (let tries = 0; missing.length > 0 && tries < 120; tries += 1) {
  await page.waitForTimeout(500);
  missing = await missingCore();
}
const before = await cachedUrls();
check("every core file of the new deploy is cached", missing.length === 0, JSON.stringify(missing.slice(0, 5)));
check("the new bundle is cached", before.has(`${ORIGIN}/assets/${BUNDLES.two}`));
check("the old bundle is swept", !before.has(`${ORIGIN}/assets/${BUNDLES.one}`));
check(
  "no player art is cached before a team asks for it",
  ![...before].some((url) => /\/sprites\/bloodbowl\/(?!sideline_)/.test(url))
);

await page.evaluate(() => fetch("/assets/gone-AAAAAAAA.js"));
await page.waitForTimeout(300);
const after = await cached();
check("a missing chunk answered with HTML is not cached", !JSON.stringify(after).includes("gone-"));

await page.evaluate(async () => {
  const old = await caches.open("bb-assets-v0");
  await old.put("/old", new Response("old"));
  const registration = await navigator.serviceWorker.getRegistration();
  await registration.unregister();
});
await page.goto(ORIGIN);
await checkControlled("a fresh worker takes control");
check("an old cache is removed on activate", !("bb-assets-v0" in (await cached())));

server.closeAllConnections();
await new Promise((resolve) => server.close(resolve));
await page.reload();
await checkRuns("the game starts offline", "two");
const offlineFiles = await page.evaluate(async () => {
  const art = await fetch("/venues/street/base.webp").then((response) => response.ok, () => false);
  const faces = await document.fonts.load("700 16px 'Barlow Condensed'").catch(() => []);
  return { art, font: faces.length > 0 && faces.every((face) => face.status === "loaded") };
});
check("venue art loads offline", offlineFiles.art);
check("the UI font loads offline", offlineFiles.font);

await context.close();
await browser.close();
process.exit(failures.length ? 1 : 0);
