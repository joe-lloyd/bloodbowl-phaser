import { HeadlessGame } from "../../headless/HeadlessGame";
import {
  type HeadlessCommand,
  type CommandResponse,
  type PendingDecision,
} from "../../headless/protocol";
import { type Scenario } from "../../types/Scenario";
import { answerDecision } from "../../game/rules-lab/runner";
import { resolveCommandReferences } from "../../game/rules-lab/references";
import {
  type ObservedRun,
  type ScenarioCase,
  type SeededVariant,
  type SemanticStep,
} from "../scenarioCase/types";

const DECISION_GUARD = 25;

export interface EngineObservedRun extends ObservedRun {
  layer: "engine";

  game: HeadlessGame;

  stepLog: EngineStepRecord[];
}

interface EngineStepRecord {
  index: number;
  intent: string;
  command: HeadlessCommand;
  ok: boolean;
  reason?: string;

  replies: HeadlessCommand[];
}

function describeStep(step: SemanticStep, index: number): string {
  return step.intent ?? `${step.command.type} (step ${String(index + 1)})`;
}

function scenarioForCase(
  scenarioCase: ScenarioCase,
  variant: SeededVariant
): Scenario {
  return {
    id: `${scenarioCase.id}/${variant.id}`,
    name: `${scenarioCase.name} — ${variant.name}`,
    description: scenarioCase.description,
    setup: scenarioCase.setup,
    seed: variant.seed,
    expectedOutcome: variant.expectedOutcome,
  };
}

export async function runCaseInEngine(
  scenarioCase: ScenarioCase,
  variant: SeededVariant
): Promise<EngineObservedRun> {
  const game = new HeadlessGame({
    scenario: scenarioForCase(scenarioCase, variant),
    seed: variant.seed,
  });
  if (scenarioCase.setup.turn !== undefined) {
    game.ctx.gameService.seedTurnCounts(scenarioCase.setup.turn);
  }
  if (scenarioCase.rerolls?.team1) {
    game.ctx.team1.rerolls = scenarioCase.rerolls.team1;
  }
  if (scenarioCase.rerolls?.team2) {
    game.ctx.team2.rerolls = scenarioCase.rerolls.team2;
  }

  const initialSnapshot = game.snapshot();
  const policy = scenarioCase.decisionPolicy ?? {};
  const responses: CommandResponse[] = [];
  const decisions: PendingDecision[] = [];
  const stepLog: EngineStepRecord[] = [];

  const execute = async (command: HeadlessCommand) => {
    const response = await game.execute(
      resolveCommandReferences(game.ctx, command)
    );
    responses.push(response);
    return response;
  };

  steps: for (const [index, step] of scenarioCase.steps.entries()) {
    let response = await execute(step.command);
    const record: EngineStepRecord = {
      index,
      intent: describeStep(step, index),
      command: step.command,
      ok: response.ok,
      ...(response.reason && { reason: response.reason }),
      replies: [],
    };
    stepLog.push(record);

    let guard = 0;
    while (response.pendingDecision) {
      if (guard++ >= DECISION_GUARD) {
        throw new Error(
          `${scenarioCase.id}/${variant.id}: step '${record.intent}' still had a ` +
            `'${response.pendingDecision.type}' decision after ${String(DECISION_GUARD)} replies — ` +
            `the decision policy is not converging`
        );
      }
      decisions.push(response.pendingDecision);
      const reply = answerDecision(response.pendingDecision, game, policy);

      if (reply === null) break steps;
      record.replies.push(reply);
      response = await execute(reply);
    }
  }

  return {
    layer: "engine",
    game,
    initialSnapshot,
    snapshot: game.snapshot(),
    events: responses.flatMap((response) => response.events),
    decisions,
    responses,
    stepLog,
  };
}
