import { expect, vi } from "vitest";
import { OnlineMatch } from "../../src/network/OnlineMatch";
import { ServiceContainer } from "../../src/services/ServiceContainer";

/** Complete the new ready/purchase opening before exercising the match itself. */
export async function confirmComputerPregame(
  match: OnlineMatch
): Promise<void> {
  expect(
    (await match.run({ type: "ready-inducements", teamId: match.myTeamId })).ok
  ).toBe(true);
  const state = () =>
    ServiceContainer.getInstance().gameService.getState().pregameInducements!;
  await vi.waitFor(() =>
    expect(Object.values(state().ready).filter(Boolean)).toHaveLength(2)
  );
  expect(
    (await match.run({ type: "confirm-inducements", teamId: match.myTeamId }))
      .ok
  ).toBe(true);
  await vi.waitFor(() => expect(state().complete).toBe(true));
}
