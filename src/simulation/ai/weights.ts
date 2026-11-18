import { RosterName } from "../../types/Team";

/**
 * Every number the planner's judgement rests on, in one plain object, so a
 * tuner can evolve them and a run can load a set from JSON. Values are in
 * points where a touchdown is worth `touchdown`; the thresholds are the
 * chance of success an action needs to count as safe.
 */
export const DEFAULT_WEIGHTS = {
  touchdown: 100,
  /** Score now if the carrier's safest path succeeds at least this often. */
  safeScore: 0.7,
  /** A move whose rolls all pass at least this often is a safe move. */
  safeMove: 0.92,
  /** A block that leaves the attacker standing this often is a sure block. */
  sureBlock: 0.8,
  /** Try a pick-up only at this chance or better before the risky tier. */
  pickupMin: 0.33,
  pickup: 45,
  /** Per square the carrier gains towards the end zone. */
  advance: 8,
  /** Per tackle zone on the carrier's square. */
  carrierMarked: 30,
  /** Per opponent who could reach and hit an uncaged carrier next turn. */
  carrierThreat: 4,
  /** A carrier on the sideline, where a push goes into the crowd. */
  sideline: 30,
  /**
   * Per team-mate on a corner of the carrier's square. At 8 a slow team
   * held its carrier in the cage instead of marching it up the pitch.
   */
  cageCorner: 4,
  /** Open team-mate a few squares ahead of the carrier. */
  receiver: 6,
  /**
   * A receiver gone deep on the setup turn of a two-step pass, where the
   * carrier cannot run the ball in next turn, times the throw's chance.
   */
  deep: 20,
  /** Per standing opponent within three squares of the deep square. */
  deepCrowd: 2,
  /** A thrower beside a Right Stuff carrier, ready to launch it. */
  launch: 10,
  /**
   * Per defender fewer near a square than near our carrier: the open side.
   * Off for the best planner; Standard's flank game plan turns it on.
   */
  flank: 0,
  /** Per defender fewer near the team-mate a pass or hand-off goes to. */
  sideways: 3,
  /** Put a tackle zone on the opposing carrier. */
  markCarrier: 16,
  /** More for a square beside the carrier that would give an assist. */
  assist: 8,
  /** Stand between the opposing carrier and our end zone. */
  screen: 9,
  /** Get next to a loose ball. */
  chase: 11,
  knockdown: 12,
  carrierKnockdown: 75,
  /**
   * Per casualty a knockdown is expected to cause, for a team paid the
   * usual 2 SPP a Casualty and 3 a Touchdown.
   */
  casualtyHit: 40,
  /** Knocking down a player next to the opposing carrier. */
  cageBreak: 20,
  /** Knocking down a player who marks our carrier, so it can move. */
  freeCarrier: 12,
  /** Knocking down a player in the lane ahead of our carrier. */
  lane: 0,
  /** What a turnover costs before counting the players left to act. */
  turnoverBase: 12,
  turnoverPerPlayer: 6,
  /** Our carrier falls and the ball comes loose. */
  ballLoss: 60,
  /**
   * A lineman Sent-off for fouling, for the rest of the game; a player's
   * cost scales it, so a Gnoblar is cheap to lose and a big guy is not.
   */
  sentOff: 40,
  /** A Foul that Knocks Out its target, gone for the drive. */
  foulKnockOut: 12,
  /**
   * How much more a casualty counts with the whole game left: a player
   * removed early is missing for every turn after. 0 counts it the same.
   */
  attrition: 0,
  /** Our player ends on the ground: out of position, maybe hurt. */
  ownDown: 12,
  /** Residual positioning value when late progress cannot set up a touchdown. */
  lateProgress: 0.05,
  /** Persistent casualties also remove future fixtures' player value. */
  seasonInjury: 3,
  /** Per opponent marking a non-carrier where it ends its move. */
  endInContact: 3,
  /** Standing a Prone player up without moving. */
  standUp: 4,
  /** Built-in formation to set up in, by its place in the list. */
  formation: 2,
  /** How deep to kick: 2 is nearest their end zone, 6 nearest the line. */
  kickDepth: 6,
  /** Above 0.5, kick towards a sideline rather than the middle. */
  kickWide: 0,
} as const satisfies Record<string, number>;

export type Weights = { readonly [K in keyof typeof DEFAULT_WEIGHTS]: number };

/** Weights a roster plays with instead of the defaults. */
export type RosterWeights = Partial<Record<RosterName, Partial<Weights>>>;

/**
 * Each roster's own tweaks on top of the defaults, kept only where the lab
 * measured that roster doing better with them.
 */
export const ROSTER_WEIGHTS: RosterWeights = {};

const ROSTERS = new Set<string>(Object.values(RosterName));

function object(raw: unknown, where: string): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    throw new Error(`${where} must be a JSON object`);
  return Object.fromEntries(Object.entries(raw));
}

function overrides(raw: unknown, where: string): Partial<Weights> {
  const out: Record<string, number> = {};
  for (const [name, value] of Object.entries(object(raw, where))) {
    if (!(name in DEFAULT_WEIGHTS)) throw new Error(`unknown weight "${name}"`);
    if (typeof value !== "number" || !Number.isFinite(value))
      throw new Error(`weight "${name}" must be a finite number`);
    out[name] = value;
  }
  return out;
}

/** Read a weight set from untrusted JSON; missing keys keep their default. */
export function parseWeights(raw: unknown): Weights {
  return { ...DEFAULT_WEIGHTS, ...overrides(raw, "weights") };
}

/**
 * Read a weights file: overrides for every roster, plus an optional
 * `rosters` object of overrides for named rosters. A file with `rosters`
 * replaces `ROSTER_WEIGHTS`; a file without it keeps them.
 */
export function parseWeightFile(raw: unknown): {
  weights: Weights;
  rosters: RosterWeights;
} {
  const { rosters, ...rest } = object(raw, "weights");
  if (rosters === undefined)
    return { weights: parseWeights(rest), rosters: ROSTER_WEIGHTS };
  return {
    weights: parseWeights(rest),
    rosters: Object.fromEntries(
      Object.entries(object(rosters, "rosters")).map(([roster, value]) => {
        if (!ROSTERS.has(roster)) throw new Error(`unknown roster "${roster}"`);
        return [roster, overrides(value, roster)];
      })
    ),
  };
}

/** What a tuner may try: the range for each weight, thresholds kept sane. */
export function weightBounds(name: keyof Weights): [number, number] {
  const value = DEFAULT_WEIGHTS[name];
  switch (name) {
    case "safeScore":
    case "safeMove":
    case "sureBlock":
    case "pickupMin":
      return [0.2, 0.99];
    case "formation":
      return [0, 2];
    case "kickDepth":
      return [2, 6];
    case "kickWide":
      return [0, 1];
    case "touchdown":
      // The scale everything else is measured against stays put.
      return [value, value];
    default:
      return [value / 4, value * 4];
  }
}
