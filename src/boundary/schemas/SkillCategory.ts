import { z } from "zod";
import type { SkillCategory } from "../../types/Skills";

export const skillCategorySchema: z.ZodType<SkillCategory> = z.union([
  z.literal("General"),
  z.literal("Agility"),
  z.literal("Strength"),
  z.literal("Passing"),
  z.literal("Mutation"),
  z.literal("Devious"),
]);
