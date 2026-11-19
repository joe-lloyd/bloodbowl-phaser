import { z } from "zod";
import { skillTypeSchema } from "./SkillType";
import type { RandomSkillCandidate } from "../../types/Player";

export const randomSkillCandidateSchema: z.ZodType<RandomSkillCandidate> =
  z.looseObject({
    skill: skillTypeSchema,
    firstD6: z.number(),
    secondD6: z.number(),
  });
