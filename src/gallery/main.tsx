import { createRoot } from "react-dom/client";
import "../ui/styles/global.css";
import { frame, touchStyles } from "./isolate";
import { VARIANTS } from "./variants";
import { GalleryIndex } from "./GalleryIndex";
import { ShowOne, Stage } from "./Stage";
import { isFrameSize } from "./frames";

const size = frame.get("size");
const variant = VARIANTS.find(
  (v) => v.id === (frame.get("v") ?? frame.get("show"))
);

function page() {
  if (!variant) return <GalleryIndex />;
  if (frame.has("v")) return <Stage variant={variant} />;
  return (
    <ShowOne
      variant={variant}
      initialSize={isFrameSize(size) ? size : "desktop"}
    />
  );
}

if (size === "phone") touchStyles();
document.documentElement.style.colorScheme = "dark";
document.body.className = "m-0 bg-hud-ink font-hud-body text-hud-bone";

const root = document.getElementById("root");
if (root) createRoot(root).render(page());
