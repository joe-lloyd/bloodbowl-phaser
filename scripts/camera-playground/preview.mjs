import { readFile, writeFile, mkdir, cp } from "node:fs/promises";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";

const evidence = resolve(process.argv[2] ?? "/tmp/camera-playground-evidence");
const destination = resolve(
  process.argv[3] ??
    join(homedir(), "htmlify/bloodbowl/camera-playground-2026-11-16")
);
const result = JSON.parse(
  await readFile(join(evidence, "results.json"), "utf8")
);
const openLink = execFileSync(
  "node",
  [
    join(
      homedir(),
      "Projects/MyProjects/HomeLab/old-mac/htmlify/open-link.mjs"
    ),
    destination,
  ],
  { encoding: "utf8" }
).trim();
await mkdir(join(destination, "evidence"), { recursive: true });
await cp(evidence, join(destination, "evidence"), { recursive: true });
const image = (await readFile(join(evidence, "1440-stadium.png"))).toString(
  "base64"
);
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Camera playground preview</title>
<style>
*{box-sizing:border-box}.answer{font-size:17px;line-height:1.5;margin:0 0 12px}p{font-size:13px;line-height:1.6;margin:0 0 12px}.quiet{color:var(--muted-foreground)}img{display:block;width:100%;border-radius:var(--radius);border:1px solid var(--border)}.compare{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;margin:12px 0}.policy{padding:12px;background:var(--card);border:1px solid var(--border);border-radius:var(--radius);font-size:12px;line-height:1.5}.policy b{display:block;font-size:13px;margin-bottom:4px}.policy:first-child{border-color:var(--primary)}.proof{display:flex;flex-wrap:wrap;gap:8px 18px;color:var(--muted-foreground);font-size:12px;margin-top:12px}a{color:var(--primary)}
</style>
<p class="answer">Try the camera policies in the stadium.</p>
<p class="quiet">Eight repeatable edge cases. Select players, move, block, toggle the tray, then compare End activation and End team turn.</p>
<img src="data:image/png;base64,${image}" alt="The actual Blood Bowl stadium with blue and red player sprites, the score bug, dice tray, and measured camera-centre guides.">
<div class="compare"><div class="policy"><b>A · Team reset</b>End activation frames eligible teammates. End turn widens, pauses, then frames the other team. This is the default.</div><div class="policy"><b>B · Keep zoom</b>End activation only pans. Turn handoff can zoom. Compare this with A when a carrier is isolated.</div><div class="policy"><b>C · Fixed overview</b>After opening, automatic changes only pan. Figures stay smaller, with a steadier scale.</div></div>
<div class="proof"><span>${result.checks} browser checks</span><span>${result.invariantSamples.toLocaleString("en-US")} animation-frame samples</span><span>Activation zoom delta ${result.maxZoomDelta}</span></div>
<p class="quiet" style="margin-top:12px">Desktop 1440 × 1000 and phone 390 × 844. Production camera unchanged. This renderer reuses the game art and projection; match rules and Phaser camera code stay outside the prototype.</p>
<p><a href="${openLink}">Open the full interactive playground</a></p></html>`;
await writeFile(join(destination, "inline-preview.html"), html);
const standalone = html
  .replace(
    "<style>",
    "<style>:root{color-scheme:dark;--background:#0c1015;--foreground:#e4e9ef;--muted-foreground:#9aaaba;--card:#141b23;--border:#2a3542;--primary:#e2bd71;--radius:9px}body{background:var(--background);color:var(--foreground);font-family:system-ui;max-width:960px;margin:30px auto;padding:0 16px}"
  )
  .replace(`href="${openLink}"`, 'href="./index.html"');
await writeFile(join(destination, "preview.html"), standalone);
process.stdout.write(`Preview: ${join(destination, "inline-preview.html")}\n`);
