/**
 * High Kick (Sevens K5): one Open receiving player may be placed in the
 * square the ball will land in. A square holds one player, so when someone
 * already stands there nobody can be placed, and the step is not offered,
 * as when the ball lands in No Man's Land.
 */
import { describe, expect, it } from "vitest";
import { runRuleConfig } from "../../src/game/rules-lab/runner";
import { KICKOFF_SCENARIOS } from "../../src/data/kickoffScenarios";
import { GameEventNames } from "../../src/types/events";

const standard = KICKOFF_SCENARIOS[0];

async function highKick(seed: number) {
  const result = await runRuleConfig(standard, seed);
  const kickoff = result.events.find(
    (e) => e.name === GameEventNames.KickoffResult
  )?.data as { event?: string };
  const kick = result.events.find((e) => e.name === GameEventNames.BallKicked)
    ?.data as { finalX: number; finalY: number };
  return {
    event: kickoff?.event,
    landing: { x: kick.finalX, y: kick.finalY },
    stepOffered: result.events.some(
      (e) => e.name === GameEventNames.KickoffEventStepStarted
    ),
    logs: result.events
      .filter((e) => e.name === GameEventNames.UI_GameLog)
      .map((e) => String(e.data)),
  };
}

describe("High Kick onto a square a player already holds", () => {
  it("offers no placement, and says why", async () => {
    // Seed 15 lands the ball on (14,2), where a receiver stands
    const run = await highKick(15);
    expect(run.event).toBe("High Kick");
    expect(run.landing).toEqual({ x: 14, y: 2 });
    expect(run.stepOffered).toBe(false);
    expect(run.logs).toContain(
      "High Kick: Human Lineman #1 already stands where the ball will land, so no one else may be placed there."
    );
  });

  it("still offers it on an empty square", async () => {
    // Seed 22 lands the ball on (16,5), which nobody holds
    const run = await highKick(22);
    expect(run.event).toBe("High Kick");
    expect(run.landing).toEqual({ x: 16, y: 5 });
    expect(run.stepOffered).toBe(true);
  });
});
