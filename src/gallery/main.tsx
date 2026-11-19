import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "../ui/styles/global.css";
import { setupMatch } from "./fixtures";
import { type Variant, VARIANTS } from "./variants";
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
          variant.stage === "page"
            ? undefined
            : "linear-gradient(rgba(8,9,11,0.35), rgba(8,9,11,0.55)), url(./shots/pitch.jpg)",
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
  variant ? <Stage variant={variant} /> : <GalleryIndex />
);
