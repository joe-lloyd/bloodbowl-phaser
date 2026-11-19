import { z } from "zod";
import { inducementRuleProfileSchema } from "./InducementRuleProfile";
import { inducementInventoryEntrySchema } from "./InducementInventoryEntry";
import { apothecaryDecisionRequestSchema } from "./ApothecaryDecisionRequest";
import { prayerRerollRecordSchema } from "./PrayerRerollRecord";
import { masterChefHalfSchema } from "./MasterChefHalf";
import type { InducementsMatchState } from "../../types/Inducements";

export const inducementsMatchStateSchema: z.ZodType<InducementsMatchState> =
  z.looseObject({
    profile: inducementRuleProfileSchema.exactOptional(),
    budgets: z.record(z.string(), z.number()),
    inventory: inducementInventoryEntrySchema.array(),
    confirmed: z.record(z.string(), z.boolean()),
    apothecaryUsed: z.record(z.string(), z.boolean()),
    pendingApothecaryDecision: apothecaryDecisionRequestSchema.exactOptional(),
    decisionSeq: z.number(),
    prayerLog: prayerRerollRecordSchema.array(),
    masterChef: masterChefHalfSchema.exactOptional(),
  });
