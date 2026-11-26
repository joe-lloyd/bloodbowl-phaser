import Phaser from "phaser";
import type { CameraController } from "./CameraController";
import { type ScreenPoint, TouchGestures } from "./TouchGestures";

export interface WorldPoint {
  worldX: number;
  worldY: number;
}

export interface TouchTargets {
  tap(at: WorldPoint): void;

  fitAll(at: WorldPoint): boolean;

  showCard(at: WorldPoint): boolean;

  startRoute(at: WorldPoint): boolean;
  routeTo(at: WorldPoint): void;
}

const LOUPE_PX = 116;
const LOUPE_LIFT_PX = 110;
const LOUPE_ZOOM = 1.9;
const LOUPE_MIN_ZOOM = 1.6;

export class TouchController {
  private readonly gestures: TouchGestures;
  private loupe: Phaser.Cameras.Scene2D.Camera | null = null;
  private loupeRing: HTMLDivElement | null = null;
  private readonly unbind: () => void;

  private readonly scene: Phaser.Scene;
  constructor(
    scene: Phaser.Scene,
    camera: CameraController,
    targets: TouchTargets
  ) {
    this.scene = scene;
    this.gestures = new TouchGestures({
      tap: (at) => {
        targets.tap(this.world(at));
      },
      doubleTap: (at) => targets.fitAll(this.world(at)),
      longPress: (at) => {
        if (targets.showCard(this.world(at))) navigator.vibrate(15);
      },
      dragStart: (from) => targets.startRoute(this.world(from)),
      routeTo: (at) => {
        const world = this.world(at);
        targets.routeTo(world);
        this.showLoupe(at, world);
      },
      routeEnd: () => {
        this.hideLoupe();
      },
      pan: (dx, dy) => {
        camera.panBy(dx, dy);
      },
      pinch: ({ centre, factor, dx, dy }) => {
        camera.panBy(dx, dy);
        camera.zoomAt(centre.x, centre.y, factor);
      },
    });

    const input = scene.input;
    const canvas = scene.game.canvas;
    const onDown = (pointer: Phaser.Input.Pointer) => {
      if (!pointer.wasTouch || pointer.event.target !== canvas) return;

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

  private createLoupe(): Phaser.Cameras.Scene2D.Camera {
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
      ring.style.cssText = `position:absolute;pointer-events:none;width:${String(LOUPE_PX + 6)}px;height:${String(LOUPE_PX + 6)}px;border:3px solid #e8c25a;border-radius:12px;box-shadow:0 6px 18px rgba(0,0,0,.55)`;
      this.scene.game.canvas.parentElement?.append(ring);
      this.loupeRing = ring;
    return this.loupe;
  }

  private showLoupe(finger: ScreenPoint, world: WorldPoint): void {
    const { width } = this.scene.scale;
    const left = Phaser.Math.Clamp(
      finger.x - LOUPE_PX / 2,
      0,
      width - LOUPE_PX
    );
    const above = finger.y - LOUPE_LIFT_PX - LOUPE_PX / 2;
    const top = above >= 0 ? above : finger.y + LOUPE_LIFT_PX - LOUPE_PX / 2;
    const loupe = this.loupe ?? this.createLoupe();
    const main = this.scene.cameras.main;
    loupe.setVisible(true);
    loupe.setPosition(left, top);
    loupe.setZoom(Math.max(main.zoom * LOUPE_ZOOM, LOUPE_MIN_ZOOM));
    loupe.centerOn(world.worldX, world.worldY);
    if (!this.loupeRing) {
      return;
    }

    this.loupeRing.style.display = "block";
    this.loupeRing.style.left = `${String(left - 3)}px`;
    this.loupeRing.style.top = `${String(top - 3)}px`;
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
