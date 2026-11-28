import { type ReactNode, useState } from "react";
import { Chip } from "../../src/ui/components/componentWarehouse/HudBits";
import { HudButton } from "../../src/ui/components/componentWarehouse/HudButton";
import {
  Field,
  Section,
} from "../../src/ui/components/componentWarehouse/HudPage";
import { Input, Textarea } from "../../src/ui/components/common/NativeControls";
import type { Change, Layer, Layers, WeightsView } from "../boundary/schemas";
import {
  diffLayers,
  LAYERS,
  layerValues,
  withValue,
} from "../catalogue/layers";
import { Choice } from "./choices";
import { formatNumber, layerLabel, matches } from "./text";

type PlannerWeight = WeightsView["planner"][number];

export interface Draft {
  name: string;
  note: string;
  layers: Layers;
}

const layerKey = (layer: Layer) => {
  switch (layer.kind) {
    case "all":
      return "all";
    case "gameType":
      return `gameType:${layer.gameType}`;
    case "roster":
      return `roster:${layer.roster}`;
  }
};
const LAYER_OPTIONS = LAYERS.map((layer) => ({
  value: layerKey(layer),
  label: layerLabel(layer),
}));

function stepFor([low, high]: readonly [number, number]): number {
  const span = high - low;
  if (span <= 2) return 0.01;
  return span <= 20 ? 0.1 : 1;
}

interface ValueInputProps {
  weight: PlannerWeight;
  value: number;
  type: "range" | "number";
  onSet: (value: number) => void;
}

function ValueInput({ weight, value, type, onSet }: ValueInputProps) {
  const [low, high] = weight.bounds;
  return (
    <Input
      className={
        type === "number" ? "hud-field w-24" : "min-w-0 flex-1 accent-[#d9a93f]"
      }
      type={type}
      aria-label={`${weight.label} ${type === "range" ? "slider" : "value"}`}
      min={low}
      max={high}
      step={stepFor(weight.bounds)}
      value={value}
      disabled={low === high}
      onChange={(event) => {
        const next = Number(event.target.value);
        if (Number.isFinite(next)) onSet(Math.min(high, Math.max(low, next)));
      }}
    />
  );
}

interface RowProps {
  weight: PlannerWeight;
  draft: Draft;
  layer: Layer;
  onChange: (layers: Layers) => void;
}

function EditRow({ weight, draft, layer, onChange }: RowProps) {
  const own = layerValues(draft.layers, layer)[weight.name];
  const inherited =
    layer.kind === "all"
      ? weight.defaultValue
      : (draft.layers.weights[weight.name] ?? weight.defaultValue);
  const value = own ?? inherited;
  const set = (next: number | null) => {
    const kept =
      next === null || (layer.kind === "all" && next === weight.defaultValue)
        ? null
        : next;
    onChange(
      withValue(draft.layers, { layer, name: weight.name, value: kept })
    );
  };
  return (
    <div className="border-t border-white/10 py-3" data-weight={weight.name}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-hud-label font-bold">{weight.label}</span>
        {own === undefined ? (
          <Chip>inherited</Chip>
        ) : (
          <Chip tone="gold">set here</Chip>
        )}
      </div>
      <p className="text-hud-xs text-hud-mute">{weight.description}</p>
      <div className="mt-2 flex items-center gap-3">
        <ValueInput weight={weight} value={value} type="range" onSet={set} />
        <ValueInput weight={weight} value={value} type="number" onSet={set} />
        <HudButton
          size="xs"
          variant="ghost"
          disabled={own === undefined}
          onClick={() => {
            set(null);
          }}
        >
          Clear
        </HudButton>
      </div>
    </div>
  );
}

function shownValue(
  change: Change,
  side: "current" | "candidate",
  fallback: number
) {
  const value = change[side];
  if (value !== null) return formatNumber(value);
  return change.layer.kind === "all"
    ? `default ${formatNumber(fallback)}`
    : "not set";
}

