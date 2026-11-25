import { lazy, Suspense, useId, useState } from "react";
import type { RosterName } from "../../../types/Team";
import { getStandardRosterNames } from "../../../data/RosterTemplates";
import { HudTabs } from "../componentWarehouse/HudKit";
import { hudTabId } from "../componentWarehouse/HudPanel";
import { AdditionalRosters } from "./AdditionalRosters";
import { RosterCard } from "./RosterCard";

const SecretRosterCatalogue = lazy(() => import("./SecretRosterCatalogue"));

const TABS = [
  { id: "standard", label: "Standard rosters" },
  { id: "additional", label: "Additional rosters" },
  { id: "secret", label: "Secret team rosters" },
] as const;
type RosterTab = (typeof TABS)[number]["id"];

type Choose = (roster: RosterName) => void;

export function RosterPicker({ onChoose }: { readonly onChoose: Choose }) {
  const id = useId();
  const [tab, setTab] = useState<RosterTab>("standard");
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <HudTabs
          label="Roster categories"
          idBase={id}
          tabs={TABS}
          value={tab}
          onChange={setTab}
        />
      </div>
      <div
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={hudTabId(id, tab)}
      >
        {tab === "standard" && <StandardRosters onChoose={onChoose} />}
        {tab === "additional" && <AdditionalRosters />}
        {tab === "secret" && (
          <Suspense
            fallback={<p role="status">Loading Secret League rosters…</p>}
          >
            <SecretRosterCatalogue onChoose={onChoose} />
          </Suspense>
        )}
      </div>
    </div>
  );
}

function StandardRosters({ onChoose }: { readonly onChoose: Choose }) {
  return (
    <div
      role="list"
      aria-label="Standard rosters"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    >
      {getStandardRosterNames().map((name) => (
        <div key={name} role="listitem">
          <RosterCard name={name} onChoose={onChoose} />
        </div>
      ))}
    </div>
  );
}
