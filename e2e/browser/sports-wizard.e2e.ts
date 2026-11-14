/**
 * Magic Scroll (Spike! Journal 22, L28) gives the home team a free
 * Sports-Wizard. Ending the turn offers its spell before the away team's
 * turn begins: here the coach aims Zap! at the ball carrier by clicking
 * them on the pitch, and Fireball is shown aimed beside the huddle.
 */
import { test, expect, Page } from "@playwright/test";
import { GameApp } from "../support/pages/game";

const shot = (name: string) =>
  `${process.env.SHOTS ?? test.info().outputDir}/${name}.png`;

async function openAndEndTurn(app: GameApp, page: Page) {
  await app.sandbox.open({ scenario: "sports-wizard-spells" });
  await app.pitch.waitForCameraToSettle();
  await app.hud.endTurn().click();
  const dialog = page.getByTestId("sports-wizard-dialog");
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  return dialog;
}

test("the Sports-Wizard's Zap! is aimed by clicking a player", async ({
  page,
}) => {
  const app = new GameApp(page);
  const dialog = await openAndEndTurn(app, page);
  const away = (await app.bridge.teams())[1].id;
  await expect(dialog).toContainText("Sports-Wizard: cast a spell?");
  await expect(dialog).toContainText("4+");
  await expect(dialog).not.toContainText("%");
  await page.screenshot({ path: shot("sports-wizard-offer") });

  await page.getByTestId("spell-zap").click();
  await expect(dialog).toContainText("Zap!: click the player to zap");
  await page.screenshot({ path: shot("sports-wizard-zap-aim") });
  const target = await app.bridge.resolveRef("team2:0");
  await app.pitch.clickPlayer("team2:0");

  await expect(dialog).toBeHidden({ timeout: 15_000 });
  // The away team's turn has begun, and the wizard has cast its one spell
  await expect
    .poll(async () => (await app.bridge.snapshot()).activeTeamId, {
      timeout: 15_000,
    })
    .toBe(away);
  const events = await app.bridge.events();
  const zap = events.find(
    (e) =>
      e.name === "diceRoll" &&
      String((e.data as { rollType?: string }).rollType).startsWith("Zap!")
  );
  expect(zap, "Zap! rolled its D6").toBeTruthy();
  // Seed 3 rolls the Zap! at or over the Lineman's ST 3: a Frog, and the
  // ball they carried Bounces off their square
  await expect
    .poll(
      async () => {
        const snapshot = await app.bridge.snapshot();
        const frog = snapshot.teams[1].players.find((p) => p.id === target)!;
        return {
          conditions: frog.conditions.map((c) => c.type),
          stats: frog.stats,
          ballLeft:
            snapshot.ballPosition?.x !== frog.position?.x ||
            snapshot.ballPosition?.y !== frog.position?.y,
        };
      },
      { timeout: 15_000 }
    )
    .toEqual({
      conditions: ["Frog"],
      stats: { MA: 5, ST: 1, AG: 2, PA: 0, AV: 5 },
      ballLeft: true,
    });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: shot("sports-wizard-after-zap") });
});

test("Fireball shows its blast and is cast at the clicked square", async ({
  page,
}) => {
  const app = new GameApp(page);
  const dialog = await openAndEndTurn(app, page);
  const away = (await app.bridge.teams())[1].id;
  await page.getByTestId("spell-fireball").click();
  await expect(dialog).toContainText("Fireball: click the square to aim at");
  const aim = { x: 12, y: 5 };
  await app.pitch.hoverSquare(aim);
  await expect
    .poll(async () => (await app.bridge.pitchHighlights()).length)
    .toBeGreaterThanOrEqual(9);
  await page.screenshot({ path: shot("sports-wizard-fireball-aim") });
  await app.pitch.clickSquare(aim);

  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await expect
    .poll(async () => (await app.bridge.snapshot()).activeTeamId, {
      timeout: 20_000,
    })
    .toBe(away);
  const rolls = (await app.bridge.events())
    .filter((e) => e.name === "diceRoll")
    .map((e) => String((e.data as { rollType?: string }).rollType));
  expect(rolls.filter((r) => r.startsWith("Fireball"))).toHaveLength(3);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: shot("sports-wizard-after-fireball") });
});
