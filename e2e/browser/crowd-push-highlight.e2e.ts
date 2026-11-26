import { fixtureValue } from "../../src/testing/fixtureValue";
import { test, expect, type Page } from "@playwright/test";
import { GameEventNames } from "../../src/types/events";
import { GameApp } from "../support/pages/game";
import type { Square } from "../support/pages/pitch";

const bySquare = (a: Square, b: Square) => a.x - b.x || a.y - b.y;

async function waitForSquareToSettle(page: Page, app: GameApp, square: Square) {
  const nextFrames = () =>
    page.evaluate(
      () =>
        new Promise<void>((done) =>
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              done();
            })
          )
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

    crowd: [{ x: 11, y: -1 }],
  },
  {
    name: "in the far corner",
    scenario: "crowd-surf-corner",

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

    await expect
      .poll(async () =>
        [...(await app.bridge.pitchHighlights())].sort(bySquare)
      )
      .toEqual(c.crowd);

    const defenderId = await app.bridge.resolveRef("team2:0");
    const target = c.crowd.at(-1);
    const pushedIntoCrowd = async () =>
      (await app.bridge.events()).some(
        (e) =>
          e.name === GameEventNames.PlayerPushedIntoCrowd &&
          (e.data as { playerId?: string })?.playerId === defenderId
      );
    await expect(app.hud.blockDiceDialog()).toBeHidden();

    await expect(async () => {
      if ((await app.bridge.pendingDecision())?.type === "push-direction") {
        await waitForSquareToSettle(page, app, fixtureValue(target));
        await app.pitch.clickSquare(fixtureValue(target));
      }
      await expect.poll(pushedIntoCrowd, { timeout: 3000 }).toBe(true);
    }).toPass({ timeout: 20_000 });

    await expect
      .poll(async () => (await app.bridge.pitchHighlights()).filter(offPitch))
      .toEqual([]);
  });
}
