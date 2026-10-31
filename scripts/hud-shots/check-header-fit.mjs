/**
 * Checks that every PanelHeader in the HUD gallery stays on one line at
 * 1280x720. A header that wraps grows past its 40px row, which is how the
 * online dice log header looked before it was redesigned.
 *
 *   pnpm gallery:build
 *   python3 -m http.server 4312 -d dist-gallery &
 *   node scripts/hud-shots/check-header-fit.mjs http://127.0.0.1:4312/
 *
 * Exits 1 when any header is taller than one row.
 */
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://127.0.0.1:4312/";
const ROW = 40;

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(base);
const ids = await page.$$eval("iframe[src^='?v=']", (frames) =>
  frames.map((f) => f.getAttribute("src").slice(3))
);

let failures = 0;
let checked = 0;
for (const id of ids) {
  await page.goto(`${base}?v=${id}`);
  await page.waitForTimeout(800);
  const headers = await page.$$eval("[data-panel-header]", (rows) =>
    rows.map((row) => ({
      text: row.textContent.trim().slice(0, 40),
      width: Math.round(row.getBoundingClientRect().width),
      height: Math.round(row.getBoundingClientRect().height),
    }))
  );
  for (const header of headers) {
    checked += 1;
    if (header.height > ROW) {
      failures += 1;
      console.log(
        `FAIL ${id}: "${header.text}" is ${header.height}px tall at ${header.width}px wide`
      );
    }
  }
}
await browser.close();
console.log(`${checked - failures}/${checked} panel headers fit one row`);
// Measuring nothing means the gallery or the selector broke, not a pass
if (checked === 0) console.log("FAIL: no panel headers were measured");
process.exit(failures || checked === 0 ? 1 : 0);
