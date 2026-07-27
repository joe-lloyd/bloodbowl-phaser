/**
 * Per-case diagnostic bundles.
 *
 * A CI failure is only useful if it can be reproduced locally, and a stack
 * trace pointing at a checkpoint does not do that. Every failing run writes
 * a JSON bundle containing the whole story: the setup, the roster fixture,
 * the committed seed, the semantic steps as executed, which checkpoint
 * failed, the response stream, the events, and the initial and final
 * snapshots — plus the exact command to replay it.
 *
 * The browser lane writes the same bundle; Playwright's own trace,
 * screenshot, console output and retry video sit beside it in the same
 * artifact directory.
 */

import {
  ExecutionLayer,
  ObservedRun,
  ScenarioCase,
  SeededVariant,
} from "../scenarioCase/types";
import type { EngineObservedRun } from "../adapters/engineAdapter";

export interface DiagnosticBundle {
  /** `case-id/variant-id` — the stable name for filters and artifacts. */
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
  /** Copy-pasteable commands to reproduce this exact run. */
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
  /** Overrides `new Date()`, so bundle fixtures can be compared in tests. */
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
      team1Roster: scenarioCase.setup.team1Roster,
      team2Roster: scenarioCase.setup.team2Roster,
      syntheticGrants: (scenarioCase.syntheticGrants ?? []).map((grant) => ({
        player: grant.player,
        ...(grant.skill ? { skill: String(grant.skill) } : {}),
        reason: grant.reason,
      })),
    },
    setup: scenarioCase.setup,
    // Prefer the engine adapter's per-step record (it knows whether each
    // command was accepted); fall back to the declared script otherwise.
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

/**
 * The sandbox URL that reproduces this run. Deliberately free of runtime
 * player ids: only the stable case id, the committed seed, and the variant.
 */
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

/** A filesystem-safe name for a bundle file. */
export function bundleFileName(
  scenarioCase: ScenarioCase,
  variant: SeededVariant,
  layer: ExecutionLayer
): string {
  return `${scenarioCase.id}__${variant.id}__${layer}.json`;
}
