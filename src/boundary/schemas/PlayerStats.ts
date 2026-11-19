import { z } from "zod";
import type { PlayerStats } from "../../types/Player";

export const playerStatsSchema: z.ZodType<PlayerStats> = z.looseObject({
  MA: z.number(),
  ST: z.number(),
  AG: z.number(),
  PA: z.number(),
  AV: z.number(),
});