function Changes({ view, layers }: { view: WeightsView; layers: Layers }) {
  const diff = diffLayers(view.current, layers);
  const weightOf = (name: string) => view.planner.find((w) => w.name === name);
  return (
    <Section
      title="Changes from current"
      aside={<span className="text-hud-xs text-hud-mute">{diff.length}</span>}
    >
      {diff.length === 0 && (
        <p className="text-hud-sm text-hud-dim">
          No changes yet. Move a slider below.
        </p>
      )}
      <ul className="space-y-1 text-hud-sm">
        {diff.map((c) => (
          <li key={`${layerLabel(c.layer)}-${c.weight}`} data-change={c.weight}>
            <span className="font-bold">{weightOf(c.weight)?.label}</span>{" "}
            <span className="text-hud-mute">{layerLabel(c.layer)}</span>{" "}
            {shownValue(c, "current", weightOf(c.weight)?.defaultValue ?? 0)} →{" "}
            <span className="text-hud-gold">
              {shownValue(
                c,
                "candidate",
                weightOf(c.weight)?.defaultValue ?? 0
              )}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function DraftFields({
  draft,
  onChange,
}: {
  draft: Draft;
  onChange: (draft: Draft) => void;
}) {
  return (
    <div className="mb-4 grid gap-3 md:grid-cols-2">
      <Field label="Name">
        <Input
          className="hud-field"
          value={draft.name}
          maxLength={60}
          onChange={(e) => {
            onChange({ ...draft, name: e.target.value });
          }}
        />
      </Field>
      <Field label="Note">
        <Textarea
          className="hud-field min-h-[2.75rem]"
          value={draft.note}
          maxLength={2000}
          onChange={(e) => {
            onChange({ ...draft, note: e.target.value });
          }}
        />
      </Field>
    </div>
  );
}

interface GroupsProps {
  view: WeightsView;
  query: string;
  draft: Draft;
  layer: Layer;
  onChange: (layers: Layers) => void;
}

function ValueGroups({ view, query, draft, layer, onChange }: GroupsProps) {
  return view.groups.map((group) => {
    const rows = view.planner.filter(
      (w) =>
        w.group === group.id &&
        matches(query, group.title, w.label, w.name, w.description)
    );
    if (rows.length === 0) return null;
    return (
      <div key={group.id} className="mt-4">
        <h3 className="hud-label">{group.title}</h3>
        <div className="grid gap-x-6 lg:grid-cols-2">
          {rows.map((weight) => (
            <EditRow
              key={weight.name}
              weight={weight}
              draft={draft}
              layer={layer}
              onChange={onChange}
            />
          ))}
        </div>
      </div>
    );
  });
}

interface EditorProps {
  view: WeightsView;
  draft: Draft;
  onChange: (draft: Draft) => void;
  actions: ReactNode;
}

export function CandidateEditor({
  view,
  draft,
  onChange,
  actions,
}: EditorProps) {
  const [key, setKey] = useState("all");
  const [query, setQuery] = useState("");
  const layer = LAYERS.find((l) => layerKey(l) === key) ?? { kind: "all" };
  const setLayers = (layers: Layers) => {
    onChange({ ...draft, layers });
  };
  return (
    <>
      <DraftFields draft={draft} onChange={onChange} />
      <Changes view={view} layers={draft.layers} />
      {actions}
      <Section title="Values">
        <div className="mb-2 flex flex-wrap items-end gap-3">
          <Choice
            label="Change it for"
            value={key}
            options={LAYER_OPTIONS}
            onChange={setKey}
          />
          <Field label="Find" className="min-w-[12rem] flex-1">
            <Input
              className="hud-field"
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
              }}
            />
          </Field>
        </div>
        <ValueGroups
          view={view}
          query={query}
          draft={draft}
          layer={layer}
          onChange={setLayers}
        />
      </Section>
    </>
  );
}
