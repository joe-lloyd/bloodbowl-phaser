/**
 * A push into the crowd is chosen by clicking a square one step off the
 * pitch. Those squares must be drawn as highlights the coach can see, at the
 * same place the click lands, on a sideline and in a corner.
 */
import { test, expect, Page } from "@playwright/test";
import { GameEventNames } from "../../src/types/events";
import { GameApp } from "../support/pages/game";
import type { Square } from "../support/pages/pitch";

const bySquare = (a: Square, b: Square) => a.x - b.x || a.y - b.y;

/**
 * Closing the block dice dialog changes the HUD's clear area, and the camera
 * reframes the board for it a moment later. Wait until the square has stopped
 * moving on screen across rendered frames: Phaser maps a click through the
 * camera as it was last rendered, so on a busy machine a point read between
 * frames can be one the click no longer lands on.
 */
async function waitForSquareToSettle(page: Page, app: GameApp, square: Square) {
  const nextFrames = () =>
    page.evaluate(
      () =>
        new Promise<void>((done) =>
          requestAnimationFrame(() => requestAnimationFrame(() => done()))
        )
    );
  let last: Square | null = null;
  await expect
    .poll(
      async () => {
        await nextFrames();
        const point = await app.pitch.viewportPoint(square);
        const still =
          !!last &&
          Math.abs(point.x - last.x) < 0.5 &&
          Math.abs(point.y - last.y) < 0.5;
        last = point;
        return still;
      },
      { intervals: [300] }
    )
    .toBe(true);
}
const offPitch = (s: Square) => s.x < 0 || s.y < 0 || s.x > 19 || s.y > 10;

const CASES = [
  {
    name: "on the near sideline",
    scenario: "crowd-surf",
    // Both on-pitch push squares are occupied: the crowd takes the push
    crowd: [{ x: 11, y: -1 }],
  },
  {
    name: "in the far corner",
    scenario: "crowd-surf-corner",
    // A diagonal block into the corner: every push square is off the pitch
    crowd: [
      { x: 19, y: -1 },
      { x: 20, y: -1 },
      { x: 20, y: 0 },
    ],
  },
];

for (const c of CASES) {
  test(`crowd push squares are highlighted and clickable ${c.name}`, async ({
    page,
  }) => {
    const app = new GameApp(page);
    // Seed 1 rolls a single Push on the one block die in both scenarios
    await app.sandbox.open({ scenario: c.scenario, seed: 1 });

    await app.hud.declareAction("team1:0", "block");
    await app.pitch.clickPlayer("team2:0");
    await app.hud.rollBlockDice();
    await app.hud.chooseBlockResult("push");

    await expect
      .poll(async () => (await app.bridge.pendingDecision())?.type)
      .toBe("push-direction");
    const decision = await app.bridge.pendingDecision();
    if (decision?.type !== "push-direction")
      throw new Error("no push decision");
    expect([...decision.options].sort(bySquare)).toEqual(c.crowd);

    // Every offered crowd square is drawn, and nothing else is
    await expect
      .poll(async () =>
        [...(await app.bridge.pitchHighlights())].sort(bySquare)
      )
      .toEqual(c.crowd);

    // Clicking a drawn square resolves the crowd push through the rules
    const defenderId = await app.bridge.resolveRef("team2:0");
    const target = c.crowd[c.crowd.length - 1];
    const pushedIntoCrowd = async () =>
      (await app.bridge.events()).some(
        (e) =>
          e.name === GameEventNames.PlayerPushedIntoCrowd &&
          (e.data as { playerId?: string })?.playerId === defenderId
      );
    await expect(app.hud.blockDiceDialog()).toBeHidden();
    // The HUD reframes the board as panels and notices come and go, and a
    // starved browser can map a click through a frame-old camera. A click
    // that misses an offered square is ignored while the push is pending, so
    // a missed click is simply made again; once the push resolves, no more.
    await expect(async () => {
      if ((await app.bridge.pendingDecision())?.type === "push-direction") {
        await waitForSquareToSettle(page, app, target);
        await app.pitch.clickSquare(target);
      }
      await expect.poll(pushedIntoCrowd, { timeout: 3_000 }).toBe(true);
    }).toPass({ timeout: 20_000 });

    // The crowd squares are cleared once the push is resolved
    await expect
      .poll(async () => (await app.bridge.pitchHighlights()).filter(offPitch))
      .toEqual([]);
  });
}
