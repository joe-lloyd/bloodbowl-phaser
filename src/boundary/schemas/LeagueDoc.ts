import { z } from "zod";
import { leaguePointsSchema } from "./LeaguePoints";
import { competitionBaseSchema } from "./CompetitionBase";
import type { LeagueDoc } from "../../competition/types";

export const leagueDocSchema: z.ZodType<LeagueDoc> = z.intersection(
  competitionBaseSchema,
  z.looseObject({
    type: z.literal("league"),
    points: leaguePointsSchema,
  })
);
