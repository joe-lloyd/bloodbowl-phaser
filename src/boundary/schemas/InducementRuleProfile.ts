import { z } from "zod";
import type { InducementRuleProfile } from "../../types/Inducements";

export const inducementRuleProfileSchema: z.ZodType<InducementRuleProfile> =
  z.looseObject({
    id: z.string(),
    advancedLeague: z.boolean(),
    starPlayersAllowed: z.boolean(),
  });
