/**
 * The browser adapter: drives a scenario case's semantic steps through real
 * controls.
 *
 * The engine adapter can execute every protocol command by definition — it
 * *is* the protocol. The browser can only execute what the UI actually
 * offers, so this module is also the authority on which steps a
 * browser-required case may contain: `browserSupport` is handed to the
 * scenario-case validator, which fails the case by name rather than letting
 * it silently skip its own coverage claim.
 */

import { Page } from "@playwright/test";
import type { HeadlessCommand } from "../../src/headless/protocol";
import type {
  ExecutionLayer,
  SemanticStep,
  LayerSupport,
} from "../../src/testing/scenarioCase";
import { GameApp } from "./pages/game";

/**
 * Commands the browser lane can perform through visible controls.
 *
 * Deliberately narrower than the protocol: setup, kickoff-event and
 * post-match commands have UI flows that the first rollout does not model,
 * so cases needing them declare the engine layer only.
 */
const BROWSER_SUPPORTED: ReadonlySet<HeadlessCommand["type"]> = new Set([
  "declare-action",
  "cancel-action",
  "move",
  "jump",
  "stand-up",
  "block",
  "pass",
  "handoff",
  "foul",
  "end-activation",
  "end-turn",
  "choose-block-result",
  "choose-follow-up",
  "use-reroll",
  "use-reaction",
]);

/** Whether the browser lane can drive this step. */
export function browserSupports(step: SemanticStep): boolean {
  return BROWSER_SUPPORTED.has(step.command.type);
}

/**
 * The `LayerSupport` the scenario-case validator uses. The engine supports
 * everything; the browser supports the set above; a visual case runs on top
 * of a browser case, so it inherits the browser answer.
 */
export const layerSupport: LayerSupport = {
  supports(layer: ExecutionLayer, step: SemanticStep): boolean {
    if (layer === "engine") return true;
    return browserSupports(step);
  },
};

/** Names the unsupported steps of a case, for a readable validation failure. */
export function unsupportedBrowserSteps(steps: SemanticStep[]): SemanticStep[] {
  return steps.filter((step) => !browserSupports(step));
}

export interface BrowserStepContext {
  app: GameApp;
  page: Page;
}

/**
 * Perform one semantic step through the UI.
 *
 * Decision replies are steps too: a case that expects a reroll offer answers
 * it with a `use-reroll` step, and the adapter clicks the dialog. That keeps
 * a case's script identical in both lanes.
 */
export async function performStep(
  { app }: BrowserStepContext,
  step: SemanticStep
): Promise<void> {
  const command = step.command;

  switch (command.type) {
    case "declare-action":
      await app.hud.declareAction(command.playerId, command.action);
      return;

    case "cancel-action":
      await app.hud.actionButton("cancel").click();
      return;

    case "move":
      // The browser plans a move as waypoints: each click on a new square
      // appends to the planned path, and clicking the last waypoint again
      // commits it. So the protocol's `path` is "click each square, then
      // confirm the destination" — which is exactly what a coach does.
      await app.pitch.clickPath(command.path);
      await app.pitch.clickSquare(command.path[command.path.length - 1]);
      return;

    case "jump":
      await app.pitch.clickSquare({ x: command.x, y: command.y });
      return;

    case "stand-up":
      await app.hud.declareAction(command.playerId, "standUp");
      return;

    case "block":
      await app.pitch.clickPlayer(command.defenderId);
      return;

    case "pass":
    case "handoff":
    case "foul":
      await app.pitch.clickSquare({ x: command.x, y: command.y });
      return;

    case "end-activation":
      await app.hud.actionButton("end-activation").click();
      return;

    case "end-turn":
      await app.hud.endTurn().click();
      return;

    case "choose-block-result":
      await app.hud.chooseBlockDie(command.index);
      return;

    case "choose-follow-up":
      await app.hud.answerFollowUp(command.followUp);
      return;

    case "use-reroll":
      await app.hud.answerReroll(
        command.accept,
        command.source === "team" ? "team" : "skill"
      );
      return;

    case "use-reaction":
      await app.hud.answerReaction(command.accept);
      return;

    default:
      throw new Error(
        `no browser adapter for '${command.type}' — this case should not ` +
          `declare the browser layer (see BROWSER_SUPPORTED in browserAdapter.ts)`
      );
  }
}

/** Run every step of a case in order. */
export async function performSteps(
  context: BrowserStepContext,
  steps: SemanticStep[]
): Promise<void> {
  for (const step of steps) {
    await performStep(context, step);
  }
}
