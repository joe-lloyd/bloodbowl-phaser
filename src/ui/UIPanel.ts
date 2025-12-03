import Phaser from "phaser";
import { UITheme } from "./UITheme";

/**
 * UIPanel - Reusable panel/container component for grouping UI elements
 */

export interface UIPanelConfig {
  x: number;
  y: number;
  width: number;
  height: number;
  backgroundColor?: number;
  borderColor?: number;
  opacity?: number;
  origin?: { x: number; y: number };
}

export class UIPanel extends Phaser.GameObjects.Container {
  private background: Phaser.GameObjects.Rectangle;
  private border?: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene, config: UIPanelConfig) {
    super(scene, config.x, config.y);

    const backgroundColor =
      config.backgroundColor ?? UITheme.panel.backgroundColor;
    const opacity = config.opacity ?? UITheme.panel.opacity;

    // Create background
    this.background = scene.add.rectangle(
      0,
      0,
      config.width,
      config.height,
      backgroundColor,
      opacity
    );
    this.background.setOrigin(0);
    this.add(this.background);

    // Create border if specified
    if (config.borderColor !== undefined) {
      this.border = scene.add.rectangle(
        0,
        0,
        config.width,
        config.height,
        config.borderColor,
        0.5
      );
      this.border.setOrigin(0);
      this.border.setStrokeStyle(1, config.borderColor);
      this.add(this.border);
    }

    // Set origin (note: Container doesn't have setOrigin, handle positioning externally)
    // if (config.origin) {
    //   this.setOrigin(config.origin.x, config.origin.y);
    // }

    // Add to scene
    scene.add.existing(this);
  }

  /**
   * Add a child element to the panel
   */
  public addElement(element: Phaser.GameObjects.GameObject): this {
    this.add(element);
    return this;
  }

  /**
   * Set the background color
   */
  public setBackgroundColor(color: number, alpha?: number): this {
    this.background.setFillStyle(color, alpha);
    return this;
  }
}
