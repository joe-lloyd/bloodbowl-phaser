import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { errorText } from "../../errorText";
import { fixtureContext } from "../../../competition/fixtureContext";
import { fetchEntrantTeam } from "../../../competition/teamRefs";
import type {
  CompetitionDoc,
  CompetitionEntrant,
  CompetitionFixture,
} from "../../../competition/types";
import type { LobbyFixture } from "../../../firebase/lobby";
import {
  clearMatchSave,
  readMatchSave,
} from "../../../game/persistence/MatchSaveRepository";
import { hasBlockingPendingDevelopment, type Team } from "../../../types/Team";
import { getRosterByRosterName } from "../../../data/RosterTemplates";
import { validateRosterLegality } from "../../../game/rules/rosterLegality";
import { GAME_TYPE_LABELS, readGameType } from "../../../game/variants/gameTypes";

export interface HostedFixture extends LobbyFixture {
  competitionName: string;
}

interface FixtureTeams {
  home: CompetitionEntrant;
  away: CompetitionEntrant;
  homeTeam: Team;
  awayTeam: Team;
}

function blockingDevelopment(
  competition: CompetitionDoc,
  { home, away, homeTeam, awayTeam }: FixtureTeams
): string | null {
  if (!competition.rosterProfile?.requireDevelopmentComplete) return null;
  const blocked = [
    { entrant: home, team: homeTeam },
    { entrant: away, team: awayTeam },
  ].find(({ team }) => hasBlockingPendingDevelopment(team));
  return blocked
    ? `${blocked.entrant.name} has unresolved development — resolve it from Manage Team before this fixture.`
    : null;
}

function illegalClubSquad(
  competition: CompetitionDoc,
  { home, away, homeTeam, awayTeam }: FixtureTeams
): string | null {
  const gameType = readGameType(competition.gameType);
  for (const { entrant, team } of [
    { entrant: home, team: homeTeam },
    { entrant: away, team: awayTeam },
  ]) {
    if (!team.club) continue;
    const [problem] = validateRosterLegality(
      team,
      getRosterByRosterName(team.rosterName),
      gameType
    );
    if (problem)
      return `${entrant.name}'s ${GAME_TYPE_LABELS[gameType]} squad cannot play: ${problem.detail} Fix it under Squads on the team sheet.`;
  }
  return null;
}

export function hostedFixture({
  competition,
  fixture,
  teams,
  uid,
}: {
  competition: CompetitionDoc;
  fixture: CompetitionFixture;
  teams: FixtureTeams;
  uid: string | undefined;
}): HostedFixture {
  const hostSide =
    teams.away.ownerUid === uid && teams.home.ownerUid !== uid ? "away" : "home";
  const opponent = hostSide === "home" ? teams.away : teams.home;
  const reservedFor =
    competition.online && opponent.ownerUid && opponent.ownerUid !== uid
      ? opponent.ownerUid
      : undefined;
  return {
    context: fixtureContext({ competition, fixtureId: fixture.id, playedVia: "online" }),
    homeTeam: teams.homeTeam,
    awayTeam: teams.awayTeam,
    hostSide,
    competitionName: competition.name,
    ...(reservedFor !== undefined && { reservedFor }),
  };
}

async function loadFixtureTeams(
  competition: CompetitionDoc,
  fixture: CompetitionFixture
): Promise<FixtureTeams | string | null> {
  const entrant = (id: string | null) =>
    competition.entrants.find((candidate) => candidate.id === id);
  const home = entrant(fixture.homeEntrantId);
  const away = entrant(fixture.awayEntrantId);
  if (!home || !away) return null;
  const [homeTeam, awayTeam] = await Promise.all([fetchEntrantTeam(home), fetchEntrantTeam(away)]);
  if (!homeTeam || !awayTeam) return "Could not load one of the entrants' rosters.";
  const teams = { home, away, homeTeam, awayTeam };
  return (
    blockingDevelopment(competition, teams) ??
    illegalClubSquad(competition, teams) ??
    teams
  );
}

type Launcher = (fixture: CompetitionFixture, teams: FixtureTeams) => { path: string; state: unknown };

function launchers(competition: CompetitionDoc, uid: string | undefined) {
  const context = (fixture: CompetitionFixture, playedVia: "local" | "computer") =>
    fixtureContext({ competition, fixtureId: fixture.id, playedVia });
  const local: Launcher = (fixture, { homeTeam, awayTeam }) => ({
    path: "/play",
    state: { team1: homeTeam, team2: awayTeam, competitionContext: context(fixture, "local"), progressionEnabled: true },
  });
  const hosted: Launcher = (fixture, teams) => ({
    path: "/online/host",
    state: { competitionFixture: hostedFixture({ competition, fixture, teams, uid }) },
  });
  const computer = (humanEntrantId: string): Launcher => (fixture, { homeTeam, awayTeam }) => ({
    path: "/play/computer",
    state: {
      team1: homeTeam,
      team2: awayTeam,
      computerTeamId: humanEntrantId === fixture.homeEntrantId ? awayTeam.id : homeTeam.id,
      difficulty: competition.computerDifficulty,
      progressionEnabled: true,
      competitionContext: context(fixture, "computer"),
    },
  });
  return { local, hosted, computer };
}

export function useFixtureLaunch({
  competition,
  uid,
  onError,
}: {
  competition: CompetitionDoc;
  uid: string | undefined;
  onError: (error: string | null) => void;
}) {
  const navigate = useNavigate();
  const [launching, setLaunching] = useState(false);
  const routes = launchers(competition, uid);

  const launch = async (fixture: CompetitionFixture, { local, route }: { local: boolean; route: Launcher }) => {
    const replaces = local && readMatchSave();
    if (replaces && !confirm("Starting this fixture will replace your saved local match. Continue?"))
      return;
    setLaunching(true);
    try {
      const teams = await loadFixtureTeams(competition, fixture);
      if (typeof teams === "string") onError(teams);
      if (!teams || typeof teams === "string") return;
      if (local) clearMatchSave();
      const { path, state } = route(fixture, teams);
      void navigate(path, { state });
    } catch (reason) {
      onError(errorText(reason));
    } finally {
      setLaunching(false);
    }
  };

  return {
    launching,
    launchLocal: (fixture: CompetitionFixture) => launch(fixture, { local: true, route: routes.local }),
    launchHosted: (fixture: CompetitionFixture) => launch(fixture, { local: false, route: routes.hosted }),
    launchComputer: (fixture: CompetitionFixture, humanEntrantId: string) =>
      launch(fixture, { local: true, route: routes.computer(humanEntrantId) }),
  };
}
