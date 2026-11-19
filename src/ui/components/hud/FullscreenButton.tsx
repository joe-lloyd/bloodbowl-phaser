import { goFullscreenLandscape } from "./fullscreen";
import { useEffect, useState } from "react";

export function FullscreenButton() {
  const [full, setFull] = useState(
    () => typeof document !== "undefined" && !!document.fullscreenElement
  );
  useEffect(() => {
    const update = () => {
      setFull(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", update);
    return () => {
      document.removeEventListener("fullscreenchange", update);
    };
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
