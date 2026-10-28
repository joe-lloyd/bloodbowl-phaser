import { vi } from "vitest";

/**
 * Wait for a specified amount of time (for async operations)
 */
export const wait = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Flush promises to ensure all pending microtasks are completed
 */
export const flushPromises = () =>
  new Promise((resolve) => setImmediate(resolve));

/**
 * Mock Request Animation Frame for Phaser updates
 */
export const mockRaf = () => {
  let lastTime = 0;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation(
    (callback: FrameRequestCallback) => {
      const currTime = Date.now();
      const timeToCall = Math.max(0, 16 - (currTime - lastTime));
      const id = window.setTimeout(() => {
        callback(currTime + timeToCall);
      }, timeToCall);
      lastTime = currTime + timeToCall;
      return id;
    }
  );
};

/**
 * Force the next die results a headless game rolls, in order, then fall back
 * to its seeded RNG. Every die in the engine comes off `rollMultipleDice`.
 */
export const forceDice = (
  rng: { rollMultipleDice(count: number, sides: number): number[] },
  values: number[]
) => {
  const queue = [...values];
  const real = rng.rollMultipleDice.bind(rng);
  vi.spyOn(rng, "rollMultipleDice").mockImplementation((count, sides) =>
    Array.from({ length: count }, () => queue.shift() ?? real(1, sides)[0])
  );
};
