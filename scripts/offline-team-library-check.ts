import path from "node:path";
import { chromium } from "@playwright/test";
import { initializeApp } from "firebase/app";
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, doc, getDocFromServer, getFirestore, setDoc } from "firebase/firestore";
import { createComputerTeamFromTemplate, getComputerTeamTemplates } from "../src/competition/computerTeamTemplates";
import { dehydrateTeam } from "../src/data/persistence/teamPersistence";
import { firebaseDocument } from "../src/boundary/firebaseJson";
import { appears, check, failures, serveDist } from "./checkKit";

const DIST = process.argv[2] ?? "dist-e2e";
const PORT = Number(process.argv[3] ?? 5399);
const SHOTS = process.argv[4] ?? ".";
const FIRESTORE_PORT = Number(process.argv[5] ?? 28_080);
const AUTH_PORT = Number(process.argv[6] ?? 29_099);
const EMULATOR_PORTS = new Set([String(FIRESTORE_PORT), String(AUTH_PORT)]);
const PROJECT = "demo-bloodbowl";
const PASSWORD = "offline-library";
const QUIET = { id: "offline-quiet", name: "Quiet Orcs", roster: "Orc" };
const BUSY = { id: "offline-busy", name: "Busy Humans", roster: "Human" };
const SAVE_LIMIT_MS = 8000;

function coachTeam(entry: typeof QUIET, name = entry.name): Record<string, unknown> {
  const template = getComputerTeamTemplates().find((candidate) => candidate.rosterName === entry.roster);
  if (!template) throw new Error(`No computer team for ${entry.roster}`);
  const stored = dehydrateTeam(createComputerTeamFromTemplate(template.id));
  const kept = Object.entries(stored).filter(([key]) => key !== "computerTemplateId");
  return firebaseDocument({ ...Object.fromEntries(kept), id: entry.id, name, computerCoached: false });
}

const email = `offline-${String(Date.now())}@example.test`;
const otherApp = initializeApp({ projectId: PROJECT, apiKey: "demo-api-key" }, "other-device");
const otherAuth = getAuth(otherApp);
connectAuthEmulator(otherAuth, `http://127.0.0.1:${String(AUTH_PORT)}`, { disableWarnings: true });
const { user } = await createUserWithEmailAndPassword(otherAuth, email, PASSWORD);
const uid = user.uid;
const otherDevice = getFirestore(otherApp);
connectFirestoreEmulator(otherDevice, "127.0.0.1", FIRESTORE_PORT, { mockUserToken: { user_id: uid } });
const teamDoc = (id: string) => doc(otherDevice, "users", uid, "teams", id);
await setDoc(teamDoc(QUIET.id), coachTeam(QUIET));
await setDoc(teamDoc(BUSY.id), coachTeam(BUSY));

async function cloudName(id: string): Promise<unknown> {
  const snapshot = await getDocFromServer(teamDoc(id));
  return snapshot.get("name");
}

