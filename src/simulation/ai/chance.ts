/**
 * The planner's dice maths. A `Chance` is how likely something is; it ranks
 * options and is folded into scores, and never leaves the planner. Coaches
 * see roll targets ("Dodge: 3+"), never odds, so nothing here is ever
 * turned into text: notes are built from `RollTarget`s alone.
 */

import { Player } from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";

declare const chanceBrand: unique symbol;
/** A probability between 0 and 1. Internal to the planner. */
export type Chance = number & { readonly [chanceBrand]: true };

export const CERTAIN = 1 as Chance;
export const IMPOSSIBLE = 0 as Chance;

export type RollKind = "dodge" | "rush" | "pickup" | "catch" | "block";

/** A roll a plan needs, as a coach would read it: the kind and its N+. */
export interface RollTarget {
  kind: Exclude<RollKind, "block">;
  target: number;
  /** A Tackle marks the square left: the Dodge skill may not re-roll this. */
  noSkillReroll?: true;
}

/** One D6 needing `target`+ (a natural 1 fails, a natural 6 passes). */
export function d6(target: number): Chance {
  const t = Math.min(6, Math.max(2, target));
  return ((7 - t) / 6) as Chance;
}

/** A roll that may be taken again once on failure. */
export function withReroll(p: Chance): Chance {
  return (p + (1 - p) * p) as Chance;
}

export const both = (a: Chance, b: Chance) => (a * b) as Chance;

const KINDS: readonly RollTarget["kind"][] = [
  "dodge",
  "rush",
  "pickup",
  "catch",
];

const REROLL_SKILL: Record<RollTarget["kind"], SkillType> = {
  dodge: SkillType.DODGE,
  rush: SkillType.SURE_FEET,
  pickup: SkillType.SURE_HANDS,
  catch: SkillType.CATCH,
};

/** The skill that re-rolls a failed roll of this kind, if the player has it. */
function skillReroll(player: Player, kind: RollTarget["kind"]): boolean {
  return hasSkill(player.skills, REROLL_SKILL[kind]);
}

/**
 * The chance a sequence of rolls all succeed. A failed roll takes its skill
 * re-roll if that kind's is unspent (they are once per turn), else the team
 * re-roll if we hold one; no roll is re-rolled twice.
 */
export function chain(
  player: Player,
  rolls: readonly RollTarget[],
  teamReroll: boolean
): Chance {
  const has = KINDS.map((kind) => skillReroll(player, kind));
  return chainFrom(0, 0, teamReroll, rolls, has, new Map()) as Chance;
}

/**
 * The chance from roll `i` on. `spent` holds a bit per kind whose skill
 * re-roll is gone; `team` is whether the team re-roll is still in hand.
 */
function chainFrom(
  i: number,
  spent: number,
  team: boolean,
  rolls: readonly RollTarget[],
  has: readonly boolean[],
  seen: Map<number, number>
): number {
  if (i === rolls.length) return 1;
  const id = i * 32 + spent * 2 + (team ? 1 : 0);
  const known = seen.get(id);
  if (known !== undefined) return known;
  const { kind, target, noSkillReroll } = rolls[i];
  const k = KINDS.indexOf(kind);
  const p = d6(target);
  let saved = 0;
  if (!noSkillReroll && has[k] && !(spent & (1 << k)))
    saved = p * chainFrom(i + 1, spent | (1 << k), team, rolls, has, seen);
  else if (team) saved = p * chainFrom(i + 1, spent, false, rolls, has, seen);
  const chance =
    p * chainFrom(i + 1, spent, team, rolls, has, seen) + (1 - p) * saved;
  seen.set(id, chance);
  return chance;
}

/** What a block can do, for the side that takes the result. */
export interface BlockOdds {
  /** The defender ends up on the ground. */
  knockdown: Chance;
  /** The attacker ends up on the ground: a turnover. */
  attackerDown: Chance;
}

/**
 * Block dice by face: Skull, Both Down, Push, Push, Stumble, Pow. `dice` is
 * the count; `attackerPicks` is false for an uphill block. A `surf` block
 * has the defender on the edge of the pitch, so a Push puts them out of it.
 * The team re-roll goes on any die that does not put the defender down.
 */
export function blockOdds(
  attacker: Player,
  defender: Player,
  dice: number,
  attackerPicks: boolean,
  teamReroll: boolean,
  surf = false
): BlockOdds {
  const has = (p: Player, s: SkillType) => hasSkill(p.skills, s);
  const aBlock = has(attacker, SkillType.BLOCK);
  const dBlock = has(defender, SkillType.BLOCK);
  const dodges =
    has(defender, SkillType.DODGE) && !has(attacker, SkillType.TACKLE);
  // Per die: does it put the defender down (good) or the attacker (bad)?
  const pushes = surf ? 2 + (dodges ? 1 : 0) : 0;
  const good = (1 + (dodges ? 0 : 1) + (aBlock && !dBlock ? 1 : 0) + pushes) / 6;
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
    const miss = 1 - knockdown;
    attackerDown *= miss;
    knockdown += miss * knockdown;
  }
  return {
    knockdown: knockdown as Chance,
    attackerDown: attackerDown as Chance,
  };
}
