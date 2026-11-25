import { DiceWatch } from "../../../game/presentation/diceWatch";
import { DecisionTeam } from "./DecisionTeam";
import React, { useState, useEffect } from "react";
import type { EventBus } from "../../../services/EventBus";
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
  `${attackerId}:${String(x)},${String(y)}`;

export const FollowUpDialog: React.FC<FollowUpDialogProps> = ({ eventBus }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [followUpData, setFollowUpData] = useState<FollowUpOffer | null>(null);

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

  const [, setPolled] = useState(0);
  useEffect(() => {
    if (!isOpen || !getActiveOnlineMatch()) return;
    const id = setInterval(() => {
      setPolled((tick) => tick + 1);
    }, 400);
    return () => {
      clearInterval(id);
    };
  }, [isOpen]);

  const match = getActiveOnlineMatch();
  const pending = match?.pendingDecision();
  const offer = match
    ? pending?.type === "follow-up" && presented.includes(offerKey(pending))
      ? pending
      : null
    : followUpData;

  const handleYes = () => {
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

  if (!isOpen || !offer || match?.mayAct() === false) return null;

  return (
    <FollowUpDialogView
      offer={offer}
      handleNo={handleNo}
      handleYes={handleYes}
    />
  );
};

interface FollowUpDialogViewProps {
  offer: FollowUpOffer;
  handleNo: () => void;
  handleYes: () => void;
}
function FollowUpDialogView({
  offer,
  handleNo,
  handleYes,
}: FollowUpDialogViewProps) {
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
            hotkey="n"
            onClick={handleNo}
          >
            NO
          </HudButton>
          <HudButton
            data-testid="follow-up-yes"
            variant="primary"
            hotkey="y"
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
}
