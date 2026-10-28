// Three style frames on one isometric pitch. Every frame plays the same
// moment: an orc blitzer runs three squares, blocks the human ball carrier,
// the carrier goes down and the ball bounces loose. Each style supplies its
// own pitch, light, effects, type and the way the loop resets.

const TW = 96, TH = 48;          // pitch square as a 2:1 diamond
const COLS = 20, ROWS = 11;      // Blood Bowl Sevens pitch
const VIEW_W = 1280, VIEW_H = 720;
const LOOP = 8000;
const T_RUN = 1000, STEP = 400, T_BLOCK = 2200, T_HIT = 2450, T_RESET = 6800;
const FPS = { idle: 6, run: 12, block: 12, fall: 12 };
const FRAMES = { idle: 8, run: 8, block: 6, fall: 8 };
const LOOPS = { idle: true, run: true, block: false, fall: false };
const LAYERS = ["base", "kit1", "kit2"];

const iso = (gx, gy) => ({ x: (gx - gy) * TW / 2, y: (gx + gy) * TH / 2 });
const centre = (gx, gy) => iso(gx + 0.5, gy + 0.5);
const facing = (dx, dy) =>
  ({ "0,1": "s", "1,1": "se", "1,0": "e", "1,-1": "ne", "0,-1": "n", "-1,-1": "nw", "-1,0": "w", "-1,1": "sw" })[
    `${Math.sign(dx)},${Math.sign(dy)}`];
const frameAt = (anim, ms) => {
  const f = Math.floor((Math.max(0, ms) / 1000) * FPS[anim]);
  return LOOPS[anim] ? f % FRAMES[anim] : Math.min(f, FRAMES[anim] - 1);
};
const hex = (c) => "#" + c.toString(16).padStart(6, "0");

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const CARRIER = [8, 5];
const PATH = [[12, 6], [11, 5], [10, 4], [9, 4]];  // ends beside the carrier on screen, not in front
const BALL_HOPS = [[8, 5], [7, 6], [6, 6]];
const BALL_PEAKS = [46, 18];
const HAND = 34;
// Squares and facings for both sides. The first home player carries the
// ball and the first away player is the blitzer.
const HOME_SPOTS = [CARRIER.concat("ne"), [9, 3, "e"], [9, 7, "e"], [6, 7, "e"], [6, 2, "se"], [5, 5, "e"], [4, 8, "ne"]];
const AWAY_SPOTS = [PATH[0].concat("nw"), [10, 3, "w"], [10, 8, "w"], [11, 4, "w"], [12, 2, "sw"], [13, 8, "w"], [15, 5, "w"]];
const squad = (spots, races) => spots.map(([x, y, dir], i) => ({ race: races[i % races.length], x, y, dir }));
const DEFAULT_TEAMS = { home: squad(HOME_SPOTS, ["human"]), away: squad(AWAY_SPOTS, ["orc"]) };
const MIXED_TEAMS = {
  home: squad(HOME_SPOTS, ["human", "elf", "vampire", "gnome", "human", "elf", "gnome"]),
  away: squad(AWAY_SPOTS, ["orc", "goblin", "witch_elf", "orc", "goblin", "witch_elf", "orc"]),
};
const teamsOf = (style) => style.teams || DEFAULT_TEAMS;
const racesOf = (teams) => [...new Set([...teams.home, ...teams.away].map((p) => p.race))];

// ------------------------------------------------------------------ helpers

function canvasTexture(scene, key, w, h, draw) {
  const tex = scene.textures.createCanvas(key, w, h);
  draw(tex.getContext(), w, h);
  tex.refresh();
  return key;
}

function radial(scene, key, size, rgb) {
  return canvasTexture(scene, key, size, size, (ctx) => {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, `rgba(${rgb},1)`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  });
}

