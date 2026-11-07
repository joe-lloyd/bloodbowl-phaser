/**
 * Every Sevens kick-off table result, in the sandbox's Kickoff Table
 * scenarios, recorded as one video: Time-Out twice, for its two branches.
 *
 * Each result loads on its curated seed, the kick is made by clicking the
 * kicker and the target, any coach step is answered through the HUD, and the
 * drive plays on until the receiving team's turn begins. A caption names the
 * roll and result, then states what the engine did and what this test
 * checked; the check is an assertion, so a result that goes wrong fails the
 * run instead of reaching the video. Chapter times land in
 * `${KICKOFF_VIDEO_OUT}/chapters.json`.
 */
import { expect, Page, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { GameApp } from "../support/pages/game";
import {
  KICKOFF_EVENT_MEANING,
  KICKOFF_TABLE,
  KickoffEvent,
} from "../../src/game/kickoff/kickoffEvents";
import { KICKOFF_EXAMPLE_SEEDS } from "../../src/data/kickoffScenarios";

const OUT = process.env.KICKOFF_VIDEO_OUT ?? "e2e-results/kickoff-video-out";
/** The kick: team 1's first player aims at the receivers' middle. */
const KICKER = "team1:0";
const TARGET = { x: 14, y: 5 };

interface Clip {
  event: KickoffEvent;
  roll: number;
  scenario: "kickoff-table-standard" | "kickoff-table-late-half";
}

/** KICKOFF_ONLY=5,10 records just those rolls, for working on one result. */
const ONLY = process.env.KICKOFF_ONLY?.split(",").map(Number);

const CLIPS: Clip[] = Object.entries(KICKOFF_TABLE)
  .filter(([roll]) => !ONLY || ONLY.includes(Number(roll)))
  .flatMap(([roll, event]): Clip[] => {
    const clip = { event, roll: Number(roll) };
    return event === KickoffEvent.TIME_OUT
      ? [
          { ...clip, scenario: "kickoff-table-standard" },
          { ...clip, scenario: "kickoff-table-late-half" },
        ]
      : [{ ...clip, scenario: "kickoff-table-standard" }];
  });

/** The sandbox's outcome id for a result, as kickoffScenarios builds it. */
const outcomeId = (event: KickoffEvent) =>
  event
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

/** What the engine knows right now, read from the page. */
interface EngineView {
  phase: string;
  activeTeamId: string | null;
  turns: Record<string, number>;
  bribes: Record<string, number>;
  weather: string;
  owedAssists: Record<string, unknown>;
  freeRerolls: Record<string, number>;
  modifiers: Record<string, { confinedToReserves?: boolean }>;
  players: {
    id: string;
    name: string;
    teamId: string;
    status: string;
    at: { x: number; y: number } | null;
    ma: number;
    av: number;
    baseMa: number;
    baseAv: number;
  }[];
  step: {
    event: string;
    teamId: string;
    selectionLimit: number;
    selectedPlayerIds: string[];
    movedPlayerIds: string[];
    landingSquare?: { x: number; y: number };
    charge?: { activePlayerId: string | null };
  } | null;
  teamNames: Record<string, string>;
}

function engine(page: Page): Promise<EngineView> {
  return page.evaluate(async () => {
    const { ServiceContainer } =
      await import("/src/services/ServiceContainer.ts");
    const { effectiveMA, effectiveAV } =
      await import("/src/game/kickoff/driveEffects.ts");
    const gs = ServiceContainer.getInstance().gameService;
    const state = gs.getState();
    const [team1, team2] = gs.getTeams();
    const players = [...team1.players, ...team2.players];
    return {
      phase: state.phase,
      activeTeamId: state.activeTeamId,
      turns: {
        [team1.id]: gs.getTurnNumber(team1.id),
        [team2.id]: gs.getTurnNumber(team2.id),
      },
      bribes: { ...(state.bribes ?? {}) },
      weather: String(state.weather),
      owedAssists: { ...(state.driveEffects?.owedAssists ?? {}) },
      freeRerolls: { ...(state.driveEffects?.freeRerolls ?? {}) },
      modifiers: JSON.parse(
        JSON.stringify(state.driveEffects?.playerModifiers ?? {})
      ),
      players: players.map((p) => ({
        id: p.id,
        name: p.playerName,
        teamId: p.teamId,
        status: String(p.status),
        at: p.gridPosition ? { ...p.gridPosition } : null,
        ma: effectiveMA(p, state),
        av: effectiveAV(p, state),
        baseMa: p.stats.MA,
        baseAv: p.stats.AV,
      })),
      step: JSON.parse(JSON.stringify(gs.getKickoffEventStep() ?? null)),
      teamNames: { [team1.id]: team1.name, [team2.id]: team2.name },
    };
  });
}

/** The caption in the top-left corner, or a full-screen title card. */
async function caption(
  page: Page,
  lines: { title: string; body?: string[]; checked?: string[] },
  card = false
): Promise<void> {
  await page.evaluate(
    ({ lines, card }) => {
      const id = card ? "kickoff-video-card" : "kickoff-video-caption";
      document.getElementById("kickoff-video-card")?.remove();
      let box = document.getElementById(id);
      if (!box) {
        box = document.createElement("div");
        box.id = id;
        document.body.appendChild(box);
      }
      box.style.cssText = card
        ? "position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:14px;background:#0d1117;color:#e6edf3;font:500 22px/1.45 system-ui,sans-serif;text-align:center;padding:0 12%;pointer-events:none"
        : "position:fixed;left:12px;top:12px;z-index:2147483647;max-width:300px;background:rgba(13,17,23,0.92);color:#e6edf3;border:1px solid #30363d;border-left:4px solid #d6b25e;border-radius:8px;padding:12px 14px;font:500 14px/1.45 system-ui,sans-serif;pointer-events:none";
      const escape = (s: string) =>
        s.replace(
          /[&<>]/g,
          (c) => `&${{ "&": "amp", "<": "lt", ">": "gt" }[c]};`
        );
      box.innerHTML =
        `<div style="font-weight:700;font-size:${card ? 44 : 17}px;color:#d6b25e">${escape(lines.title)}</div>` +
        (lines.body ?? [])
          .map((l) => `<div style="color:#c9d1d9">${escape(l)}</div>`)
          .join("") +
        (lines.checked ?? [])
          .map(
            (l) =>
              `<div style="color:#56d364;margin-top:4px">✓ ${escape(l)}</div>`
          )
          .join("");
    },
    { lines, card }
  );
}

/** The KickoffResult the page has emitted, once it has. */
async function kickoffResult(app: GameApp) {
  let found:
    | {
        roll: number;
        event: KickoffEvent;
        outcome: { perTeam: Record<string, string[]> };
      }
    | undefined;
  await expect
    .poll(
      async () => {
        const event = (await app.bridge.events()).find(
          (e) => e.name === "kickoffResult"
        );
        found = event?.data as typeof found;
        return !!found;
      },
      { timeout: 30_000 }
    )
    .toBe(true);
  return found!;
}

/** A square one step from `at`, the way given, as long as nobody holds it. */
function stepFrom(
  view: EngineView,
  at: { x: number; y: number },
  dx: number
): { x: number; y: number } {
  const to = { x: at.x + dx, y: at.y };
  const taken = view.players.some(
    (p) => p.at && p.at.x === to.x && p.at.y === to.y
  );
  if (taken) throw new Error(`(${to.x},${to.y}) is taken`);
  return to;
}

/**
 * Alert Defence and Quick Snap: two players step one square each, the
 * kicking side forward, the receivers back, then Done.
 */
async function stepTwo(page: Page, app: GameApp, dx: number) {
  const before = await engine(page);
  const team = before.step!.teamId;
  const movers = before.players
    .filter((p) => p.teamId === team && p.at)
    .slice(1, 1 + Math.min(2, before.step!.selectionLimit));
  for (const mover of movers) {
    const view = await engine(page);
    const from = view.players.find((p) => p.id === mover.id)!.at!;
    await app.pitch.clickSquare(from);
    await page.waitForTimeout(700);
    await app.pitch.clickSquare(stepFrom(view, from, dx));
    await expect
      .poll(async () => (await engine(page)).step?.movedPlayerIds ?? [])
      .toContain(mover.id);
    await page.waitForTimeout(900);
  }
  await page.getByRole("button", { name: "Done" }).click();
  const after = await engine(page);
  return movers.map((mover) => {
    const from = mover.at!;
    const to = after.players.find((p) => p.id === mover.id)!.at!;
    expect(Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y))).toBe(1);
    return `${mover.name} (${before.teamNames[team]}) stepped (${from.x},${from.y}) → (${to.x},${to.y})`;
  });
}

