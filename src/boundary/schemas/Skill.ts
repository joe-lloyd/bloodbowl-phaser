import { z } from "zod";
import { skillTypeSchema } from "./SkillType";
import { skillCategorySchema } from "./SkillCategory";
import type { Skill } from "../../types/Skills";

export const skillSchema: z.ZodType<Skill> = z.looseObject({
  type: skillTypeSchema,
  category: skillCategorySchema,
  description: z.string(),
  parameter: z.union([z.string(), z.number()]).exactOptional(),
  scenarioGranted: z.union([z.literal(false), z.literal(true)]).exactOptional(),
});
