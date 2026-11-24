import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
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
};
const BUNDLES = { one: await entryOf(), two: "index-Deploy02.js" };
let deploy = "one";

async function entryOf() {
  const page = await readFile(join(DIST, "index.html"), "utf8");
  return /assets\/(index-[\w-]{8}\.js)/.exec(page)[1];
}

async function deployedFile(file) {
  if (file === "index.html") {
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
  const path = new URL(request.url, ORIGIN).pathname;
  const send = async (file) => {
    const body = await deployedFile(file);
    response.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
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

const profile = await mkdtemp(join(tmpdir(), "bb-pwa-"));
const context = await chromium.launchPersistentContext(profile, { channel: "chromium" });
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
const cached = () =>
  page.evaluate(async () => {
    const out = {};
    for (const name of await caches.keys())
      out[name] = (await (await caches.open(name)).keys()).map((r) => r.url);
    return out;
  });

await page.goto(ORIGIN);
await page.evaluate(async () => {
  const old = await caches.open("bb-assets-v0");
  await old.put("/old", new Response("old"));
  await navigator.serviceWorker.ready;
});
await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

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

const before = await cached();
check(
  "only hashed build files and the page are cached",
  Object.values(before).flat().every((url) => /\/index\.html$|\/assets\/[^/]+-[\w-]{8}\.(js|css)$/.test(url)),
  JSON.stringify(before)
);
check(
  "the new bundle is cached",
  (before["bb-assets-v1"] ?? []).some((url) => url.endsWith(BUNDLES.two))
);

await page.evaluate(() => fetch("/assets/gone-AAAAAAAA.js"));
await page.waitForTimeout(300);
const after = await cached();
check("a missing chunk answered with HTML is not cached", !JSON.stringify(after).includes("gone-"));

await page.evaluate(async () => {
  const registration = await navigator.serviceWorker.getRegistration();
  await registration.unregister();
});
await page.goto(ORIGIN);
await page.evaluate(() => navigator.serviceWorker.ready);
await page.waitForTimeout(800);
check("an old cache is removed on activate", !("bb-assets-v0" in (await cached())));

server.closeAllConnections();
await new Promise((resolve) => server.close(resolve));
await page.reload();
await checkRuns("the game starts offline", "two");

await context.close();
await rm(profile, { recursive: true, force: true });
process.exit(failures.length ? 1 : 0);
