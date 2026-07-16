/**
 * Skill rules entry point. Importing this module registers the built-in
 * rules with the SkillRegistry and exposes the fold helpers that roll paths
 * call. Add a rule by creating one file under rules/ and registering it here.
 */

import { SkillType } from "../../types/Skills";
import { Player } from "../../types/Player";
import { SkillRegistry } from "./SkillRegistry";
import { BlockResultContext } from "./SkillRule";
import { BlockRule } from "./rules/BlockRule";

let registered = false;

/** Register every built-in skill rule (idempotent). */
export function registerBuiltinSkills(): void {
  if (registered) return;
  registered = true;
  SkillRegistry.register(SkillType.BLOCK, BlockRule);
}

// Register on first import so any consumer of the fold helpers is covered.
registerBuiltinSkills();

/**
 * Fold every participant's registered rules over a block result. Deterministic
 * order: attacker then defender (extended to adjacents when reactive triggers
 * land). A rule with no `onBlockResult` hook is skipped.
 */
export function foldBlockResult(ctx: BlockResultContext): void {
  const participants: Player[] = [ctx.attacker, ctx.defender];
  for (const self of participants) {
    for (const skill of self.skills) {
      SkillRegistry.get(skill.type)?.onBlockResult?.(ctx, self);
    }
  }
}

export { SkillRegistry } from "./SkillRegistry";
export type { SkillRule, BlockResultContext } from "./SkillRule";
