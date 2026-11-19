import { z } from "zod";
import type { LeaguePoints } from "../../competition/types";

export const leaguePointsSchema: z.ZodType<LeaguePoints> = z.looseObject({
  win: z.number(),
  draw: z.number(),
  loss: z.number(),
});
