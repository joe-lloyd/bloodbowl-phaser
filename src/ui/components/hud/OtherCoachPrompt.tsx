import { useState } from "react";
import { IEventBus } from "../../../services/EventBus";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { GameEventNames, StepPrompt } from "../../../types/events";
import { percent } from "../../../game/rules/rollOdds";
import { useEventBus } from "../../hooks/useEventBus";
import { Panel } from "../componentWarehouse/HudKit";

const ROLL_NAMES: Record<StepPrompt["rolls"][number]["type"], string> = {
  dodge: "Dodge",
  rush: "Rush",
  pickup: "Pick up",
};

/** "Orc Founders: Rush 2+ (83%)", or both rolls of a Rush and Dodge. */
export function stepPromptLine(teamName: string, prompt: StepPrompt): string {
  const rolls = prompt.rolls
    .map((roll) => `${ROLL_NAMES[roll.type]} ${roll.target}+`)
    .join(", then ");
  return `${teamName}: ${rolls} (${percent(prompt.chance)})`;
}

/**
 * Online, on the waiting coach's screen: the Dodge, Rush or Pick up prompt
 * the other coach has open, read-only, in the decision dock. Block and
 * re-roll decisions already show there from the engine's pending decision;
 * a step prompt opens before its command is sent, so it arrives on its own
 * cosmetic message instead.
 */
export function OtherCoachPrompt({ eventBus }: { eventBus: IEventBus }) {
  const [prompt, setPrompt] = useState<StepPrompt | null>(null);
  const clear = () => setPrompt(null);
  useEventBus(eventBus, GameEventNames.RemotePromptChanged, setPrompt);
  useEventBus(eventBus, GameEventNames.TurnStarted, clear);
  useEventBus(eventBus, GameEventNames.TurnEnded, clear);
  useEventBus(eventBus, GameEventNames.GameStateRestored, clear);

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
