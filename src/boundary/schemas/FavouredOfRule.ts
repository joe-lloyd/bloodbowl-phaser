import { z } from "zod";
import type { FavouredOfRule } from "../../types/Team";

export const favouredOfRuleSchema: z.ZodType<FavouredOfRule> = z.union([
  z.literal("Favoured of Hashut"),
  z.literal("Favoured of Khorne"),
  z.literal("Favoured of Nurgle"),
  z.literal("Favoured of Slaanesh"),
  z.literal("Favoured of Tzeentch"),
  z.literal("Favoured of Undivided"),
]);
