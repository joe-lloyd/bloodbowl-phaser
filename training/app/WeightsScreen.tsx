import { useCallback, useState } from "react";
import { Chip } from "../../src/ui/components/componentWarehouse/HudBits";
import {
  Field,
  Section,
} from "../../src/ui/components/componentWarehouse/HudPage";
import { cx } from "../../src/ui/components/componentWarehouse/hudTone";
import { Input } from "../../src/ui/components/common/NativeControls";
import type { MatchType } from "../../src/game/variants/gameTypes";
import type { RosterName } from "../../src/types/Team";
import { api } from "../boundary/client";
import {
  ALL_ROSTERS,
  MATCH_TYPES,
  type WeightsView,
} from "../boundary/schemas";
import { Choice } from "./choices";
import { formatNumber, layerLabel, MATCH_TYPE_LABELS, matches } from "./text";
import { Loaded } from "./Loaded";
import { useLoad } from "./useLoad";

type PlannerWeight = WeightsView["planner"][number];
type Group = WeightsView["groups"][number];

const MATCH_OPTIONS = MATCH_TYPES.map((value) => ({
  value,
  label: MATCH_TYPE_LABELS[value],
}));
const ROSTER_OPTIONS: { value: RosterName | ""; label: string }[] = [
  { value: "", label: "Any team" },
  ...ALL_ROSTERS.map((value) => ({ value, label: value })),
];

function Meter({
  value,
  bounds,
}: {
  value: number;
  bounds: readonly [number, number];
}) {
  const [low, high] = bounds;
  if (low === high)
    return (
      <p className="mt-1 text-hud-xs text-hud-mute">
        Fixed: the tuner cannot move it.
      </p>
    );
  const at = Math.min(1, Math.max(0, (value - low) / (high - low)));
  return (
    <div className="relative mt-2 h-1.5 rounded-full bg-black/60" aria-hidden>
      <span
        className="absolute -top-1 h-3.5 w-1 rounded bg-hud-gold"
        style={{ left: `calc(${String(at * 100)}% - 2px)` }}
      />
    </div>
  );
}

function WeightRow({ weight }: { weight: PlannerWeight }) {
  const changed = weight.value !== weight.defaultValue;
  const elsewhere = weight.overrides.map(
    (o) => `${layerLabel(o.layer)} ${formatNumber(o.value)}`
  );
  const plans = weight.plans.map(
    (p) => `${p.plan} plan ${formatNumber(p.value)}`
  );
  return (
    <div
      className="border-t border-white/10 py-3 first:border-t-0 first:pt-0"
      data-weight={weight.name}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-hud-label text-hud-base font-bold text-hud-bone">
          {weight.label}
        </span>
        <span className="flex items-center gap-2">
          {weight.setBy !== "default" && (
            <Chip tone="gold">{weight.setBy}</Chip>
          )}
          <span
            className={cx(
              "font-hud-label text-hud-lg font-bold",
              changed ? "text-hud-gold" : "text-hud-bone"
            )}
          >
            {formatNumber(weight.value)}
          </span>
        </span>
      </div>
      <p className="mt-1 text-hud-sm text-hud-dim">{weight.description}</p>
      <Meter value={weight.value} bounds={weight.bounds} />
      <p className="mt-1.5 text-hud-xs text-hud-mute">
        {weight.name} · default {formatNumber(weight.defaultValue)} · tuning{" "}
        {formatNumber(weight.bounds[0])} to {formatNumber(weight.bounds[1])}
        {[...elsewhere, ...plans].map((line) => ` · ${line}`).join("")}
      </p>
    </div>
  );
}

function GroupCard({
  group,
  weights,
  query,
}: {
  group: Group;
  weights: PlannerWeight[];
  query: string;
}) {
  const titled = matches(query, group.title, group.summary);
  const shown = titled
    ? weights
    : weights.filter((w) => matches(query, w.label, w.name, w.description));
  if (shown.length === 0) return null;
  return (
    <Section
      title={group.title}
      aside={<span className="text-hud-xs text-hud-mute">{shown.length}</span>}
      className="mb-0"
    >
      <p className="mb-3 text-hud-sm text-hud-dim">{group.summary}</p>
      {shown.map((weight) => (
        <WeightRow key={weight.name} weight={weight} />
      ))}
    </Section>
  );
}

function Evaluation({ view, query }: { view: WeightsView; query: string }) {
  const shown = view.evaluation.filter((f) =>
    matches(query, "board evaluation", f.label, f.name, f.description)
  );
  if (shown.length === 0) return null;
  return (
    <Section title="Board evaluation (Hard and Legend)" className="mt-6">
      <p className="mb-3 text-hud-sm text-hud-dim">
        Hard and Legend score the end of each lookahead with these. They are
        fitted from played games, not tuned, so they have no bounds and no
        roster layer.
      </p>
      <div className="grid gap-x-6 md:grid-cols-2 xl:grid-cols-3">
        {shown.map((f) => (
          <div key={f.name} className="border-t border-white/10 py-2">
            <div className="flex justify-between gap-3">
              <span className="font-hud-label font-bold">{f.label}</span>
              <span
                className={
                  f.value === f.defaultValue ? "text-hud-bone" : "text-hud-gold"
                }
              >
                {formatNumber(f.value)}
              </span>
            </div>
            <p className="text-hud-sm text-hud-dim">{f.description}</p>
            <p className="text-hud-xs text-hud-mute">
              {f.name} · default {formatNumber(f.defaultValue)}
            </p>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Groups({ view, query }: { view: WeightsView; query: string }) {
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {view.groups.map((group) => (
          <GroupCard
            key={group.id}
            group={group}
            weights={view.planner.filter((w) => w.group === group.id)}
            query={query}
          />
        ))}
      </div>
      <Evaluation view={view} query={query} />
    </>
  );
}

export function WeightsScreen() {
  const [matchType, setMatchType] = useState<MatchType>("sevens");
  const [roster, setRoster] = useState<RosterName | "">("");
  const [query, setQuery] = useState("");
  const load = useCallback(
    () =>
      api.listWeights(roster === "" ? { matchType } : { matchType, roster }),
    [matchType, roster]
  );
  const { state } = useLoad(load);
  return (
    <>
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <Choice
          label="Game type"
          value={matchType}
          options={MATCH_OPTIONS}
          onChange={setMatchType}
        />
        <Choice
          label="Team"
          value={roster}
          options={ROSTER_OPTIONS}
          onChange={setRoster}
        />
        <Field label="Find" className="min-w-[14rem] flex-1">
          <Input
            className="hud-field"
            type="search"
            placeholder="hurt, carrier, risk, pass…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
          />
        </Field>
      </div>
      <Loaded state={state}>
        {(view) => <Groups view={view} query={query} />}
      </Loaded>
    </>
  );
}
