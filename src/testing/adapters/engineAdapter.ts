/**
 * The engine adapter: runs a scenario case against `HeadlessGame`.
 *
 * Semantic steps are protocol commands carrying stable refs, so "adapting"
 * here is mostly resolving those refs and answering whatever decisions the
 * run raises — using the same `answerDecision` policy the rule catalog uses,
 * so a case behaves identically in both places.
 *
 * Everything the checkpoints and the diagnostic bundle need is recorded:
 * the initial snapshot, every response, every decision as it was raised,
 * every event in emission order, and the final snapshot.
 */

import { HeadlessGame } from "../../headless/HeadlessGame";
import {
  HeadlessCommand,
  CommandResponse,
  PendingDecision,
} from "../../headless/protocol";
import { Scenario } from "../../types/Scenario";
import { answerDecision } from "../../game/rules-lab/runner";
import { resolveCommandReferences } from "../../game/rules-lab/references";
import {
  ObservedRun,
  ScenarioCase,
  SeededVariant,
  SemanticStep,
} from "../scenarioCase/types";

/** How many decision replies one step may need before we call it a loop. */
const DECISION_GUARD = 25;

export interface EngineObservedRun extends ObservedRun {
  layer: "engine";
  /** The live game, for checkpoints that need more than the snapshot. */
  game: HeadlessGame;
  /** Per-step log, in order, for the diagnostic bundle. */
  stepLog: EngineStepRecord[];
}

export interface EngineStepRecord {
  index: number;
  intent: string;
  command: HeadlessCommand;
  ok: boolean;
  reason?: string;
  /** Decision replies this step needed before it resolved. */
  replies: HeadlessCommand[];
}

/** Human-readable label for a step, used in logs and failure messages. */
export function describeStep(step: SemanticStep, index: number): string {
  return step.intent ?? `${step.command.type} (step ${index + 1})`;
}

/** Build the `Scenario` payload a case's setup represents. */
export function scenarioForCase(
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

/**
 * Run one case/variant pair. Never throws for a rejected command — a case
 * may legitimately assert that a command is refused — but does throw when a
 * step's decisions fail to settle, since that is a harness bug, not a result.
 */
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
      ...(response.reason ? { reason: response.reason } : {}),
      replies: [],
    };
    stepLog.push(record);

    let guard = 0;
    while (response.pendingDecision) {
      if (guard++ >= DECISION_GUARD) {
        throw new Error(
          `${scenarioCase.id}/${variant.id}: step '${record.intent}' still had a ` +
            `'${response.pendingDecision.type}' decision after ${DECISION_GUARD} replies — ` +
            `the decision policy is not converging`
        );
      }
      decisions.push(response.pendingDecision);
      const reply = answerDecision(response.pendingDecision, game, policy);
      // A policy returning null deliberately leaves the decision pending; the
      // case's checkpoints assert on that state, so stop the script here.
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
