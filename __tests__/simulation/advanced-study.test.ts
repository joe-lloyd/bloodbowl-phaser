import { describe, it, expect } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { gunzipSync } from "node:zlib";
import {
  advancedInventory,
  teamFromVariant,
} from "../../scripts/coach/advanced-study/teams";
import { advancedSchedule } from "../../scripts/coach/advanced-study/schedule";
import { acquisitionDigest } from "../../scripts/coach/advanced-study/fingerprint";
import {
  firstChoice,
  probeRun,
} from "../../scripts/coach/advanced-study/probes";
import { playStudyGame } from "../../scripts/coach/catalogue-study/play";
import { replayStudyTrace } from "../../scripts/coach/catalogue-study/replay";
import { SKILL_DEFINITIONS, SkillType } from "../../src/types/Skills";
import { findRuleConfig } from "../../src/data/ruleScenarios";
import { RosterName } from "../../src/types/Team";

describe("advanced skill study", () => {
  const variants = advancedInventory();
  it("resumes through report edits but rejects changes to acquisition inputs", () => {
    const root = mkdtempSync(join(tmpdir(), "bb7-fingerprint-"));
    const put = (name: string, content = "initial") => {
      const file = join(root, name);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, content);
    };
    try {
      const inputs = [
        "src/engine.ts",
        "scripts/coach/catalogue-study/play.ts",
        ...["fingerprint.ts", "run.ts", "teams.ts", "schedule.ts"].map(
          (name) => "scripts/coach/advanced-study/" + name
        ),
        "package.json",
        "pnpm-lock.yaml",
        "tsconfig.json",
      ];
      inputs.forEach((name) => put(name));
      const original = acquisitionDigest(root);
      for (const file of [
        "README.md",
        "report.py",
        "test_report.py",
        "dashboard.html",
        "probes.ts",
      ])
        put("scripts/coach/advanced-study/" + file);
      put("scripts/coach/catalogue-study/report/analyse.py");
      put("scripts/coach/catalogue-study/report/__pycache__/analyse.pyc");
      expect(acquisitionDigest(root)).toBe(original);
      for (const file of inputs) {
        put(file, "changed");
        expect(acquisitionDigest(root)).not.toBe(original);
        put(file);
      }
      expect(acquisitionDigest(root)).toBe(original);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("covers every learnable skill with legal, deterministic, cost-matched builds", () => {
    expect(advancedInventory()).toEqual(variants);
    const covered = new Set(
      variants.flatMap((v) => v.allocations.map((a) => a.skill))
    );
    expect(
      Object.values(SKILL_DEFINITIONS).filter(
        (d) => d.kind === "skill" && !covered.has(d.type)
      )
    ).toEqual([]);
    for (const focused of variants.filter((v) => v.arm === "focused")) {
      const control = variants.find(
        (v) =>
          v.template === focused.template &&
          v.replicate === focused.replicate &&
          v.arm === "random"
      )!;
      expect(focused.allocations).toHaveLength(6);
      expect(control.teamValue).toBe(focused.teamValue);
      expect(control.sppSpent).toBe(focused.sppSpent);
      for (const variant of [focused, control]) {
        const team = teamFromVariant(variant);
        expect(team.teamValue).toBe(variant.teamValue);
        expect(
          team.players.every((p) => (p.advancements?.length ?? 0) <= 2)
        ).toBe(true);
      }
      focused.allocations.forEach((a, i) => {
        const b = control.allocations[i];
        expect([
          b.player,
          b.access,
          SKILL_DEFINITIONS[b.skill].category,
        ]).toEqual([a.player, a.access, SKILL_DEFINITIONS[a.skill].category]);
      });
    }
  });
  it("mirrors identical seed and variants and retains three comparison arms", () => {
    const jobs = advancedSchedule(variants);
    expect(jobs).toHaveLength(1944);
    expect(new Set(jobs.map((j) => j.id)).size).toBe(jobs.length);
    for (let i = 0; i < jobs.length; i += 2) {
      expect(jobs[i + 1].seed).toBe(jobs[i].seed);
      expect(jobs[i + 1].pair).toBe(jobs[i].pair);
      expect(jobs[i + 1].variantIds).toEqual([...jobs[i].variantIds].reverse());
    }
    for (const arm of [
      "focused-vs-base",
      "random-vs-base",
      "focused-vs-random",
    ])
      expect(jobs.filter((j) => j.comparison === arm)).toHaveLength(648);
  });
  it("removes native skills before a controlled script, without mutating its fixture", async () => {
    const { config } = findRuleConfig("horns-blitz-strength")!;
    const withSkill = await probeRun(config, SkillType.HORNS, 1, false);
    const withoutSkill = await probeRun(config, SkillType.HORNS, 1, true);
    expect(withSkill.holders).toBeGreaterThan(0);
    expect(withSkill.triggers).toBeGreaterThan(0);
    expect(withoutSkill.triggers).toBe(0);
    expect(withSkill.rejected).toBe(0);
    expect(withoutSkill.rejected).toBe(0);
    expect((await probeRun(config, SkillType.HORNS, 1, false)).triggers).toBe(
      withSkill.triggers
    );
  });
  it("distinguishes an ordinary Blitz from a special Blitz in opening diagnostics", async () => {
    const { config } = findRuleConfig("projectile-vomit-blitz")!;
    expect(await firstChoice(config, 71)).toMatchObject({
      expectedAction: "blitz",
      expectedBlockReplacement: "vomit",
      offered: true,
      chosen: "blitz",
      chosenBlockReplacement: null,
    });
    expect(
      await firstChoice(
        {
          ...config,
          setup: {
            ...config.setup,
          team1Roster: RosterName.HUMAN,
          },
        },
        71
      )
    ).toMatchObject({
      expectedAction: "blitz",
      expectedBlockReplacement: "vomit",
      offered: false,
    });
  });
  it("preserves advanced players and prices in the actual saved replay", async () => {
    const out = mkdtempSync(join(tmpdir(), "bb7-advanced-"));
    try {
      const job = advancedSchedule(variants)[0];
      const sides = job.variantIds.map(
        (id) => variants.find((v) => v.id === id)!
      );
      const result = await playStudyGame(job, out, [
        teamFromVariant(sides[0]),
        teamFromVariant(sides[1]),
      ]);
      expect(result.completed).toBe(true);
      expect(result.findings).toEqual([]);
      const file = join(out, "traces", job.id + ".json.gz");
      const trace = JSON.parse(gunzipSync(readFileSync(file)).toString());
      expect(
        trace.initial.teams[0].players.reduce(
          (sum: number, p: { advancements?: unknown[] }) =>
            sum + (p.advancements?.length ?? 0),
          0
        )
      ).toBe(6);
      expect((await replayStudyTrace(file)).commands).toBe(result.commands);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});
