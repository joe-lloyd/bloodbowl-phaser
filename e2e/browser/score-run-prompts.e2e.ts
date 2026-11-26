import { fixtureValue } from "../../src/testing/fixtureValue";
import { test, expect, type Page } from "@playwright/test";
import { GameApp } from "../support/pages/game";
import { GameEventNames } from "../../src/types/events";
import { possessive } from "../../src/game/managers/TurnManager";
import type { BrowserTestBridge } from "../../src/testing/browserBridge";

interface ObservedMoment {
  kind: string;
  text: string;
  at: number;
  phase: string;
  activeTeamId: string | null;
  overlap: boolean;
}

declare global {
  var __bbTestBridge: BrowserTestBridge;
  var __momentProof: {
      moments: ObservedMoment[];
      thrownAtTurnover: number;
      landedAtBanner: number;
    };
}

async function observeMoments(page: Page) {
  await page.evaluate(
    (names) => {
      const proof: typeof globalThis.__momentProof = {
        moments: [],
        thrownAtTurnover: 0,
        landedAtBanner: 0,
      };
      globalThis.__momentProof = proof;
      let tray = { thrown: 0, landedThrough: 0 };
      let lastKind: string | null = null;
      globalThis.eventBus.on(names.dice, (data) => {
        tray = data;
      });
      globalThis.eventBus.on(names.turnover, () => {
        proof.thrownAtTurnover = tray.thrown;
        proof.moments.length = 0;
      });
      new MutationObserver(() => {
        const banner = document.querySelector('[data-testid="announcement"]');
        const turnover = [...document.querySelectorAll("h1")].find(
          (node) => node.textContent === "TURNOVER"
        );
        const text = banner?.textContent ?? "";
        const kind = turnover
          ? "turnover"
          : (banner?.getAttribute("data-kind") ?? null);
        const state = globalThis.__bbTestBridge.phase();
        if (kind && kind !== lastKind) {
          proof.moments.push({
            kind,
            text: turnover?.parentElement?.parentElement?.textContent ?? text,
            at: performance.now(),
            phase: state.phase,
            activeTeamId: state.activeTeamId,
            overlap: Boolean(turnover && banner),
          });
          if (turnover) proof.landedAtBanner = tray.landedThrough;
        }
        lastKind = kind;
        if (
          state.phase === "SETUP" &&
          proof.moments.every((moment) => moment.kind !== "setup")
        ) {
          proof.moments.push({
            kind: "setup",
            text: "",
            at: performance.now(),
            phase: state.phase,
            activeTeamId: state.activeTeamId,
            overlap: false,
          });
        }
      }).observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["data-kind"],
      });
    },
    { dice: GameEventNames.UI_DiceInAir, turnover: GameEventNames.UI_Turnover }
  );
}

const SEED = Number(process.env["SCORE_RUN_SEED"] ?? 2);

if (process.env["SHOTS"]) test.use({ video: "on" });

test("a score run plans the Dodge and the Rush, and scores at the end on Go", async ({
  page,
}) => {
  const app = new GameApp(page);
  let beat = 0;
  const shot = async (name: string) => {
    const path = process.env["SHOTS"]
      ? `${process.env["SHOTS"]}/${String(++beat).padStart(2, "0")}-${name}.png`
      : test.info().outputPath(`${name}.png`);
    await page.screenshot({ path });
  };
  const carrier = async () =>
    fixtureValue(fixtureValue((await app.bridge.snapshot()).teams[0]).players.find((p) => p.position));
  const scored = async () =>
    (await app.bridge.events()).some(
      (e) => e.name === GameEventNames.Touchdown
    );

  await app.sandbox.open({ scenario: "score-run-dodge-rush", seed: SEED });
  await observeMoments(page);
  await app.pitch.waitForCameraToSettle();
  await app.pitch.clickPlayer("team1:0");
  await app.hud.actionButton("move").click();
  await app.pitch.waitForCameraToSettle();
  await shot("selected");

  await app.pitch.clickSquare({ x: 19, y: 5 });
  const plan = page.getByTestId("action-plan");
  await expect(plan).toContainText("Dodge 3+");
  await expect(plan).toContainText("Rush 2+");
  expect((await carrier()).position).toEqual({ x: 12, y: 5 });
  expect(await scored()).toBe(false);
  await shot("route-plotted");
  await page.getByTestId("action-plan-go").click();
  await shot("running");
  await expect(page.getByTestId("confirmation-modal")).toBeHidden();

  const touchdown = page.getByTestId("announcement");
  await expect(touchdown).toContainText("Touchdown", { timeout: 15_000 });
  await shot("touchdown");
  await expect
    .poll(async () => (await app.bridge.phase()).phase, { timeout: 15_000 })
    .toBe("SETUP");
  const moments = await page.evaluate(() => globalThis.__momentProof.moments);
  const scoredMoment = moments.find((moment) => moment.kind === "touchdown");
  const setupMoment = moments.find((moment) => moment.kind === "setup");
  expect(scoredMoment).toBeDefined();
  expect(scoredMoment?.text).toContain("Turns left");
  expect(scoredMoment?.text).toContain("1 : 0");
  expect(scoredMoment?.phase).toBe("TOUCHDOWN");
  expect(
    (setupMoment?.at ?? 0) - (scoredMoment?.at ?? 0)
  ).toBeGreaterThanOrEqual(2500);
  await expect(page.getByTestId("announcement")).toContainText("kick");
});

