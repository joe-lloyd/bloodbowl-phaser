import { useEffect, useState } from "react";
import { IEventBus } from "../../services/EventBus";
import { DiceWatch } from "../../game/presentation/diceWatch";

/**
 * Holds a value back until the dice thrown before it have landed, then
 * passes it through. A decision that follows a roll names the roll's
 * result, so it must not show while that die still tumbles in the tray.
 * Null passes at once, so a dialog still closes the moment it is answered.
 * With no tray nothing is in the air and the value shows straight away.
 */
export function useAfterDice<T>(eventBus: IEventBus, value: T | null): T | null {
  // Follow the tray from mount, so a throw just before the value is counted
  const dice = DiceWatch.shared(eventBus);
  const [landed, setLanded] = useState<T | null>(null);
  useEffect(() => {
    if (value === null) return;
    let live = true;
    void dice
      .landed()
      .then(() => {
        if (live) setLanded(() => value);
      });
    return () => {
      live = false;
    };
  }, [dice, value]);
  return value !== null && landed === value ? value : null;
}
