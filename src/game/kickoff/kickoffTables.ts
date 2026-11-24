import type { KickoffTableId } from "../variants/gameTypeRules";
import { activeMatchFormat, activeRules } from "../variants/activeMatch";
import {
  KICKOFF_EVENT_MEANING,
  KICKOFF_TABLE,
  KickoffEvent,
} from "./kickoffEvents";
import { FAN_FACTOR_REROLL_MEANING } from "./variantEventMeanings";

type TableRolls = Readonly<Record<number, KickoffEvent>>;

const table = (events: readonly KickoffEvent[]): TableRolls =>
  Object.fromEntries(events.map((event, index) => [index + 2, event]));

export const KICKOFF_TABLES: Record<KickoffTableId, TableRolls> = {
  sevens: KICKOFF_TABLE,
  "street-bowl": table([
    KickoffEvent.LOOSE_MASONRY,
    KickoffEvent.RIOT,
    KickoffEvent.STRAY_PONY,
    KickoffEvent.HIGH_KICK,
    KickoffEvent.CHEERING_FANS,
    KickoffEvent.BRILLIANT_COACHING,
    KickoffEvent.CHANGING_WEATHER,
    KickoffEvent.POTION_PEDDLER,
    KickoffEvent.BLITZ,
    KickoffEvent.THROW_A_BOMB,
    KickoffEvent.GUARDS,
  ]),
  "beach-bowl": table([
    KickoffEvent.HIGH_TIDE,
    KickoffEvent.ROUSTED,
    KickoffEvent.LOST_BALL,
    KickoffEvent.HIGH_KICK,
    KickoffEvent.SAMBA,
    KickoffEvent.BRILLIANT_COACHING,
    KickoffEvent.CHANGING_WEATHER,
    KickoffEvent.JELLYFISH,
    KickoffEvent.SEAGULL_ATTACK,
    KickoffEvent.CHARGE,
    KickoffEvent.MONSTER_WAVE,
  ]),
  "gutter-street": table([
    KickoffEvent.FALLING_ROOF_TILES,
    KickoffEvent.GUTTER_RIOT,
    KickoffEvent.QUICK_ATTACK,
    KickoffEvent.ROGUE_WASHING_LINE,
    KickoffEvent.ROUND_ON_US,
    KickoffEvent.CHEERING_FANS,
    KickoffEvent.CHANGING_WEATHER,
    KickoffEvent.LOOSE_DOGS,
    KickoffEvent.BLACK_MARKET_DEALER,
    KickoffEvent.FURIOUS_NEIGHBOUR,
    KickoffEvent.GUARDS_ARE_COMING,
  ]),
  "gutter-sewer": table([
    KickoffEvent.TENTACLED_TERROR,
    KickoffEvent.GUTTER_RIOT,
    KickoffEvent.SUDDEN_STINK,
    KickoffEvent.BATS,
    KickoffEvent.GET_READY_LADS,
    KickoffEvent.CHEERING_FANS,
    KickoffEvent.CHANGING_WEATHER,
    KickoffEvent.STICKY_SLUDGE,
    KickoffEvent.BLACK_MARKET_DEALER,
    KickoffEvent.FRESH_SEWAGE,
    KickoffEvent.SWARM_OF_RATS,
  ]),
};

const HIGH_KICK_ANYWHERE =
  "If the ball will land in the receiving half, one Open receiving player may be placed in that square.";

const TABLE_MEANINGS: Partial<
  Record<KickoffTableId, Partial<Record<KickoffEvent, string>>>
> = {
  "street-bowl": {
    [KickoffEvent.HIGH_KICK]: HIGH_KICK_ANYWHERE,
    [KickoffEvent.CHEERING_FANS]: FAN_FACTOR_REROLL_MEANING,
    [KickoffEvent.BRILLIANT_COACHING]: FAN_FACTOR_REROLL_MEANING,
    [KickoffEvent.CHANGING_WEATHER]:
      "Roll new Street Bowl weather; on Normal the ball scatters three times before landing.",
  },
  "beach-bowl": {
    [KickoffEvent.HIGH_KICK]: HIGH_KICK_ANYWHERE,
    [KickoffEvent.BRILLIANT_COACHING]:
      "D6 + Assistant Coaches per coach; the higher total gains a free team re-roll for this drive. A tie gives nothing.",
    [KickoffEvent.CHANGING_WEATHER]:
      "Roll new Beach Bowl weather; on Perfect Conditions the ball scatters one extra square.",
    [KickoffEvent.CHARGE]:
      "The kicking coach may give up to D3+1 Open players a free Move; one may Blitz and one may Throw Team-mate. Ends if anyone goes down.",
  },
  "gutter-street": {
    [KickoffEvent.CHEERING_FANS]: FAN_FACTOR_REROLL_MEANING,
    [KickoffEvent.CHANGING_WEATHER]:
      "Roll new Street weather; on A Normal Day the ball scatters three times before landing.",
  },
  "gutter-sewer": {
    [KickoffEvent.CHEERING_FANS]: FAN_FACTOR_REROLL_MEANING,
    [KickoffEvent.CHANGING_WEATHER]: "Roll new Sewer weather.",
  },
};

export function activeKickoffTableId(): KickoffTableId {
  return activeRules().kickoffTable(activeMatchFormat().venue);
}

export function kickoffEventForRoll(
  roll: number,
  tableId: KickoffTableId = activeKickoffTableId()
): KickoffEvent {
  const event = KICKOFF_TABLES[tableId][roll];
  if (event === undefined) {
    throw new Error(`Invalid kickoff table roll: ${String(roll)}`);
  }
  return event;
}

export function kickoffEventMeaning(
  event: KickoffEvent,
  tableId: KickoffTableId = activeKickoffTableId()
): string {
  return TABLE_MEANINGS[tableId]?.[event] ?? KICKOFF_EVENT_MEANING[event];
}
