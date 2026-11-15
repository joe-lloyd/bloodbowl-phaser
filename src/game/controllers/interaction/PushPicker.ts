import type { IGameService } from "@/services/interfaces/IGameService";
import type { IEventBus } from "@/services/EventBus";
import { GameEventNames } from "@/types/events";
import { HighlightManager } from "../../managers/HighlightManager";

type Square = { x: number; y: number };

/**
 * Choosing the square a Block pushes the defender to. The choice is
 * mandatory: while it is open the board takes no other click and keeps
 * its selection.
 */
export class PushPicker {
  private open = false;
  private validDirections: Square[] = [];
  private defenderId = "";
  private attackerId = "";
  private resultType = "";

  constructor(
    private readonly gameService: IGameService,
    private readonly eventBus: IEventBus,
    private readonly highlightManager: HighlightManager
  ) {}

  /** A push square is being chosen on this board. */
  get active(): boolean {
    return this.open;
  }

  /**
   * Start push direction selection mode
   */
  start(data: {
    validDirections: Square[];
    defenderId: string;
    attackerId?: string;
    resultType?: string;
    pushTier?: "open" | "chain" | "crowd";
  }): void {
    this.open = true;
    this.validDirections = data.validDirections || [];
    this.defenderId = data.defenderId;
    this.attackerId = data.attackerId || ""; // Store attacker ID
    this.resultType = data.resultType || "";

    // Clear any existing highlights first
    this.highlightManager.clearAllHighlights();

    // Yellow = open square, orange = chain push, red = into the crowd
    const tierColors = { open: 0xffff00, chain: 0xff8800, crowd: 0xff0000 };
    const color = tierColors[data.pushTier ?? "open"];
    if (data.pushTier === "crowd") {
      this.eventBus.emit(
        GameEventNames.UI_Notification,
        "Push into the crowd!"
      );
    } else if (data.pushTier === "chain") {
      this.eventBus.emit(GameEventNames.UI_Notification, "Chain push!");
    }

    // Highlight the valid push squares using HighlightManager
    this.validDirections.forEach((dir) => {
      this.highlightManager.addPushHighlight(dir.x, dir.y, color);
    });
  }

  /** Forget the choice without touching the pitch. */
  reset(): void {
    this.open = false;
    this.validDirections = [];
    this.defenderId = "";
    this.attackerId = "";
    this.resultType = "";
  }

  /**
   * Handle click on a push direction square
   */
  click(x: number, y: number): boolean {
    if (!this.open) return false;

    const isValid = this.validDirections.some(
      (dir) => dir.x === x && dir.y === y
    );

    if (isValid) {
      const attackerId = this.attackerId;
      const defenderId = this.defenderId;
      const resultType = this.resultType;

      // Reset BEFORE executing: a chain push emits the next push-direction
      // decision synchronously from inside executePush, and that fresh
      // selection state must not be clobbered afterwards
      this.reset();
      this.highlightManager.clearAllHighlights();

      void this.gameService.executePush(
        attackerId,
        defenderId,
        { x, y },
        resultType,
        false
      );

      return true;
    }
    return false;
  }
}
