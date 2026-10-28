// 3D dice for the match UI mockup: a three.js popover with cannon-es physics.
//
// The numbers never come from the physics. The rules engine rolls first
// (here a seeded mulberry32, the same generator as the game's RNGService,
// seeded from crypto), then each throw is simulated ahead of time, and the
// die's faces are relabelled so whichever face lands up shows the rolled
// value. The tumble is for show; the result is exactly what was rolled.
//
//   const { values, chosen } = await Dice.roll({ kind: "block", count: 2, team, chooser: "you" })

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import * as CANNON from "cannon-es";

// ------------------------------------------------------------------ random

/** mulberry32, as in src/services/rng/DeterministicRNG.ts. */
function mulberry32(seed) {
  let s = seed >>> 0;
  const next = () => {
    let t = (s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, seed: () => s };
}
const initialSeed = crypto.getRandomValues(new Uint32Array(1))[0];
const engine = mulberry32(initialSeed);
const rollDie = (sides) => Math.floor(engine.next() * sides) + 1;

/** Roll n d6 through a fresh generator and return counts and chi-square, to show the spread is fair. */
function fairness(n = 600000) {
  const g = mulberry32(crypto.getRandomValues(new Uint32Array(1))[0]);
  const counts = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < n; i++) counts[Math.floor(g.next() * 6)]++;
  const e = n / 6;
  const chi2 = counts.reduce((a, c) => a + (c - e) ** 2 / e, 0);
  return { n, counts, chi2 };  // 5 degrees of freedom: under 11.07 passes at the 5% level
}

// ------------------------------------------------------------------- faces

const BLOCK = ["Attacker Down", "Both Down", "Push", "Push", "Defender Stumbles", "Defender Down"];
const FACE_NORMALS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];  // BoxGeometry group order
const LAYOUT = [1, 6, 2, 5, 3, 4];  // value per face; opposite faces sum to 7

/** The 24 rotations of a cube, as signed permutation matrices with determinant 1. */
const ROTATIONS = (() => {
  const out = [];
  const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  for (const p of perms)
    for (let signs = 0; signs < 8; signs++) {
      const m = [0, 1, 2].map((r) => [0, 0, 0].map((_, c) => (c === p[r] ? ((signs >> r) & 1 ? -1 : 1) : 0)));
      const det = m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
      if (det === 1) out.push(m);
    }
  return out;
})();

/** A valid die labelling (some rotation of LAYOUT) that puts `value` on face `up`. */
function labelling(up, value) {
  const options = ROTATIONS.map((m) => FACE_NORMALS.map((n) => {
    const r = [0, 1, 2].map((i) => m[i][0] * n[0] + m[i][1] * n[1] + m[i][2] * n[2]);
    return LAYOUT[FACE_NORMALS.findIndex((o) => o.every((v, k) => v === r[k]))];
  })).filter((labels) => labels[up] === value);
  return options[Math.floor(Math.random() * options.length)];  // which of the four is cosmetic only
}

// ---------------------------------------------------------------- textures

const hex = (c) => "#" + c.toString(16).padStart(6, "0");
const textures = new Map();

function faceCanvas(kind, value, team, theme, layer) {
  const key = [kind, value, team.key, theme, layer].join(":");
  if (textures.has(key)) return textures.get(key);
  const S = 256, c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d");
  const neon = theme === "neon";
  // colour layer: the die body with its markings; glow layer: markings only, for neon's emissive map
  const body = layer === "glow" ? "#000" : neon ? "#141019" : hex(team.kit[0]);
  const ink = layer === "glow" ? "#fff" : neon ? hex(team.kit[0]) : team.ink;
  g.fillStyle = body;
  g.fillRect(0, 0, S, S);
  g.fillStyle = g.strokeStyle = ink;
  g.lineCap = g.lineJoin = "round";
  if (kind === "d6") {
    if (value === 6) crest(g, team.race, S, body);
    else {
      const at = { 1: [[2, 2]], 2: [[1, 1], [3, 3]], 3: [[1, 1], [2, 2], [3, 3]], 4: [[1, 1], [3, 1], [1, 3], [3, 3]], 5: [[1, 1], [3, 1], [2, 2], [1, 3], [3, 3]] }[value];
      for (const [x, y] of at) { g.beginPath(); g.arc(x * S / 4, y * S / 4, value === 1 ? 30 : 24, 0, 7); g.fill(); }
    }
  } else blockIcon(g, BLOCK[value - 1], S, body);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  textures.set(key, tex);
  return tex;
}

