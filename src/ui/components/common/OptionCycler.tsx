import type { LookOption } from "../../../boundary/layeredArt";
import { HudButton } from "../componentWarehouse/HudButton";

export function OptionCycler({ option, value, onPick }: { option: LookOption; value: string; onPick: (value: string) => void }) {
  const [name, label, values] = option;
  const index = Math.max(0, values.findIndex(([candidate]) => candidate === value));
  const step = (delta: number) => {
    const next = values[(index + delta + values.length) % values.length];
    if (next) onPick(next[0]);
  };
  return (
    <div className="flex items-center gap-2" data-option={name}>
      <span className="hud-label w-16 text-hud-2xs">{label}</span>
      <HudButton type="button" size="sm" variant="ghost" aria-label={`Previous ${label}`} onClick={() => { step(-1); }}>
        ‹
      </HudButton>
      <span className="min-w-28 text-center text-hud-sm text-hud-bone">{values[index]?.[1] ?? ""}</span>
      <HudButton type="button" size="sm" variant="ghost" aria-label={`Next ${label}`} onClick={() => { step(1); }}>
        ›
      </HudButton>
    </div>
  );
}
