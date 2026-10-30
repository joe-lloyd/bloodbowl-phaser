import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { GameEventNames } from "../../src/types/events";
import { DiceLog } from "../../src/ui/components/hud/DiceLog";

let host: HTMLDivElement;
let root: Root;
let bus: EventBus;

beforeEach(async () => {
  host = document.createElement("div");
  root = createRoot(host);
  bus = new EventBus();
  await act(async () => root.render(<DiceLog eventBus={bus} />));
});

afterEach(async () => {
  await act(async () => root.unmount());
});

const dodge = {
  rollType: "Dodge",
  diceType: "1d6",
  description: "Dodge failed: rolled 1",
  value: 1,
  total: 1,
};

/** What the dice tray reports as it throws and lands rolls. */
const tray = (thrown: number, landedThrough: number) =>
  bus.emit(GameEventNames.UI_DiceInAir, {
    count: thrown - landedThrough,
    thrown,
    landedThrough,
  });

it("holds a roll's row until the tray says that roll has landed", async () => {
  await act(async () => {
    bus.emit(GameEventNames.DiceRoll, dodge);
    tray(1, 0);
    bus.emit(GameEventNames.UI_LogEntry, {
      category: "action",
      headline: "Turnover",
    });
  });
  expect(host.textContent).not.toContain("Dodge failed");
  expect(host.textContent).not.toContain("Turnover");

  await act(async () => tray(1, 1));
  expect(host.textContent).toContain("Dodge failed: rolled 1");
  const text = host.textContent ?? "";
  expect(text.indexOf("Turnover")).toBeLessThan(text.indexOf("Dodge failed"));
});

it("logs at once when the tray reports first", async () => {
  await act(async () => {
    tray(1, 0);
    bus.emit(GameEventNames.DiceRoll, dodge);
  });
  expect(host.textContent).not.toContain("Dodge failed");
  await act(async () => tray(1, 1));
  expect(host.textContent).toContain("Dodge failed: rolled 1");
});

it("logs at once with no tray", async () => {
  await act(async () => bus.emit(GameEventNames.DiceRoll, dodge));
  expect(host.textContent).toContain("Dodge failed: rolled 1");
});
