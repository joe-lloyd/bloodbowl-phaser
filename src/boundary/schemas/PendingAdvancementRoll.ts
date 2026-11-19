import { z } from "zod";
import { skillCategorySchema } from "./SkillCategory";
import { randomSkillCandidateSchema } from "./RandomSkillCandidate";
import type { PendingAdvancementRoll } from "../../types/Player";

export const pendingAdvancementRollSchema: z.ZodType<PendingAdvancementRoll> =
  z.union([
    z.looseObject({
      kind: z.literal("random-primary"),
      category: skillCategorySchema,
      candidates: z.tuple([
        randomSkillCandidateSchema,
        randomSkillCandidateSchema,
      ]),
    }),
    z.looseObject({
      kind: z.literal("characteristic"),
      roll: z.number(),
    }),
  ]);
