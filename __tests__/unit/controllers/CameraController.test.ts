import { describe, it, expect, beforeEach, vi } from "vitest";
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
    setBackgroundColor: vi.fn(),
    setBounds: vi.fn(),
    setZoom: vi.fn(function (this: { zoom: number }, z: number) {
      this.zoom = z;
    }),
    centerOn: vi.fn(),
    zoomTo: vi.fn(),
    pan: vi.fn(),
    startFollow: vi.fn(),
    stopFollow: vi.fn(),
    shake: vi.fn(),
    getWorldPoint: vi.fn((x: number, y: number) => ({ x, y })),
    panEffect: { reset: vi.fn() },
    zoomEffect: { reset: vi.fn() },
  };
  const inputHandlers: Record<string, (...args: unknown[]) => void> = {};
  const scene = {
    cameras: { main: camera },
    scale: { ...viewport, on: vi.fn(), off: vi.fn() },
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
  const controller = new CameraController(
    scene as never,
    pitch as never,
    { width: 5000, height: 3500 },
    [pitch.getPointPosition(0, -4), pitch.getPointPosition(21, 15)],
    bus as never,
    "bloodbowl",
    hudRects
  );
  return { camera, controller, inputHandlers, pitch, bus };
}

describe("CameraController", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it("leaves room for the match strip above the playing squares at 1280x720", () => {
    const { camera, pitch } = setup({ width: 1280, height: 720 });
    const [, centreY] = camera.centerOn.mock.calls[0];
    const corner = pitch.getPointPosition(0, 0);
    const screenY = 360 + (corner.y - centreY) * camera.zoom;
    expect(screenY).toBeGreaterThan(192);
  });

  /** Where the last glide puts a world point on a 1280x720 screen. */
  function screenY(
    camera: ReturnType<typeof setup>["camera"],
    worldY: number
  ): number {
    const [, panY] = camera.pan.mock.lastCall!;
    const zoom = camera.zoomTo.mock.lastCall![0];
    return 360 + (worldY - panY) * zoom;
  }

  it("keeps every playing square below the score bug when the reach fills the pitch", () => {
    const { camera, controller, pitch } = setup({ width: 1280, height: 720 });
    const reach = [];
    for (let x = 0; x <= 19; x++)
      for (let y = 0; y <= 10; y++) reach.push({ x, y });
    controller.focusSquares(reach);
    // The far corners of the pitch are its highest points on screen.
    for (const [x, y] of [
      [0, 0],
      [20, 0],
    ]) {
      expect(screenY(camera, pitch.getPointPosition(x, y).y)).toBeGreaterThan(
        100
      );
    }
  });

  it("keeps the far touchline below the score bug when a reach runs along it", () => {
    const { camera, controller, pitch } = setup({ width: 1280, height: 720 });
    const reach = [];
    for (let x = 0; x <= 19; x++)
      for (let y = 0; y <= 2; y++) reach.push({ x, y });
    controller.focusSquares(reach);
    expect(screenY(camera, pitch.getPointPosition(0, 0).y)).toBeGreaterThan(
      100
    );
    expect(screenY(camera, pitch.getPointPosition(20, 0).y)).toBeGreaterThan(
      100
    );
  });

  it("frames a group at the far end below the score bug", () => {
    const { camera, controller, pitch } = setup({ width: 1280, height: 720 });
    controller.focusSquares([
      { x: 15, y: 0 },
      { x: 16, y: 0 },
      { x: 15, y: 1 },
    ]);
    expect(screenY(camera, pitch.getPointPosition(15, 0).y)).toBeGreaterThan(
      100
    );
  });

  /** Where the last glide puts a world point on a 1280x720 screen. */
  function screenPoint(
    camera: ReturnType<typeof setup>["camera"],
    world: { x: number; y: number }
  ): { x: number; y: number } {
    const [panX, panY] = camera.pan.mock.lastCall!;
    const zoom = camera.zoomTo.mock.lastCall![0];
    return {
      x: 640 + (world.x - panX) * zoom,
      y: 360 + (world.y - panY) * zoom,
    };
  }

  /** A 2 m figure in world pixels: 25 px a metre, seen from 30 degrees up. */
  const FIGURE_PX = 2 * 25 * Math.cos(Math.PI / 6);

  it("keeps players readable when framing a reach across the whole pitch", () => {
    // Round 3, 1:06:00: a Catcher's blitz reach, MA 8 and two Rushes, from
    // the near end. The camera fitted all of it and players were 15 px tall.
    const { camera, controller, pitch } = setup({ width: 1280, height: 720 });
    const from = { x: 3, y: 5 };
    const reach = [];
    for (let x = 0; x <= 13; x++)
      for (let y = 0; y <= 10; y++) reach.push({ x, y });
    controller.focusSquares([from, ...reach]);

    const zoom = camera.zoomTo.mock.lastCall![0];
    expect(Math.round(zoom * FIGURE_PX)).toBeGreaterThanOrEqual(28);
    // The squares next to the player stay on screen, between the columns
    for (const square of [from, { x: 4, y: 5 }, { x: 2, y: 5 }]) {
      const point = screenPoint(
        camera,
        pitch.getPixelPosition(square.x, square.y)
      );
      expect(point.x).toBeGreaterThan(328);
      expect(point.x).toBeLessThan(1280 - 328);
      expect(point.y).toBeGreaterThan(110);
      expect(point.y).toBeLessThan(720);
    }
  });

  it("keeps every reachable square clear of the HUD panels on screen", () => {
    // Round 3, 56:30: square 7,10 sat under the dice log's A- button. The
    // dice log is the bottom-left panel; nothing else is open.
    const diceLog = { left: 16, top: 484, right: 304, bottom: 704 };
    const { camera, controller, pitch } = setup(
      { width: 1280, height: 720 },
      () => [diceLog]
    );
    // The thrower on 7,10 with a reach over most of the pitch: the squares
    // around them are the ones the coach clicks
    const from = { x: 7, y: 10 };
    const reach = [];
    for (let x = 0; x <= 19; x++)
      for (let y = 2; y <= 10; y++) reach.push({ x, y });
    controller.focusSquares([from, ...reach]);

    const near = [from, { x: 8, y: 10 }, { x: 6, y: 10 }, { x: 7, y: 9 }];
    for (const square of near) {
      const point = screenPoint(
        camera,
        pitch.getPixelPosition(square.x, square.y)
      );
      const covered =
        point.x > diceLog.left - 24 &&
        point.x < diceLog.right + 24 &&
        point.y > diceLog.top - 24 &&
        point.y < diceLog.bottom + 24;
      expect(covered, `square ${square.x},${square.y} is covered`).toBe(false);
      expect(point.x).toBeGreaterThan(0);
      expect(point.x).toBeLessThan(1280);
      expect(point.y).toBeGreaterThan(0);
      expect(point.y).toBeLessThan(720);
    }
  });

  describe("the action menu opens after the camera frames a reach", () => {
    // Round 4, 23:36: the blitz route ended on 12,1, under the action menu.
    // The camera framed the reach when the player was selected, before the
    // menu was on screen.
    const menu = { left: 976, top: 272, right: 1264, bottom: 704 };
    const from = { x: 13, y: 3 };
    const reach: { x: number; y: number }[] = [];
    for (let x = 7; x <= 19; x++)
      for (let y = 0; y <= 8; y++) reach.push({ x, y });
    const covered = (
      camera: ReturnType<typeof setup>["camera"],
      pitch: ReturnType<typeof setup>["pitch"]
    ) =>
      [from, ...reach.filter((s) => Math.abs(s.x - from.x) <= 2)]
        .map((s) => ({
          s,
          p: screenPoint(camera, pitch.getPixelPosition(s.x, s.y)),
        }))
        .filter(
          ({ p }) =>
            p.x > menu.left - 24 &&
            p.x < menu.right + 24 &&
            p.y > menu.top - 24 &&
            p.y < menu.bottom + 24
        )
        .map(({ s }) => `${s.x},${s.y}`);

    it("reframes the reach clear of the menu once it is on screen", () => {
      let panels: ScreenRect[] = [];
      const { camera, controller, pitch } = setup(
        { width: 1280, height: 720 },
        () => panels
      );
      controller.focusSquares([from, ...reach]);
      panels = [menu];
      expect(covered(camera, pitch)).not.toEqual([]);

      controller.refreshFraming();
      expect(covered(camera, pitch)).toEqual([]);
    });

    it("stays put when the panels have not moved, or the coach has the camera", () => {
      let panels: ScreenRect[] = [menu];
      const { camera, controller, inputHandlers } = setup(
        { width: 1280, height: 720 },
        () => panels
      );
      controller.focusSquares([from, ...reach]);
      camera.pan.mockClear();
      controller.refreshFraming();
      expect(camera.pan).not.toHaveBeenCalled();

      inputHandlers.wheel({ x: 800, y: 450 }, [], 0, -100);
      panels = [];
      controller.refreshFraming();
      expect(camera.pan).not.toHaveBeenCalled();
    });

    it("does not reframe old squares after the camera has moved on", () => {
      let panels: ScreenRect[] = [];
      const { camera, controller } = setup(
        { width: 1280, height: 720 },
        () => panels
      );
      controller.focusSquares([from, ...reach]);
      controller.overview();
      camera.pan.mockClear();
      panels = [menu];
      controller.refreshFraming();
      expect(camera.pan).not.toHaveBeenCalled();
    });
  });

  it("starts on the overview, inside the stadium bounds", () => {
    expect(ctx.camera.setBounds).toHaveBeenCalledWith(0, 0, 5000, 3500);
    const [cx, cy] = ctx.camera.centerOn.mock.calls[0];
    // Centred between the pitch and both dugouts.
    expect(cx).toBeGreaterThan(1500);
    expect(cx).toBeLessThan(2600);
    expect(cy).toBeGreaterThan(1000);
    expect(ctx.camera.zoom).toBeGreaterThan(0.3);
    expect(ctx.camera.zoom).toBeLessThan(1.5);
  });

  it("closes in on a square, nearer than the overview", () => {
    const overview = ctx.camera.zoom;
    ctx.controller.focusSquare(10, 5);
    const target = ctx.pitch.getPixelPosition(10, 5);
    expect(ctx.camera.pan).toHaveBeenLastCalledWith(
      target.x,
      target.y,
      expect.any(Number),
      "Sine.easeInOut",
      true
    );
    expect(ctx.camera.zoomTo.mock.lastCall![0]).toBeGreaterThan(overview);
    expect(ctx.bus.emit).toHaveBeenLastCalledWith("camera:stateChanged", {
      state: "active",
      duration: expect.any(Number),
    });
  });

  it("holds still after the coach zooms, until released", () => {
    ctx.inputHandlers.wheel({ x: 800, y: 450 }, [], 0, -100);
    ctx.camera.pan.mockClear();
    ctx.controller.focusSquare(3, 3);
    expect(ctx.camera.pan).not.toHaveBeenCalled();

    ctx.controller.release();
    ctx.controller.focusSquare(3, 3);
    expect(ctx.camera.pan).toHaveBeenCalledTimes(1);
  });

  it("follows a moving object and stops when asked", () => {
    const ball = {};
    ctx.controller.follow(ball as never);
    expect(ctx.camera.startFollow).toHaveBeenCalledWith(
      ball,
      false,
      0.08,
      0.08
    );
    ctx.controller.stopFollow();
    expect(ctx.camera.stopFollow).toHaveBeenCalled();
  });

  it("returns to the overview on reset", () => {
    const overview = ctx.camera.zoom;
    ctx.controller.focusSquare(1, 1);
    ctx.controller.reset(300);
    expect(ctx.camera.zoomTo.mock.lastCall![0]).toBeCloseTo(overview);
    expect(ctx.bus.emit).toHaveBeenLastCalledWith("camera:stateChanged", {
      state: "neutral",
      duration: 300,
    });
  });
});
