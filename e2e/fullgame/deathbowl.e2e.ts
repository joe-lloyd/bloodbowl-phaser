import { test, expect, type Page } from "@playwright/test";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { GameApp } from "../support/pages/game";
import { dehydrateTeam } from "../../src/data/persistence/teamPersistence";
import { arenaSquad } from "../../src/game/deathbowl/squad";
import { GamePhase } from "../../src/types/GameState";
import { RosterName } from "../../src/types/Team";
import { DIFFICULTIES, type Difficulty } from "../../src/simulation/ai/difficulty";
import { answerDialog, perform, riskyMoveConfirm, visible, visibleButtons } from "./driver";
import type { SeatNext, SeatTally } from "./brain";

const MAX_ITER = 12_000;
const STALL_MS = 10 * 60_000;
const TURNS_PER_SEAT = 16;
const DIALOG_DECISIONS = new Set(["block-dice", "follow-up", "reroll", "reaction"]);
const out = { dir: "" };

const log = (line: string) => {
  appendFileSync(`${out.dir}/drive.log`, line + "\n");
};
const shot = (page: Page, name: string) => page.screenshot({ path: `${out.dir}/${name}.png` });
const rec = { log, shot };

type Play = Extract<SeatNext, { waiting: false }>;

const seatNext = (page: Page, difficulty: Difficulty): Promise<SeatNext> =>
  page.evaluate(async (level) => {
    const brain = await import("../../e2e/fullgame/brain.ts");
    return brain.seatNext(level);
  }, difficulty);

const seatTally = (page: Page): Promise<SeatTally> =>
  page.evaluate(async () => {
    const brain = await import("../../e2e/fullgame/brain.ts");
    return brain.seatTally();
  });

function libraryTeams(): string {
  const team = arenaSquad(RosterName.HUMAN, "Deathbowl Humans", 0x1e90ff);
  return JSON.stringify([dehydrateTeam(team)]);
}

async function enterLobby(page: Page, difficulty: string) {
  await page.goto("/");
  await page.evaluate((teams) => {
    localStorage.clear();
    localStorage.setItem("bloodbowl_teams", teams);
  }, libraryTeams());
  await page.goto("/");
  await shot(page, "menu");
  await page.getByRole("button", { name: "New Match" }).click();
  await expect(page).toHaveURL(/\/deathbowl$/);
  await page.getByRole("button", { name: /Deathbowl Humans/ }).click();
  await expect(page.getByTestId("deathbowl-entry")).toContainText("Ready to enter");
  await page.getByRole("radio", { name: difficulty }).click();
  await shot(page, "lobby");
  await page.getByRole("button", { name: /Start Match/ }).click();
  await expect(page).toHaveURL(/\/deathbowl\/play$/);
}

async function setUp(page: Page) {
  const controls = page.getByTestId("setup-controls");
  await controls.getByRole("button", { name: "LOAD" }).click();
  const confirm = controls.getByRole("button", { name: "CONFIRM SETUP" });
  await expect(confirm).toBeEnabled({ timeout: 10_000 });
  await confirm.click();
  await page.waitForTimeout(1200);
}

type Command = Play["candidate"]["commands"][number];

async function declare(app: GameApp, command: Extract<Command, { type: "declare-action" }>) {
  const variant = command.blockReplacement ?? command.against;
  await app.hud.declareAction(command.playerId, variant === undefined ? command.action : `${command.action}-${variant}`);
}

async function lend(page: Page, command: Extract<Command, { type: "lend-assists" }>) {
  const sides = [
    ...command.toAttacker.map((id) => `${id}-attacker`),
    ...command.toDefender.map((id) => `${id}-defender`),
  ];
  for (const side of sides) await page.getByTestId(`cross-assist-${side}`).click();
  await page.getByTestId(sides.length > 0 ? "cross-assist-lend" : "cross-assist-none").click();
}

async function intercept(page: Page, playerId: string | undefined, pending: Play["pending"]) {
  const dialog = page.getByTestId("interception-dialog");
  const offered = pending?.type === "interception" ? pending.candidates : [];
  const index = offered.findIndex((offer) => offer.playerId === playerId);
  await (index === -1 ? dialog.getByRole("button", { name: "DECLINE" }) : dialog.getByRole("button").nth(index)).click();
}

async function decide(page: Page, command: Command, pending: Play["pending"]): Promise<boolean> {
  if (command.type === "move-reserve") await page.getByTestId(`reserve-move-${command.playerId}`).click();
  else if (command.type === "keep-reserves") await page.getByTestId("reserve-move-done").click();
  else if (command.type === "lend-assists") await lend(page, command);
  else if (command.type === "choose-interception") await intercept(page, command.playerId, pending);
  else if (command.type === "use-apothecary")
    await page.getByTestId("apothecary-dialog").getByRole("button", { name: command.accept ? "USE APOTHECARY" : "DECLINE" }).click();
  else if (command.type === "choose-foul-assists") await page.getByTestId(`foul-assists-${String(command.count)}`).click();
  else return false;
  return true;
}

