import Phaser from "phaser";
import { Team } from "../../types/Team";
import { SetupPhase } from "../../types/SetupTypes";
import { UIText, UIButton } from "../../ui";
import { Pitch } from "../Pitch";

/**
 * SetupUIController - Manages setup UI state and layout
 * Prevents UI overlapping and handles UI updates
 */
export class SetupUIController {
  private scene: Phaser.Scene;
  private pitch: Pitch;

  // UI Elements
  private titleText!: UIText;
  private instructionText!: UIText;
  private confirmButton!: UIButton;
  private defaultButton!: UIButton;
  private saveButton!: UIButton;
  private loadButton!: UIButton;
  private clearButton!: UIButton;

  // Layout constants - Left Sidebar
  private readonly SIDEBAR_X = 180;
  private readonly TITLE_Y = 220;
  private readonly INSTRUCTION_Y = 250;
  private readonly CONFIRM_Y = 280;
  private readonly CONTROLS_Y = 320;
  private readonly DUGOUT_START_Y = 190; // Unused in this controller?

  constructor(scene: Phaser.Scene, pitch: Pitch) {
    this.scene = scene;
    this.pitch = pitch;
  }

  /**
   * Create initial UI elements
   */
  createUI(
    width: number,
    callbacks: {
      onConfirm: () => void;
      onSave: () => void;
      onLoad: () => void;
      onClear: () => void;
      onDefault: () => void;
    }
  ): void {
    // Title - positioned above dugouts
    this.titleText = new UIText(this.scene, {
      x: width / 2,
      y: this.TITLE_Y,
      text: "SETUP PHASE",
      variant: "h4",
      color: "#ffff44",
      fontStyle: "bold",
    });

    // Instructions
    this.instructionText = new UIText(this.scene, {
      x: width / 2,
      y: this.INSTRUCTION_Y,
      text: "Waiting for Coin Flip...",
      variant: "h6",
    });

    // Confirm button (initially hidden)
    this.confirmButton = new UIButton(this.scene, {
      x: this.SIDEBAR_X,
      y: this.CONFIRM_Y,
      text: "CONFIRM SETUP",
      variant: "primary",
      onClick: callbacks.onConfirm,
    });
    this.confirmButton.setVisible(false);

    // Formation Controls (Vertical layout in sidebar)
    const startX = this.SIDEBAR_X;
    const btnHeight = 50;

    this.defaultButton = new UIButton(this.scene, {
      x: startX,
      y: this.CONTROLS_Y,
      text: "Default",
      variant: "secondary",
      fontSize: "16px",
      onClick: callbacks.onDefault
    });

    this.saveButton = new UIButton(this.scene, {
      x: startX,
      y: this.CONTROLS_Y + btnHeight,
      text: "Save",
      variant: "secondary",
      fontSize: "16px",
      onClick: callbacks.onSave
    });

    this.loadButton = new UIButton(this.scene, {
      x: startX,
      y: this.CONTROLS_Y + btnHeight * 2,
      text: "Load",
      variant: "secondary",
      fontSize: "16px",
      onClick: callbacks.onLoad
    });

    this.clearButton = new UIButton(this.scene, {
      x: startX,
      y: this.CONTROLS_Y + btnHeight * 3,
      text: "Clear",
      variant: "danger",
      fontSize: "16px",
      onClick: callbacks.onClear
    });

    // Hide controls initially (until phase starts)
    this.setControlsVisible(false);

    // Set depth for all elements to ensure they are above everything
    this.titleText.setDepth(50);
    this.instructionText.setDepth(50);
    this.confirmButton.setDepth(50);
    this.defaultButton.setDepth(50);
    this.saveButton.setDepth(50);
    this.loadButton.setDepth(50);
    this.clearButton.setDepth(50);
  }

  private setControlsVisible(visible: boolean): void {
    this.defaultButton?.setVisible(visible);
    this.saveButton?.setVisible(visible);
    this.loadButton?.setVisible(visible);
    this.clearButton?.setVisible(visible);
  }

  /**
   * Update UI for current setup phase
   */
  updateForPhase(phase: SetupPhase, team: Team): void {
    this.setControlsVisible(true);
    if (phase === "kicking") {
      this.updateInstructions(
        `${team.name} (KICKING) - Place 7 players in your zone`,
        team.colors.primary === 0xff4444 ? "#ff4444" : "#4444ff"
      );
    } else if (phase === "receiving") {
      this.updateInstructions(
        `${team.name} (RECEIVING) - Place 7 players in your zone`,
        team.colors.primary === 0xff4444 ? "#ff4444" : "#4444ff"
      );
    }
  }

  /**
   * Update instruction text
   */
  updateInstructions(text: string, color?: string): void {
    this.instructionText.setText(text);
    if (color) {
      this.instructionText.setColor(color);
    }
  }

  /**
   * Show or hide confirm button
   */
  showConfirmButton(show: boolean): void {
    this.confirmButton.setVisible(show);
  }

  /**
   * Highlight setup zone on pitch
   */
  highlightSetupZone(isTeam1: boolean): void {
    this.pitch.clearHighlights();
    const color = isTeam1 ? 0x4444ff : 0xff4444;

    // Horizontal orientation: Team 1 left (x: 0-5), Team 2 right (x: 14-19)
    if (isTeam1) {
      for (let x = 0; x <= 5; x++) {
        for (let y = 0; y < 11; y++) {
          this.pitch.highlightSquare(x, y, color);
        }
      }
    } else {
      for (let x = 14; x < 20; x++) {
        for (let y = 0; y < 11; y++) {
          this.pitch.highlightSquare(x, y, color);
        }
      }
    }
  }

  /**
   * Clear all highlights
   */
  clearHighlights(): void {
    this.pitch.clearHighlights();
  }

  /**
   * Get layout constants for positioning other elements
   */
  getLayout() {
    return {
      titleY: this.TITLE_Y,
      instructionY: this.INSTRUCTION_Y,
      confirmY: this.CONFIRM_Y,
      dugoutStartY: this.DUGOUT_START_Y,
      pitchStartY: this.DUGOUT_START_Y + 130, // 120 (dugout) + 10 (gap)
    };
  }

  /**
   * Clean up
   */
  destroy(): void {
    this.titleText?.destroy();
    this.instructionText?.destroy();
    this.confirmButton?.destroy();
    this.defaultButton?.destroy();
    this.saveButton?.destroy();
    this.loadButton?.destroy();
    this.clearButton?.destroy();
  }
}
