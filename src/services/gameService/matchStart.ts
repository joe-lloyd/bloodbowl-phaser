/**
 * How a match starts: the GameState it opens with, the coin toss, Master
 * Chefs, and the first half.
 */

import { GameState, GamePhase, SubPhase } from "@/types/GameState";
import { GameEventNames } from "@/types/events";
import { Team } from "@/types/Team";
import { SetupManager } from "@/game/managers/SetupManager";
import { rollMasterChefs as cookMasterChefs } from "@/game/inducements/masterChef";
import type { GameParts } from "./parts";

/**
 * The opening state of a fresh match, with both teams readied for it:
 * everyone in the Reserves, a league team's injuries served and, in a
 * league fixture, Journeymen taken on (leagueRoster.ts). A fixture that
 * pays winnings is a league fixture (`fixturePaysWinnings`), and the state
 * carries that as `paysWinnings`. A resumed match keeps its state.
 */
export function createMatchState(
  team1: Team,
  team2: Team,
  startingPhase: GamePhase = GamePhase.SETUP,
  startingSubPhase?: SubPhase,
  fixture: { paysWinnings?: boolean; pregameInducements?: boolean } = {}
): GameState {
  const readiness = { leagueFixture: !!fixture.paysWinnings };
  SetupManager.sanitizeTeam(team1, readiness);
  SetupManager.sanitizeTeam(team2, readiness);
  const state = createInitialState(
    team1,
    team2,
    startingPhase,
    startingSubPhase
  );
  if (fixture.paysWinnings) state.paysWinnings = true;
  if (fixture.pregameInducements) state.pregameInducements = { ready: {} };
  return state;
}

/**
 * Factory method to create a default initial state
 */
export function createInitialState(
  team1: Team,
  team2: Team,
  startingPhase: GamePhase = GamePhase.SANDBOX_IDLE,
  startingSubPhase?: SubPhase
): GameState {
  return {
    phase: startingPhase,
    subPhase: startingSubPhase,
    activeTeamId: null,
    turn: {
      teamId: "",
      turnNumber: 0,
      isHalf2: false,
      activatedPlayerIds: new Set(),
      hasBlitzed: false,
      hasPassed: false,
      hasHandedOff: false,
      hasFouled: false,
      hasThrownTeamMate: false,
      hasKickedTeamMate: false,
      hasThrownBomb: false,
      movementUsed: new Map(),
    },
    score: {
      [team1.id]: 0,
      [team2.id]: 0,
    },
    weather: "Nice",
    ballPosition: null, // Ball not placed yet
    activePlayer: null,
    setup: undefined,
  };
}

/**
 * A coach is ready for the opening weather roll. Once both coaches are, the
 * weather is rolled, before the coin toss. False outside the opening, for a
 * team not in the match, or once the weather is rolled.
 */
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
  parts.eventBus.emit(GameEventNames.WeatherReady, { teamIds: ready });
  if (weatherRolled(state)) parts.weatherService.rollWeather();
  return true;
}

/** Both coaches readied up, so the opening weather has been rolled. */
export function weatherRolled(state: GameState): boolean {
  return (state.weatherReady?.length ?? 0) >= 2;
}

/** The opening is done (teams introduced, weather shown): toss the coin. */
export function beginCoinFlip(parts: GameParts): void {
  parts.state.subPhase = SubPhase.COIN_FLIP;
  parts.eventBus.emit(GameEventNames.PhaseChanged, {
    phase: GamePhase.SETUP,
    subPhase: SubPhase.COIN_FLIP,
  });
}

/**
 * Coin flip is only legal before the first drive of the match — never once
 * a kickoff has happened, a turn has been played, or a score exists
 * (scenario-started games count as underway).
 */
export function canCoinFlip(parts: GameParts): boolean {
  if (parts.turnManager.hasGameStarted()) return false;
  if (parts.state.turn.turnNumber > 0) return false;
  if (Object.values(parts.state.score).some((s) => s > 0)) return false;
  return true;
}

/** Halfling Master Chefs cook once per half, before its first Kick-off. */
export function rollMasterChefs(parts: GameParts): void {
  cookMasterChefs(
    parts.state,
    [parts.team1, parts.team2],
    parts.diceController,
    parts.eventBus
  );
}

export function startGame(parts: GameParts, kickingTeamId: string): void {
  // A match that began past setup (a scenario) has its chef cook here.
  rollMasterChefs(parts);
  parts.rerollArbiter.beginHalf([parts.team1.id, parts.team2.id]);
  parts.turnManager.startGame(kickingTeamId);
}
