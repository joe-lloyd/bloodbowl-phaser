import { expect, type Page, type TestInfo } from "@playwright/test";
import type { BrowserTestBridge } from "../../src/testing/browserBridge";
import type { Square } from "./pages/pitch";

type CameraState = NonNullable<ReturnType<BrowserTestBridge["cameraState"]>>;
type Sample = CameraState & { time: number };
type CameraWindow = typeof globalThis & {
  __bbTestBridge?: BrowserTestBridge;
  cameraSamples?: Sample[];
  cameraSampling?: boolean;
  handoffClick?: Promise<void>;
};

export type HandoffMoment = "gliding" | "paused";

export async function cameraState(page: Page) {
  const state = await page.evaluate(() =>
    (globalThis).__bbTestBridge?.cameraState()
  );
  if (!state) throw new Error("No live match camera");
  return state;
}

export async function sampleCamera(page: Page) {
  await page.evaluate(() => {
    const w: CameraWindow = globalThis;
    w.cameraSamples = [];
    w.cameraSampling = true;
    const sample = () => {
      if (!w.cameraSampling) return;
      const state = w.__bbTestBridge?.cameraState();
      if (state) w.cameraSamples?.push({ ...state, time: performance.now() });
      requestAnimationFrame(sample);
    };
    sample();
  });
}

export async function finishCameraSample(
  page: Page,
  info: TestInfo,
  name: string
) {
  const samples = await page.evaluate(() => {
    const w: CameraWindow = globalThis;
    w.cameraSampling = false;
    return w.cameraSamples ?? [];
  });
  await info.attach(name, {
    body: JSON.stringify(samples, null, 2),
    contentType: "application/json",
  });
  expect(samples.length).toBeGreaterThan(2);
  return samples;
}

export function expectZoomHeld(samples: Sample[]) {
  const zooms = samples.map((s) => s.zoom);
  expect(Math.max(...zooms) - Math.min(...zooms)).toBe(0);
}

export async function clickDuringHandoff(
  page: Page,
  {
    square,
    moment,
    handOff,
  }: { square: Square; moment: HandoffMoment; handOff: () => Promise<void> }
) {
  await page.evaluate(
    ({ square, moment }) => {
      const w: CameraWindow = globalThis;
      const bridge = w.__bbTestBridge;
      const canvas = document.querySelector("#game-container canvas");
      if (!(canvas instanceof HTMLCanvasElement))
        throw new TypeError("No live match canvas");
      const startZoom = bridge.cameraState()?.zoom;
      let moved = false;
      const due = () => {
        const state = bridge.cameraState();
        const moving = state !== null && (state.panning || state.zooming);
        moved ||= moving;
        if (moment === "gliding") return moving && state.zoom !== startZoom;
        return moved && !moving;
      };
      const click = () => {
        const at = bridge.squareToCanvas(square.x, square.y);
        if (!at) return new Error("The square is not on the canvas");
        const rect = canvas.getBoundingClientRect();
        const size = bridge.canvasSize();
        const init = {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: rect.left + (at.x * rect.width) / size.width,
          clientY: rect.top + (at.y * rect.height) / size.height,
        };
        canvas.dispatchEvent(new MouseEvent("mousedown", { ...init, buttons: 1 }));
        canvas.dispatchEvent(new MouseEvent("mouseup", init));
        return null;
      };
      w.handoffClick = new Promise((resolve, reject) => {
        const watch = () => {
          if (!due()) {
            requestAnimationFrame(watch);
            return;
          }
          const failure = click();
          if (failure) reject(failure);
          else resolve();
        };
        watch();
      });
    },
    { square, moment }
  );
  await handOff();
  await page.evaluate(() => {
    const w: CameraWindow = globalThis;
    return w.handoffClick;
  });
}
