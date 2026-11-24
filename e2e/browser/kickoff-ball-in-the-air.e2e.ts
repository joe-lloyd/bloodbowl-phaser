import { fixtureValue } from "../../src/testing/fixtureValue";
import { test, expect } from "@playwright/test";
import { GameApp } from "../support/pages/game";

const TARGET = { x: Number(process.env["KICK_X"] ?? 10), y: 5 };

test("a charger under the airborne ball rolls no Pick up, then Catches it", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const shots = process.env["SHOTS"] ?? test.info().outputDir;
  const app = new GameApp(page);
  await app.sandbox.open({
    scenario: "kickoff-table-standard",
    seed: 2,
    outcome: "charge",
  });
  await app.pitch.waitForCameraToSettle();
  await app.pitch.clickPlayer("team1:0");
  await app.pitch.clickSquare(TARGET);
  await app.rollKickoff();
  const charge = page.getByRole("button", { name: /charge!/i });
  await expect(charge).toBeVisible({ timeout: 30_000 });

  expect(await app.bridge.pitchLayers()).toContain("kick_target");

  const before = await app.bridge.snapshot();
  const landing = fixtureValue(before.ballPosition);
  expect(landing).not.toBeNull();
  const kickers = fixtureValue(before.teams.find((t) => t.id === fixtureValue(before.teams[0]).id));
  const reach = kickers.players
    .map((p, i) => ({ ref: `team1:${String(i)}`, p }))
    .filter(({ p, ref }) => ref !== "team1:0" && p.position)
    .map(({ ref, p }) => ({
      ref,
      name: p.name,
      ma: p.stats.MA,
      steps: Math.max(
        Math.abs(fixtureValue(p.position).x - landing.x),
        Math.abs(fixtureValue(p.position).y - landing.y)
      ),
    }))
    .sort((a, b) => a.steps - b.steps);
  console.log(
    `landing ${JSON.stringify(landing)}; nearest ${JSON.stringify(reach[0])}`
  );
  const charger = reach.find((r) => r.steps <= r.ma);
  expect(
    charger,
    "a charger reaches the landing square without a Rush"
  ).toBeTruthy();

  await app.pitch.clickPlayer(fixtureValue(charger).ref);
  await charge.click();
  await app.pitch.clickPlayer(fixtureValue(charger).ref);
  await expect(app.hud.actionMenu()).toBeVisible({ timeout: 10_000 });
  await app.hud.actionButton("move").click();

  await app.pitch.clickSquare(landing);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${shots}/route-under-airborne-ball.png` });
  await expect(page.getByText(/pick ?up/i)).toHaveCount(0);

  await app.pitch.clickSquare(landing);
  await expect.poll(() => app.pitch.squareOf(fixtureValue(charger).ref)).toEqual(landing);
  await expect(page.getByText(/pick ?up/i)).toHaveCount(0);
  expect((await app.bridge.snapshot()).ballPosition).toEqual(landing);
  expect((await app.bridge.phase()).phase).toBe("KICKOFF");
  await page.screenshot({ path: `${shots}/charger-under-airborne-ball.png` });
  await page.getByRole("button", { name: /end activation/i }).click();

  await expect
    .poll(async () => (await app.bridge.phase()).phase, { timeout: 20_000 })
    .toBe("PLAY");
  expect(await app.bridge.pitchLayers()).not.toContain("kick_target");
  const rolls = (await app.bridge.events())
    .filter((e) => e.name === "diceRoll")
    .map((e) => (e.data as { rollType: string }).rollType);
  console.log(`rolls: ${JSON.stringify(rolls)}`);
  expect(rolls).toContain(`Catch (${fixtureValue(charger).name})`);
  expect(rolls.filter((r) => r.startsWith("Pickup"))).toEqual([]);
  await page.screenshot({ path: `${shots}/charger-catches-on-landing.png` });
});
