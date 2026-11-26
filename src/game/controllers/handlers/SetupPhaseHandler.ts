import type { SetupService } from "./servicePorts";
import type { SetupScene } from "./scenePorts";
import { showSetupPlacement } from "./setupPlacement";
import { type Team } from "../../../types/Team";
import { type PhaseHandler } from "./PhaseHandler";
import { type GameEventMap, type IEventBus } from "../../../services/EventBus";
import { GameEventNames } from "../../../types/events";
import { SubPhase } from "../../../types/GameState";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";
import { CAMERA_INTRO_MS } from "../CameraController";

const BANNER_MS = 2300;

export class SetupPhaseHandler implements PhaseHandler {
  private unsubscribes: (() => void)[] = [];
  private isIntroSequence = false;

  private scene: SetupScene;
  private gameService: SetupService;
  private eventBus: IEventBus;
  constructor(
    scene: SetupScene,
    gameService: SetupService,
    eventBus: IEventBus
  ) {
    this.scene = scene;
    this.gameService = gameService;
    this.eventBus = eventBus;
  }

  enter(): void {
    console.log("[SetupPhaseHandler] Entering Setup Phase");
    this.setupListeners();

    const subPhase = this.gameService.getSubPhase();
    console.log(`[SetupPhaseHandler] Current SubPhase: ${String(subPhase)}`);

    const match = getActiveOnlineMatch();
    const isOnline = !!match && match.kind !== "computer";

    if (subPhase === SubPhase.INTRO) {
      if (!isOnline) void this.runIntroSequence();
    } else if (subPhase === SubPhase.WEATHER) {
      this.resumeWeather(isOnline);
    } else if (subPhase === SubPhase.COIN_FLIP) {
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
      this.enterPlacement(subPhase);
    }
  }

  private enterPlacement(subPhase: SubPhase): void {
    const activeTeamId = this.gameService.getState().activeTeamId;
    if (!activeTeamId) return;
    const activeTeam = activeTeamId === this.scene.team1.id ? this.scene.team1 : this.scene.team2;
    showSetupPlacement({ scene: this.scene, gameService: this.gameService, eventBus: this.eventBus }, { subPhase, team: activeTeam });
  }

  private resumeWeather(isOnline: boolean): void {
    if (isOnline || this.isIntroSequence) return;
    this.gameService.beginCoinFlip();
    this.eventBus.emit(GameEventNames.UI_StartCoinFlip, {
      team1: this.scene.team1,
      team2: this.scene.team2,
    });
  }

  exit(): void {
    console.log("[SetupPhaseHandler] Exiting Setup Phase");
    this.removeListeners();
  }

  private setupListeners(): void {
    this.register(GameEventNames.UI_CoinFlipComplete, (data) => {
      this.scene.kickingTeam = data.kickingTeam;
      this.scene.receivingTeam = data.receivingTeam;

      this.gameService.startSetup(data.kickingTeam.id);
    });

    this.register(GameEventNames.UI_SetupAction, (data) => {
      this.handleSetupAction(data);
    });
  }

  private register<K extends keyof GameEventMap>(
    event: K,
    handler: (data: GameEventMap[K]) => void
  ): () => void {
    this.eventBus.on(event, handler);
    const off = () => {
      this.eventBus.off(event, handler);
    };
    this.unsubscribes.push(off);
    return off;
  }

  private removeListeners(): void {
    for (const unsubscribe of this.unsubscribes) {
      unsubscribe();
    }
    this.unsubscribes = [];
  }

  private handleSetupDecision(action: string, teamId: string): boolean {
    if (action === "confirm") { this.gameService.confirmSetup(teamId); return true; }
    if (action === "continue" || action === "concede") {
      this.gameService.resolveSetupConcession(teamId, action === "concede");
      return true;
    }
    return false;
  }

  private handleSetupAction(data: { action: string; name?: string }): void {
    const state = this.gameService.getState();
    const activeTeamId = state.activeTeamId ?? this.scene.team1.id;
    const activeTeam =
      activeTeamId === this.scene.team1.id
        ? this.scene.team1
        : this.scene.team2;
    const isTeam1 = activeTeam.id === this.scene.team1.id;
    const placementController =
      this.scene.placementController;
    const key = this.formationKey(activeTeam, isTeam1);

    if (this.handleSetupDecision(data.action, activeTeam.id)) return;
    switch (data.action) {
      case "clear":
        placementController.clearPlacements();
        this.scene.refreshDugouts();
        break;
      case "list":
        this.emitFormationList(key, isTeam1);
        break;
      case "save":
        this.saveFormation({ rawName: data.name,activeTeam,key,isTeam1 });
        break;
      case "default":
      case "load":
        this.loadFormation({ rawName: data.name,activeTeam,key,isTeam1 });
        break;
      case "delete":
        this.deleteFormation(data.name, key, isTeam1);
        break;
    }
  }

