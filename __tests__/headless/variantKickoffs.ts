import { vi } from "vitest";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { stabilizeIds } from "../../src/headless/createHeadlessGame";
import { TeamFactory } from "../../src/game/TeamFactory";
import { applyScenario } from "../../src/game/applyScenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { RosterName } from "../../src/types/Team";
import { type Player } from "../../src/types/Player";
import { type Scenario } from "../../src/types/Scenario";
import { GameEventNames } from "../../src/types/events";
import type { MatchFormat } from "../../src/game/variants/activeMatch";
import type { Weather } from "../../src/game/rules/weather";
import { kickoffResultSchema } from "./kickoffKicks";
import { forceDice } from "../utils/test-helpers";

type Placement = Scenario["setup"]["team1Placements"][number];

export const STREET: MatchFormat = { gameType: "street-bowl", venue: "street" };
export const BEACH: MatchFormat = { gameType: "beach-bowl", venue: "beach" };
export const GUTTER_STREET: MatchFormat = {
  gameType: "gutter-bowl",
  venue: "gutter-street",
};
export const GUTTER_SEWER: MatchFormat = {
  gameType: "gutter-bowl",
  venue: "gutter-sewer",
};

const row = (x: number, ys: number[], from = 0): Placement[] =>
  ys.map((y, index) => ({ playerIndex: from + index, x, y }));

export const STREET_SETUP = {
  team1: [...row(12, [2, 3, 4]), ...row(10, [1, 5], 3), ...row(8, [3, 2], 5)],
  team2: [...row(13, [2, 3, 4]), ...row(15, [1, 5], 3), ...row(17, [3, 2], 5)],
  landing: { x: 20, y: 3 },
};

export const BEACH_SETUP = {
  team1: [...row(6, [3, 4, 5]), ...row(4, [1, 7], 3), ...row(3, [4, 3], 5)],
  team2: [...row(13, [3, 4, 5]), ...row(15, [1, 7], 3), ...row(16, [4, 3], 5)],
  landing: { x: 17, y: 4 },
};

export const GUTTER_SETUP = {
  team1: [
    ...row(12, [5, 7, 9]),
    { playerIndex: 3, x: 10, y: 2 },
    { playerIndex: 4, x: 12, y: 13 },
    ...row(9, [7, 6], 5),
  ],
  team2: [
    ...row(13, [5, 7, 9]),
    { playerIndex: 3, x: 13, y: 2 },
    { playerIndex: 4, x: 16, y: 13 },
    ...row(16, [7, 6], 5),
  ],
  landing: { x: 21, y: 7 },
};

export interface VariantKick {
  format: MatchFormat;
  setup: { team1: Placement[]; team2: Placement[]; landing: { x: number; y: number } };
  dice: number[];
  weather?: Weather;
  turn?: number;
  prepare?: (game: HeadlessGame) => void;
}

export function variantGame({ format, setup, weather, phase }: Omit<VariantKick, "dice"> & { phase?: GamePhase }) {
  const team1 = stabilizeIds(TeamFactory.createTestTeam(RosterName.HUMAN, "Home Team", 0xcc0000), "team1");
  const team2 = stabilizeIds(TeamFactory.createTestTeam(RosterName.HUMAN, "Away Team", 0x0000cc), "team2");
  const scenario: Scenario = {
    id: `variant-kickoff-${format.venue}`,
    name: "Variant kick-off",
    description: "Team one kicks to team two.",
    setup: {
      team1Placements: setup.team1,
      team2Placements: setup.team2,
      activeTeam: phase === GamePhase.PLAY ? "team1" : "team2",
      turn: 2,
      phase: phase ?? GamePhase.KICKOFF,
      subPhase: phase === GamePhase.PLAY ? SubPhase.TURN_KICKING : SubPhase.ROLL_KICKOFF,
      ...(weather !== undefined && { weather }),
    },
  };
  const initialState = applyScenario(scenario, team1, team2);
  initialState.gameType = format.gameType;
  initialState.venue = format.venue;
  return new HeadlessGame({ teams: [team1, team2], initialState, seed: 1 });
}

export async function variantKick(kick: VariantKick) {
  const game = variantGame(kick);
  game.ctx.gameService.seedTurnCounts(kick.turn ?? 2);
  for (const team of [game.ctx.teams[0], game.ctx.teams[1]]) team.dedicatedFans = 1;
  kick.prepare?.(game);
  vi.spyOn(game.ctx.gameService.getBallMovementController(), "deviate").mockReturnValue({ ...kick.setup.landing });
  forceDice(game.ctx.rng, kick.dice);
  const response = await game.execute({
    type: "kick-ball",
    playerId: fixtureValue(game.ctx.teams[0].players[6]).id,
    ...kick.setup.landing,
  });
  const result = kickoffResultSchema.parse(
    response.events.find((event) => event.name === GameEventNames.KickoffResult)?.data
  );
  return { game, response, result };
}

export function playerOf(game: HeadlessGame, team: "team1" | "team2", index: number): Player {
  return fixtureValue(game.ctx[team].players[index]);
}

export function statusesOf(game: HeadlessGame, team: "team1" | "team2"): string[] {
  return game.ctx[team].players.slice(0, 7).map((player) => player.status);
}

export function squaresOf(game: HeadlessGame, team: "team1" | "team2"): string[] {
  return game.ctx[team].players
    .slice(0, 7)
    .map((player) => (player.gridPosition ? `${String(player.gridPosition.x)},${String(player.gridPosition.y)}` : "off"));
}
