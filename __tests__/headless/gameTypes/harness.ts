import { z } from "zod";
import { fixtureValue } from "../../../src/testing/fixtureValue";
import { HeadlessGame } from "../../../src/headless/HeadlessGame";
import { type Scenario, type PlayerPlacement } from "../../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../../src/types/GameState";
import type {
  CommandResponse,
  EmittedEvent,
} from "../../../src/headless/protocol";
import { type GameType } from "../../../src/game/variants/gameTypes";
import { gameTypeRules } from "../../../src/game/variants/gameTypeRules";
import { forceDice } from "../../utils/test-helpers";

export const ALL_GAME_TYPES: readonly GameType[] = [
  "sevens",
  "street-bowl",
  "beach-bowl",
  "gutter-bowl",
];

export function duel(
  team1: Partial<PlayerPlacement>[],
  team2: Partial<PlayerPlacement>[]
): Scenario {
  return {
    id: "game-type-duel",
    name: "Game type duel",
    description: "",
    setup: {
      team1Placements: team1.map((p, playerIndex) => ({
        playerIndex,
        x: 10,
        y: 3,
        ...p,
      })),
      team2Placements: team2.map((p, playerIndex) => ({
        playerIndex,
        x: 11,
        y: 3,
        ...p,
      })),
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: { x: 1, y: 1 },
    },
  };
}

export function session(gameType: GameType, scenario: Scenario, dice: number[]) {
  const venue = gameTypeRules(gameType).venues[0];
  const game = new HeadlessGame({
    scenario,
    seed: 1,
    format: { gameType, venue },
  });
  forceDice(game.ctx.rng, dice);
  const events: EmittedEvent[] = [];
  const run = async (command: unknown): Promise<CommandResponse> => {
    let response = await game.execute(command);
    events.push(...response.events);
    while (response.pendingDecision?.type === "reroll") {
      response = await game.execute({ type: "use-reroll", accept: false });
      events.push(...response.events);
    }
    return response;
  };
  const dataOf = <T>(name: string, schema: z.ZodType<T>): T[] =>
    events.filter((e) => e.name === name).map((e) => schema.parse(e.data));
  return {
    game,
    run,
    dataOf,
    rolls: () =>
      dataOf("diceRoll", z.object({ description: z.string() })).map(
        (d) => d.description
      ),
    armour: () =>
      dataOf(
        "armorRolled",
        z.object({ roll: z.number(), broken: z.boolean() })
      ),
    player: (team: 1 | 2, index = 0) =>
      fixtureValue(
        (team === 1 ? game.ctx.team1 : game.ctx.team2).players[index]
      ),
  };
}
