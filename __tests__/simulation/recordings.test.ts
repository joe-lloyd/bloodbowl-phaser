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
 * If an engine change alters dice order, a replay diverges and this fails
 * at the first differing step. Re-record deliberately; do not loosen it.
 */
const DIR = path.join(__dirname, "recordings");

/** What each fixture's last step must now produce, read off the snapshot. */
const EXPECTED_END: Record<string, (snapshot: GameSnapshot) => void> = {
  // A follow-up onto the loose ball rolled a 2. The old follow-up pickup
  // skipped the +1 modifier, failed, and bounced the ball off the pitch.
  "follow-up-pickup-on-sideline.json": (snapshot) => {
    expect(snapshot.ballPosition).toEqual({ x: 15, y: 10 });
    expect(player(snapshot, "team2-player-7")).toMatchObject({
      position: { x: 15, y: 10 },
      status: "Active",
    });
  },
  // A Rush into the loose ball's square (5,7) failed. The ball stayed under
  // the fallen player instead of bouncing. Now it bounces before the armour
  // roll, which shifts the dice: the faller is KO'd off the pitch.
  "failed-rush-onto-loose-ball.json": (snapshot) => {
    expect(snapshot.ballPosition).toEqual({ x: 4, y: 7 });
    expect(player(snapshot, "team1-player-2")).toMatchObject({
      position: null,
      status: "KO",
    });
  },
  // A ball carrier rolled a Skull and went down still holding the ball.
  "skull-drops-carried-ball.json": (snapshot) => {
    expect(player(snapshot, "team2-player-5")?.position).toEqual({
      x: 17,
      y: 4,
    });
    expect(snapshot.ballPosition).toEqual({ x: 16, y: 5 });
  },
  // Picking the ball up in the end zone scored once from the pickup and
  // again from the move, and the scorer was never credited.
  "pickup-in-end-zone-scores-once.json": (snapshot) => {
    expect(snapshot.score).toEqual({ team1: 1, team2: 0 });
  },
};

const player = (snapshot: GameSnapshot, id: string) =>
  snapshot.teams.flatMap((t) => t.players).find((p) => p.id === id);

describe("committed simulation recordings", () => {
  const files = fs.readdirSync(DIR).filter((file) => file.endsWith(".json"));

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
