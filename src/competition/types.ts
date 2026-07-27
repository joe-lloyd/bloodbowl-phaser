import { Team } from "../types/Team";
import { SeedMetadata } from "../types/seedMetadata";

export type CompetitionType = "league" | "tournament";
export type TournamentFormat = "single-elimination" | "round-robin";
export type CompetitionStatus = "draft" | "active" | "complete";

export interface CompetitionContext {
  competitionType: CompetitionType;
  competitionId: string;
  fixtureId: string;
}

/**
 * An entrant references a team; it never embeds one. `teamId` + `ownerUid`
 * (null for a signed-out coach's local team) is the reference — the live
 * roster is fetched by reference when a fixture is launched
 * (src/competition/teamRefs.ts). `name`/`coachName`/`rosterName` are a
 * display cache for rendering fixture lists and brackets without fetching
 * every roster; they are refreshed opportunistically whenever a reader who
 * can see the referenced team loads the competition. `coachUid` is the
 * authoritative coach reference; `coachName` is its cached display name.
 */
export interface CompetitionEntrant {
  /** Stable id inside the competition. */
  id: string;
  teamId: string;
  /** null for a signed-out coach's locally-stored team. */
  ownerUid: string | null;
  /** Cached display name — team name. Refreshed on load when readable. */
  name: string;
  /** Cached display name for the coach; `coachUid` is authoritative. */
  coachName?: string;
  coachUid?: string | null;
  rosterName: string;
  seed: number;
  source: "shared" | "local";
  sharedTeamId?: string;
  /** Set when the coach withdraws; fixtures and standings are untouched. */
  withdrawn?: boolean;
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
  /** Development seed ownership; absent on coach-created competitions. */
  seedMetadata?: SeedMetadata;
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
  /** Development seed ownership; absent on coach-created competitions. */
  seedMetadata?: SeedMetadata;
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
