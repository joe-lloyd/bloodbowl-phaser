import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { labInventory } from "../../scripts/coach/policy-lab/teams";
import { validateRecovery } from "../../scripts/coach/policy-lab/recover";
import { DEFAULT_WEIGHTS } from "../../src/simulation/ai/weights";
import { policySourceDigest } from "../../scripts/coach/policy-study/fingerprint";
import { coverageInventory } from "../../scripts/coach/policy-lab/gate";
import {
  policySchedule,
  limitPolicyBlocks,
} from "../../scripts/coach/policy-study/schedule";
import { playStudyGame } from "../../scripts/coach/catalogue-study/play";
import {
  openTrace,
  replayStudyTrace,
} from "../../scripts/coach/catalogue-study/replay";
import type { StudyJob } from "../../scripts/coach/catalogue-study/model";
import { createPlannerCoach } from "../../src/simulation/ai/planner";
import { createComputerTeamFromTemplate } from "../../src/competition/computerTeamTemplates";

describe("repeatable Sevens policy lab", () => {
  const variants = labInventory();
  it("rebuilds identical teams with actual budget and random progression prices", () => {
    expect(labInventory()).toEqual(variants);
    const coherent = fixtureValue(
      variants.find((v) => v.buildMethod === "coherent")
    );
    const random = fixtureValue(
      variants.find(
        (v) =>
          v.buildMethod === "random-primary" && v.template === coherent.template
      )
    );
    expect(coherent.developmentBudget).toBe(48);
    expect(random.developmentBudget).toBe(48);
    expect(coherent.sppSpent).toBe(24);
    expect(random.sppSpent).toBe(28);
    expect(coherent.teamValue).toBe(690000);
    expect(random.teamValue).toBe(770000);
    expect(new Set(coherent.allocations.map((a) => a.player)).size).toBe(4);
    expect(
      random.team.players
        .flatMap((p) => p.advancements ?? [])
        .map((a) => a.sppCost)
    ).toEqual([3, 4, 3, 4, 3, 4, 3, 4]);
  });

  it("accounts for every catalogue skill without treating rule scripts as AI evidence", () => {
    const inventory = coverageInventory();
    expect(inventory).toHaveLength(110);
    expect(inventory.find((s) => s.skill === "Pass")).toMatchObject({
      status: "bounded-contract",
    });
    expect(inventory.find((s) => s.skill === "Throw Team-mate")).toMatchObject({
      aiContracts: [],
      status: "open-tactical-gap",
    });
  });

  it("balances each policy's roster, physical side and first receipt in eight-game blocks", () => {
    const jobs = policySchedule(variants, false, 30_000_000, true);
    expect(jobs).toHaveLength(5376);
    const blocks = new Map<string, typeof jobs>();
    for (const job of jobs)
      blocks.set(job.pair, [...(blocks.get(job.pair) ?? []), job]);
    for (const block of blocks.values()) {
      expect(block).toHaveLength(8);
      expect(
        block.filter((j) => j.receivingSide === j.candidateSide)
      ).toHaveLength(4);
      const assignments = block.map(
        (j) =>
          `${j.variantIds[j.candidateSide]}/${String(j.candidateSide)}/${String(j.receivingSide === j.candidateSide)}`
      );
      expect(new Set(assignments).size).toBe(8);
    }
  });

  it("rejects recovery after an AI, schedule or archived-source change", () => {
    const root = mkdtempSync(join(tmpdir(), "bb7-recovery-inputs-"));
    const old = join(root, "old"),
      current = join(root, "current");
    const inputs = [
      "src/engine.ts",
      "package.json",
      "pnpm-lock.yaml",
      "tsconfig.json",
      "scripts/coach/catalogue-study/play.ts",
      "scripts/coach/policy-lab/teams.ts",
      "scripts/coach/policy-lab/evidence.ts",
      ...["fingerprint.ts", "run.ts", "teams.ts", "schedule.ts"].map(
        (f) => "scripts/coach/advanced-study/" + f
      ),
      ...["run.ts", "pool.ts", "schedule.ts"].map(
        (f) => "scripts/coach/policy-study/" + f
      ),
    ];
    try {
      for (const base of [old, current])
        for (const name of inputs) {
          const file = join(base, name);
          mkdirSync(dirname(file), { recursive: true });
          writeFileSync(file, "stable");
        }
      const manifest = {
        sourceDigest: policySourceDigest(old, true),
        baselineDigest: "frozen",
        revision: "original",
        jobs: [],
        variants: [],
      };
      expect(validateRecovery(manifest, manifest, old, current)).toHaveLength(
        64
      );
      writeFileSync(join(current, "src/engine.ts"), "changed AI");
      expect(() => validateRecovery(manifest, manifest, old, current)).toThrow(
        "changed engine or AI"
      );
      writeFileSync(join(current, "src/engine.ts"), "stable");
      writeFileSync(
        join(current, "scripts/coach/policy-study/run.ts"),
        "changed coach construction"
      );
      expect(() => validateRecovery(manifest, manifest, old, current)).toThrow(
        "changed gameplay input"
      );
      writeFileSync(
        join(current, "scripts/coach/policy-study/run.ts"),
        "stable"
      );
      expect(() =>
        validateRecovery(
          manifest,
          { ...manifest, node: "v0.0.0" },
          old,
          current
        )
      ).toThrow("identical");

      for (const candidate of [
        { candidateRosters: { Halfling: { safeMove: 0.82 } } },
        { candidateGameTypes: { "street-bowl": { kickWide: 2 } } },
        { candidateWeights: { ...DEFAULT_WEIGHTS, cageWalk: 0 } },
        { candidate: "standard" },
      ])
        expect(() =>
          validateRecovery(
            manifest,
            { ...manifest, ...candidate },
            old,
            current
          )
        ).toThrow("identical");
      expect(
        validateRecovery(
          manifest,
          {
            ...manifest,
            candidate: "planner",
            candidateWeights: DEFAULT_WEIGHTS,
            candidateRosters: {},
          },
          old,
          current
        )
      ).toHaveLength(64);
      const changed = {
        ...manifest,
        jobs: [fixtureValue(policySchedule(variants)[0])],
      };
      expect(() => validateRecovery(manifest, changed, old, current)).toThrow(
        "schedule"
      );
      writeFileSync(
        join(old, "scripts/coach/catalogue-study/play.ts"),
        "tampered archive"
      );
      expect(() => validateRecovery(manifest, manifest, old, current)).toThrow(
        "original manifest"
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("retains a required Vampire sentinel in a bounded pilot", () => {
    const jobs = policySchedule(variants, true, 30000000, true);
    const vampire = fixtureValue(
      variants.find((v) => v.team.rosterName.includes("Vampire"))
    );
    const pilot = limitPolicyBlocks(jobs, 24, [vampire.id]);
    expect(pilot).toHaveLength(192);
    expect(pilot.some((j) => j.variantIds.includes(vampire.id))).toBe(true);
    expect(new Set(pilot.map((j) => j.pair)).size).toBe(24);
  });

  it("executes the requested first receiver through a complete match and replay", async () => {
    const out = mkdtempSync(join(tmpdir(), "bb7-lab-receive-"));
    try {
      const job = policySchedule(variants, false, 30_000_000, true)[4];
      const result = await playStudyGame(fixtureValue(job), out, undefined, [
        createPlannerCoach(),
        createPlannerCoach(),
      ]);
      expect(result.initialReceivingSide).toBe(1);
      expect(result.completed).toBe(true);
      expect(result.findings).toEqual([]);
      const replay = await replayStudyTrace(
        join(out, "traces", fixtureValue(job).id + ".json.gz")
      );
      expect(replay.observations.counters).toEqual(result.counters);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it("reports the forced receiver when the opening drive is an automatic touchback", async () => {
    const out = mkdtempSync(join(tmpdir(), "bb7-lab-touchback-"));
    try {
      const templates = [
        "halfling-best-stuff-roster",
        "dwarf-1-reroll",
      ] as const;
      const halflings = createComputerTeamFromTemplate(templates[0]);
      const dwarfs = createComputerTeamFromTemplate(templates[1]);
      dwarfs.players = [];
      const job: StudyJob = {
        id: "empty-kicker",
        cohort: "calibration",
        pair: "halfling-dwarf",
        seed: 30_000_004,
        templates: [...templates],
        coaches: ["heuristic", "heuristic"],
        receivingSide: 0,
        inducements: false,
      };
      const result = await playStudyGame(job, out, [halflings, dwarfs]);
      const { steps } = openTrace(
        join(out, "traces", job.id + ".json.gz")
      ).recording;
      expect([
        result.initialReceivingSide,
        steps.find((step) => step.command.type === "kick-ball")?.team,
      ]).toEqual([0, 0]);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 60_000);

  it("gives a cheap Halfling preset its petty cash and buys the Master Chef", async () => {
    const out = mkdtempSync(join(tmpdir(), "bb7-lab-petty-cash-"));
    try {
      const job: StudyJob = {
        id: "halfling-petty-cash",
        cohort: "calibration",
        pair: "halfling-dwarf",
        seed: 30_000_004,
        templates: ["halfling-best-stuff-roster", "dwarf-1-reroll"],
        coaches: ["heuristic", "heuristic"],
        receivingSide: 0,
        inducements: true,
      };
      const result = await playStudyGame(job, out);
      const trace = join(out, "traces", job.id + ".json.gz");
      const opening = openTrace(trace);
      const inducements = () =>
        opening.game.ctx.gameService.getState().inducements;
      expect(inducements()).toBeUndefined();
      const steps = opening.recording.steps;
      const setup = steps.findIndex(
        (step) => step.command.type === "start-setup"
      );
      expect(steps.slice(0, setup + 1).map((step) => step.command)).toEqual([
        {
          type: "select-inducement",
          teamId: "team1",
          inducement: "Halfling Master Chef",
          quantity: 1,
        },
        {
          type: "select-inducement",
          teamId: "team1",
          inducement: "Part-time Assistant Coach",
          quantity: 2,
        },
        { type: "confirm-inducements", teamId: "team1" },
        { type: "confirm-inducements", teamId: "team2" },
        { type: "start-setup", kickingTeamId: "team2" },
      ]);
      for (const step of steps.slice(0, setup))
        await opening.game.execute(step.command);
      expect(inducements()?.budgets).toEqual({ team1: 130_000, team2: 0 });
      expect(
        inducements()?.inventory.map(
          (e) => `${e.ownerTeamId}: ${e.inducement} x${String(e.quantity)}`
        )
      ).toEqual([
        "team1: Halfling Master Chef x1",
        "team1: Part-time Assistant Coach x2",
      ]);
      expect(result.completed).toBe(true);
      expect(result.initialReceivingSide).toBe(0);
      const chefHalf = () => inducements()?.masterChef?.half;
      expect(chefHalf()).toBeUndefined();
      const start = steps[setup];
      if (start) await opening.game.execute(start.command);
      expect([chefHalf(), opening.game.snapshot().phase]).toEqual([
        "h1",
        "SETUP",
      ]);
      const replay = await replayStudyTrace(trace);
      expect(replay.observations.counters).toEqual(result.counters);
      const chefRolls = (rolls: { roll: string; attempts: number }[]) =>
        rolls
          .filter((r) => r.roll === "Halfling Master Chef")
          .reduce((sum, r) => sum + r.attempts, 0);
      expect([
        chefRolls(result.rolls),
        chefRolls(replay.observations.rolls),
      ]).toEqual([2, 2]);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 60_000);

  it.each([true, false])(
    "plays a Street Bowl game with one free potion a team and replays it, petty cash %s",
    async (inducements) => {
      const out = mkdtempSync(join(tmpdir(), "bb7-lab-street-"));
      try {
        const job: StudyJob = {
          id: "street-potions",
          cohort: "calibration",
          pair: "amazon-chaos-dwarf",
          seed: 31_000_000,
          templates: ["amazon-amazons-0rr", "chaos-dwarf-minotaur-1-reroll"],
          coaches: ["heuristic", "heuristic"],
          inducements,
          format: { gameType: "street-bowl", venue: "street" },
        };
        const result = await playStudyGame(job, out);
        const trace = join(out, "traces", job.id + ".json.gz");
        const { recording, game } = openTrace(trace);
        const inducementSteps = new Set([
          "select-inducement",
          "confirm-inducements",
          "choose-inducement",
        ]);
        const kickoff = recording.steps.findIndex(
          (step) => !inducementSteps.has(step.command.type)
        );
        const opening = recording.steps
          .slice(0, kickoff + 1)
          .map((step) => step.command.type);
        const replay = await replayStudyTrace(trace);
        expect({
          gameType: game.ctx.gameService.getState().gameType,
          pitch: [game.ctx.gameService.getState().venue, result.completed],
          opening,
          counters: replay.observations.counters,
        }).toEqual({
          gameType: "street-bowl",
          pitch: ["street", true],
          opening: [
            "confirm-inducements",
            "confirm-inducements",
            "choose-inducement",
            "choose-inducement",
            "coin-flip",
          ],
          counters: result.counters,
        });
      } finally {
        rmSync(out, { recursive: true, force: true });
      }
    },
    60_000
  );
});
