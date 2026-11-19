import {
  type ExecutionLayer,
  type ObservedRun,
  type ScenarioCase,
  type SeededVariant,
} from "../scenarioCase/types";
import type { EngineObservedRun } from "../adapters/engineAdapter";

export interface DiagnosticBundle {
  key: string;
  layer: ExecutionLayer;
  capturedAt: string;
  case: {
    id: string;
    name: string;
    capability: string;
    interactions: string[];
    tags: string[];
    regressionId?: string;
  };
  variant: {
    id: string;
    name: string;
    seed: number;
    expectedOutcome: string;
  };
  fixture: {
    team1Roster?: string;
    team2Roster?: string;
    syntheticGrants: { player: string; skill?: string; reason: string }[];
  };
  setup: unknown;
  steps: {
    index: number;
    intent: string;
    command: unknown;
    ok?: boolean;
    reason?: string;
    replies?: unknown[];
  }[];
  failure?: {
    checkpointId: string;
    checkpointDescription: string;
    message: string;
  };
  decisions: unknown[];
  events: { name: string; data?: unknown }[];
  responses: unknown[];
  initialSnapshot: unknown;
  finalSnapshot: unknown;

  replay: {
    engine: string;
    browser: string;
    headed: string;
    sandboxUrl: string;
  };
}

export interface BundleInput {
  scenarioCase: ScenarioCase;
  variant: SeededVariant;
  observed: ObservedRun;
  failure?: {
    checkpointId: string;
    checkpointDescription: string;
    message: string;
  };

  capturedAt?: string;
}

export function buildDiagnosticBundle({
  scenarioCase,
  variant,
  observed,
  failure,
  capturedAt,
}: BundleInput): DiagnosticBundle {
  const key = `${scenarioCase.id}/${variant.id}`;
  const engineRun = observed as Partial<EngineObservedRun>;

  return {
    key,
    layer: observed.layer,
    capturedAt: capturedAt ?? new Date().toISOString(),
    case: {
      id: scenarioCase.id,
      name: scenarioCase.name,
      capability: scenarioCase.capability,
      interactions: [...scenarioCase.interactions],
      tags: [...(scenarioCase.tags ?? [])],
      ...(scenarioCase.regression
        ? { regressionId: scenarioCase.regression.id }
        : {}),
    },
    variant: {
      id: variant.id,
      name: variant.name,
      seed: variant.seed,
      expectedOutcome: variant.expectedOutcome,
    },
    fixture: {
      ...(scenarioCase.setup.team1Roster === undefined ? {} : { team1Roster: scenarioCase.setup.team1Roster }),
      ...(scenarioCase.setup.team2Roster === undefined ? {} : { team2Roster: scenarioCase.setup.team2Roster }),
      syntheticGrants: (scenarioCase.syntheticGrants ?? []).map((grant) => ({
        player: grant.player,
        ...(grant.skill ? { skill: String(grant.skill) } : {}),
        reason: grant.reason,
      })),
    },
    setup: scenarioCase.setup,

    steps:
      engineRun.stepLog?.map((record) => ({
        index: record.index,
        intent: record.intent,
        command: record.command,
        ok: record.ok,
        ...(record.reason ? { reason: record.reason } : {}),
        replies: record.replies,
      })) ??
      scenarioCase.steps.map((step, index) => ({
        index,
        intent: step.intent ?? step.command.type,
        command: step.command,
      })),
    ...(failure ? { failure } : {}),
    decisions: observed.decisions,
    events: observed.events,
    responses: observed.responses,
    initialSnapshot: observed.initialSnapshot,
    finalSnapshot: observed.snapshot,
    replay: {
      engine: `pnpm e2e:replay ${scenarioCase.id} --variant ${variant.id}`,
      browser: `pnpm e2e:replay ${scenarioCase.id} --variant ${variant.id} --browser`,
      headed: `pnpm e2e:replay ${scenarioCase.id} --variant ${variant.id} --headed`,
      sandboxUrl: sandboxUrlFor(scenarioCase, variant),
    },
  };
}

export function sandboxUrlFor(
  scenarioCase: ScenarioCase,
  variant: SeededVariant
): string {
  const query = new URLSearchParams({
    scenario: scenarioCase.id,
    seed: String(variant.seed),
    outcome: variant.id,
  });
  return `/sand-box?${query.toString()}`;
}

export function bundleFileName(
  scenarioCase: ScenarioCase,
  variant: SeededVariant,
  layer: ExecutionLayer
): string {
  return `${scenarioCase.id}__${variant.id}__${layer}.json`;
}
