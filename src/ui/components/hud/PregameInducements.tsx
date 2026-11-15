import { usePregameInducements } from "./pregameInducementHooks";
import { EventBus } from "../../../services/EventBus";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";
import { shoppingTeamId } from "../../../game/inducements/pregame";
import { DialogShell } from "../componentWarehouse/HudKit";
import { InducementSelectionPanel } from "./InducementSelectionPanel";

/**
 * Inducements before the coin toss. Both coaches readied up for the
 * weather, so the teams now buy in turn: the coach whose turn it is gets
 * the purchase panel, and the other sees who is buying.
 */
export function PregameInducements({ eventBus }: { eventBus: EventBus }) {
  const { pregame, pending, decision, refresh } =
    usePregameInducements(eventBus);
  if (!pregame || !pending || decision || !ServiceContainer.isInitialized())
    return null;
  const service = ServiceContainer.getInstance().gameService;
  const [team1, team2] = service.getTeams();
  const shopper = shoppingTeamId(pregame, [team1.id, team2.id]);
  const match = getActiveOnlineMatch();
  const mine = !match || shopper === match.myTeamId;
  if (shopper && mine)
    return (
      <InducementSelectionPanel
        key={shopper}
        teamId={shopper}
        onChanged={refresh}
      />
    );
  const buyer = shopper ? service.getTeam(shopper) : undefined;
  return (
    <DialogShell
      zClass="z-[100]"
      title="INDUCEMENTS"
      placement="center"
      backdrop="heavy"
      width="w-[520px]"
    >
      <p role="status" className="text-hud-dim">
        {buyer
          ? `${buyer.name} is choosing inducements…`
          : pregame.complete
            ? "Preparing inducements…"
            : "Waiting for both coaches to ready up…"}
      </p>
    </DialogShell>
  );
}
