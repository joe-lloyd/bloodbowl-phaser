import type { GameType } from "../game/variants/gameTypes";
import type { Difficulty } from "../simulation/ai/difficulty";
import { type SeedMetadata } from "../types/seedMetadata";
import { type RosterRuleProfile } from "./rosterRules";
import type { FixtureWinnings } from "../game/rules/winnings";
import type { SevensRuleset } from "../game/rules/sevensRuleset";

export type CompetitionType = "league" | "tournament";
export type TournamentFormat = "single-elimination" | "round-robin";
export type CompetitionStatus = "draft" | "active" | "complete";

export interface CompetitionContext {
  ruleset?: SevensRuleset;
  gameType?: GameType;
  competitionType: CompetitionType;
  competitionId: string;
  fixtureId: string;

  knockout?: boolean;
}

export interface CompetitionEntrant {
  id: string;
  teamId: string;

  ownerUid: string | null;

  name: string;

  coachName?: string;
  coachUid?: string | null;
  rosterName: string;
  seed: number;

  withdrawn?: boolean;

  computerCoached?: true;
}

export interface PenaltyShootout {
  home: number;
  away: number;
}

export interface FixtureResult {
  homeScore: number;
  awayScore: number;

  penalties?: PenaltyShootout;
  winnerEntrantId?: string;
  completedAt: number;
  bye?: boolean;

  walkover?: { withdrawnEntrantIndex: number };

  winnings?: FixtureWinnings;
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

export interface CompetitionBase {
  ruleset?: SevensRuleset;
  gameType?: GameType;
  id: string;
  name: string;
  organizerUid: string | null;
  participantUids: string[];
  status: CompetitionStatus;
  entrants: CompetitionEntrant[];
  fixtures: CompetitionFixture[];
  standings: Standing[];
  reporterEntrantIndex?: number;
  createdAt: number;
  updatedAt: number;
  seedMetadata?: SeedMetadata;
  rosterProfile?: RosterRuleProfile;
  computerDifficulty?: Difficulty;
}

export interface LeagueDoc extends CompetitionBase {
  type: "league";
  points: LeaguePoints;
}

export interface TournamentDoc extends CompetitionBase {
  type: "tournament";
  format: TournamentFormat;
  championEntrantId?: string;
}

export type CompetitionDoc = LeagueDoc | TournamentDoc;

export const DEFAULT_LEAGUE_POINTS: LeaguePoints = {
  win: 3,
  draw: 1,
  loss: 0,
};

export function competitionPath(
  competition: Pick<CompetitionContext, "competitionType" | "competitionId">
): string {
  const route =
    competition.competitionType === "league" ? "leagues" : "tournaments";
  return `/${route}/${competition.competitionId}`;
}
