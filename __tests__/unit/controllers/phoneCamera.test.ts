import { describe, expect, it } from "vitest";
import { CameraController } from "../../../src/game/controllers/CameraController";
import { gridPointToPixel } from "../../../src/game/elements/GridUtils";
import type { CameraScene } from "../../../src/game/controllers/cameraPorts";
import type { ScreenRect } from "../../../src/game/controllers/CameraController";

const LANDSCAPE = { width: 844, height: 390 };
const PORTRAIT = { width: 390, height: 844 };
const SMALLEST_TILE_PX = 20;
const TILE_PX = 70 * Math.SQRT1_2;

function setup(size: { width: number; height: number }, phone = true) {
  let resized = () => undefined;
  const zooms: number[] = [];
  const camera = {
    zoom: 0.35,
    scrollX: 0,
    scrollY: 0,
    x: 0,
    y: 0,
    ...size,
    roundPixels: false,
    originX: 0.5,
    originY: 0.5,
    setBackgroundColor: () => undefined,
    setBounds: () => undefined,
    getBounds: () => ({ x: 0, y: 0, right: 5000, bottom: 3500 }),
    setZoom(zoom = 1) {
      this.zoom = zoom;
      zooms.push(zoom);
    },
    centerOn(x: number, y: number) {
      this.scrollX = x - this.width / 2;
      this.scrollY = y - this.height / 2;
    },
    pan(x: number, y: number) {
      this.centerOn(x, y);
    },
    zoomTo(zoom: number) {
      this.setZoom(zoom);
    },
    once: () => undefined,
    off: () => undefined,
    setFollowOffset(x = 0, y = 0) {
      this.offset = { x, y };
    },
    following: false,
    offset: { x: 0, y: 0 },
    startFollow() {
      this.following = true;
    },
    stopFollow() {
      this.following = false;
    },
    shake: () => undefined,
    panEffect: { isRunning: false, reset: () => undefined },
    zoomEffect: { isRunning: false, reset: () => undefined },
  };
  const scale = {
    ...size,
    on: (...[event, handler, context]: Parameters<CameraScene["scale"]["on"]>) => {
      if (event === "resize")
        resized = () => {
          Reflect.apply(handler, context, []);
        };
    },
    off: () => undefined,
  };
  const hud: ScreenRect[] = [{ left: 0, top: 0, right: size.width, bottom: 84 }];
  const at = (x: number, y: number) => {
    const p = gridPointToPixel(x, y);
    return { x: 2000 + p.x, y: 1000 + p.y };
  };
  const controller = new CameraController({
    scene: {
      events: { on: () => undefined, off: () => undefined },
      cameras: { main: camera },
      scale,
      time: { delayedCall: () => ({ remove: () => undefined }) },
      input: {
        on: () => undefined,
        off: () => undefined,
      },
    },
    pitch: { getPointPosition: at, getPixelPosition: (x, y) => at(x + 0.5, y + 0.5) },
    world: { width: 5000, height: 3500 },
    dugoutPoints: [at(0, -4), at(21, 15)],
    hudRects: () => hud,
    phone: () => phone,
  });
  return {
    camera,
    controller,
    zooms,
    hud,
    turn: (next: { width: number; height: number }) => {
      Object.assign(scale, next);
      Object.assign(camera, next);
      resized();
    },
    coachZooms: (zoom: number) => {
      controller.zoomAt(size.width / 2, size.height / 2, zoom / camera.zoom);
    },
  };
}

const ball = { x: 2400, y: 1300 };

const diceBox = (size: { width: number; height: number }): ScreenRect => ({
  left: 0,
  top: size.height - 235,
  right: size.width,
  bottom: size.height,
});

const squares = [
  [{ x: 8, y: 5 }, { x: 9, y: 5 }],
  [{ x: 0, y: 0 }, { x: 19, y: 10 }],
  [{ x: 14, y: 3 }],
  [{ x: 3, y: 8 }, { x: 12, y: 2 }],
];

function playRolls(size: typeof LANDSCAPE, phone: boolean) {
  const camera = setup(size, phone);
  camera.controller.fitSquares([{ x: 8, y: 5 }, { x: 9, y: 5 }]);
  camera.zooms.length = 0;
  for (const group of squares) {
    camera.hud.push(diceBox(size));
    camera.controller.refreshFraming();
    camera.controller.focusSquares(group);
    camera.controller.fitSquares(group);
    camera.controller.handoff(group, group.slice(0, 1));
    camera.hud.pop();
    camera.controller.refreshFraming();
  }
  return camera;
}

