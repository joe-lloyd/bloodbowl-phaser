import { test, expect } from "@playwright/test";
import { GameApp } from "../support/pages/game";
import { GameEventNames } from "../../src/types/events";

test("the other coach's path stays drawn until the move resolves, then clears", async ({
  page,
}) => {
  const app = new GameApp(page);
  await app.sandbox.open({ scenario: "score-run-dodge-rush", seed: 2 });
  await app.pitch.waitForCameraToSettle();
  const marker = await app.bridge.resolveRef("team2:0");
  const emit = (name: string, data: unknown) =>
    page.evaluate(
      ([event, payload]) => {
        (
          globalThis as unknown as {
            eventBus: { emit(name: string, data: unknown): void };
          }
        ).eventBus.emit(event, payload);
      },
      [name, data] as const
    );
  const pathDrawn = async () => {
    const layers = await app.bridge.pitchLayers();
    return layers.includes("path_line");
  };

  expect(await pathDrawn()).toBe(false);
  await emit(GameEventNames.UI_ShowOtherCoachMove, {
    from: { x: 11, y: 5 },
    path: [
      { x: 10, y: 5 },
      { x: 9, y: 5 },
    ],
    ma: 6,
  });
  expect(await pathDrawn()).toBe(true);

  await page.waitForTimeout(2500);
  expect(await pathDrawn()).toBe(true);

  await emit(GameEventNames.UI_OtherCoachMoveResolved, { playerId: marker });
  await expect.poll(pathDrawn).toBe(false);
});
