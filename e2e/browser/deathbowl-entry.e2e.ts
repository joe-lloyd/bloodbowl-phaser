import { test, expect, type Page } from "@playwright/test";
import { GameBridge } from "../support/pages/bridge";
import { snapshotHash } from "../../src/simulation/runMatch";
import { GamePhase } from "../../src/types/GameState";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { serializeMatchSave } from "../../src/headless/serialization";
import { dehydrateTeam } from "../../src/data/persistence/teamPersistence";
import { arenaSquad } from "../../src/game/deathbowl/squad";
import { RosterName } from "../../src/types/Team";

const SLOT = "bloodbowl_deathbowl_match_save";
const SEVENS_SLOT = "bloodbowl_local_match_save";
const SEVENS_SAVE = serializeMatchSave(new HeadlessGame({ seed: 7 }).matchSave());

function libraryTeams(): string {
  const ready = arenaSquad(RosterName.HUMAN, "Deathbowl Humans", 0x1e90ff);
  const short = arenaSquad(RosterName.ORC, "Short Orcs", 0x228b22);
  short.players = short.players.slice(0, 7);
  return JSON.stringify([ready, short].map((team) => dehydrateTeam(team)));
}

async function seedTeams(page: Page) {
  await page.goto("/");
  await page.evaluate(
    ([teams, sevens]) => {
      localStorage.clear();
      localStorage.setItem("bloodbowl_teams", teams);
      localStorage.setItem("bloodbowl_local_match_save", sevens);
    },
    [libraryTeams(), SEVENS_SAVE] as const
  );
}

async function shoot(page: Page, name: string) {
  await page.screenshot({ path: test.info().outputPath(`${name}.png`) });
}

async function setUpNorth(page: Page) {
  const controls = page.getByTestId("setup-controls");
  await controls.waitFor({ timeout: 120_000 });
  await expect(controls.getByPlaceholder("Formation name…")).toBeHidden();
  await expect(controls.getByRole("button", { name: "SAVE" })).toBeHidden();
  await controls.getByRole("button", { name: "LOAD" }).click();
  const confirm = controls.getByRole("button", { name: "CONFIRM SETUP" });
  await expect(confirm).toBeEnabled({ timeout: 10_000 });
  await confirm.click();
}

async function playRound(page: Page, bridge: GameBridge, humanId: string) {
  const seen = new Set<string>();
  await expect(async () => {
    const snapshot = await bridge.snapshot();
    if (snapshot.phase === GamePhase.PLAY) seen.add(snapshot.turn.teamId);
    const endTurn = page.getByTestId("end-turn");
    if (snapshot.activeTeamId === humanId && (await endTurn.isEnabled().catch(() => false)))
      await endTurn.click({ timeout: 1000 }).catch(() => undefined);
    expect(seen.size).toBe(4);
  }).toPass({ timeout: 600_000, intervals: [500] });
  return seen;
}

async function humanTurnAtRest(page: Page, bridge: GameBridge, humanId: string) {
  await expect(async () => {
    const snapshot = await bridge.snapshot();
    expect(snapshot.phase).toBe(GamePhase.PLAY);
    expect(snapshot.activeTeamId).toBe(humanId);
    await expect(page.getByTestId("end-turn")).toBeEnabled({ timeout: 500 });
  }).toPass({ timeout: 600_000, intervals: [500] });
}

async function settledHumanTurn(page: Page, bridge: GameBridge, humanId: string) {
  let settled: Awaited<ReturnType<GameBridge["snapshot"]>> | undefined;
  await expect(async () => {
    await humanTurnAtRest(page, bridge, humanId);
    const first = snapshotHash(await bridge.snapshot());
    await page.waitForTimeout(1500);
    const snapshot = await bridge.snapshot();
    expect(snapshot.activeTeamId).toBe(humanId);
    expect(snapshotHash(snapshot)).toBe(first);
    settled = snapshot;
  }).toPass({ timeout: 600_000, intervals: [500] });
  if (!settled) throw new Error("The human turn never settled.");
  return settled;
}

test("an admin plays a Deathbowl round against three computer teams, saves and resumes", async ({ page }) => {
  test.setTimeout(1_200_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  page.on("dialog", (dialog) => void dialog.accept());
  await page.setViewportSize({ width: 1280, height: 800 });
  await seedTeams(page);

  await page.goto("/");
  await page.getByRole("button", { name: "New Match" }).click();
  await expect(page).toHaveURL(/\/deathbowl$/);
  await page.getByRole("button", { name: /Short Orcs/ }).click();
  await expect(page.getByTestId("deathbowl-entry")).toContainText("DB-D1");
  await expect(page.getByRole("button", { name: /Start Match/ })).toBeDisabled();
  await shoot(page, "lobby-blocked");
  await page.getByRole("button", { name: /Deathbowl Humans/ }).click();
  await expect(page.getByTestId("deathbowl-entry")).toContainText("Ready to enter");
  await shoot(page, "lobby");
  await page.getByRole("button", { name: /Start Match/ }).click();
  await expect(page).toHaveURL(/\/deathbowl\/play$/);

  const bridge = new GameBridge(page);
  await bridge.waitForReady(120_000);
  const opening = await bridge.snapshot();
  const humanId = opening.teams[0]?.id ?? "";
  await setUpNorth(page);
  await shoot(page, "setup-done");
  const turns = await playRound(page, bridge, humanId);
  expect(turns.size).toBe(4);
  await shoot(page, "desktop-round");
  await page.setViewportSize({ width: 844, height: 390 });
  await shoot(page, "phone-landscape");
  await page.setViewportSize({ width: 1280, height: 800 });

  const before = snapshotHash(await settledHumanTurn(page, bridge, humanId));
  const saved = await page.evaluate((key) => localStorage.getItem(key), SLOT);
  expect(saved).not.toBeNull();

  await page.reload();
  await bridge.waitForReady(120_000);
  await humanTurnAtRest(page, bridge, humanId);
  const after = snapshotHash(await bridge.snapshot());
  expect(after).toBe(before);
  await expect(page.getByTestId("match-loading")).toHaveCount(0, { timeout: 120_000 });
  await shoot(page, "resumed");

  await page.goto("/");
  await expect(page.getByTestId("resume-local-match")).toContainText("Resume local match");
  await expect(page.getByRole("button", { name: "Resume Match" })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), SEVENS_SLOT)).toBe(SEVENS_SAVE);
  expect(errors.filter((message) => !message.includes("DB-F2"))).toEqual([]);
});
