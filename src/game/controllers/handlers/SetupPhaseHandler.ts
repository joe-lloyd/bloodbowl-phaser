import { PhaseHandler } from "./PhaseHandler";
import { GameScene } from "../../../scenes/GameScene";
import { IGameService } from "../../../services/interfaces/IGameService";
import { IEventBus } from "../../../services/EventBus";
import { GameEventNames, GameEvents } from "../../../types/events";
import { SubPhase } from "../../../types/GameState";
import { PlayerPlacementController } from "../PlayerPlacementController";
import { FormationManager } from "@/game/managers/FormationManager";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";

/**
 * SetupPhaseHandler
 *
 * Handles events for the Setup Phase:
 * - Coin Flip
 * - Player Placement (Delegated to Scene placement controller)
 * - Setup Actions (Confirm, Clear, Load)
 */
export class SetupPhaseHandler implements PhaseHandler {
  private handlers: Map<string, (data: any) => void> = new Map();
  private isIntroSequence = false;

  constructor(
    private scene: GameScene,
    private gameService: IGameService,
    private eventBus: IEventBus
  ) {}

  enter(): void {
    console.log("[SetupPhaseHandler] Entering Setup Phase");
    this.setupListeners();

    // Check SubPhase to trigger correct startup events
    const subPhase = this.gameService.getSubPhase();
    console.log(`[SetupPhaseHandler] Current SubPhase: ${subPhase}`);

    // Online: the opening (intro/weather/coin flip) is a shared,
    // host-authoritative sequence handled outside the engine (OnlineCoinFlip
    // over the lobby doc). Neither side runs the local intro or the in-HUD
    // coin flip — the host applies the toss result via UI_CoinFlipComplete.
    const match = getActiveOnlineMatch();
    const isOnline = !!match;

    if (subPhase === SubPhase.INTRO) {
      if (!isOnline) this.runIntroSequence();
    } else if (subPhase === SubPhase.WEATHER) {
      // Weather handled by intro or direct state
    } else if (subPhase === SubPhase.COIN_FLIP) {
      // Only show if NOT mid-intro and NOT online (online toss is external).
      if (!this.isIntroSequence && !isOnline) {
        this.eventBus.emit(GameEventNames.UI_StartCoinFlip, {
          team1: this.scene.team1,
          team2: this.scene.team2,
        });
      }
    } else if (
      subPhase === SubPhase.SETUP_KICKING ||
      subPhase === SubPhase.SETUP_RECEIVING
    ) {
      // Legacy "Start Placement" logic
      const state = this.gameService.getState();
      if (state.activeTeamId) {
        const activeTeam =
          state.activeTeamId === this.scene.team1.id
            ? this.scene.team1
            : this.scene.team2;
        const isTeam1 = activeTeam.id === this.scene.team1.id;
        // Online: only the active team's coach places; the other watches the
        // board update read-only (UI_SyncBoard), no controls or drag.
        const isMySetup = !match || activeTeam.id === match.myTeamId;
        if (isMySetup) {
          this.eventBus.emit(GameEventNames.UI_ShowSetupControls, {
            subPhase,
            activeTeam,
            status: this.gameService.getSetupStatus(activeTeam.id),
          });
          this.scene.highlightSetupZone(isTeam1);
          this.scene.enablePlacement(activeTeam, isTeam1);
        } else {
          this.eventBus.emit(GameEventNames.UI_HideSetupControls);
          this.scene.disableSetupInteraction();
          this.eventBus.emit(GameEventNames.UI_SyncBoard);
        }
      }
    }
  }

  exit(): void {
    console.log("[SetupPhaseHandler] Exiting Setup Phase");
    this.removeListeners();
  }

  private setupListeners(): void {
    // Coin Flip
    this.register(
      GameEventNames.UI_CoinFlipComplete as keyof GameEvents,
      (data) => {
        this.scene.kickingTeam = data.kickingTeam;
        this.scene.receivingTeam = data.receivingTeam;
        // Online skips the local intro (which rolls weather), so the host
        // rolls it once here — the result rides the snapshot to the guest.
        // Only the host emits UI_CoinFlipComplete, so this runs host-side only.
        if (getActiveOnlineMatch()) {
          this.gameService.rollInitialWeather();
        }
        this.gameService.startSetup(data.kickingTeam.id);
      }
    );

    // Setup Actions
    this.register(GameEventNames.UI_SetupAction as keyof GameEvents, (data) =>
      this.handleSetupAction(data)
    );
  }

  private register(event: string, handler: (data: any) => void): void {
    this.handlers.set(event, handler);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.eventBus.on(event as any, handler);
  }

  private removeListeners(): void {
    this.handlers.forEach((handler, event) => {
      this.eventBus.off(event, handler);
    });
    this.handlers.clear();
  }

