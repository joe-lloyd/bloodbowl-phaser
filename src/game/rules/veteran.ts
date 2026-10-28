/**
 * The Veteran (docs/SEVENS_RULES.md D8). When drafting, the coach picks one
 * Lineman as the Veteran. The Veteran has MA -1 and, once per game, may
 * re-roll a failed pick-up, catch or Pass Action roll, or the block dice
 * when their own Block would Knock them Down. The re-roll itself lives in
 * the re-roll machinery (skills/rerolls.ts, skills/RerollArbiter.ts).
 */

import { Player } from "../../types/Player";
import { RerollableRollKind } from "../../types/decisions";
import { Team } from "../../types/Team";
import { EditDecision } from "./teamEditLegality";
import { isLinemanPosition } from "./rosterLegality";
import { isActiveTeam } from "./teamLifecycle";

/** The failed rolls a Veteran may re-roll, besides their own block dice. */
export const VETERAN_REROLL_KINDS: readonly RerollableRollKind[] = [
  "pickup",
  "catch",
  "pass",
];

function setVeteran(player: Player, veteran: boolean): void {
  if (!!player.veteran === veteran) return;
  if (veteran) {
    player.veteran = true;
    player.stats.MA -= 1;
  } else {
    delete player.veteran;
    player.stats.MA += 1;
  }
}

/**
 * Make `playerId` the team's only Veteran, moving the title (and the MA
 * penalty) off any previous Veteran. Refused for a player without the
 * Lineman keyword, and once the team has played its first match.
 */
export function chooseVeteran(team: Team, playerId: string): EditDecision {
  if (isActiveTeam(team)) {
    return {
      allowed: false,
      reason: "The Veteran is chosen when drafting the team.",
    };
  }
  const chosen = team.players.find((player) => player.id === playerId);
  if (!chosen || !isLinemanPosition(chosen.keywords)) {
    return {
      allowed: false,
      reason: "The Veteran must be a player with the Lineman keyword.",
    };
  }
  team.players.forEach((player) => setVeteran(player, player === chosen));
  return { allowed: true };
}

/**
 * Generated teams (seeds, simulation line-ups) take their first Lineman as
 * the Veteran so they are legal drafts. No-op without a Lineman.
 */
export function chooseFirstLinemanAsVeteran(team: Team): void {
  const first = team.players.find((player) =>
    isLinemanPosition(player.keywords)
  );
  if (first) chooseVeteran(team, first.id);
}
