/**
 * A fixture between two computer teams is played, not decided: a whole
 * match runs headless, so its injuries, deaths and SPP are real. Around the
 * match it does what a played game does. The fixture is recorded at full
 * time (GamePage), the MVPs and SPP are awarded (the results screen), and
 * the computer then makes each team's development choices.
 */

import { getTeamById, saveTeam } from "../game/managers/TeamManager";
import { foldMatchSummaryIntoCareers } from "../game/progression/careerStats";
import { recordPendingDevelopment } from "../game/progression/postMatch";
import { HeadlessGame } from "../headless/HeadlessGame";
import { IRNGService, RNGService } from "../services/rng/RNGService";
import { plannerCoach } from "../simulation/ai/planner";
import { Coach } from "../simulation/coach";
import { MatchRecording, runMatch } from "../simulation/runMatch";
import { GamePhase } from "../types/GameState";
import { Player, PlayerStatus } from "../types/Player";
import { Team } from "../types/Team";
import { ManagementReport, manageComputerTeam } from "./computerTeams";
import {
  keepRecordedResult,
  recordCompetitionFixture,
} from "./resultRecording";
import {
  CompetitionContext,
  CompetitionDoc,
  CompetitionFixture,
} from "./types";

export interface SimulatedFixture {
  fixture: CompetitionFixture;
  competition: CompetitionDoc;
  /** Both teams as they left the pitch. */
  teams: { home: Team; away: Team };
  /** Players hurt or killed in this match, as they left the pitch. */
  casualties: { team: Team; player: Player }[];
  /** SPP each player earned, by player id. */
  sppEarned: Record<string, number>;
  /** The computer's development choices for each team afterwards. */
  management: ManagementReport[];
  recording: MatchRecording;
}

export interface SimulationOptions {
  seed?: number;
  /** Plays both sides; the computer opponent's coach if unset. */
  coach?: Coach;
  /** MVP rolls and development choices. */
  rng?: Pick<IRNGService, "rollDie">;
  /** Sees the match at kick-off, before a command is played. */
  inspect?: (game: HeadlessGame) => void;
}

const isOut = (player: Player) =>
  player.status === PlayerStatus.INJURED || player.status === PlayerStatus.DEAD;

/** A computer entrant that has not withdrawn. */
function computerEntrant(competition: CompetitionDoc, id: string | null) {
  const entrant = competition.entrants.find((candidate) => candidate.id === id);
  return entrant?.computerCoached && !entrant.withdrawn ? entrant : undefined;
}

/** Fixtures the computer can play now: ready, and between two computer teams. */
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

/**
 * The earliest round with a game still to play. A round is simulated only
 * once it is the current one, so the computer never plays ahead of a game
 * a person still has to play.
 */
export function currentRound(competition: CompetitionDoc): number | undefined {
  const open = competition.fixtures.filter(
    (fixture) => fixture.status !== "complete"
  );
  return open.length > 0
    ? Math.min(...open.map((fixture) => fixture.round))
    : undefined;
}

export async function simulateFixture(
  competition: CompetitionDoc,
  fixtureId: string,
  options: SimulationOptions = {}
): Promise<SimulatedFixture> {
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
    const team = getTeamById(entrant.teamId);
    if (!team) throw new Error(`${entrant.name} is not in this library.`);
    return team;
  };
  const home = load(fixture.homeEntrantId);
  const away = load(fixture.awayEntrantId);
  const seed = options.seed ?? Math.floor(Math.random() * 2 ** 31);
  const rng = options.rng ?? new RNGService(seed);
  const context: CompetitionContext = {
    competitionType: competition.type,
    competitionId: competition.id,
    fixtureId,
    ...(competition.type === "tournament" &&
    competition.format === "single-elimination"
      ? { knockout: true }
      : {}),
  };

  const game = new HeadlessGame({
    seed,
    team1: home,
    team2: away,
    startingPhase: GamePhase.SETUP,
    progressionEnabled: true,
    knockout: context.knockout,
  });
  options.inspect?.(game);
  // Serving a Miss Next Game is not a new casualty
  const sittingOut = new Set(
    [game.ctx.team1, game.ctx.team2].flatMap((team) =>
      team.players.filter(isOut).map((player) => player.id)
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

  // GamePage: the fixture is recorded the moment the match ends
  const teams = {
    home: engine.getTeam(home.id) ?? home,
    away: engine.getTeam(away.id) ?? away,
  };
  const penalties = state.result?.penalties;
  const updated = await recordCompetitionFixture(
    context,
    state.score[home.id] ?? 0,
    state.score[away.id] ?? 0,
    teams,
    penalties && {
      home: penalties[home.id] ?? 0,
      away: penalties[away.id] ?? 0,
    }
  );

  // The results screen: MVPs, SPP, then development to make
  const tracker = game.ctx.matchStats;
  const both = [teams.home, teams.away];
  for (const team of both) {
    const nominees = tracker.getEligibleMvpPlayers(team.id).slice(0, 6);
    if (nominees.length > 0)
      tracker.awardMvp(team.id, nominees, rng.rollDie(nominees.length));
  }
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
  const matchId = `match-${seed}`;
  const management = both.map((team) => {
    recordPendingDevelopment(team, matchId, state.raisedDead?.[team.id]);
    keepRecordedResult(team);
    saveTeam(team);
    // The computer makes the choices a coach makes from Manage Team
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
