import { type FieldPlayer as Player } from "./board";
import { type Player as RosterPlayer, PlayerStatus } from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { TeamSpecialRule, playerValue } from "../../types/Team";
import { hasTeamSpecialRule } from "../../game/rules/teamAllegiance";
import { bribesLeft } from "../../game/inducements/bribes";
import { isBigGuy } from "../../game/rules/rosterLegality";
import { FoulValidator } from "../../game/validators/FoulValidator";
import { type Square, distance, key, neighbours, standing } from "./board";
import type { Route } from "./routes";
import type { Context } from "./activationContext";
import type { Activation } from "./activations";
import { activeRules } from "../../game/variants/activeMatch";
import { injuryRules, twoD6 } from "./chance";

const validator = new FoulValidator();

const LINEMAN_VALUE = 50_000;

export interface FoulOdds {
  casualty: number;

  ko: number;

  spotted: number;
}

const has = (p: RosterPlayer, s: SkillType) => hasSkill(p.skills, s);

function injuryBands(target: RosterPlayer): [number, number] {
  const stunty = has(target, SkillType.STUNTY) && injuryRules().casualties;
  const stunnedUpTo = stunty ? 6 : 7;

  const thick = has(target, SkillType.THICK_SKULL) ? 1 : 0;
  return [stunnedUpTo + thick, stunty ? 8 : 9];
}

function eachPair(p: number, roll: (a: number, b: number, q: number) => void) {
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) roll(a, b, p / 36);
}

export interface FoulAssists {
  modifier: number;
  none: boolean;
}

export function foulOdds(
  fouler: RosterPlayer,
  target: RosterPlayer,
  assists: FoulAssists
): FoulOdds {
  const locked = has(target, SkillType.IRON_HARD_SKIN);
  const modifier = (locked ? 0 : assists.modifier) + injuryRules().foul;
  const dirty = has(fouler, SkillType.DIRTY_PLAYER);
  const dirtyOnArmourAllowed = dirty && !locked;
  const sneaky = has(fouler, SkillType.SNEAKY_GIT);
  const lone = has(fouler, SkillType.LONE_FOULER) && assists.none;
  const [stunnedUpTo, koUpTo] = injuryBands(target);
  const regenerates =
    has(target, SkillType.REGENERATION) && injuryRules().casualties ? 0.5 : 1;
  const AV = target.stats.AV;
  const out: FoulOdds = { casualty: 0, ko: 0, spotted: 0 };

  const injury = (p: number, bonus: number, armourDouble: boolean) => {
    eachPair(p, (c, d, q) => {
      const total = c + d + bonus;
      if (armourDouble || c === d) out.spotted += q;
      if (total > koUpTo) out.casualty += q * regenerates;
      else if (total > stunnedUpTo) out.ko += q;
    });
  };

  const armour = (
    a: number,
    b: number,
    roll: { p: number; rerolled: boolean }
  ) => {
    const { p, rerolled } = roll;
    const total = a + b + modifier;
    if (total >= AV) {
      injury(p, dirty ? 1 : 0, a === b);
      return;
    }
    if (lone && !rerolled) {
      eachPair(p, (c, d, q) => {
        armour(c, d, { p: q, rerolled: true });
      });
      return;
    }

    if (dirtyOnArmourAllowed && total + 1 >= AV) {
      injury(p, 0, a === b);
      return;
    }
    if (a === b && !sneaky) out.spotted += p;
  };
  eachPair(1, (a, b, q) => {
    armour(a, b, { p: q, rerolled: false });
  });
  return out;
}

function sendOffCost(c: Context, fouler: RosterPlayer): number {
  return c.w.sentOff * (playerValue(fouler) / LINEMAN_VALUE) ** 2;
}

function spottedChances(c: Context, fouler: RosterPlayer) {
  if (!activeRules().referee) return { sentOff: 0, turnover: 0 };
  const state = c.board.gs.getState();
  const team = c.board.gs.getTeam(fouler.teamId);
  const corrupt =
    !!team &&
    hasTeamSpecialRule(team, TeamSpecialRule.BRIBERY_AND_CORRUPTION) &&
    !state.briberyRerollsUsed?.includes(fouler.teamId);
  const swayed = corrupt ? 1 / 3 + (1 / 6) * (1 / 3) : 1 / 3;
  const bribed = bribesLeft(state, fouler.teamId) > 0 ? 5 / 6 : 0;
  const sentOff = (1 - swayed) * (1 - bribed);
  return { sentOff, turnover: swayed + sentOff };
}

const lostActivations = (c: Context) =>
  c.w.turnoverPerPlayer * Math.max(0, c.available.size - 1);

interface FoulAtArgs {
  c: Context;
  fouler: Player;
  target: Player;
  at: Square;
}

function foulAt({ c, fouler, target, at }: FoulAtArgs) {
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
  const spotted = spottedChances(c, fouler);
  const value =
    odds.casualty * c.casualty +
    odds.ko * c.w.foulKnockOut -
    odds.spotted *
      (spotted.sentOff * sendOffCost(c, fouler) +
        spotted.turnover * lostActivations(c));
  return afterRetribution(c, fouler, value);
}

const RETRIBUTION_CHANCE = 1 / 2;

function afterRetribution(c: Context, fouler: Player, value: number): number {
  const punished = lostActivations(c) + c.w.ownDown;
  switch (activeRules().foulRetribution) {
    case "none":
      return value;
    case "rock":
      return value - RETRIBUTION_CHANCE * twoD6(fouler.stats.AV - 1) * punished;
    case "sand":
      return (1 - RETRIBUTION_CHANCE) * value - RETRIBUTION_CHANCE * punished;
  }
}

const down = (p: Player) =>
  p.status === PlayerStatus.PRONE || p.status === PlayerStatus.STUNNED;

interface FoulFromArgs {
  c: Context;
  fouler: Player;
  target: Player;
  at: Square;
  routes: ReadonlyMap<number, Route>;
}

function foulFrom({
  c,
  fouler,
  target,
  at,
  routes,
}: FoulFromArgs): Activation | null {
  const here = distance(at, fouler.gridPosition) === 0;
  const route = here ? null : (routes.get(key(at)) ?? null);
  if (!here && (!route || route.chance < c.w.safeMove)) return null;
  const chance = route?.chance ?? 1;
  return {
    player: fouler,
    action: "foul",
    intent: { kind: "foul", target, route },

    tier: "risky",
    value:
      chance * foulAt({ c: c, fouler: fouler, target: target, at: at }) -
      (1 - chance) * (c.turnover + c.w.ownDown),
    rolls: route?.rolls ?? [],
  };
}

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
  for (const target of board.theirs) {
    if (!down(target)) continue;
    for (const at of neighbours(target.gridPosition)) {
      if (!free(at)) continue;
      const foul = foulFrom({
        c: c,
        fouler: fouler,
        target: target,
        at: at,
        routes: routes,
      });
      best = betterFoul(best, foul);
    }
  }
  return best ? [best] : [];
}

function betterFoul(
  best: Activation | null,
  foul: Activation | null
): Activation | null {
  return foul && (!best || foul.value > best.value) ? foul : best;
}
