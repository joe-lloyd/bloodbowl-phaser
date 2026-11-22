import { test, chromium, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname } from "node:path";
import { GameApp } from "../support/pages/game";
import { HOUSE_BOT_EMAIL } from "../../src/firebase/houseBotAccount";
import { type Recorder } from "../fullgame/driver";

const CLICK_TIMEOUT_MS = 1000;
const MAX_MISSED_CLICKS = 60;
let missedClicks = 0;

async function press(page: Page, name: RegExp): Promise<boolean> {
  const button = page.getByRole("button", { name }).first();
  if (!(await button.isVisible().catch(() => false))) return false;
  try {
    await button.click({ timeout: CLICK_TIMEOUT_MS });
    missedClicks = 0;
    return true;
  } catch {
    missedClicks++;
    if (missedClicks >= MAX_MISSED_CLICKS)
      throw new Error(`${name.source} stayed visible but took no click`);
    return false;
  }
}

const PORT = Number(process.env["HOUSE_BOT_PORT"] ?? 5299);
const APP_URL = `http://localhost:${String(PORT)}`;
const PROFILE =
  process.env["HOUSE_BOT_PROFILE"] ?? `${homedir()}/.bb-house-bot/profile`;
const OUT = process.env["HOUSE_BOT_OUT"] ?? `${homedir()}/.bb-house-bot/logs`;

const MATCHES = Number(process.env["HOUSE_BOT_MATCHES"] ?? 0);

mkdirSync(OUT, { recursive: true });
const log = (line: string) => {
  const stamped = `${new Date().toISOString()} ${line}`;
  console.log(stamped);
  appendFileSync(`${OUT}/bot.log`, stamped + "\n");
};
const rec: Recorder = {
  log,
  shot: (page, name) =>
    page.screenshot({ path: `${OUT}/${String(Date.now())}-${name}.png` }),
};

test("the house bot hosts games until stopped", async () => {
  const context = await chromium.launchPersistentContext(PROFILE, {
    headless: process.env["HOUSE_BOT_HEADED"] !== "1",
    baseURL: APP_URL,
    viewport: { width: 1280, height: 800 },
  });

  await context.addInitScript((login) => {
    window.__houseBotLogin = login;
    localStorage.setItem("bb-house-bot", "1");
  }, botLogin());
  const page = context.pages()[0] ?? (await context.newPage());
  page.on("dialog", (dialog) => void dialog.accept());
  page.on("console", (message) => {
    if (message.text().includes("[HouseBot]")) log(message.text());
  });

  await page.goto("/");
  const signOut = page.getByRole("button", { name: /sign out/i });
  await signOut.waitFor({ timeout: 60_000 }).catch(() => {
    throw new Error(
      "The bot could not sign in. Is Email/Password sign-in enabled in the Firebase console? See bot.log."
    );
  });
  await logFriendCode(page);

  for (let played = 0; MATCHES === 0 || played < MATCHES; ) {
    await page.goto("/");
    await signOut.waitFor({ timeout: 60_000 });
    await returnToEarlierGame(page);
    if (!(await waitForMatch(page))) continue;
    const match = page.url().split("/").pop() ?? "";
    log(`match ${match} started`);
    if ((await playMatch(page)) === "full time") await leaveFullTime(page);
    log(`match ${match} over`);
    played++;
  }
  await context.close();
});

function botLogin(): { email: string; password: string } {
  const file = `${dirname(PROFILE)}/credentials.json`;
  if (existsSync(file))
    return JSON.parse(readFileSync(file, "utf8")) as {
      email: string;
      password: string;
    };
  const login = {
    email: HOUSE_BOT_EMAIL,
    password: randomBytes(24).toString("base64url"),
  };
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(login), { mode: 0o600 });
  log(`made the bot's login for ${login.email}; kept in ${file}`);
  return login;
}

async function logFriendCode(page: Page) {
  await page.goto("/friends");
  const code = await page
    .locator('[data-testid="friend-code"][data-code]')
    .getAttribute("data-code", { timeout: 30_000 })
    .catch(() => null);
  log(code ? `friend code ${code}` : "no friend code yet");
}

const WAIT_FOR_A_GAME_MS = 24 * 60 * 60 * 1000;
const WAIT_AS_GUEST_MS = 20 * 60 * 1000;

async function readyUp(page: Page) {
  const ready = page.getByRole("button", { name: "Ready!" });
  if (await ready.isEnabled().catch(() => false)) await ready.click();
}

function guestSince(page: Page, since: number | null): number | null {
  if (!page.url().includes("/online/lobby/")) return null;
  return since ?? Date.now();
}

async function returnToEarlierGame(page: Page) {
  const resume = page.getByRole("button", {
    name: /^(Resume Match|Return to Lobby)/,
  });
  const found = await resume
    .first()
    .waitFor({ timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  if (found && (await press(page, /^(Resume Match|Return to Lobby)/))) {
    log("going back to an earlier game");
    return;
  }
  log("waiting for an invite");
}

async function waitForMatch(page: Page): Promise<boolean> {
  const deadline = Date.now() + WAIT_FOR_A_GAME_MS;
  let guest: number | null = null;
  while (Date.now() < deadline) {
    if (page.url().includes("/online/play/")) return true;
    await readyUp(page).catch(() => undefined);
    guest = guestSince(page, guest);
    if (guest !== null && Date.now() - guest > WAIT_AS_GUEST_MS) {
      log("the host never started; leaving the seat");
      await page.getByRole("button", { name: "Leave" }).click().catch(() => undefined);
      await page.waitForURL((url) => url.pathname === "/", { timeout: 10_000 }).catch(() => undefined);
      return false;
    }
    await page.waitForTimeout(2000);
  }
  throw new Error("nobody started a game with the bot in a day");
}

async function answerPrompt(page: Page): Promise<boolean> {
  if (await press(page, /^End Match$/)) {
    log("the other coach ended the match");
    return true;
  }
  return (
    (await press(page, /^READY — ROLL WEATHER$/)) ||
    (await press(page, /^ON TO THE COIN TOSS$/)) ||
    (await press(page, /^READY — FLIP COIN$/)) ||
    (await press(page, /^RECEIVE$/))
  );
}

async function playMatch(page: Page): Promise<"full time" | "ended"> {
  const app = new GameApp(page);
  for (;;) {
    await page.waitForTimeout(250);
    if (!page.url().includes("/online/play/")) return "ended";
    if (await answerPrompt(page)) continue;
    const state = await app.bridge.phase().catch(() => null);
    if (state?.phase === "GAME_OVER") return "full time";
  }
}

async function leaveFullTime(page: Page) {
  await page.waitForTimeout(3000);
  for (let k = 0; k < 20; k++) {
    if (await press(page, /^Roll MVP D6$/)) {
      await page.waitForTimeout(1200);
      continue;
    }
    if (await press(page, /^Confirm and assign SPP$/)) {
      await page.waitForTimeout(1500);
      continue;
    }
    if (await press(page, /^Continue to Main Menu$/)) return;
    await page.mouse.wheel(0, 800);
    await page.waitForTimeout(500);
  }
  await rec.shot(page, "stuck-at-full-time");
  log("could not leave full time; going back to the menu");
}
