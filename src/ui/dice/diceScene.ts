import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import * as CANNON from "cannon-es";
import { soundSettings } from "../sound/settings";

/**
 * 3D dice: a three.js scene with cannon-es physics that acts out a roll the
 * rules engine has already made.
 *
 * The numbers never come from the physics. Each throw is simulated ahead of
 * time; then each die's faces are relabelled (as some rotation of a real
 * die, opposite faces summing to 7) so the face that lands up shows the
 * engine's value. The tumble is for show, the result is exactly the roll.
 *
 * Loaded lazily by DiceTray, so three.js only downloads during a match.
 */

export type DiceKind = "d6" | "block";

/** Block faces in die order: value 1..6 shows this face. */
export const BLOCK_FACES = [
  "skull",
  "both-down",
  "push",
  "push",
  "pow-dodge",
  "pow",
] as const;

export interface DiceTeam {
  key: string;
  /** Lowercase race, for the crest on the six: "human", "orc", anything else. */
  race: string;
  initial: string;
  primary: number;
  secondary: number;
}

export interface DiceRoll {
  kind: DiceKind;
  values: number[];
  team: DiceTeam;
  neon: boolean;
}

type Vec3 = [number, number, number];

const FACE_NORMALS: Vec3[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
]; // BoxGeometry material group order
const LAYOUT = [1, 6, 2, 5, 3, 4]; // value per face; opposite faces sum to 7

/** The 24 rotations of a cube: signed permutation matrices with determinant 1. */
const ROTATIONS: number[][][] = (() => {
  const out: number[][][] = [];
  const perms = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ];
  for (const p of perms)
    for (let signs = 0; signs < 8; signs++) {
      const m = [0, 1, 2].map((r) =>
        [0, 1, 2].map((c) => (c === p[r] ? ((signs >> r) & 1 ? -1 : 1) : 0))
      );
      const det =
        m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
        m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
        m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
      if (det === 1) out.push(m);
    }
  return out;
})();

/** A valid die labelling (a rotation of LAYOUT) with `value` on face `up`. */
export function labelling(up: number, value: number): number[] {
  const options = ROTATIONS.map((m) =>
    FACE_NORMALS.map((n) => {
      const r = [0, 1, 2].map(
        (i) => m[i][0] * n[0] + m[i][1] * n[1] + m[i][2] * n[2]
      );
      return LAYOUT[
        FACE_NORMALS.findIndex((o) => o.every((v, k) => v === r[k]))
      ];
    })
  ).filter((labels) => labels[up] === value);
  // Which of the four is cosmetic only.
  return options[Math.floor(Math.random() * options.length)];
}

/** Index of the face pointing most nearly up, and how nearly. */
function upFace(q: THREE.Quaternion): { face: number; dot: number } {
  let face = 0;
  let dot = -2;
  FACE_NORMALS.forEach((n, i) => {
    const y = new THREE.Vector3(...n).applyQuaternion(q).y;
    if (y > dot) {
      dot = y;
      face = i;
    }
  });
  return { face, dot };
}

// ---------------------------------------------------------------- textures

const hex = (c: number) => "#" + c.toString(16).padStart(6, "0");
const textures = new Map<string, THREE.CanvasTexture>();

function star(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  points = 9
) {
  g.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.55 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.fill();
}

function skull(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  hole: string
) {
  const ink = g.fillStyle;
  g.beginPath();
  g.arc(x, y, r, Math.PI * 0.85, Math.PI * 2.15);
  g.fill();
  g.fillRect(x - r * 0.62, y + r * 0.3, r * 1.24, r * 0.75);
  g.fillStyle = hole;
  for (const sx of [-1, 1]) {
    g.beginPath();
    g.arc(x + sx * r * 0.38, y + r * 0.05, r * 0.26, 0, 7);
    g.fill();
  }
  g.fillStyle = ink;
}

function arrow(
  g: CanvasRenderingContext2D,
  x0: number,
  x1: number,
  y: number,
  w: number
) {
  g.beginPath();
  g.moveTo(x0, y - w / 2);
  g.lineTo(x1 - w * 1.3, y - w / 2);
  g.lineTo(x1 - w * 1.3, y - w * 1.3);
  g.lineTo(x1, y);
  g.lineTo(x1 - w * 1.3, y + w * 1.3);
  g.lineTo(x1 - w * 1.3, y + w / 2);
  g.lineTo(x0, y + w / 2);
  g.fill();
}