async function play(page: Page, app: GameApp, next: Play) {
  const [first] = next.candidate.commands;
  const roll = page.getByTestId("block-roll-dice");
  if (await visible(roll)) {
    await roll.click();
    return;
  }
  if (next.pending && DIALOG_DECISIONS.has(next.pending.type)) {
    if (!(await answerDialog(page, app, -1, rec))) await page.waitForTimeout(300);
    return;
  }
  if (["place-player", "remove-player", "confirm-setup"].includes(first.type)) {
    await setUp(page);
    return;
  }
  if (first.type === "declare-action") {
    await declare(app, first);
    return;
  }
  if (await decide(page, first, next.pending)) return;
  await perform(page, app, next.candidate.commands, next, rec);
}

type Tally = NonNullable<SeatTally>;

function checkFinal(tally: Tally) {
  expect(tally.phase).toBe(GamePhase.GAME_OVER);
  expect(tally.findings).toEqual([]);
  for (const { id, name } of tally.teams) {
    const row = tally.places.find(({ teamId }) => teamId === id);
    expect(row?.points, `${name} points equal the sum of its awards`).toBe(tally.awarded[id] ?? 0);
    expect(tally.turns[id] ?? 0, `${name} turns`).toBeLessThanOrEqual(TURNS_PER_SEAT);
  }
}

function report(tally: Tally) {
  const names = new Map(tally.teams.map(({ id, name }) => [id, name]));
  for (const row of tally.places)
    log(
      `PLACE ${String(row.place)} ${String(names.get(row.teamId))} points=${String(row.points)} touchdowns=${String(row.touchdowns)} turns=${String(tally.turns[row.teamId] ?? 0)}`
    );
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(`page: ${error.message}`);
    log(`PAGEERROR ${error.message}`);
  });
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    errors.push(`console: ${message.text()}`);
    log(`CONSOLE ERROR ${message.text().slice(0, 400)}`);
  });
  page.on("dialog", (dialog) => void dialog.accept());
  return errors;
}

async function unstick(page: Page, app: GameApp, i: number) {
  await shot(page, `stuck-${String(i)}`);
  log(`${String(i)} STUCK buttons=${JSON.stringify(await visibleButtons(page))}`);
  await page.keyboard.press("Escape");
  if (await visible(app.hud.endTurn())) await app.hud.endTurn().click().catch(() => undefined);
}

async function playMatch(page: Page, app: GameApp, difficulty: Difficulty) {
  let lastBoard = "";
  let stuck = 0;
  let changed = Date.now();
  let turns = 0;
  for (let i = 0; i < MAX_ITER; i++) {
    await page.waitForTimeout(150);
    if (await riskyMoveConfirm(page, rec)) continue;
    const next = await seatNext(page, difficulty);
    if (next.over) {
      log(`${String(i)} GAME OVER`);
      return;
    }
    if (next.board !== lastBoard) changed = Date.now();
    if (Date.now() - changed > STALL_MS) {
      await shot(page, `stalled-${String(i)}`);
      throw new Error(`The match stalled at step ${String(i)}: buttons=${JSON.stringify(await visibleButtons(page))}`);
    }
    stuck = next.board === lastBoard && !next.waiting ? stuck + 1 : 0;
    lastBoard = next.board;
    if (next.waiting) {
      await page.waitForTimeout(400);
      continue;
    }
    if (stuck >= 10) {
      await unstick(page, app, i);
      stuck = 0;
      continue;
    }
    if (stuck === 0)
      log(`${String(i)} ${new Date().toISOString().slice(11, 19)} ${next.phase} ${next.pending?.type ?? ""} :: ${next.candidate.label}`);
    if (next.candidate.kind === "end-turn") await shot(page, `turn-${String(++turns).padStart(2, "0")}`);
    await play(page, app, next).catch(async (error: unknown) => {
      log(`${String(i)} perform failed: ${String(error).split("\n", 1)[0] ?? ""}`);
      log(`  buttons=${JSON.stringify(await visibleButtons(page))}`);
    });
  }
  throw new Error(`The match did not finish in ${String(MAX_ITER)} steps.`);
}

test.use({ trace: { mode: "on", screenshots: false, snapshots: true } });

const PLAYED = DIFFICULTIES.filter(({ id }) => id !== "legend");

for (const { id, label } of PLAYED) {
  test(`a full Deathbowl Sevens match at ${label}, from the admin menu to the placings`, async ({ page }) => {
    test.setTimeout(4 * 60 * 60_000);
    out.dir = test.info().outputPath();
    mkdirSync(out.dir, { recursive: true });
    writeFileSync(`${out.dir}/drive.log`, "");
    const errors = watchErrors(page);
    const app = new GameApp(page);
    const started = Date.now();

    await enterLobby(page, label);
    await app.bridge.waitForReady(120_000);
    await page.getByTestId("setup-controls").waitFor({ timeout: 120_000 });
    await playMatch(page, app, id);

    await expect(page.locator('[data-testid^="placing-"]')).toHaveCount(4, { timeout: 120_000 });
    await page.waitForTimeout(2000);
    await shot(page, "placings");
    const tally = await seatTally(page);
    if (!tally) throw new Error("The match was not running at full time.");
    report(tally);
    log(`RUN ${String(Math.round((Date.now() - started) / 60_000))} minutes`);
    writeFileSync(`${out.dir}/final.json`, JSON.stringify(tally, null, 2));
    checkFinal(tally);
    expect(errors).toEqual([]);
  });
}
