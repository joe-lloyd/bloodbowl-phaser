import { fixtureValue } from "../../src/testing/fixtureValue";
import { expect, vi } from "vitest";
import { type OnlineMatch } from "../../src/network/OnlineMatch";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { shoppingTeamId } from "../../src/game/inducements/pregame";
import { pairSeating, pairTeams } from "../../src/game/seating";
import { type IEventBus } from "../../src/services/EventBus";
import { rootEventBus } from "../../src/services/scopedEventBus";
import { GameEventNames } from "../../src/types/events";

const rolling = new WeakSet<IEventBus>();

export function rollKickoffsAtOnce(eventBus: IEventBus): void {
  const root = rootEventBus(eventBus);
  if (rolling.has(root)) return;
  rolling.add(root);
  const ack = ({ presentationId }: { presentationId: string }) => {
    root.emit(GameEventNames.UI_PresentationAcknowledged, {
      id: presentationId,
    });
  };
  root.on(GameEventNames.KickoffTableReady, ack);
  root.on(GameEventNames.KickoffTableRolled, ack);
}

export async function confirmComputerPregame(
  match: OnlineMatch
): Promise<void> {
  const service = () => ServiceContainer.getInstance().gameService;
  const pregame = () => fixtureValue(service().getState().pregameInducements);
  const [team1, team2] = pairTeams(pairSeating(service().getSeating()));
  rollKickoffsAtOnce(ServiceContainer.getInstance().eventBus);

  for (const team of [team1, team2]) service().readyForWeather(team.id);
  await vi.waitFor(() => {
    expect(Object.values(pregame().ready).filter(Boolean)).toHaveLength(2);
  });

  if (shoppingTeamId(pregame(), [team1.id, team2.id]) === match.myTeamId) {
    const confirmed = await match.run({
      type: "confirm-inducements",
      teamId: match.myTeamId,
    });
    expect(confirmed.ok).toBe(true);
  }
  await vi.waitFor(
    () => {
      expect(pregame().complete).toBe(true);
    },
    { timeout: 5000 }
  );
}
