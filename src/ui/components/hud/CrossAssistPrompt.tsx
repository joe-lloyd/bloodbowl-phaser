import { useState } from "react";
import type { EventBus } from "../../../services/EventBus";
import type {
  AssistSide,
  CrossAssistDecisionRequest,
} from "../../../types/decisions";
import { useGameDecision } from "../../hooks/useDecisionRequest";
import {
  DialogActions,
  DialogShell,
  HudButton,
} from "../componentWarehouse/HudKit";
import { DecisionTeam } from "./DecisionTeam";

type Pledges = Readonly<Record<string, AssistSide>>;

const SIDE_LABEL: Record<AssistSide, string> = {
  attacker: "Attacker",
  defender: "Defender",
};

function loanOf(pledges: Pledges) {
  const lent = Object.entries(pledges);
  const to = (side: AssistSide) =>
    lent.filter(([, chosen]) => chosen === side).map(([playerId]) => playerId);
  return { toAttacker: to("attacker"), toDefender: to("defender") };
}

export function CrossAssistPrompt({ eventBus }: { eventBus: EventBus }) {
  const [pledges, setPledges] = useState<Pledges>({});
  const decision = useGameDecision(eventBus, {
    type: "cross-assist",
    onChange: () => {
      setPledges({});
    },
  });
  if (!decision) return null;
  const { request, gameService, name } = decision;
  const team = (playerId: string) => {
    const teamId = gameService.getPlayerById(playerId)?.teamId;
    return (teamId && gameService.getTeam(teamId)?.name) ?? "";
  };
  const toggle = (playerId: string, side: AssistSide) => {
    const { [playerId]: chosen, ...rest } = pledges;
    setPledges(chosen === side ? rest : { ...rest, [playerId]: side });
  };
  const send = (chosen: Pledges) => {
    decision.answer(() => gameService.answerCrossAssists(loanOf(chosen)));
  };
  return (
    <CrossAssistView
      request={request}
      pledges={pledges}
      label={(playerId) => `${name(playerId)} (${team(playerId)})`}
      toggle={toggle}
      send={send}
    />
  );
}

interface OfferProps {
  request: CrossAssistDecisionRequest;
  pledges: Pledges;
  label: (playerId: string) => string;
  toggle: (playerId: string, side: AssistSide) => void;
}

function CrossAssistView({
  send,
  ...offers
}: OfferProps & { send: (pledges: Pledges) => void }) {
  const { request, pledges, label } = offers;
  const lent = Object.keys(pledges).length;
  const verb = request.action === "block" ? "blocks" : "fouls";
  return (
    <DialogShell
      placement="dock"
      testId="cross-assist-prompt"
      eyebrow={<DecisionTeam teamId={request.chooserTeamId} />}
      title="Lend an assist?"
      actions={
        <DialogActions>
          <HudButton
            data-testid="cross-assist-none"
            variant="ghost"
            onClick={() => {
              send({});
            }}
          >
            No assists
          </HudButton>
          <HudButton
            data-testid="cross-assist-lend"
            variant="primary"
            disabled={lent === 0}
            onClick={() => {
              send(pledges);
            }}
          >
            Lend {lent}
          </HudButton>
        </DialogActions>
      }
    >
      <p>
        {label(request.attackerId)} {verb} {label(request.defenderId)}. Your
        players next to them may assist either side.
      </p>
      <OfferList {...offers} />
    </DialogShell>
  );
}

function OfferList({ request, pledges, label, toggle }: OfferProps) {
  return (
    <ul className="mt-2 flex flex-col gap-1.5">
      {request.offers.map((offer) => (
        <li key={offer.playerId} className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate">
            {label(offer.playerId)}
          </span>
          {offer.sides.map((side) => (
            <HudButton
              key={side}
              data-testid={`cross-assist-${offer.playerId}-${side}`}
              size="sm"
              variant={pledges[offer.playerId] === side ? "selected" : "ghost"}
              aria-pressed={pledges[offer.playerId] === side}
              onClick={() => {
                toggle(offer.playerId, side);
              }}
            >
              {SIDE_LABEL[side]}
            </HudButton>
          ))}
        </li>
      ))}
    </ul>
  );
}
