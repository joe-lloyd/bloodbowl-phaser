/**
 * HUD gallery: every floating HUD component, rendered for real, in the
 * variants that matter. `?v=<id>` renders one variant on a 1280-wide stage;
 * no query renders the index, which lays the variants out in iframes so
 * each one gets its own game services.
 */
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "../ui/styles/global.css";
import { setupMatch } from "./fixtures";
import { Variant, VARIANTS } from "./variants";
import { GalleryIndex } from "./GalleryIndex";

function Stage({ variant }: { variant: Variant }) {
  const [fx] = useState(() => {
    variant.prepare?.();
    return setupMatch(variant.fixture);
  });
  useEffect(() => variant.drive?.(fx) ?? undefined, [variant, fx]);
  return (
    <div
      className="relative w-[1280px] overflow-hidden bg-hud-ink bg-cover bg-center"
      style={{
        height: variant.height ?? 720,
        backgroundImage:
          "linear-gradient(rgba(8,9,11,0.35), rgba(8,9,11,0.55)), url(./shots/pitch.jpg)",
      }}
    >
      {variant.view(fx)}
    </div>
  );
}

const id = new URLSearchParams(window.location.search).get("v");
const variant = id ? VARIANTS.find((v) => v.id === id) : undefined;
document.documentElement.style.colorScheme = "dark";
document.body.className = variant
  ? "m-0 overflow-hidden bg-hud-ink"
  : "m-0 bg-hud-ink text-hud-bone font-hud-body";

createRoot(document.getElementById("root")!).render(
  // No StrictMode: its double-run setup would leave the services singleton
  // pointing at a discarded fixture.
  variant ? <Stage variant={variant} /> : <GalleryIndex />
);