describe("the camera on a phone, through a run of rolls", () => {
  for (const size of [LANDSCAPE, PORTRAIT]) {
    it(`never makes a square smaller than 20px tall at ${String(size.width)}`, () => {
      const { zooms, camera } = playRolls(size, true);
      const smallest = Math.min(camera.zoom, ...zooms) * TILE_PX;
      expect(smallest).toBeGreaterThanOrEqual(SMALLEST_TILE_PX - 0.01);
    });

    it(`zooms out at most once and never bounces back at ${String(size.width)}`, () => {
      const { zooms } = playRolls(size, true);
      const changes = zooms.filter((zoom, i) => i > 0 && zoom !== zooms[i - 1]);
      expect(changes.length).toBeLessThanOrEqual(1);
    });
  }

  it("is what the dice box used to break: the desktop rules shrink a square under 5px", () => {
    const { zooms } = playRolls(LANDSCAPE, false);
    expect(Math.min(...zooms) * TILE_PX).toBeLessThan(5);
  });

  it("keeps the zoom the coach pinched to", () => {
    const { controller, camera, coachZooms } = setup(LANDSCAPE);
    coachZooms(0.9);
    const pinched = camera.zoom;
    controller.release();
    controller.fitSquares([{ x: 0, y: 0 }, { x: 19, y: 10 }]);
    controller.handoff([{ x: 0, y: 0 }], [{ x: 19, y: 10 }]);
    controller.overview();
    controller.focusSquares([{ x: 4, y: 4 }]);
    expect(camera.zoom).toBe(pinched);
    controller.reset();
    expect(camera.zoom).toBeLessThan(0.4);
  });

  it("shows the whole pitch again after the phone turns", () => {
    const { controller, camera, turn } = setup(LANDSCAPE);
    controller.overview();
    turn(PORTRAIT);
    const left = camera.scrollX + camera.width / 2 - camera.width / (2 * camera.zoom);
    const corner = gridPointToPixel(0, 11).x + 2000;
    expect(left).toBeLessThanOrEqual(corner);
  });

  it("frames the action again when the phone turns during a zoom", () => {
    const { controller, camera, turn } = setup(LANDSCAPE);
    controller.focusSquares([{ x: 16, y: 5 }]);
    camera.zoomEffect.isRunning = true;
    camera.zoomEffect.reset = () => {
      camera.zoomEffect.isRunning = false;
    };
    turn(PORTRAIT);
    const at = gridPointToPixel(16.5, 5.5);
    const centre = camera.scrollX + camera.width / 2;
    expect(Math.abs(at.x + 2000 - centre) * camera.zoom).toBeLessThan(150);
  });

  it("keeps the same spot in the middle when the phone turns in play", () => {
    const { camera, turn, coachZooms } = setup(LANDSCAPE);
    coachZooms(0.6);
    const before = camera.scrollX + camera.width / 2;
    turn(PORTRAIT);
    expect(camera.scrollX + camera.width / 2).toBeCloseTo(before);
  });

  describe("following a kicked ball", () => {
    const kick = (size = LANDSCAPE) => {
      const rig = setup(size);
      rig.controller.overview();
      rig.controller.follow(ball);
      return rig;
    };

    it("keeps on it while the HUD changes", () => {
      const { controller, camera, hud } = kick();
      hud.push({ left: 0, top: 290, right: 844, bottom: 390 });
      controller.refreshFraming();
      expect(camera.following).toBe(true);
    });

    it("keeps on it when the phone turns, in the new middle", () => {
      const { controller, camera, turn } = kick();
      turn(PORTRAIT);
      controller.refreshFraming();
      expect(camera.following).toBe(true);
      expect(camera.offset.x).toBeCloseTo(0);
      turn(LANDSCAPE);
      expect(camera.following).toBe(true);
    });

    it("stops for an overview, which then owns the next turn of the phone", () => {
      const { controller, camera, turn, zooms } = kick();
      controller.overview();
      expect(camera.following).toBe(false);
      turn(PORTRAIT);
      expect(camera.zoom).toBe(zooms.at(-1));
      expect(camera.zoom * TILE_PX).toBeLessThan(SMALLEST_TILE_PX);
    });

    it("lets go for good once the coach takes the camera", () => {
      const { controller, camera, turn } = kick();
      controller.panBy(40, 0);
      turn(PORTRAIT);
      expect(camera.following).toBe(false);
    });
  });
});
