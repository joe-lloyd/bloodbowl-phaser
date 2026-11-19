import { scopeEventBus } from "../../../services/scopedEventBus";
import type { TouchdownScene } from "./scenePorts";
import { type PhaseHandler } from "./PhaseHandler";
import { type IEventBus } from "../../../services/EventBus";
import { GameEventNames } from "../../../types/events";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";

export class TouchdownPhaseHandler implements PhaseHandler {
  private skipListener: (() => void) | null = null;

  private scene: TouchdownScene;
  private eventBus: ReturnType<typeof scopeEventBus>;
  constructor(
    scene: TouchdownScene,
    _gameService: unknown,
    eventBus: IEventBus
  ) {
    this.scene = scene;
    this.eventBus = scopeEventBus(eventBus);
  }

  enter(): void {
    console.log("[TouchdownPhaseHandler] Entering Touchdown Phase");
    this.setupListeners();
    this.enableLocalSkip();
  }

  exit(): void {
    this.eventBus.dispose();
    this.disableLocalSkip();
  }

  private setupListeners(): void {
    this.eventBus.on(GameEventNames.PlayerStatusChanged, (player) => {
      this.scene.playerSprites.get(player.id)?.updateStatus();
      if (!player.gridPosition) this.scene.refreshDugouts();
    });
  }

  private enableLocalSkip(): void {
    const match = getActiveOnlineMatch();
    if (match && match.kind !== "computer") return;
    const input = this.scene.input;
    const skip = () => {
      this.eventBus.emit(GameEventNames.UI_SkipDriveSequence, undefined);
    };
    input.on("pointerdown", skip);
    this.skipListener = () => input.off("pointerdown", skip);
  }

  private disableLocalSkip(): void {
    this.skipListener?.();
    this.skipListener = null;
  }
}