function skull(g, x, y, r, hole) {
  g.beginPath(); g.arc(x, y, r, Math.PI * 0.85, Math.PI * 2.15); g.fill();
  g.fillRect(x - r * 0.62, y + r * 0.3, r * 1.24, r * 0.75);
  g.fillStyle = hole;
  for (const sx of [-1, 1]) { g.beginPath(); g.arc(x + sx * r * 0.38, y + r * 0.05, r * 0.26, 0, 7); g.fill(); }
  g.beginPath(); g.moveTo(x, y + r * 0.3); g.lineTo(x - r * 0.12, y + r * 0.55); g.lineTo(x + r * 0.12, y + r * 0.55); g.fill();
  for (const sx of [-0.3, 0, 0.3]) g.fillRect(x + sx * r - r * 0.05, y + r * 0.78, r * 0.1, r * 0.27);
}

function star(g, x, y, r, points = 9) {
  g.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.55 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.fill();
}

function arrow(g, x0, x1, y, w) {
  g.beginPath();
  g.moveTo(x0, y - w / 2); g.lineTo(x1 - w * 1.3, y - w / 2); g.lineTo(x1 - w * 1.3, y - w * 1.3);
  g.lineTo(x1, y); g.lineTo(x1 - w * 1.3, y + w * 1.3); g.lineTo(x1 - w * 1.3, y + w / 2); g.lineTo(x0, y + w / 2);
  g.fill();
}

function blockIcon(g, face, S, body) {
  const ink = g.fillStyle;
  if (face === "Attacker Down") skull(g, S / 2, S * 0.45, S * 0.3, body);
  else if (face === "Both Down") {
    skull(g, S * 0.33, S * 0.44, S * 0.19, body);
    g.fillStyle = ink;
    star(g, S * 0.7, S * 0.5, S * 0.22);
  } else if (face === "Push") arrow(g, S * 0.18, S * 0.84, S / 2, S * 0.17);
  else if (face === "Defender Stumbles") {
    arrow(g, S * 0.14, S * 0.7, S * 0.5, S * 0.14);
    g.fillRect(S * 0.79, S * 0.25, S * 0.08, S * 0.32);
    g.beginPath(); g.arc(S * 0.83, S * 0.7, S * 0.05, 0, 7); g.fill();
  } else {
    star(g, S / 2, S / 2, S * 0.4, 11);
    g.fillStyle = body;
    g.font = `bold ${S * 0.2}px Impact, Georgia, sans-serif`;
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("POW", S / 2, S / 2 + 4);
  }
}

/** The team's mark on the six: a crowned hammer for Humans, a tusked face for Orcs. */
function crest(g, race, S, body) {
  const ink = g.fillStyle;
  if (race === "orc") {
    g.beginPath(); g.ellipse(S / 2, S / 2, S * 0.34, S * 0.36, 0, 0, 7); g.fill();
    g.fillStyle = body;
    for (const sx of [-1, 1]) {
      g.beginPath(); g.moveTo(S / 2 + sx * S * 0.27, S * 0.33); g.lineTo(S / 2 + sx * S * 0.05, S * 0.43); g.lineTo(S / 2 + sx * S * 0.07, S * 0.47); g.lineTo(S / 2 + sx * S * 0.28, S * 0.39); g.fill();
      g.beginPath(); g.arc(S / 2 + sx * S * 0.14, S * 0.5, S * 0.045, 0, 7); g.fill();
    }
    g.fillRect(S * 0.32, S * 0.63, S * 0.36, S * 0.09);
    g.fillStyle = ink;
    for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(S / 2 + sx * S * 0.13, S * 0.68); g.lineTo(S / 2 + sx * S * 0.17, S * 0.52); g.lineTo(S / 2 + sx * S * 0.08, S * 0.68); g.fill(); }
  } else {
    g.fillRect(S * 0.46, S * 0.38, S * 0.08, S * 0.46);
    g.fillRect(S * 0.27, S * 0.32, S * 0.46, S * 0.17);
    g.beginPath();
    g.moveTo(S * 0.3, S * 0.27); g.lineTo(S * 0.3, S * 0.13); g.lineTo(S * 0.38, S * 0.2); g.lineTo(S * 0.5, S * 0.09);
    g.lineTo(S * 0.62, S * 0.2); g.lineTo(S * 0.7, S * 0.13); g.lineTo(S * 0.7, S * 0.27);
    g.fill();
  }
}

