import { expect, test, type Page } from "@playwright/test";
import { GameApp } from "../support/pages/game";
import type { Square } from "../../src/game/variants/pitchLayouts";

const shot = (page: Page, name: string) =>
  page.screenshot({
    path: `${test.info().outputDir}/${name}.png`,
  });

const refs = (side: string) =>
  Array.from({ length: 7 }, (_, index) => `${side}:${String(index)}`);

async function openSquare(
  app: GameApp,
  ref: string,
  avoid: (square: Square) => boolean = () => false
): Promise<Square> {
  const squares = await Promise.all(
    [...refs("team1"), ...refs("team2")].map((each) => app.pitch.squareOf(each))
  );
  const from = await app.pitch.squareOf(ref);
  const steps = [
    [1, 0],
    [0, 1],
    [0, -1],
    [-1, 0],
    [1, 1],
    [-1, -1],
  ] as const;
  const open = steps
    .map(([dx, dy]) => ({ x: from.x + dx, y: from.y + dy }))
    .find(
      (to) =>
        to.y >= 0 &&
        to.y < 11 &&
        !avoid(to) &&
        squares.every((at) => !(at.x === to.x && at.y === to.y))
    );
  if (!open) throw new Error(`${ref} has no open square`);
  return open;
}

async function open(page: Page, query: string): Promise<GameApp> {
  const app = new GameApp(page);
  await page.goto(`/kickoff-playground?${query}`);
  await app.pitch.waitForCanvas(90_000);
  await expect(page.getByText(/Choose up to/)).toBeVisible({ timeout: 60_000 });
  await app.pitch.waitForCameraToSettle();
  return app;
}

async function walk(app: GameApp, ref: string): Promise<void> {
  const to = await openSquare(app, ref);
  await app.pitch.clickPlayer(ref);
  await app.hud.actionButton("move").click();
  await app.pitch.clickSquare(to);
  await app.pitch.clickSquare(to);
  await expect.poll(() => app.pitch.squareOf(ref)).toEqual(to);
}

test("Charge! plays all four picked players in the coach's own order", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const app = await open(page, "event=sevens.charge&players=4");
  for (const ref of ["team1:3", "team1:4", "team1:5", "team1:6"])
    await app.pitch.clickPlayer(ref);
  await expect(page.getByText("4/4 chosen")).toBeVisible();
  await shot(page, "charge-choose-four");

  const current = page.locator('[aria-current="step"]');
  await expect(current).toContainText("Press Start Charge!");
  await page.getByRole("button", { name: "Start Charge!" }).click();
  await expect(current).toContainText("Play each one, in any order");
  await expect(page.getByText("4 left", { exact: true })).toBeVisible();
  await shot(page, "charge-play-dimmed");

  await page.getByRole("button", { name: "Change picks" }).click();
  await app.pitch.clickPlayer("team1:3");
  await app.pitch.clickPlayer("team1:0");
  await page.getByRole("button", { name: "Start Charge!" }).click();

  await app.pitch.clickPlayer("team1:3");
  await expect(app.hud.actionMenu()).toBeHidden();

  for (const [index, ref] of [
    "team1:6",
    "team1:0",
    "team1:5",
    "team1:4",
  ].entries()) {
    await walk(app, ref);
    await page.getByRole("button", { name: /end activation/i }).click();
    if (index < 3)
      expect(await app.bridge.pitchLayers()).toContain("kick_target");
    if (index !== 0) {
      continue;
    }

    await expect(page.getByText("3 left", { exact: true })).toBeVisible();
    await shot(page, "charge-one-played");
  }
  await expect
    .poll(async () => (await app.bridge.phase()).phase, { timeout: 30_000 })
    .toBe("PLAY");
  expect(await app.bridge.pitchLayers()).not.toContain("kick_target");
  await app.pitch.clickPlayer("team2:3");
  await expect(app.hud.actionButton("move")).toBeVisible({ timeout: 15_000 });
  await shot(page, "charge-then-receiving-turn");
});

test("the End button closes a Charge early, and Restart starts it over", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const app = await open(page, "event=sevens.charge&players=3&kicking=team2");
  await app.pitch.clickPlayer("team2:4");
  await app.pitch.clickPlayer("team2:5");
  await page.getByRole("button", { name: "Start Charge!" }).click();
  await walk(app, "team2:5");
  await page.getByTestId("end-turn").click();
  await expect
    .poll(async () => (await app.bridge.phase()).phase, { timeout: 30_000 })
    .toBe("PLAY");
  await page.getByRole("button", { name: "Restart" }).click();
  await expect(page.getByText(/Choose up to 3 ringed players/)).toBeVisible({
    timeout: 30_000,
  });
});

test("Quick Snap gives the receiving coach the same choose-then-play turn", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const app = await open(page, "event=sevens.quick-snap&players=2");
  await app.pitch.clickPlayer("team2:4");
  await app.pitch.clickPlayer("team2:5");
  await page.getByRole("button", { name: "Start Quick Snap" }).click();
  for (const ref of ["team2:5", "team2:4"]) {
    const to = await openSquare(app, ref);
    await app.pitch.clickPlayer(ref);
    await shot(page, `quick-snap-${ref.replace(":", "-")}`);
    await app.pitch.clickSquare(to);
    await expect.poll(() => app.pitch.squareOf(ref)).toEqual(to);
  }
  await expect
    .poll(async () => (await app.bridge.phase()).phase, { timeout: 30_000 })
    .toBe("PLAY");
});

for (const id of [
  "street-bowl.blitz",
  "beach-bowl.charge",
  "gutter-street.quick-attack",
  "gutter-sewer.get-ready-lads",
  "sevens.alert-defence",
])
  test(`${id} opens on its own board`, async ({ page }) => {
    test.setTimeout(240_000);
    await open(page, `event=${id}`);
    await shot(page, `playground-${id}`);
  });

test("High Kick opens on a landing square the receivers can reach", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const app = new GameApp(page);
  await page.goto("/kickoff-playground?event=sevens.high-kick");
  await app.pitch.waitForCanvas(90_000);
  await expect(page.getByText(/to stand under the ball/)).toBeVisible({
    timeout: 30_000,
  });
  await shot(page, "playground-high-kick");
});

test("the playground opens from the main menu", async ({ page }) => {
  const app = new GameApp(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Kick-off Playground" }).click();
  await app.pitch.waitForCanvas(90_000);
  await expect(page.getByTestId("kickoff-playground")).toBeVisible();
  await page.getByRole("button", { name: "Change event" }).click();
  await shot(page, "playground-options");
  await page.getByLabel("Event").selectOption("sevens.quick-snap");
  await expect(page).toHaveURL(/event=sevens\.quick-snap/);
});
