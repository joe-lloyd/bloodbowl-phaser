import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as THREE from "three";
import { playRoll } from "./diceScene";
import type { DiceRoll, DiceTeam } from "./diceScene";

const rendered = vi.hoisted(() => ({
  stages: new Array<{ scene: THREE.Scene; camera: THREE.Camera }>(),
}));

vi.mock("three", async (importOriginal) => {
  const real = await importOriginal<typeof import("three")>();
  class RecordingRenderer {
    domElement = document.createElement("canvas");
    shadowMap = { enabled: false, type: 0 };
    toneMapping = 0;
    setPixelRatio() {
      return;
    }
    setSize() {
      return;
    }
    render(scene: THREE.Scene, camera: THREE.Camera) {
      rendered.stages.push({ scene, camera });
    }
  }
  return { ...real, WebGLRenderer: RecordingRenderer };
});

vi.mock("./diceFaces", async () => {
  const three = await import("three");
  return {
    faceMaterial: (_roll: unknown, value: number) => {
      const material = new three.MeshBasicMaterial();
      material.name = String(value);
      return material;
    },
    coinTexture: () =>
      new three.CanvasTexture(document.createElement("canvas")),
    BLOCK_FACES: [],
    coinFaceImage: () => "",
  };
});

const team: DiceTeam = {
  key: "home",
  race: "human",
  initial: "R",
  primary: 0x3355ff,
  secondary: 0xffffff,
};
let now = 0;
let pending: FrameRequestCallback | undefined;
let stop: (() => void) | undefined;

beforeEach(() => {
  now = 0;
  pending = undefined;
  rendered.stages.length = 0;
  let seed = 42;
  vi.spyOn(Math, "random").mockImplementation(() => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  });
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    pending = callback;
    return 1;
  });
});

afterEach(() => {
  stop?.();
  stop = undefined;
  vi.restoreAllMocks();
});

function runFrames(count: number): void {
  for (let i = 0; i < count; i++) {
    const callback = pending;
    if (!callback) throw new Error("Animation did not request its next frame");
    pending = undefined;
    now += 1000 / 60;
    callback(now);
  }
}

function latestStage() {
  const stage = rendered.stages.at(-1);
  if (!stage) throw new Error("Animation did not render");
  stage.scene.updateMatrixWorld(true);
  return stage;
}

function visibleMaterial(
  mesh: THREE.Mesh,
  camera: THREE.Camera
): THREE.Material {
  const ray = new THREE.Raycaster(
    camera.position,
    mesh.position.clone().sub(camera.position).normalize()
  );
  const hit = ray.intersectObject(mesh)[0];
  if (!hit?.face) throw new Error("Camera cannot see the die");
  const material = Array.isArray(mesh.material)
    ? mesh.material[hit.face.materialIndex]
    : mesh.material;
  if (!material) throw new Error("Visible face has no material");
  return material;
}

it.each<DiceRoll["kind"]>(["d6", "d8", "d16", "block"])(
  "lands %s naturally, faces the results toward the coach, and marks the chosen die",
  async (kind) => {
    const handle = playRoll(
      document.createElement("div"),
      { kind, values: [3, 6], team },
      { sound: false }
    );
    stop = () => {
      handle.stop();
    };
    handle.mark(1);
    handle.hurry();
    await Promise.resolve();
    runFrames(120);
    expect(await handle.landed).toEqual([3, 6]);
    const { scene, camera } = latestStage();
    const dice = scene.children.filter(
      (child): child is THREE.Mesh =>
        child instanceof THREE.Mesh && child.castShadow
    );
    expect(dice.map((die) => visibleMaterial(die, camera).name)).toEqual([
      "3",
      "6",
    ]);
    expect(dice.map((die) => Number(die.scale.x.toFixed(2)))).toEqual([
      0.75, 1.2,
    ]);
    expect(dice.map((die) => Number(die.position.x.toFixed(3)))).toEqual([
      -0.675, 0.675,
    ]);
  }
);

it.each([1, 2] as const)(
  "lands coin side %s and lifts that side toward the coach",
  async (side) => {
    const handle = playRoll(
      document.createElement("div"),
      { kind: "coin", side, faces: [team, { ...team, key: "away" }] },
      { sound: false }
    );
    stop = () => {
      handle.stop();
    };
    await Promise.resolve();
    runFrames(160);
    expect(await handle.landed).toEqual([side]);
    const { scene, camera } = latestStage();
    const coin = scene.children.find(
      (child): child is THREE.Mesh =>
        child instanceof THREE.Mesh &&
        child.geometry instanceof THREE.CylinderGeometry
    );
    if (!coin || !Array.isArray(coin.material))
      throw new Error("Coin was not rendered");
    expect(visibleMaterial(coin, camera)).toBe(coin.material[side]);
    expect(coin.castShadow).toBe(false);
  }
);
