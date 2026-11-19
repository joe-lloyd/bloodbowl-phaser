import { useEffect, useState } from "react";
import { type IEventBus } from "../../services/EventBus";
import { ServiceContainer } from "../../services/ServiceContainer";
import { GameEventNames } from "../../types/events";
import { GamePhase } from "../../types/GameState";
import { useEventBus } from "../hooks/useEventBus";
import { type OnlineMatch } from "../../network/OnlineMatch";
import { DiceWatch } from "../../game/presentation/diceWatch";

const NO_TURN = new Set<GamePhase>([
  GamePhase.TOUCHDOWN,
  GamePhase.HALFTIME,
  GamePhase.GAME_OVER,
]);

export function WaitingBanner({
  match,
  eventBus,
}: {
  match: Pick<OnlineMatch, "mayAct" | "waitingLabel">;
  eventBus: IEventBus;
}) {
  const [label, setLabel] = useState<string | null>(null);
  const [moment, setMoment] = useState(false);
  useEventBus(eventBus, GameEventNames.UI_PresentMoment, (shown) => {
    setMoment(shown !== null);
  });

  const dice = DiceWatch.shared(eventBus);

  useEffect(() => {
    const tick = () => {
      if (dice.inAir()) return;
      const phase = ServiceContainer.isInitialized()
        ? ServiceContainer.getInstance().gameService.getPhase()
        : null;
      const waiting = !(phase && NO_TURN.has(phase)) && !match.mayAct();
      setLabel(waiting ? match.waitingLabel() : null);
    };
    tick();
    const interval = setInterval(tick, 400);
    return () => {
      clearInterval(interval);
    };
  }, [match, dice]);

  if (!label || moment) return null;

  return (
    <div
      data-testid="waiting-banner"
      className="hud-slab absolute top-[11.5rem] left-1/2 -translate-x-1/2 z-[90]
        pointer-events-none border-l-[3px] border-l-hud-gold px-5 py-2
        font-hud-label text-hud-lg font-bold uppercase tracking-[0.06em]
        text-hud-gold"
    >
      ⏳ {label}
    </div>
  );
}
