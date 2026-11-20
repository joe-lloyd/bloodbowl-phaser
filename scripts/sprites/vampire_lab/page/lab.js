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
const GENDERS = [["m", "Male"], ["f", "Female"]];
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
  for (const kid of kids.flat()) if (kid != null) node.append(kid);
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
const HELMS = [["bare", "Bare head"], ["cap", "Skull cap"], ["winged", "Winged helm"]];
const PADS = [["none", "No pads"], ["left", "Left pad"], ["right", "Right pad"], ["both", "Both pads"]];
const positionSeg = (local, refresh) => field("Position", seg(POSITIONS.map((p) => [p.key, p.label.replace("Vampire ", "")]), () => local.position, (v) => { local.position = v; refresh(); }));
const modelOf = (position) => POSITIONS.find((x) => x.key === position).model;
const lookKey = (position, look) => `${modelOf(position)}__${look.gender}-${look.helm}-${look.pads}`;

function sharpenSection() {
  const local = { anim: "idle", zoom: 4, density: 1 };
  const columns = [
    ["As shipped", "base", "Three tones per material, checker dither where tones meet"],
    ["No dither", "nodither", "Same three tones, hard edges between them"],
    ["Two tones", "twotone", "Dark and mid only, no dither"],
  ];
  const build = () => el("div", {},
    el("div", { class: "grid cols-3" }, columns.map(([label, , note]) => el("div", { class: "rowhead" }, label, el("div", { class: "note", style: "color:var(--mute);text-transform:none;letter-spacing:0;font:400 12px/16px Barlow" }, note)))),
    POSITIONS.map((p) => el("div", {},
      el("div", { class: "rowhead" }, p.label),
      el("div", { class: "grid cols-3" }, columns.map(([label, set]) => {
        const entry = data[`${set}-d${local.density}`][p.model];
        const make = (scale) => sprite({ entry, anim: local.anim, scale, tints: () => teamTints(), title: label });
        return el("div", { class: "cell" }, stage(make(1), make(Math.max(1, Math.round(local.zoom / local.density)))));
      })),
    )),
  );
  let section;
  section = sectionShell(
    "1. Less mud: dither and tones",
    "Re-rendered in Blender from the models the shipped sprites came from, with the pixel shader changed. Each cell shows the real game size, then zoomed. The kit tint switch in the top bar applies to every section.",
    [
      field("Animation", seg(ANIMS, () => local.anim, (v) => { local.anim = v; section.refresh(); })),
      field("Pixels", seg([[1, "Game size"], [2, "2× density"]], () => local.density, (v) => { local.density = v; section.refresh(); })),
      field("Zoom", seg([[3, "3×"], [4, "4×"], [6, "6×"]], () => local.zoom, (v) => { local.zoom = v; section.refresh(); })),
    ],
    build,
    [el("b", {}, "What I would do: "), "drop the dither and keep three tones, and switch the game to the ramp tint. The dither is what turns red cloth into speckle at game size; the three tones carry the form. Two tones read cleaner still on the thrall and runner but flatten the blitzer's armour."],
  );
  return section;
}

function densitySection() {
  const local = { position: "blitzer", anim: "idle", target: 300 };
  const build = () => {
    const model = modelOf(local.position);
    const d = [1, 2, 3, 4].map((n) => [n, data[`base-d${n}`][model]]);
    return el("div", {},
      el("div", { class: "grid cols-4" }, d.map(([n, entry]) => cell(
        n === 1 ? "As shipped" : `${n}× density`,
        stage(sprite({ entry, anim: local.anim, scale: fitScale(entry, local.target), tints: () => teamTints() })),
        n === 1 ? "The game's size today, enlarged" : `${n * n}× the pixels; same model, same shader`,
      ))),
      el("div", { class: "rowhead" }, "At their real size, side by side"),
      el("div", { class: "cell" }, stage(...d.map(([, entry]) => sprite({ entry, anim: local.anim, scale: 1, tints: () => teamTints() }))),
        el("div", { class: "note" }, "What each density looks like on screen with no zoom. 2× suits a match camera zoomed in 2×, a retina screen, or the player page.")),
    );
  };
  let section;
  section = sectionShell(
    "2. Double, triple and quadruple the pixels",
    "The same Blender models rendered with more pixels per metre. Unlike an upscaler, every extra pixel is real detail from the model. Shown at about the same height, then at their real size.",
    [positionSeg(local, () => section.refresh()), field("Animation", seg(ANIMS, () => local.anim, (v) => { local.anim = v; section.refresh(); }))],
    build,
    [el("b", {}, "What I would do: "), "2× for the player page and any zoomed match camera. At 3× and 4× the models' simple shapes start to show, so they would need a modelling pass first. Atlas size grows with the square of the density."],
  );
  return section;
}

