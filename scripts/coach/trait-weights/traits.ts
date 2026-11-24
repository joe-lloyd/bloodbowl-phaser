import { type Player } from "../../../src/types/Player";
import { type Team } from "../../../src/types/Team";
import { SkillType, hasSkill } from "../../../src/types/Skills";

const HITTING: readonly SkillType[] = [
  SkillType.BLOCK,
  SkillType.WRESTLE,
  SkillType.GUARD,
  SkillType.MIGHTY_BLOW,
  SkillType.CLAWS,
  SkillType.TACKLE,
  SkillType.FRENZY,
  SkillType.STAND_FIRM,
];

const HANDLING: readonly SkillType[] = [
  SkillType.CATCH,
  SkillType.PASS,
  SkillType.ACCURATE,
  SkillType.SURE_HANDS,
  SkillType.DODGE,
];

const held = (player: Player, skills: readonly SkillType[]) =>
  skills.filter((skill) => hasSkill(player.skills, skill)).length;

interface Trait {
  readonly of: (player: Player) => number;
  readonly mean: number;
  readonly spread: number;
}

const TRAITS = {
  pace: { of: (p) => p.stats.MA, mean: 5.65, spread: 0.8 },
  strength: { of: (p) => p.stats.ST, mean: 3.08, spread: 0.38 },
  agility: { of: (p) => 7 - p.stats.AG, mean: 3.78, spread: 0.53 },
  armour: { of: (p) => p.stats.AV, mean: 8.64, spread: 0.61 },
  hitting: { of: (p) => held(p, HITTING), mean: 0.5, spread: 0.35 },
  handling: { of: (p) => held(p, HANDLING), mean: 0.5, spread: 0.35 },
} as const satisfies Record<string, Trait>;

type TraitName = keyof typeof TRAITS;
const TRAIT_NAMES: readonly TraitName[] = [
  "pace",
  "strength",
  "agility",
  "armour",
  "hitting",
  "handling",
];

const LIMIT = 2.5;

function traitOf(team: Team, name: TraitName): number {
  const { of, mean, spread } = TRAITS[name];
  const total = team.players.reduce((sum, player) => sum + of(player), 0);
  const z = (total / Math.max(1, team.players.length) - mean) / spread;
  return Math.max(-LIMIT, Math.min(LIMIT, z));
}

function teamTraits(team: Team): readonly number[] {
  return TRAIT_NAMES.map((name) => traitOf(team, name));
}

export function matchTraits(own: Team, opponent: Team): readonly number[] {
  return [...teamTraits(own), ...teamTraits(opponent)];
}
