import { fixtureValue } from "../../src/testing/fixtureValue";
import { confirmPregame } from "../support/pregame";

import { test, expect } from "@playwright/test";
import { GameApp } from "../support/pages/game";
import { pickFormation } from "../support/setup";
import { seedAllRosters } from "../support/seedTeams";
import { GameEventNames } from "../../src/types/events";

const SHORT = "Human Founders";
const OTHER = "Orc Founders";

test("a friendly fields the player due to miss the next league game, with no Journeymen", async ({
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
  await expect(page.getByText(/wins the toss!$/)).toBeVisible({ timeout: 15_000 });
  const events = await app.bridge.events();
  const toss = events.find(
    (e) =>
      e.name === GameEventNames.DiceRoll &&
      (e.data as { rollType: string }).rollType === "Coin Toss"
  );
  const teams = await app.bridge.teams();
  const winner = teams.find(
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

  await pickFormation(page, /balanced/i);
  const checklist = page.getByTestId("setup-checklist");
  await expect(checklist).toContainText("Line of scrimmage 3/3");
  await expect(checklist).toContainText("Players placed 7/7");
  await expect(
    page.getByRole("button", { name: /CONFIRM SETUP/ })
  ).toBeEnabled();
});
