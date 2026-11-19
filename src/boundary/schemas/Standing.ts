import { z } from "zod";
import type { Standing } from "../../competition/types";

export const standingSchema: z.ZodType<Standing> = z.looseObject({
  entrantId: z.string(),
  played: z.number(),
  wins: z.number(),
  draws: z.number(),
  losses: z.number(),
  scoreFor: z.number(),
  scoreAgainst: z.number(),
  scoreDifference: z.number(),
  points: z.number(),
});
