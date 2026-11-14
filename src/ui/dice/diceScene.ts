import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { D16_FACE_UP, d16Geometry, d16Labelling } from "./d16";
import { coinTexture, faceMaterial } from "./diceFaces";
import {
  FACE_NORMALS,
  labelling,
  normals,
  simulate,
  TRAY,
  upFace,
} from "./dicePhysics";
import { clack, loadClacks } from "./diceSound";

/**
 * 3D dice: a three.js scene with cannon-es physics that acts out a roll the
 * rules engine has already made.
 *
 * The numbers never come from the physics. Each throw is simulated ahead of
 * time; then each die's faces are relabelled (as some rotation of a real
 * die) so the face that lands up shows the engine's value. The tumble is
 * for show, the result is exactly the roll.
 *
 * Loaded lazily by DiceTray, so three.js only downloads during a match.
 */

export type DiceKind = "d6" | "d16" | "block";

export { BLOCK_FACES, coinFaceImage } from "./diceFaces";
export { labelling, simulate } from "./dicePhysics";

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

/** How much faster a hurried throw tumbles, at the least. */
const HURRY_RATE = 2.2;
/**
 * The longest a hurried throw tumbles. A throw of many dice takes seconds
 * to come to rest, so in a burst it plays faster still.
 */
const HURRIED_TUMBLE_MS = 700;

/**
 * Throw a roll into `host`. Every roll, D6, D16 or block dice, plays the same way
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
  const sim = simulate(roll.values.length, roll.kind);
  if (opts.sound) void loadClacks();
  const { gl, scene, camera, lookAt } = stage(host, roll.neon);

  const geometry =
    roll.kind === "d16"
      ? d16Geometry()
      : new RoundedBoxGeometry(1, 1, 1, 4, 0.12);
  const meshes = roll.values.map((value, i) => {
    const labels =
      roll.kind === "d16"
        ? d16Labelling(sim.ups[i], value)
        : labelling(sim.ups[i], value);
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
    const { face } = upFace(mesh.quaternion, roll.kind);
    const faceNormals = normals(roll.kind);
    const local = new THREE.Vector3(...faceNormals[face]);
    // A face next to it keeps the face upright on screen
    const side =
      roll.kind === "d16"
        ? D16_FACE_UP[face]
        : new THREE.Vector3(
            ...FACE_NORMALS[
              FACE_NORMALS.findIndex((_n, k) => k >> 1 !== face >> 1)
            ]
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
  // Whether the dice have come to rest on screen
  let rested = false;
  /**
   * Show the dice at rest and lifted, result faces forward, at once. A
   * throw stopped before it landed, because the page stopped drawing frames
   * or a slow one ran out of time, otherwise stayed where it was: two block
   * dice still stacked as they were thrown, one hiding the other.
   */
  const showResult = () => {
    sim.frames[sim.frames.length - 1].forEach(
      ([x, y, z, qx, qy, qz, qw], i) => {
        meshes[i].position.set(x, y, z);
        meshes[i].quaternion.set(qx, qy, qz, qw);
      }
    );
    meshes.forEach((mesh, i) => {
      mesh.quaternion.copy(faceForward(mesh, lifted[i].position));
      mesh.position.copy(lifted[i].position);
    });
    gl.render(scene, camera);
  };
  const stop = () => {
    if (!running) return;
    running = false;
    if (showing === control) showing = null;
    if (!rested) showResult();
    gl.domElement.removeEventListener("pointerdown", onPointerDown);
    gl.domElement.removeEventListener("pointermove", onPointerMove);
    gl.domElement.style.cursor = "";
    geometry.dispose();
    resolve(roll.values);
  };
  // Playback speed of the recorded tumble; hurry() raises it
  let rate = 1;
  // Tumble time played so far, at the current rate
  let tumbleMs = 0;
  const control = {
    stop,
    mark: (index: number | null) => {
      markedIndex = index;
    },
    hurry: () => {
      const left = (sim.frames.length / 60) * 1000 - tumbleMs;
      rate = Math.max(rate, HURRY_RATE, left / HURRIED_TUMBLE_MS);
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
          rested = true;
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
              (m) =>
                (m.userData.labels as number[])[
                  upFace(m.quaternion, roll.kind).face
                ]
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
