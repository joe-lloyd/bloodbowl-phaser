import type React from "react";
import { Link } from "../ui/components/common/NativeControls";
import { Chip, Panel } from "../ui/components/componentWarehouse/HudKit";

interface Sketch {
  file: string;
  name: string;
  chosen?: boolean;
}

export function SketchCard({
  sketch,
  lazy = false,
  children,
}: {
  sketch: Sketch;
  lazy?: boolean;
  children?: React.ReactNode;
}) {
  const href = `./sketches/${sketch.file}.html`;
  return (
    <Panel accent={sketch.chosen ? "gold" : undefined} className="p-3">
      <div
        className="overflow-hidden rounded-hud"
        style={{ width: 384, height: 216 }}
      >
        <iframe
          title={sketch.name}
          src={href}
          width={1280}
          height={720}
          {...(lazy ? { loading: "lazy" } : {})}
          className="origin-top-left border-0"
          style={{ transform: "scale(0.3)" }}
        />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Link
          href={href}
          className="font-hud-label text-hud-lg font-bold uppercase tracking-[0.04em] hover:text-hud-gold"
        >
          {sketch.name}
        </Link>
        {sketch.chosen && <Chip tone="gold">Chosen</Chip>}
      </div>
      {children}
    </Panel>
  );
}

export function ShotLink({
  src,
  alt,
  side,
}: {
  src: string;
  alt: string;
  side: "before" | "after";
}) {
  return (
    <Link href={src} className="group relative block">
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="w-full rounded-hud border border-white/10 group-hover:border-hud-gold/60"
      />
      <Chip
        tone={side === "after" ? "gold" : "neutral"}
        className="absolute left-2 top-2 !bg-black/80"
      >
        {side}
      </Chip>
    </Link>
  );
}
