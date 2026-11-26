import { fixtureValue } from "../../src/testing/fixtureValue";
import { test, expect } from "@playwright/test";
import { GamePhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { GameApp } from "../support/pages/game";
import { recordBrowserCoverage } from "../support/coverageFragments";

const ATTRIBUTION = "movement-unopposed-walk";

test.describe("local match creation", () => {
  test("starts a match from the menu and reaches the pitch", async ({
    page,
  }) => {
    const app = new GameApp(page);
    await app.menu.open();
    await app.menu.playLocal();

    await expect(page).toHaveURL(/\/select-team/);
    await expect(
      page.getByRole("heading", { name: "TEAM SELECTION" })
    ).toBeVisible();

    const noTeams = page.getByRole("heading", {
      name: /need at least 2 teams/i,
    });
    const coachPanels = page.getByText("Player 1");
    await expect(noTeams.or(coachPanels).first()).toBeVisible();
  });

  test("the sandbox launches a scenario and the HUD comes up with it", async ({
    page,
  }) => {
    const app = new GameApp(page);
    await app.sandbox.open({ scenario: "basic-scrimmage", seed: 1 });

    await expect(app.pitch.canvas).toBeVisible();

    await expect(app.hud.endTurn()).toBeVisible();
    const phase = await app.bridge.phase();
    expect(phase.phase).toBe(GamePhase.PLAY);
  });
});

test.describe("core turn interactions", () => {
  test("declares an action from the HUD and ends the turn", async ({
    page,
  }) => {
    const app = new GameApp(page);
    await app.sandbox.open({ scenario: "basic-scrimmage", seed: 1 });

    const before = await app.bridge.phase();
    await app.hud.declareAction("team1:0", "move");

    await expect
      .poll(async () => {
        const snapshot = await app.bridge.snapshot();
        return snapshot.activePlayer?.action;
      })
      .toBe("move");

    const priorEvents = await app.bridge.events();
    const eventsBefore = priorEvents.length;
    await app.hud.endTurn().click();

    await expect
      .poll(async () => {
        const phase = await app.bridge.phase();
        return phase.activeTeamId;
      })
      .not.toBe(before.activeTeamId);
    const events = await app.bridge.events(eventsBefore);
    expect(events.map((event) => event.name)).toContain(
      GameEventNames.TurnStarted
    );

    recordBrowserCoverage(ATTRIBUTION, "journey-turn", [
      "protocol-command:declare-action",
      "protocol-command:end-turn",
    ]);
  });

  test("throws a block through the canvas and resolves the dice dialog", async ({
    page,
  }) => {
    const app = new GameApp(page);

    await app.sandbox.open({ scenario: "chain-push", seed: 1 });

    await app.hud.declareAction("team1:0", "block");

    await app.pitch.clickPlayer("team2:0");

    await app.hud.rollBlockDice();
    await expect
      .poll(async () => {
        const logged = await app.bridge.events();
        return logged.some(
          (event) => event.name === GameEventNames.BlockDiceRolled
        );
      })
      .toBe(true);

    await app.hud.chooseBlockDie(0);

    await expect(app.hud.blockDiceDialog()).toBeHidden();

    recordBrowserCoverage(ATTRIBUTION, "journey-block", [
      "protocol-command:block",
      "protocol-command:choose-block-result",
      "decision:block-dice",
    ]);
  });

  test("answers a follow-up prompt from the HUD", async ({ page }) => {
    const app = new GameApp(page);
    await app.sandbox.open({ scenario: "chain-push", seed: 1 });

    await app.hud.declareAction("team1:0", "block");
    await app.pitch.clickPlayer("team2:0");
    await app.hud.rollBlockDice();
    await app.hud.chooseBlockDie(0);

    const followUp = app.hud.followUpDialog();
    const offered = await followUp
      .waitFor({ state: "visible", timeout: 5000 })
      .then(() => true)
      .catch(() => false);

    if (offered) {
      await app.hud.answerFollowUp(false);
      await expect(followUp).toBeHidden();
    }

    await expect(app.hud.blockDiceDialog()).toBeHidden();
  });
});

test.describe("presentation", () => {
  test("a link that still asks for the Neon style opens the Blood Bowl stadium", async ({
    page,
  }) => {
    const stadiumArt: string[] = [];
    page.on("request", (request) => {
      const path = new URL(request.url()).pathname;
      if (path.includes("/stadium/")) stadiumArt.push(path);
    });
    const app = new GameApp(page);
    await page.goto("/sand-box?scenario=basic-scrimmage&seed=1&theme=neon");
    await app.pitch.waitForCanvas();
    await app.sandbox.waitForScenarioLoaded();
    const snapshot = await app.bridge.snapshot();
    expect(fixtureValue(fixtureValue(snapshot.teams[0]).players[0]).position).toEqual({ x: 9, y: 5 });

    await page.reload();
    await app.pitch.waitForCanvas();
    await app.sandbox.waitForScenarioLoaded();
    const afterReload = await app.bridge.snapshot();
    expect(fixtureValue(fixtureValue(afterReload.teams[0]).players[0]).position).toEqual({ x: 9, y: 5 });

    expect(
      stadiumArt.some((p) => p.endsWith("/stadium/bloodbowl/base.webp"))
    ).toBe(true);
    expect(
      stadiumArt.filter((p) => !p.includes("/stadium/bloodbowl/"))
    ).toEqual([]);
  });

  test("the stadium fills the window with the pitch inside it", async ({
    page,
  }) => {
    const app = new GameApp(page);
    await app.sandbox.open({ scenario: "basic-scrimmage", seed: 1 });

    const canvasBox = fixtureValue((await app.pitch.canvas.boundingBox()));
    const viewport = fixtureValue(page.viewportSize());
    expect(canvasBox.width).toBeCloseTo(viewport.width, -1);
    expect(canvasBox.height).toBeCloseTo(viewport.height, -1);

    const pitchRect = await app.pitch.pitchViewportRect();
    expect(pitchRect.x).toBeGreaterThanOrEqual(canvasBox.x);
    expect(pitchRect.y).toBeGreaterThanOrEqual(canvasBox.y);
    expect(pitchRect.x + pitchRect.width).toBeLessThanOrEqual(
      canvasBox.x + canvasBox.width
    );
    expect(pitchRect.y + pitchRect.height).toBeLessThanOrEqual(
      canvasBox.y + canvasBox.height
    );
  });
});
