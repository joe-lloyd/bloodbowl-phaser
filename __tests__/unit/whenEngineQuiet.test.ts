import { describe, it, expect } from "vitest";
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
    expect(Date.now() - start).toBeLessThan(50);
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
});
