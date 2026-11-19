import { fixtureValue } from "../../src/testing/fixtureValue";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { MatchResultsScreen } from "../../src/ui/components/hud/MatchResultsScreen";
import { InjuryType, PlayerStatus } from "../../src/types/Player";
import { ArmourOperation } from "../../src/game/operations/ArmourOperation";
import { CrowdInjuryOperation } from "../../src/game/operations/CrowdInjuryOperation";
import { GameFlowManager, noDelay } from "../../src/game/core/GameFlowManager";
import { resultsHarness, setup } from "./matchResultsScreenHarness";

const clearActiveMatchCode = vi.fn(() => Promise.resolve());
vi.mock("../../src/firebase/lobby", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/firebase/lobby")>()),
  clearActiveMatchCode: (uid: string) => clearActiveMatchCode(uid),
}));
vi.mock("../../src/firebase/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/firebase/auth")>()),
  getCurrentUser: () => ({ uid: "coach-uid" }),
}));

vi.mock("../../src/firebase/config", () => ({
  isFirebaseConfigured: vi.fn(() => false),
  getDb: vi.fn(),
}));

describe("MatchResultsScreen", () => {
  const h = resultsHarness();

  it("shows the result and statistics for a progression-disabled match, with no SPP column and a free exit", async () => {
    const { state } = setup(false);
    state.score["team-1"] = 2;
    state.score["team-2"] = 1;

    await h.render();

    expect(h.container.textContent).toContain("Full Time");
    expect(h.container.textContent).toContain("Reikland Reavers");
    expect(h.container.textContent).toContain("Bad Badgers");
    expect(h.container.textContent).toContain("2 : 1");
    expect(h.container.textContent).toContain("Reikland Reavers win");
    const sppHeader = [...h.container.querySelectorAll("th")].find(
      (th) => th.textContent === "SPP"
    );
    expect(sppHeader).toBeUndefined();
    expect(
      [...h.container.querySelectorAll("th")].some(
        (th) => th.textContent === "MVP"
      )
    ).toBe(false);
    expect(h.container.textContent).toContain("This match does not award SPP");

    const exitButton = fixtureValue([...h.container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Continue to Main Menu")
    ));
    expect(exitButton.disabled).toBe(false);
  });

  it("opens at full time on a HUD that was already mounted during play", async () => {
    setup(false);
    const screen = (visible: boolean) => (
      <MemoryRouter>
        <MatchResultsScreen visible={visible} />
      </MemoryRouter>
    );
    await act(async () => {
      h.root.render(screen(false));
    });
    await act(async () => {
      h.root.render(screen(true));
    });
    expect(h.container.textContent).toContain("Full Time");
  });

  it("lists injuries suffered by both teams, including players who never activated", async () => {
    const { team1, team2 } = setup(false);
    fixtureValue(team1.players[0]).status = PlayerStatus.INJURED;
    fixtureValue(team1.players[0]).injuries = [InjuryType.BADLY_HURT];
    fixtureValue(team1.players[1]).status = PlayerStatus.INJURED;
    fixtureValue(team1.players[1]).injuries = [InjuryType.MISS_NEXT_GAME];
    fixtureValue(team2.players[0]).status = PlayerStatus.DEAD;
    fixtureValue(team2.players[0]).injuries = [InjuryType.DEAD];
    await h.render();
    const injuries = h.container.querySelector(
      '[data-testid="match-injuries-team-1"]'
    );
    expect(injuries?.textContent).toContain(
      `${fixtureValue(team1.players[0]).playerName} #1: Badly hurt`
    );
    expect(injuries?.textContent).toContain(
      `${fixtureValue(team1.players[1]).playerName} #2: Seriously hurt`
    );
    expect(
      h.container.querySelector('[data-testid="match-injuries-team-2"]')
        ?.textContent
    ).toContain(`${fixtureValue(team2.players[0]).playerName} #1: Dead`);
  });

  it.each(["dodge", "crowd"])(
    "shows a casualty from a %s in injuries suffered",
    async (cause) => {
      const { services, team1 } = setup(false);
      const player = team1.players[0];
      fixtureValue(player).skills = [];
      fixtureValue(player).stats.AV = 2;
      vi.spyOn(
        services.gameService.getDiceController(),
        "roll2D6"
      ).mockReturnValue(10);
      const flow = new GameFlowManager({
        gameService: services.gameService,
        eventBus: services.eventBus,
        delay: noDelay,
      });
      flow.add(
        cause === "dodge"
          ? new ArmourOperation(fixtureValue(player).id, undefined, {
              cause: "dodge",
              vacatedSquare: { x: 9, y: 5 },
            })
          : new CrowdInjuryOperation(fixtureValue(player).id, { x: 0, y: 5 }, false)
      );
      await flow.whenIdle();
      await h.render();
      expect(
        h.container.querySelector('[data-testid="match-injuries-team-1"]')
          ?.textContent
      ).toContain(`${fixtureValue(player).playerName} #1: Badly hurt`);
    }
  );

  it("names the winner of a knockout tie decided on Penalties", async () => {
    const { state } = setup(false);
    state.score["team-1"] = 1;
    state.score["team-2"] = 1;
    state.result = {
      reason: "completed",
      penalties: { "team-1": 2, "team-2": 3 },
    };

    await h.render();

    expect(h.container.textContent).toContain("1 : 1");
    expect(h.container.textContent).toContain(
      "Bad Badgers win on Penalties, 3–2"
    );
    expect(h.container.textContent).not.toContain("Draw");
  });

  it("labels a concession without inventing a touchdown or mutating the played score (regression: 0-0 stays 0-0)", async () => {
    const { state, team1 } = setup(false);
    state.score["team-1"] = 0;
    state.score["team-2"] = 0;
    state.result = { reason: "concession", concedingTeamId: team1.id };

    await h.render();

    expect(h.container.textContent).toContain("0 : 0");
    expect(h.container.textContent).toContain("Reikland Reavers conceded");
    expect(h.container.textContent).not.toContain("win");
    expect(h.container.textContent).not.toContain("Draw");
  });
});
