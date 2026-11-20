import { type Player } from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";

export type Chance = number;

export const CERTAIN = 1;
export const IMPOSSIBLE = 0;

type RollKind =
  | "dodge"
  | "rush"
  | "barricade"
  | "pickup"
  | "secure"
  | "pass"
  | "catch"
  | "throw"
  | "landing"
  | "block";

export interface RollTarget {
  kind: Exclude<RollKind, "block">;
  target: number;

  noSkillReroll?: true;
}

export function d6(target: number): Chance {
  const t = Math.min(6, Math.max(2, target));
  return (7 - t) / 6;
}

export function withReroll(p: Chance): Chance {
  return p + (1 - p) * p;
}

const KINDS: readonly RollTarget["kind"][] = [
  "dodge",
  "rush",
  "barricade",
  "pickup",
  "catch",
  "secure",
  "pass",
  "throw",
  "landing",
];

const REROLL_SKILL: Record<RollTarget["kind"], SkillType | null> = {
  dodge: SkillType.DODGE,
  rush: SkillType.SURE_FEET,
  barricade: null,
  pickup: SkillType.SURE_HANDS,
  catch: SkillType.CATCH,
  secure: null,
  pass: SkillType.PASS,

  throw: null,
  landing: null,
};

function skillReroll(player: Player, kind: RollTarget["kind"]): boolean {
  const skill = REROLL_SKILL[kind];
  return skill !== null && hasSkill(player.skills, skill);
}

interface ChainArgs {
  player: Player;
  rolls: readonly RollTarget[];
  teamReroll: boolean;
  available?: ((skill: SkillType) => boolean) | undefined;
}

export function chain({
  player,
  rolls,
  teamReroll,
  available = () => true,
}: ChainArgs): Chance {
  const has = KINDS.map((kind) => {
    const skill = REROLL_SKILL[kind];
    return skillReroll(player, kind) && skill !== null && available(skill);
  });
  return chainFrom({
    i: 0,
    spent: 0,
    team: teamReroll,
    rolls: rolls,
    has: has,
    seen: new Map(),
  });
}

export function sequenceChance(
  stages: readonly { player: Player; rolls: readonly RollTarget[] }[],
  teamReroll: boolean,
  available: (player: Player, skill: SkillType) => boolean = () => true
): Chance {
  const steps = stages.flatMap(({ player, rolls }) =>
    rolls.map((roll) => ({ player, roll }))
  );
  const seen = new Map<string, number>();
  const visit = (
    i: number,
    spent: ReadonlySet<string>,
    team: boolean
  ): number => {
    const step = steps[i];
    if (step === undefined) return 1;
    const key = `${String(i)}/${String(team)}/${[...spent].sort().join(",")}`;
    const known = seen.get(key);
    if (known !== undefined) return known;
    const { player, roll } = step;
    const p = d6(roll.target);
    const skill = REROLL_SKILL[roll.kind];
    const use = `${player.id}/${String(skill)}`;
    let saved = 0;
    if (
      skill !== null &&
      !roll.noSkillReroll &&
      hasSkill(player.skills, skill) &&
      available(player, skill) &&
      !spent.has(use)
    ) {
      saved = p * visit(i + 1, new Set([...spent, use]), team);
    } else if (team) {
      saved = p * visit(i + 1, spent, false);
    }
    const value = p * visit(i + 1, spent, team) + (1 - p) * saved;
    seen.set(key, value);
    return value;
  };
  return visit(0, new Set(), teamReroll);
}

interface ChainFromArgs {
  i: number;
  spent: number;
  team: boolean;
  rolls: readonly RollTarget[];
  has: readonly boolean[];
  seen: Map<number, number>;
}

function chainFrom({
  i,
  spent,
  team,
  rolls,
  has,
  seen,
}: ChainFromArgs): number {
  const roll = rolls[i];
  if (roll === undefined) return 1;
  const id = i * (2 << KINDS.length) + spent * 2 + (team ? 1 : 0);
  const known = seen.get(id);
  if (known !== undefined) return known;
  const { kind, target, noSkillReroll } = roll;
  const k = KINDS.indexOf(kind);
  const p = d6(target);
  let saved = 0;
  if (!noSkillReroll && has[k] && !(spent & (1 << k)))
    saved =
      p *
      chainFrom({
        i: i + 1,
        spent: spent | (1 << k),
        team: team,
        rolls: rolls,
        has: has,
        seen: seen,
      });
  else if (team)
    saved =
      p *
      chainFrom({
        i: i + 1,
        spent: spent,
        team: false,
        rolls: rolls,
        has: has,
        seen: seen,
      });
  const chance =
    p *
      chainFrom({
        i: i + 1,
        spent: spent,
        team: team,
        rolls: rolls,
        has: has,
        seen: seen,
      }) +
    (1 - p) * saved;
  seen.set(id, chance);
  return chance;
}

export interface BlockOdds {
  knockdown: Chance;

  attackerDown: Chance;
}

interface BlockOddsArgs {
  attacker: Player;
  defender: Player;
  dice: number;
  attackerPicks: boolean;
  teamReroll: boolean;
}

export function blockOdds({
  attacker,
  defender,
  dice,
  attackerPicks,
  teamReroll,
}: BlockOddsArgs): BlockOdds {
  const has = (p: Player, s: SkillType) => hasSkill(p.skills, s);
  const aBlock = has(attacker, SkillType.BLOCK);
  const dBlock = has(defender, SkillType.BLOCK);
  const dodges =
    has(defender, SkillType.DODGE) && !has(attacker, SkillType.TACKLE);

  const good = (1 + (dodges ? 0 : 1) + (aBlock && !dBlock ? 1 : 0)) / 6;
  const bad = (1 + (aBlock ? 0 : 1)) / 6;
  let knockdown: number;
  let attackerDown: number;
  if (attackerPicks) {
    knockdown = 1 - (1 - good) ** dice;
    attackerDown = bad ** dice;
  } else {
    knockdown = good ** dice;
    attackerDown = 1 - (1 - bad) ** dice;
  }
  if (teamReroll) {
    knockdown += attackerDown * knockdown;
    attackerDown *= attackerDown;
  }
  return {
    knockdown: knockdown,
    attackerDown: attackerDown,
  };
}

export function twoD6(target: number): Chance {
  let hits = 0;
  for (let a = 1; a <= 6; a++)
    for (let b = 1; b <= 6; b++) if (a + b >= target) hits++;
  return hits / 36;
}

export function casualtyChance(attacker: Player, defender: Player): Chance {
  const has = (p: Player, s: SkillType) => hasSkill(p.skills, s);
  const ironHard = has(defender, SkillType.IRON_HARD_SKIN);
  const claws = has(attacker, SkillType.CLAWS) && !ironHard;
  const injury = has(defender, SkillType.STUNTY) ? 9 : 10;
  const blow = has(attacker, SkillType.MIGHTY_BLOW) ? 1 : 0;

  const breakAt = (modifier: number) =>
    claws
      ? Math.min(8, defender.stats.AV - modifier)
      : defender.stats.AV - modifier;
  const breaks = twoD6(breakAt(0));
  const breaksWithBlow = twoD6(breakAt(ironHard ? 0 : blow));
  const p =
    breaks * twoD6(injury - blow) + (breaksWithBlow - breaks) * twoD6(injury);
  return has(defender, SkillType.REGENERATION) ? p / 2 : p;
}
