import { z } from "zod";
import type { PlayerCareerStats } from "../../types/Player";

export const playerCareerStatsSchema: z.ZodType<PlayerCareerStats> =
  z.looseObject({
    matches: z.number(),
    completions: z.number(),
    interceptions: z.number(),
    casualties: z.number(),
    touchdowns: z.number(),
    mvps: z.number(),
    kills: z.number(),
    squaresMoved: z.number(),
    passesAttempted: z.number(),
    sppEarned: z.number(),
  });
