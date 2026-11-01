import { useMediaQuery } from "../../hooks/useMediaQuery";
import {
  PHONE_QUERY,
  PORTRAIT_QUERY,
} from "../../../game/presentation/phoneLayout";
import { goFullscreenLandscape } from "./FullscreenButton";
import { hudButtonClass } from "../componentWarehouse/HudKit";

/**
 * Over the match on a phone held upright: the pitch is 20 squares long, so
 * the match plays in landscape only. Where the browser allows it (Android),
 * a button goes full screen and locks landscape.
 */
export function RotatePrompt() {
  const phone = useMediaQuery(PHONE_QUERY);
  const portrait = useMediaQuery(PORTRAIT_QUERY);
  if (!phone || !portrait) return null;
  const canLock =
    typeof document !== "undefined" && document.fullscreenEnabled === true;
  return (
    <div
      data-testid="rotate-prompt"
      role="alertdialog"
      aria-label="Turn your phone sideways"
      className="fixed inset-0 z-[10000] flex flex-col items-center justify-center gap-5 bg-hud-ink px-8 text-center pointer-events-auto"
      style={{
        paddingTop: "max(2rem, env(safe-area-inset-top))",
        paddingBottom: "max(2rem, env(safe-area-inset-bottom))",
      }}
    >
      <div
        aria-hidden
        className="h-[110px] w-16 rounded-xl border-4 border-hud-bone motion-safe:animate-[rotate-hint_2.2s_ease-in-out_infinite]"
      />
      <p className="font-hud-display text-hud-2xl uppercase text-hud-bone">
        Turn your phone
        <br />
        sideways
      </p>
      <p className="max-w-[260px] font-hud-body text-hud-sm text-hud-dim">
        The pitch is 20 squares long. The match plays in landscape only.
      </p>
      {canLock && (
        <button
          type="button"
          onClick={() => void goFullscreenLandscape()}
          className={hudButtonClass("primary", "md")}
        >
          Full screen
        </button>
      )}
    </div>
  );
}
