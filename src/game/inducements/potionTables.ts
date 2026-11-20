import { SkillType } from "@/types/Skills";
import { Inducement } from "@/types/Inducements";
import { type StatChange } from "./potionShared";
import { type PotionEffect } from "./variantState";
import { type PotionInducement } from "./inventory";

export interface PotionBoost {
  kind: "boost";
  name: string;
  recovers: boolean;
  skills: readonly SkillType[];
  stats: readonly StatChange[];
  effect?: PotionEffect;
  mutation?: true;
}

export type PotionOutcome =
  | { kind: "dies"; name: string }
  | { kind: "casualty"; name: string }
  | { kind: "nothing"; name: string }
  | { kind: "superior"; name: string }
  | PotionBoost;

const boost = (
  name: string,
  skills: readonly SkillType[],
  extra: Partial<Pick<PotionBoost, "stats" | "effect" | "mutation">> = {}
): PotionBoost => ({
  kind: "boost",
  name,
  recovers: true,
  skills,
  stats: [],
  ...extra,
});

const STREET_POTIONS: readonly PotionOutcome[] = [
  { kind: "dies", name: "Squig Pish" },
  { kind: "nothing", name: "Tap Water" },
  boost("Laudanum", [SkillType.REALLY_STUPID, SkillType.THICK_SKULL], {
    stats: [["AG", 2]],
  }),
  boost("Dwarf Ale", [SkillType.BONE_HEAD], { stats: [["AG", 1]] }),
  boost("Healing Balm", []),
  boost("Warpstone Tincture", [SkillType.SPRINT, SkillType.JUMP_UP], {
    effect: "act-first",
  }),
  boost("Orca-Cola", [], { effect: "orca-cola" }),
  boost("Fungus Beer", [SkillType.FRENZY, SkillType.ANIMAL_SAVAGERY], {
    stats: [["ST", 2]],
    effect: "fungus-beer",
  }),
];

const LESSER_POTIONS: readonly PotionOutcome[] = [
  { kind: "casualty", name: "Manticore Venom" },
  { kind: "nothing", name: "Fresh Water" },
  boost("Blood and Bootlaces IPA", [SkillType.BONE_HEAD], {
    stats: [["AG", 1]],
  }),
  boost("Healing Bairn", []),
  boost("Fungus Broth", [SkillType.PROJECTILE_VOMIT]),
  boost("Warpstone Whiskey", [SkillType.JUMP_UP, SkillType.LEAP], {
    effect: "act-first",
  }),
  boost("Bugman's XXXXXX", [SkillType.PRO]),
  { kind: "superior", name: "A Superior draught" },
];

const SUPERIOR_POTIONS: readonly PotionOutcome[] = [
  boost("Potion of Endurance", [], {
    stats: [["AV", 1]],
    effect: "endurance",
  }),
  boost("Potion of Mutation", [], { mutation: true }),
  boost("Potion of Accuracy", [], { stats: [["PA", -1]] }),
  boost("Potion of Intelligence", [SkillType.LEADER, SkillType.SIDESTEP]),
  boost("Potion of Grace", [SkillType.SURE_FEET], { stats: [["AG", -1]] }),
  boost("Potion of Speed", [SkillType.SPRINT], { stats: [["MA", 1]] }),
  boost("Potion of Strength", [SkillType.STAND_FIRM], { stats: [["ST", 1]] }),
  boost("Potion of Rage", [SkillType.FRENZY, SkillType.ANIMAL_SAVAGERY], {
    stats: [["ST", 2]],
  }),
];

function potionTable(kind: PotionInducement): readonly PotionOutcome[] {
  switch (kind) {
    case Inducement.MAGIC_POTION:
      return STREET_POTIONS;
    case Inducement.LESSER_MAGIC_POTION:
      return LESSER_POTIONS;
    case Inducement.SUPERIOR_MAGIC_POTION:
      return SUPERIOR_POTIONS;
  }
}

export function potionOutcome(
  kind: PotionInducement,
  roll: number
): PotionOutcome {
  const table = potionTable(kind);
  const outcome = table[Math.min(table.length, Math.max(1, roll)) - 1];
  if (!outcome) throw new Error(`No ${kind} result for ${String(roll)}`);
  return outcome;
}
