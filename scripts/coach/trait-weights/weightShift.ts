import {
  DEFAULT_WEIGHTS,
  type Weights,
  weightBounds,
} from "../../../src/simulation/ai/weights";

export type WeightShifts = Partial<Record<keyof Weights, number>>;

const SHARES = new Set<string>([
  "safeScore",
  "safeMove",
  "sureBlock",
  "pickupMin",
]);
const UNUSED_SCALE: Partial<Record<keyof Weights, number>> = {
  flank: 6,
  lane: 6,
  attrition: 10,
};
const FIXED = new Set<string>(["touchdown", "kickWide"]);

const isWeight = (name: string): name is keyof Weights =>
  Object.hasOwn(DEFAULT_WEIGHTS, name);

export const SHIFTED: readonly (keyof Weights)[] = Object.keys(DEFAULT_WEIGHTS)
  .filter(isWeight)
  .filter((name) => !FIXED.has(name));

function shifted(name: keyof Weights, base: number, shift: number): number {
  if (SHARES.has(name)) {
    const odds = (base / (1 - base)) * Math.exp(shift);
    return odds / (1 + odds);
  }
  const scale = UNUSED_SCALE[name];
  if (base === 0 && scale) return Math.max(0, scale * shift);
  const [low, high] = weightBounds(name);
  return Math.min(high, Math.max(low, base * Math.exp(shift)));
}

export function shiftWeights(
  shifts: WeightShifts,
  base: Weights = DEFAULT_WEIGHTS
): Weights {
  const out: Record<keyof Weights, number> = { ...base };
  for (const name of SHIFTED)
    out[name] = shifted(name, base[name], shifts[name] ?? 0);
  return out;
}
