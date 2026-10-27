/**
 * One full Sevens match played through the real UI, start to finish.
 *
 * Both teams are drafted in the Team Builder (Sevens Skill Selection, a
 * Veteran, re-rolls), picked on Team Selection as a league fixture, set up,
 * kicked off and played to full time by clicking the HUD and the canvas.
 * Then MVP and SPP are confirmed on the results screen and each team's
 * Sevens skill pick is made in Manage Team.
 *
 * Moves are chosen by the simulation's heuristic coach running in the page
 * (brain.ts), but every one is carried out through the controls a coach
 * uses. The log and screenshots land in FULLGAME_OUT; the video lands in
 * the Playwright output folder.
 */
import { test, Page, Locator } from "@playwright/test";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { GameApp } from "../support/pages/game";

const OUT = process.env.FULLGAME_OUT ?? "e2e-results/fullgame-shots";
const LOG = `${OUT}/drive.log`;
const MAX_ITER = Number(process.env.MAX_ITER ?? 4000);
const log = (line: string) => appendFileSync(LOG, line + "\n");
const shot = (page: Page, n: string) =>
  page.screenshot({ path: `${OUT}/${n}.png` });

async function visible(l: Locator): Promise<boolean> {
  return l
    .first()
    .isVisible()
    .catch(() => false);
}

async function buildTeam(
  page: Page,
  name: string,
  roster: string,
  hires: string[]
) {
  await page.goto("/build-team/new-team");
  await page.getByPlaceholder("Enter Team Name").fill(name);
  await page.locator("select").first().selectOption(roster);
  await page.getByPlaceholder("Coach Name").fill(`${name} coach`);
  await page.getByRole("button", { name: /Sevens Skill Selection/ }).click();
  for (const pos of hires) {
    await page
      .getByRole("row")
      .filter({ hasText: pos })
      .getByRole("button", { name: "HIRE" })
      .click();
    await page.waitForTimeout(150);
  }
  await page.getByRole("button", { name: "Make Veteran" }).first().click();
  const reroll = page
    .locator("div.flex.flex-col.gap-1")
    .filter({ has: page.locator("span", { hasText: /^Re-Rolls/ }) })
    .getByRole("button", { name: "+" });
  while (await reroll.isEnabled()) await reroll.click();
  await page.mouse.wheel(0, 3000);
  await page.waitForTimeout(800);
  await shot(page, `team-${roster}`);
  await page.getByRole("button", { name: /Save Team/ }).click();
  await page.waitForURL(/\/build-team$/);
}

type Next = {
  over: boolean;
  phase?: string;
  subPhase?: string | null;
  pending?: { type: string } | null;
  teamId?: string;
  team1Id?: string;
  candidate?: {
    kind: string;
    label: string;
    commands: Record<string, unknown>[];
  } | null;
};

const brainNext = (page: Page): Promise<Next> =>
  page.evaluate(async (BRAIN) => {
    const m = await import(/* @vite-ignore */ BRAIN);
    return m.next();
  }, BRAIN);

const brainCall = (page: Page, fn: string, arg?: string) =>
  page.evaluate(
    async ([f, a, BRAIN]) => {
      const m = await import(/* @vite-ignore */ BRAIN);
      return m[f](a);
    },
    [fn, arg, BRAIN] as const
  );

let turnShots = 0;
/** Served by the Vite dev server, so the page imports the same engine modules. */
const BRAIN = "/e2e/fullgame/brain.ts";
const BLOCK_RANK = ["pow", "pow-dodge", "push", "both-down", "skull"];

/** Click any visible button whose name matches. */
async function clickIf(page: Page, name: RegExp): Promise<boolean> {
  const b = page.getByRole("button", { name });
  if (await visible(b)) {
    await b.first().click();
    return true;
  }
  return false;
}

