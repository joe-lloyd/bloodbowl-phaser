/**
 * Stalling (2025 rulebook p.80), played on the board: a ball carrier who
 * could walk in without a die ends the activation, and the crowd rolls a D6
 * against the Turn number. The sandbox case is on Turn 5.
 */
import { test, expect } from "@playwright/test";
import { GameEventNames } from "../../src/types/events";
import { GameApp } from "../support/pages/game";

const crowdRolls = async (app: GameApp) =>
  (await app.bridge.events())
    .filter((e) => e.name === GameEventNames.DiceRoll)
    .map((e) => (e.data as { description: string }).description)
    .filter((d) => d.startsWith("Crowd Takes Action"));

test("the crowd knocks a Stalling carrier down on a roll of the Turn number or more", async ({
  page,
}) => {
  const app = new GameApp(page);
  // Seed 2 is the case's committed "crowd-hits" seed: the crowd rolls a 5
  await app.sandbox.open({
    scenario: "stalling-crowd-takes-action",
    seed: 2,
    outcome: "crowd-hits",
  });
  const [team1] = await app.bridge.teams();

  await app.hud.declareAction("team1:0", "move");
  await page.getByTestId("action-end-activation").click();

  await expect.poll(() => crowdRolls(app)).toEqual([
    "Crowd Takes Action (Human Lineman #1): 5",
  ]);
  await page.screenshot({ path: test.info().outputPath("stalling-crowd-hits.png") });
  await expect
    .poll(async () => (await app.bridge.snapshot()).activeTeamId)
    .not.toBe(team1.id);
  const snapshot = await app.bridge.snapshot();
  const carrier = snapshot.teams[0].players[0];
  expect(carrier.status).toBe("Prone");
  expect(snapshot.stallingPlayerIds).toEqual([carrier.id]);
  await page.screenshot({ path: test.info().outputPath("stalling-turnover.png") });
});

test("a Stalling carrier the crowd misses keeps the ball and the turn goes on", async ({
  page,
}) => {
  const app = new GameApp(page);
  // Seed 1 is the case's committed "crowd-misses" seed: the crowd rolls a 4
  await app.sandbox.open({
    scenario: "stalling-crowd-takes-action",
    seed: 1,
    outcome: "crowd-misses",
  });
  const [team1] = await app.bridge.teams();

  await app.hud.declareAction("team1:0", "move");
  await page.getByTestId("action-end-activation").click();

  await expect.poll(() => crowdRolls(app)).toEqual([
    "Crowd Takes Action (Human Lineman #1): 4",
  ]);
  const snapshot = await app.bridge.snapshot();
  expect(snapshot.activeTeamId).toBe(team1.id);
  expect(snapshot.teams[0].players[0].status).toBe("Active");
  expect(snapshot.ballPosition).toEqual({ x: 15, y: 5 });
  await page.screenshot({ path: test.info().outputPath("stalling-crowd-misses.png") });
});
