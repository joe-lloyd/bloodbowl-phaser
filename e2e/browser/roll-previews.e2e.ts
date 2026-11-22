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

  expect(await app.bridge.pitchLayers()).toContain("path_roll_label");
  await page.screenshot({ path: test.info().outputPath("route-preview.png") });
  await app.pitch.clickSquare({ x: 19, y: 5 });
  const plan = page.getByTestId("action-plan");
  await expect(plan).toContainText("Dodge 3+");
  await expect(plan).toContainText("Rush 2+");
  await expect(plan).not.toContainText("%");
  await page.screenshot({ path: test.info().outputPath("move-plan.png") });

  await page.getByTestId("action-plan-go").click();
  await app.bridge.expectEvent(GameEventNames.DiceRoll, 20_000);
  await expect(page.getByTestId("confirmation-modal")).toBeHidden();
  await expect(plan).toBeHidden();
});

test("a second leg goes straight through when a detour would not fit", async ({
  page,
}) => {
  const app = new GameApp(page);
  await app.sandbox.open({ scenario: "route-tight-second-leg" });
  await app.hud.declareAction("team1:0", "move");
  await app.pitch.clickSquare({ x: 7, y: 5 });
  await app.pitch.clickSquare({ x: 10, y: 5 });

  await expect(page.getByTestId("route-summary")).toContainText(
    "Rush 2+Dodge 5+Rush 2+Dodge 5+"
  );
  await expect(page.getByTestId("action-plan")).toContainText(
    "Rush 2+Dodge 5+Rush 2+Dodge 5+"
  );
  await page.screenshot({ path: test.info().outputPath("tight-leg.png") });
});

test("the plan lists the pick-up, and Go walks onto the ball without asking", async ({
  page,
}) => {
  const app = new GameApp(page);
  await app.sandbox.open({ scenario: "pickup-success-seeded" });
  await app.hud.declareAction("team1:0", "move");
  await app.pitch.clickSquare({ x: 10, y: 7 });
  await expect(page.getByTestId("route-summary")).toContainText("Pick up 3+");
  await expect(page.getByTestId("action-plan")).toContainText("Pick up 3+");
  await app.pitch.clickSquare({ x: 10, y: 7 });
  await expect
    .poll(() => app.pitch.squareOf("team1:0"))
    .toEqual({ x: 10, y: 7 });
  await expect(page.getByTestId("confirmation-modal")).toBeHidden();
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
  await expect(preview).toContainText(/Our ST \d.* vs their ST \d/);
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

test("foul previews armour in the plan, and Clear drops it unrolled", async ({
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
  const plan = page.getByTestId("action-plan");
  await expect(plan).toContainText("Armour, all assists 8+");
  await expect(plan).toContainText("A double sends the fouler off.");
  await page.screenshot({ path: test.info().outputPath("foul-plan.png") });
  await page.getByTestId("action-plan-clear").click();
  await expect(plan).toBeHidden();
  expect(
    (await app.bridge.events()).filter(
      (e) => e.name === GameEventNames.DiceRoll
    )
  ).toHaveLength(0);
});

test("clicking a downed opponent with nothing declared plans a Foul, not a Block", async ({
  page,
}) => {
  const app = new GameApp(page);
  await app.sandbox.open({ scenario: "ux-foul-preview" });
  await app.pitch.clickPlayer("team1:0");
  await app.pitch.clickPlayer("team2:0");
  await expect(page.getByTestId("action-plan")).toContainText("Armour, all assists 8+");
  await expect(page.getByTestId("block-dice-dialog")).toBeHidden();

  await page.getByTestId("action-plan-clear").click();
  await expect(page.getByTestId("action-plan")).toBeHidden();
  const { activePlayer } = await app.bridge.snapshot();
  expect(activePlayer).toMatchObject({ action: "foul" });
  expect(activePlayer?.committed ?? false).toBe(false);
});

test("a foul clears its red target square once the foul is over", async ({
  page,
}) => {
  const app = new GameApp(page);
  await app.sandbox.open({ scenario: "ux-foul-preview" });
  await app.hud.declareAction("team1:0", "foul");
  await app.hud.selectActionStep("foul");
  const target = await app.pitch.squareOf("team2:0");
  const highlights = async () =>
    (await app.bridge.pitchLayers()).filter((name) => name === "highlight");

  await app.pitch.hoverSquare(target);
  await app.pitch.hoverSquare({ x: target.x, y: target.y + 2 });
  await app.pitch.hoverSquare(target);
  await expect.poll(highlights).toHaveLength(1);

  await app.pitch.clickPlayer("team2:0");
  await page.getByTestId("action-plan-go").click();
  await page.getByTestId("foul-assists-1").click();
  await app.bridge.expectEvent(GameEventNames.DiceRoll);
  await expect.poll(highlights, { timeout: 15_000 }).toHaveLength(0);
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

  await expect(preview).toContainText("Intercept #1: 6+, if inaccurate 5+");
  await expect(preview).not.toContainText("%");
  await page.screenshot({ path: test.info().outputPath("pass-preview.png") });
});

test("a blitz plan lists the block's Rush, and Go rolls it with no extra prompt", async ({
  page,
}) => {
  const app = new GameApp(page);
  await app.sandbox.open({ scenario: "blitz-rush-fail-seeded" });
  await app.hud.declareAction("team1:0", "blitz");
  await app.pitch.clickSquare({ x: 16, y: 7 });
  await app.pitch.clickPlayer("team2:0");
  const plan = page.getByTestId("action-plan");
  await expect(plan).toContainText("Block");
  await expect(plan).toContainText("Rush 2+");
  await expect(plan).toContainText(/Our ST \d.* vs their ST \d/);
  await page.screenshot({ path: test.info().outputPath("blitz-plan.png") });

  await page.getByTestId("action-plan-go").click();
  await expect
    .poll(async () =>
      (await app.bridge.events()).some(
        (e) => e.name === GameEventNames.DiceRoll && JSON.stringify(e).includes("Rush")
      ),
      { timeout: 20_000 }
    )
    .toBe(true);
  await expect(page.getByTestId("confirmation-modal")).toBeHidden();
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
