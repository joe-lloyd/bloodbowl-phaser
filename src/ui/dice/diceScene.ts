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

/** The coin toss: side 1 (heads) carries the first team's crest, side 2 the second's. */
export interface CoinToss {
  kind: "coin";
  side: 1 | 2;
  faces: [DiceTeam, DiceTeam];
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

function coinTexture(team: DiceTeam, neon: boolean): THREE.CanvasTexture {
  const key = ["coin", team.key, neon].join(":");
  const cached = textures.get(key);
  if (cached) return cached;
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  const body = neon ? "#141019" : hex(team.primary);
  const ink = neon ? hex(team.primary) : hex(team.secondary);
  g.fillStyle = body;
  g.fillRect(0, 0, S, S);
  g.strokeStyle = g.fillStyle = ink;
  g.lineWidth = 10;
  g.beginPath();
  g.arc(S / 2, S / 2, S * 0.43, 0, 7);
  g.stroke();
  g.save();
  g.translate(S * 0.17, S * 0.17);
  g.scale(0.66, 0.66);
  crest(g, team, S, body);
  g.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  textures.set(key, tex);
  return tex;
}

/** A coin face as an image, to show the coach which side is whose. */
export function coinFaceImage(team: DiceTeam, neon: boolean): string {
  return (coinTexture(team, neon).image as HTMLCanvasElement).toDataURL();
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
/** The throw on screen; a new one takes the renderer over from it. */
let showing: { stop(): void } | null = null;

/** A throw on screen: it lands, lifts its dice to face the viewer, and holds. */
export interface DiceThrow {
  /** The values, once the dice have landed and been lifted up to be read. */
  landed: Promise<number[]>;
  /** Called with a die's index when the coach clicks a lifted die. */
  onPick(listener: (index: number) => void): void;
  /** Bring one die forward (the chosen block result), or reset with null. */
  mark(index: number | null): void;
  /** Stop drawing this throw. */
  stop(): void;
  /** Play the rest of the tumble faster: more rolls wait behind it. */
  hurry(): void;
}

type Control = Pick<DiceThrow, "mark" | "stop" | "hurry">;

/** How much faster a hurried throw tumbles. */
const HURRY_RATE = 2.2;

/**
 * Throw a roll into `host`. Every roll, D6 or block dice, plays the same way
 * in the same box: the dice tumble and land, then lift up toward the viewer
 * with their result face turned to the front, and stay there until the next
 * throw or stop(). A throw asked for while another is in the air starts
 * when that one has landed.
 */
export function playRoll(
  host: HTMLElement,
  roll: DiceRoll | CoinToss,
  opts: { sound: boolean }
): DiceThrow {
  const pickers: ((index: number) => void)[] = [];
  let marked: number | null = null;
  let control: Control | null = null;
  let stopped = false;
  let hurried = false;
  const landed = lane.then(() => {
    if (stopped) return roll.kind === "coin" ? [roll.side] : roll.values;
    const hooks = {
      pick: (index: number) => pickers.forEach((listener) => listener(index)),
      ready: (c: Control) => {
        control = c;
        c.mark(marked);
        if (hurried) c.hurry();
      },
    };
    return roll.kind === "coin"
      ? throwCoin(host, roll, opts, hooks)
      : throwDice(host, roll, opts, hooks);
  });
  lane = landed.catch(() => undefined);
  return {
    landed,
    onPick: (listener) => pickers.push(listener),
    mark: (index) => {
      marked = index;
      control?.mark(index);
    },
    stop: () => {
      stopped = true;
      control?.stop();
    },
    hurry: () => {
      hurried = true;
      control?.hurry();
    },
  };
}

/** The box every throw plays in: renderer, camera, lights and a shadow floor. */
function stage(host: HTMLElement, neon: boolean) {
  const gl = getRenderer();
  const width = host.clientWidth;
  const height = host.clientHeight;
  gl.setSize(width, height);
  host.appendChild(gl.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, width / height, 0.1, 100);
  camera.position.set(0, 9.4, 5.4);
  const lookAt = new THREE.Vector3(0, 0, 0.15);
  camera.lookAt(lookAt);
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x1a1020, neon ? 0.9 : 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, neon ? 1.4 : 2.4);
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
  return { gl, scene, camera, lookAt };
}

const COIN = { radius: 1.05, thickness: 0.12 };
const FLIP_MS = 1500;
const SETTLE_MS = 380;

/**
 * Toss the coin: it spins end over end across the box and lands with the
 * engine's side up, wobbles to rest, then lifts to face the viewer. The
 * side is decided before the throw; the spin only shows it.
 */
function throwCoin(
  host: HTMLElement,
  toss: CoinToss,
  opts: { sound: boolean },
  hooks: { ready: (control: Control) => void }
): Promise<number[]> {
  showing?.stop();
  if (opts.sound) void loadClacks();
  const { gl, scene, camera, lookAt } = stage(host, toss.neon);

  const geometry = new THREE.CylinderGeometry(
    COIN.radius,
    COIN.radius,
    COIN.thickness,
    64
  );
  const edge = new THREE.MeshStandardMaterial({
    color: 0xc9a227,
    metalness: 0.85,
    roughness: 0.3,
  });
  const face = (team: DiceTeam) =>
    new THREE.MeshPhysicalMaterial({
      map: coinTexture(team, toss.neon),
      metalness: 0.35,
      roughness: 0.4,
      clearcoat: 0.6,
    });
  // Cylinder groups: the edge, the top cap (heads), the bottom cap (tails)
  const coin = new THREE.Mesh(geometry, [
    edge,
    face(toss.faces[0]),
    face(toss.faces[1]),
  ]);
  coin.castShadow = true;
  scene.add(coin);

  // An even number of half turns lands heads up, an odd number tails
  const spin = Math.PI * (toss.side === 1 ? 10 : 11);
  const rest = COIN.thickness / 2;
  const from = new THREE.Vector3(-2.6, rest, 0.4);
  const to = new THREE.Vector3(0, rest, 0);

  // Lifted: the landed face turned to the viewer, upright on screen
  const liftedAt = camera.position.clone().lerp(lookAt, 0.5);
  const toCamera = camera.position.clone().sub(liftedAt).normalize();
  const screenUp = new THREE.Vector3(0, 1, 0)
    .applyQuaternion(camera.quaternion)
    .projectOnPlane(toCamera)
    .normalize();
  // A cap's texture runs "up" along +X on the top and -X on the bottom
  const normal = new THREE.Vector3(0, toss.side === 1 ? 1 : -1, 0);
  const textureUp = new THREE.Vector3(toss.side === 1 ? 1 : -1, 0, 0);
  const liftedTurn = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4()
      .makeBasis(toCamera, screenUp, toCamera.clone().cross(screenUp))
      .multiply(
        new THREE.Matrix4()
          .makeBasis(normal, textureUp, normal.clone().cross(textureUp))
          .transpose()
      )
  );

