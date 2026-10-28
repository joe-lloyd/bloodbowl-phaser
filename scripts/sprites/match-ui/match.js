// Match UI mockup: the corners stadium full screen, with floating HTML panels
// instead of two sidebars. Hover a player for their card, click one of yours
// to select it and see its reach and the action bar, then hover an opponent
// for the block preview. Nothing here plays a real game.
//
// Two looks share the same layout and code: neon, and a Blood Bowl one with
// its own stadium, player renders and kits. Each theme's data.json says
// where its sprites live, relative to the theme's root.

const THEMES = {
  bloodbowl: {
    root: "bloodbowl/", bloom: false, bg: "#0b0805", move: 0xfff2c8, rush: 0xffc23a, reachAlpha: [0.2, 0.18],
    score: { fontFamily: "Georgia, serif", fontStyle: "bold", color: "#e8c46a" },
  },
  neon: {
    root: "../stadium-2026-10-28/", bloom: true, bg: "#04030a", move: 0x3dff9a, rush: 0xffb81e, reachAlpha: [0.13, 0.11],
    score: { fontFamily: "Impact, Haettenschweiler, sans-serif", fontStyle: "italic", color: "#f4f0ff" },
  },
};
const theme = () => THEMES[ui.theme];
const PPU = 50;
const LAYERS = ["base", "kit1", "kit2"];
const FPS = 6, FRAMES = 8, FALL_LAST = 7;

const POSITIONS = {
  human_lineman: ["Human Lineman", [6, 3, 3, 4, 9], []],
  human_thrower: ["Human Thrower", [6, 3, 3, 2, 9], ["Pass", "Sure Hands"]],
  human_catcher: ["Human Catcher", [8, 2, 3, 5, 8], ["Catch", "Dodge"]],
  human_blitzer: ["Human Blitzer", [7, 3, 3, 4, 9], ["Block", "Tackle"]],
  halfling_hopeful: ["Halfling Hopeful", [5, 2, 3, 4, 7], ["Dodge", "Right Stuff", "Stunty"]],
  ogre: ["Ogre", [5, 5, 4, 5, 10], ["Bone Head", "Loner 4+", "Mighty Blow", "Thick Skull", "Throw Team-mate"]],
  orc_lineman: ["Orc Lineman", [5, 3, 3, 4, 10], []],
  orc_thrower: ["Orc Thrower", [5, 3, 3, 3, 9], ["Animosity", "Pass", "Sure Hands"]],
  orc_blitzer: ["Orc Blitzer", [6, 3, 3, 4, 10], ["Block", "Break Tackle"]],
  big_un: ["Big Un Blocker", [5, 4, 4, 0, 10], ["Mighty Blow", "Taunt", "Unsteady"]],
  goblin_lineman: ["Goblin Lineman", [6, 2, 3, 4, 8], ["Dodge", "Right Stuff", "Stunty"]],
  troll: ["Untrained Troll", [4, 5, 5, 5, 10], ["Always Hungry", "Loner 4+", "Mighty Blow", "Projectile Vomit", "Really Stupid", "Regeneration", "Throw Team-mate"]],
};
const NEGATIVE = new Set(["Animosity", "Bone Head", "Loner 4+", "Really Stupid", "Always Hungry", "Unsteady"]);

