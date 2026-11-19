import { fixtureValue } from "../../src/testing/fixtureValue";
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

  await app.sandbox.open({
    scenario: "stalling-crowd-takes-action",
    seed: 2,
    outcome: "crowd-hits",
  });
  const [team1] = await app.bridge.teams();

  await app.hud.declareAction("team1:0", "move");
  await page.getByTestId("action-end-activation").click();

  await expect
    .poll(() => crowdRolls(app))
    .toEqual(["Crowd Takes Action (Human Lineman #1): 5"]);
  await page.screenshot({
    path: test.info().outputPath("stalling-crowd-hits.png"),
  });
  await expect
    .poll(async () => (await app.bridge.snapshot()).activeTeamId)
    .not.toBe(team1.id);
  const snapshot = await app.bridge.snapshot();
  const carrier = fixtureValue(snapshot.teams[0]).players[0];
  expect(fixtureValue(carrier).status).toBe("Prone");
  expect(snapshot.stallingPlayerIds).toEqual([fixtureValue(carrier).id]);
  await page.screenshot({
    path: test.info().outputPath("stalling-turnover.png"),
  });
});

test("a Stalling carrier the crowd misses keeps the ball and the turn goes on", async ({
  page,
}) => {
  const app = new GameApp(page);

  await app.sandbox.open({
    scenario: "stalling-crowd-takes-action",
    seed: 1,
    outcome: "crowd-misses",
  });
  const [team1] = await app.bridge.teams();

  await app.hud.declareAction("team1:0", "move");
  await page.getByTestId("action-end-activation").click();

  await expect
    .poll(() => crowdRolls(app))
    .toEqual(["Crowd Takes Action (Human Lineman #1): 4"]);
  const snapshot = await app.bridge.snapshot();
  expect(snapshot.activeTeamId).toBe(team1.id);
  expect(fixtureValue(fixtureValue(snapshot.teams[0]).players[0]).status).toBe("Active");
  expect(snapshot.ballPosition).toEqual({ x: 15, y: 5 });
  await page.screenshot({
    path: test.info().outputPath("stalling-crowd-misses.png"),
  });
});
