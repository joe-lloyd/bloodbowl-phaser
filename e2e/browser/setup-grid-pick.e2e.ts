/**
 * During setup a player is picked up by the grid square they stand on, not
 * by their body. A big player's figure reaches up over the square behind
 * them; pressing there must pick up whoever stands in that square, or
 * nothing when it is empty. Pressing a player's own square still drags them,
 * and drops land on squares as before.
 *
 * The Underworld Denizens seed team brings a Troll (roster index 3) and
 * Snotlings (4-6). The Balanced preset puts the Troll on (4, 2); each case
 * then moves a Snotling from (2, 4) onto (3, 1), the square straight behind
 * the Troll on screen, where the Troll's body covers it.
 *
 * Once setup is over the dugout is picked by figure again, so hovering a
 * reserve's body shows their details as it always did.
 *
 * SHOTS=<dir> also saves a screenshot before each press, with the pressed
 * point marked, and the measured points and picked players as JSON.
 */
import { test, expect, Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { GameApp } from "../support/pages/game";
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
/** Straight behind the Troll on screen, inside the Troll's figure. */
const BEHIND = { x: 3, y: 1 };
/**
 * A point in the empty square (3, 2) beside and behind the Troll, about
 * 20px left of and 30px above the Troll's feet: on the Troll's body, off
 * the Troll's square. Given as the "square" whose centre is that point, so
 * the bridge's own projection places it.
 */
const OVERHANG_EMPTY = { x: 4 - 0.809, y: 2 - 0.405 };
/** Empty squares in the home setup zone to drop on. */
const DROP_A = { x: 1, y: 3 };
const DROP_B = { x: 1, y: 5 };
/**
 * The home dugout's reserves, in slot order: (6, -2), (7, -2), (8, -2),
 * (9, -2), then (6, -3), (7, -3), (8, -3). The Troll fills slot 3, and the
 * last Snotling stands in slot 6, straight behind the Troll on screen.
 */
const DUGOUT_TROLL = { x: 9, y: -2 };
const DUGOUT_BEHIND = { x: 8, y: -3 };
const DUGOUT_DROP = { x: 5, y: 5 };
/** Outside the home setup zone: a drop here sends the player to the dugout. */
const OFF_ZONE = { x: 10, y: 5 };
/**
 * The empty KO square straight behind the first reserves slot, (6, -2), on
 * screen: a reserve standing there reaches over it.
 */
const BEHIND_RESERVE_SLOT = { x: 5, y: -3 };

type Positions = Record<string, Square | null>;

test("setup picks players up by their grid square, not their body", async ({
  page,
}) => {
  // A real match from the menu, slow under a full parallel run
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  const app = new GameApp(page);
  const measurements: unknown[] = [];
  let shot = 0;

  await startSetup(page, app, UNDERWORLD);
  const team = (await app.bridge.teams()).find((t) => t.name === UNDERWORLD)!;
  const id = (index: number) => team.players[index].id;

  const positions = async (): Promise<Positions> => {
    const snapshot = await app.bridge.snapshot();
    const players = snapshot.teams.find((t) => t.id === team.id)!.players;
    return Object.fromEntries(players.map((p) => [p.id, p.position]));
  };
  const moved = (before: Positions, after: Positions) =>
    Object.keys(after).filter(
      (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key])
    );

  /**
   * Press on `from`, drag to the centre of `to` and let go, as a coach
   * would. Returns which players moved and where they ended up.
   */
  const drag = async (name: string, from: Square, to: Square) => {
    const start = await app.pitch.viewportPoint(from);
    const end = await app.pitch.viewportPoint(to);
    const before = await positions();
    if (process.env.SHOTS) {
      const file = `${process.env.SHOTS}/${String(++shot).padStart(2, "0")}-${name}`;
      await markPoint(page, start);
      await page.screenshot({ path: `${file}.png` });
      // A close-up around the pressed point, small enough to read at a glance
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
    // Let the drop settle through the engine and the dugout refresh
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

  /** Balanced preset, then a Snotling straight behind the Troll. */
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
      // Every other player is on the pitch, so the Troll takes the first
      // reserves slot; its figure reaches over the empty square behind it
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
    if (process.env.SHOTS) {
      writeFileSync(
        `${process.env.SHOTS}/measurements.json`,
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
  // Snotling Founders bring eight players: one stays in reserve
  await startSetup(page, app, SNOTLINGS);
  const team = (await app.bridge.teams()).find((t) => t.name === SNOTLINGS)!;
  const reserve = team.players[7].id;

  for (let side = 0; side < 2; side++) {
    await loadPreset(page, /balanced/i);
    await page.getByRole("button", { name: /CONFIRM SETUP/ }).click();
    await page.waitForTimeout(800);
  }
  await expect
    .poll(async () => (await app.bridge.phase()).phase, { timeout: 15_000 })
    .not.toBe(GamePhase.SETUP);
  const snapshot = await app.bridge.snapshot();
  const players = snapshot.teams.find((t) => t.id === team.id)!.players;
  expect(players.find((p) => p.id === reserve)?.position).toBeNull();

  // Off the dugout first, so moving onto the reserve is a fresh hover
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
  if (process.env.SHOTS) {
    await markPoint(page, body);
    await page.screenshot({
      path: `${process.env.SHOTS}/reserve-hover-after-setup.png`,
    });
    await clearMark(page);
  }
});

/**
 * Seed the rosters, start `home` against Humans, and play the coin toss so
 * the `home` coach kicks and sets up first. Ends on that setup screen.
 */
async function startSetup(
  page: Page,
  app: GameApp,
  home: string
): Promise<void> {
  page.on("dialog", (dialog) => void dialog.accept());
  // Every seed team at full strength: this is about setting up 7
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

  const flip = page.getByRole("button", { name: "FLIP COIN" });
  await expect(flip).toBeVisible({ timeout: 45_000 });
  await flip.click();
  await expect(page.getByText(/Wins!$/)).toBeVisible({ timeout: 10_000 });
  const toss = (await app.bridge.events()).find(
    (e) =>
      e.name === GameEventNames.DiceRoll &&
      (e.data as { rollType: string }).rollType === "Coin Toss"
  );
  const teams = await app.bridge.teams();
  const homeTeam = teams.find((t) => t.name === home)!;
  const winner = (toss?.data as { teamId: string }).teamId;
  // The kicking team sets up first
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
  const select = page
    .locator("select")
    .filter({ has: page.locator("optgroup[label=Presets]") });
  const options = await select
    .locator("optgroup[label=Presets] option")
    .allTextContents();
  await select.selectOption(options.find((o) => name.test(o))!);
  await page.getByRole("button", { name: /LOAD/ }).click();
  await expect(page.getByTestId("setup-checklist")).toContainText(
    "Players placed 7/7"
  );
}

/** Send every player back to the dugout. */
async function clearPitch(page: Page): Promise<void> {
  await page.getByRole("button", { name: /CLEAR/ }).first().click();
  await expect(page.getByTestId("setup-checklist")).toContainText(
    "Players placed 0/7"
  );
}

/** A small ring over the canvas at a viewport point, for screenshots only. */
async function markPoint(page: Page, at: Square): Promise<void> {
  await page.evaluate(({ x, y }) => {
    const ring = document.createElement("div");
    ring.id = "grid-pick-mark";
    ring.style.cssText = `position:fixed;left:${x - 7}px;top:${y - 7}px;width:14px;height:14px;border:3px solid #ff2d55;border-radius:50%;pointer-events:none;z-index:99999`;
    document.body.appendChild(ring);
  }, at);
}

async function clearMark(page: Page): Promise<void> {
  await page.evaluate(() =>
    document.getElementById("grid-pick-mark")?.remove()
  );
}
