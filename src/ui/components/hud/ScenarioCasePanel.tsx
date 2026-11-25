import { useMemo, useState } from "react";
import type { EventBus } from "../../../services/EventBus";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { GameEventNames } from "@/types/events";
import { useEventBus } from "../../hooks/useEventBus";
import { serializeGameState } from "../../../headless/serialization";
import { SCENARIO_CASES } from "../../../testing/cases";
import {
  type ScenarioCase,
  type SeededVariant,
  checkpointsForLayer,
  interactiveCases,
  matchesQuery,
} from "../../../testing/scenarioCase";
import { describeFixture } from "../../../testing/fixtures/describeFixture";
import { sandboxUrlFor } from "../../../testing/diagnostics/bundle";
import { hudButtonClass } from "../componentWarehouse/HudKit";

interface ScenarioCasePanelProps {
  eventBus: EventBus;
}

const selectClass = "hud-field hud-field-sm cursor-pointer";
const inputClass = "hud-field hud-field-sm font-mono";
const boxClass =
  "rounded-hud border border-white/10 bg-black/30 px-2.5 py-1.5 text-hud-sm text-hud-bone/85";

interface CheckpointState {
  id: string;
  description: string;
  passed: boolean;
  detail?: string;
}

export function ScenarioCasePanel({ eventBus }: ScenarioCasePanelProps) {
  const cases = useMemo(() => interactiveCases(SCENARIO_CASES), []);
  const [query, setQuery] = useState("");
  const [caseId, setCaseId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [copied, setCopied] = useState(false);
  const [checkpoints, setCheckpoints] = useState<CheckpointState[] | null>(
    null
  );

  const [, setTick] = useState(0);

  const visible = useMemo(
    () => cases.filter((entry) => matchesQuery(entry, query)),
    [cases, query]
  );
  const scenarioCase: ScenarioCase | undefined = cases.find(
    (entry) => entry.id === caseId
  );
  const variant: SeededVariant | undefined =
    scenarioCase?.variants.find((entry) => entry.id === variantId) ??
    scenarioCase?.variants[0];

  useEventBus(eventBus, GameEventNames.PlayerMoved, () => {
    setTick((n) => n + 1);
  });
  useEventBus(eventBus, GameEventNames.Turnover, () => {
    setTick((n) => n + 1);
  });

  const load = (nextCaseId: string, nextVariantId?: string) => {
    const target = cases.find((entry) => entry.id === nextCaseId);
    if (!target) return;
    const chosen =
      target.variants.find((entry) => entry.id === nextVariantId) ??
      target.variants[0];
    if (!chosen) return;
    setCheckpoints(null);
    eventBus.emit(GameEventNames.UI_LoadScenario, {
      scenarioId: target.id,
      seed: chosen.seed,
      outcomeId: chosen.id,
    });
  };

  const pickCase = (value: string) => {
    setCaseId(value);
    const target = cases.find((entry) => entry.id === value);
    const first = target?.variants[0]?.id ?? "";
    setVariantId(first);
    if (value) load(value, first);
  };

  const pickVariant = (value: string) => {
    setVariantId(value);
    if (caseId) load(caseId, value);
  };

  const checkNow = () => {
    if (!scenarioCase || !variant) return;
    if (!ServiceContainer.isInitialized()) return;
    const container = ServiceContainer.getInstance();
    const state = container.gameService.getState();
    const snapshot = serializeGameState(
      state,
      container.gameService.getTeams()
    );

    const observed = {
      layer: "browser" as const,
      initialSnapshot: snapshot,
      snapshot,
      events: [],
      decisions: [],
      responses: [],
    };

    setCheckpoints(
      checkpointsForLayer(scenarioCase, variant, "browser")
        .concat(checkpointsForLayer(scenarioCase, variant, "engine"))
        .filter(
          (checkpoint, index, all) =>
            all.findIndex((other) => other.id === checkpoint.id) === index
        )
        .map((checkpoint) => {
          try {
            checkpoint.assert(observed);
            return {
              id: checkpoint.id,
              description: checkpoint.description,
              passed: true,
            };
          } catch (error) {
            return {
              id: checkpoint.id,
              description: checkpoint.description,
              passed: false,
              detail: error instanceof Error ? error.message : String(error),
            };
          }
        })
    );
  };

  const copyReference = () => {
    if (!scenarioCase || !variant) return;

    const reference = `${scenarioCase.id}/${variant.id} (seed ${String(variant.seed)}) ${sandboxUrlFor(scenarioCase, variant)}`;
    void navigator.clipboard?.writeText(reference);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
    }, 1500);
  };

  const fixture = scenarioCase ? describeFixture(scenarioCase) : null;

  return (
    <div className="flex flex-col gap-2" data-testid="scenario-case-panel">
      <input
        aria-label="Filter scenario cases"
        data-testid="case-filter"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
        }}
        placeholder="id, capability, rule, tag, BUG-…"
        className={inputClass}
      />

      <select
        aria-label="Scenario case"
        data-testid="case-select"
        value={caseId}
        onChange={(event) => {
          pickCase(event.target.value);
        }}
        className={selectClass}
      >
        <option value="" disabled>
          Select Case ({visible.length})
        </option>
        {visible.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.id}
          </option>
        ))}
      </select>

      {scenarioCase && (
        <>
          <div className={boxClass}>{scenarioCase.description}</div>

          <select
            aria-label="Case variant"
            data-testid="variant-select"
            value={variant?.id ?? ""}
            onChange={(event) => {
              pickVariant(event.target.value);
            }}
            className={selectClass}
          >
            {scenarioCase.variants.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name} (seed {entry.seed})
              </option>
            ))}
          </select>

          {variant && (
            <div className={`${boxClass} italic`} data-testid="variant-outcome">
              {variant.expectedOutcome}
            </div>
          )}

          {fixture && (
            <div className={boxClass} data-testid="fixture-panel">
              <div className="font-semibold text-hud-bone">
                {fixture.team1Roster} vs {fixture.team2Roster}
                {fixture.fullyAuthentic ? " ✓ roster-authentic" : ""}
              </div>
              {fixture.placements.map((placement) => (
                <div key={placement.ref} className="mt-1">
                  <span className="font-mono">{placement.ref}</span>{" "}
                  {placement.positionName}
                  {placement.nativeSkills.length > 0 && (
                    <span className="text-hud-dim">
                      {" "}
                      — roster: {placement.nativeSkills.join(", ")}
                    </span>
                  )}
                  {placement.statOverrides.length > 0 && (
                    <span className="text-hud-dim">
                      {" "}
                      — pinned: {placement.statOverrides.join(", ")}
                    </span>
                  )}
                  {placement.grants.map((grant) => (
                    <div key={grant.skill} className="pl-3">
                      {grant.legality === "illegal" && !grant.reason
                        ? "⚠"
                        : "+"}{" "}
                      {grant.skill}{" "}
                      <span className="text-hud-dim">
                        (
                        {grant.legality === "native"
                          ? "already on the roster"
                          : grant.legality === "illegal"
                            ? (grant.reason ??
                              `no native fixture${grant.preferredNative ? `; prefer ${grant.preferredNative}` : ""}`)
                            : grant.legality.replace("-", " ")}
                        )
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-1">
            <button
              onClick={checkNow}
              data-testid="check-checkpoints"
              className={`${hudButtonClass("primary", "sm")} flex-1`}
            >
              CHECK
            </button>
            <button
              onClick={copyReference}
              data-testid="copy-reference"
              title="Copy a reproduction reference"
              className={hudButtonClass("secondary", "sm")}
            >
              {copied ? "COPIED" : "COPY REF"}
            </button>
          </div>

          {checkpoints && (
            <div className={boxClass} data-testid="checkpoint-results">
              {checkpoints.map((checkpoint) => (
                <div
                  key={checkpoint.id}
                  data-testid={`checkpoint-${checkpoint.id}`}
                  data-passed={checkpoint.passed ? "true" : "false"}
                >
                  {checkpoint.passed ? "✓" : "✗"} {checkpoint.description}
                  {checkpoint.detail && (
                    <div className="pl-3 text-hud-bad-soft">
                      {checkpoint.detail}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
