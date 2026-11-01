import Phaser from "phaser";
import { CameraController } from "./CameraController";
import { ScreenPoint, TouchGestures } from "./TouchGestures";

/** A point in the world, where the camera looks. */
export type WorldPoint = { worldX: number; worldY: number };

/** What the match does with each touch gesture. */
export interface TouchTargets {
  /** A tap, the same as a mouse click there. */
  tap(at: WorldPoint): void;
  /** A double tap. True when it fit the whole pitch, so it is no tap. */
  fitAll(at: WorldPoint): boolean;
  /** Press and hold: the card of whoever stands there. True if shown. */
  showCard(at: WorldPoint): boolean;
  /** A drag began here. True when it draws a route, false to pan. */
  startRoute(at: WorldPoint): boolean;
  routeTo(at: WorldPoint): void;
}

/** The magnifier over a route being drawn, in screen pixels. */
const LOUPE_PX = 116;
const LOUPE_LIFT_PX = 110;
const LOUPE_ZOOM = 1.9;
const LOUPE_MIN_ZOOM = 1.6;

/**
 * TouchController: fingers on the match board.
 *
 * A tap clicks; a press and hold shows the player card; a drag from a
 * player draws their route under a magnifier, and a drag from anywhere
 * else pans; two fingers pinch to zoom; a double tap on empty ground with
 * nobody selected fits the pitch. A press on something Phaser drags (a
 * player during setup) is left to Phaser. The mouse keeps its own
 * handlers: only touch pointers come here.
 */
export class TouchController {
  private readonly gestures: TouchGestures;
  private loupe: Phaser.Cameras.Scene2D.Camera | null = null;
  private loupeRing: HTMLDivElement | null = null;
  private readonly unbind: () => void;

  constructor(
    private readonly scene: Phaser.Scene,
    camera: CameraController,
    targets: TouchTargets
  ) {
    this.gestures = new TouchGestures({
      tap: (at) => targets.tap(this.world(at)),
      doubleTap: (at) => targets.fitAll(this.world(at)),
      longPress: (at) => {
        if (targets.showCard(this.world(at))) navigator.vibrate?.(15);
      },
      dragStart: (from) => targets.startRoute(this.world(from)),
      routeTo: (at) => {
        const world = this.world(at);
        targets.routeTo(world);
        this.showLoupe(at, world);
      },
      routeEnd: () => this.hideLoupe(),
      pan: (dx, dy) => camera.panBy(dx, dy),
      pinch: (centre, factor, dx, dy) => {
        camera.panBy(dx, dy);
        camera.zoomAt(centre.x, centre.y, factor);
      },
    });

    const input = scene.input;
    const canvas = scene.game.canvas;
    const onDown = (pointer: Phaser.Input.Pointer) => {
      if (!pointer.wasTouch || pointer.event?.target !== canvas) return;
      // Phaser drags this one itself
      if (input.hitTestPointer(pointer).some((o) => o.input?.draggable)) return;
      this.gestures.down(pointer.id, { x: pointer.x, y: pointer.y });
    };
    const onMove = (pointer: Phaser.Input.Pointer) => {
      if (pointer.wasTouch)
        this.gestures.move(pointer.id, { x: pointer.x, y: pointer.y });
    };
    const onUp = (pointer: Phaser.Input.Pointer) => {
      if (pointer.wasTouch) this.gestures.up(pointer.id);
    };
    input.on("pointerdown", onDown);
    input.on("pointermove", onMove);
    input.on("pointerup", onUp);
    input.on("pointerupoutside", onUp);
    this.unbind = () => {
      input.off("pointerdown", onDown);
      input.off("pointermove", onMove);
      input.off("pointerup", onUp);
      input.off("pointerupoutside", onUp);
    };
  }

  private world(at: ScreenPoint): WorldPoint {
    const p = this.scene.cameras.main.getWorldPoint(at.x, at.y);
    return { worldX: p.x, worldY: p.y };
  }

  /**
   * A magnified view of the board under the finger, lifted above it so
   * the finger does not hide the square it is on. Below the finger when
   * there is no room above.
   */
  private showLoupe(finger: ScreenPoint, world: WorldPoint): void {
    const { width } = this.scene.scale;
    const left = Phaser.Math.Clamp(
      finger.x - LOUPE_PX / 2,
      0,
      width - LOUPE_PX
    );
    const above = finger.y - LOUPE_LIFT_PX - LOUPE_PX / 2;
    const top = above >= 0 ? above : finger.y + LOUPE_LIFT_PX - LOUPE_PX / 2;
    if (!this.loupe) {
      this.loupe = this.scene.cameras.add(
        0,
        0,
        LOUPE_PX,
        LOUPE_PX,
        false,
        "loupe"
      );
      this.loupe.setBackgroundColor(
        this.scene.cameras.main.backgroundColor.rgba
      );
      const ring = document.createElement("div");
      ring.setAttribute("data-testid", "route-loupe");
      ring.style.cssText = `position:absolute;pointer-events:none;width:${LOUPE_PX + 6}px;height:${LOUPE_PX + 6}px;border:3px solid #e8c25a;border-radius:12px;box-shadow:0 6px 18px rgba(0,0,0,.55)`;
      this.scene.game.canvas.parentElement?.appendChild(ring);
      this.loupeRing = ring;
    }
    const main = this.scene.cameras.main;
    this.loupe.setVisible(true);
    this.loupe.setPosition(left, top);
    this.loupe.setZoom(Math.max(main.zoom * LOUPE_ZOOM, LOUPE_MIN_ZOOM));
    this.loupe.centerOn(world.worldX, world.worldY);
    if (this.loupeRing) {
      this.loupeRing.style.display = "block";
      this.loupeRing.style.left = `${left - 3}px`;
      this.loupeRing.style.top = `${top - 3}px`;
    }
  }

  private hideLoupe(): void {
    this.loupe?.setVisible(false);
    if (this.loupeRing) this.loupeRing.style.display = "none";
  }

  public destroy(): void {
    this.unbind();
    this.gestures.cancel();
    if (this.loupe) this.scene.cameras.remove(this.loupe);
    this.loupeRing?.remove();
    this.loupe = null;
    this.loupeRing = null;
  }
}
