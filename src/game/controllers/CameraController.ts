import Phaser from "phaser";
import { IEventBus } from "../../services/EventBus";
import { GameEventNames } from "../../types/events";
import { Pitch } from "../elements/Pitch";
import { prefersReducedMotion as reducedMotion } from "../presentation/motion";
import { MATCH_STYLE } from "../presentation/matchStyle";
import { matchesMedia, TOUCH_QUERY } from "../presentation/phoneLayout";
import { ISO } from "../elements/GridUtils";
import { isTyping } from "../presentation/keyboardFocus";

type Point = { x: number; y: number };

/** How much closer than the overview the camera sits on the action. */
const ACTION_ZOOM = 1.5;
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
/** Ignore small automatic corrections while the required action stays clear. */
const PAN_DEADBAND_PX = 64;
const ZOOM_DEADBAND = 0.1;

/** Room between a framed square and a panel, so its figure clears it too. */
const PANEL_MARGIN_PX = 24;

/**
 * The farthest the camera pulls back to frame squares: a 2 m figure, 25 px
 * a metre seen from 30 degrees up, stays at least this tall on screen.
 * Round 3 saw players 15 px tall on a long reach.
 */
const READABLE_FIGURE_PX = 28;
const FIGURE_WORLD_PX = 2 * 25 * Math.cos(Math.PI / 6);

/**
 * On a touch screen the camera never frames a square shorter than this, so
 * a thumb can hit it: a diamond 84 by 42 px. Apple asks for 44 pt targets;
 * a diamond's middle row is about that wide and tall.
 */
const THUMB_SQUARE_PX = 42;
export const THUMB_ZOOM = THUMB_SQUARE_PX / ISO.tileHeight;

/**
 * The part of the screen clear of every panel. Full-width score/tray bands
 * set its vertical edges; corner panels trim its sides. Without measured
 * bands, each panel cuts from whichever side keeps the largest clear area.
 */
