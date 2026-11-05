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
  /** Per team-mate on a corner of the carrier's square. */
  cageCorner: 8,
  /** Open team-mate a few squares ahead of the carrier. */
  receiver: 6,
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
  /** What a turnover costs before counting the players left to act. */
  turnoverBase: 12,
  turnoverPerPlayer: 6,
  /** Our carrier falls and the ball comes loose. */
  ballLoss: 60,
  /** Our player ends on the ground: out of position, maybe hurt. */
  ownDown: 12,
  /** Per opponent marking a non-carrier where it ends its move. */
  endInContact: 3,
  /** Standing a Prone player up without moving. */
  standUp: 4,
  /** In a lookahead's end position: holding the ball at all. */
  ballHeld: 60,
  /** In a lookahead's end position: per square the ball is from the line. */
  ballProgress: 3,
  /** In a lookahead's end position: per player out of the game. */
  casualty: 25,
  /** In a lookahead's end position: per team re-roll still in hand. */
  rerollValue: 4,
  /** Built-in formation to set up in, by its place in the list. */
  formation: 2,
  /** How deep to kick: 2 is nearest their end zone, 6 nearest the line. */
  kickDepth: 6,
  /** Above 0.5, kick towards a sideline rather than the middle. */
  kickWide: 0,
} as const satisfies Record<string, number>;

export type Weights = { readonly [K in keyof typeof DEFAULT_WEIGHTS]: number };

/** Read a weight set from untrusted JSON; missing keys keep their default. */
export function parseWeights(raw: unknown): Weights {
  if (typeof raw !== "object" || raw === null)
    throw new Error("weights must be a JSON object");
  const out: Record<string, number> = { ...DEFAULT_WEIGHTS };
  for (const [name, value] of Object.entries(raw)) {
    if (!(name in DEFAULT_WEIGHTS)) throw new Error(`unknown weight "${name}"`);
    if (typeof value !== "number" || !Number.isFinite(value))
      throw new Error(`weight "${name}" must be a finite number`);
    out[name] = value;
  }
  return out as Weights;
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
