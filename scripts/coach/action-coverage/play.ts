import { createPlannerCoach } from "../../../src/simulation/ai/planner";
import { rostersFor } from "../../../src/simulation/commands/fourSeat";
import { runFourSeatMatch } from "../../../src/simulation/fourSeat";
import { runMatch } from "../../../src/simulation/runMatch";
import { GAME_TYPES, type GameType } from "../../../src/game/variants/gameTypes";
import { GamePhase } from "../../../src/types/GameState";
import { RosterName } from "../../../src/types/Team";
import type { PlayedMatch } from "./model";

export const COVERAGE_GAME_TYPES = [...GAME_TYPES, "deathbowl"] as const;

export type CoverageGameType = (typeof COVERAGE_GAME_TYPES)[number];

const ROSTERS = Object.values(RosterName);

function pairingFor(seed: number): [RosterName, RosterName] {
  const count = ROSTERS.length;
  const home = seed % count;
  const away = (home + 1 + (Math.floor(seed / count) % (count - 1))) % count;
  return [ROSTERS[home] ?? RosterName.HUMAN, ROSTERS[away] ?? RosterName.ORC];
}

async function twoTeamMatch(gameType: GameType, seed: number): Promise<PlayedMatch> {
  const rosters = pairingFor(seed);
  const recording = await runMatch({
    seed,
    rosters,
    coaches: [createPlannerCoach(), createPlannerCoach()],
    gameType,
  });
  return {
    gameType,
    seed,
    completed: recording.final.phase === GamePhase.GAME_OVER,
    teams: (recording.telemetry ?? []).map((telemetry, side) => ({
      roster: rosters[side === 0 ? 0 : 1],
      telemetry,
    })),
  };
}

async function deathbowlMatch(seed: number): Promise<PlayedMatch> {
  const rosters = rostersFor(seed);
  const run = await runFourSeatMatch({
    seed,
    rosters,
    coaches: [createPlannerCoach(), createPlannerCoach(), createPlannerCoach(), createPlannerCoach()],
  });
  return {
    gameType: "deathbowl",
    seed,
    completed: run.final.phase === GamePhase.GAME_OVER,
    teams: run.telemetry.map((telemetry, seat) => ({
      roster: rosters[seat] ?? "unknown",
      telemetry,
    })),
  };
}

export const playCoverageMatch = (gameType: CoverageGameType, seed: number): Promise<PlayedMatch> =>
  gameType === "deathbowl" ? deathbowlMatch(seed) : twoTeamMatch(gameType, seed);
