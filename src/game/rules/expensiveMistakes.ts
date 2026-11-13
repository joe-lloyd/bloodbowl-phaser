/**
 * Expensive Mistakes: step 5, the last money step, of the post-game sequence
 * after a league fixture. The spec is openspec/specs/league-treasury/spec.md.
 *
 * Blood Bowl Second Season rulebook (rulespal.com): "If you have 100,000
 * gold pieces or more stored in your Treasury during this step of the
 * post-game sequence, roll a D6 on the following table, applying the result
 * from the column that corresponds to the number of gold pieces in your
 * Treasury." The 2025 rulebook prints the same table, and Spike! Journal 22
 * leaves it unchanged for Sevens leagues.
 *
 * - Crisis Averted: nothing is lost.
 * - Minor Incident: "you lose D3 x 10,000 gold pieces from your Treasury".
 * - Major Incident: "Half the gold in your Treasury (rounding down to the
 *   nearest 5,000 gold pieces) is lost".
 * - Catastrophe: "Your Treasury is emptied, except for 2D6 x 10,000 gold
 *   pieces".
 *
 * Dice come from the caller's dice source, so a test can fix them.
 */

import { Team, calculateTeamValue } from "../../types/Team";
import { rollD3 } from "./winnings";

/** Only a Treasury of at least this much rolls. */
export const EXPENSIVE_MISTAKES_THRESHOLD = 100_000;

export type ExpensiveMistake =
  | "crisis-averted"
  | "minor-incident"
  | "major-incident"
  | "catastrophe";

export const EXPENSIVE_MISTAKE_NAMES: Record<ExpensiveMistake, string> = {
  "crisis-averted": "Crisis Averted",
  "minor-incident": "Minor Incident",
  "major-incident": "Major Incident",
  catastrophe: "Catastrophe",
};

const AVERTED = "crisis-averted";
const MINOR = "minor-incident";
const MAJOR = "major-incident";
const CATASTROPHE = "catastrophe";

/**
 * The Expensive Mistakes table, one column per Treasury band, each listing
 * the result for a D6 of 1 to 6.
 */
const TABLE: readonly (readonly ExpensiveMistake[])[] = [
  // 100,000 to 195,000
  [MINOR, AVERTED, AVERTED, AVERTED, AVERTED, AVERTED],
  // 200,000 to 295,000
  [MINOR, MINOR, AVERTED, AVERTED, AVERTED, AVERTED],
  // 300,000 to 395,000
  [MAJOR, MINOR, MINOR, AVERTED, AVERTED, AVERTED],
  // 400,000 to 495,000
  [MAJOR, MAJOR, MINOR, MINOR, AVERTED, AVERTED],
  // 500,000 to 595,000
  [CATASTROPHE, MAJOR, MAJOR, MINOR, MINOR, AVERTED],
  // 600,000 and more
  [CATASTROPHE, CATASTROPHE, MAJOR, MAJOR, MINOR, MINOR],
];

/** Whether a Treasury this size rolls for Expensive Mistakes. */
export function rollsForExpensiveMistakes(treasury: number): boolean {
  return treasury >= EXPENSIVE_MISTAKES_THRESHOLD;
}

/**
 * The table's result for a Treasury and a D6, or null when the Treasury is
 * under 100,000 and nothing is rolled.
 */
export function expensiveMistakeFor(
  treasury: number,
  d6: number
): ExpensiveMistake | null {
  if (!rollsForExpensiveMistakes(treasury)) return null;
  if (!Number.isInteger(d6) || d6 < 1 || d6 > 6) {
    throw new Error(`A D6 roll must be 1 to 6, not ${d6}.`);
  }
  const band = Math.min(TABLE.length - 1, Math.floor(treasury / 100_000) - 1);
  return TABLE[band][d6 - 1];
}

const ROUNDING = 5_000;
const INCIDENT_GOLD = 10_000;

export interface ExpensiveMistakesResult {
  treasuryBefore: number;
  treasuryAfter: number;
  /** The table's D6, or null when the Treasury was too small to roll. */
  roll: number | null;
  outcome: ExpensiveMistake | null;
  /** A Minor Incident's D3, or a Catastrophe's two D6. */
  extraDice: number[];
}

/**
 * Roll Expensive Mistakes for a Treasury and work out what is left. Pure:
 * the caller applies `treasuryAfter`. The Treasury never goes below zero.
 */
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
      const kept = (dice[0] + dice[1]) * INCIDENT_GOLD;
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

/**
 * After a league fixture is recorded, queue Expensive Mistakes for a team
 * whose Treasury is 100,000 or more. Nothing in the post-game sequence adds
 * gold before this step, so a smaller Treasury never needs the roll. Called
 * once per fixture (`Team.recordedFixtureIds`).
 */
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

/**
 * The post-game steps that come before Expensive Mistakes and are still
 * waiting: hiring Journeymen, advancement, Drafted Players.
 */
export function stepsBeforeExpensiveMistakes(team: Team): number {
  return (team.pendingDevelopment ?? []).filter(
    (entry) => entry.kind !== "expensive-mistakes"
  ).length;
}

/**
 * Roll a queued Expensive Mistakes step and apply it to the Treasury. It is
 * the last step, so every other pending post-game choice must be made
 * first. A Treasury spent below 100,000 in the meantime rolls nothing.
 */
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

/** One line for the coach: the roll and what it cost. */
export function describeExpensiveMistakes(
  result: ExpensiveMistakesResult
): string {
  const gold = (amount: number) => `${amount.toLocaleString("en-GB")} gp`;
  if (result.roll === null || result.outcome === null) {
    return `No roll: the Treasury holds ${gold(result.treasuryBefore)}, under ${gold(EXPENSIVE_MISTAKES_THRESHOLD)}.`;
  }
  const dice =
    result.outcome === "minor-incident"
      ? ` (D3 ${result.extraDice[0]})`
      : result.outcome === "catastrophe"
        ? ` (2D6 ${result.extraDice[0]}+${result.extraDice[1]})`
        : "";
  const lost = result.treasuryBefore - result.treasuryAfter;
  return `Rolled ${result.roll}: ${EXPENSIVE_MISTAKE_NAMES[result.outcome]}${dice}. Lost ${gold(lost)}; the Treasury now holds ${gold(result.treasuryAfter)}.`;
}
