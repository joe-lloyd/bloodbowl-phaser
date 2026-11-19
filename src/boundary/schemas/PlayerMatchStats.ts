import { z } from "zod";
import type { PlayerMatchStats } from "../../game/progression/MatchStats";

export const playerMatchStatsSchema: z.ZodType<PlayerMatchStats> =
  z.looseObject({
    playerId: z.string(),
    teamId: z.string(),
    participated: z.boolean(),
    completions: z.number(),
    attempts: z.number(),
    superbThrows: z.number(),
    safeLandings: z.number(),
    interceptions: z.number(),
    casualties: z.number(),
    kills: z.number(),
    touchdowns: z.number(),
    mvps: z.number(),
    blocks: z.number(),
    yards: z.number(),
    injuriesSuffered: z.number(),
    awardedTouchdownSpp: z.number().exactOptional(),
    sppEarned: z.number(),
  });
