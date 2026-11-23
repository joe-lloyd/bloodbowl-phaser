import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { SCENARIOS } from "../../src/data/scenarios";
import {
  interceptNeed,
  interceptPreviewLine,
} from "../../src/game/rules/rollPreview";
import type { CommandResponse } from "../../src/headless/protocol";

const scenario = fixtureValue(
  SCENARIOS.find((s) => s.id === "throw-interception-test")
);

async function throwPast(seed: number) {
  const game = new HeadlessGame({ scenario, seed });
  const thrower = game.ctx.team1.players[0];
  const interceptor = game.ctx.team2.players[0];
  const passingTeam = game.ctx.team1.players;
  const preview = interceptPreviewLine(
    fixtureValue(interceptor),
    passingTeam,
    game.ctx.gameService.getState()
  );
  await game.execute({
    type: "declare-action",
    playerId: fixtureValue(thrower).id,
    action: "pass",
  });
  const response: CommandResponse = await game.execute({
    type: "pass",
    playerId: fixtureValue(thrower).id,
    x: 16,
    y: 7,
  });

  const passRoll = response.events.find(
    (e) =>
      e.name === "diceRoll" &&
      z
        .object({ rollType: z.string() })
        .parse(e.data)
        .rollType.startsWith("Pass ")
  );
  const accurate =
    z
      .union([
        z.object({ resultState: z.string().exactOptional() }),
        z.undefined(),
      ])
      .parse(passRoll?.data)?.resultState === "success";
  const pending = response.pendingDecision;
  return { interceptor, preview, accurate, pending };
}

describe("interception targets", () => {
  it("names the accurate and the inaccurate roll in the preview", async () => {
    const { preview } = await throwPast(1);
    expect(preview.line).toBe("Intercept #1: 6+, if inaccurate 5+");
  });

  it("offers in the dialog the roll the preview named for that pass", async () => {
    const seen: string[] = [];
    for (let seed = 1; seed <= 12; seed++) {
      const { interceptor, accurate, pending } = await throwPast(seed);
      if (pending?.type !== "interception") continue;
      const offered = fixtureValue(
        pending.candidates.find(
          (c) => c.playerId === fixtureValue(interceptor).id
        )
      );
      const need = interceptNeed(fixtureValue(interceptor), offered.modifier);
      seen.push(`${accurate ? "accurate" : "inaccurate"} ${String(need)}+`);
    }

    expect(new Set(seen)).toEqual(new Set(["accurate 6+", "inaccurate 5+"]));
  });
});