function splat(scene, key, rgb, seed, size = 64) {
  const r = rng(seed);
  return canvasTexture(scene, key, size, size / 2, (ctx) => {
    ctx.fillStyle = `rgb(${rgb})`;
    for (let i = 0; i < 14; i++) {
      const a = r() * Math.PI * 2, d = r() * size * 0.38;
      const rad = (1 - d / (size * 0.4)) * size * 0.11 + 1;
      ctx.beginPath();
      ctx.ellipse(size / 2 + Math.cos(a) * d, size / 4 + Math.sin(a) * d / 2, rad, rad / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function diamond(gx, gy) {
  return [iso(gx, gy), iso(gx + 1, gy), iso(gx + 1, gy + 1), iso(gx, gy + 1)];
}

/** HUD objects draw on their own camera, so the world's post effects never touch them. */
function onHud(scene, obj) {
  scene.hudObjects.push(obj);
  return obj.setScrollFactor(0);
}

function hud(scene, x, y, str, style) {
  const t = onHud(scene, scene.add.text(x, y, str, style)).setDepth(10000).setPadding(6, 4, 14, 4);  // room for italic overhang
  if (style.spacing && t.setLetterSpacing) t.setLetterSpacing(style.spacing);
  return t;
}

function loadRaces(scene, style, races) {
  for (const race of races)
    for (const layer of LAYERS)
      scene.load.atlas(`${race}-${layer}`, `sprites/${style}/${race}/${layer}.png`, `sprites/${style}/${race}/${layer}.json`);
  scene.load.json("meta", `sprites/${style}/${races[0]}/meta.json`);
}

function originOf(scene) {
  const [[, size]] = Object.entries(scene.cache.json.get("meta").sizes);
  return [size.anchor[0] / size.frame, size.anchor[1] / size.frame];
}

// -------------------------------------------------------------------- scene

class StyleFrame extends Phaser.Scene {
  constructor(style) {
    super({ key: style.key });
    this.style = style;
  }

  preload() {
    loadRaces(this, this.style.key, racesOf(teamsOf(this.style)));
  }

  create() {
    const S = this.style;
    this.origin = originOf(this);
    this.cameras.main.setBackgroundColor(S.bg);
    const focus = iso(10.5, 6);
    this.cameras.main.centerOn(focus.x, focus.y - 20);
    this.clock = 0;
    this.frozenUntil = 0;
    this.paused = false;
    this.decals = [];
    this.hudObjects = [];

    S.pitch(this);
    this.players = [];
    const teams = teamsOf(S);
    teams.home.forEach((p, i) => this.players.push(this.makePlayer("home", p, i)));
    teams.away.forEach((p, i) => this.players.push(this.makePlayer("away", p, i + 7)));
    this.carrier = this.players[0];
    this.blitzer = this.players[teams.home.length];
    this.ball = this.makeBall();
    S.effects(this);
    S.hud(this);
    this.hudCam = this.cameras.add(0, 0, VIEW_W, VIEW_H);
    const hudSet = new Set(this.hudObjects);
    this.hudCam.ignore(this.children.list.filter((o) => !hudSet.has(o)));
    this.cameras.main.ignore(this.hudObjects);
    this.resetMatch();
  }

  makePlayer(team, { race, x: gx, y: gy, dir }, i) {
    const S = this.style;
    const kit = S.kits[team];
    const shadow = S.shadow(this, kit);
    const sprites = LAYERS.map((layer, k) => {
      const s = this.add.sprite(0, 0, `${race}-${layer}`, "idle/s/0")
        .setOrigin(this.origin[0], this.origin[1]).setScale(S.scale);
      if (k > 0) s.setTint(kit[k - 1]);
      return s;
    });
    return { race, home: [gx, gy], homeDir: dir, gx, gy, dir, anim: "idle", t0: 0, phase: i * 397, shadow, sprites };
  }

  makeBall() {
    const S = this.style;
    const s = S.scale;
    const w = 8, h = 6;
    canvasTexture(this, "ball", w, h, (ctx) => {
      ctx.fillStyle = "#6b3d1c"; ctx.beginPath(); ctx.ellipse(4, 3, 4, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#9a6232"; ctx.fillRect(2, 1, 3, 1);
      ctx.fillStyle = "#f2efe6"; ctx.fillRect(3, 3, 3, 1);
    });
    const shadow = this.add.ellipse(0, 0, 14, 6, 0x000000, 0.35).setDepth(2);
    const sprite = this.add.image(0, 0, "ball").setScale(S.ballScale);
    return { sprite, shadow, s };
  }

  place(p, gx, gy) {
    const c = centre(gx, gy);
    p.shadow.setPosition(c.x, c.y);
    for (const s of p.sprites) s.setPosition(c.x, c.y).setDepth(100 + c.y);
  }

  pose(p, anim, dir, ms) {
    const name = `${anim}/${dir}/${frameAt(anim, ms)}`;
    for (const s of p.sprites) s.setFrame(name);
  }

  resetMatch() {
    for (const d of this.decals) d.destroy();
    this.decals = [];
    this.hit = false;
    this.style.reset?.(this);
  }

  /** Jump the loop to a moment and hold it, for stills. */
  holdAt(ms) {
    this.resetMatch();
    this.clock = 0;
    this.paused = false;
    this.step(0);
    this.clock = ms - 1;
    this.step(1);
    this.paused = true;
  }

  update(time, dt) {
    if (this.paused) return;
    if (time < this.frozenUntil) { this.style.tick?.(this, this.clock % LOOP, 0); return; }
    this.step(dt);
  }

  step(dt) {
    const prev = this.clock % LOOP;
    this.clock += dt;
    const tl = this.clock % LOOP;
    if (tl < prev) this.resetMatch();

    for (const p of this.players) {
      if (p === this.blitzer || p === this.carrier) continue;
      this.place(p, p.home[0], p.home[1]);
      this.pose(p, "idle", p.homeDir, this.clock + p.phase);
    }

    // Blitzer: wait, run three squares, block, then stand.
    const b = this.blitzer;
    if (tl < T_RUN) {
      this.place(b, ...PATH[0]); this.pose(b, "idle", "w", this.clock + b.phase);
    } else if (tl < T_BLOCK) {
      const u = (tl - T_RUN) / STEP, i = Math.min(Math.floor(u), 2), f = u - i;
      const [a, c] = [PATH[i], PATH[i + 1]];
      this.place(b, a[0] + (c[0] - a[0]) * f, a[1] + (c[1] - a[1]) * f);
      this.pose(b, "run", facing(c[0] - a[0], c[1] - a[1]), tl - T_RUN);
    } else {
      this.place(b, ...PATH[3]);
      if (tl < T_BLOCK + 600) this.pose(b, "block", "sw", tl - T_BLOCK);
      else this.pose(b, "idle", "sw", this.clock + b.phase);
    }

    // Carrier: idle until the hit, then down for the rest of the loop.
    const c = this.carrier;
    this.place(c, ...CARRIER);
    if (tl < T_HIT) this.pose(c, "idle", "ne", this.clock);
    else this.pose(c, "fall", "ne", tl - T_HIT);

    if (!this.hit && tl >= T_HIT && tl < T_RESET) {
      this.hit = true;
      const at = centre(...CARRIER);
      this.frozenUntil = this.time.now + this.style.hitstop;
      this.style.impact(this, at);
      this.hudCam.ignore(this.decals);
    }

    this.placeBall(tl);
    this.style.tick?.(this, tl, dt);
  }

  placeBall(tl) {
    let [gx, gy] = BALL_HOPS[0], h = HAND;
    if (tl >= T_HIT) {
      const u = (tl - T_HIT) / 400;
      if (u >= BALL_PEAKS.length) {
        [gx, gy] = BALL_HOPS[BALL_HOPS.length - 1]; h = 0;
      } else {
        const i = Math.floor(u), f = u - i, [a, c] = [BALL_HOPS[i], BALL_HOPS[i + 1]];
        gx = a[0] + (c[0] - a[0]) * f;
        gy = a[1] + (c[1] - a[1]) * f;
        h = (i === 0 ? (1 - f) * HAND : 0) + Math.sin(f * Math.PI) * BALL_PEAKS[i];
      }
    }
    const p = centre(gx, gy);
    this.ball.shadow.setPosition(p.x, p.y);
    this.ball.sprite.setPosition(p.x, p.y - h - 4).setDepth(100 + p.y + 1);
  }
}

// ------------------------------------------------------------------ styles

const NEON = {
  key: "neon", scale: 2, ballScale: 2, bg: "#06050b", hitstop: 160,
  kits: { home: [0xff2a9d, 0x4a3a5c], away: [0x23e6ff, 0x24414f] },
  shadow(scene, kit) {
    const g = scene.add.graphics().setDepth(2);
    g.fillStyle(0x000000, 0.5).fillEllipse(0, 0, 44, 20);
    g.lineStyle(2, kit[0], 0.9).strokeEllipse(0, 0, 52, 24);
    g.setBlendMode(Phaser.BlendModes.NORMAL);
    return g;
  },
  pitch(scene) {
    const g = scene.add.graphics().setDepth(0);
    for (let x = 0; x < COLS; x++)
      for (let y = 0; y < ROWS; y++) {
        const zone = x === 0 ? 0xff2a9d : x === COLS - 1 ? 0x23e6ff : null;
        g.fillStyle((x + y) % 2 ? 0x0e0c17 : 0x120f1e, 1).fillPoints(diamond(x, y), true);
        if (zone) g.fillStyle(zone, 0.16).fillPoints(diamond(x, y), true);
        g.lineStyle(1, 0xff2a9d, 0.16).strokePoints(diamond(x, y), true);
      }
    const line = (gx, color) => {
      const a = iso(gx, 0), b = iso(gx, ROWS);
      g.lineStyle(10, color, 0.12).lineBetween(a.x, a.y, b.x, b.y);
      g.lineStyle(2, color, 0.95).lineBetween(a.x, a.y, b.x, b.y);
    };
    line(1, 0xff2a9d); line(COLS - 1, 0x23e6ff); line(COLS / 2, 0xe8f6ff);
    radial(scene, "pool", 512, "255,255,255");
    [[6, 4, 0xff4fb0], [13, 6, 0x4fe0ff], [10, 2, 0xffffff]].forEach(([gx, gy, tint]) => {
      const p = centre(gx, gy);
      scene.add.image(p.x, p.y, "pool").setScale(1.6, 0.8).setTint(tint).setAlpha(0.13)
        .setBlendMode(Phaser.BlendModes.ADD).setDepth(1);
    });
    splat(scene, "blood", "196,18,63", 7);
    splat(scene, "blood2", "150,10,48", 11, 40);
  },
  effects(scene) {
    canvasTexture(scene, "scan", 4, 4, (ctx) => { ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fillRect(0, 3, 4, 1); });
    scene.add.tileSprite(0, 0, VIEW_W, VIEW_H, "scan").setOrigin(0).setScrollFactor(0).setDepth(9500);
    const cam = scene.cameras.main;
    cam.postFX.addBloom(0xffffff, 1, 1, 0.8, 0.6, 4);
    cam.postFX.addVignette(0.5, 0.5, 0.9, 0.35);
    scene.noise = scene.add.graphics().setScrollFactor(0).setDepth(9600);
  },
  hud(scene) {
    scene.tape = hud(scene, 28, 22, "", { fontFamily: "Menlo, Courier New, monospace", fontSize: "18px", color: "#f4f0ff" });
    hud(scene, VIEW_W - 28, 18, "0 : 0", {
      fontFamily: "Impact, Haettenschweiler, sans-serif", fontSize: "44px", color: "#ff2a9d", fontStyle: "italic",
    }).setOrigin(1, 0).setShadow(-3, 0, "#23e6ff", 0, false, true);
    hud(scene, 28, VIEW_H - 46, "TURN 4 / 6   BLITZ", {
      fontFamily: "Futura, Avenir Next Condensed, sans-serif", fontSize: "18px", color: "#23e6ff", fontStyle: "bold", spacing: 3,
    });
    hud(scene, VIEW_W - 30, VIEW_H - 28, "Blood Bowl", {
      fontFamily: "Brush Script MT, Brush Script, cursive", fontSize: "54px", color: "#ff2a9d",
    }).setOrigin(1, 1).setShadow(0, 0, "#ff2a9d", 14, false, true);
    scene.shout = hud(scene, VIEW_W / 2, 96, "KNOCKDOWN", {
      fontFamily: "Impact, Haettenschweiler, sans-serif", fontSize: "76px", color: "#ff2a9d", fontStyle: "italic",
    }).setOrigin(0.5).setShadow(-5, 0, "#23e6ff", 0, false, true).setAngle(-6).setVisible(false);
  },
  impact(scene, at) {
    const cam = scene.cameras.main;
    cam.shake(240, 0.012);
    cam.flash(90, 255, 40, 150);
    [["blood", 0, 6, 1], ["blood2", -46, -14, 1], ["blood2", 30, 18, 0.7]].forEach(([k, dx, dy, s]) =>
      scene.decals.push(scene.add.image(at.x + dx, at.y + dy, k).setScale(s * 2).setDepth(1.5)));
    scene.shout.setVisible(true).setScale(1.6);
    scene.tweens.add({ targets: scene.shout, scale: 1, duration: 140, ease: "Back.Out" });
  },
  tick(scene, tl) {
    const rewinding = tl > T_RESET;
    const secs = Math.floor(11647 + scene.clock / 1000);
    const clock = `${String(Math.floor(secs / 3600) % 24).padStart(2, "0")}:${String(Math.floor(secs / 60) % 60).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
    scene.tape.setText(rewinding ? `◀◀ REWIND   ${clock}` : `▶ PLAY   SP   ${clock}`);
    if (scene.shout.visible) scene.shout.setAngle(-6 + Math.sin(scene.clock / 70) * 1.5);
    scene.noise.clear();
    if (rewinding) {
      for (let i = 0; i < 9; i++) {
        scene.noise.fillStyle(0xffffff, 0.08 + Math.random() * 0.12)
          .fillRect(0, Math.random() * VIEW_H, VIEW_W, 2 + Math.random() * 10);
      }
    }
  },
  reset(scene) { scene.shout?.setVisible(false); },
};

const RITUAL = {
  key: "ritual", scale: 1, ballScale: 2, bg: "#0b0d0c", hitstop: 260,
  kits: { home: [0xd9d0b8, 0x8f9894], away: [0x8e1b12, 0x3a3533] },
  shadow(scene) {
    return scene.add.ellipse(0, 0, 50, 22, 0x000000, 0.45).setDepth(2);
  },
  pitch(scene) {
    const r = rng(42);
    const pad = 4;
    const left = iso(-pad, ROWS + pad).x, top = iso(-pad, -pad).y;
    const w = (COLS + ROWS + pad * 4) * TW / 2, h = (COLS + ROWS + pad * 4) * TH / 2;
    canvasTexture(scene, "stone", w, h, (ctx) => {
      const at = (gx, gy) => { const p = iso(gx, gy); return [p.x - left, p.y - top]; };
      for (let x = -pad; x < COLS + pad; x++)
        for (let y = -pad; y < ROWS + pad; y++) {
          const out = x < 0 || y < 0 || x >= COLS || y >= ROWS;
          if (out && r() < 0.45) continue;
          const v = 52 + r() * 16 - (out ? 22 : 0);
          const pts = [at(x, y), at(x + 1, y), at(x + 1, y + 1), at(x, y + 1)];
          ctx.fillStyle = `rgb(${v - 4},${v + 2},${v - 2})`;
          ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = "rgba(10,12,11,0.85)"; ctx.lineWidth = 2; ctx.stroke();
          ctx.strokeStyle = `rgba(150,160,150,0.18)`; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(...pts[3]); ctx.lineTo(...pts[0]); ctx.lineTo(...pts[1]); ctx.stroke();
          const [cx, cy] = at(x + 0.5, y + 0.5);
          if (r() < 0.5) {
            ctx.strokeStyle = "rgba(15,17,16,0.7)"; ctx.beginPath(); ctx.moveTo(cx + (r() - 0.5) * 50, cy + (r() - 0.5) * 20);
            for (let k = 0; k < 3; k++) ctx.lineTo(cx + (r() - 0.5) * 60, cy + (r() - 0.5) * 26);
            ctx.stroke();
          }
          for (let k = 0; k < (r() < 0.3 ? 6 : 0); k++) {
            ctx.fillStyle = `rgba(${70 + r() * 30},${95 + r() * 30},${55},0.55)`;
            ctx.fillRect(cx + (r() - 0.5) * 50, cy + (r() - 0.5) * 20, 3, 2);
          }
          if (!out && r() < 0.06) {
            ctx.fillStyle = "rgba(60,14,10,0.45)";
            ctx.beginPath(); ctx.ellipse(cx, cy, 18 + r() * 10, 7 + r() * 4, 0, 0, Math.PI * 2); ctx.fill();
          }
        }
      // chalk lines, half-worn
      ctx.strokeStyle = "rgba(200,196,180,0.35)"; ctx.lineWidth = 3; ctx.setLineDash([22, 9, 6, 14]);
      for (const gx of [1, COLS / 2, COLS - 1]) { ctx.beginPath(); ctx.moveTo(...at(gx, 0)); ctx.lineTo(...at(gx, ROWS)); ctx.stroke(); }
    });
    scene.add.image(left, top, "stone").setOrigin(0).setDepth(0);
    radial(scene, "glow", 256, "255,120,40");
    radial(scene, "soft", 32, "255,255,255");
    splat(scene, "blood", "74,13,8", 5);
    scene.braziers = [[6, -1.6], [14, -1.6], [3, ROWS + 0.6], [16, ROWS + 0.6]].map(([gx, gy]) => {
      const p = centre(gx, gy);
      const g = scene.add.graphics().setDepth(100 + p.y);
      g.fillStyle(0x2a2d2b).fillRect(p.x - 12, p.y - 46, 24, 46);
      g.fillStyle(0x3d413e).fillRect(p.x - 18, p.y - 54, 36, 10);
      g.fillStyle(0x1a1c1b).fillEllipse(p.x, p.y, 40, 16);
      const glow = scene.add.image(p.x, p.y - 60, "glow").setBlendMode(Phaser.BlendModes.ADD).setDepth(4000).setAlpha(0.5).setScale(2.2, 1.6);
      scene.add.particles(p.x, p.y - 60, "soft", {
        speedY: { min: -70, max: -30 }, speedX: { min: -10, max: 10 }, lifespan: 700, frequency: 30,
        scale: { start: 0.9, end: 0 }, alpha: { start: 0.9, end: 0 }, tint: [0xffb040, 0xff6020, 0xc02010],
        blendMode: "ADD",
      }).setDepth(100 + p.y + 1);
      return glow;
    });
  },
  effects(scene) {
    const r = rng(3);
    canvasTexture(scene, "fog", 1024, 512, (ctx) => {
      for (let i = 0; i < 70; i++) {
        const x = r() * 1024, y = r() * 512, rad = 60 + r() * 140;
        for (const dx of [-1024, 0, 1024]) {
          const g = ctx.createRadialGradient(x + dx, y, 0, x + dx, y, rad);
          g.addColorStop(0, "rgba(190,200,195,0.13)"); g.addColorStop(1, "rgba(190,200,195,0)");
          ctx.fillStyle = g; ctx.fillRect(0, 0, 1024, 512);
        }
      }
    });
    scene.fog = [0.55, 0.35].map((a, i) =>
      scene.add.tileSprite(0, 0, VIEW_W, VIEW_H, "fog").setOrigin(0).setScrollFactor(0).setDepth(5000 + i).setAlpha(a).setTileScale(1.4 + i * 0.6));
    canvasTexture(scene, "ash", 2, 2, (ctx) => { ctx.fillStyle = "#b8bcb6"; ctx.fillRect(0, 0, 2, 2); });
    scene.add.particles(0, 0, "ash", {
      x: { min: 0, max: VIEW_W }, y: -10, speedY: { min: 18, max: 40 }, speedX: { min: -12, max: 6 },
      lifespan: 30000, frequency: 90, alpha: { min: 0.3, max: 0.8 }, rotate: { min: 0, max: 360 },
    }).setScrollFactor(0).setDepth(6000);
    const cam = scene.cameras.main;
    cam.postFX.addColorMatrix().saturate(-0.35);
    cam.postFX.addVignette(0.5, 0.48, 0.85, 0.4);
  },
  hud(scene) {
    const serif = "Optima, Candara, Palatino, serif";
    hud(scene, 34, 26, "THE ASHEN PIT   ·   TURN IV", { fontFamily: serif, fontSize: "16px", color: "#a9ada5", spacing: 4 });
    hud(scene, VIEW_W - 34, 22, "II  :  I", { fontFamily: serif, fontSize: "26px", color: "#c9c4b4", spacing: 4 }).setOrigin(1, 0);
    hud(scene, VIEW_W / 2, VIEW_H - 74, "Grukk the Unbroken", { fontFamily: serif, fontSize: "20px", color: "#d8d2c2", spacing: 2 }).setOrigin(0.5);
    onHud(scene, scene.add.rectangle(VIEW_W / 2, VIEW_H - 46, 484, 10, 0x000000, 0.8)).setDepth(10000).setStrokeStyle(1, 0x6b6a62);
    scene.mbar = onHud(scene, scene.add.rectangle(VIEW_W / 2 - 240, VIEW_H - 46, 480, 6, 0x8e1b12)).setOrigin(0, 0.5).setDepth(10001);
    scene.band = onHud(scene, scene.add.rectangle(VIEW_W / 2, 520, VIEW_W, 104, 0x000000, 0.72)).setDepth(9000).setAlpha(0);
    scene.broken = hud(scene, VIEW_W / 2, 520, "BROKEN", {
      fontFamily: serif, fontSize: "76px", color: "#a3170f", spacing: 18,
    }).setOrigin(0.5).setAlpha(0);
  },
  impact(scene, at) {
    scene.cameras.main.shake(300, 0.006);
    scene.decals.push(scene.add.image(at.x - 18, at.y - 6, "blood").setScale(1.6).setDepth(1.5));
    scene.tweens.add({ targets: scene.band, alpha: 1, duration: 500, delay: 200 });
    scene.tweens.add({ targets: scene.broken, alpha: 1, duration: 900, delay: 300 });
  },
  tick(scene, tl, dt) {
    scene.fog[0].tilePositionX += dt * 0.012; scene.fog[1].tilePositionX -= dt * 0.02;
    const squaresRun = Phaser.Math.Clamp((tl - T_RUN) / STEP, 0, 3);
    scene.mbar.width = 480 * (6 - squaresRun) / 6;  // Grukk's movement allowance is 6
    for (const g of scene.braziers) g.setAlpha(0.42 + Math.random() * 0.16);
    if (tl > T_RESET + 500 && !scene.fading) {
      scene.fading = true;
      for (const c of [scene.cameras.main, scene.hudCam]) c.fadeOut(600, 0, 0, 0);
    }
  },
  reset(scene) {
    if (!scene.band) return;
    scene.band.setAlpha(0); scene.broken.setAlpha(0);
    if (scene.fading) {
      scene.fading = false;
      for (const c of [scene.cameras.main, scene.hudCam]) c.fadeIn(700, 0, 0, 0);
    }
  },
};

const LEAGUE = {
  key: "league", scale: 1, ballScale: 2, bg: "#dfe7e1", hitstop: 420,
  kits: { home: [0x86c5b0, 0xf4f1e8], away: [0xe8661a, 0x7a4220] },
  shadow(scene) {
    return scene.add.ellipse(0, 0, 48, 20, 0x1d3a2a, 0.28).setDepth(2);
  },
  pitch(scene) {
    const g = scene.add.graphics().setDepth(0);
    for (let x = -8; x < COLS + 8; x++)
      for (let y = -8; y < ROWS + 8; y++) {
        if (x >= 0 && y >= 0 && x < COLS && y < ROWS) continue;
        g.fillStyle((x + y) % 2 ? 0xdfe7e1 : 0xdbe4dd).fillPoints(diamond(x, y), true);
        g.lineStyle(1, 0xc6d4cb, 0.9).strokePoints(diamond(x, y), true);
      }
    for (let x = 0; x < COLS; x++)
      for (let y = 0; y < ROWS; y++) {
        const end = x === 0 || x === COLS - 1;
        g.fillStyle(end ? 0x34803a : x % 2 ? 0x3f9a3c : 0x48a543).fillPoints(diamond(x, y), true);
        g.lineStyle(1, 0xffffff, 0.12).strokePoints(diamond(x, y), true);
      }
    g.lineStyle(4, 0xffffff, 1);
    g.strokePoints([iso(0, 0), iso(COLS, 0), iso(COLS, ROWS), iso(0, ROWS)], true);
    for (const gx of [1, COLS / 2, COLS - 1]) { const a = iso(gx, 0), b = iso(gx, ROWS); g.lineBetween(a.x, a.y, b.x, b.y); }
    const mid = centre(COLS / 2 - 0.5, ROWS / 2 - 0.5);
    g.lineStyle(3, 0xffffff, 1).strokeEllipse(mid.x + TW / 4, mid.y + TH / 4, TW * 2.4, TH * 2.4);
    splat(scene, "blood", "224,20,30", 9, 28);
  },
  effects(scene) {
    const cam = scene.cameras.main;
    const cm = cam.postFX.addColorMatrix();
    cm.saturate(0.3);
    cam.postFX.addVignette(0.5, 0.5, 0.95, 0.22);
    const r = rng(9);
    canvasTexture(scene, "grain", 256, 256, (ctx) => {
      const img = ctx.createImageData(256, 256);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = r() * 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    });
    scene.grain = scene.add.tileSprite(0, 0, VIEW_W, VIEW_H, "grain").setOrigin(0).setScrollFactor(0).setDepth(9400)
      .setAlpha(0.09).setBlendMode(Phaser.BlendModes.OVERLAY);
    const bar = Math.round((VIEW_H - VIEW_W / 2.39) / 2);
    onHud(scene, scene.add.rectangle(0, 0, VIEW_W, bar, 0x050505)).setOrigin(0).setDepth(9800);
    onHud(scene, scene.add.rectangle(0, VIEW_H - bar, VIEW_W, bar, 0x050505)).setOrigin(0).setDepth(9800);
    scene.bar = bar;
    scene.card = onHud(scene, scene.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x050505)).setOrigin(0).setDepth(11000).setAlpha(0);
  },
  hud(scene) {
    const sans = "Helvetica Neue, Helvetica, Arial, sans-serif";
    hud(scene, 34, 34, "LEAGUE OFFICE      MATCH 0047      SECOND HALF", { fontFamily: sans, fontSize: "14px", color: "#bfe3d0", spacing: 3 });
    hud(scene, VIEW_W - 34, 30, "HUMANS  1 : 0  ORCS", { fontFamily: sans, fontSize: "18px", color: "#f2efe6", spacing: 3 }).setOrigin(1, 0);
    scene.sub = hud(scene, VIEW_W / 2, VIEW_H - scene.bar / 2, "", {
      fontFamily: sans, fontSize: "20px", color: "#f2efe6", fontStyle: "italic",
    }).setOrigin(0.5);
    scene.panel = onHud(scene, scene.add.container(-420, 400)).setDepth(9700);
    const box = scene.add.rectangle(0, 0, 380, 132, 0xe9f3ee, 0.96).setOrigin(0).setStrokeStyle(1, 0x9cc7b4);
    const lines = [
      ["INCIDENT LOGGED", "13px", "#3c7a62", "bold"],
      ["Player 7, Human Lineman", "18px", "#1e2e27", "normal"],
      ["Status: knocked down", "16px", "#1e2e27", "normal"],
      ["The League values your participation.", "13px", "#5b7369", "italic"],
    ];
    scene.panel.add(box);
    lines.forEach(([s, size, color, style], i) => {
      const t = scene.add.text(20, 16 + i * 27, s, { fontFamily: sans, fontSize: size, color, fontStyle: style });
      if (i === 0 && t.setLetterSpacing) t.setLetterSpacing(3);
      scene.panel.add(t);
    });
    scene.chapter = [
      hud(scene, VIEW_W / 2, VIEW_H / 2 - 50, "CHAPTER 4", { fontFamily: "Rockwell, Didot, serif", fontSize: "26px", color: "#f2e6c8", spacing: 8 }),
      hud(scene, VIEW_W / 2, VIEW_H / 2 + 14, "The Second Half", { fontFamily: '"Didot", "Bodoni 72", serif', fontSize: "64px", color: "#ffd23c", fontStyle: "italic" }),
    ].map((t) => t.setOrigin(0.5).setDepth(11001).setAlpha(0));
  },
  impact(scene, at) {
    [[0, 0], [-16, -8], [12, -12], [24, 6]].forEach(([dx, dy], i) =>
      scene.decals.push(scene.add.image(at.x + dx, at.y + dy, "blood").setScale(i ? 0.5 : 1).setDepth(1.5)));
    scene.tweens.add({ targets: scene.panel, x: 40, duration: 380, delay: 450, ease: "Cubic.Out" });
  },
  tick(scene, tl) {
    scene.grain.tilePositionX = Math.random() * 256; scene.grain.tilePositionY = Math.random() * 256;
    scene.sub.setText(tl < T_RUN ? "Please remain in your assigned square."
      : tl < T_HIT ? "The orc has been asked to approach the ball carrier."
        : "Thank you. The ball carrier has been removed from play.");
    const a = tl < T_RESET ? 0 : tl < T_RESET + 200 ? (tl - T_RESET) / 200 : tl < LOOP - 250 ? 1 : (LOOP - tl) / 250;
    scene.card.setAlpha(a);
    const textA = tl < T_RESET + 300 ? 0 : tl < T_RESET + 500 ? (tl - T_RESET - 300) / 200 : tl < LOOP - 300 ? 1 : Math.max(0, (LOOP - tl - 50) / 250);
    scene.chapter.forEach((t) => t.setAlpha(textA));
  },
  reset(scene) { if (scene.panel) scene.panel.x = -420; },
};

const STYLES = { neon: NEON, ritual: RITUAL, league: LEAGUE };

// ------------------------------------------------------------------ roster

const ROSTER = [
  ["human", "Human lineman", "home"], ["orc", "Orc lineman", "away"], ["elf", "Elf lineman", "home"],
  ["witch_elf", "Witch elf", "away"], ["goblin", "Goblin", "away"], ["gnome", "Gnome", "home"],
  ["vampire", "Vampire", "home"],
];
const DIRS = ["s", "se", "e", "ne", "n", "nw", "w", "sw"];
const ROSTER_H = 380;

/** Every race side by side on its own square, turning through all 8 facings. */
class Roster extends Phaser.Scene {
  constructor() {
    super({ key: "roster" });
    this.anim = "idle";
    this.turning = true;
  }

  preload() { loadRaces(this, "neon", ROSTER.map(([race]) => race)); }

  create() {
    const origin = originOf(this);
    this.cameras.main.setBackgroundColor("#06050b");
    const gap = VIEW_W / ROSTER.length;
    const y = 270, k = 1.5;  // the lineup shows sprites at 3×, half again the pitch size
    const g = this.add.graphics();
    this.cards = ROSTER.map(([race, name, team], i) => {
      const x = gap * (i + 0.5);
      const kit = NEON.kits[team];
      const tile = [[x, y - TH * k / 2], [x + TW * k / 2, y], [x, y + TH * k / 2], [x - TW * k / 2, y]].map(([px, py]) => ({ x: px, y: py }));
      g.fillStyle(0x120f1e).fillPoints(tile, true).lineStyle(1, 0xff2a9d, 0.35).strokePoints(tile, true);
      g.fillStyle(0x000000, 0.5).fillEllipse(x, y, 66, 30).lineStyle(3, kit[0], 0.9).strokeEllipse(x, y, 78, 36);
      const sprites = LAYERS.map((layer, j) => {
        const s = this.add.sprite(x, y, `${race}-${layer}`, "idle/se/0").setOrigin(origin[0], origin[1]).setScale(2 * k);
        if (j > 0) s.setTint(kit[j - 1]);
        return s;
      });
      this.add.text(x, y + 64, name.toUpperCase(), {
        fontFamily: "Futura, Avenir Next Condensed, sans-serif", fontSize: "15px", color: hex(kit[0]), fontStyle: "bold",
      }).setOrigin(0.5, 0);
      return { sprites, phase: i * 333 };
    });
    this.cameras.main.postFX.addBloom(0xffffff, 1, 1, 0.8, 0.6, 4);
    this.clock = 0;
  }

  update(_, dt) {
    this.clock += dt;
    const dir = this.turning ? DIRS[Math.floor(this.clock / 1400) % 8] : "se";
    const n = FRAMES[this.anim];
    const cycle = LOOPS[this.anim] ? Infinity : (n / FPS[this.anim]) * 1000 + 900;
    for (const c of this.cards) {
      const ms = LOOPS[this.anim] ? this.clock + c.phase : this.clock % cycle;
      const name = `${this.anim}/${dir}/${frameAt(this.anim, ms)}`;
      for (const s of c.sprites) s.setFrame(name);
    }
  }
}

function startRoster(parent) {
  return new Phaser.Game({
    type: Phaser.WEBGL, parent, width: VIEW_W, height: ROSTER_H, pixelArt: true, roundPixels: true,
    backgroundColor: "#06050b", scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY },
    scene: Roster,
  });
}
const games = {};

function start(key) {
  for (const [k, g] of Object.entries(games)) if (k !== key) g.loop.sleep();
  if (games[key]) { games[key].loop.wake(); return games[key]; }
  games[key] = new Phaser.Game({
    type: Phaser.WEBGL,
    parent: `frame-${key}`,
    width: VIEW_W,
    height: VIEW_H,
    pixelArt: true,
    roundPixels: true,
    backgroundColor: "#000000",
    preserveDrawingBuffer: true,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY },
    scene: new StyleFrame(STYLES[key]),
  });
  return games[key];
}

window.styleFrames = { start, games, T_HIT, STYLES, MIXED_TEAMS, startRoster };
