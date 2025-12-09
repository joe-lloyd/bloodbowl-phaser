import Phaser from "phaser";
import { UITheme } from "./UITheme";

/**
 * UIOverlay - Reusable modal overlay component for dialogs and popups
 * @deprecated Use React components instead.
 */

export interface UIOverlayConfig {
  width: number;
  height: number;
  backgroundColor?: number;
  opacity?: number;
  blockClicks?: boolean;
}

export class UIOverlay extends Phaser.GameObjects.Container {
  private background: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene, config: UIOverlayConfig) {
    super(scene, 0, 0);

    const backgroundColor =
      config.backgroundColor ?? UITheme.overlay?.backgroundColor ?? 0x000000;
    const opacity = config.opacity ?? UITheme.overlay?.opacity ?? 0.7;

    // Create dark overlay background
    this.background = scene.add.rectangle(
      0,
      0,
      config.width,
      config.height,
      backgroundColor,
      opacity
    );
    this.background.setOrigin(0);

    // Block clicks if specified
    if (config.blockClicks !== false) {
      this.background.setInteractive();
    }

    this.add(this.background);

    // Add to scene
    scene.add.existing(this);
  }

  /**
   * Add a child element to the overlay (will be centered by default)
   */
  public addElement(element: Phaser.GameObjects.GameObject): this {
    this.add(element);
    return this;
  }

  /**
   * Show the overlay
   */
  public show(): this {
    this.setVisible(true);
    return this;
  }

  /**
   * Hide the overlay
   */
  public hide(): this {
    this.setVisible(false);
    return this;
  }
}