// [number, name, model, where, status]; where is [gx, gy] on the pitch or [box, index] in the dugout
const ROSTER = {
  home: [
    [1, "Aldo Brandt", "human_lineman", [9, 4], "ok"], [2, "Konrad Vell", "human_lineman", [9, 6], "ok"],
    [3, "Mattias Roon", "human_lineman", [8, 5], "ok"], [4, "Jorg Hessler", "human_blitzer", [10, 3], "used"],
    [5, "Ulric Danz", "human_blitzer", [7, 8], "ok"], [6, "Pieter Holm", "human_thrower", [5, 5], "ball"],
    [7, "Wendel Kast", "human_catcher", [12, 9], "ok"],
    [8, "Lukas Ferr", "human_catcher", ["reserves", 0], "res"], [9, "Pip Tallowfoot", "halfling_hopeful", ["reserves", 1], "res"],
    [10, "Grunk", "ogre", ["reserves", 2], "res"], [11, "Otto Merrin", "human_blitzer", ["ko", 0], "ko"],
    [12, "Hans Gerber", "human_lineman", ["injured", 0], "inj"],
  ],
  away: [
    [1, "Gutrot", "orc_lineman", [11, 4], "ok"], [2, "Skarsnag", "orc_lineman", [10, 6], "ok"],
    [3, "Urzog", "orc_lineman", [11, 3], "ok"], [4, "Bonecruncha", "orc_blitzer", [12, 2], "ok"],
    [5, "Gorbag", "orc_blitzer", [13, 7], "ok"], [6, "Grimgut", "big_un", [11, 5], "ok"],
    [7, "Nazgrub", "orc_thrower", [16, 5], "ok"],
    [8, "Snikkit", "goblin_lineman", ["reserves", 0], "res"], [9, "Lumpy", "troll", ["reserves", 1], "res"],
    [10, "Muzgash", "orc_lineman", ["reserves", 2], "res"], [11, "Ugthak", "orc_lineman", ["ko", 0], "ko"],
    [12, "Rotgut", "orc_blitzer", ["injured", 0], "inj"],
  ],
};
const STATUS = {
  ok: ["Standing", "st-ok"], ball: ["Has the ball", "st-ball"], used: ["Activated", "st-used"],
  res: ["Reserve", "st-res"], ko: ["KO · back on a 4+ at kick-off", "st-ko"], inj: ["Badly hurt · out this game", "st-inj"],
};
const BOX_TIPS = {
  reserves: "Reserves · set up from here at kick-off", ko: "KO · roll 4+ to return at each kick-off",
  injured: "Injured · out for the rest of the game", "sent off": "Sent off · out for the rest of the game",
};

const ui = { mode: "docked", selected: null, hovered: null, theme: location.hash === "#neon" ? "neon" : "bloodbowl" };
const $ = (id) => document.getElementById(id);
const hex = (c) => "#" + c.toString(16).padStart(6, "0");

class Match extends Phaser.Scene {
  constructor(data) {
    super({ key: "match" });
    this.d = data;
    this.lay = data.layouts.find((l) => l.layout === "corners");
    this.sm = this.lay.sizes.lo;
    this.k = PPU / this.sm.px_per_unit;
  }

  at(gx, gy, z = 0) {
    const { origin: o, gx: a, gy: b, up: u } = this.sm;
    return { x: (o[0] + gx * a[0] + gy * b[0] + z * u[0]) * this.k, y: (o[1] + gx * a[1] + gy * b[1] + z * u[1]) * this.k };
  }

  /** Display pixels back to grid coordinates on the ground. */
  grid(x, y) {
    const { origin: o, gx: a, gy: b } = this.sm;
    const px = x / this.k - o[0], py = y / this.k - o[1];
    const det = a[0] * b[1] - a[1] * b[0];
    return { gx: (px * b[1] - py * b[0]) / det, gy: (a[0] * py - a[1] * px) / det };
  }

  preload() {
    const base = theme().root;
    for (const l of ["base", "home", "away"]) this.load.image(`st-${l}`, `${base}stadium/corners/lo/${l}.webp`);
    const idle = new Set(), fall = new Set();
    for (const side of ["home", "away"])
      for (const [, , m, , st] of ROSTER[side]) (st === "ko" || st === "inj" ? fall : idle).add(m);
    const root = base + this.d.idle_root;
    for (const m of idle) for (const l of LAYERS) this.load.atlas(`idle-${m}-${l}`, `${root}/${m}/lo/${l}.png`, `${root}/${m}/lo/${l}.json`);
    for (const m of fall) for (const l of LAYERS) this.load.atlas(`fall-${m}-${l}`, `${base}falls/${m}/lo/${l}.png`, `${base}falls/${m}/lo/${l}.json`);
  }

