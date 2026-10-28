// All-teams model viewer. One Phaser game per selected team: every position
// stands on its own pitch square, drawn to scale, idling and turning.

const PPU = 50;                 // display pixels per metre in both modes
const DIRS = ["s", "se", "e", "ne", "n", "nw", "w", "sw"];
const FPS = 6, FRAMES = 8, LAYERS = ["base", "kit1", "kit2"];
const MAX_COLS = 4, LABEL_H = 76, PAD = 24;

const hex = (c) => "#" + c.toString(16).padStart(6, "0");
const fmtStats = (s) => s ? `MA${s.MA} ST${s.ST} AG${s.AG}+ PA${s.PA ? s.PA + "+" : "-"} AV${s.AV}+` : "";

const view = { size: "lo", turning: true, facing: 1, game: null, team: null };

class TeamScene extends Phaser.Scene {
  constructor(team, data) {
    super({ key: "team" });
    this.team = team;
    this.data_ = data;
  }

  preload() {
    for (const p of this.team.positions) {
      if (!p.ready) continue;
      for (const size of ["lo", "hi"])
        for (const layer of LAYERS)
          this.load.atlas(`${p.model}-${size}-${layer}`, `sprites/${p.model}/${size}/${layer}.png`, `sprites/${p.model}/${size}/${layer}.json`);
    }
  }

  create() {
    const { tileW, layout } = this.layout_;
    this.cameras.main.setBackgroundColor("#08070d");
    const g = this.add.graphics();
    const [kit1, kit2] = this.team.kit;
    this.cards = layout.map(({ p, x, y }, i) => {
      const tile = [[x, y - tileW / 4], [x + tileW / 2, y], [x, y + tileW / 4], [x - tileW / 2, y]].map(([px, py]) => ({ x: px, y: py }));
      g.fillStyle(0x15121f).fillPoints(tile, true).lineStyle(1, kit1, 0.55).strokePoints(tile, true);
      this.add.text(x, y + tileW / 4 + 10, p.name.toUpperCase(), {
        fontFamily: "Futura, Avenir Next Condensed, sans-serif", fontSize: "14px", color: hex(kit1), fontStyle: "bold",
      }).setOrigin(0.5, 0).setPadding(4, 2, 8, 2);
      this.add.text(x, y + tileW / 4 + 30, p.role || "", {
        fontFamily: "Menlo, monospace", fontSize: "12px", color: "#c4c0d2",
      }).setOrigin(0.5, 0);
      this.add.text(x, y + tileW / 4 + 48, fmtStats(p.stats), {
        fontFamily: "Menlo, monospace", fontSize: "12px", color: "#8f8c9c",
      }).setOrigin(0.5, 0);
      if (!p.ready) {
        this.add.text(x, y - 40, "not rendered yet", { fontFamily: "Menlo, monospace", fontSize: "12px", color: "#6a6678" }).setOrigin(0.5);
        return null;
      }
      const sprites = LAYERS.map((layer, k) => {
        const s = this.add.sprite(x, y, `${p.model}-lo-${layer}`, "idle/se/0");
        if (k > 0) s.setTint(k === 1 ? kit1 : kit2);
        return s;
      });
      const hit = this.add.zone(x, y - tileW / 3, tileW, tileW).setInteractive({ useHandCursor: true });
      hit.on("pointerdown", () => this.focus(x, y - tileW / 6));
      return { p, sprites, phase: i * 250 };
    });
    this.applySize();
    this.clock = 0;
    this.focused = null;
  }

  /** Zoom on one player; a second click zooms back out. */
  focus(x, y) {
    const cam = this.cameras.main;
    if (this.focused) {
      this.focused = null;
      cam.zoomTo(1, 250);
      cam.pan(this.scale.width / 2, this.scale.height / 2, 250);
    } else {
      this.focused = { x, y };
      cam.zoomTo(3, 250);
      cam.pan(x, y, 250);
    }
  }

  applySize() {
    const meta = this.data_.models;
    for (const c of this.cards) {
      if (!c) continue;
      const m = meta[c.p.model][view.size];
      const scale = PPU / m.px_per_unit;
      c.sprites.forEach((s, k) => {
        s.setTexture(`${c.p.model}-${view.size}-${LAYERS[k]}`, "idle/se/0");
        s.setOrigin(m.anchor[0] / m.frame, m.anchor[1] / m.frame).setScale(scale);
      });
    }
  }

