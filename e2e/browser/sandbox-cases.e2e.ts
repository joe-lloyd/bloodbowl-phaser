import { fixtureValue } from "../../src/testing/fixtureValue";
import { test, expect } from "@playwright/test";

import { MOVEMENT_CASES } from "../../src/testing/cases/movement";
import { GameApp } from "../support/pages/game";

const scenarioCase = MOVEMENT_CASES[0];
const variant = fixtureValue(scenarioCase).variants[0];

async function openCaseExplorer(app: GameApp) {
  await app.sandbox.open();
  await app.sandbox.topicSelect().selectOption("e2e-cases");
}

test.describe("sandbox scenario-case explorer", () => {
  test("lists interactive cases and loads the one you pick", async ({
    page,
  }) => {
    const app = new GameApp(page);
    await openCaseExplorer(app);

    await expect(page.getByTestId("scenario-case-panel")).toBeVisible();
    await page.getByTestId("case-select").selectOption(fixtureValue(scenarioCase).id);
    await app.sandbox.waitForScenarioLoaded();

    const snapshot = await app.bridge.snapshot();
    for (const placement of fixtureValue(scenarioCase).setup.team1Placements) {
      expect(fixtureValue(fixtureValue(snapshot.teams[0]).players[placement.playerIndex]).position).toEqual(
        { x: placement.x, y: placement.y }
      );
    }

    expect(await app.sandbox.loadedSeed()).toBe(fixtureValue(variant).seed);
  });

  test("offers every named variant and replays each independently", async ({
    page,
  }) => {
    const app = new GameApp(page);
    await openCaseExplorer(app);
    await page.getByTestId("case-select").selectOption(fixtureValue(scenarioCase).id);
    await app.sandbox.waitForScenarioLoaded();

    const options = await page
      .getByTestId("variant-select")
      .locator("option")
      .allTextContents();
    for (const candidate of fixtureValue(scenarioCase).variants) {
      expect(options.join(" ")).toContain(candidate.name);

      await page.getByTestId("variant-select").selectOption(candidate.id);
      await expect.poll(() => app.sandbox.loadedSeed()).toBe(candidate.seed);
    }

    await expect(page.getByTestId("variant-outcome")).toContainText(
      fixtureValue(variant).expectedOutcome
    );
  });

  test("filters by id, capability, tag and regression id", async ({ page }) => {
    const app = new GameApp(page);
    await openCaseExplorer(app);

    const select = page.getByTestId("case-select");
    const filter = page.getByTestId("case-filter");
    const optionCount = async () =>
      (await select.locator("option").count()) - 1;

    const unfiltered = await optionCount();
    expect(unfiltered).toBeGreaterThan(1);

    await filter.fill(fixtureValue(scenarioCase).capability);
    await expect.poll(optionCount).toBeGreaterThan(0);
    expect(await select.locator("option").allTextContents()).toContain(
      fixtureValue(scenarioCase).id
    );

    await filter.fill("no-such-case-anywhere");
    await expect.poll(optionCount).toBe(0);

    await filter.fill("");
    await expect.poll(optionCount).toBe(unfiltered);
  });

  test("shows where every player on the pitch comes from", async ({ page }) => {
    const app = new GameApp(page);
    await openCaseExplorer(app);
    await page.getByTestId("case-select").selectOption(fixtureValue(scenarioCase).id);

    const fixture = page.getByTestId("fixture-panel");
    await expect(fixture).toBeVisible();

    await expect(fixture).toContainText("Human");
    for (const placement of fixtureValue(scenarioCase).setup.team1Placements) {
      await expect(fixture).toContainText(
        `team1:${String(placement.playerIndex)}`
      );
    }

    await expect(fixture).toContainText("roster-authentic");
  });

  test("evaluates the case's own checkpoints against the live board", async ({
    page,
  }) => {
    const app = new GameApp(page);
    await openCaseExplorer(app);
    await page.getByTestId("case-select").selectOption(fixtureValue(scenarioCase).id);
    await app.sandbox.waitForScenarioLoaded();

    await page.getByTestId("check-checkpoints").click();
    const endsAt = page.getByTestId("checkpoint-team1:0-ends-at-8-5");
    await expect(endsAt).toBeVisible();
    await expect(endsAt).toHaveAttribute("data-passed", "false");

    await app.hud.declareAction("team1:0", "move");
    await app.pitch.clickPath([
      { x: 6, y: 5 },
      { x: 7, y: 5 },
      { x: 8, y: 5 },
    ]);
    await app.pitch.clickSquare({ x: 8, y: 5 });
    await expect
      .poll(async () => {
        const snapshot = await app.bridge.snapshot();
        return fixtureValue(fixtureValue(snapshot.teams[0]).players[0]).position;
      })
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
    await page.getByTestId("case-select").selectOption(fixtureValue(scenarioCase).id);
    await app.sandbox.waitForScenarioLoaded();

    await page.getByTestId("copy-reference").click();
    const reference = await page.evaluate(() => navigator.clipboard.readText());

    expect(reference).toContain(`${fixtureValue(scenarioCase).id}/${fixtureValue(variant).id}`);
    expect(reference).toContain(`seed ${String(fixtureValue(variant).seed)}`);
    expect(reference).toContain("/sand-box?scenario=");

    const [team1] = await app.bridge.teams();
    for (const player of team1.players) {
      expect(reference).not.toContain(player.id);
    }
  });

  test("a shared reference reloads the exact board", async ({ page }) => {
    const app = new GameApp(page);

    await app.sandbox.open({
      scenario: fixtureValue(scenarioCase).id,
      seed: fixtureValue(variant).seed,
      outcome: fixtureValue(variant).id,
    });

    expect(await app.sandbox.loadedSeed()).toBe(fixtureValue(variant).seed);
    const snapshot = await app.bridge.snapshot();
    expect(fixtureValue(fixtureValue(snapshot.teams[0]).players[0]).position).toEqual({ x: 5, y: 5 });
  });

  test("legacy scenario browsing still works", async ({ page }) => {
    const app = new GameApp(page);
    await app.sandbox.open();

    await app.sandbox.loadCoreScenario("basic-scrimmage");
    await app.sandbox.waitForScenarioLoaded();
    const snapshot = await app.bridge.snapshot();
    expect(fixtureValue(fixtureValue(snapshot.teams[0]).players[0]).position).toEqual({ x: 9, y: 5 });
  });
});
