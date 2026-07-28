import { describe, it, expect } from "vitest";
import { computeResume, nextTurnDeadline, TimerState } from "../../src/firebase/lobby";

/** Resume math for the synced turn clock (pause bank + deadline extension). */
describe("turn clock resume", () => {
  const base = (over: Partial<TimerState>): TimerState => ({
    deadline: 100_000,
    pausedBy: "alice",
    pausedAt: 10_000,
    banks: { alice: 5 * 60_000, bob: 5 * 60_000 },
    ...over,
  });

  it("deducts the paused duration from the pauser's bank", () => {
    // paused at 10s, resumed at 40s → 30s used
    const { remainingBankMs } = computeResume(base({}), "alice", 40_000);
    expect(remainingBankMs).toBe(5 * 60_000 - 30_000);
  });

  it("pushes the deadline out by the paused duration (no turn time lost)", () => {
    const { newDeadline } = computeResume(base({}), "alice", 40_000);
    expect(newDeadline).toBe(100_000 + 30_000);
  });

  it("clamps the bank at zero when the pause outlasts it (exhaustion)", () => {
    const timer = base({ banks: { alice: 5_000, bob: 300_000 } });
    // paused 30s but only 5s of bank
    const { remainingBankMs } = computeResume(timer, "alice", 40_000);
    expect(remainingBankMs).toBe(0);
  });
});

/** "No time limit" host setting: turnSeconds <= 0 must never produce an
 *  expiring deadline, so the clock never renders and never force-ends. */
describe("no time limit (turnSeconds sentinel)", () => {
  it("returns an expiring deadline for a normal turnSeconds value", () => {
    expect(nextTurnDeadline(120, 1_000)).toBe(1_000 + 120_000);
  });

  it("returns null when turnSeconds is 0 (no time limit)", () => {
    expect(nextTurnDeadline(0, 1_000)).toBeNull();
  });

  it("returns null for any non-positive turnSeconds (defensive)", () => {
    expect(nextTurnDeadline(-5, 1_000)).toBeNull();
  });
});
