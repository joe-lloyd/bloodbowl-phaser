import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import type { MatchSave } from "../../src/headless/serialization";
import type { MatchRecording } from "../../src/simulation/runMatch";
import { enumerateDecision } from "../../src/simulation/candidates";
import { createTelemetry } from "../../scripts/coach/catalogue-study/telemetry";
import { GameEventNames } from "../../src/types/events";

describe("engine event observation", () => {
  it("counts a touchdown completed between recorded mutations exactly once", async () => {
    const trace = JSON.parse(
      gunzipSync(
        readFileSync("__tests__/fixtures/policy-lab/query-score.json.gz")
      ).toString()
    ) as { initial: MatchSave; recording: MatchRecording };
    const game = new HeadlessGame({ matchSave: trace.initial });
    const execute = game.execute.bind(game);
    game.execute = async (command) => await execute(command);
    const telemetry = createTelemetry(game);
    let touchdowns = 0;
    game.ctx.eventBus.on(GameEventNames.Touchdown, () => touchdowns++);
    for (const step of trace.recording.steps) {
      await enumerateDecision(game, null);
      const response = await game.execute(step.command);
      expect(response.ok).toBe(step.ok);
    }
    expect(touchdowns).toBe(2);
    expect(telemetry.snapshot().counters.touchdown).toBe(2);
  });
});
