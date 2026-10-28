// Stadium review: one pre-rendered backdrop per dugout layout, team colours
// tinted at runtime, and players standing on the pitch and in the dugouts.

const PPU = 50;                       // display pixels per metre at zoom 1
const LAYERS = ["base", "kit1", "kit2"];
const DIRS = ["s", "se", "e", "ne", "n", "nw", "w", "sw"];
const FPS = 6, FRAMES = 8, FALL_LAST = 7;

// Sevens kick-off line-up, grid squares, and who sits in each dugout box.
const LINEUP = {
  home: [["human_lineman", 6, 4], ["human_lineman", 6, 5], ["human_lineman", 6, 6], ["human_blitzer", 4, 2],
         ["human_blitzer", 4, 8], ["human_thrower", 3, 5], ["human_catcher", 2, 3]],
  away: [["orc_lineman", 13, 4], ["orc_lineman", 13, 5], ["orc_lineman", 13, 6], ["orc_blitzer", 15, 2],
         ["orc_blitzer", 15, 8], ["big_un", 16, 5], ["orc_thrower", 18, 5]],
};
const BENCH = {
  home: { reserves: ["human_catcher", "halfling_hopeful", "ogre"], ko: ["human_blitzer"], injured: ["human_lineman"] },
  away: { reserves: ["goblin_lineman", "troll", "orc_lineman"], ko: ["orc_lineman"], injured: ["orc_blitzer"] },
};
const LYING = new Set(["ko", "injured"]);

const view = { layout: "far", size: "lo", glow: true, grid: false, game: null };

function facingToward(dx, dy) {
  const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));   // e = 0, s = 2, w = 4, n = -2
  return ["e", "se", "s", "sw", "w", "nw", "n", "ne"][(a + 8) % 8];
}

class Stadium extends Phaser.Scene {
  constructor(data) {
    super({ key: "stadium" });
    this.d = data;
    this.lay = data.layouts.find((l) => l.layout === view.layout);
    this.sm = this.lay.sizes[view.size];
    this.k = PPU / this.sm.px_per_unit;
  }

  /** Grid coordinates, plus metres up, to display pixels. */
  at(gx, gy, z = 0) {
    const { origin: o, gx: a, gy: b, up: u } = this.sm;
    return { x: (o[0] + gx * a[0] + gy * b[0] + z * u[0]) * this.k, y: (o[1] + gx * a[1] + gy * b[1] + z * u[1]) * this.k };
  }

  preload() {
    const { layout } = this.lay, size = view.size;
    for (const l of ["base", "home", "away"]) this.load.image(`st-${l}`, `stadium/${layout}/${size}/${l}.webp`);
    const standing = new Set([...Object.values(LINEUP).flat().map(([m]) => m),
      ...Object.values(BENCH).flatMap((b) => b.reserves)]);
    for (const m of standing)
      for (const l of LAYERS) this.load.atlas(`idle-${m}-${l}`, `${this.d.idle_root}/${m}/${size}/${l}.png`, `${this.d.idle_root}/${m}/${size}/${l}.json`);
    for (const m of Object.keys(this.d.falls))
      for (const l of LAYERS) this.load.atlas(`fall-${m}-${l}`, `falls/${m}/${size}/${l}.png`, `falls/${m}/${size}/${l}.json`);
  }

