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

/** The skill that re-rolls a failed roll of this kind, if the player has it. */
function skillReroll(player: Player, kind: RollTarget["kind"]): boolean {
  const has = (s: SkillType) => hasSkill(player.skills, s);
  switch (kind) {
    case "dodge":
      return has(SkillType.DODGE);
    case "rush":
      return has(SkillType.SURE_FEET);
    case "pickup":
      return has(SkillType.SURE_HANDS);
    case "catch":
      return has(SkillType.CATCH);
  }
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
  const seen = new Map<string, number>();
  const from = (
    i: number,
    spent: ReadonlySet<string>,
    team: boolean
  ): number => {
    if (i === rolls.length) return 1;
    const id = `${i}|${[...spent].join()}|${team}`;
    const known = seen.get(id);
    if (known !== undefined) return known;
    const { kind, target } = rolls[i];
    const p = d6(target);
    const next = from(i + 1, spent, team);
    let saved = 0;
    if (!spent.has(kind) && skillReroll(player, kind))
      saved = p * from(i + 1, new Set([...spent, kind]), team);
    else if (team) saved = p * from(i + 1, spent, false);
    const chance = p * next + (1 - p) * saved;
    seen.set(id, chance);
    return chance;
  };
  return from(0, new Set(), teamReroll) as Chance;
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
 * the count; `attackerPicks` is false for an uphill block.
 */
export function blockOdds(
  attacker: Player,
  defender: Player,
  dice: number,
  attackerPicks: boolean,
  teamReroll: boolean
): BlockOdds {
  const has = (p: Player, s: SkillType) => hasSkill(p.skills, s);
  const aBlock = has(attacker, SkillType.BLOCK);
  const dBlock = has(defender, SkillType.BLOCK);
  const dodges =
    has(defender, SkillType.DODGE) && !has(attacker, SkillType.TACKLE);
  // Per die: does it put the defender down (good) or the attacker (bad)?
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
    // Re-roll only a result that knocks the attacker down.
    knockdown += attackerDown * knockdown;
    attackerDown *= attackerDown;
  }
  return {
    knockdown: knockdown as Chance,
    attackerDown: attackerDown as Chance,
  };
}
