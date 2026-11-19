import { z } from "zod";
import type { TeamAdvancementMode } from "../../types/Team";

export const teamAdvancementModeSchema: z.ZodType<TeamAdvancementMode> =
  z.union([
    z.literal("sevens-skill-selection"),
    z.literal("matched-play"),
    z.literal("advanced-league"),
  ]);
