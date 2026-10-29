/**
 * A run to the End Zone is walked leg by leg: the coach clicks the End Zone
 * once, then is asked before the Dodge out of the marked square and again
 * before the Rush onto the last square, and the touchdown comes only after
 * the runner is shown standing there.
 *
 * SHOTS=<dir> also saves a screenshot of each beat, for a walkthrough page.
 */
import { test, expect } from "@playwright/test";
import { GameApp } from "../support/pages/game";
import { GameEventNames } from "../../src/types/events";

const SEED = Number(process.env.SCORE_RUN_SEED ?? 2);

// The walkthrough also wants the run as a video
if (process.env.SHOTS) test.use({ video: "on" });

test("a score run stops before the Dodge and the Rush, and scores at the end", async ({
  page,
}) => {
  const app = new GameApp(page);
  let beat = 0;
  const shot = async (name: string) => {
    const path = process.env.SHOTS
      ? `${process.env.SHOTS}/${String(++beat).padStart(2, "0")}-${name}.png`
      : test.info().outputPath(`${name}.png`);
    await page.screenshot({ path });
  };
  const carrier = async () =>
    (await app.bridge.snapshot()).teams[0].players.find((p) => p.position)!;
  const scored = async () =>
    (await app.bridge.events()).some(
      (e) => e.name === GameEventNames.Touchdown
    );

  await app.sandbox.open({ scenario: "score-run-dodge-rush", seed: SEED });
  await app.pitch.waitForCameraToSettle();
  await app.pitch.clickPlayer("team1:0");
  await app.hud.actionButton("move").click();
  await app.pitch.waitForCameraToSettle();
  await shot("selected");

  // Plot the run, then click the same square again to go
  await app.pitch.clickSquare({ x: 19, y: 5 });
  await shot("route-plotted");
  await app.pitch.clickSquare({ x: 19, y: 5 });

  // Nothing has moved or rolled: the board asks before the Dodge
  await expect(page.getByRole("heading", { name: /: Dodge$/ })).toBeVisible();
  await expect(
    page.getByText(/Dodge: 3\+\. A fall is a turnover\./)
  ).toBeVisible();
  expect((await carrier()).position).toEqual({ x: 12, y: 5 });
  await shot("dodge-prompt");
  await page.getByRole("button", { name: "Dodge!" }).click();
  await shot("dodge-rolling");

  // The Dodge, then the safe squares; it stops before the Rush
  await expect(page.getByRole("heading", { name: /: Rush$/ })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(/Rush: 2\+\./)).toBeVisible();
  expect((await carrier()).position).toEqual({ x: 18, y: 5 });
  expect(await scored()).toBe(false);
  await shot("rush-prompt");
  await page.getByRole("button", { name: "Rush!" }).click();
  await shot("rush-rolling");

  // The touchdown waits for the dice and the last step
  await expect.poll(scored, { timeout: 15_000 }).toBe(true);
  expect((await carrier()).position).toEqual({ x: 19, y: 5 });
  await page.waitForTimeout(600);
  await shot("touchdown");
});

test("a failed Rush shows the turnover only after its die has landed", async ({
  page,
}) => {
  const app = new GameApp(page);
  // Seed 1: the Dodge passes and the Rush rolls a 1
  await app.sandbox.open({ scenario: "score-run-dodge-rush", seed: 1 });
  // Note the rolls thrown when the turnover is called, and the rolls landed
  // when the banner first shows
  await page.evaluate(() => {
    const w = window as unknown as {
      eventBus: { on(name: string, fn: (d: never) => void): void };
      tray: { thrown: number; landedThrough: number };
      thrownAtTurnover: number | null;
      landedAtBanner: number | null;
    };
    w.tray = { thrown: 0, landedThrough: 0 };
    w.thrownAtTurnover = w.landedAtBanner = null;
    w.eventBus.on(
      "ui:diceInAir",
      (d: { thrown: number; landedThrough: number }) => {
        w.tray = d;
      }
    );
    w.eventBus.on("ui:turnover", () => {
      w.thrownAtTurnover ??= w.tray.thrown;
    });
    new MutationObserver(() => {
      const shown = [...document.querySelectorAll("h1")].some(
        (h) => h.textContent === "TURNOVER"
      );
      if (shown) w.landedAtBanner ??= w.tray.landedThrough;
    }).observe(document.body, { childList: true, subtree: true });
  });
  await app.pitch.waitForCameraToSettle();
  await app.pitch.clickPlayer("team1:0");
  await app.hud.actionButton("move").click();
  await app.pitch.clickSquare({ x: 19, y: 5 });
  await app.pitch.clickSquare({ x: 19, y: 5 });
  await page.getByRole("button", { name: "Dodge!" }).click();
  await page.getByRole("button", { name: "Rush!" }).click({ timeout: 15_000 });

  await expect(page.getByRole("heading", { name: "TURNOVER" })).toBeVisible({
    timeout: 10_000,
  });
  const { thrownAtTurnover, landedAtBanner } = await page.evaluate(() => {
    const w = window as unknown as {
      thrownAtTurnover: number;
      landedAtBanner: number;
    };
    return {
      thrownAtTurnover: w.thrownAtTurnover,
      landedAtBanner: w.landedAtBanner,
    };
  });
  // Every roll up to the failed Rush had landed before the banner
  expect(thrownAtTurnover).toBeGreaterThan(0);
  expect(landedAtBanner).toBeGreaterThanOrEqual(thrownAtTurnover);
});
