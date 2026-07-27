/**
 * Browser representatives for the rule catalog's UI interaction shapes.
 *
 * The catalog has ~150 configurations and ~190 outcomes. Running them all
 * through Chromium would multiply the suite's cost to prove the same
 * *engine* behaviour twice — the engine lane already owns every seed
 * permutation. What the browser genuinely adds is the input path: how a
 * coach reaches each kind of action at all.
 *
 * So this file covers one representative per distinct shape:
 *
 *   1. declare a plain action from the menu           (Move)
 *   2. act on a target square                         (Pass)
 *   3. act on a target player                         (Block)
 *   4. declare a Block replacement                    (Chainsaw)
 *   5. answer a rolled-dice dialog                    (block dice)
 *   6. answer a yes/no reactive prompt                (follow-up)
 *
 * A rule whose UI shape is already in this list needs no browser case; a
 * rule that introduces a *new* shape does.
 */

import { test, expect } from "@playwright/test";
import { GameEventNames } from "../../src/types/events";
import { GameApp } from "../support/pages/game";
import { recordBrowserCoverage } from "../support/coverageFragments";

/**
 * These specs drive the UI directly rather than replaying a scenario case,
 * so they state what they proved. The attribution case is the movement case
 * they most resemble, which keeps the fragment joinable with the rest of the
 * report.
 */
const ATTRIBUTION = "movement-unopposed-walk";

test.describe("rule interaction shapes", () => {
  test("shape 1: a plain action is declared from the HUD menu", async ({
    page,
  }) => {
    const app = new GameApp(page);
    await app.sandbox.open({ scenario: "movement-test", seed: 1 });

    await app.pitch.clickPlayer("team1:0");
    await expect(app.hud.actionMenu()).toBeVisible();
    // The menu is contextual: Move is offered for a standing, unactivated
    // player, and clicking it declares the action in the engine.
    await app.hud.actionButton("move").click();
    await expect
      .poll(async () => (await app.bridge.snapshot()).activePlayer?.action)
      .toBe("move");
  });

  test("shape 2: an action that targets a square (Pass)", async ({ page }) => {
    const app = new GameApp(page);
    await app.sandbox.open({ scenario: "throw-quick-pass", seed: 1 });

    const snapshot = await app.bridge.snapshot();
    const thrower = snapshot.teams[0].players.find(
      (player) =>
        player.position &&
        snapshot.ballPosition &&
        player.position.x === snapshot.ballPosition.x &&
        player.position.y === snapshot.ballPosition.y
    );
    expect(thrower, "the scenario should start with a carrier").toBeDefined();

    // Declaring a Pass puts the HUD into target-selection: the next canvas
    // click is the destination square, not a player selection.
    await app.pitch.clickSquare(thrower!.position!);
    await expect(app.hud.actionMenu()).toBeVisible();
    await app.hud.actionButton("pass").click();

    // A Pass is a two-step action — Move, then Pass. Until the Pass step is
    // selected a canvas click plans movement instead of aiming the throw.
    await app.hud.selectActionStep("pass");

    const receiver = snapshot.teams[0].players.find(
      (player) => player.position && player.id !== thrower!.id
    )!;
    await app.pitch.clickSquare(receiver.position!);

    // The throw really happened: the engine rolled for it.
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
    // The Goblin Loony carries Chainsaw on the roster, so this is the real
    // special action rather than a granted one.
    await app.sandbox.open({ scenario: "chainsaw-loony", seed: 1 });

    const snapshot = await app.bridge.snapshot();
    const loony = snapshot.teams[0].players.find((player) =>
      player.skills.includes("Chainsaw")
    );
    expect(loony, "the scenario should field a Chainsaw player").toBeDefined();

    await app.pitch.clickSquare(loony!.position!);
    await expect(app.hud.actionMenu()).toBeVisible();

    // A Block replacement gets its own menu entry, not a generic Block.
    const chainsaw = page
      .getByTestId("player-action-menu")
      .getByRole("button", { name: /chainsaw/i })
      .first();
    await expect(chainsaw).toBeVisible();
    await chainsaw.click();

    await expect
      .poll(async () => (await app.bridge.snapshot()).activePlayer?.id)
      .toBe(loony!.id);
  });

  test("shapes 5 and 6: a dice dialog and a yes/no prompt", async ({
    page,
  }) => {
    const app = new GameApp(page);
    await app.sandbox.open({ scenario: "chain-push", seed: 1 });

    await app.hud.declareAction("team1:0", "block");
    await app.pitch.clickPlayer("team2:0");

    // Shape 5: roll, then pick a face.
    await app.hud.rollBlockDice();
    await app.hud.chooseBlockDie(0);

    // Shape 6: a yes/no prompt, when the result raises one.
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
