/**
 * Loads every UI gallery variant at desktop and phone size and reports the
 * ones that render nothing, log errors or miss a file. Then loads the index
 * and reports drift boxes that found nothing to cut out. Screenshots go to
 * OUT (default /tmp/ui-gallery). ONLY=a,b keeps the ids that contain
 * a or b, and ONLY=drift checks the drift section alone.
 *
 *   node scripts/hud-shots/check-gallery.mjs http://127.0.0.1:4310/
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://127.0.0.1:4310/";
const out = process.env.OUT ?? "/tmp/ui-gallery";
const only = process.env.ONLY ?? "";
const kept = (id) => !only || only.split(",").some((part) => id.includes(part));
const SIZES = {
  desktop: { width: 1280, height: 720 },
  phone: { width: 844, height: 390 },
};
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});

async function openPage(viewport, errors) {
  const page = await browser.newPage({ viewport });
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().includes("Failed to load"))
      errors.push(msg.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("response", (r) => {
    const { origin, pathname } = new URL(r.url());
    const ours = origin === new URL(base).origin && pathname !== "/favicon.ico";
    if (ours && r.status() >= 400) errors.push(`${r.status()} ${pathname}`);
  });
  return page;
}

const settle = (id) => {
  if (/^(coin|weather)/.test(id)) return 3600;
  if (/^(tray|banner|block-rolled|kickoff-table-r|page-player-spp)/.test(id))
    return 3000;
  return /^page|^results|^announce|^turnover/.test(id) ? 1400 : 900;
};

let failures = 0;
const errors = [];
const report = (id, problems) => {
  if (problems.length) failures++;
  console.log(`${problems.length ? "FAIL" : "ok  "} ${id}`);
  problems.slice(0, 3).forEach((e) => console.log(`   ${e.slice(0, 220)}`));
};

const index = await openPage({ width: 1500, height: 900 }, errors);
await index.goto(base);
const ids = (
  await index.getAttribute("[data-variants]", "data-variants")
).split(" ");
if (new Set(ids).size !== ids.length) throw new Error("two variants share an id");

let checked = 0;
for (const [size, viewport] of Object.entries(SIZES))
  for (const id of ids.filter(kept)) {
    checked++;
    const problems = [];
    const page = await openPage(viewport, problems);
    await page.goto(`${base}?v=${id}&size=${size}`);
    await page.waitForTimeout(settle(id));
    const text = await page.evaluate(() => document.body.innerText.trim());
    if (!text) problems.push("renders no text");
    await page.screenshot({
      path: `${out}/${id}-${size}.png`,
      fullPage: true,
    });
    report(`${id} ${size}`, problems);
    await page.close();
  }

if (!only || only === "drift") {
  for (const box of await index.$$("[data-drift]")) {
    checked++;
    await box.scrollIntoViewIfNeeded();
    const id = await box.getAttribute("data-drift");
    await index.waitForTimeout(3000);
    await index
      .waitForFunction(
        (drift) =>
          !document.querySelector(`[data-drift='${drift}'] [data-cut='no']`),
        id,
        { timeout: 25000 }
      )
      .catch(() => undefined);
    await index.waitForTimeout(1500);
    const missing = await box.$$eval("[data-cut='no']", (cuts) =>
      cuts.map((cut) => cut.closest("figure").innerText.split("\n")[0])
    );
    await box.screenshot({ path: `${out}/drift-${id}.png` });
    const problems = missing
      .filter((label) => !/^phone/i.test(label))
      .map((label) => `${label} was not found`);
    report(`drift ${id}`, problems);
  }
  report("index", errors);
}

await browser.close();
console.log(`${checked - failures}/${checked} checks pass`);
process.exit(failures ? 1 : 0);
