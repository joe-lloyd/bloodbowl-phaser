import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { runInNewContext } from "node:vm";
import {
  studySchedule,
  catalogueInventory,
} from "../../scripts/coach/catalogue-study/schedule";
import { playStudyGame } from "../../scripts/coach/catalogue-study/play";
import { replayStudyTrace } from "../../scripts/coach/catalogue-study/replay";
import { createTelemetry } from "../../scripts/coach/catalogue-study/telemetry";
import { createSimGame, runMatch } from "../../src/simulation/runMatch";
import { plannerCoach } from "../../src/simulation/ai/planner";
import { RosterName } from "../../src/types/Team";
import { GameEventNames } from "../../src/types/events";

describe("catalogue study", () => {
  it("renders decision counts separately from points shares and rates", () => {
    const page = readFileSync(
      "scripts/coach/catalogue-study/report/page.html",
      "utf8"
    );
    const formatter = page.slice(
      page.indexOf("function value("),
      page.indexOf("function render(")
    );
    const format = runInNewContext(`(${formatter})`) as (
      key: string,
      value: unknown
    ) => string;
    expect(format("decision_points_offered", 331614)).toBe(
      (331614).toLocaleString()
    );
    expect(format("selections", 2)).toBe("2");
    expect(format("points", 0.5)).toBe("50.0%");
    expect(format("race_macro_points", 0.75)).toBe("75.0%");
    expect(format("points_low", 0.25)).toBe("25.0%");
    expect(format("turnover_rate", 0.3)).toBe("30.0%");
    expect(format("failure_rate", 0.5)).toBe("50.0%");
    expect(format("td_per_game", 1.25)).toBe("1.250");
    expect(format("points_high", null)).toBe("—");
  });

  it("counts each event once when decision enumeration reads the old event log", async () => {
    const rosters: [RosterName, RosterName] = [
      RosterName.OGRE,
      RosterName.VAMPIRE,
    ];
    const game = createSimGame(19, rosters, 1, "sevens-lineup");
    let dice = 0;
    let triggers = 0;
    game.ctx.eventBus.on(GameEventNames.DiceRoll, () => dice++);
    game.ctx.eventBus.on(GameEventNames.SkillTriggered, () => triggers++);
    const telemetry = createTelemetry(game);
    const result = await runMatch({
      seed: 19,
      rosters,
      game,
      coaches: [telemetry.wrap(plannerCoach), telemetry.wrap(plannerCoach)],
      inducements: false,
    });
    const observed = telemetry.snapshot();
    expect(result.final.phase).toBe("GAME_OVER");
    expect(dice).toBeGreaterThan(0);
    expect(triggers).toBeGreaterThan(0);
    expect(observed.rolls.reduce((sum, roll) => sum + roll.attempts, 0)).toBe(
      dice
    );
    expect(observed.skills.reduce((sum, skill) => sum + skill.count, 0)).toBe(
      triggers
    );
    expect(
      observed.skills.every((s) => s.firstStep < result.steps.length)
    ).toBe(true);
    // A full planner match: like the harness and planner-run matches, it
    // takes seconds, and more on a loaded runner.
  }, 60_000);
  it("balances each template, coach, and side and pairs every available recipe", () => {
    const inventory = catalogueInventory();
    const jobs = studySchedule();
    expect(new Set(jobs.map((j) => j.id)).size).toBe(jobs.length);
    const league = jobs.filter((j) => j.cohort === "league");
    const count = inventory.teams.length;
    expect(league).toHaveLength(count * (count - 1));
    expect(new Set(league.map((j) => j.templates.join("/"))).size).toBe(
      league.length
    );
    for (const template of inventory.teams) {
      for (const side of [0, 1]) {
        expect(
          league.filter((j) => j.templates[side] === template.id)
        ).toHaveLength(count - 1);
        for (const cohort of ["calibration", "hard", "legend"] as const) {
          const subset = jobs.filter(
            (j) => j.cohort === cohort && j.templates[side] === template.id
          );
          const expected = cohort === "calibration" ? 6 : 1;
          expect(
            subset.filter((j) => j.coaches[side] === "planner")
          ).toHaveLength(expected);
          expect(
            subset.filter((j) => j.coaches[side] !== "planner")
          ).toHaveLength(expected);
        }
      }
    }
  });

  it("records actual reroll banks and replays a catalogue game exactly", async () => {
    const out = mkdtempSync(join(tmpdir(), "bb7-study-"));
    try {
      const job = studySchedule().find((j) => j.cohort === "calibration")!;
      const result = await playStudyGame(job, out);
      expect(result.completed).toBe(true);
      expect(result.findings).toEqual([]);
      const file = join(out, "traces", `${job.id}.json.gz`);
      const trace = JSON.parse(gunzipSync(readFileSync(file)).toString());
      expect(trace.initial.teams[0].computerTemplateId).toBe(job.templates[0]);
      expect(trace.initial.teams[0].rerolls).toBe(
        catalogueInventory().teams.find((t) => t.id === job.templates[0])!
          .rerolls
      );
      expect((await replayStudyTrace(file)).commands).toBe(result.commands);
      expect(
        Object.values(result.selected).reduce((a, b) => a + b, 0)
      ).toBeGreaterThan(0);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
    // Plays a full game and replays it.
  }, 60_000);
});
