/**
 * Fouls: kick an opponent who is already down. The engine's dice are priced
 * exactly: the Armour Roll with assists, Dirty Player and Lone Fouler, the
 * Injury Roll on the target's table, and the referee spotting a double,
 * which Sneaky Git escapes on unbroken armour. A Send-off costs what the
 * fouler is worth to the team for the rest of the game, so cheap players
 * foul and big guys do not.
 */

import { Player, PlayerStatus } from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { playerValue } from "../../types/Team";
import { FoulValidator } from "../../game/validators/FoulValidator";
import { Square, distance, key, neighbours, standing } from "./board";
import type { Route } from "./routes";
import type { Context } from "./activationContext";
import type { Activation } from "./activations";

const validator = new FoulValidator();

/** A team's usual lineman, for pricing a player's place on the pitch. */
const LINEMAN_VALUE = 50_000;

export interface FoulOdds {
  /** The target leaves the game: Badly Hurt or worse. */
  casualty: number;
  /** The target leaves the drive. */
  ko: number;
  /** The referee Sends-off the fouler: a Turnover. */
  sentOff: number;
}

const has = (p: Player, s: SkillType) => hasSkill(p.skills, s);

/** The Sevens injury table for `target`: the highest Stunned, then KO, totals. */
function injuryBands(target: Player): [number, number] {
  const stunty = has(target, SkillType.STUNTY);
  const stunnedUpTo = stunty ? 6 : 7;
  // Thick Skull turns the lowest KO into Stunned.
  const thick = has(target, SkillType.THICK_SKULL) ? 1 : 0;
  return [stunnedUpTo + thick, stunty ? 8 : 9];
}

/** Every Armour and Injury Roll of one Foul, die face by die face. */
export function foulOdds(
  fouler: Player,
  target: Player,
  assists: number
): FoulOdds {
  const locked = has(target, SkillType.IRON_HARD_SKIN);
  const modifier = locked ? 0 : assists;
  const dirty = has(fouler, SkillType.DIRTY_PLAYER);
  const sneaky = has(fouler, SkillType.SNEAKY_GIT);
  const lone = has(fouler, SkillType.LONE_FOULER) && assists === 0;
  const [stunnedUpTo, koUpTo] = injuryBands(target);
  const regenerates = has(target, SkillType.REGENERATION) ? 0.5 : 1;
  const AV = target.stats.AV;
  const out: FoulOdds = { casualty: 0, ko: 0, sentOff: 0 };
  /** One Armour Roll, then the Injury Roll if it breaks. */
  const armour = (a: number, b: number, p: number, rerolled: boolean) => {
    const total = a + b + modifier;
    let broken = total >= AV;
    if (!broken && lone && !rerolled) {
      for (let c = 1; c <= 6; c++)
        for (let d = 1; d <= 6; d++) armour(c, d, p / 36, true);
      return;
    }
    const dirtyOnArmour = dirty && !broken && !locked && total + 1 >= AV;
    broken ||= dirtyOnArmour;
    const double = a === b;
    if (!broken) {
      if (double && !sneaky) out.sentOff += p;
      return;
    }
    const bonus = dirty && !dirtyOnArmour ? 1 : 0;
    for (let c = 1; c <= 6; c++)
      for (let d = 1; d <= 6; d++) {
        const q = p / 36;
        const injury = c + d + bonus;
        if (double || c === d) out.sentOff += q;
        if (injury > koUpTo) out.casualty += q * regenerates;
        else if (injury > stunnedUpTo) out.ko += q;
      }
  };
  for (let a = 1; a <= 6; a++)
    for (let b = 1; b <= 6; b++) armour(a, b, 1 / 36, false);
  return out;
}

/**
 * What the fouler's place on the pitch is worth for the rest of the game,
 * rising with the square of its value against a lineman's: a Gnoblar is a
 * tenth of a lineman to lose, a big guy several times one.
 */
function sendOffCost(c: Context, fouler: Player): number {
  return c.w.sentOff * (playerValue(fouler) / LINEMAN_VALUE) ** 2;
}

/** A Send-off ends the turn: the activations still to come are lost. */
const lostActivations = (c: Context) =>
  c.w.turnoverPerPlayer * Math.max(0, c.available.size - 1);

/** The value of one Foul on `target` from `at`, before the walk there. */
function foulAt(c: Context, fouler: Player, target: Player, at: Square) {
  const moved = { ...fouler, gridPosition: at };
  const everyone = c.board.everyone.map((p) =>
    p.id === fouler.id ? moved : p
  );
  const { modifier } = validator.analyzeFoul(moved, target, everyone);
  const odds = foulOdds(fouler, target, modifier);
  return (
    odds.casualty * c.casualty +
    odds.ko * c.w.foulKnockOut -
    odds.sentOff * (sendOffCost(c, fouler) + lostActivations(c))
  );
}

const down = (p: Player) =>
  p.status === PlayerStatus.PRONE || p.status === PlayerStatus.STUNNED;

/**
 * The best Foul this player can walk to: each downed opponent, from the
 * reachable empty square beside it with the most assists. Only safe walks.
 */
export function foulActivations(c: Context, fouler: Player): Activation[] {
  const { board, w } = c;
  if (!standing(fouler) || !c.available.get(fouler.id)?.has("foul")) return [];
  const routes = c.routes(fouler);
  let best: Activation | null = null;
  for (const target of board.theirs) {
    if (!down(target)) continue;
    const squares = neighbours(target.gridPosition!).filter(
      (s) => !board.occupant[key(s)] || board.occupant[key(s)]!.id === fouler.id
    );
    for (const at of squares) {
      const here = distance(at, fouler.gridPosition!) === 0;
      const route: Route | null = here ? null : (routes.get(key(at)) ?? null);
      if (!here && (!route || route.chance < w.safeMove)) continue;
      const chance = route?.chance ?? 1;
      const value =
        chance * foulAt(c, fouler, target, at) -
        (1 - chance) * (c.turnover + w.ownDown);
      if (!best || value > best.value)
        best = {
          player: fouler,
          action: "foul",
          intent: { kind: "foul", target, route },
          // A Send-off is a Turnover, so a Foul is always a risk.
          tier: "risky",
          value,
          rolls: route?.rolls ?? [],
        };
    }
  }
  return best ? [best] : [];
}
