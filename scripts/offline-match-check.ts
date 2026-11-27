import { readdir } from "node:fs/promises";
import path from "node:path";
import { chromium, type Locator, type Page } from "@playwright/test";
import spriteManifest from "../src/game/presentation/spriteManifest.json" with { type: "json" };
import {
  createComputerTeamFromTemplate,
  getComputerTeamTemplates,
} from "../src/competition/computerTeamTemplates";
import { dehydrateTeam } from "../src/data/persistence/teamPersistence";
import { appears, check, failures, serveDist } from "./checkKit";

const DIST = process.argv[2] ?? "dist";
const PORT = Number(process.argv[3] ?? 5398);
const SHOTS = process.argv[4] ?? ".";
const OWN_ROSTER = "Orc";
const OPPONENT_ROSTER = "Human";
const UNSAVED_ROSTER = "Skaven";
const dist = serveDist(DIST, PORT);
const ORIGIN = dist.origin;

async function waitOrShoot(locator: Locator, shot: string): Promise<void> {
  if (await appears(locator, 60_000)) return;
  await locator.page().screenshot({ path: path.join(SHOTS, shot) });
  throw new Error(`Stuck waiting for ${locator.toString()}, see ${shot}`);
}

function templateFor(roster: string) {
  const template = getComputerTeamTemplates().find((candidate) => candidate.rosterName === roster);
  if (!template) throw new Error(`No computer team for ${roster}`);
  return template;
}

function ownTeam(): Record<string, unknown> {
  const stored = dehydrateTeam(createComputerTeamFromTemplate(templateFor(OWN_ROSTER).id));
  const kept = Object.entries(stored).filter(([key]) => key !== "computerTemplateId");
  return { ...Object.fromEntries(kept), id: "offline-own", name: "Offline Orcs", computerCoached: false };
}

async function modelUrls(model: string): Promise<string[]> {
  const root = path.join(DIST, "sprites", "bloodbowl", model);
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"))
    .map((rest) => new URL(`/sprites/bloodbowl/${model}/${rest}`, ORIGIN).href);
}

async function artUrls(): Promise<string[]> {
  const positions: Record<string, Record<string, string>> = spriteManifest.positions;
  const models = new Set(
    [OWN_ROSTER, OPPONENT_ROSTER].flatMap((roster) => Object.values(positions[roster] ?? {}))
  );
  const lists = await Promise.all([...models].map((model) => modelUrls(model)));
  return lists.flat();
}

async function missingFromCache(page: Page, urls: string[]): Promise<number> {
  return page.evaluate(async (wanted) => {
    const cache = await caches.open("bb-files-v1");
    const requests = await cache.keys();
    const stored = new Set(requests.map((request) => request.url));
    return wanted.filter((url) => !stored.has(url)).length;
  }, urls);
}

async function waitForArt(page: Page, urls: string[]): Promise<number> {
  let missing = await missingFromCache(page, urls);
  for (let tries = 0; missing > 0 && tries < 240; tries += 1) {
    await page.waitForTimeout(500);
    missing = await missingFromCache(page, urls);
  }
  return missing;
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const lookWarnings: string[] = [];
const art: { url: string; ok: boolean; worker: boolean }[] = [];
page.on("console", (message) => {
  if (message.text().includes("Could not build the player look")) lookWarnings.push(message.text());
});
page.on("response", (answer) => {
  if (!answer.url().includes("/sprites/bloodbowl/")) return;
  art.push({ url: answer.url(), ok: answer.ok(), worker: answer.fromServiceWorker() });
});
page.on("requestfailed", (request) => {
  if (!request.url().includes("/sprites/bloodbowl/")) return;
  art.push({ url: request.url(), ok: false, worker: false });
});

await page.goto(ORIGIN);
await page.waitForFunction(() => navigator.serviceWorker.controller?.state === "activated", null, {
  timeout: 30_000,
});
await page.evaluate(
  ([teams, rosters]) => {
    localStorage.setItem("bloodbowl_teams", teams);
    localStorage.setItem("bloodbowl_offline_rosters", rosters);
  },
  [JSON.stringify([ownTeam()]), JSON.stringify([OWN_ROSTER, OPPONENT_ROSTER])] as const
);
await page.reload();
const urls = await artUrls();
const missing = await waitForArt(page, urls);
check("the saved rosters' art is cached", missing === 0, `${String(missing)} of ${String(urls.length)} missing`);

await page.getByRole("button", { name: "Play Local" }).click();
await page.getByRole("radio", { name: /Versus computer/ }).click();
const offer = page.getByTestId("offline-play");
const offered = await appears(offer.getByRole("button", { name: /Save all \(\d+ MB\)/ }), 15_000);
const offerText = await offer.textContent();
check("online, team select offers to save every roster", offered, offerText ?? "");
await page.goto(ORIGIN);

await context.setOffline(true);
await dist.stop();
await page.reload();
await page.getByRole("button", { name: "Play Local" }).click();
await page.getByRole("radio", { name: /Versus computer/ }).click();
check("team select says the device is offline", await appears(page.getByTestId("offline-notice"), 15_000));

const ownColumn = page.getByTestId("team-column-1");
const computerColumn = page.getByTestId("team-column-2");
const unsaved = computerColumn.getByRole("button", { name: new RegExp(templateFor(UNSAVED_ROSTER).name) });
await appears(unsaved.and(page.locator(":disabled")), 15_000);
const unsavedText = await unsaved.textContent();
check("a computer team without saved art is disabled", await unsaved.isDisabled());
check("it says why", unsavedText?.includes("Not saved offline") ?? false);

await ownColumn.getByRole("button", { name: /Offline Orcs/ }).click();
await computerColumn
  .getByRole("button", { name: new RegExp(templateFor(OPPONENT_ROSTER).name) })
  .first()
  .click();
await page.getByRole("button", { name: /Start Game/ }).click();

const confirm = page.getByRole("button", { name: "Confirm — no purchases", exact: true });
const weather = page.getByRole("button", { name: "ROLL WEATHER", exact: true });
const toss = page.getByRole("button", { name: "FLIP COIN", exact: true });
await waitOrShoot(confirm.or(weather).or(toss), "offline-match-stuck.png");
if (await confirm.isVisible()) await confirm.click();
await waitOrShoot(weather.or(toss), "offline-match-weather.png");
if (await weather.isVisible()) {
  await weather.click();
  await page.getByRole("button", { name: "ON TO THE COIN TOSS", exact: true }).click({ timeout: 45_000 });
}
await waitOrShoot(toss, "offline-match-toss.png");
await toss.click();
const receive = page.getByRole("button", { name: /RECEIVE/i });
if (await appears(receive, 10_000)) await receive.click();
await page.waitForTimeout(8000);
await page.screenshot({ path: path.join(SHOTS, "offline-match.png") });

const served = art.filter((entry) => !entry.url.includes("/sideline_"));
check("player art was requested during the match", served.length > 0, `${String(served.length)} requests`);
check(
  "every player art request was answered by the worker",
  served.every((entry) => entry.ok && entry.worker),
  JSON.stringify(served.filter((entry) => !entry.ok || !entry.worker).slice(0, 3))
);
check("every player look was built", lookWarnings.length === 0, JSON.stringify(lookWarnings.slice(0, 2)));

await context.close();
await browser.close();
process.exitCode = failures.length > 0 ? 1 : 0;
