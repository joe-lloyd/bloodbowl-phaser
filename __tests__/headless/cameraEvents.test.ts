import { expect, it } from "vitest";
import { createHeadlessGame } from "../../src/headless/createHeadlessGame";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GameEventNames } from "../../src/types/events";

it("keeps one viewer's camera events out of the event log protocol responses carry", () => {
  const ctx = createHeadlessGame({ seed: 1 });
  const game = new HeadlessGame({ ctx, autoStartOnReady: false });
  ctx.eventBus.emit(GameEventNames.Camera_TrackBall, {
    playerId: "p1",
    animationDuration: 800,
  });
  ctx.eventBus.emit(GameEventNames.Camera_Reset, { duration: 600 });
  ctx.eventBus.emit(GameEventNames.UI_CameraSettingsChanged, {
    zoom: 2,
    follow: "off",
  });
  ctx.eventBus.emit(GameEventNames.BallPlaced, { x: 2, y: 3 });
  expect(game.events()).toEqual([{ name: "ballPlaced", data: { x: 2, y: 3 } }]);
});
