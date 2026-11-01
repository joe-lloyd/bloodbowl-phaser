/**
 * A run to the End Zone is walked leg by leg: the coach clicks the End Zone
 * once, then is asked before the Dodge out of the marked square and again
 * before the Rush onto the last square, and the touchdown comes only after
 * the runner is shown standing there.
 *
 * SHOTS=<dir> also saves a screenshot of each beat, for a walkthrough page.
 */
import { test, expect, Page } from "@playwright/test";
import { GameApp } from "../support/pages/game";
import { GameEventNames } from "../../src/types/events";
import { possessive } from "../../src/game/managers/TurnManager";
import type { IEventBus } from "../../src/services/EventBus";
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
  interface Window {
    eventBus: IEventBus;
    __bbTestBridge: BrowserTestBridge;
    __momentProof: {
      moments: ObservedMoment[];
      thrownAtTurnover: number;
      landedAtBanner: number;
    };
  }
}

// Observe rendered banners, rather than relying on polling that can miss a
// short banner on a busy browser worker. All state reads use the public bridge.
async function observeMoments(page: Page) {
  await page.evaluate(
    (names) => {
      const proof: Window["__momentProof"] = {
        moments: [],
        thrownAtTurnover: 0,
        landedAtBanner: 0,
      };
      window.__momentProof = proof;
      let tray = { thrown: 0, landedThrough: 0 };
      let lastKind: string | null = null;
      window.eventBus.on(names.dice, (data) => {
        tray = data;
      });
      window.eventBus.on(names.turnover, () => {
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
        const state = window.__bbTestBridge.phase();
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
          !proof.moments.some((moment) => moment.kind === "setup")
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

const SEED = Number(process.env.SCORE_RUN_SEED ?? 2);

// The walkthrough also wants the run as a video
if (process.env.SHOTS) test.use({ video: "on" });

test("a score run stops before the Dodge and the Rush, and scores at the end", async ({
  page,
}) => {
  const app = new GameApp(page);
  let beat = 0;
  const shot = async (name: string) => {
    const path = process.env.SHOTS
      ? `${process.env.SHOTS}/${String(++beat).padStart(2, "0")}-${name}.png`
      : test.info().outputPath(`${name}.png`);
    await page.screenshot({ path });
  };
  const carrier = async () =>
    (await app.bridge.snapshot()).teams[0].players.find((p) => p.position)!;
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

  // Plot the run, then click the same square again to go
  await app.pitch.clickSquare({ x: 19, y: 5 });
  await shot("route-plotted");
  await app.pitch.clickSquare({ x: 19, y: 5 });

  // Nothing has moved or rolled: the board asks before the Dodge
  await expect(page.getByRole("heading", { name: /: Dodge$/ })).toBeVisible();
  await expect(
    page.getByText(/Dodge: 3\+\. A fall is a turnover\./)
  ).toBeVisible();
  expect((await carrier()).position).toEqual({ x: 12, y: 5 });
  await shot("dodge-prompt");
  await page.getByRole("button", { name: "Dodge!" }).click();
  await shot("dodge-rolling");

  // The Dodge, then the safe squares; it stops before the Rush
  await expect(page.getByRole("heading", { name: /: Rush$/ })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(/Rush: 2\+\./)).toBeVisible();
  expect((await carrier()).position).toEqual({ x: 18, y: 5 });
  expect(await scored()).toBe(false);
  await shot("rush-prompt");
  await page.getByRole("button", { name: "Rush!" }).click();
  await shot("rush-rolling");

  // The touchdown waits for the dice and is rendered before setup.
  const touchdown = page.getByTestId("announcement");
  await expect(touchdown).toContainText("Touchdown", { timeout: 15_000 });
  await shot("touchdown");
  await expect
    .poll(async () => (await app.bridge.phase()).phase, { timeout: 15_000 })
    .toBe("SETUP");
  const moments = await page.evaluate(() => window.__momentProof.moments);
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
  // Seed 1: the Dodge passes and the Rush rolls a 1
  await app.sandbox.open({ scenario: "score-run-dodge-rush", seed: 1 });
  await observeMoments(page);
  await app.pitch.waitForCameraToSettle();
  await app.pitch.clickPlayer("team1:0");
  await app.hud.actionButton("move").click();
  await app.pitch.clickSquare({ x: 19, y: 5 });
  await app.pitch.clickSquare({ x: 19, y: 5 });
  await page.getByRole("button", { name: "Dodge!" }).click();
  await page.getByRole("button", { name: "Rush!" }).click({ timeout: 15_000 });

  // The banner follows the fall's armour and injury dice too, which take a
  // while with software rendering in a parallel run
  await expect(page.getByRole("heading", { name: "TURNOVER" })).toBeVisible({
    timeout: 20_000,
  });
  await page.screenshot({ path: test.info().outputPath("turnover.png") });
  await page.waitForFunction(() =>
    window.__momentProof.moments.some(
      (moment) => moment.kind === "turn-started"
    )
  );
  const { moments, thrownAtTurnover, landedAtBanner } = await page.evaluate(
    () => window.__momentProof
  );
  // TURNOVER shows while the team that failed still has the turn; the one
  // turn banner follows, after the hand-over
  expect(moments.map((moment) => moment.kind)).toEqual([
    "turnover",
    "turn-started",
  ]);
  expect(moments.every((moment) => !moment.overlap)).toBe(true);
  const [team1, team2] = await app.bridge.teams();
  expect(moments[0].activeTeamId).toBe(team1.id);
  expect(moments[1].activeTeamId).toBe(team2.id);
  expect(moments[1].text).toContain(`${possessive(team2.name)} Turn`);
  expect(thrownAtTurnover).toBeGreaterThan(0);
  expect(landedAtBanner).toBeGreaterThanOrEqual(thrownAtTurnover);
});

test("on two Rushes in a row, the second prompt waits for the first die to land", async ({
  page,
}) => {
  const app = new GameApp(page);
  // The default seed: the Dodge and the first Rush both pass
  await app.sandbox.open({ scenario: "score-run-dodge-rush", seed: SEED });
  // Note the tray each time a Rush prompt opens
  await page.evaluate(() => {
    const w = window as unknown as {
      eventBus: { on(name: string, fn: (d: never) => void): void };
      tray: { thrown: number; landedThrough: number };
      trayAtRushPrompts: { thrown: number; landedThrough: number }[];
    };
    w.tray = { thrown: 0, landedThrough: 0 };
    w.trayAtRushPrompts = [];
    w.eventBus.on(
      "ui:diceInAir",
      (d: { thrown: number; landedThrough: number }) => {
        w.tray = d;
      }
    );
    const seen = new WeakSet<Element>();
    new MutationObserver(() => {
      for (const heading of document.querySelectorAll("h3")) {
        if (seen.has(heading) || !/: Rush$/.test(heading.textContent ?? ""))
          continue;
        seen.add(heading);
        w.trayAtRushPrompts.push({
          thrown: w.tray.thrown,
          landedThrough: w.tray.landedThrough,
        });
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
  await app.pitch.waitForCameraToSettle();
  await app.pitch.clickPlayer("team1:0");
  await app.hud.actionButton("move").click();
  // Dodge out, five safe squares that use up the MA, then two Rushes
  await app.pitch.clickSquare({ x: 17, y: 5 });
  await app.pitch.clickSquare({ x: 18, y: 6 });
  await app.pitch.clickSquare({ x: 18, y: 7 });
  await app.pitch.clickSquare({ x: 18, y: 8 });
  await app.pitch.clickSquare({ x: 18, y: 8 });
  await page.getByRole("button", { name: "Dodge!" }).click();
  await expect(page.getByRole("heading", { name: /: Rush$/ })).toBeVisible({
    timeout: 15_000,
  });

  // Rolls still queued in the tray, as on a slow screen, hold the first
  // Rush die past the 3 s the walk waits for it
  await page.evaluate(() => {
    const w = window as unknown as {
      eventBus: { emit(name: string, data: unknown): void };
    };
    for (const value of [3, 4, 5])
      w.eventBus.emit("diceRoll", {
        rollType: "Earlier roll",
        diceType: "1d6",
        value,
        total: value,
        description: "Earlier roll",
      });
  });
  await page.getByRole("button", { name: "Rush!" }).click();

  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (window as unknown as { trayAtRushPrompts: unknown[] })
              .trayAtRushPrompts.length
        ),
      { timeout: 30_000 }
    )
    .toBe(2);
  const [, second] = await page.evaluate(
    () =>
      (
        window as unknown as {
          trayAtRushPrompts: { thrown: number; landedThrough: number }[];
        }
      ).trayAtRushPrompts
  );
  // The Dodge, the three queued rolls and the first Rush had all landed
  expect(second).toEqual({ thrown: 5, landedThrough: 5 });
});
