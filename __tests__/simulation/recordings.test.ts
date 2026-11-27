import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import path from "node:path";
import { parseRecording, replayRecording } from "../../src/simulation/replay";
import { type GameSnapshot } from "../../src/headless/serialization";

const DIR = path.join(__dirname, "recordings");

const EXPECTED_END: Record<string, (snapshot: GameSnapshot) => void> = {};

describe("committed simulation recordings", () => {
  const files = fs.existsSync(DIR)
    ? fs.readdirSync(DIR).filter((file) => file.endsWith(".json"))
    : [];

  it("has a fixture for every expectation", () => {
    expect([...files].sort((a, b) => a.localeCompare(b))).toEqual(Object.keys(EXPECTED_END).sort((a, b) => a.localeCompare(b)));
  });

  it.each(files)("%s replays cleanly", async (file) => {
    const recording = parseRecording(
      fs.readFileSync(path.join(DIR, file), "utf8")
    );
    const result = await replayRecording(recording);

    expect(result.violations).toEqual([]);
    expect(result.divergedAt).toBeNull();

    fixtureValue(EXPECTED_END[file])(result.game.snapshot());
  });
});
