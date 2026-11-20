import { formatPlayerName, generatePlayerName, nameBookFor } from "./names.js";

const TEAMS = [
  { name: "Crimson and black, the default", kit1: 0x8b0000, kit2: 0x000000 },
  { name: "Bone and crimson", kit1: 0xe6dcc8, kit2: 0x8b0000 },
  { name: "Royal purple and gold", kit1: 0x4b1f6f, kit2: 0xd4a017 },
  { name: "Midnight and silver", kit1: 0x1d2a4a, kit2: 0xc0c4cc },
];
const POSITIONS = [
  { key: "thrall", label: "Thrall Lineman", model: "thrall", stats: [6, 3, "3+", "4+", "8+"], cost: 40 },
  { key: "thrower", label: "Vampire Thrower", model: "vampire_thrower", stats: [6, 4, "2+", "2+", "9+"], cost: 110 },
  { key: "blitzer", label: "Vampire Blitzer", model: "vampire_blitzer", stats: [6, 4, "2+", "4+", "9+"], cost: 110 },
  { key: "runner", label: "Vampire Runner", model: "vampire_runner", stats: [8, 3, "2+", "3+", "8+"], cost: 100 },
];
const CYCLE = { idle: 1.35, run: 0.8, cheer: 1.0 };
const HOLD = 0.6;
const STAT_NAMES = ["MA", "ST", "AG", "PA", "AV"];

const state = { team: 0, mode: "ramp", speed: 1 };
const views = new Set();
let data;

const hex = (n) => [(n >> 16) & 255, (n >> 8) & 255, n & 255];
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const el = (tag, attrs = {}, ...kids) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null) node.append(kid);
  return node;
};
const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      return;
    }
  },
};

function rampStops(c) {
  return [
    [0.0, mix(c, [20, 12, 26], 0.8)],
    [0.5, mix(c, [34, 18, 48], 0.45)],
    [0.78, c],
    [1.0, mix(c, [255, 238, 216], 0.38)],
  ];
}

function rampAt(stops, v) {
  for (let i = 1; i < stops.length; i++) {
    const [t1, c1] = stops[i];
    const [t0, c0] = stops[i - 1];
    if (v <= t1) return mix(c0, c1, (v - t0) / (t1 - t0));
  }
  return stops[stops.length - 1][1];
}

const images = new Map();
function image(src) {
  if (!images.has(src)) {
    images.set(src, new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    }));
  }
  return images.get(src);
}

const rows = new Map();
function layerRow(entry, img, anim, layer, colour, mode) {
  const key = `${entry.src}|${anim}|${layer}|${colour ?? "-"}|${mode}`;
  if (rows.has(key)) return rows.get(key);
  const a = entry.anims[anim];
  const r = a.rows[layer];
  const w = entry.w * a.frames;
  const canvas = el("canvas");
  canvas.width = w;
  canvas.height = entry.h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, r * entry.h, w, entry.h, 0, 0, w, entry.h);
  if (colour) tintCanvas(ctx, w, entry.h, colour, mode);
  rows.set(key, canvas);
  return canvas;
}

function tintCanvas(ctx, w, h, colour, mode) {
  const im = ctx.getImageData(0, 0, w, h);
  const px = im.data;
  let hi = 1;
  for (let i = 0; i < px.length; i += 4) if (px[i + 3]) hi = Math.max(hi, px[i]);
  const stops = rampStops(colour);
  for (let i = 0; i < px.length; i += 4) {
    if (!px[i + 3]) continue;
    const out = mode === "ramp" ? rampAt(stops, px[i] / hi) : colour.map((c, k) => Math.round((px[i + k] * c) / 255));
    px[i] = out[0];
    px[i + 1] = out[1];
    px[i + 2] = out[2];
  }
  ctx.putImageData(im, 0, 0);
}

function frameAt(anim, frames, t) {
  const cycle = CYCLE[anim];
  if (cycle) return Math.floor(((t / cycle) % 1) * frames);
  const play = frames / 10;
  const local = t % (play + HOLD);
  return Math.min(frames - 1, Math.floor(local * 10));
}

