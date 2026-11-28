import type { GameTypeCoverage, RosterCoverage } from "./model";

export const RARE_PER_100 = 5;

export interface Use {
  readonly name: string;
  readonly offered: number;
  readonly used: number;
}

export interface RosterFindings {
  readonly roster: string;
  readonly coverage: RosterCoverage;
  readonly actions: readonly Use[];
  readonly skills: readonly Use[];
}

export const per100 = (count: number, matches: number) => (matches === 0 ? 0 : (100 * count) / matches);

export const neverUsed = (uses: readonly Use[]) => uses.filter(({ offered, used }) => offered > 0 && used === 0);

export const rarelyUsed = (uses: readonly Use[], matches: number) =>
  uses.filter(({ used }) => used > 0 && per100(used, matches) < RARE_PER_100);

const words = (name: string) => name.replaceAll(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();

export function actionLabel(key: string): string {
  const [action = key, replacement] = key.replace(/^declare:/, "").split(":", 2);
  return replacement ? `${words(action)} with ${words(replacement)}` : words(action);
}

function actionUses({ usage }: RosterCoverage): Use[] {
  const keys = new Set([...Object.keys(usage.offered), ...Object.keys(usage.chosen)]);
  return [...keys]
    .filter((key) => key.startsWith("declare:"))
    .sort()
    .map((key) => ({ name: key, offered: usage.offered[key] ?? 0, used: usage.chosen[key] ?? 0 }));
}

function skillUses({ usage, held }: RosterCoverage): Use[] {
  const names = new Set([...Object.keys(held), ...Object.keys(usage.skills)]);
  return [...names].sort().map((name) => ({ name, offered: held[name] ?? 0, used: usage.skills[name] ?? 0 }));
}

export const rosterFindings = ({ rosters }: GameTypeCoverage): RosterFindings[] =>
  Object.entries(rosters)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([roster, coverage]) => ({
      roster,
      coverage,
      actions: actionUses(coverage),
      skills: skillUses(coverage),
    }));

export interface Gap {
  readonly name: string;
  readonly rosters: readonly string[];
}

export function gaps(rows: readonly RosterFindings[], pick: (row: RosterFindings) => readonly Use[]): Gap[] {
  const byName = new Map<string, string[]>();
  for (const row of rows)
    for (const { name } of pick(row)) byName.set(name, [...(byName.get(name) ?? []), row.roster]);
  return [...byName]
    .map(([name, rosters]) => ({ name, rosters }))
    .sort((a, b) => b.rosters.length - a.rosters.length || a.name.localeCompare(b.name));
}
