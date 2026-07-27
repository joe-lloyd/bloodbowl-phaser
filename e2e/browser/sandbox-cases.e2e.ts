/**
 * The sandbox as a reproduction tool.
 *
 * A CI failure quotes a case id, a variant and a seed. These cases prove the
 * other end of that reference works: the case is findable, selectable and
 * replayable; the board it loads is the one the automated run used; the
 * fixture panel explains where the players came from; the checkpoints the
 * suite asserts can be evaluated live; and the reproduction reference is
 * copyable and contains no runtime ids.
 */

import { test, expect } from "@playwright/test";
import { MOVEMENT_CASES } from "../../src/testing/cases";
import { GameApp } from "../support/pages/game";

const scenarioCase = MOVEMENT_CASES[0];
const variant = scenarioCase.variants[0];

async function openCaseExplorer(app: GameApp) {
  await app.sandbox.open();
  await app.sandbox.topicSelect().selectOption("e2e-cases");
}

test.describe("sandbox scenario-case explorer", () => {
  test("lists interactive cases and loads the one you pick", async ({ page }) => {
    const app = new GameApp(page);
    await openCaseExplorer(app);

    await expect(page.getByTestId("scenario-case-panel")).toBeVisible();
    await page.getByTestId("case-select").selectOption(scenarioCase.id);
    await app.sandbox.waitForScenarioLoaded();

    // The board is the case's board, not a default sandbox one.
    const snapshot = await app.bridge.snapshot();
    for (const placement of scenarioCase.setup.team1Placements) {
      expect(
        snapshot.teams[0].players[placement.playerIndex].position
      ).toEqual({ x: placement.x, y: placement.y });
    }
    // …loaded on the variant's committed seed.
    expect(await app.sandbox.loadedSeed()).toBe(variant.seed);
  });

  test("offers every named variant and replays each independently", async ({
    page,
  }) => {
    const app = new GameApp(page);
    await openCaseExplorer(app);
    await page.getByTestId("case-select").selectOption(scenarioCase.id);
    await app.sandbox.waitForScenarioLoaded();

    const options = await page
      .getByTestId("variant-select")
      .locator("option")
      .allTextContents();
    for (const candidate of scenarioCase.variants) {
      expect(options.join(" ")).toContain(candidate.name);
      // Selecting a variant reloads on that variant's own seed — no manual
      // seed entry anywhere.
      await page.getByTestId("variant-select").selectOption(candidate.id);
      await expect
        .poll(() => app.sandbox.loadedSeed())
        .toBe(candidate.seed);
    }

    await expect(page.getByTestId("variant-outcome")).toContainText(
      variant.expectedOutcome
    );
  });

  test("filters by id, capability, tag and regression id", async ({ page }) => {
    const app = new GameApp(page);
    await openCaseExplorer(app);

    const select = page.getByTestId("case-select");
    const filter = page.getByTestId("case-filter");
    const optionCount = async () => (await select.locator("option").count()) - 1;

    const unfiltered = await optionCount();
    expect(unfiltered).toBeGreaterThan(1);

    await filter.fill(scenarioCase.capability);
    await expect.poll(optionCount).toBeGreaterThan(0);
    expect(
      await select.locator("option").allTextContents()
    ).toContain(scenarioCase.id);

    await filter.fill("no-such-case-anywhere");
    await expect.poll(optionCount).toBe(0);

    // Clearing brings everything back.
    await filter.fill("");
    await expect.poll(optionCount).toBe(unfiltered);
  });

  test("shows where every player on the pitch comes from", async ({ page }) => {
    const app = new GameApp(page);
    await openCaseExplorer(app);
    await page.getByTestId("case-select").selectOption(scenarioCase.id);

    const fixture = page.getByTestId("fixture-panel");
    await expect(fixture).toBeVisible();
    // The rosters, and a stable reference per placement.
    await expect(fixture).toContainText("Human");
    for (const placement of scenarioCase.setup.team1Placements) {
      await expect(fixture).toContainText(`team1:${placement.playerIndex}`);
    }
    // Nothing granted, so the case is reported as roster-authentic.
    await expect(fixture).toContainText("roster-authentic");
  });

  test("evaluates the case's own checkpoints against the live board", async ({
    page,
  }) => {
    const app = new GameApp(page);
    await openCaseExplorer(app);
    await page.getByTestId("case-select").selectOption(scenarioCase.id);
    await app.sandbox.waitForScenarioLoaded();

    // Before the move, the "ends at (8,5)" checkpoint must be failing —
    // otherwise the panel would be reporting green regardless of the board.
    await page.getByTestId("check-checkpoints").click();
    const endsAt = page.getByTestId("checkpoint-team1:0-ends-at-8-5");
    await expect(endsAt).toBeVisible();
    await expect(endsAt).toHaveAttribute("data-passed", "false");

    // Play the case by hand, then re-check: now it passes.
    await app.hud.declareAction("team1:0", "move");
    await app.pitch.clickPath([
      { x: 6, y: 5 },
      { x: 7, y: 5 },
      { x: 8, y: 5 },
    ]);
    await app.pitch.clickSquare({ x: 8, y: 5 });
    await expect
      .poll(async () => (await app.bridge.snapshot()).teams[0].players[0].position)
      .toEqual({ x: 8, y: 5 });

    await page.getByTestId("check-checkpoints").click();
    await expect(endsAt).toHaveAttribute("data-passed", "true");
  });

  test("copies a reproduction reference with no runtime ids", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const app = new GameApp(page);
    await openCaseExplorer(app);
    await page.getByTestId("case-select").selectOption(scenarioCase.id);
    await app.sandbox.waitForScenarioLoaded();

    await page.getByTestId("copy-reference").click();
    const reference = await page.evaluate(() =>
      navigator.clipboard.readText()
    );

    expect(reference).toContain(`${scenarioCase.id}/${variant.id}`);
    expect(reference).toContain(`seed ${variant.seed}`);
    expect(reference).toContain("/sand-box?scenario=");
    // Runtime player ids must never appear: they change every run.
    const [team1] = await app.bridge.teams();
    for (const player of team1.players) {
      expect(reference).not.toContain(player.id);
    }
  });

  test("a shared reference reloads the exact board", async ({ page }) => {
    const app = new GameApp(page);
    // This is the URL the reference embeds — the whole point of the round trip.
    await app.sandbox.open({
      scenario: scenarioCase.id,
      seed: variant.seed,
      outcome: variant.id,
    });

    expect(await app.sandbox.loadedSeed()).toBe(variant.seed);
    const snapshot = await app.bridge.snapshot();
    expect(snapshot.teams[0].players[0].position).toEqual({ x: 5, y: 5 });
  });

  test("legacy scenario browsing still works", async ({ page }) => {
    const app = new GameApp(page);
    await app.sandbox.open();

    // The Core Rules list is untouched by the new case topic.
    await app.sandbox.loadCoreScenario("basic-scrimmage");
    await app.sandbox.waitForScenarioLoaded();
    const snapshot = await app.bridge.snapshot();
    expect(snapshot.teams[0].players[0].position).toEqual({ x: 9, y: 5 });
  });
});
