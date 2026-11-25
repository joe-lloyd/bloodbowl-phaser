import { useState } from "react";
import secretLeagueRosters from "../../../data/community/secretLeague2025.json";
import { getSecretRosterNames } from "../../../data/RosterTemplates";
import type { RosterName } from "../../../types/Team";
import { Field } from "../componentWarehouse/HudKit";
import {
  RosterCatalogueCard,
  type CatalogueRoster,
} from "./RosterCatalogueCard";
import { RosterCard } from "./RosterCard";

const playable = getSecretRosterNames();
const rosters: readonly CatalogueRoster[] = secretLeagueRosters.filter(
  (roster) => !playable.some((name) => name === roster.name)
);

export default function SecretRosterCatalogue({
  onChoose,
}: {
  readonly onChoose: (roster: RosterName) => void;
}) {
  const [query, setQuery] = useState("");
  const search = query.trim().toLowerCase();
  const matches = (name: string) => name.toLowerCase().includes(search);
  const choices = playable.filter(matches);
  const filtered = rosters.filter((roster) => matches(roster.name));
  return (
    <div className="space-y-3">
      <p className="text-hud-sm text-hud-dim">
        The teams at the top are ready to build. The rest are previews of
        community rosters from FUMBBL, shown with the closest players we have
        and a mannequin where a model is still missing.
      </p>
      <div className="max-w-sm">
        <Field label="Find a Secret League team">
          <input
            type="search"
            className="hud-field"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
          />
        </Field>
      </div>
      <p role="status" className="text-hud-sm text-hud-dim">
        {choices.length + filtered.length} of {playable.length + rosters.length}{" "}
        rosters
      </p>
      {choices.length > 0 && (
        <div
          role="list"
          aria-label="Playable secret rosters"
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          {choices.map((name) => (
            <div key={name} role="listitem">
              <RosterCard name={name} onChoose={onChoose} />
            </div>
          ))}
        </div>
      )}
      <div className="grid items-start gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((roster) => (
          <RosterCatalogueCard
            key={roster.name}
            roster={roster}
            lineup={`/assets/roster-picker/secret/${encodeURIComponent(roster.name)}.png`}
          />
        ))}
      </div>
    </div>
  );
}
