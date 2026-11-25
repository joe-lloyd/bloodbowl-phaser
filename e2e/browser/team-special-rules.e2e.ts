import { fixtureValue } from "../../src/testing/fixtureValue";
import { test, expect, type Page } from "@playwright/test";
import { GameApp } from "../support/pages/game";
import { GameEventNames } from "../../src/types/events";

test.use({ viewport: { width: 1280, height: 800 } });

async function diceLogText(page: Page): Promise<string> {
  const log = page.getByTestId("dice-log");
  if (!(await log.isVisible()))
    await page.getByTestId("dice-log-toggle").click();
  await expect(log).toBeVisible();
  return (await log.innerText()).toLowerCase();
}

async function logEntry(page: Page, rollType: string): Promise<void> {
  await page
    .getByTestId("dice-log")
    .getByText(rollType)
    .first()
    .scrollIntoViewIfNeeded();
}

test("the Team Captain's 6 keeps the Team Re-roll", async ({ page }) => {
  const app = new GameApp(page);
  await app.sandbox.open({
    scenario: "team-captain-free-reroll",
    outcome: "captain-rolls-six",
  });
  await app.hud.declareAction("team1:0", "move");
  await app.pitch.clickSquare({ x: 5, y: 5 });
  await expect(page.getByTestId("action-plan")).toContainText("Pick up");
  await app.pitch.clickSquare({ x: 5, y: 5 });
  await expect(app.hud.rerollDialog()).toBeVisible({ timeout: 10_000 });
  await page.screenshot({
    path: test.info().outputPath("captain-reroll-offer.png"),
  });
  await app.hud.answerReroll(true, "team");
  await app.bridge.expectEvent(GameEventNames.RerollUsed);

  await expect
    .poll(async () => fixtureValue((await app.bridge.snapshot()).teams[0]).rerolls)
    .toBe(1);
  await expect.poll(() => diceLogText(page)).toContain("team captain");
  await logEntry(page, "Team Captain");
  await page.screenshot({ path: test.info().outputPath("team-captain.png") });
});

test("Bribery and Corruption re-rolls a 1 to Argue the Call", async ({
  page,
}) => {
  const app = new GameApp(page);
  await app.sandbox.open({ scenario: "bribery-and-corruption-argue-reroll" });
  await app.hud.declareAction("team1:1", "foul");
  await app.pitch.clickPlayer("team2:0");
  await expect(page.getByTestId("action-plan")).toBeVisible();
  await page.keyboard.press("Enter");

  await expect
    .poll(async () => (await app.bridge.snapshot()).briberyRerollsUsed, {
      timeout: 20_000,
    })
    .toEqual([await app.bridge.resolveRef("team1")]);
  await expect
    .poll(() => diceLogText(page))
    .toContain("argue the call (re-roll)");
  await logEntry(page, "Argue the Call (re-roll)");
  await page.screenshot({ path: test.info().outputPath("bribery.png") });
});

test("the team builder picks a League, an alignment and a Captain", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/build-team/new-team");
  const roster = page.getByRole("combobox", { name: "Roster", exact: true });
  const league = page.getByTestId("team-league");
  const rules = page.getByTestId("team-special-rules");

  await page.getByTestId("roster-choice-Norse").click();
  await expect(roster).toHaveValue("Norse");
  await expect(league).toHaveValue("Chaos Clash");
  await expect(rules).toHaveText("Favoured of Khorne");
  await league.selectOption("Old World Classic");
  await expect(rules).toHaveText("None");

  await roster.selectOption("Chaos Renegade");
  const favouredOf = page.getByTestId("team-favoured-of");
  await expect(favouredOf.locator("option")).toHaveText([
    "Khorne",
    "Nurgle",
    "Slaanesh",
    "Tzeentch",
    "Undivided",
  ]);
  await favouredOf.selectOption({ label: "Nurgle" });
  await expect(rules).toHaveText("Favoured of Nurgle");
  await page.screenshot({
    path: test.info().outputPath("favoured-of.png"),
  });

  await roster.selectOption("Human");
  await expect(rules).toHaveText("Team Captain");
  const hires = page
    .locator(".hud-slab")
    .filter({ has: page.getByRole("heading", { name: "AVAILABLE HIRES" }) });
  await hires
    .getByRole("row")
    .filter({ hasText: "Human Blitzer" })
    .getByRole("button", { name: "HIRE" })
    .click();
  await hires
    .getByRole("row")
    .filter({ hasText: "Ogre" })
    .getByRole("button", { name: "HIRE" })
    .click();

  await expect(page.getByTestId("choose-team-captain")).toHaveCount(1);
  await page.getByTestId("choose-team-captain").click();
  const badge = page.getByTestId("team-captain-badge");
  await expect(badge).toHaveText("Captain");
  await badge.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: test.info().outputPath("team-captain-builder.png"),
  });
});
