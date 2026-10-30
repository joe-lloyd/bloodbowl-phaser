/**
 * Online, the waiting coach sees the other coach's move drawn as a path
 * while the player runs it. The path stays up until the move has run on
 * this screen, however long that takes, and then goes.
 *
 * Online play needs two coaches, so this drives the board through the same
 * events OnlineMatch sends it: the path when the other coach's move
 * arrives, and the resolution once it has run on this engine.
 */
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
      ([event, payload]) =>
        (
          window as unknown as {
            eventBus: { emit(name: string, data: unknown): void };
          }
        ).eventBus.emit(event as string, payload),
      [name, data] as const
    );
  const pathDrawn = async () =>
    (await app.bridge.pitchLayers()).includes("path_line");

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

  // A slow screen: the move has not run here yet, long after a walk of two
  // squares would have ended. The path is still there.
  await page.waitForTimeout(2500);
  expect(await pathDrawn()).toBe(true);

  await emit(GameEventNames.UI_OtherCoachMoveResolved, { playerId: marker });
  await expect.poll(pathDrawn).toBe(false);
});
