import Phaser from "phaser";
import { UITheme, ButtonVariant } from "./UITheme";

/**
 * UIButton - Reusable button component with consistent styling and hover effects
 */

export interface UIButtonConfig {
  x: number;
  y: number;
  text: string;
  variant?: ButtonVariant;
  fontSize?: string;
  onClick?: () => void;
  disabled?: boolean;
  origin?: { x: number; y: number };
}

export class UIButton extends Phaser.GameObjects.Text {
  private variant: ButtonVariant;
  private isDisabled: boolean;
  private clickHandler?: () => void;

  constructor(scene: Phaser.Scene, config: UIButtonConfig) {
    const variant = config.variant || "primary";
    const buttonStyle = UITheme.button[variant];
    const fontSize = config.fontSize || UITheme.typography.fontSize.button;

    super(scene, config.x, config.y, config.text, {
      fontSize: fontSize,
      color: buttonStyle.color,
      backgroundColor: buttonStyle.backgroundColor,
      padding: buttonStyle.padding,
    });

    this.variant = variant;
    this.isDisabled = config.disabled || false;
    this.clickHandler = config.onClick;

    // Set origin
    if (config.origin) {
      this.setOrigin(config.origin.x, config.origin.y);
    } else {
      this.setOrigin(0.5);
    }

    // Add to scene
    scene.add.existing(this);

    // Setup interactivity
    if (!this.isDisabled) {
      this.setupInteractivity();
    } else {
      this.applyDisabledStyle();
    }
  }

  private setupInteractivity(): void {
    this.setInteractive({ useHandCursor: true });

    const buttonStyle = UITheme.button[this.variant];

    this.on("pointerover", () => {
      if (!this.isDisabled) {
        this.setStyle({
          color: buttonStyle.hoverColor,
          backgroundColor: buttonStyle.hoverBackgroundColor,
        });
      }
    });

    this.on("pointerout", () => {
      if (!this.isDisabled) {
        this.setStyle({
          color: buttonStyle.color,
          backgroundColor: buttonStyle.backgroundColor,
        });
      }
    });

    if (this.clickHandler) {
      this.on("pointerdown", () => {
        if (!this.isDisabled && this.clickHandler) {
          this.clickHandler();
        }
      });
    }
  }

  private applyDisabledStyle(): void {
    this.setStyle({
      color: UITheme.colors.textDisabled,
      backgroundColor: UITheme.colors.surface,
    });
  }

  public setDisabled(disabled: boolean): void {
    this.isDisabled = disabled;
    if (disabled) {
      this.disableInteractive();
      this.applyDisabledStyle();
    } else {
      this.setupInteractivity();
    }
  }

  public setClickHandler(handler: () => void): void {
    this.clickHandler = handler;
    if (!this.isDisabled) {
      this.removeAllListeners("pointerdown");
      this.on("pointerdown", () => {
        if (!this.isDisabled && this.clickHandler) {
          this.clickHandler();
        }
      });
    }
  }
}
