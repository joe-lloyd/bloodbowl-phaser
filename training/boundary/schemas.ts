import { z } from "zod";
import { DEFAULT_WEIGHTS, type Weights } from "../../src/simulation/ai/weights";
import {
  EXPERIMENTAL_MATCH_TYPES,
  GAME_TYPES,
} from "../../src/game/variants/gameTypes";
import { RosterName } from "../../src/types/Team";
import { SECRET_ROSTER_NAMES } from "../../src/data/secretLeague/secretRosterNames";

export type WeightName = keyof Weights;

const isWeightName = (name: string): name is WeightName =>
  Object.hasOwn(DEFAULT_WEIGHTS, name);

function nonEmpty<T>(items: readonly T[]): [T, ...T[]] {
  const [first, ...rest] = items;
  if (first === undefined) throw new Error("Expected at least one value");
  return [first, ...rest];
}

export const WEIGHT_NAMES = nonEmpty(
  Object.keys(DEFAULT_WEIGHTS).filter(isWeightName)
);
export const TUNABLE_ROSTERS = nonEmpty(Object.values(RosterName));
export const ALL_ROSTERS = nonEmpty([
  ...TUNABLE_ROSTERS,
  ...SECRET_ROSTER_NAMES,
]);
const MATCH_TYPES = [...GAME_TYPES, ...EXPERIMENTAL_MATCH_TYPES] as const;

const weightName = z.enum(WEIGHT_NAMES);
const gameType = z.enum(GAME_TYPES);
const matchType = z.enum(MATCH_TYPES);
const tunableRoster = z.enum(TUNABLE_ROSTERS);
const anyRoster = z.enum(ALL_ROSTERS);
const text = z.string();
const count = z.number();
const overrides = z.partialRecord(weightName, z.number());

export const layersSchema = z.object({
  weights: overrides,
  rosters: z.partialRecord(tunableRoster, overrides),
  gameTypes: z.partialRecord(gameType, overrides),
});
export type Layers = z.infer<typeof layersSchema>;

const layer = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("all") }),
  z.object({ kind: z.literal("gameType"), gameType }),
  z.object({ kind: z.literal("roster"), roster: tunableRoster }),
]);
export type Layer = z.infer<typeof layer>;

const setBy = z.enum(["default", "game type", "roster"]);

const plannerWeight = z.object({
  name: weightName,
  label: text,
  group: text,
  description: text,
  defaultValue: count,
  bounds: z.tuple([count, count]),
  value: count,
  setBy,
  overrides: z.array(z.object({ layer, value: count })),
  plans: z.array(z.object({ plan: text, value: count })),
});

const evaluationFeature = z.object({
  name: text,
  label: text,
  description: text,
  defaultValue: count,
  value: count,
});

const weightsView = z.object({
  matchType,
  roster: anyRoster.nullable(),
  groups: z.array(z.object({ id: text, title: text, summary: text })),
  planner: z.array(plannerWeight),
  evaluation: z.array(evaluationFeature),
  current: layersSchema,
});
export type WeightsView = z.infer<typeof weightsView>;

const teamSkill = z.object({
  name: text,
  use: z.enum(["chooses", "prices", "engine", "ignores"]),
  note: text,
});

const position = z.object({
  name: text,
  cost: count,
  maxAllowed: count.nullable(),
  stats: z.object({ MA: count, ST: count, AG: count, PA: count, AV: count }),
  keywords: z.array(text),
  skills: z.array(teamSkill),
});

const build = z.object({
  name: text,
  build: text,
  rerolls: count,
  players: z.array(z.object({ position: text, count })),
});

const teamView = z.object({
  roster: anyRoster,
  matchType,
  tier: count,
  rerollCost: count,
  apothecary: z.boolean(),
  specialRules: z.array(text),
  positions: z.array(position),
  builds: z.array(build),
  draft: z.object({
    budget: count,
    minPlayers: count,
    maxPlayers: count,
    maxNonLinemen: count.nullable(),
  }),
  weights: z.array(
    plannerWeight.pick({ name: true, label: true, value: true, setBy: true })
  ),
});
export type TeamView = z.infer<typeof teamView>;

const teamSummary = z.object({
  roster: anyRoster,
  tier: count,
  secret: z.boolean(),
  positions: count,
  ignored: count,
});

export const CANDIDATE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const candidateId = z.string().max(60).regex(CANDIDATE_ID);

export const aboutSchema = z.object({
  name: z.string().trim().min(1).max(60),
  note: z.string().max(2000),
  savedAt: text,
});

const change = z.object({
  layer,
  weight: weightName,
  current: count.nullable(),
  candidate: count.nullable(),
});
export type Change = z.infer<typeof change>;

const candidateSummary = aboutSchema.extend({
  id: candidateId,
  changes: count,
});
export type CandidateSummary = z.infer<typeof candidateSummary>;

const candidate = candidateSummary.extend({
  layers: layersSchema,
  diff: z.array(change),
});
export type Candidate = z.infer<typeof candidate>;

const tool = <Input extends z.ZodType, Output extends z.ZodType>(
  description: string,
  input: Input,
  output: Output
) => ({ description, input, output });

const empty = z.object({});
const byId = z.object({ id: candidateId });

export const TOOLS = {
  list_weights: tool(
    "Every planner weight and board-evaluation feature, grouped by what it makes the coach do, with its default, tuning bounds and value after the game-type and roster layers merge.",
    z.object({
      matchType: matchType.default("sevens"),
      roster: anyRoster.optional(),
    }),
    weightsView
  ),
  list_teams: tool(
    "Every roster with its tier and how many of its skills the coach ignores.",
    empty,
    z.object({ teams: z.array(teamSummary) })
  ),
  get_team: tool(
    "One roster's positions, stats and skills, with how the coach uses each skill, its computer-team builds, the draft rules and the weights that differ for it.",
    z.object({ roster: anyRoster, matchType: matchType.default("sevens") }),
    teamView
  ),
  list_candidates: tool(
    "Saved candidate weight sets.",
    empty,
    z.object({ candidates: z.array(candidateSummary) })
  ),
  get_candidate: tool(
    "One candidate weight set and every change it makes against the current weights.",
    byId,
    candidate
  ),
  save_candidate: tool(
    "Save a candidate weight set under a name. The same name replaces the earlier one. Layers hold only the values that differ from the defaults, and every value must sit inside its tuning bounds. Leave out rosters or gameTypes to keep the current ones; an empty object clears them.",
    aboutSchema.pick({ name: true, note: true }).extend({
      layers: layersSchema.partial({ rosters: true, gameTypes: true }),
    }),
    candidate
  ),
  delete_candidate: tool(
    "Delete a saved candidate weight set.",
    byId,
    z.object({ deleted: candidateId })
  ),
};

export type ToolName = keyof typeof TOOLS;
export type ToolInput<N extends ToolName> = z.infer<(typeof TOOLS)[N]["input"]>;
export type ToolOutput<N extends ToolName> = z.infer<
  (typeof TOOLS)[N]["output"]
>;

export const TOOL_NAMES = nonEmpty(Object.keys(TOOLS).filter(isToolName));

export function isToolName(name: string): name is ToolName {
  return Object.hasOwn(TOOLS, name);
}
