import Phaser from "phaser";
import { UITheme, TextVariant } from "./UITheme";

/**
 * UIText - Reusable text/label component with consistent typography
 * @deprecated Use React components instead.
 */

export interface UITextConfig {
  x: number;
  y: number;
  text: string;
  variant?: TextVariant;
  color?: string;
  fontSize?: string;
  fontStyle?: string;
  align?: string;
  origin?: { x: number; y: number };
}

export class UIText extends Phaser.GameObjects.Text {
  constructor(scene: Phaser.Scene, config: UITextConfig) {
    const variant = config.variant || "body";
    const fontSize = config.fontSize || UITheme.typography.fontSize[variant];
    const color = config.color || UITheme.colors.textPrimary;

    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      fontSize: fontSize,
      color: color,
      fontFamily: UITheme.typography.fontFamily,
    };

    if (config.fontStyle) {
      style.fontStyle = config.fontStyle;
    }

    if (config.align) {
      style.align = config.align;
    }

    super(scene, config.x, config.y, config.text, style);

    // Set origin
    if (config.origin) {
      this.setOrigin(config.origin.x, config.origin.y);
    } else {
      this.setOrigin(0.5);
    }

    // Add to scene
    scene.add.existing(this);
  }

  /**
   * Helper method to create a title (h1)
   */
  static createTitle(
    scene: Phaser.Scene,
    x: number,
    y: number,
    text: string,
    color?: string
  ): UIText {
    return new UIText(scene, {
      x,
      y,
      text,
      variant: "h1",
      color,
      fontStyle: "bold",
    });
  }

  /**
   * Helper method to create a subtitle (h2)
   */
  static createSubtitle(
    scene: Phaser.Scene,
    x: number,
    y: number,
    text: string,
    color?: string
  ): UIText {
    return new UIText(scene, {
      x,
      y,
      text,
      variant: "h2",
      color,
    });
  }

  /**
   * Helper method to create a heading (h3)
   */
  static createHeading(
    scene: Phaser.Scene,
    x: number,
    y: number,
    text: string,
    color?: string
  ): UIText {
    return new UIText(scene, {
      x,
      y,
      text,
      variant: "h3",
      color,
      fontStyle: "bold",
    });
  }

  /**
   * Helper method to create a label (small text)
   */
  static createLabel(
    scene: Phaser.Scene,
    x: number,
    y: number,
    text: string,
    color?: string
  ): UIText {
    return new UIText(scene, {
      x,
      y,
      text,
      variant: "small",
      color,
      origin: { x: 0, y: 0 },
    });
  }
}