  create() {
    const kits = this.d.kits;
    this.add.image(0, 0, "st-base").setOrigin(0).setScale(this.k);
    this.add.image(0, 0, "st-home").setOrigin(0).setScale(this.k).setTint(kits.home[0]);
    this.add.image(0, 0, "st-away").setOrigin(0).setScale(this.k).setTint(kits.away[0]);
    this.reach = this.add.graphics().setDepth(2);
    this.marks = this.add.graphics().setDepth(3);
    this.players = [];
    for (const side of ["home", "away"])
      for (const [num, name, model, where, status] of ROSTER[side]) this.addPlayer(side, num, name, model, where, status);
    this.ball = this.add.circle(0, 0, 7, 0xb8743a).setStrokeStyle(2, 0x2a1408).setDepth(9999);
    this.scoreboard();
    this.setupInput();
    this.frame();
  }

  addPlayer(side, num, name, model, where, status) {
    const lying = status === "ko" || status === "inj";
    let gx, gy, box = null;
    if (typeof where[0] === "string") {
      box = where[0];
      [gx, gy] = this.lay.dugouts[side][box][where[1]];
    } else {
      [gx, gy] = [where[0] + 0.5, where[1] + 0.5];
    }
    const anim = lying ? "fall" : "idle";
    const meta = (lying ? this.d.falls : this.d.idle)[model].lo;
    const dir = box ? (side === "home" ? "s" : "n") : side === "home" ? "e" : "w";
    const p = this.at(gx, gy);
    const kit = this.d.kits[side];
    const sprites = LAYERS.map((l, k) => {
      const s = this.add.sprite(p.x, p.y, `${anim}-${model}-${l}`, `${anim}/${dir}/${lying ? FALL_LAST : 0}`)
        .setOrigin(meta.anchor[0] / meta.frame, meta.anchor[1] / meta.frame).setScale(PPU / meta.px_per_unit).setDepth(10 + p.y);
      if (k) s.setTint(kit[k - 1]);
      return s;
    });
    if (status === "used") sprites.forEach((s) => s.setAlpha(0.55));  // already activated this turn
    const pl = { side, num, name, model, status, box, gx, gy, x: p.x, y: p.y, sprites, anim, dir, phase: Math.random() * 1000 };
    sprites[0].setInteractive({ useHandCursor: true });
    sprites[0].on("pointerover", () => this.hover(pl));
    sprites[0].on("pointerout", () => this.hover(null));
    this.players.push(pl);
  }

  scoreboard() {
    const [gx, gy, z] = this.lay.screen;
    const p = this.at(gx, gy, z);
    const style = (color) => ({ ...theme().score, fontSize: "80px", color });
    this.add.text(p.x - 120, p.y, "HUMAN", style(hex(this.d.kits.home[0]))).setOrigin(1, 0.5).setDepth(5);
    this.add.text(p.x, p.y, "1 : 0", style(theme().score.color)).setOrigin(0.5).setDepth(5);
    this.add.text(p.x + 120, p.y, "ORC", style(hex(this.d.kits.away[0]))).setOrigin(0, 0.5).setDepth(5);
  }

