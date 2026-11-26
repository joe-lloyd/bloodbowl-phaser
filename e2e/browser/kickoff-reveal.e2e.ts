import { test, expect } from "@playwright/test";
import { GameApp } from "../support/pages/game";
import { KICKOFF_EXAMPLE_SEEDS } from "../../src/data/kickoffScenarios";
import { KickoffEvent } from "../../src/game/kickoff/kickoffEvents";

const SHOTS = process.env["KICKOFF_REVEAL_SHOTS"];

test("Dodgy Snack: table, banner, each labelled roll, then the outcome", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const app = new GameApp(page);
  const shot = async (name: string) => {
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
  };
  await app.sandbox.open({
    scenario: "kickoff-table-standard",
    seed: KICKOFF_EXAMPLE_SEEDS[KickoffEvent.DODGY_SNACK],
    outcome: "dodgy-snack",
  });
  await app.pitch.waitForCameraToSettle();
  await app.pitch.clickPlayer("team1:0");
  await app.pitch.clickSquare({ x: 14, y: 5 });

  const dialog = page.getByTestId("kickoff-table-dialog");
  const roll = dialog.getByRole("button", { name: "ROLL KICK-OFF" });
  await expect(roll).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  const events = await app.bridge.events();
  expect(events.some((e) => e.name === "kickoffTableRolled")).toBe(false);
  await expect(dialog.getByTestId("kickoff-table")).toContainText(
    "11Dodgy Snack"
  );
  await shot("1-ready");
  await roll.click();

  await expect(dialog.getByTestId("kickoff-table-result")).toContainText(
    "Dodgy Snack",
    { timeout: 15_000 }
  );
  await expect(dialog.locator("li[data-current]")).toContainText("Dodgy Snack");
  await shot("2-rolled");

  const banner = page.getByTestId("announcement");
  await expect(banner).toContainText(
    "Next, each team rolls a D6. The lower roll has a random player eat something bad.",
    { timeout: 15_000 }
  );
  await expect(dialog).toBeHidden();
  const tray = page.getByTestId("dice-tray");
  await expect(tray).not.toContainText("Dodgy Snack");
  await shot("3-banner");

  await expect(tray).toContainText("lower roll eats the snack", {
    timeout: 15_000,
  });
  await shot("4-roll-off");
  await expect(tray).toContainText("D16 picks which", { timeout: 20_000 });
  await shot("5-which-player");
  await expect(tray).toContainText("a 1 sends them to the Reserves", {
    timeout: 20_000,
  });
  await shot("6-effect");

  await expect(banner).toContainText(/for the drive/, { timeout: 20_000 });
  await shot("7-outcome");
});
