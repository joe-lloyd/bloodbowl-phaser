import { getRosterByRosterName } from "../../data/RosterTemplates";
import {
  type Team,
  type TeamRoster,
  startingDedicatedFans,
} from "../../types/Team";
import { PositionKeyWord, TraitKeyWord } from "../../types/Player";
import { isDraftTeam } from "./teamLifecycle";
import { isDeadLeaguePlayer } from "./leagueRoster";
import {
  GAME_TYPES,
  GAME_TYPE_LABELS,
  type GameType,
} from "../variants/gameTypes";
import type { DraftRules } from "../variants/gameTypeRules";
import {
  type SidelineStaff,
  dedicatedFanPrice,
  draftRulesFor,
  rerollPrice,
  staffRefusal,
  teamDraftRules,
  teamGameType,
} from "./draftRules";

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

function sizeViolations(
  team: Team,
  draft: DraftRules,
  label: string
): RosterViolation[] {
  const players = team.players;
  const nonLinemen = players.filter(
    (player) => !isLinemanPosition(player.keywords)
  );
  const violations: RosterViolation[] = [];
  if (
    (isDraftTeam(team) && players.length < draft.minPlayers) ||
    players.length > draft.maxPlayers
  ) {
    violations.push({
      rule: "roster-size",
      detail: `${String(players.length)} players (a ${label} team needs ${String(draft.minPlayers)}..${String(draft.maxPlayers)})`,
    });
  }
  if (nonLinemen.length > draft.maxNonLinemen) {
    violations.push({
      rule: "lineman-limit",
      detail:
        `${String(nonLinemen.length)} players without the Lineman keyword ` +
        `(${label} max ${String(draft.maxNonLinemen)}): ` +
        nonLinemen.map((player) => player.positionName).join(", "),
    });
  }
  return violations;
}

function bigGuyViolations(
  rostered: Team["players"],
  roster: TeamRoster
): RosterViolation[] {
  const bigGuys = rostered.filter((player) => isBigGuy(player.keywords));
  if (roster.maxBigGuys === undefined || bigGuys.length <= roster.maxBigGuys)
    return [];
  return [
    {
      rule: "big-guy-limit",
      detail:
        `${String(bigGuys.length)} Big Guys (roster max ${String(roster.maxBigGuys)}): ` +
        bigGuys.map((player) => player.positionName).join(", "),
    },
  ];
}

function requiredVeteranViolations(team: Team): RosterViolation[] {
  const veterans = team.players.filter((player) => player.veteran);
  const [veteran] = veterans;
  const hasLineman = team.players.some((player) =>
    isLinemanPosition(player.keywords)
  );
  if (
    !isDraftTeam(team) ||
    !hasLineman ||
    (veterans.length === 1 && veteran && isLinemanPosition(veteran.keywords))
  )
    return [];
  return [
    {
      rule: "veteran",
      detail:
        veterans.length === 0
          ? "no Veteran chosen (pick one Lineman)"
          : `${String(veterans.length)} Veterans (must be exactly one Lineman)`,
    },
  ];
}

function veteranViolations(team: Team, draft: DraftRules): RosterViolation[] {
  return draft.veteran ? requiredVeteranViolations(team) : [];
}

function staffViolations(team: Team, gameType: GameType): RosterViolation[] {
  const hired: [SidelineStaff, boolean][] = [
    ["apothecary", team.apothecary],
    ["coach", team.coaches > 0],
    ["cheerleader", team.cheerleaders > 0],
  ];
  return hired.flatMap(([staff, has]) => {
    const refusal = has ? staffRefusal(gameType, staff) : undefined;
    return refusal ? [{ rule: "staff", detail: refusal }] : [];
  });
}

function draftSpendUnder(team: Team, gameType: GameType): number {
  const own = teamDraftRules(team);
  const other = draftRulesFor(gameType);
  const boughtFans =
    team.dedicatedFans - startingDedicatedFans(team.advancementMode);
  return (
    team.startingTreasury -
    team.treasury +
    team.rerolls *
      (rerollPrice(other, team.rerollCost) -
        rerollPrice(own, team.rerollCost)) +
    boughtFans * (dedicatedFanPrice(other) - dedicatedFanPrice(own))
  );
}

function budgetViolations(team: Team, gameType: GameType): RosterViolation[] {
  if (team.treasury < 0) {
    return [
      {
        rule: "budget",
        detail: `treasury is negative (${String(team.treasury)})`,
      },
    ];
  }
  if (!isDraftTeam(team) || gameType === teamGameType(team)) return [];
  const spend = draftSpendUnder(team, gameType);
  const { budget } = draftRulesFor(gameType);
  return spend > budget
    ? [
        {
          rule: "budget",
          detail: `the draft costs ${spend.toLocaleString("en-GB")} at ${GAME_TYPE_LABELS[gameType]} prices (budget ${budget.toLocaleString("en-GB")})`,
        },
      ]
    : [];
}

export function validateRosterLegality(
  team: Team,
  roster: TeamRoster,
  gameType: GameType = teamGameType(team)
): RosterViolation[] {
  const draft = draftRulesFor(gameType);
  const label = GAME_TYPE_LABELS[gameType];
  const rostered = team.players.filter(
    (player) => !isDeadLeaguePlayer(team, player)
  );
  return [
    ...sizeViolations(team, draft, label),
    ...positionViolations(rostered, roster),
    ...bigGuyViolations(rostered, roster),
    ...veteranViolations(team, draft),
    ...staffViolations(team, gameType),
    ...budgetViolations(team, gameType),
  ];
}

export function legalGameTypes(team: Team, roster: TeamRoster): GameType[] {
  return GAME_TYPES.filter(
    (gameType) => validateRosterLegality(team, roster, gameType).length === 0
  );
}

export function teamPlaysGameType(team: Team, gameType: GameType): boolean {
  try {
    const roster = getRosterByRosterName(team.rosterName);
    return validateRosterLegality(team, roster, gameType).length === 0;
  } catch {
    return false;
  }
}
