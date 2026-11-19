import { fixtureValue } from "../../src/testing/fixtureValue";
import { test, expect } from "@playwright/test";
import { GameApp } from "../support/pages/game";
import { expectVisualCheckpoint, freezeAnimation } from "../support/visual";

import { MOVEMENT_CASES } from "../../src/testing/cases/movement";

const scenarioCase = MOVEMENT_CASES[0];
const variant = fixtureValue(scenarioCase).variants[0];

test.describe("pitch presentation @visual", () => {
  test("the default pitch, dugouts and sidelines", async ({ page }) => {
    const app = new GameApp(page);

    await app.sandbox.open({ scenario: "basic-scrimmage", seed: 1 });

    const snapshot = await app.bridge.snapshot();
    expect(fixtureValue(fixtureValue(snapshot.teams[0]).players[0]).position).toEqual({ x: 9, y: 5 });
    expect(snapshot.ballPosition).toEqual({ x: 5, y: 5 });

    await expectVisualCheckpoint(page, "pitch-default-scrimmage", page, {
      clip: await app.pitch.pitchViewportRect(),
    });
  });

  test("a scenario-case board, with its own committed seed", async ({
    page,
  }) => {
    const app = new GameApp(page);
    await app.sandbox.open({
      scenario: fixtureValue(scenarioCase).id,
      seed: fixtureValue(variant).seed,
      outcome: fixtureValue(variant).id,
    });

    const snapshot = await app.bridge.snapshot();
    expect(fixtureValue(fixtureValue(snapshot.teams[0]).players[0]).position).toEqual({ x: 5, y: 5 });

    await expectVisualCheckpoint(page, `case-${fixtureValue(scenarioCase).id}`, page, {
      clip: await app.pitch.pitchViewportRect(),
    });
  });

  test("the action menu overlay", async ({ page }) => {
    const app = new GameApp(page);
    await app.sandbox.open({ scenario: "basic-scrimmage", seed: 1 });
    await app.pitch.clickPlayer("team1:0");

    await expect(app.hud.actionMenu()).toBeVisible();
    const snapshot = await app.bridge.snapshot();
    await expect(app.hud.actionMenu()).toContainText(
      fixtureValue(fixtureValue(snapshot.teams[0]).players[0]).name
    );

    await expectVisualCheckpoint(page, "action-menu", app.hud.actionMenu());
  });

  test("the sandbox scenario-case panel", async ({ page }) => {
    const app = new GameApp(page);
    await app.sandbox.open();
    await app.sandbox.topicSelect().selectOption("e2e-cases");
    await page.getByTestId("case-select").selectOption(fixtureValue(scenarioCase).id);

    await expect(page.getByTestId("fixture-panel")).toBeVisible();

    await expectVisualCheckpoint(
      page,
      "sandbox-case-panel",
      page.getByTestId("scenario-case-panel")
    );
  });
});

test.describe("match style @visual", () => {
  test("style: bloodbowl", async ({ page }) => {
    const app = new GameApp(page);
    await page.goto("/sand-box?scenario=basic-scrimmage&seed=1");
    await app.pitch.waitForCanvas();

    await app.sandbox.waitForScenarioLoaded();
    const snapshot = await app.bridge.snapshot();
    expect(fixtureValue(fixtureValue(snapshot.teams[0]).players[0]).position).toEqual({ x: 9, y: 5 });

    await freezeAnimation(page);
    await expectVisualCheckpoint(page, "match-style-bloodbowl", page, {
      clip: await app.pitch.pitchViewportRect(),
    });
  });
});
