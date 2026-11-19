import { vi } from "vitest";
import type { HeadlessGame } from "../../src/headless/HeadlessGame";
import type { HeadlessCommand } from "../../src/headless/protocol";

export const wait = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const flushPromises = () =>
  new Promise((resolve) => setImmediate(resolve));

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

export const buttonLabel = (button: Element | null | undefined) => {
  if (!button) return undefined;
  const words = button.cloneNode(true) as Element;
  words.querySelectorAll("kbd").forEach((badge) => {
    badge.remove();
  });
  return words.textContent;
};

export const foulAddingAllAssists = async (
  game: HeadlessGame,
  command: Extract<HeadlessCommand, { type: "foul" }>
) => {
  const response = await game.execute(command);
  const pending = response.pendingDecision;
  if (pending?.type !== "foul-assists") return response;
  const reply = await game.execute({
    type: "choose-foul-assists",
    count: pending.available,
  });
  return { ...reply, events: [...response.events, ...reply.events] };
};
