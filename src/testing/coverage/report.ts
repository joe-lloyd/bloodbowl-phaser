/**
 * The coverage report.
 *
 * Maps every inventory entry to the scenario cases that claim it, per
 * execution layer, and reports covered / excluded / missing separately per
 * layer — never as one blended percentage. A case with exhaustive engine
 * variants and no browser checkpoint is *engine-complete and browser-absent*,
 * and saying so is the whole point.
 */

import {
  ExecutionLayer,
  EXECUTION_LAYERS,
  ScenarioCase,
} from "../scenarioCase/types";
import { validateScenarioCases, LayerSupport } from "../scenarioCase/validate";
import { auditSetupFixtures } from "../fixtures/validateFixtures";
import { buildInventory, DECISION_REPLY_COMMANDS, InventoryEntry } from "./inventory";
import type { CoverageFragment } from "./observed";
import {
  COVERAGE_EXCLUSIONS,
  CoverageExclusion,
  exclusionFor,
  isExcluded,
  validateExclusions,
} from "./exclusions";

export type EntryStatus = "covered" | "excluded" | "missing" | "not-required";

export interface EntryLayerResult {
  layer: ExecutionLayer;
  status: EntryStatus;
  /** Case ids covering this entry at this layer. */
  cases: string[];
  /** Present when `status` is "excluded". */
  exclusion?: CoverageExclusion;
}

export interface EntryResult {
  entry: InventoryEntry;
  layers: EntryLayerResult[];
}

export interface CoverageIssue {
  kind:
    | "missing-required-coverage"
    | "duplicate-case-id"
    | "duplicate-regression-id"
    | "invalid-fixture"
    | "unexplained-synthetic-grant"
    | "unreachable-variant"
    | "invalid-exclusion"
    | "schema";
  message: string;
}

export interface CoverageResult {
  generatedAt: string;
  totals: Record<
    ExecutionLayer,
    { required: number; covered: number; excluded: number; missing: number }
  >;
  entries: EntryResult[];
  issues: CoverageIssue[];
  cases: {
    id: string;
    capability: string;
    layers: ExecutionLayer[];
    variants: string[];
    regressionId?: string;
  }[];
}

/**
 * Every inventory id a case claims — declared plus derived.
 *
 * Declaring `interactions` by hand is how a case states intent; deriving the
 * rest from its script and source keeps the report honest when someone
 * forgets to. Both matter: derivation alone cannot express "this case is the
 * representative for the hand-off interaction".
 */
export function claimsOf(scenarioCase: ScenarioCase): Set<string> {
  const claims = new Set<string>(scenarioCase.interactions);

  if (scenarioCase.source?.kind === "rule-config") {
    claims.add(`rule-config:${scenarioCase.source.id}`);
    for (const variant of scenarioCase.variants) {
      claims.add(`rule-outcome:${scenarioCase.source.id}/${variant.id}`);
    }
  }
  if (scenarioCase.source?.kind === "legacy-scenario") {
    claims.add(`sandbox-scenario:${scenarioCase.source.id}`);
  }

  for (const step of scenarioCase.steps) {
    claims.add(`protocol-command:${step.command.type}`);
    // A step that answers a decision proves that decision was reachable.
    for (const [decision, replies] of Object.entries(DECISION_REPLY_COMMANDS)) {
      if (replies.includes(step.command.type)) {
        claims.add(`decision:${decision}`);
      }
    }
  }

  claims.add(`phase:${scenarioCase.setup.phase}`);
  return claims;
}

export interface BuildCoverageOptions {
  inventory?: InventoryEntry[];
  exclusions?: CoverageExclusion[];
  support?: LayerSupport;
  generatedAt?: string;
  /**
   * Claims recorded by actual runs (see `coverage/observed.ts`). Decisions
   * answered by a decision policy, and phases a run reached rather than
   * started in, can only be known this way.
   */
  fragments?: CoverageFragment[];
}

