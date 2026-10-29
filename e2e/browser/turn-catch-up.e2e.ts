import { test, expect } from "@playwright/test";
import { GameApp } from "../support/pages/game";
import { GameEventNames } from "../../src/types/events";

test("a coach sees their injured player after the opponent's block", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const app = new GameApp(page);
  await app.sandbox.open({ scenario: "block-injury-casualty", seed: 102 });
  const teams = await app.bridge.teams();
  const victim = teams[0].players[3];
  await app.hud.declareAction("team2:0", "block");
  await app.pitch.clickPlayer("team1:3");
  await app.hud.rollBlockDice();
  await app.hud.chooseBlockResult("pow");
  // Fend prevents a follow-up. The only active blocker ends its team turn.
  await app.pitch.clickSquare({ x: 9, y: 7 });
  await app.bridge.expectEvent(GameEventNames.PlayerCasualtyInflicted);
  await expect
    .poll(async () => (await app.bridge.phase()).activeTeamId)
    .toBe(teams[0].id);
  const card = page.getByTestId("turn-catch-up");
  await expect(card).toContainText("Since your last turn");
  await expect(card).toContainText(victim.name);
  await expect(card).toContainText("Seriously hurt");
  await page.screenshot({ path: testInfo.outputPath("catch-up-1280x720.png") });
  const bounds = await card.boundingBox();
  expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeLessThan(210);
  expect(bounds?.x).toBeGreaterThanOrEqual(0);
  expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeLessThanOrEqual(720);
});
