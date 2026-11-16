import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { labInventory } from "../../scripts/coach/policy-lab/teams";
import { coverageInventory } from "../../scripts/coach/policy-lab/gate";
import { policySchedule } from "../../scripts/coach/policy-study/schedule";
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
