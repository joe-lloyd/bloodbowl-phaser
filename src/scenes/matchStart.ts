import type { GameScene } from "./GameScene";
import { Team } from "../types/Team";
import { GamePhase, SubPhase } from "../types/GameState";
import { ServiceContainer } from "../services/ServiceContainer";
import { GameService } from "../services/GameService";
import {
  createMatchSave,
  MatchSave,
  restoreMatchSave,
} from "../headless/serialization";
import { CompetitionContext } from "../competition/types";
import { MatchAutosave } from "../game/persistence/MatchAutosave";
import { fixturePaysWinnings } from "../game/rules/winnings";

/** What the page hands GameScene.init. */
export interface GameSceneData {
  team1: Team;
  team2: Team;
  progressionEnabled?: boolean;
  competitionContext?: CompetitionContext;
  resumeSave?: MatchSave;
  autosaveEnabled?: boolean;
  /** The match seeded the engine from a save before the board mounted. */
  resumed?: boolean;
}

export type MatchStart = ReturnType<typeof resolveMatchStart>;

/**
 * The teams, pitch and drive a scene starts with: the save's when it resumes
 * one, otherwise what the page passed.
 */
export function resolveMatchStart(data: GameSceneData, sceneKey: string) {
  const restored = data.resumeSave ? restoreMatchSave(data.resumeSave) : null;
  const save = restored?.save;
  const [team1, team2] = restored?.teams ?? [data.team1, data.team2];
  return {
    restored,
    team1,
    team2,
    competitionContext: save?.competition ?? data.competitionContext,
    resumed: !!restored || data.resumed === true,
    autosaveEnabled: data.autosaveEnabled ?? sceneKey === "GameScene",
    ...driveTeams(save?.drive, team1, team2),
  };
}

/** The saved drive's kicking and receiving teams, or a default the coin flip sets. */
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

/**
 * Start the match engine for this scene, unless the page already started
 * one (a computer or online match does, before the board mounts).
 */
export function ensureMatchServices(
  start: MatchStart,
  progressionEnabled: boolean | undefined
): void {
  if (ServiceContainer.isInitialized()) return;
  const { restored, team1, team2, competitionContext } = start;
  const initialState =
    restored?.state ??
    GameService.createMatchState(
      team1,
      team2,
      GamePhase.SETUP,
      SubPhase.INTRO,
      // A league fixture takes on Journeymen at kick-off and rolls the
      // Fan Factors for its winnings at full time
      {
        paysWinnings: fixturePaysWinnings(competitionContext?.competitionType),
      }
    );
  if (!restored && competitionContext?.knockout) {
    initialState.knockout = true;
  }
  ServiceContainer.initialize(
    window.eventBus,
    team1,
    team2,
    initialState,
    undefined,
    undefined,
    restored?.save.matchStats.progressionEnabled ?? progressionEnabled ?? false,
    restored?.save.rng,
    restored?.save.matchStats,
    restored?.save.turnManager
  );
}

/** Save the match as it is played, so it can be resumed. */
export function startAutosave(scene: GameScene): MatchAutosave {
  const container = ServiceContainer.getInstance();
  const autosave = new MatchAutosave(
    scene["eventBus"],
    scene["gameService"],
    () =>
      createMatchSave({
        state: scene["gameService"].getState(),
        teams: [scene.team1, scene.team2],
        drive: {
          kickingTeamId: scene.kickingTeam.id,
          receivingTeamId: scene.receivingTeam.id,
        },
        rng: container.rngService.captureState(),
        matchStats: container.matchStats.captureState(),
        turnManager: scene["gameService"].captureTurnManagerState(),
        competition: scene["competitionContext"],
      }),
    { enabled: true }
  );
  autosave.start();
  return autosave;
}