  setupInput() {
    const cam = this.cameras.main;
    cam.setBackgroundColor(theme().bg);
    if (theme().bloom) cam.postFX.addBloom(0xffffff, 1, 1, 0.7, 0.55, 4);
    let downAt = null;
    this.input.on("pointerdown", (p) => { downAt = { x: p.x, y: p.y }; });
    this.input.on("pointermove", (p) => {
      if (p.isDown && downAt) {
        if (Math.hypot(p.x - downAt.x, p.y - downAt.y) > 5) $("viewer").classList.add("dragging");
        cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
        cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
      }
      this.pointer = p;
      this.drawMarks();
    });
    this.input.on("pointerup", (p, over) => {
      const dragged = downAt && Math.hypot(p.x - downAt.x, p.y - downAt.y) > 5;
      $("viewer").classList.remove("dragging");
      downAt = null;
      if (dragged) return;
      const hit = over.length ? this.players.find((pl) => pl.sprites[0] === over[0]) : null;
      if (hit && ui.selected && hit.side === "away" && !hit.box && blockDice(ui.selected, hit)) block(ui.selected, hit);
      else if (hit && hit.side === "home" && !hit.box && hit.status !== "used") select(hit);
      else if (!hit) select(null);
    });
    this.input.on("wheel", (p, _o, _dx, dy) => {
      const before = cam.getWorldPoint(p.x, p.y);
      cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), 0.25, 3));
      const after = cam.getWorldPoint(p.x, p.y);
      cam.scrollX += before.x - after.x;
      cam.scrollY += before.y - after.y;
    });
    this.scale.on("resize", () => this.frame());
  }

  /** Fit the pitch and both dugouts, leaving room for the top and bottom panels. */
  frame() {
    const pts = [[-1, -4], [21, -4], [-1, 11], [21, 15], [10, 15]].map(([x, y]) => this.at(x, y));
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys) + 160;
    const zoom = Math.min(this.scale.width / w, (this.scale.height - 190) / h);
    const cam = this.cameras.main;
    cam.setZoom(zoom);
    cam.centerOn((Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2 - 40 / zoom);
  }

  hover(pl) {
    ui.hovered = pl;
    showCards();
    this.drawMarks();
  }

  occupied(x, y) { return this.players.some((p) => !p.box && Math.floor(p.gx) === x && Math.floor(p.gy) === y); }

  diamond(g, gx, gy, color, alpha, line = false, inset = 0.06) {
    const pts = [[inset, inset], [1 - inset, inset], [1 - inset, 1 - inset], [inset, 1 - inset]].map(([x, y]) => this.at(gx + x, gy + y));
    if (line) g.lineStyle(3, color, alpha).strokePoints(pts, true);
    else g.fillStyle(color, alpha).fillPoints(pts, true);
  }

  /** Squares the selected player can reach: green within MA, amber for the two Rush squares. */
  drawReach() {
    const g = this.reach.clear();
    const s = ui.selected;
    if (!s) return;
    const ma = POSITIONS[s.model][1][0];
    const sx = Math.floor(s.gx), sy = Math.floor(s.gy);
    for (let x = 0; x < this.lay.cols; x++)
      for (let y = 0; y < this.lay.rows; y++) {
        const d = Math.max(Math.abs(x - sx), Math.abs(y - sy));
        if (!d || d > ma + 2 || this.occupied(x, y)) continue;
        const t = theme();
        this.diamond(g, x, y, d <= ma ? t.move : t.rush, t.reachAlpha[d <= ma ? 0 : 1]);
      }
  }

  drawMarks() {
    const g = this.marks.clear();
    const s = ui.selected, h = ui.hovered;
    if (s) this.diamond(g, Math.floor(s.gx), Math.floor(s.gy), this.d.kits.home[0], 0.95, true);
    if (h && !h.box) this.diamond(g, Math.floor(h.gx), Math.floor(h.gy), h.side === "home" ? this.d.kits.home[0] : this.d.kits.away[0], 0.5, true);
    hideTip();
    if (h || !this.pointer) return;
    const w = this.cameras.main.getWorldPoint(this.pointer.x, this.pointer.y);
    const { gx, gy } = this.grid(w.x, w.y);
    const x = Math.floor(gx), y = Math.floor(gy);
    if (x >= 0 && y >= 0 && x < this.lay.cols && y < this.lay.rows) {
      this.diamond(g, x, y, 0xffffff, 0.35, true);
      if (s) {
        const ma = POSITIONS[s.model][1][0];
        const d = Math.max(Math.abs(x - Math.floor(s.gx)), Math.abs(y - Math.floor(s.gy)));
        if (d && d <= ma + 2 && !this.occupied(x, y))
          showTip(this.pointer, d <= ma ? `<b>Move</b> ${d} square${d > 1 ? "s" : ""}` : `<b>Rush</b> ${d - ma} × 2+`);
      }
      return;
    }
    // dugout boxes explain themselves on hover
    for (const side of ["home", "away"])
      for (const [box, squares] of Object.entries(this.lay.dugouts[side]))
        if (squares.some(([cx, cy]) => Math.abs(gx - cx) <= 0.5 && Math.abs(gy - cy) <= 0.5))
          return showTip(this.pointer, BOX_TIPS[box]);
  }

  update(time) {
    for (const p of this.players) {
      if (p.anim !== "idle") continue;
      const f = Math.floor(((time + p.phase) / 1000) * FPS) % FRAMES;
      for (const s of p.sprites) s.setFrame(`idle/${p.dir}/${f}`);
    }
    const carrier = this.players.find((p) => p.status === "ball");
    this.ball.setPosition(carrier.x + 14, carrier.y - 52 + Math.sin(time / 260) * 2);
  }
}

