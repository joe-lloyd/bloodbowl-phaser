import { useEffect, useState } from "react";
import { type IEventBus } from "../../../services/EventBus";
import { GameEventNames } from "../../../types/events";
import { useEventBus } from "../../hooks/useEventBus";
import { refusalMessage } from "../../../network/OwnershipGate";

export const REFUSAL_SHOW_MS = 4000;

export function RefusalNotice({ eventBus }: { eventBus: IEventBus }) {
  const [refusal, setRefusal] = useState<{ text: string; at: number } | null>(
    null
  );

  useEventBus(eventBus, GameEventNames.NetworkCommandRejected, (data) => {
    setRefusal({ text: refusalMessage(data.reason), at: Date.now() });
  });

  useEffect(() => {
    if (!refusal) return;
    const timer = setTimeout(() => {
      setRefusal(null);
    }, REFUSAL_SHOW_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [refusal]);

  if (!refusal) return null;

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
