import Phaser from "phaser";
import { IEventBus } from "../../services/EventBus";
import { GameEventNames } from "../../types/events";
import { MAX_CAMERA_ZOOM } from "../../config/cameraSettings";

/** Follow-lerp bounds for the intensity mapping (Light … Close). */
const FOLLOW_LERP_LIGHT = 0.08;
const FOLLOW_LERP_CLOSE = 0.25;

/**
 * CameraController - Manages dynamic camera movements
 * Handles zoom, pan, tracking, and camera effects
 *
 * The camera has a "resting" state (zoom + framing, per-viewer settings) it
 * returns to after tracked action, and a follow intensity (0..1) that maps
 * to how tightly and how zoomed-in it tracks. Intensity 0 = follow off.
 */
export class CameraController {
  private camera: Phaser.Cameras.Scene2D.Camera;
  private scene: Phaser.Scene;
  private defaultZoom: number = 1.0;
  private restingZoom: number = 1.0;
  private restingCenterX: number = 0;
  private restingCenterY: number = 0;
  private followIntensity: number = 1.0;
  private isTracking: boolean = false;
  private trackingTween?: Phaser.Tweens.Tween;
  private pitchBounds?: { x: number; y: number; width: number; height: number };
  private eventBus?: IEventBus;

  constructor(
    scene: Phaser.Scene,
    pitchBounds?: { x: number; y: number; width: number; height: number },
    eventBus?: IEventBus
  ) {
    this.scene = scene;
    this.camera = scene.cameras.main;
    this.pitchBounds = pitchBounds;
    this.eventBus = eventBus;

    // The resting view starts as the captured default framing
    this.defaultZoom = this.camera.zoom;
    this.restingZoom = this.camera.zoom;
    this.restingCenterX = this.camera.scrollX + this.camera.width / 2;
    this.restingCenterY = this.camera.scrollY + this.camera.height / 2;
  }

  /**
   * The zoom that frames the whole pitch (same fit as showAllPlayers).
   * Doubles as the minimum resting zoom. Null when pitch bounds are unknown.
   */
  public getFitZoom(): number | null {
    if (!this.pitchBounds) return null;
    const zoomX = this.camera.width / this.pitchBounds.width;
    const zoomY = this.camera.height / this.pitchBounds.height;
    return Math.min(zoomX, zoomY) * 0.9; // 0.9 for slight padding
  }

  /**
   * Set the resting zoom — the state reset() returns to after tracked action.
   * Clamped to [fit-pitch zoom, MAX_CAMERA_ZOOM].
   */
  public setRestingZoom(zoom: number): void {
    const min = this.getFitZoom() ?? this.defaultZoom;
    this.restingZoom = Math.min(MAX_CAMERA_ZOOM, Math.max(min, zoom));
  }

  public getRestingZoom(): number {
    return this.restingZoom;
  }

  /**
   * Set how aggressively the camera follows the action: 0 = off (camera holds
   * the resting view), through Light (~0.08 lerp) to Close (~0.25 lerp).
   */
  public setFollowIntensity(intensity: number): void {
    this.followIntensity = Math.min(1, Math.max(0, intensity));
  }

  public getFollowIntensity(): number {
    return this.followIntensity;
  }

  public isFollowEnabled(): boolean {
    return this.followIntensity > 0;
  }

  /** Light ≈ 0.08 (gentle catch-up) … Close ≈ 0.25 (tight tracking). */
  private getFollowLerp(): number {
    return (
      FOLLOW_LERP_LIGHT +
      (FOLLOW_LERP_CLOSE - FOLLOW_LERP_LIGHT) * this.followIntensity
    );
  }

  /** Resting zoom at low intensity, MAX_CAMERA_ZOOM at full Close. */
  private getTrackZoom(): number {
    return (
      this.restingZoom +
      (MAX_CAMERA_ZOOM - this.restingZoom) * this.followIntensity
    );
  }

  /**
   * Publish a camera-state change. Every move that takes the camera away
   * from its neutral framing publishes "active"; reset() alone publishes
   * "neutral". Consumers (e.g. BoardLabelOverlay) react to this single
   * seam instead of any individual move, so a new camera move never needs
   * its own overlay-side wiring.
   */
  private publishState(state: "neutral" | "active", duration: number): void {
    this.eventBus?.emit(GameEventNames.Camera_StateChanged, {
      state,
      duration,
    });
  }

  /**
   * Smoothly zoom camera to target level
   */
  public zoomTo(zoom: number, duration: number = 800): Promise<void> {
    return new Promise((resolve) => {
      this.scene.tweens.add({
        targets: this.camera,
        zoom: zoom,
        duration: duration,
        ease: Phaser.Math.Easing.Cubic.InOut,
        onComplete: () => resolve(),
      });
    });
  }

  /**
   * Pan camera to specific world coordinates
   */
  public panTo(x: number, y: number, duration: number = 800): Promise<void> {
    return new Promise((resolve) => {
      // Calculate scroll position to center on target
      const scrollX = x - this.camera.width / 2;
      const scrollY = y - this.camera.height / 2;

      this.scene.tweens.add({
        targets: this.camera,
        scrollX: scrollX,
        scrollY: scrollY,
        duration: duration,
        ease: Phaser.Math.Easing.Cubic.InOut,
        onComplete: () => resolve(),
      });
    });
  }