/** The HUD asks before a Dodge or Rush; the coach already chose to take it. */
async function riskyMoveConfirm(page: Page): Promise<boolean> {
  const b = page.getByRole("button", { name: /^(Dodge!|Rush!|Sprint!)$/ });
  if (!(await visible(b))) return false;
  log(`  confirmed ${await b.first().innerText()}`);
  await b.first().click();
  await page.waitForTimeout(400);
  return true;
}

async function visibleButtons(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .filter((b) => (b as HTMLElement).offsetParent !== null)
      .map((b) =>
        (b.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40)
      )
  );
}

test("a full Sevens match, built and played through the UI", async ({
  page,
}) => {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(LOG, "");
  page.on("dialog", (d) => d.accept());
  page.on("pageerror", (e) => log(`PAGEERROR ${e.message}`));
  const app = new GameApp(page);

  // ---- Draft both teams in the team builder ----
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await buildTeam(page, "Reikland Reavers", "Human", [
    "Human Lineman",
    "Human Lineman",
    "Human Lineman",
    "Human Lineman",
    "Human Blitzer",
    "Human Catcher",
    "Human Thrower",
  ]);
  await buildTeam(page, "Gouged Eye", "Orc", [
    "Orc Lineman",
    "Orc Lineman",
    "Orc Lineman",
    "Orc Lineman",
    "Blitzer",
    "Blitzer",
    "Thrower",
  ]);
  await shot(page, "manage");

  // ---- Pick the fixture ----
  await page.goto("/select-team");
  await page
    .getByRole("button", { name: /Reikland Reavers/ })
    .first()
    .click();
  await page
    .getByRole("button", { name: /Gouged Eye/ })
    .last()
    .click();
  await page.getByRole("checkbox").check();
  await shot(page, "select");
  await page.getByRole("button", { name: /Start Game/ }).click();
  await app.bridge.waitForReady();
  await page
    .getByRole("button", { name: "FLIP COIN" })
    .waitFor({ timeout: 20_000 });

  // ---- Play ----
  let lastKey = "";
  let lastLabel = "";
  let stuck = 0;
  let fallbacks = 0;
  let kicked = false;
  let failures = 0;
  for (let i = 0; i < MAX_ITER; i++) {
    await page.waitForTimeout(120);

    // DOM dialogs come first: in the browser they are the decision.
    if (await clickIf(page, /^FLIP COIN$/)) {
      log(`${i} coin flip`);
      await page.waitForTimeout(2500);
      continue;
    }
    if (await riskyMoveConfirm(page)) continue;
    if (await clickIf(page, /^RECEIVE$/)) {
      log(`${i} chose receive`);
      continue;
    }

    const blockDialog = app.hud.blockDiceDialog();
    if (await visible(blockDialog)) {
      const roll = page.getByTestId("block-roll-dice");
      if (await visible(roll)) {
        await roll.click();
        await page.waitForTimeout(900);
        continue;
      }
      const faces = await blockDialog
        .locator("[data-block-result]")
        .evaluateAll((els) =>
          els.map((e) => e.getAttribute("data-block-result") ?? "")
        );
      const best = Math.min(
        ...faces.map((f) => BLOCK_RANK.indexOf(f)).filter((r) => r >= 0)
      );
      for (const rr of [
        "block-veteran-reroll",
        "block-brawler-reroll",
        "block-team-reroll",
      ]) {
        const b = page.getByTestId(rr);
        if (best >= 3 && (await visible(b)) && (await b.isEnabled())) {
          log(`${i} block dice ${faces.join(",")} -> ${rr}`);
          await b.click();
          await page.waitForTimeout(900);
          break;
        }
      }
      const after = await blockDialog
        .locator("[data-block-result]")
        .evaluateAll((els) =>
          els.map((e) => e.getAttribute("data-block-result") ?? "")
        );
      if (after.length === 0) continue;
      const ranks = after.map((f) => BLOCK_RANK.indexOf(f));
      const pick = ranks.indexOf(Math.min(...ranks.filter((r) => r >= 0)));
      log(`${i} block dice ${after.join(",")} pick ${after[pick]}`);
      await app.hud.chooseBlockDie(Math.max(0, pick)).catch(() => {});
      await page.waitForTimeout(600);
      continue;
    }
    if (await visible(app.hud.followUpDialog())) {
      await app.hud.answerFollowUp(true).catch(() => {});
      log(`${i} follow up`);
      continue;
    }
    if (await visible(app.hud.rerollDialog())) {
      const order = [
        "reroll-use-veteran",
        "reroll-use-skill",
        "reroll-use-team",
        "reroll-decline",
      ];
      for (const id of order) {
        const b = page.getByTestId(id);
        if ((await visible(b)) && (await b.isEnabled())) {
          log(`${i} reroll dialog -> ${id}`);
          await b.click();
          break;
        }
      }
      continue;
    }
    if (await visible(app.hud.reactionDialog())) {
      await app.hud.answerReaction(true).catch(() => {});
      log(`${i} reaction yes`);
      continue;
    }

    const next = await brainNext(page);
    if (next.over) {
      log(`${i} GAME OVER`);
      break;
    }
    const key = JSON.stringify([
      next.phase,
      next.subPhase,
      next.pending?.type,
      next.candidate?.label,
    ]);
    const board = (next as { board?: string }).board ?? key;
    stuck = board === lastKey ? stuck + 1 : 0;
    lastKey = board;
    const fresh = key !== lastLabel;
    lastLabel = key;
    if (stuck === 8) {
      await shot(page, `stuck-${i}`);
      log(
        `${i} STUCK on ${key} buttons=${JSON.stringify(await visibleButtons(page))}`
      );
    }
    if (stuck >= 10) {
      fallbacks++;
      log(`${i} FALLBACK end turn`);
      if (fallbacks > 40) break;
      await page.keyboard.press("Escape");
      if (await visible(app.hud.endTurn()))
        await app.hud
          .endTurn()
          .click()
          .catch(() => {});
      stuck = 0;
      continue;
    }

    const c = next.candidate;
    if (!c) {
      log(`${i} no candidate ${key}`);
      await page.waitForTimeout(400);
      continue;
    }
    if (fresh && process.env.DEBUG_COACH)
      log(`   debug ${JSON.stringify((next as { debug?: unknown }).debug)}`);
    if (fresh)
      log(
        `${i} ${new Date().toISOString().slice(11, 19)} ${next.phase}/${next.subPhase ?? "-"} ${next.pending?.type ?? ""} :: ${c.label}`
      );
    if (c.commands[0]?.type === "kick-ball") {
      if (kicked) {
        await page.waitForTimeout(500);
        continue;
      }
      kicked = true;
    }
    if (next.phase === "PLAY") kicked = false;
    try {
      await perform(page, app, c.commands, next);
      if (next.pending) await brainCall(page, "clearPending");
    } catch (e) {
      const msg = (e as Error).message;
      log(
        `${i} perform failed: ${msg.split("\n")[0]} | ${msg
          .split("\n")
          .filter((l) => /intercept|waiting|subtree/.test(l))
          .slice(0, 3)
          .join(" / ")
          .slice(0, 300)}`
      );
      log(`  buttons=${JSON.stringify(await visibleButtons(page))}`);
      if (failures++ < 3) await shot(page, `fail-${i}`);
    }
  }

  await page.waitForTimeout(3000);
  await shot(page, "end");
  log(`fallbacks=${fallbacks}`);

  // ---- Full time: MVP, SPP, back to the menu ----
  for (let k = 0; k < 12; k++) {
    const buttons = await visibleButtons(page);
    log(`post ${k} buttons=${JSON.stringify(buttons)}`);
    if (await clickIf(page, /^Roll MVP D6$/)) {
      await page.waitForTimeout(1200);
      continue;
    }
    if (await clickIf(page, /Confirm|Record/i)) {
      await page.waitForTimeout(1500);
      await shot(page, `post-${k}`);
      continue;
    }
    if (await clickIf(page, /Leave|Continue|Return|Main Menu|Done/i)) {
      await page.waitForTimeout(2000);
      break;
    }
    await page.mouse.wheel(0, 800);
    await page.waitForTimeout(500);
  }
  await shot(page, "after-match");

  // ---- Manage Team: the Sevens skill pick for each side ----
  for (const team of ["Reikland Reavers", "Gouged Eye"]) {
    await page.goto("/build-team");
    await page.waitForTimeout(800);
    await shot(page, `manage-${team}`);
    log(`manage ${team} buttons=${JSON.stringify(await visibleButtons(page))}`);
    for (let k = 0; k < 15; k++) {
      const recipient = page.getByLabel("Skill Selection recipient");
      const named = page.getByLabel("Named skill");
      if (await visible(recipient)) {
        // Panels list every team's pending pick; work on this team's one.
        const opts = await recipient
          .first()
          .locator("option")
          .allTextContents();
        await recipient.first().selectOption({ index: 1 });
        await page
          .getByLabel("Skill Selection category")
          .first()
          .selectOption({ index: 1 });
        log(`  ${team} recipient ${opts[1]}`);
        await page
          .getByRole("button", { name: "Take a Primary skill" })
          .first()
          .click();
      } else if (await visible(named)) {
        const opts = (
          await named.first().locator("option").allTextContents()
        ).slice(1);
        const prompt = await named.first().locator("xpath=../..").innerText();
        const done = (/Named so far: (.*)\./.exec(prompt)?.[1] ?? "").split(
          ", "
        );
        const pick = opts.find((o) => !done.includes(o)) ?? opts[0];
        log(`  ${prompt.split("\n")[0]} -> ${pick}`);
        await named.first().selectOption(pick);
        await page.getByRole("button", { name: "Name skill" }).first().click();
      } else if (await clickIf(page, /^Roll D3$/)) {
        await page.waitForTimeout(800);
        log(
          `  D3: ${(await page.locator("section").first().innerText()).replace(/\s+/g, " ").slice(0, 300)}`
        );
      } else if (await clickIf(page, /^(Pay|Keep|Release)/)) {
        log(`  drafted-player offer answered`);
      } else break;
      await page.waitForTimeout(500);
      await shot(page, `develop-${team}-${k}`);
    }
  }
  await page.goto("/build-team");
  await page.waitForTimeout(1000);
  await shot(page, "final-manage");
});