  let running = true;
  // A coin stopped mid-flip still counts as landed: anything waiting on it,
  // and every throw queued behind it, carries on.
  let resolve: (values: number[]) => void = () => {};
  const landed = new Promise<number[]>((done) => (resolve = done));
  const control = {
    stop: () => {
      if (!running) return;
      running = false;
      if (showing === control) showing = null;
      geometry.dispose();
      resolve([toss.side]);
    },
    mark: () => {},
    hurry: () => {},
  };
  showing = control;
  hooks.ready(control);

  {
    const start = performance.now();
    let landedAt: number | null = null;
    let restTurn: THREE.Quaternion | null = null;
    const tick = () => {
      if (!running) return;
      const elapsed = performance.now() - start;
      if (elapsed < FLIP_MS) {
        const t = elapsed / FLIP_MS;
        coin.position.lerpVectors(from, to, t);
        coin.position.y = rest + 2.4 * 4 * t * (1 - t);
        coin.rotation.set(0, 0, spin * t);
      } else if (elapsed < FLIP_MS + SETTLE_MS) {
        if (landedAt === null) {
          landedAt = elapsed;
          if (opts.sound) clack(0.7);
        }
        const u = (elapsed - FLIP_MS) / SETTLE_MS;
        coin.position.copy(to);
        coin.rotation.set(
          0.22 * (1 - u) ** 2 * Math.sin(u * 22),
          0,
          spin + 0.18 * (1 - u) ** 2 * Math.cos(u * 22)
        );
      } else {
        if (!restTurn) {
          coin.position.copy(to);
          coin.rotation.set(0, 0, spin);
          restTurn = coin.quaternion.clone();
          // Lifted off the table it casts no shadow on it
          coin.castShadow = false;
          resolve([toss.side]);
        }
        const t = Math.min(1, (elapsed - FLIP_MS - SETTLE_MS) / LIFT_MS);
        const ease = 1 - Math.pow(1 - t, 3);
        coin.position.lerpVectors(to, liftedAt, ease);
        coin.quaternion.slerpQuaternions(restTurn, liftedTurn, ease);
      }
      gl.render(scene, camera);
      requestAnimationFrame(tick);
    };
    tick();
  }
  return landed;
}

/** How far toward the camera the lifted dice sit (0 = table, 1 = lens). */
const LIFT = 0.63;
const LIFT_MS = 420;

