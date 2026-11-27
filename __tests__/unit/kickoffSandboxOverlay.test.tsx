import { fixtureValue } from "../../src/testing/fixtureValue";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { GameEventNames } from "../../src/types/events";
import { SandboxOverlay } from "../../src/ui/components/hud/SandboxOverlay";

describe("Kickoff Table sandbox selector", () => {
  let container: HTMLDivElement;
  let root: Root;
  let eventBus: EventBus;

  beforeEach(() => {
    history.replaceState({}, "", "/sand-box");
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    eventBus = new EventBus();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("loads a curated seed when a kickoff outcome is selected", async () => {
    const loads: {
      scenarioId: string;
      seed?: number;
      outcomeId?: string;
    }[] = [];
    eventBus.on(GameEventNames.UI_LoadScenario, (data) => {
      loads.push(data);
    });

    await act(async () => {
      root.render(
        <MemoryRouter>
          <SandboxOverlay eventBus={eventBus} />
        </MemoryRouter>
      );
    });

    const topic = fixtureValue(container.querySelector<HTMLSelectElement>(
      '[aria-label="Sandbox topic"]'
    ));
    expect([...topic.options].map((option) => option.text)).toContain(
      "Kickoff Table"
    );

    await act(async () => {
      topic.value = "Kickoff Table";
      topic.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const configuration = fixtureValue(container.querySelector<HTMLSelectElement>(
      '[aria-label="Sandbox configuration"]'
    ));
    expect([...configuration.options].map((option) => option.text)).toEqual([
      "Select Configuration",
      "Standard Kickoff (Turn 2)",
      "Late-Half Kickoff (Turn 5)",
    ]);

    await act(async () => {
      configuration.value = "kickoff-table-standard";
      configuration.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const outcome = fixtureValue(container.querySelector<HTMLSelectElement>(
      '[aria-label="Seeded outcome"]'
    ));
    expect(outcome.options).toHaveLength(12);

    await act(async () => {
      outcome.value = "quick-snap";
      outcome.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(
      fixtureValue(container.querySelector<HTMLInputElement>('[aria-label="Scenario seed"]'))
        .value
    ).toBe("7");
    expect(loads.at(-1)).toEqual({
      scenarioId: "kickoff-table-standard",
      seed: 7,
      outcomeId: "quick-snap",
    });
  });
});
