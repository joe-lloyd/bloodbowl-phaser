import {
  DEFAULT_GAME_TYPE,
  GAME_TYPES,
  GAME_TYPE_LABELS,
  GAME_TYPE_SUMMARIES,
  type GameType,
  readGameType,
} from "../../../game/variants/gameTypes";
import { Field } from "../componentWarehouse/HudKit";

export function GameTypeSelector({
  value = DEFAULT_GAME_TYPE,
  onChange,
  disabled = false,
  label = "Game type",
}: {
  value?: GameType;
  onChange: (gameType: GameType) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <Field label={label}>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => {
          onChange(readGameType(event.target.value));
        }}
        disabled={disabled}
        className="hud-field disabled:cursor-not-allowed disabled:opacity-50"
      >
        {GAME_TYPES.map((gameType) => (
          <option key={gameType} value={gameType}>
            {GAME_TYPE_LABELS[gameType]}
          </option>
        ))}
      </select>
      <span className="mt-2 block font-hud-body text-hud-sm text-hud-dim">
        {GAME_TYPE_SUMMARIES[value]}
      </span>
    </Field>
  );
}
