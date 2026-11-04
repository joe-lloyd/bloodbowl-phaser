import { DiceWatch } from "../../../game/presentation/diceWatch";
import { DecisionTeam } from "./DecisionTeam";
import React, { useState, useEffect } from "react";
import { EventBus } from "../../../services/EventBus";
import { GameEventNames } from "@/types/events";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";
import {
  DialogActions,
  DialogShell,
  HudButton,
} from "../componentWarehouse/HudKit";

interface FollowUpDialogProps {
  eventBus: EventBus;
}

interface FollowUpOffer {
  attackerId: string;
  targetSquare: { x: number; y: number };
}

const offerKey = ({ attackerId, targetSquare: { x, y } }: FollowUpOffer) =>
  `${attackerId}:${x},${y}`;

export const FollowUpDialog: React.FC<FollowUpDialogProps> = ({ eventBus }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [followUpData, setFollowUpData] = useState<FollowUpOffer | null>(null);
  // Offers whose dice have landed since the last follow-up was answered.
  const [presented, setPresented] = useState<readonly string[]>([]);

  useEffect(() => {
    const dice = new DiceWatch(eventBus);
    let generation = 0;
    const onFollowUpPrompt = (data: FollowUpOffer) => {
      const current = generation;
      void dice.landed().then(() => {
        if (current !== generation) return;
        setFollowUpData(data);
        setPresented((keys) => [...keys, offerKey(data)]);
        setIsOpen(true);
      });
    };

    // The other coach may be the one who answers
    const onResolved = ({ type }: { type: string }) => {
      if (type !== "follow-up") return;
      generation++;
      setIsOpen(false);
      setFollowUpData(null);
      setPresented([]);
    };
    eventBus.on(GameEventNames.UI_FollowUpPrompt, onFollowUpPrompt);
    eventBus.on(GameEventNames.DecisionResolved, onResolved);

    return () => {
      generation++;
      dice.dispose();
      eventBus.off(GameEventNames.UI_FollowUpPrompt, onFollowUpPrompt);
      eventBus.off(GameEventNames.DecisionResolved, onResolved);
    };
  }, [eventBus]);

  // Another decision can hold this one, then hand it back with no event.
  const [, setPolled] = useState(0);
  useEffect(() => {
    if (!isOpen || !getActiveOnlineMatch()) return;
    const id = setInterval(() => setPolled((tick) => tick + 1), 400);
    return () => clearInterval(id);
  }, [isOpen]);

  // In a match the pending decision is the offer, once its own prompt has
  // landed: a repeat on the board can be late, for an earlier block.
  const match = getActiveOnlineMatch();
  const pending = match?.pendingDecision();
  const offer = match
    ? pending?.type === "follow-up" && presented.includes(offerKey(pending))
      ? pending
      : null
    : followUpData;

  const handleYes = () => {
    // Online: the follow-up belongs to the attacking coach
    if (getActiveOnlineMatch()?.mayAct() === false) return;
    if (offer) {
      eventBus.emit(GameEventNames.UI_FollowUpResponse, {
        attackerId: offer.attackerId,
        followUp: true,
        targetSquare: offer.targetSquare,
      });
    }
    setIsOpen(false);
    setFollowUpData(null);
  };

  const handleNo = () => {
    if (getActiveOnlineMatch()?.mayAct() === false) return;
    if (offer) {
      eventBus.emit(GameEventNames.UI_FollowUpResponse, {
        attackerId: offer.attackerId,
        followUp: false,
      });
    }
    setIsOpen(false);
    setFollowUpData(null);
  };

  // Online, only the coach who owns the decision sees it; the other
  // coach has the "Waiting for…" banner
  if (!isOpen || !offer || match?.mayAct() === false) return null;

  return (
    <DialogShell
      placement="dock"
      eyebrow={<DecisionTeam playerId={offer.attackerId} />}
      testId="follow-up-dialog"
      title="Follow Up?"
      width="w-[400px]"
      actions={
        <DialogActions>
          <HudButton
            data-testid="follow-up-no"
            variant="ghost"
            onClick={handleNo}
          >
            NO
          </HudButton>
          <HudButton
            data-testid="follow-up-yes"
            variant="gold"
            onClick={handleYes}
          >
            YES
          </HudButton>
        </DialogActions>
      }
    >
      <p>Do you want to follow up into the defender&apos;s square?</p>
    </DialogShell>
  );
};
