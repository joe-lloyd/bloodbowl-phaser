import * as THREE from "three";

/** An octagonal bipyramid: sixteen congruent triangular faces. */
export const D16_VERTICES = [
  new THREE.Vector3(0, 0.78, 0),
  new THREE.Vector3(0, -0.78, 0),
  ...Array.from({ length: 8 }, (_, i) => {
    const angle = (i * Math.PI) / 4;
    return new THREE.Vector3(Math.cos(angle) * 0.65, 0, Math.sin(angle) * 0.65);
  }),
];

/** Outward winding, first the eight upper faces, then the eight lower faces. */
export const D16_FACES = [
  ...Array.from({ length: 8 }, (_, i) => [0, 2 + ((i + 1) % 8), 2 + i]),
  ...Array.from({ length: 8 }, (_, i) => [1, 2 + i, 2 + ((i + 1) % 8)]),
];

export const D16_NORMALS = D16_FACES.map(([a, b, c]) =>
  D16_VERTICES[b]
    .clone()
    .sub(D16_VERTICES[a])
    .cross(D16_VERTICES[c].clone().sub(D16_VERTICES[a]))
    .normalize()
    .toArray()
);

/** The number reads toward the triangle's apex when lifted to the coach. */
export const D16_FACE_UP = D16_FACES.map(([a, b, c]) => {
  const centre = D16_VERTICES[a]
    .clone()
    .add(D16_VERTICES[b])
    .add(D16_VERTICES[c])
    .divideScalar(3);
  return D16_VERTICES[a].clone().sub(centre).normalize();
});

export function d16Geometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      D16_FACES.flatMap((face) =>
        face.flatMap((v) => D16_VERTICES[v].toArray())
      ),
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
  D16_FACES.forEach((_, i) => geometry.addGroup(i * 3, 3, i));
  geometry.computeVertexNormals();
  return geometry;
}

// Opposite faces sum to 17. Only rotations of this layout are used.
const LAYOUT = [1, 2, 3, 4, 5, 6, 7, 8, 12, 11, 10, 9, 16, 15, 14, 13];
const LABELS = [false, true].flatMap((flip) =>
  Array.from({ length: 8 }, (_, turn) =>
    D16_FACES.map((_, face) => {
      const ring = face % 8;
      const side = face < 8 !== flip ? 0 : 8;
      return LAYOUT[side + ((turn + (flip ? 7 - ring : ring)) % 8)];
    })
  )
);

/** A rotation of the die's complete layout, with the engine's value on top. */
export function d16Labelling(up: number, value: number): number[] {
  const labels = LABELS.find((candidate) => candidate[up] === value);
  if (!labels) throw new Error(`Invalid D16 face/value: ${up}/${value}`);
  return [...labels];
}
