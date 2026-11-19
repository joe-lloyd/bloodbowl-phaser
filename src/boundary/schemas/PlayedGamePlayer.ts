import { z } from "zod";
import type { PlayedGamePlayer } from "../../game/progression/matchHistory";

export const playedGamePlayerSchema: z.ZodType<PlayedGamePlayer> =
  z.looseObject({
    playerId: z.string(),
    name: z.string(),
    number: z.number(),
    touchdowns: z.number(),
    casualties: z.number(),
    completions: z.number(),
    interceptions: z.number(),
    mvp: z.boolean(),
    injured: z.boolean(),
  });
