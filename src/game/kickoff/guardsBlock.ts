import { type Player } from "@/types/Player";
import { SkillType, hasSkill } from "@/types/Skills";
import type { BlockResultType } from "../../services/BlockResolutionService";

const GUARD_STRENGTH = 3;

type GuardOutcome = "safe" | "pushed" | "arrested";

interface GuardDice {
  count: number;
  chooser: "guards" | "target";
}

export function guardDice(targetStrength: number): GuardDice {
  if (targetStrength === GUARD_STRENGTH) return { count: 1, chooser: "guards" };
  const guardsStronger = GUARD_STRENGTH > targetStrength;
  const [high, low] = guardsStronger
    ? [GUARD_STRENGTH, targetStrength]
    : [targetStrength, GUARD_STRENGTH];
  return {
    count: high > low * 2 ? 3 : 2,
    chooser: guardsStronger ? "guards" : "target",
  };
}

function guardOutcome(face: BlockResultType, target: Player): GuardOutcome {
  switch (face) {
    case "skull":
      return "safe";
    case "push":
      return "pushed";
    case "both-down":
      return hasSkill(target.skills, SkillType.BLOCK) ? "safe" : "arrested";
    case "pow-dodge":
      return hasSkill(target.skills, SkillType.DODGE) ? "pushed" : "arrested";
    case "pow":
      return "arrested";
    default: {
      const unhandled: never = face;
      return unhandled;
    }
  }
}

const SEVERITY: Record<GuardOutcome, number> = { safe: 0, pushed: 1, arrested: 2 };

export function chosenGuardOutcome(
  faces: readonly BlockResultType[],
  target: Player,
  chooser: GuardDice["chooser"]
): GuardOutcome {
  const outcomes = faces.map((face) => guardOutcome(face, target));
  const ranked = [...outcomes].sort((a, b) => SEVERITY[a] - SEVERITY[b]);
  const pick = chooser === "target" ? ranked[0] : ranked[ranked.length - 1];
  return pick ?? "safe";
}
