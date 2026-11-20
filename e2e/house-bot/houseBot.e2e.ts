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
import { buildTeam, clickIf, type Recorder } from "../fullgame/driver";
import { createComputerTeamFromTemplate } from "../../src/competition/computerTeamTemplates";

const PORT = Number(process.env["HOUSE_BOT_PORT"] ?? 5299);
const APP_URL = `http://localhost:${String(PORT)}`;
const PROFILE =
  process.env["HOUSE_BOT_PROFILE"] ?? `${homedir()}/.bb-house-bot/profile`;
const OUT = process.env["HOUSE_BOT_OUT"] ?? `${homedir()}/.bb-house-bot/logs`;
const TEAM = "House Bot Orcs";
const SQUAD = [
  "human-reroll-mix-roster",
  "chaos-dwarf-big-guns",
  "dark-elf-max-positional",
  "dwarf-max-positional",
  "elven-union-1-reroll",
  "amazon-amazons-0rr",
  "goblin-1-reroll",
  "halfling-best-stuff-roster",
];

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
  await ensureTeams(page);
  await logFriendCode(page);

  for (let played = 0; MATCHES === 0 || played < MATCHES; ) {
    await page.goto("/");
    await signOut.waitFor({ timeout: 60_000 });
    const code = await hostFreshGame(page);
    log(`waiting in lobby ${code}, or for an invite`);
    if (!(await waitForMatch(page))) continue;
    const match = page.url().split("/").pop() ?? code;
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

async function ensureTeams(page: Page) {
  await ensureTeam(page);
  await page.goto("/build-team");
  await page.getByText(TEAM, { exact: false }).first().waitFor({ timeout: 30_000 });
  const listed = await page.locator("main").innerText();
  for (const id of SQUAD) {
    const team = createComputerTeamFromTemplate(id);
    if (listed.includes(team.name)) continue;
    log(`drafting ${team.name} (${team.rosterName})`);
    await buildTeam(
      page,
      team.name,
      team.rosterName,
      team.players.map((player) => player.positionName),
      rec,
      /Matched Play/
    );
  }
}

async function ensureTeam(page: Page) {
  await page.goto("/build-team");

  const drafted = await page
    .getByText(TEAM, { exact: false })
    .first()
    .waitFor({ timeout: 10_000 })
    .then(
      () => true,
      () => false
    );
  if (drafted) return;
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

    /Matched Play/
  );

  await page.waitForTimeout(3000);
}

const WAIT_FOR_A_GAME_MS = 24 * 60 * 60 * 1000;
const WAIT_AS_GUEST_MS = 20 * 60 * 1000;

async function readyUp(page: Page) {
  const select = page.getByLabel("Your team");
  if (!(await select.isVisible().catch(() => false))) return;
  const legal = await select.locator("option").evaluateAll((options) =>
    options.flatMap((option) =>
      option instanceof HTMLOptionElement && option.value && !option.disabled
        ? [{ value: option.value, label: option.text }]
        : []
    )
  );
  const current = await select.inputValue();
  const pick = legal[Math.floor(Math.random() * legal.length)];
  if (pick && !legal.some((option) => option.value === current)) {
    log(`picking ${pick.label}`);
    await select.selectOption(pick.value);
  }
  const ready = page.getByRole("button", { name: "Ready!" });
  if (await ready.isEnabled().catch(() => false)) await ready.click();
}

async function guestSince(page: Page, since: number | null): Promise<number | null> {
  const hosting = await page
    .getByRole("button", { name: "Start Match" })
    .isVisible()
    .catch(() => false);
  if (hosting) return null;
  return since ?? Date.now();
}

async function waitForMatch(page: Page): Promise<boolean> {
  const deadline = Date.now() + WAIT_FOR_A_GAME_MS;
  let guest: number | null = null;
  while (Date.now() < deadline) {
    if (page.url().includes("/online/play/")) return true;
    await readyUp(page).catch(() => undefined);
    const start = page.getByRole("button", { name: "Start Match" });
    if (await start.isEnabled().catch(() => false)) {
      await start.click();
      await page.waitForURL(/\/online\/play\//, { timeout: 60_000 });
      return true;
    }
    guest = await guestSince(page, guest);
    if (guest !== null && Date.now() - guest > WAIT_AS_GUEST_MS) {
      log("the host never started; leaving the seat and hosting again");
      await page.getByRole("button", { name: "Leave" }).click().catch(() => undefined);
      await page.waitForURL((url) => url.pathname === "/", { timeout: 10_000 }).catch(() => undefined);
      return false;
    }
    await page.waitForTimeout(2000);
  }
  throw new Error("nobody started a game with the bot in a day");
}

async function hostFreshGame(page: Page): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    await page.goto("/online/host");
    const code = page.getByTestId("lobby-code");
    const landed = await Promise.race([
      code.waitFor({ timeout: 30_000 }).then(() => "lobby" as const),
      page
        .waitForURL(/\/online\/play\//, { timeout: 30_000 })
        .then(() => "old match" as const),
    ]).catch(() => "nothing" as const);
    if (landed === "lobby") {
      const value = await code.getAttribute("data-code");
      if (value) return value;
    }

    if (landed === "old match") {
      log("hosting resumed an earlier match; finishing it first");
      if ((await playMatch(page)) === "full time") await leaveFullTime(page);
    }
    log(`hosting landed on ${landed}; trying again`);
    await page.goto("/");
    await page.waitForTimeout(5000);
  }
  throw new Error("could not open a fresh lobby");
}

async function answerPrompt(page: Page): Promise<boolean> {
  if (await clickIf(page, /^End Match$/)) {
    log("the other coach ended the match");
    return true;
  }
  return (
    (await clickIf(page, /^READY — ROLL WEATHER$/)) ||
    (await clickIf(page, /^ON TO THE COIN TOSS$/)) ||
    (await clickIf(page, /^Confirm — no purchases$/i)) ||
    (await clickIf(page, /^READY — FLIP COIN$/)) ||
    (await clickIf(page, /^RECEIVE$/))
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
