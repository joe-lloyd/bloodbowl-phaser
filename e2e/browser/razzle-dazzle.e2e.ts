/**
 * Razzle-Dazzle (Spike! Journal 22, L22) in the browser: the coach switches
 * it on as the Lineman is activated, moves, ends the first Action, and the
 * action menu comes back for the second. A Block is offered there; a second
 * Move, a Blitz or a Pass is not, as only one Action may contain a Move.
 */
import { test, expect } from "@playwright/test";
import { GameApp } from "../support/pages/game";

const shot = (name: string) =>
  `${process.env.SHOTS ?? test.info().outputDir}/${name}.png`;

test("Razzle-Dazzle: a Move, then a Block in the same activation", async ({
  page,
}) => {
  const app = new GameApp(page);
  await app.sandbox.open({ scenario: "razzle-dazzle-two-actions" });
  await app.pitch.waitForCameraToSettle();
  const mover = await app.bridge.resolveRef("team1:0");
  const home = (await app.bridge.teams())[0].id;

  await app.pitch.clickPlayer("team1:0");
  await expect(app.hud.actionMenu()).toBeVisible();
  const toggle = app.hud.actionButton("razzle-dazzle");
  await expect(toggle).toContainText("Two Actions");
  await toggle.click();
  await expect(toggle).toContainText("On: pick 1st Action");
  await page.screenshot({ path: shot("razzle-dazzle-toggle") });
  await app.hud.actionButton("move").click();

  const next = { x: 9, y: 5 };
  await app.pitch.clickSquare(next);
  await app.pitch.clickSquare(next);
  await expect.poll(() => app.pitch.squareOf("team1:0")).toEqual(next);
  const end = page.getByTestId("action-end-activation");
  await expect(end).toHaveText("End First Action");
  await end.click();

  // The board picks the Lineman up again for the second Action
  await expect(app.hud.actionMenu()).toContainText(
    "Razzle-Dazzle: 2nd Action",
    {
      timeout: 10_000,
    }
  );
  await expect(app.hud.actionButton("block")).toBeVisible();
  for (const action of ["move", "blitz", "pass", "razzle-dazzle"]) {
    await expect(app.hud.actionButton(action)).toBeHidden();
  }
  const snapshot = await app.bridge.snapshot();
  expect(snapshot.turn.activatedPlayerIds).not.toContain(mover);
  await page.screenshot({ path: shot("razzle-dazzle-second-action") });

  await app.hud.actionButton("block").click();
  await app.pitch.clickPlayer("team2:0");
  await app.hud.rollBlockDice();
  await page.screenshot({ path: shot("razzle-dazzle-block") });
  await app.hud.chooseBlockDie(0);
  // Settle whatever the die asks, a push square and the follow-up, until
  // the activation is over: the Lineman's two Actions are spent
  const finished = async () => {
    const s = await app.bridge.snapshot();
    return s.activePlayer === null || s.activeTeamId !== home;
  };
  for (let i = 0; i < 60 && !(await finished()); i++) {
    const pending = await app.bridge.pendingDecision();
    if (pending?.type === "push-direction") {
      await app.pitch.clickSquare(pending.options[0]);
    } else if (await app.hud.followUpDialog().isVisible()) {
      await app.hud.answerFollowUp(false);
    }
    await page.waitForTimeout(500);
  }
  expect(await finished()).toBe(true);
  expect((await app.bridge.snapshot()).turn.activatedPlayerIds).toContain(
    mover
  );
  await page.screenshot({ path: shot("razzle-dazzle-done") });
});
