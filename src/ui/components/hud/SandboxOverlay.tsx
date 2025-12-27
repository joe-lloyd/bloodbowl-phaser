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

  const handleScenarioChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const scenarioId = e.target.value;
    if (scenarioId) {
      emit(GameEventNames.UI_LoadScenario, { scenarioId });
    }
  };

  return (
    <div className="w-full bg-bb-warm-paper border-2 border-bb-gold rounded-lg p-3 shadow-lg pointer-events-auto">
      <h3 className="text-bb-blood-red font-bold font-heading text-sm mb-2 text-center border-b border-bb-divider pb-1">
        SANDBOX
      </h3>
      <div className="flex flex-col gap-2">
        <select
          onChange={handleScenarioChange}
          className="w-full px-2 py-1.5 text-sm bg-bb-parchment border-2 border-bb-gold rounded font-heading text-bb-text cursor-pointer hover:border-bb-blood-red transition-colors pointer-events-auto"
          defaultValue=""
        >
          <option value="" disabled>
            Select Scenario
          </option>
          {SCENARIOS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <Button
          onClick={() => navigate("/")}
          className="text-xs py-1.5 bg-gray-600 hover:bg-gray-500 border-gray-400"
        >
          EXIT
        </Button>
      </div>
    </div>
  );
}
