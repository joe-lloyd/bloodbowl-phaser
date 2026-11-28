import { readFileSync } from "node:fs";
import { z } from "zod";
import { parseJson } from "../../../src/boundary/json";
import { teamTelemetrySchema, usageSchema } from "../../../src/boundary/schemas/TeamTelemetry";
import { type TeamTelemetry, type Usage, addUsage, emptyUsage } from "../../../src/simulation/telemetry";

const COVERAGE_FORMAT = "bb7-coverage" as const;

interface PlayedTeam {
  readonly roster: string;
  readonly telemetry: TeamTelemetry;
}

export interface PlayedMatch {
  readonly gameType: string;
  readonly seed: number;
  readonly completed: boolean;
  readonly teams: readonly PlayedTeam[];
}

export interface RosterCoverage {
  matches: number;
  completed: number;
  readonly usage: Usage;
  readonly held: Record<string, number>;
}

export interface GameTypeCoverage {
  readonly seeds: number[];
  readonly rosters: Record<string, RosterCoverage>;
}

interface CoverageFile {
  readonly format: typeof COVERAGE_FORMAT;
  readonly gameTypes: Record<string, GameTypeCoverage>;
}

const playedMatchSchema: z.ZodType<PlayedMatch> = z.object({
  gameType: z.string(),
  seed: z.number(),
  completed: z.boolean(),
  teams: z.object({ roster: z.string(), telemetry: teamTelemetrySchema }).array(),
});

const rosterCoverageSchema: z.ZodType<RosterCoverage> = z.object({
  matches: z.number(),
  completed: z.number(),
  usage: usageSchema,
  held: z.record(z.string(), z.number()),
});

const gameTypeCoverageSchema: z.ZodType<GameTypeCoverage> = z.object({
  seeds: z.number().array(),
  rosters: z.record(z.string(), rosterCoverageSchema),
});

const coverageFileSchema: z.ZodType<CoverageFile> = z.object({
  format: z.literal(COVERAGE_FORMAT),
  gameTypes: z.record(z.string(), gameTypeCoverageSchema),
});

export const readPlayedMatch = (file: string): PlayedMatch =>
  parseJson(readFileSync(file, "utf8"), playedMatchSchema);

export const readCoverage = (file: string): CoverageFile =>
  parseJson(readFileSync(file, "utf8"), coverageFileSchema);

const emptyRoster = (): RosterCoverage => ({ matches: 0, completed: 0, usage: emptyUsage(), held: {} });

function addRoster(into: RosterCoverage, from: RosterCoverage): void {
  into.matches += from.matches;
  into.completed += from.completed;
  addUsage(into.usage, from.usage);
  for (const [skill, matches] of Object.entries(from.held)) into.held[skill] = (into.held[skill] ?? 0) + matches;
}

function addTo(rosters: Record<string, RosterCoverage>, roster: string, from: RosterCoverage): void {
  const into = rosters[roster] ?? emptyRoster();
  addRoster(into, from);
  rosters[roster] = into;
}

function rosterOf(team: PlayedTeam, completed: boolean): RosterCoverage {
  const held = Object.fromEntries(team.telemetry.held.map((skill) => [skill, 1]));
  const one = { matches: 1, completed: completed ? 1 : 0, usage: emptyUsage(), held };
  addUsage(one.usage, team.telemetry);
  return one;
}

function addGameType(into: GameTypeCoverage, from: GameTypeCoverage): void {
  const overlap = from.seeds.find((seed) => into.seeds.includes(seed));
  if (overlap !== undefined) throw new Error(`seed ${String(overlap)} appears in two shards`);
  into.seeds.push(...from.seeds);
  for (const [roster, coverage] of Object.entries(from.rosters)) addTo(into.rosters, roster, coverage);
}

export function mergeCoverage(files: readonly CoverageFile[]): CoverageFile {
  const merged: CoverageFile = { format: COVERAGE_FORMAT, gameTypes: {} };
  for (const file of files)
    for (const [gameType, coverage] of Object.entries(file.gameTypes)) {
      merged.gameTypes[gameType] ??= { seeds: [], rosters: {} };
      addGameType(merged.gameTypes[gameType], coverage);
    }
  for (const coverage of Object.values(merged.gameTypes)) coverage.seeds.sort((a, b) => a - b);
  return merged;
}

function matchCoverage({ gameType, seed, completed, teams }: PlayedMatch): CoverageFile {
  const rosters: Record<string, RosterCoverage> = {};
  for (const team of teams) addTo(rosters, team.roster, rosterOf(team, completed));
  return { format: COVERAGE_FORMAT, gameTypes: { [gameType]: { seeds: [seed], rosters } } };
}

export const coverageOf = (matches: readonly PlayedMatch[]): CoverageFile =>
  mergeCoverage(matches.map((match) => matchCoverage(match)));
