import { fixtureValue } from "../../src/testing/fixtureValue";
import { confirmPregame } from "../support/pregame";

import { test, type Page } from "@playwright/test";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { GameApp } from "../support/pages/game";
import {
  answerDialog,
  brainCall,
  brainNext,
  buildTeam,
  clickIf,
  perform,
  riskyMoveConfirm,
  visible,
  visibleButtons,
} from "./driver";
import { createUxProbe } from "./uxProbe";

const OUT = process.env["FULLGAME_OUT"] ?? "e2e-results/fullgame-shots";
const LOG = `${OUT}/drive.log`;
const MAX_ITER = Number(process.env["MAX_ITER"] ?? 4000);
const log = (line: string) => {
  appendFileSync(LOG, line + "\n");
};
const shot = (page: Page, n: string) =>
  page.screenshot({ path: `${OUT}/${n}.png` });
const rec = { log, shot };

test("a full Sevens match, built and played through the UI", async ({
  page,
}) => {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(LOG, "");
  page.on("dialog", (d) => d.accept());
  page.on("pageerror", (e) => {
    log(`PAGEERROR ${e.message}`);
  });
  page.on("console", (m) => {
    if (/Move failed|Path too long|Invalid move/.test(m.text()))
      log(`  CONSOLE ${m.text().slice(0, 300)}`);
  });
  const app = new GameApp(page);
  const size = page.viewportSize();
  const ux = process.env["UX_PROBE"]
    ? createUxProbe(page, OUT, `${String(size?.width)}x${String(size?.height)}`)
    : null;

  await page.goto("/");
  await ux?.probe("main menu");
  await page.evaluate(() => {
    localStorage.clear();
  });
  await buildTeam(
    page,
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
    rec
  );
  await buildTeam(
    page,
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
    rec
  );
  await shot(page, "manage");
  await ux?.probe("manage team");

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
  await ux?.probe("team select");
  await page.getByRole("button", { name: /Start Game/ }).click();
  await app.bridge.waitForReady();
  await app.rollWeather(20_000);
  await confirmPregame(page);
  await page
    .getByRole("button", { name: "FLIP COIN" })
    .waitFor({ timeout: 15_000 });

  let lastKey = "";
  let lastLabel = "";
  let stuck = 0;
  let fallbacks = 0;
  let kicked = false;
  let failures = 0;
  for (let i = 0; i < MAX_ITER; i++) {
    await page.waitForTimeout(120);
    await ux?.probe(`step ${String(i)}`);

    if (await clickIf(page, /^FLIP COIN$/)) {
      log(`${String(i)} coin flip`);
      await page.waitForTimeout(2500);
      continue;
    }
    if (await riskyMoveConfirm(page, rec)) continue;
    if (await clickIf(page, /^RECEIVE$/)) {
      log(`${String(i)} chose receive`);
      continue;
    }

    const answered = await answerDialog(page, app, i, rec).catch((e: Error) => {
      log(`${String(i)} dialog failed: ${String(e.message.split("\n")[0])}`);
      return true;
    });
    if (answered) continue;

    const next = await brainNext(page);
    if (next.over) {
      log(`${String(i)} GAME OVER`);
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
      await shot(page, `stuck-${String(i)}`);
      log(
        `${String(i)} STUCK on ${key} buttons=${JSON.stringify(await visibleButtons(page))}`
      );

      log(
        `   board ${await page.evaluate(() => {
          const scene = (
            window as unknown as {
              game?: {
                scene: { getScene(k: string): Record<string, unknown> };
              };
            }
          ).game?.scene.getScene("GameScene");
          const c = (scene)!?.["gameplayController"] as
            | Record<string, unknown>
            | undefined;
          return JSON.stringify(
            c && {
              busy: c["isBusy"],
              selected: c["selectedPlayerId"],
              mode: c["currentActionMode"],
              step: c["currentStepId"],
              waypoints: c["waypoints"],
            }
          );
        })}`
      );
    }
    if (stuck >= 10) {
      fallbacks++;
      log(`${String(i)} FALLBACK end turn`);
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
      log(`${String(i)} no candidate ${key}`);
      await page.waitForTimeout(400);
      continue;
    }
    if (fresh && process.env["DEBUG_COACH"])
      log(`   debug ${JSON.stringify((next as { debug?: unknown }).debug)}`);
    if (fresh)
      log(
        `${String(i)} ${new Date().toISOString().slice(11, 19)} ${String(next.phase)}/${next.subPhase ?? "-"} ${next.pending?.type ?? ""} :: ${c.label}`
      );
    if (fixtureValue(c.commands[0])?.["type"] === "kick-ball") {
      if (kicked) {
        await page.waitForTimeout(500);
        continue;
      }
      kicked = true;
    }
    if (next.phase === "PLAY") kicked = false;
    try {
      await perform(page, app, c.commands, next, rec);
      if (next.pending) await brainCall(page, "clearPending");
    } catch (e) {
      const msg = (e as Error).message;
      log(
        `${String(i)} perform failed: ${String(msg.split("\n")[0])} | ${msg
          .split("\n")
          .filter((l) => /intercept|waiting|subtree/.test(l))
          .slice(0, 3)
          .join(" / ")
          .slice(0, 300)}`
      );
      log(`  buttons=${JSON.stringify(await visibleButtons(page))}`);
      if (failures++ < 3) await shot(page, `fail-${String(i)}`);
    }
  }

  if (ux)
    writeFileSync(
      `${OUT}/ux-summary.json`,
      JSON.stringify(ux.summary(), null, 2)
    );
  await page.waitForTimeout(3000);
  await shot(page, "end");
  log(`fallbacks=${String(fallbacks)}`);

  for (let k = 0; k < 12; k++) {
    const buttons = await visibleButtons(page);
    log(`post ${String(k)} buttons=${JSON.stringify(buttons)}`);
    if (await clickIf(page, /^Roll MVP D6$/)) {
      await page.waitForTimeout(1200);
      continue;
    }
    if (await clickIf(page, /Confirm|Record/i)) {
      await page.waitForTimeout(1500);
      await shot(page, `post-${String(k)}`);
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

  for (const team of ["Reikland Reavers", "Gouged Eye"]) {
    await page.goto("/build-team");
    await page.waitForTimeout(800);
    await shot(page, `manage-${team}`);
    log(`manage ${team} buttons=${JSON.stringify(await visibleButtons(page))}`);
    for (let k = 0; k < 15; k++) {
      const recipient = page.getByLabel("Skill Selection recipient");
      const named = page.getByTestId("skill-option");
      if (await visible(recipient)) {
        const opts = await recipient
          .first()
          .locator("option")
          .allTextContents();
        await recipient.first().selectOption({ index: 1 });
        await page
          .getByLabel("Skill Selection category")
          .first()
          .selectOption({ index: 1 });
        log(`  ${team} recipient ${String(opts[1])}`);
        await page
          .getByRole("button", { name: "Take a Primary skill" })
          .first()
          .click();
      } else if (await visible(named)) {
        log(`  named ${await named.first().innerText()}`);
        await named.first().click();
        await page.getByRole("button", { name: "Name skill" }).first().click();
      } else if (await clickIf(page, /^Roll D3$/)) {
        await page.getByText(/ learned /).waitFor({ timeout: 15_000 });
        log(
          `  D3: ${(await page.getByText(/ learned /).first().innerText()).replace(/\s+/g, " ").slice(0, 300)}`
        );
      } else if (await clickIf(page, /^(Pay|Keep|Release)/)) {
        log(`  drafted-player offer answered`);
      } else break;
      await page.waitForTimeout(500);
      await shot(page, `develop-${team}-${String(k)}`);
    }
  }
  await page.goto("/build-team");
  await page.waitForTimeout(1000);
  await shot(page, "final-manage");
});
