/**
 * A Bloodlust bite makes an Injury Roll for the adjacent Thrall Lineman. The
 * Thrall must go down on the board as the bite lands, not when the turn
 * ends, and must not fall a second time at the end of the turn. Covers both
 * places a bite is settled: ending the activation, and End Turn with the
 * bite still owed.
 *
 * Two records, for two jobs:
 * - Order comes from a source log. The Thrall sprite's `play` is wrapped so
 *   each fall it starts (played, or snapped straight to the last frame) is
 *   logged the moment it starts, and the engine's TurnEnded and TurnStarted
 *   are logged from their own handlers. Every entry takes the next number
 *   of one counter, so two changes in the same frame still have an order.
 * - What the coach sees comes from a frame sampler: the sprite's animation,
 *   Stunned marker, engine status and the active team, logged whenever they
 *   change.
 * Both are attached to the run.
 */
import { writeFileSync } from "node:fs";
import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { GameApp } from "../support/pages/game";

interface SourceEntry {
  seq: number;
  t: number;
  what: "bite" | "fall played" | "fall snapped" | "turn ended" | "turn started";
}

interface Sample {
  t: number;
  anim: string;
  stunnedMarker: boolean;
  status: string;
  activeTeamId: string | null;
}

interface Watch {
  source: SourceEntry[];
  frames: Sample[];
}

/** Hook the Thrall sprite and the turn events, and sample every frame. */
async function watchThrall(page: Page, playerId: string): Promise<void> {
  await page.evaluate((id) => {
    type SpriteLook = {
      anim: string;
      animStart: number;
      stunnedMarker: { visible: boolean };
      getPlayer(): { status: string };
      play(anim: string, fromStart?: boolean): void;
    };
    type Scene = {
      playerSprites?: Map<string, SpriteLook>;
      eventBus: { on(event: string, handler: () => void): void };
    };
    const w = window as unknown as {
      game: { scene: { getScenes(active: boolean): Scene[] } };
      __bbTestBridge: { phase(): { activeTeamId: string | null } };
      __biteWatch: Watch;
      __biteLog(what: SourceEntry["what"]): void;
    };
    const scene = w.game.scene
      .getScenes(true)
      .find((s) => s.playerSprites?.has(id))!;
    const sprite = scene.playerSprites!.get(id)!;
    const t0 = performance.now();
    const watch: Watch = { source: [], frames: [] };
    w.__biteWatch = watch;
    w.__biteLog = (what) =>
      watch.source.push({
        seq: watch.source.length,
        t: Math.round(performance.now() - t0),
        what,
      });

    // A fall starts when `play` leaves the sprite on "fall" with a new start
    const play = sprite.play.bind(sprite);
    sprite.play = (anim, fromStart = true) => {
      const before = `${sprite.anim}@${sprite.animStart}`;
      play(anim, fromStart);
      if (
        sprite.anim === "fall" &&
        `${sprite.anim}@${sprite.animStart}` !== before
      ) {
        w.__biteLog(fromStart ? "fall played" : "fall snapped");
      }
    };
    scene.eventBus.on("turnEnded", () => w.__biteLog("turn ended"));
    scene.eventBus.on("turnStarted", () => w.__biteLog("turn started"));

    let last = "";
    const tick = () => {
      const look = {
        anim: sprite.anim,
        stunnedMarker: sprite.stunnedMarker.visible,
        status: sprite.getPlayer().status,
        activeTeamId: w.__bbTestBridge.phase().activeTeamId,
      };
      const key = JSON.stringify(look);
      if (key !== last) {
        last = key;
        watch.frames.push({ t: Math.round(performance.now() - t0), ...look });
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, playerId);
}

const watched = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __biteWatch: Watch }).__biteWatch
  );

async function attachWatch(page: Page, testInfo: TestInfo) {
  const watch = await watched(page);
  const body = JSON.stringify(watch, null, 2);
  writeFileSync(testInfo.outputPath("thrall-timeline.json"), body);
  await testInfo.attach("thrall-timeline.json", {
    body,
    contentType: "application/json",
  });
  return watch;
}