async function cloudNameBecomes(id: string, name: string): Promise<unknown> {
  let seen = await cloudName(id);
  for (let tries = 0; seen !== name && tries < 40; tries += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    seen = await cloudName(id);
  }
  return seen;
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

async function pageUncached(): Promise<number> {
  return page.evaluate(async () => {
    const files = [
      ...[...document.scripts].map((script) => script.src),
      ...[...document.querySelectorAll("link[rel=stylesheet]")].map((link) => link.getAttribute("href") ?? ""),
    ].filter((file) => file.length > 0);
    const cache = await caches.open("bb-files-v1");
    const found = await Promise.all(files.map((file) => cache.match(new URL(file, location.origin).pathname)));
    return found.filter((response) => response === undefined).length;
  });
}

async function rename(origin: string, entry: typeof QUIET): Promise<number> {
  await page.goto(`${origin}/build-team/${entry.id}`);
  const field = page.getByLabel("Team Name");
  await field.waitFor({ timeout: 30_000 });
  await field.fill(`${entry.name} Offline`);
  const started = Date.now();
  await page.getByRole("button", { name: /^Save Team/ }).click();
  await page.waitForURL((url) => !url.pathname.startsWith(`/build-team/${entry.id}`), { timeout: 30_000 });
  return Date.now() - started;
}

let dist = serveDist(DIST, PORT);
const syncPanel = page.getByTestId("team-sync");

await page.goto(dist.origin);
await page.waitForFunction(() => navigator.serviceWorker.controller?.state === "activated", null, { timeout: 30_000 });
await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
const dialog = page.getByTestId("sign-in-dialog");
await dialog.getByLabel("Email").fill(email);
await dialog.getByLabel("Password").fill(PASSWORD);
await dialog.getByRole("button", { name: "Sign in", exact: true }).click();
await dialog.waitFor({ state: "hidden", timeout: 30_000 });
await page.goto(`${dist.origin}/build-team`);
check("online, the signed-in library shows both cloud teams", await appears(page.getByText(BUSY.name, { exact: true }), 30_000));
check("online, the library says it is synced", await appears(syncPanel.getByText(/Teams synced with your account/), 15_000));
let uncached = await pageUncached();
for (let tries = 0; uncached > 0 && tries < 120; tries += 1) {
  await page.waitForTimeout(500);
  uncached = await pageUncached();
}
check("the app is saved for offline use", uncached === 0, `${String(uncached)} page files missing`);

await context.route((url) => EMULATOR_PORTS.has(url.port), (route) => route.abort("internetdisconnected"));
await dist.stop();
await page.goto(`${dist.origin}/build-team`);
check("offline, the signed-in library opens from this device", await appears(page.getByText(QUIET.name, { exact: true }), 30_000));
check("offline, the library says so", await appears(syncPanel.getByText(/Offline/), 30_000));
await page.screenshot({ path: path.join(SHOTS, "offline-library.png") });

const quietSave = await rename(dist.origin, QUIET);
const busySave = await rename(dist.origin, BUSY);
check("offline saves finish without waiting for the network", Math.max(quietSave, busySave) < SAVE_LIMIT_MS, `${String(quietSave)} ms, ${String(busySave)} ms`);
await page.goto(`${dist.origin}/build-team`);
check("offline, both edits wait to upload", await appears(syncPanel.getByText(/2 team changes saved on this device/), 15_000));
await page.reload();
check("offline edits survive a reload", await appears(page.getByText(`${QUIET.name} Offline`, { exact: true }), 30_000));
await page.screenshot({ path: path.join(SHOTS, "offline-library-waiting.png") });
check("nothing reached the cloud while offline", (await cloudName(QUIET.id)) === QUIET.name);

await setDoc(teamDoc(BUSY.id), coachTeam(BUSY, `${BUSY.name} Elsewhere`));
await context.unrouteAll();
dist = serveDist(DIST, PORT);
await syncPanel.getByRole("button", { name: "Sync now" }).click();
check("back online, the edit made only here uploads", (await cloudNameBecomes(QUIET.id, `${QUIET.name} Offline`)) === `${QUIET.name} Offline`);
const conflict = page.getByRole("alert").filter({ hasText: "changed on another device" });
check("the team changed on both devices asks the coach", await appears(conflict, 15_000));
const conflictText = await conflict.textContent();
check("and names the team", conflictText?.includes(BUSY.name) ?? false);
check("the other device's version stays in the cloud until the coach picks", (await cloudName(BUSY.id)) === `${BUSY.name} Elsewhere`);
await page.screenshot({ path: path.join(SHOTS, "offline-library-conflict.png") });

await conflict.getByRole("button", { name: "Keep this device's version" }).click();
check("keeping this device's version uploads it", (await cloudNameBecomes(BUSY.id, `${BUSY.name} Offline`)) === `${BUSY.name} Offline`);
check("the library is synced again", await appears(syncPanel.getByText(/Teams synced with your account/), 15_000));

await context.close();
await browser.close();
await dist.stop();
process.exitCode = failures.length > 0 ? 1 : 0;
process.exit();
