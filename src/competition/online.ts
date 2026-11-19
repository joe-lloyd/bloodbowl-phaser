import { resolveCoachName } from "../firebase/coaches";
import { readSevensRuleset } from "../game/rules/sevensRuleset";
import { type Team } from "../types/Team";
import { computerFillTeams } from "./computerFill";
import {
  assertTeamsCanEnter,
  buildCompetition,
  type CompetitionRules,
  competitionFixtures,
  entrantFor,
  lockTeams,
  uniqueTeamName,
} from "./create";
import { seedEntrants, withResultsFromFixtures } from "./logic";
import { saveCompetition, updateCompetition } from "./repository";
import {
  clearActiveCompetition,
  withdrawFromCompetition,
} from "./resultRecording";
import type {
  CompetitionDoc,
  CompetitionEntrant,
  OnlineSetup,
} from "./types";

const MAX_PLACES = 16;

type Random = () => number;

export interface NewOnlineCompetition extends CompetitionRules {
  organizerUid: string;
  team: Team | null;
  online: Omit<OnlineSetup, "startedAt">;
}

function signupsOpen(competition: CompetitionDoc): OnlineSetup {
  if (!competition.online || competition.status !== "draft")
    throw new Error("Sign-ups for this competition are closed.");
  return competition.online;
}

function signedUpEntrant({
  team,
  uid,
  coachName,
  competition,
}: {
  team: Team;
  uid: string;
  coachName: string;
  competition: CompetitionDoc;
}): CompetitionEntrant {
  return {
    ...entrantFor({ team, ownerUid: uid, organizerUid: competition.organizerUid }),
    coachName,
    seed: competition.entrants.length + 1,
  };
}

export async function openOnlineCompetition(
  input: NewOnlineCompetition
): Promise<CompetitionDoc> {
  if (!input.name.trim()) throw new Error("Give the competition a name.");
  const { places } = input.online;
  if (!Number.isInteger(places) || places < 2 || places > MAX_PLACES)
    throw new Error(`A competition has between 2 and ${String(MAX_PLACES)} places.`);
  const ruleset = readSevensRuleset(input.ruleset);
  const teams = input.team ? [input.team] : [];
  await assertTeamsCanEnter({ teams, ruleset, profile: input.profile });
  const draft = buildCompetition({
    rules: { ...input, ruleset },
    organizerUid: input.organizerUid,
    entrants: [],
    status: "draft",
    online: input.online,
  });
  const coachName = await resolveCoachName(input.organizerUid);
  const competition = teams.reduce(
    (current, team) =>
      withSignup(current, { team, uid: input.organizerUid, coachName }),
    draft
  );
  await saveCompetition(competition);
  await lockTeams(teams, competition.id);
  return competition;
}

export function withSignup(
  latest: CompetitionDoc,
  { team, uid, coachName }: { team: Team; uid: string; coachName: string }
): CompetitionDoc {
  const online = signupsOpen(latest);
  if (latest.participantUids.includes(uid))
    throw new Error("You already have a team in this competition.");
  if (latest.entrants.length >= online.places)
    throw new Error("Every place in this competition is taken.");
  return {
    ...latest,
    entrants: [
      ...latest.entrants,
      signedUpEntrant({ team, uid, coachName, competition: latest }),
    ],
    participantUids: [...latest.participantUids, uid],
    updatedAt: Date.now(),
  };
}

export async function enterCompetition({
  competition,
  team,
  uid,
}: {
  competition: CompetitionDoc;
  team: Team;
  uid: string;
}): Promise<CompetitionDoc> {
  await assertTeamsCanEnter({
    teams: [team],
    ruleset: readSevensRuleset(competition.ruleset),
    profile: competition.rosterProfile,
  });
  const coachName = await resolveCoachName(uid);
  const updated = await updateCompetition(
    competition.type,
    competition.id,
    (latest) => withSignup(latest, { team, uid, coachName })
  );
  await lockTeams([team], competition.id);
  return updated;
}