function faceMaterial(kind, value, team, theme) {
  const map = faceCanvas(kind, value, team, theme, "color");
  if (theme === "neon")
    return new THREE.MeshStandardMaterial({ map, roughness: 0.35, metalness: 0.1, emissive: new THREE.Color(team.kit[0]), emissiveMap: faceCanvas(kind, value, team, theme, "glow"), emissiveIntensity: 1.6 });
  return new THREE.MeshPhysicalMaterial({ map, roughness: 0.42, clearcoat: 0.7, clearcoatRoughness: 0.25 });
}

// ----------------------------------------------------------------- physics

const TRAY = { w: 8, d: 4.4 };
const STEP = 1 / 120;

/** Throw `count` dice and record every 1/60 s until they rest. Returns frames, impacts and the face each lands on. */
function simulate(count) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -32, 0), allowSleep: true });
    const mat = new CANNON.Material();
    world.addContactMaterial(new CANNON.ContactMaterial(mat, mat, { friction: 0.25, restitution: 0.42 }));
    const wall = (pos, euler) => {
      const b = new CANNON.Body({ mass: 0, material: mat, shape: new CANNON.Plane() });
      b.position.set(...pos);
      b.quaternion.setFromEuler(...euler);
      world.addBody(b);
    };
    wall([0, 0, 0], [-Math.PI / 2, 0, 0]);
    wall([-TRAY.w / 2, 0, 0], [0, Math.PI / 2, 0]);
    wall([TRAY.w / 2, 0, 0], [0, -Math.PI / 2, 0]);
    wall([0, 0, -TRAY.d / 2], [0, 0, 0]);
    wall([0, 0, TRAY.d / 2], [0, Math.PI, 0]);
    const impacts = [];
    let frame = 0;
    const dice = Array.from({ length: count }, (_, i) => {
      const b = new CANNON.Body({ mass: 1, material: mat, shape: new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5)), sleepSpeedLimit: 0.2, sleepTimeLimit: 0.25 });
      b.position.set(-TRAY.w / 2 + 0.9, 2.2 + i * 1.1, (i - (count - 1) / 2) * 1.3 + (Math.random() - 0.5));
      b.velocity.set(6 + Math.random() * 4, -2 + Math.random() * 2, (Math.random() - 0.5) * 4);
      b.angularVelocity.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30);
      b.quaternion.setFromEuler(Math.random() * 6.3, Math.random() * 6.3, Math.random() * 6.3);
      b.addEventListener("collide", (e) => {
        const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
        if (v > 1.5) impacts.push({ frame, strength: Math.min(1, v / 12) });
      });
      world.addBody(b);
      return b;
    });
    const frames = [];
    for (let i = 0; i < 60 * 6 * 2; i++) {
      world.step(STEP);
      if (i % 2 === 0) {
        frames.push(dice.map((b) => [b.position.x, b.position.y, b.position.z, b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w]));
        frame = frames.length;
      }
      if (i > 60 && dice.every((b) => b.sleepState === CANNON.Body.SLEEPING)) break;
    }
    // which face points up on each die; a die cocked against a wall means throw again
    const ups = dice.map((b) => {
      const q = new THREE.Quaternion(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
      let best = -1, dot = -2;
      FACE_NORMALS.forEach((n, i) => {
        const y = new THREE.Vector3(...n).applyQuaternion(q).y;
        if (y > dot) { dot = y; best = i; }
      });
      return dot > 0.97 ? best : -1;
    });
    if (ups.every((u) => u >= 0)) return { frames, impacts, ups };
  }
  throw new Error("dice would not settle");
}

