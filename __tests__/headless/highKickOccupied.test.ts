import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import { runRuleConfig } from "../../src/game/rules-lab/runner";
import { KICKOFF_SCENARIOS } from "../../src/data/kickoffScenarios";
import { GameEventNames } from "../../src/types/events";

const standard = KICKOFF_SCENARIOS[0];

async function highKick(seed: number) {
  const result = await runRuleConfig(fixtureValue(standard), seed);
  const kickoff = z
    .object({ event: z.string().exactOptional() })
    .parse(
      result.events.find((e) => e.name === GameEventNames.KickoffResult)?.data
    );
  const kick = z
    .object({ finalX: z.number(), finalY: z.number() })
    .parse(
      result.events.find((e) => e.name === GameEventNames.BallKicked)?.data
    );
  return {
    event: kickoff.event,
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
    const run = await highKick(15);
    expect(run.event).toBe("High Kick");
    expect(run.landing).toEqual({ x: 14, y: 2 });
    expect(run.stepOffered).toBe(false);
    expect(run.logs).toContain(
      "High Kick: Human Lineman #1 already stands where the ball will land, so no one else may be placed there."
    );
  });

  it("still offers it on an empty square", async () => {
    const run = await highKick(22);
    expect(run.event).toBe("High Kick");
    expect(run.landing).toEqual({ x: 16, y: 5 });
    expect(run.stepOffered).toBe(true);
  });
});
