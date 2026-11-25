import { Input } from "../../src/ui/components/common/NativeControls";
import { HudButton } from "../../src/ui/components/componentWarehouse/HudButton";
import { words } from "./character";

interface NumberRowProps {
  readonly name: string;
  readonly value: number;
  readonly range: { readonly min: number; readonly max: number; readonly step: number };
  readonly changed: boolean;
  readonly onChange: (value: number) => void;
  readonly onReset: () => void;
}

export function NumberRow({ name, value, range, changed, onChange, onReset }: NumberRowProps) {
  return (
    <div className="grid min-h-[36px] grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_44px_64px] items-center gap-2">
      <span className={changed ? "text-hud-sm text-hud-gold" : "text-hud-sm text-hud-dim"}>{words(name)}</span>
      <Input
        type="range"
        aria-label={words(name)}
        className="w-full accent-[#e3b448]"
        {...range}
        value={value}
        onChange={(event) => { onChange(Number(event.target.value)); }}
      />
      <span className="text-right text-hud-sm tabular-nums">{String(Math.round(value * 100) / 100)}</span>
      {changed && <HudButton size="xs" variant="ghost" aria-label={`Reset ${words(name)}`} onClick={onReset}>Reset</HudButton>}
    </div>
  );
}
