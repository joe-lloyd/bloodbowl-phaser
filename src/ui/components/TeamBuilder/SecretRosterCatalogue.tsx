import { useState } from "react";
import secretLeagueRosters from "../../../data/community/secretLeague2025.json";
import { getSecretRosterNames } from "../../../data/RosterTemplates";
import {
  SECRET_CATALOGUE_NAMES,
  SECRET_NOT_READY,
} from "../../../data/secretLeague/secretRosters";
import type { RosterName } from "../../../types/Team";
import { Field } from "../componentWarehouse/HudKit";
import { Title } from "../componentWarehouse/HudTitle";
import {
  RosterCatalogueCard,
  type CatalogueRoster,
} from "./RosterCatalogueCard";
import { RosterCard } from "./RosterCard";

const NOT_IN_STAT_FILES = ["not in the stat files yet"];

const playable = getSecretRosterNames();
const built = new Set<string>([
  ...playable,
  ...SECRET_CATALOGUE_NAMES.values(),
]);
const previews: readonly CatalogueRoster[] = secretLeagueRosters.filter(
  (roster) => !built.has(roster.name)
);

function blockersOf(name: string): readonly string[] {
  return SECRET_NOT_READY.get(name) ?? NOT_IN_STAT_FILES;
}

function Heading({ title, count }: { title: string; count: number }) {
  return (
    <Title level="section" as="h3" className="pt-2">
      {title} <span className="hud-label">{count}</span>
    </Title>
  );
}

function ReadyToPlay({
  names,
  onChoose,
}: {
  readonly names: readonly RosterName[];
  readonly onChoose: (roster: RosterName) => void;
}) {
  return (
    <section aria-label="Ready to play" className="space-y-3">
      <Heading title="Ready to play" count={names.length} />
      <p className="text-hud-sm text-hud-dim">
        Built from the full stat lines. Pick one to build it.
      </p>
      {names.length > 0 && (
        <div
          role="list"
          aria-label="Playable secret rosters"
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          {names.map((name) => (
            <div key={name} role="listitem">
              <RosterCard name={name} onChoose={onChoose} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function NotReadyYet({
  rosters,
}: {
  readonly rosters: readonly CatalogueRoster[];
}) {
  return (
    <section aria-label="Not ready yet" className="space-y-3">
      <Heading title="Not ready yet" count={rosters.length} />
      <p className="text-hud-sm text-hud-dim">
        Previews of community rosters from FUMBBL. Each one says what it still
        needs before it can be played.
      </p>
      <div className="grid items-start gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {rosters.map((roster) => (
          <RosterCatalogueCard
            key={roster.name}
            roster={roster}
            lineup={`/assets/roster-picker/secret/${encodeURIComponent(roster.name)}.png`}
            blockers={blockersOf(roster.name)}
          />
        ))}
      </div>
    </section>
  );
}

export default function SecretRosterCatalogue({
  onChoose,
}: {
  readonly onChoose: (roster: RosterName) => void;
}) {
  const [query, setQuery] = useState("");
  const search = query.trim().toLowerCase();
  const matches = (name: string) => name.toLowerCase().includes(search);
  const choices = playable.filter(matches);
  const filtered = previews.filter((roster) => matches(roster.name));
  return (
    <div className="space-y-3">
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
        {choices.length + filtered.length} of{" "}
        {playable.length + previews.length} rosters
      </p>
      <ReadyToPlay names={choices} onChoose={onChoose} />
      <NotReadyYet rosters={filtered} />
    </div>
  );
}
