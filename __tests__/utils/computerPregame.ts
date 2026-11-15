import { expect, vi } from "vitest";
import { OnlineMatch } from "../../src/network/OnlineMatch";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { shoppingTeamId } from "../../src/game/inducements/pregame";

/** Complete the weather ready-up and purchases before exercising the match itself. */
export async function confirmComputerPregame(
  match: OnlineMatch
): Promise<void> {
  const service = () => ServiceContainer.getInstance().gameService;
  const pregame = () => service().getState().pregameInducements!;
  const [team1, team2] = service().getTeams();
  // As the weather dialog does: one coach on the screen readies both teams
  for (const team of [team1, team2]) service().readyForWeather(team.id);
  await vi.waitFor(() =>
    expect(Object.values(pregame().ready).filter(Boolean)).toHaveLength(2)
  );
  // The teams buy in turn: the computer may go first
  await vi.waitFor(() =>
    expect(shoppingTeamId(pregame(), [team1.id, team2.id])).toBe(match.myTeamId)
  );
  expect(
    (await match.run({ type: "confirm-inducements", teamId: match.myTeamId }))
      .ok
  ).toBe(true);
  await vi.waitFor(() => expect(pregame().complete).toBe(true));
}
