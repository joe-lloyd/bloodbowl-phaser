import { getComputerTeamTemplates } from "../../src/competition/computerTeamTemplates";
import { getRosterByRosterName } from "../../src/data/RosterTemplates";
import { matchTypeRules } from "../../src/game/variants/gameTypeRules";
import { isGameType, type MatchType } from "../../src/game/variants/gameTypes";
import {
  evaluationWeightsFor,
  FEATURES,
} from "../../src/simulation/ai/evaluate";
import { EVALUATION_WEIGHTS } from "../../src/simulation/ai/evaluationWeights";
import { GAME_PLANS } from "../../src/simulation/ai/gamePlans";
import {
  DEFAULT_WEIGHTS,
  GAME_TYPE_WEIGHTS,
  ROSTER_WEIGHTS,
  weightBounds,
} from "../../src/simulation/ai/weights";
import type { PlayerTemplate } from "../../src/types/Player";
import { isStandardRosterName, type RosterName } from "../../src/types/Team";
import {
  type TeamView,
  type ToolInput,
  type ToolOutput,
  WEIGHT_NAMES,
  type WeightName,
  type WeightsView,
} from "../boundary/schemas";
import { FEATURE_INFO } from "./featureInfo";
import { currentLayers, LAYERS, layerValues } from "./layers";
import { SKILL_USE } from "./skillUse";
import { GROUPS, WEIGHT_INFO } from "./weightInfo";

type PlannerWeight = WeightsView["planner"][number];

function hasValue<Entry extends { value: number | undefined }>(
  entry: Entry
): entry is Entry & { value: number } {
  return entry.value !== undefined;
}

function merged(name: WeightName, matchType: MatchType, roster?: RosterName) {
  const own = roster === undefined ? undefined : ROSTER_WEIGHTS[roster]?.[name];
  if (own !== undefined) return { value: own, setBy: "roster" } as const;
  const typed = GAME_TYPE_WEIGHTS[matchType]?.[name];
  if (typed !== undefined) return { value: typed, setBy: "game type" } as const;
  return { value: DEFAULT_WEIGHTS[name], setBy: "default" } as const;
}

function plannerWeight(
  name: WeightName,
  input: ToolInput<"list_weights">
): PlannerWeight {
  const layers = currentLayers();
  return {
    name,
    ...WEIGHT_INFO[name],
    defaultValue: DEFAULT_WEIGHTS[name],
    bounds: weightBounds(name),
    ...merged(name, input.matchType, input.roster),
    overrides: LAYERS.map((layer) => ({
      layer,
      value: layerValues(layers, layer)[name],
    })).filter(hasValue),
    plans: GAME_PLANS.map((plan) => ({
      plan: plan.name,
      value: plan.weights?.[name],
    })).filter(hasValue),
  };
}

export function weightsView(input: ToolInput<"list_weights">): WeightsView {
  const evaluation = evaluationWeightsFor(input.matchType);
  return {
    matchType: input.matchType,
    roster: input.roster ?? null,
    groups: Object.entries(GROUPS).map(([id, group]) => ({ id, ...group })),
    planner: WEIGHT_NAMES.map((name) => plannerWeight(name, input)),
    evaluation: (["bias", ...FEATURES] as const).map((name) => ({
      name,
      ...FEATURE_INFO[name],
      defaultValue: EVALUATION_WEIGHTS[name],
      value: evaluation[name],
    })),
    current: currentLayers(),
  };
}

function position(template: PlayerTemplate): TeamView["positions"][number] {
  return {
    name: template.positionName,
    cost: template.cost,
    maxAllowed: template.maxAllowed ?? null,
    stats: template.stats,
    keywords: template.keywords,
    skills: template.skills.map((skill) => ({
      name: skill.type,
      ...SKILL_USE[skill.type],
    })),
  };
}

function ignoredSkills(roster: RosterName): number {
  const skills = getRosterByRosterName(roster).playerTemplates.flatMap(
    (template) => template.skills.map((skill) => skill.type)
  );
  return new Set(skills.filter((type) => SKILL_USE[type].use === "ignores"))
    .size;
}

export function teamList(
  rosters: readonly RosterName[]
): ToolOutput<"list_teams"> {
  return {
    teams: rosters.map((roster) => {
      const template = getRosterByRosterName(roster);
      return {
        roster,
        tier: template.tier,
        secret: !isStandardRosterName(roster),
        positions: template.playerTemplates.length,
        ignored: ignoredSkills(roster),
      };
    }),
  };
}

const computerBuilds = (matchType: MatchType) =>
  isGameType(matchType) ? getComputerTeamTemplates({ gameType: matchType }) : [];

export function teamView(input: ToolInput<"get_team">): TeamView {
  const { roster, matchType } = input;
  const template = getRosterByRosterName(roster);
  const { draft } = matchTypeRules(matchType);
  return {
    roster,
    matchType,
    tier: template.tier,
    rerollCost: template.rerollCost,
    apothecary: template.apothecary,
    specialRules: template.specialRules,
    positions: template.playerTemplates.map((t) => position(t)),
    builds: computerBuilds(matchType)
      .filter((t) => t.rosterName === roster)
      .map((t) => ({
        name: t.name,
        build: t.buildName,
        rerolls: t.rerolls,
        players: t.players.map(([name, count]) => ({ position: name, count })),
      })),
    draft: {
      budget: draft.budget,
      minPlayers: draft.minPlayers,
      maxPlayers: draft.maxPlayers,
      maxNonLinemen: Number.isFinite(draft.maxNonLinemen)
        ? draft.maxNonLinemen
        : null,
    },
    weights: WEIGHT_NAMES.map((name) => ({
      name,
      label: WEIGHT_INFO[name].label,
      ...merged(name, matchType, roster),
    })).filter((weight) => weight.setBy !== "default"),
  };
}
