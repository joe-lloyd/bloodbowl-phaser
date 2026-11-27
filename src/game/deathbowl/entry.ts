import { calculateTeamValue, type Team, type TeamRoster } from "../../types/Team";
import { type DraftRules, matchTypeRules } from "../variants/gameTypeRules";
import { isDeadLeaguePlayer } from "../rules/leagueRoster";
import {
  boughtDedicatedFans,
  positionLimitViolations,
  type RosterViolation,
  staffViolations,
} from "../rules/rosterLegality";

type EntryRule = "DB-D1" | "DB-D3" | "DB-D4";

export interface EntryProblem {
  readonly rule: EntryRule;
  readonly message: string;
}

const LABEL = "Deathbowl";

const money = (value: number) => value.toLocaleString("en-GB");

const problem = (rule: EntryRule, message: string): EntryProblem => ({
  rule,
  message,
});

const asProblems = (rule: EntryRule, violations: RosterViolation[]) =>
  violations.map(({ detail }) => problem(rule, detail));

function sizeProblems(team: Team, draft: DraftRules): EntryProblem[] {
  const count = team.players.filter(
    (player) => !isDeadLeaguePlayer(team, player)
  ).length;
  if (count >= draft.minPlayers && count <= draft.maxPlayers) return [];
  return [
    problem(
      "DB-D1",
      `${String(count)} players; a ${LABEL} team needs ${String(draft.minPlayers)} to ${String(draft.maxPlayers)}.`
    ),
  ];
}

function budgetProblems(team: Team, draft: DraftRules): EntryProblem[] {
  const value = calculateTeamValue(team);
  if (value <= draft.budget) return [];
  return [
    problem(
      "DB-D1",
      `The team is worth ${money(value)}, over the ${LABEL} budget of ${money(draft.budget)}.`
    ),
  ];
}

function fanProblems(team: Team): EntryProblem[] {
  if (boughtDedicatedFans(team) <= 0) return [];
  return [problem("DB-D3", `${LABEL} teams cannot buy Dedicated Fans.`)];
}

function inducementProblems(team: Team): EntryProblem[] {
  const stars = team.players.filter((player) => player.playerKind === "star");
  const bought = (team.draftInducements ?? []).filter(
    ({ quantity }) => quantity > 0
  );
  return [
    ...stars.map(({ playerName }) =>
      problem("DB-D4", `${playerName} is a Star Player, and ${LABEL} has none.`)
    ),
    ...(bought.length > 0
      ? [problem("DB-D4", `${LABEL} has no inducements.`)]
      : []),
  ];
}

export function entryProblems(
  team: Team,
  roster: TeamRoster
): readonly EntryProblem[] {
  const { draft } = matchTypeRules("deathbowl");
  return [
    ...sizeProblems(team, draft),
    ...asProblems("DB-D1", positionLimitViolations(team, roster)),
    ...budgetProblems(team, draft),
    ...asProblems("DB-D3", staffViolations(team, LABEL, draft)),
    ...fanProblems(team),
    ...inducementProblems(team),
  ];
}
