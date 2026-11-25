import { useState } from "react";
import type { IEventBus } from "../../../services/EventBus";
import { GameEventNames } from "../../../types/events";
import { useEventBus } from "../../hooks/useEventBus";
import { BroadcastBanner } from "../componentWarehouse/HudBanner";
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
  return phone ? <PhoneBanner {...banner} /> : <DesktopBanner {...banner} />;
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

function DesktopBanner({ headline, subtitle, result }: RollBannerText) {
  return (
    <div
      data-testid="roll-banner"
      data-result={result ? "" : undefined}
      className="pointer-events-none absolute inset-x-0 top-[18%] z-[210] flex select-none justify-center animate-hud-in"
    >
      <BroadcastBanner
        headline={headline}
        subtitle={subtitle}
        tone={result ? "strong" : "quiet"}
      />
    </div>
  );
}
