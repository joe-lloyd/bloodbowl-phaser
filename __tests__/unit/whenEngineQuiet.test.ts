import { describe, it, expect, vi } from "vitest";
import {
  realTimeDelay,
  whenEngineQuiet,
} from "../../src/game/core/GameFlowManager";

/**
 * Online lockstep waits for the engine's paced flow (a turnover, the
 * half-time sequence) to finish before it checks or runs a command.
 */
describe("whenEngineQuiet", () => {
  it("returns at once when nothing is running", async () => {
    const start = Date.now();
    await whenEngineQuiet();
    // Nothing to wait for; the bound is loose so a busy machine passes
    expect(Date.now() - start).toBeLessThan(500);
  });

  it("waits for a running delay and the code after it", async () => {
    let after = false;
    void realTimeDelay(80).then(() => {
      after = true;
    });
    const start = Date.now();
    await whenEngineQuiet();
    expect(Date.now() - start).toBeGreaterThanOrEqual(75);
    expect(after).toBe(true);
  });

  it("waits through a chain of delays", async () => {
    const steps: number[] = [];
    void realTimeDelay(30)
      .then(() => steps.push(1))
      .then(() => realTimeDelay(30))
      .then(() => steps.push(2));
    await whenEngineQuiet();
    expect(steps).toEqual([1, 2]);
  });

  it("outlasts a whole turnover, which paces 3 s, then 0.5 s, then 1.1 s", async () => {
    vi.useFakeTimers();
    try {
      let turnEnded = false;
      void realTimeDelay(3000)
        .then(() => realTimeDelay(500))
        .then(() => realTimeDelay(1100))
        .then(() => {
          turnEnded = true;
        });
      let quiet = false;
      void whenEngineQuiet().then(() => {
        quiet = true;
      });
      await vi.advanceTimersByTimeAsync(4000);
      expect(quiet).toBe(false);
      await vi.advanceTimersByTimeAsync(1000);
      expect(turnEnded).toBe(true);
      expect(quiet).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
