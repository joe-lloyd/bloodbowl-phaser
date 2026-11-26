import { expect, type Page, type TestInfo } from "@playwright/test";
import type { BrowserTestBridge } from "../../src/testing/browserBridge";

type CameraState = NonNullable<ReturnType<BrowserTestBridge["cameraState"]>>;
type Sample = CameraState & { time: number };
type CameraWindow = typeof globalThis & {
  __bbTestBridge?: BrowserTestBridge;
  cameraSamples?: Sample[];
  cameraSampling?: boolean;
};

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
