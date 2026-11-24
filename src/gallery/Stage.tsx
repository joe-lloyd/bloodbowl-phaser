import { useEffect, useState } from "react";
import { Link } from "../ui/components/common/NativeControls";
import pitch from "./pitch.jpg";
import { setupMatch } from "./fixtures";
import { Frame } from "./Frame";
import { type FrameSize } from "./frames";
import { SizeSwitch } from "./SizeSwitch";
import type { Variant } from "./variant";

const BACKDROP = `linear-gradient(rgba(8,9,11,0.35), rgba(8,9,11,0.55)), url(${pitch})`;

export function Stage({ variant }: { variant: Variant }) {
  const [fx] = useState(() => {
    variant.prepare?.();
    return setupMatch(variant.fixture);
  });
  useEffect(() => variant.drive?.(fx), [variant, fx]);
  if (variant.stage === "sheet")
    return <div data-sheet="">{variant.view(fx)}</div>;
  return (
    <div
      className="fixed inset-0 bg-hud-ink bg-cover bg-center"
      style={
        variant.stage === "page" ? undefined : { backgroundImage: BACKDROP }
      }
    >
      <div id="react-root">{variant.view(fx)}</div>
    </div>
  );
}

export function ShowOne({
  variant,
  initialSize,
}: {
  variant: Variant;
  initialSize: FrameSize;
}) {
  const [size, setSize] = useState(initialSize);
  return (
    <main className="px-4 py-4">
      <div className="mb-3 flex flex-wrap items-center gap-4">
        <Link href="./index.html" className="hud-label hover:text-hud-gold">
          All components
        </Link>
        <h1 className="font-hud-label text-hud-lg font-bold uppercase tracking-[0.04em]">
          {variant.title}
        </h1>
        <SizeSwitch size={size} onChange={setSize} />
      </div>
      <Frame key={size} variant={variant} size={size} />
    </main>
  );
}
