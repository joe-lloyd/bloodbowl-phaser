import { PhaseHandler } from "./PhaseHandler";
import { GameScene } from "../../../scenes/GameScene";
import { IGameService } from "../../../services/interfaces/IGameService";
import { GameEventMap, IEventBus } from "../../../services/EventBus";
import { GameEventNames } from "../../../types/events";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";

/**
 * TouchdownPhaseHandler
 *
 * Owns the scene for the whole TOUCHDOWN window: the celebration, the pitch
 * clear and the paced KO recovery, right up to the moment setup for the next
 * drive begins (which swaps in the SetupPhaseHandler).
 *
 * Before this handler existed the orchestrator fell through to
 * "No handler for phase: TOUCHDOWN" and the scene had no owner exactly while
 * the pitch was being cleared underneath it.
 *
 * Responsibilities:
 * - Announce the scorer, their team and the updated score (screen + match log)
 * - Keep the dugouts in step with each KO recovery roll
 * - Let a local coach skip the celebration/recovery beats with a click
 */
export class TouchdownPhaseHandler implements PhaseHandler {
  private removeHandlers: Array<() => void> = [];
  private skipListener: (() => void) | null = null;

  constructor(
    private scene: GameScene,
    private gameService: IGameService,
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
    this.register(GameEventNames.Touchdown, (data) => this.announce(data));

    // The end-of-drive sequence moves players between the dugout boxes while
    // this handler owns the scene; the play handler that normally does this
    // has already exited.
    this.register(GameEventNames.PlayerStatusChanged, (player) => {
      this.scene["playerSprites"]?.get(player.id)?.updateStatus();
      if (!player.gridPosition) this.scene.refreshDugouts();
    });
  }

  /** "TOUCHDOWN! <scorer> scores for <team> — 2 : 1", on screen and in the log. */
  private announce(data: GameEventMap[GameEventNames.Touchdown]): void {
    const team = this.gameService.getTeam(data.teamId);
    const scorer = data.scorerId
      ? this.gameService.getPlayerById(data.scorerId)
      : undefined;
    const team1 = this.scene.team1;
    const team2 = this.scene.team2;
    const scores = this.gameService.getState().score;
    const score = `${team1.name} ${scores[team1.id] ?? 0} : ${scores[team2.id] ?? 0} ${team2.name}`;
    const who = scorer
      ? `${scorer.playerName} scores for ${team?.name ?? data.teamId}`
      : `${team?.name ?? data.teamId} scores`;

    const line = `TOUCHDOWN! ${who} — ${score}`;
    this.eventBus.emit(GameEventNames.UI_Notification, line);
    this.eventBus.emit(GameEventNames.UI_GameLog, line);
  }

  /**
   * Local matches let the coach click through the celebration and recovery
   * beats. Online matches do not: the skip is a UI intent that never crosses
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
