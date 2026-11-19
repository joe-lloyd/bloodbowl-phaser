import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { type Scenario } from "../../src/types/Scenario";
import { GameEventNames } from "../../src/types/events";
import { KickoffEvent } from "../../src/game/kickoff/kickoffEvents";
import { forceDice } from "../utils/test-helpers";

const scenario: Scenario = {
  id: "sevens-kickoff-rules",
  name: "Sevens kick-off rules",
  description: "Team 1 on its Line of Scrimmage kicks to team 2.",
  setup: {
    team1Placements: Array.from({ length: 7 }, (_, playerIndex) => ({
      playerIndex,
      x: 6,
      y: playerIndex + 2,
    })),
    team2Placements: Array.from({ length: 7 }, (_, playerIndex) => ({
      playerIndex,
      x: 14,
      y: playerIndex + 2,
    })),
    activeTeam: "team2",
    turn: 2,
    phase: GamePhase.KICKOFF,
    subPhase: SubPhase.ROLL_KICKOFF,
  },
};

async function kick(
  dice: number[],
  target: { x: number; y: number },
  turn = 2
) {
  const game = new HeadlessGame({ scenario, seed: 1 });
  game.ctx.gameService.seedTurnCounts(turn);
  forceDice(game.ctx.rng, dice);
  const response = await game.execute({
    type: "kick-ball",
    playerId: fixtureValue(game.ctx.team1.players[0]).id,
    ...target,
  });
  const rolls = response.events
    .filter((event) => event.name === GameEventNames.DiceRoll)
    .map((event) =>
      z
        .object({ rollType: z.string(), value: z.unknown(), total: z.number() })
        .parse(event.data)
    );
  const landing = z
    .union([
      z.object({
        landingSquare: z.union([
          z.object({ x: z.number(), y: z.number() }),
          z.null(),
        ]),
      }),
      z.undefined(),
    ])
    .parse(
      response.events.find(
        (event) => event.name === GameEventNames.KickoffBallLanding
      )?.data
    )?.landingSquare;
  return { game, response, rolls, landing };
}

describe("M3: kick-off deviation", () => {
  it("deviates the lower of 2D6 and logs both dice", async () => {
    const { rolls, landing } = await kick([5, 5, 2, 3, 4], { x: 15, y: 5 });

    expect(
      rolls.find((roll) => roll.rollType === "Kickoff Deviate Distance")
    ).toMatchObject({ value: [5, 2], total: 2 });
    expect(landing).toEqual({ x: 17, y: 5 });
  });
});
describe("K3: Time-Out", () => {
  it.each([
    [4, 5],
    [5, 4],
    [6, 5],
  ])(
    "moves the kicking team's marker from turn %i to %i",
    async (turn, after) => {
      const { game } = await kick([5, 1, 1, 1, 2], { x: 15, y: 5 }, turn);

      expect(game.ctx.gameService.getTurnNumber("team1")).toBe(after);
    }
  );
});

describe("K4: Alert Defence", () => {
  async function alertDefence() {
    return kick([5, 1, 1, 1, 3, 6], { x: 15, y: 5 });
  }

  it("gives the kicking coach D3+1 Open players", async () => {
    const { response } = await alertDefence();

    expect(response.pendingDecision).toMatchObject({
      type: "kickoff-event",
      event: KickoffEvent.ALERT_DEFENCE,
      chooserTeamId: "team1",
      selectionLimit: 4,
    });
  });

  it("moves a selected player one square into No Man's Land", async () => {
    const { game } = await alertDefence();
    const player = game.ctx.team1.players[0];
    expect(fixtureValue(player).gridPosition).toEqual({ x: 6, y: 2 });

    const selected = await game.execute({
      type: "kickoff-select-player",
      playerId: fixtureValue(player).id,
    });
    expect(selected.ok).toBe(true);
    const twoSquares = await game.execute({
      type: "kickoff-move-player",
      playerId: fixtureValue(player).id,
      x: 8,
      y: 2,
    });
    expect(twoSquares.ok).toBe(false);
    const moved = await game.execute({
      type: "kickoff-move-player",
      playerId: fixtureValue(player).id,
      x: 7,
      y: 1,
    });
    expect(moved.ok).toBe(true);
    expect(fixtureValue(player).gridPosition).toEqual({ x: 7, y: 1 });

    const again = await game.execute({
      type: "kickoff-move-player",
      playerId: fixtureValue(player).id,
      x: 8,
      y: 1,
    });
    expect(again.ok).toBe(false);

    const confirmed = await game.execute({ type: "kickoff-confirm" });
    expect(confirmed.pendingDecision?.type).not.toBe("kickoff-event");
    expect(fixtureValue(player).gridPosition).toEqual({ x: 7, y: 1 });
  });

  it("refuses receiving players and the old re-set-up drop", async () => {
    const { game } = await alertDefence();
    const receiver = game.ctx.team2.players[0];
    const kicker = game.ctx.team1.players[1];

    const select = await game.execute({
      type: "kickoff-select-player",
      playerId: fixtureValue(receiver).id,
    });
    expect(select.ok).toBe(false);
    const redeploy = await game.execute({
      type: "kickoff-place-player",
      playerId: fixtureValue(kicker).id,
      x: 2,
      y: 3,
    });
    expect(redeploy.ok).toBe(false);
    expect(fixtureValue(kicker).gridPosition).toEqual({ x: 6, y: 3 });
  });
});
describe("K5: High Kick", () => {
  it("offers the step when the ball will land in the receiving half", async () => {
    const { response, landing } = await kick([5, 2, 2, 2, 3], { x: 15, y: 5 });

    expect(response.pendingDecision).toMatchObject({
      type: "kickoff-event",
      event: KickoffEvent.HIGH_KICK,
      chooserTeamId: "team2",
      landingSquare: { x: 17, y: 5 },
    });
    expect(landing).toBeUndefined();
  });

  it("offers nothing when the ball will land in No Man's Land", async () => {
    const { response, landing } = await kick([4, 1, 1, 2, 3], { x: 13, y: 5 });

    expect(response.pendingDecision?.type).not.toBe("kickoff-event");
    expect(landing).toEqual({ x: 12, y: 5 });
  });
});