function blockIcon(
  g: CanvasRenderingContext2D,
  face: string,
  S: number,
  body: string
) {
  if (face === "skull") skull(g, S / 2, S * 0.45, S * 0.3, body);
  else if (face === "both-down") {
    skull(g, S * 0.33, S * 0.44, S * 0.19, body);
    star(g, S * 0.7, S * 0.5, S * 0.22);
  } else if (face === "push") arrow(g, S * 0.18, S * 0.84, S / 2, S * 0.17);
  else if (face === "pow-dodge") {
    arrow(g, S * 0.14, S * 0.7, S * 0.5, S * 0.14);
    g.fillRect(S * 0.79, S * 0.25, S * 0.08, S * 0.32);
    g.beginPath();
    g.arc(S * 0.83, S * 0.7, S * 0.05, 0, 7);
    g.fill();
  } else {
    star(g, S / 2, S / 2, S * 0.4, 11);
    g.fillStyle = body;
    g.font = `bold ${S * 0.2}px Impact, Georgia, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("POW", S / 2, S / 2 + 4);
  }
}

/** The team's mark on the six. */
function crest(
  g: CanvasRenderingContext2D,
  team: DiceTeam,
  S: number,
  body: string
) {
  const ink = g.fillStyle;
  if (team.race === "orc") {
    g.beginPath();
    g.ellipse(S / 2, S / 2, S * 0.34, S * 0.36, 0, 0, 7);
    g.fill();
    g.fillStyle = body;
    for (const sx of [-1, 1]) {
      g.beginPath();
      g.moveTo(S / 2 + sx * S * 0.27, S * 0.33);
      g.lineTo(S / 2 + sx * S * 0.05, S * 0.43);
      g.lineTo(S / 2 + sx * S * 0.07, S * 0.47);
      g.lineTo(S / 2 + sx * S * 0.28, S * 0.39);
      g.fill();
      g.beginPath();
      g.arc(S / 2 + sx * S * 0.14, S * 0.5, S * 0.045, 0, 7);
      g.fill();
    }
    g.fillRect(S * 0.32, S * 0.63, S * 0.36, S * 0.09);
  } else if (team.race === "human") {
    g.fillRect(S * 0.46, S * 0.38, S * 0.08, S * 0.46);
    g.fillRect(S * 0.27, S * 0.32, S * 0.46, S * 0.17);
    g.beginPath();
    g.moveTo(S * 0.3, S * 0.27);
    g.lineTo(S * 0.3, S * 0.13);
    g.lineTo(S * 0.38, S * 0.2);
    g.lineTo(S * 0.5, S * 0.09);
    g.lineTo(S * 0.62, S * 0.2);
    g.lineTo(S * 0.7, S * 0.13);
    g.lineTo(S * 0.7, S * 0.27);
    g.fill();
  } else {
    // Any other team: its initial on a shield.
    g.beginPath();
    g.moveTo(S * 0.22, S * 0.2);
    g.lineTo(S * 0.78, S * 0.2);
    g.lineTo(S * 0.78, S * 0.55);
    g.quadraticCurveTo(S * 0.78, S * 0.8, S * 0.5, S * 0.88);
    g.quadraticCurveTo(S * 0.22, S * 0.8, S * 0.22, S * 0.55);
    g.fill();
    g.fillStyle = body;
    g.font = `bold ${S * 0.4}px Georgia, serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(team.initial, S / 2, S * 0.53);
  }
  g.fillStyle = ink;
}

function faceTexture(
  roll: DiceRoll,
  value: number,
  layer: "color" | "glow"
): THREE.CanvasTexture {
  const key = [roll.kind, value, roll.team.key, roll.neon, layer].join(":");
  const cached = textures.get(key);
  if (cached) return cached;
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  const body =
    layer === "glow" ? "#000" : roll.neon ? "#141019" : hex(roll.team.primary);
  const ink =
    layer === "glow"
      ? "#fff"
      : roll.neon
        ? hex(roll.team.primary)
        : hex(roll.team.secondary);
  g.fillStyle = body;
  g.fillRect(0, 0, S, S);
  g.fillStyle = g.strokeStyle = ink;
  if (roll.kind === "d6") {
    if (value === 6) crest(g, roll.team, S, body);
    else {
      const at: Record<number, [number, number][]> = {
        1: [[2, 2]],
        2: [
          [1, 1],
          [3, 3],
        ],
        3: [
          [1, 1],
          [2, 2],
          [3, 3],
        ],
        4: [
          [1, 1],
          [3, 1],
          [1, 3],
          [3, 3],
        ],
        5: [
          [1, 1],
          [3, 1],
          [2, 2],
          [1, 3],
          [3, 3],
        ],
      };
      for (const [x, y] of at[value]) {
        g.beginPath();
        g.arc((x * S) / 4, (y * S) / 4, value === 1 ? 30 : 24, 0, 7);
        g.fill();
      }
    }
  } else blockIcon(g, BLOCK_FACES[value - 1], S, body);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  textures.set(key, tex);
  return tex;
}

