import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const base = process.env.GALLERY_URL ?? "http://localhost:4395/";
const out = process.env.OUT ?? "steady-shots";
const SIZES = {
  desktop: { width: 1280, height: 720 },
  portrait: { width: 390, height: 844 },
  phone: { width: 844, height: 390 },
};
const ROLLS = [
  ["weather-waiting", /^roll weather$/i, /on to the coin toss/i],
  ["weather-online", /roll weather$/i, /on to the coin toss/i],
  ["kickoff-table", /^roll kick-off$/i, null],
  ["coin-start", /^flip coin$/i, /^receive$/i],
  ["coin-online-ready", /flip coin$/i, null],
];
const PANEL = "[data-testid$='-dialog'] > section:has([data-testid='roll-action'])";

mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader"] });
let failures = 0;

const boxes = (page) =>
  page.evaluate((panel) => {
    const root = document.querySelector(panel);
    if (!root) return null;
    const parts = [root, ...root.querySelectorAll("[data-testid$='-stage'], [data-testid='roll-action'], [data-testid$='-table']")];
    return parts.map((part) => {
      const { x, y, width, height } = part.getBoundingClientRect();
      return [x, y, width, height].map(Math.round).join(" ");
    });
  }, PANEL);

for (const [size, viewport] of Object.entries(SIZES))
  for (const [id, start, end] of ROLLS) {
    const page = await browser.newPage({ viewport });
    const layout = size === "desktop" ? "desktop" : "phone";
    await page.goto(`${base}?v=${id}&size=${layout}`);
    const button = page.locator(PANEL).getByRole("button", { name: start });
    await button.waitFor();
    await page.waitForTimeout(900);
    const seen = [await boxes(page)];
    const spill = await page.locator(PANEL).evaluate((el) => el.scrollHeight - el.clientHeight);
    await page.screenshot({ path: `${out}/${id}-${size}-1.png` });
    await button.click();
    for (let tick = 0; tick < 60; tick++) {
      await page.waitForTimeout(100);
      const now = await boxes(page);
      if (!now) break;
      seen.push(now);
      if (tick === 8) await page.screenshot({ path: `${out}/${id}-${size}-2.png` });
      if (now && tick === 45) await page.screenshot({ path: `${out}/${id}-${size}-3.png` });
    }
    const layouts = [...new Set(seen.map(String))];
    const ended = !end || (await page.locator(PANEL).getByRole("button", { name: end }).count()) > 0;
    const ok = layouts.length === 1 && spill <= 0 && ended;
    if (!ok) failures++;
    console.log(`${ok ? "ok  " : "FAIL"} ${id} ${size} frames=${seen.length} spill=${spill} ended=${ended}`);
    if (layouts.length > 1) console.log(layouts.join("\n"));
    await page.close();
  }
await browser.close();
process.exit(failures ? 1 : 0);
