import { z } from "zod";
import { teamAdvancementModeSchema } from "./TeamAdvancementMode";
import type { RosterRuleProfile } from "../../competition/rosterRules";

export const rosterRuleProfileSchema: z.ZodType<RosterRuleProfile> =
  z.looseObject({
    version: z.number(),
    advancementMode: teamAdvancementModeSchema,
    draftBudget: z.number(),
    requireDevelopmentComplete: z.boolean(),
  });
