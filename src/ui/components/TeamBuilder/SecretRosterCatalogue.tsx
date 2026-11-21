import { useState } from "react";
import secretLeagueRosters from "../../../data/community/secretLeague2025.json";
import { Field } from "../componentWarehouse/HudKit";
import {
  RosterCatalogueCard,
  type CatalogueRoster,
} from "./RosterCatalogueCard";

const rosters: readonly CatalogueRoster[] = secretLeagueRosters;

export default function SecretRosterCatalogue() {
  const [query, setQuery] = useState("");
  const search = query.trim().toLowerCase();
  const filtered = rosters.filter((roster) =>
    roster.name.toLowerCase().includes(search)
  );
  return (
    <div className="space-y-3">
      <p className="text-hud-sm text-hud-dim">
        Browse community rosters from FUMBBL. These are catalogue previews.
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
        {filtered.length} of {rosters.length} rosters
      </p>
      <div className="grid items-start gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((roster) => (
          <RosterCatalogueCard key={roster.name} roster={roster} />
        ))}
      </div>
    </div>
  );
}
