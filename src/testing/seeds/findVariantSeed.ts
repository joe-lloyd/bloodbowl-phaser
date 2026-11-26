import type { ObservedRun } from "../scenarioCase/types";

export function summariseRun(observed: ObservedRun): string {
  const rolls = observed.events
    .filter((event) => event.name === "diceRoll")
    .map((event) => {
      const data = event.data as { rollType?: string; resultState?: string };
      return data?.resultState
        ? `${String(data.rollType)}:${data.resultState}`
        : (data?.rollType ?? "?");
    });
  const decisions = observed.decisions.map((decision) => decision.type);
  return [
    `phase=${observed.snapshot.phase}`,
    rolls.length > 0 ? `rolls=[${rolls.join(", ")}]` : "rolls=[]",
    decisions.length > 0 ? `decisions=[${decisions.join(", ")}]` : "decisions=[]",
  ].join(" ");
}
