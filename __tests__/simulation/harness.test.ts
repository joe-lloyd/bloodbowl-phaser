import { describe, it, expect } from "vitest";
import { RosterName } from "../../src/types/Team";
import { runMatch } from "../../src/simulation/runMatch";
import { replayRecording } from "../../src/simulation/replay";
import { heuristicCoach } from "../../src/simulation/coaches/heuristic";
import { randomCoach } from "../../src/simulation/coaches/random";
import { GamePhase } from "../../src/types/GameState";

/**
 * A small slice of `pnpm sim`, run on every test pass: whole matches between
 * different rosters and coaches must reach full time without breaking an
 * invariant, and a recording must replay to the identical final state.
 * The mass run is the CLI's job; this keeps the harness itself honest.
 */
const MATCHES = [
  {
    seed: 101,
    rosters: [RosterName.HUMAN, RosterName.ORC],
    coaches: [heuristicCoach, heuristicCoach],
  },
  {
    seed: 202,
    rosters: [RosterName.SKAVEN, RosterName.DWARF],
    coaches: [heuristicCoach, randomCoach],
  },
  {
    seed: 303,
    rosters: [RosterName.WOOD_ELF, RosterName.NURGLE],
    coaches: [randomCoach, randomCoach],
  },
] as const;

describe("simulation harness", () => {
  it.each(MATCHES)(
    "plays seed $seed to full time without blocking findings",
    async (match) => {
      const recording = await runMatch({
        seed: match.seed,
        rosters: [...match.rosters],
        coaches: [...match.coaches],
      });

      expect(recording.final.phase).toBe(GamePhase.GAME_OVER);
      const blocking = recording.findings.filter(
        (f) => f.kind !== "rejected-candidate"
      );
      expect(blocking).toEqual([]);

      const replay = await replayRecording(recording);
      expect(replay.divergedAt).toBeNull();
      expect(replay.matches).toBe(true);
    },
    60_000
  );
});