  /**
   * Track a game object with the camera.
   * Lerp and track zoom come from the follow intensity unless a zoom is
   * given explicitly. A no-op when the follow intensity is Off.
   */
  public trackObject(
    object: Phaser.GameObjects.GameObject,
    zoom?: number,
    duration: number = 800
  ): void {
    // Follow intensity Off: gameplay actions must not move the camera.
    if (!this.isFollowEnabled()) return;

    this.isTracking = true;
    this.publishState("active", duration);

    // Stop any existing tracking
    if (this.trackingTween) {
      this.trackingTween.stop();
    }

    // Follow with an intensity-scaled lerp: lower values catch up more
    // slowly, keeping fast-moving targets (the ball) readable.
    const lerp = this.getFollowLerp();
    this.camera.startFollow(object, true, lerp, lerp);

    // Zoom in (higher values = more zoomed in)
    this.zoomTo(zoom ?? this.getTrackZoom(), duration);
  }

  /**
   * Stop tracking and return to the resting view (the coach's chosen zoom
   * and framing, not a hard-coded default)
   */
  public reset(duration: number = 800): Promise<void> {
    return new Promise((resolve) => {
      this.isTracking = false;
      this.publishState(
        Math.abs(this.restingZoom - this.defaultZoom) < 0.001
          ? "neutral"
          : "active",
        duration
      );

      // Stop following
      this.camera.stopFollow();

      // A reset supersedes any in-flight camera tween (settings changes can
      // arrive while a pan/zoom is still running)
      this.scene.tweens.killTweensOf(this.camera);

      // Return to the resting zoom, keeping the resting framing centered
      this.scene.tweens.add({
        targets: this.camera,
        zoom: this.restingZoom,
        scrollX: this.restingCenterX - this.camera.width / 2,
        scrollY: this.restingCenterY - this.camera.height / 2,
        duration: duration,
        ease: Phaser.Math.Easing.Cubic.InOut,
        onComplete: () => resolve(),
      });
    });
  }

  /**
   * Camera shake effect
   */
  public shake(intensity: number = 0.01, duration: number = 200): void {
    this.camera.shake(duration, intensity);
  }

  /**
   * Flash effect
   */
  public flash(duration: number = 200, color: number = 0xffffff): void {
    this.camera.flash(duration, color);
  }

  /**
   * Fade effect
   */
  public fade(duration: number = 500, color: number = 0x000000): Promise<void> {
    return new Promise((resolve) => {
      this.camera.fade(duration, color);
      this.scene.time.delayedCall(duration, () => resolve());
    });
  }

  /**
   * Camera preset: Show all players (fit pitch)
   * Zooms to show the entire pitch with minimal extra space
   */
  public showAllPlayers(duration: number = 800): Promise<void> {
    const zoom = this.getFitZoom();
    if (zoom === null || !this.pitchBounds) {
      console.warn("Pitch bounds not set, using default zoom");
      return this.reset(duration);
    }

    const { x, y, width, height } = this.pitchBounds;

    // Center on pitch
    const centerX = x + width / 2;
    const centerY = y + height / 2;

    return new Promise((resolve) => {
      this.isTracking = false;
      this.publishState("active", duration);
      this.camera.stopFollow();

      this.scene.tweens.add({
        targets: this.camera,
        zoom: zoom,
        scrollX: centerX - this.camera.width / 2,
        scrollY: centerY - this.camera.height / 2,
        duration: duration,
        ease: Phaser.Math.Easing.Cubic.InOut,
        onComplete: () => resolve(),
      });
    });
  }

  /**
   * Track object with pre-zoom (zoom in before tracking starts)
   * Useful for kickoff - zoom to kicker, then track ball
   * @param trackDuration - Optional duration to keep tracking (waits for animation to complete)
   */
  public async trackObjectWithPreZoom(
    preZoomTarget: { x: number; y: number },
    trackObject: Phaser.GameObjects.GameObject,
    preZoom: number = 2.2,
    trackZoom: number = 2.5,
    preZoomDuration: number = 500,
    trackDuration?: number
  ): Promise<void> {
    if (!this.isFollowEnabled()) return;

    // First, zoom to the pre-zoom target (e.g., kicker)
    await this.panTo(preZoomTarget.x, preZoomTarget.y, preZoomDuration);
    await this.zoomTo(preZoom, preZoomDuration);

    // Brief pause before tracking
    await new Promise((resolve) =>
      this.scene.time.delayedCall(200, () => resolve(null))
    );

    // Then start tracking the object with even more zoom
    this.trackObject(trackObject, trackZoom, 400);

    // If trackDuration specified, wait for the animation to complete
    if (trackDuration) {
      await new Promise((resolve) =>
        this.scene.time.delayedCall(trackDuration, () => resolve(null))
      );
    }
  }

  /**
   * Get current tracking state
   */
  public getIsTracking(): boolean {
    return this.isTracking;
  }

  /**
   * Cleanup
   */
  public destroy(): void {
    if (this.trackingTween) {
      this.trackingTween.stop();
    }
    this.camera.stopFollow();
  }
}
