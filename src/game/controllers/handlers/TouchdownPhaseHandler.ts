import { PhaseHandler } from "./PhaseHandler";
import { GameScene } from "../../../scenes/GameScene";
import { IGameService } from "../../../services/interfaces/IGameService";
import { GameEventMap, IEventBus } from "../../../services/EventBus";
import { GameEventNames } from "../../../types/events";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";

/**
 * TouchdownPhaseHandler
 *
 * Owns touchdown and half-time transitions through the pitch clear and KO
 * recovery, until setup for the next drive begins.
 *
 * Before this handler existed the orchestrator fell through to
 * "No handler for phase: TOUCHDOWN" and the scene had no owner exactly while
 * the pitch was being cleared underneath it.
 *
 * Responsibilities:
 * - Keep the dugouts in step with each KO recovery roll
 * - Let a local coach skip recovery beats after the touchdown hold
 */
export class TouchdownPhaseHandler implements PhaseHandler {
  private removeHandlers: Array<() => void> = [];
  private skipListener: (() => void) | null = null;

  constructor(
    private scene: GameScene,
    _gameService: IGameService,
    private eventBus: IEventBus
  ) {}

  enter(): void {
    console.log("[TouchdownPhaseHandler] Entering Touchdown Phase");
    this.setupListeners();
    this.enableLocalSkip();
  }

  exit(): void {
    this.removeHandlers.forEach((remove) => remove());
    this.removeHandlers = [];
    this.disableLocalSkip();
  }

  private register<K extends keyof GameEventMap>(
    event: K,
    handler: (data: GameEventMap[K]) => void
  ): void {
    this.eventBus.on(event, handler);
    this.removeHandlers.push(() => this.eventBus.off(event, handler));
  }

  private setupListeners(): void {
    // The end-of-drive sequence moves players between the dugout boxes while
    // this handler owns the scene; the play handler that normally does this
    // has already exited.
    this.register(GameEventNames.PlayerStatusChanged, (player) => {
      this.scene["playerSprites"]?.get(player.id)?.updateStatus();
      if (!player.gridPosition) this.scene.refreshDugouts();
    });
  }

  /**
   * Local matches let the coach click through recovery beats after the
   * queued touchdown has finished. Online matches do not: the skip is a UI intent that never crosses
   * the wire, so cutting it locally would desync what the two coaches see.
   */
  private enableLocalSkip(): void {
    if (getActiveOnlineMatch()) return;
    const input = this.scene.input;
    if (!input) return;
    const skip = () =>
      this.eventBus.emit(GameEventNames.UI_SkipDriveSequence, undefined);
    input.on("pointerdown", skip);
    this.skipListener = () => input.off("pointerdown", skip);
  }

  private disableLocalSkip(): void {
    this.skipListener?.();
    this.skipListener = null;
  }
}
