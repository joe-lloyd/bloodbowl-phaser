import { test, expect, type Page } from "@playwright/test";
import { GameApp } from "../support/pages/game";

const LANDING = { x: 10, y: 5 };
const RECEIVER = { x: 12, y: 8 };

async function open(page: Page): Promise<GameApp> {
  const app = new GameApp(page);
  await app.sandbox.open({ scenario: "base-move", seed: 5 });
  await app.pitch.waitForCameraToSettle();
  return app;
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: test.info().outputPath(`${name}.png`) });
}

async function planJump(page: Page, app: GameApp): Promise<void> {
  const half = page.getByTestId("action-step-jump");
  await half.click();
  await expect(half).toHaveAttribute("data-active", "true");
  await app.pitch.clickSquare(LANDING);
  await expect(page.getByTestId("action-plan")).toContainText("Jump 2+");
}

const squareOf = (app: GameApp, ref: string) =>
  expect.poll(() => app.pitch.squareOf(ref), { timeout: 20_000 });

for (const { size, use } of [
  { size: "desktop", use: { viewport: { width: 1280, height: 800 } } },
  {
    size: "phone",
    use: {
      viewport: { width: 844, height: 390 },
      hasTouch: true,
      isMobile: true,
    },
  },
]) {
  test.describe(size, () => {
    test.use(use);

    test("Move splits into Move and Stand Up for a prone player", async ({ page }) => {
      const app = await open(page);
      await app.pitch.clickPlayer("team1:1");
      await expect(page.getByTestId("action-move-standup")).toBeVisible();
      await expect(page.getByTestId("action-standUp")).toHaveCount(0);
      await shot(page, `${size}-prone-menu`);

      await page.getByTestId("action-move-standup").click();
      await expect
        .poll(async () => (await app.bridge.snapshot()).activePlayer?.action)
        .toBe("move");
      await squareOf(app, "team1:1").toEqual({ x: 4, y: 8 });
      await expect(page.getByTestId("action-step-move")).toBeVisible();
      await expect(page.getByTestId("action-step-standup")).toHaveCount(0);
      await shot(page, `${size}-stood-up`);
    });

    test("Move splits into Move and Jump beside a downed player", async ({ page }) => {
      const app = await open(page);
      await app.pitch.clickPlayer("team1:0");
      await expect(page.getByTestId("action-move-jump")).toBeVisible();
      await shot(page, `${size}-standing-menu`);
      await page.getByTestId("action-move-jump").click();
      await expect(page.getByTestId("action-step-jump")).toHaveAttribute(
        "data-active",
        "true"
      );
      await shot(page, `${size}-jump-targets`);
    });

    test("a Blitz jumps, walks on and blocks", async ({ page }) => {
      const app = await open(page);
      await app.hud.declareAction("team1:0", "blitz");
      await shot(page, `${size}-blitz-steps`);
      await planJump(page, app);
      await shot(page, `${size}-blitz-jump-planned`);
      await app.pitch.clickPlayer("team2:1");
      await shot(page, `${size}-blitz-plan`);
      await page.getByTestId("action-plan-go").click();
      await squareOf(app, "team1:0").toMatchObject({ x: 11 });
      await expect(page.getByTestId(/^block-/).first()).toBeVisible({
        timeout: 20_000,
      });
      await shot(page, `${size}-blitz-block`);
    });

    test("a Pass jumps and then throws", async ({ page }) => {
      const app = await open(page);
      await app.hud.declareAction("team1:0", "pass");
      await planJump(page, app);
      await app.hud.selectActionStep("pass");
      await app.pitch.waitForCameraToSettle();
      await app.pitch.clickSquare(RECEIVER);
      await shot(page, `${size}-pass-plan`);
      await page.getByTestId("action-plan-go").click();
      await squareOf(app, "team1:0").toEqual(LANDING);
      await expect
        .poll(async () => (await app.bridge.snapshot()).ballPosition, {
          timeout: 20_000,
        })
        .toEqual(RECEIVER);
      await shot(page, `${size}-pass-thrown`);
    });
  });
}

test("J and U press the second half from the keyboard", async ({ page }) => {
  const app = await open(page);
  await app.pitch.clickPlayer("team1:0");
  await expect(app.hud.actionMenu()).toBeVisible();
  await page.keyboard.press("j");
  await expect(page.getByTestId("action-step-jump")).toHaveAttribute(
    "data-active",
    "true"
  );
  await page.keyboard.press("j");
  await expect(page.getByTestId("action-step-move")).toHaveAttribute(
    "data-active",
    "true"
  );
  await page.getByRole("button", { name: "← Back" }).click();
  await app.pitch.clickPlayer("team1:1");
  await page.keyboard.press("u");
  await expect
    .poll(async () => (await app.bridge.snapshot()).activePlayer?.action)
    .toBe("move");
});
