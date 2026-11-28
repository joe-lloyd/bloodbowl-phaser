import { test, expect, type Page } from "@playwright/test";
import { GameBridge } from "../support/pages/bridge";
import { PitchPage, type Square } from "../support/pages/pitch";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { serializeMatchSave } from "../../src/headless/serialization";
import { stabilizeIds } from "../../src/headless/createHeadlessGame";
import { arenaSquad } from "../../src/game/deathbowl/squad";
import { placeBall } from "../../src/game/rules/balls";
import { movePlayerToBox } from "../../src/game/rules/playerLocation";
import { DEATHBOWL_FORMAT } from "../../src/game/variants/activeMatch";
import { enumerateDecision } from "../../src/simulation/candidates";
import { GamePhase } from "../../src/types/GameState";
import type { Player } from "../../src/types/Player";
import { RosterName } from "../../src/types/Team";

const SLOT = "bloodbowl_deathbowl_match_save";
const SEATS = [
  [RosterName.HUMAN, "Deathbowl Humans", 0x1e90ff],
  [RosterName.ORC, "Arena Orcs", 0xdc143c],
  [RosterName.SKAVEN, "Arena Skaven", 0x2e8b57],
  [RosterName.DWARF, "Arena Dwarfs", 0xdaa520],
] as const;

const BLITZER = { from: { x: 11, y: 6 }, to: { x: 12, y: 6 } };
const SCORER = { from: { x: 13, y: 19 }, to: { x: 13, y: 20 } };
const HELPER = { x: 12, y: 11 };
const SOUTH_CARRIER = { x: 12, y: 12 };
const EAST_BLOCKER = { x: 13, y: 12 };
const WEST_HELPER = { x: 8, y: 11 };
const SOUTH_TARGET = { x: 8, y: 12 };
const WEST_BLOCKER = { x: 7, y: 12 };
const CENTRE_GUARDS = [
  { index: 0, at: { x: 9, y: 9 } },
  { index: 1, at: { x: 11, y: 9 } },
  { index: 3, at: { x: 10, y: 11 } },
] as const;

async function setUp(game: HeadlessGame): Promise<void> {
  while (game.ctx.gameService.getPhase() === GamePhase.SETUP) {
    const { candidates } = await enumerateDecision(game, null);
    const [candidate] = candidates;
    if (!candidate) throw new Error("No seat could set up.");
    for (const command of candidate.commands) await game.execute(command);
  }
  while (game.ctx.gameService.getActiveTeamId() !== "seat0")
    await game.execute({ type: "end-turn" });
}

function fielded(game: HeadlessGame, seat: number, index: number): Player {
  const team = game.ctx.teams[seat];
  const player = team?.players.filter(({ gridPosition }) => gridPosition)[index];
  if (!player) throw new Error(`Seat ${String(seat)} has no player ${String(index)}.`);
  return player;
}

function stand(game: HeadlessGame, player: Player, at: Square): Player {
  const taken = game.ctx.gameService.getPlayerAt(at.x, at.y);
  if (taken) movePlayerToBox(taken, { box: "reserves" });
  movePlayerToBox(player, { box: "pitch", position: at });
  return player;
}

async function seededMatch() {
  const teams = SEATS.map(([roster, name, colour], seat) =>
    stabilizeIds(arenaSquad(roster, name, colour), `seat${String(seat)}`)
  );
  const game = new HeadlessGame({ teams, seed: 11, startingPhase: GamePhase.SETUP, format: DEATHBOWL_FORMAT });
  await setUp(game);
  const state = game.ctx.gameService.getState();
  movePlayerToBox(fielded(game, 0, 7), { box: "reserves" });
  stand(game, fielded(game, 0, 2), BLITZER.from);
  stand(game, fielded(game, 0, 5), SCORER.from);
  stand(game, fielded(game, 0, 6), HELPER);
  stand(game, fielded(game, 2, 0), SOUTH_CARRIER);
  stand(game, fielded(game, 1, 0), EAST_BLOCKER).stats.ST = 4;
  stand(game, fielded(game, 0, 4), WEST_HELPER);
  stand(game, fielded(game, 2, 1), SOUTH_TARGET);
  stand(game, fielded(game, 3, 0), WEST_BLOCKER).stats.ST = 4;
  state.points = { seat0: 0, seat1: 0, seat2: 30, seat3: 0 };
  const guards = CENTRE_GUARDS.map(({ index, at }) => ({ guard: fielded(game, 0, index), at }));
  for (const { guard, at } of guards) stand(game, guard, at);
  const north = teams[0]?.players ?? [];
  for (const player of north) Object.assign(player.stats, { ST: 7, AV: 11 });
  placeBall(state, 0, SCORER.from);
  placeBall(state, 1, SOUTH_CARRIER);
  return game;
}

