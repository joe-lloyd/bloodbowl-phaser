import { expect, test } from "@playwright/test";
import { GameEventNames } from "../../src/types/events";
import { GameApp } from "../support/pages/game";

test.use({ viewport: { width: 1280, height: 720 } });

test("route shows every roll with its target, and no odds, before a score run", async ({
  page,
}) => {
  const app = new GameApp(page);
  await app.sandbox.open({ scenario: "score-run-dodge-rush", seed: 2 });
  await app.hud.declareAction("team1:0", "move");
  await app.pitch.hoverSquare({ x: 19, y: 5 });
  const summary = page.getByTestId("route-summary");
  await expect(summary).toContainText("6 movement left");
  await expect(summary).toContainText("2 risky steps");
  await expect(summary).not.toContainText("%");
  await expect(summary).toContainText("Dodge 3+");
  await expect(summary).toContainText("Rush 2+");
  // The same targets are tagged on the route squares
  expect(await app.bridge.pitchLayers()).toContain("path_roll_label");
  await page.screenshot({ path: test.info().outputPath("route-preview.png") });
  await app.pitch.clickSquare({ x: 19, y: 5 });
  await app.pitch.clickSquare({ x: 19, y: 5 });
  await expect(page.getByTestId("confirmation-modal")).toContainText(
    "Dodge: 3+. A fall is a turnover."
  );
  await page.getByRole("button", { name: "Dodge!" }).click();
  await expect(page.getByRole("heading", { name: /: Rush$/ })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Stop here" }).click();
  await app.pitch.hoverSquare({ x: 18, y: 4 });
  await app.pitch.hoverSquare({ x: 19, y: 5 });
  await expect(summary).toContainText("0 movement left");
  await expect(summary).toContainText("Rush 2+");
  await page.screenshot({
    path: test.info().outputPath("second-leg-rush.png"),
  });
});

test("pickup asks before entering the ball square and can stop", async ({
  page,
}) => {
  const app = new GameApp(page);
  await app.sandbox.open({ scenario: "pickup-success-seeded" });
  await app.hud.declareAction("team1:0", "move");
  await app.pitch.clickSquare({ x: 10, y: 7 });
  await expect(page.getByTestId("route-summary")).toContainText("Pick up 3+");
  await app.pitch.clickSquare({ x: 10, y: 7 });
  await expect(page.getByTestId("confirmation-modal")).toContainText(
    "Pick up: 3+. A fail is a turnover."
  );
  expect(await app.pitch.squareOf("team1:0")).toEqual({ x: 9, y: 7 });
  await page.getByRole("button", { name: "Stop here" }).click();
  expect(await app.pitch.squareOf("team1:0")).toEqual({ x: 9, y: 7 });
  await app.pitch.clickSquare({ x: 10, y: 7 });
  await app.pitch.clickSquare({ x: 10, y: 7 });
  await page.getByRole("button", { name: "Pick up!" }).click();
  await expect
    .poll(() => app.pitch.squareOf("team1:0"))
    .toEqual({ x: 10, y: 7 });
});

test("block hover names the chooser, assists and Dodge before opening the dialog", async ({
  page,
}) => {
  const app = new GameApp(page);
  await app.sandbox.open({ scenario: "ux-block-preview" });
  await app.hud.declareAction("team1:0", "block");
  await app.pitch.hoverSquare(await app.pitch.squareOf("team2:0"));
  const preview = page.getByTestId("target-roll-preview");
  await expect(preview).toContainText("2 dice, you pick");
  await expect(preview).toContainText("Our assists: #2");
  await expect(preview).toContainText("They have Dodge");
  await page.screenshot({ path: test.info().outputPath("block-preview.png") });
  await app.pitch.clickPlayer("team2:0");
  await expect(page.getByTestId("block-roll-analysis")).toContainText(
    "Our assists: #2"
  );
  await expect(page.getByTestId("block-roll-analysis")).toContainText(
    "They have Dodge"
  );
  await page.screenshot({ path: test.info().outputPath("block-dialog.png") });
});

test("foul previews armour and asks for confirmation with Cancel", async ({
  page,
}) => {
  const app = new GameApp(page);
  await app.sandbox.open({ scenario: "ux-foul-preview" });
  await app.hud.declareAction("team1:0", "foul");
  await app.pitch.hoverSquare(await app.pitch.squareOf("team2:0"));
  await expect(page.getByTestId("target-roll-preview")).toContainText(
    "Armour: 8+"
  );
  await expect(page.getByTestId("target-roll-preview")).toContainText(
    "Our assists: #2"
  );
  await app.pitch.clickPlayer("team2:0");
  await expect(page.getByTestId("confirmation-modal")).toContainText(
    "A double sends the fouler off."
  );
  await page.screenshot({
    path: test.info().outputPath("foul-confirmation.png"),
  });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByTestId("confirmation-modal")).toBeHidden();
  expect(
    (await app.bridge.events()).filter(
      (e) => e.name === GameEventNames.DiceRoll
    )
  ).toHaveLength(0);
});

test("pass hover shows range, catch and each interception roll", async ({
  page,
}) => {
  const app = new GameApp(page);
  await app.sandbox.open({ scenario: "throw-interception-test" });
  await app.hud.declareAction("team1:0", "pass");
  await app.hud.selectActionStep("pass");
  await app.pitch.hoverSquare(await app.pitch.squareOf("team1:1"));
  const preview = page.getByTestId("target-roll-preview");
  await expect(preview).toContainText(/Long Pass: \d\+/);
  await expect(preview).toContainText(/Catch: \d\+/);
  // The pass is not thrown yet: the roll against an inaccurate pass, which
  // the interception dialog would offer then, is named too
  await expect(preview).toContainText("Intercept #1: 6+, if inaccurate 5+");
  await expect(preview).not.toContainText("%");
  await page.screenshot({ path: test.info().outputPath("pass-preview.png") });
});

test("a blitz block asks for its Rush before any block dice", async ({
  page,
}) => {
  const app = new GameApp(page);
  await app.sandbox.open({ scenario: "blitz-rush-fail-seeded" });
  await app.hud.declareAction("team1:0", "blitz");
  await app.pitch.clickSquare({ x: 16, y: 7 });
  await app.pitch.clickSquare({ x: 16, y: 7 });
  await expect
    .poll(() => app.pitch.squareOf("team1:0"))
    .toEqual({ x: 16, y: 7 });
  await expect(page.getByTestId("action-step-block")).toBeVisible();
  await app.hud.selectActionStep("block");
  await expect
    .poll(async () => {
      await app.pitch.clickPlayer("team2:0");
      return page.getByTestId("block-dice-dialog").isVisible();
    }, { timeout: 30_000 })
    .toBe(true);
  await page.getByTestId("block-roll-dice").click();
  await expect(page.getByTestId("confirmation-modal")).toContainText(
    "This block needs a Rush: 2+."
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByTestId("block-dice-dialog")).toBeHidden();
});

test("hand-off hover shows only the receiver's catch target", async ({
  page,
}) => {
  const app = new GameApp(page);
  await app.sandbox.open({ scenario: "handoff-no-interception" });
  await app.hud.declareAction("team1:0", "handoff");
  await app.hud.selectActionStep("handoff");
  await app.pitch.hoverSquare(await app.pitch.squareOf("team1:1"));
  const preview = page.getByTestId("target-roll-preview");
  await expect(preview).toContainText("Catch: 4+");
  await expect(preview).not.toContainText("Intercept");
  await page.screenshot({
    path: test.info().outputPath("handoff-preview.png"),
  });
});
