import { z } from "zod";
import type { SevensRuleset } from "../../game/rules/sevensRuleset";

export const sevensRulesetSchema: z.ZodType<SevensRuleset> = z.union([
  z.literal("gw-2025"),
  z.literal("naf-sevens-2026-09-26"),
]);
