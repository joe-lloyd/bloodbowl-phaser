import { getTeamById, saveTeam } from "../game/managers/TeamManager";
import { ownLocalTeam } from "./teamRefs";
import { foldMatchSummaryIntoCareers } from "../game/progression/careerStats";
import { recordPendingDevelopment } from "../game/progression/postMatch";
import { HeadlessGame } from "../headless/HeadlessGame";
import { startingFormat } from "../game/variants/startingFormat";
import { type IRNGService, RNGService } from "../services/rng/RNGService";
import { plannerCoach } from "../simulation/ai/planner";
import { type Coach } from "../simulation/coach";
import { type MatchRecording, runMatch } from "../simulation/runMatch";
import { GamePhase } from "../types/GameState";
import { type Player, PlayerStatus } from "../types/Player";
import { type Team } from "../types/Team";
import { type ManagementReport, manageComputerTeam } from "./computerTeams";
import {
  keepRecordedResult,
  recordCompetitionFixture,
} from "./resultRecording";
import {
  type CompetitionDoc,
  type CompetitionFixture,
} from "./types";
import { fixtureContext } from "./fixtureContext";
import { carriesInjuries } from "../game/rules/injuryRules";
import { keepPreMatchInjuries } from "../game/rules/leagueRoster";
import { fixturePaysWinnings, stalledSides } from "../game/rules/winnings";

export interface SimulatedFixture {
  fixture: CompetitionFixture;
  competition: CompetitionDoc;

  teams: { home: Team; away: Team };

  casualties: { team: Team; player: Player }[];

  sppEarned: Record<string, number>;

  management: ManagementReport[];
  recording: MatchRecording;
}

export interface SimulationOptions {
  seed?: number;

  coach?: Coach;

  rng?: Pick<IRNGService, "rollDie">;

  inspect?: (game: HeadlessGame) => void;
}

const isOut = (player: Player) =>
  player.status === PlayerStatus.INJURED || player.status === PlayerStatus.DEAD;

function computerEntrant(competition: CompetitionDoc, id: string | null) {
  const entrant = competition.entrants.find((candidate) => candidate.id === id);
  return entrant?.computerCoached && !entrant.withdrawn ? entrant : undefined;
}

export function simulatableFixtures(
  competition: CompetitionDoc
): CompetitionFixture[] {
  return competition.fixtures.filter(
    (fixture) =>
      fixture.status === "ready" &&
      !!computerEntrant(competition, fixture.homeEntrantId) &&
      !!computerEntrant(competition, fixture.awayEntrantId)
  );
}

export function currentRound(competition: CompetitionDoc): number | undefined {
  const open = competition.fixtures.filter(
    (fixture) => fixture.status !== "complete"
  );
  return open.length > 0
    ? Math.min(...open.map((fixture) => fixture.round))
    : undefined;
}

function fixtureTeams(
  competition: CompetitionDoc,
  fixtureId: string
): { home: Team; away: Team } {
  const fixture = simulatableFixtures(competition).find(
    (candidate) => candidate.id === fixtureId
  );
  if (!fixture) {
    throw new Error(
      "Only a ready game between two computer teams is simulated."
    );
  }
  const load = (entrantId: string | null) => {
    const entrant = computerEntrant(competition, entrantId)!;
    const team = ownLocalTeam(entrant);
    if (!team) throw new Error(`${entrant.name} is not in this library.`);
    return team;
  };
  const home = load(fixture.homeEntrantId);
  const away = load(fixture.awayEntrantId);
  return { home, away };
}

function awardMvps(
  tracker: HeadlessGame["ctx"]["matchStats"],
  teams: Team[],
  rng: Pick<IRNGService, "rollDie">
): void {
  for (const team of teams) {
    const nominees = tracker.getEligibleMvpPlayers(team.id).slice(0, 6);
    if (nominees.length > 0)
      tracker.awardMvp(team.id, nominees, rng.rollDie(nominees.length));
  }
}