function faceMaterial(roll: DiceRoll, value: number): THREE.Material {
  const map = faceTexture(roll, value, "color");
  if (roll.neon)
    return new THREE.MeshStandardMaterial({
      map,
      roughness: 0.35,
      metalness: 0.1,
      emissive: new THREE.Color(roll.team.primary),
      emissiveMap: faceTexture(roll, value, "glow"),
      emissiveIntensity: 1.6,
    });
  return new THREE.MeshPhysicalMaterial({
    map,
    roughness: 0.42,
    clearcoat: 0.7,
    clearcoatRoughness: 0.25,
  });
}

// ----------------------------------------------------------------- physics

const TRAY = { w: 8, d: 4.4 };
const STEP = 1 / 120;

interface Throw {
  /** Per frame (60 fps), per die: position then quaternion. */
  frames: number[][][];
  /** Frame index and strength of each hard contact, for the clack. */
  impacts: { frame: number; strength: number }[];
  /** Face index that lands up on each die. */
  ups: number[];
}

/** Throw `count` dice and record them until they rest flat. */
export function simulate(count: number): Throw {
  for (let attempt = 0; attempt < 12; attempt++) {
    const world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -32, 0),
      allowSleep: true,
    });
    const mat = new CANNON.Material();
    world.addContactMaterial(
      new CANNON.ContactMaterial(mat, mat, {
        friction: 0.25,
        restitution: 0.42,
      })
    );
    const wall = (pos: Vec3, euler: Vec3) => {
      const body = new CANNON.Body({
        mass: 0,
        material: mat,
        shape: new CANNON.Plane(),
      });
      body.position.set(...pos);
      body.quaternion.setFromEuler(...euler);
      world.addBody(body);
    };
    wall([0, 0, 0], [-Math.PI / 2, 0, 0]);
    wall([-TRAY.w / 2, 0, 0], [0, Math.PI / 2, 0]);
    wall([TRAY.w / 2, 0, 0], [0, -Math.PI / 2, 0]);
    wall([0, 0, -TRAY.d / 2], [0, 0, 0]);
    wall([0, 0, TRAY.d / 2], [0, Math.PI, 0]);

    const impacts: Throw["impacts"] = [];
    const frames: Throw["frames"] = [];
    const dice = Array.from({ length: count }, (_, i) => {
      const body = new CANNON.Body({
        mass: 1,
        material: mat,
        shape: new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5)),
        sleepSpeedLimit: 0.2,
        sleepTimeLimit: 0.25,
      });
      body.position.set(
        -TRAY.w / 2 + 0.9,
        2.2 + i * 1.1,
        (i - (count - 1) / 2) * 1.3 + (Math.random() - 0.5)
      );
      body.velocity.set(
        6 + Math.random() * 4,
        -2 + Math.random() * 2,
        (Math.random() - 0.5) * 4
      );
      body.angularVelocity.set(
        (Math.random() - 0.5) * 30,
        (Math.random() - 0.5) * 30,
        (Math.random() - 0.5) * 30
      );
      body.quaternion.setFromEuler(
        Math.random() * 6.3,
        Math.random() * 6.3,
        Math.random() * 6.3
      );
      body.addEventListener(
        "collide",
        (e: { contact: CANNON.ContactEquation }) => {
          const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
          if (v > 1.5)
            impacts.push({
              frame: frames.length,
              strength: Math.min(1, v / 12),
            });
        }
      );
      world.addBody(body);
      return body;
    });
    for (let i = 0; i < 60 * 6 * 2; i++) {
      world.step(STEP);
      if (i % 2 === 0)
        frames.push(
          dice.map((b) => [
            b.position.x,
            b.position.y,
            b.position.z,
            b.quaternion.x,
            b.quaternion.y,
            b.quaternion.z,
            b.quaternion.w,
          ])
        );
      if (i > 60 && dice.every((b) => b.sleepState === CANNON.Body.SLEEPING))
        break;
    }
    const ups = dice.map((b) => {
      const { face, dot } = upFace(
        new THREE.Quaternion(
          b.quaternion.x,
          b.quaternion.y,
          b.quaternion.z,
          b.quaternion.w
        )
      );
      return dot > 0.97 ? face : -1;
    });
    // A die cocked against a wall would be ambiguous: throw again.
    if (ups.every((u) => u >= 0)) return { frames, impacts, ups };
  }
  throw new Error("dice would not settle");
}

