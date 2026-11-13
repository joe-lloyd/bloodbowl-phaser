/**
 * Shirt numbers and player identity, kept apart.
 *
 * A Sevens Team Draft List has 11 numbered slots, which the Team Builder's
 * roster shows. A coach can move a player to another number, and the player
 * keeps their id, so an id must never be rebuilt from a number: a reused
 * number would give two players one id, and everything keyed by id (match
 * statistics, pending development, releasing a player) would mix them up.
 */

import { Team } from "../../types/Team";
import { staysOnRoster } from "./leagueRoster";

/** The numbered slots on a Sevens Team Draft List. */
export const ROSTER_SLOTS = 11;

/**
 * The lowest shirt number from 1 to 11 that no player staying on the team
 * wears, or null when every slot is taken. Players waiting on a hiring
 * decision hold their number too; a dead league player, who leaves the
 * roster, does not.
 */
export function freeRosterNumber(team: Team): number | null {
  const used = new Set(
    team.players
      .filter((player) => staysOnRoster(team, player))
      .map((player) => player.number)
  );
  for (let number = 1; number <= ROSTER_SLOTS; number++)
    if (!used.has(number)) return number;
  return null;
}

/**
 * `preferred` when no player on the team has that id yet, otherwise the
 * first of `preferred-2`, `preferred-3`, ... that is free.
 */
export function uniquePlayerId(
  team: Pick<Team, "players">,
  preferred: string
): string {
  const taken = new Set(team.players.map((player) => player.id));
  if (!taken.has(preferred)) return preferred;
  let serial = 2;
  while (taken.has(`${preferred}-${serial}`)) serial++;
  return `${preferred}-${serial}`;
}
