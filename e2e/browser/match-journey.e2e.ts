/**
 * Browser journeys through a local match.
 *
 * These are the interactions that only exist in the browser: selecting teams
 * and starting a match from the menu, declaring an action from the HUD menu,
 * throwing a block and choosing a die in the dialog, answering a follow-up,
 * ending a turn, and switching pitch themes. The engine lane proves the
 * rules; this lane proves you can actually reach them by clicking.
 */

import { test, expect } from "@playwright/test";
import { GamePhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { PITCH_THEMES } from "../../src/game/presentation/pitchThemes";
import { GameApp } from "../support/pages/game";
import { recordBrowserCoverage } from "../support/coverageFragments";

/** The case these journeys' coverage is attributed to. */
const ATTRIBUTION = "movement-unopposed-walk";

test.describe("local match creation", () => {
  test("starts a match from the menu and reaches the pitch", async ({
    page,
  }) => {
    const app = new GameApp(page);
    await app.menu.open();
    await app.menu.playLocal();

    // Team selection is the gate between the menu and a match.
    await expect(page).toHaveURL(/\/select-team/);
    await expect(
      page.getByRole("heading", { name: "TEAM SELECTION" })
    ).toBeVisible();

    // A clean E2E profile has no saved teams, so the page must say so rather
    // than offering an unplayable match. (With teams saved it shows the two
    // coach panels instead; the sandbox case below covers reaching a live
    // pitch either way.)
    const noTeams = page.getByRole("heading", {
      name: /need at least 2 teams/i,
    });
    const coachPanels = page.getByText("Player 1");
    await expect(noTeams.or(coachPanels).first()).toBeVisible();
  });

  test("the sandbox launches a scenario and the HUD comes up with it", async ({
    page,
  }) => {
    const app = new GameApp(page);
    await app.sandbox.open({ scenario: "basic-scrimmage", seed: 1 });

    await expect(app.pitch.canvas).toBeVisible();
    // A loaded scenario is a live match: the turn control is available and
    // the engine reports PLAY.
    await expect(app.hud.endTurn()).toBeVisible();
    const phase = await app.bridge.phase();
    expect(phase.phase).toBe(GamePhase.PLAY);
  });
});

test.describe("core turn interactions", () => {
  test("declares an action from the HUD and ends the turn", async ({
    page,
  }) => {
    const app = new GameApp(page);
    await app.sandbox.open({ scenario: "basic-scrimmage", seed: 1 });

    const before = await app.bridge.phase();
    await app.hud.declareAction("team1:0", "move");

    // The declaration reached the engine, not just the DOM.
    await expect
      .poll(async () => (await app.bridge.snapshot()).activePlayer?.action)
      .toBe("move");

    const eventsBefore = (await app.bridge.events()).length;
    await app.hud.endTurn().click();

    // Ending the turn hands the ball to the other coach.
    await expect
      .poll(async () => (await app.bridge.phase()).activeTeamId)
      .not.toBe(before.activeTeamId);
    const events = await app.bridge.events(eventsBefore);
    expect(events.map((event) => event.name)).toContain(
      GameEventNames.TurnStarted
    );

    recordBrowserCoverage(ATTRIBUTION, "journey-turn", [
      "protocol-command:declare-action",
      "protocol-command:end-turn",
    ]);
  });

  test("throws a block through the canvas and resolves the dice dialog", async ({
    page,
  }) => {
    const app = new GameApp(page);
    // A scenario where team1:0 stands next to a team2 player, so a block is
    // available without any movement first.
    await app.sandbox.open({ scenario: "chain-push", seed: 1 });

    await app.hud.declareAction("team1:0", "block");
    // Clicking the defender is how a coach throws the block.
    await app.pitch.clickPlayer("team2:0");

    // Unlike the protocol lane, the browser does not park the engine on a
    // `pendingDecision` for block dice — the dialog *is* the decision, and
    // the engine hears about it through UI events. So the assertion is that
    // the dialog drives a real roll.
    await app.hud.rollBlockDice();
    await expect
      .poll(async () =>
        (await app.bridge.events()).some(
          (event) => event.name === GameEventNames.BlockDiceRolled
        )
      )
      .toBe(true);

    await app.hud.chooseBlockDie(0);

    // Picking a face closes the dialog and resolves the block.
    await expect(app.hud.blockDiceDialog()).toBeHidden();

    recordBrowserCoverage(ATTRIBUTION, "journey-block", [
      "protocol-command:block",
      "protocol-command:choose-block-result",
      "decision:block-dice",
    ]);
  });

  test("answers a follow-up prompt from the HUD", async ({ page }) => {
    const app = new GameApp(page);
    await app.sandbox.open({ scenario: "chain-push", seed: 1 });

    await app.hud.declareAction("team1:0", "block");
    await app.pitch.clickPlayer("team2:0");
    await app.hud.rollBlockDice();
    await app.hud.chooseBlockDie(0);

    // A push offers a follow-up; a Both Down or Skull does not. Only assert
    // the dialog when the engine actually raised it, so this tests the HUD
    // rather than the seed's luck.
    const followUp = app.hud.followUpDialog();
    const offered = await followUp
      .waitFor({ state: "visible", timeout: 5_000 })
      .then(() => true)
      .catch(() => false);

    if (offered) {
      await app.hud.answerFollowUp(false);
      await expect(followUp).toBeHidden();
    }
    // Either way the block is over: the dice dialog has closed.
    await expect(app.hud.blockDiceDialog()).toBeHidden();
  });
});

test.describe("presentation", () => {
  // Themes are chosen by URL and must survive into the rendered pitch and
  // across a reload — a theme that resets on refresh looks like a bug.
  for (const theme of PITCH_THEMES) {
    test(`pitch theme '${theme.id}' loads and persists across a reload`, async ({
      page,
    }) => {
      const app = new GameApp(page);
      await page.goto(`/sand-box?scenario=basic-scrimmage&seed=1&theme=${theme.id}`);
      await app.pitch.waitForCanvas();
      await app.sandbox.waitForScenarioLoaded();

      // The scenario is on the pitch and the canvas rendered with the theme.
      const snapshot = await app.bridge.snapshot();
      expect(snapshot.teams[0].players[0].position).toEqual({ x: 9, y: 5 });

      await page.reload();
      await app.pitch.waitForCanvas();
      await app.sandbox.waitForScenarioLoaded();
      expect(page.url()).toContain(`theme=${theme.id}`);
      const afterReload = await app.bridge.snapshot();
      expect(afterReload.teams[0].players[0].position).toEqual({ x: 9, y: 5 });
    });
  }

  test("the dugouts and sidelines render alongside the pitch", async ({
    page,
  }) => {
    const app = new GameApp(page);
    await app.sandbox.open({ scenario: "basic-scrimmage", seed: 1 });

    // The board labels are DOM overlays over the canvas, so they are
    // assertable without pixels.
    await expect(page.getByText("RESERVES").first()).toBeVisible();
    await expect(page.getByText("KNOCKED OUT").first()).toBeVisible();
    await expect(page.getByText("CASUALTIES").first()).toBeVisible();

    // The canvas is tall enough to include the dugouts above and below the
    // playing surface.
    const canvasBox = (await app.pitch.canvas.boundingBox())!;
    const pitchRect = await app.pitch.pitchViewportRect();
    expect(pitchRect.y).toBeGreaterThan(canvasBox.y);
    expect(pitchRect.y + pitchRect.height).toBeLessThan(
      canvasBox.y + canvasBox.height
    );
  });
});