export function withoutEntrants(
  latest: CompetitionDoc,
  leaving: (entrant: CompetitionEntrant) => boolean
): CompetitionDoc {
  signupsOpen(latest);
  const entrants = latest.entrants.filter((entrant) => !leaving(entrant));
  const owners = new Set(entrants.flatMap((entrant) => entrant.ownerUid ?? []));
  return {
    ...latest,
    entrants,
    participantUids: latest.participantUids.filter((uid) => owners.has(uid)),
    updatedAt: Date.now(),
  };
}

async function release(
  competition: CompetitionDoc,
  leaving: (entrant: CompetitionEntrant) => boolean
): Promise<CompetitionDoc> {
  const teamIds = competition.entrants.filter(leaving).map((entrant) => entrant.teamId);
  const updated = await updateCompetition(
    competition.type,
    competition.id,
    (latest) => withoutEntrants(latest, leaving)
  );
  for (const teamId of teamIds) await clearActiveCompetition(teamId, competition.id);
  return updated;
}

export function leaveCompetition({
  competition,
  uid,
}: {
  competition: CompetitionDoc;
  uid: string;
}): Promise<CompetitionDoc> {
  return release(competition, (entrant) => entrant.ownerUid === uid);
}

export function removeEntrant({
  competition,
  entrantId,
}: {
  competition: CompetitionDoc;
  entrantId: string;
}): Promise<CompetitionDoc> {
  if (competition.status !== "draft")
    return withdrawFromCompetition(
      { competitionType: competition.type, competitionId: competition.id },
      entrantId
    );
  return release(competition, (entrant) => entrant.id === entrantId);
}

function shuffled<T>(items: readonly T[], random: Random): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    const held = result[index];
    const other = result[swap];
    if (held === undefined || other === undefined) continue;
    result[index] = other;
    result[swap] = held;
  }
  return result;
}

export function startedFrom(
  latest: CompetitionDoc,
  { pool, random, now }: { pool: readonly Team[]; random: Random; now: number }
): { competition: CompetitionDoc; computerTeams: Team[] } {
  const online = signupsOpen(latest);
  const need = Math.max(0, online.places - latest.entrants.length);
  if (need > pool.length)
    throw new Error("Coaches signed up or left while starting. Try again.");
  const taken = new Set(latest.entrants.map((entrant) => entrant.name));
  const computerTeams = pool
    .slice(0, need)
    .map((team) => uniqueTeamName(structuredClone(team), taken));
  const organizerUid = latest.organizerUid;
  const entrants = seedEntrants(
    shuffled(
      [
        ...latest.entrants,
        ...computerTeams.map((team) =>
          entrantFor({ team, ownerUid: organizerUid, organizerUid })
        ),
      ],
      random
    )
  );
  if (entrants.length < 2)
    throw new Error("A competition needs at least two teams.");
  const rules =
    latest.type === "tournament"
      ? { type: latest.type, format: latest.format }
      : { type: latest.type };
  const competition = withResultsFromFixtures({
    ...latest,
    status: "active",
    entrants,
    fixtures: competitionFixtures(rules, entrants),
    online: { ...online, startedAt: now },
    updatedAt: now,
  });
  return { competition, computerTeams };
}

export async function startOnlineCompetition({
  competition,
  random = Math.random,
}: {
  competition: CompetitionDoc;
  random?: Random;
}): Promise<CompetitionDoc> {
  const online = signupsOpen(competition);
  const pool = computerFillTeams({
    count: Math.max(0, online.places - competition.entrants.length),
    ruleset: readSevensRuleset(competition.ruleset),
    profile: competition.rosterProfile,
    rosters: competition.entrants.map((entrant) => entrant.rosterName),
    random,
  });
  let computerTeams: Team[] = [];
  const started = await updateCompetition(
    competition.type,
    competition.id,
    (latest) => {
      const result = startedFrom(latest, { pool, random, now: Date.now() });
      computerTeams = result.computerTeams;
      return result.competition;
    }
  );
  await lockTeams(computerTeams, started.id);
  return started;
}
