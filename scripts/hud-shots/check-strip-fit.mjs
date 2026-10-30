/**
 * Checks that the match strip fits inside its bar at 1280x720 and
 * 1920x1080: no flap runs past the bar, no text is cut, and the clock shows
 * one countdown. Screenshots each case to OUT (default /tmp/strip-fit).
 *
 *   pnpm gallery --port 4311 &
 *   node scripts/hud-shots/check-strip-fit.mjs http://127.0.0.1:4311/
 *
 * Exits 1 on any failure.
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://127.0.0.1:4311/";
const out = process.env.OUT ?? "/tmp/strip-fit";
mkdirSync(out, { recursive: true });

const CASES = ["clock-strip-crowded", "clock-strip-away", "clock-low"];
const VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
];

const browser = await chromium.launch();
let failures = 0;
for (const viewport of VIEWPORTS) {
  const page = await browser.newPage({ viewport });
  for (const id of CASES) {
    await page.goto(`${base}?v=${id}`);
    await page.waitForSelector('[data-testid="match-strip-bar"]');
    await page.waitForTimeout(600);
    const report = await page.evaluate(() => {
      const bar = document.querySelector('[data-testid="match-strip-bar"]');
      const box = bar.getBoundingClientRect();
      const problems = [];
      // A node its own overflow-hidden parent hides on purpose, such as a
      // weather effect wrapped onto a hidden line, is not drawn at all
      const hiddenByParent = (node) => {
        for (let p = node.parentElement; p && p !== bar; p = p.parentElement) {
          const style = getComputedStyle(p);
          if (style.overflow === "visible") continue;
          const pr = p.getBoundingClientRect();
          const r = node.getBoundingClientRect();
          if (r.top >= pr.bottom - 1 || r.bottom <= pr.top + 1) return true;
        }
        return false;
      };
      for (const node of bar.querySelectorAll("*")) {
        const r = node.getBoundingClientRect();
        if (r.width === 0 || r.height === 0 || hiddenByParent(node)) continue;
        const style = getComputedStyle(node);
        if (style.position === "absolute" && style.clip !== "auto") continue;
        const label = `${node.tagName.toLowerCase()} "${(node.textContent ?? "").trim().slice(0, 40)}"`;
        if (r.left < box.left - 1 || r.right > box.right + 1)
          problems.push(`${label} runs past the bar`);
        if (r.top < box.top - 1 || r.bottom > box.bottom + 1)
          problems.push(`${label} hangs out of the bar`);
        const clips =
          style.textOverflow === "ellipsis" || style.overflowX !== "visible";
        if (clips && node.scrollWidth > node.clientWidth + 1)
          problems.push(`${label} is cut`);
      }
      // The turn countdown as drawn: no screen-reader text, no timeout bank
      const clock = bar.querySelector('[data-testid="match-strip-clock"]');
      const drawn = clock?.cloneNode(true);
      drawn?.querySelectorAll(".sr-only, button").forEach((n) => n.remove());
      const countdowns =
        (drawn?.textContent ?? "").match(/\d+:\d\d|\d+s\b|seconds left/g) ?? [];
      const text = (clock?.innerText ?? "").replace(/\s+/g, " ").trim();
      return { problems, text, countdowns };
    });
    const name = `strip-${id}-${viewport.width}x${viewport.height}`;
    const strip = await page.$('[data-testid="match-strip"]');
    const shotBox = await strip.boundingBox();
    await page.screenshot({
      path: `${out}/${name}.png`,
      clip: {
        x: Math.max(0, shotBox.x - 40),
        y: 0,
        width: Math.min(viewport.width, shotBox.width + 80),
        height: shotBox.y + shotBox.height + 40,
      },
    });
    if (report.countdowns.length > 1)
      report.problems.push(
        `clock shows ${report.countdowns.length} countdowns: "${report.text}"`
      );
    console.log(
      `${report.problems.length ? "FAIL" : "ok  "} ${name}: "${report.text}"`
    );
    for (const problem of report.problems) console.log(`     ${problem}`);
    failures += report.problems.length ? 1 : 0;
  }
  await page.close();
}
await browser.close();
process.exit(failures ? 1 : 0);
