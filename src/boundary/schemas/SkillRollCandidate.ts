import { z } from "zod";
import { skillTypeSchema } from "./SkillType";
import type { SkillRollCandidate } from "../../types/Team";

export const skillRollCandidateSchema: z.ZodType<SkillRollCandidate> =
  z.looseObject({
    skill: skillTypeSchema,
    firstD6: z.number(),
    secondD6: z.number(),
  });
