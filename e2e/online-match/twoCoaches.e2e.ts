/**
 * One online Sevens match between two browsers, each played by its own
 * coach through the real UI, with the connection cut and pages reloaded
 * along the way.
 *
 * The host's browser runs here. The guest's runs wherever GUEST_WS points
 * (a `playwright launch-server` on another machine), or locally without it.
 * Both load APP_URL and talk only through the Firestore emulator that the
 * app was started against, so everything one sees of the other crossed the
 * network.
 *
 * After every move both sides are captured: the engine state each page
 * holds and where each canvas draws the players and the ball. Anything that
 * still differs after a grace period is written to divergences.jsonl with a
 * screenshot from each side.
 */
import {
  expect,
  test,
  chromium,
  Browser,
  BrowserContext,
  Page,
} from "@playwright/test";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
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

const OUT = process.env.ONLINE_OUT ?? "e2e-results/online-match";
const APP_URL = process.env.APP_URL ?? "http://127.0.0.1:5199";
const MAX_ITER = Number(process.env.MAX_ITER ?? 6000);
/** Disruptions, by the number of moves played when each one fires. */
const PLAN = (process.env.DISRUPT ?? "")
  .split(",")
  .filter(Boolean)
  .map((entry) => {
    const [at, what] = entry.split(":");
    return { at: Number(at), what };
  });

type Side = "host" | "guest";
interface Coach {
  side: Side;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  app: GameApp;
  rec: Recorder;
  kicked: boolean;
}

const t0 = Date.now();
const stamp = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(7);
const mainLog = (line: string) =>
  appendFileSync(`${OUT}/match.log`, `${stamp()} ${line}\n`);

function recorder(side: Side): Recorder {
  return {
    log: (line) => mainLog(`[${side}] ${line}`),
    shot: (page, name) =>
      page.screenshot({ path: `${OUT}/${side}-${name}.png` }).catch(() => {}),
  };
}

async function openCoach(side: Side): Promise<Coach> {
  const remote = side === "guest" ? process.env.GUEST_WS : undefined;
  const browser = remote
    ? await chromium.connect(remote)
    : await chromium.launch({
        executablePath: process.env.PW_CHROMIUM || undefined,
      });
  const context = await browser.newContext({
    // The guest's machine reaches the app at its own address
    baseURL:
      side === "guest" ? (process.env.GUEST_APP_URL ?? APP_URL) : APP_URL,
    viewport: { width: 1440, height: 900 },
    recordVideo: {
      dir: `${OUT}/video-${side}`,
      size: { width: 1440, height: 900 },
    },
  });
  const page = await context.newPage();
  const rec = recorder(side);
  page.on("dialog", (dialog) => dialog.accept());
  page.on("pageerror", (error) => rec.log(`PAGEERROR ${error.message}`));
  page.on("console", (message) => {
    const text = message.text();
    if (/\[Online\]|\[Networked\]|rejected|resync/i.test(text))
      rec.log(`console ${text.slice(0, 300)}`);
  });
  return {
    side,
    browser,
    context,
    page,
    app: new GameApp(page),
    rec,
    kicked: false,
  };
}

/** The engine state a page holds, reduced to what both sides must agree on. */
async function engineView(page: Page) {
  return page
    .evaluate(() => {
      const bridge = (window as unknown as Record<string, unknown>)
        .__bbTestBridge as { snapshot(): Record<string, unknown> } | undefined;
      const s = bridge?.snapshot() as
        | {
            phase: string;
            subPhase: string | null;
            activeTeamId: string | null;
            turn: unknown;
            score: unknown;
            weather: unknown;
            ballPosition: unknown;
            activePlayer: unknown;
            teamRerollsUsed?: unknown;
            teams: {
              id: string;
              players: { id: string; position?: unknown; status: string }[];
            }[];
          }
        | undefined;
      if (!s) return null;
      return {
        phase: s.phase,
        subPhase: s.subPhase,
        activeTeamId: s.activeTeamId,
        turn: s.turn,
        score: s.score,
        weather: s.weather,
        ball: s.ballPosition,
        activePlayer: s.activePlayer,
        rerollsUsed: s.teamRerollsUsed ?? null,
        players: Object.fromEntries(
          s.teams.flatMap((t) =>
            t.players.map((p) => [p.id, [p.position ?? null, p.status]])
          )
        ),
      };
    })
    .catch(() => null);
}