function sprite(opts) {
  const canvas = el("canvas");
  const view = { canvas, opts, frame: -1, img: null };
  canvas.width = opts.entry.w * opts.scale;
  canvas.height = opts.entry.h * opts.scale;
  canvas.title = opts.title ?? "";
  image(opts.entry.src).then((img) => {
    view.img = img;
    view.frame = -1;
  });
  views.add(view);
  return canvas;
}

function drawView(view, t) {
  const { entry, scale } = view.opts;
  const anim = entry.anims[view.opts.anim] ? view.opts.anim : "idle";
  const a = entry.anims[anim];
  const f = frameAt(anim, a.frames, t);
  const key = `${f}|${anim}|${tintKey(view)}`;
  if (!view.img || key === view.key) return;
  view.key = key;
  const ctx = view.canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, view.canvas.width, view.canvas.height);
  const tints = view.opts.tints();
  const mode = view.opts.mode ? view.opts.mode() : state.mode;
  for (const layer of ["base", "kit1", "kit2"]) {
    if (a.rows[layer] === undefined) continue;
    const row = layerRow(entry, view.img, anim, layer, layer === "base" ? null : tints[layer], mode);
    ctx.drawImage(row, f * entry.w, 0, entry.w, entry.h, 0, 0, entry.w * scale, entry.h * scale);
  }
}

function tintKey(view) {
  const t = view.opts.tints();
  const mode = view.opts.mode ? view.opts.mode() : state.mode;
  return `${mode}|${t.kit1}|${t.kit2}`;
}

function tick(now) {
  const t = (now / 1000) * state.speed;
  for (const view of views) {
    if (view.canvas.isConnected) {
      view.seen = true;
      drawView(view, t);
    } else if (view.seen) {
      views.delete(view);
    }
  }
  requestAnimationFrame(tick);
}

function teamTints() {
  const team = TEAMS[state.team];
  return { kit1: hex(team.kit1), kit2: hex(team.kit2) };
}

function seg(options, get, set) {
  const box = el("div", { class: "seg" });
  const paint = () => {
    for (const b of box.children) b.setAttribute("aria-pressed", String(b.dataset.v === String(get())));
  };
  for (const [value, label] of options) {
    const b = el("button", { type: "button", onclick: () => { set(value); paint(); } }, label);
    b.dataset.v = String(value);
    box.append(b);
  }
  paint();
  return box;
}

function field(label, control) {
  return el("div", { class: "field" }, el("span", { class: "eyebrow" }, label), control);
}

function stage(...kids) {
  return el("div", { class: "stage pitch" }, ...kids);
}

function cell(label, body, note) {
  return el("div", { class: "cell" }, el("div", { class: "label" }, label), body, note ? el("div", { class: "note" }, note) : null);
}

function fitScale(entry, target) {
  return Math.max(1, Math.round(target / entry.h));
}

function rerender(section, build) {
  const body = section.querySelector(".body");
  body.replaceChildren(build());
}

function sectionShell(title, lede, controls, build, verdict) {
  const section = el("section", {},
    el("h2", {}, title),
    el("p", { class: "lede" }, lede),
    el("div", { class: "controls" }, ...controls),
    el("div", { class: "body" }),
    verdict ? el("div", { class: "verdict" }, ...verdict) : null,
  );
  section.refresh = () => rerender(section, build);
  section.refresh();
  return section;
}

