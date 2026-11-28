import { type Team, type TeamRoster } from "../../../types/Team";
import { type EntryProblem, entryProblems } from "../../../game/deathbowl/entry";
import { arenaTeam } from "../../../scenes/sandboxTeam";
import { ARENA_TEAMS } from "../../../scenes/sandboxDefaultTeams";

export type DeathbowlTeams = readonly [Team, Team, Team, Team];

export interface DeathbowlEntryCheck {
  readonly blocks: readonly EntryProblem[];
  readonly notices: readonly EntryProblem[];
}

function enteredTeam(team: Team): Team {
  const entered = structuredClone(team);
  entered.players = entered.players.filter(
    ({ playerKind }) => playerKind !== "star"
  );
  delete entered.draftInducements;
  return entered;
}

export function checkEntry(team: Team, roster: TeamRoster): DeathbowlEntryCheck {
  return {
    blocks: entryProblems(enteredTeam(team), roster),
    notices: entryProblems(team, roster).filter(({ rule }) => rule === "DB-D4"),
  };
}

export function computerSeats(
  team: Team,
  random: () => number = Math.random
): readonly [Team, Team, Team] {
  const others = ARENA_TEAMS.filter(({ roster }) => roster !== team.rosterName);
  const drop = others.length > 3 ? Math.floor(random() * others.length) : -1;
  const [east, south, west] = others
    .filter((_, index) => index !== drop)
    .map(({ roster, name, colour }) => arenaTeam(roster, name, colour));
  if (!east || !south || !west)
    throw new Error("The arena needs three computer teams.");
  return [east, south, west];
}

export function deathbowlTeams(
  team: Team,
  computers: readonly [Team, Team, Team]
): DeathbowlTeams {
  return [enteredTeam(team), ...computers];
}
