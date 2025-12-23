import Phaser from "phaser";

/**
 * CameraController - Manages dynamic camera movements
 * Handles zoom, pan, tracking, and camera effects
 */
export class CameraController {
  private camera: Phaser.Cameras.Scene2D.Camera;
  private scene: Phaser.Scene;
  private defaultZoom: number = 1.0;
  private defaultX: number = 0;
  private defaultY: number = 0;
  private isTracking: boolean = false;
  private trackingTween?: Phaser.Tweens.Tween;
  private pitchBounds?: { x: number; y: number; width: number; height: number };

  constructor(
    scene: Phaser.Scene,
    pitchBounds?: { x: number; y: number; width: number; height: number }
  ) {
    this.scene = scene;
    this.camera = scene.cameras.main;
    this.pitchBounds = pitchBounds;

    // Store default camera position
    this.defaultX = this.camera.scrollX;
    this.defaultY = this.camera.scrollY;
    this.defaultZoom = this.camera.zoom;
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
      const scrollX = x - this.camera.width / 2 / this.camera.zoom;
      const scrollY = y - this.camera.height / 2 / this.camera.zoom;

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
   * Track a game object with the camera
   */
  public trackObject(
    object: Phaser.GameObjects.GameObject,
    zoom: number = 2.0,
    duration: number = 800
  ): void {
    this.isTracking = true;

    // Stop any existing tracking
    if (this.trackingTween) {
      this.trackingTween.stop();
    }

    // Start following the object with faster lerp for responsive tracking
    // Higher lerp values (0.2-0.3) make camera follow more closely
    this.camera.startFollow(object, true, 0.25, 0.25);

    // Zoom in (higher values = more zoomed in)
    this.zoomTo(zoom, duration);
  }

  /**
   * Stop tracking and return to default view
   */
  public reset(duration: number = 800): Promise<void> {
    return new Promise((resolve) => {
      this.isTracking = false;

      // Stop following
      this.camera.stopFollow();

      // Return to default zoom and position
      this.scene.tweens.add({
        targets: this.camera,
        zoom: this.defaultZoom,
        scrollX: this.defaultX,
        scrollY: this.defaultY,
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
    if (!this.pitchBounds) {
      console.warn("Pitch bounds not set, using default zoom");
      return this.reset(duration);
    }

    const { x, y, width, height } = this.pitchBounds;

    // Calculate zoom to fit pitch in view
    const zoomX = this.camera.width / width;
    const zoomY = this.camera.height / height;
    const zoom = Math.min(zoomX, zoomY) * 0.9; // 0.9 for slight padding

    // Center on pitch
    const centerX = x + width / 2;
    const centerY = y + height / 2;

    return new Promise((resolve) => {
      this.isTracking = false;
      this.camera.stopFollow();

      this.scene.tweens.add({
        targets: this.camera,
        zoom: zoom,
        scrollX: centerX - this.camera.width / 2 / zoom,
        scrollY: centerY - this.camera.height / 2 / zoom,
        duration: duration,
        ease: Phaser.Math.Easing.Cubic.InOut,
        onComplete: () => resolve(),
      });
    });
  }

  /**
   * Track object with pre-zoom (zoom in before tracking starts)
   * Useful for kickoff - zoom to kicker, then track ball
   */
  public async trackObjectWithPreZoom(
    preZoomTarget: { x: number; y: number },
    trackObject: Phaser.GameObjects.GameObject,
    preZoom: number = 2.2,
    trackZoom: number = 2.5,
    preZoomDuration: number = 500
  ): Promise<void> {
    // First, zoom to the pre-zoom target (e.g., kicker)
    await this.panTo(preZoomTarget.x, preZoomTarget.y, preZoomDuration);
    await this.zoomTo(preZoom, preZoomDuration);

    // Brief pause before tracking
    await new Promise((resolve) =>
      this.scene.time.delayedCall(200, () => resolve(null))
    );

    // Then start tracking the object with even more zoom
    this.trackObject(trackObject, trackZoom, 400);
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
