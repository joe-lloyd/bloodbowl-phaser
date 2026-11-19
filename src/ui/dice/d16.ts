import * as THREE from "three";

export const D16_VERTICES = [
  new THREE.Vector3(0, 0.78, 0),
  new THREE.Vector3(0, -0.78, 0),
  ...Array.from({ length: 8 }, (_, i) => {
    const angle = (i * Math.PI) / 4;
    return new THREE.Vector3(Math.cos(angle) * 0.65, 0, Math.sin(angle) * 0.65);
  }),
];

type Face = [number, number, number];

function vertex(index: number): THREE.Vector3 {
  const point = D16_VERTICES[index];
  if (!point) throw new Error(`Invalid D16 vertex: ${String(index)}`);
  return point;
}

export const D16_FACES = [
  ...Array.from({ length: 8 }, (_, i): Face => [0, 2 + ((i + 1) % 8), 2 + i]),
  ...Array.from({ length: 8 }, (_, i): Face => [1, 2 + i, 2 + ((i + 1) % 8)]),
];

export const D16_NORMALS = D16_FACES.map(([a, b, c]) =>
  vertex(b)
    .clone()
    .sub(vertex(a))
    .cross(vertex(c).clone().sub(vertex(a)))
    .normalize()
    .toArray()
);

export const D16_FACE_UP = D16_FACES.map(([a, b, c]) => {
  const centre = vertex(a)
    .clone()
    .add(vertex(b))
    .add(vertex(c))
    .divideScalar(3);
  return vertex(a).clone().sub(centre).normalize();
});

export function d16Geometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      D16_FACES.flatMap((face) => face.flatMap((v) => vertex(v).toArray())),
      3
    )
  );
  geometry.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(
      D16_FACES.flatMap(() => [0.5, 1, 0, 0, 1, 0]),
      2
    )
  );
  D16_FACES.forEach((_, i) => {
    geometry.addGroup(i * 3, 3, i);
  });
  geometry.computeVertexNormals();
  return geometry;
}

const LAYOUT = [1, 2, 3, 4, 5, 6, 7, 8, 12, 11, 10, 9, 16, 15, 14, 13];
const LABELS = [false, true].flatMap((flip) =>
  Array.from({ length: 8 }, (_, turn) =>
    D16_FACES.map((_, face) => {
      const ring = face % 8;
      const side = face < 8 !== flip ? 0 : 8;
      const label = LAYOUT[side + ((turn + (flip ? 7 - ring : ring)) % 8)];
      if (label === undefined) throw new Error("Invalid D16 face layout");
      return label;
    })
  )
);

export function d16Labelling(up: number, value: number): number[] {
  const labels = LABELS.find((candidate) => candidate[up] === value);
  if (!labels)
    throw new Error(`Invalid D16 face/value: ${String(up)}/${String(value)}`);
  return [...labels];
}
