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

export const FollowUpDialog: React.FC<FollowUpDialogProps> = ({ eventBus }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [followUpData, setFollowUpData] = useState<{
    attackerId: string;
    targetSquare: { x: number; y: number };
  } | null>(null);

  useEffect(() => {
    const dice = new DiceWatch(eventBus);
    let generation = 0;
    const onFollowUpPrompt = (data: {
      attackerId: string;
      targetSquare: { x: number; y: number };
    }) => {
      const current = ++generation;
      void dice.landed().then(() => {
        if (current !== generation) return;
        setFollowUpData(data);
        setIsOpen(true);
      });
    };

    // The other coach may be the one who answers
    const onResolved = ({ type }: { type: string }) => {
      if (type !== "follow-up") return;
      generation++;
      setIsOpen(false);
      setFollowUpData(null);
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

  const handleYes = () => {
    // Online: the follow-up belongs to the attacking coach
    if (getActiveOnlineMatch()?.mayAct() === false) return;
    if (followUpData) {
      eventBus.emit(GameEventNames.UI_FollowUpResponse, {
        attackerId: followUpData.attackerId,
        followUp: true,
        targetSquare: followUpData.targetSquare,
      });
    }
    setIsOpen(false);
    setFollowUpData(null);
  };

  const handleNo = () => {
    if (getActiveOnlineMatch()?.mayAct() === false) return;
    if (followUpData) {
      eventBus.emit(GameEventNames.UI_FollowUpResponse, {
        attackerId: followUpData.attackerId,
        followUp: false,
      });
    }
    setIsOpen(false);
    setFollowUpData(null);
  };

  // Online, only the coach who owns the decision sees it; the other
  // coach has the "Waiting for…" banner
  if (!isOpen || !followUpData || getActiveOnlineMatch()?.mayAct() === false)
    return null;

  return (
    <DialogShell
      placement="dock"
      eyebrow={<DecisionTeam playerId={followUpData.attackerId} />}
      testId="follow-up-dialog"
      title="Follow Up?"
      width="w-[400px]"
      actions={
        <DialogActions>
          <HudButton data-testid="follow-up-no" variant="ghost" onClick={handleNo}>
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
