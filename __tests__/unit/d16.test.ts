import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  D16_FACES,
  D16_NORMALS,
  D16_VERTICES,
  d16Geometry,
  d16Labelling,
} from "../../src/ui/dice/d16";

describe("a sixteen-sided die", () => {
  it("has sixteen equal outward faces, with a parallel opposite for each", () => {
    const geometry = d16Geometry();
    expect(geometry.groups).toHaveLength(16);
    const areas = D16_FACES.map(([a, b, c], i) => {
      const normal = new THREE.Vector3(...D16_NORMALS[i]);
      expect(normal.dot(D16_VERTICES[a])).toBeGreaterThan(0);
      expect(
        D16_NORMALS.some(
          (other) => normal.dot(new THREE.Vector3(...other)) < -0.999
        )
      ).toBe(true);
      return new THREE.Triangle(
        D16_VERTICES[a],
        D16_VERTICES[b],
        D16_VERTICES[c]
      ).getArea();
    });
    for (const area of areas) expect(area).toBeCloseTo(areas[0], 10);
    geometry.dispose();
  });

  it("can show every engine result on every landing face without repeating or losing a number", () => {
    for (let up = 0; up < 16; up++) {
      for (let value = 1; value <= 16; value++) {
        const labels = d16Labelling(up, value);
        expect(labels[up]).toBe(value);
        expect([...labels].sort((a, b) => a - b)).toEqual(
          Array.from({ length: 16 }, (_, i) => i + 1)
        );
        D16_NORMALS.forEach((n, i) => {
          const opposite = D16_NORMALS.findIndex(
            (other) =>
              new THREE.Vector3(...n).dot(new THREE.Vector3(...other)) < -0.999
          );
          expect(labels[i] + labels[opposite]).toBe(17);
        });
      }
    }
  });
});
