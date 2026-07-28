import Phaser from "phaser";
import { Player, PlayerCondition, hasCondition } from "../../types/Player";

/**
 * PlayerSprite - Visual representation of a player on the pitch
 */
export class PlayerSprite extends Phaser.GameObjects.Container {
  private player: Player;

  private numberText: Phaser.GameObjects.Text;
  private teamTurnBorder!: Phaser.GameObjects.Rectangle;
  private teamTurnBorderVisible: boolean = false;
  private rosterName: string;
  private selectionRing!: Phaser.GameObjects.Arc; // Dedicated selection indicator
  /**
   * Online only: shows which single player the OTHER coach currently has
   * selected. Deliberately a separate object from `selectionRing` (which is
   * reused with a variable color for the LOCAL coach's own click-to-select/
   * inspect/kickoff-eligible highlighting) so the two can never clobber or
   * be confused with each other.
   */
  private remoteSelectionRing!: Phaser.GameObjects.Arc;
  /** Badge shown while this player is the ball carrier (see setCarryingBall) */
  private carrierMarker!: Phaser.GameObjects.Container;
  /** Marker shown while Distracted — a condition, not a status: the player
   *  is still Standing, so this must read as distinct from Prone/Stunned. */
  private distractedMarker!: Phaser.GameObjects.Container;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    player: Player,
    teamColor: number,
    rosterName: string
  ) {
    super(scene, x, y);

    this.player = player;
    this.rosterName = rosterName;

    // Create player shape based on position
    this.createPlayerShape(scene, player.positionName, teamColor);

    // Create player number
    this.numberText = scene.add.text(0, 0, player.number.toString(), {
      fontSize: "14px",
      color: "#ffffff",
      fontStyle: "bold",
    });
    this.numberText.setOrigin(0.5);
    this.add(this.numberText);

    this.setSize(32, 32);
    this.setSize(32, 32);
    // Players are NOT interactive directly; we rely on grid clicks.
    // this.setInteractive(...) REMOVED
    this.setDepth(10); // Ensure players are above dugouts

    // Create Selection Ring (Hidden by default)
    // Slightly larger than player; double-thick so selection reads over the
    // team-turn square borders
    this.selectionRing = scene.add.circle(0, 0, 20);
    this.selectionRing.setStrokeStyle(6, 0xffff00);
    this.selectionRing.setVisible(false);
    this.add(this.selectionRing);

    // Remote-selection ring (red): the other coach's live selection, online
    // only. Slightly larger radius than selectionRing so both can be seen
    // at once without fully overlapping if they ever land on the same player.
    this.remoteSelectionRing = scene.add.circle(0, 0, 24);
    this.remoteSelectionRing.setStrokeStyle(4, 0xff3b30);
    this.remoteSelectionRing.setVisible(false);
    this.add(this.remoteSelectionRing);

    // Square border shown for every player of the active team; color keyed
    // to status (white standing, yellow prone, orange stunned)
    this.teamTurnBorder = scene.add.rectangle(0, 0, 56, 56);
    this.teamTurnBorder.setStrokeStyle(3, 0xffffff);
    this.teamTurnBorder.setVisible(false);
    this.add(this.teamTurnBorder);

    // Carrier badge: an unambiguous "this player has the ball" marker that is
    // derived from possession state, never from where a sprite happens to be.
    this.carrierMarker = scene.add.container(16, -16);
    const badge = scene.add.circle(0, 0, 9, 0x8b4513);
    badge.setStrokeStyle(2, 0xffffff);
    const lace = scene.add.graphics();
    lace.lineStyle(1.5, 0xffffff);
    lace.lineBetween(-5, 0, 5, 0);
    this.carrierMarker.add([badge, lace]);
    this.carrierMarker.setVisible(false);
    this.add(this.carrierMarker);

    // Distracted badge: a small purple swirl above the head — distinct from
    // the white/yellow/orange status border, since Distracted is a condition
    // a Standing player carries, not a status change.
    this.distractedMarker = scene.add.container(-16, -16);
    const swirl = scene.add.circle(0, 0, 8, 0x9b59b6);
    swirl.setStrokeStyle(2, 0xffffff);
    const dizzy = scene.add.graphics();
    dizzy.lineStyle(1.5, 0xffffff);
    dizzy.strokeCircle(-2, -1, 2.5);
    dizzy.strokeCircle(3, 1, 2);
    this.distractedMarker.add([swirl, dizzy]);
    this.distractedMarker.setVisible(false);
    this.add(this.distractedMarker);

    // CRITICAL: Initialize status visuals
    this.updateStatus();

    scene.add.existing(this);
  }

  private createPlayerShape(
    scene: Phaser.Scene,
    position: string,
    color: number
  ): void {
    const pos = position.toLowerCase();

    // 1. Try Dynamic Asset Lookup
    // Key: asset_[roster]_[position]
    // Normalize: lowercase, spaces -> dashes
    const rosterKey = this.rosterName.toLowerCase().replace(/\s+/g, "-");
    const posKey = pos.replace(/\s+/g, "-");
    const assetKey = `asset_${rosterKey}_${posKey}`;

    let texture = assetKey;
    if (!scene.textures.exists(texture)) {
      // Try plural folder name? (black-orc -> black-orcs)
      // This is a naive check but covers common cases like "Black Orc" -> "black-orcs"
      const pluralKey = `asset_${rosterKey}s_${posKey}`;
      if (scene.textures.exists(pluralKey)) {
        texture = pluralKey;
      }
    }

    if (scene.textures.exists(texture)) {
      // Render Sprite ONLY (No base shape)
      const sprite = scene.add.sprite(0, -5, texture);

      const maxHeight = 40; // Max height for sprite
      const scale = maxHeight / sprite.height;
      sprite.setScale(Math.min(scale, 1));

      this.add(sprite);
      this.shape = sprite;

      // Ensure number is on top
      this.bringToTop(this.numberText);
      return;
    }

    // 2. Fallback: Shape Logic
    // Lineman: Circle
    // Blitzer: Square
    // Thrower: Triangle
    // Catcher: Diamond (Rotated Square)
    // Big Guy (Troll, Ogre, etc): Hexagon (Large Circle/Polygon)

    if (pos.includes("blitzer")) {
      // Square
      const rect = scene.add.rectangle(0, 0, 28, 28, color);
      rect.setStrokeStyle(2, 0xffffff);
      this.add(rect);
      this.shape = rect;
    } else if (pos.includes("thrower")) {
      // Triangle
      const triangle = scene.add.triangle(0, 0, 0, -14, 14, 14, -14, 14, color);
      triangle.setStrokeStyle(2, 0xffffff);
      triangle.setOrigin(0);
      this.add(triangle);
      this.shape = triangle;
    } else if (pos.includes("catcher") || pos.includes("runner")) {
      // Diamond
      const rect = scene.add.rectangle(0, 0, 24, 24, color);
      rect.setStrokeStyle(2, 0xffffff);
      rect.setAngle(45);
      this.add(rect);
      this.shape = rect;
    } else if (
      pos.includes("troll") ||
      pos.includes("ogre") ||
      pos.includes("treeman")
    ) {
      // Big Guy - Hexagon (approximated by large circle for now, or polygon)
      const hex = scene.add.polygon(
        0,
        0,
        [-10, -16, 10, -16, 16, 0, 10, 16, -10, 16, -16, 0],
        color
      );
      hex.setStrokeStyle(2, 0xffffff);
      hex.setOrigin(0);
      this.add(hex);
      this.shape = hex;
    } else {
      // Default (Lineman) - Circle
      const circle = scene.add.circle(0, 0, 16, color);
      circle.setStrokeStyle(2, 0xffffff);
      this.add(circle);
      this.shape = circle;
    }
  }

  // Helper to access the shape for effects
  private shape!:
    | Phaser.GameObjects.Shape
    | Phaser.GameObjects.Arc
    | Phaser.GameObjects.Sprite; // Arc is for Circle

  /**
   * Update player status visual (prone, stunned, etc.)
   */
  public updateStatus(): void {
    switch (this.player.status) {
      case "Prone":
        this.shape.setAlpha(0.6);
        this.setAngle(90); // Lay down
        break;
      case "Stunned":
        this.shape.setAlpha(0.4);
        this.setAngle(90);
        break;
      case "KO":
      case "Injured":
      case "Dead":
        this.setVisible(false);
        break;
      default:
        this.shape.setAlpha(1.0);
        this.setAngle(0);
        this.setVisible(true);
    }
    this.refreshTeamTurnBorder();
    this.refreshDistractedMarker();
  }

  /**
   * Distracted only ever matters for a Standing player (hasTackleZone already
   * folds status in), but the marker just follows the condition directly —
   * it clears itself the moment the condition does, on the next status sync.
   */
  private refreshDistractedMarker(): void {
    if (!this.distractedMarker) return;
    this.distractedMarker.setVisible(
      hasCondition(this.player, PlayerCondition.DISTRACTED)
    );
  }

  /**
   * Reset the sprite's laid-down rotation to upright. Used by the end-of-drive
   * teardown: a player left Prone (rendered rotated 90°) returns to the dugout
   * for the next drive, so its sprite must not carry the rotation into the
   * fresh drive when it is re-placed on the pitch.
   */
  public resetOrientation(): void {
    this.setAngle(0);
    this.refreshTeamTurnBorder();
  }

  /**
   * Show/hide the active-team square border. Color reflects status:
   * standing = white, prone (down) = yellow, stunned = orange. Opacity
   * (setActivated) continues to show who has already gone.
   */
  public setTeamTurnBorder(visible: boolean): void {
    this.teamTurnBorderVisible = visible;
    this.refreshTeamTurnBorder();
  }

  private refreshTeamTurnBorder(): void {
    if (!this.teamTurnBorder) return;

    // Standing players get a deliberately subtle marker; status colors pop
    if (this.player.status === "Stunned") {
      this.teamTurnBorder.setStrokeStyle(3, 0xffa500, 0.9); // orange
    } else if (this.player.status === "Prone") {
      this.teamTurnBorder.setStrokeStyle(3, 0xffff00, 0.9); // yellow
    } else {
      this.teamTurnBorder.setStrokeStyle(2, 0xffffff, 0.35); // standing
    }
    // Border rotates with the container when a player is laid down; counter
    // the container angle so the square stays axis-aligned on the grid
    this.teamTurnBorder.setAngle(-this.angle);
    // Down-state borders are status information, not turn information. Keep
    // them visible even during kickoff (when no normal team turn border is
    // active) so Pitch Invasion immediately reads as prone/stunned.
    this.teamTurnBorder.setVisible(
      this.teamTurnBorderVisible ||
        this.player.status === "Prone" ||
        this.player.status === "Stunned"
    );
  }

  /**
   * Set activated visual state (greyscale/dimmed)
   */
  public setActivated(activated: boolean): void {
    if (activated) {
      this.shape.setAlpha(0.5); // Dim the player
    } else {
      // Restore the alpha/rotation dictated by the canonical player status;
      // a stunned model must not be made visually Standing by a turn reset.
      this.updateStatus();
    }
  }

  /**
   * Show/hide the ball-carrier badge. Idempotent: driven purely by the
   * resolved ball representation, so repeated reconciliation cannot leave two
   * players marked as carrying.
   */
  public setCarryingBall(carrying: boolean): void {
    this.carrierMarker.setVisible(carrying);
  }

  /**
   * Highlight this player
   */
  public highlight(color: number): void {
    if (this.selectionRing) {
      this.selectionRing.setStrokeStyle(3, color);
      this.selectionRing.setVisible(true);
    }
  }

  /**
   * Remove highlight
   */
  public unhighlight(): void {
    if (this.selectionRing) {
      this.selectionRing.setVisible(false);
    }
  }

  /**
   * Show/hide the remote-selection ring: whether the OTHER coach currently
   * has this player selected. Independent of local highlight/selection.
   */
  public setRemoteSelected(active: boolean): void {
    if (this.remoteSelectionRing) {
      this.remoteSelectionRing.setVisible(active);
    }
  }

  /**
   * Get the player data
   */
  public getPlayer(): Player {
    return this.player;
  }

  /**
   * Animate movement along a path
   */
  public async animateMovement(
    path: { x: number; y: number }[]
  ): Promise<void> {
    if (path.length === 0) return;

    // Remove unused import if not already removed in previous step (I will remove it in a separate block if strictly needed, but I can do it here if I replace the top too. I'll stick to the method for now).

    return new Promise((resolve) => {
      // 1. Start "Jogging" Bob (Tweening the internal shape up/down)
      const bobTween = this.scene.tweens.add({
        targets: this.shape,
        y: "-=4", // Bob up slightly
        duration: 90, // Fast bob
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });

      // slightly tilt forward for "running" pose
      this.shape.setAngle(5);

      // Map path steps to tween configurations
      const tweenConfigs = path.map((step) => {
        return {
          x: step.x,
          y: step.y,
          duration: 180, // Much faster (was 300)
          ease: "Linear", // Linear path, but bob adds the organic feel
        };
      });

      // Use modern Phaser 3 chain
      this.scene.tweens.chain({
        targets: this,
        tweens: tweenConfigs,
        onComplete: () => {
          // Stop Bobbing
          bobTween.stop();

          // Reset Pose
          this.scene.tweens.add({
            targets: this.shape,
            y: 0,
            angle: 0,
            duration: 150,
          });

          resolve();
        },
      });
    });
  }

  /**
   * Throw arc — used when a player is thrown (Throw Team-mate). The container
   * slides to the destination while the inner shape rises and grows (height),
   * spins, then squashes on landing, so it reads as a projectile rather than a
   * jog. `path` is in pixel coordinates (like animateMovement).
   */
  public async animateThrow(
    path: { x: number; y: number }[]
  ): Promise<void> {
    if (path.length === 0) return;
    const dest = path[path.length - 1];
    const duration = 550;

    return new Promise((resolve) => {
      // Rise then fall (fake height) and grow then shrink (fake distance).
      this.scene.tweens.add({
        targets: this.shape,
        y: -36,
        scale: 1.5,
        duration: duration / 2,
        ease: "Sine.easeOut",
        yoyo: true,
      });
      // Spin through the air.
      this.scene.tweens.add({
        targets: this.shape,
        angle: 360,
        duration,
        ease: "Linear",
      });
      // Carry the whole sprite to the landing square.
      this.scene.tweens.add({
        targets: this,
        x: dest.x,
        y: dest.y,
        duration,
        ease: "Sine.easeInOut",
        onComplete: () => {
          this.shape.setAngle(0);
          this.shape.setScale(1);
          this.shape.y = 0;
          // Landing squash.
          this.scene.tweens.add({
            targets: this.shape,
            scaleY: 0.7,
            scaleX: 1.2,
            duration: 90,
            yoyo: true,
            onComplete: () => resolve(),
          });
        },
      });
    });
  }

  /**
   * Throw gesture — the thrower tips forward a little toward the target, as if
   * launching a team-mate, then rocks back upright. `dir` is +1 to the right,
   * -1 to the left. Fire-and-forget (the throw resolves on its own timer).
   */
  public animateThrowGesture(dir = 1): void {
    this.scene.tweens.chain({
      targets: this.shape,
      tweens: [
        { angle: dir * 22, duration: 130, ease: "Sine.easeOut" }, // lean into it
        { angle: 0, duration: 220, ease: "Sine.easeInOut" }, // rock back upright
      ],
    });
  }

  /**
   * Kick gesture — a quick wind-up then a swing so the sprite's lower body
   * kicks out toward the target, then settles upright. `dir` is +1 right, -1
   * left. Sharper and larger than the throw lean so it reads as a kick.
   */
  public animateKickGesture(dir = 1): void {
    this.scene.tweens.chain({
      targets: this.shape,
      tweens: [
        { angle: -dir * 8, duration: 90, ease: "Sine.easeOut" }, // wind up
        { angle: dir * 26, duration: 110, ease: "Back.easeOut" }, // kick
        { angle: 0, duration: 200, ease: "Sine.easeInOut" }, // settle
      ],
    });
  }

  /**
   * Play celebration animation (jumping up and down)
   * Returns a Promise that resolves when the animation is complete.
   */
  public playCelebrateAnimation(): Promise<void> {
    return new Promise((resolve) => {
      // Add random delay for "chaos"
      const startDelay = Math.random() * 500;
      const duration = 100 + Math.random() * 50; // Randomize speed slightly

      this.scene.time.delayedCall(startDelay, () => {
        this.scene.tweens.add({
          targets: this.shape,
          y: "-=10", // Jump higher than jog
          duration: duration,
          yoyo: true,
          repeat: 3, // Jump 3 times
          ease: "Sine.easeInOut",
          onComplete: () => {
            // Ensure reset
            this.shape.y = 0;
            resolve();
          },
        });
      });
    });
  }
}
