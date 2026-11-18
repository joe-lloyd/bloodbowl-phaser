import { expect, vi } from "vitest";
import { OnlineMatch } from "../../src/network/OnlineMatch";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { shoppingTeamId } from "../../src/game/inducements/pregame";
import { IEventBus } from "../../src/services/EventBus";
import { rootEventBus } from "../../src/services/scopedEventBus";
import { GameEventNames } from "../../src/types/events";

const rolling = new WeakSet<IEventBus>();

/**
 * Answer every Kick-off Table as its dialog does: roll at once, and count
 * the result as shown. A test has no HUD to press Roll.
 */
export function rollKickoffsAtOnce(eventBus: IEventBus): void {
  const root = rootEventBus(eventBus);
  if (rolling.has(root)) return;
  rolling.add(root);
  const ack = ({ presentationId }: { presentationId: string }) =>
    root.emit(GameEventNames.UI_PresentationAcknowledged, {
      id: presentationId,
    });
  root.on(GameEventNames.KickoffTableReady, ack);
  root.on(GameEventNames.KickoffTableRolled, ack);
}

/** Complete the weather ready-up and purchases before exercising the match itself. */
export async function confirmComputerPregame(
  match: OnlineMatch
): Promise<void> {
  const service = () => ServiceContainer.getInstance().gameService;
  const pregame = () => service().getState().pregameInducements!;
  const [team1, team2] = service().getTeams();
  rollKickoffsAtOnce(ServiceContainer.getInstance().eventBus);
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
