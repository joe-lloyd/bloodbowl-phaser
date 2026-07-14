import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { Scenario } from "../../src/types/Scenario";

/**
 * Regression for the cascading-turnover bug: a failed pickup bounces the
 * ball onto a teammate; if they drop it, the second "turnover" used to
 * schedule a second endTurn — flipping the turn straight back to the team
 * that fumbled. Ring the ball square with teammates so bounces usually land
 * on someone who can fail a catch.
 */
const cascadeScenario: Scenario = {
  id: "turnover-cascade",
  name: "Turnover cascade",
  description: "failed pickup bouncing into failed catches",
  setup: {
    team1Placements: [
      { playerIndex: 0, x: 4, y: 5 }, // the mover
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
      const mover = team1.players[0];

      await game.execute({
        type: "declare-action",
        playerId: mover.id,
        action: "move",
      });
      const moved = await game.execute({
        type: "move",
        playerId: mover.id,
        path: [
          { x: 5, y: 5 }, // ball square
          { x: 6, y: 5 }, // would continue if pickup succeeded
        ],
      });
      if (!moved.ok) continue;

      const pickupFailed = moved.events.some(
        (e) =>
          e.name === GameEventNames.BallPickup &&
          (e.data as { success: boolean }).success === false
      );
      if (!pickupFailed) continue;

      // Only count runs where the bounce actually hit a player who dropped it
      const notifications = moved.events
        .filter((e) => e.name === GameEventNames.UI_Notification)
        .map((e) => e.data as string);
      const cascade =
        notifications.includes("Ball hits player!") &&
        notifications.includes("Catch Failed!");
      if (!cascade) continue;

      cascadesTested++;

      // Exactly one turnover, exactly one turn switch, to the opponent
      const names = eventNames(moved.events);
      expect(names.filter((n) => n === GameEventNames.Turnover)).toHaveLength(
        1
      );
      expect(
        names.filter((n) => n === GameEventNames.TurnStarted)
      ).toHaveLength(1);
      expect(moved.snapshot.activeTeamId).toBe(team2.id);

      // The turn switches only after the ball is at rest: no catch/bounce
      // resolution appears after TurnStarted
      const turnStartIndex = names.indexOf(GameEventNames.TurnStarted);
      const lastCatchFail = moved.events.reduce(
        (last, e, i) =>
          e.name === GameEventNames.UI_Notification &&
          e.data === "Catch Failed!"
            ? i
            : last,
        -1
      );
      expect(turnStartIndex).toBeGreaterThan(lastCatchFail);

      // Movement stopped at the pickup square (no continuing to x=6)
      const moverAfter = moved.snapshot.teams[0].players.find(
        (p) => p.id === mover.id
      )!;
      expect(moverAfter.position).toEqual({ x: 5, y: 5 });
    }

    // The ring makes cascades common; three seeds must have produced one
    expect(cascadesTested).toBeGreaterThanOrEqual(3);
  });

  it("a plain failed pickup still ends the turn exactly once", async () => {
    for (let seed = 1; seed <= 60; seed++) {
      const game = new HeadlessGame({ scenario: cascadeScenario, seed });
      const mover = game.snapshot().teams[0].players[0];

      await game.execute({
        type: "declare-action",
        playerId: mover.id,
        action: "move",
      });
      const moved = await game.execute({
        type: "move",
        playerId: mover.id,
        path: [{ x: 5, y: 5 }],
      });

      const pickupFailed = moved.events.some(
        (e) =>
          e.name === GameEventNames.BallPickup &&
          (e.data as { success: boolean }).success === false
      );
      if (!pickupFailed) continue;

      const names = eventNames(moved.events);
      expect(names.filter((n) => n === GameEventNames.Turnover)).toHaveLength(
        1
      );
      expect(
        names.filter((n) => n === GameEventNames.TurnStarted)
      ).toHaveLength(1);
      return; // one failing seed is enough for this case
    }
    throw new Error("no failing pickup found in seed range");
  });

  it("a manual end-turn during turnover resolution does not double-switch", async () => {
    for (let seed = 1; seed <= 60; seed++) {
      const game = new HeadlessGame({ scenario: cascadeScenario, seed });
      const snap = game.snapshot();
      const mover = snap.teams[0].players[0];

      await game.execute({
        type: "declare-action",
        playerId: mover.id,
        action: "move",
      });
      const moved = await game.execute({
        type: "move",
        playerId: mover.id,
        path: [{ x: 5, y: 5 }],
      });
      const pickupFailed = moved.events.some(
        (e) =>
          e.name === GameEventNames.BallPickup &&
          (e.data as { success: boolean }).success === false
      );
      if (!pickupFailed) continue;

      // Turn already flipped to team2 by the turnover; team2 plays and ends
      // their turn manually — play must return to team1, not skip anywhere.
      expect(moved.snapshot.activeTeamId).toBe(snap.teams[1].id);
      const ended = await game.execute({ type: "end-turn" });
      expect(ended.snapshot.activeTeamId).toBe(snap.teams[0].id);
      return;
    }
    throw new Error("no failing pickup found in seed range");
  });
});
