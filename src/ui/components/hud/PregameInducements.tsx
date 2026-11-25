import { useEffect, useRef, type ReactNode } from "react";
import { usePregameCommand, usePregameInducements } from "./pregameInducementHooks";
import type { EventBus } from "../../../services/EventBus";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";
import { affordsInducement } from "../../../game/inducements/rules";
import { shoppingTeamId } from "../../../game/inducements/pregame";
import { WaitingLine } from "../componentWarehouse/HudBanner";
import { HudButton, Notice } from "../componentWarehouse/HudKit";
import { OpeningPanel } from "./OpeningPanel";
import { InducementSelectionPanel } from "./InducementSelectionPanel";

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
    return pregame.offer &&
      !affordsInducement(
        pregame.offer.catalogs[shopper] ?? [],
        pregame.offer.budgets[shopper] ?? 0
      ) ? (
      <SkippedInducements key={shopper} teamId={shopper} onChanged={refresh} />
    ) : (
      <InducementSelectionPanel
        key={shopper}
        teamId={shopper}
        onChanged={refresh}
      />
    );
  if (pregame.complete) return null;
  const buyer = shopper ? service.getTeam(shopper) : undefined;
  return (
    <PregameDialog>
      <WaitingLine>
        {buyer
          ? `Waiting for ${buyer.name}…`
          : "Waiting for both coaches to ready up…"}
      </WaitingLine>
    </PregameDialog>
  );
}

function PregameDialog({ children }: { children: ReactNode }) {
  return (
    <OpeningPanel zClass="z-[100]" title="PRE-MATCH">
      {children}
    </OpeningPanel>
  );
}

function SkippedInducements({
  teamId,
  onChanged,
}: {
  teamId: string;
  onChanged: () => void;
}) {
  const { error, run } = usePregameCommand(onChanged);
  const skip = () =>
    void run(() =>
      ServiceContainer.getInstance().gameService.confirmInducements(teamId)
    );
  const first = useRef(skip);
  useEffect(() => {
    first.current();
  }, []);
  if (!error) return null;
  return (
    <PregameDialog>
      <Notice tone="bad" role="alert" className="mb-3">
        {error}
      </Notice>
      <HudButton variant="primary" size="lg" block onClick={skip}>
        Continue
      </HudButton>
    </PregameDialog>
  );
}
