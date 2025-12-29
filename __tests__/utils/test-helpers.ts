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