// ------------------------------------------------------------------- sound

const CLACK_URLS = [1, 2, 3].map((n) => `/assets/sounds/dice-clack-${n}.mp3`);

let audio: AudioContext | null = null;
let clacks: Promise<AudioBuffer[]> | null = null;

/** Recorded single-die knocks, fetched and decoded once. Empty if audio is unavailable: the dice still roll. */
function loadClacks(): Promise<AudioBuffer[]> {
  clacks ??= (async () => {
    audio ??= new AudioContext();
    const ctx = audio;
    return Promise.all(
      CLACK_URLS.map(async (url) =>
        ctx.decodeAudioData(await (await fetch(url)).arrayBuffer())
      )
    );
  })().catch(() => []);
  return clacks;
}

function clack(strength: number) {
  void loadClacks().then((buffers) => {
    if (!audio || buffers.length === 0) return;
    const src = audio.createBufferSource();
    src.buffer = buffers[Math.floor(Math.random() * buffers.length)];
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const gain = audio.createGain();
    gain.gain.value = 0.6 * strength * soundSettings.get().volume;
    src.connect(gain).connect(audio.destination);
    src.start();
  });
}

// ------------------------------------------------------------------- stage

/** One renderer for every roll: browsers cap live WebGL contexts. */
let renderer: THREE.WebGLRenderer | null = null;
function getRenderer(): THREE.WebGLRenderer {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
  }
  return renderer;
}

/** Throws share one renderer, so they take turns. */
let lane: Promise<unknown> = Promise.resolve();

/**
 * Play a roll into `host` and resolve once the dice have settled. Returns
 * the values read back off the top faces, which always equal `roll.values`.
 * A throw asked for while another is in the air starts when it lands.
 */
export function playRoll(
  host: HTMLElement,
  roll: DiceRoll,
  opts: { sound: boolean }
): Promise<number[]> {
  const run = lane.then(() => throwDice(host, roll, opts));
  lane = run.catch(() => undefined);
  return run;
}

function throwDice(
  host: HTMLElement,
  roll: DiceRoll,
  opts: { sound: boolean }
): Promise<number[]> {
  const sim = simulate(roll.values.length);
  if (opts.sound) void loadClacks();
  const gl = getRenderer();
  const width = host.clientWidth;
  const height = host.clientHeight;
  gl.setSize(width, height);
  host.appendChild(gl.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, width / height, 0.1, 100);
  camera.position.set(0, 9.4, 5.4);
  camera.lookAt(0, 0, 0.15);
  scene.add(
    new THREE.HemisphereLight(0xfff4e0, 0x1a1020, roll.neon ? 0.9 : 1.6)
  );
  const sun = new THREE.DirectionalLight(0xffffff, roll.neon ? 1.4 : 2.4);
  sun.position.set(-4, 10, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 5, bottom: -5 });
  scene.add(sun);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(TRAY.w + 4, TRAY.d + 4),
    new THREE.ShadowMaterial({ opacity: 0.45 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const geometry = new RoundedBoxGeometry(1, 1, 1, 4, 0.12);
  const meshes = roll.values.map((value, i) => {
    const labels = labelling(sim.ups[i], value);
    const mesh = new THREE.Mesh(
      geometry,
      labels.map((v) => faceMaterial(roll, v))
    );
    mesh.castShadow = true;
    mesh.userData.labels = labels;
    scene.add(mesh);
    return mesh;
  });

  return new Promise((resolve) => {
    const start = performance.now();
    let played = 0;
    const tick = () => {
      const f = Math.min(
        sim.frames.length - 1,
        Math.floor(((performance.now() - start) / 1000) * 60)
      );
      for (
        ;
        played < sim.impacts.length && sim.impacts[played].frame <= f;
        played++
      )
        if (opts.sound) clack(sim.impacts[played].strength);
      sim.frames[f].forEach(([x, y, z, qx, qy, qz, qw], i) => {
        meshes[i].position.set(x, y, z);
        meshes[i].quaternion.set(qx, qy, qz, qw);
      });
      gl.render(scene, camera);
      if (f < sim.frames.length - 1) {
        requestAnimationFrame(tick);
        return;
      }
      const shown = meshes.map(
        (m) => (m.userData.labels as number[])[upFace(m.quaternion).face]
      );
      geometry.dispose();
      resolve(shown);
    };
    tick();
  });
}
