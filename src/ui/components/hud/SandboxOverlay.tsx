import { useState } from "react";
import type { EventBus } from "../../../services/EventBus";
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
import { findSeed, type RuleConfig } from "../../../game/rules-lab";
import { SkillRegistry } from "../../../game/skills";
import type { SkillType } from "../../../types/Skills";
import { SkillCategory } from "../../../types/Skills";
import { ScenarioCasePanel } from "./ScenarioCasePanel";
import { SCENARIO_CASES } from "../../../testing/cases";
import { findScenarioCase } from "../../../testing/scenarioCase";
import { GameEventNames } from "@/types/events";
import { ARENA_SCENARIO_ID } from "../../../scenes/sandboxDefaultTeams";
import {
  hudButtonClass,
  Panel,
  PanelHeader,
} from "../componentWarehouse/HudKit";

interface SandboxOverlayProps {
  eventBus: EventBus;
}

const CORE_TOPIC = "core";

const CASE_TOPIC = "e2e-cases";

const emptyForm = (params: URLSearchParams) => ({
  topic: "",
  skill: "",
  configId: "",
  coreId: "",
  seed: params.get("seed") ?? "",
  outcomeId: "",
});

function formStateFromUrl() {
  const params = new URLSearchParams(location.search);
  const scenarioId = params.get("scenario") ?? "";
  const empty = emptyForm(params);
  if (!scenarioId) return empty;
  if (scenarioId === ARENA_SCENARIO_ID)
    return { ...empty, topic: ARENA_SCENARIO_ID };
  if (SCENARIOS.some((s) => s.id === scenarioId)) {
    return { ...empty, topic: CORE_TOPIC, coreId: scenarioId };
  }

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
    skill: rule.skill,
    configId: scenarioId,
    outcomeId: params.get("outcome") ?? "",
  };
}

interface ScenarioInfo {
  name: string;
  seed?: number;
  expectedOutcome?: string;
}

