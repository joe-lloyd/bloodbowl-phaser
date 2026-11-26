import * as THREE from "three";
import type { DiceKind } from "./diceScene";

type Face = [number, number, number];

interface BipyramidShape {
  ring: number;
  radius: number;
  layout: number[];
}

export interface Bipyramid {
  vertices: THREE.Vector3[];
  faces: Face[];
  normals: [number, number, number][];
  faceUp: THREE.Vector3[];
  labels: number[][];
}

const APEX_HEIGHT = 0.78;

function pick<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined)
    throw new Error(`Invalid bipyramid index: ${String(index)}`);
  return item;
}

function ringLabels({ ring, layout }: BipyramidShape, faces: Face[]) {
  return [false, true].flatMap((flip) =>
    Array.from({ length: ring }, (_, turn) =>
      faces.map((_face, face) => {
        const spot = face % ring;
        const side = face < ring === flip ? ring : 0;
        const step = flip ? ring - 1 - spot : spot;
        return pick(layout, side + ((turn + step) % ring));
      })
    )
  );
}

function createBipyramid(shape: BipyramidShape): Bipyramid {
  const { ring, radius } = shape;
  const vertices = [
    new THREE.Vector3(0, APEX_HEIGHT, 0),
    new THREE.Vector3(0, -APEX_HEIGHT, 0),
    ...Array.from({ length: ring }, (_, i) => {
      const angle = (i * 2 * Math.PI) / ring;
      return new THREE.Vector3(
        Math.cos(angle) * radius,
        0,
        Math.sin(angle) * radius
      );
    }),
  ];
  const faces = [
    ...Array.from(
      { length: ring },
      (_, i): Face => [0, 2 + ((i + 1) % ring), 2 + i]
    ),
    ...Array.from(
      { length: ring },
      (_, i): Face => [1, 2 + i, 2 + ((i + 1) % ring)]
    ),
  ];
  const corners = faces.map(
    ([a, b, c]) =>
      [pick(vertices, a), pick(vertices, b), pick(vertices, c)] as const
  );
  return {
    vertices,
    faces,
    normals: corners.map(([a, b, c]) =>
      b.clone().sub(a).cross(c.clone().sub(a)).normalize().toArray()
    ),
    faceUp: corners.map(([a, b, c]) =>
      a.clone().sub(a.clone().add(b).add(c).divideScalar(3)).normalize()
    ),
    labels: ringLabels(shape, faces),
  };
}

const BIPYRAMIDS: Partial<Record<DiceKind, Bipyramid>> = {
  d8: createBipyramid({
    ring: 4,
    radius: 0.78,
    layout: [1, 2, 3, 4, 6, 5, 8, 7],
  }),
  d16: createBipyramid({
    ring: 8,
    radius: 0.65,
    layout: [1, 2, 3, 4, 5, 6, 7, 8, 12, 11, 10, 9, 16, 15, 14, 13],
  }),
};

export function bipyramid(kind: DiceKind): Bipyramid | undefined {
  return BIPYRAMIDS[kind];
}

export function bipyramidGeometry({
  vertices,
  faces,
}: Bipyramid): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      faces.flatMap((face) => face.flatMap((v) => pick(vertices, v).toArray())),
      3
    )
  );
  geometry.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(
      faces.flatMap(() => [0.5, 1, 0, 0, 1, 0]),
      2
    )
  );
  faces.forEach((_, i) => {
    geometry.addGroup(i * 3, 3, i);
  });
  geometry.computeVertexNormals();
  return geometry;
}

export function bipyramidLabelling(
  { labels }: Bipyramid,
  up: number,
  value: number
): number[] {
  const found = labels.find((candidate) => candidate[up] === value);
  if (!found)
    throw new Error(`Invalid die face/value: ${String(up)}/${String(value)}`);
  return [...found];
}
