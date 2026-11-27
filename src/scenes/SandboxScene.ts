import { kickoffTurnOf } from "../game/kickoff/kickRecord";
import Phaser from "phaser";
import { GameScene } from "./GameScene";
import { GamePhase } from "../types/GameState";
import { sandboxTeam } from "./sandboxTeam";
import { RosterName } from "../types/Team";
import { type Team } from "../types/Team";

import { ServiceContainer } from "../services/ServiceContainer";
import { GameService } from "../services/GameService";
import { ScenarioLoader } from "../services/ScenarioLoader";
import { type IEventBus } from "../services/EventBus";
import { SCENARIOS } from "../data/scenarios";
import { findRuleConfig } from "../data/ruleScenarios";
import { findKickoffConfig, KICKOFF_TOPIC } from "../data/kickoffScenarios";
import { SCENARIO_CASES } from "../testing/cases";
import { findScenarioCase } from "../testing/scenarioCase";
import { GameEventNames, type UIEvents } from "@/types/events";
import { type Scenario } from "../types/Scenario";
import {
  SANDBOX_DEFAULT_TEAM1_ROSTER,
  SANDBOX_DEFAULT_TEAM2_ROSTER,
} from "./sandboxDefaultTeams";

interface SandboxScenario {
  scenario: Scenario;
  expectedOutcome?: string | undefined;
}

function findSandboxScenario(
  scenarioId: string,
  outcomeId: string | undefined
): SandboxScenario | undefined {
  const scenario = SCENARIOS.find((s) => s.id === scenarioId);
  if (scenario) return { scenario };
  const scenarioCase = findScenarioCase(SCENARIO_CASES, scenarioId);
  if (scenarioCase) return scenarioFromCase(scenarioCase, outcomeId);
  return scenarioFromConfig(scenarioId, outcomeId);
}

function scenarioFromCase(
  scenarioCase: NonNullable<ReturnType<typeof findScenarioCase>>,
  outcomeId: string | undefined
): SandboxScenario {
  const variant =
    scenarioCase.variants.find((candidate) => candidate.id === outcomeId) ??
    scenarioCase.variants[0];
  if (!variant) throw new Error(`Scenario ${scenarioCase.id} has no variants`);
  return {
    scenario: {
      id: scenarioCase.id,
      name: `${scenarioCase.capability}: ${scenarioCase.name}`,
      description: scenarioCase.description,
      setup: {
        ...scenarioCase.setup,

        team1Roster: scenarioCase.setup.team1Roster ?? RosterName.HUMAN,
        team2Roster: scenarioCase.setup.team2Roster ?? RosterName.HUMAN,
      },
      seed: variant.seed,
    },
    expectedOutcome: variant.expectedOutcome,
  };
}

function scenarioFromConfig(
  scenarioId: string,
  outcomeId: string | undefined
): SandboxScenario | undefined {
  const ruleConfig = findRuleConfig(scenarioId);
  const config = ruleConfig?.config ?? findKickoffConfig(scenarioId);
  if (!config) return undefined;
  return {
    scenario: {
      id: config.id,
      name: `${ruleConfig?.skill ?? KICKOFF_TOPIC}: ${config.name}`,
      description: config.description,

      setup: {
        ...config.setup,
        team1Roster: config.setup.team1Roster ?? RosterName.HUMAN,
        team2Roster: config.setup.team2Roster ?? RosterName.HUMAN,
      },
    },
    expectedOutcome: config.outcomes.find((o) => o.id === outcomeId)?.name,
  };
}

type ScenarioRequest = UIEvents[typeof GameEventNames.UI_LoadScenario];

function scenarioFromUrl(): ScenarioRequest | null {
  const urlParams = new URLSearchParams(location.search);
  const scenarioId = urlParams.get("scenario");
  if (!scenarioId) return null;
  const seed = Number(urlParams.get("seed") ?? NaN);
  const outcomeId = urlParams.get("outcome");
  return {
    scenarioId,
    ...(Number.isFinite(seed) && { seed }),
    ...(outcomeId !== null && { outcomeId }),
  };
}

export class SandboxScene extends GameScene {
  constructor() {
    super("SandboxScene");
  }

  private getBrowserEventBus(): IEventBus {
    return (globalThis as unknown as { eventBus: IEventBus }).eventBus;
  }

