import { fixtureValue } from "../../src/testing/fixtureValue";
import { type Page } from "@playwright/test";
import type { HeadlessCommand } from "../../src/headless/protocol";
import type {
  ExecutionLayer,
  SemanticStep,
  LayerSupport,
} from "../../src/testing/scenarioCase";
import { GameApp } from "./pages/game";

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

function browserSupports(step: SemanticStep): boolean {
  return BROWSER_SUPPORTED.has(step.command.type);
}

export const layerSupport: LayerSupport = {
  supports(layer: ExecutionLayer, step: SemanticStep): boolean {
    if (layer === "engine") return true;
    return browserSupports(step);
  },
};

export interface BrowserStepContext {
  app: GameApp;
  page: Page;
}

async function performStep(
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
      await app.pitch.clickPath(command.path);
      await app.pitch.clickSquare(fixtureValue(command.path[command.path.length - 1]));
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
    case "foul":
      await app.pitch.clickSquare({ x: command.x, y: command.y });
      return;

    case "handoff":
      await app.pitch.clickPlayer(command.targetId);
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

export async function performSteps(
  context: BrowserStepContext,
  steps: SemanticStep[]
): Promise<void> {
  for (const step of steps) {
    await performStep(context, step);
  }
}