test("a failed Rush shows the turnover only after its die has landed", async ({
  page,
}) => {
  const app = new GameApp(page);

  await app.sandbox.open({ scenario: "score-run-dodge-rush", seed: 1 });
  await observeMoments(page);
  await app.pitch.waitForCameraToSettle();
  await app.pitch.clickPlayer("team1:0");
  await app.hud.actionButton("move").click();
  await app.pitch.clickSquare({ x: 19, y: 5 });
  await app.pitch.clickSquare({ x: 19, y: 5 });

  await expect(page.getByRole("heading", { name: "TURNOVER" })).toBeVisible({
    timeout: 20_000,
  });
  await page.screenshot({ path: test.info().outputPath("turnover.png") });
  await page.waitForFunction(() =>
    globalThis.__momentProof.moments.some(
      (moment) => moment.kind === "turn-started"
    )
  );
  const { moments, thrownAtTurnover, landedAtBanner } = await page.evaluate(
    () => globalThis.__momentProof
  );

  expect(moments.map((moment) => moment.kind)).toEqual([
    "turnover",
    "turn-started",
  ]);
  expect(moments.every((moment) => !moment.overlap)).toBe(true);
  const [team1, team2] = await app.bridge.teams();
  expect(fixtureValue(moments[0]).activeTeamId).toBe(team1.id);
  expect(fixtureValue(moments[1]).activeTeamId).toBe(team2.id);
  expect(fixtureValue(moments[1]).text).toContain(`${possessive(team2.name)} Turn`);
  expect(thrownAtTurnover).toBeGreaterThan(0);
  expect(landedAtBanner).toBeGreaterThanOrEqual(thrownAtTurnover);
});

test("on two Rushes in a row, the second Rush rolls only after every earlier die lands", async ({
  page,
}) => {
  const app = new GameApp(page);

  await app.sandbox.open({ scenario: "score-run-dodge-rush", seed: SEED });

  await page.evaluate(() => {
    const w = globalThis as unknown as {
      eventBus: { on(name: string, fn: (d: never) => void): void };
      tray: { thrown: number; landedThrough: number };
      rollsSeen: number;
      trayAtRushRolls: { earlier: number; landed: number }[];
    };
    w.tray = { thrown: 0, landedThrough: 0 };
    w.rollsSeen = 0;
    w.trayAtRushRolls = [];
    w.eventBus.on(
      "ui:diceInAir",
      (d: { thrown: number; landedThrough: number }) => {
        w.tray = d;
      }
    );
    w.eventBus.on("diceRoll", (d: { rollType: string }) => {
      if (/rush/i.test(d.rollType))
        w.trayAtRushRolls.push({ earlier: w.rollsSeen, landed: w.tray.landedThrough });
      w.rollsSeen++;
    });
  });
  await app.pitch.waitForCameraToSettle();
  await app.pitch.clickPlayer("team1:0");
  await app.hud.actionButton("move").click();

  await app.pitch.clickSquare({ x: 17, y: 5 });
  await app.pitch.clickSquare({ x: 18, y: 6 });
  await app.pitch.clickSquare({ x: 18, y: 7 });
  await app.pitch.clickSquare({ x: 18, y: 8 });
  await expect(page.getByTestId("action-plan")).toContainText("Rush 2+");
  await page.getByTestId("action-plan-go").click();

  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (globalThis as unknown as { trayAtRushRolls: unknown[] })
              .trayAtRushRolls.length
        ),
      { timeout: 30_000 }
    )
    .toBeGreaterThanOrEqual(2);
  const [, second] = await page.evaluate(
    () =>
      (
        globalThis as unknown as {
          trayAtRushRolls: { earlier: number; landed: number }[];
        }
      ).trayAtRushRolls
  );

  expect(fixtureValue(second).earlier).toBeGreaterThanOrEqual(2);
  expect(fixtureValue(second).landed).toBeGreaterThanOrEqual(fixtureValue(second).earlier);
});
