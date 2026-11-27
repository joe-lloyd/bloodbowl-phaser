import { fixtureValue } from "../../src/testing/fixtureValue";
import { expect, type Page, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { GameApp } from "../support/pages/game";
import {
  KICKOFF_EVENT_MEANING,
  KICKOFF_TABLE,
  KickoffEvent,
} from "../../src/game/kickoff/kickoffEvents";
import { KICKOFF_EXAMPLE_SEEDS } from "../../src/data/kickoffScenarios";
import type { SevensKickoffEvent } from "../../src/game/kickoff/variantEventMeanings";

const OUT = process.env["KICKOFF_VIDEO_OUT"] ?? "e2e-results/kickoff-video-out";

const KICKER = "team1:0";
const TARGET = { x: 14, y: 5 };

interface Clip {
  event: SevensKickoffEvent;
  roll: number;
  scenario: "kickoff-table-standard" | "kickoff-table-late-half";
}

const ONLY = process.env["KICKOFF_ONLY"]?.split(",").map((roll) => {
  const n = Number(roll.trim());
  if (!KICKOFF_TABLE[n]) throw new Error(`KICKOFF_ONLY: no roll "${roll}"`);
  return n;
});

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

const outcomeId = (event: KickoffEvent) =>
  event
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/(^-|-$)/g, "");

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
      bribes: { ...state.bribes },
      weather: state.weather,
      owedAssists: { ...state.driveEffects?.owedAssists },
      freeRerolls: { ...state.driveEffects?.freeRerolls },
      modifiers: structuredClone(
        state.driveEffects?.playerModifiers ?? {}
      ),
      players: players.map((p) => ({
        id: p.id,
        name: p.playerName,
        teamId: p.teamId,
        status: p.status,
        at: p.gridPosition ? { ...p.gridPosition } : null,
        ma: effectiveMA(p, state),
        av: effectiveAV(p, state),
        baseMa: p.stats.MA,
        baseAv: p.stats.AV,
      })),
      step: structuredClone(gs.getKickoffEventStep() ?? null),
      teamNames: { [team1.id]: team1.name, [team2.id]: team2.name },
    };
  });
}

async function caption(
  page: Page,
  lines: { title: string; body?: string[]; checked?: string[] },
  card = false
): Promise<void> {
  await page.evaluate(
    ({ lines, card }) => {
      const id = card ? "kickoff-video-card" : "kickoff-video-caption";
      document.querySelector("#kickoff-video-card")?.remove();
      let box = document.querySelector<HTMLElement>(`#${id}`);
      if (!box) {
        box = document.createElement("div");
        box.id = id;
        document.body.append(box);
      }
      box.style.cssText = card
        ? "position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:14px;background:#0d1117;color:#e6edf3;font:500 22px/1.45 system-ui,sans-serif;text-align:center;padding:0 12%;pointer-events:none"
        : "position:fixed;left:12px;top:12px;z-index:2147483647;max-width:300px;background:rgba(13,17,23,0.92);color:#e6edf3;border:1px solid #30363d;border-left:4px solid #d6b25e;border-radius:8px;padding:12px 14px;font:500 14px/1.45 system-ui,sans-serif;pointer-events:none";
      const escape = (s: string) =>
        s.replaceAll(
          /[&<>]/g,
          (c) => `&${String({ "&": "amp", "<": "lt", ">": "gt" }[c])};`
        );
      box.innerHTML =
        `<div style="font-weight:700;font-size:${String(card ? 44 : 17)}px;color:#d6b25e">${escape(lines.title)}</div>` +
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
        const events = await app.bridge.events();
        const event = events.find((e) => e.name === "kickoffResult");
        found = event?.data as typeof found;
        return !!found;
      },
      { timeout: 30_000 }
    )
    .toBe(true);
  return fixtureValue(found);
}

function stepFrom(
  view: EngineView,
  at: { x: number; y: number }
): { x: number; y: number } {
  const to = { x: at.x + 1, y: at.y };
  const taken = view.players.some(
    (p) => p.at && p.at.x === to.x && p.at.y === to.y
  );
  if (taken) throw new Error(`(${String(to.x)},${String(to.y)}) is taken`);
  return to;
}

