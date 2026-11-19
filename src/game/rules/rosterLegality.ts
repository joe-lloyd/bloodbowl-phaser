import { type Team, type TeamRoster } from "../../types/Team";
import { PositionKeyWord, TraitKeyWord } from "../../types/Player";
import { isDraftTeam } from "./teamLifecycle";
import { isDeadLeaguePlayer } from "./leagueRoster";

export const MIN_ROSTER_PLAYERS = 7;
export const MAX_ROSTER_PLAYERS = 11;
export const MAX_NON_LINEMEN = 4;

export interface RosterViolation {
  rule: string;

  detail: string;
}

export function isLinemanPosition(keywords: readonly string[]): boolean {
  return keywords.includes(PositionKeyWord.LINEMAN);
}

export function isBigGuy(keywords: readonly string[]): boolean {
  return keywords.includes(TraitKeyWord.BIG_GUY);
}

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
        detail: `${String(count)} × ${positionName} (roster max ${String(template.maxAllowed)})`,
      });
    }
  }
  return violations;
}

export function validateRosterLegality(
  team: Team,
  roster: TeamRoster
): RosterViolation[] {
  const violations: RosterViolation[] = [];
  const players = team.players;

  if (
    (isDraftTeam(team) && players.length < MIN_ROSTER_PLAYERS) ||
    players.length > MAX_ROSTER_PLAYERS
  ) {
    violations.push({
      rule: "roster-size",
      detail: `${String(players.length)} players (must be ${String(MIN_ROSTER_PLAYERS)}..${String(MAX_ROSTER_PLAYERS)})`,
    });
  }

  const nonLinemen = players.filter(
    (player) => !isLinemanPosition(player.keywords)
  );
  if (nonLinemen.length > MAX_NON_LINEMEN) {
    violations.push({
      rule: "lineman-limit",
      detail:
        `${String(nonLinemen.length)} players without the Lineman keyword ` +
        `(max ${String(MAX_NON_LINEMEN)}): ` +
        nonLinemen.map((player) => player.positionName).join(", "),
    });
  }

  const rostered = players.filter(
    (player) => !isDeadLeaguePlayer(team, player)
  );
  violations.push(...positionViolations(rostered, roster));

  const bigGuys = rostered.filter((player) => isBigGuy(player.keywords));
  if (roster.maxBigGuys !== undefined && bigGuys.length > roster.maxBigGuys) {
    violations.push({
      rule: "big-guy-limit",
      detail:
        `${String(bigGuys.length)} Big Guys (roster max ${String(roster.maxBigGuys)}): ` +
        bigGuys.map((player) => player.positionName).join(", "),
    });
  }

  const veterans = players.filter((player) => player.veteran);
  const [veteran] = veterans;
  const hasLineman = players.length > nonLinemen.length;
  if (
    isDraftTeam(team) &&
    hasLineman &&
    (veterans.length !== 1 ||
      !veteran ||
      !isLinemanPosition(veteran.keywords))
  ) {
    violations.push({
      rule: "veteran",
      detail:
        veterans.length === 0
          ? "no Veteran chosen (pick one Lineman)"
          : `${String(veterans.length)} Veterans (must be exactly one Lineman)`,
    });
  }

  if (team.treasury < 0) {
    violations.push({
      rule: "budget",
      detail: `treasury is negative (${String(team.treasury)})`,
    });
  }

  return violations;
}