const canvasView = (page: Page) =>
  brainCall(page, "view").catch(() => null) as Promise<{
    players: Record<string, string>;
    ball: string;
    hud: string;
  } | null>;

/** Paths where two JSON values differ, for a readable divergence record. */
function diffPaths(a: unknown, b: unknown, path = ""): string[] {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  if (
    a &&
    b &&
    typeof a === "object" &&
    typeof b === "object" &&
    !Array.isArray(a)
  ) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b as object)]);
    return [...keys].flatMap((k) =>
      diffPaths(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
        path ? `${path}.${k}` : k
      )
    );
  }
  return [`${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`];
}

/** Does the canvas draw every on-pitch player where the engine has them? */
function canvasMismatches(
  engine: NonNullable<Awaited<ReturnType<typeof engineView>>>,
  canvas: NonNullable<Awaited<ReturnType<typeof canvasView>>>
): string[] {
  const out: string[] = [];
  for (const [id, [pos, status]] of Object.entries(engine.players) as [
    string,
    [{ x: number; y: number } | null, string],
  ][]) {
    const drawn = canvas.players[id];
    if (drawn === undefined) continue;
    const want = pos ? `${pos.x},${pos.y}` : "off";
    const where = drawn.split(" ")[0];
    if (where !== want)
      out.push(`${id} engine ${want} ${status}, drawn ${drawn}`);
  }
  return out;
}

let checks = 0;
let divergences = 0;

/**
 * Wait for both sides to settle, then compare. Animations and the network
 * both take time, so only a difference that outlasts the grace period
 * counts.
 */
async function compare(
  host: Coach,
  guest: Coach,
  label: string,
  graceMs = 8000
) {
  checks++;
  const deadline = Date.now() + graceMs;
  let problems: string[] = [];
  let views: unknown = null;
  while (Date.now() < deadline) {
    const [he, ge, hc, gc] = await Promise.all([
      engineView(host.page),
      engineView(guest.page),
      canvasView(host.page),
      canvasView(guest.page),
    ]);
    problems = [];
    if (he && ge) problems.push(...diffPaths(he, ge).map((d) => `engine ${d}`));
    if (he && hc)
      problems.push(...canvasMismatches(he, hc).map((d) => `host canvas ${d}`));
    if (ge && gc)
      problems.push(
        ...canvasMismatches(ge, gc).map((d) => `guest canvas ${d}`)
      );
    // Each side marks its own coach "(you)"
    const board = (hud: string) => hud.replace(" (you)", "");
    if (hc && gc && board(hc.hud) !== board(gc.hud))
      problems.push(`scoreboard host "${hc.hud}" vs guest "${gc.hud}"`);
    views = { he, ge, hc, gc };
    if (problems.length === 0) return true;
    await host.page.waitForTimeout(500);
  }
  divergences++;
  const id = `div-${String(divergences).padStart(3, "0")}`;
  mainLog(
    `DIVERGENCE ${id} after "${label}": ${problems.slice(0, 6).join(" | ")}`
  );
  appendFileSync(
    `${OUT}/divergences.jsonl`,
    JSON.stringify({ id, label, problems, views }) + "\n"
  );
  await Promise.all([
    host.rec.shot(host.page, id),
    guest.rec.shot(guest.page, id),
  ]);
  return false;
}

const mayAct = (coach: Coach) =>
  brainCall(coach.page, "mayAct").catch(() => false) as Promise<boolean>;

/**
 * Wait until this coach's page shows the result of what it just did. The
 * guest's moves make a round trip to the host first; without this the
 * coach would plan its next move from the board before the last one.
 */
async function settled(coach: Coach, before: string, ms = 6000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (JSON.stringify(await engineView(coach.page)) !== before) return;
    await coach.page.waitForTimeout(200);
  }
}

