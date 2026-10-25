import { expect, it } from "vitest";
import { createHeadlessGame } from "../../src/headless/createHeadlessGame";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GameEventNames } from "../../src/types/events";

it("keeps live camera sprites out of the JSON event log while retaining gameplay", () => {
  const ctx = createHeadlessGame({ seed: 1 });
  const game = new HeadlessGame({ ctx, autoStartOnReady: false });
  ctx.eventBus.emit(GameEventNames.Camera_TrackObject, {
    sprite: { update() {} },
  });
  ctx.eventBus.emit(GameEventNames.UI_CameraSettingsChanged, {
    zoom: 2,
    followIntensity: 1,
  });
  ctx.eventBus.emit(GameEventNames.BallPlaced, { x: 2, y: 3 });
  expect(structuredClone(game.events())).toEqual([
    { name: "ballPlaced", data: { x: 2, y: 3 } },
  ]);
});