function framesSection() {
  const local = { position: "runner", anim: "run" };
  const build = () => {
    const model = modelOf(local.position);
    const pair = [["8 frames, as shipped", data["base-d2"][model]], ["12 frames", data["frames12-d2"][model]]];
    return el("div", { class: "grid cols-2" }, pair.map(([label, entry]) =>
      cell(label, stage(sprite({ entry, anim: local.anim, scale: 2, tints: () => teamTints() })))));
  };
  let section;
  section = sectionShell(
    "3. Smoother loops",
    "The looping animations with 12 frames instead of 8, over the same loop time, at 2× density.",
    [positionSeg(local, () => section.refresh()), field("Animation", seg([["idle", "Idle"], ["run", "Run"], ["cheer", "Cheer"]], () => local.anim, (v) => { local.anim = v; section.refresh(); }))],
    build,
    [el("b", {}, "What I would do: "), "12 frames for run, where 8 visibly steps; keep 8 for idle. It costs half as many frames again for each looping animation."],
  );
  return section;
}

function looksSection(card) {
  const local = { position: "blitzer", gender: "m", density: 2 };
  const build = () => el("div", { class: "matrix", style: `grid-template-columns: 110px repeat(${PADS.length}, minmax(0, 1fr))` },
    el("div", { class: "h" }),
    PADS.map(([, label]) => el("div", { class: "h" }, label)),
    HELMS.map(([helm, hlabel]) => [
      el("div", { class: "h" }, hlabel),
      PADS.map(([pads]) => {
        const look = { gender: local.gender, helm, pads };
        const entry = data[`looks-d${local.density}`][lookKey(local.position, look)];
        return el("div", { class: "m", title: "Hire this look onto the player page", onclick: () => card.hire(local.position, look) },
          sprite({ entry, anim: "idle", scale: local.density === 2 ? 2 : 3, tints: () => teamTints() }));
      }),
    ]),
  );
  let section;
  section = sectionShell(
    "4. Looks",
    "Every look for one position: helmet down the side, shoulder pads across, body above. Each figure is its own Blender render, so pads, helmets and hair animate with the body. Click a figure to hire it onto the player page.",
    [
      positionSeg(local, () => section.refresh()),
      field("Body", seg(GENDERS, () => local.gender, (v) => { local.gender = v; section.refresh(); })),
      field("Pixels", seg([[1, "Game size"], [2, "2× density"]], () => local.density, (v) => { local.density = v; section.refresh(); })),
    ],
    build,
    [el("b", {}, "What I would do: "), "ship helmet and pads as player choices; both read at game size. The female body reads through hair and build, so it is clearest bare-headed. Rendering every look for every position multiplies the atlases, so render looks on demand per team rather than all at once."],
  );
  return section;
}

function randomLook() {
  const pick = (list) => list[Math.floor(Math.random() * list.length)][0];
  return { gender: pick(GENDERS), helm: pick(HELMS), pads: pick(PADS) };
}

function newPlayer(position, number, look = randomLook()) {
  return { id: `${Date.now()}-${number}`, number, position, look, name: rollName(position, look.gender), custom: false };
}

function rollName(position, gender) {
  const p = POSITIONS.find((x) => x.key === position);
  const book = nameBookFor("Vampire", p.label);
  return formatPlayerName(generatePlayerName(book, gender === "f" ? "female" : "male"));
}

function startingRoster() {
  const lineup = ["blitzer", "thrower", "runner", "thrall", "thrall", "thrall", "thrall"];
  return lineup.map((position, i) => newPlayer(position, i + 1));
}

function validRoster(saved) {
  return Array.isArray(saved) && saved.length > 0 && saved.every((p) => p.look && p.look.helm && p.look.pads);
}

