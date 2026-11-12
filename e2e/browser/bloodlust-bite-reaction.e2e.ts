/**
 * A Bloodlust bite makes an Injury Roll for the adjacent Thrall Lineman. The
 * Thrall must go down on the board as the bite lands, not when the turn
 * ends, and must not fall a second time at the end of the turn. Covers both
 * places a bite is settled: ending the activation, and End Turn with the
 * bite still owed.
 *
 * A frame sampler logs the Thrall sprite's look whenever it changes: its
 * animation, each fall it starts (played, or snapped straight to the last
 * frame), the Stunned marker, the engine status and the active team. The
 * timeline is attached to the run.
 */
import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { GameApp } from "../support/pages/game";

interface Sample {
  t: number;
  mark?: string;
  anim?: string;
  /** Set on the frame a new fall starts: played, or snapped to lying. */
  fall?: "played" | "snapped";
  stunnedMarker?: boolean;
  status?: string;
  activeTeamId?: string | null;
}

/** Start sampling the Thrall sprite every frame; changes only. */
async function watchSprite(page: Page, playerId: string): Promise<void> {
  await page.evaluate((id) => {
    type SpriteLook = {
      anim: string;
      animStart: number;
      stunnedMarker: { visible: boolean };
      getPlayer(): { status: string };
    };
    type Scene = {
      playerSprites?: Map<string, SpriteLook>;
      time: { now: number };
    };
    const w = window as unknown as {
      game: { scene: { getScenes(active: boolean): Scene[] } };
      __bbTestBridge: { phase(): { activeTeamId: string | null } };
      __biteTimeline: Sample[];
      __biteT0: number;
    };
    const log: Sample[] = [];
    w.__biteTimeline = log;
    w.__biteT0 = performance.now();
    let last = "";
    let lastFall: number | undefined;
    const tick = () => {
      const scene = w.game.scene
        .getScenes(true)
        .find((s) => s.playerSprites?.has(id));
      const sprite = scene?.playerSprites?.get(id);
      if (scene && sprite) {
        const look: Omit<Sample, "t"> = {
          anim: sprite.anim,
          stunnedMarker: sprite.stunnedMarker.visible,
          status: sprite.getPlayer().status,
          activeTeamId: w.__bbTestBridge.phase().activeTeamId,
        };
        if (sprite.anim === "fall" && sprite.animStart !== lastFall) {
          lastFall = sprite.animStart;
          // A snapped fall is back-dated so the last frame shows at once
          look.fall =
            scene.time.now - sprite.animStart > 5_000 ? "snapped" : "played";
        }
        if (sprite.anim !== "fall") lastFall = undefined;
        const key = JSON.stringify(look);
        if (key !== last) {
          last = JSON.stringify({ ...look, fall: undefined });
          log.push({ t: Math.round(performance.now() - w.__biteT0), ...look });
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, playerId);
}

async function mark(page: Page, label: string): Promise<void> {
  await page.evaluate((mark) => {
    const w = window as unknown as {
      __biteTimeline: Sample[];
      __biteT0: number;
    };
    w.__biteTimeline.push({
      t: Math.round(performance.now() - w.__biteT0),
      mark,
    });
  }, label);
}

const timeline = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __biteTimeline: Sample[] }).__biteTimeline
  );

const markAt = (log: Sample[], label: string) =>
  log.find((s) => s.mark === label)!.t;

async function attachTimeline(page: Page, testInfo: TestInfo) {
  const log = await timeline(page);
  const body = JSON.stringify(log, null, 2);
  writeFileSync(testInfo.outputPath("thrall-timeline.json"), body);
  await testInfo.attach("thrall-timeline.json", {
    body,
    contentType: "application/json",
  });
  return log;
}

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
  await watchSprite(page, thrallId);

  await app.hud.declareAction("team1:0", "move");
  // The failed roll offers the switch to a Move; keep the declared Move
  await app.hud.answerReaction(false);
  return { app, team1, team2 };
}

/** Accept the offered bite, marking the moment just before the click. */
async function bite(page: Page, app: GameApp): Promise<void> {
  await expect(app.hud.reactionDialog()).toBeVisible();
  await mark(page, "bite");
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
        const last = (await timeline(page)).filter((s) => !s.mark).at(-1);
        return last && [last.anim, last.stunnedMarker, last.activeTeamId];
      },
      { timeout: 3_000 }
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

    await mark(page, "end turn");
    await app.hud.endTurn().click();
    await expect
      .poll(async () => (await app.bridge.snapshot()).activeTeamId)
      .toBe(team2.id);
    // Give the next turn's board refresh time to (wrongly) replay anything
    await page.waitForTimeout(1_000);
    await page.screenshot({ path: testInfo.outputPath("next-turn.png") });
  } finally {
    await attachTimeline(page, testInfo);
  }

  const log = await timeline(page);
  const falls = log.filter((s) => s.fall);
  expect(falls.map((s) => s.fall)).toEqual(["played"]);
  expect(falls[0].t).toBeGreaterThanOrEqual(markAt(log, "bite"));
  expect(falls[0].t).toBeLessThan(markAt(log, "end turn"));
});

test("a Bloodlust bite settled by End Turn downs the Thrall before the turn passes, once", async ({
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
    await attachTimeline(page, testInfo);
  }

  const log = await timeline(page);
  const falls = log.filter((s) => s.fall);
  expect(falls.map((s) => s.fall)).toEqual(["played"]);
  expect(falls[0].t).toBeGreaterThanOrEqual(markAt(log, "bite"));
  // The fall comes with the bite, not with the next team's turn
  const passed = log.find((s) => s.activeTeamId === team2.id)!.t;
  expect(falls[0].t).toBeLessThanOrEqual(passed);
});
