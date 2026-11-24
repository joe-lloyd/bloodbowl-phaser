import type {
  PendingAdvancementRoll,
  RandomSkillCandidate,
} from "../../../types/Player";
import type { SkillSelectionResult } from "../../../game/progression/advancementModes";
import type { DiceKind } from "../../dice/diceScene";

export interface RollThrow {
  kind: DiceKind;
  values: number[];
  title: string;
  result: string;
}

export function candidateThrows(
  candidates: readonly RandomSkillCandidate[]
): RollThrow[] {
  return candidates.map(({ skill, firstD6, secondD6 }, index) => ({
    kind: "d6",
    values: [firstD6, secondD6],
    title: index === 0 ? "First skill" : "Second skill",
    result: `${String(firstD6)}, ${String(secondD6)}: ${skill}`,
  }));
}

export function advancementThrows(roll: PendingAdvancementRoll): RollThrow[] {
  switch (roll.kind) {
    case "random-primary":
      return candidateThrows(roll.candidates);
    case "characteristic":
      return [
        {
          kind: "d8",
          values: [roll.roll],
          title: "Characteristic",
          result: `Rolled ${String(roll.roll)}`,
        },
      ];
  }
}

export function selectionThrows({
  d3,
  skill,
}: Pick<SkillSelectionResult, "d3" | "skill">): RollThrow[] {
  if (d3 === undefined) return [];
  return [
    {
      kind: "d6",
      values: [d3 * 2],
      title: "D3: a D6, halved",
      result: `D3 ${String(d3)}: ${skill}`,
    },
  ];
}