function playerCard(card) {
  const saved = store.get("vampire-lab-roster-v3", null);
  const local = { roster: validRoster(saved) ? saved : startingRoster(), selected: 0, editing: false };
  const section = el("section", {});
  const save = () => store.set("vampire-lab-roster-v3", local.roster);
  const current = () => local.roster[local.selected];

  const cycler = (label, options, get, set) => {
    const step = (d) => {
      const i = options.findIndex(([v]) => v === get());
      set(options[(i + d + options.length) % options.length][0]);
      save();
      render();
    };
    const value = options.find(([v]) => v === get())?.[1] ?? "";
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
      el("button", { class: "btn", type: "button", onclick: () => { p.name = rollName(p.position, p.look.gender); p.custom = false; save(); render(); } }, "New name"),
    );
  };

  const portrait = (p) => {
    const entry = data["looks-d2"][lookKey(p.position, p.look)];
    const anim = p.anim ?? "idle";
    return el("div", { class: "portrait" },
      el("div", { class: "stage" }, sprite({ entry, anim, scale: fitScale(entry, 280), tints: () => teamTints() })),
      cycler("Animation", [["idle", "Idle"], ["run", "Run"]], () => anim, (v) => { p.anim = v; }),
      cycler("Body", GENDERS, () => p.look.gender, (v) => {
        p.look.gender = v;
        if (!p.custom) p.name = rollName(p.position, v);
      }),
      cycler("Helmet", HELMS, () => p.look.helm, (v) => { p.look.helm = v; }),
      cycler("Pads", PADS, () => p.look.pads, (v) => { p.look.pads = v; }),
    );
  };

  const rosterList = () => el("div", {},
    el("h3", {}, "Roster, Sevens"),
    el("div", { class: "roster" }, local.roster.map((p, i) => {
      const entry = data["looks-d1"][lookKey(p.position, p.look)];
      return el("button", { type: "button", class: i === local.selected ? "on" : "", onclick: () => { local.selected = i; local.editing = false; render(); } },
        el("span", { class: "num" }, String(p.number)),
        sprite({ entry, anim: "idle", scale: 1, tints: () => teamTints() }),
        el("span", { class: "who" }, el("b", {}, p.name), el("span", {}, POSITIONS.find((x) => x.key === p.position).label)));
    })),
    el("div", { class: "hire" },
      POSITIONS.map((pos) => el("button", { class: "btn", type: "button", onclick: () => card.hire(pos.key) }, `Hire ${pos.label.replace("Vampire ", "")}`)),
      el("button", { class: "btn blood", type: "button", onclick: () => { local.roster = startingRoster(); local.selected = 0; save(); render(); } }, "New team"),
    ),
  );

  const render = () => {
    const p = current();
    const pos = POSITIONS.find((x) => x.key === p.position);
    section.replaceChildren(
      el("h2", {}, "5. Player page"),
      el("p", { class: "lede" }, "A mock of the player detail page: the portrait at 2× density, the roster at game size. Hiring rolls a name from the position's name book and a random look. Cycle the body, helmet and pads, rename the player or roll a new name. Changing the body rolls a fitting first name unless you renamed the player."),
      el("div", { class: "card" },
        portrait(p),
        el("div", {},
          el("div", { class: "eyebrow" }, `${pos.label} · Level 0 · The Grave Lords`),
          nameBlock(p),
          el("div", { class: "stats" }, pos.stats.map((v, i) => el("div", { class: "stat" }, el("b", {}, String(v)), el("span", {}, STAT_NAMES[i])))),
          rosterList(),
        ),
      ),
      el("div", { class: "verdict" }, el("b", {}, "Names: "), "the generator lives in src/game/names and is tested. Vampires take a first name by gender, then a family name or a noble house such as \"von Ravenmoor\", and sometimes an epithet. Thralls get peasant names. Other teams can add their own book."),
    );
  };

  card.hire = (position, look) => {
    const number = Math.max(0, ...local.roster.map((p) => p.number)) + 1;
    local.roster.push(newPlayer(position, number, look ? { ...look } : randomLook()));
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
  const sections = [sharpenSection(), densitySection(), framesSection(), looksSection(card), player];
  topBar(sections);
  document.getElementById("app").replaceChildren(...sections);
  requestAnimationFrame(tick);
}

main().catch((err) => {
  document.getElementById("app").replaceChildren(el("div", { class: "loading" }, `Could not load the lab: ${err.message}`));
});