// ------------------------------------------------------------------ panels

function cardHtml(pl, data) {
  const [pos, stats, skills] = POSITIONS[pl.model];
  const kit = hex(data.kits[pl.side][0]);
  const labels = ["MA", "ST", "AG", "PA", "AV"];
  const fmt = (l, v) => (l === "AG" || l === "PA" || l === "AV") ? (v ? `${v}+` : "–") : v;
  const [statusText, statusClass] = STATUS[pl.status];
  return `<div class="bar" style="background:${kit};box-shadow:0 0 12px ${kit}"></div><div class="body">
    <div class="top"><span class="num" style="color:${kit}">${pl.num}</span><div><div class="who">${pl.name}</div><div class="pos">${pos}</div></div></div>
    <div class="stats">${stats.map((v, i) => `<div class="stat"><small>${labels[i]}</small><b>${fmt(labels[i], v)}</b></div>`).join("")}</div>
    <div class="skills">${skills.length ? skills.map((s) => `<span class="skill${NEGATIVE.has(s) ? " neg" : ""}">${s}</span>`).join("") : '<span class="skill none">No skills</span>'}</div>
    <span class="status ${statusClass}">${statusText}</span></div>`;
}

/**
 * Docked: your player on the left, theirs on the right, so a selected player
 * and a hovered opponent sit side by side. Beside: one card next to the player.
 */
function showCards() {
  const scene = window.game.scene.getScene("match");
  const a = $("card-a"), b = $("card-b"), vs = $("versus");
  const s = ui.selected, h = ui.hovered;
  const left = ui.mode === "docked" ? (h && h.side === "home" ? h : s) : (h || s);
  const right = ui.mode === "docked" ? (h && h.side === "away" ? h : null) : null;
  for (const [el, pl] of [[a, left], [b, right]]) {
    el.className = "panel card " + (ui.mode === "docked" ? "docked" : "beside");
    if (!pl) { el.classList.remove("show"); continue; }
    el.innerHTML = cardHtml(pl, scene.d);
    if (ui.mode === "beside") {
      const cam = scene.cameras.main;
      const sx = (pl.x - cam.worldView.x) * cam.zoom, sy = (pl.y - cam.worldView.y) * cam.zoom;
      const flip = sx > innerWidth - 320;
      el.style.left = `${flip ? sx - 290 : sx + 30}px`;
      el.style.top = `${Math.min(Math.max(sy - 170, 120), innerHeight - 330)}px`;
      el.style.right = el.style.bottom = "auto";
    } else {
      el.style.left = el.style.top = el.style.right = el.style.bottom = "";
    }
    requestAnimationFrame(() => el.classList.add("show"));
  }
  // block preview when your selected player eyes an adjacent opponent
  const blk = s && h && blockDice(s, h);
  if (blk) {
    const word = blk.count === 1 ? "1 DIE" : `${blk.count} DICE`;
    const who = blk.count === 1 ? "" : blk.chooser === "you" ? ", you choose" : ", they choose";
    vs.innerHTML = `<div class="dice" style="color:${blk.chooser === "you" ? "#7dffb0" : "#ff7a85"}">${word}${who}</div><div class="why">Block · ST ${blk.st} against ${blk.ht} · click to block</div>`;
    vs.classList.add("show");
  } else vs.classList.remove("show");
}

