import { fixtureValue } from "../../../src/testing/fixtureValue";
import Phaser from "phaser";
import type { CameraScene, CameraLens } from "../../../src/game/controllers/cameraPorts";
import { describe, it, expect, afterEach, vi } from "vitest";
import { EventEmitter } from "node:events";
import {
  CameraController,
  clearArea,
  type ScreenRect,
} from "../../../src/game/controllers/CameraController";
import { gridPointToPixel } from "../../../src/game/elements/GridUtils";

function setup(
  viewport = { width: 1600, height: 900 },
  hudRects?: () => ScreenRect[]
) {
  const cameraEvents = new EventEmitter();
  const camera = {
    zoom: 1,
    scrollX: 0,
    scrollY: 0,
    x: 0,
    y: 0,
    width: viewport.width,
    height: viewport.height,
    roundPixels: false,
    originX: 0.5,
    originY: 0.5,

    renderedZoom: 1,
    setBackgroundColor: vi.fn(),
    setBounds: vi.fn(),
    getBounds: () => ({
      x: 0,
      y: 0,
      width: 5000,
      height: 3500,
      right: 5000,
      bottom: 3500,
    }),
    setZoom: vi.fn(function (this: { zoom: number }, z = 1) {
      this.zoom = z;
    }),
    centerOn: vi.fn(function (
      this: { scrollX: number; scrollY: number; width: number; height: number },
      x: number,
      y: number
    ) {
      this.scrollX = x - this.width / 2;
      this.scrollY = y - this.height / 2;
    }),
    zoomTo: vi.fn<Parameters<CameraLens["zoomTo"]>, unknown>(),
    once: (event: string, callback: () => void) =>
      cameraEvents.once(event, callback),
    off: (event: string, callback: () => void) =>
      cameraEvents.off(event, callback),
    pan: vi.fn(function (
      this: { scrollX: number; scrollY: number; width: number; height: number },
      x: number,
      y: number
    ) {
      this.scrollX = x - this.width / 2;
      this.scrollY = y - this.height / 2;
    }),
    startFollow: vi.fn(),
    setFollowOffset: vi.fn(),
    stopFollow: vi.fn(),
    shake: vi.fn(),

    getWorldPoint: vi.fn((x: number, y: number): { x: number; y: number } => {
      const z = camera.renderedZoom;
      const ox = camera.width * camera.originX;
      const oy = camera.height * camera.originY;
      return {
        x: (x + camera.scrollX * camera.zoom - camera.x - ox) / z + ox,
        y: (y + camera.scrollY * camera.zoom - camera.y - oy) / z + oy,
      };
    }),
    panEffect: { isRunning: false, reset: vi.fn() },
    zoomEffect: { isRunning: false, reset: vi.fn() },
  };
  const inputHandlers: Record<string, (...args: unknown[]) => void> = {};
  let resize = () => undefined;
  const scene = {
    events: new Phaser.Events.EventEmitter(),
    cameras: { main: camera },
    scale: {
      ...viewport,
      on: vi.fn<Parameters<CameraScene["scale"]["on"]>, unknown>(
        (event, handler, context) => {
          if (event === "resize")
            resize = () => {
              Reflect.apply(handler, context, []);
            };
        }
      ),
      off: vi.fn(),
    },
    time: {
      delayedCall: (_delay: number, callback: () => void) => {
        const timer = setTimeout(callback, _delay);
        return {
          remove: () => {
            clearTimeout(timer);
          },
        };
      },
    },
    input: {
      on: vi.fn<Parameters<CameraScene["input"]["on"]>, unknown>((event, fn) => {
        inputHandlers[String(event)] = (...args: unknown[]) => { Reflect.apply(fn, undefined, args); };
      }),
      off: vi.fn(),
      mouse: { disableContextMenu: vi.fn() },
    },
  };
  const origin = { x: 2000, y: 1000 };
  const pitch = {
    getPointPosition: (gx: number, gy: number) => {
      const p = gridPointToPixel(gx, gy);
      return { x: origin.x + p.x, y: origin.y + p.y };
    },
    getPixelPosition: (gx: number, gy: number) => {
      const p = gridPointToPixel(gx + 0.5, gy + 0.5);
      return { x: origin.x + p.x, y: origin.y + p.y };
    },
  };
  const bus = { emit: vi.fn() };

  const render = () => {
    camera.renderedZoom = camera.zoom;
  };
  const controller = new CameraController(
    { scene,pitch,world: { width: 5000,height: 3500 },dugoutPoints: [pitch.getPointPosition(0,-4),pitch.getPointPosition(21,15)],eventBus: bus,...(hudRects ? {hudRects} : {}) }  );
  return {
    camera,
    controller,
    inputHandlers,
    pitch,
    bus,
    render,
    finishZoom: (zoom = fixtureValue(camera.zoomTo.mock.lastCall)[0]) => {
      camera.zoom = zoom;
      camera.zoomEffect.isRunning = false;
      cameraEvents.emit("camerazoomcomplete");
    },
    resize: (size?: typeof viewport) => {
      if (size) {
        Object.assign(scene.scale, size);
        Object.assign(camera, size);
      }
      resize();
    },
  };
}

