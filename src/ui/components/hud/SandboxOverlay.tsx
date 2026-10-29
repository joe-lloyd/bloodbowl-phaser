import { useState } from "react";
import { EventBus } from "../../../services/EventBus";
import { useEventBus, useEventEmit } from "../../hooks/useEventBus";
import { SCENARIOS } from "../../../data/scenarios";
import {
  findKickoffConfig,
  KICKOFF_SCENARIOS,
  KICKOFF_TOPIC,
} from "../../../data/kickoffScenarios";
import {
  findRuleConfig,
  ruleScenariosFor,
  skillsInTopic,
  topicForSkill,
  TRAIT_TOPIC,
  NEGATRAIT_TOPIC,
} from "../../../data/ruleScenarios";
import { findSeed, RuleConfig } from "../../../game/rules-lab";
import { SkillRegistry } from "../../../game/skills";
import { SkillCategory, SkillType } from "../../../types/Skills";
import { ScenarioCasePanel } from "./ScenarioCasePanel";
import { SCENARIO_CASES } from "../../../testing/cases";
import { findScenarioCase } from "../../../testing/scenarioCase";
import { GameEventNames } from "@/types/events";
import { hudButtonClass, Panel } from "../componentWarehouse/HudKit";

interface SandboxOverlayProps {
  eventBus: EventBus;
}

const CORE_TOPIC = "core";
/** The E2E scenario-case explorer: what CI actually runs. */
const CASE_TOPIC = "e2e-cases";

/**
 * Rebuild the explorer's form state from the URL the scene maintains
 * (?scenario=&seed=&outcome=). Only the config id, seed and outcome are
 * stored — topic and rule are derived from the config id via the catalog —
 * so a refresh restores every select without a param per level.
 */
function formStateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const scenarioId = params.get("scenario") ?? "";
  const empty = {
    topic: "",
    skill: "",
    configId: "",
    coreId: "",
    seed: params.get("seed") ?? "",
    outcomeId: "",
  };
  if (!scenarioId) return empty;
  if (SCENARIOS.some((s) => s.id === scenarioId)) {
    return { ...empty, topic: CORE_TOPIC, coreId: scenarioId };
  }
  // A scenario-case id — the reference a CI failure quotes.
  if (findScenarioCase(SCENARIO_CASES, scenarioId)) {
    return { ...empty, topic: CASE_TOPIC, configId: scenarioId };
  }
  if (findKickoffConfig(scenarioId)) {
    return {
      ...empty,
      topic: KICKOFF_TOPIC,
      configId: scenarioId,
      outcomeId: params.get("outcome") ?? "",
    };
  }
  const rule = findRuleConfig(scenarioId);
  if (!rule) return empty;
  return {
    ...empty,
    topic: topicForSkill(rule.skill),
    skill: rule.skill as string,
    configId: scenarioId,
    outcomeId: params.get("outcome") ?? "",
  };
}

const selectClass = "hud-field cursor-pointer";
const boxClass =
  "rounded-hud border border-white/10 bg-black/30 px-2.5 py-1.5 text-hud-sm text-hud-bone/85";

/**
 * Leveled scenario selection: Topic → Rule (implemented/inert badge) →
 * Configuration → Seed. Each level appears once the previous one is chosen;
 * the seed row can search for a seed producing a chosen outcome by running
 * the headless engine in-browser.
 */
