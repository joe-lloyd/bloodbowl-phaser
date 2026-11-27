import { getTeamById, saveTeam } from "../game/managers/TeamManager";
import { rollDraftOffers } from "../game/progression/advancementModes";
import {
  applyRedraft,
  computerRedraftChoice,
  REDRAFT_BASE_BUDGET,
  type RedraftChoice,
  redraftBudget,
  restAndRelaxation,
} from "../game/rules/redraft";
import type { RNGService } from "../services/rng/RNGService";
import { type Team, hasBlockingPendingDevelopment } from "../types/Team";
import { manageComputerTeam, settleDraftOffers } from "./computerTeams";
import { homeLeagueOf, loadClub } from "./homeLeague";
import type { LeagueDoc, TournamentDoc } from "./types";

const BUDGET_STEP = 5000;

export interface OffSeason {
  clubWins: number;
  newcomerBudget: number;
}

function teamOf(
  competition: LeagueDoc | TournamentDoc,
  entrantId: string | null | undefined
): string | undefined {
  return competition.entrants.find((entrant) => entrant.id === entrantId)?.teamId;
}

function seasonWins(
  regular: LeagueDoc,
  playOffs: TournamentDoc
): Map<string, number> {
  const wins = new Map<string, number>();
  for (const standing of regular.standings) {
    const teamId = teamOf(regular, standing.entrantId);
    if (teamId) wins.set(teamId, standing.wins);
  }
  for (const fixture of playOffs.fixtures) {
    const teamId = teamOf(playOffs, fixture.result?.winnerEntrantId);
    if (teamId && !fixture.result?.bye) wins.set(teamId, (wins.get(teamId) ?? 0) + 1);
  }
  return wins;
}

function closeSeason(team: Team, rng: RNGService, season: number): void {
  restAndRelaxation(team, () => rng.rollDie(6));
  for (const player of team.players) player.seasons = (player.seasons ?? 0) + 1;
  rollDraftOffers(team, rng, `season-${String(season)}`);
}

function redraftRival(team: Team, wins: number, rng: RNGService): number {
  settleDraftOffers(team);
  const budget = redraftBudget(team.treasury, wins);
  applyRedraft(team, computerRedraftChoice(team, budget), budget);
  manageComputerTeam(team, rng);
  return budget;
}

function averageBudget(budgets: readonly number[]): number {
  if (budgets.length === 0) return REDRAFT_BASE_BUDGET;
  const mean = budgets.reduce((sum, budget) => sum + budget, 0) / budgets.length;
  return Math.floor(mean / BUDGET_STEP) * BUDGET_STEP;
}

export async function runOffSeason({
  regular,
  playOffs,
  clubId,
  rng,
}: {
  regular: LeagueDoc;
  playOffs: TournamentDoc;
  clubId: string;
  rng: RNGService;
}): Promise<OffSeason> {
  const wins = seasonWins(regular, playOffs);
  const season = homeLeagueOf(loadClub(clubId)).season;
  const budgets: number[] = [];
  for (const entrant of regular.entrants) {
    const team = getTeamById(entrant.teamId);
    if (!team) continue;
    closeSeason(team, rng, season);
    const teamWins = wins.get(team.id) ?? 0;
    budgets.push(
      team.id === clubId
        ? redraftBudget(team.treasury, teamWins)
        : redraftRival(team, teamWins, rng)
    );
    await saveTeam(team);
  }
  return { clubWins: wins.get(clubId) ?? 0, newcomerBudget: averageBudget(budgets) };
}

export function clubRedraftBudget(team: Team): number | undefined {
  const wins = homeLeagueOf(team).redraftWins;
  return wins === undefined ? undefined : redraftBudget(team.treasury, wins);
}

export async function confirmRedraft(
  clubId: string,
  choice: RedraftChoice
): Promise<void> {
  const club = loadClub(clubId);
  const budget = clubRedraftBudget(club);
  if (budget === undefined) throw new Error("No redraft is waiting.");
  if (hasBlockingPendingDevelopment(club))
    throw new Error(`Finish ${club.name}'s post-game steps on its team sheet first.`);
  const refusal = applyRedraft(club, choice, budget);
  if (refusal) throw new Error(refusal);
  const league = { ...homeLeagueOf(club) };
  delete league.redraftWins;
  club.club.league = league;
  await saveTeam(club);
}
