/**
 * Merging sharded coverage results.
 *
 * CI splits the matrix across workers or jobs, and each shard can only see
 * the cases it ran. Merging must therefore be a *union* over entry × layer:
 * an entry covered in any shard is covered, and one that is missing
 * everywhere stays missing. Case lists are de-duplicated so a case that ran
 * in two shards is not counted twice, and totals are recomputed from the
 * merged entries rather than summed — summing is exactly how shard merging
 * usually goes wrong.
 */

import { EXECUTION_LAYERS, ExecutionLayer } from "../scenarioCase/types";
import {
  CoverageIssue,
  CoverageResult,
  EntryLayerResult,
  EntryResult,
} from "./report";

function mergeLayer(
  results: EntryLayerResult[],
  layer: ExecutionLayer
): EntryLayerResult {
  const relevant = results.filter((result) => result.layer === layer);
  if (relevant.length === 0) {
    return { layer, status: "not-required", cases: [] };
  }

  const cases = [...new Set(relevant.flatMap((result) => result.cases))].sort();
  if (cases.length > 0) return { layer, status: "covered", cases };

  const excluded = relevant.find((result) => result.status === "excluded");
  if (excluded) {
    return {
      layer,
      status: "excluded",
      cases: [],
      ...(excluded.exclusion ? { exclusion: excluded.exclusion } : {}),
    };
  }
  // Only "not required everywhere" survives as not-required.
  return relevant.every((result) => result.status === "not-required")
    ? { layer, status: "not-required", cases: [] }
    : { layer, status: "missing", cases: [] };
}

export function mergeCoverageResults(
  results: CoverageResult[]
): CoverageResult {
  if (results.length === 0) {
    throw new Error("nothing to merge");
  }
  if (results.length === 1) return results[0];

  // Union of entries across shards, keyed by inventory id.
  const byEntryId = new Map<string, EntryResult[]>();
  for (const result of results) {
    for (const entry of result.entries) {
      const bucket = byEntryId.get(entry.entry.id) ?? [];
      bucket.push(entry);
      byEntryId.set(entry.entry.id, bucket);
    }
  }

  const entries: EntryResult[] = [...byEntryId.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([, group]) => ({
      entry: group[0].entry,
      layers: EXECUTION_LAYERS.map((layer) =>
        mergeLayer(
          group.flatMap((entry) => entry.layers),
          layer
        )
      ),
    }));

  const totals = Object.fromEntries(
    EXECUTION_LAYERS.map((layer) => {
      const relevant = entries.flatMap((entry) =>
        entry.layers.filter(
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

  // Issues are de-duplicated by message: the same schema problem is reported
  // by every shard that loaded the registry.
  const seenIssues = new Set<string>();
  const issues: CoverageIssue[] = [];
  for (const result of results) {
    for (const issue of result.issues) {
      const key = `${issue.kind}|${issue.message}`;
      if (seenIssues.has(key)) continue;
      seenIssues.add(key);
      issues.push(issue);
    }
  }
  // A "missing" recorded by one shard is resolved if another shard covered
  // it, so drop stale gap issues that the merge has closed.
  const stillMissing = new Set(
    entries.flatMap((entry) =>
      entry.layers
        .filter((layer) => layer.status === "missing")
        .map(() => entry.entry.id)
    )
  );
  const mergedIssues = issues.filter(
    (issue) =>
      issue.kind !== "missing-required-coverage" ||
      [...stillMissing].some((id) => issue.message.startsWith(id))
  );

  const seenCases = new Map<string, CoverageResult["cases"][number]>();
  for (const result of results) {
    for (const entry of result.cases) seenCases.set(entry.id, entry);
  }

  return {
    generatedAt: new Date().toISOString(),
    totals,
    entries,
    issues: mergedIssues,
    cases: [...seenCases.values()].sort((a, b) => (a.id < b.id ? -1 : 1)),
  };
}