const ANIMS = [["idle", "Idle"], ["run", "Run"], ["block", "Block"], ["pass", "Pass"], ["cheer", "Cheer"], ["fall", "Fall"]];
const positionOf = (key) => POSITIONS.find((x) => x.key === key);
const options = (position) => data.options[positionOf(position).model];
const defaults = (position) => Object.fromEntries(options(position).map(([name, , values]) => [name, values[0][0]]));
const lookKey = (position, look) => `${positionOf(position).model}__${options(position).map(([name]) => look[name]).join("-")}`;
const look = (set, position, choice) => data.sets[set][lookKey(position, { ...defaults(position), ...choice })];
const otherBody = (position) => options(position)[0][2][1];
const positionSeg = (local, refresh) => field("Position", seg(POSITIONS.map((p) => [p.key, p.label.replace("Vampire ", "")]), () => local.position, (v) => { local.position = v; refresh(); }));
const columnHead = (label, note) => el("div", { class: "rowhead" }, label, el("div", { class: "note", style: "color:var(--mute);text-transform:none;letter-spacing:0;font:400 12px/16px Barlow" }, note));

function defaultSection() {
  const local = { anim: "idle" };
  const columns = [
    ["As shipped", "base-d1", 4, "mul", "Game size, dither, multiply tint"],
    ["New, game size", "new-d1", 4, "ramp", "No dither, ramp tint"],
    ["New, 2× pixels", "new-d2", 2, "ramp", "No dither, ramp tint, fine details"],
  ];
  const build = () => el("div", {},
    el("div", { class: "grid cols-3" }, columns.map(([label, , , , note]) => columnHead(label, note))),
    POSITIONS.map((p) => el("div", {},
      el("div", { class: "rowhead" }, p.label),
      el("div", { class: "grid cols-3" }, columns.map(([label, set, zoom, mode]) => {
        const entry = data.sets[set][p.model];
        const make = (scale) => sprite({ entry, anim: local.anim, scale, tints: () => teamTints(), mode: () => mode, title: label });
        return el("div", { class: "cell" }, stage(make(1), make(zoom)));
      })),
    )),
  );
  let section;
  section = sectionShell(
    "1. The new default",
    "The recommendations together: no dither, the ramp tint, 2× pixels and a 12-frame run. The bodies are now clearly male or female, and at 2× each position gets fine details: rivets and a gorget gem on the blitzer, a brooch and belt studs on the thrower, wrist and knee bands on the runner, patches on the thrall. Each cell shows the real size, then zoomed to the same height.",
    [field("Animation", seg(ANIMS, () => local.anim, (v) => { local.anim = v; section.refresh(); }))],
    build,
    [el("b", {}, "Next: "), "the fine details are left out at game size on purpose, where they would only be single noisy pixels. Pick this and I re-render the Vampire atlases with it and switch the game's kit tint."],
  );
  return section;
}

function bodySection() {
  const local = { anim: "idle" };
  const build = () => el("div", { class: "grid cols-4" }, POSITIONS.map((p) => {
    const [, , values] = options(p.key)[0];
    return el("div", { class: "cell" },
      el("div", { class: "label" }, p.label),
      stage(...values.map(([value]) => sprite({ entry: look("looks-d2", p.key, { body: value }), anim: local.anim, scale: 2, tints: () => teamTints() }))),
      el("div", { class: "note" }, values.map(([, label]) => label).join(" · ")));
  }));
  let section;
  section = sectionShell(
    "2. Male and female",
    "Each position's own look next to the same look with the other body, at 2×. Women are narrower in the shoulders with wider hips, slimmer limbs and a bust; men are broader with heavier arms and a thicker neck. Hair follows the body unless the position has its own hair option.",
    [field("Animation", seg([["idle", "Idle"], ["run", "Run"]], () => local.anim, (v) => { local.anim = v; section.refresh(); }))],
    build,
  );
  return section;
}

