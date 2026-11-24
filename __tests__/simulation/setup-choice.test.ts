import { describe, expect, it } from "vitest";
import { createPlannerCoach } from "../../src/simulation/ai/planner";
import { runMatch } from "../../src/simulation/runMatch";
import { type Coach } from "../../src/simulation/coach";
import { GamePhase } from "../../src/types/GameState";
import { RosterName } from "../../src/types/Team";

function setupRecorder(seen: Set<string>): Coach {
  const planner = createPlannerCoach();
  return {
    name: "recorder",
    async choose(context) {
      const choice = await planner.choose(context);
      const label = context.point.candidates[choice.index]?.label ?? "";
      if (context.point.phase === GamePhase.SETUP && label.startsWith("Set up"))
        seen.add(label);
      return choice;
    },
  };
}

describe("the computer's setups", () => {
  it("uses several kicking and receiving formations over a few matches", async () => {
    const seen = new Set<string>();
    for (const seed of [1, 2, 3, 4])
      await runMatch({
        seed,
        rosters: [RosterName.HUMAN, RosterName.ORC],
        coaches: [setupRecorder(seen), setupRecorder(seen)],
      });
    expect(seen).toContain("Set up in the Receive: Full line formation");
    expect(seen).toContain("Set up in the Kick: Blitz line formation");
    expect(seen).toContain("Set up in the Kick: Press formation");
    expect(seen.size).toBeGreaterThanOrEqual(6);
  }, 60_000);
});
