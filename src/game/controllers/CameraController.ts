import Phaser from "phaser";
import { IEventBus } from "../../services/EventBus";
import { GameEventNames } from "../../types/events";
import { Pitch } from "../elements/Pitch";
import { prefersReducedMotion as reducedMotion } from "../presentation/motion";
import { PitchThemeId, resolvePitchTheme } from "../presentation/pitchThemes";

type Point = { x: number; y: number };

/** How much closer than the overview the camera sits on the action. */
const ACTION_ZOOM = 1.75;
const MOVE_MS = 700;


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
    style?: PitchThemeId
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

  /** Fit a set of world points in the window, with headroom for figures. */
  private frame(points: Point[], pad = 1.12): { centre: Point; zoom: number } {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const y0 = Math.min(...ys) - 70; // figures stand above their squares
    const y1 = Math.max(...ys);
    const { width, height } = this.scene.scale;
    const zoom = Math.min(
      width / ((x1 - x0) * pad),
      height / ((y1 - y0) * pad)
    );
    return { centre: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, zoom };
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
    return this.frame([...this.pitchCorners(), ...this.dugoutPoints], 1.06);
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
  public intro(duration = 2200): void {
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
   * Frame a group of squares, such as the acting team and the ball, as close
   * as the action framing allows while keeping every one in view. The extra
   * padding keeps them clear of the HUD panels in the window's corners.
   */
  public focusSquares(
    squares: { x: number; y: number }[],
    duration = MOVE_MS
  ): void {
    if (this.manual || squares.length === 0) return;
    const { centre, zoom } = this.frame(
      squares.map((s) => this.pitch.getPixelPosition(s.x, s.y)),
      1.6
    );
    const fitted = Math.max(
      this.overviewFraming().zoom,
      Math.min(zoom, this.actionZoom())
    );
    this.glide(centre, fitted, duration);
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