function bySide(
  tally: Record<string, number>,
  home: Team,
  away: Team
): { home: number; away: number } {
  return { home: tally[home.id] ?? 0, away: tally[away.id] ?? 0 };
}

export async function simulateFixture(
  competition: CompetitionDoc,
  fixtureId: string,
  options: SimulationOptions = {}
): Promise<SimulatedFixture> {
  const { home, away } = fixtureTeams(competition, fixtureId);
  const beforeMatch = structuredClone([home, away]);
  const seed = options.seed ?? Math.floor(Math.random() * 2 ** 31);
  const rng = options.rng ?? new RNGService(seed);
  const context = fixtureContext({ competition, fixtureId, playedVia: "simulated" });

  const game = new HeadlessGame({
    seed,
    team1: structuredClone(home),
    team2: structuredClone(away),
    startingPhase: GamePhase.SETUP,
    progressionEnabled: true,
    knockout: context.knockout,
    paysWinnings: fixturePaysWinnings(context),
    competition: true,
    ...startingFormat(
      { gameType: context.gameType },
      () => (rng.rollDie(6) - 1) / 6
    ),
  });
  options.inspect?.(game);

  const sittingOut = new Set(
    [game.ctx.team1, game.ctx.team2].flatMap((team) =>
      team.players.filter((element) => isOut(element)).map((player) => player.id)
    )
  );
  const coach = options.coach ?? plannerCoach;
  const recording = await runMatch({
    seed,
    rosters: [home.rosterName, away.rosterName],
    coaches: [coach, coach],
    game,
    inducements: false,
  });
  const engine = game.ctx.gameService;
  const state = engine.getState();
  if (state.phase !== GamePhase.GAME_OVER) {
    throw new Error(
      `${home.name} v ${away.name} did not finish (${state.phase}).`
    );
  }

  const teams = {
    home: engine.getTeam(home.id) ?? home,
    away: engine.getTeam(away.id) ?? away,
  };
  const penalties = state.result?.penalties;
  const fanFactors = state.fanFactors;
  const score = bySide(state.score, home, away);
  const updated = await recordCompetitionFixture(
    {
      context,
      homeScore: score.home,
      awayScore: score.away,
      progressedTeams: teams,
      ...(penalties && { penalties: bySide(penalties, home, away) }),
      options: {
        ...(fanFactors && { fanFactors: bySide(fanFactors, home, away) }),
        stalled: stalledSides(state.stallingPlayerIds, teams.home, teams.away),
      },
    }
  );

  const tracker = game.ctx.matchStats;
  const both = [teams.home, teams.away];
  awardMvps(tracker, both, rng);
  const summary = tracker.applySpp(
    both,
    state.result?.reason === "concession"
      ? state.result.concedingTeamId
      : undefined
  );
  foldMatchSummaryIntoCareers(both, summary);
  const sppEarned = Object.fromEntries(
    summary.players.map((stats) => [stats.playerId, stats.sppEarned])
  );
  const matchId = `match-${String(seed)}`;
  const management = both.map((team) => {
    recordPendingDevelopment(team, matchId, state.raisedDead?.[team.id], {
      leagueFixture: !!state.paysWinnings,
      playedIds: new Set(tracker.getEligibleMvpPlayers(team.id)),
    });
    keepRecordedResult(team);
    if (!carriesInjuries(team, true)) {
      keepPreMatchInjuries(
        team,
        beforeMatch.find((before) => before.id === team.id)
      );
    }
    saveTeam(team);

    const stored = getTeamById(team.id)!;
    const report = manageComputerTeam(stored, rng);
    saveTeam(stored);
    return report;
  });

  return {
    casualties: both.flatMap((team) =>
      team.players
        .filter((player) => isOut(player) && !sittingOut.has(player.id))
        .map((player) => ({ team, player }))
    ),
    fixture: updated.fixtures.find((candidate) => candidate.id === fixtureId)!,
    competition: updated,
    teams,
    sppEarned,
    management,
    recording,
  };
}