function throwDice(
  host: HTMLElement,
  roll: DiceRoll,
  opts: { sound: boolean },
  hooks: {
    pick: (index: number) => void;
    ready: (control: Control) => void;
  }
): Promise<number[]> {
  showing?.stop();
  const sim = simulate(roll.values.length);
  if (opts.sound) void loadClacks();
  const { gl, scene, camera, lookAt } = stage(host, roll.neon);

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

  // Lifted: in a row between the table and the lens, result face forward
  const lifted = meshes.map((_mesh, i) => {
    const spread = (i - (meshes.length - 1) / 2) * 1.35;
    const position = camera.position
      .clone()
      .lerp(lookAt, LIFT)
      .add(new THREE.Vector3(spread, 0, 0));
    return { position, quaternion: new THREE.Quaternion() };
  });
  const faceForward = (mesh: THREE.Mesh, at: THREE.Vector3) => {
    const { face } = upFace(mesh.quaternion);
    const local = new THREE.Vector3(...FACE_NORMALS[face]);
    // A face next to it keeps the face upright on screen
    const side = new THREE.Vector3(
      ...FACE_NORMALS[FACE_NORMALS.findIndex((_n, k) => k >> 1 !== face >> 1)]
    );
    const toCamera = camera.position.clone().sub(at).normalize();
    const screenUp = new THREE.Vector3(0, 1, 0)
      .applyQuaternion(camera.quaternion)
      .projectOnPlane(toCamera)
      .normalize();
    const world = new THREE.Matrix4().makeBasis(
      toCamera,
      screenUp,
      toCamera.clone().cross(screenUp)
    );
    const body = new THREE.Matrix4().makeBasis(
      local,
      side,
      local.clone().cross(side)
    );
    return new THREE.Quaternion().setFromRotationMatrix(
      world.multiply(body.transpose())
    );
  };

  let running = true;
  let markedIndex: number | null = null;
  // Dice stopped mid-air still count as landed on the engine's values:
  // anything waiting on them, and every throw queued behind them, carries on.
  let resolve: (values: number[]) => void = () => {};
  const landed = new Promise<number[]>((done) => (resolve = done));
  const stop = () => {
    if (!running) return;
    running = false;
    if (showing === control) showing = null;
    gl.domElement.removeEventListener("pointerdown", onPointerDown);
    gl.domElement.removeEventListener("pointermove", onPointerMove);
    gl.domElement.style.cursor = "";
    geometry.dispose();
    resolve(roll.values);
  };
  // Playback speed of the recorded tumble; hurry() raises it
  let rate = 1;
  const control = {
    stop,
    mark: (index: number | null) => {
      markedIndex = index;
    },
    hurry: () => {
      rate = HURRY_RATE;
    },
  };
  showing = control;

  // Clicking a lifted die picks it
  let liftedAt: number | null = null;
  const raycaster = new THREE.Raycaster();
  const dieAt = (event: PointerEvent): number => {
    if (liftedAt === null) return -1;
    const box = gl.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((event.clientX - box.left) / box.width) * 2 - 1,
      -((event.clientY - box.top) / box.height) * 2 + 1
    );
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(meshes)[0];
    return hit ? meshes.findIndex((m) => m === hit.object) : -1;
  };
  const onPointerDown = (event: PointerEvent) => {
    const index = dieAt(event);
    if (index >= 0) hooks.pick(index);
  };
  const onPointerMove = (event: PointerEvent) => {
    gl.domElement.style.cursor = dieAt(event) >= 0 ? "pointer" : "";
  };
  gl.domElement.addEventListener("pointerdown", onPointerDown);
  gl.domElement.addEventListener("pointermove", onPointerMove);
  hooks.ready(control);

  {
    // Tumble time played so far, at the current rate
    let tumbleMs = 0;
    let lastFrame = performance.now();
    let played = 0;
    let settled:
      | { position: THREE.Vector3; quaternion: THREE.Quaternion }[]
      | null = null;
    const tick = () => {
      if (!running) return;
      const now = performance.now();
      tumbleMs += (now - lastFrame) * rate;
      lastFrame = now;
      const f = Math.min(
        sim.frames.length - 1,
        Math.floor((tumbleMs / 1000) * 60)
      );
      if (!settled) {
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
        if (f === sim.frames.length - 1) {
          settled = meshes.map((m) => ({
            position: m.position.clone(),
            quaternion: m.quaternion.clone(),
          }));
          meshes.forEach((m, i) => {
            lifted[i].quaternion = faceForward(m, lifted[i].position);
          });
          liftedAt = performance.now();
          resolve(
            meshes.map(
              (m) => (m.userData.labels as number[])[upFace(m.quaternion).face]
            )
          );
        }
      } else {
        const t = Math.min(1, (performance.now() - liftedAt!) / LIFT_MS);
        const ease = 1 - Math.pow(1 - t, 3);
        meshes.forEach((m, i) => {
          m.position.lerpVectors(
            settled![i].position,
            lifted[i].position,
            ease
          );
          m.quaternion.slerpQuaternions(
            settled![i].quaternion,
            lifted[i].quaternion,
            ease
          );
          const target =
            markedIndex === null ? 1 : markedIndex === i ? 1.2 : 0.75;
          m.scale.setScalar(m.scale.x + (target - m.scale.x) * 0.2);
        });
      }
      gl.render(scene, camera);
      requestAnimationFrame(tick);
    };
    tick();
  }
  return landed;
}
