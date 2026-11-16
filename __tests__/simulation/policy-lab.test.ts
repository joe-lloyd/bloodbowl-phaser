import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { labInventory } from "../../scripts/coach/policy-lab/teams";
import { validateRecovery } from "../../scripts/coach/policy-lab/recover";
import { policySourceDigest } from "../../scripts/coach/policy-study/fingerprint";
import { coverageInventory } from "../../scripts/coach/policy-lab/gate";
import {
  policySchedule,
  limitPolicyBlocks,
} from "../../scripts/coach/policy-study/schedule";
import { playStudyGame } from "../../scripts/coach/catalogue-study/play";
import { replayStudyTrace } from "../../scripts/coach/catalogue-study/replay";
import { createPlannerCoach } from "../../src/simulation/ai/planner";

describe("repeatable Sevens policy lab", () => {
  const variants = labInventory();
  it("rebuilds identical teams with actual budget and random progression prices", () => {
    expect(labInventory()).toEqual(variants);
    const coherent = variants.find((v) => v.buildMethod === "coherent")!;
    const random = variants.find(
      (v) =>
        v.buildMethod === "random-primary" && v.template === coherent.template
    )!;
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
    expect(inventory).toHaveLength(108);
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
    expect(jobs).toHaveLength(5184);
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
          `${j.variantIds[j.candidateSide]}/${j.candidateSide}/${j.receivingSide === j.candidateSide}`
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
      const changed = { ...manifest, jobs: [policySchedule(variants)[0]] };
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
    const vampire = variants.find((v) =>
      v.team.rosterName.includes("Vampire")
    )!;
    const pilot = limitPolicyBlocks(jobs, 24, [vampire.id]);
    expect(pilot).toHaveLength(192);
    expect(pilot.some((j) => j.variantIds.includes(vampire.id))).toBe(true);
    expect(new Set(pilot.map((j) => j.pair)).size).toBe(24);
  });

  it("executes the requested first receiver through a complete match and replay", async () => {
    const out = mkdtempSync(join(tmpdir(), "bb7-lab-receive-"));
    try {
      const job = policySchedule(variants, false, 30_000_000, true)[4];
      const result = await playStudyGame(job, out, undefined, [
        createPlannerCoach(),
        createPlannerCoach(),
      ]);
      expect(result.initialReceivingSide).toBe(1);
      expect(result.completed).toBe(true);
      expect(result.findings).toEqual([]);
      const replay = await replayStudyTrace(
        join(out, "traces", job.id + ".json.gz")
      );
      expect(replay.observations.counters).toEqual(result.counters);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});
