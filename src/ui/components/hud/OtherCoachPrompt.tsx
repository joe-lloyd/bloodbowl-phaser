import { stepPromptLine } from "./otherCoachText";
import { useState } from "react";
import { type IEventBus } from "../../../services/EventBus";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { GameEventNames, type StepPrompt } from "../../../types/events";
import { useEventBus } from "../../hooks/useEventBus";
import { Panel } from "../componentWarehouse/HudKit";

export function OtherCoachPrompt({ eventBus }: { eventBus: IEventBus }) {
  const [prompt, setPrompt] = useState<StepPrompt | null>(null);
  const clear = () => {
    setPrompt(null);
  };
  useEventBus(eventBus, GameEventNames.RemotePromptChanged, setPrompt);
  useEventBus(eventBus, GameEventNames.TurnStarted, clear);
  useEventBus(eventBus, GameEventNames.TurnEnded, clear);
  useEventBus(eventBus, GameEventNames.GameStateRestored, clear);

  useEventBus(eventBus, GameEventNames.DecisionRequested, clear);
  useEventBus(eventBus, GameEventNames.UI_OtherCoachMoveResolved, (moved) => {
    setPrompt((open) => (open?.playerId === moved.playerId ? null : open));
  });

  if (!prompt || !ServiceContainer.isInitialized()) return null;
  const game = ServiceContainer.getInstance().gameService;
  const teamId = game.getPlayerById(prompt.playerId)?.teamId;
  const team = teamId ? game.getTeam(teamId) : undefined;
  if (!team) return null;
  return (
    <Panel
      accent="info"
      data-testid="other-coach-prompt"
      aria-live="polite"
      className="pointer-events-none w-full px-3 py-2 font-hud-label text-hud-base font-bold text-hud-bone"
    >
      {stepPromptLine(team.name, prompt)}
    </Panel>
  );
}
