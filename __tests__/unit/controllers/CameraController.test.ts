import { describe, it, expect, afterEach, vi } from "vitest";
import {
  CameraController,
  ScreenRect,
} from "../../../src/game/controllers/CameraController";
import { gridPointToPixel } from "../../../src/game/elements/GridUtils";

/**
 * The match camera, against a fake Phaser camera that records where it was
 * asked to go. The pitch stand-in uses the real isometric projection with
 * its origin at (2000, 1000).
 */
function setup(
  viewport = { width: 1600, height: 900 },
  hudRects?: () => ScreenRect[]
) {
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
    /** The zoom Phaser built its matrix with, at the last frame. */
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
    setZoom: vi.fn(function (this: { zoom: number }, z: number) {
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
    zoomTo: vi.fn(),
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
    // As Phaser does it: the matrix is rebuilt once a frame, while the zoom
    // and scroll it is combined with are read live.
    getWorldPoint: vi.fn((x: number, y: number) => {
      const z = camera.renderedZoom;
      const ox = camera.width * camera.originX;
      const oy = camera.height * camera.originY;
      return {
        x: (x + camera.scrollX * camera.zoom - camera.x - ox) / z + ox,
        y: (y + camera.scrollY * camera.zoom - camera.y - oy) / z + oy,
      };
    }),
    panEffect: { reset: vi.fn() },
    zoomEffect: { reset: vi.fn() },
  };
  const inputHandlers: Record<string, (...args: unknown[]) => void> = {};
  const scene = {
    cameras: { main: camera },
    scale: { ...viewport, on: vi.fn(), off: vi.fn() },
    time: {
      delayedCall: (_delay: number, callback: () => void) => {
        const timer = setTimeout(callback, _delay);
        return { remove: () => clearTimeout(timer) };
      },
    },
    input: {
      on: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
        inputHandlers[event] = fn;
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
  /** Phaser draws a frame: the matrix catches up with the zoom. */
  const render = () => {
    camera.renderedZoom = camera.zoom;
  };
  const controller = new CameraController(
    scene as never,
    pitch as never,
    { width: 5000, height: 3500 },
    [pitch.getPointPosition(0, -4), pitch.getPointPosition(21, 15)],
    bus as never,
    hudRects
  );
  return { camera, controller, inputHandlers, pitch, bus, render };
}

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
      inputHandlers.wheel({ x: 1200, y: 300 }, [], 0, dy);
      render();
    }
    const after = camera.getWorldPoint(1200, 300);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("zooms by how far the wheel turns, not by how many events it sends", () => {
    const notch = setup();
    const start = notch.camera.zoom;
    notch.inputHandlers.wheel({ x: 800, y: 450 }, [], 0, -100);
    // A trackpad sends the same scroll as many small steps.
    const pad = setup();
    for (let i = 0; i < 25; i++)
      pad.inputHandlers.wheel({ x: 800, y: 450 }, [], 0, -4);
    expect(pad.camera.zoom).toBeCloseTo(notch.camera.zoom);
    // One notch of a mouse wheel zooms in by about a tenth.
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
    controller.follow({} as never);
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

  it("aligns a pixel-art opening centre before the first rendered frame", () => {
    const { controller, camera } = setup();
    camera.roundPixels = true;
    controller.intro();
    const [x, y] = camera.centerOn.mock.lastCall!;
    expect(x - camera.width / 2).toBe(Math.floor(x - camera.width / 2));
    expect(y - camera.height / 2).toBe(Math.floor(y - camera.height / 2));
  });

  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
    { width: 844, height: 390 },
  ]) {
    it(`fits every widely spread teammate in the HUD gap at ${viewport.width}`, () => {
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
      const [cx, cy] = camera.pan.mock.lastCall!;
      const zoom = camera.zoomTo.mock.lastCall![0];
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

  it("lets the coach zoom out after a team fit below the overview zoom floor", () => {
    const { controller, camera } = setup({ width: 1280, height: 720 });
    controller.fitSquares([
      { x: 0, y: 0 },
      { x: 19, y: 0 },
      { x: 0, y: 10 },
      { x: 19, y: 10 },
    ]);
    const fitted = camera.zoomTo.mock.lastCall![0];
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
    const wide = camera.zoomTo.mock.lastCall![0];
    vi.advanceTimersByTime(1249);
    expect(camera.zoomTo).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(camera.zoomTo).toHaveBeenCalledTimes(2);
    expect(camera.zoomTo.mock.lastCall![0]).toBeGreaterThan(wide);
  });

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
      vi.advanceTimersByTime(5000);
      expect(camera.zoomTo).not.toHaveBeenCalled();
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
    const [x, y] = camera.pan.mock.lastCall!;
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
    expect(camera.zoomTo.mock.lastCall![0]).toBeGreaterThan(0);
  });

  it("cuts straight to the new team under reduced motion with no delayed work", () => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
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
