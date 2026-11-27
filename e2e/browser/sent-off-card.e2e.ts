import { fixtureValue } from "../../src/testing/fixtureValue";
import { test, expect, type Page } from "@playwright/test";
import { GameApp } from "../support/pages/game";
import { GameEventNames } from "../../src/types/events";
import { PlayerStatus } from "../../src/types/Player";

test.use({ viewport: { width: 1280, height: 800 } });

async function foul(page: Page, app: GameApp, outcome: string) {
  await app.sandbox.open({ scenario: "bribe-for-sent-off-fouler", outcome });
  await app.hud.declareAction("team1:0", "foul");
  await app.pitch.clickPlayer("team2:0");
  await expect(page.getByTestId("action-plan")).toBeVisible();
  await page.keyboard.press("Enter");
}

test("a Bribe that works keeps the fouler on the pitch", async ({ page }) => {
  const app = new GameApp(page);
  await foul(page, app, "bribe-works");

  const card = page.getByTestId("sent-off-card");
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card).toContainText("The referee spotted");
  const argue = card.getByTestId("sent-off-argue");
  await expect(argue).toContainText("Argue the Call 5+");
  await expect(argue).toContainText("The referee ignores the argument.");
  const argueEvents = await app.bridge.events();
  const argued = argueEvents.find(
    (e) =>
      e.name === GameEventNames.DiceRoll &&
      (e.data as { rollType: string }).rollType === "Argue the Call"
  );
  await expect(argue).toContainText(
    String((argued?.data as { total: number }).total)
  );

  const bribe = card.getByTestId("sent-off-bribe");
  await expect(bribe).toContainText("Bribe 2+");
  await expect(bribe).toContainText("1 Bribe left");
  await expect(page.getByText("RR 0 · Bribe 1")).toBeVisible();
  await expect(page.getByTestId("reaction-dialog")).toHaveCount(0);
  await expect(card).not.toContainText("%");
  await page.screenshot({ path: test.info().outputPath("bribe-offer.png") });
  await card.getByTestId("bribe-yes").click();

  await expect(bribe).toContainText("Bribe accepted", { timeout: 15_000 });
  await expect(card.getByTestId("sent-off-outcome")).toHaveText(
    /stays on the pitch/i
  );

  await expect(page.getByText("Bribe 1")).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("bribe-works.png") });
  await card.getByTestId("sent-off-continue").click();
  await expect(card).toHaveCount(0);

  const snapshot = await app.bridge.snapshot();
  expect(fixtureValue(fixtureValue(snapshot.teams[0]).players[0]).status).toBe(PlayerStatus.ACTIVE);
  const endEvents = await app.bridge.events();
  expect(endEvents.some((e) => e.name === GameEventNames.Turnover)).toBe(false);
});

test("a pocketed Bribe still Sends-off the fouler, then the card closes by itself", async ({
  page,
}) => {
  const app = new GameApp(page);
  await foul(page, app, "bribe-pocketed");

  const card = page.getByTestId("sent-off-card");
  await card.getByTestId("bribe-yes").click({ timeout: 20_000 });
  await expect(card.getByTestId("sent-off-bribe")).toContainText(
    "The referee pockets the Bribe.",
    { timeout: 15_000 }
  );
  await expect(card.getByTestId("sent-off-outcome")).toHaveText(/is Sent-off/i);
  await page.screenshot({ path: test.info().outputPath("bribe-pocketed.png") });

  await expect(card).toHaveCount(0, { timeout: 10_000 });
  await app.bridge.expectEvent(GameEventNames.Turnover);
});