  private handleSetupAction(data: { action: string; name?: string }): void {
    const state = this.gameService.getState();
    const activeTeamId = state.activeTeamId || this.scene.team1.id;
    const activeTeam =
      activeTeamId === this.scene.team1.id
        ? this.scene.team1
        : this.scene.team2;
    const isTeam1 = activeTeam.id === this.scene.team1.id;
    const formationManager: FormationManager = this.scene["formationManager"];
    const placementController: PlayerPlacementController =
      this.scene["placementController"];
    const key = this.formationKey(activeTeam, isTeam1);

    switch (data.action) {
      case "confirm":
        this.gameService.confirmSetup(activeTeam.id);
        break;
      case "continue":
        this.gameService.resolveSetupConcession(activeTeam.id, false);
        break;
      case "concede":
        this.gameService.resolveSetupConcession(activeTeam.id, true);
        break;
      case "clear":
        placementController?.clearPlacements();
        this.scene.refreshDugouts();
        break;
      case "list":
        this.emitFormationList(key, isTeam1);
        break;
      case "save": {
        const name = data.name?.trim();
        if (!name) {
          this.eventBus.emit(
            GameEventNames.UI_Notification,
            "Give the formation a name first."
          );
          break;
        }
        if (formationManager.isBuiltIn(name)) {
          this.eventBus.emit(
            GameEventNames.UI_Notification,
            `"${name}" is a built-in formation — pick another name.`
          );
          break;
        }
        // Read positions straight off the team so anything on the pitch is
        // captured, stored by roster index so the layout survives new team
        // instances (next drive, next match)
        const positions = activeTeam.players.flatMap((player, index) =>
          player.gridPosition
            ? [
                {
                  playerId: String(index),
                  x: player.gridPosition.x,
                  y: player.gridPosition.y,
                },
              ]
            : []
        );
        if (positions.length === 0) {
          this.eventBus.emit(
            GameEventNames.UI_Notification,
            "Place some players before saving a formation."
          );
          break;
        }
        formationManager.saveFormation(key, positions, name);
        this.emitFormationList(key, isTeam1);
        this.eventBus.emit(
          GameEventNames.UI_Notification,
          `Formation "${name}" saved!`
        );
        break;
      }
      case "default": // legacy alias for the first built-in preset
      case "load": {
        const name = data.name ?? "Balanced";
        const positions = formationManager.getFormation(key, name, isTeam1);
        if (!positions || positions.length === 0) {
          this.eventBus.emit(
            GameEventNames.UI_Notification,
            `No formation named "${name}" for this team.`
          );
          break;
        }
        const result = this.gameService.applySetupFormation(
          activeTeam.id,
          positions
        );
        placementController?.syncFromTeam();
        this.scene.refreshDugouts();
        const outstanding = result.status.restrictions.filter(
          (restriction) => !restriction.satisfied
        );
        const detail =
          result.skipped.length > 0 || outstanding.length > 0
            ? ` ${[
                ...result.skipped.map((entry) => entry.reason),
                ...outstanding.map((restriction) =>
                  restriction.satisfiable
                    ? restriction.message
                    : `Relaxed: ${restriction.message}`
                ),
              ].join(" ")}`
            : "";
        this.eventBus.emit(
          GameEventNames.UI_Notification,
          `Formation "${name}" loaded.${detail}`
        );
        break;
      }
      case "delete": {
        const name = data.name;
        if (!name || formationManager.isBuiltIn(name)) break;
        if (formationManager.deleteFormation(key, name)) {
          this.emitFormationList(key, isTeam1);
          this.eventBus.emit(
            GameEventNames.UI_Notification,
            `Formation "${name}" deleted.`
          );
        }
        break;
      }
    }
  }

  private emitFormationList(key: string, isTeam1: boolean): void {
    const formationManager: FormationManager = this.scene["formationManager"];
    this.eventBus.emit(GameEventNames.UI_FormationsUpdated, {
      formations: formationManager.listAllFormations(key, isTeam1),
    });
  }

  /** Formations are keyed by roster and pitch side, not by the (per-match)
   * team id, so saved layouts survive across games. */
  private formationKey(
    team: { rosterName?: string; name: string },
    isTeam1: boolean
  ): string {
    return `${team.rosterName ?? team.name}:${isTeam1 ? "left" : "right"}`;
  }

  private async runIntroSequence(): Promise<void> {
    this.isIntroSequence = true;
    const delay = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));

    // 0. Initial Delay
    await delay(500);

    // 1. Team 1 Intro
    this.eventBus.emit(
      GameEventNames.UI_Notification,
      `${this.scene.team1.name}` // Team 1 Name
    );

    // Find Team 1 Dugout and animate
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dugout1 = (this.scene as any).dugouts.get(this.scene.team1.id);
    if (dugout1) {
      await dugout1.animateCelebration();
    }
    await delay(500); // Wait after animation

    // 2. Team 2 Intro
    this.eventBus.emit(
      GameEventNames.UI_Notification,
      `${this.scene.team2.name}` // Team 2 Name
    );

    // Find Team 2 Dugout and animate
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dugout2 = (this.scene as any).dugouts.get(this.scene.team2.id);
    if (dugout2) {
      await dugout2.animateCelebration();
    }
    await delay(500); // Wait after animation

    // 3. Weather
    this.eventBus.emit(GameEventNames.UI_Notification, "Rolling Weather...");
    await delay(500);

    // Trigger Logic
    this.gameService.setWeather(0); // 0 = Roll
    const weather = this.gameService.getState().weather;

    this.eventBus.emit(GameEventNames.UI_Notification, `Weather: ${weather}`);
    // Wait for user to read
    await delay(500);

    // 4. Transition to Coin Flip
    this.eventBus.emit(GameEventNames.UI_StartCoinFlip, {
      team1: this.scene.team1,
      team2: this.scene.team2,
    });

    this.isIntroSequence = false;
  }
}
