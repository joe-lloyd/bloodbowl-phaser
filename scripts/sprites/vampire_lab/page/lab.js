import { formatPlayerName, generatePlayerName, nameBookFor } from "./names.js";

const TEAMS = [
  { name: "Crimson and black, the default", kit1: 0x8b0000, kit2: 0x000000 },
  { name: "Bone and crimson", kit1: 0xe6dcc8, kit2: 0x8b0000 },
  { name: "Royal purple and gold", kit1: 0x4b1f6f, kit2: 0xd4a017 },
  { name: "Midnight and silver", kit1: 0x1d2a4a, kit2: 0xc0c4cc },
];
const POSITIONS = [
  { key: "thrall", label: "Thrall Lineman", shipped: "thrall", stats: [6, 3, "3+", "4+", "8+"], cost: 40 },
  { key: "thrower", label: "Vampire Thrower", shipped: "vampire_thrower", stats: [6, 4, "2+", "2+", "9+"], cost: 110 },
  { key: "blitzer", label: "Vampire Blitzer", shipped: "vampire_blitzer", stats: [6, 4, "2+", "4+", "9+"], cost: 110 },
  { key: "runner", label: "Vampire Runner", shipped: "vampire_runner", stats: [8, 3, "2+", "3+", "8+"], cost: 100 },
];
const GENDERS = [["m", "Male"], ["f", "Female"]];
const CYCLE = { idle: 1.35, run: 0.8 };
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

const ANIMS_SHIPPED = [["idle", "Idle"], ["run", "Run"], ["block", "Block"], ["pass", "Pass"], ["cheer", "Cheer"], ["fall", "Fall"]];

function sharpenSection() {
  const local = { anim: "idle", zoom: 4 };
  const columns = [
    ["As shipped", "current", "mul", "Multiply tint, the game today"],
    ["Ramp tint", "current", "ramp", "Same pixels; kit shades picked from the team colour"],
    ["Cleaned and ramp", "clean", "ramp", "Merged shades, no lone pixels, part lines"],
  ];
  const build = () => el("div", {},
    el("div", { class: "grid cols-3" }, columns.map(([label, , , note]) => el("div", { class: "rowhead" }, label, el("div", { class: "note", style: "color:var(--mute);text-transform:none;letter-spacing:0;font:400 12px/16px Barlow" }, note)))),
    POSITIONS.map((p) => el("div", {},
      el("div", { class: "rowhead" }, p.label),
      el("div", { class: "grid cols-3" }, columns.map(([label, treatment, mode]) => {
        const entry = data.shipped[p.shipped][treatment];
        const make = (scale) => sprite({ entry, anim: local.anim, scale, tints: () => teamTints(), mode: () => mode, title: label });
        return el("div", { class: "cell" }, stage(make(1), make(local.zoom)));
      })),
    )),
  );
  let section;
  section = sectionShell(
    "1. Sharper at the size we have",
    "The shipped art, untouched and with two fixes. Each cell shows the sprite at its real game size, then zoomed. The first column always uses today's multiply tint, so you can compare against what the match draws now.",
    [
      field("Animation", seg(ANIMS_SHIPPED, () => local.anim, (v) => { local.anim = v; section.refresh(); })),
      field("Zoom", seg([[3, "3×"], [4, "4×"], [6, "6×"]], () => local.zoom, (v) => { local.zoom = v; section.refresh(); })),
    ],
    build,
    [el("b", {}, "What I would do: "), "switch the game to the ramp tint first. It changes no art, only how Phaser colours the kit layers, and it fixes most of the mud. The cleanup pass adds part lines on top; it helps the blitzer most and is cheap to run over every team."],
  );
  return section;
}

