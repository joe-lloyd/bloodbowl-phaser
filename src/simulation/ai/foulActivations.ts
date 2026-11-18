/**
 * Fouls: kick an opponent who is already down. The engine's dice are priced
 * exactly: the Armour Roll with assists, Dirty Player and Lone Fouler, the
 * Injury Roll on the target's table, and the referee spotting a double,
 * which Sneaky Git escapes on unbroken armour. A spotted Foul is a
 * Turnover; a Send-off, unless the call is argued or bribed away, costs
 * what the fouler is worth to the team for the rest of the game, so cheap
 * players foul and big guys do not.
 */

import { Player, PlayerStatus } from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { TeamSpecialRule, playerValue } from "../../types/Team";
import { hasTeamSpecialRule } from "../../game/rules/teamAllegiance";
import { bribesLeft } from "../../game/inducements/bribes";
import { isBigGuy } from "../../game/rules/rosterLegality";
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
  /**
   * The referee spots the Foul: always a Turnover, and a Send-off unless
   * the call is argued or bribed away.
   */
  spotted: number;
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

/** Every pair of dice faces, each with its share of chance `p`. */
function eachPair(p: number, roll: (a: number, b: number, q: number) => void) {
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) roll(a, b, p / 36);
}

/**
 * A Foul's assists: their net modifier, and whether neither side has any.
 * Assists that cancel out still deny Lone Fouler.
 */
export interface FoulAssists {
  modifier: number;
  none: boolean;
}

/** Every Armour and Injury Roll of one Foul, die face by die face. */
export function foulOdds(
  fouler: Player,
  target: Player,
  assists: FoulAssists
): FoulOdds {
  const locked = has(target, SkillType.IRON_HARD_SKIN);
  const modifier = locked ? 0 : assists.modifier;
  const dirty = has(fouler, SkillType.DIRTY_PLAYER);
  const dirtyOnArmourAllowed = dirty && !locked;
  const sneaky = has(fouler, SkillType.SNEAKY_GIT);
  const lone = has(fouler, SkillType.LONE_FOULER) && assists.none;
  const [stunnedUpTo, koUpTo] = injuryBands(target);
  const regenerates = has(target, SkillType.REGENERATION) ? 0.5 : 1;
  const AV = target.stats.AV;
  const out: FoulOdds = { casualty: 0, ko: 0, spotted: 0 };
  /** The Injury Roll; a double on it or on the armour is spotted. */
  const injury = (p: number, bonus: number, armourDouble: boolean) =>
    eachPair(p, (c, d, q) => {
      const total = c + d + bonus;
      if (armourDouble || c === d) out.spotted += q;
      if (total > koUpTo) out.casualty += q * regenerates;
      else if (total > stunnedUpTo) out.ko += q;
    });
  /** One Armour Roll, then the Injury Roll if it breaks. */
  const armour = (a: number, b: number, p: number, rerolled: boolean) => {
    const total = a + b + modifier;
    if (total >= AV) return injury(p, dirty ? 1 : 0, a === b);
    if (lone && !rerolled)
      return eachPair(p, (c, d, q) => armour(c, d, q, true));
    // Dirty Player's +1 goes on the armour when that alone breaks it.
    if (dirtyOnArmourAllowed && total + 1 >= AV) return injury(p, 0, a === b);
    if (a === b && !sneaky) out.spotted += p;
  };
  eachPair(1, (a, b, q) => armour(a, b, q, false));
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

/**
 * The chance a spotted fouler leaves the pitch. Arguing the Call sways the
 * referee on a 5 or 6, and Bribery and Corruption re-rolls a first 1 once
 * a game. A Bribe, when the team holds one, then keeps the player on a 2+.
 */
function sendOffChance(c: Context, fouler: Player): number {
  const state = c.board.gs.getState();
  const team = c.board.gs.getTeam(fouler.teamId);
  const corrupt =
    !!team &&
    hasTeamSpecialRule(team, TeamSpecialRule.BRIBERY_AND_CORRUPTION) &&
    !state.briberyRerollsUsed?.includes(fouler.teamId);
  const swayed = corrupt ? 1 / 3 + (1 / 6) * (1 / 3) : 1 / 3;
  const bribed = bribesLeft(state, fouler.teamId) > 0 ? 5 / 6 : 0;
  return (1 - swayed) * (1 - bribed);
}

/** A spotted Foul ends the turn: the activations still to come are lost. */
const lostActivations = (c: Context) =>
  c.w.turnoverPerPlayer * Math.max(0, c.available.size - 1);

/** The value of one Foul on `target` from `at`, before the walk there. */
function foulAt(c: Context, fouler: Player, target: Player, at: Square) {
  const moved = { ...fouler, gridPosition: at };
  const everyone = c.board.everyone.map((p) =>
    p.id === fouler.id ? moved : p
  );
  const { offensiveAssists, defensiveAssists, modifier } =
    validator.analyzeFoul(moved, target, everyone);
  const odds = foulOdds(fouler, target, {
    modifier,
    none: offensiveAssists.length === 0 && defensiveAssists.length === 0,
  });
  return (
    odds.casualty * c.casualty +
    odds.ko * c.w.foulKnockOut -
    odds.spotted *
      (sendOffChance(c, fouler) * sendOffCost(c, fouler) + lostActivations(c))
  );
}

const down = (p: Player) =>
  p.status === PlayerStatus.PRONE || p.status === PlayerStatus.STUNNED;

/** A Foul on `target` from `at`, or null when the walk there is unsafe. */
function foulFrom(
  c: Context,
  fouler: Player,
  target: Player,
  at: Square,
  routes: ReadonlyMap<number, Route>
): Activation | null {
  const here = distance(at, fouler.gridPosition!) === 0;
  const route = here ? null : (routes.get(key(at)) ?? null);
  if (!here && (!route || route.chance < c.w.safeMove)) return null;
  const chance = route?.chance ?? 1;
  return {
    player: fouler,
    action: "foul",
    intent: { kind: "foul", target, route },
    // A Send-off is a Turnover, so a Foul is always a risk.
    tier: "risky",
    value:
      chance * foulAt(c, fouler, target, at) -
      (1 - chance) * (c.turnover + c.w.ownDown),
    rolls: route?.rolls ?? [],
  };
}

/**
 * The best Foul this player can walk to: each downed opponent, from the
 * reachable empty square beside it with the most assists. Only safe walks.
 * A big guy never fouls: a game plan's lean could otherwise tip one in.
 */
export function foulActivations(c: Context, fouler: Player): Activation[] {
  const { board } = c;
  if (
    !standing(fouler) ||
    isBigGuy(fouler.keywords) ||
    !c.available.get(fouler.id)?.has("foul")
  )
    return [];
  const routes = c.routes(fouler);
  const free = (s: Square) => {
    const occupant = board.occupant[key(s)];
    return !occupant || occupant.id === fouler.id;
  };
  let best: Activation | null = null;
  for (const target of board.theirs.filter(down))
    for (const at of neighbours(target.gridPosition!).filter(free)) {
      const foul = foulFrom(c, fouler, target, at, routes);
      if (foul && (!best || foul.value > best.value)) best = foul;
    }
  return best ? [best] : [];
}
