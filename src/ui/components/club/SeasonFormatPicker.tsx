import type { SeasonFormat, Team } from "../../../types/Team";
import { CLUB_GAME_TYPES, gutterLockReason } from "../../../game/rules/club";
import { SEASON_ROUNDS } from "../../../game/rules/seasonFormat";
import { GameTypeMixPicker } from "../common/GameTypeMixPicker";

export function SeasonFormatPicker({ club, value, onChange }: { club: Team; value: SeasonFormat; onChange: (format: SeasonFormat) => void }) {
  const locked = gutterLockReason(club);
  return (
    <GameTypeMixPicker
      scope="season"
      open={CLUB_GAME_TYPES.filter((gameType) => gameType !== "gutter-bowl" || !locked)}
      lockNote={locked}
      rounds={SEASON_ROUNDS}
      playOffs
      value={value}
      onChange={onChange}
    />
  );
}
