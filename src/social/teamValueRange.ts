import { calculateTeamValue, type Team } from "../types/Team";

export interface TeamValueRange {
  min?: number;
  max?: number;
}

export const TEAM_VALUE_STEPS: readonly number[] = Array.from(
  { length: 25 },
  (_, index) => 300_000 + index * 50_000
);

export function withinTeamValue(
  team: Team,
  range: TeamValueRange | undefined
): boolean {
  const value = calculateTeamValue(team);
  return (
    (range?.min === undefined || value >= range.min) &&
    (range?.max === undefined || value <= range.max)
  );
}

function thousands(value: number): string {
  return `${String(value / 1000)}k`;
}

export function teamValueText(range: TeamValueRange | undefined): string {
  const { min, max } = range ?? {};
  if (min !== undefined && max !== undefined)
    return `${thousands(min)} to ${thousands(max)}`;
  if (max !== undefined) return `up to ${thousands(max)}`;
  if (min !== undefined) return `${thousands(min)} or more`;
  return "any team value";
}
