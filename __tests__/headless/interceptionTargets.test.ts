/**
 * The throw preview, the interception dialog and the engine's roll agree
 * on what an interceptor needs. In round 1 the preview said 6+ (17%) and
 * the dialog said 5+ (33%) for the same player: the preview assumed an
 * accurate pass and said nothing about an inaccurate one.
 */
import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { SCENARIOS } from "../../src/data/scenarios";
import {
  interceptNeed,
  interceptPreviewLine,
} from "../../src/game/rules/rollPreview";
import type { CommandResponse } from "../../src/headless/protocol";

const scenario = SCENARIOS.find((s) => s.id === "throw-interception-test")!;

async function throwPast(seed: number) {
  const game = new HeadlessGame({ scenario, seed });
  const thrower = game.ctx.team1.players[0];
  const interceptor = game.ctx.team2.players[0];
  const passingTeam = game.ctx.team1.players;
  const preview = interceptPreviewLine(interceptor, passingTeam, "Nice");
  await game.execute({
    type: "declare-action",
    playerId: thrower.id,
    action: "pass",
  });
  const response: CommandResponse = await game.execute({
    type: "pass",
    playerId: thrower.id,
    x: 16,
    y: 7,
  });
  const attempted = response.events.find((e) => e.name === "passAttempted");
  const pending = response.pendingDecision;
  return { interceptor, preview, attempted, pending };
}

describe("interception targets", () => {
  it("names the accurate and the inaccurate roll in the preview", async () => {
    const { preview } = await throwPast(1);
    expect(preview.line).toBe("Intercept #1: 6+ (17%), if inaccurate 5+ (33%)");
  });

  it("offers in the dialog the roll the preview named for that pass", async () => {
    const seen: string[] = [];
    for (let seed = 1; seed <= 12; seed++) {
      const { interceptor, preview, attempted, pending } =
        await throwPast(seed);
      if (pending?.type !== "interception") continue;
      const offered = pending.candidates.find(
        (c) => c.playerId === interceptor.id
      )!;
      const accurate = (attempted?.data as { accurate: boolean } | undefined)
        ?.accurate;
      const need = interceptNeed(interceptor, offered.modifier);
      seen.push(`${accurate ? "accurate" : "inaccurate"} ${need}+`);
    }
    // Both kinds of pass come up across these committed seeds, and each
    // offers exactly the roll the preview named for it
    expect(new Set(seen)).toEqual(new Set(["accurate 6+", "inaccurate 5+"]));
  });
});
