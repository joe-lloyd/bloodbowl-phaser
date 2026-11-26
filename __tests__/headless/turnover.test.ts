import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { type Scenario } from "../../src/types/Scenario";

const cascadeScenario: Scenario = {
  id: "turnover-cascade",
  name: "Turnover cascade",
  description: "failed pickup bouncing into failed catches",
  setup: {
    team1Placements: [
      { playerIndex: 0, x: 4, y: 5 },
      { playerIndex: 1, x: 4, y: 4 },
      { playerIndex: 2, x: 5, y: 4 },
      { playerIndex: 3, x: 6, y: 4 },
      { playerIndex: 4, x: 4, y: 6 },
      { playerIndex: 5, x: 5, y: 6 },
      { playerIndex: 6, x: 6, y: 6 },
    ],
    team2Placements: [{ playerIndex: 0, x: 16, y: 5 }],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 5, y: 5 },
  },
};

function eventNames(events: { name: string; data?: unknown }[]): string[] {
  return events.map((e) => e.name);
}

describe("turnover resolution", () => {
  it("a bounce chain after a failed pickup causes exactly one turnover", async () => {
    let cascadesTested = 0;

    for (let seed = 1; seed <= 200 && cascadesTested < 3; seed++) {
      const game = new HeadlessGame({ scenario: cascadeScenario, seed });
      const snap = game.snapshot();
      const [team1, team2] = snap.teams;
      const mover = fixtureValue(team1).players[0];

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
      if (!moved.ok) continue;

      const pickupFailed = moved.events.some(
        (e) =>
          e.name === GameEventNames.BallPickup &&
          !z.object({ success: z.boolean() }).parse(e.data).success
      );
      if (!pickupFailed) continue;

      const notifications = new Set(moved.events
        .filter((e) => e.name === GameEventNames.UI_Notification)
        .map((e) => z.string().parse(e.data)));
      const cascade =
        notifications.has("Ball hits player!") &&
        notifications.has("Catch Failed!");
      if (!cascade) continue;

      cascadesTested++;

      const names = eventNames(moved.events);
      expect(names.filter((n) => n === GameEventNames.Turnover)).toHaveLength(
        1
      );
      expect(
        names.filter((n) => n === GameEventNames.TurnStarted)
      ).toHaveLength(1);
      expect(moved.snapshot.activeTeamId).toBe(fixtureValue(team2).id);

      const turnStartIndex = names.indexOf(GameEventNames.TurnStarted);
      let lastCatchFail = -1;
      for (const [i, e] of moved.events.entries()) {
        if (
          e.name === GameEventNames.UI_Notification &&
          e.data === "Catch Failed!"
        ) {
          lastCatchFail = i;
        }
      }
      expect(turnStartIndex).toBeGreaterThan(lastCatchFail);

      const moverAfter = fixtureValue(
        fixtureValue(moved.snapshot.teams[0]).players.find(
          (p) => p.id === fixtureValue(mover).id
        )
      );
      expect(moverAfter.position).toEqual({ x: 5, y: 5 });
    }

    expect(cascadesTested).toBeGreaterThanOrEqual(3);
  });

  it("a plain failed pickup still ends the turn exactly once", async () => {
    for (let seed = 1; seed <= 60; seed++) {
      const game = new HeadlessGame({ scenario: cascadeScenario, seed });
      const mover = fixtureValue(game.snapshot().teams[0]).players[0];

      await game.execute({
        type: "declare-action",
        playerId: fixtureValue(mover).id,
        action: "move",
      });
      const moved = await game.execute({
        type: "move",
        playerId: fixtureValue(mover).id,
        path: [{ x: 5, y: 5 }],
      });

      const pickupFailed = moved.events.some(
        (e) =>
          e.name === GameEventNames.BallPickup &&
          !z.object({ success: z.boolean() }).parse(e.data).success
      );
      if (!pickupFailed) continue;

      const names = eventNames(moved.events);
      expect(names.filter((n) => n === GameEventNames.Turnover)).toHaveLength(
        1
      );
      expect(
        names.filter((n) => n === GameEventNames.TurnStarted)
      ).toHaveLength(1);
      return;
    }
    throw new Error("no failing pickup found in seed range");
  });

  it("a manual end-turn during turnover resolution does not double-switch", async () => {
    for (let seed = 1; seed <= 60; seed++) {
      const game = new HeadlessGame({ scenario: cascadeScenario, seed });
      const snap = game.snapshot();
      const mover = fixtureValue(snap.teams[0]).players[0];

      await game.execute({
        type: "declare-action",
        playerId: fixtureValue(mover).id,
        action: "move",
      });
      const moved = await game.execute({
        type: "move",
        playerId: fixtureValue(mover).id,
        path: [{ x: 5, y: 5 }],
      });
      const pickupFailed = moved.events.some(
        (e) =>
          e.name === GameEventNames.BallPickup &&
          !z.object({ success: z.boolean() }).parse(e.data).success
      );
      if (!pickupFailed) continue;

      expect(moved.snapshot.activeTeamId).toBe(fixtureValue(snap.teams[1]).id);
      const ended = await game.execute({ type: "end-turn" });
      expect(ended.snapshot.activeTeamId).toBe(fixtureValue(snap.teams[0]).id);
      return;
    }
    throw new Error("no failing pickup found in seed range");
  });
});
