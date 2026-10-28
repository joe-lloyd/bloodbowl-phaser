/**
 * Visual regression for the presentation contracts.
 *
 * Every case here asserts the *gameplay state* first and compares pixels
 * second. That is deliberate: if the semantic assertion fails, the diff is
 * noise; if it passes and the diff fails, the look genuinely changed.
 *
 * Baselines live in `e2e/__screenshots__/visual-regression/…` and are only
 * written by `pnpm e2e:update-snapshots`. A normal run never rewrites them.
 */

import { test, expect } from "@playwright/test";
import { GameApp } from "../support/pages/game";
import { expectVisualCheckpoint, freezeAnimation } from "../support/visual";
// Imports the `movement` section module directly, rather than the aggregate
// registry — this is the movement section's own case data, mirroring
// `__tests__/headless` per-section naming (see docs/E2E_TESTING.md).
import { MOVEMENT_CASES } from "../../src/testing/cases/movement";
import { PITCH_THEMES } from "../../src/game/presentation/pitchThemes";

const scenarioCase = MOVEMENT_CASES[0];
const variant = scenarioCase.variants[0];

test.describe("pitch presentation @visual", () => {
  test("the default pitch, dugouts and sidelines", async ({ page }) => {
    const app = new GameApp(page);
    // `basic-scrimmage` carries no committed seed, so the loader would pick a
    // random one — and anything the RNG touches (weather, and through it the
    // board presentation) would differ between the two screenshots Playwright
    // compares. A visual baseline must be of a deterministic board.
    await app.sandbox.open({ scenario: "basic-scrimmage", seed: 1 });

    // Semantic first: the board really is the one this baseline is of.
    const snapshot = await app.bridge.snapshot();
    expect(snapshot.teams[0].players[0].position).toEqual({ x: 9, y: 5 });
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
      scenario: scenarioCase.id,
      seed: variant.seed,
      outcome: variant.id,
    });

    const snapshot = await app.bridge.snapshot();
    expect(snapshot.teams[0].players[0].position).toEqual({ x: 5, y: 5 });

    await expectVisualCheckpoint(page, `case-${scenarioCase.id}`, page, {
      clip: await app.pitch.pitchViewportRect(),
    });
  });

  test("the action menu overlay", async ({ page }) => {
    const app = new GameApp(page);
    await app.sandbox.open({ scenario: "basic-scrimmage", seed: 1 });
    await app.pitch.clickPlayer("team1:0");

    // The menu is only a presentation contract once it is actually open for
    // the player we expect.
    await expect(app.hud.actionMenu()).toBeVisible();
    const snapshot = await app.bridge.snapshot();
    await expect(app.hud.actionMenu()).toContainText(
      snapshot.teams[0].players[0].name
    );

    await expectVisualCheckpoint(page, "action-menu", app.hud.actionMenu());
  });

  test("the sandbox scenario-case panel", async ({ page }) => {
    const app = new GameApp(page);
    await app.sandbox.open();
    await app.sandbox.topicSelect().selectOption("e2e-cases");
    await page.getByTestId("case-select").selectOption(scenarioCase.id);

    await expect(page.getByTestId("fixture-panel")).toBeVisible();

    await expectVisualCheckpoint(
      page,
      "sandbox-case-panel",
      page.getByTestId("scenario-case-panel")
    );
  });
});

test.describe("match styles @visual", () => {
  // One baseline per match style: each is a different stadium render and
  // sprite set, so each is its own presentation contract.
  for (const theme of PITCH_THEMES) {
    test(`style: ${theme.id}`, async ({ page }) => {
      const app = new GameApp(page);
      const url = `/sand-box?scenario=basic-scrimmage&seed=1&theme=${theme.id}`;
      await page.goto(url);
      await app.pitch.waitForCanvas();

      await app.sandbox.waitForScenarioLoaded();
      const snapshot = await app.bridge.snapshot();
      expect(snapshot.teams[0].players[0].position).toEqual({ x: 9, y: 5 });

      await freezeAnimation(page);
      await expectVisualCheckpoint(page, `match-style-${theme.id}`, page, {
        clip: await app.pitch.pitchViewportRect(),
      });
    });
  }
});
