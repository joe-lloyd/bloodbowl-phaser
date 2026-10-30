/**
 * A kick-off on a later drive. The half ends with a knocked-out player's
 * recovery die still tumbling when setup starts. In round 1 of the online
 * test loop that cut-short die froze the dice tray for the rest of the
 * match, and every banner after it waited the full dice timeout.
 *
 * SHOTS=<dir> saves the kick-off with the tray working.
 */
import { test, expect } from "@playwright/test";
import { GameApp } from "../support/pages/game";
import { GameEventNames } from "../../src/types/events";
import type { IEventBus } from "../../src/services/EventBus";

declare global {
  interface Window {
    eventBus: IEventBus;
    __handover: { turnStartedAt: number; bannerAt: number };
    /** Every team name and line the tray showed, in order. */
    __tray: string[];
  }
}

test("on a later drive the tray lands the kick-off and the turn banner follows the hand-over", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  const app = new GameApp(page);

  // End the first half: a knocked-out Human rolls to recover as setup starts
  await app.sandbox.open({ scenario: "half-time-next" });
  await app.hud.endTurn().click();
  await expect(page.getByTestId("half-time-card")).toBeVisible({
    timeout: 15_000,
  });
  await page.getByTestId("half-time-close").click();

  // Both teams set up the second half's drive from a preset
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

  // Time the hand-over to the receiving team against its turn banner
  // and keep every line the tray shows: under load a roll can come and go
  // between two polls
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

  // The Humans kick deep into the Orc half
  await app.pitch.waitForCameraToSettle();
  await app.pitch.clickPlayer("team1:0");
  await app.pitch.clickSquare({ x: 15, y: 5 });

  // The kicking team's dice land and show their results one after another
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
    path: `${process.env.SHOTS ?? test.info().outputDir}/later-drive-kickoff-tray.png`,
  });
  await landed(
    new RegExp(`^${humans.name} \\| Kickoff Event: \\d \\+ \\d = \\d+`)
  );

  await page.waitForFunction(() => window.__handover?.bannerAt > 0, null, {
    timeout: 30_000,
  });
  const { turnStartedAt, bannerAt } = await page.evaluate(
    () => window.__handover
  );
  // The kick-off result banner may still be up at the hand-over; the turn
  // banner follows it, never the dice timeout
  expect(bannerAt - turnStartedAt).toBeLessThan(3000);
});
