/**
 * Armour and Injury Rolls get a banner that follows the dice: it names the
 * roll while the dice tumble, says what it decided when they land, and adds
 * no time. Seed 1 of the block-injury scene: a Skull, the Orc falls, its
 * armour breaks, and the injury roll decides the result before the
 * turnover hands over.
 *
 * ROLL_BANNER_SHOTS=<dir> saves each stage.
 */
import { test, expect } from "@playwright/test";
import { GameApp } from "../support/pages/game";
import { GameEventNames } from "../../src/types/events";
import type { IEventBus } from "../../src/services/EventBus";

declare global {
  interface Window {
    eventBus: IEventBus;
    __banner: { seen: string[]; armourAt: number; bannerAt: number };
  }
}

const SHOTS = process.env.ROLL_BANNER_SHOTS;

test("the armour and injury rolls each get a banner, then the result", async ({
  page,
}) => {
  const app = new GameApp(page);
  const shot = async (name: string) => {
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
  };
  await app.sandbox.open({ scenario: "block-injury-test", seed: 1 });
  // Every banner line in order, and the armour-to-next-turn time
  await page.evaluate(
    (names) => {
      const log: Window["__banner"] = { seen: [], armourAt: 0, bannerAt: 0 };
      window.__banner = log;
      window.eventBus.on(names.roll, (roll: { rollType: string }) => {
        if (roll.rollType.startsWith("Armour") && !log.armourAt)
          log.armourAt = performance.now();
      });
      window.eventBus.on(names.moment, (moment: { kind: string } | null) => {
        if (moment?.kind === "turn-started" && !log.bannerAt)
          log.bannerAt = performance.now();
      });
      new MutationObserver(() => {
        const banner = document.querySelector('[data-testid="roll-banner"]');
        const text = banner?.textContent ?? "";
        if (text && log.seen.at(-1) !== text) log.seen.push(text);
      }).observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    },
    {
      roll: GameEventNames.DiceRoll,
      moment: GameEventNames.UI_PresentMoment,
    }
  );
  await app.pitch.waitForCameraToSettle();
  await app.hud.declareAction("team2:0", "block");
  await app.pitch.clickPlayer("team1:3");
  await app.hud.rollBlockDice();
  await app.hud.chooseBlockResult("skull");

  const banner = page.getByTestId("roll-banner");
  await expect(banner).toContainText("Armour Roll", { timeout: 15_000 });
  await shot("1-armour-roll");
  await expect(banner).toContainText("Armour Broken", { timeout: 15_000 });
  await shot("2-armour-broken");
  await expect(banner).toContainText("Injury Roll", { timeout: 15_000 });
  await shot("3-injury-roll");
  await expect(banner).toHaveAttribute("data-result", "", { timeout: 15_000 });
  await shot("4-result");

  await page.waitForFunction(() => window.__banner.bannerAt > 0, null, {
    timeout: 30_000,
  });
  const log = await page.evaluate(() => window.__banner);
  console.log(log.seen.join("\n"));
  console.log(
    `armour dice to turn banner: ${Math.round(log.bannerAt - log.armourAt)} ms`
  );
  // In order: the armour roll, its result, the injury roll, its result
  const at = (pattern: RegExp) => log.seen.findIndex((s) => pattern.test(s));
  expect(at(/^Armour Roll/)).toBe(0);
  expect(at(/^Armour Broken/)).toBeGreaterThan(at(/^Armour Roll/));
  expect(at(/^Injury Roll/)).toBeGreaterThan(at(/^Armour Broken/));
  expect(at(/^(Stunned|Knocked Out|Casualty)/)).toBeGreaterThan(
    at(/^Injury Roll/)
  );
  // The same budget armour-injury-throws holds the tray to
  expect(log.bannerAt - log.armourAt).toBeLessThan(7_000);
});
