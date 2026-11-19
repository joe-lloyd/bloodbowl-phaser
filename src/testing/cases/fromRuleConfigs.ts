import { RULE_SCENARIOS } from "../../data/ruleScenarios";
import { type RuleConfig, type RuleOutcome } from "../../game/rules-lab";
import { SkillType } from "../../types/Skills";
import {
  type ExpectedCheckpoint,
  type ObservedRun,
  type ScenarioCase,
  type SeededVariant,
  type SemanticStep,
} from "../scenarioCase/types";
import type { EngineObservedRun } from "../adapters/engineAdapter";
import { committedSeedFor } from "../seeds/committedSeeds";

export function ruleCaseId(configId: string): string {
  return `rule-${configId}`;
}

function asScriptResult(observed: ObservedRun) {
  const engineRun = observed as EngineObservedRun;
  if (!engineRun.game) {
    throw new Error(
      "rule-catalog outcomes can only be evaluated on an engine run"
    );
  }
  return {
    game: engineRun.game,
    responses: engineRun.responses,
    decisions: engineRun.decisions,
    events: engineRun.events,
    snapshot: engineRun.snapshot,
  };
}

function outcomeCheckpoint(
  config: RuleConfig,
  outcome: RuleOutcome
): ExpectedCheckpoint {
  return {
    id: `outcome-${outcome.id}`,
    description: outcome.name,
    layers: ["engine"],
    assert(observed) {
      const result = asScriptResult(observed);
      if (!outcome.matches(result)) {
        throw new Error(
          `the run does not exhibit '${outcome.name}' — the committed seed no ` +
            `longer produces this outcome for '${config.id}'`
        );
      }

      outcome.verify?.(result);
    },
  };
}

function stepsFor(config: RuleConfig): SemanticStep[] {
  return (config.script ?? []).map((command) => ({ command }));
}

function capabilityFor(skill: SkillType): string {
  return `rule:${skill}`;
}

function scenarioCaseFromRuleConfig(
  skill: SkillType,
  config: RuleConfig
): ScenarioCase {
  const variants: SeededVariant[] = config.outcomes.map((outcome) => {
    const seed = committedSeedFor(config.id, outcome.id) ?? outcome.exampleSeed;
    return {
      id: outcome.id,
      name: outcome.name,
      ...(outcome.description ? { description: outcome.description } : {}),

      seed: seed ?? Number.NaN,
      expectedOutcome: outcome.name,
      checkpoints: [outcomeCheckpoint(config, outcome)],
      interactive: true,
    };
  });

  return {
    id: ruleCaseId(config.id),
    name: config.name,
    description: config.description,
    capability: capabilityFor(skill),
    interactions: [`rule-config:${config.id}`],
    setup: config.setup,
    ...(config.rerolls ? { rerolls: config.rerolls } : {}),
    ...(config.decisionPolicy ? { decisionPolicy: config.decisionPolicy } : {}),
    ...(config.skillProvenance
      ? {
          syntheticGrants: config.skillProvenance
            .filter((entry) => entry.source === "scenario-isolation")
            .map((entry) => ({
              player: entry.playerRef,
              skill: entry.skill,
              reason: entry.reason,
            })),
        }
      : {}),
    steps: stepsFor(config),
    layers: ["engine"],
    interactive: true,
    tags: ["rule-catalog", String(skill)],
    source: { kind: "rule-config", id: config.id },
    variants,

    checkpoints: [],
  };
}

export function ruleScenarioCases(): ScenarioCase[] {
  return RULE_SCENARIOS.flatMap((entry) =>
    entry.configs.map((config) =>
      scenarioCaseFromRuleConfig(entry.skill, config)
    )
  );
}

export function ruleOutcomesMissingSeeds(): {
  configId: string;
  outcomeId: string;
  skill: SkillType;
}[] {
  const missing: { configId: string; outcomeId: string; skill: SkillType }[] =
    [];
  for (const entry of RULE_SCENARIOS) {
    for (const config of entry.configs) {
      for (const outcome of config.outcomes) {
        const seed =
          committedSeedFor(config.id, outcome.id) ?? outcome.exampleSeed;
        if (seed === undefined) {
          missing.push({
            configId: config.id,
            outcomeId: outcome.id,
            skill: entry.skill,
          });
        }
      }
    }
  }
  return missing;
}
