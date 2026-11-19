import { test, expect } from "@playwright/test";
import { GameApp } from "../support/pages/game";
import { GameEventNames } from "../../src/types/events";

declare global {
  interface Window {
    __handover: { turnStartedAt: number; bannerAt: number };

    __tray: string[];
  }
}

test("on a later drive the tray lands the kick-off and the turn banner follows the hand-over", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  const app = new GameApp(page);

  await app.sandbox.open({ scenario: "half-time-next" });
  await app.hud.endTurn().click();
  await expect(page.getByTestId("half-time-card")).toBeVisible({
    timeout: 15_000,
  });
  await page.getByTestId("half-time-close").click();

  for (let team = 0; team < 2; team++) {
    const load = page.getByRole("button", { name: /LOAD/ });
    await expect(load).toBeVisible({ timeout: 15_000 });
    await load.click();
    await expect(page.getByTestId("setup-checklist")).toContainText(
      "Players placed 7/7"
    );
    await page.getByRole("button", { name: /CONFIRM SETUP/ }).click();
    await page.waitForTimeout(800);
  }
  await expect
    .poll(async () => (await app.bridge.phase()).phase, { timeout: 15_000 })
    .toBe("KICKOFF");

  await page.evaluate((turnStarted) => {
    window.__handover = { turnStartedAt: 0, bannerAt: 0 };
    window.__tray = [];
    window.eventBus.on(turnStarted as never, () => {
      window.__handover.turnStartedAt ||= performance.now();
    });
    new MutationObserver(() => {
      const banner = document.querySelector('[data-testid="announcement"]');
      if (
        window.__handover.turnStartedAt &&
        !window.__handover.bannerAt &&
        /'s? Turn/i.test(banner?.textContent ?? "")
      )
        window.__handover.bannerAt = performance.now();
      const tray = document.querySelector('[data-testid="dice-tray"]');
      const team = tray?.querySelector('[data-testid="dice-tray-team"]');
      const line = `${team?.textContent ?? ""} | ${tray?.textContent?.slice(team?.textContent?.length ?? 0) ?? ""}`;
      if (window.__tray.at(-1) !== line) window.__tray.push(line);
    }).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }, GameEventNames.TurnStarted);

  await app.pitch.waitForCameraToSettle();
  await app.pitch.clickPlayer("team1:0");
  await app.pitch.clickSquare({ x: 15, y: 5 });

  const landed = (pattern: RegExp) =>
    expect
      .poll(
        async () =>
          (await page.evaluate(() => window.__tray)).find((line) =>
            pattern.test(line)
          ),
        { timeout: 15_000 }
      )
      .toBeTruthy();
  const [humans] = await app.bridge.teams();
  await landed(
    new RegExp(`^${humans.name} \\| Kickoff Deviate Distance: \\d, \\d`)
  );
  await page.screenshot({
    path: `${process.env["SHOTS"] ?? test.info().outputDir}/later-drive-kickoff-tray.png`,
  });

  await app.rollKickoff();

  await page.waitForFunction(() => window.__handover?.bannerAt > 0, null, {
    timeout: 30_000,
  });
  const { turnStartedAt, bannerAt } = await page.evaluate(
    () => window.__handover
  );

  expect(bannerAt - turnStartedAt).toBeLessThan(3000);
});
