import { fixtureValue } from "../../src/testing/fixtureValue";
import { confirmPregame } from "../support/pregame";

import { test, expect } from "@playwright/test";
import { GameApp } from "../support/pages/game";
import { seedAllRosters } from "../support/seedTeams";
import { GameEventNames } from "../../src/types/events";

const SHORT = "Human Founders";
const OTHER = "Orc Founders";

test("a short team sets up with the players it has in a friendly", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  const app = new GameApp(page);
  page.on("dialog", (dialog) => void dialog.accept());

  await seedAllRosters(page);
  await page.goto("/select-team");
  await page
    .getByRole("button", { name: new RegExp(SHORT) })
    .first()
    .click();
  await page
    .getByRole("button", { name: new RegExp(OTHER) })
    .last()
    .click();
  await page.getByRole("button", { name: /Start Game/ }).click();
  await app.bridge.waitForReady();

  await app.rollWeather(45_000);
  await confirmPregame(page);
  const flip = page.getByRole("button", { name: "FLIP COIN" });
  await expect(flip).toBeVisible({ timeout: 15_000 });
  await flip.click();
  await expect(page.getByText(/Wins!$/)).toBeVisible({ timeout: 15_000 });
  const toss = (await app.bridge.events()).find(
    (e) =>
      e.name === GameEventNames.DiceRoll &&
      (e.data as { rollType: string }).rollType === "Coin Toss"
  );
  const winner = (await app.bridge.teams()).find(
    (t) => t.id === (toss?.data as { teamId: string }).teamId
  );
  await page
    .getByRole("button", { name: winner?.name === OTHER ? "RECEIVE" : "KICK" })
    .click();
  await expect(page.getByTestId("setup-checklist")).toBeVisible({
    timeout: 30_000,
  });

  const snapshot = await app.bridge.snapshot();
  const short = fixtureValue(snapshot.teams.find((t) => t.name === SHORT));
  const names = short.players.map(
    (p) => (p as { playerName?: string }).playerName ?? ""
  );
  expect(names.some((name) => name.includes("Journeyman"))).toBe(false);
  expect(short.players).toHaveLength(7);

  const select = page
    .locator("select")
    .filter({ has: page.locator("optgroup[label=Presets]") });
  const options = await select
    .locator("optgroup[label=Presets] option")
    .allTextContents();
  await select.selectOption(
    fixtureValue(options.find((o) => /balanced/i.test(o)) ?? options[0])
  );
  await page.getByRole("button", { name: /LOAD/ }).click();
  const checklist = page.getByTestId("setup-checklist");
  await expect(checklist).toContainText("Line of scrimmage 3/3");
  await expect(checklist).toContainText("Players placed 6/6");
  await expect(
    page.getByRole("button", { name: /CONFIRM SETUP/ })
  ).toBeEnabled();
});
