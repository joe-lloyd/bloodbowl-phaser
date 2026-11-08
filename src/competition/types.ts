import type { Difficulty } from "../simulation/ai/difficulty";
import { SeedMetadata } from "../types/seedMetadata";
import { RosterRuleProfile } from "./rosterRules";

export type CompetitionType = "league" | "tournament";
export type TournamentFormat = "single-elimination" | "round-robin";
export type CompetitionStatus = "draft" | "active" | "complete";

export interface CompetitionContext {
  competitionType: CompetitionType;
  competitionId: string;
  fixtureId: string;
  /** A knockout tie: a draw goes to Extra Time, then Penalties. */
  knockout?: boolean;
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
  /**
   * Set when the coach withdraws. Games already played stand; the ones left
   * close as walkovers (FixtureResult.walkover).
   */
  withdrawn?: boolean;
  /**
   * The computer coaches this entrant. Its team is in the organizer's
   * library; a game between two computer entrants is simulated.
   */
  computerCoached?: true;
}

/**
 * A Penalty Shoot-out (2025 rulebook, Penalties): five roll-offs, each won
 * by one side, after a knockout game is still level at the end of Extra Time.
 */
export interface PenaltyShootout {
  home: number;
  away: number;
}

export interface FixtureResult {
  homeScore: number;
  awayScore: number;
  /** Decided a level knockout game; the side that won more goes through. */
  penalties?: PenaltyShootout;
  winnerEntrantId?: string;
  completedAt: number;
  bye?: boolean;
  /**
   * Never played: one side had withdrawn. The other side wins it, and goes
   * through in a knockout, but the table leaves it out. The index names the
   * withdrawn entrant in `entrants`, so the database rules can check it.
   */
  walkover?: { withdrawnEntrantIndex: number };
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
  /** Where in `entrants` the last reporting coach's team is; rules check it. */
  reporterEntrantIndex?: number;
  points: LeaguePoints;
  createdAt: number;
  updatedAt: number;
  /** Development seed ownership; absent on coach-created competitions. */
  seedMetadata?: SeedMetadata;
  /** Versioned advancement-mode/budget/roster requirements, snapshotted at
   *  creation (see competition-roster-rules). Absent = legacy competition:
   *  compatibility is not enforced until the organizer edits/migrates it. */
  rosterProfile?: RosterRuleProfile;
  /** How hard the computer plays a person; Standard if unset. */
  computerDifficulty?: Difficulty;
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
  /** See LeagueDoc.reporterEntrantIndex. */
  reporterEntrantIndex?: number;
  championEntrantId?: string;
  createdAt: number;
  updatedAt: number;
  /** Development seed ownership; absent on coach-created competitions. */
  seedMetadata?: SeedMetadata;
  /** See LeagueDoc.rosterProfile. */
  rosterProfile?: RosterRuleProfile;
  /** See LeagueDoc.computerDifficulty. */
  computerDifficulty?: Difficulty;
}

export type CompetitionDoc = LeagueDoc | TournamentDoc;

export const DEFAULT_LEAGUE_POINTS: LeaguePoints = {
  win: 3,
  draw: 1,
  loss: 0,
};

/** The page a competition is shown on. */
export function competitionPath(
  competition: Pick<CompetitionContext, "competitionType" | "competitionId">
): string {
  const route =
    competition.competitionType === "league" ? "leagues" : "tournaments";
  return `/${route}/${competition.competitionId}`;
}