function optionsSection(card) {
  const local = { position: "thrall" };
  const build = () => {
    const base = defaults(local.position);
    return el("div", {}, options(local.position).map(([name, label, values]) => el("div", {},
      el("div", { class: "rowhead" }, label),
      el("div", { class: "options" }, values.map(([value, vlabel]) => {
        const choice = { ...base, [name]: value };
        return el("button", { class: "m", type: "button", title: "Hire this look onto the player page", onclick: () => card.hire(local.position, choice) },
          sprite({ entry: look("looks-d2", local.position, choice), anim: "idle", scale: 2, tints: () => teamTints() }),
          el("span", { class: "note" }, vlabel));
      })),
    )));
  };
  let section;
  section = sectionShell(
    "3. Options per position",
    "Each position has its own options, not one list for everyone: the thrall's headgear, chest and feet, the runner's hair, legs and arms, the thrower's coat and cape, the blitzer's helmet, pads and cape. Each row changes one option from the position's own look. Click a figure to hire it onto the player page.",
    [positionSeg(local, () => section.refresh())],
    build,
    [el("b", {}, "Cost: "), "every combination is its own render, 132 looks for these four positions. In the game I would render looks per team on demand, or build the figure from separately rendered layers if the count grows."],
  );
  return section;
}

function randomLook(position) {
  return Object.fromEntries(options(position).map(([name, , values]) => [name, values[Math.floor(Math.random() * values.length)][0]]));
}

function newPlayer(position, number, choice = randomLook(position)) {
  return { id: `${Date.now()}-${number}`, number, position, look: choice, name: rollName(position, choice.body), custom: false };
}

function rollName(position, body) {
  const book = nameBookFor("Vampire", positionOf(position).label);
  return formatPlayerName(generatePlayerName(book, body === "f" ? "female" : "male"));
}

function startingRoster() {
  const lineup = ["blitzer", "thrower", "runner", "thrall", "thrall", "thrall", "thrall"];
  return lineup.map((position, i) => newPlayer(position, i + 1));
}

function validRoster(saved) {
  return Array.isArray(saved) && saved.length > 0 && saved.every((p) => positionOf(p.position) && data.sets["looks-d1"][lookKey(p.position, p.look ?? {})]);
}

