/**
 * The decision search copies a match at a choice inside an action, where no
 * save can hold it, by replaying the commands played since the last save
 * between activations. The copy must be the live game, dice and all.
 */
import { describe, expect, it } from "vitest";
import { GameFork, HeadlessGame } from "../../src/headless/HeadlessGame";
import { stateChecksum } from "../../src/headless/checksum";
import { createPlannerCoach } from "../../src/simulation/ai/planner";
import { Coach } from "../../src/simulation/coach";
import { runMatch } from "../../src/simulation/runMatch";
import { GamePhase } from "../../src/types/GameState";
import { RosterName } from "../../src/types/Team";

async function replay(fork: GameFork): Promise<HeadlessGame> {
  const copy = new HeadlessGame({ matchSave: fork.save, lazySnapshots: true });
  for (const command of fork.since) await copy.execute(command);
  return copy;
}

/** The planner, checking a fork at every choice inside an action. */
function checking(seen: { forks: number; diverged: string[] }): Coach {
  const planner = createPlannerCoach();
  return {
    name: "checking",
    async choose(context) {
      const { game, point } = context;
      game.keepForks();
      const fork = game.fork();
      if (point.pending && point.phase === GamePhase.PLAY && fork) {
        seen.forks++;
        const copy = await replay(fork);
        if (stateChecksum(copy) !== stateChecksum(game))
          seen.diverged.push(
            `${point.pending.type} after ${fork.since.map((c) => c.type).join(", ")}`
          );
      }
      return planner.choose(context);
    },
  };
}

const rosters = Object.values(RosterName);

describe("a fork of a match inside an action", () => {
  it.each([0, 1, 2, 3, 4, 5])(
    "pairing %i: every choice replays to the live game",
    async (pairing) => {
      const seen = { forks: 0, diverged: [] as string[] };
      const coach = checking(seen);
      await runMatch({
        seed: 300 + pairing,
        rosters: [
          rosters[(pairing * 5) % rosters.length],
          rosters[(pairing * 5 + 13) % rosters.length],
        ],
        coaches: [coach, coach],
      });

      expect(seen.diverged).toEqual([]);
      expect(seen.forks).toBeGreaterThan(5);
    },
    120_000
  );
});
