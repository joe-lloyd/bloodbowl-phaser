/**
 * SkillRegistry - maps a SkillType to its rule object.
 *
 * Central lookup so managers/controllers never `switch` over skills. Absent
 * rules mean the skill is inert. `coverage()` reports implemented vs. the
 * full catalog so rulebook fidelity is measurable in tests/docs.
 */

import { SkillType } from "../../types/Skills";
import { SkillRule } from "./SkillRule";

const rules = new Map<SkillType, SkillRule>();

export const SkillRegistry = {
  register(type: SkillType, rule: SkillRule): void {
    rules.set(type, rule);
  },

  get(type: SkillType): SkillRule | undefined {
    return rules.get(type);
  },

  has(type: SkillType): boolean {
    return rules.has(type);
  },

  /** Implemented vs. the full SkillType catalog. */
  coverage(): { implemented: number; total: number; missing: string[] } {
    const all = Object.values(SkillType) as SkillType[];
    const missing = all.filter((t) => !rules.has(t)).map((t) => String(t));
    return {
      implemented: all.length - missing.length,
      total: all.length,
      missing,
    };
  },

  /** Test-only: wipe registrations. */
  _reset(): void {
    rules.clear();
  },
};
