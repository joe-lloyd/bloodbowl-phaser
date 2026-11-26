import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseLayeredModels, type LayerData, type LayeredModel } from "../../src/boundary/layeredArt";
import { buildLookAtlas, type LookAtlas } from "../../src/game/presentation/layered/lookAtlas";
import { randomAppearance, resolveLook, seededRandom } from "../../src/game/presentation/layered/looks";
import manifest from "../../src/game/presentation/spriteManifest.json";
import type { PlayerAppearance } from "../../src/types/Player";
import { encodePng, readLayerFiles, type RgbaImage } from "./spriteFiles";

const SPRITES = "public/sprites/bloodbowl";
const COLORS = { primary: 0x8b1a1a, secondary: 0xe8e0c8 };
const RANDOM_LOOKS = 2;

interface Look {
  readonly label: string;
  readonly appearance: PlayerAppearance | undefined;
}

interface Checked {
  readonly model: string;
  readonly look: string;
  readonly frames: number;
  readonly differing: number;
  readonly before: string;
  readonly after: string;
}

function looksFor(model: string, art: LayeredModel): Look[] {
  const [bodyOption, ...parts] = art.layered.options;
  const bodies: Look[] = bodyOption
    ? bodyOption[2].map(([body]) => ({ label: body, appearance: { [bodyOption[0]]: body } }))
    : [{ label: "default", appearance: undefined }];
  const extra = parts.length === 0 ? 0 : RANDOM_LOOKS;
  const random = Array.from({ length: extra }, (_, i) => {
    const appearance = randomAppearance(art.layered.options, seededRandom(`${model}:${String(i)}`));
    return { label: Object.values(appearance).join(" "), appearance };
  });
  return [...bodies, ...random];
}

function idleNames(art: LayeredModel): string[] {
  return Array.from({ length: art.animations["idle"] ?? 0 }, (_, i) => `idle/se/${String(i)}`);
}

function draw(art: LayeredModel, look: Look, read: (body: string, name: string) => LayerData): LookAtlas {
  const resolved = resolveLook(art, look.appearance);
  const layer = (name: string) => read(resolved.body, name);
  return buildLookAtlas({
    look: { layers: resolved.layers.map(layer), shades: resolved.shades.map(layer) },
    names: idleNames(art),
    size: art.frame,
    palette: art.layered.palette,
    colors: COLORS,
  });
}

function framePixels(atlas: LookAtlas, name: string): Buffer | null {
  const rect = atlas.frames[name];
  const page = rect ? atlas.pages[rect.page] : undefined;
  if (!rect || !page) return null;
  const rows = Array.from({ length: rect.h }, (_, row) => {
    const start = ((rect.y + row) * page.width + rect.x) * 4;
    return Buffer.from(page.pixels.subarray(start, start + rect.w * 4));
  });
  return Buffer.concat([Buffer.from(`${String(rect.w)}x${String(rect.h)}@${String(rect.sx)},${String(rect.sy)}`), ...rows]);
}

function differingPixels(before: LookAtlas, after: LookAtlas): number {
  const names = new Set([...Object.keys(before.frames), ...Object.keys(after.frames)]);
  let differing = 0;
  for (const name of names) {
    const a = framePixels(before, name);
    const b = framePixels(after, name);
    if (!a || !b) differing += Math.max(a?.length ?? 0, b?.length ?? 0) / 4;
    else if (!a.equals(b)) differing += a.reduce((sum, byte, i) => sum + (byte === b[i] ? 0 : 1), 0) || 1;
  }
  return differing;
}

function portrait(atlas: LookAtlas, name: string): RgbaImage {
  const rect = atlas.frames[name];
  const page = rect ? atlas.pages[rect.page] : undefined;
  if (!rect || !page) return { pixels: Buffer.alloc(4), width: 1, height: 1 };
  const side = Math.max(rect.w, rect.h) + 8;
  const left = Math.round((side - rect.w) / 2);
  const top = side - rect.h - 4;
  const pixels = Buffer.alloc(side * side * 4);
  for (let row = 0; row < rect.h; row += 1) {
    const start = ((rect.y + row) * page.width + rect.x) * 4;
    Buffer.from(page.pixels.subarray(start, start + rect.w * 4)).copy(pixels, ((top + row) * side + left) * 4);
  }
  return { pixels, width: side, height: side };
}

