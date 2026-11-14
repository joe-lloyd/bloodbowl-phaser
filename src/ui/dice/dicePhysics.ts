import * as THREE from "three";
import * as CANNON from "cannon-es";
import type { DiceKind } from "./diceScene";
import { D16_FACES, D16_NORMALS, D16_VERTICES } from "./d16";

/**
 * Which face of a die is up, and the physics throw that decides how the dice
 * tumble. The throw never decides the numbers: see diceScene.
 */

type Vec3 = [number, number, number];

export const FACE_NORMALS: Vec3[] = [
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

export function normals(kind: DiceKind): Vec3[] {
  return kind === "d16" ? D16_NORMALS : FACE_NORMALS;
}

/** Index of the face pointing most nearly up, and how nearly. */
export function upFace(
  q: THREE.Quaternion,
  kind: DiceKind
): { face: number; dot: number } {
  let face = 0;
  let dot = -2;
  normals(kind).forEach((n, i) => {
    const y = new THREE.Vector3(...n).applyQuaternion(q).y;
    if (y > dot) {
      dot = y;
      face = i;
    }
  });
  return { face, dot };
}

export const TRAY = { w: 8, d: 4.4 };
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
export function simulate(count: number, kind: DiceKind = "d6"): Throw {
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
        shape:
          kind === "d16"
            ? new CANNON.ConvexPolyhedron({
                vertices: D16_VERTICES.map(
                  (v) => new CANNON.Vec3(v.x, v.y, v.z)
                ),
                faces: D16_FACES.map((face) => [...face]),
              })
            : new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5)),
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
        ),
        kind
      );
      return dot > 0.97 ? face : -1;
    });
    // A die cocked against a wall would be ambiguous: throw again.
    if (ups.every((u) => u >= 0)) return { frames, impacts, ups };
  }
  throw new Error("dice would not settle");
}