export function SandboxOverlay({ eventBus }: SandboxOverlayProps) {
  const emit = useEventEmit(eventBus);

  const [init] = useState(formStateFromUrl);
  const [topic, setTopic] = useState(init.topic);
  const [skill, setSkill] = useState(init.skill);
  const [configId, setConfigId] = useState(init.configId);
  const [seedInput, setSeedInput] = useState(init.seed);
  const [outcomeId, setOutcomeId] = useState(init.outcomeId);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [scenarioInfo, setScenarioInfo] = useState<{
    name: string;
    seed?: number;
    expectedOutcome?: string;
  } | null>(null);

  useEventBus(eventBus, GameEventNames.ScenarioLoaded, (data) => {
    setScenarioInfo(data);
  });

  const entry = skill ? ruleScenariosFor(skill as SkillType) : undefined;
  const visibleConfigs =
    topic === KICKOFF_TOPIC ? KICKOFF_SCENARIOS : entry?.configs;
  const config: RuleConfig | undefined = visibleConfigs?.find(
    (candidate) => candidate.id === configId
  );
  const selectedOutcome = config?.outcomes.find(
    (outcome) => outcome.id === outcomeId
  );

  const load = (scenarioId: string, seed?: number, outcome?: string) => {
    setSearchError(null);
    emit(GameEventNames.UI_LoadScenario, {
      scenarioId,
      seed,
      outcomeId: outcome,
    });
  };

  const pickTopic = (value: string) => {
    setTopic(value);
    setSkill("");
    setConfigId("");
    setOutcomeId("");
    setSearchError(null);
  };

  const pickSkill = (value: string) => {
    setSkill(value);
    setConfigId("");
    setOutcomeId("");
    setSearchError(null);
  };

  const pickConfig = (value: string) => {
    setConfigId(value);
    setOutcomeId("");
    if (value) load(value, parsedSeed());
  };

  const pickOutcome = (value: string) => {
    setOutcomeId(value);
    const outcome = config?.outcomes.find(
      (candidate) => candidate.id === value
    );
    if (outcome?.exampleSeed !== undefined && config) {
      setSeedInput(String(outcome.exampleSeed));
      load(config.id, outcome.exampleSeed, outcome.id);
    }
  };

  const parsedSeed = (): number | undefined => {
    const n = Number(seedInput);
    return seedInput !== "" && Number.isFinite(n) ? n : undefined;
  };

  const rollRandomSeed = () => {
    const seed = Math.floor(Math.random() * 1_000_000) + 1;
    setSeedInput(String(seed));
    if (configId) load(configId, seed);
  };

  const findSeedForOutcome = async () => {
    if (!config || !outcomeId) return;
    setSearching(true);
    setSearchError(null);
    try {
      const found = await findSeed(config, outcomeId);
      setSeedInput(String(found.seed));
      load(config.id, found.seed, outcomeId);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : String(error));
    } finally {
      setSearching(false);
    }
  };

  return (
    <Panel accent="blood" className="w-full pointer-events-auto animate-hud-in">
      <h3 className="flex min-h-[40px] items-center border-b border-hud-gold/20 px-3 font-hud-display text-hud-lg uppercase tracking-[0.04em] text-hud-bone">
        SANDBOX
      </h3>
      <div className="flex flex-col gap-2 p-2.5">
        {/* Level 1: Topic */}
        <select
          aria-label="Sandbox topic"
          value={topic}
          onChange={(e) => pickTopic(e.target.value)}
          className={selectClass}
        >
          <option value="" disabled>
            Select Topic
          </option>
          <option value={CORE_TOPIC}>Core Rules</option>
          <option value={CASE_TOPIC}>E2E Cases</option>
          <option value={KICKOFF_TOPIC}>{KICKOFF_TOPIC}</option>
          <option value={NEGATRAIT_TOPIC}>Negatraits</option>
          <option value={TRAIT_TOPIC}>Traits</option>
          {Object.values(SkillCategory).map((category) => (
            <option key={category} value={category}>
              {category} Skills
            </option>
          ))}
        </select>

        {/* Core topic: the classic flat scenario list */}
        {topic === CORE_TOPIC && (
          <select
            aria-label="Core scenario"
            defaultValue={init.coreId}
            onChange={(e) => e.target.value && load(e.target.value)}
            className={selectClass}
          >
            <option value="" disabled>
              Select Scenario
            </option>
            {SCENARIOS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}

        {/* E2E cases: the same cases, variants and seeds CI runs */}
        {topic === CASE_TOPIC && <ScenarioCasePanel eventBus={eventBus} />}

        {/* Level 2: Rule, badged implemented (✓) / inert (○) */}
        {topic &&
          topic !== CORE_TOPIC &&
          topic !== CASE_TOPIC &&
          topic !== KICKOFF_TOPIC && (
            <select
              aria-label="Sandbox rule"
              value={skill}
              onChange={(e) => pickSkill(e.target.value)}
              className={selectClass}
            >
              <option value="" disabled>
                Select Rule
              </option>
              {skillsInTopic(topic).map((type) => (
                <option key={type} value={type}>
                  {SkillRegistry.has(type) ? "✓" : "○"} {type}
                </option>
              ))}
            </select>
          )}

        {/* Level 3: Configuration */}
        {(topic === KICKOFF_TOPIC || skill) &&
          (visibleConfigs ? (
            <select
              aria-label="Sandbox configuration"
              value={configId}
              onChange={(e) => pickConfig(e.target.value)}
              className={selectClass}
            >
              <option value="" disabled>
                Select Configuration
              </option>
              {visibleConfigs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : (
            <div className={`${boxClass} italic`}>
              {SkillRegistry.has(skill as SkillType)
                ? "No configurations yet."
                : "Inert — no rule implemented yet."}
            </div>
          ))}

        {config && <div className={boxClass}>{config.description}</div>}

        {/* Level 4: Seed row + outcome finder */}
        {config && (
          <>
            <div className="flex gap-1">
              <input
                aria-label="Scenario seed"
                type="number"
                value={seedInput}
                onChange={(e) => setSeedInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") load(config.id, parsedSeed());
                  e.stopPropagation();
                }}
                placeholder="Seed"
                className="hud-field font-mono"
              />
              <button
                onClick={rollRandomSeed}
                title="Random seed"
                className={`${hudButtonClass("secondary", "sm")} !px-2.5`}
              >
                🎲
              </button>
            </div>
            <div className="flex gap-1">
              <select
                aria-label="Seeded outcome"
                value={outcomeId}
                onChange={(e) => pickOutcome(e.target.value)}
                className={`${selectClass} flex-1`}
              >
                <option value="" disabled>
                  Outcome…
                </option>
                {config.outcomes.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
              <button
                onClick={findSeedForOutcome}
                disabled={!outcomeId || searching}
                className={hudButtonClass("gold", "sm")}
              >
                {searching ? "…" : "FIND"}
              </button>
            </div>
            {selectedOutcome?.description && (
              <div className={boxClass}>{selectedOutcome.description}</div>
            )}
            {searchError && (
              <div className="rounded-hud border border-hud-bad/60 bg-hud-blood-deep/40 px-2.5 py-1.5 text-hud-sm text-[#ff9a8f]">
                {searchError}
              </div>
            )}
          </>
        )}

        {scenarioInfo && (
          <div
            data-testid="sandbox-scenario-info"
            data-scenario-seed={scenarioInfo.seed ?? ""}
            className={`${boxClass} font-mono`}
          >
            <div>
              <span className="hud-label inline">Seed:</span>{" "}
              <span className="font-bold text-hud-gold">
                {scenarioInfo.seed ?? "—"}
              </span>
            </div>
            {scenarioInfo.expectedOutcome && (
              <div className="italic text-hud-dim">
                {scenarioInfo.expectedOutcome}
              </div>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}