/** Sequence number of the first source entry of this kind, or -1. */
const seqOf = (source: SourceEntry[], what: SourceEntry["what"]) =>
  source.find((e) => e.what === what)?.seq ?? -1;

const falls = (source: SourceEntry[]) =>
  source.filter((e) => e.what.startsWith("fall")).map((e) => e.what);

async function openBite(page: Page) {
  const app = new GameApp(page);
  // Seed 7 is the case's committed "thirst" seed: the Bloodlust roll fails
  // and the bite's Injury Roll leaves the Thrall Stunned
  await app.sandbox.open({
    scenario: "bloodlust-bite",
    seed: 7,
    outcome: "thirst",
  });
  const [team1, team2] = await app.bridge.teams();
  const thrallId = await app.bridge.resolveRef("team1:1");
  await watchThrall(page, thrallId);

  await app.hud.declareAction("team1:0", "move");
  // The failed roll offers the switch to a Move; keep the declared Move
  await app.hud.answerReaction(false);
  return { app, team1, team2 };
}

/** Accept the offered bite, logging the moment just before the click. */
async function bite(page: Page, app: GameApp): Promise<void> {
  await expect(app.hud.reactionDialog()).toBeVisible();
  await page.evaluate(() =>
    (
      window as unknown as { __biteLog(what: SourceEntry["what"]): void }
    ).__biteLog("bite")
  );
  await app.hud.answerReaction(true);
}

/**
 * The Thrall's sprite is down and marked Stunned while `teamId` plays. Soft,
 * so a failure still records the rest of the turn in the timeline.
 */
async function expectDownDuring(page: Page, teamId: string) {
  await expect
    .configure({ soft: true })
    .poll(
      async () => {
        const last = (await watched(page)).frames.at(-1);
        return last && [last.anim, last.stunnedMarker, last.activeTeamId];
      },
      { timeout: 5_000 }
    )
    .toEqual(["fall", true, teamId]);
}

test("a Bloodlust bite at the end of the activation downs the Thrall at once", async ({
  page,
}, testInfo) => {
  const { app, team1, team2 } = await openBite(page);

  await app.hud.actionButton("end-activation").click();
  await bite(page, app);

  try {
    // Down at the bite, while the biting team's turn is still running
    await expectDownDuring(page, team1.id);
    await page.screenshot({ path: testInfo.outputPath("after-bite.png") });

    await app.hud.endTurn().click();
    await expect
      .poll(async () => (await app.bridge.snapshot()).activeTeamId)
      .toBe(team2.id);
    // Give the next turn's board refresh time to (wrongly) replay anything
    await page.waitForTimeout(1_000);
    await page.screenshot({ path: testInfo.outputPath("next-turn.png") });
  } finally {
    await attachWatch(page, testInfo);
  }

  const { source } = await watched(page);
  // One fall, played, after the bite and strictly before the turn ends
  expect(falls(source)).toEqual(["fall played"]);
  expect(seqOf(source, "fall played")).toBeGreaterThan(seqOf(source, "bite"));
  expect(seqOf(source, "turn ended")).toBeGreaterThan(
    seqOf(source, "fall played")
  );
});

test("a Bloodlust bite settled by End Turn downs the Thrall once", async ({
  page,
}, testInfo) => {
  const { app, team2 } = await openBite(page);

  // Walk away from the owed bite through the HUD's End Turn; it is offered
  await app.hud.endTurn().click();
  await bite(page, app);

  try {
    await expect
      .poll(async () => (await app.bridge.snapshot()).activeTeamId)
      .toBe(team2.id);
    await expectDownDuring(page, team2.id);
    await page.waitForTimeout(1_000);
    await page.screenshot({ path: testInfo.outputPath("next-turn.png") });
  } finally {
    await attachWatch(page, testInfo);
  }

  const { source } = await watched(page);
  // The turn passes as soon as the bite settles, before its Injury dice
  // land, so the fall cannot wait for them; it still plays, exactly once
  expect(falls(source)).toEqual(["fall played"]);
  expect(seqOf(source, "fall played")).toBeGreaterThan(seqOf(source, "bite"));
  expect(seqOf(source, "turn ended")).toBeGreaterThan(seqOf(source, "bite"));
});
