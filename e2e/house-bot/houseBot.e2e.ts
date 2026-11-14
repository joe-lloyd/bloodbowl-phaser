/**
 * The house bot. One browser, signed in once by hand as the bot's Google
 * account, hosts an online game on the production backend and announces
 * its lobby. An admin joins it from the main menu ("Play the House Bot")
 * and plays the scripted AI. At full time the bot hosts the next game.
 *
 * `pnpm house-bot:login` opens the bot's browser profile for that one
 * sign-in, outside automation so Google allows it. `pnpm house-bot` runs
 * the bot until it is stopped. See README.md beside this file.
 */
import { test, expect, chromium, Page } from "@playwright/test";
import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { GameApp } from "../support/pages/game";
import { OnlinePage } from "../support/pages/online";
import {
  answerDialog,
  brainCall,
  brainNext,
  buildTeam,
  clickIf,
  perform,
  Recorder,
  riskyMoveConfirm,
} from "../fullgame/driver";

const PORT = Number(process.env.HOUSE_BOT_PORT ?? 5299);
const APP_URL = `http://localhost:${PORT}`;
const PROFILE =
  process.env.HOUSE_BOT_PROFILE ?? `${homedir()}/.bb-house-bot/profile`;
const OUT = process.env.HOUSE_BOT_OUT ?? `${homedir()}/.bb-house-bot/logs`;
const TEAM = "House Bot Orcs";
/** Stop after this many matches; 0 runs until stopped. */
const MATCHES = Number(process.env.HOUSE_BOT_MATCHES ?? 0);

mkdirSync(OUT, { recursive: true });
const log = (line: string) => {
  const stamped = `${new Date().toISOString()} ${line}`;
  console.log(stamped);
  appendFileSync(`${OUT}/bot.log`, stamped + "\n");
};
const rec: Recorder = {
  log,
  shot: (page, name) =>
    page.screenshot({ path: `${OUT}/${Date.now()}-${name}.png` }),
};

test("sign the house bot in", async () => {
  test.skip(process.env.HOUSE_BOT_LOGIN !== "1", "pnpm house-bot:login");
  // The plain browser binary, not a Playwright-driven one: Google refuses
  // to sign in a browser under automation
  const browser = spawn(
    chromium.executablePath(),
    [`--user-data-dir=${PROFILE}`, "--no-first-run", APP_URL],
    { stdio: "ignore" }
  );
  log("Sign in with the bot's Google account, then close the browser window.");
  await new Promise((resolve) => browser.on("exit", resolve));
  log("Browser closed. Start the bot with pnpm house-bot.");
});

test("the house bot hosts games until stopped", async () => {
  test.skip(process.env.HOUSE_BOT_LOGIN === "1", "signing in instead");
  const context = await chromium.launchPersistentContext(PROFILE, {
    headless: process.env.HOUSE_BOT_HEADED !== "1",
    baseURL: APP_URL,
    viewport: { width: 1280, height: 800 },
  });
  // The app announces this browser's lobby as the house bot's
  await context.addInitScript(() => localStorage.setItem("bb-house-bot", "1"));
  const page = context.pages()[0] ?? (await context.newPage());
  page.on("dialog", (dialog) => void dialog.accept());

  await page.goto("/");
  const signOut = page.getByRole("button", { name: /sign out/i });
  await signOut.waitFor({ timeout: 60_000 }).catch(() => {
    throw new Error("The bot is not signed in. Run pnpm house-bot:login.");
  });
  await ensureTeam(page);

  for (let played = 0; MATCHES === 0 || played < MATCHES; played++) {
    await page.goto("/");
    await signOut.waitFor({ timeout: 60_000 });
    const code = await new OnlinePage(page).hostGame();
    log(`waiting in lobby ${code}`);
    await waitForGuestAndStart(page);
    log(`match ${code} started`);
    await playMatch(page);
    await leaveFullTime(page);
    log(`match ${code} over`);
  }
  await context.close();
});

/** The bot's own team, drafted once. */
async function ensureTeam(page: Page) {
  await page.goto("/build-team");
  if (
    await page
      .getByText(TEAM, { exact: false })
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false)
  )
    return;
  log(`drafting ${TEAM}`);
  await buildTeam(
    page,
    TEAM,
    "Orc",
    [
      "Orc Lineman",
      "Orc Lineman",
      "Orc Lineman",
      "Orc Lineman",
      "Blitzer",
      "Blitzer",
      "Thrower",
    ],
    rec,
    // No skill to pick after a game, so the next one can start at once
    /Matched Play/
  );
  // A saved team reaches the cloud in the background
  await page.waitForTimeout(3000);
}

async function waitForGuestAndStart(page: Page) {
  const select = page
    .locator("select")
    .filter({ has: page.locator("option", { hasText: TEAM }) });
  await select.waitFor({ timeout: 30_000 });
  await select
    .selectOption({ label: TEAM })
    .catch(() => select.selectOption({ index: 1 }));
  const ready = page.getByRole("button", { name: "Ready!" });
  await expect(ready).toBeEnabled({ timeout: 30_000 });
  await ready.click();
  // A guest can take hours to arrive; Start unlocks once they are ready
  const start = page.getByRole("button", { name: "Start Match" });
  await expect(start).toBeEnabled({ timeout: 24 * 60 * 60 * 1000 });
  await start.click();
  await page.waitForURL(/\/online\/play\//, { timeout: 60_000 });
}

/** The scripted AI plays every move that is the bot's to make. */
async function playMatch(page: Page) {
  const app = new GameApp(page);
  let kicked = false;
  for (let i = 0; ; i++) {
    await page.waitForTimeout(250);
    if (await clickIf(page, /^READY — FLIP COIN$/)) continue;
    if (await clickIf(page, /^RECEIVE$/)) continue;
    const next = await brainNext(page).catch(() => null);
    if (next?.over) return;
    if (!(await brainCall(page, "mayAct").catch(() => false))) continue;
    if (await riskyMoveConfirm(page, rec)) continue;
    if (await answerDialog(page, app, i, rec)) continue;
    const c = next?.candidate;
    if (!next || (next as { waiting?: boolean }).waiting || !c) continue;
    if (c.commands[0]?.type === "kick-ball") {
      if (kicked) continue;
      kicked = true;
    }
    if (next.phase === "PLAY") kicked = false;
    log(`${i} ${next.phase}/${next.subPhase ?? "-"} :: ${c.label}`);
    await perform(page, app, c.commands, next, rec).catch((error: Error) =>
      log(`${i} move failed: ${error.message.split("\n")[0]}`)
    );
    if (next.pending) await brainCall(page, "clearPending");
  }
}

/** MVP, SPP and back to the menu, as a coach would. */
async function leaveFullTime(page: Page) {
  await page.waitForTimeout(3000);
  for (let k = 0; k < 20; k++) {
    if (await clickIf(page, /^Roll MVP D6$/)) {
      await page.waitForTimeout(1200);
      continue;
    }
    if (await clickIf(page, /^Confirm and assign SPP$/)) {
      await page.waitForTimeout(1500);
      continue;
    }
    if (await clickIf(page, /^Continue to Main Menu$/)) return;
    await page.mouse.wheel(0, 800);
    await page.waitForTimeout(500);
  }
  await rec.shot(page, "stuck-at-full-time");
  log("could not leave full time; going back to the menu");
}
