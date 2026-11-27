import { fixtureValue } from "../../src/testing/fixtureValue";
import { test, expect } from "@playwright/test";
import { GameApp } from "../support/pages/game";

test("End Turn with a failed Bloodlust bite owed leaves the player Distracted", async ({
  page,
}) => {
  const app = new GameApp(page);

  await app.sandbox.open({
    scenario: "bloodlust-activation",
    seed: 7,
    outcome: "thirst",
  });
  const [team1] = await app.bridge.teams();

  await app.hud.declareAction("team1:0", "move");

  await app.hud.answerReaction(false);

  await app.hud.endTurn().click();

  await expect
    .poll(async () => {
      const snapshot = await app.bridge.snapshot();
      return snapshot.activeTeamId;
    })
    .not.toBe(team1.id);
  const snapshot = await app.bridge.snapshot();
  const vampire = fixtureValue(snapshot.teams[0]).players[0];
  expect(fixtureValue(vampire).conditions.map((c) => c.type)).toEqual(["Distracted"]);
});