export function buildCoverage(
  cases: ScenarioCase[],
  options: BuildCoverageOptions = {}
): CoverageResult {
  const inventory = options.inventory ?? buildInventory();
  const exclusions = options.exclusions ?? COVERAGE_EXCLUSIONS;
  const issues: CoverageIssue[] = [];

  // ----- Case-level validity -----
  for (const issue of validateScenarioCases(cases, options.support)) {
    issues.push({
      kind: issue.message.includes("no committed integer seed")
        ? "unreachable-variant"
        : issue.field === "id"
          ? "duplicate-case-id"
          : issue.field === "regression.id"
            ? "duplicate-regression-id"
            : "schema",
      message: `${issue.caseId} · ${issue.field}: ${issue.message}`,
    });
  }

  for (const scenarioCase of cases) {
    const audit = auditSetupFixtures(
      scenarioCase.id,
      scenarioCase.setup,
      (scenarioCase.syntheticGrants ?? []).map((grant) => ({
        player: grant.player,
        skill: grant.skill!,
        reason: grant.reason,
      }))
    );
    for (const fixtureIssue of audit.issues) {
      issues.push({
        kind:
          fixtureIssue.kind === "implausible-grant"
            ? "unexplained-synthetic-grant"
            : "invalid-fixture",
        message: `${fixtureIssue.ownerId}: ${fixtureIssue.message}`,
      });
    }
  }

  const knownIds = new Set(inventory.map((entry) => entry.id));
  for (const exclusionIssue of validateExclusions(exclusions, knownIds)) {
    issues.push({
      kind: "invalid-exclusion",
      message: `${exclusionIssue.entryId}: ${exclusionIssue.message}`,
    });
  }

  // ----- Entry × layer coverage -----
  // Static claims (what a case declares and its script implies) plus
  // observed claims (what its runs actually did), keyed per case AND layer:
  // an engine run proving a decision says nothing about the browser.
  const claimsByCase = new Map(
    cases.map((scenarioCase) => [scenarioCase.id, claimsOf(scenarioCase)])
  );
  const observedByCaseLayer = new Map<string, Set<string>>();
  for (const fragment of options.fragments ?? []) {
    const key = `${fragment.caseId}|${fragment.layer}`;
    const bucket = observedByCaseLayer.get(key) ?? new Set<string>();
    for (const claim of fragment.claims) bucket.add(claim);
    observedByCaseLayer.set(key, bucket);
  }
  const covers = (
    scenarioCase: ScenarioCase,
    layer: ExecutionLayer,
    entryId: string
  ): boolean =>
    claimsByCase.get(scenarioCase.id)?.has(entryId) === true ||
    observedByCaseLayer.get(`${scenarioCase.id}|${layer}`)?.has(entryId) === true;

  const entries: EntryResult[] = inventory.map((entry) => ({
    entry,
    layers: EXECUTION_LAYERS.map((layer): EntryLayerResult => {
      if (!entry.requiredLayers.includes(layer)) {
        return { layer, status: "not-required", cases: [] };
      }
      const covering = cases
        .filter(
          (scenarioCase) =>
            scenarioCase.layers.includes(layer) &&
            covers(scenarioCase, layer, entry.id)
        )
        .map((scenarioCase) => scenarioCase.id)
        .sort();

      if (covering.length > 0) {
        return { layer, status: "covered", cases: covering };
      }
      if (isExcluded(entry.id, layer, exclusions)) {
        return {
          layer,
          status: "excluded",
          cases: [],
          exclusion: exclusionFor(entry.id, exclusions),
        };
      }
      return { layer, status: "missing", cases: [] };
    }),
  }));

  for (const result of entries) {
    for (const layerResult of result.layers) {
      if (layerResult.status === "missing") {
        issues.push({
          kind: "missing-required-coverage",
          message:
            `${result.entry.id} (${result.entry.label}) has no ${layerResult.layer} case — ` +
            `add one, or record a reviewed exclusion`,
        });
      }
    }
  }

  // ----- Totals, per layer, never blended -----
  const totals = Object.fromEntries(
    EXECUTION_LAYERS.map((layer) => {
      const relevant = entries.flatMap((result) =>
        result.layers.filter(
          (layerResult) =>
            layerResult.layer === layer && layerResult.status !== "not-required"
        )
      );
      return [
        layer,
        {
          required: relevant.length,
          covered: relevant.filter((r) => r.status === "covered").length,
          excluded: relevant.filter((r) => r.status === "excluded").length,
          missing: relevant.filter((r) => r.status === "missing").length,
        },
      ];
    })
  ) as CoverageResult["totals"];

  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    totals,
    entries,
    issues,
    cases: cases
      .map((scenarioCase) => ({
        id: scenarioCase.id,
        capability: scenarioCase.capability,
        layers: scenarioCase.layers,
        variants: scenarioCase.variants.map((variant) => variant.id),
        ...(scenarioCase.regression
          ? { regressionId: scenarioCase.regression.id }
          : {}),
      }))
      .sort((a, b) => (a.id < b.id ? -1 : 1)),
  };
}

/** A concise, human-readable report grouped by inventory kind. */
export function renderCoverageReport(result: CoverageResult): string {
  const lines: string[] = [];
  lines.push("E2E coverage");
  lines.push("============");
  lines.push(`generated ${result.generatedAt}`);
  lines.push("");

  for (const layer of EXECUTION_LAYERS) {
    const totals = result.totals[layer];
    if (totals.required === 0) {
      lines.push(`${layer.padEnd(8)} — nothing requires this layer yet`);
      continue;
    }
    const percent = Math.round((totals.covered / totals.required) * 100);
    lines.push(
      `${layer.padEnd(8)} ${totals.covered}/${totals.required} covered (${percent}%), ` +
        `${totals.excluded} excluded, ${totals.missing} missing`
    );
  }
  lines.push("");

  const byKind = new Map<string, EntryResult[]>();
  for (const entry of result.entries) {
    const bucket = byKind.get(entry.entry.kind) ?? [];
    bucket.push(entry);
    byKind.set(entry.entry.kind, bucket);
  }

  for (const [kind, group] of [...byKind.entries()].sort()) {
    const missing = group.filter((entry) =>
      entry.layers.some((layer) => layer.status === "missing")
    );
    const excluded = group.filter((entry) =>
      entry.layers.some((layer) => layer.status === "excluded")
    );
    lines.push(
      `${kind}: ${group.length - missing.length}/${group.length} complete` +
        (excluded.length ? `, ${excluded.length} excluded` : "")
    );
    for (const entry of missing) {
      const layers = entry.layers
        .filter((layer) => layer.status === "missing")
        .map((layer) => layer.layer)
        .join(", ");
      lines.push(`    MISSING [${layers}] ${entry.entry.id} — ${entry.entry.label}`);
    }
    for (const entry of excluded) {
      lines.push(
        `    excluded ${entry.entry.id} — ${
          entry.layers.find((l) => l.exclusion)?.exclusion?.reason ?? ""
        }`
      );
    }
  }

  if (result.issues.length > 0) {
    lines.push("");
    lines.push(`${result.issues.length} issue(s):`);
    for (const issue of result.issues) {
      lines.push(`    [${issue.kind}] ${issue.message}`);
    }
  }

  return lines.join("\n");
}
