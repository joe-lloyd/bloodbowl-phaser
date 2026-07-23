import { Team } from "../types/Team";

export type CompetitionType = "league" | "tournament";
export type TournamentFormat = "single-elimination" | "round-robin";
export type CompetitionStatus = "draft" | "active" | "complete";

export interface CompetitionContext {
  competitionType: CompetitionType;
  competitionId: string;
  fixtureId: string;
}

export interface CompetitionEntrant {
  /** Stable id inside the competition. */
  id: string;
  teamId: string;
  name: string;
  coachName?: string;
  rosterName: string;
  seed: number;
  source: "shared" | "local";
  sharedTeamId?: string;
  ownerUid?: string;
  /** Immutable roster snapshot used for every fixture in this competition. */
  team: Team;
}

export interface FixtureResult {
  homeScore: number;
  awayScore: number;
  winnerEntrantId?: string;
  completedAt: number;
  bye?: boolean;
}

export interface CompetitionFixture {
  id: string;
  round: number;
  order: number;
  homeEntrantId: string | null;
  awayEntrantId: string | null;
  status: "scheduled" | "ready" | "complete";
  result?: FixtureResult;
  sourceFixtureIds?: string[];
  nextFixtureId?: string;
  nextSlot?: "home" | "away";
}

export interface Standing {
  entrantId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  scoreFor: number;
  scoreAgainst: number;
  scoreDifference: number;
  points: number;
}

export interface LeaguePoints {
  win: number;
  draw: number;
  loss: number;
}

export interface LeagueDoc {
  id: string;
  type: "league";
  name: string;
  organizerUid: string | null;
  participantUids: string[];
  status: CompetitionStatus;
  entrants: CompetitionEntrant[];
  fixtures: CompetitionFixture[];
  standings: Standing[];
  points: LeaguePoints;
  createdAt: number;
  updatedAt: number;
}

export interface TournamentDoc {
  id: string;
  type: "tournament";
  name: string;
  organizerUid: string | null;
  participantUids: string[];
  status: CompetitionStatus;
  format: TournamentFormat;
  entrants: CompetitionEntrant[];
  fixtures: CompetitionFixture[];
  standings: Standing[];
  championEntrantId?: string;
  createdAt: number;
  updatedAt: number;
}

export type CompetitionDoc = LeagueDoc | TournamentDoc;

export interface SharedTeam {
  id: string;
  ownerUid: string;
  ownerName: string;
  teamId: string;
  team: Team;
  publishedAt: number;
  updatedAt: number;
}

export const DEFAULT_LEAGUE_POINTS: LeaguePoints = {
  win: 3,
  draw: 1,
  loss: 0,
};
