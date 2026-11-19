import { fixtureValue } from "../../src/testing/fixtureValue";
import { confirmPregame } from "../support/pregame";

import { test, expect, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { GameApp } from "../support/pages/game";
import { seedAllRosters } from "../support/seedTeams";
import { GamePhase } from "../../src/types/GameState";

interface Square {
  x: number;
  y: number;
}

interface Sample {
  x: number;
  y: number;
  visible: boolean;
}

interface Frame {
  kind: "render" | "release";

  t: number;
  pitch: Sample | null;
  dugout: Sample | null;
}

interface FrameLog {
  playerId: string;

  from: Square;

  to: Square;

  dugoutAtPress: Sample | null;
  frames: Frame[];
}

const HOME = "Human Founders";
const COMPUTER = "Green Bay Smackers";
const LINEMAN = 6;

const LINEMAN_SQUARE = { x: 2, y: 6 };
const OTHER_LINEMAN_SQUARE = { x: 2, y: 4 };

const DROP_A = { x: 1, y: 3 };
const DROP_B = { x: 1, y: 5 };

const OFF_ZONE = { x: 10, y: 5 };

test("a dropped player never shows on the square they left", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  const app = new GameApp(page);
  const homeTeam = await startComputerSetup(page, app);
  const lineman = fixtureValue(homeTeam.players[LINEMAN]).id;

  const positions = async () => {
    const snapshot = await app.bridge.snapshot();
    return fixtureValue(snapshot.teams
      .find((team) => team.id === homeTeam.id))
      .players.reduce<Record<string, Square | null>>((all, player) => {
        all[player.id] = player.position;
        return all;
      }, {});
  };

  await loadPreset(page, /balanced/i);
  expect((await positions())[lineman]).toEqual(LINEMAN_SQUARE);

  const drop = (name: string, from: Square, to: Square) =>
    dragAndRecord(page, app, name, lineman, from, to);

  await test.step("a legal move goes straight to the new square", async () => {
    const log = await drop("pitch-to-pitch", LINEMAN_SQUARE, DROP_A);
    expect((await positions())[lineman]).toEqual(DROP_A);
    expect(framesAt(log, "pitch", log.from, "after")).toEqual([]);
    expect(lastFrame(log).pitch).toMatchObject(at(log.to));
  });

  await test.step("an occupied square sends the player back", async () => {
    const log = await drop("occupied", DROP_A, OTHER_LINEMAN_SQUARE);
    expect((await positions())[lineman]).toEqual(DROP_A);
    expect(lastFrame(log).pitch).toMatchObject(at(log.from));
  });

  await test.step("a drop outside the zone goes straight to the dugout", async () => {
    const log = await drop("off-zone", DROP_A, OFF_ZONE);
    expect((await positions())[lineman]).toBeNull();
    expect(framesAt(log, "pitch", log.from, "after")).toEqual([]);
    expect(lastFrame(log).pitch?.visible).toBe(false);
    expect(lastFrame(log).dugout?.visible).toBe(true);
  });

  await test.step("a reserve dropped on the pitch leaves the dugout at once", async () => {
    const slot = await dugoutSquare(page, lineman);
    const log = await drop("dugout-to-pitch", slot, DROP_B);
    expect((await positions())[lineman]).toEqual(DROP_B);
    expect(log.dugoutAtPress?.visible).toBe(true);
    expect(framesAt(log, "dugout", fixtureValue(log.dugoutAtPress), "after")).toEqual([]);
    expect(lastFrame(log).pitch).toMatchObject(at(log.to));
    expect(lastFrame(log).dugout?.visible).toBe(false);
  });

  await test.step("the reserve just placed can be sent back to the dugout", async () => {
    const log = await drop("placed-then-off-zone", DROP_B, OFF_ZONE);
    expect((await positions())[lineman]).toBeNull();
    expect(framesAt(log, "pitch", log.from, "after")).toEqual([]);
    expect(lastFrame(log).pitch?.visible).toBe(false);
    expect(lastFrame(log).dugout?.visible).toBe(true);
  });
});

function at(square: Square) {
  return {
    visible: true,
    x: expect.closeTo(square.x, 0),
    y: expect.closeTo(square.y, 0),
  };
}

function lastFrame(log: FrameLog): Frame {
  return fixtureValue(log.frames[log.frames.length - 1]);
}

function framesAt(
  log: FrameLog,
  sprite: "pitch" | "dugout",
  square: Square,
  when: "after"
): Frame[] {
  return log.frames.filter((frame) => {
    const sample = frame[sprite];
    return (
      (when === "after" ? frame.t >= 0 : frame.t < 0) &&
      !!sample?.visible &&
      Math.abs(sample.x - square.x) < 1 &&
      Math.abs(sample.y - square.y) < 1
    );
  });
}

