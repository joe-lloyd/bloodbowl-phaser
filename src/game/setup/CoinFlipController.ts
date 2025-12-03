import Phaser from "phaser";
import { Team } from "../../types/Team";
import { UIText, UIButton, UIOverlay } from "../../ui";

/**
 * CoinFlipController - Handles coin flip UI and logic
 * Emits events when coin flip is complete
 */
export class CoinFlipController extends Phaser.Events.EventEmitter {
  private scene: Phaser.Scene;
  private overlay!: UIOverlay;
  private winner!: Team;

  constructor(scene: Phaser.Scene) {
    super();
    this.scene = scene;
  }

  /**
   * Show coin flip overlay and start the process
   */
  show(team1: Team, team2: Team): void {
    const width = this.scene.cameras.main.width;
    const height = this.scene.cameras.main.height;

    // Create overlay
    this.overlay = new UIOverlay(this.scene, { width, height });

    // Title
    const title = new UIText(this.scene, {
      x: width / 2,
      y: height / 2 - 100,
      text: "COIN FLIP",
      variant: "h1",
      color: "#ffff44",
      fontStyle: "bold",
    });
    this.overlay.addElement(title);

    // Flip Button
    const flipButton = new UIButton(this.scene, {
      x: width / 2,
      y: height / 2,
      text: "FLIP COIN",
      variant: "large",
      onClick: () => {
        flipButton.destroy();
        this.performFlip(team1, team2, width, height);
      },
    });
    this.overlay.addElement(flipButton);
  }

  /**
   * Perform the coin flip animation
   */
  private performFlip(
    team1: Team,
    team2: Team,
    width: number,
    height: number
  ): void {
    const coin = this.scene.add
      .text(width / 2, height / 2, "🪙", { fontSize: "64px" })
      .setOrigin(0.5);
    this.overlay.addElement(coin);

    this.scene.tweens.add({
      targets: coin,
      angle: 720,
      duration: 1000,
      ease: "Cubic.easeOut",
      onComplete: () => {
        const team1Wins = Math.random() < 0.5;
        this.winner = team1Wins ? team1 : team2;
        const loser = team1Wins ? team2 : team1;

        coin.destroy();
        this.showResult(this.winner, loser, width, height);
      },
    });
  }

  /**
   * Show coin flip result and let winner choose
   */
  private showResult(
    winner: Team,
    loser: Team,
    width: number,
    height: number
  ): void {
    const resultText = new UIText(this.scene, {
      x: width / 2,
      y: height / 2 - 50,
      text: `${winner.name} wins the toss!`,
      variant: "h3",
      fontStyle: "bold",
    });
    this.overlay.addElement(resultText);

    // Kick button
    const kickButton = new UIButton(this.scene, {
      x: width / 2 - 100,
      y: height / 2 + 50,
      text: "KICK",
      variant: "secondary",
      fontSize: "24px",
      onClick: () => {
        this.handleSelection(winner, loser, "kick");
      },
    });

    // Receive button
    const receiveButton = new UIButton(this.scene, {
      x: width / 2 + 100,
      y: height / 2 + 50,
      text: "RECEIVE",
      variant: "danger",
      fontSize: "24px",
      onClick: () => {
        this.handleSelection(loser, winner, "receive");
      },
    });

    this.overlay.addElement(kickButton);
    this.overlay.addElement(receiveButton);
  }

  /**
   * Handle team selection (kick or receive)
   */
  private handleSelection(
    kickingTeam: Team,
    receivingTeam: Team,
    _choice: string
  ): void {
    // Emit event with results
    this.emit("coinFlipComplete", {
      kickingTeam,
      receivingTeam,
    });

    // Destroy overlay
    this.destroy();
  }

  /**
   * Clean up
   */
  destroy(): void {
    if (this.overlay) {
      this.overlay.destroy();
    }
    this.removeAllListeners();
  }
}
