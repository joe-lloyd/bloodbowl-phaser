import React, { useState } from "react";
import { EventBus } from "../../../services/EventBus";
import { useEventBus } from "../../hooks/useEventBus";
import { Button, DangerButton } from "../componentWarehouse/Button";
import { SubPhase } from "../../../types/GameState";
import { GameEventNames } from "../../../types/events";

interface SetupControlsProps {
  eventBus: EventBus;
}

export const SetupControls: React.FC<SetupControlsProps> = ({ eventBus }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [activeTeam, setActiveTeam] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [subPhase, setSubPhase] = useState<SubPhase>(SubPhase.SETUP_KICKING);

  useEventBus(eventBus, GameEventNames.UI_ShowSetupControls, (data) => {
    setIsVisible(true);
    setSubPhase(data.subPhase);
    setActiveTeam(data.activeTeam);
    setIsComplete(false);
  });

  useEventBus(eventBus, GameEventNames.UI_HideSetupControls, () => {
    setIsVisible(false);
  });

  useEventBus(
    eventBus,
    GameEventNames.UI_SetupComplete,
    (complete: boolean) => {
      setIsComplete(complete);
    }
  );

  const handleAction = (action: string) => {
    eventBus.emit(GameEventNames.UI_SetupAction, { action });
  };

  if (!isVisible) return null;

  return (
    <div className="absolute top-4 left-0 w-full px-4 flex justify-between items-start pointer-events-none z-40">
      {/* Left Info Panel */}
      <div className="bg-bb-parchment border-2 border-bb-ink-blue rounded p-3 shadow-lg pointer-events-auto">
        <div className="font-heading text-bb-ink-blue text-sm uppercase">
          Setup Phase
        </div>
        <div className="text-xl font-bold text-bb-blood-red">
          {activeTeam?.name}
        </div>
        <div className="text-xs text-bb-muted-text mt-1">
          {subPhase === SubPhase.SETUP_KICKING
            ? "Set up Defense"
            : "Set up Offense"}
        </div>
      </div>

      {/* Right Controls Panel */}
      <div className="flex flex-col gap-2 pointer-events-auto">
        <div className="flex gap-2">
          <Button
            onClick={() => handleAction("default")}
            className="!py-1 !px-3 !text-xs !bg-bb-warm-paper !text-bb-ink-blue border-bb-ink-blue"
          >
            Default Formation
          </Button>
          <DangerButton
            onClick={() => handleAction("clear")}
            className="!py-1 !px-3 !text-xs"
          >
            Clear Pitch
          </DangerButton>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={() => handleAction("save")}
            className="!py-1 !px-3 !text-xs !bg-bb-warm-paper !text-bb-ink-blue border-bb-ink-blue"
          >
            Save Custom
          </Button>
          <Button
            onClick={() => handleAction("load")}
            className="!py-1 !px-3 !text-xs !bg-bb-warm-paper !text-bb-ink-blue border-bb-ink-blue"
          >
            Load Custom
          </Button>
        </div>

        <div className="mt-2">
          <Button
            onClick={() => handleAction("confirm")}
            disabled={!isComplete}
            className={`w-full shadow-lg ${
              isComplete ? "animate-pulse" : "opacity-50"
            }`}
          >
            CONFIRM SETUP
          </Button>
        </div>
      </div>
    </div>
  );
};
