import {
  activateMatchFormat,
  type MatchFormat,
  SEVENS_FORMAT,
} from "@/game/variants/activeMatch";
import { freshTurn } from "./turnState";
import { type GameState, GamePhase, SubPhase } from "@/types/GameState";
import { GameEventNames } from "@/types/events";
import { type Team } from "@/types/Team";
import { SetupManager } from "@/game/managers/SetupManager";
import { rollMasterChefs as cookMasterChefs } from "@/game/inducements/masterChef";
import type { GameParts } from "./parts";
import { readyInducements, skipUnaffordableInducements } from "./inducements";
import { prepareClubSquad } from "@/game/rules/club";

export function createMatchState({
  team1,
  team2,
  startingPhase = GamePhase.SETUP,
  startingSubPhase,
  fixture = {},
  format = SEVENS_FORMAT,
}: {
  team1: Team;
  team2: Team;
  startingPhase?: GamePhase;
  startingSubPhase?: SubPhase;
  fixture?: {
    paysWinnings?: boolean;
    competition?: boolean;
    pregameInducements?: boolean;
  };
  format?: MatchFormat;
}): GameState {
  activateMatchFormat(format);
  const competition = !!(fixture.competition ?? fixture.paysWinnings);
  prepareClubSquad(team1, format.gameType, competition);
  prepareClubSquad(team2, format.gameType, competition);
  const readiness = { leagueFixture: !!fixture.paysWinnings, competition };
  SetupManager.sanitizeTeam(team1, readiness);
  SetupManager.sanitizeTeam(team2, readiness);
  const state = createInitialState({
    team1,
    team2,
    startingPhase,
    ...(startingSubPhase !== undefined && { startingSubPhase }),
  });
  if (fixture.paysWinnings) state.paysWinnings = true;
  if (competition) state.competition = true;
  if (format.gameType !== SEVENS_FORMAT.gameType) {
    state.gameType = format.gameType;
    state.venue = format.venue;
  }
  if (fixture.pregameInducements) state.pregameInducements = { ready: {} };
  return state;
}

export function createInitialState({
  team1,
  team2,
  startingPhase = GamePhase.SANDBOX_IDLE,
  startingSubPhase,
}: {
  team1: Team;
  team2: Team;
  startingPhase?: GamePhase;
  startingSubPhase?: SubPhase;
}): GameState {
  return {
    phase: startingPhase,
    ...(startingSubPhase !== undefined && { subPhase: startingSubPhase }),
    activeTeamId: null,
    turn: freshTurn(),
    score: {
      [team1.id]: 0,
      [team2.id]: 0,
    },
    weather: "Nice",
    ballPosition: null,
    activePlayer: null,
  };
}

export function readyForWeather(parts: GameParts, teamId: string): boolean {
  const { state } = parts;
  const teamIds = [parts.team1.id, parts.team2.id];
  if (
    state.phase !== GamePhase.SETUP ||
    state.subPhase !== SubPhase.INTRO ||
    !teamIds.includes(teamId) ||
    weatherRolled(state)
  )
    return false;
  const ready = [...new Set([...(state.weatherReady ?? []), teamId])];
  state.weatherReady = ready;

  if (state.pregameInducements) readyInducements(parts, teamId);
  parts.eventBus.emit(GameEventNames.WeatherReady, { teamIds: ready });
  if (weatherRolled(state)) {
    parts.weatherService.rollWeather();
    skipUnaffordableInducements(parts);
  }
  return true;
}

export function weatherRolled(state: GameState): boolean {
  return (state.weatherReady?.length ?? 0) >= 2;
}

export function beginCoinFlip(parts: GameParts): void {
  parts.state.subPhase = SubPhase.COIN_FLIP;
  parts.eventBus.emit(GameEventNames.PhaseChanged, {
    phase: GamePhase.SETUP,
    subPhase: SubPhase.COIN_FLIP,
  });
}

export function canCoinFlip(parts: GameParts): boolean {
  if (parts.turnManager.hasGameStarted()) return false;
  if (parts.state.turn.turnNumber > 0) return false;
  if (Object.values(parts.state.score).some((s) => s > 0)) return false;
  return true;
}

export function rollMasterChefs(parts: GameParts): void {
  cookMasterChefs(
    parts.state,
    [parts.team1, parts.team2],
    parts.diceController,
    parts.eventBus
  );
}

export function startGame(parts: GameParts, kickingTeamId: string): void {
  rollMasterChefs(parts);
  parts.rerollArbiter.beginHalf([parts.team1.id, parts.team2.id]);
  parts.turnManager.startGame(parts.state.kick?.kickingTeamId ?? kickingTeamId);
}
