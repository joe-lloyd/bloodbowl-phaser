import { mkdir, readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const art = await readFile("public/favicon.svg", "utf8");
const inner = art.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#b8141d"/><g transform="translate(9.6 9.6) scale(0.7)">${inner}</g></svg>`;

await mkdir("public/icons", { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, svg] of [
  ["icon", art],
  ["maskable", maskable],
]) {
  for (const size of [192, 512]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<body style="margin:0;background:transparent">${svg.replace("<svg", `<svg width="${size}" height="${size}" style="display:block"`)}</body>`
    );
    await page.screenshot({
      path: `public/icons/${name}-${size}.png`,
      omitBackground: true,
    });
  }
}
await browser.close();
