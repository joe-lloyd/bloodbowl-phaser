/** Run named coach contracts and inventory honest tactical gaps. */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SkillType } from "../../../src/types/Skills";
import { ruleScenariosFor } from "../../../src/data/ruleScenarios";

export const CONTRACT_FILES = [
  "__tests__/simulation/turn-plans.test.ts",
  "__tests__/simulation/late-half-plans.test.ts",
  "__tests__/simulation/skill-plans.test.ts",
  "__tests__/simulation/plannerRuns.test.ts",
  "__tests__/simulation/policy-lab.test.ts",
];

const tacticalEvidence: Partial<Record<SkillType, string[]>> = {
  [SkillType.PASS]: [
    "useful Pass and Catch scoring transfer",
    "Pass reroll probability",
  ],
  [SkillType.CATCH]: [
    "useful Pass and Catch scoring transfer",
    "Catch reroll probability",
  ],
  [SkillType.BLOODLUST]: [
    "failed-Bloodlust carrier",
    "Thrall support preparation",
    "non-carrier bite target",
  ],
  [SkillType.HYPNOTIC_GAZE]: [
    "useful scoring-line gaze",
    "irrelevant gaze rejected",
    "acted teammate rejected",
  ],
  [SkillType.MULTIPLE_BLOCK]: [
    "worthwhile reduced-strength double hit",
    "dangerous double hit rejected",
  ],
  [SkillType.DODGE]: [
    "league withdrawal",
    "spent reroll control",
    "Tackle denies Dodge",
  ],
  [SkillType.TACKLE]: ["Tackle denies Dodge"],
  [SkillType.SURE_HANDS]: ["securing excludes pickup rerolls"],
  [SkillType.EXTRA_ARMS]: ["securing excludes pickup modifiers"],
};

export function coverageInventory() {
  return Object.values(SkillType).map((skill) => ({
    skill,
    mechanics: ruleScenariosFor(skill)?.configs.map((c) => c.id) ?? [],
    aiContracts: tacticalEvidence[skill] ?? [],
    status: tacticalEvidence[skill] ? "bounded-contract" : "open-tactical-gap",
    evidenceScope:
      "Forced rule scenarios prove mechanics only. Natural events prove occurrence, not individual skill value.",
  }));
}

export function runGate(out: string): void {
  mkdirSync(out, { recursive: true });
  const resultFile = join(out, "contracts.json");
  const run = spawnSync(
    "pnpm",
    [
      "exec",
      "vitest",
      "run",
      ...CONTRACT_FILES,
      "--reporter=json",
      `--outputFile=${resultFile}`,
    ],
    { encoding: "utf8", maxBuffer: 50_000_000 }
  );
  writeFileSync(join(out, "contracts.log"), run.stdout + run.stderr);
  writeFileSync(
    join(out, "coverage.json"),
    JSON.stringify(coverageInventory(), null, 2)
  );
  const result = JSON.parse(readFileSync(resultFile, "utf8"));
  const receipt = {
    stage: "contracts",
    passed: run.status === 0 && result.numFailedTests === 0,
    tests: result.numTotalTests,
    failures: result.testResults.flatMap(
      (file: {
        assertionResults: {
          status: string;
          fullName: string;
          failureMessages: string[];
        }[];
      }) =>
        file.assertionResults
          .filter((t) => t.status === "failed")
          .map((t) => ({ test: t.fullName, why: t.failureMessages }))
    ),
  };
  writeFileSync(join(out, "gate.json"), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt));
  if (!receipt.passed)
    throw new Error(
      "Tactical gate failed; inspect gate.json and contracts.log before acquiring games"
    );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  runGate(resolve(process.argv[2] ?? "sim-results/policy-lab/contracts"));
