/**
 * A decision answered from the keyboard: the key on a button's badge
 * presses it, unless the coach is typing in a field.
 */
import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { GameEventNames } from "../../src/types/events";
import { ReactionDialog } from "../../src/ui/components/hud/ReactionDialog";
import { ConfirmationModal } from "../../src/ui/components/hud/ConfirmationModal";

let container: HTMLDivElement;
let root: Root;
let bus: EventBus;
let answers: unknown[];

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  bus = new EventBus();
  answers = [];
  bus.on(GameEventNames.UI_ReactionResponse, (answer) => answers.push(answer));
  bus.on(GameEventNames.UI_ConfirmationResult, (answer) =>
    answers.push(answer)
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const press = (key: string, target: EventTarget = document.body) =>
  act(async () => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
    );
  });

async function askStandFirm() {
  await act(async () => root.render(<ReactionDialog eventBus={bus} />));
  await act(async () =>
    bus.emit(GameEventNames.DecisionRequested, {
      type: "reaction",
      playerId: "player-1",
      chooserTeamId: "team-2",
      skill: "Stand Firm",
      prompt: "Refuse the push?",
    })
  );
}

it("answers yes with Y and shows the key on the button", async () => {
  await askStandFirm();
  expect(
    container.querySelector('[data-testid="reaction-yes"] kbd')?.textContent
  ).toBe("Y");
  await press("y");
  expect(answers).toEqual([{ accept: true }]);
  // The dialog closed, so its keys went with it
  await press("n");
  expect(answers).toEqual([{ accept: true }]);
});

it("answers no with N", async () => {
  await askStandFirm();
  await press("n");
  expect(answers).toEqual([{ accept: false }]);
});

it("leaves the letters alone while the coach types in a field", async () => {
  await askStandFirm();
  const field = document.createElement("input");
  document.body.appendChild(field);
  await press("y", field);
  field.remove();
  expect(answers).toEqual([]);
  expect(container.querySelector('[data-testid="reaction-dialog"]')).not.toBe(
    null
  );
});

it("confirms with Enter and cancels with Escape", async () => {
  await act(async () => root.render(<ConfirmationModal eventBus={bus} />));
  const ask = (actionId: string) =>
    act(async () =>
      bus.emit(GameEventNames.UI_RequestConfirmation, {
        actionId,
        title: "Confirm foul",
        message: "Armour: 8+",
        confirmLabel: "Foul!",
      })
    );
  await ask("foul-1");
  await press("Enter");
  await ask("foul-2");
  await press("Escape");
  expect(answers).toEqual([
    { actionId: "foul-1", confirmed: true },
    { actionId: "foul-2", confirmed: false },
  ]);
});
