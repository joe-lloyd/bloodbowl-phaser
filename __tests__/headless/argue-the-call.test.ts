import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { Scenario } from "../../src/types/Scenario";
import { PlayerStatus } from "../../src/types/Player";
import { playerBoxOf } from "../../src/game/rules/playerLocation";
import { foulAddingAllAssists, forceDice } from "../utils/test-helpers";
import { RosterName } from "../../src/types/Team";

/**
 * Sevens rule M6: Argue the Call. On a D6 of 1 to 4 the fouler is still
 * Sent-off; on a 5 or 6 they return to their square. Either way the
 * Turnover stands, and the coach is never ejected.
 */
const scenario: Scenario = {
  id: "argue-the-call",
  name: "Argue the Call",
  description: "two team 1 players beside a Prone opponent",
  setup: {
    team1Placements: [
      { playerIndex: 0, x: 10, y: 5 },
      { playerIndex: 1, x: 10, y: 6 },
    ],
    team2Placements: [
      { playerIndex: 0, x: 11, y: 5, status: PlayerStatus.PRONE },
    ],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 1, y: 1 },
  },
};

/** A double 1 holds the armour and is spotted; then the Argue the Call die. */
async function foul(game: HeadlessGame, playerIndex: number, argue: number) {
  forceDice(game.ctx.rng, [1, 1, argue]);
  const fouler = game.ctx.team1.players[playerIndex];
  await game.execute({
    type: "declare-action",
    playerId: fouler.id,
    action: "foul",
  });
  const response = await foulAddingAllAssists(game, {
    type: "foul",
    playerId: fouler.id,
    x: 11,
    y: 5,
  });
  const argueRolls = response.events
    .filter((e) => e.name === GameEventNames.DiceRoll)
    .map((e) => e.data as { rollType: string; total: number })
    .filter((roll) => roll.rollType === "Argue the Call")
    .map((roll) => roll.total);
  return { fouler, response, argueRolls };
}

describe("Argue the Call", () => {
  it.each([1, 4])("still Sends-off the fouler on a %i", async (argue) => {
    const game = new HeadlessGame({ scenario, seed: 1 });
    const { fouler, response, argueRolls } = await foul(game, 0, argue);

    expect(argueRolls).toEqual([argue]);
    expect(playerBoxOf(fouler)).toBe("sent-off");
    expect(fouler.gridPosition).toBeUndefined();
    expect(response.snapshot.activeTeamId).toBe("team2");
  });

  it.each([5, 6])(
    "returns the fouler to their square on a %i, still a Turnover",
    async (argue) => {
      const game = new HeadlessGame({ scenario, seed: 1 });
      const { fouler, response, argueRolls } = await foul(game, 0, argue);

      expect(argueRolls).toEqual([argue]);
      expect(fouler.status).toBe(PlayerStatus.ACTIVE);
      expect(fouler.gridPosition).toEqual({ x: 10, y: 5 });
      expect(response.snapshot.activeTeamId).toBe("team2");
    }
  );

  it("never ejects the coach: a later Send-off is argued again", async () => {
    const game = new HeadlessGame({ scenario, seed: 1 });
    await foul(game, 0, 1);
    await game.execute({ type: "end-turn" });
    expect(game.snapshot().activeTeamId).toBe("team1");

    const { fouler, argueRolls } = await foul(game, 1, 6);

    expect(argueRolls).toEqual([6]);
    expect(fouler.gridPosition).toEqual({ x: 10, y: 6 });
  });
});

/**
 * Bribery and Corruption, 2025 rulebook p.154: "Once per game, when a team
 * with this special rule rolls a 1 to Argue the Call, they may re-roll the
 * D6." The re-roll is always taken: a 1 already fails.
 */
describe("Bribery and Corruption", () => {
  const goblins: Scenario = {
    ...scenario,
    id: "bribery-and-corruption-argue",
    setup: {
      ...scenario.setup,
      team1Roster: RosterName.GOBLIN,
      // Goblin Linemen, as the Goblin roster fields them
      team1Placements: [
        { playerIndex: 1, x: 10, y: 5 },
        { playerIndex: 2, x: 10, y: 6 },
      ],
    },
  };

  it("re-rolls an Argue the Call roll of 1", async () => {
    const game = new HeadlessGame({ scenario: goblins, seed: 1 });
    const { fouler, argueRolls } = await foulWith(game, 1, [1, 5]);

    expect(argueRolls).toEqual([1, 5]);
    expect(fouler.gridPosition).toEqual({ x: 10, y: 5 });
  });

  it("re-rolls only a 1", async () => {
    const game = new HeadlessGame({ scenario: goblins, seed: 1 });
    const { fouler, argueRolls } = await foulWith(game, 1, [3]);

    expect(argueRolls).toEqual([3]);
    expect(playerBoxOf(fouler)).toBe("sent-off");
  });

  it("re-rolls once per game, even across a save", async () => {
    const game = new HeadlessGame({ scenario: goblins, seed: 1 });
    await foulWith(game, 1, [1, 2]);
    await game.execute({ type: "end-turn" });
    await game.execute({ type: "end-turn" });
    const resumed = new HeadlessGame({ matchSave: game.matchSave() });

    const { fouler, argueRolls } = await foulWith(resumed, 2, [1]);

    expect(argueRolls).toEqual([1]);
    expect(playerBoxOf(fouler)).toBe("sent-off");
  });

  it("is not a Human team's", async () => {
    const game = new HeadlessGame({ scenario, seed: 1 });
    const { argueRolls } = await foulWith(game, 0, [1]);

    expect(argueRolls).toEqual([1]);
  });
});

/** As `foul`, for any roster: `argue` holds every Argue the Call die. */
async function foulWith(
  game: HeadlessGame,
  playerIndex: number,
  argue: number[]
) {
  forceDice(game.ctx.rng, [1, 1, ...argue]);
  const fouler = game.ctx.team1.players[playerIndex];
  await game.execute({
    type: "declare-action",
    playerId: fouler.id,
    action: "foul",
  });
  const response = await game.execute({
    type: "foul",
    playerId: fouler.id,
    x: 11,
    y: 5,
  });
  const argueRolls = response.events
    .filter((e) => e.name === GameEventNames.DiceRoll)
    .map((e) => e.data as { rollType: string; total: number })
    .filter((roll) => roll.rollType.startsWith("Argue the Call"))
    .map((roll) => roll.total);
  return { fouler, response, argueRolls };
}
