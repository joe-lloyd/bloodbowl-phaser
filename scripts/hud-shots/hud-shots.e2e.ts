import { test, expect, type Page } from "@playwright/test";
import { GameApp } from "../../e2e/support/pages/game";

const DIR = process.env["SHOTS"] ?? "gallery/public/shots/after";

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `${DIR}/${name}.png` });

test("coin toss and setup", async ({ page }) => {
  const app = new GameApp(page);
  await app.sandbox.open({ scenario: "setup-coinflip" });
  const flip = page.getByRole("button", { name: "FLIP COIN" });
  await flip.waitFor({ timeout: 20_000 });
  await page.waitForTimeout(400);
  await shot(page, "coin-toss");
  await flip.click();
  const kick = page.getByRole("button", { name: "KICK" });
  await kick.waitFor({ timeout: 10_000 });
  await shot(page, "coin-toss-result");
  await kick.click();
  await expect(page.getByPlaceholder("Formation name…")).toBeVisible({
    timeout: 15_000,
  });
  await app.pitch.waitForCameraToSettle();
  await page.waitForTimeout(600);
  await shot(page, "setup");
  await page.getByRole("button", { name: /Match Options/ }).click();
  await page.waitForTimeout(300);
  await shot(page, "match-options");
});

test("a planned dodge, then the dice tray", async ({ page }) => {
  const app = new GameApp(page);
  await app.sandbox.open({ scenario: "score-run-dodge-rush", seed: 2 });
  await app.pitch.waitForCameraToSettle();

  await page.evaluate(() => {
    document.getElementById("react-root")!.style.visibility = "hidden";
  });
  await page.waitForTimeout(300);
  await shot(page, "pitch");
  await page.evaluate(() => {
    document.getElementById("react-root")!.style.visibility = "";
  });
  await app.pitch.clickPlayer("team1:0");
  await app.hud.actionButton("move").click();
  await app.pitch.waitForCameraToSettle();
  await shot(page, "action-sequence");
  await app.pitch.clickSquare({ x: 19, y: 5 });
  await expect(page.getByTestId("action-plan")).toContainText("Dodge 3+");
  await page.waitForTimeout(300);
  await shot(page, "action-plan");
  await page.getByTestId("action-plan-go").click();
  await page.getByTestId("dice-tray").waitFor();
  await page.waitForTimeout(1600);
  await shot(page, "dice-tray");
});

test("a block with its dice up", async ({ page }) => {
  const app = new GameApp(page);
  await app.sandbox.open({ scenario: "block-injury-stun", seed: 10 });
  await app.pitch.waitForCameraToSettle();
  await app.pitch.clickPlayer("team2:0");
  await expect(app.hud.actionMenu()).toBeVisible();
  await page.waitForTimeout(300);
  await shot(page, "action-menu");
  await app.hud.actionButton("block").click();
  await app.pitch.clickPlayer("team1:3");
  await expect(app.hud.blockDiceDialog()).toBeVisible();
  await page.waitForTimeout(300);
  await shot(page, "block-dialog");
  await app.hud.rollBlockDice();
  await page.waitForTimeout(2200);
  await shot(page, "block-dice");
});
