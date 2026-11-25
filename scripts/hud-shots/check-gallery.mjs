/**
 * Loads every UI gallery variant at desktop and phone size and reports the
 * ones that render nothing, miss their own component, log errors or miss a
 * file. Then it uses the controls that once broke, and reports drift boxes
 * that found nothing to cut out at either size. Screenshots go to OUT
 * (default /tmp/ui-gallery). ONLY=a,b keeps the ids that contain a or b,
 * ONLY=drift checks the drift section alone and ONLY=use the controls.
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

const testId = (id) => `[data-testid="${id}"]`;
const EXPECTED = [
  [/^page-library-loading/, ".hud-page [role='status']"],
  [/^page-sign-in/, testId("sign-in-dialog")],
  [/^page-/, ".hud-page :is(h1, h2, h3, p)"],
  [/^block-(buttons|panels|dialogs|bits|forms|header|type|colours)/, "[data-sheet]"],
  [/^(block|confirm|reroll|reaction|bite|foul|apoth|follow|push|interc|sent|other-coach|inducement-(choice|wizard))/, "[data-decision-dialog], [data-testid='other-coach-prompt']"],
  [/^inducement-panel/, "text=gold remaining"],
  [/^kickoff-table/, testId("kickoff-table-dialog")],
  [/^weather/, testId("weather-dialog")],
  [/^coin/, "text=/coin toss/i"],
  [/^kickoff-(result)/, testId("announcement")],
  [/^kickoff-(?!aim)/, testId("kickoff-todo")],
  [/^setup/, testId("setup-controls")],
  [/^(announce|waiting-touchdown)/, testId("announcement")],
  [/^turnover/, testId("turnover-moment")],
  [/^(tray|banner)/, testId("dice-tray")],
  [/^log/, testId("dice-log")],
  [/^menu-(?!none)/, testId("player-action-menu")],
  [/^action-plan/, testId("action-plan")],
  [/^results/, "text=/full time/i"],
  [/^half-time/, testId("half-time-card")],
  [/^catch-up/, testId("turn-catch-up")],
  [/^connection/, testId("connection-banner")],
  [/^waiting-banner/, testId("waiting-banner")],
  [/^refusal/, testId("refusal-notice")],
  [/^options/, "[aria-haspopup='menu'][aria-expanded='true']"],
  [/^loading/, "text=/filling the stands/i"],
];

async function missingComponent(page, id) {
  const selector = EXPECTED.find(([pattern]) => pattern.test(id))?.[1];
  if (!selector) return [];
  const shown = (await page.locator(selector).filter({ visible: true }).count()) > 0;
  return shown ? [] : [`${selector} is not on screen`];
}

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
    problems.push(...(await missingComponent(page, id)));
    const text = await page.evaluate(() => document.body.innerText.trim());
    if (!text) problems.push("renders no text");
    await page.screenshot({
      path: `${out}/${id}-${size}.png`,
      fullPage: true,
    });
    report(`${id} ${size}`, problems);
    await page.close();
  }

const press = (name) => (page) =>
  page.getByRole("button", { name }).first().click();
const USES = [
  ["page-menu", press("Teams"), "text=Create New Team"],
  ["page-menu", press("Leagues"), "text=Founders League"],
  ["page-library-failed", press("Back to Menu"), "text=Play Local"],
  ["page-menu-signed-in", press("Sign out"), "text=Sign in"],
  ["page-select", async (page) => {
    const teams = page.locator("button[aria-pressed]", { hasText: "Founders" });
    await teams.filter({ hasText: "Human" }).first().click();
    await teams.filter({ hasText: "Orc" }).last().click();
    await press(/Start Game/)(page);
  }, "text=Not in the gallery"],
  ["coin-online-ready", press(/ready/i), "text=/wins the toss/i"],
  ["coin-online-guest", press(/ready/i), "text=/wins the toss/i"],
  ["coin-online-won", press("Kick"), null, "text=/coin toss/i"],
  ["clock-running", press(/Timeout,/), "text=Resume"],
  ["results", press(/Continue to main menu/i), "text=Play Local"],
];

if (!only || only === "use")
  for (const [size, viewport] of Object.entries(SIZES))
    for (const [id, use, then, gone] of USES) {
      checked++;
      const problems = [];
      const page = await openPage(viewport, problems);
      await page.goto(`${base}?v=${id}&size=${size}`);
      await page.waitForTimeout(1500);
      await use(page)
        .then(() =>
          gone
            ? page.locator(gone).waitFor({ state: "hidden", timeout: 9000 })
            : page.locator(then).first().waitFor({ timeout: 15000 })
        )
        .catch((e) => problems.push(String(e).split("\n")[0]));
      const text = await page.evaluate(() => document.body.innerText.trim());
      if (!text) problems.push("went blank");
      await page.screenshot({ path: `${out}/use-${id}-${size}.png` });
      report(`use ${id} ${size}`, problems);
      await page.close();
    }

async function checkDrift(size) {
  await index.getByRole("button", { name: new RegExp(size, "i") }).click();
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
    await box.screenshot({ path: `${out}/drift-${id}-${size}.png` });
    report(
      `drift ${id} ${size}`,
      missing.map((label) => `${label} was not found`)
    );
  }
}

if (!only || only === "drift") {
  for (const size of Object.keys(SIZES)) await checkDrift(size);
  report("index", errors);
}

await browser.close();
console.log(`${checked - failures}/${checked} checks pass`);
process.exit(failures ? 1 : 0);
