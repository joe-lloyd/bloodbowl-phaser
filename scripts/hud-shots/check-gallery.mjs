/**
 * Loads every HUD gallery variant and reports the ones that render nothing
 * or log errors. Screenshots each to OUT (default /tmp/hud-gallery).
 *
 *   node scripts/hud-shots/check-gallery.mjs http://127.0.0.1:4310/
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://127.0.0.1:4310/";
const out = process.env.OUT ?? "/tmp/hud-gallery";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

await page.goto(base);
const ids = await page.$$eval("iframe[src^='?v=']", (frames) =>
  frames.map((f) => f.getAttribute("src").slice(3))
);
await page.screenshot({ path: `${out}/_index.png` });

let failures = 0;
for (const id of ids) {
  const errors = [];
  const onError = (msg) => {
    if (
      msg.type() === "error" &&
      !/Failed to load resource|404/.test(msg.text())
    )
      errors.push(msg.text());
  };
  page.on("console", onError);
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${base}?v=${id}`);
  await page.waitForTimeout(
    id.startsWith("tray") ? 2500 : id === "coin-result" ? 2200 : 700
  );
  const text = await page.evaluate(
    () => document.getElementById("root")?.innerText.trim() ?? ""
  );
  const stage = await page.$("#root > div");
  await (stage ?? page).screenshot({ path: `${out}/${id}.png` });
  page.off("console", onError);
  page.removeAllListeners("pageerror");
  const empty = text.length === 0 && !id.startsWith("tray");
  if (empty || errors.length) {
    failures++;
    console.log(`FAIL ${id}${empty ? " (renders no text)" : ""}`);
    errors.slice(0, 3).forEach((e) => console.log(`   ${e.slice(0, 200)}`));
  } else {
    console.log(`ok   ${id}`);
  }
}
await browser.close();
console.log(`${ids.length - failures}/${ids.length} variants render cleanly`);
process.exit(failures ? 1 : 0);
