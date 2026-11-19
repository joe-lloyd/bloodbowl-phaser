import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { type Scenario } from "../../src/types/Scenario";
import { forceDice } from "../utils/test-helpers";

afterEach(() => {
  vi.restoreAllMocks();
});

const scenario: Scenario = {
  id: "walk-before-decision",
  name: "Walk before a re-roll choice",
  description: "",
  setup: {
    team1Placements: [
      { playerIndex: 0, x: 4, y: 5 },
      { playerIndex: 1, x: 10, y: 1 },
    ],
    team2Placements: [{ playerIndex: 0, x: 8, y: 1 }],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 6, y: 5 },
  },
};

function walksIn(events: { name: string; data?: unknown }[]) {
  return events
    .filter((event) => event.name === GameEventNames.PlayerMoved)
    .map(
      (event) =>
        z
          .object({ to: z.object({ x: z.number(), y: z.number() }) })
          .parse(event.data).to
    );
}

describe("the walk before a re-roll choice", () => {
  it("is shown up to the ball before a failed pickup's re-roll choice", async () => {
    const game = new HeadlessGame({ scenario, seed: 4 });
    game.ctx.team1.rerolls = 2;
    const mover = game.ctx.team1.players[0];
    forceDice(game.ctx.rng, [1]);
    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(mover).id,
      action: "move",
    });

    const moved = await game.execute({
      type: "move",
      playerId: fixtureValue(mover).id,
      path: [
        { x: 5, y: 5 },
        { x: 6, y: 5 },
      ],
    });

    expect(moved.pendingDecision?.type).toBe("reroll");
    expect(fixtureValue(mover).gridPosition).toEqual({ x: 6, y: 5 });
    expect(walksIn(moved.events)).toEqual([{ x: 6, y: 5 }]);
  });

  it("is shown up to the dodge square before a failed dodge's re-roll choice", async () => {
    const game = new HeadlessGame({ scenario, seed: 4 });
    game.ctx.team1.rerolls = 2;
    const runner = game.ctx.team1.players[1];

    forceDice(game.ctx.rng, [1]);
    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(runner).id,
      action: "move",
    });

    const moved = await game.execute({
      type: "move",
      playerId: fixtureValue(runner).id,
      path: [
        { x: 9, y: 1 },
        { x: 9, y: 2 },
        { x: 9, y: 3 },
      ],
    });

    expect(moved.pendingDecision?.type).toBe("reroll");
    expect(fixtureValue(runner).gridPosition).toEqual({ x: 9, y: 1 });
    expect(walksIn(moved.events)).toEqual([{ x: 9, y: 1 }]);
  });

  it("throws a fall's armour and injury dice for the fallen player's team", async () => {
    const game = new HeadlessGame({ scenario, seed: 4 });
    game.ctx.team1.rerolls = 0;
    const runner = game.ctx.team1.players[1];

    forceDice(game.ctx.rng, [1, 6, 6, 2, 2]);
    const teams: Record<string, string | undefined> = {};
    game.ctx.eventBus.on(GameEventNames.DiceRoll, (roll) => {
      teams[roll.rollType] = roll.teamId;
    });
    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(runner).id,
      action: "move",
    });
    await game.execute({
      type: "move",
      playerId: fixtureValue(runner).id,
      path: [
        { x: 9, y: 1 },
        { x: 9, y: 2 },
      ],
    });

    expect(teams[`Armour Roll (${fixtureValue(runner).playerName})`]).toBe(
      fixtureValue(runner).teamId
    );
    expect(teams[`Injury Roll (${fixtureValue(runner).playerName})`]).toBe(
      fixtureValue(runner).teamId
    );
  });

  it("logs the pickup's needed roll, modifiers counted", async () => {
    const marked: Scenario = {
      ...scenario,
      setup: {
        ...scenario.setup,
        team2Placements: [{ playerIndex: 0, x: 7, y: 5 }],
      },
    };
    const game = new HeadlessGame({ scenario: marked, seed: 4 });
    const mover = game.ctx.team1.players[0];
    const ag = fixtureValue(mover).stats.AG;
    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(mover).id,
      action: "move",
    });
    const moved = await game.execute({
      type: "move",
      playerId: fixtureValue(mover).id,
      path: [
        { x: 5, y: 5 },
        { x: 6, y: 5 },
      ],
    });

    const notes = moved.events
      .filter((event) => event.name === GameEventNames.UI_Notification)
      .map((event) => String(event.data));
    expect(notes).toContain(
      `Pickup Test: ${String(ag + 1)}+ (${String(ag)}+, -1)`
    );
  });

  it("still arrives as one walk when no roll is needed", async () => {
    const game = new HeadlessGame({ scenario, seed: 4 });
    const runner = game.ctx.team1.players[0];
    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(runner).id,
      action: "move",
    });

    const moved = await game.execute({
      type: "move",
      playerId: fixtureValue(runner).id,
      path: [
        { x: 4, y: 6 },
        { x: 4, y: 7 },
      ],
    });

    expect(walksIn(moved.events)).toEqual([{ x: 4, y: 7 }]);
  });
});
