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
    __turnoverPace: { beats: Beat[]; failedLandedAt: number; bannerAt: number };
  }
}

test("a failed Rush with an armour roll hands over without a long wait", async ({
  page,
}) => {
  const app = new GameApp(page);

  await app.sandbox.open({ scenario: "score-run-dodge-rush", seed: 1 });
  await page.evaluate(
    (names) => {
      const pace: Window["__turnoverPace"] = {
        beats: [],
        failedLandedAt: 0,
        bannerAt: 0,
      };
      window.__turnoverPace = pace;
      const note = (what: string) =>
        pace.beats.push({ at: Math.round(performance.now()), what });
      let thrown = 0;
      let rushSeq = 0;
      window.eventBus.on(
        names.roll,
        (roll: { rollType: string; description: string }) => {
          note(`roll ${roll.rollType}: ${roll.description}`);

          if (roll.rollType.startsWith("Rush")) rushSeq = thrown;
        }
      );
      window.eventBus.on(
        names.tray,
        (tray: { thrown: number; landedThrough: number }) => {
          thrown = tray.thrown;
          note(
            `tray thrown ${String(tray.thrown)} landed ${String(tray.landedThrough)}`
          );
          if (rushSeq && !pace.failedLandedAt && tray.landedThrough >= rushSeq)
            pace.failedLandedAt = performance.now();
        }
      );
      window.eventBus.on(names.moment, (moment: { kind: string } | null) => {
        note(`moment ${moment?.kind ?? "none"}`);
        if (moment?.kind === "turn-started" && !pace.bannerAt)
          pace.bannerAt = performance.now();
      });
    },
    {
      roll: GameEventNames.DiceRoll,
      tray: GameEventNames.UI_DiceInAir,
      moment: GameEventNames.UI_PresentMoment,
    }
  );
  await app.pitch.waitForCameraToSettle();
  await app.pitch.clickPlayer("team1:0");
  await app.hud.actionButton("move").click();
  await app.pitch.clickSquare({ x: 19, y: 5 });
  await app.pitch.clickSquare({ x: 19, y: 5 });
  await page.getByRole("button", { name: "Dodge!" }).click();
  await page.getByRole("button", { name: "Rush!" }).click({ timeout: 15_000 });

  await page.waitForFunction(() => window.__turnoverPace.bannerAt > 0, null, {
    timeout: 30_000,
  });
  const pace = await page.evaluate(() => window.__turnoverPace);
  const start = pace.beats[0]?.at ?? 0;
  console.log(
    pace.beats
      .map((beat) => `${String(beat.at - start)} ${beat.what}`)
      .join("\n")
  );
  expect(pace.beats.some((beat) => beat.what.startsWith("roll Armour"))).toBe(
    true
  );
  expect(pace.failedLandedAt).toBeGreaterThan(0);
  console.log(
    `failed die landed to turn banner: ${String(Math.round(pace.bannerAt - pace.failedLandedAt))} ms`
  );
  expect(pace.bannerAt - pace.failedLandedAt).toBeLessThan(6_000);
});