  override init(data: { team1?: Team; team2?: Team }): void {
    if (data?.team1 && data.team2) {
      const initialState = GameService.createInitialState({ team1: data.team1, team2: data.team2, startingPhase: GamePhase.SANDBOX_IDLE }
      );
      ServiceContainer.initialize({ eventBus: this.getBrowserEventBus(), team1: data.team1, team2: data.team2, initialState: initialState });
      super.init(data as { team1: Team; team2: Team });
    } else {
      const team1 = sandboxTeam(
        SANDBOX_DEFAULT_TEAM1_ROSTER,
        "Test Humans",
        0x4169e1
      );
      const team2 = sandboxTeam(
        SANDBOX_DEFAULT_TEAM2_ROSTER,
        "Test Orcs",
        0xdc143c
      );

      team1.coaches = 2;
      team1.cheerleaders = 3;
      team1.apothecary = true;
      team1.dedicatedFans = 2;
      team2.coaches = 1;
      team2.cheerleaders = 2;
      team2.dedicatedFans = 1;

      const initialState = GameService.createInitialState({ team1: team1, team2: team2, startingPhase: GamePhase.SANDBOX_IDLE }
      );
      ServiceContainer.initialize({ eventBus: this.getBrowserEventBus(), team1: team1, team2: team2, initialState: initialState });

      super.init({ team1, team2 });
    }

    this.listenForScenarios();
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, this.cleanupSandbox, this);
    this.events.on(Phaser.Scenes.Events.DESTROY, this.cleanupSandbox, this);
  }

  private listenForScenarios(): void {
    this.boardReady = false;
    this.pendingScenario = null;
    this.loadScenarioHandler = (request: ScenarioRequest) => {
      if (this.boardReady) this.loadRequested(request);
      else this.pendingScenario = request;
    };
    this.eventBus.on(GameEventNames.UI_LoadScenario, this.loadScenarioHandler);
  }

  private loadScenarioHandler: ((request: ScenarioRequest) => void) | null =
    null;
  private boardReady = false;
  private pendingScenario: ScenarioRequest | null = null;
  private refreshBoardHandler: (() => void) | null = null;
  private playerMovedHandler: (() => void) | null = null;

  override create(): void {
    super.create();

    this.refreshBoardHandler = () => {
      this.refreshDugouts();
    };
    this.eventBus.on(GameEventNames.RefreshBoard, this.refreshBoardHandler);

    this.playerMovedHandler = () => {
      const state = this.gameService.getState();
      if (!kickoffTurnOf(state)) state.turn.activatedPlayerIds.clear();
    };
    this.eventBus.on(GameEventNames.PlayerMoved, this.playerMovedHandler);

    this.boardReady = true;
    const request = this.pendingScenario ?? scenarioFromUrl();
    this.pendingScenario = null;
    if (!request) return;
    this.time.delayedCall(100, () => {
      this.loadRequested(request);
    });
  }

  private loadRequested(request: ScenarioRequest): void {
    this.loadScenario(request.scenarioId, request.seed, request.outcomeId);
  }

  private loadScenario(
    scenarioId: string,
    seedOverride?: number,
    outcomeId?: string
  ): void {
    const found = findSandboxScenario(scenarioId, outcomeId);
    if (!found) {
      console.warn(`Scenario not found: ${scenarioId}`);
      this.eventBus.emit(
        GameEventNames.UI_Notification,
        `Scenario not found: ${scenarioId}`
      );
      return;
    }
    const { expectedOutcome } = found;

    const promisedSeed = found.scenario.seed;
    const scenario =
      seedOverride === undefined
        ? found.scenario
        : { ...found.scenario, seed: seedOverride };
    this.swapRosters(scenario);
    this.afterTeamArt(() => {
      this.showScenario({ scenario, scenarioId, promisedSeed, expectedOutcome, outcomeId });
    });
  }

  private latestScenarioRequest = 0;

  private afterTeamArt(then: () => void): void {
    const request = ++this.latestScenarioRequest;
    const missing = new Set(
      [...this.queueTeamArt()].filter((key) => !this.textures.exists(key))
    );
    if (missing.size === 0) {
      then();
      return;
    }
    const settle = (key: string) => {
      missing.delete(key);
      const superseded = request !== this.latestScenarioRequest;
      if (missing.size > 0 && !superseded) return;
      this.load.off(Phaser.Loader.Events.FILE_COMPLETE, onLoaded);
      this.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, onFailed);
      if (!superseded) then();
    };
    const onLoaded = (key: string) => {
      settle(key);
    };
    const onFailed = (file: Phaser.Loader.File) => {
      settle(file.key);
    };
    this.load.on(Phaser.Loader.Events.FILE_COMPLETE, onLoaded);
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, onFailed);
    this.load.start();
  }

  private showScenario({
    scenario,
    scenarioId,
    promisedSeed,
    expectedOutcome,
    outcomeId,
  }: {
    scenario: Scenario;
    scenarioId: string;
    promisedSeed: number | undefined;
    expectedOutcome: Scenario["expectedOutcome"];
    outcomeId: string | undefined;
  }): void {
    if (this.ballSprite) {
      this.ballSprite.destroy();
      this.ballSprite = null;
    }

    const loader = new ScenarioLoader(this.eventBus, this.team1, this.team2);
    loader.load(scenario);

    this.reloadState(false);
    this.placePlayersOnPitch();

    if (scenario.setup.phase === GamePhase.KICKOFF) {
      const team1Kicks = scenario.setup.activeTeam !== "team2";
      this.kickingTeam = team1Kicks ? this.team1 : this.team2;
      this.receivingTeam = team1Kicks ? this.team2 : this.team1;
    }

    this.eventBus.emit(
      GameEventNames.UI_Notification,
      `Loaded Scenario: ${scenario.name}`
    );

    const effectiveSeed =
      ServiceContainer.getInstance().rngService.getInitialSeed();
    const shownOutcome =
      promisedSeed === undefined || effectiveSeed === promisedSeed
        ? (expectedOutcome ?? scenario.expectedOutcome)
        : undefined;
    this.eventBus.emit(GameEventNames.ScenarioLoaded, {
      name: scenario.name,
      seed: effectiveSeed,
      ...(shownOutcome !== undefined && { expectedOutcome: shownOutcome }),
    });

    const newUrl = new URL(location.href);
    newUrl.searchParams.set("scenario", scenarioId);
    newUrl.searchParams.set("seed", String(effectiveSeed));
    if (outcomeId && expectedOutcome) {
      newUrl.searchParams.set("outcome", outcomeId);
    } else {
      newUrl.searchParams.delete("outcome");
    }
    history.replaceState({ path: newUrl.href }, "", newUrl.href);
  }

  private swapRosters(scenario: Scenario): void {
    if (
      scenario.setup.team1Roster &&
      scenario.setup.team1Roster !== this.team1.rosterName
    ) {
      console.log(`[Sandbox] Swapping Team 1 to ${scenario.setup.team1Roster}`);
      this.team1 = sandboxTeam(
        scenario.setup.team1Roster,
        `Test ${scenario.setup.team1Roster} 1`,
        0x4169e1
      );
    }

    if (!scenario.setup.team2Roster || scenario.setup.team2Roster === this.team2.rosterName) {
      return;
    }

    console.log(`[Sandbox] Swapping Team 2 to ${scenario.setup.team2Roster}`);
    this.team2 = sandboxTeam(
      scenario.setup.team2Roster,
      `Test ${scenario.setup.team2Roster} 2`,
      0xdc143c
    );
  }

  private cleanupSandbox(): void {
    if (this.loadScenarioHandler) {
      this.eventBus.off(
        GameEventNames.UI_LoadScenario,
        this.loadScenarioHandler
      );
      this.loadScenarioHandler = null;
    }
    this.boardReady = false;
    this.pendingScenario = null;
    if (this.refreshBoardHandler) {
      this.eventBus.off(GameEventNames.RefreshBoard, this.refreshBoardHandler);
      this.refreshBoardHandler = null;
    }
    if (!this.playerMovedHandler) {
      return;
    }

    this.eventBus.off(GameEventNames.PlayerMoved, this.playerMovedHandler);
    this.playerMovedHandler = null;
  }

  public override startSetupPhase(): void {
    this.isSetupActive = false;
    this.eventBus.emit(
      GameEventNames.UI_Notification,
      "Sandbox Mode - Load a scenario to begin"
    );
  }
}
