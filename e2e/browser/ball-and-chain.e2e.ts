/**
 * Ball & Chain on the board (2025 rulebook p.124): each click picks the
 * Throw-in Template's facing for one square. A collision opens the normal
 * block dice dialog, the coach clicks the pushes, and the Fanatic is picked
 * back up for the next square.
 */
import { test, expect } from "@playwright/test";
import { GameApp } from "../support/pages/game";

const fanatic = async (app: GameApp) =>
  (await app.bridge.snapshot()).teams[0].players[6];

test("Stand Firm refuses the Fanatic's push and it stays put, still active (FAQ)", async ({
  page,
}) => {
  const app = new GameApp(page);
  await app.sandbox.open({
    scenario: "ball-and-chain-stand-firm",
    seed: 1,
    outcome: "stood-firm",
  });

  await app.hud.declareAction("team1:6", "ballAndChain");
  // An empty square East of the Fanatic at (10,5): toward the End Zone
  await app.pitch.clickSquare({ x: 15, y: 5 });
  await app.hud.rollBlockDice();
  await page.screenshot({ path: test.info().outputPath("ball-and-chain-dice.png") });
  await app.hud.chooseBlockResult("push");
  await app.hud.answerReaction(true);

  await expect
    .poll(async () => (await app.bridge.snapshot()).activePlayer?.id)
    .toBe((await fanatic(app)).id);
  expect((await fanatic(app)).position).toEqual({ x: 10, y: 5 });
  // Picked back up for the next square, with the square spent: no going back
  await expect(page.getByTestId("action-step-swing")).toBeVisible();
  await expect(page.getByRole("button", { name: "← Back" })).toBeHidden();
  await page.screenshot({ path: test.info().outputPath("ball-and-chain-stood-firm.png") });

  await page.getByTestId("action-end-activation").click();
  await expect
    .poll(async () => (await app.bridge.snapshot()).activePlayer)
    .toBeNull();
});

test("a boxed-in target is chain-pushed by clicks, and the Fanatic moves in", async ({
  page,
}) => {
  const app = new GameApp(page);
  await app.sandbox.open({
    scenario: "ball-and-chain-chain-push",
    seed: 1,
    outcome: "chain-push",
  });

  await app.hud.declareAction("team1:6", "ballAndChain");
  await app.pitch.clickSquare({ x: 15, y: 5 });
  await app.hud.rollBlockDice();
  await app.hud.chooseBlockResult("push");

  await expect
    .poll(async () => (await app.bridge.pendingDecision())?.type)
    .toBe("push-direction");
  await app.pitch.clickSquare({ x: 12, y: 5 });
  // The Lineman pushed into (12,5) is pushed on: a second direction
  await expect
    .poll(async () => {
      const pending = await app.bridge.pendingDecision();
      return pending?.type === "push-direction" ? pending.defenderId : null;
    })
    .toBe(await app.bridge.resolveRef("team2:2"));
  await page.screenshot({ path: test.info().outputPath("ball-and-chain-chain-push.png") });
  await app.pitch.clickSquare({ x: 13, y: 5 });

  await expect.poll(async () => (await fanatic(app)).position).toEqual({
    x: 11,
    y: 5,
  });
  await expect(app.hud.followUpDialog()).toBeHidden();
  const snapshot = await app.bridge.snapshot();
  expect(snapshot.teams[1].players[0].position).toEqual({ x: 12, y: 5 });
  expect(snapshot.teams[1].players[2].position).toEqual({ x: 13, y: 5 });
  await expect(page.getByTestId("action-step-swing")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("ball-and-chain-moved-in.png") });
});
