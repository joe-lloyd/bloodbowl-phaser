import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { EventBus } from "../../src/services/EventBus";
import { GameEventNames } from "../../src/types/events";
import { GamePhase } from "../../src/types/GameState";
import { MatchResultsScreen } from "../../src/ui/components/hud/MatchResultsScreen";
import { TeamBuilder } from "../utils/test-builders";

describe("MatchResultsScreen", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    ServiceContainer.reset();
  });

  function setup(progressionEnabled: boolean) {
    const team1 = new TeamBuilder()
      .withId("team-1")
      .withName("Reikland Reavers")
      .withPlayers(2)
      .build();
    const team2 = new TeamBuilder()
      .withId("team-2")
      .withName("Bad Badgers")
      .withPlayers(2)
      .build();
    const eventBus = new EventBus();
    const services = ServiceContainer.initialize(
      eventBus,
      team1,
      team2,
      undefined,
      undefined,
      undefined,
      progressionEnabled
    );
    const state = services.gameService.getState();
    state.phase = GamePhase.GAME_OVER;
    return { services, state, team1, team2 };
  }

  async function render() {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <MatchResultsScreen visible={true} />
        </MemoryRouter>
      );
    });
  }

  it("shows the result and statistics for a progression-disabled match, with no SPP column and a free exit", async () => {
    const { state } = setup(false);
    state.score["team-1"] = 2;
    state.score["team-2"] = 1;

    await render();

    expect(container.textContent).toContain("Full Time");
    expect(container.textContent).toContain("Reikland Reavers");
    expect(container.textContent).toContain("Bad Badgers");
    expect(container.textContent).toContain("2 : 1");
    expect(container.textContent).toContain("Reikland Reavers win");
    const sppHeader = [...container.querySelectorAll("th")].find(
      (th) => th.textContent === "SPP"
    );
    expect(sppHeader).toBeUndefined();
    expect(
      container.textContent
    ).toContain("This match does not award SPP");

    const exitButton = [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Continue to Main Menu")
    )!;
    expect(exitButton.disabled).toBe(false);
  });

  it("holds the exit until MVP/SPP is confirmed for a progression-eligible match", async () => {
    const { services, state, team1, team2 } = setup(true);
    state.score["team-1"] = 1;
    state.score["team-2"] = 0;
    // One participant per team so the default MVP nomination is already
    // complete (no selection clicks required to enable the roll button).
    services.eventBus.emit(GameEventNames.PlayerActivated, team1.players[0].id);
    services.eventBus.emit(GameEventNames.PlayerActivated, team2.players[0].id);

    await render();

    let exitButton = [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Continue to Main Menu")
    )!;
    expect(exitButton.disabled).toBe(true);

    const rollButtons = [...container.querySelectorAll("button")].filter((b) =>
      b.textContent?.includes("Roll MVP D6")
    );
    expect(rollButtons).toHaveLength(2);
    for (const button of rollButtons) {
      await act(async () => {
        button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    }

    const confirmButton = [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Confirm and assign SPP")
    )!;
    expect(confirmButton.disabled).toBe(false);
    await act(async () => {
      confirmButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    exitButton = [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Continue to Main Menu")
    )!;
    expect(exitButton.disabled).toBe(false);
  });

  it("labels a concession without inventing a touchdown or mutating the played score (regression: 0-0 stays 0-0)", async () => {
    const { state, team1 } = setup(false);
    state.score["team-1"] = 0;
    state.score["team-2"] = 0;
    state.result = { reason: "concession", concedingTeamId: team1.id };

    await render();

    expect(container.textContent).toContain("0 : 0");
    expect(container.textContent).toContain("Reikland Reavers conceded");
    expect(container.textContent).not.toContain("win");
    expect(container.textContent).not.toContain("Draw");
  });
});
