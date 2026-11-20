import { describe, expect, it } from "vitest";
import { RosterName } from "../../src/types/Team";
import { runMatch } from "../../src/simulation/runMatch";
import { replayRecording } from "../../src/simulation/replay";
import { randomCoach } from "../../src/simulation/coaches/random";

describe("a recorded Street Bowl match", () => {
  it("replays on the street it was played on", async () => {
    const recording = await runMatch({
      seed: 7,
      rosters: [RosterName.HUMAN, RosterName.ORC],
      coaches: [randomCoach, randomCoach],
      gameType: "street-bowl",
      maxCommands: 20,
    });

    expect(recording.matchFormat).toEqual({
      gameType: "street-bowl",
      venue: "street",
    });
    const replay = await replayRecording(recording);
    expect(replay.divergedAt).toBeNull();
    expect(replay.matches).toBe(true);
  });

  it("leaves a Sevens recording without a match format", async () => {
    const recording = await runMatch({
      seed: 7,
      rosters: [RosterName.HUMAN, RosterName.ORC],
      coaches: [randomCoach, randomCoach],
      maxCommands: 20,
    });

    expect(recording).not.toHaveProperty("matchFormat");
  });
});