const selectClass = "hud-field hud-field-sm cursor-pointer";
const boxClass =
  "rounded-hud border border-white/10 bg-black/30 px-2.5 py-1.5 text-hud-sm text-hud-bone/85";

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
  const [scenarioInfo, setScenarioInfo] = useState<ScenarioInfo | null>(null);

  useEventBus(eventBus, GameEventNames.ScenarioLoaded, (data) => {
    setScenarioInfo(data);
  });

  const visibleConfigs = configsFor(topic, skill);
  const config: RuleConfig | undefined = visibleConfigs?.find(
    (candidate) => candidate.id === configId
  );

  const load = (scenarioId: string, seed?: number, outcome?: string) => {
    setSearchError(null);
    emit(GameEventNames.UI_LoadScenario, {
      scenarioId,
      ...(seed !== undefined && { seed: seed }),
      ...(outcome !== undefined && { outcomeId: outcome }),
    });
  };

  const pickTopic = (value: string) => {
    setTopic(value);
    setSkill("");
    setConfigId("");
    setOutcomeId("");
    setSearchError(null);
    if (value === ARENA_SCENARIO_ID) load(ARENA_SCENARIO_ID);
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
    if (outcome?.exampleSeed === undefined || !config) {
      return;
    }

    setSeedInput(String(outcome.exampleSeed));
    load(config.id, outcome.exampleSeed, outcome.id);
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
      <PanelHeader as="h3" title="Sandbox" />
      <div className="flex flex-col gap-2 p-2.5">
        <select
          aria-label="Sandbox topic"
          value={topic}
          onChange={(e) => {
            pickTopic(e.target.value);
          }}
          className={selectClass}
        >
          <option value="" disabled>
            Select Topic
          </option>
          <option value={CORE_TOPIC}>Core Rules</option>
          <option value={CASE_TOPIC}>E2E Cases</option>
          <option value={KICKOFF_TOPIC}>{KICKOFF_TOPIC}</option>
          <option value={ARENA_SCENARIO_ID}>Deathbowl arena</option>
          <option value={NEGATRAIT_TOPIC}>Negatraits</option>
          <option value={TRAIT_TOPIC}>Traits</option>
          {Object.values(SkillCategory).map((category) => (
            <option key={category} value={category}>
              {category} Skills
            </option>
          ))}
        </select>

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

        {topic === CASE_TOPIC && <ScenarioCasePanel eventBus={eventBus} />}

        {topicHasRules(topic) && (
          <select
            aria-label="Sandbox rule"
            value={skill}
            onChange={(e) => {
              pickSkill(e.target.value);
            }}
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

        {(topic === KICKOFF_TOPIC || skill) &&
          (visibleConfigs ? (
            <select
              aria-label="Sandbox configuration"
              value={configId}
              onChange={(e) => {
                pickConfig(e.target.value);
              }}
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
            <NoConfigurations skill={skill} />
          ))}

        {config && <div className={boxClass}>{config.description}</div>}

        {config && (
          <SeedFinder
            config={config}
            seedInput={seedInput}
            onSeedInput={setSeedInput}
            onLoadSeed={() => {
              load(config.id, parsedSeed());
            }}
            onRandomSeed={rollRandomSeed}
            outcomeId={outcomeId}
            onPickOutcome={pickOutcome}
            onFind={findSeedForOutcome}
            searching={searching}
            searchError={searchError}
          />
        )}

        {scenarioInfo && <LoadedScenario info={scenarioInfo} />}
      </div>
    </Panel>
  );
}

function topicHasRules(topic: string): boolean {
  return (
    !!topic &&
    topic !== CORE_TOPIC &&
    topic !== CASE_TOPIC &&
    topic !== KICKOFF_TOPIC &&
    topic !== ARENA_SCENARIO_ID
  );
}

function configsFor(topic: string, skill: string): RuleConfig[] | undefined {
  if (topic === KICKOFF_TOPIC) return KICKOFF_SCENARIOS;
  return skill ? ruleScenariosFor(skill as SkillType)?.configs : undefined;
}

function NoConfigurations({ skill }: { skill: string }) {
  return (
    <div className={`${boxClass} italic`}>
      {SkillRegistry.has(skill as SkillType)
        ? "No configurations yet."
        : "Inert — no rule implemented yet."}
    </div>
  );
}

function LoadedScenario({ info }: { info: ScenarioInfo }) {
  return (
    <div
      data-testid="sandbox-scenario-info"
      data-scenario-seed={info.seed ?? ""}
      className={boxClass}
    >
      <div>
        <span className="hud-label inline">Seed:</span>{" "}
        <span className="font-bold tabular-nums text-hud-gold">
          {info.seed ?? "—"}
        </span>
      </div>
      {info.expectedOutcome && (
        <div className="italic text-hud-dim">{info.expectedOutcome}</div>
      )}
    </div>
  );
}

function SeedFinder({
  config,
  seedInput,
  onSeedInput,
  onLoadSeed,
  onRandomSeed,
  outcomeId,
  onPickOutcome,
  onFind,
  searching,
  searchError,
}: {
  config: RuleConfig;
  seedInput: string;
  onSeedInput: (value: string) => void;
  onLoadSeed: () => void;
  onRandomSeed: () => void;
  outcomeId: string;
  onPickOutcome: (value: string) => void;
  onFind: () => void;
  searching: boolean;
  searchError: string | null;
}) {
  const selectedOutcome = config.outcomes.find(
    (outcome) => outcome.id === outcomeId
  );
  return (
    <>
      <div className="flex gap-1">
        <input
          aria-label="Scenario seed"
          type="number"
          value={seedInput}
          onChange={(e) => {
            onSeedInput(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") onLoadSeed();
            e.stopPropagation();
          }}
          placeholder="Seed"
          className="hud-field hud-field-sm tabular-nums"
        />
        <button
          onClick={onRandomSeed}
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
          onChange={(e) => {
            onPickOutcome(e.target.value);
          }}
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
          onClick={onFind}
          disabled={!outcomeId || searching}
          className={hudButtonClass("primary", "sm")}
        >
          {searching ? "…" : "FIND"}
        </button>
      </div>
      {selectedOutcome?.description && (
        <div className={boxClass}>{selectedOutcome.description}</div>
      )}
      {searchError && (
        <div className="rounded-hud border border-hud-bad/60 bg-hud-blood-deep/40 px-2.5 py-1.5 text-hud-sm text-hud-bad-soft">
          {searchError}
        </div>
      )}
    </>
  );
}
