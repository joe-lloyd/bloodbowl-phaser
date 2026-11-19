export type SevensRuleset = "gw-2025" | "naf-sevens-2026-09-26";

export const DEFAULT_SEVENS_RULESET = "gw-2025" satisfies SevensRuleset;
export const NAF_SEVENS_RULESET =
  "naf-sevens-2026-09-26" satisfies SevensRuleset;

export const SEVENS_RULESET_LABELS: Record<SevensRuleset, string> = {
  "gw-2025": "GW 2025 Sevens",
  "naf-sevens-2026-09-26": "GW 2025 Sevens + NAF rulings, 26 Sep 2026",
};

export function readSevensRuleset(value: unknown): SevensRuleset {
  if (value === undefined) return DEFAULT_SEVENS_RULESET;
  if (value === DEFAULT_SEVENS_RULESET || value === NAF_SEVENS_RULESET) {
    return value;
  }
  throw new Error("Unknown Sevens ruleset.");
}
