import React, { useEffect, useState } from "react";
import { IEventBus } from "../../../services/EventBus";
import { GameEventNames } from "../../../types/events";
import { useEventBus } from "../../hooks/useEventBus";
import { refusalMessage } from "../../../network/OwnershipGate";

/** How long a refusal stays up. */
export const REFUSAL_SHOW_MS = 4000;

/**
 * Online: tells this coach why the game refused their last command, such as
 * a click that landed just after the turn clock ended the turn. Only this
 * coach's own commands raise NetworkCommandRejected.
 */
export function RefusalNotice({ eventBus }: { eventBus: IEventBus }) {
  const [refusal, setRefusal] = useState<{ text: string; at: number } | null>(
    null
  );

  useEventBus(eventBus, GameEventNames.NetworkCommandRejected, (data) =>
    setRefusal({ text: refusalMessage(data.reason), at: Date.now() })
  );

  useEffect(() => {
    if (!refusal) return;
    const timer = setTimeout(() => setRefusal(null), REFUSAL_SHOW_MS);
    return () => clearTimeout(timer);
  }, [refusal]);

  if (!refusal) return null;
  // Centred by flex: the entry animation sets transform, so a translate
  // would be overwritten.
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[14.5rem] z-[92] flex justify-center">
      <div
        role="alert"
        data-testid="refusal-notice"
        className="hud-slab border-l-[3px] border-l-hud-bad px-5 py-2 font-hud-body text-hud-base text-hud-bone animate-hud-in"
      >
        {refusal.text}
      </div>
    </div>
  );
}
