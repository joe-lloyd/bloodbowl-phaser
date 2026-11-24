import { fixtureValue } from "../../src/testing/fixtureValue";
import { confirmPregame } from "../support/pregame";

import { test, expect, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { GameApp } from "../support/pages/game";
import { pickFormation } from "../support/setup";
import { seedAllRosters } from "../support/seedTeams";
import { GameEventNames } from "../../src/types/events";
import { GamePhase } from "../../src/types/GameState";

interface Square {
  x: number;
  y: number;
}

const UNDERWORLD = "Underworld Denizens Founders";
const OPPONENT = "Human Founders";
const SNOTLINGS = "Snotling Founders";
const TROLL = 3;
const SNOTLING = 5;
const BEHIND_SNOTLING = 6;
const TROLL_SQUARE = { x: 4, y: 2 };

const BEHIND = { x: 3, y: 1 };

const OVERHANG_EMPTY = { x: 4 - 0.809, y: 2 - 0.405 };

const DROP_A = { x: 1, y: 3 };
const DROP_B = { x: 1, y: 5 };

const DUGOUT_TROLL = { x: 9, y: -2 };
const DUGOUT_BEHIND = { x: 8, y: -3 };
const DUGOUT_DROP = { x: 5, y: 5 };

const OFF_ZONE = { x: 10, y: 5 };

const BEHIND_RESERVE_SLOT = { x: 5, y: -3 };

type Positions = Record<string, Square | null>;

test("setup picks players up by their grid square, not their body", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  const app = new GameApp(page);
  const measurements: unknown[] = [];
  let shot = 0;

  await startSetup(page, app, UNDERWORLD);
  const team = fixtureValue((await app.bridge.teams()).find((t) => t.name === UNDERWORLD));
  const id = (index: number) => fixtureValue(team.players[index]).id;

  const positions = async (): Promise<Positions> => {
    const snapshot = await app.bridge.snapshot();
    const players = fixtureValue(snapshot.teams.find((t) => t.id === team.id)).players;
    return Object.fromEntries(players.map((p) => [p.id, p.position]));
  };
  const moved = (before: Positions, after: Positions) =>
    Object.keys(after).filter(
      (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key])
    );

  const drag = async (name: string, from: Square, to: Square) => {
    const start = await app.pitch.viewportPoint(from);
    const end = await app.pitch.viewportPoint(to);
    const before = await positions();
    if (process.env["SHOTS"]) {
      const file = `${process.env["SHOTS"]}/${String(++shot).padStart(2, "0")}-${name}`;
      await markPoint(page, start);
      await page.screenshot({ path: `${file}.png` });

      await page.screenshot({
        path: `${file}-zoom.jpg`,
        quality: 80,
        clip: { x: start.x - 120, y: start.y - 120, width: 240, height: 200 },
      });
      await clearMark(page);
    }
    await page.mouse.move(start.x, start.y);
    await page.waitForTimeout(50);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 8 });
    await page.waitForTimeout(50);
    await page.mouse.up();

    await page.waitForTimeout(400);
    const after = await positions();
    const picked = moved(before, after).map((playerId) => ({
      playerId,
      positionName: team.players.find((p) => p.id === playerId)?.positionName,
      from: before[playerId],
      to: after[playerId],
    }));
    measurements.push({
      name,
      pressedSquare: from,
      press: start,
      release: end,
      picked,
    });
    return { picked, after };
  };

  const trollInFrontOfSnotling = async () => {
    await loadPreset(page, /balanced/i);
    expect((await positions())[id(TROLL)]).toEqual(TROLL_SQUARE);
    const { after } = await drag(
      "setup-snotling-behind-troll",
      { x: 2, y: 4 },
      BEHIND
    );
    expect(after[id(SNOTLING)]).toEqual(BEHIND);
    expect(after[id(TROLL)]).toEqual(TROLL_SQUARE);
  };

  try {
    await test.step("pressing the Troll's own square drags the Troll", async () => {
      await trollInFrontOfSnotling();
      const { picked, after } = await drag("own-square", TROLL_SQUARE, DROP_B);
      expect.soft(picked.map((p) => p.playerId)).toEqual([id(TROLL)]);
      expect.soft(after[id(TROLL)]).toEqual(DROP_B);
    });

    await test.step("pressing the Troll's body over the Snotling's square picks the Snotling", async () => {
      await trollInFrontOfSnotling();
      const { picked, after } = await drag("overhang-occupied", BEHIND, DROP_A);
      expect.soft(picked.map((p) => p.playerId)).toEqual([id(SNOTLING)]);
      expect.soft(after[id(SNOTLING)]).toEqual(DROP_A);
      expect.soft(after[id(TROLL)]).toEqual(TROLL_SQUARE);
    });

    await test.step("pressing the Troll's body over an empty square picks no one", async () => {
      await trollInFrontOfSnotling();
      const { picked } = await drag("overhang-empty", OVERHANG_EMPTY, DROP_A);
      expect.soft(picked).toEqual([]);
    });

    await test.step("in the dugout, pressing the square behind the Troll picks the Snotling there", async () => {
      await clearPitch(page);
      const { picked, after } = await drag(
        "dugout-overhang-occupied",
        DUGOUT_BEHIND,
        DUGOUT_DROP
      );
      expect.soft(picked.map((p) => p.playerId)).toEqual([id(BEHIND_SNOTLING)]);
      expect.soft(after[id(BEHIND_SNOTLING)]).toEqual(DUGOUT_DROP);
      expect.soft(after[id(TROLL)]).toBeNull();
    });

    await test.step("a player sent back to the dugout during setup is picked by their square there", async () => {
      await trollInFrontOfSnotling();
      const { after } = await drag("troll-to-dugout", TROLL_SQUARE, OFF_ZONE);
      expect(after[id(TROLL)]).toBeNull();

      const { picked } = await drag(
        "dugout-returned-overhang-empty",
        BEHIND_RESERVE_SLOT,
        DROP_A
      );
      expect.soft(picked).toEqual([]);
    });

    await test.step("a dugout player dropped on a square lands there", async () => {
      await clearPitch(page);
      const { picked, after } = await drag(
        "dugout-own-square",
        DUGOUT_TROLL,
        DROP_B
      );
      expect.soft(picked.map((p) => p.playerId)).toEqual([id(TROLL)]);
      expect.soft(after[id(TROLL)]).toEqual(DROP_B);
    });
  } finally {
    if (process.env["SHOTS"]) {
      writeFileSync(
        `${process.env["SHOTS"]}/measurements.json`,
        JSON.stringify(measurements, null, 2)
      );
    }
  }
});

