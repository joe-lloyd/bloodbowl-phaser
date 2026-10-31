import Phaser from "phaser";
import { IEventBus } from "../../services/EventBus";
import { GameEventNames } from "../../types/events";
import { Pitch } from "../elements/Pitch";
import { prefersReducedMotion as reducedMotion } from "../presentation/motion";
import { PitchThemeId, resolvePitchTheme } from "../presentation/pitchThemes";

type Point = { x: number; y: number };

/** How much closer than the overview the camera sits on the action. */
const ACTION_ZOOM = 1.5;
const MOVE_MS = 700;

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
 * The part of the screen clear of every panel. Each panel in the way cuts
 * the area from whichever side keeps the most of it, largest panel first.
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
  for (const p of padded) {
    const overlaps =
      p.left < area.right &&
      p.right > area.left &&
      p.top < area.bottom &&
      p.bottom > area.top;
    if (!overlaps) continue;
    const cuts: ScreenRect[] = [
      { ...area, left: Math.max(area.left, p.right) },
      { ...area, right: Math.min(area.right, p.left) },
      { ...area, top: Math.max(area.top, p.bottom) },
      { ...area, bottom: Math.min(area.bottom, p.top) },
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
 * and a right- or middle-button drag pans. A manual move holds the camera
 * still until the next turn or selection.
 */
/** How long the opening sweep over the pitch takes. */
export const CAMERA_INTRO_MS = 2200;

export class CameraController {
  private camera: Phaser.Cameras.Scene2D.Camera;
  private scene: Phaser.Scene;
  private pitch: Pitch;
  private dugoutPoints: Point[];
  private eventBus?: IEventBus;
  private manual = false;
  private following: Phaser.GameObjects.GameObject | null = null;
  private unsubscribers: Array<() => void> = [];

  constructor(
    scene: Phaser.Scene,
    pitch: Pitch,
    world: { width: number; height: number },
    dugoutPoints: Point[],
    eventBus?: IEventBus,
    style?: PitchThemeId,
    /** The HUD panels on screen now, measured from the page. */
    private readonly hudRects?: () => ScreenRect[] | undefined
  ) {
    this.scene = scene;
    this.camera = scene.cameras.main;
    this.pitch = pitch;
    this.dugoutPoints = dugoutPoints;
    this.eventBus = eventBus;

    const theme = resolvePitchTheme(style);
    this.camera.setBackgroundColor(theme.background);
    this.camera.setBounds(0, 0, world.width, world.height);
    if (theme.bloom && this.camera.postFX) {
      this.camera.postFX.addBloom(0xffffff, 1, 1, 0.7, 0.5, 4);
    }

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
    return this.frame(this.pitchCorners()).zoom * ACTION_ZOOM;
  }

  // ----------------------------------------------------------- movement

  private snap({ centre, zoom }: { centre: Point; zoom: number }): void {
    this.camera.setZoom(zoom);
    this.camera.centerOn(centre.x, centre.y);
  }

  private glide(centre: Point, zoom: number, duration = MOVE_MS): void {
    this.stopFollow();
    if (reducedMotion()) {
      this.snap({ centre, zoom });
      return;
    }
    this.camera.zoomTo(zoom, duration, "Sine.easeInOut", true);
    this.camera.pan(centre.x, centre.y, duration, "Sine.easeInOut", true);
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
    this.glide(point, this.actionZoom(), duration);
    this.publishState("active", duration);
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
    const { width, height } = this.scene.scale;
    const area = clearArea(
      width,
      height,
      this.hudRects?.() ?? defaultHudRects(width, height)
    );
    const points = squares.map((s) => this.pitch.getPixelPosition(s.x, s.y));
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
    const readable = Math.min(READABLE_FIGURE_PX / FIGURE_WORLD_PX, closest);
    const zoom = Math.max(readable, Math.min(fit, closest));
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
    this.glide(centre, zoom, duration);
    this.publishState("active", duration);
  }

  /** Keep a moving object (the ball in flight) in the middle of the frame. */
  public follow(target: Phaser.GameObjects.GameObject, zoom?: number): void {
    if (this.manual || reducedMotion()) return;
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

  private bindInput(): void {
    const input = this.scene.input;
    // No context menu: the right button pans.
    input.mouse?.disableContextMenu();

    const onWheel = (
      pointer: Phaser.Input.Pointer,
      _over: unknown,
      _dx: number,
      dy: number
    ) => {
      this.takeOver();
      const before = this.camera.getWorldPoint(pointer.x, pointer.y);
      const min = this.overviewFraming().zoom * 0.8;
      const zoom = Math.min(
        Math.max(this.camera.zoom * (dy > 0 ? 0.88 : 1.14), min),
        Math.max(min * 1.2, 4)
      );
      this.camera.setZoom(zoom);
      const after = this.camera.getWorldPoint(pointer.x, pointer.y);
      this.camera.scrollX += before.x - after.x;
      this.camera.scrollY += before.y - after.y;
    };
    const onMove = (pointer: Phaser.Input.Pointer) => {
      if (!pointer.rightButtonDown() && !pointer.middleButtonDown()) return;
      this.takeOver();
      this.camera.scrollX -=
        (pointer.x - pointer.prevPosition.x) / this.camera.zoom;
      this.camera.scrollY -=
        (pointer.y - pointer.prevPosition.y) / this.camera.zoom;
    };
    input.on("wheel", onWheel);
    input.on("pointermove", onMove);
    this.unsubscribers.push(() => {
      input.off("wheel", onWheel);
      input.off("pointermove", onMove);
    });
  }

  private takeOver(): void {
    this.manual = true;
    this.stopFollow();
    this.camera.panEffect.reset();
    this.camera.zoomEffect.reset();
    this.publishState("active", 0);
  }

  private onResize(): void {
    if (!this.manual) this.snap(this.overviewFraming());
  }

  public destroy(): void {
    this.unsubscribers.forEach((off) => off());
    this.unsubscribers = [];
    this.scene.scale.off("resize", this.onResize, this);
    this.stopFollow();
  }
}
