/**
 * Roster legality (Blood Bowl Sevens draft rules) — the single validator
 * shared by the team builder's finalise step and the development seed
 * builders. Rules enforced:
 *
 *   - 7..11 players (Sevens roster size)
 *   - at most 4 players without the Lineman positional keyword
 *   - no position above its roster template maximum (maxAllowed)
 *   - every player's position exists on the roster template
 *   - treasury never negative (purchases fit the draft budget)
 *
 * The Insignificant limit is enforced separately (src/game/rules/
 * insignificant.ts) — it is a whole-list trait check, not positional
 * legality, and both call sites run it alongside this validator.
 */

import { Team, TeamRoster } from "../../types/Team";
import { PositionKeyWord } from "../../types/Player";

export const MIN_ROSTER_PLAYERS = 7;
export const MAX_ROSTER_PLAYERS = 11;
export const MAX_NON_LINEMEN = 4;

export interface RosterViolation {
  /** Machine-readable rule id (e.g. "roster-size", "lineman-limit"). */
  rule: string;
  /** Human-readable detail, naming the offending position/count. */
  detail: string;
}

export function isLinemanPosition(keywords: readonly string[]): boolean {
  return keywords.includes(PositionKeyWord.LINEMAN);
}

/**
 * Validate a finished draft list against its roster template. Returns every
 * violation found (empty when the list is legal).
 */
export function validateRosterLegality(
  team: Team,
  roster: TeamRoster
): RosterViolation[] {
  const violations: RosterViolation[] = [];
  const players = team.players;

  if (players.length < MIN_ROSTER_PLAYERS || players.length > MAX_ROSTER_PLAYERS) {
    violations.push({
      rule: "roster-size",
      detail: `${players.length} players (must be ${MIN_ROSTER_PLAYERS}..${MAX_ROSTER_PLAYERS})`,
    });
  }

  const nonLinemen = players.filter(
    (player) => !isLinemanPosition(player.keywords)
  );
  if (nonLinemen.length > MAX_NON_LINEMEN) {
    violations.push({
      rule: "lineman-limit",
      detail:
        `${nonLinemen.length} players without the Lineman keyword ` +
        `(max ${MAX_NON_LINEMEN}): ` +
        nonLinemen.map((player) => player.positionName).join(", "),
    });
  }

  const counts = new Map<string, number>();
  for (const player of players) {
    counts.set(player.positionName, (counts.get(player.positionName) ?? 0) + 1);
  }
  for (const [positionName, count] of counts) {
    const template = roster.playerTemplates.find(
      (candidate) => candidate.positionName === positionName
    );
    if (!template) {
      violations.push({
        rule: "unknown-position",
        detail: `${positionName} is not on the ${roster.rosterName} roster`,
      });
    } else if (template.maxAllowed !== undefined && count > template.maxAllowed) {
      violations.push({
        rule: "positional-limit",
        detail: `${count} × ${positionName} (roster max ${template.maxAllowed})`,
      });
    }
  }

  if (team.treasury < 0) {
    violations.push({
      rule: "budget",
      detail: `treasury is negative (${team.treasury})`,
    });
  }

  return violations;
}
