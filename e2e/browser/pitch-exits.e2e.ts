import { test, expect } from "@playwright/test";
import { GameApp } from "../support/pages/game";

test("a scenario reload during players' exits raises no page error", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const app = new GameApp(page);
  await app.sandbox.open({ scenario: "double-turnover-seeded", seed: 8 });
  await app.pitch.waitForCameraToSettle();
  await page.evaluate(() => {
    const scene = (
      window as unknown as {
        game: {
          scene: { getScenes(active: boolean): Record<string, never>[] };
        };
      }
    ).game.scene
      .getScenes(true)
      .find((candidate) => "playerSprites" in candidate) as unknown as {
      gameService: {
        getState(): { activeTeamId: string };
        getTeam(id: string): {
          players: { status: string; gridPosition?: unknown }[];
        };
      };
      eventBus: { emit(name: string, data: unknown): void };
    };
    const players = scene.gameService
      .getTeam(scene.gameService.getState().activeTeamId)
      .players.filter((player) => player.gridPosition);
    for (const [i, status] of ["Removed", "KO", "Injured", "Dead"].entries()) {
      const player = players[i + 1];
      (player)!.status = status;
      delete (player)!.gridPosition;
      scene.eventBus.emit("playerStatusChanged", player);
    }
  });
  await page.waitForTimeout(300);
  await app.sandbox.coreScenarioSelect().selectOption("pickup-fumble-seeded");
  await app.sandbox.waitForScenarioLoaded();

  await page.waitForTimeout(3000);
  expect(errors).toEqual([]);
});
