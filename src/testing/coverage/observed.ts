/**
 * Coverage claims derived from what a run *actually did*.
 *
 * Some inventory entries cannot be read off a case's script. A rule case
 * answers rerolls, reactions and push directions through its decision
 * policy, so the decisions it exercises appear nowhere in its steps; and a
 * case that starts in PLAY may still reach TOUCHDOWN. Guessing would either
 * over-report (claiming decisions that never fired) or under-report (the
 * whole rule catalog showing as decision-blind).
 *
 * So the runners record what happened, and the coverage CLI merges those
 * fragments in. Observed coverage is the only kind that is actually true.
 */

import { ObservedRun, ScenarioCase } from "../scenarioCase/types";

/** Inventory ids a completed run demonstrably exercised. */
export function observedClaims(
  scenarioCase: ScenarioCase,
  observed: ObservedRun
): string[] {
  const claims = new Set<string>();

  // Decisions the engine actually paused on.
  for (const decision of observed.decisions) {
    claims.add(`decision:${decision.type}`);
  }

  // Phases the run started in and ended in. Intermediate phases show up via
  // the snapshots either side; anything finer belongs to a checkpoint.
  claims.add(`phase:${observed.initialSnapshot.phase}`);
  claims.add(`phase:${observed.snapshot.phase}`);

  // Commands the run really executed, including the decision replies the
  // policy issued on the case's behalf.
  const engineRun = observed as ObservedRun & {
    stepLog?: { command: { type: string }; replies: { type: string }[] }[];
  };
  for (const record of engineRun.stepLog ?? []) {
    claims.add(`protocol-command:${record.command.type}`);
    for (const reply of record.replies) {
      claims.add(`protocol-command:${reply.type}`);
    }
  }

  // The case's own declared claims stay attached, so a fragment is a
  // complete statement about that run on its own.
  for (const interaction of scenarioCase.interactions) claims.add(interaction);

  return [...claims].sort();
}

/** One run's contribution to the report, written by the E2E runners. */
export interface CoverageFragment {
  caseId: string;
  variantId: string;
  layer: ObservedRun["layer"];
  claims: string[];
}

export function buildFragment(
  scenarioCase: ScenarioCase,
  variantId: string,
  observed: ObservedRun
): CoverageFragment {
  return {
    caseId: scenarioCase.id,
    variantId,
    layer: observed.layer,
    claims: observedClaims(scenarioCase, observed),
  };
}