async function stepTwo(page: Page, app: GameApp) {
  const before = await engine(page);
  const team = fixtureValue(before.step).teamId;
  const movers = before.players
    .filter((p) => p.teamId === team && p.at)
    .slice(1, 1 + Math.min(2, fixtureValue(before.step).selectionLimit));
  for (const mover of movers)
    await app.pitch.clickSquare(fixtureValue(mover.at));
  await page.getByRole("button", { name: /^Start / }).click();
  for (const mover of movers) {
    const view = await engine(page);
    const from = fixtureValue(fixtureValue(view.players.find((p) => p.id === mover.id)).at);
    await app.pitch.clickSquare(from);
    await page.waitForTimeout(700);
    await app.pitch.clickSquare(stepFrom(view, from));
    await expect
      .poll(async () => {
        const latest = await engine(page);
        return fixtureValue(latest.players.find((p) => p.id === mover.id)).at;
      })
      .not.toEqual(from);
    await page.waitForTimeout(900);
  }
  const after = await engine(page);
  return movers.map((mover) => {
    const from = fixtureValue(mover.at);
    const to = fixtureValue(fixtureValue(after.players.find((p) => p.id === mover.id)).at);
    expect(Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y))).toBe(1);
    return `${mover.name} (${String(before.teamNames[team])}) stepped (${String(from.x)},${String(from.y)}) → (${String(to.x)},${String(to.y)})`;
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
    const title = `${String(clip.roll)} · ${clip.event}${clip.event === KickoffEvent.TIME_OUT ? (late ? " (turn 5)" : " (turn 2)") : ""}`;
    await caption(
      page,
      { title, body: [KICKOFF_EVENT_MEANING[clip.event]] },
      true
    );
    await page.waitForTimeout(3500);
    await page.evaluate(() =>
      document.querySelector("#kickoff-video-card")?.remove()
    );
    await caption(page, { title, body: [KICKOFF_EVENT_MEANING[clip.event]] });
    await app.pitch.waitForCameraToSettle();
    const before = await engine(page);
    const [kicking, receiving] = Object.keys(before.teamNames);

    await app.pitch.clickPlayer(KICKER);
    await page.waitForTimeout(600);
    await app.pitch.clickSquare(TARGET);
    await app.rollKickoff();
    const result = await kickoffResult(app);
    expect(result.event).toBe(clip.event);
    expect(result.roll).toBe(clip.roll);

    const checked: string[] = [];
    if (
      clip.event === KickoffEvent.ALERT_DEFENCE ||
      clip.event === KickoffEvent.QUICK_SNAP
    ) {
      await expect(page.getByRole("button", { name: /^Start / })).toBeVisible({
        timeout: 30_000,
      });
      checked.push(...(await stepTwo(page, app)));
    } else if (clip.event === KickoffEvent.HIGH_KICK) {
      const skip = page.getByRole("button", { name: "Skip" });
      await expect(skip).toBeVisible({ timeout: 30_000 });
      const view = await engine(page);
      const landing = fixtureValue(fixtureValue(view.step).landingSquare);

      const gap = (p: EngineView["players"][number]) =>
        Math.max(
          Math.abs(fixtureValue(p.at).x - landing.x),
          Math.abs(fixtureValue(p.at).y - landing.y)
        );
      const receiver = view.players
        .filter((p) => p.teamId === receiving && p.at)
        .sort((a, b) => gap(a) - gap(b))[0];
      await page.waitForTimeout(1200);
      await app.pitch.clickSquare(fixtureValue(fixtureValue(receiver).at));
      await expect
        .poll(async () => {
          const latest = await engine(page);
          return fixtureValue(
            latest.players.find((p) => p.id === fixtureValue(receiver).id)
          ).at;
        })
        .toEqual(landing);
      await page.waitForTimeout(1200);

      checked.push(
        `${fixtureValue(receiver).name} (${String(view.teamNames[fixtureValue(receiving)])}) placed under the ball at (${String(landing.x)},${String(landing.y)})`
      );
    } else if (clip.event === KickoffEvent.CHARGE) {
      const charge = page.getByRole("button", { name: /charge!/i });
      await expect(charge).toBeVisible({ timeout: 30_000 });
      const charger = before.players.filter((p) => p.teamId === kicking)[2];
      await app.pitch.clickSquare(fixtureValue(fixtureValue(charger).at));
      await page.waitForTimeout(800);
      await charge.click();
      await app.pitch.clickSquare(fixtureValue(fixtureValue(charger).at));
      await expect(app.hud.actionMenu()).toBeVisible({ timeout: 10_000 });
      await app.hud.actionButton("move").click();
      const to = { x: fixtureValue(fixtureValue(charger).at).x + 1, y: fixtureValue(fixtureValue(charger).at).y };
      await app.pitch.clickSquare(to);
      await app.pitch.clickSquare(to);
      await expect
        .poll(async () => {
          const latest = await engine(page);
          return fixtureValue(
            latest.players.find((p) => p.id === fixtureValue(charger).id)
          ).at;
        })
        .toEqual(to);
      await page.waitForTimeout(800);
      await page.getByRole("button", { name: /end activation/i }).click();
      checked.push(
        `${fixtureValue(charger).name} (${String(before.teamNames[fixtureValue(kicking)])}) took a free Move before the drive: (${String(fixtureValue(fixtureValue(charger).at).x)},${String(fixtureValue(fixtureValue(charger).at).y)}) → (${String(to.x)},${String(to.y)})`
      );
    }

    await expect
      .poll(
        async () => {
          const latest = await engine(page);
          return latest.phase;
        },
        { timeout: 60_000 }
      )
      .toBe("PLAY");
    await page.waitForTimeout(1500);
    const after = await engine(page);
    const name = (teamId: string) => after.teamNames[teamId];

    const who = (p: { name: string; teamId: string }) =>
      `${p.name} (${String(name(p.teamId))})`;

    if (clip.event === KickoffEvent.GET_THE_REF) {
      expect(after.bribes).toEqual({ [fixtureValue(kicking)]: 1, [fixtureValue(receiving)]: 1 });
      checked.push("Each team now holds one Bribe");
    } else if (clip.event === KickoffEvent.TIME_OUT) {
      const was = before.turns[fixtureValue(kicking)];
      const now = after.turns[fixtureValue(kicking)];
      expect(now).toBe(late ? fixtureValue(was) - 1 : fixtureValue(was) + 1);
      checked.push(
        `Kicking team's marker on turn ${String(was)}, so both markers moved ${late ? "back" : "forward"}: ${String(was)} → ${String(now)}`
      );
    } else if (clip.event === KickoffEvent.CHEERING_FANS) {
      const owed = Object.keys(after.owedAssists);
      expect(owed.length).toBeGreaterThan(0);
      checked.push(
        `Extra assist on the next first Block: ${owed.map((element) => name(element)).join(" and ")}`
      );
    } else if (clip.event === KickoffEvent.BRILLIANT_COACHING) {
      const free = Object.entries(after.freeRerolls).filter(([, n]) => n > 0);
      expect(free.length).toBeGreaterThan(0);
      checked.push(
        ...free.map(
          ([team, n]) =>
            `${String(name(team))}: ${String(n)} free re-roll this drive`
        )
      );
    } else if (clip.event === KickoffEvent.CHANGING_WEATHER) {
      const events = await app.bridge.events();
      expect(events.some((e) => e.name === "weatherChanged")).toBe(true);
      checked.push(`Weather re-rolled: ${before.weather} → ${after.weather}`);

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
          `Perfect Conditions, so the ball scattered in the air: (${String(scatter.from.x)},${String(scatter.from.y)}) → (${String(scatter.to.x)},${String(scatter.to.y)})`
        );
    } else if (clip.event === KickoffEvent.DODGY_SNACK) {
      const hit = Object.entries(after.modifiers);
      expect(hit.length).toBeGreaterThan(0);
      for (const [id, modifier] of hit) {
        const p = fixtureValue(after.players.find((q) => q.id === id));
        if (modifier.confinedToReserves) {
          expect(p.at).toBeNull();
          checked.push(`${who(p)} sent to the Reserves for the drive`);
        } else {
          expect([p.ma, p.av]).toEqual([p.baseMa - 1, p.baseAv - 1]);
          checked.push(
            `${who(p)}: MA ${String(p.baseMa)} → ${String(p.ma)}, AV ${String(p.baseAv)} → ${String(p.av)} for the drive`
          );
        }
      }
    } else if (clip.event === KickoffEvent.PITCH_INVASION) {
      const stunned = after.players.filter((p) => p.status === "Stunned");
      expect(stunned.length).toBeGreaterThan(0);
      checked.push(
        ...stunned.map((p) => `${who(p)} Placed Prone and Stunned`)
      );
    }
    expect(after.activeTeamId).toBe(receiving);
    checked.push(`${String(name(fixtureValue(receiving)))}'s turn begins`);

    const got = Object.entries(result.outcome.perTeam).flatMap(
      ([team, lines]) => lines.map((line) => `${String(name(team))}: ${line}`)
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
      title: ONLY
        ? `${String(new Set(CLIPS.map((c) => c.event)).size)} of eleven results checked`
        : "All eleven results checked",
      body: CLIPS.map((c) => `${String(c.roll)} · ${c.event}`).filter(
        (l, i, all) => all.indexOf(l) === i
      ),
    },
    true
  );
  await page.waitForTimeout(4000);
  writeFileSync(`${OUT}/chapters.json`, JSON.stringify(chapters, null, 2));
});