  create() {
    const kits = this.d.kits;
    this.add.image(0, 0, "st-base").setOrigin(0).setScale(this.k);
    this.add.image(0, 0, "st-home").setOrigin(0).setScale(this.k).setTint(kits.home[0]);
    this.add.image(0, 0, "st-away").setOrigin(0).setScale(this.k).setTint(kits.away[0]);
    this.W = this.sm.width * this.k;
    this.H = this.sm.height * this.k;

    this.grid = this.add.graphics().setDepth(1).setVisible(view.grid);
    const square = (cx, cy, color) => {
      const pts = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]].map(([x, y]) => this.at(cx + x, cy + y));
      this.grid.lineStyle(1, color, 0.6).strokePoints(pts, true);
    };
    for (let x = 0; x < this.lay.cols; x++) for (let y = 0; y < this.lay.rows; y++) square(x + 0.5, y + 0.5, 0xffffff);

    this.players = [];
    const mid = [this.lay.cols / 2, this.lay.rows / 2];
    for (const side of ["home", "away"]) {
      for (const [m, x, y] of LINEUP[side]) this.player(m, "idle", x + 0.5, y + 0.5, side === "home" ? "e" : "w", side);
      for (const [box, models] of Object.entries(BENCH[side])) {
        const squares = this.lay.dugouts[side][box];
        squares.forEach(([x, y]) => square(x, y, 0xffd84a));
        models.forEach((m, i) => {
          const [x, y] = squares[i];
          const lying = LYING.has(box);
          this.player(m, lying ? "fall" : "idle", x, y, facingToward(mid[0] - x, mid[1] - y), side);
        });
      }
    }
    this.scoreboard();
    this.setupCamera();
  }

  player(model, anim, gx, gy, dir, side) {
    const meta = (anim === "fall" ? this.d.falls : this.d.idle)[model]?.[view.size];
    if (!meta) return;
    const p = this.at(gx, gy);
    const kit = this.d.kits[side];
    const sprites = LAYERS.map((l, k) => {
      const s = this.add.sprite(p.x, p.y, `${anim}-${model}-${l}`, `${anim}/${dir}/${anim === "fall" ? FALL_LAST : 0}`)
        .setOrigin(meta.anchor[0] / meta.frame, meta.anchor[1] / meta.frame)
        .setScale(PPU / meta.px_per_unit).setDepth(10 + p.y);
      if (k) s.setTint(kit[k - 1]);
      return s;
    });
    this.players.push({ sprites, anim, dir, phase: Math.random() * 1000 });
  }

  scoreboard() {
    const [gx, gy, z] = this.lay.screen;
    const p = this.at(gx, gy, z);
    const style = (color) => ({ fontFamily: "Impact, Haettenschweiler, sans-serif", fontSize: "80px", color, fontStyle: "italic" });
    const hex = (c) => "#" + c.toString(16).padStart(6, "0");
    this.add.text(p.x - 120, p.y, "HUMAN", style(hex(this.d.kits.home[0]))).setOrigin(1, 0.5).setDepth(5);
    this.add.text(p.x, p.y, "0 : 0", style("#f4f0ff")).setOrigin(0.5).setDepth(5);
    this.add.text(p.x + 120, p.y, "ORC", style(hex(this.d.kits.away[0]))).setOrigin(0, 0.5).setDepth(5);
    this.add.text(p.x, p.y + 90, "TURN 1 / 6", { ...style("#23e6ff"), fontSize: "40px", fontStyle: "" }).setOrigin(0.5).setDepth(5);
  }

  setupCamera() {
    const cam = this.cameras.main;
    cam.setBackgroundColor("#04030a");
    if (view.glow) cam.postFX.addBloom(0xffffff, 1, 1, 0.7, 0.55, 4);
    this.input.on("pointermove", (p) => {
      if (!p.isDown) return;
      cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
      cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
    });
    this.input.on("wheel", (p, _o, _dx, dy) => {
      const before = cam.getWorldPoint(p.x, p.y);
      cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), this.fitZoom() * 0.8, 4));
      const after = cam.getWorldPoint(p.x, p.y);
      cam.scrollX += before.x - after.x;
      cam.scrollY += before.y - after.y;
    });
    this.scale.on("resize", () => this.focus(view.focus || "pitch", 0));
    this.focus(view.focus || "pitch", 0);
  }

  fitZoom() { return Math.min(this.scale.width / this.W, this.scale.height / this.H); }

  /** Frame a named area: the whole stadium, the pitch, or one dugout. */
  focus(name, ms = 450) {
    view.focus = name;
    let pts;
    if (name === "stadium") pts = [{ x: 0, y: 0 }, { x: this.W, y: this.H }];
    else if (name === "pitch") pts = [[0, 0], [this.lay.cols, 0], [0, this.lay.rows], [this.lay.cols, this.lay.rows]].map(([x, y]) => this.at(x, y));
    else pts = Object.values(this.lay.dugouts[name]).flat().map(([x, y]) => this.at(x, y));
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    // leave headroom above, since players and stands rise from their squares
    const box = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys) - (name === "stadium" ? 0 : 140), y1: Math.max(...ys) };
    const pad = name === "stadium" ? 1 : 1.12;
    const zoom = Math.min(this.scale.width / ((box.x1 - box.x0) * pad), this.scale.height / ((box.y1 - box.y0) * pad), 4);
    const cam = this.cameras.main;
    const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
    if (!ms) { cam.setZoom(zoom); cam.centerOn(cx, cy); return; }
    cam.zoomTo(zoom, ms, "Sine.easeInOut");
    cam.pan(cx, cy, ms, "Sine.easeInOut");
  }

  update(time) {
    for (const p of this.players) {
      if (p.anim !== "idle") continue;
      const f = Math.floor(((time + p.phase) / 1000) * FPS) % FRAMES;
      for (const s of p.sprites) s.setFrame(`idle/${p.dir}/${f}`);
    }
  }
}

function start(data) {
  if (view.game) view.game.destroy(true);
  const el = document.getElementById("viewer");
  view.game = new Phaser.Game({
    type: Phaser.WEBGL, parent: "viewer", width: el.clientWidth, height: el.clientHeight,
    pixelArt: true, backgroundColor: "#04030a",
    scale: { mode: Phaser.Scale.RESIZE },
    scene: new Stadium(data),
  });
  document.querySelectorAll("[data-layout]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.layout === view.layout)));
  document.querySelectorAll("[data-about]").forEach((p) => (p.hidden = p.dataset.about !== view.layout));
}

const scene = () => view.game?.scene.getScene("stadium");

async function boot() {
  const data = await (await fetch("data.json")).json();
  const pressGroup = (attr, value) => document.querySelectorAll(`[${attr}]`).forEach((b) =>
    b.setAttribute("aria-pressed", String(b.getAttribute(attr) === value)));
  document.querySelectorAll("[data-layout]").forEach((b) => b.addEventListener("click", () => {
    view.layout = b.dataset.layout;
    start(data);
  }));
  document.querySelectorAll("[data-size]").forEach((b) => b.addEventListener("click", () => {
    view.size = b.dataset.size;
    pressGroup("data-size", view.size);
    start(data);
  }));
  document.querySelectorAll("[data-focus]").forEach((b) => b.addEventListener("click", () => scene()?.focus(b.dataset.focus)));
  const toggle = (id, key, apply) => {
    const b = document.getElementById(id);
    b.addEventListener("click", () => {
      view[key] = !view[key];
      b.setAttribute("aria-pressed", String(view[key]));
      apply();
    });
  };
  toggle("grid", "grid", () => scene()?.grid.setVisible(view.grid));
  toggle("glow", "glow", () => start(data));
  start(data);
}

boot();
