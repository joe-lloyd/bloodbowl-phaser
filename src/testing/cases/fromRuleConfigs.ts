/**
 * Turns the rule-scenario catalog into scenario cases.
 *
 * The catalog already describes, per skill, a setup, a script and the named
 * outcomes that matter — everything a case needs except a committed seed and
 * a coverage claim. Generating cases from it means:
 *
 *   * every registered rule outcome joins the E2E matrix automatically, with
 *     no hand-written test file, and
 *   * adding a rule config or an outcome shows up in the next coverage
 *     report rather than needing to be remembered.
 *
 * An outcome with no committed seed still produces a case, marked so the
 * coverage gate can name it as a gap. That is deliberate: a silently missing
 * outcome is exactly what this change exists to prevent.
 */

import { RULE_SCENARIOS } from "../../data/ruleScenarios";
import { RuleConfig, RuleOutcome } from "../../game/rules-lab";
import { SkillType } from "../../types/Skills";
import {
  ExpectedCheckpoint,
  ObservedRun,
  ScenarioCase,
  SeededVariant,
  SemanticStep,
} from "../scenarioCase/types";
import type { EngineObservedRun } from "../adapters/engineAdapter";
import { committedSeedFor } from "../seeds/committedSeeds";

/** Case ids are namespaced so they cannot collide with authored cases. */
export function ruleCaseId(configId: string): string {
  return `rule-${configId}`;
}

/**
 * A rule outcome's predicate needs the rules-lab `ScriptResult` shape, which
 * is the engine adapter's observation plus the live game. Browser runs cannot
 * supply that, which is why generated rule cases declare the engine layer
 * only — a browser representative for a rule is written by hand.
 */
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

/** The catalog's own predicate and verifier, as a case checkpoint. */
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
      // The catalog's extra assertions run only on a matching run, exactly as
      // they do in the rule suite.
      outcome.verify?.(result);
    },
  };
}

function stepsFor(config: RuleConfig): SemanticStep[] {
  return (config.script ?? []).map((command) => ({ command }));
}

/** Which capability bucket a skill's cases report under. */
function capabilityFor(skill: SkillType): string {
  return `rule:${skill}`;
}

/**
 * One case per rule configuration, with one variant per declared outcome.
 *
 * Grouping by config (rather than one case per outcome) keeps the setup and
 * script written once, which is what makes "this seed produces that branch"
 * a meaningful statement.
 */
export function scenarioCaseFromRuleConfig(
  skill: SkillType,
  config: RuleConfig
): ScenarioCase {
  const variants: SeededVariant[] = config.outcomes.map((outcome) => {
    const seed = committedSeedFor(config.id, outcome.id) ?? outcome.exampleSeed;
    return {
      id: outcome.id,
      name: outcome.name,
      ...(outcome.description ? { description: outcome.description } : {}),
      // A missing seed is left as NaN on purpose: schema validation rejects
      // it by name, which is a far better failure than a run on seed 0.
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
    // Every expectation lives on the variant: an outcome predicate is by
    // definition specific to its branch.
    checkpoints: [],
  };
}

/** Every rule configuration in the catalog, as scenario cases. */
export function ruleScenarioCases(): ScenarioCase[] {
  return RULE_SCENARIOS.flatMap((entry) =>
    entry.configs.map((config) =>
      scenarioCaseFromRuleConfig(entry.skill, config)
    )
  );
}

/** Config/outcome pairs with no committed seed — the coverage gate's input. */
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
