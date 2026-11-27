import { test, expect, type Page } from "@playwright/test";
import { GameApp } from "../support/pages/game";

interface DrawnPlayer {
  id: string;
  alpha: number;
  anim: string;
  stunned: boolean;
}

const drawnPlayers = (page: Page): Promise<DrawnPlayer[]> =>
  page.evaluate(`
    [...window.game.scene.getScenes(true)
      .find((scene) => scene.playerSprites).playerSprites.entries()]
      .filter(([, sprite]) => sprite.visible)
      .map(([id, sprite]) => ({
        id,
        alpha: sprite.figure.alpha,
        anim: sprite.anim,
        stunned: sprite.markers.stunnedMarker.visible,
      }))
  `);

test("a touchdown puts every player back on their feet at full opacity", async ({
  page,
}) => {
  const app = new GameApp(page);
  await app.sandbox.open({ scenario: "basic-scrimmage" });
  await page.evaluate(`(() => {
    const scene = window.game.scene.getScenes(true)
      .find((candidate) => candidate.playerSprites);
    const service = scene.gameService;
    const onPitch = (team) => team.players.filter((p) => p.gridPosition);
    const [scorer, other] = onPitch(scene.team1);
    service.finishActivation(scorer.id);
    service.finishActivation(other.id);
    const [stunned, prone] = onPitch(scene.team2);
    stunned.status = "Stunned";
    prone.status = "Prone";
    for (const player of [stunned, prone])
      scene.eventBus.emit("playerStatusChanged", player);
  })()`);
  const before = await drawnPlayers(page);
  expect(before.filter((player) => player.alpha < 1)).toHaveLength(2);
  expect(before.filter((player) => player.anim === "fall")).toHaveLength(2);
  expect(before.filter((player) => player.stunned)).toHaveLength(1);
  await page.screenshot({ path: test.info().outputPath("drive-reset-1-play.png") });

  await page.evaluate(`(() => {
    const scene = window.game.scene.getScenes(true)
      .find((candidate) => candidate.playerSprites);
    scene.gameService.addTouchdown(scene.team1.players[0].id);
  })()`);
  for (let team = 0; team < 2; team++) {
    await page.getByRole("button", { name: /LOAD/ }).click({ timeout: 30_000 });
    await expect(page.getByTestId("setup-checklist")).toContainText(
      "Players placed 7/7"
    );
    await page.screenshot({ path: test.info().outputPath(`drive-reset-2-setup-${String(team)}.png`) });
    await page.getByRole("button", { name: /CONFIRM SETUP/ }).click();
    await page.waitForTimeout(800);
  }
  const after = await drawnPlayers(page);
  await page.screenshot({ path: test.info().outputPath("drive-reset-3-kickoff.png") });
  expect(after).toHaveLength(14);
  for (const player of after)
    expect(player).toMatchObject({ alpha: 1, anim: "idle", stunned: false });
});
