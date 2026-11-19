import { type ObservedRun, type ScenarioCase } from "../scenarioCase/types";

export function observedClaims(
  scenarioCase: ScenarioCase,
  observed: ObservedRun
): string[] {
  const claims = new Set<string>();

  for (const decision of observed.decisions) {
    claims.add(`decision:${decision.type}`);
  }

  claims.add(`phase:${observed.initialSnapshot.phase}`);
  claims.add(`phase:${observed.snapshot.phase}`);

  const engineRun: ObservedRun & {
    stepLog?: { command: { type: string }; replies: { type: string }[] }[];
  } = observed;
  for (const record of engineRun.stepLog ?? []) {
    claims.add(`protocol-command:${record.command.type}`);
    for (const reply of record.replies) {
      claims.add(`protocol-command:${reply.type}`);
    }
  }

  for (const interaction of scenarioCase.interactions) claims.add(interaction);

  return [...claims].sort();
}

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
