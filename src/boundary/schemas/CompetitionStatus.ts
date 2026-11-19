import { z } from "zod";
import type { CompetitionStatus } from "../../competition/types";

export const competitionStatusSchema: z.ZodType<CompetitionStatus> = z.union([
  z.literal("draft"),
  z.literal("active"),
  z.literal("complete"),
]);
