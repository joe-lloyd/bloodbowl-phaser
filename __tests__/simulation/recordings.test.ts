import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { parseRecording, replayRecording } from "../../src/simulation/replay";
import { GameSnapshot } from "../../src/headless/serialization";

/**
 * Committed recordings are regression fixtures: each one is a real match,
 * trimmed to the step where the simulation harness caught a bug (see
 * `pnpm sim:replay --trim-out`). Replaying it must break no invariant and
 * every recorded command must still be accepted or refused as before.
 *
 * If an engine change alters dice order or a roll's outcome, a replay
 * diverges and this fails at the first differing step. A fixture whose bug
 * state the fixed engine can no longer reach becomes a scenario test in
 * __tests__/headless instead, as the pickup and Skull fixtures did.
 */
const DIR = path.join(__dirname, "recordings");

/**
 * What each fixture's last step must now produce, read off the snapshot.
 * Empty for now: failed-rush-onto-loose-ball became
 * __tests__/headless/failed-rush-onto-loose-ball.test.ts when the Sevens
 * kick-off deviation changed the dice order.
 */
const EXPECTED_END: Record<string, (snapshot: GameSnapshot) => void> = {};

describe("committed simulation recordings", () => {
  const files = fs.existsSync(DIR)
    ? fs.readdirSync(DIR).filter((file) => file.endsWith(".json"))
    : [];

  it("has a fixture for every expectation", () => {
    expect(files.sort()).toEqual(Object.keys(EXPECTED_END).sort());
  });

  it.each(files)("%s replays cleanly", async (file) => {
    const recording = parseRecording(
      fs.readFileSync(path.join(DIR, file), "utf8")
    );
    const result = await replayRecording(recording);

    expect(result.violations).toEqual([]);
    expect(result.divergedAt).toBeNull();

    EXPECTED_END[file](result.game.snapshot());
  });
});
