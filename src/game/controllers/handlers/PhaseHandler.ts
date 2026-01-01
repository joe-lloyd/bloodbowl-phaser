import { IEventBus } from "../../../services/EventBus";
import { GameScene } from "../../../scenes/GameScene";
import { IGameService } from "../../../services/interfaces/IGameService";

/**
 * PhaseHandler - Interface for Phase-Specific Logic
 *
 * Responsibility:
 * - Handle UI events specific to a Game Phase (e.g. "SetupAction" vs "PassAttempt").
 * - Connect the View (Via EventBus) to the Model (GameService).
 * - DOES NOT: Manage global phase transitions (Orchestrator does that).
 */
export interface PhaseHandler {
  /**
   * Called when entering the phase
   */
  enter(): void;

  /**
   * Called when exiting the phase (cleanup listeners)
   */
  exit(): void;
}