export function clearArea(
  width: number,
  height: number,
  panels: ScreenRect[]
): ScreenRect {
  const area = { left: 0, top: 0, right: width, bottom: height };
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
  for (const p of bands) {
    if (p.top <= 0) area.top = Math.max(area.top, p.bottom);
    if (p.bottom >= height) area.bottom = Math.min(area.bottom, p.top);
  }
  for (const p of padded.filter((p) => !bands.includes(p))) {
    const overlaps =
      p.left < area.right &&
      p.right > area.left &&
      p.top < area.bottom &&
      p.bottom > area.top;
    if (!overlaps) continue;
    const cuts: ScreenRect[] = [
      { ...area, left: Math.max(area.left, p.right) },
      { ...area, right: Math.min(area.right, p.left) },
      // Measured score/tray edges own the vertical centre. Corner panels
      // trim the sides of that gap rather than moving its centre again.
      ...(bands.length
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
 * It has two framings. The overview fits the pitch and both dugouts in the
 * window; the action framing sits closer, centred on whatever matters now:
 * the selected player, where a player just moved, or the ball in flight.
 * Game events drive it (see SceneOrchestrator and the phase handlers), so a
 * rule change never needs camera code.
 *
 * The coach can always take over: the mouse wheel zooms around the cursor
 * and a right- or middle-button drag pans; on a touch screen two fingers
 * pinch and one finger drags empty ground (see TouchController). A manual
 * move holds the camera still until the next turn or selection.
 */
/** How long the opening sweep over the pitch takes. */
export const CAMERA_INTRO_MS = 2200;

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
  private following: Phaser.GameObjects.GameObject | null = null;
  /** The last automatic destination, including a glide still in progress. */
  private framed: {
    points: Point[];
    area: ScreenRect;
    centre: Point;
    zoom: number;
  } | null = null;
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

  private actionZoom(): number {
    return Math.max(
      this.frame(this.pitchCorners()).zoom * ACTION_ZOOM,
      this.thumbZoom()
    );
  }

  /** The closest a touch screen must come for thumb-sized squares. */
  private thumbZoom(): number {
    return matchesMedia(TOUCH_QUERY) ? THUMB_ZOOM : 0;
  }

  // ----------------------------------------------------------- movement

  private snap({ centre, zoom }: { centre: Point; zoom: number }): void {
    this.allowFraming(centre, zoom);
    this.camera.setZoom(zoom);
    this.camera.centerOn(centre.x, centre.y);
  }

  private glide(centre: Point, zoom: number, duration = MOVE_MS): void {
    const zoomChanged = this.framed?.zoom !== zoom;
    this.stopFollow();
    this.framed = null;
    if (reducedMotion()) {
      this.snap({ centre, zoom });
      return;
    }
    this.allowFraming(centre, Math.min(this.camera.zoom, zoom));
    if (zoomChanged) this.camera.zoomTo(zoom, duration, "Sine.easeInOut", true);
    this.camera.pan(centre.x, centre.y, duration, "Sine.easeInOut", true);
  }

  /** The stadium edge must not clamp the action away from the usable centre. */
  private allowFraming(centre: Point, zoom: number): void {
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

  /** Publish whether the camera is on its neutral framing. */
  private publishState(state: "neutral" | "active", duration: number): void {
    this.eventBus?.emit(GameEventNames.Camera_StateChanged, {
      state,
      duration,
    });
  }

  /**
   * The opening shot: the whole stadium, then a slow glide down onto the
   * pitch while the loading screen fades.
   */
  public intro(duration = CAMERA_INTRO_MS): void {
    if (reducedMotion()) return;
    const { width, height } = this.camera.getBounds();
    this.snap(
      this.frame(
        [
          { x: 0, y: 0 },
          { x: width, y: height },
        ],
        1
      )
    );
    const { centre, zoom } = this.overviewFraming();
    this.camera.zoomTo(zoom, duration, "Cubic.easeInOut", true);
    this.camera.pan(centre.x, centre.y, duration, "Cubic.easeInOut", true);
  }

  /** The whole pitch and both benches. */
  public overview(duration = MOVE_MS): void {
    const { centre, zoom } = this.overviewFraming();
    this.glide(centre, zoom, duration);
    this.publishState("neutral", duration);
  }

  /** Close on a world point, unless the coach has taken the camera. */
  public focus(point: Point, duration = MOVE_MS, force = false): void {
    if (this.manual && !force) return;
    this.focusPoints([point], duration);
  }

  /** Close on a square. */
  public focusSquare(x: number, y: number, duration = MOVE_MS): void {
    this.focus(this.pitch.getPixelPosition(x, y), duration);
  }

  /**
   * Frame a group of squares, such as the acting team and the ball, or a
   * player's reach, as close as the action framing allows while keeping
   * them in view and clickable: in the part of the screen clear of every
   * HUD panel, measured from the page. The camera may pull back past the
   * overview, but never so far that players get hard to read. When the
   * squares do not fit at that zoom, it frames the ones nearest the first
   * square, the player whose reach it is.
   */
  public focusSquares(
    squares: { x: number; y: number }[],
    duration = MOVE_MS
  ): void {
    if (this.manual || squares.length === 0) return;
    this.focusPoints(
      squares.map((s) => this.pitch.getPixelPosition(s.x, s.y)),
      duration
    );
  }

  private focusPoints(points: Point[], duration: number): void {
    const { width, height } = this.scene.scale;
    const area = this.clearAreaNow();
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    // Figures stand above their squares
    const box = {
      left: Math.min(...xs),
      right: Math.max(...xs),
      top: Math.min(...ys) - 70,
      bottom: Math.max(...ys),
    };
    const pad = 1.15;
    const areaWidth = area.right - area.left;
    const areaHeight = area.bottom - area.top;
    const fit = Math.min(
      areaWidth / ((box.right - box.left) * pad),
      areaHeight / ((box.bottom - box.top) * pad)
    );
    const closest = this.actionZoom();
    const readable = Math.max(
      Math.min(READABLE_FIGURE_PX / FIGURE_WORLD_PX, closest),
      this.thumbZoom()
    );
    const previous = this.framed;
    // Spending movement or closing a panel should not zoom back in on each
    // smaller reach. Keep the last zoom whenever it still fits and is readable.
    const zoom =
      previous &&
      previous.zoom >= readable &&
      previous.zoom <= Math.min(fit, closest)
        ? previous.zoom
        : Math.max(readable, Math.min(fit, closest));
    // The world point at the middle of the clear area: the box's middle,
    // or as near the first square as keeps the view inside the box
    const along = (anchor: number, low: number, high: number, half: number) =>
      high - low <= 2 * half
        ? (low + high) / 2
        : Math.min(Math.max(anchor, low + half), high - half);
    const middle = {
      x: along(points[0].x, box.left, box.right, areaWidth / (2 * pad * zoom)),
      y: along(points[0].y, box.top, box.bottom, areaHeight / (2 * pad * zoom)),
    };
    // The camera centres the screen, not the clear area
    const centre = {
      x: middle.x - ((area.left + area.right) / 2 - width / 2) / zoom,
      y: middle.y - ((area.top + area.bottom) / 2 - height / 2) / zoom,
    };
    if (previous && previous.zoom >= readable) {
      const shift =
        Math.hypot(centre.x - previous.centre.x, centre.y - previous.centre.y) *
        previous.zoom;
      // A long reach cannot fit at readable zoom. Its acting player takes
      // priority; a group that fits must keep every player/target visible.
      const required = fit < readable ? points.slice(0, 1) : points;
      const visible = required.every((p) => {
        const x = width / 2 + (p.x - previous.centre.x) * previous.zoom;
        const y = height / 2 + (p.y - previous.centre.y) * previous.zoom;
        return (
          x >= area.left &&
          x <= area.right &&
          y - 70 * previous.zoom >= area.top &&
          y <= area.bottom
        );
      });
      if (
        shift <= PAN_DEADBAND_PX &&
        Math.abs(zoom / previous.zoom - 1) <= ZOOM_DEADBAND &&
        visible
      ) {
        this.framed = { ...previous, points, area };
        return;
      }
    }
    this.glide(centre, zoom, duration);
    this.framed = { points, area, centre, zoom };
    this.publishState("active", duration);
  }

  /**
   * A HUD panel opened, closed or changed size since the camera last
   * framed squares, such as the action menu that opens once a player is
   * selected: frame the same squares again, clear of the panels as they
   * are now. Nothing moves when the clear area is the same, after the
   * camera has moved on, or while the coach holds it.
   */
  public refreshFraming(): void {
    const framed = this.framed;
    if (!framed || this.manual) return;
    const area = this.clearAreaNow();
    // A closing panel gives space back. Keep the view the coach was using.
    if (
      area.left <= framed.area.left &&
      area.right >= framed.area.right &&
      area.top <= framed.area.top &&
      area.bottom >= framed.area.bottom
    ) {
      this.framed = { ...framed, area };
      return;
    }
    const moved = (Object.keys(area) as (keyof ScreenRect)[]).some(
      (side) => Math.abs(area[side] - framed.area[side]) > REFRAME_TOLERANCE_PX
    );
    if (moved) this.focusPoints(framed.points, REFRAME_MS);
  }

  private clearAreaNow(): ScreenRect {
    const { width, height } = this.scene.scale;
    return clearArea(
      width,
      height,
      this.hudRects?.() ?? defaultHudRects(width, height)
    );
  }

  /** Keep a moving object (the ball in flight) in the middle of the frame. */
  public follow(target: Phaser.GameObjects.GameObject, zoom?: number): void {
    if (this.manual || reducedMotion()) return;
    this.framed = null;
    this.following = target;
    this.camera.zoomTo(
      zoom ?? this.actionZoom() * 0.85,
      400,
      "Sine.easeOut",
      true
    );
    this.camera.startFollow(target, false, 0.08, 0.08);
    this.publishState("active", 400);
  }

  public stopFollow(): void {
    if (this.following) {
      this.camera.stopFollow();
      this.following = null;
    }
  }

  /** A new turn or selection hands the camera back to the game. */
  public release(): void {
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
    const min = this.overviewFraming().zoom * 0.8;
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
    this.stopFollow();
    this.camera.panEffect.reset();
    this.camera.zoomEffect.reset();
    this.publishState("active", 0);
  }

  private onResize(): void {
    if (this.manual) return;
    this.framed = null;
    this.snap(this.overviewFraming());
  }

  public destroy(): void {
    this.unsubscribers.forEach((off) => off());
    this.unsubscribers = [];
    this.scene.scale.off("resize", this.onResize, this);
    this.stopFollow();
  }
}
