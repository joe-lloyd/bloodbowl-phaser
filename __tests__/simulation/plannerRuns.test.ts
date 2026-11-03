import { describe, expect, it } from "vitest";
import { RosterName } from "../../src/types/Team";
import { runMatch } from "../../src/simulation/runMatch";
import { plannerCoach } from "../../src/simulation/ai/planner";
import { heuristicCoach } from "../../src/simulation/coaches/heuristic";

/**
 * Seen in a browser match with no team re-rolls: the carrier set off on a
 * scoring run, took one step, and then stepped back, because the rest of
 * the run was still below the safe-score line and a step off the sideline
 * ranked first. It did that three turns running. In this seeded match the
 * old planner did the same; a run that is still worth making is finished.
 */
describe("the planner's scoring run", () => {
  it("never abandons a run it has started for a carrier step", async () => {
    const recording = await runMatch({
      seed: 10,
      rerolls: 0,
      inducements: false,
      rosters: [RosterName.ORC, RosterName.HUMAN],
      coaches: [plannerCoach, heuristicCoach],
    });
    const abandoned = recording.steps.filter(
      (step, i) =>
        i > 0 &&
        step.command.type === "move" &&
        step.note?.startsWith("moves the ball carrier") &&
        recording.steps[i - 1].command.type === "move" &&
        recording.steps[i - 1].note?.startsWith("runs in to score")
    );
    expect(abandoned.map((step) => step.label)).toEqual([]);
  }, 60_000);
});
