import { z } from "zod";
import type { CompetitionType } from "../../competition/types";

export const competitionTypeSchema: z.ZodType<CompetitionType> = z.union([
  z.literal("league"),
  z.literal("tournament"),
]);
