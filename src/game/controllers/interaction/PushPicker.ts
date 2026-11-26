import type { IGameService } from "@/services/interfaces/IGameService";
import type { IEventBus } from "@/services/EventBus";
import { GameEventNames } from "@/types/events";
import type { HighlightManager } from "../../managers/HighlightManager";

interface Square {
  x: number;
  y: number;
}

export class PushPicker {
  private open = false;
  private validDirections: Square[] = [];
  private defenderId = "";
  private attackerId = "";
  private resultType = "";

  private readonly gameService: IGameService;
  private readonly eventBus: IEventBus;
  private readonly highlightManager: HighlightManager;
  constructor(
    gameService: IGameService,
    eventBus: IEventBus,
    highlightManager: HighlightManager
  ) {
    this.gameService = gameService;
    this.eventBus = eventBus;
    this.highlightManager = highlightManager;
  }

  get active(): boolean {
    return this.open;
  }

  start(data: {
    validDirections: Square[];
    defenderId: string;
    attackerId?: string;
    resultType?: string;
    pushTier?: "open" | "chain" | "crowd";
  }): void {
    this.open = true;
    this.validDirections = data.validDirections;
    this.defenderId = data.defenderId;
    this.attackerId = data.attackerId ?? "";
    this.resultType = data.resultType ?? "";

    this.highlightManager.clearAllHighlights();

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

    for (const dir of this.validDirections) {
      this.highlightManager.addPushHighlight(dir.x, dir.y, color);
    }
  }

  reset(): void {
    this.open = false;
    this.validDirections = [];
    this.defenderId = "";
    this.attackerId = "";
    this.resultType = "";
  }

  click(x: number, y: number): boolean {
    if (!this.open) return false;

    const isValid = this.validDirections.some(
      (dir) => dir.x === x && dir.y === y
    );

    if (isValid) {
      const attackerId = this.attackerId;
      const defenderId = this.defenderId;
      const resultType = this.resultType;

      this.reset();
      this.highlightManager.clearAllHighlights();

      void this.gameService.executePush({ attackerId: attackerId, defenderId: defenderId, direction: { x, y }, resultType: resultType, followUp: false }
      );

      return true;
    }
    return false;
  }
}
