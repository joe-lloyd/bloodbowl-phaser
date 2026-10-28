import { describe, it, expect, beforeEach, vi } from "vitest";
import { CameraController } from "../../../src/game/controllers/CameraController";
import { gridPointToPixel } from "../../../src/game/elements/GridUtils";

/**
 * The match camera, against a fake Phaser camera that records where it was
 * asked to go. The pitch stand-in uses the real isometric projection with
 * its origin at (2000, 1000).
 */
function setup() {
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
    scale: { width: 1600, height: 900, on: vi.fn(), off: vi.fn() },
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
    "bloodbowl"
  );
  return { camera, controller, inputHandlers, pitch, bus };
}

describe("CameraController", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
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
    expect(ctx.camera.startFollow).toHaveBeenCalledWith(ball, false, 0.08, 0.08);
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