function playerCard(card) {
  const saved = store.get("vampire-lab-roster-v4", null);
  const local = { roster: validRoster(saved) ? saved : startingRoster(), selected: 0, editing: false };
  const section = el("section", {});
  const save = () => store.set("vampire-lab-roster-v4", local.roster);
  const current = () => local.roster[local.selected];

  const cycler = (label, values, get, set) => {
    const step = (d) => {
      const i = values.findIndex(([v]) => v === get());
      set(values[(i + d + values.length) % values.length][0]);
      save();
      render();
    };
    const value = values.find(([v]) => v === get())?.[1] ?? "";
    return el("div", { class: "cycler" },
      el("span", { class: "k" }, label),
      el("button", { class: "btn icon", type: "button", "aria-label": `Previous ${label}`, onclick: () => step(-1) }, "‹"),
      el("span", { class: "v" }, value),
      el("button", { class: "btn icon", type: "button", "aria-label": `Next ${label}`, onclick: () => step(1) }, "›"),
    );
  };

  const nameBlock = (p) => {
    if (local.editing) {
      const input = el("input", { class: "name-input", value: p.name, "aria-label": "Player name", maxlength: "40" });
      const commit = () => {
        const v = input.value.trim();
        if (v) { p.name = v; p.custom = true; }
        local.editing = false;
        save();
        render();
      };
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") { local.editing = false; render(); }
      });
      queueMicrotask(() => { input.focus(); input.select(); });
      return el("div", { class: "name-row" }, input, el("button", { class: "btn gold", type: "button", onclick: commit }, "Save"));
    }
    return el("div", { class: "name-row" },
      el("span", { class: "name" }, `#${p.number} ${p.name}`),
      el("button", { class: "btn", type: "button", onclick: () => { local.editing = true; render(); } }, "Rename"),
      el("button", { class: "btn", type: "button", onclick: () => { p.name = rollName(p.position, p.look.body); p.custom = false; save(); render(); } }, "New name"),
    );
  };

  const portrait = (p) => {
    const entry = data.sets["looks-d2"][lookKey(p.position, p.look)];
    const anim = p.anim ?? "idle";
    return el("div", { class: "portrait" },
      el("div", { class: "stage" }, sprite({ entry, anim, scale: fitScale(entry, 280), tints: () => teamTints() })),
      cycler("Animation", [["idle", "Idle"], ["run", "Run"]], () => anim, (v) => { p.anim = v; }),
      options(p.position).map(([name, label, values]) => cycler(label, values, () => p.look[name], (v) => {
        p.look[name] = v;
        if (name === "body" && !p.custom) p.name = rollName(p.position, v);
      })),
    );
  };

  const rosterList = () => el("div", {},
    el("h3", {}, "Roster, Sevens"),
    el("div", { class: "roster" }, local.roster.map((p, i) => {
      const entry = data.sets["looks-d1"][lookKey(p.position, p.look)];
      return el("button", { type: "button", class: i === local.selected ? "on" : "", onclick: () => { local.selected = i; local.editing = false; render(); } },
        el("span", { class: "num" }, String(p.number)),
        sprite({ entry, anim: "idle", scale: 1, tints: () => teamTints() }),
        el("span", { class: "who" }, el("b", {}, p.name), el("span", {}, positionOf(p.position).label)));
    })),
    el("div", { class: "hire" },
      POSITIONS.map((pos) => el("button", { class: "btn", type: "button", onclick: () => card.hire(pos.key) }, `Hire ${pos.label.replace("Vampire ", "")}`)),
      el("button", { class: "btn blood", type: "button", onclick: () => { local.roster = startingRoster(); local.selected = 0; save(); render(); } }, "New team"),
    ),
  );

  const render = () => {
    const p = current();
    const pos = positionOf(p.position);
    section.replaceChildren(
      el("h2", {}, "4. Player page"),
      el("p", { class: "lede" }, "A mock of the player detail page: the portrait at 2×, the roster at game size. Hiring rolls a name from the position's name book and a random look. Each position shows only its own options. Changing the body rolls a fitting first name unless you renamed the player."),
      el("div", { class: "card" },
        portrait(p),
        el("div", {},
          el("div", { class: "eyebrow" }, `${pos.label} · Level 0 · The Grave Lords`),
          nameBlock(p),
          el("div", { class: "stats" }, pos.stats.map((v, i) => el("div", { class: "stat" }, el("b", {}, String(v)), el("span", {}, STAT_NAMES[i])))),
          rosterList(),
        ),
      ),
    );
  };

  card.hire = (position, choice) => {
    const number = Math.max(0, ...local.roster.map((p) => p.number)) + 1;
    local.roster.push(newPlayer(position, number, choice ? { ...choice } : randomLook(position)));
    local.selected = local.roster.length - 1;
    save();
    render();
    section.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  render();
  return section;
}

function topBar(sections) {
  const teams = document.getElementById("teams");
  const paint = () => [...teams.children].forEach((b, i) => b.setAttribute("aria-pressed", String(i === state.team)));
  TEAMS.forEach((team, i) => {
    const [a, b] = [team.kit1, team.kit2].map((c) => `#${c.toString(16).padStart(6, "0")}`);
    teams.append(el("button", { class: "swatch", type: "button", title: team.name, "aria-label": team.name, onclick: () => { state.team = i; paint(); } },
      el("i", { style: `background:${a}` }), el("i", { style: `background:${b}` })));
  });
  paint();
  document.getElementById("tint-mode").replaceWith(seg([["mul", "Multiply, today"], ["ramp", "Ramp, proposed"]], () => state.mode, (v) => { state.mode = v; }));
  document.getElementById("speed").addEventListener("input", (e) => { state.speed = Number(e.target.value); });
  return sections;
}

async function main() {
  const response = await fetch("data.json");
  data = await response.json();
  const card = {};
  const player = playerCard(card);
  const sections = [defaultSection(), bodySection(), optionsSection(card), player];
  topBar(sections);
  document.getElementById("app").replaceChildren(...sections);
  requestAnimationFrame(tick);
}

main().catch((err) => {
  document.getElementById("app").replaceChildren(el("div", { class: "loading" }, `Could not load the lab: ${err.message}`));
});
