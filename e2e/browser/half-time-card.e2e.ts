import { test, expect } from "@playwright/test";
import { GameApp } from "../support/pages/game";

test("the half time card sums up the break when the first half ends", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const app = new GameApp(page);
  await app.sandbox.open({ scenario: "half-time-next" });
  const [humans, orcs] = await app.bridge.teams();
  await app.hud.endTurn().click();
  const card = page.getByTestId("half-time-card");
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(card).toContainText("Half time");
  await expect(card).toContainText(`${humans.name} 0 : 0 ${orcs.name}`);
  await expect(card).toContainText(/kick next/);
  await expect(page.getByTestId("half-time-rerolls")).toContainText(
    `${humans.name}:`
  );
  await expect(page.getByTestId("half-time-recovery")).toContainText(
    /#\d+: (Recovered|Still knocked out)/,
    { timeout: 15_000 }
  );
  await page.screenshot({
    path: `${process.env.SHOTS ?? test.info().outputDir}/half-time-card.png`,
  });
  const box = await card.boundingBox();
  expect(box && box.y + box.height).toBeLessThanOrEqual(720);
  await page.getByTestId("half-time-close").click();
  await expect(card).toHaveCount(0);
});
