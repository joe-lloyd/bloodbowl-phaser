import type { CameraScene, CameraLens, CameraPitch, CameraBus } from "./cameraPorts";
import Phaser from "phaser";
import { GameEventNames } from "../../types/events";
import { prefersReducedMotion as reducedMotion } from "../presentation/motion";
import { MATCH_STYLE } from "../presentation/matchStyle";
import { ISO } from "../elements/GridUtils";
import { isTyping } from "../presentation/keyboardFocus";

interface Point {
  x: number;
  y: number;
}

type FocusPoints = [Point, ...Point[]];

const MOVE_MS = 700;

const KEY_PAN_PX_PER_S = 900;

export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function defaultHudRects(width: number, height: number): ScreenRect[] {
  const column = Math.min(288, width * 0.4);
  return [
    { left: 16, top: 16, right: 16 + column, bottom: height - 16 },
    {
      left: width - 16 - column,
      top: 16,
      right: width - 16,
      bottom: height - 16,
    },
    { left: width / 2 - 260, top: 0, right: width / 2 + 260, bottom: 86 },
  ];
}

const REFRAME_TOLERANCE_PX = 8;

const REFRAME_MS = 350;
const PAN_DEADBAND_PX = 64;

const PANEL_MARGIN_PX = 24;

const TEAM_MAX_ZOOM = 42 / ISO.tileHeight;

export function clearArea(
  width: number,
  height: number,
  panels: ScreenRect[]
): ScreenRect {
  const area = {
    left: PANEL_MARGIN_PX,
    top: PANEL_MARGIN_PX,
    right: width - PANEL_MARGIN_PX,
    bottom: height - PANEL_MARGIN_PX,
  };
  const size = (r: ScreenRect) =>
    Math.max(0, r.right - r.left) * Math.max(0, r.bottom - r.top);
  const padded = panels
    .map((p) => ({
      left: p.left - PANEL_MARGIN_PX,
      top: p.top - PANEL_MARGIN_PX,
      right: p.right + PANEL_MARGIN_PX,
      bottom: p.bottom + PANEL_MARGIN_PX,
    }))
    .sort((a, b) => size(b) - size(a));
  const bands = padded.filter((p) => p.left <= 0 && p.right >= width);
  for (const p of [...bands, ...padded.filter((p) => !bands.includes(p))]) {
    const overlaps =
      p.left < area.right &&
      p.right > area.left &&
      p.top < area.bottom &&
      p.bottom > area.top;
    if (!overlaps) continue;
    const touchesLeft = p.left <= area.left;
    const touchesRight = p.right >= area.right;
    const sideColumn = touchesLeft !== touchesRight;
    const cuts: ScreenRect[] = [
      { ...area, left: Math.max(area.left, p.right) },
      { ...area, right: Math.min(area.right, p.left) },
      ...(bands.length && sideColumn
        ? []
        : [
            { ...area, top: Math.max(area.top, p.bottom) },
            { ...area, bottom: Math.min(area.bottom, p.top) },
          ]),
    ];
    const best = cuts.reduce((a, b) => (size(b) > size(a) ? b : a));

    if (size(best) > 0) Object.assign(area, best);
  }
  return area;
}

export const CAMERA_INTRO_MS = 1250;

const ZOOM_PER_PIXEL = 0.001;

const WHEEL_STEP_MAX = 200;

const LINE_PIXELS = 16;

export class CameraController {
  private camera: CameraLens;
  private scene: CameraScene;
  private pitch: CameraPitch;
  private dugoutPoints: Point[];
  private eventBus: (CameraBus) | undefined;
  private manual = false;
  private minZoom = Number.POSITIVE_INFINITY;
  private followArea: ScreenRect | null = null;
  private fitZoomComplete: (() => void) | undefined;

  private framed: {
    points: FocusPoints;
    area: ScreenRect;
    centre: Point;
  } | null = null;
  private handoffTimer: ({ remove(dispatchCallback?: boolean): unknown }) | undefined;
  private unsubscribers: (() => void)[] = [];

