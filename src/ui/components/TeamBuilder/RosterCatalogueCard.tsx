import { formatGold } from "../TeamManagement/TeamStatsOverview";

interface CataloguePosition {
  readonly name: string;
  readonly quantity: string;
  readonly cost: number;
  readonly skills: readonly string[];
}

export interface CatalogueRoster {
  readonly name: string;
  readonly tier: number | null;
  readonly source: string;
  readonly experimental: boolean;
  readonly positions: readonly CataloguePosition[];
}

export function RosterCatalogueCard({
  roster,
}: {
  readonly roster: CatalogueRoster;
}) {
  return (
    <details className="rounded-hud border border-white/10 bg-black/25 px-3 py-2">
      <summary className="cursor-pointer font-hud-label text-hud-lg font-bold text-hud-bone">
        {roster.name}
        {roster.tier !== null && (
          <span className="hud-label ml-2">Tier {roster.tier}</span>
        )}
        {roster.experimental && (
          <span className="ml-2 font-hud-body text-hud-sm font-normal text-hud-gold">
            Experimental
          </span>
        )}
      </summary>
      <ul className="mt-2 divide-y divide-white/10">
        {roster.positions.map(({ name, quantity, cost, skills }) => (
          <li key={name} className="py-1.5 text-hud-sm text-hud-dim">
            <div className="flex justify-between gap-3">
              <span className="text-hud-bone">
                {quantity} {name}
              </span>
              <span className="shrink-0">{formatGold(cost)}</span>
            </div>
            {skills.length > 0 && <div>{skills.join(", ")}</div>}
          </li>
        ))}
      </ul>
      <a
        className="mt-2 inline-block text-hud-sm text-hud-gold underline"
        href={roster.source}
        target="_blank"
        rel="noreferrer"
      >
        Source roster ↗
      </a>
    </details>
  );
}
