import { test, expect } from "@playwright/test";
import { GameApp } from "../support/pages/game";

test.use({ viewport: { width: 1280, height: 720 } });

test("a hovered player's card never covers the kicking line in a coach step", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const app = new GameApp(page);
  await app.sandbox.open({
    scenario: "kickoff-table-standard",
    seed: 2,
    outcome: "charge",
  });
  await app.pitch.waitForCameraToSettle();
  await app.pitch.clickPlayer("team1:0");
  await app.pitch.clickSquare({ x: 14, y: 5 });
  await app.rollKickoff();
  await expect(page.getByRole("button", { name: /charge!/i })).toBeVisible({
    timeout: 30_000,
  });
  await app.pitch.waitForCameraToSettle();
  await app.pitch.hoverSquare(await app.pitch.squareOf("team1:0"));
  const column = await page
    .locator('[data-hud-panels="reserved"]')
    .boundingBox();
  expect(column).not.toBeNull();
  for (let index = 0; index < 6; index++) {
    const at = await app.pitch.viewportPoint(
      await app.pitch.squareOf(`team1:${String(index)}`)
    );
    expect(at.x).toBeGreaterThan((column?.x ?? 0) + (column?.width ?? 0));
    expect(at.x).toBeLessThan(1280);
    expect(at.y).toBeLessThan(720);
  }
  await page.screenshot({
    path: test.info().outputPath("kickoff-step-framing.png"),
  });
});
