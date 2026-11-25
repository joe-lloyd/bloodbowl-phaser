/**
 * Presses every enabled button of every UI gallery state, one fresh load per
 * press, and reports the presses that changed nothing and the buttons that
 * are disabled. ONLY=a,b keeps the ids that contain a or b, SIZE=phone uses
 * the phone layout. The report is JSON, for a person to read.
 *
 *   node scripts/hud-shots/sweep-gallery.mjs http://127.0.0.1:4310/ > out.json
 */
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://127.0.0.1:4310/";
const only = process.env.ONLY?.split(",") ?? [""];
const size = process.env.SIZE ?? "desktop";
const [width, height] = size === "phone" ? [844, 390] : [1280, 720];
const MOST = 14;
const FURNITURE =
  /^(⚙|A-|A\+|Log$|⤢|⛶|Dice$|Chat$|Match Options|Not in)/i;
const SETTLE = /^(coin-(result|computer)|weather-shown|tray|banner|block-rolled)/;

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});

async function load(id) {
  const page = await browser.newPage({
    viewport: { width, height },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  page.setDefaultTimeout(9000);
  await page.goto(`${base}?v=${id}&size=${size}`);
  await page.waitForTimeout(
    SETTLE.test(id) ? 3800 : id.startsWith("page") ? 1300 : 900
  );
  return page;
}

const buttons = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("button, [role='radio'], [role='tab']")]
      .map((button, index) => ({
        index,
        name: (button.innerText || button.ariaLabel || "").replace(/\s+/g, " "),
        disabled: button.disabled,
        filled: /bg-hud-(blood|gold)( |$)|bg-\[#2f7a3a\]/.test(button.className),
        shown: button.checkVisibility() && button.offsetWidth > 0,
      }))
      .filter((button) => button.shown)
  );

const look = (page, index) =>
  page.evaluate((at) => {
    const button = document.querySelectorAll(
      "button, [role='radio'], [role='tab']"
    )[at];
    window.sweepBox ??=
      button.closest("[data-hotkey-scope], .hud-slab, .hud-page, form") ??
      button;
    window.sweepButton ??= button;
    const box = window.sweepBox;
    const root = document.body.cloneNode(true);
    root.querySelectorAll("script, canvas").forEach((n) => n.remove());
    return {
      box: box.isConnected ? box.outerHTML : "gone",
      button: window.sweepButton.isConnected,
      root: root.innerText ?? "",
      full: document.body.innerText,
    };
  }, index);

async function press(id, button) {
  const page = await load(id);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 120)));
  page.on("dialog", (d) => void d.accept());
  try {
    await page.waitForFunction(
      ([at, name]) =>
        (
          document.querySelectorAll("button, [role='radio'], [role='tab']")[at]
            ?.innerText ?? ""
        )
          .replace(/\s+/g, " ")
          .startsWith(name),
      [button.index, button.name.slice(0, 8)]
    );
    const before = await look(page, button.index);
    await page.evaluate(
      (at) =>
        document
          .querySelectorAll("button, [role='radio'], [role='tab']")
          [at].click(),
      button.index
    );
    await page.waitForTimeout(1600);
    const after = await look(page, button.index);
    const boxed = before.box !== after.box;
    return {
      changed: boxed ? "yes" : before.full !== after.full ? "elsewhere" : "no",
      blank: after.full.trim() === "",
      errors,
    };
  } catch (e) {
    return { changed: "failed", errors: [String(e).slice(0, 120)] };
  } finally {
    await page.close();
  }
}

const start = await browser.newPage();
await start.goto(base);
const ids = (
  await start.getAttribute("[data-variants]", "data-variants")
).split(" ");
await start.close();

const rows = [];
for (const id of ids.filter((name) => only.some((o) => name.includes(o)))) {
  const page = await load(id);
  const all = (await buttons(page)).filter(
    (b) =>
      !FURNITURE.test(b.name) &&
      (!/^End Turn/i.test(b.name) || id === "menu-none")
  );
  await page.close();
  const seen = new Set();
  const chosen = all
    .filter((b) => !seen.has(b.name) && seen.add(b.name))
    .sort((a, b) => Number(b.filled) - Number(a.filled))
    .slice(0, MOST);
  for (const button of chosen) {
    const result = button.disabled
      ? { changed: "disabled" }
      : await press(id, button);
    const bad =
      result.changed !== "yes" || result.blank || result.errors?.length > 0;
    if (bad) {
      rows.push({ id, name: button.name, filled: button.filled, ...result });
      console.error(
        `${result.changed.padEnd(9)} ${button.filled ? "*" : " "} ${id} :: ${button.name.slice(0, 50)} ${result.errors?.join(" ") ?? ""}`
      );
    }
  }
  console.error(`done      ${id} ${chosen.length}`);
}
await browser.close();
console.log(JSON.stringify(rows, null, 1));
