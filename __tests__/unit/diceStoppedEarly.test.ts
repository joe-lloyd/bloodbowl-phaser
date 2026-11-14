import { afterAll, beforeAll, expect, it, vi } from "vitest";

/**
 * Round 3, 1:21:16: the waiting guest's tray drew two block dice on top of
 * each other while the host showed them side by side. The guest drew few
 * frames, so its throw was stopped before it landed and stayed as thrown,
 * the dice stacked. A throw stopped early now shows its dice at rest,
 * lifted side by side with their result faces forward.
 */
const drawn = vi.hoisted(() => ({
  scenes: [] as unknown[],
  cameras: [] as unknown[],
}));
vi.mock("three", async (importOriginal) => {
  const real = await importOriginal<typeof import("three")>();
  class RecordingRenderer {
    domElement = document.createElement("canvas");
    shadowMap = { enabled: false, type: 0 };
    toneMapping = 0;
    setPixelRatio() {}
    setSize() {}
    render(scene: unknown, camera: unknown) {
      drawn.scenes.push(scene);
      drawn.cameras.push(camera);
    }
  }
  return { ...real, WebGLRenderer: RecordingRenderer };
});

it.each([1, 6, 9, 16])(
  "shows D16 result %s on the face visible to the coach, even when stopped early",
  async (value) => {
    const THREE = await import("three");
    const { playRoll } = await import("../../src/ui/dice/diceScene");
    const handle = playRoll(
      document.createElement("div"),
      {
        kind: "d16",
        values: [value],
        team: {
          key: "home",
          race: "human",
          initial: "R",
          primary: 0x3355ff,
          secondary: 0xffffff,
        },
        neon: false,
      },
      { sound: false }
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    handle.stop();
    expect(await handle.landed).toEqual([value]);

    const scene = drawn.scenes.at(-1) as InstanceType<typeof THREE.Scene>;
    const camera = drawn.cameras.at(-1) as InstanceType<
      typeof THREE.PerspectiveCamera
    >;
    const die = scene.children.find(
      (child) => child instanceof THREE.Mesh && child.castShadow
    ) as InstanceType<typeof THREE.Mesh>;
    expect(die.geometry.groups).toHaveLength(16);
    // Raycast the actual visible triangle, rather than trusting the returned value.
    die.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(
      camera.position,
      die.position.clone().sub(camera.position).normalize()
    );
    const face = ray.intersectObject(die)[0].face!.materialIndex;
    expect(die.userData.labels[face]).toBe(value);
  }
);

const pen = new Proxy(
  {},
  { get: (_target, key) => (key === "canvas" ? undefined : () => {}) }
);
let restore: () => void = () => {};
beforeAll(() => {
  const context = vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockImplementation(() => pen as never);
  // The page draws no more frames, like a busy or hidden tab
  const frames = vi
    .spyOn(window, "requestAnimationFrame")
    .mockImplementation(() => 0);
  restore = () => {
    context.mockRestore();
    frames.mockRestore();
  };
});
afterAll(() => restore());

it("shows two block dice side by side when their throw is stopped before it lands", async () => {
  const THREE = await import("three");
  const { playRoll } = await import("../../src/ui/dice/diceScene");
  const host = document.createElement("div");
  const handle = playRoll(
    host,
    {
      kind: "block",
      values: [3, 6],
      team: {
        key: "home",
        race: "human",
        initial: "R",
        primary: 0x3355ff,
        secondary: 0xffffff,
      },
      neon: false,
    },
    { sound: false }
  );
  await new Promise((resolve) => setTimeout(resolve, 0));

  handle.stop();
  await handle.landed;

  const scene = drawn.scenes.at(-1) as InstanceType<typeof THREE.Scene>;
  const dice = scene.children.filter(
    (child): child is InstanceType<typeof THREE.Mesh> =>
      child instanceof THREE.Mesh && child.castShadow
  );
  expect(dice).toHaveLength(2);
  const [a, b] = dice.map((die) => die.position);
  expect(Math.round((b.x - a.x) * 100) / 100).toBe(1.35);
  expect(b.y).toBeCloseTo(a.y);
  expect(b.z).toBeCloseTo(a.z);
});
