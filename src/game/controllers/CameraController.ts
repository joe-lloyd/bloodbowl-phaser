import Phaser from "phaser";
import { IEventBus } from "../../services/EventBus";
import { GameEventNames } from "../../types/events";
import { Pitch } from "../elements/Pitch";
import { prefersReducedMotion as reducedMotion } from "../presentation/motion";
import { MATCH_STYLE } from "../presentation/matchStyle";
import { ISO } from "../elements/GridUtils";
import { isTyping } from "../presentation/keyboardFocus";

type Point = { x: number; y: number };

const MOVE_MS = 700;
/** How fast WASD or the arrow keys slide the view, in screen pixels a second. */
const KEY_PAN_PX_PER_S = 900;

/** A rectangle on screen, in the game canvas's pixels. */
export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Where the HUD sits when the page cannot say (tests, a HUD not yet laid
 * out): the side columns of HUDLayout, w-72 and at most 40vw, 16 px in from
 * each edge, and the score bug across the top centre.
 */
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

/** A clear area that moved less than this keeps the framing as it is. */
const REFRAME_TOLERANCE_PX = 8;
/** A reframe for a panel that just opened: short, as the coach is about to click. */
const REFRAME_MS = 350;
const PAN_DEADBAND_PX = 64;

/** Room between a framed square and a panel, so its figure clears it too. */
const PANEL_MARGIN_PX = 24;

/** Cap small team fits at a 42px square. A spread team can zoom out further. */
const TEAM_MAX_ZOOM = 42 / ISO.tileHeight;

/**
 * The part of the screen clear of every panel. Each panel in the way cuts
 * the area from whichever side keeps the most of it, largest panel first.
 */
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
    // A panel too big to cut around leaves the area as it was
    if (size(best) > 0) Object.assign(area, best);
  }
  return area;
}

/**
 * CameraController: the match camera.
 *
 * Action tracking pans at the current zoom. Explicit End activation and
 * team-turn handoffs fit groups; setup and restore use the overview.
 *
 * The coach can always take over: the mouse wheel zooms around the cursor
 * and a right- or middle-button drag pans; on a touch screen two fingers
 * pinch and one finger drags empty ground (see TouchController). A manual
 * move holds the camera still until the next turn or selection.
 */
/** One steady opening zoom, also used by setup startup timing. */
export const CAMERA_INTRO_MS = 1250;

/** Zoom per pixel the wheel scrolls: one 100-pixel notch is about 10%. */
const ZOOM_PER_PIXEL = 0.001;
/** One wheel event counts for at most this many pixels. */
const WHEEL_STEP_MAX = 200;
/** A scroll counted in lines, as Firefox does, in pixels. */
const LINE_PIXELS = 16;

export class CameraController {
  private camera: Phaser.Cameras.Scene2D.Camera;
  private scene: Phaser.Scene;
  private pitch: Pitch;
  private dugoutPoints: Point[];
  private eventBus?: IEventBus;
  private manual = false;
  private minZoom = Number.POSITIVE_INFINITY;
  private following: Phaser.GameObjects.GameObject | null = null;
  /** The squares the camera last framed, and the clear area it fit them in. */
  private framed: {
    points: Point[];
    area: ScreenRect;
    centre: Point;
  } | null = null;
  private handoffTimer?: Phaser.Time.TimerEvent;
  private unsubscribers: Array<() => void> = [];

