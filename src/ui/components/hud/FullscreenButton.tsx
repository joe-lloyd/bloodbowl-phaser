import { useEffect, useState } from "react";

/**
 * Full screen, then landscape where the browser lets a page lock it. Only
 * a page in full screen may lock, and iPhone Safari allows neither, so
 * each step is a request that may be refused.
 */
export async function goFullscreenLandscape(): Promise<void> {
  try {
    if (!document.fullscreenElement)
      await document.documentElement.requestFullscreen({
        navigationUI: "hide",
      });
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (orientation: "landscape") => Promise<void>;
    };
    await orientation.lock?.("landscape");
  } catch {
    // Refused: the rotate prompt still asks the coach to turn the phone
  }
}

/** The phone layout's corner button for full screen, where there is one. */
export function FullscreenButton() {
  const [full, setFull] = useState(
    () => typeof document !== "undefined" && !!document.fullscreenElement
  );
  useEffect(() => {
    const update = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
  if (typeof document === "undefined" || !document.fullscreenEnabled)
    return null;
  return (
    <button
      type="button"
      data-testid="fullscreen-toggle"
      aria-label={full ? "Leave full screen" : "Full screen"}
      onClick={() =>
        full ? void document.exitFullscreen() : void goFullscreenLandscape()
      }
      className="hud-slab flex h-11 w-11 items-center justify-center text-hud-lg text-hud-bone pointer-events-auto"
    >
      {full ? "⤡" : "⤢"}
    </button>
  );
}
