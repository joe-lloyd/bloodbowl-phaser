/**
 * A failed Bloodlust roll owes a bite. A coach who clicks End Turn instead
 * of finishing the activation must still pay for not biting: a Turnover,
 * and Distracted (no Tackle Zone) into the opponent's turn. The sandbox case
 * fields the Bloodlust player alone, so they are the team's last player.
 */
import { test, expect } from "@playwright/test";
import { GameApp } from "../support/pages/game";

test("End Turn with a failed Bloodlust bite owed leaves the player Distracted", async ({
  page,
}) => {
  const app = new GameApp(page);
  // Seed 7 is the case's committed "thirst" seed: the Bloodlust roll fails
  await app.sandbox.open({
    scenario: "bloodlust-activation",
    seed: 7,
    outcome: "thirst",
  });
  const [team1] = await app.bridge.teams();

  await app.hud.declareAction("team1:0", "move");
  // The failed roll offers the switch to a Move; keep the declared Move
  await app.hud.answerReaction(false);

  // Walk away from the bite through the HUD's End Turn
  await app.hud.endTurn().click();

  await expect
    .poll(async () => (await app.bridge.snapshot()).activeTeamId)
    .not.toBe(team1.id);
  const vampire = (await app.bridge.snapshot()).teams[0].players[0];
  expect(vampire.conditions.map((c) => c.type)).toEqual(["Distracted"]);
});