async function dragAndRecord(
  page: Page,
  app: GameApp,
  name: string,
  playerId: string,
  from: Square,
  to: Square
): Promise<FrameLog> {
  const start = await app.pitch.viewportPoint(from);
  const end = await app.pitch.viewportPoint(to);
  await page.evaluate(
    ({ playerId, from, to }) => {
      interface Sprite {
        x: number;
        y: number;
        visible: boolean;
      }
      const game = (window as unknown as { game: PhaserGame }).game;
      interface PhaserGame {
        events: {
          on(event: string, fn: () => void): void;
          off(event: string, fn: () => void): void;
        };
        scene: { getScenes(active: boolean): BoardScene[] };
      }
      interface BoardScene {
        playerSprites?: Map<string, Sprite>;
        dugouts?: Map<string, { getSprites(): Map<string, Sprite> }>;
        getPitch(): {
          getPixelPosition(x: number, y: number): { x: number; y: number };
        };
      }
      const scene = (game.scene
        .getScenes(true)
        .find((s) => s.playerSprites instanceof Map && s.dugouts))!;
      const read = (sprite: Sprite | undefined) =>
        sprite ? { x: sprite.x, y: sprite.y, visible: sprite.visible } : null;
      const pitchSprite = () => read((scene.playerSprites)!.get(playerId));
      const dugoutSprite = () =>
        read(
          [...(scene.dugouts)!.values()]
            .map((dugout) => dugout.getSprites().get(playerId))
            .find(Boolean)
        );
      const pitch = scene.getPitch();
      const frames: {
        kind: string;
        at: number;
        pitch: ReturnType<typeof read>;
        dugout: ReturnType<typeof read>;
      }[] = [];
      let releasedAt: number | null = null;
      let dugoutAtPress: ReturnType<typeof read> = null;
      const sample = (kind: string) =>
        frames.push({
          kind,
          at: performance.now(),
          pitch: pitchSprite(),
          dugout: dugoutSprite(),
        });
      const onRender = () => sample("render");
      const onDown = () => {
        dugoutAtPress ??= dugoutSprite();
      };
      const onUp = () => {
        if (releasedAt !== null) return;
        releasedAt = performance.now();

        setTimeout(() => sample("release"), 0);
      };
      game.events.on("postrender", onRender);
      window.addEventListener("pointerdown", onDown, true);
      window.addEventListener("pointerup", onUp, true);
      (window as unknown as Record<string, unknown>)["__dropRecorder"] = () => {
        game.events.off("postrender", onRender);
        window.removeEventListener("pointerdown", onDown, true);
        window.removeEventListener("pointerup", onUp, true);
        return {
          playerId,
          from: pitch.getPixelPosition(from.x, from.y),
          to: pitch.getPixelPosition(to.x, to.y),
          dugoutAtPress,
          frames: frames.map(({ at, ...frame }) => ({
            ...frame,
            t: at - (releasedAt ?? at),
          })),
        };
      };
    },
    { playerId, from, to }
  );

  await page.mouse.move(start.x, start.y);
  await page.waitForTimeout(50);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.waitForTimeout(50);
  await page.mouse.up();
  await page.waitForTimeout(500);
  const log = await page.evaluate(() =>
    (
      (window as unknown as Record<string, unknown>)[
        "__dropRecorder"
      ] as () => FrameLog
    )()
  );
  log.frames.sort((a, b) => a.t - b.t);
  if (process.env["FRAMES"]) {
    writeFileSync(
      `${process.env["FRAMES"]}/${name}.json`,
      JSON.stringify(log, null, 1)
    );
    await page.screenshot({ path: `${process.env["FRAMES"]}/${name}.png` });
  }
  expect(log.frames.filter((frame) => frame.t >= 0).length).toBeGreaterThan(3);
  return log;
}

async function dugoutSquare(page: Page, playerId: string): Promise<Square> {
  return page.evaluate((id) => {
    interface Sprite {
      x: number;
      y: number;
    }
    const scene = ((
      window as unknown as {
        game: {
          scene: {
            getScenes(active: boolean): {
              dugouts?: Map<string, { getSprites(): Map<string, Sprite> }>;
              getPitch(): { worldToGrid(x: number, y: number): Square };
            }[];
          };
        };
      }
    ).game.scene
      .getScenes(true)
      .find((s) => s.dugouts))!;
    const sprite = ([...(scene.dugouts)!.values()]
      .map((dugout) => dugout.getSprites().get(id))
      .find(Boolean))!;
    return scene.getPitch().worldToGrid(sprite.x, sprite.y);
  }, playerId);
}

async function startComputerSetup(page: Page, app: GameApp) {
  page.on("dialog", (dialog) => void dialog.accept());

  await seedAllRosters(page, { fullStrength: true });
  await page.goto("/select-team");
  await page
    .getByRole("button", { name: new RegExp(HOME) })
    .first()
    .click();
  await page.getByRole("radio", { name: /Versus computer/ }).click();
  await page.getByRole("button", { name: new RegExp(COMPUTER) }).click();
  await expect(page.getByRole("button", { name: /Start Game/ })).toBeEnabled();
  await page.getByRole("button", { name: /Start Game/ }).click();
  await app.bridge.waitForReady();
  await app.rollWeather(120_000);
  await confirmPregame(page);
  const flip = page.getByRole("button", { name: "FLIP COIN" });
  await flip.waitFor({ timeout: 15_000 });
  await flip.click();

  const home = fixtureValue((await app.bridge.teams()).find((team) => team.name === HOME));
  const kick = page.getByRole("button", { name: /^KICK$/ });
  await expect(async () => {
    if (await kick.count()) await kick.first().click({ timeout: 500 });
    const { phase, activeTeamId } = await app.bridge.phase();
    expect(phase).toBe(GamePhase.SETUP);
    expect(activeTeamId).toBe(home.id);
  }).toPass({ timeout: 90_000 });
  await expect(page.getByTestId("setup-checklist")).toBeVisible({
    timeout: 15_000,
  });
  await app.pitch.waitForCameraToSettle();
  return home;
}

async function loadPreset(page: Page, name: RegExp): Promise<void> {
  const select = page
    .locator("select")
    .filter({ has: page.locator("optgroup[label=Presets]") });
  const options = await select
    .locator("optgroup[label=Presets] option")
    .allTextContents();
  await select.selectOption(fixtureValue(options.find((o) => name.test(o))));
  await page.getByRole("button", { name: /LOAD/ }).click();
  await expect(page.getByTestId("setup-checklist")).toContainText(
    "Players placed 7/7"
  );
}
