import { fixtureValue } from "../../src/testing/fixtureValue";
import { test, expect } from "@playwright/test";
import { GameApp } from "../support/pages/game";
import { SECURE_BALL_CASES } from "../../src/testing/cases/secure-the-ball";
import { assertBrowserCheckpoints } from "../support/browserRunner";
import { recordCoverageFragment } from "../support/coverageFragments";

test("Secure the Ball moves onto the ball with one unnumbered action and the right roll", async ({
  page,
}) => {
  const app = new GameApp(page);
  await app.sandbox.open({ scenario: "secure-ball-move-to-ball", seed: 9 });
  const initialSnapshot = await app.bridge.snapshot();
  const startEvents = await app.bridge.events();
  const eventsBeforeSteps = startEvents.length;
  await app.pitch.waitForCameraToSettle();
  await app.pitch.clickPlayer("team1:0");
  await app.hud.actionButton("secureBall").click();
  await expect(page.getByTestId("action-step-move")).toContainText(
    "Move to secure the ball"
  );
  await expect(page.getByTestId("action-step-move")).not.toContainText(/\d/);
  await expect(page.getByTestId("action-step-secure")).toHaveCount(0);
  await app.pitch.waitForCameraToSettle();
  await app.pitch.clickSquare({ x: 7, y: 5 });
  await expect(page.getByTestId("route-rolls")).toHaveText(
    "Secure the Ball 2+"
  );
  await expect(page.getByTestId("action-plan")).toContainText(
    "Secure the Ball 2+"
  );
  await expect(page.getByTestId("action-plan")).not.toContainText("Sure Hands");
  await app.pitch.clickSquare({ x: 7, y: 5 });
  await expect
    .poll(async () => {
      const snapshot = await app.bridge.snapshot();
      return snapshot.turn.activatedPlayerIds.includes(
        fixtureValue(fixtureValue(snapshot.teams[0]).players[0]).id
      );
    })
    .toBe(true);
  const snapshotAfter = await app.bridge.snapshot();
  expect(fixtureValue(fixtureValue(snapshotAfter.teams[0]).players[0]).position).toEqual({
    x: 7,
    y: 5,
  });
  const diceEvents = await app.bridge.events();
  const dice = diceEvents
    .filter((e) => e.name === "diceRoll")
    .map((e) => (e.data as { description: string }).description);
  expect(dice).toEqual(["Secure the Ball (Human Lineman #1): 2, needs 2+"]);
  const observed = {
    layer: "browser" as const,
    initialSnapshot,
    snapshot: await app.bridge.snapshot(),
    events: await app.bridge.events(eventsBeforeSteps),
    decisions: [],
    responses: [],
  };
  const scenarioCase = SECURE_BALL_CASES[0];
  const variant = fixtureValue(scenarioCase).variants[0];
  assertBrowserCheckpoints(test.info(), fixtureValue(scenarioCase), fixtureValue(variant), observed);
  recordCoverageFragment(fixtureValue(scenarioCase), fixtureValue(variant).id, observed);
});
