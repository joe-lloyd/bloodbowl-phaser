import { getRosterByRosterName } from "../data/RosterTemplates";
import { loadTeams, saveTeams } from "../game/managers/TeamManager";
import { validateInsignificant } from "../game/rules/insignificant";
import { validateRosterLegality } from "../game/rules/rosterLegality";
import type { Difficulty } from "../simulation/ai/difficulty";
import { Team } from "../types/Team";
import {
  computeStandings,
  generateRoundRobin,
  generateSingleElimination,
  seedEntrants,
} from "./logic";
import { findCompetitionById, saveCompetition } from "./repository";
import { assertEntrantsCompatible, RosterRuleProfile } from "./rosterRules";
import {
  CompetitionDoc,
  CompetitionEntrant,
  CompetitionType,
  DEFAULT_LEAGUE_POINTS,
  TournamentFormat,
} from "./types";
import {
  COMPUTER_COACH,
  createComputerTeamFromTemplate,
} from "./computerTeamTemplates";
import { readSevensRuleset, SevensRuleset } from "../game/rules/sevensRuleset";

export type EntrantChoice =
  | { team: Team; ownerUid: string | null }
  | { computerTemplateId: string };

export interface NewCompetition {
  ruleset?: SevensRuleset;
  type: CompetitionType;
  name: string;
  /** Tournaments only. */
  format?: TournamentFormat;
  organizerUid: string | null;
  /** In seed order. A computer team is saved to the organizer's library. */
  entrants: EntrantChoice[];
  profile?: RosterRuleProfile;
  computerDifficulty?: Difficulty;
}

/**
 * Check the entrants and create the competition, as CompetitionBuilder's
 * Generate does. Throws an Error whose message the organizer is shown.
 */
export async function createCompetition(
  input: NewCompetition
): Promise<CompetitionDoc> {
  const name = input.name.trim();
  if (!name) throw new Error("Give the competition a name.");
  if (input.entrants.length < 2) throw new Error("Select at least two teams.");
  const ruleset = readSevensRuleset(input.ruleset);
  // Resolve recipes here so each competition owns its own untouched rookies.
  const taken = new Set(
    input.entrants.flatMap((choice) =>
      "team" in choice ? [choice.team.name] : []
    )
  );
  const choices = input.entrants.map((choice) => {
    if ("team" in choice) return choice;
    const team = createComputerTeamFromTemplate(choice.computerTemplateId, {
      ruleset,
      advancementMode: input.profile?.advancementMode ?? "advanced-league",
    });
    const base = team.name;
    for (let suffix = 2; taken.has(team.name); suffix++)
      team.name = `${base} ${suffix}`;
    taken.add(team.name);
    return { team, ownerUid: input.organizerUid };
  });
  const teams = choices.map((choice) => choice.team);

  // A team belongs to at most one active competition. Every entrant carries
  // a live team object, the organizer's own or another coach's (read via
  // fetchAllCoachTeams), so this holds for every entrant.
  for (const team of teams) {
    if (!team.activeCompetitionId) continue;
    const existing = await findCompetitionById(team.activeCompetitionId);
    throw new Error(
      `${team.name} is already entered in ` +
        `${existing?.name ?? "another active competition"}.`
    );
  }

  // Shared roster legality gates competition entry the same way it gates
  // finalization and match selection (team-lifecycle-modes).
  const illegal = teams.filter((team) => {
    try {
      const roster = getRosterByRosterName(team.rosterName);
      return (
        validateRosterLegality(team, roster).length > 0 ||
        !!validateInsignificant(team.players, ruleset)
      );
    } catch {
      return true;
    }
  });
  if (illegal.length > 0) {
    throw new Error(
      `These teams are not legal for competition entry: ${illegal
        .map((team) => team.name)
        .join(", ")}`
    );
  }
  assertEntrantsCompatible(teams, input.profile, ruleset);

  const entrants = seedEntrants(
    choices.map(({ team, ownerUid }) => ({
      id: team.computerCoached
        ? `computer:${team.id}`
        : ownerUid === input.organizerUid
          ? `own:${team.id}`
          : `coach:${ownerUid}:${team.id}`,
      teamId: team.id,
      ownerUid,
      name: team.name,
      coachName: team.computerCoached
        ? COMPUTER_COACH
        : (team.coachName ?? undefined),
      coachUid: ownerUid,
      rosterName: team.rosterName,
      ...(team.computerCoached ? { computerCoached: true as const } : {}),
    }))
  ) as CompetitionEntrant[];
  const id = `${input.type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();
  const fixtures =
    input.type === "league" || input.format === "round-robin"
      ? generateRoundRobin(entrants)
      : generateSingleElimination(entrants);
  const base = {
    ruleset,
    id,
    name,
    organizerUid: input.organizerUid,
    participantUids: [
      ...new Set(entrants.flatMap((entrant) => entrant.ownerUid ?? [])),
    ],
    status: "active" as const,
    entrants,
    fixtures,
    standings: computeStandings(entrants, fixtures),
    createdAt: now,
    updatedAt: now,
    ...(input.profile ? { rosterProfile: input.profile } : {}),
    ...(entrants.some((entrant) => entrant.computerCoached)
      ? { computerDifficulty: input.computerDifficulty ?? "standard" }
      : {}),
  };
  const competition: CompetitionDoc =
    input.type === "league"
      ? { ...base, type: "league", points: DEFAULT_LEAGUE_POINTS }
      : {
          ...base,
          type: "tournament",
          format: input.format ?? "single-elimination",
        };
  await saveCompetition(competition);

  // A cloud write to another coach's team is refused by Firestore rules
  // (owner-only write), so only the organizer's own teams are stamped.
  const owned = choices.filter(
    (choice) => choice.ownerUid === input.organizerUid
  );
  if (owned.length > 0) {
    const savedTeams = new Map(loadTeams().map((team) => [team.id, team]));
    for (const { team } of owned) {
      team.activeCompetitionId = id;
      savedTeams.set(team.id, team);
    }
    await saveTeams([...savedTeams.values()]);
  }
  return competition;
}
