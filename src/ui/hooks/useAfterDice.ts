import { useEffect, useState } from "react";
import { type IEventBus } from "../../services/EventBus";
import { DiceWatch } from "../../game/presentation/diceWatch";

export function useAfterDice<T>(
  eventBus: IEventBus,
  value: T | null
): T | null {
  const dice = DiceWatch.shared(eventBus);
  const [landed, setLanded] = useState<T | null>(null);
  useEffect(() => {
    if (value === null) return;
    let live = true;
    void dice.landed().then(() => {
      if (live) setLanded(() => value);
    });
    return () => {
      live = false;
    };
  }, [dice, value]);
  return value !== null && landed === value ? value : null;
}
