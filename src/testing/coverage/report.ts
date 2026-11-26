import {
  type ExecutionLayer,
  EXECUTION_LAYERS,
  type ScenarioCase,
} from "../scenarioCase/types";
import {
  validateScenarioCases,
  type LayerSupport,
  type ValidationIssue,
} from "../scenarioCase/validate";
import { auditSetupFixtures } from "../fixtures/validateFixtures";
import {
  buildInventory,
  DECISION_REPLY_COMMANDS,
  type InventoryEntry,
} from "./inventory";
import type { CoverageFragment } from "./observed";
import {
  COVERAGE_EXCLUSIONS,
  type CoverageExclusion,
  exclusionFor,
  isExcluded,
  validateExclusions,
} from "./exclusions";

type EntryStatus = "covered" | "excluded" | "missing" | "not-required";

export interface EntryLayerResult {
  layer: ExecutionLayer;
  status: EntryStatus;

  cases: string[];

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

  fragments?: CoverageFragment[];
}

function caseIssueKind(issue: ValidationIssue): CoverageIssue["kind"] {
  if (issue.message.includes("no committed integer seed"))
    return "unreachable-variant";
  if (issue.field === "id") return "duplicate-case-id";
  if (issue.field === "regression.id") return "duplicate-regression-id";
  return "schema";
}

function fixtureIssues(scenarioCase: ScenarioCase): CoverageIssue[] {
  const audit = auditSetupFixtures(
    scenarioCase.id,
    scenarioCase.setup,
    (scenarioCase.syntheticGrants ?? []).map((grant) => ({
      player: grant.player,
      skill: grant.skill!,
      reason: grant.reason,
    }))
  );
  return audit.issues.map((fixtureIssue) => ({
    kind:
      fixtureIssue.kind === "implausible-grant"
        ? "unexplained-synthetic-grant"
        : "invalid-fixture",
    message: `${fixtureIssue.ownerId}: ${fixtureIssue.message}`,
  }));
}

function observedClaims(
  fragments: CoverageFragment[]
): Map<string, Set<string>> {
  const observed = new Map<string, Set<string>>();
  for (const fragment of fragments) {
    const key = `${fragment.caseId}|${fragment.layer}`;
    const bucket = observed.get(key) ?? new Set<string>();
    for (const claim of fragment.claims) bucket.add(claim);
    observed.set(key, bucket);
  }
  return observed;
}

function missingCoverageIssues(result: EntryResult): CoverageIssue[] {
  return result.layers
    .filter((layerResult) => layerResult.status === "missing")
    .map((layerResult) => ({
      kind: "missing-required-coverage",
      message:
        `${result.entry.id} (${result.entry.label}) has no ${layerResult.layer} case — ` +
        `add one, or record a reviewed exclusion`,
    }));
}

export function buildCoverage(
  cases: ScenarioCase[],
  options: BuildCoverageOptions = {}
): CoverageResult {
  const inventory = options.inventory ?? buildInventory();
  const exclusions = options.exclusions ?? COVERAGE_EXCLUSIONS;
  const issues: CoverageIssue[] = Array.from(validateScenarioCases(cases, options.support), issue => ({
      kind: caseIssueKind(issue),
      message: `${issue.caseId} · ${issue.field}: ${issue.message}`,
    }));
  issues.push(...cases.flatMap(fixtureIssues));

  const knownIds = new Set(inventory.map((entry) => entry.id));
  for (const exclusionIssue of validateExclusions(exclusions, knownIds)) {
    issues.push({
      kind: "invalid-exclusion",
      message: `${exclusionIssue.entryId}: ${exclusionIssue.message}`,
    });
  }

  const claimsByCase = new Map(
    cases.map((scenarioCase) => [scenarioCase.id, claimsOf(scenarioCase)])
  );
  const observedByCaseLayer = observedClaims(options.fragments ?? []);
  const covers = (
    scenarioCase: ScenarioCase,
    layer: ExecutionLayer,
    entryId: string
  ): boolean =>
    claimsByCase.get(scenarioCase.id)?.has(entryId) === true ||
    observedByCaseLayer.get(`${scenarioCase.id}|${layer}`)?.has(entryId) ===
      true;

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
        const exclusion = exclusionFor(entry.id, exclusions);
        return {
          layer,
          status: "excluded",
          cases: [],
          ...(exclusion !== undefined && { exclusion }),
        };
      }
      return { layer, status: "missing", cases: [] };
    }),
  }));

  issues.push(...entries.flatMap(missingCoverageIssues));

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
        ...(scenarioCase.regression && { regressionId: scenarioCase.regression.id }),
      }))
      .sort((a, b) => (a.id < b.id ? -1 : 1)),
  };
}

export function renderCoverageReport(result: CoverageResult): string {
  const lines: string[] = [ "E2E coverage", "============", `generated ${result.generatedAt}`, ""];

  for (const layer of EXECUTION_LAYERS) {
    const totals = result.totals[layer];
    if (totals.required === 0) {
      lines.push(`${layer.padEnd(8)} — nothing requires this layer yet`);
      continue;
    }
    const percent = Math.round((totals.covered / totals.required) * 100);
    lines.push(
      `${layer.padEnd(8)} ${String(totals.covered)}/${String(totals.required)} covered (${String(percent)}%), ` +
        `${String(totals.excluded)} excluded, ${String(totals.missing)} missing`
    );
  }
  lines.push("");

  const byKind = new Map<string, EntryResult[]>();
  for (const entry of result.entries) {
    const bucket = byKind.get(entry.entry.kind) ?? [];
    bucket.push(entry);
    byKind.set(entry.entry.kind, bucket);
  }

  for (const [kind, group] of [...byKind].sort()) {
    const missing = group.filter((entry) =>
      entry.layers.some((layer) => layer.status === "missing")
    );
    const excluded = group.filter((entry) =>
      entry.layers.some((layer) => layer.status === "excluded")
    );
    lines.push(
      `${kind}: ${String(group.length - missing.length)}/${String(group.length)} complete` +
        (excluded.length > 0 ? `, ${String(excluded.length)} excluded` : "")
    );
    for (const entry of missing) {
      const layers = entry.layers
        .filter((layer) => layer.status === "missing")
        .map((layer) => layer.layer)
        .join(", ");
      lines.push(
        `    MISSING [${layers}] ${entry.entry.id} — ${entry.entry.label}`
      );
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
    lines.push(`${String(result.issues.length)} issue(s):`);
    for (const issue of result.issues) {
      lines.push(`    [${issue.kind}] ${issue.message}`);
    }
  }

  return lines.join("\n");
}