/** Block dice between two adjacent players, or null if they aren't adjacent opponents. */
function blockDice(s, h) {
  if (h.side === s.side || h.box || Math.max(Math.abs(Math.floor(h.gx) - Math.floor(s.gx)), Math.abs(Math.floor(h.gy) - Math.floor(s.gy))) !== 1) return null;
  const st = POSITIONS[s.model][1][1], ht = POSITIONS[h.model][1][1];
  const count = st === ht ? 1 : st * 2 <= ht || ht * 2 <= st ? 3 : 2;
  return { st, ht, count, chooser: st >= ht ? "you" : "them" };
}

// ------------------------------------------------------------------- dice

const RACES = { home: "human", away: "orc" };
function diceTeam(side) {
  const scene = window.game.scene.getScene("match");
  const kit = scene.d.kits[side];
  return { key: `${ui.theme}-${side}`, name: side === "home" ? "Altdorf Lancers" : "Gutrippa Ladz", race: RACES[side], kit, ink: hex(kit[1]) };
}

function logLine(html) {
  const li = document.createElement("li");
  li.innerHTML = html;
  document.querySelector(".log ol").appendChild(li);
  document.querySelector(".log .last").innerHTML = html;
}

let rolling = false;
async function throwDice(spec) {
  if (rolling || !window.Dice) return null;
  rolling = true;
  try {
    return await window.Dice.roll({ theme: ui.theme, ...spec });
  } finally {
    rolling = false;
  }
}

async function block(s, h) {
  const b = blockDice(s, h);
  const r = await throwDice({ kind: "block", count: b.count, team: diceTeam("home"), chooser: b.chooser,
    title: `#${s.num} ${s.name} blocks #${h.num} ${h.name} · ${b.count} ${b.count > 1 ? "dice" : "die"}` });
  if (!r) return;
  const face = r.faces[r.chosen];
  const good = face === "Defender Down" || face === "Defender Stumbles" || face === "Push";
  logLine(`<span class="${good ? "ok" : "bad"}">${good ? "✓" : "✗"}</span> ${s.name} block: ${face.toLowerCase()}`);
}

const ROLLS = {
  dodge: () => ({ kind: "d6", count: 1, target: 3, team: diceTeam("home"), title: "Dodge · needs 3+" }),
  armour: () => ({ kind: "d6", count: 2, target: 11, team: diceTeam("home"), title: "Armour on Skarsnag · AV 10+, beat it to break" }),
  "their-block": () => ({ kind: "block", count: 2, chooser: "them", team: diceTeam("away"), title: "#6 Grimgut blocks #3 Mattias Roon · 2 dice" }),
};

async function demoRoll(name) {
  if (name === "fair") return showFairness();
  const spec = ROLLS[name]();
  const r = await throwDice(spec);
  if (!r) return;
  const total = r.values.reduce((a, v) => a + v, 0);
  if (spec.kind === "block") logLine(`<span class="bad">✗</span> Grimgut block: ${r.faces[r.chosen].toLowerCase()}`);
  else logLine(`<span class="${total >= spec.target ? "ok" : "bad"}">${total >= spec.target ? "✓" : "✗"}</span> ${spec.title.split(" ·")[0]} rolled ${r.values.join(" + ")}`);
}

