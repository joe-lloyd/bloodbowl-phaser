import { test, expect, type Page } from "@playwright/test";
import { GameEventNames } from "../../src/types/events";
import { GameApp } from "../support/pages/game";

const WRANGLER = "team1:1";

const PASSES = 1;
const FAILS = 7;

async function openWrangler(page: Page, scenario: string, seed = PASSES) {
  const app = new GameApp(page);
  await app.sandbox.open({ scenario, seed });
  const rolls = async () => {
    const events = await app.bridge.events();
    return events.filter((event) => event.name === GameEventNames.DiceRoll).length;
  };
  const activePlayer = async () => {
    const snapshot = await app.bridge.snapshot();
    return snapshot.activePlayer;
  };
  return { app, rolls, activePlayer, ask: app.hud.squigRageConfirm() };
}

test("asks before a squig activates, rolls Squig Rage, then shows the actions", async ({
  page,
}) => {
  const { app, rolls, activePlayer, ask } = await openWrangler(
    page,
    "squig-rage-activation",
    PASSES
  );
  await app.pitch.clickPlayer(WRANGLER);
  await expect(ask).toBeVisible();
  await expect(ask).toContainText("Squig Rage: 3+");
  await expect(app.hud.actionMenu()).toBeHidden();
  expect(await rolls()).toBe(0);
  await page.screenshot({ path: test.info().outputPath("squig-rage-ask.png") });

  await ask.getByRole("button", { name: "Activate", exact: true }).click();
  await expect.poll(rolls).toBe(1);
  await expect(app.hud.actionMenu()).toBeVisible();
  await expect(app.hud.actionButton("ballAndChain")).toBeVisible();
  expect(await activePlayer()).toMatchObject({ action: null, squigRageSettled: true });
  await page.screenshot({ path: test.info().outputPath("squig-rage-actions.png") });

  await app.hud.actionButton("ballAndChain").click();
  await expect.poll(activePlayer).toMatchObject({ action: "ballAndChain" });
  expect(await rolls()).toBe(1);
});

test("a failed roll leaves the squig Distracted and never opens the actions", async ({
  page,
}) => {
  const { app, rolls, activePlayer, ask } = await openWrangler(
    page,
    "squig-rage-activation",
    FAILS
  );
  await app.pitch.clickPlayer(WRANGLER);
  await ask.getByRole("button", { name: "Activate", exact: true }).click();
  await expect.poll(rolls).toBe(1);
  await expect.poll(activePlayer).toBeNull();
  await expect(app.hud.actionMenu()).toBeHidden();
  await page.screenshot({ path: test.info().outputPath("squig-rage-distracted.png") });
});

test("Not now leaves the squig unactivated with no roll", async ({ page }) => {
  const { app, rolls, activePlayer, ask } = await openWrangler(
    page,
    "squig-rage-activation",
    PASSES
  );
  await app.pitch.clickPlayer(WRANGLER);
  await ask.getByRole("button", { name: "Not now", exact: true }).click();
  await expect(ask).toBeHidden();
  await expect(app.hud.actionMenu()).toBeHidden();
  expect(await rolls()).toBe(0);
  expect(await activePlayer()).toBeNull();
});

test("a squig with a Herder in range opens the actions with no question", async ({
  page,
}) => {
  const { app, rolls, ask } = await openWrangler(page, "squig-restraint-range");
  await app.pitch.clickPlayer(WRANGLER);
  await expect(app.hud.actionMenu()).toBeVisible();
  await expect(ask).toBeHidden();
  expect(await rolls()).toBe(0);
});