/** One move by this coach, if it is theirs to make. Returns what it did. */
async function step(coach: Coach, i: number): Promise<string | null> {
  const { page, app, rec } = coach;
  if (await clickIf(page, /^READY — FLIP COIN$/)) return "ready for the toss";
  if (await clickIf(page, /^RECEIVE$/)) return "chose to receive";
  if (!(await mayAct(coach))) return null;
  const before = JSON.stringify(await engineView(page));
  if (await riskyMoveConfirm(page, rec)) {
    await settled(coach, before);
    return "confirmed a risky move";
  }
  if (await answerDialog(page, app, i, rec)) {
    await settled(coach, before);
    return "answered a dialog";
  }

  const next = await brainNext(page);
  if (next.over) return "over";
  if ((next as { waiting?: boolean }).waiting) return null;
  const c = next.candidate;
  if (!c) return null;
  if (c.commands[0]?.type === "kick-ball") {
    if (coach.kicked) return null;
    coach.kicked = true;
  }
  if (next.phase === "PLAY") coach.kicked = false;
  rec.log(
    `${i} ${next.phase}/${next.subPhase ?? "-"} ${next.pending?.type ?? ""} :: ${c.label}`
  );
  const board = JSON.stringify(await engineView(page));
  await perform(page, app, c.commands, next, rec);
  if (next.pending) await brainCall(page, "clearPending");
  await settled(coach, board);
  return c.label;
}

async function disrupt(what: string, host: Coach, guest: Coach, code: string) {
  const [side, kind, secs] = what.split("-");
  const coach = side === "host" ? host : guest;
  const ms = Number(secs ?? 15) * 1000;
  mainLog(`DISRUPT ${what}`);
  await coach.rec.shot(coach.page, `before-${what}`);
  if (kind === "offline") {
    await coach.context.setOffline(true);
    await coach.page.waitForTimeout(ms);
    await coach.context.setOffline(false);
  } else if (kind === "reload") {
    await coach.page.reload();
  } else if (kind === "away") {
    // The tab closes; the coach comes back to the match later
    await coach.page.close();
    await host.page.waitForTimeout(ms);
    coach.page = await coach.context.newPage();
    coach.app = new GameApp(coach.page);
    coach.page.on("dialog", (dialog) => dialog.accept());
    await coach.page.goto(`/online/play/${code}`);
  }
  await coach.page.waitForTimeout(4000);
  await coach.rec.shot(coach.page, `after-${what}`);
}