function checkModel(model: string, art: LayeredModel, out: string): Checked[] {
  const cache = new Map<string, LayerData>();
  const reader = (folder: (body: string) => string) => (body: string, name: string) => {
    const path = `${SPRITES}/${model}/layered/${folder(body)}/${name}`;
    const found = cache.get(path) ?? readLayerFiles(path);
    cache.set(path, found);
    return found;
  };
  const full = reader((body) => body);
  const small = reader((body) => `${body}/portrait`);
  return looksFor(model, art).map((look, index) => {
    const before = draw(art, look, full);
    const after = draw(art, look, small);
    const first = idleNames(art)[0] ?? "";
    const file = (side: string) => `${model}-${String(index)}-${side}.png`;
    writeFileSync(join(out, file("before")), encodePng(portrait(before, first)));
    writeFileSync(join(out, file("after")), encodePng(portrait(after, first)));
    return { model, look: look.label, frames: Object.keys(before.frames).length, differing: differingPixels(before, after), before: file("before"), after: file("after") };
  });
}

function card(item: Checked, assets: string): string {
  const status = item.differing === 0 ? "same" : `${String(item.differing)} px differ`;
  return `<figure class="${item.differing === 0 ? "ok" : "bad"}"><div class="pair"><img src="${assets}/${item.before}" alt="before"><img src="${assets}/${item.after}" alt="after"></div><figcaption><b>${item.model}</b><span>${item.look}</span><em>${status}</em></figcaption></figure>`;
}

function page(results: readonly Checked[], assets: string): string {
  const bad = results.filter((item) => item.differing > 0);
  const frames = results.reduce((sum, item) => sum + item.frames, 0);
  const models = new Set(results.map((item) => item.model)).size;
  const verdict = bad.length === 0 ? "Every portrait matches the old one exactly." : `${String(bad.length)} looks differ. They are listed first.`;
  const ordered = [...bad, ...results.filter((item) => item.differing === 0)];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Portrait check</title><style>
:root{color-scheme:dark;--bg:#111317;--card:#1b1e24;--line:#2c313a;--text:#e6e8ec;--dim:#9aa1ad;--ok:#5fbf7f;--bad:#ef5f5f}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,sans-serif;padding:24px 16px}
h1{font-size:22px;margin:0 0 8px}p{margin:4px 0;color:var(--dim)}.verdict{color:${bad.length === 0 ? "var(--ok)" : "var(--bad)"};font-weight:600;font-size:17px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px;margin-top:20px}
figure{margin:0;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:8px}figure.bad{border-color:var(--bad)}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:4px}.pair img{width:100%;image-rendering:pixelated;background:#23272f;border-radius:4px}
figcaption{display:flex;flex-direction:column;font-size:12px;margin-top:6px}figcaption span{color:var(--dim);overflow-wrap:anywhere}figcaption em{font-style:normal;color:var(--ok)}figure.bad em{color:var(--bad)}
</style></head><body><h1>Portrait check: old files against portrait files</h1>
<p class="verdict">${verdict}</p>
<p>${String(models)} models, ${String(results.length)} looks, ${String(frames)} idle frames compared pixel by pixel. Each card shows the old full-layer portrait on the left and the new portrait-file one on the right, in the same team colours.</p>
<p>Looks: every body, plus two random looks per model that has look options. Generated ${new Date().toISOString()} by <code>scripts/sprites/portrait_check.ts</code>.</p>
<div class="grid">${ordered.map((item) => card(item, assets)).join("")}</div></body></html>`;
}

const out = process.argv[2] ?? "portrait-check";
const assets = "portrait-check-assets";
mkdirSync(join(out, assets), { recursive: true });
const results = [...parseLayeredModels(manifest)].flatMap(([model, art]) => checkModel(model, art, join(out, assets)));
writeFileSync(join(out, "portrait-check.html"), page(results, assets));
const bad = results.filter((item) => item.differing > 0);
console.log(`${String(results.length)} looks checked, ${String(bad.length)} differ`);
for (const item of bad) console.log(`  ${item.model} ${item.look}: ${String(item.differing)} px`);
process.exitCode = bad.length === 0 ? 0 : 1;
