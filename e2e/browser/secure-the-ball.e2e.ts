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
  const eventsBeforeSteps = (await app.bridge.events()).length;
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
  await app.pitch.clickSquare({ x: 7, y: 5 });
  await expect(
    page.getByRole("heading", { name: "Human Lineman #1: Secure the Ball" })
  ).toBeVisible();
  await expect(
    page.getByText(/Secure the Ball: 2\+\. A fail is a turnover\./)
  ).toBeVisible();
  await expect(page.getByText(/Sure Hands re-roll/)).toHaveCount(0);
  await page
    .getByRole("button", { name: "Secure the Ball!", exact: true })
    .click();
  await expect
    .poll(async () => {
      const snapshot = await app.bridge.snapshot();
      return snapshot.turn.activatedPlayerIds.includes(
        fixtureValue(fixtureValue(snapshot.teams[0]).players[0]).id
      );
    })
    .toBe(true);
  expect(fixtureValue(fixtureValue((await app.bridge.snapshot()).teams[0]).players[0]).position).toEqual({
    x: 7,
    y: 5,
  });
  const dice = (await app.bridge.events())
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
