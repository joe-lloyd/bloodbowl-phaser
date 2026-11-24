import type * as Three from "three";
import { describe, expect, it, vi } from "vitest";

const worst = vi.hoisted(() => ({ edge: 0, size: 0 }));

vi.mock("three", async (importOriginal) => {
  const real = await importOriginal<typeof Three>();
  class WatchingRenderer {
    domElement = document.createElement("canvas");
    shadowMap = { enabled: false, type: 0 };
    toneMapping = 0;
    setPixelRatio() {
      return undefined;
    }
    setSize() {
      return undefined;
    }
    render(scene: Three.Scene, camera: Three.PerspectiveCamera) {
      scene.updateMatrixWorld();
      camera.updateMatrixWorld();
      worst.size = 1 / Math.tan((camera.fov * Math.PI) / 360);
      scene.traverse((object) => {
        if (!("labels" in object.userData)) return;
        const at = object.position.clone().project(camera);
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
  options: { close?: boolean }
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
    { kind: "d6", values: [3, 4], team },
    { sound: false, ...options }
  );
  await thrown.landed;
  thrown.stop();
  return { ...worst };
}

describe("two dice stay in the picture", () => {
  it("all the way through the desktop weather and kick-off strip", async () => {
    let edge = 0;
    for (let roll = 0; roll < 4; roll++)
      edge = Math.max(edge, (await rollOn({ width: 160, height: 112 }, {})).edge);
    expect(edge).toBeLessThanOrEqual(1.05);
  }, 40_000);

  it("and the phone overlay is the only closer view", async () => {
    const strip = await rollOn({ width: 160, height: 112 }, {});
    const tray = await rollOn({ width: 420, height: 180 }, {});
    const phone = await rollOn({ width: 220, height: 92 }, { close: true });
    expect(strip.size).toBeCloseTo(tray.size);
    expect(phone.size).toBeGreaterThan(tray.size * 1.2);
    expect(phone.edge).toBeLessThanOrEqual(1.05);
  }, 40_000);
});