  private deleteFormation(name: string | undefined, key: string, isTeam1: boolean): void {
    const manager = this.scene.formationManager;
    if (!name || manager.isBuiltIn(name)) return;
    if (!manager.deleteFormation(key, name)) {
      return;
    }

    this.emitFormationList(key, isTeam1);
    this.eventBus.emit(GameEventNames.UI_Notification, `Formation "${name}" deleted.`);
  }

  private weatherRead(): Promise<void> {
    const { team1, team2 } = this.scene;
    const show = () => {
      this.eventBus.emit(GameEventNames.UI_StartWeather, { team1, team2 });
    };
    return new Promise((resolve) => {
      const offRequest = this.register(
        GameEventNames.UI_RequestWeatherState,
        show
      );
      const offComplete = this.register(
        GameEventNames.UI_WeatherComplete,
        () => {
          offRequest();
          offComplete();
          resolve();
        }
      );
      show();
    });
  }

  private saveFormation(
{ rawName,activeTeam,key,isTeam1 }: { rawName: string|undefined; activeTeam: Team; key: string; isTeam1: boolean; }  ): void {
    const name = rawName?.trim();
    if (!name) {
      this.eventBus.emit(
        GameEventNames.UI_Notification,
        "Give the formation a name first."
      );
      return;
    }
    if (this.scene.formationManager.isBuiltIn(name)) {
      this.eventBus.emit(
        GameEventNames.UI_Notification,
        `"${name}" is a built-in formation — pick another name.`
      );
      return;
    }

    const positions = activeTeam.players.flatMap((player, index) =>
      player.gridPosition
        ? {
              playerId: String(index),
              x: player.gridPosition.x,
              y: player.gridPosition.y,
            }
        : []
    );
    if (positions.length === 0) {
      this.eventBus.emit(
        GameEventNames.UI_Notification,
        "Place some players before saving a formation."
      );
      return;
    }
    this.scene.formationManager.saveFormation(key, positions, name);
    this.emitFormationList(key, isTeam1);
    this.eventBus.emit(
      GameEventNames.UI_Notification,
      `Formation "${name}" saved!`
    );
  }

  private loadFormation(
{ rawName,activeTeam,key,isTeam1 }: { rawName: string|undefined; activeTeam: Team; key: string; isTeam1: boolean; }  ): void {
    const placementController =
      this.scene.placementController;
    const name = rawName ?? "Balanced";
    const positions = this.scene.formationManager.getFormation(key, name, isTeam1);
    if (!positions || positions.length === 0) {
      this.eventBus.emit(
        GameEventNames.UI_Notification,
        `No formation named "${name}" for this team.`
      );
      return;
    }
    const result = this.gameService.applySetupFormation(
      activeTeam.id,
      positions
    );
    placementController.syncFromTeam();
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
  }

  private emitFormationList(key: string, isTeam1: boolean): void {
    this.eventBus.emit(GameEventNames.UI_FormationsUpdated, {
      formations: this.scene.formationManager.listAllFormations(key, isTeam1),
      isTeam1,
    });
  }

  private formationKey(
    team: { rosterName?: string; name: string },
    isTeam1: boolean
  ): string {
    return `${team.rosterName ?? team.name}:${isTeam1 ? "left" : "right"}`;
  }

  private async runIntroSequence(): Promise<void> {
    this.isIntroSequence = true;
    const pause = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));
    const { team1, team2 } = this.scene;

    await pause(CAMERA_INTRO_MS);
    for (const [team, side] of [
      [team1, "Home"],
      [team2, "Away"],
    ] as const) {
      this.eventBus.emit(GameEventNames.UI_Announce, {
        kind: "team-intro",
        headline: team.name,
        subtitle: `${side} · ${team.rosterName}`,
      });
      await Promise.all([
        this.scene.celebrateDugout(team.id),
        pause(BANNER_MS),
      ]);
    }

    await this.weatherRead();

    this.isIntroSequence = false;
    this.gameService.beginCoinFlip();
    this.eventBus.emit(GameEventNames.UI_StartCoinFlip, { team1, team2 });
  }
}
