/**
 * Roster legality (Blood Bowl Sevens draft rules) — the single validator
 * shared by the team builder's finalise step and the development seed
 * builders. Rules enforced:
 *
 *   - 7..11 players (Sevens roster size); an active team may drop below 7
 *   - at most 4 players without the Lineman positional keyword
 *   - no position above its roster template maximum (maxAllowed)
 *   - no more Big Guys than the roster's shared limit (maxBigGuys)
 *   - every player's position exists on the roster template
 *   - treasury never negative (purchases fit the draft budget)
 *   - a draft with a Lineman has exactly one Veteran, a Lineman (D8)
 *
 * The Insignificant limit is enforced separately (src/game/rules/
 * insignificant.ts) — it is a whole-list trait check, not positional
 * legality, and both call sites run it alongside this validator.
 */

import { Team, TeamRoster } from "../../types/Team";
import { PositionKeyWord, TraitKeyWord } from "../../types/Player";
import { isDraftTeam } from "./teamLifecycle";
import { isDeadLeaguePlayer } from "./leagueRoster";

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

export function isBigGuy(keywords: readonly string[]): boolean {
  return keywords.includes(TraitKeyWord.BIG_GUY);
}

/**
 * Whether this player is part of a surplus over a positional maximum or the
 * shared Big Guy limit, as a team saved before a rulebook correction can be.
 * Dead league players have already left and are not counted.
 */
export function exceedsRosterLimit(
  team: Team,
  roster: TeamRoster,
  playerId: string
): boolean {
  const rostered = team.players.filter(
    (player) => !isDeadLeaguePlayer(team, player)
  );
  const player = rostered.find((candidate) => candidate.id === playerId);
  if (!player) return false;
  const template = roster.playerTemplates.find(
    (candidate) => candidate.positionName === player.positionName
  );
  const ofPosition = rostered.filter(
    (candidate) => candidate.positionName === player.positionName
  ).length;
  if (template?.maxAllowed !== undefined && ofPosition > template.maxAllowed)
    return true;
  return (
    roster.maxBigGuys !== undefined &&
    isBigGuy(player.keywords) &&
    rostered.filter((candidate) => isBigGuy(candidate.keywords)).length >
      roster.maxBigGuys
  );
}

function positionViolations(
  rostered: Team["players"],
  roster: TeamRoster
): RosterViolation[] {
  const violations: RosterViolation[] = [];
  const counts = new Map<string, number>();
  for (const player of rostered) {
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
    } else if (
      template.maxAllowed !== undefined &&
      count > template.maxAllowed
    ) {
      violations.push({
        rule: "positional-limit",
        detail: `${count} × ${positionName} (roster max ${template.maxAllowed})`,
      });
    }
  }
  return violations;
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

  // D2: league injuries may take a team below 7, and Journeymen make up
  // the numbers (L2), so only a draft must reach 7.
  if (
    (isDraftTeam(team) && players.length < MIN_ROSTER_PLAYERS) ||
    players.length > MAX_ROSTER_PLAYERS
  ) {
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

  // A dead league player no longer holds a position, as when hiring
  const rostered = players.filter(
    (player) => !isDeadLeaguePlayer(team, player)
  );
  violations.push(...positionViolations(rostered, roster));

  const bigGuys = rostered.filter((player) => isBigGuy(player.keywords));
  if (roster.maxBigGuys !== undefined && bigGuys.length > roster.maxBigGuys) {
    violations.push({
      rule: "big-guy-limit",
      detail:
        `${bigGuys.length} Big Guys (roster max ${roster.maxBigGuys}): ` +
        bigGuys.map((player) => player.positionName).join(", "),
    });
  }

  // D8: a draft with a Lineman names exactly one Lineman as its Veteran. A
  // league team whose Veteran has left simply has none.
  const veterans = players.filter((player) => player.veteran);
  const hasLineman = players.length > nonLinemen.length;
  if (
    isDraftTeam(team) &&
    hasLineman &&
    (veterans.length !== 1 || !isLinemanPosition(veterans[0].keywords))
  ) {
    violations.push({
      rule: "veteran",
      detail:
        veterans.length === 0
          ? "no Veteran chosen (pick one Lineman)"
          : `${veterans.length} Veterans (must be exactly one Lineman)`,
    });
  }

  if (team.treasury < 0) {
    violations.push({
      rule: "budget",
      detail: `treasury is negative (${team.treasury})`,
    });
  }

  return violations;
}
