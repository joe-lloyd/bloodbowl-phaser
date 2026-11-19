import { fixtureValue } from "../../src/testing/fixtureValue";
import { test, expect } from "@playwright/test";
import { GameEventNames } from "../../src/types/events";
import { GameApp } from "../support/pages/game";
import { recordBrowserCoverage } from "../support/coverageFragments";

const ATTRIBUTION = "movement-unopposed-walk";

test.describe("rule interaction shapes", () => {
  test("shape 1: a plain action is declared from the HUD menu", async ({
    page,
  }) => {
    const app = new GameApp(page);
    await app.sandbox.open({ scenario: "movement-test", seed: 1 });

    await app.pitch.clickPlayer("team1:0");
    await expect(app.hud.actionMenu()).toBeVisible();

    await app.hud.actionButton("move").click();
    await expect
      .poll(async () => (await app.bridge.snapshot()).activePlayer?.action)
      .toBe("move");
  });

  test("shape 2: an action that targets a square (Pass)", async ({ page }) => {
    const app = new GameApp(page);
    await app.sandbox.open({ scenario: "throw-quick-pass", seed: 1 });

    const snapshot = await app.bridge.snapshot();
    const thrower = fixtureValue(snapshot.teams[0]).players.find(
      (player) =>
        player.position &&
        snapshot.ballPosition &&
        player.position.x === snapshot.ballPosition.x &&
        player.position.y === snapshot.ballPosition.y
    );
    expect(thrower, "the scenario should start with a carrier").toBeDefined();

    await app.pitch.clickSquare(fixtureValue(fixtureValue(thrower).position));
    await expect(app.hud.actionMenu()).toBeVisible();
    await app.hud.actionButton("pass").click();

    await app.hud.selectActionStep("pass");

    const receiver = fixtureValue(fixtureValue(snapshot.teams[0]).players.find(
      (player) => player.position && player.id !== fixtureValue(thrower).id
    ));
    await app.pitch.clickSquare(fixtureValue(receiver.position));

    await expect
      .poll(async () =>
        (await app.bridge.events()).some(
          (event) => event.name === GameEventNames.PassAttempted
        )
      )
      .toBe(true);
  });

  test("shape 3: an action that targets a player (Block)", async ({ page }) => {
    const app = new GameApp(page);
    await app.sandbox.open({ scenario: "chain-push", seed: 1 });

    await app.hud.declareAction("team1:0", "block");
    await app.pitch.clickPlayer("team2:0");

    await expect(app.hud.blockDiceDialog()).toBeVisible();

    recordBrowserCoverage(ATTRIBUTION, "shape-block", [
      "protocol-command:declare-action",
      "protocol-command:block",
    ]);
  });

  test("shape 4: a Block replacement is declared (Chainsaw)", async ({
    page,
  }) => {
    const app = new GameApp(page);

    await app.sandbox.open({ scenario: "chainsaw-loony", seed: 1 });

    const snapshot = await app.bridge.snapshot();
    const loony = fixtureValue(snapshot.teams[0]).players.find((player) =>
      player.skills.includes("Chainsaw")
    );
    expect(loony, "the scenario should field a Chainsaw player").toBeDefined();

    await app.pitch.clickSquare(fixtureValue(fixtureValue(loony).position));
    await expect(app.hud.actionMenu()).toBeVisible();

    const chainsaw = page
      .getByTestId("player-action-menu")
      .getByRole("button", { name: /chainsaw/i })
      .first();
    await expect(chainsaw).toBeVisible();
    await chainsaw.click();

    await expect
      .poll(async () => (await app.bridge.snapshot()).activePlayer?.id)
      .toBe(fixtureValue(loony).id);
  });

  test("shapes 5 and 6: a dice dialog and a yes/no prompt", async ({
    page,
  }) => {
    const app = new GameApp(page);
    await app.sandbox.open({ scenario: "chain-push", seed: 1 });

    await app.hud.declareAction("team1:0", "block");
    await app.pitch.clickPlayer("team2:0");

    await app.hud.rollBlockDice();
    await app.hud.chooseBlockDie(0);

    const followUp = app.hud.followUpDialog();
    const offered = await followUp
      .waitFor({ state: "visible", timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    const claims = [
      "protocol-command:choose-block-result",
      "decision:block-dice",
    ];
    if (offered) {
      await app.hud.answerFollowUp(true);
      await expect(followUp).toBeHidden();
      claims.push("decision:follow-up", "protocol-command:choose-follow-up");
    }

    await expect(app.hud.blockDiceDialog()).toBeHidden();
    recordBrowserCoverage(ATTRIBUTION, "shape-dialogs", claims);
  });
});
