import { type Team, calculateTeamValue } from "../../types/Team";
import { rollD3 } from "./winnings";

export const EXPENSIVE_MISTAKES_THRESHOLD = 100_000;

export type ExpensiveMistake =
  | "crisis-averted"
  | "minor-incident"
  | "major-incident"
  | "catastrophe";

const EXPENSIVE_MISTAKE_NAMES: Record<ExpensiveMistake, string> = {
  "crisis-averted": "Crisis Averted",
  "minor-incident": "Minor Incident",
  "major-incident": "Major Incident",
  catastrophe: "Catastrophe",
};

const AVERTED = "crisis-averted";
const MINOR = "minor-incident";
const MAJOR = "major-incident";
const CATASTROPHE = "catastrophe";

const TABLE: readonly (readonly ExpensiveMistake[])[] = [
  [MINOR, AVERTED, AVERTED, AVERTED, AVERTED, AVERTED],

  [MINOR, MINOR, AVERTED, AVERTED, AVERTED, AVERTED],

  [MAJOR, MINOR, MINOR, AVERTED, AVERTED, AVERTED],

  [MAJOR, MAJOR, MINOR, MINOR, AVERTED, AVERTED],

  [CATASTROPHE, MAJOR, MAJOR, MINOR, MINOR, AVERTED],

  [CATASTROPHE, CATASTROPHE, MAJOR, MAJOR, MINOR, MINOR],
];

export function rollsForExpensiveMistakes(treasury: number): boolean {
  return treasury >= EXPENSIVE_MISTAKES_THRESHOLD;
}

export function clearUnneededExpensiveMistakes(team: Team): void {
  if (rollsForExpensiveMistakes(team.treasury) || !team.pendingDevelopment)
    return;
  team.pendingDevelopment = team.pendingDevelopment.filter(
    (entry) => entry.kind !== "expensive-mistakes"
  );
}

export function expensiveMistakeFor(
  treasury: number,
  d6: number
): ExpensiveMistake | null {
  if (!rollsForExpensiveMistakes(treasury)) return null;
  if (!Number.isSafeInteger(d6) || d6 < 1 || d6 > 6) {
    throw new Error(`A D6 roll must be 1 to 6, not ${String(d6)}.`);
  }
  const band = Math.min(TABLE.length - 1, Math.floor(treasury / 100_000) - 1);
  const mistake = TABLE[band]?.[d6 - 1];
  if (!mistake)
    throw new Error(`No Expensive Mistake for band ${String(band)}.`);
  return mistake;
}

const ROUNDING = 5000;
const INCIDENT_GOLD = 10_000;

export interface ExpensiveMistakesResult {
  treasuryBefore: number;
  treasuryAfter: number;

  roll: number | null;
  outcome: ExpensiveMistake | null;

  extraDice: number[];
}

export function rollExpensiveMistakes(
  treasury: number,
  rng: { rollDie(sides: number): number }
): ExpensiveMistakesResult {
  const unchanged = {
    treasuryBefore: treasury,
    treasuryAfter: treasury,
    extraDice: [],
  };
  if (!rollsForExpensiveMistakes(treasury)) {
    return { ...unchanged, roll: null, outcome: null };
  }
  const roll = rng.rollDie(6);
  const outcome = expensiveMistakeFor(treasury, roll)!;
  switch (outcome) {
    case "crisis-averted":
      return { ...unchanged, roll, outcome };
    case "minor-incident": {
      const d3 = rollD3(rng);
      return {
        treasuryBefore: treasury,
        treasuryAfter: Math.max(0, treasury - d3 * INCIDENT_GOLD),
        roll,
        outcome,
        extraDice: [d3],
      };
    }
    case "major-incident": {
      const lost = Math.floor(treasury / 2 / ROUNDING) * ROUNDING;
      return {
        treasuryBefore: treasury,
        treasuryAfter: treasury - lost,
        roll,
        outcome,
        extraDice: [],
      };
    }
    case "catastrophe": {
      const dice = [rng.rollDie(6), rng.rollDie(6)];
      const kept = dice.reduce((sum, die) => sum + die, 0) * INCIDENT_GOLD;
      return {
        treasuryBefore: treasury,
        treasuryAfter: Math.min(treasury, kept),
        roll,
        outcome,
        extraDice: dice,
      };
    }
  }
}

export type ExpensiveMistakesEntry = Extract<
  NonNullable<Team["pendingDevelopment"]>[number],
  { kind: "expensive-mistakes" }
>;

export function queueExpensiveMistakes(team: Team, fixtureKey: string): void {
  if (!rollsForExpensiveMistakes(team.treasury ?? 0)) return;
  const id = `expensive-mistakes-${fixtureKey}`;
  team.pendingDevelopment ??= [];
  if (team.pendingDevelopment.some((entry) => entry.id === id)) return;
  team.pendingDevelopment.push({
    id,
    kind: "expensive-mistakes",
    fixtureKey,
    createdAt: Date.now(),
  });
}

export function stepsBeforeExpensiveMistakes(team: Team): number {
  return (team.pendingDevelopment ?? []).filter(
    (entry) => entry.kind !== "expensive-mistakes"
  ).length;
}

export function resolveExpensiveMistakes(
  team: Team,
  entry: ExpensiveMistakesEntry,
  rng: { rollDie(sides: number): number }
): ExpensiveMistakesResult {
  if (!team.pendingDevelopment?.some((pending) => pending.id === entry.id)) {
    throw new Error("Expensive Mistakes has already been rolled.");
  }
  if (stepsBeforeExpensiveMistakes(team) > 0) {
    throw new Error(
      "Finish the team's other post-game choices before Expensive Mistakes."
    );
  }
  const result = rollExpensiveMistakes(team.treasury ?? 0, rng);
  team.treasury = result.treasuryAfter;
  team.pendingDevelopment = team.pendingDevelopment.filter(
    (pending) => pending.id !== entry.id
  );
  team.teamValue = calculateTeamValue(team);
  return result;
}

const gold = (amount: number) => `${amount.toLocaleString("en-GB")} gp`;

export function describeExpensiveMistakes(
  result: ExpensiveMistakesResult
): string {
  if (result.roll === null || result.outcome === null) {
    return `No roll: the Treasury holds ${gold(result.treasuryBefore)}, under ${gold(EXPENSIVE_MISTAKES_THRESHOLD)}.`;
  }
  const dice =
    result.outcome === "minor-incident"
      ? ` (D3 ${String(result.extraDice[0])})`
      : result.outcome === "catastrophe"
        ? ` (2D6 ${String(result.extraDice[0])}+${String(result.extraDice[1])})`
        : "";
  const lost = result.treasuryBefore - result.treasuryAfter;
  return `Rolled ${String(result.roll)}: ${EXPENSIVE_MISTAKE_NAMES[result.outcome]}${dice}. Lost ${gold(lost)}; the Treasury now holds ${gold(result.treasuryAfter)}.`;
}
