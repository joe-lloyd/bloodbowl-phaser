import type { Character, StudioState } from "../boundary/characterStudio";
import { Select } from "../ui/components/common/NativeControls";
import { HudButton } from "../ui/components/componentWarehouse/HudButton";
import { Section } from "../ui/components/componentWarehouse/HudKit";
import { removeAt, type Change } from "./character";

interface UsedByProps {
  readonly positions: StudioState["positions"];
  readonly character: Character;
  readonly onChange: Change;
}

export function UsedBy({ positions, character, onChange }: UsedByProps) {
  const { usedBy } = character;
  const free = Object.entries(positions).flatMap(([roster, names]) => names.map((position) => ({ roster, position })))
    .filter((entry) => !usedBy.some((use) => use.roster === entry.roster && use.position === entry.position));
  return (
    <Section title="Plays as">
      {usedBy.map((use, index) => (
        <div key={`${use.roster}/${use.position}`} className="mb-1 flex items-center justify-between gap-2 text-hud-sm">
          {use.roster}: {use.position}
          <HudButton size="xs" variant="ghost" onClick={() => { onChange({ usedBy: removeAt(usedBy, index) }); }}>Remove</HudButton>
        </div>
      ))}
      <Select
        aria-label="Add a position"
        className="hud-field"
        value=""
        onChange={(event) => {
          const added = free[Number(event.target.value)];
          if (added) onChange({ usedBy: [...usedBy, added] });
        }}
      >
        <option value="">Add a position</option>
        {free.map((entry, index) => (
          <option key={`${entry.roster}/${entry.position}`} value={index}>{entry.roster}: {entry.position}</option>
        ))}
      </Select>
      <p className="mt-2 text-hud-sm text-hud-mute">Export replaces that position's art in the game.</p>
    </Section>
  );
}
