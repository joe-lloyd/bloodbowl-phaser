import { SkillType } from "../../types/Skills";
import { type SkillRule } from "./SkillRule";

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

  unregister(type: SkillType): void {
    rules.delete(type);
  },

  coverage(): { implemented: number; total: number; missing: string[] } {
    const all: SkillType[] = Object.values(SkillType);
    const missing = all.filter((t) => !rules.has(t)).map((t) => String(t));
    return {
      implemented: all.length - missing.length,
      total: all.length,
      missing,
    };
  },

  _reset(): void {
    rules.clear();
  },
};
