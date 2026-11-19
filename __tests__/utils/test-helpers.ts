import { vi } from "vitest";
import type { HeadlessGame } from "../../src/headless/HeadlessGame";
import type { HeadlessCommand } from "../../src/headless/protocol";
import { fixtureValue } from "../../src/testing/fixtureValue";

export const forceDice = (
  rng: { rollMultipleDice(count: number, sides: number): number[] },
  values: number[]
) => {
  const queue = [...values];
  const real = rng.rollMultipleDice.bind(rng);
  vi.spyOn(rng, "rollMultipleDice").mockImplementation((count, sides) =>
    Array.from(
      { length: count },
      () => queue.shift() ?? fixtureValue(real(1, sides)[0])
    )
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