  constructor(
    scene: Phaser.Scene,
    pitch: Pitch,
    world: { width: number; height: number },
    dugoutPoints: Point[],
    eventBus?: IEventBus,
    /** The HUD panels on screen now, measured from the page. */
    private readonly hudRects?: () => ScreenRect[] | undefined
  ) {
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

  // ------------------------------------------------------------ framings

  /**
   * Fit a set of world points in the window, with headroom for figures.
   * `sideInset` keeps them out of that many pixels at each side.
   */
  private frame(
    points: Point[],
    pad = 1.12,
    topInset = 0,
    sideInset = 0
  ): { centre: Point; zoom: number } {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const y0 = Math.min(...ys) - 70; // figures stand above their squares
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
    return [
      [0, 0],
      [20, 0],
      [0, 11],
      [20, 11],
    ].map(([x, y]) => this.pitch.getPointPosition(x, y));
  }

  private overviewFraming() {
    // Keep the score bug and match strip above the playing squares.
    return this.frame([...this.pitchCorners(), ...this.dugoutPoints], 1.06, 96);
  }

  // ----------------------------------------------------------- movement

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

  /** Leave enough world around the stadium to centre action in the HUD gap. */
  private allowFraming(centre: Point, zoom: number): void {
    // Manual zoom must allow backing out from even the widest team fit.
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
    this.handoffTimer?.remove(false);
    this.handoffTimer = undefined;
    if (stopPan) this.camera.panEffect.reset();
    this.camera.zoomEffect.reset();
    this.stopFollow();
  }

  /** Publish whether the camera is on its neutral framing. */
  private publishState(state: "neutral" | "active", duration: number): void {
    this.eventBus?.emit(GameEventNames.Camera_StateChanged, {
      state,
      duration,
    });
  }

  /** Zoom into the overview with its world centre fixed throughout. */
  public intro(duration = CAMERA_INTRO_MS): void {
    this.cancelCameraWork();
    const target = this.overviewFraming();
    if (reducedMotion()) {
      this.snap(target);
      return;
    }
    // Pixel-art cameras floor scroll on their first render. Start at that
    // same centre so even the first visible frame holds its world position.
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

  /** The whole pitch and both benches. */
  public overview(duration = MOVE_MS): void {
    this.cancelCameraWork();
    const { centre, zoom } = this.overviewFraming();
    this.glide(centre, zoom, duration);
    this.publishState("neutral", duration);
  }

  /** Close on a world point, unless the coach has taken the camera. */
  public focus(point: Point, duration = MOVE_MS, force = false): void {
    if (this.manual && !force) return;
    this.trackPoints([point], duration);
  }

  /** Close on a square. */
  public focusSquare(x: number, y: number, duration = MOVE_MS): void {
    this.focus(this.pitch.getPixelPosition(x, y), duration);
  }

  /** Track action at the current zoom. The first square is the required target. */
  public focusSquares(squares: Point[], duration = MOVE_MS): void {
    if (this.manual || squares.length === 0) return;
    this.trackPoints(
      squares.map((s) => this.pitch.getPixelPosition(s.x, s.y)),
      duration
    );
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

  private trackPoints(points: Point[], duration: number): void {
    const previous = this.framed;
    this.cancelCameraWork(false);
    const zoom = this.camera.zoom;
    const area = this.clearAreaNow();
    const box = this.pointBox(points);
    const halfWidth = (area.right - area.left) / (2 * 1.15 * zoom);
    const halfHeight = (area.bottom - area.top) / (2 * 1.15 * zoom);
    const along = (anchor: number, low: number, high: number, half: number) =>
      high - low <= 2 * half
        ? (low + high) / 2
        : Math.min(Math.max(anchor, low + half), high - half);
    const centre = this.centreInArea(
      {
        x: along(points[0].x, box.left, box.right, halfWidth),
        y: along(points[0].y, box.top, box.bottom, halfHeight),
      },
      area,
      zoom
    );
    // A reach larger than the current view gives priority to its acting player.
    const required =
      box.right - box.left <= 2 * halfWidth &&
      box.bottom - box.top <= 2 * halfHeight
        ? points
        : points.slice(0, 1);
    if (previous) {
      const { width, height } = this.scene.scale;
      // A selection may have cancelled the previous pan before it arrived.
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

  /** Intentional team/board fit. Every supplied on-pitch square must fit. */
  public fitSquares(squares: Point[], duration = 420): void {
    if (this.manual || squares.length === 0) return;
    this.cancelCameraWork();
    const points = squares.map((s) => this.pitch.getPixelPosition(s.x, s.y));
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
    this.glide(centre, zoom, duration);
    this.framed = { points, area, centre };
    this.publishState("active", reducedMotion() ? 0 : duration);
  }

  /** Read the whole board before choosing from the new team's players. */
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

  /** Pan when HUD panels cover more space; hold when they close. */
  public refreshFraming(reason: "hud" | "resize" = "hud"): void {
    if (this.manual || this.handoffTimer || this.camera.zoomEffect.isRunning)
      return;
    if (this.following) {
      this.followInClearArea();
      return;
    }
    const framed = this.framed;
    if (!framed) return;
    const area = this.clearAreaNow();
    const narrowed =
      Math.max(
        area.left - framed.area.left,
        framed.area.right - area.right,
        area.top - framed.area.top,
        framed.area.bottom - area.bottom
      ) > REFRAME_TOLERANCE_PX;
    if (reason === "resize" || narrowed)
      this.trackPoints(framed.points, REFRAME_MS);
  }

  private clearAreaNow(): ScreenRect {
    const { width, height } = this.scene.scale;
    return clearArea(
      width,
      height,
      this.hudRects?.() ?? defaultHudRects(width, height)
    );
  }

  /** Follow the ball without changing the coach's zoom. */
  public follow(target: Phaser.GameObjects.GameObject): void {
    if (this.manual) return;
    this.cancelCameraWork();
    this.framed = null;
    this.following = target;
    this.camera.startFollow(
      target,
      false,
      reducedMotion() ? 1 : 0.08,
      reducedMotion() ? 1 : 0.08
    );
    this.followInClearArea();
    this.publishState("active", 400);
  }

  private followInClearArea(): void {
    const area = this.clearAreaNow();
    this.camera.setFollowOffset(
      (area.left + area.right - this.camera.width) / (2 * this.camera.zoom),
      (area.top + area.bottom - this.camera.height) / (2 * this.camera.zoom)
    );
  }

  public stopFollow(): void {
    if (this.following) {
      this.camera.stopFollow();
      this.following = null;
    }
  }

  /** A new turn or selection hands the camera back to the game. */
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

  // -------------------------------------------------------------- input

  /**
   * The coach zooms by `factor`, keeping the world point under the screen
   * point (x, y) where it is: the wheel, or two fingers pinching.
   */
  public zoomAt(x: number, y: number, factor: number): void {
    this.takeOver();
    const camera = this.camera;
    const min = this.minZoom;
    const zoom = Math.min(
      Math.max(camera.zoom * factor, min),
      Math.max(min * 1.2, 4)
    );
    // Phaser shows world point scroll + o + (screen - left - o) / zoom, with
    // o the camera's origin. Its getWorldPoint reads a matrix rebuilt only
    // once a frame, so it cannot measure the new zoom; hold the point still
    // with the same sum instead.
    const shift = 1 / camera.zoom - 1 / zoom;
    camera.scrollX += (x - camera.x - camera.width * camera.originX) * shift;
    camera.scrollY += (y - camera.y - camera.height * camera.originY) * shift;
    camera.setZoom(zoom);
  }

  /** The coach drags the board by (dx, dy) screen pixels. */
  public panBy(dx: number, dy: number): void {
    this.takeOver();
    this.camera.scrollX -= dx / this.camera.zoom;
    this.camera.scrollY -= dy / this.camera.zoom;
  }

  private bindInput(): void {
    const input = this.scene.input;
    // No context menu: the right button pans.
    input.mouse?.disableContextMenu();

    // By how far the wheel turned: a trackpad sends a scroll as dozens of
    // small events, a mouse as a few notches of about 100 pixels each.
    const onWheel = (
      pointer: Phaser.Input.Pointer,
      _over: unknown,
      _dx: number,
      dy: number
    ) => {
      const mode = (pointer.event as WheelEvent | undefined)?.deltaMode;
      const pixels =
        dy * (mode === 1 ? LINE_PIXELS : mode === 2 ? this.camera.height : 1);
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

  /** WASD and the arrow keys slide the view while held. */
  private bindPanKeys(): void {
    const keyboard = this.scene.input.keyboard;
    if (!keyboard) return;
    const { KeyCodes } = Phaser.Input.Keyboard;
    // No capture: a focused text field still gets its letters and arrows
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
      // panBy drags the board; the view moves the other way
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

  private onResize(): void {
    this.refreshFraming("resize");
  }

  public destroy(): void {
    this.unsubscribers.forEach((off) => off());
    this.unsubscribers = [];
    this.scene.scale.off("resize", this.onResize, this);
    this.cancelCameraWork();
  }
}
