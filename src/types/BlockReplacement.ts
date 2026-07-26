import { SkillType } from "./Skills";

/**
 * Special Actions that may replace the Block made during a Blitz.
 *
 * These stable wire identifiers are deliberately separate from display
 * labels and SkillType values so declarations can survive movement,
 * snapshots, and online/headless command serialization.
 */
export const BLOCK_REPLACEMENTS = [
  "stab",
  "chainsaw",
  "breatheFire",
  "chomp",
  "vomit",
] as const;

export type BlockReplacement = (typeof BLOCK_REPLACEMENTS)[number];

export interface BlockReplacementDefinition {
  skill: SkillType;
  directAction: BlockReplacement;
  label: string;
}

export const BLOCK_REPLACEMENT_DEFINITIONS: Record<
  BlockReplacement,
  BlockReplacementDefinition
> = {
  stab: {
    skill: SkillType.STAB,
    directAction: "stab",
    label: "Stab",
  },
  chainsaw: {
    skill: SkillType.CHAINSAW,
    directAction: "chainsaw",
    label: "Chainsaw",
  },
  breatheFire: {
    skill: SkillType.BREATHE_FIRE,
    directAction: "breatheFire",
    label: "Breathe Fire",
  },
  chomp: {
    skill: SkillType.MONSTROUS_MOUTH,
    directAction: "chomp",
    label: "Monstrous Mouth",
  },
  vomit: {
    skill: SkillType.PROJECTILE_VOMIT,
    directAction: "vomit",
    label: "Projectile Vomit",
  },
};

export function isBlockReplacement(value: unknown): value is BlockReplacement {
  return (
    typeof value === "string" &&
    (BLOCK_REPLACEMENTS as readonly string[]).includes(value)
  );
}

export function blockReplacementForDirectAction(
  action: string
): BlockReplacement | undefined {
  return isBlockReplacement(action) ? action : undefined;
}
