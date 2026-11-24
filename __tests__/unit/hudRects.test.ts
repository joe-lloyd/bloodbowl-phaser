import { fixtureValue } from "../../src/testing/fixtureValue";
import { afterEach, describe, expect, it } from "vitest";
import {
  measureHudRects,
  watchHudPanels,
} from "../../src/game/presentation/hudRects";

function box(
  element: Element,
  x: number,
  y: number,
  width: number,
  height: number
) {
  element.getBoundingClientRect = () => new DOMRect(x, y, width, height);
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("measureHudRects", () => {
  it("translates the score strip and tray edges from page to canvas coordinates", () => {
    document.body.innerHTML = `
      <canvas></canvas>
      <div data-hud-panels><section></section></div>
      <div data-hud-frame="top"></div>
      <div data-hud-frame="bottom"></div>
    `;
    const canvas = fixtureValue(document.querySelector("canvas"));
    box(canvas, 100, 50, 640, 360);
    box(fixtureValue(document.querySelector("section")), 110, 110, 100, 80);
    box(fixtureValue(document.querySelector('[data-hud-frame="top"]')), 250, 60, 320, 40);
    box(
      fixtureValue(document.querySelector('[data-hud-frame="bottom"]')),
      300,
      300,
      210,
      100
    );

    expect(measureHudRects(canvas, { width: 1280, height: 1080 })).toEqual([
      { left: 20, top: 180, right: 220, bottom: 420 },
      { left: 0, top: 0, right: 1280, bottom: 150 },
      { left: 0, top: 750, right: 1280, bottom: 1080 },
    ]);
    fixtureValue(document
      .querySelector('[data-hud-frame="bottom"]'))
      .setAttribute("aria-hidden", "true");
    expect(measureHudRects(canvas, { width: 1280, height: 1080 })).toEqual([
      { left: 20, top: 180, right: 220, bottom: 420 },
      { left: 0, top: 0, right: 1280, bottom: 150 },
    ]);
  });

  it("refreshes when a tray with unchanged geometry becomes hidden, then stops watching", async () => {
    document.body.innerHTML =
      '<canvas></canvas><div data-hud-frame="bottom"></div>';
    const canvas = fixtureValue(document.querySelector("canvas"));
    const tray = fixtureValue(document.querySelector("div"));
    box(canvas, 0, 0, 1280, 720);
    box(tray, 430, 486, 420, 218);
    const measured: ReturnType<typeof measureHudRects>[] = [];
    const watcher = watchHudPanels(() =>
      measured.push(measureHudRects(canvas, { width: 1280, height: 720 }))
    );
    watcher.watch();
    tray.setAttribute("aria-hidden", "true");
    await Promise.resolve();
    expect(measured).toEqual([[]]);
    watcher.stop();
    tray.removeAttribute("aria-hidden");
    await Promise.resolve();
    expect(measured).toEqual([[]]);
  });
});