// ------------------------------------------------------------------- sound

let audio;
function clack(strength) {
  audio ||= new AudioContext();
  const n = audio.createBufferSource(), len = 0.05;
  const buf = audio.createBuffer(1, audio.sampleRate * len, audio.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 3;
  n.buffer = buf;
  const f = audio.createBiquadFilter();
  f.type = "bandpass"; f.frequency.value = 1800 + Math.random() * 1400; f.Q.value = 1.4;
  const v = audio.createGain();
  v.gain.value = 0.25 * strength;
  n.connect(f).connect(v).connect(audio.destination);
  n.start();
}

// ------------------------------------------------------------------- popover

// One renderer for every roll: browsers cap live WebGL contexts at about 16,
// and a renderer per roll runs out within a match.
let shared;
function renderer() {
  if (!shared) {
    shared = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    shared.setPixelRatio(Math.min(devicePixelRatio, 2));
    shared.shadowMap.enabled = true;
    shared.shadowMap.type = THREE.PCFShadowMap;
    shared.toneMapping = THREE.ACESFilmicToneMapping;
  }
  return shared;
}

const el = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; };

/**
 * Show a roll. spec: { kind: "d6" | "block", count, team, theme, title, target?, chooser?, values? }
 * team: { key, name, race, kit: [primary, secondary], ink }. Resolves with { values, chosen }.
 */
