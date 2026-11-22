import type { Team } from "../../../types/Team";
import {
  GUTTER_UNLOCK_WORTH,
  clubWorth,
  gutterUnlocked,
  thousands,
} from "../../../game/rules/club";

export function GutterProgress({ team }: { team: Team }) {
  if (gutterUnlocked(team)) {
    return (
      <span className="font-hud-body text-hud-sm text-hud-good">
        Gutter Bowl is open to this club.
      </span>
    );
  }
  const worth = clubWorth(team);
  const share = Math.min(100, Math.round((worth / GUTTER_UNLOCK_WORTH) * 100));
  return (
    <span className="flex flex-col gap-1">
      <span className="font-hud-body text-hud-sm text-hud-dim">
        Gutter Bowl: {thousands(worth)} of {thousands(GUTTER_UNLOCK_WORTH)}{" "}
        team value plus treasury
      </span>
      <span
        role="progressbar"
        aria-label="Progress to Gutter Bowl"
        aria-valuemin={0}
        aria-valuemax={GUTTER_UNLOCK_WORTH}
        aria-valuenow={worth}
        className="block h-2 overflow-hidden rounded-hud bg-black/40"
      >
        <span
          className="block h-full bg-hud-gold"
          style={{ width: `${String(share)}%` }}
        />
      </span>
    </span>
  );
}
