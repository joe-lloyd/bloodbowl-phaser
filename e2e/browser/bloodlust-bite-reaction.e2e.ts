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

async function watchThrall(page: Page, playerId: string): Promise<void> {
  await page.evaluate((id) => {
    interface SpriteLook {
      anim: string;
      animStart: number;
      markers: { stunnedMarker: { visible: boolean } };
      getPlayer(): { status: string };
      play(anim: string, fromStart?: boolean): void;
    }
    interface Scene {
      playerSprites?: Map<string, SpriteLook>;
      eventBus: { on(event: string, handler: () => void): void };
    }
    const w = globalThis as unknown as {
      game: { scene: { getScenes(active: boolean): Scene[] } };
      __bbTestBridge: { phase(): { activeTeamId: string | null } };
      __biteWatch: Watch;
      __biteLog(what: SourceEntry["what"]): void;
    };
    const scene = (w.game.scene
      .getScenes(true)
      .find((s) => s.playerSprites?.has(id)))!;
    const sprite = ((scene.playerSprites)!.get(id))!;
    const t0 = performance.now();
    const watch: Watch = { source: [], frames: [] };
    w.__biteWatch = watch;
    w.__biteLog = (what) => {
      watch.source.push({
        seq: watch.source.length,
        t: Math.round(performance.now() - t0),
        what,
      });
    };

    const play = sprite.play.bind(sprite);
    sprite.play = (anim, fromStart = true) => {
      const before = `${sprite.anim}@${String(sprite.animStart)}`;
      play(anim, fromStart);
      if (
        sprite.anim === "fall" &&
        `${sprite.anim}@${String(sprite.animStart)}` !== before
      ) {
        w.__biteLog(fromStart ? "fall played" : "fall snapped");
      }
    };
    scene.eventBus.on("turnEnded", () => {
      w.__biteLog("turn ended");
    });
    scene.eventBus.on("turnStarted", () => {
      w.__biteLog("turn started");
    });

    let last = "";
    const tick = () => {
      const look = {
        anim: sprite.anim,
        stunnedMarker: sprite.markers.stunnedMarker.visible,
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
    () => (globalThis as unknown as { __biteWatch: Watch }).__biteWatch
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

const seqOf = (source: SourceEntry[], what: SourceEntry["what"]) =>
  source.find((e) => e.what === what)?.seq ?? -1;

const falls = (source: SourceEntry[]) =>
  source.filter((e) => e.what.startsWith("fall")).map((e) => e.what);

async function openBite(page: Page) {
  const app = new GameApp(page);

  await app.sandbox.open({
    scenario: "bloodlust-bite",
    seed: 7,
    outcome: "thirst",
  });
  const [team1, team2] = await app.bridge.teams();
  const thrallId = await app.bridge.resolveRef("team1:1");
  await watchThrall(page, thrallId);

  await app.hud.declareAction("team1:0", "move");

  await app.hud.answerReaction(false);
  return { app, team1, team2 };
}

async function bite(page: Page, app: GameApp): Promise<void> {
  await expect(app.hud.reactionDialog()).toBeVisible();
  await page.evaluate(() => {
    (
      globalThis as unknown as { __biteLog(what: SourceEntry["what"]): void }
    ).__biteLog("bite");
  });
  await app.hud.answerReaction(true);
}

async function expectDownDuring(page: Page, teamId: string) {
  await expect
    .configure({ soft: true })
    .poll(
      async () => {
        const watch = await watched(page);
        const last = watch.frames.at(-1);
        return last && [last.anim, last.stunnedMarker, last.activeTeamId];
      },
      { timeout: 5000 }
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
    await expectDownDuring(page, team1.id);
    await page.screenshot({ path: testInfo.outputPath("after-bite.png") });

    await app.hud.endTurn().click();
    await expect
      .poll(async () => {
        const snapshot = await app.bridge.snapshot();
        return snapshot.activeTeamId;
      })
      .toBe(team2.id);

    await page.waitForTimeout(1000);
    await page.screenshot({ path: testInfo.outputPath("next-turn.png") });
  } finally {
    await attachWatch(page, testInfo);
  }

  const { source } = await watched(page);

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

  await app.hud.endTurn().click();
  await bite(page, app);

  try {
    await expect
      .poll(async () => {
        const snapshot = await app.bridge.snapshot();
        return snapshot.activeTeamId;
      })
      .toBe(team2.id);
    await expectDownDuring(page, team2.id);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: testInfo.outputPath("next-turn.png") });
  } finally {
    await attachWatch(page, testInfo);
  }

  const { source } = await watched(page);

  expect(falls(source)).toEqual(["fall played"]);
  expect(seqOf(source, "fall played")).toBeGreaterThan(seqOf(source, "bite"));
  expect(seqOf(source, "turn ended")).toBeGreaterThan(seqOf(source, "bite"));
});