function showFairness() {
  document.querySelector(".fair")?.remove();
  const f = window.Dice.fairness();
  const max = Math.max(...f.counts);
  const pass = f.chi2 < 11.07;
  const box = document.createElement("div");
  box.className = "panel fair";
  box.innerHTML = `<b>${f.n.toLocaleString()} d6 from the same generator</b>
    <div class="bars">${f.counts.map((c, i) => `<div style="height:${(c / max) * 100}%"><span>${i + 1}</span></div>`).join("")}</div>
    <p>Counts ${f.counts.map((c) => c.toLocaleString()).join(" · ")}. Chi-square ${f.chi2.toFixed(2)} on 5 degrees of freedom:
    ${pass ? "even, as a fair die should be" : "outside the 95% band, which a fair die does 1 time in 20"}. The 3D dice only ever show these numbers.</p>
    <button>Close</button>`;
  box.querySelector("button").addEventListener("click", () => box.remove());
  document.querySelector(".hud").appendChild(box);
}

function select(pl) {
  ui.selected = pl;
  const scene = window.game.scene.getScene("match");
  scene.drawReach();
  scene.drawMarks();
  showCards();
  const bar = $("actions");
  if (pl) {
    $("actor").textContent = `#${pl.num} ${pl.name}`;
    const canPass = pl.status === "ball";
    bar.querySelector('[data-act="Pass"]').disabled = !canPass;
    bar.querySelector('[data-act="Hand-off"]').disabled = !canPass;
    bar.classList.add("show");
  } else bar.classList.remove("show");
}

function showTip(p, html) {
  const t = $("tip");
  t.innerHTML = html;
  t.style.left = `${p.x + 16}px`;
  t.style.top = `${p.y + 18}px`;
  t.classList.add("show");
}
function hideTip() { $("tip").classList.remove("show"); }

let toastTimer;
function toast(html) {
  const t = $("toast");
  t.innerHTML = html;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 1600);
}

/** (Re)start the game in the current theme; the HUD restyles through a body class. */
async function start() {
  const data = await (await fetch(theme().root + "data.json")).json();
  if (window.game) window.game.destroy(true);
  ui.selected = ui.hovered = null;
  ["card-a", "card-b", "versus", "actions"].forEach((id) => $(id).classList.remove("show"));
  document.body.className = `theme-${ui.theme}`;
  document.querySelectorAll("[data-theme]").forEach((o) => o.setAttribute("aria-pressed", String(o.dataset.theme === ui.theme)));
  const css = (c) => hex(c);
  document.body.style.setProperty("--home", css(data.kits.home[0]));
  document.body.style.setProperty("--away", css(data.kits.away[0]));
  window.game = new Phaser.Game({
    type: Phaser.WEBGL, parent: "viewer", width: innerWidth, height: innerHeight,
    pixelArt: true, backgroundColor: theme().bg, scale: { mode: Phaser.Scale.RESIZE },
    scene: new Match(data),
  });
}

async function boot() {
  for (const [side, done] of [["home", 3], ["away", 2]])
    $(`pips-${side}`).innerHTML = Array.from({ length: 6 }, (_, i) => `<span class="pip${i < done ? " on" : ""}"></span>`).join("");
  document.querySelectorAll("[data-theme]").forEach((b) => b.addEventListener("click", () => {
    ui.theme = b.dataset.theme;
    history.replaceState(null, "", "#" + ui.theme);
    start();
  }));
  start();
  document.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => {
    ui.mode = b.dataset.mode;
    document.querySelectorAll("[data-mode]").forEach((o) => o.setAttribute("aria-pressed", String(o === b)));
    showCards();
  }));
  document.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", () =>
    toast(`${b.dataset.act} picked for #${ui.selected.num} ${ui.selected.name}. In the game the pitch would now show the targets.`)));
  document.querySelectorAll("[data-roll]").forEach((b) => b.addEventListener("click", () => demoRoll(b.dataset.roll)));
  $("endturn").addEventListener("click", () => toast("End turn asks to confirm while players are still unactivated."));
  addEventListener("keydown", (e) => { if (e.key === "Escape") select(null); });
}

boot();