  update(_, dt) {
    this.clock += dt;
    const dir = view.turning ? DIRS[Math.floor(this.clock / 1500) % 8] : DIRS[view.facing];
    for (const c of this.cards) {
      if (!c) continue;
      const f = Math.floor(((this.clock + c.phase) / 1000) * FPS) % FRAMES;
      for (const s of c.sprites) s.setFrame(`idle/${dir}/${f}`);
    }
  }
}

/** Grid of squares: up to MAX_COLS per row, each row as tall as its tallest model. */
function layoutFor(team, data) {
  const tileW = data.square_m * Math.SQRT2 * PPU;
  const cellW = tileW + 26;
  const cols = Math.min(MAX_COLS, team.positions.length);
  const rows = [];
  team.positions.forEach((p, i) => (rows[Math.floor(i / cols)] ||= []).push(p));
  const layout = [];
  let y = PAD;
  for (const row of rows) {
    const above = Math.max(tileW / 4, ...row.map((p) => {
      const m = p.ready && data.models[p.model];
      return m ? m.hi.anchor[1] * (PPU / m.hi.px_per_unit) : tileW / 2;
    }));
    const rowY = y + above;
    const x0 = (cols * cellW - row.length * cellW) / 2;
    row.forEach((p, i) => layout.push({ p, x: x0 + cellW * (i + 0.5), y: rowY }));
    y = rowY + tileW / 4 + LABEL_H;
  }
  return { tileW, layout, width: cols * cellW, height: y + PAD / 2 };
}

function showTeam(data, key) {
  const team = data.teams.find((t) => t.key === key) || data.teams[0];
  view.team = team;
  if (view.game) view.game.destroy(true);
  const lay = layoutFor(team, data);
  const scene = new TeamScene(team, data);
  scene.layout_ = lay;
  view.game = new Phaser.Game({
    type: Phaser.WEBGL, parent: "viewer", width: Math.ceil(lay.width), height: Math.ceil(lay.height),
    pixelArt: true, roundPixels: true, backgroundColor: "#08070d",
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY },
    scene,
  });
  document.querySelectorAll("[data-team]").forEach((b) => b.setAttribute("aria-current", String(b.dataset.team === team.key)));
  document.getElementById("team-name").textContent = team.name;
  document.getElementById("team-note").textContent = (window.TEAM_NOTES || {})[team.key] || "";
  const unique = new Set(team.positions.map((p) => p.model)).size;
  document.getElementById("team-count").textContent = `${team.positions.length} positions, ${unique} models`;
  if (location.hash !== "#" + team.key) history.replaceState(null, "", "#" + team.key);
}

function currentScene() { return view.game && view.game.scene.getScene("team"); }

async function boot() {
  const data = await (await fetch("data.json")).json();
  const nav = document.getElementById("teams");
  for (const t of data.teams) {
    const b = document.createElement("button");
    b.dataset.team = t.key;
    b.innerHTML = `<i style="background:${hex(t.kit[0])}"></i><i style="background:${hex(t.kit[1])}"></i>${t.name}`;
    b.addEventListener("click", () => showTeam(data, t.key));
    nav.appendChild(b);
  }
  document.querySelectorAll("[data-size]").forEach((b) => b.addEventListener("click", () => {
    view.size = b.dataset.size;
    document.querySelectorAll("[data-size]").forEach((o) => o.setAttribute("aria-pressed", String(o === b)));
    currentScene()?.applySize();
  }));
  const turn = document.getElementById("turn");
  turn.addEventListener("click", () => {
    view.turning = !view.turning;
    turn.setAttribute("aria-pressed", String(view.turning));
  });
  document.querySelectorAll("[data-step]").forEach((b) => b.addEventListener("click", () => {
    view.turning = false;
    turn.setAttribute("aria-pressed", "false");
    view.facing = (view.facing + Number(b.dataset.step) + 8) % 8;
  }));
  document.getElementById("square").textContent = `${data.square_m} m`;
  showTeam(data, location.hash.slice(1));
}

boot();
