import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { EventBus } from "../../../services/EventBus";
import { useEventBus, useEventEmit } from "../../hooks/useEventBus";
import { SCENARIOS } from "../../../data/scenarios";
import {
  findRuleConfig,
  ruleScenariosFor,
  skillsInCategory,
} from "../../../data/ruleScenarios";
import { findSeed, RuleConfig } from "../../../game/rules-lab";
import { SkillRegistry } from "../../../game/skills";
import {
  SKILL_DEFINITIONS,
  SkillCategory,
  SkillType,
} from "../../../types/Skills";
import { Button } from "../componentWarehouse/Button";
import { GameEventNames } from "@/types/events";

interface SandboxOverlayProps {
  eventBus: EventBus;
}

const CORE_TOPIC = "core";

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
  const rule = findRuleConfig(scenarioId);
  if (!rule) return empty;
  return {
    ...empty,
    topic: SKILL_DEFINITIONS[rule.skill]?.category ?? "",
    skill: rule.skill as string,
    configId: scenarioId,
    outcomeId: params.get("outcome") ?? "",
  };
}

const selectClass =
  "w-full px-2 py-1.5 text-sm bg-bb-parchment border-2 border-bb-gold rounded font-heading text-bb-text cursor-pointer hover:border-bb-blood-red transition-colors pointer-events-auto";

/**
 * Leveled scenario selection: Topic → Rule (implemented/inert badge) →
 * Configuration → Seed. Each level appears once the previous one is chosen;
 * the seed row can search for a seed producing a chosen outcome by running
 * the headless engine in-browser.
 */
export function SandboxOverlay({ eventBus }: SandboxOverlayProps) {
  const emit = useEventEmit(eventBus);
  const navigate = useNavigate();

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
  const config: RuleConfig | undefined = entry?.configs.find(
    (c) => c.id === configId
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
    <div className="w-full bg-bb-warm-paper border-2 border-bb-gold rounded-lg p-3 shadow-lg pointer-events-auto">
      <h3 className="text-bb-blood-red font-bold font-heading text-sm mb-2 text-center border-b border-bb-divider pb-1">
        SANDBOX
      </h3>
      <div className="flex flex-col gap-2">
        {/* Level 1: Topic */}
        <select
          value={topic}
          onChange={(e) => pickTopic(e.target.value)}
          className={selectClass}
        >
          <option value="" disabled>
            Select Topic
          </option>
          <option value={CORE_TOPIC}>Core Rules</option>
          {Object.values(SkillCategory).map((category) => (
            <option key={category} value={category}>
              {category} Skills
            </option>
          ))}
        </select>

        {/* Core topic: the classic flat scenario list */}
        {topic === CORE_TOPIC && (
          <select
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

        {/* Level 2: Rule, badged implemented (✓) / inert (○) */}
        {topic && topic !== CORE_TOPIC && (
          <select
            value={skill}
            onChange={(e) => pickSkill(e.target.value)}
            className={selectClass}
          >
            <option value="" disabled>
              Select Rule
            </option>
            {skillsInCategory(topic as SkillCategory).map((type) => (
              <option key={type} value={type}>
                {SkillRegistry.has(type) ? "✓" : "○"} {type}
              </option>
            ))}
          </select>
        )}

        {/* Level 3: Configuration */}
        {skill &&
          (entry ? (
            <select
              value={configId}
              onChange={(e) => pickConfig(e.target.value)}
              className={selectClass}
            >
              <option value="" disabled>
                Select Configuration
              </option>
              {entry.configs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : (
            <div className="text-xs italic text-bb-text/70 bg-bb-parchment border border-bb-gold/60 rounded px-2 py-1">
              {SkillRegistry.has(skill as SkillType)
                ? "No configurations yet."
                : "Inert — no rule implemented yet."}
            </div>
          ))}

        {/* Level 4: Seed row + outcome finder */}
        {config && (
          <>
            <div className="flex gap-1">
              <input
                type="number"
                value={seedInput}
                onChange={(e) => setSeedInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") load(config.id, parsedSeed());
                  e.stopPropagation();
                }}
                placeholder="Seed"
                className="w-full px-2 py-1 text-sm bg-bb-parchment border-2 border-bb-gold rounded font-mono text-bb-text pointer-events-auto"
              />
              <button
                onClick={rollRandomSeed}
                title="Random seed"
                className="px-2 border-2 border-bb-gold rounded bg-bb-parchment hover:border-bb-blood-red transition-colors"
              >
                🎲
              </button>
            </div>
            <div className="flex gap-1">
              <select
                value={outcomeId}
                onChange={(e) => setOutcomeId(e.target.value)}
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
                className="px-2 text-xs font-heading border-2 border-bb-gold rounded bg-bb-parchment hover:border-bb-blood-red transition-colors disabled:opacity-50"
              >
                {searching ? "…" : "FIND"}
              </button>
            </div>
            {searchError && (
              <div className="text-xs text-bb-blood-red bg-bb-parchment border border-bb-blood-red rounded px-2 py-1">
                {searchError}
              </div>
            )}
          </>
        )}

        {scenarioInfo && (
          <div className="text-xs bg-bb-parchment border border-bb-gold/60 rounded px-2 py-1 font-mono text-bb-text">
            <div>
              Seed: <span className="font-bold">{scenarioInfo.seed ?? "—"}</span>
            </div>
            {scenarioInfo.expectedOutcome && (
              <div className="italic text-bb-text/80">
                {scenarioInfo.expectedOutcome}
              </div>
            )}
          </div>
        )}

        <Button
          onClick={() => navigate("/")}
          className="text-xs py-1.5 bg-gray-600 hover:bg-gray-500 border-gray-400"
        >
          EXIT
        </Button>
      </div>
    </div>
  );
}
