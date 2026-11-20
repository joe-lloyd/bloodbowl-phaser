import { RosterName } from "../../types/Team";

export const DEFAULT_WEIGHTS = {
  touchdown: 100,

  safeScore: 0.7,

  safeMove: 0.92,

  sureBlock: 0.8,

  pickupMin: 0.33,
  pickup: 45,

  advance: 8,

  carrierMarked: 30,

  cageWalk: 1,

  carrierThreat: 4,

  sideline: 30,

  cageCorner: 4,
  cageKeep: 20,

  carrierPace: 4,

  receiver: 6,

  deep: 20,

  deepCrowd: 2,

  launch: 10,

  flank: 0,

  sideways: 3,

  markCarrier: 16,

  assist: 8,

  screen: 9,

  chase: 11,
  knockdown: 12,
  carrierKnockdown: 75,

  casualtyHit: 40,

  cageBreak: 20,

  freeCarrier: 12,

  lane: 0,

  turnoverBase: 12,
  turnoverPerPlayer: 6,

  ballLoss: 60,

  sentOff: 40,

  foulKnockOut: 12,

  attrition: 0,

  ownDown: 12,

  lateProgress: 0.05,

  seasonInjury: 3,

  endInContact: 3,

  standUp: 4,

  setupKick: 3,
  setupReceive: 2,

  kickDepth: 6,

  kickWide: 0,
} as const satisfies Record<string, number>;

export type Weights = { readonly [K in keyof typeof DEFAULT_WEIGHTS]: number };

export type RosterWeights = Partial<Record<RosterName, Partial<Weights>>>;

export const ROSTER_WEIGHTS: RosterWeights = {
  [RosterName.HALFLING]: { safeMove: 0.82 },
};

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

export function parseWeights(raw: unknown): Weights {
  return { ...DEFAULT_WEIGHTS, ...overrides(raw, "weights") };
}

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

export function weightBounds(name: keyof Weights): [number, number] {
  const value = DEFAULT_WEIGHTS[name];
  const fixed: Partial<Record<keyof Weights, [number, number]>> = {
    safeScore: [0.2, 0.99],
    safeMove: [0.2, 0.99],
    sureBlock: [0.2, 0.99],
    pickupMin: [0.2, 0.99],
    setupKick: [0, 5],
    setupReceive: [0, 5],
    kickDepth: [2, 6],
    kickWide: [0, 1],
    touchdown: [value, value],
  };
  return fixed[name] ?? [value / 4, value * 4];
}
