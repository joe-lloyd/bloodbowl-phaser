import { z } from "zod";
import { leagueDocSchema } from "./LeagueDoc";
import { tournamentDocSchema } from "./TournamentDoc";
import type { CompetitionDoc } from "../../competition/types";

export const competitionDocSchema: z.ZodType<CompetitionDoc> = z.union([
  leagueDocSchema,
  tournamentDocSchema,
]);
