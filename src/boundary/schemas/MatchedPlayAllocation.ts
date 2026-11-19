import { z } from "zod";
import { skillTypeSchema } from "./SkillType";
import type { MatchedPlayAllocation } from "../../types/Team";

export const matchedPlayAllocationSchema: z.ZodType<MatchedPlayAllocation> =
  z.looseObject({
    playerId: z.string(),
    skill: skillTypeSchema,
    access: z.union([z.literal("primary"), z.literal("secondary")]),
  });
