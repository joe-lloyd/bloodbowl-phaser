/**
 * Clicks shared by the recorded matches: the local full game, where one page
 * plays both teams, and the online match, where each coach has a page.
 * Every helper acts through the controls a coach uses.
 */
import { Page, Locator } from "@playwright/test";
import { GameApp } from "../support/pages/game";

type Square = { x: number; y: number };

/** Where a run writes its move log and screenshots. */
export interface Recorder {
  log(line: string): void;
  shot(page: Page, name: string): Promise<unknown>;
}

export async function visible(l: Locator): Promise<boolean> {
  return l
    .first()
    .isVisible()
    .catch(() => false);
}

export async function buildTeam(
  page: Page,
  name: string,
  roster: string,
  hires: string[],
  rec: Recorder
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
  await rec.shot(page, `team-${roster}`);
  await page.getByRole("button", { name: /Save Team/ }).click();
  await page.waitForURL(/\/build-team$/);
}

export type Next = {
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

export const brainNext = (page: Page): Promise<Next> =>
  page.evaluate(async (BRAIN) => {
    const m = await import(/* @vite-ignore */ BRAIN);
    return m.next();
  }, BRAIN);

export const brainCall = (page: Page, fn: string, arg?: string) =>
  page.evaluate(
    async ([f, a, BRAIN]) => {
      const m = await import(/* @vite-ignore */ BRAIN);
      return m[f](a);
    },
    [fn, arg, BRAIN] as const
  );

/** Served by the Vite dev server, so the page imports the same engine modules. */
export const BRAIN = "/e2e/fullgame/brain.ts";
const BLOCK_RANK = ["pow", "pow-dodge", "push", "both-down", "skull"];
let turnShots = 0;

/** Click any visible button whose name matches. */
export async function clickIf(page: Page, name: RegExp): Promise<boolean> {
  const b = page.getByRole("button", { name });
  if (await visible(b)) {
    await b.first().click();
    return true;
  }
  return false;
}

/** The HUD asks before a Dodge or Rush; the coach already chose to take it. */
export async function riskyMoveConfirm(
  page: Page,
  rec: Recorder
): Promise<boolean> {
  const b = page.getByRole("button", { name: /^(Dodge!|Rush!|Rush & Dodge!)$/ });
  if (!(await visible(b))) return false;
  rec.log(`  confirmed ${await b.first().innerText()}`);
  await b.first().click();
  await page.waitForTimeout(400);
  return true;
}

export async function visibleButtons(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .filter((b) => (b as HTMLElement).offsetParent !== null)
      .map((b) =>
        (b.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40)
      )
  );
}

/**
 * Answer whichever decision dialog is open. Returns false when none is.
 * In the browser the dialog is the decision, so it comes before the brain.
 */
export async function answerDialog(
  page: Page,
  app: GameApp,
  i: number,
  rec: Recorder
): Promise<boolean> {
  const { log } = rec;
  const blockDialog = app.hud.blockDiceDialog();
  if (await visible(blockDialog)) {
    const roll = page.getByTestId("block-roll-dice");
    if (await visible(roll)) {
      await roll.click();
      await page.waitForTimeout(900);
      return true;
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
    if (after.length === 0) return true;
    const ranks = after.map((f) => BLOCK_RANK.indexOf(f));
    const pick = ranks.indexOf(Math.min(...ranks.filter((r) => r >= 0)));
    log(`${i} block dice ${after.join(",")} pick ${after[pick]}`);
    await app.hud.chooseBlockDie(Math.max(0, pick)).catch(() => {});
    await page.waitForTimeout(600);
    return true;
  }
  if (await visible(app.hud.followUpDialog())) {
    await app.hud.answerFollowUp(true).catch(() => {});
    log(`${i} follow up`);
    return true;
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
    return true;
  }
  if (await visible(app.hud.reactionDialog())) {
    await app.hud.answerReaction(true).catch(() => {});
    log(`${i} reaction yes`);
    return true;
  }
  return false;
}

export async function perform(
  page: Page,
  app: GameApp,
  commands: Record<string, unknown>[],
  next: Next,
  rec: Recorder
) {
  const { log, shot } = rec;
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
        // Click the destination twice, as a coach does; the board walks the
        // safest route and asks before each Dodge or Rush on the way.
        const to = (command.path as Square[]).at(-1)!;
        await app.pitch.clickSquare(to);
        await page.waitForTimeout(150);
        await app.pitch.clickSquare(to);
        const mover = async () =>
          (await app.bridge.snapshot()).teams
            .flatMap((t) => t.players)
            .find((p) => p.id === command.playerId);
        const until = Date.now() + 30_000;
        let m = await mover();
        while (Date.now() < until) {
          if (await riskyMoveConfirm(page, rec)) continue;
          if (await answerDialog(page, app, -1, rec)) continue;
          await page.waitForTimeout(300);
          m = await mover();
          const there = m?.position?.x === to.x && m?.position?.y === to.y;
          const stopped = m?.status !== "Active" || !m?.position;
          if (there || stopped) break;
        }
        // Let the last walk finish before the next decision
        await page.waitForTimeout(900);
        m = await mover();
        if (m?.position?.x !== to.x || m?.position?.y !== to.y)
          log(
            `  MOVE STOPPED SHORT: wanted ${to.x},${to.y} got ${JSON.stringify(m?.position)} status=${m?.status}`
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