function roll(spec) {
  const values = spec.values || Array.from({ length: spec.count }, () => rollDie(6));
  const sim = simulate(values.length);
  const pop = el(`<div class="panel dice-pop show-later"><div class="dice-head"><span class="dice-team"></span><span class="dice-title"></span></div>
    <div class="dice-stage"></div><div class="dice-foot"><span class="dice-result">Rolling…</span><span class="dice-seed"></span></div></div>`);
  pop.querySelector(".dice-team").textContent = spec.team.name;
  pop.querySelector(".dice-team").style.color = hex(spec.team.kit[0]);
  pop.querySelector(".dice-title").textContent = spec.title;
  pop.querySelector(".dice-seed").textContent = `seed ${initialSeed.toString(16)}`;
  document.querySelector(".hud").appendChild(pop);
  requestAnimationFrame(() => pop.classList.remove("show-later"));

  const stage = pop.querySelector(".dice-stage");
  const W = stage.clientWidth, H = stage.clientHeight;
  const gl = renderer();
  gl.setSize(W, H);
  stage.appendChild(gl.domElement);
  const listeners = new AbortController();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, W / H, 0.1, 100);
  camera.position.set(0, 9.4, 5.4);
  camera.lookAt(0, 0, 0.15);
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x1a1020, spec.theme === "neon" ? 0.9 : 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, spec.theme === "neon" ? 1.4 : 2.4);
  sun.position.set(-4, 10, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 5, bottom: -5 });
  scene.add(sun);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(TRAY.w + 4, TRAY.d + 4), new THREE.ShadowMaterial({ opacity: 0.45 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const geom = new RoundedBoxGeometry(1, 1, 1, 4, 0.12);
  const meshes = values.map((v, i) => {
    const labels = labelling(sim.ups[i], v);
    const m = new THREE.Mesh(geom, labels.map((value) => faceMaterial(spec.kind, value, spec.team, spec.theme)));
    m.castShadow = true;
    m.userData.labels = labels;
    scene.add(m);
    return m;
  });

  return new Promise((resolve) => {
    const start = performance.now();
    let played = 0, done = false, chosen = null;
    const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
    let hoverIdx = -1;

    const finish = () => {
      done = true;
      window.Dice.last = { rolled: values.slice(), shown: shownValues(meshes) };
      const words = spec.kind === "block" ? values.map((v) => BLOCK[v - 1]) : values;
      const res = pop.querySelector(".dice-result");
      if (spec.kind === "block" && values.length > 1 && spec.chooser === "you") {
        res.textContent = "Pick a die";
        pop.classList.add("picking");
      } else if (spec.kind === "block" && values.length > 1) {
        // the other coach picks: here they take the worst for you
        const order = ["Attacker Down", "Both Down", "Push", "Defender Stumbles", "Defender Down"];
        chosen = values.reduce((best, v, i) => (order.indexOf(BLOCK[v - 1]) < order.indexOf(BLOCK[values[best] - 1]) ? i : best), 0);
        res.textContent = `They choose: ${BLOCK[values[chosen] - 1]}`;
        close(1500);
      } else {
        const total = values.reduce((a, b) => a + b, 0);
        const pass = spec.target ? total >= spec.target : null;
        res.innerHTML = spec.kind === "block" ? BLOCK[values[0] - 1]
          : `${words.join(" + ")}${values.length > 1 ? ` = ${total}` : ""}${pass === null ? "" : pass ? ' · <b class="ok">Success</b>' : ' · <b class="bad">Failed</b>'}`;
        chosen = 0;
        close(1500);
      }
    };
    const close = (ms) => setTimeout(() => {
      pop.classList.add("show-later");
      setTimeout(() => { listeners.abort(); geom.dispose(); pop.remove(); }, 220);
      resolve({ values, chosen, faces: spec.kind === "block" ? values.map((v) => BLOCK[v - 1]) : values });
    }, ms);

    gl.domElement.addEventListener("pointermove", (e) => {
      if (!pop.classList.contains("picking")) return;
      const r = gl.domElement.getBoundingClientRect();
      mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(mouse, camera);
      const hit = ray.intersectObjects(meshes)[0];
      hoverIdx = hit ? meshes.indexOf(hit.object) : -1;
      pop.querySelector(".dice-result").textContent = hoverIdx >= 0 ? BLOCK[values[hoverIdx] - 1] : "Pick a die";
      gl.domElement.style.cursor = hoverIdx >= 0 ? "pointer" : "default";
    }, { signal: listeners.signal });
    gl.domElement.addEventListener("click", () => {
      if (!pop.classList.contains("picking") || hoverIdx < 0) return;
      chosen = hoverIdx;
      pop.classList.remove("picking");
      pop.querySelector(".dice-result").textContent = `You choose: ${BLOCK[values[chosen] - 1]}`;
      close(900);
    }, { signal: listeners.signal });

    const tick = () => {
      if (!pop.isConnected) return;
      const f = Math.min(sim.frames.length - 1, Math.floor(((performance.now() - start) / 1000) * 60));
      for (; played < sim.impacts.length && sim.impacts[played].frame <= f; played++) clack(sim.impacts[played].strength);
      sim.frames[f].forEach(([x, y, z, qx, qy, qz, qw], i) => {
        meshes[i].position.set(x, y, z);
        meshes[i].quaternion.set(qx, qy, qz, qw);
        if (pop.classList.contains("picking") && i === hoverIdx) meshes[i].position.y += 0.25;
        meshes[i].material.forEach((m) => { m.opacity = chosen !== null && i !== chosen ? 0.35 : 1; m.transparent = m.opacity < 1; });
      });
      if (!done && f === sim.frames.length - 1) finish();
      gl.render(scene, camera);
      requestAnimationFrame(tick);
    };
    tick();
  });
}

/** The value on top of each die, read back from the meshes: proof the dice show what was rolled. */
function shownValues(meshes) {
  return meshes.map((m) => {
    let best = 0, top = -2;
    FACE_NORMALS.forEach((n, i) => {
      const y = new THREE.Vector3(...n).applyQuaternion(m.quaternion).y;
      if (y > top) { top = y; best = i; }
    });
    return m.userData.labels[best];
  });
}

window.Dice = { roll, rollDie, fairness, seed: initialSeed, BLOCK, _labelling: labelling, _simulate: simulate };
window.dispatchEvent(new Event("dice-ready"));
