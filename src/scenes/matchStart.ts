import type { GameScene } from "./GameScene";
import { type Team } from "../types/Team";
import { GamePhase, SubPhase } from "../types/GameState";
import { ServiceContainer } from "../services/ServiceContainer";
import { GameService } from "../services/GameService";
import {
  createMatchSave,
  type MatchSave,
  restoreMatchSave,
} from "../headless/serialization";
import { type CompetitionContext } from "../competition/types";
import { MatchAutosave } from "../game/persistence/MatchAutosave";
import { fixturePaysWinnings } from "../game/rules/winnings";
import { startMatchDiceLog } from "../game/persistence/diceLogStore";
import { getActiveOnlineMatch } from "../network/OnlineMatch";
import type { GameType } from "../game/variants/gameTypes";
import type { Venue } from "../game/variants/pitchLayouts";
import { startingFormat } from "../game/variants/startingFormat";
import { type SeatedTeams } from "../game/seating";

export interface GameSceneData {
  teams: SeatedTeams;
  progressionEnabled?: boolean;
  competitionContext?: CompetitionContext;
  gameType?: GameType;
  venue?: Venue;
  resumeSave?: MatchSave;
  autosaveEnabled?: boolean;

  resumed?: boolean;
}

export type MatchStart = ReturnType<typeof resolveMatchStart>;

export function resolveMatchStart(data: GameSceneData, sceneKey: string) {
  const restored = data.resumeSave ? restoreMatchSave(data.resumeSave) : null;
  const save = restored?.save;
  const teams = restored?.teams ?? data.teams;
  const [team1, team2] = teams;
  return {
    restored,
    teams,
    competitionContext: save?.competition ?? data.competitionContext,
    gameType: data.gameType,
    venue: data.venue,
    resumed: !!restored || data.resumed === true,
    autosaveEnabled: data.autosaveEnabled ?? sceneKey === "GameScene",
    ...driveTeams(save?.drive, team1, team2),
  };
}

function driveTeams(
  drive: MatchSave["drive"] | undefined,
  team1: Team,
  team2: Team
) {
  return {
    kickingTeam: drive?.kickingTeamId === team2.id ? team2 : team1,
    receivingTeam: drive?.receivingTeamId === team1.id ? team1 : team2,
  };
}

export function ensureMatchServices(
  start: MatchStart,
  progressionEnabled: boolean | undefined
): void {
  if (ServiceContainer.isInitialized()) return;
  const { restored, teams, competitionContext } = start;
  const initialState =
    restored?.state ??
    GameService.createMatchState({ teams, startingPhase: GamePhase.SETUP, startingSubPhase: SubPhase.INTRO, fixture: {
        paysWinnings: fixturePaysWinnings(competitionContext),
        competition: !!competitionContext,
        pregameInducements: true,
      }, ...startingFormat(
        competitionContext
          ? { gameType: competitionContext.gameType }
          : { gameType: start.gameType, venue: start.venue }
      ) }
    );
  if (restored?.save.competition) initialState.competition = true;
  if (!restored && competitionContext?.knockout) {
    initialState.knockout = true;
  }
  const save = restored?.save;
  ServiceContainer.initialize({
    eventBus: globalThis.eventBus,
    teams,
    initialState,
    progressionEnabled:
      save?.matchStats.progressionEnabled ?? progressionEnabled ?? false,
    ...(save && { rngState: save.rng, matchStatsState: save.matchStats }),
    ...(save?.turnManager && { turnManagerState: save.turnManager }),
  });
}

export function startAutosave(scene: GameScene): MatchAutosave {
  const container = ServiceContainer.getInstance();
  const autosave = new MatchAutosave(
    scene.eventBus,
    scene.gameService,
    () =>
      createMatchSave({
        state: scene.gameService.getState(),
        teams: scene.teams,
        drive: {
          kickingTeamId: scene.kickingTeam.id,
          receivingTeamId: scene.receivingTeam.id,
        },
        rng: container.rngService.captureState(),
        matchStats: container.matchStats.captureState(),
        turnManager: scene.gameService.captureTurnManagerState(),
        ...(scene.competitionContext !== undefined && { competition: scene.competitionContext }),
      }),
    { enabled: true }
  );
  autosave.start();
  return autosave;
}

export function startDiceLog(
  start: MatchStart,
  sceneKey: string
): { dispose(): void } | null {
  if (sceneKey !== "GameScene") return null;
  const container = ServiceContainer.getInstance();
  return startMatchDiceLog({
    eventBus: container.eventBus,
    getState: () => container.gameService.getState(),
    mode: getActiveOnlineMatch()?.kind ?? "local",
    seed: container.rngService.getInitialSeed(),
    teams: [...start.teams],
    resumed: start.resumed,
  });
}
