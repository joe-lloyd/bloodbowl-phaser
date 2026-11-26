import { fixtureValue } from "../../src/testing/fixtureValue";
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

  await app.hud.answerReaction(false);
  return { app, team1, team2, players };
}

const statusOf = async (app: GameApp, playerId: string) =>
  (await app.bridge.snapshot()).teams
    .flatMap((team) => team.players)
    .find((p) => p.id === playerId)?.status;

async function expectTargetsMarked(app: GameApp) {
  await expect
    .poll(async () =>
      (await app.bridge.pitchHighlights())
        .map(({ x, y }) => `${String(x)},${String(y)}`)
        .toSorted()
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

  await expect(prompt(page)).toBeVisible();
  await expect(prompt(page)).toContainText("choose who to bite");
  await expect(prompt(page)).toContainText("Click the one to bite");

  await expect(app.hud.reactionDialog()).toBeHidden();
  await expectTargetsMarked(app);
  await shot(page, testInfo, "1-prompt-and-markers.png");

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

  await app.pitch.clickPlayer("team1:2");

  await expect(prompt(page)).toBeHidden();
  await expect.poll(() => statusOf(app, players.second)).not.toBe("Active");
  expect(await statusOf(app, players.first)).toBe("Active");
  const snapshot = await app.bridge.snapshot();
  const biter = fixtureValue(snapshot.teams[0]).players.find((p) => p.id === players.biter);
  expect(biter?.conditions ?? []).toEqual([]);

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