test("after setup a reserve is hovered by their body again", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  const app = new GameApp(page);

  await startSetup(page, app, SNOTLINGS);
  const team = fixtureValue((await app.bridge.teams()).find((t) => t.name === SNOTLINGS));

  for (let side = 0; side < 2; side++) {
    await loadPreset(page, /balanced/i);
    await page.getByRole("button", { name: /CONFIRM SETUP/ }).click();
    await page.waitForTimeout(800);
  }

  const finishSwarming = page.getByRole("button", { name: "FINISH SWARMING" });
  await expect(finishSwarming).toBeVisible();
  await finishSwarming.click();
  await expect
    .poll(async () => (await app.bridge.phase()).phase, { timeout: 15_000 })
    .not.toBe(GamePhase.SETUP);
  const snapshot = await app.bridge.snapshot();
  const players = fixtureValue(snapshot.teams.find((t) => t.id === team.id)).players;
  const reserve = fixtureValue(players.find((p) => p.position === null)).id;

  const away = await app.pitch.viewportPoint({ x: 10, y: 5 });
  await page.mouse.move(away.x, away.y);
  await page.waitForTimeout(100);
  const since = (await app.bridge.events()).length;
  const body = await app.pitch.viewportPoint(BEHIND_RESERVE_SLOT);
  await page.mouse.move(body.x, body.y, { steps: 4 });
  await expect
    .poll(
      async () =>
        (await app.bridge.events(since))
          .filter((e) => e.name === GameEventNames.UI_ShowPlayerInfo)
          .map((e) => (e.data as { id: string }).id),
      { timeout: 5_000 }
    )
    .toContain(reserve);
  if (process.env["SHOTS"]) {
    await markPoint(page, body);
    await page.screenshot({
      path: `${process.env["SHOTS"]}/reserve-hover-after-setup.png`,
    });
    await clearMark(page);
  }
});

async function startSetup(
  page: Page,
  app: GameApp,
  home: string
): Promise<void> {
  page.on("dialog", (dialog) => void dialog.accept());

  await seedAllRosters(page, { fullStrength: true });
  await page.goto("/select-team");
  await page
    .getByRole("button", { name: new RegExp(home) })
    .first()
    .click();
  await page
    .getByRole("button", { name: new RegExp(OPPONENT) })
    .last()
    .click();
  await page.getByRole("button", { name: /Start Game/ }).click();
  await app.bridge.waitForReady();

  await app.rollWeather(45_000);
  await confirmPregame(page);
  const flip = page.getByRole("button", { name: "FLIP COIN" });
  await expect(flip).toBeVisible({ timeout: 15_000 });
  await flip.click();
  await expect(page.getByText(/wins the toss!$/)).toBeVisible({ timeout: 10_000 });
  const toss = (await app.bridge.events()).find(
    (e) =>
      e.name === GameEventNames.DiceRoll &&
      (e.data as { rollType: string }).rollType === "Coin Toss"
  );
  const teams = await app.bridge.teams();
  const homeTeam = fixtureValue(teams.find((t) => t.name === home));
  const winner = (toss?.data as { teamId: string }).teamId;

  await page
    .getByRole("button", {
      name: winner === homeTeam.id ? "KICK" : "RECEIVE",
    })
    .click();

  await expect
    .poll(async () => (await app.bridge.phase()).phase, { timeout: 15_000 })
    .toBe(GamePhase.SETUP);
  await expect
    .poll(async () => (await app.bridge.phase()).activeTeamId, {
      timeout: 15_000,
    })
    .toBe(homeTeam.id);
  await expect(page.getByTestId("setup-checklist")).toBeVisible({
    timeout: 15_000,
  });
  await app.pitch.waitForCameraToSettle();
}

async function loadPreset(page: Page, name: RegExp): Promise<void> {
  await pickFormation(page, name);
  await expect(page.getByTestId("setup-checklist")).toContainText(
    "Players placed 7/7"
  );
}

async function clearPitch(page: Page): Promise<void> {
  await page.getByRole("button", { name: /CLEAR/ }).first().click();
  await expect(page.getByTestId("setup-checklist")).toContainText(
    "Players placed 0/7"
  );
}

async function markPoint(page: Page, at: Square): Promise<void> {
  await page.evaluate(({ x, y }) => {
    const ring = document.createElement("div");
    ring.id = "grid-pick-mark";
    ring.style.cssText = `position:fixed;left:${String(x - 7)}px;top:${String(y - 7)}px;width:14px;height:14px;border:3px solid #ff2d55;border-radius:50%;pointer-events:none;z-index:99999`;
    document.body.appendChild(ring);
  }, at);
}

async function clearMark(page: Page): Promise<void> {
  await page.evaluate(() =>
    document.getElementById("grid-pick-mark")?.remove()
  );
}
