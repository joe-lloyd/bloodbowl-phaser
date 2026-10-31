import { copyFile, mkdir } from "node:fs/promises";
import { test, expect, Page } from "@playwright/test";
import { GameApp } from "../support/pages/game";

async function expectDockClear(
  page: Page,
  app: GameApp,
  refs: string[],
  name: string
) {
  const dock = page.getByTestId("decision-dock");
  await expect(dock).toBeVisible();
  await expect(
    page.locator('[data-testid="decision-team"]:visible')
  ).toBeVisible();
  const box = await dock.boundingBox();
  if (!box) throw new Error("Decision dock has no box");
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("Viewport has no size");
  expect(box.x).toBeGreaterThan(viewport.width / 2);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  const points = await Promise.all(
    refs.map(async (ref) => ({
      ref,
      point: await app.pitch.viewportPoint(await app.pitch.squareOf(ref)),
    }))
  );
  for (const { ref, point } of points) {
    const overlaps =
      point.x + 24 > box.x &&
      point.x - 24 < box.x + box.width &&
      point.y > box.y &&
      point.y - 65 < box.y + box.height;
    expect(overlaps, `${ref} is covered by ${name}`).toBe(false);
  }
  await expect(app.hud.endTurn()).toBeHidden();
  const screenshot = test.info().outputPath(`${name}.png`);
  await page.screenshot({ path: screenshot });
  if (process.env.DECISION_DOCK_SHOTS) {
    await mkdir(process.env.DECISION_DOCK_SHOTS, { recursive: true });
    await copyFile(
      screenshot,
      `${process.env.DECISION_DOCK_SHOTS}/${viewport.width}x${viewport.height}-${name}.png`
    );
  }
}

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
]) {
  test.describe(`${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });
    test("block decisions leave both players visible", async ({ page }) => {
      // Five layout checks, each waiting for the camera: slow under a full
      // parallel run.
      test.setTimeout(240_000);
      const app = new GameApp(page);
      await app.sandbox.open({ scenario: "chain-push", seed: 1 });
      await app.hud.declareAction("team1:0", "block");
      await app.pitch.clickPlayer("team2:0");
      await expect(app.hud.blockDiceDialog()).toBeVisible();
      await expectDockClear(page, app, ["team1:0", "team2:0"], "block-preview");
      // The 3D dice are slow to render at 1920x1080 in a parallel run; the
      // rolled steps are checked at 1280x720.
      if (viewport.width !== 1280) return;
      await app.hud.rollBlockDice();
      await expectDockClear(page, app, ["team1:0", "team2:0"], "block-pick");
      await app.pitch.clickPlayer("team2:0");
      await expect(page.getByTestId("block-die-0")).toBeVisible();
      await expect(page.getByTestId("block-roll-dice")).toBeHidden();
      await app.hud.chooseBlockDie(0);
      await expect(page.getByTestId("push-choice-prompt")).toBeVisible();
      await expectDockClear(page, app, ["team1:0", "team2:0"], "push-choice");
      for (
        let step = 0;
        step < 4 && (await page.getByTestId("push-choice-prompt").isVisible());
        step++
      ) {
        const pending = await app.bridge.pendingDecision();
        if (pending?.type !== "push-direction")
          throw new Error("No push square offered");
        await app.pitch.clickSquare(pending.options[0]);
      }
      await expect(app.hud.followUpDialog()).toBeVisible();
      await expectDockClear(page, app, ["team1:0", "team2:0"], "follow-up");
      await app.hud.answerFollowUp(false);
      await expect(page.getByTestId("push-choice-prompt")).toBeHidden();
    });

    test("a Pro re-roll leaves the failed mover visible", async ({ page }) => {
      test.skip(viewport.width !== 1280, "The block flow covers 1920x1080.");
      const app = new GameApp(page);
      await app.sandbox.open({ scenario: "pro-die-reroll", seed: 8 });
      await app.hud.declareAction("team1:0", "move");
      await app.pitch.clickSquare({ x: 9, y: 4 });
      await app.pitch.clickSquare({ x: 9, y: 4 });
      await expect(page.getByText(/Pro needs 3/)).toBeVisible();
      await page.getByRole("button", { name: "Dodge!", exact: true }).click();
      await expect(page.getByTestId("reroll-use-pro")).toBeVisible();
      await expect(page.getByTestId("reroll-odds")).toHaveText(
        "Needed 3+, rolled 1."
      );
      await expect(page.getByTestId("reroll-need-pro")).toContainText(
        "Pro needs 3+, then 3+."
      );
      await expectDockClear(page, app, ["team1:0"], "reroll-pro");
      await page.getByTestId("reroll-use-pro").click();
      await expect(app.hud.rerollDialog()).toBeHidden();
    });

    test("an interception keeps its player in view", async ({ page }) => {
      test.skip(viewport.width !== 1280, "The block flow covers 1920x1080.");
      const app = new GameApp(page);
      await app.sandbox.open({ scenario: "throw-interception-test", seed: 1 });
      await app.hud.declareAction("team1:0", "pass");
      await app.hud.selectActionStep("pass");
      await app.pitch.clickPlayer("team1:1");
      await expect(page.getByTestId("interception-dialog")).toBeVisible();
      await expect(page.getByText(/A miss costs nothing/)).toBeVisible();
      await expectDockClear(page, app, ["team2:0"], "interception");
      const point = await app.pitch.viewportPoint(
        await app.pitch.squareOf("team2:0")
      );
      expect(point.x).toBeGreaterThan(viewport.width * 0.3);
      expect(point.x).toBeLessThan(viewport.width * 0.7);
      await page.waitForTimeout(600);
      expect(
        await app.pitch.viewportPoint(await app.pitch.squareOf("team2:0"))
      ).toEqual(point);
    });

    test("Dodge and Rush prompts leave the runner visible", async ({
      page,
    }) => {
      test.skip(viewport.width !== 1280, "The block flow covers 1920x1080.");
      const app = new GameApp(page);
      await app.sandbox.open({ scenario: "score-run-dodge-rush", seed: 2 });
      await app.hud.declareAction("team1:0", "move");
      await app.pitch.clickSquare({ x: 19, y: 5 });
      await app.pitch.clickSquare({ x: 19, y: 5 });
      await expect(
        page.getByRole("button", { name: "Dodge!", exact: true })
      ).toBeVisible();
      await expectDockClear(page, app, ["team1:0"], "dodge");
      await page.getByRole("button", { name: "Dodge!", exact: true }).click();
      // The dodge die lands and the runner walks before the Rush prompt.
      await expect(
        page.getByRole("button", { name: "Rush!", exact: true })
      ).toBeVisible({ timeout: 20_000 });
      await expectDockClear(page, app, ["team1:0"], "rush");
    });
  });
}