function saveOf(game: HeadlessGame): string {
  return serializeMatchSave({ ...game.matchSave(), computer: { humanTeamId: "seat0", difficulty: "standard" } });
}

async function fullTimeSave(): Promise<string> {
  const game = await seededMatch();
  const state = game.ctx.gameService.getState();
  state.turn.isHalf2 = true;
  state.points = { seat0: 22, seat1: 10, seat2: 10, seat3: 3 };
  state.score = { seat0: 2, seat1: 1, seat2: 1, seat3: 0 };
  game.ctx.gameService.seedTurnCounts(8);
  const save = { ...game.matchSave(), computer: { humanTeamId: "seat0", difficulty: "standard" } };
  const { turnManager } = save;
  if (!turnManager) throw new Error("The save has no turn order.");
  return serializeMatchSave({ ...save, turnManager: { ...turnManager, rotation: -1 } });
}

async function openSave(page: Page, save: string) {
  await page.goto("/");
  await page.evaluate(([key, value]) => {
    localStorage.clear();
    localStorage.setItem(key, value);
  }, [SLOT, save] as const);
  await page.goto("/deathbowl/play");
  const bridge = new GameBridge(page);
  const pitch = new PitchPage(page);
  await pitch.waitForCanvas(120_000);
  await expect(page.getByTestId("match-loading")).toHaveCount(0, { timeout: 120_000 });
  await expect(page.getByTestId("end-turn")).toBeEnabled({ timeout: 120_000 });
  return { bridge, pitch };
}

const ballsOf = async (bridge: GameBridge) => {
  const snapshot = await bridge.snapshot();
  return [snapshot.ballPosition, ...(snapshot.extraBalls ?? [])];
};

async function planAndGo(page: Page, pitch: PitchPage, to: Square) {
  await pitch.clickSquare(to);
  await page.getByTestId("action-plan-go").click();
}

async function endTurn(page: Page) {
  const box = await page.getByTestId("end-turn").boundingBox({ timeout: 5000 });
  if (!box) throw new Error("The End Turn button is not on screen.");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(900);
  await page.mouse.up();
}

async function answerOtherDecision(page: Page) {
  const dialog = page.locator("[data-decision-dialog]").first();
  const testId = await dialog.getAttribute("data-testid", { timeout: 500 }).catch(() => null);
  if (testId === null || testId === "cross-assist-prompt") return;
  await dialog.locator("button:enabled").first().click({ timeout: 1000 }).catch(() => undefined);
}

async function playUntilAssistAsked(page: Page, bridge: GameBridge) {
  const prompt = page.getByTestId("cross-assist-prompt");
  await expect(async () => {
    await answerOtherDecision(page);
    const { activeTeamId } = await bridge.snapshot();
    const mayEnd = await page.getByTestId("end-turn").isEnabled({ timeout: 500 }).catch(() => false);
    if (activeTeamId === "seat0" && mayEnd && !(await prompt.isVisible())) await endTurn(page);
    await expect(prompt).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 2_400_000, intervals: [2000] });
}

async function endActivation(page: Page) {
  const end = page.getByTestId("action-end-activation").or(page.getByTestId("action-forgoe"));
  await end.first().click();
}