function upscaleSection() {
  const local = { position: "blitzer", anim: "idle", target: 300 };
  const columns = [
    ["Shipped, bigger pixels", "current", "Nearest neighbour. The same art, just enlarged."],
    ["Scale2x", "clean-x2", "Double resolution. Smooths diagonals and curves."],
    ["Scale3x", "clean-x3", "Triple resolution."],
    ["Scale2x twice", "clean-x4", "Four times. Starts to look like a filter."],
  ];
  const build = () => {
    const p = POSITIONS.find((x) => x.key === local.position);
    return el("div", { class: "grid cols-4" }, columns.map(([label, treatment, note]) => {
      const entry = data.shipped[p.shipped][treatment];
      return cell(label, stage(sprite({ entry, anim: local.anim, scale: fitScale(entry, local.target), tints: () => teamTints() })), note);
    }));
  };
  let section;
  section = sectionShell(
    "2. More pixels from the art we have",
    "Pixel-art scalers on the cleaned shipped art, all shown at about the same height. They invent smoother edges, never new detail.",
    [
      field("Position", seg(POSITIONS.map((p) => [p.key, p.label.replace("Vampire ", "")]), () => local.position, (v) => { local.position = v; section.refresh(); })),
      field("Animation", seg(ANIMS_SHIPPED, () => local.anim, (v) => { local.anim = v; section.refresh(); })),
    ],
    build,
    [el("b", {}, "What I would do: "), "nothing here for the pitch. Scale2x is worth it only for big views such as the player page, where it reads better than fat square pixels."],
  );
  return section;
}

function newPlayer(position, number) {
  const look = { gender: Math.random() < 0.5 ? "m" : "f" };
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

function playerCard() {
  const saved = store.get("vampire-lab-roster-v2", null);
  const local = { roster: Array.isArray(saved) && saved.length ? saved : startingRoster(), selected: 0, editing: false };
  const section = el("section", {});
  const save = () => store.set("vampire-lab-roster-v2", local.roster);
  const current = () => local.roster[local.selected];
  const tints = () => teamTints();
  const shipped = (p, treatment) => data.shipped[POSITIONS.find((x) => x.key === p.position).shipped][treatment];

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
    const entry = shipped(p, "clean-x2");
    const anim = p.anim ?? "idle";
    return el("div", { class: "portrait" },
      el("div", { class: "stage" }, sprite({ entry, anim, scale: fitScale(entry, 280), tints })),
      cycler("Animation", ANIMS_SHIPPED, () => anim, (v) => { p.anim = v; }),
      cycler("Gender", GENDERS, () => p.look.gender, (v) => {
        p.look.gender = v;
        if (!p.custom) p.name = rollName(p.position, v);
      }),
      el("div", { class: "note" }, "Gender only changes the name for now. Helmet, pads, hair and a female body need the source models the shipped art was rendered from."),
    );
  };

  const rosterList = () => el("div", {},
    el("h3", {}, "Roster, Sevens"),
    el("div", { class: "roster" }, local.roster.map((p, i) => {
      const entry = shipped(p, "current");
      const t = () => teamTints();
      return el("button", { type: "button", class: i === local.selected ? "on" : "", onclick: () => { local.selected = i; local.editing = false; render(); } },
        el("span", { class: "num" }, String(p.number)),
        sprite({ entry, anim: "idle", scale: 1, tints: t }),
        el("span", { class: "who" }, el("b", {}, p.name), el("span", {}, POSITIONS.find((x) => x.key === p.position).label)));
    })),
    el("div", { class: "hire" },
      POSITIONS.map((pos) => el("button", { class: "btn", type: "button", onclick: () => hire(pos.key) }, `Hire ${pos.label.replace("Vampire ", "")}`)),
      el("button", { class: "btn blood", type: "button", onclick: () => { local.roster = startingRoster(); local.selected = 0; save(); render(); } }, "New team"),
    ),
  );

  const hire = (position) => {
    const number = Math.max(0, ...local.roster.map((p) => p.number)) + 1;
    local.roster.push(newPlayer(position, number));
    local.selected = local.roster.length - 1;
    save();
    render();
  };

  const render = () => {
    const p = current();
    const pos = POSITIONS.find((x) => x.key === p.position);
    section.replaceChildren(
      el("h2", {}, "3. Player page"),
      el("p", { class: "lede" }, "A mock of the player detail page, drawn with the shipped art: Scale2x for the portrait, game size in the roster. Hiring rolls a name from the position's name book. Rename the player or roll a new name. Changing gender rolls a fitting first name unless you renamed the player."),
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
  const sections = [sharpenSection(), upscaleSection(), playerCard()];
  topBar(sections);
  document.getElementById("app").replaceChildren(...sections);
  requestAnimationFrame(tick);
}

main().catch((err) => {
  document.getElementById("app").replaceChildren(el("div", { class: "loading" }, `Could not load the lab: ${err.message}`));
});