test("an online match between two machines stays in sync", async () => {
  test.setTimeout(3 * 60 * 60 * 1000);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/match.log`, "");
  writeFileSync(`${OUT}/divergences.jsonl`, "");

  const host = await openCoach("host");
  const guest = await openCoach("guest");
  mainLog(
    `app ${APP_URL}, guest app ${process.env.GUEST_APP_URL ?? APP_URL}, guest browser ${process.env.GUEST_WS ? "remote" : "local"}`
  );
  mainLog(
    `guest user agent: ${await guest.page.evaluate(() => navigator.userAgent)}`
  );

  // ---- Sign in and draft a team each ----
  for (const coach of [host, guest]) {
    await coach.page.goto("/");
    // A dev server reached over a tunnel takes a while to serve every module
    await coach.page
      .getByRole("button", { name: /sign in with google/i })
      .waitFor({ timeout: 120_000 });
    await new OnlinePage(coach.page).signIn();
  }
  await buildTeam(
    host.page,
    "Reikland Reavers",
    "Human",
    [
      "Human Lineman",
      "Human Lineman",
      "Human Lineman",
      "Human Lineman",
      "Human Blitzer",
      "Human Catcher",
      "Human Thrower",
    ],
    host.rec
  );
  await buildTeam(
    guest.page,
    "Gouged Eye",
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
    guest.rec
  );

  // A saved team reaches the cloud in the background; a reload any sooner
  // would lose it
  await host.page.waitForTimeout(3000);

  // ---- Lobby ----
  const signedIn = (coach: Coach) =>
    coach.page
      .getByRole("button", { name: /sign out/i })
      .waitFor({ timeout: 60_000 });
  await host.page.goto("/");
  await signedIn(host);
  const code = await new OnlinePage(host.page).hostGame();
  mainLog(`lobby ${code}`);
  await guest.page.goto("/");
  await signedIn(guest);
  await new OnlinePage(guest.page).joinGame(code);
  await new OnlinePage(guest.page).expectInLobby(code);
  for (const coach of [host, guest]) {
    // The coach's own team picker, not the pitch picker beside it
    const team = coach === host ? "Reikland Reavers" : "Gouged Eye";
    const select = coach.page
      .locator("select")
      .filter({ has: coach.page.locator("option", { hasText: team }) });
    await select.waitFor({ timeout: 30_000 }).catch(async (error) => {
      coach.rec.log(
        `lobby without ${team}: ${(await coach.page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 600)}`
      );
      await coach.rec.shot(coach.page, "lobby-no-team");
      throw error;
    });
    await select.selectOption({ index: 1 });
    // Ready unlocks once the pick has made the round trip through Firestore
    const ready = coach.page.getByRole("button", { name: "Ready!" });
    await expect(ready).toBeEnabled({ timeout: 30_000 });
    await ready.click();
  }
  await host.rec.shot(host.page, "lobby");
  await guest.rec.shot(guest.page, "lobby");
  const start = host.page.getByRole("button", { name: "Start Match" });
  await expect(start).toBeEnabled({ timeout: 30_000 });
  await start.click();
  await host.page.waitForURL(/\/online\/play\//, { timeout: 30_000 });
  await guest.page.waitForURL(/\/online\/play\//, { timeout: 30_000 });
  // Only the host may read the seed; the lobby both read must not carry it
  for (const coach of [host, guest])
    mainLog(
      `SEED ${coach.side} sees ${JSON.stringify(await brainCall(coach.page, "probeSeed", code))}`
    );

  // ---- Play ----
  let moves = 0;
  let idle = 0;
  const plan = [...PLAN];
  for (let i = 0; i < MAX_ITER; i++) {
    await host.page.waitForTimeout(150);
    if (plan.length && moves >= plan[0].at) {
      const { what } = plan.shift()!;
      await disrupt(what, host, guest, code);
      await compare(host, guest, `after ${what}`, 30_000);
      idle = 0;
      continue;
    }
    let acted = false;
    for (const coach of [host, guest]) {
      const did = await step(coach, i).catch((error: Error) => {
        coach.rec.log(`${i} step failed: ${error.message.split("\n")[0]}`);
        return null;
      });
      if (did === "over") {
        mainLog(`GAME OVER after ${moves} moves`);
        i = MAX_ITER;
        break;
      }
      if (did) {
        acted = true;
        moves++;
        await compare(host, guest, `${coach.side}: ${did}`);
      }
    }
    idle = acted ? 0 : idle + 1;
    if (idle === 60) {
      mainLog(`STALL: nobody can act for ~15 s`);
      await host.rec.shot(host.page, `stall-${i}`);
      await guest.rec.shot(guest.page, `stall-${i}`);
      for (const coach of [host, guest]) {
        coach.rec.log(
          `stall view: mayAct=${await mayAct(coach)} next=${JSON.stringify(await brainNext(coach.page).catch((e) => String(e))).slice(0, 400)}`
        );
      }
    }
    if (idle === 240) {
      mainLog(`GIVING UP: stalled for ~60 s`);
      break;
    }
  }

  await host.page.waitForTimeout(3000);
  await compare(host, guest, "full time", 15_000);
  await host.rec.shot(host.page, "end");
  await guest.rec.shot(guest.page, "end");
  mainLog(`moves=${moves} checks=${checks} divergences=${divergences}`);

  for (const coach of [host, guest]) {
    // A remote browser's video only reaches this machine through saveAs
    const video = coach.page.video();
    await coach.context.close();
    await video
      ?.saveAs(`${OUT}/${coach.side}.webm`)
      .catch((error: Error) =>
        mainLog(`video ${coach.side} not saved: ${error.message}`)
      );
    await coach.browser.close();
  }
});
