import type * as Three from "three";
import { describe, expect, it, vi } from "vitest";

const worst = vi.hoisted(() => ({
  edge: 0,
  share: 0,
  aspect: 0,
  canvas: [0, 0],
}));

vi.mock("three", async (importOriginal) => {
  const real = await importOriginal<typeof Three>();
  class WatchingRenderer {
    domElement = document.createElement("canvas");
    shadowMap = { enabled: false, type: 0 };
    toneMapping = 0;
    setPixelRatio() {
      return;
    }
    setSize(width: number, height: number) {
      worst.canvas = [width, height];
    }
    render(scene: Three.Scene, camera: Three.PerspectiveCamera) {
      scene.updateMatrixWorld();
      camera.updateMatrixWorld();
      worst.aspect = camera.aspect;
      scene.traverse((object) => {
        if (!("labels" in object.userData)) return;
        const at = object.position.clone().project(camera);
        worst.share =
          0.5 /
          (object.position.distanceTo(camera.position) *
            Math.tan((camera.fov * Math.PI) / 360));
        worst.edge = Math.max(worst.edge, Math.abs(at.x), Math.abs(at.y));
      });
    }
  }
  return { ...real, WebGLRenderer: WatchingRenderer };
});

const pen = new Proxy(
  {},
  { get: (_target, key) => (key === "canvas" ? undefined : () => undefined) }
);
Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  value: () => pen,
});

const team = {
  key: "home",
  race: "Human",
  initial: "H",
  primary: 0x3355ff,
  secondary: 0xffffff,
};

async function rollOn(
  size: { width: number; height: number },
  values: number[] = [3, 4]
) {
  const { playRoll } = await import("../../src/ui/dice/diceScene");
  const host = document.createElement("div");
  Object.defineProperties(host, {
    clientWidth: { value: size.width },
    clientHeight: { value: size.height },
  });
  worst.edge = 0;
  const thrown = playRoll(
    host,
    { kind: "d6", values, team },
    { sound: false }
  );
  await thrown.landed;
  await new Promise((resolve) => setTimeout(resolve, 600));
  thrown.stop();
  return { ...worst };
}

it("a landed roll follows its stage when the phone turns", async () => {
  const { playRoll } = await import("../../src/ui/dice/diceScene");
  const size = { width: 446, height: 70 };
  const host = document.createElement("div");
  Object.defineProperties(host, {
    clientWidth: { get: () => size.width },
    clientHeight: { get: () => size.height },
  });
  const thrown = playRoll(
    host,
    { kind: "d6", values: [4, 1], team },
    { sound: false }
  );
  await thrown.landed;
  Object.assign(size, { width: 238, height: 125 });
  await new Promise((resolve) => setTimeout(resolve, 200));
  expect(worst.canvas).toEqual([238, 125]);
  expect(worst.aspect).toBeCloseTo(238 / 125);
  thrown.stop();
}, 40_000);

describe.each([
  ["desktop weather and kick-off strip", { width: 240, height: 176 }],
  ["desktop tray", { width: 420, height: 220 }],
  ["phone overlay", { width: 220, height: 100 }],
])("dice on the %s", (_name, size) => {
  it("stay in the picture all the way through a 2D6", async () => {
    let edge = 0;
    for (let roll = 0; roll < 3; roll++) {
      const result = await rollOn(size);
      edge = Math.max(edge, result.edge);
    }
    expect(edge).toBeLessThanOrEqual(1.05);
  }, 40_000);

  it("land large enough to read", async () => {
    const lit = await rollOn(size, [5]);
    expect(lit.share).toBeGreaterThan(0.55);
    const plain = await rollOn(size);
    expect(plain.share).toBeGreaterThan(0.45);
  }, 40_000);
});
