import { mkdir } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { GameApp } from "../support/pages/game";

test.use({ viewport: { width: 1280, height: 720 } });

test("the re-roll dialog waits for the failed die to land", async ({
  page,
}) => {
  const app = new GameApp(page);
  await app.sandbox.open({ scenario: "pro-die-reroll", seed: 8 });
  await app.hud.declareAction("team1:0", "move");
  await app.pitch.clickSquare({ x: 9, y: 4 });
  await expect(page.getByTestId("action-plan")).toContainText("Pro on 3+");

  const tray = page.getByTestId("dice-tray");
  const dir = "/tmp/review-loop-round2";
  await mkdir(dir, { recursive: true });
  await page.getByTestId("action-plan-go").click();

  await expect(tray).toHaveAttribute("data-dice", "in-air");
  await expect(app.hud.rerollDialog()).toBeHidden();
  await page.screenshot({ path: `${dir}/reroll-die-in-air.png` });

  await expect(app.hud.rerollDialog()).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: `${dir}/reroll-die-landed.png` });
  await expect(tray).not.toHaveAttribute("data-dice", "in-air");
  await expect(page.getByTestId("reroll-odds")).toHaveText(
    "Needed 3+, rolled 1."
  );
});