describe("clearArea", () => {
  it("keeps the space above a centred movement bar below the scoreboard", () => {
    expect(
      clearArea(844, 390, [
        { left: 0, top: 0, right: 844, bottom: 90 },
        { left: 172, top: 300, right: 672, bottom: 374 },
      ])
    ).toEqual({ left: 24, top: 114, right: 820, bottom: 276 });
  });

  it("keeps a positive area when the score and tray overlap on a short screen", () => {
    expect(
      clearArea(844, 250, [
        { left: 0, top: 0, right: 844, bottom: 140 },
        { left: 0, top: 130, right: 844, bottom: 250 },
      ])
    ).toEqual({ left: 24, top: 164, right: 820, bottom: 226 });
  });

  it("skips a HUD band that covers the entire canvas", () => {
    expect(
      clearArea(844, 250, [{ left: 0, top: 0, right: 844, bottom: 250 }])
    ).toEqual({ left: 24, top: 24, right: 820, bottom: 226 });
  });
});

describe("CameraController", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  it("zooms around the point between two pinching fingers", () => {
    const { camera, controller, render } = setup({ width: 844, height: 390 });
    render();
    const before = camera.getWorldPoint(300, 200);
    const zoom = camera.zoom;
    controller.zoomAt(300, 200, 1.5);
    render();
    expect(camera.zoom).toBeCloseTo(zoom * 1.5);
    const after = camera.getWorldPoint(300, 200);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("keeps the point under the mouse still while the wheel zooms", () => {
    const { camera, inputHandlers, render } = setup();
    render();
    const before = camera.getWorldPoint(1200, 300);
    for (const dy of [-100, -100, 100, -100]) {
      fixtureValue(inputHandlers["wheel"])({ x: 1200, y: 300 }, [], 0, dy);
      render();
    }
    const after = camera.getWorldPoint(1200, 300);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("zooms by how far the wheel turns, not by how many events it sends", () => {
    const notch = setup();
    const start = notch.camera.zoom;
    fixtureValue(notch.inputHandlers["wheel"])({ x: 800, y: 450 }, [], 0, -100);

    const pad = setup();
    for (let i = 0; i < 25; i++)
      fixtureValue(pad.inputHandlers["wheel"])({ x: 800, y: 450 }, [], 0, -4);
    expect(pad.camera.zoom).toBeCloseTo(notch.camera.zoom);

    expect(notch.camera.zoom / start).toBeGreaterThan(1.05);
    expect(notch.camera.zoom / start).toBeLessThan(1.15);
  });

  it("holds zoom through point, reach, shrinking reach, HUD changes and ball tracking", () => {
    let panels: ScreenRect[] = [];
    const { camera, controller } = setup(undefined, () => panels);
    camera.zoom = 0.83;
    camera.zoomTo.mockClear();
    controller.focusSquare(2, 3);
    controller.focusSquares([
      { x: 2, y: 3 },
      { x: 18, y: 10 },
    ]);
    controller.focusSquares([{ x: 3, y: 3 }]);
    panels = [{ left: 0, top: 0, right: 1600, bottom: 170 }];
    controller.refreshFraming();
    controller.follow(new Phaser.GameObjects.Container(new Phaser.Scene(), 0, 0));
    expect(camera.zoom).toBe(0.83);
    expect(camera.zoomTo).not.toHaveBeenCalled();
    expect(camera.setFollowOffset).toHaveBeenLastCalledWith(
      0,
      170 / (2 * 0.83)
    );
  });

  it("opens with one zoom around the final overview centre and no pan", () => {
    const { camera, controller } = setup();
    const centre = camera.centerOn.mock.lastCall;
    const zoom = camera.zoom;
    controller.intro();
    expect(camera.centerOn.mock.lastCall).toEqual(centre);
    expect(camera.pan).not.toHaveBeenCalled();
    expect(camera.zoomTo).toHaveBeenCalledTimes(1);
    expect(camera.zoomTo).toHaveBeenCalledWith(
      zoom,
      1250,
      "Cubic.easeInOut",
      true
    );
  });

  it("holds the ball-follow offset when a HUD band closes, then updates it on resize", () => {
    let panels: ScreenRect[] = [
      { left: 0, top: 0, right: 1600, bottom: 100 },
      { left: 0, top: 780, right: 1600, bottom: 900 },
    ];
    const { camera, controller, resize } = setup(undefined, () => panels);
    camera.zoom = 1;
    controller.follow(new Phaser.GameObjects.Container(new Phaser.Scene(), 0, 0));
    expect(camera.setFollowOffset.mock.lastCall).toEqual([0, -10]);
    panels = [];
    controller.refreshFraming();
    expect(camera.setFollowOffset.mock.lastCall).toEqual([0, -10]);
    expect(camera.setFollowOffset).toHaveBeenCalledTimes(1);
    panels = [
      { left: 0, top: 0, right: 1600, bottom: 200 },
      { left: 0, top: 780, right: 1600, bottom: 900 },
    ];
    controller.refreshFraming();
    expect(camera.setFollowOffset.mock.lastCall).toEqual([0, 40]);
    panels = [];
    resize({ width: 1920, height: 1080 });
    expect(camera.setFollowOffset.mock.lastCall).toEqual([0, 0]);
    expect(camera.setFollowOffset).toHaveBeenCalledTimes(3);
  });

  it("aligns a pixel-art opening centre before the first rendered frame", () => {
    const { controller, camera } = setup();
    camera.roundPixels = true;
    controller.intro();
    const [x, y] = fixtureValue(camera.centerOn.mock.lastCall);
    expect(x - camera.width / 2).toBe(Math.floor(x - camera.width / 2));
    expect(y - camera.height / 2).toBe(Math.floor(y - camera.height / 2));
  });

  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
    { width: 844, height: 390 },
  ]) {
    it(`fits every widely spread teammate in the HUD gap at ${String(viewport.width)}`, () => {
      const panels = [
        { left: 0, top: 0, right: viewport.width, bottom: 90 },
        {
          left: 0,
          top: viewport.height - 120,
          right: viewport.width,
          bottom: viewport.height,
        },
      ];
      const { camera, controller, pitch } = setup(viewport, () => panels);
      const squares = [
        { x: 0, y: 0 },
        { x: 19, y: 10 },
        { x: 0, y: 10 },
        { x: 19, y: 0 },
      ];
      controller.fitSquares(squares);
      const [cx, cy] = fixtureValue(camera.pan.mock.lastCall);
      const zoom = fixtureValue(camera.zoomTo.mock.lastCall)[0];
      for (const s of squares) {
        const p = pitch.getPixelPosition(s.x, s.y);
        const x = viewport.width / 2 + (p.x - cx) * zoom;
        const y = viewport.height / 2 + (p.y - cy) * zoom;
        expect(x - 50 * zoom).toBeGreaterThan(24);
        expect(x + 50 * zoom).toBeLessThan(viewport.width - 24);
        expect(y - 70 * zoom).toBeGreaterThan(114);
        expect(y + 25 * zoom).toBeLessThan(viewport.height - 144);
      }
    });
  }

  it("does not make small pan corrections when the required target stays clear", () => {
    const { controller, camera } = setup(undefined, () => []);
    controller.focusSquare(10, 5);
    camera.pan.mockClear();
    controller.focusSquare(10, 6);
    expect(camera.pan).not.toHaveBeenCalled();
  });

  it("pans clear of a taller tray without changing zoom", () => {
    let top = 600;
    const { controller, camera } = setup({ width: 1280, height: 720 }, () => [
      { left: 0, top, right: 1280, bottom: 720 },
    ]);
    camera.zoom = 0.83;
    controller.focusSquare(10, 5);
    const [x, y] = fixtureValue(camera.pan.mock.lastCall);
    top = 400;
    controller.refreshFraming();
    expect(fixtureValue(camera.pan.mock.lastCall)[0]).toBeCloseTo(x);
    expect(fixtureValue(camera.pan.mock.lastCall)[1]).toBeCloseTo(y + 100 / 0.83);
    expect(camera.zoom).toBe(0.83);
    expect(camera.zoomTo).not.toHaveBeenCalled();
  });

  it.each([0, 1])("holds the view when HUD band %s closes", (closed) => {
    let panels: ScreenRect[] = [
      { left: 0, top: 0, right: 1600, bottom: 170 },
      { left: 0, top: 600, right: 1600, bottom: 900 },
    ];
    const { controller, camera } = setup(undefined, () => panels);
    camera.zoom = 0.83;
    controller.focusSquare(10, 5);
    const before = { x: camera.scrollX, y: camera.scrollY, zoom: camera.zoom };
    camera.pan.mockClear();
    panels = panels.filter((_, index) => index !== closed);
    controller.refreshFraming();
    expect({ x: camera.scrollX, y: camera.scrollY, zoom: camera.zoom }).toEqual(
      before
    );
    expect(camera.pan).not.toHaveBeenCalled();
  });

  it("keeps the tracked world centre when the viewport grows", () => {
    const { controller, camera, resize } = setup(undefined, () => []);
    camera.zoom = 0.83;
    controller.focusSquare(10, 5);
    const before = {
      x: camera.scrollX + camera.width / 2,
      y: camera.scrollY + camera.height / 2,
    };
    resize({ width: 1920, height: 1080 });
    expect(camera.scrollX + camera.width / 2).toBeCloseTo(before.x);
    expect(camera.scrollY + camera.height / 2).toBeCloseTo(before.y);
    expect(camera.zoom).toBe(0.83);
  });

  it("lets the coach zoom out after a team fit below the overview zoom floor", () => {
    const { controller, camera } = setup({ width: 1280, height: 720 });
    controller.fitSquares([
      { x: 0, y: 0 },
      { x: 19, y: 0 },
      { x: 0, y: 10 },
      { x: 19, y: 10 },
    ]);
    const fitted = fixtureValue(camera.zoomTo.mock.lastCall)[0];
    camera.zoom = fitted;
    controller.zoomAt(640, 360, 0.9);
    expect(camera.zoom).toBeCloseTo(fitted * 0.9);
  });

  it("keeps manual zoom and pan until selection releases tracking", () => {
    const { controller, camera } = setup();
    controller.panBy(10, 20);
    controller.focusSquare(3, 3);
    expect(camera.pan).not.toHaveBeenCalled();
    controller.release();
    const zoom = camera.zoom;
    controller.focusSquare(3, 3);
    expect(camera.pan).toHaveBeenCalledTimes(1);
    expect(camera.zoom).toBe(zoom);
    expect(camera.zoomTo).not.toHaveBeenCalled();
  });

  it("stages a wide board, a pause and the next team", () => {
    vi.useFakeTimers();
    const { controller, camera } = setup(
      { width: 1280, height: 720 },
      () => []
    );
    controller.handoff(
      [
        { x: 0, y: 0 },
        { x: 19, y: 10 },
      ],
      [{ x: 16, y: 5 }]
    );
    expect(camera.zoomTo).toHaveBeenCalledTimes(1);
    const wide = fixtureValue(camera.zoomTo.mock.lastCall)[0];
    vi.advanceTimersByTime(1249);
    expect(camera.zoomTo).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(camera.zoomTo).toHaveBeenCalledTimes(2);
    expect(fixtureValue(camera.zoomTo.mock.lastCall)[0]).toBeGreaterThan(wide);
  });

  it.each([250, 700])(
    "keeps the next-team handoff after a resize at %sms",
    (at) => {
      vi.useFakeTimers();
      const { controller, camera, resize } = setup(undefined, () => []);
      controller.handoff(
        [
          { x: 0, y: 0 },
          { x: 19, y: 10 },
        ],
        [{ x: 16, y: 5 }]
      );
      vi.advanceTimersByTime(at);
      resize();
      vi.advanceTimersByTime(1250 - at);
      expect(camera.zoomTo).toHaveBeenCalledTimes(2);
      const [x, y] = fixtureValue(camera.pan.mock.lastCall);
      expect(x).toBeCloseTo(2544.47222);
      expect(y).toBeCloseTo(1521.97222);
    }
  );

  it("preserves a running team zoom when the viewport resizes", () => {
    const { controller, camera, resize } = setup();
    controller.fitSquares([{ x: 16, y: 5 }]);
    camera.zoomEffect.isRunning = true;
    const resets = camera.zoomEffect.reset.mock.calls.length;
    resize();
    expect(camera.zoomEffect.reset).toHaveBeenCalledTimes(resets);
    expect(camera.pan).toHaveBeenCalledTimes(1);
  });

  it("fits the next team in a viewport resized during its final zoom", () => {
    vi.useFakeTimers();
    const { controller, camera, resize, finishZoom, pitch } = setup(
      { width: 1280, height: 720 },
      () => []
    );
    const next = [
      { x: 1, y: 1 },
      { x: 18, y: 9 },
    ];
    controller.handoff(
      [
        { x: 0, y: 0 },
        { x: 19, y: 10 },
      ],
      next
    );
    finishZoom();
    vi.advanceTimersByTime(1250);
    camera.zoomEffect.isRunning = true;
    resize({ width: 844, height: 390 });
    finishZoom();
    finishZoom();

    const [cx, cy] = fixtureValue(camera.pan.mock.lastCall);
    for (const square of next) {
      const p = pitch.getPixelPosition(square.x, square.y);
      const x = 422 + (p.x - cx) * camera.zoom;
      const y = 195 + (p.y - cy) * camera.zoom;
      expect(x - 50 * camera.zoom).toBeGreaterThan(24);
      expect(x + 50 * camera.zoom).toBeLessThan(820);
      expect(y - 70 * camera.zoom).toBeGreaterThan(24);
      expect(y + 25 * camera.zoom).toBeLessThan(366);
    }
  });

  it.each(["selection", "manual", "restore", "destroy"])(
    "cancels a fit's resize correction on %s",
    (reason) => {
      const { controller, camera, resize, finishZoom } = setup();
      controller.fitSquares([
        { x: 1, y: 1 },
        { x: 18, y: 9 },
      ]);
      camera.zoomEffect.isRunning = true;
      resize({ width: 844, height: 390 });
      if (reason === "selection") {
        controller.release();
        controller.focusSquare(8, 5);
      }
      if (reason === "manual") controller.panBy(10, 10);
      if (reason === "restore") controller.reset();
      if (reason === "destroy") controller.destroy();
      camera.zoomTo.mockClear();
      camera.pan.mockClear();

      camera.zoomEffect.isRunning = false;
      finishZoom(camera.zoom);
      expect(camera.zoomTo).not.toHaveBeenCalled();
      expect(camera.pan).not.toHaveBeenCalled();
    }
  );

  it.each(["selection", "manual", "restore", "destroy"])(
    "cancels stale handoff work on %s",
    (reason) => {
      vi.useFakeTimers();
      const { controller, camera } = setup();
      controller.handoff(
        [
          { x: 0, y: 0 },
          { x: 19, y: 10 },
        ],
        [{ x: 16, y: 5 }]
      );
      if (reason === "selection") {
        controller.release();
        controller.focusSquare(8, 5);
      }
      if (reason === "manual") controller.panBy(10, 10);
      if (reason === "restore") controller.reset();
      if (reason === "destroy") controller.destroy();
      camera.zoomTo.mockClear();
      camera.pan.mockClear();
      vi.advanceTimersByTime(5000);
      expect(camera.zoomTo).not.toHaveBeenCalled();
      expect(camera.pan).not.toHaveBeenCalled();
    }
  );

  it("a superseding handoff removes the old delayed team destination", () => {
    vi.useFakeTimers();
    const { controller, camera, pitch } = setup(undefined, () => []);
    controller.handoff([{ x: 0, y: 0 }], [{ x: 19, y: 10 }]);
    vi.advanceTimersByTime(700);
    controller.handoff([{ x: 19, y: 10 }], [{ x: 2, y: 3 }]);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1250);
    expect(vi.getTimerCount()).toBe(0);
    const expected = pitch.getPixelPosition(2, 3);
    const [x, y] = fixtureValue(camera.pan.mock.lastCall);
    expect(x).toBe(expected.x);
    expect(y).toBe(expected.y - 22.5);
  });

  it("an empty new team keeps the full board framing and empty boards use the overview", () => {
    vi.useFakeTimers();
    const { controller, camera } = setup();
    controller.handoff(
      [
        { x: 0, y: 0 },
        { x: 19, y: 10 },
      ],
      []
    );
    camera.pan.mockClear();
    vi.advanceTimersByTime(2000);
    expect(camera.pan).not.toHaveBeenCalled();
    controller.handoff([], []);
    expect(fixtureValue(camera.zoomTo.mock.lastCall)[0]).toBeGreaterThan(0);
  });

  it("cuts straight to the new team under reduced motion with no delayed work", () => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("reduced-motion"),
    }));
    const { controller, camera } = setup(
      { width: 1280, height: 720 },
      () => []
    );
    controller.handoff(
      [
        { x: 0, y: 0 },
        { x: 19, y: 10 },
      ],
      [{ x: 16, y: 5 }]
    );
    expect(camera.zoom).toBeCloseTo(42 / (70 / Math.SQRT2));
    expect(camera.pan).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
