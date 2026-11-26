import { fixtureValue } from "../../src/testing/fixtureValue";
import { confirmPregame } from "../support/pregame";

import { test, expect } from "@playwright/test";
import { sampleCamera, finishCameraSample } from "../support/camera";
import { GameApp } from "../support/pages/game";
import { pickFormation } from "../support/setup";
import { seedAllRosters } from "../support/seedTeams";
import { GameEventNames } from "../../src/types/events";
import { GamePhase } from "../../src/types/GameState";

test.use({ contextOptions: { reducedMotion: "no-preference" } });
if (process.env["SHOTS"]) test.use({ video: "on" });

test("introductions, then the coin, then setup with no zone left glowing", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  const app = new GameApp(page);
  let beat = 0;
  const shot = async (name: string) => {
    const path = process.env["SHOTS"]
      ? `${process.env["SHOTS"]}/${String(++beat).padStart(2, "0")}-${name}.png`
      : test.info().outputPath(`${name}.png`);
    await page.screenshot({ path });
  };
  const flip = page.getByRole("button", { name: "FLIP COIN" });
  const banner = page.getByTestId("announcement");

  page.on("dialog", (dialog) => void dialog.accept());

  await seedAllRosters(page, { fullStrength: true });
  await page.goto("/select-team");
  await page
    .getByRole("button", { name: /Human Founders/ })
    .first()
    .click();
  await page
    .getByRole("button", { name: /Orc Founders/ })
    .last()
    .click();
  await sampleCamera(page);
  await page.getByRole("button", { name: /Start Game/ }).click();
  await app.bridge.waitForReady();

  for (const name of ["Human Founders", "Orc Founders"]) {
    await expect(banner).toContainText(name, {
      timeout: 15_000,
    });
    await expect(flip).toHaveCount(0);
    await shot(`intro-${fixtureValue(name.split(" ", 1)[0]).toLowerCase()}`);
  }
  const cameraFrames = await finishCameraSample(
    page,
    test.info(),
    "opening-camera-frames"
  );
  const opening = cameraFrames.filter((s) => s.zooming);
  expect(opening.length).toBeGreaterThan(2);
  for (const axis of ["x", "y"] as const) {
    const centres = opening.map((s) => s.centre[axis]);
    expect(Math.max(...centres) - Math.min(...centres)).toBeLessThan(0.01);
  }
  expect(Math.max(...opening.map((s) => s.zoom))).toBeGreaterThan(
    Math.min(...opening.map((s) => s.zoom))
  );

  const weather = page.getByTestId("weather-dialog");
  await expect(weather).toBeVisible({ timeout: 15_000 });
  await expect(flip).toHaveCount(0);
  await expect(page.getByTestId("weather-table").locator("li")).toHaveCount(5);
  const panel = weather.locator("section");
  await panel.evaluate((el) =>
    Promise.all(el.getAnimations().map((slide) => slide.finished))
  );
  const before = await panel.boundingBox();
  await shot("weather-ready");
  await page.getByRole("button", { name: "ROLL WEATHER" }).click();
  await expect(
    page.getByTestId("weather-stage").locator("canvas")
  ).toBeVisible();
  await expect(page.getByTestId("weather-result")).toBeVisible({
    timeout: 15_000,
  });
  const state = await app.bridge.snapshot();
  await expect(page.getByTestId("weather-result")).toContainText(state.weather);
  expect(await panel.boundingBox()).toEqual(before);
  await expect(
    page.getByTestId("weather-table").locator("li[data-current]")
  ).toContainText(state.weather);
  await expect(flip).toHaveCount(0);
  await shot("weather");
  await page.getByRole("button", { name: "ON TO THE COIN TOSS" }).click();

  await confirmPregame(page);

  await expect(flip).toBeVisible({ timeout: 15_000 });
  const announced = (await app.bridge.events())
    .filter(
      (e) =>
        e.name === GameEventNames.UI_Announce ||
        e.name === GameEventNames.UI_StartWeather ||
        e.name === GameEventNames.UI_StartCoinFlip
    )
    .map((e) =>
      e.name === GameEventNames.UI_Announce
        ? (e.data as { kind: string }).kind
        : e.name === GameEventNames.UI_StartWeather
          ? "weather"
          : "coin"
    );
  expect([...new Set(announced)]).toEqual(["team-intro", "weather", "coin"]);
  await expect(page.getByTestId("coin-side-heads")).toContainText(
    "Human Founders"
  );
  await expect(page.getByTestId("coin-side-tails")).toContainText(
    "Orc Founders"
  );
  await shot("coin-sides");

  await page.evaluate(() => {
    const w = globalThis as unknown as { flippedAt: number; namedAt: number };
    w.flippedAt = performance.now();
    new MutationObserver((_, observer) => {
      if (!(document.body.textContent ?? "").includes("wins the toss!")) {
        return;
      }

      w.namedAt = performance.now();
      observer.disconnect();
    }).observe(document.body, { childList: true, subtree: true });
  });
  await flip.click();
  await expect(page.getByTestId("coin-stage").locator("canvas")).toBeVisible();
  await shot("coin-spinning");
  await expect(page.getByText(/wins the toss!$/)).toBeVisible({ timeout: 10_000 });
  const namedAfterMs = await page.evaluate(() => {
    const w = globalThis as unknown as { flippedAt: number; namedAt: number };
    return w.namedAt - w.flippedAt;
  });
  expect(namedAfterMs).toBeGreaterThan(1500);
  const toss = (await app.bridge.events()).find(
    (e) =>
      e.name === GameEventNames.DiceRoll &&
      (e.data as { rollType: string }).rollType === "Coin Toss"
  );
  const winner = (await app.bridge.teams()).find(
    (t) => t.id === (toss?.data as { teamId: string }).teamId
  );
  await expect(page.getByText(`${String(winner?.name)} wins the toss!`)).toBeVisible();
  await shot("coin-result");
  await page
    .getByRole("button", {
      name: winner?.name === "Orc Founders" ? "RECEIVE" : "KICK",
    })
    .click();

  for (let team = 0; team < 2; team++) {
    await expect(page.getByTestId("formation-menu")).toBeVisible({ timeout: 15_000 });

    expect(
      (await app.bridge.pitchLayers())
        .filter((name) => name.startsWith("setup_zone_"))
        .toSorted()
    ).toEqual(["setup_zone_highlight", "setup_zone_markings"]);
    await expect(page.getByTestId("setup-checklist")).toContainText(
      "Line of scrimmage 0/3"
    );
    await expect(page.getByTestId("setup-checklist")).toContainText(
      "Wide zones: at most 1 each (top 0, bottom 0)"
    );
    await pickFormation(page, /balanced/i);
    await expect(page.getByTestId("setup-checklist")).toContainText(
      "Line of scrimmage 3/3"
    );
    await expect(page.getByTestId("setup-checklist")).toContainText(
      "Players placed 7/7"
    );
    if (team === 1) {
      await shot("last-team-deploying");
      for (const viewport of [
        { width: 1280, height: 720 },
        { width: 1920, height: 1080 },
      ]) {
        await page.setViewportSize(viewport);
        const confirm = page.getByRole("button", { name: /CONFIRM SETUP/ });
        await expect(confirm).toBeInViewport();
        await expect(page.getByTestId("setup-checklist")).toBeInViewport();
        expect(
          await page.evaluate(
            () =>
              document.documentElement.scrollWidth <= innerWidth &&
              document.documentElement.scrollHeight <= innerHeight
          )
        ).toBe(true);
        await shot(`setup-${String(viewport.width)}`);
      }
      await page.setViewportSize({ width: 1280, height: 720 });
    }
    await page.getByRole("button", { name: /CONFIRM SETUP/ }).click();
    await page.waitForTimeout(800);
  }

  await expect
    .poll(async () => (await app.bridge.phase()).phase, { timeout: 15_000 })
    .not.toBe(GamePhase.SETUP);
  expect(await app.bridge.pitchLayers()).not.toContain("setup_zone_highlight");
  await shot("setup-done");
});
