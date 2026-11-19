import { fixtureValue } from "../../src/testing/fixtureValue";
import { test, expect } from "@playwright/test";
import { GameApp } from "../support/pages/game";
import { GameEventNames } from "../../src/types/events";
import type { IEventBus } from "../../src/services/EventBus";

interface Beat {
  at: number;
  what: string;
}

declare global {
  interface Window {
    eventBus: IEventBus;
    __throws: {
      beats: Beat[];
      throws: string[];
      armourAt: number;
      bannerAt: number;
    };
  }
}

const SHOTS = process.env["ARMOUR_SHOTS"];

test("armour and injury land as two throws before the turnover hands over", async ({
  page,
}) => {
  const app = new GameApp(page);
  await app.sandbox.open({ scenario: "block-injury-test", seed: 1 });
  await page.evaluate(
    (names) => {
      const log: Window["__throws"] = {
        beats: [],
        throws: [],
        armourAt: 0,
        bannerAt: 0,
      };
      window.__throws = log;
      const note = (what: string) =>
        log.beats.push({ at: Math.round(performance.now()), what });
      window.eventBus.on(
        names.roll,
        (roll: { rollType: string; description: string }) => {
          note(`roll ${roll.rollType}: ${roll.description}`);
          if (roll.rollType.startsWith("Armour") && !log.armourAt)
            log.armourAt = performance.now();
        }
      );
      window.eventBus.on(
        names.tray,
        (tray: { thrown: number; landedThrough: number }) =>
          note(
            `tray thrown ${String(tray.thrown)} landed ${String(tray.landedThrough)}`
          )
      );
      window.eventBus.on(names.moment, (moment: { kind: string } | null) => {
        note(`moment ${moment?.kind ?? "none"}`);
        if (moment?.kind === "turn-started" && !log.bannerAt)
          log.bannerAt = performance.now();
      });

      const tray = document.querySelector('[data-testid="dice-tray"]');
      let last = "";
      new MutationObserver(() => {
        const state = tray?.getAttribute("data-dice") ?? "";
        const text = tray?.textContent ?? "";
        const key = `${state} ${text}`;
        if (key === last) return;
        last = key;
        note(`tray ${key}`);
        if (state === "in-air") log.throws.push(text);
      }).observe(fixtureValue(tray), {
        attributes: true,
        subtree: true,
        childList: true,
        characterData: true,
      });
    },
    {
      roll: GameEventNames.DiceRoll,
      tray: GameEventNames.UI_DiceInAir,
      moment: GameEventNames.UI_PresentMoment,
    }
  );
  await app.pitch.waitForCameraToSettle();
  await app.hud.declareAction("team2:0", "block");
  await app.pitch.clickPlayer("team1:3");
  await app.hud.rollBlockDice();
  await app.hud.chooseBlockResult("skull");

  if (SHOTS) {
    await page.waitForFunction(() =>
      window.__throws.throws.some((t) => t.includes("Armour"))
    );
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="dice-tray"]')
          ?.getAttribute("data-dice") === "landed" &&
        (
          document.querySelector('[data-testid="dice-tray"]')?.textContent ?? ""
        ).includes("Armour")
    );
    await page.screenshot({ path: `${SHOTS}-1-armour.png` });
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="dice-tray"]')
          ?.getAttribute("data-dice") === "landed" &&
        (
          document.querySelector('[data-testid="dice-tray"]')?.textContent ?? ""
        ).includes("Injury")
    );
    await page.screenshot({ path: `${SHOTS}-2-injury.png` });
  }

  await page.waitForFunction(() => window.__throws.bannerAt > 0, null, {
    timeout: 30_000,
  });
  const log = await page.evaluate(() => window.__throws);
  const start = log.beats[0]?.at ?? 0;
  console.log(
    log.beats.map((b) => `${String(b.at - start)} ${b.what}`).join("\n")
  );
  console.log(
    `armour dice to turn banner: ${String(Math.round(log.bannerAt - log.armourAt))} ms`
  );
  expect(log.beats.some((b) => b.what.startsWith("roll Injury"))).toBe(true);

  expect(
    log.throws.filter((t) => t.includes("Armour") && t.includes("Injury"))
  ).toEqual([]);

  const armourThrow = log.throws.findIndex((t) => t.includes("Armour"));
  const injuryThrow = log.throws.findIndex((t) => t.includes("Injury"));
  expect(armourThrow).toBeGreaterThanOrEqual(0);
  expect(injuryThrow).toBeGreaterThan(armourThrow);
  expect(log.bannerAt - log.armourAt).toBeLessThan(7_000);
});