for (const { size, use } of [
  { size: "desktop", use: { viewport: { width: 1440, height: 900 } } },
  { size: "phone", use: { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true } },
]) {
  test.describe(size, () => {
    test.use(use);

    test("an admin reads the seats, Blitzes one team, scores and answers both prompts", async ({ page }) => {
      test.setTimeout(3_300_000);
      const errors: string[] = [];
      page.on("pageerror", (error) => {
        errors.push(error.message);
      });
      const shoot = (name: string) => page.screenshot({ path: test.info().outputPath(`${size}-${name}.png`) });
      const game = await seededMatch();
      const { bridge, pitch } = await openSave(page, saveOf(game));

      const board = page.getByTestId("seat-scoreboard");
      await expect(board.locator('[data-testid^="seat-row-"]')).toHaveText([
        /Deathbowl Humans/, /Arena Orcs/, /Arena Skaven/, /Arena Dwarfs/,
      ]);
      await expect(page.getByTestId("seat-row-seat0")).toHaveAttribute("aria-current", "true");
      await expect(page.getByTestId("turn-direction")).toContainText(size === "phone" ? "↻" : "Clockwise ↻");
      if (size === "desktop")
        await expect(page.getByTestId("turn-order")).toHaveText(
          "Order: Deathbowl Humans → Arena Orcs → Arena Skaven → Arena Dwarfs"
        );
      await shoot("scoreboard");

      await pitch.clickSquare(BLITZER.from);
      await expect(page.getByTestId("action-blitz-seat1")).toBeEnabled();
      await expect(page.getByTestId("action-blitz-seat2")).toBeVisible();
      await expect(page.getByTestId("action-blitz-seat3")).toBeVisible();
      await shoot("blitz-menu");
      await page.getByTestId("action-blitz-seat1").click();
      await planAndGo(page, pitch, BLITZER.to);
      await expect.poll(() => bridge.snapshot().then(({ turn }) => turn.spend?.blitzed)).toEqual(["seat1"]);
      await expect(page.getByTestId("seat-row-seat1")).toContainText(size === "phone" ? "Arena Orcs" : "Blitzed");
      await endActivation(page);
      await shoot("blitzed");

      const before = await ballsOf(bridge);
      await pitch.clickSquare(SCORER.from);
      await planAndGo(page, pitch, SCORER.to);
      await expect.poll(() => bridge.snapshot().then(({ score }) => score["seat0"]), { timeout: 60_000 }).toBe(1);
      await expect(page.getByTestId("seat-row-seat0")).toContainText("10");
      await shoot("touchdown");
      await endActivation(page);

      await expect(page.getByTestId("reserve-move-prompt")).toBeVisible({ timeout: 120_000 });
      await shoot("reserve-move");
      await page.locator('[data-testid^="reserve-move-seat0"]').first().click();
      await expect(page.getByTestId("reserve-move-prompt")).toHaveCount(0, { timeout: 60_000 });

      await playUntilAssistAsked(page, bridge);
      await shoot("cross-assist");
      await page.locator('[data-testid^="cross-assist-seat0-"]').first().click();
      await page.getByTestId("cross-assist-lend").click();
      await expect(page.getByTestId("cross-assist-prompt")).toHaveCount(0, { timeout: 60_000 });

      await expect.poll(async () => {
        const now = await ballsOf(bridge);
        return now.every((ball, index) => JSON.stringify(ball) !== JSON.stringify(before[index]));
      }, { timeout: 300_000 }).toBe(true);
      await shoot("both-balls-moved");
      expect(errors).toEqual([]);
    });

    test("full time shows the placings with shared places", async ({ page }) => {
      test.setTimeout(600_000);
      await openSave(page, await fullTimeSave());
      await endTurn(page);
      await expect(page.locator('[data-testid^="placing-"]')).toHaveText([
        "1stDeathbowl Humans222",
        "=2ndArena Orcs101",
        "=2ndArena Skaven101",
        "4thArena Dwarfs30",
      ], { timeout: 120_000 });
      await expect(page.getByTestId("match-results")).toHaveCount(0);
      await page.screenshot({ path: test.info().outputPath(`${size}-placings.png`) });
    });
  });
}
