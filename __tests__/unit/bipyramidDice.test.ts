import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  bipyramid,
  bipyramidGeometry,
  bipyramidLabelling,
} from "../../src/ui/dice/bipyramid";

describe.each([
  { kind: "d8", sides: 8 },
  { kind: "d16", sides: 16 },
] as const)("a $kind", ({ kind, sides }) => {
  const solid = fixtureValue(bipyramid(kind));
  const normals = solid.normals.map((normal) => new THREE.Vector3(...normal));
  const opposite = (normal: THREE.Vector3) =>
    normals.findIndex((other) => normal.dot(other) < -0.999);

  it("has equal outward faces, with a parallel opposite for each", () => {
    const geometry = bipyramidGeometry(solid);
    expect(geometry.groups).toHaveLength(sides);
    const areas = solid.faces.map(([a, b, c], i) => {
      const normal = fixtureValue(normals[i]);
      expect(normal.dot(fixtureValue(solid.vertices[a]))).toBeGreaterThan(0);
      expect(opposite(normal)).toBeGreaterThanOrEqual(0);
      return new THREE.Triangle(
        solid.vertices[a],
        solid.vertices[b],
        solid.vertices[c]
      ).getArea();
    });
    for (const area of areas)
      expect(area).toBeCloseTo(fixtureValue(areas[0]), 10);
    geometry.dispose();
  });

  it("shows every result on every landing face without repeating or losing a number", () => {
    for (let up = 0; up < sides; up++) {
      for (let value = 1; value <= sides; value++) {
        const labels = bipyramidLabelling(solid, up, value);
        expect(labels[up]).toBe(value);
        expect(labels.toSorted((a, b) => a - b)).toEqual(
          Array.from({ length: sides }, (_, i) => i + 1)
        );
        for (const [i, normal] of normals.entries()) {
          expect(
            fixtureValue(labels[i]) + fixtureValue(labels[opposite(normal)])
          ).toBe(sides + 1);
        }
      }
    }
  });
});