async function perform(
  page: Page,
  app: GameApp,
  commands: Record<string, unknown>[],
  next: Next
) {
  for (const command of commands) {
    const t = command.type as string;
    switch (t) {
      case "coin-flip":
        await clickIf(page, /^FLIP COIN$/);
        break;
      case "choose-kick-or-receive":
      case "kick-or-receive":
        await clickIf(page, /^RECEIVE$/);
        break;
      case "apply-formation":
      case "place-player":
      case "auto-setup":
      case "confirm-setup":
      case "setup": {
        // The setup controls: pick a preset, load it, confirm.
        const select = page
          .locator("select")
          .filter({ has: page.locator("optgroup[label=Presets]") });
        const options = await select
          .locator("optgroup[label=Presets] option")
          .allTextContents();
        const want = options.find((o) => /balanced/i.test(o)) ?? options[0];
        await select.selectOption(want);
        await clickIf(page, /LOAD/);
        await page.waitForTimeout(600);
        await clickIf(page, /CONFIRM SETUP/);
        await page.waitForTimeout(1200);
        return;
      }
      case "kick-ball": {
        await app.pitch.clickPlayer(command.playerId as string);
        await page.waitForTimeout(300);
        await app.pitch.clickSquare({
          x: command.x as number,
          y: command.y as number,
        });
        await page.waitForTimeout(300);
        await clickIf(page, /KICK|CONFIRM/i);
        await brainCall(page, "noteKicker", next.teamId);
        await page.waitForTimeout(2500);
        break;
      }
      case "declare-action":
        await app.hud.declareAction(
          command.playerId as string,
          command.action as string
        );
        break;
      case "move": {
        const path = command.path as { x: number; y: number }[];
        for (const sq of [...path, path.at(-1)!]) {
          if (await riskyMoveConfirm(page)) break;
          await app.pitch.clickSquare(sq);
          await page.waitForTimeout(150);
        }
        await riskyMoveConfirm(page);
        await page.waitForTimeout(700);
        const snap = await app.bridge.snapshot();
        const mover = snap.teams
          .flatMap((t) => t.players)
          .find((p) => p.id === command.playerId);
        const to = path.at(-1)!;
        if (
          !mover?.position ||
          mover.position.x !== to.x ||
          mover.position.y !== to.y
        )
          log(
            `  MOVE MISSED: wanted ${to.x},${to.y} got ${JSON.stringify(mover?.position)} status=${mover?.status} active=${JSON.stringify(snap.activePlayer)}`
          );
        break;
      }
      case "jump":
        await app.pitch.clickSquare({
          x: command.x as number,
          y: command.y as number,
        });
        break;
      case "stand-up":
        await app.hud.declareAction(command.playerId as string, "standUp");
        break;
      case "block":
        await app.pitch.clickPlayer(command.defenderId as string);
        await page.waitForTimeout(500);
        break;
      case "pass":
      case "handoff":
      case "foul":
        if (
          t === "pass" &&
          (await visible(page.getByTestId("action-step-pass")))
        )
          await app.hud.selectActionStep("pass").catch(() => {});
        await app.pitch.clickSquare({
          x: command.x as number,
          y: command.y as number,
        });
        await page.waitForTimeout(900);
        break;
      case "end-activation": {
        const b = page.getByRole("button", { name: "End Activation" });
        if (await visible(b)) await b.click();
        else {
          // The menu closes after a move; reopen it on the active player.
          const active = (await app.bridge.snapshot()).activePlayer as {
            id?: string;
            playerId?: string;
          } | null;
          const id = active?.playerId ?? active?.id;
          if (id) await app.pitch.clickPlayer(id);
          await page.waitForTimeout(300);
          if (await visible(b)) await b.click();
          else
            log(
              `  end-activation not offered; buttons=${JSON.stringify(await visibleButtons(page))}`
            );
        }
        break;
      }
      case "end-turn":
        await shot(page, `turn-${String(++turnShots).padStart(2, "0")}`);
        const before = (await app.bridge.events()).length;
        // A team with nobody left to activate ends its own turn after 500 ms.
        await page.waitForTimeout(700);
        if ((await app.bridge.phase()).activeTeamId !== next.teamId) {
          log("   turn already ended by itself");
          break;
        }
        await app.hud.endTurn().click();
        await page.waitForTimeout(1200);
        if (process.env.DEBUG_COACH)
          log(
            `   end-turn events: ${(await app.bridge.events(before))
              .map((e) => e.name)
              .join(", ")
              .slice(0, 1500)}`
          );
        break;
      case "choose-push-direction":
      case "touchback":
        await (t === "touchback"
          ? app.pitch.clickPlayer(command.playerId as string)
          : app.pitch.clickSquare({
              x: command.x as number,
              y: command.y as number,
            }));
        break;
      case "kickoff-confirm":
        if (!(await clickIf(page, /CONFIRM|DONE|CONTINUE/i)))
          await clickIf(page, /SKIP/i);
        break;
      case "kickoff-skip":
        if (!(await clickIf(page, /SKIP/i)))
          await clickIf(page, /CONFIRM|DONE|CONTINUE/i);
        break;
      default:
        log(
          `  no UI mapping for ${t}: buttons=${JSON.stringify(await visibleButtons(page))}`
        );
        await shot(page, `unmapped-${t}`);
        // Try the obvious dialog answer.
        await clickIf(page, /^(YES|USE|CONFIRM|OK|CONTINUE)/i);
    }
    await page.waitForTimeout(150);
  }
}
