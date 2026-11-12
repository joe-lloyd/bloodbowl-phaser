/**
 * A failed Bloodlust player beside two Thrall Linemen: the coach chooses
 * who to bite. The game says so, marks both Thralls on the pitch, ignores
 * clicks on anyone else, and bites the Thrall the coach clicks. Covers both
 * places a bite is settled, ending the activation and End Turn with the
 * bite still owed, and that a lone Thrall is still the yes/no question.
 *
 * The sandbox case "bloodlust-bite-choice" puts the biter (team1:0) at
 * (10,5) with Thralls team1:1 at (11,5) and team1:2 at (10,6), and team1:3
 * far away. Seed 7 is its committed "thirst" seed: the Bloodlust roll fails.
 */
import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { GameApp } from "../support/pages/game";

const prompt = (page: Page) => page.getByTestId("bite-target-prompt");

async function failBesideTwoThralls(page: Page) {
  const app = new GameApp(page);
  await app.sandbox.open({
    scenario: "bloodlust-bite-choice",
    seed: 7,
    outcome: "thirst",
  });
  const [team1, team2] = await app.bridge.teams();
  const id = (ref: string) => app.bridge.resolveRef(ref);
  const players = {
    biter: await id("team1:0"),
    first: await id("team1:1"),
    second: await id("team1:2"),
    bystander: await id("team1:3"),
  };
  await app.hud.declareAction("team1:0", "move");
  // The failed roll offers the switch to a Move; keep the declared Move
  await app.hud.answerReaction(false);
  return { app, team1, team2, players };
}

const statusOf = async (app: GameApp, playerId: string) =>
  (await app.bridge.snapshot()).teams
    .flatMap((team) => team.players)
    .find((p) => p.id === playerId)?.status;

/** The two Thralls are marked, and only they. */
async function expectTargetsMarked(app: GameApp) {
  await expect
    .poll(async () =>
      (await app.bridge.pitchHighlights()).map(({ x, y }) => `${x},${y}`).sort()
    )
    .toEqual(expect.arrayContaining(["10,6", "11,5"]));
}

async function shot(page: Page, testInfo: TestInfo, name: string) {
  await page.screenshot({ path: testInfo.outputPath(name) });
}

test("two Thralls in reach at the end of the activation: the coach clicks who to bite", async ({
  page,
}, testInfo) => {
  const { app, players } = await failBesideTwoThralls(page);

  await app.hud.actionButton("end-activation").click();

  // The game says there is a choice and how to make it
  await expect(prompt(page)).toBeVisible();
  await expect(prompt(page)).toContainText("choose who to bite");
  await expect(prompt(page)).toContainText("Click the one to bite");
  // ... instead of offering one Thrall it picked
  await expect(app.hud.reactionDialog()).toBeHidden();
  await expectTargetsMarked(app);
  await shot(page, testInfo, "1-prompt-and-markers.png");

  // Anyone else, and an empty square, does nothing
  await app.pitch.clickPlayer("team1:3");
  await app.pitch.clickPlayer("team1:0");
  await app.pitch.clickSquare({ x: 12, y: 8 });
  await page.waitForTimeout(500);
  await expect(prompt(page)).toBeVisible();
  expect(await statusOf(app, players.first)).toBe("Active");
  expect(await statusOf(app, players.second)).toBe("Active");
  expect(await statusOf(app, players.bystander)).toBe("Active");
  await expectTargetsMarked(app);
  await shot(page, testInfo, "2-after-non-target-clicks.png");

  // The second in board order: the old flow only ever offered the first
  await app.pitch.clickPlayer("team1:2");

  await expect(prompt(page)).toBeHidden();
  await expect.poll(() => statusOf(app, players.second)).not.toBe("Active");
  expect(await statusOf(app, players.first)).toBe("Active");
  const snapshot = await app.bridge.snapshot();
  const biter = snapshot.teams[0].players.find((p) => p.id === players.biter);
  expect(biter?.conditions ?? []).toEqual([]);
  // The markers went with the choice
  await expect
    .poll(async () =>
      (await app.bridge.pitchHighlights()).filter(
        ({ x, y }) => (x === 11 && y === 5) || (x === 10 && y === 6)
      )
    )
    .toEqual([]);
  await shot(page, testInfo, "3-after-bite.png");
});

test("two Thralls in reach at End Turn: the coach clicks who to bite", async ({
  page,
}, testInfo) => {
  const { app, team2, players } = await failBesideTwoThralls(page);

  // Walk away from the owed bite through the HUD's End Turn
  await app.hud.endTurn().click();

  await expect(prompt(page)).toBeVisible();
  await expectTargetsMarked(app);
  await shot(page, testInfo, "1-end-turn-prompt.png");

  await app.pitch.clickPlayer("team1:3");
  await page.waitForTimeout(500);
  await expect(prompt(page)).toBeVisible();

  await app.pitch.clickPlayer("team1:1");

  await expect(prompt(page)).toBeHidden();
  await expect
    .poll(async () => (await app.bridge.snapshot()).activeTeamId)
    .toBe(team2.id);
  expect(await statusOf(app, players.first)).not.toBe("Active");
  expect(await statusOf(app, players.second)).toBe("Active");
  await shot(page, testInfo, "2-end-turn-after-bite.png");
});

test("one Thrall in reach: still the yes/no bite question", async ({
  page,
}, testInfo) => {
  const app = new GameApp(page);
  await app.sandbox.open({
    scenario: "bloodlust-bite",
    seed: 7,
    outcome: "thirst",
  });
  const thrall = await app.bridge.resolveRef("team1:1");
  await app.hud.declareAction("team1:0", "move");
  await app.hud.answerReaction(false);

  await app.hud.actionButton("end-activation").click();

  await expect(app.hud.reactionDialog()).toBeVisible();
  await expect(app.hud.reactionDialog()).toContainText("bites");
  await expect(prompt(page)).toBeHidden();
  await shot(page, testInfo, "1-single-thrall-question.png");
  await app.hud.answerReaction(true);
  await expect.poll(() => statusOf(app, thrall)).not.toBe("Active");
});