  private readonly hudRects: (() => ScreenRect[] | undefined) | undefined;
  constructor(
{ scene,pitch,world,dugoutPoints,eventBus,hudRects }: { scene: CameraScene; pitch: CameraPitch; world: { width: number; height: number; }; dugoutPoints: Point[]; eventBus?: CameraBus; hudRects?: () => ScreenRect[]|undefined; }  ) {
    this.hudRects = hudRects;
    this.scene = scene;
    this.camera = scene.cameras.main;
    this.pitch = pitch;
    this.dugoutPoints = dugoutPoints;
    this.eventBus = eventBus;

    this.camera.setBackgroundColor(MATCH_STYLE.background);
    this.camera.setBounds(0, 0, world.width, world.height);

    this.bindInput();
    this.scene.scale.on("resize", this.onResize, this);
    this.snap(this.overviewFraming());
  }

  private frame(
{ points,pad=1.12,topInset=0,sideInset=0 }: { points: Point[]; pad?: number; topInset?: number; sideInset?: number; }  ): { centre: Point; zoom: number } {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const y0 = Math.min(...ys) - 70;
    const y1 = Math.max(...ys);
    const { width, height } = this.scene.scale;
    const zoom = Math.min(
      (width - 2 * sideInset) / ((x1 - x0) * pad),
      (height - topInset) / ((y1 - y0) * pad)
    );
    return {
      centre: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 - topInset / (2 * zoom) },
      zoom,
    };
  }

  private pitchCorners(): Point[] {
    return ([
      [0, 0],
      [20, 0],
      [0, 11],
      [20, 11],
    ] as const).map(([x, y]) => this.pitch.getPointPosition(x, y));
  }

  private overviewFraming() {
    return this.frame({ points: [...this.pitchCorners(),...this.dugoutPoints],pad: 1.06,topInset: 96 });
  }

  private snap({ centre, zoom }: { centre: Point; zoom: number }): void {
    this.allowFraming(centre, zoom);
    this.camera.setZoom(zoom);
    this.camera.centerOn(centre.x, centre.y);
  }

  private glide(centre: Point, zoom: number, duration = MOVE_MS): void {
    this.stopFollow();
    this.framed = null;
    if (reducedMotion()) {
      this.snap({ centre, zoom });
      return;
    }
    this.allowFraming(centre, Math.min(this.camera.zoom, zoom));
    if (zoom !== this.camera.zoom)
      this.camera.zoomTo(zoom, duration, "Sine.easeInOut", true);
    this.camera.pan(centre.x, centre.y, duration, "Sine.easeInOut", true);
  }

  private allowFraming(centre: Point, zoom: number): void {
    this.minZoom = Math.min(this.minZoom, zoom * 0.8);
    const bounds = this.camera.getBounds();
    const halfWidth = this.camera.width / (2 * zoom);
    const halfHeight = this.camera.height / (2 * zoom);
    const left = Math.min(bounds.x, centre.x - halfWidth);
    const top = Math.min(bounds.y, centre.y - halfHeight);
    this.camera.setBounds(
      left,
      top,
      Math.max(bounds.right, centre.x + halfWidth) - left,
      Math.max(bounds.bottom, centre.y + halfHeight) - top
    );
  }

  private cancelCameraWork(stopPan = true): void {
    if (this.fitZoomComplete) {
      this.camera.off("camerazoomcomplete", this.fitZoomComplete);
      this.fitZoomComplete = undefined;
    }
    this.handoffTimer?.remove(false);
    this.handoffTimer = undefined;
    if (stopPan) this.camera.panEffect.reset();
    this.camera.zoomEffect.reset();
    this.stopFollow();
  }

  private publishState(state: "neutral" | "active", duration: number): void {
    this.eventBus?.emit(GameEventNames.Camera_StateChanged, {
      state,
      duration,
    });
  }

  public intro(duration = CAMERA_INTRO_MS): void {
    this.cancelCameraWork();
    const target = this.overviewFraming();
    if (reducedMotion()) {
      this.snap(target);
      return;
    }

    const centre = this.camera.roundPixels
      ? {
          x:
            Math.floor(target.centre.x - this.camera.width / 2) +
            this.camera.width / 2,
          y:
            Math.floor(target.centre.y - this.camera.height / 2) +
            this.camera.height / 2,
        }
      : target.centre;
    this.snap({ centre, zoom: target.zoom * 0.72 });
    this.camera.zoomTo(target.zoom, duration, "Cubic.easeInOut", true);
  }

  public overview(duration = MOVE_MS): void {
    this.cancelCameraWork();
    const { centre, zoom } = this.overviewFraming();
    this.glide(centre, zoom, duration);
    this.publishState("neutral", duration);
  }

  public focus(point: Point, duration = MOVE_MS, force = false): void {
    if (this.manual && !force) return;
    this.trackPoints([point], duration);
  }

  public focusSquare(x: number, y: number, duration = MOVE_MS): void {
    this.focus(this.pitch.getPixelPosition(x, y), duration);
  }

  private projectSquares(squares: Point[]): FocusPoints | null {
    const [first, ...rest] = squares;
    if (!first) return null;
    return [this.pitch.getPixelPosition(first.x, first.y), ...rest.map((square) => this.pitch.getPixelPosition(square.x, square.y))];
  }

  public focusSquares(squares: Point[], duration = MOVE_MS): void {
    if (this.manual) return;
    const points = this.projectSquares(squares);
    if (points) this.trackPoints(points, duration);
  }

  private pointBox(points: Point[]): ScreenRect {
    return {
      left: Math.min(...points.map((p) => p.x)) - 50,
      right: Math.max(...points.map((p) => p.x)) + 50,
      top: Math.min(...points.map((p) => p.y)) - 70,
      bottom: Math.max(...points.map((p) => p.y)) + 25,
    };
  }

  private centreInArea(middle: Point, area: ScreenRect, zoom: number): Point {
    const { width, height } = this.scene.scale;
    return {
      x: middle.x - (area.left + area.right - width) / 2 / zoom,
      y: middle.y - (area.top + area.bottom - height) / 2 / zoom,
    };
  }

  private trackPoints(points: FocusPoints, duration: number): void {
    const previous = this.framed;
    this.cancelCameraWork(false);
    const zoom = this.camera.zoom;
    const area = this.clearAreaNow();
    const box = this.pointBox(points);
    const halfWidth = (area.right - area.left) / (2 * 1.15 * zoom);
    const halfHeight = (area.bottom - area.top) / (2 * 1.15 * zoom);
    const along = ({ anchor,low,high,half }: { anchor: number; low: number; high: number; half: number; }) =>
      high - low <= 2 * half
        ? (low + high) / 2
        : Math.min(Math.max(anchor, low + half), high - half);
    const centre = this.centreInArea(
      {
        x: along({ anchor: points[0].x,low: box.left,high: box.right,half: halfWidth }),
        y: along({ anchor: points[0].y,low: box.top,high: box.bottom,half: halfHeight }),
      },
      area,
      zoom
    );

    const required =
      box.right - box.left <= 2 * halfWidth &&
      box.bottom - box.top <= 2 * halfHeight
        ? points
        : points.slice(0, 1);
    if (previous) {
      const { width, height } = this.scene.scale;

      const held = this.camera.panEffect.isRunning
        ? previous.centre
        : {
            x: this.camera.scrollX + this.camera.width / 2,
            y: this.camera.scrollY + this.camera.height / 2,
          };
      const visible = required.every((p) => {
        const x = width / 2 + (p.x - held.x) * zoom;
        const y = height / 2 + (p.y - held.y) * zoom;
        return (
          x - 50 * zoom >= area.left &&
          x + 50 * zoom <= area.right &&
          y - 70 * zoom >= area.top &&
          y + 25 * zoom <= area.bottom
        );
      });
      if (
        visible &&
        Math.hypot(centre.x - held.x, centre.y - held.y) * zoom <=
          PAN_DEADBAND_PX
      ) {
        this.framed = { points, area, centre: held };
        return;
      }
    }
    this.glide(centre, zoom, duration);
    this.framed = { points, area, centre };
    this.publishState("active", duration);
  }

  public fitSquares(squares: Point[], duration = 420): void {
    if (this.manual) return;
    const points = this.projectSquares(squares);
    if (!points) return;
    this.cancelCameraWork();
    const area = this.clearAreaNow();
    const box = this.pointBox(points);
    const zoom = Math.min(
      (area.right - area.left) / ((box.right - box.left) * 1.15),
      (area.bottom - area.top) / ((box.bottom - box.top) * 1.15),
      TEAM_MAX_ZOOM
    );
    const centre = this.centreInArea(
      {
        x: (box.left + box.right) / 2,
        y: (box.top + box.bottom) / 2,
      },
      area,
      zoom
    );
    const { width, height } = this.scene.scale;
    const willZoom = zoom !== this.camera.zoom && !reducedMotion();
    this.glide(centre, zoom, duration);
    this.framed = { points, area, centre };
    if (willZoom) {
      this.fitZoomComplete = () => {
        this.fitZoomComplete = undefined;
        if (
          !this.handoffTimer &&
          (width !== this.scene.scale.width ||
            height !== this.scene.scale.height)
        )
          this.fitSquares(squares, REFRAME_MS);
      };
      this.camera.once("camerazoomcomplete", this.fitZoomComplete);
    }
    this.publishState("active", reducedMotion() ? 0 : duration);
  }

  public handoff(all: Point[], next: Point[]): void {
    this.release();
    if (reducedMotion()) {
      if (next.length) this.fitSquares(next, 0);
      else if (all.length) this.fitSquares(all, 0);
      else this.overview(0);
      return;
    }
    if (all.length) this.fitSquares(all, 650);
    else this.overview(650);
    this.handoffTimer = this.scene.time.delayedCall(1250, () => {
      this.handoffTimer = undefined;
      if (next.length) this.fitSquares(next, 650);
    });
  }

  private reframingSuppressed(): boolean {
    return this.manual || Boolean(this.handoffTimer) || this.camera.zoomEffect.isRunning;
  }

  public refreshFraming(reason: "hud" | "resize" = "hud"): void {
    if (this.reframingSuppressed()) return;
    const previous = this.followArea ?? this.framed?.area;
    if (!previous) return;
    const area = this.clearAreaNow();
    const narrowed =
      Math.max(
        area.left - previous.left,
        previous.right - area.right,
        area.top - previous.top,
        previous.bottom - area.bottom
      ) > REFRAME_TOLERANCE_PX;
    if (reason !== "resize" && !narrowed) return;
    if (this.followArea) this.followInClearArea(area);
    else if (this.framed) this.trackPoints(this.framed.points, REFRAME_MS);
  }

  private clearAreaNow(): ScreenRect {
    const { width, height } = this.scene.scale;
    return clearArea(
      width,
      height,
      this.hudRects?.() ?? defaultHudRects(width, height)
    );
  }

  public follow(target: Phaser.GameObjects.GameObject): void {
    if (this.manual) return;
    this.cancelCameraWork();
    this.framed = null;
    this.camera.startFollow(
      target,
      false,
      reducedMotion() ? 1 : 0.08,
      reducedMotion() ? 1 : 0.08
    );
    this.followInClearArea();
    this.publishState("active", 400);
  }

  private followInClearArea(area = this.clearAreaNow()): void {
    this.followArea = area;
    this.camera.setFollowOffset(
      (area.left + area.right - this.camera.width) / (2 * this.camera.zoom),
      (area.top + area.bottom - this.camera.height) / (2 * this.camera.zoom)
    );
  }

  public stopFollow(): void {
    if (this.followArea) {
      this.camera.stopFollow();
      this.followArea = null;
    }
  }

  public release(): void {
    this.cancelCameraWork();
    this.manual = false;
  }

  public reset(duration = MOVE_MS): void {
    this.release();
    this.overview(duration);
  }

  public showAllPlayers(duration = MOVE_MS): void {
    this.reset(duration);
  }

  public shake(duration = 220, intensity = 0.006): void {
    this.camera.shake(duration, intensity);
  }

  public zoomAt(x: number, y: number, factor: number): void {
    this.takeOver();
    const camera = this.camera;
    const min = this.minZoom;
    const zoom = Math.min(
      Math.max(camera.zoom * factor, min),
      Math.max(min * 1.2, 4)
    );

    const shift = 1 / camera.zoom - 1 / zoom;
    camera.scrollX += (x - camera.x - camera.width * camera.originX) * shift;
    camera.scrollY += (y - camera.y - camera.height * camera.originY) * shift;
    camera.setZoom(zoom);
  }

  public panBy(dx: number, dy: number): void {
    this.takeOver();
    this.camera.scrollX -= dx / this.camera.zoom;
    this.camera.scrollY -= dy / this.camera.zoom;
  }

  private wheelScale(mode: number | undefined): number {
    if (mode === 1) return LINE_PIXELS;
    if (mode === 2) return this.camera.height;
    return 1;
  }

  private bindInput(): void {
    const input = this.scene.input;

    input.mouse?.disableContextMenu();

    const onWheel = (...[pointer, , , dy]: [Phaser.Input.Pointer, unknown, number, number]) => {
      const mode = pointer.event instanceof WheelEvent ? pointer.event.deltaMode : undefined;
      const pixels =
        dy * this.wheelScale(mode);
      const turn = Math.max(-WHEEL_STEP_MAX, Math.min(WHEEL_STEP_MAX, pixels));
      this.zoomAt(pointer.x, pointer.y, Math.exp(-turn * ZOOM_PER_PIXEL));
    };
    const onMove = (pointer: Phaser.Input.Pointer) => {
      if (!pointer.rightButtonDown() && !pointer.middleButtonDown()) return;
      this.panBy(
        pointer.x - pointer.prevPosition.x,
        pointer.y - pointer.prevPosition.y
      );
    };
    input.on("wheel", onWheel);
    input.on("pointermove", onMove);
    this.unsubscribers.push(() => {
      input.off("wheel", onWheel);
      input.off("pointermove", onMove);
    });
    this.bindPanKeys();
  }

  private bindPanKeys(): void {
    const keyboard = this.scene.input.keyboard;
    if (!keyboard) return;
    const { KeyCodes } = Phaser.Input.Keyboard;

    const held = (...codes: number[]) =>
      codes.map((code) => keyboard.addKey(code, false));
    const left = held(KeyCodes.A, KeyCodes.LEFT);
    const right = held(KeyCodes.D, KeyCodes.RIGHT);
    const up = held(KeyCodes.W, KeyCodes.UP);
    const down = held(KeyCodes.S, KeyCodes.DOWN);
    const pressed = (keys: Phaser.Input.Keyboard.Key[]) =>
      keys.some((key) => key.isDown) ? 1 : 0;
    const onUpdate = (_time: number, delta: number) => {
      const x = pressed(right) - pressed(left);
      const y = pressed(down) - pressed(up);
      if ((!x && !y) || isTyping(document.activeElement)) return;
      const step = (KEY_PAN_PX_PER_S * delta) / 1000 / Math.hypot(x, y);

      this.panBy(-x * step, -y * step);
    };
    this.scene.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);
    this.unsubscribers.push(() => {
      this.scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate);
      for (const key of [...left, ...right, ...up, ...down])
        keyboard.removeKey(key, true);
    });
  }

  private takeOver(): void {
    this.manual = true;
    this.framed = null;
    this.cancelCameraWork();
    this.publishState("active", 0);
  }

  private readonly onResize = (): void => {
    this.refreshFraming("resize");
  };

  public destroy(): void {
    this.unsubscribers.forEach((off) => {
      off();
    });
    this.unsubscribers = [];
    this.scene.scale.off("resize", this.onResize, this);
    this.cancelCameraWork();
  }
}