test("every kick-off table result, on the pitch", async ({ page }) => {
  const app = new GameApp(page);
  const start = Date.now();
  const chapters: {
    at: number;
    roll: number;
    event: string;
    scenario: string;
    checked: string[];
  }[] = [];
  mkdirSync(OUT, { recursive: true });

  await page.goto("/sand-box");
  await app.pitch.waitForCanvas();
  await caption(
    page,
    {
      title: "The Sevens kick-off table",
      body: [
        "2D6 after every kick: eleven results, Time-Out shown on both of its branches.",
        "Each one is played in the sandbox on its own seed, and checked against the rules.",
      ],
    },
    true
  );
  await page.waitForTimeout(4000);

  for (const clip of CLIPS) {
    await app.sandbox.open({
      scenario: clip.scenario,
      seed: KICKOFF_EXAMPLE_SEEDS[clip.event],
      outcome: outcomeId(clip.event),
    });
    const at = Date.now() - start;
    const late = clip.scenario === "kickoff-table-late-half";
    const title = `${clip.roll} · ${clip.event}${clip.event === KickoffEvent.TIME_OUT ? (late ? " (turn 5)" : " (turn 2)") : ""}`;
    await caption(
      page,
      { title, body: [KICKOFF_EVENT_MEANING[clip.event]] },
      true
    );
    await page.waitForTimeout(3500);
    await page.evaluate(() =>
      document.getElementById("kickoff-video-card")?.remove()
    );
    await caption(page, { title, body: [KICKOFF_EVENT_MEANING[clip.event]] });
    await app.pitch.waitForCameraToSettle();
    const before = await engine(page);
    const [kicking, receiving] = Object.keys(before.teamNames);

    // The kick, as a coach makes it
    await app.pitch.clickPlayer(KICKER);
    await page.waitForTimeout(600);
    await app.pitch.clickSquare(TARGET);
    const result = await kickoffResult(app);
    expect(result.event).toBe(clip.event);
    expect(result.roll).toBe(clip.roll);

    const checked: string[] = [];
    switch (clip.event) {
      case KickoffEvent.ALERT_DEFENCE: {
        await expect(page.getByRole("button", { name: "Done" })).toBeVisible({
          timeout: 30_000,
        });
        checked.push(...(await stepTwo(page, app, 1)));
        break;
      }
      case KickoffEvent.QUICK_SNAP: {
        await expect(page.getByRole("button", { name: "Done" })).toBeVisible({
          timeout: 30_000,
        });
        checked.push(...(await stepTwo(page, app, 1)));
        break;
      }
      case KickoffEvent.HIGH_KICK: {
        const confirm = page.getByRole("button", { name: "Confirm" });
        await expect(confirm).toBeVisible({ timeout: 30_000 });
        const view = await engine(page);
        const landing = view.step!.landingSquare!;
        // The receiver nearest the landing square
        const gap = (p: EngineView["players"][number]) =>
          Math.max(
            Math.abs(p.at!.x - landing.x),
            Math.abs(p.at!.y - landing.y)
          );
        const receiver = view.players
          .filter((p) => p.teamId === receiving && p.at)
          .sort((a, b) => gap(a) - gap(b))[0];
        await page.waitForTimeout(1200);
        await app.pitch.clickSquare(receiver.at!);
        await expect
          .poll(
            async () =>
              (await engine(page)).players.find((p) => p.id === receiver.id)!.at
          )
          .toEqual(landing);
        await page.waitForTimeout(1200);
        // Placing the receiver may close the step by itself
        if (await confirm.isVisible()) await confirm.click();
        checked.push(
          `${receiver.name} (${view.teamNames[receiving]}) placed under the ball at (${landing.x},${landing.y})`
        );
        break;
      }
      case KickoffEvent.CHARGE: {
        const charge = page.getByRole("button", { name: /charge!/i });
        await expect(charge).toBeVisible({ timeout: 30_000 });
        const charger = before.players.filter((p) => p.teamId === kicking)[2];
        await app.pitch.clickSquare(charger.at!);
        await page.waitForTimeout(800);
        await charge.click();
        await expect(app.hud.actionMenu()).toBeVisible({ timeout: 10_000 });
        await app.hud.actionButton("move").click();
        const to = { x: charger.at!.x + 1, y: charger.at!.y };
        await app.pitch.clickSquare(to);
        await app.pitch.clickSquare(to);
        await expect
          .poll(
            async () =>
              (await engine(page)).players.find((p) => p.id === charger.id)!.at
          )
          .toEqual(to);
        await page.waitForTimeout(800);
        await page.getByRole("button", { name: /end activation/i }).click();
        checked.push(
          `${charger.name} (${before.teamNames[kicking]}) took a free Move before the drive: (${charger.at!.x},${charger.at!.y}) → (${to.x},${to.y})`
        );
        break;
      }
    }

    // The drive starts on the receivers' turn
    await expect
      .poll(async () => (await engine(page)).phase, { timeout: 60_000 })
      .toBe("PLAY");
    await page.waitForTimeout(1500);
    const after = await engine(page);
    const name = (teamId: string) => after.teamNames[teamId];
    /** Both sides can share player names, so a player comes with a team. */
    const who = (p: { name: string; teamId: string }) =>
      `${p.name} (${name(p.teamId)})`;

    switch (clip.event) {
      case KickoffEvent.GET_THE_REF:
        expect(after.bribes).toEqual({ [kicking]: 1, [receiving]: 1 });
        checked.push("Each team now holds one Bribe");
        break;
      case KickoffEvent.TIME_OUT: {
        const was = before.turns[kicking];
        const now = after.turns[kicking];
        expect(now).toBe(late ? was - 1 : was + 1);
        checked.push(
          `Kicking team's marker on turn ${was}, so both markers moved ${late ? "back" : "forward"}: ${was} → ${now}`
        );
        break;
      }
      case KickoffEvent.CHEERING_FANS: {
        const owed = Object.keys(after.owedAssists);
        expect(owed.length).toBeGreaterThan(0);
        checked.push(
          `Extra assist on the next first Block: ${owed.map(name).join(" and ")}`
        );
        break;
      }
      case KickoffEvent.BRILLIANT_COACHING: {
        const free = Object.entries(after.freeRerolls).filter(([, n]) => n > 0);
        expect(free.length).toBeGreaterThan(0);
        checked.push(
          ...free.map(
            ([team, n]) => `${name(team)}: ${n} free re-roll this drive`
          )
        );
        break;
      }
      case KickoffEvent.CHANGING_WEATHER: {
        const events = await app.bridge.events();
        expect(events.some((e) => e.name === "weatherChanged")).toBe(true);
        checked.push(`Weather re-rolled: ${before.weather} → ${after.weather}`);
        // Perfect Conditions ("Nice") makes the ball Scatter (3) in the air
        const scatter = events.find(
          (e) =>
            e.name === "ballScattered" &&
            String((e.data as { reason?: string }).reason).startsWith(
              "Changing Weather"
            )
        )?.data as
          | { from: { x: number; y: number }; to: { x: number; y: number } }
          | undefined;
        expect(!!scatter).toBe(after.weather === "Nice");
        if (scatter)
          checked.push(
            `Perfect Conditions, so the ball scattered in the air: (${scatter.from.x},${scatter.from.y}) → (${scatter.to.x},${scatter.to.y})`
          );
        break;
      }
      case KickoffEvent.DODGY_SNACK: {
        const hit = Object.entries(after.modifiers);
        expect(hit.length).toBeGreaterThan(0);
        for (const [id, modifier] of hit) {
          const p = after.players.find((q) => q.id === id)!;
          if (modifier.confinedToReserves) {
            expect(p.at).toBeNull();
            checked.push(`${who(p)} sent to the Reserves for the drive`);
          } else {
            expect([p.ma, p.av]).toEqual([p.baseMa - 1, p.baseAv - 1]);
            checked.push(
              `${who(p)}: MA ${p.baseMa} → ${p.ma}, AV ${p.baseAv} → ${p.av} for the drive`
            );
          }
        }
        break;
      }
      case KickoffEvent.PITCH_INVASION: {
        const stunned = after.players.filter((p) => p.status === "Stunned");
        expect(stunned.length).toBeGreaterThan(0);
        checked.push(
          ...stunned.map((p) => `${who(p)} Placed Prone and Stunned`)
        );
        break;
      }
    }
    expect(after.activeTeamId).toBe(receiving);
    checked.push(`${name(receiving)}'s turn begins`);

    const got = Object.entries(result.outcome.perTeam).flatMap(
      ([team, lines]) => lines.map((line) => `${name(team)}: ${line}`)
    );
    await caption(page, { title, body: got, checked });
    chapters.push({
      at,
      roll: clip.roll,
      event: clip.event,
      scenario: clip.scenario,
      checked,
    });
    await page.waitForTimeout(6000);
  }

  await caption(
    page,
    {
      title: "All eleven results checked",
      body: CLIPS.map((c) => `${c.roll} · ${c.event}`).filter(
        (l, i, all) => all.indexOf(l) === i
      ),
    },
    true
  );
  await page.waitForTimeout(4000);
  writeFileSync(`${OUT}/chapters.json`, JSON.stringify(chapters, null, 2));
});
