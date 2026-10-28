/**
 * Lockstep online play rests on this: two engines built from the same seed
 * and teams, fed the same commands, agree after every single command,
 * including the ones that stop on a coach's decision.
 */
import { describe, it, expect } from "vitest";
import {
  runMatch,
  createSimGame,
  grantSimInducements,
} from "../../src/simulation/runMatch";
import { heuristicCoach } from "../../src/simulation/coaches/heuristic";
import { stateChecksum } from "../../src/headless/checksum";

const SEEDS = Array.from({ length: 20 }, (_, i) => 1000 + i * 37);

describe("lockstep determinism", () => {
  it.each(SEEDS)(
    "seed %i: two engines agree after every command",
    async (seed) => {
      const recording = await runMatch({
        seed,
        rosters: ["Human", "Orc"],
        coaches: [heuristicCoach, heuristicCoach],
      });
      const a = createSimGame(
        seed,
        recording.rosters,
        recording.rerolls,
        recording.lineup
      );
      const b = createSimGame(
        seed,
        recording.rosters,
        recording.rerolls,
        recording.lineup
      );
      await grantSimInducements(a);
      await grantSimInducements(b);
      expect(stateChecksum(b)).toBe(stateChecksum(a));

      let decisions = 0;
      for (const [index, step] of recording.steps.entries()) {
        const ra = await a.execute(step.command);
        await b.execute(step.command);
        if (ra.pendingDecision) decisions++;
        const [ca, cb] = [stateChecksum(a), stateChecksum(b)];
        if (ca !== cb) {
          throw new Error(
            `diverged at step ${index} (${step.command.type}): ${ca} vs ${cb}`
          );
        }
      }
      expect(recording.steps.length).toBeGreaterThan(100);
      expect(decisions).toBeGreaterThan(0);
    },
    120_000
  );
});
