/**
 * The opening of a real match, in order: both teams are introduced, the
 * weather dice land, and only then does the coin toss come up. The coin is
 * tossed on the engine's seeded RNG and named only after it lands. Once
 * both teams are set up, no setup zone is left glowing.
 *
 * SHOTS=<dir> also saves a screenshot of each beat, for a walkthrough page.
 */
import { test, expect } from "@playwright/test";
import { GameApp } from "../support/pages/game";
import { GameEventNames } from "../../src/types/events";
import { GamePhase } from "../../src/types/GameState";

if (process.env.SHOTS) test.use({ video: "on" });

test("introductions, then the coin, then setup with no zone left glowing", async ({
  page,
}) => {
  // A real match from the menu, slow under a full parallel run
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  const app = new GameApp(page);
  let beat = 0;
  const shot = async (name: string) => {
    const path = process.env.SHOTS
      ? `${process.env.SHOTS}/${String(++beat).padStart(2, "0")}-${name}.png`
      : test.info().outputPath(`${name}.png`);
    await page.screenshot({ path });
  };
  const flip = page.getByRole("button", { name: "FLIP COIN" });
  const banner = page.getByTestId("announcement");

  // Two seed teams, then a match between them
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto("/build-team");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: /Seed All Rosters/ }).click();
  await page.goto("/select-team");
  await page
    .getByRole("button", { name: /Human Founders/ })
    .first()
    .click();
  await page
    .getByRole("button", { name: /Orc Founders/ })
    .last()
    .click();
  await page.getByRole("button", { name: /Start Game/ }).click();
  await app.bridge.waitForReady();

  // Each team is introduced in turn, with no coin on screen
  for (const name of ["Human Founders", "Orc Founders"]) {
    await expect(banner).toContainText(name, {
      timeout: 15_000,
    });
    await expect(flip).toHaveCount(0);
    await shot(`intro-${name.split(" ")[0].toLowerCase()}`);
  }
  await expect(banner).toContainText(
    /Weather · (No effect on play|-1 passing|-1 pick-up|-1 rush|D3 players)/,
    { timeout: 15_000 }
  );
  await expect(flip).toHaveCount(0);
  await shot("weather");

  // The toss comes up after them, showing whose side is whose
  await expect(flip).toBeVisible({ timeout: 15_000 });
  const announced = (await app.bridge.events())
    .filter(
      (e) =>
        e.name === GameEventNames.UI_Announce ||
        e.name === GameEventNames.UI_StartCoinFlip
    )
    .map((e) =>
      e.name === GameEventNames.UI_Announce
        ? (e.data as { kind: string }).kind
        : "coin"
    );
  expect(announced.slice(0, 4)).toEqual([
    "team-intro",
    "team-intro",
    "weather",
    "coin",
  ]);
  await expect(page.getByTestId("coin-side-heads")).toContainText(
    "Human Founders"
  );
  await expect(page.getByTestId("coin-side-tails")).toContainText(
    "Orc Founders"
  );
  await shot("coin-sides");

  // The winner is named only once the coin has landed: no sooner than the
  // flip itself takes
  await page.evaluate(() => {
    const w = window as unknown as { flippedAt: number; namedAt: number };
    w.flippedAt = performance.now();
    new MutationObserver((_, observer) => {
      if (/Wins!/.test(document.body.textContent ?? "")) {
        w.namedAt = performance.now();
        observer.disconnect();
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
  await flip.click();
  await expect(page.getByTestId("coin-stage").locator("canvas")).toBeVisible();
  await shot("coin-spinning");
  await expect(page.getByText(/Wins!$/)).toBeVisible({ timeout: 10_000 });
  const namedAfterMs = await page.evaluate(() => {
    const w = window as unknown as { flippedAt: number; namedAt: number };
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
  await expect(page.getByText(`${winner?.name} Wins!`)).toBeVisible();
  await shot("coin-result");
  await page
    .getByRole("button", {
      name: winner?.name === "Orc Founders" ? "RECEIVE" : "KICK",
    })
    .click();

  // Both teams set up from a preset; the zone glows while one deploys
  for (let team = 0; team < 2; team++) {
    const select = page
      .locator("select")
      .filter({ has: page.locator("optgroup[label=Presets]") });
    await expect(select).toBeVisible({ timeout: 15_000 });
    // The zones are shaded, not labelled; the checklist carries the rules
    expect(
      (await app.bridge.pitchLayers())
        .filter((name) => name.startsWith("setup_zone_"))
        .sort()
    ).toEqual(["setup_zone_highlight", "setup_zone_markings"]);
    await expect(page.getByTestId("setup-checklist")).toContainText(
      "Line of scrimmage 0/3"
    );
    await expect(page.getByTestId("setup-checklist")).toContainText(
      "Wide zones: at most 1 each (top 0, bottom 0)"
    );
    const options = await select
      .locator("optgroup[label=Presets] option")
      .allTextContents();
    await select.selectOption(
      options.find((o) => /balanced/i.test(o)) ?? options[0]
    );
    await page.getByRole("button", { name: /LOAD/ }).click();
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
        await shot(`setup-${viewport.width}`);
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
