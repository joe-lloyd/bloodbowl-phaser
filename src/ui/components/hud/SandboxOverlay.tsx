import React from "react";
import { useNavigate } from "react-router-dom";
import { EventBus } from "../../../services/EventBus";
import { useEventEmit } from "../../hooks/useEventBus";
import { SCENARIOS } from "../../../data/scenarios";
import { Button } from "../componentWarehouse/Button";
import { GameEventNames } from "@/types/events";

interface SandboxOverlayProps {
  eventBus: EventBus;
}

export function SandboxOverlay({ eventBus }: SandboxOverlayProps) {
  const emit = useEventEmit(eventBus);
  const navigate = useNavigate();

  return (
    <div className="absolute top-24 right-4 w-64 bg-bb-warm-paper border-2 border-bb-gold rounded-lg p-4 shadow-lg pointer-events-auto z-50">
      <h3 className="text-bb-blood-red font-bold font-heading mb-4 text-center border-b border-bb-divider pb-2">
        SANDBOX TOOLS
      </h3>
      <div className="flex flex-col gap-2">
        <p className="text-xs text-bb-muted-text text-center italic mb-2">
          Select a scenario to reset state
        </p>
        {SCENARIOS.map((s) => (
          <Button
            key={s.id}
            onClick={() =>
              emit(GameEventNames.UI_LoadScenario, { scenarioId: s.id })
            }
            className="text-sm py-2 px-3 text-left justify-start"
          >
            {s.name}
          </Button>
        ))}

        <hr className="border-bb-divider my-2 opacity-50" />

        <Button
          onClick={() => navigate("/")}
          className="text-sm py-2 bg-gray-600 hover:bg-gray-500 border-gray-400"
        >
          EXIT SANDBOX
        </Button>
      </div>
    </div>
  );
}
