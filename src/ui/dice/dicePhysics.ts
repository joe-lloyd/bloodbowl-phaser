import * as THREE from "three";
import * as CANNON from "cannon-es";
import type { DiceKind } from "./diceScene";
import { D16_FACES, D16_NORMALS, D16_VERTICES } from "./d16";

type Axis = 0 | 1 | 2;
type Vec3 = [number, number, number];
type Matrix3 = [Vec3, Vec3, Vec3];
type DieFrame = [number, number, number, number, number, number, number];
const AXES = [0, 1, 2] as const;

export const FACE_NORMALS: Vec3[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];
const LAYOUT = [1, 6, 2, 5, 3, 4];
const PERMUTATIONS: [Axis, Axis, Axis][] = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];

function mapTriple<T, U>(
  values: readonly [T, T, T],
  map: (value: T) => U
): [U, U, U] {
  return [map(values[0]), map(values[1]), map(values[2])];
}

function rotation(permutation: [Axis, Axis, Axis], signs: number): Matrix3 {
  return mapTriple(AXES, (row) =>
    mapTriple(AXES, (column) => {
      if (column !== permutation[row]) return 0;
      return (signs >> row) & 1 ? -1 : 1;
    })
  );
}

function determinant(matrix: Matrix3): number {
  const [[a, b, c], [d, e, f], [g, h, i]] = matrix;
  return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
}

const ROTATIONS = PERMUTATIONS.flatMap((permutation) =>
  Array.from({ length: 8 }, (_, signs) => rotation(permutation, signs)).filter(
    (matrix) => determinant(matrix) === 1
  )
);

function rotatedLabel(matrix: Matrix3, normal: Vec3): number {
  const rotated = mapTriple(
    matrix,
    (row) => row[0] * normal[0] + row[1] * normal[1] + row[2] * normal[2]
  );
  const face = FACE_NORMALS.findIndex((candidate) =>
    candidate.every((value, axis) => value === rotated[axis])
  );
  const label = LAYOUT[face];
  if (label === undefined)
    throw new Error("Rotation does not match a die face");
  return label;
}

export function labelling(up: number, value: number): number[] {
  const options = ROTATIONS.map((matrix) =>
    FACE_NORMALS.map((normal) => rotatedLabel(matrix, normal))
  ).filter((labels) => labels[up] === value);
  const labels = options[Math.floor(Math.random() * options.length)];
  if (!labels)
    throw new Error(`Invalid D6 face/value: ${String(up)}/${String(value)}`);
  return labels;
}

export function normals(kind: DiceKind): Vec3[] {
  return kind === "d16" ? D16_NORMALS : FACE_NORMALS;
}

export function upFace(
  q: THREE.Quaternion,
  kind: DiceKind
): { face: number; dot: number } {
  let face = 0;
  let dot = -2;
  normals(kind).forEach((normal, index) => {
    const y = new THREE.Vector3(...normal).applyQuaternion(q).y;
    if (y > dot) {
      dot = y;
      face = index;
    }
  });
  return { face, dot };
}

export const TRAY = { w: 8, d: 4.4 };
const STEP = 1 / 120;

interface Throw {
  frames: DieFrame[][];
  impacts: { frame: number; strength: number }[];
  ups: number[];
}

interface Tray {
  world: CANNON.World;
  material: CANNON.Material;
}

function addWall(tray: Tray, position: Vec3, euler: Vec3): void {
  const body = new CANNON.Body({
    mass: 0,
    material: tray.material,
    shape: new CANNON.Plane(),
  });
  body.position.set(...position);
  body.quaternion.setFromEuler(...euler);
  tray.world.addBody(body);
}

function createTray(): Tray {
  const world = new CANNON.World({
    gravity: new CANNON.Vec3(0, -32, 0),
    allowSleep: true,
  });
  const material = new CANNON.Material();
  world.addContactMaterial(
    new CANNON.ContactMaterial(material, material, {
      friction: 0.25,
      restitution: 0.42,
    })
  );
  const tray = { world, material };
  addWall(tray, [0, 0, 0], [-Math.PI / 2, 0, 0]);
  addWall(tray, [-TRAY.w / 2, 0, 0], [0, Math.PI / 2, 0]);
  addWall(tray, [TRAY.w / 2, 0, 0], [0, -Math.PI / 2, 0]);
  addWall(tray, [0, 0, -TRAY.d / 2], [0, 0, 0]);
  addWall(tray, [0, 0, TRAY.d / 2], [0, Math.PI, 0]);
  return tray;
}

function dieShape(kind: DiceKind): CANNON.Shape {
  if (kind !== "d16") return new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5));
  return new CANNON.ConvexPolyhedron({
    vertices: D16_VERTICES.map(
      (vertex) => new CANNON.Vec3(vertex.x, vertex.y, vertex.z)
    ),
    faces: D16_FACES.map((face) => [...face]),
  });
}

function launchBody(body: CANNON.Body, index: number, count: number): void {
  body.position.set(
    -TRAY.w / 2 + 0.9,
    2.2 + index * 1.1,
    (index - (count - 1) / 2) * 1.3 + (Math.random() - 0.5)
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
}

function createDie(input: {
  tray: Tray;
  index: number;
  count: number;
  kind: DiceKind;
  onImpact: (speed: number) => void;
}): CANNON.Body {
  const body = new CANNON.Body({
    mass: 1,
    material: input.tray.material,
    shape: dieShape(input.kind),
    sleepSpeedLimit: 0.2,
    sleepTimeLimit: 0.25,
  });
  launchBody(body, input.index, input.count);
  body.addEventListener(
    "collide",
    (event: { contact: CANNON.ContactEquation }) => {
      const speed = Math.abs(event.contact.getImpactVelocityAlongNormal());
      if (speed > 1.5) input.onImpact(speed);
    }
  );
  input.tray.world.addBody(body);
  return body;
}

function frame(body: CANNON.Body): DieFrame {
  const { position: p, quaternion: q } = body;
  return [p.x, p.y, p.z, q.x, q.y, q.z, q.w];
}

function animatePhysics(
  world: CANNON.World,
  dice: CANNON.Body[],
  frames: DieFrame[][]
): void {
  for (let step = 0; step < 60 * 6 * 2; step++) {
    world.step(STEP);
    if (step % 2 === 0) frames.push(dice.map(frame));
    if (
      step > 60 &&
      dice.every((body) => body.sleepState === CANNON.Body.SLEEPING)
    )
      break;
  }
}

function settledFace(body: CANNON.Body, kind: DiceKind): number {
  const { x, y, z, w } = body.quaternion;
  const { face, dot } = upFace(new THREE.Quaternion(x, y, z, w), kind);
  return dot > 0.97 ? face : -1;
}

function attemptThrow(count: number, kind: DiceKind): Throw {
  const tray = createTray();
  const impacts: Throw["impacts"] = [];
  const frames: DieFrame[][] = [];
  const onImpact = (speed: number) => {
    impacts.push({ frame: frames.length, strength: Math.min(1, speed / 12) });
  };
  const dice = Array.from({ length: count }, (_, index) =>
    createDie({ tray, index, count, kind, onImpact })
  );
  animatePhysics(tray.world, dice, frames);
  return { frames, impacts, ups: dice.map((body) => settledFace(body, kind)) };
}

export function simulate(count: number, kind: DiceKind = "d6"): Throw {
  for (let attempt = 0; attempt < 12; attempt++) {
    const result = attemptThrow(count, kind);
    if (result.ups.every((face) => face >= 0)) return result;
  }
  throw new Error("dice would not settle");
}
