import { lazy, Suspense, useId, useState } from "react";
import { type RosterName, TeamSpecialRule } from "../../../types/Team";
import {
  getAvailableRosterNames,
  getRosterByRosterName,
} from "../../../data/RosterTemplates";
import { cx, HudTabs, hudChoiceClass } from "../componentWarehouse/HudKit";
import { hudTabId } from "../componentWarehouse/HudPanel";
import { AdditionalRosters } from "./AdditionalRosters";
import "./rosterPicker.css";

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
            <SecretRosterCatalogue />
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
      {getAvailableRosterNames().map((name) => (
        <div key={name} role="listitem">
          <RosterCard name={name} onChoose={onChoose} />
        </div>
      ))}
    </div>
  );
}

function RosterCard({
  name,
  onChoose,
}: {
  readonly name: RosterName;
  readonly onChoose: Choose;
}) {
  const roster = getRosterByRosterName(name);
  const art = `/assets/roster-picker/${encodeURIComponent(name)}`;
  const rules = roster.specialRules.map((rule) =>
    rule === TeamSpecialRule.FAVOURED_OF ? "Favoured of a Chaos god" : rule
  );
  return (
    <button
      type="button"
      data-testid={`roster-choice-${name}`}
      onClick={() => {
        onChoose(name);
      }}
      className={cx(
        hudChoiceClass(false),
        "roster-picker-card flex h-full w-full flex-col p-3"
      )}
    >
      <span className="flex w-full items-baseline justify-between gap-2">
        <span className="font-hud-label text-hud-lg font-bold uppercase tracking-[0.03em] text-hud-bone">
          {name}
        </span>
        <span className="hud-label shrink-0">Tier {roster.tier}</span>
      </span>
      <span aria-hidden="true" className="roster-picker-lineup">
        <img
          src={`${art}.png`}
          alt=""
          width={1760}
          height={126}
          loading="lazy"
          decoding="async"
        />
      </span>
      {rules.length > 0 && (
        <span className="text-hud-sm text-hud-gold">{rules.join(", ")}</span>
      )}
      <span className="sr-only">
        {roster.playerTemplates.map((player) => player.positionName).join(", ")}
      </span>
    </button>
  );
}
