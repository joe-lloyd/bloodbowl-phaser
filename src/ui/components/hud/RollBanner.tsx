import { useState } from "react";
import type { IEventBus } from "../../../services/EventBus";
import { GameEventNames } from "../../../types/events";
import { useEventBus } from "../../hooks/useEventBus";
import { RollPresentation, type RollBannerText } from "./rollBannerState";
export function RollBanner({
  eventBus,
  phone = false,
}: {
  eventBus: IEventBus;
  phone?: boolean;
}) {
  const [banner, setBanner] = useState<RollBannerText | null>(null);
  const [presentation] = useState(() => new RollPresentation(setBanner));
  useEventBus(eventBus, GameEventNames.ArmorRolled, presentation.onArmour);
  useEventBus(eventBus, GameEventNames.InjuryRolled, presentation.onInjury);
  useEventBus(eventBus, GameEventNames.UI_DiceThrow, presentation.onThrow);
  useEventBus(eventBus, GameEventNames.UI_PresentMoment, presentation.onMoment);
  useEventBus(eventBus, GameEventNames.PhaseChanged, presentation.onPhase);
  if (!banner) return null;
  return phone ? <PhoneBanner {...banner} /> : <BroadcastBanner {...banner} />;
}

function PhoneBanner({ headline, subtitle, result }: RollBannerText) {
  return (
    <div
      data-testid="roll-banner"
      data-result={result ? "" : undefined}
      className={`max-w-full border-y-2 bg-hud-ink/85 px-3 py-1 text-center ${
        result ? "border-hud-gold" : "border-white/30"
      }`}
    >
      <p
        className={`font-hud-display text-hud-lg uppercase leading-tight tracking-[0.04em] ${
          result ? "text-hud-bone" : "text-hud-dim"
        }`}
      >
        {headline}
      </p>
      <p className="font-hud-label text-hud-sm font-bold leading-tight text-hud-bone">
        {subtitle}
      </p>
    </div>
  );
}

function BroadcastBanner({ headline, subtitle, result }: RollBannerText) {
  return (
    <div
      data-testid="roll-banner"
      data-result={result ? "" : undefined}
      className="pointer-events-none absolute inset-x-0 top-[18%] z-[210] flex select-none justify-center animate-hud-in"
    >
      <div className="flex flex-col items-center">
        <div
          className={`max-w-[calc(100vw-48px)] -skew-x-12 border-y-2 px-10 py-2 shadow-hud ${
            result
              ? "border-hud-gold bg-hud-ink/95"
              : "border-white/30 bg-hud-ink/85"
          }`}
        >
          <span
            className={`block skew-x-12 text-center font-hud-display text-hud-3xl uppercase tracking-[0.04em] [text-shadow:0_3px_0_theme(colors.hud.ink)] ${
              result ? "text-hud-bone" : "text-hud-dim"
            }`}
          >
            {headline}
          </span>
        </div>
        {subtitle && (
          <div className="max-w-[min(900px,calc(100vw-48px))] -mt-px -skew-x-12 bg-hud-blood px-6 py-1">
            <span className="block skew-x-12 text-center font-hud-label text-hud-lg font-bold tracking-[0.04em] text-white">
              {subtitle}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
