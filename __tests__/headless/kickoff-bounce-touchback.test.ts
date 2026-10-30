import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import type { PlayerPlacement } from "../../src/types/Scenario";
import { forceDice } from "../utils/test-helpers";

/**
 * A kick-off is a Touchback when the ball leaves the pitch or crosses into
 * the kicking team's half, whether by deviation, bounce or anything else.
 * The engine only checked where the kick landed: a bounce over the Line of
 * Scrimmage stayed in play, and a bounce off the pitch got a crowd throw-in.
 */
function scenario(extra: PlayerPlacement[] = []): Scenario {
  return {
    id: "kickoff-bounce-touchback",
    name: "Kick-off bounce touchback",
    description: "team 1 kicks short, close to its own Line of Scrimmage",
    setup: {
      team1Placements: Array.from({ length: 7 }, (_, playerIndex) => ({
        playerIndex,
        x: 5,
        y: playerIndex + 4,
      })),
      team2Placements: [
        ...Array.from({ length: 7 - extra.length }, (_, playerIndex) => ({
          playerIndex,
          x: 14,
          y: playerIndex + 4,
        })),
        ...extra,
      ],
      activeTeam: "team1",
      phase: GamePhase.KICKOFF,
      subPhase: SubPhase.ROLL_KICKOFF,
    },
  };
}

/**
 * Dice in order: deviation direction, the two deviation dice, a Kick-off
 * Event of 1 + 1 (Get the Ref, which rolls nothing), then the landing.
 */
async function kick(
  target: { x: number; y: number },
  forced: number[],
  extra: PlayerPlacement[] = []
) {
  const game = new HeadlessGame({ scenario: scenario(extra), seed: 1 });
  forceDice(game.ctx.rng, forced);
  const kicker = game.snapshot().teams[0].players[0];
  const res = await game.execute({
    type: "kick-ball",
    playerId: kicker.id,
    ...target,
  });
  const dice = res.events
    .filter((e) => e.name === "diceRoll")
    .map((e) => (e.data as { description: string }).description)
    .filter((d) => !d.startsWith("Kickoff Event") && !d.includes(" — "));
  return { game, res, dice };
}

describe("a kick-off that bounces out of the receiving half", () => {
  it("is a touchback when the bounce crosses the kicking team's Line of Scrimmage", async () => {
    // Lands on (7,3), one square past team 1's line, and bounces west.
    const { res, dice } = await kick({ x: 9, y: 1 }, [6, 2, 3, 1, 1, 4]);

    expect(dice).toEqual([
      "Kickoff Deviate Direction: 6",
      "Kickoff Deviate Distance: 2, 3 (lower: 2)",
      "Bounce Direction: 4",
    ]);
    expect(res.pendingDecision).toEqual({ type: "touchback", teamId: "team2" });
    expect(res.snapshot.ballPosition).toBeNull();
  });

  it("is a touchback, not a throw-in, when the bounce leaves the pitch", async () => {
    // Lands on (13,0), the top edge, and bounces north-west off the pitch.
    const { res, dice } = await kick({ x: 10, y: 0 }, [5, 3, 5, 1, 1, 1]);

    expect(dice).toEqual([
      "Kickoff Deviate Direction: 5",
      "Kickoff Deviate Distance: 3, 5 (lower: 3)",
      "Bounce Direction: 1",
    ]);
    expect(res.pendingDecision).toEqual({ type: "touchback", teamId: "team2" });
    expect(res.snapshot.ballPosition).toBeNull();
  });

  it("is a touchback when a dropped kick-off catch bounces off the pitch", async () => {
    // Lands on a poor catcher at (7,0), who drops it; it bounces north.
    const { res, dice } = await kick({ x: 11, y: 0 }, [4, 4, 6, 1, 1, 5, 2], [
      { playerIndex: 6, x: 7, y: 0, stats: { AG: 6 } },
    ]);

    expect(dice).toEqual([
      "Kickoff Deviate Direction: 4",
      "Kickoff Deviate Distance: 4, 6 (lower: 4)",
      "Catch (Human Lineman #7): 5, needs 6+",
      "Bounce Direction: 2",
    ]);
    expect(res.pendingDecision).toEqual({ type: "touchback", teamId: "team2" });
    expect(res.snapshot.ballPosition).toBeNull();
  });

  it("stays in play when the bounce stays in the receiving half", async () => {
    // Lands on (11,3) and bounces north to (11,2).
    const { res, dice } = await kick({ x: 9, y: 1 }, [8, 2, 3, 1, 1, 2]);

    expect(dice).toEqual([
      "Kickoff Deviate Direction: 8",
      "Kickoff Deviate Distance: 2, 3 (lower: 2)",
      "Bounce Direction: 2",
    ]);
    expect(res.pendingDecision).toBeNull();
    expect(res.snapshot.ballPosition).toEqual({ x: 11, y: 2 });
  });
});

